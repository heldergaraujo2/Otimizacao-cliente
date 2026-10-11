/**
 * `inspect` / `bmd-info` / `terrain-info`: identify what a file is and summarise its structure
 * without writing anything. Every reader comes from @mu-reengineer/formats, so the CLI can never
 * disagree with the tests about what a format is.
 */

import {
  countFlag,
  decodeDds,
  decodeOzb,
  decodeOzt,
  decodeTga,
  detectTextureFormat,
  inspectOzj,
  modulusCryptorMagic,
  parseAtt,
  parseBmd,
  parseMap,
  parseObj,
  summarizeBmd,
  TILE_COUNT,
  TwFlags,
} from '@mu-reengineer/formats';

import { extensionOf, formatBytes, hexPreview, readBytes } from '../fs-utils.js';

export interface InspectionResult {
  file: string;
  size: number;
  format: string;
  details: Record<string, unknown>;
  notes: string[];
}

function textureDetails(file: string, data: Uint8Array): Record<string, unknown> | undefined {
  const hint = detectTextureFormat(data, file);
  if (!hint) return undefined;
  switch (hint) {
    case 'ozt': {
      const image = decodeOzt(data);
      return { kind: 'ozt', width: image.width, height: image.height, bytes: image.rgba.length };
    }
    case 'ozb': {
      const image = decodeOzb(data);
      return { kind: 'ozb', width: image.width, height: image.height, bytes: image.rgba.length };
    }
    case 'tga': {
      const image = decodeTga(data);
      return { kind: 'tga', width: image.width, height: image.height, bytes: image.rgba.length };
    }
    case 'dds': {
      const image = decodeDds(data);
      return { kind: 'dds', width: image.width, height: image.height, bytes: image.rgba.length };
    }
    case 'ozj': {
      const info = inspectOzj(data);
      return {
        kind: 'ozj',
        jpegOffset: info.jpegOffset,
        jpegBytes: info.jpeg.length,
        topDownSort: info.topDownSort,
        note: 'JPEG payload is extracted by `export-png`; decoding is delegated to a host decoder',
      };
    }
  }
}

/** Attempts the terrain readers in a fixed order and reports what worked and what did not. */
function terrainDetails(data: Uint8Array): { format: string; details: Record<string, unknown>; notes: string[] } {
  const notes: string[] = [];
  const magic = modulusCryptorMagic(data);

  if (data.length === TILE_COUNT + 4 || data.length === TILE_COUNT * 2 + 4 || magic === 'ATT\u0001') {
    const att = parseAtt(data);
    notes.push(`cipher=${att.cipher}`);
    notes.push(
      'flags: ' +
        [
          ['safeZone', TwFlags.SafeZone],
          ['noMove', TwFlags.NoMove],
          ['water', TwFlags.Water],
          ['noGround', TwFlags.NoGround],
          ['noAttackZone', TwFlags.NoAttackZone],
        ]
          .map(([name, flag]) => `${name}=${countFlag(att.attributes, flag as number)}`)
          .join(' '),
    );
    return {
      format: 'att',
      details: {
        version: att.version,
        index: att.index,
        size: `${att.width + 1}x${att.height + 1} tiles (header reports ${att.width}x${att.height})`,
        extended: att.isExtended,
        cipher: att.cipher,
      },
      notes,
    };
  }

  if (magic === 'MAP\u0001' || data.length === 2 + TILE_COUNT * 3 || (data.length >= 2 + TILE_COUNT * 3 && data.length < 4 * TILE_COUNT * 3)) {
    const map = parseMap(data);
    notes.push(`cipher=${map.cipher}`);
    return {
      format: 'map',
      details: { version: map.version ?? 0, mapNumber: map.mapNumber, tiles: TILE_COUNT, cipher: map.cipher },
      notes,
    };
  }

  const obj = parseObj(data);
  notes.push('cipher=filecryptor');
  return {
    format: 'obj',
    details: { version: obj.version, mapNumber: obj.mapNumber, objects: obj.objects.length },
    notes,
  };
}

export function inspectBytes(file: string, data: Uint8Array): InspectionResult {
  const notes: string[] = [];

  if (data.length >= 4 && data[0] === 0x42 && data[1] === 0x4d && data[2] === 0x44) {
    const model = parseBmd(data);
    const summary = summarizeBmd(model);
    return {
      file,
      size: data.length,
      format: `bmd v${model.version}`,
      details: {
        name: model.name,
        meshes: summary.meshes,
        vertices: summary.vertices,
        triangles: summary.triangles,
        bones: model.bones.length,
        actions: model.actions.length,
        animationKeys: model.actions.reduce((sum, action) => sum + action.numAnimationKeys, 0),
        textures: summary.textures,
        encryptedPayloadSize: model.encryptedPayloadSize,
      },
      notes,
    };
  }

  const texture = textureDetails(file, data);
  if (texture) {
    for (const [key, value] of Object.entries(texture)) {
      if (key === 'note' && typeof value === 'string') notes.push(value);
    }
    return { file, size: data.length, format: String(texture.kind), details: texture, notes };
  }

  try {
    const terrain = terrainDetails(data);
    return { file, size: data.length, format: terrain.format, details: terrain.details, notes: terrain.notes };
  } catch (error) {
    notes.push(`terrain readers failed: ${(error as Error).message}`);
  }

  return {
    file,
    size: data.length,
    format: 'unknown',
    details: { extension: extensionOf(file), head: hexPreview(data) },
    notes,
  };
}

export async function inspectFile(file: string): Promise<InspectionResult> {
  return inspectBytes(file, await readBytes(file));
}

export function formatInspection(result: InspectionResult): string[] {
  const lines: string[] = [];
  lines.push(`${result.file}  (${formatBytes(result.size)})`);
  lines.push(`  format: ${result.format}`);
  for (const [key, value] of Object.entries(result.details)) {
    if (key === 'note') continue;
    lines.push(`  ${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`);
  }
  for (const note of result.notes) lines.push(`  · ${note}`);
  return lines;
}
