/**
 * Asset endpoint tests: the browser client can only reach data through HTTP, so the gateway's
 * `/assets/` route is the bridge to a real MU directory. These tests assert the behaviour that
 * matters in practice — exact bytes, case-insensitive resolution (Windows trees), helpful 404s and
 * no path traversal.
 */

import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { buildAttFixture, buildMapFixture, buildObjFixture, parseAtt } from '@mu-reengineer/formats';
import { startMuServer } from '@mu-reengineer/server';

import { startGateway } from '../index.js';

async function withGateway<T>(run: (baseUrl: string, root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'mu-assets-'));
  const server = await startMuServer({});
  try {
    await mkdir(join(root, 'World1'), { recursive: true });
    const att = buildAttFixture({ extended: true });
    await writeFile(join(root, 'World1', 'EncTerrain1.att'), att.bytes);
    await writeFile(join(root, 'World1', 'EncTerrain1.map'), buildMapFixture().bytes);
    await writeFile(join(root, 'World1', 'EncTerrain1.obj'), buildObjFixture().bytes);
    await writeFile(join(root, 'secret.txt'), new Uint8Array([0xde, 0xad]));

    const gateway = await startGateway({
      wsPort: 0,
      host: '127.0.0.1',
      gameHost: server.host,
      gamePort: server.gamePort,
      dataDir: root,
    });
    try {
      return await run(`http://127.0.0.1:${gateway.wsPort}`, root);
    } finally {
      await gateway.close();
    }
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
}

test('serves real file bytes with a matching content type', async () => {
  await withGateway(async (baseUrl, root) => {
    const expected = buildAttFixture({ extended: true }).bytes;
    const response = await fetch(`${baseUrl}/assets/World1/EncTerrain1.att`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/octet-stream');
    const received = new Uint8Array(await response.arrayBuffer());
    assert.equal(received.length, expected.length);
    assert.deepEqual([...received], [...expected], 'the bytes must be served unchanged');

    // and the file really is a parseable terrain file (end-to-end: HTTP → mu-formats)
    const parsed = parseAtt(received);
    assert.equal(parsed.attributes.length, 256 * 256);

    // case-insensitive resolution, as in a Windows data tree
    const mixed = await fetch(`${baseUrl}/assets/world1/ENCTERRAIN1.ATT`);
    assert.equal(mixed.status, 200);

    // index of the data directory
    const index = await (await fetch(`${baseUrl}/assets/`)).json() as { count: number; files: string[] };
    assert.equal(index.count, 4);
    assert.ok(index.files.includes('World1/EncTerrain1.obj'));
    assert.ok(index.files.includes('secret.txt'));
    assert.ok(root.length > 0);
  });
});

test('missing files report candidates instead of leaking the filesystem layout', async () => {
  await withGateway(async (baseUrl) => {
    // a typo that still shares the file stem — the 404 must point at the real files
    const response = await fetch(`${baseUrl}/assets/World1/EncTerrain.att`);
    assert.equal(response.status, 404);
    const body = (await response.json()) as { error: string; candidates: string[] };
    assert.match(body.error, /resource not found/);
    assert.ok(body.candidates.some((candidate) => candidate.includes('EncTerrain1')), JSON.stringify(body));
    assert.equal(body.error.includes('/tmp/'), false, 'the absolute path must not be exposed');
  });
});

test('path traversal and unsupported methods are refused', async () => {
  await withGateway(async (baseUrl) => {
    const traversal = await fetch(`${baseUrl}/assets/../../etc/passwd`);
    assert.ok(traversal.status === 400 || traversal.status === 404, `unexpected status ${traversal.status}`);
    const encoded = await fetch(`${baseUrl}/assets/%2e%2e%2f%2e%2e%2fetc%2fpasswd`);
    assert.ok(encoded.status === 400 || encoded.status === 404, `unexpected status ${encoded.status}`);

    const post = await fetch(`${baseUrl}/assets/World1/EncTerrain1.att`, { method: 'POST' });
    assert.equal(post.status, 405);

    const head = await fetch(`${baseUrl}/assets/World1/EncTerrain1.att`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal((await head.arrayBuffer()).byteLength, 0);
  });
});

test('health reports the data directory and the loader statistics', async () => {
  await withGateway(async (baseUrl) => {
    await fetch(`${baseUrl}/assets/World1/EncTerrain1.map`);
    await fetch(`${baseUrl}/assets/World1/EncTerrain1.map`);
    const health = (await (await fetch(`${baseUrl}/health`)).json()) as {
      dataDir: string | null;
      assets: { hits: number; misses: number; entries: number } | null;
      assetsServed: number;
      assetBytesServed: number;
    };
    assert.ok(health.dataDir?.includes('mu-assets-'), `the data directory must be reported (got ${health.dataDir})`);
    // assets are streamed straight to the socket, so the loader cache statistics stay at zero…
    assert.deepEqual(health.assets, { hits: 0, misses: 0, entries: 0, bytesRead: 0 });
    // …while the gateway counts what it actually served (this is the number that matters for assets)
    assert.equal(health.assetsServed, 2);
    assert.equal(health.assetBytesServed, 2 * buildMapFixture().bytes.length);
  });
});
