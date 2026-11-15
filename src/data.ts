/**
 * StarCraft II game data: the XML catalogs (UnitData, WeaponData, EffectData, ...) from each
 * mod in the melee stack, merged the way the game merges them. Later mods override earlier
 * ones field by field; entries inherit from their `parent` and from their type's defaults;
 * `##id##` stands for the entry's own id.
 *
 * Values are in the game's "Normal" speed. Players play on "Faster", which runs game time
 * 1.4x as fast; `FASTER` converts.
 */

import type { DamageResponse, DamageStats, DeathType, Stats, JoltStats, UnitStats, WeaponStats, KeelGunStats } from '../../../src/game/stats.ts';
import { ART_CATALOGS, ART_ROOTS, CAMPAIGN_ROOTS, DATA_CATALOGS, DATA_ROOTS, SWARM_CAMPAIGN_ROOTS, dataFile } from './manifest.ts';

interface Entry {
  tag: string;
  parent?: string;
  layers: Element[];
}

export class Catalog {
  private entries = new Map<string, Entry>();
  private defaults = new Map<string, Element[]>();

  add(doc: Document) {
    for (const el of Array.from(doc.documentElement.children)) {
      const id = el.getAttribute('id');
      if (el.getAttribute('default') === '1' && !id) {
        const list = this.defaults.get(el.tagName) ?? [];
        list.push(el);
        this.defaults.set(el.tagName, list);
        continue;
      }
      if (!id) continue;
      let entry = this.entries.get(id);
      if (!entry) {
        entry = { tag: el.tagName, layers: [] };
        this.entries.set(id, entry);
      }
      entry.layers.push(el);
      const parent = el.getAttribute('parent');
      if (parent) entry.parent = parent;
    }
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  /** Every entry's id. */
  ids(): IterableIterator<string> {
    return this.entries.keys();
  }

  tag(id: string): string | undefined {
    return this.entries.get(id)?.tag;
  }

  /** Every element that defines `id`, oldest first: type defaults, parents, then its own layers. */
  private chain(id: string, seen = new Set<string>()): Element[] {
    const entry = this.entries.get(id);
    if (!entry || seen.has(id)) return [];
    seen.add(id);
    const base = entry.parent ? this.chain(entry.parent, seen) : (this.defaults.get(entry.tag) ?? []);
    return [...base, ...entry.layers];
  }

  /**
   * A field value. `path` is a slash-separated list of child tags, each optionally keyed by
   * its `index` attribute: "LifeMax", "Cost/Vital[Life]", "Modification".
   */
  value(id: string, path: string, attr = 'value'): string | undefined {
    const steps = path.split('/').map((s) => {
      const m = /^([^[]+)(?:\[(.+)\])?$/.exec(s)!;
      return { tag: m[1], key: m[2] };
    });
    const layers = this.chain(id);
    for (let i = layers.length - 1; i >= 0; i--) {
      let nodes: Element[] = [layers[i]];
      for (const step of steps) {
        nodes = nodes.flatMap((n) =>
          Array.from(n.children).filter((c) => c.tagName === step.tag && (step.key === undefined || c.getAttribute('index') === step.key)),
        );
      }
      for (let k = nodes.length - 1; k >= 0; k--) {
        const v = nodes[k].getAttribute(attr);
        if (v !== null) return v.replace(/##id##/g, id);
      }
    }
    return undefined;
  }

  number(id: string, path: string, fallback = 0, attr = 'value'): number {
    const v = this.value(id, path, attr);
    return v === undefined || v === '' ? fallback : Number(v);
  }

  /**
   * An array field's entries, merged across the entry's parents and layers as StarCraft II merges
   * them (`mergeArray`): libertymulti's `<InfoArray index="Build4" Time="65"/>` changes the
   * Barracks' build time and keeps the Unit that liberty's entry names.
   */
  array(id: string, tag: string): Field[] {
    return mergeArray(this.chain(id), tag, true);
  }
}

/** One entry of an array field, merged across the elements that write it. */
export class Field {
  /** Oldest first. */
  private readonly layers: readonly Element[];
  private readonly kids = new Map<string, Field[]>();

  // Not a parameter property: tools/assetgen runs this file under Node's type stripping.
  constructor(layers: readonly Element[]) {
    this.layers = layers;
  }

  /** An attribute, as the newest layer that sets it has it. */
  getAttribute(name: string): string | null {
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const v = this.layers[i].getAttribute(name);
      if (v !== null) return v;
    }
    return null;
  }

  /**
   * A field, as the newest layer that sets it has it. The data writes one either as an attribute
   * (`MaxSpeed="20"`) or as a child (`<MaxSpeed value="20"/>`), and the two mean the same.
   */
  field(name: string): string | undefined {
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const layer = this.layers[i];
      const v = layer.getAttribute(name);
      if (v !== null) return v;
      if (Array.from(layer.children).some((c) => c.tagName === name)) return this.all(name)[0]?.getAttribute('value') ?? undefined;
    }
    return undefined;
  }

  /**
   * The children with a tag, merged the same way: an array's entries, or a field's one. Only the
   * name tells them apart, so a tag ending in Array appends its unindexed entries and any other
   * adds a layer's k-th to the k-th. That's right for a field, and for a short list it lets a
   * campaign's own entry replace the melee one under it (the Factory's Train7 is the campaign's
   * Goliath, not a Hellbat and a Goliath).
   */
  all(tag: string): Field[] {
    let list = this.kids.get(tag);
    if (!list) this.kids.set(tag, (list = mergeArray(this.layers, tag, tag.endsWith('Array'))));
    return list;
  }
}

/**
 * The `tag` children of `layers` (oldest first), merged as StarCraft II merges an array. An entry
 * with an index (a slot number or a name) adds the fields it sets to the entry already there, and
 * one with `removed="1"` takes that entry out once the layer is done (a layer's indexes all count
 * from the array as it found it). An entry without an index goes on the end, or, where `append` is
 * false, the layer's k-th such entry adds to the k-th.
 */
function mergeArray(layers: readonly Element[], tag: string, append: boolean): Field[] {
  const slots: (Element[] | undefined)[] = [];
  const keyed = new Map<string, Element[]>();
  for (const layer of layers) {
    let position = 0;
    const removed = new Set<number>();
    for (const c of Array.from(layer.children)) {
      if (c.tagName !== tag) continue;
      const index = c.getAttribute('index');
      const remove = c.getAttribute('removed') === '1';
      if (index === null) {
        if (append) slots.push([c]);
        else (slots[position] ??= []).push(c);
        position++;
      } else if (/^\d+$/.test(index)) {
        if (remove) removed.add(Number(index));
        else (slots[Number(index)] ??= []).push(c);
      } else if (remove) keyed.delete(index);
      else keyed.set(index, [...(keyed.get(index) ?? []), c]);
    }
    if (removed.size) {
      // Gaps (an index set past the end) keep their places; only what was removed closes up.
      const kept: (Element[] | undefined)[] = [];
      for (let i = 0; i < slots.length; i++) if (!removed.has(i)) kept.push(slots[i]);
      slots.length = 0;
      slots.push(...kept);
    }
  }
  return [...slots.filter((s): s is Element[] => !!s), ...keyed.values()].map((s) => new Field(s));
}

export class GameData implements Stats {
  readonly units = new Catalog();
  readonly weapons = new Catalog();
  readonly effects = new Catalog();
  readonly behaviors = new Catalog();
  readonly abilities = new Catalog();
  /** How missiles fly: each launch's mover, its phases' drivers and speeds. */
  readonly movers = new Catalog();
  /** How units look and sound: models, animation speeds, sounds. */
  readonly actors = new Catalog();
  readonly models = new Catalog();
  readonly terrainTextures = new Catalog();
  readonly terrains = new Catalog();
  readonly lights = new Catalog();
  /**
   * The same catalogs with the Wings of Liberty campaign's data on top, for campaign-only
   * units. Melee units keep reading the melee numbers from the main set.
   */
  campaign: GameData = this;

