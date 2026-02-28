# 🌐 RevelNet (Yggdrasil & Electron)

Este proyecto desarrolla un sistema de comunicación **100% descentralizado** que utiliza la red mesh **Yggdrasil** para garantizar conectividad IPv6 global, superando las barreras de NAT, CGNAT y las limitaciones de los ISPs.

## 🏁 Validación Técnica (Fase Completada)

Hemos verificado con éxito que es posible establecer comunicaciones P2P directas en este sistema:

1.  **Red Mesh Activa:** Instalación de Yggdrasil (v0.5.12) con peering a nodos públicos.
2.  **Identidad IPv6:** Cada nodo tiene una dirección global inmutable (rango `200::/7`).
3.  **Transporte UDP:** Validación de envío/recepción de datagramas cifrados de extremo a extremo sin servidores centrales (Relay/STUN).

---

## 🏗️ Planificación del Desarrollo (Chat Real)

El objetivo es construir una aplicación "Zero-Config" para usuarios no técnicos, donde la complejidad de la red mesh quede oculta tras una interfaz moderna.

### 💻 Stack Tecnológico

- **Framework:** [Electron](https://www.electronjs.org/) (Multiplataforma).
- **Constructor:** [Electron Forge](https://www.electronforge.io/) (Ecosistema oficial).
- **Bundler:** [Vite](https://vitejs.dev/) (Velocidad extrema en desarrollo).
- **Lenguaje:** [TypeScript](https://www.typescriptlang.org/) (Seguridad de tipos y escalabilidad).
- **UI Library:** [Joy UI](https://mui.com/joy-ui/getting-started/) (Aesthetics premium y minimalismo).
- **Red:** Integración de Yggdrasil como proceso secundario o "sidecar".

### 📋 Roadmap del Producto

#### Fase 1: Entorno de Desarrollo (TypeScript + Forge)

- Inicialización con la plantilla `vite-typescript` de Electron Forge.
- Configuración de `preload.js` con tipos estrictos para la comunicación IPC.
- Integración de Joy UI y configuración del sistema de diseño (Dark Mode por defecto).

#### Fase 2: Control de Red (Bridging)

- Lógica en el proceso `Main` para detectar e interactuar con la interfaz `ygg0`.
- Implementación de un sistema de "Health Check" para asegurar que la red mesh esté activa antes de iniciar el chat.
- Gestión automática del par de llaves (identidad del usuario).

#### Fase 3: Protocolo P2P de Mensajería

- Implementación de un servidor UDP/TCP escuchando en la IPv6 de Yggdrasil.
- Serialización de mensajes con JSON o Protocol Buffers.
- Sistema de confirmación de entrega (ACKs) y gestión de estados (Enviado, Recibido, Leído).

#### Fase 4: UX & Aesthetics

- Diseño de una lista de contactos basada en "IDs de Red" amigables.
- Indicadores visuales de estado de conexión mesh.
- Sistema de notificaciones nativas y persistencia local (SQLite/TypeORM).

---

## 🛠️ Instrucciones de Inicio Rápido (Devs)

Para inicializar el entorno de desarrollo:

```bash
# Crear el proyecto con Electron Forge + Vite + TS (No interactivo)
npx -y create-electron-app@latest . --template=vite-typescript

# Instalar Joy UI y dependencias de estilos
npm install @mui/joy @emotion/react @emotion/styled
```

---

_Este proyecto busca democratizar el acceso a redes P2P reales, eliminando la vigilancia de servidores centrales._
