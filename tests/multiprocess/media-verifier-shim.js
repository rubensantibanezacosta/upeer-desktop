export function connectMediaVerifier(port) {
    if (!port) return;
    const contactKeys = new Map();
    const reportedDiagnostics = new Set();
    let contactsReady = false;

    const report = (reason, request, details = {}) => {
        const key = `${reason}:${details.senderUpeerId ?? ''}:${details.callId ?? ''}`;
        if (reportedDiagnostics.has(key)) return;
        reportedDiagnostics.add(key);
        port.postMessage({ type: 'diagnostic', stage: 'verification', reason, packetBytes: request.packet.byteLength, ...details });
    };

    const verifyPacket = async (request) => {
        if (request.packet.byteLength > 600_000) {
            report('packet-too-large', request);
            return;
        }
        const { decodeBinaryCallMedia } = await import('../../src/main_process/network/binaryCallMedia.ts');
        const { canonicalStringify } = await import('../../src/main_process/network/cryptoUtils.ts');
        const { verify } = await import('../../src/main_process/security/identityCrypto.ts');
        const { isYggdrasilAddress } = await import('../../src/main_process/network/utils.ts');
        let packet;
        try {
            packet = decodeBinaryCallMedia(Buffer.from(request.packet));
        } catch (cause) {
            report('binary-decode-error', request, { error: cause instanceof Error ? cause.message : String(cause) });
            return;
        }
        if (!packet || packet.type !== 'CALL_MEDIA') {
            report('invalid-binary-media-packet', request, { packetDecoded: Boolean(packet), packetType: packet?.type ?? null });
            return;
        }
        const senderUpeerId = typeof packet.senderUpeerId === 'string' ? packet.senderUpeerId : '';
        const senderYggAddress = typeof packet.senderYggAddress === 'string' ? packet.senderYggAddress : '';
        const signature = typeof packet.signature === 'string' ? packet.signature : '';
        const callId = typeof packet.callId === 'string' ? packet.callId : '';
        if (!senderUpeerId || !callId || !isYggdrasilAddress(senderYggAddress) || !/^[0-9a-f]{128}$/i.test(signature)) {
            report('invalid-sender-metadata', request, { senderPresent: Boolean(senderUpeerId), callIdPresent: Boolean(callId), yggAddressValid: isYggdrasilAddress(senderYggAddress), signatureValid: /^[0-9a-f]{128}$/i.test(signature) });
            return;
        }
        let publicKey = contactKeys.get(senderUpeerId);
        if (!publicKey) {
            const { getContactByUpeerId } = await import('../../src/main_process/storage/contacts/operations.ts');
            publicKey = getContactByUpeerId(senderUpeerId)?.publicKey ?? undefined;
        }
        if (!contactsReady || !publicKey) {
            report(!contactsReady ? 'contacts-not-ready' : 'sender-key-not-found', request, { senderUpeerId });
            return;
        }
        const signedPacket = { ...packet, senderUpeerId, senderYggAddress };
        delete signedPacket.signature;
        delete signedPacket.data;
        if (!verify(Buffer.from(canonicalStringify(signedPacket)), Buffer.from(signature, 'hex'), Buffer.from(publicKey, 'hex'))) {
            report('signature-invalid', request, { senderUpeerId, callId });
            return;
        }
        const media = Uint8Array.from(packet.data);
        report('signature-verified', request, { senderUpeerId, callId, mediaBytes: media.byteLength });
        port.postMessage({ type: 'verified-media', senderUpeerId, senderYggAddress, callId, media, timestamp: packet.timestamp });
    };

    port.on('message', ({ data }) => {
        if (data.type === 'contacts') {
            contactKeys.clear();
            data.contacts.forEach(({ upeerId, publicKey }) => contactKeys.set(upeerId, publicKey));
            contactsReady = true;
            port.postMessage({ type: 'worker-status', status: 'contacts-loaded', contactCount: contactKeys.size });
            return;
        }
        if (data.type === 'packet') {
            void verifyPacket(data).catch((cause) => report('verification-error', data, { error: cause instanceof Error ? cause.message : String(cause) }));
        }
    });
    port.start();
    port.postMessage({ type: 'worker-status', status: 'connected' });
}

