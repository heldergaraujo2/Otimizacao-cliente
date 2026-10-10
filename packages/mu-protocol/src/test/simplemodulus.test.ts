/**
 * Conformance tests for SimpleModulus.
 *
 * The golden vectors come from MUnique/OpenMU's own test suite
 * (tests/MUnique.OpenMU.Network.Tests/PipelinedEncryptorTests.cs, MIT License) and are stored in
 * tests/vectors/openmu_simplemodulus.json together with the source commit hash. Matching them
 * byte-for-byte is the strongest available evidence that this implementation interoperates with
 * the reference MU Online protocol implementation.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  DEFAULT_KEYS,
  SimpleModulusDecryptor,
  SimpleModulusEncryptor,
} from '../crypto/simplemodulus.js';
import { toHex } from '../codec.js';

interface Vector {
  name: string;
  decrypted_b64: string;
  encrypted_b64: string;
  decrypted_len: number;
  encrypted_len: number;
  decrypted_sha256: string;
  encrypted_sha256: string;
  decrypted_hex_head: string;
  encrypted_hex_head: string;
}

interface VectorFile {
  source: string;
  commit: string;
  vectors: Vector[];
}

const vectorsPath = path.resolve(
  import.meta.dirname,
  '../../../../tests/vectors/openmu_simplemodulus.json',
);
const vectorFile = JSON.parse(readFileSync(vectorsPath, 'utf8')) as VectorFile;

test('golden vector file records its provenance', () => {
  assert.match(vectorFile.source, /OpenMU/);
  assert.match(vectorFile.commit, /^[0-9a-f]{40}$/);
  assert.equal(vectorFile.vectors.length, 2);
});

for (const vector of vectorFile.vectors) {
  test(`${vector.name}: encrypt matches the OpenMU reference bytes`, () => {
    const decrypted = Buffer.from(vector.decrypted_b64, 'base64');
    const expected = Buffer.from(vector.encrypted_b64, 'base64');
    assert.equal(decrypted.length, vector.decrypted_len);
    assert.equal(expected.length, vector.encrypted_len);

    const encryptor = new SimpleModulusEncryptor(DEFAULT_KEYS.encryptorServer, 'new');
    const actual = encryptor.encryptPacket(new Uint8Array(decrypted));

    assert.equal(actual.length, expected.length, 'encrypted size differs');
    if (toHex(actual) !== toHex(new Uint8Array(expected))) {
      let index = 0;
      while (index < actual.length && actual[index] === expected[index]) index++;
      assert.fail(
        `encrypted bytes differ at offset ${index}: ${actual[index]?.toString(16)} != ${expected[index]?.toString(16)}`,
      );
    }
  });

  test(`${vector.name}: decrypt restores the reference plaintext`, () => {
    const encrypted = new Uint8Array(Buffer.from(vector.encrypted_b64, 'base64'));
    const expected = new Uint8Array(Buffer.from(vector.decrypted_b64, 'base64'));
    // The reference encryptor uses DefaultServerKey, whose mirror is the client *decryption* key.
    const decryptor = new SimpleModulusDecryptor(DEFAULT_KEYS.decryptorClient, 'new');
    const actual = decryptor.decryptPacket(encrypted);
    assert.equal(toHex(actual), toHex(expected), 'decrypted bytes differ from reference');
  });
}

test('C1 and C2 packets pass through the SimpleModulus layer unchanged', () => {
  const c1 = new Uint8Array([0xc1, 0x05, 0xab, 0xbc, 0xde]);
  const c2 = new Uint8Array([0xc2, 0x00, 0x05, 0xbc, 0xde]);
  const encryptor = new SimpleModulusEncryptor(DEFAULT_KEYS.encryptorServer, 'new');
  const decryptor = new SimpleModulusDecryptor(DEFAULT_KEYS.decryptorServer, 'new');
  assert.equal(toHex(encryptor.encryptPacket(c1)), toHex(c1));
  assert.equal(toHex(encryptor.encryptPacket(c2)), toHex(c2));
  assert.equal(toHex(decryptor.decryptPacket(c1)), toHex(c1));
  assert.equal(toHex(decryptor.decryptPacket(c2)), toHex(c2));
});

test('client <-> server round trip keeps payloads intact for many packets', () => {
  const clientEncryptor = new SimpleModulusEncryptor(DEFAULT_KEYS.encryptorClient, 'new');
  const serverDecryptor = new SimpleModulusDecryptor(DEFAULT_KEYS.decryptorServer, 'new');
  const serverEncryptor = new SimpleModulusEncryptor(DEFAULT_KEYS.encryptorServer, 'new');
  const clientDecryptor = new SimpleModulusDecryptor(DEFAULT_KEYS.decryptorClient, 'new');

  for (let iteration = 0; iteration < 40; iteration++) {
    const payloadLength = 1 + ((iteration * 7) % 90);
    const payload = new Uint8Array(payloadLength);
    for (let i = 0; i < payloadLength; i++) payload[i] = (iteration * 31 + i * 13) & 0xff;

    const request = new Uint8Array(4 + payload.length);
    request[0] = 0xc3;
    request[3] = 0x42;
    request.set(payload, 4);
    request[1] = request.length & 0xff;

    const encryptedToServer = clientEncryptor.encryptPacket(request);
    const receivedByServer = serverDecryptor.decryptPacket(encryptedToServer);
    assert.equal(toHex(receivedByServer), toHex(request), 'client->server payload mismatch');

    const response = new Uint8Array(4 + payload.length);
    response[0] = 0xc3;
    response[3] = 0x43;
    response.set(payload, 4);
    response[1] = response.length & 0xff;

    const encryptedToClient = serverEncryptor.encryptPacket(response);
    const receivedByClient = clientDecryptor.decryptPacket(encryptedToClient);
    assert.equal(toHex(receivedByClient), toHex(response), 'server->client payload mismatch');
  }
});

test('the packet counter wraps at 255 without corrupting the stream', () => {
  const encryptor = new SimpleModulusEncryptor(DEFAULT_KEYS.encryptorClient, 'new');
  const decryptor = new SimpleModulusDecryptor(DEFAULT_KEYS.decryptorServer, 'new');
  const packet = new Uint8Array([0xc3, 0x07, 0x0e, 0x00, 0x11, 0x22, 0x33]);
  for (let i = 0; i < 300; i++) {
    const encrypted = encryptor.encryptPacket(packet);
    const decrypted = decryptor.decryptPacket(encrypted);
    assert.equal(toHex(decrypted), toHex(packet), `mismatch at packet ${i}`);
    // the decryptor exposes which counter value it accepted (useful for diagnostics and the CLI)
    assert.equal(decryptor.lastCounter, i % 256, `counter not reported at packet ${i}`);
  }
});

test('an out-of-sequence counter is rejected', () => {
  const encryptor = new SimpleModulusEncryptor(DEFAULT_KEYS.encryptorClient, 'new');
  const decryptor = new SimpleModulusDecryptor(DEFAULT_KEYS.decryptorServer, 'new');
  const packet = new Uint8Array([0xc3, 0x07, 0x0e, 0x00, 0x11, 0x22, 0x33]);
  const first = encryptor.encryptPacket(packet);
  const second = encryptor.encryptPacket(packet);

  // In-order delivery is accepted (counters 0, 1, ...).
  assert.equal(toHex(decryptor.decryptPacket(first)), toHex(packet));
  assert.equal(toHex(decryptor.decryptPacket(second)), toHex(packet));

  // A replay or reordering is rejected by a decryptor which expects counter 0.
  const fresh = new SimpleModulusDecryptor(DEFAULT_KEYS.decryptorServer, 'new');
  assert.throws(() => fresh.decryptPacket(second), /counter mismatch/);
  assert.equal(first.length, second.length);
});

test('a corrupted checksum is detected', () => {
  const encryptor = new SimpleModulusEncryptor(DEFAULT_KEYS.encryptorClient, 'new');
  const packet = new Uint8Array([0xc3, 0x07, 0x0e, 0x00, 0x11, 0x22, 0x33]);
  const encrypted = encryptor.encryptPacket(packet);
  const corrupt = encrypted.slice();
  corrupt[corrupt.length - 1] ^= 0x01; // flip a checksum bit
  const tolerant = new SimpleModulusDecryptor(DEFAULT_KEYS.decryptorServer, 'new');
  tolerant.acceptWrongBlockChecksum = true;
  tolerant.decryptPacket(corrupt);
  assert.ok(tolerant.warnings.some((warning) => warning.includes('checksum')));

  const strict = new SimpleModulusDecryptor(DEFAULT_KEYS.decryptorServer, 'new');
  assert.throws(() => strict.decryptPacket(corrupt), /checksum mismatch/);
});

test('a truncated packet is rejected instead of being decrypted', () => {
  const encryptor = new SimpleModulusEncryptor(DEFAULT_KEYS.encryptorClient, 'new');
  const packet = new Uint8Array(30).fill(0x5a);
  packet[0] = 0xc3;
  packet[1] = packet.length;
  const encrypted = encryptor.encryptPacket(packet);
  const truncated = encrypted.slice(0, encrypted.length - 5);
  const decryptor = new SimpleModulusDecryptor(DEFAULT_KEYS.decryptorServer, 'new');
  assert.throws(() => decryptor.decryptPacket(truncated), /truncated packet|unexpected content size/);
});
