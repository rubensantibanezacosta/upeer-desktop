import type { BrowserWindow } from 'electron';

import { debug, info } from '../../security/secure-logger.js';
import { getMessageById } from '../../storage/messages/operations.js';
import { listInboundMessageEvents } from '../../storage/sync/events.js';
import { applySyncEventOutcome } from './apply.js';
import { toPlainEvent } from './replay.js';

const REPAIR_BATCH_SIZE = 200;

export async function repairInboundMessages(win: BrowserWindow | null): Promise<number> {
    const records = listInboundMessageEvents(REPAIR_BATCH_SIZE);
    let repaired = 0;
    for (const record of records) {
        const event = toPlainEvent(record);
        if (!event) continue;
        const id = event.payload.id;
        if (typeof id !== 'string' || id.length === 0) continue;
        if (getMessageById(id)) continue;
        const outcome = await applySyncEventOutcome(event, win);
        if (outcome === 'applied') repaired += 1;
    }
    if (repaired > 0) {
        info('Mensajes sincronizados recuperados', { revisados: records.length, recuperados: repaired }, 'sync');
    } else {
        debug('Sin mensajes sincronizados pendientes de recuperar', { revisados: records.length }, 'sync');
    }
    return repaired;
}
