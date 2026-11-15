/**
 * Reader for StarCraft II's M3 model format (the "MD34" container).
 *
 * An M3 file is a set of typed arrays ("sections") listed in an index at the end of the
 * file. Structures point at other sections through 12-byte references: element count,
 * section number, flags. Field layouts follow the modding community's notes (the m3addon
 * project's structures.xml) and were checked against the files in this install. Handled:
 * MODL 23 (the base units), 25 and 29 (models redone later, such as the SCV and the Siege
 * Tank's tank mode), with MAT_ 15/17/19/20, LAYR 22/25/26, REGN 3/5, SEQS 1/2 and CAM_ 3/5.
 * Later versions insert fields, so the offsets that moved are kept in per-version tables.
 */

import { LAYER_SLOTS, type Vec3, type Quat, type ModelBone, type ModelTrack, type ModelSequence, type LayerSlot, type ModelLayer, type ModelMaterial, type ModelBatch, type ModelAnim, type RGBA, type ModelEmitter, type ModelData } from '../../../../src/engine/modeldata.ts';

export interface M3ParseOptions {
  /**
   * Resolve composite materials (passes of other materials, each with an alpha factor) to
   * their primary standard material instead of -1, and mark terrain-textured batches. Off by
   * default, so batches read as they always have.
   */
  composites?: boolean;
}

interface Section {
  tag: string;
  offset: number;
  count: number;
  version: number;
}

const SD2V = 1;
const SD3V = 2;
const SD4Q = 3;
const SDCC = 4;
const SDR3 = 5;
const SDS6 = 7;
const SDFG = 11;

// Where the fields that moved sit, per version. MODL keeps one list per material type, at
// +312 + 12 x (MATM type - 1): 1 standard, 2 displacement, 3 composite, 4 terrain, 7 creep.
// MODL 25 has one more type ahead of the emitters and 29 four more; between the emitters and
// the inverse bind poses, 25 has one more reference and 29 two more. Everything the reader
// uses before +312 stays put.
const MODL_LAYOUT: Record<number, { particles: number; inverseBind: number }> = {
  23: { particles: 396, inverseBind: 576 },
  25: { particles: 408, inverseBind: 600 },
  29: { particles: 444, inverseBind: 648 },
};
const STANDARD = 1;
const COMPOSITE = 3;
const TERRAIN = 4;

/** SEQS 2 drops the word ahead of the bounds (+52); REGN 5 appends three words. */
const SEQS_SIZE: Record<number, number> = { 1: 96, 2: 92 };
const REGN_SIZE: Record<number, number> = { 3: 36, 5: 48 };

/**
 * Standard materials: size, first layer reference and the slot of each. MAT_ 17 adds a gloss
 * layer after the specular one (skipped here), 19 four more references at the end (empty in
 * this install, skipped), and 20 three words (1.0, 0, 0) ahead of the layers.
 */
const GLOSS_SLOTS = [...LAYER_SLOTS.slice(0, 3), null, ...LAYER_SLOTS.slice(3)];
const MAT_LAYOUT: Record<number, { size: number; layers: number; slots: readonly (LayerSlot | null)[] }> = {
  15: { size: 268, layers: 52, slots: LAYER_SLOTS },
  17: { size: 280, layers: 52, slots: GLOSS_SLOTS },
  19: { size: 340, layers: 52, slots: GLOSS_SLOTS },
  20: { size: 352, layers: 64, slots: GLOSS_SLOTS },
};

/** LAYR 25 and 26 insert two words at +92 (0.8 and 0.5 in most layers): the flipbook and UV fields sit 8 bytes on. */
const LAYR_SHIFT: Record<number, number> = { 22: 0, 25: 8, 26: 8 };

/** CAM_ 5 adds a word ahead of the far clip, and four more float references. */
const CAM_LAYOUT: Record<number, { size: number; far: number; near: number }> = {
  3: { size: 180, far: 48, near: 68 },
  5: { size: 264, far: 52, near: 72 },
};

