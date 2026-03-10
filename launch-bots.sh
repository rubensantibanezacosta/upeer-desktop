#!/bin/bash
# launch-bots.sh — Lanza los 3 bots avanzados de upeer
#
# Uso:
#   ./launch-bots.sh [TARGET_IDENTITY]
#
# Ejemplo:
#   ./launch-bots.sh a64a5ea070f3066f96d71af21101837f@200:7704:49e5:b4cd:7910:2191:2574:351b
#
# Si no se pasa argumento, usa el TARGET_IDENTITY del docker-compose.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/tests/p2p_testing/docker-compose-bots.yml"

# Actualizar TARGET si se pasa como argumento
if [ -n "$1" ]; then
    echo "🎯 Usando target: $1"
    sed -i "s|TARGET_IDENTITY=.*|TARGET_IDENTITY=$1|g" "$COMPOSE_FILE"
fi

echo "🔨 Construyendo imágenes..."
docker compose -f "$COMPOSE_FILE" build

echo "🚀 Arrancando bots..."
docker compose -f "$COMPOSE_FILE" up -d

echo ""
echo "✅ Bots arrancados:"
echo "   docker logs -f bot-alice    → bot amigable (emojis, responde rápido)"
echo "   docker logs -f bot-bob      → bot formal (técnico, responde lento)"
echo "   docker logs -f bot-carlos   → bot casual (humor, impredecible)"
echo ""
echo "🛑 Para parar todos:"
echo "   docker compose -f tests/p2p_testing/docker-compose-bots.yml down"
echo ""
echo "📋 Estado:"
docker compose -f "$COMPOSE_FILE" ps
