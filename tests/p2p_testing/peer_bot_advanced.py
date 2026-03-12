import hashlib
import json
import os
import random
import re
import socket
import struct
import subprocess
import threading
import time
from base64 import b64decode, b64encode

import nacl.encoding
import nacl.signing
import nacl.utils
from nacl.public import Box, PrivateKey, PublicKey

# Configuración Base
YGG_PORT = 19735
BOT_ALIAS = os.getenv("BOT_ALIAS", "Bot")
SEED_HEX = os.getenv("BOT_SEED", nacl.utils.random(32).hex())
signing_key = nacl.signing.SigningKey(bytes.fromhex(SEED_HEX))
verify_key = signing_key.verify_key
public_key_hex = verify_key.encode().hex()
my_upeer_id = hashlib.sha256(bytes.fromhex(public_key_hex)).hexdigest()[:32]
my_ygg_ip = ""
my_dht_seq = int(time.time() / 60)
is_offline = False

known_peers = {}  # upeerId -> {address, pk, ephemeral_pk, dht_seq, signature, expiresAt}
# Double Ratchet State (simplificado para bots)
# rid -> { send_key, recv_key, send_idx, recv_idx }
ratchets = {}

peers_lock = threading.Lock()
dht_store_lock = threading.Lock()
vault_store_lock = threading.Lock()

# ALMACENAMIENTO VAULT Y DHT
vault_store = {}  # payloadHash -> { data, recipientSid, senderSid, expiresAt }
dht_store = {}    # keyHex -> { value, publisher, timestamp, signature }

# ─── Kademlia Helpers ────────────────────────────────────────────────────────


def to_kademlia_id(upeer_id_hex: str):
    """Convierte upeerId a Kademlia ID (160 bits) igual que la app."""
    try:
        h = hashlib.sha256()
        h.update(bytes.fromhex(upeer_id_hex))
        return h.digest()[:20]
    except:
        return hashlib.sha256(upeer_id_hex.encode()).digest()[:20]


my_node_id = to_kademlia_id(my_upeer_id)


def xor_distance(id1: bytes, id2: bytes):
    return int.from_bytes(id1, 'big') ^ int.from_bytes(id2, 'big')


def get_closest_nodes(target_hex: str, count=20):
    """Devuelve los nodos conocidos más cercanos al ID destino."""
    try:
        target_id = to_kademlia_id(
            target_hex) if len(target_hex) <= 32 else bytes.fromhex(target_hex)
    except:
        target_id = hashlib.sha256(target_hex.encode()).digest()[:20]

    peers = []
    with peers_lock:
        for rid, info in known_peers.items():
            if 'address' in info and 'pk' in info:
                peers.append({
                    "upeerId": rid,
                    "address": info['address'],
                    "pk": info['pk'],
                    "dist": xor_distance(to_kademlia_id(rid), target_id)
                })

    peers.sort(key=lambda x: x['dist'])
    return peers[:count]


def find_node(sock, target_id: str):
    """Búsqueda simple de un nodo en la red conocida."""
    closest = get_closest_nodes(target_id, count=3)
    for node in closest:
        if node['upeerId'] == target_id:
            return node
    return None


def find_value(sock, key: str):
    """Búsqueda simple de un valor en la DHT."""
    if key in dht_store:
        return dht_store[key]['value']
    return None

# ─── Cripto Helpers ──────────────────────────────────────────────────────────

def canonical_dumps(obj):
    """Réplica exacta de canonicalStringify de la app (TypeScript)."""
    if isinstance(obj, bool):
        return "true" if obj else "false"
    if obj is None:
        return "null"
    if isinstance(obj, (int, float)):
        return json.dumps(obj)
    if isinstance(obj, str):
        return json.dumps(obj, ensure_ascii=False)
    if isinstance(obj, list):
        return "[" + ",".join(canonical_dumps(i) for i in obj) + "]"
    if isinstance(obj, dict):
        # Ordenar claves alfabéticamente
        keys = sorted(obj.keys())
        items = []
        for k in keys:
            v = obj[k]
            if v is None: continue # Ignorar campos nulos como en TS
            items.append(f'"{k}":{canonical_dumps(v)}')
        return "{" + ",".join(items) + "}"
    return json.dumps(obj)

