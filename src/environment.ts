// A StarCraft II tileset's sky, haze and light (TerrainData, LightData, its sky dome model), in the game's
// terms (src/game/environment.ts).

import * as THREE from 'three';
import { fetchBuffer } from '../../../src/engine/assets.ts';
import { sc2Url } from './textures.ts';
import { loadModel } from './models.ts';
import { decodeToRgba, parseDds } from './formats/dds.ts';
import type { GameData } from './data.ts';
import { SKY_FALLBACK } from './manifest.ts';
import type { Environment, Light } from '../../../src/game/environment.ts';

function color3(v: string | undefined, fallback: [number, number, number]): THREE.Color {
  const parts = (v ?? '').split(',').map(Number);
  const [r, g, b] = parts.length >= 3 && parts.every((x) => !Number.isNaN(x)) ? parts : fallback;
  return new THREE.Color(r, g, b);
}

/**
 * The tileset's light (LightData: key and fill directional lights, ambient) in our terms.
 * StarCraft II directions are (east, north, up) and point the way the light travels; ours
 * point toward the light, with north as -Z.
 */
export function lightFor(data: GameData, id: string): Light {
  const l = data.lights;
  const base = 'ToDInfoArray[0]';
  const key = `${base}/DirectionalLight[Key]`;
  const dir = (l.value(id, `${key}/Direction`) ?? '0.72,-0.12,-0.68').split(',').map(Number);
  const sunDir = new THREE.Vector3(-dir[0], -dir[2], dir[1]).normalize();
  const sunColor = color3(l.value(id, `${key}/Color`), [0.9, 0.77, 0.66]);
  const mult = l.number(id, `${key}/ColorMultiplier`, 1);
  // Some lights keep the ambient as an element, some as an attribute of the time-of-day entry.
  const ambient = color3(l.value(id, `${base}/AmbientColor`) ?? l.value(id, base, 'AmbientColor'), [0.52, 0.47, 0.4]);
  const fill = color3(l.value(id, `${base}/DirectionalLight[Fill]`, 'Color'), [0.26, 0.18, 0.16]).multiplyScalar(l.number(id, `${base}/DirectionalLight[Fill]`, 3, 'ColorMultiplier'));
  const back = `${base}/DirectionalLight[Back]`;
  const bdir = (l.value(id, back, 'Direction') ?? '0,0,-1').split(',').map(Number);
  const backDir = new THREE.Vector3(-bdir[0], -bdir[2], bdir[1]).normalize();
  const backColor = color3(l.value(id, back, 'Color'), [0, 0, 0]);
  const backIntensity = l.number(id, back, 0, 'ColorMultiplier');
  return { sunDir, sunColor, sunIntensity: 3.1 * mult, skyLight: ambient, groundLight: fill, backDir, backColor, backIntensity };
}

/**
 * A sky texture decoded and softened. Skies are long smooth gradients, the worst case for
 * DXT's 16-bit block colors: stretched across a whole dome their steps band like a poster.
 * A small blur (wrapping around the sky) and a touch of noise before quantizing hide them.
 */
