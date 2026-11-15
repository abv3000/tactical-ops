// Compute the assets each level can use, from the actual baked level data.
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { textureRecipe } from '../src/materials/asset-keys.js';
import { WEAPON_MATERIALS } from '../src/weapons/materials.js';
import { PALETTE } from '../src/world/palette.js';

export const qualities = { performance: 'performance', low: 'low', high: 'high' };
const root = new URL('../public/baked/', import.meta.url);
export async function buildTextureLoadouts(manifest) {
  const result = {};
  for (const map of ['street', 'swat', 'box']) {
    const world = gunzipSync(await readFile(new URL(`worlds/${map}.bin.gz`, root)));
    const header = JSON.parse(world.subarray(4, 4 + world.readUInt32LE()));
    const recipes = [...Object.values(header.materials), PALETTE.lamp_lens].map(m => [m.name, m.opts]);
    recipes.push(...Object.values(WEAPON_MATERIALS));
    result[map] = {};
    for (const quality of Object.values(qualities)) {
      const names = [...new Set(recipes.map(([name, opts]) => 'material|' + textureRecipe(name, opts, quality).cacheKey))].sort();
      const profile = new Set(manifest.profiles[quality]);
      for (const name of names) {
        if (!profile.has(name) || !manifest.assets[name]) throw new Error(`Missing baked texture: ${map}/${quality}/${name}`);
      }
      result[map][quality] = names;
    }
  }
  return result;
}

if (import.meta.filename === process.argv[1]) {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  await writeFile(new URL('texture-loadouts.json', root), JSON.stringify(await buildTextureLoadouts(manifest)));
}
