import { LIBRARY, resolveName } from './library.js';

export function textureSize(base, quality) {
  const scale = { performance: 0.25, low: 0.5, medium: 0.75 }[quality] ?? 1;
  const size = Math.max(128, Math.round(base * scale / 128) * 128);
  return 1 << Math.round(Math.log2(size));
}

export function textureRecipe(name, opts, quality) {
  const resolved = resolveName(name);
  const key = LIBRARY[resolved] ? resolved : 'concrete';
  const def = LIBRARY[key];
  const bake = { ...def.bake, ...opts?.bake };
  bake.size = textureSize(bake.size, quality);
  const cacheKey = `${key}|${bake.size}|${bake.seed}|${bake.tintA ?? ''}|${bake.tintB ?? ''}|${(bake.param ?? []).join('_')}|${bake.relief}|${bake.worldSize}`;
  return { def, bake, cacheKey };
}
