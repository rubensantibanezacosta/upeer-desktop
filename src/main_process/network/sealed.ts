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
    // Convertir Ed25519 → X25519 para DH
    const recipientEdPk = Buffer.from(recipientEdPkHex, 'hex');
    const recipientCurvePk = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
    sodium.crypto_sign_ed25519_pk_to_curve25519(recipientCurvePk, recipientEdPk);

    // Generar par efímero del remitente (nunca reutilizado)
    const senderEphPk = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
    const senderEphSk = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
    sodium.crypto_box_keypair(senderEphPk, senderEphSk);

    // Nonce aleatorio
    const nonce = Buffer.allocUnsafe(sodium.crypto_box_NONCEBYTES);
    sodium.randombytes_buf(nonce);

    // Cifrar el inner packet
    const payload = Buffer.from(JSON.stringify(signedPacket));
    const ciphertext = Buffer.alloc(payload.length + sodium.crypto_box_MACBYTES);
    sodium.crypto_box_easy(ciphertext, payload, nonce, recipientCurvePk, senderEphSk);

    // Limpiar la clave efímera privada
    sodium.sodium_memzero(senderEphSk);

    return {
        type: 'SEALED',
        senderEphPub: senderEphPk.toString('hex'),
        nonce: nonce.toString('hex'),
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
    data: { senderEphPub: string; nonce: string; ciphertext: string },
    myEdSkFn: (senderEphPub: Buffer, nonce: Buffer, ciphertext: Buffer) => Buffer | null
): Record<string, unknown> | null {
    try {
        const senderEphPub = Buffer.from(data.senderEphPub, 'hex');
        const nonce = Buffer.from(data.nonce, 'hex');
        const ciphertext = Buffer.from(data.ciphertext, 'hex');

        const plaintext = myEdSkFn(senderEphPub, nonce, ciphertext);
        if (!plaintext) return null;

        return JSON.parse(plaintext.toString('utf-8')) as Record<string, unknown>;
    } catch {
        return null;
    }
}
