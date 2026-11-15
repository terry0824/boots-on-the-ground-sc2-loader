import * as THREE from 'three';
import type { MapTerrain } from '../../../../src/engine/mapterrain.ts';
import type { MapData, Placement } from '../../../../src/engine/mapdata.ts';
import { BunkerGuns, GuardBrain, MedicBrain, TurretBrain, CrawlBrain } from '../../../../src/game/brains.ts';
import { FASTER, type DamageStats, type Stats } from '../../../../src/game/stats.ts';
import type { Building, Controller, Entity, Unit } from '../../../../src/game/entity.ts';
import { RANGE_METERS_PER_CELL, SPLASH_METERS_PER_CELL, type KindName } from '../../../../src/game/kinds.ts';
import { mapYaw } from '../../../../src/game/layout.ts';
import { beside, copies, ScriptBase, walkableNear } from '../../../../src/game/script.ts';
import { TankBrain } from '../../../../src/game/tank.ts';
import type { World } from '../../../../src/game/world.ts';

const RAYNOR = 'Jim Raynor';
const HORNER = 'Matt Horner';
const TYCHUS = 'Tychus Findlay';
const KERRIGAN = 'The Queen of Blades';

/** Real seconds the artifact takes to charge, by difficulty. */
const CHARGE_SECONDS = [400, 460, 520, 580];
/** Charge at which each Energy Nova comes ready. */
const NOVA_AT = [0.25, 0.5, 0.75];
/** About how many of a wave come out together. */
const PACK_SIZE = 20;

/** The Raiders' base as the map builds it: player 1's structures, by unit type. */
const STRUCTURES: Record<string, KindName> = {
  CommandCenter: 'holdfast',
  Barracks: 'barracks',
  Bunker: 'bunker',
  SupplyDepot: 'storehouse',
  MissileTurret: 'flakTower',
  EngineeringBay: 'workshop',
  Factory: 'motorPool',
  Starport: 'airfield',
  Armory: 'armory',
  FusionCore: 'reactorHall',
  MercCompound: 'hiringHall',
};

const v1 = new THREE.Vector3();

