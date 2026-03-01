import socket
import json
import time
import os
import subprocess

YGG_PORT = 50005

def get_ygg_ip():
    try:
        res = subprocess.check_output(["ip", "-6", "addr", "show"]).decode()
        for line in res.split('\n'):
            if "inet6 2" in line and "scope global" in line:
                return line.strip().split()[1].split('/')[0]
    except:
        return None

def server():
    sock = socket.socket(socket.AF_INET6, socket.SOCK_DGRAM)
    sock.bind(('::', YGG_PORT))
    print("Servidor de Latencia P2P escuchando...")
    while True:
        data, addr = sock.recvfrom(4096)
        try:
            msg = json.loads(data.decode())
            if msg.get("type") == "PING_PERF":
                sock.sendto(data, addr)
        except:
            pass

def client(target_ip):
    sock = socket.socket(socket.AF_INET6, socket.SOCK_DGRAM)
    sock.settimeout(5.0)
    print(f"Iniciando prueba de rendimiento Yggdrasil hacia {target_ip}...")
    
    # Ping over Yggdrasil
    latencies = []
    
    # Warmup
    print("Calentando enrutamiento de la malla...")
    for _ in range(3):
        try:
            sock.sendto(json.dumps({"type": "PING_PERF", "seq": -1}).encode(), (target_ip, YGG_PORT))
            sock.recvfrom(4096)
        except:
            pass

    # Real Test
    for i in range(1, 11):
        req = json.dumps({"type": "PING_PERF", "seq": i}).encode()
        start_t = time.time()
        sock.sendto(req, (target_ip, YGG_PORT))
        try:
            data, _ = sock.recvfrom(4096)
            end_t = time.time()
            resp = json.loads(data.decode())
            if resp.get("seq") == i:
                rtt = (end_t - start_t) * 1000  # ms
                latencies.append(rtt)
                print(f"Paquete UDP cifrado {i}/10 => RTT: {rtt:.2f} ms")
        except socket.timeout:
            print(f"Paquete UDP cifrado {i}/10 => TIMEOUT (Perdido en el NAT)")
            
        time.sleep(1) # Interval

    if latencies:
        print("\n=== REPORTE DE RENDIMIENTO (RTT REAL NAT TRASNAT) ===")
        print(f"Total Paquetes Transmitidos: 10")
        print(f"Llegaron a destino (x2): {len(latencies)}")
        print(f"Pérdida de Paquetes (Packet Loss): {((10 - len(latencies))/10)*100:.0f}%")
        print(f"Latenia Mínima (Mejor Salto): {min(latencies):.2f} ms")
        print(f"Latenia Máxima (Peor Salto): {max(latencies):.2f} ms")
        print(f"Latenia Media (Promedio Kademlia): {(sum(latencies)/len(latencies)):.2f} ms")
    else:
        print("Toda la prueba falló. No hubo respuesta (Timeout/Packet Loss 100%).")

if __name__ == "__main__":
    ip = get_ygg_ip()
    while not ip:
        time.sleep(1)
        ip = get_ygg_ip()
        
    mode = os.environ.get("MODE", "SERVER")
    if mode == "SERVER":
        with open("/shared/server_perf.json", "w") as f:
            json.dump({"ip": ip}, f)
        server()
    else:
        target_ip = os.environ.get("TARGET_IP")
        if target_ip:
            client(target_ip)
        else:
            print("Client mode necesita TARGET_IP")
