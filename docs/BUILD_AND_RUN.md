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

## 6. Running the client / server (once implemented)

Target interface (documented here so the docs stay ahead of the code, and marked EM ANDAMENTO until it
actually runs):

```bash
# server (headless, TCP)
npm run start -w @mu-reengineer/server -- --port 44405 --game-port 55901

# client, headless session driver (Level 3/4 evidence)
npm run start -w @mu-reengineer/client -- --host 127.0.0.1 --port 55901 --user demo --password demo

# client, browser renderer (live preview; requires a GPU for meaningful frame rates)
npm run dev -w @mu-reengineer/client -- --host 0.0.0.0
```

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
