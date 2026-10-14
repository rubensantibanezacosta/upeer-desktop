import { describe, expect, it } from 'vitest';
import { clearCallMediaAssemblies, fragmentCallMediaPacket, reassembleCallMediaDatagram } from '../../../src/main_process/network/server/callMediaFragments.js';

describe('CALL_MEDIA UDP fragmentation', () => {
    it('fragments large signed packets into MTU-sized datagrams and reassembles out of order', () => {
        const packet = Buffer.from(Array.from({ length: 20_000 }, (_, index) => index % 251));
        const fragments = fragmentCallMediaPacket(packet);

        expect(fragments.length).toBeGreaterThan(1);
        expect(fragments.every((fragment) => fragment.length <= 1200)).toBe(true);

        let assembled: Buffer | null = null;
        for (const fragment of [...fragments].reverse()) assembled = reassembleCallMediaDatagram(fragment) ?? assembled;
        expect(assembled).toEqual(packet);
    });

    it('passes small packets unchanged and rejects packets beyond the hard maximum', () => {
        const small = Buffer.from([1, 2, 3]);
        expect(fragmentCallMediaPacket(small)).toEqual([small]);
        expect(() => fragmentCallMediaPacket(Buffer.alloc(600_001))).toThrow('exceeds UDP fragmentation limits');
    });

    it('releases incomplete assemblies during shutdown cleanup', () => {
        const fragment = fragmentCallMediaPacket(Buffer.alloc(5000))[0];
        if (!fragment) throw new Error('Expected a fragment');
        expect(reassembleCallMediaDatagram(fragment)).toBeNull();
        clearCallMediaAssemblies();
        expect(reassembleCallMediaDatagram(fragment)).toBeNull();
    });
});