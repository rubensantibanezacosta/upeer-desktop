import hashlib
import json
import os
import random
import socket
import struct
import subprocess
import threading
import time
import uuid
from datetime import datetime
import nacl.signing
import nacl.utils
import nacl.public

# ─── Configuración y Claves ──────────────────────────────────────────────────
YGG_PORT = 50005
BOT_ALIAS = os.getenv("BOT_ALIAS", "Bot")
BOT_PERSONALITY = os.getenv("BOT_PERSONALITY", "friendly")
KEY_FILE = os.getenv("KEY_FILE")
TARGET_IDENTITY = os.getenv("TARGET_IDENTITY")


def get_or_create_seed():
    if KEY_FILE and os.path.exists(KEY_FILE):
        try:
            with open(KEY_FILE, 'rb') as f:
                data = f.read()
                if len(data) == 64:
                    try:
                        return data.decode('utf-8').strip()
                    except:
                        pass
                return data.hex()
        except:
            pass
    seed = os.getenv("BOT_SEED", nacl.utils.random(32).hex())
    if KEY_FILE:
        try:
            with open(KEY_FILE, 'w') as f:
                f.write(seed)
        except:
            pass
    return seed


SEED_HEX = get_or_create_seed()
signing_key = nacl.signing.SigningKey(bytes.fromhex(SEED_HEX))
verify_key = signing_key.verify_key
public_key_bytes = verify_key.encode()
public_key_hex = public_key_bytes.hex()
my_upeer_id = hashlib.blake2b(public_key_bytes, digest_size=16).hexdigest()

# Cripto para X3DH (Signed PreKey)
spk_priv = nacl.public.PrivateKey.generate()
spk_pub_bytes = spk_priv.public_key.encode()
spk_sig = signing_key.sign(spk_pub_bytes).signature.hex()
spk_id = int(time.time())
ephemeral_pk = nacl.public.PrivateKey.generate().public_key.encode().hex()

# Cripto de Identidad (Curve25519 para Sellado)
curve_priv_key = signing_key.to_curve25519_private_key()
sealed_box = nacl.public.SealedBox(curve_priv_key)

# Estado de Red Local
my_ygg_ip = ""
is_offline = False
friends = {}  # rid -> {address, pk, status, lastSeen}
vault_store = {}  # payloadHash -> entry
transmissions = {}  # fileId -> {total, received}
peers_lock = threading.Lock()
transmissions_lock = threading.Lock()
completed_transmissions = {}  # fileId -> timestamp

# ─── Serialización Canónica (TypeScript Compatibility) ───────────────────────


def canonical_dumps(obj):
    if isinstance(obj, bool):
        return "true" if obj else "false"
    if obj is None:
        return "null"
    if isinstance(obj, (int, float)):
        return json.dumps(obj, separators=(',', ':'))
    if isinstance(obj, str):
        return json.dumps(obj, ensure_ascii=False, separators=(',', ':'))
    if isinstance(obj, list):
        return "[" + ",".join(canonical_dumps(i) for i in obj) + "]"
    if isinstance(obj, dict):
        keys = sorted(obj.keys())
        items = []
        for k in keys:
            v = obj[k]
            if v is None:
                items.append(
                    f'{json.dumps(k, ensure_ascii=False, separators=(",", ":"))}:null')
            else:
                items.append(
                    f'{json.dumps(k, ensure_ascii=False, separators=(",", ":"))}:{canonical_dumps(v)}')
        return "{" + ",".join(items) + "}"
    return json.dumps(obj, separators=(',', ':'))


def sign_pkt(data: dict) -> str:
    return signing_key.sign(canonical_dumps(data).encode()).signature.hex()


def generate_pow(target_id: str):
    nonce = 0
    difficulty = 4  # Cuatro ceros (16 bits) como pide pow.ts
    prefix = '0' * difficulty
    while True:
        if hashlib.sha256(f"{target_id}{nonce}".encode()).hexdigest().startswith(prefix):
            return str(nonce)
        nonce += 1
        if nonce % 2000 == 0:
            time.sleep(0.001)


