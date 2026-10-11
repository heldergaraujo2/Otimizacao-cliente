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

async function withServer<T>(
  run: (server: MuServer) => Promise<T>,
  options: Parameters<typeof startMuServer>[0] = {},
): Promise<T> {
  const server = await startMuServer({
    ...options,
    log: process.env.MU_TEST_LOG === '1' ? console.log : undefined,
  });
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

    // when the walker disconnects, the observer is told that the object left its view
    const removed = new Promise<number[]>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no MapObjectOutOfScope received')), 2000);
      observer.on('scopeRemoved', (event) => {
        clearTimeout(timer);
        resolve(event.objectIds);
      });
    });
    walker.close();
    assert.deepEqual(await removed, [walkerId]);
    assert.equal(server.metrics.game.scopeRemovals, 1);

    observer.close();
  });
});

test('leaving the scope box removes the character from the other view, returning adds it back', async () => {
  await withServer(async (server) => {
    const walker = await loginSession(server, 'demo');
    await walker.requestCharacterList();
    await walker.selectCharacter('DarkKnight');
    await walker.clientReady();

    const observer = await loginSession(server, 'alt');
    await observer.requestCharacterList();
    await observer.selectCharacter('ElfArcher');
    await observer.clientReady();

    // closing the sockets in a finally block: a failed assertion must not leave the process alive
    try {

      // 12 steps east take the walker from 125 to 137 — beyond the 10-tile scope box
      const removed = new Promise<number[]>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('no MapObjectOutOfScope for the walker')), 2000);
        observer.on('scopeRemoved', (event) => {
          clearTimeout(timer);
          resolve(event.objectIds);
        });
      });
      walker.walk(new Array(12).fill(2));
      assert.deepEqual(await removed, [walker.player.id], 'walking out of range must remove the object');

      const scopeAfter = await observer.scopeSnapshot();
      assert.equal(scopeAfter.some((entry) => entry.name === 'DarkKnight'), false);

      // walking back into range must add it again, with the new position. The walker's session tracks
      // the predicted position, so this second request declares the correct source coordinates.
      assert.equal(walker.player.x, 137, 'the client must predict the same position the server computed');
      const added = new Promise<{ name: string; currentX: number }[]>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('no AddCharactersToScope after returning')), 2000);
        observer.on('scope', (characters) => {
          const reAdded = characters.filter((entry) => entry.name === 'DarkKnight');
          if (reAdded.length > 0) {
            clearTimeout(timer);
            resolve(reAdded);
          }
        });
      });
      const back = walker.walk(new Array(12).fill(6));
      assert.equal(back.ok, true);
      assert.equal(back.x, 125);
      const readded = await added;
      assert.equal(readded.length, 1);
      assert.equal(readded[0]!.currentX, 125, 'the re-added entry must carry the current position');

      assert.ok(server.metrics.game.scopeRemovals >= 1);
    } finally {
      walker.close();
      observer.close();
    }
  });
});

test('monsters wander and their walks reach the client as ObjectWalked', async () => {
  // the ticker is off: the test drives the ticks itself, so the sequence is exact
  await withServer(
    async (server) => {
      const session = await loginSession(server, 'demo');
      try {
        await session.requestCharacterList();
        await session.selectCharacter('DarkKnight');
        await session.clientReady();

        const npcs = session.npcSnapshot();
        assert.equal(npcs.length, 5, 'the whole demo population is in view');

        const walks: { objectId: number; targetX: number; targetY: number; rotation: number }[] = [];
        session.on('walked', (event) => walks.push(event));

        // a fixed random source: rng 0.5 -> not idle, two steps, direction index 4 = south
        const first = server.game.tickNpcs(() => 0.5);
        assert.equal(first.length, 5);
        assert.ok(first.every((step) => !step.idle && step.directions.length === 2));
        await new Promise((resolve) => setTimeout(resolve, 120));

        assert.equal(walks.length, 5, 'every monster walk is broadcast');
        for (const npc of npcs) {
          const walk = walks.find((entry) => entry.objectId === npc.id);
          assert.ok(walk, `no walk for monster ${npc.id}`);
          assert.equal(walk.targetX, npc.currentX, 'south keeps the x column');
          assert.equal(walk.targetY, npc.currentY + 2, 'two steps south from the row the client knew');
        }

        // a second tick continues from the new position, and the client keeps up
        server.game.tickNpcs(() => 0.5);
        await new Promise((resolve) => setTimeout(resolve, 120));
        assert.equal(walks.length, 10);
        for (const npc of npcs) {
          const list = walks.filter((entry) => entry.objectId === npc.id);
          assert.equal(list.length, 2);
          assert.equal(list[1]!.targetY, list[0]!.targetY + 2);
        }

        // the client's remembered monster view follows the broadcasts ...
        const tracked = new Map(session.npcSnapshot().map((npc) => [npc.id, npc]));
        for (const npc of npcs) {
          assert.equal(tracked.get(npc.id)?.currentY, npc.currentY + 4, 'npcSnapshot is up to date');
        }

        // ... and the world and the metrics agree that the monsters moved
        assert.equal(server.metrics.game.npcTicks, 2);
        assert.equal(server.metrics.game.npcSteps, 10);
        for (const npc of npcs) {
          assert.equal(server.world.get(npc.id)?.y, npc.currentY + 4);
        }

        // the periodic ticker is the same code path
        server.game.startNpcTicker(40, () => 0.5);
        await new Promise((resolve) => setTimeout(resolve, 200));
        server.game.stopNpcTicker();
        assert.ok(server.metrics.game.npcTicks > 2, 'the ticker kept ticking');
      } finally {
        session.close();
      }
    },
    { npcTickMs: 0 },
  );
});

test('monsters are spawned, visible in scope and removed when the player walks away', async () => {
  await withServer(async (server) => {
    assert.equal(server.world.all().filter((object) => object.kind === 'npc').length, 5, 'demo population');

    const session = await loginSession(server, 'demo');
    try {
      await session.requestCharacterList();
      await session.selectCharacter('DarkKnight');
      const characters = await session.clientReady();

      // the spawn area is full of monsters, but only characters come in the character packet
      assert.deepEqual(characters.map((entry) => entry.name), ['DarkKnight']);
      const npcs = session.npcSnapshot();
      assert.equal(npcs.length, 5, 'all demo monsters are inside the 10-tile scope box');
      assert.ok(npcs.every((npc) => npc.typeNumber > 0), 'every monster carries its type number');
      assert.ok(npcs.some((npc) => npc.currentX === 132 && npc.currentY === 122), 'positions are the world ones');

      // three 15-step walks west (125 -> 80) leave every monster behind the scope box
      const removedIds = new Set<number>();
      session.on('scopeRemoved', (event) => {
        for (const id of event.objectIds) removedIds.add(id);
      });
      for (let i = 0; i < 3; i++) {
        const outcome = session.walk(new Array(15).fill(6));
        assert.equal(outcome.ok, true, `walk ${i + 1} must be accepted`);
        await new Promise((resolve) => setTimeout(resolve, 80));
      }

      for (const npc of npcs) {
        assert.ok(removedIds.has(npc.id), `monster ${npc.id} should have left the view`);
      }
      assert.equal(session.npcSnapshot().length, 0, 'the tracked view must drop them too');
      assert.ok(server.metrics.game.scopeRemovals >= 5);
    } finally {
      session.close();
    }
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
