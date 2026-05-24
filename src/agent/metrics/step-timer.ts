export class StepTimer {
  start(): number {
    return Date.now();
  }

  stop(startedAt: number): {
    startedAt: number;
    endedAt: number;
    durationMs: number;
  } {
    const endedAt = Date.now();
    return {
      startedAt,
      endedAt,
      durationMs: Math.max(0, endedAt - startedAt)
    };
  }
}
