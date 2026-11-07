import { describe, expect, it } from 'vitest';

import {
    FILE_CHUNK,
    FILE_CHUNK_BATCH_LIMIT,
    parseFileChunks,
} from '../../../src/main_process/network/sync/files/packets.js';

/**
 * Lo que el móvil emite tiene que poder leerlo el escritorio.
 *
 * El móvil agrupa varios tramos en un frame (`batch`) desde el 08/11 para no pagar una vuelta de
 * ratchet por cada trozo de 192 KB. Antes de este cambio el escritorio solo leía `data`, así que un
 * lote habría llegado como frame sin datos y se habría descartado **en silencio**: la transferencia
 * se quedaría muda, sin error visible. Estos casos fijan el formato que cruza el cable.
 */
describe('interoperabilidad del lote de tramos móvil → escritorio', () => {
    const requestId = 'abc12345';

    /** Mismo sobre que arma `SyncFilePackets.chunkBatch` en Kotlin. */
    const mobileBatch = (indices: number[], bytesPerChunk = 16) => ({
        type: FILE_CHUNK,
        requestId,
        batch: indices.map(index => ({
            index,
            data: Buffer.alloc(bytesPerChunk, index).toString('base64'),
        })),
    });

    it('el escritorio reensambla un lote del móvil con sus índices', () => {
        const chunks = parseFileChunks(mobileBatch([0, 1, 2]));

        expect(chunks.map(chunk => chunk.index)).toEqual([0, 1, 2]);
        expect(chunks.every(chunk => chunk.requestId === requestId)).toBe(true);
        expect(Buffer.from(chunks[1].data, 'base64')[0]).toBe(1);
    });

    it('acepta un lote incompleto (el último del fichero)', () => {
        const chunks = parseFileChunks(mobileBatch([138, 139, 140, 141]));

        expect(chunks).toHaveLength(4);
        expect(chunks.at(-1)?.index).toBe(141);
    });

    it('acepta el mismo número máximo de tramos que el móvil agrupa', () => {
        const indices = Array.from({ length: FILE_CHUNK_BATCH_LIMIT }, (_, i) => i);
        expect(parseFileChunks(mobileBatch(indices))).toHaveLength(FILE_CHUNK_BATCH_LIMIT);

        // Uno más se rechaza: los dos extremos tienen el mismo tope.
        const tooMany = Array.from({ length: FILE_CHUNK_BATCH_LIMIT + 1 }, (_, i) => i);
        expect(parseFileChunks(mobileBatch(tooMany))).toEqual([]);
    });

    it('un frame de un solo tramo (formato anterior) sigue funcionando', () => {
        const single = { type: FILE_CHUNK, requestId, index: 7, data: 'AAAAAAAAAAAAAAAAAAAAAA==' };

        const chunks = parseFileChunks(single);

        expect(chunks).toHaveLength(1);
        expect(chunks[0].index).toBe(7);
    });

    it('un lote manipulado no produce tramos', () => {
        const tampered = mobileBatch([0, 1]);
        tampered.batch[1].index = -1;

        expect(parseFileChunks(tampered)).toEqual([]);
    });
});
