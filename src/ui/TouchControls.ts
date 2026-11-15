import { ActionName, Input } from '../core/Input';
import { isFullscreen } from '../core/Mobile';

/**
 * The on-screen controls for phones and tablets.
 *
 * The layout is made for a landscape phone:
 *
 * - bottom left: the steering buttons and a drag area that steers like a
 *   wheel (drag left or right from the spot you touched),
 * - bottom right: the gas and the brake pedal plus the handbrake,
 * - top left: the small buttons (camera, lights, horn, reset, pause and
 *   full screen).
 *
 * Every button uses pointer events with a pointer capture, so the player
 * can hold the gas and steer at the same time.
 */

export interface TouchControlsOptions {
  /** The input the buttons write into. */
  input: Input;
  /** Called when the full screen button is pressed. */
  onFullscreen?: () => void;
  /** Called when the pause button is pressed. */
  onPause?: () => void;
}

interface ActionButton {
  /** Held down (gas, brake) or pressed once (camera). */
  hold: boolean;
  action: ActionName;
  label: string;
  title: string;
  className: string;
}

const ACTION_BUTTONS: ActionButton[] = [
  { hold: false, action: 'camera', label: 'CAM', title: 'Change the camera', className: 'small-action' },
  { hold: false, action: 'headlights', label: 'LGT', title: 'Head lights', className: 'small-action' },
  { hold: false, action: 'horn', label: 'HORN', title: 'Horn', className: 'small-action' },
  { hold: false, action: 'reset', label: 'RST', title: 'Put the car back on the road', className: 'small-action' },
  { hold: false, action: 'pause', label: 'II', title: 'Pause', className: 'small-action' },
];

export class TouchControls {
  readonly root: HTMLDivElement;

  private readonly input: Input;
  private readonly options: TouchControlsOptions;
  private steerDot!: HTMLDivElement;
  private fullscreenButton!: HTMLButtonElement;
  private steerPointer = -1;
  private steerStartX = 0;

