// Input.ts — keyboard + touch stub → InputState
export interface InputState {
  throttle: number; // 0..1 (W)
  brake: number; // 0..1 (S)
  steer: number; // -1..1 (A/D)
  handbrake: boolean;
  reset: boolean;
  cameraCycle: boolean;
  headlights: boolean;
  horn: boolean;
  pause: boolean;
  photoMode: boolean;
}

export class Input {
  state: InputState = {
    throttle: 0,
    brake: 0,
    steer: 0,
    handbrake: false,
    reset: false,
    cameraCycle: false,
    headlights: false,
    horn: false,
    pause: false,
    photoMode: false,
  };

  private keys = new Set<string>();
  private justPressed = new Set<string>();

  // For one-frame actions
  consumeCameraCycle(): boolean {
    if (this.state.cameraCycle) { this.state.cameraCycle = false; return true; }
    return false;
  }
  consumeReset(): boolean {
    if (this.state.reset) { this.state.reset = false; return true; }
    return false;
  }

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (!this.keys.has(k)) this.justPressed.add(k);
    this.keys.add(k);
    // prevent space scrolling
    if (k === ' ') e.preventDefault();

    // One-shot actions on keydown
    if (k === 'c') this.state.cameraCycle = true;
    if (k === 'r') this.state.reset = true;
    if (k === 'l') this.state.headlights = !this.state.headlights;
    if (k === 'h') this.state.horn = true;
    if (k === 'escape' || k === 'p') this.state.pause = true;
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    this.keys.delete(k);
    if (k === 'h') this.state.horn = false;
    if (k === 'escape' || k === 'p') this.state.pause = false;
  };

  // Called each frame before physics
  update() {
    // Throttle
    const w = this.keys.has('w') || this.keys.has('arrowup');
    const s = this.keys.has('s') || this.keys.has('arrowdown');
    this.state.throttle = w ? 1 : 0;
    this.state.brake = s ? 1 : 0;
    // Steer
    const a = this.keys.has('a') || this.keys.has('arrowleft');
    const d = this.keys.has('d') || this.keys.has('arrowright');
    let steer = 0;
    if (a) steer -= 1;
    if (d) steer += 1;
    this.state.steer = steer;
    this.state.handbrake = this.keys.has(' ') || this.keys.has('space');
    // keep one-shots until consumed
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }
}
