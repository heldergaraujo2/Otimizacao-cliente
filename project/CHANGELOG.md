# CHANGELOG

Concrete changes with the evidence that proves them. Newest first.

## 2026-10-11 — browser-safe terrain path extraction

**Change:** extracted the shared `DEFAULT_PATHS` constants into `packages/mu-client/src/resources/paths.ts`,
a module with no Node.js imports. The browser resource module now imports from `paths.js` rather than
`loader.js`; the filesystem loader imports the shared constants. This prevents the browser entry from
pulling Node-only filesystem/path dependencies through the resource loader just to obtain three path strings.

**Files:** `packages/mu-client/src/resources/paths.ts` (new),
`packages/mu-client/src/browser/resources.ts`, `packages/mu-client/src/resources/loader.ts`.

**Validation:** source was re-read through the GitHub connector after the changes and the import/extraction
was confirmed. Build and tests were **not executed in this session** because this GitHub editing environment
does not provide the repository's local Node runtime. Status remains unverified until the next local build.

## 2026-10-11 — cycle 15: sandbox lifecycle understood, preview `--check` and external verification

**Why:** the preview link returned `502 Bad Gateway — Sandbox not found` between sessions. The question
was not "how do we rebuild it" but "what does the platform actually guarantee", so this cycle starts from
the official E2B documentation instead of guesses.

**Findings (documented in `docs/BUILD_AND_RUN.md` §"Sandbox lifecycle and preview availability")**

- Continuous runtime is capped by the plan — **1 h (Hobby) / 24 h (Pro)**; pausing and resuming resets the
  window, and paused sandboxes are kept **indefinitely**, are **not billed** and do not count towards
  concurrency, but **cannot execute**, so their URLs do not serve.
- `onTimeout: 'kill'` is the destructive default; `onTimeout: 'pause'` keeps the filesystem **and** the
  memory. `autoResume` wakes a paused sandbox on the next SDK call or HTTP request to one of its URLs.
  The default timeout is 5 minutes when the creator does not set one.
- **Readable from inside:** `E2B_SANDBOX_ID`, `E2B_TEMPLATE_ID`, `E2B_SANDBOX=true`, and the in-sandbox
  agent (envd) on `127.0.0.1:49983` (`GET /health` → 204). **Not readable:** the timeout value, the
  `lifecycle` (`onTimeout` / `autoResume`) and the plan — `E2B_API_KEY` is absent and `api.e2b.dev` is
  unreachable (curl `SSL_ERROR_SYSCALL`), so only the control plane from outside can read or change them.
- **Observed:** the sandbox resumes with the **same id** and a restored filesystem, on a fresh VM (boots
  at `03:54:20` and `04:02:23`; `/proc/uptime` and `btime` agree), which rules out `kill` (a killed sandbox
  cannot be resumed) and shows the memory is not what survives. The platform **re-executed the registered
  process** after the resume: `node scripts/dev-preview.mjs` was already running with `ppid 1` from
  `/tmp/arena-workspace/procs/…`, minutes after boot and before any command was issued.
- **Cause of the 502:** the sandbox was **paused** at the time, and a paused sandbox has no running
  instance for the edge to route to. The URL itself was never "wrong"; it only exists while the sandbox runs.

**Changes**

- `scripts/dev-preview.mjs --check`: verifies a running preview with six checks — TCP on both ports, `GET /`
  (200 + `MU-REENGINEER` marker), `GET /assets/` (200 + file count), `GET /health` (200 + `ok: true`) and a
  **raw WebSocket handshake** expecting `101` (implemented with `node:http` + 16 random bytes in base64 for
  `Sec-WebSocket-Key`, no dependency). Exit 0/1 with actionable next steps.
- `.github/workflows/preview-check.yml`: fetches the preview URL **from a GitHub runner**, i.e. from a
  different network, and checks the page, the asset index and `/health`, failing the run when any of them
  is not 200. The URL comes from the repository variable `PREVIEW_URL` (set: `gh variable set`) or from the
  first `https://` URL in the commit message; with neither, the job skips.

**Evidence**

- `node scripts/dev-preview.mjs --check` → **6/6 ok** (including `WebSocket /ws upgrades to 101`), and the
  negative cases behave as designed: an unused port reports `5 of 6 checks failed` with the restart
  commands, and a busy port is refused with `gateway port 7788 is already in use (EADDRINUSE)`.
- `btime`/`uptime` cross-check of the 04:02:23 boot; `ps` tree showing the platform re-running
  `scripts/dev-preview.mjs` → gateway + Vite after the resume; `ss -ltnp` showing `0.0.0.0:5173` and
  `0.0.0.0:7788` owned by those processes.
