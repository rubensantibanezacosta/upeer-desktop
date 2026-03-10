#!/bin/bash
# Rebuild the docker image
docker build -t upeer-bot -f tests/p2p_testing/Dockerfile.peer tests/p2p_testing

# Cleanup
rm -rf /tmp/p2p_shared
mkdir -p /tmp/p2p_shared
docker rm -f p2p_relay p2p_victim p2p_prober 2>/dev/null || true

echo "1. Levantando Relay (Nodo que sabrá las IPs)..."
docker run -d --name p2p_relay --cap-add=NET_ADMIN --device=/dev/net/tun -v /tmp/p2p_shared:/shared -e NODE_ENV_NAME=relay upeer-bot
sleep 5

RELAY_DATA=$(cat /tmp/p2p_shared/relay.json)
RELAY_ID=$(echo $RELAY_DATA | grep -o '"id": "[^"]*' | cut -d '"' -f 4)
RELAY_IP=$(echo $RELAY_DATA | grep -o '"ip": "[^"]*' | cut -d '"' -f 4)
TARGET_RELAY="${RELAY_ID}@${RELAY_IP}"

echo "2. Levantando Víctima (Nodo que cambiará de IP)..."
# Usamos un archivo de llaves para mantener la identidad
docker run -d --name p2p_victim --cap-add=NET_ADMIN --device=/dev/net/tun -v /tmp/p2p_shared:/shared -e NODE_ENV_NAME=victim -e KEY_FILE=/shared/victim.key -e TARGET_IDENTITY=$TARGET_RELAY upeer-bot
sleep 5

VICTIM_DATA=$(cat /tmp/p2p_shared/victim.json)
VICTIM_ID=$(echo $VICTIM_DATA | grep -o '"id": "[^"]*' | cut -d '"' -f 4)
VICTIM_IP=$(echo $VICTIM_DATA | grep -o '"ip": "[^"]*' | cut -d '"' -f 4)
VICTIM_PK_HEX=$(docker logs p2p_victim | grep "Mi Public-Key es:" | cut -d ' ' -f 5)

echo "Víctima ID: $VICTIM_ID"
echo "Víctima PK: $VICTIM_PK_HEX"

echo "3. Levantando Prober (Nodo que lanzará la búsqueda reactiva)..."
docker run -d --name p2p_prober --cap-add=NET_ADMIN --device=/dev/net/tun -v /tmp/p2p_shared:/shared -e NODE_ENV_NAME=prober -e TARGET_IDENTITY=$TARGET_RELAY upeer-bot
sleep 10

# Añadimos a la Víctima manualmente al Prober con su IP INICIAL
# Pero Prober no sabe que Víctima morirá y cambiará de IP.
echo "{\"type\": \"ADD_CONTACT\", \"rid\": \"$VICTIM_ID\", \"address\": \"$VICTIM_IP\", \"pk\": \"$VICTIM_PK_HEX\"}" > /tmp/p2p_shared/prober.cmd
sleep 2

echo "4. Matando Víctima y re-apareciendo en una nueva interfaz/contenedor (Nueva IP)..."
docker rm -f p2p_victim
sleep 2
# La identidad se carga del archivo victim.key
docker run -d --name p2p_victim --cap-add=NET_ADMIN --device=/dev/net/tun -v /tmp/p2p_shared:/shared -e NODE_ENV_NAME=victim -e KEY_FILE=/shared/victim.key -e TARGET_IDENTITY=$TARGET_RELAY upeer-bot
echo "Víctima ha vuelto. Esperando 20s para que se anuncie al Relay..."
sleep 20

VICTIM_DATA_NEW=$(cat /tmp/p2p_shared/victim.json)
VICTIM_ID_NEW=$(echo $VICTIM_DATA_NEW | grep -o '"id": "[^"]*' | cut -d '"' -f 4)
VICTIM_IP_NEW=$(echo $VICTIM_DATA_NEW | grep -o '"ip": "[^"]*' | cut -d '"' -f 4)

if [ "$VICTIM_ID" != "$VICTIM_ID_NEW" ]; then
    echo "¡ERROR! El ID de la víctima ha cambiado ($VICTIM_ID vs $VICTIM_ID_NEW)"
    exit 1
fi

echo "Víctima ha vuelto con el MISMO ID pero NUEVA IP: $VICTIM_IP_NEW"
sleep 5

# Ahora pedimos al Prober que envíe un mensaje a la Víctima (usará la IP VIEJA guardada: $VICTIM_IP)
echo "5. Lanzando el ataque: Prober intenta hablar con Víctima en su IP antigua ($VICTIM_IP)..."
echo "{\"type\": \"SEND_CHAT\", \"target_rid\": \"$VICTIM_ID\", \"content\": \"Test Reactive Discovery Success\"}" > /tmp/p2p_shared/prober.cmd

echo "Esperando 20 segundos para que ocurra el Timeout -> Query al Relay -> Discovery -> Chat final..."
sleep 20

echo "------------- PROBER LOGS --------------"
docker logs p2p_prober

echo "------------- RELAY LOGS --------------"
docker logs p2p_relay

echo "------------- VICTIM LOGS --------------"
docker logs p2p_victim