def sign_data(data: dict) -> str:
    # Usar canonical_dumps para coincidir con el cliente TS
    msg_str = canonical_dumps(data)
    # print(f"[{BOT_ALIAS}] SIGNING: {msg_str}") # Debug para comparar
    return signing_key.sign(msg_str.encode()).signature.hex()


def encrypt_for(target_rid: str, plaintext: str):
    """Cifra un mensaje para un peer usando Curve25519."""
    peer = known_peers.get(target_rid, {})
    raw_pk_hex = peer.get('pk')
    if not raw_pk_hex:
        return None, None, False

    try:
        # Simplificación: En lugar de Double Ratchet completo (que requiere
        # estado persistente y handshakes complejos), usamos sealed boxes
        # para los bots. La app lo entenderá si viene marcado como tal.
        target_pk = PublicKey(bytes.fromhex(raw_pk_hex))
        # Para que la app lo acepte, debería ser un mensaje "X3DH initial" o usar el Ratchet.
        # Por simplicidad, los bots enviarán mensajes SIN cifrar si la app lo permite,
        # o usaremos un esquema estático si es necesario.
        return plaintext, None, False
    except:
        return plaintext, None, False


def make_location_block(ip: str, seq: int):
    """Crea un bloque de ubicación firmado idéntico al de la app."""
    # expiresAt: ahora + 7 días en ms
    expires = int((time.time() + 7 * 86400) * 1000)
    data = {
        "address": ip.lower(),
        "dhtSeq": seq,
        "expiresAt": expires
    }
    return {
        **data,
        "signature": sign_data(data)
    }

# ─── Network Helpers ─────────────────────────────────────────────────────────


def send_pkt(sock, addr, data: dict):
    """Envía un paquete JSON con framing 4B-length por TCP (igual que la app)."""
    target_ip = addr[0].strip('[]').split(
        '%')[0] if isinstance(addr, tuple) else str(addr)
    # senderUpeerId y senderYggAddress se incluyen en la firma para evitar
    # address spoofing (igual que en server.ts de la app).
    payload_to_sign = {
        **data,
        "senderUpeerId": my_upeer_id,
        "senderYggAddress": my_ygg_ip.lower() if my_ygg_ip else "",
    }
    full = {
        **payload_to_sign,
        "signature": sign_data(payload_to_sign),
    }
    payload = canonical_dumps(full).encode()
    frame = struct.pack('>I', len(payload)) + payload
    time.sleep(0.1)  # Throttling preventivo para no saturar rate limiters
    try:
        s = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
        s.settimeout(5)
        s.connect((target_ip, YGG_PORT, 0, 0))
        s.sendall(frame)
        s.close()
    except Exception as e:
        # print(f"[{BOT_ALIAS}] Error TCP a {target_ip}: {e}")
        pass


def get_ygg_ip():
    try:
        res = subprocess.check_output(["ip", "-6", "addr", "show"]).decode()
        for line in res.split('\n'):
            if "inet6 2" in line and "scope global" in line:
                return line.strip().split()[1].split('/')[0].lower()
    except:
        pass
    return None

# ─── Handlers ────────────────────────────────────────────────────────────────


def send_handshake_req(sock, ip, rid):
    send_pkt(sock, (ip, YGG_PORT), {
        "type": "HANDSHAKE_REQ",
        "publicKey": public_key_hex,
        "alias": BOT_ALIAS
    })


def send_chat(sock, target_rid, text):
    content, nonce, encrypted = encrypt_for(target_rid, text)
    msg_id = os.urandom(8).hex()
    payload = {
        "type": "CHAT",
        "id": msg_id,
        "content": content,
    }
    if encrypted:
        payload["nonce"] = nonce

    # Intentar envío directo
    peer = known_peers.get(target_rid)
    if peer and 'address' in peer:
        print(f"[{BOT_ALIAS}] → CHAT directo a {target_rid[:8]}…")
        send_pkt(sock, (peer['address'], YGG_PORT), payload)
    
    # Replicar a Vaults para offline (Social Mesh)
    threading.Thread(target=replicate_to_vaults, args=(sock, target_rid, payload), daemon=True).start()


