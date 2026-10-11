/**
 * MU Online texture formats: OZJ (JPEG container), OZT (raw BGRA), OZB (BMP variant), plus the
 * plain TGA and DDS files used by modern data packages.
 *
 * Every decoder returns the same DecodedImage shape (RGBA8, top-down) so the client can upload it
 * to the GPU without further branching. JPEG decoding itself is delegated to the host (browser
 * `createImageBitmap`, or the CLI which only reports container information), because the container
 * simply wraps a JPEG stream.
 */

export interface DecodedImage {
  width: number;
  height: number;
  /** RGBA8, top-down (row 0 is the top row). */
  rgba: Uint8Array;
  format: string;
}

export interface OzjInfo {
  /** Offset of the embedded JPEG stream (SOI marker). */
  jpegOffset: number;
  /** True when the stored rows are already top-down. */
  topDownSort: boolean;
  /** The embedded JPEG bytes (from SOI to end of file). */
  jpeg: Uint8Array;
}

const OZT_HEADER_SIZE = 16;

/** OZT: 16-byte header, int16 width/height, byte depth (32), then bottom-up BGRA rows. */
export function decodeOzt(input: Uint8Array): DecodedImage {
  if (input.length < 22) throw new Error('OZT file is too small');
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const width = view.getInt16(16, true);
  const height = view.getInt16(18, true);
  const depth = input[20];
  if (width <= 0 || height <= 0 || width > 4096 || height > 4096) {
    throw new Error(`OZT: implausible dimensions ${width}x${height}`);
  }
  if (depth !== 32) throw new Error(`OZT: unsupported depth ${depth} (expected 32)`);
  const expected = 22 + width * height * 4;
  if (input.length < expected) {
    throw new Error(`OZT: truncated data (${input.length} < ${expected} bytes)`);
  }

  const rgba = new Uint8Array(width * height * 4);
  let offset = 22;
  for (let y = 0; y < height; y++) {
    const rowStart = (height - 1 - y) * width * 4; // stored bottom-up
    for (let x = 0; x < width; x++) {
      const b = input[offset++];
      const g = input[offset++];
      const r = input[offset++];
      const a = input[offset++];
      const target = rowStart + x * 4;
      rgba[target] = r;
      rgba[target + 1] = g;
      rgba[target + 2] = b;
      rgba[target + 3] = a;
    }
  }
  return { width, height, rgba, format: 'ozt' };
}

/** Locates the embedded JPEG stream of an OZJ file. */
export function inspectOzj(input: Uint8Array): OzjInfo {
  if (input.length < 20) throw new Error('OZJ file is too small');
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const topDownSort = view.getUint8(17) !== 0;
  const last = input.length - 2;
  for (let i = 16; i < last; i++) {
    if (input[i] === 0xff && input[i + 1] === 0xd8 && input[i + 2] === 0xff) {
      return { jpegOffset: i, topDownSort, jpeg: input.subarray(i) };
    }
  }
  throw new Error('OZJ: JPEG marker not found');
}

/** OZB: a BMP variant ("BM8"/"BM6" magic) used for old sprite sheets. */
export function decodeOzb(input: Uint8Array): DecodedImage {
  if (input.length < 58) throw new Error('OZB file is too small');
  const fileType = String.fromCharCode(input[0], input[1], input[2]);
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const width = view.getInt32(18, true);
  const height = view.getInt32(22, true);
  if (width <= 0 || height <= 0 || width > 8192 || height > 8192) {
    throw new Error(`OZB: implausible dimensions ${width}x${height}`);
  }
  const rgba = new Uint8Array(width * height * 4);

  if (fileType === 'BM8' || fileType === 'BM\x18') {
    const start = 4 + 14 + 40 + 1026;
    if (input.length < start + width * height) throw new Error('OZB: truncated 8-bit data');
    for (let i = 0; i < width * height; i++) {
      const value = input[start + i];
      rgba[i * 4] = value;
      rgba[i * 4 + 1] = 0;
      rgba[i * 4 + 2] = 0;
      rgba[i * 4 + 3] = 255;
    }
  } else if (fileType === 'BM6') {
    const start = 4 + 14 + 40;
    if (input.length < start + width * height * 3) throw new Error('OZB: truncated 24-bit data');
    let offset = start;
    for (let i = 0; i < width * height; i++) {
      rgba[i * 4] = input[offset + 2];
      rgba[i * 4 + 1] = input[offset + 1];
      rgba[i * 4 + 2] = input[offset];
      rgba[i * 4 + 3] = 255;
      offset += 3;
    }
  } else {
    throw new Error(`OZB: unknown file type "${fileType}"`);
  }
  return { width, height, rgba, format: `ozb:${fileType}` };
}

