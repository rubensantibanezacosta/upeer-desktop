import { isYggdrasilAddress } from './yggdrasilAddress.js';

const UPEER_ID = /^[0-9a-f]{64}$/i;

export type ContactQrResult = { upeerId: string; address: string } | { error: string };

/**
 * El móvil codifica su tarjeta como `uPeerID@dirección`. Un QR de sólo identidad
 * no sirve para conectar, porque sin dirección no hay a dónde ir.
 */
export function parseContactQrPayload(raw: string): ContactQrResult {
  const value = raw.trim();
  if (!value) return { error: 'El código QR está vacío.' };

  const separator = value.indexOf('@');
  if (separator < 0) {
    return UPEER_ID.test(value)
      ? { error: 'El QR sólo trae la identidad. Pide a la otra persona que muestre el QR completo con su dirección.' }
      : { error: 'El QR no contiene una identidad uPeer.' };
  }

  const upeerId = value.slice(0, separator).trim().toLowerCase();
  const address = value.slice(separator + 1).trim();

  if (!upeerId || !address) return { error: 'El QR está incompleto: falta la identidad o la dirección.' };
  if (!UPEER_ID.test(upeerId)) return { error: 'La identidad del QR no son 64 caracteres hexadecimales.' };
  if (!isYggdrasilAddress(address)) return { error: 'La dirección del QR no pertenece a la red.' };

  return { upeerId, address };
}
