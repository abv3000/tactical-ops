import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ARMORY } from '../weapons/loadout.js';

let assets, pending;
export function preloadArmory() {
  const base = import.meta.env.BASE_URL + 'baked/armory/';
  pending ??= (async () => {
    const loader = new GLTFLoader();
    const files = [...ARMORY.map(w => w.id), 'sights', 'suppressors'];
    const [catalog, ...scenes] = await Promise.all([
      fetch(base + 'catalog.json').then(r => {
        if (!r.ok) throw new Error('Cannot load the armory catalog');
        return r.json();
      }),
      ...files.map(async id => {
        const response = await fetch(base + id + '.glb.gz');
        if (!response.ok) throw new Error(`Cannot load armory model: ${id}`);
        const uncompressed = response.headers.get('content-encoding')?.includes('gzip')
          ? response : new Response(response.body.pipeThrough(new DecompressionStream('gzip')));
        return (await loader.parseAsync(await uncompressed.arrayBuffer(), base)).scene;
      }),
    ]);
    assets = { catalog, models: Object.fromEntries(files.map((id, i) => [id, scenes[i]])) };
    for (const optic of assets.models.sights.children) {
      optic.traverse(object => {
        const mat = object.material;
        if (!mat?.name.toLowerCase().includes('glass')) return;
        mat.transparent = true;
        mat.opacity = 0.07;
        mat.depthWrite = false;
      });
    }
  })().catch(error => { pending = undefined; throw error; });
  return pending;
}

const at = pos => ({ pos, rot: [0, 0, 0] });
const zero = [0, 0, 0];
const move = (a, b, scale = 1) => a.map((v, i) => v + b[i] * scale);
const bare = { asm: null, loudness: 105, flashScale: 1, recoil: 1, spread: 1 };

// Geometry and materials are baked into the GLBs. Here we only attach the
// prebuilt parts at the authored pivots of the existing first-person rig.
export function armoryModel(id) {
  const { catalog, models } = assets;
  const spec = catalog[id];
  const item = ARMORY.find(w => w.id === id);
  const assemble = (scene, name, offset = zero, scale = 1) => {
    const source = scene.getObjectByName(name);
    if (!source) throw new Error(`Armory asset missing: ${id}/${name}`);
    return { name, scene: source, offset, scale };
  };
  const local = (name, offset) => assemble(models[id], name, offset);
  const moving = {};
  const pistol = id === 'pistol';
  const movingPivots = { magazine: spec.magazine, trigger: spec.trigger, charging: spec.eject,
    bolt: spec.eject, slide: zero, 'break-action': spec.hinge };
  for (const [name, pivot] of Object.entries(movingPivots)) {
    if (spec.groups.includes(name)) moving[name] = local(name, pivot.map(v => -v));
  }
  const optics = {
    irons: { asm: spec.groups.includes('irons') ? local('irons') : null, glass: null, mag: 1 },
  };
  for (const { id: key } of item.optics.slice(1)) {
    const optic = catalog.sights[key];
    const scale = pistol ? .58 : 1;
    const center = move(spec.mount, optic.lens, scale);
    optics[key] = {
      asm: assemble(models.sights, 'sight-' + key, spec.mount, scale),
      mag: 1, glass: { center, lensZ: center[2], apertureR: optic.aperture * scale },
    };
  }
  const muzzles = { bare: { ...bare, crownZ: spec.muzzle[2] } };
  if (item.muzzles.length > 1) {
    const family = pistol ? 'pistol' : 'rifle';
    const seat = move(spec.muzzle, [0, 0, .016]);
    muzzles.can = {
      asm: id === 'smg' ? local('internal-can', [0, 0, .05]) : assemble(models.suppressors, 'can-' + family, seat),
      crownZ: id === 'smg' ? spec.canCrown : seat[2] + catalog.suppressors[family],
      loudness: 26, flashScale: .18, recoil: .9, spread: .96, adsScale: 1.1,
    };
  }
  return {
    id, imported: true, body: local('body'), moving, optics, muzzles,
    nodes: {
      muzzle: spec.muzzle, eject: spec.eject, chamber: spec.eject, lowerMuzzleY: spec.lowerMuzzleY,
      sight: spec.irons, ironSight: spec.irons, sightAxis: [0, 0, -1],
      gripR: { pos: spec.gripR, finger: [0, -.4, -.915], back: [.98, 0, -.2] },
      gripL: { pos: spec.gripL, finger: pistol ? [.34, -.28, -.90] : [.45, .05, -.89],
        back: pistol ? [.15, .93, -.33] : [-.88, -.05, -.45] },
      magSeat: at(spec.magazine), magDrop: [0, -.4, .02],
      triggerPivot: at(spec.trigger), triggerPull: -.3,
      chargeRest: at(spec.eject), chargePull: [0, 0, .06],
      boltRest: at(spec.eject), boltTravel: [0, 0, .05],
      slideRest: at(zero), slideTravel: [0, 0, .022],
      hinge: spec.hinge,
    },
    shell: pistol ? { caseLen: .0228, rimR: .006 } : id === 'smg'
      ? { caseLen: .03, rimR: .004 } : { caseLen: .0446, rimR: .00495 },
  };
}
