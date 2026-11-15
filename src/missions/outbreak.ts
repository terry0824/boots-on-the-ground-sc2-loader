import * as THREE from 'three';
import type { MapTerrain } from '../../../../src/engine/mapterrain.ts';
import type { MapData, Placement } from '../../../../src/engine/mapdata.ts';
import { BunkerGuns, GuardBrain, MedicBrain, TurretBrain, CrawlBrain } from '../../../../src/game/brains.ts';
import type { Building, Controller, Entity, Unit } from '../../../../src/game/entity.ts';
import type { KindName } from '../../../../src/game/kinds.ts';
import { mapYaw } from '../../../../src/game/layout.ts';
import { beside, copies, ScriptBase, walkableNear } from '../../../../src/game/script.ts';
import { TankBrain } from '../../../../src/game/tank.ts';

const RAYNOR = 'Jim Raynor';
const HORNER = 'Matt Horner';

/** Real seconds of each part of the day. */
const DAY = 150;
const DUSK = 10;
const NIGHT = 140;
/** Waves come in the night's first stretch, so they're at the walls before dawn. */
const WAVE_WINDOW = 80;
const DAWN = 10;
/** Infested buildings to burn out, by difficulty. */
const NEEDED = [6, 10, 14, 18];
/** Below this much of its life an infested building catches and burns down on its own. */
const CATCH = 0.5;
/** How fast a burning building goes, a fraction of its life per real second. */
const BURN = 0.03;

/** The colony's infested structures, by unit type, as the kinds that draw them. */
const INFESTED: Record<string, KindName> = {
  InfestableHut: 'overgrownHut',
  InfestableBiodome: 'overgrownDome',
  InfestedSupply: 'storehouse',
  InfestedCC: 'holdfast',
  InfestedBarracks: 'barracks',
  InfestedBunker: 'bunker',
  InfestedMissileTurret: 'flakTower',
  InfestedEngBay: 'workshop',
  InfestedFactory: 'motorPool',
  InfestedArmory: 'armory',
  InfestedStarport: 'airfield',
};

/** The Raiders' base on the map. */
const BASE: Record<string, KindName> = {
  CommandCenter: 'holdfast',
  Barracks: 'barracks',
  SupplyDepot: 'storehouse',
  MercCompound: 'hiringHall',
};

type Phase = 'day' | 'dusk' | 'night' | 'dawn';

/**
 * Dawn: the infested go back to cover, the nearest building still standing, and vanish inside;
 * anything with a Raider close enough to bite fights on.
 */
class ShelterBrain implements Controller {
  private inner: CrawlBrain;

  constructor(
    private u: Unit,
    private shelter: () => Building | null,
  ) {
    this.inner = new CrawlBrain(u);
  }

  release() {
    this.inner.release();
  }

  private left = 30;

  update(dt: number) {
    const u = this.u;
    const w = u.world;
    if (w.nearestEnemy(u.team, u.position.x, u.position.z, 14)) return this.inner.update(dt);
    const b = this.shelter();
    this.left -= dt;
    // In under cover (or, out in the open too long, down into the ground somewhere).
    if (!b || u.gap(b) < 3 || this.left <= 0) {
      w.effects.smoke(u.position, 1.2, 0x5a5040, 1.2);
      w.despawn(u);
      return;
    }
    u.face = null;
    u.move.set(b.position.x - u.position.x, b.position.z - u.position.z).normalize();
  }
}

/**
 * Outbreak, on Wings of Liberty's own Meinhoff map (thanson02): the colony's people have
 * turned. By day the infested shelter in the colony's huts, domes and buildings, and the
 * Raiders burn them out; at night they pour out of whatever is still standing and come for
 * the base. Every building burned by day is one less door at night.
 */
export class OutbreakScript extends ScriptBase {
  private phase: Phase = 'day';
  private phaseLeft = DAY;
  private night = 0;
  private infested: Building[] = [];
  private destroyed = 0;
  private needed: number;
  private dormant: Unit[] = [];
  private aberrations: Unit[] = [];
  private cc!: Building;
  private waveIn = 0;
  private wavesLeft = 0;
  private moanIn = 4;
  private fireFx = 0;
  private firstWave = false;
  private pointIn = 0;
  private ended = false;