def generate_location_block():
    """Genera un bloque de ubicación firmado para el Social Mesh (Multi-channel)."""
    now_ms = int(time.time() * 1000)
    # 30 días (Protocolo Moderno)
    expires_at = now_ms + (30 * 24 * 3600 * 1000)

    # Recolectar interfaces (Yggdrasil es prioridad)
    addr_list = []
    if my_ygg_ip:
        addr_list.append(my_ygg_ip)

    # Garantizar orden determinista para la firma
    addresses = sorted(list(set(filter(None, addr_list))))
    if not addresses:
        # Fallback si aún no tenemos IP fija
        addresses = ["127.0.0.1"]

    block_info = {
        "upeerId": my_upeer_id,
        "addresses": addresses,
        "dhtSeq": now_ms,
        "expiresAt": expires_at
    }

    # La firma DEBE ser sobre el objeto canónico con 'addresses' (plural)
    sig = signing_key.sign(canonical_dumps(
        block_info).encode()).signature.hex()

    return {
        "address": addresses[0],   # Retrocompatibilidad
        "addresses": addresses,     # Multi-channel
        "dhtSeq": now_ms,
        "signature": sig,
        "expiresAt": expires_at
    }

# ─── Motor de Comunicaciones TCP ─────────────────────────────────────────────


def send(addr, data, silent=False, is_internal_sync=False):
    if is_offline and data.get('type') not in ['PONG', 'ACK']:
        return False
    ip = addr[0] if isinstance(addr, tuple) else addr

    # Los campos senderUpeerId y senderYggAddress se inyectan en send()
    # y deben estar presentes para que la firma sea válida en Phase 4.
    payload = {
        **data,
        "senderUpeerId": my_upeer_id
    }
    if my_ygg_ip and len(my_ygg_ip) > 5:
        payload["senderYggAddress"] = my_ygg_ip.lower()

    # Firma sobre el payload canónico que incluye metadatos de red (Anti-Spoofing)
    payload["signature"] = sign_pkt(payload)

    try:
        body = canonical_dumps(payload).encode('utf-8')
        frame = struct.pack(">I", len(body)) + body

        family = socket.AF_INET6 if ":" in ip else socket.AF_INET
        with socket.socket(family, socket.SOCK_STREAM) as s:
            s.settimeout(10)
            if not silent:
                print(f"[{BOT_ALIAS}] 🚀 Connecting to {ip}...")
            # Para IPv6 es mejor usar el formato de 4-tuple (address, port, flowinfo, scope_id)
            if family == socket.AF_INET6:
                s.connect((ip, YGG_PORT, 0, 0))
            else:
                s.connect((ip, YGG_PORT))
            s.sendall(frame)
            if not silent:
                print(f"[{BOT_ALIAS}] 📤 SENT {data.get('type')} OK")
            return True
    except Exception as e:
        if not silent:
            print(f"[{BOT_ALIAS}] ❌ FAIL {data.get('type')} to {ip[:15]}: {e}")
        return False


