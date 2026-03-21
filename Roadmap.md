# Roadmap uPeer

_Última actualización: 12 Marzo 2026_

---

## ✅ Completado

### Núcleo P2P y red

- [x] Motor UDP sobre Yggdrasil IPv6 — comunicación P2P sin servidores
- [x] Kademlia DHT completa — 160 buckets, K=20, α=3, lookup O(log n)
- [x] Bootstrap diversificado — DNS TXT, LAN multicast, seed nodes, contactos existentes
- [x] LAN discovery — anuncios `ff02::1` cada 30 s
- [x] Detección de cambio de IP y rediscovery automático (<60 s)
- [x] Sovereign roaming — protocolo DHT_UPDATE firmado a contactos íntimos
- [x] Timeouts e inteligencia de ruta — fallback DHT tras 5 s sin ACK
- [x] **Protocolo Kademlia Full-Duplex** — implementación completa de `DHT_STORE_ACK` y `DHT_PONG` para estabilidad de red

### Seguridad y privacidad

- [x] Cifrado E2EE — Salsa20/Poly1305 + PFS estilo Signal (ratchet por contador y tiempo)
- [x] Firmas Ed25519 obligatorias en todos los paquetes
- [x] Zero leaks de contactCache — metadatos de contactos eliminados de mensajes
- [x] Contact tokens efímeros — TTL 5 min para reducir exposición de IP
- [x] Rate limiting — token bucket por IP y tipo de mensaje
- [x] Proof-of-Work adaptativo — dificultad ajustable por reputación
- [x] Renewal tokens delegados — persistencia 60+ días offline, máx. 3 renovaciones
- [x] Sistema de reputación social — grafo social contra ataques Sybil
- [x] Validación de input en IPC — límites de longitud (alias 100 chars, avatar 2 MB, nombre grupo 100 chars) en todos los handlers de `main.ts`
- [x] Path traversal bloqueado — `read-file-as-base64`, `start-file-transfer`, `save-transferred-file` restringen rutas al homeDir
- [x] Número de seguridad real — SHA-256 sobre claves ordenadas (no prefijo crudo)
- [x] Alertas TOFU — notificación en UI cuando cambia la clave estática de un contacto
- [x] **Serialización Canónica Interoperable** — implementación de `canonicalStringify` en Python para compatibilidad total de firmas con el cliente TS

### Identidad y autenticación

- [x] Identidad mnemónica — clave Ed25519 derivada de 12 palabras BIP39
- [x] upeer ID — identificador derivado del hash de clave pública
- [x] Sesiones bloqueables — `lock-session` / `unlock-session` con PIN

### Mensajería

- [x] Mensajes de texto E2EE con ACK, entrega y lectura (doble check azul)
- [x] Reacciones con emoji — protocolo CHAT_REACTION firmado, UI con selector rápido
- [x] Edición de mensajes — CHAT_UPDATE con indicador "(Editado)"
- [x] Eliminación para todos — CHAT_DELETE firmado, marcado visual
- [x] Respuestas/citas — por UUID con vista previa del mensaje original
- [x] Indicador "Escribiendo…" — en tiempo real con debounce (2,5 s)
- [x] Presencia — "En línea" / "Última vez visto" por heartbeats autenticados
- [x] Vault — almacén cifrado de mensajes para contactos offline (hasta 1 GB)
- [x] **Social Mesh Resilience** — entrega robusta de mensajes offline via Vault + punteros DHT automáticos

### Grupos

- [x] Creación y gestión de grupos — nombre, avatar, miembros
- [x] Mensajes de grupo E2EE — reenvío firmado por admin
- [x] Roles — admin / miembro, transferencia de admin
- [x] Invitaciones y salida del grupo
- [x] Actualización de nombre y avatar del grupo (caps en IPC)

### Transferencia de archivos (Fase 16)

- [x] Fragmentación en chunks de 64 KB con validación SHA-256
- [x] Protocolos UDP: FILE_START, FILE_CHUNK, FILE_ACK, FILE_CANCEL, FILE_COMPLETE
- [x] Progreso en tiempo real — barra basada en ACKs
- [x] Límite de 100 MB por archivo, validación de tipo MIME
- [x] Thumbnails para imágenes y vídeos
- [x] Cancelación desde ambos extremos
- [x] UI completa — `FilePreviewOverlay`, `TransferProgressBar`, `MediaFileMessage`, `DocumentFileMessage`
- [x] Diálogo "Guardar como" nativo — `show-save-dialog` + `save-transferred-file`
- [x] Abrir archivo con app del sistema — `open-file` vía `shell.openPath`
- [x] **Estado 'Vaulted' para adjuntos** — actualización automática a doble tick gris tras replicación exitosa en bóvedas
- [x] **Compatibilidad Nativa Wayland** — corrección de diálogos de archivos bloqueantes y habilitación de `--ozone-platform-hint=wayland`

### UI / UX

