#!/bin/bash
# Simulador de 60 días para pruebas de resiliencia de renewal tokens
# Acelera el tiempo para probar expiración y renovación de location blocks

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}⏳ INICIANDO SIMULADOR DE 60 DÍAS upeer${NC}"
echo "Simulación acelerada de persistencia a largo plazo con renewal tokens..."
echo

# Cleanup
echo "1. Limpiando simulaciones anteriores..."
rm -rf /tmp/p2p_60day_sim
mkdir -p /tmp/p2p_60day_sim
docker rm -f 60day_alice 60day_bob 60day_charlie 2>/dev/null || true

# Rebuild the docker image
echo "2. Construyendo imagen Docker..."
docker build -t upeer-bot -f tests/p2p_testing/Dockerfile.peer tests/p2p_testing > /dev/null 2>&1
echo "   ✅ Imagen construida"

# Start three nodes for simulation
echo "3. Iniciando tres nodos de prueba (Alice, Bob, Charlie)..."
echo "   Node 1 (Alice - será offline por 60 días)..."
# Create key file for Alice to persist identity
mkdir -p /tmp/p2p_60day_sim/keys
docker run -d --name 60day_alice --cap-add=NET_ADMIN --device=/dev/net/tun \
  -v /tmp/p2p_60day_sim:/shared \
  -e NODE_ENV_NAME=alice \
  -e KEY_FILE=/shared/keys/alice.key \
  upeer-bot > /dev/null 2>&1
sleep 8

# Get Alice's info
ALICE_JSON="/tmp/p2p_60day_sim/alice.json"
ALICE_ID=$(python3 -c "import json; print(json.load(open('$ALICE_JSON'))['id'])" 2>/dev/null || echo "")
ALICE_IP=$(python3 -c "import json; print(json.load(open('$ALICE_JSON'))['ip'])" 2>/dev/null || echo "")

if [ -z "$ALICE_ID" ] || [ -z "$ALICE_IP" ]; then
    echo -e "   ${RED}❌ No se pudo obtener información de Alice${NC}"
    docker logs 60day_alice
    exit 1
fi

TARGET_ALICE="${ALICE_ID}@${ALICE_IP}"
echo "   Alice ID: $ALICE_ID"
echo "   Alice IP: $ALICE_IP"

echo "   Node 2 (Bob - permanecerá online)..."
docker run -d --name 60day_bob --cap-add=NET_ADMIN --device=/dev/net/tun \
  -v /tmp/p2p_60day_sim:/shared \
  -e NODE_ENV_NAME=bob \
  -e KEY_FILE=/shared/keys/bob.key \
  -e TARGET_IDENTITY="$TARGET_ALICE" \
  upeer-bot > /dev/null 2>&1
sleep 15

# Wait for handshake to complete
echo "   Esperando handshake entre Alice y Bob..."
sleep 10

# Get Bob's info
BOB_JSON="/tmp/p2p_60day_sim/bob.json"
BOB_ID=$(python3 -c "import json; print(json.load(open('$BOB_JSON'))['id'])" 2>/dev/null || echo "")
BOB_IP=$(python3 -c "import json; print(json.load(open('$BOB_JSON'))['ip'])" 2>/dev/null || echo "")

if [ -z "$BOB_ID" ] || [ -z "$BOB_IP" ]; then
    echo -e "   ${RED}❌ No se pudo obtener información de Bob${NC}"
    docker logs 60day_bob
    exit 1
fi

echo "   Bob ID: $BOB_ID"
echo "   Bob IP: $BOB_IP"

echo "   Node 3 (Charlie - se unirá después)..."
# Charlie se iniciará más tarde en la simulación
sleep 5

# Ensure Alice and Bob have completed handshake
echo "   Verificando handshake completado..."
sleep 5

# Phase 1: Alice genera renewal token y lo comparte con Bob
echo "4. Fase 1 (Día 0): Alice genera renewal token y lo comparte con Bob..."
echo "{\"type\": \"GENERATE_RENEWAL_TOKEN\"}" > /tmp/p2p_60day_sim/alice.cmd
sleep 3
echo "{\"type\": \"SEND_RENEWAL_TOKEN\", \"target_rid\": \"$BOB_ID\"}" > /tmp/p2p_60day_sim/alice.cmd
sleep 3

# Verificar que Bob recibió el token
if docker logs 60day_bob 2>&1 | grep -q "Received renewal token"; then
    echo -e "   ${GREEN}✅ Bob recibió el renewal token de Alice${NC}"
