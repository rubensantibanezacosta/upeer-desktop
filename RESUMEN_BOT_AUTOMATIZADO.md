# Bot Docker Automatizado para RevelNest

## 🎯 Objetivo Cumplido
Automatizar un contenedor Docker que solicite contacto a una instancia de RevelNest y responda automáticamente a mensajes.

## 🤖 Especificaciones del Bot

### Información Técnica
- **Nombre del contenedor:** `revelnest-bot-user`
- **Imagen Docker:** `revelnest-bot` (construida desde `Dockerfile.peer`)
- **Red:** Yggdrasil con 3 peers públicos
- **Puerto:** 50005 (UDP)

### Identidad del Bot (actual)
- **RevelNest ID:** `808bcb86a1ec73fd71353abebe3a09af`
- **Dirección Yggdrasil:** `201:d924:8f24:dab0:c46f:56c0:a7ea:d921`
- **Clave pública:** `25bbf4027fc319a8f6fa100ba132ce5f7b78df2d8e73ea990c68e41c02c5a816`

## 🔧 Modificaciones Implementadas

### 1. Corrección del Protocolo HANDSHAKE_REQ
- **Estructura de paquetes:** Ahora incluye `senderRevelnestId` y `signature` en nivel superior
- **Firma digital:** Usa `sign_data()` igual que otros mensajes del bot
- **Proof of Work:** Implementa `generate_light_proof()` compatible con RevelNest

### 2. Normalización de Direcciones
- **Separadores múltiples:** Acepta `ID@IP` o `ID:IP`
- **Prefijo automático:** Agrega `200:` a direcciones Yggdrasil de 7 segmentos
- **Validación:** Verifica formato correcto de dirección Yggdrasil

### 3. Comportamiento Automático
- **Solicitud periódica:** Envía `HANDSHAKE_REQ` cada 30 segundos
- **Respuesta a handshake:** Maneja automáticamente `HANDSHAKE_ACCEPT`
- **Primer mensaje:** Envía saludo automático tras conexión exitosa
- **Respuesta a mensajes:** Responde a todos los mensajes CHAT recibidos
- **ACKs:** Envía confirmación por cada mensaje recibido

## 📋 Flujo de Conexión Esperado

1. **Bot → Usuario:** `HANDSHAKE_REQ` con PoW proof, firma, y clave pública
2. **Usuario:** Acepta solicitud manualmente en UI de RevelNest
3. **Usuario → Bot:** `HANDSHAKE_ACCEPT` con clave pública del usuario
4. **Bot:** Agrega usuario a contactos, envía mensaje automático
5. **Usuario → Bot:** Mensaje CHAT cualquiera
6. **Bot → Usuario:** Respuesta automática "Bot: Recibido. Tu ID es X"

## 🚀 Comandos para Gestión

### Iniciar/Reiniciar Bot
```bash
cd /home/rubendev/Proyectos/chat-p2p
./connect_to_user.sh
```

### Ver Logs en Tiempo Real
```bash
docker logs -f revelnest-bot-user
```

### Detener Bot
```bash
docker rm -f revelnest-bot-user
```

### Ver Métricas
```bash
ls -la /tmp/revelnest_shared/
```

## 🐛 Solución de Problemas

### Error: "HANDSHAKE_REQ missing required fields"
**Causas posibles:**
1. Faltan campos `senderRevelnestId` o `signature` en nivel superior
2. Proof of Work inválido o ausente
3. Estructura de paquete incorrecta

**Solución implementada:** Todas las correcciones ya aplicadas.

### Error: No se recibe respuesta
**Verificar:**
1. Usuario aceptó solicitud en UI RevelNest
2. Firewall permite tráfico UDP puerto 50005
3. Ambos nodos conectados a red Yggdrasil (ver logs)
4. Dirección IP correcta (con prefijo `200:`)

### Reiniciar con Logs Detallados
```bash
docker rm -f revelnest-bot-user
docker run --name revelnest-bot-user --cap-add=NET_ADMIN --device=/dev/net/tun -v /tmp/revelnest_shared:/shared -e NODE_ENV_NAME="user_bot" -e TARGET_IDENTITY="a169346e249181b306156c7caa265d6d:7704:49e5:b4cd:7910:2191:2574:351b" revelnest-bot
```

## 📊 Estado Actual del Roadmap

### ✅ Fase 16 - COMPLETADA
- Transferencia de archivos totalmente implementada
- 4 componentes UI + hook useFileTransfer
- Testing exhaustivo (11 tests unitarios pasados)
- Documentación completa generada

### 🎯 Fase 17 - Planificada
- Compresión de imágenes
- Mensajes de voz
- Cifrado E2EE para archivos
- Mejoras de rendimiento

### 🔮 Fases Futuras
- Sistema de reputación completo
- Optimizaciones avanzadas
- Renewal tokens avanzados

## 🔍 Próximos Pasos Recomendados

1. **Aceptar solicitud** en tu UI de RevelNest
2. **Enviar mensaje** al bot para probar respuesta automática
3. **Probar transferencia de archivos** usando los nuevos componentes UI
4. **Verificar logs** del bot para confirmar comunicación bidireccional

## 📞 Soporte
Si persisten problemas, proporciona:
- Logs completos de RevelNest (últimos 2 minutos)
- Captura de pantalla de la solicitud de contacto
- Output de `docker logs revelnest-bot-user --tail 50`

---
*Última actualización: 5 Marzo 2026 - Bot configurado y en ejecución*