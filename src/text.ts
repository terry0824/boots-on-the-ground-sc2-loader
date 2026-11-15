// The loader's text: StarCraft II's names and story over the game's own (src/content/names.ts
// TextOverlay). Whole strings the game writes go back to StarCraft II's word for word (exact); within
// composed text, the game's words and phrases go back to StarCraft II's (words); Hold the Line's
// briefing is StarCraft II's own (missions). The loader's own missions are written in StarCraft II's
// world already and pass through as they are.

import type { TextOverlay } from '../../../src/content/names.ts';
import { TERMS } from './terms.ts';

/** The game's whole strings and StarCraft II's, as the game had them before its text was its own. */
const EXACT: Record<string, string> = {
 "Long Sights": "Hi-Sec Auto Tracking",
 "Reinforced Frames": "Neosteel Armor",
 "Howitzer cannons: +2 (+1 armored) in Drive Mode, +4 (+1 armored) sieged, per level.": "Siege Tank cannons: +2 (+1 armored) in Tank Mode, +4 (+1 armored) sieged, per level.",
 "A shield on every Trooper: +10 life.": "A shield on every Marine: +10 life.",
 "Arm Shield": "Combat Shield",
 "Hardsuit armor plating: +1 armor per level for Troopers.": "CMC armor plating: +1 armor per level for Marines.",
 "RK-4 rounds with denser slugs: +1 damage per attack per level.": "C-14 rounds with denser slugs: +1 damage per attack per level.",
 "Left button directs the batteries · Q Keel Gun · T Snap Jump · W/S throttle · A/D turn · Space/C altitude": "Left button directs the batteries · Q Yamato · T Tactical Jump · W/S throttle · A/D turn · Space/C altitude",
 "Snap Jump": "Tactical Jump",
 "Warship": "Battlecruiser",
 "Keel Gun": "Yamato Cannon",
 "Lodestar": "Hyperion",
 "Snap Jump…": "Tactical Jump…",
 "SKYSCAN": "SCANNER SWEEP",
 "A Howitzer is on its way to your mark": "A Siege Tank is on its way to your mark",
 "DUSTOFF INBOUND": "MEDIVAC INBOUND",
 "A Howitzer dropped where you mark; take it with F": "A Siege Tank dropped where you mark; take it with F",
 "Dustoff: Howitzer": "Medivac: Siege Tank",
 "Four Troopers dropped where you mark; they follow you": "Four Marines dropped where you mark; they follow you",
 "Dustoff: Fireteam": "Medivac: Fireteam",
 "Mender": "MULE",
 "Reveals the area: every enemy marked, burrowed Crawl flushed out": "Reveals the area: every enemy marked, burrowed Zerg flushed out",
 "Skyscan": "Scanner Sweep",
 "Warhead Strike (ultimate)": "Tactical Nuke (ultimate)",
 "Shroud (energy)": "Cloak (energy)",
 "LR-6 rifle": "C-10 rifle",
 "LR-6 long rifle with a scope, Personal Shroud, and the Warhead Strike.": "C-10 canister rifle with a scope, Personal Cloaking, and the Tactical Nuke.",
 "Seer": "Ghost",
 "PK-2 pistols": "P-38 pistols",
 "Vaulter": "Reaper",
 "Jolt": "Stimpack",
 "Burner": "Firebat",
 "Breaker grenade": "Punisher grenade",
 "Breaker grenades, double damage against armor; every hit slows. 125 life under thick plate.": "Punisher grenades, double damage against armor; every hit slows. 125 life under thick plate.",
 "Grenadier": "Marauder",
 "RK-4 burst": "C-14 burst",
 "Trooper": "Marine",
 "Drive Mode": "Tank Mode",
 "Braced Mode": "Siege Mode",
 "Howitzer": "Siege Tank",
 "Scuttle Mines": "Spider Mines",
 "Scuttle Mine": "Spider Mine",
 "Holdout": "Raider",
 "HOLDFAST": "COMMAND CENTER",
 "Holdfast destroyed": "Command Center destroyed",
 "redeploy a Trooper at the Barracks": "redeploy a Marine at the Barracks",
 "SCORIA IS FREE": "CHAR IS FREE",
 "Aboard the Dustoff": "Aboard the Medivac",
 "LODESTAR": "HYPERION",
 "Snap Jump to your mark: its batteries on everything there": "Tactical Jump to your mark: its batteries on everything there",
 "LODESTAR INBOUND": "HYPERION INBOUND",
 "KEEL GUN": "YAMATO CANNON",
 "WARHEAD INBOUND": "NUCLEAR LAUNCH DETECTED",
 "WARHEAD": "NUKE",
 "Storehouse": "Supply Depot",
 "Holdfast": "Command Center",
 "Tusker": "Ultralisk",
 "Shellback": "Roach",
 "Quillback": "Hydralisk",
 "Hound": "Zergling",
 "The line held. Calder stands.": "The line held. Mar Sara stands.",
 " — TUSKER DETECTED": " — ULTRALISK DETECTED",
 "The Crawl is coming up the ramps. Keep it off the Holdfast.": "The swarm is coming. Protect the Command Center.",
 "The Holdfast has fallen.": "The Command Center has fallen.",
 "Holdfast above half health": "Command Center above half health",
 "The Holdfast must survive": "The Command Center must survive",
 "Calder outskirts": "Mar Sara outskirts",
 "Dustoff": "Medivac",
 "Dustoffs fly in, take its soldiers aboard and set them down at its fallback": "Medivacs fly in, take its soldiers aboard and set them down at its fallback",
 "<div class=\"tb-q idle\"><span>No Riggers out</span></div>": "<div class=\"tb-q idle\"><span>No SCVs out</span></div>",
 "Airfield": "Starport",
 "Motor Pool": "Factory",
 "Workshop": "Engineering Bay",
 "Flak Tower": "Missile Turret",
 "Not enough ore": "Not enough minerals",
 "Holdfast left at the end": "Command Center left at the end",
 "Big Crawl brought down": "Big Zerg brought down",
 "Crawl to army, second half": "Swarm to army, second half",
 "Nightjars": "Banshees",
 "Jackknives": "Vikings",
 "Bulwark": "Thor",
 "Torchrunners": "Hellions",
 "Seers": "Ghosts",
 "Burners": "Firebats",
 "Grenadiers": "Marauders",
 "Troopers": "Marines",
 "No Troopers near you": "No Marines near you",
 "[E] Drive Mode": "[E] Tank Mode",
 "[E] Braced Mode": "[E] Siege Mode",
 "Anvil Shock Cannon": "Crucio Shock Cannon",
 "Howitzer · unsieging": "Siege Tank · unsieging",
 "Howitzer · Braced Mode": "Siege Tank · Siege Mode",
 "Howitzer · sieging up": "Siege Tank · sieging up",
 "Howitzer · Drive Mode": "Siege Tank · Tank Mode",
 "Lance Storm": "Javelin Storm",
 "Volley Lock": "Multi-Lock",
 "Scatter Missiles": "Ripwave Missiles",
 "Wildfire Run": "Pre-Igniter Run",
 "Triage": "Restoration",
 "Stagger Barrage": "Concussive Barrage",
 "Super Jolt": "Super Stim",
 "Warhead Strike": "Tactical Nuke",
 "Behemoth": "Odin",
 "Coyote": "Vulture",
 "Picket": "Goliath",
 "Frigate": "Valkyrie",
 "Swift": "Wraith",
 "Nightjar": "Banshee",
 "Jackknife · Assault Mode": "Viking · Assault Mode",
 "Jackknife · Fighter Mode": "Viking · Fighter Mode",
 "Torchrunner": "Hellion",
 "Kill 120 of the Crawl yourself": "Kill 120 Zerg yourself",
 "RK-4 coil rifle and the Jolt. The backbone of every militia line.": "C-14 Gauss rifle and the Stimpack. The backbone of every Terran army.",
 "Kiln flamethrowers burn everything in front of you. Armored, slow to fall, short reach. Jolts as a Trooper does.": "Perdition flamethrowers burn everything in front of you. Armored, slow to fall, short reach. Stims as Brood War's Firebats did."
};