  /**
   * The Heart of the Swarm campaign's numbers over the Wings of Liberty campaign's (its Valkyrie,
   * its Zergling strains), where a mission asked for them (The Tide: Unleashed): null otherwise.
   */
  swarm: GameData | null = null;

  static async load(fetchText: (archivePath: string) => Promise<string | null>, opts: { swarm?: boolean } = {}): Promise<GameData> {
    const data = new GameData();
    const catalogs: Record<string, Catalog> = {
      UnitData: data.units,
      WeaponData: data.weapons,
      EffectData: data.effects,
      BehaviorData: data.behaviors,
      AbilData: data.abilities,
      MoverData: data.movers,
      ActorData: data.actors,
      ModelData: data.models,
      TerrainTexData: data.terrainTextures,
      TerrainData: data.terrains,
      LightData: data.lights,
    };
    const parser = new DOMParser();
    const files = [
      ...DATA_ROOTS.flatMap((mod) => DATA_CATALOGS.map((catalog) => ({ mod, catalog, campaign: false }))),
      ...ART_ROOTS.flatMap((mod) => ART_CATALOGS.map((catalog) => ({ mod, catalog, campaign: false }))),
      ...CAMPAIGN_ROOTS.flatMap((mod) => DATA_CATALOGS.map((catalog) => ({ mod, catalog, campaign: true }))),
      ...(opts.swarm ? SWARM_CAMPAIGN_ROOTS.flatMap((mod) => DATA_CATALOGS.map((catalog) => ({ mod, catalog, campaign: true, swarm: true }))) : []),
    ];
    const texts = await Promise.all(files.map((f) => fetchText(dataFile(f.mod, f.catalog))));
    const docs = files.map((f, i) => (texts[i] ? parser.parseFromString(texts[i]!, 'text/xml') : null));
    const campaign = new GameData();
    const campaignCatalogs: Record<string, Catalog> = {
      UnitData: campaign.units,
      WeaponData: campaign.weapons,
      EffectData: campaign.effects,
      BehaviorData: campaign.behaviors,
      AbilData: campaign.abilities,
      MoverData: campaign.movers,
    };
    const swarm = opts.swarm ? new GameData() : null;
    const swarmCatalogs: Record<string, Catalog> | null = swarm
      ? { UnitData: swarm.units, WeaponData: swarm.weapons, EffectData: swarm.effects, BehaviorData: swarm.behaviors, AbilData: swarm.abilities, MoverData: swarm.movers }
      : null;
    files.forEach((f, i) => {
      const doc = docs[i];
      if (!doc) return;
      if (!f.campaign) catalogs[f.catalog].add(doc);
      // The campaign set: the melee stack's numbers, then the campaign's over them.
      if (!('swarm' in f) && campaignCatalogs[f.catalog]) campaignCatalogs[f.catalog].add(doc);
      // Heart of the Swarm's over all of that.
      if (swarmCatalogs?.[f.catalog]) swarmCatalogs[f.catalog].add(doc);
    });
    // Art is shared.
    const art = { actors: data.actors, models: data.models, terrainTextures: data.terrainTextures, terrains: data.terrains, lights: data.lights };
    Object.assign(campaign, art);
    data.campaign = campaign;
    if (swarm) data.swarm = Object.assign(swarm, art);
    return data;
  }

