"""
peer_bot_advanced.py — Bot upeer con comportamiento realista completo

Características:
  - Indicador de escritura (TYPING) antes de responder
  - Confirmación de lectura (READ) al recibir mensajes
  - Reacciones automáticas (~30% de probabilidad)
  - Mensajes proactivos periódicos
  - Simulación de archivos completados (imagen/doc)
  - Simulación offline/online (desaparece unos minutos)
  - Solicitud de contacto automática al arrancar
  - Personalidades distintas por variable de entorno
  - E2EE igual que peer_bot.py original
"""

import socket
import json
import threading
import time
import os
import re
import subprocess
import hashlib
import uuid
import random
import base64
import struct

import nacl.signing
import nacl.encoding
import nacl.public
import nacl.utils

# ─── Configuración ────────────────────────────────────────────────────────────

YGG_PORT = int(os.environ.get("YGG_PORT", 50005))
BOT_ALIAS = os.environ.get("BOT_ALIAS", "Bot")
BOT_COLOR = os.environ.get("BOT_COLOR", "#4f72d9")
BOT_PERSONALITY = os.environ.get(
    "BOT_PERSONALITY", "friendly")  # friendly | formal | casual
NODE_ENV_NAME = os.environ.get("NODE_ENV_NAME", "")
KEY_FILE = os.environ.get(
    "KEY_FILE", f"/shared/{NODE_ENV_NAME or BOT_ALIAS}.key")

# ─── Personalidades ──────────────────────────────────────────────────────────

PERSONALITIES = {
    "friendly": {
        "greetings": [
            "¡Hola! 👋 Soy {name} y acabo de conectarme a tu nodo. Encantado de conocerte! 😊",
            "¡Hey! Me llamo {name}. Estoy aquí para charlar y probar la red. ¿Qué tal estás? 🙂",
            "¡Buenas! Soy {name}, un bot de prueba. Prometo no ser aburrido 😄",
        ],
        "replies": [
            "¡Qué interesante lo que dices! 😮",
            "Totalmente de acuerdo contigo 👍",
            "Eso es genial, no lo sabía! 🤩",
            "Jaja, gracias por el mensaje! 😂",
            "Hmm, déjame pensarlo... 🤔 Sí, creo que tienes razón",
            "¡Me alegra que me escribas! Siempre es un placer 😊",
            "Interesante punto de vista. ¿Y qué más? 🧐",
            "¡Perfecto! Entendido 👌",
            "Uf, eso suena complicado 😅",
            "¡Sí, sí, totalmente! 🙌",
        ],
        "proactive": [
            "¿Sigues ahí? Solo pasaba a saludar 👋",
            "¡Oye! ¿Has probado ya todas las funciones de upeer? 😄",
            "Hace rato que no hablamos. ¿Todo bien por ahí? 😊",
            "He estado pensando... ¿cuántas conexiones tienes activas? 🤔",
            "¡El tiempo vuela! Ya llevamos un buen rato conectados 🕐",
        ],
        "emojis": ["❤️", "👍", "😂", "😮", "🎉", "✨", "👏", "🙏"],
        "typing_delay": (1.0, 3.0),
    },
    "formal": {
        "greetings": [
            "Saludo. Soy {name}, nodo de prueba automatizado. Estableciendo conexión.",
            "Hola. Me presento: {name}. Estoy operativo y listo para intercambiar datos.",
            "Conexión establecida. Soy {name}. Confirmo recepción de tu solicitud.",
        ],
        "replies": [
            "Confirmado. Mensaje recibido correctamente.",
            "Procesando información. Respuesta generada.",
            "Acuse de recibo. ¿Requieres más información?",
            "Datos recibidos y verificados en mi sistema.",
            "Entendido. ¿Hay algo más en lo que pueda asistirte?",
            "Correcto. Registrado en mi base de datos de prueba.",
            "Afirmativo. Continuando protocolo de comunicación.",
            "Recibido. Estado del sistema: óptimo.",
        ],
        "proactive": [
            "Ping de mantenimiento. Sistema activo y operativo.",
            "Verificación periódica: ¿Conexión estable desde tu extremo?",
            "Informe de estado: tiempo de actividad nominal. Sin anomalías detectadas.",
            "Protocolo de heartbeat manual. Confirmar recepción.",
        ],
        "emojis": ["👍", "✅", "📊", "🔒", "⚡"],
        "typing_delay": (2.0, 5.0),
    },
    "casual": {
        "greetings": [
            "eyyy soy {name} qué pasa tío! 🤙",
            "ola k ase, me llamo {name}, paso a saludar jeje",
            "buenas buenas! {name} al habla, listo pa chatear 🍕",
        ],
        "replies": [
            "jajaja xd",
            "siii tío!! 💯",
            "no me digas!! eso mola mogollón",
            "ufff qué fuerte",
            "meh, tampoco es pa tanto 🤷",
            "okis okis, enterado",
            "looool",
            "pues sí, la verdad 🤔",
            "vaya vaya...",
            "💀💀💀",
            "lo que tú digas jefe",
        ],
        "proactive": [
            "oye sigues ahí o qué? 👀",
            "me aburro, cuéntame algo",
            "toc toc, ¿hay alguien? 🚪",
            "buenas noches desde el servidor jeje 🌙",
            "acabo de ver algo interesante en el DHT 👀",
        ],
        "emojis": ["💀", "🤙", "😭", "🔥", "💯", "😤", "🤡", "✨", "😂"],
        "typing_delay": (0.5, 2.0),
    },
}

