import * as THREE from 'three';
import type { Input } from '../../../../src/engine/input.ts';
import type { MapTerrain } from '../../../../src/engine/mapterrain.ts';
import type { MapData, Placement } from '../../../../src/engine/mapdata.ts';
import { BunkerGuns, GuardBrain, MedicBrain, openGround, Squad, SquadBrain, TurretBrain, CrawlBrain } from '../../../../src/game/brains.ts';
import type { Building, Controller, Entity, Unit } from '../../../../src/game/entity.ts';
import { FASTER, type Stats } from '../../../../src/game/stats.ts';
import { dataOf, type Kind, type KindName } from '../../../../src/game/kinds.ts';
import { mapYaw } from '../../../../src/game/layout.ts';
import { ScriptBase, walkableNear } from '../../../../src/game/script.ts';
import { AirWingBrain, LanternDropBrain, RaidBrain } from '../../../../src/game/systems/air.ts';
import { BOARD_GROUPS, TideUI, type BoardGroup, type BoardView, type Destination, type Marching } from '../../../../src/game/systems/board.ts';
import { Construction, DEFAULT_BUILD, type StructureDef } from '../../../../src/game/systems/construction.ts';
import { Director, type Phase } from '../../../../src/game/systems/director.ts';
import { bounty, BOUNTY, MinerBrain, Treasury } from '../../../../src/game/systems/economy.ts';
import { Lines, type Front, type Stance } from '../../../../src/game/systems/lines.ts';
import type { Commanded, Order } from '../../../../src/game/systems/orders.ts';
import { aimPoint, PlacementGhost } from '../../../../src/game/systems/placement.ts';
import { offers, Requisition, SUPPLY_CAP, HOLDOUTS_SQUADS, type Offer, type Producer, type ProductionRules, type SquadDef } from '../../../../src/game/systems/production.ts';
import { BountyStreak } from '../../../../src/game/systems/respawn.ts';
import { mixAt, Spawner, strengthAt, SurgeBrain, type ForceRules, type PackSource } from '../../../../src/game/systems/spawner.ts';
import { TransportBrain } from '../../../../src/game/systems/transport.ts';

/** The production buildings by StarCraft II's names (the game's are `barracks`, `motorPool`, `airfield`). */
const PRODUCER_NAMES: Record<Producer, string> = { barracks: 'Barracks', motorPool: 'Factory', airfield: 'Starport' };

const RAYNOR = 'Jim Raynor';
const HORNER = 'Matt Horner';

/**
 * The Tide: a special operation, apart from the campaign. Two hundred against two hundred on
 * Char, StarCraft II's maxed armies at true scale.
 *
 * - The Raiders' whole army stands in ranks across the approaches to their last base, tanks
 *   dug in behind; each line has a fallback with a bunker at its heart.
 * - The swarm comes down the map's routes in packs and surges, paced by a director (Left 4
 *   Dead's, see tide/director.ts): it builds to a crisis, lets it play out, then pulls back to
 *   regroup. It evolves as StarCraft II's does (carapace, attacks), and it answers air with air.
 * - The base earns (SCVs on the map's mineral line, refineries, and the player's own kills and
 *   assists, more on a streak), and the commander spends it on squads from the Barracks, Factory
 *   and Starport, sent where they're needed, and on Bunkers and Missile Turrets an SCV goes out
 *   and builds where they're placed. Free reinforcements come only in emergencies: holding
 *   takes what the player earns. What the mode allows is its rules (missions.ts); the
 *   production, construction, respawn and economy themselves are the shared systems.
 * - The player fights, dies, and goes again out of the Barracks; they can steer the lines and
 *   the squads, briefly, from the command view.
 * - The battle's size (the menu's Standard, Large or Epic) is a multiple of it all: the swarm
 *   grows to that multiple of itself over the first half of the hold, and the base can build the
 *   army up from its 200 to that multiple of StarCraft II's cap, the Command Center training
 *   SCVs and the production buildings working more squads at once to pay for it and turn it out.
 * - Hold until the fleet is in orbit; then it clears the field.
 */

/**
 * The Raiders' army at the start: infantry across the lines, at the data's supply (the
 * campaign's Medics and Firebats take two), with the tanks and the player: 200, StarCraft II's cap.
 */
const ARMY: [KindName, number][] = [
  ['trooper', 63],
  ['grenadier', 22],
  ['burner', 12],
  ['medic', 12],
  ['seer', 4],
];
/** Sieged tanks behind the lines. */
const TANKS = 8;
/** The home guard at the Command Center (two bunkers beside it, and these): what stops a leak becoming the end. */
const HOME_GUARD: [KindName, number][] = [
  ['trooper', 8],
  ['grenadier', 2],
];
const ARMY_SUPPLY = 200;

/** Seconds to hold, by difficulty level (the fleet's way in). */
const HOLD_SECONDS = [600, 720, 780, 840];

/**
 * The swarm: its strength on the field, in supply, over the operation (as a share of the hold, so
 * every difficulty builds to its climax at its own end), before the director's own drift; its
 * scale by difficulty; and what it sends, by share of its supply, as the operation goes on.
 */
const SWARM: ForceRules = {
  // The second half a little stronger, and a few more Ultralisks in it, since the Ultralisk's
  // cleave was put right (StarCraft II's: a third of the blow, each one in its arcs once; it
  // had been hitting everything round it four times over): with the old pressure the lines no
  // longer broke at all, where they used to buckle late about one hold in two.
  curve: [
    [0, 100],
    [0.2, 180],
    [0.55, 225],
    [0.78, 281],
    [0.92, 360],
    [1, 403],
  ],
  scale: [0.75, 1, 1.12, 1.25],
  mix: [
    { from: 0, mix: [['hound', 0.55], ['shellback', 0.25], ['quillback', 0.2]] },
    { from: 0.22, mix: [['hound', 0.38], ['blister', 0.1], ['shellback', 0.22], ['quillback', 0.2], ['kite', 0.1]] },
    { from: 0.5, mix: [['hound', 0.25], ['blister', 0.1], ['shellback', 0.17], ['quillback', 0.2], ['tusker', 0.18], ['kite', 0.1]] },
    { from: 0.8, mix: [['hound', 0.25], ['blister', 0.1], ['shellback', 0.1], ['quillback', 0.15], ['tusker', 0.23], ['kite', 0.05], ['sower', 0.12]] },
  ],
};

/**
 * StarCraft II's evolutions for the swarm, as the hold goes on: Carapace (+1 armor, ground and
 * air), Melee and Missile Attacks (per unit: +1 a level, the Ultralisk +3, the Roach +2), Flyer
 * Attacks (the Brood Lord +2), Adrenal Glands (Zerglings attack a third faster) and Chitinous
 * Plating (+2 on the Ultralisk).
 */
export interface Evolution {
  /** When, as a share of the hold. */
  at: number;
  name: string;
  /**
   * A level of Carapace and Attacks; Adrenal Glands (Zerglings attack faster); Chitinous Plating
   * (+2 on the Ultralisk); Metabolic Boost (Zerglings run 60% faster).
   */
  apply: 'level' | 'adrenal' | 'chitinous' | 'metabolic';
}
const EVOLUTIONS: Evolution[] = [
  { at: 0.22, name: 'Carapace and Attacks, level 1', apply: 'level' },
  { at: 0.4, name: 'Adrenal Glands', apply: 'adrenal' },
  { at: 0.5, name: 'Carapace and Attacks, level 2', apply: 'level' },
  { at: 0.6, name: 'Chitinous Plating', apply: 'chitinous' },
  { at: 0.76, name: 'Carapace and Attacks, level 3', apply: 'level' },
];
const ATTACK_LEVEL: Partial<Record<KindName, number>> = { hound: 1, leaper: 1, shellback: 2, quillback: 1, tusker: 3, mite: 1, kite: 1, sower: 2, bilewing: 1 };
/** Zerglings, whatever their strain (a mission's own: Unleashed's Raptors), for the Zergling evolutions. */
const ZERGLINGS: KindName[] = ['hound', 'leaper'];

/** StarCraft II's Metabolic Boost: the Zerglings (and Raptors) run 60% faster. */
export function metabolicBoost(k: Record<KindName, Kind>) {
  for (const z of ZERGLINGS.map((n) => k[n])) if (z) z.speed *= 1.6;
}
/**
 * The Raiders' own research, just behind the swarm's (the Engineering Bay and the Armory at
 * work): Infantry and Vehicle Weapons and Armor, at StarCraft II's increments per level.
 */
const RESEARCH = [0.24, 0.52, 0.78];
const WEAPONS_LEVEL: Partial<Record<KindName, number>> = { trooper: 1, grenadier: 1, burner: 1, seer: 1, vaulter: 1, howitzerMobile: 2, howitzer: 4, torchrunner: 1, bulwark: 3, jackknifeFighter: 1, nightjar: 1 };
const ARMORED_LEVEL: Partial<Record<KindName, number>> = { grenadier: 1, howitzerMobile: 1, howitzer: 1 };
const PLATED: KindName[] = ['trooper', 'grenadier', 'burner', 'medic', 'seer', 'vaulter', 'howitzer', 'howitzerMobile', 'torchrunner', 'bulwark', 'jackknifeFighter', 'nightjar'];

/** The swarm tops itself back up in packs, all down one route together, at so much supply a second at most. */
const PACK_EVERY: [number, number] = [5, 10];
const TOP_UP_PER_SECOND = 24;
/** The most a single pack brings (so a lull ends in a wave, not a flood). */
const PACK_MAX = 70;
/** And surges past it, never beyond its strength plus a margin. */
const SURGE_SHARE = 0.3;
const SURGE_CAP = 1.15;
/** Seconds between the director's specials (an Overlord drop, a Baneling bust), at most one at a time. */
const SPECIAL_EVERY = [70, 55, 48, 40];
/** A free company only in a real emergency (the army this far down), this many seconds apart. */
const EMERGENCY_BELOW = 0.45;
const EMERGENCY_EVERY = [45, 60, 75, 90];
const EMERGENCY: [KindName, number][] = [
  ['trooper', 16],
  ['grenadier', 3],
  ['medic', 2],
];
/** What the treasury starts with, by difficulty, and what the base's SCVs bring in a trip. */
const START_FUNDS: [number, number][] = [
  [700, 250],
  [450, 150],
  [350, 100],
  [250, 60],
];
/** A ground machine this wide (its radius, meters) comes out on open ground rather than at its building's door (`exit`). */
const WIDE = 4.5;
const MINERAL_WORKERS = 12;
const GAS_WORKERS = 4;
const MINERAL_LOAD = 15;
const GAS_LOAD = 24;
/** "With me" squads at most. */
const ESCORTS = 2;

/** How far out the lines stand, meters along the swarm's way in from the base, and their fallbacks. */
const FRONT_DISTANCE = 110;
/** How far either side of a line's middle a bunker counts as in front of it (`bringInOutposts`). */
const LINE_HALF_WIDTH = 60;
const FALLBACK_DISTANCE = 45;
const FRONT_MERGE = 45;
/**
 * Missile Turrets the Raiders put up around their last Command Center, at these bearings (and
 * the second set, between them, in a bigger battle: its swarm's Mutalisks come for the mineral
 * line in flocks).
 */
const CC_TURRETS = [0.6, 2.2, 3.8, 5.4];
const CC_TURRETS_MORE = [1.4, 3.0, 4.6, 6.2];
/** The fleet's barrage at the end: strikes a second, and for how long. */
const BARRAGE_RATE = 28;
const BARRAGE_SECONDS = 7;
/**
 * How far behind the base (away from the swarm's routes) the Hyperion waits between strikes,
 * meters: on the horizon, plainly out of the fight until it's called in.
 */
const SHIP_POST = 2000;
/** StarCraft II's Building Armor, researched before the battle: the Raiders' last base is armored for this. */
const BUILDING_ARMOR = 2;
/**
 * The dead clear quickly here (9 s elsewhere): with four hundred fighting, bodies would wall off
 * the view. They fall, lie a moment, then sink into the ground over the last seconds.
 */
const CORPSE_SECONDS = 4;
const CORPSE_FADE = 1.6;