  unit(id: string): UnitStats {
    const u = this.units;
    if (!u.has(id)) throw new Error(`no unit ${id} in game data`);
    return {
      id,
      lifeMax: u.number(id, 'LifeMax'),
      lifeArmor: u.number(id, 'LifeArmor'),
      lifeRegen: u.number(id, 'LifeRegenRate'),
      speed: u.number(id, 'Speed'),
      radius: u.number(id, 'Radius', 0.5),
      attributes: u
        .array(id, 'Attributes')
        .filter((a) => a.getAttribute('value') === '1')
        .map((a) => a.getAttribute('index')!),
      weapons: u
        .array(id, 'WeaponArray')
        .map((w) => w.field('Link'))
        .filter((link): link is string => !!link && this.weapons.has(link))
        .map((link) => this.weapon(link)),
      energyMax: u.number(id, 'EnergyMax'),
      energyStart: u.number(id, 'EnergyStart'),
      energyRegen: u.number(id, 'EnergyRegenRate'),
      flying: u.value(id, 'PlaneArray[Air]') === '1',
      height: u.number(id, 'Height'),
      pushPriority: u.number(id, 'PushPriority', 10),
      deathEffect:
        u
          .array(id, 'BehaviorArray')
          .map((b) => b.field('Link'))
          .filter((l): l is string => !!l && this.behaviors.has(l))
          .map((l) => this.behaviors.value(l, 'Modification/DeathResponse', 'Effect'))
          .find((e): e is string => !!e) ?? null,
      damageResponses: u
        .array(id, 'BehaviorArray')
        .map((b) => b.field('Link'))
        .filter((l): l is string => !!l && this.behaviors.has(l))
        .map((l) => this.damageResponse(l))
        .filter((r): r is DamageResponse => !!r),
    };
  }

