/**
 * StarCraft II map files, read from a map folder in the archive (campaign maps are stored
 * unpacked: `.../traynor03.sc2map/t3HeightMap`, `Objects`, ...). Formats, as decoded here:
 *
 * - t3Terrain.xml: tileset, dimensions, the heightmap's quantization, the eight blend
 *   textures in mask order, cliff sets.
 * - t3HeightMap ("HMAP"): one 6-byte record per vertex, (w+1)x(h+1): u16 quantized height,
 *   two bytes we don't use, the vertex's cliff level, one more byte. Height in game units is
 *   value * quantizeScale - quantizeBias plus the cliff level's offset: +2 per level above 1,
 *   and level 0 is a chasm 8 below. Fitted to the doodads placed on three Mar Sara maps,
 *   every level agrees to a hundredth of a unit.
 * - t3CellFlags ("LFCT"): a byte per cell; 3 is unpathable (cliff edges, mountains), 2 on a
 *   level-0 cell is open chasm. Bridges are level-0 cells that are pathable.
 * - t3TextureMasks ("MASK"): eight 4-bit weights per texel (they sum to 15), at 8 texels per
 *   cell, stored per texture as a plane of 64x64-texel tiles. The header gives the width (+12)
 *   and height (+16) in texels: maps needn't be square (Tarsonis is 1792 by 1280).
 * - Objects: XML of placed units, doodads and points (start locations).
 * - MapInfo: binary; the playable (camera) bounds follow the tileset name.
 * - Regions: XML of named shapes.
 */

import type { MapData, Placement, Region, RegionShape } from '../../../../src/engine/mapdata.ts';

const xml = new DOMParser();

function attrNum(el: Element, name: string, fallback = 0): number {
  const v = el.getAttribute(name);
  return v === null ? fallback : Number(v);
}

function parseTerrainXml(text: string) {
  const doc = xml.parseFromString(text, 'text/xml');
  const hm = doc.querySelector('heightMap')!;
  const [w, h] = (hm.getAttribute('dim') ?? '129 129').trim().split(/\s+/).map(Number);
  const tiling = Number((hm.getAttribute('uvtiling') ?? '12').trim().split(/\s+/)[0]);
  const vert = doc.querySelector('vertData')!;
  return {
    tileset: hm.getAttribute('tileSet') ?? '',
    vertsX: w,
    vertsY: h,
    uvTiling: tiling,
    quantizeBias: attrNum(vert, 'quantizeBias'),
    quantizeScale: attrNum(vert, 'quantizeScale', 1 / 4096),
    textures: Array.from(doc.querySelectorAll('textureList > texture')).map((t) => t.getAttribute('name') ?? ''),
    cliffSets: Array.from(doc.querySelectorAll('cliffSetList > cliffSet')).map((t) => t.getAttribute('name') ?? ''),
  };
}

/** Height offset of a cliff level, game units. */
export function cliffOffset(level: number): number {
  return level === 0 ? -8 : 2 * (level - 1);
}

function parseHeights(buf: ArrayBuffer, w: number, h: number, scale: number, bias: number) {
  const dv = new DataView(buf);
  const tag = String.fromCharCode(...new Uint8Array(buf, 0, 4));
  if (tag !== 'HMAP') throw new Error(`t3HeightMap: unexpected tag ${tag}`);
  const count = w * h;
  const heights = new Float32Array(count);
  const base = new Float32Array(count);
  const cliff = new Uint8Array(count);
  const o = 32;
  for (let i = 0; i < count; i++) {
    const q = dv.getUint16(o + i * 6, true);
    const level = dv.getUint8(o + i * 6 + 4);
    cliff[i] = level;
    base[i] = q * scale - bias;
    heights[i] = base[i] + cliffOffset(level);
  }
  return { heights, cliff, base };
}

