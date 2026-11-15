import * as THREE from 'three';
import { faceTowards, GuardBrain, CrawlBrain } from '../../../../src/game/brains.ts';
import type { Controller, Entity, Unit } from '../../../../src/game/entity.ts';
import { canHit, type KindName } from '../../../../src/game/kinds.ts';
import type { SoundName } from '../../../../src/content/assetnames.ts';
import type { Mission } from '../../../../src/game/mission.ts';
import { HoldBrain, ScriptBase, walkableNear, type ScriptHost } from '../../../../src/game/script.ts';
import { metabolicBoost } from './tide.ts';
import type { PracticeRules } from '../../../../src/game/systems/rules.ts';
import { LOOK, UNIT_ULTIMATES, type UltimateId } from '../../../../src/game/ultimate.ts';
import type { VehicleSpecial } from '../../../../src/game/vehicle.ts';
import { Minelayers, Stompers } from '../../../../src/game/experimental/unleashed/machines.ts';
import { PLAYER_EDGE } from '../../../../src/game/experimental/unleashed/power.ts';
import { RangeUI, type BodyOption, type CallOption, type RangeView } from '../../../../src/game/experimental/unleashed/rangeui.ts';
import { LanternSky, SKY_FILL, SUN_ELEVATION } from '../../../../src/game/experimental/unleashed/sky.ts';

/**
 * The Practice Range (docs/the-tide-unleashed.md): The Tide: Unleashed's ground, power and units
 * with nothing to hold, as a shooter's practice range has it. The player takes any unit from the
 * range's panel (G) and is in it at once; calls up targets where they're looking (standing still,
 * fighting back from where they stand, or charging), allies to stim, heal or carry, or the swarm
 * itself; and spends ultimates freely: they recharge as soon as the last one is over (or in ten
 * seconds, or by fighting, as the panel says), and Z fills one at once, the Hyperion's too. The
 * panel's settings start at the mission's (`MissionRules.practice`) and are kept for next time.
 * The first body is the class picked to deploy; a lost one comes back as the unit last taken.
 */

/** The units on offer, by group (each with its own ultimate: ultimate.ts's `UNIT_ULTIMATES`). */
const BODIES: { group: string; kinds: KindName[] }[] = [
  { group: 'Infantry', kinds: ['trooper', 'grenadier', 'burner', 'medic', 'seer', 'vaulter'] },
  { group: 'Vehicles', kinds: ['howitzerMobile', 'torchrunner', 'coyote', 'picket', 'bulwark', 'behemoth'] },
  { group: 'Aircraft', kinds: ['jackknifeFighter', 'nightjar', 'swift', 'frigate', 'dustoff'] },
];
const NAMES: Partial<Record<KindName, string>> = {
  trooper: 'Marine',
  grenadier: 'Marauder',
  burner: 'Firebat',
  medic: 'Medic',
  seer: 'Ghost',
  vaulter: 'Reaper',
  howitzerMobile: 'Siege Tank',
  torchrunner: 'Hellion',
  coyote: 'Vulture',
  picket: 'Goliath',
  bulwark: 'Thor',
  behemoth: 'Odin',
  jackknifeFighter: 'Viking',
  nightjar: 'Banshee',
  swift: 'Wraith',
  frigate: 'Valkyrie',
  dustoff: 'Medivac',
};
/** What an ultimate needs to be any use (its refusals, systems/ultimates.ts), and how the range gets it. */
const NEEDS: Partial<Record<UltimateId, string>> = {
  superJolt: 'Marines near you: call up allies',
  triage: 'Someone hurt near you: call up the wounded',
  evacuation: 'Wounded near you: call up the wounded',
  creep: 'Sieged: E first',
  scatter: 'In the air, with flyers in reach',
  volleylock: 'Flyers in reach',
  missileStorm: 'Flyers in reach',
  warhead: 'Keep the laser on the mark until it lands',
};

