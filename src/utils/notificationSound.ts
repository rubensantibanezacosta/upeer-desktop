let audioCtx: AudioContext | null = null;

function triggerBeep(ctx: AudioContext): void {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);

    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.5);
}

export function playNotificationSound(): void {
    try {
        if (!audioCtx) audioCtx = new AudioContext();
        if (audioCtx.state === 'suspended') {
            audioCtx.resume().then(() => {
                if (audioCtx) triggerBeep(audioCtx);
            });
            return;
        }
        triggerBeep(audioCtx);
    } catch (err) {
        const logger = (window as { logger?: { warn?: (...args: unknown[]) => void } }).logger;
        if (logger?.warn) {
            logger.warn('[notification-sound]', err);
        }
    }
}