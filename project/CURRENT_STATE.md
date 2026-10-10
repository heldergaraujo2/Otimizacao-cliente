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

### `packages/mu-server` — NÃO INICIADO

### `packages/mu-client` — NÃO INICIADO

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