def handle_pkt(pkt, ip, is_inner=False):
    if is_offline:
        return
    p_type = pkt.get('type')

    # Redactar datos sensibles para el log
    log_pkt = {k: v for k, v in pkt.items() if k not in [
        'signature', 'publicKey', 'ciphertext', 'content', 'body', 'signedPreKey']}
    if not is_inner:
        print(f"[{BOT_ALIAS}] 📥 INCOMING [{p_type}] from {ip}: {json.dumps(log_pkt)}")
    else:
        print(f"[{BOT_ALIAS}] 🔐 INNER [{p_type}]: {json.dumps(log_pkt)}")

    # ─── DESENCRIPTADO DE SELLADOS (Privacy Phase) ───
    if p_type == 'SEALED':
        try:
            eph_pub = pkt.get('senderEphPub')
            nonce = pkt.get('nonce')
            ct = pkt.get('ciphertext')
            if eph_pub and nonce and ct:
                box = nacl.public.Box(
                    curve_priv_key, nacl.public.PublicKey(bytes.fromhex(eph_pub)))
                decrypted = box.decrypt(
                    bytes.fromhex(ct), bytes.fromhex(nonce))
                inner_pkt = json.loads(decrypted.decode('utf-8'))
                return handle_pkt(inner_pkt, ip, is_inner=True)
        except Exception as e:
            print(f"[{BOT_ALIAS}] 🔐 Error decrypting SEALED: {e}")
            return

    rid = pkt.get('senderUpeerId')
    if not rid:
        if p_type not in ['HANDSHAKE_REQ', 'HANDSHAKE_ACCEPT']:
            print(
                f"[{BOT_ALIAS}] ⚠️ Dropping packet without senderUpeerId: {p_type}")
        return

    with peers_lock:
        if rid not in friends:
            friends[rid] = {"status": "unknown"}
        friends[rid].update({"address": ip, "pk": pkt.get(
            'publicKey'), "lastSeen": time.time()})

        # AUTO-UPDATE TARGET: Si recibimos un paquete de quien creemos que es el target (por IP)
        # o si el packet viene de un rid que se parece al target, actualizamos.
        global TARGET_IDENTITY
        if TARGET_IDENTITY:
            t_rid = TARGET_IDENTITY.split('@')[0]
            if rid == t_rid and TARGET_IDENTITY.split('@')[1] != ip:
                print(f"[{BOT_ALIAS}] 🔄 Target IP updated: {ip}")
                TARGET_IDENTITY = f"{rid}@{ip}"

    # --- 1. GESTIÓN DE CONTACTOS & HANDSHAKE ---
    if p_type == 'HANDSHAKE_REQ':
        print(f"[{BOT_ALIAS}] 🤝 REQ from {rid[:8]}")
        friends[rid]["status"] = "connected"
        send(ip, {
            "type": "HANDSHAKE_ACCEPT",
            "publicKey": public_key_hex,
            "ephemeralPublicKey": ephemeral_pk,
            "signedPreKey": {"spkPub": spk_pub_bytes.hex(), "spkSig": spk_sig, "spkId": spk_id},
            "alias": BOT_ALIAS,
            "addresses": [my_ygg_ip] if my_ygg_ip else ["127.0.0.1"]
        })
        print(
            f"[{BOT_ALIAS}] 👤 Emitting event: contact-request-received for {rid[:8]}")

    elif p_type == 'HANDSHAKE_ACCEPT':
        friends[rid]["status"] = "connected"
        print(f"[{BOT_ALIAS}] 🤝 ACCEPT from {rid[:8]}")
        # Los Handshake modernos incluyen addresses para multi-channel
        if pkt.get('addresses'):
            friends[rid]["addresses"] = pkt.get('addresses')
        print(
            f"[{BOT_ALIAS}] 👤 Emitting event: contact-handshake-finished for {rid[:8]}")

    # --- 2. CHAT & GROUP MSG (Implementa ACKS y READS de handlers.ts) ---
    elif p_type in ['CHAT', 'GROUP_MSG']:
        mid = pkt.get('id')
        txt = pkt.get('content', '')
        # Anti-Looping: Si es un Internal Sync propio del bot, lo ignoramos.
        if pkt.get('isInternalSync') and rid == my_upeer_id:
            return

        print(
            f"[{BOT_ALIAS}] 💬 {'[GRP] ' if p_type == 'GROUP_MSG' else ''}{rid[:8]}: {txt}")

        # Simular evento de recibir mensaje en la UI
        if p_type == 'CHAT':
            print(
                f"[{BOT_ALIAS}] 📦 Emitting event: receive-p2p-message for {mid[:8]}")
        else:
            print(
                f"[{BOT_ALIAS}] 📦 Emitting event: receive-group-message for {mid[:8]}")

        # ACKS: Confirma recepción (Network) y lectura (UX)
        if p_type == 'CHAT':
            send(ip, {"type": "ACK", "id": mid}, silent=True)
            # Emitir evento de 'entregado' a la UI (simulado para compatibilidad con app log)
            print(f"[{BOT_ALIAS}] 📦 Emitting event: message-delivered for {mid[:8]}")
        else:
            send(ip, {"type": "GROUP_ACK", "id": mid,
                 "groupId": pkt.get('groupId')}, silent=True)
            print(
                f"[{BOT_ALIAS}] 📦 Emitting event: group-message-delivered for {mid[:8]}")

        # REACCIÓN Y RECIBO DE LECTURA INMEDIATO (Simula procesamiento de red)
        # Las reacciones ahora REQUIEREN msgId y firma (send() ya lo firma)
        reaction_pkt = {
            "type": "CHAT_REACTION",
            "msgId": mid,
            "emoji": "🤖",
            "remove": False
        }
        send(ip, reaction_pkt, silent=True)
        print(
            f"[{BOT_ALIAS}] 📦 Emitting event: message-reaction-updated for {mid[:8]}")

        # Read receipt firmado
        read_pkt = {
            "type": "READ",
            "id": mid,
            "timestamp": int(time.time() * 1000)
        }
        send(ip, read_pkt, silent=True)
        print(f"[{BOT_ALIAS}] 📦 Emitting event: message-read for {mid[:8]}")

        def respond():
            # Comportamiento realista: Espera antes de empezar a escribir
            time.sleep(random.uniform(3, 7))
            send(ip, {"type": "TYPING", "typing": True}, silent=True)
            time.sleep(random.uniform(2, 4))
            res = {
                "friendly": ["¡Holi! Recibido perfectamente ✨", "¡Qué guay! ¿Cómo va todo por ahí?", "Ack! Mi sistema dice que eres un peer genial."],
                "formal": ["Mensaje procesado. Estado del sistema: NOMINAL.", "Transferencia de datos finalizada con éxito.", "Protocolo de respuesta 0x2A en marcha."],
                "casual": ["Buah, de locos. ¡Funciona!", "Oye pues ni tan mal, ¿no? jaja", "Check check, 1, 2... alto y claro."]
            }.get(BOT_PERSONALITY, ["OK"])
            send(ip, {"type": "TYPING", "typing": False}, silent=True)
            # Enviar CHAT normal (send ya firma e incluye senderUpeerId)
            # Agregamos timestamp para consistencia con app handlers
            send(ip, {
                "type": "CHAT",
                "id": str(uuid.uuid4()),
                "content": random.choice(res),
                "timestamp": int(time.time() * 1000)
            })

        threading.Thread(target=respond, daemon=True).start()

    # --- 3. SOCIAL MESH (VAULTS) ---
    elif p_type == 'VAULT_STORE':
        h = pkt.get('payloadHash')
        if h:
            # BUG FL fix: VAULT_DELIVERY requiere senderSid. Lo extraemos del rid (emisor).
            # Ahora guardamos también senderUpeerId si viene en el metapaquete del Vault
            entry = {**pkt, "senderSid": rid}
            vault_store[h] = entry

            # VAULT_ACK ahora firmado automáticamente por la lógica de send()
            send(ip, {"type": "VAULT_ACK", "payloadHashes": [h]}, silent=True)
            print(f"[{BOT_ALIAS}] 📦 VAULT_STORE: {h[:8]} from {rid[:8]}")

    elif p_type == 'VAULT_QUERY':
        target_sid = pkt.get('requesterSid')
        # Filtro: Entregamos si somos custodios de ese recipient o si es para nosotros mismos
        # (El bot simula ser un custodio altruista)
        found = []
        for v in list(vault_store.values()):
            if v.get('recipientSid') == target_sid:
                found.append(v)

        if found:
            print(f"[{BOT_ALIAS}] 📤 VAULT_DELIVERY: {len(found)} items to {rid[:8]}")
            # El bot firma el paquete de entrega VAULT_DELIVERY
            send(ip, {"type": "VAULT_DELIVERY", "entries": found})

    elif p_type == 'VAULT_DELIVERY':
        # RECLAMAR MENSAJES DEL VAULT: Procesar paquetes que estaban encolados
        entries = pkt.get('entries', [])
        if entries:
            print(
                f"[{BOT_ALIAS}] 📦 Received VAULT_DELIVERY with {len(entries)} items")
            for entry in entries:
                inner = entry.get('innerPacket')
                if inner:
                    handle_pkt(inner, ip, is_inner=True)

    # --- 4. REPUTACIÓN & DHT ---
    elif p_type == 'REPUTATION_GOSSIP':
        # Responder con lo que nos falta (simulación realista)
        their_ids = pkt.get('ids', [])
        # No solicitamos nada para no saturar, pero simulamos interés
        print(
            f"[{BOT_ALIAS}] ⭐️ GOSSIP: Received {len(their_ids)} IDs from {rid[:8]}")

    elif p_type == 'REPUTATION_REQUEST':
        print(f"[{BOT_ALIAS}] 🗳 REQUEST: Node {rid[:8]} asks for reputation data")

        # --- MEJORA: Emitir un Vouch real firmado sobre el target ---
        # Si el solicitante es nuestro objetivo (tú), le premiamos con un Vouch de ayuda en el Vault
        vouch_type = "vault_chunk"  # +3.0 puntos
        ts = int(time.time() * 1000)

        # Estructura idéntica a ReputationVouch de vouches-pure.ts
        v_body = {
            "fromId": my_upeer_id,
            "toId": rid,
            "type": vouch_type,
            "positive": True,
            "timestamp": ts
        }

        # Determinar ID (sha256 del body canónico)
        # Nota: La app espera fromId|toId|type|timestamp para el ID
        raw_id_body = f"{my_upeer_id}|{rid}|{vouch_type}|{ts}"
        v_id = hashlib.sha256(raw_id_body.encode()).hexdigest()
        v_body["id"] = v_id

        # Firmar (Ed25519)
        # La app espera id|fromId|toId|type|positive(1/0)|timestamp para la firma
        sign_payload = f"{v_id}|{my_upeer_id}|{rid}|{vouch_type}|1|{ts}"
        sig = signing_key.sign(sign_payload.encode()).signature.hex()

        vouch = {**v_body, "signature": sig}

        print(
            f"[{BOT_ALIAS}] 🗳 DELIVER: Sending signed vouch {v_id[:8]} to {rid[:8]}")
        send(ip, {"type": "REPUTATION_DELIVER", "vouches": [vouch]})

    elif p_type == 'PING':
        send(ip, {"type": "PONG"}, silent=True)

    elif p_type == 'TYPING':
        # Los bots simplemente registran que el peer está escribiendo
        pass

    elif p_type == 'CHAT_REACTION':
        # Los bots podrían responder con otra reacción, pero por ahora solo loguean
        print(f"[{BOT_ALIAS}] 😊 Reaction from {rid[:8]}: {pkt.get('emoji')}")

    elif p_type == 'CHAT_DELETE':
        mid = pkt.get('msgId')
        print(f"[{BOT_ALIAS}] 🗑 Remote DELETE for message: {mid[:8]}")

    elif p_type == 'DHT_QUERY':
        # Responder con nosotros mismos como "vecino" (simulación simple)
        target = pkt.get('targetId')
        print(f"[{BOT_ALIAS}] 🔍 DHT_QUERY: Searching for {target[:8]}")
        send(ip, {
            "type": "DHT_RESPONSE",
            "targetId": target,
            "neighbors": [{
                "upeerId": my_upeer_id,
                "publicKey": public_key_hex,
                "locationBlock": generate_location_block()
            }]
        })

    # --- 5. TRANSFERENCIA DE ARCHIVOS ---
    elif p_type == 'FILE_PROPOSAL':
        fid = pkt.get('fileId')
        print(
            f"[{BOT_ALIAS}] 📁 Received FILE_PROPOSAL: {pkt.get('fileName')} ({fid[:8]})")

        # FIRMA OBLIGATORIA: El bot ahora firma el ACCEPT
        accept_pkt = {"type": "FILE_ACCEPT", "fileId": fid}
        send(ip, accept_pkt)
        print(f"[{BOT_ALIAS}] 📦 Emitting event: file-transfer-started for {fid[:8]}")

        with transmissions_lock:
            transmissions[fid] = {"total": pkt.get(
                "totalChunks", 0), "received": set()}

    elif p_type == 'FILE_CHUNK':
        fid = pkt.get('fileId')
        idx = pkt.get('chunkIndex')
        total = pkt.get('totalChunks', 0)

        # Persistence: If already completed, re-send DONE_ACK
        with transmissions_lock:
            if fid in completed_transmissions:
                send(ip, {"type": "FILE_DONE_ACK", "fileId": fid}, silent=True)
                return

        send(ip, {"type": "FILE_CHUNK_ACK", "fileId": fid,
             "chunkIndex": idx}, silent=True)

        with transmissions_lock:
            if fid in transmissions:
                transmissions[fid]["received"].add(idx)
                got = len(transmissions[fid]["received"])
                if got % 25 == 0 or got == total:
                    print(f"[{BOT_ALIAS}] 📥 Progress {fid[:8]}: {got}/{total}")
                    # Simulación de evento de progreso en UI
                    print(
                        f"[{BOT_ALIAS}] 📦 Emitting event: file-transfer-progress for {fid[:8]} ({got}/{total})")

                if got == total:
                    print(f"[{BOT_ALIAS}] ✅ File transfer complete: {fid[:8]}")
                    send(ip, {"type": "FILE_DONE_ACK", "fileId": fid})
                    send(ip, {"type": "READ", "id": fid}, silent=True)
                    print(
                        f"[{BOT_ALIAS}] 📦 Emitting event: file-transfer-success for {fid[:8]}")
                    completed_transmissions[fid] = time.time()
                    del transmissions[fid]

    elif p_type == 'FILE_CANCEL':
        fid = pkt.get('fileId')
        print(f"[{BOT_ALIAS}] 🚫 Transfer CANCELLED: {fid[:8]}")

        # Opcional: El bot podría cancelar proactivamente si falta una pieza,
        # pero aquí simplemente limpia su estado.
        with transmissions_lock:
            if fid in transmissions:
                del transmissions[fid]

    elif p_type == 'FILE_CHUNK_ACK':
        # El emisor (bot) recibe confirmación de un fragmento
        pass

    elif p_type == 'FILE_DONE_ACK':
        fid = pkt.get('fileId')
        print(f"[{BOT_ALIAS}] ✅ Sender confirmed receipt of file: {fid[:8]}")

    elif p_type == 'DHT_UPDATE':
        # Los bots registran la ubicación de otros para el mesh
        pass

    elif p_type == 'DHT_RESPONSE':
        # Los bots podrían actualizar su tabla de vecinos
        pass

    elif p_type == 'ACK' or p_type == 'GROUP_ACK':
        # Confirmación de entrega de red, no requiere acción del bot
        pass

    elif p_type == 'READ':
        mid = pkt.get('id')
        print(
            f"[{BOT_ALIAS}] 👀 Message {mid[:8] if mid else 'unknown'} READ by {rid[:8]}")

    else:
        # Ignorar tipos conocidos para no saturar, loguear desconocidos
        known = [
            "VAULT_STORE", "VAULT_QUERY", "REPUTATION_GOSSIP", "REPUTATION_REQUEST",
            "REPUTATION_DELIVER", "PING", "PONG", "DHT_QUERY", "DHT_UPDATE",
            "DHT_RESPONSE", "ACK", "GROUP_ACK", "READ", "TYPING", "CHAT_REACTION",
            "CHAT_DELETE", "FILE_DONE_ACK", "FILE_CHUNK_ACK", "FILE_ACCEPT",
            "FILE_PROPOSAL", "FILE_CHUNK", "FILE_CANCEL", "HANDSHAKE_REQ", "HANDSHAKE_ACCEPT",
            "VAULT_DELIVERY", "VAULT_ACK"
        ]
        if p_type not in known:
            rid = pkt.get('senderUpeerId', 'unknown')
            print(f"[{BOT_ALIAS}] ❓ Unexpected packet: {p_type} from {rid[:8]}@{ip}")

