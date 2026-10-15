import { beforeEach, describe, expect, it } from 'vitest';
import { CallFanoutPolicy } from '../../../src/main_process/network/call/callFanoutPolicy.js';

describe('CallFanoutPolicy', () => {
    let policy: CallFanoutPolicy;

    beforeEach(() => {
        policy = new CallFanoutPolicy();
    });

    it('prioriza los tres hablantes activos más recientes', () => {
        policy.setSpeakerActive('call', 'a', true, 10_000);
        policy.setSpeakerActive('call', 'b', true, 10_100);
        policy.setSpeakerActive('call', 'c', true, 10_200);
        policy.setSpeakerActive('call', 'd', true, 10_300);

        expect(policy.shouldForwardVideo('call', 'd', makeFrame(1, false), 10_300)).toBe(true);
        expect(policy.shouldForwardVideo('call', 'a', makeFrame(1, false), 10_300)).toBe(false);
        expect(policy.shouldForwardVideo('call', 'a', makeFrame(1, true), 10_300)).toBe(true);
        expect(policy.shouldForwardVideo('call', 'a', makeFrame(1, true), 11_000)).toBe(false);
        expect(policy.shouldForwardVideo('call', 'b', makeFrame(1, false), 10_300)).toBe(true);
        expect(policy.shouldForwardVideo('call', 'c', makeFrame(1, false), 10_300)).toBe(true);
    });

    it('reenvía audio siempre y limita fotogramas fijos a uno por intervalo', () => {
        const audio = makeFrame(0, false);
        const keyFrame = makeFrame(1, true);
        const deltaFrame = makeFrame(1, false);

        expect(policy.shouldForwardVideo('call', 'peer', audio, 10_000)).toBe(true);
        expect(policy.shouldForwardVideo('call', 'peer', keyFrame, 10_000)).toBe(true);
        expect(policy.shouldForwardVideo('call', 'peer', keyFrame, 11_000)).toBe(false);
        expect(policy.shouldForwardVideo('call', 'peer', deltaFrame, 11_000)).toBe(false);
        expect(policy.shouldForwardVideo('call', 'peer', keyFrame, 13_000)).toBe(true);
    });

    it('no comparte actividad entre llamadas y libera su estado al terminar', () => {
        policy.setSpeakerActive('call-a', 'peer', true, 1000);
        const video = makeFrame(1, false);

        expect(policy.shouldForwardVideo('call-b', 'peer', video, 10_000)).toBe(false);
        policy.removeCall('call-a');
        expect(policy.shouldForwardVideo('call-a', 'peer', makeFrame(1, true), 10_000)).toBe(true);
    });
});

function makeFrame(kind: number, keyFrame: boolean): Uint8Array {
    const frame = new Uint8Array(17);
    frame[0] = kind;
    frame[1] = keyFrame ? 1 : 0;
    frame[16] = 1;
    return frame;
}