/** Phrases within composed text (before the single words). */
const PHRASES: [own: string, sc2: string][] = [
 [
  "Riggers patching up the defenses",
  "SCVs repairing the defenses"
 ],
 [
  "The militia's own upgrades, each level a fixed step.",
  "StarCraft II's own upgrades with their real numbers."
 ],
 [
  "the militia's upgrades",
  "StarCraft II's upgrades"
 ],
 [
  "capped at the usual",
  "capped at StarCraft II's"
 ],
 [
  "the board’s keys",
  "SC2’s keys"
 ],
 [
  "Game data: the stats table…",
  "Game data: UnitData, WeaponData, EffectData…"
 ],
 [
  "Endless waves at the colony base",
  "Endless waves on Zero Hour"
 ],
 [
  "The Crawl is coming up the ramps. Keep it off the Holdfast.",
  "The swarm is coming. Protect the Command Center."
 ]
];

/**
 * The game's ids where they reach the screen as they are (the kill feed's, the command view's "2 howitzerMobiles",
 * a big kill's "Brought down a tusker"), and StarCraft II's as the game had them: where an id is one of the
 * game's words, the words below answer it.
 */
const RAW_IDS: [own: string, sc2: string][] = [
  ["tusker", "ultralisk"], ["sower", "brood lord"], ["lantern", "overlord"], ["harlan", "raynor"], ["harlans", "raynors"], ["seer", "ghost"], ["seers", "ghosts"],
  ["HowitzerBraced", "SiegeTankSieged"], ["HowitzerBraceds", "SiegeTankSiegeds"],
  ["howitzerMobile", "siegeTankMobile"], ["howitzerMobiles", "siegeTankMobiles"], ["ScuttleMine", "SpiderMine"],
  ["ScuttleMines", "SpiderMines"], ["scuttleMine", "spiderMine"], ["scuttleMines", "spiderMines"],
  ["ColonistHauler", "ColonistTransport"], ["ColonistHaulers", "ColonistTransports"],
  ["colonistHauler", "colonistTransport"], ["colonistHaulers", "colonistTransports"],
  ["JackknifeFighter", "VikingFighter"], ["JackknifeFighters", "VikingFighters"],
  ["JackknifeAssault", "VikingAssault"], ["JackknifeAssaults", "VikingAssaults"],
  ["jackknifeFighter", "vikingFighter"], ["jackknifeFighters", "vikingFighters"],
  ["jackknifeAssault", "vikingAssault"], ["jackknifeAssaults", "vikingAssaults"],
  ["TurnedColonist", "InfestedCivilian"], ["TurnedColonists", "InfestedCivilians"],
  ["TurnedTrooper", "InfestedTerran"], ["TurnedTroopers", "InfestedTerrans"], ["OvergrownHut", "InfestableHut"],
  ["OvergrownHuts", "InfestableHuts"], ["OvergrownDome", "InfestableBiodome"],
  ["OvergrownDomes", "InfestableBiodomes"], ["FlakTower", "MissileTurret"], ["FlakTowers", "MissileTurrets"],
  ["flakTower", "missileTurret"], ["flakTowers", "missileTurrets"], ["motorPool", "factory"],
  ["ReactorHall", "FusionCore"], ["ReactorHalls", "FusionCores"], ["reactorHall", "fusionCore"],
  ["reactorHalls", "fusionCores"], ["HiringHall", "MercCompound"], ["HiringHalls", "MercCompounds"],
  ["hiringHall", "mercCompound"], ["hiringHalls", "mercCompounds"],
  ["DirectorateBillboard", "MengskHologramBillboard"], ["DirectorateBillboards", "MengskHologramBillboards"],
  ["DefenseWall", "DefenseWallE"], ["DefenseWalls", "DefenseWallEs"], ["Howitzer Braced", "Siege Tank Sieged"],
];

/** Each of the game's words, its capitals and (where the term says) its lower case: StarCraft II's. */
function words(): [string, string][] {
  const out: [string, string][] = [...PHRASES, ...RAW_IDS];
  for (const t of TERMS) {
    t.own.forEach((o, i) => out.push([o, t.sc2[i]]));
    t.own.forEach((o, i) => out.push([o.toUpperCase(), t.sc2[i].toUpperCase()]));
    if (t.lower) t.own.forEach((o, i) => out.push([o.toLowerCase(), t.sc2[i].toLowerCase()]));
  }
  return out;
}

export const overlay: TextOverlay = {
  exact: EXACT,
  words: words(),
  missions: {
 "hold-the-line": {
  "summary": "The original stand on the plateau: three ramps, seven waves.",
  "lines": [
   "Three ramps, three bunkers, one Command Center. Nothing gets up those ramps. Nothing."
  ]
 }
},
};