  private damageResponse(id: string): DamageResponse | null {
    const b = this.behaviors;
    const clamp = b.value(id, 'DamageResponse', 'ClampMaximum');
    const fraction = b.value(id, 'DamageResponse', 'ModifyFraction');
    if (clamp === undefined && fraction === undefined) return null;
    // Left out where it can't apply here: behind research the campaign's armory sells
    // (Requirements: the Wraith's Displacement Field), or answering only certain effects
    // (RequireEffectArray: the Massive's vulnerability to a Void Ray's beam).
    if (b.value(id, 'Requirements') !== undefined || b.value(id, 'DamageResponse/RequireEffectArray') !== undefined) return null;
    // The damage kinds it answers: all of them, less any it switches off.
    const on = (k: string) => b.value(id, `DamageResponse/Kind[${k}]`) !== '0';
    return {
      weapon: on('Melee') || on('Ranged') || on('Splash'),
      spell: on('Spell'),
      minimum: b.number(id, 'DamageResponse', 0, 'Minimum'),
      fatal: b.value(id, 'DamageResponse', 'Fatal') === '1',
      ...((): { enemy: boolean; friendly: boolean } => {
        const [required = [], excluded = []] = (b.value(id, 'DamageResponse', 'TargetFilters') ?? '').split(';').map((p) => p.split(','));
        const ally = ['Player', 'Ally', 'Self'];
        return {
          enemy: !excluded.includes('Enemy') && !required.some((r) => ally.includes(r)),
          friendly: !excluded.includes('Ally') && !excluded.includes('Player') && !required.includes('Enemy'),
        };
      })(),
      clampMax: clamp === undefined ? Infinity : Number(clamp),
      fraction: fraction === undefined ? 1 : Number(fraction),
      chance: b.number(id, 'DamageResponse', 1, 'Chance'),
    };
  }

  /** The Medic's heal (the campaign's "heal", a CEffectCreateHealer): life per second and energy per life. */
  heal(): { rate: number; energyPerLife: number; range: number } {
    const e = this.effects;
    return {
      rate: e.number('MedivacHeal', 'RechargeVitalRate', 9),
      energyPerLife: e.number('MedivacHeal', 'DrainVitalCostFactor', 0.33),
      range: this.abilities.number('heal', 'Range', 2),
    };
  }

  /** The Medivac's heal (its autocast): life per second (Normal speed), energy per life, range in cells. */
  dustoffHeal(): { rate: number; energyPerLife: number; range: number } {
    const e = this.effects;
    return {
      rate: e.number('MedivacHeal', 'RechargeVitalRate', 9),
      energyPerLife: e.number('MedivacHeal', 'DrainVitalCostFactor', 0.33),
      range: this.abilities.number('MedivacHeal', 'Range', 4),
    };
  }

  /** The Ghost's Personal Cloaking: energy to switch on and energy drained per second. */
  shroud(): { cost: number; drain: number } {
    return {
      cost: this.abilities.number('GhostCloak', 'Cost/Vital[Energy]', 25),
      drain: -this.behaviors.number('GhostCloak', 'Modification/VitalRegenArray[Energy]', -1.4765),
    };
  }

  /** Tactical Nuke: the blast (damage in rings) and the seconds it takes to land. */
  warhead(): { damage: DamageStats; delay: number } {
    const dmg = this.resolveDamage('NukeDamage', new Set())?.damage ?? { amount: 300, bonus: { Structure: 200 }, splash: [] };
    const count = this.effects.number('NukePersistent', 'PeriodCount', 50);
    const period = this.effects.number('NukePersistent', 'PeriodicPeriodArray', 0.2);
    return { damage: dmg, delay: count * period };
  }

  weapon(id: string): WeaponStats {
    const w = this.weapons;
    const effect = w.value(id, 'Effect') || id;
    // Where the chain is beyond following (the Brood Lord's broodlings circle it before they
    // strike), the damage the game's own tooltip shows.
    const display = w.value(id, 'DisplayEffect');
    const resolved = this.resolveDamage(effect, new Set()) ?? (display ? this.resolveDamage(display, new Set()) : null);
    // "Required;Excluded": a weapon that requires Ground can't shoot up, one that requires Air
    // can't shoot down, and one that excludes Structure leaves buildings alone.
    const [required = '', excluded = ''] = (w.value(id, 'TargetFilters') ?? '').split(';').map((part) => part.split(','));
    return {
      id,
      range: w.number(id, 'Range', 5),
      minRange: w.number(id, 'MinimumRange'),
      period: w.number(id, 'Period', 1),
      damagePoint: w.number(id, 'DamagePoint'),
      missile: resolved?.missile ?? false,
      damage: resolved?.damage ?? { amount: 0, bonus: {}, splash: [] },
      melee: w.value(id, 'Options[Melee]') === '1',
      air: !required.includes('Ground') && !excluded.includes('Air'),
      ground: !required.includes('Air') && !excluded.includes('Ground'),
      structures: !excluded.includes('Structure'),
    };
  }

