/**
 * Terrain resources: .att (tile attributes), .map (texture mapping), .obj (static objects) and
 * the classic height map. All three encrypted variants are handled: FileCryptor (classic) and the
 * ModulusCryptor container marked by the "ATT\x01"/"MAP\x01" magic (modern data packages).
 */

import { xorBuxMask } from '../crypto/file-cryptor.js';
import { decryptFileCryptor } from '../crypto/file-cryptor.js';
import { modulusCryptorMagic, tryDecryptModulusCryptor } from '../crypto/modulus-cryptor.js';

export const TERRAIN_SIZE = 256;
export const TILE_COUNT = TERRAIN_SIZE * TERRAIN_SIZE;

/** Tile attributes (bit flags) - see docs/COMPATIBILITY.md. */
export const TwFlags = {
  None: 0x0000,
  SafeZone: 0x0001,
  Character: 0x0002,
  NoMove: 0x0004,
  NoGround: 0x0008,
  Water: 0x0010,
  Action: 0x0020,
  Height: 0x0040,
  CameraUp: 0x0080,
  NoAttackZone: 0x0100,
  Att1: 0x0200,
  Att2: 0x0400,
  Att3: 0x0800,
  Att4: 0x1000,
  Att5: 0x2000,
  Att6: 0x4000,
  Att7: 0x8000,
} as const;

export interface AttData {
  version: number;
  index: number;
  width: number;
  height: number;
  isExtended: boolean;
  attributes: Uint16Array;
  cipher: 'filecryptor' | 'moduluscryptor';
}

export function parseAtt(input: Uint8Array): AttData {
  let work: Uint8Array;
  let cipher: AttData['cipher'] = 'filecryptor';
  const container = tryDecryptModulusCryptor(input, 'ATT\u0001');
  if (container) {
    work = container.data;
    cipher = 'moduluscryptor';
  } else {
    work = decryptFileCryptor(input);
  }
  work = xorBuxMask(work);

  const expectedByteAtt = TILE_COUNT + 4;
  const expectedExtended = TILE_COUNT * 2 + 4;
  if (work.length !== expectedByteAtt && work.length !== expectedExtended) {
    throw new Error(
      `ATT: unexpected size ${work.length} (expected ${expectedByteAtt} or ${expectedExtended})` +
        (modulusCryptorMagic(input) ? ' [container magic present]' : ''),
    );
  }
  const isExtended = work.length === expectedExtended;
  const version = work[0];
  const index = work[1];
  const width = work[2];
  const height = work[3];
  if (version !== 0) throw new Error(`ATT: unsupported version ${version}`);
  if (width !== 255 || height !== 255) {
    throw new Error(`ATT: unexpected tile dimensions ${width}x${height} (expected 255x255)`);
  }

  const attributes = new Uint16Array(TILE_COUNT);
  let offset = 4;
  for (let i = 0; i < TILE_COUNT; i++) {
    if (isExtended) {
      attributes[i] = work[offset] | (work[offset + 1] << 8);
      offset += 2;
    } else {
      attributes[i] = work[offset++];
    }
  }
  return { version, index, width, height, isExtended, attributes, cipher };
}

export interface MapData {
  version: number;
  mapNumber: number;
  layer1: Uint8Array;
  layer2: Uint8Array;
  alpha: Uint8Array;
  cipher: 'filecryptor' | 'moduluscryptor';
}

export function parseMap(input: Uint8Array): MapData {
  let work: Uint8Array;
  let cipher: MapData['cipher'] = 'filecryptor';
  const container = tryDecryptModulusCryptor(input, 'MAP\u0001');
  if (container) {
    work = container.data;
    cipher = 'moduluscryptor';
  } else {
    work = decryptFileCryptor(input);
  }
  const expected = 2 + TILE_COUNT * 3;
  if (work.length < expected) {
    throw new Error(`MAP: unexpected size ${work.length} (expected at least ${expected})`);
  }
  const version = work[0];
  const mapNumber = work[1];
  let offset = 2;
  const layer1 = work.slice(offset, offset + TILE_COUNT);
  offset += TILE_COUNT;
  const layer2 = work.slice(offset, offset + TILE_COUNT);
  offset += TILE_COUNT;
  const alpha = work.slice(offset, offset + TILE_COUNT);
  return { version, mapNumber, layer1, layer2, alpha, cipher };
}

export interface MapObject {
  type: number;
  position: { x: number; y: number; z: number };
  angle: { x: number; y: number; z: number };
  scale: number;
  extra?: Uint8Array;
}

export interface ObjData {
  version: number;
  mapNumber: number;
  objects: MapObject[];
}

/** Record sizes per OBJ version (bytes). */
const OBJ_RECORD_SIZE: Record<number, number> = { 0: 30, 1: 32, 2: 33, 3: 45, 4: 46, 5: 54 };

export function parseObj(input: Uint8Array): ObjData {
  const work = decryptFileCryptor(input);
  const view = new DataView(work.buffer, work.byteOffset, work.byteLength);
  const version = work[0];
  const mapNumber = work[1];
  const declaredCount = view.getInt16(2, true);
  const recordSize = OBJ_RECORD_SIZE[version];
  if (recordSize === undefined) throw new Error(`OBJ: unsupported version ${version}`);
  if (declaredCount < 0) throw new Error(`OBJ: negative object count ${declaredCount}`);

  const available = Math.floor((work.length - 4) / recordSize);
  const count = Math.min(declaredCount, available);
  const objects: MapObject[] = [];
  let offset = 4;
  for (let i = 0; i < count; i++) {
    const type = view.getInt16(offset, true);
    offset += 2;
    const px = view.getFloat32(offset, true);
    offset += 4;
    const py = view.getFloat32(offset, true);
    offset += 4;
    const pz = view.getFloat32(offset, true);
    offset += 4;
    const ax = view.getFloat32(offset, true);
    offset += 4;
    const ay = view.getFloat32(offset, true);
    offset += 4;
    const az = view.getFloat32(offset, true);
    offset += 4;
    const scale = view.getFloat32(offset, true);
    offset += 4;
    const extraLength = recordSize - 30;
    const extra = extraLength > 0 ? work.slice(offset, offset + extraLength) : undefined;
    offset += extraLength;
    objects.push({
      type,
      position: { x: px, y: py, z: pz },
      angle: { x: ax, y: ay, z: az },
      scale,
      ...(extra ? { extra } : {}),
    });
  }
  return { version, mapNumber, objects };
}

export interface TerrainHeightData {
  /** 256x256 height values, 0..255; 255 means "no ground". */
  heights: Uint8Array;
}

/**
 * Classic height map (EncTerrainNN.map / TerrainHeight.bmd payload): exactly 65536 bytes.
 * Unknown layouts are rejected instead of being guessed, so a failing file is diagnosable.
 */
export function parseTerrainHeight(input: Uint8Array): TerrainHeightData {
  if (input.length === TILE_COUNT) return { heights: input.slice() };
  throw new Error(
    `terrain height: unexpected size ${input.length} (expected ${TILE_COUNT}); ` +
      'encrypted or multi-layer variants are not supported yet',
  );
}

export function hasFlag(attributes: Uint16Array, index: number, flag: number): boolean {
  const value = attributes[index];
  return value !== undefined && (value & flag) !== 0;
}

export function countFlag(attributes: Uint16Array, flag: number): number {
  let count = 0;
  for (const value of attributes) if ((value & flag) !== 0) count++;
  return count;
}
