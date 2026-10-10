/**
 * TEA (Tiny Encryption Algorithm) as used inside MU Online's ModulusCryptor container.
 *
 * 64-bit blocks, 128-bit key, 32 rounds, little-endian words. Implemented from the published TEA
 * description. It also provides the encryption direction, which the fixture generator uses to
 * produce test data (the shipping clients only need decryption).
 *
 * Verification status: round-trip tested inside this repository; not yet validated against a real
 * ModulusCryptor-encrypted game file (blocked: no game data in this environment).
 */

import type { LegacyCipher } from '../modulus-cryptor.js';

const DELTA = 0x9e3779b9;
const ROUNDS = 32;

export class TeaCipher implements LegacyCipher {
  readonly name = 'TEA';
  readonly blockSize = 8;
  private readonly key: Uint32Array;

  constructor(key: Uint8Array) {
    if (key.length < 16) throw new Error('TEA requires a 16-byte key');
    this.key = new Uint32Array(4);
    for (let i = 0; i < 4; i++) {
      this.key[i] = (key[i * 4] | (key[i * 4 + 1] << 8) | (key[i * 4 + 2] << 16) | (key[i * 4 + 3] << 24)) >>> 0;
    }
  }

  blockDecrypt(data: Uint8Array): void {
    if (data.length % 8 !== 0) throw new Error('TEA: data length must be a multiple of 8');
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    for (let offset = 0; offset < data.length; offset += 8) {
      let v0 = view.getUint32(offset, true);
      let v1 = view.getUint32(offset + 4, true);
      let sum = (DELTA * ROUNDS) >>> 0;
      for (let i = 0; i < ROUNDS; i++) {
        v1 = (v1 - (((v0 << 4) + this.key[2]) ^ ((v0 + sum) >>> 0) ^ ((v0 >>> 5) + this.key[3]))) >>> 0;
        v0 = (v0 - (((v1 << 4) + this.key[0]) ^ ((v1 + sum) >>> 0) ^ ((v1 >>> 5) + this.key[1]))) >>> 0;
        sum = (sum - DELTA) >>> 0;
      }
      view.setUint32(offset, v0, true);
      view.setUint32(offset + 4, v1, true);
    }
  }

  blockEncrypt(data: Uint8Array): void {
    if (data.length % 8 !== 0) throw new Error('TEA: data length must be a multiple of 8');
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    for (let offset = 0; offset < data.length; offset += 8) {
      let v0 = view.getUint32(offset, true);
      let v1 = view.getUint32(offset + 4, true);
      let sum = 0;
      for (let i = 0; i < ROUNDS; i++) {
        sum = (sum + DELTA) >>> 0;
        v0 = (v0 + (((v1 << 4) + this.key[0]) ^ ((v1 + sum) >>> 0) ^ ((v1 >>> 5) + this.key[1]))) >>> 0;
        v1 = (v1 + (((v0 << 4) + this.key[2]) ^ ((v0 + sum) >>> 0) ^ ((v0 >>> 5) + this.key[3]))) >>> 0;
      }
      view.setUint32(offset, v0, true);
      view.setUint32(offset + 4, v1, true);
    }
  }
}
