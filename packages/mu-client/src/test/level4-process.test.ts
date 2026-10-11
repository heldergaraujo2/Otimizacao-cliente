/**
 * Level 4 — process-level end-to-end test.
 *
 * This is the step beyond Level 3: the game server runs as a **separate OS process** (`mu-server` CLI,
 * exactly the command a deployment uses), announces its ports as a JSON status line, and a client
 * session talks to it over real TCP — connect-server handshake, login, character selection, scope,
 * movement, ping — before the process is asked to shut down with SIGTERM and must exit cleanly.
 *
 * Requires `npm run build` (the CLI is `packages/mu-server/dist/main.js`), which is also what CI does
 * before `npm test`; the test fails with an explicit message instead of skipping silently.
 */

import assert from 'node:assert/strict';
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { fetchConnectionInfo, fetchServerList } from '../core/connect-client.js';
import { connectTcpSession } from '../net/tcp-session.js';

const SERVER_CLI = new URL('../../../mu-server/dist/main.js', import.meta.url);
const SERVER_CLI_PATH = fileURLToPath(SERVER_CLI);

type ServerChild = ChildProcessByStdio<null, Readable, Readable>;

interface ServerProcess {
  child: ServerChild;
  connectPort: number;
  gamePort: number;
  host: string;
  stdout: string[];
  stderr: string[];
}

async function startServerProcess(extraArgs: string[] = []): Promise<ServerProcess> {
  try {
    await access(SERVER_CLI);
  } catch {
    throw new Error(`server CLI not built: ${SERVER_CLI_PATH} — run "npm run build" first`);
  }

  const child = spawn(process.execPath, [SERVER_CLI.pathname, '--host', '127.0.0.1', '--status-json', ...extraArgs], {
    stdio: ['ignore', 'pipe', 'pipe'],
  }) as ServerChild;

  const stdout: string[] = [];
  const stderr: string[] = [];
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => stderr.push(chunk));

  const status = await new Promise<{ host: string; connectPort: number; gamePort: number }>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`server did not report its ports within 10 s\nstdout: ${stdout.join('')}\nstderr: ${stderr.join('')}`));
    }, 10_000);
    let buffer = '';
    child.stdout.on('data', (chunk: string) => {
      stdout.push(chunk);
      buffer += chunk;
      for (const line of buffer.split('\n')) {
        if (!line.trim().startsWith('{')) continue;
        try {
          const parsed = JSON.parse(line) as { event?: string; host: string; connectPort: number; gamePort: number };
          if (parsed.event === 'listening') {
            clearTimeout(timer);
            resolve(parsed);
            return;
          }
        } catch {
          // not the status line yet
        }
      }
      buffer = buffer.slice(buffer.lastIndexOf('\n') + 1);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited early with code ${code}\nstdout: ${stdout.join('')}\nstderr: ${stderr.join('')}`));
    });
  });

  return { child, stdout, stderr, ...status };
}

function stopServerProcess(server: ServerProcess): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      server.child.kill('SIGKILL');
      reject(new Error('server process did not exit after SIGTERM'));
    }, 5000);
    server.child.once('exit', (code, signal) => {
      clearTimeout(timer);
      assert.equal(signal, null, 'the process must exit through its own handler, not be killed by a signal');
      resolve(code);
    });
    server.child.kill('SIGTERM');
  });
}

test('a separate server process serves the whole session flow and shuts down cleanly', async () => {
  const server = await startServerProcess();
  try {
    assert.ok(server.connectPort > 0 && server.gamePort > 0, 'the process must report real ports');
    assert.notEqual(server.connectPort, server.gamePort);

    // 1) connect-server handshake, exactly as a real client performs it
    const servers = await fetchServerList(server.host, server.connectPort);
    assert.equal(servers.length, 1);
    const info = await fetchConnectionInfo(server.host, server.connectPort, 0);
    assert.equal(info.ipAddress, '127.0.0.1');
    assert.equal(info.port, server.gamePort, 'the connect server must advertise the real game port');

    // 2) full game session over TCP against the process
    const session = await connectTcpSession({ host: info.ipAddress, port: info.port, xor32: true });
    assert.equal(await session.login('demo', 'demo'), 0);
    const characters = await session.requestCharacterList();
    assert.deepEqual(characters.map((character) => character.name), ['DarkKnight']);
    await session.selectCharacter('DarkKnight');
    const scope = await session.clientReady();
    assert.ok(scope.some((entry) => entry.name === 'DarkKnight'));

    session.walk([2, 2, 2]);
    await new Promise((resolve) => setTimeout(resolve, 200));
    const pong = await session.ping();
    assert.ok(pong.tickCount > 0);
    assert.equal(session.metrics.framingRejects, 0);
    assert.equal(session.metrics.decryptErrors, 0);
    assert.equal(session.metrics.encryptErrors, 0);
    session.close();
    await new Promise((resolve) => setTimeout(resolve, 150));
  } finally {
    const exitCode = await stopServerProcess(server);
    assert.equal(exitCode, 0, `clean shutdown expected, got ${exitCode}\nstderr: ${server.stderr.join('')}`);
  }

  // the process really did its job, and the shutdown was logged
  assert.match(server.stdout.join(''), /\[server\] ready/);
  assert.match(server.stdout.join(''), /SIGTERM received, closing listeners/);
});

test('the process refuses to start twice on the same port (busy port is a real error)', async () => {
  const first = await startServerProcess(['--connect-port', '0', '--game-port', '0']);
  try {
    const second = spawn(
      process.execPath,
      [SERVER_CLI.pathname, '--host', '127.0.0.1', '--connect-port', String(first.connectPort), '--game-port', '0'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const exitCode = await new Promise<number | null>((resolve) => second.once('exit', (code) => resolve(code)));
    assert.equal(exitCode, 1, 'a busy port must fail fast with a non-zero exit code');
  } finally {
    await stopServerProcess(first);
  }
});
