import {
    RATE_LIMIT_WINDOW_MS,
    RATE_LIMIT_MESSAGES_PER_WINDOW,
    RATE_LIMIT_CONTACT_REQUESTS_PER_WINDOW,
    RATE_LIMIT_VOUCHES_PER_WINDOW
} from './constants.js';
import { error } from '../../security/secure-logger.js';

type RateLimitType = 'message' | 'contact_request' | 'vouch';

interface RateLimitRecord {
    timestamps: number[];
    type: RateLimitType;
}

class RateLimiter {
    private limits = new Map<string, RateLimitRecord>();
    private cleanupInterval: NodeJS.Timeout;

    constructor() {
        // Limpieza cada 5 minutos para evitar memory leak
        this.cleanupInterval = setInterval(() => this.cleanupOldEntries(), 5 * 60 * 1000);
    }

    /**
     * Check if a UPeerID is allowed to perform an action.
     * @returns true if allowed, false if rate limited
     */
    check(upeerId: string, type: RateLimitType): boolean {
        const now = Date.now();
        const key = `${upeerId}:${type}`;
        const record = this.limits.get(key);
        
        if (!record) {
            // First request
            this.limits.set(key, { timestamps: [now], type });
            return true;
        }

        // Remove timestamps outside the window
        const windowStart = now - RATE_LIMIT_WINDOW_MS;
        const recentTimestamps = record.timestamps.filter(ts => ts > windowStart);
        
        // Determine limit based on type
        let limit: number;
        switch (type) {
            case 'message':
                limit = RATE_LIMIT_MESSAGES_PER_WINDOW;
                break;
            case 'contact_request':
                limit = RATE_LIMIT_CONTACT_REQUESTS_PER_WINDOW;
                break;
            case 'vouch':
                limit = RATE_LIMIT_VOUCHES_PER_WINDOW;
                break;
            default:
                limit = 10; // fallback
        }

        if (recentTimestamps.length >= limit) {
            // Rate limited
            const oldest = recentTimestamps[0];
            const waitMs = windowStart + RATE_LIMIT_WINDOW_MS - now;
            error(`Rate limit exceeded for ${upeerId} (${type}: ${recentTimestamps.length}/${limit})`, 
                { upeerId, type, waitMs, oldestTimestamp: new Date(oldest).toISOString() }, 
                'security');
            return false;
        }

        // Allow and record timestamp
        recentTimestamps.push(now);
        record.timestamps = recentTimestamps;
        this.limits.set(key, record);
        return true;
    }

    /**
     * Increment counter for a UPeerID (convenience method)
     */
    increment(upeerId: string, type: RateLimitType): boolean {
        return this.check(upeerId, type);
    }

    /**
     * Reset rate limit for a specific UPeerID and type
     */
    reset(upeerId: string, type: RateLimitType): void {
        const key = `${upeerId}:${type}`;
        this.limits.delete(key);
    }

    /**
     * Get current count for a UPeerID and type within the window
     */
    getCount(upeerId: string, type: RateLimitType): number {
        const now = Date.now();
        const windowStart = now - RATE_LIMIT_WINDOW_MS;
        const key = `${upeerId}:${type}`;
        const record = this.limits.get(key);
        
        if (!record) return 0;
        return record.timestamps.filter(ts => ts > windowStart).length;
    }

    /**
     * Cleanup old entries to prevent memory leak
     */
    private cleanupOldEntries(): void {
        const now = Date.now();
        const windowStart = now - RATE_LIMIT_WINDOW_MS;
        
        for (const [key, record] of this.limits.entries()) {
            const recent = record.timestamps.filter(ts => ts > windowStart);
            if (recent.length === 0) {
                this.limits.delete(key);
            } else {
                record.timestamps = recent;
                this.limits.set(key, record);
            }
        }
    }

    /**
     * Stop cleanup interval (call on app shutdown)
     */
    stop(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
    }
}

// Singleton instance
export const rateLimiter = new RateLimiter();