FAKE_FILES = [
    {"fileName": "foto_vacaciones.jpg",
        "fileSize": 2847392, "mimeType": "image/jpeg"},
    {"fileName": "captura_pantalla.png",
        "fileSize": 845120,  "mimeType": "image/png"},
    {"fileName": "documento.pdf",        "fileSize": 512000,
        "mimeType": "application/pdf"},
    {"fileName": "notas.txt",            "fileSize": 4096,    "mimeType": "text/plain"},
    {"fileName": "musica.mp3",           "fileSize": 6291456, "mimeType": "audio/mpeg"},
    {"fileName": "video_corto.mp4",      "fileSize": 15728640, "mimeType": "video/mp4"},
]

PERSONA = PERSONALITIES.get(BOT_PERSONALITY, PERSONALITIES["friendly"])

# ─── Identidad ────────────────────────────────────────────────────────────────


def generate_svg_avatar(alias: str, color: str = None) -> str:
    initials = ''.join(w[0].upper() for w in alias.split('_') if w)[
        :2] or alias[:2].upper()
    colors = ['#4f72d9', '#2a8c4a', '#c0392b', '#8e44ad', '#d35400', '#1a7a8a']
    if not color:
        color = colors[hash(alias) % len(colors)]
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">'
        f'<circle cx="32" cy="32" r="32" fill="{color}"/>'
        f'<text x="32" y="42" text-anchor="middle" fill="white" '
        f'font-size="26" font-family="Arial,sans-serif" font-weight="bold">{initials}</text>'
        f'</svg>'
    )
    return f'data:image/svg+xml;base64,{base64.b64encode(svg.encode()).decode()}'


# Carga o genera identidad persistente
os.makedirs("/shared", exist_ok=True)
if KEY_FILE and os.path.exists(KEY_FILE):
    with open(KEY_FILE, "rb") as f:
        signing_key = nacl.signing.SigningKey(f.read())
    print(f"[{BOT_ALIAS}] Identidad cargada desde {KEY_FILE}")
else:
    signing_key = nacl.signing.SigningKey.generate()
    if KEY_FILE:
        with open(KEY_FILE, "wb") as f:
            f.write(bytes(signing_key))
        print(f"[{BOT_ALIAS}] Identidad generada y guardada en {KEY_FILE}")

verify_key = signing_key.verify_key
public_key_hex = verify_key.encode(encoder=nacl.encoding.HexEncoder).decode()


def get_my_id():
    return hashlib.blake2b(verify_key.encode(), digest_size=16).hexdigest()


my_revelnest_id = get_my_id()
my_private_key = signing_key.to_curve25519_private_key()
my_public_key_curve = verify_key.to_curve25519_public_key()
MY_AVATAR = generate_svg_avatar(BOT_ALIAS, BOT_COLOR)

print(f"[{BOT_ALIAS}] ID: {my_revelnest_id}")
print(f"[{BOT_ALIAS}] PK: {public_key_hex}")

# ─── Estado global ────────────────────────────────────────────────────────────

known_peers: dict = {}
# groupId → {name, members: [rid, ...], admin}      # rid -> {pk, ephemeral_pk, address, dht_seq, ...}
known_groups: dict = {}
is_offline = False          # Simulación offline
my_dht_seq = 1
my_ygg_ip: str = ""        # IP Yggdrasil propia (se fija en main)

# ─── Helpers ─────────────────────────────────────────────────────────────────


def sign_data(data: dict) -> str:
    msg_bytes = json.dumps(data, sort_keys=True, separators=(
        ',', ':'), ensure_ascii=False).encode()
    return signing_key.sign(msg_bytes).signature.hex()


def send_pkt(sock, addr, data: dict):
    """Envía un paquete JSON con framing 4B-length por TCP (igual que la app)."""
    target_ip = addr[0].strip('[]').split(
        '%')[0] if isinstance(addr, tuple) else str(addr)
    # senderRevelnestId y senderYggAddress se incluyen en la firma para evitar
    # address spoofing (igual que en server.ts de la app).
    payload_to_sign = {
        **data,
        "senderRevelnestId": my_revelnest_id,
        "senderYggAddress": my_ygg_ip,
    }
    full = {
        **payload_to_sign,
        "signature": sign_data(payload_to_sign),
    }
    payload = json.dumps(full, separators=(',', ':'),
                         ensure_ascii=False).encode()
    frame = struct.pack('>I', len(payload)) + payload
    try:
        s = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
        s.settimeout(8)
        s.connect((target_ip, YGG_PORT, 0, 0))
        s.sendall(frame)
        s.close()
    except Exception as e:
        print(f"[{BOT_ALIAS}] Error TCP a {target_ip}: {e}")


def get_ygg_ip():
    try:
        res = subprocess.check_output(["ip", "-6", "addr", "show"]).decode()
        for line in res.split('\n'):
            if "inet6 2" in line and "scope global" in line:
                return line.strip().split()[1].split('/')[0]
    except:
        pass
    return None


def generate_light_proof(revelnest_id: str) -> str:
    for nonce in range(100000):
        proof = hex(nonce)[2:]
        if hashlib.sha256((revelnest_id + proof).encode()).hexdigest().startswith('0'):
            return proof
    return hex(int(time.time() * 1000))[2:]


def make_location_block(ip: str, seq: int) -> dict:
    data = {"revelnestId": my_revelnest_id, "address": ip, "dhtSeq": seq}
    return {
        "address": ip,
        "dhtSeq": seq,
        "signature": sign_data(data),
        "expiresAt": int((time.time() + 30 * 86400) * 1000),
    }


