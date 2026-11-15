import * as THREE from 'three';
import { CrawlBrain } from '../../../../src/game/brains.ts';
import type { Unit } from '../../../../src/game/entity.ts';
import type { KindName } from '../../../../src/game/kinds.ts';
import { alive, HoldBrain, inSightNear, ScriptBase, walkableNear } from '../../../../src/game/script.ts';
import { isTank, tankMode } from '../../../../src/game/tank.ts';

type Step = 'move' | 'shoot' | 'jolt' | 'keelGun' | 'skyscan' | 'bunker' | 'tank' | 'pack' | 'done';

const SARGE = 'Sgt. Dana Rourke';
const CAPTAIN = 'Hyperion, gunnery deck';

/**
 * Boot Camp: Sergeant Rourke walks a new Raider through the rifle, the Stimpack, the
 * Hyperion's Yamato Cannon, a bunker and a Siege Tank, at the colony base on Mar Sara, until
 * the first Zergling pack comes over the ridge for real.
 */
export class TrainingScript extends ScriptBase {
  private step: Step = 'move';
  private stepTime = 0;
  private drill = new THREE.Vector3();
  private outward = new THREE.Vector3();
  private targets: Unit[] = [];
  private roaches: Unit[] = [];
  private pack: Unit[] = [];
  private burrowed: Unit | null = null;
  private nagAt = 0;
  /** The player has sat in a tank in Tank Mode: Siege Mode from there is theirs. */
  private drove = false;
  /** The base's gun crews are holding fire on the pack: it's the Corporal's. */
  private holding = false;
  private packBrains: CrawlBrain[] = [];
  /** Sweeps already noticed (to tell a miss). */
  private sweepsSeen = 0;

  start() {
    const cc = this.m.holdfast!.position;
    const from = this.m.respawnPoint();
    const lane = this.m.layout.lanes[0];
    const bunker = lane?.bunker ? new THREE.Vector3(lane.bunker.x, 0, lane.bunker.z) : cc.clone().add(new THREE.Vector3(60, 0, 0));
    this.outward.set(bunker.x - cc.x, 0, bunker.z - cc.z).normalize();
    this.drill = walkableNear(this.w, from.clone().addScaledVector(this.outward, 34));
    this.say(SARGE, 'trooper2', "On your feet, Corporal. This is Mar Sara, and you're a Raider now. Raiders don't sit around.");
    this.say(SARGE, 'trooper2', 'See that beacon? Get over there. W A S D to move, the mouse to look.');
    this.enter('move');
  }

