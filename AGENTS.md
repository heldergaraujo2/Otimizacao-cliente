# AGENTS.md — how to work in this repository

This file is the entry point for **any** agent or engineer (human or AI) who continues
MU-REENGINEER. Read it before touching anything.

## 1. What this project is

MU-REENGINEER is an authorised reverse-engineering / re-implementation effort: build a **modern,
optimised, visually faithful MU Online client** in our own code, integrated with a **real, working
server**, keeping compatibility verifiable through tests that actually run.

The binding specification is [`COMANDO_MESTRE_MU_REENGINEER.md`](COMANDO_MESTRE_MU_REENGINEER.md).
If anything in this file conflicts with it, the master command wins — and this file must be fixed.

## 2. Session start checklist (do this every time)

1. Read `AGENTS.md` (this file) and `README.md`.
2. Read `project/CONTEXT.md`, `project/CURRENT_STATE.md`, `project/DECISIONS.md`,
   `project/NEXT_TASK.md`, `project/CHANGELOG.md`.
3. Read `docs/ROADMAP.md` and whatever other `docs/*.md` the next task needs.
4. Inspect the real state: `git status`, `git log --oneline -10`, current branch, untracked files.
5. Confirm what is already finished (with evidence) and take the next executable task from
   `project/NEXT_TASK.md`. Never restart a finished phase without a written justification.
6. Work in cycles: **resume → select → purposeful research → implement → validate → fix → review
   the diff for secrets/proprietary/binary content → persist documentation → advance.**

## 3. Hard rules

- **Never claim work that did not happen.** No invented test results, no invented measurements, no
  "should work". If a build/test was not run, say so and why.
- **Evidence or it did not happen.** Record the exact command and its output summary in
  `project/CHANGELOG.md` / `project/CURRENT_STATE.md`.
- Use the unambiguous phase states from the master command: `NÃO INICIADO`, `EM ANDAMENTO`,
  `CONCLUÍDO COM EVIDÊNCIAS`, `BLOQUEADO EXTERNAMENTE`, `FALHOU`,
  `NÃO APLICÁVEL COM JUSTIFICATIVA`. Code that is written but not executed is **EM ANDAMENTO**,
  never "done".
- **No proprietary game content in Git.** No Webzen/MU data files, no extracted models/textures, no
  cracks, no client binaries. Game data lives on the contributor's disk (`MU-REENGINEER-DATA/`,
  git-ignored) and is read at runtime. Tests use self-generated fixtures
  (`packages/mu-formats/src/testing/fixtures.ts`).
- **No secrets.** Never commit tokens, passwords, keys, personal data, build outputs or caches.
  `.env*`, `assets-local/`, `MU-REENGINEER-DATA/`, `third_party/*` (except `PINS.json`), `dist/` are
  ignored on purpose.
- **Do not run unknown binaries/installers.** Assess origin and licences first
  (`docs/SECURITY_AND_LICENSES.md`).
- **Ask before irreversible actions** (publishing questionable content, destructive deletions,
  credential/permission changes, purchases). Routine, reversible technical decisions are taken
  autonomously **and documented** in `project/DECISIONS.md`.
- **Do not silently overwrite other agents' work.** Inspect the diff before editing; never force
  push.
- **Pin external code** to identifiable commits (`third_party/PINS.json`) and record how to fetch it
  (`scripts/fetch-references.sh`).

## 4. Repository conventions

| Item | Convention |
| --- | --- |
| Language | TypeScript (ES2022, `NodeNext`, `strict`) on Node ≥ 22; ESM only |
| Layout | npm workspaces: `packages/*`, `tools/*` |
| Build | `npm run build` at the root (per-workspace `tsc -p tsconfig.json`) |
| Tests | `npm test` → `node --test "dist/test/*.test.js"` per workspace |
| Benchmarks | `npm run bench` (never part of CI pass/fail; numbers go to `docs/PERFORMANCE.md`) |
| Commits | small, descriptive, `feat|fix|test|docs|bench|chore(scope): ...` |
| Branch | work on the session branch given by the platform; never force push |
| Docs | keep `project/NEXT_TASK.md` and `project/CURRENT_STATE.md` truthful at every commit |

## 5. Layout

```
packages/mu-protocol   wire protocol: framing, XOR3/XOR32, SimpleModulus, packet codecs
packages/mu-formats    resource formats: FileCryptor, ModulusCryptor, LEA-256, BMD, OZ*, ATT/MAP/OBJ, PNG export
packages/mu-server     headless server that speaks the protocol (integration target for the client)
packages/mu-client     the client itself (node-side game logic + browser renderer)
tools/mu-cli           command line inspection/export tool (BMD, textures, maps, packet decoding)
tests/vectors          golden vectors with provenance (OpenMU, MIT)
docs/                  architecture, roadmap, compatibility, licensing, performance, test strategy
project/               continuity files (context, state, decisions, next task, changelog)
```

## 6. Definition of done for a task

- The artifact exists and was inspected.
- The relevant build/test **actually ran**, or the impossibility is documented with the exact error.
- Results recorded (command + outcome) in `project/CHANGELOG.md`, state updated in
  `project/CURRENT_STATE.md`, next task in `project/NEXT_TASK.md`.
- Known failures/limits are stated, not hidden.
- If a step is externally blocked: write the missing item, who must act, the exact command they must
  run and the expected result into `project/NEXT_TASK.md`, then continue with independent work.

## 7. Quick commands

```bash
npm install                 # restore workspaces (node_modules is not committed)
npm run build               # compile every workspace
npm test                    # all automated tests (Level 1-3 evidence)
npm run bench               # throughput benchmarks
npm run cli -- --help       # tools/mu-cli (inspection, fixtures, exports)
bash scripts/fetch-references.sh /path/to/third_party   # pinned reference clones (research only)
```
