import socket
import json
import threading
import time
import os
import subprocess
import hashlib
import nacl.signing
import nacl.encoding
import nacl.public
import nacl.utils
import random
import base64

# Message types
MSG_TYPES = [
    'CHAT', 'DHT_UPDATE', 'DHT_QUERY', 'DHT_RESPONSE',
    'DHT_EXCHANGE', 'PING', 'PONG', 'HANDSHAKE_REQ',
    'HANDSHAKE_ACCEPT', 'CHAT_REACTION', 'CHAT_UPDATE',
    'CHAT_DELETE', 'RENEWAL_TOKEN', 'RENEWAL_REQUEST',
    'RENEWAL_RESPONSE'
]

YGG_PORT = int(os.environ.get("YGG_PORT", 50005))
MY_NAME = os.environ.get("BOT_ALIAS", "RevelNest_Bot_Test")


def generate_svg_avatar(alias: str, color: str = None) -> str:
    """Generate a simple SVG avatar as a base64 data URL."""
    initials = ''.join(w[0].upper() for w in alias.split('_') if w)[
        :2] or alias[:2].upper()
    colors = ['#4f72d9', '#2a8c4a', '#c0392b', '#8e44ad', '#d35400', '#1a7a8a']
    if color is None:
        color = colors[hash(alias) % len(colors)]
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">'
        f'<circle cx="32" cy="32" r="32" fill="{color}"/>'
        f'<text x="32" y="42" text-anchor="middle" fill="white" '
        f'font-size="26" font-family="Arial,sans-serif" font-weight="bold">{initials}</text>'
        f'</svg>'
    )
    b64 = base64.b64encode(svg.encode()).decode()
    return f'data:image/svg+xml;base64,{b64}'


MY_AVATAR = os.environ.get("BOT_AVATAR") or generate_svg_avatar(
    MY_NAME, os.environ.get("BOT_COLOR"))

# Identity Persistence
KEY_FILE = os.environ.get("KEY_FILE")
if KEY_FILE and os.path.exists(KEY_FILE):
    with open(KEY_FILE, "rb") as f:
        signing_key_seed = f.read()
    signing_key = nacl.signing.SigningKey(signing_key_seed)
    print(f"[Identity] Cargada identidad de {KEY_FILE}")
else:
    signing_key = nacl.signing.SigningKey.generate()
    if KEY_FILE:
        with open(KEY_FILE, "wb") as f:
            f.write(bytes(signing_key))
        print(f"[Identity] Generada y guardada identidad en {KEY_FILE}")
verify_key = signing_key.verify_key
public_key_hex = verify_key.encode(encoder=nacl.encoding.HexEncoder).decode()


def get_revelnest_id():
    pk_bytes = verify_key.encode()
    return hashlib.blake2b(pk_bytes, digest_size=16).hexdigest()


my_revelnest_id = get_revelnest_id()
my_private_key = signing_key.to_curve25519_private_key()
my_public_key = verify_key.to_curve25519_public_key()
my_dht_seq = 1


def generate_light_proof(revelnest_id):
    """Generate a light PoW proof similar to upeer's AdaptivePow.generateLightProof"""
    import hashlib
    max_attempts = 100000

    for nonce in range(max_attempts):
        proof = hex(nonce)[2:]  # Remove '0x' prefix
        hash_input = (revelnest_id + proof).encode()
        hash_result = hashlib.sha256(hash_input).hexdigest()
        if hash_result.startswith('0'):
            return proof

    # Fallback: timestamp-based proof
    return hex(int(time.time() * 1000))[2:]


# Metrics collection
metrics = {
    "messages_sent": 0,
    "messages_received": 0,
    "dht_updates_sent": 0,
    "dht_updates_received": 0,
    "dht_exchanges_sent": 0,
    "dht_exchanges_received": 0,
    "dht_queries_sent": 0,
    "dht_queries_received": 0,
    "dht_responses_sent": 0,
    "dht_responses_received": 0,
    "handshakes_completed": 0,
    "contacts_discovered": 0,
    "message_latency_sum": 0.0,
    "message_latency_count": 0,
    "packets_received": 0,
    "ping_sent": 0,
    "acks_received": 0
}

# Global sets for message tracking
delivered_msgs = set()
pending_discovery_msgs = {}


def record_metric(name, value=1):
    if name in metrics:
        if isinstance(metrics[name], (int, float)):
            metrics[name] += value
        else:
            metrics[name] = value
    else:
        metrics[name] = value


def write_metrics_periodically(node_name):
    while True:
        time.sleep(5)
        if node_name:
            metrics_file = f"/shared/{node_name}_metrics.json"
            try:
                with open(metrics_file, "w") as f:
                    json.dump({
                        "timestamp": time.time(),
                        **metrics
                    }, f)
            except Exception as e:
                print(f"[{MY_NAME}] Error writing metrics: {e}")


def get_ygg_ip():
    try:
        res = subprocess.check_output(["ip", "-6", "addr", "show"]).decode()
        for line in res.split('\n'):
            if "inet6 2" in line and "scope global" in line:
                return line.strip().split()[1].split('/')[0]
    except:
        return None


def sign_data(data):
    msg_bytes = json.dumps(data, sort_keys=True, separators=(
        ',', ':'), ensure_ascii=False).encode()
    signature = signing_key.sign(msg_bytes)
    return signature.signature.hex()


def generate_location_block(ip, seq):
    data = {"revelnestId": my_revelnest_id, "address": ip, "dhtSeq": seq}
    sig = sign_data(data)
    import time
    expires_at = int((time.time() + 30 * 24 * 60 * 60)
                     * 1000)  # 30 days in milliseconds
    return {"address": ip, "dhtSeq": seq, "signature": sig, "expiresAt": expires_at}


def verify_location_block(revelnest_id, block, pubkey_hex):
    try:
        data = {"revelnestId": revelnest_id,
                "address": block["address"], "dhtSeq": block["dhtSeq"]}
        msg_bytes = json.dumps(data, sort_keys=True, separators=(
            ',', ':'), ensure_ascii=False).encode()
        verify_k = nacl.signing.VerifyKey(
            pubkey_hex, encoder=nacl.encoding.HexEncoder)
        verify_k.verify(msg_bytes, bytes.fromhex(block["signature"]))
        return True
    except:
        return False

