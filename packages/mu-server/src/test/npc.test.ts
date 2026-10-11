/**
 * Monster/NPC behaviour (Level 2): the wander step is deterministic once the randomness is injected,
 * so the tests pin the exact directions instead of asserting "something moved".
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { wanderNpcs } from '../npc.js';
import { World } from '../world.js';

const appearance = new Uint8Array(18);

/** Random source that returns the given values in order, repeating the last one forever. */
function sequence(values: number[]): () => number {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)]!;
}

function worldWithNpc(x = 125, y = 125) {
  const world = new World();
  const [npc] = world.spawnNpcs([{ typeNumber: 0x0001, name: 'Budge Dragon', x, y }]);
  return { world, npc: npc! };
}

test('a monster walks in the drawn direction for the drawn number of steps', () => {
  const { world, npc } = worldWithNpc(125, 125);
  // rng: idle roll 0.5 (>= 0.25 so it moves), step count 0.0 -> 1 step, direction 0.3 -> index 2 (east)
  const steps = wanderNpcs(world, sequence([0.5, 0, 0.3]), { idleChance: 0.25, maxSteps: 3 });

  assert.equal(steps.length, 1);
  const step = steps[0]!;
  assert.equal(step.idle, false);
  assert.deepEqual(step.directions, [2]);
  assert.equal(step.x, 126);
  assert.equal(step.y, 125);
  assert.equal(step.rotation, 2);
  assert.equal(world.get(npc.id)?.x, 126, 'the world really moved');
});

test('a monster can idle without moving or changing its rotation', () => {
  const { world, npc } = worldWithNpc(125, 125);
  // rng: idle roll 0.1 < 0.25 -> stand still
  const steps = wanderNpcs(world, sequence([0.1]), { idleChance: 0.25 });

  assert.equal(steps.length, 1);
  assert.equal(steps[0]!.idle, true);
  assert.deepEqual(steps[0]!.directions, []);
  assert.equal(world.get(npc.id)?.x, 125);
  assert.equal(world.get(npc.id)?.y, 125);
});

test('a monster pressed against the map border turns around instead of walking off it', () => {
  const { world, npc } = worldWithNpc(0, 0);
  // every attempt draws 3 west steps (direction 6): the first is rejected, the second also (the world
  // does not move on rejection), so the monster ends up idle — but never at negative coordinates
  const steps = wanderNpcs(world, sequence([0.5, 0.9, 0.75]), { maxSteps: 3 });

  assert.equal(steps.length, 1);
  assert.equal(steps[0]!.idle, true);
  assert.equal(world.get(npc.id)?.x, 0);
  assert.equal(world.get(npc.id)?.y, 0);
});

test('only monsters are moved — players keep control of their own steps', () => {
  const world = new World();
  const player = world.add({
    account: 'demo',
    name: 'DarkKnight',
    mapId: 0,
    x: 125,
    y: 125,
    rotation: 0,
    level: 1,
    appearance,
    heroState: 0,
  });
  world.spawnNpcs([{ typeNumber: 0x0001, name: 'Budge Dragon', x: 130, y: 125 }]);

  const steps = wanderNpcs(world, sequence([0.5, 0, 0.3]), { maxSteps: 1 });
  assert.equal(steps.length, 1, 'one step reported for one monster');
  assert.equal(world.get(player.id)?.x, 125, 'the player did not move');
});

test('a monster keeps its type number and identity across the walk', () => {
  const { world, npc } = worldWithNpc(125, 125);
  const steps = wanderNpcs(world, sequence([0.5, 0.9, 0.5]), { maxSteps: 3 });
  const step = steps[0]!;
  assert.equal(step.npc.id, npc.id);
  assert.equal(step.npc.typeNumber, 0x0001);
  assert.equal(step.npc.kind, 'npc');
  assert.ok(step.directions.length >= 1 && step.directions.length <= 3);
});

test('a monster stays inside its home radius and turns instead of wandering off', () => {
  const world = new World();
  const [npc] = world.spawnNpcs([{ typeNumber: 0x0001, name: 'Guard', x: 131, y: 125, rotation: 2 }]);
  // pretend it spawned at 125 and already drifted the full radius east
  npc!.homeX = 125;
  npc!.homeY = 125;

  // three east attempts (direction 2) always end at 132, one tile outside the default radius of 6
  const steps = wanderNpcs(world, sequence([0.5, 0, 0.3]), { idleChance: 0.25, maxSteps: 1 });
  assert.equal(steps[0]!.idle, true, 'every candidate left the territory');
  assert.equal(world.get(npc!.id)?.x, 131, 'the world was not touched by the rejected candidates');

  // the same draw is accepted when the radius allows it
  const allowed = wanderNpcs(world, sequence([0.5, 0, 0.3]), { idleChance: 0.25, maxSteps: 1, homeRadius: 7 });
  assert.equal(allowed[0]!.idle, false);
  assert.equal(world.get(npc!.id)?.x, 132);
});
