/**
 * Shared movement model tests.
 *
 * These are the tests that keep the client's prediction and the server's validation identical: both
 * call {@link applyWalk}, and the cases below pin the contract down (step limits, nibble decoding,
 * map bounds, rotation semantics).
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { applyWalk, DIRECTION_OFFSETS, MAP_SIZE, MAX_WALK_STEPS } from '../mu/movement.js';

test('the direction table covers the eight compass steps exactly once', () => {
  assert.equal(DIRECTION_OFFSETS.length, 8);
  assert.equal(new Set(DIRECTION_OFFSETS.map(([dx, dy]) => `${dx},${dy}`)).size, 8);
  for (const [dx, dy] of DIRECTION_OFFSETS) {
    assert.ok(Math.abs(dx) <= 1 && Math.abs(dy) <= 1, 'a step moves at most one tile per axis');
    assert.ok(dx !== 0 || dy !== 0, 'a step always moves');
  }
  assert.deepEqual([...DIRECTION_OFFSETS[0]!], [0, -1], '0 = north');
  assert.deepEqual([...DIRECTION_OFFSETS[2]!], [1, 0], '2 = east');
  assert.deepEqual([...DIRECTION_OFFSETS[4]!], [0, 1], '4 = south');
  assert.deepEqual([...DIRECTION_OFFSETS[6]!], [-1, 0], '6 = west');
  assert.equal(MAP_SIZE, 256);
  assert.equal(MAX_WALK_STEPS, 15);
});

test('walking applies every step and reports the last direction as the rotation', () => {
  const east = applyWalk(100, 100, 0, [2, 2, 2]);
  assert.deepEqual(east, { ok: true, x: 103, y: 100, rotation: 2, steps: 3 });

  const diagonal = applyWalk(100, 100, 0, [3, 3]);
  assert.deepEqual({ x: diagonal.x, y: diagonal.y, rotation: diagonal.rotation }, { x: 102, y: 102, rotation: 3 });

  const mixed = applyWalk(125, 125, 3, [0, 2, 4, 6]);
  assert.deepEqual({ x: mixed.x, y: mixed.y, rotation: mixed.rotation }, { x: 125, y: 125, rotation: 6 });
  assert.equal(mixed.steps, 4);
});

test('the high bit some clients set on a direction nibble is ignored', () => {
  const plain = applyWalk(50, 50, 0, [2]);
  const flagged = applyWalk(50, 50, 0, [0x8 | 2, 0x8 | 2]);
  assert.equal(flagged.ok, true);
  assert.deepEqual([flagged.x, flagged.y], [plain.x + 1, plain.y]);
  assert.equal(flagged.rotation, 2);
});

test('walks are rejected when the length is illegal', () => {
  assert.match(applyWalk(0, 0, 0, []).reason ?? '', /invalid step count 0/);
  assert.match(applyWalk(0, 0, 0, new Array(MAX_WALK_STEPS + 1).fill(2)).reason ?? '', /invalid step count 16/);
  assert.equal(applyWalk(0, 0, 0, new Array(MAX_WALK_STEPS).fill(2)).ok, true, '15 steps is the maximum');
  const rejected = applyWalk(10, 10, 5, []);
  assert.deepEqual({ x: rejected.x, y: rejected.y, rotation: rejected.rotation, steps: rejected.steps }, { x: 10, y: 10, rotation: 5, steps: 0 });
});

test('walks that would leave the map are rejected and do not move the position', () => {
  const north = applyWalk(0, 0, 0, [0]);
  assert.equal(north.ok, false);
  assert.match(north.reason ?? '', /leaves the map \(0,-1\)/);
  assert.equal(north.x, 0);

  const west = applyWalk(2, 5, 6, [6, 6, 6]);
  assert.equal(west.ok, false);
  assert.match(west.reason ?? '', /leaves the map \(-1,5\)/);
  assert.deepEqual({ x: west.x, y: west.y }, { x: 2, y: 5 });

  const southEast = applyWalk(255, 255, 0, [4]);
  assert.equal(southEast.ok, false);
  assert.match(southEast.reason ?? '', /leaves the map \(255,256\)/);
});

test('a map size can be overridden (village-like small maps stay testable)', () => {
  const inside = applyWalk(0, 0, 0, [2], 4);
  assert.equal(inside.ok, true);
  const outside = applyWalk(3, 0, 0, [2], 4);
  assert.equal(outside.ok, false);
  assert.match(outside.reason ?? '', /\(4,0\)/);
});
