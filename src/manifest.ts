// Every StarCraft II file the game uses, by logical path (as the game's own data refers to
// them), for each name the game asks for (content/assetnames.ts). `node tools/prefetch.ts`
// copies them, and the textures the models reference, into the local cache.

import type { AnimationName, ModelName, MusicName, SoundName } from '../../../src/content/assetnames.ts';

function series(prefix: string, from: number, to: number, ext: string, digits = 1): string[] {
  const out: string[] = [];
  for (let i = from; i <= to; i++) out.push(`${prefix}${String(i).padStart(digits, '0')}${ext}`);
  return out;
}

export const MODELS = {
  trooper: 'Assets/Units/Terran/Marine/Marine.m3',
  trooperDeath: 'Assets/Units/Terran/MarineDeath/MarineDeath.m3',
  hound: 'Assets/Units/Zerg/Zergling/Zergling.m3',
  houndDeath: 'Assets/Units/Zerg/ZerglingDeath/ZerglingDeath.m3',
  quillback: 'Assets/Units/Zerg/Hydralisk/Hydralisk.m3',
  quillbackDeath: 'Assets/Units/Zerg/HydraliskDeath/HydraliskDeath.m3',
  shellback: 'Assets/Units/Zerg/Roach/Roach.m3',
  shellbackDeath: 'Assets/Units/Zerg/RoachDeath/RoachDeath.m3',
  tusker: 'Assets/Units/Zerg/Ultralisk/Ultralisk.m3',
  tuskerDeath: 'Assets/Units/Zerg/UltraliskDeath/UltraliskDeath_00.m3',
  holdfast: 'Assets/Buildings/Terran/CommandCenter/CommandCenter.m3',
  barracks: 'Assets/Buildings/Terran/Barracks/Barracks.m3',
  bunker: 'Assets/Buildings/Terran/Bunker/Bunker.m3',
  storehouse: 'Assets/Buildings/Terran/SupplyDepot/SupplyDepot.m3',
  // ModelData draws the SiegeTank unit (Tank Mode) with TankEx1, a newer M3 than the parser
  // reads (MODL v25); SiegeTank.m3 is the SiegeTankSieged model. Both modes are drawn with the
  // transformation rig instead (see tank.ts), and this one sizes them.
  howitzer: 'Assets/Units/Terran/SiegeTank/SiegeTank.m3',
  /** Same tank, rigged for the transformation into (and out of) Siege Mode. */
  howitzerMorph: 'Assets/Units/Terran/SiegeTankMorph/SiegeTankMorph.m3',
  howitzerDeath: 'Assets/Units/Terran/SiegeTankDeath/SiegeTankDeath.m3',
  howitzerBracedDeath: 'Assets/Units/Terran/SiegeTankSiegedDeath/SiegeTankSiegedDeath.m3',
  warship: 'Assets/Units/Terran/Battlecruiser/Battlecruiser.m3',
  /** The C-14 from the Wings of Liberty story mode, for the first-person view. */
  rifle: 'Assets/StoryModeCharacters/Terran/SM_MarineRifle/SM_MarineRifle.m3',
  /** The story-mode Marine: its arms (hands to the fingers) hold the C-14 in first person. */
  smTrooper: 'Assets/StoryModeCharacters/Terran/SM_Marine01/SM_Marine01.m3',
  /** Nova in story mode (Nova Covert Ops), with her C-10 canister rifle: a Ghost's arms and rifle in first person. */
  smSeer: 'Assets/StoryModeCharacters/Terran/SMX3_Nova/SMX3_Nova.m3',
  // Infantry of the Wings of Liberty campaign, and the Raiders' commander himself.
  harlan: 'Assets/Units/Terran/MarineRaynor/MarineRaynor.m3',
  harlanDeath: 'Assets/Units/Terran/MarineRaynorDeath/MarineRaynorDeath.m3',
  grenadier: 'Assets/Units/Terran/Marauder/Marauder.m3',
  grenadierDeath: 'Assets/Units/Terran/MarauderDeath/MarauderDeath.m3',
  burner: 'Assets/Units/Terran/Firebat/Firebat.m3',
  burnerDeath: 'Assets/Units/Terran/FirebatDeath/FirebatDeath.m3',
  medic: 'Assets/Units/Terran/Medic/Medic.m3',
  medicDeath: 'Assets/Units/Terran/MedicDeath/MedicDeath.m3',
  seer: 'Assets/Units/Terran/Ghost/Ghost.m3',
  seerDeath: 'Assets/Units/Terran/GhostDeath/GhostDeath.m3',
  vaulter: 'Assets/Units/Terran/Reaper/Reaper.m3',
  vaulterDeath: 'Assets/Units/Terran/ReaperDeath/ReaperDeath_00.m3',
  // Liberation Day's set pieces: the Dominion's broadcast tower and Mengsk's face everywhere.
  radioTower: 'Assets/Doodads/TRaynor01RadioTower/TRaynor01RadioTower.m3',
  billboard: 'Assets/Doodads/MengskHologramBillboard/MengskHologramBillboard.m3',
  statue: 'Assets/Doodads/MengskStatue/MengskStatue.m3',
  // Agria's colonist haulers, for the evacuation.
  colonistHauler: 'Assets/Units/Terran/ColonistTransport/ColonistTransport.m3',
  colonistHaulerDeath: 'Assets/Units/Terran/ColonistTransportDeath/ColonistTransportDeath.m3',
  // The swarm's heavier strains: rolling acid bombs, and the air.
  blister: 'Assets/Units/Zerg/Baneling/Baneling.m3',
  blisterDeath: 'Assets/Units/Zerg/BanelingDeath/BanelingDeath.m3',
  kite: 'Assets/Units/Zerg/Mutalisk/Mutalisk.m3',
  kiteDeath: 'Assets/Units/Zerg/MutaliskDeath/MutaliskDeath_00.m3',
  sower: 'Assets/Units/Zerg/BroodLord/BroodLord.m3',
  sowerDeath: 'Assets/Units/Zerg/BroodLordDeath/BroodLordDeath_00.m3',
  /** The Broodling (the "Symbiote" in the art files). */
  mite: 'Assets/Units/Zerg/Symbiote/Symbiote.m3',
  miteDeath: 'Assets/Units/Zerg/SymbioteDeath/SymbioteDeath.m3',
  // Char: the Queen of Blades, the Xel'Naga artifact in its containment rig, and the
  // Raiders' last base around it.
  calyx: 'Assets/Units/Zerg/Kerrigan/Kerrigan.m3',
  artifact: 'Assets/Doodads/ArtifactContainmentField/ArtifactContainmentField.m3',
  flakTower: 'Assets/Buildings/Terran/MissileTurret/MissileTurret.m3',
  workshop: 'Assets/Buildings/Terran/EngineeringBay/EngineeringBay.m3',
  motorPool: 'Assets/Buildings/Terran/Factory/Factory.m3',
  airfield: 'Assets/Buildings/Terran/Starport/Starport.m3',
  armory: 'Assets/Buildings/Terran/Armory/Armory.m3',
  reactorHall: 'Assets/Buildings/Terran/FusionCore/FusionCore.m3',
  hiringHall: 'Assets/Buildings/Terran/MercCompound/MercCompound.m3',
  defenseWall: 'Assets/Doodads/DefenseWall/DefenseWall_00.m3',
  // Call-ins from orbit: the Medivac dropship, the Orbital Command's MULE, the scanner sweep.
  dustoff: 'Assets/Units/Terran/Medivac/Medivac.m3',
  dustoffDeath: 'Assets/Units/Terran/MedivacDeath/MedivacDeath_00.m3',
  mender: 'Assets/Units/Terran/MULE/MULE.m3',
  menderDeath: 'Assets/Units/Terran/MULEDeath/MULEDeath.m3',
  /** The MULE's drop pod (the CalldownMULE actor's MercDropModel): it falls from orbit, lands, and opens. */
  dropPod: 'Assets/Effects/Terran/DropPodFalling/DropPodFalling.m3',
  comsatScanner: 'Assets/Effects/Terran/ComsatScanner/ComsatScanner.m3',
  // Meinhoff: the infested colony.
  turnedColonist: 'Assets/Units/Zerg/InfestedColonist/InfestedColonist_00.m3',
  turnedColonistDeath: 'Assets/Units/Zerg/InfestedColonistDeath/InfestedColonistDeath_00.m3',
  turnedTrooper: 'Assets/Units/Zerg/InfestedMarine/InfestedMarine.m3',
  turnedTrooperDeath: 'Assets/Units/Zerg/InfestedMarineDeath/InfestedMarineDeath_00.m3',
  swollen: 'Assets/Units/Zerg/Aberration/Aberration.m3',
  swollenDeath: 'Assets/Units/Zerg/AberrationDeath/AberrationDeath.m3',
  colonistHut: 'Assets/Doodads/ColonistHut/ColonistHut_00.m3',
  biodome: 'Assets/Doodads/Biodome/Biodome_01.m3',
  cocoon: 'Assets/Doodads/CocoonedColonists/CocoonedColonists_03.m3',
  // The structures' own deaths (Wings of Liberty's originals; the later "Ex1" remakes use a
  // newer model format): they collapse in fire and leave a wreck.
  holdfastDeath: 'Assets/Buildings/Terran/CommandCenterDeath/CommandCenterDeath.m3',
  barracksDeath: 'Assets/Buildings/Terran/BarracksDeath/BarracksDeath.m3',
  bunkerDeath: 'Assets/Buildings/Terran/BunkerDeath/BunkerDeath.m3',
  storehouseDeath: 'Assets/Buildings/Terran/SupplyDepotDeath/SupplyDepotDeath.m3',
  workshopDeath: 'Assets/Buildings/Terran/EngineeringBayDeath/EngineeringBayDeath.m3',
  motorPoolDeath: 'Assets/Buildings/Terran/FactoryDeath/FactoryDeath.m3',
  airfieldDeath: 'Assets/Buildings/Terran/StarportDeath/StarportDeath.m3',
  armoryDeath: 'Assets/Buildings/Terran/ArmoryDeath/ArmoryDeath.m3',
  reactorHallDeath: 'Assets/Buildings/Terran/FusionCoreDeath/FusionCoreDeath.m3',
  flakTowerDeath: 'Assets/Buildings/Terran/MissileTurretDeath/MissileTurretDeath.m3',
  colonistHutDeath: 'Assets/Buildings/Terran/ColonistHutDeath/ColonistHutDeath.m3',
  /** BioDomeDeath2: the collapse that matches the Biodome_01 variant. */
  biodomeDeath: 'Assets/Doodads/BiodomeDeath/BiodomeDeath_01.m3',
  // Weapon effects, as the game's actors assign them (ActorData's launch and impact models,
  // ModelData's paths): muzzle flashes, impacts, and the reactions of what was hit.
  trooperLaunch: 'Assets/Effects/Terran/MarineWeaponLaunch/MarineWeaponLaunch.m3',
  trooperImpact: 'Assets/Effects/Terran/MarineWeaponImpact/MarineWeaponImpact.m3',
  bloodImpact: 'Assets/Effects/Other/BloodTargetImpact/BloodTargetImpact.m3',
  metalImpact: 'Assets/Effects/Other/MetalImpactSmear/MetalImpactSmear.m3',
  armorImpact: 'Assets/Effects/Other/GenericImpactSmear/GenericImpactSmear.m3',
  seerLaunch: 'Assets/Effects/Terran/GhostWeaponLaunch/GhostWeaponLaunch.m3',
  seerImpact: 'Assets/Effects/Terran/GhostWeaponImpact/GhostWeaponImpact.m3',
  vaulterLaunch: 'Assets/Effects/Terran/ReaperWeaponLaunch/ReaperWeaponLaunch.m3',
  vaulterImpact: 'Assets/Effects/Terran/ReaperWeaponImpact/ReaperWeaponImpact.m3',
  grenadierLaunch: 'Assets/Effects/Terran/MarauderMissileLaunch/MarauderMissileLaunch.m3',
  tankLaunch: 'Assets/Effects/Terran/TankWeaponLaunch/TankWeaponLaunch.m3',
  tankImpact: 'Assets/Effects/Terran/TankWeaponImpact/TankWeaponImpact.m3',
  braceLaunch: 'Assets/Effects/Terran/SiegeTankWeaponLaunch/SiegeTankWeaponLaunch.m3',
  braceImpact: 'Assets/Effects/Terran/SiegeTankWeaponImpact/SiegeTankWeaponImpact.m3',
  turretImpact: 'Assets/Effects/Terran/MissileTurretMissileImpact/MissileTurretMissileImpact.m3',
  bcImpact: 'Assets/Effects/Terran/BattlecruiserMissileImpact/BattleCruiserMissileImpact.m3',
  // Its laser batteries' bolt (the ATS and ATA LaserBatteryLMWeapon missile): a glowing head of
  // particles; the bolt itself is the texture above, drawn along its flight.
  bcMissile: 'Assets/Effects/Terran/BattleCruiserMissile/BattleCruiserMissile.m3',
  quillbackImpact: 'Assets/Effects/Zerg/MutaliskMissileImpact/MutaliskMissileImpact.m3',
  shellbackImpact: 'Assets/Effects/Zerg/RoachWeaponImpact/RoachWeaponImpact.m3',
  houndImpact: 'Assets/Effects/Zerg/ZerglingWeaponImpact/ZerglingWeaponImpact.m3',
  sowerImpact: 'Assets/Effects/Zerg/SymbioteImpact/SymbioteImpact.m3',
  // Missiles in flight, as the actors draw them (ModelData's paths): each missile carries its
  // model, whose emitters leave the trail.
  quillbackMissile: 'Assets/Effects/Zerg/HydraliskMissile/HydraliskMissile.m3',
  quillbackMissileLaunch: 'Assets/Effects/Zerg/HydraliskMissileLaunch/HydraliskMissileLaunch.m3',
  quillbackMissileImpact: 'Assets/Effects/Zerg/HydraliskMissileImpact/HydraliskMissileImpact.m3',
  shellbackMissile: 'Assets/Effects/Zerg/RoachMissile/RoachMissile.m3',
  shellbackMissileImpact: 'Assets/Effects/Zerg/RoachMissileImpact/RoachMissileImpact.m3',
  kiteMissile: 'Assets/Effects/Zerg/MutaliskMissile/MutaliskMissile.m3',
  bilewingMissile: 'Assets/Effects/Zerg/CorruptorMissile/CorruptorMissile.m3',
  bilewingMissileLaunch: 'Assets/Effects/Zerg/CorruptorMissileLaunch/CorruptorMissileLaunch.m3',
  bilewingMissileImpact: 'Assets/Effects/Zerg/CorruptorMissileImpact/CorruptorMissileImpact.m3',
  grenadierMissile: 'Assets/Effects/Terran/MarauderMissile/MarauderMissile.m3',
  flakTowerMissile: 'Assets/Effects/Terran/MissileTurretMissile/MissileTurretMissile.m3',
  jackknifeFighterMissile: 'Assets/Effects/Terran/VikingFighterMissile/VikingFighterMissile.m3',
  jackknifeFighterMissileLaunch: 'Assets/Effects/Terran/VikingFighterMissileLaunch/VikingFighterMissileLaunch.m3',
  jackknifeFighterMissileImpact: 'Assets/Effects/Terran/VikingFighterMissileImpact/VikingFighterMissileImpact.m3',
  nightjarMissile: 'Assets/Effects/Terran/BansheeMissile/BansheeMissile.m3',
  // The machines' own launch and impact models, as their attack actors assign them.
  nightjarMissileImpact: 'Assets/Effects/Terran/BansheeMissileImpact/BansheeMissileImpact.m3',
  bulwarkArmMissileLaunch: 'Assets/Effects/Terran/ThorArmMissileLaunch/ThorArmMissileLaunch.m3',
  bulwarkArmMissileImpact: 'Assets/Effects/Terran/ThorArmMissileImpact/ThorArmMissileImpact.m3',
  bulwarkShoulderMissileLaunch: 'Assets/Effects/Terran/ThorShoulderMissileLaunch/ThorShoulderMissileLaunch.m3',
  bulwarkChestMissileImpact: 'Assets/Effects/Terran/ThorChestMissileImpact/ThorChestMissileImpact.m3',
  jackknifeAssaultWeaponLaunch: 'Assets/Effects/Terran/VikingAssaultWeaponLaunch/VikingAssaultWeaponLaunch.m3',
  jackknifeAssaultWeaponImpact: 'Assets/Effects/Terran/VikingAssaultWeaponImpact/VikingAssaultWeaponImpact.m3',
  torchrunnerBeamImpact: 'Assets/Effects/Terran/HellionBeamImpact/HellionBeamImpact.m3',
  // The Wraith's: Burst Lasers (a ribbon the engine doesn't draw: its glow stands in) and Gemini Missiles.
  swiftLaserMissile: 'Assets/Effects/Terran/WraithLaserMissile/WraithLaserMissile.m3',
  swiftLaserMissileImpact: 'Assets/Effects/Terran/WraithLaserMissileImpact/WraithLaserMissileImpact.m3',
  swiftMissile: 'Assets/Effects/Terran/WraithMissile/WraithMissile.m3',
  swiftMissileImpact: 'Assets/Effects/Terran/WraithMissileImpact/WraithMissileImpact.m3',
  bulwarkMissile: 'Assets/Effects/Terran/ThorShoulderMissile/ThorShoulderMissile.m3',
  // The Tide's air power and economy: the Starport's and Factory's machines, the SCVs and the
  // mineral field and refinery they work, and the swarm's Overlords and Corruptors.
  rigger: 'Assets/Units/Terran/SCV/SCV.m3',
  riggerDeath: 'Assets/Units/Terran/SCVDeath/SCVDeath.m3',
  jackknifeFighter: 'Assets/Units/Terran/VikingFighter/VikingFighter.m3',
  jackknifeFighterDeath: 'Assets/Units/Terran/VikingFighterDeath/VikingFighterDeath_00.m3',
  // The Viking landed (Assault Mode), and the rig it transforms on (the end of "Morph Start" is
  // Assault Mode, the end of "Morph End" Fighter Mode, as the Siege Tank's).
  jackknifeAssault: 'Assets/Units/Terran/VikingAssault/VikingAssault.m3',
  jackknifeAssaultDeath: 'Assets/Units/Terran/VikingAssaultDeath/VikingAssaultDeath.m3',
  jackknifeMorph: 'Assets/Units/Terran/VikingMorph/VikingMorph.m3',
  nightjar: 'Assets/Units/Terran/Banshee/Banshee.m3',
  nightjarDeath: 'Assets/Units/Terran/BansheeDeath/BansheeDeath.m3',
  swift: 'Assets/Units/Terran/Wraith/Wraith.m3',
  swiftDeath: 'Assets/Units/Terran/WraithDeath/WraithDeath.m3',
  torchrunner: 'Assets/Units/Terran/Hellion/Hellion.m3',
  torchrunnerDeath: 'Assets/Units/Terran/HellionDeath/HellionDeath.m3',
  bulwark: 'Assets/Units/Terran/Thor/Thor.m3',
  bulwarkDeath: 'Assets/Units/Terran/ThorDeath/ThorDeath_00.m3',
  lantern: 'Assets/Units/Zerg/Overlord/Overlord.m3',
  lanternDeath: 'Assets/Units/Zerg/OverlordDeath/OverlordDeath.m3',
  bilewing: 'Assets/Units/Zerg/Corruptor/Corruptor.m3',
  bilewingDeath: 'Assets/Units/Zerg/CorruptorDeath/CorruptorDeath.m3',
  // The mineral field itself (Crystals_00) draws its crystals with a material the reader doesn't
  // resolve; the crystal clusters the maps scatter are the same minerals in plain materials.
  oreField: 'Assets/Buildings/Resources/Crystals/Crystals_00.m3',
  refinery: 'Assets/Buildings/Terran/Refinery/Refinery.m3',
  // Deaths by how the blow kills (ActorData's DeathArray: burning, acid, torn apart, blown
  // apart), in their Wings of Liberty models (the later Ex1 remakes' emitters aren't read).
  trooperDeathFire: 'Assets/Units/Terran/MarineDeathFire/MarineDeathFire.m3',
  trooperDeathAcid: 'Assets/Units/Terran/MarineDeathAcid/MarineDeathAcid.m3',
  trooperDeathBlast: 'Assets/Units/Terran/MarineDeathBlast/MarineDeathBlast.m3',
  trooperDeathEviscerate: 'Assets/Units/Terran/MarineDeathEviscerate/MarineDeathEviscerate_00.m3',
  trooperDeathEviscerate1: 'Assets/Units/Terran/MarineDeathEviscerate/MarineDeathEviscerate_01.m3',
  houndDeathFire: 'Assets/Units/Zerg/ZerglingDeathFire/ZerglingDeathFire.m3',
  houndDeathAcid: 'Assets/Units/Zerg/ZerglingDeathAcid/ZerglingDeathAcid.m3',
  houndDeathEviscerate: 'Assets/Units/Zerg/ZerglingDeathEviscerate/ZerglingDeathEviscerate_00.m3',
  houndDeathEviscerate1: 'Assets/Units/Zerg/ZerglingDeathEviscerate/ZerglingDeathEviscerate_01.m3',
  quillbackDeathFire: 'Assets/Units/Zerg/HydraliskDeathFire/HydraliskDeathFire.m3',
  quillbackDeathAcid: 'Assets/Units/Zerg/HydraliskDeathAcid/HydraliskDeathAcid.m3',
  shellbackDeathFire: 'Assets/Units/Zerg/RoachDeathFire/RoachDeathFire.m3',
  shellbackDeathAcid: 'Assets/Units/Zerg/RoachDeathAcid/RoachDeathAcid.m3',
  tuskerDeathFire: 'Assets/Units/Zerg/UltraliskDeathFire/UltraliskDeathFire.m3',
  tuskerDeathAcid: 'Assets/Units/Zerg/UltraliskDeathAcid/UltraliskDeathAcid.m3',
  seerDeathFire: 'Assets/Units/Terran/GhostDeathFire/GhostDeathFire.m3',
  seerDeathAcid: 'Assets/Units/Terran/GhostDeathAcid/GhostDeathAcid.m3',
  seerDeathBlast: 'Assets/Units/Terran/GhostDeathBlast/GhostDeathBlast.m3',
  seerDeathEviscerate: 'Assets/Units/Terran/GhostDeathEviscerate/GhostDeathEviscerate.m3',
  miteDeathFire: 'Assets/Units/Zerg/SymbioteDeathFire/SymbioteDeathFire.m3',
  miteDeathAcid: 'Assets/Units/Zerg/SymbioteDeathAcid/SymbioteDeathAcid.m3',
  turnedTrooperDeathFire: 'Assets/Units/Zerg/InfestedMarineDeathFire/InfestedMarineDeathFire.m3',
  turnedTrooperDeathAcid: 'Assets/Units/Zerg/InfestedMarineDeathAcid/InfestedMarineDeathAcid.m3',
  turnedColonistDeathFire: 'Assets/Units/Zerg/InfestedColonistDeathFire/InfestedColonistDeathFire.m3',
  harlanDeathFire: 'Assets/Units/Terran/MarineRaynorDeathFire/MarineRaynorDeathFire.m3',
  grenadierDeathEviscerate: 'Assets/Units/Terran/MarauderDeathEviscerate/MarauderDeathEviscerate.m3',
} as const;

