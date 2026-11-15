export const isTouchDevice = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

const CSS = `
.touch-controls{position:fixed;inset:0;z-index:15;pointer-events:none;user-select:none;-webkit-user-select:none;touch-action:none;--edge:max(16px,env(safe-area-inset-right));font:600 12px system-ui}
.touch-controls button{touch-action:none;pointer-events:auto;border:1px solid #cce2ff55;background:#111f2ca6;color:white;border-radius:50%;width:52px;height:52px;font:inherit;backdrop-filter:blur(6px);-webkit-tap-highlight-color:transparent}
.touch-controls button.active{background:#4588b7cc;border-color:#d5f2ff}
.touch-controls .touch-stick{position:absolute;bottom:max(28px,env(safe-area-inset-bottom));left:max(24px,env(safe-area-inset-left));width:124px;height:124px;border:1px solid #e1efff66;border-radius:50%;background:#12233455;pointer-events:auto;touch-action:none}
.touch-stick i{position:absolute;left:39px;top:39px;width:44px;height:44px;border-radius:50%;background:#d1e8ff88;border:1px solid #fff9;pointer-events:none}
.touch-actions{position:absolute;right:var(--edge);bottom:max(20px,env(safe-area-inset-bottom));display:grid;grid-template-columns:52px 52px 70px;gap:10px;align-items:center}
.touch-actions button{font-size:11px}
.touch-actions .touch-fire{grid-column:3;grid-row:1 / 3;width:70px;height:70px;background:#b75d3cb3;font-size:14px}
.touch-controls .touch-pause{position:absolute;right:var(--edge);top:max(16px,env(safe-area-inset-top));width:44px;height:44px;font-size:20px}
.touch-controls .touch-help{position:absolute;top:23%;right:10%;color:#fff8;font-size:11px;transition:opacity 1s;pointer-events:none}
.touch-controls.paused .touch-stick,.touch-controls.paused .touch-actions,.touch-controls.paused .touch-help{display:none}
@media(pointer:coarse){.ow-menu-inner{left:max(18px,env(safe-area-inset-left))!important;width:min(520px,calc(100vw - 36px))!important;max-height:85dvh;overflow-y:auto;padding:16px!important}.ow-row{flex-wrap:wrap;gap:12px!important}.ow-ammo{top:max(20px,env(safe-area-inset-top));right:76px;bottom:auto;transform:scale(.8);transform-origin:top right}.ow-vitals{bottom:175px;left:max(24px,env(safe-area-inset-left));transform:scale(.8);transform-origin:bottom left}.ow-minimap{width:90px!important;height:90px!important}.ow-compass{max-width:35vw!important}.ow-killfeed{top:90px!important}}
@media(orientation:portrait){.touch-actions{grid-template-columns:48px 60px;gap:8px}.touch-actions button{width:48px;height:48px}.touch-actions .touch-fire{grid-column:2;grid-row:1 / 3;width:60px;height:60px}.touch-controls .touch-stick{width:112px;height:112px}.touch-stick i{top:33px;left:33px}.touch-controls .touch-help{top:40%}}
@media(max-height:420px){.touch-actions{gap:7px}.touch-controls .touch-stick{bottom:18px}.touch-controls .touch-help{display:none}}
`;

