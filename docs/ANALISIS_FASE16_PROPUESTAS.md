# Análisis de Propuestas Fase 16+ - Casos de Uso y Motivos

## Contexto del Proyecto Actual

uPeer P2P ha completado la **Fase 15** con las siguientes capacidades validadas:

### ✅ Implementado y Validado

1. **Comunicación P2P descentralizada** sobre Yggdrasil IPv6
2. **Cifrado E2EE con Perfect Forward Secrecy** (nivel Signal)
3. **Kademlia DHT completa** con descubrimiento escalable O(log n)
4. **Renewal tokens funcionales** para persistencia 60+ días (implementación básica en pruebas)
5. **Sistema de reputación social** contra ataques Sybil
6. **Paquetes de instalación nativos** (Debian/RPM) con servicio systemd
7. **Suite completa de testing** (Docker, métricas, simulaciones 60 días)

### 🔄 Estado Actual del Código Principal

- **Mensajería de texto**: Completa con reacciones, edición, eliminación
- **Gestión de contactos**: Funcional con descubrimiento DHT
- **Seguridad**: Cifrado E2EE, firmas Ed25519, rotación de claves efímeras
- **Privacidad**: Zero leaks de contactCache, tokens efímeros
- **Renewal tokens**: Implementados en pruebas (`peer_bot.py`) pero **no integrados** en código principal
- **Sistema de reputación**: Implementado en pruebas, pendiente de integración
- **Archivos multimedia**: **No implementado**

---

## 🎯 Análisis de Propuestas Fase 16+

### 1. Archivos y Multimedia

#### 1.1 Protocolo de fragmentos - Segmentación de archivos en paquetes UDP con integridad

**Caso de Uso Concreto**:

- Usuario A quiere enviar un documento PDF de 8MB a Usuario B.
- El MTU de la red es ~1500 bytes, necesitando dividir el archivo en ~5500 fragmentos.
- Cada fragmento debe tener secuencia, checksum y cifrado independiente.
- El receptor reconstruye el archivo y verifica integridad con hash final.

**Motivos para Implementar**:

- **Base tecnológica**: Requisito previo para cualquier transferencia de archivos.
- **Confiabilidad UDP**: Permite recuperación de paquetes perdidos con ACK selectivo.
- **Eficiencia**: Streaming progresivo (empezar a mostrar datos antes de completar).
- **Alineación con arquitectura**: Extiende el protocolo UDP seguro existente.

**Estado Actual**: ❌ No implementado
**Dependencias**: Ninguna (puede construirse sobre capa de mensajería actual)

#### 1.2 Envío de imágenes - Compresión y transferencia optimizada

**Caso de Uso Concreto**:

- Usuario toma foto con cámara (12MP, ~15MB RAW).
- App detecta tipo imagen, aplica compresión WebP (calidad 85%, reduce a ~1.5MB).
- Transfiere con progreso visual y muestra thumbnail durante descarga.
- Preserva metadatos EXIF (opcional, con striping para privacidad).

**Motivos para Implementar**:

- **Experiencia de usuario**: Compresión transparente reduce tiempos de espera.
- **Ahorro de recursos**: Crucial para redes móviles con datos limitados.
- **Competitividad**: Expectativa básica en apps de mensajería modernas.
- **Privacidad**: Opción de eliminar metadatos EXIF (GPS, etc.).

**Estado Actual**: ✅ Stripping de metadatos EXIF implementado (JPEG, PNG, WebP, TIFF, AVIF)
**Dependencias**: Protocolo de fragmentos (1.1)

#### 1.3 Mensajes de voz - Grabación y envío de audio comprimido

**Caso de Uso Concreto**:

- Usuario mantiene presionado botón de micrófono, graba mensaje de 2 minutos.
- Audio se comprime con Opus (bitrate adaptativo 8-32 kbps).
- Se envía como archivo de audio con metadatos de duración.
- Receptor puede reproducir en línea o descargar completo.

**Motivos para Implementar**:

- **Comunicación natural**: Mensajes de voz son más rápidos que escribir.
- **Accesibilidad**: Importante para usuarios con discapacidades visuales.
- **Eficiencia**: Opus ofrece excelente calidad a bajos bitrates.
- **Innovación**: Diferenciación frente a otras soluciones P2P.

**Estado Actual**: ❌ No implementado
**Dependencias**: Protocolo de fragmentos (1.1), APIs de audio Web/Electron

#### 1.4 Videos y documentos - Transferencia segura de cualquier tipo de archivo

**Caso de Uso Concreto**:

