import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('sodium-native');
import {
    findAccountRegistry,
    resetAccountRegistryCache,
} from '../../../src/main_process/network/accountRegistry.js';
import { setKademliaInstance } from '../../../src/main_process/network/dht/shared.js';

type AccountVector = {
    now: number;
    accountUpeerId: string;
    registry: Record<string, unknown>;
};

const vector = JSON.parse(
    fs.readFileSync(path.resolve('tests/fixtures/dht-account-go.json'), 'utf8'),
) as AccountVector;

describe('account registry cache', () => {
    beforeEach(() => {
        resetAccountRegistryCache();
    });

    afterEach(() => {
        setKademliaInstance(null);
    });

    it('reevalúa el registro cada 60 segundos para propagar epoch y revocaciones', async () => {
        let calls = 0;
        setKademliaInstance({
            findValue: async () => {
                calls += 1;
                return { value: vector.registry, publisher: vector.accountUpeerId };
            },
        } as never);

        await expect(findAccountRegistry(vector.accountUpeerId, vector.now)).resolves.not.toBeNull();
        await expect(findAccountRegistry(vector.accountUpeerId, vector.now + 30_000)).resolves.not.toBeNull();
        expect(calls).toBe(1);

        await expect(findAccountRegistry(vector.accountUpeerId, vector.now + 60_001)).resolves.not.toBeNull();
        expect(calls).toBe(2);
    });

    it('no conserva el registro cacheado si el DHT deja de devolverlo', async () => {
        let value: Record<string, unknown> | null = vector.registry;
        let calls = 0;
        setKademliaInstance({
            findValue: async () => {
                calls += 1;
                return value ? { value, publisher: vector.accountUpeerId } : null;
            },
        } as never);

        await expect(findAccountRegistry(vector.accountUpeerId, vector.now)).resolves.not.toBeNull();
        value = null;

        await expect(findAccountRegistry(vector.accountUpeerId, vector.now + 60_001)).resolves.toBeNull();
        expect(calls).toBe(2);
    });
});
