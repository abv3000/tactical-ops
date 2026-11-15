import * as THREE from 'three';
import { MaterialSystem } from '../materials/index.js';
import { WEAPON_MATERIALS } from '../weapons/materials.js';
import { SoldierMaterials } from '../ai/textures.js';
import { buildParticleAtlas, buildDecalAtlas, buildBrassTextures } from '../fx/atlas.js';
import { Rng } from '../core/rng.js';
import { bakeRegistry } from './baked-textures.js';

const props = ['colorSpace', 'wrapS', 'wrapT', 'minFilter', 'magFilter', 'generateMipmaps', 'anisotropy', 'premultiplyAlpha', 'name'];
window.bakeProfile = async (quality) => {
  bakeRegistry.clear();
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  const system = new MaterialSystem({ renderer });
  await system.init({ config: { quality, q: { anisotropy: 4 } } });
  for (const name of system.names()) system.getTextureSet(name);
  for (const [name, opts] of Object.values(WEAPON_MATERIALS)) system.getTextureSet(name, opts);
  const low = quality === 'low' || quality === 'performance';
  new SoldierMaterials(new Rng(1947), { size: low ? 256 : 512, camo: ['arid', 'woodland', 'urban'] });
  // FX budget changes at ultra; include 512 in both profiles for medium/high.
  for (const size of (low ? [512] : [512, 1024])) {
    buildParticleAtlas(new Rng(814), size);
    buildDecalAtlas(new Rng(815), size);
  }
  buildBrassTextures(new Rng(816), 128);
  const textures = new Map();
  async function serialize(value, renderer) {
    if (value?.isTexture) {
      if (textures.has(value)) return { texture: textures.get(value) };
      let data, width, height;
      if (value.isRenderTargetTexture) {
        const rt = system._forge._owned.find(t => t.texture === value);
        if (!rt) throw new Error('Texture render target not found');
        width = rt.width; height = rt.height;
        data = new Uint8Array(width * height * 4);
        renderer.readRenderTargetPixels(rt, 0, 0, width, height, data);
      } else {
        ({ data, width, height } = value.image);
      }
      let binary = '';
      for (let i = 0; i < data.length; i += 32768) binary += String.fromCharCode(...data.subarray(i, i + 32768));
      const metadata = Object.fromEntries(props.map(p => [p, value[p]]));
      // PNG stores rows in the same order as raw GPU readback / DataTexture.
      metadata.flipY = false;
      const filename = await window.saveTexture({ data: btoa(binary), width, height, metadata });
      textures.set(value, filename);
      return { texture: filename };
    }
    if (value === null || typeof value !== 'object') return value;
    const result = {};
    for (const [k, v] of Object.entries(value)) result[k] = await serialize(v, renderer);
    return result;
  }
  const assets = {};
  for (const [key, entry] of bakeRegistry) assets[key] = await serialize(entry.value, entry.renderer);
  system.dispose(); renderer.dispose();
  return assets;
};
window.__BAKER_READY__ = true;
