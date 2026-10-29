import type { SyncPhase } from './phase.js';
import type { SyncFileWork } from './files/autofetch.js';

export type SyncProgressInput = {
    phase: SyncPhase;
    historyDone: number;
    historyTotal: number;
    historyKnown: boolean;
    pendingOutbound: number;
    pendingInbound: number;
    pendingFiles: number;
    files?: SyncFileWork;
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
    filesDone: number;
    filesTotal: number;
    filesFailed: number;
    filesKnown: boolean;
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
    const files = readFiles(input);
    const filesKnown = files.total > 0;
    if (determinate) parts.push(`${done} de ${plural(total, 'mensaje', 'mensajes')}`);
    else if (done > 0) parts.push(`${plural(done, 'mensaje sincronizado', 'mensajes sincronizados')}`);
    else if (filesKnown && files.done > 0) parts.push(`${plural(files.done, 'adjunto', 'adjuntos')} sincronizados`);
    else if (input.phase === 'syncing') parts.push('Conectando con tus dispositivos');
    else parts.push('Todo sincronizado');
    if (filesKnown) parts.push(`${files.done} de ${plural(files.total, 'adjunto', 'adjuntos')}`);
    const pendingOutbound = safeCount(input.pendingOutbound);
    const pendingInbound = safeCount(input.pendingInbound);
    const pendingFiles = safeCount(input.pendingFiles);
    if (pendingOutbound > 0) parts.push(`${plural(pendingOutbound, 'mensaje', 'mensajes')} por enviar`);
    if (pendingInbound > 0) parts.push(`${plural(pendingInbound, 'mensaje', 'mensajes')} por recibir`);
    if (pendingFiles > 0) parts.push(`${plural(pendingFiles, 'archivo', 'archivos')} en curso`);
    if (files.failed > 0) parts.push(`${plural(files.failed, 'adjunto sin respuesta', 'adjuntos sin respuesta')}`);
    return parts.join(' · ');
}

function readFiles(input: SyncProgressInput): SyncFileWork {
    return {
        total: safeCount(input.files?.total ?? 0),
        done: safeCount(input.files?.done ?? 0),
        pending: safeCount(input.files?.pending ?? 0),
        failed: safeCount(input.files?.failed ?? 0),
        progressUnits: safeUnits(input.files),
    };
}

function safeUnits(files: SyncFileWork | undefined): number {
    const done = safeCount(files?.done ?? 0);
    const units = files?.progressUnits;
    if (typeof units !== 'number' || !Number.isFinite(units)) return done;
    return Math.min(safeCount(files?.total ?? 0), Math.max(done, units));
}

export function computeSyncProgress(input: SyncProgressInput): SyncProgressView {
    const historyTotal = safeCount(input.historyTotal);
    const historyDone = safeCount(input.historyDone);
    const historyKnown = input.historyKnown && historyTotal > 0;
    const files = readFiles(input);
    const filesKnown = files.total > 0;
    const determinate = (historyKnown || filesKnown) && historyDone + historyTotal + files.total > 0;
    const done = (historyKnown ? historyDone : 0) + (files.progressUnits ?? files.done);
    const total = (historyKnown ? historyTotal : 0) + files.total;
    const percent = determinate && total > 0 ? Math.min(100, Math.max(0, Math.round((done / total) * 100))) : 0;
    return {
        determinate,
        percent,
        historyDone,
        historyTotal,
        historyKnown: input.historyKnown,
        pendingOutbound: safeCount(input.pendingOutbound),
        pendingInbound: safeCount(input.pendingInbound),
        pendingFiles: safeCount(input.pendingFiles),
        filesDone: files.done,
        filesTotal: files.total,
        filesFailed: files.failed,
        filesKnown,
        headline: input.phase === 'syncing' ? 'Sincronizando tus dispositivos…' : '¡Al día!',
        detail: buildDetail(input, historyKnown),
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
