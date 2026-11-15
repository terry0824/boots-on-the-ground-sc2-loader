// How the game's file names map onto the archive, wherever the archive is read: by the asset
// server (tools/sc2-assets.ts, tools/serve.ts) or in the browser (the standalone build).
//
//   /sc2/<logical path>    e.g. /sc2/assets/textures/marine_diffuse.dds
//       Resolved the way the game resolves it: through the melee mod stack, newest mod first.
//   /casc/<archive path>   e.g. /casc/mods/liberty.sc2mod/base.sc2data/gamedata/unitdata.xml
//       One exact file. Game data is layered across mods, so data readers fetch each layer.
//   /sc2-find?q=<text>&ext=<ext>
//       Up to 500 logical paths containing <text>, for the model viewer.

/** Melee mods in dependency order; later mods override earlier ones. */
export const MOD_STACK = ['core', 'liberty', 'libertymulti', 'swarm', 'swarmmulti', 'void', 'voidmulti'];
export const FOLDERS = ['enus.sc2assets', 'base.sc2assets', 'enus.sc2data', 'base.sc2data'];
/**
 * Story-mode assets (the cinematic Marine rifle), checked after the melee mods; last, Heart of the
 * Swarm's campaign (the Raptor's sounds, for The Tide: Unleashed).
 */
export const FALLBACK_ROOTS = ['campaigns/liberty.sc2campaign', 'mods/novastoryassets.sc2mod', 'campaigns/swarm.sc2campaign'];

export const MIME: Record<string, string> = {
  '.xml': 'text/xml',
  '.txt': 'text/plain',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.json': 'application/json',
};

export function mimeOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return (dot >= 0 && MIME[name.slice(dot)]) || 'application/octet-stream';
}

export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
}

const ROOTS = [...MOD_STACK.map((m) => `mods/${m}.sc2mod`).reverse(), ...FALLBACK_ROOTS];

/** The archive name a logical path resolves to, through the mod stack, given what exists. */
export function resolveLogical(logical: string, has: (name: string) => boolean): string | undefined {
  for (const root of ROOTS) {
    for (const folder of FOLDERS) {
      const name = `${root}/${folder}/${logical}`;
      if (has(name)) return name;
    }
  }
  return undefined;
}

/** Up to 500 logical paths containing `q` (normalized) with extension `ext` (".m3"), sorted. */
export function findLogical(names: Iterable<string>, q: string, ext: string): string[] {
  const found = new Set<string>();
  for (const name of names) {
    const m = /^mods\/[^/]+\.sc2mod\/(?:base|enus)\.sc2assets\/(.*)$/.exec(name);
    if (m && m[1].endsWith(ext) && m[1].includes(q)) found.add(m[1]);
    if (found.size >= 500) break;
  }
  return [...found].sort();
}

/**
 * Which route a request is for, and the archive name it means (resolved with `has`), or the
 * viewer's search. Null for anything that isn't one of the routes above.
 */
export function routeOf(pathname: string, has: (name: string) => boolean): { kind: 'file'; name: string | undefined } | { kind: 'find' } | null {
  if (pathname === '/sc2-find') return { kind: 'find' };
  if (pathname.startsWith('/sc2/')) return { kind: 'file', name: resolveLogical(normalizePath(pathname.slice(5)), has) };
  if (pathname.startsWith('/casc/')) {
    const exact = normalizePath(pathname.slice(6));
    return { kind: 'file', name: has(exact) ? exact : undefined };
  }
  return null;
}