/** Missile Turrets on every line's flanks, behind the ranks: sideways from its middle, and back. */
const LINE_TURRET = { side: 24, back: 16 };
/** Who mines the base's minerals and gas (construction sends its own). */
const WORKER: KindName = 'rigger';
/**
 * Where the commander may build: anywhere this close to the Command Center, or this close behind
 * a line (where it holds now), and no further than this out in front of its ranks.
 */
const BUILD_ZONE = { base: 95, line: 65, ahead: 6 };
/** How far off the crosshair can place a structure on foot. */
const PLACE_REACH = 160;
/** Production rules here: a real base by now has several bays of each. */
const PRODUCTION = { bays: { barracks: 4, motorPool: 2, airfield: 2 }, queue: 4 };

/** Production at a battle's size: as many more bays, and the cap the army can be built up to. */
function production(scale: number): ProductionRules {
  const bays = { ...PRODUCTION.bays };
  for (const p of Object.keys(bays) as Producer[]) bays[p] = Math.round(bays[p] * scale);
  return { ...PRODUCTION, bays, cap: SUPPLY_CAP * scale };
}

/**
 * A bigger battle's swarm grows to its size over this share of the hold, from its usual strength
 * (what the army starts against) to the whole multiple at the climax, as the fleet arrives; the
 * base builds up ahead of it. Balance runs (src/dev/tide-sim.ts) had the swarm outgrowing what
 * the base could pay for when it got there by 60% of the hold, or even 90%.
 */
const SIZE_RAMP: [number, number] = [0.05, 1];
/**
 * A bigger battle's base mines richer ground: StarCraft II's Rich Mineral Fields give 7 a trip
 * where a plain field gives 5, and an Epic battle's base mines its minerals at that rate (a
 * Large one, half the gain; gas as ever). With the battle's multiple of SCVs, its income pays
 * for building the army up as well as for the bigger losses.
 */
const RICH = 7 / 5;
/** How long a new squad's tag follows it on its way, at most. */
const MARCH_TAG_SECONDS = 40;
/** What each kind of place to send a squad means, for the board. */
const EXPLAIN = {
  auto: 'Each squad goes to whichever line needs it most when it comes out.',
  line: (name: string) => `Squads march to the ${name} line and fill its ranks, front rank first.`,
  me: 'Squads join you as an escort and follow you wherever you go (two escorts at most).',
  base: 'Squads guard the base: the Command Center, the production, the mineral line.',
};

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

/** Radio chatter for the long middle of it, said now and then. */
const CHATTER: [string, 'harlan' | 'ashby', string][] = [
  [RAYNOR, 'harlan', 'They just keep coming. Hold the line, Raiders!'],
  [HORNER, 'ashby', 'Orbital scans show more of them massing past the ridges. A lot more.'],
  [RAYNOR, 'harlan', 'Fall back when you have to, then get back in it. Nobody quits on me today.'],
  [HORNER, 'ashby', 'The fleet is making the jump. Hold on, Commander.'],
  [RAYNOR, 'harlan', "Medics, keep 'em on their feet! Tanks, don't stop firing!"],
  [HORNER, 'ashby', "I've never seen this many of them in one place. Not even on Tarsonis."],
];
/** The director's lulls, said as they start. */
const LULL_LINES: [string, 'harlan' | 'ashby', string][] = [
  [HORNER, 'ashby', "They're pulling back to regroup. Get reinforcements moving, now."],
  [RAYNOR, 'harlan', 'Breathe, Raiders. Patch up, fill the gaps. They are not done.'],
  [HORNER, 'ashby', "The swarm's thinning out front. Use it: requisition what you can."],
];

/**
 * The numbers a hold is made of: The Tide's own (TIDE), or a mode built on it that sets them
 * differently (The Tide: Unleashed). Everything else (the base, the lines, the director, the
 * economy, the board) is the same machinery.
 */
export interface TideTuning {
  /** Seconds to hold, by difficulty level. */
  holdSeconds: readonly number[];
  /** The army across the lines at the start, and the sieged tanks behind them. */
  army: readonly [KindName, number][];
  tanks: number;
  /** The swarm's strength over the hold, its scale by difficulty, and its mix. */
  swarm: ForceRules;
  /** Packs: seconds between them, supply a second at most, the most one brings. */
  packEvery: readonly [number, number];
  topUpPerSecond: number;
  packMax: number;
  /** Surges: a share of the strength at once, never past this multiple of it. */
  surgeShare: number;
  surgeCap: number;
  /** The swarm's evolutions over the hold. */
  evolutions: readonly Evolution[];
  /** The requisition board's squads. */
  squads: readonly SquadDef[];
  /** What the player's kills and assists pay, as shares of the dead Zerg's cost. */
  bounty: { kill: number; assist: number };
  /** How long the dead lie, and how long they take to sink away (seconds). */
  corpse: { seconds: number; fade: number };
  /** The army's supply cap and the production bays, as a multiple of the battle size's (1: StarCraft II's 200 at Standard). */
  capScale?: number;
  /**
   * How far out the lines stand, meters along the swarm's way in from the base (The Tide's 110),
   * and how far in front of its line one of the map's own bunkers may stand: one further out is
   * brought back to that, so it fights with the line rather than alone ahead of it (unset: where
   * the map has it).
   */
  frontDistance?: number;
  outpost?: number;
  /**
   * Whether the Command Center replaces lost SCVs at any battle size, paying their cost (a
   * bigger battle's base always trains them, free, up to its bigger mineral line).
   */
  replaceWorkers?: boolean;
}

export const TIDE: TideTuning = {
  holdSeconds: HOLD_SECONDS,
  army: ARMY,
  tanks: TANKS,
  swarm: SWARM,
  packEvery: PACK_EVERY,
  topUpPerSecond: TOP_UP_PER_SECOND,
  packMax: PACK_MAX,
  surgeShare: SURGE_SHARE,
  surgeCap: SURGE_CAP,
  evolutions: EVOLUTIONS,
  squads: HOLDOUTS_SQUADS,
  bounty: BOUNTY,
  corpse: { seconds: CORPSE_SECONDS, fade: CORPSE_FADE },
};

export class TideScript extends ScriptBase implements Commanded {
  protected cc!: Building;
  private barracks: Building[] = [];
  /** What turns out each kind of squad: the map's own, then any built (the first standing builds). */
  private producers: Record<Producer, Building[]> = { barracks: [], motorPool: [], airfield: [] };
  protected lines: Lines;
  protected routes: THREE.Vector3[] = [];
  /** Where the swarm's fliers come in: the map's Zerg bases, at the edge of the playable map. */
  protected skies: THREE.Vector3[] = [];
  protected holdSeconds: number;
  protected director: Director;
  private treasury = new Treasury();
  /** The battle's size: the multiple the swarm grows to, and the army may be built up to. */
  protected scale: number;
  /** When over the hold the swarm grows to it (a field, for balance runs to try others). */
  private ramp = SIZE_RAMP;
  /** What a trip to the minerals brings, as a multiple of the usual (a bigger battle's base mines richer ground: see RICH). */
  private yieldScale: number;
  private requisition: Requisition;
  private construction!: Construction;
  /** Structures the commander had built, for what they gave (a production building's bays). */
  private raised = new Map<Building, StructureDef>();
  /** A structure being placed (from the board), and its ghost on the battlefield. */
  private placingKind: KindName | null = null;
  private preview: PlacementGhost | null = null;
  /** Kills since the player last went down raise the bounty (the mode's rules). */
  private streak: BountyStreak | null = null;
  /** When Medivacs can next fly an evacuation. */
  private evacReady = 0;
  /** The swarm's packs: what comes, from where, with what brains. */
  private spawner: Spawner;
  private packs: PackSource;
  private board: Offer[] = [];
  private ui: TideUI | null = null;
  private destination = 'Auto';
  /** The requisition board is open on the ground (G), the cursor free to click it. */
  private boardOpen = false;
  /**
   * The building its keys order from (1 Barracks, 2 Factory, 3 Starport, 4 Construction, as a
   * StarCraft II player's control groups): picked by its number, kept until another is.
   */
  private group: BoardGroup = 'barracks';
  /** In the command view, a building picked by its number has the letters until Esc lets it go. */
  private armed = false;
  /** Esc has just let go of the building: the command view doesn't take the same press. */
  private letGo = false;
  /** The number keys are the board's (they pick a building), not the command view's class picks. */
  readonly digits = true;
  /** New squads on their way, tagged on screen so they can be found. */
  private marching: { id: number; label: string; where: string; units: Unit[]; to: () => THREE.Vector3; until: number }[] = [];
  private marchIds = 0;
  /** Where the player redeploys: the Barracks, or a line that's holding. */
  deployChoice = 'barracks';
  private escorts: Squad[] = [];
  private note = '';
  private noteFor = 0;
  private supplyOf = new Map<KindName, number>();
  private surgeIn = 30;
  private surges = 0;
  private topUp = 0;
  private packEvery = 6;
  private specialIn = 60;
  /** A special under way (an Overlord drop): the director won't start another until it's done. */
  private crisis = 0;
  private emergencyIn = 0;
  private emergencies = 0;
  private squadsBought = 0;
  private evolved = 0;
  private researched = 0;
  /** Where the last Overlord drop came down, while it's the news. */
  private dropAt: { at: THREE.Vector3; until: number } | null = null;
  private crisisIn = 1;
  private crisisLabel = '';
  /** The swarm is in the base (the Hyperion has been called to it, if it could be). */
  private covering = false;
  private pressureAt = -1;
  private pressureNow = 0;
  private chatterIn = 75;
  private chatterNext = 0;
  private lullNext = 0;
  private watchIn = 2;
  private linesIn = 2;
  private fired = new Set<string>();
  private ended = false;
  private barrage = 0;
  private strikes = 0;
  private won = false;
  /** The player's first body goes to the line (and faces out of it); later ones come out of the Barracks. */
  private deployed = false;
  private faced = false;
  /** The Raiders' lowest strength, as a share of the army they started with. */
  private lowest = 1;
  /** The base's mining, for the Command Center to put new SCVs where they're short: its fields and refineries, and who works which. */
  private mining: { fields: THREE.Vector3[]; refineries: Building[]; workers: Map<Unit, THREE.Vector3 | Building> } | null = null;
  /** Seconds to the Command Center's next SCV, while it's training one. */
  private trainIn = 0;
  private scvSeconds = 12 / FASTER;
  /** What an SCV costs (UnitData's), where replacements are paid for; and whether the base is short of them. */
  private scvCost = { ore: 50, gas: 0 };
  private workersShort = false;

