import type { MapData } from '../../../../src/engine/mapdata.ts';

/**
 * The Tide: Unleashed's valley: Char's ridge as the cinematic stages it, the Raiders' base down
 * in a hollow and the swarm pouring down at it from the heights. On the map as made, the base
 * stands on a plateau a cliff level over the basin the swarm crosses, and the swarm climbs short,
 * steep ramps up to it. Here the map is sculpted before its ground is built:
 *
 * - The base (its plateau and its high ground, as far as it's walked from the Command Center)
 *   goes down a cliff level, and everything round it comes up one: the base lies a level under
 *   the basin, two under the far plateaus. The chasms keep their depth. StarCraft II picks a
 *   cliff's tile by which side is higher, so the cliffs round the base turn over with it, and
 *   where the two sides come level a cliff shrinks smoothly to nothing.
 * - Each ramp between the base and the basin is laid level with the basin, and the base's floor
 *   rises to meet it over `FAN` cells: a long slope down into the base instead of a short climb.
 * - Where the plateau runs on past the base (as it does to the north-east), it comes back up
 *   between `RISE` cells from the Command Center, so the far end stands with everything else.
 * - Doodads move with the ground under them.
 *
 * Heights are game units (6 m at the map's frame); a cliff level is 2.
 */

/** How far a ramp's drop is spread down into the base, cells (6 m each). */
const FAN = 15;
/** Cells round the base's walkable ground that go down with it: the rocks, cliff edges and rubble on it. */
const CLOSE = 6;
/** Distance from the Command Center over which the plateau comes back up, cells. */
const RISE: [number, number] = [34, 54];
/** A cliff level, game units. */
const LEVEL = 2;

export interface ValleyReport {
  /** Vertices of the base that went down. */
  base: number;
  /** Ramps laid level with the basin, and their cells. */
  ramps: number;
  rampCells: number;
  /** Cliff cells become ground where the sides came level. */
  opened: number;
  doodads: number;
}

const smooth = (t: number) => {
  t = Math.min(1, Math.max(0, t));
  return t * t * (3 - 2 * t);
};

