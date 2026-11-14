// Time.ts — fixed-step accumulator
export class Time {
  // Fixed physics tick 60 Hz
  static readonly FIXED_DT = 1 / 60;
  static readonly MAX_ACCUM = 0.25; // avoid spiral if tab hidden

  accumulator = 0;
  elapsed = 0; // total time
  frameDt = 0; // last frame dt (clamped)
  alpha = 0; // interpolation factor

  // Call each RAF with dt (seconds)
  step(dt: number): number {
    // Clamp dt to avoid huge steps when tab hidden
    dt = Math.min(dt, Time.MAX_ACCUM);
    this.frameDt = dt;
    this.accumulator += dt;
    this.elapsed += dt;
    // How many fixed steps to consume
    let steps = 0;
    while (this.accumulator >= Time.FIXED_DT) {
      this.accumulator -= Time.FIXED_DT;
      steps++;
      // safety: never do more than 5 steps per frame
      if (steps > 5) { this.accumulator = 0; break; }
    }
    this.alpha = this.accumulator / Time.FIXED_DT;
    return steps;
  }

  reset() {
    this.accumulator = 0;
    this.elapsed = 0;
  }
}
