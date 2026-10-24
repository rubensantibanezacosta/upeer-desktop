import { describe, expect, it } from 'vitest';

import { computeSafetyNumber } from '../../../src/main_process/security/safetyNumber.js';

const keyA = 'ab'.repeat(32);
const keyB = 'cd'.repeat(32);
const keyC = '01'.repeat(32);

describe('computeSafetyNumber', () => {
  it('matches the digest shared with the mobile SafetyNumberTest', () => {
    expect(computeSafetyNumber(keyA, keyB)).toBe('DCD7D 37B4A 82F51 61C1A D6968 B78C2 9B905 C3AF1');
    expect(computeSafetyNumber(keyC, keyA)).toBe('85103 6F62C 6A7A2 8DA91 6590B AD433 29E65 6BAFE');
  });

  it('is symmetric regardless of argument order', () => {
    expect(computeSafetyNumber(keyA, keyB)).toBe(computeSafetyNumber(keyB, keyA));
  });

  it('accepts uppercase input', () => {
    expect(computeSafetyNumber(keyA.toUpperCase(), keyB)).toBe(computeSafetyNumber(keyA, keyB));
  });

  it('rejects malformed keys', () => {
    expect(computeSafetyNumber('', keyB)).toBe('');
    expect(computeSafetyNumber(keyA, 'zz'.repeat(32))).toBe('');
    expect(computeSafetyNumber(keyA.slice(0, -1), keyB)).toBe('');
  });

  it('formats eight groups of five', () => {
    const groups = computeSafetyNumber(keyA, keyB).split(' ');
    expect(groups).toHaveLength(8);
    expect(groups.every((group) => group.length === 5)).toBe(true);
  });
});
