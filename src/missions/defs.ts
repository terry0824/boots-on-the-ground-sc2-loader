// The missions that play on StarCraft II's maps: Wings of Liberty's campaign, the special operations,
// the modes beside them. The game adds them among its own by \`order\` (src/game/missions.ts).

import { HOLD_WAVES, type MissionDef } from '../../../../src/game/missions.ts';

export const MISSIONS: MissionDef[] = [
  {
    id: 'boot-camp',
    order: 10,
    act: 1,
    title: 'Boot Camp',
    planet: 'Mar Sara',
    map: 'traynor03',
    kind: 'training',
    summary: 'Learn the rifle, the Stimpack, the bunker, the tank and the call-ins.',
    briefing: {
      speaker: 'Sgt. Dana Rourke',
      portrait: 'trooper',
      lines: [
        "Welcome to the Raiders, Corporal. We're short on everything but trouble, so you learn fast.",
        "Run the drills at the colony base. Then we'll see what you're made of. Something's been eating the cattle on the north range.",
      ],
    },
    objectives: [
      { id: 'move', text: 'Reach the drill marker' },
      { id: 'shoot', text: 'Destroy the training targets' },
      { id: 'jolt', text: 'Use a Stimpack' },
      { id: 'keelGun', text: 'Call a Yamato Cannon strike' },
      { id: 'skyscan', text: 'Find the burrowed Zergling with a Scanner Sweep (hold T)' },
      { id: 'bunker', text: 'Garrison a bunker' },
      { id: 'tank', text: 'Take a Siege Tank and siege up' },
      { id: 'pack', text: 'Stop the Zergling pack', hidden: true },
    ],
    reward: { xp: 400, credits: 300 },
  },
  {
    id: 'liberation-day',
    order: 20,
    echo: ['rourke', 'vey', 'marrow'],
    prewarm: [
      { team: 'directorate', models: ['trooper', 'trooperDeath', 'burner', 'burnerDeath'] },
      { team: 'holdouts', models: ['harlan', 'harlanDeath', 'grenadier', 'grenadierDeath', 'medic', 'medicDeath'] },
    ],
    act: 1,
    title: 'Liberation Day',
    planet: 'Mar Sara',
    map: 'traynor01',
    kind: 'assault',
    summary: "Raynor's Raiders take Riksville back from the Dominion, street by street.",
    requires: 'boot-camp',
    briefing: {
      speaker: 'Jim Raynor',
      portrait: 'harlan',
      lines: [
        "Mengsk's Dominion has had its boot on Mar Sara's neck long enough. Today we take it off.",
        "Break their roadblock, take Riksville's square, free the Transport Yard, storm their compound, and bring down the tower that pumps his lies into every home on this rock.",
      ],
    },
    objectives: [
      { id: 'roadblock', text: 'Break the Dominion roadblock' },
      { id: 'seer', text: 'Find out what happened in Ghost Town', hidden: true },
      { id: 'square', text: 'Secure Riksville Town Square (A)' },
      { id: 'hold', text: 'Hold the square against the counter-attack', hidden: true },
      { id: 'yard', text: 'Free the Transport Yard (B)' },
      { id: 'compound', text: 'Storm the Dominion Compound (C)' },
      { id: 'tower', text: 'Destroy the Logistical Headquarters' },
      { id: 'billboards', text: "Destroy Mengsk's billboards", bonus: true },
    ],
    reward: { xp: 1600, credits: 1100 },
  },
  {
    id: 'zero-hour',
    order: 30,
    fallback: true,
    echo: ['rourke', 'vey', 'marrow', 'briggs'],
    act: 1,
    title: 'Zero Hour',
    planet: 'Mar Sara',
    map: 'traynor03',
    kind: 'defense',
    summary: 'The swarm comes for the colony. Hold the base until the Hyperion can lift the survivors.',
    requires: 'liberation-day',
    briefing: {
      speaker: 'Matt Horner',
      portrait: 'ashby',
      lines: [
        "The Zerg are overrunning Mar Sara. The Dominion's pulled out and left the colonists to die.",
        "The Hyperion needs time to load the survivors. Hold that base. Every minute you buy is a hundred lives.",
      ],
    },
    objectives: [
      { id: 'waves', text: 'Survive every wave' },
      { id: 'cc', text: 'The Command Center must survive' },
      { id: 'bunkers', text: 'Lose no bunkers', bonus: true, keep: true },
      { id: 'kills', text: 'Kill 120 Zerg yourself', bonus: true },
      { id: 'healthy', text: 'Command Center above half health', bonus: true, keep: true },
    ],
    reward: { xp: 1200, credits: 900 },
    waves: HOLD_WAVES,
  },
  {
    id: 'evacuation',
    order: 40,
    echo: ['rourke', 'vey', 'marrow'],
    prewarm: [{ team: 'holdouts', models: ['harlan', 'harlanDeath', 'grenadier', 'grenadierDeath', 'medic', 'medicDeath', 'colonistHauler', 'colonistHaulerDeath'] }],
    act: 2,
    title: 'The Evacuation',
    planet: 'Agria',
    map: 'thanson01',
    kind: 'escort',
    summary: "Dr. Hanson's colonists make for the starport across the causeway. The Zerg are waiting at every choke.",
    requires: 'zero-hour',
    briefing: {
      speaker: 'Matt Horner',
      portrait: 'ashby',
      lines: [
        "Agria. The infestation's spreading from the south, and Dr. Hanson's colony is the last one standing. Four haulers, every family that's left.",
        "The causeway's the only road to the starport. The Zerg know it too. Keep those trucks moving, and keep them alive.",
      ],
    },
    objectives: [
      { id: 'convoy', text: 'Escort the convoy to the starport' },
      { id: 'load', text: 'Hold the starport while the colonists board', hidden: true },
      { id: 'all', text: 'Lose no transports', bonus: true, keep: true },
      { id: 'kills', text: 'Kill 120 Zerg yourself', bonus: true },
    ],
    reward: { xp: 2000, credits: 1400 },
  },
  {
    id: 'outbreak',
    order: 50,
    echo: ['rourke', 'vey', 'marrow', 'briggs'],
    prewarm: [
      { team: 'crawl', models: ['turnedColonist', 'turnedColonistDeath', 'turnedTrooper', 'turnedTrooperDeath', 'swollen', 'swollenDeath'] },
      { team: 'holdouts', models: ['burner', 'burnerDeath', 'medic', 'medicDeath'] },
    ],
    act: 2,
    title: 'Outbreak',
    planet: 'Meinhoff',
    map: 'thanson02',
    kind: 'daynight',
    night: 'MeinhoffCampaignNight',
    summary: "Meinhoff's colonists have turned. Burn their nests by day; hold the base by night.",
    requires: 'evacuation',
    briefing: {
      speaker: 'Matt Horner',
      portrait: 'ashby',
      lines: [
        "Meinhoff. The infestation took this colony in a week. What's out there now walks like the colonists did, but it isn't them.",
        "In daylight they shelter in the huts and domes. Burn every nest you can find before dark, because when night falls, they come out of whatever's still standing.",
      ],
    },
    objectives: [
      { id: 'buildings', text: 'Burn out the infested buildings' },
      { id: 'nights', text: 'Hold the base through the night', hidden: true },
      { id: 'cc', text: 'The Command Center must survive', keep: true },
      { id: 'aberrations', text: "Kill the colony's five Aberrations", bonus: true },
      { id: 'kills', text: 'Kill 120 infested yourself', bonus: true },
    ],
    reward: { xp: 2400, credits: 1700 },
  },
  {
    id: 'all-in',
    order: 60,
    echo: ['rourke', 'vey', 'marrow', 'briggs'],
    prewarm: [
      { team: 'crawl', models: ['blister', 'blisterDeath', 'kite', 'kiteDeath', 'sower', 'sowerDeath', 'mite', 'miteDeath', 'calyx'] },
      { team: 'holdouts', models: ['grenadier', 'grenadierDeath', 'medic', 'medicDeath', 'howitzerMorph', 'howitzerBracedDeath'] },
    ],
    act: 3,
    title: 'All In',
    planet: 'Char',
    map: 'tvalerian03',
    kind: 'defense',
    summary: "The Xel'Naga artifact, the Queen of Blades' own world, and everything the Raiders have left. Hold until it fires.",
    requires: 'outbreak',
    finale: true,
    briefing: {
      speaker: 'Jim Raynor',
      portrait: 'harlan',
      lines: [
        "This is it. The artifact's on Char, in a containment rig on the only high ground we could hold, and it needs time to charge.",
        "Kerrigan knows what it is. She'll throw the whole Swarm at us: ground, air, and herself. We hold until that thing fires. All of us. All in.",
        "And Corporal: when it fires, it burns out every psionic link on this planet. The Hyperion's relay with it. I won't order you to stay. Echo says you will.",
      ],
    },
    objectives: [
      { id: 'charge', text: 'Protect the artifact while it charges' },
      { id: 'nova', text: 'Release an Energy Nova (G)', hidden: true },
      { id: 'calyx', text: 'Drive off the Queen of Blades', hidden: true },
      { id: 'kills', text: 'Kill 120 Zerg yourself', bonus: true },
      { id: 'broodlord', text: 'Bring down a Brood Lord yourself', bonus: true, hidden: true },
      { id: 'bunkers', text: 'Lose no bunkers', bonus: true, keep: true },
    ],
    reward: { xp: 3200, credits: 2200 },
    rules: { shipFights: true },
  },
  {
    id: 'frontline-tarsonis',
    order: 80,
    tile: { order: 4, kicker: 'Frontline', title: 'Tarsonis', text: () => 'Two armies, a lattice of bases, the Zerg in the east. Deploy anywhere you hold.' },
    prewarm: [
      { team: 'directorate', models: ['trooper', 'trooperDeath', 'grenadier', 'grenadierDeath', 'burner', 'burnerDeath', 'medic', 'medicDeath', 'howitzerMorph', 'howitzerBracedDeath'] },
      { team: 'holdouts', models: ['grenadier', 'grenadierDeath', 'burner', 'burnerDeath', 'medic', 'medicDeath'] },
    ],
    act: 0,
    title: 'Frontline: Tarsonis',
    planet: 'Tarsonis',
    map: 'thorner01',
    kind: 'frontline',
    summary: 'The war, PlanetSide style: two armies, a lattice of bases across the ruined capital, the Zerg in the east. Deploy anywhere you hold.',
    briefing: {
      speaker: 'Matt Horner',
      portrait: 'ashby',
      lines: [
        "Tarsonis. The old Confederate capital, what the Zerg left of it. The Dominion holds the ruins, and something's crawled out of the east to join the party.",
        'Every base we hold scores. Take them along the lattice, hold them, and push until Mengsk runs out of soldiers or we run out of city.',
      ],
    },
    objectives: [
      { id: 'win', text: 'Reach 1000 points before the Dominion' },
      { id: 'east', text: 'Clear the Zerg from the eastern outposts', bonus: true },
    ],
    reward: { xp: 2000, credits: 1500 },
  },
  {
    id: 'the-tide',
    order: 90,
    prewarm: [
      { team: 'crawl', models: ['blister', 'blisterDeath', 'kite', 'kiteDeath', 'sower', 'sowerDeath', 'mite', 'miteDeath', 'tusker', 'tuskerDeath'] },
      { team: 'holdouts', models: ['grenadier', 'grenadierDeath', 'burner', 'burnerDeath', 'medic', 'medicDeath', 'seer', 'seerDeath', 'howitzerMorph', 'howitzerBracedDeath', 'mender', 'menderDeath', 'rigger', 'riggerDeath', 'jackknifeFighter', 'jackknifeFighterDeath', 'nightjar', 'nightjarDeath', 'torchrunner', 'torchrunnerDeath', 'bulwark', 'bulwarkDeath'] },
      { team: 'crawl', models: ['lantern', 'lanternDeath', 'bilewing', 'bilewingDeath'] },
    ],
    act: 0,
    title: 'The Tide',
    planet: 'Char',
    map: 'tvalerian03',
    kind: 'tide',
    allOpen: true,
    rules: {
      // SCVs build Bunkers and Missile Turrets where they're placed; the production buildings
      // are in the catalog but not allowed here (yet): allow them and they add bays.
      build: { allow: ['bunker', 'flakTower'], limit: { bunker: 10, flakTower: 16 }, sites: 3 },
      // Back in the fight 4 s after the static, 2 s more for each other death in the last
      // minute (10 s at most); the wait holds for taking over a soldier too.
      respawn: { delay: 4, perDeath: 2, window: 60, max: 10, gateDive: true },
      // Every 10 kills without going down: kills pay 10% more, up to half again.
      streak: { every: 10, step: 0.1, max: 1.5 },
      drive: { vehicles: true, aircraft: true },
      // Two Medivacs from the Starport pull a line's soldiers out to its fallback; a minute to turn round.
      evac: { dustoffs: 2, cooldown: 60 },
      // The Hyperion jumps in where it's called: 25 s with ten batteries on ten targets at once round
      // the mark, each bolt at 4.5 times the data (36 at the ground: a Zergling in one, a Hydralisk
      // in three; 22 at flyers), and a Yamato at the toughest thing there; then home for 90 s.
      warship: { seconds: 25, recharge: 90, batteries: 10, radius: 140, damage: 4.5 },
      // Standard, Large or Epic on the menu (Epic unless the player picks): the swarm grows to
      // that multiple of itself, and the Raiders can be built up from their 200 to the same.
      size: { default: 'epic' },
    },
    summary: 'Two hundred against two hundred on Char, and the swarm never stops coming. Every soldier the Raiders have left holds the line until the fleet makes orbit.',
    briefing: {
      speaker: 'Jim Raynor',
      portrait: 'harlan',
      lines: [
        "Every soldier the Raiders have left is on this ridge. Two hundred strong. Marines, Marauders, Firebats, Medics, eight tanks dug in behind them.",
        "And everything on Char is coming to meet us. When they kill you, and they will, the Barracks put you back in a suit and you go again. When the line thins, they send out what they've got.",
        'The fleet needs time to make orbit. We give it that time. Nobody runs.',
      ],
    },
    objectives: [
      { id: 'hold', text: 'Hold until the fleet makes orbit' },
      { id: 'cc', text: 'The Command Center must survive' },
      { id: 'line', text: 'Never let the line fall below a quarter strength', bonus: true, keep: true },
      { id: 'kills', text: 'Kill 120 Zerg yourself', bonus: true },
    ],
    reward: { xp: 2400, credits: 1600 },
  },
  {
    id: 'the-tide-unleashed',
    order: 100,
    tile: { order: 2, kicker: 'Experimental', title: 'The Tide: Unleashed', text: () => 'Every machine at its real-world power, against a swarm several times as big and faster.', className: 'tile-alarm' },
    prewarm: [
      { team: 'crawl', models: ['blister', 'blisterDeath', 'kite', 'kiteDeath', 'sower', 'sowerDeath', 'mite', 'miteDeath', 'tusker', 'tuskerDeath'] },
      { team: 'holdouts', models: ['grenadier', 'grenadierDeath', 'burner', 'burnerDeath', 'medic', 'medicDeath', 'seer', 'seerDeath', 'howitzerMorph', 'howitzerBracedDeath', 'mender', 'menderDeath', 'rigger', 'riggerDeath', 'jackknifeFighter', 'jackknifeFighterDeath', 'nightjar', 'nightjarDeath', 'torchrunner', 'torchrunnerDeath', 'bulwark', 'bulwarkDeath'] },
      { team: 'crawl', models: ['lantern', 'lanternDeath', 'bilewing', 'bilewingDeath'] },
    ],
    act: 0,
    title: 'The Tide: Unleashed',
    planet: 'Char',
    map: 'tvalerian03',
    kind: 'tide',
    experimental: true,
    allOpen: true,
    rules: {
      build: { allow: ['bunker', 'flakTower'], limit: { bunker: 10, flakTower: 16 }, sites: 3 },
      respawn: { delay: 4, perDeath: 2, window: 60, max: 10, gateDive: true },
      streak: { every: 10, step: 0.1, max: 1.5 },
      drive: { vehicles: true, aircraft: true },
      evac: { dustoffs: 2, cooldown: 60 },
      // The Hyperion is a call-in any body can make (X), first ready two and a half minutes in and
      // three minutes after each strike; F is each body's own ultimate (session.ts, ultimate.ts).
      warship: { seconds: 25, recharge: 180, batteries: 10, radius: 140, damage: 4.5, first: 150, manual: true },
      ultimates: 'unit',
      // The base down in a valley, the swarm pouring down at it from the heights.
      valley: true,
      size: { default: 'standard' },
      // Sizes tried here first: the Thor and the Brood Lord at the scale chart's, the Viking smaller.
      sizes: { bulwark: 20, sower: 32, jackknifeFighter: 10 },
      // The cinematic's air: thick, pale and backlit, swallowing what's far off.
      haze: { density: 2.3, color: 0xd8dad2, mix: 0.6 },
      unleashed: true,
      // Aircraft fly as fighters do (their reach is in power.ts, with every machine's).
      machines: { flight: 3.5 },
      // A Thor in the swarm is surrounded by as many Zerglings as fit round it, an aircraft by all the fire in reach.
      tokensBySize: true,
    },
    summary: 'Every machine hits as hard as its size says it should. The swarm wins only by numbers, and it has the numbers. Experimental.',
    briefing: {
      speaker: 'Jim Raynor',
      portrait: 'harlan',
      lines: [
        "Every war machine the Raiders could steal, buy or bolt together is on this ridge. A Siege Tank shell here clears a street. A Thor walks through Zerglings.",
        "Doesn't matter. Char's sending more of them than there are rounds in the base, and faster than anything you've seen. They'll run right over anything that stands still.",
        'Hold until the fleet makes orbit. Spend what you earn on the big guns. And try to look up now and then.',
      ],
    },
    objectives: [
      { id: 'hold', text: 'Hold until the fleet makes orbit' },
      { id: 'cc', text: 'The Command Center must survive' },
      { id: 'line', text: 'Never let the line fall below a quarter strength', bonus: true, keep: true },
      { id: 'kills', text: 'Kill 500 Zerg yourself', bonus: true, count: 500 },
    ],
    reward: { xp: 0, credits: 0 },
  },
  {
    id: 'practice-range',
    order: 110,
    tile: { order: 3, kicker: 'Practice · Experimental', title: 'Practice Range', text: () => 'Any unit of Unleashed, its ultimate on a quick recharge, and targets you call up.', className: 'tile-range' },
    prewarm: [
      { team: 'crawl', models: ['blister', 'blisterDeath', 'kite', 'kiteDeath', 'sower', 'sowerDeath', 'mite', 'miteDeath', 'tusker', 'tuskerDeath'] },
      { team: 'holdouts', models: ['grenadier', 'grenadierDeath', 'burner', 'burnerDeath', 'medic', 'medicDeath', 'seer', 'seerDeath', 'howitzerMorph', 'howitzerBracedDeath', 'mender', 'menderDeath', 'rigger', 'riggerDeath', 'jackknifeFighter', 'jackknifeFighterDeath', 'nightjar', 'nightjarDeath', 'torchrunner', 'torchrunnerDeath', 'bulwark', 'bulwarkDeath'] },
      { team: 'crawl', models: ['lantern', 'lanternDeath', 'bilewing', 'bilewingDeath'] },
    ],
    act: 0,
    title: 'Practice Range',
    planet: 'Char',
    map: 'tvalerian03',
    kind: 'practice',
    experimental: true,
    allOpen: true,
    // On the menus for now; `hidden: true` takes it off them (it stays playable by its link).
    rules: {
      drive: { vehicles: true, aircraft: true },
      // Back in a body a second after losing one (with invulnerability off).
      respawn: { delay: 1, perDeath: 0, window: 60, max: 1 },
      // The Hyperion on X as in Unleashed, ready from the start and again half a minute after each strike.
      warship: { seconds: 25, recharge: 30, batteries: 10, radius: 140, damage: 4.5, manual: true },
      ultimates: 'unit',
      // The Tide: Unleashed's own ground, power, sizes, air and machines: what's tried here plays the same there.
      valley: true,
      sizes: { bulwark: 20, sower: 32, jackknifeFighter: 10 },
      haze: { density: 2.3, color: 0xd8dad2, mix: 0.6 },
      unleashed: true,
      machines: { flight: 3.5 },
      tokensBySize: true,
      // What the range's panel (G) starts at.
      practice: { ultimate: 'instant', targets: 'still', distance: 60, respawn: true, invulnerable: true, swarm: 'off' },
    },
    summary: 'Every unit of The Tide: Unleashed, with its own ultimate on a quick recharge, and targets you call up. Try anything.',
    briefing: {
      speaker: 'Matt Horner',
      portrait: 'ashby',
      lines: [
        "The range is yours, Corporal. Every machine the Raiders have, every soldier's kit, and the Zerg we've penned for target practice.",
        'Press G to take any unit and call up targets. Ultimates recharge in seconds here, and Z fills yours at once. Learn what each one does before you need it.',
      ],
    },
    objectives: [{ id: 'try', text: 'G: take any unit, call up targets · Z: recharge your ultimate' }],
    reward: { xp: 0, credits: 0 },
  },
  {
    id: 'last-stand',
    order: 120,
    tile: { order: 1, kicker: 'Survival', title: 'Last Stand', text: (p) => `Endless waves on Zero Hour. Best: wave ${p.lastStandBest || '—'}.` },
    act: 0,
    title: 'Last Stand',
    planet: 'Mar Sara',
    map: 'traynor03',
    kind: 'survival',
    summary: 'Endless waves on Zero Hour. How long can the colony hold?',
    briefing: {
      speaker: 'Adjutant',
      portrait: 'dispatch',
      lines: ['Hostile forces are endless. Evacuation is not possible. Survive.'],
    },
    objectives: [
      { id: 'waves', text: 'Survive as many waves as you can' },
      { id: 'cc', text: 'The Command Center must survive' },
    ],
    reward: { xp: 0, credits: 0 },
  },
];
