// A StarCraft II install, read the way CascLib reads one: the build named in .build.info, its
// build config, the local index files (.idx: where each file is in the data.### archives), the
// ENCODING table (content key → encoded key) and the MNDX root (name → content key). Nothing
// here writes; it works over any `CascSource` (a folder picked in the browser, a list of files,
// HTTP, or Node's file system for tools).

import { decodeBlte, type Inflate } from './blte.ts';
import { listMndx } from './mndx.ts';

/** Read access to the install's folder, by paths relative to it ("SC2Data/data/data.012"). */
export interface CascSource {
  /** What to call it in messages (the folder's name). */
  readonly label: string;
  /** Bytes `[offset, offset + length)` of a file, or the whole file. */
  read(path: string, offset?: number, length?: number): Promise<Uint8Array>;
  /** The names of the files in a folder. */
  list(dir: string): Promise<string[]>;
  /** Whether a file exists. */
  exists(path: string): Promise<boolean>;
}

export type Progress = (what: string) => void;

const KEY = 9;
const ENTRY = 18;

const text = (b: Uint8Array) => new TextDecoder().decode(b);

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Compares `len` bytes of two keys. */
function compare(a: Uint8Array, ap: number, b: Uint8Array, bp: number, len: number): number {
  for (let i = 0; i < len; i++) {
    const d = a[ap + i] - b[bp + i];
    if (d) return d;
  }
  return 0;
}

/** Where a file is: which data.### archive, at what offset, and how many bytes (with its 30-byte header). */
interface Location {
  archive: number;
  offset: number;
  size: number;
}

/** The local index: 16 buckets of (9-byte key, archive and offset, size), each sorted for binary search. */
class LocalIndex {
  private buckets: Uint8Array[] = [];
  private segmentBits = 30;

  static async load(source: CascSource, dataDir: string, progress?: Progress): Promise<LocalIndex> {
    const index = new LocalIndex();
    const latest = new Map<number, { name: string; version: number }>();
    for (const name of await source.list(`${dataDir}/data`)) {
      const m = /^([0-9a-f]{2})([0-9a-f]{8})\.idx$/i.exec(name);
      if (!m) continue;
      const bucket = parseInt(m[1], 16);
      const version = parseInt(m[2], 16);
      if (!latest.has(bucket) || latest.get(bucket)!.version < version) latest.set(bucket, { name, version });
    }
    if (!latest.size) throw new Error(`No index files in ${dataDir}/data`);
    progress?.('Reading the archive index');
    await Promise.all(
      [...latest].map(async ([bucket, { name }]) => {
        index.buckets[bucket] = index.parse(await source.read(`${dataDir}/data/${name}`));
      }),
    );
    return index;
  }

  /** One .idx file's entries, sorted by key. */
  private parse(file: Uint8Array): Uint8Array {
    const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
    // A guarded block (size, hash), then the header: revision 7, the bucket, flags, and the
    // field widths (4-byte sizes, 5-byte offsets, 9-byte keys) and offset bits.
    if (view.getUint16(8, true) !== 7) throw new Error('Unsupported index file revision');
    if (file[12] !== 4 || file[13] !== 5 || file[14] !== KEY) throw new Error('Unsupported index entry layout');
    this.segmentBits = file[15];
    // The entries, in a second guarded block after 8 bytes of padding.
    const size = view.getUint32(32, true);
    if (size === 0 || 40 + size > file.length) throw new Error('Unsupported index file layout');
    const count = Math.floor(size / ENTRY);
    const entries = file.slice(40, 40 + count * ENTRY);
    let sorted = true;
    for (let i = 1; i < count && sorted; i++) if (compare(entries, (i - 1) * ENTRY, entries, i * ENTRY, KEY) > 0) sorted = false;
    if (sorted) return entries;
    const order = Array.from({ length: count }, (_, i) => i).sort((a, b) => compare(entries, a * ENTRY, entries, b * ENTRY, KEY));
    const out = new Uint8Array(count * ENTRY);
    order.forEach((from, to) => out.set(entries.subarray(from * ENTRY, from * ENTRY + ENTRY), to * ENTRY));
    return out;
  }

  find(ekey: Uint8Array): Location | null {
    let x = 0;
    for (let i = 0; i < KEY; i++) x ^= ekey[i];
    const bucket = (x & 0x0f) ^ (x >> 4);
    const entries = this.buckets[bucket];
    if (!entries) return null;
    let lo = 0;
    let hi = entries.length / ENTRY - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const c = compare(entries, mid * ENTRY, ekey, 0, KEY);
      if (c === 0) {
        const p = mid * ENTRY + KEY;
        // 40 bits, big-endian: the archive number above the segment bits, the offset below.
        const high = entries[p];
        const low = ((entries[p + 1] << 24) | (entries[p + 2] << 16) | (entries[p + 3] << 8) | entries[p + 4]) >>> 0;
        const offsetBits = this.segmentBits;
        const value = high * 2 ** 32 + low;
        const archive = Math.floor(value / 2 ** offsetBits);
        const offset = value % 2 ** offsetBits;
        const size = (entries[p + 5] | (entries[p + 6] << 8) | (entries[p + 7] << 16) | (entries[p + 8] << 24)) >>> 0;
        return { archive, offset, size };
      }
      if (c < 0) lo = mid + 1;
      else hi = mid - 1;
    }
    return null;
  }
}

/** The ENCODING table: content keys to encoded keys, in pages searched through their index of first keys. */
class Encoding {
  private data: Uint8Array;
  private pageIndex: number;
  private pages: number;
  private pageSize: number;
  private firstPage: number;

  private constructor(data: Uint8Array, pageIndex: number, pages: number, pageSize: number, firstPage: number) {
    this.data = data;
    this.pageIndex = pageIndex;
    this.pages = pages;
    this.pageSize = pageSize;
    this.firstPage = firstPage;
  }