# Renewal Token System


def create_renewal_token(target_id, signing_key_obj, max_renwals=3, days_valid=60):
    """Create a renewal token for target_id (must be ourselves)."""
    current_time = int(time.time() * 1000)  # milliseconds

    # Include target's public key in the token for verification
    target_pk = signing_key_obj.verify_key.encode(
        encoder=nacl.encoding.HexEncoder).decode()

    token = {
        "targetId": target_id,
        "authorizedBy": target_id,
        "targetPublicKey": target_pk,  # NEW: Include public key for verification
        "allowedUntil": current_time + (days_valid * 24 * 60 * 60 * 1000),
        "maxRenewals": max_renwals,
        "renewalsUsed": 0,
        "createdAt": current_time,
        "signature": ""
    }
    # Sign the token (excluding signature field)
    token_copy = token.copy()
    token_copy.pop("signature", None)
    msg_bytes = json.dumps(token_copy, sort_keys=True, separators=(
        ',', ':'), ensure_ascii=False).encode()
    signature = signing_key_obj.sign(msg_bytes).signature.hex()
    token["signature"] = signature
    return token


def verify_renewal_token(token, pubkey_hex=None):
    """Verify a renewal token's signature and validity."""
    current_time = int(time.time() * 1000)

    # Get public key from token if not provided
    if pubkey_hex is None:
        pubkey_hex = token.get("targetPublicKey")
        if not pubkey_hex:
            print(f"[{MY_NAME}] ❌ Token missing targetPublicKey")
            return False

    # Check signature
    token_copy = token.copy()
    signature = token_copy.pop("signature", None)
    if not signature:
        return False

    try:
        msg_bytes = json.dumps(token_copy, sort_keys=True, separators=(
            ',', ':'), ensure_ascii=False).encode()
        verify_k = nacl.signing.VerifyKey(
            pubkey_hex, encoder=nacl.encoding.HexEncoder)
        verify_k.verify(msg_bytes, bytes.fromhex(signature))
    except Exception as e:
        print(f"[{MY_NAME}] ❌ Token signature verification failed: {e}")
        return False

    # Check authorizedBy matches targetId
    if token["authorizedBy"] != token["targetId"]:
        print(
            f"[{MY_NAME}] ❌ Token authorizedBy mismatch: {token['authorizedBy']} != {token['targetId']}")
        return False

    # Check timestamps
    if token["createdAt"] > current_time:
        print(
            f"[{MY_NAME}] ❌ Token created in future: {token['createdAt']} > {current_time}")
        return False

    if token["allowedUntil"] < current_time:
        print(
            f"[{MY_NAME}] ❌ Token expired: {token['allowedUntil']} < {current_time}")
        return False

    # Check renewal limits
    if token["renewalsUsed"] > token["maxRenewals"]:
        print(
            f"[{MY_NAME}] ❌ Token renewal limit exceeded: {token['renewalsUsed']} > {token['maxRenewals']}")
        return False

    print(f"[{MY_NAME}] ✅ Token verified for {token['targetId']}")
    return True


def renew_location_block_with_token(token, renewer_id, known_peers, sock):
    """Attempt to renew location block using token."""
    target_id = token["targetId"]

    # Get target's public key from token
    target_pk = token.get("targetPublicKey")
    if not target_pk:
        print(f"[{MY_NAME}] ❌ Token missing targetPublicKey for {target_id}")
        return False

    # Verify token first (using public key from token)
    if not verify_renewal_token(token, target_pk):
        print(f"[{MY_NAME}] ❌ Invalid token for {target_id}")
        return False

    # Check limits
    if token["renewalsUsed"] >= token["maxRenewals"]:
        print(f"[{MY_NAME}] Token renewal limit reached for {target_id}")
        return False

    # Get target's current location
    if target_id not in known_peers:
        print(f"[{MY_NAME}] Target {target_id} not in known peers")
        return False

    # We cannot actually create a new location block for someone else
    # because we don't have their private key to sign it.
    # In the real system, the renewal token would need to include
    # a pre-signed location block or allow delegation of signing.
    # For now, we'll simulate renewal by just updating the sequence number
    # in our local known_peers and printing a success message.

    ip = known_peers[target_id].get("address", "unknown")
    current_seq = known_peers[target_id].get("dht_seq", 0)
    new_seq = current_seq + 1

    # Simulate renewal - in real system this would publish to DHT
    known_peers[target_id]["dht_seq"] = new_seq

    # Update token counters
    token["renewalsUsed"] += 1
    token["lastRenewalAt"] = int(time.time() * 1000)
    if "renewedBy" not in token:
        token["renewedBy"] = []
    token["renewedBy"].append(renewer_id)

    print(f"[{MY_NAME}] ✅ Successfully renewed {target_id} at {ip} to seq {new_seq}")
    print(f"[{MY_NAME}]    Token renewals used: {token['renewalsUsed']}/{token['maxRenewals']}")

    # In a real implementation, we would:
    # 1. Get a pre-signed location block from the token
    # 2. Or have delegation permissions to sign on behalf of target
    # 3. Publish the new block to DHT

    return True


