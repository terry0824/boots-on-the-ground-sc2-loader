import * as THREE from 'three';
import { fetchBuffer } from '../../../src/engine/assets.ts';
import { sc2Url } from './textures.ts';
import type { MapTerrain } from '../../../src/engine/mapterrain.ts';
import { type ModelTemplate } from '../../../src/engine/model.ts';
import { loadModel } from './models.ts';
import { Emitters, particles, type BoneSource } from '../../../src/engine/particles.ts';
import type { Placement } from '../../../src/engine/mapdata.ts';
import type { GameData } from './data.ts';

/** Doodad types with no visible model of their own (lights, emitters, pathing, markers). */
const SKIP = /^(Normal|Decal|BlockPathing|PathingBlocker|LightOmni|LightSpot|RainEmitter|SnowEmitter|FootprintDoodad|Beacon|Invisible|Fluff)/i;

/** Nature scales with the map; things people build stay at human scale. */
const NATURAL = /tree|cactus|rock|crack|plant|bone|skeleton|cliff|vine|grass|crystal|mushroom|root|debris|boulder|spire|stump|bush|shrub|creep|rubble|dune|mesa|ridge|stalag|lava|crater|coral|fern|flower|weed|log|mineral|geyser|mountain|stone|pebble/i;
const WRECK = /wreck|ruin|destroyed|burnt|broken/i;
const BRIDGE = /bridge/i;

/**
 * Meters per model unit for a doodad type. StarCraft II draws scenery at a compressed scale
 * that matches its units (a Marine is about one unit tall); here the map is laid out at
 * `cell` meters per cell, natural scenery stretches with it, man-made props keep the scale of
 * a 2.3 m Marine, and wrecked buildings match the true-size buildings around them.
 */
export function doodadScale(type: string, cell: number, buildingScale: number): number {
  // A bridge has to span the chasm the map lays out.
  if (BRIDGE.test(type)) return cell;
  if (WRECK.test(type) && /barracks|bunker|commandcenter|factory|starport|depot|refinery|armory|bay|turret|building|house|hut/i.test(type)) return buildingScale;
  if (NATURAL.test(type)) return cell;
  return 2.6;
}

/**
 * A bridge's deck height (model units): the commonest height of the upward-facing surface in
 * its middle, where it's laid on the ground units walk on.
 */
