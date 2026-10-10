/**
 * Synthetic resource builders.
 *
 * The project must not redistribute proprietary Webzen assets, so the automated test suite builds
 * its own well-formed resources and demands that the parsers reproduce every value. Because the
 * builders implement the *encryption* side of every container, they double as a writer for
 * round-trip validation of the readers.
 */

import { encryptFileCryptor, xorBuxMask } from '../crypto/file-cryptor.js';
import { BMD_LEA_KEY } from '../crypto/lea256.js';
import { TILE_COUNT } from '../format/terrain.js';

export interface BmdFixtureOptions {
  version?: 12 | 15 | 0;
  name?: string;
  encrypted?: boolean;
}

export interface BmdFixture {
  bytes: Uint8Array;
  version: number;
  name: string;
  mesh: {
    texturePath: string;
    vertices: Array<{ node: number; position: [number, number, number] }>;
    normals: Array<{ node: number; normal: [number, number, number]; bindVertex: number }>;
    texCoords: Array<[number, number]>;
    triangles: Array<{ polygon: number; vertexIndex: number[]; normalIndex: number[]; texCoordIndex: number[] }>;
  };
  actions: Array<{ numAnimationKeys: number; lockPositions: boolean; positions: Array<[number, number, number]> }>;
  bones: Array<{
    name: string;
    parent: number;
    dummy?: boolean;
    matrices: Array<{ position: Array<[number, number, number]>; rotation: Array<[number, number, number]> }>;
  }>;
}

class Writer {
  private bytes: number[] = [];

  u8(value: number): this {
    this.bytes.push(value & 0xff);
    return this;
  }

  i16(value: number): this {
    const v = value & 0xffff;
    this.bytes.push(v & 0xff, (v >> 8) & 0xff);
    return this;
  }

  u16(value: number): this {
    return this.i16(value);
  }

  i32(value: number): this {
    const v = value >>> 0;
    this.bytes.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
    return this;
  }

  f32(value: number): this {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setFloat32(0, value, true);
    this.bytes.push(...new Uint8Array(buffer));
    return this;
  }

  ascii(value: string, length: number): this {
    for (let i = 0; i < length; i++) this.bytes.push(i < value.length ? value.charCodeAt(i) & 0xff : 0);
    return this;
  }

