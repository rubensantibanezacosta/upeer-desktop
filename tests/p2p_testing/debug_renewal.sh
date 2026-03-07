#!/bin/bash
# Debug script for renewal token flow

set -e

echo "🧪 DEBUG RENEWAL TOKEN FLOW"
echo "============================"

# Cleanup
rm -rf /tmp/debug_renewal
mkdir -p /tmp/debug_renewal
docker rm -f debug_alice debug_bob 2>/dev/null || true

# Build image
docker build -t revelnest-bot -f tests/p2p_testing/Dockerfile.peer tests/p2p_testing > /dev/null 2>&1

# Start Alice
echo "1. Starting Alice..."
docker run -d --name debug_alice --cap-add=NET_ADMIN --device=/dev/net/tun \
  -v /tmp/debug_renewal:/shared \
  -e NODE_ENV_NAME=alice \
  -e KEY_FILE=/shared/alice.key \
  revelnest-bot
sleep 8

# Get Alice info
ALICE_ID=$(python3 -c "import json; print(json.load(open('/tmp/debug_renewal/alice.json'))['id'])" 2>/dev/null || echo "")
ALICE_IP=$(python3 -c "import json; print(json.load(open('/tmp/debug_renewal/alice.json'))['ip'])" 2>/dev/null || echo "")
echo "   Alice: $ALICE_ID@$ALICE_IP"

# Start Bob connecting to Alice
echo "2. Starting Bob..."
docker run -d --name debug_bob --cap-add=NET_ADMIN --device=/dev/net/tun \
  -v /tmp/debug_renewal:/shared \
  -e NODE_ENV_NAME=bob \
  -e KEY_FILE=/shared/bob.key \
  -e TARGET_IDENTITY="${ALICE_ID}@${ALICE_IP}" \
  revelnest-bot
sleep 12

# Get Bob info
BOB_ID=$(python3 -c "import json; print(json.load(open('/tmp/debug_renewal/bob.json'))['id'])" 2>/dev/null || echo "")
BOB_IP=$(python3 -c "import json; print(json.load(open('/tmp/debug_renewal/bob.json'))['ip'])" 2>/dev/null || echo "")
echo "   Bob: $BOB_ID@$BOB_IP"

# Wait for connection
echo "3. Waiting for connection..."
sleep 5

# Test 1: Alice generates token
echo "4. Alice generates renewal token..."
echo "{\"type\": \"GENERATE_RENEWAL_TOKEN\"}" > /tmp/debug_renewal/alice.cmd
sleep 3

# Check if token file exists
if [ -f "/tmp/debug_renewal/alice_renewal_token.json" ]; then
    echo "   ✅ Token generated"
    TOKEN_TARGET=$(python3 -c "import json; print(json.load(open('/tmp/debug_renewal/alice_renewal_token.json'))['targetId'])" 2>/dev/null || echo "")
    echo "   Token target: $TOKEN_TARGET"
else
    echo "   ❌ Token NOT generated"
fi

# Test 2: Alice sends token to Bob
echo "5. Alice sends token to Bob..."
echo "{\"type\": \"SEND_RENEWAL_TOKEN\", \"target_rid\": \"$BOB_ID\"}" > /tmp/debug_renewal/alice.cmd
sleep 5

# Get logs to see what happened
echo "6. Checking logs..."
docker logs debug_alice > /tmp/debug_renewal/alice.log 2>&1
docker logs debug_bob > /tmp/debug_renewal/bob.log 2>&1

echo "=== ALICE LOGS (relevant parts) ==="
grep -i "renewal\|token\|Sent\|RECIBIDO" /tmp/debug_renewal/alice.log | head -20

echo ""
echo "=== BOB LOGS (relevant parts) ==="
grep -i "renewal\|token\|Received\|RECIBIDO\|RENEWAL" /tmp/debug_renewal/bob.log | head -20

# Test 3: Bob requests renewal for Alice
echo ""
echo "7. Bob requests renewal for Alice..."
echo "{\"type\": \"REQUEST_RENEWAL\", \"target_rid\": \"$ALICE_ID\"}" > /tmp/debug_renewal/bob.cmd
sleep 5

# Get updated logs
docker logs debug_bob > /tmp/debug_renewal/bob2.log 2>&1

echo "=== BOB LOGS AFTER REQUEST ==="
grep -i "renewal\|token\|RENEWAL\|SIMULATED\|SUCCESS\|FAILED" /tmp/debug_renewal/bob2.log | tail -20

# Cleanup
echo ""
echo "8. Cleaning up..."
docker rm -f debug_alice debug_bob > /dev/null 2>&1

echo ""
echo "🧪 DEBUG COMPLETE"