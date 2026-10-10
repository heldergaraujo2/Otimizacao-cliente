# CURRENT_STATE — what really works right now (2026-10-10)

Evidence rule: every "CONCLUÍDO COM EVIDÊNCIAS" line below has a command that was executed and a
result that was observed. Anything written but not executed is "EM ANDAMENTO".

## Environment actually used

| Item | Value |
| --- | --- |
| OS/CPU | Linux x86_64, Intel Xeon @ 2.60 GHz, 2 vCPU, 3.9 GiB RAM |
| Runtimes | Node `v22.22.3`, npm `10.9.8`, python3 |
| Missing | .NET SDK, GPU/`DISPLAY`, unrestricted internet |

## Per-component state

### `packages/mu-protocol` — CONCLUÍDO COM EVIDÊNCIAS

Implemented: C1/C3 (2-byte) and C2/C4 (3-byte, big-endian length) framing; `PacketAssembler`;
XOR3 and XOR32 stream ciphers; SimpleModulus encryptor/decryptor ("new" 8→11 bytes with counter, and
"old" 32→38 bytes variants); connection pipeline for both roles; packet builders/parsers for the
vertical slice (ConnectServer `F4 03/06`, Login `F1 00/01/02`, character list `F3 00`, selection
`F3 03`, `F3 12` client ready, `1C 0F` map changed, `12` add characters to scope, `D4` walk,
`0E 00` ping, scope/chat/entry packets).

Evidence:

```bash
npm run build -w @mu-reengineer/protocol     # clean
npm test -w @mu-reengineer/protocol          # 35 tests, 35 pass, 0 fail
npm run bench -w @mu-reengineer/protocol     # recorded in docs/PERFORMANCE.md
```

Conformance: `tests/vectors/openmu_simplemodulus.json` (4 vectors, generated from OpenMU
`89c8f07`, MIT) replay byte-exactly, including `C3 185 → 255` and `C4 3000 → 4128` and the
`0x3D`/`0xF8` block-size/checksum constants.

### `packages/mu-formats` — EM ANDAMENTO (tests green, no real-game-data validation)

Implemented and tested: FileCryptor (`.map/.obj/.att`, BMD v12) encrypt+decrypt; BUX mask;
ModulusCryptor container detection + TEA/RC5 stage decryption (`ThreeWay`, `CAST5`, `RC6`, `MARS`,
`IDEA`, `GOST` throw a diagnosable `UnsupportedCipherError`); LEA-256 ECB; BMD v12/v15/v0 parsing,
geometry extraction and euler→quaternion; OZT/OZB/OZJ/TGA/DDS texture decoding; ATT/MAP/OBJ terrain
parsing; dependency-free PNG encoder.

Evidence:

```bash
npm run build                                # clean, all workspaces
npm test -w @mu-reengineer/formats           # 22 tests, 22 pass, 0 fail
npm run bench -w @mu-reengineer/formats      # recorded in docs/PERFORMANCE.md
```

Limits: the LEA-256 fixture encryptor is an algebraic inverse of the decryption rounds (documented in
`src/testing/fixtures.ts`) — proven only round-trip; real v15 assets were not available to validate
against. No real `.bmd/.ozt/.att` file has been parsed yet (blocked by data availability, see below).

### `packages/mu-server` — CONCLUÍDO COM EVIDÊNCIAS (vertical slice)

Implemented: TCP listeners for the connect server and the game server, `World` (authoritative
movement with bounds/step/source validation, scope queries), `AccountStore` (in-memory, two demo
accounts), session state machine (`connected → authenticated → character-selected → in-game`) covering
login, character list, character selection, character information, map change, client ready, scope,
walk/broadcast, ping echo, logout, disconnect cleanup and explicit rejection of unsupported packets.

Evidence:

```bash
npm test -w @mu-reengineer/server        # 9/9 world-rule tests
npm test -w @mu-reengineer/client        # 6/6 integration tests over real sockets
```

Manual end-to-end run (no mocks, real ciphers/counters/framing):

```
server list : [{"serverId":0,"loadPercentage":0}]
game server : {"ipAddress":"127.0.0.1","port":37505}
login       : 0                     (LoginResult.Okay)
characters  : [ 'DarkKnight' ]
map changed : {"isMapChange":true,"mapNumber":0,"x":125,"y":125,"rotation":2}
scope       : [ 'DarkKnight' ]
world after 3 east steps: [{"name":"DarkKnight","x":128,"y":125}]
metrics     : {"connections":1,"logins":1,"loginsFailed":0,"charactersSelected":1,
               "walksAccepted":1,"walksRejected":0,"scopePackets":1,
               "unsupportedPackets":0,"disconnects":0}
```