  /**
   * How a weapon's missile flies, from its launch effect's mover (MoverData): the fastest of its
   * motion phases (cells a second, Normal speed), and whether a phase throws it in an arc first
   * (the Brood Lord's broodling) or it is guided straight in (most of them: the Hydralisk's
   * needles at 40, the Roach's acid at 18.75, a Punisher round at 20). Null for an instant weapon.
   */
  missileFlight(id: string): { speed: number; lob: boolean } | null {
    const display = this.weapons.value(id, 'DisplayEffect');
    const launch = this.findLaunch(this.weaponEffect(id), new Set()) ?? (display ? this.findLaunch(display, new Set()) : null);
    if (!launch) return null;
    const e = this.effects;
    const ammo = e.value(launch, 'AmmoUnit');
    const link = e.array(launch, 'Movers')[0]?.field('Link');
    const fromAmmo = ammo ? (this.units.value(ammo, 'Mover') ?? (this.movers.has(ammo) ? ammo : undefined)) : undefined;
    const mover = [link, fromAmmo, 'MissileDefault'].find((m): m is string => !!m && this.movers.has(m));
    if (!mover) return null;
    let speed = 0;
    let lob = false;
    for (const phase of this.movers.array(mover, 'MotionPhases')) {
      const max = Number(phase.field('MaxSpeed') ?? phase.field('Speed') ?? 0);
      if (Number.isFinite(max)) speed = Math.max(speed, max);
      if (phase.field('Driver') === 'Throw') lob = true;
    }
    return speed > 0 ? { speed, lob } : null;
  }

  /** The missile launch an effect chain fires, if it fires one. */
  private findLaunch(id: string, seen: Set<string>): string | null {
    const e = this.effects;
    if (!id || seen.has(id) || !e.has(id)) return null;
    seen.add(id);
    switch (e.tag(id)) {
      case 'CEffectLaunchMissile':
        return id;
      case 'CEffectSet':
        for (const el of e.array(id, 'EffectArray')) {
          const r = this.findLaunch(el.getAttribute('value') ?? '', seen);
          if (r) return r;
        }
        return null;
      case 'CEffectSwitch':
        for (const c of [e.value(id, 'CaseDefault'), ...e.array(id, 'CaseArray').map((x) => x.field('Effect'))]) {
          const r = c ? this.findLaunch(c, seen) : null;
          if (r) return r;
        }
        return null;
      case 'CEffectCreatePersistent':
        // InitialEffect is one field, not an array: the newest layer's is the one.
        for (const c of [e.value(id, 'InitialEffect'), ...e.array(id, 'PeriodicEffectArray').map((el) => el.getAttribute('value'))]) {
          const r = c ? this.findLaunch(c, seen) : null;
          if (r) return r;
        }
        return null;
      default:
        return null;
    }
  }

  /** What a unit costs to make (UnitData): minerals, vespene, and the supply it takes up. */
  cost(id: string): { ore: number; gas: number; supply: number } {
    const u = this.units;
    return { ore: u.number(id, 'CostResource[Minerals]'), gas: u.number(id, 'CostResource[Vespene]'), supply: Math.max(0, -u.number(id, 'Food')) };
  }

  /** Seconds (Normal speed) a production building takes to train a unit, from its train ability (AbilData), or null if nothing trains it. */
  trainTime(id: string): number | null {
    const a = this.abilities;
    for (const ab of a.ids()) {
      if (a.tag(ab) !== 'CAbilTrain') continue;
      for (const info of a.array(ab, 'InfoArray')) {
        const unit = info.field('Unit');
        const time = info.field('Time');
        if (unit === id && time) return Number(time);
      }
    }
    return null;
  }

  /** Seconds (Normal speed) a worker takes to build a structure, from its build ability (AbilData), or null. */
  buildTime(id: string): number | null {
    const a = this.abilities;
    for (const ab of a.ids()) {
      if (a.tag(ab) !== 'CAbilBuild') continue;
      for (const info of a.array(ab, 'InfoArray')) {
        const time = info.field('Time');
        if (info.field('Unit') === id && time) return Number(time);
      }
    }
    return null;
  }

