/**
 * Reader for the DirectDraw Surface textures StarCraft II uses: DXT1, DXT3 and DXT5 block
 * compression, plus uncompressed 32-bit BGRA. Also decodes the compressed formats to RGBA
 * for GPUs without S3TC support and for CPU-side analysis.
 */

export type DdsFormat = 'dxt1' | 'dxt3' | 'dxt5' | 'bgra8';

export interface DdsMip {
  width: number;
  height: number;
  data: Uint8Array;
}

export interface DdsImage {
  width: number;
  height: number;
  format: DdsFormat;
  mipmaps: DdsMip[];
}

const BLOCK_BYTES: Record<DdsFormat, number> = { dxt1: 8, dxt3: 16, dxt5: 16, bgra8: 0 };

export function parseDds(buffer: ArrayBuffer): DdsImage {
  const dv = new DataView(buffer);
  if (dv.getUint32(0, true) !== 0x20534444) throw new Error('not a DDS file');
  const height = dv.getUint32(12, true);
  const width = dv.getUint32(16, true);
  const mipCount = Math.max(1, dv.getUint32(28, true));
  const pfFlags = dv.getUint32(80, true);
  const fourCC = String.fromCharCode(...new Uint8Array(buffer, 84, 4));
  const bits = dv.getUint32(88, true);

  let format: DdsFormat;
  if (pfFlags & 0x4) {
    const known: Record<string, DdsFormat> = { DXT1: 'dxt1', DXT3: 'dxt3', DXT5: 'dxt5' };
    format = known[fourCC];
    if (!format) throw new Error(`unsupported DDS compression ${fourCC}`);
  } else if (bits === 32) {
    format = 'bgra8';
  } else {
    throw new Error(`unsupported DDS pixel format (${bits} bits)`);
  }

  const mipmaps: DdsMip[] = [];
  let offset = 128;
  let w = width;
  let h = height;
  for (let i = 0; i < mipCount && offset < buffer.byteLength; i++) {
    const size =
      format === 'bgra8'
        ? w * h * 4
        : Math.max(1, Math.ceil(w / 4)) * Math.max(1, Math.ceil(h / 4)) * BLOCK_BYTES[format];
    if (offset + size > buffer.byteLength) break;
    mipmaps.push({ width: w, height: h, data: new Uint8Array(buffer, offset, size) });
    offset += size;
    w = Math.max(1, w >> 1);
    h = Math.max(1, h >> 1);
  }
  return { width, height, format, mipmaps };
}

function rgb565(c: number, out: Uint8Array, o: number) {
  out[o] = (((c >> 11) & 31) * 255) / 31;
  out[o + 1] = (((c >> 5) & 63) * 255) / 63;
  out[o + 2] = ((c & 31) * 255) / 31;
}

/** Decodes one mip level to RGBA8, rows top to bottom. */
export function decodeToRgba(mip: DdsMip, format: DdsFormat): Uint8Array {
  const { width, height, data } = mip;
  const out = new Uint8Array(width * height * 4);
  if (format === 'bgra8') {
    for (let i = 0; i < width * height; i++) {
      out[i * 4] = data[i * 4 + 2];
      out[i * 4 + 1] = data[i * 4 + 1];
      out[i * 4 + 2] = data[i * 4];
      out[i * 4 + 3] = data[i * 4 + 3];
    }
    return out;
  }

  const blockBytes = BLOCK_BYTES[format];
  const colorAt = format === 'dxt1' ? 0 : 8;
  const palette = new Uint8Array(16);
  const alphas = new Uint8Array(8);
  const bw = Math.max(1, Math.ceil(width / 4));
  const bh = Math.max(1, Math.ceil(height / 4));

  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const b = (by * bw + bx) * blockBytes;
      const c0 = data[b + colorAt] | (data[b + colorAt + 1] << 8);
      const c1 = data[b + colorAt + 2] | (data[b + colorAt + 3] << 8);
      rgb565(c0, palette, 0);
      rgb565(c1, palette, 4);
      palette[3] = palette[7] = palette[11] = 255;
      if (c0 > c1 || format !== 'dxt1') {
        for (let k = 0; k < 3; k++) {
          palette[8 + k] = (2 * palette[k] + palette[4 + k]) / 3;
          palette[12 + k] = (palette[k] + 2 * palette[4 + k]) / 3;
        }
        palette[15] = 255;
      } else {
        for (let k = 0; k < 3; k++) {
          palette[8 + k] = (palette[k] + palette[4 + k]) / 2;
          palette[12 + k] = 0;
        }
        palette[15] = 0;
      }

      if (format === 'dxt5') {
        const a0 = data[b];
        const a1 = data[b + 1];
        alphas[0] = a0;
        alphas[1] = a1;
        for (let k = 1; k < 7; k++) {
          if (a0 > a1) alphas[k + 1] = ((7 - k) * a0 + k * a1) / 7;
          else if (k < 5) alphas[k + 1] = ((5 - k) * a0 + k * a1) / 5;
        }
        if (a0 <= a1) {
          alphas[6] = 0;
          alphas[7] = 255;
        }
      }

      const indices = data[b + colorAt + 4] | (data[b + colorAt + 5] << 8) | (data[b + colorAt + 6] << 16) | (data[b + colorAt + 7] << 24);
      for (let p = 0; p < 16; p++) {
        const x = bx * 4 + (p & 3);
        const y = by * 4 + (p >> 2);
        if (x >= width || y >= height) continue;
        const o = (y * width + x) * 4;
        const ci = ((indices >>> (p * 2)) & 3) * 4;
        out[o] = palette[ci];
        out[o + 1] = palette[ci + 1];
        out[o + 2] = palette[ci + 2];
        out[o + 3] = palette[ci + 3];
        if (format === 'dxt3') {
          out[o + 3] = ((data[b + (p >> 1)] >> ((p & 1) * 4)) & 15) * 17;
        } else if (format === 'dxt5') {
          const bit = p * 3;
          const byte = b + 2 + (bit >> 3);
          const shift = bit & 7;
          const ai = ((data[byte] | (data[byte + 1] << 8)) >> shift) & 7;
          out[o + 3] = alphas[ai];
        }
      }
    }
  }
  return out;
}
