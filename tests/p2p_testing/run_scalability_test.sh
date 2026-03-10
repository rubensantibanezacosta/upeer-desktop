#!/bin/bash
# Test de escalabilidad y monitorización de red upeer
# Permite probar con diferentes tamaños de red y topologías

set -e

# Configuración
NUM_NODES=${1:-15}  # Número de nodos (default: 15)
TOPOLOGY=${2:-"tree"}  # Topología: tree, linear, star, random
TEST_DURATION=${3:-120}  # Duración del test en segundos
METRICS_INTERVAL=5  # Intervalo de recolección de métricas (segundos)
SHARED_DIR="/tmp/p2p_scalability_$(date +%s)"

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Test de Escalabilidad upeer ===${NC}"
echo -e "${GREEN}Nodos:${NC} $NUM_NODES"
echo -e "${GREEN}Topología:${NC} $TOPOLOGY"
echo -e "${GREEN}Duración:${NC} $TEST_DURATION segundos"
echo -e "${GREEN}Directorio compartido:${NC} $SHARED_DIR"

# Limpieza previa
cleanup() {
    echo -e "${YELLOW}Limpiando contenedores previos...${NC}"
    docker rm -f $(docker ps -a -q --filter ancestor=upeer-bot) 2>/dev/null || true
    rm -rf "$SHARED_DIR" 2>/dev/null || true
    mkdir -p "$SHARED_DIR"
}
cleanup

# Reconstruir imagen con métricas mejoradas
echo -e "${YELLOW}Reconstruyendo imagen Docker con métricas...${NC}"
docker build -t upeer-bot -f tests/p2p_testing/Dockerfile.peer tests/p2p_testing

# Función para iniciar un nodo y devolver su información
start_node() {
    local node_num=$1
    local target_env=$2
    local node_name="node$node_num"
    
    echo -e "${BLUE}Iniciando nodo $node_num...${NC}" >&2
    
    docker run -d \
        --name "p2p_$node_name" \
        --cap-add=NET_ADMIN \
        --device=/dev/net/tun \
        -v "$SHARED_DIR:/shared" \
        -e NODE_ENV_NAME="$node_name" \
        -e TARGET_IDENTITY="$target_env" \
        upeer-bot >/dev/null 2>&1
        
    sleep 4  # Esperar a que Yggdrasil se inicie
    
    # Esperar a que el nodo escriba su información
    local max_wait=30
    local wait_time=0
    while [ ! -f "$SHARED_DIR/${node_name}.json" ] && [ $wait_time -lt $max_wait ]; do
        sleep 1
        ((wait_time++))
    done
    
    if [ ! -f "$SHARED_DIR/${node_name}.json" ]; then
        echo -e "${RED}Error: Nodo $node_num no escribió su información${NC}"
        docker logs "p2p_$node_name"
        return 1
    fi
    
    # Leer datos del nodo
    local data=$(cat "$SHARED_DIR/${node_name}.json")
    local node_id=$(echo $data | grep -o '"id": "[^"]*' | cut -d '"' -f 4)
    local node_ip=$(echo $data | grep -o '"ip": "[^"]*' | cut -d '"' -f 4)
    
    echo -e "${GREEN}Nodo $node_num listo: $node_id@$node_ip${NC}" >&2
    echo "$node_id@$node_ip"
}

# Función para generar topologías
generate_topology() {
    local num_nodes=$1
    local topology=$2
    
    declare -A targets
    
    case $topology in
        "linear")
            # Cadena lineal: 1->2->3->4...
            echo -e "${GREEN}Generando topología lineal...${NC}"
            for i in $(seq 1 $num_nodes); do
                if [ $i -eq 1 ]; then
                    targets[$i]=""  # Primer nodo no tiene target
                else
                    targets[$i]=$((i-1))  # Conectar al nodo anterior
                fi
            done
            ;;
            
        "tree")
            # Árbol binario: 1->(2,3), 2->(4,5), 3->(6,7)...
            echo -e "${GREEN}Generando topología de árbol...${NC}"
            for i in $(seq 1 $num_nodes); do
                if [ $i -eq 1 ]; then
                    targets[$i]=""  # Raíz
                else
                    targets[$i]=$((i/2))  # Conectar al nodo padre
                fi
            done
            ;;
            
        "star")
            # Estrella: todos se conectan al nodo 1
            echo -e "${GREEN}Generando topología en estrella...${NC}"
            for i in $(seq 1 $num_nodes); do
                if [ $i -eq 1 ]; then
                    targets[$i]=""  # Centro
                else
                    targets[$i]=1  # Conectar al nodo centro
                fi
            done
            ;;
            
        *)
            echo -e "${RED}Topología desconocida: $topology${NC}"
            exit 1
            ;;
    esac
    
    # Devolver array
    for i in $(seq 1 $num_nodes); do
        echo "$i:${targets[$i]}"
    done
}

