import * as THREE from 'three';
import type { MapTerrain } from '../../../../src/engine/mapterrain.ts';
import type { MapData, Placement } from '../../../../src/engine/mapdata.ts';
import { AssaultBrain, GuardBrain, MedicBrain, Squad, SquadBrain, CrawlBrain } from '../../../../src/game/brains.ts';
import { CapturePoint } from '../../../../src/game/capture.ts';
import type { Building, Unit } from '../../../../src/game/entity.ts';
import { FlowField } from '../../../../src/game/flowfield.ts';
import type { KindName } from '../../../../src/game/kinds.ts';
import { mapYaw } from '../../../../src/game/layout.ts';
import { alive, beside, copies, HoldBrain, ScriptBase, walkableNear } from '../../../../src/game/script.ts';

const RAYNOR = 'Jim Raynor';
const HORNER = 'Matt Horner';
const DOMINION = 'Dominion officer';

/** Squad size the Raiders keep topped up as reinforcements land. */
const SQUAD = 7;
const REINFORCE_SECONDS = 40;

type Stage = 'roadblock' | 'seer' | 'square' | 'hold' | 'yard' | 'compound' | 'tower' | 'done';

/**
 * Liberation Day, on Wings of Liberty's own Mar Sara map (traynor01), along the road the map
 * lays out: Raynor's Raiders land in the south, break the Dominion roadblock, find what's
 * left of Ghost Town (and what did it), take Riksville's square and hold it, free the
 * Transport Yard, storm the compound, and bring down the Logistical Headquarters' tower.
 */
export class LiberationScript extends ScriptBase {
  private squad!: Squad;
  private harlan!: Unit;
  private landing = new THREE.Vector3();
  private roadblock = new THREE.Vector3();
  private roadblockGuards: Unit[] = [];
  private a!: CapturePoint;
  private b!: CapturePoint;
  private c!: CapturePoint;
  private tower!: Building;
  private billboards: Building[] = [];
  private ghostTown = new THREE.Vector3();
  private ghostZerg: Unit[] = [];
  private counter: Unit[] = [];
  private counterAt = -1;
  private reinforceAt = REINFORCE_SECONDS;
  private stage: Stage = 'roadblock';
  private fields = new Map<string, FlowField>();
  /** Points taken at least once (a retake isn't news). */
  private taken = new Set<CapturePoint>();

  constructor(
    m: ConstructorParameters<typeof ScriptBase>[0],
    host: ConstructorParameters<typeof ScriptBase>[1],
    private map: MapData,
    private terrain: MapTerrain,
  ) {
    super(m, host);
  }

  private at(x: number, y: number, step = 2): THREE.Vector3 {
    return walkableNear(this.w, this.terrain.toWorld(x, y), step);
  }

  private placements(type: string, player?: number): Placement[] {
    return this.map.placements.filter((p) => p.kind === 'unit' && p.type === type && (player === undefined || p.player === player));
  }

  /** A flow field toward a point, for anyone advancing on it. */
  private fieldTo(id: string, p: THREE.Vector3): FlowField {
    let f = this.fields.get(id);
    if (!f) {
      f = new FlowField(this.w.terrain.size, this.w.terrain.pathCell);
      f.setTerrain((x, z) => this.w.terrain.walkable(x, z));
      f.compute([{ x: p.x, z: p.z, r: 10 }], this.w.buildings.map((b) => ({ x: b.position.x, z: b.position.z, r: b.radius })));
      this.fields.set(id, f);
    }
    return f;
  }

