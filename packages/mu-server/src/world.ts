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
    const full: WorldCharacter = { ...character, id };
    this.characters.set(id, full);
    return full;
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
