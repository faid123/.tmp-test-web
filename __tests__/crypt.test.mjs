import { lol } from '../src/crypt.js';

describe('lol function (encrypt/decrypt)', () => {
  test('should encrypt and decrypt numeric case ID correctly', () => {
    const caseId = 1199;
    const encrypted = lol(caseId);
    expect(typeof encrypted).toBe('string');
    expect(encrypted).not.toBe(String(caseId));

    const decrypted = lol(encrypted);
    expect(decrypted).toBe(caseId);
  });

  test('should return different encryption for different IDs', () => {
    const id1 = 123;
    const id2 = 456;
    const encrypted1 = lol(id1);
    const encrypted2 = lol(id2);
    expect(encrypted1).not.toBe(encrypted2);
  });

  test('should handle invalid encrypted input gracefully and return NaN', () => {
    let result;
    try {
      result = lol('invalidEncryptedString');
    } catch (e) {
      result = NaN; // 若抛错，也视为失败解密
    }
    expect(Number.isNaN(result)).toBe(true);
  });
});
