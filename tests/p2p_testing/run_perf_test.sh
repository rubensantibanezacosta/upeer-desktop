#!/bin/bash
# Rebuild the docker image just in case
docker build -t upeer-bot -f tests/p2p_testing/Dockerfile.peer tests/p2p_testing

# Cleanup old shared states / containers
rm -rf /tmp/p2p_shared_perf
mkdir -p /tmp/p2p_shared_perf
docker rm -f p2p_perf_server p2p_perf_client 2>/dev/null || true

echo "Starting Server Node (Listener NAT 1)"
docker run -d --name p2p_perf_server --cap-add=NET_ADMIN --device=/dev/net/tun -v /tmp/p2p_shared_perf:/shared -e MODE=SERVER --entrypoint /bin/bash upeer-bot -c "yggdrasil -genconf > /etc/yggdrasil.conf && python3 gen_config.py && yggdrasil -useconffile /etc/yggdrasil.conf & sleep 10 && python3 perf_metric.py"

echo "Waiting for Server to assign global IPv6 in the Yggdrasil network..."
sleep 20

SERVER_IP=$(cat /tmp/p2p_shared_perf/server_perf.json | grep -o '\"ip\": \"[^\"]*' | cut -d '"' -f 4)
echo "Server IPv6: $SERVER_IP"

echo "Starting Client Node (Sender NAT 2)"
docker run --name p2p_perf_client --cap-add=NET_ADMIN --device=/dev/net/tun -v /tmp/p2p_shared_perf:/shared -e MODE=CLIENT -e TARGET_IP=$SERVER_IP --entrypoint /bin/bash upeer-bot -c "yggdrasil -genconf > /etc/yggdrasil.conf && python3 gen_config.py && yggdrasil -useconffile /etc/yggdrasil.conf & sleep 15 && python3 perf_metric.py"
