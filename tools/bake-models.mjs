import fs from 'node:fs/promises';
import path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { Assembly, mergeAll } from '../src/weapons/geometry.js';
import { Rng } from '../src/core/rng.js';
import { bakeMasks } from '../src/materials/masks.js';
import { decodeModel } from '../src/assets/models.js';

globalThis.__BAKE_MODELS__ = true;
const { buildRifle } = await import('../src/weapons/models/rifle.js');
const { buildSmg } = await import('../src/weapons/models/smg.js');
const { buildPistol } = await import('../src/weapons/models/pistol.js');
const { buildSoldier, VARIANTS } = await import('../src/ai/soldier.js');
const { Arm } = await import('../src/weapons/hands.js');
const { shapeMasks } = await import('../src/weapons/viewmodel.js');
const output = fileURLToPath(new URL('../public/baked/models/', import.meta.url));
await fs.mkdir(output, { recursive: true });
const names = [];

function encoder() {
  const chunks = []; let offset = 0;
  const encode = (value) => {
    if (value === null || typeof value !== 'object') return value;
    if (ArrayBuffer.isView(value)) {
      const pad = (8 - offset % 8) % 8;
      if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
      const entry = { $: 'array', type: value.constructor.name, offset, length: value.length };
      const chunk = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
      chunks.push(chunk); offset += chunk.byteLength; return entry;
    }
    if (value.isBufferGeometry) {
      value.computeBoundingSphere();
      return { $: 'geometry', attributes: Object.fromEntries(Object.entries(value.attributes).map(([name, a]) => [name, { array: encode(a.array), itemSize: a.itemSize, normalized: a.normalized }])),
        index: value.index ? encode(value.index.array) : null, groups: value.groups, userData: value.userData,
        bounds: { center: value.boundingSphere.center.toArray(), radius: value.boundingSphere.radius } };
    }
    if (value instanceof Assembly) {
      const geometries = value.build();
      for (const [key, geo] of geometries) {
        const soft = ['polymer', 'rubber', 'polymer_tan'].includes(key);
        bakeMasks(geo, { wear: 1, grime: 1, ao: 1, edgeThreshold: 0.16, rng: new Rng(1437) });
        shapeMasks(geo, { wearAmp: soft ? 0.42 : 0.62, wearExp: soft ? 3.4 : 2.8, grimeAmp: 1.15, grimeExp: 1.25, aoAmp: 1, aoExp: 1.15 });
        geo.userData.bakedMasks = true;
      }
      return { $: 'assembly', name: value.name, nodes: encode(value.nodes), geometries: encode(geometries) };
    }
    if (value.isObject3D) return { $: 'object3d', name: value.name, position: value.position.toArray(), quaternion: value.quaternion.toArray(), scale: value.scale.toArray(), userData: value.userData,
      geometry: value.isMesh ? encode(value.geometry) : null, children: value.children.map(encode) };
    if (value instanceof Map) return { $: 'map', entries: [...value].map(([key, v]) => [key, encode(v)]) };
    if (value.isVector3 || value.isQuaternion) return { $: value.isVector3 ? 'Vector3' : 'Quaternion', values: value.toArray() };
    if (Array.isArray(value)) return value.map(encode);
    return Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v !== 'function').map(([key, v]) => [key, encode(v)]));
  };
  return { encode, buffer: () => Buffer.concat(chunks) };
}

async function save(name, model) {
  const pack = encoder(); const meta = pack.encode(model); const binary = pack.buffer();
  // Verify that the shipping decoder accepts the exact files written by the bake.
  const restored = decodeModel(meta, binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength));
  if (!restored) throw new Error(`Decode failed: ${name}`);
  await fs.writeFile(path.join(output, `${name}.json`), JSON.stringify(meta));
  const compressed = gzipSync(binary, { level: 9 });
  if (!gunzipSync(compressed).equals(binary)) throw new Error(`Compression verification failed: ${name}`);
  await fs.writeFile(path.join(output, `${name}.bin.gz`), compressed);
  await fs.rm(path.join(output, `${name}.bin`), { force: true });
  names.push(name); console.log(`${name}: ${(binary.length / 1048576).toFixed(2)} MB -> ${(compressed.length / 1048576).toFixed(2)} MB gzip`);
}
for (const build of [buildRifle, buildSmg, buildPistol]) {
  const model = build(); await save(`weapon-${model.id}`, model);
}
for (const name of Object.keys(VARIANTS)) {
  const model = buildSoldier(name, { rng: new Rng(0x51d1e7), materials: { get: () => null, glass: () => null } });
  // Weapon surfaces are already included in the skinned geometry. Animation only needs these anchors.
  model.weapon = Object.fromEntries(Object.entries(model.weapon).filter(([key]) => !['steel', 'polymer', 'rubber', 'glass'].includes(key)));
  delete model.materials;
  await save(`soldier-${name}`, model);
}
for (const side of [1, -1]) {
  const materials = Object.fromEntries(['glove', 'pad', 'seam', 'sleeve'].map((name) => [name, new THREE.MeshBasicMaterial()]));
  const arm = new Arm(side, materials, { scale: side === 1 ? 1 : 0.97 });
  arm.bakeSurfaceMasks(bakeMasks, shapeMasks, new Rng(1337));
  arm.root.userData.bakedMasks = true;
  const paths = new Map();
  const walk = (node, address = []) => {
    paths.set(node, address);
    if (node.isMesh) node.userData.materialSlot = Object.keys(materials).find((key) => materials[key] === node.material);
    node.children.forEach((child, i) => walk(child, [...address, i]));
  };
  walk(arm.root);
  const refs = Object.fromEntries(['upper', 'fore', 'upperPivot', 'forePivot', 'hand', 'handInner', 'glove'].map((key) => [key, paths.get(arm[key])]));
  const finger = (f) => ({ root: paths.get(f.root), joints: f.joints.map((joint) => paths.get(joint)) });
  await save(`arm-${side === 1 ? 'right' : 'left'}`, { root: arm.root, refs, fingers: arm.fingers.map(finger), thumb: finger(arm.thumb), segRadius: arm._segRadius, segLength: arm._segLength });
}
await save('reticle', { core: new THREE.CircleGeometry(1, 32), halo: new THREE.CircleGeometry(1.6, 32), rim: new THREE.RingGeometry(1, 1.42, 32, 1),
  ring: mergeAll(Array.from({ length: 12 }, (_, i) => new THREE.RingGeometry(2.98, 3.42, 4, 1, (i / 12) * Math.PI * 2, (Math.PI * 2 / 12) * 0.56))) });
await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify({ version: 1, models: names }));
console.log(`Wrote ${names.length} prebuilt models.`);
