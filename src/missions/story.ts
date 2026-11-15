import type { EchoId, EchoSquad } from '../../../../src/game/echo.ts';
import type { Mission } from '../../../../src/game/mission.ts';
import type { PortraitName } from '../../../../src/game/portrait.ts';
import type { MissionStory, StoryState } from '../../../../src/game/script.ts';

/**
 * The campaign's story beyond each mission's own script: Echo Squad's voices through the
 * missions, and the scenes the debrief closes on. Everything here is original writing.
 *
 * The shape, for whoever reads this before playing: the player is a Mar Sara militia corporal
 * who joins Raynor's Raiders. The truth, seeded from Boot Camp on and told after Outbreak, is
 * that the corporal died on Mar Sara's north range six days before Boot Camp, the first person
 * the Zerg killed there. A Confederate Ghost-program prototype the Hyperion carried, a psionic
 * relay, caught a latent psionic's mind on the way out. Everything since has been that mind
 * riding Raider volunteers through their suits' neural links: the game's own possession and
 * redeploys, as the story. "Signal lost" means what it says. Echo Squad are the volunteers who
 * carry it. On Char, the artifact's pulse will burn out every psionic link on the planet,
 * the relay's included, and the corporal holds the line anyway.
 */

type Speaker = EchoId | 'ashby' | 'harlan' | 'hanson' | 'calyx';

const VOICES: Record<Speaker, { name: string; portrait: PortraitName }> = {
  rourke: { name: 'Sgt. Dana Rourke', portrait: 'trooper2' },
  vey: { name: 'Pvt. Tomas Vey', portrait: 'rookie' },
  marrow: { name: '"Doc" Ilsa Marrow', portrait: 'medic' },
  briggs: { name: 'Cpl. Ruben Briggs', portrait: 'tank' },
  ashby: { name: 'Matt Horner', portrait: 'ashby' },
  harlan: { name: 'Jim Raynor', portrait: 'harlan' },
  hanson: { name: 'Dr. Ariel Hanson', portrait: 'scientist' },
  calyx: { name: 'The Queen of Blades', portrait: 'calyx' },
};

export function voice(s: Speaker): { name: string; portrait: PortraitName } {
  return VOICES[s];
}

/** What a beat can ask about the mission in progress. */

interface Beat {
  id: string;
  when: (s: StoryState) => boolean;
  lines: [Speaker, string][];
}

const BEATS: Record<string, Beat[]> = {
  'liberation-day': [
    {
      id: 'start',
      when: (s) => s.time > 14,
      lines: [
        ['vey', "First real op, Corporal. Stick close to me, yeah? I've got you."],
        ['marrow', "Nobody's got anybody until they're back on the ship, Vey."],
      ],
    },
    {
      id: 'seer',
      when: (s) => s.status('seer') === 'done',
      lines: [
        ['vey', "That's the Wilson place. My aunt lives two farms past Wilson's... Sarge, they came down from the north range."],
        ['rourke', 'Eyes front, Vey. Grieve later. Fight now.'],
      ],
    },
    {
      id: 'redeploy',
      when: (s) => s.bodiesLost > 0 && s.inBody,
      lines: [['vey', 'Corporal? You were just over on the... Never mind. Glad you made it.']],
    },
  ],
  'zero-hour': [
    {
      id: 'start',
      when: (s) => s.time > 10,
      lines: [
        ['briggs', "Briggs here. She's fueled, she's angry, and she's pointed north. Let 'em come."],
        ['vey', "My aunt's in the colony, Sarge. She's on the evac list, right?"],
        ['rourke', "Everybody's on the list, Vey. That's why we're here."],
      ],
    },
    {
      id: 'telemetry',
      when: (s) => s.wave >= 3,
      lines: [
        ['marrow', "Corporal, your suit's telemetry is doing something strange. No heartbeat, and you're moving fine."],
        ['rourke', 'Suit glitch, Doc. Focus on the ones who are bleeding.'],
      ],
    },
    {
      id: 'redeploy',
      when: (s) => s.bodiesLost > 0 && s.inBody,
      lines: [
        ['marrow', 'Whose suit was that? Sarge, who did we just lose?'],
        ['rourke', 'Later, Doc.'],
      ],
    },
    {
      id: 'last',
      when: (s) => s.wave >= 6,
      lines: [['rourke', 'Last push, Echo. The dropships are loading. Everything we have, right here.']],
    },
  ],
  evacuation: [
    {
      id: 'start',
      when: (s) => s.time > 16,
      lines: [
        ['marrow', "Dr. Hanson? Ilsa Marrow, Raider medical. When this is over, I'd like to ask you about neural interfaces."],
        ['hanson', "If we live through the causeway, Doctor, I'll tell you everything I know."],
      ],
    },
    {
      id: 'redeploy',
      when: (s) => s.bodiesLost > 0 && s.inBody,
      lines: [
        ['marrow', "That's another suit, Sarge. Tell me who was wearing it."],
        ['rourke', 'Kessler. He volunteered. Now drop it.'],
      ],
    },
    {
      id: 'loading',
      when: (s) => s.flag('loading'),
      lines: [['rourke', "The colonists are boarding. Echo, nothing gets near those ships. Nothing."]],
    },
  ],
  outbreak: [
    {
      id: 'start',
      when: (s) => s.time > 12,
      lines: [
        ['briggs', "Briggs, set at the gate. Point me at a nest and I'll knock on the door."],
        ['vey', "They look like people. Corporal, they still look like people."],
      ],
    },
    {
      id: 'night',
      when: (s) => s.night >= 1,
      lines: [
        ['marrow', "Sarge, I pulled the Mar Sara militia casualty list out of the Hyperion's archive."],
        ['rourke', 'Not now, Doc.'],
        ['marrow', 'Then when?'],
      ],
    },
  ],
  'all-in': [
    {
      id: 'start',
      when: (s) => s.time > 12,
      lines: [
        ['briggs', 'Briggs to Echo. Sieged at the rig. Whatever happens when that thing goes off: it was an honor, Five.'],
        ['vey', "We'll hold, Corporal. We'll hold so you don't have to do it alone."],
      ],
    },
    {
      id: 'queen',
      when: (s) => s.flag('calyx'),
      lines: [
        ['calyx', "Raynor... and his little echo. I can hear you, jumping from shell to shell. Come out and play, little one."],
        ['rourke', "Echo, on the Corporal! She's not getting our Five!"],
      ],
    },
    {
      id: 'end',
      when: (s) => s.charge >= 0.9,
      lines: [['rourke', "Echo-Five. When it fires... we'll be right here. All of us. Hold the line."]],
    },
  ],
};

