#!/usr/bin/env python3
"""
Analizador de métricas de escalabilidad upeer
Lee los archivos de métricas generados por run_scalability_test.sh
y genera reportes y visualizaciones.
"""

import json
import glob
import os
import sys
from datetime import datetime
import matplotlib.pyplot as plt
import numpy as np

def load_metrics(shared_dir):
    """Carga todas las métricas de un directorio compartido"""
    metrics_files = glob.glob(os.path.join(shared_dir, "node*_metrics.json"))
    snapshots = glob.glob(os.path.join(shared_dir, "metrics_snapshot_*.json"))
    summary_file = os.path.join(shared_dir, "metrics_summary.json")
    
    print(f"📁 Directorio: {shared_dir}")
    print(f"📊 Archivos de métricas: {len(metrics_files)} nodos")
    print(f"📸 Snapshots: {len(snapshots)}")
    
    # Cargar métricas por nodo
    node_metrics = {}
    for mfile in metrics_files:
        node_name = os.path.basename(mfile).replace("_metrics.json", "")
        try:
            with open(mfile, 'r') as f:
                data = json.load(f)
                node_metrics[node_name] = data
        except Exception as e:
            print(f"Error cargando {mfile}: {e}")
    
    # Cargar summary si existe
    summary_data = []
    if os.path.exists(summary_file):
        try:
            with open(summary_file, 'r') as f:
                summary_data = json.load(f)
        except Exception as e:
            print(f"Error cargando summary: {e}")
    
    return {
        "node_metrics": node_metrics,
        "snapshots": snapshots,
        "summary": summary_data
    }

def generate_report(metrics_data):
    """Genera un reporte de análisis"""
    node_metrics = metrics_data["node_metrics"]
    summary = metrics_data["summary"]
    
    print("\n" + "="*60)
    print("📈 REPORTE DE ANÁLISIS upeer")
    print("="*60)
    
    # Estadísticas básicas
    print(f"\n📊 Estadísticas Generales:")
    print(f"   Nodos analizados: {len(node_metrics)}")
    
    if not node_metrics:
        print("   ❌ No hay métricas para analizar")
        return
    
    # Totales agregados
    totals = {
        "messages_sent": 0,
        "messages_received": 0,
        "dht_updates_sent": 0,
        "dht_updates_received": 0,
        "dht_exchanges_sent": 0,
        "dht_exchanges_received": 0,
        "contacts_discovered": 0,
        "handshakes_completed": 0,
        "acks_received": 0
    }
    
    for node, data in node_metrics.items():
        for key in totals:
            totals[key] += data.get(key, 0)
    
    print(f"\n📨 Tráfico de Red:")
    print(f"   Mensajes enviados: {totals['messages_sent']}")
    print(f"   Mensajes recibidos: {totals['messages_received']}")
    print(f"   ACKs recibidos: {totals['acks_received']}")
    
    print(f"\n🔄 Actividad DHT:")
    print(f"   Updates DHT enviados: {totals['dht_updates_sent']}")
    print(f"   Updates DHT recibidos: {totals['dht_updates_received']}")
    print(f"   Exchanges DHT enviados: {totals['dht_exchanges_sent']}")
    print(f"   Exchanges DHT recibidos: {totals['dht_exchanges_received']}")
    
    print(f"\n👥 Descubrimiento:")
    print(f"   Contactos descubiertos: {totals['contacts_discovered']}")
    print(f"   Handshakes completados: {totals['handshakes_completed']}")
    
    # Análisis de eficiencia de mensajes
    if totals['messages_sent'] > 0:
        delivery_rate = totals['acks_received'] / totals['messages_sent'] * 100
        print(f"\n✅ Eficiencia de Entrega:")
        print(f"   Tasa de entrega: {delivery_rate:.1f}%")
    
    # Análisis temporal si hay snapshots
    if len(summary) > 1:
        print(f"\n⏱️  Análisis Temporal:")
        print(f"   Período de muestreo: {len(summary)} snapshots")
        
        # Extraer métricas a lo largo del tiempo
        timestamps = []
        total_messages = []
        total_contacts = []
        
        for i, snapshot in enumerate(summary):
            if isinstance(snapshot, dict):
                # Calcular totales para este snapshot
                msg_total = 0
                contacts_total = 0
                
                for node, data in snapshot.items():
                    if node != "timestamp" and node.startswith("node"):
                        msg_total += data.get("messages_sent", 0) + data.get("messages_received", 0)
                        contacts_total += data.get("contacts_discovered", 0)
                
                timestamps.append(i)
                total_messages.append(msg_total)
                total_contacts.append(contacts_total)
        
        if timestamps:
            print(f"   Mensajes totales acumulados: {total_messages[-1]}")
            print(f"   Contactos descubiertos acumulados: {total_contacts[-1]}")
            
            # Calcular tasa de descubrimiento
            if len(total_contacts) > 1 and timestamps[-1] > 0:
                discovery_rate = total_contacts[-1] / timestamps[-1]
                print(f"   Tasa de descubrimiento: {discovery_rate:.2f} contactos/snapshot")