function unsupported(tag: string, version: number, handled: object): never {
  throw new Error(`${tag} version ${version} is not supported (expected ${Object.keys(handled).join(', ')})`);
}

class Reader {
  readonly dv: DataView;
  readonly bytes: Uint8Array;
  readonly sections: Section[] = [];

  constructor(buffer: ArrayBuffer) {
    this.dv = new DataView(buffer);
    this.bytes = new Uint8Array(buffer);
    if (this.tag(0) !== 'MD34') throw new Error(`not an M3 model (magic ${this.tag(0)})`);
    const indexOffset = this.u32(4);
    const indexSize = this.u32(8);
    for (let i = 0; i < indexSize; i++) {
      const o = indexOffset + i * 16;
      this.sections.push({ tag: this.tag(o), offset: this.u32(o + 4), count: this.u32(o + 8), version: this.u32(o + 12) });
    }
  }

  // Tags are stored byte-reversed.
  tag(o: number): string {
    const b = this.bytes;
    return String.fromCharCode(b[o + 3], b[o + 2], b[o + 1], b[o]);
  }

  u8(o: number) { return this.bytes[o]; }
  u16(o: number) { return this.dv.getUint16(o, true); }
  i16(o: number) { return this.dv.getInt16(o, true); }
  u32(o: number) { return this.dv.getUint32(o, true); }
  i32(o: number) { return this.dv.getInt32(o, true); }
  f32(o: number) { return this.dv.getFloat32(o, true); }
  vec3(o: number): Vec3 { return [this.f32(o), this.f32(o + 4), this.f32(o + 8)]; }
  quat(o: number): Quat { return [this.f32(o), this.f32(o + 4), this.f32(o + 8), this.f32(o + 12)]; }

  /** The section a reference at `o` points to, or null when the reference is empty. */
  target(o: number, tag: string, version?: number): Section | null {
    const count = this.u32(o);
    if (count === 0) return null;
    const s = this.sections[this.u32(o + 4)];
    if (!s || s.tag !== tag) throw new Error(`expected a ${tag} reference at ${o}, found ${s?.tag}`);
    if (version !== undefined && s.version !== version) {
      throw new Error(`${tag} version ${s.version} is not supported (expected ${version})`);
    }
    return { ...s, count };
  }

  string(o: number): string {
    const s = this.target(o, 'CHAR');
    if (!s) return '';
    let end = s.offset;
    while (end < s.offset + s.count && this.bytes[end] !== 0) end++;
    return new TextDecoder('latin1').decode(this.bytes.subarray(s.offset, end));
  }

  /** Offsets of each element of the referenced section, given its element size (or the size per version handled). */
  elements(o: number, tag: string, size: number | Record<number, number>, version?: number): number[] {
    const s = this.target(o, tag, version);
    if (!s) return [];
    const n = typeof size === 'number' ? size : (size[s.version] ?? unsupported(tag, s.version, size));
    return Array.from({ length: s.count }, (_, i) => s.offset + i * n);
  }

  u32s(o: number, tag = 'U32_'): number[] {
    return this.elements(o, tag, 4).map((e) => this.u32(e));
  }

  // Animation references: an 8-byte header (interpolation, flags, animation id), then the
  // initial value, a null value and a spare word.
  anim(o: number): ModelAnim {
    const value = this.f32(o + 8);
    const a: ModelAnim = { id: this.u32(o + 4), value, rest: this.u16(o + 2) ? this.f32(o + 12) : value };
    if (this.u16(o) === 0) a.step = true;
    return a;
  }
  animI16(o: number): ModelAnim {
    return { id: this.u32(o + 4), value: this.i16(o + 8) };
  }
  animVec3(o: number): ModelAnim<Vec3> {
    return { id: this.u32(o + 4), value: this.vec3(o + 8) };
  }
  /** A layer's flipbook (LAYR v22: rows +156, columns +160, frame +164, a 16-bit animation reference; `d` bytes on in later versions). */
  flipbook(o: number, d = 0): ModelLayer['flipbook'] {
    const rows = this.u32(o + d + 156);
    const cols = this.u32(o + d + 160);
    return rows * cols > 1 && rows * cols <= 256 ? { rows, cols, frame: { id: this.u32(o + d + 168), value: this.u16(o + d + 172) } } : null;
  }