function bridgeDeck(geometry: THREE.BufferGeometry): number {
  const g = geometry;
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const normal = g.getAttribute('normal') as THREE.BufferAttribute | undefined;
  g.computeBoundingBox();
  const box = g.boundingBox!;
  const half = { x: (box.max.x - box.min.x) * 0.25, z: (box.max.z - box.min.z) * 0.35 };
  const cx = (box.max.x + box.min.x) / 2;
  const cz = (box.max.z + box.min.z) / 2;
  const counts = new Map<number, number>();
  for (let i = 0; i < pos.count; i++) {
    if (normal && normal.getY(i) < 0.8) continue;
    if (Math.abs(pos.getX(i) - cx) > half.x || Math.abs(pos.getZ(i) - cz) > half.z) continue;
    const k = Math.round(pos.getY(i) * 50) / 50;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
}

/** Resolves a doodad type to its model file, the way the game does: actor, then model. */
export class DoodadCatalog {
  constructor(private data: GameData) {}

  /** Candidate model paths for a placement (the variation's file first). */
  paths(type: string, variation: number): string[] {
    const actors = this.data.actors;
    const modelId = actors.has(type) ? actors.value(type, 'Model') ?? type : type;
    const models = this.data.models;
    if (!models.has(modelId)) return [];
    const base = models.value(modelId, 'Model');
    if (!base) return [];
    const count = models.number(modelId, 'VariationCount', 0);
    const plain = base.replace(/\\/g, '/');
    if (count > 1) {
      const v = String(((variation % count) + count) % count).padStart(2, '0');
      return [plain.replace(/\.m3$/i, `_${v}.m3`), plain.replace(/\.m3$/i, '_00.m3'), plain];
    }
    return [plain, plain.replace(/\.m3$/i, '_00.m3')];
  }
}

/** The first of several paths that exists in the install. */
async function firstExisting(paths: string[]): Promise<string | null> {
  for (const p of paths) if (await fetchBuffer(sc2Url(p))) return p;
  return null;
}

export interface DoodadStats {
  placed: number;
  models: number;
  skipped: number;
  missing: string[];
  /** The doodads with particle emitters of their own (fires on wrecks, smoke, steam, beacons). */
  emitters: DoodadEmitters[];
}

/** A model's bones in its standing pose (model space, Y up). */
function standingPose(template: ModelTemplate, clip: THREE.AnimationClip | undefined): THREE.Matrix4[] {
  const probe = template.instantiate(new THREE.Color(1, 1, 1));
  if (clip) probe.mixer.clipAction(clip).play();
  probe.mixer.update(0);
  probe.object.updateMatrixWorld(true);
  return probe.mesh.skeleton.bones.map((b) => b.matrixWorld.clone());
}

/**
 * One doodad's emitters, run from its standing pose: a wreck's fire, a smokestack, a signal
 * light. Each starts at a random point of its loop so a street of burning cars doesn't pulse
 * in step.
 */
export class DoodadEmitters implements BoneSource {
  private time = Math.random() * 30;
  private emitters: Emitters;
  done = false;

  constructor(
    template: ModelTemplate,
    private pose: THREE.Matrix4[],
    private world: THREE.Matrix4,
    private clip: string,
    private at: THREE.Vector3,
    private scale: number,
  ) {
    this.emitters = new Emitters(template);
  }

  update(dt: number) {
    this.time += dt;
    this.emitters.density = particles.near(this.at, this.scale) ? particles.density : 0;
    this.emitters.update(dt, this.clip, this.time, true, this);
  }

  boneMatrix(index: number, out: THREE.Matrix4): THREE.Matrix4 | null {
    const p = this.pose[index];
    return p ? out.multiplyMatrices(this.world, p) : null;
  }
}

/**
 * A map's scenery: every placed doodad, grouped by model and drawn as one instanced mesh per
 * model, frozen in its standing pose. Casts and receives shadows.
 */
export async function placeDoodads(
  scene: THREE.Scene,
  terrain: MapTerrain,
  placements: Placement[],
  catalog: DoodadCatalog,
  buildingScale: number,
): Promise<DoodadStats> {
  const groups = new Map<string, Placement[]>();
  const stats: DoodadStats = { placed: 0, models: 0, skipped: 0, missing: [], emitters: [] };
  const resolved = new Map<string, Promise<string | null>>();
  const doodads = placements.filter((p) => p.kind === 'doodad');
  await Promise.all(
    doodads.map(async (p) => {
      if (SKIP.test(p.type)) {
        stats.skipped++;
        return;
      }
      const key = `${p.type}|${p.variation}`;
      let path = resolved.get(key);
      if (!path) {
        path = firstExisting(catalog.paths(p.type, p.variation));
        resolved.set(key, path);
      }
      const file = await path;
      if (!file) {
        if (!stats.missing.includes(p.type)) stats.missing.push(p.type);
        return;
      }
      const list = groups.get(file) ?? [];
      list.push(p);
      groups.set(file, list);
    }),
  );

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  await Promise.all(
    [...groups.entries()].map(async ([file, list]) => {
      let template: ModelTemplate;
      try {
        template = await loadModel(file);
      } catch {
        stats.missing.push(file);
        return;
      }
      const geometry = template.bakeStatic('Stand');
      // A bridge: its deck laid exactly on the ground units walk on.
      const bridge = BRIDGE.test(list[0].type);
      const deck = bridge ? bridgeDeck(geometry) : null;
      const mesh = new THREE.InstancedMesh(geometry, template.sharedMaterials(new THREE.Color(0x888888)), list.length);
      mesh.name = `doodad:${file.split('/').pop()}`;
      mesh.userData.placements = list;
      const stand = template.variants('Stand')[0] ?? [...template.clips.values()][0];
      const pose = particles.has(template) ? standingPose(template, stand) : null;
      list.forEach((p, i) => {
        const k = doodadScale(p.type, terrain.frame.cell, buildingScale);
        terrain.toWorld(p.x, p.y, p.z, pos);
        // Doodads sit on the ground they were placed on, whatever its height here.
        const ground = terrain.heightAt(pos.x, pos.z);
        if (deck !== null) pos.y = ground - deck * k * p.scale[2];
        else if (Math.abs(pos.y - ground) < 2 * terrain.frame.vertical) pos.y = ground + (pos.y - ground) * (k / terrain.frame.vertical);
        // StarCraft II facing (0 = east, counterclockwise); models face -Y in model space. A
        // bridge's model spans its X, where its placement turns its footprint's long side: a
        // quarter turn more, or its girders stand across the way over, walling it off.
        q.setFromAxisAngle(UP, p.rotation + Math.PI / 2 + (bridge ? Math.PI / 2 : 0));
        s.set(p.scale[0] * k, p.scale[2] * k, p.scale[1] * k);
        m.compose(pos, q, s);
        mesh.setMatrixAt(i, m);
        if (pose) stats.emitters.push(new DoodadEmitters(template, pose, m.clone(), stand?.name ?? 'Stand', pos.clone(), k));
      });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      scene.add(mesh);
      stats.placed += list.length;
      stats.models++;
    }),
  );
  return stats;
}
