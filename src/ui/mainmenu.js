import { isTouchDevice } from '../core/touch.js';
import { createArmory, ARMORY_CSS } from './armory.js';
import { ARMORY, readLoadout, saveLoadout } from '../weapons/loadout.js';
/**
 * Front end — the menu that is on screen BEFORE any 3D exists.
 *
 * This is plain DOM on purpose. Nothing here touches THREE, the engine, the
 * renderer or a WebGL context, so it paints on the browser's first frame while
 * the ~12-25 s of procedural generation and shader compilation has not started
 * yet. Booting the engine first and drawing a menu afterwards is what produced
 * the "black screen for half a minute and then a frozen tab" experience.
 *
 * THE LOADING BAR IS ANIMATED WITH `transform`, DELIBERATELY.
 * Level build and shader translation block the main thread solid — a bar driven
 * by rAF or by width/left would freeze at its first frame and look hung. A CSS
 * animation on `transform` runs on the compositor, so it keeps moving while the
 * main thread is wedged. It is an indeterminate barber-pole rather than a real
 * percentage for the same reason: progress callbacks cannot be delivered from a
 * thread that is not running.
 */

export const MAPS = [
  {
    id: 'street',
    name: 'Рыночная улица',
    blurb: 'Большой квартал, открытые улицы и интерьеры.',
  },
  {
    id: 'swat',
    name: 'Тренировочный комплекс',
    blurb: 'Ближний бой. Рекомендуется для телефона.',
  },
  {
    id: 'box',
    name: 'Арена',
    blurb: 'Минималистичная площадка для тренировки.',
  },
];

export const MODES = [
  { id: 'tdm', name: 'Бой с ботами', blurb: 'Два отряда противника. Держите позицию.' },
  { id: 'sandbox', name: 'Свободная тренировка', blurb: 'Без противников. Изучайте карту и оружие.' },
];

