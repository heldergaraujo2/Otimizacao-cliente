#!/usr/bin/env node
/**
 * One-command preview: game server + WebSocket gateway + browser client (Vite).
 *
 * Why this exists: a sandbox/CI VM does not keep background processes across pauses, so the preview has
 * to be started again after every resume. This script makes that a single, documented command that also
 * prints the exact URL to open — including the public host the Arena platform exposes (`5173-<sandbox
 * id>.e2b.app`) when `E2B_SANDBOX_ID` is set.
 *
 *   node scripts/dev-preview.mjs                # start both, print the URL, Ctrl+C stops both
 *   node scripts/dev-preview.mjs --rebuild      # npm ci + build + demo data first
 *   node scripts/dev-preview.mjs --gateway-port 7788 --client-port 5173 --data-dir assets-local/demo-data
 *
 * The script only *orchestrates*: the gateway keeps serving the demo data directory and the page keeps
 * connecting to `/ws` relative to itself, so the same command works in the sandbox, on a LAN and behind
 * any proxy. It refuses to start when a port is already taken instead of stealing it, and it forwards
 * SIGINT/SIGTERM so both children stop together.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const flags = new Map();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags.set(arg.slice(2), next);
      i++;
    } else {
      flags.set(arg.slice(2), true);
    }
  }
  return flags;
}

const flags = parseArgs(process.argv.slice(2));
const gatewayPort = Number(flags.get('gateway-port') ?? 7788);
const clientPort = Number(flags.get('client-port') ?? 5173);
const dataDir = String(flags.get('data-dir') ?? 'assets-local/demo-data');

function run(command, args, label) {
  console.log(`[preview] ${label}: ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: false });
  if (result.status !== 0) {
    console.error(`[preview] ${label} failed with exit code ${result.status}`);
    process.exit(1);
  }
}

if (flags.get('rebuild')) {
  run('npm', ['ci'], 'install (npm ci)');
  run('npm', ['run', 'build'], 'build');
  run('node', ['scripts/make-demo-data.mjs'], 'demo data');
}

for (const file of ['tools/mu-gateway/dist/index.js', 'packages/mu-server/dist/main.js']) {
  if (!existsSync(path.join(root, file))) {
    console.error(`[preview] ${file} is missing — run \`npm run build\` first (or pass --rebuild).`);
    process.exit(1);
  }
}

/** Refuses to start on a busy port: silently stealing one would break whichever process owns it. */
function requireFreePort(port, name) {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', (error) => {
      reject(
        new Error(
          `${name} port ${port} is already in use (${error.code}). Stop that process first, or pass ` +
            `--${name === 'gateway' ? 'gateway' : 'client'}-port <other port>.`,
        ),
      );
    });
    probe.listen(port, '0.0.0.0', () => probe.close(() => resolve()));
  });
}

try {
  await requireFreePort(gatewayPort, 'gateway');
  await requireFreePort(clientPort, 'client');
} catch (error) {
  console.error(`[preview] ${error.message}`);
  process.exit(1);
}

const children = [];
let shuttingDown = false;

function stopAll(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => {
    for (const child of children) child.kill('SIGKILL');
    process.exit(code);
  }, 1500).unref();
}

function start(name, command, args) {
  const child = spawn(command, args, { cwd: root, stdio: ['ignore', 'inherit', 'inherit'] });
  children.push(child);
  child.once('exit', (code) => {
    if (shuttingDown) return;
    console.error(`[preview] ${name} exited with code ${code} — stopping the other process.`);
    stopAll(code ?? 1);
  });
  return child;
}

// The gateway starts the game server itself (`--server`) and, with `--data-dir`, also serves the real
// files over `/assets` for the page.
start('gateway', 'node', ['tools/mu-gateway/dist/index.js', '--ws-port', String(gatewayPort), '--server', '--data-dir', dataDir]);

// `vite --host 0.0.0.0 --port N`: binds all interfaces so the platform proxy (and the phone) can reach it.
start('client', 'npm', ['run', 'dev', '-w', '@mu-reengineer/client', '--', '--host', '0.0.0.0', '--port', String(clientPort)]);

const sandboxId = process.env.E2B_SANDBOX_ID;
console.log('');
console.log(`[preview] game server + gateway : 0.0.0.0:${gatewayPort}  (page talks to /ws and /assets through it)`);
console.log(`[preview] browser client (Vite) : 0.0.0.0:${clientPort}`);
console.log(`[preview] local URL             : http://localhost:${clientPort}/`);
if (sandboxId) {
  console.log(`[preview] public preview URL    : https://${clientPort}-${sandboxId}.e2b.app`);
} else {
  console.log('[preview] public preview URL    : (E2B_SANDBOX_ID is not set — expose the port with the');
  console.log('[preview]                        platform\'s port forwarding and open the URL it gives you)');
}
console.log(`[preview] demo login            : demo / demo  →  DarkKnight`);
console.log('[preview] Ctrl+C stops both processes. Background processes do NOT survive sandbox pauses —');
console.log('[preview] run this command again after a resume.');
console.log('');

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
