# ARCHITECTURE

## 1. Packages

```
packages/mu-protocol    pure protocol: framing, ciphers, packet codecs, connection pipeline
packages/mu-formats     pure resource readers/writers + deterministic fixture builders + PNG export
packages/mu-server      TCP server implementing the login/character/play slice
packages/mu-client      headless game core + browser renderer (WebGL/three.js)
tools/mu-cli            inspection/export/decoding CLI over mu-formats + mu-protocol
tests/vectors           golden vectors with provenance
```

Rules that keep this honest:

- `mu-protocol` and `mu-formats` perform **no I/O** and hold no global state. Everything is a
  function of the bytes you pass in, which is why they can be tested exhaustively in this sandbox.
- One implementation per format/codec, shared by tests, CLI, server and client. No test-only forks.
- Resource fixtures are **generated** by `testing/fixtures.ts` (the writing side of each container),
  so a passing test means reader and writer agree on the byte layout — not that a snapshot matches
  itself.

## 2. Wire protocol layer

```
TCP bytes ─► PacketAssembler ─► [cipher pipeline] ─► packet codecs ─► game logic
                    ▲                                        │
                    └──────────────  builders  ◄─────────────┘
```

- Framing: `C1/C3` → 2-byte header (type + length), `C2/C4` → 3-byte header (type + big-endian
  length). Only `C3/C4` payloads are encrypted.
- Ciphers: XOR3 (login credentials), XOR32 (optional stream mask), SimpleModulus (block cipher;
  `new` 8→11 bytes with a per-packet counter, `old` 32→38 bytes).
- Roles: client = encrypt `Enc.Client` / decrypt `Dec.Client`; server = encrypt `Enc.Server` /
  decrypt `Dec.Server`. The mirror rule (`Enc.Server` ↔ `Dec.Client`) is what makes both ends
  interoperate; getting it wrong produces "block checksum mismatch" immediately.
- `MuConnection` owns the pipeline, counters and metrics so both the server and the client exercise
  the same code path.

## 3. Resource layer

```
file bytes ─► container cipher ─► format reader ─► render-ready data ─► (client) GPU buffers
              FileCryptor | LEA-256 | ModulusCryptor
```

- BMD v12 (FileCryptor) / v15 (LEA-256) / v0 (plain): mesh, triangles, actions, bone hierarchy;
  `extractMeshGeometry` flattens to non-indexed attributes with single-bone weights (what a modern
  renderer wants) and flips V for GPU textures.
- Terrain: `ATT` (256×256 per tile flags, byte or extended), `MAP` (two texture layers + alpha
  blend map), `OBJ` (object placement records, six record sizes by version).
- Textures: `OZT` (32-bit BGRA), `OZB` (`BM6` 24-bit / `BM8` 8-bit + palette), `OZJ` (JPEG window
  inside a container), `TGA`, `DDS` (DXT1/3/5 and uncompressed).

## 4. Client (planned, Fase 5+)

- **Headless core** (`packages/mu-client/src/core`): session state machine on top of `MuConnection`,
  resource store over `mu-formats` with a configurable data root, world/scope model,
  server-authoritative movement with local prediction and reconciliation, event bus.
- **Renderer** (`packages/mu-client/src/render`): three.js scene for terrain + objects + characters,
  driven only by core state; camera and HUD are renderer concerns.
- Why: Levels 3/4 (session, movement, disconnect) are testable without a GPU, and the renderer can be
  replaced without touching game logic.

## 4.1 Browser client and gateway (implemented)

The browser cannot open TCP sockets, so the client is split in two layers plus a bridge:

```
browser page (three.js renderer, HUD, input)
      │  ClientSession  ── same core as the node tests (cipher pipeline, framing, state machine)
      │  WebSocket transport  ── binary frames = raw MU packets
      ▼
vite dev server  (/ws proxy, same-origin, works behind any host)
      ▼
tools/mu-gateway (WebSocket ⇄ TCP, one TCP connection per WebSocket)
      ▼
packages/mu-server (connect + game listeners)
```

Design notes:

- The **core never imports three.js** — the renderer subscribes to `ClientSession` state, which is why
  the whole session is testable headlessly (`npm test`).
- The page uses a **relative** gateway URL (`/ws`) and vite proxies it, so no localhost address is baked
  into browser code and the same build works behind the preview proxy.
- The gateway keeps one TCP connection per WebSocket, so cipher counters and the session state stay
  per-connection (proved by the "two clients are independent" test).
- Movement is predicted locally with the **shared** movement model (`@mu-reengineer/protocol`,
  `applyWalk`): the same function the server validates with, so prediction and authority cannot drift
  apart. A rejected prediction triggers a scope refresh, and the authoritative self position from the
  scope packets is adopted (`resyncPosition`).
- Monsters/NPCs are world objects like characters (`kind: 'npc'`, `typeNumber`), so scope, distance and
  removal are one code path; only the packet differs: `AddNpcsToScope` (C2 13, 10-byte records) instead
  of `AddCharactersToScope` (C2 12, 36-byte records). Both are diffed by `syncScopes()`, and scope
  removals always travel in `MapObjectOutOfScope` (C1 14) regardless of what was removed.
- Monster behaviour lives in `mu-server/src/npc.ts`: `wanderNpcs(world, rng)` picks an idle roll, a step
  count and a direction per monster and moves it **through `World.move`**, so a monster obeys exactly the
  rules a player does (bounds, step limit) and its packets are shaped identically — a blocked monster
  turns around, it never walks off the map. `GameServer.tickNpcs()` broadcasts one `ObjectWalked` per
  moving monster to the sessions that can see it and then runs the usual scope diff; `startNpcTicker`
  drives it periodically (server option `npcTickMs`, CLI `--npc-tick`, `0` = still world). Randomness is
  injected, which is what makes the behaviour testable.
- Characters are animated with the BMD skeleton: the renderer builds three.js bones from the model's
  bone list, binds the mesh with **identity** bind matrices (vertices are stored in bone space) and,
  every frame, samples the clip through `mu-formats` (`computeBoneWorldMatrices`) to drive both the
  bone transforms and the GPU skinning.
- Resources: the node side uses `packages/mu-client/src/resources/loader.ts` (case-insensitive
  resolution for Windows data trees, cache keyed by resolved path + size + mtime, close-candidate hints
  on 404). The browser reaches the same data through the gateway's `/assets/` route, which resolves
  through that loader and streams the file — so the page renders real ATT/MAP/OBJ/BMD files when
  `--data-dir`/`MU_REENGINEER_DATA` is set, and the deterministic `mu-formats` fixtures otherwise.
  `scripts/make-demo-data.mjs` writes a synthetic data directory in the classic server layout for a dry
  run.

## 5. Server (implemented — see §3 above)

- ConnectServer and GameServer listeners sharing `MuConnection` (server role), accounts/characters in
  memory (file-persisted optionally), scope/viewport management, movement validation, chat and server
  messages. The goal is a *compatible* server for development and integration tests — not a
  production service; OpenMU remains the reference implementation for full feature parity.

## 6. Cross-cutting

- **Determinism:** fixtures and benchmarks are seed-free and byte-reproducible; benchmarks print the
  runtime and record numbers in `docs/PERFORMANCE.md`.
- **Failure behaviour:** parsers validate sizes/counts and throw descriptive errors; unsupported
  ciphers throw `UnsupportedCipherError` instead of producing garbage.
- **Licensing:** MIT for our code; references keep their own licences; game data never enters the
  repository.