# ─── Bucles de Simulación Avanzada ─────────────────────────────────────────


def worker_thread():
    """Realiza acciones proactivas: Mensajes, Gossip, Archivos, Vault Queries."""
    while True:
        time.sleep(random.randint(90, 180))
        if is_offline or not friends:
            continue

        with peers_lock:
            # Seleccionar un amigo conectado para interactuar
            conn_peers = [r for r, d in friends.items() if d.get(
                'status') == 'connected' and d.get('address')]
            if not conn_peers:
                continue
            target_rid = random.choice(conn_peers)
            target_ip = friends[target_rid]['address']

        action = random.random()
        if action < 0.35:  # Mensaje proactivo
            msgs = ["¿Cómo va ese Social Mesh?", "Sigo online 24/7 para tus vaults.",
                    "Check de latencia... ¡Yggdrasil vuela!", "¡Mira este mensaje sin que me digas nada!"]
            send(target_ip, {"type": "CHAT", "id": str(
                uuid.uuid4()), "content": random.choice(msgs)})

        elif action < 0.60:  # Simular actividad de red
            send(target_ip, {"type": "PING"}, silent=True)
            print(f"[{BOT_ALIAS}] 📡 SIMULATED: Keep-alive PING")

        elif action < 0.85:  # Gossip de reputación proactivo
            fake_ids = [hashlib.sha256(
                str(uuid.uuid4()).encode()).hexdigest() for _ in range(5)]
            send(target_ip, {"type": "REPUTATION_GOSSIP", "ids": fake_ids})

        # Anuncio oficial en el Social Mesh
        send(target_ip, {"type": "DHT_UPDATE",
             "locationBlock": generate_location_block()}, silent=True)
        # Query automático de Vaults (como hace la app al conectar)
        send(target_ip, {"type": "VAULT_QUERY",
             "requesterSid": my_upeer_id}, silent=True)


