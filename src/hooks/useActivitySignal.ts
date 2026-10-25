import { useEffect } from 'react';

const ACTIVITY_THROTTLE_MS = 15_000;

function sendActivity(): void {
    const api = window.upeer as { markUserActive?: () => Promise<void> } | undefined;
    if (typeof api?.markUserActive !== 'function') return;
    Promise.resolve(api.markUserActive()).catch(() => undefined);
}

export function useActivitySignal(): void {
    useEffect(() => {
        let last = 0;
        const report = () => {
            const now = Date.now();
            if (now - last < ACTIVITY_THROTTLE_MS) return;
            last = now;
            sendActivity();
        };
        const onVisibility = () => {
            if (document.visibilityState === 'visible') report();
        };
        report();
        window.addEventListener('focus', report);
        window.addEventListener('pointerdown', report);
        window.addEventListener('keydown', report);
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            window.removeEventListener('focus', report);
            window.removeEventListener('pointerdown', report);
            window.removeEventListener('keydown', report);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, []);
}
