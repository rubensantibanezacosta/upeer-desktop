---
description: Planificación del Chat P2P con Electron, Vite y Joy UI
---

# Estrategia de Desarrollo: P2P Chat (Mesh Edition)

Sigue estos pasos para construir la aplicación desde cero:

### 1. Inicialización del Proyecto

// turbo

```bash
npx create-electron-vite@latest ./ --template react
npm install @mui/joy @emotion/react @emotion/styled
```

### 2. Integración de Red (Yggdrasil sidecar)

Crear un servicio en el proceso de Electron `main/` que:

- Verifique si Yggdrasil está instalado en el sistema.
- En caso negativo, ofrezca descargarlo o use un binario embebido.
- Exponga la IPv6 de la interfaz `ygg0` al Frontend mediante `preload.js`.

### 3. Diseño de la UI con Joy UI

- Crear un `ColorSchemeProvider` para soporte nativo de Modo Oscuro/Claro.
- Diseñar un componente `PeerStatus` que brille en verde cuando haya conexión mesh.
- Crear un Input de chat limpio con micro-interacciones de envío.

### 4. Lógica de Comunicación (IPC)

- **Renderer -> Main:** "Enviar mensaje a [IPv6]"
- **Main -> Renderer:** "Mensaje recibido de [IPv6]"

### 5. Empaquetado

- Usar `electron-builder` para generar los instaladores.
- Asegurar que el instalador solicite permisos administrativos (UAC en Windows, sudo en Linux) para crear la interfaz de red virtual.