/** An additive ring wall: bright at its foot, fading up into the sky. */
function ringWallMaterial(hex: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(hex) }, opacity: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color; uniform float opacity; varying vec2 vUv;
      void main() {
        // A band of light along the ground, thinning upward. (Clamped: pow() of a hair below
        // zero is NaN, and bloom would smear one across the screen.)
        float f = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 5.0) * clamp(opacity, 0.0, 1.0);
        gl_FragColor = vec4(color * f, 1.0);
      }`,
  });
}

/**
 * The artifact's Energy Nova: a wall of light rolling out from the artifact, everything of
 * the swarm it passes through taking the blast. `lethal` is the final discharge, which no
 * Zerg on the field survives.
 */
class NovaWave {
  done = false;
  private t = 0;
  private wall: THREE.Mesh;
  private ring: THREE.Mesh;
  private struck = new Set<Entity>();
  private height: number;

  constructor(
    private w: World,
    private at: THREE.Vector3,
    private radius: number,
    private duration: number,
    private damage: number,
    private lethal = false,
    /** Spared by the wave (the Queen of Blades survives the final discharge). */
    private spare?: (e: Entity) => boolean,
  ) {
    this.height = lethal ? 180 : 70;
    this.wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 128, 1, true), ringWallMaterial(lethal ? 0xcfeaff : 0x8fd0ff));
    this.wall.frustumCulled = false;
    const ring = new THREE.RingGeometry(0.9, 1, 160);
    ring.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.ring.frustumCulled = false;
    w.scene.add(this.wall, this.ring);
    w.effects.flash(at.clone().setY(at.y + 20), lethal ? 200 : 80, 0xd8f0ff, lethal ? 1.2 : 0.4, lethal ? 600 : 250, true);
    w.effects.whiteout = Math.max(w.effects.whiteout, lethal ? 0.7 : 0.12);
    w.effects.shake = Math.max(w.effects.shake, lethal ? 2 : 0.8);
    w.audio.play('artifactAurora', { volume: 1, priority: 8 });
  }

  update(dt: number) {
    this.t += dt;
    const k = Math.min(1, this.t / this.duration);
    const r = Math.max(1, this.radius * (1 - (1 - k) * (1 - k)));
    const fade = 1 - THREE.MathUtils.smoothstep(this.t, this.duration * 0.6, this.duration + 0.8);
    this.wall.scale.set(r, this.height, r);
    this.wall.position.set(this.at.x, this.at.y - 20 + this.height / 2, this.at.z);
    (this.wall.material as THREE.ShaderMaterial).uniforms.opacity.value = fade;
    this.ring.scale.setScalar(r);
    this.ring.position.set(this.at.x, this.at.y + 0.6, this.at.z);
    (this.ring.material as THREE.MeshBasicMaterial).opacity = fade;
    // Dust thrown up along the front.
    for (let i = 0; i < 3 && k < 1; i++) {
      const a = Math.random() * Math.PI * 2;
      const x = this.at.x + Math.cos(a) * r;
      const z = this.at.z + Math.sin(a) * r;
      this.w.effects.smoke(v1.set(x, this.w.terrain.heightAt(x, z) + 1, z), 4 + Math.random() * 4, 0x5a5650, 1.4);
    }
    if (k < 1) {
      for (const e of this.w.unitsNear(this.at.x, this.at.z, r)) {
        if (e.team !== 'crawl' || this.struck.has(e)) continue;
        this.struck.add(e);
        if (this.spare?.(e)) continue;
        if (this.lethal) {
          e.minHp = 0;
          e.takeDamage(e.hp + 10000, null, this.at, false, 'Fire');
        } else e.takeDamage(this.damage, null, this.at, true, 'Fire');
        this.w.effects.flash(e.center(v1), Math.max(2, e.radius * 2), 0xbfe8ff, 0.25, 0, true);
      }
    }
    if (this.t > this.duration + 1) {
      this.w.scene.remove(this.wall, this.ring);
      this.wall.geometry.dispose();
      (this.wall.material as THREE.Material).dispose();
      this.ring.geometry.dispose();
      (this.ring.material as THREE.Material).dispose();
      this.done = true;
    }
  }
}

/**
 * Omega Storm: a crackling dome of psionic lightning where the Queen of Blades points, hurting
 * everything inside it every period, her own swarm included, as Psionic Storm does.
 */
class OmegaStorm {
  done = false;
  private left: number;
  private tick = 0;

  constructor(
    private w: World,
    private at: THREE.Vector3,
    private radius: number,
    private period: number,
    count: number,
    private damage: DamageStats,
  ) {
    this.left = count;
    w.audio.play('stormLaunch', { at, volume: 1, near: 30 });
  }

  update(dt: number) {
    const w = this.w;
    this.tick -= dt;
    // The storm's glow and its bolts, every frame.
    if (Math.random() < 0.6) w.effects.flash(v1.copy(this.at).setY(this.at.y + 4), this.radius * 1.8, 0x7a30d0, 0.12, 0, true);
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * this.radius;
      const x = this.at.x + Math.cos(a) * r;
      const z = this.at.z + Math.sin(a) * r;
      const ground = new THREE.Vector3(x, w.terrain.heightAt(x, z) + 0.3, z);
      const top = ground.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, 8 + Math.random() * 8, (Math.random() - 0.5) * 4));
      w.effects.tracer(top, ground, 0xd080ff, 0.18, 0.08);
      w.effects.flash(ground, 1.6, 0xe0a0ff, 0.08);
    }
    if (this.tick > 0) return;
    this.tick = this.period;
    this.left--;
    if (Math.random() < 0.6) w.audio.play('stormImpact', { at: this.at, volume: 0.8, near: 25, limit: 4 });
    for (const u of [...w.unitsNear(this.at.x, this.at.z, this.radius)]) u.hit(this.damage, null, 1, this.at, true);
    for (const b of [...w.buildings]) {
      if (Math.hypot(b.position.x - this.at.x, b.position.z - this.at.z) - b.radius <= this.radius) b.hit(this.damage, null, 1, this.at, true);
    }
    if (this.left <= 0) this.done = true;
  }
}

/** Implosion: the Queen of Blades crushes a vehicle from the inside, a few seconds after she marks it. */
class Implosion {
  done = false;
  private t = 0;

  constructor(
    private w: World,
    private target: Entity,
    private delay: number,
    onWarn?: (target: Entity) => void,
  ) {
    onWarn?.(target);
  }

  update(dt: number) {
    const w = this.w;
    const e = this.target;
    this.t += dt;
    if (!e.alive || e.stowed) {
      this.done = true;
      return;
    }
    // A dark vortex closing in.
    const k = this.t / this.delay;
    const c = e.center(v1);
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = e.radius * (2.2 - k * 1.6);
      w.effects.tracer(new THREE.Vector3(c.x + Math.cos(a) * r, c.y + (Math.random() - 0.3) * e.height, c.z + Math.sin(a) * r), c, 0x9040e0, 0.1, 0.06);
    }
    if (Math.random() < 0.5) w.effects.flash(c, e.radius * (1.4 - k * 0.6), 0x4a1a80, 0.1, 0, true);
    if (this.t >= this.delay) {
      w.effects.flash(c, e.radius * 4, 0xd0a0ff, 0.3, 120);
      w.effects.explosion(c, e.radius * 0.5);
      // Lethal to any crew but Echo's: a named squadmate's tank is left disabled for the
      // squad to get running again (see echo.ts).
      e.takeDamage(e.hp + 10000, null, null);
      this.done = true;
    }
  }
}

type KerriganState = 'emerging' | 'fighting' | 'burrowing' | 'gone';

/**
 * The Queen of Blades in the fight: Psi Blast at range, Razor Talons up close, an Omega Storm
 * on any knot of soldiers, Implosion on the tanks. Driven down to a quarter of her life, she
 * tunnels away to recover, and comes back.
 */
class KerriganBrain implements Controller {
  state: KerriganState = 'emerging';
  private timer = 1.6;
  private target: Entity | null = null;
  private retarget = 0;
  private stormIn = 3;
  private implodeIn = 10;
  private talons = 0;
  private aura = 0;
  private bark = 8;

  constructor(
    private u: Unit,
    private abilities: { storm(at: THREE.Vector3): void; implode(t: Entity): void },
    private onGone: () => void,
  ) {
    this.surface();
  }

  release() {
    this.u.world.engagePlayer(this.u, false);
  }

  /** Bursting up out of the ground. */
  private surface() {
    const u = this.u;
    this.state = 'emerging';
    this.timer = 1.6;
    u.customAnimation = true;
    u.visual.play('Unburrow', { loop: false, restart: true, fade: 0 });
    u.world.effects.explosion(u.position.clone().setY(u.position.y + 0.5), 2.5);
    u.world.effects.smoke(u.position, 6, 0x4a3a30, 3);
    u.world.audio.play('calyxAttack', { at: u.position, volume: 1, near: 50, bus: 'voice' });
  }

  /** Back from her tunnel at `at`, healed. */
  emerge(at: THREE.Vector3) {
    const u = this.u;
    u.position.copy(at).setY(u.world.terrain.heightAt(at.x, at.z));
    u.stowed = false;
    u.ignored = false;
    u.hp = u.maxHp;
    u.minHp = 1;
    u.syncTransform();
    this.stormIn = 4;
    this.implodeIn = 10;
    this.surface();
  }

  private burrow() {
    const u = this.u;
    this.state = 'burrowing';
    this.timer = 2.4;
    u.minHp = Math.max(1, u.hp);
    u.ignored = true;
    u.customAnimation = true;
    u.move.set(0, 0);
    u.visual.play('Burrow', { loop: false, restart: true });
    u.world.effects.smoke(u.position, 5, 0x4a3a30, 3);
    u.world.audio.play('calyxPissed', { at: u.position, volume: 1, near: 50, bus: 'voice' });
  }

  update(dt: number) {
    const u = this.u;
    const w = u.world;
    // A violet aura, so she reads at any distance.
    this.aura -= dt;
    if (this.aura <= 0 && this.state !== 'gone') {
      this.aura = 0.12;
      // At her chest, small enough to stay clear of the ground (which would cut it off square).
      w.effects.flash(u.center(v1).setY(u.position.y + u.height * 0.7), 1.9, 0x9a40ff, 0.2, 0, true);
    }
    u.move.set(0, 0);
    if (this.state === 'emerging') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = 'fighting';
        u.customAnimation = false;
      }
      return;
    }
    if (this.state === 'burrowing') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = 'gone';
        u.stowed = true;
        this.onGone();
      }
      return;
    }
    if (this.state === 'gone') return;
    if (u.hp <= u.maxHp * 0.25) return this.burrow();

    this.bark -= dt;
    if (this.bark <= 0) {
      this.bark = 14 + Math.random() * 10;
      w.audio.play('calyxAttack', { at: u.position, volume: 0.9, near: 40, bus: 'voice' });
    }
    this.retarget -= dt;
    if (this.retarget <= 0 || !this.target?.targetable) {
      this.retarget = 0.4;
      const allowed = (e: Entity) => e !== w.player || w.mayEngagePlayer(u);
      this.target = w.nearestTarget(u, 60, (e) => !e.isBuilding && allowed(e)) ?? w.nearestTarget(u, 24, allowed) ?? (w.goal?.alive ? w.goal : null);
      w.engagePlayer(u, this.target === w.player);
    }
    const t = this.target;

    // Abilities on their cooldowns.
    const reach = 10 * RANGE_METERS_PER_CELL;
    this.stormIn -= dt;
    if (this.stormIn <= 0) {
      const spot = this.stormSpot(reach);
      if (spot) {
        this.stormIn = 11 + Math.random() * 5;
        u.visual.play('Spell', { loop: false, restart: true });
        u.face = Math.atan2(spot.x - u.position.x, spot.z - u.position.z);
        this.abilities.storm(spot);
        return;
      }
      this.stormIn = 1.5;
    }
    this.implodeIn -= dt;
    if (this.implodeIn <= 0) {
      const victim = this.implodeTarget(reach);
      if (victim) {
        this.implodeIn = 20 + Math.random() * 6;
        u.visual.play('Spell', { loop: false, restart: true });
        this.abilities.implode(victim);
        return;
      }
      this.implodeIn = 2;
    }

    if (!t?.alive) return;
    u.face = null;
    const gap = u.gap(t);
    const psi = u.kind.weapon!;
    const talons = u.kind.secondary;
    this.talons -= dt;
    if (talons && gap <= talons.range + 1.5 && t !== w.goal) {
      u.face = Math.atan2(t.position.x - u.position.x, t.position.z - u.position.z);
      if (this.talons <= 0) {
        this.talons = talons.period;
        u.visual.play('Attack', { loop: false, restart: true, fade: 0.08 });
        t.hit(talons.damage, u);
        w.effects.ichor(t.center(v1), u.forward(new THREE.Vector3()), 6, t.kind.def.hitColor);
        w.sfx.play('hit.flesh', { at: t.position, volume: 1.2 });
      }
      return;
    }
    if (gap >= psi.minRange && gap <= psi.range) {
      u.face = Math.atan2(t.position.x - u.position.x, t.position.z - u.position.z);
      u.attack(t);
      return;
    }
    // Close in: straight at a soldier nearby, along the flow field (around the cliffs) to the
    // artifact or when the straight way is blocked.
    const dir = new THREE.Vector2(t.position.x - u.position.x, t.position.z - u.position.z).normalize();
    const ahead = u.radius + 3;
    const blocked = !w.walkable(u.position.x + dir.x * ahead, u.position.z + dir.y * ahead);
    if ((t === w.goal || gap > 30 || blocked) && (w.flow.direction(u.position.x, u.position.z, dir) || w.flow.escape(u.position.x, u.position.z, dir))) {
      u.move.copy(dir);
      return;
    }
    u.move.copy(dir);
  }

  /** The thickest knot of the enemy she can reach (a bunker counts for its garrison), or the player. */
  private stormSpot(reach: number): THREE.Vector3 | null {
    const u = this.u;
    const w = u.world;
    const near: Entity[] = w.unitsNear(u.position.x, u.position.z, reach).filter((e) => e.team !== u.team && !e.flying);
    for (const b of w.buildings) if (b.team !== u.team && b.kind.name === 'bunker' && u.gap(b) < reach) near.push(b);
    let best: Entity | null = null;
    let bestN = 1;
    for (const e of near) {
      let n = 0;
      for (const o of near) if (Math.hypot(o.position.x - e.position.x, o.position.z - e.position.z) < 10) n += o.kind.name === 'bunker' ? 3 : 1;
      if (e === w.player) n += 2;
      if (n > bestN) {
        bestN = n;
        best = e;
      }
    }
    return best ? best.position.clone() : null;
  }

  /** A vehicle to crush: Siege Tanks first. */
  private implodeTarget(reach: number): Entity | null {
    const u = this.u;
    const w = u.world;
    return w.nearestEnemy(u.team, u.position.x, u.position.z, reach, (e) => !e.isBuilding && (e.kind.name === 'howitzer' || e.kind.name === 'howitzerMobile'));
  }
}

type Stage = 'charging' | 'firing' | 'done';

/**
 * All In, on Wings of Liberty's own Char map (tvalerian03): the Raiders' last base dug in
 * around the Xel'Naga artifact as it charges, the swarm coming at it down the map's own six
 * routes and over the ridges, and the Queen of Blades herself. Every quarter of the charge
 * the artifact can loose an Energy Nova; at full charge it fires for good.
 */
export class AllInScript extends ScriptBase {
  private artifact!: Building;
  private barracks: Building | null = null;
  private stage: Stage = 'charging';
  private charge = 0;
  private chargeSeconds: number;
  private novas = 0;
  private novasUsed = 0;
  private fired = new Set<string>();
  private queue: { at: number; kind: KindName; pos: THREE.Vector3 }[] = [];
  private calyx: Unit | null = null;
  private kerriganBrain: KerriganBrain | null = null;
  private kerriganBack = Infinity;
  /** When she first takes the field, behind the wave she leads in. */
  private kerriganAt = Infinity;
  private humIn = 0;
  private finale = 0;
  private trickle = 0;
  private storm: { damage: DamageStats; radius: number; period: number; count: number };
  private nova: { amount: number; cells: number; seconds: number };
  private implodeDelay: number;
  /** Brood Lords the player has brought down (the bonus objective). */
  private broodKills = 0;

  constructor(
    m: ConstructorParameters<typeof ScriptBase>[0],
    host: ConstructorParameters<typeof ScriptBase>[1],
    private map: MapData,
    private terrain: MapTerrain,
    data: Stats,
  ) {
    super(m, host);
    this.chargeSeconds = CHARGE_SECONDS[m.difficulty.level] ?? 460;
    this.storm = data.campaign.blightStorm();
    this.nova = data.campaign.aurora();
    this.implodeDelay = data.campaign.crush() / FASTER;
  }

  private at(x: number, y: number, step = 2): THREE.Vector3 {
    return walkableNear(this.w, this.terrain.toWorld(x, y), step);
  }

  private point(name: string): THREE.Vector3 | null {
    const p = this.map.placements.find((q) => q.kind === 'point' && q.name === name);
    return p ? this.at(p.x, p.y) : null;
  }

  private units(player: number): Placement[] {
    return this.map.placements.filter((p) => p.kind === 'unit' && p.player === player);
  }

  setup() {
    const w = this.w;
    const rifle = w.kinds.trooper.weapon!;
    let soldiers = 0;
    for (const p of this.units(1)) {
      const at = this.terrain.toWorld(p.x, p.y);
      const yaw = mapYaw(p.rotation);
      const structure = STRUCTURES[p.type] ?? (p.type.startsWith('DefenseWall') ? 'defenseWall' : null);
      if (p.type === 'Artifact') {
        this.artifact = w.spawnBuilding('artifact', at.x, at.z, yaw, 'holdouts');
        this.artifact.visual.play('Stand Work');
      } else if (structure) {
        const b = w.spawnBuilding(structure, at.x, at.z, yaw, 'holdouts');
        if (structure === 'bunker') b.controller = new BunkerGuns(b, { ...rifle, range: rifle.range + this.m.bunkerBonus });
        else if (structure === 'flakTower') b.controller = new TurretBrain(b);
        else if (structure === 'barracks') this.barracks = b;
      } else if (p.type === 'SiegeTankSieged') {
        const pos = this.at(p.x, p.y);
        w.spawnUnit('howitzer', pos.x, pos.z, yaw, (u) => new TankBrain(u, u.position.clone()));
      } else if (p.type === 'Marine' || p.type === 'Marauder' || p.type === 'Medic') {
        const kind: KindName = p.type === 'Marine' ? 'trooper' : p.type === 'Marauder' ? 'grenadier' : 'medic';
        // The map's garrison, bigger at higher difficulties.
        const n = kind === 'medic' ? 1 : copies(this.m.difficulty.allies, soldiers++);
        for (let k = 0; k < n; k++) {
          const pos = k === 0 ? this.at(p.x, p.y, 1.5) : beside(w, this.at(p.x, p.y, 1.5));
          const u = w.spawnUnit(kind, pos.x, pos.z, yaw, (x) => (kind === 'medic' ? new MedicBrain(x, null, pos.clone()) : new GuardBrain(x, pos.clone(), 18, 50)));
          // Fallen defenders are replaced from the Barracks (as the base's Marines are).
          if (kind !== 'medic') (u as Unit & { post?: THREE.Vector3 }).post = pos.clone();
        }
      }
    }
    this.m.holdfast = this.artifact;
    this.m.barracks = this.barracks ? [this.barracks] : [];
    this.m.baseName = "XEL'NAGA ARTIFACT";
    this.m.baseLost = 'The artifact has been destroyed.';
    w.goal = this.artifact;
    w.perimeter = 200;
    w.updatePaths();
  }

  respawnPoint(): THREE.Vector3 {
    const p = this.point(Math.random() < 0.5 ? 'Briefing Holdout Left' : 'Briefing Holdout Right') ?? this.artifact.position;
    return walkableNear(this.w, p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 10)), 2);
  }

  start() {
    this.host.ship.station = this.artifact.position.clone();
    this.say(HORNER, 'ashby', "The artifact's in the containment rig and drawing power. The science team says it needs time. A lot of it.");
    this.say(RAYNOR, 'harlan', 'Then we give it time. Everything the Raiders have left is on this ridge. Nothing touches that artifact.');
    this.say(TYCHUS, 'tolliver', 'Hell of a place for a last stand, Jimmy.', 3);
    this.say(RAYNOR, 'harlan', "It's the only place left.", 2.8);
    this.m.progress.set('charge', '0%');
    this.m.setWaypoint(this.artifact.position, 'Artifact', 22);
    this.updateMeter();
  }

  /** G: the Energy Nova, if the artifact has one stored. */
  action() {
    if (this.stage !== 'charging' || this.novas <= 0) return;
    this.novas--;
    this.novasUsed++;
    this.complete('nova');
    const at = this.artifact.position.clone();
    this.w.timed.push(
      new NovaWave(this.w, at, this.nova.cells * SPLASH_METERS_PER_CELL, Math.max(1.2, this.nova.seconds / FASTER), this.nova.amount),
    );
    this.artifact.visual.play('Stand Work Start', { loop: false, restart: true });
    this.m.onMessage?.('ENERGY NOVA', 'The artifact releases its charge', 2.5);
  }

  /** The artifact at the top of the screen: how charged, and whether a Nova is ready. */
  private updateMeter() {
    const pct = Math.floor(this.charge * 100);
    this.m.meter = {
      label: this.stage === 'charging' ? `XEL'NAGA ARTIFACT · CHARGING ${pct}%` : "XEL'NAGA ARTIFACT · FULLY CHARGED",
      value: this.charge,
      text: this.novas > 0 ? `ENERGY NOVA READY ×${this.novas} · PRESS G` : this.stage === 'charging' ? `Next Energy Nova at ${Math.round((NOVA_AT.find((n) => n > this.charge) ?? 1) * 100)}%` : '',
      ticks: NOVA_AT,
    };
  }

  /** Ground forces from the map's routes ("Spawn 1 Gather" ...), queued over `over` seconds. */
  private ground(routes: number[], mix: [KindName, number][], over = 10) {
    const scale = this.m.difficulty.waveScale;
    const spots = routes.map((r) => this.point(`Spawn ${r} Gather`)).filter((p): p is THREE.Vector3 => !!p);
    if (!spots.length) return;
    const units: KindName[] = [];
    for (const [kind, count] of mix) for (let k = 0; k < Math.max(1, Math.round(count * scale)); k++) units.push(kind);
    this.packs(units, over, (i) => spots[i % spots.length], 24);
  }

  /**
   * Queues `units` as packs over `over` seconds: each pack bursts out together around its
   * spot (`spread` meters across), so the swarm marches as a mass rather than in single file.
   */
  private packs(units: KindName[], over: number, spot: (pack: number) => THREE.Vector3, spread: number) {
    for (let k = units.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      [units[k], units[j]] = [units[j], units[k]];
    }
    const count = Math.max(1, Math.round(units.length / PACK_SIZE));
    for (let p = 0; p < count; p++) {
      const at = this.w.time + (count > 1 ? (p / (count - 1)) * over : 0);
      const s = spot(p);
      for (const kind of units.slice(Math.round((p * units.length) / count), Math.round(((p + 1) * units.length) / count))) {
        this.queue.push({ at: at + Math.random() * 0.5, kind, pos: s.clone().add(new THREE.Vector3((Math.random() - 0.5) * spread, 0, (Math.random() - 0.5) * spread)) });
      }
    }
  }

  /** Flyers from one of the Zerg bases ("Start Location - Zerg East [5]"), straight over the ridges. */
  private air(from: string, mix: [KindName, number][], over = 6) {
    const p = this.map.placements.find((q) => q.kind === 'point' && q.name === from);
    if (!p) return;
    const s = this.terrain.toWorld(p.x, p.y);
    // From the edge of the map nearest that base.
    const toward = this.artifact.position;
    for (let i = 0; i < 40 && !this.terrain.playable(s.x, s.z); i++) s.lerp(toward, 0.05);
    const scale = this.m.difficulty.waveScale;
    const units: KindName[] = [];
    for (const [kind, count] of mix) for (let k = 0; k < Math.max(1, Math.round(count * scale)); k++) units.push(kind);
    this.packs(units, over, () => s, 40);
  }

  private spawnQueued() {
    const w = this.w;
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i];
      if (q.at > w.time) continue;
      this.queue.splice(i, 1);
      const flying = w.kinds[q.kind].flying > 0;
      const pos = flying ? q.pos : walkableNear(w, q.pos, 3);
      const toward = this.artifact.position;
      w.spawnUnit(q.kind, pos.x, pos.z, Math.atan2(toward.x - pos.x, toward.z - pos.z), (u) => new CrawlBrain(u));
    }
  }

  /** The Queen of Blades takes the field (or comes back) from a route's gathering point, behind her swarm. */
  private summonKerrigan(route: number) {
    const w = this.w;
    const at = this.point(`Spawn ${route} Gather`) ?? this.point('Spawn 4 Gather') ?? this.artifact.position;
    if (this.calyx?.alive && this.kerriganBrain) {
      if (this.kerriganBrain.state === 'gone') this.kerriganBrain.emerge(at);
      return;
    }
    let brain!: KerriganBrain;
    const abilities = {
      storm: (p: THREE.Vector3) => w.timed.push(new OmegaStorm(w, p, this.storm.radius * SPLASH_METERS_PER_CELL, this.storm.period / FASTER, this.storm.count, this.storm.damage)),
      implode: (t: Entity) =>
        w.timed.push(
          new Implosion(w, t, this.implodeDelay, (victim) => {
            if (victim === this.body()) this.m.onMessage?.('IMPLOSION', 'She has your tank. Get out!', 2.5);
            else this.say(HORNER, 'ashby', "She's crushing our tanks from the inside!", 2.6);
          }),
        ),
    };
    this.calyx = w.spawnUnit('calyx', at.x, at.z, 0, (u) => (brain = new KerriganBrain(u, abilities, () => this.kerriganGone())));
    this.kerriganBrain = brain;
    this.m.boss = { name: 'KERRIGAN', sub: 'QUEEN OF BLADES', unit: this.calyx };
  }

  private kerriganGone() {
    this.reveal('calyx');
    this.complete('calyx');
    this.say(HORNER, 'ashby', "She's gone to ground! She'll be back, Commander. Count on it.", 3);
    this.say(KERRIGAN, 'calyx', 'Enjoy it while it lasts, Jim.', 2.6);
    this.kerriganBack = this.w.time + 55;
  }

  /** An event the first time the charge passes `at`. */
  private event(id: string, at: number, run: () => void) {
    if (this.charge >= at && !this.fired.has(id)) {
      this.fired.add(id);
      run();
    }
  }

  /** Called by the game when the player kills something (the Brood Lord bonus). */
  playerKilled(e: Entity) {
    if (e.kind.name === 'sower') {
      this.broodKills++;
      this.complete('broodlord');
    }
  }

  protected tick(dt: number) {
    const w = this.w;
    this.spawnQueued();
    // The base's SCVs patch up whatever isn't under fire (never the artifact: nobody knows how).
    for (const b of w.buildings) {
      if (b === this.artifact || b.team !== 'holdouts' || b.hp >= b.maxHp) continue;
      if (w.time - b.lastHurt > 6) b.hp = Math.min(b.maxHp, b.hp + 3 * dt);
    }
    this.humIn -= dt;
    if (this.humIn <= 0) {
      this.humIn = 7;
      w.audio.play('artifactHum', { at: this.artifact.position, volume: 0.7, near: 60 });
    }
    if (this.stage === 'charging') {
      this.charge = Math.min(1, this.charge + dt / this.chargeSeconds);
      for (const n of NOVA_AT) {
        this.event(`nova${n}`, n, () => {
          this.novas++;
          w.audio.play('warheadReady', { volume: 0.8 });
          if (!this.fired.has('novaTip')) {
            this.fired.add('novaTip');
            this.reveal('nova');
            this.say(HORNER, 'ashby', "The artifact's throwing off energy, Commander. The rig can release it in one pulse. Your call: press G.", 4);
          } else this.say(HORNER, 'ashby', 'Another pulse is ready. G, when you need it.', 2.6);
        });
      }
      this.m.progress.set('charge', `${Math.floor(this.charge * 100)}%`);
      this.timeline(dt);
      if (this.charge >= 1) this.discharge();
    } else if (this.stage === 'firing') {
      this.finale -= dt;
      if (this.finale <= 0 && !this.fired.has('ending')) {
        this.fired.add('ending');
        this.complete('charge');
        this.say(HORNER, 'ashby', "The Zerg... they're dropping. All of them. As far as the scanners reach.", 3.5);
        this.say(TYCHUS, 'tolliver', 'Well, I\'ll be damned.', 2.4);
        this.say(RAYNOR, 'harlan', "It's over. Get the medics up here. And somebody find me a dropship.", 3.5);
        this.stage = 'done';
      }
    } else if (this.stage === 'done' && this.m.radio.idle) {
      this.m.win("The artifact fired. The swarm on Char is broken.");
    }
    this.updateMeter();

    if (w.time >= this.kerriganAt) {
      this.kerriganAt = Infinity;
      this.summonKerrigan(4);
    }
    // Kerrigan back from her tunnel.
    if (this.kerriganBrain?.state === 'gone' && w.time >= this.kerriganBack && this.stage === 'charging') {
      this.kerriganBack = Infinity;
      this.summonKerrigan([1, 4, 5][Math.floor(Math.random() * 3)]);
      this.say(KERRIGAN, 'calyx', 'Did you think I would stay down, Jim?', 2.6);
    }
  }

  /** The swarm's assault, keyed to how far the artifact has charged. */
  private timeline(dt: number) {
    const e = (id: string, at: number, run: () => void) => this.event(id, at, run);
    e('w1', 0.015, () => {
      this.say(HORNER, 'ashby', 'Zerg moving up the west canyons. Here they come.', 2.8);
      this.ground([1], [['hound', 20], ['shellback', 6]]);
    });
    e('w2', 0.08, () => this.ground([2], [['hound', 22], ['quillback', 8]]));
    e('w3', 0.15, () => {
      this.ground([1, 3], [['hound', 26], ['shellback', 8], ['quillback', 8], ['blister', 10]]);
      this.say(HORNER, 'ashby', 'Banelings in the pack! Shoot them before they reach the line.', 3);
    });
    e('air1', 0.2, () => {
      this.air('Start Location - Zerg Special [3]', [['kite', 10]]);
      this.say(HORNER, 'ashby', "Mutalisks, coming in low from the south-east! Tanks can't touch them. Turrets and rifles, get them!", 3.6);
    });
    e('w4', 0.27, () => this.ground([4], [['hound', 32], ['blister', 12], ['shellback', 10]]));
    e('w5', 0.35, () => {
      this.ground([5, 6], [['hound', 24], ['quillback', 10], ['tusker', 2], ['blister', 8]]);
      this.air('Start Location - Zerg East [5]', [['kite', 10]]);
      this.say(HORNER, 'ashby', 'Ultralisks out of the east, and more flyers behind them!', 3);
    });
    e('w6', 0.42, () => this.ground([2, 3], [['hound', 30], ['shellback', 10], ['quillback', 10]]));
    e('calyx', 0.5, () => {
      this.say(HORNER, 'ashby', "Commander... it's her. Kerrigan's on the field.", 2.8);
      this.say(KERRIGAN, 'calyx', 'Jim. You came all this way just to die on my world?', 3.2);
      this.say(RAYNOR, 'harlan', 'I came to finish this, darlin\'. One way or another.', 3);
      this.ground([4], [['hound', 40], ['quillback', 16], ['shellback', 10], ['blister', 14]], 10);
      this.kerriganAt = this.w.time + 12;
    });
    e('w8', 0.58, () => {
      this.ground([1], [['hound', 36], ['quillback', 16], ['tusker', 3]]);
      this.air('Start Location - Zerg Main [2]', [['kite', 8]]);
    });
    e('air3', 0.65, () => {
      this.air('Start Location - Zerg East [5]', [['sower', 4], ['kite', 12]], 10);
      this.reveal('broodlord');
      this.say(HORNER, 'ashby', "Brood Lords over the north-east ridge! They'll shell us from out past the tanks. Somebody get out there and bring them down!", 4);
    });
    e('w9', 0.7, () => this.ground([5, 6], [['hound', 50], ['blister', 18], ['tusker', 4]], 14));
    e('w10', 0.8, () => {
      this.ground([1, 2, 3], [['hound', 60], ['shellback', 20], ['quillback', 20]], 16);
      this.air('Start Location - Zerg South [4]', [['sower', 3], ['kite', 8]], 10);
    });
    e('final', 0.9, () => {
      this.say(HORNER, 'ashby', "It's almost there! Ninety percent!", 2.4);
      this.say(KERRIGAN, 'calyx', 'Everything I have is coming for you now.', 2.8);
      this.say(RAYNOR, 'harlan', 'Hold on! Just a little longer!', 2.4);
      if (!this.calyx?.alive || this.kerriganBrain?.state === 'gone') this.summonKerrigan(1);
      this.ground([1, 2, 3, 4, 5, 6], [['hound', 90], ['quillback', 30], ['shellback', 24], ['tusker', 6], ['blister', 24]], 24);
      this.air('Start Location - Zerg Main [2]', [['kite', 20], ['sower', 6]], 14);
    });
    // In the last stretch, the swarm doesn't stop.
    if (this.charge > 0.9) {
      this.trickle -= dt;
      if (this.trickle <= 0) {
        this.trickle = 6;
        this.ground([1 + Math.floor(Math.random() * 6)], [['hound', 8], ['quillback', 3]], 4);
      }
    }
  }

  /** Full charge: the artifact fires, and a wave of light crosses Char. */
  private discharge() {
    const w = this.w;
    this.stage = 'firing';
    this.finale = 6.5;
    this.queue.length = 0;
    this.m.setWaypoint(null);
    this.m.onMessage?.('THE ARTIFACT FIRES', '', 4);
    this.say(HORNER, 'ashby', "Full charge! It's going!", 2);
    // (Its own "Death" sequence fades smoke layers by animated layer alpha, which isn't drawn
    // yet; the charge's end and the light carry the moment instead.)
    this.artifact.visual.play('Stand Work End', { loop: false, restart: true });
    this.artifact.minHp = this.artifact.hp;
    w.timed.push(new NovaWave(w, this.artifact.position.clone(), 1400, 5.5, 0, true, (e) => e === this.calyx));
    for (const name of ['Victory 5 Blast', 'Victory 6 Blast', 'Victory 7 Blast', 'Victory 8 Blast']) {
      const p = this.point(name);
      if (!p) continue;
      w.effects.flash(p.clone().setY(p.y + 30), 160, 0xd8f0ff, 1.4, 300, true);
      w.effects.explosion(p.clone().setY(p.y + 4), 12);
    }
    if (this.calyx?.alive) {
      // The wave strips her of the swarm; she falls, alive.
      this.calyx.minHp = 1;
      this.calyx.stowed = false;
      this.calyx.ignored = true;
      this.calyx.setController(null);
      this.calyx.customAnimation = true;
      this.calyx.move.set(0, 0);
      this.calyx.visual.play('Death', { loop: false, restart: true });
    }
    this.m.boss = null;
  }
}
