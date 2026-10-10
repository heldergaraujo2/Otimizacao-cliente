/**
 * `decode-packet <hex>`: explains a raw MU packet. Reads the framing, decrypts the SimpleModulus
 * blocks with the right key pair for the direction, and decodes the packets we have codecs for
 * (login credentials use XOR3 internally, which this command applies for you).
 */

import {
  DEFAULT_KEYS,
  packetName,
  parseLoginLongPassword,
  readPacketHeader,
  SimpleModulusDecryptor,
  xor32DecryptInPlace,
} from '@mu-reengineer/protocol';

export interface DecodedPacket {
  rawBytes: number;
  prefix: string;
  declaredSize?: number;
  code?: string;
  declaredName?: string;
  encrypted: boolean;
  decryptedBytes?: number;
  counter?: number;
  plainHex?: string;
  parsed?: Record<string, unknown>;
  errors: string[];
}

function hexToBytes(text: string): Uint8Array {
  const clean = text.replace(/0x/gi, '').replace(/[\s,:]/g, '');
  if (clean.length === 0 || clean.length % 2 !== 0 || /[^0-9a-f]/i.test(clean)) {
    throw new Error('packet hex must have an even number of hex digits');
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function decodePacketHex(hex: string, options: { direction?: 'c2s' | 's2c'; xor32?: boolean } = {}): DecodedPacket {
  const direction = options.direction ?? 'c2s';
  const bytes = hexToBytes(hex);
  const result: DecodedPacket = { rawBytes: bytes.length, prefix: bytes[0] !== undefined ? `0x${bytes[0].toString(16).padStart(2, '0')}` : '?', encrypted: false, errors: [] };

  const work = bytes.slice();
  // XOR32 masks everything after the header (the helper starts at headerSize + 1 internally).
  if (options.xor32) xor32DecryptInPlace(work);

  let header;
  try {
    header = readPacketHeader(work);
  } catch (error) {
    result.errors.push((error as Error).message);
    return result;
  }
  result.declaredSize = header.size;
  result.code = `0x${header.code.toString(16).padStart(2, '0')}`;
  result.declaredName = packetName(work);
  if (header.size !== work.length) {
    result.errors.push(`declared size ${header.size} differs from the ${work.length} bytes provided`);
  }

  if (work[0] !== undefined && work[0] >= 0xc3) {
    result.encrypted = true;
    const decryptor = new SimpleModulusDecryptor(direction === 'c2s' ? DEFAULT_KEYS.decryptorServer : DEFAULT_KEYS.decryptorClient);
    try {
      const plain = decryptor.decryptPacket(work);
      result.decryptedBytes = plain.length;
      // The decrypted layout is [prefix, size, code, subCode, ...payload]; the cipher counter is
      // consumed by the decryptor (it is not part of the plaintext), so read it from the decryptor.
      result.counter = decryptor.lastCounter;
      result.plainHex = [...plain].map((b) => b.toString(16).padStart(2, '0')).join(' ');
      const plainHeader = readPacketHeader(plain);
      result.parsed = { decryptedName: packetName(plain), code: `0x${plainHeader.code.toString(16).padStart(2, '0')}`, subCode: plainHeader.subCode };

      if (plainHeader.code === 0xf1 && plainHeader.subCode === 0x01 && plain.length >= 59) {
        try {
          result.parsed = { ...result.parsed, ...parseLoginLongPassword(plain) };
        } catch (error) {
          result.errors.push(`login decode failed: ${(error as Error).message}`);
        }
      }
    } catch (error) {
      result.errors.push(`SimpleModulus (${direction === 'c2s' ? 'server' : 'client'} keys): ${(error as Error).message}`);
    }
  } else {
    result.plainHex = [...work].map((b) => b.toString(16).padStart(2, '0')).join(' ');
  }

  return result;
}

export function formatDecodedPacket(result: DecodedPacket): string[] {
  const lines: string[] = [];
  lines.push(`prefix ${result.prefix}  ${result.rawBytes} bytes  ${result.encrypted ? 'encrypted (SimpleModulus)' : 'plain'}`);
  if (result.declaredSize !== undefined) lines.push(`  declared size: ${result.declaredSize}`);
  if (result.declaredName) lines.push(`  packet: ${result.declaredName}`);
  if (result.decryptedBytes !== undefined) lines.push(`  decrypted: ${result.decryptedBytes} bytes, counter=${result.counter}`);
  if (result.parsed) {
    for (const [key, value] of Object.entries(result.parsed)) lines.push(`  ${key}: ${String(value)}`);
  }
  if (result.plainHex) lines.push(`  plain: ${result.plainHex}`);
  for (const error of result.errors) lines.push(`  ! ${error}`);
  return lines;
}
