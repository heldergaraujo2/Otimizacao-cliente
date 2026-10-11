# NEXT_TASK — resume here

**Updated:** 2026-10-10 (after cycle 12) · **Branch:** `arena/ef58bc1d-otimizacao-cliente` (session branch)
· **Central repo:** `https://github.com/heldergaraujo2/Otimizacao-cliente`

> **Start here:** cycles 1–12 are committed and pushed (cycle 12 = monsters that wander); the last
> full run was `npm test` → **126 tests, 0 failures** (protocol 43, formats 33, client 17, server 17,
> cli 9, gateway 7). The vertical slice covers login → characters → map → scope for **players and
> monsters** → authoritative movement and monster wander → ping → logout, with a browser client that
> renders terrain, animated skinned characters and monsters.
>
> **Next (cycle 13), in the order that pays off most:**
> 1. **A minimal damage/kill flow** — `ObjectGotKilled` (C1 17: `KilledId` BE16, `SkillId` BE16,
>    `KillerId` BE16, wire size 9) plus a server-side hit/HP model and respawn, so a monster can die and
>    the client sees it leave the world.
> 2. **Walkability-aware wander** — consult the ATT tile flags so monsters do not walk over water/walls,
>    and give them a home radius so they stay near the spawn.
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
| 7 | Monsters that wander: `npc.ts` wander step through `World.move`, home radius, `tickNpcs()` broadcast, `--npc-tick`, client view tracking | cycle 12, 126/126, tick measured 0.082 ms for 200 monsters |

## Priority 4 — follow-ups (current)

- Client: bind decoded textures (OZT/OZB/DDS/TGA — the loader already decodes them) to the terrain
  material; today the palette derives from tile attributes and texture indices even for real files.
- Client: confirm the action-index convention (idle/walk/attack) against a real model (needs Fase 2
  data) and keep the clips driven by the session state.
- Server: monster behaviour beyond the current wander (pathing/avoidance, home radius, respawn) and a
  damage/kill flow — see the cycle-13 steps above.
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

## Accessing the live preview (verified 2026-10-11)

```bash
node scripts/dev-preview.mjs --rebuild     # from scratch: npm ci + build + demo data + both processes
node scripts/dev-preview.mjs               # already built: just start both and print the URLs
```

Background processes do **not** survive snapshots — restart both. The page is then reachable at
`https://5173-<E2B_SANDBOX_ID>.e2b.app` (`printenv E2B_SANDBOX_ID`); the client connects to `/ws`
relative to the page, so no localhost address is ever involved. Verified with the public `Host`/`Origin`
headers against port 5173: page/modules/assets 200, WebSocket upgrade 101, full session including
monsters. The sandbox itself cannot reach that hostname (egress allowlist), so the platform edge is the
only unverifiable hop from here.

## Environment reminders

```bash
npm install && npm run build          # required after a fresh snapshot (node_modules/dist are ignored)
npm test                              # 126 tests expected
node tools/mu-gateway/dist/index.js --ws-port 7788 --server --data-dir assets-local/demo-data
npm run dev -w @mu-reengineer/client  # Vite on 0.0.0.0:5173, proxies /ws, /assets, /health
```

Game data lives in `assets-local/demo-data/` (git-ignored, regenerated by
`node scripts/make-demo-data.mjs`); never commit real client assets.

## Do not redo

Fase 0 audit, `packages/mu-protocol` framing/ciphers/packet codecs, `packages/mu-formats` readers and
tests, `tools/mu-cli` commands, the CI pipeline steps, the continuity documentation and the
`docs/protocol/` dumps. Extract the *why* from them and extend them — do not rebuild them.
