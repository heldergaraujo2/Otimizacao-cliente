# NEXT_TASK — resume here

**Updated:** 2026-10-10 (after cycle 11) · **Branch:** `arena/ef58bc1d-otimizacao-cliente` (session branch)
· **Central repo:** `https://github.com/heldergaraujo2/Otimizacao-cliente`

> **Start here:** cycles 1–11 are committed and pushed; `npm test` → **119 tests, 0 failures**
> (protocol 43, formats 33, client 16, server 11, cli 9, gateway 7) and CI is green for the latest
> commits. The vertical slice now covers login → characters → map → scope for **players and monsters**
> → authoritative movement → ping → logout, with a browser client that renders terrain, animated
> skinned characters and monsters.
>
> **Next (cycle 12), in the order that pays off most:**
> 1. **Monsters that move** — give NPCs a server-side wander/patrol step and broadcast it in the
>    existing `ObjectWalked` (C1 11, id-based, already implemented); teach the renderer to interpolate
>    NPC movement. This makes the world alive and needs no new packet layout.
> 2. **A minimal damage/kill flow** — `ObjectGotKilled` (C1 17: `KilledId` BE16, `SkillId` BE16,
>    `KillerId` BE16, wire size 9) plus a server-side hit/HP model, so monsters can die and respawn.
> 3. **Texture binding for real files** — bind decoded OZT/OZB/DDS/TGA to the terrain material (the
>    loader already decodes them; today the palette only uses tile attributes and texture indices).
> 4. **Reconnect handling** — `F1 02` logout already exists; add a client-side resync/re-enter path and
>    the server-side cleanup that keeps a dropped session's character out of the world.
> 5. **Human validation (Priority 5)** — Levels 5–7 remain `PENDENTE DE VALIDAÇÃO HUMANA`; the roteiro
>    is in the table below. Never claim these from this environment.

## Delivered and closed (do not redo)

| Priority | Deliverable | Evidence |
| --- | --- | --- |
| 1 | `tools/mu-cli`: `inspect`, `export-png`, `scan`, `gen-fixtures`, `decode-packet`, `export-obj` | 9/9 tests; fixture disk round-trip 10/10; `export-obj` rest 357 B / skinned 497 B (cycle 10) |
| 2 | `packages/mu-server`: connect server, login, character list/select, map change, scope, authoritative movement, ping, logout | 11/11 world tests + real-socket integration suite (cycle 4, extended in 6–11) |
| 3 | `packages/mu-client`: headless core, resource loader, browser renderer, gateway, live preview | 16/16 client tests (8 integration + 6 loader + 2 process), gateway 7/7, WebSocket session verified |
| 4 | Diff-based view synchronisation, `MapObjectOutOfScope`, standalone server CLI, Level 4 process tests, shared movement model, prediction/reconciliation | cycle 9 (commit `ff83546`), 103/103 at the time |
| 5 | BMD animation + skinning, `export-obj`, animated skinned client renderer | cycle 10 (commit `2fc5dfb`), 115/115 |
| 6 | Monsters/NPCs as world objects + `AddNpcsToScope` (C2 13) + client/renderer support | cycle 11, 119/119 |

## Priority 4 — follow-ups (current)

- Client: bind decoded textures (OZT/OZB/DDS/TGA — the loader already decodes them) to the terrain
  material; today the palette derives from tile attributes and texture indices even for real files.
- Client: confirm the action-index convention (idle/walk/attack) against a real model (needs Fase 2
  data) and keep the clips driven by the session state.
- Server: monster behaviour (wander/patrol, respawn) and a damage/kill flow — see cycle-12 steps 1–2.
- Server: reconnect handling that keeps a dropped session's character out of the world and lets the
  client resync instead of restarting.
- Compatibility: validate the walk direction numbering and the XOR32 profile against a real client
  (needs a packet capture from the user). `WalkRequest`/`ObjectWalked`/`AddNpcsToScope` nibble orders are
  already verified against the generated reference C# at `89c8f07`.
- Client: draw distance / instancing once real maps are available; the HUD already exposes the metrics.

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

## Environment reminders

```bash
npm install && npm run build          # required after a fresh snapshot (node_modules/dist are ignored)
npm test                              # 119 tests expected
node tools/mu-gateway/dist/index.js --ws-port 7788 --server --data-dir assets-local/demo-data
npm run dev -w @mu-reengineer/client  # Vite on 0.0.0.0:5173, proxies /ws, /assets, /health
```

Game data lives in `assets-local/demo-data/` (git-ignored, regenerated by
`node scripts/make-demo-data.mjs`); never commit real client assets.

## Do not redo

Fase 0 audit, `packages/mu-protocol` framing/ciphers/packet codecs, `packages/mu-formats` readers and
tests, `tools/mu-cli` commands, the CI pipeline steps, the continuity documentation and the
`docs/protocol/` dumps. Extract the *why* from them and extend them — do not rebuild them.