  private enter(step: Step) {
    if (step !== 'move') this.m.radio.interrupt();
    this.step = step;
    this.stepTime = 0;
    this.nagAt = 25;
    switch (step) {
      case 'move':
        this.m.setWaypoint(this.drill, 'Drill marker');
        break;
      case 'shoot': {
        // A firing range of captured Zerglings, held in their pens.
        const side = new THREE.Vector3(-this.outward.z, 0, this.outward.x);
        for (let i = 0; i < 6; i++) {
          const p = this.drill.clone().addScaledVector(this.outward, 24 + (i % 2) * 6).addScaledVector(side, (i - 2.5) * 6);
          this.targets.push(this.specimen('hound', inSightNear(this.w, this.drill, p)));
        }
        this.m.setWaypoint(this.centroid(this.targets), 'Targets', 14);
        this.say(SARGE, 'trooper2', 'Good. Legs work. Everything else is the easy part.', 2.8);
        this.say(SARGE, 'trooper2', "Live Zerglings from the pens, Brood War leftovers. Put them down. Left click fires; hold right click to aim down the sights.");
        this.say(SARGE, 'trooper2', "Your C-14 fires in bursts. Every round that misses is damage you don't deal. Make them count.");
        break;
      }
      case 'jolt':
        this.m.setWaypoint(null);
        this.say(SARGE, 'trooper2', "Now the Stimpack. Shift. Costs you ten life, buys you faster legs and a faster trigger. Try it.");
        break;
      case 'keelGun': {
        for (let i = 0; i < 2; i++) {
          const p = this.drill.clone().addScaledVector(this.outward, 52).addScaledVector(new THREE.Vector3(-this.outward.z, 0, this.outward.x), (i - 0.5) * 10);
          this.roaches.push(this.specimen('shellback', inSightNear(this.w, this.drill, p)));
        }
        this.m.setWaypoint(this.centroid(this.roaches), 'Roaches', 12);
        // F is an ultimate, charged by fighting; the drill hands it over charged.
        this.host.chargeUltimate?.();
        this.say(SARGE, 'trooper2', "Roaches. Thick hide, acid spit. Your rifle will take all day. The Hyperion won't.");
        this.say(CAPTAIN, 'pilot', 'Gunnery deck here, Corporal. Put your crosshair on one and press Q. We will do the rest.');
        break;
      }
      case 'skyscan': {
        // One got loose and dug in somewhere past the range; only a sweep will find it.
        const p = inSightNear(this.w, this.drill, this.drill.clone().addScaledVector(this.outward, 40).addScaledVector(new THREE.Vector3(-this.outward.z, 0, this.outward.x), 16));
        this.burrowed = this.specimen('hound', p);
        this.burrowed.stowed = true;
        // Enough for a second try: a sweep in the wrong place shouldn't mean a wait.
        this.host.orbitalEnergy?.(110);
        this.m.setWaypoint(p, 'Somewhere around here', 30);
        this.say(SARGE, 'trooper2', "Finish the other Roach off. And listen: one Zergling got out of the pens and burrowed. You can't see it, you can't shoot it.");
        this.say(SARGE, 'trooper2', 'Hold T for call-ins. Flick the mouse up to Scanner Sweep, let go, and click on the ground out there. The Orbital Command does the rest.', 5);
        break;
      }
      case 'bunker': {
        const b = this.nearestBunker();
        this.m.setWaypoint(b ? b.position : null, 'Bunker', 8);
        this.say(SARGE, 'trooper2', 'Scans cost the Orbital energy, and it recharges slow. Spend it where it counts.');
        this.say(SARGE, 'trooper2', 'Now get yourself into that bunker: walk up to it and press F.');
        break;
      }
      case 'tank': {
        const t = this.nearestTank();
        this.m.setWaypoint(t ? t.position : null, 'Siege Tank', 6);
        this.say(SARGE, 'trooper2', 'A bunker makes four Marines worth ten. F again to get out.');
        this.say(SARGE, 'trooper2', 'Next: the Siege Tank by the Command Center. F to climb in, then E to go into Siege Mode.');
        break;
      }
      case 'pack': {
        const at = this.packOrigin();
        const count = Math.round(14 * this.m.difficulty.waveScale);
        for (let i = 0; i < count; i++) {
          const p = walkableNear(this.w, at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 18, 0, (Math.random() - 0.5) * 18)), 2);
          const cc = this.m.holdfast!.position;
          this.pack.push(
            this.w.spawnUnit('hound', p.x, p.z, Math.atan2(cc.x - p.x, cc.z - p.z), (u) => {
              // Straight for the base, past crews holding their fire, and for the Corporal.
              const brain = new CrawlBrain(u);
              brain.only = (e) => e === this.w.player || e === this.m.holdfast;
              this.packBrains.push(brain);
              return brain;
            }),
          );
        }
        // The gun crews stand down for it: the pack is the Corporal's, unless it gets close.
        for (const z of this.pack) z.ignored = true;
        this.holding = true;
        this.reveal('pack');
        this.say(SARGE, 'trooper2', "The pens! Some genius left the pen gates open. That's a whole pack of Zerglings loose, headed for the base!", 4);
        this.say(SARGE, 'trooper2', 'Gun crews, hold your fire. This one belongs to the Corporal.', 3.4);
        this.say(SARGE, 'trooper2', "Siege Mode will turn them into paste at range. Don't let them reach the Command Center!");
        this.w.audio.play('baseUnderAttack', { volume: 0.9 });
        break;
      }
      case 'done':
        this.m.setWaypoint(null);
        this.say(SARGE, 'trooper2', 'Not bad, Corporal. Not bad at all.');
        this.say(SARGE, 'trooper2', "Whatever's out there, there's more where that came from. Get some rack time. Welcome to Raynor's Raiders.");
        break;
    }
  }

  /**
   * Where the loose pack comes from: well out past the player's tank, on ground with a way to
   * the Command Center, so its run at the base crosses the tank's field of fire.
   */
  private packOrigin(): THREE.Vector3 {
    const cc = this.m.holdfast!.position;
    const tank = this.body()?.position ?? this.drill;
    const out = new THREE.Vector3(tank.x - cc.x, 0, tank.z - cc.z);
    if (out.lengthSq() < 100) out.copy(this.outward);
    out.normalize();
    const up = new THREE.Vector3(0, 1, 0);
    for (const d of [150, 130, 170, 110, 190]) {
      for (const turn of [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9]) {
        const p = tank.clone().addScaledVector(out.clone().applyAxisAngle(up, turn), d);
        if (this.w.terrain.playable(p.x, p.z) && this.w.flow.distance(p.x, p.z) < Infinity) return p.setY(this.w.terrain.heightAt(p.x, p.z));
      }
    }
    const lane = this.m.layout.lanes[0];
    const toward = lane ? lane.spawn.clone() : this.drill.clone().addScaledVector(this.outward, 200);
    return walkableNear(this.w, this.drill.clone().lerp(toward, 0.55), 4);
  }

  /** A Zerg held still for the range, left alone by the base's guns. */
  private specimen(kind: KindName, p: THREE.Vector3): Unit {
    const u = this.w.spawnUnit(kind, p.x, p.z, Math.atan2(this.drill.x - p.x, this.drill.z - p.z), (x) => new HoldBrain(x));
    u.ignored = true;
    return u;
  }

  private centroid(units: Unit[]): THREE.Vector3 {
    const c = new THREE.Vector3();
    let n = 0;
    for (const u of units) {
      if (!u.alive) continue;
      c.add(u.position);
      n++;
    }
    return n ? c.divideScalar(n) : this.drill.clone();
  }

  private nearestBunker() {
    const from = this.body()?.position ?? this.drill;
    let best = null;
    let bestD = Infinity;
    for (const b of this.w.buildings) {
      if (b.kind.name !== 'bunker' || b.team !== 'holdouts') continue;
      const d = b.position.distanceTo(from);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  private nearestTank(): Unit | null {
    const from = this.body()?.position ?? this.drill;
    let best: Unit | null = null;
    let bestD = Infinity;
    for (const e of this.w.entities) {
      if (e.isBuilding || !e.alive || e.team !== 'holdouts' || !isTank(e)) continue;
      // A tank in Tank Mode, so there's something to learn: sieged ones only if there's no other.
      const d = e.position.distanceTo(from) + (tankMode(e as Unit) === 'tank' ? 0 : 1000);
      if (d < bestD) {
        bestD = d;
        best = e as Unit;
      }
    }
    return best;
  }

  protected tick(dt: number) {
    this.stepTime += dt;
    const a = this.host.avatar() as { kind?: string; joltLeft?: number; garrison?: unknown; unit?: Unit } | null;
    switch (this.step) {
      case 'move':
        if (this.distanceTo(this.drill) < 7) {
          this.complete('move');
          this.enter('shoot');
        }
        break;
      case 'shoot':
        if (alive(this.targets) === 0) {
          this.complete('shoot');
          this.enter('jolt');
        } else this.m.setWaypoint(this.centroid(this.targets), 'Targets', 14);
        break;
      case 'jolt':
        if (a?.joltLeft && a.joltLeft > 0) {
          this.complete('jolt');
          this.enter('keelGun');
        }
        break;
      case 'keelGun':
        // Done once the Hyperion has fired on them (or they're dead anyway).
        if (this.host.ship.cooldownLeft > 0 || this.host.ship.charging > 0 || alive(this.roaches) === 0) {
          this.complete('keelGun');
          this.enter('skyscan');
        }
        break;
      case 'skyscan': {
        const z = this.burrowed;
        // A sweep that missed it: say so, and keep the Orbital topped up for another.
        const sweeps = this.host.sweeps?.() ?? 0;
        if (z?.stowed && sweeps > this.sweepsSeen) {
          this.say(SARGE, 'trooper2', 'Nothing. Closer to the beacon, Corporal. The Orbital has the energy for another.', 3.5);
          this.host.orbitalEnergy?.(55);
        }
        this.sweepsSeen = sweeps;
        // Found once a sweep flushes it out (or it's dead some other way).
        if (z && (!z.alive || !z.stowed)) {
          if (z.alive) z.ignored = false;
          if (!z.alive || (this.host.sweeps?.() ?? 0) > 0) {
            this.complete('skyscan');
            this.say(SARGE, 'trooper2', 'There it is! Put it down!', 2.5);
            this.enter('bunker');
          }
        }
        break;
      }
      case 'bunker':
        if (a?.garrison) {
          this.complete('bunker');
          // The other Roach, if it's still standing, is the gun crews' business now.
          for (const r of this.roaches) r.ignored = false;
          this.enter('tank');
        }
        break;
      case 'tank':
        // Sieged by the player's own hand: a tank found already sieged needs packing up and
        // setting down again.
        if (a?.kind === 'tank' && a.unit && tankMode(a.unit) === 'tank') this.drove = true;
        if (a?.kind === 'tank' && a.unit && tankMode(a.unit) === 'braced' && this.drove) {
          this.complete('tank');
          this.enter('pack');
        } else {
          const t = this.nearestTank();
          if (t) this.m.setWaypoint(t.position, 'Siege Tank', 6);
        }
        break;
      case 'pack':
        // The crews open up once the pack gets close to the Command Center, or the drill runs long.
        if (this.holding) {
          const cc = this.m.holdfast!.position;
          // Until they're at the Corporal's tank or the Command Center (or the drill runs long).
          const biting = this.pack.find((z) => z.alive && z.attacking);
          const close = this.pack.some((z) => z.alive && Math.hypot(z.position.x - cc.x, z.position.z - cc.z) < 25);
          if (biting || close || this.stepTime > 75) {
            this.holding = false;
            for (const z of this.pack) z.ignored = false;
            for (const b of this.packBrains) b.only = null;
            if (alive(this.pack)) {
              const onMe = biting && biting.attacking === this.body();
              this.say(SARGE, 'trooper2', onMe ? "They're on the Corporal! All guns, weapons free!" : 'All guns, weapons free! Put them down!', 2.5);
            }
          }
        }
        if (alive(this.pack) === 0) {
          this.complete('pack');
          this.enter('done');
        } else this.m.setWaypoint(this.centroid(this.pack), 'Zergling pack', 16);
        break;
      case 'done':
        if (this.m.radio.idle) this.m.win('Training complete. Welcome to the Raiders.');
        break;
    }
    // A reminder if the player seems lost: the objective flashes with a hint, rather than
    // another call on the radio.
    if (this.step !== 'done' && this.step !== 'pack' && this.stepTime > this.nagAt) {
      this.nagAt += 30;
      const hints: Record<string, string> = {
        move: 'Follow the beacon, Corporal. The column of light. Move!',
        shoot: 'Those targets will not shoot themselves. Left click!',
        jolt: 'Shift for the Stimpack. Today, Corporal.',
        keelGun: 'Crosshair on a Roach, then Q. The Hyperion is waiting.',
        skyscan: 'Hold T, flick up to Scanner Sweep, let go, then click on the ground near the beacon.',
        bunker: 'The bunker, Corporal. Walk up to it and press F.',
        tank: 'Get in the tank: F. Then E for Siege Mode. Already sieged? E to pack it up, E again to set it down.',
      };
      this.nudge(hints[this.step]);
    }
  }
}
