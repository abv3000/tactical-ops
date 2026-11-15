import * as THREE from 'three';

// Only the offline asset command sets this flag. Shipping builds never generate models.
export const isModelBake = () => globalThis.__BAKE_MODELS__ === true;
const models = new Map();
const arrays = { Float32Array, Float64Array, Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array };

export function decodeModel(value, binary) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => decodeModel(v, binary));
  if (value.$ === 'array') return new arrays[value.type](binary, value.offset, value.length);
  if (value.$ === 'geometry') {
    const geo = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(value.attributes)) {
      geo.setAttribute(name, new THREE.BufferAttribute(decodeModel(attr.array, binary), attr.itemSize, attr.normalized));
    }
    if (value.index) geo.setIndex(new THREE.BufferAttribute(decodeModel(value.index, binary), 1));
    geo.groups = value.groups;
    geo.userData = value.userData;
    if (value.bounds) {
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(...value.bounds.center), value.bounds.radius);
    }
    return geo;
  }
  if (value.$ === 'assembly') {
    const geometries = decodeModel(value.geometries, binary);
    return { name: value.name, nodes: decodeModel(value.nodes, binary), build: () => new Map([...geometries].map(([key, geo]) => [key, geo.clone()])) };
  }
  if (value.$ === 'map') return new Map(value.entries.map(([key, v]) => [key, decodeModel(v, binary)]));
  if (value.$ === 'object3d') {
    const object = value.geometry ? new THREE.Mesh(decodeModel(value.geometry, binary)) : new THREE.Object3D();
    object.name = value.name;
    object.position.fromArray(value.position);
    object.quaternion.fromArray(value.quaternion);
    object.scale.fromArray(value.scale);
    object.userData = value.userData;
    for (const child of value.children) object.add(decodeModel(child, binary));
    return object;
  }
  if (value.$ === 'Vector3') return new THREE.Vector3(...value.values);
  if (value.$ === 'Quaternion') return new THREE.Quaternion(...value.values);
  return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, decodeModel(v, binary)]));
}

export async function preloadModels(base = import.meta.env?.BASE_URL ?? '/') {
  if (isModelBake() || models.size) return;
  const root = `${base.replace(/\/?$/, '/')}baked/models/`;
  const fetchFile = async (name, json = false) => {
    const response = await fetch(root + name);
    if (!response.ok) throw new Error(`Missing baked model: ${name} (${response.status}). Run npm run bake:models.`);
    if (json) return response.json();
    // HTTP gzip is already decoded by fetch; static hosts may also serve these
    // files as plain binary, in which case decode the asset stream explicitly.
    if (response.headers.get('content-encoding')?.includes('gzip')) return response.arrayBuffer();
    return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  };
  const manifest = await fetchFile('manifest.json', true);
  const loaded = await Promise.all(manifest.models.map(async (name) => {
    const [meta, binary] = await Promise.all([fetchFile(`${name}.json`, true), fetchFile(`${name}.bin.gz`)]);
    return [name, { meta, binary }];
  }));
  for (const [name, entry] of loaded) models.set(name, entry);
}

export function getBakedModel(name) {
  const entry = models.get(name);
  if (!entry) throw new Error(`Baked model ${name} was not preloaded. Call preloadModels() before engine initialization.`);
  return decodeModel(entry.meta, entry.binary);
}
