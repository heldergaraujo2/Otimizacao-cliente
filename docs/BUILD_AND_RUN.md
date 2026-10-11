# BUILD_AND_RUN — reproducible environment, build, tests, benchmarks

## 1. Requirements

| Component | Requirement |
| --- | --- |
| Node.js | `>= 22` (validated on `v22.22.3`); npm `>= 10` |
| Python | 3.x — only for helper scripts (`scripts/fetch-references.sh`) |
| OS | any (validated on Linux x86_64; Windows/macOS untested but no platform-specific code is used) |
| Network | only for `npm install` and (optionally) cloning pinned references |
| GPU | not needed for build/tests/benchmarks; needed for the renderer (see §6) |

## 2. First run

```bash
git clone <this repository> && cd Otimizacao-cliente
npm install          # workspaces: packages/*, tools/*
npm run build        # tsc for every workspace
npm test             # node --test per workspace
npm run bench        # throughput numbers (see docs/PERFORMANCE.md)
```

`npm install` is required after a fresh clone/restore: `node_modules/` is not committed.

## 3. Per-workspace commands

```bash
npm run build -w @mu-reengineer/protocol
npm test      -w @mu-reengineer/protocol      # 35 tests
npm run bench -w @mu-reengineer/protocol

npm run build -w @mu-reengineer/formats
npm test      -w @mu-reengineer/formats       # 22 tests
npm run bench -w @mu-reengineer/formats

npm run build -w @mu-reengineer/cli
npm test      -w @mu-reengineer/cli           # 8 tests (incl. the built CLI end to end)
```

CLI examples:

```bash
npm run cli -- inspect "D:/MU-REENGINEER-DATA/Data/Player.bmd"
npm run cli -- scan "D:/MU-REENGINEER-DATA/Data" --limit 500
npm run cli -- export-png "D:/MU-REENGINEER-DATA/Data/World1/grass01.ozt" out/grass01.png
npm run cli -- gen-fixtures --out tests/fixtures
npm run cli -- decode-packet "c3 3b f1 01 …" --direction c2s
```

Root scripts: `build`, `test`, `bench`, `clean` (`rm -rf packages/*/dist tools/*/dist`), `cli`.

## 4. Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request: install → build → test (Node 22), then
a fixture generation/parse step once `tools/mu-cli` lands. A published commit is not the same as a
passing build — check the run.

## 5. Reference material (optional, research only)

```bash
bash scripts/fetch-references.sh /path/to/third_party   # clones the pinned commits from PINS.json
```

These clones are never compiled or imported by the build. They require network access; in restricted
environments skip them and rely on the committed vectors and documentation in `docs/protocol/`.

## 6. Running the client / server

The server and the headless client core are implemented and exercised by the integration test. Start
them from a script:

```js
// demo.mjs — needs `npm run build` first
import { startMuServer } from '@mu-reengineer/server';
import { connectTcpSession, fetchServerList, fetchConnectionInfo } from '@mu-reengineer/client';

const server = await startMuServer({});                    // ephemeral ports
console.log(await fetchServerList(server.host, server.connectPort));       // [ { serverId: 0, loadPercentage: 0 } ]
const game = await fetchConnectionInfo(server.host, server.connectPort, 0);
const session = await connectTcpSession({ host: game.ipAddress, port: game.port });
console.log(await session.login('demo', 'demo'));          // 0 = LoginResult.Okay
console.log(await session.requestCharacterList());
await session.selectCharacter('DarkKnight');
await session.clientReady();
session.walk([2, 2, 2]);                                   // three steps east (125 -> 128)
session.close();
await server.close();
```

Demo accounts (development only): `demo`/`demo` → character `DarkKnight`, `alt`/`alt` → `ElfArcher`.
The world starts with five monsters/NPCs around the spawn point and they wander once per integer
interval — `startMuServer({ npcTickMs: 800 })` (default), `npcTickMs: 0` for a still world,
`npcSpawns: […]` / `withDemoNpcs: false` to change or drop them, and `server.game.tickNpcs(rng)` to drive
a tick by hand (that is what the tests do). Every monster walk is broadcast through the same
`ObjectWalked` packet a player's walk uses, only to sessions that can see the monster.