/**
 * The Tide: Unleashed's own (src/game/experimental/unleashed/): Wings of Liberty's classic
 * machines, with their weapons' effect models. Loaded only for that mission, so the rest of the
 * game loads no more than it did.
 */
export const UNLEASHED_MODELS = {
  picket: 'Assets/Units/Terran/Goliath/Goliath.m3',
  picketDeath: 'Assets/Units/Terran/GoliathDeath/GoliathDeath.m3',
  picketAirMissile: 'Assets/Effects/Terran/GoliathAirMissile/GoliathAirMissile.m3',
  picketAirMissileImpact: 'Assets/Effects/Terran/GoliathAirMissileImpact/GoliathAirMissileImpact.m3',
  coyote: 'Assets/Units/Terran/Vulture/Vulture.m3',
  coyoteDeath: 'Assets/Units/Terran/VultureDeath/VultureDeath.m3',
  // The Vulture's grenade: GhostFireSprite at the muzzle, its VultureWeapon flying on GoliathMissile.
  seerFireSprite: 'Assets/Effects/Terran/GhostFireSprite/GhostFireSprite.m3',
  picketMissile: 'Assets/Effects/Terran/GoliathMissile/GoliathMissile.m3',
  scuttleMine: 'Assets/Units/Terran/SpiderMine/SpiderMine.m3',
  // ModelData's SpiderMineExplosion is TerranSmallUnitDeath (SpiderMineExplosion_Low is its low-detail stand-in).
  scuttleMineExplosion: 'Assets/Effects/Terran/TerranSmallUnitDeath/TerranSmallUnitDeath.m3',
  behemoth: 'Assets/Units/Terran/Odin/Odin.m3',
  behemothDeath: 'Assets/Units/Terran/OdinDeath/OdinDeath.m3',
  behemothShoulderMissileImpact: 'Assets/Effects/Terran/OdinShoulderMissileImpact/OdinShoulderMissileImpact.m3',
  // Heart of the Swarm's: the Valkyrie (its campaign's fighter), the Raptor strain of Zergling.
  frigate: 'Assets/Units/Terran/Valkyrie/Valkyrie.m3',
  frigateDeath: 'Assets/Units/Terran/ValkyrieDeath/ValkyrieDeath.m3',
  leaper: 'Assets/Units/Zerg/ZerglingEx1A/ZerglingEx1A.m3',
  leaperDeath: 'Assets/Units/Zerg/ZerglingEx1ADeath/ZerglingEx1ADeath.m3',
  jumpLandDust: 'Assets/Effects/Other/JumpLandDust/JumpLandDust.m3',
  // A walker's footprint where it stamps (the Thor's own).
  bulwarkFootprint: 'Assets/Effects/Terran/ThorFootprint/ThorFootprint_00.m3',
  // The ultimates' own (systems/ultimates.ts): the Firebat's flame (FirebatAttackLaunch), the
  // Reaper's D-8 charges (D8ClusterBomb: MagneticMine, thrown as MagneticMineMissile, landing in
  // ReaperJumpLandDown) and TerranSmallBlast (the clusterbomb's launch, a grenade's burst).
  burnerFireSprite: 'Assets/Effects/Terran/FirebatFireSprite/FirebatFireSprite.m3',
  magneticMine: 'Assets/Units/Terran/MagneticMine/MagneticMine.m3',
  magneticMineMissile: 'Assets/Effects/Terran/MagneticMineMissile/MagneticMineMissile.m3',
  vaulterJumpLandDown: 'Assets/Effects/Terran/ReaperJumpLandDown/ReaperJumpLandDown.m3',
  humanSmallBlast: 'Assets/Effects/Terran/TerranSmallBlast/TerranSmallBlast.m3',
} as const;


