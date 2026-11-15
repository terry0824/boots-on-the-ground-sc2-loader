// The game's own names for StarCraft II's. The game's code names everything its own way (a Trooper is
// `trooper`, its stats are asked by `'Trooper'`); the loader reads StarCraft II's files by StarCraft II's
// names and answers the game in the game's. The tables here are the two vocabularies side by side, both
// ways: the stats' ids (provider.ts asks GameData by StarCraft II's and answers by the game's), the
// game's names as earlier versions had them (a profile saved then is brought up to date), and the words
// the names are made of (docs/original-assets/names.md has the glossary for people).

/** StarCraft II's data ids the game asks its stats by, and the game's own (the rest are the same in both). */
export const DATA_IDS: Record<string, string> = {
  Baneling: 'Blister', Banshee: 'Nightjar', Battlecruiser: 'Warship', BroodLord: 'Sower', Broodling: 'Mite',
  ColonistTransport: 'ColonistHauler', CommandCenter: 'Holdfast', Corruptor: 'Bilewing', DefenseWallE: 'DefenseWall',
  EngineeringBay: 'Workshop', Factory: 'MotorPool', Firebat: 'Burner', FusionCore: 'ReactorHall', Ghost: 'Seer',
  Goliath: 'Picket', Hellion: 'Torchrunner', HotSRaptor: 'Leaper', Hydralisk: 'Quillback',
  InfestableBiodome: 'OvergrownDome', InfestableHut: 'OvergrownHut', InfestedAbomination: 'Swollen',
  InfestedCivilian: 'TurnedColonist', InfestedCocoon: 'Cocoon', InfestedTerranCampaign: 'TurnedTrooper',
  KerriganChar: 'Calyx', MULE: 'Mender', Marauder: 'Grenadier', Marine: 'Trooper', Medivac: 'Dustoff',
  MengskHologramBillboard: 'DirectorateBillboard', MercCompound: 'HiringHall', MissileTurret: 'FlakTower',
  Mutalisk: 'Kite', Odin: 'Behemoth', Overlord: 'Lantern', Raynor01: 'Harlan', Reaper: 'Vaulter', Roach: 'Shellback',
  SCV: 'Rigger', SJValkyrie: 'Frigate', SiegeTank: 'Howitzer', SiegeTankSieged: 'HowitzerBraced',
  SpiderMine: 'ScuttleMine', Starport: 'Airfield', SupplyDepot: 'Storehouse', Thor: 'Bulwark', Ultralisk: 'Tusker',
  VikingAssault: 'JackknifeAssault', VikingFighter: 'JackknifeFighter', Vulture: 'Coyote', Wraith: 'Swift',
  Zergling: 'Hound', BacklashRockets: 'StrafeRockets', BroodlingStrike: 'MiteStrike', C10CanisterRifle: 'LongRifle',
  CrucioShockCannon: 'AnvilShockCannon', GlaiveWurm: 'BounceShard', GoliathA: 'PicketA', GoliathG: 'PicketG',
  GuassRifle: 'CoilRifle', HotSRaptorClaws: 'LeaperClaws', InfernalFlameThrower: 'WideFlamer',
  InfestedClaws: 'TurnedClaws', JavelinMissileLaunchers: 'LanceMissileLaunchers', KaiserBlades: 'TuskBlades',
  LanzerTorpedoes: 'DartTorpedoes', OdinAntiAir: 'BehemothAntiAir', P38ScytheGuassPistol: 'PK2Pistol',
  PunisherGrenades: 'BreakerGrenades', RaynorGaussRifle: 'HarlanCoilRifle', ThorsHammer: 'BulwarkCannons',
  Val03QueenOfBladesPsiBlast: 'CalyxPsiBlast', Val03RazorTalons: 'CalyxTalons',
  VultureSpiderMines: 'CoyoteScuttleMines', WraithA: 'SwiftA', WraithG: 'SwiftG',
  BroodlingTimedLifeBroodLord: 'MiteLife', StimpackMarauder: 'JoltGrenadier', MedivacTransport: 'DustoffTransport',
  HotSRaptorCharge: 'LeaperCharge', HotSRaptorChargeMissile: 'LeaperChargeMissile', SiegeMode: 'BracedMode',
  MarSara: 'Calder',
};

