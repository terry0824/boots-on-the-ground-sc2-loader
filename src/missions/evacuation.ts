import * as THREE from 'three';
import type { MapTerrain } from '../../../../src/engine/mapterrain.ts';
import type { MapData } from '../../../../src/engine/mapdata.ts';
import { MedicBrain, Squad, SquadBrain, CrawlBrain } from '../../../../src/game/brains.ts';
import type { Controller, Unit } from '../../../../src/game/entity.ts';
import type { KindName } from '../../../../src/game/kinds.ts';
import { HoldBrain, ScriptBase, walkableNear } from '../../../../src/game/script.ts';

/** The game's kinds for the map's burrowed broods, by StarCraft II's unit types. */
const BURROWED: Record<string, KindName> = { Zergling: 'hound', Roach: 'shellback', Hydralisk: 'quillback' };

const RAYNOR = 'Jim Raynor';
const HORNER = 'Matt Horner';
const HANSON = 'Dr. Ariel Hanson';

/** Transports the colony loads; how many must reach the starport, by difficulty. */
const TRUCKS = 4;
const NEEDED = [1, 2, 3, 3];
/** Seconds the colonists need at the starport to board. */
const LOADING = 55;

/**
 * A colonist hauler driving the causeway: waypoint to waypoint, keeping its distance from the
 * truck ahead, and halting whenever the convoy is under attack (the drivers aren't soldiers).
 */
class ConvoyBrain implements Controller {
  index = 0;
  arrived = false;

  constructor(
    private u: Unit,
    private route: THREE.Vector3[],
    private ahead: () => Unit | null,
    private halted: () => boolean,
  ) {}

  /** Whether a truck has arrived (parked trucks don't hold up the ones behind). */
  static arrivedTrucks = new WeakSet<Unit>();

  update() {
    const u = this.u;
    u.face = null;
    // The starport's apron is the destination: anywhere on it will do.
    const end = this.route[this.route.length - 1];
    if (!this.arrived && Math.hypot(end.x - u.position.x, end.z - u.position.z) < 28) {
      this.arrived = true;
      ConvoyBrain.arrivedTrucks.add(u);
    }
    const a = this.ahead();
    const blocked = a?.alive && !ConvoyBrain.arrivedTrucks.has(a) && Math.hypot(a.position.x - u.position.x, a.position.z - u.position.z) < 16;
    if (this.arrived || this.halted() || blocked) {
      u.move.set(0, 0);
      return;
    }
    let t = this.route[this.index];
    while (t && Math.hypot(t.x - u.position.x, t.z - u.position.z) < 5) {
      this.index++;
      t = this.route[this.index];
    }
    if (!t) {
      this.arrived = true;
      u.move.set(0, 0);
      return;
    }
    u.move.set(t.x - u.position.x, t.z - u.position.z).normalize();
  }
}

type Stage = 'rolling' | 'loading' | 'done';

/**
 * The Evacuation, on Wings of Liberty's own Agria map (thanson01), along the route its
 * colonists drove: Dr. Hanson's people load four haulers and make for the starport across the
 * causeway, and the Zerg come at them out of the ground, from drop pods, at every choke the
 * map has. Then the starport, where the colonists need a minute to board.
 */
export class EvacuationScript extends ScriptBase {
  private squad!: Squad;
  private harlan!: Unit;
  private route: THREE.Vector3[] = [];
  private trucks: Unit[] = [];
  private brains: ConvoyBrain[] = [];
  private stage: Stage = 'rolling';
  private fired = new Set<string>();
  private alarmUntil = 0;
  private loadLeft = LOADING;
  private waveTimer = 0;
  private burrowed: Unit[] = [];
  private airfield = new THREE.Vector3();
  /** The convoy waits for the order to move out. */
  private rolling = false;

  constructor(
    m: ConstructorParameters<typeof ScriptBase>[0],
    host: ConstructorParameters<typeof ScriptBase>[1],
    private map: MapData,
    private terrain: MapTerrain,
  ) {
    super(m, host);
  }