/**
 * Animation keys from the campaign's cinematics (.m3a files: a scene's keys for one character),
 * matched to a model's bones by name. The Hyperion scene 06B has a story-mode Marine raise his
 * C-14 in both hands; first person takes its grip from there.
 */
export const ANIMATIONS = {
  trooperGrip: 'Assets/StoryModeCharacters/Terran/SM_Marine01_Dialogue06B/SM_Marine01_Dialogue06B.m3a',
  rifleGrip: 'Assets/StoryModeCharacters/Terran/SM_MarineRifle_Dialogue06B/SM_MarineRifle_Dialogue06B.m3a',
  /** Nova's multiplayer keys: her Stand J Attack holds the C-10 shouldered and level, a hand on the grip and one on the handguard. */
  seerGrip: 'Assets/StoryModeCharacters/Terran/SMX3_Nova_RequiredAnimsMP02/SMX3_Nova_RequiredAnimsMP02.m3a',
} as const;


/**
 * Sky domes for tilesets that have none of their own (StarCraft II's camera never sees those
 * maps' horizon; a soldier on the ground does): Bel'Shir's clouds over Tarsonis, Meinhoff and Agria.
 */
export const SKYBOXES = {
  BelShirSkyBox: 'Assets/Skyboxes/BelShirSkyBox/BelShirSkyBox.m3',
} as const;
/** The cliff tile sets the campaign tilesets build their cliffs from (CliffData's CliffMesh). */
export const CLIFF_SETS = ['CliffNatural0'] as const;

