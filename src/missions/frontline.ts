import * as THREE from 'three';
import type { MapTerrain } from '../../../../src/engine/mapterrain.ts';
import type { MapData } from '../../../../src/engine/mapdata.ts';
import { AssaultBrain, BunkerGuns, MedicBrain, Squad, SquadBrain } from '../../../../src/game/brains.ts';
import { CapturePoint } from '../../../../src/game/capture.ts';
import type { Building, Unit } from '../../../../src/game/entity.ts';
import { FlowField } from '../../../../src/game/flowfield.ts';
import type { KindName, Team } from '../../../../src/game/kinds.ts';
import { mapYaw } from '../../../../src/game/layout.ts';
import { ScriptBase, walkableNear } from '../../../../src/game/script.ts';
import { TankBrain } from '../../../../src/game/tank.ts';

const HORNER = 'Matt Horner';
const RAYNOR = 'Jim Raynor';
const DOMINION_OFFICER = 'Dominion commander';

/** A base on the lattice: a capture point, or a faction's headquarters (where it deploys). */
interface Base {
  id: string;
  name: string;
  letter: string;
  /** Map cells. */
  x: number;
  y: number;
  radius: number;
  owner: Team | null;
  hq?: boolean;
  links: string[];
  /** Filled in at setup. */
  position: THREE.Vector3;
  point: CapturePoint | null;
  structures: Building[];
}

/** One faction's war effort: how many soldiers it keeps in the field, and its score. */
interface Army {
  team: Team;
  cap: number;
  score: number;
  spawnTimer: number;
}

/** Every second an army holds a base, it scores this much toward the win. */
const POINTS_PER_BASE = 0.5;
const WIN_SCORE = 1000;
/** Seconds between soldiers deploying for an army. */
const SPAWN_GAP = 2.4;

/**
 * Frontline, PlanetSide's war on StarCraft II ground: the ruins of Tarsonis (Wings of
 * Liberty's own city map), a lattice of bases between the Raiders' landing zone and the
 * Dominion's headquarters, and in the east, outposts the Zerg overran. Both armies deploy
 * soldiers without end at the bases they hold and push along the lattice; holding bases
 * scores; first to the mark takes the city. The player is one soldier in it, deploying
 * where they choose, as whatever they choose, leading whoever will follow.
 */
export class FrontlineScript extends ScriptBase {
  readonly bases: Base[] = [];
  readonly armies: Army[] = [];
  private fields = new Map<string, FlowField>();
  private orders = new Map<Unit, Base>();
  private reassign = 20;
  private zergWave = 70;
  private squad!: Squad;
  /** The base the player deploys at (their choice on the command console). */
  spawnBase = 'rhq';
  private warned = new Set<string>();
  private elapsedScore = 0;

  constructor(
    m: ConstructorParameters<typeof ScriptBase>[0],
    host: ConstructorParameters<typeof ScriptBase>[1],
    private map: MapData,
    private terrain: MapTerrain,
  ) {
    super(m, host);
  }

  private base(id: string): Base {
    return this.bases.find((b) => b.id === id)!;
  }

  private at(x: number, y: number, step = 2): THREE.Vector3 {
    return walkableNear(this.w, this.terrain.toWorld(x, y), step);
  }

  /** A flow field toward a base, built once. */
  private fieldTo(b: Base): FlowField {
    let f = this.fields.get(b.id);
    if (!f) {
      f = new FlowField(this.w.terrain.size, this.w.terrain.pathCell);
      f.setTerrain((x, z) => this.w.terrain.walkable(x, z));
      const p = b.position;
      f.compute([{ x: p.x, z: p.z, r: Math.max(10, b.radius * 0.6) }], this.w.buildings.filter((s) => s.position.distanceTo(p) > s.radius + b.radius).map((s) => ({ x: s.position.x, z: s.position.z, r: s.radius })));
      this.fields.set(b.id, f);
    }
    return f;
  }

