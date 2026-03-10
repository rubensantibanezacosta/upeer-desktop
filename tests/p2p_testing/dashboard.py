#!/usr/bin/env python3
"""
Dashboard web para monitorización en tiempo real de tests upeer
"""

import json
import os
import glob
from datetime import datetime
from flask import Flask, render_template, jsonify, send_file
import threading
import time

app = Flask(__name__)

# Configuración
MONITOR_DIR = "/tmp"  # Directorio donde se crean los p2p_scalability_*
REFRESH_INTERVAL = 5  # Segundos entre actualizaciones

def find_latest_test_dir():
    """Encuentra el directorio de test más reciente"""
    test_dirs = glob.glob(os.path.join(MONITOR_DIR, "p2p_scalability_*"))
    if not test_dirs:
        return None
    # Ordenar por tiempo de modificación (más reciente primero)
    test_dirs.sort(key=os.path.getmtime, reverse=True)
    return test_dirs[0]

def load_test_data(test_dir):
    """Carga los datos del test desde el directorio"""
    if not test_dir or not os.path.exists(test_dir):
        return None
    
    data = {
        "test_dir": test_dir,
        "timestamp": datetime.fromtimestamp(os.path.getmtime(test_dir)).isoformat(),
        "nodes": [],
        "metrics": {},
        "latest_snapshot": {},
        "summary_stats": {}
    }
    
    # Cargar información de nodos
    node_files = glob.glob(os.path.join(test_dir, "node*.json"))
    for nfile in node_files:
        node_name = os.path.basename(nfile).replace(".json", "")
        try:
            with open(nfile, 'r') as f:
                node_data = json.load(f)
                node_data["name"] = node_name
                data["nodes"].append(node_data)
        except:
            continue
    
    # Cargar métricas más recientes
    metrics_files = glob.glob(os.path.join(test_dir, "node*_metrics.json"))
    for mfile in metrics_files:
        node_name = os.path.basename(mfile).replace("_metrics.json", "")
        try:
            with open(mfile, 'r') as f:
                metrics = json.load(f)
                data["metrics"][node_name] = metrics
        except:
            continue
    
    # Cargar snapshot más reciente
    snapshot_files = glob.glob(os.path.join(test_dir, "metrics_snapshot_*.json"))
    if snapshot_files:
        snapshot_files.sort(key=os.path.getmtime, reverse=True)
        try:
            with open(snapshot_files[0], 'r') as f:
                data["latest_snapshot"] = json.load(f)
        except:
            pass
    
    # Calcular estadísticas resumidas
    totals = {
        "messages_sent": 0,
        "messages_received": 0,
        "dht_updates_sent": 0,
        "dht_updates_received": 0,
        "dht_exchanges_sent": 0,
        "dht_exchanges_received": 0,
        "contacts_discovered": 0,
        "handshakes_completed": 0,
        "acks_received": 0,
        "total_nodes": len(data["nodes"])
    }
    
    for node_metrics in data["metrics"].values():
        for key in totals:
            if key != "total_nodes":
                totals[key] += node_metrics.get(key, 0)
    
    data["summary_stats"] = totals
    
    # Calcular eficiencia si hay mensajes enviados
    if totals["messages_sent"] > 0:
        data["summary_stats"]["delivery_rate"] = (totals["acks_received"] / totals["messages_sent"]) * 100
    else:
        data["summary_stats"]["delivery_rate"] = 0
    
    return data

@app.route('/')
def index():
    """Página principal del dashboard"""
    test_dir = find_latest_test_dir()
    test_data = load_test_data(test_dir)
    
    if not test_data:
        return render_template('dashboard.html', 
                             test_found=False,
                             test_dir=None)
    
    return render_template('dashboard.html',
                         test_found=True,
                         test_dir=test_data["test_dir"],
                         timestamp=test_data["timestamp"],
                         total_nodes=test_data["summary_stats"]["total_nodes"],
                         summary_stats=test_data["summary_stats"],
                         nodes=test_data["nodes"][:10])  # Mostrar solo primeros 10 nodos

@app.route('/api/test-data')
def api_test_data():
    """API para obtener datos del test en JSON"""
    test_dir = find_latest_test_dir()
    test_data = load_test_data(test_dir)
    
    if not test_data:
        return jsonify({"error": "No test data found"}), 404
    
    return jsonify(test_data)