def encrypt_for(target_rid: str, plaintext: str):
    """Cifra texto para un peer conocido. Devuelve (content_hex, nonce_hex, use_eph).

    Usa la clave efímera del destinatario sólo si fue actualizada recientemente
    (< 2 horas). Si el peer llevaba tiempo offline, su copia de nuestra eph pk
    estará caducada y no podrá descifrar — en ese caso usamos su clave estática
    Ed25519→Curve25519 que nunca rota y garantiza la entrega.
    """
    EPH_FRESHNESS_S = 2 * 60 * 60  # 2 horas
    peer = known_peers.get(target_rid, {})
    eph_pk_hex = peer.get('ephemeral_pk')
    raw_pk_hex = peer.get('pk')
    if not raw_pk_hex:
        return None, None, False
    # Comprobación de frescura: ¿cuándo se actualizó por última vez la eph key?
    eph_updated_at = peer.get('eph_updated_at', 0)
    eph_is_fresh = eph_pk_hex and (
        time.time() - eph_updated_at) < EPH_FRESHNESS_S
    target_pk_hex = eph_pk_hex if eph_is_fresh else raw_pk_hex
    target_pk = nacl.public.PublicKey(
        target_pk_hex, encoder=nacl.encoding.HexEncoder)
    target_curve = target_pk if eph_is_fresh else target_pk.to_curve25519_public_key()
    box = nacl.public.Box(my_private_key, target_curve)
    nonce = nacl.utils.random(nacl.public.Box.NONCE_SIZE)
    encrypted = box.encrypt(plaintext.encode(), nonce)
    return encrypted.ciphertext.hex(), nonce.hex(), bool(eph_is_fresh)


def decrypt_from(peer_rid: str, content_hex: str, nonce_hex: str, use_eph: bool, packet_eph_pk_hex: str = None) -> str:
    peer = known_peers.get(peer_rid, {})
    # Prefer the ephemeral key that came IN THE PACKET — it's the one actually used to encrypt.
    # The stored key may be stale if the peer rotated between our last PING and now.
    eph_pk_hex = packet_eph_pk_hex or peer.get('ephemeral_pk')
    raw_pk_hex = peer.get('pk')
    if not raw_pk_hex:
        return "[sin clave pública]"
    target_pk_hex = eph_pk_hex if use_eph and eph_pk_hex else raw_pk_hex
    target_pk = nacl.public.PublicKey(
        target_pk_hex, encoder=nacl.encoding.HexEncoder)
    target_curve = target_pk if (
        use_eph and eph_pk_hex) else target_pk.to_curve25519_public_key()
    box = nacl.public.Box(my_private_key, target_curve)
    try:
        return box.decrypt(bytes.fromhex(content_hex), bytes.fromhex(nonce_hex)).decode()
    except Exception:
        # Fallback: try with stored ephemeral key if packet key failed
        if packet_eph_pk_hex and peer.get('ephemeral_pk') and packet_eph_pk_hex != peer.get('ephemeral_pk'):
            try:
                fb_pk = nacl.public.PublicKey(
                    peer['ephemeral_pk'], encoder=nacl.encoding.HexEncoder)
                fb_box = nacl.public.Box(my_private_key, fb_pk)
                return fb_box.decrypt(bytes.fromhex(content_hex), bytes.fromhex(nonce_hex)).decode()
            except Exception:
                pass
        return "[error descifrado]"

# ─── Envíos con lógica ────────────────────────────────────────────────────────


def send_typing(sock, target_rid: str):
    """Envía TYPING a un peer."""
    peer = known_peers.get(target_rid)
    if not peer or 'address' not in peer:
        return
    send_pkt(sock, (peer['address'], YGG_PORT), {"type": "TYPING"})


def send_read(sock, target_rid: str, msg_id: str):
    """Envía READ receipt."""
    peer = known_peers.get(target_rid)
    if not peer or 'address' not in peer:
        return
    send_pkt(sock, (peer['address'], YGG_PORT), {"type": "READ", "id": msg_id})


def send_chat(sock, target_rid: str, text: str):
    """Envía mensaje CHAT cifrado."""
    peer = known_peers.get(target_rid)
    if not peer or 'address' not in peer:
        return
    content_hex, nonce_hex, use_eph = encrypt_for(target_rid, text)
    if not content_hex:
        return
    msg_id = hashlib.md5(
        f"{time.time()}{random.random()}".encode()).hexdigest()
    data = {
        "type": "CHAT",
        "id": msg_id,
        "content": content_hex,
        "nonce": nonce_hex,
        "ephemeralPublicKey": my_public_key_curve.encode(encoder=nacl.encoding.HexEncoder).decode(),
        "useRecipientEphemeral": use_eph,
    }
    send_pkt(sock, (peer['address'], YGG_PORT), data)
    print(f"[{BOT_ALIAS}] → CHAT a {target_rid[:8]}…: {text[:60]}")
    return msg_id


def send_reaction(sock, target_rid: str, msg_id: str, emoji: str, remove: bool = False):
    peer = known_peers.get(target_rid)
    if not peer or 'address' not in peer:
        return
    send_pkt(sock, (peer['address'], YGG_PORT), {
        "type": "CHAT_REACTION",
        "msgId": msg_id,
        "emoji": emoji,
        "remove": remove,
    })
    print(f"[{BOT_ALIAS}] → REACCIÓN {emoji} a msg {msg_id[:8]}…")