async function smoothSky(path: string): Promise<THREE.Texture | null> {
  const buf = await fetchBuffer(sc2Url(path));
  if (!buf) return null;
  const dds = parseDds(buf);
  const mip = dds.mipmaps[0];
  const src = decodeToRgba(mip, dds.format);
  const w = mip.width;
  const h = mip.height;
  const r = 2;
  const a = new Float32Array(w * h * 3);
  const b = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let k = -r; k <= r; k++) sum += src[(y * w + ((x + k + w) % w)) * 4 + c];
        a[(y * w + x) * 3 + c] = sum / (2 * r + 1);
      }
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let k = -r; k <= r; k++) sum += a[(Math.min(h - 1, Math.max(0, y + k)) * w + x) * 3 + c];
        b[(y * w + x) * 3 + c] = sum / (2 * r + 1);
      }
    }
  }
  const out = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const n = Math.random() - 0.5;
    for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.max(0, Math.min(255, Math.round(b[i * 3 + c] + n)));
    out[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(out, w, h, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** The tileset's sky dome model, unlit, with the average color of its horizon band. */
async function skyFor(data: GameData, tileset: string): Promise<{ sky: THREE.Object3D; horizon: THREE.Color } | null> {
  const modelId = (data.terrains.has(tileset) ? data.terrains.value(tileset, 'FixedSkyboxModel') : undefined) ?? SKY_FALLBACK[tileset];
  if (!modelId || !data.models.has(modelId)) return null;
  const path = data.models.value(modelId, 'Model');
  if (!path) return null;
  const template = await loadModel(path.replace(/\\/g, '/'));
  const mat = template.data.materials[0];
  const texPath = mat?.layers.diffuse?.path;
  const instance = template.instantiate(new THREE.Color(1, 1, 1));
  let map: THREE.Texture | null = null;
  instance.object.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    map = (mats.find((m) => (m as THREE.MeshPhongMaterial).map) as THREE.MeshPhongMaterial | undefined)?.map ?? map;
  });
  if (texPath) map = (await smoothSky(texPath).catch(() => null)) ?? map;
  const sky = new THREE.Mesh(
    instance.mesh.geometry,
    // Skyboxes are authored to be seen from inside; draw both sides to be safe about winding.
    new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide, depthWrite: false, fog: false, toneMapped: false, dithering: true }),
  );
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  // The dome is ~5600 model units in radius; keep it inside the far plane.
  const holder = new THREE.Group();
  const inner = new THREE.Group();
  inner.rotation.x = -Math.PI / 2;
  inner.add(sky);
  holder.add(inner);
  holder.scale.setScalar(3200 / 5600);

  // Average the texture over the vertices just above the dome's equator: the horizon color.
  const horizon = new THREE.Color(0.8, 0.72, 0.62);
  if (texPath) {
    const buf = await fetchBuffer(sc2Url(texPath));
    if (buf) {
      const dds = parseDds(buf);
      const mip = dds.mipmaps[Math.min(dds.mipmaps.length - 1, 3)];
      const rgba = decodeToRgba(mip, dds.format);
      const g = instance.mesh.geometry;
      const pos = g.attributes.position as THREE.BufferAttribute;
      const uv = g.attributes.uv as THREE.BufferAttribute;
      let r = 0;
      let gg = 0;
      let b = 0;
      let n = 0;
      for (let i = 0; i < pos.count; i++) {
        // Model space is Z-up: the horizon band is z a little above zero.
        const z = pos.getZ(i) / 5600;
        if (z < 0.01 || z > 0.12) continue;
        const u = ((uv.getX(i) % 1) + 1) % 1;
        const v = ((uv.getY(i) % 1) + 1) % 1;
        const px = Math.min(mip.width - 1, Math.floor(u * mip.width));
        const py = Math.min(mip.height - 1, Math.floor(v * mip.height));
        const o = (py * mip.width + px) * 4;
        r += rgba[o];
        gg += rgba[o + 1];
        b += rgba[o + 2];
        n++;
      }
      if (n) horizon.setRGB(r / n / 255, gg / n / 255, b / n / 255, THREE.SRGBColorSpace);
    }
  }
  return { sky: holder, horizon };
}

export async function tilesetEnvironment(data: GameData, tileset: string): Promise<Environment> {
  const t = data.terrains;
  const lighting = (t.has(tileset) && t.value(tileset, 'Lighting')) || tileset;
  const light = lightFor(data, data.lights.has(lighting) ? lighting : tileset);
  const sky = await skyFor(data, tileset).catch(() => null);
  let fog = sky?.horizon ?? new THREE.Color(0xc9a57f);
  let zenith: THREE.Color | null = null;
  let fogScale = 1;
  // A planet with no sky dome of its own (Char) gets its sky from its haze: StarCraft II lays
  // the tileset's fog color into the lowlands; overhead it reads as a darker shade of it.
  if (!sky && t.has(tileset) && t.value(tileset, 'FogEnabled') === '1') {
    const argb = (t.value(tileset, 'FogColor') ?? '').split(',').map(Number);
    if (argb.length === 4 && argb.every((n) => !Number.isNaN(n))) {
      // The haze's hue; how thick it is sets how bright the sky can be: Char's smoke (0.16)
      // dusky at the horizon and nearly black overhead, Meinhoff's thin haze (0.05) a clear day.
      const density = t.number(tileset, 'FogDensity', 0);
      const hsl = new THREE.Color().setRGB(argb[1] / 255, argb[2] / 255, argb[3] / 255, THREE.SRGBColorSpace).getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace);
      const light = THREE.MathUtils.clamp(0.55 - density * 1.8, 0.22, 0.55);
      fog = new THREE.Color().setHSL(hsl.h + 0.02, 0.42, light, THREE.SRGBColorSpace);
      zenith = new THREE.Color().setHSL(hsl.h, 0.3 + (0.16 - density) * 1.5, light * (0.2 + Math.max(0, 0.16 - density) * 2.5), THREE.SRGBColorSpace);
      fogScale = 1 + density * 2.5;
    }
  }
  return { sky: sky?.sky ?? null, fog, zenith, fogScale, ...light, ambientIntensity: 1.6 };
}
