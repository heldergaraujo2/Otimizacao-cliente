/**
 * Packet framing: assembling TCP/WebSocket byte streams into MU Online packets.
 *
 * The wire format has no batch framing, so a reader must accumulate bytes until the length
 * declared in the header is available. Length fields are big endian for 2-byte headers.
 */

import { headerSizeOf } from './crypto/xor.js';
import { packetSizeOf } from './crypto/simplemodulus.js';

export interface FramingStats {
  packets: number;
  bytes: number;
  rejected: number;
  lastRejectReason?: string;
}

/**
 * Incremental frame assembler. Push raw bytes, receive zero or more complete packets.
 *
 * Safety limits (a malformed or hostile peer must not be able to exhaust memory):
 * - maximum packet size of 65535 bytes (protocol maximum),
 * - maximum buffered bytes of 4 * 65535,
 * - a packet whose declared size is smaller than its own header is rejected.
 */
export class PacketAssembler {
  private buffer = new Uint8Array(0);
  private buffered = 0;
  readonly stats: FramingStats = { packets: 0, bytes: 0, rejected: 0 };

  static readonly MAX_PACKET_SIZE = 65535;
  static readonly MAX_BUFFERED = 4 * 65535;

  constructor(private readonly onReject?: (reason: string, data: Uint8Array) => void) {}

  push(chunk: Uint8Array): Uint8Array[] {
    if (chunk.length === 0) return [];
    const merged = new Uint8Array(this.buffered + chunk.length);
    merged.set(this.buffer.subarray(0, this.buffered), 0);
    merged.set(chunk, this.buffered);
    this.buffer = merged;
    this.buffered = merged.length;

    const packets: Uint8Array[] = [];
    let offset = 0;
    while (this.buffered - offset >= 3) {
      const prefix = this.buffer[offset];
      const headerSize = headerSizeOf(prefix);
      if (headerSize === 0) {
        this.reject(`invalid packet prefix 0x${prefix.toString(16)}`, offset);
        offset += 1;
        continue;
      }
      if (this.buffered - offset < headerSize) break;
      const size = packetSizeOf(this.buffer.subarray(offset));
      if (size < headerSize + 1 || size > PacketAssembler.MAX_PACKET_SIZE) {
        this.reject(`invalid packet size ${size}`, offset);
        offset += 1;
        continue;
      }
      if (this.buffered - offset < size) break;
      packets.push(this.buffer.slice(offset, offset + size));
      offset += size;
      this.stats.packets++;
      this.stats.bytes += size;
    }

    if (offset > 0) {
      const rest = this.buffer.subarray(offset);
      this.buffer = rest.slice();
      this.buffered = this.buffer.length;
    }
    if (this.buffered > PacketAssembler.MAX_BUFFERED) {
      this.reject(`buffer limit exceeded (${this.buffered} bytes)`, 0);
      this.buffer = new Uint8Array(0);
      this.buffered = 0;
    }
    return packets;
  }

  /** Bytes currently buffered (incomplete packet). */
  get pending(): number {
    return this.buffered;
  }

  reset(): void {
    this.buffer = new Uint8Array(0);
    this.buffered = 0;
  }

  private reject(reason: string, offset: number): void {
    this.stats.rejected++;
    this.stats.lastRejectReason = reason;
    this.onReject?.(reason, this.buffer.slice(offset, offset + 16));
  }
}

/**
 * Creates an unencrypted packet.
 * @param prefix packet prefix byte (0xC1..0xC4)
 * @param code main packet code (e.g. 0xF3) - placed after the length field
 * @param subCode optional sub code (e.g. 0x03) - placed after the code
 * @param payload packet body
 */
export function createPacket(
  prefix: number,
  code: number,
  subCode: number | undefined,
  payload: Uint8Array,
): Uint8Array {
  const headerSize = headerSizeOf(prefix);
  if (headerSize === 0) throw new Error('invalid packet prefix');
  const extra = subCode === undefined ? 0 : 1;
  const packet = new Uint8Array(headerSize + 1 + extra + payload.length);
  packet[0] = prefix;
  let index = headerSize;
  packet[index++] = code;
  if (subCode !== undefined) packet[index++] = subCode;
  packet.set(payload, index);
  const size = packet.length;
  if (prefix === 0xc1 || prefix === 0xc3) {
    if (size > 255) throw new Error('C1/C3 packet exceeds 255 bytes');
    packet[1] = size;
  } else {
    packet[1] = (size >>> 8) & 0xff;
    packet[2] = size & 0xff;
  }
  return packet;
}

/** Reads the packet code (first byte after header) and optional sub code. */
export function readPacketHeader(packet: Uint8Array): {
  prefix: number;
  size: number;
  code: number;
  subCode: number | undefined;
} {
  const headerSize = headerSizeOf(packet[0]);
  if (headerSize === 0) throw new Error('invalid packet prefix');
  return {
    prefix: packet[0],
    size: packetSizeOf(packet),
    code: packet[headerSize],
    subCode: packet.length > headerSize + 1 ? packet[headerSize + 1] : undefined,
  };
}

export function packetName(packet: Uint8Array): string {
  const headerSize = headerSizeOf(packet[0]);
  const code = packet[headerSize] ?? 0;
  const sub = packet.length > headerSize + 1 ? packet[headerSize + 1] : undefined;
  const codeHex = code.toString(16).padStart(2, '0').toUpperCase();
  return sub === undefined
    ? `0x${packet[0].toString(16).toUpperCase()} ${codeHex}`
    : `0x${packet[0].toString(16).toUpperCase()} ${codeHex} ${sub.toString(16).padStart(2, '0').toUpperCase()}`;
}