  constructor(parent: HTMLElement, options: TouchControlsOptions) {
    this.input = options.input;
    this.options = options;

    this.root = document.createElement('div');
    this.root.className = 'touch-controls';

    // The drag area that steers the car (the whole left half).
    const zone = document.createElement('div');
    zone.className = 'touch-steer-zone';
    this.root.appendChild(zone);

    // The little dot that shows where the finger steers from.
    this.steerDot = document.createElement('div');
    this.steerDot.className = 'touch-steer-dot';
    this.root.appendChild(this.steerDot);

    // The small buttons in the top left corner.
    const actions = document.createElement('div');
    actions.className = 'touch-actions';
    for (const spec of ACTION_BUTTONS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `touch-btn ${spec.className}`;
      button.textContent = spec.label;
      button.title = spec.title;
      if (spec.hold) this.bindHold(button, spec.action);
      else this.bindPress(button, spec.action);
      actions.appendChild(button);
    }

    // The full screen button. It is the one the phone players need first:
    // without it the browser bars take a third of the screen.
    this.fullscreenButton = document.createElement('button');
    this.fullscreenButton.type = 'button';
    this.fullscreenButton.className = 'touch-btn small-action touch-fullscreen';
    this.fullscreenButton.textContent = 'FULL';
    this.fullscreenButton.title = 'Full screen';
    this.fullscreenButton.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.options.onFullscreen?.();
    });
    actions.appendChild(this.fullscreenButton);
    this.root.appendChild(actions);

    // The steering buttons in the bottom left corner.
    const steer = document.createElement('div');
    steer.className = 'touch-steer-buttons';
    const left = this.makeButton('◀', 'Steer left', 'left', 'left');
    const right = this.makeButton('▶', 'Steer right', 'right', 'right');
    steer.append(left, right);
    this.root.appendChild(steer);

    // The pedals in the bottom right corner.
    const pedals = document.createElement('div');
    pedals.className = 'touch-pedals';
    const handbrake = this.makeButton('HAND<br>BRAKE', 'Handbrake', 'handbrake', 'handbrake');
    const brake = this.makeButton('BRAKE', 'Brake and reverse', 'brake', 'back');
    const gas = this.makeButton('GAS', 'Accelerate', 'throttle', 'forward');
    pedals.append(handbrake, brake, gas);
    this.root.appendChild(pedals);

    parent.appendChild(this.root);

    this.bindSteerZone(zone);
    this.updateFullscreenButton();
    document.addEventListener('fullscreenchange', this.updateFullscreenButton);
  }

  /** Show or hide the whole control panel. */
  setVisible(visible: boolean): void {
    this.root.classList.toggle('hidden', !visible);
  }

  /** True while the page is full screen. */
  get fullscreen(): boolean {
    return isFullscreen();
  }

  private makeButton(
    label: string,
    title: string,
    className: string,
    action?: ActionName,
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `touch-btn ${className}`;
    button.innerHTML = label;
    button.title = title;
    if (action) this.bindHold(button, action);
    return button;
  }

  /** A button that is held down (gas, brake, steering). */
  private bindHold(button: HTMLElement, action: ActionName): void {
    const release = (event: PointerEvent): void => {
      button.classList.remove('active');
      this.input.setTouch(action, false);
      if (button.hasPointerCapture?.(event.pointerId)) {
        button.releasePointerCapture(event.pointerId);
      }
    };

    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      // The capture keeps the button pressed when the finger slides off it.
      try {
        button.setPointerCapture?.(event.pointerId);
      } catch {
        // A pointer that is already gone - the button still works.
      }
      button.classList.add('active');
      this.input.setTouch(action, true);
    });
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
    button.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  /** A button that fires once (camera, reset, ...). */
  private bindPress(button: HTMLElement, action: ActionName): void {
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      button.classList.add('active');
      // Setting the action down and up again leaves the "pressed" flag for
      // exactly one frame, which is what the game looks for.
      this.input.setTouch(action, true);
      this.input.setTouch(action, false);
      window.setTimeout(() => button.classList.remove('active'), 120);
    });
    button.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  /**
   * The drag area: touch somewhere on the left half and pull the finger to
   * the left or right to steer. The car steers towards the finger.
   */
  private bindSteerZone(zone: HTMLElement): void {
    const radius = (): number => Math.max(60, zone.clientWidth * 0.22);

    zone.addEventListener('pointerdown', (event) => {
      if (this.steerPointer !== -1) return;
      event.preventDefault();
      this.steerPointer = event.pointerId;
      this.steerStartX = event.clientX;
      try {
        zone.setPointerCapture?.(event.pointerId);
      } catch {
        // A pointer that is already gone - the drag still works.
      }
      this.input.setAnalogSteer(0);
      this.showSteerDot(event.clientX, event.clientY);
    });

    zone.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this.steerPointer) return;
      const delta = event.clientX - this.steerStartX;
      const dead = 12;
      const span = Math.max(1, radius() - dead);
      let value = 0;
      if (Math.abs(delta) > dead) {
        value = (Math.sign(delta) * Math.min(1, (Math.abs(delta) - dead) / span));
      }
      this.input.setAnalogSteer(value);
      this.showSteerDot(event.clientX, event.clientY);
    });

    const stop = (event: PointerEvent): void => {
      if (event.pointerId !== this.steerPointer) return;
      this.steerPointer = -1;
      this.input.setAnalogSteer(null);
      this.hideSteerDot();
    };
    zone.addEventListener('pointerup', stop);
    zone.addEventListener('pointercancel', stop);
    zone.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  private showSteerDot(x: number, y: number): void {
    this.steerDot.style.display = 'block';
    this.steerDot.style.left = `${x}px`;
    this.steerDot.style.top = `${y}px`;
  }

  private hideSteerDot(): void {
    this.steerDot.style.display = 'none';
  }

  private updateFullscreenButton = (): void => {
    this.fullscreenButton.classList.toggle('active', isFullscreen());
    this.fullscreenButton.title = isFullscreen() ? 'Leave the full screen' : 'Full screen';
  };

  dispose(): void {
    document.removeEventListener('fullscreenchange', this.updateFullscreenButton);
    this.root.remove();
  }
}
