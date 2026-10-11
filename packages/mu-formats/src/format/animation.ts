/**
 * BMD animation sampling and CPU skinning.
 *
 * The BMD format stores, for every action (animation clip) and every bone, one position and one euler
 * rotation triple per key frame. There is **no bind pose**: vertices are stored in node space and bound
 * to exactly one node with weight 1, so the animated position of a vertex is simply
 * `boneWorldMatrix[vertex.node] * vertex.position`. That is what makes this module small — and what
 * makes it worth testing: the client renderer (GPU skinning through three.js bones) and any offline
 * export use the same sampling code.
 *
 * Conventions (documented because they matter for interop):
 * - Rotations are euler angles in the same order as {@link bmdEulerToQuaternion} (XYZ composition).
 * - Matrices are **column-major, 4x4, 16 floats** — the layout WebGL and three.js use, so the renderer
 *   can consume them without transposition.
 * - Interpolation is linear. For rotations the shorter way around is chosen per axis (a difference
 *   larger than π is wrapped), which is what the classic client does when it keeps interpolation
 *   continuous across the 0/2π seam.
 */

import { bmdEulerToQuaternion, type BmdModel, type BmdMesh, type BmdVector3 } from './bmd.js';

/** Identity matrix in the column-major layout used across this module. */
export function identityMatrix(): Float32Array {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

export interface BoneTransform {
  position: BmdVector3;
  rotation: BmdVector3;
}

/** Shorter-way angle difference: keeps interpolation from spinning the long way around. */
export function shortestAngleDelta(from: number, to: number): number {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

/**
 * Samples a bone's local transform for a (possibly fractional) key.
 *
 * `key` is clamped to the key range, so callers can hand in any playhead. Bones without keys for the
 * requested action (dummy bones, or actions with zero keys) yield the identity transform instead of
 * throwing — animation data is often sparse.
 */
export function sampleBoneTransform(
  model: BmdModel,
  boneIndex: number,
  actionIndex: number,
  key: number,
): BoneTransform {
  const bone = model.bones[boneIndex];
  if (!bone) throw new RangeError(`bone ${boneIndex} does not exist (model has ${model.bones.length})`);
  const identity: BoneTransform = { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } };
  if (actionIndex < 0 || actionIndex >= model.actions.length) {
    throw new RangeError(`action ${actionIndex} does not exist (model has ${model.actions.length})`);
  }
  const matrix = bone.matrices[actionIndex];
  const frames = matrix?.position.length ?? 0;
  if (frames === 0) return identity;
  if (frames === 1) {
    const only = matrix!.position[0]!;
    const rotationOnly = matrix!.rotation[0] ?? { x: 0, y: 0, z: 0 };
    return { position: { ...only }, rotation: { ...rotationOnly } };
  }

  const clamped = Math.min(Math.max(key, 0), frames - 1);
  const lowerIndex = Math.floor(clamped);
  const upperIndex = Math.min(lowerIndex + 1, frames - 1);
  const t = clamped - lowerIndex;

  const a = matrix!.position[lowerIndex]!;
  const b = matrix!.position[upperIndex]!;
  const ra = matrix!.rotation[lowerIndex] ?? { x: 0, y: 0, z: 0 };
  const rb = matrix!.rotation[upperIndex] ?? ra;

  return {
    position: {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t,
    },
    rotation: {
      x: ra.x + shortestAngleDelta(ra.x, rb.x) * t,
      y: ra.y + shortestAngleDelta(ra.y, rb.y) * t,
      z: ra.z + shortestAngleDelta(ra.z, rb.z) * t,
    },
  };
}

/** Builds a column-major local matrix (translation ∘ rotation) from a sampled transform. */
export function transformToMatrix(transform: BoneTransform): Float32Array {
  const q = bmdEulerToQuaternion(transform.rotation);
  const { x, y, z, w } = q;
  // standard quaternion -> rotation matrix, written column-major
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const wx = w * x;
  const wy = w * y;
  const wz = w * z;
  return new Float32Array([
    1 - 2 * (yy + zz), 2 * (xy + wz), 2 * (xz - wy), 0,
    2 * (xy - wz), 1 - 2 * (xx + zz), 2 * (yz + wx), 0,
    2 * (xz + wy), 2 * (yz - wx), 1 - 2 * (xx + yy), 0,
    transform.position.x, transform.position.y, transform.position.z, 1,
  ]);
}

/** out = a * b (column-major 4x4; `a` is the outer transform, like a parent matrix). */
export function multiplyMatrix(a: Float32Array, b: Float32Array, out = new Float32Array(16)): Float32Array {
  for (let column = 0; column < 4; column++) {
    const b0 = b[column * 4]!;
    const b1 = b[column * 4 + 1]!;
    const b2 = b[column * 4 + 2]!;
    const b3 = b[column * 4 + 3]!;
    out[column * 4] = a[0]! * b0 + a[4]! * b1 + a[8]! * b2 + a[12]! * b3;
    out[column * 4 + 1] = a[1]! * b0 + a[5]! * b1 + a[9]! * b2 + a[13]! * b3;
    out[column * 4 + 2] = a[2]! * b0 + a[6]! * b1 + a[10]! * b2 + a[14]! * b3;
    out[column * 4 + 3] = a[3]! * b0 + a[7]! * b1 + a[11]! * b2 + a[15]! * b3;
  }
  return out;
}

/** Applies a column-major matrix to a point (w = 1), writing into `out` if given. */
export function transformPoint(matrix: Float32Array, point: BmdVector3): BmdVector3 {
  return {
    x: matrix[0]! * point.x + matrix[4]! * point.y + matrix[8]! * point.z + matrix[12]!,
    y: matrix[1]! * point.x + matrix[5]! * point.y + matrix[9]! * point.z + matrix[13]!,
    z: matrix[2]! * point.x + matrix[6]! * point.y + matrix[10]! * point.z + matrix[14]!,
  };
}

/** Applies the rotation part of a matrix to a direction (w = 0). */
export function transformDirection(matrix: Float32Array, direction: BmdVector3): BmdVector3 {
  return {
    x: matrix[0]! * direction.x + matrix[4]! * direction.y + matrix[8]! * direction.z,
    y: matrix[1]! * direction.x + matrix[5]! * direction.y + matrix[9]! * direction.z,
    z: matrix[2]! * direction.x + matrix[6]! * direction.y + matrix[10]! * direction.z,
  };
}

/**
 * Samples every bone and composes the hierarchy, returning one **world** matrix per bone
 * (column-major, 16 floats each, in bone order).
 *
 * Bones whose parent index is invalid or points at themselves are treated as roots — the parser
 * already rejects such data, but the sampler must never produce NaNs for a hand-made model.
 */
export function computeBoneWorldMatrices(model: BmdModel, actionIndex: number, key: number): Float32Array {
  const count = model.bones.length;
  const world = new Float32Array(16 * count);
  const resolved = new Uint8Array(count);
  const local = new Float32Array(16);

  const resolve = (boneIndex: number): Float32Array => {
    if (resolved[boneIndex]) {
      return world.subarray(boneIndex * 16, boneIndex * 16 + 16);
    }
    const bone = model.bones[boneIndex]!;
    const transform = sampleBoneTransform(model, boneIndex, actionIndex, key);
    const localMatrix = transformToMatrix(transform);

    const parentIndex = bone.parent;
    if (parentIndex >= 0 && parentIndex < count && parentIndex !== boneIndex && !bone.isDummy) {
      const parentMatrix = resolve(parentIndex);
      multiplyMatrix(parentMatrix, localMatrix, local);
      world.set(local, boneIndex * 16);
    } else {
      world.set(localMatrix, boneIndex * 16);
    }
    resolved[boneIndex] = 1;
    return world.subarray(boneIndex * 16, boneIndex * 16 + 16);
  };

  for (let i = 0; i < count; i++) resolve(i);
  return world;
}

export interface SkinnedMesh {
  positions: Float32Array;
  normals: Float32Array;
  vertexCount: number;
}

/**
 * CPU skinning of a mesh at a given animation time — used by tests, by the offline exporter and as the
 * reference implementation the GPU path has to match.
 */
export function skinMesh(model: BmdModel, mesh: BmdMesh, actionIndex: number, key: number): SkinnedMesh {
  const boneMatrices = computeBoneWorldMatrices(model, actionIndex, key);
  const vertexCount = mesh.triangles.reduce((total, triangle) => total + triangle.polygon, 0);
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);

  let out = 0;
  for (const triangle of mesh.triangles) {
    for (let corner = 0; corner < triangle.polygon; corner++) {
      const vertex = mesh.vertices[triangle.vertexIndex[corner]!];
      const normal = mesh.normals[triangle.normalIndex[corner]!];
      if (!vertex) throw new Error(`mesh references an out-of-range vertex at corner ${corner}`);
      const matrix = boneMatrices.subarray(vertex.node * 16, vertex.node * 16 + 16);
      const position = transformPoint(matrix, vertex.position);
      positions[out * 3] = position.x;
      positions[out * 3 + 1] = position.y;
      positions[out * 3 + 2] = position.z;
      if (normal) {
        const transformed = transformDirection(matrix, normal.normal);
        normals[out * 3] = transformed.x;
        normals[out * 3 + 1] = transformed.y;
        normals[out * 3 + 2] = transformed.z;
      }
      out++;
    }
  }

  return { positions, normals, vertexCount };
}

export interface ActionSummary {
  index: number;
  keys: number;
  lockPositions: boolean;
  /** Bones which actually carry keys for this action. */
  animatedBones: number;
}

/** Compact description of the animation data — used by `mu-cli inspect` and the HUD. */
export function summarizeActions(model: BmdModel): ActionSummary[] {
  return model.actions.map((action, index) => ({
    index,
    keys: action.numAnimationKeys,
    lockPositions: action.lockPositions,
    animatedBones: model.bones.filter((bone) => (bone.matrices[index]?.position.length ?? 0) > 0).length,
  }));
}
