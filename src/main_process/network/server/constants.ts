export const YGG_PORT = 50005;
export const SOCKS5_HOST = '127.0.0.1';
export const SOCKS5_PORT = 9050;

export const BACKOFF_STEPS_MS = [
    30_000,      // 30 s  (1º fallo)
    2 * 60_000,  // 2 min
    10 * 60_000, // 10 min
    30 * 60_000, // 30 min (tope)
];

export const MAX_QUEUE_SIZE = 60;

export const EPH_FRESHNESS_MS = 2 * 60 * 60 * 1000; // 2 horas

export const MAX_FRAME_BYTES = 10 * 1024 * 1024; // 10MB