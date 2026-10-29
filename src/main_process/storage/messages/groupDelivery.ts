export function groupRecipients(members: readonly string[], selfUpeerId: string): Set<string> {
    const self = selfUpeerId.toLowerCase();
    return new Set(members.map(member => member.toLowerCase()).filter(member => member !== '' && member !== self));
}

export function parseDelivered(raw: string | null | undefined): Set<string> {
    if (!raw) return new Set();
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return new Set();
        return new Set(parsed.filter((value): value is string => typeof value === 'string' && value !== '').map(value => value.toLowerCase()));
    } catch {
        return new Set();
    }
}

export function recordDelivered(raw: string | null | undefined, memberUpeerId: string): { stored: string; delivered: Set<string> } {
    const delivered = parseDelivered(raw);
    const member = memberUpeerId.toLowerCase();
    if (member !== '') delivered.add(member);
    return { stored: JSON.stringify([...delivered].sort()), delivered };
}

export function isGroupDeliveryComplete(delivered: Set<string>, expected: Set<string>): boolean {
    if (expected.size === 0) return false;
    for (const member of expected) {
        if (!delivered.has(member)) return false;
    }
    return true;
}