/** Ids StarCraft II's data answers with that don't start with a unit's or a weapon's id, and the game's own. */
const EXTRA_IDS: Record<string, string> = {
  BroodlordIterateBroodlingEscort: 'SowerIterateMiteEscort',
  Val03PsiBlastLaunchMissile: 'CalyxPsiBlastLaunchMissile',
};

const SC2_IDS = Object.keys(DATA_IDS).sort((a, b) => b.length - a.length);
const OWN_IDS = new Map(Object.entries(DATA_IDS).map(([sc2, own]) => [own, sc2]));
const OWN_PREFIXES = [...OWN_IDS.keys()].sort((a, b) => b.length - a.length);
const EXTRA_BACK = new Map(Object.entries(EXTRA_IDS).map(([sc2, own]) => [own, sc2]));

/**
 * One of StarCraft II's data ids as the game names it: the id itself, or one that starts with one (an
 * effect named for its weapon: `SJValkyrieLM` is `FrigateLM`). Anything else is the same in both.
 */
export function ownId(id: string): string {
  const whole = DATA_IDS[id] ?? EXTRA_IDS[id];
  if (whole) return whole;
  for (const p of SC2_IDS) if (id.length > p.length && id.startsWith(p) && /[A-Z]/.test(id[p.length])) return DATA_IDS[p] + id.slice(p.length);
  return id;
}

/** The game's name for a data id, back as StarCraft II's (ownId's other way). */
export function sc2Id(id: string): string {
  const whole = OWN_IDS.get(id) ?? EXTRA_BACK.get(id);
  if (whole) return whole;
  for (const p of OWN_PREFIXES) if (id.length > p.length && id.startsWith(p) && /[A-Z]/.test(id[p.length])) return OWN_IDS.get(p)! + id.slice(p.length);
  return id;
}

/**
 * The game's ids as earlier versions had them, and as it has them now: its kinds, models, sounds, icons,
 * portraits, classes, upgrades, sides, call-ins. (The board's cards and the asset workshop still go by the
 * earlier ones.)
 */
