// Where the web build reads the StarCraft II install from, for src/casc: the folder the player
// picks (Chrome and Edge, which can keep access to it between visits), the files of a folder
// chosen with a plain file input (any browser, chosen each visit), or, while developing, the
// install served by the dev server. Every one only reads.

import type { Inflate } from './casc/blte.ts';
import type { CascSource } from './casc/storage.ts';

/** The parts of the File System Access API the TypeScript DOM library leaves out. */
export interface PickedFolder extends FileSystemDirectoryHandle {
  queryPermission?(descriptor: { mode: 'read' }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: 'read' }): Promise<PermissionState>;
}

declare global {
  interface Window {
    showDirectoryPicker?(options?: { id?: string; mode?: 'read' | 'readwrite'; startIn?: string }): Promise<PickedFolder>;
  }
}

/** zlib, with the browser's own DecompressionStream. */
export const browserInflate: Inflate = async (data) => {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

async function bytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

/** A folder from showDirectoryPicker. Files are opened once and read by range after. */
export function folderSource(root: PickedFolder): CascSource {
  const folders = new Map<string, Promise<PickedFolder>>([['', Promise.resolve(root)]]);
  const files = new Map<string, Promise<File>>();
  const folder = (p: string): Promise<PickedFolder> => {
    let f = folders.get(p);
    if (!f) {
      const i = p.lastIndexOf('/');
      f = folder(i < 0 ? '' : p.slice(0, i)).then((parent) => parent.getDirectoryHandle(p.slice(i + 1)) as Promise<PickedFolder>);
      f.catch(() => folders.delete(p));
      folders.set(p, f);
    }
    return f;
  };
  const file = (p: string): Promise<File> => {
    let f = files.get(p);
    if (!f) {
      const i = p.lastIndexOf('/');
      f = folder(i < 0 ? '' : p.slice(0, i))
        .then((parent) => parent.getFileHandle(p.slice(i + 1)))
        .then((h) => h.getFile());
      f.catch(() => files.delete(p));
      files.set(p, f);
    }
    return f;
  };
  return {
    label: root.name,
    async read(p, offset, length) {
      const read = async () => {
        const f = await file(p);
        return bytes(offset === undefined ? f : f.slice(offset, offset + (length ?? f.size - offset)));
      };
      try {
        return await read();
      } catch {
        // The file changed under its snapshot (StarCraft II updating, say): open it again, once.
        files.delete(p);
        return read();
      }
    },
    async list(p) {
      const names: string[] = [];
      for await (const h of (await folder(p)).values()) if (h.kind === 'file') names.push(h.name);
      return names;
    },
    async exists(p) {
      return folder(p).then(
        () => true,
        () => file(p).then(
          () => true,
          () => false,
        ),
      );
    },
  };
}

/** The files of a folder chosen with `<input type="file" webkitdirectory>`, by path within it. */
export function fileListSource(list: FileList): CascSource {
  const files = new Map<string, File>();
  let label = '';
  for (const f of Array.from(list)) {
    const rel = f.webkitRelativePath;
    const i = rel.indexOf('/');
    label ||= rel.slice(0, i);
    files.set(rel.slice(i + 1), f);
  }
  return {
    label,
    async read(p, offset, length) {
      const f = files.get(p);
      if (!f) throw new Error(`No ${p} in the chosen folder`);
      return bytes(offset === undefined ? f : f.slice(offset, offset + (length ?? f.size - offset)));
    },
    async list(p) {
      const prefix = p ? `${p}/` : '';
      return [...files.keys()].filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/')).map((k) => k.slice(prefix.length));
    },
    async exists(p) {
      return files.has(p) || [...files.keys()].some((k) => k.startsWith(`${p}/`));
    },
  };
}

/** The install as the standalone dev server serves it (/__install/…, with byte ranges): for testing without a picker. */
export function httpSource(base = '/__install'): CascSource {
  return {
    label: 'the dev server',
    async read(p, offset, length) {
      const headers: Record<string, string> = offset === undefined ? {} : { Range: `bytes=${offset}-${offset + (length ?? 1) - 1}` };
      const r = await fetch(`${base}/${p}`, { headers });
      if (!r.ok) throw new Error(`${p}: ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    },
    async list(p) {
      return (await fetch(`${base}-list/${p}`)).json();
    },
    async exists(p) {
      return (await fetch(`${base}/${p}`, { method: 'HEAD' })).ok;
    },
  };
}
