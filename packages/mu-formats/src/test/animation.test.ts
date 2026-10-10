/**
 * BMD animation and skinning tests.
 *
 * The fixture model has two real bones with three keys each and a dummy bone, which is exactly the
 * structure real MU models use — so these tests pin down the whole pipeline: key lookup, linear
 * interpolation (including the wraparound), hierarchy composition and vertex/normal skinning.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { parseBmd, type BmdModel, type BmdVector3 } from '../format/bmd.js';
import {
  computeBoneWorldMatrices,
  identityMatrix,
  multiplyMatrix,
  sampleBoneTransform,
  shortestAngleDelta,
  skinMesh,
  summarizeActions,
  transformPoint,
  transformToMatrix,
} from '../format/animation.js';
import { buildBmdFixture } from '../testing/fixtures.js';

const fixture = buildBmdFixture({ version: 12, name: 'anim-fixture' });
const model: BmdModel = parseBmd(fixture.bytes);
const mesh = model.meshes[0]!;

function closeTo(actual: number, expected: number, epsilon = 1e-5, label = ''): void {
  assert.ok(Math.abs(actual - expected) < epsilon, `${label}: expected ${expected}, got ${actual}`);
}

test('the fixture model exposes the bones and actions the tests rely on', () => {
  assert.equal(model.bones.length, 3);
  assert.equal(model.actions.length, 1);
  assert.equal(model.actions[0]!.numAnimationKeys, 3);
  assert.equal(model.bones[0]!.name, 'Bip01');
  assert.equal(model.bones[0]!.parent, -1);
  assert.equal(model.bones[1]!.name, 'Bip01 Head');
  assert.equal(model.bones[1]!.parent, 0);
  assert.equal(model.bones[2]!.isDummy, true);

  const summary = summarizeActions(model);
  assert.deepEqual(summary, [{ index: 0, keys: 3, lockPositions: false, animatedBones: 2 }]);
});

test('sampling on a key returns the stored values exactly', () => {
  const key0 = sampleBoneTransform(model, 0, 0, 0);
  assert.deepEqual(key0.position, { x: 0, y: 0, z: 0 });
  assert.deepEqual(key0.rotation, { x: 0, y: 0, z: 0 });

  const key2 = sampleBoneTransform(model, 0, 0, 2);
  closeTo(key2.position.y, 0.2, 1e-6, 'Bip01 key 2 y');
  closeTo(key2.rotation.y, 1, 1e-6, 'Bip01 key 2 rotation y');

  const head = sampleBoneTransform(model, 1, 0, 2);
  closeTo(head.position.z, 0.1, 1e-6, 'head key 2 z');
  closeTo(head.rotation.x, 0.2, 1e-6, 'head key 2 rotation x');
});

test('sampling between keys interpolates positions and rotations linearly', () => {
  const half = sampleBoneTransform(model, 0, 0, 1.5);
  closeTo(half.position.y, 0.15, 1e-6, 'interpolated position');
  closeTo(half.rotation.y, 0.75, 1e-6, 'interpolated rotation');

  const clampedLow = sampleBoneTransform(model, 0, 0, -5);
  assert.deepEqual(clampedLow.position, { x: 0, y: 0, z: 0 }, 'negative keys clamp to the first key');
  const clampedHigh = sampleBoneTransform(model, 0, 0, 99);
  closeTo(clampedHigh.position.y, 0.2, 1e-6, 'past-the-end keys clamp to the last key');
});

test('rotation interpolation takes the shorter way around the 0/2π seam', () => {
  assert.ok(Math.abs(shortestAngleDelta(3, -3) - (Math.PI * 2 - 6)) < 1e-12);

  // hand-built model whose only key difference is a rotation across the seam
  const synthetic: BmdModel = {
    version: 12,
    name: 'seam',
    meshes: [],
    actions: [{ numAnimationKeys: 2, lockPositions: false, positions: [] }],
    bones: [
      {
        name: 'root',
        parent: -1,
        isDummy: false,
        matrices: [
          {
            position: [
              { x: 0, y: 0, z: 0 },
              { x: 0, y: 0, z: 0 },
            ],
            rotation: [
              { x: 3, y: 0, z: 0 },
              { x: -3, y: 0, z: 0 },
            ],
          },
        ],
      },
    ],
  };
  const middle = sampleBoneTransform(synthetic, 0, 0, 0.5);
  // going the short way from 3 to -3 passes through +π (delta +0.283), not back through 0
  closeTo(middle.rotation.x, Math.PI, 1e-6, 'middle of the seam is π, not 0');
});

test('bones without keys for an action fall back to the identity transform', () => {
  const dummy = sampleBoneTransform(model, 2, 0, 1);
  assert.deepEqual(dummy.position, { x: 0, y: 0, z: 0 });
  assert.deepEqual(dummy.rotation, { x: 0, y: 0, z: 0 });

  const noKeys: BmdModel = {
    version: 12,
    name: 'sparse',
    meshes: [],
    actions: [{ numAnimationKeys: 0, lockPositions: false, positions: [] }],
    bones: [{ name: 'root', parent: -1, isDummy: false, matrices: [{ position: [], rotation: [] }] }],
  };
  assert.deepEqual(sampleBoneTransform(noKeys, 0, 0, 0).position, { x: 0, y: 0, z: 0 });
});

test('unknown bones and actions raise instead of returning garbage', () => {
  assert.throws(() => sampleBoneTransform(model, 99, 0, 0), RangeError);
  assert.throws(() => sampleBoneTransform(model, 0, 7, 0), RangeError);
});

test('the local matrix composes translation with the euler rotation', () => {
  const identity = transformToMatrix({ position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } });
  assert.deepEqual([...identity], [...identityMatrix()], 'zero rotation and position is the identity');

  // 90° around Y: (1,0,0) -> (0,0,-1) in the right-handed convention used by the quaternion helper
  const quarterTurn = transformToMatrix({ position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: Math.PI / 2, z: 0 } });
  const rotated = transformPoint(quarterTurn, { x: 1, y: 0, z: 0 });
  closeTo(rotated.x, 0, 1e-6, 'x after a 90° Y rotation');
  closeTo(rotated.z, -1, 1e-6, 'z after a 90° Y rotation');

  const translated = transformToMatrix({ position: { x: 2, y: 3, z: 4 }, rotation: { x: 0, y: 0, z: 0 } });
  const moved = transformPoint(translated, { x: 0, y: 0, z: 0 });
  assert.deepEqual(moved, { x: 2, y: 3, z: 4 });
});

test('matrix multiplication is in the documented column-major order', () => {
  const translate = transformToMatrix({ position: { x: 1, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } });
  const scaleLike = transformToMatrix({ position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } });
  const product = multiplyMatrix(translate, scaleLike);
  assert.deepEqual([...product], [...translate], 'identity * translate = translate');

  const twice = multiplyMatrix(translate, translate);
  const point = transformPoint(twice, { x: 0, y: 0, z: 0 });
  assert.deepEqual(point, { x: 2, y: 0, z: 0 }, 'translations accumulate');
});

test('the bone hierarchy is composed: a child moves with its animated parent', () => {
  const matrices = computeBoneWorldMatrices(model, 0, 2);
  const rootMatrix = matrices.subarray(0, 16);
  const headMatrix = matrices.subarray(16, 32);

  const rootOrigin = transformPoint(rootMatrix, { x: 0, y: 0, z: 0 });
  closeTo(rootOrigin.y, 0.2, 1e-6, 'root position at key 2');

  // the head is offset along +Z in the parent space, and the parent is rotated 1 rad around Y
  const headOrigin = transformPoint(headMatrix, { x: 0, y: 0, z: 0 });
  closeTo(headOrigin.y, 0.2, 1e-6, 'inherited y');
  closeTo(headOrigin.x, Math.sin(1) * 0.1, 1e-6, 'x = sin(rotation) * offset');
  closeTo(headOrigin.z, Math.cos(1) * 0.1 + 0, 1e-6, 'z = cos(rotation) * offset');

  // the dummy bone has no keys: it stays at the identity
  const dummyMatrix = matrices.subarray(32, 48);
  assert.deepEqual([...dummyMatrix], [...identityMatrix()]);
});

test('skinning at the rest key keeps the vertices where the model stores them', () => {
  const skinned = skinMesh(model, mesh, 0, 0);
  assert.equal(skinned.vertexCount, 7, 'the fixture has a 3-corner and a 4-corner triangle');

  // the rest pose is the identity, so every flattened corner must equal its stored vertex
  const expected: BmdVector3[] = [];
  for (const triangle of mesh.triangles) {
    for (let corner = 0; corner < triangle.polygon; corner++) {
      expected.push(mesh.vertices[triangle.vertexIndex[corner]!]!.position);
    }
  }
  for (let i = 0; i < expected.length; i++) {
    closeTo(skinned.positions[i * 3]!, expected[i]!.x, 1e-6, `corner ${i} x`);
    closeTo(skinned.positions[i * 3 + 1]!, expected[i]!.y, 1e-6, `corner ${i} y`);
    closeTo(skinned.positions[i * 3 + 2]!, expected[i]!.z, 1e-6, `corner ${i} z`);
    closeTo(skinned.normals[i * 3 + 1]!, 1, 1e-6, `corner ${i} keeps its +Y normal`);
  }
  // corner 0 is vertex (1,0,1) of node 0 — spelled out so the ordering is visible in the failure case
  assert.deepEqual([skinned.positions[0], skinned.positions[1], skinned.positions[2]], [1, 0, 1]);
});

test('skinning follows the animated bone and rotates the normals', () => {
  const skinned = skinMesh(model, mesh, 0, 2);
  // corner 0 is (1,0,1) bound to node 0 (Bip01), which at key 2 sits at y=0.2 rotated 1 rad around Y
  const expected: BmdVector3 = {
    x: Math.cos(1) * 1 + Math.sin(1) * 1,
    y: 0.2,
    z: -Math.sin(1) * 1 + Math.cos(1) * 1,
  };
  closeTo(skinned.positions[0]!, expected.x, 1e-5, 'skinned x');
  closeTo(skinned.positions[1]!, expected.y, 1e-5, 'skinned y');
  closeTo(skinned.positions[2]!, expected.z, 1e-5, 'skinned z');

  // the fixture normals point up (+Y): a Y rotation must leave them untouched
  closeTo(skinned.normals[0]!, 0, 1e-6, 'normal x');
  closeTo(skinned.normals[1]!, 1, 1e-6, 'normal y');
  closeTo(skinned.normals[2]!, 0, 1e-6, 'normal z');

  // and the animation actually moves the mesh relative to the rest key
  const rest = skinMesh(model, mesh, 0, 0);
  assert.notEqual(rest.positions[0], skinned.positions[0]);
});