def heartbeat(sock, known_peers):
    global my_dht_seq
    while True:
        time.sleep(5)
        # Send PING and DHT_EXCHANGE to all connected peers
        peers_list = []
        for rid, info in known_peers.items():
            if 'address' in info and 'dht_seq' in info and 'signature' in info:
                peers_list.append({
                    "revelnestId": rid,
                    "publicKey": info["pk"],
                    "locationBlock": {
                        "address": info["address"],
                        "dhtSeq": info["dht_seq"],
                        "signature": info["signature"]
                    }
                })

        my_ip = get_ygg_ip()
        # Auto-renewal check: if current block expires within 3 days, increment seq
        current_time_ms = int(time.time() * 1000)
        # Calculate expiry of current block (assuming 30 days from creation)
        # Since we don't store creation time, we approximate: each seq corresponds to a block.
        # For simplicity, we'll just check if last renewal was more than 27 days ago.
        # We'll track last_renewal_time.
        if not hasattr(heartbeat, 'last_renewal_time'):
            heartbeat.last_renewal_time = current_time_ms
        days_since_renewal = (
            current_time_ms - heartbeat.last_renewal_time) / (1000 * 60 * 60 * 24)
        if days_since_renewal > 27:  # 30 - 3 threshold
            print(
                f"[{MY_NAME}] Auto-renewal triggered (seq {my_dht_seq} -> {my_dht_seq + 1})")
            my_dht_seq += 1
            heartbeat.last_renewal_time = current_time_ms
        my_loc = generate_location_block(my_ip, my_dht_seq)

        for rid, info in known_peers.items():
            if 'address' not in info:
                continue
            ip = info['address']

            # PING
            ping = {"type": "PING"}
            full_ping = {**ping, "senderRevelnestId": my_revelnest_id,
                         "signature": sign_data(ping)}
            sock.sendto(json.dumps(full_ping, separators=(',', ':'),
                        ensure_ascii=False).encode(), (ip, 50005))
            record_metric("ping_sent")

            # DHT_EXCHANGE
            exch = {"type": "DHT_EXCHANGE", "peers": peers_list[:5] + [{
                "revelnestId": my_revelnest_id,
                "publicKey": public_key_hex,
                "locationBlock": my_loc
            }]}
            full_exch = {**exch, "senderRevelnestId": my_revelnest_id,
                         "signature": sign_data(exch)}
            sock.sendto(json.dumps(full_exch, separators=(',', ':'),
                        ensure_ascii=False).encode(), (ip, 50005))
            record_metric("dht_exchanges_sent")