Standalone server process (what a deployment runs, and what the Level 4 test spawns):

```bash
npm run server                                  # OS-picked ports, JSON status line on stdout
npm run server -- --connect-port 44405 --game-port 55901 --advertise-host 203.0.113.10
npm run server -- --no-demo-accounts --no-xor32  # experimentation only
npm run server -- --npc-tick 300                 # monsters wander every 300 ms (0 = still)
node packages/mu-server/dist/main.js --help      # all flags
```

### Sandbox lifecycle and preview availability (read this before promising a link)

Official rules — E2B docs, fetched 2026-10-11 (`/sandbox`, `/sandbox/persistence`, FAQ
"How long does a sandbox live?"):

| Rule | Value |
| --- | --- |
| Continuous runtime per plan | **Hobby 1 h**, Pro 24 h, Enterprise custom. The plan is *not* readable from inside. |
| Pausing/resuming | resets that window, so one sandbox can be reused indefinitely by pausing |
| Paused sandboxes | kept **indefinitely**, never killed by E2B on its own, **not billed**, do not count towards concurrency — but they **cannot execute**, so their URLs do not serve |
| Timeout expiring | `onTimeout: 'kill'` (the default) destroys the sandbox — a killed sandbox cannot be resumed; `onTimeout: 'pause'` preserves the filesystem **and** the memory |
| `autoResume` | a paused sandbox wakes on the next SDK call or HTTP request to one of its URLs |
| Default timeout | 5 minutes when the creator does not set one (`timeoutMs` / `setTimeout`) |

**What can be read from inside this sandbox (verified):** `E2B_SANDBOX_ID`, `E2B_TEMPLATE_ID` and
`E2B_SANDBOX=true` are set; **`E2B_API_KEY` is not**, and `https://api.e2b.dev` is unreachable (egress
allowlist). The timeout value, the `lifecycle` (`onTimeout` / `autoResume`) and the plan therefore
**cannot be read — let alone changed — from inside the sandbox**; that needs the E2B control plane from
the outside with an API key. The in-sandbox agent (envd) answers on `127.0.0.1:49983` (`GET /health`
→ `204 No Content`) and exposes execution, not lifecycle settings.

**What was observed (2026-10-11):** the sandbox pauses between agent turns and resumes with the **same
id** and the workspace restored. Boot times seen: `03:54:20` and `04:02:23` — a fresh VM each resume, so
what survives is the *filesystem*, not the memory. Since a killed sandbox "cannot be resumed" and loses
its state, the sandbox is being **paused, not killed**. The platform also **re-runs the process
registered through it**: minutes after the 04:02 boot, `node scripts/dev-preview.mjs` was already running
(`ppid 1`, from `/tmp/arena-workspace/procs/…`) before any command was issued. That is the pause/resume
strategy this project relies on — start the preview through the platform's process mechanism and it comes
back by itself.

**While paused, the preview URL answers `502 Bad Gateway — Sandbox not found`:** the edge has nothing to
route to. That is the cause of the error seen between sessions; it is **not** proof that the sandbox was
deleted, and it is not a fixed URL problem.

**Consequences for a shared link (never promise permanence):** `https://<port>-<sandbox id>.e2b.app` is
routable only while the sandbox is running, and the plan's continuous-runtime cap (1 h Hobby / 24 h Pro)
applies on top. After every resume:

```bash
node scripts/dev-preview.mjs --check     # 6 checks: TCP 5173/7788, page, /assets, /health, WebSocket 101
node scripts/dev-preview.mjs --rebuild   # only when the check fails
```

