import { getDb, getSchema, eq } from '../shared.js';
import { getMyUPeerId } from '../../security/identity.js';
import { getGroupById } from '../groups/operations.js';
import { updateMessageStatus } from './status.js';
import { groupRecipients, isGroupDeliveryComplete, recordDelivered } from './groupDelivery.js';

export type GroupAckOutcome = 'recorded' | 'complete' | 'unknown';

export async function applyGroupAck(messageId: string, groupId: string, memberUpeerId: string): Promise<GroupAckOutcome> {
    const db = getDb();
    const schema = getSchema();
    const row = db.select({ deliveredTo: schema.messages.deliveredTo })
        .from(schema.messages)
        .where(eq(schema.messages.id, messageId))
        .get() as { deliveredTo: string | null } | undefined;
    if (!row) return 'unknown';

    const group = getGroupById(groupId);
    const expected = groupRecipients(group?.members ?? [], getMyUPeerId());
    const recorded = recordDelivered(row.deliveredTo, memberUpeerId);
    const complete = isGroupDeliveryComplete(recorded.delivered, expected);

    db.update(schema.messages)
        .set({ deliveredTo: recorded.stored })
        .where(eq(schema.messages.id, messageId))
        .run();

    if (!complete) return 'recorded';
    return await updateMessageStatus(messageId, 'delivered') ? 'complete' : 'recorded';
}