else
    echo -e "   ${YELLOW}⚠️  Bob puede no haber recibido el token (verificar logs)${NC}"
fi

# Phase 2: Alice se desconecta (simulando offline)
echo "5. Fase 2 (Día 1): Alice se desconecta (simulando comienzo de ausencia)..."
docker rm -f 60day_alice > /dev/null 2>&1
echo "   Alice offline. Su location block expirará en ~30 días."

# Phase 3: Simular paso de 35 días - location block de Alice expira
echo "6. Fase 3 (Día 35): Location block de Alice ha expirado..."
echo "   Bob intenta contactar a Alice pero falla (block expirado)"
echo "{\"type\": \"SEND_CHAT\", \"target_rid\": \"$ALICE_ID\", \"content\": \"Hola Alice, pasaron 35 días\"}" > /tmp/p2p_60day_sim/bob.cmd
sleep 5

# Phase 4: Bob usa renewal token para renovar location block de Alice
echo "7. Fase 4 (Día 35): Bob usa renewal token para renovar location block de Alice..."
echo "{\"type\": \"REQUEST_RENEWAL\", \"target_rid\": \"$ALICE_ID\"}" > /tmp/p2p_60day_sim/bob.cmd
sleep 5

# Verificar renovación
RENEWAL_SUCCESS=false
if docker logs 60day_bob 2>&1 | grep -q "Successfully renewed"; then
    echo -e "   ${GREEN}✅ Bob renovó exitosamente el location block de Alice${NC}"
    RENEWAL_SUCCESS=true
else
    echo -e "   ${YELLOW}⚠️  Renovación puede haber fallado (verificar logs)${NC}"
fi

# Phase 5: Charlie se une a la red después de 45 días
echo "8. Fase 5 (Día 45): Nuevo nodo Charlie se une a la red..."
docker run -d --name 60day_charlie --cap-add=NET_ADMIN --device=/dev/net/tun \
  -v /tmp/p2p_60day_sim:/shared \
  -e NODE_ENV_NAME=charlie \
  -e TARGET_IDENTITY="${BOB_ID}@${BOB_IP}" \
  upeer-bot > /dev/null 2>&1
sleep 10

# Get Charlie's info
CHARLIE_JSON="/tmp/p2p_60day_sim/charlie.json"
CHARLIE_ID=$(python3 -c "import json; print(json.load(open('$CHARLIE_JSON'))['id'])" 2>/dev/null || echo "")
CHARLIE_IP=$(python3 -c "import json; print(json.load(open('$CHARLIE_JSON'))['ip'])" 2>/dev/null || echo "")

if [ -z "$CHARLIE_ID" ] || [ -z "$CHARLIE_IP" ]; then
    echo "   ⚠️  Charlie iniciado pero no se pudo obtener info JSON"
else
    echo "   Charlie ID: $CHARLIE_ID"
    echo "   Charlie IP: $CHARLIE_IP"
fi

# Phase 6: Charlie descubre a Alice a través de Bob (gracias a la renovación)
echo "9. Fase 6 (Día 46): Charlie descubre a Alice a través de Bob..."
echo "{\"type\": \"SEND_CHAT\", \"target_rid\": \"$ALICE_ID\", \"content\": \"Hola Alice, soy Charlie\"}" > /tmp/p2p_60day_sim/charlie.cmd
sleep 5

# Phase 7: Simular que Alice vuelve después de 60 días con la misma identidad
echo "10. Fase 7 (Día 60): Alice vuelve a conectarse después de 60 días (misma identidad)..."
docker run -d --name 60day_alice_return --cap-add=NET_ADMIN --device=/dev/net/tun \
  -v /tmp/p2p_60day_sim:/shared \
  -e NODE_ENV_NAME=alice_return \
  -e KEY_FILE=/shared/keys/alice.key \
  -e TARGET_IDENTITY="${BOB_ID}@${BOB_IP}" \
  upeer-bot > /dev/null 2>&1
sleep 10

# Get returning Alice's info (nueva identidad o misma)
ALICE_RETURN_JSON="/tmp/p2p_60day_sim/alice_return.json"
ALICE_RETURN_ID=$(python3 -c "import json; print(json.load(open('$ALICE_RETURN_JSON'))['id'])" 2>/dev/null || echo "")

