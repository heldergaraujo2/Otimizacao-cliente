/**
 * Resource loader for a real MU data directory (node side).
 *
 * Two problems it solves, both motivated by measurements and by the reality of Windows game data:
 *
 * 1. **Cost.** LEA-256 decryption of v15 models runs at ~22.8k op/s (`docs/PERFORMANCE.md`), so the
 *    same file must not be decrypted twice in a session — the cache is keyed by *resolved path + size +
 *    mtime*, so it cannot serve stale bytes after the user replaces a file.
 * 2. **Case and layout.** Data trees copied from Windows are case-insensitive and loosely organised;
 *    resolution walks the path segment by segment and matches case-insensitively, reporting close
 *    candidates when a file is missing.
 *
 * Only this module touches the filesystem, and it never leaves {@link ResourceLoader.root}.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative as relativePath, resolve as resolvePath, sep } from 'node:path';

import {
  decodeDds,
  decodeOzb,
  decodeOzt,
  decodeTga,
  parseAtt,
  parseBmd,
  parseMap,
  parseObj,
  type AttData,
  type BmdModel,
  type DecodedImage,
  type MapData,
  type ObjData,
} from '@mu-reengineer/formats';

export class ResourceNotFoundError extends Error {
  readonly candidates: string[];

  constructor(relative: string, candidates: string[] = []) {
    super(
      `resource not found: ${relative}` +
        (candidates.length > 0 ? ` (did you mean: ${candidates.join(', ')}?)` : '') +
        ' — check MU_REENGINEER_DATA / the data directory root',
    );
    this.name = 'ResourceNotFoundError';
    this.candidates = candidates;
  }
}

export interface LoaderStats {
  /** Reads served from the cache. */
  hits: number;
  /** Reads that hit the disk. */
  misses: number;
  /** Files currently cached. */
  entries: number;
  bytesRead: number;
}

interface CacheEntry {
  data: Uint8Array;
  size: number;
  mtimeMs: number;
}

/**
 * Classic server-side data layout. These names are what private-server tools use; if a data tree
 * differs, pass explicit paths instead (the CLI `scan` command lists what is actually there).
 */
export const DEFAULT_PATHS = {
  att: (worldIndex: number): string => `World${worldIndex}/EncTerrain${worldIndex}.att`,
  map: (worldIndex: number): string => `World${worldIndex}/EncTerrain${worldIndex}.map`,
  obj: (worldIndex: number): string => `World${worldIndex}/EncTerrain${worldIndex}.obj`,
} as const;

export interface ResourceLoaderOptions {
  root: string;
  /** Disable the cache (useful to measure the uncached cost). */
  cache?: boolean;
  log?: (message: string) => void;
}

export class ResourceLoader {
  readonly root: string;
  private readonly useCache: boolean;
  private readonly log: (message: string) => void;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly counters = { hits: 0, misses: 0, bytesRead: 0 };

  constructor(options: ResourceLoaderOptions) {
    this.root = resolvePath(options.root);
    this.useCache = options.cache ?? true;
    this.log = options.log ?? (() => {});
  }

  static fromEnvironment(environment: NodeJS.ProcessEnv = process.env): ResourceLoader | undefined {
    const root = environment.MU_REENGINEER_DATA ?? environment.MU_REENGINEER_DATA_DIR;
    return root ? new ResourceLoader({ root }) : undefined;
  }

  get stats(): LoaderStats {
    return {
      hits: this.counters.hits,
      misses: this.counters.misses,
      entries: this.cache.size,
      bytesRead: this.counters.bytesRead,
    };
  }

  clear(): void {
    this.cache.clear();
  }

