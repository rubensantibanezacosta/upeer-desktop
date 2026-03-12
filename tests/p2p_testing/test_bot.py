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

# Configuration
YGG_PORT = 50005
MY_NAME = "RevelNest_TestBot"
TARGET_IDENTITY = os.environ.get("TARGET_IDENTITY") # e.g. "id@ip"

# Identity Persistence
KEY_FILE = "/shared/test_bot_key.bin"
if os.path.exists(KEY_FILE):
    with open(KEY_FILE, "rb") as f:
        signing_key_seed = f.read()
    signing_key = nacl.signing.SigningKey(signing_key_seed)
    print(f"[Identity] Loaded existing identity")
else:
    signing_key = nacl.signing.SigningKey.generate()
    os.makedirs("/shared", exist_ok=True)
    with open(KEY_FILE, "wb") as f:
        f.write(bytes(signing_key))
    print(f"[Identity] Generated new identity")

verify_key = signing_key.verify_key
public_key_hex = verify_key.encode(encoder=nacl.encoding.HexEncoder).decode()
my_upeer_id = hashlib.blake2b(verify_key.encode(), digest_size=16).hexdigest()
my_private_key = signing_key.to_curve25519_private_key()
my_public_key = verify_key.to_curve25519_public_key()

known_peers = {} # upeerId -> info

def get_ygg_ip():
    try:
        res = subprocess.check_output(["ip", "-6", "addr", "show"]).decode()
        for line in res.split('\n'):
            if ("inet6 2" in line or "inet6 3" in line) and "scope global" in line:
                return line.strip().split()[1].split('/')[0]
    except:
        return None

