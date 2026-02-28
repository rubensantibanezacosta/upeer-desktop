#!/bin/bash
yggdrasil -useconffile /etc/yggdrasil.conf &
# Esperar y renombrar interfaz para consistencia con README
for i in {1..10}; do
    IFACE=$(ip -6 addr show | grep -oE "tun[0-9]+" | head -n 1)
    if [ ! -z "$IFACE" ]; then
        ip link set "$IFACE" name ygg0
        break
    fi
    sleep 1
done
echo "Interfaz ygg0 lista."
exec python3 peer_bot.py
