import type { Vehicle } from '../vehicles/Vehicle';

/**
 * Developer tuning panel (toggle with T).
 *
 * Sliders write straight into `vehicle.tuning`, so the handling can be
 * changed while driving. This is the tool used to find the good feeling for
 * the cars during Phase 1.
 */
export class TuningPanel {
  readonly root: HTMLDivElement;

  private visible = false;
  private readonly inputs = new Map<string, HTMLInputElement>();
  private readonly values = new Map<string, HTMLSpanElement>();
  private vehicle: Vehicle | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'tuning-panel panel hidden';

    const title = document.createElement('h3');
    title.textContent = 'Tuning (T to hide)';
    this.root.appendChild(title);

    this.addSlider('engine', 'Engine force', 0.2, 3, 0.05, 1);
    this.addSlider('steer', 'Steering', 0.3, 2, 0.05, 1);
    this.addSlider('grip', 'Tyre grip', 0.2, 2, 0.05, 1);
    this.addSlider('downforce', 'Downforce', 0, 3, 0.1, 1);
    this.addSlider('brake', 'Brake force', 0.2, 2.5, 0.05, 1);
    this.addSlider('stability', 'Stability assist', 0, 1, 0.05, 0.35);

    parent.appendChild(this.root);
  }

  private addSlider(
    key: string,
    label: string,
    min: number,
    max: number,
    step: number,
    initial: number,
  ): void {
    const row = document.createElement('div');
    row.className = 'stat-row';

    const name = document.createElement('span');
    name.textContent = label;

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(initial);
    input.style.flex = '1';

    const value = document.createElement('span');
    value.className = 'setting-value';
    value.textContent = initial.toFixed(2);

    input.addEventListener('input', () => {
      const v = Number(input.value);
      value.textContent = v.toFixed(2);
      this.apply(key, v);
    });

    row.append(name, input, value);
    this.root.appendChild(row);
    this.inputs.set(key, input);
    this.values.set(key, value);
  }

  private apply(key: string, value: number): void {
    const vehicle = this.vehicle;
    if (!vehicle) return;
    switch (key) {
      case 'engine':
        vehicle.tuning.engine = value;
        break;
      case 'steer':
        vehicle.tuning.steer = value;
        break;
      case 'grip':
        vehicle.tuning.grip = value;
        break;
      case 'downforce':
        vehicle.tuning.downforce = value;
        break;
      case 'brake':
        vehicle.tuning.brake = value;
        break;
      case 'stability':
        vehicle.tuning.stability = value;
        break;
      default:
        break;
    }
  }

  /** Attach the panel to a vehicle so the sliders can drive its tuning. */
  attach(vehicle: Vehicle): void {
    this.vehicle = vehicle;
    const t = vehicle.tuning;
    this.setValue('engine', t.engine);
    this.setValue('steer', t.steer);
    this.setValue('grip', t.grip);
    this.setValue('downforce', t.downforce);
    this.setValue('brake', t.brake);
    this.setValue('stability', t.stability);
  }

  private setValue(key: string, value: number): void {
    const input = this.inputs.get(key);
    const label = this.values.get(key);
    if (input) input.value = String(value);
    if (label) label.textContent = value.toFixed(2);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.root.classList.toggle('hidden', !this.visible);
  }

  get isVisible(): boolean {
    return this.visible;
  }
}