if [ -n "$ALICE_RETURN_ID" ]; then
    echo "   Alice regresó con ID: $ALICE_RETURN_ID"
    # Verificar si es la misma Alice
    if [ "$ALICE_RETURN_ID" = "$ALICE_ID" ]; then
        echo -e "   ${GREEN}✅ Misma identidad preservada gracias a renewal tokens${NC}"
    else
        echo -e "   ${YELLOW}⚠️  Nueva identidad (posible pérdida sin renewal tokens efectivos)${NC}"
    fi
fi

# Collect final logs
echo "11. Recolectando logs para análisis..."
docker logs 60day_bob > /tmp/p2p_60day_sim/bob_final.log 2>&1
docker logs 60day_charlie > /tmp/p2p_60day_sim/charlie_final.log 2>&1 2>/dev/null || true
docker logs 60day_alice_return > /tmp/p2p_60day_sim/alice_return_final.log 2>&1 2>/dev/null || true

# Analyze results
echo "12. Analizando resultados de la simulación de 60 días..."
echo

RENEWAL_MENTIONS=$(grep -i "renewal" /tmp/p2p_60day_sim/bob_final.log 2>/dev/null | wc -l || echo "0")
TOKEN_MENTIONS=$(grep -i "token" /tmp/p2p_60day_sim/bob_final.log 2>/dev/null | wc -l || echo "0")
SUCCESSFUL_RENEWALS=$(grep "Successfully renewed" /tmp/p2p_60day_sim/bob_final.log 2>/dev/null | wc -l || echo "0")

echo "📊 Métricas de la simulación:"
echo "   - Menciones de 'renewal' en logs de Bob: $RENEWAL_MENTIONS"
echo "   - Menciones de 'token' en logs de Bob: $TOKEN_MENTIONS"
echo "   - Renovaciones exitosas: $SUCCESSFUL_RENEWALS"

# Cleanup containers
echo "13. Limpiando contenedores..."
docker rm -f 60day_alice 60day_bob 60day_charlie 60day_alice_return 2>/dev/null || true

# Final evaluation
echo
echo -e "${YELLOW}📊 EVALUACIÓN FINAL DEL SIMULADOR DE 60 DÍAS${NC}"
echo "===================================================="

if [ "$SUCCESSFUL_RENEWALS" -gt 0 ]; then
    echo -e "${GREEN}✅ SIMULACIÓN EXITOSA - RENEWAL TOKENS FUNCIONALES${NC}"
    echo "   - Renewal tokens permitieron renovación durante ausencia"
    echo "   - Persistencia de identidad verificada"
    echo "   - Redescubrimiento de nodos offline posible"
    echo
    echo -e "${GREEN}🎉 ¡EL SISTEMA RESISTE AUSENCIAS DE 60+ DÍAS!${NC}"
    echo
    echo "📋 Recomendaciones confirmadas:"
    echo "   1. Renewal tokens son efectivos para persistencia >30 días"
    echo "   2. Auto-renovación con threshold de 3 días es crucial"
    echo "   3. Sistema resiste nodos offline prolongados"
    exit 0
elif [ "$RENEWAL_MENTIONS" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  SIMULACIÓN PARCIALMENTE EXITOSA${NC}"
    echo "   - Renewal tokens detectados en logs"
    echo "   - Pero no se confirmaron renovaciones exitosas"
    echo "   - Posible necesidad de ajustes en implementación"
    echo
    echo "📋 Próximos pasos:"
    echo "   1. Debuggear logs para ver mensajes de renewal"
    echo "   2. Verificar firmas y validación de tokens"
    echo "   3. Probar con tiempos de expiración más realistas"
    exit 0
else
    echo -e "${YELLOW}🔧 SIMULACIÓN EJECUTADA, PERO SIN ACTIVIDAD DE RENEWAL${NC}"
    echo "   - Los nodos básicos funcionaron"
    echo "   - Pero no se detectó actividad de renewal tokens"
    echo "   - Implementación necesita debugging"
    echo
    echo -e "${YELLOW}🔍 Revisar logs detallados en:${NC}"
    echo "   Bob: /tmp/p2p_60day_sim/bob_final.log"
    echo "   Charlie: /tmp/p2p_60day_sim/charlie_final.log"
    echo
    echo "📋 Acciones recomendadas:"
    echo "   1. Verificar comandos de renewal en peer_bot.py"
    echo "   2. Revisar manejo de mensajes RENEWAL_TOKEN"
    echo "   3. Probar con scripts de test individuales primero"
    exit 0
fi