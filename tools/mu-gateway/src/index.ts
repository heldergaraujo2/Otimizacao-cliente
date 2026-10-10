#!/usr/bin/env node
/**
 * MU WebSocket ↔ TCP gateway.
 *
 * The MU protocol is raw TCP; browsers only speak WebSocket. This gateway accepts WebSocket
 * connections (binary frames = raw MU packets, exactly as they appear on the wire) and pipes them to a
 * game server over TCP. One WebSocket = one TCP connection, so the cipher counters and the session
 * state stay per-connection.
 *
 * Usage:
 *   mu-gateway --ws-port 7788 [--game-host 127.0.0.1 --game-port 55901]
 *   mu-gateway --ws-port 7788 --server [--connect-port 44405]   # also starts the bundled server
 */

import { createServer as createHttpServer } from 'node:http';
import { connect as connectTcp } from 'node:net';

import { startMuServer } from '@mu-reengineer/server';
import { WebSocketServer, type WebSocket } from 'ws';

export interface GatewayOptions {
  wsPort: number;
  host?: string;
  gameHost: string;
  gamePort: number;
  log?: (message: string) => void;
}

export interface GatewayHandle {
  wsPort: number;
  connections: number;
  close(): Promise<void>;
}

export async function startGateway(options: GatewayOptions): Promise<GatewayHandle> {
  const host = options.host ?? '0.0.0.0';
  const log = options.log ?? (() => {});
  let connections = 0;

  const http = createHttpServer((request, response) => {
    if (request.url === '/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true, game: `${options.gameHost}:${options.gamePort}`, connections }));
      return;
    }
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('mu-gateway: use /ws for the protocol bridge, /health for status\n');
  });

  const wss = new WebSocketServer({ server: http, path: '/ws' });

  wss.on('connection', (socket: WebSocket, request) => {
    connections += 1;
    const tcp = connectTcp({ host: options.gameHost, port: options.gamePort });
    log(`bridge open: ${request.socket.remoteAddress} -> ${options.gameHost}:${options.gamePort}`);

    socket.on('message', (data, isBinary) => {
      if (!isBinary) return;
      tcp.write(data as Buffer);
    });
    tcp.on('data', (chunk) => {
      if (socket.readyState === socket.OPEN) socket.send(chunk, { binary: true });
    });

    const shutdown = (reason: string): void => {
      log(`bridge closed: ${reason}`);
      tcp.destroy();
      if (socket.readyState === socket.OPEN) socket.close();
    };
    socket.on('close', () => shutdown('websocket closed'));
    socket.on('error', () => shutdown('websocket error'));
    tcp.on('close', () => shutdown('tcp closed'));
    tcp.on('error', (error) => shutdown(`tcp error: ${error.message}`));
  });

  await new Promise<void>((resolve, reject) => {
    http.once('error', reject);
    http.listen(options.wsPort, host, () => {
      http.removeListener('error', reject);
      resolve();
    });
  });
  const wsPort = (http.address() as { port: number }).port;
  log(`mu-gateway listening on ${host}:${wsPort} (/ws -> ${options.gameHost}:${options.gamePort})`);

  return {
    wsPort,
    get connections() {
      return connections;
    },
    close(): Promise<void> {
      return new Promise((resolve) => {
        for (const client of wss.clients) client.terminate();
        wss.close();
        http.close(() => resolve());
      });
    },
  };
}

function parseArgs(argv: string[]): Record<string, string | true> {
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith('--')) continue;
    const name = arg.slice(2);
    const value = argv[i + 1];
    if (value !== undefined && !value.startsWith('--')) {
      flags[name] = value;
      i += 1;
    } else {
      flags[name] = true;
    }
  }
  return flags;
}

async function main(argv: string[]): Promise<number> {
  const flags = parseArgs(argv);
  if (argv.includes('--help')) {
    process.stdout.write(
      'mu-gateway — WebSocket <-> TCP bridge for the MU protocol\n\n' +
        'options:\n' +
        '  --ws-port <port>      WebSocket port (default 7788)\n' +
        '  --host <addr>         bind address (default 0.0.0.0)\n' +
        '  --game-host <addr>    TCP game server host (default 127.0.0.1)\n' +
        '  --game-port <port>    TCP game server port\n' +
        '  --server              start the bundled mu-server and bridge to it\n' +
        '  --xor32               with --server: expect the XOR32 profile (default true)\n',
    );
    return 0;
  }

  const wsPort = flags['ws-port'] !== undefined ? Number(flags['ws-port']) : 7788;
  let gameHost = typeof flags['game-host'] === 'string' ? flags['game-host'] : '127.0.0.1';
  let gamePort = typeof flags['game-port'] === 'string' ? Number(flags['game-port']) : 0;
  let bundled: Awaited<ReturnType<typeof startMuServer>> | undefined;

  if (flags.server) {
    bundled = await startMuServer({
      xor32: flags.xor32 !== 'false',
      advertiseHost: '127.0.0.1',
      log: (message) => console.log(`[server] ${message}`),
    });
    gameHost = bundled.host;
    gamePort = bundled.gamePort;
    console.log(`[gateway] bundled mu-server started (connect ${bundled.connectPort}, game ${bundled.gamePort})`);
  } else if (!gamePort) {
    process.stderr.write('error: --game-port is required unless --server is used\n');
    return 2;
  }

  const gateway = await startGateway({ wsPort, gameHost, gamePort, log: (message) => console.log(`[gateway] ${message}`) });
  console.log(`[gateway] ready: ws://localhost:${gateway.wsPort}/ws -> http://${gameHost}:${gamePort}`);

  const shutdown = async (): Promise<void> => {
    await gateway.close();
    await bundled?.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
  return 0;
}

const isDirectRun = process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href;
if (isDirectRun) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`error: ${(error as Error).message}\n`);
    process.exitCode = 1;
  });
}

export { main as gatewayMain };
