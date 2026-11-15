// StarCraft II's names and the game's own for each, form for form (docs/original-assets/names.md has the
// glossary in both directions). The loader's text overlay (text.ts) turns the game's words back into
// StarCraft II's with it; the asset tools name cards by it.

export type TermGroup =
  | 'Sides'
  | 'Ships'
  | 'Characters'
  | 'Places'
  | 'Missions'
  | 'Infantry'
  | 'Vehicles'
  | 'Aircraft'
  | 'The swarm'
  | 'Structures'
  | 'Abilities'
  | 'Weapons'
  | 'Upgrades'
  | 'Resources'
  | 'Other';

/** One of StarCraft II's names and the game's own for it, form for form. */
export interface Term {
  group: TermGroup;
  /** StarCraft II's word as the game writes it, then its other forms (plural, possessive...). */
  sc2: readonly string[];
  /** The game's own, in the same order. */
  own: readonly string[];
  /**
   * Its lower-case forms too: a common noun ("minerals"), or a unit the command view names by its
   * kind ("2 marauders").
   */
  lower?: boolean;
  /**
   * Names straight from the data that reach the screen unspaced (the kill feed's "BroodLord", the
   * command view's "vikingFighter"): each is the singular, and with an s the plural.
   */
  ids?: readonly string[];
}

/**
 * Every StarCraft II name the player can read, and the game's own. A translation matches whole
 * words, longest first, as written, in capitals ("COMMAND CENTER"), and in lower case where
 * `lower` says so; a/an before it follows the new word.
 */
