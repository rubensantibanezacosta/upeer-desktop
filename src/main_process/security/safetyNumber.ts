import { createHash } from 'node:crypto';

const KEY_LENGTH = 64;
const GROUPS = 8;
const GROUP_SIZE = 5;
const DIGEST_BYTES = (GROUPS * GROUP_SIZE) / 2;

function isValidKey(key: string): boolean {
  return key.length === KEY_LENGTH && /^[0-9a-f]+$/.test(key);
}

/**
 * Número de seguridad comparable entre plataformas.
 * Es simétrico: ambos lados obtienen el mismo número al ordenar las dos claves.
 * Debe mantenerse idéntico a `SafetyNumber.compute` del móvil.
 */
export function computeSafetyNumber(firstKeyHex: string, secondKeyHex: string): string {
  const first = firstKeyHex.trim().toLowerCase();
  const second = secondKeyHex.trim().toLowerCase();
  if (!isValidKey(first) || !isValidKey(second)) return '';
  const ordered = [first, second].sort();
  const digest = createHash('sha256').update(ordered[0] + ordered[1], 'utf8').digest();
  const hex = digest.subarray(0, DIGEST_BYTES).toString('hex').toUpperCase();
  return hex.match(new RegExp(`.{${GROUP_SIZE}}`, 'g'))?.join(' ') ?? hex;
}
