# Roadmap uPeer

_Última actualización: 23 Octubre 2026_

> Coordinación móvil↔escritorio y trabajo abierto de B6/B7: [`../ROADMAP.md`](../ROADMAP.md) (raíz del workspace, fuera de este repositorio).

---

## 🔗 Coordinación con móvil (B6/B7)

**Orden acordado el 25/10/2026 y reordenado el 28/10/2026, decidido por bloqueos y no por cercanía del código.** El reparto completo y su justificación están en [`../ROADMAP.md`](../ROADMAP.md) → «Orden de ejecución de la paridad móvil»; aquí queda lo que toca a este repositorio:

1. **Runtime en modo dispositivo en Android** — Desktop ya lo tiene; es el único bloqueo duro abierto y frena el cierre de B10.
2. **`VAULT_*` en Android** — Desktop ya tiene buzón por dispositivo, puntero y ACK. El port móvil **no depende de `SYNC_*`**: el vault usa Kademlia, contactos, reputación y `sendSecurePacket`. Ojo con `getDynamicReplicationFactor`: el móvil no tiene vouch score, así que necesita un sustituto determinista o el valor de emergencia `8`.
3. **`SYNC_*` en Android** — cierra B10. Su condición de cierre es el paso 1, no este.
4. **Grupos en Android, antes de dar B10 por cerrado (28/10/2026).** El bloqueo más barato: los mensajes con `chatUpeerId` `grp-…` ya viajan en el histórico y en `SYNC_ENVELOPE`, y el móvil los descarta en el filtro de `upeerId` de 64 hex de `SyncHistoryPayload.local`. Falta modelo de grupo, proyección de `GROUP_UPSERT`/`GROUP_DELETE` y pantalla. **No necesita claves nuevas, ni `FILE_*`, ni `GROUP_*`.**
5. **Adjuntos en Android (28/10/2026).** La presentación ya está hecha: el móvil reconoce el sobre `{"type":"file",…}` que emite `saveFileMessage` y muestra `Documento: informe.pdf` con su tamaño en vez del JSON en crudo. Abrir el archivo exige `FILE_*`, que aquí ya existe y hay que portar. **Base del port hecha el 28/10/2026 en el repo del móvil**, con el contrato leído de este repo: `domain/file-transfer.ts` (plan de trozos, fases `proposed`→…→`vaulted`, ventana, sobre `{"type":"file"}`), `FileReceivePolicy` (mismas reglas que `security/validationFiles.ts`) y `FileChunkAssembler` (offsets, duplicados, hash por trozo y global). Lo que falta es el descifrado: la clave AES llega con `crypto_box_seal` y los trozos en AES-GCM, así que el puente Go del móvil necesita `openFileKey` y el descifrado de trozo. **Nada de esto requiere cambios en Desktop**: el contrato de `crypto.ts` y `validationFiles.ts` es el que se está copiando, y conviene no tocarlo mientras el móvil lo implementa.
6. **`GROUP_*` propio, `CALL_*` y cierre de UI**, en ese orden. Las llamadas son el último bloque: es el único con hardware y red en tiempo real, y aquí ya está resuelto (señalización, pipeline de medios, codecs, historial). El transporte de sincronización funciona contra este cliente y el móvil **ya proyecta grupos** (`GROUP_UPSERT`/`GROUP_DELETE`, mensajes `grp-…`) y **ya presenta** los adjuntos (`{"type":"file"}`, nota de voz incluida) replicando el renderizado de escritorio; lo que falta es el contenido descargable, que depende de `FILE_*` y del vault. Orden: `FILE_*` real → sender keys.

La consecuencia para este repositorio es una sola: **el histórico de sincronización que emite Desktop no puede filtrar por tipo de chat sin dejar de ser completo**, porque `listSyncHistoryMessages` es un cursor global sobre `messages`. Si el móvil necesita un subconjunto, lo declara el receptor (`SyncApplier` distingue `APPLIED`/`UNSUPPORTED`/`REJECTED` y lo cuenta), no el emisor.

Y una que **sí nos tocaba a nosotros y no era del port**: la sincronización en dos fases —masiva al abrir sesión bajo un indicador de progreso, en tiempo real después— es un requisito de producto **de los dos clientes**. **Ya está hecha en ambos**: Escritorio expone `phase` (`idle`/`syncing`/`live`) con la misma semántica que el móvil y tapa la fase masiva con `SyncBlockingOverlay`. Detalle en «Sincronización en dos fases: también aquí (28/10/2026)», más abajo.

Nada de esta lista exige cambios en Desktop salvo acompañar las pruebas cruzadas y lo del punto 4 en la sincronización. La lista de pasos 4 a 6 ya está dentro de la brecha y en su orden: **grupos de solo lectura → adjuntos → `GROUP_*` propio → `CALL_*` → cierre de UI**.

- [x] Emitir certificado de dispositivo firmado por la raíz y adjuntar `deviceCertificate` al `LocationBlock`.
- [x] Publicar el registro de cuenta con `epoch`, certificado activo y revocaciones.
- [x] Revocar dispositivos desde `delete-device` con epoch monotónico, estado cifrado y republicación del registro.
- [ ] Dejar de usar la identidad/SPK compartida para mensajería y usar claves por dispositivo.
  - [x] Anunciar y validar `devicePublicKey`, `deviceId`, `deviceCertificate` y SPK firmado por dispositivo en el handshake, persistidos por contacto con invalidación de sesión al cambiar de dispositivo.
  - [x] CHAT directo con X3DH, firma y sealed por dispositivo cuando el contacto anuncia el contrato, con fallback legacy y admisión ligada al dispositivo anunciado.
  - [x] Android anuncia y consume el contrato en CHAT directo, `DR_RESET` y `CHAT_UPDATE`, con validación de certificado, binding por contacto, SPK por dispositivo, resolución entrante, invalidación de sesión/outbox y versiones monótonas.
  - [~] Extender la ruta por dispositivo a grupos, vault y sincronización multi-dispositivo.
    - [x] `GROUP_INVITE`, `GROUP_UPDATE` y `CHAT_UPDATE` de grupo cifran con la sesión y SPK del dispositivo cuando el miembro anuncia el contrato, firman con la clave de dispositivo, sellan al dispositivo y emiten `DR_RESET` de grupo por dispositivo; mantienen fallback legacy.
    - [x] `GROUP_MSG` se firma y sella con la clave del dispositivo cuando el miembro anuncia el binding, con fallback legacy y self-sync por la raíz; la recuperación desde vault verifica la firma del dispositivo. El vault replica y consulta endpoints de los demás dispositivos propios descubiertos por DHT.
    - [x] Buzón por dispositivo del destinatario: `VAULT_STORE`/`VAULT_QUERY`/`VAULT_ACK` transportan el ámbito de dispositivo, SQLite lo persiste con migración propia, el puntero DHT se publica por dispositivo y el receptor solo procesa y ACKea sus entradas. Chat directo, mensajes de grupo y control de grupo lo usan con fallback legacy.
