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

YGG_PORT = int(os.environ.get("YGG_PORT", 50005))
MY_NAME = "RevelNest_Bot_Test"

# Identity Generation
signing_key = nacl.signing.SigningKey.generate()
verify_key = signing_key.verify_key
public_key_hex = verify_key.encode(encoder=nacl.encoding.HexEncoder).decode()

def get_revelnest_id():
    pk_bytes = verify_key.encode()
    return hashlib.blake2b(pk_bytes, digest_size=16).hexdigest()

my_revelnest_id = get_revelnest_id()
my_private_key = signing_key.to_curve25519_private_key()
my_public_key = verify_key.to_curve25519_public_key()
my_dht_seq = 1

def get_ygg_ip():
    try:
        res = subprocess.check_output(["ip", "-6", "addr", "show"]).decode()
        for line in res.split('\n'):
            if "inet6 2" in line and "scope global" in line:
                return line.strip().split()[1].split('/')[0]
    except:
        return None

def sign_data(data):
    msg_bytes = json.dumps(data, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()
    signature = signing_key.sign(msg_bytes)
    return signature.signature.hex()

def generate_location_block(ip, seq):
    data = {"revelnestId": my_revelnest_id, "address": ip, "dhtSeq": seq}
    sig = sign_data(data)
    return {"address": ip, "dhtSeq": seq, "signature": sig}

def verify_location_block(revelnest_id, block, pubkey_hex):
    try:
        data = {"revelnestId": revelnest_id, "address": block["address"], "dhtSeq": block["dhtSeq"]}
        msg_bytes = json.dumps(data, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()
        verify_k = nacl.signing.VerifyKey(pubkey_hex, encoder=nacl.encoding.HexEncoder)
        verify_k.verify(msg_bytes, bytes.fromhex(block["signature"]))
        return True
    except:
        return False

def heartbeat(sock, known_peers):
    while True:
        time.sleep(15)
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
        my_loc = generate_location_block(my_ip, my_dht_seq)

        for rid, info in known_peers.items():
            if 'address' not in info: continue
            ip = info['address']
            
            # PING
            ping = {"type": "PING"}
            full_ping = {**ping, "senderRevelnestId": my_revelnest_id, "signature": sign_data(ping)}
            sock.sendto(json.dumps(full_ping, separators=(',', ':'), ensure_ascii=False).encode(), (ip, 50005))
            
            # DHT_EXCHANGE
            exch = {"type": "DHT_EXCHANGE", "peers": peers_list[:5] + [{
                "revelnestId": my_revelnest_id,
                "publicKey": public_key_hex,
                "locationBlock": my_loc
            }]}
            full_exch = {**exch, "senderRevelnestId": my_revelnest_id, "signature": sign_data(exch)}
            sock.sendto(json.dumps(full_exch, separators=(',', ':'), ensure_ascii=False).encode(), (ip, 50005))

def listen_with_sock(s, known_peers):
    global my_dht_seq
    print(f"[{MY_NAME}] Escuchando en el puerto {YGG_PORT}...")
    print(f"[{MY_NAME}] Mi RevelNest-ID es: {my_revelnest_id}")
    
    while True:
        data, addr = s.recvfrom(4096)
        try:
            full_packet = json.loads(data.decode())
            p_type = full_packet.get('type')
            print(f"[{MY_NAME}] RECIBIDO [{p_type}] de {addr[0]}")

            if p_type == 'HANDSHAKE_REQ':
                sender_revelnest = full_packet.get('revelnestId')
                sender_pk = full_packet.get('publicKey')
                sender_ephemeral = full_packet.get('ephemeralPublicKey')
                print(f"[{MY_NAME}] Petición de conexión de {sender_revelnest}.")
                known_peers[sender_revelnest] = { "pk": sender_pk, "ephemeral_pk": sender_ephemeral, "dht_seq": 0, "address": addr[0] }
                accept_data = {
                    "type": "HANDSHAKE_ACCEPT",
                    "revelnestId": my_revelnest_id,
                    "publicKey": public_key_hex,
                    "ephemeralPublicKey": my_public_key.encode(encoder=nacl.encoding.HexEncoder).decode()
                }
                s.sendto(json.dumps(accept_data, separators=(',', ':'), ensure_ascii=False).encode(), addr)
            
            elif p_type == 'HANDSHAKE_ACCEPT':
                sender_revelnest = full_packet.get('revelnestId')
                sender_pk = full_packet.get('publicKey')
                sender_ephemeral = full_packet.get('ephemeralPublicKey')
                if sender_revelnest not in known_peers or 'pk' not in known_peers[sender_revelnest]:
                    print(f"[{MY_NAME}] Conexión ACEPTADA por {sender_revelnest}. Enviando primer mensaje...")
                    known_peers[sender_revelnest] = { "pk": sender_pk, "ephemeral_pk": sender_ephemeral, "dht_seq": 0, "address": addr[0] }
                    
                    # First message automatically
                    first_msg_text = "¡Hola! Soy el bot de RevelNest. Te he agregado automáticamente y aquí tienes mi primer mensaje. 😊"
                    reply = { "type": "CHAT", "content": first_msg_text }
                    
                    # Encrypt PFS
                    target_pk_hex = sender_ephemeral if sender_ephemeral else sender_pk
                    target_pk = nacl.public.PublicKey(target_pk_hex, encoder=nacl.encoding.HexEncoder)
                    target_curve_pk = target_pk if sender_ephemeral else target_pk.to_curve25519_public_key()
                    box = nacl.public.Box(my_private_key, target_curve_pk)
                    nonce = nacl.utils.random(nacl.public.Box.NONCE_SIZE)
                    encrypted = box.encrypt(first_msg_text.encode(), nonce)
                    reply['content'] = encrypted.ciphertext.hex()
                    reply['nonce'] = nonce.hex()
                    reply['ephemeralPublicKey'] = my_public_key.encode(encoder=nacl.encoding.HexEncoder).decode()
                    reply['useRecipientEphemeral'] = bool(sender_ephemeral)

                    full_msg = { **reply, "senderRevelnestId": my_revelnest_id, "signature": sign_data(reply) }
                    s.sendto(json.dumps(full_msg, separators=(',', ':'), ensure_ascii=False).encode(), addr)

            elif p_type == 'DHT_UPDATE':
                sender_revelnest = full_packet.get('senderRevelnestId')
                block = full_packet.get('locationBlock')
                if sender_revelnest in known_peers and block:
                    if verify_location_block(sender_revelnest, block, known_peers[sender_revelnest]['pk']):
                        seq = block.get('dhtSeq', 0)
                        if seq > known_peers[sender_revelnest]['dht_seq']:
                            print(f"[{MY_NAME}] DHT Update: {sender_revelnest} moved to {block['address']} (seq: {seq})")
                            known_peers[sender_revelnest].update({'dht_seq': seq, 'address': block['address'], 'signature': block['signature']})

            elif p_type == 'DHT_EXCHANGE':
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
                                print(f"[{MY_NAME}] PEEREX Update: Discovered {p_id} at {b['address']} via {addr[0]}")
                                known_peers[p_id].update({'dht_seq': seq, 'address': b['address'], 'signature': b['signature']})

            elif p_type == 'CHAT':
                sender_revelnest = full_packet.get('senderRevelnestId')
                if sender_revelnest in known_peers:
                    # E2EE Decryption
                    msg_content = full_packet.get('content')
                    
                    if full_packet.get('ephemeralPublicKey'):
                        known_peers[sender_revelnest]['ephemeral_pk'] = full_packet.get('ephemeralPublicKey')

                    if 'nonce' in full_packet:
                        try:
                            use_eph = full_packet.get('useRecipientEphemeral')
                            target_pk_hex = known_peers[sender_revelnest]['ephemeral_pk'] if use_eph else known_peers[sender_revelnest]['pk']
                            target_pk = nacl.public.PublicKey(target_pk_hex, encoder=nacl.encoding.HexEncoder)
                            target_curve_pk = target_pk if use_eph else target_pk.to_curve25519_public_key()
                            box = nacl.public.Box(my_private_key, target_curve_pk)
                            nonce = bytes.fromhex(full_packet['nonce'])
                            ciphertext = bytes.fromhex(full_packet['content'])
                            decrypted = box.decrypt(ciphertext, nonce)
                            msg_content = decrypted.decode()
                        except Exception as dec_err:
                            msg_content = f"[BOT_DECRYPT_ERROR: {dec_err}]"

                    print(f"[{MY_NAME}] Mensaje de {sender_revelnest}: {msg_content}")
                    
                    # ACK
                    if 'id' in full_packet:
                        ack = { "type": "ACK", "id": full_packet['id'] }
                        full_ack = { **ack, "senderRevelnestId": my_revelnest_id, "signature": sign_data(ack) }
                        s.sendto(json.dumps(full_ack, separators=(',', ':'), ensure_ascii=False).encode(), addr)
                    
                    # Reply
                    time.sleep(1)
                    reply_text = f"Bot: Recibido. Tu ID es {sender_revelnest}."
                    reply = { "type": "CHAT", "content": reply_text }
                    
                    # Encrypt Reply PFS
                    target_ephemeral = known_peers[sender_revelnest]['ephemeral_pk']
                    target_pk_hex = target_ephemeral if target_ephemeral else known_peers[sender_revelnest]['pk']
                    target_pk = nacl.public.PublicKey(target_pk_hex, encoder=nacl.encoding.HexEncoder)
                    target_curve_pk = target_pk if target_ephemeral else target_pk.to_curve25519_public_key()
                    box = nacl.public.Box(my_private_key, target_curve_pk)
                    nonce = nacl.utils.random(nacl.public.Box.NONCE_SIZE)
                    encrypted = box.encrypt(reply_text.encode(), nonce)
                    reply['content'] = encrypted.ciphertext.hex()
                    reply['nonce'] = nonce.hex()
                    reply['ephemeralPublicKey'] = my_public_key.encode(encoder=nacl.encoding.HexEncoder).decode()
                    reply['useRecipientEphemeral'] = bool(target_ephemeral)

                    full_reply = { **reply, "senderRevelnestId": my_revelnest_id, "signature": sign_data(reply) }
                    s.sendto(json.dumps(full_reply, separators=(',', ':'), ensure_ascii=False).encode(), addr)

            elif p_type == 'PING':
                pong = { "type": "PONG" }
                full_pong = { **pong, "senderRevelnestId": my_revelnest_id, "signature": sign_data(pong) }
                s.sendto(json.dumps(full_pong, separators=(',', ':'), ensure_ascii=False).encode(), addr)

        except Exception as e:
            print(f"[{MY_NAME}] Error procesando: {e}")

def auto_connect(target_id_at_ip, sock):
    if not target_id_at_ip or '@' not in target_id_at_ip:
        return
    target_revelnest_id, target_ip = target_id_at_ip.split('@')
    while True:
        try:
            handshake_req = {
                "type": "HANDSHAKE_REQ",
                "revelnestId": my_revelnest_id,
                "publicKey": public_key_hex,
                "ephemeralPublicKey": my_public_key.encode(encoder=nacl.encoding.HexEncoder).decode(),
                "alias": MY_NAME
            }
            sock.sendto(json.dumps(handshake_req, separators=(',', ':'), ensure_ascii=False).encode(), (target_ip, 50005))
            time.sleep(30) # Retry every 30s if not connected
        except:
            time.sleep(5)

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
        
        known_peers_dict = {}
        threading.Thread(target=listen_with_sock, args=(sock, known_peers_dict), daemon=True).start()
        threading.Thread(target=heartbeat, args=(sock, known_peers_dict), daemon=True).start()
        
        target_id_at_ip = os.environ.get("TARGET_IDENTITY")
        if target_id_at_ip:
            threading.Thread(target=auto_connect, args=(target_id_at_ip, sock), daemon=True).start()
        
        while True:
            time.sleep(1)
    else:
        print("No se encontró ubicación de red.")
