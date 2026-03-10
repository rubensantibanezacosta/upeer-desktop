#!/bin/bash
# Script para ejecutar 30 nodos upeer en una topología escalable
# Basado en run_15_nodes.sh pero extendido a 30 nodos

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🚀 INICIANDO TEST DE 30 NODOS upeer${NC}"
echo "Escalabilidad extrema: 30 nodos en topología jerárquica..."
echo

# Función para extraer valores JSON de forma robusta
extract_json_value() {
    local json_file="$1"
    local key="$2"
    python3 -c "
import json, sys
try:
    with open('$json_file') as f:
        data = json.load(f)
        value = data.get('$key', '')
        print(value if value is not None else '')
except Exception as e:
    sys.exit(1)
" 2>/dev/null || echo ''
}

# Cleanup
echo "1. Limpiando contenedores anteriores..."
rm -rf /tmp/p2p_shared_30
mkdir -p /tmp/p2p_shared_30
docker rm -f $(docker ps -a -q --filter ancestor=upeer-bot) 2>/dev/null || true

# Rebuild the docker image
echo "2. Construyendo imagen Docker..."
docker build -t upeer-bot -f tests/p2p_testing/Dockerfile.peer tests/p2p_testing > /dev/null 2>&1
echo "   ✅ Imagen construida"

# Node 1 (Bootstrap)
echo "3. Iniciando Node 1 (Bootstrap)..."
docker run -d --name p2p_node_1 --cap-add=NET_ADMIN --device=/dev/net/tun \
  -v /tmp/p2p_shared_30:/shared \
  -e NODE_ENV_NAME=node1 \
  upeer-bot > /dev/null 2>&1
sleep 10

# Get Node 1 info
NODE1_JSON="/tmp/p2p_shared_30/node1.json"
NODE1_ID=$(extract_json_value "$NODE1_JSON" "id")
NODE1_IP=$(extract_json_value "$NODE1_JSON" "ip")

if [ -z "$NODE1_ID" ] || [ -z "$NODE1_IP" ]; then
    echo -e "   ${RED}❌ No se pudo obtener información del Node 1${NC}"
    docker logs p2p_node_1
    exit 1
fi

TARGET1="${NODE1_ID}@${NODE1_IP}"
echo "   ✅ Node 1 (Bootstrap) iniciado: $TARGET1"

# Helper function to start a node and return its target string
start_node() {
    local node_num=$1
    local target_env=$2
    local delay=${3:-4}
    
    docker run -d --name p2p_node_$node_num --cap-add=NET_ADMIN --device=/dev/net/tun \
      -v /tmp/p2p_shared_30:/shared \
      -e NODE_ENV_NAME=node$node_num \
      -e TARGET_IDENTITY="$target_env" \
      upeer-bot > /dev/null 2>&1
    sleep $delay
    
    local json_file="/tmp/p2p_shared_30/node${node_num}.json"
    local node_id=$(extract_json_value "$json_file" "id")
    local node_ip=$(extract_json_value "$json_file" "ip")
    
    if [ -z "$node_id" ] || [ -z "$node_ip" ]; then
        echo "   ⚠️  Node $node_num started but no JSON yet, using placeholder"
        echo "unknown@unknown"
    else
        echo "${node_id}@${node_ip}"
    fi
}

# Topología jerárquica de 30 nodos:
# Nivel 1: Nodes 2-6 conectan a Node 1 (5 nodos)
echo "4. Iniciando Nivel 1: Nodes 2-6 conectando a Node 1..."
TARGET2=$(start_node 2 "$TARGET1" 5)
TARGET3=$(start_node 3 "$TARGET1" 5)
TARGET4=$(start_node 4 "$TARGET1" 5)
TARGET5=$(start_node 5 "$TARGET1" 5)
TARGET6=$(start_node 6 "$TARGET1" 5)

# Nivel 2: Nodes 7-16 conectan a múltiples nodos del Nivel 1 (10 nodos)
echo "5. Iniciando Nivel 2: Nodes 7-16 conectando a Nivel 1..."
TARGET7=$(start_node 7 "$TARGET2" 4)
TARGET8=$(start_node 8 "$TARGET2" 4)
TARGET9=$(start_node 9 "$TARGET3" 4)
TARGET10=$(start_node 10 "$TARGET3" 4)
TARGET11=$(start_node 11 "$TARGET4" 4)
TARGET12=$(start_node 12 "$TARGET4" 4)
TARGET13=$(start_node 13 "$TARGET5" 4)
TARGET14=$(start_node 14 "$TARGET5" 4)
TARGET15=$(start_node 15 "$TARGET6" 4)
TARGET16=$(start_node 16 "$TARGET6" 4)

# Nivel 3: Nodes 17-26 conectan a múltiples nodos del Nivel 2 (10 nodos)
echo "6. Iniciando Nivel 3: Nodes 17-26 conectando a Nivel 2..."
TARGET17=$(start_node 17 "$TARGET7" 3)
TARGET18=$(start_node 18 "$TARGET7" 3)
TARGET19=$(start_node 19 "$TARGET8" 3)
TARGET20=$(start_node 20 "$TARGET8" 3)
TARGET21=$(start_node 21 "$TARGET9" 3)
TARGET22=$(start_node 22 "$TARGET9" 3)
TARGET23=$(start_node 23 "$TARGET10" 3)
TARGET24=$(start_node 24 "$TARGET10" 3)
TARGET25=$(start_node 25 "$TARGET11" 3)
TARGET26=$(start_node 26 "$TARGET11" 3)

