/**
 * Resource-format throughput benchmark: ciphers, BMD parsing, texture decoding and PNG encoding.
 *
 * Run with `npm run bench -w @mu-reengineer/formats`. Recorded results live in
 * docs/PERFORMANCE.md together with the environment they came from.
 */

import {
  buildBmdFixture,
  buildDdsFixture,
  buildObjFixture,
  buildOztFixture,
  computeBoneWorldMatrices,
  decryptFileCryptor,
  decodeDds,
  decodeOzt,
  extractMeshGeometry,
  parseBmd,
  parseObj,
  skinMesh,
} from '../index.js';
import { encodePng } from '../png.js';

interface BenchResult {
  name: string;
  iterations: number;
  bytesPerOp: number;
  ms: number;
  opsPerSecond: number;
  megabytesPerSecond: number;
}

function bench(name: string, bytesPerOp: number, iterations: number, body: () => void): BenchResult {
  for (let i = 0; i < Math.min(iterations, 200); i++) body();
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
    result.name.padEnd(46),
    `${result.iterations}`.padStart(7),
    `${result.ms.toFixed(1)} ms`.padStart(11),
    `${Math.round(result.opsPerSecond).toLocaleString('en-US')} op/s`.padStart(16),
    `${result.megabytesPerSecond.toFixed(1)} MiB/s`.padStart(12),
  ].join('  ');
}

function main(): void {
  const results: BenchResult[] = [];

  // --- FileCryptor over a realistic full-map payload -------------------------------------------
  const mapPayload = new Uint8Array(256 * 256 * 3 + 4); // 3 layers + header
  for (let i = 0; i < mapPayload.length; i++) mapPayload[i] = (i * 13 + 7) & 0xff;
  const mapEncrypted = decryptFileCryptor(mapPayload); // symmetric transform, used to seed ciphertext

  results.push(
    bench('FileCryptor: 192 KiB (decrypt)', mapPayload.length, 1000, () => {
      decryptFileCryptor(mapEncrypted);
    }),
  );
  results.push(
    bench('FileCryptor: 192 KiB (encrypt)', mapPayload.length, 1000, () => {
      decryptFileCryptor(mapPayload);
    }),
  );

  // --- OBJ (FileCryptor protected object placement list) ---------------------------------------
  const objBytes = buildObjFixture().bytes;
  results.push(
    bench('OBJ fixture: FileCryptor + record parse', objBytes.length, 5000, () => {
      parseObj(objBytes);
    }),
  );

  // --- BMD: cipher + structural parse of the whole model ---------------------------------------
  const bmd12 = buildBmdFixture({ version: 12 }).bytes;
  const bmd15 = buildBmdFixture({ version: 15 }).bytes;
  results.push(
    bench('BMD v12: parse (FileCryptor + model)', bmd12.length, 5000, () => {
      parseBmd(bmd12);
    }),
  );
  results.push(
    bench('BMD v15: parse (LEA-256 + model)', bmd15.length, 5000, () => {
      parseBmd(bmd15);
    }),
  );
  results.push(
    bench('BMD v12: extractMeshGeometry', bmd12.length, 5000, () => {
      const model = parseBmd(bmd12);
      for (const mesh of model.meshes) extractMeshGeometry(mesh);
    }),
  );

  // --- animation sampling and skinning ---------------------------------------------------------
  const animModel = parseBmd(bmd12);
  const animMesh = animModel.meshes[0]!;
  results.push(
    bench('BMD anim: sample every bone (1 action)', animModel.bones.length * 32, 200_000, () => {
      computeBoneWorldMatrices(animModel, 0, 1.5);
    }),
  );
  results.push(
    bench('BMD anim: CPU skin a mesh (7 corners)', animMesh.vertices.length * 32, 200_000, () => {
      skinMesh(animModel, animMesh, 0, 1.5);
    }),
  );

  // --- textures --------------------------------------------------------------------------------
  const ozt = buildOztFixture(256, 256).bytes;
  results.push(
    bench('OZT 256x256: decode to RGBA', ozt.length, 1000, () => {
      decodeOzt(ozt);
    }),
  );
  // 64x64 DXT1 surface: reuse the fixture header, patch the dimensions and append real blocks.
  const ddsSmall = buildDdsFixture().bytes;
  const ddsLarge = new Uint8Array(128 + 16 * 16 * 8);
  ddsLarge.set(ddsSmall.subarray(0, 128));
  ddsLarge.set(ddsSmall.subarray(128), 128);
  const ddsView = new DataView(ddsLarge.buffer);
  ddsView.setUint32(12, 64, true); // height
  ddsView.setUint32(16, 64, true); // width
  ddsView.setUint32(20, 16 * 16 * 8, true); // linear size
  for (let block = 1; block < 256; block++) ddsLarge.set(ddsSmall.subarray(128, 136), 128 + block * 8);
  results.push(
    bench('DDS DXT1 64x64: decode to RGBA', ddsLarge.length, 2000, () => {
      decodeDds(ddsLarge);
    }),
  );

  // --- PNG encoding (the export path used by tools/mu-cli) --------------------------------------
  const image = decodeOzt(buildOztFixture(512, 512).bytes);
  results.push(
    bench('PNG encode 512x512 RGBA', image.rgba.length, 200, () => {
      encodePng(image);
    }),
  );

  console.log('MU-REENGINEER resource-format benchmark');
  console.log(`node ${process.version} on ${process.platform}/${process.arch}`);
  console.log('');
  console.log(
    `  ${'benchmark'.padEnd(46)}  ${'iters'.padStart(7)}  ${'time'.padStart(11)}  ${'throughput'.padStart(16)}  ${'bandwidth'.padStart(12)}`,
  );
  console.log(
    `  ${'-'.repeat(46)}  ${'-'.repeat(7)}  ${'-'.repeat(11)}  ${'-'.repeat(16)}  ${'-'.repeat(12)}`,
  );
  for (const result of results) console.log(`  ${fmt(result)}`);
}

main();