  /** The effect a weapon fires (its own id when it doesn't name one). */
  weaponEffect(id: string): string {
    return this.weapons.value(id, 'Effect') || id;
  }

  /** Seconds (Normal speed) a timed-life effect lasts: a Broodling's 5. */
  duration(effect: string, fallback: number): number {
    return this.effects.number(effect, 'Duration', fallback);
  }

  /** Whether an effect only ever searches for buildings ("Ground,Structure;..."). */
  private structureOnly(id: string): boolean {
    const filters = this.effects.value(id, 'SearchFilters');
    return !!filters && filters.split(';')[0].split(',').includes('Structure');
  }

  /** Follows an effect chain (sets, switches, missiles, area searches) to the damage it deals. */
  private resolveDamage(id: string, seen: Set<string>): { damage: DamageStats; missile: boolean } | null {
    const e = this.effects;
    if (seen.has(id) || !e.has(id)) return null;
    seen.add(id);
    switch (e.tag(id)) {
      case 'CEffectDamage': {
        const bonus: Record<string, number> = {};
        for (const b of e.array(id, 'AttributeBonus')) {
          const v = Number(b.getAttribute('value'));
          if (v) bonus[b.getAttribute('index')!] = v;
        }
        const splash = e.array(id, 'AreaArray').map((a) => ({
          radius: Number(a.field('Radius') ?? 0),
          fraction: Number(a.field('Fraction') ?? 1),
          arc: Number(a.field('Arc') ?? 360),
        }));
        const death = e.value(id, 'Death') as DeathType | undefined;
        const damage: DamageStats = { amount: e.number(id, 'Amount'), bonus, splash };
        if (death && death !== 'Normal') damage.death = death;
        const armor = e.number(id, 'ArmorReduction', 0);
        if (armor !== 1) damage.armor = armor;
        return { damage, missile: false };
      }
      case 'CEffectLaunchMissile': {
        const impact = e.value(id, 'ImpactEffect');
        const r = impact ? this.resolveDamage(impact, seen) : null;
        return r && { ...r, missile: true };
      }
      case 'CEffectCreatePersistent': {
        // A burst over time: each period applies the periodic effect again. Unless each period
        // is somewhere else (offsets marching out from it: the Hellion's flame, 24 searches down
        // its line): then each finds what's there, once, and the target takes the initial effect.
        const count = Math.max(1, e.number(id, 'PeriodCount', 1));
        const offsets = new Set(e.array(id, 'PeriodicOffsetArray').map((o) => o.getAttribute('value')));
        const initial = e.value(id, 'InitialEffect');
        if (offsets.size > 1) return (initial && this.resolveDamage(initial, seen)) || null;
        for (const el of e.array(id, 'PeriodicEffectArray')) {
          const r = this.resolveDamage(el.getAttribute('value') ?? '', seen);
          if (r) return { ...r, damage: { ...r.damage, hits: (r.damage.hits ?? 1) * count } };
        }
        return null;
      }
      case 'CEffectSet': {
        // The damage the set deals its target directly comes first (the Firebat's set also
        // sweeps its flame along a line, which is splash, not more damage to the target).
        // Damage that only searches out buildings is their number, not the unit damage.
        const children = e.array(id, 'EffectArray').map((el) => el.getAttribute('value') ?? '');
        const damages = children.filter((c) => e.tag(c) === 'CEffectDamage');
        const direct = damages.find((c) => !this.structureOnly(c));
        const vsStructure = damages.find((c) => this.structureOnly(c));
        let found: { damage: DamageStats; missile: boolean } | null = null;
        for (const c of direct ? [direct, ...children] : children) {
          if (c === vsStructure && direct) continue;
          found = this.resolveDamage(c, seen);
          if (found) break;
        }
        if (!found) return null;
        const damage = { ...found.damage };
        if (vsStructure && direct) damage.structure = e.number(vsStructure, 'Amount');
        // A search for one more target nearby, carrying the attack on: a bounce.
        for (const c of children) {
          if (e.tag(c) !== 'CEffectEnumArea' || e.number(c, 'MaxCount') !== 1) continue;
          const area = e.array(c, 'AreaArray')[0];
          const next = area ? this.resolveDamage(area.field('Effect') ?? '', seen) : null;
          if (next) damage.bounce = { radius: Number(area.field('Radius') ?? 0), damage: next.damage };
        }
        return { ...found, damage };
      }
      case 'CEffectSwitch': {
        const cases = [e.value(id, 'CaseDefault'), ...e.array(id, 'CaseArray').map((c) => c.field('Effect'))];
        for (const c of cases) {
          const r = c ? this.resolveDamage(c, seen) : null;
          if (r) return r;
        }
        return null;
      }
      case 'CEffectEnumArea':
        for (const a of e.array(id, 'AreaArray')) {
          const r = this.resolveDamage(a.field('Effect') ?? '', seen);
          if (r) return r;
        }
        return null;
      default:
        return null;
    }
  }

