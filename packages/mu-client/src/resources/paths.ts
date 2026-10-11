/**
 * Shared, browser-safe paths for the classic MU terrain bundle.
 *
 * Keep this module free of Node.js imports: both the filesystem loader and browser resource
 * client use these defaults, but only the filesystem loader may import node:fs or node:path.
 */
export const DEFAULT_PATHS = {
  att: (worldIndex: number): string => `World${worldIndex}/EncTerrain${worldIndex}.att`,
  map: (worldIndex: number): string => `World${worldIndex}/EncTerrain${worldIndex}.map`,
  obj: (worldIndex: number): string => `World${worldIndex}/EncTerrain${worldIndex}.obj`,
} as const;
