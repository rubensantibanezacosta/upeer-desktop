import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks de dependencias
vi.mock('../../../src/main_process/storage/db.js', () => ({
    getContacts: vi.fn(),
    getContactByUpeerId: vi.fn(),
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyUPeerId: vi.fn(),
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
}));

vi.mock('../../../src/main_process/network/server/transport.js', () => ({
    sendSecureUDPMessage: vi.fn(),
}));

vi.mock('../../../src/main_process/network/dht/shared.js', () => ({
    getKademliaInstance: vi.fn(),
}));

vi.mock('../../../src/main_process/security/reputation/vouches.js', () => ({
    getVouchScore: vi.fn(),
}));

import { VaultManager } from '../../../src/main_process/network/vault/manager.js';
import * as db from '../../../src/main_process/storage/db.js';
import * as identity from '../../../src/main_process/security/identity.js';
import * as transport from '../../../src/main_process/network/server/transport.js';
import * as dhtShared from '../../../src/main_process/network/dht/shared.js';
import * as reputation from '../../../src/main_process/security/reputation/vouches.js';

describe('VaultManager - Replication Logic', () => {
    const myId = 'my-id';
    const recipientId = 'recipient-id';

    beforeEach(() => {
        vi.clearAllMocks();
        (identity.getMyUPeerId as any).mockReturnValue(myId);
    });

    it('should calculate dynamic replication factor based on score', async () => {
        // Accedemos al método privado mediante 'any' para testear la lógica de decisión

        // 1. Muy confiable (Score 95) -> Factor 3
        (reputation.getVouchScore as any).mockResolvedValue(95);
        (db.getContactByUpeerId as any).mockResolvedValue({ createdAt: Date.now() - 100 * 24 * 3600000 });
        const factorHigh = await (VaultManager as any).getDynamicReplicationFactor(recipientId);
        expect(factorHigh).toBe(3);

        // 2. Sospechoso (Score 20) -> Factor 12
        (reputation.getVouchScore as any).mockResolvedValue(20);
        // Reset para que no se considere "antiguo" o "estable" si no queremos
        (db.getContactByUpeerId as any).mockResolvedValue({ createdAt: Date.now() });
        const factorLow = await (VaultManager as any).getDynamicReplicationFactor(recipientId);
        expect(factorLow).toBe(12);

        // 3. Neutral (Score 50) -> Factor 6
        (reputation.getVouchScore as any).mockResolvedValue(50);
        (db.getContactByUpeerId as any).mockResolvedValue({ createdAt: Date.now() - 31 * 24 * 3600000 }); // "highTenure" (>30d)
        const factorMid = await (VaultManager as any).getDynamicReplicationFactor(recipientId);
        expect(factorMid).toBe(6);
    });
    it('should only store pointers in DHT for successful replications', async () => {
        const contact1 = { upeerId: 'peer1', address: '1.1.1.1', status: 'connected' };
        const contact2 = { upeerId: 'peer2', address: '2.2.2.2', status: 'connected' };

        (db.getContacts as any).mockResolvedValue([contact1, contact2]);
        (db.getContactByUpeerId as any).mockResolvedValue({});
        (reputation.getVouchScore as any).mockResolvedValue(55); // Factor predecible para simplificar

        // Mock de transporte: uno falla, otro tiene éxito
        // Usamos una implementación que no tiene retries infinitos o que falla rápido para el test
        (transport.sendSecureUDPMessage as any).mockImplementation((addr: string) => {
            if (addr === '1.1.1.1') return Promise.resolve();
            return Promise.reject(new Error('Network error'));
        });

        const mockKademlia = {
            findClosestContacts: vi.fn().mockReturnValue([]),
            storeValue: vi.fn().mockResolvedValue(undefined),
        };
        (dhtShared.getKademliaInstance as any).mockReturnValue(mockKademlia);

        // Forzamos un factor de replicación pequeño para que no intente buscar más de los que tenemos
        vi.spyOn(VaultManager as any, 'getDynamicReplicationFactor').mockResolvedValue(2);

        await VaultManager.replicateToVaults(recipientId, { type: 'CHAT', data: 'hi' });

        // Verificamos que se intentó enviar (sendWithRetry usa 3 retries por defecto)
        // Por eso antes daba 4 (1 inicial + 3 reintentos en el que falla)
        expect(transport.sendSecureUDPMessage).toHaveBeenCalled();

        // Verificamos que el DHT solo recibió el ID del que tuvo éxito
        expect(mockKademlia.storeValue).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                custodians: expect.arrayContaining(['peer1'])
            }),
            myId
        );

        const lastCall = mockKademlia.storeValue.mock.calls[0][1];
        expect(lastCall.custodians).not.toContain('peer2');
        expect(lastCall.custodians).toContain('peer1');
    });

    it('should fallback to Kademlia nodes if no friends are connected', async () => {
        (db.getContacts as any).mockResolvedValue([]);

        const meshNode = { upeerId: 'mesh1', address: '3.3.3.3', status: 'connected' };
        const mockKademlia = {
            findClosestContacts: vi.fn().mockReturnValue([meshNode]),
            storeValue: vi.fn().mockResolvedValue(undefined),
        };
        (dhtShared.getKademliaInstance as any).mockReturnValue(mockKademlia);
        (reputation.getVouchScore as any).mockResolvedValue(50);

        await VaultManager.replicateToVaults(recipientId, { type: 'CHAT', data: 'hi' });

        expect(transport.sendSecureUDPMessage).toHaveBeenCalledWith('3.3.3.3', expect.anything());
    });
});