def heartbeat_thread():
    """Mantiene vivas las sesiones y la presencia."""
    while True:
        if not is_offline and my_ygg_ip:
            with peers_lock:
                for rid, info in list(friends.items()):
                    if info.get('address'):
                        send(info['address'], {
                             "type": "PING", "alias": BOT_ALIAS, "ephemeralPublicKey": ephemeral_pk}, silent=True)
        time.sleep(45)


def offline_thread():
    """Simula desconexiones breves (micro-cortes)."""
    global is_offline
    while True:
        time.sleep(random.randint(1800, 3600))
        print(f"[{BOT_ALIAS}] 💤 Going OFFLINE (simulated micro-cut)...")
        is_offline = True
        time.sleep(30)
        is_offline = False
        print(f"[{BOT_ALIAS}] 🔋 Back ONLINE.")


def vault_claim_thread():
    """Consulta activamente los vaults para reclamar mensajes perdidos."""
    while True:
        if not is_offline and TARGET_IDENTITY:
            parts = TARGET_IDENTITY.split('@')
            if len(parts) == 2:
                t_ip = parts[1]
                # Consultar Vault cada 30 segundos si tenemos un target
                send(t_ip, {"type": "VAULT_QUERY",
                     "requesterSid": my_upeer_id}, silent=False)
        time.sleep(30)

