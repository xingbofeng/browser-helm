export type ParseFrameRefInput = {
  refId: string;
  frameId?: number | undefined;
};

export type ParsedFrameRef =
  | {
      ok: true;
      frameId: number;
      innerRefId: string;
      refId: string;
    }
  | {
      ok: false;
      code: 'FRAME_REF_INVALID' | 'FRAME_REF_MISMATCH';
      message: string;
    };

const FRAME_REF_PATTERN = /^frame_(\d+):(.+)$/;

export function parseFrameRef(input: ParseFrameRefInput): ParsedFrameRef {
  const match = FRAME_REF_PATTERN.exec(input.refId);
  if (!match) {
    return {
      ok: false,
      code: 'FRAME_REF_INVALID',
      message: `Invalid iframe ref: ${input.refId}`
    };
  }

  const frameId = Number(match[1]);
  const innerRefId = match[2] ?? '';
  if (!Number.isInteger(frameId) || innerRefId.length === 0) {
    return {
      ok: false,
      code: 'FRAME_REF_INVALID',
      message: `Invalid iframe ref: ${input.refId}`
    };
  }

  if (input.frameId !== undefined && input.frameId !== frameId) {
    return {
      ok: false,
      code: 'FRAME_REF_MISMATCH',
      message: `Frame id ${input.frameId} does not match ${frameId}`
    };
  }

  return {
    ok: true,
    frameId,
    innerRefId,
    refId: input.refId
  };
}