def plot_metrics(metrics_data, output_dir):
    """Genera gráficas de las métricas"""
    summary = metrics_data["summary"]
    
    if len(summary) < 2:
        print("No hay suficientes datos para graficar")
        return
    
    # Preparar datos
    timestamps = []
    messages_sent = []
    messages_received = []
    contacts_discovered = []
    dht_exchanges = []
    
    for i, snapshot in enumerate(summary):
        if isinstance(snapshot, dict):
            sent = 0
            received = 0
            contacts = 0
            exchanges = 0
            
            for node, data in snapshot.items():
                if node != "timestamp" and node.startswith("node"):
                    sent += data.get("messages_sent", 0)
                    received += data.get("messages_received", 0)
                    contacts += data.get("contacts_discovered", 0)
                    exchanges += data.get("dht_exchanges_received", 0)
            
            timestamps.append(i)
            messages_sent.append(sent)
            messages_received.append(received)
            contacts_discovered.append(contacts)
            dht_exchanges.append(exchanges)
    
    # Crear gráficos
    fig, axes = plt.subplots(2, 2, figsize=(12, 10))
    
    # Gráfico 1: Mensajes
    axes[0, 0].plot(timestamps, messages_sent, 'b-', label='Enviados', linewidth=2)
    axes[0, 0].plot(timestamps, messages_received, 'g-', label='Recibidos', linewidth=2)
    axes[0, 0].set_title('Tráfico de Mensajes')
    axes[0, 0].set_xlabel('Snapshot')
    axes[0, 0].set_ylabel('Mensajes')
    axes[0, 0].legend()
    axes[0, 0].grid(True, alpha=0.3)
    
    # Gráfico 2: Contactos descubiertos
    axes[0, 1].plot(timestamps, contacts_discovered, 'r-', linewidth=2)
    axes[0, 1].set_title('Contactos Descubiertos')
    axes[0, 1].set_xlabel('Snapshot')
    axes[0, 1].set_ylabel('Contactos')
    axes[0, 1].grid(True, alpha=0.3)
    
    # Gráfico 3: Actividad DHT
    axes[1, 0].plot(timestamps, dht_exchanges, 'm-', linewidth=2)
    axes[1, 0].set_title('Exchanges DHT')
    axes[1, 0].set_xlabel('Snapshot')
    axes[1, 0].set_ylabel('Exchanges')
    axes[1, 0].grid(True, alpha=0.3)
    
    # Gráfico 4: Tasa de descubrimiento
    if len(timestamps) > 1:
        discovery_rates = []
        for i in range(1, len(contacts_discovered)):
            rate = contacts_discovered[i] - contacts_discovered[i-1]
            discovery_rates.append(rate)
        
        axes[1, 1].plot(timestamps[1:], discovery_rates, 'c-', linewidth=2)
        axes[1, 1].set_title('Tasa de Descubrimiento')
        axes[1, 1].set_xlabel('Snapshot')
        axes[1, 1].set_ylabel('Contactos/snapshot')
        axes[1, 1].grid(True, alpha=0.3)
    
    plt.tight_layout()
    output_path = os.path.join(output_dir, "metrics_analysis.png")
    plt.savefig(output_path, dpi=150)
    print(f"📊 Gráficos guardados en: {output_path}")
    
    # Guardar datos procesados
    data_output = {
        "timestamps": timestamps,
        "messages_sent": messages_sent,
        "messages_received": messages_received,
        "contacts_discovered": contacts_discovered,
        "dht_exchanges": dht_exchanges
    }
    
    data_path = os.path.join(output_dir, "processed_metrics.json")
    with open(data_path, 'w') as f:
        json.dump(data_output, f, indent=2)
    
    plt.close()

def analyze_network_topology(shared_dir):
    """Analiza la topología de la red basada en los logs"""
    print(f"\n🌐 Análisis de Topología:")
    
    # Leer archivos JSON de nodos
    node_files = glob.glob(os.path.join(shared_dir, "node*.json"))
    nodes = {}
    
    for nfile in node_files:
        node_name = os.path.basename(nfile).replace(".json", "")
        try:
            with open(nfile, 'r') as f:
                data = json.load(f)
                nodes[node_name] = data
        except:
            continue
    
    print(f"   Nodos encontrados: {len(nodes)}")
    
    # Mostrar información básica de nodos
    for name, data in list(nodes.items())[:5]:  # Mostrar primeros 5
        print(f"   - {name}: {data.get('id', '')[:8]}... @ {data.get('ip', '')[:20]}...")
    
    if len(nodes) > 5:
        print(f"   ... y {len(nodes) - 5} más")

def main():
    if len(sys.argv) < 2:
        # Buscar el directorio más reciente
        shared_dirs = glob.glob("/tmp/p2p_scalability_*")
        if not shared_dirs:
            print("❌ No se encontraron directorios de métricas")
            print("Uso: python analyze_metrics.py <directorio_shared>")
            return
        
        shared_dirs.sort(key=os.path.getmtime, reverse=True)
        shared_dir = shared_dirs[0]
        print(f"🔍 Usando directorio más reciente: {shared_dir}")
    else:
        shared_dir = sys.argv[1]
    
    if not os.path.exists(shared_dir):
        print(f"❌ Directorio no encontrado: {shared_dir}")
        return
    
    # Cargar métricas
    metrics_data = load_metrics(shared_dir)
    
    # Generar reporte
    generate_report(metrics_data)
    
    # Analizar topología
    analyze_network_topology(shared_dir)
    
    # Generar gráficos (si hay suficientes datos)
    try:
        plot_metrics(metrics_data, shared_dir)
    except Exception as e:
        print(f"⚠️  No se pudieron generar gráficos: {e}")
    
    print("\n" + "="*60)
    print("✅ Análisis completado")
    print("="*60)

if __name__ == "__main__":
    main()