/**
 * SimpleModulus: the block cipher used by MU Online for C3/C4 packets.
 *
 * Design: each plaintext block (8 bytes for the "New" variant, 32 bytes for "Old") is split into
 * 16-bit words. Every word is transformed with a modular multiplication chain and the resulting
 * 18-bit values are packed MSB-first into 9 (resp. 36) bytes. Two trailing bytes carry the block
 * size and a XOR checksum. The "New" variant additionally prefixes a per-packet counter byte
 * inside the encrypted payload.
 *
 * Algorithm and default keys: MUnique/OpenMU (MIT License, Copyright 2017 MUnique),
 * `src/Network/SimpleModulus/*.cs`. This TypeScript implementation is validated byte-for-byte
 * against OpenMU's own test vectors (tests/vectors/openmu_simplemodulus.json).
 */

import { headerSizeOf } from './xor.js';

const BLOCK_SIZE_XOR_KEY = 0x3d;
const BLOCK_CHECKSUM_XOR_KEY = 0xf8;
const BITS_PER_VALUE = 18;

export interface SimpleModulusKeys {
  modulusKey: number[];
  xorKey: number[];
  encryptKey: number[];
  decryptKey: number[];
}

export function createEncryptionKeys(encryptionKey: number[]): SimpleModulusKeys {
  if (encryptionKey.length !== 12) throw new Error('encryption key must have 12 values');
  return {
    modulusKey: encryptionKey.slice(0, 4),
    encryptKey: encryptionKey.slice(4, 8),
    xorKey: encryptionKey.slice(8, 12),
    decryptKey: [0, 0, 0, 0],
  };
}

export function createDecryptionKeys(decryptionKey: number[]): SimpleModulusKeys {
  if (decryptionKey.length !== 12) throw new Error('decryption key must have 12 values');
  return {
    modulusKey: decryptionKey.slice(0, 4),
    decryptKey: decryptionKey.slice(4, 8),
    xorKey: decryptionKey.slice(8, 12),
    encryptKey: [0, 0, 0, 0],
  };
}

/**
 * Default keys of the original protocol. The client encrypts with `encryptorClient` and decrypts
 * with `decryptorClient`; the server uses the mirrored pair.
 */
export const DEFAULT_KEYS = {
  /** PipelinedSimpleModulusEncryptor.DefaultClientKey */
  encryptorClient: createEncryptionKeys([
    128079, 164742, 70235, 106898, 23489, 11911, 19816, 13647, 48413, 46165, 15171, 37433,
  ]),
  /** PipelinedSimpleModulusEncryptor.DefaultServerKey */
  encryptorServer: createEncryptionKeys([
    73326, 109989, 98843, 171058, 13169, 19036, 35482, 29587, 62004, 64409, 35374, 64599,
  ]),
  /** PipelinedSimpleModulusDecryptor.DefaultClientKey */
  decryptorClient: createDecryptionKeys([
    73326, 109989, 98843, 171058, 18035, 30340, 24701, 11141, 62004, 64409, 35374, 64599,
  ]),
  /** PipelinedSimpleModulusDecryptor.DefaultServerKey */
  decryptorServer: createDecryptionKeys([
    128079, 164742, 70235, 106898, 31544, 2047, 57011, 10183, 48413, 46165, 15171, 37433,
  ]),
} as const;

interface VariantConfig {
  decryptedBlockSize: number;
  encryptedBlockSize: number;
  resultCount: number;
  hasCounter: boolean;
}

const VARIANTS: Record<'new' | 'old', VariantConfig> = {
  new: { decryptedBlockSize: 8, encryptedBlockSize: 11, resultCount: 4, hasCounter: true },
  old: { decryptedBlockSize: 32, encryptedBlockSize: 38, resultCount: 16, hasCounter: false },
};

/**
 * Bit layout of the encrypted block. Each 18-bit value starts at bit index `index * 18`.
 * The layout writes the value with reversed byte order plus a 2-bit remainder, which is what the
 * original implementation does - see OpenMU `PipelinedSimpleModulusEncryptor.WriteResultToTarget`.
 * This is intentionally a faithful transliteration, not a "clean" bit packer: any other layout
 * would break interoperability with the original client/server.
 */
function getBitIndex(resultIndex: number): number {
  return resultIndex * BITS_PER_VALUE;
}

function getByteOffset(resultIndex: number): number {
  return getBitIndex(resultIndex) >> 3;
}

