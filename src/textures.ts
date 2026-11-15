// StarCraft II's textures (DDS), by their logical paths: as GPU-compressed textures where the GPU
// samples them so, decoded otherwise; and the URL a StarCraft II file is asked for by.

import * as THREE from 'three';
import { assetRenderer, fetchBuffer } from '../../../src/engine/assets.ts';
import { decodeToRgba, parseDds, type DdsFormat } from './formats/dds.ts';

/** URL of a StarCraft II file, by its logical path (e.g. "Assets\\Textures\\Marine.dds"). */
export function sc2Url(path: string): string {
  return '/sc2/' + path.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
}

/** Whether the GPU samples S3TC textures as they are (and in sRGB): asked of the game's renderer once. */
let gpu: { s3tc: boolean; s3tcSrgb: boolean } | null = null;
function compressed() {
  const r = assetRenderer();
  if (!gpu && r) gpu = { s3tc: r.extensions.has('WEBGL_compressed_texture_s3tc'), s3tcSrgb: r.extensions.has('WEBGL_compressed_texture_s3tc_srgb') };
  return gpu ?? { s3tc: false, s3tcSrgb: false };
}

const COMPRESSED: Partial<Record<DdsFormat, THREE.CompressedPixelFormat>> = {
  dxt1: THREE.RGBA_S3TC_DXT1_Format,
  dxt3: THREE.RGBA_S3TC_DXT3_Format,
  dxt5: THREE.RGBA_S3TC_DXT5_Format,
};

const textures = new Map<string, Promise<THREE.Texture | null>>();

/** A small mip of each texture loaded, kept for `channelRange`. Keyed by source: copies share it. */
const samples = new WeakMap<object, { mip: { width: number; height: number; data: Uint8Array }; format: DdsFormat }>();
const ranges = new WeakMap<object, { min: number[]; max: number[] }>();

/**
 * The lowest and highest value each channel (red, green, blue, alpha; 0..1) reaches in a
 * texture, read once from a small mip (which averages, so the extremes run a little short).
 * An alpha mask's range says when a burn-away has taken every pixel.
 */
export function ddsChannelRange(texture: THREE.Texture): { min: number[]; max: number[] } | null {
  const known = ranges.get(texture.source);
  if (known) return known;
  const s = samples.get(texture.source);
  if (!s) return null;
  const range = { min: [0, 0, 0, 0], max: [1, 1, 1, 1] };
  {
    const px = decodeToRgba(s.mip, s.format);
    const step = Math.max(1, Math.floor(px.length / 4 / 16384)) * 4;
    range.min = [255, 255, 255, 255];
    range.max = [0, 0, 0, 0];
    for (let i = 0; i < px.length; i += step) {
      for (let c = 0; c < 4; c++) {
        const v = px[i + c];
        if (v < range.min[c]) range.min[c] = v;
        if (v > range.max[c]) range.max[c] = v;
      }
    }
    range.min = range.min.map((v) => v / 255);
    range.max = range.max.map((v) => v / 255);
  }
  ranges.set(texture.source, range);
  return range;
}

/**
 * Loads a DDS texture. Color textures are sRGB; data textures (normal, specular) are not.
 * Resolves to null when the file is missing.
 */
export function loadTexture(path: string, srgb: boolean): Promise<THREE.Texture | null> {
  const key = `${path.toLowerCase()}|${srgb}`;
  let p = textures.get(key);
  if (!p) {
    p = fetchBuffer(sc2Url(path)).then((buf) => (buf ? createTexture(buf, srgb, path) : null));
    textures.set(key, p);
  }
  return p;
}

function createTexture(buf: ArrayBuffer, srgb: boolean, name: string): THREE.Texture {
  const dds = parseDds(buf);
  const format = COMPRESSED[dds.format];
  let texture: THREE.Texture;
  if (format !== undefined && compressed().s3tc && (!srgb || compressed().s3tcSrgb)) {
    texture = new THREE.CompressedTexture(
      dds.mipmaps.map((m) => ({ data: m.data, width: m.width, height: m.height })) as unknown as ImageData[],
      dds.width,
      dds.height,
      format,
    );
  } else {
    texture = new THREE.DataTexture(decodeToRgba(dds.mipmaps[0], dds.format), dds.width, dds.height);
    texture.generateMipmaps = true;
  }
  const small = dds.mipmaps.find((m) => m.width <= 128) ?? dds.mipmaps[dds.mipmaps.length - 1];
  samples.set(texture.source, { mip: small, format: dds.format });
  const complete = dds.mipmaps.length > 1 && dds.mipmaps[dds.mipmaps.length - 1].width === 1;
  texture.minFilter = complete || texture instanceof THREE.DataTexture ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.anisotropy = Math.min(8, assetRenderer()?.capabilities.getMaxAnisotropy() ?? 1);
  texture.name = name;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Several same-sized DDS textures as one texture array (terrain layers). Kept compressed when
 * the GPU can sample S3TC arrays in the right color space; otherwise decoded to RGBA. Missing
 * or mismatched layers are filled with mid grey.
 */
export async function loadTextureArray(paths: string[], srgb: boolean): Promise<THREE.Texture> {
  const images = await Promise.all(
    paths.map(async (p) => {
      const buf = await fetchBuffer(sc2Url(p));
      return buf ? parseDds(buf) : null;
    }),
  );
  const first = images.find((i) => i)!;
  const size = first?.width ?? 4;
  const same = images.every((i) => i && i.width === size && i.height === size && i.format === first.format && i.mipmaps.length === first.mipmaps.length);
  const format = first ? COMPRESSED[first.format] : undefined;
  const depth = paths.length;
  let texture: THREE.Texture;
  if (same && format !== undefined && compressed().s3tc && (!srgb || compressed().s3tcSrgb)) {
    const mipmaps = first.mipmaps.map((m, level) => {
      const data = new Uint8Array(m.data.length * depth);
      images.forEach((img, layer) => data.set(img!.mipmaps[level].data, layer * m.data.length));
      return { data, width: m.width, height: m.height };
    });
    const t = new THREE.CompressedArrayTexture(mipmaps as unknown as ImageData[], size, size, depth, format);
    texture = t;
    const complete = first.mipmaps[first.mipmaps.length - 1].width === 1;
    t.minFilter = complete ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  } else {
    const data = new Uint8Array(size * size * 4 * depth);
    images.forEach((img, layer) => {
      if (img && img.width === size && img.height === size) data.set(decodeToRgba(img.mipmaps[0], img.format), layer * size * size * 4);
      else data.fill(128, layer * size * size * 4, (layer + 1) * size * size * 4);
    });
    const t = new THREE.DataArrayTexture(data, size, size, depth);
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    texture = t;
  }
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.anisotropy = Math.min(8, assetRenderer()?.capabilities.getMaxAnisotropy() ?? 1);
  texture.needsUpdate = true;
  return texture;
}