export const TERMS: readonly Term[] = [
  // The sides.
  { group: 'Sides', sc2: ['Terran', 'Terrans'], own: ['human', 'humans'] },
  // As "Zerg" is, one word for the whole of it and for any number of its creatures.
  { group: 'Sides', sc2: ['Zerg'], own: ['Crawl'] },
  // Capitalized only: "the swarm" stays an ordinary noun (the Crawl is one).
  { group: 'Sides', sc2: ['Swarm'], own: ['Crawl'] },
  { group: 'Sides', sc2: ['Terran Dominion', 'Dominion'], own: ['Directorate', 'Directorate'] },
  { group: 'Sides', sc2: ['Confederacy', 'Confederate'], own: ['old Union', 'Union'] },
  { group: 'Sides', sc2: ["Raynor's Raiders", 'Raiders', 'Raider'], own: ["Harlan's Holdouts", 'Holdouts', 'Holdout'] },
  { group: 'Sides', sc2: ["Xel'Naga"], own: ['Forebear'] },
  { group: 'Ships', sc2: ['Hyperion'], own: ['Lodestar'] },

  // The people, and the voices on the radio.
  { group: 'Characters', sc2: ['Jim Raynor', 'Raynor', 'Jimmy', 'Jim'], own: ['Wes Harlan', 'Harlan', 'Wes', 'Wes'], ids: ['Raynor01', 'raynor'] },
  { group: 'Characters', sc2: ['Matt Horner', 'Horner', 'Matt'], own: ['Nate Ashby', 'Ashby', 'Nate'] },
  { group: 'Characters', sc2: ['Tychus Findlay', 'Tychus', 'Findlay'], own: ['Duke Tolliver', 'Duke', 'Tolliver'] },
  { group: 'Characters', sc2: ['Sarah Kerrigan', 'Kerrigan'], own: ['Calyx', 'Calyx'], ids: ['KerriganChar'] },
  { group: 'Characters', sc2: ['Queen of Blades', "Queen of Blades'"], own: ['Voice of the Crawl', "Voice of the Crawl's"] },
  { group: 'Characters', sc2: ['Arcturus Mengsk', 'Mengsk'], own: ['Aurel Ostrander', 'Ostrander'] },
  { group: 'Characters', sc2: ['Ariel Hanson', 'Hanson'], own: ['Miriam Weller', 'Weller'] },
  { group: 'Characters', sc2: ['Adjutant'], own: ['Dispatch'] },

  // Worlds and places.
  { group: 'Places', sc2: ['Mar Sara'], own: ['Calder'] },
  { group: 'Places', sc2: ['Char'], own: ['Scoria'] },
  { group: 'Places', sc2: ['Agria'], own: ['Furrow'] },
  { group: 'Places', sc2: ['Meinhoff'], own: ['Fenmoor'] },
  { group: 'Places', sc2: ['Tarsonis'], own: ['Halcourt'] },
  { group: 'Places', sc2: ['Korhal'], own: ['Vantage'] },
  { group: 'Places', sc2: ['Riksville'], own: ['Saltwell'] },
  { group: 'Places', sc2: ['Ghost Town'], own: ['Dry Creek'] },
  // The frontier worlds ("this far out in the Fringe").
  { group: 'Places', sc2: ['Fringe'], own: ['Marches'] },

  // Mission titles that are StarCraft II's (the game's own, Hold the Line or The Tide, stay).
  { group: 'Missions', sc2: ['Boot Camp'], own: ['First Muster'] },
  { group: 'Missions', sc2: ['Liberation Day'], own: ['Saltwell Rising'] },
  { group: 'Missions', sc2: ['Zero Hour'], own: ['Last Lift'] },
  { group: 'Missions', sc2: ['The Evacuation'], own: ['The Causeway'] },
  { group: 'Missions', sc2: ['Outbreak'], own: ['Sundown'] },
  { group: 'Missions', sc2: ['All In'], own: ['All Hands'] },

  // The infantry (the Medic keeps its plain name).
  { group: 'Infantry', sc2: ['Marine', 'Marines'], own: ['Trooper', 'Troopers'], lower: true },
  { group: 'Infantry', sc2: ['Marauder', 'Marauders'], own: ['Grenadier', 'Grenadiers'], lower: true },
  { group: 'Infantry', sc2: ['Firebat', 'Firebats'], own: ['Burner', 'Burners'], lower: true },
  { group: 'Infantry', sc2: ['Reaper', 'Reapers'], own: ['Vaulter', 'Vaulters'], lower: true },
  // Its kind's raw name only, not "ghost" at large (a menu button's class is "ghost", and a ghost is a ghost).
  { group: 'Infantry', sc2: ['Ghost', 'Ghosts', 'Ghost-program'], own: ['Seer', 'Seers', 'Seer-program'], ids: ['ghost'] },
  { group: 'Infantry', sc2: ['SCV', 'SCVs'], own: ['Rigger', 'Riggers'], lower: true },
  { group: 'Infantry', sc2: ['MULE', 'MULEs'], own: ['Mender', 'Menders'], lower: true },

  // Ground vehicles.
  { group: 'Vehicles', sc2: ['Siege Tank', 'Siege Tanks'], own: ['Howitzer', 'Howitzers'], lower: true, ids: ['SiegeTank', 'SiegeTankSieged', 'siegeTank', 'siegeTankMobile'] },
  { group: 'Vehicles', sc2: ['Hellion', 'Hellions'], own: ['Torchrunner', 'Torchrunners'], lower: true },
  { group: 'Vehicles', sc2: ['Thor', 'Thors'], own: ['Bulwark', 'Bulwarks'], lower: true },
  { group: 'Vehicles', sc2: ['Odin'], own: ['Behemoth'], lower: true },
  { group: 'Vehicles', sc2: ['Goliath', 'Goliaths'], own: ['Picket', 'Pickets'], lower: true },
  { group: 'Vehicles', sc2: ['Vulture', 'Vultures'], own: ['Coyote', 'Coyotes'], lower: true },
  { group: 'Vehicles', sc2: ['Spider Mine', 'Spider Mines'], own: ['Scuttle Mine', 'Scuttle Mines'], lower: true, ids: ['SpiderMine', 'spiderMine'] },
  { group: 'Vehicles', sc2: ['Colonist Transport', 'Colonist Transports'], own: ['Colonist Hauler', 'Colonist Haulers'], ids: ['ColonistTransport', 'colonistTransport'] },

  // Aircraft.
  { group: 'Aircraft', sc2: ['Viking', 'Vikings'], own: ['Jackknife', 'Jackknives'], lower: true, ids: ['VikingFighter', 'VikingAssault', 'vikingFighter', 'vikingAssault'] },
  { group: 'Aircraft', sc2: ['Banshee', 'Banshees'], own: ['Nightjar', 'Nightjars'], lower: true },
  { group: 'Aircraft', sc2: ['Wraith', 'Wraiths'], own: ['Swift', 'Swifts'], lower: true },
  { group: 'Aircraft', sc2: ['Valkyrie', 'Valkyries'], own: ['Frigate', 'Frigates'], lower: true, ids: ['SJValkyrie'] },
  { group: 'Aircraft', sc2: ['Medivac', 'Medivacs'], own: ['Dustoff', 'Dustoffs'], lower: true },
  { group: 'Aircraft', sc2: ['Battlecruiser', 'Battlecruisers'], own: ['Warship', 'Warships'], lower: true },

  // The Crawl's creatures.
  { group: 'The swarm', sc2: ['Zergling', 'Zerglings'], own: ['Hound', 'Hounds'] },
  { group: 'The swarm', sc2: ['Raptor', 'Raptors'], own: ['Leaper', 'Leapers'], ids: ['HotSRaptor'] },
  { group: 'The swarm', sc2: ['Baneling', 'Banelings'], own: ['Blister', 'Blisters'] },
  { group: 'The swarm', sc2: ['Roach', 'Roaches'], own: ['Shellback', 'Shellbacks'] },
  { group: 'The swarm', sc2: ['Hydralisk', 'Hydralisks'], own: ['Quillback', 'Quillbacks'] },
  { group: 'The swarm', sc2: ['Mutalisk', 'Mutalisks'], own: ['Kite', 'Kites'] },
  { group: 'The swarm', sc2: ['Corruptor', 'Corruptors'], own: ['Bilewing', 'Bilewings'] },
  { group: 'The swarm', sc2: ['Overlord', 'Overlords'], own: ['Lantern', 'Lanterns'] },
  { group: 'The swarm', sc2: ['Brood Lord', 'Brood Lords'], own: ['Sower', 'Sowers'], ids: ['BroodLord'] },
  { group: 'The swarm', sc2: ['Broodling', 'Broodlings'], own: ['Mite', 'Mites'] },
  { group: 'The swarm', sc2: ['Ultralisk', 'Ultralisks'], own: ['Tusker', 'Tuskers'] },
  {
    group: 'The swarm',
    sc2: ['Infested Civilian', 'Infested Civilians', 'Infested Colonist', 'Infested Colonists'],
    own: ['Turned Colonist', 'Turned Colonists', 'Turned Colonist', 'Turned Colonists'],
    ids: ['InfestedCivilian'],
  },
  {
    group: 'The swarm',
    sc2: ['Infested Terran', 'Infested Terrans', 'Infested Marine', 'Infested Marines'],
    own: ['Turned Trooper', 'Turned Troopers', 'Turned Trooper', 'Turned Troopers'],
    ids: ['InfestedTerran', 'InfestedTerranCampaign'],
  },
  // The same in the singular and the plural.
  { group: 'The swarm', sc2: ['Aberration', 'Aberrations', 'Abomination', 'Abominations'], own: ['Swollen', 'Swollen', 'Swollen', 'Swollen'], ids: ['InfestedAbomination'] },
  { group: 'The swarm', sc2: ['Infested Hut'], own: ['Overgrown Hut'], ids: ['InfestableHut', 'InfestedHut'] },
  { group: 'The swarm', sc2: ['Infested Biodome'], own: ['Overgrown Dome'], ids: ['InfestableBiodome', 'InfestedBiodome'] },
  { group: 'The swarm', sc2: ['Infested Cocoon'], own: ['Cocoon'], ids: ['InfestedCocoon'] },

  // Structures (the Barracks, Bunker, Armory and Refinery keep their plain names).
  { group: 'Structures', sc2: ['Command Center', 'Command Centers'], own: ['Holdfast', 'Holdfasts'], lower: true, ids: ['CommandCenter', 'commandCenter'] },
  { group: 'Structures', sc2: ['Orbital Command'], own: ['Skywatch'] },
  { group: 'Structures', sc2: ['Supply Depot', 'Supply Depots'], own: ['Storehouse', 'Storehouses'], lower: true, ids: ['SupplyDepot', 'supplyDepot'] },
  { group: 'Structures', sc2: ['Missile Turret', 'Missile Turrets'], own: ['Flak Tower', 'Flak Towers'], lower: true, ids: ['MissileTurret', 'missileTurret'] },
  { group: 'Structures', sc2: ['Engineering Bay', 'Engineering Bays'], own: ['Workshop', 'Workshops'], lower: true, ids: ['EngineeringBay', 'engineeringBay'] },
  { group: 'Structures', sc2: ['Factory', 'Factories'], own: ['Motor Pool', 'Motor Pools'], lower: true },
  { group: 'Structures', sc2: ['Starport', 'Starports'], own: ['Airfield', 'Airfields'], lower: true },
  { group: 'Structures', sc2: ['Fusion Core'], own: ['Reactor Hall'], ids: ['FusionCore', 'fusionCore'] },
  { group: 'Structures', sc2: ['Merc Compound', 'Merc Haven'], own: ['Hiring Hall', 'Hiring Hall'], ids: ['MercCompound', 'mercCompound'] },
  { group: 'Structures', sc2: ['Hologram Billboard'], own: ['Directorate Billboard'], ids: ['MengskHologramBillboard'] },
  // Plain names already: only their data ids need spacing out.
  { group: 'Structures', sc2: ['Logistics Headquarters'], own: ['Logistics Headquarters'], ids: ['LogisticsHeadquarters', 'radioTower'] },
  { group: 'Structures', sc2: ['Defense Wall'], own: ['Defense Wall'], ids: ['DefenseWallE', 'defenseWall'] },

  // Abilities, call-ins and the swarm's evolutions.
  { group: 'Abilities', sc2: ['Stimpack', 'Stimpacks'], own: ['Jolt', 'Jolts'], lower: true },
  { group: 'Abilities', sc2: ['Super Stim'], own: ['Super Jolt'] },
  { group: 'Abilities', sc2: ['Combat Shield'], own: ['Arm Shield'] },
  { group: 'Abilities', sc2: ['Concussive Shells', 'Concussive'], own: ['Stagger Rounds', 'Stagger'] },
  { group: 'Abilities', sc2: ['Personal Cloaking', 'Cloak'], own: ['Personal Shroud', 'Shroud'] },
  { group: 'Abilities', sc2: ['Tactical Nuke', 'Nuke', 'NUCLEAR LAUNCH DETECTED'], own: ['Warhead Strike', 'Warhead', 'WARHEAD INBOUND'], lower: true },
  { group: 'Abilities', sc2: ['Yamato Cannon', 'Yamato'], own: ['Keel Gun', 'Keel Gun'] },
  { group: 'Abilities', sc2: ['Tactical Jump'], own: ['Snap Jump'] },
  { group: 'Abilities', sc2: ['Scanner Sweep', 'Scanner Sweeps'], own: ['Skyscan', 'Skyscans'] },
  { group: 'Abilities', sc2: ['Siege Mode'], own: ['Braced Mode'] },
  { group: 'Abilities', sc2: ['Tank Mode'], own: ['Drive Mode'] },
  { group: 'Abilities', sc2: ['Javelin', 'Javelins'], own: ['Lance', 'Lances'] },
  { group: 'Abilities', sc2: ['Hellfire', 'Hellfires'], own: ['Seeker', 'Seekers'] },
  { group: 'Abilities', sc2: ['Ripwave'], own: ['Scatter'] },
  { group: 'Abilities', sc2: ['Pre-Igniter'], own: ['Wildfire'] },
  { group: 'Abilities', sc2: ['Multi-Lock'], own: ['Volley Lock'] },
  { group: 'Abilities', sc2: ['Restoration'], own: ['Triage'] },
  { group: 'Abilities', sc2: ['Energy Nova', 'Energy Novas'], own: ['Aurora', 'Auroras'] },
  { group: 'Abilities', sc2: ['Metabolic Boost', 'Metabolic boost'], own: ['Quickened Blood', 'Quickened blood'] },
  { group: 'Abilities', sc2: ['Adrenal Glands', 'Adrenal glands'], own: ['Frenzy Glands', 'Frenzy glands'] },
  { group: 'Abilities', sc2: ['Chitinous Plating'], own: ['Hardened Shells'] },
  { group: 'Abilities', sc2: ['Carapace and Attacks', 'Carapace'], own: ['Shells and Claws', 'Shell'] },

  // Weapons named on screen (a vehicle's bar names its weapon from the data's id, spaced out).
  { group: 'Weapons', sc2: ['C-14 Gauss rifle', 'C-14', 'Gauss rifle'], own: ['RK-4 coil rifle', 'RK-4', 'coil rifle'] },
  { group: 'Weapons', sc2: ['P-38 Scythe', 'P-38'], own: ['PK-2', 'PK-2'] },
  { group: 'Weapons', sc2: ['C-10 canister rifle', 'C-10', 'canister rifle'], own: ['LR-6 long rifle', 'LR-6', 'long rifle'] },
  { group: 'Weapons', sc2: ['Punisher'], own: ['Breaker'] },
  { group: 'Weapons', sc2: ['Perdition'], own: ['Kiln'] },
  { group: 'Weapons', sc2: ['Crucio'], own: ['Anvil'] },
  { group: 'Weapons', sc2: ['Thors Hammer', "Thor's Hammer"], own: ['Bulwark Cannons', 'Bulwark Cannons'] },
  { group: 'Weapons', sc2: ['Lanzer'], own: ['Dart'] },
  { group: 'Weapons', sc2: ['Backlash Rockets'], own: ['Strafe Rockets'] },
  { group: 'Weapons', sc2: ['Infernal Flame Thrower', 'Infernal Flamethrower'], own: ['Wide Flamer', 'Wide Flamer'] },
  { group: 'Weapons', sc2: ['CMC'], own: ['Hardsuit'] },

  // The Armory's research (Infantry and Vehicle Weapons, Armor and Plating are plain names).
  { group: 'Upgrades', sc2: ['Neosteel Armor', 'Neosteel'], own: ['Reinforced Frames', 'Reinforced'] },
  { group: 'Upgrades', sc2: ['Hi-Sec Auto Tracking'], own: ['Long Sights'] },

  { group: 'Resources', sc2: ['Minerals', 'Mineral'], own: ['Ore', 'Ore'], lower: true },
  { group: 'Resources', sc2: ['Vespene gas', 'Vespene'], own: ['Fuel gas', 'Fuel'], lower: true },

  { group: 'Other', sc2: ['Psionic', 'psionic'], own: ['Psychic', 'psychic'] },
  { group: 'Other', sc2: ['Brood War'], own: ['the First War'] },
];

/**
 * Whole lines that read better rewritten than word by word: the menus' few that name StarCraft II
 * as the source of the game's numbers (the notice and the content settings, which do so on
 * purpose, are never passed through here), and Hold the Line's own.
 */
