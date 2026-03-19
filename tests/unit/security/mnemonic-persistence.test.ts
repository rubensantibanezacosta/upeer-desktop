import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import * as identity from '../../../src/main_process/security/identity.js';

describe('Identity Mnemonic Persistence (TDD)', () => {
    let tempDir: string;
    // Semilla de 12 palabras válida (bip39)
    const mnemonic = 'setup picture close amazing exotic energy elite card tuna cage step exact';

    beforeEach(() => {
        tempDir = path.join(os.tmpdir(), `upeer-test-${Math.random().toString(36).slice(2)}`);
        fs.mkdirSync(tempDir, { recursive: true });
        vi.resetModules();
    });

    it('should persist and RECOVER mnemonic after "restart" (initIdentity)', () => {
        // 1. Inicializar y crear identidad
        identity.initIdentity(tempDir);
        identity.unlockSession(mnemonic);

        console.log('Mnemonic in memory after unlock:', identity.getMnemonic());
        expect(identity.getMnemonic()).toBe(mnemonic);

        // 2. Simular reinicio de la aplicación (nueva inicialización sobre el mismo directorio)
        identity.initIdentity(tempDir);

        console.log('Mnemonic in memory after "restart":', identity.getMnemonic());
        const recoveredMnemonic = identity.getMnemonic();
        expect(recoveredMnemonic).toBe(mnemonic);
    });

    it('should NOT return mnemonic if session is explicitly locked', () => {
        identity.initIdentity(tempDir);
        identity.unlockSession(mnemonic);
        identity.lockSession();

        identity.initIdentity(tempDir);
        expect(identity.getMnemonic()).toBeNull();
    });
});
