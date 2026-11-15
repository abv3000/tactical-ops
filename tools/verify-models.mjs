import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import { preloadModels } from '../src/assets/models.js';
import { buildRifle } from '../src/weapons/models/rifle.js';
import { buildSmg } from '../src/weapons/models/smg.js';
import { buildPistol } from '../src/weapons/models/pistol.js';
import { buildSoldier, VARIANTS } from '../src/ai/soldier.js';
import { Arm } from '../src/weapons/hands.js';
assert.throws(buildRifle, /not preloaded/);
globalThis.fetch = async (url) => {
  try {
    const bytes = await fs.readFile(new URL(`../public/${url.replace(/^\//, '')}`, import.meta.url));
    return new Response(bytes);
  } catch { return new Response(null, { status: 404 }); }
};
await preloadModels('/');
let geometries = 0;
const checkGeo = (geometry) => {
  assert.ok(geometry.isBufferGeometry);
  assert.ok(geometry.getAttribute('position').count > 0);
  assert.ok(geometry.boundingSphere.radius > 0);
  for (const attr of Object.values(geometry.attributes)) {
    for (const x of attr.array) assert.ok(Number.isFinite(x));
  }
  geometries++;
};
const walk = (value) => {
  if (!value || typeof value !== 'object') return;
  if (typeof value.build === 'function') {
    const merged = value.build();
    assert.ok(merged.size > 0, `Empty assembly: ${value.name}`);
    for (const geo of merged.values()) { checkGeo(geo); assert.equal(geo.userData.bakedMasks, true); }
    return;
  }
  if (value instanceof Map) return [...value.values()].forEach(walk);
  for (const v of Object.values(value)) walk(v);
};
for (const build of [buildRifle, buildSmg, buildPistol]) {
  const model = build(); walk(model);
  assert.ok(model.nodes.gripR.pos.length === 3);
}
const materials = Object.fromEntries(['glove', 'pad', 'seam', 'sleeve'].map((name) => [name, new THREE.MeshBasicMaterial()]));
for (const side of [-1, 1]) {
  const arm = new Arm(side, materials, { scale: side === 1 ? 1 : 0.97 });
  assert.equal(arm.fingers.length, 4);
  for (const pose of ['grip', 'wrap', 'open', 'clamp']) arm.setPose(pose);
  arm.setTrigger(0.5);
  arm.root.traverse((mesh) => { if (mesh.isMesh) { checkGeo(mesh.geometry); assert.ok(mesh.material); } });
}
for (const name of Object.keys(VARIANTS)) {
  const model = buildSoldier(name, { materials: { get: () => new THREE.MeshBasicMaterial(), glass: () => new THREE.MeshBasicMaterial() } });
  checkGeo(model.geometry);
  assert.equal(model.materialNames.length, model.materials.length);
  assert.ok(model.geometry.getAttribute('skinIndex'));
  for (const anchor of ['muzzle', 'foregrip', 'magBottom', 'ejection']) assert.ok(Array.isArray(model.weapon[anchor]));
}
console.log(`Verified ${geometries} offline geometries; no generation flag, valid skeleton attributes, material slots and animated hand joints.`);