def listen_with_sock(s, known_peers):
    global my_dht_seq
    print(f"[{MY_NAME}] Escuchando en el puerto {YGG_PORT}...")
    print(f"[{MY_NAME}] Mi upeer-ID es: {my_revelnest_id}")
    print(f"[{MY_NAME}] Mi Public-Key es: {public_key_hex}")

    while True:
        data, addr = s.recvfrom(4096)
        try:
            full_packet = json.loads(data.decode())
            p_type = full_packet.get('type')
            print(f"[{MY_NAME}] RECIBIDO [{p_type}] de {addr[0]}")
            record_metric("packets_received")

            sender_revelnest = full_packet.get('senderRevelnestId')
            block = full_packet.get('locationBlock')

            if p_type == 'HANDSHAKE_REQ':
                sender_revelnest = full_packet.get('senderRevelnestId')
                sender_pk = full_packet.get('publicKey')
                sender_ephemeral = full_packet.get('ephemeralPublicKey')
                print(f"[{MY_NAME}] Petición de conexión de {sender_revelnest}.")
                known_peers[sender_revelnest] = {
                    "pk": sender_pk, "ephemeral_pk": sender_ephemeral, "dht_seq": 0, "address": addr[0]}
                accept_data = {
                    "type": "HANDSHAKE_ACCEPT",
                    "publicKey": public_key_hex,
                    "ephemeralPublicKey": my_public_key.encode(encoder=nacl.encoding.HexEncoder).decode(),
                    "alias": MY_NAME,
                    "avatar": MY_AVATAR
                }
                # Build full packet with signature like upeer
                full_accept = {
                    **accept_data,
                    "senderRevelnestId": my_revelnest_id,
                    "signature": sign_data(accept_data)
                }
                s.sendto(json.dumps(full_accept, separators=(
                    ',', ':'), ensure_ascii=False).encode(), addr)
                record_metric("handshakes_completed")

            elif p_type == 'HANDSHAKE_ACCEPT':
                sender_revelnest = full_packet.get('senderRevelnestId')
                sender_pk = full_packet.get('publicKey')
                sender_ephemeral = full_packet.get('ephemeralPublicKey')
                if sender_revelnest not in known_peers or 'pk' not in known_peers[sender_revelnest]:
                    print(
                        f"[{MY_NAME}] Conexión ACEPTADA por {sender_revelnest}. Enviando primer mensaje...")
                    known_peers[sender_revelnest] = {
                        "pk": sender_pk, "ephemeral_pk": sender_ephemeral, "dht_seq": 0, "address": addr[0]}
                    record_metric("handshakes_completed")

                    # First message automatically
                    first_msg_text = "Hola! Soy el bot de upeer. Te he agregado automaticamente y aqui tienes mi primer mensaje."
                    reply = {"type": "CHAT", "content": first_msg_text}

                    # Encrypt PFS
                    target_pk_hex = sender_ephemeral if sender_ephemeral else sender_pk
                    target_pk = nacl.public.PublicKey(
                        target_pk_hex, encoder=nacl.encoding.HexEncoder)
                    target_curve_pk = target_pk if sender_ephemeral else target_pk.to_curve25519_public_key()
                    box = nacl.public.Box(my_private_key, target_curve_pk)
                    nonce = nacl.utils.random(nacl.public.Box.NONCE_SIZE)
                    encrypted = box.encrypt(first_msg_text.encode(), nonce)
                    reply['content'] = encrypted.ciphertext.hex()
                    reply['nonce'] = nonce.hex()
                    reply['ephemeralPublicKey'] = my_public_key.encode(
                        encoder=nacl.encoding.HexEncoder).decode()
                    reply['useRecipientEphemeral'] = bool(sender_ephemeral)

                    full_msg = {
                        **reply, "senderRevelnestId": my_revelnest_id, "signature": sign_data(reply)}
                    s.sendto(json.dumps(full_msg, separators=(
                        ',', ':'), ensure_ascii=False).encode(), addr)

                    # Enviar ubicación firmada inmediatamente para que el otro nos tenga en su DHT
                    my_ip = get_ygg_ip()
                    my_loc = generate_location_block(my_ip, my_dht_seq)
                    update = {
                        "type": "DHT_UPDATE", "senderRevelnestId": my_revelnest_id, "locationBlock": my_loc}
                    full_update = {**update, "signature": sign_data(update)}
                    s.sendto(json.dumps(full_update, separators=(
                        ',', ':'), ensure_ascii=False).encode(), addr)
                    record_metric("dht_updates_sent")

            elif p_type == 'DHT_UPDATE':
                record_metric("dht_updates_received")
                if sender_revelnest in known_peers and block:
                    if verify_location_block(sender_revelnest, block, known_peers[sender_revelnest]['pk']):
                        seq = block.get('dhtSeq', 0)
                        if seq > known_peers[sender_revelnest]['dht_seq']:
                            print(
                                f"[{MY_NAME}] DHT Update: {sender_revelnest} moved to {block['address']} (seq: {seq})")
                            known_peers[sender_revelnest].update(
                                {'dht_seq': seq, 'address': block['address'], 'signature': block['signature']})

            elif p_type == 'DHT_QUERY':
                record_metric("dht_queries_received")
                target_id = full_packet.get('targetId')
                sender_id = full_packet.get('senderRevelnestId')
                print(
                    f"[{MY_NAME}] Query recibida de {sender_id} buscando a {target_id}")

                response = {"type": "DHT_RESPONSE", "targetId": target_id}

                if target_id in known_peers and 'address' in known_peers[target_id]:
                    t = known_peers[target_id]
                    response["locationBlock"] = {
                        "address": t["address"],
                        "dhtSeq": t["dht_seq"],
                        "signature": t["signature"]
                    }
                    response["publicKey"] = t["pk"]
                    print(
                        f"[{MY_NAME}] Enviando respuesta con ubicación de {target_id}")
                else:
                    # Referidos (Neighbors)
                    # Por ahora vacío o simplificado
                    response["neighbors"] = []

                full_resp = {
                    **response, "senderRevelnestId": my_revelnest_id, "signature": sign_data(response)}
                s.sendto(json.dumps(full_resp, separators=(
                    ',', ':'), ensure_ascii=False).encode(), addr)
                record_metric("dht_responses_sent")

            elif p_type == 'DHT_RESPONSE':
                record_metric("dht_responses_received")
                target_id = full_packet.get('targetId')
                block = full_packet.get('locationBlock')
                if target_id and block:
                    # En el bot, asumimos que si recibimos respuesta es porque preguntamos
                    # Validar bloque (Zero-Trust)
                    pk = full_packet.get('publicKey')
                    # Si ya conocemos al peer, usamos SU PK guardada para validar
                    if target_id in known_peers:
                        pk = known_peers[target_id]['pk']

                    if pk and verify_location_block(target_id, block, pk):
                        seq = block.get('dhtSeq', 0)
                        if target_id not in known_peers or seq > known_peers[target_id].get('dht_seq', 0):
                            print(
                                f"[{MY_NAME}] DISCOVERY: Nueva ubicación para {target_id}: {block['address']} (seq: {seq})")
                            if target_id not in known_peers:
                                known_peers[target_id] = {'pk': pk}
                            known_peers[target_id].update(
                                {'dht_seq': seq, 'address': block['address'], 'signature': block['signature']})

                            # Re-enviar mensaje si había uno esperando búsqueda
                            if target_id in pending_discovery_msgs:
                                msg_data = pending_discovery_msgs.pop(
                                    target_id)
                                print(
                                    f"[{MY_NAME}] DISCOVERY: Re-enviando mensaje pendiente a {target_id}")
                                s.sendto(msg_data, (block['address'], 50005))

            elif p_type == 'DHT_EXCHANGE':
                record_metric("dht_exchanges_received")
                peers = full_packet.get('peers', [])
                for peer in peers:
                    p_id = peer.get('revelnestId')
                    p_pk = peer.get('publicKey')
                    b = peer.get('locationBlock')
                    if p_id and p_pk and b and p_id != my_revelnest_id:
                        if p_id not in known_peers:
                            known_peers[p_id] = {'pk': p_pk, 'dht_seq': 0}

                        if verify_location_block(p_id, b, p_pk):
                            seq = b.get('dhtSeq', 0)
                            if seq > known_peers[p_id]['dht_seq']:
                                print(
                                    f"[{MY_NAME}] PEEREX Update: Discovered {p_id} at {b['address']} via {addr[0]}")
                                record_metric("contacts_discovered")
                                known_peers[p_id].update(
                                    {'dht_seq': seq, 'address': b['address'], 'signature': b['signature']})

            elif p_type == 'CHAT':
                record_metric("messages_received")
                sender_revelnest = full_packet.get('senderRevelnestId')
                if sender_revelnest in known_peers:
                    # E2EE Decryption
                    msg_content = full_packet.get('content')

                    if full_packet.get('ephemeralPublicKey'):
                        known_peers[sender_revelnest]['ephemeral_pk'] = full_packet.get(
                            'ephemeralPublicKey')

                    if 'nonce' in full_packet:
                        try:
                            use_eph = full_packet.get('useRecipientEphemeral')
                            target_pk_hex = known_peers[sender_revelnest][
                                'ephemeral_pk'] if use_eph else known_peers[sender_revelnest]['pk']
                            target_pk = nacl.public.PublicKey(
                                target_pk_hex, encoder=nacl.encoding.HexEncoder)
                            target_curve_pk = target_pk if use_eph else target_pk.to_curve25519_public_key()
                            box = nacl.public.Box(
                                my_private_key, target_curve_pk)
                            nonce = bytes.fromhex(full_packet['nonce'])
                            ciphertext = bytes.fromhex(full_packet['content'])
                            decrypted = box.decrypt(ciphertext, nonce)
                            msg_content = decrypted.decode()
                        except Exception as dec_err:
                            msg_content = f"[BOT_DECRYPT_ERROR: {dec_err}]"

                    print(
                        f"[{MY_NAME}] Mensaje de {sender_revelnest}: {msg_content}")

                    # ACK (siempre enviamos ACK)
                    if 'id' in full_packet:
                        ack = {"type": "ACK", "id": full_packet['id']}
                        full_ack = {
                            **ack, "senderRevelnestId": my_revelnest_id, "signature": sign_data(ack)}
                        s.sendto(json.dumps(full_ack, separators=(
                            ',', ':'), ensure_ascii=False).encode(), addr)

                    if not msg_content.startswith("Bot:"):
                        # Reply
                        time.sleep(1)
                        reply_text = f"Bot: Recibido. Tu ID es {sender_revelnest}."
                        reply = {"type": "CHAT", "content": reply_text}

                        # Encrypt Reply PFS
                        target_ephemeral = known_peers[sender_revelnest]['ephemeral_pk']
                        target_pk_hex = target_ephemeral if target_ephemeral else known_peers[
                            sender_revelnest]['pk']
                        target_pk = nacl.public.PublicKey(
                            target_pk_hex, encoder=nacl.encoding.HexEncoder)
                        target_curve_pk = target_pk if target_ephemeral else target_pk.to_curve25519_public_key()
                        box = nacl.public.Box(my_private_key, target_curve_pk)
                        nonce = nacl.utils.random(nacl.public.Box.NONCE_SIZE)
                        encrypted = box.encrypt(reply_text.encode(), nonce)
                        reply['content'] = encrypted.ciphertext.hex()
                        reply['nonce'] = nonce.hex()
                        reply['ephemeralPublicKey'] = my_public_key.encode(
                            encoder=nacl.encoding.HexEncoder).decode()
                        reply['useRecipientEphemeral'] = bool(target_ephemeral)

                        full_reply = {
                            **reply, "senderRevelnestId": my_revelnest_id, "signature": sign_data(reply)}
                        s.sendto(json.dumps(full_reply, separators=(
                            ',', ':'), ensure_ascii=False).encode(), addr)

            elif p_type == 'PING':
                pong = {"type": "PONG"}
                full_pong = {
                    **pong, "senderRevelnestId": my_revelnest_id, "signature": sign_data(pong)}
                s.sendto(json.dumps(full_pong, separators=(
                    ',', ':'), ensure_ascii=False).encode(), addr)

            elif p_type == 'ACK':
                if 'id' in full_packet:
                    delivered_msgs.add(full_packet['id'])
                    print(f"[{MY_NAME}] ACK recibido para {full_packet['id']}")
                    record_metric("acks_received")

            elif p_type == 'CHAT_REACTION':
                msg_id = full_packet.get('msgId')
                emoji = full_packet.get('emoji')
                remove = full_packet.get('remove', False)
                action = "ELIMINÓ" if remove else "AÑADIÓ"
                print(
                    f"[{MY_NAME}] REACCIÓN: {sender_revelnest} {action} {emoji} al mensaje {msg_id}")

            elif p_type == 'CHAT_UPDATE':
                msg_id = full_packet.get('msgId')
                # Decrypt update content
                content_hex = full_packet.get('content')
                nonce_hex = full_packet.get('nonce')
                if content_hex and nonce_hex:
                    try:
                        use_eph = full_packet.get('useRecipientEphemeral')
                        target_pk_hex = known_peers[sender_revelnest][
                            'ephemeral_pk'] if use_eph else known_peers[sender_revelnest]['pk']
                        target_pk = nacl.public.PublicKey(
                            target_pk_hex, encoder=nacl.encoding.HexEncoder)
                        target_curve_pk = target_pk if use_eph else target_pk.to_curve25519_public_key()
                        box = nacl.public.Box(my_private_key, target_curve_pk)
                        nonce = bytes.fromhex(nonce_hex)
                        ciphertext = bytes.fromhex(content_hex)
                        decrypted = box.decrypt(ciphertext, nonce)
                        new_content = decrypted.decode()
                        print(
                            f"[{MY_NAME}] EDICIÓN: {sender_revelnest} actualizó mensaje {msg_id} a: {new_content}")
                    except Exception as e:
                        print(f"[{MY_NAME}] EDICIÓN: Error descifrando: {e}")

            elif p_type == 'CHAT_DELETE':
                msg_id = full_packet.get('msgId')
                print(
                    f"[{MY_NAME}] ELIMINACIÓN: {sender_revelnest} eliminó el mensaje {msg_id}")

            elif p_type == 'RENEWAL_TOKEN':
                token = full_packet.get('token')
                print(
                    f"[{MY_NAME}] 🔑 RECEIVED RENEWAL TOKEN from {sender_revelnest}")
                print(f"[{MY_NAME}]    Target: {token.get('targetId')}")
                print(f"[{MY_NAME}]    Max renewals: {token.get('maxRenewals')}")
                print(
                    f"[{MY_NAME}]    Already used: {token.get('renewalsUsed', 0)}")

                # Store token under the target's ID (not sender's)
                target_id = token.get('targetId')
                if not target_id:
                    print(f"[{MY_NAME}] ERROR: Token missing targetId")
                    return

                # Ensure we have an entry for the target
                if target_id not in known_peers:
                    known_peers[target_id] = {}
                    print(
                        f"[{MY_NAME}] WARNING: Created new entry for {target_id}")

                # Verify token using public key from token itself
                # No need to pass pubkey_hex, it's in the token
                if verify_renewal_token(token):
                    print(f"[{MY_NAME}] ✅ Token signature VALID for {target_id}")
                    # Store target's public key from token for future use
                    target_pk = token.get("targetPublicKey")
                    if target_pk and 'pk' not in known_peers[target_id]:
                        known_peers[target_id]['pk'] = target_pk
                        print(
                            f"[{MY_NAME}] 💾 Stored target's public key from token")
                else:
                    print(
                        f"[{MY_NAME}] ❌ Token signature INVALID for {target_id}")

                # Store the token
                known_peers[target_id]['renewal_token'] = token
                print(f"[{MY_NAME}] 💾 Token stored for {target_id}")

                # Send acknowledgement
                ack = {"type": "RENEWAL_RESPONSE",
                       "status": "accepted", "targetId": target_id}
                full_ack = {**ack, "senderRevelnestId": my_revelnest_id,
                            "signature": sign_data(ack)}
                s.sendto(json.dumps(full_ack, separators=(
                    ',', ':'), ensure_ascii=False).encode(), addr)
                print(f"[{MY_NAME}] 📤 Sent RENEWAL_RESPONSE to {sender_revelnest}")

            elif p_type == 'RENEWAL_REQUEST':
                target_id = full_packet.get('targetId')
                print(
                    f"[{MY_NAME}] 🔄 RENEWAL REQUEST for {target_id} from {sender_revelnest}")

                # Check if we have a token for target_id
                if target_id in known_peers and 'renewal_token' in known_peers[target_id]:
                    token = known_peers[target_id]['renewal_token']
                    print(f"[{MY_NAME}]    Found token for {target_id}")
                    print(
                        f"[{MY_NAME}]    Renewals used: {token.get('renewalsUsed', 0)}/{token.get('maxRenewals', 3)}")

                    # Verify token validity (using public key from token)
                    # No need to pass pubkey_hex, it's in the token
                    if verify_renewal_token(token):
                        print(
                            f"[{MY_NAME}] ✅ Token verified, attempting renewal...")
                        # Attempt renewal
                        if renew_location_block_with_token(token, my_revelnest_id, known_peers, s):
                            response = {"type": "RENEWAL_RESPONSE",
                                        "status": "renewed", "targetId": target_id}
                            print(
                                f"[{MY_NAME}] ✅ Renewal SUCCESS for {target_id}")
                        else:
                            response = {
                                "type": "RENEWAL_RESPONSE", "status": "renewal_failed", "targetId": target_id}
                            print(
                                f"[{MY_NAME}] ❌ Renewal FAILED for {target_id}")
                    else:
                        response = {"type": "RENEWAL_RESPONSE",
                                    "status": "invalid_token", "targetId": target_id}
                        print(f"[{MY_NAME}] ❌ Token INVALID for {target_id}")
                else:
                    print(f"[{MY_NAME}] ❌ No token found for {target_id}")
                    print(
                        f"[{MY_NAME}]    Known peers: {list(known_peers.keys())}")
                    response = {"type": "RENEWAL_RESPONSE",
                                "status": "no_token", "targetId": target_id}

                full_resp = {
                    **response, "senderRevelnestId": my_revelnest_id, "signature": sign_data(response)}
                s.sendto(json.dumps(full_resp, separators=(
                    ',', ':'), ensure_ascii=False).encode(), addr)
                print(
                    f"[{MY_NAME}] 📤 Sent RENEWAL_RESPONSE: {response['status']} for {target_id}")

            elif p_type == 'RENEWAL_RESPONSE':
                status = full_packet.get('status')
                target_id = full_packet.get('targetId')
                print(f"[{MY_NAME}] Renewal response for {target_id}: {status}")
                # Could update UI or metrics

        except Exception as e:
            print(f"[{MY_NAME}] Error procesando: {e}")


