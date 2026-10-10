# COMPATIBILITY — protocol, client versions, and what is really interoperable today

## 1. Target and reference

| Item | Value | Source |
| --- | --- | --- |
| Reference client architecture | Season 6 client, version `1.04d`, serial `0123456789ABCDEF`, ConnectServer port **44405** | audit of `xulek/muonline` (pinned) |
| Wire protocol authority | OpenMU `89c8f07` — `<src/Network/…>`, `docs/protocol/cts.xml` | OpenMU (MIT) |
| Newer target | MU Red Season 20 **v1.20.61** — data availability/licence/security still to be audited with the user's data | master command §2 |
| Alternative server | MuEmu (2018, .NET Core 3.1 EOL) — comparison only | pinned |

## 2. Framing and ciphers implemented

| Feature | Rule | Test evidence |
| --- | --- | --- |
| Headers | `C1`/`C3` → 2 bytes (type, length); `C2`/`C4` → 3 bytes (type, big-endian length); anything else invalid | protocol suite |
| Encryption scope | payloads below `0xC3` bypass the cipher; `C3`/`C4` payloads are SimpleModulus blocks and must be a multiple of 11 (new variant) | protocol suite |
| Counter | first plaintext byte of each encrypted packet = counter; incremented per packet, wrapping 0–255; wrong value ⇒ `InvalidPacketCounterException` | protocol suite |
| XOR3 | key `FC CF AB`, applied to credentials before UTF-8 | protocol suite |
| XOR32 | 32-byte key, `p[i] ^= p[i-1] ^ key[i%32]` from `headerSize+1`; OpenMU HEAD wires it only for the ChatServer, the reference client applies it client→server — implemented but **off by default** | protocol suite |
| SimpleModulus | `new`: 4 words, 8→11 bytes, counter, `BlockSizeXorKey=0x3D`, `BlockCheckSumXorKey=0xF8`; `old`: 16 words, 32→38 bytes, no counter | golden vectors (new), round-trip (new) — **old variant unverified** |
| Key pairing | the interoperating pair is `encryptorServer` ↔ `decryptorClient` (and `encryptorClient` ↔ `decryptorServer`) | golden vectors |

## 3. Packet coverage of the vertical slice

Builders **and** parsers exist and are tested for:

| Area | Packets |
| --- | --- |
| ConnectServer | `F4 06` server list (request/response), `F4 03` connection info (request/response) |
| Login | `F1 01` login (long password form) + response, `F1 00` GameServerEntered, `F1 02` logout |
| Character | `F3 00` character list (34-byte entries), `F3 03` CharacterInformation (69 bytes on the wire), `F3 12` client ready |
| Play | `1C 0F` MapChanged (10 bytes), `12` AddCharactersToScope, `D4` Walk request, `0D` ServerMessage, `0F` Weather, `1C` EnterGate, `30` TalkToNpc |

Confirmed offsets (wire size, not the maximum declared by the reference):
LoginLongPassword 59 B (username@4, password@14, tick@34 BE32, version@38, serial@43);
CharacterInformation 69 B; MapChanged 10 B.

## 4. Season 6 ⇄ Season 20 considerations

- The framing/cipher layer above is stable across seasons: `C3`/`C4` + SimpleModulus + XOR3 is what
  both the S6 reference client and OpenMU use, so a server speaking it can serve an S6-era client.
- Seasons 15+ change the **resource** layer (BMD v15 uses LEA-256; `.att`/`.map` may use other
  ModulusCryptor algorithms) — handled in `mu-formats`, partial for the unimplemented ciphers.
- Season 20 content patches (items, skills, maps) are **data**, not protocol: they require the user's
  data package (Fase 2, blocked) and a server-side data model that supports them (OpenMU is the
  candidate).
- Anything not yet implemented (party/guild/trade/skills/movement edge cases) must be treated as
  incompatible until implemented and tested; the server must reject unsupported packets explicitly
  rather than half-handle them.

## 5. Server-side slice (implemented)

`packages/mu-server` implements both listeners and the vertical slice listed in §3, with the server
authoritative on movement. Two profile rules matter for interop:

- The game session requires the **XOR32 profile** on both ends (`xor32: true`, the default in
  `startMuServer`). The reference OpenMU HEAD only wires XOR32 for the chat server, so a client that
  does not apply it is dropped (this is asserted by an integration test). Running with `xor32: false`
  is supported for experimentation.
- The 8-way movement encoding inside the server is our documented interpretation
  (`packages/mu-server/src/world.ts`, `DIRECTION_OFFSETS`); authority checks hold regardless of the
  mapping, but a real client would need the mapping validated (open question below).

## 6. Open compatibility questions

1. Walk direction numbering (0..7) against a real client — validate with a packet capture once the
   user runs a client against this server.
2. Whether the target Season 20 client applies XOR32 on the game server connection.
3. Packet-length maxima that differ between seasons for the wider packet set (only the vertical slice
   offsets are confirmed today).

## 7. Honest status

- Safe to claim: framing/cipher/packet-slice compatibility with OpenMU-style clients, proven by golden
  vectors and tests.
- **Not** yet proven: an exchange with a real MU client binary (needs the user's client + Windows),
  real-asset compatibility (needs the user's data), and full gameplay coverage.
