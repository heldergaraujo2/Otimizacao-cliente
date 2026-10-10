/**
 * LEA-256-ECB block cipher (KS X 1213), used to encrypt version-15 BMD models of modern MU
 * clients (Season 15+ / Season 20 data packages).
 *
 * Adapted from the ISC-licensed pure-TypeScript port in xulek/muonline-bmd-viewer
 * (src/crypto/lea256.ts, "1-to-1 port of the KISA reference"); the decryption direction is what
 * the resource loader needs. Kept as a small, dependency-free module so the same code runs in
 * Node (tools, tests) and in the browser (client).
 */

const KEY_DELTA = new Uint32Array([
  0xc3efe9db, 0x44626b02, 0x79e27c8a, 0x78df30ec, 0x715ea49e, 0xc785da0a, 0xe04ef22a, 0xe5c40957,
]);

const rol = (x: number, n: number): number => ((x << (n & 31)) | (x >>> (32 - (n & 31)))) >>> 0;
const ror = (x: number, n: number): number => ((x >>> (n & 31)) | (x << (32 - (n & 31)))) >>> 0;

function keySchedule256(keyWords: Uint32Array): Uint32Array {
  const roundKeys = new Uint32Array(192);
  const t = new Uint32Array(keyWords);
  for (let i = 0; i < 32; i++) {
    const delta = KEY_DELTA[i & 7];
    const s = (i * 6) & 7;
    t[(s + 0) & 7] = rol((t[(s + 0) & 7] + rol(delta, i)) >>> 0, 1);
    t[(s + 1) & 7] = rol((t[(s + 1) & 7] + rol(delta, i + 1)) >>> 0, 3);
    t[(s + 2) & 7] = rol((t[(s + 2) & 7] + rol(delta, i + 2)) >>> 0, 6);
    t[(s + 3) & 7] = rol((t[(s + 3) & 7] + rol(delta, i + 3)) >>> 0, 11);
    t[(s + 4) & 7] = rol((t[(s + 4) & 7] + rol(delta, i + 4)) >>> 0, 13);
    t[(s + 5) & 7] = rol((t[(s + 5) & 7] + rol(delta, i + 5)) >>> 0, 17);
    roundKeys.set(
      [t[(s + 0) & 7], t[(s + 1) & 7], t[(s + 2) & 7], t[(s + 3) & 7], t[(s + 4) & 7], t[(s + 5) & 7]],
      i * 6,
    );
  }
  return roundKeys;
}

function roundDecrypt(s: Uint32Array, t: Uint32Array, rk: Uint32Array, offset: number): void {
  t[0] = s[3];
  t[1] = (ror(s[0], 9) - (t[0] ^ rk[offset]) ^ rk[offset + 1]) >>> 0;
  t[2] = (rol(s[1], 5) - (t[1] ^ rk[offset + 2]) ^ rk[offset + 3]) >>> 0;
  t[3] = (rol(s[2], 3) - (t[2] ^ rk[offset + 4]) ^ rk[offset + 5]) >>> 0;
}

export type LeaDecrypt = (cipher: Uint8Array) => Uint8Array;

export function createLea256EcbDecrypt(key: Uint8Array): LeaDecrypt {
  if (key.length !== 32) throw new Error('LEA-256 key must be 32 bytes');

  const keyWords = new Uint32Array(8);
  for (let i = 0; i < 8; i++) {
    keyWords[i] =
      (key[i * 4 + 3] << 24) | (key[i * 4 + 2] << 16) | (key[i * 4 + 1] << 8) | key[i * 4];
  }

  const roundKeys = keySchedule256(keyWords);
  const state = new Uint32Array(4);
  const next = new Uint32Array(4);

  return function decryptEcb(cipher: Uint8Array): Uint8Array {
    if (cipher.length % 16 !== 0) throw new Error('LEA-ECB: length must be a multiple of 16 bytes');
    const out = cipher.slice();
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    for (let offset = 0; offset < out.length; offset += 16) {
      for (let i = 0; i < 4; i++) state[i] = view.getUint32(offset + i * 4, true);
      for (let round = 0; round < 32; round++) {
        roundDecrypt(state, next, roundKeys, (31 - round) * 6);
        state.set(next);
      }
      for (let i = 0; i < 4; i++) view.setUint32(offset + i * 4, state[i], true);
    }
    return out;
  };
}

/** LEA key used by the BMD v15 container. */
export const BMD_LEA_KEY = new Uint8Array([
  0xcc, 0x50, 0x45, 0x13, 0xc2, 0xa6, 0x57, 0x4e, 0xd6, 0x9a, 0x45, 0x89, 0xbf, 0x2f, 0xbc, 0xd9,
  0x39, 0xb3, 0xb3, 0xbd, 0x50, 0xbd, 0xcc, 0xb6, 0x85, 0x46, 0xd1, 0xd6, 0x16, 0x54, 0xe0, 0x87,
]);
