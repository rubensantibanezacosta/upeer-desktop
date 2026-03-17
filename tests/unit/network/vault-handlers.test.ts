import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleVaultDelivery } from '../../../src/main_process/network/handlers/vault.js';
import * as db from '../../../src/main_process/storage/db.js';
import * as identity from '../../../src/main_process/security/identity.js';
import * as validation from '../../../src/main_process/security/validation.js';

// Mocks
vi.mock('../../../src/main_process/storage/db.js', () => ({
    getContactByUpeerId: vi.fn(),
    saveFileMessage: vi.fn(),
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyUPeerId: vi.fn().mockReturnValue('my-id'),
    verify: vi.fn().mockReturnValue(true),
}));

vi.mock('../../../src/main_process/security/validation.js', () => ({
    validateMessage: vi.fn().mockReturnValue({ valid: true }),
}));

vi.mock('../../../src/main_process/security/reputation/vouches.js', () => ({
    issueVouch: vi.fn().mockResolvedValue(true),
    VouchType: {
        VAULT_RETRIEVED: 'VAULT_RETRIEVED',
        INTEGRITY_FAIL: 'INTEGRITY_FAIL'
    }
}));

// Mock dinámico de chat.js (usado dentro de handleVaultDelivery)
vi.mock('../../../src/main_process/network/handlers/chat.js', () => ({
    handleChatMessage: vi.fn(),
    handleIncomingClear: vi.fn(),
}));

describe('Vault Delivery Handler', () => {
    const mockSendResponse = vi.fn();
    const mockWin = {} as any;
    const custodianSid = 'custodian-id';

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should discard non-array entries (DoS protection)', async () => {
        await handleVaultDelivery(custodianSid, { entries: null }, mockWin, mockSendResponse, '1.2.3.4');
        expect(db.getContactByUpeerId).not.toHaveBeenCalled();
    });

    it('should limit entries to MAX_DELIVERY_ENTRIES (50)', async () => {
        const manyEntries = Array(100).fill({
            senderSid: 'origin-id',
            data: Buffer.from(JSON.stringify({ type: 'CHAT', signature: 'sig' })).toString('hex')
        });

        (db.getContactByUpeerId as any).mockResolvedValue({ publicKey: 'pubkey' });

        await handleVaultDelivery(custodianSid, { entries: manyEntries }, mockWin, mockSendResponse, '1.2.3.4');

        // Solo debería procesar los primeros 50
        expect(db.getContactByUpeerId).toHaveBeenCalledTimes(50);
    });

    it('should verify integrity of inner packets', async () => {
        const innerPacket = { type: 'CHAT', text: 'hello', senderUpeerId: 'origin-id', signature: 'inner-sig' };
        const entry = {
            senderSid: 'origin-id',
            data: Buffer.from(JSON.stringify(innerPacket)).toString('hex')
        };

        (db.getContactByUpeerId as any).mockResolvedValue({ publicKey: 'origin-pubkey' });
        (identity.verify as any).mockReturnValue(false); // Simular fallo de firma

        await handleVaultDelivery(custodianSid, { entries: [entry] }, mockWin, mockSendResponse, '1.2.3.4');

        expect(identity.verify).toHaveBeenCalled();
        // No debería llamar a handleChatMessage si la firma falla
        const chatModule = await import('../../../src/main_process/network/handlers/chat.js');
        expect(chatModule.handleChatMessage).not.toHaveBeenCalled();
    });

    it('should validate structural integrity of inner packets (validateMessage)', async () => {
        const innerPacket = { type: 'CHAT', text: 'hello', senderUpeerId: 'origin-id', signature: 'inner-sig' };
        const entry = {
            senderSid: 'origin-id',
            data: Buffer.from(JSON.stringify(innerPacket)).toString('hex')
        };

        (db.getContactByUpeerId as any).mockResolvedValue({ publicKey: 'origin-pubkey' });
        (identity.verify as any).mockReturnValue(true);
        (validation.validateMessage as any).mockReturnValue({ valid: false, error: 'invalid-structure' });

        await handleVaultDelivery(custodianSid, { entries: [entry] }, mockWin, mockSendResponse, '1.2.3.4');

        expect(validation.validateMessage).toHaveBeenCalled();
        const chatModule = await import('../../../src/main_process/network/handlers/chat.js');
        expect(chatModule.handleChatMessage).not.toHaveBeenCalled();
    });

    it('should process valid CHAT entries from vault', async () => {
        const innerPacket = { type: 'CHAT', text: 'secret', senderUpeerId: 'origin-id', signature: 'inner-sig' };
        const entry = {
            senderSid: 'origin-id',
            data: Buffer.from(JSON.stringify(innerPacket)).toString('hex')
        };

        const mockContact = { upeerId: 'origin-id', publicKey: 'origin-pubkey' };
        (db.getContactByUpeerId as any).mockResolvedValue(mockContact);
        (identity.verify as any).mockReturnValue(true);
        (validation.validateMessage as any).mockReturnValue({ valid: true });

        await handleVaultDelivery(custodianSid, { entries: [entry] }, mockWin, mockSendResponse, '1.2.3.4');

        const chatModule = await import('../../../src/main_process/network/handlers/chat.js');
        expect(chatModule.handleChatMessage).toHaveBeenCalledWith(
            'origin-id',
            mockContact,
            expect.objectContaining({ type: 'CHAT', text: 'secret' }),
            mockWin,
            'inner-sig',
            '1.2.3.4',
            mockSendResponse
        );
    });
});
