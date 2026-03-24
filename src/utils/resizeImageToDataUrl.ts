export function resizeImageToDataUrl(
    file: File,
    options?: {
        size?: number;
        quality?: number;
        mimeType?: string;
        maxBytes?: number;
    }
): Promise<string> {
    const size = options?.size ?? 128;
    const quality = options?.quality ?? 0.85;
    const mimeType = options?.mimeType ?? 'image/jpeg';
    const maxBytes = options?.maxBytes ?? 10 * 1024 * 1024;

    return new Promise((resolve, reject) => {
        if (file.size > maxBytes) {
            reject(new Error('File too large'));
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const image = new Image();
            image.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                const context = canvas.getContext('2d');
                if (!context) {
                    reject(new Error('Canvas context not available'));
                    return;
                }

                const side = Math.min(image.width, image.height);
                const sx = (image.width - side) / 2;
                const sy = (image.height - side) / 2;
                context.drawImage(image, sx, sy, side, side, 0, 0, size, size);
                resolve(canvas.toDataURL(mimeType, quality));
            };
            image.onerror = () => reject(new Error('Image load failed'));
            image.src = event.target?.result as string;
        };
        reader.onerror = () => reject(new Error('File read failed'));
        reader.readAsDataURL(file);
    });
}
