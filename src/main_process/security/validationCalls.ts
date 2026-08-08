import { validateCallPacket } from '../network/call/validationCalls.js';

export type { CallValidationResult } from '../network/call/validationCalls.js';

export function validateCallMessage(type: string, data: Record<string, unknown>): { valid: boolean; error?: string } {
    const result = validateCallPacket(type, data);
    return result.valid ? { valid: true } : { valid: false, error: result.reason };
}
