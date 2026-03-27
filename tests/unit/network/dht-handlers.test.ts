import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleDhtUpdate, handleDhtExchange, handleDhtQuery, handleDhtResponse } from '../../../src/main_process/network/handlers/dht.js';
import * as contactsOps from '../../../src/main_process/storage/contacts/operations.js';
import * as locationOps from '../../../src/main_process/storage/contacts/location.js';
import * as deviceOps from '../../../src/main_process/storage/devices-operations.js';
import * as identity from '../../../src/main_process/security/identity.js';
import * as networkUtils from '../../../src/main_process/network/utils.js';

type DhtUpdateContact = Parameters<typeof handleDhtUpdate>[1];
type DhtUpdateData = Parameters<typeof handleDhtUpdate>[2];
type DhtExchangeData = Parameters<typeof handleDhtExchange>[1];
type DhtQueryData = Parameters<typeof handleDhtQuery>[1];
type DhtResponseData = Parameters<typeof handleDhtResponse>[1];

// Mock de dependencias
vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContactByUpeerId: vi.fn(),
    getContacts: vi.fn(() => []),
}));

vi.mock('../../../src/main_process/storage/contacts/location.js', () => ({
    updateContactDhtLocation: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/devices-operations.js', () => ({
    upsertDevice: vi.fn(async () => { }),
    getDevicesByUPeerId: vi.fn(async () => []),
    setDeviceTrust: vi.fn(async () => { }),
    deleteDevice: vi.fn(async () => { }),
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyUPeerId: vi.fn(() => 'my-peer-id'),
}));

vi.mock('../../../src/main_process/network/utils.js', () => ({
    verifyLocationBlock: vi.fn(),
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    network: vi.fn(),
    security: vi.fn(),
}));

