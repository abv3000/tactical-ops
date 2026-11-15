// Static navigation is authored from the exact shipped collision world. Search
// working memory, live physics queries and cover ownership remain per session.
export async function loadBakedNavigation(map, base = import.meta.env?.BASE_URL ?? '/') {
  const response = await fetch(`${base.replace(/\/?$/, '/')}baked/navigation/${map}.json.gz`);
  if (!response.ok) throw new Error(`Missing baked navigation for ${map} (${response.status}). Run npm run bake:navigation.`);
  const decoded = response.headers.get('content-encoding')?.includes('gzip')
    ? response : new Response(response.body.pipeThrough(new DecompressionStream('gzip')));
  const data = await decoded.json();
  if (data.version !== 1 || data.map !== map) throw new Error(`Invalid baked navigation for ${map}`);
  return data;
}

export function restoreBakedNavigation(data, grid, cover, map) {
  if (!data || data.map !== map) throw new Error(`Navigation for ${map} was not loaded`);
  for (const key of ['nx', 'nz', 'minX', 'minZ', 'topY', 'cell', 'radius', 'height', 'crouchHeight', 'maxStep', 'maxSlope']) {
    if (grid[key] !== data.grid[key]) throw new Error(`Stale navigation ${map}: ${key}. Rebuild the navigation assets.`);
  }
  const count = grid.nx * grid.nz;
  if (data.flags.length !== count || data.floor.length !== count || data.enclosure.length !== count) throw new Error(`Corrupt navigation for ${map}`);
  grid.flags.set(data.flags);
  grid.floor.set(data.floor.map((y) => y === null ? -Infinity : y));
  grid.enclosure.set(data.enclosure);
  grid.walkableCount = data.walkableCount;
  grid.buildMs = 0;
  // Never reuse claimed/score state from a previous match or bake session.
  cover.points = data.points.map((point) => ({ ...point, claimed: -1, score: 0 }));
  cover.buildMs = 0;
}
