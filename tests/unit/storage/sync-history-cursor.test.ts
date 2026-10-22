import { describe, expect, it } from 'vitest';
import { parseSyncHistoryCursor } from '../../../src/main_process/storage/sync/messages.js';

describe('Sync history cursor', () => {
    it('parses a timestamp and message id', () => {
        expect(parseSyncHistoryCursor('1700000000000:message-1')).toEqual({
            timestamp: 1_700_000_000_000,
            id: 'message-1',
        });
    });

    it('keeps colons inside the message id', () => {
        expect(parseSyncHistoryCursor('10:a:b')).toEqual({ timestamp: 10, id: 'a:b' });
    });

    it('falls back to the start for missing or invalid cursors', () => {
        expect(parseSyncHistoryCursor(null)).toEqual({ timestamp: 0, id: '' });
        expect(parseSyncHistoryCursor('')).toEqual({ timestamp: 0, id: '' });
        expect(parseSyncHistoryCursor('not-a-cursor')).toEqual({ timestamp: 0, id: '' });
        expect(parseSyncHistoryCursor('-1:message')).toEqual({ timestamp: 0, id: '' });
    });
});
