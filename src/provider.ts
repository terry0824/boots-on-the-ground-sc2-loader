// The loader's content, by the game's names (src/content/assetnames.ts): each answered from StarCraft II's
// files, by the paths the manifest gives them.

import type { ContentProvider } from '../../../src/content/provider.ts';
import type { PortraitName, TextureName } from '../../../src/content/assetnames.ts';
import { fetchBuffer, fetchFile, hasMediaSource, setChannelRange, setMediaSource } from '../../../src/engine/assets.ts';
import { setAudioDecoder } from '../../../src/engine/audio.ts';
import { ddsChannelRange, loadTexture, sc2Url } from './textures.ts';
import { decodeImaAdpcm } from './formats/wav.ts';
import { loadModel } from './models.ts';
import { parseM3 } from './formats/m3.ts';
import { GameData } from './data.ts';
import { byOwnIds, NAMES, sc2Id } from './aliases.ts';
import { loadBattlefield } from './battlefield.ts';
import { DoodadCatalog, placeDoodads } from './doodads.ts';
import { lightFor, tilesetEnvironment } from './environment.ts';
import { setTextOverlay } from '../../../src/content/names.ts';
import { iconUrl } from './icons.ts';
import { overlay } from './text.ts';
import { AllInScript } from './missions/allin.ts';
import { MISSIONS } from './missions/defs.ts';
import { EvacuationScript } from './missions/evacuation.ts';
import { FrontlineScript } from './missions/frontline.ts';
import { LiberationScript } from './missions/liberation.ts';
import { OutbreakScript } from './missions/outbreak.ts';
import { PracticeScript } from './missions/practice.ts';
import { Story } from './missions/story.ts';
import { TideScript } from './missions/tide.ts';
import { TrainingScript } from './missions/training.ts';
import { UnleashedScript } from './missions/unleashed.ts';
import { ANIMATIONS, MODELS, MUSIC, SOUNDS, TEXTURES, UNLEASHED_MODELS, UNLEASHED_SOUNDS } from './manifest.ts';

const MODEL_PATHS: Record<string, string> = { ...MODELS, ...UNLEASHED_MODELS };
const SOUND_PATHS: Record<string, readonly string[]> = { ...SOUNDS, ...UNLEASHED_SOUNDS };

/** The game's named textures: Mar Sara's ground tiles for the procedural battlefield, and the effects'. */
const TEXTURE_PATHS: Record<TextureName, string> = {
  'ground/sandA': TEXTURES.ground[0],
  'ground/sandB': TEXTURES.ground[1],
  'ground/rock': TEXTURES.ground[3],
  'ground/gravel': TEXTURES.ground[7],
  'ground/plating': TEXTURES.ground[6],
  muzzleFlash: TEXTURES.muzzleFlash,
  laserBolt: TEXTURES.laserBolt,
};

// What the engine asks of StarCraft II's files: their textures' channel ranges, their IMA ADPCM sounds,
// and the music's addresses (where the page doesn't hand out its own: src/files.ts).
setChannelRange(ddsChannelRange);
setAudioDecoder(decodeImaAdpcm);
if (!hasMediaSource()) setMediaSource(sc2Url);
// StarCraft II's names and story over the game's own text.
setTextOverlay(overlay);
// A profile saved by an earlier version, up to date before the game reads it.
upgradeProfile();

/**
 * Earlier versions named the player's classes, the Armory's upgrades and some objectives as StarCraft II does
 * (a profile deploying as a "marine" with "combat-shield"): the game's names for them now (the game's
 * profile.ts keeps it under these keys).
 */
function upgradeProfile() {
  try {
    for (const key of ['botg.profile.v1', 'botg.profile.test']) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const p = JSON.parse(raw) as { loadout?: unknown; upgrades?: Record<string, number>; missions?: Record<string, { bonus?: string[] }> };
      let changed = false;
      for (const record of Object.values(p.missions ?? {})) {
        if (!record.bonus?.some((id) => NAMES[id])) continue;
        record.bonus = record.bonus.map((id) => NAMES[id] ?? id);
        changed = true;
      }
      if (typeof p.loadout === 'string' && NAMES[p.loadout]) {
        p.loadout = NAMES[p.loadout];
        changed = true;
      }
      for (const [id, level] of Object.entries(p.upgrades ?? {})) {
        const now = NAMES[id];
        if (!now || !p.upgrades) continue;
        delete p.upgrades[id];
        p.upgrades[now] = Math.max(level, p.upgrades[now] ?? 0);
        changed = true;
      }
      if (changed) localStorage.setItem(key, JSON.stringify(p));
    }
  } catch {
    // Storage blocked, or a profile that doesn't read: the game starts afresh, as it would.
  }
}

