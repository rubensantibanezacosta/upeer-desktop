import { getDb, getSchema, eq } from '../shared.js';

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

    const statusOrder: Record<string, number> = {
        'failed': 0,
        'sent': 1,
        'vaulted': 2,
        'delivered': 3,
        'read': 4
    };

    if (status === 'failed') {
        // Solo se puede pasar a 'failed' desde 'sent'
        if (currentStatus !== 'sent') return false;
        const result = db.update(schema.messages)
            .set({ status })
            .where(eq(schema.messages.id, id))
            .run();
        return result.changes > 0;
    }

    if (currentStatus === 'failed' && status === 'sent') {
        // Permitir 'failed' → 'sent' (retry)
        const result = db.update(schema.messages)
            .set({ status })
            .where(eq(schema.messages.id, id))
            .run();
        return result.changes > 0;
    }

    const currentRank = statusOrder[currentStatus] ?? 0;
    const newRank = statusOrder[status] ?? 0;

    // Degradación: 'vaulted' → 'sent', 'delivered' → 'vaulted', etc.
    if (newRank <= currentRank) return false;

    const result = db.update(schema.messages)
        .set({ status })
        .where(eq(schema.messages.id, id))
        .run();

    return result.changes > 0;
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