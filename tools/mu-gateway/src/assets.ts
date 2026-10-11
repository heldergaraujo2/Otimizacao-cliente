/**
 * Static asset serving for the gateway.
 *
 * The browser cannot read a local directory, so when the gateway is started with `--data-dir <path>`
 * it also serves that directory over HTTP under `/assets/`. Requests are resolved through the same
 * `ResourceLoader` used by the node tools, which means: case-insensitive matching (Windows data
 * trees), no path traversal, and a clear 404 that lists close candidates so the user can see what is
 * actually inside the data directory.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname } from 'node:path';

import { ResourceLoader, ResourceNotFoundError } from '@mu-reengineer/client';

const CONTENT_TYPES: Record<string, string> = {
  '.json': 'application/json',
  '.bmd': 'application/octet-stream',
  '.att': 'application/octet-stream',
  '.map': 'application/octet-stream',
  '.obj': 'application/octet-stream',
  '.ozt': 'application/octet-stream',
  '.ozb': 'application/octet-stream',
  '.ozj': 'application/octet-stream',
  '.dds': 'application/octet-stream',
  '.tga': 'application/octet-stream',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

export const ASSET_PREFIX = '/assets/';

export interface AssetServerOptions {
  loader: ResourceLoader;
  /** CORS origin for the assets (the client page is same-origin in dev, this covers split hosting). */
  allowOrigin?: string;
  /** Counters for `/health`; files are streamed, so `ResourceLoader` statistics stay untouched. */
  stats?: { served: number; bytes: number };
  log?: (message: string) => void;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = Buffer.from(JSON.stringify(body, null, 2), 'utf8');
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': payload.length });
  response.end(payload);
}

/**
 * Handles a request if it targets `/assets/`; returns `true` when it took ownership of the response.
 *
 * - `GET /assets/` and `GET /assets` → JSON index of the data directory (capped) plus loader stats
 * - `GET /assets/<path>` → the raw file bytes (case-insensitive resolution, cache headers)
 */
export async function handleAssetRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: AssetServerOptions,
): Promise<boolean> {
  const url = request.url ?? '/';
  const path = url.split('?')[0] ?? '/';
  if (path !== '/assets' && !path.startsWith(ASSET_PREFIX)) return false;

  const log = options.log ?? (() => {});
  const headers: Record<string, string> = {};
  if (options.allowOrigin) headers['access-control-allow-origin'] = options.allowOrigin;

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendJson(response, 405, { error: 'method not allowed' });
    return true;
  }

  const relative = decodeURIComponent(path.slice(ASSET_PREFIX.length));
  try {
    if (relative === '' || relative === '/') {
      const files = await options.loader.list('.', 2000);
      sendJson(response, 200, {
        root: options.loader.root,
        count: files.length,
        files,
        stats: options.loader.stats,
        served: options.stats?.served ?? 0,
      });
      return true;
    }

    const resolved = await options.loader.resolve(relative);
    const info = await stat(resolved);
    if (!info.isFile()) {
      sendJson(response, 404, { error: 'not a file', path: relative });
      return true;
    }
    const type = CONTENT_TYPES[extname(resolved).toLowerCase()] ?? 'application/octet-stream';
    response.writeHead(200, {
      ...headers,
      'content-type': type,
      'content-length': info.size,
      'cache-control': 'no-cache',
    });
    if (request.method === 'HEAD') {
      response.end();
      return true;
    }
    if (options.stats) {
      options.stats.served += 1;
      options.stats.bytes += info.size;
    }
    log(`serve asset ${relative} (${info.size} B)`);
    createReadStream(resolved).pipe(response);
    return true;
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      sendJson(response, 404, { error: error.message, candidates: error.candidates });
      return true;
    }
    sendJson(response, 400, { error: (error as Error).message });
    return true;
  }
}
