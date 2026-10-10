/**
 * Gateway test — the browser path, exercised headlessly.
 *
 * Node exposes the same global `WebSocket` the browser uses, so the *browser* transport, the gateway
 * and a real game server are tested together here: the client speaks WebSocket, the gateway bridges to
 * TCP, the server answers. A full session (login → characters → select → scope → walk → ping) runs over
 * that path, which is exactly what the browser page does.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { ClientSession, connectWebSocketTransport } from '@mu-reengineer/client';
import { startMuServer } from '@mu-reengineer/server';
import { LoginResult } from '@mu-reengineer/protocol';

import { startGateway } from '../index.js';

test('gateway bridges a WebSocket session to the TCP game server', async () => {
  const server = await startMuServer({});
  const gateway = await startGateway({ wsPort: 0, host: '127.0.0.1', gameHost: server.host, gamePort: server.gamePort });
  try {
    const transport = await connectWebSocketTransport({ url: `ws://127.0.0.1:${gateway.wsPort}/ws` });
    const session = ClientSession.attach(transport, { xor32: true });
    assert.equal(await session.login('demo', 'demo'), LoginResult.Okay);

    const characters = await session.requestCharacterList();
    assert.deepEqual(characters.map((character) => character.name), ['DarkKnight']);
    await session.selectCharacter('DarkKnight');
    const scope = await session.clientReady();
    assert.equal(scope.length, 1);

    session.walk([2, 2]);
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(server.world.all()[0]?.x, 127);

    const pong = await session.ping();
    assert.ok(pong.tickCount > 0);
    assert.ok(session.metrics.packetsIn >= 6 && session.metrics.packetsOut >= 5);

    session.close();
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(server.world.all().length, 0, 'disconnect must travel through the gateway as well');
    assert.ok(gateway.connections >= 1);
  } finally {
    await gateway.close();
    await server.close();
  }
});

test('gateway exposes a health endpoint and rejects unknown paths', async () => {
  const server = await startMuServer({});
  const gateway = await startGateway({ wsPort: 0, host: '127.0.0.1', gameHost: server.host, gamePort: server.gamePort });
  try {
    const health = await fetch(`http://127.0.0.1:${gateway.wsPort}/health`);
    assert.equal(health.status, 200);
    const body = (await health.json()) as { ok: boolean; connections: number };
    assert.equal(body.ok, true);

    const other = await fetch(`http://127.0.0.1:${gateway.wsPort}/nope`);
    assert.equal(other.status, 404);
    assert.match(await other.text(), /use \/ws/);
  } finally {
    await gateway.close();
    await server.close();
  }
});

test('gateway isolates connections: two WebSocket clients get independent TCP sessions', async () => {
  const server = await startMuServer({});
  const gateway = await startGateway({ wsPort: 0, host: '127.0.0.1', gameHost: server.host, gamePort: server.gamePort });
  try {
    const url = `ws://127.0.0.1:${gateway.wsPort}/ws`;
    const first = ClientSession.attach(await connectWebSocketTransport({ url }), { xor32: true });
    const second = ClientSession.attach(await connectWebSocketTransport({ url }), { xor32: true });

    assert.equal(await first.login('demo', 'demo'), LoginResult.Okay);
    assert.equal(await second.login('alt', 'alt'), LoginResult.Okay);

    // the same account cannot log in twice — proof the sessions are really independent
    const duplicate = ClientSession.attach(await connectWebSocketTransport({ url }), { xor32: true });
    assert.equal(await duplicate.login('demo', 'demo'), LoginResult.AccountAlreadyConnected);

    first.close();
    second.close();
    duplicate.close();
  } finally {
    await gateway.close();
    await server.close();
  }
});