/**
 * Who says what after a mission is won. Each line lists who could say it, first choice first:
 * a squadmate who didn't come home hands the line to whoever did (or it goes unsaid).
 */
type Line = [Speaker, string][];

function afterword(mission: string): Line[] {
  switch (mission) {
    case 'boot-camp':
      return [
        [['rourke', "Not bad, Corporal. Welcome to Echo Squad. You're Echo-Five. Vey's the kid, Doc keeps us breathing, Briggs drives the tank. I'm the one who yells."]],
        [['ashby', 'Hyperion to Echo-One. Relay is green, signal is clean. Good work down there, Sergeant.']],
        [['rourke', 'Copy, Hyperion. ...It held, Matt. It actually held.']],
      ];
    case 'liberation-day':
      return [
        [['harlan', "Mar Sara's got its voice back. Now let's hope it has something good to say."]],
        [['vey', 'Those were Zerg in Ghost Town. Real Zerg, on Mar Sara. Sarge, my aunt...']],
        [
          ['rourke', 'Get some sleep, Echo. Something tells me we will not get much more.'],
          ['harlan', "Get some sleep, Raiders. We'll see to Rourke's things in the morning."],
        ],
      ];
    case 'zero-hour':
      return [
        [['ashby', 'Last dropship is off the ground. Three thousand colonists, Sergeant. Your squad bought every one of them.']],
        [
          ['vey', 'Aunt Mae made the last dropship. She made it, Sarge!'],
          ['rourke', "Vey's aunt made the last dropship. She asked for him. I didn't know what to tell her."],
          ['ashby', "Private Vey's aunt made the last dropship. She asked for him."],
        ],
        [
          ['marrow', "Sarge. The Corporal's telemetry. We need to talk about it."],
          ['rourke', "Doc kept asking about the Corporal's telemetry. I never gave her an answer. Maybe I should have."],
        ],
      ];
    case 'evacuation':
      return [
        [['hanson', 'We are away. Every family on those trucks owes you their lives.']],
        [
          ['marrow', "I showed Dr. Hanson the Corporal's telemetry. She looked at it for a long time, and then she asked me how long."],
          ['hanson', "Sergeant, your Corporal's telemetry... I've seen readings like that once before. How long has it been like this?"],
        ],
        [
          ['rourke', 'Doc. Drop it.'],
          ['vey', 'Doc... maybe let it go. For now.'],
        ],
      ];
    case 'outbreak':
      // The truth.
      return [
        [
          ['marrow', 'The Mar Sara militia lost one soldier before the Zerg came in force. North range, six days before Boot Camp. A corporal. Your name. Your callsign.'],
          ['rourke', 'Doc found it before we lost her: the Mar Sara militia casualty list. North range, six days before Boot Camp. A corporal. Your name.'],
          ['ashby', 'The Mar Sara militia lost one soldier before the Zerg came in force. North range, six days before Boot Camp. A corporal. Your name.'],
        ],
        [
          ['rourke', "It's true, Corporal. You died out there, in the dark, the first of us. The Hyperion caught you on the way out."],
          ['ashby', "It's true, Corporal. You died out there, in the dark. The Hyperion caught you on the way out."],
        ],
        [['ashby', 'A Confederate Ghost-program relay we pulled off a Dominion freighter. It was never supposed to work. It caught a mind nobody knew was psionic. Yours.']],
        [
          ['rourke', "Every body you've worn since Boot Camp was a Raider who volunteered to carry you. That's what Echo is. We carry the Echo."],
          ['vey', "Every body you've worn since Boot Camp was one of us, volunteering. That's what Echo is, Corporal. We carry you."],
        ],
        [
          ['marrow', 'And every one of them who fell, fell with you riding along. They knew. They did it anyway.'],
          ['briggs', 'And every one of them who fell knew what they signed up for. Did it anyway. So will I.'],
        ],
      ];
    case 'all-in':
      return [
        [
          ['rourke', 'Echo-Five, this is Echo-One. Signal check. ...Echo-Five, respond.'],
          ['vey', 'Echo-Five, this is... this is Vey. Signal check. Corporal? Respond.'],
          ['ashby', 'Hyperion to Echo-Five. Signal check. ...Echo-Five, respond.'],
        ],
        [['ashby', "The relay's dark. The pulse burned out every psionic link on Char. I'm sorry."]],
        [
          ['rourke', "Don't be. The Corporal died on Mar Sara. Everything after was borrowed time, and it was spent on us."],
          ['harlan', "Don't be, Matt. That Corporal died on Mar Sara. Everything after was borrowed time, and it was spent on us."],
        ],
        [
          ['marrow', 'We carried the Corporal all the way to Char. And the Corporal carried us.'],
          ['vey', 'We carried the Corporal all the way to Char. And the Corporal carried us.'],
          ['briggs', 'Carried the Corporal all the way to Char. Hell of a ride.'],
        ],
        [['ashby', '...Sergeant? The relay buffer is showing a signal. One. Faint. Very faint.']],
      ];
  }
  return [];
}

