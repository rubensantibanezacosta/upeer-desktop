#!/bin/bash
set -e

# Generar config fresca de Yggdrasil con peers públicos
yggdrasil -genconf > /etc/yggdrasil.conf
python3 gen_config.py

# Arrancar Yggdrasil en background
yggdrasil -useconffile /etc/yggdrasil.conf &

# Esperar a que aparezca la interfaz tun
for i in {1..20}; do
    IFACE=$(ip -6 addr show 2>/dev/null | grep -oE "tun[0-9]+" | head -n 1)
    if [ -n "$IFACE" ]; then
        ip link set "$IFACE" name ygg0 2>/dev/null || true
        echo "✅ Interfaz ygg0 lista."
        break
    fi
    sleep 1
done

exec python3 peer_bot_advanced.py