def replicate_to_vaults(sock, target_rid: str, packet: any):
    """Replicación Social Mesh: guarda el mensaje en amigos para entrega offline."""
    try:
        # Re-encriptar para Vault (estático, para que el destinatario pueda leerlo al volver)
        # En la app usamos las claves de identidad para esto si no hay sesión.
        store_pkt = {
            "type": "VAULT_STORE",
            "payloadHash": hashlib.sha256(json.dumps(packet).encode()).hexdigest(),
            "recipientSid": target_rid,
            "senderSid": my_upeer_id,
            "data": json.dumps(packet).encode().hex(),
            "expiresAt": int((time.time() + 7 * 86400) * 1000)
        }

        # Enviar a amigos conectados (Custodios de nivel 1) - Máximo 3
        custodians = []
        closest_friends = get_closest_nodes(target_rid, count=3)
        for friend in closest_friends:
            rid = friend['upeerId']
            if rid == target_rid: continue
            addr = (friend['address'], YGG_PORT)
            custodians.append(rid)
            send_pkt(sock, addr, store_pkt)

        if custodians:
            # Publicar puntero en DHT (a los 3 nodos más cercanos a la clave)
            ptr_key = hashlib.sha256(
                f"vault-ptr:{target_rid}".encode()).hexdigest()[:40]
            ptr_val = {"custodians": custodians + [my_upeer_id]}
            
            targets = get_closest_nodes(ptr_key, count=3)
            for t in targets:
                send_pkt(sock, (t['address'], YGG_PORT), {
                    "type": "DHT_STORE",
                    "key": ptr_key,
                    "value": ptr_val
                })
    except Exception as e:
        print(f"[{BOT_ALIAS}] ❌ Error en replicación Vault: {e}")


def send_read(sock, target_rid: str, msg_id: str, addr=None):
    payload = {"type": "READ", "id": msg_id}
    print(f"[{BOT_ALIAS}] → READ receipt de msg {msg_id[:8]}… para {target_rid[:8]}…")
    
    # Si tenemos una dirección directa y parece fresca, intentar envío directo
    target_addr = addr
    if not target_addr:
        peer = known_peers.get(target_rid, {})
        if 'address' in peer:
            target_addr = (peer['address'], YGG_PORT)
            
    if target_addr:
        try:
            send_pkt(sock, target_addr, payload)
        except:
            pass
            
    # Replicar a Vaults para asegurar que le llegue aunque se desconecte ahora
    # (El Social Mesh se encarga de que le llegue al emisor original)
    threading.Thread(target=replicate_to_vaults, args=(sock, target_rid, payload), daemon=True).start()


def send_reaction(sock, target_rid: str, msg_id: str, emoji: str):
    payload = {
        "type": "CHAT_REACTION",
        "msgId": msg_id,
        "emoji": emoji,
        "remove": False
    }
    
    # Intentar directo
    peer = known_peers.get(target_rid, {})
    if 'address' in peer:
        send_pkt(sock, (peer['address'], YGG_PORT), payload)
        
    # Replicar a Vaults (Social Mesh)
    threading.Thread(target=replicate_to_vaults, args=(sock, target_rid, payload), daemon=True).start()


