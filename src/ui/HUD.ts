// HUD.ts — speedometer, gear, minimap placeholder, messages
import type { VehicleState } from '../vehicles/Vehicle';

export class HUD {
  private root: HTMLElement;
  private speedEl!: HTMLElement;
  private gearEl!: HTMLElement;
  private rpmBar!: HTMLElement;
  private msgEl!: HTMLElement;
  private msgTimer = 0;

  constructor() {
    const existing = document.getElementById('hud');
    if (existing) this.root = existing as HTMLElement;
    else {
      this.root = document.createElement('div');
      this.root.id = 'hud';
      this.root.className = 'hud';
      document.getElementById('ui-root')!.appendChild(this.root);
    }
    this.build();
  }

  private build() {
    this.root.innerHTML = `
      <div class="hud-top">
        <div class="hud-title">OPEN ROAD <span class="hud-subtitle">Phase 0 • Low preset</span></div>
        <div class="hud-clock" id="hud-clock">12:00</div>
      </div>
      <div class="hud-bottom">
        <div class="speedo">
          <div class="speedo-speed"><span id="hud-speed">0</span><small>km/h</small></div>
          <div class="speedo-gear" id="hud-gear">N</div>
          <div class="rpm-bar"><div id="hud-rpm" class="rpm-fill"></div></div>
        </div>
        <div class="minimap placeholder">
          <div class="minimap-label">MINIMAP — Phase 4</div>
          <canvas id="minimap-canvas" width="160" height="160"></canvas>
        </div>
      </div>
      <div id="controls-hint" class="controls-hint">
        <span>WASD / Arrows to drive • Space handbrake • C camera • R reset • F3 debug</span>
      </div>
      <div id="hud-message" class="hud-message hidden"></div>
      <div id="debug-overlay" class="debug-overlay hidden"></div>
    `;
    this.speedEl = document.getElementById('hud-speed')!;
    this.gearEl = document.getElementById('hud-gear')!;
    this.rpmBar = document.getElementById('hud-rpm')!;
    this.msgEl = document.getElementById('hud-message')!;
  }

  show() { this.root.style.display = 'block'; }
  hide() { this.root.style.display = 'none'; }
  setQuality(q: string) {
    const sub = this.root.querySelector('.hud-subtitle');
    if (sub) sub.textContent = `Phase 0 • ${q} preset`;
  }

  update(state: VehicleState, dt: number) {
    this.speedEl.textContent = state.speedKmh.toFixed(0);
    this.gearEl.textContent = state.gear ? `G${state.gear}` : 'N';
    const rpmPct = ((state.rpm - 900) / (7000 - 900)) * 100;
    this.rpmBar.style.width = Math.max(0, Math.min(100, rpmPct)) + '%';
    // clock tick (static for Phase 0)
    const clock = document.getElementById('hud-clock');
    if (clock) {
      const d = new Date();
      clock.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (this.msgTimer > 0) {
      this.msgTimer -= dt * 1000;
      if (this.msgTimer <= 0) this.msgEl.classList.add('hidden');
    }
  }

  showMessage(text: string, ms = 2000) {
    this.msgEl.textContent = text;
    this.msgEl.classList.remove('hidden');
    this.msgTimer = ms;
  }
}
