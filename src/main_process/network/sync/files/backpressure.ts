import { sendQueueDepth } from '../../server/transport.js';
import { MAX_QUEUE_SIZE } from '../../server/constants.js';

const HIGH_WATER = 8;
const POLL_MS = 4;

export async function waitForSendCapacity(address: string, timeoutMs = 30_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (sendQueueDepth(address) < HIGH_WATER) return true;
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
    return sendQueueDepth(address) < MAX_QUEUE_SIZE;
}
