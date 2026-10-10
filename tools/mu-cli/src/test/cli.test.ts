/**
 * CLI tests. They exercise the same code paths the user runs, including the disk round-trip of every
 * generated fixture.
 */

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

import { DEFAULT_KEYS, SimpleModulusEncryptor, buildLoginLongPassword } from '@mu-reengineer/protocol';

import { generateFixtures } from '../commands/fixtures.js';
import { inspectBytes, inspectFile } from '../commands/inspect.js';
import { decodePacketHex } from '../commands/packets.js';
import { scanDirectory } from '../commands/scan.js';
import { exportTexture } from '../commands/textures.js';
import { buildBmdFixture } from '@mu-reengineer/formats';

const execFileAsync = promisify(execFile);
const cliEntry = path.resolve(fileURLToPath(import.meta.url), '../../index.js');

async function withTempDir<T>(run: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mu-cli-'));
  try {
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('gen-fixtures writes every fixture and re-parses all of them', async () => {
  await withTempDir(async (dir) => {
    const result = await generateFixtures(dir);
    assert.equal(result.ok, true, JSON.stringify(result.rows.filter((row) => !row.ok), null, 2));
    assert.equal(result.rows.length, 10);

    for (const row of result.rows) {
      const info = await stat(path.join(dir, row.file));
      assert.ok(info.size > 0, `${row.file} must not be empty`);
      assert.equal(info.size, row.bytes);
    }

    const report = JSON.parse(await readFile(path.join(dir, 'fixtures-report.json'), 'utf8')) as { ok: boolean };
    assert.equal(report.ok, true);
  });
});

test('inspect recognises the generated fixtures and their key fields', async () => {
  await withTempDir(async (dir) => {
    await generateFixtures(dir);

    const bmd12 = await inspectFile(path.join(dir, 'model_v12.bmd'));
    assert.equal(bmd12.format, 'bmd v12');
    assert.equal(bmd12.details.meshes, 1);
    assert.equal(bmd12.details.triangles, 2);

    const bmd15 = await inspectFile(path.join(dir, 'model_v15.bmd'));
    assert.equal(bmd15.format, 'bmd v15');

    const att = await inspectFile(path.join(dir, 'world1.att'));
    assert.equal(att.format, 'att');
    assert.equal(att.details.extended, true);

    const map = await inspectFile(path.join(dir, 'world1.map'));
    assert.equal(map.format, 'map');

    const obj = await inspectFile(path.join(dir, 'world1.obj'));
    assert.equal(obj.format, 'obj');
    assert.equal(obj.details.objects, 2);

    const ozt = await inspectFile(path.join(dir, 'diffuse.ozt'));
    assert.equal(ozt.format, 'ozt');

    const unknown = inspectBytes('mystery.bin', new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
    assert.equal(unknown.format, 'unknown');
    assert.match(String(unknown.details.head), /01 02 03/);
  });
});

test('export-png writes a valid PNG and extracts OZJ JPEG payloads', async () => {
  await withTempDir(async (dir) => {
    await generateFixtures(dir);

    const pngPath = path.join(dir, 'diffuse.png');
    const png = await exportTexture(path.join(dir, 'diffuse.ozt'), pngPath);
    assert.equal(png.format, 'ozt');
    const bytes = await readFile(pngPath);
    assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.ok(bytes.length > 100);

    const jpg = await exportTexture(path.join(dir, 'photo.ozj'), path.join(dir, 'photo.png'));
    assert.equal(jpg.format, 'ozj');
    assert.match(jpg.output, /\.jpg$/);
    const jpeg = await readFile(jpg.output);
    assert.deepEqual([...jpeg.subarray(0, 3)], [0xff, 0xd8, 0xff]);

    const dds = await exportTexture(path.join(dir, 'dxt1.dds'), path.join(dir, 'dxt1.png'));
    assert.equal(dds.width, 4);
    assert.equal(dds.height, 4);
  });
});

test('scan classifies a directory and reports unreadable files instead of crashing', async () => {
  await withTempDir(async (dir) => {
    await generateFixtures(dir);
    const report = await scanDirectory(dir);
    assert.equal(report.failed, 0, JSON.stringify(report.errors, null, 2));
    assert.equal(report.byFormat['bmd v12'], 1);
    assert.equal(report.byFormat['bmd v15'], 1);
    assert.equal(report.byFormat.att, 1);
    assert.equal(report.byFormat.map, 1);
    assert.equal(report.byFormat.obj, 1);
    assert.deepEqual(report.bmdVersions, { '12': 1, '15': 1 });
    assert.equal(report.ciphers.filecryptor, 2); // .att and .map fixtures (obj reports its own cipher note)
  });
});

test('decode-packet recovers the credentials of an encrypted login packet', () => {
  const plain = buildLoginLongPassword('demo-user', 's3cr3t-password', 0x01020304);
  const encrypted = new SimpleModulusEncryptor(DEFAULT_KEYS.encryptorClient).encryptPacket(plain);

  // client -> server: the server decrypts with the mirror of the client's encryption keys
  const decoded = decodePacketHex(Buffer.from(encrypted).toString('hex'), { direction: 'c2s' });
  assert.equal(decoded.encrypted, true);
  assert.equal(decoded.decryptedBytes, plain.length);
  assert.equal(decoded.counter, 0);
  assert.equal(decoded.parsed?.username, 'demo-user');
  assert.equal(decoded.parsed?.password, 's3cr3t-password');
  assert.equal(decoded.parsed?.tickCount, 0x01020304);
  assert.equal(decoded.parsed?.clientVersion, '1.04d');

  const wrongDirection = decodePacketHex(Buffer.from(encrypted).toString('hex'), { direction: 's2c' });
  assert.ok((wrongDirection.errors.length > 0) || wrongDirection.parsed?.username === undefined);
});

test('decode-packet explains a plain connect-server packet', () => {
  const decoded = decodePacketHex('c1 04 f4 06');
  assert.equal(decoded.prefix, '0xc1');
  assert.equal(decoded.encrypted, false);
  assert.equal(decoded.declaredName, '0xC1 F4 06');
  assert.equal(decoded.errors.length, 0);
});

test('the built CLI runs end to end (help + gen-fixtures + inspect)', async () => {
  await withTempDir(async (dir) => {
    const help = await execFileAsync(process.execPath, [cliEntry, '--help']);
    assert.match(help.stdout, /mu-cli — MU-REENGINEER resource and protocol tool/);

    const out = path.join(dir, 'fixtures');
    const generated = await execFileAsync(process.execPath, [cliEntry, 'gen-fixtures', '--out', out]);
    assert.match(generated.stdout, /10\/10 fixtures re-parsed successfully/);

    const inspected = await execFileAsync(process.execPath, [cliEntry, 'inspect', path.join(out, 'model_v15.bmd')]);
    assert.match(inspected.stdout, /format: bmd v15/);

    const missing = await execFileAsync(process.execPath, [cliEntry, 'inspect', path.join(out, 'does-not-exist.bmd')]).then(
      () => undefined,
      (error: unknown) => error as { code?: number; stderr?: string },
    );
    assert.equal(missing?.code, 1);
    assert.match(String(missing?.stderr), /error:/);
  });
});

test('inspect works on bytes without touching the disk', () => {
  const fixture = buildBmdFixture({ version: 12 });
  const result = inspectBytes('memory.bmd', fixture.bytes);
  assert.equal(result.format, 'bmd v12');
  assert.equal(result.details.name, fixture.name);
});