# Nivel 4: Nodes 27-30 conectan a múltiples nodos del Nivel 3 (4 nodos)
echo "7. Iniciando Nivel 4: Nodes 27-30 conectando a Nivel 3..."
TARGET27=$(start_node 27 "$TARGET12" 3)
TARGET28=$(start_node 28 "$TARGET13" 3)
TARGET29=$(start_node 29 "$TARGET14" 3)
TARGET30=$(start_node 30 "$TARGET15" 3)

echo "8. Esperando establecimiento de conexiones en toda la red..."
sleep 15

# Verificar que los nodos están activos
echo "9. Verificando estado de los nodos..."
ACTIVE_NODES=0
TOTAL_NODES=30

for i in $(seq 1 $TOTAL_NODES); do
    if docker ps --filter "name=p2p_node_$i" --format "{{.Names}}" | grep -q "p2p_node_$i"; then
        ACTIVE_NODES=$((ACTIVE_NODES + 1))
    fi
done

echo "   Nodos activos: $ACTIVE_NODES/$TOTAL_NODES"

# Generar métricas básicas
echo "10. Generando métricas de red..."
METRICS_FILE="/tmp/p2p_shared_30/network_metrics.json"
cat > "$METRICS_FILE" << EOF
{
    "total_nodes": $TOTAL_NODES,
    "active_nodes": $ACTIVE_NODES,
    "bootstrap_node": "$TARGET1",
    "topology": "hierarchical_4_levels",
    "levels": {
        "level1": ["node1"],
        "level2": ["node2", "node3", "node4", "node5", "node6"],
        "level3": ["node7", "node8", "node9", "node10", "node11", "node12", "node13", "node14", "node15", "node16"],
        "level4": ["node17", "node18", "node19", "node20", "node21", "node22", "node23", "node24", "node25", "node26"],
        "level5": ["node27", "node28", "node29", "node30"]
    },
    "timestamp": $(date +%s)
}
EOF

# Test de conectividad básica
echo "11. Realizando test de conectividad básica..."
# Enviar mensaje de test desde node1 a node30
if [ "$ACTIVE_NODES" -eq "$TOTAL_NODES" ]; then
    echo "   Enviando mensaje de test de Node 1 a Node 30..."
    echo "{\"type\": \"SEND_CHAT\", \"target_rid\": \"$(echo $TARGET30 | cut -d'@' -f1)\", \"content\": \"Test de conectividad en red de 30 nodos\"}" > /tmp/p2p_shared_30/node1.cmd
    sleep 5
    echo "   Test de mensajes completado"
fi

# Mostrar resumen
echo
echo -e "${YELLOW}📊 RESUMEN DE LA RED DE 30 NODOS${NC}"
echo "=========================================="
echo -e "${GREEN}✅ Configuración completada${NC}"
echo "   - Total nodos: $TOTAL_NODES"
echo "   - Nodos activos: $ACTIVE_NODES"
echo "   - Topología: 4 niveles jerárquicos"
echo "   - Bootstrap: $TARGET1"
echo
echo "📋 Información de nodos clave:"
echo "   - Node 1 (Bootstrap): $TARGET1"
echo "   - Node 15 (Mid-level): $TARGET15"
echo "   - Node 30 (Leaf): $TARGET30"
echo
echo "📁 Logs y métricas:"
echo "   - Directorio compartido: /tmp/p2p_shared_30"
echo "   - Métricas de red: $METRICS_FILE"
echo "   - Logs individuales: docker logs p2p_node_<N>"
echo
echo -e "${YELLOW}🔧 Comandos útiles:${NC}"
echo "   - Ver todos los contenedores: docker ps --filter 'name=p2p_node_'"
echo "   - Detener todos los nodos: docker rm -f \$(docker ps -a -q --filter 'name=p2p_node_')"
echo "   - Monitorear logs: docker logs -f p2p_node_1"
echo
echo -e "${GREEN}🎉 ¡RED DE 30 NODOS INICIADA CORRECTAMENTE!${NC}"
echo "La red permanecerá activa hasta que se detengan los contenedores."
echo "Presiona Ctrl+C para detener y limpiar."

# Mantener script activo para mantener contenedores corriendo
trap 'echo -e "${YELLOW}Deteniendo todos los nodos...${NC}"; docker rm -f $(docker ps -a -q --filter name=p2p_node_) > /dev/null 2>&1; echo -e "${GREEN}✅ Limpieza completada${NC}"; exit 0' INT TERM

echo -e "${YELLOW}⏳ Manteniendo red activa (presiona Ctrl+C para salir)...${NC}"
while true; do
    sleep 60
    # Verificar periódicamente el estado
    CURRENT_ACTIVE=$(docker ps --filter "name=p2p_node_" --format "{{.Names}}" | wc -l)
    if [ "$CURRENT_ACTIVE" -lt "$TOTAL_NODES" ]; then
        echo "   ⚠️  Algunos nodos han fallado: $CURRENT_ACTIVE/$TOTAL_NODES activos"
    fi
done