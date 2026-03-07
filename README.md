# 🌐 RevelNest Chat P2P

<div align="center">

**Chat 100% descentralizado con red mesh Yggdrasil - Sin servidores, sin censura, sin vigilancia**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-green)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-3178C6?logo=typescript&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-40-47848F?logo=electron&logoColor=white)

</div>

## ✨ Características Principales

### 🔒 **Privacidad Total (E2EE)**
- **Cifrado de extremo a extremo** con X25519, Salsa20 y Poly1305
- **Secreto Perfectamente Adelantado (PFS)** estilo Signal para sesiones de chat
- **Firmas criptográficas** Ed25519 en todos los mensajes y ACKs
- **Verificación de huellas digitales** para prevenir ataques Man-in-the-Middle

### 🌐 **Red Mesh Descentralizada**
- **Integración nativa de Yggdrasil** como sidecar de la aplicación
- **IPv6 global inmutable** (rango `200::/7`) superando NAT, CGNAT y firewalls
- **Kademlia DHT estructurada** para descubrimiento de contactos en hiper-escala
- **Roaming Zero-Trust** con actualizaciones de IP firmadas criptográficamente

### 💬 **Experiencia de Chat Premium**
- **Interfaz moderna** con Joy UI (Material Design 3)
- **Mensajería en tiempo real** con ACKs y estados de lectura (✓✓ azul)
- **Reacciones con emojis**, edición y eliminación de mensajes
- **Indicadores de presencia**: "En línea", "Escribiendo...", última conexión
- **Respuestas y citas** de mensajes anteriores
- **Gestión de contactos** con sistema de identidad RevelNest ID

### 🚀 **Arquitectura de Instalación Inteligente**
- **Paquetes nativos**: Debian (.deb), RPM (.rpm), Windows (.exe), macOS (.zip)
- **Servicio systemd dedicado** (`revelnest-yggdrasil.service`)
- **Instalación única de permisos** - sin diálogos técnicos en cada arranque
- **Binarios Yggdrasil incluidos** para todas las plataformas
- **Detección automática**: prioriza servicio systemd, fallback a sidecar embebido

## 📦 Instalación

### Linux (Debian/Ubuntu)
```bash
# Descargar el paquete .deb más reciente
wget https://github.com/revelnest/chat-p2p/releases/latest/download/revelnest-chat_1.0.0_amd64.deb

# Instalar (requiere sudo solo una vez)
sudo apt install ./revelnest-chat_1.0.0_amd64.deb

# Iniciar la aplicación
revelnest-chat
```

**Durante la instalación se configuran automáticamente:**
- 📡 **Servicio de red mesh** (`revelnest-yggdrasil.service`)
- 👤 **Usuario/grupo dedicado** `yggdrasil:yggdrasil`
- 🔧 **Configuración Yggdrasil** en `/etc/revelnest/yggdrasil.conf`
- 🔐 **Capabilities Linux** (`cap_net_admin,cap_net_raw`) para evitar root

### Windows
```powershell
# Descargar el instalador .exe
# Ejecutar como administrador (solo primera vez)
# La aplicación se instalará en Program Files
```

### macOS
```bash
# Descargar el archivo .zip
# Extraer y arrastrar RevelNest Chat.app a /Applications
```

## 🚀 Primeros Pasos

1. **Inicia la aplicación** por primera vez
2. **Tu identidad se generará automáticamente** (RevelNest ID)
3. **Comparte tu ID** con amigos para que te agreguen
4. **¡Comienza a chatear!** La red mesh se conectará automáticamente

```bash
# Ejemplo de flujo
$ revelnest-chat
🌐 Conectando a la red RevelNest...
✅ Red mesh activa con IPv6: 200:xxxx:xxxx:xxxx
🆔 Tu ID RevelNest: 802d20068fe07d3c3c16a15491210cd2
✅ Listo para chatear de forma segura y descentralizada
```

## 🏗️ Arquitectura Técnica

### Stack Tecnológico
- **Framework**: Electron 40 + Vite + TypeScript
- **UI**: React 19 + Joy UI (Material Design 3)
- **Base de datos**: SQLite con Drizzle ORM
- **Criptografía**: sodium-native (libsodium)
- **Red**: Yggdrasil v0.5.12 (sidecar integrado)
- **Empaquetado**: Electron Forge con makers para todas las plataformas

### Sistema de Red Mejorado
```
┌─────────────────────────────────────────────────────────────┐
│                    RevelNest Chat P2P                        │
├─────────────────────────────────────────────────────────────┤
│  Renderer (React)       ↔       Main Process (Electron)     │
│  • Interfaz de usuario  │  • Gestión de identidad           │
│  • Componentes Joy UI   │  • Criptografía (claves privadas) │
│  • Estado de la app     │  • Validación de firmas           │
├─────────────────────────┼───────────────────────────────────┤
│                         │  • Protocolo UDP P2P              │
│                         │  • Kademlia DHT (descubrimiento)  │
│                         │  • SQLite (mensajes, contactos)   │
├─────────────────────────┴───────────────────────────────────┤
│                    Yggdrasil Mesh Network                    │
│  • Sidecar integrado / Servicio systemd                      │
│  • IPv6 global (200::/7)                                     │
│  • Conexión P2P directa sin servidores                      │
└─────────────────────────────────────────────────────────────┘
```