- [x] Aceptar solo bloques de ubicación con certificado válido y aplicar `DHT_UPDATE` con `dhtSeq` estrictamente mayor.
- [x] Comprobar la admisión del contacto antes de cifrar mensajes directos, vault offline, outbox pendiente, actualizaciones y paquetes de grupo.
- [x] Vectores JS↔Go↔Kotlin del contrato de cuenta y dispositivo, en ambos sentidos, incluida la clave DHT del registro, manipulación, revocación y epoch obsoleto.
- [ ] Migrar instalaciones existentes sin copiar la mnemonic ni la raíz a otros dispositivos.
  - [x] Desktop: `identityMode` `root`/`device`, restauración de la cuenta desde `account-public.enc` sin `secretKey` y fallo cerrado en toda firma con raíz.
  - [ ] **Android: portar el runtime en modo dispositivo.** Es el bloqueo duro compartido: `YggdrasilIdentity.set(secretKey)` exige la raíz y el nodo no arranca con solo la clave y el certificado de dispositivo. Mientras siga así, los dos dispositivos de una misma cuenta comparten raíz y la prueba real de B10 no puede cerrar su criterio «sin copiar la raíz».
- [ ] Acordar la ventana de compatibilidad de bloques legacy antes de activar `fail-closed` en Android.
- [ ] Probar roaming Desktop↔móvil en ambos sentidos y actualizar este roadmap al cerrar B7.

Estado Android (22/10/2026): store y lookup DHT iterativos completados (K=20, α=3, ACK, reintento acotado, fusión por `deviceId` y caché verificada de 5 min), `DHT_UPDATE` enviado y aplicado con certificado, registro, secuencia persistida y rate limit. Desktop ya emite bloques con `deviceCertificate`, publica su registro de cuenta y acepta bloques de Android. Los vectores `tests/fixtures/dht-account-go.json` y `upper/transport-bridge/testdata/account_device_vectors.json` fijan el contrato en ambos sentidos; el segundo también se consume en JVM con `AccountDeviceVectorTest` y en Android con `AccountAdmissionBridgeTest` (`androidTest`, 4/4 en verde en emulador x86_64 con `libgojni` amd64 y 4/4 en el Xiaomi 2201117TY ARM64 físico con `libgojni` arm64). Desktop ya comprueba la admisión del contacto antes de cifrar (`contactAdmission.ts`) en envío directo, vault offline, outbox pendiente, actualizaciones y grupos, con caché de 60 s ligada al epoch del registro, refresco del registro desde DHT cada 60 s y auditoría para registro/ubicación ausentes. `delete-device` revoca con un `epoch` nuevo, persiste la lista cifrada y republica el registro; un estado corrupto invalida el registro. Desktop ya anuncia en el handshake su `devicePublicKey`, `deviceId`, `deviceCertificate` y un SPK firmado por la clave de dispositivo; el CHAT directo usa X3DH, firma Ed25519 y sealed por dispositivo cuando el contacto anuncia el mismo contrato, mantiene fallback legacy, invalida sesiones al cambiar de dispositivo y exige que el certificado de ubicación coincida con el dispositivo anunciado. Android ya anuncia y consume ese contrato en CHAT directo y `DR_RESET`: valida certificado, persiste binding, usa SPK por dispositivo y fallback legacy. `DR_RESET` firmado por dispositivo actualiza `deviceSignedPreKey` e invalida sesión/outbox en ambos lados. `CHAT_UPDATE` directo también usa claves por dispositivo en Desktop y Android, firma el paquete con la clave del dispositivo y aplica versiones monótonas para descartar ediciones duplicadas u obsoletas; Android permite editar mensajes propios y reintenta la edición desde el outbox. En Desktop, `GROUP_INVITE`, `GROUP_UPDATE` y las ediciones de grupo usan la misma ruta por dispositivo cuando el miembro anuncia el contrato: cifran con su SPK, firman y sellan con su clave, y el `DR_RESET` de grupo conserva la identidad del dispositivo. `GROUP_MSG` ya usa firma y sealed por dispositivo con fallback legacy, y el vault replica y consulta endpoints en los demás dispositivos propios. El vault ya dispone de buzón por dispositivo del destinatario (`recipientDeviceId`/`requesterDeviceId`/`deviceId`, puntero DHT propio, consulta y ACK filtrados), usado por chat directo, mensajes de grupo y control de grupo con fallback legacy. B10 ya tiene el canal pairwise de dispositivos (`SYNC_HELLO`, `SYNC_ENVELOPE` con Double Ratchet, ACK y secuencia), sincronización de mensajes/eventos con replay offline e historial inicial por chunks con cursor; el emparejamiento sin raíz, el relay para más de dos dispositivos y la firma de origen del evento relayado ya están hechos; falta la prueba real Desktop↔móvil y su equivalente en Android. **Reordenado el 25/10/2026:** el siguiente bloqueo compartido no es la prueba de roaming, sino el **runtime en modo dispositivo en Android**, porque el nodo móvil todavía exige la raíz y eso impide cerrar B10 «sin copiar la raíz». Entre ese paso y la sincronización entra el vault móvil, que no depende de `SYNC_*`. El orden está en la sección de coordinación de arriba y en [`../ROADMAP.md`](../ROADMAP.md).

El detalle, orden de migración y matriz de pruebas está en [`../ROADMAP.md`](../ROADMAP.md).

---

## ✅ Completado

### Núcleo P2P y red