export const NAMES: Record<string, string> = {
  aberration: 'swollen', aberrationDeath: 'swollenDeath', adjutant: 'dispatch', ambienceMarSara: 'ambienceCalder',
  artifactNova: 'artifactAurora', baneling: 'blister', banelingBurst: 'blisterBurst', banelingDeath: 'blisterDeath',
  banelingRoll: 'blisterRoll', banshee: 'nightjar', 'banshee.rockets': 'nightjar.rockets',
  bansheeAttack: 'nightjarAttack', bansheeDeath: 'nightjarDeath', bansheeImpact: 'nightjarImpact',
  bansheeMissile: 'nightjarMissile', bansheeMissileImpact: 'nightjarMissileImpact', banshees: 'nightjars',
  battlecruiser: 'warship', battlecruiserBattery: 'warshipBattery', battlecruiserGround: 'warshipGround',
  battlecruiserLaser: 'warshipLaser', battlecruiserVoice: 'warshipVoice', battlecruisers: 'warships',
  'bc.yamatoCharge': 'bc.keelGunCharge', 'bc.yamatoFire': 'bc.keelGunFire', broodLord: 'sower',
  broodLordDeath: 'sowerDeath', broodLordImpact: 'sowerImpact', broodLordLaunch: 'sowerLaunch',
  broodLordVoice: 'sowerVoice', broodling: 'mite', broodlingDeath: 'miteDeath', broodlingDeathAcid: 'miteDeathAcid',
  broodlingDeathFire: 'miteDeathFire', 'broodlord.attack': 'sower.attack', cloak: 'shroud', cloakOff: 'shroudOff',
  cloakOn: 'shroudOn', colonistTransport: 'colonistHauler', colonistTransportDeath: 'colonistHaulerDeath',
  colonistTransports: 'colonistHaulers', 'combat-shield': 'arm-shield', commandCenter: 'holdfast',
  commandCenterDeath: 'holdfastDeath', commandCenters: 'holdfasts', concussive: 'stagger', corruptor: 'bilewing',
  corruptorDeath: 'bilewingDeath', corruptorMissile: 'bilewingMissile',
  corruptorMissileImpact: 'bilewingMissileImpact', corruptorMissileLaunch: 'bilewingMissileLaunch',
  'death.baneling': 'death.blister', 'death.broodling': 'death.mite', 'death.broodlord': 'death.sower',
  'death.hydralisk': 'death.quillback', 'death.infested': 'death.turned', 'death.marine': 'death.trooper',
  'death.mutalisk': 'death.kite', 'death.roach': 'death.shellback', 'death.ultralisk': 'death.tusker',
  'death.zergling': 'death.hound', dominion: 'directorate', energyNova: 'aurora', engineeringBay: 'workshop',
  engineeringBayDeath: 'workshopDeath', engineeringBays: 'workshops', factory: 'motorPool',
  factoryDeath: 'motorPoolDeath', firebat: 'burner', firebatDeath: 'burnerDeath',
  firebatFireSprite: 'burnerFireSprite', firebatLaunch: 'burnerLaunch', firebats: 'burners',
  fusionCore: 'reactorHall', fusionCoreDeath: 'reactorHallDeath', fusionCores: 'reactorHalls', ghost: 'seer',
  ghostDeath: 'seerDeath', ghostDeathAcid: 'seerDeathAcid', ghostDeathBlast: 'seerDeathBlast',
  ghostDeathEviscerate: 'seerDeathEviscerate', ghostDeathFire: 'seerDeathFire', ghostFireSprite: 'seerFireSprite',
  ghostImpact: 'seerImpact', ghostLaunch: 'seerLaunch', ghostReady: 'seerReady', ghosts: 'seers', goliath: 'picket',
  'goliath.cannon': 'picket.cannon', 'goliath.missiles': 'picket.missiles', goliathAirMissile: 'picketAirMissile',
  goliathAirMissileImpact: 'picketAirMissileImpact', goliathAttack: 'picketAttack', goliathDeath: 'picketDeath',
  goliathMissile: 'picketMissile', goliaths: 'pickets', hellion: 'torchrunner', 'hellion.flame': 'torchrunner.flame',
  hellionAttack: 'torchrunnerAttack', hellionBeamImpact: 'torchrunnerBeamImpact', hellionDeath: 'torchrunnerDeath',
  hellionImpact: 'torchrunnerImpact', hellions: 'torchrunners', hisec: 'long-sights', horner: 'ashby',
  hydralisk: 'quillback', hydraliskDeath: 'quillbackDeath', hydraliskDeathAcid: 'quillbackDeathAcid',
  hydraliskDeathFire: 'quillbackDeathFire', hydraliskImpact: 'quillbackImpact', hydraliskLaunch: 'quillbackLaunch',
  hydraliskMissile: 'quillbackMissile', hydraliskMissileImpact: 'quillbackMissileImpact',
  hydraliskMissileLaunch: 'quillbackMissileLaunch', implosion: 'crush', infestedColonist: 'turnedColonist',
  infestedColonistDeath: 'turnedColonistDeath', infestedColonistDeathFire: 'turnedColonistDeathFire',
  infestedMarine: 'turnedTrooper', infestedMarineDeath: 'turnedTrooperDeath',
  infestedMarineDeathAcid: 'turnedTrooperDeathAcid', infestedMarineDeathFire: 'turnedTrooperDeathFire',
  infestedMoan: 'turnedMoan', kerrigan: 'calyx', kerriganAttack: 'calyxAttack', kerriganDeath: 'calyxDeath',
  kerriganPissed: 'calyxPissed', marauder: 'grenadier', marauderDeath: 'grenadierDeath',
  marauderDeathEviscerate: 'grenadierDeathEviscerate', marauderImpact: 'grenadierImpact',
  marauderLaunch: 'grenadierLaunch', marauderMissile: 'grenadierMissile', marauderReady: 'grenadierReady',
  marauders: 'grenadiers', marine: 'trooper', marine2: 'trooper2', marineAttack: 'trooperAttack',
  marineDeath: 'trooperDeath', marineDeathAcid: 'trooperDeathAcid', marineDeathBlast: 'trooperDeathBlast',
  marineDeathEviscerate: 'trooperDeathEviscerate', marineDeathEviscerate1: 'trooperDeathEviscerate1',
  marineDeathFire: 'trooperDeathFire', marineGrip: 'trooperGrip', marineHelp: 'trooperHelp',
  marineImpact: 'trooperImpact', marineLaunch: 'trooperLaunch', marinePissed: 'trooperPissed',
  marineReady: 'trooperReady', marineYes: 'trooperYes', marines: 'troopers', medivac: 'dustoff',
  medivacDeath: 'dustoffDeath', medivacEngine: 'dustoffEngine', medivacHeal: 'dustoffHeal',
  medivacUnload: 'dustoffUnload', medivacs: 'dustoffs', mengsk: 'ostrander', mercCompound: 'hiringHall',
  mercCompounds: 'hiringHalls', mineral: 'ore', mineralField: 'oreField', minerals: 'ore',
  missileTurret: 'flakTower', missileTurretDeath: 'flakTowerDeath', missileTurretMissile: 'flakTowerMissile',
  missileTurrets: 'flakTowers', mule: 'mender', muleDeath: 'menderDeath', muleDrop: 'menderDrop',
  muleExplode: 'menderExplode', muleImpact: 'menderImpact', muleReady: 'menderReady', mules: 'menders',
  multilock: 'volleylock', mutalisk: 'kite', 'mutalisk.attack': 'kite.attack', mutaliskDeath: 'kiteDeath',
  mutaliskImpact: 'kiteImpact', mutaliskLaunch: 'kiteLaunch', mutaliskMissile: 'kiteMissile',
  mutaliskVoice: 'kiteVoice', neosteel: 'reinforced', novaGrip: 'seerGrip', nuke: 'warhead',
  nukeAlert: 'warheadAlert', nukeDrop: 'warheadDrop', nukeExplosion: 'warheadExplosion', nukeImpact: 'warheadImpact',
  nukeIncoming: 'warheadIncoming', nukeLaunch: 'warheadLaunch', nukeReady: 'warheadReady', odin: 'behemoth',
  'odin.cannon': 'behemoth.cannon', 'odin.missiles': 'behemoth.missiles', odinDeath: 'behemothDeath',
  odinShoulderMissileImpact: 'behemothShoulderMissileImpact', omegaStorm: 'blightStorm', overlord: 'lantern',
  overlordDeath: 'lanternDeath', raptor: 'leaper', raptorDeath: 'leaperDeath', raptorJump: 'leaperJump',
  raptorLand: 'leaperLand', raynor: 'harlan', raynorDeath: 'harlanDeath', raynorDeathFire: 'harlanDeathFire',
  raynors: 'harlans', reaper: 'vaulter', reaperDeath: 'vaulterDeath', reaperImpact: 'vaulterImpact',
  reaperJumpLandDown: 'vaulterJumpLandDown', reaperLaunch: 'vaulterLaunch', reaperReady: 'vaulterReady',
  reapers: 'vaulters', restoration: 'triage', ripwave: 'scatter', roach: 'shellback', roachDeath: 'shellbackDeath',
  roachDeathAcid: 'shellbackDeathAcid', roachDeathFire: 'shellbackDeathFire', roachImpact: 'shellbackImpact',
  roachLaunch: 'shellbackLaunch', roachMissile: 'shellbackMissile', roachMissileImpact: 'shellbackMissileImpact',
  scan: 'skyscan', scannerSweep: 'skyscan', scv: 'rigger', scvDeath: 'riggerDeath', scvs: 'riggers',
  siegeImpact: 'braceImpact', siegeLaunch: 'braceLaunch', siegeMorph: 'braceMorph', siegeTank: 'howitzer',
  siegeTankDeath: 'howitzerDeath', siegeTankMobile: 'howitzerMobile', siegeTankMobiles: 'howitzerMobiles',
  siegeTankMorph: 'howitzerMorph', siegeTankSiegedDeath: 'howitzerBracedDeath', siegeTanks: 'howitzers',
  siegeTime: 'braceTime', sieged: 'braced', sieging: 'bracing', smMarine: 'smTrooper', smNova: 'smSeer',
  spiderMine: 'scuttleMine', spiderMineBurrow: 'scuttleMineBurrow', spiderMineExplosion: 'scuttleMineExplosion',
  spiderMinePlace: 'scuttleMinePlace', spiderMineSeek: 'scuttleMineSeek', spiderMines: 'scuttleMines',
  starport: 'airfield', starportDeath: 'airfieldDeath', starports: 'airfields', stim: 'jolt', stimpack: 'jolt',
  stimpacks: 'jolts', superStim: 'superJolt', supplyDepot: 'storehouse', supplyDepotDeath: 'storehouseDeath',
  supplyDepots: 'storehouses', 'tank.siege': 'tank.brace', terran: 'holdouts',
  terranExplosionLarge: 'humanExplosionLarge', terranExplosionMedium: 'humanExplosionMedium',
  terranExplosionSmall: 'humanExplosionSmall', terranSmallBlast: 'humanSmallBlast', thor: 'bulwark',
  'thor.cannon': 'bulwark.cannon', 'thor.javelin': 'bulwark.lance', thorArmMissileImpact: 'bulwarkArmMissileImpact',
  thorArmMissileLaunch: 'bulwarkArmMissileLaunch', thorAttack: 'bulwarkAttack',
  thorChestMissileImpact: 'bulwarkChestMissileImpact', thorDeath: 'bulwarkDeath', thorFootprint: 'bulwarkFootprint',
  thorImpact: 'bulwarkImpact', thorMissile: 'bulwarkMissile',
  thorShoulderMissileLaunch: 'bulwarkShoulderMissileLaunch', thors: 'bulwarks', tychus: 'tolliver',
  ultralisk: 'tusker', ultraliskBodyfall: 'tuskerBodyfall', ultraliskDeath: 'tuskerDeath',
  ultraliskDeathAcid: 'tuskerDeathAcid', ultraliskDeathFire: 'tuskerDeathFire', ultraliskImpact: 'tuskerImpact',
  ultraliskLaunch: 'tuskerLaunch', ultraliskRoar: 'tuskerRoar', unsiegeMorph: 'unbraceMorph', unsieging: 'unbracing',
  valkyrie: 'frigate', 'valkyrie.missiles': 'frigate.missiles', valkyrieAttack: 'frigateAttack',
  valkyrieDeath: 'frigateDeath', valkyrieImpact: 'frigateImpact', valkyries: 'frigates', vespene: 'fuel',
  viking: 'jackknife', 'viking.gatling': 'jackknife.gatling', 'viking.lanzer': 'jackknife.dart',
  vikingAssault: 'jackknifeAssault', vikingAssaultDeath: 'jackknifeAssaultDeath',
  vikingAssaultWeaponImpact: 'jackknifeAssaultWeaponImpact',
  vikingAssaultWeaponLaunch: 'jackknifeAssaultWeaponLaunch', vikingAssaults: 'jackknifeAssaults',
  vikingFighter: 'jackknifeFighter', vikingFighterAttack: 'jackknifeFighterAttack',
  vikingFighterDeath: 'jackknifeFighterDeath', vikingFighterMissile: 'jackknifeFighterMissile',
  vikingFighterMissileImpact: 'jackknifeFighterMissileImpact',
  vikingFighterMissileLaunch: 'jackknifeFighterMissileLaunch', vikingFighters: 'jackknifeFighters',
  vikingGatling: 'jackknifeGatling', vikingMorph: 'jackknifeMorph', vikingToAssault: 'jackknifeToAssault',
  vikingToFighter: 'jackknifeToFighter', vulture: 'coyote', 'vulture.grenade': 'coyote.grenade',
  vultureAttack: 'coyoteAttack', vultureDeath: 'coyoteDeath', vultures: 'coyotes', wraith: 'swift',
  'wraith.laser': 'swift.laser', 'wraith.missiles': 'swift.missiles', wraithDeath: 'swiftDeath',
  wraithGroundImpact: 'swiftGroundImpact', wraithLaserMissile: 'swiftLaserMissile',
  wraithLaserMissileImpact: 'swiftLaserMissileImpact', wraithMissile: 'swiftMissile',
  wraithMissileImpact: 'swiftMissileImpact', wraiths: 'swifts', yamato: 'keelGun', yamatoCharge: 'keelGunCharge',
  yamatoLaunch: 'keelGunLaunch', zerg: 'crawl', zergGoreLarge: 'crawlGoreLarge', zergGoreMedium: 'crawlGoreMedium',
  zergGoreSmall: 'crawlGoreSmall', zergling: 'hound', zerglingAttack: 'houndAttack', zerglingDeath: 'houndDeath',
  zerglingDeathAcid: 'houndDeathAcid', zerglingDeathEviscerate: 'houndDeathEviscerate',
  zerglingDeathEviscerate1: 'houndDeathEviscerate1', zerglingDeathFire: 'houndDeathFire',
  zerglingImpact: 'houndImpact', zerglingVoice: 'houndVoice',
};