/** The masks as two RGBA images: textures 0-3 in the first, 4-7 in the second. */
function parseMasks(buf: ArrayBuffer): { masks: [Uint8Array, Uint8Array]; width: number; height: number } {
  const dv = new DataView(buf);
  const width = dv.getUint32(12, true) || 1024;
  const height = dv.getUint32(16, true) || width;
  const plane = (width * height) / 2;
  const bytes = new Uint8Array(buf, 64);
  const tile = 64;
  const tilesPerRow = width / tile;
  const a = new Uint8Array(width * height * 4);
  const b = new Uint8Array(width * height * 4);
  for (let k = 0; k < 8; k++) {
    const base = k * plane;
    const out = k < 4 ? a : b;
    const ch = k % 4;
    for (let y = 0; y < height; y++) {
      const ty = (y / tile) | 0;
      const iy = y % tile;
      for (let x = 0; x < width; x++) {
        const idx = (ty * tilesPerRow + ((x / tile) | 0)) * tile * tile + iy * tile + (x % tile);
        const byte = bytes[base + (idx >> 1)];
        const v = idx & 1 ? byte & 15 : byte >> 4;
        out[(y * width + x) * 4 + ch] = v * 17;
      }
    }
  }
  return { masks: [a, b], width, height };
}

function parseObjects(text: string): Placement[] {
  const doc = xml.parseFromString(text, 'text/xml');
  const out: Placement[] = [];
  for (const el of Array.from(doc.documentElement.children)) {
    const kind = el.tagName === 'ObjectUnit' ? 'unit' : el.tagName === 'ObjectDoodad' ? 'doodad' : el.tagName === 'ObjectPoint' ? 'point' : null;
    if (!kind) continue;
    const [x, y, z] = (el.getAttribute('Position') ?? '0,0,0').split(',').map(Number);
    const s = (el.getAttribute('Scale') ?? '1,1,1').split(',').map(Number);
    out.push({
      id: attrNum(el, 'Id'),
      kind,
      type: el.getAttribute(kind === 'unit' ? 'UnitType' : 'Type') ?? '',
      x,
      y,
      z: z ?? 0,
      rotation: attrNum(el, 'Rotation'),
      scale: [s[0] ?? 1, s[1] ?? 1, s[2] ?? 1],
      variation: attrNum(el, 'Variation'),
      player: attrNum(el, 'Player'),
      name: el.getAttribute('Name') ?? '',
    });
  }
  return out;
}

function parseRegions(text: string): Region[] {
  const doc = xml.parseFromString(text, 'text/xml');
  return Array.from(doc.querySelectorAll('region')).map((r) => ({
    id: Number(r.getAttribute('id') ?? 0),
    name: r.querySelector('name')?.getAttribute('value') ?? '',
    shapes: Array.from(r.querySelectorAll('shape')).flatMap((s): RegionShape[] => {
      const type = s.getAttribute('type');
      const v = (sel: string) => (s.querySelector(sel)?.getAttribute('value') ?? '0,0').split(',').map(Number);
      if (type === 'circle') {
        const [x, y] = v('center');
        return [{ type: 'circle' as const, x, y, r: Number(s.querySelector('radius')?.getAttribute('value') ?? 0) }];
      }
      if (type === 'rect') {
        const [x0, y0] = v('point');
        const pts = Array.from(s.querySelectorAll('point')).map((p) => (p.getAttribute('value') ?? '0,0').split(',').map(Number));
        const [x1, y1] = pts[1] ?? [x0, y0];
        return [{ type: 'rect' as const, x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) }];
      }
      return [];
    }),
  }));
}

