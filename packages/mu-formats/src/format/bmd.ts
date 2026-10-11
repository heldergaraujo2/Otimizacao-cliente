/**
 * BMD (MU Online 3D model) reader.
 *
 * Supports the two container variants used by the modern data packages:
 *   - version 12: payload encrypted with FileCryptor
 *   - version 15: payload encrypted with LEA-256-ECB
 * Other versions are read as plain payload.
 *
 * Structure (little endian):
 *   "BMD" + version byte
 *   [v12/v15 only] int32 payload size, payload (from offset 8)
 *   32-byte model name, uint16 mesh/bone/action counts
 *   meshes: int16 counts (vertices, normals, texcoords, triangles) + int16 texture index;
 *           vertices 16 B, normals 20 B, texcoords 8 B, triangles 64 B, 32-byte texture path
 *   actions: int16 key count, byte lock flag, optional key count * 12 B positions
 *   bones:   byte dummy flag; 32-byte name, int16 parent, then per action
 *            (keys * 3 floats position, keys * 3 floats rotation)
 */

import { decryptFileCryptor } from '../crypto/file-cryptor.js';
import { BMD_LEA_KEY, createLea256EcbDecrypt } from '../crypto/lea256.js';

export interface BmdVector3 {
  x: number;
  y: number;
  z: number;
}

export interface BmdVertex {
  node: number;
  position: BmdVector3;
}

export interface BmdNormal {
  node: number;
  normal: BmdVector3;
  bindVertex: number;
}

export interface BmdTexCoord {
  u: number;
  v: number;
}

export interface BmdTriangle {
  polygon: number;
  vertexIndex: number[];
  normalIndex: number[];
  texCoordIndex: number[];
}

export interface BmdMesh {
  textureIndex: number;
  texturePath: string;
  vertices: BmdVertex[];
  normals: BmdNormal[];
  texCoords: BmdTexCoord[];
  triangles: BmdTriangle[];
}

export interface BmdAction {
  numAnimationKeys: number;
  lockPositions: boolean;
  positions: BmdVector3[];
}

export interface BmdBoneMatrix {
  position: BmdVector3[];
  rotation: BmdVector3[];
}

export interface BmdBone {
  name: string;
  parent: number;
  isDummy: boolean;
  matrices: BmdBoneMatrix[];
}

export interface BmdModel {
  version: number;
  name: string;
  encryptedPayloadSize?: number;
  meshes: BmdMesh[];
  actions: BmdAction[];
  bones: BmdBone[];
}

export interface BmdParseOptions {
  /** Skip actions/bones (thumbnail/geometry-only use case). */
  meshesOnly?: boolean;
  /** Safety limits, overridable for fuzzing. */
  limits?: Partial<typeof DEFAULT_LIMITS>;
}

const DEFAULT_LIMITS = {
  maxFileSize: 256 * 1024 * 1024,
  maxMeshes: 4096,
  maxBones: 4096,
  maxActions: 4096,
  maxMeshElements: 1_000_000,
  maxAnimationKeys: 100_000,
};

class BmdReader {
  constructor(
    private readonly data: Uint8Array,
    private view: DataView,
    private offset: number,
    private readonly limits: typeof DEFAULT_LIMITS,
  ) {}

  setView(view: DataView, offset: number): void {
    this.view = view;
    this.offset = offset;
  }

  ensure(bytes: number, label: string): void {
    if (this.offset + bytes > this.view.byteLength) {
      throw new Error(`truncated BMD while reading ${label} at offset ${this.offset}`);
    }
  }

  u8(label = 'byte'): number {
    this.ensure(1, label);
    return this.view.getUint8(this.offset++);
  }

  i16(label = 'int16'): number {
    this.ensure(2, label);
    const value = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return value;
  }

  u16(label = 'uint16'): number {
    this.ensure(2, label);
    const value = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }

  f32(label = 'float32'): number {
    this.ensure(4, label);
    const value = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return value;
  }

  ascii(length: number, label = 'string'): string {
    this.ensure(length, label);
    let out = '';
    for (let i = 0; i < length; i++) {
      const code = this.data[this.offset + i];
      if (code === 0) continue;
      out += String.fromCharCode(code);
    }
    this.offset += length;
    return out;
  }

  skip(bytes: number, label = 'reserved data'): void {
    this.ensure(bytes, label);
    this.offset += bytes;
  }

  count(value: number, max: number, label: string): number {
    if (!Number.isInteger(value) || value < 0 || value > max) {
      throw new Error(`invalid ${label} count: ${value}`);
    }
    return value;
  }
}