/**
 * The words the game's names are made of, as StarCraft II's were (lowerCamel): `siegeTankMobile` became
 * `howitzerMobile`, `MarineAvatar` `TrooperAvatar`, `'death.zergling'` `'death.hound'`.
 */
export const WORDS: Record<string, string> = {
  aberration: 'swollen', abomination: 'swollen', adjutant: 'dispatch', adrenalGlands: 'frenzyGlands',
  agria: 'furrow', artifactNova: 'artifactAurora', backlash: 'strafe', baneling: 'blister', banshee: 'nightjar',
  battlecruiser: 'warship', broodling: 'mite', broodLord: 'sower', broodWar: 'firstWar', c10: 'lr6', c14: 'rk4',
  canister: 'long', chitinousPlating: 'hardenedShells', cloak: 'shroud', cloaked: 'shrouded', cloaking: 'shrouding',
  cmc: 'hardsuit', colonistTransport: 'colonistHauler', combatShield: 'armShield', commandCenter: 'holdfast',
  concussive: 'stagger', confederate: 'union', corruptor: 'bilewing', crucio: 'anvil', dominion: 'directorate',
  energyNova: 'aurora', engineeringBay: 'workshop', factory: 'motorPool', firebat: 'burner',
  fusionCore: 'reactorHall', gauss: 'coil', ghost: 'seer', glaiveWurm: 'bounceShard', goliath: 'picket',
  guass: 'coil', hanson: 'weller', hellfire: 'seeker', hellion: 'torchrunner', hisec: 'longSights',
  hiSec: 'longSights', horner: 'ashby', hydralisk: 'quillback', hyperion: 'lodestar', implosion: 'crush',
  infernal: 'wide', infested: 'turned', infestedBiodome: 'overgrownDome', infestedCivilian: 'turnedColonist',
  infestedHut: 'overgrownHut', infestedMarine: 'turnedTrooper', infestedTerran: 'turnedTrooper', javelin: 'lance',
  kaiserBlades: 'tuskBlades', kerrigan: 'calyx', korhal: 'vantage', lanzer: 'dart', marauder: 'grenadier',
  marine: 'trooper', marineArms: 'trooperArms', marSara: 'calder', medivac: 'dustoff', meinhoff: 'fenmoor',
  mengsk: 'ostrander', mercCompound: 'hiringHall', metabolicBoost: 'quickenedBlood', mineral: 'ore',
  mineralField: 'oreField', minerals: 'ore', missileTurret: 'flakTower', mule: 'mender', multiLock: 'volleyLock',
  mutalisk: 'kite', neosteel: 'reinforced', nova: 'seer', nuclear: 'warhead', nuke: 'warhead', odin: 'behemoth',
  omegaStorm: 'blightStorm', orbitalCommand: 'skywatch', overlord: 'lantern', p38: 'pk2', perdition: 'kiln',
  personalCloaking: 'personalShroud', preIgniter: 'wildfire', psionic: 'psychic', punisher: 'breaker',
  queenOfBlades: 'voiceOfTheCrawl', raptor: 'leaper', raynor: 'harlan', reaper: 'vaulter', restoration: 'triage',
  riksville: 'saltwell', ripwave: 'scatter', roach: 'shellback', scan: 'skyscan', scannerSweep: 'skyscan',
  scv: 'rigger', siege: 'brace', sieged: 'braced', siegeTank: 'howitzer', siegeTankSieged: 'howitzerBraced',
  sieging: 'bracing', spiderMine: 'scuttleMine', starport: 'airfield', stim: 'jolt', stimfx: 'joltfx',
  stimmed: 'jolted', stimpack: 'jolt', superStim: 'superJolt', supplyDepot: 'storehouse', tacticalJump: 'snapJump',
  tacticalNuke: 'warheadStrike', tarsonis: 'halcourt', terran: 'holdouts', terranExplosion: 'humanExplosion',
  terranSmallBlast: 'humanSmallBlast', thor: 'bulwark', thorsHammer: 'bulwarkCannons', tychus: 'tolliver',
  ultralisk: 'tusker', unsiege: 'unbrace', unsieging: 'unbracing', valkyrie: 'frigate', vespene: 'fuel',
  viking: 'jackknife', vulture: 'coyote', wraith: 'swift', xelNaga: 'forebear', xelnaga: 'forebear',
  yamato: 'keelGun', zerg: 'crawl', zergling: 'hound',
};