### `packages/mu-client` — EM ANDAMENTO (core + renderer implemented, visuals unverified)

- **Core (tested):** `ClientSession` (login, character list, selection, client ready, walk, ping, event
  streams for scope/walked/server message, buffered `waitFor`), ConnectServer client
  (`fetchServerList`, `fetchConnectionInfo`) and `connectTcpSession`.
- **Transport-agnostic:** `ClientSession.attach(transport)` takes any transport, so the same core runs
  over node TCP (tests) and over WebSocket (browser).
- **Renderer (new):** `src/browser/` — `MuRenderer` builds the terrain mesh from ATT/MAP tile
  attributes (water/safe/no-ground colouring plus texture-index shading), places OBJ objects, builds
  the character mesh from BMD geometry via `extractMeshGeometry`, follows the player with the camera and
  reports FPS. `main.ts` wires login → character list → selection → client ready → keyboard movement
  with local prediction → HUD (state, position, FPS, latency, packet/byte counters).
- **Not verified here:** WebGL output and frame times — this sandbox has no GPU/display, so Level 5/6
  are `PENDENTE DE VALIDAÇÃO HUMANA`; the page itself is served as a live preview.

### View synchronisation + standalone server process — CONCLUÍDO COM EVIDÊNCIAS (2026-10-10)

- **Scope synchroniser** (`mu-server/src/game-server.ts`): each session remembers its view; after any
  visibility change the server diffs it against `World.inScope` and sends only additions
  (`AddCharactersToScope`) and removals (`MapObjectOutOfScope`). Entering, walking into/out of range and
  disconnecting are all covered by the same pass.
- **Shared movement model** (`mu-protocol/src/mu/movement.ts`): `applyWalk` is used by the client for
  prediction *and* by the server for validation, so the two can no longer disagree; it is exported from
  the protocol barrel and re-exported by `mu-server/src/world.ts`.
- **Client prediction and reconciliation**: `ClientSession.walk()` returns the predicted outcome, the
  session tracks the predicted position, adopts the server's authoritative entry from scope packets and
  can ask for a refresh (`requestScopeRefresh`) after a rejection.
- **Standalone server process** (`mu-server/src/main.ts`, `npm run server`): CLI flags, JSON status line
  (`{"event":"listening","host":…,"connectPort":…,"gamePort":…}`), SIGINT/SIGTERM shutdown, fail-fast on
  a busy port.

Evidence:

```bash
npm run build                       # clean
npm test                            # 103/103 (protocol 42 · formats 22 · client 15 · server 9 · cli 8 · gateway 7)

# the CLI by hand
node packages/mu-server/dist/main.js --help
node packages/mu-server/dist/main.js --status-json --no-demo-accounts
#   -> {"event":"listening","host":"0.0.0.0","connectPort":39183,"gamePort":43765}
#   -> [server] ready — connect 0.0.0.0:39183, game 0.0.0.0:43765 (xor32=true, demo accounts=no)

# Level 4 automated (separate OS process, real TCP, clean shutdown)
node --test packages/mu-client/dist/test/../dist/test/level4-process.test.js   # 2/2
```

### Resource layer + asset route — CONCLUÍDO COM EVIDÊNCIAS (2026-10-10)

- `packages/mu-client/src/resources/loader.ts`: case-insensitive path resolution (Windows data trees),
  cache keyed by resolved path + size + mtime (a replaced file is re-read — asserted), close-candidate
  hints on 404, refusal of `..` traversal, typed loaders (`loadAtt`/`loadMap`/`loadObj`/`loadBmd`/
  `loadTexture`) and `loadTerrain(worldIndex)` using the classic server naming
  (`World<n>/EncTerrain<n>.{att,map,obj}`). 6 automated tests.
- `tools/mu-gateway`: `GET /assets/` (JSON index + loader stats), `GET /assets/<path>` (streamed with
  content types and cache headers), `/health` reporting the data directory and served counters.
  4 automated tests (bytes identical to the file, case-insensitive lookup, 404 with candidates and no
  absolute path, 405/HEAD).
- `scripts/make-demo-data.mjs` writes a synthetic data directory in that layout so the preview can be
  exercised without proprietary files.

Verified live (2026-10-10, gateway restarted with `--data-dir assets-local/demo-data`, all requests
through the Vite proxy the browser uses):

```
GET /assets/                        -> 6 files (Player/Player.bmd, World1/EncTerrain1.{att,map,obj}, 2x .OZT)
GET /assets/World1/EncTerrain1.att  -> 131076 B (= 4 + 256*256*2, the real ATT size)
GET /assets/player/PLAYER.BMD       -> 200 (case-insensitive)
GET /assets/World1/EncTerrain2.att  -> 404
ws://127.0.0.1:5173/ws              -> login 0, scope ['DarkKnight'], ping ok,
                                       framingRejects 0 / decryptErrors 0 / encryptErrors 0
```