  constructor(
    m: ConstructorParameters<typeof ScriptBase>[0],
    host: ConstructorParameters<typeof ScriptBase>[1],
    protected map: MapData,
    protected terrain: MapTerrain,
    protected data: Stats,
    protected tune: TideTuning = TIDE,
  ) {
    super(m, host);
    this.scale = m.size.scale;
    this.yieldScale = 1 + (this.scale - 1) * (RICH - 1);
    this.requisition = new Requisition(production(this.scale * (tune.capScale ?? 1)));
    this.holdSeconds = this.tune.holdSeconds[m.difficulty.level] ?? 720;
    this.director = new Director(m.difficulty.level);
    this.lines = new Lines(m.world);
    const [ore, gas] = START_FUNDS[m.difficulty.level] ?? START_FUNDS[1];
    this.treasury.ore = ore;
    this.treasury.gas = gas;
    this.director.onPhase = (p) => this.phaseChanged(p);
    this.spawner = new Spawner(m.world, (k) => this.supply(k));
    // Ground packs come down the routes as a tide toward the base; fliers raid the line nearest
    // where they come in.
    const nearestFront = (at: THREE.Vector3) => this.lines.fronts.reduce((a, b) => (a.at.distanceTo(at) <= b.at.distanceTo(at) ? a : b));
    this.packs = {
      routes: this.routes,
      skies: this.skies,
      brain: (u, flying, at) => (flying && this.lines.fronts.length ? new RaidBrain(u, nearestFront(at)) : new SurgeBrain(u)),
      toward: (flying, at) => (flying && this.lines.fronts.length ? nearestFront(at).at : this.cc.position),
    };
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

  /** A unit's supply, by the data (a Zergling's half). */
  private supply(kind: KindName): number {
    const known = this.supplyOf.get(kind);
    if (known !== undefined) return known;
    const k = this.w.kinds[kind];
    const s = (dataOf(this.data, k.def) ?? this.data).cost(k.def.dataId).supply;
    this.supplyOf.set(kind, s);
    return s;
  }

  /**
   * A side's army, in supply: the swarm, or the Raiders' soldiers, tanks and aircraft and the
   * player. Not the base's SCVs: they mine, and the cap is the army's.
   */
  protected armySupply(team: 'holdouts' | 'crawl'): number {
    let n = 0;
    for (const e of this.w.entities) {
      if (!e.alive || e.isBuilding || e.team !== team || e === this.w.player || e.kind.name === WORKER) continue;
      n += this.supply(e.kind.name);
    }
    return n + (team === 'holdouts' && this.w.player?.alive ? 1 : 0);
  }

  setup() {
    const w = this.w;
    const rifle = w.kinds.trooper.weapon!;
    let heart: THREE.Vector3 | null = null;
    // The Raiders' base, where the map builds it (but none of its soldiers: the army is ours).
    for (const p of this.units(1)) {
      const at = this.terrain.toWorld(p.x, p.y);
      const yaw = mapYaw(p.rotation);
      const structure = STRUCTURES[p.type] ?? (p.type.startsWith('DefenseWall') ? 'defenseWall' : null);
      if (p.type === 'Artifact') heart = at.clone();
      else if (structure) {
        const b = w.spawnBuilding(structure, at.x, at.z, yaw, 'holdouts');
        if (structure === 'bunker') b.controller = new BunkerGuns(b, { ...rifle, range: rifle.range + this.m.bunkerBonus });
        else if (structure === 'flakTower') b.controller = new TurretBrain(b);
        else if (structure === 'barracks') this.barracks.push(b);
        else if (structure === 'holdfast') this.cc ??= b;
        if ((structure === 'barracks' || structure === 'motorPool' || structure === 'airfield') && !this.producers[structure].length) this.producers[structure].push(b);
      }
    }
    if (!this.cc) {
      const c = heart ?? this.barracks[0]?.position ?? new THREE.Vector3();
      this.cc = w.spawnBuilding('holdfast', c.x, c.z, 0, 'holdouts');
    }
    // Every gun the map gives the base is out past the lines: turrets ring the Command Center.
    for (const a of [...CC_TURRETS, ...CC_TURRETS_MORE.slice(0, Math.round(CC_TURRETS.length * (this.scale - 1)))]) {
      const r = this.cc.radius + 9;
      this.turret(walkableNear(w, this.cc.position.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)), 2), a);
    }
    this.economy();
    this.homeGuard(rifle);
    for (const name of ['holdfast', 'barracks', 'motorPool', 'airfield', 'bunker', 'flakTower', 'storehouse', 'workshop', 'armory', 'reactorHall', 'refinery'] as KindName[]) w.kinds[name].armor += BUILDING_ARMOR;
    this.m.holdfast = this.cc;
    this.m.barracks = this.barracks;
    this.m.baseName = 'COMMAND CENTER';
    w.goal = this.cc;
    w.perimeter = 220;
    w.corpseTime = this.tune.corpse.seconds;
    w.corpseFade = this.tune.corpse.fade;
    // The map's rubble barricades block what they cover, not a circle round each.
    w.shapedFootprints = true;
    w.updatePaths();

