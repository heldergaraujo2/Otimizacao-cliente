/**
 * RC5 (32-bit words, 12 rounds) as used inside MU Online's ModulusCryptor container.
 *
 * Implemented from the published RC5 specification (RFC 2040) with the classical MU parameters
 * (w = 32, r = 12, b = 16). Both directions are provided: decryption for resource loading,
 * encryption for the fixture generator.
 *
 * Verification status: round-trip tested inside this repository; not yet validated against a real
 * ModulusCryptor-encrypted game file (blocked: no game data in this environment).
 */

import type { LegacyCipher } from '../modulus-cryptor.js';

const P32 = 0xb7e15163;
const Q32 = 0x9e3779b9;
const ROUNDS = 12;
const SUBKEY_COUNT = 2 * (ROUNDS + 1);

export class Rc5Cipher implements LegacyCipher {
  readonly name = 'RC5';
  readonly blockSize = 8;
  private readonly subkeys: Uint32Array;

  constructor(key: Uint8Array) {
    const keyWords = new Uint32Array(Math.max(1, Math.ceil(key.length / 4)));
    for (let i = 0; i < key.length; i++) {
      keyWords[i >>> 2] |= key[i] << ((i & 3) * 8);
    }
    this.subkeys = new Uint32Array(SUBKEY_COUNT);
    this.subkeys[0] = P32;
    for (let i = 1; i < SUBKEY_COUNT; i++) {
      this.subkeys[i] = (this.subkeys[i - 1] + Q32) >>> 0;
    }

    let a = 0;
    let b = 0;
    let i = 0;
    let j = 0;
    const iterations = 3 * Math.max(SUBKEY_COUNT, keyWords.length);
    for (let k = 0; k < iterations; k++) {
      a = this.subkeys[i] = rotateLeft((this.subkeys[i] + a + b) >>> 0, 3);
      b = keyWords[j] = rotateLeft((keyWords[j] + a + b) >>> 0, (a + b) & 31);
      i = (i + 1) % SUBKEY_COUNT;
      j = (j + 1) % keyWords.length;
    }
  }

  blockDecrypt(data: Uint8Array): void {
    if (data.length % 8 !== 0) throw new Error('RC5: data length must be a multiple of 8');
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    for (let offset = 0; offset < data.length; offset += 8) {
      let a = view.getUint32(offset, true);
      let b = view.getUint32(offset + 4, true);
      for (let round = ROUNDS; round >= 1; round--) {
        b = (rotateRight((b - this.subkeys[2 * round + 1]) >>> 0, a & 31) ^ a) >>> 0;
        a = (rotateRight((a - this.subkeys[2 * round]) >>> 0, b & 31) ^ b) >>> 0;
      }
      a = (a - this.subkeys[0]) >>> 0;
      b = (b - this.subkeys[1]) >>> 0;
      view.setUint32(offset, a, true);
      view.setUint32(offset + 4, b, true);
    }
  }

  blockEncrypt(data: Uint8Array): void {
    if (data.length % 8 !== 0) throw new Error('RC5: data length must be a multiple of 8');
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    for (let offset = 0; offset < data.length; offset += 8) {
      let a = (view.getUint32(offset, true) + this.subkeys[0]) >>> 0;
      let b = (view.getUint32(offset + 4, true) + this.subkeys[1]) >>> 0;
      for (let round = 1; round <= ROUNDS; round++) {
        a = (rotateLeft((a ^ b) >>> 0, b & 31) + this.subkeys[2 * round]) >>> 0;
        b = (rotateLeft((b ^ a) >>> 0, a & 31) + this.subkeys[2 * round + 1]) >>> 0;
      }
      view.setUint32(offset, a, true);
      view.setUint32(offset + 4, b, true);
    }
  }
}

function rotateLeft(value: number, amount: number): number {
  const shift = amount & 31;
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function rotateRight(value: number, amount: number): number {
  const shift = amount & 31;
  return ((value >>> shift) | (value << (32 - shift))) >>> 0;
}
