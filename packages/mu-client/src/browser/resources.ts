/**
 * Browser resource access.
 *
 * The page cannot read a directory, so real data arrives over HTTP from the gateway (`/assets/…`,
 * see `tools/mu-gateway/src/assets.ts`) using the same relative-URL trick as the WebSocket: if the
 * gateway has no data directory the calls fail and the renderer keeps its deterministic fixtures.
 * Decoding uses exactly the same `mu-formats` readers as the node side.
 */

import { decodeDds, decodeOzb, decodeOzt, decodeTga, inspectOzj, parseAtt, parseBmd, parseMap, parseObj, type AttData, type BmdModel, type DecodedImage, type MapData, type ObjData } from '@mu-reengineer/formats';

import { DEFAULT_PATHS } from '../resources/paths.js';

export interface AssetSource {
  baseUrl: string;
}

export interface AssetIndex {
  root: string;
  count: number;
  files: string[];
}

export async function fetchAsset(source: AssetSource, relative: string): Promise<Uint8Array> {
  const response = await fetch(`${source.baseUrl}/assets/${encodeURI(relative)}`);
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`asset ${relative}: HTTP ${response.status} ${detail.slice(0, 200)}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/** Returns the data directory index, or `undefined` when the gateway serves no data directory. */
export async function fetchAssetIndex(source: AssetSource): Promise<AssetIndex | undefined> {
  try {
    const response = await fetch(`${source.baseUrl}/assets/`);
    if (!response.ok) return undefined;
    return (await response.json()) as AssetIndex;
  } catch {
    return undefined;
  }
}

export interface AssetTerrain {
  att: AttData;
  map: MapData;
  obj: ObjData;
  paths: { att: string; map: string; obj: string };
}

/** Loads the world's available Tile* images in natural filename order.
 *
 * This is a practical fallback for data-only packages: the original client has a per-world
 * texture table, but that table is not present as a separate file in many distributions.
 * Keep failed decodes as empty slots so MAP texture indices remain stable.
 */
export async function fetchWorldTileTextures(
  source: AssetSource,
  worldIndex: number,
  files: string[],
): Promise<Array<DecodedImage | undefined>> {
  const prefix = `World${worldIndex}/`;
  const candidates = files.filter((file) =>
    file.replace(/\\/g, '/').toLowerCase().startsWith(prefix.toLowerCase()) &&
    /\/Tile[^/]+\.(ozj|ozt|ozb|tga|dds)$/i.test(file.replace(/\\/g, '/')),
  );
  // Prefer OZJ when the same base name also exists as OZT; sort numerically (01, 02, …, 10).
  const byStem = new Map<string, string>();
  for (const file of candidates.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
    const normalized = file.replace(/\\/g, '/');
    const stem = normalized.slice(0, normalized.lastIndexOf('.')).toLowerCase();
    const existing = byStem.get(stem);
    if (!existing || (existing.toLowerCase().endsWith('.ozt') && normalized.toLowerCase().endsWith('.ozj'))) {
      byStem.set(stem, normalized);
    }
  }
  const paths = [...byStem.values()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return Promise.all(paths.map(async (path) => {
    try {
      return await fetchTextureImage(source, path);
    } catch (error) {
      console.warn(`[terrain] texture unavailable: ${path}`, error);
      return undefined;
    }
  }));
}

/** Loads a terrain bundle for a world index through the gateway asset route. */
export async function fetchTerrain(source: AssetSource, worldIndex: number): Promise<AssetTerrain> {
  const paths = { att: DEFAULT_PATHS.att(worldIndex), map: DEFAULT_PATHS.map(worldIndex), obj: DEFAULT_PATHS.obj(worldIndex) };
  const [attBytes, mapBytes, objBytes] = await Promise.all([
    fetchAsset(source, paths.att),
    fetchAsset(source, paths.map),
    fetchAsset(source, paths.obj),
  ]);
  return { att: parseAtt(attBytes), map: parseMap(mapBytes), obj: parseObj(objBytes), paths };
}

export async function fetchModel(source: AssetSource, relative: string): Promise<BmdModel> {
  return parseBmd(await fetchAsset(source, relative));
}


/**
 * Resolve the first mesh's BMD texture path against the gateway index without assuming the
 * Windows data tree's filename casing. If the index is capped or incomplete, the caller can still
 * try the returned relative path directly; the gateway itself resolves case-insensitively.
 */
export function resolveModelTexturePath(texturePath: string, files: string[]): string | undefined {
  const normalize = (value: string): string =>
    value.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^data\//i, '').replace(/^\/+/, '').trim();
  const original = normalize(texturePath);
  if (!original) return undefined;

  const dot = original.lastIndexOf('.');
  const stem = dot > original.lastIndexOf('/') ? original.slice(0, dot) : original;
  const extension = dot > original.lastIndexOf('/') ? original.slice(dot).toLowerCase() : '';
  const extensions = extension
    ? [extension, '.ozt', '.ozj', '.tga', '.dds', '.ozb']
    : ['.ozt', '.ozj', '.tga', '.dds', '.ozb'];
  const candidates = [...new Set(extensions.map((ext) => `${stem}${ext}`))];
  const indexed = new Map(files.map((file) => [normalize(file).toLowerCase(), file]));
  for (const candidate of candidates) {
    const match = indexed.get(candidate.toLowerCase());
    if (match) return match;
  }
  return original;
}

/** Loads the pixel formats currently supported by the shared resource decoders. */
export async function fetchTextureImage(source: AssetSource, relative: string): Promise<DecodedImage> {
  const lower = relative.toLowerCase();
  if (lower.endsWith('.ozt')) return decodeOzt(await fetchAsset(source, relative));
  if (lower.endsWith('.ozb')) return decodeOzb(await fetchAsset(source, relative));
  if (lower.endsWith('.tga')) return decodeTga(await fetchAsset(source, relative));
  if (lower.endsWith('.dds')) return decodeDds(await fetchAsset(source, relative));
  if (lower.endsWith('.ozj')) {
    const container = inspectOzj(await fetchAsset(source, relative));
    const jpegBuffer = container.jpeg.slice().buffer as ArrayBuffer;
    const bitmap = await createImageBitmap(new Blob([jpegBuffer], { type: 'image/jpeg' }));
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('canvas 2D context is unavailable for OZJ decoding');
      context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height);
      return { width: bitmap.width, height: bitmap.height, rgba: new Uint8Array(pixels.data), format: 'ozj/jpeg' };
    } finally {
      bitmap.close();
    }
  }
  throw new Error(`unsupported browser texture format: ${relative} (supported: .ozt, .ozb, .ozj, .tga, .dds)`);
}