/** Uncompressed and RLE true-color TGA (24/32 bpp). */
export function decodeTga(input: Uint8Array): DecodedImage {
  if (input.length < 18) throw new Error('TGA file is too small');
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const idLength = input[0];
  const imageType = input[2];
  const width = view.getUint16(12, true);
  const height = view.getUint16(14, true);
  const bpp = input[16];
  const descriptor = input[17];
  const topDown = (descriptor & 0x20) !== 0;
  if (width === 0 || height === 0) throw new Error('TGA: zero dimensions');
  if (bpp !== 24 && bpp !== 32) throw new Error(`TGA: unsupported bit depth ${bpp}`);
  if (imageType !== 2 && imageType !== 10) {
    throw new Error(`TGA: unsupported image type ${imageType} (expected 2 or 10)`);
  }

  const bytesPerPixel = bpp / 8;
  const rgba = new Uint8Array(width * height * 4);
  let offset = 18 + idLength;
  const pixelCount = width * height;

  const writePixel = (index: number, data: Uint8Array, at: number): void => {
    const row = Math.floor(index / width);
    const column = index % width;
    const targetRow = topDown ? row : height - 1 - row;
    const target = (targetRow * width + column) * 4;
    rgba[target] = data[at + 2];
    rgba[target + 1] = data[at + 1];
    rgba[target + 2] = data[at];
    rgba[target + 3] = bytesPerPixel === 4 ? data[at + 3] : 255;
  };

  if (imageType === 2) {
    if (input.length < offset + pixelCount * bytesPerPixel) throw new Error('TGA: truncated data');
    for (let i = 0; i < pixelCount; i++) writePixel(i, input, offset + i * bytesPerPixel);
  } else {
    let index = 0;
    while (index < pixelCount) {
      if (offset >= input.length) throw new Error('TGA: truncated RLE data');
      const header = input[offset++];
      const count = (header & 0x7f) + 1;
      if (header & 0x80) {
        for (let i = 0; i < count && index < pixelCount; i++, index++) {
          writePixel(index, input, offset);
        }
        offset += bytesPerPixel;
      } else {
        for (let i = 0; i < count && index < pixelCount; i++, index++) {
          writePixel(index, input, offset + i * bytesPerPixel);
        }
        offset += count * bytesPerPixel;
      }
    }
  }
  return { width, height, rgba, format: 'tga' };
}

/** DDS with DXT1/DXT3/DXT5 (block compressed) or uncompressed ARGB/RGBA. */
export function decodeDds(input: Uint8Array): DecodedImage {
  if (input.length < 128) throw new Error('DDS file is too small');
  const fourCC = String.fromCharCode(input[84], input[85], input[86], input[87]);
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const height = view.getUint32(12, true);
  const width = view.getUint32(16, true);
  if (width === 0 || height === 0 || width > 16384 || height > 16384) {
    throw new Error(`DDS: implausible dimensions ${width}x${height}`);
  }
  const rgba = new Uint8Array(width * height * 4);
  const data = input.subarray(128);

  if (fourCC === 'DXT1' || fourCC === 'DXT3' || fourCC === 'DXT5') {
    const blockBytes = fourCC === 'DXT1' ? 8 : 16;
    const blocksX = Math.max(1, Math.ceil(width / 4));
    const blocksY = Math.max(1, Math.ceil(height / 4));
    if (data.length < blocksX * blocksY * blockBytes) throw new Error('DDS: truncated compressed data');
    let offset = 0;
    for (let by = 0; by < blocksY; by++) {
      for (let bx = 0; bx < blocksX; bx++) {
        const block = data.subarray(offset, offset + blockBytes);
        offset += blockBytes;
        let colorOffset = 0;
        const alpha = new Uint8Array(16).fill(255);
        if (fourCC === 'DXT3') {
          for (let i = 0; i < 16; i++) {
            const nibble = (block[i >> 1] >> ((i & 1) * 4)) & 0x0f;
            alpha[i] = nibble * 17;
          }
          colorOffset = 8;
        } else if (fourCC === 'DXT5') {
          const a0 = block[0];
          const a1 = block[1];
          const codes = new Uint8Array(16);
          for (let i = 0; i < 16; i++) {
            const byte = block[2 + (i >> 1)];
            codes[i] = (i & 1) === 0 ? byte & 7 : (byte >> 4) & 7;
          }
          const palette = buildDxt5AlphaPalette(a0, a1);
          for (let i = 0; i < 16; i++) alpha[i] = palette[codes[i]!]!;
          colorOffset = 8;
        }
        const decoded = decodeDxtColorBlock(block.subarray(colorOffset, colorOffset + 8), fourCC === 'DXT1');
        if (fourCC === 'DXT1') {
          // In DXT1 the 4th palette entry is transparent black when colour0 <= colour1.
          for (let i = 0; i < 16; i++) alpha[i] = decoded.alpha[i]!;
        }
        for (let py = 0; py < 4; py++) {
          for (let px = 0; px < 4; px++) {
            const x = bx * 4 + px;
            const y = by * 4 + py;
            if (x >= width || y >= height) continue;
            const pixel = py * 4 + px;
            const target = (y * width + x) * 4;
            rgba[target] = decoded.rgb[pixel * 3]!;
            rgba[target + 1] = decoded.rgb[pixel * 3 + 1]!;
            rgba[target + 2] = decoded.rgb[pixel * 3 + 2]!;
            rgba[target + 3] = alpha[pixel]!;
          }
        }
      }
    }
    return { width, height, rgba, format: `dds:${fourCC}` };
  }

  if (fourCC === '\u0000\u0000\u0000\u0000') {
    const bitCount = view.getUint32(88, true);
    if (bitCount !== 24 && bitCount !== 32) {
      throw new Error(`DDS: unsupported uncompressed bit count ${bitCount}`);
    }
    const bytesPerPixel = bitCount / 8;
    if (data.length < width * height * bytesPerPixel) throw new Error('DDS: truncated pixel data');
    for (let i = 0; i < width * height; i++) {
      rgba[i * 4] = data[i * bytesPerPixel + 2];
      rgba[i * 4 + 1] = data[i * bytesPerPixel + 1];
      rgba[i * 4 + 2] = data[i * bytesPerPixel];
      rgba[i * 4 + 3] = bytesPerPixel === 4 ? data[i * 4 + 3] : 255;
    }
    return { width, height, rgba, format: 'dds:raw' };
  }

  throw new Error(`DDS: unsupported format "${fourCC}"`);
}

