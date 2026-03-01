#!/bin/bash
# Rebuild the docker image just in case
docker build -t revelnest-bot -f tests/p2p_testing/Dockerfile.peer tests/p2p_testing

# Cleanup old shared states / containers
rm -rf /tmp/p2p_shared_15
mkdir -p /tmp/p2p_shared_15
docker rm -f $(docker ps -a -q --filter ancestor=revelnest-bot) 2>/dev/null || true

echo "Starting 15 nodes in a complex graph topology..."

# Node 1 (Bootstrap)
docker run -d --name p2p_node_1 --cap-add=NET_ADMIN --device=/dev/net/tun -v /tmp/p2p_shared_15:/shared -e NODE_ENV_NAME=node1 revelnest-bot
echo "Node 1 (Bootstrap) started. Waiting 5s..."
sleep 5

NODE1_DATA=$(cat /tmp/p2p_shared_15/node1.json)
TARGET1="$(echo $NODE1_DATA | grep -o '"id": "[^"]*' | cut -d '"' -f 4)@$(echo $NODE1_DATA | grep -o '"ip": "[^"]*' | cut -d '"' -f 4)"
echo "Bootstrap Node 1 is at $TARGET1"

# Helper function to start a node and return its target string
start_node() {
    local node_num=$1
    local target_env=$2
    docker run -d --name p2p_node_$node_num --cap-add=NET_ADMIN --device=/dev/net/tun -v /tmp/p2p_shared_15:/shared -e NODE_ENV_NAME=node$node_num -e TARGET_IDENTITY=$target_env revelnest-bot
    sleep 4
    local data=$(cat /tmp/p2p_shared_15/node$node_num.json)
    echo "$(echo $data | grep -o '"id": "[^"]*' | cut -d '"' -f 4)@$(echo $data | grep -o '"ip": "[^"]*' | cut -d '"' -f 4)"
}

# Topology: 
# Layer 1 connects to Bootstrap (Node 1)
echo "Starting Layer 1 (Nodes 2, 3, 4) connecting to Node 1..."
TARGET2=$(start_node 2 $TARGET1)
TARGET3=$(start_node 3 $TARGET1)
TARGET4=$(start_node 4 $TARGET1)

# Layer 2 connects to Layer 1
echo "Starting Layer 2 (Nodes 5-10) connecting to Layer 1..."
TARGET5=$(start_node 5 $TARGET2)
TARGET6=$(start_node 6 $TARGET2)
TARGET7=$(start_node 7 $TARGET3)
TARGET8=$(start_node 8 $TARGET3)
TARGET9=$(start_node 9 $TARGET4)
TARGET10=$(start_node 10 $TARGET4)

# Layer 3 connects to Layer 2
echo "Starting Layer 3 (Nodes 11-15) connecting to Layer 2..."
TARGET11=$(start_node 11 $TARGET5)
TARGET12=$(start_node 12 $TARGET6)
TARGET13=$(start_node 13 $TARGET7)
TARGET14=$(start_node 14 $TARGET9)
TARGET15=$(start_node 15 $TARGET10)

echo "Network fully deployed! 15 Nodes are running."
echo "Waiting 60 seconds for Kademlia DHT/Gossip propagation across the tree graph..."
sleep 60

echo "------------- NODE 1 (Bootstrap) LOGS --------------"
docker logs p2p_node_1 | grep -E "PEEREX|DHT|Mensaje" | tail -n 20

echo "------------- NODE 15 (Edge) LOGS --------------"
docker logs p2p_node_15 | grep -E "PEEREX|DHT|Mensaje" | tail -n 20