/** Something to call up: a group of one kind, the swarm's or ours. */
interface Call extends CallOption {
  kind: KindName;
  ally?: boolean;
  /** Called up wounded: this share of their life. */
  hurt?: number;
}
const TARGETS: Call[] = [
  { id: 'hound', label: 'Zerglings', kind: 'hound', count: 12 },
  { id: 'leaper', label: 'Raptors', kind: 'leaper', count: 8 },
  { id: 'blister', label: 'Banelings', kind: 'blister', count: 6 },
  { id: 'shellback', label: 'Roaches', kind: 'shellback', count: 6 },
  { id: 'quillback', label: 'Hydralisks', kind: 'quillback', count: 6 },
  { id: 'tusker', label: 'Ultralisk', kind: 'tusker', count: 1 },
  { id: 'kite', label: 'Mutalisks', kind: 'kite', count: 6, air: true },
  { id: 'bilewing', label: 'Corruptors', kind: 'bilewing', count: 3, air: true },
  { id: 'sower', label: 'Brood Lord', kind: 'sower', count: 1, air: true },
  { id: 'lantern', label: 'Overlords', kind: 'lantern', count: 2, air: true },
];
const ALLIES: Call[] = [
  { id: 'squad', label: 'Marines', kind: 'trooper', count: 6, ally: true },
  { id: 'wounded', label: 'Wounded', kind: 'trooper', count: 6, ally: true, hurt: 0.35 },
];
/** Allies are called up this close, meters, where the player is looking. */
const ALLIES_AT = 10;

/** A group called up: what it is, where, and who's left of it. */
interface Group {
  call: Call;
  at: THREE.Vector3;
  units: Unit[];
  /** When the last of it fell (it comes back a few seconds on, where respawn is on). */
  downAt: number | null;
}
/** Seconds before a wiped-out group comes back. */
const RESPAWN = 3;

/**
 * The swarm coming in on its own: a pack of `heads` every `every` seconds, while fewer than `cap`
 * Zerg are on the field, from `from` meters out along the swarm's routes, charging. Its mix is
 * Unleashed's past halfway (Raptors among the Zerglings, an Ultralisk now and then).
 */
const SWARM = {
  steady: { every: 6, heads: 14, cap: 120 },
  flood: { every: 4, heads: 40, cap: 400 },
};
const SWARM_FROM = 150;
const SWARM_MIX: [KindName, number][] = [
  ['hound', 0.46],
  ['leaper', 0.14],
  ['blister', 0.08],
  ['shellback', 0.12],
  ['quillback', 0.12],
  ['tusker', 0.02],
  ['kite', 0.06],
];

/** Seconds of damage the "a second" figure averages over. */
const DPS_WINDOW = 5;
/** What a cast's kills and damage count toward: its own seconds and this many more (what it set going landing). */
const ULTIMATE_TAIL = 2;

/** The panel's settings, kept between visits (test runs keep their own). */
const STORE = typeof location !== 'undefined' && new URLSearchParams(location.search).has('test') ? 'botg.practice.test' : 'botg.practice.v1';
const dir = new THREE.Vector2();
/** The soldiers' own word as they're taken. */
const READY: Partial<Record<KindName, SoundName>> = { trooper: 'trooperReady', grenadier: 'grenadierReady', seer: 'seerReady', vaulter: 'vaulterReady' };

/** A target that stands its ground and fights back: whatever of ours comes in reach. */
class StandBrain implements Controller {
  private target: Entity | null = null;
  private retarget = Math.random() * 0.4;

  constructor(private u: Unit) {}

  update(dt: number) {
    const u = this.u;
    u.move.set(0, 0);
    this.retarget -= dt;
    if (this.retarget <= 0 || !this.target?.alive) {
      this.retarget = 0.4;
      const reach = Math.max(u.kind.weapon?.range ?? 0, u.kind.antiAir?.range ?? 0) + u.radius + 30;
      this.target = u.world.nearestTarget(u, reach, (e) => canHit(u.kind.weapon, e) || canHit(u.kind.antiAir, e));
    }
    const t = this.target;
    if (!t?.alive || !u.inRange(t)) return;
    faceTowards(u, t);
    u.attack(t);
  }
}

/**
 * A target that comes at the player's body: straight for it by the world's paths (through the air
 * for a flyer), then the swarm's own brain once it's close (who to bite, surrounding, swirling).
 * One the player's attack tokens hold back crowds in close anyway.
 */
class ChargeBrain implements Controller {
  private crawl: CrawlBrain;

  constructor(private u: Unit) {
    this.crawl = new CrawlBrain(u);
  }

  release() {
    this.crawl.release();
  }

