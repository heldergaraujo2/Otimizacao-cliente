# ROADMAP — phases, objectives, dependencies, criteria, real state

States: `NÃO INICIADO` · `EM ANDAMENTO` · `CONCLUÍDO COM EVIDÊNCIAS` ·
`BLOQUEADO EXTERNAMENTE` · `FALHOU` · `NÃO APLICÁVEL COM JUSTIFICATIVA`.
A phase without executed evidence is never "done".

| Fase | Objective | State | Evidence / dependency |
| --- | --- | --- | --- |
| 0 | Initial audit (repos, licences, environment) | CONCLUÍDO COM EVIDÊNCIAS | audit notes in `project/CONTEXT.md`; pins in `third_party/PINS.json`; commit `55530b0` |
| 1 | Repository preparation (monorepo, CI, docs, continuity) | CONCLUÍDO COM EVIDÊNCIAS | workspaces `mu-protocol`, `mu-formats`, `mu-cli` build and test green; CI runs install → build → test → fixture round trip + scan; continuity docs complete |
| 2 | Season 20 data acquisition/inspection | BLOQUEADO EXTERNEMENTE | download host unreachable from the sandbox (curl `HTTP 000`); user must supply data |
| 3 | Build the reference client (`xulek/muonline`) | BLOQUEADO EXTERNAMENTE | needs .NET 10 SDK + Windows/MonoGame; no `dotnet` here |
| 4 | Resource tooling (BMD/OZ*/terrain readers, exporters) | EM ANDAMENTO | `mu-formats` 22/22 + `tools/mu-cli` 8/8 tests green, fixture disk round-trip 10/10; real-data conformance still blocked with Fase 2 |
| 5 | Optimised client architecture | EM ANDAMENTO | architecture + decisions documented; headless core implemented and integration-tested over TCP **and** over the browser transport (WebSocket → `tools/mu-gateway` → TCP); lazy resource loading, FPS/latency HUD, local movement prediction |
| 6 | Resource pipeline (decrypt → decode → cache → render-ready) | EM ANDAMENTO | ciphers/readers tested; **loader implemented** (case-insensitive resolution, cache keyed by path+size+mtime with invalidation test, close-candidate errors, traversal refusal) and exposed to the browser through the gateway `/assets/` route (byte-exactness + 404 hints tested); renderer consumes ATT/MAP/OBJ/BMD. Still open: texture binding from real files and animation playback |
| 7 | Renderer and 3D scene | EM ANDAMENTO | three.js renderer implemented (terrain mesh from ATT/MAP, objects from OBJ, character mesh from BMD geometry, camera follow, lighting/fog) and served as a live preview; **visual validation and frame metrics need a GPU** → `PENDENTE DE VALIDAÇÃO HUMANA` |
| 8 | Characters and animations | EM ANDAMENTO | BMD skeleton, key sampling (shortest-way rotation interpolation), hierarchy composition and CPU skinning implemented and tested (11 tests); the client renders skinned characters through three.js bones and plays clips. Still open: per-clip naming conventions (idle/walk/attack) and real-model validation |
| 9 | Maps and environment | EM ANDAMENTO | ATT/MAP/OBJ readers tested; terrain + objects are rendered from those readers (fixture data — real maps still blocked with Fase 2) |
| 10 | Network and server (client ⇄ server integration) | EM ANDAMENTO | `mu-protocol` 43/43 (incl. the shared movement model); `mu-server` 11/11 world rules + **7 real-socket integration tests** + **2 process-level tests** (standalone CLI, clean SIGTERM shutdown); view synchronisation is diff-based (add/remove in scope) and the client predicts + reconciles; wider packet coverage and reconnect still open |
| 11 | Game systems (characters, inventory, skills, NPCs, chat) | EM ANDAMENTO | monsters/NPCs exist as world objects and reach the client through `AddNpcsToScope` (C2 13), rendered in the preview; inventory/skills/chat still NÃO INICIADO |
| 12 | Performance (measurement + optimisation) | EM ANDAMENTO | protocol/format/network benchmarks recorded in `docs/PERFORMANCE.md` (ping 0.181 ms TCP / 0.295 ms via gateway); renderer frame metrics `PENDENTE DE VALIDAÇÃO HUMANA` |
| 13 | Validation and distribution | NÃO INICIADO | needs 5–12 plus licence/usage documentation final review |

## Dependencies

- Fase 2 (data) → 3 (reference client build), 6 (real-asset pipeline), 9 (maps), 11.
- Fase 10 (server) → 4 (end-to-end session), 11 (systems), 12 (network performance).
- Fase 7 (renderer) → 12 (frame-time metrics) → 13.

## Phase exit criteria (from the master command, §14.4)

Artifact exists and was inspected · relevant build/test really ran (or the impossibility is
documented) · results recorded reproducibly · no hidden critical failure · documentation and
`NEXT_TASK.md` reflect reality · next task selected.