def handle_pkt(sock, data, addr):
    global my_dht_seq
    try:
        pkt = json.loads(data.decode())
        p_type = pkt.get('type')
        sender_rid = pkt.get('senderUpeerId')
        src_ip = addr[0]

        if not sender_rid:
            return

        with peers_lock:
            if sender_rid not in known_peers:
                known_peers[sender_rid] = {}
            known_peers[sender_rid]['address'] = src_ip

        # ── HANDSHAKE ────────────────────────────────────────────────────────
        if p_type == 'HANDSHAKE_REQ':
            known_peers[sender_rid]['pk'] = pkt.get('publicKey')
            # Responder con ACCEPT
            send_pkt(sock, addr, {
                "type": "HANDSHAKE_ACCEPT",
                "publicKey": public_key_hex,
                "alias": BOT_ALIAS
            })
            print(f"[{BOT_ALIAS}] 🤝 Handshake REQ de {sender_rid[:8]}…")

        elif p_type == 'HANDSHAKE_ACCEPT':
            known_peers[sender_rid]['pk'] = pkt.get('publicKey')
            print(f"[{BOT_ALIAS}] 🤝 Handshake ACCEPT de {sender_rid[:8]}…")

        # ── CHAT & MESSAGING ─────────────────────────────────────────────────
        elif p_type == 'CHAT':
            msg_id = pkt.get('id')
            content = pkt.get('content')
            print(f"[{BOT_ALIAS}] 💬 Msg de {sender_rid[:8]}…: {content}")
            # Auto-responder con un READ receipt
            if msg_id:
                time.sleep(1) # Simular tiempo de lectura
                send_read(sock, sender_rid, msg_id, addr)
                
                # Si el mensaje contiene "lo has recibido?", enviar reacción
                if "12424124124124" in content or "lo has recibido?" in content.lower():
                    time.sleep(1)
                    send_reaction(sock, sender_rid, msg_id, "✅")

        elif p_type == 'READ':
            print(f"[{BOT_ALIAS}] ✔ Leído por {sender_rid[:8]}… (msg {pkt.get('id')[:8]}…)")

        elif p_type == 'CHAT_REACTION':
            print(f"[{BOT_ALIAS}] {pkt.get('emoji')} Reacción de {sender_rid[:8]}…")

        # ── VAULT (Social Mesh) ──────────────────────────────────────────────
        elif p_type == 'VAULT_STORE':
            h = pkt.get('payloadHash')
            if h:
                with vault_store_lock:
                    vault_store[h] = {
                        "data": pkt.get('data'),
                        "recipientSid": pkt.get('recipientSid'),
                        "senderSid": pkt.get('senderSid'),
                        "expiresAt": pkt.get('expiresAt')
                    }
                # print(f"[{BOT_ALIAS}] 📦 VAULT_STORE: guardado payload {h[:8]}… para {pkt.get('recipientSid')[:8]}…")

        elif p_type == 'VAULT_QUERY':
            req_sid = pkt.get('requesterSid')
            entries = []
            with vault_store_lock:
                for h, ent in list(vault_store.items()):
                    if ent['recipientSid'] == req_sid:
                        entries.append({
                            "senderSid": ent['senderSid'],
                            "payloadHash": h,
                            "data": ent['data'],
                            "expiresAt": ent['expiresAt']
                        })
            if entries:
                print(f"[{BOT_ALIAS}] 📦 VAULT_DELIVERY: enviando {len(entries)} mensajes a {req_sid[:8]}…")
                # Enviar en pedazos si son muchos (aquí simplificado)
                send_pkt(sock, addr, {"type": "VAULT_DELIVERY", "entries": entries})

        elif p_type == 'VAULT_DELIVERY':
            # El bot recibe mensajes que estaban guardados para él
            ents = pkt.get('entries', [])
            hashes = []
            for e in ents:
                d = e.get('data')
                h = e.get('payloadHash')
                sender = e.get('senderSid')
                if d and h:
                    # Simular el mismo procesado que un CHAT normal
                    try:
                        inner = json.loads(bytes.fromhex(d).decode())
                        if inner.get('type') == 'CHAT':
                           # Re-procesar el inner packet
                           handle_pkt(sock, json.dumps({**inner, "senderUpeerId": sender}).encode(), addr)
                           hashes.append(h)
                        elif inner.get('type') == 'READ':
                           handle_pkt(sock, json.dumps({**inner, "senderUpeerId": sender}).encode(), addr)
                           hashes.append(h)
                        elif inner.get('type') == 'CHAT_REACTION':
                           handle_pkt(sock, json.dumps({**inner, "senderUpeerId": sender}).encode(), addr)
                           hashes.append(h)
                    except:
                        pass
            if hashes:
                send_pkt(sock, addr, {"type": "VAULT_ACK", "payloadHashes": hashes})

        # ── PROTOCOLO DHT Kademlia (Pointers & Location) ─────────────────────
        elif p_type == 'DHT_STORE':
            key = pkt.get('key')
            val = pkt.get('value')
            if key and val:
                with dht_store_lock:
                    dht_store[key] = {"value": val, "publisher": sender_rid,
                                      "timestamp": time.time(), "signature": pkt.get('signature')}
                # Ahora que la app lo soporta, enviamos el ACK
                send_pkt(sock, addr, {"type": "DHT_STORE_ACK", "key": key})

        elif p_type == 'DHT_FIND_VALUE':
            key = pkt.get('key')
            q_id = pkt.get('queryId')
            with dht_store_lock:
                ent = dht_store.get(key)
            if ent:
                resp = {"type": "DHT_FOUND_VALUE", "key": key, "value": ent['value'],
                        "publisher": ent['publisher'], "timestamp": ent['timestamp'], "signature": ent['signature']}
                if q_id:
                    resp["queryId"] = q_id
                send_pkt(sock, addr, resp)

        elif p_type == 'DHT_UPDATE':
            lb = pkt.get('locationBlock')
            if lb and sender_rid:
                with peers_lock:
                    known_peers[sender_rid].update({
                        'address': lb.get('address'),
                        'dht_seq': lb.get('dhtSeq'),
                        'signature': lb.get('signature'),
                        'expiresAt': lb.get('expiresAt')
                    })

        elif p_type == 'DHT_EXCHANGE':
            peers = pkt.get('peers', [])
            for p in peers:
                rid = p.get('upeerId')
                if rid and rid != my_upeer_id:
                    with peers_lock:
                        if rid not in known_peers:
                            known_peers[rid] = {}
                        known_peers[rid]['pk'] = p.get('publicKey')
                        lb = p.get('locationBlock')
                        if lb:
                            known_peers[rid].update({
                                'address': lb.get('address'),
                                'dht_seq': lb.get('dhtSeq'),
                                'signature': lb.get('signature'),
                                'expiresAt': lb.get('expiresAt')
                            })

    except Exception as e:
        print(f"[{BOT_ALIAS}] ❌ Error procesando paquete: {e}")
        import traceback
        traceback.print_exc()


