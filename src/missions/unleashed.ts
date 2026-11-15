import type { MapTerrain } from '../../../../src/engine/mapterrain.ts';
import type { MapData } from '../../../../src/engine/mapdata.ts';
import type { Stats } from '../../../../src/game/stats.ts';
import type { ScriptHost } from '../../../../src/game/script.ts';
import type { Mission } from '../../../../src/game/mission.ts';
import type { SquadDef } from '../../../../src/game/systems/production.ts';
import { TIDE, TideScript, type TideTuning } from './tide.ts';
import * as THREE from 'three';
import type { Entity, Unit } from '../../../../src/game/entity.ts';
import type { VehicleSpecial } from '../../../../src/game/vehicle.ts';
import { describe, FunMeter } from '../../../../src/game/systems/fun.ts';
import { walkableNear } from '../../../../src/game/script.ts';
import { BarracksDrop } from '../../../../src/game/experimental/unleashed/drop.ts';
import { Minelayers, Stompers } from '../../../../src/game/experimental/unleashed/machines.ts';
import { PLAYER_EDGE } from '../../../../src/game/experimental/unleashed/power.ts';
import { LanternSky, SKY_FILL, SUN_ELEVATION } from '../../../../src/game/experimental/unleashed/sky.ts';

/**
 * The Tide: Unleashed (docs/the-tide-unleashed.md). The Tide's hold, with every machine at its
 * real-world power (power.ts, applied to the kinds when the mission loads) and a swarm several
 * times as big and faster from the first minute, so the power is never enough on its own.
 */

/**
 * Power is dear: a Siege Tank costs what a platoon does, a Thor a company. Each with StarCraft
 * II's hotkey in its building: the Goliath its grid layout's D (G is the board's own key), the
 * Odin co-op's O, the Valkyrie Brood War's Y.
 */
const SQUADS: SquadDef[] = [
  { key: '1', hotkey: 'A', also: ['M'], label: 'Marines', producer: 'barracks', units: [['trooper', 6]] },
  { key: '2', hotkey: 'D', label: 'Marauders', producer: 'barracks', units: [['grenadier', 3]] },
  { key: '3', hotkey: 'F', label: 'Firebats', producer: 'barracks', units: [['burner', 3]] },
  { key: '4', hotkey: 'E', label: 'Medics', producer: 'barracks', units: [['medic', 2]] },
  { key: '5', hotkey: 'R', label: 'Ghosts', producer: 'barracks', units: [['seer', 2]] },
  { key: '6', hotkey: 'S', label: 'Siege Tank', producer: 'motorPool', units: [['howitzerMobile', 1]], cost: { ore: 500, gas: 350 } },
  { key: '7', hotkey: 'E', label: 'Hellions', producer: 'motorPool', units: [['torchrunner', 3]], cost: { ore: 750, gas: 0 } },
  { key: '8', hotkey: 'T', label: 'Thor', producer: 'motorPool', units: [['bulwark', 1]], cost: { ore: 1200, gas: 800 }, limit: 3 },
  // The classic machines.
  { key: '9', hotkey: 'D', label: 'Goliaths', producer: 'motorPool', units: [['picket', 2]], cost: { ore: 800, gas: 300 } },
  { key: '0', hotkey: 'V', label: 'Vultures', producer: 'motorPool', units: [['coyote', 3]], cost: { ore: 600, gas: 0 } },
  { key: 'O', hotkey: 'O', label: 'Odin', producer: 'motorPool', units: [['behemoth', 1]], cost: { ore: 3000, gas: 2000 }, limit: 1 },
  { key: 'K', hotkey: 'V', label: 'Vikings', producer: 'airfield', units: [['jackknifeFighter', 2]], air: true, cost: { ore: 700, gas: 400 } },
  { key: 'B', hotkey: 'E', label: 'Banshees', producer: 'airfield', units: [['nightjar', 2]], air: true, cost: { ore: 800, gas: 500 } },
  { key: 'H', hotkey: 'W', label: 'Wraiths', producer: 'airfield', units: [['swift', 2]], air: true, cost: { ore: 750, gas: 450 } },
  { key: 'L', hotkey: 'Y', label: 'Valkyries', producer: 'airfield', units: [['frigate', 2]], air: true, cost: { ore: 800, gas: 500 } },
];