  toUint8Array(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}

/** Builds a valid BMD model with one quad mesh, one action and two bones. */
export function buildBmdFixture(options: BmdFixtureOptions = {}): BmdFixture {
  const version = options.version ?? 12;
  const name = options.name ?? 'MU-REENGINEER-test';
  const encrypted = options.encrypted ?? version !== 0;

  const vertices: BmdFixture['mesh']['vertices'] = [
    { node: 0, position: [1, 0, 1] },
    { node: 0, position: [-1, 0, 1] },
    { node: 1, position: [-1, 0, -1] },
    { node: 1, position: [1, 0, -1] },
  ];
  const normals = vertices.map((vertex, index) => ({
    node: vertex.node,
    normal: [0, 1, 0] as [number, number, number],
    bindVertex: index,
  }));
  const texCoords: Array<[number, number]> = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  const triangles = [
    { polygon: 3, vertexIndex: [0, 1, 2], normalIndex: [0, 1, 2], texCoordIndex: [0, 1, 2] },
    { polygon: 4, vertexIndex: [0, 2, 3, 0], normalIndex: [0, 2, 3, 0], texCoordIndex: [0, 2, 3, 0] },
  ];
  const actions = [
    {
      numAnimationKeys: 3,
      lockPositions: false,
      positions: [] as Array<[number, number, number]>,
    },
  ];
  const bones: BmdFixture['bones'] = [
    {
      name: 'Bip01',
      parent: -1,
      matrices: [
        {
          position: [
            [0, 0, 0],
            [0, 0.1, 0],
            [0, 0.2, 0],
          ],
          rotation: [
            [0, 0, 0],
            [0, 0.5, 0],
            [0, 1, 0],
          ],
        },
      ],
    },
    {
      name: 'Bip01 Head',
      parent: 0,
      matrices: [
        {
          position: [
            [0, 0, 0],
            [0, 0, 0.05],
            [0, 0, 0.1],
          ],
          rotation: [
            [0, 0, 0],
            [0.1, 0, 0],
            [0.2, 0, 0],
          ],
        },
      ],
    },
    { name: 'dummy', parent: -1, dummy: true, matrices: [] },
  ];

  const payload = new Writer();
  payload.ascii(name, 32);
  payload.u16(1); // meshes
  payload.u16(bones.length);
  payload.u16(actions.length);
  payload.i16(vertices.length);
  payload.i16(normals.length);
  payload.i16(texCoords.length);
  payload.i16(triangles.length);
  payload.i16(7); // texture index
  for (const vertex of vertices) {
    payload.i16(vertex.node);
    payload.i16(0);
    payload.f32(vertex.position[0]);
    payload.f32(vertex.position[1]);
    payload.f32(vertex.position[2]);
  }
  for (const normal of normals) {
    payload.i16(normal.node);
    payload.i16(0);
    payload.f32(normal.normal[0]);
    payload.f32(normal.normal[1]);
    payload.f32(normal.normal[2]);
    payload.i16(normal.bindVertex);
    payload.i16(0);
  }
  for (const texCoord of texCoords) {
    payload.f32(texCoord[0]);
    payload.f32(texCoord[1]);
  }
  for (const triangle of triangles) {
    payload.u8(triangle.polygon);
    for (let i = 0; i < 4; i++) payload.i16(triangle.vertexIndex[i] ?? 0);
    for (let i = 0; i < 4; i++) payload.i16(triangle.normalIndex[i] ?? 0);
    for (let i = 0; i < 4; i++) payload.i16(triangle.texCoordIndex[i] ?? 0);
    for (let i = 0; i < 38; i++) payload.u8(0); // lightmap data + reserved
  }
  payload.ascii('Interface/test.tga', 32);
  for (const action of actions) {
    payload.i16(action.numAnimationKeys);
    payload.u8(action.lockPositions ? 1 : 0);
  }
  for (const bone of bones) {
    payload.u8(bone.dummy ? 1 : 0);
    if (bone.dummy) continue;
    payload.ascii(bone.name, 32);
    payload.i16(bone.parent);
    for (const matrix of bone.matrices) {
      for (const position of matrix.position) {
        payload.f32(position[0]);
        payload.f32(position[1]);
        payload.f32(position[2]);
      }
      for (const rotation of matrix.rotation) {
        payload.f32(rotation[0]);
        payload.f32(rotation[1]);
        payload.f32(rotation[2]);
      }
    }
  }
  const body = payload.toUint8Array();

  let bytes: Uint8Array;
  if (version === 12 || version === 15) {
    // LEA operates on 16-byte blocks, so real v15 payloads are zero padded.
    let payloadBody = body;
    if (encrypted && version === 15 && payloadBody.length % 16 !== 0) {
      const padded = new Uint8Array(Math.ceil(payloadBody.length / 16) * 16);
      padded.set(payloadBody);
      payloadBody = padded;
    }
    const encryptedPayload = encrypted
      ? version === 12
        ? encryptFileCryptor(payloadBody)
        : leaEncrypt(payloadBody)
      : payloadBody;
    bytes = new Uint8Array(8 + encryptedPayload.length);
    bytes[0] = 0x42; // B
    bytes[1] = 0x4d; // M
    bytes[2] = 0x44; // D
    bytes[3] = version;
    new DataView(bytes.buffer).setInt32(4, encryptedPayload.length, true);
    bytes.set(encryptedPayload, 8);
  } else {
    bytes = new Uint8Array(4 + body.length);
    bytes[0] = 0x42;
    bytes[1] = 0x4d;
    bytes[2] = 0x44;
    bytes[3] = version;
    bytes.set(body, 4);
  }

  return {
    bytes,
    version,
    name,
    mesh: { texturePath: 'Interface/test.tga', vertices, normals, texCoords, triangles },
    actions,
    bones,
  };
}

/**
 * LEA-256 encryption for fixtures.
 *
 * The loader only needs the decryption direction. For round-trip tests we derive the matching
 * encryption from the decryption round by algebraic inversion:
 *   decrypt round:  t0 = s3; t1 = (ror(s0,9) - (t0^K0)) ^ K1; t2 = (rol(s1,5) - (t1^K2)) ^ K3;
 *                   t3 = (rol(s2,3) - (t2^K4)) ^ K5
 *   inverse round:  s0 = rol((t1^K1) + (t0^K0), 9); s1 = ror((t2^K3) + (t1^K2), 5);
 *                   s2 = ror((t3^K5) + (t2^K4), 3); s3 = t0
 * The decrypt loop consumes subkey blocks 31..0, so the encryptor applies the inverse rounds with
 * subkey blocks 0..31; decrypt(encrypt(x)) == x, which tests/formats.test.ts asserts.
 */
function leaEncrypt(data: Uint8Array): Uint8Array {
  const KEY_DELTA = [0xc3efe9db, 0x44626b02, 0x79e27c8a, 0x78df30ec, 0x715ea49e, 0xc785da0a, 0xe04ef22a, 0xe5c40957];
  const rol = (x: number, n: number): number => ((x << (n & 31)) | (x >>> (32 - (n & 31)))) >>> 0;
  const ror = (x: number, n: number): number => ((x >>> (n & 31)) | (x << (32 - (n & 31)))) >>> 0;

  const keyWords = new Uint32Array(8);
  for (let i = 0; i < 8; i++) {
    keyWords[i] =
      (BMD_LEA_KEY[i * 4 + 3] << 24) |
      (BMD_LEA_KEY[i * 4 + 2] << 16) |
      (BMD_LEA_KEY[i * 4 + 1] << 8) |
      BMD_LEA_KEY[i * 4];
  }
  const roundKeys = new Uint32Array(192);
  const schedule = new Uint32Array(keyWords);
  for (let i = 0; i < 32; i++) {
    const delta = KEY_DELTA[i & 7]!;
    const s = (i * 6) & 7;
    schedule[(s + 0) & 7] = rol((schedule[(s + 0) & 7]! + rol(delta, i)) >>> 0, 1);
    schedule[(s + 1) & 7] = rol((schedule[(s + 1) & 7]! + rol(delta, i + 1)) >>> 0, 3);
    schedule[(s + 2) & 7] = rol((schedule[(s + 2) & 7]! + rol(delta, i + 2)) >>> 0, 6);
    schedule[(s + 3) & 7] = rol((schedule[(s + 3) & 7]! + rol(delta, i + 3)) >>> 0, 11);
    schedule[(s + 4) & 7] = rol((schedule[(s + 4) & 7]! + rol(delta, i + 4)) >>> 0, 13);
    schedule[(s + 5) & 7] = rol((schedule[(s + 5) & 7]! + rol(delta, i + 5)) >>> 0, 17);
    roundKeys.set(
      [
        schedule[(s + 0) & 7]!,
        schedule[(s + 1) & 7]!,
        schedule[(s + 2) & 7]!,
        schedule[(s + 3) & 7]!,
        schedule[(s + 4) & 7]!,
        schedule[(s + 5) & 7]!,
      ],
      i * 6,
    );
  }

  if (data.length % 16 !== 0) throw new Error('LEA: fixture payload must be a multiple of 16 bytes');
  const out = data.slice();
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  const state = new Uint32Array(4);
  const next = new Uint32Array(4);
  for (let offset = 0; offset < out.length; offset += 16) {
    for (let i = 0; i < 4; i++) state[i] = view.getUint32(offset + i * 4, true);
    for (let round = 0; round < 32; round++) {
      const k = round * 6;
      // Forward encryption round = algebraic inverse of the reference decrypt round.
      // state is interpreted as the decrypt round output (t0, t1, t2, t3).
      const t0 = state[0]!;
      next[0] = rol(((state[1]! ^ roundKeys[k + 1]!) + (t0 ^ roundKeys[k]!)) >>> 0, 9);
      next[1] = ror(((state[2]! ^ roundKeys[k + 3]!) + (state[1]! ^ roundKeys[k + 2]!)) >>> 0, 5);
      next[2] = ror(((state[3]! ^ roundKeys[k + 5]!) + (state[2]! ^ roundKeys[k + 4]!)) >>> 0, 3);
      next[3] = t0;
      state.set(next);
    }
    for (let i = 0; i < 4; i++) view.setUint32(offset + i * 4, state[i]!, true);
  }
  return out;
}

export function buildOztFixture(width = 4, height = 3): { bytes: Uint8Array; pixels: Uint8Array } {
  const pixels = new Uint8Array(width * height * 4);
  const bytes = new Uint8Array(22 + pixels.length);
  bytes[0] = 0x4f; // O
  bytes[1] = 0x5a; // Z
  bytes[2] = 0x54; // T
  bytes[3] = 1;
  const view = new DataView(bytes.buffer);
  view.setInt16(16, width, true);
  view.setInt16(18, height, true);
  bytes[20] = 32;
  bytes[21] = 0;
  let offset = 22;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const b = (x * 17 + 5) & 0xff;
      const g = (y * 23 + 7) & 0xff;
      const r = (x * y + 61) & 0xff;
      const a = 200;
      bytes[offset++] = b;
      bytes[offset++] = g;
      bytes[offset++] = r;
      bytes[offset++] = a;
      // remember the expectation in top-down image order (the reader flips the rows)
      const target = ((height - 1 - y) * width + x) * 4;
      pixels[target] = r;
      pixels[target + 1] = g;
      pixels[target + 2] = b;
      pixels[target + 3] = a;
    }
  }
  return { bytes, pixels };
}

