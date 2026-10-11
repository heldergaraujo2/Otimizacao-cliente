/**
 * Game-server packets of the login/session/movement slice.
 *
 * Layout follows OpenMU `src/Network/Packets/ClientToServer/ClientToServerPackets.xml` and
 * `ServerToClient/ServerToClientPackets.xml`. Fields that our slice does not interpret are kept
 * as raw bytes so a packet produced here stays byte-compatible with the reference definitions.
 *
 * Endianness: length fields and object ids are big endian, most game values are little endian.
 * Every builder documents its exact offsets.
 */

import { ByteReader, ByteWriter } from '../codec.js';
import { createPacket, readPacketHeader } from '../framing.js';
import { xor3 } from '../crypto/xor.js';
import { DEFAULT_CLIENT_VERSION, DEFAULT_CLIENT_SERIAL, LoginResult } from '../mu/constants.js';

export const GAME_CODE = {
  Ping: 0x0e,
  ServerMessage: 0x0d,
  Weather: 0x0f,
  MapChanged: 0x1c,
  EnterGate: 0x1c,
  ScopeCharacters: 0x12,
  ScopeNpcs: 0x13,
  MapObjectOutOfScope: 0x14,
  ObjectWalked: 0xd4,
  Login: 0xf1,
  Character: 0xf3,
} as const;

export interface CharacterListEntry {
  slotIndex: number;
  name: string;
  level: number;
  status: number;
  appearance: Uint8Array;
  guildPosition: number;
}

/** C3 F1 01, 60 bytes (LoginLongPassword). Credentials are Xor3 encrypted per field. */
export function buildLoginLongPassword(
  username: string,
  password: string,
  tickCount: number,
  clientVersion = DEFAULT_CLIENT_VERSION,
  clientSerial = DEFAULT_CLIENT_SERIAL,
): Uint8Array {
  const writer = new ByteWriter(56);
  writer.bytes(xor3(new Uint8Array(asciiPad(username, 10))));
  writer.bytes(xor3(new Uint8Array(asciiPad(password, 20))));
  writer.u32be(tickCount);
  writer.ascii(clientVersion, 5);
  writer.ascii(clientSerial, 16);
  return createPacket(0xc3, GAME_CODE.Login, 0x01, writer.toUint8Array());
}

export function parseLoginLongPassword(packet: Uint8Array): {
  username: string;
  password: string;
  tickCount: number;
  clientVersion: string;
  clientSerial: string;
} {
  const header = readPacketHeader(packet);
  if (header.code !== 0xf1 || header.subCode !== 0x01) throw new Error('not a login packet');
  const reader = new ByteReader(packet, 4);
  const username = trimAscii(xor3(reader.bytes(10)));
  const password = trimAscii(xor3(reader.bytes(20)));
  const tickCount = reader.u32be();
  const clientVersion = reader.ascii(5);
  const clientSerial = reader.ascii(16);
  return { username, password, tickCount, clientVersion, clientSerial };
}

/** C1 F1 01, 5 bytes: [4] result enum. */
export function buildLoginResponse(success: number = LoginResult.Okay): Uint8Array {
  return createPacket(0xc1, GAME_CODE.Login, 0x01, new Uint8Array([success & 0xff]));
}

export function parseLoginResponse(packet: Uint8Array): { success: number } {
  const header = readPacketHeader(packet);
  if (header.code !== 0xf1 || header.subCode !== 0x01) throw new Error('not a login response');
  return { success: packet[4] };
}

/** C1 F1 00, 12 bytes: [4] success, [5] uint16 BE player id, [7] version string(5). */
export function buildGameServerEntered(
  success = true,
  playerId = 0,
  version = DEFAULT_CLIENT_VERSION,
): Uint8Array {
  const writer = new ByteWriter(8);
  writer.u8(success ? 1 : 0);
  writer.u16be(playerId);
  writer.ascii(version, 5);
  return createPacket(0xc1, GAME_CODE.Login, 0x00, writer.toUint8Array());
}

export function parseGameServerEntered(packet: Uint8Array): {
  success: boolean;
  playerId: number;
  version: string;
} {
  const header = readPacketHeader(packet);
  if (header.code !== 0xf1 || header.subCode !== 0x00) throw new Error('not a game server entered packet');
  const reader = new ByteReader(packet, 4);
  const success = reader.u8() !== 0;
  const playerId = reader.u16be();
  const version = reader.ascii(5);
  return { success, playerId, version };
}