  private at(x: number, y: number, step = 2): THREE.Vector3 {
    return walkableNear(this.w, this.terrain.toWorld(x, y), step);
  }

  /** A named point from the map ("Colonist Route 012"). */
  private point(name: string): THREE.Vector3 | null {
    const p = this.map.placements.find((q) => q.kind === 'point' && q.name === name);
    return p ? this.at(p.x, p.y) : null;
  }

  setup() {
    const w = this.w;
    for (let i = 21; i >= 0; i--) {
      const p = this.point(`Colonist Route ${String(i).padStart(3, '0')}`);
      if (p) this.route.push(p);
    }
    this.airfield = this.route[this.route.length - 1].clone();
    const lot = this.point('Colonist Truck Rally') ?? this.route[0];
    const start = this.point('Center of Player Base') ?? lot;
    // The colony's own defenders, where the map stands them.
    for (const p of this.map.placements) {
      if (p.kind !== 'unit' || p.player !== 4) continue;
      const kind: KindName | null = p.type === 'CommandCenter' ? 'holdfast' : p.type === 'Barracks' ? 'barracks' : p.type === 'SupplyDepot' ? 'storehouse' : null;
      if (kind) {
        const at = this.terrain.toWorld(p.x, p.y);
        w.spawnBuilding(kind, at.x, at.z, 0, 'holdouts');
      }
    }
    // The haulers, lined up at the lot.
    for (let i = 0; i < TRUCKS; i++) {
      const p = walkableNear(w, lot.clone().add(new THREE.Vector3(-i * 15, 0, 0)), 3);
      let brain!: ConvoyBrain;
      const ahead = i > 0 ? this.trucks[i - 1] : null;
      const t = w.spawnUnit('colonistHauler', p.x, p.z, 0, (u) => (brain = new ConvoyBrain(u, this.route, () => ahead, () => !this.rolling || this.stage !== 'rolling' || w.time < this.alarmUntil)));
      t.ignored = false;
      this.trucks.push(t);
      this.brains.push(brain);
    }
    // Every hauler has a guard detail riding with it (bigger at higher difficulties).
    const detail = Math.round(3 * this.m.difficulty.allies);
    this.trucks.forEach((t, i) => {
      for (let k = 0; k < detail; k++) {
        const kind: KindName = k === 2 && i % 2 === 0 ? 'medic' : k === 2 ? 'grenadier' : 'trooper';
        const p = walkableNear(w, t.position.clone().add(new THREE.Vector3((k - 1) * 5, 0, 6)), 2);
        w.spawnUnit(kind, p.x, p.z, 0, (u) => (kind === 'medic' ? new MedicBrain(u, null, t.position.clone()) : new ConvoyGuard(u, t)));
      }
    });
    // Zerg asleep under the causeway: the map's own burrowed broods, waiting for the convoy
    // (every other one; the original's numbers are tuned for an RTS army).
    let skip = false;
    for (const p of this.map.placements) {
      if (p.kind !== 'unit' || !/^(Zergling|Roach|Hydralisk)Burrowed$/.test(p.type)) continue;
      skip = !skip;
      if (skip) continue;
      const kind = BURROWED[p.type.replace('Burrowed', '')];
      const at = this.at(p.x, p.y, 1.5);
      const u = w.spawnUnit(kind, at.x, at.z, Math.random() * 6.28, (x) => new HoldBrain(x));
      u.stowed = true;
      this.burrowed.push(u);
    }
    // Raynor and the squad, with the colony.
    this.squad = new Squad(() => this.body());
    this.squad.rally.copy(start);
    this.harlan = w.spawnUnit('harlan', start.x, start.z, 0, (u) => new SquadBrain(u, this.squad));
    this.harlan.minHp = 1;
    const squad = Math.round(6 * this.m.difficulty.allies);
    for (let i = 0; i < squad; i++) this.recruit(i === squad - 1 ? 'medic' : i === squad - 2 ? 'grenadier' : 'trooper', start);
  }