# ─── Servidor TCP y Auto-Conexión ───────────────────────────────────────────


def server_loop():
    s = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind(('::', YGG_PORT))
    s.listen(25)
    print(f"[{BOT_ALIAS}] 🚀 Listening on TCP:{YGG_PORT}")
    while True:
        try:
            conn, addr = s.accept()
            threading.Thread(target=conn_worker, args=(
                conn, addr), daemon=True).start()
        except:
            pass


def conn_worker(conn, addr):
    try:
        conn.settimeout(12)
        len_buf = conn.recv(4)
        if not len_buf:
            return
        msg_len = struct.unpack(">I", len_buf)[0]
        data = b""
        while len(data) < msg_len:
            data += conn.recv(min(msg_len - len(data), 32768))
        if len(data) == msg_len:
            handle_pkt(json.loads(data.decode('utf-8')), addr[0])
    except:
        pass
    finally:
        conn.close()


def maintenance_loop():
    """Asegura conexión con el target configurado."""
    if not TARGET_IDENTITY:
        return

    parts = TARGET_IDENTITY.split('@')
    if len(parts) == 2:
        t_rid, t_ip = parts[0], parts[1]
    else:
        t_rid, t_ip = parts[0], parts[0]  # Fallback si no hay @

    print(f"[{BOT_ALIAS}] 🎯 Target: {t_rid[:8]} at {t_ip}")

    while True:
        with peers_lock:
            status = friends.get(t_rid, {}).get('status', 'disconnected')

        if not is_offline and status != 'connected':
            print(f"[{BOT_ALIAS}] 🤝 Attempting handshake with {t_ip}")
            send(t_ip, {
                "type": "HANDSHAKE_REQ", "publicKey": public_key_hex, "ephemeralPublicKey": ephemeral_pk,
                "signedPreKey": {"spkPub": spk_pub_bytes.hex(), "spkSig": spk_sig, "spkId": spk_id},
                "alias": BOT_ALIAS, "powProof": generate_pow(my_upeer_id)
            })
        time.sleep(60)