  update(dt: number) {
    const u = this.u;
    const w = u.world;
    const p = w.player;
    const d = p ? Math.hypot(p.position.x - u.position.x, p.position.z - u.position.z) : Infinity;
    if (p?.alive && d > (u.flying ? 45 : 30)) {
      u.face = null;
      if (u.flying) u.move.set(p.position.x - u.position.x, p.position.z - u.position.z).normalize();
      else u.move.copy(w.chase(u, p.position, dir));
      return;
    }
    this.crawl.update(dt);
    if (p?.alive && u.move.lengthSq() < 1e-4 && !u.inRange(p) && d > u.radius + p.radius + 4) u.move.copy(w.chase(u, p.position, dir));
  }
}

export class PracticeScript extends ScriptBase {
  private settings: PracticeRules;
  private ui: RangeUI | null = null;
  private open = false;
  /** Where bodies are taken and come back: the base's floor, where the Command Center would stand. */
  private pad = new THREE.Vector3();
  /** The way the swarm comes in Unleashed, from the pad (unit), and the bearing it faces. */
  private out = new THREE.Vector3(0, 0, 1);
  private facing = 0;
  /** The swarm's routes, from the map. */
  private routes: THREE.Vector3[] = [];
  /** The bodies the range has made for the player (taken from the panel, or deployed). */
  private mine = new Set<Entity>();
  /** The unit last taken from the panel: what a lost body comes back as (until then, the class picked to deploy). */
  private taken: KindName | null = null;
  /** Bodies already turned to face down the range. */
  private faced = new WeakSet<Entity>();
  private groups: Group[] = [];
  private swarmIn = 0;
  private groupsIn = 0;
  private sky: LanternSky | null = null;
  private stompers = new Stompers(this.w);
  private mines = new Minelayers(this.w);
  /** What the player has dealt: the recent blows (for the figure a second), the total, the kills. */
  private dealt: { t: number; amount: number }[] = [];
  private total = 0;
  private kills = 0;
  /** The last ultimate cast, and what it did. */
  private last: { id: UltimateId; until: number; kills: number; damage: number } | null = null;

