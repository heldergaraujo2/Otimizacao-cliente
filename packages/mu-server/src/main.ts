#!/usr/bin/env node
/**
 * Standalone game server process.
 *
 * The vertical slice is also embeddable (`startMuServer`), but a real deployment needs a process with
 * flags and a clean shutdown — that is what this entry point is for, and it is what the Level 4 test
 * (`packages/mu-client/src/test/level4-process.test.ts`) spawns.
 *
 * Usage:
 *   mu-server [--host 0.0.0.0] [--connect-port 44405] [--game-port 55901]
 *             [--advertise-host 127.0.0.1] [--no-xor32] [--no-demo-accounts] [--no-npcs] [--status-json]
 *
 * Ports default to 0 (the OS picks free ones) so the process is usable in tests and never fights for a
 * privileged port; the actual ports are always printed, and with `--status-json` as a single JSON line
 * on stdout (machine readable).
 */

import { startMuServer, type MuServer } from './index.js';

export interface ServerCliOptions {
  host: string;
  connectPort: number;
  gamePort: number;
  advertiseHost?: string;
  xor32: boolean;
  withDemoAccounts: boolean;
  withDemoNpcs: boolean;
  npcTickMs: number;
  statusJson: boolean;
}

export function parseServerArgs(argv: string[]): ServerCliOptions {
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith('--')) continue;
    const name = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags.set(name, next);
      i += 1;
    } else {
      flags.set(name, true);
    }
  }
  const number = (name: string, fallback: number): number => {
    const value = flags.get(name);
    return typeof value === 'string' ? Number(value) : fallback;
  };
  const text = (name: string): string | undefined => {
    const value = flags.get(name);
    return typeof value === 'string' ? value : undefined;
  };

  return {
    host: text('host') ?? '0.0.0.0',
    connectPort: number('connect-port', 0),
    gamePort: number('game-port', 0),
    advertiseHost: text('advertise-host'),
    xor32: flags.get('no-xor32') === undefined,
    withDemoAccounts: flags.get('no-demo-accounts') === undefined,
    withDemoNpcs: flags.get('no-npcs') === undefined,
    npcTickMs: Number(flags.get('npc-tick') ?? 800),
    statusJson: flags.get('status-json') !== undefined,
  };
}

export function serverUsage(): string {
  return [
    'mu-server — MU-REENGINEER game server (connect + game listeners)',
    '',
    'options:',
    '  --host <addr>            bind address (default 0.0.0.0)',
    '  --connect-port <port>    connect-server port (default 0, OS picks)',
    '  --game-port <port>       game-server port (default 0, OS picks)',
    '  --advertise-host <addr>  address handed out to clients (default: the bind address)',
    '  --no-xor32               do not apply the XOR32 stream mask on the game connection',
    '  --no-demo-accounts       start with an empty account store',
    '  --no-npcs                do not spawn the demo monsters/NPCs',
    '  --npc-tick <ms>          milliseconds between monster wander ticks (default 800, 0 = still)',
    '  --status-json            print one JSON status line on stdout once listening',
    '',
    'demo accounts (unless --no-demo-accounts): demo/demo -> DarkKnight, alt/alt -> ElfArcher',
    'the world starts with five monsters/NPCs around the spawn point unless --no-npcs is given',
    '',
  ].join('\n');
}

/** Starts the server and formats the machine-readable status line. */
export function statusLine(server: MuServer): string {
  return JSON.stringify({
    event: 'listening',
    host: server.host,
    connectPort: server.connectPort,
    gamePort: server.gamePort,
  });
}

export async function serverMain(argv: string[]): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(serverUsage());
    return 0;
  }

  const options = parseServerArgs(argv);
  const server = await startMuServer({
    host: options.host,
    connectPort: options.connectPort,
    gamePort: options.gamePort,
    advertiseHost: options.advertiseHost,
    xor32: options.xor32,
    withDemoAccounts: options.withDemoAccounts,
    withDemoNpcs: options.withDemoNpcs,
    npcTickMs: options.npcTickMs,
    log: (message) => console.log(`[server] ${message}`),
  });

  console.log(statusLine(server));
  console.log(
    `[server] ready — connect ${server.host}:${server.connectPort}, game ${server.host}:${server.gamePort} ` +
      `(xor32=${options.xor32}, demo accounts=${options.withDemoAccounts ? 'yes' : 'no'}, npcs=${options.withDemoNpcs ? 'yes' : 'no'})`,
  );

  const shutdown = (signal: string): void => {
    console.log(`[server] ${signal} received, closing listeners`);
    void server.close().then(() => process.exit(0));
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return 0;
}

const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href;
if (isDirectRun) {
  serverMain(process.argv.slice(2)).catch((error: unknown) => {
    // Explicit exit: a partially started server can still hold a listening handle (for example when
    // only one of the two ports was busy), and node would otherwise keep the process alive.
    process.stderr.write(`error: ${(error as Error).message}\n`);
    process.exit(1);
  });
}
