import socket
import json
import threading
import time
import os
import subprocess
import hashlib
import nacl.signing
import nacl.encoding

YGG_PORT = 50005
MY_NAME = "RevelNest_Bot_Test"

# Identity Generation
# In a real scenario, we'd load this from a file, but for a test bot, we generate on start
signing_key = nacl.signing.SigningKey.generate()
verify_key = signing_key.verify_key
public_key_hex = verify_key.encode(encoder=nacl.encoding.HexEncoder).decode()

def get_revelnest_id():
    pk_bytes = verify_key.encode()
    # BLAKE2b 16-byte hash for the RevelNest ID (matches new identity.ts behavior)
    return hashlib.blake2b(pk_bytes, digest_size=16).hexdigest()

my_revelnest_id = get_revelnest_id()

def get_ygg_ip():
    try:
        res = subprocess.check_output(["ip", "-6", "addr", "show"]).decode()
        for line in res.split('\n'):
            if "inet6 2" in line and "scope global" in line:
                return line.strip().split()[1].split('/')[0]
    except:
        return None

def sign_data(data):
    # USE COMPACT JSON (no spaces) to match Node.js behavior. 
    # ensure_ascii=False is critical to match JS JSON.stringify with non-ascii characters.
    msg_bytes = json.dumps(data, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()
    signature = signing_key.sign(msg_bytes)
    return signature.signature.hex()

def listen():
    sock = socket.socket(socket.AF_INET6, socket.SOCK_DGRAM)
    sock.bind(('::', YGG_PORT))
    print(f"[{MY_NAME}] Escuchando en el puerto {YGG_PORT}...")
    print(f"[{MY_NAME}] Mi RevelNest-ID es: {my_revelnest_id}")
    
    known_peers = {} # revelnestId -> publicKey

    while True:
        data, addr = sock.recvfrom(4096)
        try:
            full_packet = json.loads(data.decode())
            p_type = full_packet.get('type')
            print(f"[{MY_NAME}] RECIBIDO [{p_type}] de {addr[0]}")

            # 1. HANDSHAKE HANDLER
            if p_type == 'HANDSHAKE_REQ':
                sender_revelnest = full_packet.get('revelnestId')
                sender_pk = full_packet.get('publicKey')
                print(f"[{MY_NAME}] Petición de conexión de {sender_revelnest}. ACEPTANDO AUTOMÁTICAMENTE.")
                
                known_peers[sender_revelnest] = sender_pk
                
                # Respond with ACCEPT
                accept_data = {
                    "type": "HANDSHAKE_ACCEPT",
                    "revelnestId": my_revelnest_id,
                    "publicKey": public_key_hex
                }
                sock.sendto(json.dumps(accept_data, separators=(',', ':'), ensure_ascii=False).encode(), addr)
                continue

            # 2. SECURE MESSAGE HANDLER
            sender_revelnest = full_packet.get('senderRevelnestId')
            if not sender_revelnest or sender_revelnest not in known_peers:
                print(f"[{MY_NAME}] Paquete de origen desconocido o no autenticado. Ignorando.")
                continue

            # (Optional) Validate signature here for rigorous testing
            
            if p_type == 'PING':
                pong = { "type": "PONG" }
                full_pong = { **pong, "senderRevelnestId": my_revelnest_id, "signature": sign_data(pong) }
                sock.sendto(json.dumps(full_pong, separators=(',', ':'), ensure_ascii=False).encode(), addr)
            
            elif p_type == 'CHAT':
                print(f"[{MY_NAME}] Mensaje: {full_packet.get('content')}")
                
                # Send ACK
                if 'id' in full_packet:
                    ack = { "type": "ACK", "id": full_packet['id'] }
                    full_ack = { **ack, "senderRevelnestId": my_revelnest_id, "signature": sign_data(ack) }
                    sock.sendto(json.dumps(full_ack, separators=(',', ':'), ensure_ascii=False).encode(), addr)

                # Send Typing Simulation & Reply
                time.sleep(1)
                reply = {
                    "type": "CHAT",
                    "content": f"Bot: Recibido alto y claro. Tu RevelNest ID es {sender_revelnest}. Mi ubicación es {get_ygg_ip()}"
                }
                full_reply = { **reply, "senderRevelnestId": my_revelnest_id, "signature": sign_data(reply) }
                sock.sendto(json.dumps(full_reply, separators=(',', ':'), ensure_ascii=False).encode(), addr)

        except Exception as e:
            print(f"[{MY_NAME}] Error procesando: {e}")

if __name__ == "__main__":
    ip = get_ygg_ip()
    if not ip:
        print("Esperando IP...")
        for _ in range(5):
            time.sleep(2)
            ip = get_ygg_ip()
            if ip: break
            
    if ip:
        threading.Thread(target=listen, daemon=True).start()
        while True:
            time.sleep(1)
    else:
        print("No se encontró ubicación de red.")
