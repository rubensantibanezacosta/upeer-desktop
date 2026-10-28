import { describe, expect, it } from 'vitest';
import {
    MIN_STREAM_PREVIEW_BYTES,
    canStreamPreview,
    contiguousPrefix,
    isStreamableMime,
} from '../../../src/main_process/network/file-transfer/streamPreview.js';
import { resolveMediaRange } from '../../../src/main_process/core/mediaRange.js';

describe('contiguousPrefix', () => {
    it('devuelve cero sin chunks recibidos', () => {
        expect(contiguousPrefix(undefined, 1024, 10_000)).toEqual({ chunks: 0, bytes: 0 });
        expect(contiguousPrefix(new Set<number>(), 1024, 10_000)).toEqual({ chunks: 0, bytes: 0 });
    });

    it('cuenta solo el prefijo contiguo', () => {
        expect(contiguousPrefix(new Set([0, 1, 2, 5, 6]), 1024, 10_000)).toEqual({ chunks: 3, bytes: 3072 });
    });

    it('no avanza si falta el primer chunk', () => {
        expect(contiguousPrefix(new Set([1, 2, 3]), 1024, 10_000)).toEqual({ chunks: 0, bytes: 0 });
    });

    it('recorta los bytes al tamaño real del fichero', () => {
        const received = new Set([0, 1, 2]);
        expect(contiguousPrefix(received, 1024, 2_500).bytes).toBe(2_500);
    });

    it('tolera tamaños no válidos', () => {
        expect(contiguousPrefix(new Set([0]), 0, 10_000)).toEqual({ chunks: 0, bytes: 0 });
        expect(contiguousPrefix(new Set([0]), 1024, 0)).toEqual({ chunks: 0, bytes: 0 });
        expect(contiguousPrefix(new Set([0]), Number.NaN, 10_000)).toEqual({ chunks: 0, bytes: 0 });
    });
});

describe('canStreamPreview', () => {
    it('exige un mínimo para que merezca la pena abrir el reproductor', () => {
        expect(canStreamPreview({ chunks: 0, bytes: 0 })).toBe(false);
        expect(canStreamPreview({ chunks: 1, bytes: MIN_STREAM_PREVIEW_BYTES - 1 })).toBe(false);
        expect(canStreamPreview({ chunks: 9, bytes: MIN_STREAM_PREVIEW_BYTES })).toBe(true);
    });
});

describe('isStreamableMime', () => {
    it('acepta vídeo por mime o por extensión', () => {
        expect(isStreamableMime('video/mp4', 'a.bin')).toBe(true);
        expect(isStreamableMime('application/octet-stream', 'clip.MKV')).toBe(true);
        expect(isStreamableMime(undefined, 'clip.mov')).toBe(true);
    });

    it('rechaza lo que no es vídeo', () => {
        expect(isStreamableMime('image/png', 'foto.png')).toBe(false);
        expect(isStreamableMime('application/pdf', 'doc.pdf')).toBe(false);
        expect(isStreamableMime(null, null)).toBe(false);
    });
});

describe('resolveMediaRange', () => {
    it('sirve el fichero completo sin range ni límite', () => {
        expect(resolveMediaRange(1000, null)).toEqual({ status: 200, start: 0, end: 999, size: 1000 });
    });

    it('aplica el límite al tamaño anunciado', () => {
        expect(resolveMediaRange(1000, null, 400)).toEqual({ status: 200, start: 0, end: 399, size: 400 });
    });

    it('ignora un límite mayor que el fichero', () => {
        expect(resolveMediaRange(1000, null, 5000)?.size).toBe(1000);
    });

    it('recorta un range que se pasa del límite', () => {
        expect(resolveMediaRange(1000, 'bytes=0-', 400)).toEqual({ status: 206, start: 0, end: 399, size: 400 });
        expect(resolveMediaRange(1000, 'bytes=100-900', 400)).toEqual({ status: 206, start: 100, end: 399, size: 400 });
    });

    it('rechaza rangos fuera del límite y ficheros vacíos', () => {
        expect(resolveMediaRange(1000, 'bytes=500-600', 400)).toBeNull();
        expect(resolveMediaRange(1000, null, 0)?.size).toBe(1000);
        expect(resolveMediaRange(0, null)).toBeNull();
        expect(resolveMediaRange(Number.NaN, null)).toBeNull();
    });

    it('rechaza rangos invertidos o mal formados', () => {
        expect(resolveMediaRange(1000, 'bytes=800-100')).toBeNull();
        expect(resolveMediaRange(1000, 'bytes=abc-')).toBeNull();
    });
});
