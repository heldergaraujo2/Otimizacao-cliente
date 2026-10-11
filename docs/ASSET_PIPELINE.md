# ASSET_PIPELINE — from user-owned game data to render-ready resources

## 0. Data policy (read first)

The repository **never** contains game data. The contributor points the tooling/client at a local
directory with their own legally obtained MU installation:

```bash
export MU_REENGINEER_DATA=/path/to/MU-REENGINEER-DATA    # Windows: D:\MU-REENGINEER-DATA
```

Everything below operates on that directory and writes exports next to the source (or to a chosen
output directory). Nothing is uploaded anywhere.

## 1. Containers and ciphers (implemented in `packages/mu-formats`)

| Layer | Files | What it does |
| --- | --- | --- |
| FileCryptor | `.map`, `.obj`, `.att`, BMD v12 | `dst = ((src ^ KEY[i&15]) − mapKey) & 0xFF`, `mapKey` chained from the plaintext, initial `0x5E` |
| BUX mask | `.bux`-protected payloads (terrain attributes) | XOR with `FC CF AB`, repeating |
| ModulusCryptor | newer `.att`/`.map` | 4-byte magic (`ATT\x01`, `MAP\x01`), algorithm ids in the header (`&7`: TEA, ThreeWay, CAST5, RC5, RC6, MARS, IDEA, GOST), product key `webzen#@!01…`, 1024-aligned stage 1 to recover key2, then stage 2 from offset 34 |
| LEA-256 ECB | BMD v15 (modern clients) | 16-byte blocks, key constant in `src/crypto/lea256.ts` |

Implemented ciphers: TEA and RC5 (plus FileCryptor/LEA/BUX). The remaining ModulusCryptor
algorithms throw `UnsupportedCipherError` naming the algorithm — no silent garbage.

## 2. Formats

| Resource | Reader | Notes |
| --- | --- | --- |
| BMD animation | `sampleBoneTransform`, `computeBoneWorldMatrices`, `skinMesh`, `summarizeActions` | key sampling with shortest-way rotation interpolation, hierarchy composition and CPU skinning; vertices are stored in bone space and bound with weight 1, so `boneWorldMatrix[vertex.node] * position` is exact — the same matrices drive the GPU skinner in the client |
| BMD models | `parseBmd`, `extractMeshGeometry`, `summarizeBmd`, `bmdEulerToQuaternion` | v0/v12/v15; 32-byte names, vertices 16 B, normals 20 B, UV 8 B, triangles 64 B (poly 3/4), texture path, actions (LE16 keys + lock flag), bone hierarchy (dummy bones skipped, per-action position/rotation, euler→quaternion) |
| Textures | `decodeOzt`, `decodeOzb`, `inspectOzj`, `decodeTga`, `decodeDds`, `detectTextureFormat` | OZT = 32-bit BGRA bottom-up; OZB = `BM6` 24-bit / `BM8` 8-bit + palette; OZJ exposes the embedded JPEG window; TGA types 2/10; DDS DXT1/3/5 + uncompressed |
| Terrain flags | `parseAtt`, `countFlag`, `TwFlags` | 256×256+4 header, byte or extended (LE16) attributes, BUX XOR applied |
| Terrain ground | `parseMap` | version, map number, three 65536-entry layers (texture indices + alpha blend) |
| Terrain objects | `parseObj` | version, map number, LE16 count, six record layouts by version (30/32/33/45/46/54 bytes), extra bytes preserved |
| Export | `encodePng` (`packages/mu-formats/src/png.ts`) | dependency-free RGBA8 PNG (node:zlib) |

## 3. Pipeline steps (target)

```
data dir ─► discover ─► decrypt container ─► parse ─► normalise ─► cache ─► GPU upload
                                                        │
                                                        └─► export (PNG / glTF / JSON report) via tools/mu-cli
```

1. **Discover:** walk `Data/` (models, `World1..WorldN`, interfaces) and classify by extension/magic.
2. **Decrypt:** choose the container by size/magic (ModulusCryptor magic → its algorithms; else
   FileCryptor); BMD takes the version byte from the header.
3. **Parse:** typed structures (no `any`), with explicit validation and descriptive failures.
4. **Normalise:** flatten meshes (`extractMeshGeometry`), flip V, single-bone weights for the first
   pass, keep textures as RGBA or JPEG.
5. **Cache:** deterministic cache keyed by `(path, size, mtime, format)` — planned with the client
   (`packages/mu-client`), not implemented yet.

## 4. Validation on real data (user-run, Fase 2 blocker)

Once the user has the data locally:

```bash
npm run build
MU_REENGINEER_DATA=D:/MU-REENGINEER-DATA node tools/mu-cli/dist/index.js inspect "D:/MU-REENGINEER-DATA/Data/Player.bmd"
MU_REENGINEER_DATA=D:/MU-REENGINEER-DATA node tools/mu-cli/dist/index.js export-png "D:/MU-REENGINEER-DATA/Data/World1/grass01.ozt" out/grass01.png
```

Expected: a structural summary (version, mesh/bone/action counts, texture paths) and a PNG that
matches the in-game texture. Any mismatch is a bug report with the file name, size and the exact
error message — that is how the format readers get their real-data conformance evidence.

## 5. Unknowns to resolve with real data

- Which ModulusCryptor algorithms occur in the target client's `.att`/`.map` files (only TEA/RC5
  implemented so far).
- Whether the target client uses BMD v15 everywhere or mixes v12/v15 (both implemented).
- Engine-specific conventions in `.obj` versions (record sizes are handled by version, extra bytes
  preserved for later interpretation).
