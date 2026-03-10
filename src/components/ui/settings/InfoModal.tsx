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
} from '@mui/joy';

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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography level="body-sm" color="neutral">
            Cuando alguien te manda un mensaje y tú no estás conectado, alguien tiene que guardarlo
            hasta que vuelvas. Tu app puede hacer eso mismo por tus contactos, y ellos lo hacen por ti.
            Es la forma en que esta app funciona sin depender de ningún servidor.
        </Typography>

        <Divider />

        {[
            {
                label: '¿Cómo funciona?',
                desc: 'Si un contacto te manda algo mientras tu móvil está apagado o sin internet, otro dispositivo de confianza guarda el mensaje temporalmente. Cuando vuelves a conectarte, te llega automáticamente.',
            },
            {
                label: '¿Por qué participo yo?',
                desc: 'Tu app guarda mensajes de tus contactos cuando ellos están desconectados, igual que ellos lo hacen por ti. Es un sistema de ayuda mutua: cuanto más participas, mejor te va a ti también.',
            },
            {
                label: '¿Pueden leer mis mensajes?',
                desc: 'No. Los mensajes están bloqueados con cifrado y solo el destinatario puede abrirlos. El dispositivo que los guarda no puede leer nada, es como guardar un sobre cerrado.',
            },
            {
                label: 'Espacio y limpieza',
                desc: 'El máximo que usa la app es 1 GB. Los mensajes antiguos se borran solos cuando ya no son necesarios. También puedes liberar espacio manualmente desde la sección Almacenamiento.',
            },
        ].map(({ label, desc }) => (
            <Box key={label}>
                <Typography level="body-sm" sx={{ fontWeight: 600, mb: 0.4 }}>{label}</Typography>
                <Typography level="body-sm" color="neutral">{desc}</Typography>
            </Box>
        ))}

        <Divider />

        <Typography level="body-xs" color="neutral" sx={{ opacity: 0.7 }}>
            No se guarda ninguna información sobre quién eres ni a quién le escribes. Solo el mensaje cifrado y su fecha de expiración.
        </Typography>
    </Box>
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
