import { readFile, stat } from 'node:fs/promises';
const root = new URL('../public/baked/', import.meta.url);
const json = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const textures = await json('manifest.json');
const audio = await json('audio/manifest.json');
const models = await json('models/manifest.json');
const paths = [...Object.keys(textures.textures), ...Object.values(audio.files).map(p => `audio/${p}`),
  ...models.models.flatMap(p => [`models/${p}.json`, `models/${p}.bin.gz`]),
  ...['street', 'swat', 'box'].map(p => `worlds/${p}.bin.gz`),
  ...['street', 'swat', 'box'].map(p => `navigation/${p}.json.gz`), 'environment.png'];
await Promise.all(paths.map(async path => { if (!(await stat(new URL(path, root))).size) throw new Error(`Empty asset: ${path}`); }));
console.log(`Verified ${paths.length} prebuilt asset files.`);
