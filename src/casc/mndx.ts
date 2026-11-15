// StarCraft II's root file (MNDX): every file name in the archive and the content key of each.
//
// A port of CascLib's CascRootFile_MNDX.cpp (Copyright (c) 2014 Ladislav Zezula, MIT License;
// see THIRD_PARTY_NOTICES.md), which in turn
// follows Blizzard's own code: the names are kept in three "MAR" databases (the packages, the
// names with the package stripped, and the full names), each a compressed trie of path
// fragments with rank/select bit arrays. Only what listing every name needs is ported, and the
// quirks are kept as they are (CascLib's listing is what the server's file list comes from, so
// this must agree with it name for name).

const MNDX_SIGNATURE = 0x58444e4d; // 'MNDX'
const MAR_SIGNATURE = 0x0052414d; // 'MAR\0'
const MAR_PACKAGE_NAMES = 0;
const MAR_STRIPPED_NAMES = 1;
const LAST_CKEY_ENTRY = 0x80000000;
const INVALID = 0xffffffff;
const CKEY_ENTRY_SIZE = 24;

/** For a byte and n, the position of its n-th set bit (7 if it has fewer): CascLib's table_1BA1818. */
const NTH_SET_BIT = (() => {
  const t = new Uint8Array(0x800);
  for (let n = 0; n < 8; n++) {
    for (let b = 0; b < 256; b++) {
      let pos = 7;
      for (let bit = 0, seen = 0; bit < 8; bit++) {
        if (b & (1 << bit)) {
          if (seen === n) {
            pos = bit;
            break;
          }
          seen++;
        }
      }
      t[n * 256 + b] = pos;
    }
  }
  return t;
})();

/** Set-bit counts of the lowest 1, 2, 3 and 4 bytes of a 32-bit value (CascLib's SETBITS). */
function setBits(v: number): number {
  v = ((v >>> 1) & 0x55555555) + (v & 0x55555555);
  v = ((v >>> 2) & 0x33333333) + (v & 0x33333333);
  v = ((v >>> 4) & 0x0f0f0f0f) + (v & 0x0f0f0f0f);
  return Math.imul(v, 0x01010101) >>> 0;
}
const lower08 = (s: number) => s & 0xff;
const lower16 = (s: number) => (s >>> 8) & 0xff;
const lower24 = (s: number) => (s >>> 16) & 0xff;
const lower32 = (s: number) => s >>> 24;

class Stream {
  private pos = 0;
  private view: DataView;
  private end: number;

  constructor(view: DataView, end: number) {
    this.view = view;
    this.end = end;
  }

  u32(): number {
    if (this.pos + 4 > this.end) throw new Error('MNDX: unexpected end of data');
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }

  u64(): number {
    const lo = this.u32();
    const hi = this.u32();
    if (hi !== 0) throw new Error('MNDX: value out of range');
    return lo;
  }

  /** A generic array: its byte size (64-bit), its items, then padding to 8 bytes. Returns its bytes' offset and size. */
  array(itemSize: number): { at: number; bytes: number } {
    const bytes = this.u64();
    if (bytes % itemSize !== 0) throw new Error('MNDX: bad array size');
    const at = this.pos;
    if (at + bytes > this.end) throw new Error('MNDX: array past the end');
    this.pos += bytes + ((0 - bytes) & 7);
    return { at, bytes };
  }

  dwords(): Uint32Array {
    const { at, bytes } = this.array(4);
    const out = new Uint32Array(bytes / 4);
    for (let i = 0; i < out.length; i++) out[i] = this.view.getUint32(at + i * 4, true);
    return out;
  }

  bytes(): Uint8Array {
    const { at, bytes } = this.array(1);
    return new Uint8Array(this.view.buffer, this.view.byteOffset + at, bytes).slice();
  }

  /** BASEVALS: a 32-bit base every 0x200 items, and seven packed counts above it every 0x40. */
  baseVals(): BaseVals {
    const { at, bytes } = this.array(12);
    const n = bytes / 12;
    const v: BaseVals = {
      base200: new Uint32Array(n),
      add40: new Uint16Array(n),
      add80: new Uint16Array(n),
      addC0: new Uint16Array(n),
      add100: new Uint16Array(n),
      add140: new Uint16Array(n),
      add180: new Uint16Array(n),
      add1C0: new Uint16Array(n),
    };
    for (let i = 0; i < n; i++) {
      const p = at + i * 12;
      v.base200[i] = this.view.getUint32(p, true);
      const a = this.view.getUint32(p + 4, true);
      const b = this.view.getUint32(p + 8, true);
      v.add40[i] = a & 0x7f;
      v.add80[i] = (a >>> 7) & 0xff;
      v.addC0[i] = (a >>> 15) & 0xff;
      v.add100[i] = (a >>> 23) & 0x1ff;
      v.add140[i] = b & 0x1ff;
      v.add180[i] = (b >>> 9) & 0x1ff;
      v.add1C0[i] = (b >>> 18) & 0x1ff;
    }
    return v;
  }

