import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    handleReputationGossip,
    handleReputationRequest,
    handleReputationDeliver
} from '../../../src/main_process/network/handlers/reputation.js';
import * as vouches from '../../../src/main_process/security/reputation/vouches.js';

// Mocks de dependencias
vi.mock('../../../src/main_process/security/reputation/vouches.js', () => ({
    getGossipIds: vi.fn(),
    getVouchesForDelivery: vi.fn(),
    saveIncomingVouch: vi.fn().mockResolvedValue(true),
}));

describe('Reputation Handlers', () => {
    const mockSendResponse = vi.fn();
    const mockRinfo = { address: '1.2.3.4', port: 50005 };
    const mockPeerId = 'peer-id';

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('handleReputationGossip', () => {
        it('should request missing IDs from peer', () => {
            const ourIds = ['id1', 'id2'];
            const theirIds = ['id1', 'id3']; // Nos falta 'id3'

            (vouches.getGossipIds as any).mockReturnValue(ourIds);

            handleReputationGossip(mockPeerId, { ids: theirIds }, mockSendResponse, mockRinfo);

            expect(mockSendResponse).toHaveBeenCalledWith(mockRinfo.address, expect.objectContaining({
                type: 'REPUTATION_REQUEST',
                missing: ['id3']
            }));
        });

        it('should push our IDs if peer is missing them', () => {
            const ourIds = ['id1', 'id2'];
            const theirIds = ['id1']; // Al peer le falta 'id2'

            (vouches.getGossipIds as any).mockReturnValue(ourIds);

            handleReputationGossip(mockPeerId, { ids: theirIds }, mockSendResponse, mockRinfo);

            // Debería enviar REPUTATION_GOSSIP con nuestra lista completa (o paginada)
            expect(mockSendResponse).toHaveBeenCalledWith(mockRinfo.address, expect.objectContaining({
                type: 'REPUTATION_GOSSIP',
                ids: ourIds
            }));
        });

        it('should do nothing if both are synchronized', () => {
            const ids = ['id1', 'id2'];
            (vouches.getGossipIds as any).mockReturnValue(ids);

            handleReputationGossip(mockPeerId, { ids }, mockSendResponse, mockRinfo);

            expect(mockSendResponse).not.toHaveBeenCalled();
        });
    });

    describe('handleReputationRequest', () => {
        it('should deliver requested vouches', () => {
            const requestedIds = ['id1'];
            const mockVouches = [{ id: 'id1', fromId: 'a', toId: 'b' }];

            (vouches.getVouchesForDelivery as any).mockReturnValue(mockVouches);

            handleReputationRequest(mockPeerId, { missing: requestedIds }, mockSendResponse, mockRinfo);

            expect(vouches.getVouchesForDelivery).toHaveBeenCalledWith(requestedIds);
            expect(mockSendResponse).toHaveBeenCalledWith(mockRinfo.address, {
                type: 'REPUTATION_DELIVER',
                vouches: mockVouches
            });
        });

        it('should not send response if no vouches found', () => {
            (vouches.getVouchesForDelivery as any).mockReturnValue([]);

            handleReputationRequest(mockPeerId, { missing: ['id_none'] }, mockSendResponse, mockRinfo);

            expect(mockSendResponse).not.toHaveBeenCalled();
        });
    });

    describe('handleReputationDeliver', () => {
        it('should save received vouches', async () => {
            const receivedVouches = [
                { id: 'v1', fromId: 'p1', toId: 'p2' },
                { id: 'v2', fromId: 'p3', toId: 'p4' }
            ];

            handleReputationDeliver(mockPeerId, { vouches: receivedVouches });

            expect(vouches.saveIncomingVouch).toHaveBeenCalledTimes(2);
            expect(vouches.saveIncomingVouch).toHaveBeenCalledWith(receivedVouches[0]);
            expect(vouches.saveIncomingVouch).toHaveBeenCalledWith(receivedVouches[1]);
        });
    });
});
