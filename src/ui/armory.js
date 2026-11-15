import { ARMORY, normalizeLoadout } from '../weapons/loadout.js';

function addOptions(select, items, selected) {
  select.replaceChildren(...items.map(({ id, label }) => new Option(label, id, false, id === selected)));
}

export function createArmory(initial, onChange) {
  const root = document.createElement('div');
  root.className = 'ow-armory-form';
  root.innerHTML = `
    <label>Оружие <select data-armory="weapon"></select></label>
    <label>Прицел <select data-armory="optic"></select></label>
    <label>Глушитель <select data-armory="muzzle"></select></label>
    <p class="ow-armory-note" role="status"></p>
  `;
  let state = normalizeLoadout(initial);
  const weapon = root.querySelector('[data-armory=weapon]');
  const optic = root.querySelector('[data-armory=optic]');
  const muzzle = root.querySelector('[data-armory=muzzle]');
  const sync = () => {
    addOptions(weapon, ARMORY, state.weapon);
    const entry = ARMORY.find(item => item.id === state.weapon);
    const kit = state.kits[state.weapon];
    addOptions(optic, entry.optics, kit.optic);
    addOptions(muzzle, entry.muzzles, kit.muzzle);
    optic.disabled = entry.optics.length === 1;
    muzzle.disabled = entry.muzzles.length === 1;
    root.querySelector('.ow-armory-note').textContent = optic.disabled && muzzle.disabled
      ? 'ТОЗ-34 используется со штатным прицелом, без глушителя.'
      : `${entry.category}. Прицел и глушитель сохраняются для этого оружия.`;
  };
  weapon.addEventListener('change', () => {
    state.weapon = weapon.value;
    sync();
    onChange(normalizeLoadout(state));
  });
  for (const [select, slot] of [[optic, 'optic'], [muzzle, 'muzzle']]) {
    select.addEventListener('change', () => {
      state.kits[state.weapon][slot] = select.value;
      onChange(normalizeLoadout(state));
    });
  }
  sync();
  return { root, set(value) { state = normalizeLoadout(value); sync(); } };
}

export const ARMORY_CSS = `
.ow-armory-form {display:grid;gap:12px;width:100%;font:14px/1.4 system-ui;color:#dbe7f2}
.ow-armory-form label {display:grid;gap:5px;margin:0}
.ow-armory-form select {width:100%;min-height:44px;padding:8px;border:1px solid #46708c;border-radius:6px;background:#152333;color:#f3f7fa;font:inherit}
.ow-armory-form select:disabled {opacity:.63}
.ow-armory-note {min-height:2.8em;color:#a8bfd0}
.ow-armory-dialog {margin:auto;inset:0;width:min(420px,calc(100% - 28px));max-height:calc(100dvh - 24px);padding:20px;border:1px solid #46708c;border-radius:12px;background:#101c2a;color:#f3f7fa;font:16px system-ui}
.ow-armory-dialog::backdrop {background:#030a13bd}
.ow-armory-dialog h2 {margin:0 0 14px;color:#f3f7fa;font-size:22px}
.ow-armory-dialog .ow-armory-done {width:100%;min-height:44px;margin-top:10px;border:0;border-radius:6px;background:#2f6fb5;color:#fff;font:600 14px system-ui;cursor:pointer}
.ow-fe .ow-launch {display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.ow-fe .ow-launch .ow-gear {width:auto;text-align:center}
@media(max-width:650px){.ow-fe .ow-launch{width:100%}.ow-fe .ow-launch .ow-gear{width:100%;margin:0}}
@media(max-height:500px){.ow-armory-dialog{padding:12px 16px}.ow-armory-dialog h2{margin-bottom:7px;font-size:19px}.ow-armory-form{gap:7px}.ow-armory-form label{gap:2px}.ow-armory-note{min-height:0;font-size:12px}.ow-armory-dialog .ow-armory-done{margin-top:6px}}
`;