/**
 * Stats asked and answered by the game's names (GameData is asked by StarCraft II's): each id the game
 * passes goes to StarCraft II's, and each id in an answer comes back as the game's. One answer object
 * always gives the same translated one, so what the game keeps and changes stays as it left it.
 */
export function byOwnIds<T extends object>(data: T): T {
  const copies = new WeakMap<object, unknown>();
  const own = (v: unknown): unknown => {
    if (typeof v === 'string') return ownId(v);
    if (!v || typeof v !== 'object') return v;
    const seen = copies.get(v);
    if (seen) return seen;
    if (Array.isArray(v)) {
      const out: unknown[] = [];
      copies.set(v, out);
      for (const x of v) out.push(own(x));
      return out;
    }
    if (Object.getPrototypeOf(v) !== Object.prototype) return wrap(v);
    const out: Record<string, unknown> = {};
    copies.set(v, out);
    for (const [k, x] of Object.entries(v)) out[k] = own(x);
    return out;
  };
  // GameData and the views it leads to (its campaign's and Heart of the Swarm's numbers).
  const views = new WeakMap<object, unknown>();
  const wrap = (target: object): unknown => {
    let view = views.get(target);
    if (!view) {
      view = new Proxy(target, {
        get(t, prop) {
          const v: unknown = Reflect.get(t, prop, t);
          if (typeof v === 'function') return (...args: unknown[]) => own((v as (...a: unknown[]) => unknown).apply(t, args.map((a) => (typeof a === 'string' ? sc2Id(a) : a))));
          return v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype ? wrap(v) : v;
        },
      });
      views.set(target, view);
    }
    return view;
  };
  return wrap(data) as T;
}