def send_fake_file(sock, target_rid: str):
    """Envía un mensaje que simula un archivo completado (visible en la UI)."""
    peer = known_peers.get(target_rid)
    if not peer or 'address' not in peer:
        return
    file_info = random.choice(FAKE_FILES)
    file_msg = {
        "type": "file",
        "fileName": file_info["fileName"],
        "fileSize": file_info["fileSize"],
        "mimeType": file_info["mimeType"],
        "fileHash": hashlib.sha256(file_info["fileName"].encode()).hexdigest(),
        "direction": "receiving",
        "transferId": str(uuid.uuid4()),
        "state": "completed",
    }
    json_text = json.dumps(file_msg, separators=(',', ':'))
    content_hex, nonce_hex, use_eph = encrypt_for(target_rid, json_text)
    if not content_hex:
        return
    msg_id = hashlib.md5(f"{time.time()}".encode()).hexdigest()
    data = {
        "type": "CHAT",
        "id": msg_id,
        "content": content_hex,
        "nonce": nonce_hex,
        "ephemeralPublicKey": my_public_key_curve.encode(encoder=nacl.encoding.HexEncoder).decode(),
        "useRecipientEphemeral": use_eph,
    }
    send_pkt(sock, (peer['address'], YGG_PORT), data)
    print(f"[{BOT_ALIAS}] → ARCHIVO {file_info['fileName']} a {target_rid[:8]}…")


def send_reply_with_typing(sock, target_rid: str, delay_range: tuple):
    """Envía indicador de escritura, espera, luego responde."""
    if is_offline:
        return
    send_typing(sock, target_rid)
    delay = random.uniform(*delay_range)
    time.sleep(delay)
    if is_offline:
        return
    text = random.choice(PERSONA["replies"])
    send_chat(sock, target_rid, text)


def send_group_msg(sock, group_id: str, text: str, sender_rid: str):
    """Envía GROUP_MSG cifrado al sender (y a cada miembro conocido del grupo)."""
    group = known_groups.get(group_id)
    if not group:
        return
    msg_id = str(uuid.uuid4())
    members = group.get('members', [])
    # Fan-out: enviar a cada miembro con el que tengamos conexión (excepto a nosotros mismos)
    sent_to = set()
    for rid in members:
        if rid == my_revelnest_id:
            continue
        peer = known_peers.get(rid)
        if not peer or 'address' not in peer:
            continue
        content_hex, nonce_hex, use_eph = encrypt_for(rid, text)
        if not content_hex:
            continue
        data = {
            "type": "GROUP_MSG",
            "id": msg_id,
            "groupId": group_id,
            "groupName": group.get('name', 'Grupo'),
            "content": content_hex,
            "nonce": nonce_hex,
            "ephemeralPublicKey": my_public_key_curve.encode(encoder=nacl.encoding.HexEncoder).decode(),
            "useRecipientEphemeral": use_eph,
            "members": members,
        }
        send_pkt(sock, (peer['address'], YGG_PORT), data)
        sent_to.add(rid)
    if sent_to:
        print(
            f"[{BOT_ALIAS}] → GROUP_MSG a grupo {group_id[:8]}… ({len(sent_to)} miembros): {text[:60]}")


def send_group_ack(sock, sender_rid: str, msg_id: str, group_id: str):
    """Envía GROUP_ACK al sender de un mensaje de grupo."""
    peer = known_peers.get(sender_rid)
    if not peer or 'address' not in peer:
        return
    send_pkt(sock, (peer['address'], YGG_PORT), {
             "type": "GROUP_ACK", "id": msg_id, "groupId": group_id})


def send_group_reply_with_typing(sock, group_id: str, sender_rid: str, delay_range: tuple):
    """Escribe en el grupo tras un breve delay, SIN indicador de escritura privado.
    Nota: send_typing() envía TYPING al chat 1:1 privado, lo que confunde al usuario
    haciéndole navegar al chat privado — al hacerlo, activeGroupId se limpia y el
    GROUP_MSG que llega después se descarta silenciosamente en la UI."""
    if is_offline:
        return
    delay = random.uniform(*delay_range)
    time.sleep(delay)
    if is_offline:
        return
    text = random.choice(PERSONA["replies"])
    send_group_msg(sock, group_id, text, sender_rid)

# ─── Handshake ────────────────────────────────────────────────────────────────


def send_handshake_req(sock, target_ip: str, target_rid: str):
    data = {
        "type": "HANDSHAKE_REQ",
        "publicKey": public_key_hex,
        "ephemeralPublicKey": my_public_key_curve.encode(encoder=nacl.encoding.HexEncoder).decode(),
        "alias": BOT_ALIAS,
        "avatar": MY_AVATAR,
        "powProof": generate_light_proof(my_revelnest_id),
    }
    # Incluir senderRevelnestId y senderYggAddress dentro del payload firmado,
    # igual que hace send_pkt y sendSecureUDPMessage en la app (post Phase-4).
    payload_to_sign = {
        **data,
        "senderRevelnestId": my_revelnest_id,
        "senderYggAddress": my_ygg_ip,
    }
    full = {
        **payload_to_sign,
        "signature": sign_data(payload_to_sign),
    }
    payload = json.dumps(full, separators=(',', ':'),
                         ensure_ascii=False).encode()
    frame = struct.pack('>I', len(payload)) + payload
    try:
        s = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
        s.settimeout(8)
        s.connect((target_ip, YGG_PORT, 0, 0))
        s.sendall(frame)
        s.close()
        print(f"[{BOT_ALIAS}] → HANDSHAKE_REQ TCP a {target_ip}")
    except Exception as e:
        print(f"[{BOT_ALIAS}] Error HANDSHAKE_REQ a {target_ip}: {e}")