  constructor(
    m: ConstructorParameters<typeof ScriptBase>[0],
    host: ConstructorParameters<typeof ScriptBase>[1],
    private map: MapData,
    private terrain: MapTerrain,
  ) {
    super(m, host);
    this.needed = NEEDED[m.difficulty.level] ?? 15;
  }

  /** Meinhoff's nights: Echo falls back to the walls at dusk and rejoins the player at dawn. */
  echoHold(): THREE.Vector3 | null | undefined {
    const cc = this.m.holdfast;
    if (!cc) return undefined;
    return this.phase === 'dusk' || this.phase === 'night' ? cc.position : null;
  }

  private at(x: number, y: number, step = 2): THREE.Vector3 {
    return walkableNear(this.w, this.terrain.toWorld(x, y), step);
  }

  private units(player: number): Placement[] {
    return this.map.placements.filter((p) => p.kind === 'unit' && p.player === player);
  }

  setup() {
    const w = this.w;
    const rifle = w.kinds.trooper.weapon!;
    let soldiers = 0;
    for (const p of this.units(1)) {
      const yaw = mapYaw(p.rotation);
      const kind = BASE[p.type];
      if (kind) {
        const at = this.terrain.toWorld(p.x, p.y);
        const b = w.spawnBuilding(kind, at.x, at.z, yaw, 'holdouts');
        if (kind === 'holdfast') this.cc = b;
        if (kind === 'barracks') this.m.barracks.push(b);
      } else if (p.type === 'Marine' || p.type === 'Firebat' || p.type === 'Medic') {
        const k: KindName = p.type === 'Marine' ? 'trooper' : p.type === 'Firebat' ? 'burner' : 'medic';
        // The map's garrison, bigger at higher difficulties.
        const n = k === 'medic' ? 1 : copies(this.m.difficulty.allies, soldiers++);
        for (let c = 0; c < n; c++) {
          const pos = c === 0 ? this.at(p.x, p.y, 1.5) : beside(w, this.at(p.x, p.y, 1.5));
          const u = w.spawnUnit(k, pos.x, pos.z, yaw, (x) => (k === 'medic' ? new MedicBrain(x, null, pos.clone()) : new GuardBrain(x, pos.clone(), 16, 40)));
          if (k === 'trooper') (u as Unit & { post?: THREE.Vector3 }).post = pos.clone();
        }
      }
    }
    // The infested colony. Every other depot and cocoon: the map's numbers are an RTS's.
    let skip = false;
    for (const p of this.units(3)) {
      const yaw = mapYaw(p.rotation);
      const kind = INFESTED[p.type];
      if (kind) {
        if (p.type === 'InfestedSupply' && (skip = !skip)) continue;
        const at = this.terrain.toWorld(p.x, p.y);
        const b = w.spawnBuilding(kind, at.x, at.z, yaw, 'crawl');
        if (kind === 'bunker') b.controller = new BunkerGuns(b, { ...rifle, range: rifle.range * 0.8 });
        if (kind === 'flakTower') b.controller = new TurretBrain(b);
        this.infested.push(b);
      } else if (p.type === 'InfestedCocoon') {
        if ((skip = !skip)) continue;
        const at = this.at(p.x, p.y, 1.5);
        w.spawnBuilding('cocoon', at.x, at.z, yaw, 'crawl');
      } else if (p.type === 'InfestedCivilian' || p.type === 'InfestedTerranCampaign' || p.type === 'InfestedAbomination') {
        if (p.type === 'InfestedCivilian' && (skip = !skip)) continue;
        const k: KindName = p.type === 'InfestedCivilian' ? 'turnedColonist' : p.type === 'InfestedTerranCampaign' ? 'turnedTrooper' : 'swollen';
        const pos = this.at(p.x, p.y, 1.5);
        // By day they shelter where they stand, and only go for whoever comes close.
        const u = w.spawnUnit(k, pos.x, pos.z, yaw, (x) => new GuardBrain(x, pos.clone(), 10, 22));
        this.dormant.push(u);
        if (k === 'swollen') this.aberrations.push(u);
      }
    }
    // The Raiders dug in at both outposts: a bunker at each, ahead of the soldiers there.
    const posts = [
      [69.5, 115.5],
      [81, 105],
    ];
    for (const [x, y] of posts) {
      const at = this.terrain.toWorld(x, y);
      const out = at.clone().sub(this.terrain.toWorld(73.5, 91.5)).setY(0).normalize();
      const p = walkableNear(w, at.clone().addScaledVector(out, 10), 3);
      const b = w.spawnBuilding('bunker', p.x, p.z, Math.atan2(out.x, out.z), 'holdouts');
      b.controller = new BunkerGuns(b, { ...rifle, range: rifle.range + this.m.bunkerBonus });
    }
    this.m.holdfast = this.cc;
    w.goal = this.cc;
    w.perimeter = 150;
    w.updatePaths();
    this.fortify(rifle);
    w.updatePaths();
    this.m.progress.set('buildings', `0/${this.needed}`);
  }

