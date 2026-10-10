/**
 * Filesystem helpers for the CLI. Kept tiny and dependency-free on purpose: the tool must run with
 * nothing but Node built-ins so it works on a machine that only has this repository and the user's
 * own game data.
 */

import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function readBytes(file: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(file));
}

export async function writeBytes(file: string, data: Uint8Array): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data);
}

/** Writes UTF-8 text, creating the parent directory (used by the OBJ exporter). */
export async function writeText(file: string, text: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, 'utf8');
}

const DEFAULT_SKIP = new Set(['node_modules', '.git', '.svn', 'dist']);

/** Recursively lists files, skipping VCS/build directories. Deterministic order (sorted). */
export async function listFiles(root: string, skip: Set<string> = DEFAULT_SKIP): Promise<string[]> {
  const rootInfo = await stat(root);
  if (rootInfo.isFile()) return [root];

  const out: string[] = [];
  const entries = (await readdir(root, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (skip.has(entry.name)) continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(full, skip)));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

export function hexPreview(data: Uint8Array, count = 32): string {
  const slice = data.subarray(0, Math.min(count, data.length));
  const hex = [...slice].map((b) => b.toString(16).padStart(2, '0')).join(' ');
  return data.length > count ? `${hex} …` : hex;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

export function extensionOf(file: string): string {
  const base = path.basename(file).toLowerCase();
  const index = base.lastIndexOf('.');
  return index <= 0 ? '' : base.slice(index + 1);
}