  hashEntries(): { node: Uint32Array; next: Uint32Array; fragment: Uint32Array } {
    const { at, bytes } = this.array(12);
    const n = bytes / 12;
    const node = new Uint32Array(n);
    const next = new Uint32Array(n);
    const fragment = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      node[i] = this.view.getUint32(at + i * 12, true);
      next[i] = this.view.getUint32(at + i * 12 + 4, true);
      fragment[i] = this.view.getUint32(at + i * 12 + 8, true);
    }
    return { node, next, fragment };
  }
}

interface BaseVals {
  base200: Uint32Array;
  add40: Uint16Array;
  add80: Uint16Array;
  addC0: Uint16Array;
  add100: Uint16Array;
  add140: Uint16Array;
  add180: Uint16Array;
  add1C0: Uint16Array;
}

/** A packed array of fixed-width bit fields (CascLib's TBitEntryArray). */
class BitEntryArray {
  items: Uint32Array;
  bitsPerEntry: number;
  mask: number;

  constructor(s: Stream) {
    this.items = s.dwords();
    this.bitsPerEntry = s.u32();
    if (this.bitsPerEntry > 32) throw new Error('MNDX: bad bit entry width');
    this.mask = s.u32();
    s.u64();
  }

  get(i: number): number {
    const bit = i * this.bitsPerEntry;
    const word = Math.floor(bit / 32);
    const start = bit % 32;
    const v = start + this.bitsPerEntry > 32 ? (this.items[word + 1] << (32 - start)) | (this.items[word] >>> start) : this.items[word] >>> start;
    return (v & this.mask) >>> 0;
  }
}

/** A bit array with rank and select (CascLib's TSparseArray). */
class SparseArray {
  bits: Uint32Array;
  total: number;
  valid: number;
  base: BaseVals;
  toItem0: Uint32Array;
  toItem1: Uint32Array;

  constructor(s: Stream) {
    this.bits = s.dwords();
    this.total = s.u32();
    this.valid = s.u32();
    if (this.valid > this.total) throw new Error('MNDX: corrupt sparse array');
    this.base = s.baseVals();
    this.toItem0 = s.dwords();
    this.toItem1 = s.dwords();
  }

  isEmpty(): boolean {
    return this.total === 0;
  }

  has(i: number): boolean {
    return (this.bits[i >>> 5] & (1 << (i & 31))) !== 0;
  }

  /** Rank: the number of set bits below `i`. */
  valueAt(i: number): number {
    const g = i >>> 9;
    const b = this.base;
    let v = b.base200[g];
    switch (((i >>> 6) & 7) - 1) {
      case 0:
        v += b.add40[g];
        break;
      case 1:
        v += b.add80[g];
        break;
      case 2:
        v += b.addC0[g];
        break;
      case 3:
        v += b.add100[g];
        break;
      case 4:
        v += b.add140[g];
        break;
      case 5:
        v += b.add180[g];
        break;
      case 6:
        v += b.add1C0[g];
        break;
    }
    if (i & 0x20) v += lower32(setBits(this.bits[(i >>> 5) - 1]));
    const mask = ((1 << (i & 31)) - 1) >>> 0;
    return v + lower32(setBits((this.bits[i >>> 5] & mask) >>> 0));
  }

  private findGroup0(index: number): number {
    const b = this.base.base200;
    let minGroup = this.toItem0[index >>> 9] >>> 9;
    let maxGroup = (this.toItem0[(index >>> 9) + 1] + 0x1ff) >>> 9;
    if (maxGroup - minGroup < 10) {
      while (index >= (minGroup << 9) - b[minGroup + 1] + 0x200) minGroup++;
    } else {
      // As CascLib has it: the comparison is against maxGroup, not the middle.
      while (minGroup + 1 < maxGroup) {
        const middle = (maxGroup + minGroup) >>> 1;
        if (index < (maxGroup << 9) - b[maxGroup]) maxGroup = middle;
        else minGroup = middle;
      }
    }
    return minGroup;
  }