- External (non-loopback) verification, first attempts: run `38110806699` **failed** while the preview was
  healthy locally (the codes were not capturable at that time — GitHub's job logs live in blob storage
  that the sandbox's egress allowlist blocks, `gh api .../jobs/<id>/logs` → 0 bytes). The workflow was
  therefore changed to publish every HTTP status as an **annotation and a commit status**, which the
  sandbox *can* read through github.com. Run `38110857672` resolved no URL (it skipped): the repository
  variable cannot be managed with the Arena integration token (403 "Resource not accessible by
  integration"), so the commit-message channel is the usable one here. The detailed external result is
  recorded in the commit status `preview-check/external` of the latest pushed sha and in the run
  annotations — see the cycle report for the numbers.

**External verification (the real numbers, after the first runs)**

- Run `38110806699` failed with no capturable detail; the workflow was then changed to publish the edge's
  answer as a **commit status and annotations** (`gh api …/commits/<sha>/statuses`), because GitHub's job
  logs live in blob storage that the sandbox's egress allowlist blocks (`gh api …/jobs/<id>/logs` → 0
  bytes). Run `38110857672` skipped: the repository variable cannot be created with the Arena integration
  token (403 "Resource not accessible by integration"), so the **commit-message channel** is the usable one.
- The authoritative observation, from a GitHub runner: **`page=403 index=403 health=403`**. E2B documents
  exactly this answer for a sandbox created with `allowPublicTraffic: false`, where every request must
  carry the `e2b-traffic-access-token` header. The same requests that reach the port directly with the
  public `Host` header answer **200** (page) and **101** (WebSocket upgrade) — so the application serves
  correctly; what the external caller hits is the *edge's authorization*, not a broken app.
- **Correction to the earlier assumption:** the bare preview URL is *not* an open public link, and a green
  "the URL works" claim would have been wrong. What is true: the app works (verified against the port,
  including the public host/origin), the platform's preview panel is the authorized path the user opens,
  and an unauthenticated external client gets 403. The workflow now encodes that: 403 = running behind the
  protected edge (green), 502 = paused (red), 200 = openly reachable (green).

**Limitation (unchanged, by platform design)**

The preview cannot be made permanent: it lives while the sandbox runs, and the sandbox lifecycle is owned
by the platform (timeout, plan cap, pause policy). Everything needed to bring it back in one command, and
to prove it is back from outside, is now in the repository.

## 2026-10-11 — cycle 14: one-command preview (`scripts/dev-preview.mjs`)

**Why:** a paused/resumed sandbox stops every background process, and the previous instructions left the
operator to rebuild and start two processes by hand — which is exactly what broke the preview after the
resume ("Sandbox not found" was the *old* host being gone; the current sandbox is the same logical
environment, resumed with fresh processes).

**Changes**

- `scripts/dev-preview.mjs` (new, no dependencies): starts the game server + WebSocket gateway
  (`--server --data-dir`, default port 7788) and the Vite client (`--host 0.0.0.0`, default port 5173),
  prints the local URL **and the public preview URL when `E2B_SANDBOX_ID` is set**, and stops both
  children on Ctrl+C/SIGINT/SIGTERM (and if one dies). `--rebuild` chains `npm ci` → `npm run build` →
  `make-demo-data.mjs` for a from-scratch resume. It **refuses to start on a busy port** with an explicit
  message instead of stealing it (verified: exit 1, "gateway port 7788 is already in use"), and it fails
  with a clear message when the build output is missing.

**Evidence (all executed on the resumed sandbox)**

- `npm ci` → ok (lockfile is compatible, 0 vulnerabilities); `npm run build` → clean;
  `node scripts/make-demo-data.mjs` → 6 files; `npm test` → **126 tests, 0 failures**.
- `node scripts/dev-preview.mjs` printed `https://5173-i1y4tsfcrh04e1xbp7t9l.e2b.app` and both
  listeners came up (7788, 5173 on 0.0.0.0).
- Through the public `Host` header: `/`, `/@vite/client`, `/src/browser/main.ts`, `/assets/`,
  `/assets/World1/EncTerrain1.att`, `/assets/Player/Player.bmd`, `/health` → **200**; the served page
  still contains the touch D-pad and the media query.
- WebSocket upgrade **101** with the public `Host`/`Origin`, then a full session: login `0`,
  `DarkKnight`, monsters in scope, 8 monster walks (4/4 moved), `walk` accepted → 127,125.

**Note on the platform (recorded, not a defect):** background processes are restarted by the Arena
supervisor on resume but are not guaranteed to survive indefinitely, and the preview host
(`<port>-<sandbox id>.e2b.app`) only answers while the sandbox lives. The reproducible procedure is now
one command, documented in `BUILD_AND_RUN.md` and remembered in `NEXT_TASK.md`.

## 2026-10-11 — cycle 13: preview robust on touch devices + local git refs restored

**Changes**

- `packages/mu-client/src/browser/main.ts`: when the gateway serves a data directory
  (`--data-dir` / `MU_REENGINEER_DATA`) and the optional "model path" field is empty, the page now
  auto-selects the first `.bmd` found in the asset index instead of silently falling back to the
  generated fixture model. Typing a path on a phone was the only thing standing between the user and the
  real demo file; the field stays editable, and a model that fails to load now falls back to the fixture
  mesh (with the reason in the log) instead of leaving the scene without a character.
- `packages/mu-client/index.html` + `main.ts`: **touch D-pad** (▲◀▶▼, bottom-right). A phone has no
  keyboard and the page walks with WASD/arrows, so the buttons feed the very same `pressed` set the
  keyboard handlers use — prediction, the walk clip and the server round trip are literally the same code
  path. `pointerdown` adds the key, `pointerup`/`pointercancel`/`lostpointercapture` remove it (with
  pointer capture, so a finger sliding off a button cannot get stuck), `touch-action: none` keeps the
  page from scrolling, and a `@media (max-width: 760px)` block lets the HUD and the status card wrap
  instead of sitting under the pad on a narrow screen.
- `package-lock.json`: regenerated, which adds the `bin` entry (`mu-server` → `dist/main.js`) that the
  cycle-9 `package.json` change had introduced but never committed.

**Environment note (no code impact)**

The workspace snapshot that opened this cycle restored the working tree but left `.git` pointing at the
pre-session base commit, so every file of the project showed up as untracked. Nothing was lost: the
working tree was byte-identical to the remote tip (`ab80789`) — verified with
`git add -A && git diff --cached FETCH_HEAD`, which listed only the two files above. The local branch ref
was moved onto the remote tip with `git update-ref` (no `reset --hard`, no `clean`, no force push).

**Evidence**

- `npm test` → **126 tests, 0 failures** (protocol 43, formats 33, client 17, server 17, cli 9, gateway 7).
- Preview verified through the exact public host the platform proxy uses: `GET /` 200, `/@vite/client`
  200, `/src/browser/*.ts` 200, `/assets/*` 200 (six demo files), WebSocket upgrade **101** with
  `Host`/`Origin` set to the preview host, then a full session over that path — login `0`, character
  `DarkKnight`, monsters in scope, 10 monster walks, `walk` accepted, no errors in the Vite log.
- The served page was re-fetched after the touch-control change and contains the pad markup, the
  `data-key` buttons and the media query; the module served by Vite contains the pointer handlers.
  **Not verified here:** the actual finger interaction — this sandbox has no browser (no Chromium, no
  Playwright cache), so the visual/touch check is `PENDENTE DE VALIDAÇÃO HUMANA`.

## 2026-10-10 — cycle 12: monsters that wander (server tick + broadcast)

**Changes**

- `packages/mu-server/src/npc.ts` (new): `wanderNpcs(world, rng, options)` — per monster an idle roll,
  a step count (1..`maxSteps`, default 3) and a direction are drawn from an **injected** random source,
  and the movement goes through `World.move`, so a monster is subject to exactly the same validation as a
  player (step-count limit, direction mask, map bounds) and its packets are shaped identically. A
  monster pressed against the border retries with fresh directions and turns around or idles — it never
  walks off the map. Returns `NpcStep[]` (`{npc, directions, x, y, rotation, idle}`).
- `GameServer.tickNpcs(rng?)`: runs one wander step and broadcasts one `ObjectWalked` per moving monster,
  but only to the sessions that can `canSee()` it (the scope check runs before serialisation); then the
  usual `syncScopes()` pass. New metrics `npcTicks` (ticks that moved something) and `npcSteps` (walks
  broadcast). `startNpcTicker(intervalMs, rng?)` drives it periodically and is stopped by `close()`.
- `startMuServer` gained `npcTickMs` (default **800 ms**) and `npcRandom`, and now exposes the
  `GameServer` as `server.game` so callers can drive ticks by hand (the tests do). The standalone CLI
  gained `--npc-tick <ms>` (0 = still world).
- `packages/mu-client`: `ObjectWalked` for an object we track now updates the remembered view as well
  (scope entry and monster entry), so `scopeSnapshot()`/`npcSnapshot()` stay truthful instead of pinned
  to the packet that introduced the object. The page already moves and interpolates every object through
  `renderer.setTarget`, so monsters animate with no renderer change.

**Evidence**

- `npm test` → **125 tests, 0 failures**: protocol 43, formats 33, client 17, server 16, cli 9, gateway 7.
- New tests: 5 wander tests in `packages/mu-server/src/test/npc.test.ts` (straight walk with a pinned
  random sequence, idle, border turn-around with no negative coordinates, players untouched, identity and
  type number kept) and an integration test that drives two ticks with `server.game.tickNpcs(() => 0.5)`
  and asserts: 5 monsters walked, each `ObjectWalked` is two steps south from the row the client knew,
  the second tick continues from there, `npcTicks`/`npcSteps` match, the world agrees, the periodic
  `startNpcTicker` keeps ticking, and `npcSnapshot()` follows the broadcasts.
- Measurement (median of 3 runs, see `docs/PERFORMANCE.md`): 5 monsters + 1 session → 0.012 ms/tick
  (81 604 ticks/s); 200 monsters + 1 session → 0.082 ms/tick (12 218 ticks/s) with 9.45 broadcasts per
  tick — cost scales with *visible* monsters, not population.

**Follow-up inside the same cycle:** the wander gained a **home radius** (default 6 tiles, `homeRadius`
option) after the first live check showed the demo population slowly drifting out of the player's scope:
a candidate step is predicted with the same `applyWalk` the server validates with and rejected when it
would leave the territory, so a rejected candidate never touches the world. 1 more test (a monster at
the radius edge turns instead of walking out; the same draw is accepted with a larger radius) — server
17/17, total **126/126**.

**Limitations**

- The wander is not MU's monster AI: no aggression, no pathing around obstacles (the ATT walkability
  flags are not consulted), no respawn. It exists to make the world move through a validated,
  testable path and to exercise client-side interpolation of non-player objects.