/** C1 F3 00, 5 bytes: [4] language byte. */
export function buildRequestCharacterList(language = 0): Uint8Array {
  return createPacket(0xc1, GAME_CODE.Character, 0x00, new Uint8Array([language & 0xff]));
}

/** C1 F3 00: header fields at [4..7], then fixed 34-byte character entries. */
export function buildCharacterList(
  characters: CharacterListEntry[],
  options: { unlockFlags?: number; moveCnt?: number; isVaultExtended?: boolean } = {},
): Uint8Array {
  const writer = new ByteWriter(8 + characters.length * 34);
  writer.u8(options.unlockFlags ?? 0);
  writer.u8(options.moveCnt ?? 0);
  writer.u8(characters.length);
  writer.u8(options.isVaultExtended ? 1 : 0);
  for (const character of characters) {
    writer.u8(character.slotIndex);
    writer.ascii(character.name, 10);
    writer.u8(0); // reserved byte at offset 11
    writer.u16le(character.level);
    writer.u8(character.status & 0x0f);
    const appearance = new Uint8Array(18);
    appearance.set(character.appearance.subarray(0, 18));
    writer.bytes(appearance);
    writer.u8(character.guildPosition);
  }
  return createPacket(0xc1, GAME_CODE.Character, 0x00, writer.toUint8Array());
}

export function parseCharacterList(packet: Uint8Array): {
  unlockFlags: number;
  moveCnt: number;
  characterCount: number;
  isVaultExtended: boolean;
  characters: CharacterListEntry[];
} {
  const header = readPacketHeader(packet);
  if (header.code !== 0xf3 || header.subCode !== 0x00) throw new Error('not a character list packet');
  const reader = new ByteReader(packet, 4);
  const unlockFlags = reader.u8();
  const moveCnt = reader.u8();
  const characterCount = reader.u8();
  const isVaultExtended = reader.u8() !== 0;
  const characters: CharacterListEntry[] = [];
  for (let i = 0; i < characterCount; i++) {
    const slotIndex = reader.u8();
    const name = reader.ascii(10);
    reader.u8(); // reserved
    const level = reader.u16le();
    const status = reader.u8();
    const appearance = reader.bytes(18);
    const guildPosition = reader.u8();
    characters.push({ slotIndex, name, level, status: status & 0x0f, appearance, guildPosition });
  }
  return { unlockFlags, moveCnt, characterCount, isVaultExtended, characters };
}

/** C1 F3 03, 14 bytes: [4] name string(10). */
export function buildSelectCharacter(name: string): Uint8Array {
  const writer = new ByteWriter(12).ascii(name, 10);
  return createPacket(0xc1, GAME_CODE.Character, 0x03, writer.toUint8Array());
}

export function parseSelectCharacter(packet: Uint8Array): { name: string } {
  const header = readPacketHeader(packet);
  if (header.code !== 0xf3 || header.subCode !== 0x03) throw new Error('not a character select packet');
  return { name: new ByteReader(packet, 4).ascii(10) };
}

export interface CharacterInformation {
  x: number;
  y: number;
  mapId: number;
  currentExperience: number;
  experienceForNextLevel: number;
  levelUpPoints: number;
  strength: number;
  agility: number;
  vitality: number;
  energy: number;
  currentHealth: number;
  maximumHealth: number;
  currentMana: number;
  maximumMana: number;
  currentShield: number;
  maximumShield: number;
  currentAbility: number;
  maximumAbility: number;
  money: number;
  heroState: number;
  status: number;
  leadership: number;
  inventoryExtensions: number;
}

/**
 * C3 F3 03 (character information / "select character response").
 * Absolute field offsets are documented in docs/COMPATIBILITY.md; the packet has a minimum
 * length of 69 bytes while the reference definition declares a maximum of 72.
 */
