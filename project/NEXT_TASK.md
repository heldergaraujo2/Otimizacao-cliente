# NEXT_TASK — resume here

**Updated:** 2026-10-10 · **Branch:** session branch (`arena/ef58bc1d-otimizacao-cliente`)

> **Start here:** Priorities 1–3 are finished; cycles 6–10 added the resource loader + asset route,
> view synchronisation, a standalone server process, Level 4 process tests, the shared movement model
> and BMD animation/skinning. Next: **Priority 4** — texture binding for real files, monster/NPC and
> item packets, and the human validation of Levels 5–7 (all listed below).

## Priority 1 — `tools/mu-cli` — CONCLUÍDO COM EVIDÊNCIAS (2026-10-10)

Delivered: `inspect`, `export-png`, `scan`, `gen-fixtures`, `decode-packet` (`tools/mu-cli`), 8/8 tests,
`gen-fixtures` disk round-trip 10/10, `scan` classification, `decode-packet` recovering credentials.
CI now runs the fixture round trip and the scan **without** `continue-on-error`.
(`packages/mu-protocol` gained `SimpleModulusDecryptor.lastCounter` for diagnostics.)

## Priority 1b (was Priority 1) — historical task definition

**Why now:** CI already calls `node tools/mu-cli/dist/index.js gen-fixtures --out tests/fixtures`
(`continue-on-error`); the tool does not exist. It is also the interface the user needs to validate
real MU data locally, and the fastest way to expose reading bugs.

**Pre-requisites:** `packages/mu-formats` (done), `packages/mu-protocol` (done), `npm install` at the
root.

**Files:** `tools/mu-cli/{package.json,tsconfig.json,src/index.ts,src/commands/*.ts}`.

**Steps**

1. CLI skeleton with subcommands: `inspect <file>`, `export-png <file> <out>`, `bmd-info <file>`,
   `terrain-info <file>`, `gen-fixtures --out <dir>`, `decode-packet <hex>`, `--help`.
2. `gen-fixtures` writes the deterministic fixtures built by `testing/fixtures.ts`
   (`bmd12.bmd`, `bmd15.bmd`, `ozt.ozt`, `ozb.ozb`, `ozj.ozj`, `att.att`, `map.map`, `obj.obj`,
   `diffuse.tga`, `dxt1.dds`) so they can be re-parsed as a self-check.
3. `inspect` sniffs the format and prints a summary; `--json` for machine consumption.

**Completion criteria:** `npm run build` clean; `node tools/mu-cli/dist/index.js gen-fixtures` writes
all fixtures and re-parses them without error; `node --test` for the CLI passes; the CI step is no
longer a stub.

**Validation commands**

```bash
npm install && npm run build
node tools/mu-cli/dist/index.js --help
node tools/mu-cli/dist/index.js gen-fixtures --out tests/fixtures
node tools/mu-cli/dist/index.js inspect tests/fixtures/bmd15.bmd
```

## Priority 2 — `packages/mu-server` (login + game slice) and Level 3/4 integration test

**Why:** the client cannot be called "integrated with a working server" without a server that really
speaks the protocol. This is the largest remaining unblocked deliverable.

**Steps**

1. TCP listener; per-connection `MuConnection` in the client role mirrored to the server role
   (SimpleModulus server keys + XOR3 on login).
2. Implement the vertical slice: `F4 06` server list → `F4 03` connection info (ConnectServer),
   `F1 01` login → `F1 01` response → `F1 00` GameServerEntered, `F3 00` character list → `F3 03`
   character information → `F3 12` client ready, `1C 0F` map changed, `12` add characters to scope,
   `D4` walk → `D4` object walked, `0E 00` ping, `0D` server message.
3. In-memory persistence for accounts/characters (JSON file optionally), server-authoritative
   movement validation.
4. Integration test (`packages/mu-server/src/test/*.test.ts`): start the server on port 0, connect a
   real `net.Socket` client using `mu-protocol`, run login → select character → enter game → walk →
   disconnect, assert every parsed response and the server's metrics; assert the counter/cipher
   sequence.

**Completion criteria:** integration test green (`node --test`), Level 3 and Level 4 evidence
recorded in `docs/TEST_STRATEGY.md` + `project/CHANGELOG.md`.