export const SKY_FALLBACK: Record<string, keyof typeof SKYBOXES> = { Tarsonis: 'BelShirSkyBox', Meinhoff: 'BelShirSkyBox', Agria: 'BelShirSkyBox' };

export const TEXTURES = {
  ground: series('Assets/Textures/MarSaraEx2_', 1, 8, '.dds'),
  groundNormal: series('Assets/Textures/MarSaraEx2_', 1, 8, 'Normal.dds'),
  muzzleFlash: 'Assets/Textures/SM_MarineRifle_MuzzleFlash_Emis.dds',
  muzzleSpark: 'Assets/Textures/SM_MarineRifle_MuzzleFlash_Spark_Emis.dds',
  /** The Battlecruiser's laser bolt (its missile's ribbon): a white-hot core in a red-orange glow. */
  laserBolt: 'Assets/Textures/LazerBolt1_Orange_Lines1.dds',
};

const VO = 'LocalizedData/Sounds/TerranUnitVO/Marine/Marine_';

export const SOUNDS = {
  rifle: series('Assets/Sounds/Terran/Marine/Marine_AttackLaunch', 0, 8, '.wav'),
  jolt: series('Assets/Sounds/Terran/Marine/Marine_Stimpack', 0, 7, '.wav'),
  bulletImpact: series('Assets/Sounds/Terran/SharedEffects/BulletImpacts/Terran_SingleBulletAttackImpact', 0, 5, '.wav'),
  /** Marine_AttackImpact: a C-14 burst landing. */
  burstImpact: series('Assets/Sounds/Terran/SharedEffects/BulletImpacts/Terran_MultipleBulletAttackImpact', 0, 4, '.wav'),
  trooperReady: [`${VO}Ready00.ogg`],
  trooperYes: series(`${VO}Yes`, 0, 22, '.ogg', 2),
  trooperAttack: series(`${VO}Attack`, 0, 8, '.ogg', 2),
  trooperPissed: series(`${VO}Pissed`, 0, 7, '.ogg', 2),
  trooperDeath: series(`${VO}Death`, 0, 7, '.wav', 2),
  trooperHelp: [`${VO}Help00.ogg`],
  houndAttack: series('Assets/Sounds/Zerg/Zergling/Zergling_AttackLaunch', 0, 15, '.wav'),
  houndDeath: series('Assets/Sounds/Zerg/Zergling/Zergling_Death', 0, 4, '.wav'),
  houndVoice: series('Assets/Sounds/Zerg/Zergling/Zergling_Attack', 0, 4, '.ogg'),
  quillbackLaunch: series('Assets/Sounds/Zerg/Hydralisk/Hydralisk_AttackLaunchRanged', 0, 3, '.wav'),
  quillbackImpact: series('Assets/Sounds/Zerg/Hydralisk/Hydralisk_AttackImpactRanged', 0, 3, '.wav'),
  quillbackDeath: series('Assets/Sounds/Zerg/Hydralisk/Hydralisk_Death', 0, 5, '.wav'),
  shellbackLaunch: series('Assets/Sounds/Zerg/Roach/Roach_AttackLaunchRanged', 0, 5, '.wav'),
  shellbackImpact: series('Assets/Sounds/Zerg/Roach/Roach_AttackImpactRanged', 0, 9, '.wav'),
  shellbackDeath: series('Assets/Sounds/Zerg/Roach/Roach_Death', 0, 3, '.wav'),
  tuskerLaunch: series('Assets/Sounds/Zerg/Ultralisk/Ultralisk_AttackLaunch', 0, 2, '.wav'),
  tuskerImpact: series('Assets/Sounds/Zerg/Ultralisk/Ultralisk_AttackImpact', 0, 3, '.wav'),
  tuskerDeath: series('Assets/Sounds/Zerg/Ultralisk/Ultralisk_Death', 0, 7, '.wav'),
  tuskerRoar: ['Assets/Sounds/Zerg/Ultralisk/Ultralisk_Roar0.wav'],
  blisterBurst: series('Assets/Sounds/Zerg/Baneling/Baneling_Suicide', 0, 6, '.wav'),
  blisterDeath: series('Assets/Sounds/Zerg/Baneling/Baneling_Death', 0, 9, '.wav'),
  blisterRoll: series('Assets/Sounds/Zerg/Baneling/Baneling_Movement', 0, 4, '.wav'),
  kiteLaunch: series('Assets/Sounds/Zerg/Mutalisk/Mutalisk_AttackLaunch', 0, 5, '.wav'),
  kiteImpact: series('Assets/Sounds/Zerg/Mutalisk/Mutalisk_AttackImpact', 0, 3, '.wav'),
  kiteDeath: series('Assets/Sounds/Zerg/Mutalisk/Mutalisk_Death', 0, 1, '.wav'),
  kiteVoice: series('Assets/Sounds/Zerg/Mutalisk/Mutalisk_Attack', 0, 10, '.ogg', 2),
  sowerLaunch: series('Assets/Sounds/Zerg/BroodLord/BroodLord_AttackLaunch', 0, 4, '.wav'),
  sowerImpact: series('Assets/Sounds/Zerg/BroodLord/BroodLord_AttackImpact', 0, 2, '.wav'),
  sowerDeath: series('Assets/Sounds/Zerg/BroodLord/BroodLord_Death', 0, 4, '.wav'),
  sowerVoice: series('Assets/Sounds/Zerg/BroodLord/BroodLord_Attack', 0, 9, '.ogg'),
  miteDeath: series('Assets/Sounds/Zerg/Broodling/Broodling_Death', 0, 4, '.wav'),
  turretLaunch: series('Assets/Sounds/Terran/MissileTurret/MissileTurret_AttackLaunch', 0, 2, '.wav'),
  // The Queen of Blades' own voice on the battlefield, and the artifact.
  calyxAttack: series('LocalizedData/Sounds/ZergVO/CampaignUnits/Kerrigan/Kerrigan_Attack', 0, 5, '.ogg', 2),
  calyxPissed: series('LocalizedData/Sounds/ZergVO/CampaignUnits/Kerrigan/Kerrigan_Pissed', 0, 8, '.ogg', 2),
  calyxDeath: series('LocalizedData/Sounds/ZergVO/CampaignUnits/Kerrigan/Kerrigan_Death', 0, 1, '.wav', 2),
  artifactHum: ['Assets/Sounds/Uni/Units/Artifact/Artifact1_Stand0.wav'],
  artifactAurora: ['Assets/Sounds/Uni/Units/Artifact/Artifact_EnergyNovaLaunch0.wav'],
  stormLaunch: ['Assets/Sounds/Protoss/HighTemplar/HighTemplar_PsionicStormLaunch0.wav'],
  skyscan: ['Assets/Sounds/Terran/OrbitalCommand/OrbitalCommand_ScannerSweep.wav'],
  dustoffUnload: ['Assets/Sounds/Terran/Medivac/Medivac_Unload0.wav'],
  dustoffEngine: series('Assets/Sounds/Terran/Medivac/Medivac_Movement', 0, 5, '.wav'),
  menderExplode: series('Assets/Sounds/Terran/MULE/MULE_Explode', 0, 2, '.wav'),
  // The MULE's call-down (SoundData's OrbitalCommand_CalldownMuleDrop and _CalldownMuleImpact), and its word as it's out.
  menderDrop: series('Assets/Sounds/Terran/Ghost/Ghost_DropPodImpact', 0, 2, '.wav'),
  menderImpact: series('Assets/Sounds/Terran/DropPod/DropPod_Impact', 0, 2, '.wav'),
  menderReady: series('LocalizedData/Sounds/TerranUnitVO/MULE/Mule_Ready', 0, 1, '.ogg'),
  repair: series('Assets/Sounds/Terran/SCV/SCV_Repair', 0, 5, '.wav'),
  turnedMoan: series('Assets/Sounds/Zerg/InfestedRefugee/InfestedRefugee_Moan', 0, 22, '.wav', 2),
  civilianDeath: series('Assets/Sounds/SI_Civilian_Death_VX_0', 1, 5, '.wav'),
  // The sounds of a death by how the blow kills (SoundData's Uni_DeathFX*).
  deathFire: series('Assets/Sounds/Uni/Deaths/Uni_DeathFXFire', 0, 5, '.wav'),
  deathAcid: series('Assets/Sounds/Uni/Deaths/Uni_DeathFXAcid', 0, 6, '.wav'),
  deathEviscerate: series('Assets/Sounds/Uni/Deaths/Uni_DeathFXEviscerate', 0, 2, '.wav'),
  deathSilent: ['Assets/Sounds/Uni/Deaths/Uni_DeathFXSilentKill0.wav'],
  stormImpact: series('Assets/Sounds/Protoss/HighTemplar/HighTemplar_PsionicStormImpact', 0, 4, '.wav'),
  tankFire: series('Assets/Sounds/Terran/SiegeTank/SiegeTank_SiegeAttackLaunch', 0, 9, '.wav'),
  tankCannon: series('Assets/Sounds/Terran/SiegeTank/SiegeTank_AttackLaunch', 0, 3, '.wav'),
  // SoundData's SiegeTank_AttackImpact: Tank Mode's shell bursting.
  tankShellSmall: series('Assets/Sounds/Terran/SharedEffects/Explosions/SiegeTank_ImpactSmall', 0, 9, '.wav'),
  torchrunnerAttack: series('Assets/Sounds/Terran/Hellion/Hellion_AttackLaunch', 0, 4, '.wav'),
  torchrunnerImpact: series('Assets/Sounds/Terran/Hellion/Hellion_AttackImpact', 0, 4, '.wav'),
  jackknifeFighterAttack: series('Assets/Sounds/Terran/Viking/Viking_FighterAttackLaunch', 0, 2, '.wav'),
  nightjarAttack: series('Assets/Sounds/Terran/Banshee/Banshee_AttackLaunch', 0, 3, '.wav'),
  nightjarImpact: series('Assets/Sounds/Terran/Banshee/Banshee_AttackImpact', 0, 2, '.wav'),
  swiftGroundImpact: series('Assets/Sounds/Terran/Wraith/Wraith_GroundAttackImpact', 0, 4, '.wav'),
  // The Thor's own (SoundData's Thor_HandGunAttackLaunch and Thor_AntiAirAttackImpact).
  bulwarkAttack: series('Assets/Sounds/Terran/Thor/Thor_AttackLaunch', 0, 2, '.wav'),
  bulwarkImpact: series('Assets/Sounds/Terran/Thor/Thor_AttackImpact', 0, 2, '.wav'),
  braceMorph: ['Assets/Sounds/Terran/SiegeTank/SiegeTank_MorphToSiege.wav'],
  unbraceMorph: ['Assets/Sounds/Terran/SiegeTank/SiegeTank_MorphToTank.wav'],
  jackknifeToAssault: ['Assets/Sounds/Terran/Viking/Viking_MorphToAssault0.wav'],
  jackknifeToFighter: ['Assets/Sounds/Terran/Viking/Viking_MorphToFighter0.wav'],
  jackknifeGatling: series('Assets/Sounds/Terran/Viking/Viking_AssaultAttackLaunch', 0, 4, '.wav'),
  explosion: series('Assets/Sounds/Terran/SiegeTank/SiegeTank_SiegeAttackImpact', 0, 4, '.wav'),
  buildingExplosion: ['02', '04', '07', '10', '11', '12'].map((n) => `Assets/Sounds/Uni/Deaths/Vehicle_Explo_${n}.wav`),
  baseUnderAttack: ['LocalizedData/Sounds/TerranUnitVO/Adjutant/Alert_TerranBaseUnderAttack.ogg'],
  forcesUnderAttack: ['LocalizedData/Sounds/TerranUnitVO/Adjutant/Alert_TerranForcesUnderAttack.ogg'],
  transmission: ['LocalizedData/Sounds/TerranUnitVO/Adjutant/IncomingTransmission.ogg'],
  keelGunCharge: ['Assets/Sounds/Terran/Battlecruiser/Battlecruiser_YamatoAttackCharge0.wav'],
  keelGunLaunch: ['Assets/Sounds/Terran/Battlecruiser/Battlecruiser_YamatoAttackLaunch0.wav'],
  warshipVoice: series('LocalizedData/Sounds/TerranUnitVO/Battlecruiser/Battlecruiser_Attack', 0, 5, '.ogg', 2),
  // The campaign infantry's weapons.
  grenadierLaunch: series('Assets/Sounds/Terran/Marauder/Marauder_AttackLaunch', 0, 5, '.wav'),
  grenadierImpact: series('Assets/Sounds/Terran/Marauder/Marauder_Explode', 0, 6, '.wav'),
  burnerLaunch: series('Assets/Sounds/Terran/Firebat/Firebat_AttackLaunch', 0, 4, '.wav'),
  seerLaunch: series('Assets/Sounds/Terran/Ghost/Ghost_AttackLaunch', 0, 2, '.wav'),
  seerDeath: series('LocalizedData/Sounds/TerranUnitVO/Ghost/Ghost_Death', 0, 5, '.wav', 2),
  vaulterLaunch: series('Assets/Sounds/Terran/Reaper/Reaper_AttackLaunch', 0, 5, '.wav'),
  // Class abilities: the Ghost's cloak and nuke (with the Adjutant's famous warning), the
  // Reaper's jet pack, the Medic's heal.
  warheadAlert: ['LocalizedData/Sounds/TerranUnitVO/Adjutant/Alert_TerranCalldownLaunch.ogg'],
  warheadReady: ['LocalizedData/Sounds/TerranUnitVO/Adjutant/Alert_TerranNukeReady.ogg'],
  warheadLaunch: ['Assets/Sounds/Terran/Ghost/Ghost_NuclearStrikeLaunch0.wav'],
  warheadDrop: ['Assets/Sounds/Terran/Ghost/Ghost_NuclearStrikeDrop0.wav'],
  warheadImpact: ['Assets/Sounds/Terran/Ghost/Ghost_NuclearStrikeImpact0.wav'],
  warheadExplosion: series('Assets/Sounds/Nuke_Explo_0', 1, 6, '.wav'),
  warheadIncoming: ['Assets/Sounds/Nuke_Incoming.wav'],
  shroudOn: ['Assets/Sounds/Terran/Ghost/Ghost_CloakOn.wav'],
  shroudOff: ['Assets/Sounds/Terran/Ghost/Ghost_CloakOff.wav'],
  jetLaunch: ['Assets/Sounds/Terran/Reaper/Reaper_JumpLaunch0.wav'],
  jetLand: ['Assets/Sounds/Terran/Reaper/Reaper_JumpLand0.wav'],
  healStart: ['Assets/Sounds/Terran/Medivac/Medivac_HealStart.wav'],
  healLoop: ['Assets/Sounds/Terran/Medivac/Medivac_HealLoop.wav'],
  grenadierReady: ['LocalizedData/Sounds/TerranUnitVO/Marauder/Marauder_Ready00.ogg'],
  seerReady: ['LocalizedData/Sounds/TerranUnitVO/Ghost/Ghost_Ready00.ogg'],
  vaulterReady: ['LocalizedData/Sounds/TerranUnitVO/Reaper/Reaper_Ready00.ogg'],
  // Layers for kills and blasts: the squelch of a Zerg bursting, Terran explosions by size.
  crawlGoreSmall: series('Assets/Sounds/Zerg/SharedEffects/Explosions/Zerg_ExplosionSmall', 0, 6, '.wav'),
  crawlGoreMedium: series('Assets/Sounds/Zerg/SharedEffects/Explosions/Zerg_ExplosionMedium', 0, 6, '.wav'),
  crawlGoreLarge: series('Assets/Sounds/Zerg/SharedEffects/Explosions/Zerg_ExplosionLarge', 0, 4, '.wav'),
  humanExplosionSmall: series('Assets/Sounds/Terran/SharedEffects/Explosions/Terran_ExplosionSmall', 0, 9, '.wav'),
  humanExplosionMedium: series('Assets/Sounds/Terran/SharedEffects/Explosions/Terran_ExplosionMedium', 0, 9, '.wav'),
  humanExplosionLarge: series('Assets/Sounds/Terran/SharedEffects/Explosions/Terran_ExplosionLarge', 0, 9, '.wav'),
  shellImpact: series('Assets/Sounds/Terran/SharedEffects/Explosions/SiegeTank_ImpactMedium', 0, 9, '.wav'),
  tuskerBodyfall: series('Assets/Sounds/Ultralisk_Death_Bodyfall_Impact_0', 1, 5, '.wav'),
  warshipBattery: series('Assets/Sounds/Terran/Battlecruiser/Battlecruiser_AttackLaunch', 0, 2, '.wav'),
  warshipLaser: series('Assets/Sounds/Battlecruiser_LaserFire_', 1, 5, '.wav', 2),
  /** The ATS Laser Battery's launch (SoundData's Battlecruiser_GroundAttackLaunch). */
  warshipGround: series('Assets/Sounds/Terran/Battlecruiser/Battlecruiser_MissilePodsLaunch', 0, 4, '.wav'),
  hyperspaceOut: series('Assets/Sounds/Battlecruiser_HyperspaceOut', 1, 3, '.wav', 2),
  hyperspaceIn: series('Assets/Sounds/Unused/Battlecruiser_HyperspaceIn', 1, 3, '.wav', 2),
  uiHover: ['Assets/Sounds/Uni/UI/UI_ActionButtonHover0.wav'],
  uiSelect: ['Assets/Sounds/Uni/UI/UI_ActionButtonSelect0.wav'],
  uiClick: series('Assets/Sounds/UI_ClickSweet_0', 1, 4, '.wav'),
  // Beds that loop under everything.
  ambienceCalder: ['Assets/Sounds/Uni/Ambience/Tilesets/Ambience_MarSara.ogg'],
  distantBattle: ['Assets/Sounds/Uni/Ambience/Sets/Ambience_CharSetDistantBattle.ogg'],
  // Music stingers (the mission music itself streams; see MUSIC).
  stingerIntro: [...'abcdef'].map((c) => `Assets/Music/MissionMusic/LibertyMusicStingerIntro_${c}.ogg`),
  stingerTense: [...'abcd'].map((c) => `Assets/Music/MissionMusic/LibertyMusicTenseStinger_${c}.ogg`),
};

