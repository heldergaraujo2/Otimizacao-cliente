/**
 * MU Online wire-protocol constants.
 *
 * Source of truth for these values: MUnique/OpenMU (MIT License, Copyright 2017 MUnique),
 * `src/Network/Packets/*.xml` and `src/Network/ArrayExtensions.cs`, pinned commit recorded in
 * docs/REPOSITORIES.md. The protocol itself is an interoperability fact, not copied code.
 */

/** Packet prefix byte. Determines header size, encryption and length field width. */
export const PacketType = {
  /** Not encrypted (client direction: Xor32 only). 1-byte length. */
  C1: 0xc1,
  /** Not encrypted. 2-byte length (big endian). */
  C2: 0xc2,
  /** Encrypted with SimpleModulus. 1-byte length. Contains a packet counter. */
  C3: 0xc3,
  /** Encrypted with SimpleModulus. 2-byte length (big endian). Contains a packet counter. */
  C4: 0xc4,
} as const;

export type PacketTypeValue = (typeof PacketType)[keyof typeof PacketType];

/** Standard connect-server (server list) port of the original MU Online architecture. */
export const DEFAULT_CONNECT_SERVER_PORT = 44405;

/** Default game-server port used by the MU-REENGINEER reference server. */
export const DEFAULT_GAME_SERVER_PORT = 55901;

/** Client versions are identified by a 5-byte string. Season 6 episode 3 clients send e.g. "1.04d". */
export const DEFAULT_CLIENT_VERSION = '1.04d';

/** 16-byte client serial. The reference client uses a fixed, well-known serial. */
export const DEFAULT_CLIENT_SERIAL = '0123456789ABCDEF';

/** LoginResponse.Success values (OpenMU LoginResult enum order). */
export const LoginResult = {
  Okay: 0x00,
  AccountAlreadyConnected: 0x01,
  InvalidPassword: 0x02,
  InvalidAccount: 0x03,
  AccountTemporarilyBlocked: 0x04,
  AccountPermanentlyBlocked: 0x05,
  AccountAlreadyConnected2: 0x06,
  ConnectionError: 0x07,
  ServerIsFull: 0x08,
  AccountBlocked: 0x09,
  InvalidVersion: 0x0a,
  Disconnected: 0x0b,
} as const;

/** LogOut request types (ClientToServer.LogOut). */
export const LogOutType = {
  CloseGame: 0x00,
  BackToCharacterSelection: 0x01,
  BackToServerList: 0x02,
} as const;

/** Hero state flags, used in scope packets (bit field, 4 bits). */
export const HeroState = {
  New: 0x00,
  Hero: 0x01,
  Hero2: 0x02,
  Hero3: 0x03,
  SetHero: 0x04,
  LegendaryHero: 0x08,
} as const;

/** Map ids used by the default reference world configuration. */
export const DEFAULT_MAP = {
  Lorencia: 0,
  Dungeon: 1,
  Devias: 2,
  Noria: 3,
  LostTower: 4,
} as const;
