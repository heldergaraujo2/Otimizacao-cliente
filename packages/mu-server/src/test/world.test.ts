/**
 * World/movement logic (Level 2): the server's authority rules are pure functions, so they get their
 * own fast tests independent of sockets.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { DIRECTION_OFFSETS, MAP_SIZE, MAX_WALK_STEPS, World } from '../world.js';

const appearance = new Uint8Array(18);

function worldWithPlayer(x = 100, y = 100) {
  const world = new World();
  const character = world.add({ account: 'demo', name: 'Tester', mapId: 0, x, y, rotation: 0, level: 1, appearance, heroState: 0 });
  return { world, character };
}

test('direction table covers the 8 compass steps around the origin', () => {
  assert.equal(DIRECTION_OFFSETS.length, 8);
  const seen = new Set(DIRECTION_OFFSETS.map(([dx, dy]) => `${dx},${dy}`));
  assert.equal(seen.size, 8, 'every direction must be a distinct step');
  for (const [dx, dy] of DIRECTION_OFFSETS) {
    assert.ok(Math.abs(dx) <= 1 && Math.abs(dy) <= 1);
  }
  assert.deepEqual([...DIRECTION_OFFSETS[0]!], [0, -1], 'direction 0 = north');
  assert.deepEqual([...DIRECTION_OFFSETS[2]!], [1, 0], 'direction 2 = east');
  assert.deepEqual([...DIRECTION_OFFSETS[6]!], [-1, 0], 'direction 6 = west');
});

test('a valid walk moves the character and updates the rotation', () => {
  const { world, character } = worldWithPlayer(100, 100);
  const result = world.move(character.id, [2, 2, 2]);
  assert.equal(result.ok, true);
  assert.equal(result.x, 103);
  assert.equal(result.y, 100);
  assert.equal(result.rotation, 2);
  assert.equal(world.get(character.id)?.x, 103);
});

test('diagonal steps combine both axes', () => {
  const { world, character } = worldWithPlayer(100, 100);
  const result = world.move(character.id, [3, 3]);
  assert.deepEqual({ x: result.x, y: result.y }, { x: 102, y: 102 });
});

test('the high bit some clients set is ignored', () => {
  const { world, character } = worldWithPlayer(100, 100);
  const result = world.move(character.id, [0x8 | 2]);
  assert.equal(result.ok, true);
  assert.equal(result.x, 101);
});

test('walks are rejected when they leave the map', () => {
  const { world, character } = worldWithPlayer(0, 0);
  const result = world.move(character.id, [6, 6, 6]); // west three times from x=0
  assert.equal(result.ok, false);
  assert.match(result.reason ?? '', /leaves the map/);
  assert.equal(world.get(character.id)?.x, 0, 'rejected movement must not change the position');
});

test('walks are rejected when their length is illegal', () => {
  const { world, character } = worldWithPlayer();
  assert.equal(world.move(character.id, []).ok, false);
  assert.equal(world.move(character.id, new Array(MAX_WALK_STEPS + 1).fill(2)).ok, false);
  assert.match(world.move(character.id, new Array(20).fill(2)).reason ?? '', /invalid step count/);
});

test('walks with a wrong declared source position are rejected (client authority check)', () => {
  const { world, character } = worldWithPlayer(100, 100);
  const result = world.move(character.id, [2], 50, 100);
  assert.equal(result.ok, false);
  assert.match(result.reason ?? '', /declared x 50/);
  assert.equal(world.get(character.id)?.x, 100);
});

test('scope only contains characters on the same map inside the range', () => {
  const world = new World();
  const self = world.add({ account: 'a', name: 'Self', mapId: 0, x: 100, y: 100, rotation: 0, level: 1, appearance, heroState: 0 });
  const near = world.add({ account: 'b', name: 'Near', mapId: 0, x: 105, y: 100, rotation: 0, level: 1, appearance, heroState: 0 });
  world.add({ account: 'c', name: 'Far', mapId: 0, x: 200, y: 100, rotation: 0, level: 1, appearance, heroState: 0 });
  world.add({ account: 'd', name: 'OtherMap', mapId: 1, x: 100, y: 100, rotation: 0, level: 1, appearance, heroState: 0 });

  const scope = world.inScope(self.id).map((character) => character.name);
  assert.deepEqual(scope, ['Near']);

  world.remove(near.id);
  assert.deepEqual(world.inScope(self.id), []);
  assert.equal(MAP_SIZE, 256);
});

test('removing a character clears it from the world', () => {
  const { world, character } = worldWithPlayer();
  assert.equal(world.remove(character.id), true);
  assert.equal(world.get(character.id), undefined);
  assert.equal(world.byAccount('demo'), undefined);
  assert.deepEqual(world.all(), []);
});