export function buildOzbFixture(width = 3, height = 2): { bytes: Uint8Array; pixels: Uint8Array } {
  const bytes = new Uint8Array(4 + 54 + width * height * 3);
  bytes[0] = 0x42; // B
  bytes[1] = 0x4d; // M
  bytes[2] = 0x36; // 6
  bytes[3] = 1;
  const view = new DataView(bytes.buffer);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setInt16(26, 1, true); // planes
  view.setInt16(28, 24, true); // bit count
  const pixels = new Uint8Array(width * height * 4);
  let offset = 58;
  for (let i = 0; i < width * height; i++) {
    const b = (i * 11) & 0xff;
    const g = (i * 29) & 0xff;
    const r = (i * 43) & 0xff;
    bytes[offset++] = b;
    bytes[offset++] = g;
    bytes[offset++] = r;
    pixels[i * 4] = r;
    pixels[i * 4 + 1] = g;
    pixels[i * 4 + 2] = b;
    pixels[i * 4 + 3] = 255;
  }
  return { bytes, pixels };
}

/** OZJ fixture: 16-byte header + offset byte + a minimal JPEG-ish marker stream. */
export function buildOzjFixture(jpegPayload = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9])): {
  bytes: Uint8Array;
  jpegOffset: number;
} {
  const jpegOffset = 18;
  const bytes = new Uint8Array(jpegOffset + jpegPayload.length);
  bytes[0] = 0x4f;
  bytes[1] = 0x5a;
  bytes[2] = 0x4a;
  bytes[3] = 1;
  bytes[17] = 1; // top-down flag
  bytes.set(jpegPayload, jpegOffset);
  return { bytes, jpegOffset };
}