/** The radio's speakers, by the StarCraft II portrait models that play them. */
const PORTRAITS: Record<PortraitName, string> = {
  trooper: 'Assets/Portraits/Terran/Marine3Portrait/Marine3Portrait.m3',
  rookie: 'Assets/Portraits/Terran/Marine7Portrait/Marine7Portrait.m3',
  trooper2: 'Assets/Portraits/Terran/Marine1Portrait/Marine1Portrait.m3',
  grenadier: 'Assets/Portraits/Terran/MarauderPortrait/MarauderPortrait.m3',
  burner: 'Assets/Portraits/Terran/FirebatPortrait/FirebatPortrait.m3',
  medic: 'Assets/Portraits/Terran/MedicPortrait/MedicPortrait.m3',
  seer: 'Assets/Portraits/Terran/GhostPortrait/GhostPortrait.m3',
  vaulter: 'Assets/Portraits/Terran/ReaperPortrait/ReaperPortrait.m3',
  rigger: 'Assets/Portraits/Terran/SCVPortrait/SCVPortrait.m3',
  pilot: 'Assets/Portraits/Terran/BattlecruiserPortrait/BattlecruiserPortrait.m3',
  tank: 'Assets/Portraits/Terran/SiegeTankPortrait/SiegeTankPortrait.m3',
  dispatch: 'Assets/Portraits/Terran/AdjutantPortrait/AdjutantPortrait.m3',
  civilian: 'Assets/Portraits/Terran/MaleCivilian1Portrait/MaleCivilian1Portrait.m3',
  scientist: 'Assets/Portraits/Terran/ScientistFemalePortrait/ScientistFemalePortrait.m3',
  directorate: 'Assets/Portraits/Terran/DominionOfficer1Portrait/DominionOfficer1Portrait.m3',
  ostrander: 'Assets/Portraits/Terran/MengskHologramPortrait/MengskHologramPortrait.m3',
  ashby: 'Assets/Portraits/Terran/HornerPortrait/HornerPortrait.m3',
  harlan: 'Assets/Portraits/Terran/RaynorMarinePortrait/RaynorMarinePortrait.m3',
  tolliver: 'Assets/Portraits/Terran/TychusPortrait/TychusPortrait.m3',
  calyx: 'Assets/Portraits/Zerg/KerriganPortrait/KerriganPortrait.m3',
};

/** The game data, once the game has asked for the stats: the battlefield reads its art catalogs. */
let data: Promise<GameData> | null = null;
/** The same, once it's read (the lights are asked for without waiting). */
let lastData: GameData | null = null;
const read = (opts: { swarm?: boolean } = {}) => GameData.load(async (p) => (await fetchFile('/casc/' + p))?.text() ?? null, opts).then((d) => (lastData = d));
const art = () => (data ??= read());

export const provider: ContentProvider = {
  // GameData answers by StarCraft II's ids; the game asks by its own.
  stats: async ({ swarm }) => byOwnIds(await (data = read({ swarm }))),

  async model(name) {
    const path = MODEL_PATHS[name];
    return path ? loadModel(path) : null;
  },

  async animation(name) {
    const path = ANIMATIONS[name];
    const buf = path ? await fetchBuffer(sc2Url(path)) : null;
    return buf ? parseM3(buf) : null;
  },

  texture: (name) => loadTexture(TEXTURE_PATHS[name], true),

  sounds: (name) => (SOUND_PATHS[name] ?? []).map(sc2Url),

  music: (name) => MUSIC[name] ?? null,

  icon: iconUrl,

  portrait: (name) => loadModel(PORTRAITS[name]),

  battlefield: async (name, opts) => loadBattlefield(await art(), name, opts),

  // A map's tileset, or the game's own world for its procedural battlefield (Calder: Mar Sara's).
  environment: async (tileset) => tilesetEnvironment(await art(), sc2Id(tileset)),

  light: (id) => {
    const d = lastData;
    return d && d.lights.has(id) ? lightFor(d, id) : null;
  },

  async doodads(scene, battlefield, buildingScale) {
    const stats = await placeDoodads(scene, battlefield.terrain, battlefield.map.placements, new DoodadCatalog(await art()), buildingScale);
    console.info(`${battlefield.map.name}: ${stats.placed} doodads (${stats.models} models, ${stats.emitters.length} with emitters), ${stats.skipped} skipped, missing:`, stats.missing);
    return stats.emitters;
  },

  missions: () => MISSIONS,

  script(def, { mission, host, battlefield, data }) {
    if (def.kind === 'training') return new TrainingScript(mission, host);
    if (def.kind === 'practice') return new PracticeScript(mission, host);
    if (!battlefield) return null;
    const { map, terrain } = battlefield;
    if (def.id === 'liberation-day') return new LiberationScript(mission, host, map, terrain);
    if (def.kind === 'frontline') return new FrontlineScript(mission, host, map, terrain);
    if (def.id === 'evacuation') return new EvacuationScript(mission, host, map, terrain);
    if (def.id === 'all-in') return new AllInScript(mission, host, map, terrain, data);
    if (def.id === 'outbreak') return new OutbreakScript(mission, host, map, terrain);
    if (def.id === 'the-tide') return new TideScript(mission, host, map, terrain, data);
    if (def.id === 'the-tide-unleashed') return new UnleashedScript(mission, host, map, terrain, data);
    return null;
  },

  story: (def, mission, echo, state) => new Story(def.id, mission, echo, state),
};
