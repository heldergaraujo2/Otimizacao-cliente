/**
 * ModulusCryptor: the container cipher used by ".map"/".att"/".bmd" files of modern MU clients.
 *
 * Format: 4-byte magic ("ATT\x01", "MAP\x01", ...) followed by a 34-byte body header whose first
 * two bytes select two legacy block ciphers. Stage 1 partially decrypts 1024-byte aligned windows
 * with the fixed product key to recover a per-file key; stage 2 decrypts the payload with it.
 *
 * The container logic is implemented here; the legacy ciphers are registered in a table. TEA and
 * RC5 are implemented; the remaining reference algorithms throw a typed, diagnosable error instead
 * of silently producing garbage. See docs/ASSET_PIPELINE.md for the verification status of each.
 */

import { TeaCipher } from './legacy/tea.js';
import { Rc5Cipher } from './legacy/rc5.js';

export interface LegacyCipher {
  readonly name: string;
  readonly blockSize: number;
  blockDecrypt(data: Uint8Array): void;
}

export type CipherFactory = (key: Uint8Array) => LegacyCipher;

export class UnsupportedCipherError extends Error {
  constructor(
    readonly algorithmIndex: number,
    readonly algorithmName: string,
  ) {
    super(
      `ModulusCryptor algorithm ${algorithmIndex} (${algorithmName}) is not implemented yet; ` +
        'see packages/mu-formats/src/crypto/modulus-cryptor.ts and docs/ASSET_PIPELINE.md',
    );
    this.name = 'UnsupportedCipherError';
  }
}

/** Algorithm ids as stored in the container header (value & 7). */
export const CIPHER_NAMES = [
  'TEA',
  'ThreeWay',
  'CAST5',
  'RC5',
  'RC6',
  'MARS',
  'IDEA',
  'GOST',
] as const;

const REGISTRY: Array<CipherFactory | undefined> = [
  (key) => new TeaCipher(key),
  undefined, // ThreeWay
  undefined, // CAST5
  (key) => new Rc5Cipher(key),
  undefined, // RC6
  undefined, // MARS
  undefined, // IDEA
  undefined, // GOST
];

function createCipher(algorithm: number, key: Uint8Array): LegacyCipher {
  const index = algorithm & 7;
  const factory = REGISTRY[index];
  if (!factory) throw new UnsupportedCipherError(index, CIPHER_NAMES[index]!);
  return factory(key);
}

const PRODUCT_KEY = new TextEncoder().encode('webzen#@!01webzen#@!01webzen#@!0');

export interface ModulusCryptorInfo {
  algorithm1: number;
  algorithm2: number;
  name1: string;
  name2: string;
  recoveredKey: Uint8Array;
}

export interface ModulusCryptorResult {
  data: Uint8Array;
  info: ModulusCryptorInfo;
}

export function modulusCryptorMagic(data: Uint8Array): string | undefined {
  if (data.length < 4) return undefined;
  const ascii = String.fromCharCode(data[0], data[1], data[2]);
  if (!/^[A-Z]{3}$/.test(ascii)) return undefined;
  return `${ascii}\x01`;
}

/**
 * Decrypts a ModulusCryptor payload. `source` must start with the algorithm header (i.e. the
 * 4-byte magic has already been stripped, exactly like the reference reader does).
 */
export function decryptModulusCryptor(source: Uint8Array): ModulusCryptorResult {
  if (source.length < 34) throw new Error('ModulusCryptor: source buffer too short');

  const buffer = source.slice();
  const algorithm2 = buffer[0];
  const algorithm1 = buffer[1];
  const dataSize = buffer.length - 34;

  const cipher1 = createCipher(algorithm1, PRODUCT_KEY);
  const blockSize = 1024 - (1024 % cipher1.blockSize);

  if (dataSize > 4 * blockSize) {
    const index = 2 + (dataSize >>> 1);
    const block = buffer.slice(index, index + blockSize);
    cipher1.blockDecrypt(block);
    buffer.set(block, index);
  }

  if (dataSize > blockSize) {
    let index = source.length - blockSize;
    let block = buffer.slice(index, index + blockSize);
    cipher1.blockDecrypt(block);
    buffer.set(block, index);

    index = 2;
    block = buffer.slice(index, index + blockSize);
    cipher1.blockDecrypt(block);
    buffer.set(block, index);
  }

  const recoveredKey = buffer.slice(2, 34);
  const cipher2 = createCipher(algorithm2, recoveredKey);
  const decryptSize = dataSize - (dataSize % cipher2.blockSize);
  if (decryptSize > 0) {
    const block = buffer.slice(34, 34 + decryptSize);
    cipher2.blockDecrypt(block);
    buffer.set(block, 34);
  }

  return {
    data: buffer.slice(34),
    info: {
      algorithm1: algorithm1 & 7,
      algorithm2: algorithm2 & 7,
      name1: CIPHER_NAMES[algorithm1 & 7]!,
      name2: CIPHER_NAMES[algorithm2 & 7]!,
      recoveredKey,
    },
  };
}

/**
 * Returns the plaintext of a resource file that may be wrapped in a ModulusCryptor container.
 * When the buffer does not carry a known magic the caller is expected to try FileCryptor instead.
 */
export function tryDecryptModulusCryptor(
  payload: Uint8Array,
  magic: string,
): ModulusCryptorResult | undefined {
  if (modulusCryptorMagic(payload) !== magic) return undefined;
  return decryptModulusCryptor(payload.subarray(4));
}