export const UNLEASHED: TideTuning = {
  ...TIDE,
  // Three times The Tide's swarm, by supply, and mostly Zerglings: by head count, about seven in
  // ten. It starts strong (the machines can't be left to hold the first minutes alone), and the
  // heavies come in a few at a time: the first Ultralisks at two-fifths of the way, more by halves.
  swarm: {
    curve: [
      [0, 380],
      [0.2, 560],
      [0.55, 675],
      [0.78, 800],
      [0.92, 1000],
      [1, 1100],
    ],
    scale: [0.75, 1, 1.12, 1.25],
    mix: [
      { from: 0, mix: [['hound', 0.62], ['shellback', 0.2], ['quillback', 0.18]] },
      { from: 0.22, mix: [['hound', 0.5], ['blister', 0.1], ['shellback', 0.14], ['quillback', 0.16], ['kite', 0.1]] },
      { from: 0.4, mix: [['hound', 0.47], ['blister', 0.1], ['shellback', 0.12], ['quillback', 0.16], ['tusker', 0.05], ['kite', 0.1]] },
      // From past halfway, Heart of the Swarm's Raptor strain among the Zerglings: they leap the last few meters.
      { from: 0.55, mix: [['hound', 0.3], ['leaper', 0.13], ['blister', 0.1], ['shellback', 0.1], ['quillback', 0.15], ['tusker', 0.09], ['kite', 0.08], ['bilewing', 0.05]] },
      { from: 0.75, mix: [['hound', 0.25], ['leaper', 0.15], ['blister', 0.08], ['shellback', 0.08], ['quillback', 0.12], ['tusker', 0.12], ['kite', 0.06], ['bilewing', 0.04], ['sower', 0.1]] },
    ],
  },
  packEvery: [4, 8],
  topUpPerSecond: 72,
  packMax: 210,
  surgeShare: 0.35,
  surgeCap: 1.2,
  // StarCraft II's Metabolic Boost from the first minute: the Zerglings come at a racing dog's pace.
  evolutions: [{ at: 0, name: 'Metabolic Boost', apply: 'metabolic' }, ...TIDE.evolutions],
  squads: SQUADS,
  // Kills come five to ten times as fast here: each pays a fifth of what it does in The Tide.
  bounty: { kill: 0.1, assist: 0.03 },
  corpse: { seconds: 3, fade: 1.2 },
  // Against three times the swarm, an army that can grow to twice StarCraft II's 200, with the
  // bays to build it (money is what holds it back).
  capScale: 2,
  // Lost SCVs are trained again at the Command Center, at an SCV's cost.
  replaceWorkers: true,
  // The lines 15 m further out than The Tide's, and the map's forward bunkers no more than 25 m
  // in front of them: a strongpoint the line covers, not an outpost left on its own.
  frontDistance: 125,
  outpost: 25,
};

/**
 * Where the Barracks drop sets down: this far out in front of the player's line, meters (the
 * cinematic's lands right at the front, nothing between its doors and the swarm); and the
 * recruits it brings.
 */
const DROP_AHEAD = 34;
const RECRUITS = 6;
/** What's coming when the doors open: a first surge down the route they face (supply). */
const WELCOME = 110;

export class UnleashedScript extends TideScript {
  private sky: LanternSky | null = null;
  /** Walkers stamping out the Zerg at their feet, and Vultures with their Spider Mines (machines.ts). */
  private stompers = new Stompers(this.w);
  private mines = new Minelayers(this.w);
  /** How the hold measures up as a game: stress, achievement, flow (systems/fun.ts). */
  private fun: FunMeter | null = null;
  /** The opening's Barracks drop, the body it holds until the doors open, and whether they have. */
  private drop: BarracksDrop | null = null;
  private held: Entity | null = null;
  private landed = false;
  private firstBody = true;
  /** Whether the first Raptors have been called out on the radio, and when to look again. */
  private raptorsSeen = false;
  private lookIn = 1;

  constructor(m: Mission, host: ScriptHost, map: MapData, terrain: MapTerrain, data: Stats) {
    super(m, host, map, terrain, data, UNLEASHED);
  }

  setup() {
    super.setup();
    this.w.playerDamage = PLAYER_EDGE;
    this.sky = new LanternSky(this.w, this.cc.position, this.routes, this.lines.fronts[0]?.out ?? null);
    // The sun low over the swarm's side, as the cinematic has it: the lines look into the light,
    // the swarm and its Overlords come out of the glare as silhouettes.
    const toward = new THREE.Vector3();
    for (const r of this.routes) toward.add(new THREE.Vector3(r.x - this.cc.position.x, 0, r.z - this.cc.position.z).normalize());
    if (toward.lengthSq() > 1e-6) this.host.setSun?.(toward.normalize(), SUN_ELEVATION, SKY_FILL);
  }

