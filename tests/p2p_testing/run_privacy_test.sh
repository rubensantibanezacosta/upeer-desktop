#!/bin/bash
# Test de privacidad: Verifica que los mensajes no contengan contactCache ni información sensible

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🔍 INICIANDO TEST DE PRIVACIDAD REVELNEST${NC}"
echo "Verificando que los mensajes no contengan información sensible de contactos..."
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

# Rebuild the docker image
echo "1. Construyendo imagen Docker..."
docker build -t revelnest-bot -f tests/p2p_testing/Dockerfile.peer tests/p2p_testing > /dev/null 2>&1
echo "   ✅ Imagen construida"

# Cleanup
echo "2. Limpiando contenedores anteriores..."
rm -rf /tmp/p2p_privacy_test
mkdir -p /tmp/p2p_privacy_test
docker rm -f privacy_node1 privacy_node2 2>/dev/null || true

# Start two nodes
echo "3. Iniciando dos nodos de prueba..."
echo "   Node 1 (Alice)..."
docker run -d --name privacy_node1 --cap-add=NET_ADMIN --device=/dev/net/tun \
  -v /tmp/p2p_privacy_test:/shared \
  -e NODE_ENV_NAME=alice \
  revelnest-bot > /dev/null 2>&1
sleep 5

# Get Alice's info using Python JSON parsing
ALICE_JSON_FILE="/tmp/p2p_privacy_test/alice.json"
ALICE_ID=$(extract_json_value "$ALICE_JSON_FILE" "id")
ALICE_IP=$(extract_json_value "$ALICE_JSON_FILE" "ip")

if [ -z "$ALICE_ID" ] || [ -z "$ALICE_IP" ]; then
    echo -e "   ${RED}❌ No se pudo obtener información de Alice${NC}"
    docker logs privacy_node1
    exit 1
fi

TARGET_ALICE="${ALICE_ID}@${ALICE_IP}"
echo "   Alice ID: $ALICE_ID"
echo "   Alice IP: $ALICE_IP"

echo "   Node 2 (Bob) conectando a Alice..."
docker run -d --name privacy_node2 --cap-add=NET_ADMIN --device=/dev/net/tun \
  -v /tmp/p2p_privacy_test:/shared \
  -e NODE_ENV_NAME=bob \
  -e TARGET_IDENTITY="$TARGET_ALICE" \
  revelnest-bot > /dev/null 2>&1
sleep 10

# Get Bob's info using Python JSON parsing
BOB_JSON_FILE="/tmp/p2p_privacy_test/bob.json"
BOB_ID=$(extract_json_value "$BOB_JSON_FILE" "id")
BOB_IP=$(extract_json_value "$BOB_JSON_FILE" "ip")

if [ -z "$BOB_ID" ] || [ -z "$BOB_IP" ]; then
    echo -e "   ${RED}❌ No se pudo obtener información de Bob${NC}"
    docker logs privacy_node2
    exit 1
fi

echo "   Bob ID: $BOB_ID"
echo "   Bob IP: $BOB_IP"

# Send test messages
echo "4. Enviando mensajes de prueba entre nodos..."
echo "   Enviando mensaje de Alice a Bob..."
echo "{\"type\": \"SEND_CHAT\", \"target_rid\": \"$BOB_ID\", \"content\": \"Hola Bob, este es un mensaje de prueba de privacidad.\"}" > /tmp/p2p_privacy_test/alice.cmd
sleep 3

echo "   Enviando mensaje de Bob a Alice..."
echo "{\"type\": \"SEND_CHAT\", \"target_rid\": \"$ALICE_ID\", \"content\": \"Hola Alice, recibido. Todo funciona correctamente.\"}" > /tmp/p2p_privacy_test/bob.cmd
sleep 3

# Send DHT exchange to simulate normal traffic
echo "5. Simulando tráfico DHT normal..."
echo "{\"type\": \"SEND_CHAT\", \"target_rid\": \"$BOB_ID\", \"content\": \"Segundo mensaje para más tráfico de prueba.\"}" > /tmp/p2p_privacy_test/alice.cmd
sleep 5

echo "6. Recolectando logs para auditoría..."
docker logs privacy_node1 > /tmp/p2p_privacy_test/alice.log 2>&1
docker logs privacy_node2 > /tmp/p2p_privacy_test/bob.log 2>&1

echo "7. Ejecutando auditoría de privacidad..."
python3 tests/p2p_testing/privacy_auditor.py /tmp/p2p_privacy_test/alice.log
ALICE_CLEAN=$?

python3 tests/p2p_testing/privacy_auditor.py /tmp/p2p_privacy_test/bob.log
BOB_CLEAN=$?

echo "8. Verificando contenido de mensajes manualmente..."
# Buscar manualmente campos prohibidos en los logs
FORBIDDEN_FIELDS=("contactCache" "contacts" "cachedContacts" "contactList" "addressBook" "friendList")
VIOLATIONS_FOUND=0

for log_file in /tmp/p2p_privacy_test/alice.log /tmp/p2p_privacy_test/bob.log; do
    echo "   Analizando $(basename $log_file)..."
    for field in "${FORBIDDEN_FIELDS[@]}"; do
        COUNT=$(grep -i "$field" "$log_file" | wc -l)
        if [ "$COUNT" -gt 0 ]; then
            echo -e "   ${RED}❌ Encontrado '$field' en $(basename $log_file) ($COUNT veces)${NC}"
            VIOLATIONS_FOUND=1
        fi
    done
done

# Cleanup containers
echo "9. Limpiando contenedores..."
docker rm -f privacy_node1 privacy_node2 > /dev/null 2>&1

# Final result
echo
echo -e "${YELLOW}📊 RESULTADOS FINALES DEL TEST DE PRIVACIDAD${NC}"
echo "=========================================="

if [ $ALICE_CLEAN -eq 0 ] && [ $BOB_CLEAN -eq 0 ] && [ $VIOLATIONS_FOUND -eq 0 ]; then
    echo -e "${GREEN}✅ TODAS LAS PRUEBAS PASARON${NC}"
    echo "   - Auditoría automática: PASS"
    echo "   - Búsqueda manual de campos prohibidos: PASS"
    echo "   - Zero leaks de información de contactos confirmado"
    echo
    echo -e "${GREEN}🎉 ¡EL SISTEMA CUMPLE CON LOS ESTÁNDARES DE PRIVACIDAD!${NC}"
    exit 0
else
    echo -e "${RED}❌ PRUEBAS FALLIDAS${NC}"
    [ $ALICE_CLEAN -ne 0 ] && echo "   - Auditoría de Alice falló"
    [ $BOB_CLEAN -ne 0 ] && echo "   - Auditoría de Bob falló"
    [ $VIOLATIONS_FOUND -ne 0 ] && echo "   - Se encontraron campos prohibidos manualmente"
    echo
    echo -e "${YELLOW}🔍 Revisar logs detallados en:${NC}"
    echo "   Alice: /tmp/p2p_privacy_test/alice.log"
    echo "   Bob: /tmp/p2p_privacy_test/bob.log"
    echo
    echo -e "${RED}⚠️  SE DETECTARON POSIBLES FUGAS DE PRIVACIDAD${NC}"
    exit 1
fi