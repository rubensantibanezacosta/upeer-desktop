import { describe, expect, it } from 'vitest';
import { getAudioEncoderConfig } from '../../../../src/features/call/audioCodecConfig.js';

describe('getAudioEncoderConfig', () => {
    it('configura Opus mono a 64 kbps para voz y conserva la frecuencia de captura', () => {
        expect(getAudioEncoderConfig('audio', 48000, 1)).toEqual({
            codec: 'opus',
            sampleRate: 48000,
            numberOfChannels: 1,
            bitrate: 64000,
        });
    });

    it('reserva un bitrate mayor para el audio del sistema compartido', () => {
        expect(getAudioEncoderConfig('screen-audio', 48000, 2)).toEqual({
            codec: 'opus',
            sampleRate: 48000,
            numberOfChannels: 2,
            bitrate: 96000,
        });
    });
});