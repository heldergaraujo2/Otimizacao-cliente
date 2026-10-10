import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildConnectionInfoRequest,
  buildConnectionInfoResponse,
  buildServerListRequest,
  buildServerListResponse,
  parseConnectionInfoRequest,
  parseConnectionInfoResponse,
  parseServerListResponse,
} from '../packets/connect-server.js';
import {
  buildAddCharactersToScope,
  buildCharacterInformation,
  buildCharacterList,
  buildClientReadyAfterMapChange,
  buildGameServerEntered,
  buildLoginLongPassword,
  buildLoginResponse,
  buildLogOut,
  buildMapChanged,
  buildObjectWalked,
  buildPing,
  buildRequestCharacterList,
  buildSelectCharacter,
  buildServerMessage,
  buildWalkRequest,
  parseAddCharactersToScope,
  parseCharacterInformation,
  parseCharacterList,
  parseGameServerEntered,
  parseLoginLongPassword,
  parseLoginResponse,
  parseLogOut,
  parseMapChanged,
  parseObjectWalked,
  parsePing,
  parseSelectCharacter,
  parseServerMessage,
  parseWalkRequest,
} from '../packets/game-server.js';
import { readPacketHeader } from '../framing.js';
import { LoginResult } from '../mu/constants.js';
import {
  DEFAULT_KEYS,
  SimpleModulusDecryptor,
  SimpleModulusEncryptor,
} from '../crypto/simplemodulus.js';
import { toHex } from '../codec.js';

test('connect server: server list request has the documented size (4 bytes)', () => {
  const packet = buildServerListRequest();
  assert.equal(packet.length, 4);
  assert.equal(packet[0], 0xc1);
  assert.equal(packet[2], 0xf4);
  assert.equal(packet[3], 0x06);
});

test('connect server: server list response round trip', () => {
  const servers = [
    { serverId: 0, loadPercentage: 12 },
    { serverId: 1, loadPercentage: 99 },
  ];
  const packet = buildServerListResponse(servers);
  const header = readPacketHeader(packet);
  assert.equal(header.prefix, 0xc2);
  assert.equal(header.code, 0xf4);
  assert.equal(header.subCode, 0x06);
  assert.deepEqual(parseServerListResponse(packet).servers, servers);
});

test('connect server: connection info request/response round trip', () => {
  const request = buildConnectionInfoRequest(3);
  assert.equal(request.length, 6);
  assert.deepEqual(parseConnectionInfoRequest(request), { serverId: 3 });

  const response = buildConnectionInfoResponse('192.168.1.10', 55901);
  assert.equal(response.length, 22);
  assert.deepEqual(parseConnectionInfoResponse(response), {
    ipAddress: '192.168.1.10',
    port: 55901,
  });
});

test('login packet matches the documented long-password field offsets', () => {
  // Field offsets: username[4..13], password[14..33], tick count[34..37], version[38..42],
  // serial[43..58] -> 59 bytes on the wire (the reference definition declares 60 as its maximum).
  const packet = buildLoginLongPassword('tester', 'secret', 123456);
  assert.equal(packet.length, 59);
  const header = readPacketHeader(packet);
  assert.equal(header.prefix, 0xc3);
  assert.equal(header.code, 0xf1);
  assert.equal(header.subCode, 0x01);
  const parsed = parseLoginLongPassword(packet);
  assert.equal(parsed.username, 'tester');
  assert.equal(parsed.password, 'secret');
  assert.equal(parsed.tickCount, 123456);
  assert.equal(parsed.clientVersion, '1.04d');
  assert.equal(parsed.clientSerial, '0123456789ABCDEF');
});

test('credentials are not readable in the wire bytes', () => {
  const packet = buildLoginLongPassword('tester', 'secret', 0);
  const ascii = Buffer.from(packet).toString('latin1');
  assert.ok(!ascii.includes('tester'));
  assert.ok(!ascii.includes('secret'));
});

test('login response carries the result code', () => {
  assert.equal(parseLoginResponse(buildLoginResponse(LoginResult.Okay)).success, 0);
  assert.equal(parseLoginResponse(buildLoginResponse(LoginResult.InvalidPassword)).success, 2);
});

test('game server entered round trip', () => {
  const packet = buildGameServerEntered(true, 4711, '1.04d');
  assert.equal(packet.length, 12);
  const parsed = parseGameServerEntered(packet);
  assert.deepEqual(parsed, { success: true, playerId: 4711, version: '1.04d' });
});

test('character list round trip with fixed 34-byte entries', () => {
  const characters = [
    {
      slotIndex: 0,
      name: 'Conan',
      level: 42,
      status: 1,
      appearance: new Uint8Array(18).fill(0x21),
      guildPosition: 0x80,
    },
    {
      slotIndex: 1,
      name: 'Merlin',
      level: 7,
      status: 0,
      appearance: new Uint8Array(18).fill(0x11),
      guildPosition: 0xff,
    },
  ];
  const packet = buildCharacterList(characters, { unlockFlags: 1, moveCnt: 2 });
  assert.equal(packet.length, 8 + 2 * 34);
  const parsed = parseCharacterList(packet);
  assert.equal(parsed.characterCount, 2);
  assert.equal(parsed.unlockFlags, 1);
  assert.equal(parsed.moveCnt, 2);
  assert.equal(parsed.characters[0].name, 'Conan');
  assert.equal(parsed.characters[0].level, 42);
  assert.equal(parsed.characters[1].name, 'Merlin');
  assert.equal(parsed.characters[1].level, 7);
  assert.equal(parsed.characters[1].guildPosition, 0xff);
});