  private recruit(kind: KindName, near: THREE.Vector3): Unit {
    const p = walkableNear(this.w, near.clone().add(new THREE.Vector3((Math.random() - 0.5) * 12, 0, (Math.random() - 0.5) * 12)), 2);
    return this.w.spawnUnit(kind, p.x, p.z, 0, (u) => (kind === 'medic' ? new MedicBrain(u, this.squad) : new SquadBrain(u, this.squad)));
  }

  respawnPoint(): THREE.Vector3 {
    const r = this.harlan.position;
    const lead = this.trucks.find((t) => t.alive)?.position ?? r;
    const safe = !this.w.nearestEnemy('holdouts', r.x, r.z, 30);
    return walkableNear(this.w, (safe ? r : lead).clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8)), 2);
  }

  start() {
    this.host.ship.holdFire = true;
    this.host.ship.station = this.route[Math.floor(this.route.length / 2)].clone();
    this.say(HANSON, 'scientist', "Commander Raynor, the haulers are loaded. Every family that's left in the colony is on those four trucks.");
    this.say(RAYNOR, 'harlan', "Then let's get 'em to the starport. Nobody gets left behind. Corporal, stay with the convoy.");
    this.say(HORNER, 'ashby', "The causeway's the only road. If the Zerg want them, that's where they'll hit. Every choke on it.");
    this.m.progress.set('convoy', `0/${TRUCKS}`);
    this.rolling = true;
  }

  /** Zerg pouring out of `points` (map point names) and going for the convoy. */
  private ambush(points: string[], mix: [KindName, number][]) {
    const w = this.w;
    const spots = points.map((n) => this.point(n)).filter((p): p is THREE.Vector3 => !!p);
    if (!spots.length) return;
    // An escort is fragile (four trucks can be lost in one swarm): ambushes grow at under half
    // the rate the rest of the war does.
    const scale = 1 + (this.m.difficulty.waveScale - 1) * 0.4;
    let i = 0;
    for (const [kind, count] of mix) {
      for (let k = 0; k < Math.max(1, Math.round(count * scale)); k++, i++) {
        const s = spots[i % spots.length];
        const p = walkableNear(w, s.clone().add(new THREE.Vector3((Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 10)), 2);
        w.spawnUnit(kind, p.x, p.z, 0, (u) => new ConvoyHunter(u, () => this.nearestTruck(u)));
      }
    }
  }

  private nearestTruck(u: Unit): Unit | null {
    let best: Unit | null = null;
    let d = Infinity;
    for (const t of this.trucks) {
      if (!t.alive) continue;
      const dd = t.position.distanceTo(u.position);
      if (dd < d) {
        d = dd;
        best = t;
      }
    }
    return best;
  }

  protected tick(dt: number) {
    const w = this.w;
    this.squad.update();
    const lead = this.brains.find((b, i) => this.trucks[i].alive);
    const progress = lead ? lead.index : 0;
    const living = this.trucks.filter((t) => t.alive);
    const needed = NEEDED[this.m.difficulty.level] ?? 2;

    // The convoy halts while anything hostile is close to it; between attacks the crews patch
    // their haulers up, the way SCVs repair (StarCraft II's repair rate is the vehicle's build
    // time spent on its life; these crews manage a steady few points a second).
    for (const t of living) {
      if (w.nearestEnemy('holdouts', t.position.x, t.position.z, 28)) this.alarmUntil = w.time + 2.5;
    }
    if (w.time > this.alarmUntil + 3) for (const t of living) t.hp = Math.min(t.maxHp, t.hp + 4 * dt);
    if (this.stage === 'loading') this.m.setWaypoint(this.airfield, 'Starport', 18);
    else if (living[0]) this.m.setWaypoint(living[0].position, w.time < this.alarmUntil ? 'Convoy under attack' : 'Convoy', 12);

    // Burrowed Zerg erupt as the convoy passes over them.
    for (const z of this.burrowed) {
      if (!z.stowed || !z.alive) continue;
      if (living.some((t) => t.position.distanceTo(z.position) < 18) || (this.body() && this.distanceTo(z.position) < 30)) {
        z.stowed = false;
        z.setController(new ConvoyHunter(z, () => this.nearestTruck(z)));
        w.effects.smoke(z.position, 1.4, 0x6a5a40, 1.4);
        if (!this.fired.has('unburrow')) {
          this.fired.add('unburrow');
          this.say(RAYNOR, 'harlan', "They're coming up out of the ground! Cover the trucks!", 3);
        }
      }
    }

    // The map's own ambushes, keyed to how far the lead hauler has come.
    const event = (id: string, at: number, run: () => void) => {
      if (progress >= at && !this.fired.has(id)) {
        this.fired.add(id);
        run();
      }
    };
    // Each fires a couple of waypoints short of its choke, so the Zerg meet the escort ahead
    // of the haulers rather than landing on them.
    event('first', 3, () => {
      this.say(HORNER, 'ashby', 'Zerglings, coming up the canyon from the south!', 3);
      this.ambush(['Action 2 Zergling Spawn 1', 'Action 2 Zergling Spawn 2', 'Action 2 Zergling Spawn 3', 'Action 2 Zergling Spawn 4', 'Action 2 Roach Spawn 1'], [['hound', 10], ['shellback', 2]]);
    });
    event('choke1', 6, () => {
      this.say(HORNER, 'ashby', 'First choke ahead. Watch the high ground.', 3);
      this.ambush(['Zerg Drop Pod 04 01', 'Zerg Drop Pod 04 02', 'Zerg Drop Pod 04 03', 'Zerg Spooge Pod 04 01', 'Zerg Spooge Pod 04 02'], [['hound', 10], ['quillback', 3]]);
    });
    event('choke2', 10, () => {
      this.say(HORNER, 'ashby', 'Drop pods! Hydralisks and Roaches, right on top of the second choke!', 3.5);
      this.ambush(['Zerg Drop Pod 05 01', 'Zerg Drop Pod 05 02', 'Zerg Nydus 05 02', 'Zerg Drop Pod 04 05', 'Zerg Spooge Pod 05 02'], [['quillback', 5], ['shellback', 4], ['hound', 8]]);
    });
    event('choke3', 14, () => {
      this.say(RAYNOR, 'harlan', "Third choke. This is where they make their stand. So do we.", 3);
      if (this.m.difficulty.level >= 2) this.say(HORNER, 'ashby', 'Ultralisk! Keep it off the haulers!', 2.5);
      this.ambush(['Action 3 Hydralisk Spawn 1', 'Action 3 Hydralisk Spawn 12', 'Action 3 Roach Spawn 1', 'Action 3 Roach Spawn 2', 'Zerg Drop Pod 06 02', 'Zerg Unburrow 06 01'], [['hound', 16], ['quillback', 6], ['shellback', 5], ...(this.m.difficulty.level >= 2 ? ([['tusker', 1]] as [KindName, number][]) : [])]);
    });

    if (this.stage === 'rolling') {
      const arrived = this.brains.filter((b, i) => b.arrived && this.trucks[i].alive).length;
      this.m.progress.set('convoy', `${arrived}/${TRUCKS}`);
      if (living.length && living.every((t, i) => this.brains[this.trucks.indexOf(t)].arrived)) {
        this.stage = 'loading';
        this.complete('convoy');
        this.reveal('load');
        this.say(HANSON, 'scientist', "We're here! Loading the transports now. We need a minute, maybe less.", 3.5);
        this.say(RAYNOR, 'harlan', 'You heard the lady. Nothing gets near those ships.', 3);
        this.waveTimer = 5;
      }
    } else if (this.stage === 'loading') {
      this.loadLeft -= dt;
      this.m.progress.set('load', `${Math.ceil(Math.max(0, this.loadLeft))}s`);
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) {
        this.waveTimer = 16;
        this.ambush(['Victory Zerg Rally 1', 'Victory Zerg Rally 3', 'Doomsday Zerg Spawn - East 1', 'Victory Zergling Spawn 1'], [['hound', 9], ['quillback', 3], ['shellback', 2]]);
        if (!this.fired.has('final')) {
          this.fired.add('final');
          this.say(HORNER, 'ashby', "Here they come. Everything they've got.", 2.5);
        }
      }
      if (this.loadLeft <= 0) {
        this.stage = 'done';
        this.complete('load');
        this.m.setWaypoint(null);
        const saved = living.length;
        if (saved === TRUCKS) this.complete('all');
        this.say(HANSON, 'scientist', saved === TRUCKS ? "Every family made it. I don't know how to thank you." : "We're away. We lost some... but we're away. Thank you.", 4);
        this.say(RAYNOR, 'harlan', 'Thank us by getting off this rock, Doc.', 3);
      }
    } else if (this.stage === 'done' && this.m.radio.idle) {
      this.m.win('The colonists are off Agria.');
    }

    if (this.stage !== 'done' && living.length < needed) {
      this.fail('convoy');
      this.m.lose(`Too many transports lost: ${living.length} of ${TRUCKS} left, ${needed} needed.`);
    }
    if (living.length < TRUCKS) this.fail('all');
  }
}

