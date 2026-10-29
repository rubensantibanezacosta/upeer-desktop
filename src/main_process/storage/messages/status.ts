import { getDb, getSchema, eq } from '../shared.js';
import { emitSyncEvent } from '../sync/eventSink.js';
import { canTransitionStatus } from './statusTransitions.js';

export type MessageDeliveryStatus = 'failed' | 'sent' | 'delivered' | 'read' | 'vaulted';

export async function updateMessageStatus(id: string, status: MessageDeliveryStatus): Promise<boolean> {
    const db = getDb();
    const schema = getSchema();

    // BUG DB-STATUS fix: si el mensaje no existe, no hacer update silencioso.
    // El código anterior caía hasta el db.update incluso cuando currentStatus
    // era null (mensaje inexistente), actualizando 0 filas pero retornando
    // result.changes > 0 como false sin indicar por qué.
    const currentStatus = getMessageStatus(id);
    if (!currentStatus) return false;

    if (!canTransitionStatus(currentStatus, status)) return false;

    const result = db.update(schema.messages)
        .set({ status })
        .where(eq(schema.messages.id, id))
        .run();

    if ((result?.changes ?? 0) > 0) emitSyncEvent('MESSAGE_STATUS', { id, status });
    return (result?.changes ?? 0) > 0;
}

export function getMessageStatus(id: string) {
    const db = getDb();
    const schema = getSchema();

    const msg = db.select({ status: schema.messages.status })
        .from(schema.messages)
        .where(eq(schema.messages.id, id))
        .get() as { status: MessageDeliveryStatus } | undefined;
    return msg ? msg.status : null;
}