  setup() {
    const w = this.w;
    const defs: Omit<Base, 'position' | 'point' | 'structures'>[] = [
      { id: 'rhq', name: "Raiders' Landing", letter: 'R', x: 131, y: 92, radius: 24, owner: 'holdouts', hq: true, links: ['c', 'd', 'f'] },
      { id: 'dhq', name: 'Dominion Headquarters', letter: 'X', x: 45, y: 85, radius: 26, owner: 'directorate', hq: true, links: ['d', 'g', 'h'] },
      { id: 'a', name: 'East Station', letter: 'A', x: 181, y: 57, radius: 22, owner: 'crawl', links: ['b', 'c', 'e'] },
      { id: 'b', name: 'Southeast Depot', letter: 'B', x: 182, y: 97, radius: 22, owner: 'crawl', links: ['a', 'c'] },
      { id: 'c', name: 'Eastern Bunkers', letter: 'C', x: 162, y: 80, radius: 20, owner: 'holdouts', links: ['rhq', 'a', 'b'] },
      { id: 'd', name: 'Western Bunkers', letter: 'D', x: 100, y: 64, radius: 22, owner: 'directorate', links: ['rhq', 'dhq', 'e', 'f'] },
      { id: 'e', name: 'North Yard', letter: 'E', x: 78, y: 36, radius: 22, owner: 'directorate', links: ['d', 'h', 'a'] },
      { id: 'f', name: 'Southern Rail', letter: 'F', x: 128, y: 124, radius: 20, owner: 'holdouts', links: ['rhq', 'd', 'g'] },
      { id: 'g', name: 'Southwest Depot', letter: 'G', x: 42, y: 118, radius: 22, owner: 'directorate', links: ['dhq', 'f'] },
      { id: 'h', name: 'Northwest Garrison', letter: 'H', x: 38, y: 48, radius: 22, owner: 'directorate', links: ['dhq', 'e'] },
    ];
    for (const d of defs) {
      const position = this.at(d.x, d.y, 3);
      const b: Base = { ...d, position, point: null, structures: [] };
      if (!d.hq) {
        const p = new CapturePoint(d.id, d.name, d.letter, position, d.radius, d.owner, w, 16);
        p.onCaptured = (team, previous) => this.captured(b, team, previous);
        this.m.points.push(p);
        b.point = p;
      }
      this.bases.push(b);
    }
    // The Dominion fields more soldiers; the Raiders have you. The Zerg are a third front for both.
    const d = this.m.difficulty.waveScale;
    this.armies.push(
      { team: 'holdouts', cap: Math.round(40 * this.m.difficulty.allies), score: 0, spawnTimer: 0 },
      { team: 'directorate', cap: Math.round(38 * Math.max(0.8, d)), score: 0, spawnTimer: 0 },
      { team: 'crawl', cap: Math.round(28 * d), score: 0, spawnTimer: 0 },
    );

    // The city's fortifications, where the map puts them: each belongs to the nearest base's
    // holder (the eastern outposts were overrun; nothing of theirs is left standing).
    const nearestBase = (p: THREE.Vector3) => this.bases.reduce((a, b) => (b.position.distanceTo(p) < a.position.distanceTo(p) ? b : a));
    const rifle = w.kinds.trooper.weapon!;
    for (const pl of this.map.placements) {
      if (pl.kind !== 'unit' || pl.player < 1 || pl.player > 4) continue;
      const kind: KindName | null =
        pl.type === 'Bunker' ? 'bunker' : pl.type === 'CommandCenter' ? 'holdfast' : pl.type === 'Barracks' ? 'barracks' : pl.type === 'SupplyDepot' ? 'storehouse' : pl.type === 'SiegeTankSieged' ? 'howitzer' : null;
      if (!kind) continue;
      const at = this.terrain.toWorld(pl.x, pl.y);
      const b = nearestBase(at);
      const team = pl.player === 1 ? 'holdouts' : b.owner;
      if (!team || team === 'crawl') continue;
      if (kind === 'howitzer') {
        const p = walkableNear(w, at, 2);
        w.spawnUnit('howitzer', p.x, p.z, mapYaw(pl.rotation), (u) => new TankBrain(u, u.position.clone()), team);
        continue;
      }
      const s = w.spawnBuilding(kind, at.x, at.z, mapYaw(pl.rotation), team);
      if (kind === 'bunker') s.controller = new BunkerGuns(s, rifle);
      b.structures.push(s);
    }
    // The Zerg's hold on the east: a brood at each outpost to start.
    for (const b of this.bases.filter((x) => x.owner === 'crawl')) for (let i = 0; i < 10; i++) this.spawnSoldier('crawl', b);
    // Opening garrisons.
    for (const army of this.armies) {
      if (army.team === 'crawl') continue;
      for (let i = 0; i < Math.round(army.cap * 0.6); i++) {
        const owned = this.bases.filter((b) => b.owner === army.team);
        this.spawnSoldier(army.team, owned[i % owned.length]);
      }
    }
    this.squad = new Squad(() => this.body());
  }

