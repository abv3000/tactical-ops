import * as THREE from 'three';

// Procedural painters run only in the explicit offline asset-building harness.
export const BAKING = typeof location !== 'undefined' && new URLSearchParams(location.search).get('bake') === '1';
const assets = new Map();
const decoded = new Map();
let catalog;
export const bakeRegistry = new Map();
export function registerBakedAsset(key, value, renderer) {
  if (BAKING) bakeRegistry.set(key, { value, renderer });
  return value;
}
export function bakedAsset(key) {
  const value = assets.get(key);
  if (!value) throw new Error(`Prebuilt texture missing: ${key}. Run npm run bake:textures before publishing.`);
  return value;
}

export async function preloadBakedTextures(quality = 'low', onProgress = () => {}, map) {
  if (BAKING) return;
  const base = `${import.meta.env.BASE_URL}baked/`;
  const getJson = async (file) => {
    const response = await fetch(base + file);
    if (!response.ok) throw new Error(`Cannot load texture catalog: ${file}`);
    return response.json();
  };
  catalog ??= Promise.all([getJson('manifest.json'), getJson('texture-loadouts.json')]).catch(error => {
    catalog = undefined;
    throw error;
  });
  const [manifest, loadouts] = await catalog;
  const profile = quality === 'performance' || quality === 'low' ? quality : 'high';
  const fxSize = ['high', 'ultra'].includes(quality) ? 1024 : 512;
  const selected = map && loadouts[map]?.[profile] ? new Set(loadouts[map][profile]) : null;
  const names = manifest.profiles[profile].filter(name => {
    if (assets.has(name)) return false;
    if (selected && name.startsWith('material|')) return selected.has(name);
    return !/^fx-(ParticleAtlas|DecalAtlas)\|/.test(name) || name.endsWith(`|${fxSize}`);
  });
  if (!names.length) return;
  const files = new Set();
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (typeof value.texture === 'string') files.add(value.texture);
    else Object.values(value).forEach(visit);
  };
  names.forEach(name => visit(manifest.assets[name]));
  let done = 0;
  const queue = [...files];
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const file = queue.shift();
      if (!decoded.has(file)) {
        const info = manifest.textures[file];
        const load = new THREE.TextureLoader().loadAsync(base + file).then(texture => {
          for (const prop of ['colorSpace', 'wrapS', 'wrapT', 'minFilter', 'magFilter', 'generateMipmaps', 'anisotropy', 'flipY', 'premultiplyAlpha', 'name']) texture[prop] = info[prop];
          texture.needsUpdate = true;
          return texture;
        }).catch(() => {
          decoded.delete(file);
          throw new Error(`Cannot decode prebuilt texture: ${base}${file}`);
        });
        decoded.set(file, load);
      }
      await decoded.get(file);
      onProgress(++done / files.size);
    }
  }));
  const hydrate = async value => {
    if (!value || typeof value !== 'object') return value;
    if (typeof value.texture === 'string') return decoded.get(value.texture);
    return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([k, v]) => [k, await hydrate(v)])));
  };
  await Promise.all(names.map(async name => assets.set(name, await hydrate(manifest.assets[name]))));
  console.info(`[assets] loaded ${files.size} prebuilt textures (${profile})`);
}
