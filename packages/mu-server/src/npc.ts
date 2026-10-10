/**
 * Monster/NPC behaviour (Level 2 + Level 3): a small, deterministic wander step.
 *
 * The point of this module is *not* to reimplement MU's monster AI — it is to make the world move
 * through the same validated code path a player uses (`World.move` → `applyWalk`), so the packets the
 * client receives for a monster are byte-identical in shape to the ones it receives for a player. That
 * keeps the client's interpolation logic uniform and makes the feature testable with a fixed random
 * source.
 */

import type { World, WorldCharacter } from './world.js';

/** Injectable randomness so tests can pin the movement (defaults to `Math.random`). */
export type RandomFn = () => number;

export interface NpcStep {
  npc: WorldCharacter;
  /** Directions the monster walked, in order (same encoding the `ObjectWalked` packet uses). */
  directions: number[];
  x: number;
  y: number;
  rotation: number;
  /** True when the monster turned without moving (blocked or idle). */
  idle: boolean;
}

export interface WanderOptions {
  /** Chance (0..1) that a monster stands still this tick. Default 0.25. */
  idleChance?: number;
  /** Maximum steps per tick (1..15). Default 3. */
  maxSteps?: number;
  /** Direction pool; defaults to all eight compass directions. */
  directions?: readonly number[];
}

/**
 * Moves every monster/NPC one small step.
 *
 * Each monster picks a direction and a step count, and the movement goes through `World.move`, so
 * bounds and step limits are enforced exactly like they are for a player: a monster that would leave
 * the map simply turns around instead of walking off it.
 */
export function wanderNpcs(world: World, rng: RandomFn = Math.random, options: WanderOptions = {}): NpcStep[] {
  const idleChance = options.idleChance ?? 0.25;
  const maxSteps = options.maxSteps ?? 3;
  const pool = options.directions ?? [0, 1, 2, 3, 4, 5, 6, 7];
  const steps: NpcStep[] = [];

  for (const npc of world.all()) {
    if (npc.kind !== 'npc') continue;

    if (rng() < idleChance) {
      steps.push({ npc, directions: [], x: npc.x, y: npc.y, rotation: npc.rotation, idle: true });
      continue;
    }

    const count = 1 + Math.floor(rng() * maxSteps);
    const candidates: number[][] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const direction = pool[Math.floor(rng() * pool.length)] ?? 0;
      candidates.push(new Array(count).fill(direction & 0x7));
    }

    let moved = false;
    // three attempts with fresh directions, so a monster pressed against the map border still moves
    for (let attempt = 0; attempt < candidates.length && !moved; attempt++) {
      const directions = candidates[attempt]!;
      const result = world.move(npc.id, directions);
      if (!result.ok) continue;
      moved = true;
      steps.push({ npc, directions, x: result.x, y: result.y, rotation: result.rotation, idle: false });
    }

    if (!moved) {
      steps.push({ npc, directions: [], x: npc.x, y: npc.y, rotation: npc.rotation, idle: true });
    }
  }

  return steps;
}
