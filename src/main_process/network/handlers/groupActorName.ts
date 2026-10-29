import { getAlias, getMyUPeerId } from '../../security/identity.js';
import { getContactByUpeerId } from '../../storage/contacts/operations.js';

const SELF_LABEL = 'Tu otro dispositivo';
const UNKNOWN_LABEL = 'Alguien';

export async function groupActorName(upeerId: string, knownName?: string | null): Promise<string> {
    if (knownName) return knownName;
    const contact = await getContactByUpeerId(upeerId);
    const stored = contact?.name || contact?.alias;
    if (stored) return stored;
    if (upeerId.toLowerCase() === getMyUPeerId().toLowerCase()) return getAlias() || SELF_LABEL;
    return UNKNOWN_LABEL;
}
