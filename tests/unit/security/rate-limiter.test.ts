import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RateLimiter } from '../../../src/main_process/security/rate-limiter.js';

describe('RateLimiter - Unit Tests', () => {
    let rateLimiter: RateLimiter;

    beforeEach(() => {
        vi.clearAllMocks();
        // Usamos reglas simples para testing
        rateLimiter = new RateLimiter({
            'TEST_TYPE': { windowMs: 1000, maxTokens: 5, refillRate: 5 }, // 5 tokens por segundo
            'BURST_TYPE': { windowMs: 1000, maxTokens: 2, refillRate: 0.1 } // Recarga muy lenta
        });
    });

    it('should allow messages within limits', () => {
        for (let i = 0; i < 5; i++) {
            expect(rateLimiter.check('1.2.3.4', 'TEST_TYPE')).toBe(true);
        }
    });

    it('should block messages exceeding maxTokens', () => {
        for (let i = 0; i < 5; i++) {
            rateLimiter.check('1.2.3.4', 'TEST_TYPE');
        }
        // El sexto debería fallar
        expect(rateLimiter.check('1.2.3.4', 'TEST_TYPE')).toBe(false);
    });

    it('should refill tokens over time', async () => {
        // Consumir todos los tokens
        for (let i = 0; i < 2; i++) {
            rateLimiter.check('1.1.1.1', 'BURST_TYPE');
        }
        expect(rateLimiter.check('1.1.1.1', 'BURST_TYPE')).toBe(false);

        // Avanzar el tiempo manualmente (Vitest fake timers)
        vi.useFakeTimers();
        
        // Esperar 10 segundos para que recargue al menos 1 token (refillRate 0.1/s)
        vi.advanceTimersByTime(10001);
        
        expect(rateLimiter.check('1.1.1.1', 'BURST_TYPE')).toBe(true);
        vi.useRealTimers();
    });

    it('should separate limits by IP', () => {
        // Agotar IP 1
        for (let i = 0; i < 5; i++) {
            rateLimiter.check('1.1.1.1', 'TEST_TYPE');
        }
        expect(rateLimiter.check('1.1.1.1', 'TEST_TYPE')).toBe(false);
        
        // IP 2 debería estar limpia
        expect(rateLimiter.check('2.2.2.2', 'TEST_TYPE')).toBe(true);
    });

    it('should separate limits by message type', () => {
        // Agotar tipo A
        for (let i = 0; i < 5; i++) {
            rateLimiter.check('1.1.1.1', 'TEST_TYPE');
        }
        expect(rateLimiter.check('1.1.1.1', 'TEST_TYPE')).toBe(false);
        
        // Tipo B en la misma IP debería estar disponible
        expect(rateLimiter.check('1.1.1.1', 'BURST_TYPE')).toBe(true);
    });

    it('should allow unknown message types (default behavior)', () => {
        expect(rateLimiter.check('1.1.1.1', 'UNKNOWN_TYPE')).toBe(true);
        // Debería seguir permitiendo después de muchos intentos si no hay regla
        for (let i = 0; i < 100; i++) {
            expect(rateLimiter.check('1.1.1.1', 'UNKNOWN_TYPE')).toBe(true);
        }
    });

    it('should cleanup inactive buckets', () => {
        rateLimiter.check('10.0.0.1', 'TEST_TYPE');
        expect(rateLimiter.getTokenCount('10.0.0.1', 'TEST_TYPE')).toBeLessThan(5);

        vi.useFakeTimers();
        // Avanzar 2 horas (default cleanup es 1 hora)
        vi.advanceTimersByTime(2 * 3600 * 1000);
        
        rateLimiter.cleanup();
        
        // Al consultar de nuevo, el bucket ya no debería existir (getTokenCount devolverá 0 si no existe)
        expect(rateLimiter.getTokenCount('10.0.0.1', 'TEST_TYPE')).toBe(0); 
        vi.useRealTimers();
    });
});