export function buildAttFixture(options: { extended?: boolean } = {}): { bytes: Uint8Array; attributes: Uint16Array } {
  const extended = options.extended ?? true;
  const attributes = new Uint16Array(TILE_COUNT);
  for (let i = 0; i < TILE_COUNT; i++) {
    attributes[i] = (i % 7 === 0 ? 0x0001 : 0) | (i % 11 === 0 ? 0x0004 : 0) | (i % 13 === 0 ? 0x0010 : 0);
  }
  const plain = new Uint8Array(4 + TILE_COUNT * (extended ? 2 : 1));
  plain[0] = 0;
  plain[1] = 3; // terrain index
  plain[2] = 255;
  plain[3] = 255;
  let offset = 4;
  for (let i = 0; i < TILE_COUNT; i++) {
    if (extended) {
      plain[offset++] = attributes[i]! & 0xff;
      plain[offset++] = (attributes[i]! >> 8) & 0xff;
    } else {
      plain[offset++] = attributes[i]! & 0xff;
    }
  }
  return { bytes: encryptFileCryptor(xorBuxMask(plain)), attributes };
}

export function buildMapFixture(): {
  bytes: Uint8Array;
  layer1: Uint8Array;
  layer2: Uint8Array;
  alpha: Uint8Array;
} {
  const plain = new Uint8Array(2 + TILE_COUNT * 3);
  plain[0] = 1;
  plain[1] = 3;
  const layer1 = new Uint8Array(TILE_COUNT);
  const layer2 = new Uint8Array(TILE_COUNT);
  const alpha = new Uint8Array(TILE_COUNT);
  for (let i = 0; i < TILE_COUNT; i++) {
    layer1[i] = i % 8;
    layer2[i] = (i + 1) % 8;
    alpha[i] = i % 256;
  }
  plain.set(layer1, 2);
  plain.set(layer2, 2 + TILE_COUNT);
  plain.set(alpha, 2 + TILE_COUNT * 2);
  return { bytes: encryptFileCryptor(plain), layer1, layer2, alpha };
}