function getBitOffset(resultIndex: number): number {
  return getBitIndex(resultIndex) & 7;
}

function getFirstBitMask(resultIndex: number): number {
  return 0xff >> getBitOffset(resultIndex);
}

function getRemainderBitMask(resultIndex: number): number {
  const bitOffset = getBitOffset(resultIndex);
  return (((0xff << (6 - bitOffset)) & 0xff) - ((0xff << (8 - bitOffset)) & 0xff)) & 0xff;
}

function reverseEndianness(value: number): number {
  return (
    ((value >>> 24) | ((value >>> 8) & 0xff00) | ((value & 0xff00) << 8) | (value << 24)) >>> 0
  );
}

function writeResultToTarget(
  target: Uint8Array,
  targetBase: number,
  resultIndex: number,
  result: number,
): void {
  const byteOffset = getByteOffset(resultIndex);
  const bitOffset = getBitOffset(resultIndex);
  const firstMask = getFirstBitMask(resultIndex);
  const swapped = reverseEndianness(result >>> 0);
  let index = targetBase + byteOffset;
  target[index] = (target[index] | ((swapped >>> (24 + bitOffset)) & firstMask)) & 0xff;
  index++;
  target[index] = (swapped >>> (16 + bitOffset)) & 0xff;
  index++;
  target[index] = ((swapped >>> (8 + bitOffset)) & ((0xff << (8 - bitOffset)) & 0xffff)) & 0xff;
  const remainderMask = getRemainderBitMask(resultIndex);
  const remainder = ((result >>> 16) << (6 - bitOffset)) & 0xffff;
  target[index] = (target[index] | (remainder & remainderMask)) & 0xff;
}

function readInputBuffer(data: Uint8Array, base: number, resultIndex: number): number {
  const byteOffset = getByteOffset(resultIndex);
  const bitOffset = getBitOffset(resultIndex);
  const firstMask = getFirstBitMask(resultIndex);
  let index = base + byteOffset;
  let result = ((data[index++] & firstMask) << (24 + bitOffset)) >>> 0;
  result = (result + ((data[index++] << (16 + bitOffset)) >>> 0)) >>> 0;
  result = (result + (((data[index] & ((0xff << (8 - bitOffset)) & 0xffff)) << (8 + bitOffset)) >>> 0)) >>> 0;
  result = reverseEndianness(result);
  const remainderMask = getRemainderBitMask(resultIndex);
  const remainder = data[index] & remainderMask;
  result = (result + ((remainder << 16) >>> (6 - bitOffset))) >>> 0;
  return result;
}

function readU16LE(data: Uint8Array, offset: number): number {
  return data[offset] | (data[offset + 1] << 8);
}

function writeU16LE(data: Uint8Array, offset: number, value: number): void {
  data[offset] = value & 0xff;
  data[offset + 1] = (value >>> 8) & 0xff;
}

/**
 * Parses a full wire packet and returns its declared size, handling both 1- and 2-byte length
 * fields. Throws when the prefix byte is not a MU packet prefix.
 */
export function packetSizeOf(packet: Uint8Array): number {
  switch (packet[0]) {
    case 0xc1:
    case 0xc3:
      return packet[1];
    case 0xc2:
    case 0xc4:
      return (packet[1] << 8) | packet[2];
    default:
      throw new Error(`invalid packet prefix 0x${(packet[0] ?? 0).toString(16)}`);
  }
}

/** Writes the packet length into the header. Length is big endian for C2/C4. */
export function writePacketSize(packet: Uint8Array): void {
  const size = packet.length;
  switch (packet[0]) {
    case 0xc1:
    case 0xc3:
      packet[1] = size & 0xff;
      break;
    case 0xc2:
    case 0xc4:
      packet[1] = (size >>> 8) & 0xff;
      packet[2] = size & 0xff;
      break;
    default:
      throw new Error('invalid packet prefix');
  }
}

export class SimpleModulusEncryptor {
  private counter = 0;

  constructor(
    private readonly keys: SimpleModulusKeys,
    private readonly variant: 'new' | 'old' = 'new',
  ) {
    const cfg = VARIANTS[variant];
    if (keys.modulusKey.length !== cfg.resultCount) {
      throw new Error(`key length ${keys.modulusKey.length} does not match variant '${variant}'`);
    }
  }

  reset(): void {
    this.counter = 0;
  }