  animVec2(o: number): ModelAnim<[number, number]> {
    return { id: this.u32(o + 4), value: [this.f32(o + 8), this.f32(o + 12)] };
  }

  /** Colors are stored as B, G, R, A bytes. */
  animColor(o: number): ModelAnim<RGBA> {
    const b = this.bytes;
    return { id: this.u32(o + 4), value: [b[o + 10] / 255, b[o + 9] / 255, b[o + 8] / 255, b[o + 11] / 255] };
  }
}

export function parseM3(buffer: ArrayBuffer, options: M3ParseOptions = {}): ModelData {
  const r = new Reader(buffer);
  const modl = r.target(12, 'MODL');
  if (!modl) throw new Error('M3 file has no model');
  const M = modl.offset;
  const L = MODL_LAYOUT[modl.version] ?? unsupported('MODL', modl.version, MODL_LAYOUT);

  // Bones (BONE v1, 160 bytes): location, rotation and scale animation references, then the
  // visibility's (a 32-bit flag: header, initial value, null value, a spare word).
  const bones: ModelBone[] = r.elements(M + 80, 'BONE', 160, 1).map((o) => ({
    name: r.string(o + 4),
    parent: r.i16(o + 20),
    locationAnim: r.u32(o + 28),
    location: r.vec3(o + 32),
    rotationAnim: r.u32(o + 64),
    rotation: r.quat(o + 68),
    scaleAnim: r.u32(o + 108),
    scale: r.vec3(o + 112),
    visibility: { id: r.u32(o + 144), value: r.u32(o + 148) ? 1 : 0, step: true },
  }));

  const inverseBind = new Float32Array(bones.length * 16);
  const iref = r.target(M + L.inverseBind, 'IREF');
  if (iref) for (let i = 0; i < iref.count * 16; i++) inverseBind[i] = r.f32(iref.offset + i * 4);

  const boneLookup = r.elements(M + 124, 'U16_', 2).map((o) => r.u16(o));

  // Mesh: one division of regions (REGN v3, 36 bytes; v5, 48) and batches (BAT_ v1, 14 bytes).
  // Effect models can be nothing but particles, with no mesh at all.
  const div = r.target(M + 112, 'DIV_', 2);
  const faces = div ? r.elements(div.offset, 'U16_', 2).map((o) => r.u16(o)) : [];
  // Texture coordinates are 16-bit integers: a region of REGN 5 says what range they span (each
  // is raw / 32768 x `uvScale` + `uvOffset`; Nova's story-mode suit spans 0..1 at full precision),
  // and earlier regions all span -16..16 (scale 16, as most REGN 5 regions still say).
  const regionVersion = div ? r.target(div.offset + 12, 'REGN')?.version : undefined;
  const regions = (div ? r.elements(div.offset + 12, 'REGN', REGN_SIZE) : []).map((o) => ({
    firstVertex: r.u32(o + 8),
    vertexCount: r.u32(o + 12),
    firstFace: r.u32(o + 16),
    faceCount: r.u32(o + 20),
    firstBoneLookup: r.u16(o + 26),
    uvScale: regionVersion === 5 ? r.f32(o + 40) : 16,
    uvOffset: regionVersion === 5 ? r.f32(o + 44) : 0,
  }));

  const vertexCount = Math.max(0, ...regions.map((g) => g.firstVertex + g.vertexCount));
  const vFlags = r.u32(M + 96);
  const vertexData = r.target(M + 100, 'U8__');
  const hasColors = (vFlags & 0x200) !== 0;
  const uvChannels = 1 + [0x40000, 0x80000, 0x100000].filter((f) => vFlags & f).length;
  const stride = 24 + (hasColors ? 4 : 0) + uvChannels * 4 + 4;
  if (vertexCount > 0 && (!vertexData || vertexData.count !== stride * vertexCount)) {
    throw new Error(`unexpected vertex layout (flags 0x${vFlags.toString(16)}, ${vertexData?.count} bytes)`);
  }

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uv0 = new Float32Array(vertexCount * 2);
  const uv1 = uvChannels > 1 ? new Float32Array(vertexCount * 2) : null;
  const skinIndex = new Uint16Array(vertexCount * 4);
  const skinWeight = new Float32Array(vertexCount * 4);
  const uvAt = 24 + (hasColors ? 4 : 0);

  for (const g of regions) {
    for (let v = g.firstVertex; v < g.firstVertex + g.vertexCount; v++) {
      const o = vertexData!.offset + v * stride;
      positions.set(r.vec3(o), v * 3);
      for (let k = 0; k < 4; k++) {
        const w = r.u8(o + 12 + k) / 255;
        skinWeight[v * 4 + k] = w;
        skinIndex[v * 4 + k] = w > 0 ? boneLookup[g.firstBoneLookup + r.u8(o + 16 + k)] : 0;
      }
      for (let k = 0; k < 3; k++) normals[v * 3 + k] = (r.u8(o + 20 + k) / 255) * 2 - 1;
      const k = g.uvScale / 32768;
      uv0[v * 2] = r.i16(o + uvAt) * k + g.uvOffset;
      uv0[v * 2 + 1] = r.i16(o + uvAt + 2) * k + g.uvOffset;
      if (uv1) {
        uv1[v * 2] = r.i16(o + uvAt + 4) * k + g.uvOffset;
        uv1[v * 2 + 1] = r.i16(o + uvAt + 6) * k + g.uvOffset;
      }
    }
  }

  // Face indices are relative to their region's first vertex.
  const indices = new Uint32Array(regions.reduce((n, g) => n + g.faceCount, 0));
  const regionStart: number[] = [];
  let at = 0;
  for (const g of regions) {
    regionStart.push(at);
    for (let i = 0; i < g.faceCount; i++) indices[at++] = faces[g.firstFace + i] + g.firstVertex;
  }

  // Materials: MATM entries point into per-type material lists; type 1 is the standard material.
  const materialRefs = r.elements(M + 300, 'MATM', 8).map((o) => ({ type: r.u32(o), index: r.u32(o + 4) }));
  const materials = standardMaterials(r, M, true);

  // Composite materials (CMP_ v2, 28 bytes: name, a word, sections) stack passes (CMS_ v0, 24
  // bytes: a MATM index, then a float animation reference for the pass's alpha factor). The
  // first standard pass that isn't faded out is the material itself; the others overlay it
  // (creep, terrain, distortion, rain), or sit under it (a crater's terrain).
  const composites =
    options.composites && r.target(M + 336, 'CMP_')?.version === 2
      ? r.elements(M + 336, 'CMP_', 28).map((o) => r.elements(o + 16, 'CMS_', 24).map((c) => ({ ref: materialRefs[r.u32(c)], alpha: r.f32(c + 12) })))
      : [];
  const resolve = (ref: { type: number; index: number } | undefined): { material: number; terrain?: true } => {
    if (ref?.type === STANDARD) return { material: ref.index };
    if (!options.composites) return { material: -1 };
    if (ref?.type === TERRAIN) return { material: -1, terrain: true };
    const passes = (ref?.type === COMPOSITE && composites[ref.index]) || [];
    const standard = passes.filter((p) => p.ref?.type === STANDARD);
    const primary = standard.find((p) => p.alpha !== 0) ?? standard[0];
    const out: { material: number; terrain?: true } = { material: primary ? primary.ref.index : -1 };
    if (passes.some((p) => p.ref?.type === TERRAIN)) out.terrain = true;
    return out;
  };

  const batches: ModelBatch[] = (div ? r.elements(div.offset + 24, 'BAT_', 14, 1) : []).map((o) => {
    const region = r.u16(o + 4);
    return {
      ...resolve(materialRefs[r.u16(o + 10)]),
      start: regionStart[region],
      count: regions[region].faceCount,
      bone: r.i16(o + 12),
    };
  });

  // Animation: sequence i plays the transformation collections (STC_ v4, 204 bytes) listed
  // by group i (STG_, 24 bytes). Each collection maps animation ids to keyframe data.
  const stcs = r.elements(M + 28, 'STC_', 204, 4).map((o) => {
    const ids = r.u32s(o + 20);
    const refs = r.u32s(o + 32);
    const sd2v = r.elements(o + 60, 'SD2V', 32);
    const sd3v = r.elements(o + 72, 'SD3V', 32);
    const sd4q = r.elements(o + 84, 'SD4Q', 32);
    const sdcc = r.elements(o + 96, 'SDCC', 32);
    const sdr3 = r.elements(o + 108, 'SDR3', 32);
    const sds6 = r.elements(o + 132, 'SDS6', 32);
    const sdfg = r.elements(o + 180, 'SDFG', 32);
    const tracks = new Map<number, ModelTrack>();
    ids.forEach((id, k) => {
      const type = refs[k] >>> 16;
      const index = refs[k] & 0xffff;
      if (type === SD3V || type === SD4Q) {
        const sd = (type === SD3V ? sd3v : sd4q)[index];
        const frames = r.elements(sd, 'I32_', 4).map((f) => r.i32(f) / 1000);
        const width = type === SD3V ? 3 : 4;
        const keys = r.elements(sd + 20, type === SD3V ? 'VEC3' : 'QUAT', width * 4);
        const values = new Float32Array(keys.length * width);
        keys.forEach((key, i) => {
          for (let c = 0; c < width; c++) values[i * width + c] = r.f32(key + c * 4);
        });
        tracks.set(id, { times: Float32Array.from(frames), values });
      } else if (type === SDR3 && sdr3[index] !== undefined) {
        // Float tracks: a layer's brightness, among others.
        const sd = sdr3[index];
        const frames = r.elements(sd, 'I32_', 4).map((f) => r.i32(f) / 1000);
        const keys = r.elements(sd + 20, 'REAL', 4);
        tracks.set(id, { times: Float32Array.from(frames), values: Float32Array.from(keys.map((key) => r.f32(key))) });
      } else if (type === SDCC && sdcc[index] !== undefined) {
        // Color tracks (B, G, R, A bytes): a layer's color and alpha.
        const sd = sdcc[index];
        const frames = r.elements(sd, 'I32_', 4).map((f) => r.i32(f) / 1000);
        const keys = r.elements(sd + 20, '\0COL', 4);
        const values = new Float32Array(keys.length * 4);
        keys.forEach((key, i) => {
          values[i * 4] = r.u8(key + 2) / 255;
          values[i * 4 + 1] = r.u8(key + 1) / 255;
          values[i * 4 + 2] = r.u8(key) / 255;
          values[i * 4 + 3] = r.u8(key + 3) / 255;
        });
        tracks.set(id, { times: Float32Array.from(frames), values });
      } else if (type === SD2V && sd2v[index] !== undefined) {
        // Two-component tracks: a layer's texture offset and tiling.
        const sd = sd2v[index];
        const frames = r.elements(sd, 'I32_', 4).map((f) => r.i32(f) / 1000);
        const keys = r.elements(sd + 20, 'VEC2', 8);
        const values = new Float32Array(keys.length * 2);
        keys.forEach((key, i) => {
          values[i * 2] = r.f32(key);
          values[i * 2 + 1] = r.f32(key + 4);
        });
        tracks.set(id, { times: Float32Array.from(frames), values });
      } else if (type === SDS6 && sds6[index] !== undefined) {
        // 16-bit integer tracks: particle bursts.
        const sd = sds6[index];
        const frames = r.elements(sd, 'I32_', 4).map((f) => r.i32(f) / 1000);
        const keys = r.elements(sd + 20, 'I16_', 2);
        tracks.set(id, { times: Float32Array.from(frames), values: Float32Array.from(keys.map((key) => r.i16(key))) });
      } else if (type === SDFG && sdfg[index] !== undefined) {
        // Flag tracks: a bone's visibility, on (255, in some models 1) or off.
        const sd = sdfg[index];
        const frames = r.elements(sd, 'I32_', 4).map((f) => r.i32(f) / 1000);
        const keys = r.elements(sd + 20, 'FLAG', 4);
        tracks.set(id, { times: Float32Array.from(frames), values: Float32Array.from(keys.map((key) => (r.u32(key) ? 1 : 0))) });
      }
    });
    return tracks;
  });
  const groups = r.elements(M + 40, 'STG_', 24).map((o) => r.u32s(o + 12));

  const sequences: ModelSequence[] = r.elements(M + 16, 'SEQS', SEQS_SIZE).map((o, i) => {
    const tracks = new Map<number, ModelTrack>();
    for (const stc of groups[i] ?? []) {
      for (const [id, track] of stcs[stc] ?? []) if (!tracks.has(id)) tracks.set(id, track);
    }
    return {
      name: r.string(o + 8),
      duration: (r.u32(o + 24) - r.u32(o + 20)) / 1000,
      looping: (r.u32(o + 32) & 1) === 0,
      tracks,
    };
  });

  const attachments = r.elements(M + 228, 'ATT_', 20).map((o) => ({ name: r.string(o + 4), bone: r.u32(o + 16) }));

  // Cameras (CAM_ v3, 180 bytes; v5, 264): bone, name, then float animation references (8-byte
  // header, initial value, null value, a spare word) for field of view, an unknown word, far and
  // near clip. Other versions aren't read.
  const camSection = r.target(M + 276, 'CAM_');
  const cam = camSection && CAM_LAYOUT[camSection.version];
  const cameras = cam
    ? r.elements(M + 276, 'CAM_', cam.size).map((o) => ({ bone: r.u32(o), name: r.string(o + 4), fov: r.f32(o + 24), far: r.f32(o + cam.far), near: r.f32(o + cam.near) }))
    : [];

  // Particle emitters (PAR_ v12, 1316 bytes), and copies of them on other bones (PARC v0, 40
  // bytes: rate, burst, bone), the reference after them. Offsets follow m3addon's structures.xml.
  // Later emitter versions (PAR_ 21, 22, 24) aren't read.
  const copies = r.elements(M + L.particles + 12, 'PARC', 40).map((o) => ({ rate: r.anim(o), burst: r.animI16(o + 20), bone: r.u32(o + 36) }));
  const emitters: ModelEmitter[] =
    r.target(M + L.particles, 'PAR_')?.version === 12
      ? r.elements(M + L.particles, 'PAR_', 1316).map((o) => {
          const ref = materialRefs[r.u32(o + 4)];
          return {
            bone: r.u32(o),
            material: resolve(ref).material,
            rate: r.anim(o + 396),
            burst: r.animI16(o + 684),
            maxParticles: r.u32(o + 392),
            speed: [r.anim(o + 8), r.anim(o + 28)],
            angle: [r.anim(o + 52), r.anim(o + 72)],
            spread: [r.anim(o + 92), r.anim(o + 112)],
            radial: r.u32(o + 532) === 1,
            life: [r.anim(o + 132), r.anim(o + 152)],
            gravity: r.f32(o + 188),
            drag: r.f32(o + 340),
            mid: { size: r.f32(o + 192), color: r.f32(o + 196), alpha: r.f32(o + 200), rotation: r.f32(o + 204) },
            size: [r.animVec3(o + 208), r.animVec3(o + 540)],
            rotation: [r.animVec3(o + 244), r.animVec3(o + 580)],
            color: [[280, 300, 320].map((k) => r.animColor(o + k)), [620, 640, 660].map((k) => r.animColor(o + k))],
            random: { speed: r.u32(o + 48) !== 0, life: r.u32(o + 172) !== 0, size: r.u32(o + 536) !== 0, rotation: r.u32(o + 576) !== 0, color: r.u32(o + 616) !== 0 },
            area: { type: r.u32(o + 416), size: r.animVec3(o + 420), cutSize: r.animVec3(o + 456), radius: r.anim(o + 492), cutRadius: r.anim(o + 512) },
            flipbook: { cols: r.u16(o + 708), rows: r.u16(o + 710), start: r.u8(o + 700), end: r.u8(o + 701), end2: r.u8(o + 702), phase1: r.f32(o + 704) },
            type: r.u32(o + 752),
            ratio: r.f32(o + 756),
            flags: r.u32(o + 1188),
            copies: r.u32s(o + 1304).map((i) => copies[i]).filter((c) => c !== undefined),
          };
        })
      : [];

  return {
    bones,
    inverseBind,
    positions,
    normals,
    uv0,
    uv1,
    skinIndex,
    skinWeight,
    indices,
    batches,
    materials,
    sequences,
    attachments,
    cameras,
    bounds: { min: r.vec3(M + 136), max: r.vec3(M + 148), radius: r.f32(M + 160) },
    emitters,
  };
}

