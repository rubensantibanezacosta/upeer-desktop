---
title: Componentes UI para Transferencia de Archivos en RevelNest
source: Análisis de componentes existentes y requisitos de Fase 16
tags:
  - file-transfer
  - ui-components
  - joy-ui
  - react
  - phase-16
createdAt: 2026-03-05T12:56:44.344Z
updatedAt: 2026-03-05T12:56:44.344Z
---

# Componentes UI para Transferencia de Archivos en RevelNest

**Source:** Análisis de componentes existentes y requisitos de Fase 16

---

# Componentes UI para Transferencia de Archivos en RevelNest (Fase 16)

## Componentes Requeridos

### 1. FilePickerModal
**Propósito:** Modal para seleccionar archivos del sistema de archivos local.
**Características:**
- Selección múltiple opcional
- Vista previa de archivos seleccionados
- Validación de tipos y tamaños
- Botones de acción: "Seleccionar" y "Cancelar"

**Interfaz:**
```typescript
interface FilePickerModalProps {
    open: boolean;
    onClose: () => void;
    onFilesSelected: (files: File[]) => void;
    multiple?: boolean;
    accept?: string; // MIME types
    maxSize?: number; // bytes
}
```

### 2. TransferProgressBar
**Propósito:** Mostrar progreso de transferencia activa con controles.
**Características:**
- Barra de progreso con porcentaje
- Información de archivo (nombre, tamaño, velocidad)
- Botón de cancelar
- Estado visual (activo, completado, error)

**Interfaz:**
```typescript
interface TransferProgressBarProps {
    fileId: string;
    fileName: string;
    fileSize: number;
    progress: number; // 0-100
    direction: 'sending' | 'receiving';
    speed?: number; // bytes/sec
    onCancel?: () => void;
}
```

### 3. AttachmentButton
**Propósito:** Botón en InputArea para desplegar menú de adjuntos.
**Características:**
- Menú desplegable con opciones: Archivo, Imagen, Audio, etc.
- Icono de clip (AttachFileIcon)
- Integración con FilePickerModal

**Interfaz:**
```typescript
interface AttachmentButtonProps {
    onAttachFile: () => void;
    onAttachImage?: () => void;
    onAttachAudio?: () => void;
    disabled?: boolean;
}
```

### 4. FileMessageItem
**Propósito:** Renderizar mensajes de archivo en el chat.
**Características:**
- Icono según tipo de archivo
- Nombre y tamaño del archivo
- Botón de descarga/abrir
- Estado de transferencia (completado, en progreso, error)
- Preview para imágenes

**Interfaz:**
```typescript
interface FileMessageItemProps {
    message: {
        id: string;
        fileId?: string;
        fileName: string;
        fileSize: number;
        mimeType: string;
        progress?: number;
        direction?: 'sending' | 'receiving';
        status?: 'pending' | 'active' | 'completed' | 'failed';
        thumbnail?: string; // base64 para imágenes
        filePath?: string; // ruta local para archivos recibidos
    };
    isMine: boolean;
    onDownload?: (fileId: string) => void;
    onOpen?: (filePath: string) => void;
}
```

### 5. useFileTransfer Hook
**Propósito:** Gestionar estado de transferencias y comunicación con el backend.
**Funcionalidades:**
- Iniciar transferencias
- Suscribirse a eventos de progreso
- Actualizar estado de UI
- Manejar errores y cancelaciones

**Interfaz:**
```typescript
interface UseFileTransferReturn {
    transfers: TransferProgress[];
    startTransfer: (revelnestId: string, filePath: string) => Promise<string>;
    cancelTransfer: (fileId: string) => Promise<void>;
    saveFile: (fileId: string, destinationPath: string) => Promise<void>;
    isLoading: boolean;
    error: string | null;
}
```

## Patrones de Diseño Joy UI Aplicados

### Colores y Estados
- **Primary:** Azul para transferencias activas
- **Success:** Verde para transferencias completadas
- **Warning:** Naranja para transferencias en pausa
- **Danger:** Rojo para errores/cancelaciones
- **Neutral:** Gris para estados inactivos

### Iconos por Tipo de Archivo
- **Documentos:** DescriptionIcon
- **Imágenes:** ImageIcon
- **Audio:** AudiotrackIcon
- **Video:** VideocamIcon
- **Archivos genéricos:** InsertDriveFileIcon
- **Adjuntar:** AttachFileIcon
- **Descargar:** DownloadIcon
- **Cancelar:** CancelIcon

### Layout y Espaciado
- **Modales:** width: 500, maxWidth: '95vw', borderRadius: 'xl', boxShadow: 'lg'
- **Barras de progreso:** p: 2, borderRadius: 'md', backgroundColor: 'background.level1'
- **Mensajes de archivo:** p: 2, borderRadius: 'lg', maxWidth: '300px'
- **Botones:** size="md", variant="soft" o "outlined"

### Responsive Design
- Modales se adaptan a pantallas pequeñas (maxWidth: '95vw')
- Barras de progreso apiladas en móviles
- Iconos que se adaptan al tamaño disponible

## Integración con Componentes Existentes

### InputArea
- Añadir AttachmentButton junto a AddIcon
- Manejar onAttachFile que abre FilePickerModal
- Después de selección, llamar a startTransfer via useFileTransfer

### ChatArea
- Detectar mensajes de tipo archivo (fileId presente)
- Renderizar FileMessageItem en lugar de MessageItem estándar
- Suscribirse a eventos de progreso para actualizar UI

### MessageItem
- Extender para soportar prop de archivo
- Mantener compatibilidad con mensajes de texto existentes

## Flujo de Transferencia

1. **Usuario selecciona archivo** → FilePickerModal → array de File objects
2. **Frontend prepara archivo** → Obtiene ruta, tamaño, MIME type
3. **Inicia transferencia** → window.revelnest.startFileTransfer()
4. **Backend maneja transferencia** → Envía FILE_START, FILE_CHUNK, etc.
5. **UI muestra progreso** → TransferProgressBar en lista de transferencias activas
6. **Transferencia completada** → FileMessageItem en historial de chat
7. **Usuario abre/descarga** → window.revelnest.saveTransferredFile()

## Consideraciones de Seguridad
- Validar tipos MIME permitidos
- Limitar tamaño máximo de archivo (configurable)
- Sanitizar nombres de archivo
- Verificar hashes de integridad
- Mostrar advertencias para archivos ejecutables

## Notificaciones y Feedback
- Toast para inicio de transferencia
- Notificación sonora opcional para completación
- Alertas de error con opción de reintentar
- Indicador de progreso en el botón de adjuntar