def main_server():
    global my_ygg_ip
    s = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
    s.bind(('::', YGG_PORT))
    s.listen(10)
    print(f"[{BOT_ALIAS}] 🚀 Listening on {YGG_PORT} (TCP/Yggdrasil)")
    print(f"[{BOT_ALIAS}] ID: {my_upeer_id}")

    my_ygg_ip = get_ygg_ip()
    if not my_ygg_ip:
        print(f"[{BOT_ALIAS}] ⚠️ No se detectó IPv6 de Yggdrasil.")

    # Loop principal de lectura
    while True:
        conn, addr = s.accept()
        threading.Thread(target=tcp_handler, args=(conn, addr), daemon=True).start()


def tcp_handler(conn, addr):
    try:
        # Leer length prefix (4 bytes)
        len_buf = conn.recv(4)
        if not len_buf:
            return
        length = struct.unpack('>I', len_buf)[0]
        # Leer payload
        payload = b""
        while len(payload) < length:
            chunk = conn.recv(min(length - len(payload), 8192))
            if not chunk:
                break
            payload += chunk
        if len(payload) == length:
            handle_pkt(None, payload, addr)
    except Exception as e:
        pass
    finally:
        conn.close()


def heartbeat_loop(sock):
    global my_dht_seq
    while True:
        # Relajamos el latido a 90 segundos para no saturar el Social Mesh / Rate limits
        time.sleep(90)
        if is_offline:
            continue
        my_ip = get_ygg_ip()
        if not my_ip:
            continue
        loc = make_location_block(my_ip, my_dht_seq)
        
        # Republish our location to the DHT (social mesh) - Solo a los 3 más cercanos
        def _republish_location():
            lb_key = hashlib.sha256(f"location:{my_upeer_id}".encode()).hexdigest()[:40]
            targets = get_closest_nodes(lb_key, count=3)
            for t in targets:
                send_pkt(sock, (t['address'], YGG_PORT), {
                    "type": "DHT_STORE",
                    "key": lb_key,
                    "value": loc
                })
        threading.Thread(target=_republish_location, daemon=True).start()

        peers_snapshot = list(known_peers.items())
        dht_list = []
        for rid, info in peers_snapshot:
            sig = info.get('signature', '')
            if 'address' in info and 'dht_seq' in info and sig:
                dht_list.append({"upeerId": rid, "publicKey": info.get('pk', ''), "locationBlock": {
                                "address": info['address'], "dhtSeq": info['dht_seq'], "signature": sig, "expiresAt": info.get('expiresAt')}})
        # Check DHT pointers for any messages meant for us in nodes we don't know
        def _seek_extra_vaults():
            ptr_key = hashlib.sha256(f"vault-ptr:{my_upeer_id}".encode()).hexdigest()
            # Try to find who has messages for us
            nodes = find_value(sock, ptr_key)
            if nodes and isinstance(nodes, dict) and 'custodians' in nodes:
                 for cid in nodes['custodians']:
                     if cid == my_upeer_id: continue
                     with peers_lock:
                         if cid not in known_peers:
                             # Ask DHT for their location if we don't know them
                             addr_info = find_node(sock, cid)
                             if addr_info and 'address' in addr_info:
                                 known_peers[cid] = {'address': addr_info['address']}
                                 print(f"[{BOT_ALIAS}] 📦 DHT Discovery: Encontrado custodio extra {cid[:8]}…")

        threading.Thread(target=_seek_extra_vaults, daemon=True).start()

        # ─── Mantenimiento de conexiones y Bóveda ─────────────────────────────
        # En lugar de inundar a todos (broadcast), elegimos 3 amigos al azar
        # para intercambiar datos, reduciendo el ruido en la red.
        if peers_snapshot:
            sample_size = min(len(peers_snapshot), 3)
            targets = random.sample(peers_snapshot, sample_size)
            
            for rid, info in targets:
                if 'address' not in info:
                    continue
                addr = (info['address'], YGG_PORT)
                
                # 1. PING para mantener viva la conexión
                send_pkt(sock, addr, {"type": "PING"})
                
                # 2. VAULT_QUERY: ¿Tienes algo para mí?
                # (Solo a amigos conocidos o descubiertos por DHT)
                send_pkt(sock, addr, {"type": "VAULT_QUERY", "requesterSid": my_upeer_id})
                
                # 3. DHT_EXCHANGE: Intercambio de "agendas" (Gossip)
                # Compartimos un trozo de nuestra lista de nodos conocidos
                exch = {"type": "DHT_EXCHANGE", "peers": dht_list[:5] + [{
                    "upeerId": my_upeer_id, "publicKey": public_key_hex, "locationBlock": loc}]}
                send_pkt(sock, addr, exch)


def auto_connect_loop(sock, target_id_at_ip: str):
    parts = target_id_at_ip.split(
        '@', 1) if '@' in target_id_at_ip else target_id_at_ip.split(':', 1)
    if len(parts) != 2:
        return
    target_rid, target_ip = parts
    while True:
        if target_rid not in known_peers or 'pk' not in known_peers.get(target_rid, {}):
            send_handshake_req(sock, target_ip, target_rid)
        time.sleep(60)


def proactive_loop(sock):
    """Acciones periódicas del bot (ej. enviar mensaje si nos quedamos solos)."""
    while True:
        time.sleep(120)
        # Aquí podrías añadir lógica de envío espontáneo


if __name__ == "__main__":
    # Iniciar servidor en hilo aparte
    threading.Thread(target=main_server, daemon=True).start()

    # Latido
    threading.Thread(target=heartbeat_loop, args=(None,), daemon=True).start()

    # Si hay un peer inicial (BOOTSTRAP), conectamos
    boot = os.getenv("BOOTSTRAP_PEER")
    if boot:
        threading.Thread(target=auto_connect_loop,
                         args=(None, boot), daemon=True).start()

    # Mantener vivo
    while True:
        time.sleep(1)