- Monsters are still placeholders visually (coloured capsules) — no monster art exists in the repo.

## 2026-10-10 — cycle 11: monsters/NPCs in the world and in the client's view

**Changes**

- `packages/mu-protocol`: `AddNpcsToScope` (C2 13) builder/parser + `NpcScopeEntry`, and
  `GAME_CODE.ScopeNpcs = 0x13`. Layout verified twice: `ServerToClientPackets.xml` describes a 10-byte
  record (Id BE16, TypeNumber BE16, x, y, targetX, targetY, rotation byte, effect-count byte) and the
  generated `AddNpcsToScope` at `89c8f07` reads the rotation from bits 4..7 of that byte
  (`GetByteValue(4, 4)`), i.e. the same "rotation high" convention as the walk packets. The test asserts
  the byte indices (`packet[5]`..`packet[14]`) as well as the round trip.
- `packages/mu-server`: monsters/NPCs are ordinary world objects (`kind: 'npc'`, `typeNumber`) created by
  `World.spawnNpcs()` / `spawnDemoNpcs()` (five spawn around 125/125: three Budge Dragons, two Spiders,
  one Lorencia Guard). `isNpc()` lets `syncScopes()` split newcomers into `AddCharactersToScope`
  (players, 36-byte records) and `AddNpcsToScope` (monsters, 10-byte records) — one diff, both packets,
  and `MapObjectOutOfScope` still covers every removal. `startMuServer` spawns the demo population by
  default (`npcSpawns`, `withDemoNpcs: false` to opt out) and the standalone CLI gained `--no-npcs`.