  start() {
    super.start();
    if (this.host.stats) this.fun = new FunMeter(this.host.stats);
    // The cinematic's beat: the first body comes by Barracks drop, behind the line nearest the base.
    const f = this.lines.fronts[0];
    if (!f) return;
    this.drop = new BarracksDrop(this.w, walkableNear(this.w, f.at.clone().addScaledVector(f.out, DROP_AHEAD), 6), f.out, f.at);
    // When the doors open, the swarm is already coming down the route they face.
    const cc = this.cc.position;
    let route = 0;
    let best = -Infinity;
    this.routes.forEach((r, i) => {
      const along = new THREE.Vector3(r.x - cc.x, 0, r.z - cc.z).normalize().dot(f.out);
      if (along > best) {
        best = along;
        route = i;
      }
    });
    this.apply({ side: 'crawl', kind: 'pack', supply: WELCOME, route });
  }

  respawnPoint(): THREE.Vector3 {
    const first = super.respawnPoint();
    if (!this.firstBody || !this.drop) return first;
    this.firstBody = false;
    return walkableNear(this.w, this.drop.door(), 2);
  }

  /** The drop: the shots while it comes in and opens, then the player out of its doors with the recruits. */
  private opening(dt: number) {
    const d = this.drop;
    if (!d) return;
    const input = this.host.input;
    const skip = !d.open && !!input && (input.hit('Space') || input.hit('Enter'));
    const pose = d.update(dt, skip);
    const body = this.body();
    if (!d.open) {
      // Aboard until the doors open.
      if (body && !body.stowed && body !== this.held) {
        body.stowed = true;
        this.held = body;
      }
      if (pose) this.host.cinematic?.(pose);
      return;
    }
    // Open: it waits a while, then lifts off and flies home (the drop keeps updating till then).
    if (this.landed) return;
    this.landed = true;
    this.host.cinematic?.(null);
    const door = d.door();
    if (this.held) {
      this.held.stowed = false;
      this.held.position.copy(walkableNear(this.w, door, 2));
    }
    const f = this.lines.fronts[0];
    if (f) for (let i = 0; i < RECRUITS; i++) this.lines.soldier('trooper', f, walkableNear(this.w, door.clone().add(new THREE.Vector3((Math.random() - 0.5) * 12, 0, (Math.random() - 0.5) * 12)), 2));
    this.w.audio.play('trooperReady', { volume: 0.7 });
  }

  protected tick(dt: number) {
    super.tick(dt);
    this.sky?.update(dt);
    this.mines.update(dt);
    this.stompers.update(dt);
    this.measure(dt);
    this.opening(dt);
    this.strains(dt);
  }

  /** The first Raptors on the field get a word on the radio. */
  private strains(dt: number) {
    if (this.raptorsSeen) return;
    this.lookIn -= dt;
    if (this.lookIn > 0) return;
    this.lookIn = 1;
    if (!this.w.entities.some((e) => e.alive && e.kind.name === 'leaper')) return;
    this.raptorsSeen = true;
    this.say('Matt Horner', 'ashby', 'New strain in the Zerglings, sir: these ones leap. Close up the gaps in the line!', 3);
  }

  private measure(dt: number) {
    const fun = this.fun;
    if (!fun) return;
    const w = this.w;
    const body = this.body();
    let engaged = false;
    if (body?.alive) {
      const reach = Math.max(body.kind.weapon?.range ?? 0, body.kind.antiAir?.range ?? 0) * 1.5 + 10;
      engaged = !!w.nearestEnemy(body.team, body.position.x, body.position.z, reach);
    }
    fun.update(dt, {
      intensity: this.director.intensity,
      body: body?.alive ? body : null,
      engaged,
      swarm: this.armySupply('crawl'),
      army: this.armySupply('holdouts'),
      base: this.cc.alive ? this.cc.hp / this.cc.maxHp : 0,
      brokenLines: this.lines.fronts.filter((f) => f.broken).length,
      progress: this.time / this.holdSeconds,
    });
  }

  playerKilled(e: Entity) {
    super.playerKilled(e);
    this.fun?.kill(e);
  }

  playerDown() {
    super.playerDown();
    this.fun?.death();
  }

  died(e: Entity) {
    super.died(e);
    if (e.team === 'crawl' && !e.isBuilding) this.fun?.teamKill();
  }

  frameTime(ms: number) {
    this.fun?.frame(ms);
  }

  measured(): string[] | null {
    if (!this.fun) return null;
    if (this.m.phase === 'victory' || this.m.phase === 'defeat') this.fun.end(this.m.phase === 'victory');
    return describe(this.fun.report());
  }

  /** The player's Vulture lays its mines on E. */
  vehicleSpecial(u: Unit): VehicleSpecial | null {
    return this.mines.special(u);
  }
}