export function buildObjFixture(): { bytes: Uint8Array; objects: Array<{ type: number; x: number; y: number; z: number; scale: number }> } {
  const objects = [
    { type: 0x0005, x: 140.5, y: 120.25, z: 3.5, scale: 0.9 },
    { type: 0x0102, x: 12, y: 34, z: 0, scale: 1.25 },
  ];
  const plain = new Uint8Array(4 + objects.length * 30);
  plain[0] = 0; // version
  plain[1] = 3; // map number
  new DataView(plain.buffer).setInt16(2, objects.length, true);
  let offset = 4;
  const view = new DataView(plain.buffer);
  for (const object of objects) {
    view.setInt16(offset, object.type, true);
    offset += 2;
    view.setFloat32(offset, object.x, true);
    offset += 4;
    view.setFloat32(offset, object.y, true);
    offset += 4;
    view.setFloat32(offset, object.z, true);
    offset += 4;
    view.setFloat32(offset, 0, true);
    offset += 4;
    view.setFloat32(offset, 0, true);
    offset += 4;
    view.setFloat32(offset, 0, true);
    offset += 4;
    view.setFloat32(offset, object.scale, true);
    offset += 4;
  }
  return { bytes: encryptFileCryptor(plain), objects };
}

export function buildTgaFixture(width = 2, height = 2, rle = false): { bytes: Uint8Array; pixels: Uint8Array } {
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    pixels[i * 4] = (i * 10) & 0xff;
    pixels[i * 4 + 1] = (i * 20) & 0xff;
    pixels[i * 4 + 2] = (i * 30) & 0xff;
    pixels[i * 4 + 3] = 255;
  }
  const header = new Uint8Array(18);
  header[2] = rle ? 10 : 2;
  const view = new DataView(header.buffer);
  view.setUint16(12, width, true);
  view.setUint16(14, height, true);
  header[16] = 32;
  header[17] = 0x28; // 8 alpha bits + top-down origin
  const body: number[] = [];
  if (rle) {
    for (let i = 0; i < width * height; i++) {
      body.push(0x80, pixels[i * 4 + 2]!, pixels[i * 4 + 1]!, pixels[i * 4]!, pixels[i * 4 + 3]!);
    }
  } else {
    for (let i = 0; i < width * height; i++) {
      body.push(pixels[i * 4 + 2]!, pixels[i * 4 + 1]!, pixels[i * 4]!, pixels[i * 4 + 3]!);
    }
  }
  const bytes = new Uint8Array(header.length + body.length);
  bytes.set(header, 0);
  bytes.set(body, 18);
  return { bytes, pixels };
}

/** Minimal DXT1 DDS with a single 4x4 block using the 4-colour mode. */
export function buildDdsFixture(): { bytes: Uint8Array; expectedTopLeft: [number, number, number] } {
  const bytes = new Uint8Array(128 + 8);
  bytes[0] = 0x44; // D
  bytes[1] = 0x44; // D
  bytes[2] = 0x53; // S
  bytes[3] = 0x20;
  const view = new DataView(bytes.buffer);
  view.setUint32(12, 4, true); // height
  view.setUint32(16, 4, true); // width
  bytes[84] = 0x44; // D
  bytes[85] = 0x58; // X
  bytes[86] = 0x54; // T
  bytes[87] = 0x31; // 1
  view.setUint16(128, 0xffff, true); // colour0 = white
  view.setUint16(130, 0x0000, true); // colour1 = black
  view.setUint32(132, 0x00000000, true); // all pixels use colour0
  return { bytes, expectedTopLeft: [255, 255, 255] };
}