- `packages/mu-client`: the session tracks monsters in their own map, emits `npcs`, exposes
  `npcSnapshot()` and clears them in `clientReady()` — so a walk away empties the view without touching
  the character list. The renderer draws each monster as a coloured capsule with a marker (no art exists
  for these type numbers yet), the page wires the `npcs` event into it and the HUD reports the count.

**Evidence**

- `npm test` → **119 tests, 0 failures**: protocol 43, formats 33, client 16, server 11, cli 9, gateway 7.
- New tests: protocol `npcs in scope follow the reference layout`; server `monsters are world objects
  with a type number and take part in the scope` and `spawnNpcs accepts a custom population and an empty
  one`; client integration `monsters are spawned, visible in scope and removed when the player walks
  away` (asserts 5 monsters in scope at spawn, `npcSnapshot()` = 0 after three 15-step walks west and
  `scopeRemovals >= 5`); gateway test now looks the player up by name and asserts monsters survive a
  player disconnect.
- Manual: `node packages/mu-server/dist/main.js --help` lists `--no-npcs`; the status line reports
  `npcs=yes/no`.

**Limitations**

- Monster behaviour (movement, AI, attack) is not implemented: they are static spawns. No art: the
  placeholder capsule is deliberate.
- `ObjectGotKilled` (C1 17) layout is known but no kill/damage flow exists yet.

## 2026-10-10 — cycle 10: BMD animation + skinning, OBJ exporter, animated client

**Changes**

- `packages/mu-formats/src/format/animation.ts` (new): `sampleBoneTransform` (linear key sampling with
  **shortest-way rotation interpolation** across the 0/2π seam), `transformToMatrix`, `multiplyMatrix`,
  `transformPoint`/`transformDirection`, `computeBoneWorldMatrices` (hierarchy composition with cycle
  safety), `skinMesh` (CPU skinning — the reference implementation), `summarizeActions`. Matrices are
  column-major 4x4 so the renderer consumes them without transposition. Vertices are stored in bone
  space with weight 1, which makes `boneWorldMatrix[node] * position` exact — documented in the module.
- `tools/mu-cli`: new `export-obj <file.bmd> <out.obj> [--action N --key K]` — deterministic Wavefront
  export, rest pose or baked/skinned pose, one group per mesh, texture paths as comments.
- Client renderer: characters are now **skinned**: the bone hierarchy is built from the model, the mesh
  is bound with identity bind matrices and every frame the clip is sampled through `mu-formats` to drive
  the bones (GPU skinning) — the same matrices the tested CPU path computes. Clips are switchable
  (`setAction`), the HUD shows bones/actions/current key, and the page plays the walk clip while moving
  and the idle clip otherwise. The BMD Z-up space is converted once (`-90°` about X).
- `formats-bench`: two new reproducible benchmarks for animation sampling and CPU skinning.

**Tests executed**

| Command | Result |
| --- | --- |
| `npm run build` | clean |
| `npm test` | protocol 42/42 · formats 33/33 · client 15/15 · server 9/9 · cli 9/9 · gateway 7/7 — **115/115, 0 fail** |

**New measurements** (`docs/PERFORMANCE.md`, median of 3 runs, same 2-vCPU container)

```
BMD animation: sample every bone, compose hierarchy   200 000 iters   548.5 ms   364 598 op/s
BMD animation: CPU skin one mesh (7 corners)          200 000 iters  1075.3 ms   185 990 op/s
```

**Verified by hand**