  /** Encrypts a complete packet. Packets below 0xC3 are passed through unchanged. */
  encryptPacket(packet: Uint8Array): Uint8Array {
    if (packet.length === 0) throw new Error('empty packet');
    if (packet[0] < 0xc3) return packet.slice();

    const cfg = VARIANTS[this.variant];
    const headerSize = headerSizeOf(packet[0]);
    if (headerSize === 0) throw new Error('invalid packet prefix');
    if (!cfg.hasCounter && headerSize !== 3) {
      // Old variant C3 packets have no counter; nothing special to do, kept for clarity.
    }

    const content = packet.subarray(headerSize);
    const counterSize = cfg.hasCounter ? 1 : 0;
    const decryptedContentSize = content.length + counterSize;
    const blockCount = Math.ceil(decryptedContentSize / cfg.decryptedBlockSize);
    const out = new Uint8Array(headerSize + blockCount * cfg.encryptedBlockSize);
    out[0] = packet[0];
    writePacketSize(out);

    const block = new Uint8Array(cfg.decryptedBlockSize);
    let sourceOffset = 0;
    let resultOffset = headerSize;

    if (cfg.hasCounter) {
      // First block carries the counter byte as its first plaintext byte.
      block.fill(0);
      block[0] = this.counter & 0xff;
      const firstCopy = Math.min(cfg.decryptedBlockSize - 1, content.length);
      block.set(content.subarray(0, firstCopy), 1);
      const firstBlockSize = Math.min(cfg.decryptedBlockSize, content.length + 1);
      this.encryptBlock(block, out, resultOffset, firstBlockSize);
      sourceOffset = cfg.decryptedBlockSize - 1;
      resultOffset += cfg.encryptedBlockSize;
    }

    while (sourceOffset < content.length) {
      const blockSize = Math.min(cfg.decryptedBlockSize, content.length - sourceOffset);
      block.fill(0);
      block.set(content.subarray(sourceOffset, sourceOffset + blockSize));
      this.encryptBlock(block, out, resultOffset, blockSize);
      sourceOffset += cfg.decryptedBlockSize;
      resultOffset += cfg.encryptedBlockSize;
    }

    if (cfg.hasCounter) {
      this.counter = this.counter >= 255 ? 0 : this.counter + 1;
    }

    return out;
  }

  private encryptBlock(
    input: Uint8Array,
    out: Uint8Array,
    outOffset: number,
    blockSize: number,
  ): void {
    const cfg = VARIANTS[this.variant];
    const { modulusKey, encryptKey, xorKey } = this.keys;
    const words: number[] = [];
    for (let i = 0; i < cfg.resultCount; i++) words.push(readU16LE(input, i * 2));

    const result: number[] = new Array(cfg.resultCount).fill(0);
    result[0] = ((xorKey[0] ^ words[0]) * encryptKey[0]) % modulusKey[0];
    for (let i = 1; i < cfg.resultCount; i++) {
      result[i] =
        ((xorKey[i] ^ (words[i] ^ (result[i - 1] & 0xffff))) * encryptKey[i]) % modulusKey[i];
    }
    for (let i = 0; i < cfg.resultCount - 1; i++) {
      result[i] = (result[i] ^ xorKey[i] ^ (result[i + 1] & 0xffff)) & 0x3ffff;
    }

    for (let i = 0; i < cfg.resultCount * 3; i++) out[outOffset + i] = 0;
    for (let i = 0; i < cfg.resultCount; i++) {
      writeResultToTarget(out, outOffset, i, result[i]);
    }

    let checksum = BLOCK_CHECKSUM_XOR_KEY;
    for (let i = 0; i < blockSize; i++) checksum ^= input[i];
    checksum &= 0xff;
    const size = (blockSize ^ BLOCK_SIZE_XOR_KEY ^ checksum) & 0xff;
    out[outOffset + cfg.encryptedBlockSize - 2] = size;
    out[outOffset + cfg.encryptedBlockSize - 1] = checksum;
  }
}

export class SimpleModulusDecryptor {
  private counter = 0;

  /** When true, blocks with a wrong checksum are decrypted but reported instead of throwing. */
  acceptWrongBlockChecksum = false;
  /** Collects non-fatal decryption warnings (counter/checksum). */
  readonly warnings: string[] = [];

  constructor(
    private readonly keys: SimpleModulusKeys,
    private readonly variant: 'new' | 'old' = 'new',
  ) {
    const cfg = VARIANTS[variant];
    if (keys.modulusKey.length !== cfg.resultCount) {
      throw new Error(`key length ${keys.modulusKey.length} does not match variant '${variant}'`);
    }
  }