def auto_connect(target_id_at_ip, sock):
    if not target_id_at_ip:
        return

    # Accept both @ and : as separators
    separator = '@' if '@' in target_id_at_ip else ':' if ':' in target_id_at_ip else None
    if not separator:
        print(f"[{MY_NAME}] Invalid target format, expected ID@IP or ID:IP")
        return

    parts = target_id_at_ip.split(separator, 1)
    if len(parts) != 2:
        print(f"[{MY_NAME}] Invalid target format, expected ID{separator}IP")
        return

    target_revelnest_id, target_ip = parts

    # Normalize Yggdrasil IP address
    segments = target_ip.split(':')
    has_200_prefix = target_ip.startswith('200:')

    # Valid Yggdrasil address: 8 segments (with 200:) or 7 segments (without 200:)
    is_valid_yggdrasil = (
        (has_200_prefix and len(segments) == 8) or
        (not has_200_prefix and len(segments) == 7)
    )

    if not is_valid_yggdrasil:
        print(f"[{MY_NAME}] Invalid Yggdrasil address: {target_ip}")
        return

    # Add 200: prefix if missing
    if not has_200_prefix and len(segments) == 7:
        target_ip = '200:' + target_ip

    print(f"[{MY_NAME}] Auto-conectando a {target_revelnest_id} en {target_ip}...")
    while True:
        try:
            # Build the data object (same as upeer's sendContactRequest)
            # Note: powProof is required for Sybil resistance
            pow_proof = generate_light_proof(my_revelnest_id)

            handshake_data = {
                "type": "HANDSHAKE_REQ",
                "publicKey": public_key_hex,
                "ephemeralPublicKey": my_public_key.encode(encoder=nacl.encoding.HexEncoder).decode(),
                "alias": MY_NAME,
                "avatar": MY_AVATAR,
                "powProof": pow_proof
            }

            # Sign the data and build full packet (same as sendSecureUDPMessage)
            full_packet = {
                **handshake_data,
                "senderRevelnestId": my_revelnest_id,
                "signature": sign_data(handshake_data)
            }

            print(f"[{MY_NAME}] Sending HANDSHAKE_REQ to {target_ip}")
            sock.sendto(json.dumps(full_packet, separators=(',', ':'),
                        ensure_ascii=False).encode(), (target_ip, 50005))
            time.sleep(30)  # Retry every 30s if not connected
        except Exception as e:
            print(f"[{MY_NAME}] Error sending handshake: {e}")
            time.sleep(5)


