import { describe, expect, it, vi, beforeEach } from 'vitest';

type MockCtx = {
    drawImage: ReturnType<typeof vi.fn>;
    translate: ReturnType<typeof vi.fn>;
    rotate: ReturnType<typeof vi.fn>;
    clearRect: ReturnType<typeof vi.fn>;
    beginPath: ReturnType<typeof vi.fn>;
    moveTo: ReturnType<typeof vi.fn>;
    lineTo: ReturnType<typeof vi.fn>;
    stroke: ReturnType<typeof vi.fn>;
    fillText: ReturnType<typeof vi.fn>;
    [key: string]: unknown;
};

type MockCanvas = {
    width: number;
    height: number;
    ctx: MockCtx;
    getContext: ReturnType<typeof vi.fn>;
    toDataURL: ReturnType<typeof vi.fn>;
};

const originalCreateElement = document.createElement.bind(document);

function installMockCanvas() {
    const ctx: MockCtx = {
        drawImage: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        clearRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        fillText: vi.fn(),
    };
    const canvas: MockCanvas = {
        width: 0,
        height: 0,
        ctx,
        getContext: vi.fn(() => ctx as unknown as CanvasRenderingContext2D | null),
        toDataURL: vi.fn(() => 'data:image/png;base64,img'),
    };
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
        if (tagName === 'canvas') return canvas as unknown as HTMLCanvasElement;
        return originalCreateElement(tagName);
    }) as never);
    return canvas;
}

function installMockImage() {
    const created: Array<{ onload: (() => void) | null; src: string }> = [];
    vi.stubGlobal('Image', class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        src = '';
        naturalWidth = 200;
        naturalHeight = 100;
        clientWidth = 200;
        clientHeight = 100;
        constructor() {
            created.push(this);
        }
    });
    return created;
}

describe('imageEditSupport', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('cropImageToDataUrl recorta al centro y devuelve el data URL', async () => {
        const { cropImageToDataUrl } = await import('../../../../../src/features/chat/file-preview/imageEditSupport.js');
        const canvas = installMockCanvas();

        const img = {
            naturalWidth: 200,
            naturalHeight: 100,
            clientWidth: 200,
            clientHeight: 100,
        } as HTMLImageElement;

        const result = cropImageToDataUrl(img, { x: 10, y: 5, w: 40, h: 20 });

        expect(result).toBe('data:image/png;base64,img');
        expect(canvas.width).toBe(40);
        expect(canvas.height).toBe(20);
        expect(canvas.ctx.drawImage).toHaveBeenCalled();
    });

    it('cropImageToDataUrl devuelve null si no hay contexto 2d', async () => {
        const { cropImageToDataUrl } = await import('../../../../../src/features/chat/file-preview/imageEditSupport.js');
        const canvas = installMockCanvas();
        canvas.getContext.mockReturnValue(null);

        const img = {
            naturalWidth: 200,
            naturalHeight: 100,
            clientWidth: 200,
            clientHeight: 100,
        } as HTMLImageElement;

        expect(cropImageToDataUrl(img, { x: 0, y: 0, w: 10, h: 10 })).toBeNull();
    });

    it('rotateImageToDataUrl rota 90 grados y permuta dimensiones para imágenes no cuadradas', async () => {
        const { rotateImageToDataUrl } = await import('../../../../../src/features/chat/file-preview/imageEditSupport.js');
        const canvas = installMockCanvas();

        const img = { naturalWidth: 200, naturalHeight: 100 } as HTMLImageElement;

        const result = rotateImageToDataUrl(img);

        expect(result).toBe('data:image/png;base64,img');
        expect(canvas.width).toBe(100);
        expect(canvas.height).toBe(200);
        expect(canvas.ctx.translate).toHaveBeenCalledWith(50, 100);
        expect(canvas.ctx.rotate).toHaveBeenCalledWith(Math.PI / 2);
    });

    it('drawStrokesOnCanvas dibuja cada trazo con lineCap redondeado', async () => {
        const { drawStrokesOnCanvas } = await import('../../../../../src/features/chat/file-preview/imageEditSupport.js');
        const canvas = installMockCanvas();
        canvas.width = 200;
        canvas.height = 100;

        drawStrokesOnCanvas(canvas as unknown as HTMLCanvasElement, [
            [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }],
        ], '#123456');

        expect(canvas.ctx.clearRect).toHaveBeenCalledWith(0, 0, 200, 100);
        expect(canvas.ctx.strokeStyle).toBe('#123456');
        expect(canvas.ctx.lineCap).toBe('round');
        expect(canvas.ctx.moveTo).toHaveBeenCalledWith(20, 10);
        expect(canvas.ctx.lineTo).toHaveBeenCalledWith(100, 50);
        expect(canvas.ctx.stroke).toHaveBeenCalled();
    });

    it('composeDrawingWithStrokes compone la imagen de origen y los trazos', async () => {
        const { composeDrawingWithStrokes } = await import('../../../../../src/features/chat/file-preview/imageEditSupport.js');
        const canvas = installMockCanvas();

        const createdImages = installMockImage();

        const promise = composeDrawingWithStrokes('data:image/png;base64,src', [
            [{ x: 0.1, y: 0.1 }],
        ]);
        createdImages[0]?.onload?.();

        const result = await promise;

        expect(result).toBe('data:image/png;base64,img');
        expect(canvas.width).toBe(200);
        expect(canvas.ctx.drawImage).toHaveBeenCalled();
    });
});