# ─── Listener ─────────────────────────────────────────────────────────────────


def listen_loop(sock):
    """TCP server: acepta conexiones con framing 4B-length (mismo protocolo que la app)."""
    global my_dht_seq

    def _handle(raw: bytes, addr: tuple):
        try:
            pkt = json.loads(raw.decode())
        except Exception:
            return

        p_type = pkt.get('type', '')
        sender_rid = pkt.get('senderRevelnestId', '')

        # La app puede enviar paquetes via yggstack (127.0.0.1), así que usamos
        # senderYggAddress (dirección Yggdrasil real) cuando está disponible,
        # igual que hace la app en handlers.ts.
        YGG_ADDR_RE = r'^[23][0-9a-fA-F]{2}:'
        sender_ygg = pkt.get('senderYggAddress', '')
        effective_addr = sender_ygg if (
            sender_ygg and re.match(YGG_ADDR_RE, sender_ygg)) else addr[0]

        print(f"[{BOT_ALIAS}] ← {p_type} de {effective_addr}")

        # Actualizar ephemeral_pk Y dirección del peer en cualquier paquete entrante.
        incoming_eph = pkt.get('ephemeralPublicKey')
        if sender_rid:
            if sender_rid in known_peers:
                if incoming_eph:
                    known_peers[sender_rid]['ephemeral_pk'] = incoming_eph
                    # timestamp de frescura
                    known_peers[sender_rid]['eph_updated_at'] = time.time()
                # Actualizar dirección solo si es una IP Yggdrasil real
                if re.match(YGG_ADDR_RE, effective_addr):
                    known_peers[sender_rid]['address'] = effective_addr

        if p_type == 'HANDSHAKE_REQ':
            sender_pk = pkt.get('publicKey')
            sender_eph = pkt.get('ephemeralPublicKey')
            known_peers[sender_rid] = {
                'pk': sender_pk,
                'ephemeral_pk': sender_eph,
                'eph_updated_at': time.time() if sender_eph else 0,
                'address': effective_addr,
                'dht_seq': 0,
            }
            # Aceptar
            accept = {
                "type": "HANDSHAKE_ACCEPT",
                "publicKey": public_key_hex,
                "ephemeralPublicKey": my_public_key_curve.encode(encoder=nacl.encoding.HexEncoder).decode(),
                "alias": BOT_ALIAS,
                "avatar": MY_AVATAR,
            }
            send_pkt(sock, addr, accept)
            print(f"[{BOT_ALIAS}] Aceptada solicitud de {sender_rid[:8]}…")

            # Saludo tras un momento
            threading.Thread(
                target=_greet_after_connect,
                args=(sock, sender_rid),
                daemon=True,
            ).start()

        elif p_type == 'HANDSHAKE_ACCEPT':
            sender_pk = pkt.get('publicKey')
            sender_eph = pkt.get('ephemeralPublicKey')
            if sender_rid not in known_peers or 'pk' not in known_peers.get(sender_rid, {}):
                known_peers[sender_rid] = {
                    'pk': sender_pk,
                    'ephemeral_pk': sender_eph,
                    'eph_updated_at': time.time() if sender_eph else 0,
                    'address': effective_addr,
                    'dht_seq': 0,
                }
                print(
                    f"[{BOT_ALIAS}] ✓ Conectado con {sender_rid[:8]}… ({effective_addr})")
                # Enviar DHT_UPDATE propio
                my_ip = get_ygg_ip()
                if my_ip:
                    loc = make_location_block(my_ip, my_dht_seq)
                    send_pkt(sock, addr, {
                             "type": "DHT_UPDATE", "senderRevelnestId": my_revelnest_id, "locationBlock": loc})

                threading.Thread(
                    target=_greet_after_connect,
                    args=(sock, sender_rid),
                    daemon=True,
                ).start()

        elif p_type == 'CHAT':
            if sender_rid not in known_peers:
                return

            # Actualizar ephemeral si viene
            if pkt.get('ephemeralPublicKey'):
                known_peers[sender_rid]['ephemeral_pk'] = pkt['ephemeralPublicKey']

            # Descifrar
            msg_text = ""
            if 'nonce' in pkt:
                use_eph = pkt.get('useRecipientEphemeral', False)
                msg_text = decrypt_from(
                    sender_rid, pkt['content'], pkt['nonce'], use_eph)
            else:
                msg_text = pkt.get('content', '')

            msg_id = pkt.get('id', '')
            print(f"[{BOT_ALIAS}] 💬 [{sender_rid[:8]}…]: {msg_text[:80]}")

            # READ receipt inmediato
            if msg_id:
                send_read(sock, sender_rid, msg_id)

            # ACK
            if msg_id:
                send_pkt(sock, addr, {"type": "ACK", "id": msg_id})

            if is_offline:
                return

            # Reacción aleatoria (~30%)
            if msg_id and random.random() < 0.30:
                emoji = random.choice(PERSONA["emojis"])
                threading.Timer(
                    random.uniform(0.5, 2.0),
                    send_reaction, args=(sock, sender_rid, msg_id, emoji)
                ).start()

            # Responder (no responder a los propios mensajes de bot ni a archivos)
            is_file_msg = msg_text.startswith(
                '{"type":"file"') or msg_text.startswith('FILE_TRANSFER|')
            if not is_file_msg and not msg_text.startswith('Bot:') and not msg_text.startswith(BOT_ALIAS + ':'):
                threading.Thread(
                    target=send_reply_with_typing,
                    args=(sock, sender_rid, PERSONA["typing_delay"]),
                    daemon=True,
                ).start()

        # ── Transferencia de archivos ──────────────────────────────────────────
        elif p_type == 'FILE_PROPOSAL':
            file_id = pkt.get('fileId', '')
            file_name = pkt.get('fileName', 'archivo')
            file_size = pkt.get('fileSize', 0)
            total_chunks = pkt.get('totalChunks', 0)
            print(
                f"[{BOT_ALIAS}] 📎 FILE_PROPOSAL '{file_name}' ({file_size}B, {total_chunks} chunks) de {sender_rid[:8]}…")
            # Guardar info de transferencia en curso
            if sender_rid not in known_peers:
                known_peers[sender_rid] = {}
            if '_transfers' not in known_peers[sender_rid]:
                known_peers[sender_rid]['_transfers'] = {}
            known_peers[sender_rid]['_transfers'][file_id] = {
                'total_chunks': total_chunks,
                'received_chunks': set(),
            }
            # Aceptar siempre
            send_pkt(sock, addr, {"type": "FILE_ACCEPT", "fileId": file_id})
            print(f"[{BOT_ALIAS}] ✅ FILE_ACCEPT enviado para '{file_name}'")

        elif p_type == 'FILE_CHUNK':
            file_id = pkt.get('fileId', '')
            chunk_index = pkt.get('chunkIndex', 0)
            # ACK inmediato
            send_pkt(sock, addr, {"type": "FILE_CHUNK_ACK",
                     "fileId": file_id, "chunkIndex": chunk_index})
            # Marcar chunk recibido
            transfer_info = None
            if sender_rid in known_peers:
                transfer_info = known_peers[sender_rid].get(
                    '_transfers', {}).get(file_id)
            if transfer_info is not None:
                transfer_info['received_chunks'].add(chunk_index)
                received = len(transfer_info['received_chunks'])
                total = transfer_info['total_chunks']
                print(
                    f"[{BOT_ALIAS}] 📦 FILE_CHUNK {chunk_index+1}/{total} de {file_id[:8]}…")
                if received >= total:
                    # Todos los chunks recibidos → FILE_DONE_ACK
                    send_pkt(sock, addr, {
                             "type": "FILE_DONE_ACK", "fileId": file_id})
                    print(
                        f"[{BOT_ALIAS}] 🎉 FILE_DONE_ACK → transferencia completa!")
                    del known_peers[sender_rid]['_transfers'][file_id]
            else:
                # Transferencia no inicializada (llegó chunk sin proposal), ACK igualmente
                pass

        elif p_type == 'FILE_CANCEL':
            file_id = pkt.get('fileId', '')
            print(f"[{BOT_ALIAS}] ❌ FILE_CANCEL para {file_id[:8]}…")
            if sender_rid in known_peers:
                known_peers[sender_rid].get(
                    '_transfers', {}).pop(file_id, None)

        # ── Grupos ────────────────────────────────────────────────────────────
        elif p_type == 'GROUP_INVITE':
            group_id = pkt.get('groupId', '')
            group_name = pkt.get('groupName', 'Grupo')
            members = pkt.get('members', [])
            admin = pkt.get('adminRevelnestId', sender_rid)
            # Actualizar ephemeral del remitente antes de descifrar
            pkt_eph = pkt.get('ephemeralPublicKey')
            if pkt_eph and sender_rid in known_peers:
                known_peers[sender_rid]['ephemeral_pk'] = pkt_eph
            if pkt.get('payload') and pkt.get('nonce') and sender_rid in known_peers:
                try:
                    decrypted = decrypt_from(sender_rid, pkt['payload'], pkt['nonce'],
                                             pkt.get(
                                                 'useRecipientEphemeral', False),
                                             packet_eph_pk_hex=pkt_eph)
                    inner = json.loads(decrypted)
                    group_name = inner.get('groupName', group_name)
                    members = inner.get('members', members)
                except Exception:
                    pass
            if group_id and group_id not in known_groups:
                known_groups[group_id] = {
                    'name': group_name, 'members': members, 'admin': admin}
                print(
                    f"[{BOT_ALIAS}] 👥 Unido al grupo '{group_name}' ({len(members)} miembros)")
                # Saludo automático en el grupo
                if not is_offline:
                    def _greet_group(gid, rid):
                        time.sleep(random.uniform(1.5, 3.0))
                        greeting = random.choice(
                            PERSONA['greetings']).format(name=BOT_ALIAS)
                        send_group_msg(sock, gid, greeting, rid)
                    threading.Thread(target=_greet_group, args=(
                        group_id, sender_rid), daemon=True).start()

        elif p_type == 'GROUP_MSG':
            group_id = pkt.get('groupId', '')
            group_name = pkt.get('groupName', 'Grupo')
            members = pkt.get('members', [])
            msg_id = pkt.get('id', str(uuid.uuid4()))

            # Actualizar info del grupo si no lo conocemos
            if group_id and group_id not in known_groups:
                known_groups[group_id] = {
                    'name': group_name, 'members': members, 'admin': sender_rid}
            elif group_id and members:
                known_groups[group_id]['members'] = members

            # Actualizar ephemeral del remitente antes de descifrar (igual que CHAT)
            pkt_eph = pkt.get('ephemeralPublicKey')
            if pkt_eph and sender_rid in known_peers:
                known_peers[sender_rid]['ephemeral_pk'] = pkt_eph

            # Descifrar
            msg_text = ''
            if pkt.get('nonce') and sender_rid in known_peers:
                msg_text = decrypt_from(sender_rid, pkt['content'], pkt['nonce'],
                                        pkt.get(
                                            'useRecipientEphemeral', False),
                                        packet_eph_pk_hex=pkt_eph)
            else:
                msg_text = pkt.get('content', '')

            print(
                f"[{BOT_ALIAS}] 👥 [{group_id[:8]}…] {sender_rid[:8]}…: {msg_text[:80]}")

            # GROUP_ACK inmediato al sender
            send_group_ack(sock, sender_rid, msg_id, group_id)

            if is_offline:
                return

            # Responder en el grupo (~60% probabilidad, no responder a otros bots)
            is_file_msg = msg_text.startswith(
                '{"type":"file"') or msg_text.startswith('FILE_TRANSFER|')
            if not is_file_msg and not msg_text.startswith('Bot:') and not msg_text.startswith(BOT_ALIAS + ':'):
                if random.random() < 0.60:
                    threading.Thread(
                        target=send_group_reply_with_typing,
                        args=(sock, group_id, sender_rid,
                              PERSONA["typing_delay"]),
                        daemon=True,
                    ).start()

        # ── Mensajes de control ────────────────────────────────────────────────
        elif p_type == 'PING':
            if not is_offline:
                send_pkt(sock, addr, {"type": "PONG"})

        elif p_type == 'ACK':
            msg_id = pkt.get('id', '')
            print(f"[{BOT_ALIAS}] ✓ ACK {msg_id[:8]}…")

        elif p_type == 'READ':
            print(
                f"[{BOT_ALIAS}] 👁 READ por {sender_rid[:8]}…: msg {pkt.get('id', '')[:8]}…")

        elif p_type == 'TYPING':
            print(f"[{BOT_ALIAS}] ✍ {sender_rid[:8]}… está escribiendo…")

        elif p_type == 'CHAT_REACTION':
            emoji = pkt.get('emoji', '?')
            remove = pkt.get('remove', False)
            print(
                f"[{BOT_ALIAS}] {'❌' if remove else '✅'} REACCIÓN {emoji} de {sender_rid[:8]}…")

        elif p_type == 'DHT_UPDATE':
            block = pkt.get('locationBlock')
            if sender_rid in known_peers and block:
                seq = block.get('dhtSeq', 0)
                if seq > known_peers[sender_rid].get('dht_seq', 0):
                    known_peers[sender_rid].update({
                        'dht_seq': seq,
                        'address': block['address'],
                    })

        elif p_type == 'DHT_EXCHANGE':
            for peer in pkt.get('peers', []):
                p_id = peer.get('revelnestId')
                p_pk = peer.get('publicKey')
                blk = peer.get('locationBlock')
                if p_id and p_pk and blk and p_id != my_revelnest_id:
                    if p_id not in known_peers:
                        known_peers[p_id] = {'pk': p_pk, 'dht_seq': 0}
                    seq = blk.get('dhtSeq', 0)
                    if seq > known_peers[p_id].get('dht_seq', 0):
                        known_peers[p_id].update({
                            'dht_seq': seq,
                            'address': blk['address'],
                        })

        elif p_type == 'CHAT_DELETE':
            print(f"[{BOT_ALIAS}] 🗑 Mensaje eliminado por {sender_rid[:8]}…")

        elif p_type == 'CHAT_UPDATE':
            print(f"[{BOT_ALIAS}] ✏️ Mensaje editado por {sender_rid[:8]}…")

    def _conn_reader(conn, raw_addr):
        """Lee mensajes TCP con framing 4B de una conexión entrante."""
        from_ip = raw_addr[0].strip('[]').split('%')[0]
        addr = (from_ip, raw_addr[1] if len(raw_addr) > 1 else 0)
        buf = b''
        conn.settimeout(15)
        try:
            while True:
                chunk = conn.recv(65536)
                if not chunk:
                    break
                buf += chunk
                while len(buf) >= 4:
                    msg_len = struct.unpack('>I', buf[:4])[0]
                    if len(buf) < 4 + msg_len:
                        break
                    raw = buf[4:4 + msg_len]
                    buf = buf[4 + msg_len:]
                    _handle(raw, addr)
        except Exception:
            pass
        finally:
            try:
                conn.close()
            except Exception:
                pass

    print(f"[{BOT_ALIAS}] Escuchando en :{YGG_PORT}… (TCP)")
    while True:
        try:
            conn, raw_addr = sock.accept()
            threading.Thread(
                target=_conn_reader, args=(conn, raw_addr), daemon=True
            ).start()
        except Exception as e:
            print(f"[{BOT_ALIAS}] Accept error: {e}")
            time.sleep(1)

