import * as THREE from 'three';
import { Assembler } from '../world/builder.js';

// The header is JSON; bulk vertex/index/instance arrays follow as aligned binary.
export function unpackWorld(buffer) {
  const bytes = new Uint8Array(buffer);
  const length = new DataView(buffer).getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + length)));
  const offset = Math.ceil((4 + length) / 8) * 8;
  const revive = (v) => {
    if (!v || typeof v !== 'object') return v;
    if (v.$array) {
      const Ctor = globalThis[v.$array];
      return new Ctor(buffer.slice(offset + v.offset, offset + v.offset + v.bytes));
    }
    for (const key of Object.keys(v)) v[key] = revive(v[key]);
    return v;
  };
  return revive(header);
}

export async function loadBakedWorld(world, ctx) {
  const map = ctx.config.map;
  if (!['street', 'swat', 'box'].includes(map)) throw new Error(`Unknown map: ${map}`);
  const start = performance.now();
  const response = await fetch(`${import.meta.env.BASE_URL}baked/worlds/${map}.bin.gz`);
  if (!response.ok) throw new Error(`Map download failed: ${response.status}`);
  const buffer = response.headers.get('content-encoding')?.includes('gzip')
    ? await response.arrayBuffer()
    : await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const data = unpackWorld(buffer);
  const materials = ctx.get('materials');
  const physics = ctx.peek('physics');
  const render = ctx.peek('render');
  const root = new THREE.ObjectLoader().parse(data.scene);
  const A = new Assembler({ materials, rng: ctx.rng.fork(), render });
  A.xform.fromArray(data.xform);
  A._identity = false;
  A.ry = data.ry;
  A.stats = data.stats;
  A.meshes = [];
  A.lodGroups = [];
  A.collisionRoot = root.getObjectByName('world_collision');
  A.handles = [];
  const restored = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.parent === A.collisionRoot) {
      A.handles.push(physics.addStatic(o, o.name.slice('collide_'.length)));
      return;
    }
    const restore = (placeholder) => {
      if (!restored.has(placeholder.uuid)) {
        const spec = data.materials[placeholder.name];
        if (!spec) throw new Error(`Missing map material ${placeholder.name}`);
        restored.set(placeholder.uuid, materials.get(spec.name, spec.opts));
      }
      return restored.get(placeholder.uuid);
    };
    o.material = Array.isArray(o.material) ? o.material.map(restore) : restore(o.material);
    A.meshes.push(o);
    if (o.isInstancedMesh) A._protos.set(o.geometry.uuid, { geo: o.geometry });
    if (o.userData.owLodDist > 0) A.lodGroups.push(o);
  });
  physics.rebuildStatic();
  world.root = root;
  world.A = A;
  ctx.scene.add(root);
  world.bulbs = data.bulbs.map((id) => root.getObjectByProperty('uuid', id));
  world.lamps = data.lamps.map((id) => root.getObjectByProperty('uuid', id));
  for (const { uuid, opts } of data.lights) {
    const light = root.getObjectByProperty('uuid', uuid);
    A.lights.push({ light, opts });
    render.addLight(light, opts);
  }
  world.lampLens = A.mat('lamp_lens');
  world._lampMix = -1;
  world._addBallast();
  world._v = new THREE.Vector3();
  world._inv = A.xform.clone().invert();
  world.spawnPoints = data.spawns.map((s) => ({ ...s, position: new THREE.Vector3().fromArray(s.position) }));
  world.bounds = new THREE.Box3(new THREE.Vector3().fromArray(data.bounds[0]), new THREE.Vector3().fromArray(data.bounds[1]));
  world.buildings = data.buildings;
  world.stats = A.stats;
  materials.setGroundLevel?.(0);
  console.info(`[world] loaded baked ${map} in ${(performance.now() - start).toFixed(0)}ms`);
}