/**
 * The Wings of Liberty mission score, streamed. Each mood is one piece; several are stems of
 * the same recording with layers taken out, which the music director crossfades by intensity.
 */
export const MUSIC = {
  calm: 'Assets/Music/MissionMusic/music_lowtensioninspriational_noguitarsnohorns.ogg',
  tension: 'Assets/Music/MissionMusic/music_rhythmictensionambient.ogg',
  tensionFull: 'Assets/Music/MissionMusic/music_rhythmictensionfull.ogg',
  combat: 'Assets/Music/MissionMusic/music_actionscary.ogg',
  danger: 'Assets/Music/MissionMusic/music_dangeralertfull.ogg',
  victory: 'Assets/Music/MissionMusic/music_darkvictory_full.ogg',
  defeat: 'Assets/Music/MissionMusic/music_tragicbattlefieldfull.ogg',
  menu: 'Assets/Music/MissionMusic/music_lowtensioninspriational_full.ogg',
} as const;


/** The Tide: Unleashed's own sounds, loaded only for it (as UNLEASHED_MODELS). */
export const UNLEASHED_SOUNDS = {
  picketAttack: series('Assets/Sounds/Terran/Goliath/Goliath_GroundAttackLaunch', 0, 2, '.wav'),
  coyoteAttack: series('Assets/Sounds/Terran/Vulture/Vulture_AttackLaunch', 0, 3, '.wav'),
  scuttleMinePlace: series('Assets/Sounds/Terran/Vulture/Vulture_SpiderMinePlace', 0, 2, '.wav'),
  scuttleMineBurrow: series('Assets/Sounds/Terran/Vulture/Vulture_SpiderMineBurrow', 0, 2, '.wav'),
  scuttleMineSeek: series('Assets/Sounds/Terran/Vulture/Vulture_SpiderMineSeek', 0, 2, '.wav'),
  frigateImpact: series('Assets/Sounds/Uni_ImpactExplosions_', 0, 9, '.wav', 2),
  frigateAttack: series('Assets/Sounds/Valkyrie_AttackLaunch_', 0, 9, '.wav', 2),
  leaperJump: series('Assets/Sounds/Raptor_Jump', 0, 2, '.wav', 2),
  leaperLand: series('Assets/Sounds/Zerg_Small_Land', 0, 2, '.wav', 2),
  // A D-8 charge going off (SoundData's Reaper_D8ChargeExplode), and the Reaper calling it.
  d8Explode: series('Assets/Sounds/Reaper_KD8ChargeExplosion', 1, 4, '.wav', 2),
  d8Voice: ['LocalizedData/Sounds/TerranUnitVO/Reaper/Reaper_D8Charge00.ogg'] as string[],
} as const;