**STATUS: CONCLUÍDO COM EVIDÊNCIAS (2026-10-10)** — connect server, session state machine, world
(authoritative movement), scope broadcast, ping, logout/disconnect cleanup, XOR32 profile requirement;
`npm test` → server 9/9 world rules + client 6/6 real-socket integration tests; manual session recorded
in `project/CHANGELOG.md` cycle 4.

## Priority 3 — `packages/mu-client` (browser renderer + resource pipeline)

The headless core is done (session + connect client, integration-tested). Remaining work:

**Steps**

1. Resource layer: loader mapping a data directory (`MU_REENGINEER_DATA`) onto `mu-formats` calls,
   with a deterministic cache keyed by path+size+mtime (removes the repeated LEA cost measured in
   `docs/PERFORMANCE.md`), and clear errors for missing/corrupt files.
2. Browser renderer (three.js + Vite) driven only by `ClientSession` state: terrain from
   `.att`/`.map`/`.obj`, character from `.bmd` + `extractMeshGeometry` + animation clips, camera,
   minimal HUD.
3. Serve a live preview (`vite --host 0.0.0.0`) and document that Levels 5–7 remain
   `PENDENTE DE VALIDAÇÃO HUMANA` from this environment.

## Priority 3 — browser renderer + gateway — CONCLUÍDO COM EVIDÊNCIAS (2026-10-10)

`packages/mu-client/src/browser/` (three.js renderer + page + HUD) and `tools/mu-gateway` (WebSocket ⇄
TCP bridge). Live preview served (Vite `0.0.0.0:5173`, gateway `0.0.0.0:7788`), a real session driven
through the WebSocket path, 3/3 gateway tests, measured bridge overhead 0.113 ms/ping. Visual/frame
validation remains human-only (no GPU here).

## Priority 4 — follow-ups (current)

- Server: scope-removal packet when a character disconnects or leaves the box; reconnect handling.
- Server: standalone process entry point with CLI flags (the gateway already starts it in-process).
- Compatibility: validate the walk direction numbering and the XOR32 profile against a real client
  (needs a packet capture from the user).
- Client: movement prediction/reconciliation so the local player does not depend on server echoes.
- Client: bind decoded textures (OZT/OZB/DDS/TGA — the loader already decodes them) to the terrain
  material; today the palette derives from tile attributes and texture indices even for real files.
- Client: confirm the action-index convention (idle/walk/attack) against a real model, and add item/
  monster packets so the scene is not just players.
- Server: `RemoveCharactersFromScope` (C2 13) when a character disconnects or leaves the scope box.
- Client: draw distance / instancing once real maps are available; HUD already exposes the metrics.

## Priority 5 — what only the user can validate (do not claim these)

| Level | Needs | Roteiro |
| --- | --- | --- |
| 5 — visual | a GPU browser; real assets for true fidelity | open the preview URL, log in, compare the scene with a real client screenshot |
| 6 — performance | GPU + repeated runs | `docs/PERFORMANCE.md` §3 (frame times p50/p95/p99, memory, CPU/GPU) |
| 7 — real hardware/network | second machine, real latency | `docs/PERFORMANCE.md` §4 |
| Fase 2/6 conformance | MU Red S20 v1.20.61 data | `MU_REENGINEER_DATA=… npm run cli -- inspect <file>` |

## Externally blocked (needs the user)

| Item | Exact action needed | Expected result |
| --- | --- | --- |
| MU Red S20 v1.20.61 data | download on a machine with internet, then `MU_REENGINEER_DATA=D:\MU-REENGINEER-DATA npm run cli -- inspect <file>` | first real-asset parse report; enables Fase 2/6 conformance |
| `.NET` builds of the reference projects | run `dotnet build` locally and report errors, if the reference client build is still wanted | Fase 3 evidence |
| Visual/FPS validation | run the client build on a machine with GPU and record p50/p95/p99 frame times | Level 6/7 evidence, Fase 12 |

## Do not redo

Fase 0 audit, `packages/mu-protocol` (35 tests), `packages/mu-formats` source+tests (22 tests),
`tools/mu-cli` (8 tests, incl. the disk round-trip + scan + packet decode), the CI pipeline steps, the
continuity documentation and the `docs/protocol/` dumps. Extract the *why* from them and extend them —
do not rebuild them.