```bash
node tools/mu-cli/dist/index.js export-obj /tmp/fx2/model_v12.bmd /tmp/fx2/model_v12.obj
#   model MU-REENGINEER-test (BMD v12) · 1 mesh · 7 vertices · 2 faces · 3 bones · 1 action · as stored
node tools/mu-cli/dist/index.js export-obj /tmp/fx2/model_v12.bmd /tmp/fx2/model_anim.obj --action 0 --key 1.5
#   pose: skinned (baked from the action/key given) — 497 bytes, first vertex moves with the root bone
```

**Notes / limitations**

1. BMD actions carry **no names**; the mapping idle/walk/attack is a client convention (indices), which
   must be confirmed against a real model (`docs/COMPATIBILITY.md` §6).
2. Skinning weights are not interpolated: MU binds one bone per vertex with weight 1, so the GPU path
   uses three.js skinning with identity bind matrices and no blend. If a future format variant has
   weights, `skinMesh` (CPU) is the reference to extend.
3. The rendered result still cannot be verified here (no GPU): the numbers above are CPU costs, and the
   visual/animation check stays `PENDENTE DE VALIDAÇÃO HUMANA`.

## 2026-10-10 — cycle 9: view synchronisation, standalone server process, Level 4

**Changes**

- `packages/mu-server/src/game-server.ts`: the scope logic became a **diff-based view synchroniser**.
  Each in-game session remembers the objects it knows about; after every event that can change
  visibility (entering, walking, disconnecting) `syncScopes()` compares the remembered view with
  `World.inScope` and sends only the differences — one `AddCharactersToScope` for newcomers, one
  `MapObjectOutOfScope` for objects that left. Objects already known are never re-sent, and the
  explicit scope-refresh request (`C1 F3 12`) re-sends the whole view. New metrics: `scopeRemovals`
  (per object).
- `packages/mu-protocol/src/mu/movement.ts` (new): the movement model moved into the protocol package
  (`DIRECTION_OFFSETS`, `MAX_WALK_STEPS`, `MAP_SIZE`, `applyWalk`) because it is wire-format knowledge
  and **both ends must compute it identically**. `mu-server/src/world.ts` now delegates to it, and the
  browser client imports the same table instead of keeping its own copy.
- `packages/mu-client`: `ClientSession.walk()` now **predicts locally** with `applyWalk` (so the next
  walk declares the correct source position) and exposes `resyncPosition`/`scopeSnapshot`/
  `requestScopeRefresh`. The server's own entry in the scope packets is authoritative and is adopted
  automatically (reconciliation), and the page asks for a refresh after a rejected prediction.
- `packages/mu-server/src/main.ts` (new): standalone server process with CLI flags
  (`--host/--connect-port/--game-port/--advertise-host/--no-xor32/--no-demo-accounts/--status-json`),
  a machine-readable `{"event":"listening",…}` line, clean SIGINT/SIGTERM shutdown and a fail-fast
  exit code. `npm run server` and `mu-server` bin entry added.
- `packages/mu-client/src/test/level4-process.test.ts` (new): **Level 4** — spawns that CLI as a real
  separate process, reads its ports from the JSON line, performs the whole session over TCP
  (connect-server → login → character list → selection → scope → walk → ping), then requires exit code
  0 after SIGTERM and asserts the shutdown log; a second test checks that a busy port fails fast with
  exit code 1.

**Tests executed**

| Command | Result |
| --- | --- |
| `npm run build` | clean (6 workspaces + tools) |
| `npm test` | protocol 42/42 · formats 22/22 · client 15/15 · server 9/9 · cli 8/8 · gateway 7/7 — **103/103, 0 fail** |

New coverage specifically: movement model (6 tests: 8-way table, step/rotation semantics, high-bit
tolerance, step-count limits, map bounds, overridable map size), scope leave/return over real sockets
(12 steps east leave the observer's view with `MapObjectOutOfScope`, 12 steps back re-add the character
with the position up to date), and the process-level suite above.

**Notes / limitations**

1. `MapObjectOutOfScope` is sent per object; batching several removals in one packet is supported by the
   builder and exercised by the protocol tests.
2. Reconciliation stays deliberately simple: prediction + adopt the authoritative entry from a scope
   refresh. There is no rollback animation and no interpolation yet.
3. The CLI defaults to port 0 (OS-picked) so tests never collide; a real deployment passes explicit
   ports (`npm run server -- --connect-port 44405 --game-port 55901`).

## 2026-10-10 — cycle 7: reference-exact movement encoding, scope removal, preview re-run

**Changes**

- `mu-protocol`: movement nibble order corrected against BOTH generated reference structs —
  `WalkRequest` (client→server) and `ObjectWalked` (server→client) both pack the **rotation in the
  high nibble and the step count in the low nibble** (`GetByteValue(4, 4)` / `GetByteValue(4, 0)` in
  `ClientToServerPackets.cs` and `ServerToClientPackets.cs` at `89c8f07`). Builder, parser and tests
  now assert the wire bytes for both packets.
- `mu-protocol`: new `buildMapObjectOutOfScope`/`parseMapObjectOutOfScope` (C1 14: object count at
  index 3, big-endian uint16 ids from index 4) — the packet the reference defines for objects leaving
  a player view.
- `mu-server`: on disconnect the character is removed from the world *and* announced with
  `MapObjectOutOfScope` to every session that could see it; new metric `scopeRemovals`.