/**
 * Game data catalogs, read from every mod in the melee stack and merged in order. StarCraft II's
 * own multiplayer chain leaves out libertymulti and swarmmulti; they stay here on purpose: the
 * game was balanced on them (a sieged tank fires every 2.8 s, not the chain's 3), so don't drop them.
 */
export const DATA_ROOTS = ['core', 'liberty', 'libertymulti', 'swarm', 'swarmmulti', 'void', 'voidmulti'].map((m) => `mods/${m}.sc2mod`);
/**
 * The Wings of Liberty campaign's own unit data, over the melee stack: for units that only
 * exist in the campaign (Raynor, the Firebat, the Medic, the Dominion's set pieces).
 */
export const CAMPAIGN_ROOTS = ['campaigns/liberty.sc2campaign', 'campaigns/libertystory.sc2campaign'];
/**
 * The Heart of the Swarm campaign's own unit data, over the Wings of Liberty campaign's: loaded
 * only where a mission asks for it (The Tide: Unleashed's Valkyrie and Raptors).
 */
export const SWARM_CAMPAIGN_ROOTS = ['campaigns/swarm.sc2campaign'];
/** Unit, weapon and ability numbers: the melee stack only, so the numbers are multiplayer's. */
export const DATA_CATALOGS = ['UnitData', 'WeaponData', 'EffectData', 'BehaviorData', 'AbilData', 'MoverData'];
/**
 * How things look and sound (actors, models, terrain textures, tilesets, lighting): the melee
 * stack plus the Wings of Liberty campaign's own data, which the campaign maps' doodads use.
 */
export const ART_ROOTS = [...DATA_ROOTS, 'campaigns/liberty.sc2campaign'];
export const ART_CATALOGS = ['ActorData', 'ModelData', 'TerrainTexData', 'TerrainData', 'LightData'];

export function dataFile(root: string, catalog: string): string {
  return `${root}/base.sc2data/gamedata/${catalog.toLowerCase()}.xml`;
}

// Every name the game asks for has its file here, and there's nothing here it doesn't ask for.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const covered: [
  Same<keyof typeof MODELS | keyof typeof UNLEASHED_MODELS, ModelName>,
  Same<keyof typeof ANIMATIONS, AnimationName>,
  Same<keyof typeof MUSIC, MusicName>,
  Same<keyof typeof SOUNDS | keyof typeof UNLEASHED_SOUNDS, SoundName>,
] = [true, true, true, true];
void covered;
