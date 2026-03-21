/**
 * Sealed Sender — ocultar la identidad del remitente en los paquetes en tránsito.
 *
 * Inspirado en el Sealed Sender de Signal Protocol.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  Outer (visible en red Yggdrasil):                                  │
 * │  { type: 'SEALED', ciphertext, nonce, senderEphPub }               │
 * │                                                                     │
 * │  Inner (solo el destinatario puede leer):                           │
 * │  { type, senderUpeerId, senderYggAddress, signature, ...data }  │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * El remitente genera un par de claves efímero aleatorio para cada paquete.
 * Usa DH(senderEphSk, recipientCurve25519Pk) para obtener un secreto compartido
 * con el que cifra el inner packet.
 *
 * El receptor descifra con DH(recipientCurve25519Sk, senderEphPub).
 *
 * Un observador externo solo ve:
 *  - Que ALGUIEN envió un paquete SEALED a ALGUIEN (ya cifrado por Yggdrasil)
 *  - La IP destino (dirección Yggdrasil del receptor)
 *
 * Aplicable a: CHAT, GROUP_MSG, CHAT_UPDATE, CHAT_DELETE, CHAT_REACTION,
 *              TYPING, FILE_* (todos los mensajes de contenido)
 * No aplicable a: PING, PONG, HANDSHAKE_REQ/ACCEPT, DHT_* (no hay clave previa)
 */

import sodium from 'sodium-native';

/** Tipos de mensajes que se deben envolver en SEALED */
export const SEALED_TYPES = new Set([
    'CHAT', 'ACK', 'READ', 'TYPING',
    'CHAT_REACTION', 'CHAT_UPDATE', 'CHAT_DELETE',
    'GROUP_MSG', 'GROUP_ACK',
    'FILE_PROPOSAL', 'FILE_START', 'FILE_ACCEPT',
    'FILE_CHUNK', 'FILE_CHUNK_ACK', 'FILE_ACK', 'FILE_DONE_ACK',
    'FILE_END', 'FILE_CANCEL',
    'VAULT_STORE', 'VAULT_QUERY', 'VAULT_ACK', 'VAULT_DELIVERY', 'VAULT_RENEW',
]);

/**
 * Cifra un paquete completo (ya firmado) para que solo el destinatario pueda leerlo.
 *
 * @param signedPacket  El paquete inner completo (con senderUpeerId + signature)
 * @param recipientEdPk La clave pública Ed25519 del destinatario (32 bytes, hex)
 * @returns Paquete outer SEALED
 */
export function sealPacket(signedPacket: Record<string, unknown>, recipientEdPkHex: string): Record<string, unknown> {
    const recipientEdPk = Buffer.from(recipientEdPkHex, 'hex');
    const recipientCurvePk = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
    sodium.crypto_sign_ed25519_pk_to_curve25519(recipientCurvePk, recipientEdPk);

    const payload = Buffer.from(JSON.stringify(signedPacket));
    const ciphertext = Buffer.alloc(payload.length + sodium.crypto_box_SEALBYTES);
    sodium.crypto_box_seal(ciphertext, payload, recipientCurvePk);

    return {
        type: 'SEALED',
        ciphertext: ciphertext.toString('hex'),
    };
}

/**
 * Descifra un paquete SEALED usando la clave secreta estática de identidad.
 * Se llama desde handlePacket antes de cualquier otro procesamiento.
 *
 * @param data          El paquete outer SEALED
 * @param myEdSkFn      Función que ejecuta el descifrado internamente (no expone SK)
 * @returns El inner packet descifrado, o null si falla
 */
export function unsealPacket(
    data: { ciphertext: string },
    myEdSkFn: (ciphertext: Buffer) => Buffer | null
): Record<string, unknown> | null {
    try {
        const ciphertext = Buffer.from(data.ciphertext, 'hex');
        const plaintext = myEdSkFn(ciphertext);
        if (!plaintext) return null;
        return JSON.parse(plaintext.toString('utf-8')) as Record<string, unknown>;
    } catch {
        return null;
    }
}
