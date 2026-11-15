import * as THREE from 'three';
import { mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { Rng } from '../src/core/rng.js';
globalThis.__BAKE_WORLD__ = true;
const { WorldSystem } = await import('../src/world/index.js');
const output = new URL('../public/baked/worlds/', import.meta.url);
await mkdir(output, { recursive: true });

for (const map of ['street', 'swat', 'box']) {
  const specs = {};
  const cache = new Map();
  const materials = {
    setGroundLevel() {},
    get(name, opts = {}) {
      const key = `${name}|${JSON.stringify(opts)}`;
      if (!cache.has(key)) {
        const material = new THREE.MeshStandardMaterial();
        material.name = key;
        cache.set(key, material);
        specs[key] = { name, opts };
      }
      return cache.get(key);
    },
  };
  const ctx = { config: { map }, scene: new THREE.Scene(), rng: new Rng(0x5eed1234),
    get: () => materials, peek: () => null };
  const world = new WorldSystem();
  await world.init(ctx);
  for (const light of world._ballast) light.removeFromParent();
  const data = { scene: world.root.toJSON(), materials: specs, xform: world.A.xform.toArray(),
    ry: world.A.ry, stats: world.stats, buildings: world.buildings,
    bounds: [world.bounds.min.toArray(), world.bounds.max.toArray()],
    spawns: world.spawnPoints.map((s) => ({ ...s, position: s.position.toArray() })),
    lights: world.A.lights.map(({ light, opts }) => ({ uuid: light.uuid, opts })),
    bulbs: world.bulbs.map((l) => l.uuid), lamps: world.lamps.map((l) => l.uuid) };
  const chunks = [];
  let bytes = 0;
  const pack = (v, parent) => {
    if (Array.isArray(v) && v.length > 32 && typeof v[0] === 'number') {
      const Ctor = globalThis[parent?.type] ?? Float32Array;
      const safe = Ctor.BYTES_PER_ELEMENT ? Ctor : Float32Array;
      const typed = new safe(v);
      bytes = Math.ceil(bytes / 8) * 8;
      const ref = { $array: safe.name, offset: bytes, bytes: typed.byteLength };
      chunks.push({ offset: bytes, data: Buffer.from(typed.buffer) });
      bytes += typed.byteLength;
      return ref;
    }
    if (!v || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map((x) => pack(x));
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, pack(x, v)]));
  };
  const header = Buffer.from(JSON.stringify(pack(data)));
  const start = Math.ceil((4 + header.length) / 8) * 8;
  const result = Buffer.alloc(start + bytes);
  result.writeUInt32LE(header.length, 0);
  header.copy(result, 4);
  for (const c of chunks) c.data.copy(result, start + c.offset);
  const compressed = gzipSync(result, { level: 9 });
  await writeFile(new URL(`${map}.bin.gz`, output), compressed);
  console.log(`${map}: ${(compressed.length / 1024 / 1024).toFixed(1)} MB compressed`);
  world.dispose();
}