/** Playable bounds from MapInfo: four u32s right after the tileset name. */
function parseBounds(buf: ArrayBuffer, tileset: string, w: number, h: number) {
  const bytes = new Uint8Array(buf);
  const name = new TextEncoder().encode(tileset + '\0');
  for (let i = 0; i + name.length + 16 <= bytes.length; i++) {
    let match = true;
    for (let k = 0; k < name.length && match; k++) if (bytes[i + k] !== name[k]) match = false;
    if (!match) continue;
    const dv = new DataView(buf, i + name.length);
    const x0 = dv.getUint32(0, true);
    const y0 = dv.getUint32(4, true);
    const x1 = dv.getUint32(8, true);
    const y1 = dv.getUint32(12, true);
    if (x1 > x0 && y1 > y0 && x1 <= w && y1 <= h) return { x0, y0, x1, y1 };
  }
  return { x0: 0, y0: 0, x1: w, y1: h };
}

/** Loads a map folder through `fetchFile` (archive path → contents). */
export async function loadMap(
  folder: string,
  fetchFile: (path: string) => Promise<ArrayBuffer | null>,
): Promise<MapData> {
  const get = async (name: string) => {
    const b = await fetchFile(`${folder}/${name}`);
    if (!b) throw new Error(`map file missing: ${folder}/${name}`);
    return b;
  };
  const text = async (name: string) => new TextDecoder().decode(await get(name));
  const [terrainXml, heightBuf, maskBuf, objectsText, infoBuf, regionsText, cliffBuf, flagsBuf] = await Promise.all([
    text('t3terrain.xml'),
    get('t3heightmap'),
    get('t3texturemasks'),
    text('objects'),
    get('mapinfo'),
    text('regions').catch(() => '<Regions/>'),
    get('t3syncclifflevel'),
    get('t3cellflags'),
  ]);
  const t = parseTerrainXml(terrainXml);
  const { heights, cliff, base } = parseHeights(heightBuf, t.vertsX, t.vertsY, t.quantizeScale, t.quantizeBias);
  const { masks, width: maskWidth, height: maskHeight } = parseMasks(maskBuf);
  const width = t.vertsX - 1;
  const height = t.vertsY - 1;
  const cdv = new DataView(cliffBuf);
  const cw = cdv.getUint32(8, true);
  const ch = cdv.getUint32(12, true);
  const cellLevels = new Float32Array(width * height);
  for (let y = 0; y < Math.min(ch, height); y++) {
    for (let x = 0; x < Math.min(cw, width); x++) cellLevels[y * width + x] = cdv.getUint16(32 + (y * cw + x) * 2, true) / 64;
  }
  // Pathing: StarCraft II's cell flags (3 = unpathable; 2 on a chasm floor = open chasm).
  const fdv = new DataView(flagsBuf);
  const fw = fdv.getUint32(24, true);
  const fh = fdv.getUint32(28, true);
  const flagsAt = (x: number, y: number) => (x < fw && y < fh ? fdv.getUint8(32 + y * fw + x) : 3);
  const pathable = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const f = flagsAt(x, y);
      const chasm = cellLevels[y * width + x] < 0.5;
      pathable[y * width + x] = f === 3 || (chasm && f === 2) ? 0 : 1;
    }
  }
  // Bridges: pathable cells over a chasm. Walking, their corners are at the deck's height
  // (level 1), not down on the chasm floor the mesh shows.
  const walkHeights = heights.slice();
  const vx = width + 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!pathable[y * width + x] || cellLevels[y * width + x] >= 0.5) continue;
      for (const [cx, cy] of [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]) {
        const i = cy * vx + cx;
        if (cliff[i] === 0) walkHeights[i] = base[i] + cliffOffset(1);
      }
    }
  }
  return {
    name: folder.split('/').pop()!.replace(/\.sc2map$/i, ''),
    tileset: t.tileset,
    width,
    height,
    heights,
    cliff,
    walkHeights,
    pathable,
    cellLevels,
    textures: t.textures,
    masks,
    maskWidth,
    maskHeight,
    uvTiling: t.uvTiling,
    cliffSets: t.cliffSets,
    placements: parseObjects(objectsText),
    regions: parseRegions(regionsText),
    bounds: parseBounds(infoBuf, t.tileset, width, height),
  };
}
