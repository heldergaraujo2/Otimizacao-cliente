# MU-REENGINEER

Authorised re-engineering and modernisation of an **MU Online** client, together with a working,
protocol-compatible server and the tooling needed to prove both.

- Master specification (binding): [`COMANDO_MESTRE_MU_REENGINEER.md`](COMANDO_MESTRE_MU_REENGINEER.md)
- How to continue the work: [`AGENTS.md`](AGENTS.md)
- Live status: [`project/CURRENT_STATE.md`](project/CURRENT_STATE.md) · next task:
  [`project/NEXT_TASK.md`](project/NEXT_TASK.md) · phases: [`docs/ROADMAP.md`](docs/ROADMAP.md)

## What exists today (2026-10-10)

| Component | State | Evidence |
| --- | --- | --- |
| `packages/mu-protocol` — MU wire protocol (framing, XOR3/XOR32, SimpleModulus, packet codecs) | CONCLUÍDO COM EVIDÊNCIAS | 35 automated tests green, byte-exact vector replay against OpenMU (MIT), benchmarks recorded |
| `packages/mu-formats` — resource formats (FileCryptor, ModulusCryptor, LEA-256, BMD, OZT/OZB/OZJ/DDS/TGA, ATT/MAP/OBJ, PNG export) | EM ANDAMENTO | 22 automated tests green over self-generated fixtures; real-game-data conformance still pending |
| `packages/mu-server` — headless protocol-compatible server | NÃO INICIADO | — |
| `packages/mu-client` — the modernised client | NÃO INICIADO | — |
| `tools/mu-cli` — inspection/export CLI | CONCLUÍDO COM EVIDÊNCIAS | 8 automated tests; `gen-fixtures` disk round-trip (10/10), `inspect`/`scan`/`export-png`/`decode-packet` verified manually |
| Continuous integration | CONCLUÍDO COM EVIDÊNCIAS (local equivalent) | `.github/workflows/ci.yml`: install → build → test → `mu-cli gen-fixtures` + `scan` on Node 22 |

Nothing in this repository redistributes game assets: proprietary data is read from the
contributor's own copy at runtime (see [`docs/ASSET_PIPELINE.md`](docs/ASSET_PIPELINE.md) and
[`docs/SECURITY_AND_LICENSES.md`](docs/SECURITY_AND_LICENSES.md)).

## Quick start

```bash
npm install          # restore the workspaces (Node >= 22)
npm run build        # compile every workspace
npm test             # run all automated tests
npm run bench        # throughput benchmarks (protocol + resource formats)
npm run cli -- gen-fixtures --out tests/fixtures   # write + re-parse every resource fixture
npm run cli -- scan "D:/MU-REENGINEER-DATA/Data"   # classify your own data directory
```

## Layout

```
packages/mu-protocol   wire protocol core (no game content, no I/O)
packages/mu-formats    resource readers/writers + format fixtures
packages/mu-server     headless server (login/character/play slice)
packages/mu-client     client logic + browser renderer
tools/mu-cli           inspection and export command line tool
tests/vectors          golden vectors with provenance
docs/                  architecture, roadmap, compatibility, licences, performance, tests
project/               continuity: context, current state, decisions, next task, changelog
third_party/PINS.json  pinned reference revisions (research only, never built)
```

## Licensing

Our code is MIT (see [`docs/SECURITY_AND_LICENSES.md`](docs/SECURITY_AND_LICENSES.md)). Reference
repositories keep their own licences (OpenMU: MIT, bmd-viewer: ISC, MuEmu: MIT, xulek/muonline: no
licence — read-only reference, never copied). MU Online game data and brands belong to Webzen; this
repository neither ships nor redistributes them.