  constructor(m: Mission, host: ScriptHost) {
    super(m, host);
    const defaults: PracticeRules = m.def.rules?.practice ?? { ultimate: 'instant', targets: 'still', distance: 60, respawn: true, invulnerable: true, swarm: 'off' };
    this.settings = { ...defaults };
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) ?? 'null') as Partial<PracticeRules> | null;
      if (saved) for (const key of Object.keys(defaults) as (keyof PracticeRules)[]) if (typeof saved[key] === typeof defaults[key]) (this.settings as unknown as Record<string, unknown>)[key] = saved[key];
    } catch {
      // Storage blocked or unreadable: the mission's own settings.
    }
  }

  private save() {
    try {
      localStorage.setItem(STORE, JSON.stringify(this.settings));
    } catch {
      // Storage blocked (private window): the settings last for this visit.
    }
  }

  /** The range: Unleashed's valley with no base on it, the Hyperion behind, the sky and the sun as there. */
  setup() {
    const w = this.w;
    const L = this.m.layout;
    w.goal = null;
    w.playerDamage = PLAYER_EDGE;
    // The swarm runs with Metabolic Boost from the first minute in Unleashed: so here.
    metabolicBoost(w.kinds);
    const cc = new THREE.Vector3(L.holdfast.x, 0, L.holdfast.z);
    this.routes = L.lanes.map((l) => l.spawn.clone());
    const out = new THREE.Vector3();
    for (const r of this.routes) out.add(new THREE.Vector3(r.x - cc.x, 0, r.z - cc.z).normalize());
    if (out.lengthSq() < 1e-6) out.set(0, 0, 1);
    this.out = out.normalize();
    this.facing = Math.atan2(this.out.x, this.out.z);
    this.pad = walkableNear(w, cc, 3);
    this.sky = new LanternSky(w, cc, this.routes, this.out);
    this.host.setSun?.(this.out, SUN_ELEVATION, SKY_FILL);
  }

  start() {
    // The Hyperion waits behind the range until it's called (X).
    const ship = this.host.ship;
    ship.post = this.pad.clone().addScaledVector(this.out, -260);
    ship.settle();
    this.host.ultimateCharging?.(this.settings.ultimate);
    const ui = (this.ui = new RangeUI());
    ui.onBody = (kind) => this.take(kind as KindName);
    ui.onCall = (id) => this.call(id);
    ui.onOption = (key, value) => this.option(key, value);
    ui.onAct = (act) => {
      if (act === 'clear') this.clear();
      else if (act === 'recharge') this.recharge();
      else if (act === 'ship') this.readyShip();
      else this.resetStats();
    };
    ui.onClose = () => this.close(true);
    this.m.onMessage?.('PRACTICE RANGE', 'G: take any unit, call up targets · Z: recharge your ultimate', 5);
    this.say('Matt Horner', 'ashby', "The range is yours, Corporal. Press G for any unit we've got, and to call up targets.", 4);
  }

  respawnPoint(): THREE.Vector3 {
    return walkableNear(this.w, this.pad.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6)), 2);
  }

  deployKind(): KindName | null {
    return this.taken;
  }

  /** G (and Esc, or a click on the battlefield, to close): the panel. The game takes the mouse back as it shuts. */
  action() {
    this.open = !this.open;
    this.w.sfx.play(this.open ? 'ui.select' : 'ui.click');
  }

  cursor(): boolean {
    return this.open;
  }

  /** Shuts the panel; `clicked` inside it (its ✕, a unit taken), so the mouse is captured again in the same click. */
  private close(clicked: boolean) {
    if (!this.open) return;
    this.open = false;
    this.w.sfx.play('ui.click');
    if (clicked) this.host.panelChanged?.();
  }

  protected tick(dt: number) {
    this.sky?.update(dt);
    this.stompers.update(dt);
    this.mines.update(dt);
    this.bodies();
    this.respawns(dt);
    this.swarm(dt);
    if (this.host.input?.hit('KeyZ')) this.recharge();
    if (this.last && this.time > this.last.until + 30) this.last = null;
    this.screens();
  }

  /**
   * The player's body: a new one (deployed after a loss) faces down the range, and is the range's
   * to take back when the next is taken; invulnerable or not, as the panel says.
   */
  private bodies() {
    const body = this.body();
    const inv = this.settings.invulnerable;
    this.w.incomingDamage = inv ? 0 : this.m.difficulty.incoming;
    for (const e of this.mine) if (!e.alive) this.mine.delete(e);
    if (!body) return;
    if (!this.mine.has(body) && body.team === 'holdouts') this.mine.add(body);
    if (!this.faced.has(body)) {
      this.faced.add(body);
      const a = this.host.avatar();
      if (a) a.yaw = this.facing;
    }
    for (const e of this.mine) if (e.alive) e.minHp = inv && e === body ? 1 : 0;
  }

  /**
   * Into a new unit of `kind` at once, where the last one stood (or on the pad), facing the same
   * way; the last one and whatever the range made before it go.
   */
  private take(kind: KindName) {
    const w = this.w;
    const was = this.body();
    const a = this.host.avatar();
    const yaw = a?.yaw ?? this.facing;
    const at = walkableNear(w, was?.alive ? was.position : this.pad, 3);
    const u = w.spawnUnit(kind, at.x, at.z, yaw, undefined, 'holdouts');
    this.faced.add(u);
    // The body left counts as the range's even before its first tick has claimed it.
    const old = [...this.mine, ...(was?.team === 'holdouts' ? [was] : [])];
    this.mine.clear();
    this.mine.add(u);
    this.taken = kind;
    this.close(true);
    this.host.possess?.(u);
    const after = this.host.avatar();
    if (after) after.yaw = yaw;
    for (const e of old) if (e !== u) w.despawn(e);
    const voice = READY[kind];
    if (voice) w.audio.play(voice, { volume: 0.9 });
    else w.sfx.play('ui.select');
    const id = UNIT_ULTIMATES[kind];
    this.m.onMessage?.((NAMES[kind] ?? kind).toUpperCase(), id ? `Q: ${LOOK[id].label}${NEEDS[id] ? ` · ${NEEDS[id]}` : ''}` : '', 2.5);
  }

  /** Calls up a group where the player is looking: targets at the panel's distance, allies close. */
  private call(id: string) {
    const call = [...TARGETS, ...ALLIES].find((c) => c.id === id);
    if (!call) return;
    const from = this.body()?.position ?? this.pad;
    const yaw = this.host.avatar()?.yaw ?? this.facing;
    const reach = call.ally ? ALLIES_AT : this.settings.distance;
    const at = new THREE.Vector3(from.x + Math.sin(yaw) * reach, 0, from.z + Math.cos(yaw) * reach);
    const group: Group = { call, at: call.air ? at : walkableNear(this.w, at, 3), units: [], downAt: null };
    this.fill(group);
    this.groups.push(group);
    this.w.sfx.play('ui.click');
  }

  /** A group's units, in a loose cluster round its spot, facing the player. */
  private fill(g: Group) {
    const w = this.w;
    const from = this.body()?.position ?? this.pad;
    const face = Math.atan2(from.x - g.at.x, from.z - g.at.z);
    let spacing = 3;
    for (let i = 0; i < g.call.count; i++) {
      // A sunflower's spiral: evenly spread, the first in the middle.
      const r = i === 0 ? 0 : spacing * Math.sqrt(i + 0.3);
      const a = i * 2.39996;
      let p = new THREE.Vector3(g.at.x + Math.cos(a) * r, 0, g.at.z + Math.sin(a) * r);
      if (!g.call.air) p = walkableNear(w, p, 1.5);
      const u = w.spawnUnit(g.call.kind, p.x, p.z, face, (unit) => this.brain(unit, g.call), g.call.ally ? 'holdouts' : 'crawl');
      if (i === 0) spacing = Math.max(2.2, u.radius * 2.6);
      if (g.call.hurt) u.hp = u.maxHp * g.call.hurt;
      g.units.push(u);
    }
  }

  private brain(u: Unit, call: Call): Controller {
    if (call.ally) return new GuardBrain(u, u.position.clone());
    const t = this.settings.targets;
    return t === 'still' ? new HoldBrain(u) : t === 'fight' ? new StandBrain(u) : new ChargeBrain(u);
  }

  /** Groups wiped out come back where they were called up, a few seconds on (where respawn is on). */
  private respawns(dt: number) {
    this.groupsIn -= dt;
    if (this.groupsIn > 0) return;
    this.groupsIn = 0.5;
    for (const g of [...this.groups]) {
      if (g.units.some((u) => u.alive)) {
        g.downAt = null;
        continue;
      }
      if (g.call.ally || !this.settings.respawn) {
        this.groups.splice(this.groups.indexOf(g), 1);
        continue;
      }
      g.downAt ??= this.time;
      if (this.time - g.downAt < RESPAWN) continue;
      g.units = [];
      g.downAt = null;
      this.fill(g);
    }
  }

  /** The swarm on its own, in packs down its routes, at whatever the player is in. */
  private swarm(dt: number) {
    const level = this.settings.swarm === 'off' ? null : SWARM[this.settings.swarm];
    if (!level) return;
    this.swarmIn -= dt;
    if (this.swarmIn > 0) return;
    this.swarmIn = level.every;
    const w = this.w;
    let crawl = 0;
    for (const e of w.entities) if (e.alive && e.team === 'crawl' && !e.isBuilding) crawl++;
    if (crawl >= level.cap || !this.routes.length) return;
    const route = this.routes[Math.floor(Math.random() * this.routes.length)];
    const along = new THREE.Vector3(route.x - this.pad.x, 0, route.z - this.pad.z);
    const center = walkableNear(w, this.pad.clone().addScaledVector(along.normalize(), Math.min(SWARM_FROM, route.distanceTo(this.pad))), 6);
    const face = Math.atan2(this.pad.x - center.x, this.pad.z - center.z);
    const total = SWARM_MIX.reduce((a, [, k]) => a + k, 0);
    for (let i = 0; i < level.heads; i++) {
      let pick = Math.random() * total;
      const kind = SWARM_MIX.find(([, k]) => (pick -= k) <= 0)?.[0] ?? 'hound';
      const p = walkableNear(w, center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 30, 0, (Math.random() - 0.5) * 30)), 2);
      w.spawnUnit(kind, p.x, p.z, face, (u) => new ChargeBrain(u), 'crawl');
    }
  }

  /** Off the field: every Zerg, and the allies called up. */
  private clear() {
    const w = this.w;
    for (const e of w.entities) if (e.alive && !e.isBuilding && e.team === 'crawl') w.despawn(e);
    for (const g of this.groups) for (const u of g.units) if (u.alive) w.despawn(u);
    this.groups = [];
    w.sfx.play('ui.click');
  }

  /** Z: the ultimate full at once, the Hyperion ready, a Vulture's mines back. */
  private recharge() {
    this.host.chargeUltimate?.();
    this.readyShip(true);
    this.mines.refill();
    this.m.onMessage?.('RECHARGED', 'Your ultimate is ready · the Hyperion too', 1.2);
    this.w.sfx.play('ui.select', { volume: 0.7 });
  }

  private readyShip(quiet = false) {
    const ship = this.host.ship;
    if (!ship.striking) ship.rechargeLeft = 0;
    if (!quiet) this.w.sfx.play('ui.click');
  }

  private resetStats() {
    this.dealt = [];
    this.total = 0;
    this.kills = 0;
    this.last = null;
    this.w.sfx.play('ui.click');
  }

  private option(key: keyof PracticeRules, value: string | number | boolean) {
    (this.settings as unknown as Record<string, unknown>)[key] = value;
    this.save();
    this.w.sfx.play('ui.click');
    if (key === 'ultimate') this.host.ultimateCharging?.(this.settings.ultimate);
    // What the targets on the field do changes with the setting.
    if (key === 'targets') for (const g of this.groups) if (!g.call.ally) for (const u of g.units) if (u.alive) u.setController(this.brain(u, g.call));
    if (key === 'swarm') this.swarmIn = 0;
  }

  playerDealt(e: Entity, amount: number) {
    // What it actually took: not the overkill past its last life.
    const took = amount + Math.min(0, e.hp);
    if (took <= 0 || e.team === 'holdouts') return;
    this.dealt.push({ t: this.time, amount: took });
    this.total += took;
    if (this.last && this.time <= this.last.until) this.last.damage += took;
  }

  playerKilled(e: Entity) {
    if (e.team === 'holdouts') return;
    this.kills++;
    if (this.last && this.time <= this.last.until) this.last.kills++;
  }

  playerUltimate(id: UltimateId, seconds: number) {
    this.last = { id, until: this.time + seconds + ULTIMATE_TAIL, kills: 0, damage: 0 };
  }

  vehicleSpecial(u: Unit): VehicleSpecial | null {
    return this.mines.special(u);
  }

  private screens() {
    const ui = this.ui;
    if (!ui) return;
    const ground = (this.host.mode?.() ?? 'ground') === 'ground';
    if (!ground) this.close(false);
    while (this.dealt.length && this.dealt[0].t < this.time - DPS_WINDOW) this.dealt.shift();
    const recent = this.dealt.reduce((a, d) => a + d.amount, 0);
    const span = Math.min(DPS_WINDOW, Math.max(1, this.time - (this.dealt[0]?.t ?? this.time)));
    const last = this.last;
    const ship = this.host.ship;
    let crawl = 0;
    for (const e of this.w.entities) if (e.alive && e.team === 'crawl' && !e.isBuilding) crawl++;
    const bodies = BODIES.map((g) => ({
      group: g.group,
      items: g.kinds.map((kind): BodyOption => {
        const id = UNIT_ULTIMATES[kind];
        return { kind, label: NAMES[kind] ?? kind, ultimate: id ? LOOK[id].label : '—', color: id ? LOOK[id].color : 'transparent', hint: id ? (NEEDS[id] ?? '') : '' };
      }),
    }));
    const view: RangeView = {
      open: this.open,
      body: this.body()?.kind.name ?? null,
      bodies,
      targets: TARGETS,
      allies: ALLIES,
      settings: this.settings,
      ship: ship.striking ? 'Striking' : ship.rechargeLeft > 0 ? `Back in ${Math.ceil(ship.rechargeLeft)}s` : 'Ready · X',
      shipReady: !ship.striking && ship.rechargeLeft <= 0,
      stats: {
        dps: this.dealt.length ? recent / span : 0,
        total: this.total,
        kills: this.kills,
        last: last ? `${LOOK[last.id].label}: ${last.kills} killed · ${Math.round(last.damage).toLocaleString()} damage${this.time <= last.until ? ' (going on)' : ''}` : 'Cast an ultimate (Q) to see what it does',
      },
      field: { crawl, allies: this.groups.filter((g) => g.call.ally).reduce((a, g) => a + g.units.filter((u) => u.alive).length, 0) },
    };
    ui.show(view);
    ui.showStrip(ground ? view : null);
  }
}
