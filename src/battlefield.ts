// A mission's StarCraft II map, built in the game's terms (src/content/provider.ts \`battlefield\`): its
// terrain and the ground textures its tileset gives it, and its cliffs, StarCraft II's tile meshes in the
// tileset's cliff material.

import * as THREE from 'three';
import type { Battlefield, BattlefieldOptions } from '../../../src/content/provider.ts';
import { fetchBuffer, fetchFile } from '../../../src/engine/assets.ts';
import { loadTexture, loadTextureArray, sc2Url } from './textures.ts';
import { MapTerrain } from '../../../src/engine/mapterrain.ts';
import { parseM3Materials } from './formats/m3.ts';
import { loadMap } from './formats/sc2map.ts';
import type { GameData } from './data.ts';
import { buildCliffs } from './cliffs.ts';
import { sculptValley } from './missions/valley.ts';
import { ownId } from './aliases.ts';

/** The swarm's hives, which the game reads as one: where the swarm comes from. */
const NESTS = new Set(['Hatchery', 'Lair', 'Hive']);

/** A tileset's cliff material: the textures its cliff meshes are drawn with. */
async function loadCliffMaterial(set: string | undefined): Promise<{ diffuse: THREE.Texture; normal: THREE.Texture | null; emissive: THREE.Texture | null } | null> {
  if (!set) return null;
  const buf = await fetchBuffer(sc2Url(`Assets/Cliffs/${set}_Material/${set}_Material.m3`));
  if (!buf) return null;
  const mat = parseM3Materials(buf)[0];
  if (!mat?.layers.diffuse) return null;
  const [diffuse, normal, emissive] = await Promise.all([
    loadTexture(mat.layers.diffuse.path, true),
    mat.layers.normal ? loadTexture(mat.layers.normal.path, false) : Promise.resolve(null),
    mat.layers.emissive ? loadTexture(mat.layers.emissive.path, true) : Promise.resolve(null),
  ]);
  if (!diffuse) return null;
  for (const t of [diffuse, normal, emissive]) {
    if (!t) continue;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.needsUpdate = true;
  }
  return { diffuse, normal, emissive };
}

/**
 * The cliff tiles' material: the tileset's cliff textures, the diffuse alpha cutting the tiles'
 * rims away so the ground shows through (StarCraft II blends it; alpha to coverage gives the
 * same soft edge without sorting), normals in StarCraft II's encoding (X in alpha, Y in green),
 * and Char's lava glowing in its cracks.
 */
function cliffTileMaterial(c: { diffuse: THREE.Texture; normal: THREE.Texture | null; emissive: THREE.Texture | null }): THREE.Material {
  const m = new THREE.MeshPhongMaterial({
    map: c.diffuse,
    color: new THREE.Color(1.25, 1.25, 1.25),
    normalMap: c.normal,
    emissiveMap: c.emissive,
    emissive: c.emissive ? 0xffffff : 0x000000,
    shininess: 10,
    specular: 0x1c1c1c,
    alphaTest: 0.3,
    alphaToCoverage: true,
  });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
      `vec3 mapN = vec3( texture2D( normalMap, vNormalMapUv ).ag * 2.0 - 1.0, 0.0 );
      mapN.z = sqrt( saturate( 1.0 - dot( mapN.xy, mapN.xy ) ) );`,
    );
  };
  return m;
}

/** A campaign map, built: its terrain (\`sculpt\` reshaping it first), the ground textures its tileset gives it, its cliffs. */
export async function loadBattlefield(data: GameData, name: string, opts: BattlefieldOptions): Promise<Battlefield> {
  opts.loading?.(`Terrain: ${name}…`);
  const folder = `campaigns/liberty.sc2campaign/base.sc2maps/maps/campaign/${name}.sc2map`;
  const map = await loadMap(folder, async (p) => (await fetchFile('/casc/' + p))?.arrayBuffer() ?? null);
  const tex = data.terrainTextures;
  const [diffuse, normal, cliff] = await Promise.all([
    loadTextureArray(map.textures.map((id) => tex.value(id, 'Texture') ?? ''), true),
    loadTextureArray(map.textures.map((id) => tex.value(id, 'Normalmap') ?? ''), false),
    loadCliffMaterial(map.cliffSets[0]),
  ]);
  // The ground under player 1's Command Center (or the first start location) becomes height zero.
  const cc =
    map.placements.find((p) => p.kind === 'unit' && p.type === 'CommandCenter' && p.player === 1) ??
    map.placements.find((p) => p.kind === 'point' && p.type === 'StartLoc');
  // The Tide: Unleashed's valley: the base down a level in a hollow, the swarm coming down at it.
  if (opts.mission.rules?.valley && cc) {
    const r = sculptValley(map, cc.x, cc.y);
    console.info(`[valley] base ${r.base} vertices down a level; ${r.ramps} ramps (${r.rampCells} cells) turned; ${r.opened} cliff cells opened; ${r.doodads} doodads moved`);
  }
  // The units in the game's names, for the game's reading of the map (its base's layout): StarCraft II's
  // stay in `type` for the loader's own scripts.
  for (const p of map.placements) if (p.kind === 'unit') p.own = NESTS.has(p.type) ? 'Nest' : ownId(p.type);
  const vx = map.width + 1;
  const base = cc ? map.heights[Math.round(cc.y) * vx + Math.round(cc.x)] : 0;
  const terrain = new MapTerrain(map, { cell: opts.cell, vertical: opts.cell, cx: map.width / 2, cy: map.height / 2, base }, { diffuse, normal, cliff });
  // The cliffs themselves: StarCraft II's tile meshes in the tileset's cliff material.
  const cliffs = cliff ? await buildCliffs(map, terrain, 'CliffNatural0', cliffTileMaterial(cliff)) : null;
  return { map, terrain, cliffs };
}