  private findGroup1(index: number): number {
    const b = this.base.base200;
    const group = index >>> 9;
    let start = this.toItem1[group] >>> 9;
    let next = (this.toItem1[group + 1] + 0x1ff) >>> 9;
    if (next - start < 10) {
      while (index >= b[start + 1]) start++;
    } else if (start + 1 < next) {
      // As CascLib has it: a single step of the binary search.
      const middle = (next + start) >>> 1;
      if (index < b[middle]) next = middle;
      else start = middle;
    }
    return start;
  }

  /** Select over the clear bits: the position of the `index`-th zero. */
  item0(index: number): number {
    if ((index & 0x1ff) === 0) return this.toItem0[index >>> 9];
    const g = this.findGroup0(index);
    const b = this.base;
    let edx = index + b.base200[g] - (g << 9);
    let word = g << 4;
    if (edx < 0x100 - b.add100[g]) {
      if (edx < 0x80 - b.add80[g]) {
        if (edx >= 0x40 - b.add40[g]) {
          word += 2;
          edx = edx + b.add40[g] - 0x40;
        }
      } else if (edx < 0xc0 - b.addC0[g]) {
        word += 4;
        edx = edx + b.add80[g] - 0x80;
      } else {
        word += 6;
        edx = edx + b.addC0[g] - 0xc0;
      }
    } else if (edx < 0x180 - b.add180[g]) {
      if (edx < 0x140 - b.add140[g]) {
        word += 8;
        edx = edx + b.add100[g] - 0x100;
      } else {
        word += 10;
        edx = edx + b.add140[g] - 0x140;
      }
    } else if (edx < 0x1c0 - b.add1C0[g]) {
      word += 12;
      edx = edx + b.add180[g] - 0x180;
    } else {
      word += 14;
      edx = edx + b.add1C0[g] - 0x1c0;
    }
    let group = ~this.bits[word] >>> 0;
    let zeros = setBits(group);
    if (edx >= lower32(zeros)) {
      group = ~this.bits[++word] >>> 0;
      edx -= lower32(zeros);
      zeros = setBits(group);
    }
    let item = word << 5;
    if (edx < lower16(zeros)) {
      if (edx >= lower08(zeros)) {
        group >>>= 8;
        item += 8;
        edx -= lower08(zeros);
      }
    } else if (edx < lower24(zeros)) {
      group >>>= 16;
      item += 16;
      edx -= lower16(zeros);
    } else {
      group >>>= 24;
      item += 24;
      edx -= lower24(zeros);
    }
    return NTH_SET_BIT[(group & 0xff) + (edx << 8)] + item;
  }

  /** Select over the set bits: the position of the `index`-th one. */
  item1(index: number): number {
    if ((index & 0x1ff) === 0) return this.toItem1[index >>> 9];
    const g = this.findGroup1(index);
    const b = this.base;
    let dist = index - b.base200[g];
    let word = g << 4;
    if (dist < b.add100[g]) {
      if (dist < b.add80[g]) {
        if (dist >= b.add40[g]) {
          dist -= b.add40[g];
          word += 2;
        }
      } else if (dist < b.addC0[g]) {
        dist -= b.add80[g];
        word += 4;
      } else {
        dist -= b.addC0[g];
        word += 6;
      }
    } else if (dist < b.add180[g]) {
      if (dist < b.add140[g]) {
        dist -= b.add100[g];
        word += 8;
      } else {
        dist -= b.add140[g];
        word += 10;
      }
    } else if (dist < b.add1C0[g]) {
      dist -= b.add180[g];
      word += 12;
    } else {
      dist -= b.add1C0[g];
      word += 14;
    }
    let group = this.bits[word];
    let set = setBits(group);
    if (dist >= lower32(set)) {
      group = this.bits[++word];
      dist -= lower32(set);
      set = setBits(group);
    }
    let item = word << 5;
    if (dist < lower16(set)) {
      if (dist >= lower08(set)) {
        item += 8;
        group >>>= 8;
        dist -= lower08(set);
      }
    } else if (dist < lower24(set)) {
      group >>>= 16;
      item += 16;
      dist -= lower16(set);
    } else {
      group >>>= 24;
      item += 24;
      dist -= lower24(set);
    }
    return NTH_SET_BIT[(group & 0xff) + (dist << 8)] + item;
  }
}

interface PathStop {
  loBits: number;
  field4: number;
  count: number;
  hiBits: number;
  field10: number;
}

/** A search in progress (CascLib's TMndxSearch with its TStruct40): the name being built and where it is. */
class Search {
  path: number[] = [];
  stops: PathStop[] = [];
  node = 0;
  pathLength = 0;
  itemCount = 0;
  phase: 'init' | 'searching' | 'done' = 'init';
  found = '';
  index = 0;
}

const SINGLE_CHAR = 0xffffff00;

