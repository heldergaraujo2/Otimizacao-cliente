/**
 * `scan <dir>`: classifies a whole game-data directory. This is the tool the user runs against their
 * own MU installation to produce the real-data conformance report that the sandbox cannot generate
 * (no proprietary data here). It never writes into the scanned directory.
 */

import path from 'node:path';

import { extensionOf, formatBytes, listFiles, readBytes } from '../fs-utils.js';
import { inspectBytes } from './inspect.js';

export interface ScanEntry {
  file: string;
  relativePath: string;
  size: number;
  format: string;
  ok: boolean;
  error?: string;
  details?: Record<string, unknown>;
}

export interface ScanReport {
  root: string;
  scanned: number;
  ok: number;
  failed: number;
  byFormat: Record<string, number>;
  byExtension: Record<string, { count: number; failed: number }>;
  errors: { file: string; error: string }[];
  bmdVersions: Record<string, number>;
  ciphers: Record<string, number>;
  entries: ScanEntry[];
}

const INTERESTING = new Set(['bmd', 'ozt', 'ozb', 'ozj', 'tga', 'dds', 'att', 'map', 'obj']);

export async function scanDirectory(root: string, options: { limit?: number; onlyInteresting?: boolean } = {}): Promise<ScanReport> {
  const files = await listFiles(root);
  const report: ScanReport = {
    root,
    scanned: 0,
    ok: 0,
    failed: 0,
    byFormat: {},
    byExtension: {},
    errors: [],
    bmdVersions: {},
    ciphers: {},
    entries: [],
  };

  for (const file of files) {
    const extension = extensionOf(file);
    if (options.onlyInteresting !== false && !INTERESTING.has(extension)) continue;
    if (options.limit !== undefined && report.scanned >= options.limit) break;

    report.scanned += 1;
    const relativePath = path.relative(root, file).split(path.sep).join('/');
    const extensionBucket = (report.byExtension[extension] ??= { count: 0, failed: 0 });
    extensionBucket.count += 1;

    let entry: ScanEntry;
    try {
      const data = await readBytes(file);
      const inspection = inspectBytes(file, data);
      entry = { file, relativePath, size: data.length, format: inspection.format, ok: inspection.format !== 'unknown', details: inspection.details };
      if (!entry.ok) {
        entry.error = 'no implemented reader recognised this file';
      } else {
        report.ok += 1;
        report.byFormat[inspection.format] = (report.byFormat[inspection.format] ?? 0) + 1;
        const version = /^bmd v(\d+)$/.exec(inspection.format);
        if (version) report.bmdVersions[version[1]!] = (report.bmdVersions[version[1]!] ?? 0) + 1;
        const cipher = (inspection.details as { cipher?: string }).cipher;
        if (cipher) report.ciphers[cipher] = (report.ciphers[cipher] ?? 0) + 1;
      }
    } catch (error) {
      entry = { file, relativePath, size: 0, format: 'error', ok: false, error: (error as Error).message };
    }

    if (!entry.ok) {
      report.failed += 1;
      extensionBucket.failed += 1;
      if (report.errors.length < 40) report.errors.push({ file: relativePath, error: entry.error ?? 'unknown error' });
    }
    report.entries.push(entry);
  }

  return report;
}

export function formatScanReport(report: ScanReport): string[] {
  const lines: string[] = [];
  lines.push(`scan of ${report.root}`);
  lines.push(`  files scanned: ${report.scanned}  (ok: ${report.ok}, failed: ${report.failed})`);
  lines.push(`  by format: ${Object.entries(report.byFormat).map(([k, v]) => `${k}=${v}`).join(' ') || '-'}`);
  if (Object.keys(report.bmdVersions).length > 0) {
    lines.push(`  bmd versions: ${Object.entries(report.bmdVersions).map(([k, v]) => `v${k}=${v}`).join(' ')}`);
  }
  if (Object.keys(report.ciphers).length > 0) {
    lines.push(`  terrain ciphers: ${Object.entries(report.ciphers).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  }
  lines.push('  by extension:');
  for (const [extension, bucket] of Object.entries(report.byExtension)) {
    lines.push(`    .${extension.padEnd(5)} ${String(bucket.count).padStart(6)} files, ${bucket.failed} unreadable`);
  }
  if (report.errors.length > 0) {
    lines.push(`  first errors (${report.errors.length} shown, max 40):`);
    for (const error of report.errors) lines.push(`    ${error.file}: ${error.error}`);
  }
  const bytes = report.entries.reduce((sum, entry) => sum + entry.size, 0);
  lines.push(`  total size of scanned files: ${formatBytes(bytes)}`);
  return lines;
}