### Protocolo de Mensajería
- **Mensajes firmados**: Todos los paquetes incluyen firma Ed25519
- **ACKs de entrega**: Confirmación de recepción con doble check
- **Cifrado E2EE**: crypto_box (X25519 + Salsa20/Poly1305) por sesión
- **Ratchet de claves**: Actualización de claves por mensaje (PFS)
- **DHT para descubrimiento**: Kademlia para encontrar contactos perdidos

## 🛠️ Desarrollo

### Requisitos
- Node.js 18+
- npm 10+
- Git

### Clonar y configurar
```bash
# Clonar el repositorio
git clone https://github.com/revelnest/chat-p2p.git
cd chat-p2p

# Instalar dependencias
npm install

# Iniciar en modo desarrollo
npm start

# Construir paquetes de distribución
npm run make
```

### Estructura del Proyecto
```
chat-p2p/
├── src/
│   ├── main/              # Proceso principal de Electron
│   │   ├── network/       # Protocolo UDP, DHT, criptografía
│   │   ├── sidecars/      # Integración Yggdrasil (yggdrasil.ts)
│   │   └── database/      # SQLite con Drizzle ORM
│   ├── renderer/          # Interfaz React + Joy UI
│   └── preload/           # Puente IPC seguro
├── resources/
│   └── bin/              # Binarios Yggdrasil multi-plataforma
├── install-scripts/       # Scripts para paquetes Debian/RPM
├── drizzle/              # Migraciones y esquemas de BD
└── tests/                # Pruebas automatizadas
```

### Comandos útiles
```bash
# Desarrollo
npm start                    # Iniciar aplicación en desarrollo
npm run lint                # Verificar código TypeScript

# Construcción
npm run package             # Crear paquete portable
npm run make                # Generar instaladores para todas las plataformas

# Pruebas
npm run test-phase11        # Probar reacciones, edición y eliminación
```

## 📋 Roadmap

El proyecto ha completado 11 fases de desarrollo y se encuentra en producción:

### ✅ Completado (Fases 1-11)
1. **Cimientos**: Electron + Vite + React + TypeScript
2. **Mensajería básica**: Protocolo UDP sobre Yggdrasil
3. **Persistencia**: SQLite con historial de chats
4. **UX avanzada**: Estados de presencia, "escribiendo...", última conexión
5. **Identidad soberana**: RevelNest ID con firmas Ed25519
6. **Gestión de contactos**: Interfaz premium con Joy UI
7. **Privacidad total**: Cifrado E2EE con PFS
8. **Red de descubrimiento**: Kademlia DHT para escalabilidad
9. **Sidecar Yggdrasil integrado**: Sistema de instalación inteligente
10. **Descubrimiento reactivo**: DHT Query para auto-recuperación
11. **Interacción social**: Reacciones, edición, eliminación de mensajes

### 🚀 Próximamente (Fase 12)
- **Archivos y multimedia**: Protocolo de fragmentos para imágenes/audio
- **Llamadas de voz/video**: WebRTC sobre Yggdrasil
- **Grupos y canales**: Chat grupal descentralizado
- **Plugins y extensiones**: Ecosistema de funcionalidades

Para ver el roadmap completo y detallado, consulta [RevelNest_Roadmap.md](./RevelNest_Roadmap.md).

## 🤝 Contribuir

¡Las contribuciones son bienvenidas! RevelNest Chat es un proyecto de código abierto que busca democratizar las comunicaciones descentralizadas.

### Cómo contribuir
1. **Reportar bugs**: Abre un issue describiendo el problema
2. **Sugerir características**: Comparte tus ideas para mejorar la aplicación
3. **Enviar PRs**: 
   - Sigue las convenciones de código TypeScript
   - Incluye pruebas cuando sea posible
   - Documenta los cambios importantes
4. **Mejorar documentación**: Ayuda a hacer la app más accesible

### Guías de desarrollo
- **Estética RevelNest**: Usa Joy UI con bordes `xl`, sombras `lg` y paleta armónica
- **Zero-Trust**: El renderer nunca maneja claves privadas
- **Validación con bot**: Prueba nuevas funcionalidades con `peer_bot` antes de integrar

## 📄 Licencia

Este proyecto está licenciado bajo la **Licencia MIT** - ver el archivo [LICENSE](LICENSE) para más detalles.

## 🌟 Agradecimientos

- **Yggdrasil Network**: Por proporcionar una red mesh IPv6 global y descentralizada
- **Electron y Vite**: Por hacer posible aplicaciones desktop multi-plataforma modernas
- **Joy UI**: Por el sistema de diseño premium que potencia la interfaz
- **Contribuidores**: A todos los que creen en un internet descentralizado y libre

## 🔗 Enlaces

- **Sitio web**: [https://revelnest.chat](https://revelnest.chat)
- **Repositorio**: [https://github.com/revelnest/chat-p2p](https://github.com/revelnest/chat-p2p)
- **Roadmap detallado**: [RevelNest_Roadmap.md](./RevelNest_Roadmap.md)
- **Reportar problemas**: [Issues](https://github.com/revelnest/chat-p2p/issues)

---

<div align="center">

**🌐 Conectando personas, no servidores**

*"La verdadera privacidad no es tener algo que ocultar, sino tener algo que proteger"*

</div>