  setup() {
    const w = this.w;
    this.landing = this.at(68, 21);
    this.roadblock = this.at(102, 29);
    this.ghostTown = this.at(92, 72);
    this.squad = new Squad(() => this.body());
    this.squad.rally.copy(this.landing);

    // The Dominion garrison, where the map puts it, and more of it at higher difficulties.
    let n = 0;
    for (const p of this.placements('Marine', 2)) {
      for (let k = copies(this.m.difficulty.waveScale, n++); k > 0; k--) {
        const at = k === 1 ? this.at(p.x, p.y, 1.5) : beside(w, this.at(p.x, p.y, 1.5));
        const u = w.spawnUnit('trooper', at.x, at.z, mapYaw(p.rotation), (x) => new GuardBrain(x, at.clone(), 22, 40), 'directorate');
        if (at.distanceTo(this.roadblock) < 50) this.roadblockGuards.push(u);
      }
    }
    for (const p of this.placements('Firebat', 2)) {
      for (let k = copies(this.m.difficulty.waveScale, n++); k > 0; k--) {
        const at = k === 1 ? this.at(p.x, p.y, 1.5) : beside(w, this.at(p.x, p.y, 1.5));
        w.spawnUnit('burner', at.x, at.z, mapYaw(p.rotation), (x) => new GuardBrain(x, at.clone(), 18, 30), 'directorate');
      }
    }
    // The Logistical Headquarters: Mengsk's broadcast tower over the compound.
    const hq = this.placements('LogisticsHeadquarters')[0];
    const hqAt = hq ? this.terrain.toWorld(hq.x, hq.y) : this.at(85, 125);
    this.tower = w.spawnBuilding('radioTower', hqAt.x, hqAt.z, hq ? mapYaw(hq.rotation) : 0, 'directorate');
    this.tower.ignored = true;
    // Mengsk's face on every corner.
    for (const p of this.placements('MengskHologramBillboard')) {
      const at = this.terrain.toWorld(p.x, p.y);
      const bb = w.spawnBuilding('billboard', at.x, at.z, mapYaw(p.rotation), 'directorate');
      bb.ignored = true;
      this.billboards.push(bb);
    }

    this.a = this.point('a', 'Riksville Town Square', 'A', this.at(58, 61), 20, 'directorate');
    this.b = this.point('b', 'Transport Yard', 'B', this.at(42, 84), 18, 'directorate');
    this.c = this.point('c', 'Dominion Compound', 'C', this.at(73, 113), 22, 'directorate');

    // Raynor and the squad, dropped on the south road.
    this.harlan = w.spawnUnit('harlan', this.landing.x, this.landing.z, 0, (u) => new SquadBrain(u, this.squad));
    this.harlan.minHp = 1;
    for (let i = 0; i < SQUAD - 1; i++) this.reinforcement('trooper', this.landing);
    this.reinforcement('medic', this.landing);
  }

  private point(id: string, name: string, letter: string, at: THREE.Vector3, radius: number, owner: 'directorate' | null): CapturePoint {
    const p = new CapturePoint(id, name, letter, at, radius, owner, this.w);
    p.onCaptured = (team) => this.captured(p, team);
    this.m.points.push(p);
    return p;
  }

  private reinforcement(kind: KindName, near: THREE.Vector3): Unit {
    const p = walkableNear(this.w, near.clone().add(new THREE.Vector3((Math.random() - 0.5) * 12, 0, (Math.random() - 0.5) * 12)), 2);
    return this.w.spawnUnit(kind, p.x, p.z, 0, (u) => (kind === 'medic' ? new MedicBrain(u, this.squad) : new SquadBrain(u, this.squad)));
  }

