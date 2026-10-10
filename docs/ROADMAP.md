# ROADMAP — phases, objectives, dependencies, criteria, real state

States: `NÃO INICIADO` · `EM ANDAMENTO` · `CONCLUÍDO COM EVIDÊNCIAS` ·
`BLOQUEADO EXTERNAMENTE` · `FALHOU` · `NÃO APLICÁVEL COM JUSTIFICATIVA`.
A phase without executed evidence is never "done".

| Fase | Objective | State | Evidence / dependency |
| --- | --- | --- | --- |
| 0 | Initial audit (repos, licences, environment) | CONCLUÍDO COM EVIDÊNCIAS | audit notes in `project/CONTEXT.md`; pins in `third_party/PINS.json`; commit `55530b0` |
| 1 | Repository preparation (monorepo, CI, docs, continuity) | EM ANDAMENTO | monorepo + CI + docs exist; `mu-server`/`mu-client`/`mu-cli` skeletons pending |
| 2 | Season 20 data acquisition/inspection | BLOQUEADO EXTERNEMENTE | download host unreachable from the sandbox (curl `HTTP 000`); user must supply data |
| 3 | Build the reference client (`xulek/muonline`) | BLOQUEADO EXTERNAMENTE | needs .NET 10 SDK + Windows/MonoGame; no `dotnet` here |
| 4 | Resource tooling (BMD/OZ*/terrain readers, exporters) | EM ANDAMENTO | `mu-formats` 22/22 tests green; `tools/mu-cli` still to be written; real-data conformance blocked with Fase 2 |
| 5 | Optimised client architecture | EM ANDAMENTO | architecture + decisions documented (`docs/ARCHITECTURE.md`, `project/DECISIONS.md`); implementation starts with the headless core |
| 6 | Resource pipeline (decrypt → decode → cache → render-ready) | EM ANDAMENTO | ciphers/readers done and tested on fixtures; pipeline integration into the client pending |
| 7 | Renderer and 3D scene | NÃO INICIADO | requires Fase 6 + GPU validation (Level 6/7 human) |
| 8 | Characters and animations | NÃO INICIADO | `extractMeshGeometry` + euler→quaternion exist and are tested; scene/animation graph pending |
| 9 | Maps and environment | NÃO INICIADO | ATT/MAP/OBJ readers tested; terrain renderer pending |
| 10 | Network and server (client ⇄ server integration) | EM ANDAMENTO | `mu-protocol` 35/35 tests incl. golden vectors; `mu-server` + integration test = Priority 2 in `NEXT_TASK.md` |
| 11 | Game systems (characters, inventory, skills, NPCs, chat) | NÃO INICIADO | vertical slice defined by the packet set already implemented |
| 12 | Performance (measurement + optimisation) | EM ANDAMENTO | protocol/format benchmarks recorded in `docs/PERFORMANCE.md`; renderer metrics `PENDENTE DE VALIDAÇÃO HUMANA` |
| 13 | Validation and distribution | NÃO INICIADO | needs 5–12 plus licence/usage documentation final review |

## Dependencies

- Fase 2 (data) → 3 (reference client build), 6 (real-asset pipeline), 9 (maps), 11.
- Fase 10 (server) → 4 (end-to-end session), 11 (systems), 12 (network performance).
- Fase 7 (renderer) → 12 (frame-time metrics) → 13.

## Phase exit criteria (from the master command, §14.4)

Artifact exists and was inspected · relevant build/test really ran (or the impossibility is
documented) · results recorded reproducibly · no hidden critical failure · documentation and
`NEXT_TASK.md` reflect reality · next task selected.
