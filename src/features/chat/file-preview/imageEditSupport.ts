export interface CropRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface DrawPoint {
    x: number;
    y: number;
}

export type DrawStroke = DrawPoint[];

export interface TextItem {
    text: string;
    x: number;
    y: number;
}

export interface StickerItem {
    emoji: string;
    x: number;
    y: number;
}

export function cropImageToDataUrl(img: HTMLImageElement, rect: CropRect): string | null {
    const scaleX = img.naturalWidth / img.clientWidth;
    const scaleY = img.naturalHeight / img.clientHeight;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(rect.w * scaleX));
    canvas.height = Math.max(1, Math.round(rect.h * scaleY));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(
        img,
        rect.x * scaleX,
        rect.y * scaleY,
        rect.w * scaleX,
        rect.h * scaleY,
        0,
        0,
        canvas.width,
        canvas.height,
    );
    return canvas.toDataURL('image/png');
}

export function rotateImageToDataUrl(img: HTMLImageElement): string | null {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return null;
    const quarterTurn = w !== h;
    const canvas = document.createElement('canvas');
    canvas.width = quarterTurn ? h : w;
    canvas.height = quarterTurn ? w : h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    return canvas.toDataURL('image/png');
}

export function composeDrawingWithStrokes(
    sourceUrl: string,
    strokes: DrawStroke[],
    color = '#ff5252',
): Promise<string | null> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                resolve(null);
                return;
            }
            ctx.drawImage(img, 0, 0);
            ctx.strokeStyle = color;
            ctx.lineWidth = Math.max(3, Math.round(img.naturalWidth / 200));
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            for (const stroke of strokes) {
                if (stroke.length === 0) continue;
                ctx.beginPath();
                ctx.moveTo(stroke[0].x * img.naturalWidth, stroke[0].y * img.naturalHeight);
                for (let i = 1; i < stroke.length; i++) {
                    ctx.lineTo(stroke[i].x * img.naturalWidth, stroke[i].y * img.naturalHeight);
                }
                ctx.stroke();
            }
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => resolve(null);
        img.src = sourceUrl;
    });
}

export function drawStrokesOnCanvas(
    canvas: HTMLCanvasElement,
    strokes: DrawStroke[],
    color = '#ff5252',
): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(3, Math.round(w / 200));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const stroke of strokes) {
        if (stroke.length === 0) continue;
        ctx.beginPath();
        ctx.moveTo(stroke[0].x * w, stroke[0].y * h);
        for (let i = 1; i < stroke.length; i++) {
            ctx.lineTo(stroke[i].x * w, stroke[i].y * h);
        }
        ctx.stroke();
    }
}

export function composeTextOnImage(
    sourceUrl: string,
    items: TextItem[],
    color: string,
): Promise<string | null> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                resolve(null);
                return;
            }
            ctx.drawImage(img, 0, 0);
            ctx.fillStyle = color;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `bold ${Math.max(24, Math.round(img.naturalWidth / 16))}px sans-serif`;
            for (const item of items) {
                ctx.fillText(item.text, item.x * img.naturalWidth, item.y * img.naturalHeight);
            }
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => resolve(null);
        img.src = sourceUrl;
    });
}

export function composeStickersOnImage(
    sourceUrl: string,
    items: StickerItem[],
): Promise<string | null> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                resolve(null);
                return;
            }
            ctx.drawImage(img, 0, 0);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `${Math.max(48, Math.round(img.naturalWidth / 6))}px sans-serif`;
            for (const item of items) {
                ctx.fillText(item.emoji, item.x * img.naturalWidth, item.y * img.naturalHeight);
            }
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => resolve(null);
        img.src = sourceUrl;
    });
}