def start_dht_search(sock, target_id, known_peers, last_packet=None):
    print(f"[{MY_NAME}] !!! Iniciando búsqueda reactiva para {target_id}...")
    if last_packet:
        pending_discovery_msgs[target_id] = last_packet

    # Preguntamos a los contactos conocidos
    query = {"type": "DHT_QUERY", "targetId": target_id}
    full_q = {**query, "senderRevelnestId": my_revelnest_id,
              "signature": sign_data(query)}

    for rid, info in known_peers.items():
        if rid != target_id and 'address' in info:
            print(f"[{MY_NAME}] DHT Query -> {rid} ({info['address']})")
            sock.sendto(json.dumps(full_q, separators=(',', ':'),
                        ensure_ascii=False).encode(), (info['address'], 50005))
            record_metric("dht_queries_sent")


def send_chat_with_retry(sock, target_rid, content, known_peers):
    if target_rid not in known_peers or 'address' not in known_peers[target_rid]:
        return

    msg_id = hashlib.md5(f"{time.time()}".encode()).hexdigest()
    chat = {"type": "CHAT", "id": msg_id, "content": content}

    # Simple (No E2EE for this test specific helper to keep it clean, or use peer_bot's logic)
    # Actually, peer_bot usually sends E2EE. Let's just use a plain one for the test helper.
    full_chat = {**chat, "senderRevelnestId": my_revelnest_id,
                 "signature": sign_data(chat)}

    print(f"[{MY_NAME}] Enviando mensaje {msg_id} a {target_rid}...")
    sock.sendto(json.dumps(full_chat, separators=(',', ':'), ensure_ascii=False).encode(
    ), (known_peers[target_rid]['address'], 50005))
    record_metric("messages_sent")

    # Verificador de ACK (Fallback)
    def check_ack():
        time.sleep(5)
        if msg_id not in delivered_msgs:
            print(
                f"[{MY_NAME}] Timeout de ACK para {msg_id}. El peer {target_rid} parece haber cambiado de IP.")
            packet_bytes = json.dumps(full_chat, separators=(
                ',', ':'), ensure_ascii=False).encode()
            start_dht_search(sock, target_rid, known_peers,
                             last_packet=packet_bytes)

    threading.Thread(target=check_ack, daemon=True).start()