/** The beats of the mission in progress, said once each when their moment comes. */
export class Story implements MissionStory {
  private said = new Set<string>();
  private next = 0;

  constructor(
    private missionId: string,
    private mission: Mission,
    private echo: EchoSquad,
    private state: StoryState,
  ) {}

  /** Echo's voices only while they're in the fight; the others always. */
  private canSpeak(s: Speaker): boolean {
    if (s === 'rourke' || s === 'vey' || s === 'marrow' || s === 'briggs') return this.state.alive(s);
    return true;
  }

  update() {
    // A couple of times a second is plenty, and never over a line already on the air.
    if (this.state.time < this.next || !this.mission.radio.idle) return;
    this.next = this.state.time + 0.5;
    for (const b of BEATS[this.missionId] ?? []) {
      if (this.said.has(b.id) || !b.when(this.state)) continue;
      this.said.add(b.id);
      const lines = b.lines.filter(([s]) => this.canSpeak(s));
      // A conversation missing its first speaker doesn't happen at all.
      if (!lines.length || lines[0] !== b.lines[0]) continue;
      for (const [s, line] of lines) this.mission.radio.say(VOICES[s].name, VOICES[s].portrait, line);
      return;
    }
  }

  /**
   * The scene the debrief closes on, after a win. `fallen` says whether a squadmate was lost
   * before this mission (in the campaign so far).
   */
  afterword(fallen: (id: EchoId) => boolean): { speaker: string; line: string }[] {
    const home = (s: Speaker) => {
      if (s !== 'rourke' && s !== 'vey' && s !== 'marrow' && s !== 'briggs') return true;
      const slot = this.echo.slots.find((x) => x.def.id === s);
      return slot ? slot.state !== 'kia' : !fallen(s);
    };
    const out: { speaker: string; line: string }[] = [];
    for (const choices of afterword(this.missionId)) {
      const pick = choices.find(([s]) => home(s));
      if (pick) out.push({ speaker: VOICES[pick[0]].name, line: pick[1] });
    }
    return out;
  }
}
