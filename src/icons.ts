// StarCraft II's command-card icons, for the game's icon names (src/content/assetnames.ts), decoded from
// their DDS files to PNG data addresses.

import type { IconName } from '../../../src/content/assetnames.ts';
import { fetchBuffer } from '../../../src/engine/assets.ts';
import { sc2Url } from './textures.ts';
import { decodeToRgba, parseDds } from './formats/dds.ts';

const ICONS: Record<IconName, string> = {
  trooper: 'Assets/Textures/btn-unit-terran-marine.dds',
  medic: 'Assets/Textures/btn-unit-terran-medic.dds',
  grenadier: 'Assets/Textures/btn-unit-terran-marauder.dds',
  burner: 'Assets/Textures/btn-unit-terran-firebat.dds',
  vaulter: 'Assets/Textures/btn-unit-terran-reaper.dds',
  seer: 'Assets/Textures/btn-unit-terran-ghost.dds',
  howitzer: 'Assets/Textures/btn-unit-terran-siegetank.dds',
  warship: 'Assets/Textures/btn-unit-terran-battlecruiser.dds',
  jolt: 'Assets/Textures/btn-ability-terran-stimpack-color.dds',
  heal: 'Assets/Textures/btn-ability-terran-heal-color.dds',
  shroud: 'Assets/Textures/btn-ability-terran-cloak-color.dds',
  keelGun: 'Assets/Textures/btn-ability-terran-yamatogun-color.dds',
  skyscan: 'Assets/Textures/btn-ability-terran-scannersweep-color.dds',
  mender: 'Assets/Textures/btn-unit-terran-mule.dds',
  dustoff: 'Assets/Textures/btn-unit-terran-medivac.dds',
};

const cache = new Map<string, Promise<string | null>>();

/** An icon as a data address, decoded from its DDS; null if the install hasn't it. */
export function iconUrl(name: IconName): Promise<string | null> {
  const path = ICONS[name];
  let p = cache.get(path);
  if (!p) {
    p = (async () => {
      const buf = await fetchBuffer(sc2Url(path));
      if (!buf) return null;
      try {
        const dds = parseDds(buf);
        const mip = dds.mipmaps[0];
        const rgba = decodeToRgba(mip, dds.format);
        const c = document.createElement('canvas');
        c.width = mip.width;
        c.height = mip.height;
        const g = c.getContext('2d')!;
        const img = g.createImageData(mip.width, mip.height);
        img.data.set(rgba.subarray(0, img.data.length));
        // Command-card icons carry no meaningful alpha.
        for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
        g.putImageData(img, 0, 0);
        return c.toDataURL('image/png');
      } catch {
        return null;
      }
    })();
    cache.set(path, p);
  }
  return p;
}