test('character select round trip', () => {
  const packet = buildSelectCharacter('Conan');
  assert.equal(packet.length, 14);
  assert.deepEqual(parseSelectCharacter(packet), { name: 'Conan' });
});

test('character information round trip keeps every stat field', () => {
  const info = {
    x: 133,
    y: 118,
    mapId: 0,
    currentExperience: 12345,
    experienceForNextLevel: 99999,
    levelUpPoints: 3,
    strength: 28,
    agility: 20,
    vitality: 25,
    energy: 18,
    currentHealth: 210,
    maximumHealth: 210,
    currentMana: 65,
    maximumMana: 65,
    currentShield: 0,
    maximumShield: 0,
    currentAbility: 12,
    maximumAbility: 40,
    money: 150000,
    heroState: 0,
    status: 0,
    leadership: 0,
    inventoryExtensions: 0,
  };
  const packet = buildCharacterInformation(info);
  assert.equal(packet.length, 69);
  assert.deepEqual(parseCharacterInformation(packet), info);
});

test('map change packet matches the documented field offsets', () => {
  // flag[4], map[5..6] big endian, x[7], y[8], rotation[9] -> 10 bytes on the wire.
  const packet = buildMapChanged(3, 170, 100, 4);
  assert.equal(packet.length, 10);
  const parsed = parseMapChanged(packet);
  assert.deepEqual(parsed, { isMapChange: true, mapNumber: 3, x: 170, y: 100, rotation: 4 });
});

test('walk request round trip preserves step count and directions', () => {
  const directions = [1, 2, 3, 4, 5];
  const packet = buildWalkRequest(133, 118, 3, directions);
  const parsed = parseWalkRequest(packet);
  assert.equal(parsed.sourceX, 133);
  assert.equal(parsed.sourceY, 118);
  assert.equal(parsed.stepCount, 5);
  assert.equal(parsed.targetRotation, 3);
  assert.deepEqual(parsed.directions, directions);
});

test('object walked round trip (server -> client)', () => {
  const packet = buildObjectWalked(4711, 140, 120, 2, [0, 1, 2]);
  const parsed = parseObjectWalked(packet);
  assert.equal(parsed.objectId, 4711);
  assert.equal(parsed.targetX, 140);
  assert.equal(parsed.targetY, 120);
  assert.equal(parsed.stepCount, 3);
  assert.deepEqual(parsed.directions, [0, 1, 2]);
});

test('scope packet round trip keeps names and positions', () => {
  const packet = buildAddCharactersToScope([
    {
      id: 1001,
      currentX: 133,
      currentY: 118,
      appearance: new Uint8Array(18).fill(0x33),
      name: 'Scout',
      targetX: 134,
      targetY: 118,
      rotation: 1,
      heroState: 1,
    },
  ]);
  const parsed = parseAddCharactersToScope(packet);
  assert.equal(parsed.characters.length, 1);
  assert.equal(parsed.characters[0].id, 1001);
  assert.equal(parsed.characters[0].name, 'Scout');
  assert.equal(parsed.characters[0].currentX, 133);
  assert.equal(parsed.characters[0].heroState, 1);
  assert.equal(parsed.characters[0].rotation, 1);
});

test('server message, logout, ping and ready packets round trip', () => {
  assert.deepEqual(parseServerMessage(buildServerMessage(1, 'Welcome!')), {
    type: 1,
    message: 'Welcome!',
  });
  assert.deepEqual(parseLogOut(buildLogOut(2)), { type: 2 });
  assert.deepEqual(parsePing(buildPing(305419896, 250)), {
    tickCount: 305419896,
    attackSpeed: 250,
  });
  assert.equal(buildClientReadyAfterMapChange().length, 4);
});

test('every built packet declares the length it actually has', () => {
  const packets = [
    buildServerListRequest(),
    buildServerListResponse([{ serverId: 0, loadPercentage: 1 }]),
    buildConnectionInfoRequest(1),
    buildConnectionInfoResponse('127.0.0.1', 55901),
    buildLoginLongPassword('a', 'b', 1),
    buildLoginResponse(),
    buildGameServerEntered(),
    buildRequestCharacterList(),
    buildCharacterList([]),
    buildSelectCharacter('x'),
    buildCharacterInformation({
      x: 0,
      y: 0,
      mapId: 0,
      currentExperience: 0,
      experienceForNextLevel: 0,
      levelUpPoints: 0,
      strength: 0,
      agility: 0,
      vitality: 0,
      energy: 0,
      currentHealth: 0,
      maximumHealth: 0,
      currentMana: 0,
      maximumMana: 0,
      currentShield: 0,
      maximumShield: 0,
      currentAbility: 0,
      maximumAbility: 0,
      money: 0,
      heroState: 0,
      status: 0,
      leadership: 0,
      inventoryExtensions: 0,
    }),
    buildClientReadyAfterMapChange(),
    buildMapChanged(0, 0, 0, 0),
    buildWalkRequest(0, 0, 0, [1]),
    buildObjectWalked(1, 0, 0, 0, [1]),
    buildAddCharactersToScope([]),
    buildServerMessage(0, 'hi'),
    buildLogOut(),
    buildPing(0, 0),
  ];
  for (const packet of packets) {
    assert.equal(readPacketHeader(packet).size, packet.length);
  }
});
