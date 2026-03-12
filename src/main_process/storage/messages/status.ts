import { getDb, getSchema, eq } from '../shared.js';

export function updateMessageStatus(id: string, status: 'sent' | 'delivered' | 'read' | 'vaulted') {
    const db = getDb();
    const schema = getSchema();

    // Status precedence order to prevent race conditions (e.g., ACK arriving after READ)
    const statusOrder: Record<string, number> = {
        'sent': 0,
        'vaulted': 1,
        'delivered': 2,
        'read': 3
    };

    const currentStatus = getMessageStatus(id);
    if (currentStatus) {
        const currentRank = statusOrder[currentStatus] ?? 0;
        const newRank = statusOrder[status] ?? 0;

        // Don't downgrade status (e.g., from 'read' to 'delivered')
        if (newRank <= currentRank) return;
    }

    return db.update(schema.messages)
        .set({ status })
        .where(eq(schema.messages.id, id))
        .run();
}

export function getMessageStatus(id: string) {
    const db = getDb();
    const schema = getSchema();

    const msg = db.select({ status: schema.messages.status })
        .from(schema.messages)
        .where(eq(schema.messages.id, id))
        .get();
    return msg ? (msg as any).status : null;
}