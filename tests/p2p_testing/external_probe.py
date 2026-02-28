import socket
import json
import time
import sys
import subprocess

# Esta es tu IP (la que copiaste de la App)
TARGET_IP = "200:7704:49e5:b4cd:7910:2191:2574:351b"
YGG_PORT = 50005

MESSAGE = {
    "type": "CHAT",
    "content": "¡Validación P2P Exitosa! Este mensaje ha sido enviado desde un script externo."
}

def send_test():
    # Creamos un socket UDP para IPv6
    sock = socket.socket(socket.AF_INET6, socket.SOCK_DGRAM)
    payload = json.dumps(MESSAGE).encode('utf-8')
    
    print(f"Enviando paquete UDP a [{TARGET_IP}]:{YGG_PORT}...")
    try:
        sock.sendto(payload, (TARGET_IP, YGG_PORT))
        print("Paquete enviado. Comprueba tu App de chat.")
    except Exception as e:
        print(f"Error enviando el paquete: {e}")
    finally:
        sock.close()

if __name__ == "__main__":
    if TARGET_IP == "REEMPLAZA_CON_TU_IP_200_O_205":
        print("ERROR: Debes poner tu IP en la variable TARGET_IP del script.")
        sys.exit(1)
    send_test()
