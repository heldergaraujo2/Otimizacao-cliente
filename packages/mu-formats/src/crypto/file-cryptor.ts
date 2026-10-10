/**
 * FileCryptor and BuxCryptor - the two lightweight file-level ciphers of MU Online.
 *
 * FileCryptor encrypts .map, .obj, .att and version-12 .bmd files. The algorithm is a running
 * XOR/add chain with a 16-byte key; the implementation below is written from the format
 * definition and cross-checked against the reference readers in
 * xulek/muonline-bmd-viewer (ISC) and xulek/muonline (no license, read-only reference).
 */

const MAP_XOR_KEY = new Uint8Array([
  0xd1, 0x73, 0x52, 0xf6, 0xd2, 0x9a, 0xcb, 0x27, 0x3e, 0xaf, 0x59, 0x31, 0x37, 0xb3, 0xe7, 0xa2,
]);

const KEY_INCREMENT = 0x3d;
const INITIAL_MAP_KEY = 0x5e;

export function decryptFileCryptor(source: Uint8Array): Uint8Array {
  const out = new Uint8Array(source.length);
  let mapKey = INITIAL_MAP_KEY;
  for (let i = 0; i < source.length; i++) {
    out[i] = ((source[i] ^ MAP_XOR_KEY[i & 15]) - mapKey) & 0xff;
    mapKey = (source[i] + KEY_INCREMENT) & 0xff;
  }
  return out;
}

export function encryptFileCryptor(source: Uint8Array): Uint8Array {
  const out = new Uint8Array(source.length);
  let mapKey = INITIAL_MAP_KEY;
  for (let i = 0; i < source.length; i++) {
    const encrypted = ((source[i] + mapKey) & 0xff) ^ MAP_XOR_KEY[i & 15];
    out[i] = encrypted;
    mapKey = (encrypted + KEY_INCREMENT) & 0xff;
  }
  return out;
}

/** 3-byte repeating XOR mask applied to .bux files and to decrypted .att buffers. */
export const BUX_CODE = new Uint8Array([0xfc, 0xcf, 0xab]);

export function xorBuxMask(buffer: Uint8Array): Uint8Array {
  const out = new Uint8Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    out[i] = (buffer[i] ^ BUX_CODE[i % 3]) & 0xff;
  }
  return out;
}

/** In-place variant, used by hot paths (terrain loading). */
export function xorBuxMaskInPlace(buffer: Uint8Array): void {
  for (let i = 0; i < buffer.length; i++) {
    buffer[i] = (buffer[i] ^ BUX_CODE[i % 3]) & 0xff;
  }
}

/**
 * Bux files use the same mask but restart the cycle for every record.
 */
export function xorBuxMaskPerRecord(data: Uint8Array, recordSize: number): Uint8Array {
  const out = data.slice();
  for (let i = 0; i < out.length; i++) {
    out[i] = (out[i] ^ BUX_CODE[i % recordSize % 3]) & 0xff;
  }
  return out;
}
