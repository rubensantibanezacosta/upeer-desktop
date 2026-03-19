import React from 'react';
import {
    Modal,
    ModalDialog,
    DialogTitle,
    DialogContent,
    ModalClose,
    Box,
    Typography,
    Divider,
    Stack,
    Alert,
} from '@mui/joy';
import SecurityIcon from '@mui/icons-material/Security';

interface InfoModalProps {
    open: boolean;
    onClose: () => void;
    title: string;
    icon?: React.ReactNode;
    children: React.ReactNode;
}

export const InfoModal: React.FC<InfoModalProps> = ({ open, onClose, title, icon, children }) => (
    <Modal open={open} onClose={onClose}>
        <ModalDialog sx={{ maxWidth: 480, width: '90vw', p: 0, overflow: 'hidden' }}>
            <Box sx={{
                display: 'flex', alignItems: 'center', gap: 1.5,
                px: 2.5, py: 2,
                borderBottom: '1px solid', borderColor: 'divider',
            }}>
                {icon && <Box sx={{ opacity: 0.6, display: 'flex' }}>{icon}</Box>}
                <DialogTitle sx={{ p: 0, flexGrow: 1 }}>{title}</DialogTitle>
                <ModalClose sx={{ position: 'static', mt: 0 }} />
            </Box>
            <DialogContent sx={{ px: 2.5, py: 2.5 }}>
                {children}
            </DialogContent>
        </ModalDialog>
    </Modal>
);

// ─── Contenido del modal de Reputación ───────────────────────────────────────

export const ReputacionModalContent: React.FC = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography level="body-sm" color="neutral">
            La reputación es una puntuación que refleja cuán de fiar eres para el resto de personas
            que usan la app. Cuanto más alta, mejor te tratan los demás: tus mensajes llegan antes
            y con más fiabilidad.
        </Typography>

        <Divider />

        {[
            {
                label: 'Confianza',
                desc: 'Empieza en 50 para todo el mundo. Sube cuando mandas y recibes mensajes con normalidad, y cuando ayudas a guardar mensajes de otros mientras están desconectados. Baja si haces cosas raras como mandar spam.',
            },
            {
                label: 'Actividad',
                desc: 'Mide si has estado usando la app recientemente. Si llevas tiempo sin conectarte, este número baja. Vuelve a subir en cuanto retomes la actividad normal.',
            },
            {
                label: 'Contactos',
                desc: 'Cuántos de tus contactos están conectados ahora mismo. Tener más contactos activos le da más peso a tu puntuación general.',
            },
            {
                label: 'Puntuación total',
                desc: 'Un resumen de todo lo anterior junto. Es el número que ve la app para decidir con qué prioridad procesa tus mensajes.',
            },
        ].map(({ label, desc }) => (
            <Box key={label}>
                <Typography level="body-sm" sx={{ fontWeight: 600, mb: 0.4 }}>{label}</Typography>
                <Typography level="body-sm" color="neutral">{desc}</Typography>
            </Box>
        ))}

        <Divider />

        <Typography level="body-xs" color="neutral" sx={{ opacity: 0.7 }}>
            Esta puntuación se calcula en tu propio dispositivo y no sale de él. Nadie la almacena ni la vende.
        </Typography>
    </Box>
);

// ─── Contenido del modal de Almacenamiento cedido ────────────────────────────

export const AlmacenamientoModalContent: React.FC = () => (
    <Stack spacing={2}>
        <Typography level="body-sm" color="neutral">
            Esta aplicación funciona sin servidores centrales. Para que tus contactos reciban mensajes mientras están desconectados, los nodos de la red P2P (como el tuyo) "ceden" un pequeño espacio para guardar temporalmente esos datos cifrados.
        </Typography>

        <Alert variant="soft" color="primary" startDecorator={<SecurityIcon />}>
            <Typography level="body-xs">
                Todo el contenido está cifrado de extremo a extremo (E2EE) con llaves que solo el destinatario posee. <b>Tú no puedes leer lo que almacenas</b>, ni nadie puede leer tus mensajes guardados en otros nodos.
            </Typography>
        </Alert>

        <Typography level="title-sm" sx={{ mt: 1 }}>Cuotas Dinámicas</Typography>
        <Typography level="body-xs">
            El sistema no usa un límite global fijo, sino <b>cuotas basadas en la confianza (Vouch Score)</b> para proteger tu equipo:
        </Typography>

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mt: 0.5 }}>
            <Box sx={{ p: 1, borderRadius: 'sm', bgcolor: 'background.level1', border: '1px solid', borderColor: 'divider' }}>
                <Typography level="body-xs" sx={{ fontWeight: 700, opacity: 0.6 }}>Invitados</Typography>
                <Typography level="body-sm" sx={{ fontWeight: 800 }}>50 MB</Typography>
            </Box>
            <Box sx={{ p: 1, borderRadius: 'sm', bgcolor: 'background.level1', border: '1px solid', borderColor: 'divider' }}>
                <Typography level="body-xs" sx={{ fontWeight: 700, opacity: 0.6 }}>Confiables</Typography>
                <Typography level="body-sm" sx={{ fontWeight: 800 }}>500 MB</Typography>
            </Box>
            <Box sx={{ gridColumn: 'span 2', p: 1, borderRadius: 'sm', bgcolor: 'background.level2', border: '1px solid', borderColor: 'primary.outlinedBorder' }}>
                <Typography level="body-xs" sx={{ fontWeight: 700, color: 'primary.main' }}>Amigos Íntimos (Score 80+)</Typography>
                <Typography level="body-sm" sx={{ fontWeight: 800, color: 'primary.main' }}>Hasta 2.5 GB por persona</Typography>
            </Box>
        </Box>

        <Divider />

        <Typography level="body-xs" color="neutral" sx={{ fontStyle: 'italic', opacity: 0.8 }}>
            Tu nodo prioriza siempre el almacenamiento de tus contactos directos. Los datos expiran automáticamente si no son reclamados en 60 días.
        </Typography>
    </Stack>
);