- Usuario arrastra archivo .docx de 3MB a la ventana de chat.
- App detecta tipo documento, muestra icono y tamaño.
- Transfiere con cifrado E2EE, permite pausar/reanudar.
- Receptor puede abrir con aplicación predeterminada.

**Motivos para Implementar**:

- **Utilidad completa**: Chat sin transferencia de archivos es limitado.
- **Seguridad consistente**: Mismo nivel E2EE que mensajes de texto.
- **Profesional**: Necesario para uso empresarial/colaborativo.
- **Extensibilidad**: Base para futuras funciones (colaboración en tiempo real).

**Estado Actual**: ❌ No implementado
**Dependencias**: Protocolo de fragmentos (1.1), detección de tipos MIME

#### 1.5 Barra de progreso P2P - Visualización en tiempo real basada en ACKs de fragmentos

**Caso de Uso Concreto**:

- Durante transferencia de video 500MB, usuario ve:
  - Porcentaje completado (45%)
  - Velocidad actual (2.4 MB/s)
  - Tiempo estimado (25 segundos)
  - Gráfico de rendimiento P2P (calidad de conexión)

**Motivos para Implementar**:

- **Transparencia**: Usuario entiende estado de la transferencia.
- **Control**: Permite cancelar transferencias lentas.
- **Diagnóstico**: Identifica problemas de red (pérdida de paquetes).
- **Engagement**: Feedback visual mejora percepción de calidad.

**Estado Actual**: ❌ No implementado
**Dependencias**: Protocolo de fragmentos (1.1) con sistema de ACKs

---

### 2. Mejoras de Renewal Tokens

#### 2.1 Integración con DHT distribuido - Almacenar tokens en DHT para descubrimiento descentralizado

**Caso de Uso Concreto**:

- Usuario Carlos viaja sin internet por 40 días.
- Antes de partir, genera renewal tokens para 10 contactos.
- Tokens se publican en DHT con clave `renewal:<carlos-id>:<hash>`.
- Contacto nuevo (no en lista original) puede descubrir tokens via DHT y renovar ubicación.

**Motivos para Implementar**:

- **Resiliencia extrema**: Tokens sobreviven si contactos directos desaparecen.
- **Descubrimiento descentralizado**: Elimina dependencia de subconjunto de nodos.
- **Escalabilidad**: Permite redes más grandes sin degradación.
- **Filosofía P2P pura**: Alinea con principios de descentralización completa.

**Estado Actual**: 🟡 Implementación básica en pruebas, no integrada
**Dependencias**: DHT Kademlia existente, schema para almacenamiento de tokens

#### 2.2 Auto-renovación automática - Threshold de 3 días para renovación propia

**Caso de Uso Concreto**:

- Nodo de Ana está online continuamente.
- Su location block expira en 30 días.
- Sistema monitorea expiración y cuando faltan 3 días, automáticamente:
  1. Incrementa secuencia DHT
  2. Genera nuevo location block firmado
  3. Publica en DHT
  4. Notifica a contactos íntimos

**Motivos para Implementar**:

- **Prevención de errores**: Evita expiraciones accidentales por olvido.
- **Reducción de carga**: Menos dependencia de renewal tokens para nodos activos.
- **Automatización**: Alinea con principio "funciona sin intervención".
- **Optimización**: Threshold de 3 días da margen para reintentos ante fallos.

**Estado Actual**: 🟡 Lógica implementada en `peer_bot.py`, no integrada
**Dependencias**: Sistema de heartbeat existente, tracking de expiración

#### 2.3 UI de gestión de tokens - NO IMPLEMENTAR (Filosofía de simplicidad)

**Decisión de Diseño**: Siguiendo la filosofía de "nada técnico para los usuarios", no se implementará interfaz de gestión de tokens. En su lugar, el sistema manejará tokens automáticamente:

- Generación automática basada en patrones de comunicación
- Renovación automática sin intervención del usuario
- Revocación automática tras detección de comportamiento sospechoso
- Backup automático en Survival Kit

**Motivos para No Implementar UI**:

- **Simplicidad**: Usuarios no deben preocuparse por conceptos técnicos
- **Automatización**: El sistema puede tomar mejores decisiones que usuarios ocasionales
- **Seguridad**: Reduce errores humanos en gestión de credenciales
- **Enfoque P2P puro**: La red debe autogestionarse sin supervisión humana

**Estado Actual**: ❌ No implementado (y no se implementará)
**Alternativa**: Sistema completamente automático de gestión de tokens

#### 2.4 Backup de tokens - Almacenamiento seguro de múltiples tokens

**Caso de Uso Concreto**:

