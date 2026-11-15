// Attachment ids belong to separate slots: changing one never changes the other.
const irons = { id: 'irons', label: 'Штатный прицел' };
const bare = { id: 'bare', label: 'Без глушителя' };
const dot = { id: 'reddot', label: 'Holosun 403R' };
const holo = { id: 'holo', label: 'EOTech EXPS3' };
const reflex = { id: 'reflex', label: 'Holosun 510C' };
const can = { id: 'can', label: 'Глушитель' };
const rifleOptics = [irons, dot, holo, { id: 'aimpoint', label: 'Aimpoint Comp M4' },
  { id: 'vortex', label: 'Vortex AMG UH-1' }, reflex];

export const ARMORY = [
  { id: 'rifle', label: 'Colt M4A1', category: 'Карабин', optics: rifleOptics, muzzles: [bare, can] },
  { id: 'smg', label: 'HK MP7 A1', category: 'Пистолет-пулемёт', optics: rifleOptics, muzzles: [bare, can] },
  { id: 'pistol', label: 'Colt M45A1', category: 'Пистолет', optics: [irons, reflex], muzzles: [bare, can] },
  { id: 'mcx', label: 'SIG Sauer MCX Legacy', category: 'Карабин', optics: rifleOptics, muzzles: [bare, can] },
  { id: 'toz', label: 'ТОЗ-34', category: 'Двустволка', optics: [irons], muzzles: [bare] },
];

const STORAGE = 'tactical-ops-armory-v1';
export function normalizeLoadout(value = {}) {
  const weapon = ARMORY.some(w => w.id === value?.weapon) ? value.weapon : ARMORY[0].id;
  const kits = Object.fromEntries(ARMORY.map(w => {
    const selected = value?.kits?.[w.id];
    return [w.id, {
      optic: w.optics.find(item => item.id === selected?.optic)?.id ?? w.optics[0].id,
      muzzle: w.muzzles.find(item => item.id === selected?.muzzle)?.id ?? w.muzzles[0].id,
    }];
  }));
  return { weapon, kits };
}

export function readLoadout() {
  try { return normalizeLoadout(JSON.parse(localStorage.getItem(STORAGE))); }
  catch { return normalizeLoadout(); }
}

export function saveLoadout(value) {
  const result = normalizeLoadout(value);
  try { localStorage.setItem(STORAGE, JSON.stringify(result)); } catch { /* private mode */ }
  return result;
}
