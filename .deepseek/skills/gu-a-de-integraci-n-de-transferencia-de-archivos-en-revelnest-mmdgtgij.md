---
title: Guía de integración de transferencia de archivos en upeer
source: Implementación de componentes de transferencia de archivos para upeer
tags:
  - file-transfer
  - ui-components
  - integration-guide
  - upeer
  - phase-16
createdAt: 2026-03-05T12:52:10.075Z
updatedAt: 2026-03-05T12:52:10.075Z
---

# Guía de integración de transferencia de archivos en upeer

**Source:** Implementación de componentes de transferencia de archivos para upeer

---

# Guía de integración de transferencia de archivos en upeer

## Componentes implementados

### 1. Hook `useFileTransfer`

**Ubicación**: `src/hooks/useFileTransfer.ts`

**Funcionalidad**:

- Gestión del estado de transferencias de archivos
- Comunicación con el backend a través de la API `window.upeer`
- Event listeners para progreso, finalización, cancelación
- Utilidades para formateo de tamaños y progreso

**Uso básico**:

```tsx
const {
  transfers,
  activeTransfers,
  startTransfer,
  cancelTransfer,
  saveFile,
  openFilePicker,
  closeFilePicker,
} = useFileTransfer();
```

### 2. Modal `FilePickerModal`

**Ubicación**: `src/components/modals/FilePickerModal.tsx`

**Características**:

- Selector de archivos con drag & drop
- Vista previa de imágenes
- Generación automática de thumbnails
- Validación de tamaño y tipo de archivo
- Diseño coherente con Joy UI

**Props**:

- `open`: boolean
- `onClose`: () => void
- `onSubmit`: (file: File, thumbnail?: string) => void
- `maxSizeMB`: number (default: 100MB)
- `allowedTypes`: string[] (lista de MIME types)

### 3. Componente `TransferProgressBar`

**Ubicación**: `src/components/chat/TransferProgressBar.tsx`

**Variantes**:

- **Compacta**: Para listas de transferencias activas
- **Completa**: Para modales de progreso detallado

**Muestra**:

- Progreso en porcentaje y bytes
- Estado de la transferencia (enviando/recibiendo)
- Botón de cancelación
- Iconos de estado (éxito, error, pendiente)

### 4. Botón `AttachmentButton`

**Ubicación**: `src/components/chat/AttachmentButton.tsx`

**Características**:

- Menú desplegable con tipos de archivo
- Iconos descriptivos para cada tipo
- Tooltips con información
- Integrado en `InputArea.tsx`

**Tipos soportados**:

- `any`: Cualquier archivo
- `image`: Imágenes (JPG, PNG, GIF, WebP)
- `video`: Videos (MP4, MOV, AVI)
- `audio`: Audio (MP3, WAV, OGG)
- `document`: Documentos (PDF, Word, Excel, PowerPoint)
- `file`: Otros archivos

### 5. Componente `FileMessageItem`

**Ubicación**: `src/components/chat/FileMessageItem.tsx`

**Características**:

- Vista de archivos en el chat
- Thumbnail para imágenes
- Información de tamaño y tipo
- Botones de acción (descargar, abrir)
- Estados de transferencia (pendiente, activa, completada, fallida)

**Integración con `MessageItem`**:

- Detecta mensajes con prefijo `FILE_TRANSFER|`
- Parseo automático de metadatos
- Renderizado condicional

## Formato de mensajes de archivo

Los mensajes de archivo se almacenan en la base de datos con el formato:

```
FILE_TRANSFER|{fileId}|{fileName}|{fileSize}|{mimeType}|{fileHash}|{thumbnail?}
```

**Ejemplo**:

```
FILE_TRANSFER|abc123|foto.jpg|1048576|image/jpeg|sha256...|base64...
```

**Parseo en `MessageItem.tsx`**:

```tsx
const isFileTransfer = msg.message.startsWith("FILE_TRANSFER|");
if (isFileTransfer) {
  const parts = msg.message.split("|");
  const fileData = {
    fileId: parts[1],
    fileName: parts[2],
    fileSize: parseInt(parts[3], 10),
    mimeType: parts[4],
    fileHash: parts[5],
    thumbnail: parts[6], // Optional
    transferState: "completed",
    direction: isMe ? "sending" : "receiving",
  };
}
```

## Integración en la aplicación principal

### Paso 1: Añadir estado de transferencias al contexto del chat

```tsx
// En App.tsx o tu componente principal
import { useFileTransfer } from "./hooks/useFileTransfer";

function App() {
  const fileTransfer = useFileTransfer();
  const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);

  const handleAttachFile = (type: AttachmentType) => {
    setIsFilePickerOpen(true);
  };

  const handleFileSubmit = async (file: File, thumbnail?: string) => {
    if (!selectedContact) return;

    const result = await fileTransfer.startTransfer({
      revelnestId: selectedContact.revelnestId,
      filePath: file.path, // Nota: en Electron necesitas la ruta completa
      thumbnail,
    });

    if (result.success) {
      // Crear mensaje de archivo en el chat
      const fileMessage = `FILE_TRANSFER|${result.fileId}|${file.name}|${file.size}|${file.type}|${thumbnail}`;
      // Enviar mensaje a través del sistema de chat existente
    }
  };
}
```

