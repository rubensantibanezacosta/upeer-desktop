export type MessageStatusIconKind = 'failed' | 'pending' | 'sent' | 'delivered';

export function messageStatusIconKind(status: string | null | undefined): MessageStatusIconKind {
    if (status === 'failed') return 'failed';
    if (status === 'pending' || status === 'sending') return 'pending';
    if (status === 'delivered' || status === 'read') return 'delivered';
    return 'sent';
}

export function messageStatusIsRead(status: string | null | undefined): boolean {
    return status === 'read';
}
