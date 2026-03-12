/**
 * Rate Limiter with Token Bucket algorithm for P2P network security
 * Provides protection against DoS attacks by limiting messages per IP and type
 */

import { warn } from './secure-logger.js';

export interface RateLimitConfig {
    windowMs: number;    // Time window in milliseconds
    maxTokens: number;   // Maximum tokens per window
    refillRate: number;  // Tokens refilled per second (optional, for token bucket)
}

export interface RateLimitRule {
    [messageType: string]: RateLimitConfig;
}

export interface TokenBucket {
    tokens: number;
    lastRefill: number;
}

export class RateLimiter {
    private buckets: Map<string, Map<string, TokenBucket>> = new Map(); // IP -> messageType -> bucket
    private rules: RateLimitRule;

    constructor(rules?: RateLimitRule) {
        this.rules = rules || this.getDefaultRules();
    }

    private getDefaultRules(): RateLimitRule {
        return {
            // Handshake messages: limited to prevent connection flooding
            'HANDSHAKE_REQ': { windowMs: 60000, maxTokens: 50, refillRate: 50 / 60 },
            'HANDSHAKE_ACCEPT': { windowMs: 60000, maxTokens: 50, refillRate: 50 / 60 },

            // Heartbeat messages
            'PING': { windowMs: 10000, maxTokens: 60, refillRate: 60 / 10 }, // 60 per 10 seconds
            'PONG': { windowMs: 10000, maxTokens: 60, refillRate: 60 / 10 },

            // DHT messages: limit queries to prevent amplification attacks
            'DHT_QUERY': { windowMs: 30000, maxTokens: 20, refillRate: 20 / 30 }, // 20 per 30 seconds
            'DHT_RESPONSE': { windowMs: 30000, maxTokens: 40, refillRate: 40 / 30 },
            'DHT_UPDATE': { windowMs: 60000, maxTokens: 40, refillRate: 40 / 60 },
            'DHT_EXCHANGE': { windowMs: 60000, maxTokens: 60, refillRate: 60 / 60 },

            // Chat messages: reasonable limits for normal usage
            'CHAT': { windowMs: 60000, maxTokens: 100, refillRate: 100 / 60 }, // 100 per minute
            'ACK': { windowMs: 60000, maxTokens: 200, refillRate: 200 / 60 },
            'READ': { windowMs: 60000, maxTokens: 200, refillRate: 200 / 60 },
            'TYPING': { windowMs: 60000, maxTokens: 50, refillRate: 50 / 60 },

            // Social interactions
            'CHAT_CONTACT': { windowMs: 60000, maxTokens: 20, refillRate: 20 / 60 }, // BUG CC fix: faltaba regla → ilimitado
            'CHAT_REACTION': { windowMs: 60000, maxTokens: 50, refillRate: 50 / 60 },
            'CHAT_UPDATE': { windowMs: 60000, maxTokens: 20, refillRate: 20 / 60 },
            'CHAT_DELETE': { windowMs: 60000, maxTokens: 20, refillRate: 20 / 60 },

            // Kademlia DHT messages
            'DHT_FIND_NODE': { windowMs: 30000, maxTokens: 30, refillRate: 30 / 30 },
            'DHT_FIND_VALUE': { windowMs: 30000, maxTokens: 30, refillRate: 30 / 30 },
            'DHT_STORE': { windowMs: 60000, maxTokens: 10, refillRate: 10 / 60 },

            // Vault messages
            // BUG BH fix: tipos VAULT_* y REPUTATION_* no tenían reglas →
            // la llamada a check() devolvía true incondicionalmente (sin regla = ilimitado).
            // Un peer podía inundar con VAULT_STORE/VAULT_QUERY/REPUTATION_GOSSIP sin límite.
            'VAULT_STORE': { windowMs: 60000, maxTokens: 30, refillRate: 30 / 60 },
            'VAULT_QUERY': { windowMs: 60000, maxTokens: 10, refillRate: 10 / 60 },
            'VAULT_DELIVERY': { windowMs: 60000, maxTokens: 20, refillRate: 20 / 60 },
            'VAULT_ACK': { windowMs: 60000, maxTokens: 100, refillRate: 100 / 60 },
            'VAULT_RENEW': { windowMs: 60000, maxTokens: 30, refillRate: 30 / 60 },

            // Reputation gossip
            'REPUTATION_GOSSIP': { windowMs: 60000, maxTokens: 5, refillRate: 5 / 60 },
            'REPUTATION_REQUEST': { windowMs: 60000, maxTokens: 10, refillRate: 10 / 60 },
            'REPUTATION_DELIVER': { windowMs: 60000, maxTokens: 10, refillRate: 10 / 60 },

            // Group messages
            'GROUP_MSG': { windowMs: 60000, maxTokens: 100, refillRate: 100 / 60 },
            'GROUP_ACK': { windowMs: 60000, maxTokens: 200, refillRate: 200 / 60 },
            'GROUP_INVITE': { windowMs: 60000, maxTokens: 5, refillRate: 5 / 60 },
            'GROUP_UPDATE': { windowMs: 60000, maxTokens: 10, refillRate: 10 / 60 },
            'GROUP_LEAVE': { windowMs: 60000, maxTokens: 10, refillRate: 10 / 60 },

            // File transfer messages (supporting multiple naming conventions for consistency)
            'FILE_START': { windowMs: 60000, maxTokens: 50, refillRate: 50 / 60 },
            'FILE_PROPOSAL': { windowMs: 60000, maxTokens: 50, refillRate: 50 / 60 },
            'FILE_ACCEPT': { windowMs: 60000, maxTokens: 50, refillRate: 50 / 60 },
            'FILE_CHUNK': { windowMs: 1000, maxTokens: 5000, refillRate: 5000 },
            'FILE_ACK': { windowMs: 1000, maxTokens: 5000, refillRate: 5000 },
            'FILE_CHUNK_ACK': { windowMs: 1000, maxTokens: 5000, refillRate: 5000 },
            'FILE_END': { windowMs: 60000, maxTokens: 50, refillRate: 50 / 60 },
            'FILE_DONE_ACK': { windowMs: 60000, maxTokens: 50, refillRate: 50 / 60 },
            'FILE_CANCEL': { windowMs: 60000, maxTokens: 50, refillRate: 50 / 60 },
            // BUG DJ fix: SEALED no tenía regla → operaciones DH X25519 ilimitadas por IP.
            // 5000/s es suficiente para transferencias de archivos a máxima velocidad
            // (los FILE_CHUNK más su overhead SEALED) y bloquea floods sin autenticar.
            'SEALED': { windowMs: 1000, maxTokens: 5000, refillRate: 5000 },
        };
    }

