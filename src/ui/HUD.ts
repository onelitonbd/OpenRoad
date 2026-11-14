// HUD.ts — speedometer, gear, minimap, time/weather, messages
import type { VehicleState } from '../vehicles/Vehicle';

export class HUD {
  private root: HTMLElement;
  private speedEl!: HTMLElement;
  private gearEl!: HTMLElement;
  private rpmBar!: HTMLElement;
  private msgEl!: HTMLElement;
  private clockEl!: HTMLElement;
  private weatherEl!: HTMLElement;
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
        <div class="hud-title">OPEN ROAD <span class="hud-subtitle">Phase 6 • Low preset</span></div>
        <div class="hud-env">
          <span id="hud-clock" class="hud-clock">12:00</span>
          <span id="hud-weather" class="hud-weather">☀️</span>
        </div>
      </div>
      <div class="hud-bottom">
        <div class="speedo">
          <div class="speedo-speed"><span id="hud-speed">0</span><small>km/h</small></div>
          <div class="speedo-gear" id="hud-gear">N</div>
          <div class="rpm-bar"><div id="hud-rpm" class="rpm-fill"></div></div>
        </div>
        <div class="minimap">
          <div class="minimap-label">MINIMAP • click toggle</div>
          <canvas id="minimap-canvas" width="160" height="160"></canvas>
        </div>
      </div>
      <div id="controls-hint" class="controls-hint">
        <span>WASD drive • Space handbrake • C camera • R reset • F3 debug • F5 weather • F6 time</span>
      </div>
      <div id="hud-message" class="hud-message hidden"></div>
      <div id="debug-overlay" class="debug-overlay hidden"></div>
    `;
    this.speedEl = document.getElementById('hud-speed')!;
    this.gearEl = document.getElementById('hud-gear')!;
    this.rpmBar = document.getElementById('hud-rpm')!;
    this.msgEl = document.getElementById('hud-message')!;
    this.clockEl = document.getElementById('hud-clock')!;
    this.weatherEl = document.getElementById('hud-weather')!;
  }

  show() { this.root.style.display = 'block'; }
  hide() { this.root.style.display = 'none'; }
  setQuality(q: string) {
    const sub = this.root.querySelector('.hud-subtitle');
    if (sub) sub.textContent = `Phase 6 • ${q} preset`;
  }

  update(state: VehicleState, dt: number) {
    this.speedEl.textContent = state.speedKmh.toFixed(0);
    this.gearEl.textContent = state.gear ? `G${state.gear}` : 'N';
    const rpmPct = ((state.rpm - 900) / (7000 - 900)) * 100;
    this.rpmBar.style.width = Math.max(0, Math.min(100, rpmPct)) + '%';
    if (this.msgTimer > 0) {
      this.msgTimer -= dt * 1000;
      if (this.msgTimer <= 0) this.msgEl.classList.add('hidden');
    }
  }

  updateEnv(timeStr:string, weatherIcon:string) {
    this.clockEl.textContent = timeStr;
    this.weatherEl.textContent = weatherIcon;
  }

  showMessage(text: string, ms = 2000) {
    this.msgEl.textContent = text;
    this.msgEl.classList.remove('hidden');
    this.msgTimer = ms;
  }
}
