// StarCraft II's models (M3), by their logical paths: parsed into the engine's model format, with
// their layers' textures, once each.

import { COLOR_SLOTS, DATA_SLOTS, ModelTemplate, PARTICLE_UV, type LayerTextures } from '../../../src/engine/model.ts';
import type { ModelMaterial } from '../../../src/engine/modeldata.ts';
import { fetchBuffer } from '../../../src/engine/assets.ts';
import { parseM3 } from './formats/m3.ts';
import { loadTexture, sc2Url } from './textures.ts';

async function loadLayers(mat: ModelMaterial): Promise<LayerTextures> {
  const out: LayerTextures = {};
  await Promise.all(
    [...COLOR_SLOTS, ...DATA_SLOTS].map(async (slot) => {
      const layer = mat.layers[slot];
      // A layer on a third or fourth UV channel (uvSource 9, 10) can't be placed: the vertices
      // here keep two. Left off rather than drawn on the wrong coordinates (the story-mode
      // Marine's under-suit would wear his face). Particle coordinates are for particles.
      if (!layer || (layer.uvSource > 1 && layer.uvSource !== PARTICLE_UV)) return;
      const tex = await loadTexture(layer.path, COLOR_SLOTS.includes(slot));
      if (tex) out[slot] = tex;
    }),
  );
  return out;
}


const templates = new Map<string, Promise<ModelTemplate>>();

/** Loads (once) and parses a model with its textures, by logical path. */
export function loadModel(path: string): Promise<ModelTemplate> {
  let p = templates.get(path.toLowerCase());
  if (!p) {
    p = (async () => {
      const buf = await fetchBuffer(sc2Url(path));
      if (!buf) throw new Error(`model not found: ${path}`);
      // Story-mode characters build their armor out of composite materials (a surface with rain
      // and grime passes over it): resolved to their main surface, or most of them isn't drawn.
      const m3 = parseM3(buf, { composites: /storymodecharacters/i.test(path) });
      const layers = await Promise.all(m3.materials.map((m) => loadLayers(m)));
      return new ModelTemplate(path, m3, layers);
    })();
    templates.set(path.toLowerCase(), p);
  }
  return p;
}