export class TouchControls {
  constructor(input) {
    this.input = input;
    this.move = { x: 0, y: 0 };
    this.pointers = new Map();
    this.abort = new AbortController();
    this.paused = false;
    const style = document.createElement('style');
    style.textContent = CSS;
    this.style = style;
    document.head.append(style);
    const root = document.createElement('div');
    root.className = 'touch-controls';
    root.setAttribute('aria-label', 'Сенсорное управление');
    root.innerHTML = `<div class="touch-stick" role="region" aria-label="Джойстик движения"><i></i></div>
      <div class="touch-help">Проведите справа, чтобы осмотреться</div>
      <div class="touch-actions">
       <button data-key="Mouse2" aria-label="Прицелиться">Прицел</button>
       <button data-key="KeyR" aria-label="Перезарядить">↻</button>
       <button data-key="Mouse0" class="touch-fire" aria-label="Стрелять">ОГОНЬ</button>
       <button data-key="Space" aria-label="Прыжок">Прыжок</button>
       <button data-key="ControlLeft" aria-label="Присесть">Присесть</button>
       <button data-key="ShiftLeft" aria-label="Бежать">Бег</button>
       <button data-key="Digit1" aria-label="Сменить оружие">Оружие</button>
      </div><button class="touch-pause" aria-label="Пауза">Ⅱ</button>`;
    document.body.append(root);
    this.root = root;
    const listen = (el, type, fn) => el.addEventListener(type, fn, { signal: this.abort.signal, passive: false });
    for (const button of root.querySelectorAll('[data-key]')) {
      listen(button, 'pointerdown', (e) => {
        if (this.paused || !input.enabled || input.frozen) return;
        e.preventDefault(); e.stopPropagation(); button.setPointerCapture(e.pointerId);
        this.pointers.set(e.pointerId, { kind: 'button', button, key: button.dataset.key });
        button.classList.add('active'); input._pendingDown.add(button.dataset.key);
      });
    }
    listen(root.querySelector('.touch-pause'), 'pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation(); this.reset();
      input._pendingDown.add('Escape');
    });
    const stick = root.querySelector('.touch-stick');
    this.knob = stick.firstElementChild;
    listen(stick, 'pointerdown', (e) => {
      if (this.paused || input.frozen || [...this.pointers.values()].some((p) => p.kind === 'move')) return;
      e.preventDefault(); stick.setPointerCapture(e.pointerId);
      const rect = stick.getBoundingClientRect();
      this.pointers.set(e.pointerId, { kind: 'move', x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
      this.onMove(e);
    });
    listen(input.canvas, 'pointerdown', (e) => {
      if (e.pointerType !== 'touch' || this.paused || input.frozen || e.clientX < innerWidth * .35 || [...this.pointers.values()].some((p) => p.kind === 'look')) return;
      e.preventDefault(); input.canvas.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { kind: 'look', x: e.clientX, y: e.clientY });
      root.querySelector('.touch-help').style.opacity = '0';
    });
    listen(window, 'pointermove', (e) => this.onMove(e));
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(window, event, (e) => this.release(e.pointerId));
    listen(window, 'blur', () => this.reset());
    listen(document, 'visibilitychange', () => { if (document.hidden) this.reset(); });
    listen(window, 'orientationchange', () => this.reset());
  }
  onMove(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    if (p.kind === 'move') {
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      const length = Math.hypot(dx, dy), range = 43;
      const scale = length > range ? range / length : 1;
      this.move.x = dx * scale / range;
      this.move.y = -dy * scale / range;
      if (length < 7) this.move.x = this.move.y = 0;
      this.knob.style.transform = `translate(${dx * scale}px,${dy * scale}px)`;
    } else if (p.kind === 'look') {
      this.input._rawLook.x += (e.clientX - p.x) * 1.8;
      this.input._rawLook.y += (e.clientY - p.y) * 1.8;
      p.x = e.clientX; p.y = e.clientY;
    }
  }
  release(id) {
    const p = this.pointers.get(id);
    if (!p) return;
    if (p.kind === 'move') { this.move.x = this.move.y = 0; this.knob.style.transform = ''; }
    if (p.kind === 'button') { this.input._pendingUp.add(p.key); p.button.classList.remove('active'); }
    this.pointers.delete(id);
  }
  reset() {
    for (const id of this.pointers.keys()) this.release(id);
    this.input._rawLook.x = this.input._rawLook.y = 0;
    this.input._pendingUp.add('Escape');
  }
  setPaused(value) { this.paused = value; this.reset(); this.root.classList.toggle('paused', value); }
  dispose() { this.reset(); this.abort.abort(); this.root.remove(); this.style.remove(); }
}
