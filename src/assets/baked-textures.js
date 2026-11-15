import * as THREE from 'three';

// Procedural painters run only in the explicit offline asset-building harness.
export const BAKING = typeof location !== 'undefined' && new URLSearchParams(location.search).get('bake') === '1';
const assets = new Map();
const loadedProfiles = new Set();
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

export async function preloadBakedTextures(quality = 'low', onProgress = () => {}) {
  if (BAKING) return;
  const base = `${import.meta.env.BASE_URL}baked/`;
  const response = await fetch(`${base}manifest.json`);
  if (!response.ok) throw new Error('Prebuilt texture manifest is unavailable.');
  const manifest = await response.json();
  const profile = ['low', 'performance'].includes(quality) ? 'low' : 'high';
  const fxSize = ['high', 'ultra'].includes(quality) ? 1024 : 512;
  const profileKey = `${profile}|${fxSize}`;
  if (loadedProfiles.has(profileKey)) return;
  const names = manifest.profiles[profile].filter(name =>
    !/^fx-(ParticleAtlas|DecalAtlas)\|/.test(name) || name.endsWith(`|${fxSize}`)
  );
  const files = new Set();
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (typeof value.texture === 'string') files.add(value.texture);
    else Object.values(value).forEach(visit);
  };
  names.forEach(name => visit(manifest.assets[name]));
  const decoded = new Map();
  let done = 0;
  const queue = [...files];
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const file = queue.shift();
      const info = manifest.textures[file];
      let texture;
      try { texture = await new THREE.TextureLoader().loadAsync(`${base}${file}`); }
      catch { throw new Error(`Cannot decode prebuilt texture: ${base}${file}`); }
      for (const prop of ['colorSpace', 'wrapS', 'wrapT', 'minFilter', 'magFilter', 'generateMipmaps', 'anisotropy', 'flipY', 'premultiplyAlpha', 'name']) texture[prop] = info[prop];
      texture.needsUpdate = true;
      decoded.set(file, texture);
      onProgress(++done / files.size);
    }
  }));
  const hydrate = value => {
    if (!value || typeof value !== 'object') return value;
    if (typeof value.texture === 'string') return decoded.get(value.texture);
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, hydrate(v)]));
  };
  names.forEach(name => assets.set(name, hydrate(manifest.assets[name])));
  loadedProfiles.add(profileKey);
  console.info(`[assets] loaded ${files.size} prebuilt textures (${profile})`);
}
