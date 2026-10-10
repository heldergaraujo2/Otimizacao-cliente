# CONTEXT — objective, architecture, decisions, repositories, constraints

## 1. Objective

Build a **modern, optimised, visually faithful MU Online client** from an authorised
reverse-engineering effort, integrated with a **working server**, with compatibility and performance
proven by tests that can actually run in the environment. Full wording: `COMANDO_MESTRE_...md` §1.

## 2. Reference material (audited in Fase 0)

| Reference | Role | Licence | Pinned revision |
| --- | --- | --- | --- |
| [`MUnique/OpenMU`](https://github.com/MUnique/OpenMU) | Wire-protocol source of truth; candidate server | MIT | `89c8f072747f6b83cffc56b102b77524c7e7d0a8` |
| [`xulek/muonline-bmd-viewer`](https://github.com/xulek/muonline-bmd-viewer) | Resource-format reference (BMD, OZ*, ATT/MAP/OBJ, crypto variants) | ISC | `3f11bf89f3702261174d8efa1436d56a15c7d97a` |
| [`xulek/muonline`](https://github.com/xulek/muonline) | Client architecture audit (C#/.NET 10 + MonoGame, S6 client 1.04d) | **none** — read-only | `d92f7904f1f0869b41b03c963cbfae498cbbc880` |
| [`Yomalex/MuEmu`](https://github.com/Yomalex/MuEmu) | Alternative server for comparison | MIT | `6b1e8af3e90155ca6fd1d003b9dae5c978f24186` |

`xulek/muonline` has **no licence** ⇒ we read it to understand architecture, we never copy code or
assets. Its `Client.Main/Networking` consumes the `MUnique.OpenMU.Network` NuGet package, which
confirms that OpenMU's protocol definitions are the integration contract for our client.

## 3. Architecture (target)

```
┌────────────────────────┐        MU wire protocol        ┌────────────────────────┐
│ packages/mu-client     │  C1/C3/C2/C4 framing           │ packages/mu-server     │
│  node-side game logic  │  XOR3 · XOR32 · SimpleModulus  │  login (CS) + game (GS)│
│  + browser renderer    │◄──────────────────────────────►│  scope, movement, chat │
└──────────┬─────────────┘                                └────────────────────────┘
           │ reads                                        shares packages/mu-protocol
           ▼
┌────────────────────────┐        ┌────────────────────────┐
│ packages/mu-formats    │        │ tools/mu-cli           │
│ BMD/OZ*/ATT/MAP/OBJ    │◄───────│ inspect · export PNG/glTF│
│ ciphers + fixture gen  │        │ packet decode · fixtures │
└────────────────────────┘        └────────────────────────┘
```

Design rules:

- `mu-protocol` and `mu-formats` are **pure** (no I/O, no globals, no proprietary data).
- One parsing implementation per format, reused by tests, CLI and client — no "test-only" readers.
- Fixture builders implement the *writing/container* side of each format so reader tests are real
  round-trips rather than self-confirming snapshots.
- The client keeps rendering/plataform concerns (WebGL/three.js) behind an interface so the same game
  logic can be driven headlessly in tests (Level 3/4 evidence).

## 4. Constraints of the execution environment (measured)

- Node `v22.22.3`, npm `10.9.8`, python3 available; **2 vCPU / 3.9 GiB**, Intel Xeon @ 2.60 GHz.
- **No .NET SDK** (`dotnet.microsoft.com` unreachable, no `dotnet` binary) ⇒ reference C# projects
  (`xulek/muonline`, OpenMU, MuEmu) can only be *read*, never built here.
- **No GPU / no `DISPLAY`** ⇒ browser rendering and FPS measurement cannot be validated here
  (Level 6/7 → `PENDENTE DE VALIDAÇÃO HUMANA`).
- Outbound network limited to GitHub/npm/PyPI ⇒ external game-data downloads are blocked; the user
  must supply MU Red S20 data locally.
- Session-memory and `/tmp` are ephemeral ⇒ anything that matters is committed to the repository.

## 5. Data policy

Proprietary MU data (models, textures, maps, `data/*.pak` contents, client binaries) stays on the
contributor's disk (suggested `D:\MU-REENGINEER-DATA\`, git-ignored). The repository contains only
code, generated fixtures and documentation.