    /**
     * Check if a message from given IP and type is allowed
     * Returns true if allowed, false if rate limited
     */
    check(ip: string, messageType: string): boolean {
        const rule = this.rules[messageType];
        if (!rule) {
            // No rule for this message type = unlimited
            return true;
        }

        const now = Date.now();
        const bucketKey = `${ip}:${messageType}`;

        // Get or create bucket for this IP and message type
        if (!this.buckets.has(ip)) {
            this.buckets.set(ip, new Map());
        }
        const ipBuckets = this.buckets.get(ip)!;

        if (!ipBuckets.has(messageType)) {
            ipBuckets.set(messageType, {
                tokens: rule.maxTokens,
                lastRefill: now
            });
        }

        const bucket = ipBuckets.get(messageType)!;

        // Refill tokens based on elapsed time
        const elapsedMs = now - bucket.lastRefill;
        if (elapsedMs > 0) {
            const refillTokens = elapsedMs * (rule.refillRate / 1000);
            bucket.tokens = Math.min(rule.maxTokens, bucket.tokens + refillTokens);
            bucket.lastRefill = now;
        }

        // Check if we have at least 1 token
        if (bucket.tokens >= 1) {
            bucket.tokens -= 1;
            return true;
        }

        // Rate limited
        // BUG BE fix: eliminados console.log de depuración que se disparaban en cada paquete
        // (allow y block), causando spam masivo de consola durante transferencias de archivos
        // y registrando IPs en texto plano — información sensible en una app de privacidad.
        warn('Rate limited', { ip, messageType, tokens: bucket.tokens.toFixed(2) }, 'rate-limiter');
        return false;
    }

    /**
     * Reset rate limits for a specific IP (useful after banning or temporary blocks)
     */
    resetIp(ip: string): void {
        this.buckets.delete(ip);
    }

    /**
     * Get current token count for debugging/monitoring
     */
    getTokenCount(ip: string, messageType: string): number {
        const ipBuckets = this.buckets.get(ip);
        if (!ipBuckets) return 0;
        const bucket = ipBuckets.get(messageType);
        return bucket ? bucket.tokens : 0;
    }

    /**
     * Clean up old entries to prevent memory leak
     * Should be called periodically (e.g., every hour)
     */
    cleanup(maxAgeMs: number = 3600000): void {
        const now = Date.now();
        const toDelete: string[] = [];

        for (const [ip, ipBuckets] of this.buckets.entries()) {
            let hasActivity = false;
            for (const bucket of ipBuckets.values()) {
                if (now - bucket.lastRefill < maxAgeMs) {
                    hasActivity = true;
                    break;
                }
            }
            if (!hasActivity) {
                toDelete.push(ip);
            }
        }

        for (const ip of toDelete) {
            this.buckets.delete(ip);
        }
    }

    /**
     * Update rate limit rules dynamically
     */
    updateRules(newRules: RateLimitRule): void {
        this.rules = { ...this.rules, ...newRules };
    }
}