// ─── Contenido del modal de Direccion de contacto ────────────────────────────

export const DireccionContactoModalContent: React.FC = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography level="body-sm" color="neutral">
            Tu dirección de contacto es lo que tienes que compartir con alguien para que pueda escribirte.
            Es como tu número de teléfono, pero para esta app.
        </Typography>
        <Divider />
        {[
            {
                label: '¿Cómo se comparte?',
                desc: 'Puedes copiarla y pegarla donde quieras, o mostrar el código QR para que alguien la escanee directamente con su móvil.',
            },
            {
                label: '¿Es segura?',
                desc: 'Si, puedes compartirla libremente. Solo sirve para que te encuentren en la app, no da acceso a tus mensajes ni a tu cuenta.',
            },
        ].map(({ label, desc }) => (
            <Box key={label}>
                <Typography level="body-sm" sx={{ fontWeight: 600, mb: 0.4 }}>{label}</Typography>
                <Typography level="body-sm" color="neutral">{desc}</Typography>
            </Box>
        ))}
    </Box>
);

// ─── Contenido del modal de ID de contacto ───────────────────────────────────

export const IdContactoModalContent: React.FC = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography level="body-sm" color="neutral">
            Tu ID es el nombre único que te identifica dentro de la app.
            Forma parte de tu dirección de contacto.
        </Typography>
        <Divider />
        {[
            {
                label: '¿Lo puedo cambiar?',
                desc: 'No. El ID se genera una sola vez cuando creas tu cuenta y no se puede modificar. Es lo que garantiza que eres siempre tú, sin importar desde qué dispositivo te conectes.',
            },
            {
                label: '¿Alguien puede verlo?',
                desc: 'Solo quien ya tiene tu dirección de contacto completa. No es público ni aparece en ningún listado.',
            },
        ].map(({ label, desc }) => (
            <Box key={label}>
                <Typography level="body-sm" sx={{ fontWeight: 600, mb: 0.4 }}>{label}</Typography>
                <Typography level="body-sm" color="neutral">{desc}</Typography>
            </Box>
        ))}
    </Box>
);

// ─── Contenido del modal de Clave de verificacion ────────────────────────────

export const ClaveVerificacionModalContent: React.FC = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography level="body-sm" color="neutral">
            Es un código largo que la app usa para demostrar que eres quien dices ser.
            Nunca tienes que escribirla ni recordarla, la app la gestiona sola.
        </Typography>
        <Divider />
        {[
            {
                label: '¿Para qué sirve?',
                desc: 'Cuando alguien te manda un mensaje, la app comprueba automáticamente esta clave para asegurarse de que el mensaje llega al destinatario correcto y no ha sido manipulado por nadie.',
            },
            {
                label: '¿Puedo compartirla?',
                desc: 'Es pública por diseño: puede verla cualquier contacto tuyo si quiere verificar que realmente está hablando contigo. No permite acceder a tu cuenta.',
            },
        ].map(({ label, desc }) => (
            <Box key={label}>
                <Typography level="body-sm" sx={{ fontWeight: 600, mb: 0.4 }}>{label}</Typography>
                <Typography level="body-sm" color="neutral">{desc}</Typography>
            </Box>
        ))}
    </Box>
);

// ─── Contenido del modal de Direccion de red ─────────────────────────────────

export const DireccionRedModalContent: React.FC = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography level="body-sm" color="neutral">
            Es la dirección de tu dispositivo dentro de la red que usa la app para
            conectarse directamente contigo sin pasar por ningún servidor.
        </Typography>
        <Divider />
        {[
            {
                label: '¿Cambia con el tiempo?',
                desc: 'Sí. Cada vez que te conectas desde una red diferente (casa, trabajo, móvil de datos) puede ser distinta. La app lo gestiona automáticamente.',
            },
            {
                label: '¿Tengo que hacer algo?',
                desc: 'No. Solo es informativa. Puedes compartirla si alguien te la pide para conectarse manualmente, pero en condiciones normales la app lo hace sola.',
            },
        ].map(({ label, desc }) => (
            <Box key={label}>
                <Typography level="body-sm" sx={{ fontWeight: 600, mb: 0.4 }}>{label}</Typography>
                <Typography level="body-sm" color="neutral">{desc}</Typography>
            </Box>
        ))}
    </Box>
);