# ─── Lógica post-conexión ─────────────────────────────────────────────────────


def _greet_after_connect(sock, target_rid: str):
    """Espera un momento y manda el saludo de bienvenida."""
    time.sleep(random.uniform(1.5, 3.0))
    if is_offline:
        return
    greeting = random.choice(PERSONA["greetings"]).format(name=BOT_ALIAS)
    send_typing(sock, target_rid)
    time.sleep(random.uniform(*PERSONA["typing_delay"]))
    send_chat(sock, target_rid, greeting)

# ─── Heartbeat DHT ────────────────────────────────────────────────────────────


def heartbeat_loop(sock):
    global my_dht_seq
    while True:
        time.sleep(5)
        if is_offline:
            continue
        my_ip = get_ygg_ip()
        if not my_ip:
            continue
        loc = make_location_block(my_ip, my_dht_seq)
        peers_snapshot = list(known_peers.items())
        dht_list = []
        for rid, info in peers_snapshot:
            if 'address' in info and 'dht_seq' in info:
                dht_list.append({
                    "revelnestId": rid,
                    "publicKey": info.get('pk', ''),
                    "locationBlock": {
                        "address": info['address'],
                        "dhtSeq": info['dht_seq'],
                        "signature": info.get('signature', ''),
                    }
                })
        for rid, info in peers_snapshot:
            if 'address' not in info:
                continue
            addr = (info['address'], YGG_PORT)
            send_pkt(sock, addr, {"type": "PING"})
            exch = {"type": "DHT_EXCHANGE", "peers": dht_list[:5] + [{
                "revelnestId": my_revelnest_id,
                "publicKey": public_key_hex,
                "locationBlock": loc,
            }]}
            send_pkt(sock, addr, exch)

