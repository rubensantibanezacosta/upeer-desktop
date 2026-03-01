# 🗺️ Hoja de Ruta Actualizada: RevelNest Chat P2P

Este documento refleja el estado actual del proyecto tras la transición a la marca RevelNest y la implementación del Sistema de Diseño Premium. Hemos evolucionado de un prototipo funcional a una aplicación con una interfaz profesional, modular y preparada para la escala.

## [x] Fase 1, 2 y 3: Cimientos y Mensajería Básica (¡COMPLETADO!)
- Arquitectura Electron + Vite + React + TypeScript.
- Motor UDP sobre Yggdrasil IPv6.
- Persistencia en SQLite (Drizzle ORM).
- Mensajería con UUIDs y ACKs (Doble Check ✓✓).
- Histórico de chats persistente.

## [x] Fase 4: Experiencia de Usuario Avanzada (¡COMPLETADO!)
- Presencia Real: "En línea" basado en Heartbeats autenticados.
- Indicadores: "Escribiendo..." en tiempo real.
- Última vez: Registro y sincronización de última desconexión.
- Respuestas y Citas (Reply): Interfaz para citar mensajes anteriores (referencia por UUID).
- Estados de Lectura: Implementación de doble check azul para mensajes leídos.

## [x] Fase 5: Identidad Soberana y Branding RevelNest (¡COMPLETADO!)
- Llave Maestra Ed25519: Generación y persistencia de identidad criptográfica.
- RevelNest ID: Identificador único derivado del hash de la clave pública.
- Protocolo de Firmas: Firma digital de TODOS los paquetes (Mensajes, ACKs, PINGs).
- Branding Unificado: Transición completa de "Nido-ID" a RevelNest ID y estética premium.
- Validación Estricta: El nodo ignora cualquier paquete con firma inválida o origen desconocido.

## [x] Fase 6: Refactorización UI y Gestión de Contactos (¡COMPLETADO!)
- Modularización del Sidebar: Componentes independientes (SidebarHeader, SidebarSearch, ContactItem).
- Menú Contextual Premium: Opciones de chat (Archivar, Silenciar, Eliminar) con diseño limpio y sin redundancias.
- Gestión de Eliminación: Confirmación segura con modales estandarizados para evitar borrados accidentales.
- Modales RevelNest: Interfaz unificada para Identidad, Compartir Contacto y Añadir Amigo.
- Automatización de Pruebas: Bot de Docker capaz de agregar usuarios e iniciar conversaciones automáticamente.

## [x] Fase 7: Privacidad Total (E2EE) (¡COMPLETADO!)
- Cifrado de Contenidos: Implementar crypto_box (Salsa20/Poly1305) para cifrar el cuerpo del mensaje.
- Secreto Perfectamente Adelantado (PFS): Implementar ratcheting de llaves (estilo Signal) para sesiones de chat.
- Verificación de Seguridad: Comparativa de "Fingerprints" entre usuarios para asegurar que no hay Man-in-the-Middle.

## 🚀 PRÓXIMAS METAS
## [x] Fase 8: Red de Descubrimiento Escalar (Kademlia DHT & Roaming) (¡COMPLETADO!)
- Bootstrap id@ipv6 (Modo Inicial) y Chismorreo (Gossip): Red base superada. El usuario anota el ID y la IP directamente. La red propaga actualizaciones de IP válidas mediante "chismorreo".
- Identidad Persistente (Roaming): Resiliencia a cambio de red completada. El protocolo emite un paquete DHT_UPDATE firmado criptográficamente, y la DHT propaga la nueva ubicación. Tus amigos simplemente apuntarán los mensajes a tu nueva IP de manera transparente.
- Versionado Cronológico (SeqNum) y Zero-Trust DHT: Prevención contra registros falsos y antiguos completada.
- Kademlia DHT Estructurada (Objetivo Escalar): Para evitar "tormentas de broadcast" en redes masivas, reemplazamos el motor de chismorreo por Kademlia. Métrica XOR: Los IDs "más cercanos" matemáticamente actúan como directorio descentralizado y custodio del Location Block firmado.
- Direct Push (Optimización Social Graph): Para el círculo íntimo de contactos activos, mantenemos un envío directo UDP de la nueva IP cuando cambie, logrando 0 interrupción.

## [x] Fase 9: Sidecar Yggdrasil Integrado (¡COMPLETADO!)
- Ejecución Nativa: Yggdrasil orquestado dentro de Electron como subproceso.
- Bundle Multiplataforma: Binarios para Windows (x64), Linux (x64, arm64) e Intel/M1 Macs incluidos en la app.
- Auto-Configuración Inteligente: Detección de red existente, generación de configuraciones y bootstrap automático.
- UX de Privilegios: Solicitud de permisos de administración amigable ("Habilitar conexión a la red distribuida").
- Gestión del Ciclo de Vida: Inicio y cierre automático del demonio Yggdrasil sincronizado con la aplicación.
- Experiencia de Usuario Mejorada:
  - **Mensajes Claros**: Logs de consola amigables que explican el propósito de los permisos
  - **Diálogo Sudo Personalizado**: Nombre descriptivo "RevelNest Secure Network" en lugar de rutas técnicas
  - **Lógica Inteligente**: Intento automático sin privilegios primero, solo pide sudo cuando es necesario
  - **Capabilities Linux**: Uso de `cap_net_admin` para evitar solicitudes repetidas de sudo
  - **Manejo Robusto**: Detección temprana de errores y limpieza automática de archivos de root

## 🚀 PRÓXIMAS METAS (PRIORIDAD ALTA)
## [x] Fase 10: Descubrimiento Reactivo y Auto-Recuperación (DHT Query) (¡COMPLETADO!)
- DHT Query (Find-Node): Capacidad de "preguntar" activamente a la red por una identidad (revelnestId) cuando la IP conocida no responde.
- Manejo de Timeouts Inteligente: Si un mensaje no recibe ACK tras 5s, se dispara automáticamente una búsqueda en los nodos conocidos más cercanos.
- Caching de Rutas: El sistema actualiza la agenda de contactos con bloques de localización válidos recibidos vía Query para restablecer la comunicación de forma transparente.
- Validación de Roaming: Testeado con éxito simulando cambios de red en tiempo real.

## 🚀 PRÓXIMAS METAS (PRIORIDAD ALTA)
## [ ] Fase 11: Interacción Social y Edición
- Reacciones: Capacidad de reaccionar con Emojis a mensajes individuales (X-Reactions).
- Eliminación para Todos: Paquete de purga firmado para eliminar mensajes en ambos extremos.
- Edición de Mensajes: Actualización de contenido firmado para mensajes ya enviados con historial local opcional.

## [ ] Fase 12: Archivos y Multimedia (Protocolo de Fragmentos)
- Envío de Imágenes: Segmentación de archivos en paquetes UDP con integridad delegada.
- Mensajes de Voz: Grabación y envío de audio comprimido.
- Barra de Progreso P2P: Visualización del estado de transferencia en tiempo real basada en ACKs de fragmentos.

---

## 🛠️ Reglas de Oro para Desarrollo
- **Estética RevelNest**: Todo componente nuevo debe usar el sistema de diseño Joy UI con bordes xl, sombras lg y colores armónicos.
- **Zero-Trust**: El Renderer nunca maneja claves privadas. El Main valida todo antes de enviar al Renderer.
- **Validación con Bot**: Cada nueva funcionalidad de protocolo debe ser testeada con el peer_bot antes de su integración final.