- [x] Motor de transporte seguro sobre Yggdrasil IPv6 — TCP para mensajería y UDP para media de llamadas, sin servidores
- [x] Kademlia DHT completa — 160 buckets, K=20, α=3, lookup O(log n)
- [x] Bootstrap diversificado — DNS TXT, LAN multicast, seed nodes, contactos existentes
- [x] LAN discovery — anuncios `ff02::1` cada 30 s
- [x] Detección de cambio de IP y rediscovery automático (<60 s)
- [~] Sovereign roaming — `DHT_UPDATE` firmado a contactos íntimos con `LocationBlock` propio firmado por clave de dispositivo y `deviceCertificate`; registro de cuenta publicado y verificado. El CHAT directo, `DR_RESET`, `CHAT_UPDATE`, el control de grupo, las ediciones de grupo y `GROUP_MSG` ya usan claves por dispositivo con fallback legacy; el vault replica y consulta endpoints de otros dispositivos propios y ofrece buzón por dispositivo del destinatario. Faltan la prueba de roaming real y la sincronización multi-dispositivo.
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
- [~] Multidispositivo autónomo — parcial: hay `deviceId` estable, tabla `devices`, self-sync, vault, certificado de dispositivo firmado, registro con `epoch`, bloques de ubicación con certificado y revocación efectiva desde `delete-device`; desde el enrolamiento sin raíz el registro también se persiste con sus dispositivos autorizados y se revoca por `revoke-authorized-device`, previa confirmación en `AuthorizedDeviceList`. La revocación se propaga por el canal de sync con `SYNC_REGISTRY` (`broadcastSyncRegistry()` tras publicar el registro), y el dispositivo revocado cierra su protocolo al adoptar el registro nuevo. Sigue usando la identidad/SPK compartida en la mensajería y `devices.isTrusted` solo se usa en UI.
- [~] Emparejamiento sin copiar mnemonic/SPK — implementado en Desktop con canal manual: el modo de identidad `device` restaura la cuenta desde `account-public.enc` sin `secretKey` y falla cerrado en toda firma con raíz; el enrolamiento intercambia invitación, solicitud y certificado sellados con un secreto de un solo uso (`enrollment.ts`), y los tres mensajes viajan como códigos base64url con QR para las direcciones que se escanean con cámara. Ajustes → Seguridad genera la invitación, autoriza la solicitud y revoca dispositivos del registro; la pantalla de acceso ofrece "Vincular este dispositivo" para el lado sin raíz. El protocolo ya es interoperable con Android: el bridge Go construye la solicitud firmada y abre el certificado, y `tests/fixtures/enrollment_vectors.json` verifica en ambos repositorios que Desktop abre la solicitud de Go y que Go abre la solicitud y el certificado de Desktop. Falta la pantalla de emparejamiento en el móvil, sustituir el pegado de la solicitud por el transporte real de B6 y la prueba Desktop↔móvil.

### Mensajería

- [x] Mensajes de texto E2EE con ACK, entrega y lectura (doble check azul)
- [x] Reacciones con emoji — protocolo CHAT_REACTION firmado, UI con selector rápido
- [x] Edición de mensajes — CHAT_UPDATE con indicador "(Editado)"
- [x] Eliminación para todos — CHAT_DELETE firmado, marcado visual
- [x] Respuestas/citas — por UUID con vista previa del mensaje original
- [x] Indicador "Escribiendo…" — en tiempo real con debounce (2,5 s)
- [x] Presencia — "En línea" / "Última vez visto" por heartbeats autenticados
- [ ] Presencia corregida a actividad del usuario: hoy «En línea» sale de `lastSeen`, que mueve cualquier paquete autenticado (incluido el `PING`), así que mide alcanzabilidad del nodo y no que la persona esté delante. Ver «Presencia = actividad del usuario, no del nodo»
- [x] Vault — almacén cifrado de mensajes para contactos offline (hasta 1 GB)
- [x] **Mensajes de voz** — grabación (`useAudioRecorder` + `useRecordingWaveform`), envío como nota de voz (`isVoiceNote`) y reproducción (`AudioPlayer` con wavesurfer); funcionan en chats privados y grupos
- [x] **Social Mesh Resilience** — entrega robusta de mensajes offline via Vault + punteros DHT automáticos

### Grupos

- [x] Creación y gestión de grupos — nombre, avatar, miembros
- [x] Mensajes de grupo E2EE — reenvío firmado por admin
- [x] Roles — admin / miembro, transferencia de admin
- [x] Invitaciones y salida del grupo
- [x] Actualización de nombre y avatar del grupo (caps en IPC)

### Transferencia de archivos (Fase 16)

- [x] Fragmentación en chunks de 64 KB con validación SHA-256
- [x] Protocolos de transferencia: FILE_START, FILE_CHUNK, FILE_ACK, FILE_CANCEL, FILE_COMPLETE
- [x] Progreso en tiempo real — barra basada en ACKs
- [x] Límite de 100 MB por archivo, validación de tipo MIME
- [x] Thumbnails para imágenes y vídeos
- [x] Cancelación desde ambos extremos
- [x] UI completa — `FilePreviewOverlay`, `TransferProgressBar`, `MediaFileMessage`, `DocumentFileMessage`
- [x] Diálogo "Guardar como" nativo — `show-save-dialog` + `save-transferred-file`
- [x] Abrir archivo con app del sistema — `open-file` vía `shell.openPath`
- [x] **Cifrado E2EE para archivos** — AES-256-GCM por chunk (`encryptChunk`/`decryptChunk`) + clave AES sellada al peer con sealed box (`sealTransferKey`/`unsealTransferKey`)
- [x] **Velocidad y tiempo restante** en `TransferProgressBar` — `useTransferSpeed` (`speedBps`/`etaSeconds`) con ventana de muestras de 3 s
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
- [x] Splash/overlay de arranque — fases de warmup de Yggdrasil. Corregido el 26/10/2026: el root de `LinearProgress` de Joy trae `flex: 1`, así que dentro del overlay en columna crecía hasta llenar el alto restante y empujaba icono y título fuera del centro; se fija `flex: 'none'`
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
- [x] Ajustes de Apariencia — tema claro/oscuro/sistema aplicado en vivo y tamaño de fuente propagado
- [x] "Liberar espacio" en Almacenamiento — handler `cleanupVaultExpired` y refresco de estadísticas
- [x] Búsqueda de mensajes en chat — buscador en `TopHeader` con resultados y salto al mensaje
- [x] **Velocidad y tiempo restante en `TransferProgressBar`** — `useTransferSpeed` calcula `speedBps`/`etaSeconds` (ventana 3 s, mín. 500 ms de muestra); se muestra "Velocidad:" y "Tiempo restante:"
- [x] Llamadas de voz / vídeo 1:1 y de grupo — señalización (`CALL_OFFER`/`RING`/`ACCEPT`/`REJECT`/`BUSY`/`CANCEL`/`END`/`SDP`/`ICE`/`MEDIA`/`MEDIA_UPDATE`/`META`/`JOIN`/`LEAVE`), pipeline de medios, compartir pantalla, relay y panel de historial; cubierto por `call-relay`, `call-performance` y `call-scalability`
- [x] Archivar chat, silenciar, fijar, favoritos — acciones en menú contextual persistentes (`useChatActionsStore`)

### Próximas funcionalidades

> **⛔ B11 (transporte local sin internet: Bluetooth y LAN) está bloqueada a propósito.** No se implementa ni se prepara nada en escritorio —ni permisos, ni sockets locales, ni cambios en la firma— sin discutir antes el diseño con el usuario. El escritorio, además, no tiene radio Bluetooth: su parte sería LAN en la misma subred y solo después de esa conversación. Los cinco puntos a acordar están en [`../ROADMAP.md`](../ROADMAP.md) → «B11».

