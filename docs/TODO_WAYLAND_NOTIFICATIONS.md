# INCIDENCIA: Foco de ventana al hacer clic en notificación (Wayland/Linux)

## Descripción
En sistemas Linux bajo el protocolo **Wayland**, al hacer clic en una notificación de sistema, la ventana de la aplicación no recupera el foco automáticamente ni se muestra al frente, incluso llamando a `app.focus({ steal: true })` y `win.show()`.

## Estado Actual
El problema reside en el núcleo (C++) de Electron, que no implementa correctamente el paso del token de activación de `libnotify` a Chromium en el evento de clic. 

- **Bug reportado:** [Electron Issue #9919](https://github.com/electron/electron/issues/9919)
- **PR con el fix:** [Electron PR #50269](https://github.com/electron/electron/pull/50269) (abierto el 14 de marzo de 2026).
- **Versión de Electron actual:** 40.6.1 (Sin el fix).

## Resolución Pendiente (TODO)
1. **Monitorear PR #50269:** Verificar cuándo se mergea en la rama `main` de Electron.
2. **Actualizar Electron:** Una vez publicada una versión que incluya el fix (probablemente 40.7.x o v41), actualizar `package.json`.
3. **Limpieza de código:** Tras la actualización, se podrán simplificar los handlers de notificaciones en:
   - [src/main_process/network/handlers/chat.ts](src/main_process/network/handlers/chat.ts)
   - [src/main_process/network/handlers/groups.ts](src/main_process/network/handlers/groups.ts)
   Eliminando los "tricks" de `setAlwaysOnTop(true)` y `moveTop()`.

## Workarounds Aplicados
Se han implementado las siguientes medidas de mitigación que funcionan parcialmente o en X11/XWayland:
- Uso de `app.focus({ steal: true })`.
- Secuencia `restore()` -> `show()` -> `setAlwaysOnTop(true)` -> `moveTop()`.
- Timeout de 200ms para asegurar que la ventana es visible antes de enviar el evento IPC `focus-conversation`.
