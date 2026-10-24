import { describe, expect, it } from 'vitest';
import jsQR from 'jsqr';
import QRCode from 'qrcode';

import { parseContactQrPayload } from '../../../src/utils/contactQr.js';

const id = 'b'.repeat(64);
const address = '200:7704:49e5:b4cd:7910:2191:2574:351b';
const SIZE = 360;
const QUIET_ZONE = 4;

/**
 * Reproduce lo que hace el escáner: QR → píxeles RGBA → jsQR → texto.
 * Se salta la cámara a propósito, que es lo único que no se puede probar aquí.
 */
function decodeRenderedQr(value: string): string | null {
  const { modules } = QRCode.create(value, { errorCorrectionLevel: 'M' });
  const total = modules.size + QUIET_ZONE * 2;
  const cell = Math.floor(SIZE / total);
  const data = new Uint8ClampedArray(SIZE * SIZE * 4);

  for (let index = 0; index < SIZE * SIZE; index++) {
    data[index * 4] = 255;
    data[index * 4 + 1] = 255;
    data[index * 4 + 2] = 255;
    data[index * 4 + 3] = 255;
  }

  for (let row = 0; row < modules.size; row++) {
    for (let column = 0; column < modules.size; column++) {
      if (!modules.data[row * modules.size + column]) continue;
      const startX = (column + QUIET_ZONE) * cell;
      const startY = (row + QUIET_ZONE) * cell;
      for (let y = startY; y < startY + cell; y++) {
        for (let x = startX; x < startX + cell; x++) {
          const offset = (y * SIZE + x) * 4;
          data[offset] = 0;
          data[offset + 1] = 0;
          data[offset + 2] = 0;
        }
      }
    }
  }

  return jsQR(data, SIZE, SIZE, { inversionAttempts: 'attemptBoth' })?.data ?? null;
}

describe('escáner de tarjeta de contacto', () => {
  it('decodifica el QR que genera el móvil y lo convierte en identidad y dirección', () => {
    const decoded = decodeRenderedQr(`${id}@${address}`);
    expect(decoded).toBe(`${id}@${address}`);
    expect(parseContactQrPayload(decoded ?? '')).toEqual({ upeerId: id, address });
  });

  it('un QR de sólo identidad se decodifica pero se rechaza al conectar', () => {
    const decoded = decodeRenderedQr(id);
    expect(decoded).toBe(id);
    expect(parseContactQrPayload(decoded ?? '')).toHaveProperty('error');
  });
});