describe('DHT Handlers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('handleDhtUpdate', () => {
        it('should ignore if locationBlock is missing or malformed', async () => {
            await handleDhtUpdate('peer-id', {}, {});
            expect(locationOps.updateContactDhtLocation).not.toHaveBeenCalled();

            await handleDhtUpdate('peer-id', {}, { locationBlock: { dhtSeq: 'not-a-number' } });
            expect(locationOps.updateContactDhtLocation).not.toHaveBeenCalled();
        });

        it('should ignore if signature is invalid', async () => {
            vi.mocked(networkUtils.verifyLocationBlock).mockReturnValue(false);
            const data: DhtUpdateData = {
                locationBlock: { dhtSeq: 10, address: '1.2.3.4', signature: 'bad-sig' }
            };
            await handleDhtUpdate('peer-id', { publicKey: 'pubkey' } as DhtUpdateContact, data);
            expect(locationOps.updateContactDhtLocation).not.toHaveBeenCalled();
        });

        it('should update location if dhtSeq is newer', async () => {
            vi.mocked(networkUtils.verifyLocationBlock).mockReturnValue(true);
            const data: DhtUpdateData = {
                locationBlock: {
                    dhtSeq: 10,
                    address: '1.2.3.4',
                    signature: 'valid-sig',
                    expiresAt: 123456789,
                    renewalToken: 'token'
                }
            };
            await handleDhtUpdate('peer-id', { dhtSeq: 5, publicKey: 'pubkey' } as DhtUpdateContact, data);
            expect(locationOps.updateContactDhtLocation).toHaveBeenCalledWith(
                'peer-id', '1.2.3.4', 10, 'valid-sig', 123456789, 'token'
            );
        });

        it('should upsert device info if present in locationBlock', async () => {
            vi.mocked(networkUtils.verifyLocationBlock).mockReturnValue(true);
            const deviceMeta = { clientName: 'Test', platform: 'linux', clientVersion: '1.0' };
            const data: DhtUpdateData = {
                locationBlock: {
                    dhtSeq: 10,
                    address: '1.2.3.4',
                    signature: 'valid-sig',
                    deviceId: 'dev-123',
                    deviceMeta
                }
            };
            await handleDhtUpdate('peer-id', { dhtSeq: 5, publicKey: 'pubkey' } as DhtUpdateContact, data);
            expect(deviceOps.upsertDevice).toHaveBeenCalledWith('peer-id', 'dev-123', deviceMeta);
        });

        it('should not update if dhtSeq is older or equal', async () => {
            vi.mocked(networkUtils.verifyLocationBlock).mockReturnValue(true);
            const data: DhtUpdateData = {
                locationBlock: { dhtSeq: 5, address: '1.2.3.4', signature: 'valid-sig' }
            };
            await handleDhtUpdate('peer-id', { dhtSeq: 10, publicKey: 'pubkey' } as DhtUpdateContact, data);
            expect(locationOps.updateContactDhtLocation).not.toHaveBeenCalled();
        });
    });

    describe('handleDhtExchange', () => {
        it('should ignore if peers array is missing', async () => {
            await handleDhtExchange('peer-id', {} as DhtExchangeData);
            expect(locationOps.updateContactDhtLocation).not.toHaveBeenCalled();
        });

        it('should process valid peers and skip invalid ones', async () => {
            vi.mocked(identity.getMyUPeerId).mockReturnValue('me');
            vi.mocked(contactsOps.getContactByUpeerId).mockImplementation(async (id: string) => {
                if (id === 'friend') return { upeerId: 'friend', publicKey: 'pk-friend', dhtSeq: 0 };
                return null;
            });
            vi.mocked(networkUtils.verifyLocationBlock).mockReturnValue(true);

            const peers = [
                { upeerId: 'me', publicKey: 'pk-me', locationBlock: {} }, // Skip myself
                { upeerId: 'unknown', publicKey: 'pk-unk', locationBlock: { dhtSeq: 1, address: 'a', signature: 's' } }, // Skip unknown
                { upeerId: 'friend', publicKey: 'pk-friend', locationBlock: { dhtSeq: 5, address: 'b', signature: 's' } } // Valid
            ];

            await handleDhtExchange('peer-id', { peers } as DhtExchangeData);
            expect(locationOps.updateContactDhtLocation).toHaveBeenCalledTimes(1);
            expect(locationOps.updateContactDhtLocation).toHaveBeenCalledWith('friend', 'b', 5, 's', undefined, undefined);
        });
    });

    describe('handleDhtQuery', () => {
        it('should return target info if connected', async () => {
            const targetId = 'target-peer';
            const mockTarget = {
                upeerId: targetId,
                status: 'connected',
                address: '10.0.0.1',
                dhtSeq: 100,
                dhtSignature: 'sig',
                dhtExpiresAt: 999,
                renewalToken: JSON.stringify({ key: 'val' }),
                publicKey: 'target-pk'
            };
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(mockTarget as never);

            const sendResponse = vi.fn();
            await handleDhtQuery('peer-id', { targetId } as DhtQueryData, '1.1.1.1', sendResponse);

            expect(sendResponse).toHaveBeenCalledWith('1.1.1.1', expect.objectContaining({
                type: 'DHT_RESPONSE',
                targetId,
                publicKey: 'target-pk',
                locationBlock: expect.objectContaining({
                    address: '10.0.0.1',
                    renewalToken: { key: 'val' }
                })
            }));
        });

        it('should return closest peers if target is not connected', async () => {
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(null);
            vi.mocked(contactsOps.getContacts).mockReturnValue([
                { upeerId: 'closer', status: 'connected', address: '2.2.2.2', dhtSeq: 1, dhtSignature: 's', publicKey: 'p' },
                { upeerId: 'farther', status: 'connected', address: '3.3.3.3', dhtSeq: 1, dhtSignature: 's', publicKey: 'p' },
                { upeerId: 'not-conn', status: 'disconnected' }
            ] as never);

            const targetId = '00000000'; // Close to nothing specifically here
            const sendResponse = vi.fn();
            await handleDhtQuery('peer-id', { targetId } as DhtQueryData, '1.1.1.1', sendResponse);

            expect(sendResponse).toHaveBeenCalledWith('1.1.1.1', expect.objectContaining({
                type: 'DHT_RESPONSE',
                targetId,
                neighbors: expect.any(Array)
            }));
        });
    });

    describe('handleDhtResponse', () => {
        it('should update location if locationBlock is present and valid', async () => {
            const targetId = 'target-id';
            const block = { dhtSeq: 10, address: '5.5.5.5', signature: 's' };
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({ upeerId: targetId, dhtSeq: 5, publicKey: 'pk' } as never);
            vi.mocked(networkUtils.verifyLocationBlock).mockReturnValue(true);

            await handleDhtResponse('peer-id', { targetId, locationBlock: block } as DhtResponseData, vi.fn());

            expect(locationOps.updateContactDhtLocation).toHaveBeenCalledWith(
                targetId, '5.5.5.5', 10, 's', undefined, undefined
            );
        });

        it('should process neighbors and send follow-up queries if unknown or newer', async () => {
            vi.mocked(identity.getMyUPeerId).mockReturnValue('me');
            vi.mocked(contactsOps.getContactByUpeerId).mockImplementation(async (id: string) => {
                if (id === 'known-older') return { upeerId: 'known-older', dhtSeq: 1, address: '3.3.3.3' };
                return null; // Unknown
            });

            const neighbors = [
                { upeerId: 'me', locationBlock: { address: '1.1.1.1' } },
                { upeerId: 'unknown', locationBlock: { address: '2.2.2.2', dhtSeq: 10, signature: 's' } },
                { upeerId: 'known-older', locationBlock: { address: '3.3.3.3', dhtSeq: 10, signature: 's' } }
            ];

            const sendResponse = vi.fn();
            await handleDhtResponse('peer-id', { targetId: 'search-target', neighbors } as DhtResponseData, sendResponse);

            // Should query unknown
            expect(sendResponse).toHaveBeenCalledWith('2.2.2.2', { type: 'DHT_QUERY', targetId: 'search-target' });
            // Should query known-older and update location
            expect(sendResponse).toHaveBeenCalledWith('3.3.3.3', { type: 'DHT_QUERY', targetId: 'search-target' });
            expect(locationOps.updateContactDhtLocation).toHaveBeenCalledWith('known-older', '3.3.3.3', 10, 's', undefined);
        });
    });
});
