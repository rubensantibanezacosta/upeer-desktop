import { beforeEach, describe, expect, it, vi } from 'vitest';

const winSend = vi.fn();
const win = {
    webContents: { send: winSend },
    isDestroyed: () => false,
};

vi.mock('electron', () => ({ BrowserWindow: class {} }));
vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn(), network: vi.fn(), security: vi.fn(),
}));
vi.mock('../../../src/main_process/security/identity.js', () => ({
    verify: vi.fn(() => true),
    getMyUPeerId: vi.fn(() => 'my-id'),
    setMyAlias: vi.fn(),
    setMyAvatar: vi.fn(),
}));
vi.mock('../../../src/main_process/network/call/callManager.js', () => ({
    callManager: {
        getActive: vi.fn(() => null),
        hasActiveWith: vi.fn(() => false),
        create: vi.fn(),
        createGroup: vi.fn(),
        createGroupIncoming: vi.fn(() => ({ callId: 'call-1', kind: 'video', peerUpeerId: 'peer-1', groupMembers: [] })),
        accept: vi.fn(),
        connect: vi.fn(),
        joinGroup: vi.fn(),
        leaveGroup: vi.fn(),
        setRelayUpeer: vi.fn(),
        get: vi.fn(() => null),
    },
}));
vi.mock('../../../src/main_process/network/call/callSignaling.js', () => ({
    sendCallBusy: vi.fn(),
    sendCallMediaTo: vi.fn(),
    sendCallMeta: vi.fn(),
    sendCallRing: vi.fn(),
    recomputeRelay: vi.fn(async () => ''),
}));
vi.mock('../../../src/main_process/network/call/validationCalls.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../src/main_process/network/call/validationCalls.js')>();
    return { ...actual };
});

import { routeVerifiedPacket } from '../../../src/main_process/network/verifiedPacketRouter.js';

const baseArgs = {
    upeerId: 'peer-1',
    contact: { publicKey: 'aa'.repeat(32) },
    signature: 'sig',
    rinfo: { address: '200::peer', port: 50000 },
    sendResponse: vi.fn(),
};

describe('verifiedPacketRouter: enrutado de CALL_SDP y CALL_ICE', () => {
    beforeEach(() => {
        winSend.mockReset();
    });

    it('enruta CALL_SDP a handleCallPacket y emite call-sdp al renderer', async () => {
        const data = {
            type: 'CALL_SDP',
            callId: 'call-1',
            sdp: { type: 'offer', sdp: 'v=0\r\n' },
        };
        await routeVerifiedPacket({ ...baseArgs, data, win: win as never });
        expect(winSend).toHaveBeenCalledWith('call-sdp', expect.objectContaining({ callId: 'call-1', peerUpeerId: 'peer-1' }));
    });

    it('enruta CALL_ICE a handleCallPacket y emite call-ice al renderer', async () => {
        const data = {
            type: 'CALL_ICE',
            callId: 'call-1',
            candidate: { candidate: 'candidate:1', sdpMid: '0' },
        };
        await routeVerifiedPacket({ ...baseArgs, data, win: win as never });
        expect(winSend).toHaveBeenCalledWith('call-ice', expect.objectContaining({ callId: 'call-1', peerUpeerId: 'peer-1' }));
    });

    it('no descarta CALL_SDP en el default (antes caia y no se veia video)', async () => {
        const data = {
            type: 'CALL_SDP',
            callId: 'call-1',
            sdp: { type: 'answer', sdp: 'v=0\r\n' },
        };
        await routeVerifiedPacket({ ...baseArgs, data, win: win as never });
        expect(winSend).toHaveBeenCalledWith('call-sdp', expect.anything());
        expect(winSend).not.toHaveBeenCalledWith(expect.stringMatching(/call-sdp/), expect.objectContaining({ error: expect.anything() }));
    });
});
