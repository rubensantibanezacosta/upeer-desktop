import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.unmock('sodium-native');

import { decryptGroupMessage, encryptGroupMessage } from '../../../src/main_process/network/groupState.js';

type GroupMessageVector = {
    generatedBy: string;
    senderKey: string;
    plaintext: string;
    nonce: string;
    ciphertext: string;
};

const fixture = (): GroupMessageVector => JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../fixtures/group-message-go.json'), 'utf8'),
) as GroupMessageVector;

describe('mensaje de grupo generado por el puente', () => {
    it('lo descifra el escritorio con la misma clave de emisor', () => {
        const vector = fixture();

        expect(decryptGroupMessage(vector.nonce, vector.ciphertext, vector.senderKey)).toBe(vector.plaintext);
    });

    it('declara el generador para que no se confunda con un vector propio', () => {
        expect(fixture().generatedBy).toBe('upper/transport-bridge');
    });

    it('no se abre con otra clave de emisor', () => {
        const vector = fixture();

        expect(decryptGroupMessage(vector.nonce, vector.ciphertext, '11'.repeat(32))).toBeNull();
    });

    it('no se abre con el sobre alterado', () => {
        const vector = fixture();
        const tampered = `${vector.ciphertext.slice(0, -2)}00`;

        expect(decryptGroupMessage(vector.nonce, tampered, vector.senderKey)).toBeNull();
    });

    it('viaja en el mismo formato que produce el escritorio', () => {
        const vector = fixture();
        const { nonce, ciphertext } = encryptGroupMessage(vector.plaintext, vector.senderKey);

        expect(nonce).toMatch(/^[0-9a-f]{48}$/);
        expect(ciphertext).toMatch(/^[0-9a-f]+$/);
        expect(decryptGroupMessage(nonce, ciphertext, vector.senderKey)).toBe(vector.plaintext);
    });
});