const CSS = `
${ARMORY_CSS}
.ow-fe{position:fixed;inset:0;z-index:50;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:2.2rem;
  background:radial-gradient(120% 90% at 50% 0%,#243040 0%,#0d1116 60%,#05070a 100%);
  color:#e8eaed;font:400 15px/1.5 "Inter","Helvetica Neue",Arial,sans-serif;
  letter-spacing:.02em;user-select:none}
.ow-fe h1{font-size:clamp(28px,5vw,54px);font-weight:700;letter-spacing:.14em;
  text-transform:uppercase;color:#fff;text-shadow:0 2px 30px rgba(90,160,255,.25)}
.ow-fe h1 span{display:block;font-size:.28em;letter-spacing:.42em;font-weight:400;
  color:#7d8896;margin-top:.6em}
.ow-fe .ow-cols{display:flex;gap:2.5rem;flex-wrap:wrap;justify-content:center}
.ow-fe .ow-col{min-width:270px}
.ow-fe h2{font-size:11px;letter-spacing:.28em;text-transform:uppercase;
  color:#6f7a88;margin-bottom:.85rem;font-weight:600}
.ow-fe button{display:block;width:100%;text-align:left;margin-bottom:.5rem;
  padding:.7rem .9rem;border:1px solid #2a3442;border-radius:6px;
  background:#151b23;color:#c9d1d9;cursor:pointer;font:inherit;
  transition:border-color .12s,background .12s}
.ow-fe button:hover{background:#1c242e;border-color:#3d4c60}
.ow-fe button[aria-pressed="true"]{background:#1d2b3d;border-color:#5b8ec9;color:#fff}
.ow-fe button b{display:block;font-weight:600;font-size:14px}
.ow-fe button i{display:block;font-style:normal;font-size:11.5px;color:#78828f;margin-top:.15rem}
.ow-fe .ow-play{width:auto;padding:.85rem 3.4rem;text-align:center;font-weight:700;
  letter-spacing:.2em;text-transform:uppercase;background:#2f6fb5;border-color:#4d8ad0;color:#fff}
.ow-fe .ow-play:hover{background:#3b82cf}
.ow-fe .ow-foot{font-size:11px;color:#5b6472}
.ow-load{gap:1.4rem}
.ow-load .ow-bar{width:min(420px,70vw);height:3px;background:#1b222c;overflow:hidden;border-radius:2px}
.ow-load .ow-bar i{display:block;height:100%;width:38%;border-radius:2px;
  background:linear-gradient(90deg,transparent,#5b9ae0,transparent);
  animation:ow-slide 1.15s linear infinite}
@keyframes ow-slide{from{transform:translateX(-110%)}to{transform:translateX(370%)}}
.ow-load .ow-what{font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:#6f7a88}

.ow-fe{overflow-y:auto;overscroll-behavior:contain;padding:max(24px,env(safe-area-inset-top)) max(20px,env(safe-area-inset-right)) max(24px,env(safe-area-inset-bottom)) max(20px,env(safe-area-inset-left))}
.ow-fe button{min-height:48px;touch-action:manipulation}
.ow-fe .ow-col{width:300px;max-width:100%;min-width:0}
.ow-fe .ow-foot{text-align:center;max-width:620px;line-height:1.8;color:#8c9aab}
.ow-fe .ow-fullscreen{background:transparent;border:0;width:auto;min-height:36px;text-align:center;font-size:12px;color:#a5c7e9;margin:0}
.ow-fe .ow-device{font-size:10px;text-transform:uppercase;letter-spacing:.2em;color:#8eb2d9}
.ow-fe .ow-quality{display:flex;align-items:center;gap:8px;color:#a5c7e9;font-size:12px}
.ow-quality select{padding:6px;background:#151b23;color:#fff;border:1px solid #3d4c60;border-radius:4px;font:inherit}
.ow-menu-inner{max-height:90dvh!important;overflow-y:auto!important;max-width:calc(100vw - 24px)!important;overscroll-behavior:contain}
@media(max-width:650px){.ow-fe{justify-content:flex-start;gap:20px}.ow-fe h1{margin-top:10px;font-size:32px}.ow-fe .ow-cols{width:100%;gap:14px}.ow-fe .ow-col{width:100%}.ow-fe button{padding:11px 14px}.ow-fe h2{margin-bottom:8px}.ow-fe .ow-play{width:100%;margin:0}.ow-fe .ow-foot{font-size:11px}.ow-fe .ow-device{font-size:9px}}
@media(max-height:500px) and (min-width:651px){.ow-fe{gap:10px;padding:16px;justify-content:flex-start}.ow-fe h1{font-size:24px}.ow-fe h1 span{display:none}.ow-fe .ow-cols{gap:20px}.ow-fe h2{margin-bottom:6px}.ow-fe button{padding:7px 12px;margin-bottom:5px;min-height:44px}.ow-fe .ow-play{padding:9px 40px}.ow-fe .ow-foot{font-size:10px}.ow-fe .ow-fullscreen{position:absolute;right:20px;top:12px}}
@media(pointer:coarse){.ow-menu button{min-height:44px}.ow-menu input[type=range]{min-height:36px}}
`;

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/**
 * Paint the menu and resolve with the player's choice once they hit Play.
 * @param {{map?:string, mode?:string, quality?:string, fixedQuality?:boolean}} initial
 */
