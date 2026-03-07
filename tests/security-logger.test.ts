import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { SecureLogger, LogLevel } from '../src/main_process/security/secure-logger.js';

// Mock console methods to capture output
const originalConsole = {
    debug: console.debug,
    info: console.info,
    warn: console.warn,
    error: console.error
};

describe('SecureLogger', () => {
    let logger: SecureLogger;
    let capturedLogs: any[] = [];
    
    beforeEach(() => {
        // Reset captured logs
        capturedLogs = [];
        
        // Mock console methods
        console.debug = (message: string, data?: any) => {
            capturedLogs.push({ level: 'debug', message, data });
        };
        console.info = (message: string, data?: any) => {
            capturedLogs.push({ level: 'info', message, data });
        };
        console.warn = (message: string, data?: any) => {
            capturedLogs.push({ level: 'warn', message, data });
        };
        console.error = (message: string, data?: any) => {
            capturedLogs.push({ level: 'error', message, data });
        };
        
        logger = SecureLogger.getInstance();
        // Reset to default level
        logger.setLevel(LogLevel.DEBUG);
    });
    
    afterEach(() => {
        // Restore original console
        console.debug = originalConsole.debug;
        console.info = originalConsole.info;
        console.warn = originalConsole.warn;
        console.error = originalConsole.error;
    });
    
    it('should redact sensitive data', () => {
        const sensitiveData = {
            privateKey: 'secret123',
            publicKey: 'public123',
            signature: 'sig123',
            nonce: 'nonce123',
            ip: '192.168.1.1',
            revelnestId: 'test123',
            message: 'Hello World'  // 'message' is not in sensitive fields
        };
        
        const redacted = (logger as any).redactSensitiveData(sensitiveData);
        
        // Sensitive fields should be redacted
        assert.ok(redacted.privateKey.includes('[REDACTED'));
        assert.ok(redacted.publicKey.includes('[REDACTED'));
        assert.ok(redacted.signature.includes('[REDACTED'));
        assert.ok(redacted.nonce.includes('[REDACTED'));
        assert.ok(redacted.ip.includes('[REDACTED'));
        assert.ok(redacted.revelnestId.includes('[REDACTED'));
        
        // Non-sensitive fields should remain
        assert.strictEqual(redacted.message, 'Hello World');
    });
    
    it('should respect log levels', () => {
        // Set level to WARN
        logger.setLevel(LogLevel.WARN);
        
        logger.debug('Debug message');
        logger.info('Info message');
        logger.warn('Warn message');
        logger.error('Error message');
        
        // Only WARN and ERROR should be logged
        const loggedLevels = capturedLogs.map(log => log.level);
        assert.deepStrictEqual(loggedLevels, ['warn', 'error']);
    });
    
    it('should log at all levels when level is DEBUG', () => {
        logger.setLevel(LogLevel.DEBUG);
        
        logger.debug('Debug message');
        logger.info('Info message');
        logger.warn('Warn message');
        logger.error('Error message');
        
        assert.strictEqual(capturedLogs.length, 4);
    });
    
    it('should include source in log entries', () => {
        logger.info('Test message', { data: 'test' }, 'test-source');
        
        assert.strictEqual(capturedLogs.length, 1);
        const log = capturedLogs[0];
        assert.ok(log.message.includes('test-source') || log.data?.source === 'test-source');
    });
    
    it('should log network events with IP handling', () => {
        logger.network('Network event', '192.168.1.1:50005', { data: 'test' }, 'network');
        
        assert.strictEqual(capturedLogs.length, 1);
        const log = capturedLogs[0];
        // IP should be included in data
        assert.ok(log.data?.ip !== undefined);
    });
    
    it('should always log security events', () => {
        // Even with high log level, security should be logged
        logger.setLevel(LogLevel.ERROR);
        
        logger.security('Security event', { threat: 'test' }, 'security');
        
        assert.strictEqual(capturedLogs.length, 1);
        const log = capturedLogs[0];
        assert.strictEqual(log.level, 'warn'); // Security logs at WARN level
        assert.ok(log.message.includes('[SECURITY]'));
    });
    
    it('should handle nested object redaction', () => {
        const nestedData = {
            user: {
                privateKey: 'secret',
                profile: {
                    name: 'John',
                    publicKey: 'public123'
                }
            },
            message: {
                text: 'Hello',  // 'text' is not in sensitive fields
                signature: 'sig123'
            }
        };
        
        const redacted = (logger as any).redactSensitiveData(nestedData);
        
        // Nested sensitive fields should be redacted
        assert.ok(redacted.user.privateKey.includes('[REDACTED'));
        assert.ok(redacted.user.profile.publicKey.includes('[REDACTED'));
        assert.ok(redacted.message.signature.includes('[REDACTED'));
        
        // Non-sensitive nested fields should remain
        assert.strictEqual(redacted.user.profile.name, 'John');
        assert.strictEqual(redacted.message.text, 'Hello');
    });
    
    it('should handle arrays in redaction', () => {
        const arrayData = {
            users: [
                { name: 'Alice', privateKey: 'secret1' },
                { name: 'Bob', privateKey: 'secret2' }
            ],
            messages: ['msg1', 'msg2']
        };
        
        const redacted = (logger as any).redactSensitiveData(arrayData);
        
        // Array elements should be redacted
        assert.ok(redacted.users[0].privateKey.includes('[REDACTED'));
        assert.ok(redacted.users[1].privateKey.includes('[REDACTED'));
        
        // Non-sensitive array elements should remain
        assert.strictEqual(redacted.users[0].name, 'Alice');
        assert.strictEqual(redacted.users[1].name, 'Bob');
        assert.deepStrictEqual(redacted.messages, ['msg1', 'msg2']);
    });
    
    it('should return singleton instance', () => {
        const instance1 = SecureLogger.getInstance();
        const instance2 = SecureLogger.getInstance();
        
        assert.strictEqual(instance1, instance2);
    });
});