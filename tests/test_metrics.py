#!/usr/bin/env python3
"""
Test rápido de métricas de nodos Docker
"""

import subprocess
import time
import json
import os
from subprocess import DEVNULL

def test_two_nodes():
    print("=== Test de 2 nodos RevelNest ===")
    
    # Limpiar contenedores previos
    subprocess.run(["docker", "rm", "-f", "p2p_test1", "p2p_test2"], 
                   stdout=DEVNULL, stderr=DEVNULL)
    
    # Crear directorio compartido
    shared_dir = "/tmp/test_p2p_metrics"
    os.makedirs(shared_dir, exist_ok=True)
    
    print("1. Iniciando nodo 1...")
    subprocess.run([
        "docker", "run", "-d",
        "--name", "p2p_test1",
        "--cap-add=NET_ADMIN",
        "--device=/dev/net/tun",
        "-v", f"{shared_dir}:/shared",
        "-e", "NODE_ENV_NAME=test1",
        "revelnest-bot"
    ], stdout=DEVNULL, stderr=DEVNULL)
    
    time.sleep(8)  # Esperar a que Yggdrasil se inicie
    
    # Leer información del nodo 1
    node1_info = None
    node1_file = f"{shared_dir}/test1.json"
    if os.path.exists(node1_file):
        with open(node1_file, 'r') as f:
            data = json.load(f)
            node1_id = data.get('id')
            node1_ip = data.get('ip')
            node1_info = f"{node1_id}@{node1_ip}"
            print(f"   Nodo 1: {node1_id[:8]}... @ {node1_ip}")
    
    print("2. Iniciando nodo 2...")
    cmd = [
        "docker", "run", "-d",
        "--name", "p2p_test2",
        "--cap-add=NET_ADMIN",
        "--device=/dev/net/tun",
        "-v", f"{shared_dir}:/shared",
        "-e", "NODE_ENV_NAME=test2",
    ]
    
    if node1_info:
        cmd.extend(["-e", f"TARGET_IDENTITY={node1_info}"])
    
    subprocess.run(cmd, stdout=DEVNULL, stderr=DEVNULL)
    
    print("3. Esperando 20 segundos para conexión...")
    time.sleep(20)
    
    print("4. Verificando archivos de métricas...")
    metrics_files = []
    for i in [1, 2]:
        metrics_file = f"{shared_dir}/test{i}_metrics.json"
        if os.path.exists(metrics_file):
            print(f"  - test{i}_metrics.json encontrado")
            with open(metrics_file, 'r') as f:
                try:
                    data = json.load(f)
                    messages_recv = data.get('messages_received', 0)
                    messages_sent = data.get('messages_sent', 0)
                    contacts = data.get('contacts_discovered', 0)
                    handshakes = data.get('handshakes_completed', 0)
                    packets = data.get('packets_received', 0)
                    print(f"    • Mensajes: {messages_sent} enviados, {messages_recv} recibidos")
                    print(f"    • Contactos descubiertos: {contacts}")
                    print(f"    • Handshakes completados: {handshakes}")
                    print(f"    • Paquetes recibidos: {packets}")
                    metrics_files.append(data)
                except Exception as e:
                    print(f"    • Error leyendo JSON: {e}")
        else:
            print(f"  - test{i}_metrics.json NO encontrado")
    
    print("5. Verificando logs...")
    for name in ["p2p_test1", "p2p_test2"]:
        result = subprocess.run(
            ["docker", "logs", name],
            capture_output=True,
            text=True
        )
        logs = result.stdout + result.stderr
        recv_count = logs.count("RECIBIDO")
        send_count = logs.count("Enviando")
        handshake_count = logs.count("Handshake")
        print(f"  - {name}:")
        print(f"    • {recv_count} RECIBIDO, {send_count} Enviando")
        print(f"    • Handshake mencionado {handshake_count} veces")
        if "Auto-conectando" in logs:
            print(f"    • Auto-conectando encontrado")
        if "Conexión ACEPTADA" in logs:
            print(f"    • Conexión aceptada encontrada")
        if "PEEREX Update" in logs:
            print(f"    • PEEREX Update encontrado (descubrimiento DHT)")
    
    print("6. Limpiando...")
    subprocess.run(["docker", "rm", "-f", "p2p_test1", "p2p_test2"], 
                   stdout=DEVNULL, stderr=DEVNULL)
    
    print("=== Test completado ===")
    success = len(metrics_files) == 2
    if success:
        print("✅ Ambos nodos reportaron métricas")
    else:
        print("❌ Algunos nodos no reportaron métricas")
    return success

if __name__ == "__main__":
    test_two_nodes()