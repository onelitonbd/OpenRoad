// PlayerController.ts — InputState → Vehicle update (thin wrapper for future)
import type { Input } from '../core/Input';
import type { Vehicle } from './Vehicle';

export class PlayerController {
  constructor(private input: Input, private vehicle: Vehicle) {}

  update(dt: number) {
    this.input.update();
    this.vehicle.update(dt, {
      throttle: this.input.state.throttle,
      brake: this.input.state.brake,
      steer: this.input.state.steer,
      handbrake: this.input.state.handbrake,
    });
    // handle resets outside
  }
}