### Paso 2: Integrar el modal de selección de archivos

```tsx
<FilePickerModal
  open={isFilePickerOpen}
  onClose={() => setIsFilePickerOpen(false)}
  onSubmit={handleFileSubmit}
/>
```

### Paso 3: Mostrar transferencias activas

```tsx
{
  fileTransfer.activeTransfers.map((transfer) => (
    <TransferProgressBar
      key={transfer.fileId}
      transfer={transfer}
      onCancel={fileTransfer.cancelTransfer}
    />
  ));
}
```

### Paso 4: Actualizar `InputArea`

`InputArea` ya está actualizado con `AttachmentButton`. Solo necesita recibir la prop `onAttachFile`:

```tsx
<InputArea
  // ... otras props
  onAttachFile={handleAttachFile}
/>
```

## Backend necesario

### Handlers UDP ya implementados

Los handlers para mensajes de archivo están en `src/main_process/network/handlers.ts`:

- `handleFileStart`
- `handleFileChunk`
- `handleFileEnd`
- `handleFileAck`
- `handleFileCancel`

### TransferManager

El `TransferManager` (`src/main_process/network/file-transfer/transfer-manager.ts`) contiene:

- `handleFileStart()`: Valida y prepara recepción
- `handleFileChunk()`: Escribe fragmentos recibidos
- `handleFileEnd()`: Verifica integridad y finaliza
- `handleFileAck()`: Confirma recepción de fragmentos
- `handleFileCancel()`: Cancela transferencia

## Pruebas recomendadas

1. **Prueba de componentes UI**:
   - Abrir modal de selección de archivos
   - Verificar validación de tamaño y tipo
   - Probar vista previa de imágenes

2. **Prueba de integración**:
   - Enviar archivo pequeño (<1MB)
   - Verificar progreso en `TransferProgressBar`
   - Confirmar aparición en el chat como `FileMessageItem`

3. **Prueba de estados**:
   - Cancelar transferencia en progreso
   - Simular error de transferencia
   - Verificar mensajes de estado

## Consideraciones de rendimiento

1. **Thumbnails**:
   - Generar solo para imágenes
   - Limitar tamaño (máx 200x200)
   - Usar compresión JPEG (calidad 0.7)

2. **Memoria**:
   - Limpiar URLs de objeto al desmontar
   - Limitar transferencias simultáneas (sugerido: 3)

3. **Red**:
   - Tamaño de fragmento: 64KB (configurable)
   - Timeout: 5 minutos por transferencia
   - Reintentos: 3 por fragmento

## Mejoras futuras

1. **Compresión**:
   - Comprimir imágenes antes de enviar
   - Comprimir documentos (ZIP on-the-fly)

2. **Cifrado**:
   - Añadir cifrado opcional con clave simétrica
   - Integrar con el sistema de claves efímeras existente

3. **Streaming**:
   - Reproducción de audio/video durante transferencia
   - Vista previa progresiva de imágenes

4. **Integración con DHT**:
   - Almacenar metadatos de archivos en DHT
   - Descubrimiento de archivos compartidos

## Estado actual de implementación

✅ **Componentes UI**: Completos y estilizados
✅ **Hook de estado**: Implementado
✅ **Integración en InputArea**: Completada
✅ **Integración en MessageItem**: Completada
✅ **Tipos TypeScript**: Actualizados
✅ **Backend handlers**: Implementados (parcialmente probados)
❌ **Integración en App.tsx**: Pendiente
❌ **Pruebas end-to-end**: Pendientes
❌ **Manejo de errores robusto**: Pendiente

## Archivos modificados

1. `src/hooks/useFileTransfer.ts` - Nuevo
2. `src/components/modals/FilePickerModal.tsx` - Nuevo
3. `src/components/chat/TransferProgressBar.tsx` - Nuevo
4. `src/components/chat/AttachmentButton.tsx` - Nuevo
5. `src/components/chat/FileMessageItem.tsx` - Nuevo
6. `src/components/chat/InputArea.tsx` - Modificado
7. `src/components/chat/MessageItem.tsx` - Modificado
8. `src/types.d.ts` - Actualizado con API de transferencia

## Siguientes pasos críticos

1. **Integrar en App.tsx**: Conectar el estado de transferencias con la UI principal
2. **Probar backend**: Verificar que los handlers UDP funcionen correctamente
3. **Manejar rutas de archivo**: En Electron, obtener rutas completas con `dialog.showOpenDialog`
4. **Persistencia**: Guardar archivos transferidos en ubicaciones seguras
5. **Notificaciones**: Añadir notificaciones del sistema para transferencias completadas