    // The routes the swarm comes down.
    for (let r = 1; r <= 8; r++) {
      const p = this.point(`Spawn ${r} Gather`);
      if (p && Number.isFinite(w.flow.distance(p.x, p.z))) this.routes.push(p);
    }
    for (const q of this.map.placements) {
      if (q.kind !== 'point' || !q.name.startsWith('Start Location - Zerg')) continue;
      const s = this.terrain.toWorld(q.x, q.y);
      for (let i = 0; i < 40 && !this.terrain.playable(s.x, s.z); i++) s.lerp(this.cc.position, 0.05);
      this.skies.push(s);
    }
    if (!this.routes.length) this.routes.push(walkableNear(w, this.cc.position.clone().add(new THREE.Vector3(300, 0, 0)), 4));
    if (!this.skies.length) this.skies.push(...this.routes);
    this.drawLines(rifle);
    this.board = offers(this.data, w.kinds, [...this.tune.squads]);
    this.constructionSetup();
  }

  /**
   * Construction, by the mode's rules: what the commander may have built (missions.ts), where
   * (the base, and behind the lines), and what each structure does once it stands.
   */
  private constructionSetup() {
    const w = this.w;
    const rules = this.m.def.rules ?? {};
    const build = rules.build;
    // A bigger battle allows as many more of each.
    const limit: Partial<Record<KindName, number>> = {};
    for (const [kind, n] of Object.entries(build?.limit ?? {}) as [KindName, number][]) limit[kind] = Math.round(n * this.scale);
    this.construction = new Construction(
      w,
      this.data,
      'holdouts',
      { ...DEFAULT_BUILD, allow: build?.allow ?? [], limit, sites: build?.sites ?? DEFAULT_BUILD.sites },
      {
        home: () => (this.cc.alive ? this.cc : null),
        zone: (at) => this.zone(at),
        approaches: () => this.routes,
        // Soldiers whose posts it covers stand at its walls instead.
        started: () => this.lines.replace(),
        built: (b, def) => this.built(b, def),
        lost: (def) => this.m.onMessage?.('CONSTRUCTION LOST', `The ${def.label} went down before it was finished`, 2),
      },
    );
    this.preview = new PlacementGhost(w);
    if (rules.streak) this.streak = new BountyStreak(rules.streak);
    // Every Missile Turret wants an Engineering Bay standing (StarCraft II's requirement): the
    // Raiders' last base has one, beside the Command Center, if the map didn't build it.
    const bay = this.construction.catalog.find((d) => d.kind === 'workshop');
    if (bay && !w.buildings.some((b) => b.alive && b.kind.name === 'workshop')) {
      const at = this.construction.findSpot('workshop', this.cc.position, this.cc.radius + 16, 80);
      if (at) {
        this.construction.raise('workshop', at);
        w.updatePaths();
      }
    }
  }

  /** The Raiders build at their base and behind their lines, not out where the swarm comes. */
  private zone(at: THREE.Vector3): string | null {
    const cc = this.cc.position;
    if (Math.hypot(at.x - cc.x, at.z - cc.z) < BUILD_ZONE.base) return null;
    const a = new THREE.Vector3();
    for (const f of this.lines.fronts) {
      const held = f.broken && f.fallback ? f.fallback : f;
      this.lines.anchor(held, a);
      const dx = at.x - a.x;
      const dz = at.z - a.z;
      if (Math.hypot(dx, dz) < BUILD_ZONE.line && dx * held.out.x + dz * held.out.z < BUILD_ZONE.ahead) return null;
    }
    return 'Only at the base or behind a line';
  }

  /** A structure the commander had built is finished: its part in the battle. */
  private built(b: Building, def: StructureDef) {
    const rifle = this.w.kinds.trooper.weapon!;
    if (def.kind === 'bunker') b.controller = new BunkerGuns(b, { ...rifle, range: rifle.range + this.m.bunkerBonus });
    else if (def.kind === 'flakTower') b.controller = new TurretBrain(b);
    if (def.produces) {
      this.producers[def.produces.producer].push(b);
      this.requisition.addBays(def.produces.producer, def.produces.bays);
    }
    this.raised.set(b, def);
    if (this.time > 0) this.m.onMessage?.(def.label.toUpperCase(), `Online ${this.where(b.position)}`, 2);
  }

  /** Where something is, for the radio: at a line, or at the base. */
  private where(at: THREE.Vector3): string {
    let best = 'at the base';
    let near = Math.min(BUILD_ZONE.line + 20, Math.hypot(at.x - this.cc.position.x, at.z - this.cc.position.z));
    const a = new THREE.Vector3();
    for (const f of this.lines.fronts) {
      const d = this.lines.anchor(f.broken && f.fallback ? f.fallback : f, a).distanceTo(at);
      if (d < near) {
        near = d;
        best = `at the ${f.name} line`;
      }
    }
    return best;
  }

  /** The building turning out a kind of squad now: the first of its kind still standing. */
  private producer(p: Producer): Building | null {
    return this.producers[p].find((b) => b.alive) ?? null;
  }

  /**
   * The base's economy: the map's own mineral line, two refineries at its ends (the map has no
   * geysers of its own), and SCVs working them.
   */
  private economy() {
    const w = this.w;
    const cc = this.cc.position;
    const placed = this.map.placements
      .filter((p) => p.kind === 'unit' && /MineralField/.test(p.type))
      .map((p) => ({ at: this.terrain.toWorld(p.x, p.y), yaw: mapYaw(p.rotation) }))
      .filter((p) => Math.hypot(p.at.x - cc.x, p.at.z - cc.z) < 90);
    // StarCraft II's own mineral field, where the map puts each one.
    for (const p of placed) w.spawnProp('oreField', p.at.x, p.at.z, p.yaw);
    const crystals = placed.map((p) => p.at);
    const fields = crystals.length ? crystals : [cc.clone().add(new THREE.Vector3(0, 0, this.cc.radius + 14))];
    // The refineries: past the two ends of the mineral line.
    const mid = fields.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(fields.length);
    let a = fields[0];
    let b = fields[0];
    for (const p of fields) if (p.distanceTo(mid) > a.distanceTo(mid)) a = p;
    for (const p of fields) if (p.distanceTo(a) > b.distanceTo(a)) b = p;
    const refineries: Building[] = [];
    for (const end of a === b ? [a] : [a, b]) {
      const out = end.clone().sub(mid).setY(0).normalize();
      const at = walkableNear(w, end.clone().addScaledVector(out, 16), 3);
      refineries.push(w.spawnBuilding('refinery', at.x, at.z, Math.atan2(out.x, out.z), 'holdouts'));
    }
    this.mining = { fields, refineries, workers: new Map() };
    this.scvSeconds = (this.data.trainTime(w.kinds[WORKER].def.dataId) ?? 12) / FASTER;
    this.scvCost = this.data.cost(w.kinds[WORKER].def.dataId);
    for (let i = 0; i < MINERAL_WORKERS; i++) {
      const field = fields[(i * 3) % fields.length];
      this.worker(walkableNear(w, field.clone().lerp(cc, 0.4), 2), field);
    }
    for (const r of refineries) for (let i = 0; i < GAS_WORKERS; i++) this.worker(walkableNear(w, r.position.clone().lerp(cc, 0.5), 2), r);
  }

  /** An SCV at `start`, mining `what`: a mineral field, or a refinery's gas. */
  private worker(start: THREE.Vector3, what: THREE.Vector3 | Building): Unit {
    const home = () => (this.cc.alive ? this.cc : null);
    const earn = (ore: number, gas: number) => this.treasury.earn(Math.round(ore * this.yieldScale), gas, this.w.time, false);
    const u =
      what instanceof THREE.Vector3
        ? this.w.spawnUnit(WORKER, start.x, start.z, 0, (u) => new MinerBrain(u, what, home, MINERAL_LOAD, (n) => earn(n, 0)))
        : this.w.spawnUnit(WORKER, start.x, start.z, 0, (u) => new MinerBrain(u, what.position, () => (what.alive ? home() : null), GAS_LOAD, (n) => earn(0, n), what.radius + 3));
    this.mining?.workers.set(u, what);
    return u;
  }

  /**
   * A bigger battle's base grows its economy to pay for the bigger army: the Command Center
   * trains SCVs, one at a time at the data's train time, until the mineral line and refineries
   * are worked by the battle's multiple of the workers they start with (and replaces the lost).
   */
  private trainWorkers(dt: number) {
    const m = this.mining;
    if ((this.scale <= 1 && !this.tune.replaceWorkers) || !m || !this.cc.alive) return;
    const on = new Map<THREE.Vector3 | Building, number>();
    let ore = 0;
    for (const [u, what] of m.workers) {
      if (!u.alive) {
        m.workers.delete(u);
        continue;
      }
      on.set(what, (on.get(what) ?? 0) + 1);
      if (what instanceof THREE.Vector3) ore++;
    }
    const short =
      ore < Math.round(MINERAL_WORKERS * this.scale)
        ? m.fields.reduce((a, b) => ((on.get(b) ?? 0) < (on.get(a) ?? 0) ? b : a))
        : (m.refineries.find((r) => r.alive && (on.get(r) ?? 0) < Math.round(GAS_WORKERS * this.scale)) ?? null);
    this.workersShort = !!short;
    if (!short) {
      this.trainIn = this.scvSeconds;
      return;
    }
    // Where a battle's size doesn't pay for them, each replacement costs what an SCV does, and
    // waits until it can be paid for.
    const paid = this.scale <= 1;
    if (paid && this.trainIn >= this.scvSeconds && !this.treasury.afford(this.scvCost)) return;
    if (paid && this.trainIn >= this.scvSeconds) this.treasury.spend(this.scvCost);
    this.trainIn -= dt;
    if (this.trainIn > 0) return;
    this.trainIn = this.scvSeconds;
    this.worker(this.door(this.cc, 6), short);
  }

  /** The workers on the board, where the Command Center replaces the lost: how many, how many it keeps, the next one's seconds. */
  private workerView(): BoardView['workers'] {
    const m = this.mining;
    if (!m || (this.scale <= 1 && !this.tune.replaceWorkers)) return null;
    let have = 0;
    for (const u of m.workers.keys()) if (u.alive) have++;
    const want = Math.round(MINERAL_WORKERS * this.scale) + m.refineries.filter((r) => r.alive).length * Math.round(GAS_WORKERS * this.scale);
    const busy = this.workersShort && this.trainIn < this.scvSeconds;
    return { have, want, next: busy ? this.trainIn : null, cycle: this.scvSeconds };
  }

  /**
   * Two bunkers beside the Command Center, toward the lines (more in a bigger battle, whose swarm
   * comes through a broken line in floods), and a guard posted around it.
   */
  private homeGuard(rifle: NonNullable<typeof this.w.kinds.trooper.weapon>) {
    const w = this.w;
    const cc = this.cc;
    const bunkers = [1.15, 1.55, 0.95, 1.75, 1.35, 0.75].slice(0, Math.round(2 * this.scale));
    for (const a of bunkers.map((x) => Math.PI * x)) {
      const p = walkableNear(w, cc.position.clone().add(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(cc.radius + 14)), 2);
      const b = w.spawnBuilding('bunker', p.x, p.z, a, 'holdouts');
      b.controller = new BunkerGuns(b, { ...rifle, range: rifle.range + this.m.bunkerBonus });
    }
    let i = 0;
    for (const [kind, n] of HOME_GUARD) {
      for (let k = 0; k < n; k++, i++) {
        const a = (i / 10) * Math.PI * 2;
        const post = walkableNear(w, cc.position.clone().add(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(cc.radius + 8)), 2);
        w.spawnUnit(kind, post.x, post.z, a, (u) => new GuardBrain(u, post, 20, 44, 20));
      }
    }
  }

  /** A Missile Turret, manned and firing. */
  private turret(at: THREE.Vector3, yaw = 0): Building {
    const t = this.w.spawnBuilding('flakTower', at.x, at.z, yaw, 'holdouts');
    t.controller = new TurretBrain(t);
    return t;
  }

  /** The lines across the routes, their fallbacks (a bunker at each), and the army drawn up in them. */
  private drawLines(rifle: NonNullable<ReturnType<() => typeof this.w.kinds.trooper.weapon>>) {
    const w = this.w;
    const found: { at: THREE.Vector3; out: THREE.Vector3; back: THREE.Vector3 | null; routes: number }[] = [];
    for (const from of this.routes) {
      const at = this.lineOn(from, this.tune.frontDistance ?? FRONT_DISTANCE);
      if (!at) continue;
      const shared = found.find((f) => f.at.distanceTo(at) < FRONT_MERGE);
      if (shared) {
        shared.routes++;
        continue;
      }
      const ahead = this.ahead(at) ?? from;
      found.push({ at, out: new THREE.Vector3(ahead.x - at.x, 0, ahead.z - at.z).normalize(), back: this.lineOn(from, FALLBACK_DISTANCE), routes: 1 });
    }
    if (!found.length) {
      const out = new THREE.Vector3(1, 0, 0);
      found.push({ at: walkableNear(w, this.cc.position.clone().addScaledVector(out, this.tune.frontDistance ?? FRONT_DISTANCE), 3), out, back: null, routes: 1 });
    }
    if (this.tune.outpost !== undefined) this.bringInOutposts(found, this.tune.outpost);
    // A bunker at the heart of each fallback; a bigger battle's are flanked by more.
    for (const f of found) {
      if (!f.back) continue;
      const toward = new THREE.Vector3(f.at.x - f.back.x, 0, f.at.z - f.back.z).normalize();
      const side = new THREE.Vector3(-toward.z, 0, toward.x);
      for (const offset of [0, 11, -11].slice(0, Math.round(this.scale))) {
        const p = walkableNear(w, f.back.clone().addScaledVector(toward, 7).addScaledVector(side, offset), 2);
        const b = w.spawnBuilding('bunker', p.x, p.z, Math.atan2(toward.x, toward.z), 'holdouts');
        b.controller = new BunkerGuns(b, { ...rifle, range: rifle.range + this.m.bunkerBonus });
      }
    }
    // Missile Turrets on every line's flanks, behind the ranks: the swarm's fliers go for the lines.
    for (const f of found) {
      const side = new THREE.Vector3(-f.out.z, 0, f.out.x);
      for (const s of [-1, 1]) this.turret(walkableNear(w, f.at.clone().addScaledVector(side, s * LINE_TURRET.side).addScaledVector(f.out, -LINE_TURRET.back), 3), Math.atan2(f.out.x, f.out.z));
      // A bigger battle's lines get a second pair, nearer the middle and further back.
      if (this.scale > 1) for (const s of [-1, 1]) this.turret(walkableNear(w, f.at.clone().addScaledVector(side, s * LINE_TURRET.side * 0.5).addScaledVector(f.out, -LINE_TURRET.back - 8), 3), Math.atan2(f.out.x, f.out.z));
    }
    w.updatePaths();
    const obstacles = w.buildings.map((b) => ({ x: b.position.x, z: b.position.z, r: b.radius }));
    const name = (at: THREE.Vector3) => {
      const dx = at.x - this.cc.position.x;
      const dz = at.z - this.cc.position.z;
      return Math.abs(dx) > Math.abs(dz) ? (dx < 0 ? 'west' : 'east') : dz < 0 ? 'north' : 'south';
    };
    for (const f of found) {
      const front = this.lines.line(f.at, f.out, name(f.at), obstacles);
      if (f.back) front.fallback = this.lines.line(f.back, new THREE.Vector3(f.at.x - f.back.x, 0, f.at.z - f.back.z).normalize(), front.name, obstacles);
      this.lines.fronts.push(front);
    }
    // The army, each line as strong as the share of the swarm's routes it stands across.
    const routes = found.reduce((a, f) => a + f.routes, 0);
    const fronts = this.lines.fronts;
    const lineFor = (i: number, count: number) => {
      let u = ((i + 0.5) / count) * routes;
      for (let j = 0; j < found.length; j++) if ((u -= found[j].routes) < 0) return fronts[j];
      return fronts[fronts.length - 1];
    };
    for (const [kind, count] of this.tune.army) for (let i = 0; i < count; i++) this.lines.soldier(kind, lineFor(i, count));
    for (let i = 0; i < this.tune.tanks; i++) this.lines.tank(lineFor(i, this.tune.tanks));
  }

  /**
   * The map's own bunkers standing further than `outpost` meters in front of a line (and across
   * its width, not off to a side) are brought back to that, keeping their place across it.
   */
  private bringInOutposts(found: { at: THREE.Vector3; out: THREE.Vector3 }[], outpost: number) {
    const w = this.w;
    for (const b of w.buildings) {
      if (b.kind.name !== 'bunker') continue;
      const f = found.reduce((a, c) => (a.at.distanceTo(b.position) <= c.at.distanceTo(b.position) ? a : c));
      const side = new THREE.Vector3(-f.out.z, 0, f.out.x);
      const rel = new THREE.Vector3(b.position.x - f.at.x, 0, b.position.z - f.at.z);
      const ahead = rel.dot(f.out);
      const across = rel.dot(side);
      if (ahead <= outpost || Math.abs(across) > LINE_HALF_WIDTH) continue;
      // Back toward the line, a step further each time the ground there isn't clear.
      for (let back = 0; back <= ahead - outpost; back += 3) {
        const spot = walkableNear(w, f.at.clone().addScaledVector(f.out, outpost + back).addScaledVector(side, across), 3);
        // Clear of every other building there (this one out of the way while it's looked at).
        const was = b.position.clone();
        b.position.set(-1e6, 0, -1e6);
        const clear = openGround(w, spot.x, spot.z, b.radius + 2);
        b.position.copy(was);
        if (!clear) continue;
        w.moveBuilding(b, spot.x, spot.z);
        break;
      }
    }
  }

  /** Where a route comes within `distance` of the base, walking the swarm's own paths. */
  private lineOn(from: THREE.Vector3, distance: number): THREE.Vector3 | null {
    const w = this.w;
    const cell = this.terrain.pathCell;
    const p = from.clone();
    const dir = new THREE.Vector2();
    for (let i = 0; i < 600; i++) {
      const d = w.flow.distance(p.x, p.z) * cell;
      if (!Number.isFinite(d)) return null;
      if (d <= distance) return walkableNear(w, p.setY(this.terrain.heightAt(p.x, p.z)), 3);
      if (!w.flow.direction(p.x, p.z, dir)) return null;
      p.x += dir.x * 3;
      p.z += dir.y * 3;
    }
    return null;
  }

  /** A point 30 meters further out along the swarm's way in from `at` (the way the line faces). */
  private ahead(at: THREE.Vector3): THREE.Vector3 | null {
    const w = this.w;
    const cell = this.terrain.pathCell;
    const want = w.flow.distance(at.x, at.z) * cell + 30;
    let best: THREE.Vector3 | null = null;
    let bestErr = Infinity;
    for (let a = 0; a < 24; a++) {
      const x = at.x + Math.cos((a / 24) * Math.PI * 2) * 30;
      const z = at.z + Math.sin((a / 24) * Math.PI * 2) * 30;
      const d = w.flow.distance(x, z) * cell;
      if (!Number.isFinite(d)) continue;
      const err = Math.abs(d - want);
      if (err < bestErr) {
        bestErr = err;
        best = new THREE.Vector3(x, 0, z);
      }
    }
    return best;
  }

  /** In front of a building's door, scattered a little. */
  /**
   * Where a ground unit of `kind` comes out of `b`: its door, or, for a machine too wide for the
   * base's alleys (The Tide: Unleashed's Odin, 25 m across), open ground with room for it behind
   * where it's going (`heading`), so it never has to squeeze between the buildings.
   */
  private exit(b: Building, kind: KindName, heading: THREE.Vector3): THREE.Vector3 {
    const door = this.door(b, 10);
    const w = this.w;
    const t = w.models[w.kinds[kind].def.model];
    if (!t) return door;
    const size = t.bounds.getSize(new THREE.Vector3()).multiplyScalar(w.scaleOf(w.kinds[kind].def.model));
    const radius = Math.max(size.x, size.z) * 0.36;
    if (radius < WIDE) return door;
    // Behind its destination (toward the base), then outward from there.
    const cc = this.cc.position;
    const back = new THREE.Vector3(cc.x - heading.x, 0, cc.z - heading.z);
    const from = back.lengthSq() > 1 ? heading.clone().addScaledVector(back.normalize(), Math.min(40, back.length())) : heading.clone();
    for (let d = 0; d <= 240; d += 8) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const p = from.clone().add(new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d));
        if (!openGround(w, p.x, p.z, radius + 6)) continue;
        w.effects.smoke(p.clone().setY(w.terrain.heightAt(p.x, p.z) + 1), radius * 0.6, 0x9a8a78, 2.2);
        w.effects.shake = Math.max(w.effects.shake, 0.25);
        return p;
      }
    }
    return door;
  }

  private door(b: Building, spread = 8): THREE.Vector3 {
    const out = new THREE.Vector3();
    b.forward(out).multiplyScalar(b.radius + 4).add(b.position);
    out.x += (Math.random() - 0.5) * spread;
    out.z += (Math.random() - 0.5) * spread;
    return walkableNear(this.w, out, 2);
  }

  /** The line nearest the Barracks (the player's own). */
  private home(): Front {
    const from = (this.barracks.find((b) => b.alive) ?? this.cc).position;
    return this.lines.fronts.reduce((a, b) => (a.at.distanceTo(from) <= b.at.distanceTo(from) ? a : b));
  }

  /** How hard the worst-pressed line is pushed: the swarm's supply in front of it over its own (refreshed every second). */
  private pressure(): number {
    if (this.time - this.pressureAt < 1) return this.pressureNow;
    this.pressureAt = this.time;
    let worst = 0;
    for (const f of this.lines.fronts) {
      const at = this.lines.anchor(f);
      let ours = 1;
      let theirs = 0;
      for (const u of this.w.unitsNear(at.x, at.z, 70)) {
        if (u.team === 'holdouts') ours += this.supply(u.kind.name);
        else if (u.team === 'crawl') theirs += this.supply(u.kind.name);
      }
      worst = Math.max(worst, theirs / ours);
    }
    this.pressureNow = worst;
    return worst;
  }

  /** The line with the fewest soldiers holding it; where it's been overrun, its fallback. */
  private thinnest(): Front {
    let worst = this.lines.fronts[0];
    let fewest = Infinity;
    for (const f of this.lines.fronts) {
      const held = f.broken && f.fallback ? f.fallback : f;
      const at = this.lines.anchor(held);
      let n = 0;
      for (const u of this.w.unitsNear(at.x, at.z, 40)) if (u.team === 'holdouts') n++;
      if (n < fewest) {
        fewest = n;
        worst = held;
      }
    }
    return worst;
  }

  respawnPoint(): THREE.Vector3 {
    // The first body stands in the front rank, at the middle of the line; the rest come out of
    // the Barracks, or are dropped behind a line that's holding, as the player chooses.
    if (!this.deployed) {
      this.deployed = true;
      const f = this.home();
      return walkableNear(this.w, f.at.clone().addScaledVector(f.out, 2.2), 1.5);
    }
    const line = this.lines.fronts.find((f) => f.name === this.deployChoice && !f.broken);
    if (line) return walkableNear(this.w, this.lines.anchor(line).addScaledVector(line.out, -LINE_TURRET.back - 6), 3);
    const b = this.barracks.find((x) => x.alive) ?? this.cc;
    return this.door(b, 8);
  }

  /** Where a fresh body may deploy: the Barracks, or behind any line that's holding. */
  deployOptions(): { id: string; label: string }[] {
    const lines = this.lines.fronts.filter((f) => !f.broken).map((f) => ({ id: f.name, label: `${f.name[0].toUpperCase() + f.name.slice(1)} line` }));
    return [{ id: 'barracks', label: this.barracks.some((b) => b.alive) ? 'Barracks' : 'Command Center' }, ...lines];
  }

  pickDeploy(id: string) {
    this.deployChoice = id;
  }

  /** G: the requisition board, open with the cursor free (and the battle going on), or shut. */
  action() {
    if (this.ended) return;
    this.boardOpen = !this.boardOpen;
    this.w.sfx.play(this.boardOpen ? 'ui.select' : 'ui.click');
  }

  cursor(): boolean {
    return this.boardOpen && !this.ended;
  }

  start() {
    // The Hyperion waits behind the base, away from where the swarm comes, until it's called in.
    const ship = this.host.ship;
    const cc = this.cc.position;
    const toward = new THREE.Vector3();
    for (const r of this.routes) toward.add(new THREE.Vector3(r.x - cc.x, 0, r.z - cc.z).normalize());
    if (toward.lengthSq() < 1e-6) toward.set(0, 0, 1);
    toward.normalize();
    ship.post = new THREE.Vector3(cc.x - toward.x * SHIP_POST, 0, cc.z - toward.z * SHIP_POST);
    ship.settle();
    this.say(HORNER, 'ashby', "Commander, that's every soldier the Raiders have left: two hundred strong, on this ridge.");
    this.say(RAYNOR, 'harlan', 'And every last thing on Char is coming to meet us. Lock and load.');
    this.say(HORNER, 'ashby', `The fleet needs ${Math.round(this.holdSeconds / 60)} minutes to make orbit. Every loss has to be bought back: press G to requisition from the Barracks, Factory and Starport, and pick where they go.`, 6);
    const first = ship.strikeRules?.first;
    if (first) this.say(RAYNOR, 'harlan', `The Hyperion is holding behind the base. Her jump drive's ready in ${Math.round(first / 60 * 2) / 2} minutes: mark a target with ${ship.callKey} and she comes in with every battery she has.`, 4.5);
    else this.say(RAYNOR, 'harlan', `The Hyperion is holding behind the base. Mark a target with ${ship.callKey} and she jumps in with every battery she has.`, 4);
    this.ui = new TideUI();
    this.ui.onOrder = (key) => this.apply({ side: 'holdouts', kind: 'requisition', offer: key, destination: this.destination });
    this.ui.onWithdraw = (producer, index) => this.apply({ side: 'holdouts', kind: 'withdraw', producer, index });
    this.ui.onBuild = (kind) => this.beginPlacing(kind);
    this.ui.onEvacuate = (line) => this.apply({ side: 'holdouts', kind: 'evacuate', line });
    this.ui.onDestination = (d) => {
      this.destination = d;
      this.w.sfx.play('ui.click');
    };
    this.ui.onStance = (line, stance) => this.apply({ side: 'holdouts', kind: 'stance', line, stance });
    this.ui.onClose = () => {
      if (this.boardOpen) this.action();
    };
    this.updateMeter();
  }

  // ---- The swarm --------------------------------------------------------------------------

  /** The swarm's strength wanted on the field now, in supply. */
  private target(): number {
    return strengthAt(this.tune.swarm, this.time / this.holdSeconds, this.m.difficulty.level) * this.director.amplitude * this.grown();
  }

  /** How far a bigger battle's swarm has grown toward its size: 1 at first, the size's multiple once it's grown. */
  private grown(): number {
    if (this.scale === 1) return 1;
    return 1 + (this.scale - 1) * THREE.MathUtils.smoothstep(this.time / this.holdSeconds, this.ramp[0], this.ramp[1]);
  }

  private mix(): [KindName, number][] {
    // A calm player meets the late swarm early.
    const m = mixAt(this.tune.swarm, this.time / this.holdSeconds + (this.director.amplitude - 1) * 0.3);
    // Air of ours draws Corruptors.
    const air = this.w.entities.filter((e) => e.alive && e.team === 'holdouts' && e.flying).length;
    return air >= 2 ? [...m, ['bilewing', Math.min(0.15, air * 0.02)]] : m;
  }

  /** Zerg worth `supply` by the mix of the moment, down one route (or any): a tide on the ground, raiders over the line nearest where they fly in. */
  private send(supply: number, route?: number) {
    this.spawner.send(supply, this.mix(), this.packs, route);
  }

  /**
   * The director's specials: an Overlord drop behind a line, or a Baneling bust at the thinnest
   * one. Raids, the same size in any size of battle: they're sized for what guards the base.
   */
  private special() {
    const w = this.w;
    const t = this.time / this.holdSeconds;
    const level = this.m.difficulty.level;
    if (t > 0.3 && Math.random() < 0.6) {
      // Overlords over the tanks or the mineral line, full of Zerglings.
      const f = this.lines.fronts[Math.floor(Math.random() * this.lines.fronts.length)];
      const base = Math.random() < 0.4;
      const drop = base ? this.cc.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 50, 0, (Math.random() - 0.5) * 50)) : f.at.clone().addScaledVector(f.out, -30);
      for (let i = 0; i < 2; i++) {
        const sky = this.skies[Math.floor(Math.random() * this.skies.length)];
        const from = sky.clone().add(new THREE.Vector3((Math.random() - 0.5) * 40, 0, (Math.random() - 0.5) * 40));
        const at = walkableNear(w, drop.clone().add(new THREE.Vector3((Math.random() - 0.5) * 20, 0, (Math.random() - 0.5) * 20)), 3);
        this.dropAt = { at: at.clone(), until: this.time + 40 };
        const cargo: KindName[] = Array(8).fill('hound');
        this.crisis++;
        w.spawnUnit('lantern', from.x, from.z, 0, (u) =>
          new LanternDropBrain(u, at, cargo, (kind, p) => {
            const g = walkableNear(w, p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4)), 2);
            w.spawnUnit(kind, g.x, g.z, Math.random() * 6.28, (z) => new CrawlBrain(z));
            if (!cargo.length) this.crisis = Math.max(0, this.crisis - 1);
          }),
        );
      }
      this.m.onMessage?.(base ? 'OVERLORDS OVER THE BASE' : `OVERLORDS BEHIND THE ${f.name.toUpperCase()} LINE`, 'Zerglings dropping where the tanks and the workers are', 3);
      this.say(HORNER, 'ashby', base ? 'Overlords over the base! They are going for the workers!' : `Overlords behind the ${f.name} line! Watch the tanks!`, 2.8);
      w.audio.play('baseUnderAttack', { volume: 0.8 });
    } else {
      // A Baneling bust: a wall of them down the route at the thinnest line.
      const f = this.thinnest();
      const routes = this.routes.map((r, i) => ({ i, d: r.distanceTo(f.at) })).sort((a, b) => a.d - b.d);
      const route = routes[0]?.i ?? 0;
      const from = this.routes[route];
      for (let i = 0; i < 8 + level * 2; i++) {
        const p = walkableNear(w, from.clone().add(new THREE.Vector3((Math.random() - 0.5) * 30, 0, (Math.random() - 0.5) * 30)), 3);
        w.spawnUnit(i % 3 ? 'blister' : 'hound', p.x, p.z, 0, (u) => new SurgeBrain(u));
      }
      this.m.onMessage?.('BANELINGS', `A bust coming at the ${f.name} line: spread out, shoot them early`, 3);
    }
  }

  /** StarCraft II's evolutions, as the hold goes on; and the Raiders' research, a step behind. */
  private evolve() {
    const t = this.time / this.holdSeconds;
    while (this.researched < RESEARCH.length && t >= RESEARCH[this.researched]) {
      this.researched++;
      const k = this.w.kinds;
      for (const [name, plus] of Object.entries(WEAPONS_LEVEL) as [KindName, number][]) {
        const kind = k[name];
        const armored = ARMORED_LEVEL[name] ?? 0;
        for (const which of ['weapon', 'antiAir'] as const) {
          const w = kind[which];
          if (w) kind[which] = { ...w, damage: { ...w.damage, amount: w.damage.amount + plus, bonus: armored ? { ...w.damage.bonus, Armored: (w.damage.bonus.Armored ?? 0) + armored } : w.damage.bonus } };
        }
      }
      for (const name of PLATED) k[name].armor += 1;
      this.m.onMessage?.('RESEARCH COMPLETE', `Weapons and Armor, level ${this.researched}: every Raider hits harder and takes more`, 3);
      this.say(HORNER, 'ashby', `Engineering Bay reports level ${this.researched} weapons and armor across the board.`, 2.6);
    }
    const evolutions = this.tune.evolutions;
    while (this.evolved < evolutions.length && t >= evolutions[this.evolved].at) {
      const e = evolutions[this.evolved++];
      const k = this.w.kinds;
      if (e.apply === 'level') {
        for (const name of ['hound', 'leaper', 'blister', 'shellback', 'quillback', 'tusker', 'mite', 'kite', 'sower', 'bilewing', 'lantern'] as KindName[]) {
          const kind = k[name];
          if (!kind) continue;
          kind.armor += 1;
          const plus = ATTACK_LEVEL[name];
          if (plus && kind.weapon) kind.weapon = { ...kind.weapon, damage: { ...kind.weapon.damage, amount: kind.weapon.damage.amount + plus } };
        }
      } else if (e.apply === 'adrenal') {
        for (const z of ZERGLINGS.map((n) => k[n])) if (z?.weapon) z.weapon = { ...z.weapon, period: z.weapon.period * 0.714 };
      } else if (e.apply === 'metabolic') metabolicBoost(k);
      else k.tusker.armor += 2;
      this.m.onMessage?.('THE SWARM EVOLVES', e.name, 3);
      const line = { level: "Scans show the swarm's evolving. Harder shells, nastier claws.", adrenal: 'The Zerglings are faster on the attack. Adrenal glands.', chitinous: 'Ultralisk plating just got thicker. Hit them with everything.', metabolic: 'The Zerglings are running faster than anything I have seen. Metabolic boost.' }[e.apply];
      this.say(HORNER, 'ashby', line, 3);
    }
  }

  // ---- The Raiders ------------------------------------------------------------------------

  private destinations(): string[] {
    return ['Auto', ...this.lines.fronts.map((f) => f.name), 'With me', 'Base'];
  }

  private stance(line: string, stance: Stance) {
    const f = this.lines.fronts.find((x) => x.name === line);
    if (!f) return;
    f.stance = stance;
    this.w.sfx.play('ui.click');
    const what = { auto: 'Sergeant, your call', hold: 'Hold that line', advance: 'Push them back', fallback: 'Fall back toward the base' }[stance];
    this.say(RAYNOR, 'harlan', `${line[0].toUpperCase() + line.slice(1)} line: ${what}!`, 1.8);
  }

  /**
   * The one way anything is commanded here, for both sides: the board, the command view, the
   * director and a test bot all come through. Null if it went through, otherwise why not.
   */
  apply(order: Order): string | null {
    if (this.ended) return 'Over';
    switch (order.kind) {
      case 'requisition':
        return this.order(order.offer, order.destination);
      case 'withdraw':
        return this.withdraw(order.producer, order.index);
      case 'stance':
        this.stance(order.line, order.stance);
        return null;
      case 'build':
        return this.build(order.structure, new THREE.Vector3(order.at[0], 0, order.at[1]));
      case 'evacuate':
        return this.evacuate(order.line);
      case 'pack':
        this.send(order.supply, order.route ?? Math.floor(Math.random() * 1e6));
        return null;
      case 'special':
        this.special();
        return null;
    }
  }

  /** How many of a limited squad's kind are out already (0 for a squad without a limit). */
  private fielded(o: Offer): number {
    if (o.limit === undefined) return 0;
    const kind = o.units[0]?.[0];
    return this.w.entities.filter((e) => e.alive && e.kind.name === kind && e.team === 'holdouts').length;
  }

  /** One of a building's orders taken back, its whole cost refunded. */
  private withdraw(producer: Producer, index: number): string | null {
    const o = this.requisition.withdraw(producer, index);
    if (!o) return 'No such order';
    this.treasury.ore += o.ore;
    this.treasury.gas += o.gas;
    this.note = `${o.label}: cancelled, refunded`;
    this.noteFor = 2;
    this.w.sfx.play('ui.click');
    return null;
  }

  /** A squad from the board, for where it's sent. */
  private order(key: string, destination: string): string | null {
    const o = this.board.find((x) => x.key === key);
    if (!o) return 'No such squad';
    const why = this.requisition.order(o, destination, this.treasury, this.armySupply('holdouts'), !!this.producer(o.producer), this.fielded(o));
    if (why) {
      this.note = why;
      this.noteFor = 2;
      this.w.sfx.play('ui.click', { volume: 0.5 });
      return why;
    }
    this.squadsBought++;
    this.note = `${o.label}: building at the ${PRODUCER_NAMES[o.producer]}`;
    this.noteFor = 2;
    this.w.sfx.play('ui.select');
    return null;
  }

  /** A squad out of its building's door, off to where it was sent. */
  private produced(o: Offer, destination: string) {
    const w = this.w;
    const b = this.producer(o.producer);
    if (!b) return;
    const line = this.lines.fronts.find((f) => f.name === destination);
    const front = line ? (line.broken && line.fallback ? line.fallback : line) : this.thinnest();
    const me = destination === 'With me';
    const base = destination === 'Base';
    let escort: Squad | null = null;
    if (me) {
      this.escorts = this.escorts.filter((s) => [...s.members].some((u) => u.alive));
      if (this.escorts.length >= ESCORTS) this.escorts.shift();
      escort = new Squad(() => this.body());
      this.escorts.push(escort);
    }
    const units: Unit[] = [];
    const heading = me ? (this.body()?.position ?? this.cc.position) : base ? this.cc.position : this.lines.anchor(front);
    for (const [kind, n] of o.units) {
      for (let i = 0; i < n; i++) {
        const door = o.air ? this.door(b, 14) : this.exit(b, kind, heading);
        if (o.air) {
          const station = me ? () => this.body()?.position ?? this.cc.position : base ? () => this.cc.position : () => this.lines.anchor(front).addScaledVector(front.out, 20);
          units.push(w.spawnUnit(kind, door.x, door.z, 0, (u) => new AirWingBrain(u, station)));
        } else if (me && escort) {
          const sq = escort;
          units.push(w.spawnUnit(kind, door.x, door.z, 0, (u) => (kind === 'medic' ? new MedicBrain(u, sq) : new SquadBrain(u, sq, true))));
        } else if (base) {
          const at = walkableNear(w, this.cc.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 70, 0, (Math.random() - 0.5) * 70)), 3);
          units.push(w.spawnUnit(kind, door.x, door.z, 0, (u) => (kind === 'medic' ? new MedicBrain(u, null, at) : new GuardBrain(u, at, 26, 46))));
        } else if (kind === 'howitzerMobile') units.push(this.lines.tank(front, door));
        else units.push(this.lines.soldier(kind, front, door));
      }
    }
    const where = me ? 'with you' : base ? 'to the base' : `to the ${front.name} ${front === line || !line ? 'line' : 'fallback'}`;
    this.m.onMessage?.('REINFORCEMENTS', `${o.label} out of the ${PRODUCER_NAMES[o.producer]}, ${where}`, 2.5);
    // Tagged on screen until it gets there, so it can be found.
    const to = me ? () => this.body()?.position ?? this.cc.position : base ? () => this.cc.position : () => this.lines.anchor(front.broken && front.fallback ? front.fallback : front);
    this.marching.push({ id: ++this.marchIds, label: o.label, where: me ? 'with you' : base ? 'the base' : `${front.name} line`, units, to, until: this.time + MARCH_TAG_SECONDS });
    w.audio.play(o.producer === 'barracks' ? 'trooperReady' : 'transmission', { volume: 0.6 });
  }

  /** A structure ordered built at `at`: paid for now, an SCV sent out from the Command Center to build it. */
  private build(kind: KindName, at: THREE.Vector3): string | null {
    const why = this.construction.order(kind, at, this.treasury);
    const label = this.construction.catalog.find((d) => d.kind === kind)?.label ?? kind;
    if (why) {
      this.note = `${label}: ${why}`;
      this.noteFor = 2;
      this.w.sfx.play('ui.click', { volume: 0.5 });
      return why;
    }
    this.note = `${label}: an SCV is on the way, ${this.where(at)}`;
    this.noteFor = 2.5;
    this.w.sfx.play('ui.select');
    return null;
  }

  /** A structure picked on the board: its ghost follows the crosshair on foot, the cursor in command, until a click places it. */
  private beginPlacing(kind: KindName) {
    const offer = this.construction.offers(this.treasury).find((o) => o.def.kind === kind);
    if (!offer) return;
    if (offer.blocked) {
      this.note = `${offer.def.label}: ${offer.blocked}`;
      this.noteFor = 2;
      this.w.sfx.play('ui.click', { volume: 0.5 });
      return;
    }
    this.placingKind = kind;
    this.preview?.begin(kind);
    this.w.sfx.play('ui.select');
    // The building picked by its number lets the keys go: the placement is the mouse's.
    this.armed = false;
    // On foot the board gives way to the crosshair (the mouse taken back inside this click).
    if (this.boardOpen) {
      this.boardOpen = false;
      this.host.panelChanged?.();
    }
  }

  private endPlacing() {
    this.placingKind = null;
    this.preview?.end();
    this.ui?.showPlacing(null, null, false);
  }

  placing(): boolean {
    return this.placingKind !== null && !this.ended;
  }

  cancel(): boolean {
    if (this.placingKind) {
      this.endPlacing();
      this.w.sfx.play('ui.click');
      return true;
    }
    if (this.armed && this.host.mode?.() === 'command') {
      this.armed = false;
      this.letGo = true;
      this.w.sfx.play('ui.click');
      return true;
    }
    return false;
  }

  /** The buildings the board's number keys pick: the producers, and Construction where structures can be built. */
  private groups(): BoardGroup[] {
    return BOARD_GROUPS.filter((g) => g !== 'construction' || this.construction.offers(this.treasury).length > 0);
  }

  /**
   * The board's keys, as StarCraft II's: a building's number picks it (on foot, opening the board
   * at it), and its train hotkeys order there (A Marines, S a Siege Tank, V Vikings; U a Bunker);
   * Tab picks where new squads go. While the board has the keyboard the body stands still, since
   * its letters are the body's too (A and D, E, F), and the command view doesn't pan or order.
   */
  keys(input: Input): boolean {
    if (this.ended || !this.ui) return false;
    const mode = this.host.mode?.() ?? 'ground';
    if (this.letGo) {
      this.letGo = false;
      input.swallow('Escape');
    }
    const ground = mode === 'ground';
    if (!ground && mode !== 'command') return false;
    const groups = this.groups();
    // Not while T is held on foot: its numbers pick a call-in.
    if (!(ground && input.down('KeyT'))) {
      groups.forEach((g, i) => {
        const code = `Digit${i + 1}`;
        if (!input.hit(code)) return;
        input.swallow(code);
        this.group = g;
        this.w.sfx.play('ui.click');
        if (ground && !this.boardOpen) {
          this.boardOpen = true;
          this.host.panelChanged?.();
        }
        if (!ground) this.armed = true;
      });
    }
    if (!(ground ? this.boardOpen : this.armed)) return false;
    if (!groups.includes(this.group)) this.group = groups[0];
    const pressed = (letter: string) => {
      const code = `Key${letter}`;
      if (!input.hit(code)) return false;
      input.swallow(code);
      return true;
    };
    if (this.group === 'construction') {
      for (const s of this.construction.offers(this.treasury)) if (pressed(s.def.hotkey)) this.beginPlacing(s.def.kind);
    } else {
      for (const o of this.board) {
        if (o.producer !== this.group) continue;
        if ([o.hotkey, ...(o.also ?? [])].some(pressed)) this.apply({ side: 'holdouts', kind: 'requisition', offer: o.key, destination: this.destination });
      }
    }
    if (input.hit('Tab')) {
      input.swallow('Tab');
      const list = this.destinations();
      this.destination = list[(list.indexOf(this.destination) + 1) % list.length];
      this.w.sfx.play('ui.click');
    }
    // Placing what it ordered built hands the keys back (the body walks to aim it).
    return ground ? this.boardOpen : this.armed;
  }

  /** The ghost where the commander points; a click builds there (Shift keeps placing), right-click calls it off. */
  private place() {
    const kind = this.placingKind;
    if (!kind) return;
    const mode = this.host.mode?.() ?? 'ground';
    const input = this.host.input;
    const camera = this.host.camera;
    if ((mode !== 'ground' && mode !== 'command') || !input || !camera || this.ended || this.boardOpen) {
      if (mode !== 'ground' && mode !== 'command') this.endPlacing();
      else {
        this.preview?.show(null, null);
        this.ui?.showPlacing(null, null, false);
      }
      return;
    }
    const at = aimPoint(this.w, camera, mode === 'command' ? input.cursor : null, mode === 'command' ? 6000 : PLACE_REACH);
    const why = at ? this.construction.check(kind, at) : mode === 'ground' ? 'Aim at the ground nearer by' : 'Point at the ground';
    this.preview?.show(at, why, at ? this.construction.facing(at) : 0);
    this.ui?.showPlacing(this.construction.catalog.find((d) => d.kind === kind)?.label ?? kind, why, mode === 'ground');
    if (input.mouseHit(2)) {
      input.swallowMouse(2);
      this.cancel();
      return;
    }
    if (!input.mouseHit(0)) return;
    input.swallowMouse(0);
    if (!at) return;
    const failed = this.apply({ side: 'holdouts', kind: 'build', structure: kind, at: [at.x, at.z] });
    if (!failed && !input.down('ShiftLeft') && !input.down('ShiftRight')) this.endPlacing();
  }

  /** Why Medivacs can't fly an evacuation now ('' if they can), or null where the operation has none. */
  private evacStatus(): string | null {
    if (!this.m.def.rules?.evac) return null;
    if (!this.producer('airfield')) return 'No Starport';
    const wait = this.evacReady - this.time;
    return wait > 0 ? `Medivacs back in ${Math.ceil(wait)}s` : '';
  }

  /**
   * Medivacs out of the Starport pull a line's soldiers out: they spread along the line, take
   * aboard who's under them (the wounded and the cut off alike), fly them to its fallback (or the
   * base if it has none), set them down there into its ranks, and go back to the Starport.
   */
  private evacuate(line: string): string | null {
    const rules = this.m.def.rules?.evac;
    const f = this.lines.fronts.find((x) => x.name === line);
    const refuse = (why: string) => {
      this.note = why;
      this.noteFor = 2;
      this.w.sfx.play('ui.click', { volume: 0.5 });
      return why;
    };
    if (!rules) return refuse('Not in this operation');
    if (!f) return refuse('No such line');
    const why = this.evacStatus();
    if (why) return refuse(why);
    const pad = this.producer('airfield')!;
    const w = this.w;
    const at = this.lines.anchor(f);
    const side = new THREE.Vector3(-f.out.z, 0, f.out.x);
    const to = f.fallback ? this.lines.anchor(f.fallback) : walkableNear(w, this.cc.position.clone().add(new THREE.Vector3(0, 0, -(this.cc.radius + 20))), 3);
    const into = f.fallback ?? null;
    for (let i = 0; i < rules.dustoffs; i++) {
      const across = (i - (rules.dustoffs - 1) / 2) * 18;
      const pickup = walkableNear(w, at.clone().addScaledVector(side, across).addScaledVector(f.out, -6), 3);
      const drop = walkableNear(w, to.clone().addScaledVector(side, across * 0.6), 3);
      const door = this.door(pad, 14);
      const ship = w.spawnUnit('dustoff', door.x, door.z, Math.atan2(pickup.x - door.x, pickup.z - door.z), (u) =>
        new TransportBrain(u, {
          pickup: { at: pickup, wait: 10, who: (s) => !s.flying && s.kind.name !== 'rigger' },
          drop: { at: drop, brain: (s, spot) => (into ? this.lines.join(s, into) : this.dropped(s, spot)) },
          home: door.clone(),
        }),
      );
      ship.name = 'Medivac';
    }
    this.evacReady = this.time + rules.cooldown;
    this.m.onMessage?.('EVACUATION', `Medivacs inbound to pull the ${line} line back to ${into ? 'its fallback' : 'the base'}. Stand under one to ride out with them`, 3);
    this.say(HORNER, 'ashby', `Medivacs are on their way to the ${line} line. Get those soldiers aboard!`, 2.4);
    w.audio.play('dustoffEngine', { volume: 0.7 });
    return null;
  }

  /** A soldier a transport set down: a post in the nearest line within reach, or holding where it's put. */
  dropped(u: Unit, at: THREE.Vector3): Controller | null {
    const f = this.lines.nearest(at, 90);
    return f ? this.lines.join(u, f) : new GuardBrain(u, at.clone(), 26, 46);
  }

  /** A free company: only in an emergency (a line just broke, or the army is nearly gone). */
  private emergency(to: Front) {
    const open = this.barracks.filter((x) => x.alive);
    if (!open.length) return;
    let count = 0;
    for (const [kind, n] of EMERGENCY) for (let k = 0; k < Math.round(n * this.grown()); k++, count++) this.lines.soldier(kind, to, this.door(open[count % open.length], 10));
    this.emergencies++;
  }

  // ---- The player's part --------------------------------------------------------------------

  playerKilled(e: Entity) {
    this.pay(e, false);
  }

  playerAssisted(e: Entity) {
    this.pay(e, true);
  }

  private pay(e: Entity, assist: boolean) {
    if (e.team !== 'crawl' || e.isBuilding) return;
    const up = !assist && !!this.streak?.kill();
    const b = bounty(this.data, e.kind, assist, this.streak?.multiplier ?? 1, this.tune.bounty);
    if (b.ore || b.gas) this.treasury.earn(b.ore, b.gas, this.w.time, true);
    if (up && this.streak) this.m.onMessage?.(`BOUNTY ×${this.streak.multiplier.toFixed(1)}`, 'Your kills pay more until you go down', 1.8);
  }

  playerDamaged(amount: number, maxHp: number) {
    this.director.playerDamaged(amount, maxHp);
  }

  playerDown() {
    this.director.playerDown();
    // Going down costs the streak's bonus, never what's been earned.
    const lost = this.streak?.reset() ?? 1;
    if (lost > 1) {
      this.note = `Bounty streak lost (it was ×${lost.toFixed(1)})`;
      this.noteFor = 3;
    }
  }

  died(e: Entity) {
    if (e.isBuilding) {
      const def = this.raised.get(e as Building);
      if (def?.produces) this.requisition.addBays(def.produces.producer, -def.produces.bays);
      this.raised.delete(e as Building);
      // The last of a kind of production building gone: its orders are cancelled and refunded,
      // rather than waiting on it forever, holding their supply.
      for (const p of Object.keys(this.producers) as Producer[]) {
        if (!this.producers[p].includes(e as Building) || this.producer(p)) continue;
        const orders = this.requisition.cancel(p);
        if (!orders.length) continue;
        const back = { ore: 0, gas: 0 };
        for (const o of orders) {
          back.ore += o.ore;
          back.gas += o.gas;
        }
        this.treasury.ore += back.ore;
        this.treasury.gas += back.gas;
        this.m.onMessage?.(`THE ${p.toUpperCase()} IS DOWN`, `${orders.length} squad${orders.length > 1 ? 's' : ''} cancelled: ${back.ore} minerals and ${back.gas} gas back`, 3);
      }
      return;
    }
    if (e.team === 'holdouts') this.director.holdoutsLost(this.supply(e.kind.name));
    else if (e.team === 'crawl') {
      const b = this.body();
      if (b) this.director.crawlDied(Math.hypot(b.position.x - e.position.x, b.position.z - e.position.z));
    }
  }

  // ---- The flow of it -----------------------------------------------------------------------

  private phaseChanged(p: Phase) {
    // The director works unseen: a breather is heard on the radio, never announced as one.
    if (p === 'relax') {
      const [who, portrait, line] = LULL_LINES[this.lullNext++ % LULL_LINES.length];
      this.say(who, portrait, line, 3.2);
    } else if (p === 'peak') this.w.audio.play('baseUnderAttack', { volume: 0.7 });
  }

  private clock(s: number): string {
    const t = Math.max(0, Math.ceil(s));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  }

  /** Calls it when a line is overrun (and empties the Barracks to its fallback), and when it's retaken. */
  private watchLines() {
    const w = this.w;
    for (const f of this.lines.fronts) {
      const at = this.lines.anchor(f);
      let ours = 0;
      let theirs = 0;
      for (const u of w.unitsNear(at.x, at.z, 45)) {
        if (u.team === 'holdouts') ours++;
        else if (u.team === 'crawl') theirs++;
      }
      if (!f.broken && ours <= 4 && theirs >= 12) {
        f.broken = true;
        if (f.fallback) this.emergency(f.fallback);
        this.m.onMessage?.(`THE ${f.name.toUpperCase()} LINE IS BROKEN`, 'The swarm is through. A company is running for the fallback', 4);
        w.audio.play('baseUnderAttack', { volume: 0.9 });
        this.m.radio.interrupt();
        this.say(HORNER, 'ashby', `The ${f.name} line is gone! They're pouring into the base!`, 3);
      } else if (f.broken && ours >= 12 && theirs < ours) {
        f.broken = false;
        this.m.onMessage?.(`THE ${f.name.toUpperCase()} LINE HOLDS AGAIN`, '', 2.5);
        this.say(RAYNOR, 'harlan', `That's the ${f.name} line back. Dig in!`, 2.6);
      }
    }
  }

  /**
   * The one thing that matters most, pinned as the waypoint (the beacon and the HUD marker): the
   * swarm at the base, a broken line's fallback, an Overlord drop. Nothing pinned when it's quiet.
   */
  private pointAtCrisis(atBase: number) {
    let at: THREE.Vector3 | null = null;
    let label = '';
    const broken = this.lines.fronts.find((f) => f.broken);
    if (atBase >= 8) {
      at = this.cc.position;
      label = 'The base is under attack';
    } else if (broken) {
      at = this.lines.anchor(broken.fallback ?? broken);
      label = `Hold the ${broken.name} fallback`;
    } else if (this.dropAt && this.time < this.dropAt.until) {
      at = this.dropAt.at;
      label = 'Overlord drop';
    }
    if (label === this.crisisLabel) return;
    this.crisisLabel = label;
    this.m.setWaypoint(at, label, 8);
  }

  /**
   * The Hyperion fights only where it's called (F), but not while the swarm is in the base: then,
   * if it's charged, it jumps in over the Command Center on its own.
   */
  private coverBase(atBase: number) {
    const ship = this.host.ship;
    if (!this.covering && atBase >= 6) {
      this.covering = true;
      // Where the strike is the player's to spend, the ship comes only when they call it.
      if (ship.strikeRules?.manual) {
        this.say(HORNER, 'ashby', ship.callable() ? "They're in the base! Hold them off till the Hyperion's ready!" : `They're in the base! Call the Hyperion in over the Command Center: ${ship.callKey}!`, 3);
        return;
      }
      const why = ship.callIn(this.cc.position);
      if (!why) this.say(HORNER, 'ashby', "They're in the base! The Hyperion's jumping in over the Command Center!", 3);
      else if (ship.rechargeLeft > 0) this.say(HORNER, 'ashby', "They're in the base, and the Hyperion's still recharging. Hold them off!", 3);
    } else if (this.covering && atBase === 0) this.covering = false;
  }

  private updateMeter() {
    const left = this.holdSeconds - this.time;
    const raiders = Math.round(this.armySupply('holdouts'));
    const swarm = Math.round(this.armySupply('crawl'));
    this.m.meter = {
      label: this.ended ? 'THE FLEET IS IN ORBIT' : `FLEET IN ${this.clock(left)}`,
      value: Math.min(1, this.time / this.holdSeconds),
      text: `RAIDERS ${raiders} · SWARM ${swarm}`,
    };
    this.m.progress.set('hold', this.ended ? 'Fleet in orbit' : this.clock(left));
    this.m.baseLost = `The Command Center fell ${this.clock(left)} before the fleet made orbit. Char has the Raiders.`;
  }

  /** The board, its keys, the markers over the battlefield, and the treasury on screen. */
  private screens(dt: number) {
    const ui = this.ui;
    if (!ui) return;
    const mode = this.host.mode?.() ?? 'ground';
    const ground = mode === 'ground';
    // The board shuts with the body (a death, a rise into command, where it's always open).
    if (!ground) this.boardOpen = false;
    const open = (this.boardOpen || mode === 'command') && !this.ended;
    if (mode !== 'command') this.armed = false;
    this.noteFor -= dt;
    const supply = this.armySupply('holdouts');
    const lines = this.lines.fronts.map((f) => {
      const at = this.lines.anchor(f);
      let s = 0;
      for (const u of this.w.unitsNear(at.x, at.z, 45)) if (u.team === 'holdouts') s += this.supply(u.kind.name);
      return { name: f.name, stance: f.stance, strength: s, broken: f.broken, evac: this.evacStatus() };
    });
    const visible = ground || mode === 'command' || mode === 'lost';
    const streak = this.streak ? { multiplier: this.streak.multiplier, toNext: this.streak.toNext } : null;
    ui.resources(this.treasury, supply, this.requisition.cap, this.treasury.rate(this.w.time), streak, visible && !this.ended);
    const view: BoardView = {
      open,
      interactive: open && (this.boardOpen || mode === 'command'),
      groups: this.groups(),
      group: this.group,
      keyed: (ground && this.boardOpen) || (mode === 'command' && this.armed),
      command: mode === 'command',
      offers: this.board,
      req: this.requisition,
      treasury: this.treasury,
      supply,
      destination: this.destination,
      destinations: this.destinationViews(lines),
      lines,
      structures: this.construction.offers(this.treasury),
      works: this.construction.sites.filter((s) => !s.done).map((s) => ({ label: s.def.label, progress: s.progress })),
      placing: this.placingKind,
      cap: this.requisition.cap,
      streak,
      note: this.noteFor > 0 ? this.note : '',
      blocked: Object.fromEntries(this.board.map((o) => [o.key, this.requisition.check(o, this.treasury, supply, !!this.producer(o.producer), this.fielded(o))])),
      workers: this.workerView(),
    };
    ui.showBoard(view);
    this.place();
    // New squads on their way: tagged until they get there (or fall).
    this.marching = this.marching.filter((m) => {
      m.units = m.units.filter((u) => u.alive);
      if (!m.units.length || this.time > m.until) return false;
      const c = this.centroid(m.units);
      const to = m.to();
      return Math.hypot(c.x - to.x, c.z - to.z) > 22;
    });
    const tags: Marching[] = this.marching.map((m) => ({ id: m.id, label: `${m.label}${m.units.length > 1 ? ` ×${m.units.length}` : ''}`, where: m.where, at: this.centroid(m.units) }));
    const camera = this.host.camera;
    if (camera) ui.showMarks(camera, visible && !this.ended ? view : null, visible && !this.ended ? tags : [], this.body()?.position ?? null);
  }

  private centroid(units: Unit[]): THREE.Vector3 {
    const c = new THREE.Vector3();
    for (const u of units) c.add(u.position);
    return c.divideScalar(Math.max(1, units.length));
  }

  /** Where new squads can be sent, as the board and its markers show them. */
  private destinationViews(lines: { name: string; strength: number; broken: boolean }[]): Destination[] {
    const name = (n: string) => n[0].toUpperCase() + n.slice(1);
    let atBase = 0;
    for (const u of this.w.unitsNear(this.cc.position.x, this.cc.position.z, 60)) if (u.team === 'crawl') atBase++;
    const out: Destination[] = [{ id: 'Auto', label: 'Auto', detail: `now: ${this.thinnest().name}`, explain: EXPLAIN.auto, at: null, alert: false }];
    for (const f of this.lines.fronts) {
      const l = lines.find((x) => x.name === f.name);
      out.push({
        id: f.name,
        label: `${name(f.name)} line`,
        detail: f.broken ? 'overrun: to its fallback' : `${Math.round(l?.strength ?? 0)} supply · ${f.stance === 'auto' ? 'sergeant' : f.stance}`,
        explain: EXPLAIN.line(f.name),
        at: this.lines.anchor(f.broken && f.fallback ? f.fallback : f),
        alert: f.broken,
      });
    }
    out.push({ id: 'With me', label: 'With me', detail: '', explain: EXPLAIN.me, at: null, alert: false });
    out.push({ id: 'Base', label: 'Base', detail: atBase ? `${atBase} Zerg inside` : 'quiet', explain: EXPLAIN.base, at: this.cc.position, alert: atBase > 5 });
    return out;
  }

  protected tick(dt: number) {
    // The first look is out over the approach, at what's coming.
    const avatar = this.host.avatar();
    if (!this.faced && avatar) {
      this.faced = true;
      const f = this.home();
      avatar.yaw = Math.atan2(f.out.x, f.out.z);
    }
    this.screens(dt);
    if (this.ended) {
      this.finale(dt);
      return;
    }
    const raiders = this.armySupply('holdouts');
    const swarm = this.armySupply('crawl');
    this.lowest = Math.min(this.lowest, raiders / ARMY_SUPPLY);
    if (raiders < ARMY_SUPPLY * 0.25) this.fail('line');

    // The director: how pressed is the player, and what comes now.
    const body = this.body();
    const engaged = !!body && !!this.w.nearestEnemy(body.team, body.position.x, body.position.z, 10);
    let atBase = 0;
    for (const u of this.w.unitsNear(this.cc.position.x, this.cc.position.z, 60)) if (u.team === 'crawl') atBase++;
    const grown = this.grown();
    this.director.scale = grown;
    this.director.update(dt, { engaged, brokenLines: this.lines.fronts.filter((f) => f.broken).length, crawlAtBase: atBase, base: this.cc.hp / this.cc.maxHp, pressure: this.pressure() });

    if (this.director.spawning) {
      // Packs: what died, back in waves down a route each.
      this.topUp += dt;
      if (this.topUp >= this.packEvery) {
        const want = this.target() * (this.director.phase === 'peak' ? 1 : 0.85);
        const tune = this.tune;
        if (swarm < want) this.apply({ side: 'crawl', kind: 'pack', supply: Math.min(want - swarm, tune.topUpPerSecond * grown * this.topUp, tune.packMax * grown * (tune.swarm.scale[this.m.difficulty.level] ?? 1)) });
        this.topUp = 0;
        this.packEvery = tune.packEvery[0] + Math.random() * (tune.packEvery[1] - tune.packEvery[0]);
      }
      this.surgeIn -= dt;
      if (this.surgeIn <= 0) {
        this.surgeIn = 18 + Math.random() * 10;
        const room = this.target() * this.tune.surgeCap - swarm;
        if (room > 4) {
          this.surges++;
          this.apply({ side: 'crawl', kind: 'pack', supply: Math.min(this.target() * this.tune.surgeShare, room) });
          if (this.surges % 3 === 0) {
            this.m.onMessage?.('THE TIDE SURGES', 'A wall of Zerg coming down one of the routes', 2.5);
            this.m.onWave?.(this.surges, true);
          }
        }
      }
      this.specialIn -= dt;
      if (this.specialIn <= 0 && this.crisis === 0 && this.time > 50) {
        this.specialIn = (SPECIAL_EVERY[this.m.difficulty.level] ?? 55) * (0.8 + Math.random() * 0.4) / this.director.amplitude;
        this.apply({ side: 'crawl', kind: 'special' });
      }
    }
    this.evolve();

    // Production, construction, the base's SCVs, and the rare free company.
    for (const job of this.requisition.update(dt, (p) => !!this.producer(p))) this.produced(job.offer, job.destination);
    this.trainWorkers(dt);
    this.construction.update(dt);
    this.emergencyIn -= dt;
    if (raiders < ARMY_SUPPLY * EMERGENCY_BELOW && this.emergencyIn <= 0) {
      this.emergencyIn = EMERGENCY_EVERY[this.m.difficulty.level] ?? 60;
      this.emergency(this.thinnest());
      this.m.onMessage?.('EMERGENCY COMPANY', 'The Barracks empty out: the army is nearly gone', 3);
    }

    // The lines: the sergeants' judgment, and who's been overrun.
    this.linesIn -= dt;
    if (this.linesIn <= 0) {
      this.linesIn = 2;
      this.lines.update(this.director.phase === 'relax' || this.director.phase === 'fade', (k) => this.supply(k));
    }
    this.watchIn -= dt;
    if (this.watchIn <= 0) {
      this.watchIn = 2;
      this.watchLines();
    }
    this.crisisIn -= dt;
    if (this.crisisIn <= 0) {
      this.crisisIn = 1;
      this.pointAtCrisis(atBase);
      this.coverBase(atBase);
    }

    // Moments along the way.
    const at = (id: string, t: number, run: () => void) => {
      if (this.time >= t && !this.fired.has(id)) {
        this.fired.add(id);
        run();
      }
    };
    const hold = this.holdSeconds;
    at('first-wall', 22, () => this.say(HORNER, 'ashby', 'Contact on every route. Here they come.', 3));
    at('maxed', hold * 0.22, () => this.say(HORNER, 'ashby', "That's a full brood out there now. Two hundred of theirs on the field, and more behind them.", 4));
    at('air', hold * 0.25 + 12, () => this.say(HORNER, 'ashby', 'Mutalisks! Get the rifles looking up, or get Vikings in the air!', 3));
    at('ultras', hold * 0.5 + 15, () => this.say(RAYNOR, 'harlan', 'Ultralisks! Tanks, focus the big ones!', 2.6));
    at('brood', hold * 0.8 + 15, () => this.say(HORNER, 'ashby', 'Brood Lords over the ridge. Vikings, now, or they will grind the line flat.', 3.5));
    at('last', hold - 60, () => {
      this.say(HORNER, 'ashby', 'One minute! The fleet is dropping out of warp!', 3);
      this.say(RAYNOR, 'harlan', 'One more minute, Raiders. Give it everything.', 3);
    });
    this.chatterIn -= dt;
    if (this.chatterIn <= 0 && this.m.radio.idle) {
      this.chatterIn = 55 + Math.random() * 30;
      const [who, portrait, line] = CHATTER[this.chatterNext++ % CHATTER.length];
      this.say(who, portrait, line);
    }

    if (this.time >= this.holdSeconds) {
      this.ended = true;
      this.complete('hold');
      this.m.radio.interrupt();
      this.say(HORNER, 'ashby', 'Fleet is in orbit! Danger close, everyone get your heads down!', 3);
      this.w.audio.play('transmission', { volume: 0.8 });
    }
    this.updateMeter();
  }

  /** The fleet clears the field: a barrage walking across the swarm, then it's over. */
  private finale(dt: number) {
    const w = this.w;
    this.barrage += dt;
    if (this.barrage > 1.5 && this.barrage < 1.5 + BARRAGE_SECONDS) {
      const due = Math.floor((this.barrage - 1.5) * BARRAGE_RATE);
      const crawl = due > this.strikes ? w.entities.filter((e) => e.alive && e.team === 'crawl' && !e.isBuilding) : [];
      for (; this.strikes < due && crawl.length; this.strikes++) {
        const z = crawl[Math.floor(Math.random() * crawl.length)];
        if (!z.alive) continue;
        const at = z.position.clone();
        if (z.flying) at.y = this.terrain.heightAt(at.x, at.z);
        w.effects.explosion(at, 4);
        if (this.strikes % 4 === 0) w.effects.flash(at.clone().setY(at.y + 8), 26, 0xffd0a0, 0.3, 60);
        for (const e of w.unitsNear(at.x, at.z, 12)) {
          if (e.team !== 'crawl') continue;
          e.minHp = 0;
          e.takeDamage(e.hp + 1000, null, at, true, 'Blast');
        }
        if (this.strikes % 6 === 0) w.audio.play('buildingExplosion', { at, volume: 0.9 });
      }
      w.effects.shake = Math.max(w.effects.shake, 0.5);
    } else if (this.barrage >= 1.5 + BARRAGE_SECONDS && !this.won) {
      for (const e of w.entities) {
        if (!e.alive || e.team !== 'crawl' || e.isBuilding) continue;
        e.minHp = 0;
        e.takeDamage(e.hp + 1000, null, e.position, true, 'Blast');
      }
      if (this.barrage > 3 + BARRAGE_SECONDS) {
        this.won = true;
        this.ui?.dispose();
        this.ui = null;
        this.say(RAYNOR, 'harlan', "The line held. I'll be damned. The line held.", 4);
        const t = this.treasury;
        this.m.win(
          `The line held for ${this.clock(this.holdSeconds)}: ${this.squadsBought} squads requisitioned (${Math.round(t.bounty)} of it earned with your own gun), and the Raiders never fell below ${Math.round(this.lowest * 100)}% strength.`,
        );
      }
    }
    this.updateMeter();
  }
}
