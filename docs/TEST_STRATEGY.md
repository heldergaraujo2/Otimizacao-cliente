# TEST_STRATEGY — the mandatory ladder and what has really been executed

Rule: run the deepest level the environment allows, record the evidence, and mark what could not run
as `PENDENTE DE VALIDAÇÃO HUMANA` — never as approved.

## Level 1 — static

| Check | Command | State |
| --- | --- | --- |
| Type checking / build | `npm run build` (strict, ES2022, NodeNext) | CONCLUÍDO COM EVIDÊNCIAS — clean for both packages |
| Dependency audit | `npm audit --omit=dev` / lockfile review | EM ANDAMENTO — no runtime dependencies in `mu-protocol`/`mu-formats`; re-run after adding workspaces |
| Secret/diff review before commit | manual `git diff` inspection per cycle | CONCLUÍDO COM EVIDÊNCIAS — no secrets, tokens or assets added |

## Level 2 — unit

| Suite | Command | Result |
| --- | --- | --- |
| Wire protocol | `npm test -w @mu-reengineer/protocol` | **35/35 pass** — framing (C1/C2/C3/C4), assembler edge cases, XOR3/XOR32, SimpleModulus vectors and round-trips, connection pipeline, packet builders/parsers |
| Resource formats | `npm test -w @mu-reengineer/formats` | **22/22 pass** — FileCryptor/BUX/LEA/ModulusCryptor, BMD v0/v12/v15, OZT/OZB/OZJ/TGA/DDS, ATT/MAP/OBJ, PNG, malformed-input rejections |
| Golden vectors | part of the protocol suite | byte-exact replay of 4 OpenMU-generated vectors (MIT), including `C3 185→255` and `C4 3000→4128` |
| CLI (`tools/mu-cli`) | `npm test -w @mu-reengineer/cli` | **8/8 pass** — disk round-trip of all 10 fixtures, inspection of every generated format, PNG export, directory scan, packet decoding (login credentials recovered through XOR3), and the built CLI spawned as a child process |

## Level 3 — local integration

Target: `mu-server` + a real socket client running the vertical slice (login → character list →
enter game → walk → disconnect), asserting packets and connection metrics.
**State: CONCLUÍDO COM EVIDÊNCIAS** — `packages/mu-client/src/test/integration.test.ts` starts a real
server (TCP listeners), spawns real client sessions and asserts: connect-server handshake, rejected
credentials, successful login, character list, character selection, map change, client-ready/scope,
server-authoritative movement (accepted **and** rejected), cross-client scope broadcast, ping echo and
disconnect cleanup (`npm test -w @mu-reengineer/client` → 6/6). A profile-mismatch test proves that a
client without XOR32 cannot authenticate (the server drops it and counts the failure).

Already covered at this level: the CLI spawns real processes, writes fixtures to disk and re-parses
them (`gen-fixtures`, 10/10), and classifies a directory (`scan`) — evidence recorded in
`project/CHANGELOG.md` cycle 3.

## Level 4 — end to end

Target: process-level run (server process + headless client process) covering startup, connection,
authentication, session flow, movement, disconnect/reconnect.
**State: EM ANDAMENTO** — the session flow, movement and disconnect are covered by the Level 3 suite
(real sockets, real processes inside the test runner). Still missing: a standalone server process (CLI
entry point), reconnect after an unexpected drop and a long-running session check.

## Level 5 — visual and resources

Target: representative scenes (terrain + objects + character), missing/corrupt file handling, animation
playback, visual regression when tooling allows.
**State: NÃO INICIADO** for rendering; the *resource* half is partially covered by the format suite
(fixture round-trips, malformed input). Real-asset rendering requires the user's data (Fase 2) —
`PENDENTE DE VALIDAÇÃO HUMANA`.

## Level 6 — performance

Delivered so far: reproducible benchmarks for protocol and resource formats
(`npm run bench`, numbers in `docs/PERFORMANCE.md`, including the runtime/CPU they came from).
Pending (no GPU): empty scene, one/many characters, effects, complex environment, map change, initial
load, long session; FPS average, observed minimum, p50/p95/p99 frame times, memory, CPU/GPU.
**State: PENDENTE DE VALIDAÇÃO HUMANA** (Level 6 roteiro in `docs/PERFORMANCE.md`).

## Level 7 — real environment

Real Windows machine, real MU data, real network (external latency, packet loss, reconnect).
**State: PENDENTE DE VALIDAÇÃO HUMANA** — roteiro in `docs/PERFORMANCE.md` §Level 7 and
`project/NEXT_TASK.md` (externally blocked table).

## Documented gaps (unverified behaviour, on purpose)

1. SimpleModulus `old` variant (32-byte blocks, 16 words): implemented, **no round-trip test** —
   needs a synthetic 48-value key set.
2. BMD v15 decryption: proven round-trip against our own inverse-round encryptor, not against a real
   encrypted asset.
3. OZJ: only the container is parsed; the JPEG itself is decoded by the host.
4. ModulusCryptor algorithms other than TEA/RC5: not implemented (throw by design).
5. Real-asset conformance for every reader: blocked by data availability.

Each gap above is also listed in `project/CURRENT_STATE.md` and, where a user action unblocks it, in
`project/NEXT_TASK.md`.
