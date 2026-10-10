/**
 * @mu-reengineer/server — headless MU server implementing the protocol vertical slice.
 *
 * ```ts
 * const server = await startMuServer({ log: console.log });
 * console.log(server.connectPort, server.gamePort);
 * await server.close();
 * ```
 */

import { createServer, type Server } from 'node:net';

import type { ServerListEntry } from '@mu-reengineer/protocol';

import { AccountStore } from './accounts.js';
import { attachConnectServer, type ConnectServerMetrics } from './connect-server.js';
import { GameServer } from './game-server.js';
import { World } from './world.js';

export { AccountStore, type Account, type StoredCharacter } from './accounts.js';
export { GameServer, GameServerSession, type GameServerMetrics, type SessionState } from './game-server.js';
export { World, DIRECTION_OFFSETS, MAP_SIZE, MAX_WALK_STEPS, type WorldCharacter, type MoveResult } from './world.js';
export { DEFAULT_CHARACTER_APPEARANCE } from './appearance.js';
export { createSocketTransport } from './net/socket-transport.js';

export interface MuServerOptions {
  /** TCP port for the connect server; 0 (default) lets the OS pick a free port. */
  connectPort?: number;
  /** TCP port for the game server; 0 (default) lets the OS pick a free port. */
  gamePort?: number;
  host?: string;
  /** Host advertised to clients as the game server address (default 127.0.0.1). */
  advertiseHost?: string;
  /** Require clients to apply the XOR32 stream mask (default true; see docs/COMPATIBILITY.md). */
  xor32?: boolean;
  accounts?: AccountStore;
  serverList?: ServerListEntry[];
  /** Only used when no accounts are supplied: adds the demo accounts. */
  withDemoAccounts?: boolean;
  log?: (message: string) => void;
}

export interface MuServer {
  connectPort: number;
  gamePort: number;
  host: string;
  world: World;
  accounts: AccountStore;
  metrics: { connect: ConnectServerMetrics; game: GameServer['metrics'] };
  close(): Promise<void>;
}

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
}

export async function startMuServer(options: MuServerOptions = {}): Promise<MuServer> {
  const host = options.host ?? '127.0.0.1';
  const advertiseHost = options.advertiseHost ?? '127.0.0.1';
  const xor32 = options.xor32 ?? true;
  const world = new World();
  const accounts = options.accounts ?? (options.withDemoAccounts === false ? new AccountStore() : AccountStore.withDemoAccounts());

  const gameServerSocket = createServer();
  const gameServer = new GameServer({ accounts, world, gameServerHost: advertiseHost, xor32, log: options.log });
  gameServer.attach(gameServerSocket);
  await listen(gameServerSocket, options.gamePort ?? 0, host);
  const gamePort = (gameServerSocket.address() as { port: number }).port;

  const connectServerSocket = createServer();
  const connectMetrics = attachConnectServer(connectServerSocket, {
    serverList: options.serverList ?? [{ serverId: 0, loadPercentage: 0 }],
    gameServerHost: advertiseHost,
    gameServerPort: gamePort,
    xor32,
    log: options.log,
  });
  await listen(connectServerSocket, options.connectPort ?? 0, host);
  const connectPort = (connectServerSocket.address() as { port: number }).port;

  options.log?.(`mu-server listening: connect ${host}:${connectPort}, game ${host}:${gamePort} (xor32=${xor32})`);

  return {
    connectPort,
    gamePort,
    host,
    world,
    accounts,
    metrics: { connect: connectMetrics, game: gameServer.metrics },
    close(): Promise<void> {
      return new Promise((resolve) => {
        let pending = 2;
        const done = (): void => {
          pending -= 1;
          if (pending === 0) resolve();
        };
        gameServerSocket.close(done);
        connectServerSocket.close(done);
      });
    },
  };
}