export function showMainMenu(initial = {}) {
  // The menu is re-shown after every Exit, and a <style> per visit would pile
  // identical sheets into <head> for as long as the session lasts.
  if (!document.getElementById('ow-fe-style')) {
    const style = document.createElement('style');
    style.id = 'ow-fe-style';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  const touch = isTouchDevice();
  let map = MAPS.some((m) => m.id === initial.map) ? initial.map : touch ? 'swat' : MAPS[0].id;
  let mode = MODES.some((m) => m.id === initial.mode) ? initial.mode : MODES[0].id;
  let loadout = readLoadout();

  const list = (items, sel) =>
    items
      .map(
        (o) =>
          `<button type="button" data-id="${o.id}" aria-pressed="${o.id === sel}">
             <b>${o.name}</b><i>${o.blurb}</i>
           </button>`
      )
      .join('');

  const root = el(`
    <div class="ow-fe" role="main" aria-label="Главное меню">
      <h1>Tactical Ops<span>Ваша следующая операция</span></h1>
      <div class="ow-device">${touch ? 'Сенсорное управление · Лёгкая графика' : 'Клавиатура и мышь · 3D в браузере'}</div>
      <div class="ow-cols">
        <div class="ow-col" id="ow-maps"><h2>Карта</h2>${list(MAPS, map)}</div>
        <div class="ow-col" id="ow-modes"><h2>Режим игры</h2>${list(MODES, mode)}</div>
      </div>
      ${touch || initial.fixedQuality ? '' : '<label class="ow-quality">Графика <select aria-label="Графика"><option value="performance">Быстрый запуск</option><option value="low">Детальная</option></select></label>'}
      <div class="ow-launch">
        <button type="button" class="ow-gear">Арсенал</button>
        <button type="button" class="ow-play">Начать операцию</button>
      </div>
      <div class="ow-foot">${touch ? 'Джойстик слева — движение · Свайп справа — обзор<br>Для удобства поверните телефон горизонтально.' : 'WASD — движение · Мышь — прицел · R — перезарядка · 1–5 — оружие · Esc — пауза'}</div>
      <button type="button" class="ow-fullscreen">На весь экран ↗</button>
    </div>
  `);
  document.body.appendChild(root);
  const gear = root.querySelector('.ow-gear');
  const summary = () => {
    gear.textContent = 'Арсенал · ' + ARMORY.find(w => w.id === loadout.weapon).label;
  };
  summary();
  const dialog = el('<dialog class="ow-armory-dialog" aria-labelledby="ow-armory-title"><h2 id="ow-armory-title">Арсенал</h2></dialog>');
  const armory = createArmory(loadout, value => { loadout = saveLoadout(value); summary(); });
  const done = el('<button type="button" class="ow-armory-done">Готово</button>');
  dialog.append(armory.root, done);
  document.body.appendChild(dialog);
  gear.addEventListener('click', () => dialog.showModal());
  done.addEventListener('click', () => dialog.close());
  const quality = root.querySelector('.ow-quality select');
  if (quality) quality.value = initial.quality === 'low' ? 'low' : 'performance';
  const full = root.querySelector(".ow-fullscreen");
  if (!document.documentElement.requestFullscreen) full.hidden = true;
  full.addEventListener("click", () => document.documentElement.requestFullscreen?.().catch(() => {}));

  const pick = (container, onPick) => {
    container.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-id]');
      if (!b) return;
      for (const other of container.querySelectorAll('button[data-id]')) {
        other.setAttribute('aria-pressed', String(other === b));
      }
      onPick(b.dataset.id);
    });
  };
  pick(root.querySelector('#ow-maps'), (id) => (map = id));
  pick(root.querySelector('#ow-modes'), (id) => (mode = id));

  return new Promise((resolve) => {
    const go = () => {
      removeEventListener("keydown", onKey);
      dialog.remove();
      root.remove();
      resolve({ map, mode, quality: quality?.value, loadout });
    };
    root.querySelector('.ow-play').addEventListener('click', go);
    const onKey = (e) => { if (e.key === 'Enter' && !dialog.open && root.isConnected && !['BUTTON', 'SELECT'].includes(e.target.tagName)) go(); };
    // Enter plays with whatever is selected.
    addEventListener('keydown', onKey);
  });
}

/** Full-screen loading state. Returns a handle with `.done()`. */
export function showLoading(mapName) {
  const root = el(`
    <div class="ow-fe ow-load">
      <div class="ow-what">Загрузка: ${mapName}</div>
      <div class="ow-bar"><i></i></div>
      <div class="ow-foot">Загружаем готовые ресурсы и подготавливаем графику.<br>Повторный запуск использует кеш браузера.</div>
    </div>
  `);
  document.body.appendChild(root);
  return {
    /** Fraction 0..1. Purely advisory; the bar also animates on its own. */
    setProgress(value) {
      const f = Math.max(0, Math.min(1, Number(value) || 0));
      const i = root.querySelector('.ow-bar > i');
      if (i) i.style.setProperty('--p', String(f));
    },
    done() {
      root.remove();
    },
  };
}
