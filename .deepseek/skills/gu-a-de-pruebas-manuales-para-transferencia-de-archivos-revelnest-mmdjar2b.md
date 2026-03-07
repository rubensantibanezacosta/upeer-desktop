---
title: Guía de pruebas manuales para transferencia de archivos RevelNest
source: Implementación Fase 16 - Transferencia de archivos
tags:
  - testing
  - manual-tests
  - file-transfer
  - revelnest
  - phase-16
createdAt: 2026-03-05T14:01:36.131Z
updatedAt: 2026-03-05T14:01:36.131Z
---

# Guía de pruebas manuales para transferencia de archivos RevelNest

**Source:** Implementación Fase 16 - Transferencia de archivos

---

# Guía de pruebas manuales para transferencia de archivos RevelNest (Fase 16)

## Pruebas de componentes UI

### 1. AttachmentButton
**Pasos:**
1. Abrir RevelNest
2. Seleccionar un contacto conectado
3. Hacer click en el botón "+" en el área de entrada de mensajes
4. Verificar que aparece un menú desplegable con opciones:
   - Cualquier archivo
   - Imagen
   - Video
   - Audio
   - Documento
   - Otro archivo
5. Seleccionar cualquier opción debería abrir el FilePickerModal

**Resultado esperado:** Menú funcional con iconos y descripciones.

### 2. FilePickerModal
**Pasos:**
1. Desde AttachmentButton, seleccionar cualquier tipo
2. Verificar que aparece el modal "Enviar Archivo"
3. Hacer click en el área de selección
4. Verificar que se abre el diálogo nativo del sistema
5. Seleccionar un archivo pequeño (<1MB)
6. Verificar que el modal muestra:
   - Nombre del archivo
   - Tamaño formateado
   - Tipo de archivo
   - Vista previa (si es imagen)
   - Botones "Enviar Archivo" y "Cambiar"

**Resultado esperado:** Modal funcional con validación de tamaño y tipo.

### 3. TransferProgressBar
**Condición:** Transferencia activa en progreso
**Verificar que muestra:**
- Nombre del archivo
- Progreso en porcentaje
- Bytes transferidos / total
- Botón de cancelación (X)
- Estado (Enviando.../Recibiendo...)

### 4. FileMessageItem
**Condiciones:**
- Mensaje de archivo en el historial de chat
- Verificar que muestra:
  - Icono según tipo de archivo
  - Nombre del archivo
  - Tamaño formateado
  - Estado (Completado, Falló, Cancelado)
  - Botones de acción (Descargar, Abrir)

## Pruebas de integración

### 5. Flujo completo de envío
**Pasos:**
1. Seleccionar contacto conectado
2. Adjuntar archivo pequeño (<1MB)
3. Confirmar envío
4. Verificar en el chat:
   - Aparece mensaje de archivo inmediatamente
   - Aparece TransferProgressBar en la parte superior
   - La barra muestra progreso
   - Al completarse, el mensaje de archivo muestra "Completado"
   - El contacto receptor recibe el archivo

### 6. Flujo de recepción
**Pasos:**
1. Contacto envía archivo
2. Verificar que aparece:
   - Notificación de transferencia entrante
   - TransferProgressBar mostrando progreso
   - Mensaje de archivo en el chat al completarse

### 7. Cancelación
**Pasos:**
1. Iniciar transferencia de archivo grande (>10MB)
2. Hacer click en el botón de cancelación (X) en TransferProgressBar
3. Verificar que:
   - La transferencia se detiene
   - El mensaje de archivo muestra estado "Cancelado"
   - No se consume más ancho de banda

## Pruebas de validación

### 8. Límites de tamaño
**Probar:**
- Archivo de 99MB: Debe aceptar
- Archivo de 101MB: Debe rechazar con error
- Archivo de 0 bytes: Debe aceptar

### 9. Tipos de archivo
**Probar:**
- Imágenes (.jpg, .png, .gif)
- Documentos (.pdf, .docx)
- Audio (.mp3, .wav)
- Video (.mp4, .mov)
- Archivos comprimidos (.zip)

## Errores conocidos y workarounds

### 1. Thumbnails de imágenes
**Problema:** La vista previa puede no funcionar para ciertas rutas de archivo en Electron.
**Workaround:** La funcionalidad principal de transferencia funciona sin thumbnails.

### 2. Eventos de progreso
**Problema:** La actualización en tiempo real puede tener latencia.
**Workaround:** La barra de progreso se actualiza cada vez que llega un ACK de fragmento.

### 3. Base de datos
**Problema:** Error "no such column: renewal_token" al iniciar.
**Workaround:** Eliminar la base de datos local (~/.config/revelnest-chat) para regenerar esquema.

## Métricas de éxito

### Componentes UI
- [ ] AttachmentButton muestra menú
- [ ] FilePickerModal abre diálogo nativo
- [ ] TransferProgressBar muestra progreso
- [ ] FileMessageItem renderiza correctamente

### Integración
- [ ] Archivo pequeño se envía y recibe
- [ ] Progreso se muestra en tiempo real
- [ ] Cancelación funciona
- [ ] Estados se actualizan correctamente

### Validación
- [ ] Límites de tamaño se respetan
- [ ] Tipos de archivo se validan
- [ ] Errores se manejan adecuadamente

## Notas de implementación

### Backend listo
- TransferManager con todos los métodos
- Handlers UDP para mensajes de archivo
- Sistema de fragmentación (64KB chunks)
- Validación de integridad (SHA-256)
- Timeouts y reintentos configurados

### Frontend implementado
- Hook useFileTransfer para gestión de estado
- Componentes con diseño Joy UI coherente
- Integración completa con App.tsx
- Event listeners para actualización en tiempo real

### Pendientes de mejora
1. Generación robusta de thumbnails
2. Compresión de imágenes antes de enviar
3. Límite de transferencias simultáneas
4. Mejores indicadores de velocidad/tiempo restante

## Siguientes pasos para Fase 17
1. Pruebas de carga con archivos grandes
2. Integración con sistema de cifrado existente
3. Soporte para carpetas comprimidas
4. Historial de archivos compartidos
