// BLTE, the container every file in a CASC archive is stored in: one or more frames, each
// stored as is ('N'), zlib-compressed ('Z') or itself BLTE ('F'). Files in the data.### archives
// carry a 30-byte header in front of it.

/** Inflates a zlib stream (the browser's DecompressionStream, or Node's zlib). */
export type Inflate = (data: Uint8Array) => Promise<Uint8Array>;

const BLTE = 0x45544c42; // 'BLTE'
/** The header the archives put in front of BLTE: the key, the size, flags and two checksums. */
export const ENCODED_HEADER = 30;

function be32(b: Uint8Array, p: number): number {
  return ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0;
}

function signature(b: Uint8Array, p: number): number {
  return p + 4 <= b.length ? (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0 : 0;
}

async function frame(data: Uint8Array, inflate: Inflate): Promise<Uint8Array> {
  switch (data[0]) {
    case 0x4e: // 'N'
      return data.subarray(1);
    case 0x5a: // 'Z'
      return inflate(data.subarray(1));
    case 0x46: // 'F'
      return decodeBlte(data.subarray(1), inflate);
    case 0x45: // 'E'
      throw new Error('BLTE: encrypted frame (not supported)');
    default:
      throw new Error(`BLTE: unsupported frame mode 0x${data[0]?.toString(16)}`);
  }
}

/** The content of a BLTE-encoded file (with or without the archives' 30-byte header in front). */
export async function decodeBlte(buf: Uint8Array, inflate: Inflate): Promise<Uint8Array> {
  let p = 0;
  if (signature(buf, 0) !== BLTE) {
    if (signature(buf, ENCODED_HEADER) !== BLTE) throw new Error('BLTE: no signature');
    p = ENCODED_HEADER;
  }
  const headerSize = be32(buf, p + 4);
  if (headerSize === 0) return frame(buf.subarray(p + 8), inflate);

  if (buf[p + 8] !== 0x0f) throw new Error('BLTE: bad frame table');
  const count = (buf[p + 9] << 16) | (buf[p + 10] << 8) | buf[p + 11];
  if (headerSize !== 12 + count * 24) throw new Error('BLTE: bad header size');
  let total = 0;
  for (let i = 0; i < count; i++) total += be32(buf, p + 12 + i * 24 + 4);
  const out = new Uint8Array(total);
  let from = p + headerSize;
  let to = 0;
  for (let i = 0; i < count; i++) {
    const encoded = be32(buf, p + 12 + i * 24);
    const content = be32(buf, p + 12 + i * 24 + 4);
    const decoded = await frame(buf.subarray(from, from + encoded), inflate);
    if (decoded.length !== content) throw new Error('BLTE: frame size mismatch');
    out.set(decoded, to);
    from += encoded;
    to += content;
  }
  return out;
}