  /**
   * The Raiders dug in where the night will come from: follow the paths from the nearest
   * infested nests to the Command Center, and where each one reaches the base, a bunker with
   * a sieged tank behind it.
   */
  private fortify(rifle: NonNullable<import('../../../../src/game/kinds.ts').Kind['weapon']>) {
    const w = this.w;
    const cc = this.cc.position;
    const nests = this.infested
      .map((b) => ({ b, d: Math.hypot(b.position.x - cc.x, b.position.z - cc.z) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 8);
    const placed: THREE.Vector3[] = [];
    const dir = new THREE.Vector2();
    for (const { b } of nests) {
      // Walk the swarm's own path in from this nest until it's 55 m out from the Command Center.
      const p = b.position.clone();
      for (let i = 0; i < 300; i++) {
        if (Math.hypot(p.x - cc.x, p.z - cc.z) < 55) break;
        if (!w.flow.direction(p.x, p.z, dir) && !w.flow.escape(p.x, p.z, dir)) break;
        p.x += dir.x * 3;
        p.z += dir.y * 3;
      }
      if (Math.hypot(p.x - cc.x, p.z - cc.z) > 70) continue;
      if (placed.some((q) => q.distanceTo(p) < 40)) continue;
      placed.push(p.clone());
      const out = new THREE.Vector3(p.x - cc.x, 0, p.z - cc.z).normalize();
      const at = walkableNear(w, p, 3);
      const bunker = w.spawnBuilding('bunker', at.x, at.z, Math.atan2(out.x, out.z), 'holdouts');
      bunker.controller = new BunkerGuns(bunker, { ...rifle, range: rifle.range + this.m.bunkerBonus });
      const tank = walkableNear(w, at.clone().addScaledVector(out, -18), 3);
      w.spawnUnit('howitzer', tank.x, tank.z, Math.atan2(out.x, out.z), (u) => new TankBrain(u, u.position.clone()));
      if (placed.length >= 3) break;
    }
  }

  respawnPoint(): THREE.Vector3 {
    const b = this.m.barracks.find((x) => x.alive) ?? this.cc;
    const out = new THREE.Vector3();
    b.forward(out).multiplyScalar(b.radius + 5).add(b.position);
    return walkableNear(this.w, out.add(new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6)), 2);
  }

  start() {
    this.say(HORNER, 'ashby', "Meinhoff. The infestation went through this colony in a week. Anything that walks out there isn't a colonist anymore.");
    this.say(RAYNOR, 'harlan', "By day they hide in the buildings. So we burn the buildings. By night, they'll come to us.");
    this.say(RAYNOR, 'harlan', 'Firebats up front. And Corporal: every hut you torch today is one less door they come out of tonight.', 4);
    this.say(HORNER, 'ashby', "Get a building past half and it'll burn the rest of the way down on its own. The tanks at the base can do that from range, if someone drives one out.", 4.5);
    this.host.setNight?.(0);
    this.nearestTarget();
  }

  /** Points the player at the closest infested building still standing. */
  private nearestTarget() {
    const from = this.body()?.position ?? this.cc.position;
    let best: Building | null = null;
    let bestD = Infinity;
    for (const b of this.infested) {
      if (!b.alive) continue;
      const d = Math.hypot(b.position.x - from.x, b.position.z - from.z);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    this.m.setWaypoint(best ? best.position : null, 'Infested building', best ? best.radius + 4 : 4);
  }

  /** Called by the game when anything dies: infested buildings burst open, the count goes up. */
  died(e: Entity) {
    const i = this.infested.indexOf(e as Building);
    if (i >= 0) {
      this.infested.splice(i, 1);
      this.destroyed++;
      this.m.progress.set('buildings', `${Math.min(this.destroyed, this.needed)}/${this.needed}`);
      this.host.reward?.(50, 'Infested building');
      // Whatever sheltered inside comes out, burning or not.
      const n = e.kind.name === 'overgrownDome' ? 5 : e.kind.name === 'overgrownHut' ? 3 : 2;
      for (let k = 0; k < n; k++) {
        const p = walkableNear(this.w, e.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * e.radius * 2, 0, (Math.random() - 0.5) * e.radius * 2)), 2);
        this.w.spawnUnit(Math.random() < 0.8 ? 'turnedColonist' : 'turnedTrooper', p.x, p.z, Math.random() * 6.28, (u) => new CrawlBrain(u));
      }
      if (this.destroyed === 1) this.say(RAYNOR, 'harlan', "That's it. Keep 'em burning.", 2.4);
      if (this.destroyed >= this.needed && !this.ended) this.finish();
    }
    if (this.aberrations.includes(e as Unit) && this.aberrations.every((a) => !a.alive)) this.complete('aberrations');
  }

