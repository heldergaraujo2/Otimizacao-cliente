import assert from 'node:assert/strict';
import test from 'node:test';

import { PacketAssembler, createPacket, readPacketHeader } from '../framing.js';
import { toHex } from '../codec.js';
import { xor32DecryptInPlace, xor32EncryptInPlace, xor3InPlace } from '../crypto/xor.js';

test('createPacket writes a valid C1 header with the total length', () => {
  const packet = createPacket(0xc1, 0xf3, 0x03, new Uint8Array([1, 2, 3]));
  assert.equal(packet[0], 0xc1);
  assert.equal(packet[1], 7);
  assert.equal(packet[2], 0xf3);
  assert.equal(packet[3], 0x03);
  const header = readPacketHeader(packet);
  assert.deepEqual(
    { prefix: header.prefix, size: header.size, code: header.code, subCode: header.subCode },
    { prefix: 0xc1, size: 7, code: 0xf3, subCode: 0x03 },
  );
});

test('createPacket writes a big-endian 2-byte length for C2 packets', () => {
  const packet = createPacket(0xc2, 0x12, undefined, new Uint8Array(300));
  assert.equal(packet[0], 0xc2);
  assert.equal((packet[1] << 8) | packet[2], 304);
  assert.equal(readPacketHeader(packet).size, 304);
});

test('the assembler splits a concatenated stream into packets', () => {
  const a = createPacket(0xc1, 0x0d, undefined, new Uint8Array([1, 2]));
  const b = createPacket(0xc3, 0x0e, 0x00, new Uint8Array(10));
  const c = createPacket(0xc2, 0x12, undefined, new Uint8Array(200));
  const stream = new Uint8Array(a.length + b.length + c.length);
  stream.set(a, 0);
  stream.set(b, a.length);
  stream.set(c, a.length + b.length);

  const assembler = new PacketAssembler();
  const packets = assembler.push(stream);
  assert.equal(packets.length, 3);
  assert.equal(toHex(packets[0]), toHex(a));
  assert.equal(toHex(packets[1]), toHex(b));
  assert.equal(toHex(packets[2]), toHex(c));
  assert.equal(assembler.pending, 0);
});

test('the assembler handles byte-by-byte fragmentation', () => {
  const a = createPacket(0xc1, 0x0d, undefined, new Uint8Array([9, 9, 9]));
  const b = createPacket(0xc3, 0x0e, 0x00, new Uint8Array(20));
  const stream = new Uint8Array(a.length + b.length);
  stream.set(a, 0);
  stream.set(b, a.length);

  const assembler = new PacketAssembler();
  const received: Uint8Array[] = [];
  for (const byte of stream) {
    received.push(...assembler.push(new Uint8Array([byte])));
  }
  assert.equal(received.length, 2);
  assert.equal(toHex(received[0]), toHex(a));
  assert.equal(toHex(received[1]), toHex(b));
});

test('the assembler resynchronizes after garbage bytes and reports them', () => {
  const rejections: string[] = [];
  const assembler = new PacketAssembler((reason) => rejections.push(reason));
  const good = createPacket(0xc1, 0x0d, undefined, new Uint8Array([7]));
  const stream = new Uint8Array(good.length + 3);
  stream.set([0x11, 0x99, 0xff], 0);
  stream.set(good, 3);
  const packets = assembler.push(stream);
  assert.equal(rejections.length, 3);
  assert.equal(packets.length, 1);
  assert.equal(toHex(packets[0]), toHex(good));
});

test('the assembler rejects a packet that claims an impossible size', () => {
  const rejections: string[] = [];
  const assembler = new PacketAssembler((reason) => rejections.push(reason));
  // C1 with size 2 is smaller than its own header and must be rejected.
  const packets = assembler.push(new Uint8Array([0xc1, 0x02, 0xff, 0x00]));
  assert.equal(packets.length, 0);
  assert.ok(rejections.some((reason) => reason.includes('invalid packet size')));
});

test('xor32 encryption is reverted by its decryption counterpart', () => {
  const original = new Uint8Array(40);
  for (let i = 0; i < original.length; i++) original[i] = (i * 17 + 3) & 0xff;
  original[0] = 0xc1;
  original[1] = original.length;
  original[2] = 0x42;

  const encrypted = original.slice();
  xor32EncryptInPlace(encrypted);
  // The header must stay readable on the wire.
  assert.equal(encrypted[0], 0xc1);
  assert.equal(encrypted[1], original.length);
  assert.notEqual(toHex(encrypted), toHex(original));

  xor32DecryptInPlace(encrypted);
  assert.equal(toHex(encrypted), toHex(original));
});

test('xor3 is symmetric and repeats every three bytes', () => {
  const data = new Uint8Array([1, 2, 3, 4, 5, 6]);
  const encrypted = data.slice();
  xor3InPlace(encrypted);
  assert.deepEqual([...encrypted], [0xfd, 0xcd, 0xa8, 0xf8, 0xca, 0xad]);
  xor3InPlace(encrypted);
  assert.equal(toHex(encrypted), toHex(data));
});