/** One MAR database: a trie of path fragments (CascLib's TFileNameDatabase). Listing only: the search mask is always empty. */
class NameDatabase {
  collisions: SparseArray;
  nameIndexes: SparseArray;
  hiBitsIndexes: SparseArray;
  loBits: Uint8Array;
  hiBits: BitEntryArray;
  fragments: Uint8Array;
  fragmentMarks: SparseArray;
  child: NameDatabase | null = null;
  hash: { node: Uint32Array; next: Uint32Array; fragment: Uint32Array };
  hashMask: number;
  field214: number;

  constructor(s: Stream) {
    this.collisions = new SparseArray(s);
    this.nameIndexes = new SparseArray(s);
    this.hiBitsIndexes = new SparseArray(s);
    this.loBits = s.bytes();
    this.hiBits = new BitEntryArray(s);
    this.fragments = s.bytes();
    this.fragmentMarks = new SparseArray(s);
    if (this.hiBitsIndexes.valid !== 0 && this.fragments.length === 0) this.child = new NameDatabase(s);
    this.hash = s.hashEntries();
    this.hashMask = this.hash.node.length - 1;
    this.field214 = s.u32();
    s.u32();
  }

  private isFragmentString(i: number): boolean {
    return this.hiBitsIndexes.has(i);
  }

  private fragmentOffset1(loBits: number): number {
    const hi = this.hiBitsIndexes.valueAt(loBits);
    return ((this.hiBits.get(hi) << 8) | this.loBits[loBits]) >>> 0;
  }

  private fragmentOffset2(stop: PathStop, loBits: number): number {
    if (stop.hiBits === INVALID) stop.hiBits = this.hiBitsIndexes.valueAt(loBits);
    else stop.hiBits++;
    return ((this.hiBits.get(stop.hiBits) << 8) | this.loBits[loBits]) >>> 0;
  }

  /** Appends a fragment from the fragment table (zero-terminated, or ended by its marks). */
  private copyFragment(search: Search, offset: number) {
    const f = this.fragments;
    if (this.fragmentMarks.isEmpty()) {
      while (f[offset] !== 0) search.path.push(f[offset++]);
    } else {
      while (!this.fragmentMarks.has(offset)) search.path.push(f[offset++]);
    }
  }

  /** Appends the fragment a node of this (child) database spells, walking it back up. */
  copyFragmentByIndex(search: Search, table: number) {
    for (;;) {
      const h = table & this.hashMask;
      if (table === this.hash.next[h]) {
        const fragment = this.hash.fragment[h];
        if ((fragment & SINGLE_CHAR) >>> 0 !== SINGLE_CHAR) {
          if (this.child) this.child.copyFragmentByIndex(search, fragment);
          else this.copyFragment(search, fragment);
        } else {
          search.path.push(fragment & 0xff);
        }
        table = this.hash.node[h];
        if (table === 0) return;
      } else {
        if (this.isFragmentString(table)) {
          const offset = this.fragmentOffset1(table);
          if (this.child) this.child.copyFragmentByIndex(search, offset);
          else this.copyFragment(search, offset);
        } else {
          search.path.push(this.loBits[table]);
        }
        if (table <= this.field214) return;
        table = (this.collisions.item1(table) - table - 1) >>> 0;
      }
    }
  }

  /** The next name in the listing (CascLib's DoSearch with an empty mask); false when there are no more. */
  next(search: Search): boolean {
    if (search.phase === 'done') return false;
    if (search.phase === 'init') {
      search.path = [];
      search.stops = [];
      search.pathLength = 0;
      search.node = 0;
      search.itemCount = 0;
      search.phase = 'searching';
      search.stops.push({ loBits: search.node, field4: 0, count: search.path.length, hiBits: INVALID, field10: INVALID });
      search.itemCount = 1;
      if (this.nameIndexes.has(search.node)) {
        search.found = '';
        search.index = this.nameIndexes.valueAt(search.node);
        return true;
      }
    }
    for (;;) {
      if (search.itemCount === search.stops.length) {
        const last = search.stops[search.stops.length - 1];
        const col = this.collisions.item0(last.loBits) + 1;
        search.stops.push({ loBits: col - last.loBits - 1, field4: col, count: 0, hiBits: INVALID, field10: INVALID });
      }
      const stop = search.stops[search.itemCount];
      if (this.collisions.has(stop.field4++)) {
        search.itemCount++;
        if (this.isFragmentString(stop.loBits)) {
          const offset = this.fragmentOffset2(stop, stop.loBits);
          if (this.child) this.child.copyFragmentByIndex(search, offset);
          else this.copyFragment(search, offset);
        } else {
          search.path.push(this.loBits[stop.loBits]);
        }
        stop.count = search.path.length;
        if (this.nameIndexes.has(stop.loBits)) {
          stop.field10 = stop.field10 === INVALID ? this.nameIndexes.valueAt(stop.loBits) : stop.field10 + 1;
          search.found = latin1(search.path);
          search.index = stop.field10;
          return true;
        }
      } else {
        if (search.itemCount === 1) {
          search.phase = 'done';
          return false;
        }
        search.stops[search.itemCount - 1].loBits++;
        search.path.length = search.stops[search.itemCount - 2].count;
        search.itemCount--;
      }
    }
  }