- [ ] Vídeo streaming — reproducción mientras se transfiere _(pendiente; requiere streaming de media en el renderer, no verificable headless)_
- [x] Compresión de mensajes — reducir overhead para mensajes largos (`compressMessage`/`decompressMessage` con auto-detección por prefijo, gzip; aplicada en el envío online, descompresión en recepción; probada multiproceso con mensaje largo)
- [x] Recovery multimedia vaulteado — fix: `handleMessage` de `FILE_PROPOSAL` reconstruía el paquete perdiendo `type`/`useRecipientEphemeral` y forzando `isVoiceNote:false`, rompiendo la verificación de firma del proposal vaulteado y bloqueando la reconstrucción del archivo al reconectar. Se preservan los campos tal como el emisor los firmó. Añadido test e2e multiproceso `adjunto offline->online: recovery del multimedia vaulteado tras reconexión` (modo offline simulado en `peer-worker.js` con `setVaultOffline`).
- [x] **Recovery offline→online de todos los tipos de eventos/mensajes** — probado e2e multiproceso para: texto (CHAT), adjuntos (FILE_*), edición (CHAT_UPDATE), borrado (CHAT_DELETE), reacción (CHAT_REACTION), recibo de lectura (READ), mensaje de grupo (GROUP_MSG). Bugs reales de integridad corregidos en `handlers/vault.ts`: (1) `isInternalSync` se añadía al packet antes de verificar la firma del self-sync, rompiendo la verificación → ahora se excluye del `innerData` verificado y se añade solo tras validar; (2) `GROUP_MSG` se firma sobre el packet completo (incluye `senderUpeerId`) a diferencia del resto → se verifica conservando `senderUpeerId`; (3) `GROUP_INVITE`/`GROUP_UPDATE` vaulteados fallaban el descifrado porque el vault no pasaba `fromAddress`/`sendResponse` (necesarios para DR_RESET) → ahora se pasan. Añadido getter `getReactionsForMessage` en `storage/messages/reactions.ts` y comandos de mutación en el worker. 17 tests multiproceso en verde.
- [x] **Recovery offline→online de todos los tipos de adjunto** — probado e2e multiproceso para nota de voz (`isVoiceNote:true`), imagen (multimedia con caption), documento PDF, **vídeo (mp4)**, documento Office (docx) y archivo comprimido (zip), verificando que cada uno se recupera con su metadata (`isVoiceNote`, `mimeType`, `caption`, `fileName`). Fix: `senderVaulting.ts` no incluía `isVoiceNote` en el `FILE_PROPOSAL` vaulteado → ahora se preserva para que la nota de voz se reconstruya como tal al reconectar. 18 tests multiproceso en verde.
- [x] **Rendimiento del recovery de archivos grandes desde el vault** — el recovery de vídeos/multimedia grandes se atascaba o iba muy lento. Causas y fixes: (1) `handleVaultDelivery` disparaba `tryRecoverVaultTransferByFileHash` **por cada shard** → escaneos O(N²) en DB; ahora se acumulan los `fileHash` del batch y el recovery se dispara **una sola vez por archivo** al final del batch. (2) El **ACK borraba los shards del custodio antes de completar la paginación**, haciendo el `offset` inestable y dejando el archivo a medias; ahora el ACK se retrasa hasta la última página (`hasMore: false`). (3) `VAULT_DELIVERY_PAGE_SIZE`/`MAX_DELIVERY_ENTRIES` subidos de 50 a 120 y `validateVaultDelivery` a 120, reduciendo los round-trips. (4) En el recovery, las queries DB de las entradas del vault se resuelven **en paralelo** (`Promise.all`) en lugar de secuenciales. Añadido test e2e multiproceso de **archivo grande (~2MB) reconstruido por segmentos sin atascarse** (192 shards, 2 páginas). 19 tests multiproceso en verde.
- [x] Notificaciones de rotación de claves — aviso a contactos cuando cambia la clave estática (Alertas TOFU + `key-change-alert`, ya implementadas)
- [x] Renewal tokens basados en confianza — nodos con alta reputación pueden renovar más (`trustBasedMaxRenewals` escala el límite por vouch score y `generateTrustBasedRenewalToken` lo aplica; tests unit). La conexión forzada en el hot path de publicación de location blocks se dejó como opcional para no alterar el flujo por defecto (maxRenewals=3)
- [~] Sincronización diferencial de historial — `SYNC_HELLO` registra dispositivos propios con certificado y SPK; `SYNC_ENVELOPE` usa Double Ratchet en `sync:<deviceId>` (separado del ratchet del contacto), firma por dispositivo, deduplicación por `eventId` y sincroniza mensajes, estados, ediciones, borrados, limpiezas y reacciones. Los eventos de dispositivos offline se persisten en `sync_events` y se replican al reconectar con ACK y secuencia. El relay entre más de dos dispositivos usa `sync_relay`, lotes de 200, ACK por destino y volcado de backlog al completar `SYNC_HELLO`; el evento relayado viaja firmado por el dispositivo de origen (firma y certificado se persisten en `sync_events`) y el receptor rechaza los relayados sin firma válida. El historial inicial se negocia por chunks reanudables (`SYNC_HISTORY_REQ/RES`). El vault mantiene el buzón por dispositivo del destinatario. Los eventos `GROUP_UPSERT`, `GROUP_DELETE` y `CONTACT_PROFILE` replican metadatos de grupos (nombre, avatar, miembros, admin, estado y favorito, sin material criptográfico) y el perfil local de contactos (nombre, avatar y favorito) entre dispositivos propios. Los estados de sincronización son observables: `pending`/`synced` por dispositivo propio (con eventos pendientes y último ACK) y por mensaje propio, expuestos por IPC y mostrados en la UI. El emparejamiento sin copiar la raíz ya está implementado en Desktop: `identityMode` `root`/`device` restaura la cuenta desde `account-public.enc` sin `secretKey` y falla cerrado en toda firma con raíz; el enrolamiento usa un código con secreto de un solo uso (TTL 15 min) por el que el dispositivo nuevo envía su clave firmada y recibe el certificado de la raíz sellado con el mismo secreto; el autorizador consume el secreto, persiste el dispositivo autorizado en `account-registry.enc`, sube el `epoch` y republica el registro, y la revocación lo retira. Las invitaciones pendientes sobreviven a un reinicio cifradas en `enrollment-invites.enc`. El flujo está expuesto por IPC y UI (`enrollment-*`, `get-authorized-devices`, `revoke-authorized-device`): Ajustes → Seguridad genera la invitación con QR, autoriza la solicitud y revoca dispositivos, y la pantalla de acceso ofrece "Vincular este dispositivo" con el lado sin raíz. Un enrolamiento interrumpido deja el dispositivo bloqueado hasta reenrolarse y el certificado nuevo limpia `session.locked`. Falta sustituir el pegado de la solicitud por el transporte real de B6, el mismo protocolo en Android y la prueba real Desktop↔móvil. Requiere B6 y B10 del roadmap móvil.
- [ ] Migrar todos los iconos de `@mui/icons-material` a Lucide — 94 archivos y 145 iconos distintos. El móvil ya dibuja con `@tamagui/lucide-icons-2`; hasta que escritorio use el mismo trazo, un mismo concepto (buscar, archivar, cifrado, llamada) se ve distinto en cada cliente. Retirar `@mui/icons-material` del `package.json` al terminar y comprobar que ningún `sx` dependa de la fuente de iconos.
- [ ] Reputación: dejar de mostrarla y recalcularla por cuenta, no por nodo — sale de la ficha del contacto, de la tarjeta de confianza y de la pantalla de solicitud; solo se avisa cuando es **muy mala**, como señal de seguridad. `getVouchScore`/`computeScore` siguen alimentando PoW, renovaciones por confianza, elección de relay, admisión de vault y rate limiting, pero hoy puntúan una identidad cuando en realidad miden el nodo que escribe: un usuario con móvil y escritorio obtiene dos puntuaciones distintas. Hay que agregar por cuenta con los dispositivos verificados como unidad, con pruebas de que añadir dispositivos no altera el resultado por sí solo.
  - **Ojo: el score no solo se muestra.** Antes de retirarlo de la UI hay que resolver sus tres consumidores técnicos, o el cambio rompe mensajería. Además de PoW, renovaciones y rate limiting, el score decide **el factor de replicación del vault**: `VaultManager.getDynamicReplicationFactor` (`network/vault/manager.ts`) lo usa en cubos de 3, 6 o 12 custodios. Medido sobre la función real: **score 0–69 devuelve siempre 12**, 70–89 devuelve 6 y 90+ devuelve 3. La interpolación por score y por antigüedad es inalcanzable, porque `firstSeen = now` deja `daysKnown` a 0 —el propio código lo marca como «BUG VAULT-AGE», ya que el esquema de contactos no tiene `createdAt`—, con lo que `isStable`, `highTenure` y `permanentTenure` son siempre falsos y la tercera condición siempre se cumple. Es decir: hoy casi todo se replica 12 veces, y arreglar la antigüedad cambiará la replicación de todo el mundo. No es un arreglo cosmético: hay que decidirlo junto con el rediseño por cuenta. El score también elige el relay de llamadas (F9).
  - **Consecuencia para el port móvil:** el móvil no tiene reputación, así que al portar `VAULT_*` necesita un sustituto determinista —o el valor de emergencia `8`— y no un `vouchScore` inventado. Anotado también en [`../ROADMAP.md`](../ROADMAP.md) y en [`../upper/roadmap.md`](../upper/roadmap.md).