/** Zerg on the hunt for the convoy: the nearest hauler, and anything that gets in the way. */
class ConvoyHunter implements Controller {
  private inner: CrawlBrain;

  constructor(
    private u: Unit,
    private prey: () => Unit | null,
  ) {
    this.inner = new CrawlBrain(u);
  }

  release() {
    this.inner.release();
  }

  update(dt: number) {
    const u = this.u;
    const w = u.world;
    // The soldiers shooting at them come first; the haulers when no one stands in the way.
    const near = w.nearestEnemy(u.team, u.position.x, u.position.z, 34, (e) => !e.isBuilding && e.kind.name !== 'colonistHauler' && (e !== w.player || w.mayEngagePlayer(u)));
    if (near) {
      w.engagePlayer(u, near === w.player);
      if (u.inRange(near)) {
        u.move.set(0, 0);
        u.face = Math.atan2(near.position.x - u.position.x, near.position.z - u.position.z);
        u.attack(near);
      } else {
        u.face = null;
        u.move.set(near.position.x - u.position.x, near.position.z - u.position.z).normalize();
      }
      return;
    }
    const t = this.prey();
    if (!t) return this.inner.update(dt);
    if (u.inRange(t)) {
      u.move.set(0, 0);
      u.face = Math.atan2(t.position.x - u.position.x, t.position.z - u.position.z);
      u.attack(t);
      return;
    }
    u.face = null;
    u.move.set(t.position.x - u.position.x, t.position.z - u.position.z).normalize();
  }
}


