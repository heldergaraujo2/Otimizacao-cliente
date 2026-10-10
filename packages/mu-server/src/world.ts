/**
 * Server-side world state.
 *
 * The server is authoritative: positions only change through {@link World.move}, which validates the
 * step count, the directions and the map bounds. Clients never dictate a final position, they propose
 * a movement and the server decides whether it happened.
 */

/**
 * Step offsets for the 8 movement directions.
 *
 * Convention used by this implementation (x grows east, y grows south, "north" is -y):
 *   0 = north (0,-1) · 1 = north-east (1,-1) · 2 = east (1,0) · 3 = south-east (1,1)
 *   4 = south (0,1)  · 5 = south-west (-1,1) · 6 = west (-1,0) · 7 = north-west (-1,-1)
 *
 * IMPORTANT: the numeric mapping is our interpretation of the reference client's walk encoding. It is
 * deterministic and tested here, but must still be validated against the real client (see
 * docs/COMPATIBILITY.md "open compatibility questions"). Only the mapping *inside* the server depends
 * on it: bounds/authority checks hold regardless.
 */
export const DIRECTION_OFFSETS: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
] as const;

export const MAP_SIZE = 256;
export const MAX_WALK_STEPS = 15;
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

    let x = character.x;
    let y = character.y;
    let rotation = character.rotation;
    for (const raw of directions) {
      const direction = raw & 0x7;
      const offset = DIRECTION_OFFSETS[direction];
      if (!offset) {
        return { ok: false, reason: `invalid direction ${raw}`, x, y, rotation, steps: 0 };
      }
      x += offset[0];
      y += offset[1];
      rotation = direction;
    }

    if (x < 0 || y < 0 || x >= MAP_SIZE || y >= MAP_SIZE) {
      return { ok: false, reason: `movement leaves the map (${x},${y})`, x: character.x, y: character.y, rotation: character.rotation, steps: 0 };
    }

    character.x = x;
    character.y = y;
    character.rotation = rotation;
    return { ok: true, x, y, rotation, steps: directions.length };
  }
}
