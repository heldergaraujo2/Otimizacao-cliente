# CHANGELOG

Concrete changes with the evidence that proves them. Newest first.

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