# Inicializar red
echo -e "${YELLOW}Inicializando red con $NUM_NODES nodos ($TOPOLOGY)...${NC}"

# Generar topología
topology_map=$(generate_topology $NUM_NODES $TOPOLOGY)
declare -A node_targets
declare -A node_info

for line in $topology_map; do
    node_num=$(echo $line | cut -d: -f1)
    target=$(echo $line | cut -d: -f2)
    node_targets[$node_num]=$target
done

# Iniciar nodos secuencialmente
for i in $(seq 1 $NUM_NODES); do
    parent=${node_targets[$i]}
    if [ -z "$parent" ]; then
        target=""
    else
        target="${node_info[$parent]}"
    fi
    
    node_info_str=$(start_node $i "$target")
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}Error al iniciar nodo $i${NC}"
        exit 1
    fi
    
    node_info[$i]=$node_info_str
done

echo -e "${GREEN}✅ Todos los $NUM_NODES nodos están ejecutándose${NC}"

# Función para recolectar métricas
collect_metrics() {
    local timestamp=$(date +%s)
    local all_metrics="{ \"timestamp\": $timestamp, \"nodes\": {}"
    
    for i in $(seq 1 $NUM_NODES); do
        local metrics_file="$SHARED_DIR/node${i}_metrics.json"
        if [ -f "$metrics_file" ]; then
            local node_metrics=$(cat "$metrics_file" 2>/dev/null || echo "{}")
            all_metrics="$all_metrics, \"node$i\": $node_metrics"
        fi
    done
    
    all_metrics="$all_metrics }"
    echo "$all_metrics" > "$SHARED_DIR/metrics_snapshot_$timestamp.json"
    echo "$all_metrics" | jq . > "$SHARED_DIR/latest_metrics.json" 2>/dev/null || true
}

# Función para generar tráfico entre nodos
generate_traffic() {
    echo -e "${YELLOW}Generando tráfico de prueba...${NC}"
    
    # Seleccionar 3 pares de nodos aleatorios para enviar mensajes
    for attempt in {1..3}; do
        src=$((RANDOM % NUM_NODES + 1))
        dst=$((RANDOM % NUM_NODES + 1))
        
        while [ $src -eq $dst ]; do
            dst=$((RANDOM % NUM_NODES + 1))
        done
        
        echo -e "${BLUE}Enviando mensaje de nodo $src a nodo $dst...${NC}"
        
        # Obtener ID del nodo destino desde su archivo JSON
        if [ -f "$SHARED_DIR/node${dst}.json" ]; then
            dst_data=$(cat "$SHARED_DIR/node${dst}.json")
            dst_id=$(echo $dst_data | grep -o '"id": "[^"]*' | cut -d '"' -f 4)
            
            # Crear comando para el nodo fuente
            cmd_file="$SHARED_DIR/node${src}.cmd"
            cat > "$cmd_file" << EOF
{
    "type": "SEND_CHAT",
    "target_rid": "$dst_id",
    "content": "Test message from node $src to node $dst - Scalability test $(date +%s)"
}
EOF
            echo -e "${GREEN}Comando enviado a nodo $src para hablar con $dst (ID: $dst_id)${NC}"
        fi
    done
}

# Monitorización en tiempo real
echo -e "${YELLOW}Iniciando monitorización ($TEST_DURATION segundos)...${NC}"
echo -e "${GREEN}Métricas recolectadas cada $METRICS_INTERVAL segundos${NC}"
echo -e "${BLUE}Presiona Ctrl+C para terminar temprano${NC}"

