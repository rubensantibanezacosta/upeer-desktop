import {
    getContacts,
    getContactByRevelnestId,
    updateContactDhtLocation
} from '../storage/db.js';
import {
    getMyRevelNestId,
    incrementMyDhtSeq
} from '../security/identity.js';
import {
    generateSignedLocationBlock,
    getNetworkAddress
} from './utils.js';

let lastKnownIp: string | null = null;

export function broadcastDhtUpdate(sendSecureUDPMessage: (ip: string, data: any) => void) {
    const currentIp = getNetworkAddress();
    if (!currentIp) return;

    if (currentIp !== lastKnownIp) {
        lastKnownIp = currentIp;
        const newSeq = incrementMyDhtSeq();

        console.log(`[DHT] IP propia detectada/cambiada a ${currentIp}. Propagando DHT_UPDATE (Seq: ${newSeq})...`);
        const locBlock = generateSignedLocationBlock(currentIp, newSeq);
        const contacts = getContacts();
        for (const contact of contacts) {
            if (contact.status === 'connected') {
                sendSecureUDPMessage(contact.address, {
                    type: 'DHT_UPDATE',
                    locationBlock: locBlock
                });
            }
        }
    }
}

export async function sendDhtExchange(targetRevelnestId: string, sendSecureUDPMessage: (ip: string, data: any) => void) {
    const targetContact = await getContactByRevelnestId(targetRevelnestId);
    if (!targetContact || targetContact.status !== 'connected') return;

    const allContacts = getContacts() as any[];

    const distanceXOR = (idA: string, idB: string) => {
        try {
            return BigInt('0x' + idA) ^ BigInt('0x' + idB);
        } catch {
            return BigInt(0);
        }
    };

    const payload = allContacts
        .filter(c => c.status === 'connected' && c.dhtSignature && c.revelnestId !== targetRevelnestId)
        .map(c => ({
            revelnestId: c.revelnestId,
            publicKey: c.publicKey,
            locationBlock: {
                address: c.address,
                dhtSeq: c.dhtSeq,
                signature: c.dhtSignature
            },
            dist: distanceXOR(c.revelnestId, targetRevelnestId)
        }))
        .sort((a, b) => (a.dist < b.dist ? -1 : a.dist > b.dist ? 1 : 0))
        .map(({ dist, ...data }) => data);

    const limitedPayload = payload.slice(0, 5);

    if (limitedPayload.length > 0) {
        sendSecureUDPMessage(targetContact.address, {
            type: 'DHT_EXCHANGE',
            peers: limitedPayload
        });
    }
}

export async function startDhtSearch(revelnestId: string, sendSecureUDPMessage: (ip: string, data: any) => void) {
    console.log(`[DHT Search] Iniciando búsqueda activa para: ${revelnestId}`);
    const allContacts = getContacts() as any[];

    const distanceXOR = (idA: string, idB: string) => {
        try { return BigInt('0x' + idA) ^ BigInt('0x' + idB); }
        catch { return BigInt(0); }
    };

    const queryTargets = allContacts
        .filter(c => c.status === 'connected' && c.revelnestId !== revelnestId)
        .map(c => ({
            revelnestId: c.revelnestId,
            address: c.address,
            dist: distanceXOR(c.revelnestId, revelnestId)
        }))
        .sort((a, b) => (a.dist < b.dist ? -1 : a.dist > b.dist ? 1 : 0))
        .slice(0, 3);

    for (const target of queryTargets) {
        sendSecureUDPMessage(target.address, {
            type: 'DHT_QUERY',
            targetId: revelnestId
        });
    }
}
