import type { MessageDeliveryStatus } from './status.js';

const RANK: Record<string, number> = {
    pending: 0,
    sent: 1,
    vaulted: 2,
    delivered: 3,
    read: 4,
};

export function canTransitionStatus(from: string, to: MessageDeliveryStatus): boolean {
    if (from === to) return false;
    if (from === 'read') return false;
    if (from === 'delivered') return to === 'read';
    if (to === 'failed') return true;
    if (from === 'failed') return to === 'sent' || to === 'vaulted' || to === 'delivered';
    return (RANK[to] ?? -1) > (RANK[from] ?? -1);
}
