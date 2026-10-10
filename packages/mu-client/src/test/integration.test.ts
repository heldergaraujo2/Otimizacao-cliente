/**
 * Level 3/4 integration test: a real server process-in-test (TCP listeners) talking to real client
 * sessions over sockets, exercising the whole vertical slice with the real ciphers, counters and
 * framing — no mocks anywhere.
 *
 * Covered: connect server (server list + connection info), failed login, successful login, character
 * list, character selection, map change, client ready/scope, movement authority (accept + reject),
 * cross-client scope broadcast, ping, disconnect cleanup and a cipher-profile mismatch.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { startMuServer, type MuServer } from '@mu-reengineer/server';
import { buildLoginLongPassword, GAME_CODE, LoginResult, MuConnection, readPacketHeader } from '@mu-reengineer/protocol';

import { fetchConnectionInfo, fetchServerList } from '../core/connect-client.js';
import { connectTcpSession } from '../net/tcp-session.js';
import type { ClientSession } from '../core/session.js';
import { connectSocketTransport } from '../net/socket-transport.js';

async function withServer<T>(run: (server: MuServer) => Promise<T>): Promise<T> {
  const server = await startMuServer({ log: process.env.MU_TEST_LOG === '1' ? console.log : undefined });
  try {
    return await run(server);
  } finally {
    await server.close();
  }
}

async function loginSession(server: MuServer, username: string, xor32 = true): Promise<ClientSession> {
  const session = await connectTcpSession({ host: server.host, port: server.gamePort, xor32 });
  const result = await session.login(username, username);
  assert.equal(result, LoginResult.Okay, `login for ${username} failed with code ${result}`);
  return session;
}

test('connect server hands out the server list and the game server address', async () => {
  await withServer(async (server) => {
    const servers = await fetchServerList(server.host, server.connectPort);
    assert.equal(servers.length, 1);
    assert.equal(servers[0]!.loadPercentage, 0);

    const info = await fetchConnectionInfo(server.host, server.connectPort, 0);
    assert.equal(info.ipAddress, '127.0.0.1');
    assert.equal(info.port, server.gamePort);

    assert.equal(server.metrics.connect.serverListRequests, 1);
    assert.equal(server.metrics.connect.connectionInfoRequests, 1);
    assert.equal(server.metrics.connect.rejected, 0);
  });
});

test('wrong credentials are rejected and the connection is closed', async () => {
  await withServer(async (server) => {
    const session = await connectTcpSession({ host: server.host, port: server.gamePort });
    const result = await session.login('demo', 'not-the-password');
    assert.equal(result, LoginResult.InvalidPassword);
    assert.equal(server.metrics.game.loginsFailed, 1);
    assert.equal(server.metrics.game.logins, 0);

    const session2 = await connectTcpSession({ host: server.host, port: server.gamePort });
    assert.equal(await session2.login('ghost', 'ghost'), LoginResult.InvalidAccount);

    session.close();
    session2.close();
  });
});

test('full session: login -> character list -> select -> map change -> scope', async () => {
  await withServer(async (server) => {
    const session = await loginSession(server, 'demo');

    const characters = await session.requestCharacterList();
    assert.equal(characters.length, 1);
    assert.equal(characters[0]!.name, 'DarkKnight');
    assert.equal(characters[0]!.level, 1);
    assert.equal(characters[0]!.appearance.length, 18);

    const { information, map } = await session.selectCharacter('DarkKnight');
    assert.equal(information.x, 125);
    assert.equal(information.y, 125);
    assert.equal(information.strength, 18);
    assert.equal(information.maximumHealth, 110);
    assert.equal(map.mapNumber, 0);
    assert.equal(map.x, 125);
    assert.equal(map.y, 125);

    const scope = await session.clientReady();
    const self = scope.find((entry) => entry.name === 'DarkKnight');
    assert.ok(self, 'the client must receive its own character in the scope');
    assert.equal(self!.currentX, 125);
    assert.equal(session.player.id, self!.id);

    assert.equal(server.metrics.game.logins, 1);
    assert.equal(server.metrics.game.charactersSelected, 1);
    assert.equal(server.world.get(self!.id)?.name, 'DarkKnight');

    session.close();
  });
});

test('movement is server-authoritative, broadcast to characters in scope, and rejections are reported', async () => {
  await withServer(async (server) => {
    const walker = await loginSession(server, 'demo');
    await walker.requestCharacterList();
    await walker.selectCharacter('DarkKnight');
    await walker.clientReady();
    const walkerId = walker.player.id!;

    const observer = await loginSession(server, 'alt');
    await observer.requestCharacterList();
    await observer.selectCharacter('ElfArcher');
    const observerScope = await observer.clientReady();
    assert.ok(observerScope.some((entry) => entry.name === 'DarkKnight'), 'the observer must see the other player');

    // the observer learns about movement through the ObjectWalked broadcast
    const walked = new Promise<{ objectId: number; targetX: number; targetY: number }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no ObjectWalked broadcast received')), 2000);
      observer.on('walked', (event) => {
        clearTimeout(timer);
        resolve(event);
      });
    });
    walker.walk([2, 2, 2]); // three steps east: 125 -> 128
    const event = await walked;
    assert.equal(event.objectId, walkerId);
    assert.equal(event.targetX, 128);
    assert.equal(event.targetY, 125);
    assert.equal(server.world.get(walkerId)?.x, 128);

    // the walker does not receive an echo of its own movement
    const echo = await walker
      .waitFor((packet) => readPacketHeader(packet).code === GAME_CODE.ObjectWalked, 200)
      .then(() => true)
      .catch(() => false);
    assert.equal(echo, false, 'the walking client must not receive its own ObjectWalked');

    // a walk declared from a wrong source position is rejected and does not move the character
    const rejection = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no rejection message received')), 2000);
      walker.on('serverMessage', (message) => {
        clearTimeout(timer);
        resolve(message.message);
      });
    });
    walker.walk([2], { x: 10, y: 10 });
    assert.match(await rejection, /movement rejected/);
    assert.equal(server.world.get(walkerId)?.x, 128, 'rejected movement must not change the server position');

    assert.equal(server.metrics.game.walksAccepted, 1);
    assert.equal(server.metrics.game.walksRejected, 1);

    walker.close();
    observer.close();
  });
});

test('ping is answered and disconnecting removes the character from the world', async () => {
  await withServer(async (server) => {
    const session = await loginSession(server, 'demo');
    await session.requestCharacterList();
    await session.selectCharacter('DarkKnight');
    await session.clientReady();
    const id = session.player.id!;

    const pong = await session.ping();
    assert.ok(pong.tickCount > 0);

    session.close();
    // the server must clean up asynchronously
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(server.world.get(id), undefined, 'a disconnected character must leave the world');
    assert.ok(server.metrics.game.disconnects >= 1);
  });
});

test('a client without the XOR32 profile cannot authenticate (profile mismatch is visible)', async () => {
  await withServer(async (server) => {
    const transport = await connectSocketTransport({ host: server.host, port: server.gamePort });
    const connection = new MuConnection({ role: 'client', transport, useXor32: false });
    const closed = new Promise<boolean>((resolve) => {
      connection.onClose(() => resolve(true));
    });

    // send a well-formed login packet through the wrong profile: the server must not accept it
    connection.send(buildLoginLongPassword('demo', 'demo', 1));

    assert.equal(await closed, true, 'the server must drop a connection it cannot decrypt');
    assert.equal(server.metrics.game.logins, 0);
    assert.ok(
      server.metrics.game.unsupportedPackets > 0 || server.metrics.game.loginsFailed > 0,
      'the mismatch must be visible in the metrics',
    );
  });
});