  static parse(data: Uint8Array): Encoding {
    if (data[0] !== 0x45 || data[1] !== 0x4e || data[2] !== 1) throw new Error('Not an ENCODING file');
    if (data[3] !== 16 || data[4] !== 16) throw new Error('Unsupported ENCODING key sizes');
    const be16 = (p: number) => (data[p] << 8) | data[p + 1];
    const be32 = (p: number) => ((data[p] << 24) | (data[p + 1] << 16) | (data[p + 2] << 8) | data[p + 3]) >>> 0;
    const pageSize = be16(5) * 1024;
    const pages = be32(9);
    const espec = be32(18);
    const pageIndex = 22 + espec;
    return new Encoding(data, pageIndex, pages, pageSize, pageIndex + pages * 32);
  }

  /** The first encoded key for a content key, or null. */
  find(ckey: Uint8Array): Uint8Array | null {
    const d = this.data;
    // The last page whose first key is at or below it.
    let lo = 0;
    let hi = this.pages - 1;
    let page = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (compare(d, this.pageIndex + mid * 32, ckey, 0, 16) <= 0) {
        page = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (page < 0) return null;
    let p = this.firstPage + page * this.pageSize;
    const end = p + this.pageSize;
    while (p + 22 <= end) {
      const keys = d[p];
      if (keys === 0) break;
      const c = compare(d, p + 6, ckey, 0, 16);
      if (c === 0) return d.subarray(p + 22, p + 38);
      if (c > 0) break;
      p += 22 + keys * 16;
    }
    return null;
  }
}

export class CascStorage {
  /** Every file's name, to where its content key sits in the root. */
  private files = new Map<string, number>();

  private source: CascSource;
  private dataDir: string;
  private index: LocalIndex;
  private encoding: Encoding;
  private root: Uint8Array;
  private inflate: Inflate;
  readonly build: string;

  private constructor(source: CascSource, dataDir: string, index: LocalIndex, encoding: Encoding, root: Uint8Array, inflate: Inflate, build: string) {
    this.source = source;
    this.dataDir = dataDir;
    this.index = index;
    this.encoding = encoding;
    this.root = root;
    this.inflate = inflate;
    this.build = build;
  }

  /** Opens the install a source points at (the folder with .build.info in it). */
  static async open(source: CascSource, inflate: Inflate, progress?: Progress): Promise<CascStorage> {
    if (!(await source.exists('.build.info'))) throw new Error(`"${source.label}" isn't a StarCraft II folder: it has no .build.info`);
    const dataDir = (await source.exists('SC2Data/data')) ? 'SC2Data' : 'Data';
    const info = text(await source.read('.build.info')).split(/\r?\n/).filter(Boolean);
    const columns = info[0].split('|').map((c) => c.split('!')[0]);
    const rows = info.slice(1).map((line) => {
      const cells = line.split('|');
      return Object.fromEntries(columns.map((c, i) => [c, cells[i] ?? '']));
    });
    const row = rows.find((r) => r['Active'] === '1') ?? rows[0];
    const buildKey = row?.['Build Key'];
    if (!buildKey) throw new Error('No build in .build.info');
    const config: Record<string, string> = {};
    for (const line of text(await source.read(`${dataDir}/config/${buildKey.slice(0, 2)}/${buildKey.slice(2, 4)}/${buildKey}`)).split(/\r?\n/)) {
      const m = /^\s*([\w-]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m) config[m[1]] = m[2];
    }
    const index = await LocalIndex.load(source, dataDir, progress);
    const readEncoded = async (ekey: Uint8Array) => {
      const at = index.find(ekey);
      if (!at) return null;
      return decodeBlte(await source.read(`${dataDir}/data/data.${String(at.archive).padStart(3, '0')}`, at.offset, at.size), inflate);
    };
    progress?.('Reading the encoding table');
    const encodingKeys = (config['encoding'] ?? '').split(/\s+/);
    if (encodingKeys.length < 2) throw new Error('No ENCODING in the build config');
    const encodingData = await readEncoded(hexToBytes(encodingKeys[1]));
    if (!encodingData) throw new Error('The ENCODING file is not in the local archives');
    const encoding = Encoding.parse(encodingData);
    progress?.('Reading the file list');
    const rootEKey = encoding.find(hexToBytes(config['root'] ?? ''));
    const root = rootEKey ? await readEncoded(rootEKey) : null;
    if (!root) throw new Error('The root file is not in the local archives');
    const storage = new CascStorage(source, dataDir, index, encoding, root, inflate, row['Version'] || buildKey);
    // Only what's installed, as CascLib lists it: the root also names every language's files
    // and more besides, most of them not on this machine.
    listMndx(root, (name, ckey) => {
      if (storage.files.has(name)) return;
      const ekey = encoding.find(ckey);
      if (ekey && index.find(ekey)) storage.files.set(name, ckey.byteOffset - root.byteOffset);
    });
    return storage;
  }

  get size(): number {
    return this.files.size;
  }

  names(): IterableIterator<string> {
    return this.files.keys();
  }

  has(name: string): boolean {
    return this.files.has(name);
  }

  /** A file's content by its full name, or null if it isn't in the install. */
  async read(name: string): Promise<Uint8Array | null> {
    const at = this.files.get(name);
    if (at === undefined) return null;
    const ekey = this.encoding.find(this.root.subarray(at, at + 16));
    if (!ekey) return null;
    const loc = this.index.find(ekey);
    if (!loc) return null;
    const raw = await this.source.read(`${this.dataDir}/data/data.${String(loc.archive).padStart(3, '0')}`, loc.offset, loc.size);
    return decodeBlte(raw, this.inflate);
  }
}
