/**
 * Keyboard + touch input, normalised into a single `InputState`.
 *
 * Game logic never looks at raw key codes - it only reads the state object.
 * That keeps input separate from the simulation (important for the future
 * multiplayer work) and makes touch controls a drop-in replacement.
 */

export interface InputState {
  /** 0..1 throttle. */
  throttle: number;
  /** 0..1 brake. */
  brake: number;
  /** -1 (left) .. 1 (right). */
  steer: number;
  /** True while the handbrake is held. */
  handbrake: boolean;
  /** 0..1 of the reverse pedal. */
  reverse: number;
}

export type ActionName =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'reverse'
  | 'handbrake'
  | 'camera'
  | 'reset'
  | 'headlights'
  | 'horn'
  | 'pause'
  | 'photo'
  | 'debug'
  | 'tuning'
  | 'minimap'
  | 'menu';

const KEY_MAP: Record<string, ActionName> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  KeyX: 'reverse',
  Space: 'handbrake',
};

export class Input {
  readonly state: InputState = {
    throttle: 0,
    brake: 0,
    steer: 0,
    handbrake: false,
    reverse: 0,
  };

  private held = new Set<ActionName>();
  /** Actions that were pressed since the last `endFrame()` call. */
  private pressed = new Set<ActionName>();
  /** Touch overrides - the on-screen buttons set these directly. */
  private touch = new Set<ActionName>();
  /** Steering from the touch screen (-1 .. 1), null when there is none. */
  private analogSteer: number | null = null;

  /** True when the player used a touch screen (shows the touch UI). */
  isTouchDevice = false;

  /** Called the first time the player touches the screen. */
  onTouchDetected: (() => void) | null = null;

  private onKeyDown = (e: KeyboardEvent): void => {
    const action = KEY_MAP[e.code];
    if (action) {
      this.held.add(action);
      e.preventDefault();
    }
    switch (e.code) {
      case 'KeyC':
        this.pressed.add('camera');
        break;
      case 'KeyR':
        this.pressed.add('reset');
        break;
      case 'KeyL':
        this.pressed.add('headlights');
        break;
      case 'KeyH':
        this.pressed.add('horn');
        break;
      case 'Escape':
        this.pressed.add('pause');
        break;
      case 'KeyP':
        this.pressed.add('photo');
        break;
      case 'F3':
        this.pressed.add('debug');
        e.preventDefault();
        break;
      case 'KeyT':
        this.pressed.add('tuning');
        break;
      case 'KeyM':
        this.pressed.add('minimap');
        break;
      case 'Enter':
        this.pressed.add('menu');
        break;
      default:
        break;
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    const action = KEY_MAP[e.code];
    if (action) {
      this.held.delete(action);
      e.preventDefault();
    }
  };

  private onBlur = (): void => {
    this.held.clear();
    this.touch.clear();
    this.analogSteer = null;
  };

  constructor() {
    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp, { passive: false });
    window.addEventListener('blur', this.onBlur);
    window.addEventListener(
      'touchstart',
      () => {
        if (this.isTouchDevice) return;
        this.isTouchDevice = true;
        this.onTouchDetected?.();
      },
      { once: true, passive: true },
    );
  }

  /** True while the action is held (keyboard or touch). */
  isDown(action: ActionName): boolean {
    return this.held.has(action) || this.touch.has(action);
  }

  /** True only on the frame the action was pressed. */
  wasPressed(action: ActionName): boolean {
    return this.pressed.has(action);
  }

  /** Touch buttons call this to hold an action down. */
  setTouch(action: ActionName, down: boolean): void {
    if (down) {
      this.touch.add(action);
      this.pressed.add(action);
    } else {
      this.touch.delete(action);
    }
  }

  /**
   * The steering of the touch screen (-1 = left, 1 = right).
   * `null` means the finger is not on the screen.
   */
  setAnalogSteer(value: number | null): void {
    this.analogSteer = value === null ? null : Math.max(-1, Math.min(1, value));
  }

  /** Called once per frame after the game has read the pressed actions. */
  endFrame(): void {
    this.pressed.clear();
    this.updateState();
  }

  /** Rebuild the analogue state from the raw key/touch flags. */
  private updateState(): void {
    const forward = this.isDown('forward') ? 1 : 0;
    const back = this.isDown('back') ? 1 : 0;
    const left = this.isDown('left') ? 1 : 0;
    const right = this.isDown('right') ? 1 : 0;
    this.state.throttle = forward;
    this.state.brake = back;
    // The touch screen steers with an analogue value, the keyboard with
    // two buttons - they can be mixed.
    const digital = right - left;
    this.state.steer =
      this.analogSteer === null
        ? digital
        : Math.max(-1, Math.min(1, this.analogSteer + digital));
    this.state.handbrake = this.isDown('handbrake');
    // The reverse is a pedal of its own. The brake only ever brakes.
    this.state.reverse = this.isDown('reverse') ? 1 : 0;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }
}