  private finish() {
    this.ended = true;
    this.complete('buildings');
    this.say(HORNER, 'ashby', "That's the last of the nests near the colony. The infestation's broken, Commander.", 3);
    this.say(RAYNOR, 'harlan', "Then let's not stick around for another night. Mount up.", 2.8);
  }

  /** The infested building nearest a unit, still standing. */
  private nearestShelter(u: Unit): Building | null {
    let best: Building | null = null;
    let bestD = Infinity;
    for (const b of this.infested) {
      if (!b.alive) continue;
      const d = Math.hypot(b.position.x - u.position.x, b.position.z - u.position.z);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  /** A night wave: out of the infested buildings nearest the base, for the Command Center. */
  private wave() {
    const w = this.w;
    const base = this.cc.position;
    const doors = this.infested
      .filter((b) => b.alive)
      .map((b) => ({ b, d: Math.hypot(b.position.x - base.x, b.position.z - base.z) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 6)
      .map((x) => x.b);
    if (!doors.length) return;
    const scale = this.m.difficulty.waveScale;
    const mix: [KindName, number][] = [
      ['turnedColonist', 12 + this.night * 6],
      ['turnedTrooper', 3 + this.night * 3],
      // An Aberration leads every night's first wave, more as the nights go on.
      ...(this.firstWave ? ([['swollen', this.night]] as [KindName, number][]) : []),
    ];
    this.firstWave = false;
    let i = 0;
    for (const [kind, count] of mix) {
      for (let k = 0; k < Math.max(1, Math.round(count * scale)); k++, i++) {
        const door = doors[i % doors.length];
        const p = walkableNear(w, door.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * (door.radius * 2 + 8), 0, (Math.random() - 0.5) * (door.radius * 2 + 8))), 2);
        w.spawnUnit(kind, p.x, p.z, Math.atan2(base.x - p.x, base.z - p.z), (u) => new CrawlBrain(u));
      }
    }
  }

  protected tick(dt: number) {
    const w = this.w;
    // Buildings past saving burn down by themselves: the work only has to be started.
    this.fireFx -= dt;
    const fx = this.fireFx <= 0;
    if (fx) this.fireFx = 0.12;
    for (const b of this.infested) {
      if (!b.alive || b.hp > b.maxHp * CATCH) continue;
      b.takeDamage(b.maxHp * BURN * dt, null, null, false, 'Fire');
      if (fx) {
        const top = b.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * b.radius, b.height * (0.5 + Math.random() * 0.5), (Math.random() - 0.5) * b.radius));
        w.effects.flash(top, b.radius * (0.4 + Math.random() * 0.4), 0xff7a30, 0.35, Math.random() < 0.15 ? 20 : 0, true);
        if (Math.random() < 0.5) w.effects.smoke(top, b.radius * 0.35, 0x2a2420, 3.5);
      }
    }
    if (this.ended) {
      if (this.m.radio.idle) this.m.win('Meinhoff is burned clean.');
      return;
    }
    this.phaseLeft -= dt;
    const t = this.phaseLeft;
    switch (this.phase) {
      case 'day':
        if (t <= 20 && t + dt > 20) this.say(HORNER, 'ashby', "Sun's going down in twenty seconds. Get back to the base, Commander.", 3);
        if (t <= 0) {
          this.phase = 'dusk';
          this.phaseLeft = DUSK;
          this.night++;
          if (this.night === 1) this.reveal('nights');
          this.say(HORNER, 'ashby', this.night === 1 ? "Nightfall. Here they come. Everything we didn't burn." : 'Night again. More of them this time.', 3);
          w.audio.play('baseUnderAttack', { volume: 0.7 });
        }
        break;
      case 'dusk':
        this.host.setNight?.(1 - t / DUSK);
        if (t <= 0) {
          this.phase = 'night';
          this.phaseLeft = NIGHT;
          this.host.setNight?.(1);
          this.wavesLeft = 3 + Math.min(2, this.night - 1);
          this.waveIn = 0;
          this.firstWave = true;
          // Everything sheltering near the colony wakes and comes; the far nests stay put.
          const cc = this.cc.position;
          this.dormant = this.dormant.filter((u) => {
            if (!u.alive) return false;
            if (Math.hypot(u.position.x - cc.x, u.position.z - cc.z) > 260) return true;
            u.setController(new CrawlBrain(u));
            return false;
          });
        }
        break;
      case 'night':
        this.waveIn -= dt;
        if (this.wavesLeft > 0 && this.waveIn <= 0) {
          this.wavesLeft--;
          this.waveIn = WAVE_WINDOW / (3 + Math.min(2, this.night - 1));
          this.wave();
        }
        this.moanIn -= dt;
        if (this.moanIn <= 0) {
          this.moanIn = 2 + Math.random() * 4;
          const a = Math.random() * Math.PI * 2;
          const p = this.cc.position.clone().add(new THREE.Vector3(Math.cos(a) * 70, 0, Math.sin(a) * 70));
          w.audio.play('turnedMoan', { at: p, volume: 0.8, near: 30 });
        }
        if (t <= 0) {
          this.phase = 'dawn';
          this.phaseLeft = DAWN;
          this.say(HORNER, 'ashby', "Dawn's coming up. They're pulling back into the buildings.", 2.8);
          // The night's attackers head for cover.
          for (const e of w.entities) {
            if (!e.alive || e.isBuilding || e.team !== 'crawl' || this.dormant.includes(e as Unit)) continue;
            const u = e as Unit;
            u.setController(new ShelterBrain(u, () => this.nearestShelter(u)));
          }
        }
        break;
      case 'dawn':
        this.host.setNight?.(t / DAWN);
        if (t <= 0) {
          this.phase = 'day';
          this.phaseLeft = DAY;
          this.host.setNight?.(0);
          if (this.night === 1) this.complete('nights');
          this.say(RAYNOR, 'harlan', `We made it through. ${this.needed - this.destroyed} more nests to burn before they do this again.`, 3);
        }
        break;
    }
    this.pointIn -= dt;
    if (this.phase === 'day' && this.pointIn <= 0) {
      this.pointIn = 2;
      this.nearestTarget();
    }
    this.m.meter = {
      label: this.phase === 'night' || this.phase === 'dusk' ? `NIGHT ${this.night}` : `DAY ${this.night + 1}`,
      value: this.phase === 'day' ? 1 - t / DAY : this.phase === 'night' ? 1 - t / NIGHT : this.phase === 'dusk' ? 1 - t / DUSK : 1 - t / DAWN,
      text: this.phase === 'day' ? `Nightfall in ${Math.ceil(t)}s · ${this.destroyed}/${this.needed} burned` : this.phase === 'night' ? `Dawn in ${Math.ceil(t)}s` : '',
    };
  }
}
