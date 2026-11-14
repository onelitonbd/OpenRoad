/**
 * Fixed timestep accumulator.
 *
 * The physics simulation must run at a constant rate (60 Hz) no matter what
 * the display refresh rate is, otherwise the car handling changes depending
 * on the monitor. Rendering happens once per animation frame and reads the
 * latest simulation state.
 */
export class FixedTimeStep {
  /** Target simulation frequency in Hz. */
  readonly frequency: number = 60;
  /** Length of one simulation step in seconds. */
  readonly dt: number;
  /** Maximum number of steps allowed in a single frame (prevents spiral of death). */
  maxSubSteps: number = 5;

  private accumulator = 0;
  /** Interpolation factor between the previous and the current simulation state. */
  alpha = 0;

  constructor(frequency = 60, maxSubSteps = 5) {
    this.frequency = frequency;
    this.dt = 1 / frequency;
    this.maxSubSteps = maxSubSteps;
  }

  /**
   * Feed the real frame time and get back how many simulation steps to run.
   * `stepFn` is called once per simulation step.
   */
  update(frameDelta: number, stepFn: (dt: number) => void): void {
    // Clamp huge deltas (tab was hidden, breakpoint hit, ...) so the world
    // does not try to catch up with hundreds of steps at once.
    const delta = Math.min(frameDelta, 0.25);
    this.accumulator += delta;

    let steps = 0;
    while (this.accumulator >= this.dt && steps < this.maxSubSteps) {
      stepFn(this.dt);
      this.accumulator -= this.dt;
      steps++;
    }
    if (steps >= this.maxSubSteps) {
      // We could not keep up - drop the remaining time.
      this.accumulator = 0;
    }
    this.alpha = this.accumulator / this.dt;
  }

  /** Discard leftover time (used when the game is paused). */
  reset(): void {
    this.accumulator = 0;
    this.alpha = 0;
  }
}
