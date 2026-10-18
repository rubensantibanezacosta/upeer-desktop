const VOICE_OPUS_BITRATE = 64_000;
const SCREEN_AUDIO_OPUS_BITRATE = 96_000;

export function getAudioEncoderConfig(
    captureId: string,
    sampleRate: number,
    numberOfChannels: number,
): { codec: 'opus'; sampleRate: number; numberOfChannels: number; bitrate: number } {
    return {
        codec: 'opus',
        sampleRate,
        numberOfChannels,
        bitrate: captureId === 'screen-audio' ? SCREEN_AUDIO_OPUS_BITRATE : VOICE_OPUS_BITRATE,
    };
}