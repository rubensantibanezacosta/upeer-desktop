import type { SyncPhase } from './phase.js';

export type SyncProgressInput = {
    phase: SyncPhase;
    historyDone: number;
    historyTotal: number;
    historyKnown: boolean;
    pendingOutbound: number;
    pendingInbound: number;
    pendingFiles: number;
};

export type SyncProgressView = {
    determinate: boolean;
    percent: number;
    historyDone: number;
    historyTotal: number;
    historyKnown: boolean;
    pendingOutbound: number;
    pendingInbound: number;
    pendingFiles: number;
    headline: string;
    detail: string;
};

let lastPhase: SyncPhase = 'idle';
let highWater = 0;

function safeCount(value: number): number {
    if (!Number.isFinite(value) || value <= 0) return 0;
    return Math.trunc(value);
}

function plural(total: number, singular: string, pluralForm: string): string {
    return `${total} ${total === 1 ? singular : pluralForm}`;
}

function buildDetail(input: SyncProgressInput, determinate: boolean): string {
    const done = safeCount(input.historyDone);
    const total = safeCount(input.historyTotal);
    const parts: string[] = [];
    if (determinate) parts.push(`${done} de ${plural(total, 'mensaje', 'mensajes')}`);
    else if (done > 0) parts.push(`${plural(done, 'mensaje sincronizado', 'mensajes sincronizados')}`);
    else parts.push('Conectando con tus dispositivos');
    const pendingOutbound = safeCount(input.pendingOutbound);
    const pendingInbound = safeCount(input.pendingInbound);
    const pendingFiles = safeCount(input.pendingFiles);
    if (pendingOutbound > 0) parts.push(`${plural(pendingOutbound, 'mensaje', 'mensajes')} por enviar`);
    if (pendingInbound > 0) parts.push(`${plural(pendingInbound, 'mensaje', 'mensajes')} por recibir`);
    if (pendingFiles > 0) parts.push(`${plural(pendingFiles, 'archivo', 'archivos')} en curso`);
    return parts.join(' · ');
}

export function computeSyncProgress(input: SyncProgressInput): SyncProgressView {
    const historyTotal = safeCount(input.historyTotal);
    const historyDone = safeCount(input.historyDone);
    const determinate = input.historyKnown && historyTotal > 0;
    const percent = determinate ? Math.min(100, Math.max(0, Math.round((historyDone / historyTotal) * 100))) : 0;
    return {
        determinate,
        percent,
        historyDone,
        historyTotal,
        historyKnown: input.historyKnown,
        pendingOutbound: safeCount(input.pendingOutbound),
        pendingInbound: safeCount(input.pendingInbound),
        pendingFiles: safeCount(input.pendingFiles),
        headline: input.phase === 'syncing' ? 'Sincronizando tus dispositivos…' : '¡Al día!',
        detail: buildDetail(input, determinate),
    };
}

export function trackSyncProgress(input: SyncProgressInput): SyncProgressView {
    const view = computeSyncProgress(input);
    if (input.phase !== 'syncing') {
        highWater = 0;
        lastPhase = input.phase;
        return view;
    }
    if (lastPhase !== 'syncing') highWater = 0;
    lastPhase = input.phase;
    highWater = Math.max(highWater, view.percent);
    return { ...view, percent: highWater };
}

export function resetSyncProgressMemory(): void {
    highWater = 0;
    lastPhase = 'idle';
}
