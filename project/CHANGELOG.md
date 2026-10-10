# CHANGELOG

Concrete changes with the evidence that proves them. Newest first.

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
