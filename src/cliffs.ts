import * as THREE from 'three';
import { parseM3 } from './formats/m3.ts';
import { type ModelData } from '../../../src/engine/modeldata.ts';
import { cliffOffset } from './formats/sc2map.ts';
import type { MapData } from '../../../src/engine/mapdata.ts';
import { fetchBuffer } from '../../../src/engine/assets.ts';
import { sc2Url } from './textures.ts';
import type { MapTerrain } from '../../../src/engine/mapterrain.ts';

/**
 * StarCraft II's cliffs, built the way the game builds them: from a cliff set's tile meshes,
 * one per cell where the cliff level changes between the cell's corners.
 *
 * A tile is named for its corners' levels, counterclockwise from the south-west, lowest 'a':
 * CliffNatural0_aabb is a straight edge with the north side a level up. Only one rotation of
 * each pattern exists, so a cell's pattern is turned until it matches one and the tile is
 * turned back. Tiles span two model units (one cell) and stand on a vertical scale of their
 * own: 0 at the lowest corner, 8 a level up, 10 two levels, 12 three. That is remapped onto the
 * map's own levels (two units each, eight for the chasm), so one tile fits any cliff.
 */

/** The tile patterns (canonical rotations) and how many variations each has. */
const TILES: Record<string, number> = {
  aaab: 4, aaac: 4, aaad: 4, aabb: 4, aabc: 1, aabd: 1, aacb: 1, aacc: 4, aacd: 1, aadb: 1, aadc: 1, aadd: 4,
  abab: 4, abac: 1, abad: 1, abbb: 4, abbc: 1, abbd: 1, abcb: 1, abcc: 1, abcd: 1, abdb: 1, abdc: 1, abdd: 1,
  acac: 4, acad: 1, acbb: 1, acbc: 1, acbd: 1, accb: 1, accc: 4, accd: 1, acdb: 1, acdc: 1, acdd: 1,
  adad: 4, adbb: 1, adbc: 1, adbd: 1, adcb: 1, adcc: 1, addb: 1, addc: 1, addd: 4,
};

/** A tile's height (its own units) at each relative level: the lowest corner, then one, two, three levels up. */
const TILE_LEVELS = [0, 8, 10, 12];

function tileLevel(z: number): number {
  if (z <= 0) return 0;
  for (let i = 1; i < TILE_LEVELS.length; i++) {
    if (z <= TILE_LEVELS[i]) return i - 1 + (z - TILE_LEVELS[i - 1]) / (TILE_LEVELS[i] - TILE_LEVELS[i - 1]);
  }
  return TILE_LEVELS.length - 1;
}

/** Height offset of a fractional cliff level, game units. */
function levelOffset(level: number): number {
  const lo = Math.floor(level);
  return cliffOffset(lo) + (cliffOffset(lo + 1) - cliffOffset(lo)) * (level - lo);
}

function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

interface Placement {
  x: number;
  y: number;
  file: string;
  /** Quarter turns counterclockwise from the tile's own orientation to the cell's. */
  turns: number;
  /** The cell's lowest corner level. */
  base: number;
}

/**
 * The map's cliffs as one mesh, in the tileset's cliff material, or null if it has none.
 * `set` is the cliff mesh set (CliffNatural0).
 */
export async function buildCliffs(map: MapData, terrain: MapTerrain, set: string, material: THREE.Material): Promise<THREE.Mesh | null> {
  const W = map.width + 1;
  const L = map.cliff;
  const placements: Placement[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      // Ramps (cells you can walk, between levels) are smooth ground, not cliffs.
      if (map.pathable[y * map.width + x]) continue;
      // Corners counterclockwise from the south-west (map y runs north), as the tiles are named.
      const c = [L[y * W + x], L[y * W + x + 1], L[(y + 1) * W + x + 1], L[(y + 1) * W + x]];
      const lo = Math.min(...c);
      if (Math.max(...c) === lo) continue;
      if (Math.max(...c) - lo > 3) continue;
      const code = c.map((v) => 'abcd'[v - lo]).join('');
      for (let r = 0; r < 4; r++) {
        const rotated = code.slice(r) + code.slice(0, r);
        const variations = TILES[rotated];
        if (!variations) continue;
        const v = hash(x, y) % variations;
        placements.push({ x, y, file: `Assets/Cliffs/${set}/${set}_${rotated}_${String(v).padStart(2, '0')}.m3`, turns: r, base: lo });
        break;
      }
    }
  }
  if (!placements.length) return null;

  // Load each tile once.
  const files = [...new Set(placements.map((p) => p.file))];
  const tiles = new Map<string, ModelData>();
  await Promise.all(
    files.map(async (f) => {
      const buf = await fetchBuffer(sc2Url(f));
      if (!buf) return;
      try {
        tiles.set(f, parseM3(buf));
      } catch {
        // A tile we can't read leaves the heightfield's own slope there.
      }
    }),
  );

  let vertices = 0;
  let indices = 0;
  for (const p of placements) {
    const t = tiles.get(p.file);
    if (!t) continue;
    vertices += t.positions.length / 3;
    indices += t.indices.length;
  }
  const pos = new Float32Array(vertices * 3);
  const uv = new Float32Array(vertices * 2);
  const index = new Uint32Array(indices);
  const v = new THREE.Vector3();
  // The ground under the cliffs, without the levels: bilinear between a cell's corners.
  const baseHeight = (x: number, y: number) => {
    const i = y * W + x;
    return map.heights[i] - cliffOffset(L[i]);
  };
  let vo = 0;
  let io = 0;
  for (const p of placements) {
    const t = tiles.get(p.file);
    if (!t) continue;
    const n = t.positions.length / 3;
    const b00 = baseHeight(p.x, p.y);
    const b10 = baseHeight(p.x + 1, p.y);
    const b01 = baseHeight(p.x, p.y + 1);
    const b11 = baseHeight(p.x + 1, p.y + 1);
    const cos = [1, 0, -1, 0][p.turns];
    const sin = [0, 1, 0, -1][p.turns];
    for (let i = 0; i < n; i++) {
      const mx = t.positions[i * 3];
      const my = t.positions[i * 3 + 1];
      const mz = t.positions[i * 3 + 2];
      // Turn the tile back to the cell (counterclockwise in the map's x-east, y-north plane).
      const rx = mx * cos - my * sin;
      const ry = mx * sin + my * cos;
      const u = THREE.MathUtils.clamp(0.5 + rx * 0.5, 0, 1);
      const w = THREE.MathUtils.clamp(0.5 + ry * 0.5, 0, 1);
      const ground = b00 * (1 - u) * (1 - w) + b10 * u * (1 - w) + b01 * (1 - u) * w + b11 * u * w;
      const height = ground + levelOffset(p.base + tileLevel(mz));
      terrain.toWorld(p.x + 0.5 + rx * 0.5, p.y + 0.5 + ry * 0.5, height, v);
      pos.set([v.x, v.y, v.z], (vo + i) * 3);
      uv[(vo + i) * 2] = t.uv0[i * 2];
      uv[(vo + i) * 2 + 1] = t.uv0[i * 2 + 1];
    }
    for (let i = 0; i < t.indices.length; i++) index[io + i] = t.indices[i] + vo;
    vo += n;
    io += t.indices.length;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = `cliffs:${set}`;
  return mesh;
}