@app.route('/api/metrics-history')
def api_metrics_history():
    """API para obtener historial de métricas"""
    test_dir = find_latest_test_dir()
    if not test_dir:
        return jsonify({"error": "No test directory found"}), 404
    
    # Cargar todos los snapshots
    snapshot_files = glob.glob(os.path.join(test_dir, "metrics_snapshot_*.json"))
    snapshots = []
    
    for sfile in sorted(snapshot_files, key=os.path.getmtime):
        try:
            with open(sfile, 'r') as f:
                snapshot_data = json.load(f)
                # Extraer solo los datos relevantes para gráficos
                processed = {
                    "timestamp": snapshot_data.get("timestamp"),
                    "total_messages": 0,
                    "total_contacts": 0,
                    "total_dht_exchanges": 0
                }
                
                # Sumar métricas de todos los nodos
                for key, value in snapshot_data.items():
                    if key.startswith("node") and isinstance(value, dict):
                        processed["total_messages"] += value.get("messages_sent", 0) + value.get("messages_received", 0)
                        processed["total_contacts"] += value.get("contacts_discovered", 0)
                        processed["total_dht_exchanges"] += value.get("dht_exchanges_received", 0)
                
                snapshots.append(processed)
        except:
            continue
    
    return jsonify({
        "snapshots": snapshots,
        "test_dir": test_dir
    })

@app.route('/api/node/<node_name>')
def api_node_details(node_name):
    """API para obtener detalles de un nodo específico"""
    test_dir = find_latest_test_dir()
    if not test_dir:
        return jsonify({"error": "No test directory found"}), 404
    
    # Cargar información del nodo
    node_file = os.path.join(test_dir, f"{node_name}.json")
    metrics_file = os.path.join(test_dir, f"{node_name}_metrics.json")
    
    node_data = {}
    
    if os.path.exists(node_file):
        try:
            with open(node_file, 'r') as f:
                node_data["info"] = json.load(f)
        except:
            node_data["info"] = {}
    
    if os.path.exists(metrics_file):
        try:
            with open(metrics_file, 'r') as f:
                node_data["metrics"] = json.load(f)
        except:
            node_data["metrics"] = {}
    
    return jsonify(node_data)

@app.route('/api/logs')
def api_logs():
    """API para obtener logs recientes"""
    # Intentar encontrar logs del test actual
    log_file = "/tmp/scalability_15nodes_full.log"
    logs = []
    
    if os.path.exists(log_file):
        try:
            # Leer últimas 50 líneas
            with open(log_file, 'r') as f:
                lines = f.readlines()[-50:]
                logs = [line.strip() for line in lines if line.strip()]
        except:
            logs = ["Error reading log file"]
    
    return jsonify({"logs": logs})

