// TuningPanel.ts — hidden by default, key T, sliders for handling
import type { Vehicle } from '../vehicles/Vehicle';

export class TuningPanel {
  private el: HTMLElement;
  private visible = false;

  constructor(private vehicle: Vehicle) {
    const existing = document.getElementById('tuning-panel');
    if (existing) this.el = existing as HTMLElement;
    else {
      this.el = document.createElement('div');
      this.el.id = 'tuning-panel';
      this.el.className = 'tuning-panel hidden';
      document.body.appendChild(this.el);
    }
    this.build();
    window.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 't') {
        this.visible = !this.visible;
        this.el.classList.toggle('hidden', !this.visible);
      }
    });
  }

  private build() {
    this.el.innerHTML = `
      <div class="tuning-header">Tuning — live handling <small>(T to toggle)</small></div>
      <label>Engine <span id="t-eng">1.00</span><input id="sl-eng" type="range" min="0.4" max="1.6" step="0.05" value="1"></label>
      <label>Grip <span id="t-grip">1.00</span><input id="sl-grip" type="range" min="0.5" max="1.5" step="0.05" value="1"></label>
      <label>Steer <span id="t-steer">1.00</span><input id="sl-steer" type="range" min="0.6" max="1.4" step="0.05" value="1"></label>
      <label>Suspension Stiffness <span id="t-stiff">22</span><input id="sl-stiff" type="range" min="10" max="45" step="1" value="22"></label>
      <div class="tuning-hint">Adjust live. Defaults match Comet GT spec. Reset with page reload.</div>
    `;
    const bind = (sliderId: string, valueId: string, key: 'engineScale'|'gripScale'|'steerScale') => {
      const sl = document.getElementById(sliderId) as HTMLInputElement;
      const val = document.getElementById(valueId) as HTMLElement;
      sl.addEventListener('input', () => {
        const v = parseFloat(sl.value);
        val.textContent = v.toFixed(2);
        this.vehicle.applyTuning(key, v);
      });
    };
    bind('sl-eng', 't-eng', 'engineScale');
    bind('sl-grip', 't-grip', 'gripScale');
    bind('sl-steer', 't-steer', 'steerScale');

    // Suspension live tweak for advanced — affects controller if physics active
    const stiffSl = document.getElementById('sl-stiff') as HTMLInputElement;
    const stiffVal = document.getElementById('t-stiff') as HTMLElement;
    stiffSl.addEventListener('input', () => {
      const v = parseFloat(stiffSl.value);
      stiffVal.textContent = v.toFixed(0);
      const veh = this.vehicle as unknown as { controller: { setWheelSuspensionStiffness: (i:number, v:number)=>void } | null, config: { suspension: { stiffness:number } } };
      if (veh.controller) {
        for (let i=0;i<4;i++) veh.controller.setWheelSuspensionStiffness(i, v * 5);
      }
      veh.config.suspension.stiffness = v;
    });
  }

  update() {
    // no per-frame needed
  }
}
