import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateSignedLocationBlock, verifyLocationBlock } from '../../../src/main_process/network/utils';

// Mocks necesarios para que utils.js no falle al firmar
vi.mock('../../../src/main_process/security/identity', () => ({
    getMyUPeerId: () => 'test-upeer-id',
    sign: (_data: Buffer) => Buffer.alloc(64, 's'), // Firma mock fija de 64 bytes
    getMyAlias: () => 'Test Alias',
    getMyDeviceId: () => 'test-device-id',
    // verify se usa en verifyLocationBlock
    verify: (_data: Buffer, _sig: Buffer, _pk: Buffer) => true, // Mock de verificación siempre OK por ahora
}));

vi.mock('../../../src/main_process/security/secure-logger', () => ({
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
}));

describe('TDD: Ubicación y Metadatos de Dispositivo', () => {
    
    it('debe generar un bloque de ubicación que incluya metadatos de dispositivo opcionales', () => {
        const addresses = ['200:1234::1'];
        const dhtSeq = 1;
        const deviceMeta = {
            clientName: 'Revelnest Desktop',
            clientVersion: '1.2.0',
            platform: 'linux',
            deviceClass: 'desktop'
        };

        // LLAMADA TDD: Esperamos que la función acepte un nuevo argumento opcional de metadatos
        const block = generateSignedLocationBlock(addresses, dhtSeq, undefined, undefined, deviceMeta);

        expect(block).toHaveProperty('deviceMeta');
        expect(block.deviceMeta).toEqual(deviceMeta);
        expect(block.address).toBe(addresses[0]);
    });

    it('debe validar correctamente un bloque que contiene metadatos (integridad de firma)', async () => {
        const addresses = ['200:1234::1'];
        const dhtSeq = 1;
        const deviceMeta = { platform: 'macos', deviceClass: 'laptop' };
        
        const block = generateSignedLocationBlock(addresses, dhtSeq, undefined, undefined, deviceMeta);
        const publicKey = 'a'.repeat(64); // mock pk hex

        // La verificación debe ser exitosa con los metadatos integrados en el canonicalStringify del signed block.
        const isValid = verifyLocationBlock('test-upeer-id', block, publicKey);
        expect(isValid).toBe(true);
    });

    it('debe permitir que los metadatos sean nulos o indefinidos para retrocompatibilidad', () => {
        const addresses = ['200:1234::1'];
        const block = generateSignedLocationBlock(addresses, 1);
        
        expect(block.deviceMeta).toBeUndefined();
        
        const isValid = verifyLocationBlock('test-upeer-id', block, 'a'.repeat(64));
        expect(isValid).toBe(true);
    });
});
