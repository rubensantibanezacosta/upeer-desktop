export const resizeImageToDataUrl = (file: File, size = 128): Promise<string> =>
    new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const image = new Image();
            image.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                const context = canvas.getContext('2d');
                if (!context) {
                    resolve('');
                    return;
                }
                const scale = Math.max(size / image.width, size / image.height);
                const width = image.width * scale;
                const height = image.height * scale;
                context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.85));
            };
            image.src = String(event.target?.result || '');
        };
        reader.readAsDataURL(file);
    });
