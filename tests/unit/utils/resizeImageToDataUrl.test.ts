import { describe, expect, it, vi, beforeEach } from 'vitest';

type MockCanvas = {
    width: number;
    height: number;
    getContext: ReturnType<typeof vi.fn>;
    toDataURL: ReturnType<typeof vi.fn>;
};

const originalCreateElement = document.createElement.bind(document);

function installMockCanvas() {
    const canvas: MockCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => ({ drawImage: vi.fn() }) as unknown as CanvasRenderingContext2D | null),
        toDataURL: vi.fn(() => 'data:image/jpeg;base64,resized'),
    };
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
        if (tagName === 'canvas') return canvas as unknown as HTMLCanvasElement;
        return originalCreateElement(tagName);
    }) as never);
    return canvas;
}

describe('resizeImageToDataUrl', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('rechaza cuando el archivo supera maxBytes', async () => {
        const { resizeImageToDataUrl } = await import('../../../src/utils/resizeImageToDataUrl.js');
        const bigFile = { size: 20 * 1024 * 1024 } as File;

        await expect(resizeImageToDataUrl(bigFile)).rejects.toThrow('File too large');
    });

    it('lee el archivo, dibuja el recorte centrado y devuelve un data URL', async () => {
        const { resizeImageToDataUrl } = await import('../../../src/utils/resizeImageToDataUrl.js');
        const canvas = installMockCanvas();

        const createdImages: Array<{ onload: (() => void) | null; onerror: (() => void) | null; src: string }> = [];
        vi.stubGlobal('Image', class {
            private s = { onload: null as (() => void) | null, onerror: null as (() => void) | null, src: '' };
            width = 200;
            height = 100;
            constructor() { createdImages.push(this); }
            set onload(fn: (() => void) | null) { this.s.onload = fn; }
            get onload() { return this.s.onload; }
            set onerror(fn: (() => void) | null) { this.s.onerror = fn; }
            get onerror() { return this.s.onerror; }
            set src(v: string) { this.s.src = v; }
            get src() { return this.s.src; }
        });

        const reader = {
            onload: null as null | ((e: { target: { result: string } }) => void),
            onerror: null as null | (() => void),
        };
        vi.stubGlobal('FileReader', class {
            set onload(fn: ((e: { target: { result: string } }) => void) | null) { reader.onload = fn; }
            get onload() { return reader.onload; }
            set onerror(fn: (() => void) | null) { reader.onerror = fn; }
            get onerror() { return reader.onerror; }
            readAsDataURL() {
                reader.onload?.({ target: { result: 'data:image/png;base64,abc' } });
            }
        });

        const file = { size: 100 } as File;
        const promise = resizeImageToDataUrl(file, { size: 64 });

        // El FileReader dispara onload síncrono que asigna image.onload; lo invocamos para resolver
        createdImages[0]?.onload?.();

        await expect(promise).resolves.toBe('data:image/jpeg;base64,resized');
        expect(canvas.width).toBe(64);
        expect(canvas.height).toBe(64);
        expect(canvas.getContext).toHaveBeenCalledWith('2d');
        expect(canvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.85);
    });
});
