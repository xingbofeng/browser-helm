export type StepFrame = {
  stepId: string;
  startedAt: number;
};

export class StepRunner {
  createStepFrame(stepIndex: number): StepFrame {
    return {
      stepId: `step_${stepIndex}`,
      startedAt: Date.now()
    };
  }
}