/** Sculpts `map` in place round the Command Center at cell (`cx`, `cy`). */
export function sculptValley(map: MapData, cx: number, cy: number): ValleyReport {
  const w = map.width;
  const h = map.height;
  const W = w + 1;
  const H = h + 1;
  const level = map.cellLevels;
  const pathable = map.pathable;
  const frac = (l: number) => Math.abs(l - Math.round(l)) > 0.01;
  const corners = (c: number) => {
    const x = c % w;
    const y = (c / w) | 0;
    return [y * W + x, y * W + x + 1, (y + 1) * W + x, (y + 1) * W + x + 1];
  };
  const neighbors8 = (c: number, fn: (n: number, diagonal: boolean) => void) => {
    const x = c % w;
    const y = (c / w) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h) fn(ny * w + nx, !!(dx && dy));
      }
    }
  };

  // The base's walkable ground: its plateau and high ground (up its own ramps), and how far each
  // cell of it is walked from the Command Center.
  const start = Math.floor(cy) * w + Math.floor(cx);
  const top = Math.round(level[start]);
  const floor = (c: number) => pathable[c] && level[c] >= top - 0.001;
  const walk = dijkstra(w * h, [start], (c, visit) => neighbors8(c, (n, d) => floor(n) && visit(n, d ? Math.SQRT2 : 1)));
  const region = new Uint8Array(w * h);
  for (let c = 0; c < w * h; c++) if (walk[c] < Infinity) region[c] = 1;
  // Closed over what stands on it and round it: rocks, rubble, the cliff edges.
  const closed = region.slice();
  for (let pass = 0; pass < CLOSE; pass++) {
    const grow: number[] = [];
    for (let c = 0; c < w * h; c++) {
      if (closed[c] || pathable[c]) continue;
      let touches = false;
      neighbors8(c, (n) => (touches ||= !!closed[n]));
      if (touches) grow.push(c);
    }
    for (const c of grow) closed[c] = 1;
  }

  // The ramps down from the base to the basin: walkable cells part way between the two levels
  // beside its ground. Each as a whole, with the base's cells at its top.
  const isRamp = (c: number) => pathable[c] && !region[c] && frac(level[c]) && level[c] < top && level[c] > top - 1;
  const rampOf = new Int32Array(w * h).fill(-1);
  const rampTops: number[][] = [];
  let rampCells = 0;
  for (let c = 0; c < w * h; c++) {
    if (rampOf[c] >= 0 || !isRamp(c)) continue;
    let beside = false;
    neighbors8(c, (n) => (beside ||= !!region[n]));
    if (!beside) continue;
    const id = rampTops.length;
    const tops = new Set<number>();
    const q = [c];
    rampOf[c] = id;
    while (q.length) {
      const r = q.pop()!;
      rampCells++;
      neighbors8(r, (n) => {
        if (region[n] && !frac(level[n])) tops.add(n);
        if (rampOf[n] >= 0 || !isRamp(n)) return;
        rampOf[n] = id;
        q.push(n);
      });
    }
    rampTops.push([...tops]);
  }

  // The slope down from each ramp, walked along the base's floor (not onto its high ground).
  const fanFrom = dijkstra(
    w * h,
    rampTops.flat(),
    (c, visit) => neighbors8(c, (n, d) => region[n] && !frac(level[n]) && Math.round(level[n]) === top && visit(n, d ? Math.SQRT2 : 1)),
    FAN + 2,
  );

  // Each of the base's walkable cells: how far down it goes, in game units. Down a level, up
  // toward a ramp's top, and back up where the plateau runs on far from the base.
  const cellDelta = new Float32Array(w * h);
  for (let c = 0; c < w * h; c++) {
    if (!region[c]) continue;
    const ramp = fanFrom[c] < Infinity ? 1 - smooth(fanFrom[c] / FAN) : 0;
    // Measured straight, not walked: the base's own high ground is near, however far round its ramp is.
    const away = smooth((Math.hypot((c % w) + 0.5 - cx, ((c / w) | 0) + 0.5 - cy) - RISE[0]) / (RISE[1] - RISE[0]));
    cellDelta[c] = Math.min(LEVEL, -LEVEL + LEVEL * ramp + 2 * LEVEL * away);
  }
  // A ramp ends where its top cells are now: laid from the basin's new height to theirs.
  const rampTop = rampTops.map((tops) => (tops.length ? tops.reduce((a, c) => a + cellDelta[c], 0) / tops.length : 0));
  // Each ramp's foot and top as they stand before the move: the mean height of the basin's ground beside it,
  // and of its top cells. A ramp's own heights can lie flat on the basin (its slope a single step at the top,
  // its levels alone sloping), so it's laid between where its foot and its top go, not moved by its levels.
  const cellHeight = (c: number) => corners(c).reduce((a, v) => a + map.heights[v], 0) / 4;
  const foot = rampTops.map(() => ({ sum: 0, n: 0 }));
  for (let c = 0; c < w * h; c++) {
    const id = rampOf[c];
    if (id < 0) continue;
    neighbors8(c, (n) => {
      if (!pathable[n] || region[n] || rampOf[n] >= 0) return;
      foot[id].sum += cellHeight(n);
      foot[id].n++;
    });
  }
  const footHeight = foot.map((f) => (f.n ? f.sum / f.n : NaN));
  // The top's on the plateau's own corners (an edge cell's others lie down at the basin's height).
  const topHeight = rampTops.map((tops) => {
    let sum = 0;
    let n = 0;
    for (const c of tops) {
      for (const v of corners(c)) {
        if (map.cliff[v] < top) continue;
        sum += map.heights[v];
        n++;
      }
    }
    return n ? sum / n : NaN;
  });

  // Every vertex's move. The base's: the mean of its walkable cells round it. A ramp's: from the
  // basin's rise at its foot to its top's at the top, by how far along it is (the mean level of
  // its ramp cells round it). The chasms stay; everything else rises a level.
  const delta = new Float32Array(W * H);
  const fixed = new Uint8Array(W * H);
  {
    const sum = new Float32Array(W * H);
    const count = new Uint8Array(W * H);
    const rampSum = new Float32Array(W * H);
    const rampCount = new Uint8Array(W * H);
    const rampId = new Int32Array(W * H).fill(-1);
    for (let c = 0; c < w * h; c++) {
      if (region[c]) {
        for (const v of corners(c)) {
          if (map.cliff[v] < top) continue;
          sum[v] += cellDelta[c];
          count[v]++;
        }
      } else if (rampOf[c] >= 0) {
        for (const v of corners(c)) {
          rampSum[v] += level[c] - (top - 1);
          rampCount[v]++;
          rampId[v] = rampOf[c];
        }
      }
    }
    for (let v = 0; v < W * H; v++) {
      if (count[v]) {
        delta[v] = sum[v] / count[v];
        fixed[v] = 1;
      } else if (rampCount[v]) {
        const along = Math.min(1, Math.max(0, rampSum[v] / rampCount[v]));
        const id = rampId[v];
        const from = footHeight[id] + LEVEL;
        const to = topHeight[id] + rampTop[id];
        delta[v] = Number.isFinite(from) && Number.isFinite(to) ? from + (to - from) * along - map.heights[v] : LEVEL + (rampTop[id] - LEVEL) * along;
        fixed[v] = 1;
      } else if (map.cliff[v] === 0) {
        delta[v] = 0;
        fixed[v] = 1;
      }
    }
    // What's left inside the base's closed ground (the middle of a rock outcrop) settles between
    // its edges; everything else outside rises a level. Only a vertex with closed ground all round
    // it is inside: one that touches the basin (the foot of a cliff round the base) rises with the
    // basin, or the cliff's foot sinks into a trench between the base and the basin.
    const allClosed = (v: number) => {
      const x = v % W;
      const y = (v / W) | 0;
      for (const [dx, dy] of [
        [-1, -1],
        [0, -1],
        [-1, 0],
        [0, 0],
      ]) {
        const cx2 = x + dx;
        const cy2 = y + dy;
        if (cx2 < 0 || cy2 < 0 || cx2 >= w || cy2 >= h) continue;
        if (!closed[cy2 * w + cx2]) return false;
      }
      return true;
    };
    const inner = new Uint8Array(W * H);
    for (let c = 0; c < w * h; c++) {
      if (!closed[c]) continue;
      for (const v of corners(c)) if (!fixed[v] && map.cliff[v] >= top && allClosed(v)) inner[v] = 1;
    }
    for (let v = 0; v < W * H; v++) if (!fixed[v] && !inner[v]) delta[v] = LEVEL;
    for (let v = 0; v < W * H; v++) if (inner[v]) delta[v] = -LEVEL;
    for (let pass = 0; pass < 60; pass++) {
      for (let v = 0; v < W * H; v++) {
        if (!inner[v]) continue;
        const x = v % W;
        const y = (v / W) | 0;
        let s = 0;
        let n = 0;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          s += delta[ny * W + nx];
          n++;
        }
        delta[v] = s / n;
      }
    }
  }

  // Which cells were cliffs (their corners on different levels), before the levels move.
  const wasCliff = new Uint8Array(w * h);
  for (let c = 0; c < w * h; c++) {
    const ls = corners(c).map((v) => map.cliff[v]);
    if (!pathable[c] && Math.max(...ls) !== Math.min(...ls)) wasCliff[c] = 1;
  }

  // Heights and cliff levels. A level goes with any move at all, the rest of the move in the
  // ground under it, so a cliff whose sides come level shrinks smoothly to nothing.
  for (let v = 0; v < W * H; v++) {
    const d = delta[v];
    map.heights[v] += d;
    map.walkHeights[v] += d;
    const l = map.cliff[v];
    if (l === 0) continue;
    map.cliff[v] = Math.max(1, l + (d < -0.01 ? -1 : d > 0.01 ? 1 : 0));
  }

  // The cells' levels, for walking: each by how far its ground moved (the base's slopes part way
  // between levels, so they walk like ramps), the chasms as they were.
  for (let c = 0; c < w * h; c++) {
    const mean = corners(c).reduce((a, v) => a + delta[v], 0) / 4;
    if (region[c]) level[c] += cellDelta[c] / LEVEL;
    else if (rampOf[c] >= 0) {
      // From the basin's new level at its foot to its top cells' at the top, as its ground is laid; still
      // part way between levels, so it walks as a ramp.
      const along = Math.min(1, Math.max(0, level[c] - (top - 1)));
      const l = top + (rampTop[rampOf[c]] / LEVEL) * along;
      level[c] = frac(l) ? l : l + 0.02;
    }
    else if (level[c] >= 0.5) level[c] += Math.round(mean / LEVEL);
  }
  // A cliff whose sides have come level (beside a ramp's slope): ground you can walk, part way
  // between the levels round it so it walks like a ramp.
  let opened = 0;
  const open: number[] = [];
  for (let c = 0; c < w * h; c++) {
    if (!wasCliff[c] || pathable[c] || corners(c).some((v) => map.cliff[v] === 0)) continue;
    const hs = corners(c).map((v) => map.heights[v]);
    if (Math.max(...hs) - Math.min(...hs) >= 0.35 * LEVEL) continue;
    let between = 0;
    neighbors8(c, (n) => (between += pathable[n] ? 1 : 0));
    if (between >= 2) open.push(c);
  }
  for (const c of open) {
    let s = 0;
    let n = 0;
    neighbors8(c, (m) => {
      if (!pathable[m]) return;
      s += level[m];
      n++;
    });
    pathable[c] = 1;
    const l = s / n;
    level[c] = frac(l) ? l : l + 0.02;
    opened++;
  }

  // Doodads ride the ground they stand on.
  let doodads = 0;
  for (const p of map.placements) {
    if (p.kind !== 'doodad') continue;
    const fx = Math.min(w - 1e-4, Math.max(0, p.x));
    const fy = Math.min(h - 1e-4, Math.max(0, p.y));
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const d = (delta[iy * W + ix] * (1 - tx) + delta[iy * W + ix + 1] * tx) * (1 - ty) + (delta[(iy + 1) * W + ix] * (1 - tx) + delta[(iy + 1) * W + ix + 1] * tx) * ty;
    if (d !== 0) {
      p.z += d;
      doodads++;
    }
  }
  let base = 0;
  for (let v = 0; v < W * H; v++) if (delta[v] < -0.01) base++;
  return { base, ramps: rampTops.length, rampCells, opened, doodads };
}

/**
 * Shortest walking distances over a grid from `sources` (cells), out to `limit`: `edges(c, visit)`
 * calls `visit(n, cost)` for each step from `c`.
 */
function dijkstra(size: number, sources: number[], edges: (c: number, visit: (n: number, cost: number) => void) => void, limit = Infinity): Float64Array {
  // Doubles: a float32 store rounds a diagonal's distance below the heap's, and the cell would
  // read as already settled by a shorter path.
  const dist = new Float64Array(size).fill(Infinity);
  // A binary heap of [distance, cell].
  const heap: [number, number][] = [];
  const push = (d: number, c: number) => {
    heap.push([d, c]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  for (const s of sources) {
    dist[s] = 0;
    push(0, s);
  }
  while (heap.length) {
    const [d, c] = pop();
    if (d > dist[c]) continue;
    edges(c, (n, cost) => {
      const nd = d + cost;
      if (nd < dist[n] && nd <= limit) {
        dist[n] = nd;
        push(nd, n);
      }
    });
  }
  return dist;
}
