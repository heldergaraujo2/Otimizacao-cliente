/**
 * Browser resource access.
 *
 * The page cannot read a directory, so real data arrives over HTTP from the gateway (`/assets/…`,
 * see `tools/mu-gateway/src/assets.ts`) using the same relative-URL trick as the WebSocket: if the
 * gateway has no data directory the calls fail and the renderer keeps its deterministic fixtures.
 * Decoding uses exactly the same `mu-formats` readers as the node side.
 */

import { parseAtt, parseBmd, parseMap, parseObj, type AttData, type BmdModel, type MapData, type ObjData } from '@mu-reengineer/formats';

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
