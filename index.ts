// The StarCraft II loader, a plugin of the game (src/content/plugins.ts): it lets a player who owns
// StarCraft II borrow its content from their own copy, read here in the page. They pick the folder (the
// browser keeps it for next time where it can: Chrome and Edge), the archive's index is read, the content's
// addresses are answered from it (src/files.ts), and the game plays as it does anywhere else. The front door
// asks each time the page is opened ("Continue with" the folder kept, or another). The game moves between
// missions inside the page, so the folder stays open for the whole visit; a page the visit opens anew (an
// address typed in the same tab) opens it again without asking where the browser allows it (resume).
//
// While developing (`npm run dev:standalone`, or `preview:standalone` for the build), `?source=http`
// skips the picker and reads the install through that server instead.

import type { ContentPlugin, FrontDoor } from '../../src/content/plugins.ts';
import type { CascSource } from './src/casc/storage.ts';
import type { PickedFolder } from './src/sources.ts';

// The folder the player picked, kept by the browser (IndexedDB) for the next visit and the next page:
// a handle to it, which reads nothing until the player (or, within a visit, the browser) allows it again.
const DB = 'botg-web';
const STORE = 'folders';
const KEY = 'starcraft';

function idb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open(DB, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(STORE);
      open.onerror = () => resolve(null);
      open.onsuccess = () => {
        try {
          const req = run(open.result.transaction(STORE, mode).objectStore(STORE));
          req.onsuccess = () => resolve(req.result ?? null);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      };
    } catch {
      // No IndexedDB here (a private window): nothing is kept.
      resolve(null);
    }
  });
}

const keptFolder = () => idb<PickedFolder>('readonly', (s) => s.get(KEY));
const keepFolder = (h: PickedFolder) => idb('readwrite', (s) => s.put(h, KEY));

const escape = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function explain(e: Error): string {
  if (/no \.build\.info/.test(e.message)) return `${e.message}. Pick the StarCraft II folder itself (the one with SC2Data and "StarCraft II.exe" in it), not a folder inside it.`;
  return `Couldn't read StarCraft II: ${e.message}`;
}

/** Opens the install and answers the content's addresses from it; false (and why, on the door) where it can't. */
async function open(door: FrontDoor, source: CascSource): Promise<boolean> {
  door.busy(true);
  try {
    const [{ CascStorage }, { browserInflate }, { serveFromStorage }] = await Promise.all([
      import('./src/casc/storage.ts'),
      import('./src/sources.ts'),
      import('./src/files.ts'),
    ]);
    const t0 = performance.now();
    door.say(`Opening ${source.label}…`);
    const storage = await CascStorage.open(source, browserInflate, (what) => door.say(`${what}…`));
    console.info(`StarCraft II ${storage.build}: ${storage.size} files, opened in ${Math.round(performance.now() - t0)} ms`);
    serveFromStorage(storage);
    return true;
  } catch (e) {
    door.busy(false);
    door.say(explain(e as Error), true);
    return false;
  }
}

export const plugin: ContentPlugin = {
  mode: 'sc2',
  label: 'StarCraft II',

  async offer(door, primary, ready) {
    door.text(
      'If you own StarCraft II, play with its models, textures, sounds, music, maps and story: the StarCraft II loader, an optional plugin, borrows them from your copy, read on this computer as you play. Nothing is uploaded or changed and nothing connects to Battle.net; your browser remembers which folder you picked, on this computer only, so next time it\'s one click.',
    );
    const where = () =>
      door.hint(
        'For the loader, pick the folder StarCraft II is installed in: usually <code>C:\\Program Files (x86)\\StarCraft II</code> on Windows, or <code>/Applications/StarCraft II</code> on a Mac.',
      );
    const go = async (source: CascSource) => {
      if (await open(door, source)) ready();
    };
    if (window.showDirectoryPicker) {
      const pick = async () => {
        try {
          const folder = await window.showDirectoryPicker!({ id: 'starcraft', mode: 'read' });
          await keepFolder(folder);
          const { folderSource } = await import('./src/sources.ts');
          await go(folderSource(folder));
        } catch (e) {
          if ((e as Error).name !== 'AbortError') door.say(explain(e as Error), true);
        }
      };
      const kept = await keptFolder();
      if (!kept) {
        door.button('Play with your StarCraft II installation', primary, pick);
        where();
        return;
      }
      // The folder from last time: one click (the browser may ask to allow it again), or another one.
      door.button('Continue with your StarCraft II installation', primary, async () => {
        try {
          // Asked on the click itself (the browser wants a gesture); it answers at once if it still allows it.
          if ((await kept.requestPermission?.({ mode: 'read' })) !== 'granted') return door.say('The browser needs your permission to read the folder.', true);
          const { folderSource } = await import('./src/sources.ts');
          await go(folderSource(kept));
        } catch (e) {
          door.say(explain(e as Error), true);
        }
      });
      door.button('Choose another folder', false, pick);
      door.hint(`Last time: the folder <code>${escape(kept.name)}</code> (the browser tells the game only its name).`);
      return;
    }
    // Browsers without the folder picker: a plain folder input, chosen each time the page is opened (they can't keep
    // access to a folder past the page; within it, the game's missions all read from what was chosen).
    const input = document.createElement('input');
    input.type = 'file';
    input.setAttribute('webkitdirectory', '');
    input.style.display = 'none';
    input.onchange = async () => {
      if (!input.files?.length) return;
      const { fileListSource } = await import('./src/sources.ts');
      await go(fileListSource(input.files));
    };
    door.add(input);
    door.button('Play with your StarCraft II installation', primary, () => input.click());
    where();
    door.hint('Your browser will say it is <em>uploading</em> the files: it isn\'t, they stay on this computer.');
  },

  async resume(door) {
    // Within a visit the browser still allows the folder picked at the front door: open it again, asking nothing.
    const kept = window.showDirectoryPicker ? await keptFolder() : null;
    if (!kept || (await kept.queryPermission?.({ mode: 'read' })) !== 'granted') return false;
    const { folderSource } = await import('./src/sources.ts');
    return open(door, folderSource(kept));
  },

  async provider() {
    return (await import('./src/provider.ts')).provider;
  },

  async auto(door) {
    // Tests here: the install as `npm run dev:standalone` and `preview:standalone` serve it, at this
    // machine's own address only (no server a player has answers /__install).
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    if (new URLSearchParams(location.search).get('source') !== 'http' || !local) return false;
    const { httpSource } = await import('./src/sources.ts');
    return open(door, httpSource());
  },
};