/** A soldier riding with a hauler: stays by it, and fights whatever comes near it. */
class ConvoyGuard implements Controller {
  private target: import('../../../../src/game/entity.ts').Entity | null = null;
  private retarget = Math.random() * 0.3;
  private slot = new THREE.Vector3((Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 10);

  constructor(
    private u: Unit,
    private truck: Unit,
  ) {}

  update(dt: number) {
    const u = this.u;
    const w = u.world;
    const home = this.truck.alive ? this.truck.position : u.position;
    this.retarget -= dt;
    if (this.retarget <= 0 || !this.target?.targetable) {
      this.retarget = 0.3;
      this.target = w.nearestEnemy(u.team, home.x, home.z, 34);
    }
    const t = this.target;
    u.face = null;
    if (t?.targetable && u.inRange(t)) {
      u.move.set(0, 0);
      u.face = Math.atan2(t.position.x - u.position.x, t.position.z - u.position.z);
      u.attack(t);
      return;
    }
    // Ride a little ahead of the hauler, where trouble comes from.
    const ahead = new THREE.Vector3(Math.sin(this.truck.yaw), 0, Math.cos(this.truck.yaw)).multiplyScalar(9);
    const goal = t?.targetable ? t.position : new THREE.Vector3(home.x + this.slot.x * 0.6 + ahead.x, 0, home.z + this.slot.z * 0.6 + ahead.z);
    const dx = goal.x - u.position.x;
    const dz = goal.z - u.position.z;
    const d = Math.hypot(dx, dz);
    if (d > 2) u.move.set(dx / d, dz / d).multiplyScalar(d > 8 ? 1 : 0.6);
    else u.move.set(0, 0);
  }
}
