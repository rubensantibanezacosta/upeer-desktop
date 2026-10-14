import { describe, expect, it } from 'vitest';
import {
    callMediaSignatureValue,
    decodeBinaryCallMedia,
    encodeBinaryCallMedia,
    hashCallMedia,
} from '../../../src/main_process/network/binaryCallMedia.js';

describe('binary call media framing', () => {
    it('encodes metadata separately from raw media bytes', () => {
        const payload = new Uint8Array([0, 1, 127, 255]);
        const encoded = encodeBinaryCallMedia({ type: 'CALL_MEDIA', callId: 'call-1', mediaHash: hashCallMedia(payload) }, payload);
        const decoded = decodeBinaryCallMedia(encoded);

        expect(decoded).toMatchObject({ type: 'CALL_MEDIA', callId: 'call-1' });
        expect(Array.from(decoded?.data as Uint8Array)).toEqual(Array.from(payload));
    });

    it('rejects a payload whose bytes do not match the signed digest', () => {
        const encoded = encodeBinaryCallMedia(
            { type: 'CALL_MEDIA', callId: 'call-1', mediaHash: hashCallMedia(new Uint8Array([1])) },
            new Uint8Array([2]),
        );

        expect(decodeBinaryCallMedia(encoded)).toBeNull();
    });

    it('signs the same canonical metadata that the receiver verifies', () => {
        const packet = { type: 'CALL_MEDIA', callId: 'call-1', mediaHash: 'a'.repeat(64), senderUpeerId: 'peer' };
        expect(callMediaSignatureValue(packet)).toBe('{"callId":"call-1","mediaHash":"' + 'a'.repeat(64) + '","senderUpeerId":"peer","type":"CALL_MEDIA"}');
    });
});