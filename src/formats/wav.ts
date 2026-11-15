/**
 * WAV files as StarCraft II ships them. Most of its sound effects are IMA ADPCM (format 0x11,
 * four bits per sample), which some browsers' decoders refuse; this decodes it directly.
 * Plain PCM and everything else is left to the browser.
 */

export interface DecodedPcm {
  sampleRate: number;
  channels: Float32Array[];
}

const INDEX_TABLE = [-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8];
const STEP_TABLE = [
  7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143,
  157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411,
  1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493,
  10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767,
];

/** The format tag of a RIFF/WAVE file, or -1 if it isn't one. */
export function wavFormat(buf: ArrayBuffer): number {
  const dv = new DataView(buf);
  if (buf.byteLength < 36 || dv.getUint32(0, false) !== 0x52494646 || dv.getUint32(8, false) !== 0x57415645) return -1;
  for (let o = 12; o + 8 <= buf.byteLength; ) {
    const id = dv.getUint32(o, false);
    const size = dv.getUint32(o + 4, true);
    if (id === 0x666d7420) return dv.getUint16(o + 8, true); // "fmt "
    o += 8 + size + (size & 1);
  }
  return -1;
}

/** Decodes an IMA ADPCM WAV; null if it isn't one. */
export function decodeImaAdpcm(buf: ArrayBuffer): DecodedPcm | null {
  const dv = new DataView(buf);
  if (wavFormat(buf) !== 0x11) return null;
  let channels = 1;
  let sampleRate = 44100;
  let blockAlign = 0;
  let samplesPerBlock = 0;
  let totalSamples = -1;
  let dataOffset = -1;
  let dataSize = 0;
  for (let o = 12; o + 8 <= buf.byteLength; ) {
    const id = dv.getUint32(o, false);
    const size = dv.getUint32(o + 4, true);
    const body = o + 8;
    if (id === 0x666d7420) {
      channels = dv.getUint16(body + 2, true);
      sampleRate = dv.getUint32(body + 4, true);
      blockAlign = dv.getUint16(body + 12, true);
      samplesPerBlock = size >= 20 ? dv.getUint16(body + 18, true) : 0;
    } else if (id === 0x66616374) {
      totalSamples = dv.getUint32(body, true); // "fact"
    } else if (id === 0x64617461) {
      dataOffset = body; // "data"
      dataSize = Math.min(size, buf.byteLength - body);
    }
    o = body + size + (size & 1);
  }
  if (dataOffset < 0 || !blockAlign || channels < 1 || channels > 2) return null;
  if (!samplesPerBlock) samplesPerBlock = ((blockAlign - 4 * channels) * 8) / (4 * channels) + 1;
  const blocks = Math.ceil(dataSize / blockAlign);
  const capacity = blocks * samplesPerBlock;
  const length = totalSamples > 0 ? Math.min(totalSamples, capacity) : capacity;
  const out = Array.from({ length: channels }, () => new Float32Array(length));
  const bytes = new Uint8Array(buf);

  for (let b = 0; b < blocks; b++) {
    const start = dataOffset + b * blockAlign;
    const end = Math.min(dataOffset + dataSize, start + blockAlign);
    const first = b * samplesPerBlock;
    for (let ch = 0; ch < channels; ch++) {
      const h = start + ch * 4;
      if (h + 4 > end) break;
      let predictor = dv.getInt16(h, true);
      let index = Math.min(88, bytes[h + 2]);
      const pcm = out[ch];
      let n = first;
      if (n < length) pcm[n] = predictor / 32768;
      n++;
      // After the headers, each channel has 4-byte runs (8 samples) in turn.
      for (let o = start + 4 * channels + ch * 4; o + 4 <= end && n < length; o += 4 * channels) {
        for (let k = 0; k < 4 && n < length; k++) {
          const byte = bytes[o + k];
          for (const nibble of [byte & 15, byte >> 4]) {
            const step = STEP_TABLE[index];
            let diff = step >> 3;
            if (nibble & 4) diff += step;
            if (nibble & 2) diff += step >> 1;
            if (nibble & 1) diff += step >> 2;
            predictor += nibble & 8 ? -diff : diff;
            if (predictor > 32767) predictor = 32767;
            else if (predictor < -32768) predictor = -32768;
            index += INDEX_TABLE[nibble];
            if (index < 0) index = 0;
            else if (index > 88) index = 88;
            if (n < length) pcm[n] = predictor / 32768;
            n++;
          }
        }
      }
    }
  }
  return { sampleRate, channels: out };
}