- Usuario realiza backup mensual de su "Survival Kit".
- Kit incluye:
  - Claves públicas propias
  - Location blocks de contactos
  - **Todos los renewal tokens generados** (cifrados)
- Al restaurar desde nuevo dispositivo, puede recuperar capacidad de renovación.

**Motivos para Implementar**:

- **Recuperación ante desastres**: Pérdida de dispositivo no significa pérdida de red.
- **Persistencia a largo plazo**: Mantener relaciones por años.
- **Portabilidad**: Migrar entre dispositivos sin interrupción.
- **Seguridad**: Cifrado local con clave maestra.

**Estado Actual**: 🟡 Survival Kit implementado pero sin tokens
**Dependencias**: Sistema de backup existente, cifrado adicional

---

### 3. Integración con Sistema de Reputación

#### 3.1 Integración con PoW adaptativo - Ajustar dificultad basado en reputación

**Caso de Uso Concreto**:

- Nodo nuevo (reputación 0): Proof-of-Work con dificultad 1000000 hashes.
- Nodo establecido (reputación 85): PoW con dificultad 10000 hashes (100x más fácil).
- Nodo malicioso detectado (reputación -50): PoW con dificultad 5000000 hashes (5x más difícil).

**Motivos para Implementar**:

- **Incentivos alineados**: Buen comportamiento reduce costos computacionales.
- **Defensa Sybil mejorada**: Ataques masivos son económicamente inviables.
- **Justicia distribuida**: La red recompensa contribuciones positivas.
- **Eficiencia energética**: Nodos legítimos consumen menos recursos.

**Estado Actual**: 🟡 PoW adaptativo implementado en pruebas, no integrado con reputación
**Dependencias**: Sistema de reputación social, métricas de reputación cuantificadas

#### 3.2 Notificaciones de rotación de claves - Protocolo para avisar a contactos

**Caso de Uso Concreto**:

- Clave efímera de Bob rota tras 100 mensajes.
- Sistema envía notificación `KEY_ROTATION` a todos los contactos activos.
- Notificación incluye nueva clave pública efímera firmada con clave maestra.
- Contactos actualizan su registro automáticamente sin interrumpir chat.

**Motivos para Implementar**:

- **PFS robusto**: Rotación frecuente sin pérdida de conectividad.
- **Sincronización automática**: Elimina necesidad de re-handshake.
- **Transparencia**: Contactos conocen estado de seguridad del canal.
- **Eficiencia**: Menos mensajes de handshake completo.

**Estado Actual**: 🟡 Rotación de claves implementada, notificaciones no
**Dependencias**: Protocolo de notificación, almacenamiento de claves por contacto

#### 3.3 Renewal tokens basados en confianza - Nodos con alta reputación pueden renovar más

**Caso de Uso Concreto**:

- Nodo con reputación ≥80 puede:
  - Generar tokens con hasta 10 renovaciones (vs 3 estándar)
  - Tokens con duración 90 días (vs 60 estándar)
  - Renovar location blocks de cualquier contacto (no solo mutuos)
- Nodo con reputación ≤30 limitado a 1 renovación por token.

**Motivos para Implementar**:

- **Jerarquía orgánica**: La red auto-organiza basada en confianza.
- **Escalabilidad**: Nodos confiables asumen más responsabilidad.
- **Incentivos**: Motiva contribución positiva a la red.
- **Resiliencia**: Distribuye carga de mantenimiento.

**Estado Actual**: ❌ No implementado
**Dependencias**: Sistema de reputación cuantificada, límites dinámicos

#### 3.4 Verificación social de tokens - Validación a través del grafo social

**Caso de Uso Concreto**:

- Nodo desconocido presenta renewal token para Ana.
- Sistema consulta a contactos mutuos: "¿Confías en este nodo para renovar a Ana?"
- Si 3 de 5 contactos responden positivamente, token aceptado.
- Respuestas son firmadas y almacenadas como prueba social.

**Motivos para Implementar**:

- **Validación descentralizada**: No depende de autoridad central.
- **Resistencia a Sybil**: Ataques requieren infiltrar círculos sociales.
- **Confianza contextual**: Decisiones basadas en relaciones existentes.
- **Transparencia**: Trazabilidad de decisiones de confianza.

**Estado Actual**: ❌ No implementado
**Dependencias**: Grafo social accesible, protocolo de consulta/respuesta

#### 3.5 Rate limiting basado en reputación e identidad - Límites adaptativos por identidad criptográfica

**Caso de Uso Concreto**:

