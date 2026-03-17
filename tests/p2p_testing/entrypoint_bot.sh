#!/bin/bash
set -e

# Usar nombre del nodo para el config persistente
CONF_FILE="/shared/yggdrasil_${NODE_ENV_NAME:-default}.conf"

# Generar config fresca de Yggdrasil solo si no existe
if [ ! -f "$CONF_FILE" ]; then
    echo "🛠 Generando nueva config persistente: $CONF_FILE"
    yggdrasil -genconf > "$CONF_FILE"
    python3 gen_config.py "$CONF_FILE"
fi

# Arrancar Yggdrasil en background con la config persistente
yggdrasil -useconffile "$CONF_FILE" &

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