/**
 * Just the materials of an M3 file, for files that are only a material (the tilesets' cliff
 * materials, "Assets/Cliffs/<set>_Material/<set>_Material.m3") and have no mesh to parse.
 */
export function parseM3Materials(buffer: ArrayBuffer): ModelMaterial[] {
  const r = new Reader(buffer);
  const modl = r.target(12, 'MODL');
  if (!modl) return [];
  return standardMaterials(r, modl.offset, false);
}

/**
 * The standard materials (MAT_) of the model at `M`. With `strict`, versions not handled
 * throw; otherwise they're read as MAT_ 15 and LAYR 22.
 */
function standardMaterials(r: Reader, M: number, strict: boolean): ModelMaterial[] {
  const version = r.target(M + 312, 'MAT_')?.version ?? 15;
  const mat = MAT_LAYOUT[version] ?? (strict ? unsupported('MAT_', version, MAT_LAYOUT) : MAT_LAYOUT[15]);
  return r.elements(M + 312, 'MAT_', mat.size).map((o) => {
    const layers: ModelMaterial['layers'] = {};
    mat.slots.forEach((slot, k) => {
      if (!slot) return;
      const layer = r.target(o + mat.layers + k * 12, 'LAYR');
      if (!layer) return;
      const d = LAYR_SHIFT[layer.version] ?? (strict ? unsupported('LAYR', layer.version, LAYR_SHIFT) : 0);
      const path = r.string(layer.offset + 4);
      if (!path) return;
      const flags = r.u32(layer.offset + 36);
      layers[slot] = {
        path,
        flags,
        uvSource: r.u32(layer.offset + 40),
        colorChannels: r.u32(layer.offset + 44),
        multiply: r.anim(layer.offset + 48),
        add: r.anim(layer.offset + 68),
        invert: (flags & 0x10) !== 0,
        clamp: (flags & 0x20) !== 0,
        colorAnim: r.u32(layer.offset + 20),
        alpha: r.u8(layer.offset + 27) / 255,
        flipbook: r.flipbook(layer.offset, d),
        uvOffset: r.animVec2(layer.offset + d + 180),
        uvTiling: r.animVec2(layer.offset + d + 244),
      };
    });
    // +40: the cut-out threshold, a byte (m3addon's cutoutThresh).
    return { name: r.string(o), flags: r.u32(o + 16), blendMode: r.u32(o + 20), cutout: r.u8(o + 40) / 255, layers };
  });
}
