#!/bin/bash
python3 gen_config.py
yggdrasil -useconffile /etc/yggdrasil.conf &
for i in {1..20}; do
    echo "Interfaces disponibles:"
    ip link show
    IFACE=$(ip link show | grep -oE "tun[0-9]+" | head -n 1)
    if [ ! -z "$IFACE" ]; then
        echo "Encontrada interfaz: $IFACE. Renombrando a ygg0..."
        ip link set "$IFACE" name ygg0
        # Wait for address assignment
        for j in {1..10}; do
            ADDR=$(ip -6 addr show ygg0 | grep "inet6 2\|inet6 3")
            if [ ! -z "$ADDR" ]; then
                echo "Interfaz ygg0 lista con IP: $ADDR"
                break 2
            fi
            echo "Esperando IP en ygg0..."
            sleep 1
        done
    fi
    echo "Esperando interfaz tun... (intento $i)"
    sleep 2
done
echo "Interfaz ygg0 lista para el Test Bot."
exec python3 test_bot.py
