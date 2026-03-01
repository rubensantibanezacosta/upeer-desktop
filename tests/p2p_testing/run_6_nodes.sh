#!/bin/bash
# Rebuild the docker image just in case
docker build -t revelnest-bot -f tests/p2p_testing/Dockerfile.peer tests/p2p_testing

# Cleanup old shared states / containers
rm -rf /tmp/p2p_shared
mkdir -p /tmp/p2p_shared
docker rm -f p2p_node_1 p2p_node_2 p2p_node_3 p2p_node_4 p2p_node_5 p2p_node_6 2>/dev/null || true

echo "Starting 6 nodes..."

# Node 1
docker run -d --name p2p_node_1 --cap-add=NET_ADMIN --device=/dev/net/tun -v /tmp/p2p_shared:/shared -e NODE_ENV_NAME=node1 revelnest-bot
echo "Node 1 started. Waiting 5s for Yggdrasil IP and JSON export..."
sleep 5

# Get target for Node 2 from the node 1 file
NODE1_DATA=$(cat /tmp/p2p_shared/node1.json)
NODE1_ID=$(echo $NODE1_DATA | grep -o '"id": "[^"]*' | cut -d '"' -f 4)
NODE1_IP=$(echo $NODE1_DATA | grep -o '"ip": "[^"]*' | cut -d '"' -f 4)

TARGET1="${NODE1_ID}@${NODE1_IP}"
echo "Node 1 is at $TARGET1"

# Node 2
docker run -d --name p2p_node_2 --cap-add=NET_ADMIN --device=/dev/net/tun -v /tmp/p2p_shared:/shared -e NODE_ENV_NAME=node2 -e TARGET_IDENTITY=$TARGET1 revelnest-bot
echo "Node 2 started connecting to Node 1. Waiting..."
sleep 5

NODE2_DATA=$(cat /tmp/p2p_shared/node2.json)
NODE2_ID=$(echo $NODE2_DATA | grep -o '"id": "[^"]*' | cut -d '"' -f 4)
NODE2_IP=$(echo $NODE2_DATA | grep -o '"ip": "[^"]*' | cut -d '"' -f 4)
TARGET2="${NODE2_ID}@${NODE2_IP}"

# Node 3
docker run -d --name p2p_node_3 --cap-add=NET_ADMIN --device=/dev/net/tun -v /tmp/p2p_shared:/shared -e NODE_ENV_NAME=node3 -e TARGET_IDENTITY=$TARGET2 revelnest-bot
echo "Node 3 started connecting to Node 2. Waiting..."
sleep 5

NODE3_DATA=$(cat /tmp/p2p_shared/node3.json)
NODE3_ID=$(echo $NODE3_DATA | grep -o '"id": "[^"]*' | cut -d '"' -f 4)
NODE3_IP=$(echo $NODE3_DATA | grep -o '"ip": "[^"]*' | cut -d '"' -f 4)
TARGET3="${NODE3_ID}@${NODE3_IP}"

# Node 4
docker run -d --name p2p_node_4 --cap-add=NET_ADMIN --device=/dev/net/tun -v /tmp/p2p_shared:/shared -e NODE_ENV_NAME=node4 -e TARGET_IDENTITY=$TARGET3 revelnest-bot
echo "Node 4 started connecting to Node 3. Waiting..."
sleep 5

NODE4_DATA=$(cat /tmp/p2p_shared/node4.json)
NODE4_ID=$(echo $NODE4_DATA | grep -o '"id": "[^"]*' | cut -d '"' -f 4)
NODE4_IP=$(echo $NODE4_DATA | grep -o '"ip": "[^"]*' | cut -d '"' -f 4)
TARGET4="${NODE4_ID}@${NODE4_IP}"

# Node 5
docker run -d --name p2p_node_5 --cap-add=NET_ADMIN --device=/dev/net/tun -v /tmp/p2p_shared:/shared -e NODE_ENV_NAME=node5 -e TARGET_IDENTITY=$TARGET4 revelnest-bot
echo "Node 5 started connecting to Node 4. Waiting..."
sleep 5

NODE5_DATA=$(cat /tmp/p2p_shared/node5.json)
NODE5_ID=$(echo $NODE5_DATA | grep -o '"id": "[^"]*' | cut -d '"' -f 4)
NODE5_IP=$(echo $NODE5_DATA | grep -o '"ip": "[^"]*' | cut -d '"' -f 4)
TARGET5="${NODE5_ID}@${NODE5_IP}"

# Node 6
docker run -d --name p2p_node_6 --cap-add=NET_ADMIN --device=/dev/net/tun -v /tmp/p2p_shared:/shared -e NODE_ENV_NAME=node6 -e TARGET_IDENTITY=$TARGET5 revelnest-bot
echo "Node 6 started connecting to Node 5."
sleep 5

echo "Network fully deployed! Nodes 1 through 6 are running."
echo "Waiting 30 seconds for DHT_EXCHANGE propagation across the linear graph..."
sleep 30

echo "------------- NODE 1 LOGS --------------"
docker logs p2p_node_1

echo "------------- NODE 6 LOGS --------------"
docker logs p2p_node_6
