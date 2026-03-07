---
title: Patrones de diseño Joy UI para RevelNest
source: Análisis de código de AddContactModal.tsx, IdentityModal.tsx, ShareContactModal.tsx
tags:
  - joy-ui
  - design-patterns
  - react
  - modal
  - components
createdAt: 2026-03-05T12:31:54.371Z
updatedAt: 2026-03-05T12:31:54.371Z
---

# Patrones de diseño Joy UI para RevelNest

**Source:** Análisis de código de AddContactModal.tsx, IdentityModal.tsx, ShareContactModal.tsx

---

# Patrones de diseño Joy UI para RevelNest

## Estructura de componentes

### 1. Patrón Modal
```tsx
import React, { useState } from 'react';
import {
    Modal,
    ModalDialog,
    DialogTitle,
    DialogContent,
    Stack,
    FormControl,
    FormLabel,
    Input,
    Button,
    Typography,
    Alert,
    Box,
    IconButton,
    Divider
} from '@mui/joy';

interface ComponentProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (data: any) => void;
}

export const Component: React.FC<ComponentProps> = ({ open, onClose, onSubmit }) => {
    return (
        <Modal open={open} onClose={onClose}>
            <ModalDialog sx={{ 
                width: 450, 
                maxWidth: '95vw', 
                borderRadius: 'xl', 
                boxShadow: 'lg', 
                p: 0, 
                overflow: 'hidden' 
            }}>
                <Box sx={{
                    p: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: 'background.surface'
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <IconComponent color="primary" />
                        <DialogTitle sx={{ m: 0 }}>Título del Modal</DialogTitle>
                    </Box>
                    <IconButton variant="plain" color="neutral" size="sm" onClick={onClose}>
                        <CloseIcon />
                    </IconButton>
                </Box>
                <Divider />
                <DialogContent sx={{ p: 3 }}>
                    {/* Contenido aquí */}
                </DialogContent>
            </ModalDialog>
        </Modal>
    );
};
```

### 2. Estilos comunes
- **Bordes**: `borderRadius: 'xl'` (24px)
- **Sombras**: `boxShadow: 'lg'` para elevación
- **Espaciado**: `p: 2`, `p: 3` (16px, 24px)
- **Colores**:
  - `background.surface`: fondo de superficie
  - `background.level1`: fondo de nivel 1
  - `primary.main`: color principal
  - `neutral.plain`: color neutro para botones

### 3. Botones
```tsx
// Botón principal
<Button
    type="submit"
    variant="solid"
    color="primary"
    size="lg"
    fullWidth
    sx={{ mt: 1, borderRadius: 'md', fontWeight: 600 }}
>
    Texto del botón
</Button>

// Botón secundario
<Button
    variant="outlined"
    color="neutral"
    onClick={onClose}
    sx={{ borderRadius: 'md' }}
>
    Cancelar
</Button>

// Botón de icono
<IconButton variant="plain" color="neutral" onClick={handleAction}>
    <IconComponent />
</IconButton>
```

### 4. Inputs y Formularios
```tsx
<FormControl required>
    <FormLabel sx={{ fontWeight: 600 }}>Etiqueta</FormLabel>
    <Input
        autoFocus
        placeholder="Texto de ayuda"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        sx={{
            backgroundColor: 'background.level1',
            '&:focus-within': {
                backgroundColor: 'background.surface'
            }
        }}
    />
    <Typography level="body-xs" sx={{ mt: 0.5, opacity: 0.7 }}>
        Texto de ayuda adicional
    </Typography>
</FormControl>
```

### 5. Alertas
```tsx
<Alert
    variant="soft"
    color="danger" // o "warning", "success", "info"
    startDecorator={<InfoOutlined />}
    sx={{ mb: 2.5, py: 1 }}
>
    Mensaje de alerta
</Alert>
```

### 6. Stack y Layout
```tsx
<Stack spacing={2.5}> {/* Espaciado de 20px */}
    {/* Elementos apilados */}
</Stack>

<Box sx={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 1 // Espacio entre elementos
}}>
    {/* Elementos en línea */}
</Box>
```

### 7. Tipografía
- `Typography level="h4"`: Títulos grandes
- `Typography level="body-sm"`: Texto cuerpo pequeño
- `Typography level="body-xs"`: Texto cuerpo muy pequeño
- `sx={{ fontWeight: 600 }}`: Peso de fuente semibold
- `sx={{ opacity: 0.7 }}`: Texto secundario

### 8. Iconos comunes
- `CloseIcon`: Para cerrar modales
- `InfoOutlined`: Para información
- `PersonAddIcon`: Para agregar contactos
- `SendIcon`: Para enviar
- `AddIcon`: Para agregar archivos
- `AttachFileIcon`: Para adjuntar archivos

### 9. Patrón de estado
```tsx
const [value, setValue] = useState('');
const [error, setError] = useState('');
const [loading, setLoading] = useState(false);

const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    try {
        await onSubmit(value);
        onClose();
    } catch (err) {
        setError(err.message);
    } finally {
        setLoading(false);
    }
};
```

### 10. Paleta de colores RevelNest
Basado en los componentes existentes:
- **Primary**: Azul (color primario)
- **Success**: Verde (operaciones exitosas)
- **Warning**: Naranja/ámbar (advertencias)
- **Danger**: Rojo (errores)
- **Neutral**: Gris (acciones secundarias)

### 11. Responsive design
- `maxWidth: '95vw'` para móviles
- `width: 450` para desktop
- Usar porcentajes y unidades relativas

## Convenciones específicas de RevelNest
1. **Todos los modales** tienen botón de cerrar en esquina superior derecha
2. **Formularios** usan `Stack` con `spacing={2.5}`
3. **Botones principales** son `fullWidth` con `size="lg"`
4. **Inputs** tienen fondo `background.level1` que cambia a `background.surface` en focus
5. **Iconos decorativos** a la izquierda de los títulos
6. **Divider** después del encabezado del modal
