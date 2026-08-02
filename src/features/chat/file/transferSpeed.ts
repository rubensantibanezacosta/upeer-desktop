import { useRef, useEffect, useState } from 'react';
import type { FileTransfer } from '../../../hooks/fileTransferTypes.js';

interface SpeedSample {
    time: number;
    bytes: number;
}

const SAMPLE_WINDOW_MS = 3000;
const MIN_SPEED_BPS = 1024;

export function useTransferSpeed(transfer: FileTransfer): { speedBps: number; etaSeconds: number | null } {
    const samplesRef = useRef<SpeedSample[]>([]);
    const [speedBps, setSpeedBps] = useState(0);
    const [etaSeconds, setEtaSeconds] = useState<number | null>(null);

    useEffect(() => {
        if (transfer.state !== 'active') {
            samplesRef.current = [];
            setSpeedBps(0);
            setEtaSeconds(null);
            return;
        }

        const now = Date.now();
        const bytes = transfer.bytesTransferred || 0;
        samplesRef.current.push({ time: now, bytes });
        samplesRef.current = samplesRef.current.filter((sample) => now - sample.time <= SAMPLE_WINDOW_MS);

        const oldest = samplesRef.current[0];
        if (!oldest || now - oldest.time < 500) {
            return;
        }

        const speed = Math.max((bytes - oldest.bytes) / ((now - oldest.time) / 1000), 0);
        setSpeedBps(speed);

        const remaining = (transfer.totalBytes || transfer.fileSize || 0) - bytes;
        if (speed >= MIN_SPEED_BPS && remaining > 0) {
            setEtaSeconds(remaining / speed);
        } else {
            setEtaSeconds(null);
        }
    }, [transfer.state, transfer.bytesTransferred, transfer.totalBytes, transfer.fileSize]);

    return { speedBps, etaSeconds };
}

export function formatSpeed(bps: number): string {
    if (bps <= 0) return '—';
    if (bps < 1024) return `${bps} B/s`;
    if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
    return `${(bps / (1024 * 1024)).toFixed(2)} MB/s`;
}

export function formatEta(seconds: number | null): string {
    if (seconds === null || !Number.isFinite(seconds) || seconds < 1) return '—';
    const total = Math.round(seconds);
    if (total < 60) return `${total}s`;
    const minutes = Math.floor(total / 60);
    const secs = total % 60;
    return `${minutes}m ${secs}s`;
}