  reset(): void {
    this.counter = 0;
  }

  /** Decrypts a complete wire packet. Packets below 0xC3 are passed through unchanged. */
  decryptPacket(packet: Uint8Array): Uint8Array {
    if (packet.length === 0) throw new Error('empty packet');
    if (packet[0] < 0xc3) return packet.slice();

    const cfg = VARIANTS[this.variant];
    const headerSize = headerSizeOf(packet[0]);
    if (headerSize === 0) throw new Error('invalid packet prefix');

    const declaredSize = packetSizeOf(packet);
    if (declaredSize > packet.length) {
      throw new Error(`truncated packet: declared ${declaredSize}, received ${packet.length}`);
    }

    const contentSize = declaredSize - headerSize;
    if (contentSize <= 0 || contentSize % cfg.encryptedBlockSize !== 0) {
      throw new Error(
        `unexpected content size ${contentSize}, must be a multiple of ${cfg.encryptedBlockSize}`,
      );
    }

    const blockCount = contentSize / cfg.encryptedBlockSize;
    const counterSize = cfg.hasCounter ? 1 : 0;
    const plain = new Uint8Array(headerSize + blockCount * cfg.decryptedBlockSize);
    plain[0] = packet[0];

    let decodedSize = 0;
    const outputStart = headerSize - counterSize;
    for (let i = 0; i < blockCount; i++) {
      const blockOffset = headerSize + i * cfg.encryptedBlockSize;
      const blockSize = this.decryptBlock(
        packet,
        blockOffset,
        plain,
        outputStart + i * cfg.decryptedBlockSize,
      );
      if (i === 0 && cfg.hasCounter && plain[outputStart] !== this.counter) {
        const message = `packet counter mismatch: got ${plain[outputStart]}, expected ${this.counter}`;
        this.warnings.push(message);
        throw new Error(message);
      }
      decodedSize += blockSize;
    }

    if (cfg.hasCounter) this.counter = this.counter >= 255 ? 0 : this.counter + 1;

    const total = decodedSize + headerSize - counterSize;
    if (total < headerSize || total > plain.length) {
      throw new Error(`invalid decrypted size ${total}`);
    }
    const result = plain.slice(0, total);
    writePacketSize(result);
    return result;
  }

  private decryptBlock(
    packet: Uint8Array,
    blockOffset: number,
    out: Uint8Array,
    outOffset: number,
  ): number {
    const cfg = VARIANTS[this.variant];
    const { modulusKey, decryptKey, xorKey } = this.keys;

    const result: number[] = new Array(cfg.resultCount).fill(0);
    for (let i = 0; i < cfg.resultCount; i++) {
      result[i] = readInputBuffer(packet, blockOffset, i);
    }
    for (let i = cfg.resultCount - 1; i > 0; i--) {
      result[i - 1] = (result[i - 1] ^ xorKey[i - 1] ^ (result[i] & 0xffff)) & 0x3ffff;
    }

    const words: number[] = new Array(cfg.resultCount).fill(0);
    for (let i = 0; i < cfg.resultCount; i++) {
      let value = (xorKey[i] ^ ((result[i] * decryptKey[i]) % modulusKey[i])) >>> 0;
      if (i > 0) value ^= result[i - 1] & 0xffff;
      words[i] = value & 0xffff;
    }
    for (let i = 0; i < cfg.resultCount; i++) writeU16LE(out, outOffset + i * 2, words[i]);

    const sizeByte = packet[blockOffset + cfg.encryptedBlockSize - 2];
    const checksumByte = packet[blockOffset + cfg.encryptedBlockSize - 1];
    const blockSize = (sizeByte ^ checksumByte ^ BLOCK_SIZE_XOR_KEY) & 0xff;
    if (blockSize > cfg.decryptedBlockSize) {
      throw new Error(`invalid block size ${blockSize} (max ${cfg.decryptedBlockSize})`);
    }

    let checksum = BLOCK_CHECKSUM_XOR_KEY;
    for (let i = 0; i < cfg.decryptedBlockSize; i++) checksum ^= out[outOffset + i];
    checksum &= 0xff;
    if (checksum !== checksumByte) {
      const message = `block checksum mismatch: expected ${checksum}, got ${checksumByte}`;
      this.warnings.push(message);
      if (!this.acceptWrongBlockChecksum) throw new Error(message);
    }

    return blockSize;
  }
}
