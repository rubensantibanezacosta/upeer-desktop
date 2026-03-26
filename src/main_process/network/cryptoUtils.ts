export function validateHex(hex: string, description: string): void {
    if (typeof hex !== 'string' || !/^[0-9a-f]*$/i.test(hex)) {
        throw new Error(`Invalid hex string for ${description}`);
    }
}

export function safeBufferFromHex(hex: string, expectedLength?: number, description = 'buffer'): Buffer {
    validateHex(hex, description);
    if (expectedLength !== undefined && hex.length !== expectedLength * 2) {
        throw new Error(`Invalid length for ${description}: expected ${expectedLength} bytes, got ${hex.length / 2}`);
    }
    return Buffer.from(hex, 'hex');
}

export function canonicalStringify(obj: any): string {
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
        if (Array.isArray(obj)) {
            return '[' + obj.map(item => canonicalStringify(item)).join(',') + ']';
        }
        return JSON.stringify(obj);
    }
    const allKeys = Object.keys(obj).sort();
    const parts = allKeys.map(key => {
        const val = obj[key];
        if (val === undefined) return null;
        return JSON.stringify(key) + ':' + canonicalStringify(val);
    }).filter(p => p !== null);
    return '{' + parts.join(',') + '}';
}
