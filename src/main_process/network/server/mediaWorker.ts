import { MessageChannelMain, utilityProcess } from 'electron';
import path from 'node:path';

export function createMediaVerificationWorker() {
    const workerPath = path.join(process.cwd(), '.vite', 'build', 'verified_media_worker', 'verifiedMediaWorker.cjs');
    const worker = utilityProcess.fork(workerPath, [], { serviceName: 'Call Media Verification' });
    const { port1, port2 } = new MessageChannelMain();
    worker.postMessage({ type: 'connect' }, [port1]);
    return { worker, port: port2 };
}