export function parseBmd(input: Uint8Array, options: BmdParseOptions = {}): BmdModel {
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  if (input.length < 4) throw new Error('BMD file is too small');
  if (input.length > limits.maxFileSize) throw new Error('BMD file exceeds the safety limit');

  const id = String.fromCharCode(input[0], input[1], input[2]);
  if (id !== 'BMD') throw new Error('invalid BMD header');

  const version = input[3];
  let work = input;
  let dataOffset = 4;
  let encryptedPayloadSize: number | undefined;

  if (version === 12 || version === 15) {
    if (input.length < 8) throw new Error('encrypted BMD header is truncated');
    const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
    encryptedPayloadSize = view.getInt32(4, true);
    if (encryptedPayloadSize < 0 || encryptedPayloadSize > input.length - 8) {
      throw new Error(`invalid encrypted BMD payload size: ${encryptedPayloadSize}`);
    }
    const payload = input.subarray(8, 8 + encryptedPayloadSize);
    const decrypted =
      version === 12
        ? decryptFileCryptor(payload)
        : createLea256EcbDecrypt(BMD_LEA_KEY)(payload);
    work = input.slice();
    work.set(decrypted, 8);
    dataOffset = 8;
  }

  const reader = new BmdReader(work, new DataView(work.buffer, work.byteOffset, work.byteLength), dataOffset, limits);
  const name = reader.ascii(32, 'model name');
  const meshCount = reader.count(reader.u16(), limits.maxMeshes, 'mesh');
  const boneCount = reader.count(reader.u16(), limits.maxBones, 'bone');
  const actionCount = reader.count(reader.u16(), limits.maxActions, 'action');

  const model: BmdModel = { version, name, encryptedPayloadSize, meshes: [], actions: [], bones: [] };

  for (let meshIndex = 0; meshIndex < meshCount; meshIndex++) {
    const vertexCount = reader.count(reader.i16(), limits.maxMeshElements, `mesh ${meshIndex} vertex`);
    const normalCount = reader.count(reader.i16(), limits.maxMeshElements, `mesh ${meshIndex} normal`);
    const texCoordCount = reader.count(reader.i16(), limits.maxMeshElements, `mesh ${meshIndex} texcoord`);
    const triangleCount = reader.count(reader.i16(), limits.maxMeshElements, `mesh ${meshIndex} triangle`);
    const textureIndex = reader.i16();

    const vertices: BmdVertex[] = [];
    for (let i = 0; i < vertexCount; i++) {
      const node = reader.i16();
      reader.i16(); // padding
      vertices.push({ node, position: { x: reader.f32(), y: reader.f32(), z: reader.f32() } });
    }

    const normals: BmdNormal[] = [];
    for (let i = 0; i < normalCount; i++) {
      const node = reader.i16();
      reader.i16(); // padding
      const normal = { x: reader.f32(), y: reader.f32(), z: reader.f32() };
      const bindVertex = reader.i16();
      reader.i16(); // padding
      normals.push({ node, normal, bindVertex });
    }

    const texCoords: BmdTexCoord[] = [];
    for (let i = 0; i < texCoordCount; i++) texCoords.push({ u: reader.f32(), v: reader.f32() });

    const triangles: BmdTriangle[] = [];
    for (let i = 0; i < triangleCount; i++) {
      reader.ensure(64, `mesh ${meshIndex} triangle ${i}`);
      const polygon = reader.u8();
      if (polygon !== 3 && polygon !== 4) {
        throw new Error(`invalid polygon size ${polygon} in mesh ${meshIndex} triangle ${i}`);
      }
      const vertexIndex: number[] = [];
      const normalIndex: number[] = [];
      const texCoordIndex: number[] = [];
      for (let k = 0; k < 4; k++) vertexIndex.push(reader.i16());
      for (let k = 0; k < 4; k++) normalIndex.push(reader.i16());
      for (let k = 0; k < 4; k++) texCoordIndex.push(reader.i16());
      reader.skip(64 - 26, `mesh ${meshIndex} triangle ${i} lightmap data`);
      triangles.push({
        polygon,
        vertexIndex: vertexIndex.slice(0, polygon),
        normalIndex: normalIndex.slice(0, polygon),
        texCoordIndex: texCoordIndex.slice(0, polygon),
      });
    }

    const texturePath = reader.ascii(32, `mesh ${meshIndex} texture path`);
    model.meshes.push({ textureIndex, texturePath, vertices, normals, texCoords, triangles });
  }

  if (options.meshesOnly) return model;

  for (let actionIndex = 0; actionIndex < actionCount; actionIndex++) {
    const numAnimationKeys = reader.count(reader.i16(), limits.maxAnimationKeys, `action ${actionIndex} key`);
    const lockPositions = reader.u8() > 0;
    const positions: BmdVector3[] = [];
    if (lockPositions) {
      for (let key = 0; key < numAnimationKeys; key++) {
        positions.push({ x: reader.f32(), y: reader.f32(), z: reader.f32() });
      }
    }
    model.actions.push({ numAnimationKeys, lockPositions, positions });
  }

  for (let boneIndex = 0; boneIndex < boneCount; boneIndex++) {
    const isDummy = reader.u8() > 0;
    if (isDummy) {
      model.bones.push({ name: `dummy_${boneIndex}`, parent: -1, isDummy: true, matrices: [] });
      continue;
    }
    const boneName = reader.ascii(32, `bone ${boneIndex} name`);
    const parent = reader.i16();
    if (parent < -1 || parent >= boneCount) {
      throw new Error(`invalid parent index ${parent} for bone ${boneIndex}`);
    }
    const matrices: BmdBoneMatrix[] = [];
    for (let actionIndex = 0; actionIndex < actionCount; actionIndex++) {
      const keys = model.actions[actionIndex]!.numAnimationKeys;
      if (keys === 0) {
        matrices.push({ position: [], rotation: [] });
        continue;
      }
      const positions: BmdVector3[] = [];
      const rotations: BmdVector3[] = [];
      for (let key = 0; key < keys; key++) {
        positions.push({ x: reader.f32(), y: reader.f32(), z: reader.f32() });
      }
      for (let key = 0; key < keys; key++) {
        rotations.push({ x: reader.f32(), y: reader.f32(), z: reader.f32() });
      }
      matrices.push({ position: positions, rotation: rotations });
    }
    model.bones.push({ name: boneName, parent, isDummy: false, matrices });
  }

  return model;
}

