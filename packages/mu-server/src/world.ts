/**
 * Server-side world state.
 *
 * The server is authoritative: positions only change through {@link World.move}, which validates the
 * step count, the directions and the map bounds. Clients never dictate a final position, they propose
 * a movement and the server decides whether it happened.
 *
 * The movement computation itself lives in `@mu-reengineer/protocol` ({@link applyWalk}) so the client
 * prediction and the server validation cannot drift apart; this module only adds the authoritative
 * state (who is where, who sees whom).
 */

import { applyWalk, DIRECTION_OFFSETS, MAX_WALK_STEPS, MAP_SIZE } from '@mu-reengineer/protocol';

export { DIRECTION_OFFSETS, MAX_WALK_STEPS, MAP_SIZE };

export const DEFAULT_SCOPE_RANGE = 10;

/** What an object in the world is: a player character or a monster/NPC. */
export type WorldObjectKind = 'player' | 'npc';

export interface WorldCharacter {
  /** Server-assigned object id (u16 on the wire). */
  id: number;
  account: string;
  name: string;
  mapId: number;
  x: number;
  y: number;
  rotation: number;
  level: number;
  appearance: Uint8Array;
  heroState: number;
  /** Defaults to 'player' — monsters/NPCs are stored in the same map so scope logic stays uniform. */
  kind?: WorldObjectKind;
  /** Monster/NPC type number as the client knows it (packet field `TypeNumber`). */
  typeNumber?: number;
  /** Where a monster/NPC spawned; the wander keeps it near this point. */
  homeX?: number;
  homeY?: number;
}

/** True for monsters/NPCs (they travel in `AddNpcsToScope`, players in `AddCharactersToScope`). */
export function isNpc(object: WorldCharacter): boolean {
  return object.kind === 'npc';
}

export interface NpcSpawn {
  typeNumber: number;
  name: string;
  x: number;
  y: number;
  rotation?: number;
  mapId?: number;
}

export interface MoveResult {
  ok: boolean;
  reason?: string;
  x: number;
  y: number;
  rotation: number;
  steps: number;
}

export class World {
  private readonly characters = new Map<number, WorldCharacter>();
  private nextId = 1;

  add(character: Omit<WorldCharacter, 'id'>): WorldCharacter {
    const id = this.nextId++;
    const full: WorldCharacter = { ...character, kind: character.kind ?? 'player', id };
    this.characters.set(id, full);
    return full;
  }

  /**
   * Spawns monsters/NPCs around the map. They are ordinary world objects (so scope, distance and
   * removal work identically for them) which differ only in the packet used to describe them.
   */
  spawnNpcs(spawns: readonly NpcSpawn[]): WorldCharacter[] {
    return spawns.map((spawn) =>
      this.add({
        account: '',
        name: spawn.name,
        mapId: spawn.mapId ?? 0,
        x: spawn.x,
        y: spawn.y,
        rotation: spawn.rotation ?? 0,
        level: 1,
        appearance: new Uint8Array(18),
        heroState: 0,
        kind: 'npc',
        typeNumber: spawn.typeNumber,
        homeX: spawn.x,
        homeY: spawn.y,
      }),
    );
  }

  /** The default demo population: a handful of monsters near the spawn point (map 0, 125/125). */
  spawnDemoNpcs(): WorldCharacter[] {
    return this.spawnNpcs([
      { typeNumber: 0x0001, name: 'Budge Dragon', x: 132, y: 122, rotation: 5 },
      { typeNumber: 0x0002, name: 'Budge Dragon', x: 118, y: 130, rotation: 1 },
      { typeNumber: 0x0003, name: 'Spider', x: 129, y: 131, rotation: 7 },
      { typeNumber: 0x0004, name: 'Spider', x: 121, y: 119, rotation: 3 },
      { typeNumber: 0x0100, name: 'Guard (Lorencia)', x: 124, y: 126, rotation: 4 },
    ]);
  }

  remove(id: number): boolean {
    return this.characters.delete(id);
  }

  get(id: number): WorldCharacter | undefined {
    return this.characters.get(id);
  }

  all(): WorldCharacter[] {
    return [...this.characters.values()];
  }

  byAccount(account: string): WorldCharacter | undefined {
    return this.all().find((character) => character.account === account);
  }

  /** Characters on the same map inside the scope box, excluding `selfId`. */
  inScope(selfId: number, range = DEFAULT_SCOPE_RANGE): WorldCharacter[] {
    const self = this.characters.get(selfId);
    if (!self) return [];
    return this.all().filter(
      (other) =>
        other.id !== selfId &&
        other.mapId === self.mapId &&
        Math.abs(other.x - self.x) <= range &&
        Math.abs(other.y - self.y) <= range,
    );
  }

  /**
   * Applies a walk request. `directions` are the raw nibbles from the packet (0..7; the high bit some
   * clients set is ignored). The request is rejected when it is longer than {@link MAX_WALK_STEPS},
   * contains an invalid direction, or leaves the map.
   */
  move(id: number, directions: number[], declaredX?: number, declaredY?: number): MoveResult {
    const character = this.characters.get(id);
    if (!character) {
      return { ok: false, reason: 'character not in world', x: 0, y: 0, rotation: 0, steps: 0 };
    }
    if (directions.length === 0 || directions.length > MAX_WALK_STEPS) {
      return { ok: false, reason: `invalid step count ${directions.length}`, x: character.x, y: character.y, rotation: character.rotation, steps: 0 };
    }
    if (declaredX !== undefined && declaredX !== character.x) {
      return { ok: false, reason: `declared x ${declaredX} != server x ${character.x}`, x: character.x, y: character.y, rotation: character.rotation, steps: 0 };
    }
    if (declaredY !== undefined && declaredY !== character.y) {
      return { ok: false, reason: `declared y ${declaredY} != server y ${character.y}`, x: character.x, y: character.y, rotation: character.rotation, steps: 0 };
    }

    // same computation the client uses for prediction — one implementation, two callers
    const outcome = applyWalk(character.x, character.y, character.rotation, directions);
    if (!outcome.ok) {
      return { ok: false, reason: outcome.reason, x: character.x, y: character.y, rotation: character.rotation, steps: 0 };
    }

    character.x = outcome.x;
    character.y = outcome.y;
    character.rotation = outcome.rotation;
    return { ok: true, x: outcome.x, y: outcome.y, rotation: outcome.rotation, steps: outcome.steps };
  }
}