  /** Resolves a relative path case-insensitively; throws {@link ResourceNotFoundError} otherwise. */
  async resolve(relative: string): Promise<string> {
    const segments = relative.split(/[\\/]+/).filter((segment) => segment.length > 0 && segment !== '.');
    if (segments.length === 0) throw new ResourceNotFoundError(relative);
    if (segments.some((segment) => segment === '..')) {
      throw new Error(`resource path must stay inside the data directory: ${relative}`);
    }

    let current = this.root;
    for (const segment of segments) {
      let entries: string[];
      try {
        entries = await readdir(current);
      } catch {
        throw new ResourceNotFoundError(relative, await this.suggest(relative));
      }
      const exact = entries.includes(segment);
      const match = exact
        ? segment
        : entries.find((entry) => entry.toLowerCase() === segment.toLowerCase());
      if (!match) throw new ResourceNotFoundError(relative, await this.suggest(segment));
      current = join(current, match);
    }
    return current;
  }

  /** Reads a file (cached), re-reading when size or mtime changed. */
  async read(relative: string): Promise<Uint8Array> {
    const path = await this.resolve(relative);
    const info = await stat(path);
    const cached = this.cache.get(path);
    if (this.useCache && cached && cached.size === info.size && cached.mtimeMs === info.mtimeMs) {
      this.counters.hits += 1;
      return cached.data;
    }
    const data = new Uint8Array(await readFile(path));
    this.counters.misses += 1;
    this.counters.bytesRead += data.length;
    this.log(`read ${relative} (${data.length} B)`);
    if (this.useCache) this.cache.set(path, { data, size: info.size, mtimeMs: info.mtimeMs });
    return data;
  }

  /** Lists files below `directory` (breadth-first, capped) — used by `mu-cli scan` style tooling. */
  async list(directory = '.', maxEntries = 5000): Promise<string[]> {
    const start = await this.resolve(directory).catch(() => this.root);
    const found: string[] = [];
    const queue: string[] = [start];
    while (queue.length > 0 && found.length < maxEntries) {
      const current = queue.shift()!;
      for (const entry of await readdir(current, { withFileTypes: true })) {
        const full = join(current, entry.name);
        if (entry.isDirectory()) queue.push(full);
        else found.push(relativePath(this.root, full).split(sep).join('/'));
      }
    }
    return found.sort();
  }

  // --------------------------------------------------------------- typed loads

  loadAtt(relative: string): Promise<AttData> {
    return this.read(relative).then((bytes) => parseAtt(bytes));
  }

  loadMap(relative: string): Promise<MapData> {
    return this.read(relative).then((bytes) => parseMap(bytes));
  }

  loadObj(relative: string): Promise<ObjData> {
    return this.read(relative).then((bytes) => parseObj(bytes));
  }

  loadBmd(relative: string): Promise<BmdModel> {
    return this.read(relative).then((bytes) => parseBmd(bytes));
  }

  /** Loads a texture by extension (OZT/OZB/DDS/TGA); `.ozj` only reports the embedded JPEG window. */
  async loadTexture(relative: string): Promise<DecodedImage> {
    const bytes = await this.read(relative);
    const lower = relative.toLowerCase();
    if (lower.endsWith('.ozt')) return decodeOzt(bytes);
    if (lower.endsWith('.ozb')) return decodeOzb(bytes);
    if (lower.endsWith('.tga')) return decodeTga(bytes);
    if (lower.endsWith('.dds')) return decodeDds(bytes);
    throw new Error(`unsupported texture format: ${relative} (expected .ozt/.ozb/.tga/.dds)`);
  }

  /** Loads a whole terrain bundle (ATT + MAP + OBJ) for a world index. */
  async loadTerrain(worldIndex: number, paths = DEFAULT_PATHS): Promise<{ att: AttData; map: MapData; obj: ObjData }> {
    const [att, map, obj] = await Promise.all([
      this.loadAtt(paths.att(worldIndex)),
      this.loadMap(paths.map(worldIndex)),
      this.loadObj(paths.obj(worldIndex)),
    ]);
    return { att, map, obj };
  }

  /** Suggests files that look like the missing name (helps with renamed data trees). */
  private async suggest(name: string): Promise<string[]> {
    const stem = name.split('.')[0]!.toLowerCase();
    try {
      const files = await this.list('.', 800);
      return files.filter((file) => file.toLowerCase().includes(stem)).slice(0, 3);
    } catch {
      return [];
    }
  }
}

