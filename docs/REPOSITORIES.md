# REPOSITORIES — references, licences, pinned revisions, usage policy

Pins are committed in `third_party/PINS.json`; `scripts/fetch-references.sh <dir>` clones them
(`git clone --filter=blob:none` + detached checkout of the pinned commit). They are **research
material**: never built, never vendored, never shipped.

| Repository | Licence | Pinned commit | How we use it |
| --- | --- | --- | --- |
| [MUnique/OpenMU](https://github.com/MUnique/OpenMU) | MIT | `89c8f072747f6b83cffc56b102b77524c7e7d0a8` | Protocol source of truth (framing, XOR3/XOR32, SimpleModulus, packet definitions, `cts.xml`); candidate/actual game server |
| [xulek/muonline-bmd-viewer](https://github.com/xulek/muonline-bmd-viewer) | ISC | `3f11bf89f3702261174d8efa1436d56a15c7d97a` | Resource-format reference (BMD/OZ*/ATT/MAP/OBJ readers, crypto variants, LEA-256 port) |
| [xulek/muonline](https://github.com/xulek/muonline) | **no licence** | `d92f7904f1f0869b41b03c963cbfae498cbbc880` | Architecture audit only (C#/.NET 10 + MonoGame, Season 6 client 1.04d, consumes `MUnique.OpenMU.Network`) |
| [Yomalex/MuEmu](https://github.com/Yomalex/MuEmu) | MIT | `6b1e8af3e90155ca6fd1d003b9dae5c978f24186` | Alternative server for protocol/feature comparison (dated 2018, .NET Core 3.1 EOL, six binary blobs) |

## What was learned from each (and what was *not* copied)

- **OpenMU** gave the authoritative byte layout of SimpleModulus (`WriteResultToTarget`, the
  `0x3D`/`0xF8` constants, the counter rule), the packet header rules, the login/character packet
  offsets and the reference key pairs. Our implementation is independent but is *proven* against
  vectors generated from OpenMU and committed as `tests/vectors/openmu_simplemodulus.json`.
- **bmd-viewer** documented the resource containers: FileCryptor (`dst = ((src ^ KEY[i&15]) - mapKey) & 0xFF`),
  the BUX mask, the ModulusCryptor stage structure, the BMD v12/v15 header handling and the LEA-256
  variant used by v15 models. ISC permits reuse with attribution; the implementation here is a
  rewrite with our own tests, and the LEA key constant is kept with a comment naming its origin.
- **xulek/muonline** confirmed the client's wire contract (OpenMU NuGet ⇒ OpenMU protocol) and the
  Season 6 client fingerprint (`1.04d`, serial `0123456789ABCDEF`, ConnectServer port 44405). No code
  or asset was copied: the repository has no licence.
- **MuEmu** was inspected for comparison only; it is not part of the build.

## Policy

1. Nothing from `third_party/` is imported by the build; the code in `packages/*` stands alone.
2. Any code adapted from an ISC/MIT reference keeps an attribution comment at the top of the file and
   a test that proves the behaviour.
3. Golden vectors record their origin commit and licence in the file itself.
4. Proprietary game assets and client binaries: never redistributed, never committed
   (`docs/SECURITY_AND_LICENSES.md`).
