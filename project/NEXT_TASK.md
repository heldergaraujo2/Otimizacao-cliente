# NEXT_TASK — resume here

**Updated:** 2026-10-10 · **Branch:** session branch (`arena/ef58bc1d-otimizacao-cliente`)

## Priority 1 — `tools/mu-cli` + resource-fixture self-check (unblocks CI step)

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

## Priority 3 — `packages/mu-client` (headless core + browser renderer)

**Steps**

1. Headless core: session state machine reusing `MuConnection`, resource loader over `mu-formats`
   with a `MU_REENGINEER_DATA` root, character/scope model, movement prediction + reconciliation.
2. Browser renderer (three.js, Vite) consuming the core: terrain (`.att`/`.map`/`.obj`), character
   (`.bmd` + animations), camera, minimal HUD.
3. Serve a live preview (`vite --host 0.0.0.0`) and document that Levels 5–7 are
   `PENDENTE DE VALIDAÇÃO HUMANA` from this environment.

## Externally blocked (needs the user)

| Item | Exact action needed | Expected result |
| --- | --- | --- |
| MU Red S20 v1.20.61 data | download on a machine with internet, then `MU_REENGINEER_DATA=D:\MU-REENGINEER-DATA npm run cli -- inspect <file>` | first real-asset parse report; enables Fase 2/6 conformance |
| `.NET` builds of the reference projects | run `dotnet build` locally and report errors, if the reference client build is still wanted | Fase 3 evidence |
| Visual/FPS validation | run the client build on a machine with GPU and record p50/p95/p99 frame times | Level 6/7 evidence, Fase 12 |

## Do not redo

Fase 0 audit, `packages/mu-protocol` (35 tests), `packages/mu-formats` source+tests (22 tests),
CI skeleton, `docs/protocol/` dumps. Only extend them.