  /**
   * A leap at what it's attacking (Heart of the Swarm's Raptor: HotSRaptorCharge, cast on its own
   * as it attacks): Normal seconds between leaps (the ability's cooldown), and how its mover flies
   * it: cells a Normal second, and the arc's clearance (cells).
   */
  leap(ability: string, mover: string): { cooldown: number; speed: number; clearance: number } {
    let speed = 0;
    let clearance = 0;
    for (const phase of this.movers.array(mover, 'MotionPhases')) {
      speed = Math.max(speed, Number(phase.field('MaxSpeed') ?? 0) || 0);
      clearance = Math.max(clearance, Number(phase.field('AdaptableParabolaClearance')?.split(',')[0] ?? 0) || 0);
    }
    return { cooldown: this.abilities.number(ability, 'Cost/Cooldown', 2, 'TimeUse'), speed: speed || 10, clearance: clearance || 1 };
  }

  /** The Battlecruiser's Yamato Cannon: a launched missile carrying one huge damage effect. */
  keelGun(): KeelGunStats {
    const a = this.abilities;
    return {
      damage: this.resolveDamage('Yamato', new Set())?.damage ?? { amount: 240, bonus: {}, splash: [] },
      prep: a.number('Yamato', 'PrepTime', 3),
      cooldown: a.number('Yamato', 'Cooldown', 100, 'TimeUse'),
    };
  }

  /**
   * The speed (cells per Normal second, in the model's own units) at which a unit's walk
   * animation plays at its natural rate; the game scales the animation by speed over this.
   * 0 when the actor doesn't say.
   */
  walkAnimMoveSpeed(actor: string): number {
    return this.actors.has(actor) ? this.actors.number(actor, 'WalkAnimMoveSpeed', 0) : 0;
  }