- [ ] Soporte móvil / empaquetado multiplataforma — macOS, Windows instaladores firmados _(pendiente; requiere infraestructura de build/firmado fuera del entorno headless)_

### Paridad con móvil (medida el 23/10/2026)

Inventario completo en [`../ROADMAP.md`](../ROADMAP.md) y [`../upper/roadmap.md`](../upper/roadmap.md). Resumen de lo que el cliente móvil **no** puede consumir todavía, y que por tanto no se puede dar por validado entre clientes:

- [ ] `READ`, `TYPING`, `CHAT_DELETE`, `CHAT_REACTION` y `CHAT_CONTACT`: existen aquí y no en Android.
- [ ] `GROUP_MSG`/`GROUP_ACK`/`GROUP_INVITE`/`GROUP_UPDATE`, los nueve `FILE_*`, los siete `VAULT_*` y los catorce `CALL_*`: sin implementación móvil, así que ninguna prueba cruzada de grupos, adjuntos, vault ni llamadas es posible aún.
- [x] `SYNC_*` y los nueve `SYNC_EVENT_KINDS`: el móvil ya participa en la sincronización multi-dispositivo con `SYNC_HELLO`, `SYNC_ENVELOPE` (ratchet `sync:<deviceId>`), `SYNC_HISTORY_REQ/RES`, `SYNC_ACK`, `SYNC_RESET` y `SYNC_REGISTRY`, verificado en dispositivo contra Desktop. El móvil registra y proyecta `MESSAGE_*`, `CHAT_CLEAR`, `REACTION_SET` y `CONTACT_PROFILE` con `SyncApplier`; `GROUP_UPSERT`/`GROUP_DELETE` se registran pero todavía no se aplican, y el relay con más de dos dispositivos sigue sin probarse desde el móvil.
- [x] `PING`/`PONG` de protocolo: el móvil ya contesta al `PING` del heartbeat desde `ControlReplies`, que cuenta como presencia y responde `PONG` con `ControlSender.sendPong` (rate limit 60/10 s). Sin esto escritorio solo refrescaba `lastSeen` con tráfico real y marcaba «última vez hace 4 minutos» a un móvil alcanzable; verificado con el móvil inactivo más de 85 s.
- [x] La tarjeta «Última Actividad» de la ficha no se contradice con la cabecera: escribe «Ahora mismo» cuando el contacto está en línea.

Bloqueos que también son nuestros y afectan a la paridad:

- [ ] Ajustes de Privacidad sin lógica real: las confirmaciones de lectura no persistirán ni se enviarán, así que el futuro `READ` del móvil no tendrá contrapartida de preferencia.
- [ ] Ajustes de Notificaciones sin lógica real: el móvil necesita el mismo contrato de preferencias.
- [ ] Las anotaciones «Preview for phase 11» de `CHAT_REACTION`, `CHAT_DELETE` y `CHAT_UPDATE` en `network/types.ts` siguen ahí pese a estar implementados y probados: congelar el contrato antes de portarlos.

### Sincronización en dos fases: también aquí (28/10/2026) — **hecho**

Requisito de producto, **común a los dos clientes**, no una función del móvil: al abrir sesión hay una **sincronización masiva** que debe quedar tapada bajo un indicador de progreso, y solo después el canal pasa a **tiempo real**. El móvil lo implementa con `SyncStatusReport` → `syncStatusJSON()` → `useSyncStatus` → `SyncBlockingOverlay`. El escritorio ya usa **el mismo contrato y la misma semántica**, para que un cliente pueda leer el estado del otro sin traducción.

Lo que hay:

- `network/sync/phase.ts` (`computeSyncPhase`) es la función pura, con 6 casos de prueba en `tests/unit/network/sync-phase.test.ts`: `idle` sin peers, `syncing` mientras quede histórico y el par esté vivo, `live` cuando todos completaron, salida por par obsoleto a los **45 s** (misma ventana que el móvil) y par sin `lastSeen`.
- `getSyncStatusView()` devuelve `phase`, `devicesTotal`, `devicesDone`, `lastPeerAt` y `ageMillis` junto al `state` de siempre. `SyncPeerState` gana `historyCompleted`, que ya estaba en `sync_peers` y solo faltaba exponer.
- `components/layout/SyncBlockingOverlay.tsx` tapa la pantalla (`zIndex` 9998, por encima del shell y por debajo del overlay de arranque), con anillo, barra determinada, «Sincronizando tus dispositivos…» y la confirmación «¡Al día!» antes del fundido. 5 casos de prueba en `tests/unit/components/layout/SyncBlockingOverlay.test.tsx`, incluido que no se muestra con la app bloqueada y que se retira solo.
- `statusNotify.ts` ya no emite en cada evento a ciegas: compara el payload y solo envía cuando cambia, y un **latido de 5 s** (`startSyncStatusTicker`) refresca la frescura del peer. Sin el latido, un par que se apaga a mitad de la fase masiva dejaría el estado congelado en `syncing`. El latido arranca siempre, también con la sesión bloqueada, porque es la única forma de que el desbloqueo no deje la UI sin fase.