delivered_msgs = set()
pending_discovery_msgs = {}

if __name__ == "__main__":
    ip = get_ygg_ip()
    if ip:
        sock = socket.socket(socket.AF_INET6, socket.SOCK_DGRAM)
        sock.bind(('::', YGG_PORT))

        # Compartimos en el disco nuestra info si estamos orquestados
        node_name = os.environ.get("NODE_ENV_NAME")
        if node_name:
            MY_NAME = f"Bot_{node_name}"
            with open(f"/shared/{node_name}.json", "w") as f:
                json.dump({"id": my_revelnest_id, "ip": ip}, f)
            # Start metrics writer thread
            threading.Thread(target=write_metrics_periodically,
                             args=(node_name,), daemon=True).start()
        elif os.environ.get("BOT_ALIAS"):
            MY_NAME = os.environ.get("BOT_ALIAS")

        known_peers_dict = {}
        threading.Thread(target=listen_with_sock, args=(
            sock, known_peers_dict), daemon=True).start()
        threading.Thread(target=heartbeat, args=(
            sock, known_peers_dict), daemon=True).start()

        target_id_at_ip = os.environ.get("TARGET_IDENTITY")
        if target_id_at_ip:
            threading.Thread(target=auto_connect, args=(
                target_id_at_ip, sock), daemon=True).start()

        # Command Listener for external control (Testing)
        cmd_file = f"/shared/{node_name}.cmd" if node_name else None

        while True:
            if cmd_file and os.path.exists(cmd_file):
                try:
                    with open(cmd_file, "r") as f:
                        cmd = json.load(f)
                    os.remove(cmd_file)
                    print(f"[{MY_NAME}] Procesando comando: {cmd}")

                    if cmd.get("type") == "SEND_CHAT":
                        send_chat_with_retry(
                            sock, cmd["target_rid"], cmd["content"], known_peers_dict)
                    elif cmd.get("type") == "ADD_CONTACT":
                        rid = cmd["rid"]
                        known_peers_dict[rid] = {
                            "pk": cmd["pk"], "dht_seq": 0, "address": cmd["address"], "signature": cmd.get("signature")}
                        print(f"[{MY_NAME}] Contacto {rid} añadido manualmente.")

                    elif cmd.get("type") == "SEND_REACTION":
                        target_rid = cmd["target_rid"]
                        if target_rid in known_peers_dict:
                            data = {"type": "CHAT_REACTION", "msgId": cmd["msgId"], "emoji": cmd["emoji"], "remove": cmd.get(
                                "remove", False)}
                            full_pkt = {
                                **data, "senderRevelnestId": my_revelnest_id, "signature": sign_data(data)}
                            sock.sendto(json.dumps(full_pkt, separators=(',', ':'), ensure_ascii=False).encode(
                            ), (known_peers_dict[target_rid]['address'], 50005))

                    elif cmd.get("type") == "SEND_UPDATE":
                        target_rid = cmd["target_rid"]
                        if target_rid in known_peers_dict:
                            content = cmd["content"]
                            target_pk_hex = known_peers_dict[target_rid].get(
                                'ephemeral_pk') or known_peers_dict[target_rid]['pk']
                            target_pk = nacl.public.PublicKey(
                                target_pk_hex, encoder=nacl.encoding.HexEncoder)
                            target_curve_pk = target_pk if known_peers_dict[target_rid].get(
                                'ephemeral_pk') else target_pk.to_curve25519_public_key()
                            box = nacl.public.Box(
                                my_private_key, target_curve_pk)
                            nonce = nacl.utils.random(
                                nacl.public.Box.NONCE_SIZE)
                            encrypted = box.encrypt(content.encode(), nonce)

                            data = {
                                "type": "CHAT_UPDATE",
                                "msgId": cmd["msgId"],
                                "content": encrypted.ciphertext.hex(),
                                "nonce": nonce.hex(),
                                "ephemeralPublicKey": my_public_key.encode(encoder=nacl.encoding.HexEncoder).decode(),
                                "useRecipientEphemeral": bool(known_peers_dict[target_rid].get('ephemeral_pk'))
                            }
                            full_pkt = {
                                **data, "senderRevelnestId": my_revelnest_id, "signature": sign_data(data)}
                            sock.sendto(json.dumps(full_pkt, separators=(',', ':'), ensure_ascii=False).encode(
                            ), (known_peers_dict[target_rid]['address'], 50005))

                    elif cmd.get("type") == "SEND_DELETE":
                        target_rid = cmd["target_rid"]
                        if target_rid in known_peers_dict:
                            data = {"type": "CHAT_DELETE",
                                    "msgId": cmd["msgId"]}
                            full_pkt = {
                                **data, "senderRevelnestId": my_revelnest_id, "signature": sign_data(data)}
                            sock.sendto(json.dumps(full_pkt, separators=(',', ':'), ensure_ascii=False).encode(
                            ), (known_peers_dict[target_rid]['address'], 50005))

                    elif cmd.get("type") == "GENERATE_RENEWAL_TOKEN":
                        # Generate a renewal token for ourselves
                        token = create_renewal_token(
                            my_revelnest_id, signing_key)
                        print(f"[{MY_NAME}] Generated renewal token: {token}")
                        # Store locally - ensure entry exists for self
                        if my_revelnest_id not in known_peers_dict:
                            known_peers_dict[my_revelnest_id] = {
                                'pk': public_key_hex, 'dht_seq': my_dht_seq}
                        known_peers_dict[my_revelnest_id]['renewal_token'] = token
                        # Optionally save to file
                        if node_name:
                            with open(f"/shared/{node_name}_renewal_token.json", "w") as f:
                                json.dump(token, f)
                        print(
                            f"[{MY_NAME}] Renewal token stored for {my_revelnest_id}")

                    elif cmd.get("type") == "SEND_RENEWAL_TOKEN":
                        try:
                            print(f"[{MY_NAME}] 📥 RAW COMMAND: {cmd}")
                            target_rid = cmd.get("target_rid")
                            if not target_rid:
                                print(
                                    f"[{MY_NAME}] ❌ No target_rid in command")
                                continue
                            print(
                                f"[{MY_NAME}] 📤 Processing SEND_RENEWAL_TOKEN to {target_rid}")
                            print(f"[{MY_NAME}] DEBUG 1: Got here")
                            print(f"[{MY_NAME}]    My ID: {my_revelnest_id}")
                            print(f"[{MY_NAME}] DEBUG 2: Printed my ID")
                            print(
                                f"[{MY_NAME}]    Known peers keys: {list(known_peers_dict.keys())}")
                            print(f"[{MY_NAME}] DEBUG 3: Printed known peers")

                            if target_rid not in known_peers_dict:
                                print(
                                    f"[{MY_NAME}] ❌ Target {target_rid} not in known_peers_dict")
                                continue
                            print(
                                f"[{MY_NAME}] DEBUG 4: Target is in known_peers_dict")

                            target_info = known_peers_dict[target_rid]
                            print(
                                f"[{MY_NAME}]    Target info keys: {list(target_info.keys())}")

                            if 'address' not in target_info:
                                print(
                                    f"[{MY_NAME}] ❌ No address for {target_rid}")
                                print(
                                    f"[{MY_NAME}]    Target info: {target_info}")
                                continue
                            print(f"[{MY_NAME}] DEBUG 5: Target has address")
                        except Exception as e:
                            print(
                                f"[{MY_NAME}] 💥 EXCEPTION in SEND_RENEWAL_TOKEN: {e}")
                            import traceback
                            print(
                                f"[{MY_NAME}] Traceback: {traceback.format_exc()}")
                            continue

                        # Send token to target
                        token = known_peers_dict.get(
                            my_revelnest_id, {}).get('renewal_token')
                        if not token:
                            print(
                                f"[{MY_NAME}] No renewal token generated yet. Generating one now...")
                            token = create_renewal_token(
                                my_revelnest_id, signing_key)
                            if my_revelnest_id not in known_peers_dict:
                                known_peers_dict[my_revelnest_id] = {
                                    'pk': public_key_hex, 'dht_seq': my_dht_seq}
                            known_peers_dict[my_revelnest_id]['renewal_token'] = token

                        print(
                            f"[{MY_NAME}]    Token: target={token.get('targetId')}, renewals={token.get('renewalsUsed', 0)}/{token.get('maxRenewals', 3)}")

                        data = {"type": "RENEWAL_TOKEN", "token": token}
                        full_pkt = {
                            **data, "senderRevelnestId": my_revelnest_id, "signature": sign_data(data)}

                        target_addr = known_peers_dict[target_rid]['address']
                        print(f"[{MY_NAME}]    Sending to {target_addr}:50005")

                        sock.sendto(json.dumps(full_pkt, separators=(
                            ',', ':'), ensure_ascii=False).encode(), (target_addr, 50005))
                        print(
                            f"[{MY_NAME}] ✅ Sent renewal token to {target_rid} at {target_addr}")

                    elif cmd.get("type") == "REQUEST_RENEWAL":
                        target_rid = cmd["target_rid"]
                        if target_rid in known_peers_dict:
                            # First try to renew locally using token if we have one
                            renewal_success = False
                            if 'renewal_token' in known_peers_dict[target_rid]:
                                token = known_peers_dict[target_rid]['renewal_token']
                                print(
                                    f"[{MY_NAME}] Found renewal token for {target_rid}, attempting renewal...")
                                # Verify token first
                                target_pk = token.get('targetPublicKey')
                                if target_pk and verify_renewal_token(token, target_pk):
                                    print(
                                        f"[{MY_NAME}] Token verified, attempting renewal...")
                                    if renew_location_block_with_token(token, my_revelnest_id, known_peers_dict, sock):
                                        print(
                                            f"[{MY_NAME}] ✅ Successfully renewed {target_rid} using token")
                                        renewal_success = True
                                    else:
                                        print(
                                            f"[{MY_NAME}] ❌ Renewal failed for {target_rid}")
                                else:
                                    print(
                                        f"[{MY_NAME}] ❌ Token invalid or missing for {target_rid}")
                            else:
                                print(
                                    f"[{MY_NAME}] No renewal token found for {target_rid}")

                            # Also send renewal request to target (for notification)
                            data = {"type": "RENEWAL_REQUEST",
                                    "targetId": target_rid}
                            full_pkt = {
                                **data, "senderRevelnestId": my_revelnest_id, "signature": sign_data(data)}
                            sock.sendto(json.dumps(full_pkt, separators=(',', ':'), ensure_ascii=False).encode(
                            ), (known_peers_dict[target_rid]['address'], 50005))
                            print(
                                f"[{MY_NAME}] Sent renewal request for {target_rid}")
                        else:
                            print(
                                f"[{MY_NAME}] Target {target_rid} not in known peers")

                except Exception as e:
                    print(f"[{MY_NAME}] Error en comando: {e}")

            time.sleep(1)
    else:
        print("No se encontró ubicación de red.")
