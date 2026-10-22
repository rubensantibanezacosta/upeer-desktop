import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    emitSyncEvent,
    registerSyncEventSink,
    withSyncEventSuppression,
    withSyncEventSuppressionAsync,
} from '../../../src/main_process/storage/sync/eventSink.js';

describe('Sync event sink', () => {
    afterEach(() => {
        registerSyncEventSink(null);
    });

    it('emits a uniquely identified event when a sink is registered', () => {
        const sink = vi.fn();
        registerSyncEventSink(sink);
        emitSyncEvent('MESSAGE_UPSERT', { id: 'm1' });
        emitSyncEvent('MESSAGE_UPSERT', { id: 'm2' });

        expect(sink).toHaveBeenCalledTimes(2);
        const first = sink.mock.calls[0][0];
        const second = sink.mock.calls[1][0];
        expect(first.kind).toBe('MESSAGE_UPSERT');
        expect(first.payload).toEqual({ id: 'm1' });
        expect(first.eventId).not.toBe(second.eventId);
    });

    it('does not emit without a sink', () => {
        const sink = vi.fn();
        emitSyncEvent('MESSAGE_STATUS', { id: 'm1', status: 'read' });
        expect(sink).not.toHaveBeenCalled();
    });

    it('suppresses nested events during synchronous sync application', () => {
        const sink = vi.fn();
        registerSyncEventSink(sink);
        withSyncEventSuppression(() => {
            emitSyncEvent('MESSAGE_STATUS', { id: 'm1', status: 'read' });
        });
        emitSyncEvent('MESSAGE_STATUS', { id: 'm2', status: 'read' });
        expect(sink).toHaveBeenCalledTimes(1);
        expect(sink.mock.calls[0][0].payload).toEqual({ id: 'm2', status: 'read' });
    });

    it('suppresses nested events during asynchronous sync application', async () => {
        const sink = vi.fn();
        registerSyncEventSink(sink);
        await withSyncEventSuppressionAsync(async () => {
            emitSyncEvent('MESSAGE_STATUS', { id: 'm1', status: 'read' });
        });
        expect(sink).not.toHaveBeenCalled();
    });
});