Lo que sigue abierto, y no es de esta fase:

- [ ] Renombrar `disabled` a `idle` en el contrato IPC. Hoy `state: 'disabled'` significa «no hay otros dispositivos», no «la sincronización está apagada», y el nombre sigue engañando aunque `phase` ya lo desambigüe.
- [ ] `disabled` mezcla todavía eventos salientes sin ACK y histórico entrante; la fase ya los separa para la UI, pero el contrato no.

Depende de que el histórico funcione, que ya funciona. **No bloquea B10 por sí solo**, pero sí la parte de B10 que el usuario ve.

### Mientras carga no hay vacío (28/10/2026)

Regla común a los dos clientes: **ninguna pantalla puede anunciar «no hay nada» mientras los datos aún están llegando.** El móvil distingue `loading` / `empty` / `error` (`useFirstLoad` + `LoadingState` en Chats, Contactos, hilo y `ContactPicker`). El escritorio ya hace lo mismo:

- `store` expone `isHydrating` (lo pone `refreshData`, que ahora espera a contactos, grupos y estado de sincronización antes de bajar la bandera) y `historyLoading` (lo pone `setTargetUpeerId` / `setActiveGroupId` y lo baja la carga del histórico, también en su rama de error).
- `SidebarListPanel` recibe `loading` y pinta «Cargando conversaciones…» en vez de «Sin conversaciones».
- `EmptyChat` recibe `loading` y pinta «Cargando mensajes…» en vez de «Aún no hay mensajes aquí»; `ChatArea` lo propaga desde `MainLayoutContent`.
- `LoadingState` (`components/layout/sidebar/LoadingState.tsx`) es el indicador único, con variante `compact` para el rail.

Queda abierto, porque necesita otro dato que hoy no existe:

- [ ] Tratar `sync_peers.state = 'pending'` como **carga** en la lista: hoy un grupo recién creado en el otro dispositivo y con histórico en curso se ve como grupo vacío hasta que llega el primer mensaje, porque `phase` es global y no por conversación.
- [ ] El overlay de arranque (`isStartupRecoveryOpen`) cubre el primer arranque; cambio de cuenta y reconexión ya pasan por `isHydrating`, pero no hay bandera de carga por conversación individual.

### Contador de no leídos en la pestaña Chats del móvil

El móvil replica el `Badge` de `NavigationRail`: cuenta conversaciones con mensajes recibidos sin leer cuyo último mensaje no es propio y recorta a `99+`, con pruebas propias. Dos diferencias deliberadas, acordadas con el usuario: usa el acento del propio móvil (`theme.accent`/`theme.onAccent`, el mismo del contador de cada fila) en lugar del `danger` de escritorio, que en tema oscuro queda sucio; y se dibuja dentro de `tabBarIcon` porque el `tabBarBadge` de React Navigation impone su `lineHeight`. Al aparecer, el icono se desplaza 4 px a la izquierda y la píldora se superpone a la derecha, con animación.

### Presencia = actividad del usuario, no del nodo

Decisión de producto, común a los dos clientes y fijada el 26/10/2026: **«En línea» describe a la persona, no al nodo.** Que el servicio, el daemon de Yggdrasil o la VPN del par estén levantados es un detalle técnico de transporte; el usuario no debe verlo traducido a un punto verde. El arreglo anterior del `PING`/`PONG` sigue siendo válido para no dar por caído un par alcanzable, pero **un nodo que contesta no es una persona delante de la pantalla**.

- Hoy `lastSeen` se refresca con cualquier paquete entrante autenticado, incluido el `PING` del heartbeat (~10 s), así que la ventana de presencia mide alcanzabilidad: un móvil con la app cerrada y el servicio vivo se queda «En línea» indefinidamente.
- Se separan dos datos: `lastSeen` (transporte, diagnóstico y reachability del outbox) y `lastActive` (actividad humana: abrir la app, volver a primer plano, abrir conversación, escribir, enviar, leer, reaccionar). El ping, los ACK y los `DR_RESET` **no** mueven `lastActive`.
- La etiqueta del usuario pasa a salir de `lastActive` con la misma ventana de antes (`ONLINE_WINDOW_MS`): dentro de 65 s, «En línea»; después, «Última vez …» con la hora de la última acción real. Aquí eso toca `topHeaderSupport` y la tarjeta «Última Actividad» de `ContactsPanelDetails`, que hoy dan «Ahora mismo» con el contacto simplemente alcanzable.
- No se expone «nodo conectado», «servicio activo» ni equivalentes en lista, cabecera ni ficha: el estado de red y DHT se queda en Diagnóstico.
- Implementado el 26/10/2026: migración `0015_contact_last_active.sql` con la columna `lastActive`; `network/messaging/activity.ts` con `markLocalActive`/`localActiveAt` y ventana de 5 min; el `PING` del heartbeat transporta `activeAt` y `network/handlers.ts` persiste el `lastActive` entrante y lo emite en `contact-presence`; IPC `mark-user-active` consumido por `useActivitySignal.ts` (focus, `pointerdown`, `keydown`, `visibilitychange`, throttle 15 s). Todos los puntos que decidían presencia leen ya `lastActive`: `ContactItem`, `ContactsPanel`, `ContactsPanelDetails`, `ContactInfoPanel`, `MainLayoutContent` y `chatStoreListeners`. Prueba en `tests/unit/network/activity.test.ts`.

### Posición de la píldora de reacciones

Las reacciones se dibujan con `position: absolute` y `bottom` negativo (`MessageReactions.tsx`), así que el valor decide cuánto asoma la píldora por debajo de la burbuja. Se ajustó de `-14` a `-18` (26/10/2026) porque quedaba demasiado metida dentro del mensaje; con `-18` apoya justo en el borde y se separa lo suficiente para no tapar el texto ni el timestamp. El móvil hace lo mismo por arriba, con `marginTop` negativo en su propia fila (`ChatReactionRow`), no con posicionamiento absoluto: replicar aquí el `marginTop` del móvil rompería la maquetación de Joy UI.