  /** The scale the game draws a unit's model at: ModelData's ScaleMax for its actor's model (the Reaper's 0.8); 1 if unset. */
  modelScale(id: string): number {
    const model = (this.actors.value(id, 'Model') ?? id).replace(/##unitName##/g, id);
    const z = Number(this.models.value(model, 'ScaleMax')?.split(',')[2]);
    return z > 0 ? z : 1;
  }

  /**
   * A transformation's timing (a CAbilMorph: the Viking's AssaultMode and FighterMode), Normal
   * seconds: the whole of it (its Actor section), and when the body moves within it (its Mover
   * section: a flyer coming down, or going up).
   */
  morphTiming(ability: string): { total: number; moveDelay: number; move: number } {
    const a = this.abilities;
    const at = (section: string, which: string, fallback: number) => a.number(ability, `InfoArray/SectionArray[${section}]/DurationArray[${which}]`, fallback);
    return { total: at('Actor', 'Delay', 0) + at('Actor', 'Duration', 2.34), moveDelay: at('Mover', 'Delay', 0), move: at('Mover', 'Duration', 1) };
  }

  /**
   * A transport's hold (a CAbilTransport: the Medivac's): its cargo space, Normal seconds between
   * units unloaded, whether its cargo dies with it, and how far "load all" reaches (cells).
   */
  transport(ability = 'MedivacTransport'): { space: number; unloadPeriod: number; cargoDeath: boolean; searchRadius: number } {
    const a = this.abilities;
    return {
      space: a.number(ability, 'TotalCargoSpace', 8),
      unloadPeriod: a.number(ability, 'UnloadPeriod', 1),
      cargoDeath: a.number(ability, 'Flags[CargoDeath]', 1) === 1,
      searchRadius: a.number(ability, 'SearchRadius', 4),
    };
  }

  /** How much of a transport's hold a unit takes (UnitData's CargoSize); 0 if it can't be carried. */
  cargoSize(id: string): number {
    return this.units.number(id, 'CargoSize', 0);
  }

  /** Seconds (Normal speed) to transform into Siege Mode: the morph's delay plus its animation. */
  braceTime(): number {
    const a = this.abilities;
    return a.number('SiegeMode', 'InfoArray/SectionArray[Actor]/DurationArray[Delay]', 0.5) + a.number('SiegeMode', 'InfoArray/SectionArray[Actor]/DurationArray[Duration]', 3.5417);
  }

  /** The Stimpack: the Marine's, or the Marauder's (`StimpackMarauder`, which costs 20 life). */
  jolt(id = 'Stimpack'): JoltStats {
    const b = this.behaviors;
    const a = this.abilities;
    return {
      duration: b.number(id, 'Duration', 15),
      moveSpeed: b.number(id, 'Modification', 1.5, 'MoveSpeedMultiplier'),
      attackSpeed: b.number(id, 'Modification', 1.5, 'AttackSpeedMultiplier'),
      lifeCost: a.number(id, 'Cost/Vital[Life]', 10),
      cooldown: a.number('Stimpack', 'Cost/Cooldown', 1, 'TimeUse'),
    };
  }

  /**
   * The Queen of Blades' Omega Storm on Char: damage every period (Normal seconds) to everything
   * within the radius (cells), for `count` periods.
   */
  blightStorm(): { damage: DamageStats; radius: number; period: number; count: number } {
    const e = this.effects;
    return {
      damage: this.resolveDamage('OmegaStormDamage', new Set())?.damage ?? { amount: 12, bonus: { Structure: 9 }, splash: [] },
      radius: Number(e.array('OmegaStormSearchArea', 'AreaArray')[0]?.field('Radius') ?? 2.5),
      period: e.number('OmegaStormCreatePersistent', 'PeriodicPeriodArray', 0.5712),
      count: e.number('OmegaStormCreatePersistent', 'PeriodCount', 12),
    };
  }

  /** Implosion: seconds (Normal) until the target is crushed. */
  crush(): number {
    return this.effects.number('ImplosionCreatePersistent', 'PeriodicPeriodArray', 3.125);
  }

  /**
   * The artifact's Energy Nova: its damage, the ring's reach in cells (the search grows by its
   * radius bonus every period), and the seconds (Normal) it takes to roll out.
   */
  aurora(): { amount: number; cells: number; seconds: number } {
    const e = this.effects;
    const area = e.array('EnergyNovaSearch', 'AreaArray')[0];
    const count = e.number('EnergyNovaPersistent', 'PeriodCount', 19);
    const period = e.number('EnergyNovaPersistent', 'PeriodicPeriodArray', 0.0625);
    return {
      amount: e.number('EnergyNovaDamage', 'Amount', 550),
      cells: Number(area?.field('Radius') ?? 1) + Number(area?.field('RadiusBonus') ?? 2) * count,
      seconds: count * period,
    };
  }

  /**
   * The Orbital Command's calldowns: its energy (start, max, regeneration per Normal second),
   * the Scanner Sweep (cost, reveal radius in cells, Normal seconds) and the MULE (cost, timed
   * life in Normal seconds).
   */
  orbital(): {
    energy: { start: number; max: number; regen: number };
    skyscan: { cost: number; radius: number; duration: number };
    /** `delay`: Normal seconds from the call to the MULE stepping out of its pod (CalldownMULECreatePersistent's ExpireDelay). */
    mender: { cost: number; life: number; delay: number };
  } {
    const u = this.units;
    const a = this.abilities;
    const e = this.effects;
    return {
      energy: { start: u.number('OrbitalCommand', 'EnergyStart', 50), max: u.number('OrbitalCommand', 'EnergyMax', 200), regen: u.number('OrbitalCommand', 'EnergyRegenRate', 0.5625) },
      skyscan: { cost: a.number('ScannerSweep', 'Cost/Vital[Energy]', 50), radius: e.number('ScannerSweep', 'RevealRadius', 13), duration: e.number('ScannerSweep', 'ExpireDelay', 12.2775) },
      mender: {
        cost: a.number('CalldownMULE', 'Cost/Vital[Energy]', 50),
        life: this.behaviors.number('MULETimedLife', 'Duration', 64),
        delay: e.number('CalldownMULECreatePersistent', 'ExpireDelay', 4),
      },
    };
  }

  /** Concussive Shells: the Punisher grenade's slow (behavior "Slow"). Duration in Normal seconds. */
  stagger(): { factor: number; duration: number } {
    const b = this.behaviors;
    return { factor: b.number('Slow', 'Modification', 0.5, 'MoveSpeedMultiplier'), duration: b.number('Slow', 'Duration', 1.5) };
  }
}