- Nodo atacante rota direcciones IP en Yggdrasil para evadir límites por IP.
- Sistema aplica límites por `upeerId` (identidad criptográfica) además de IP.
- Nodos con alta reputación obtienen límites más generosos (hasta 3x base).
- Nodos con baja reputación tienen límites más restrictivos (hasta 0.1x base).
- Defensa en capas: IP + identidad + reputación.

**Motivos para Implementar**:

- **Resistencia a rotación de IPs**: Ataques DoS con IPs dinámicas son mitigados.
- **Justicia social**: Nodos bien comportados obtienen más capacidad de red.
- **Incentivos alineados**: Comportamiento positivo mejora reputación → mejores límites.
- **Compatibilidad**: Funciona con nodos legados (sin identidad) usando solo IP.

**Estado Actual**: ✅ **Implementado** (Marzo 2026)
**Dependencias**: Sistema de reputación social, rate limiter existente
**Archivos**: `identity-rate-limiter.ts`, `handlers.ts` actualizado

---

### 4. Optimizaciones de Rendimiento

#### 4.1 Compresión de mensajes - Reducir overhead de red para mensajes largos

**Caso de Uso Concreto**:

- Usuario escribe mensaje de 5000 caracteres (discusión técnica).
- Sistema aplica compresión Brotli (ratio ~5:1).
- Tamaño transmitido: ~1KB en lugar de ~5KB.
- Receptor descomprime transparentemente antes de mostrar.

**Motivos para Implementar**:

- **Ahorro de ancho de banda**: Crucial para redes satelitales/móviles.
- **Latencia reducida**: Menos paquetes = menos round-trips.
- **Eficiencia energética**: Menos transmisión = menor consumo batería.
- **Costo reducido**: Importante para usuarios con planes de datos limitados.

**Estado Actual**: ❌ No implementado
**Dependencias**: Librería de compresión, detección umbral (ej. >500 bytes)

#### 4.2 Caching inteligente - Almacenamiento local optimizado para dispositivos móviles

**Caso de Uso Concreto**:

- App detecta dispositivo móvil con 64GB almacenamiento (32GB libre).
- Implementa políticas:
  - Mantener últimas 1000 imágenes en caché
  - Videos >1MB solo conservar si vistos recientemente
  - Limpiar automáticamente archivos >30 días sin acceso
  - Comprimir caché antiguo con menor calidad

**Motivos para Implementar**:

- **Experiencia móvil**: Apps que agotan almacenamiento son desinstaladas.
- **Rendimiento**: Acceso rápido a medios frecuentes.
- **Gestión automática**: Usuario no necesita limpiar manualmente.
- **Adaptabilidad**: Diferentes políticas para desktop vs móvil.

**Estado Actual**: ❌ No implementado
**Dependencias**: Sistema de almacenamiento jerárquico, detección de plataforma

#### 4.3 Sincronización diferencial - Actualizaciones incrementales para grandes historiales

**Caso de Uso Concreto**:

- Usuario vuelve a chat grupal tras 2 semanas offline (1500 mensajes nuevos).
- En lugar de descargar 1500 mensajes completos:
  - Solicita diff desde su último timestamp conocido
  - Recibe solo 50 mensajes nuevos (resumen de conversación)
  - Descarga mensajes completos bajo demanda al hacer scroll

**Motivos para Implementar**:

- **Tiempo de sincronización**: De minutos a segundos.
- **Uso de red**: Reduce carga en redes lentas/congestionadas.
- **Escalabilidad**: Permite grupos de 1000+ miembros.
- **Experiencia**: App se siente inmediatamente responsiva.

**Estado Actual**: ❌ No implementado
**Dependencias**: Marcas de tiempo de sincronización, protocolo de diff

#### 4.4 Balanceo de carga DHT - Distribución óptima de almacenamiento en la red

**Caso de Uso Concreto**:

- Monitoreo detecta que 10% de nodos almacenan 40% de los datos DHT.
- Sistema inicia rebalanceo:
  - Identifica datos en nodos sobrecargados
  - Replica en nodos subutilizados
  - Actualiza punteros de localización gradualmente
  - Monitoriza impacto en rendimiento de búsqueda

**Motivos para Implementar**:

- **Justicia distributiva**: Evita explotación de nodos altruistas.
- **Durabilidad**: Datos distribuidos uniformemente sobreviven mejor.
- **Rendimiento**: Búsquedas más rápidas con distribución equitativa.
- **Sostenibilidad**: Previene abandono de nodos sobrecargados.

**Estado Actual**: ❌ No implementado
**Dependencias**: Monitoreo de carga DHT, protocolo de rebalanceo

---

## 📊 Matriz de Prioridades Recomendadas

