import { describe, expect, it, vi, beforeEach } from 'vitest';

function makeAudioCtx() {
    return {
        state: 'running',
        currentTime: 0,
        destination: {},
        createOscillator: vi.fn(() => ({
            connect: vi.fn(),
            type: '',
            frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
            start: vi.fn(),
            stop: vi.fn(),
        })),
        createGain: vi.fn(() => ({
            connect: vi.fn(),
            gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        })),
        resume: vi.fn().mockResolvedValue(undefined),
    };
}

describe('notificationSound', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.unstubAllGlobals();
    });

    it('crea un AudioContext y dispara el beep', async () => {
        const ctx = makeAudioCtx();
        vi.stubGlobal('AudioContext', class { constructor() { Object.assign(this, ctx); } });

        const { playNotificationSound } = await import('../../../src/utils/notificationSound.js');
        playNotificationSound();

        expect(ctx.createOscillator).toHaveBeenCalled();
        expect(ctx.createGain).toHaveBeenCalled();
    });

    it('reanuda el contexto cuando está suspendido', async () => {
        const ctx = makeAudioCtx();
        ctx.state = 'suspended';
        vi.stubGlobal('AudioContext', class { constructor() { Object.assign(this, ctx); } });

        const { playNotificationSound } = await import('../../../src/utils/notificationSound.js');
        playNotificationSound();

        expect(ctx.resume).toHaveBeenCalled();
    });

    it('no lanza si AudioContext no está disponible y loguea el error', async () => {
        vi.stubGlobal('AudioContext', undefined);
        const logger = { warn: vi.fn() };
        (window as unknown as { logger?: typeof logger }).logger = logger;

        const { playNotificationSound } = await import('../../../src/utils/notificationSound.js');
        expect(() => playNotificationSound()).not.toThrow();
        expect(logger.warn).toHaveBeenCalled();
    });
});