export function buildCharacterInformation(info: CharacterInformation): Uint8Array {
  const writer = new ByteWriter(72);
  writer.u8(info.x);
  writer.u8(info.y);
  writer.u16le(info.mapId);
  writer.u32be(info.currentExperience);
  writer.u32le(0); // reserved [12..15]
  writer.u32be(info.experienceForNextLevel);
  writer.u32le(0); // reserved [20..23]
  writer.u16le(info.levelUpPoints);
  writer.u16le(info.strength);
  writer.u16le(info.agility);
  writer.u16le(info.vitality);
  writer.u16le(info.energy);
  writer.u16le(info.currentHealth);
  writer.u16le(info.maximumHealth);
  writer.u16le(info.currentMana);
  writer.u16le(info.maximumMana);
  writer.u16le(info.currentShield);
  writer.u16le(info.maximumShield);
  writer.u16le(info.currentAbility);
  writer.u16le(info.maximumAbility);
  writer.u16le(0); // reserved [50..51]
  writer.u32le(info.money);
  writer.u8(info.heroState);
  writer.u8(info.status);
  writer.u16le(0); // used fruit points [58]
  writer.u16le(0); // max fruit points [60]
  writer.u16le(info.leadership);
  writer.u16le(0); // used negative fruit points [64]
  writer.u16le(0); // max negative fruit points [66]
  writer.u8(info.inventoryExtensions);
  return createPacket(0xc3, GAME_CODE.Character, 0x03, writer.toUint8Array());
}

export function parseCharacterInformation(packet: Uint8Array): CharacterInformation {
  const header = readPacketHeader(packet);
  if (header.code !== 0xf3 || header.subCode !== 0x03) throw new Error('not a character information packet');
  const reader = new ByteReader(packet, 4);
  const x = reader.u8();
  const y = reader.u8();
  const mapId = reader.u16le();
  const currentExperience = reader.u32be();
  reader.u32le(); // reserved [12..15]
  const experienceForNextLevel = reader.u32be();
  reader.u32le(); // reserved [20..23]
  const levelUpPoints = reader.u16le();
  const strength = reader.u16le();
  const agility = reader.u16le();
  const vitality = reader.u16le();
  const energy = reader.u16le();
  const currentHealth = reader.u16le();
  const maximumHealth = reader.u16le();
  const currentMana = reader.u16le();
  const maximumMana = reader.u16le();
  const currentShield = reader.u16le();
  const maximumShield = reader.u16le();
  const currentAbility = reader.u16le();
  const maximumAbility = reader.u16le();
  reader.u16le(); // reserved [50..51]
  const money = reader.u32le();
  const heroState = reader.u8();
  const status = reader.u8();
  reader.u16le(); // used fruit points
  reader.u16le(); // max fruit points
  const leadership = reader.u16le();
  reader.u16le(); // used negative fruit points
  reader.u16le(); // max negative fruit points
  const inventoryExtensions = reader.u8();
  return {
    x,
    y,
    mapId,
    currentExperience,
    experienceForNextLevel,
    levelUpPoints,
    strength,
    agility,
    vitality,
    energy,
    currentHealth,
    maximumHealth,
    currentMana,
    maximumMana,
    currentShield,
    maximumShield,
    currentAbility,
    maximumAbility,
    money,
    heroState,
    status,
    leadership,
    inventoryExtensions,
  };
}

/** C1 F3 12, 4 bytes. Client signals that it finished loading the map. */
export function buildClientReadyAfterMapChange(): Uint8Array {
  return createPacket(0xc1, GAME_CODE.Character, 0x12, new Uint8Array(0));
}

/** C3 1C 0F, 15 bytes: [4] flag, [5] uint16 BE map, [7] x, [8] y, [9] rotation. */
export function buildMapChanged(
  mapNumber: number,
  x: number,
  y: number,
  rotation: number,
  isMapChange = true,
): Uint8Array {
  const writer = new ByteWriter(11);
  writer.u8(isMapChange ? 1 : 0);
  writer.u16be(mapNumber);
  writer.u8(x);
  writer.u8(y);
  writer.u8(rotation);
  return createPacket(0xc3, GAME_CODE.MapChanged, 0x0f, writer.toUint8Array());
}

export function parseMapChanged(packet: Uint8Array): {
  isMapChange: boolean;
  mapNumber: number;
  x: number;
  y: number;
  rotation: number;
} {
  const header = readPacketHeader(packet);
  if (header.code !== 0x1c || header.subCode !== 0x0f) throw new Error('not a map changed packet');
  const reader = new ByteReader(packet, 4);
  return {
    isMapChange: reader.u8() !== 0,
    mapNumber: reader.u16be(),
    x: reader.u8(),
    y: reader.u8(),
    rotation: reader.u8(),
  };
}

