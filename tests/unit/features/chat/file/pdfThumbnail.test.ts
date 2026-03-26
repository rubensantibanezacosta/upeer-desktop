import { describe, expect, it, vi, beforeEach } from 'vitest';

const getPage = vi.fn();
const destroy = vi.fn().mockResolvedValue(undefined);
const getDocument = vi.fn(() => ({
    promise: Promise.resolve({
        getPage,
        destroy,
    }),
}));

vi.mock('pdfjs-dist', () => ({
    getDocument,
}));

describe('generatePdfThumbnail', () => {
    beforeEach(() => {
        getPage.mockReset();
        destroy.mockClear();
        vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
            if (tagName === 'canvas') {
                return {
                    width: 0,
                    height: 0,
                    getContext: vi.fn(() => ({})),
                    toDataURL: vi.fn(() => 'data:image/jpeg;base64,pdf-thumb'),
                } as any;
            }
            return document.createElementNS('http://www.w3.org/1999/xhtml', tagName);
        }) as any);
    });

    it('renders the first pdf page to a jpeg thumbnail', async () => {
        const render = vi.fn().mockReturnValue({ promise: Promise.resolve() });
        getPage.mockResolvedValue({
            getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
            render,
        });

        const { generatePdfThumbnail } = await import('../../../../../src/features/chat/file/pdfThumbnail');
        const thumbnail = await generatePdfThumbnail('media:///tmp/manual.pdf');

        expect(getDocument).toHaveBeenCalledWith(expect.objectContaining({ url: 'media:///tmp/manual.pdf' }));
        expect(render).toHaveBeenCalled();
        expect(thumbnail.startsWith('data:image/jpeg;base64,')).toBe(true);
        expect(destroy).toHaveBeenCalled();
    });
});