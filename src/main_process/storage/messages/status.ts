import { getDb, getSchema, eq } from '../shared.js';

export type MessageDeliveryStatus = 'failed' | 'sent' | 'delivered' | 'read' | 'vaulted';

export async function updateMessageStatus(id: string, status: MessageDeliveryStatus): Promise<boolean> {
    const db = getDb();
    const schema = getSchema();

    const statusOrder: Record<string, number> = {
        'failed': 0,
        'sent': 1,
        'vaulted': 2,
        'delivered': 3,
        'read': 4
    };

    const currentStatus = getMessageStatus(id);
    if (currentStatus) {
        if (status === 'failed') {
            if (currentStatus !== 'sent') return false;
        } else if (currentStatus === 'failed' && status === 'sent') {
            const result = db.update(schema.messages)
                .set({ status })
                .where(eq(schema.messages.id, id))
                .run();

            return result.changes > 0;
        } else {
            const currentRank = statusOrder[currentStatus] ?? 0;
            const newRank = statusOrder[status] ?? 0;

            if (newRank <= currentRank) return false;
        }
    }

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