/**
 * Directions are packed as nibbles: two movement directions per byte, the low nibble first.
 * Each direction is an angle index 0..7 (45 degrees steps).
 */
export function packDirections(directions: number[]): Uint8Array {
  const out = new Uint8Array(Math.ceil(directions.length / 2));
  for (let i = 0; i < directions.length; i++) {
    const value = directions[i] & 0x0f;
    if (i % 2 === 0) out[i >> 1] |= value;
    else out[i >> 1] |= value << 4;
  }
  return out;
}

/** C1 D4 (WalkRequest): [3] source x, [4] source y, [5] step count/rotation nibbles, [6..] steps. */
export function buildWalkRequest(
  sourceX: number,
  sourceY: number,
  targetRotation: number,
  directions: number[],
): Uint8Array {
  const steps = packDirections(directions);
  const writer = new ByteWriter(6 + steps.length);
  writer.u8(sourceX);
  writer.u8(sourceY);
  // Reference (ClientToServerPackets WalkRequest): TargetRotation is the high nibble, StepCount the low one.
  writer.u8(((targetRotation & 0x0f) << 4) | (directions.length & 0x0f));
  writer.bytes(steps);
  return createPacket(0xc1, GAME_CODE.ObjectWalked, undefined, writer.toUint8Array());
}

export interface WalkRequest {
  sourceX: number;
  sourceY: number;
  stepCount: number;
  targetRotation: number;
  directions: number[];
}

export function parseWalkRequest(packet: Uint8Array): WalkRequest {
  const header = readPacketHeader(packet);
  if (header.code !== 0xd4) throw new Error('not a walk request');
  const reader = new ByteReader(packet, 3);
  const sourceX = reader.u8();
  const sourceY = reader.u8();
  const flags = reader.u8();
  const targetRotation = (flags >> 4) & 0x0f;
  const stepCount = flags & 0x0f;
  const directions: number[] = [];
  const stepBytes = Math.ceil(stepCount / 2);
  for (let i = 0; i < stepBytes; i++) {
    const value = reader.u8();
    directions.push(value & 0x0f);
    if (directions.length < stepCount) directions.push((value >> 4) & 0x0f);
  }
  return { sourceX, sourceY, stepCount, targetRotation, directions };
}

/** C1 D4 (ObjectWalked, server->client): [3] uint16 BE object id, [5] x, [6] y, [7] nibbles, [8..]. */
export function buildObjectWalked(
  objectId: number,
  targetX: number,
  targetY: number,
  targetRotation: number,
  directions: number[],
): Uint8Array {
  const steps = packDirections(directions);
  const writer = new ByteWriter(8 + steps.length);
  writer.u16be(objectId);
  writer.u8(targetX);
  writer.u8(targetY);
  // Reference (ServerToClientPackets ObjectWalked): TargetRotation is the high nibble, StepCount the
  // low one — the same nibble order as WalkRequest, confirmed against both generated structs.
  writer.u8(((targetRotation & 0x0f) << 4) | (directions.length & 0x0f));
  writer.bytes(steps);
  return createPacket(0xc1, GAME_CODE.ObjectWalked, undefined, writer.toUint8Array());
}

export function parseObjectWalked(packet: Uint8Array): {
  objectId: number;
  targetX: number;
  targetY: number;
  stepCount: number;
  targetRotation: number;
  directions: number[];
} {
  const header = readPacketHeader(packet);
  if (header.code !== 0xd4) throw new Error('not an object walked packet');
  const reader = new ByteReader(packet, 3);
  const objectId = reader.u16be();
  const targetX = reader.u8();
  const targetY = reader.u8();
  const flags = reader.u8();
  const targetRotation = (flags >> 4) & 0x0f;
  const stepCount = flags & 0x0f;
  const directions: number[] = [];
  const stepBytes = Math.ceil(stepCount / 2);
  if (stepBytes > 0) {
    for (let i = 0; i < stepBytes; i++) {
      const value = reader.u8();
      directions.push(value & 0x0f);
      if (directions.length < stepCount) directions.push((value >> 4) & 0x0f);
    }
  }
  return { objectId, targetX, targetY, stepCount, targetRotation, directions };
}

