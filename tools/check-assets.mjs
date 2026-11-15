import { readFile, stat } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { buildTextureLoadouts } from './bake-loadouts.mjs';
import { ARMORY } from '../src/weapons/loadout.js';
const root = new URL('../public/baked/', import.meta.url);
const json = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const textures = await json('manifest.json');
const audio = await json('audio/manifest.json');
const models = await json('models/manifest.json');
const armory = await json('armory/catalog.json');
for (const weapon of ARMORY) {
  assert(armory[weapon.id]?.groups.includes('body'), `Missing model for ${weapon.label}`);
  for (const { id } of weapon.optics.slice(1)) assert(armory.sights[id], `Missing sight: ${id}`);
}
assert.deepEqual(await json('texture-loadouts.json'), await buildTextureLoadouts(textures),
  'Texture loadouts are stale. Run npm run bake:loadouts.');
const paths = [...Object.keys(textures.textures), ...Object.values(audio.files).map(p => `audio/${p}`),
  ...models.models.flatMap(p => [`models/${p}.json`, `models/${p}.bin.gz`]),
  ...[...ARMORY.map(w => w.id), 'sights', 'suppressors'].map(p => `armory/${p}.glb.gz`),
  ...['street', 'swat', 'box'].map(p => `worlds/${p}.bin.gz`),
  ...['street', 'swat', 'box'].map(p => `navigation/${p}.json.gz`), 'environment.png', 'reflections.bin.gz'];
await Promise.all(paths.map(async path => { if (!(await stat(new URL(path, root))).size) throw new Error(`Empty asset: ${path}`); }));
console.log(`Verified ${paths.length} prebuilt asset files.`);
