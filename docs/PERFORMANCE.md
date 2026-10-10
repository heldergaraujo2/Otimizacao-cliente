# PERFORMANCE — methodology, recorded results, pending measurements

## 1. Methodology

- Benchmarks are plain Node programs (`packages/*/src/bench/*.ts`), run with `npm run bench`.
- Each measurement: warm-up (min(iterations, 2000) runs, or 200 for the heavy ones), then a wall-clock
  loop around `process.hrtime.bigint()`. Reported: iterations, total time, ops/s, MiB/s.
- They are **not** part of CI pass/fail: they inform optimisation decisions and are re-run before/after
  each optimisation.
- Numbers depend on the machine; every recorded run states the runtime, CPU and date. Do not compare
  across different hosts without repeating the baseline.

## 2. Recorded run — 2026-10-10

Host: Linux x86_64 container, Intel Xeon @ 2.60 GHz, 2 vCPU, 3.9 GiB RAM, Node `v22.22.3`.

### Network round trip (client ⇄ server, 2026-10-10)

Measured with the real stack (server on loopback, `demo` session, 400 pings after a 20-ping warmup):

| Path | Median | Throughput | Notes |
| --- | --- | --- | --- |
| `connectTcpSession` → game server | 0.181 ms/ping | 5 511 ping/s | cipher + framing included |
| WebSocket → `tools/mu-gateway` → TCP | 0.295 ms/ping | 3 392 ping/s | the browser path |
| Gateway overhead | **0.113 ms/ping** | — | one extra hop, one buffer copy |

Method: sequential request/response (latency-bound, single connection), loopback, same 2-vCPU container
as above; `docs/TEST_STRATEGY.md` Level 6/7 still requires a real network for the honest numbers.

### Wire protocol (`npm run bench -w @mu-reengineer/protocol`)

| Benchmark | Iterations | Time | Throughput | Bandwidth |
| --- | --- | --- | --- | --- |
| SimpleModulus new: encrypt C3 max (23 blocks) | 20 000 | 365.6 ms | 54 710 op/s | 9.7 MiB/s |
| SimpleModulus new: decrypt C3 max (23 blocks) | 20 000 | 184.0 ms | 108 721 op/s | 26.4 MiB/s |
| SimpleModulus new: encrypt C4 4 KiB (512 blocks) | 1 500 | 240.5 ms | 6 238 op/s | 24.4 MiB/s |
| SimpleModulus new: decrypt C4 4 KiB | 1 500 | 150.9 ms | 9 940 op/s | 53.5 MiB/s |
| XOR32 encrypt 1 KiB | 20 000 | 93.0 ms | 215 159 op/s | 210.1 MiB/s |
| XOR32 decrypt 1 KiB | 20 000 | 75.9 ms | 263 478 op/s | 257.3 MiB/s |
| PacketAssembler: 128 packets | 1 000 | 15.9 ms | 62 803 op/s | 264.5 MiB/s |
| buildLoginLongPassword | 100 000 | 126.6 ms | 789 903 op/s | 44.4 MiB/s |
| parseLoginLongPassword | 100 000 | 110.6 ms | 904 048 op/s | 50.9 MiB/s |
| buildWalkRequest | 100 000 | 72.9 ms | 1 370 905 op/s | 13.1 MiB/s |
| parseWalkRequest | 100 000 | 22.1 ms | 4 534 217 op/s | 43.2 MiB/s |
| createPacket (C3 header) | 200 000 | 22.5 ms | 8 880 851 op/s | 542.0 MiB/s |

Interpretation: one full 4 KiB C4 payload costs ~160 µs to encrypt and ~100 µs to decrypt, i.e. the
cipher is **not** going to be the client's bottleneck (a 60 Hz MMORPG session exchanges a few KiB per
second). Packet building/parsing is 1–4 million ops/s. The cipher remains the dominant per-byte cost
inside the protocol, which is expected for a block cipher with modular arithmetic.

### Resource formats (`npm run bench -w @mu-reengineer/formats`)

| Benchmark | Iterations | Time | Throughput | Bandwidth |
| --- | --- | --- | --- | --- |
| FileCryptor: 192 KiB (decrypt) | 1 000 | 869.3 ms | 1 150 op/s | 215.7 MiB/s |
| FileCryptor: 192 KiB (encrypt direction) | 1 000 | 334.0 ms | 2 994 op/s | 561.4 MiB/s |
| OBJ fixture: FileCryptor + record parse | 5 000 | 14.8 ms | 337 000 op/s | 20.6 MiB/s |
| BMD v12: parse (FileCryptor + model) | 5 000 | 70.4 ms | 71 052 op/s | 41.2 MiB/s |
| BMD v15: parse (LEA-256 + model) | 5 000 | 219.0 ms | 22 829 op/s | 13.4 MiB/s |
| BMD v12: extractMeshGeometry | 5 000 | 54.0 ms | 92 601 op/s | 53.7 MiB/s |
| OZT 256×256: decode to RGBA | 1 000 | 313.2 ms | 3 193 op/s | 798.3 MiB/s |
| DDS DXT1 64×64: decode to RGBA | 2 000 | 283.5 ms | 7 055 op/s | 14.6 MiB/s |
| PNG encode 512×512 RGBA | 200 | 7 183.3 ms | 28 op/s | 27.8 MiB/s |

Interpretation and known weaknesses:

1. **PNG encoding is the slowest path** (~36 ms per 512×512 image, dominated by `zlib` at default
   level over unfiltered 1 MiB rows). If bulk export becomes painful, options: PNG filter type 1/2,
   `zlib` level 3–6 tuning, or reusing a raw/RGBA cache. It is an export/offline path, not a runtime
   bottleneck.
2. **LEA-256 decryption costs ~4× FileCryptor per byte** (v15 models pay it on every load). A cache
   keyed by path+size+mtime (planned with the client) removes repeated cost.
3. **Measurement variance is real** in this container: repeating the FileCryptor decrypt benchmark
   across runs gave 421 ms and 869 ms for identical work (≈2×). Treat single-digit differences as
   noise and re-run before/after any optimisation. Every future entry must record at least 3 runs
   (median reported).

## 3. Level 6 roteiro (pending — needs a GPU/real browser)

Run on a machine with a GPU, in this order, recording for each scenario: FPS average, observed
minimum, p50/p95/p99 frame time (ms), load time (ms), RSS/VRAM, CPU%, GPU%, and any console errors.

1. Empty scene (camera idle) — 60 s.
2. Single character idle / walking / animating.
3. 10–20 characters in scope (typical town).
4. Complex environment (full map with objects, water, effects).
5. Map change (loading transition) — measure load and first-frame time.
6. Initial load from cold cache.
7. Long session (10 min with movement and combat messages) — check for leaks/stutter.

## 4. Level 7 roteiro (pending — needs real hardware/network)

- Same as Level 6 on the target Windows machine, with the real game data directory.
- Network: measure round-trip latency and packet loss against a server on another machine; force
  disconnect (unplug/cable-down, firewall drop) and verify reconnect behaviour, counters and server
  authority (client must not be able to move arbitrarily).
- Record the exact OS, GPU driver, client build (commit) and data package version with the numbers.