- `mu-client`: session emits `scopeRemoved`; the browser page removes the object from the scene.

**Tests executed**

| Command | Result |
| --- | --- |
| `npm run build` | clean |
| `npm test` | protocol 36/36 · formats 22/22 · server 9/9 · client 12/12 · cli 8/8 · gateway 7/7 — **94/94, 0 fail** |

**Preview re-run and verification (2026-10-10, fresh processes, latest build)**

```
page                     -> 200 (vite, 0.0.0.0:5173)
GET /assets/             -> 6 files | World1/EncTerrain1.att -> 131076 B
two WebSocket sessions through ws://127.0.0.1:5173/ws (the browser path):
  demo walks two steps east -> alt receives {"objectId":1,"targetX":127,"targetY":125,"rotation":2}
  demo disconnects         -> alt receives MapObjectOutOfScope [1]
```

**Notes**

1. The nibble order had been *self-consistent but wrong*: our client and server agreed with each other
   while disagreeing with the reference. It is now asserted byte-by-byte against the generated structs.
2. `MapObjectOutOfScope` carries no scope-box information, so a character that merely walks out of view
   is not announced yet (only disconnects are). Removal on distance is the next step in `NEXT_TASK.md`.
3. No GPU in this sandbox: the preview renders in the user's browser, frame metrics remain
   `PENDENTE DE VALIDAÇÃO HUMANA`.

## 2026-10-10 — cycle 6: resource pipeline (loader + HTTP asset route) and reference-accurate scope packets

**Changes**

- `packages/mu-client/src/resources/loader.ts` (new): case-insensitive resolution, cache keyed by
  path+size+mtime, typed loaders, `loadTerrain(worldIndex)` with the classic server naming, env-based
  construction (`MU_REENGINEER_DATA`), traversal refusal, close-candidate 404 hints.
- `tools/mu-gateway/src/assets.ts` (new): `/assets/` index and streamed `/assets/<path>` serving with
  content types; `/health` reports the data directory, loader stats and served counters.
- Browser client: `src/browser/resources.ts` fetches real data through the asset route; the renderer was
  refactored to be data-driven (`setTerrain(att, map, obj)`, `setCharacterModel(model)`) so fixtures and
  real files go through exactly the same code path. The page gained a "real data" toggle plus world-index
  and model-path inputs, and Vite proxies `/assets` and `/health` to the gateway.
- `scripts/make-demo-data.mjs` (new): writes a synthetic data directory in the classic layout.
- `mu-protocol`: **scope packet nibble order fixed against the reference** — in `AddCharactersToScope`
  the rotation is the *high* nibble and the hero state the *low* nibble of byte 34 (OpenMU generated
  `CharacterData`: `Rotation = GetByteValue(4, 4)`, `HeroState = GetByteValue(4, 0)`), effect count at
  byte 35, so a 36-byte record without effects. Builder, parser and tests updated.

**Tests executed**

| Command | Result |
| --- | --- |
| `npm run build` | clean |
| `npm test` | protocol 35/35 · formats 22/22 · server 9/9 · client 12/12 · cli 8/8 · gateway 7/7 — **93/93, 0 fail** |

**Verified live** (through the Vite proxy, i.e. the exact path the browser takes)

```
GET /assets/                        -> 6 files listed
GET /assets/World1/EncTerrain1.att  -> 131076 B (byte-exact)
GET /assets/player/PLAYER.BMD       -> 200 (case-insensitive)
GET /assets/World1/EncTerrain2.att  -> 404
ws://127.0.0.1:5173/ws              -> login 0 · scope ['DarkKnight'] · ping ok · 0 framing/decrypt/encrypt errors
```

**Notes / limitations**

1. The demo data is generated by us (fixture builders) — real-file fidelity still waits for Fase 2 data.
2. Textures are decoded by the loader but not yet bound to the terrain material (the palette derives from
   tile attributes and texture indices), and BMD actions are not played back yet.
3. The page's model-path input defaults to empty, so the synthetic model is used unless the user types a
   real path (for example `Player/Player.bmd`).

## 2026-10-10 — cycle 5: browser client + WebSocket gateway (live playable slice)

**Changes**

- New `packages/mu-client/src/browser/`: three.js renderer (terrain mesh from ATT/MAP with water/safe/
  no-ground colouring, OBJ objects, BMD character mesh, camera follow, lighting/fog, FPS meter) and the
  page entry point (login form, HUD with state/position/FPS/latency/packet counters, WASD + arrow keys,
  local movement prediction). `index.html` + `vite.config.ts` added (bind `0.0.0.0`, `allowedHosts`,
  `/ws` proxied to the gateway so browser code never references localhost).
- `ClientSession.attach(transport)` replaces the TCP-only constructor: the same core now runs over node
  TCP (tests) and WebSocket (browser). Node-only helpers moved to `net/tcp-session.ts`.
- New workspace `tools/mu-gateway` (`@mu-reengineer/gateway`): WebSocket ⇄ TCP bridge, one TCP
  connection per WebSocket, `/health`, `--server` flag to start the bundled game server.
- `package.json` root build now also builds the gateway.
- `mu-protocol`: bench NOTE now points at `docs/TEST_STRATEGY.md` (the old name did not exist).

**Tests executed**

