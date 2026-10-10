/**
 * Cipher/framing throughput benchmark.
 *
 * Run with `npm run bench -w @mu-reengineer/protocol`. Numbers are produced on the machine that
 * executes it; recorded results and the environment they came from live in docs/PERFORMANCE.md.
 */

import {
  DEFAULT_KEYS,
  PacketAssembler,
  SimpleModulusDecryptor,
  SimpleModulusEncryptor,
  buildLoginLongPassword,
  buildWalkRequest,
  createPacket,
  parseLoginLongPassword,
  parseWalkRequest,
  xor32DecryptInPlace,
  xor32EncryptInPlace,
} from '../index.js';

interface BenchResult {
  name: string;
  iterations: number;
  bytesPerOp: number;
  ms: number;
  opsPerSecond: number;
  megabytesPerSecond: number;
}

function bench(name: string, bytesPerOp: number, iterations: number, body: () => void): BenchResult {
  for (let i = 0; i < Math.min(iterations, 2000); i++) body(); // warm-up
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) body();
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  return {
    name,
    iterations,
    bytesPerOp,
    ms,
    opsPerSecond: (iterations / ms) * 1000,
    megabytesPerSecond: (bytesPerOp * iterations) / (ms / 1000) / (1024 * 1024),
  };
}

function fmt(result: BenchResult): string {
  return [
    result.name.padEnd(48),
    `${result.iterations}`.padStart(8),
    `${result.ms.toFixed(1)} ms`.padStart(11),
    `${Math.round(result.opsPerSecond).toLocaleString('en-US')} op/s`.padStart(16),
    `${result.megabytesPerSecond.toFixed(1)} MiB/s`.padStart(12),
  ].join('  ');
}

function main(): void {
  const results: BenchResult[] = [];

  // --- SimpleModulus, "new" variant: 8 plaintext bytes -> 11 cipher bytes -----------------------
  // Matching pair: the client decrypts with the mirror of the server's encryption keys
  // (DEFAULT_KEYS.encryptorServer <-> DEFAULT_KEYS.decryptorClient - the same pairing the golden
  // vectors in tests/vectors/openmu_simplemodulus.json use).
  const newEncryptor = new SimpleModulusEncryptor(DEFAULT_KEYS.encryptorServer);
  const newDecryptor = new SimpleModulusDecryptor(DEFAULT_KEYS.decryptorClient);
  // C3 has a one-byte length field, so the *encrypted* packet must stay within 255 bytes: at most
  // 23 blocks, i.e. 183 bytes of content after the header (code byte included) plus the counter.
  const newPlain = createPacket(0xc3, 0x12, undefined, new Uint8Array(182));
  newPlain.fill(0x5a, 3);
  newEncryptor.reset(); // a session always starts at counter 0
  const newCipher = newEncryptor.encryptPacket(newPlain);

  results.push(
    bench('SimpleModulus new: encrypt C3 max (23 blocks)', newPlain.length, 20_000, () => {
      newEncryptor.encryptPacket(newPlain);
    }),
  );
  results.push(
    bench('SimpleModulus new: decrypt C3 max (23 blocks)', newCipher.length, 20_000, () => {
      newDecryptor.reset(); // the ciphertext below always starts at counter 0
      newDecryptor.decryptPacket(newCipher);
    }),
  );

  // C4 carries the large payloads (map/scope data): 4 KiB of content -> 512 blocks -> 5635 bytes.
  const largePlain = createPacket(0xc4, 0x12, undefined, new Uint8Array(4096));
  largePlain.fill(0x11, 4);
  newEncryptor.reset();
  const largeCipher = newEncryptor.encryptPacket(largePlain);
  results.push(
    bench('SimpleModulus new: encrypt C4 4 KiB (512 blocks)', largePlain.length, 1500, () => {
      newEncryptor.encryptPacket(largePlain);
    }),
  );
  results.push(
    bench('SimpleModulus new: decrypt C4 4 KiB', largeCipher.length, 1500, () => {
      newDecryptor.reset();
      newDecryptor.decryptPacket(largeCipher);
    }),
  );

  // NOTE: the legacy "old" variant (16 words, 32-byte blocks, no counter, used by clients older
  // than the 8-byte-block era) is implemented but deliberately not benchmarked here: the reference
  // key pairs shipped by OpenMU are 4-word sets, so exercising it would need a synthetic 48-value
  // key set. See docs/TESTING.md ("documented gaps") and NEXT_TASK.md.

  // --- XOR32 stream cipher (used on top of SimpleModulus by some clients) -----------------------
  const xorPacket = new Uint8Array(1024);
  for (let i = 0; i < xorPacket.length; i++) xorPacket[i] = (i * 7) & 0xff;
  results.push(
    bench('XOR32 encrypt 1 KiB packet', xorPacket.length, 20_000, () => {
      const copy = xorPacket.slice();
      xor32EncryptInPlace(copy);
    }),
  );
  results.push(
    bench('XOR32 decrypt 1 KiB packet', xorPacket.length, 20_000, () => {
      const copy = xorPacket.slice();
      xor32DecryptInPlace(copy);
    }),
  );

  // --- packet assembly from a TCP byte stream ---------------------------------------------------
  const login = buildLoginLongPassword('benchmark-user', 'benchmark-password', 0x1234_5678);
  const walk = buildWalkRequest(130, 130, 0x5a, [1, 3, 2, 2, 4, 4, 0, 1]);
  const frameSize = login.length + walk.length;
  const stream = new Uint8Array(frameSize * 64);
  for (let i = 0; i < 64; i++) {
    stream.set(login, i * frameSize);
    stream.set(walk, i * frameSize + login.length);
  }
  results.push(
    bench('PacketAssembler: 128 packets (chunked stream)', stream.length, 1000, () => {
      const assembler = new PacketAssembler();
      assembler.push(stream);
    }),
  );

  // --- per-packet build/parse cost outside the cipher -------------------------------------------
  results.push(
    bench('buildLoginLongPassword', login.length, 100_000, () => {
      buildLoginLongPassword('benchmark-user', 'benchmark-password', 0x1234_5678);
    }),
  );
  results.push(
    bench('parseLoginLongPassword', login.length, 100_000, () => {
      parseLoginLongPassword(login);
    }),
  );
  results.push(
    bench('buildWalkRequest', walk.length, 100_000, () => {
      buildWalkRequest(130, 130, 0x5a, [1, 3, 2, 2, 4, 4, 0, 1]);
    }),
  );
  results.push(
    bench('parseWalkRequest', walk.length, 100_000, () => {
      parseWalkRequest(walk);
    }),
  );
  results.push(
    bench('createPacket (C3 header)', 64, 200_000, () => {
      createPacket(0xc3, 0x12, undefined, new Uint8Array(60));
    }),
  );

  console.log('MU-REENGINEER protocol benchmark');
  console.log(`node ${process.version} on ${process.platform}/${process.arch}`);
  console.log('');
  console.log(
    `  ${'benchmark'.padEnd(48)}  ${'iters'.padStart(8)}  ${'time'.padStart(11)}  ${'throughput'.padStart(16)}  ${'bandwidth'.padStart(12)}`,
  );
  console.log(
    `  ${'-'.repeat(48)}  ${'-'.repeat(8)}  ${'-'.repeat(11)}  ${'-'.repeat(16)}  ${'-'.repeat(12)}`,
  );
  for (const result of results) console.log(`  ${fmt(result)}`);
}

main();
