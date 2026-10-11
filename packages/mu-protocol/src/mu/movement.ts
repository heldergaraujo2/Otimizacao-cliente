/**
 * Movement model shared by the client and the server.
 *
 * The 8-way walking encoding is wire-format knowledge, so it lives in the protocol package and is used
 * by both ends: the client predicts locally with {@link applyWalk} and the server validates the exact
 * same computation before accepting a move. Duplicating it on one side only would make them disagree
 * silently — the failure mode that produced the "declared position" rejections during development.
 *
 * Direction numbering (x grows east, y grows south, so "north" is -y):
 *   0 = north (0,-1) · 1 = north-east (1,-1) · 2 = east (1,0) · 3 = south-east (1,1)
 *   4 = south (0,1)  · 5 = south-west (-1,1) · 6 = west (-1,0) · 7 = north-west (-1,-1)
 *
 * IMPORTANT: the numeric mapping is this project's documented interpretation of the reference client's
 * walk encoding (see `docs/COMPATIBILITY.md`, "open compatibility questions"). Authority checks hold
 * regardless of the mapping, but it must be validated against a real client with a packet capture.
 */

/** Step offsets for the 8 movement directions, indexed by the direction nibble. */
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

/** A walk request carries at most 15 steps (the count lives in a nibble) and at least one. */
export const MAX_WALK_STEPS = 15;

/** Map edge: positions are bytes, so 0..255 are valid. */
export const MAP_SIZE = 256;

export interface WalkOutcome {
  ok: boolean;
  /** Rejection reason (only set when `ok` is false). */
  reason?: string;
  /** Resulting position; unchanged from the input when the walk is rejected. */
  x: number;
  y: number;
  /** Rotation after the walk (= last direction), or the input rotation when rejected. */
  rotation: number;
  /** Number of steps applied (0 when rejected). */
  steps: number;
}

/**
 * Applies a walk to a position without any side effect — the single implementation used by the client
 * (prediction) and the server (validation).
 *
 * Rejects empty lists, more than {@link MAX_WALK_STEPS} steps and moves that leave the map. The high
 * bit some clients set on a direction nibble is ignored (only the low 3 bits are used).
 */
export function applyWalk(
  x: number,
  y: number,
  rotation: number,
  directions: readonly number[],
  mapSize = MAP_SIZE,
): WalkOutcome {
  if (directions.length === 0 || directions.length > MAX_WALK_STEPS) {
    return { ok: false, reason: `invalid step count ${directions.length}`, x, y, rotation, steps: 0 };
  }

  let nextX = x;
  let nextY = y;
  let nextRotation = rotation;
  for (const raw of directions) {
    const direction = raw & 0x7;
    const offset = DIRECTION_OFFSETS[direction];
    if (!offset) {
      return { ok: false, reason: `invalid direction ${raw}`, x, y, rotation, steps: 0 };
    }
    nextX += offset[0];
    nextY += offset[1];
    nextRotation = direction;
  }

  if (nextX < 0 || nextY < 0 || nextX >= mapSize || nextY >= mapSize) {
    return { ok: false, reason: `movement leaves the map (${nextX},${nextY})`, x, y, rotation, steps: 0 };
  }

  return { ok: true, x: nextX, y: nextY, rotation: nextRotation, steps: directions.length };
}