Regla de diseño para el móvil, fijada el 24/10/2026: **todos los campos de búsqueda comparten la altura de la barra de búsqueda de Chats** — caja de 50, icono de 18, texto de 14, aspa de 16, radio 8, `background.level1` y sin borde permanente. Contactos y el selector de contactos estaban en 35 con un `Input` de 40 que desbordaba la caja. La regla vive en un único `SearchField`, no repetida por pantalla.

### Escalabilidad (prioridad: fanout de grupos)

**Problema:** el fanout de mensajes y control de grupos es secuencial O(N): `sendGroupMessage`, `broadcastGroupUpdatePacket` y `leaveGroup` hacen `await` por cada miembro (resolver contacto + import + entregar), por lo que un grupo de N miembros serializa N operaciones.

- [x] Pool de fanout con concurrencia limitada (`runWithConcurrency`) reutilizable — reduce latencia a O(N/concurrency) sin saturar la red
- [x] Aplicar el pool a `sendGroupMessage` (groups.ts)
- [x] Aplicar el pool a `broadcastGroupUpdatePacket` y `leaveGroup` (groupControl.ts)
- [x] Tests unit del pool (límite de concurrencia y ejecución completa)
- [x] Tests unit del fanout de mensajes con N miembros
- [x] Tests de integración del fanout (multi-miembro, online + offline)
- [x] Tests e2e de envío de mensaje a grupo con varios miembros
- [x] Revalidar `pnpm run lint`, `pnpm test`, `pnpm run test:integration` y `pnpm run test:e2e`

**Extensión:** el multi-send de archivos a grupos (`fileTransfer.ts`) encadena `startSend` por miembro en serie (O(N)). Reutilizar el pool para paralelizarlo.

- [x] Aplicar el pool al multi-send de archivos a grupos en `fileTransfer.ts`
- [x] Tests unit/integración del multi-send paralelo
- [x] Revalidar lint/test/integration/e2e

**Extensión:** paginación del historial de mensajes — `getMessages` solo devuelve los últimos 100 sin forma de cargar más antiguos incrementalmente al hacer scroll hacia arriba.

- [x] `getOlderMessages` en storage (cursor por timestamp, límite acotado)
- [x] Handler IPC `get-older-messages` + preload + types
- [x] Acción `loadOlderHistory` en el store (contacto y grupo)
- [x] Scroll hacia arriba en `ChatArea` dispara carga incremental
- [x] Tests unit de storage y store
- [x] Revalidar lint/test/e2e

## 📞 Llamadas y videollamadas (media P2P)

_Estado: núcleo implementado y probado (señalización `CALL_*`, máquina de estados, validación, IPC/preload, UI y media transport P2P). Pendiente: codecs WebCodecs reales de captura/decode, grupos mesh y SFU distribuido._

### Objetivo
Llamadas de voz y videollamadas E2EE **100% P2P**: sin TURN, sin STUN, sin servidores ni infraestructura centralizada. Solo los peers, la DHT y el transporte P2P existente sobre Yggdrasil.

### Principio de transporte (sin TURN)
No usamos `RTCPeerConnection`/ICE/DTLS-SRTP para mover el media: el renderer no puede emitir candidates hacia la IP Ygg (200::) porque el nodo corre sin TUN, y un TURN sería un punto centralizado que contradice el diseño. En su lugar:
- **Captura** con `getUserMedia` (APIs de captura WebRTC).
- **Codifica/decodifica** con **WebCodecs** (`VideoEncoder`/`AudioDecoder`; opus para audio, VP8/VP9/AV1 para vídeo).
- **Transporta** los chunks codificados como paquetes P2P **cifrados E2EE** por el canal existente (TCP sobre Yggdrasil, reutilizando `sendSecurePacket` + framing + ratchet). En Ygg todo nodo es alcanzable desde cualquier otro: la mesh ya resuelve enrutamiento y reachability, no hay NAT que atravesar ni relay que levantar.
- Opcional en F10: canal **UDP real** vía `yggstack -remote-udp` + SOCKS5 UDP associate para bajar latencia/jitter bajo pérdida. TCP es el MVP.

### Flujo de datos de media
1. `getUserMedia` → tracks.
2. `VideoEncoder`/`AudioEncoder` → chunks con `timestamp` + `sequence` + payload de codec.
3. Fragmentación y **cifrado E2EE** con la capa existente (claves de sesión/ratchet del contacto).
4. Envío por el transporte P2P; el receptor reensambla, desencripta, decodifica (`VideoDecoder`/`AudioDecoder`) y reproduce con **jitter buffer** + **control de congestión** adaptativo (ajuste de bitrate/QP según RTT y pérdida).

### Señalización (tipos de paquete nuevos, firmados Ed25519)
- `CALL_OFFER` — oferta (upeerId + callId + media: audio/vídeo + params de codec)
- `CALL_RING` — aviso de llamada entrante
- `CALL_ACCEPT` / `CALL_ANSWER` — aceptar con params negociados
- `CALL_REJECT` / `CALL_BUSY` / `CALL_CANCEL` / `CALL_END`
- `CALL_MEDIA` — chunks de media (o `CALL_MEDIA_UPDATE` para mute/calidad)
- `CALL_META` — metadatos de llamada (join/leave en grupos, locutor activo)

La señalización 1:1 viaja por el canal directo del contacto; la **DHT** se usa para localizar a los participantes de una llamada de grupo y para elegir/rotar relays.

### Máquina de estados
`idle → outgoing(ringing) | incoming(ringing) → negotiating → connected → ended(causa)`
con timeouts, manejo de rechazo/ocupado/no-answer y caída de red; `CALL_MEDIA` solo tras `connected`.

### IPC / preload
- `ipcMain.handle`: `start-call`, `accept-call`, `reject-call`, `end-call`, `call-toggle-media`, `call-devices`, `call-params`.
- Eventos: `call-incoming`, `call-accepted`, `call-state`, `call-media` (chunks), `call-error`.
- El renderer captura/codifica/decodifica; el main enruta señalización y media por la mesh.

### UI (Joy UI)
- Botones en `TopHeaderActions` (ya presentes): voz y vídeo.
- Modal de llamada entrante y overlay de llamada activa (mic, cámara, colgar, duración).
- Componentes: `CallOverlay`, `CallVideoTile`, `CallControls`, hook `useCall`.

### Escalabilidad
1. **1:1**: stream directo peer-a-peer por la mesh (siempre alcanzable; O(1) flujos).
2. **Grupos pequeños (≤ 4-6)**: **mesh** — cada peer envía su stream a los demás (O(N²) flujos); sin relay, máxima resiliencia.
3. **Grupos grandes**: **SFU distribuido en un peer** elegido por DHT/reputación/latencia — el peer recibe y reenvía (O(N) flujos). No es servidor central: es un participante de la llamada, con **failover** (otro peer asume por consenso si se cae) y rotación.
4. **Grupos muy grandes**: cascada/árbol de relays entre peers (reducción logarítmica del ancho de banda) + **AV1/VP9 simulcast** y **selección de locutor activo** (solo se cursa vídeo del que habla).
5. **Control de congestión propio** (no hay `RTCPeerConnection`): bitrate adaptativo por RTT/pérdida, escalado VP8→VP9→AV1.
6. La **DHT** aporta: descubrimiento de participantes en grupos, elección/failover del SFU y hallazgo de rutas óptimas.

