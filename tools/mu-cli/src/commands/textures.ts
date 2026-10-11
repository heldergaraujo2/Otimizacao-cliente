/**
 * `export-png <file> <out>`: decodes a texture and writes a PNG (or extracts the embedded JPEG of an
 * .ozj container). Useful to eyeball assets without the game.
 */

import { decodeDds, decodeOzb, decodeOzt, decodeTga, detectTextureFormat, inspectOzj } from '@mu-reengineer/formats';
import { encodePng } from '@mu-reengineer/formats/png';

import { formatBytes, readBytes, writeBytes } from '../fs-utils.js';

export interface ExportResult {
  source: string;
  output: string;
  format: string;
  width?: number;
  height?: number;
  bytes: number;
  note?: string;
}

export async function exportTexture(source: string, output: string): Promise<ExportResult> {
  const data = await readBytes(source);
  const hint = detectTextureFormat(data, source);
  if (!hint) throw new Error(`unsupported texture (no signature and unknown extension): ${source}`);

  if (hint === 'ozj') {
    const info = inspectOzj(data);
    const target = output.replace(/\.[^.]+$/, '') + '.jpg';
    await writeBytes(target, info.jpeg);
    return {
      source,
      output: target,
      format: 'ozj',
      bytes: info.jpeg.length,
      note: `embedded JPEG extracted at offset ${info.jpegOffset} (bytes: ${formatBytes(info.jpeg.length)}); JPEG decoding is delegated to a host decoder`,
    };
  }

  const image = hint === 'ozt' ? decodeOzt(data) : hint === 'ozb' ? decodeOzb(data) : hint === 'tga' ? decodeTga(data) : decodeDds(data);
  const png = encodePng(image);
  await writeBytes(output, png);
  return { source, output, format: hint, width: image.width, height: image.height, bytes: png.length };
}

export function formatExport(result: ExportResult): string[] {
  const lines = [
    `${result.source} → ${result.output}`,
    `  format: ${result.format}${result.width ? `  ${result.width}x${result.height}` : ''}  ${formatBytes(result.bytes)}`,
  ];
  if (result.note) lines.push(`  · ${result.note}`);
  return lines;
}
