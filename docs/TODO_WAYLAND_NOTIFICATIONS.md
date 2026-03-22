# INCIDENCIA: Foco de ventana al hacer clic en notificación (Wayland/Linux)

## Descripción
En sistemas Linux bajo el protocolo **Wayland**, al hacer clic en una notificación creada con `new Notification()` de Electron, la ventana de la aplicación no recupera el foco automáticamente. Electron no pasa el token de activación de `libnotify` a Chromium en el evento de clic.

## Estado Actual — MITIGADO
- **Bug reportado:** [Electron Issue #9919](https://github.com/electron/electron/issues/9919)
- **PR con el fix:** [Electron PR #50269](https://github.com/electron/electron/pull/50269) (abierto el 14 de marzo de 2026).
- **Versión de Electron actual:** 40.6.1 (Sin el fix nativo).

## Análisis de VS Code
VS Code (también Electron) funciona porque **no fuerza Wayland nativo** — corre bajo XWayland por defecto, donde X11 permite `win.focus()` sin tokens de activación. VS Code usa `restore()` → `focus()` → `webContents.focus()` sin hacks de `setAlwaysOnTop`.

## Solución Implementada
En lugar de depender del `Notification` de Electron en Wayland, se usa **`notify-send`** con `--action` y `--wait` (libnotify ≥ 0.8.0). Las notificaciones pasan por el **portal XDG** (`xdg-desktop-portal`), que maneja los tokens de activación correctamente y activa la ventana de la app al hacer clic.

### Módulos creados
- [src/main_process/utils/desktopNotification.ts](src/main_process/utils/desktopNotification.ts): Detecta Wayland y usa `notify-send` con fallback a Electron `Notification`.
- [src/main_process/utils/windowFocus.ts](src/main_process/utils/windowFocus.ts): Foco de ventana cross-platform inspirado en VS Code (`restore` → `show` → `focus` → `webContents.focus` + `flashFrame` en Linux).

### Estrategia por plataforma
| Plataforma | Notificación | Foco al click |
|---|---|---|
| Linux/Wayland | `notify-send --action --wait` (portal XDG) | Portal activa la ventana + `focusWindow()` |
| Linux/X11 | Electron `Notification` | `app.focus({steal:true})` + `win.focus()` |
| macOS/Windows | Electron `Notification` | `app.focus({steal:true})` + `win.focus()` |

## TODO Pendiente
1. **Monitorear PR #50269:** Cuando se mergee, se podrá simplificar eliminando la rama `notify-send`.
2. **Actualizar Electron:** Actualizar cuando salga la versión con el fix (probablemente v41+).