| Command | Result |
| --- | --- |
| `npm run build` | clean (6 workspaces + tools, incl. browser code) |
| `npm test` | protocol 35/35 · formats 22/22 · server 9/9 · client 6/6 · cli 8/8 · gateway 3/3 — **83/83, 0 fail** |

**Live preview (served, not just claimed)**

- `node tools/mu-gateway/dist/index.js --ws-port 7788 --server` → game server on ephemeral ports behind
  `0.0.0.0:7788`; `npm run dev -w @mu-reengineer/client` → Vite on `0.0.0.0:5173`.
- `curl http://127.0.0.1:5173/` → 200; a session driven through `ws://127.0.0.1:5173/ws` completed
  login → character list → selection → scope → walk → ping with `framingRejects: 0`,
  `decryptErrors: 0`, `encryptErrors: 0`.

**New measurement** (`docs/PERFORMANCE.md` §2): ping 0.181 ms direct TCP vs 0.295 ms over the gateway
(0.113 ms bridge overhead), 400 pings after warmup, loopback, 2-vCPU container.

**Notes / limitations**

1. The renderer draws from **fixture data** (deterministic, generated by `mu-formats`) because real
   assets are blocked with Fase 2 — geometry, materials and textures from the real client will differ.
2. WebGL output and frame metrics are **not verified** here (no GPU/display): Level 5/6 stay
   `PENDENTE DE VALIDAÇÃO HUMANA`; the HUD exists precisely so the user can capture those numbers.
3. Animation is not wired yet (BMD actions are parsed but the mesh renders in bind pose) and movement
   reconciliation is one-way (prediction + server broadcast, no rollback).

## 2026-10-10 — cycle 4: `packages/mu-server` + `packages/mu-client` headless core (Level 3/4)

**Changes**

- New workspace `packages/mu-server` (`@mu-reengineer/server`): TCP connect server + game server,
  `World` with server-authoritative movement (bounds, step count, declared source position, scope
  queries), in-memory `AccountStore` with two development accounts, and a session state machine
  covering login → character list → selection → character information → map change → client ready →
  scope → walk/broadcast → ping → logout → disconnect cleanup. Unsupported packets are answered with a
  server message and counted, never ignored.
- New workspace `packages/mu-client` (`@mu-reengineer/client`): headless core — `ClientSession`
  (typed commands, buffered `waitFor`, event streams for scope/walked/server messages) and the
  ConnectServer client (`fetchServerList`, `fetchConnectionInfo`). No rendering dependency, so the
  session runs in tests.
- Root `build` now compiles workspaces in dependency order (protocol → formats → server → client →
  cli), which also fixes the client's type dependency on the server package.
- `mu-protocol`: nothing changed in this cycle.

**Tests executed**

| Command | Result |
| --- | --- |
| `npm run build` | clean (5 workspaces + tools) |
| `npm test` | protocol 35/35 · formats 22/22 · server 9/9 · client 6/6 · cli 8/8 — **80/80, 0 fail** |

Integration coverage (real sockets, real ciphers and counters, no mocks): connect-server server list
and connection info; wrong password and unknown account rejected; full login/selection/map-change/scope
flow; movement accepted and **rejected** (wrong source position) with the world unchanged on rejection;
`ObjectWalked` broadcast to the other character in scope and **not** echoed to the walker; ping echo;
disconnect removes the character from the world; a client without the XOR32 profile is dropped and the
failure is visible in the metrics.

**Manual end-to-end run (recorded)**

```
server list : [{"serverId":0,"loadPercentage":0}]
game server : {"ipAddress":"127.0.0.1","port":37505}
login       : 0
characters  : [ 'DarkKnight' ]
map changed : {"isMapChange":true,"mapNumber":0,"x":125,"y":125,"rotation":2}
scope       : [ 'DarkKnight' ]
world after 3 east steps: [{"name":"DarkKnight","x":128,"y":125}]
```

**Notes / limitations**

1. The 8-way movement encoding in `world.ts` is our documented interpretation; authority checks hold
   regardless, but the numbering must be validated against a real client (`docs/COMPATIBILITY.md` §6).
2. The game session requires the XOR32 profile on both ends (asserted by test); OpenMU HEAD only wires
   XOR32 for the chat server — `xor32: false` exists for experimentation.
3. No persistence, no scope-removal packet on disconnect yet, and the character stat block is minimal
   (enough for the slice, not for gameplay).

## 2026-10-10 — cycle 3: `tools/mu-cli` (inspection, export, scan, packet decoding)

**Changes**

- New workspace `tools/mu-cli` (`@mu-reengineer/cli`, bin `mu-cli`): commands `inspect`, `export-png`,
  `scan`, `gen-fixtures`, `decode-packet`, all with `--json`; every reader is imported from the
  workspace packages, so the tool cannot disagree with the tests.
- `packages/mu-protocol`: `SimpleModulusDecryptor.lastCounter` published (the counter the decryptor
  accepted) — needed by the packet diagnostic and asserted in the protocol suite.
- CI: the fixture step no longer uses `continue-on-error`; it now runs `gen-fixtures` **and** `scan`,
  so the disk round trip and the directory classifier are enforced.