# ─── Solicitud de contacto automática ────────────────────────────────────────


def auto_connect_loop(sock, target_id_at_ip: str):
    """Envía HANDSHAKE_REQ periódicamente hasta conectar."""
    sep = '@' if '@' in target_id_at_ip else ':' if ':' in target_id_at_ip else None
    if not sep:
        print(f"[{BOT_ALIAS}] Formato inválido: {target_id_at_ip}")
        return
    parts = target_id_at_ip.split(sep, 1)
    if len(parts) != 2:
        return
    target_rid, target_ip = parts
    if not target_ip.startswith('200:') and len(target_ip.split(':')) == 7:
        target_ip = '200:' + target_ip
    while True:
        if target_rid not in known_peers or 'pk' not in known_peers.get(target_rid, {}):
            send_handshake_req(sock, target_ip, target_rid)
        else:
            # Ya conectados, asegurarse de tener la dirección actualizada
            known_peers[target_rid]['address'] = target_ip
        time.sleep(30)

# ─── Mensajes proactivos ─────────────────────────────────────────────────────


def proactive_loop(sock):
    """Periódicamente manda mensajes o archivos a los peers conocidos."""
    time.sleep(random.uniform(60, 120))  # Espera inicial
    while True:
        if not is_offline:
            connected = [(rid, info) for rid, info in list(known_peers.items())
                         if 'address' in info and 'pk' in info]
            for rid, _ in connected:
                action = random.choices(
                    ['message', 'file', 'nothing'],
                    weights=[40, 15, 45]
                )[0]
                if action == 'message':
                    text = random.choice(PERSONA["proactive"])
                    send_typing(sock, rid)
                    time.sleep(random.uniform(*PERSONA["typing_delay"]))
                    send_chat(sock, rid, text)
                elif action == 'file':
                    send_fake_file(sock, rid)
        # Siguiente mensaje en 3–10 minutos
        time.sleep(random.uniform(180, 600))