### Prioridad ALTA (Fundacional, alto impacto)

1. **Protocolo de fragmentos (1.1)** - Base para todas las transferencias de archivos
2. **Integración DHT renewal tokens (2.1)** - Completa funcionalidad Fase 15
3. **Auto-renovación automática (2.2)** - Mejora resiliencia sin intervención

### Prioridad MEDIA (Mejora experiencia, valor agregado)

4. **Envío de imágenes (1.2)** - Caso de uso más común de archivos
5. **Compresión mensajes (4.1)** - Mejora rendimiento para todos los usuarios
6. **Notificaciones rotación claves (3.2)** - Mejora PFS y usabilidad

### Prioridad BAJA (Avanzado, optimización)

7. **Mensajes de voz (1.3)** - Requiere APIs de audio, caso de uso específico
8. **Caching inteligente (4.2)** - Importante para versión móvil futura
9. **Renewal tokens basados en confianza (3.3)** - Requiere reputación madura
10. **Sincronización diferencial (4.3)** - Para grupos grandes
11. **Balanceo carga DHT (4.4)** - Optimización para escala masiva
12. **Verificación social tokens (3.4)** - Mecanismo avanzado de confianza
13. **Integración PoW reputación (3.1)** - Refinamiento defensa Sybil
14. **Backup tokens (2.4)** - Extensión sistema existente
15. **Videos y documentos (1.4)** - Depende de fragmentos, amplía casos de uso
16. **Barra progreso P2P (1.5)** - Mejora UX pero no crítico

---

## 🔧 Recomendaciones de Implementación

### Fase 16 Inmediata (Sprint 1-2)

1. **Protocolo de fragmentos**: Implementar en `src/main_process/network/file-transfer.ts`
   - Clase `FileFragmenter` con métodos `split()`, `reassemble()`
   - Protocolo `FILE_FRAGMENT` con ACK selectivo
   - Integración con cifrado existente (fragmentos cifrados individualmente)

2. **Integración DHT renewal tokens**: Extender `src/main_process/network/dht-handlers.ts`
   - Funciones `storeRenewalToken()`, `findRenewalToken()`
   - Schema DHT: `renewal:<targetId>:<tokenHash>`
   - Replicación K=8, TTL 60 días

3. **Auto-renovación automática**: Modificar `src/main_process/network/dht.ts`
   - Tracking de expiración en `broadcastDhtUpdate()`
   - Trigger a 3 días antes (threshold configurable)
   - Logs para monitoreo

### Fase 16 Sprint 3-4

4. **Envío de imágenes**: Componente `ImageCompressor`
   - Usar librería `sharp` para compresión WebP/JPEG
   - Integración con protocolo de fragmentos
   - Preview durante transferencia

5. **Compresión mensajes**: Middleware en `sendSecureUDPMessage()`
   - Detectar mensajes >500 bytes
   - Aplicar Brotli compresión antes de cifrar
   - Header indicando compresión

---

## ⚠️ Consideraciones Críticas

### Seguridad

- **Fragmentos cifrados individualmente**: Cada fragmento debe tener nonce único
- **Renewal tokens en DHT**: Firmados pero visibles, considerar privacidad
- **Compresión antes de cifrado**: No reduce seguridad si se aplica antes de cifrado

### Compatibilidad

- **Backward compatibility**: Nuevos protocolos deben coexistir con versión actual
- **Fallback graceful**: Si receptor no soporta fragmentos, mostrar mensaje educativo
- **Migración gradual**: Cambios DHT deben permitir nodos legacy

### Rendimiento

- **Overhead fragmentación**: Mantener <10% overhead vs transferencia directa
- **Memoria durante transferencias**: Streaming para evitar cargar archivos completos en RAM
- **DHT load testing**: Evaluar impacto de almacenar renewal tokens

---

## 📈 Métricas de Éxito Esperadas

| Funcionalidad        | Métrica Objetivo                     | Impacto                   |
| -------------------- | ------------------------------------ | ------------------------- |
| Protocolo fragmentos | <5% packet loss recovery             | Transferencias confiables |
| DHT renewal tokens   | >95% disponibilidad 60 días          | Persistencia demostrada   |
| Auto-renovación      | 0 expiraciones accidentales          | Resiliencia automatizada  |
| Compresión mensajes  | 60% reducción tamaño mensajes largos | Eficiencia red            |

---

**Documento generado**: Marzo 2026  
**Basado en**: Roadmap.md, análisis código actual, VALIDACION_RENEWAL_TOKENS.md  
**Estado**: Propuesta técnica para planificación Fase 16+