def sign_data(data):
    msg_bytes = json.dumps(data, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()
    signature = signing_key.sign(msg_bytes)
    return signature.signature.hex()

def generate_light_proof(upeer_id):
    import hashlib
    for nonce in range(100000):
        proof = hex(nonce)[2:]
        hash_input = (upeer_id + proof).encode()
        if hashlib.sha256(hash_input).hexdigest().startswith('0'):
            return proof
    return hex(int(time.time() * 1000))[2:]

def generate_location_block(ip, seq=1):
    data = {"upeerId": my_upeer_id, "address": ip, "dhtSeq": seq}
    sig = sign_data(data)
    expires_at = int((time.time() + 30 * 24 * 60 * 60) * 1000)
    return {"address": ip, "dhtSeq": seq, "signature": sig, "expiresAt": expires_at}

def send_packet(sock, addr, data):
    my_ip = get_ygg_ip() or ""
    payload_to_sign = {
        **data,
        "senderUpeerId": my_upeer_id,
        "senderYggAddress": my_ip
    }
    full_packet = {
        **payload_to_sign,
        "signature": sign_data(payload_to_sign)
    }
    msg_str = json.dumps(full_packet, separators=(',', ':'), ensure_ascii=False)
    sock.sendto(msg_str.encode(), (addr, YGG_PORT))

def handle_packet(sock, data, addr):
    try:
        packet = json.loads(data.decode())
        p_type = packet.get('type')
        sender_id = packet.get('senderUpeerId')
        
        print(f"[Bot] Received {p_type} from {sender_id} @ {addr[0]}")

        if p_type == 'HANDSHAKE_REQ':
            known_peers[sender_id] = {
                "pk": packet.get('publicKey'),
                "ephemeral_pk": packet.get('ephemeralPublicKey'),
                "address": addr[0]
            }
            # Accept Handshake
            accept_data = {
                "type": "HANDSHAKE_ACCEPT",
                "publicKey": public_key_hex,
                "ephemeralPublicKey": my_public_key.encode(encoder=nacl.encoding.HexEncoder).decode()
            }
            send_packet(sock, addr[0], accept_data)
            print(f"[Bot] Handshake Accepted for {sender_id}")
            
            # Send initial message
            time.sleep(1)
            send_chat(sock, sender_id, "¡Hola! Soy tu compañero de pruebas Dockerizado. He aceptado tu conexión automáticamente.")

        elif p_type == 'HANDSHAKE_ACCEPT':
            sender_pk = packet.get('publicKey')
            sender_ephemeral = packet.get('ephemeralPublicKey')
            print(f"[Bot] Handshake ACCEPTED by {sender_id}. Auto-connecting success!")
            known_peers[sender_id] = {
                "pk": sender_pk,
                "ephemeral_pk": sender_ephemeral,
                "address": addr[0]
            }

        elif p_type == 'CHAT':
            msg_id = packet.get('id')
            content = packet.get('content')
            
            # E2EE Decrypt if needed
            if 'nonce' in packet:
                try:
                    use_eph = packet.get('useRecipientEphemeral')
                    peer = known_peers.get(sender_id)
                    if peer:
                        target_pk_hex = peer['ephemeral_pk'] if use_eph else peer['pk']
                        target_pk = nacl.public.PublicKey(target_pk_hex, encoder=nacl.encoding.HexEncoder)
                        target_curve_pk = target_pk if use_eph else target_pk.to_curve25519_public_key()
                        box = nacl.public.Box(my_private_key, target_curve_pk)
                        nonce = bytes.fromhex(packet['nonce'])
                        ciphertext = bytes.fromhex(content)
                        decrypted = box.decrypt(ciphertext, nonce)
                        content = decrypted.decode()
                except Exception as e:
                    print(f"[Bot] Decryption error: {e}")

            print(f"[Bot] Message from {sender_id}: {content}")

            # Send ACK (Delivered)
            if msg_id:
                send_packet(sock, addr[0], {"type": "ACK", "id": msg_id})
                
                # Send READ (Read) after 2 seconds
                def late_read():
                    time.sleep(2)
                    send_packet(sock, addr[0], {"type": "READ", "id": msg_id})
                    print(f"[Bot] Sent READ receipt for {msg_id}")
                threading.Thread(target=late_read, daemon=True).start()

            # Command processing
            if "hola" in content.lower():
                send_chat(sock, sender_id, "¡Qué tal! Todo bien por aquí en Docker.")
            elif "archivo" in content.lower() or "file" in content.lower():
                send_chat(sock, sender_id, "Voy a enviarte un archivo de prueba...")
                threading.Thread(target=start_file_proposal, args=(sock, sender_id, addr[0]), daemon=True).start()

        elif p_type == 'FILE_PROPOSAL':
            print(f"[Bot] File proposed: {packet.get('fileName')} ({packet.get('fileSize')} bytes)")
            
            file_id = packet.get('fileId')
            total_chunks = packet.get('totalChunks', 1)
            received_files[file_id] = {
                "totalChunks": total_chunks,
                "receivedChunks": set()
            }
            
            # Accept immediately
            send_packet(sock, addr[0], {"type": "FILE_ACCEPT", "fileId": file_id})
            print(f"[Bot] File Accepted: {file_id}")

        elif p_type == 'FILE_ACCEPT':
            file_id = packet.get('fileId')
            print(f"[Bot] Receiver ACCEPTED file {file_id}. Sending data...")
            if file_id in pending_files:
                threading.Thread(target=send_file_data, args=(sock, addr[0], file_id), daemon=True).start()

        elif p_type == 'FILE_CHUNK':
            file_id = packet.get('fileId')
            chunk_index = packet.get('chunkIndex')
            
            # We don't actually save chunks, just ACK them to keep the flow going
            send_packet(sock, addr[0], {
                "type": "FILE_CHUNK_ACK",
                "fileId": file_id,
                "chunkIndex": chunk_index
            })
            # print(f"[Bot] Sent FILE_CHUNK_ACK for chunk {chunk_index}")
            
            # Track progress
            if file_id in received_files:
                received_files[file_id]["receivedChunks"].add(chunk_index)
                if len(received_files[file_id]["receivedChunks"]) >= received_files[file_id]["totalChunks"]:
                    print(f"[Bot] All {received_files[file_id]['totalChunks']} chunks received for {file_id}. Sending FILE_DONE_ACK...")
                    
                    def send_done_delayed():
                        time.sleep(0.5)
                        send_packet(sock, addr[0], {
                            "type": "FILE_DONE_ACK",
                            "fileId": file_id
                        })
                        print(f"[Bot] Sent FILE_DONE_ACK for {file_id}")
                        
                    threading.Thread(target=send_done_delayed, daemon=True).start()
                    del received_files[file_id]

        elif p_type == 'FILE_CHUNK_ACK':
            # Progress tracking (simplified)
            pass

        elif p_type == 'FILE_DONE_ACK':
            print(f"[Bot] File transfer confirmed by peer: {packet.get('fileId')}")

    except Exception as e:
        print(f"[Bot] Error processing packet: {e}")

pending_files = {} # fileId -> content
received_files = {} # fileId -> {"totalChunks": int, "receivedChunks": set}

def start_file_proposal(sock, target_rid, target_ip):
    time.sleep(2)
    file_id = hashlib.md5(f"dummy-{time.time()}".encode()).hexdigest()
    file_name = "test_upeer.txt"
    content = b"Este es un archivo de prueba generado por el Bot Dockerizado.\n" * 50
    file_size = len(content)
    
    pending_files[file_id] = content
    
    proposal = {
        "type": "FILE_PROPOSAL",
        "fileId": file_id,
        "fileName": file_name,
        "fileSize": file_size,
        "mimeType": "text/plain",
        "totalChunks": 1,
        "chunkSize": 16384,
        "fileHash": hashlib.sha256(content).hexdigest()
    }
    send_packet(sock, target_ip, proposal)
    print(f"[Bot] Proposed file {file_name} to {target_id}")

def send_file_data(sock, target_ip, file_id):
    content = pending_files.pop(file_id, None)
    if not content: return
    
    time.sleep(1)
    chunk = {
        "type": "FILE_CHUNK",
        "fileId": file_id,
        "chunkIndex": 0,
        "data": nacl.encoding.Base64Encoder.encode(content).decode()
    }
    send_packet(sock, target_ip, chunk)
    print(f"[Bot] Sent chunk 0 for {file_id}")
    
    # End of transfer
    time.sleep(0.5)
    send_packet(sock, target_ip, {"type": "FILE_END", "fileId": file_id})
    print(f"[Bot] Sent FILE_END for {file_id}")

def send_chat(sock, target_rid, text):
    peer = known_peers.get(target_rid)
    if not peer: return
    
    msg_id = hashlib.md5(f"{time.time()}{text}".encode()).hexdigest()
    
    # Encrypt E2EE (PFS)
    target_pk_hex = peer.get('ephemeral_pk') or peer['pk']
    target_pk = nacl.public.PublicKey(target_pk_hex, encoder=nacl.encoding.HexEncoder)
    target_curve_pk = target_pk if peer.get('ephemeral_pk') else target_pk.to_curve25519_public_key()
    
    box = nacl.public.Box(my_private_key, target_curve_pk)
    nonce = nacl.utils.random(nacl.public.Box.NONCE_SIZE)
    encrypted = box.encrypt(text.encode(), nonce)
    
    data = {
        "type": "CHAT",
        "id": msg_id,
        "content": encrypted.ciphertext.hex(),
        "nonce": nonce.hex(),
        "ephemeralPublicKey": my_public_key.encode(encoder=nacl.encoding.HexEncoder).decode(),
        "useRecipientEphemeral": bool(peer.get('ephemeral_pk'))
    }
    send_packet(sock, peer['address'], data)
    print(f"[Bot] Sent chat: {text}")

def auto_connect(sock):
    if not TARGET_IDENTITY: return
    rid, ip = TARGET_IDENTITY.split('@')
    print(f"[Bot] Auto-connecting to {rid} @ {ip}")
    
    while True:
        if rid not in known_peers:
            handshake = {
                "type": "HANDSHAKE_REQ",
                "publicKey": public_key_hex,
                "ephemeralPublicKey": my_public_key.encode(encoder=nacl.encoding.HexEncoder).decode(),
                "alias": MY_NAME,
                "powProof": generate_light_proof(my_upeer_id)
            }
            send_packet(sock, ip, handshake)
        time.sleep(30)

def heartbeat(sock):
    while True:
        time.sleep(30)
        my_ip = get_ygg_ip()
        if not my_ip: continue
        
        # Announce location
        loc = generate_location_block(my_ip)
        update = {"type": "DHT_UPDATE", "locationBlock": loc}
        
        for rid, peer in known_peers.items():
            send_packet(sock, peer['address'], update)
            # Also send PING
            send_packet(sock, peer['address'], {"type": "PING"})

if __name__ == "__main__":
    my_ip = get_ygg_ip()
    if not my_ip:
        print("[Bot] Could not find Yggdrasil IP. Make sure Yggdrasil is running.")
        exit(1)
        
    print(f"[Bot] My Identity: {my_upeer_id}@{my_ip}")
    
    sock = socket.socket(socket.AF_INET6, socket.SOCK_DGRAM)
    sock.bind(('::', YGG_PORT))
    
    threading.Thread(target=auto_connect, args=(sock,), daemon=True).start()
    threading.Thread(target=heartbeat, args=(sock,), daemon=True).start()
    
    print(f"[Bot] Listening on port {YGG_PORT}...")
    while True:
        data, addr = sock.recvfrom(65535)
        threading.Thread(target=handle_packet, args=(sock, data, addr), daemon=True).start()