function buildDxt5AlphaPalette(a0: number, a1: number): Uint8Array {
  const palette = new Uint8Array(8);
  palette[0] = a0;
  palette[1] = a1;
  if (a0 > a1) {
    for (let i = 1; i <= 6; i++) {
      palette[i + 1] = Math.round(((7 - i) * a0 + i * a1) / 7);
    }
  } else {
    for (let i = 1; i <= 4; i++) {
      palette[i + 1] = Math.round(((5 - i) * a0 + i * a1) / 5);
    }
    palette[6] = 0;
    palette[7] = 255;
  }
  return palette;
}

function decodeDxtColorBlock(
  block: Uint8Array,
  allowAlpha: boolean,
): { rgb: Uint8Array; alpha: Uint8Array } {
  const view = new DataView(block.buffer, block.byteOffset, block.byteLength);
  const c0 = view.getUint16(0, true);
  const c1 = view.getUint16(2, true);
  const codes = view.getUint32(4, true);
  const color = (value: number): [number, number, number] => [
    ((value >> 11) & 0x1f) * 255 / 31 | 0,
    ((value >> 5) & 0x3f) * 255 / 63 | 0,
    (value & 0x1f) * 255 / 31 | 0,
  ];
  const a = color(c0);
  const b = color(c1);
  const palette: number[][] = [a, b, [0, 0, 0], [255, 255, 255]];
  if (c0 > c1 || !allowAlpha) {
    for (let i = 0; i < 3; i++) {
      palette[2]![i] = (2 * a[i]! + b[i]!) / 3 | 0;
      palette[3]![i] = (a[i]! + 2 * b[i]!) / 3 | 0;
    }
  } else {
    for (let i = 0; i < 3; i++) palette[2]![i] = (a[i]! + b[i]!) / 2 | 0;
  }
  const rgb = new Uint8Array(16 * 3);
  const alpha = new Uint8Array(16).fill(255);
  const threeColorMode = allowAlpha && c0 <= c1;
  for (let i = 0; i < 16; i++) {
    const index = (codes >>> (2 * i)) & 3;
    const entry = palette[index]!;
    rgb[i * 3] = entry[0]!;
    rgb[i * 3 + 1] = entry[1]!;
    rgb[i * 3 + 2] = entry[2]!;
    if (threeColorMode && index === 3) alpha[i] = 0;
  }
  return { rgb, alpha };
}

export type TextureHint = 'ozj' | 'ozt' | 'ozb' | 'tga' | 'dds';

/** Decodes a texture by file name/magic. OZJ returns container information (JPEG is host-decoded). */
export function detectTextureFormat(data: Uint8Array, fileName = ''): TextureHint | undefined {
  const extension = fileName.toLowerCase().split('.').pop();
  if (extension === 'ozj' || extension === 'ozt' || extension === 'ozb' || extension === 'tga' || extension === 'dds') {
    return extension as TextureHint;
  }
  if (data.length >= 4) {
    if (data[0] === 0x44 && data[1] === 0x44 && data[2] === 0x53 && data[3] === 0x20) return 'dds';
    const magic3 = String.fromCharCode(data[0], data[1], data[2]);
    if (magic3 === 'BM6' || magic3 === 'BM8') return 'ozb';
  }
  return undefined;
}