  /** A soldier for `team`, deployed at `at` and given its orders. */
  private spawnSoldier(team: Team, at: Base): Unit {
    const r = Math.random();
    const kind: KindName =
      team === 'crawl'
        ? r < 0.6
          ? 'hound'
          : r < 0.85
            ? 'quillback'
            : 'shellback'
        : r < 0.62
          ? 'trooper'
          : r < 0.78
            ? 'grenadier'
            : r < 0.88
              ? 'burner'
              : 'medic';
    const p = walkableNear(this.w, at.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * at.radius, 0, (Math.random() - 0.5) * at.radius)), 2);
    const order = this.chooseOrder(team, at);
    const u = this.w.spawnUnit(kind, p.x, p.z, Math.random() * Math.PI * 2, (x) => (kind === 'medic' ? new MedicBrain(x, null, order.position.clone()) : new AssaultBrain(x, this.fieldTo(order), this.jitter(order))), team);
    this.orders.set(u, order);
    return u;
  }

  private jitter(b: Base): THREE.Vector3 {
    return walkableNear(this.w, b.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * b.radius, 0, (Math.random() - 0.5) * b.radius)), 2);
  }

  /**
   * Where a soldier is sent: a base on the lattice next to its army's ground that it doesn't
   * hold (to take), or one of its own under attack (to hold), the nearer the likelier.
   */
  private chooseOrder(team: Team, from: Base): Base {
    const owned = this.bases.filter((b) => b.owner === team);
    const options: { b: Base; w: number }[] = [];
    for (const b of owned) {
      if (b.point && (b.point.contested || (b.point.capturer && b.point.capturer !== team))) options.push({ b, w: 3 });
      for (const id of b.links) {
        const n = this.base(id);
        if (n.owner !== team && !n.hq) options.push({ b: n, w: n.owner === null ? 1.5 : 1 });
      }
    }
    if (!options.length) return owned.find((b) => !b.hq) ?? from;
    let total = 0;
    for (const o of options) {
      o.w /= 1 + o.b.position.distanceTo(from.position) / 300;
      total += o.w;
    }
    let r = Math.random() * total;
    for (const o of options) if ((r -= o.w) <= 0) return o.b;
    return options[0].b;
  }

  /** Bases where `team` can deploy: its headquarters and every base it holds that isn't under attack. */
  spawnable(team: Team): Base[] {
    return this.bases.filter((b) => b.owner === team && (b.hq || !(b.point?.contested || (b.point?.capturer && b.point.capturer !== team))));
  }

  respawnPoint(): THREE.Vector3 {
    const options = this.spawnable('holdouts');
    const b = options.find((x) => x.id === this.spawnBase) ?? options[0] ?? this.base('rhq');
    return walkableNear(this.w, b.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 10)), 2);
  }

  start() {
    this.host.ship.holdFire = true;
    this.host.ship.station = this.base('rhq').position.clone();
    this.say(HORNER, 'ashby', "Tarsonis. What's left of it. The Dominion's dug into these ruins, and something's crawled out of the east to join the party.");
    this.say(RAYNOR, 'harlan', 'Take the bases, hold them, and push. Every base we hold bleeds Mengsk a little more. Deploy where you are needed, Corporal.');
    this.say(HORNER, 'ashby', 'Press G to rally the troops around you. They will follow your lead.', 4);
  }

  private captured(b: Base, team: Team, previous: Team | null) {
    b.owner = team;
    // The base's guns change hands with it.
    for (const s of b.structures) if (s.alive) this.w.setTeam(s, team);
    const name = `${b.letter} · ${b.name}`;
    if (team === 'holdouts') {
      this.m.onMessage?.('BASE CAPTURED', name, 3);
      this.w.audio.play('trooperYes', { volume: 0.8, limit: 1 });
      const body = this.body();
      if (body && b.point?.contains(body.position)) this.host.reward?.(200, 'Base captured');
    } else if (previous === 'holdouts') {
      this.m.onMessage?.('BASE LOST', `${name} fell to the ${team === 'crawl' ? 'Zerg' : 'Dominion'}`, 3);
      this.say(HORNER, 'ashby', `We've lost ${b.name}!`, 3);
    }
    // Soldiers who were sent there regroup on the new front.
    for (const [u, order] of this.orders) if (order === b && u.alive && u.team === team) this.retask(u);
  }

  private retask(u: Unit) {
    const from = this.orders.get(u) ?? this.base(u.team === 'holdouts' ? 'rhq' : 'dhq');
    const next = this.chooseOrder(u.team, from);
    this.orders.set(u, next);
    const c = u.controller;
    if (c instanceof AssaultBrain) {
      c.field = this.fieldTo(next);
      c.objective = this.jitter(next);
    } else if (c instanceof MedicBrain) u.setController(new MedicBrain(u, null, next.position.clone()));
  }

  /** G: the nearest troops fall in behind the player. */
  action() {
    this.rally();
  }

  rally() {
    const body = this.body();
    if (!body) return;
    let n = 0;
    for (const e of this.w.unitsNear(body.position.x, body.position.z, 30)) {
      if (n >= 6 || e === body || e.team !== 'holdouts' || !e.targetable || e.kind.name === 'howitzer' || e.kind.name === 'howitzerMobile') continue;
      if (e.controller instanceof SquadBrain) continue;
      e.setController(e.kind.name === 'medic' ? new MedicBrain(e, this.squad) : new SquadBrain(e, this.squad));
      this.orders.delete(e);
      n++;
    }
    if (n) {
      this.m.onMessage?.('SQUAD', `${n} soldiers rally on you`, 2);
      this.w.audio.play('trooperYes', { volume: 0.8, limit: 1 });
    }
  }

  protected tick(dt: number) {
    const w = this.w;
    this.squad.update();
    const alive = new Map<Team, number>();
    for (const e of w.entities) if (!e.isBuilding && e.alive && e !== this.body()) alive.set(e.team, (alive.get(e.team) ?? 0) + 1);
    for (const u of [...this.orders.keys()]) if (!u.alive) this.orders.delete(u);

    // Reinforcements: each army deploys at the bases it holds, the front first.
    for (const army of this.armies) {
      army.spawnTimer -= dt;
      if (army.spawnTimer > 0 || (alive.get(army.team) ?? 0) >= army.cap) continue;
      army.spawnTimer = army.team === 'crawl' ? SPAWN_GAP * 1.5 : SPAWN_GAP;
      const options = army.team === 'crawl' ? this.bases.filter((b) => b.owner === 'crawl') : this.spawnable(army.team);
      if (!options.length) continue;
      const front = options.filter((b) => b.links.some((id) => this.base(id).owner !== army.team));
      const pool = front.length && Math.random() < 0.75 ? front : options;
      this.spawnSoldier(army.team, pool[Math.floor(Math.random() * pool.length)]);
    }

    // Orders are revisited: a taken base frees its attackers for the next one.
    this.reassign -= dt;
    if (this.reassign <= 0) {
      this.reassign = 15;
      for (const [u, order] of this.orders) {
        if (!u.alive || order.owner !== u.team) continue;
        const threatened = order.point && (order.point.contested || order.point.capturer);
        if (!threatened && Math.random() < 0.45) this.retask(u);
      }
    }

    // The Zerg surge out of the east now and then, all at once.
    this.zergWave -= dt;
    if (this.zergWave <= 0) {
      this.zergWave = 90;
      const nests = this.bases.filter((b) => b.owner === 'crawl');
      if (nests.length) {
        for (const [u, order] of this.orders) if (u.team === 'crawl' && u.alive && order.owner === 'crawl') this.retask(u);
        this.m.onMessage?.('ZERG SURGE', 'The swarm is moving out of the east', 3);
      }
    }

    // Score: every base held, every second.
    this.elapsedScore += dt;
    for (const army of this.armies) {
      if (army.team === 'crawl') continue;
      const held = this.bases.filter((b) => !b.hq && b.owner === army.team).length;
      army.score += held * POINTS_PER_BASE * dt;
    }
    const raiders = this.armies[0];
    const directorate = this.armies[1];
    this.m.progress.set('win', `${Math.floor(raiders.score)} / ${WIN_SCORE}`);
    for (const mark of [500, 750, 900]) {
      if (directorate.score >= mark && !this.warned.has(`d${mark}`)) {
        this.warned.add(`d${mark}`);
        this.say(HORNER, 'ashby', `The Dominion is at ${mark} points. We need more bases, now!`, 3);
      }
      if (raiders.score >= mark && !this.warned.has(`r${mark}`)) {
        this.warned.add(`r${mark}`);
        this.say(RAYNOR, 'harlan', `${mark} points. Keep the pressure on!`, 3);
      }
    }
    const capturable = this.bases.filter((b) => !b.hq);
    if (raiders.score >= WIN_SCORE || capturable.every((b) => b.owner === 'holdouts')) {
      this.complete('win');
      if (this.m.status.get('east') === 'active' && !this.bases.some((b) => b.owner === 'crawl')) this.complete('east');
      this.m.win('Tarsonis is ours.');
    } else if (directorate.score >= WIN_SCORE) {
      this.say(DOMINION_OFFICER, 'directorate', 'The rebels are broken. Sweep the ruins.', 3);
      this.m.lose('The Dominion holds Tarsonis.');
    }
    if (this.m.status.get('east') === 'active' && !this.bases.some((b) => b.owner === 'crawl')) this.complete('east');
  }

  /** For the HUD: both scores and every base's state. */
  get scoreboard() {
    return {
      raiders: this.armies[0].score,
      directorate: this.armies[1].score,
      target: WIN_SCORE,
      bases: this.bases.filter((b) => !b.hq).map((b) => ({ letter: b.letter, owner: b.owner, contested: !!b.point?.contested, capturing: b.point?.capturer ?? null })),
    };
  }

  get deployChoice(): string {
    return this.spawnBase;
  }

  pickDeploy(id: string) {
    this.spawnBase = id;
  }

  /** Every owned base that's safe to deploy at, for the deploy choice. */
  deployOptions(): { id: string; label: string }[] {
    return this.spawnable('holdouts').map((b) => ({ id: b.id, label: b.hq ? b.name : `${b.letter} · ${b.name}` }));
  }

  /** Everyone, for debugging. */
  census(): Record<string, number> {
    const c: Record<string, number> = {};
    for (const e of this.w.entities) if (e.alive && !e.isBuilding) c[e.team] = (c[e.team] ?? 0) + 1;
    return c;
  }
}

