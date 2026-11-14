/**
 * Heads-up display: speedometer, gear and the RPM bar.
 *
 * The HUD is plain DOM (no canvas) because text is crisper that way and the
 * browser can lay it out for us. Only the minimap needs a canvas.
 */
export interface HudData {
  /** Forward speed in km/h. */
  speedKmh: number;
  /** Current gear: 0 = reverse, 1..N = forward, -1 = neutral. */
  gear: number;
  /** Engine RPM normalised to 0..1 of the redline. */
  rpmRatio: number;
}

export class HUD {
  readonly root: HTMLDivElement;

  private speedValue!: HTMLDivElement;
  private gearEl!: HTMLDivElement;
  private rpmFill!: HTMLDivElement;
  private toastEl!: HTMLDivElement;
  private toastTimer = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'hud';

    // --- speedometer ---
    const speedo = document.createElement('div');
    speedo.className = 'hud-speedometer';
    const inner = document.createElement('div');
    inner.style.textAlign = 'center';
    this.speedValue = document.createElement('div');
    this.speedValue.className = 'hud-speed-value';
    this.speedValue.textContent = '0';
    const unit = document.createElement('div');
    unit.className = 'hud-speed-unit';
    unit.textContent = 'km/h';
    inner.append(this.speedValue, unit);
    speedo.appendChild(inner);
    this.root.appendChild(speedo);

    // --- gear ---
    this.gearEl = document.createElement('div');
    this.gearEl.className = 'hud-gear';
    this.gearEl.textContent = 'N';
    this.root.appendChild(this.gearEl);

    // --- rpm bar ---
    const rpm = document.createElement('div');
    rpm.className = 'hud-rpm';
    this.rpmFill = document.createElement('div');
    this.rpmFill.className = 'hud-rpm-fill';
    rpm.appendChild(this.rpmFill);
    this.root.appendChild(rpm);

    // --- controls hint ---
    const hint = document.createElement('div');
    hint.className = 'hud-hint';
    hint.innerHTML =
      'W/S throttle &amp; brake &middot; A/D steer &middot; SPACE handbrake<br />C camera &middot; R reset &middot; L lights &middot; H horn &middot; F3 debug';
    this.root.appendChild(hint);

    // --- toast messages ---
    this.toastEl = document.createElement('div');
    this.toastEl.className = 'hud-toast';
    this.root.appendChild(this.toastEl);

    parent.appendChild(this.root);
  }

  update(data: HudData): void {
    const speed = Math.max(0, Math.round(data.speedKmh));
    if (this.speedValue.textContent !== String(speed)) {
      this.speedValue.textContent = String(speed);
    }

    const gearText =
      data.gear < 0 ? 'R' : data.gear === 0 ? 'N' : String(data.gear);
    if (this.gearEl.textContent !== gearText) {
      this.gearEl.textContent = gearText;
    }

    const pct = Math.max(0, Math.min(1, data.rpmRatio)) * 100;
    this.rpmFill.style.width = `${pct.toFixed(1)}%`;
  }

  /** Show a short message in the middle of the screen. */
  showToast(message: string, duration = 2): void {
    this.toastEl.textContent = message;
    this.toastEl.classList.add('show');
    this.toastTimer = duration;
  }

  updateTimers(dt: number): void {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.remove('show');
    }
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle('hidden', !visible);
  }

  dispose(): void {
    this.root.remove();
  }
}
