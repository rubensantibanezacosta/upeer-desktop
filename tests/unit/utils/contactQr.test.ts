import { describe, expect, it } from 'vitest';

import { parseContactQrPayload } from '../../../src/utils/contactQr.js';

const id = 'a'.repeat(64);
const address = '200:7704:49e5:b4cd:7910:2191:2574:351b';

describe('parseContactQrPayload', () => {
  it('accepts the format the mobile renders', () => {
    expect(parseContactQrPayload(`${id}@${address}`)).toEqual({ upeerId: id, address });
  });

  it('normalizes whitespace and uppercase ids', () => {
    expect(parseContactQrPayload(`  ${id.toUpperCase()}@${address}  `)).toEqual({ upeerId: id, address });
  });

  it('rejects an identity-only QR because there is nowhere to connect', () => {
    const result = parseContactQrPayload(id);
    expect(result).toHaveProperty('error');
  });

  it('rejects unknown content', () => {
    expect(parseContactQrPayload('https://example.com')).toHaveProperty('error');
    expect(parseContactQrPayload('')).toHaveProperty('error');
  });

  it('rejects a malformed identity', () => {
    expect(parseContactQrPayload(`abc@${address}`)).toHaveProperty('error');
    expect(parseContactQrPayload(`zz${'a'.repeat(62)}@${address}`)).toHaveProperty('error');
  });

  it('rejects an address outside the network', () => {
    expect(parseContactQrPayload(`${id}@fd00::1`)).toHaveProperty('error');
    expect(parseContactQrPayload(`${id}@not-an-address`)).toHaveProperty('error');
  });

  it('rejects half a payload', () => {
    expect(parseContactQrPayload(`@${address}`)).toHaveProperty('error');
    expect(parseContactQrPayload(`${id}@`)).toHaveProperty('error');
  });
});