/** Front-facing quad facing +Z (matches the classic MU coordinate convention: Z is up). */
export function bmdEulerToQuaternion(euler: BmdVector3): { x: number; y: number; z: number; w: number } {
  const halfX = euler.x * 0.5;
  const halfY = euler.y * 0.5;
  const halfZ = euler.z * 0.5;
  const sinX = Math.sin(halfX);
  const cosX = Math.cos(halfX);
  const sinY = Math.sin(halfY);
  const cosY = Math.cos(halfY);
  const sinZ = Math.sin(halfZ);
  const cosZ = Math.cos(halfZ);
  return {
    w: cosX * cosY * cosZ + sinX * sinY * sinZ,
    x: sinX * cosY * cosZ - cosX * sinY * sinZ,
    y: cosX * sinY * cosZ + sinX * cosY * sinZ,
    z: cosX * cosY * sinZ - sinX * cosY * cosZ,
  };
}

export interface MeshGeometry {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  skinIndices: Uint16Array;
  skinWeights: Float32Array;
  vertexCount: number;
  triangleCount: number;
}

/**
 * Flattens a mesh into render-ready, non-indexed attributes.
 * MU models bind exactly one bone per vertex (weight 1), which is why skinIndices holds the
 * vertex' node index and the remaining weights are zero.
 */
export function extractMeshGeometry(mesh: BmdMesh): MeshGeometry {
  let vertexCount = 0;
  for (const triangle of mesh.triangles) vertexCount += triangle.polygon;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const skinIndices = new Uint16Array(vertexCount * 4);
  const skinWeights = new Float32Array(vertexCount * 4);

  let out = 0;
  for (const triangle of mesh.triangles) {
    for (let corner = 0; corner < triangle.polygon; corner++) {
      const vertex = mesh.vertices[triangle.vertexIndex[corner]!];
      const normal = mesh.normals[triangle.normalIndex[corner]!];
      const texCoord = mesh.texCoords[triangle.texCoordIndex[corner]!];
      if (!vertex || !texCoord) {
        throw new Error(`mesh references an out-of-range element at triangle corner ${corner}`);
      }
      positions[out * 3] = vertex.position.x;
      positions[out * 3 + 1] = vertex.position.y;
      positions[out * 3 + 2] = vertex.position.z;
      if (normal) {
        normals[out * 3] = normal.normal.x;
        normals[out * 3 + 1] = normal.normal.y;
        normals[out * 3 + 2] = normal.normal.z;
      }
      uvs[out * 2] = texCoord.u;
      uvs[out * 2 + 1] = 1 - texCoord.v;
      skinIndices[out * 4] = vertex.node;
      skinWeights[out * 4] = 1;
      out++;
    }
  }

  return {
    positions,
    normals,
    uvs,
    skinIndices,
    skinWeights,
    vertexCount,
    triangleCount: mesh.triangles.length,
  };
}

export interface BmdSummary {
  version: number;
  name: string;
  meshes: number;
  bones: number;
  actions: number;
  triangles: number;
  vertices: number;
  animatedBones: number;
  textures: string[];
}

export function summarizeBmd(model: BmdModel): BmdSummary {
  let triangles = 0;
  let vertices = 0;
  const textures = new Set<string>();
  for (const mesh of model.meshes) {
    triangles += mesh.triangles.length;
    vertices += mesh.vertices.length;
    if (mesh.texturePath) textures.add(mesh.texturePath);
  }
  return {
    version: model.version,
    name: model.name,
    meshes: model.meshes.length,
    bones: model.bones.length,
    actions: model.actions.length,
    triangles,
    vertices,
    animatedBones: model.bones.filter((bone) => bone.matrices.some((m) => m.position.length > 0)).length,
    textures: [...textures],
  };
}
