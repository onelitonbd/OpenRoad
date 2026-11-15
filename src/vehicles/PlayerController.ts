import type { InputState } from '../core/Input';
import type { Vehicle } from './Vehicle';
import { clamp, moveTowards } from '../utils/math';

/**
 * Turns the raw input state into vehicle controls.
 *
 * Keeping this separate from the vehicle means the AI controllers can reuse
 * the exact same physics without any player specific logic.
 */
export class PlayerController {
  /** True while the car is driving backwards. */
  reversing = false;
  /** True while the handbrake is held. */
  drifting = false;

  /** Smoothed steering value (keyboard input is digital, the car is analog). */
  private steerValue = 0;

  /** Map the input state onto the vehicle. */
  apply(input: InputState, vehicle: Vehicle, dt: number): void {
    // Ramp the steering so a tap of the key is a small input and a held key
    // is a full turn. The ramp is faster when turning back to centre.
    const target = clamp(input.steer, -1, 1);
    const rate = Math.sign(target) === Math.sign(this.steerValue) || target === 0 ? 2.6 : 5.0;
    this.steerValue = moveTowards(this.steerValue, target, rate * dt);

    this.reversing = vehicle.currentGear < 0;
    this.drifting = input.handbrake;

    vehicle.setControls(
      input.throttle,
      input.brake,
      this.steerValue,
      input.handbrake,
      input.reverse,
    );
  }

  /** Reset the smoothed steering (used after a car reset). */
  reset(): void {
    this.steerValue = 0;
  }
}