### Fases
- [x] **F1 — Señalización y estado**: paquetes `CALL_*` (`CALL_OFFER/RING/ACCEPT/REJECT/BUSY/CANCEL/END/MEDIA/MEDIA_UPDATE/META`), `callManager` en main (máquina de estados `idle→ringing→negotiating→connected→ended` con timeouts), validación en `validationCalls`/`validation.ts` + tests unit e integración multiproceso.
- [x] **F2 — IPC/preload + hook**: channels (`start-call`, `accept-call`, `reject-call`, `end-call`, `call-toggle-media`, `call-devices`, `call-params`), `callApi` + eventos en `preloadBridge`, `useCallStore` + `useCall`, modales y overlay (`CallHost`, `CallIncomingModal`, `CallOverlay`, `CallControls`) integrados en `App` y botones conectados en `TopHeaderActions`.
- [~] **F3 — Media local**: `getUserMedia`, preview local (`srcObject`), captura por track y enumeración implementados en `useCallMedia`/`CallOverlay`; verificación real requiere navegador/cámara.
- [~] **F4 — Audio 1:1 P2P**: transporte cifrado por el canal P2P + IPC `send-call-media` probados end-to-end en el harness; captura/codificación opus y decodificación/reproducción remota (AudioContext) implementadas con WebCodecs (`webCodecsSession`).
- [~] **F5 — Vídeo 1:1**: captura/codificación VP8 y decodificación + dibujado en `<canvas>` remoto implementadas con WebCodecs; verificación real requiere cámara.
- [x] **F6 — Robustez**: timeouts de ring (30 s) y negociación (20 s) en `callManager`, manejo de rechazo/ocupado/cancelado/no-answer/remote-end.
- [x] **F7 — Seguridad**: validación estricta de tipos y payloads `CALL_*`, sellado de la señalización con la clave pública del contacto (E2EE del canal).
- [x] **F8 — Grupos mesh (≤ 4-6)**: `startGroupCall`, sesiones de grupo (`createGroup`/`createGroupIncoming`), fan-out de `CALL_MEDIA` a todos los miembros; probado en el harness con 3 procesos.
- [~] **F9 — Relay/SFU distribuido (fase 1)**: elección determinista del relay por **reputación** (`getVouchScore`, desempate por upeerId), `isRelay`/`relayFor`/`relayUpeerId` en `callManager`, enrutamiento selectivo de `CALL_MEDIA` (los no-relay envían solo al relay; el relay hace fan-out), notificación vía `CALL_META { type: 'relay' }` al iniciar grupo y recalculo + failover al unirse/salir un miembro (`CALL_JOIN`/`CALL_LEAVE`). Pendiente: detección de caída del relay por timeout/heartbeat y elección por DHT (hoy usa reputación local).
- [x] **F10 — Canal UDP real (opcional)**: `yggstack -remote-udp` + SOCKS5 UDP associate para bajar latencia.
- [x] **F11 — Validación global**: `tsc`, `lint`, tests unit (39 de llamada) e integración multiproceso (escenario `llamada de voz P2P` con señalización `CALL_*` end-to-end) en verde.
- [x] **F12 — UI estilo WhatsApp (ventanas flotantes de llamada integradas + grupos + multi-llamada)**: `useCallStore` pasa de una única llamada a un **mapa de llamadas activas** (`calls` + `activeCallId`) con soporte de `isGroup`/`groupMembers`. `callManager.getAll()` expone todas las sesiones y nuevo IPC `get-all-calls` + `start-group-call` (+ `callApi.getAllCalls`/`startGroupCall`). Cada llamada activa es una **ventana flotante** (`CallWindow`) **arrastrable**, redimensionable (expandir/reducir) y minimizable, **integrada en la app** (no bloquea el resto), estilo WhatsApp; soporta **grid grupal** de participantes dentro de la ventana, vídeo 1:1 con self-view, audio con avatar + duración. `CallHost` gestiona **múltiples llamadas a la vez** como ventanas flotantes apiladas, con chips de reanudar para las minimizadas, y modal de llamada entrante. Añadido join/leave dinámico de grupo (`CALL_JOIN`/`CALL_LEAVE`, `callManager.joinGroup`/`leaveGroup`/`getConnectedMembers`) y fan-out de media solo a conectados. Botones de llamada de grupo conectados en `TopHeader`. (Verificación visual de captura/decode requiere navegador/cámara.)
- [x] **F13 — Compartir pantalla/ventana (screen share) con/sin sonido del sistema**: nuevo tipo de media `'screen'` en `mediaChunker` (codificado/decodificado distinto de `audio`/`video`). `useCallMedia.startScreenShare({ target: 'screen' | 'window', withSystemAudio })` usa `getDisplayMedia` para capturar pantalla o ventana, con o sin audio del sistema (que se codifica como canal `audio`). `CallWindow` añade botón de compartir pantalla con panel de opciones (Pantalla/Ventana × con/sin sonido), indicador "Compartiendo", y muestra la **pantalla remota** como panel principal cuando el otro participante comparte (canvas `screenCanvasRef`), con etiqueta "X comparte pantalla" y los participantes reducidos abajo. Test de roundtrip del frame `screen` en `mediaChunker`.



### Riesgos / limitaciones
- TCP introduce latencia/head-of-line vs UDP; mitigar con jitter buffer y, en F10, canal UDP.
- WebCodecs requiere Chromium (Electron lo tiene); mockear `VideoEncoder`/`AudioDecoder` en tests (patrón de `useAudioRecorder`).
- El SFU distribuido ve el media de la llamada → aplicar E2EE con claves por-llamada en la que el SFU reenvía sin poder descifrar (o tolerar que, como participante, descifre/recifre).
- Sin TUN el media va por el canal existente (Ygg); la reachability siempre está (mesh), la latencia depende de la ruta Ygg.


---

## 🔧 Principios de desarrollo

1. **Zero-Trust en IPC** — el renderer nunca toca claves privadas; `main.ts` valida y restringe todo input
2. **Listeners IPC únicos** — `removeAllListeners` antes de cada `ipcRenderer.on`; listeners en `useEffect([])`
3. **Sin datos sensibles en logs** — ningún `console.log/warn` expone IDs, claves o rutas en producción
4. **Joy UI** — todo componente nuevo sigue el sistema de diseño existente
5. **Tests primero** — validar con 2-3 nodos antes de escalar a pruebas completas