# Archivo para métricas agregadas
metrics_summary="$SHARED_DIR/metrics_summary.json"
echo "[" > "$metrics_summary"

start_time=$(date +%s)
end_time=$((start_time + TEST_DURATION))
metric_count=0

while [ $(date +%s) -lt $end_time ]; do
    current_time=$(date +%s)
    elapsed=$((current_time - start_time))
    remaining=$((end_time - current_time))
    
    echo -e "\n${BLUE}--- Tiempo transcurrido: ${elapsed}s / Restante: ${remaining}s ---${NC}"
    
    # Recolectar métricas
    collect_metrics
    
    # Generar tráfico periódicamente (cada 15 segundos)
    if [ $((elapsed % 15)) -eq 0 ]; then
        generate_traffic
    fi
    
    # Mostrar métricas resumidas
    if [ -f "$SHARED_DIR/latest_metrics.json" ]; then
        echo -e "${GREEN}📊 Métricas actuales:${NC}"
        
        # Calcular totales - método más robusto
        total_messages=0
        total_dht_updates=0
        total_contacts=0
        active_nodes=0
        
        for i in $(seq 1 $NUM_NODES); do
            if [ -f "$SHARED_DIR/node${i}_metrics.json" ]; then
                # Usar Python para parsear JSON de manera más robusta
                node_data=$(python3 -c "
import json, sys
try:
    with open('$SHARED_DIR/node${i}_metrics.json') as f:
        data = json.load(f)
    msg_sent = data.get('messages_sent', 0)
    msg_recv = data.get('messages_received', 0)
    dht_updates = data.get('dht_updates_received', 0)
    contacts = data.get('contacts_discovered', 0)
    print(f'{msg_sent},{msg_recv},{dht_updates},{contacts}')
except:
    print('0,0,0,0')
" 2>/dev/null || echo "0,0,0,0")
                
                IFS=',' read -r msg_sent msg_recv dht_updates contacts <<< "$node_data"
                
                total_messages=$((total_messages + msg_sent + msg_recv))
                total_dht_updates=$((total_dht_updates + dht_updates))
                total_contacts=$((total_contacts + contacts))
                active_nodes=$((active_nodes + 1))
            fi
        done
        
        echo -e "  📨 Mensajes totales: $total_messages"
        echo -e "  🔄 Updates DHT: $total_dht_updates"
        echo -e "  👥 Contactos descubiertos: $total_contacts"
        echo -e "  🖥️  Nodos activos: $active_nodes/$NUM_NODES"
        
        # Mostrar diagnóstico si hay 0 actividad
        if [ $total_messages -eq 0 ] && [ $elapsed -gt 10 ]; then
            echo -e "  ⚠️  Diagnóstico: Los nodos están ejecutándose pero no reportan actividad"
            echo -e "     Verifica: docker logs p2p_node1 | grep -E '(RECIBIDO|Enviando|Auto-conectando)'"
        fi
    fi
    
    # Esperar para siguiente ciclo
    sleep $METRICS_INTERVAL
    metric_count=$((metric_count + 1))
    
    # Guardar métricas en resumen
    if [ -f "$SHARED_DIR/latest_metrics.json" ]; then
        if [ $metric_count -gt 1 ]; then
            echo "," >> "$metrics_summary"
        fi
        cat "$SHARED_DIR/latest_metrics.json" >> "$metrics_summary"
    fi
done

# Finalizar array de métricas
echo "]" >> "$metrics_summary"

# Generar reporte final
echo -e "${YELLOW}=== Generando reporte final ===${NC}"
generate_final_report() {
    echo -e "${BLUE}📈 REPORTE DE ESCALABILIDAD upeer${NC}"
    echo -e "${GREEN}Configuración:${NC}"
    echo -e "  Nodos: $NUM_NODES"
    echo -e "  Topología: $TOPOLOGY"
    echo -e "  Duración: $TEST_DURATION segundos"
    echo -e "  Métricas recolectadas: $metric_count muestras"
    
    # Análisis de logs de nodos extremos
    if [ $NUM_NODES -ge 2 ]; then
        echo -e "\n${GREEN}Logs del primer nodo (bootstrap):${NC}"
        docker logs p2p_node1 2>&1 | tail -n 20 | sed 's/^/  /'
        
        echo -e "\n${GREEN}Logs del último nodo:${NC}"
        docker logs "p2p_node$NUM_NODES" 2>&1 | tail -n 20 | sed 's/^/  /'
    fi
    
    # Resumen de métricas finales REALES desde los archivos individuales
    echo -e "\n${GREEN}Métricas finales reales (desde archivos individuales):${NC}"
    
    total_messages_final=0
    total_contacts_final=0
    total_handshakes_final=0
    active_nodes_final=0
    
    for i in $(seq 1 $NUM_NODES); do
        if [ -f "$SHARED_DIR/node${i}_metrics.json" ]; then
            active_nodes_final=$((active_nodes_final + 1))
            # Usar Python para extraer métricas clave
            node_stats=$(python3 -c "
import json, sys
try:
    with open('$SHARED_DIR/node${i}_metrics.json') as f:
        data = json.load(f)
    msg_sent = data.get('messages_sent', 0)
    msg_recv = data.get('messages_received', 0)
    contacts = data.get('contacts_discovered', 0)
    handshakes = data.get('handshakes_completed', 0)
    dht_exchanges = data.get('dht_exchanges_received', 0)
    packets = data.get('packets_received', 0)
    print(f'Nodo {i}: {msg_sent} enviados, {msg_recv} recibidos, {contacts} contactos, {handshakes} handshakes, {dht_exchanges} DHT exchanges, {packets} paquetes')
    total_messages_final = msg_sent + msg_recv
    total_contacts_final = contacts
    total_handshakes_final = handshakes
except Exception as e:
    print(f'Nodo {i}: Error leyendo métricas: {e}')
" 2>/dev/null || echo "Nodo $i: Error leyendo métricas")
            
            echo "  $node_stats"
            # Extraer valores para acumular
            if [[ $node_stats =~ ([0-9]+)[[:space:]]*enviados.*([0-9]+)[[:space:]]*recibidos.*([0-9]+)[[:space:]]*contactos.*([0-9]+)[[:space:]]*handshakes ]]; then
                msg_sent_val=${BASH_REMATCH[1]}
                msg_recv_val=${BASH_REMATCH[2]}
                contacts_val=${BASH_REMATCH[3]}
                handshakes_val=${BASH_REMATCH[4]}
                total_messages_final=$((total_messages_final + msg_sent_val + msg_recv_val))
                total_contacts_final=$((total_contacts_final + contacts_val))
                total_handshakes_final=$((total_handshakes_final + handshakes_val))
            fi
        fi
    done
    
    echo -e "\n${GREEN}Totales agregados:${NC}"
    echo -e "  📨 Mensajes totales: $total_messages_final"
    echo -e "  👥 Contactos descubiertos: $total_contacts_final"
    echo -e "  🤝 Handshakes completados: $total_handshakes_final"
    echo -e "  🖥️  Nodos activos con métricas: $active_nodes_final/$NUM_NODES"
    
    echo -e "\n${GREEN}Archivos generados:${NC}"
    echo -e "  $metrics_summary - Todas las métricas recolectadas"
    echo -e "  $SHARED_DIR/node*_metrics.json - Métricas individuales por nodo"
    echo -e "  $SHARED_DIR/metrics_snapshot_*.json - Snapshots temporales"
    
    echo -e "\n${BLUE}✅ Test completado exitosamente${NC}"
}

generate_final_report

# Opcional: mantener contenedores corriendo para análisis
read -p "¿Mantener contenedores ejecutándose? (s/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Ss]$ ]]; then
    echo -e "${YELLOW}Deteniendo contenedores...${NC}"
    docker rm -f $(docker ps -a -q --filter ancestor=upeer-bot) 2>/dev/null || true
    echo -e "${GREEN}Limpieza completada${NC}"
else
    echo -e "${GREEN}Contenedores siguen ejecutándose${NC}"
    echo -e "Usa 'docker rm -f \$(docker ps -a -q --filter ancestor=upeer-bot)' para limpiar"
fi

echo -e "\n${BLUE}=== Test de escalabilidad finalizado ===${NC}"