  get nameCount(): number {
    return this.nameIndexes.valid;
  }
}

function latin1(bytes: number[]): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.slice(i, i + 8192));
  return s;
}

/** Every file in the root, as its full name ("mods/core.sc2mod/base.sc2data/…") and content key. */
export interface RootEntry {
  name: string;
  /** The content key (MD5 of the file), 16 bytes. */
  ckey: Uint8Array;
  /** Uncompressed size, bytes. */
  size: number;
}

/**
 * Lists every file in an MNDX root, calling `each` with its full name and content key (as the
 * root has them: one name can live in several packages, each with its own key).
 */
export function listMndx(root: Uint8Array, each: (name: string, ckey: Uint8Array, size: number) => void) {
  const view = new DataView(root.buffer, root.byteOffset, root.byteLength);
  if (view.getUint32(0, true) !== MNDX_SIGNATURE) throw new Error('MNDX: not an MNDX root file');
  const headerVersion = view.getUint32(4, true);
  const formatVersion = view.getUint32(8, true);
  if (formatVersion < 1 || formatVersion > 2 || headerVersion > 2) throw new Error(`MNDX: unsupported version ${headerVersion}/${formatVersion}`);
  let p = 12 + (headerVersion === 2 ? 8 : 0);
  const marInfoOffset = view.getUint32(p, true);
  const marInfoCount = view.getUint32(p + 4, true);
  const marInfoSize = view.getUint32(p + 8, true);
  const ckeyOffset = view.getUint32(p + 12, true);
  const ckeyCount = view.getUint32(p + 16, true);
  const fileNameCount = view.getUint32(p + 20, true);
  const ckeySize = view.getUint32(p + 24, true);
  if (marInfoCount > 3 || marInfoSize !== 20 || ckeySize !== CKEY_ENTRY_SIZE) throw new Error('MNDX: unexpected layout');

  const mars: NameDatabase[] = [];
  for (let i = 0; i < marInfoCount; i++) {
    p = marInfoOffset + marInfoSize * i;
    const size = view.getUint32(p + 4, true);
    const offset = view.getUint32(p + 12, true);
    const marView = new DataView(root.buffer, root.byteOffset + offset, size);
    const s = new Stream(marView, size);
    if (s.u32() !== MAR_SIGNATURE) throw new Error('MNDX: bad MAR signature');
    mars.push(new NameDatabase(s));
  }
  if (mars.length < 3) throw new Error('MNDX: missing MAR databases');
  if (mars[MAR_STRIPPED_NAMES].nameCount !== fileNameCount) throw new Error('MNDX: name count mismatch');

  // The CKey entries, grouped by name: each group ends with a flagged entry.
  const groupStart = new Uint32Array(fileNameCount + 1);
  let names = 0;
  groupStart[names++] = 0;
  for (let i = 0; i < ckeyCount && names <= fileNameCount; i++) {
    if (view.getUint32(ckeyOffset + i * CKEY_ENTRY_SIZE, true) & LAST_CKEY_ENTRY) groupStart[names++] = i + 1;
  }
  if (names - 1 !== fileNameCount) throw new Error('MNDX: bad CKey groups');

  // The packages ("mods/core.sc2mod"), by index.
  const packages: string[] = [];
  const search = new Search();
  while (mars[MAR_PACKAGE_NAMES].next(search)) packages[search.index] = search.found;

  // Every stripped name, joined to the package of each of its entries.
  const names1 = new Search();
  while (mars[MAR_STRIPPED_NAMES].next(names1)) {
    if (names1.index >= fileNameCount) continue;
    for (let i = groupStart[names1.index]; i < ckeyCount; i++) {
      const at = ckeyOffset + i * CKEY_ENTRY_SIZE;
      const flags = view.getUint32(at, true);
      const pkg = packages[flags & 0x00ffffff];
      if (pkg !== undefined) each(`${pkg}/${names1.found}`, root.subarray(at + 4, at + 20), view.getUint32(at + 20, true));
      if (flags & LAST_CKEY_ENTRY) break;
    }
  }
}