export interface ScopeCharacter {
  id: number;
  currentX: number;
  currentY: number;
  appearance: Uint8Array;
  name: string;
  targetX: number;
  targetY: number;
  rotation: number;
  heroState: number;
}

/** C2 12 (AddCharactersToScope): [4] count, then variable-length entries. */
export function buildAddCharactersToScope(characters: ScopeCharacter[]): Uint8Array {
  const writer = new ByteWriter(6 + characters.length * 36);
  writer.u8(characters.length);
  for (const character of characters) {
    writer.u16be(character.id);
    writer.u8(character.currentX);
    writer.u8(character.currentY);
    const appearance = new Uint8Array(18);
    appearance.set(character.appearance.subarray(0, 18));
    writer.bytes(appearance);
    writer.ascii(character.name, 10);
    writer.u8(character.targetX);
    writer.u8(character.targetY);
    // Reference layout (MUnique.OpenMU Network/Packets/ServerToClient, CharacterData):
    //   rotation = GetByteValue(4, 4) -> high nibble, heroState = GetByteValue(4, 0) -> low nibble,
    //   followed by the effect count and one effect record per effect.
    writer.u8(((character.rotation & 0x0f) << 4) | (character.heroState & 0x0f));
    writer.u8(0); // effect count
  }
  return createPacket(0xc2, GAME_CODE.ScopeCharacters, undefined, writer.toUint8Array());
}

export function parseAddCharactersToScope(packet: Uint8Array): { characters: ScopeCharacter[] } {
  const header = readPacketHeader(packet);
  if (header.code !== 0x12) throw new Error('not an add-characters-to-scope packet');
  const reader = new ByteReader(packet, 4);
  const count = reader.u8();
  const characters: ScopeCharacter[] = [];
  for (let i = 0; i < count; i++) {
    const id = reader.u16be();
    const currentX = reader.u8();
    const currentY = reader.u8();
    const appearance = reader.bytes(18);
    const name = reader.ascii(10);
    const targetX = reader.u8();
    const targetY = reader.u8();
    // see buildAddCharactersToScope: rotation is the high nibble, hero state the low one
    const flags = reader.u8();
    const rotation = (flags >> 4) & 0x0f;
    const heroState = flags & 0x0f;
    const effectCount = reader.u8();
    for (let e = 0; e < effectCount; e++) reader.u8();
    characters.push({ id, currentX, currentY, appearance, name, targetX, targetY, rotation, heroState });
  }
  return { characters };
}

/**
 * C1 14 (MapObjectOutOfScope): [3] object count, then one big-endian uint16 id per object.
 *
 * Verified against the reference definitions (ServerToClientPackets.xml / generated
 * `MapObjectOutOfScope`: ObjectCount at index 3, objects start at index 4, Id = BigEndian uint16).
 * This is the packet a client needs when something leaves its view — for example when another player
 * disconnects or walks out of the scope box.
 */
export function buildMapObjectOutOfScope(objectIds: number[]): Uint8Array {
  const writer = new ByteWriter(1 + objectIds.length * 2);
  writer.u8(objectIds.length & 0xff);
  for (const id of objectIds) writer.u16be(id);
  return createPacket(0xc1, GAME_CODE.MapObjectOutOfScope, undefined, writer.toUint8Array());
}

export function parseMapObjectOutOfScope(packet: Uint8Array): { objectIds: number[] } {
  const header = readPacketHeader(packet);
  if (header.code !== GAME_CODE.MapObjectOutOfScope) {
    throw new Error('not a map-object-out-of-scope packet');
  }
  const reader = new ByteReader(packet, 3);
  const count = reader.u8();
  const objectIds: number[] = [];
  for (let i = 0; i < count; i++) objectIds.push(reader.u16be());
  return { objectIds };
}

export interface NpcScopeEntry {
  id: number;
  typeNumber: number;
  currentX: number;
  currentY: number;
  targetX: number;
  targetY: number;
  rotation: number;
}

