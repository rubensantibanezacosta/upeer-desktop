import { getDocument } from 'pdfjs-dist';

const clampScale = (width: number, height: number, maxWidth: number, maxHeight: number) => {
    const widthScale = maxWidth / Math.max(width, 1);
    const heightScale = maxHeight / Math.max(height, 1);
    return Math.min(widthScale, heightScale, 1);
};

export const generatePdfThumbnail = async (
    sourceUrl: string,
    options?: { maxWidth?: number; maxHeight?: number }
): Promise<string> => {
    const maxWidth = options?.maxWidth ?? 240;
    const maxHeight = options?.maxHeight ?? 320;
    const loadingTask = getDocument({
        url: sourceUrl,
        useWorkerFetch: false,
        isEvalSupported: false,
        disableFontFace: true,
    } as any);

    const pdf = await loadingTask.promise;

    try {
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        const scale = clampScale(viewport.width, viewport.height, maxWidth, maxHeight);
        const scaledViewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        if (!context) return '';

        canvas.width = Math.max(1, Math.floor(scaledViewport.width));
        canvas.height = Math.max(1, Math.floor(scaledViewport.height));

        await page.render({ canvas, canvasContext: context, viewport: scaledViewport }).promise;
        return canvas.toDataURL('image/jpeg', 0.82);
    } finally {
        await pdf.destroy();
    }
};