External proof from a different network is the **Preview check** workflow: it fetches the URL from a
GitHub runner (so the sandbox's own loopback cannot fake it). Point it at a URL through the repository
variable `PREVIEW_URL` (`gh variable set PREVIEW_URL --body https://…`) or by mentioning one `https://`
URL in a commit message, then watch the run — a red run while the sandbox is paused is expected.

### One command (recommended after any resume)

```bash
node scripts/dev-preview.mjs --rebuild        # npm ci + build + demo data, then both processes
node scripts/dev-preview.mjs                  # just start both (ports 7788 and 5173)
```

It prints the local URL and, when `E2B_SANDBOX_ID` is set, the **public preview URL**
(`https://<client port>-<sandbox id>.e2b.app`), refuses to start on a busy port, and stops both children
on Ctrl+C. Background processes do not survive a sandbox pause — re-run this command after a resume.

Browser renderer (implemented; needs a GPU in the *viewer's* machine). Movement is WASD/arrows — and
on a phone, the on-screen D-pad in the bottom-right corner, which drives the same input path:

```bash
# terminal 1 — game server + WebSocket gateway, also serving a data directory (binds 0.0.0.0:7788)
node tools/mu-gateway/dist/index.js --ws-port 7788 --server --data-dir /path/to/MU/data
#   or without a data directory (the page then renders its deterministic fixtures):
node tools/mu-gateway/dist/index.js --ws-port 7788 --server
#   MU_REENGINEER_DATA is used as the default for --data-dir

# terminal 2 — the client page (Vite, binds 0.0.0.0:5173, proxies /ws, /assets and /health)
npm run dev -w @mu-reengineer/client
```

No real data at hand? Write a synthetic data directory in the classic server layout:

Inspect a model (works on generated fixtures and on your own real files):

```bash
npm run cli -- export-obj tests/fixtures/model_v12.bmd /tmp/model.obj                    # rest pose
npm run cli -- export-obj <your.bmd> /tmp/posed.obj --action 0 --key 3.5                 # baked pose
```

```bash
node scripts/make-demo-data.mjs                       # -> assets-local/demo-data (gitignored)
node tools/mu-gateway/dist/index.js --ws-port 7788 --server --data-dir assets-local/demo-data
```

The asset route can be checked without a browser: `curl -s http://127.0.0.1:7788/assets/` lists the data
directory, `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:7788/assets/World1/EncTerrain1.att`
returns 200, and a case-insensitive path (`.../player/PLAYER.BMD`) resolves too.

Open the printed URL, log in with `demo`/`demo` and walk with WASD/arrow keys. The HUD shows state,
position, FPS, latency and packet counters. The page talks to the gateway through `/ws`, so it works
unchanged behind a host/proxy (nothing in browser code references localhost).

To point the gateway at an external server instead of the bundled one:

```bash
node tools/mu-gateway/dist/index.js --ws-port 7788 --game-host 127.0.0.1 --game-port 55901
```

## 6.1 Cipher profile

The server expects the XOR32 stream mask on the game connection (`xor32: true`, default). A client that
does not apply it is dropped during decryption and counted in `metrics.game.unsupportedPackets` /
`loginsFailed`; pass `xor32: false` to `startMuServer` to experiment with the plain profile.

## 7. Environment limitations observed in the automation sandbox

- No .NET SDK (`dotnet` absent, `dotnet.microsoft.com` unreachable) ⇒ the C# reference projects cannot
  be built here; Fase 3 stays `BLOQUEADO EXTERNANAMENTE`.
- No GPU / no `DISPLAY` ⇒ Levels 5–7 (visual, performance on real hardware) must be run by the user
  following `docs/TEST_STRATEGY.md`.
- Outbound network is limited ⇒ large game-data downloads must be done by the user.

## 8. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `Cannot find module 'dist/test/*.test.js'` | tests must use the quoted glob: `node --test "dist/test/*.test.js"` (bare directory arguments are not supported on Node 22) |
| `TS2591: Cannot find name 'process'` | `tsconfig.base.json` must keep `"types": ["node"]` |
| Build passes but tests are stale | `npm run build` emits to `dist/`; re-run it after source edits |
| `block checksum mismatch` when testing ciphers | wrong key pairing: the pair that interoperates is `encryptorServer` ↔ `decryptorClient` (and `encryptorClient` ↔ `decryptorServer`) |