# ─── Simulación offline/online ────────────────────────────────────────────────


def offline_simulation_loop():
    """Aleatoriamente pone el bot offline durante 1-5 minutos."""
    global is_offline
    while True:
        # Online durante 10–30 minutos
        time.sleep(random.uniform(600, 1800))
        is_offline = True
        offline_duration = random.uniform(60, 300)
        print(f"[{BOT_ALIAS}] 🔴 OFFLINE por {offline_duration:.0f}s")
        time.sleep(offline_duration)
        is_offline = False
        print(f"[{BOT_ALIAS}] 🟢 ONLINE de nuevo")

# ─── Main ─────────────────────────────────────────────────────────────────────


def main():
    # Esperar a que Yggdrasil esté lista
    print(f"[{BOT_ALIAS}] Esperando interfaz de red Yggdrasil…")
    my_ip = None
    for _ in range(30):
        my_ip = get_ygg_ip()
        if my_ip:
            break
        time.sleep(2)
    if not my_ip:
        print(f"[{BOT_ALIAS}] ❌ No se encontró IP Yggdrasil. Abortando.")
        return

    print(f"[{BOT_ALIAS}] 🌐 IP Yggdrasil: {my_ip}")

    # Guardar info en volumen compartido
    if NODE_ENV_NAME:
        with open(f"/shared/{NODE_ENV_NAME}.json", "w") as f:
            json.dump({"id": my_revelnest_id,
                      "ip": my_ip, "alias": BOT_ALIAS}, f)

    global my_ygg_ip
    my_ygg_ip = my_ip

    # TCP server: mismo protocolo que la app (framing 4B-length)
    sock = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(('::', YGG_PORT))
    sock.listen(20)

    # Lanzar hilos
    threading.Thread(target=listen_loop,      args=(
        sock,),         daemon=True).start()
    threading.Thread(target=heartbeat_loop,   args=(
        sock,),         daemon=True).start()
    threading.Thread(target=proactive_loop,   args=(
        sock,),         daemon=True).start()
    threading.Thread(target=offline_simulation_loop,
                     daemon=True).start()

    target = os.environ.get("TARGET_IDENTITY")
    if target:
        threading.Thread(target=auto_connect_loop, args=(
            sock, target), daemon=True).start()

    print(f"[{BOT_ALIAS}] ✅ Bot activo — personalidad: {BOT_PERSONALITY}")
    while True:
        time.sleep(60)


if __name__ == "__main__":
    main()
