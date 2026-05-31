import type { ModelClient, VisionModelInput } from './model-client';
import { normalizeVisionObservation } from '../../tools/vision/vision-result-normalizer';
import type { VisionObservation } from '../../shared/schemas/vision';

export type VisionDescribeInput = {
  imageDataUrl: string;
  prompt: string;
  runId?: string | undefined;
  stepIndex?: number | undefined;
};

export type VisionDescribeResult = {
  ok: boolean;
  reason?: string | undefined;
  observation: VisionObservation;
};

export type VisionClientLike = {
  describeViewport(input: VisionDescribeInput): Promise<VisionDescribeResult>;
};

export class VisionClient implements VisionClientLike {
  constructor(private readonly modelClient: ModelClient) {}

  async describeViewport(input: VisionDescribeInput): Promise<VisionDescribeResult> {
    if (!this.modelClient.completeVision) {
      return {
        ok: false,
        reason: 'vision_not_supported',
        observation: normalizeVisionObservation({
          summary: 'Vision model is unavailable; use DOM/a11y observation instead.',
          fallback: 'dom_a11y',
          fallbackReason: 'vision_not_supported'
        })
      };
    }
    try {
      const output = await this.modelClient.completeVision(toVisionModelInput(input));
      return {
        ok: true,
        observation: normalizeVisionObservation(JSON.parse(output.text) as unknown)
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'vision_failed';
      return {
        ok: false,
        reason,
        observation: normalizeVisionObservation({
          summary: 'Vision model failed; use DOM/a11y observation instead.',
          fallback: 'dom_a11y',
          fallbackReason: reason
        })
      };
    }
  }
}

function toVisionModelInput(input: VisionDescribeInput): VisionModelInput {
  return {
    runId: input.runId ?? 'vision_run',
    stepIndex: input.stepIndex ?? 0,
    prompt: input.prompt,
    imageDataUrl: input.imageDataUrl
  };
}
