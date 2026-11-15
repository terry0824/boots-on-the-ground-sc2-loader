// The web build's asset server, inside the page: the game asks for StarCraft II files by the
// same routes it always does (/sc2/…, /casc/…, /sc2-find; see src/casc/resolve.ts), and this
// answers them from the install the player picked, so the game itself is the same build for
// both. Media elements can't be answered that way, so the music plays from blob URLs.
//
// It works on a page opened straight from a file, too: the routes are read from the game's own
// root-relative addresses, which a file:// page (on Windows, with its drive letter) would
// otherwise resolve to somewhere else on the disk.

import { findLogical, mimeOf, normalizePath, routeOf } from './casc/resolve.ts';
import type { CascStorage } from './casc/storage.ts';
import { setMediaSource } from '../../../src/engine/assets.ts';
import { sc2Url } from './textures.ts';

/** The route an address is for, or null: root-relative addresses are the game's own. */
function routeUrl(raw: string): URL | null {
  let url: URL;
  if (raw.startsWith('/')) url = new URL(raw, 'http://game.local');
  else {
    url = new URL(raw, location.href);
    if (url.origin !== location.origin || location.protocol === 'file:') return null;
  }
  return routeOf(url.pathname, () => false) ? url : null;
}

export function serveFromStorage(storage: CascStorage) {
  const realFetch = window.fetch.bind(window);
  const has = (name: string) => storage.has(name);

  async function respond(url: URL): Promise<Response> {
    const route = routeOf(decodeURIComponent(url.pathname), has);
    if (route?.kind === 'find') {
      const found = findLogical(storage.names(), normalizePath(url.searchParams.get('q') ?? ''), '.' + (url.searchParams.get('ext') ?? 'm3'));
      return new Response(JSON.stringify(found), { headers: { 'Content-Type': 'application/json' } });
    }
    const name = route?.name;
    const data = name ? await storage.read(name).catch((e: Error) => (console.warn(`Couldn't read ${name}: ${e.message}`), null)) : null;
    if (!name || !data) return new Response('not found', { status: 404 });
    return new Response(data as BodyInit, { headers: { 'Content-Type': mimeOf(name), 'Content-Length': String(data.length) } });
  }

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = !init?.method || init.method === 'GET' ? routeUrl(raw) : null;
    return url ? respond(url) : realFetch(input, init);
  };

  setMediaSource(async (path) => {
    const r = await respond(routeUrl(sc2Url(path))!);
    return URL.createObjectURL(await r.blob());
  });
}