- [x] Stack: Electron + Vite + React + TypeScript + Joy UI
- [x] Sidebar modular — `ContactItem`, `GroupItem`, `SidebarHeader`, `SidebarSearch`
- [x] `TopHeader` con edición inline de nombre y avatar de grupo
- [x] Modales: Identidad, Seguridad, Añadir Contacto, Compartir Contacto, Crear Grupo
- [x] Número de seguridad — fingerprint SHA-256 de claves ordenadas
- [x] Pantalla de solicitud entrante — con score de reputación y aviso de nodo sospechoso
- [x] Mapa de red en tiempo real — nodos, latencias, líneas de conexión
- [x] Splash/overlay de arranque — fases de warmup de Yggdrasil
- [x] Banner no bloqueante de reconexión
- [x] Configuración: Perfil, Red, Apariencia, Notificaciones, Privacidad, Almacenamiento, Bloqueados, Seguridad
- [x] QR de dirección de contacto para compartir
- [x] Validación de dirección Yggdrasil correcta (rango completo `200::/7`, regex `/^[23][0-9a-f]{2}:/i`)

### Corrección de bugs de resiliencia y seguridad (auditoría completa — A–EI)

> Más de 100 bugs corregidos a lo largo de toda la codebase. Resumen de áreas cubiertas:

- [x] Listener leaks IPC — todos los `ipcRenderer.on` con `removeAllListeners` previo
- [x] Stale closures en hooks React — patrón `useRef` + `useEffect([])` en `useChatState`, `useGroupState`, `useFileTransfer`
- [x] `console.log`/`console.warn` eliminados del render path y de callbacks con datos sensibles
- [x] `onKeyPress` (deprecated) reemplazado por `onKeyDown + !shiftKey` en todos los inputs
- [x] Doble registro de listeners de transferencia de archivos eliminado
- [x] Stale closure de `myIdentity` en `addFileTransferMessage` — corregido con `useRef`
- [x] Límite de 10 MB antes de `FileReader.readAsDataURL` en avatares (TopHeader y LoginScreen)
- [x] `name[0]` crash con nombre vacío en `ContactCard` — acceso opcional con fallback
- [x] Stubs `console.log('Download')` / `console.log('Open')` reemplazados por IPC real

### Infraestructura y testing

- [x] Tests unitarios con Vitest — transferencias, vault, seguridad, Kademlia, renewal tokens
- [x] Docker Compose para tests multi-nodo (15+ nodos)
- [x] **peer_bot_advanced.py** — motor de simulación con soporte para Kademlia, Vaulting y Social Mesh
- [x] Simulador de 60 días con aceleración temporal
- [x] Paquetes Debian/RPM con servicio systemd (`upeer-yggdrasil.service`)
- [x] Capabilities Linux sin root (`cap_net_admin,cap_net_raw`)

---

## 🚧 Pendiente

### Funcionalidades no implementadas (UI ya presente, lógica faltante)

- [ ] Ajustes de Privacidad — los toggles (confirmaciones de lectura, última vez visto, estado online) no persisten ni envían señales al backend
- [ ] Ajustes de Notificaciones — los toggles (mensajes, solicitudes, sonido) son locales y sin efecto real
- [ ] Ajustes de Apariencia — el selector de tema no aplica el modo claro/oscuro, el tamaño de fuente no se propaga
- [ ] "Liberar espacio" en Almacenamiento — botón sin handler implementado
- [ ] Búsqueda de mensajes en chat — icono presente en `TopHeader`, sin funcionalidad
- [ ] Llamadas de voz / vídeo — botones presentes en `TopHeader`, sin implementar
- [ ] Archivar chat, silenciar, fijar, favoritos — opciones en menú contextual sin efecto
- [ ] Marcar como no leído — sin handler
- [ ] Velocidad y tiempo restante en `TransferProgressBar` — muestra "calculando…"

### Próximas funcionalidades

- [ ] Mensajes de voz — grabación y envío de audio comprimido
- [ ] Vídeo streaming — reproducción mientras se transfiere
- [ ] Cifrado E2EE para archivos — integración con claves efímeras del ratchet
- [ ] Transferencias simultáneas — límite configurable (máx. 3 concurrentes)
- [ ] Historial de archivos compartidos — búsqueda y organización por tipo
- [ ] Compresión de mensajes — reducir overhead para mensajes largos
- [ ] Notificaciones de rotación de claves — aviso a contactos cuando cambia la clave estática
- [ ] Renewal tokens basados en confianza — nodos con alta reputación pueden renovar más
- [ ] Sincronización diferencial de historial — actualizaciones incrementales
- [ ] Soporte móvil / empaquetado multiplataforma — macOS, Windows instaladores firmados

---

## 🔧 Principios de desarrollo

1. **Zero-Trust en IPC** — el renderer nunca toca claves privadas; `main.ts` valida y restringe todo input
2. **Listeners IPC únicos** — `removeAllListeners` antes de cada `ipcRenderer.on`; listeners en `useEffect([])`
3. **Sin datos sensibles en logs** — ningún `console.log/warn` expone IDs, claves o rutas en producción
4. **Joy UI** — todo componente nuevo sigue el sistema de diseño existente
5. **Tests primero** — validar con 2-3 nodos antes de escalar a pruebas completas