### `tools/mu-gateway` — CONCLUÍDO COM EVIDÊNCIAS

WebSocket ⇄ TCP bridge (one TCP connection per WebSocket, `/health` endpoint, `--server` flag to start
the bundled game server). 3/3 tests: full session through the bridge, health/404 handling, and two
independent sessions on the same gateway (the second login of one account is rejected — proof the
sessions really are separate TCP connections).

Manual end-to-end proof of the browser path (recorded):

```
page: 200 (vite dev server)
ws://127.0.0.1:5173/ws  →  login 0 · characters ['DarkKnight'] · map {"mapNumber":0,"x":125,"y":125}
                           scope ['DarkKnight'] · ping {"tickCount":667674895}
                           metrics {"packetsIn":7,"packetsOut":6,"bytesIn":249,"bytesOut":145,
                                    "framingRejects":0,"decryptErrors":0,"encryptErrors":0}
```

### `tools/mu-cli` — CONCLUÍDO COM EVIDÊNCIAS

Implemented: `inspect <file>` (BMD v0/v12/v15, OZT/OZB/OZJ/TGA/DDS, ATT/MAP/OBJ, unknown), `export-png`
(textures → PNG; OZJ → embedded `.jpg`), `scan <dir>` (classifies a data directory and reports
unreadable files — the tool the user runs on real game data), `gen-fixtures --out <dir>` (writes the 10
deterministic fixtures and re-parses all of them from disk), `decode-packet <hex>` (framing +
SimpleModulus with the right key pair per direction + codecs; recovers login credentials through XOR3).
`--json` on every command for machine consumption.

Evidence:

```bash
npm run build                                        # clean
node --test "tools/mu-cli/dist/test/*.test.js"       # 8 tests, 8 pass
node tools/mu-cli/dist/index.js gen-fixtures --out /tmp/fx   # 10/10 re-parsed successfully
node tools/mu-cli/dist/index.js scan /tmp/fx         # 10 files, 10 ok, formats classified
node tools/mu-cli/dist/index.js inspect /tmp/fx/model_v15.bmd  # v15, 4 vertices, 2 triangles, 3 bones
```

Also added to `packages/mu-protocol`: `SimpleModulusDecryptor.lastCounter` (reports the counter value
accepted for the last packet — used by the CLI diagnostics and asserted in the protocol suite).

### Documentation / continuity — EM ANDAMENTO

`AGENTS.md`, `README.md`, `project/*`, `docs/*` created. `docs/protocol/` keeps the raw protocol
material extracted from the references (`cts.xml`, `packets_summary.txt`, `slice_packets.txt`).

### Continuous integration — CONCLUÍDO COM EVIDÊNCIAS (config), unwatched

`.github/workflows/ci.yml` builds and tests every workspace on Node 22 for every push. Local
equivalent executed repeatedly; the GitHub run itself has not been observed from this sandbox.

## Externally blocked

| Blocked item | Reason (evidence) | Unblock command |
| --- | --- | --- |
| MU Red Season 20 v1.20.61 data | `curl` to the download host returns `HTTP 000` (egress blocked) | user downloads the package and points `MU_REENGINEER_DATA` at it: `MU_REENGINEER_DATA=D:\MU-REENGINEER-DATA npm run cli -- inspect <file>` |
| Building `xulek/muonline`, OpenMU, MuEmu | no .NET SDK; `dotnet.microsoft.com` unreachable | user runs `dotnet build` on a machine with .NET 10 (client) / .NET 9 (OpenMU) |
| Visual/FPS validation (Levels 5–7) | no GPU, no `DISPLAY`, 2 vCPU | user runs the client build on real hardware following `docs/TEST_STRATEGY.md` §Level 6/7 |

## Known issues / gaps (honest list)

1. SimpleModulus "old" (32-byte block, 16 words) variant has no round-trip test: the shipped default
   key pairs are 4-word sets, so a synthetic 48-value key set would be needed. Implemented but
   **unverified**.
2. BMD v15 LEA key is taken from the ISC reference; the decryption is verified against our own
   encryptor, not against a real encrypted asset.
3. OZJ returns the embedded JPEG window; JPEG decoding itself is delegated to the host
   (browser/`sharp`) rather than reimplemented.
4. `.att`/`.map` ModulusCryptor algorithms beyond TEA/RC5 are declared but not implemented; real
   files using them will fail loudly with `UnsupportedCipherError`.
5. `packets_summary.txt`/`slice_packets.txt` are working dumps extracted from the reference
   repositories (JSON-ish text), kept as provenance, not as a normative spec.
