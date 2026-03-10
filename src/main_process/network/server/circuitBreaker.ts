import { ipFailMap, IPFailState } from './state.js';
import { BACKOFF_STEPS_MS } from './constants.js';
import { error } from '../../security/secure-logger.js';

export function isIPBlocked(ip: string): boolean {
    const s = ipFailMap.get(ip);
    if (!s) return false;
    return Date.now() < s.blockedUntil;
}

export function recordIPFailure(ip: string): void {
    const s = ipFailMap.get(ip) ?? { failures: 0, blockedUntil: 0 };
    s.failures++;
    const backoffMs = BACKOFF_STEPS_MS[Math.min(s.failures - 1, BACKOFF_STEPS_MS.length - 1)];
    s.blockedUntil = Date.now() + backoffMs;
    ipFailMap.set(ip, s);
    // Solo logear en el primer fallo de cada ventana para no saturar los logs
    if (s.failures === 1) {
        error(`TCP send error to ${ip} (contacto inalcanzable, backoff ${backoffMs / 1000}s)`, undefined, 'network');
    }
}

export function recordIPSuccess(ip: string): void {
    ipFailMap.delete(ip);
}

/** True si el IP está fallando pero ya conociómos el problema (silenciar heartbeat) */
export function isIPUnreachable(ip: string): boolean {
    return ipFailMap.has(ip) && isIPBlocked(ip);
}