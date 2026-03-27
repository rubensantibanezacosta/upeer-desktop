/**
 * Secure logging system for upeer P2P
 * Redacts sensitive information and provides structured logging
 */

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}

interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
    data?: unknown;
    source?: string;
}

type RedactableRecord = Record<string, unknown>;

export class SecureLogger {
    private static instance: SecureLogger;
    private level: LogLevel;
    private isProduction: boolean;
    private redactedFields: Set<string>;

    private constructor() {
        this.level = process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG;
        this.isProduction = process.env.NODE_ENV === 'production';
        this.redactedFields = new Set([
            'privateKey', 'secretKey', 'signature', 'publicKey', 'ephemeralPublicKey',
            'nonce', 'ciphertext', 'content', 'powProof', 'address', 'ip',
            'senderUpeerId', 'upeerId', 'targetId'
        ]);
    }

    public static getInstance(): SecureLogger {
        if (!SecureLogger.instance) {
            SecureLogger.instance = new SecureLogger();
        }
        return SecureLogger.instance;
    }

    public setLevel(level: LogLevel): void {
        this.level = level;
    }

    private shouldLog(level: LogLevel): boolean {
        return level >= this.level;
    }

    private redactSensitiveData(data: unknown): unknown {
        if (!data || typeof data !== 'object') {
            return data;
        }

        if (data instanceof Error) {
            return {
                name: data.name,
                message: data.message,
                stack: data.stack
            };
        }

        const redacted: unknown[] | RedactableRecord = Array.isArray(data) ? [...data] : { ...(data as RedactableRecord) };

        for (const key in redacted) {
            if (this.redactedFields.has(key)) {
                const currentValue = redacted[key];
                if (typeof currentValue === 'string' && currentValue.length > 0) {
                    redacted[key] = `[REDACTED:${key} (${currentValue.length} chars)]`;
                } else if (currentValue !== null && currentValue !== undefined) {
                    redacted[key] = `[REDACTED:${key}]`;
                }
            } else if (typeof redacted[key] === 'object' && redacted[key] !== null) {
                redacted[key] = this.redactSensitiveData(redacted[key]);
            }
        }

        return redacted;
    }

    private formatMessage(level: LogLevel, message: string, data?: unknown, source?: string): LogEntry {
        const redactedData = data ? this.redactSensitiveData(data) : undefined;
        return {
            timestamp: new Date().toISOString(),
            level,
            message,
            data: redactedData,
            source: source || 'upeer'
        };
    }

    private logToConsole(entry: LogEntry): void {
        const timestamp = entry.timestamp.slice(11, 23); // HH:MM:SS.mmm
        const levelStr = LogLevel[entry.level];
        const source = entry.source ? `[${entry.source}]` : '';

        const logLine = `${timestamp} ${levelStr} ${source} ${entry.message}`;

        switch (entry.level) {
            case LogLevel.ERROR:
                console.error(logLine, entry.data || '');
                break;
            case LogLevel.WARN:
                console.warn(logLine, entry.data || '');
                break;
            case LogLevel.INFO:
                console.info(logLine, entry.data || '');
                break;
            case LogLevel.DEBUG:
                if (!this.isProduction) {
                    console.debug(logLine, entry.data || '');
                }
                break;
        }
    }

    public debug(message: string, data?: unknown, source?: string): void {
        if (!this.shouldLog(LogLevel.DEBUG)) return;
        const entry = this.formatMessage(LogLevel.DEBUG, message, data, source);
        this.logToConsole(entry);
    }

    public info(message: string, data?: unknown, source?: string): void {
        if (!this.shouldLog(LogLevel.INFO)) return;
        const entry = this.formatMessage(LogLevel.INFO, message, data, source);
        this.logToConsole(entry);
    }

    public warn(message: string, data?: unknown, source?: string): void {
        if (!this.shouldLog(LogLevel.WARN)) return;
        const entry = this.formatMessage(LogLevel.WARN, message, data, source);
        this.logToConsole(entry);
    }

    public error(message: string, data?: unknown, source?: string): void {
        if (!this.shouldLog(LogLevel.ERROR)) return;
        const entry = this.formatMessage(LogLevel.ERROR, message, data, source);
        this.logToConsole(entry);
    }

    /**
     * Special logger for network events that might need IP addresses
     * but should still redact other sensitive data.
     *
     * BUG BO fix: el orden anterior era incorrecto — se asignaba safeData.ip
     * y luego redactSensitiveData() la borraba de nuevo (porque 'ip' está en
     * redactedFields). Ahora se redacta primero el `data` genérico y sólo
     * después se añade la IP procesada, evitando la doble redacción.
     */
    public network(message: string, ip?: string, data?: unknown, source?: string): void {
        if (!this.shouldLog(LogLevel.INFO)) return;

        const baseData = typeof data === 'object' && data !== null ? { ...(data as RedactableRecord) } : {};
        const safeData = (this.redactSensitiveData(baseData) as RedactableRecord | undefined) ?? {};

        // 2. Añadir la IP DESPUÉS de la redacción general
        if (ip) {
            safeData.ip = this.isProduction
                ? ip.split(':')[0] + ':[REDACTED]'
                : ip;
        }

        const entry = this.formatMessage(LogLevel.INFO, message, safeData, source);
        this.logToConsole(entry);
    }

    /**
     * Log security events (always logged regardless of level)
     */
    public security(message: string, data?: unknown, source?: string): void {
        const entry = this.formatMessage(LogLevel.WARN, `[SECURITY] ${message}`, data, source);
        this.logToConsole(entry);
    }

    /**
     * Get current logs in structured format (for debugging/monitoring)
     */
    public getLogs(): LogEntry[] {
        // In a real implementation, this would return stored logs
        // For now, return empty array
        return [];
    }
}

// Convenience functions for global use
export const logger = SecureLogger.getInstance();

export function debug(message: string, data?: unknown, source?: string) {
    logger.debug(message, data, source);
}

export function info(message: string, data?: unknown, source?: string) {
    logger.info(message, data, source);
}

export function warn(message: string, data?: unknown, source?: string) {
    logger.warn(message, data, source);
}

export function error(message: string, data?: unknown, source?: string) {
    logger.error(message, data, source);
}

export function network(message: string, ip?: string, data?: unknown, source?: string) {
    logger.network(message, ip, data, source);
}

export function security(message: string, data?: unknown, source?: string) {
    logger.security(message, data, source);
}