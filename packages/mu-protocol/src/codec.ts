/**
 * Little/big endian primitives used by MU Online packets.
 *
 * Note: MU Online mixes endianness. Packet *length fields* and object ids are big endian,
 * while most numeric game fields are little endian. Each packet builder below documents which
 * one it uses, following the OpenMU packet definitions.
 */

export class ByteWriter {
  private buf: Uint8Array;
  private view: DataView;
  private pos = 0;

  constructor(capacity = 64) {
    this.buf = new Uint8Array(capacity);
    this.view = new DataView(this.buf.buffer);
  }

  private ensure(extra: number): void {
    if (this.pos + extra <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.pos + extra) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.pos));
    this.buf = next;
    this.view = new DataView(this.buf.buffer);
  }

  get length(): number {
    return this.pos;
  }

  u8(value: number): this {
    this.ensure(1);
    this.buf[this.pos++] = value & 0xff;
    return this;
  }

  u16le(value: number): this {
    this.ensure(2);
    this.view.setUint16(this.pos, value & 0xffff, true);
    this.pos += 2;
    return this;
  }

  u16be(value: number): this {
    this.ensure(2);
    this.view.setUint16(this.pos, value & 0xffff, false);
    this.pos += 2;
    return this;
  }

  u32le(value: number): this {
    this.ensure(4);
    this.view.setUint32(this.pos, value >>> 0, true);
    this.pos += 4;
    return this;
  }

  u32be(value: number): this {
    this.ensure(4);
    this.view.setUint32(this.pos, value >>> 0, false);
    this.pos += 4;
    return this;
  }

  /** Fixed-size ASCII string, zero padded. */
  ascii(value: string, size: number): this {
    this.ensure(size);
    for (let i = 0; i < size; i++) {
      this.buf[this.pos + i] = i < value.length ? value.charCodeAt(i) & 0xff : 0;
    }
    this.pos += size;
    return this;
  }

  bytes(value: Uint8Array): this {
    this.ensure(value.length);
    this.buf.set(value, this.pos);
    this.pos += value.length;
    return this;
  }

  /** Nibble-count prefixed binary blob, as used by character appearance. */
  preview(): Uint8Array {
    return this.buf.subarray(0, this.pos);
  }

  toUint8Array(): Uint8Array {
    return this.buf.slice(0, this.pos);
  }
}

export class ByteReader {
  private view: DataView;
  private pos: number;

  constructor(private readonly data: Uint8Array, offset = 0) {
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    this.pos = offset;
  }

  get offset(): number {
    return this.pos;
  }

  get remaining(): number {
    return this.data.length - this.pos;
  }

  seek(position: number): this {
    this.pos = position;
    return this;
  }

  u8(): number {
    return this.view.getUint8(this.pos++);
  }

  u16le(): number {
    const value = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return value;
  }

  u16be(): number {
    const value = this.view.getUint16(this.pos, false);
    this.pos += 2;
    return value;
  }

  u32le(): number {
    const value = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return value;
  }

  u32be(): number {
    const value = this.view.getUint32(this.pos, false);
    this.pos += 4;
    return value;
  }

  ascii(size: number): string {
    let out = '';
    for (let i = 0; i < size; i++) {
      const c = this.data[this.pos + i];
      if (c === 0) continue;
      out += String.fromCharCode(c);
    }
    this.pos += size;
    return out;
  }

  bytes(size: number): Uint8Array {
    const out = this.data.slice(this.pos, this.pos + size);
    this.pos += size;
    return out;
  }
}

export function asciiBytes(value: string, size: number): Uint8Array {
  const out = new Uint8Array(size);
  for (let i = 0; i < size; i++) out[i] = i < value.length ? value.charCodeAt(i) & 0xff : 0;
  return out;
}

export function toHex(data: Uint8Array): string {
  let out = '';
  for (const b of data) out += b.toString(16).padStart(2, '0');
  return out;
}

export function fromHex(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}