/**
 * C2 13 (AddNpcsToScope): [4] npc count, then 10-byte records without effects.
 *
 * Record layout verified against the reference (ServerToClientPackets.xml + the generated
 * `AddNpcsToScope`: Id and TypeNumber are big-endian uint16, then x/y/targetX/targetY, rotation in the
 * **high** nibble of byte 8 and the effect count in byte 9).
 */
export function buildAddNpcsToScope(npcs: NpcScopeEntry[]): Uint8Array {
  const writer = new ByteWriter(5 + npcs.length * 10);
  writer.u8(npcs.length & 0xff);
  for (const npc of npcs) {
    writer.u16be(npc.id);
    writer.u16be(npc.typeNumber);
    writer.u8(npc.currentX);
    writer.u8(npc.currentY);
    writer.u8(npc.targetX);
    writer.u8(npc.targetY);
    writer.u8((npc.rotation & 0x0f) << 4);
    writer.u8(0); // effect count
  }
  return createPacket(0xc2, GAME_CODE.ScopeNpcs, undefined, writer.toUint8Array());
}

export function parseAddNpcsToScope(packet: Uint8Array): { npcs: NpcScopeEntry[] } {
  const header = readPacketHeader(packet);
  if (header.code !== GAME_CODE.ScopeNpcs) throw new Error('not an add-npcs-to-scope packet');
  const reader = new ByteReader(packet, 4);
  const count = reader.u8();
  const npcs: NpcScopeEntry[] = [];
  for (let i = 0; i < count; i++) {
    const id = reader.u16be();
    const typeNumber = reader.u16be();
    const currentX = reader.u8();
    const currentY = reader.u8();
    const targetX = reader.u8();
    const targetY = reader.u8();
    const rotation = (reader.u8() >> 4) & 0x0f;
    const effectCount = reader.u8();
    for (let e = 0; e < effectCount; e++) reader.u8();
    npcs.push({ id, typeNumber, currentX, currentY, targetX, targetY, rotation });
  }
  return { npcs };
}

/** C1 0D (ServerMessage): [3] type, [4..] ASCII message. */
export function buildServerMessage(type: number, message: string): Uint8Array {
  const body = new Uint8Array(1 + message.length);
  body[0] = type & 0xff;
  for (let i = 0; i < message.length; i++) body[i + 1] = message.charCodeAt(i) & 0xff;
  return createPacket(0xc1, GAME_CODE.ServerMessage, undefined, body);
}

export function parseServerMessage(packet: Uint8Array): { type: number; message: string } {
  const reader = new ByteReader(packet, 3);
  const type = reader.u8();
  let message = '';
  while (reader.remaining > 0) message += String.fromCharCode(reader.u8());
  return { type, message };
}

/** C3 F1 02: [4] logout type. */
export function buildLogOut(type = 1): Uint8Array {
  return createPacket(0xc3, GAME_CODE.Login, 0x02, new Uint8Array([type & 0xff]));
}

export function parseLogOut(packet: Uint8Array): { type: number } {
  const header = readPacketHeader(packet);
  if (header.code !== 0xf1 || header.subCode !== 0x02) throw new Error('not a logout packet');
  return { type: packet[4] };
}

/** C3 0E 00, 12 bytes: [4] uint32 LE tick count, [8] uint16 LE attack speed. */
export function buildPing(tickCount: number, attackSpeed: number): Uint8Array {
  const writer = new ByteWriter(8).u32le(tickCount >>> 0).u16le(attackSpeed);
  return createPacket(0xc3, GAME_CODE.Ping, 0x00, writer.toUint8Array());
}

export function parsePing(packet: Uint8Array): { tickCount: number; attackSpeed: number } {
  const header = readPacketHeader(packet);
  if (header.code !== 0x0e || header.subCode !== 0x00) throw new Error('not a ping packet');
  const reader = new ByteReader(packet, 4);
  return { tickCount: reader.u32le(), attackSpeed: reader.u16le() };
}

function asciiPad(value: string, size: number): Uint8Array {
  const out = new Uint8Array(size);
  for (let i = 0; i < size; i++) out[i] = i < value.length ? value.charCodeAt(i) & 0xff : 0;
  return out;
}

function trimAscii(data: Uint8Array): string {
  let end = data.length;
  while (end > 0 && data[end - 1] === 0) end--;
  let out = '';
  for (let i = 0; i < end; i++) out += String.fromCharCode(data[i]);
  return out;
}
