#!/bin/bash
# Script to connect a bot to user's upeer instance

set -e

USER_IDENTITY="a169346e249181b306156c7caa265d6d:7704:49e5:b4cd:7910:2191:2574:351b"
CONTAINER_NAME="upeer-bot-user"

echo "Connecting to user: $USER_IDENTITY"

# Cleanup old container if exists
docker rm -f $CONTAINER_NAME 2>/dev/null || true

# Create shared directory for metrics
mkdir -p /tmp/upeer_shared

echo "Starting bot container..."
docker run -d \
  --name $CONTAINER_NAME \
  --cap-add=NET_ADMIN \
  --device=/dev/net/tun \
  -v /tmp/upeer_shared:/shared \
  -e NODE_ENV_NAME="user_bot" \
  -e TARGET_IDENTITY="$USER_IDENTITY" \
  upeer-bot

echo "Container started. Waiting for Yggdrasil to initialize..."
sleep 10

echo "Showing logs..."
docker logs $CONTAINER_NAME --tail 30

echo ""
echo "Bot is now running and attempting to connect to the user."
echo "It will send HANDSHAKE_REQ every 30 seconds until connection is established."
echo ""
echo "To view logs: docker logs -f $CONTAINER_NAME"
echo "To stop: docker rm -f $CONTAINER_NAME"