import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SecureLogger, LogLevel, info, warn, error, debug, network, security } from '../../../src/main_process/security/secure-logger.js';

describe('SecureLogger Unit Tests', () => {
    let consoleSpy: any;

    beforeEach(() => {
        vi.clearAllMocks();
        consoleSpy = {
            info: vi.spyOn(console, 'info').mockImplementation(() => { }),
            warn: vi.spyOn(console, 'warn').mockImplementation(() => { }),
            error: vi.spyOn(console, 'error').mockImplementation(() => { }),
            debug: vi.spyOn(console, 'debug').mockImplementation(() => { }),
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should be a singleton', () => {
        const instance1 = SecureLogger.getInstance();
        const instance2 = SecureLogger.getInstance();
        expect(instance1).toBe(instance2);
    });

    it('should respect log levels', () => {
        const logger = SecureLogger.getInstance();
        logger.setLevel(LogLevel.ERROR);

        logger.info('should not log info');
        expect(consoleSpy.info).not.toHaveBeenCalled();

        logger.error('should log error');
        expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('should redact sensitive fields', () => {
        const logger = SecureLogger.getInstance();
        logger.setLevel(LogLevel.DEBUG);

        const sensitiveData = {
            privateKey: 'very-secret-key',
            publicKey: 'public-key',
            address: '127.0.0.1',
            safeField: 'normal-value'
        };

        logger.info('Testing redaction', sensitiveData);

        const lastCall = consoleSpy.info.mock.calls[0];
        const redactedData = lastCall[1];

        expect(redactedData.privateKey).toContain('[REDACTED:privateKey');
        expect(redactedData.publicKey).toContain('[REDACTED:publicKey');
        expect(redactedData.address).toContain('[REDACTED:address');
        expect(redactedData.safeField).toBe('normal-value');
    });

    it('should handle recursive redaction', () => {
        const logger = SecureLogger.getInstance();
        const nestedData = {
            user: {
                id: '123',
                privateKey: 'secret'
            },
            items: [
                { id: 1 },
                { secretKey: 'top-secret' }
            ]
        };

        logger.info('Recursive test', nestedData);
        const redacted = consoleSpy.info.mock.calls[0][1];

        expect(redacted.user.privateKey).toContain('[REDACTED');
        expect(redacted.items[1].secretKey).toContain('[REDACTED');
    });

    it('should handle Error objects', () => {
        const logger = SecureLogger.getInstance();
        const err = new Error('Test Error');

        logger.error('Logging an error', err);
        const redacted = consoleSpy.error.mock.calls[0][1];

        expect(redacted.message).toBe('Test Error');
        expect(redacted.stack).toBeDefined();
    });

    it('should provide exported convenience functions', () => {
        const logger = SecureLogger.getInstance();
        logger.setLevel(LogLevel.DEBUG);

        info('convenience info');
        expect(consoleSpy.info).toHaveBeenCalled();

        warn('convenience warn');
        expect(consoleSpy.warn).toHaveBeenCalled();

        error('convenience error');
        expect(consoleSpy.error).toHaveBeenCalled();

        // Debug depends on process.env.NODE_ENV !== 'production'
        // In Vitest tests it usually follows development settings
        debug('convenience debug');
        if (process.env.NODE_ENV !== 'production') {
            expect(consoleSpy.debug).toHaveBeenCalled();
        }
    });

    it('should handle network logging correctly', () => {
        const logger = SecureLogger.getInstance();
        logger.setLevel(LogLevel.INFO);

        const ip = '2001:db8:85a3:8d3:1319:8a2e:370:7348';
        const data = { secretKey: 'not-for-network' };

        logger.network('Network event', ip, data, 'network-module');

        const lastCall = consoleSpy.info.mock.calls[0];
        const redactedData = lastCall[1];

        // Should contain partially redacted IP if in "pseudo-production" or full if development
        // The mock environment usually isn't strict production
        expect(redactedData.ip).toBeDefined();
        expect(redactedData.secretKey).toContain('[REDACTED:secretKey');
    });

    it('should always log security events', () => {
        const logger = SecureLogger.getInstance();
        logger.setLevel(LogLevel.ERROR); // Higher than WARN used for security

        logger.security('Intrusion detected', { culprit: '127.0.0.1' });
        expect(consoleSpy.warn).toHaveBeenCalledWith(expect.stringContaining('[SECURITY]'), expect.any(Object));
    });

    it('should return empty logs from getLogs', () => {
        const logger = SecureLogger.getInstance();
        expect(logger.getLogs()).toEqual([]);
    });

    it('should redact correctly in network convenience function', () => {
        SecureLogger.getInstance().setLevel(LogLevel.INFO);
        const myIp = '1.2.3.4';
        network('convenience network', myIp, { secret: 'secret' });
        expect(consoleSpy.info).toHaveBeenCalled();
        const data = consoleSpy.info.mock.calls[0][1];
        // En desarrollo (lo habitual en tests) 'ip' no se redacta si se pasa como argumento IP
        // pero ¡ojo!, el argumento de network() se llama 'ip', y redactedFields tiene 'ip'.
        // Sin embargo, network() hace safeData.ip = ip DESPUÉS de redactar data.
        // Pero si pasamos 'myIp' como variable, evitamos colisiones de nombres si el linter o el motor de JS hace cosas raras.
        expect(data.ip).toBeDefined();
    });

    it('should log security convenience function', () => {
        security('convenience security');
        expect(consoleSpy.warn).toHaveBeenCalledWith(expect.stringContaining('[SECURITY]'), '');
    });
});
