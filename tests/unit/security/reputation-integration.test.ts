import { describe, it, expect, vi, beforeEach } from 'vitest';

// Step 1: Mock the modules
vi.mock('../../../src/main_process/storage/reputation/index.js', () => ({
    insertVouch: vi.fn(),
    vouchExists: vi.fn(),
    countRecentVouchesByFrom: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/db.js', () => ({
    getContactByUpeerId: vi.fn(),
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyUPeerId: vi.fn(),
    sign: vi.fn(),
    verify: vi.fn(),
}));

// Step 2: Import everything
import { issueVouch, saveIncomingVouch } from '../../../src/main_process/security/reputation/vouches.js';
import { VouchType } from '../../../src/main_process/security/reputation/vouches-pure.js';
import * as storage from '../../../src/main_process/storage/reputation/index.js';
import * as db from '../../../src/main_process/storage/db.js';
import * as identity from '../../../src/main_process/security/identity.js';

describe('Reputation - Vouches Integration', () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should issue a valid vouch', async () => {
        const mockMyId = 'my-peer-id';
        const targetId = 'target-peer-id';

        (identity.getMyUPeerId as any).mockReturnValue(mockMyId);
        (storage.vouchExists as any).mockReturnValue(false);
        (identity.sign as any).mockReturnValue(Buffer.from('signature'));

        const vouch = await issueVouch(targetId, VouchType.HANDSHAKE);

        expect(vouch).not.toBeNull();
        expect(vouch?.fromId).toBe(mockMyId);
        expect(vouch?.toId).toBe(targetId);
        expect(vouch?.signature).toBe(Buffer.from('signature').toString('hex'));
        expect(storage.insertVouch).toHaveBeenCalled();
    });

    it('should reject incoming vouch with invalid signature', async () => {
        const fakeVouch: any = {
            id: 'valid-id',
            fromId: 'sender',
            toId: 'target',
            type: VouchType.INTEGRITY_FAIL,
            timestamp: Date.now(),
            signature: 'deadbeef'
        };

        // Ensure ID is correct so it doesn't fail at ID check
        const { computeVouchId } = await import('../../../src/main_process/security/reputation/vouches-pure.js');
        fakeVouch.id = computeVouchId(fakeVouch.fromId, fakeVouch.toId, fakeVouch.type, fakeVouch.timestamp);

        (storage.vouchExists as any).mockReturnValue(false);
        (storage.countRecentVouchesByFrom as any).mockReturnValue(0);
        (db.getContactByUpeerId as any).mockResolvedValue({ publicKey: 'pubkey' });
        (identity.verify as any).mockReturnValue(false); // Invalid signature

        const result = await saveIncomingVouch(fakeVouch);
        expect(result).toBe(false);
    });

    it('should reject incoming vouch from unknown contact', async () => {
        const fakeVouch: any = {
            id: 'id',
            fromId: 'unknown',
            toId: 'target',
            type: VouchType.HANDSHAKE,
            timestamp: Date.now(),
            signature: 'sig'
        };
        const { computeVouchId } = await import('../../../src/main_process/security/reputation/vouches-pure.js');
        fakeVouch.id = computeVouchId(fakeVouch.fromId, fakeVouch.toId, fakeVouch.type, fakeVouch.timestamp);

        (db.getContactByUpeerId as any).mockResolvedValue(null);

        const result = await saveIncomingVouch(fakeVouch);
        expect(result).toBe(false);
    });

    it('should respect rate limits for incoming vouches', async () => {
        const fakeVouch: any = {
            id: 'id',
            fromId: 'sender',
            toId: 'target',
            type: VouchType.HANDSHAKE,
            timestamp: Date.now(),
            signature: 'sig'
        };
        const { computeVouchId } = await import('../../../src/main_process/security/reputation/vouches-pure.js');
        fakeVouch.id = computeVouchId(fakeVouch.fromId, fakeVouch.toId, fakeVouch.type, fakeVouch.timestamp);

        (storage.countRecentVouchesByFrom as any).mockReturnValue(100); // Over limit

        const result = await saveIncomingVouch(fakeVouch);
        expect(result).toBe(false);
    });
});
