export const YGG_PORT = 50005;
export const SOCKS5_HOST = '127.0.0.1';
export const SOCKS5_PORT = 9050;

export const BACKOFF_STEPS_MS = [
    3_000,       // 3 s  (1º fallo — recuperación rápida)
    2 * 60_000,  // 2 min
    10 * 60_000, // 10 min
    30 * 60_000, // 30 min (tope)
];

export const MAX_QUEUE_SIZE = 60;

export const EPH_FRESHNESS_MS = 2 * 60 * 60 * 1000; // 2 horas

export const MAX_FRAME_BYTES = 10 * 1024 * 1024; // 10MB

export const MAX_MESSAGE_SIZE_BYTES = 1_000_000; // ~1MB

export const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minuto
// Límites por UPeerID por ventana
export const RATE_LIMIT_MESSAGES_PER_WINDOW = 60; // 60 mensajes por minuto
export const RATE_LIMIT_CONTACT_REQUESTS_PER_WINDOW = 5; // 5 solicitudes por minuto
export const RATE_LIMIT_VOUCHES_PER_WINDOW = 10; // 10 vouches por minuto