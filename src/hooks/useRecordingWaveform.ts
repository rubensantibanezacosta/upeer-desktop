import { useEffect, useRef } from 'react';

const BAR_WIDTH = 3;
const BAR_GAP = 2;
const SAMPLE_INTERVAL_MS = 50;

export const useRecordingWaveform = (isRecording: boolean, stream: MediaStream | null) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (!isRecording || !stream) return;

        const audioCtx = new AudioContext();
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 1024;
        audioCtx.createMediaStreamSource(stream).connect(analyser);

        const bufferLength = analyser.fftSize;
        const dataArray = new Uint8Array(bufferLength);

        const history: number[] = [];
        let animFrame: number;
        let lastSample = 0;

        const draw = (timestamp: number) => {
            animFrame = requestAnimationFrame(draw);

            const canvas = canvasRef.current;
            if (!canvas) return;
            const w = canvas.offsetWidth;
            const h = canvas.offsetHeight;
            if (w > 0) canvas.width = w;
            if (h > 0) canvas.height = h;

            if (timestamp - lastSample >= SAMPLE_INTERVAL_MS) {
                lastSample = timestamp;
                analyser.getByteTimeDomainData(dataArray);
                let sumSq = 0;
                for (let i = 0; i < bufferLength; i++) {
                    const normalized = (dataArray[i] - 128) / 128;
                    sumSq += normalized * normalized;
                }
                const rms = Math.min(1, Math.sqrt(sumSq / bufferLength) * 6);
                history.push(rms);
                const maxBars = Math.floor(canvas.width / (BAR_WIDTH + BAR_GAP)) + 1;
                if (history.length > maxBars) history.shift();
            }

            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const barCount = history.length;
            const startX = canvas.width - barCount * (BAR_WIDTH + BAR_GAP);

            for (let i = 0; i < barCount; i++) {
                const amplitude = history[i];
                const barHeight = Math.max(3, amplitude * canvas.height * 0.85);
                const x = startX + i * (BAR_WIDTH + BAR_GAP);
                const y = (canvas.height - barHeight) / 2;
                const alpha = 0.35 + amplitude * 0.65;
                ctx.fillStyle = `rgba(11, 107, 203, ${alpha.toFixed(2)})`;
                ctx.beginPath();
                if ((ctx as any).roundRect) {
                    (ctx as any).roundRect(x, y, BAR_WIDTH, barHeight, 1.5);
                } else {
                    ctx.rect(x, y, BAR_WIDTH, barHeight);
                }
                ctx.fill();
            }
        };

        animFrame = requestAnimationFrame(draw);

        return () => {
            cancelAnimationFrame(animFrame);
            audioCtx.close();
        };
    }, [isRecording, stream]);

    return canvasRef;
};