# Plantilla HTML embebida para simplicidad
HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>upeer Scalability Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        
        body {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
            color: #333;
        }
        
        .dashboard-container {
            max-width: 1400px;
            margin: 0 auto;
            background: rgba(255, 255, 255, 0.95);
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            overflow: hidden;
        }
        
        .header {
            background: linear-gradient(90deg, #2196F3, #21CBF3);
            color: white;
            padding: 30px 40px;
            text-align: center;
        }
        
        .header h1 {
            font-size: 2.8rem;
            margin-bottom: 10px;
            font-weight: 700;
        }
        
        .header p {
            font-size: 1.2rem;
            opacity: 0.9;
        }
        
        .status-badge {
            display: inline-block;
            background: #4CAF50;
            color: white;
            padding: 8px 20px;
            border-radius: 50px;
            font-weight: bold;
            margin-top: 15px;
            box-shadow: 0 4px 15px rgba(76, 175, 80, 0.4);
        }
        
        .content {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
            padding: 40px;
        }
        
        @media (max-width: 1100px) {
            .content {
                grid-template-columns: 1fr;
            }
        }
        
        .card {
            background: white;
            border-radius: 15px;
            padding: 25px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
            border: 1px solid #eaeaea;
            transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        
        .card:hover {
            transform: translateY(-5px);
            box-shadow: 0 15px 40px rgba(0, 0, 0, 0.12);
        }
        
        .card h2 {
            color: #2196F3;
            margin-bottom: 20px;
            font-size: 1.5rem;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .card h2 i {
            font-size: 1.8rem;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 20px;
            margin-top: 20px;
        }
        
        .stat-item {
            text-align: center;
            padding: 20px;
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            border-radius: 12px;
        }
        
        .stat-value {
            font-size: 2.5rem;
            font-weight: 800;
            color: #2196F3;
            margin-bottom: 5px;
        }
        
        .stat-label {
            font-size: 0.9rem;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        
        .chart-container {
            height: 300px;
            margin-top: 20px;
            position: relative;
        }
        
        .nodes-list {
            max-height: 400px;
            overflow-y: auto;
        }
        
        .node-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 15px;
            border-bottom: 1px solid #eee;
            transition: background 0.2s;
        }
        
        .node-item:hover {
            background: #f9f9f9;
        }
        
        .node-id {
            font-family: monospace;
            background: #f1f1f1;
            padding: 5px 10px;
            border-radius: 6px;
            font-size: 0.9rem;
        }
        
        .node-ip {
            color: #666;
            font-size: 0.9rem;
        }
        
        .refresh-btn {
            background: linear-gradient(90deg, #2196F3, #21CBF3);
            color: white;
            border: none;
            padding: 12px 30px;
            border-radius: 50px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 10px;
            margin: 20px auto;
            transition: all 0.3s ease;
        }
        
        .refresh-btn:hover {
            transform: scale(1.05);
            box-shadow: 0 10px 25px rgba(33, 150, 243, 0.4);
        }
        
        .footer {
            text-align: center;
            padding: 20px;
            color: #666;
            border-top: 1px solid #eee;
            font-size: 0.9rem;
        }
        
        .no-data {
            text-align: center;
            padding: 60px 20px;
            color: #666;
        }
        
        .no-data h2 {
            color: #ff9800;
            margin-bottom: 20px;
        }
    </style>
</head>
<body>
    <div class="dashboard-container">
        <div class="header">
            <h1>🌐 upeer Scalability Dashboard</h1>
            <p>Real-time monitoring of P2P network tests</p>
            {% if test_found %}
            <div class="status-badge">✅ TEST ACTIVE - {{ total_nodes }} Nodes Running</div>
            <p style="margin-top: 15px; font-size: 0.9rem;">Test directory: {{ test_dir }}</p>
            <p style="font-size: 0.9rem;">Started: {{ timestamp }}</p>
            {% else %}
            <div class="status-badge" style="background: #ff9800;">⏳ NO ACTIVE TEST FOUND</div>
            <p style="margin-top: 15px;">Run a scalability test to see metrics here</p>
            {% endif %}
        </div>
        
        {% if test_found %}
        <div class="content">
            <!-- Left Column: Statistics -->
            <div class="card">
                <h2>📊 Network Statistics</h2>
                <div class="stats-grid">
                    <div class="stat-item">
                        <div class="stat-value">{{ summary_stats.total_nodes }}</div>
                        <div class="stat-label">Active Nodes</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">{{ summary_stats.messages_sent }}</div>
                        <div class="stat-label">Messages Sent</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">{{ summary_stats.messages_received }}</div>
                        <div class="stat-label">Messages Received</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">{{ summary_stats.acks_received }}</div>
                        <div class="stat-label">ACKs Received</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">{{ "%.1f"|format(summary_stats.delivery_rate) }}%</div>
                        <div class="stat-label">Delivery Rate</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">{{ summary_stats.contacts_discovered }}</div>
                        <div class="stat-label">Contacts Found</div>
                    </div>
                </div>
            </div>
            
            <!-- Right Column: DHT Activity -->
            <div class="card">
                <h2>🔄 DHT Protocol Activity</h2>
                <div class="stats-grid">
                    <div class="stat-item">
                        <div class="stat-value">{{ summary_stats.dht_updates_sent }}</div>
                        <div class="stat-label">Updates Sent</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">{{ summary_stats.dht_updates_received }}</div>
                        <div class="stat-label">Updates Received</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">{{ summary_stats.dht_exchanges_sent }}</div>
                        <div class="stat-label">Exchanges Sent</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">{{ summary_stats.dht_exchanges_received }}</div>
                        <div class="stat-label">Exchanges Received</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">{{ summary_stats.handshakes_completed }}</div>
                        <div class="stat-label">Handshakes</div>
                    </div>
                </div>
            </div>
            
            <!-- Full Width: Charts -->
            <div class="card" style="grid-column: 1 / -1;">
                <h2>📈 Activity Over Time</h2>
                <div class="chart-container">
                    <canvas id="activityChart"></canvas>
                </div>
            </div>
            
            <!-- Left Column: Node List -->
            <div class="card">
                <h2>🖥️ Active Nodes ({{ nodes|length }})</h2>
                <div class="nodes-list">
                    {% for node in nodes %}
                    <div class="node-item">
                        <div>
                            <strong>{{ node.name }}</strong>
                            <div class="node-id">{{ node.id[:8] }}...{{ node.id[-8:] }}</div>
                        </div>
                        <div class="node-ip">{{ node.ip[:20] }}...</div>
                    </div>
                    {% endfor %}
                </div>
            </div>
            
            <!-- Right Column: Real-time Updates -->
            <div class="card">
                <h2>⚡ Real-time Metrics</h2>
                <div id="realtimeMetrics">
                    <p>Loading real-time data...</p>
                </div>
                <button class="refresh-btn" onclick="loadData()">
                    🔄 Refresh Now
                </button>
                <p style="margin-top: 15px; font-size: 0.9rem; color: #666;">
                    Auto-refreshing every 5 seconds
                </p>
            </div>
        </div>
        {% else %}
        <div class="no-data">
            <h2>No active test found</h2>
            <p>To start monitoring, run a scalability test:</p>
            <pre style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px auto; max-width: 600px; text-align: left;">
cd /home/rubendev/Proyectos/chat-p2p
./tests/p2p_testing/run_scalability_test.sh 15 tree 120</pre>
            <p>Or check existing test directories in /tmp/p2p_scalability_*</p>
        </div>
        {% endif %}
        
        <div class="footer">
            <p>upeer P2P Chat • Scalability Monitoring Dashboard • Updated: <span id="updateTime"></span></p>
            <p style="margin-top: 5px; font-size: 0.8rem;">Metrics update every {{ REFRESH_INTERVAL }} seconds</p>
        </div>
    </div>
    
    <script>
        const REFRESH_INTERVAL = {{ REFRESH_INTERVAL }} * 1000;
        let activityChart = null;
        
        // Format update time
        function updateTime() {
            const now = new Date();
            document.getElementById('updateTime').textContent = 
                now.toLocaleTimeString() + ' ' + now.toLocaleDateString();
        }
        
        updateTime();
        setInterval(updateTime, 1000);
        
        // Load data from API
        async function loadData() {
            try {
                const response = await fetch('/api/test-data');
                const data = await response.json();
                
                if (data.error) {
                    console.error('Error loading data:', data.error);
                    return;
                }
                
                // Update statistics if needed
                console.log('Data loaded successfully');
                
                // Load metrics history for chart
                loadChartData();
                
            } catch (error) {
                console.error('Error fetching data:', error);
            }
        }
        
        // Load chart data
        async function loadChartData() {
            try {
                const response = await fetch('/api/metrics-history');
                const data = await response.json();
                
                if (data.error || !data.snapshots || data.snapshots.length === 0) {
                    console.log('No chart data available');
                    return;
                }
                
                const snapshots = data.snapshots;
                const labels = snapshots.map((_, idx) => `Snapshot ${idx + 1}`);
                const messagesData = snapshots.map(s => s.total_messages);
                const contactsData = snapshots.map(s => s.total_contacts);
                const exchangesData = snapshots.map(s => s.total_dht_exchanges);
                
                // Create or update chart
                const ctx = document.getElementById('activityChart').getContext('2d');
                
                if (activityChart) {
                    activityChart.destroy();
                }
                
                activityChart = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [
                            {
                                label: 'Total Messages',
                                data: messagesData,
                                borderColor: '#2196F3',
                                backgroundColor: 'rgba(33, 150, 243, 0.1)',
                                borderWidth: 3,
                                fill: true,
                                tension: 0.4
                            },
                            {
                                label: 'Contacts Discovered',
                                data: contactsData,
                                borderColor: '#4CAF50',
                                backgroundColor: 'rgba(76, 175, 80, 0.1)',
                                borderWidth: 3,
                                fill: true,
                                tension: 0.4
                            },
                            {
                                label: 'DHT Exchanges',
                                data: exchangesData,
                                borderColor: '#FF9800',
                                backgroundColor: 'rgba(255, 152, 0, 0.1)',
                                borderWidth: 3,
                                fill: true,
                                tension: 0.4
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                position: 'top',
                                labels: {
                                    font: {
                                        size: 12
                                    }
                                }
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                grid: {
                                    color: 'rgba(0, 0, 0, 0.05)'
                                },
                                ticks: {
                                    font: {
                                        size: 11
                                    }
                                }
                            },
                            x: {
                                grid: {
                                    color: 'rgba(0, 0, 0, 0.05)'
                                },
                                ticks: {
                                    font: {
                                        size: 11
                                    }
                                }
                            }
                        }
                    }
                });
                
            } catch (error) {
                console.error('Error loading chart data:', error);
            }
        }
        
        // Auto-refresh
        setInterval(loadData, REFRESH_INTERVAL);
        
        // Initial load
        if ({{ 'true' if test_found else 'false' }}) {
            loadData();
        }
    </script>
</body>
</html>
"""

# Crear la ruta para servir la plantilla
@app.route('/dashboard')
def dashboard():
    return HTML_TEMPLATE

if __name__ == '__main__':
    print("🌐 upeer Scalability Dashboard")
    print("📊 Starting web server on http://localhost:5000")
    print("📈 Monitoring test directories in /tmp/p2p_scalability_*")
    print("🔄 Auto-refresh every 5 seconds")
    print("\nPress Ctrl+C to stop\n")
    
    # Ejecutar Flask en modo desarrollo
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)