import * as THREE from 'three';
import fs from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { unpackWorld } from '../src/assets/worlds.js';
import { restoreBakedNavigation } from '../src/assets/navigation.js';
import { PhysicsSystem } from '../src/physics/index.js';
import { NavGrid, CoverMap } from '../src/ai/nav.js';

const output = new URL('../public/baked/navigation/', import.meta.url);
await fs.mkdir(output, { recursive: true });
for (const map of ['street', 'swat', 'box']) {
  const bytes = gunzipSync(await fs.readFile(new URL(`../public/baked/worlds/${map}.bin.gz`, import.meta.url)));
  const data = unpackWorld(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const root = new THREE.ObjectLoader().parse(data.scene);
  root.updateMatrixWorld(true);
  const physics = new PhysicsSystem();
  for (const mesh of root.getObjectByName('world_collision').children) physics.addStatic(mesh, mesh.name.slice('collide_'.length));
  physics.rebuildStatic();
  const bounds = new THREE.Box3(new THREE.Vector3(...data.bounds[0]), new THREE.Vector3(...data.bounds[1]));
  bounds.expandByScalar(2);
  const opts = { bounds, cell: 0.8, radius: 0.36, height: 1.78 };
  const grid = new NavGrid(physics, opts).build();
  const cover = new CoverMap(grid, physics).build({ step: 1, reach: 1.3 });
  const saved = {
    version: 1, map,
    grid: Object.fromEntries(['nx', 'nz', 'minX', 'minZ', 'topY', 'cell', 'radius', 'height', 'crouchHeight', 'maxStep', 'maxSlope'].map((key) => [key, grid[key]])),
    flags: Array.from(grid.flags), floor: Array.from(grid.floor), enclosure: Array.from(grid.enclosure),
    walkableCount: grid.walkableCount,
    points: cover.points.map(({ claimed, score, ...point }) => point),
  };
  const compressed = gzipSync(JSON.stringify(saved), { level: 9 });
  const restoredGrid = new NavGrid(physics, opts), restoredCover = new CoverMap(restoredGrid, physics);
  restoreBakedNavigation(JSON.parse(gunzipSync(compressed)), restoredGrid, restoredCover, map);
  assert.deepEqual(restoredGrid.flags, grid.flags);
  assert.deepEqual(restoredGrid.floor, grid.floor);
  assert.deepEqual(restoredGrid.enclosure, grid.enclosure);
  assert.deepEqual(restoredCover.points, cover.points);
  assert.notEqual(restoredGrid.gScore, grid.gScore);
  const cells = [];
  for (let i = 0; i < grid.flags.length; i++) if (grid.flags[i]) cells.push(i);
  const point = (index) => new THREE.Vector3(grid.worldX(index % grid.nx), grid.floor[index], grid.worldZ((index / grid.nx) | 0));
  for (let test = 0; test < 6; test++) {
    const from = point(cells[Math.floor(cells.length * test / 7)]);
    const to = point(cells[Math.floor(cells.length * (test + 1) / 7)]);
    const originalPath = [], restoredPath = [];
    const originalCount = grid.findPath(from, to, originalPath);
    const restoredCount = restoredGrid.findPath(from, to, restoredPath);
    assert.equal(restoredCount, originalCount);
    assert.deepEqual(restoredPath.slice(0, restoredCount), originalPath.slice(0, originalCount));
  }
  if (cover.points.length) {
    restoredCover.points[0].claimed = 42;
    assert.equal(cover.points[0].claimed, -1);
  }
  await fs.writeFile(new URL(`${map}.json.gz`, output), compressed);
  console.log(`${map}: ${(compressed.length / 1024).toFixed(1)} KB, ${grid.walkableCount} walkable, ${cover.points.length} covers; skipped ${(grid.buildMs + cover.buildMs).toFixed(0)} ms, exact restore + 6 paths verified`);
}
