import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { VaultManager } from '../src/main_process/network/vault/manager.ts';
import * as handlers from '../src/main_process/network/handlers.js';
import { initDB, closeDB, addOrUpdateContact, getContactByUpeerId } from '../src/main_process/storage/db.js';
import { initIdentity, getMyUPeerId } from '../src/main_process/security/identity.js';

describe('Vault Integration Tests (Real DB Simulation)', () => {
    let tempDir: string;

    beforeEach(async () => {
        // 1. Setup temp environment
        tempDir = path.join(os.tmpdir(), 'vault-test-' + Date.now());
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        // 2. Init Identity & DB
        initIdentity(tempDir);
        await initDB(tempDir);

        // 3. Setup global mock state for network
        (global as any).testSentMessages = [];

        // 4. Seeding real DB with test contacts
        const myId = getMyUPeerId();
        // Friend 1 (Online)
        await addOrUpdateContact('friend-1', '10.0.0.1', 'Friend 1', 'pubkey-1', 'connected');
        // Friend 2 (Online)
        await addOrUpdateContact('friend-2', '10.0.0.2', 'Friend 2', 'pubkey-2', 'connected');
        // Recipient (Offline)
        await addOrUpdateContact('recipient', '10.0.0.3', 'Recipient', 'pubkey-rec', 'offline');
    });

    afterEach(async () => {
        await closeDB();
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (e) { }
    });

    it('should replicate message to friends when recipient is offline', async () => {
        const recipientSid = 'recipient';
        const chatPacket = { type: 'CHAT', content: 'Cifrado', id: 'msg-123' };

        await VaultManager.replicateToVaults(recipientSid, chatPacket);

        const sentMessages = (global as any).testSentMessages;
        // Should have sent VAULT_STORE to friend-1 and friend-2
        const storeCalls = sentMessages.filter(m => m.data.type === 'VAULT_STORE');
        assert.ok(storeCalls.length >= 2, `Expected at least 2 stores, got ${storeCalls.length}`);

        const firstStore = storeCalls[0].data;
        assert.strictEqual(firstStore.recipientSid, 'recipient');
        assert.strictEqual(firstStore.senderSid, getMyUPeerId());
    });

    it('should query for offline messages on startup', async () => {
        await VaultManager.queryOwnVaults();

        const sentMessages = (global as any).testSentMessages;
        const queryCalls = sentMessages.filter((m) => m.data.type === 'VAULT_QUERY');
        assert.ok(queryCalls.length >= 2, `Expected 2 queries, got ${queryCalls.length}`);
        assert.strictEqual(queryCalls[0].data.requesterSid, getMyUPeerId());
    });

    it('should handle vault delivery and ACK correctly', async () => {
        const mockWin = { webContents: { send: () => { } } } as any;
        const mockSendResponse = (ip, data) => {
            (global as any).testSentMessages.push({ ip, data });
        };

        const innerPacket = { type: 'CHAT', content: 'Hola Offline', id: 'msg-rec-1' };
        const entries = [
            {
                payloadHash: 'hash-1',
                senderSid: 'friend-1',
                data: Buffer.from(JSON.stringify(innerPacket)).toString('hex')
            }
        ];

        const vaultDeliveryPacket = {
            type: 'VAULT_DELIVERY',
            entries,
            senderUpeerId: 'friend-1',
            signature: 'dummy'
        };

        const rinfo = { address: '10.0.0.1', family: 'IPv4', port: 50005, size: 247 } as any;
        const packetBuffer = Buffer.from(JSON.stringify(vaultDeliveryPacket));

        // Simulate incoming vault delivery via the real entry point
        await (handlers as any).handlePacket(
            packetBuffer,
            rinfo,
            mockWin,
            mockSendResponse,
            () => { } // next callback
        );

        const sentMessages = (global as any).testSentMessages;
        const ackResponse = sentMessages.find(m => m.data.type === 'VAULT_ACK')?.data;

        assert.ok(ackResponse, 'Should have sent a VAULT_ACK');
        assert.strictEqual(ackResponse.type, 'VAULT_ACK');
        assert.deepStrictEqual(ackResponse.payloadHashes, ['hash-1']);
    });

});
