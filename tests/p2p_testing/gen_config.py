import sys

public_peers = [
    "tcp://94.159.110.4:65535",
    "tcp://87.251.77.39:65535",
    "tls://159.195.4.143:9001"
]

with open('/etc/yggdrasil.conf', 'r') as f:
    config_str = f.read()

import re

# Reemplazamos la lista vacía de Peers
new_peers = "Peers: [\n    " + ",\n    ".join([f'"{p}"' for p in public_peers]) + "\n  ]"
config_str = config_str.replace("Peers: []", new_peers)

# Deshabilitar descubrimiento local (Multicast) para FORZAR enrutamiento por Internet
config_str = re.sub(r'MulticastInterfaces: \[.*?\]', 'MulticastInterfaces: []', config_str, flags=re.DOTALL)

# Aseguramos que el TUN esté activado si no lo está (Yggdrasil lo hace solo, pero por si acaso)
with open('/etc/yggdrasil.conf', 'w') as f:
    f.write(config_str)