  /**
   * Where a fresh body deploys: on the squad, if it's not in the thick of a fight; otherwise
   * the furthest ground the Raiders hold.
   */
  respawnPoint(): THREE.Vector3 {
    const jitter = () => new THREE.Vector3((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8);
    const r = this.harlan.position;
    if (!this.w.nearestEnemy('holdouts', r.x, r.z, 35)) return walkableNear(this.w, r.clone().add(jitter()), 2);
    const held = [this.c, this.b, this.a].find((p) => p.owner === 'holdouts');
    const fallback = held?.position ?? (this.stage === 'roadblock' ? this.landing : this.stage === 'seer' ? this.roadblock : this.ghostTown);
    return walkableNear(this.w, fallback.clone().add(jitter()), 2);
  }

  start() {
    // The Hyperion holds high over the town: its guns answer only a called strike.
    this.host.ship.holdFire = true;
    this.host.ship.station = this.a.position.clone();
    this.say(RAYNOR, 'harlan', "Alright, Raiders. Mengsk's had his boot on Mar Sara's neck long enough. Today we take it off.");
    this.say(HORNER, 'ashby', 'The Dominion has a roadblock on the east road into Riksville. Punch through it and the town is open.');
    this.say(RAYNOR, 'harlan', 'Stick close to me, Corporal. And keep your head down.');
    this.restoreWaypoint();
  }

  private captured(p: CapturePoint, team: string) {
    if (team !== 'holdouts') {
      this.say(HORNER, 'ashby', `We've lost ${p.name}! Take it back!`);
      this.m.setWaypoint(p.position, `Retake ${p.letter}`, p.radius);
      return;
    }
    this.w.audio.play('trooperYes', { volume: 0.8, limit: 1 });
    if (this.taken.has(p)) {
      this.say(RAYNOR, 'harlan', `${p.name} is ours again. Keep moving.`, 3);
      this.restoreWaypoint();
      return;
    }
    this.taken.add(p);
    if (p === this.a && this.stage === 'square') {
      this.complete('square');
      this.stage = 'hold';
      this.say(RAYNOR, 'harlan', "The square's ours! Folks are coming out of their homes. Look at that.");
      this.say(HORNER, 'ashby', "Don't celebrate yet. A Dominion squad is moving on the square from the north.");
      this.counterAt = this.time + 14;
      this.reveal('hold');
    } else if (p === this.b && this.stage === 'yard') {
      this.complete('yard');
      this.stage = 'compound';
      this.say(HORNER, 'ashby', 'Transport Yard is clear. Those colonists can get out of here now. They owe you one, Corporal.');
      this.say(RAYNOR, 'harlan', "Now the compound. Mengsk's people are dug in deep. Let's dig them out.");
    } else if (p === this.c && this.stage === 'compound') {
      this.complete('compound');
      this.stage = 'tower';
      this.tower.ignored = false;
      this.say(RAYNOR, 'harlan', "That tower's been pumping Mengsk's lies into every home on this planet. Bring it down!");
      this.say(HORNER, 'ashby', "The Hyperion's got a Yamato round with its name on it, if you want to call it in. F.");
    }
    this.restoreWaypoint();
  }

  private launchCounterAttack() {
    // Down the north road toward the square: rifles and a Firebat.
    const from = this.at(60, 92, 3);
    const field = this.fieldTo('a', this.a.position);
    const n = Math.round(6 * this.m.difficulty.waveScale);
    for (let i = 0; i < n + 1; i++) {
      const p = walkableNear(this.w, from.clone().add(new THREE.Vector3((Math.random() - 0.5) * 14, 0, (Math.random() - 0.5) * 14)), 2);
      const kind: KindName = i === n ? 'burner' : 'trooper';
      this.counter.push(this.w.spawnUnit(kind, p.x, p.z, Math.PI, (u) => new AssaultBrain(u, field, this.a.position.clone()), 'directorate'));
    }
    this.say(DOMINION, 'directorate', 'All units, retake the square. Shoot the rebels on sight.');
  }

  protected tick(dt: number) {
    this.squad.update();
    const w = this.w;

    switch (this.stage) {
      case 'roadblock':
        // A straggler stuck up on a ledge doesn't hold the road.
        if (alive(this.roadblockGuards) <= 1 && this.distanceTo(this.roadblock) < 40) {
          this.complete('roadblock');
          this.stage = 'seer';
          this.reveal('seer');
          this.say(RAYNOR, 'harlan', "Roadblock's down. The road runs through the old Wilson homestead. Folks call it Ghost Town now. Stay sharp.");
          this.restoreWaypoint();
        }
        break;
      case 'seer':
        if (!this.ghostZerg.length && this.distanceTo(this.ghostTown) < 60) {
          for (let i = 0; i < Math.round(9 * this.m.difficulty.waveScale); i++) {
            const p = walkableNear(w, this.ghostTown.clone().add(new THREE.Vector3((Math.random() - 0.5) * 26, 0, (Math.random() - 0.5) * 26)), 2);
            this.ghostZerg.push(w.spawnUnit('hound', p.x, p.z, Math.random() * 6.28, (u) => (i < 4 ? new CrawlBrain(u) : new HoldBrain(u))));
          }
          this.say(RAYNOR, 'harlan', 'What in the... Those are Zerg. Loose on Mar Sara.');
          this.say(RAYNOR, 'harlan', 'Kill every last one of them. And nobody breathes a word of this until we know more.');
        }
        for (const z of this.ghostZerg) {
          // The feeders look up when you come close.
          if (z.alive && z.controller instanceof HoldBrain && this.distanceTo(z.position) < 35) z.setController(new CrawlBrain(z));
        }
        if (this.ghostZerg.length && alive(this.ghostZerg) <= 1) {
          for (const z of this.ghostZerg) if (z.alive) z.setController(new CrawlBrain(z));
          this.complete('seer');
          this.stage = 'square';
          this.say(HORNER, 'ashby', "I'm logging it. Zerg this far out in the Fringe... that's not good, Jim.");
          this.say(RAYNOR, 'harlan', 'One fight at a time, Matt. The town square is just west of here. Take it.');
          this.restoreWaypoint();
        }
        break;
      case 'hold':
        if (this.counterAt > 0 && this.time >= this.counterAt) {
          this.counterAt = -1;
          this.launchCounterAttack();
        }
        if (this.counter.length && alive(this.counter) <= 1 && this.a.owner === 'holdouts') {
          this.complete('hold');
          this.stage = 'yard';
          this.say(RAYNOR, 'harlan', "That's the last of them. The Transport Yard's west of here. Colonists were trying to get out before Mengsk's goons locked it down.");
          this.restoreWaypoint();
        }
        break;
      case 'tower':
        if (!this.tower.alive) {
          this.stage = 'done';
          this.complete('tower');
          this.m.setWaypoint(null);
          this.say(RAYNOR, 'harlan', "That's the sound of Mar Sara getting its voice back.");
          this.say(HORNER, 'ashby', 'Every channel on the planet just went to static. Nice work, Raiders. Head home.');
        }
        break;
      case 'done':
        if (this.m.radio.idle) this.m.win('Riksville is free.');
        break;
    }

    // Reinforcements: the Raiders' dropships top the squad back up at the front.
    this.reinforceAt -= dt;
    if (this.reinforceAt <= 0 && this.stage !== 'done') {
      this.reinforceAt = REINFORCE_SECONDS;
      const missing = SQUAD - [...this.squad.members].filter((u) => u.alive && u !== this.harlan).length;
      if (missing > 0) {
        const at = this.respawnPoint();
        for (let i = 0; i < Math.min(missing, 4); i++) this.reinforcement(i === 3 ? 'grenadier' : 'trooper', at);
        this.say(HORNER, 'ashby', `Dropship's away. ${Math.min(missing, 4)} more Raiders coming down on your position.`, 3.5);
      }
    }

    // Billboards, for the bonus.
    const standing = this.billboards.filter((b) => b.alive).length;
    if (standing === 0) this.complete('billboards');
    this.m.progress.set('billboards', `${this.billboards.length - standing}/${this.billboards.length}`);
  }

  private restoreWaypoint() {
    switch (this.stage) {
      case 'roadblock':
        return this.m.setWaypoint(this.roadblock, 'Dominion roadblock', 16);
      case 'seer':
        return this.m.setWaypoint(this.ghostTown, 'Ghost Town', 24);
      case 'square':
        return this.m.setWaypoint(this.a.position, 'A · Town Square', this.a.radius);
      case 'hold':
        return this.m.setWaypoint(this.a.position, 'Hold A', this.a.radius);
      case 'yard':
        return this.m.setWaypoint(this.b.position, 'B · Transport Yard', this.b.radius);
      case 'compound':
        return this.m.setWaypoint(this.c.position, 'C · Dominion Compound', this.c.radius);
      case 'tower':
        return this.m.setWaypoint(this.tower.position, 'Logistical Headquarters', 10);
      default:
        return this.m.setWaypoint(null);
    }
  }
}