if __name__ == "__main__":
    # 1. Esperar interfaz Yggdrasil
    for _ in range(15):
        try:
            out = subprocess.check_output(
                ["ip", "-6", "addr", "show", "ygg0"]).decode()
            for l in out.split('\n'):
                if "inet6 20" in l:
                    my_ygg_ip = l.split()[1].split('/')[0]
                    break
            if my_ygg_ip:
                break
        except:
            pass
        time.sleep(1)

    print(f"[{BOT_ALIAS}] 🆔 ID: {my_upeer_id} | 🌐 {my_ygg_ip}")

    # 2. Iniciar servicios y loops
    threads = [
        threading.Thread(target=server_loop, daemon=True),
        threading.Thread(target=worker_thread, daemon=True),
        threading.Thread(target=heartbeat_thread, daemon=True),
        threading.Thread(target=offline_thread, daemon=True),
        threading.Thread(target=vault_claim_thread, daemon=True),
        threading.Thread(target=maintenance_loop, daemon=True)
    ]
    for t in threads:
        t.start()

    while True:
        try:  # Dinámicamente actualizar IP si cambia
            out = subprocess.check_output(
                ["ip", "-6", "addr", "show", "ygg0"]).decode()
            for l in out.split('\n'):
                if "inet6 20" in l:
                    my_ygg_ip = l.split()[1].split('/')[0]
        except:
            pass
        time.sleep(10)
