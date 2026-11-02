/**
 * Fixed-timestep game loop. The simulation always advances in 1/60 s steps,
 * no matter how fast the display refreshes; rendering happens once per frame.
 */
export const SIM_HZ = 60;
export const SIM_STEP_MS = 1000 / SIM_HZ;
/** Never run more than this many catch-up steps in one frame (avoids a spiral after a stall). */
const MAX_STEPS_PER_FRAME = 5;

export class FixedStepLoop {
  private accumulator = 0;

  constructor(private readonly step: (dtSeconds: number) => void) {}

  /** Feed the real elapsed time of one frame. Returns how many sim steps ran. */
  advance(frameMs: number): number {
    this.accumulator += frameMs;
    let steps = 0;
    while (this.accumulator >= SIM_STEP_MS && steps < MAX_STEPS_PER_FRAME) {
      this.step(SIM_STEP_MS / 1000);
      this.accumulator -= SIM_STEP_MS;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0;
    return steps;
  }
}

/** Counts frames and sim ticks over a rolling one-second window. */
export class FpsMeter {
  fps = 0;
  ticksPerSecond = 0;
  worstFrameMs = 0;
  private frames = 0;
  private ticks = 0;
  private windowMs = 0;
  private worst = 0;

  sample(frameMs: number, simSteps: number): boolean {
    this.frames++;
    this.ticks += simSteps;
    this.windowMs += frameMs;
    this.worst = Math.max(this.worst, frameMs);
    if (this.windowMs < 1000) return false;
    this.fps = (this.frames * 1000) / this.windowMs;
    this.ticksPerSecond = (this.ticks * 1000) / this.windowMs;
    this.worstFrameMs = this.worst;
    this.frames = this.ticks = this.windowMs = this.worst = 0;
    return true;
  }
}