- Docs updated: README status table, `project/CURRENT_STATE.md`, `project/NEXT_TASK.md`,
  `docs/ROADMAP.md` (Fase 1 → CONCLUÍDO COM EVIDÊNCIAS), `docs/BUILD_AND_RUN.md`, `docs/TEST_STRATEGY.md`.

**Tests executed**

| Command | Result |
| --- | --- |
| `npm run build` | clean (3 workspaces + tools) |
| `npm test` | protocol 35/35 · formats 22/22 · cli 8/8 — 0 fail |
| `node tools/mu-cli/dist/index.js gen-fixtures --out /tmp/fx` | 10 fixtures written, **10/10 re-parsed** |
| `node tools/mu-cli/dist/index.js scan /tmp/fx` | 10 files, 10 ok, formats classified, 0 unreadable |
| `node tools/mu-cli/dist/index.js inspect /tmp/fx/model_v15.bmd` | `bmd v15`, 4 vertices, 2 triangles, 3 bones, texture `Interface/test.tga` |
| `node tools/mu-cli/dist/index.js export-png /tmp/fx/diffuse.ozt /tmp/fx/diffuse.png` | PNG written (8×4 → 168 B); OZJ path extracts the embedded JPEG |
| `node tools/mu-cli/dist/index.js decode-packet <encrypted login>` | counter 0, username/password/tick/version/serial recovered |

**Notes / limitations**

1. (cycle 3) `inspect` prints ATT tile counts as `256x256 (header reports 255x255)`: the format stores 255 in the
   header while the attribute grid holds 256×256 tiles — both numbers are shown on purpose.
2. `scan` classifies by extension + signature; files with unknown extensions are only reported, never
   guessed. Unknown formats exit with code 2 so scripts can detect them.
3. The `decode-packet` counter comes from the decryptor, not from the plaintext: the decrypted layout is
   `[prefix, size, code, subCode, …]` — the counter byte is consumed by the cipher.

## 2026-10-10 — cycle 2: resource formats verified, benchmarks, continuity documentation

**Changes**

- `packages/mu-formats` completed as a tested package: `src/crypto/{file-cryptor,lea256,modulus-cryptor,legacy/{tea,rc5}}.ts`,
  `src/format/{bmd,texture,terrain}.ts`, `src/png.ts`, `src/testing/fixtures.ts`, `src/index.ts`,
  `src/test/formats.test.ts` (22 tests).
- DDS decoding fixed to reproduce DXT1 3-colour (transparent) mode, which required returning both
  RGB and alpha from the block decoder.
- LEA-256 fixture encryptor corrected to the true algebraic inverse of the decryption round
  (`roundDecrypt(inverseRound(state)) === state`); v15 fixture payloads are zero-padded to 16 bytes
  like real containers.
- Benchmarks added: `packages/mu-protocol/src/bench/protocol-bench.ts`,
  `packages/mu-formats/src/bench/formats-bench.ts` (root `npm run bench` now works).
- Raw protocol material extracted from the references committed to `docs/protocol/`
  (`cts.xml`, `packets_summary.txt`, `slice_packets.txt`).
- Continuity set written: `AGENTS.md`, `README.md`, `project/*.md`, `docs/*.md`.
- `.gitignore` fixed so `third_party/PINS.json` and `third_party/README.md` are committed while the
  reference checkouts stay ignored.

**Tests executed**

| Command | Result |
| --- | --- |
| `npm run build` | clean, all workspaces |
| `npm test` | `mu-protocol` 35/35 pass · `mu-formats` 22/22 pass · 0 fail |
| `npm run bench -w @mu-reengineer/protocol` | 12 benchmarks, see `docs/PERFORMANCE.md` |
| `npm run bench -w @mu-reengineer/formats` | 9 benchmarks, see `docs/PERFORMANCE.md` |

**Limitations recorded:** no real game asset was parsed (data unavailable); the LEA and old-variant
SimpleModulus paths are proven only round-trip; PNG encoding is the slowest export path.

**Fixes found by testing (kept as regression notes)**

1. DXT1 alpha mode: without the 3-colour branch, transparent textures came out opaque.
2. LEA fixture encryption: the first derivation rotated the state words and produced garbage that
   the reader rejected (`invalid mesh count: 15837`); the corrected inverse round makes v15 fixtures
   parse.
3. Benchmarks initially used mismatched SimpleModulus key pairs (`encryptorClient` with
   `decryptorClient`) which is *not* a valid pair — the client decrypts with the mirror of the
   **server** keys. Recorded here because it is an easy trap when writing new tests.

## 2026-10-10 — cycle 1: audit, monorepo skeleton, protocol core, first commit

- Fase 0 audit of the four reference repositories, licences and environment (`55530b0`).
- Monorepo skeleton (npm workspaces, `tsconfig.base.json`, `.gitignore`, CI workflow,
  `scripts/fetch-references.sh`, `third_party/PINS.json`).
- `packages/mu-protocol` implemented and verified: 35 tests, byte-exact replay of the four OpenMU
  SimpleModulus vectors (`C3 185→255`, `C4 3000→4128`), framing, XOR3/XOR32, connection pipeline and
  the vertical-slice packet codecs.
- Golden vectors committed with provenance: `tests/vectors/openmu_simplemodulus.json`.
