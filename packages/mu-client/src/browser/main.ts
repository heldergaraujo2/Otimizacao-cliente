/**
 * Browser entry point: a playable slice of the client.
 *
 * Flow: gateway (WebSocket) → `ClientSession` (real protocol) → login → character list → select →
 * client ready → scope → keyboard movement with local prediction, all rendered by the three.js
 * renderer over our own resource pipeline.
 *
 * The HUD shows the live evidence (state, position, FPS, packet counters, latency probe) so the page
 * can be used to validate the client on real hardware — which is exactly the Level 5/6 step that this
 * sandbox cannot perform (no GPU/display here).
 */

import { ClientSession } from '../core/session.js';
import { connectWebSocketTransport } from './transport.js';
import { MuRenderer } from './renderer.js';

/**
 * Direction numbering used for input mapping. The server owns the authoritative table
 * (`packages/mu-server/src/world.ts`); this is the client's copy of the same convention:
 * 0 = north, 1 = north-east, 2 = east, 3 = south-east, 4 = south, 5 = south-west, 6 = west,
 * 7 = north-west.
 */
const DIRECTION_OFFSETS: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
] as const;

const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
const hud = document.querySelector<HTMLPreElement>('#hud')!;
const form = document.querySelector<HTMLFormElement>('#login')!;
const statusLine = document.querySelector<HTMLDivElement>('#status')!;
const serverUrl = (document.querySelector<HTMLInputElement>('#gateway')!).value;

const renderer = new MuRenderer({ canvas, tileSpan: 64 });

let session: ClientSession | undefined;
let selfId: number | undefined;
let playerName = '';
const pressed = new Set<string>();
let lastWalkAt = 0;
let pings: number[] = [];
let lastPingAt = 0;

function log(message: string): void {
  statusLine.textContent = message;
}

function updateHud(): void {
  const fps = renderer.currentFps;
  const latency = pings.length > 0 ? Math.round(pings.reduce((sum, value) => sum + value, 0) / pings.length) : 0;
  hud.textContent = [
    `state         : ${session ? 'in game' : 'disconnected'}`,
    `player        : ${playerName || '-'} (id ${selfId ?? '-'})`,
    `position      : ${renderer.getCharacter(selfId ?? -1)?.targetX ?? '-'}, ${renderer.getCharacter(selfId ?? -1)?.targetY ?? '-'}`,
    `fps           : ${fps}`,
    `latency (ms)  : ${latency || '-'}`,
    `packets in/out: ${session?.metrics.packetsIn ?? 0} / ${session?.metrics.packetsOut ?? 0}`,
    `bytes in/out  : ${session?.metrics.bytesIn ?? 0} / ${session?.metrics.bytesOut ?? 0}`,
    `terrain       : ${renderer.stats.width}x${renderer.stats.height} tiles, water ${renderer.stats.waterTiles}, safe ${renderer.stats.safeTiles}`,
    `objects       : ${renderer.stats.objects}`,
    `model         : ${renderer.stats.meshVertices} vertices / ${renderer.stats.meshTriangles} triangles from BMD`,
    `controls      : arrow keys / WASD to walk`,
  ].join('\n');
}

async function start(username: string, password: string): Promise<void> {
  log(`connecting to ${serverUrl} …`);
  const transport = await connectWebSocketTransport({ url: serverUrl });
  session = ClientSession.attach(transport, { xor32: true, log: (message) => console.debug('[protocol]', message) });
  session.on('serverMessage', (message) => log(`server: ${message.message}`));
  session.on('scope', (characters) => {
    for (const character of characters) {
      renderer.addCharacter(character.id, character.name, character.currentX, character.currentY);
      if (character.name === playerName) selfId = character.id;
    }
  });
  session.on('walked', (event) => {
    renderer.setTarget(event.objectId, event.targetX, event.targetY);
  });
  session.on('closed', () => {
    log('connection closed');
    session = undefined;
  });

  const result = await session.login(username, password);
  if (result !== 0) {
    log(`login failed (code ${result}) — check the demo accounts (demo/demo, alt/alt)`);
    session.close();
    session = undefined;
    return;
  }
  log('logged in, loading characters …');

  const characters = await session.requestCharacterList();
  if (characters.length === 0) {
    log('this account has no characters');
    return;
  }
  const chosen = characters[0]!;
  playerName = chosen.name;
  const { information, map } = await session.selectCharacter(chosen.name);
  log(`entering ${chosen.name} at ${map.x},${map.y} (map ${map.mapNumber}, HP ${information.maximumHealth})`);

  await session.clientReady();
  // walkable demo area is centred on the spawn point
  requestAnimationFrame(loop);
}

function loop(): void {
  requestAnimationFrame(loop);
  updateHud();
  const focus = renderer.getCharacter(selfId ?? -1);
  renderer.render({ x: focus?.x ?? 125, y: focus?.y ?? 125 });
  pumpInput();
  pumpPing();
}

function pumpInput(): void {
  if (!session || !playerName) return;
  const now = performance.now();
  if (now - lastWalkAt < 180) return;

  let dx = 0;
  let dy = 0;
  if (pressed.has('ArrowUp') || pressed.has('w')) dy -= 1;
  if (pressed.has('ArrowDown') || pressed.has('s')) dy += 1;
  if (pressed.has('ArrowLeft') || pressed.has('a')) dx -= 1;
  if (pressed.has('ArrowRight') || pressed.has('d')) dx += 1;
  if (dx === 0 && dy === 0) return;

  const direction = DIRECTION_OFFSETS.findIndex(([ox, oy]) => ox === dx && oy === dy);
  if (direction < 0) return;
  lastWalkAt = now;

  // local prediction: move immediately, the server confirms through the ObjectWalked broadcast
  const view = renderer.getCharacter(selfId ?? -1);
  if (view) renderer.setTarget(view.id, view.targetX + dx, view.targetY + dy);
  session.walk([direction]);
}

function pumpPing(): void {
  if (!session) return;
  const now = performance.now();
  if (now - lastPingAt < 2000) return;
  lastPingAt = now;
  const sentAt = now;
  void session
    .ping()
    .then(() => {
      pings.push(performance.now() - sentAt);
      pings = pings.slice(-5);
    })
    .catch(() => undefined);
}

window.addEventListener('keydown', (event) => pressed.add(event.key.length === 1 ? event.key.toLowerCase() : event.key));
window.addEventListener('keyup', (event) => pressed.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key));
window.addEventListener('beforeunload', () => session?.close());

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const username = (document.querySelector<HTMLInputElement>('#user')!).value;
  const password = (document.querySelector<HTMLInputElement>('#pass')!).value;
  start(username, password).catch((error: unknown) => log(`error: ${(error as Error).message}`));
});

function resize(): void {
  const width = canvas.clientWidth || window.innerWidth;
  const height = canvas.clientHeight || window.innerHeight;
  renderer.resize(width, height);
}
window.addEventListener('resize', resize);
resize();
renderer.render({ x: 125, y: 125 });
updateHud();
log('ready — use the form to log in (demo/demo). The gateway must be running.');
