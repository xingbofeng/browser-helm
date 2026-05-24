import { ERROR_CODES } from '../../shared/constants/error-codes';
import { CONTENT_RPC_MESSAGES } from '../../shared/constants/event-names';
import type {
  A11ySnapshot,
  ElementRef,
  Observation
} from '../../shared/schemas/observation.schema';
import type {
  FormFieldSnapshot,
  FormSubmitSummary,
  StructuredPageWarning
} from '../../shared/schemas/structured-page-data.schema';
import type {
  ContentRpcRequest,
  ContentRpcResponse
} from './content-rpc.schema';

export type FrameRpcResponse = {
  frameId: number;
  url?: string | undefined;
  response: ContentRpcResponse;
};

export type ContentRpcStrategyContext = {
  frames: () => Promise<FrameMetadata[]>;
  sendFrameMessage: (
    frameId: number | undefined,
    message: ContentRpcRequest
  ) => Promise<ContentRpcResponse>;
};

export type ContentRpcStrategy = {
  type: ContentRpcRequest['type'];
  execute(message: ContentRpcRequest): Promise<ContentRpcResponse>;
};

export function createContentRpcStrategies(
  context: ContentRpcStrategyContext
): ContentRpcStrategy[] {
  return [
    new FrameListStrategy(context),
    new AllFrameObservationStrategy(context),
    new AllFrameSnapshotStrategy(context, CONTENT_RPC_MESSAGES.A11Y_SNAPSHOT),
    new AllFrameSnapshotStrategy(context, CONTENT_RPC_MESSAGES.A11Y_REFRESH_REFS),
    new ResolveRefStrategy(context),
    new TargetFrameStrategy(context, CONTENT_RPC_MESSAGES.IFRAME_READ),
    new TargetFrameStrategy(context, CONTENT_RPC_MESSAGES.IFRAME_CLICK),
    new TargetFrameStrategy(context, CONTENT_RPC_MESSAGES.IFRAME_TYPE)
  ];
}

type FrameMetadata = {
  frameId: number;
  url?: string | undefined;
  parentFrameId?: number | undefined;
};

class FrameListStrategy implements ContentRpcStrategy {
  readonly type = CONTENT_RPC_MESSAGES.FRAME_LIST;

  constructor(private readonly context: ContentRpcStrategyContext) {}

  async execute(): Promise<ContentRpcResponse> {
    const frames = await this.context.frames();
    return {
      ok: true,
      frames: frames.map((frame) => ({
        frameId: frame.frameId,
        url: frame.url ?? '',
        ...(frame.parentFrameId !== undefined
          ? { parentFrameId: frame.parentFrameId }
          : {}),
        isTop: frame.frameId === 0
      }))
    };
  }
}

class AllFrameObservationStrategy implements ContentRpcStrategy {
  readonly type = CONTENT_RPC_MESSAGES.PAGE_OBSERVE;

  constructor(private readonly context: ContentRpcStrategyContext) {}

  async execute(message: ContentRpcRequest): Promise<ContentRpcResponse> {
    const frames = await this.context.frames();
    const responses = await Promise.all(
      frames.map(async (frame) => ({
        frameId: frame.frameId,
        url: frame.url,
        response: await safeSendFrameMessage(this.context, frame.frameId, message)
      }))
    );
    return mergeFrameObservationResponses(responses);
  }
}

class AllFrameSnapshotStrategy implements ContentRpcStrategy {
  constructor(
    private readonly context: ContentRpcStrategyContext,
    readonly type: ContentRpcRequest['type']
  ) {}

  async execute(message: ContentRpcRequest): Promise<ContentRpcResponse> {
    const frames = await this.context.frames();
    const responses = await Promise.all(
      frames.map(async (frame) => ({
        frameId: frame.frameId,
        url: frame.url,
        response: await safeSendFrameMessage(this.context, frame.frameId, message)
      }))
    );
    return mergeFrameSnapshotResponses(responses);
  }
}

class ResolveRefStrategy implements ContentRpcStrategy {
  readonly type = CONTENT_RPC_MESSAGES.A11Y_RESOLVE_REF;

  constructor(private readonly context: ContentRpcStrategyContext) {}

  async execute(message: ContentRpcRequest): Promise<ContentRpcResponse> {
    if (message.type !== CONTENT_RPC_MESSAGES.A11Y_RESOLVE_REF) {
      return {
        ok: false,
        code: ERROR_CODES.CONTENT_SCRIPT_UNAVAILABLE,
        message: `Unexpected content RPC message: ${message.type}`
      };
    }
    const parsed = parseFrameRefId(message.refId);
    const response = await this.context.sendFrameMessage(parsed.frameId, {
      type: CONTENT_RPC_MESSAGES.A11Y_RESOLVE_REF,
      refId: parsed.refId
    });
    if (response.ok && 'ref' in response) {
      return {
        ok: true,
        ref: prefixRefValue(response.ref, parsed.frameId ?? 0)
      };
    }
    return response;
  }
}

class TargetFrameStrategy implements ContentRpcStrategy {
  constructor(
    private readonly context: ContentRpcStrategyContext,
    readonly type: ContentRpcRequest['type']
  ) {}

  async execute(message: ContentRpcRequest): Promise<ContentRpcResponse> {
    if (!('frameId' in message) || typeof message.frameId !== 'number') {
      return {
        ok: false,
        code: ERROR_CODES.CONTENT_SCRIPT_UNAVAILABLE,
        message: `Missing target frame for ${message.type}`
      };
    }
    const frames = await this.context.frames();
    if (!frames.some((frame) => frame.frameId === message.frameId)) {
      return {
        ok: false,
        code: ERROR_CODES.FRAME_NOT_FOUND,
        message: `Frame not found: ${message.frameId}`
      };
    }
    return safeSendFrameMessage(this.context, message.frameId, message);
  }
}

export function mergeFrameObservationResponses(
  responses: FrameRpcResponse[]
): ContentRpcResponse {
  const successful = responses.filter(isObservationFrameResponse);
  const top = successful.find((item) => item.frameId === 0) ?? successful[0];
  if (!top) {
    return firstFailure(responses);
  }

  const observations = successful.map((item) => item.response.observation);
  const refSummary = successful.flatMap((item) =>
    item.response.observation.refSummary.map((ref) =>
      prefixElementRef(ref, item.frameId)
    )
  );
  const formFields = mergeFormFields(successful);
  const visibleText = joinText(observations.map((observation) => observation.visibleText));
  const visibleTextSummary = joinText(
    observations.map((observation) => observation.visibleTextSummary)
  );

  return {
    ok: true,
    observation: {
      ...top.response.observation,
      visibleText,
      visibleTextSummary,
      pageStateSummary: `页面包含 ${refSummary.length} 个可交互元素`,
      refSummary,
      formFields,
      warnings: [
        ...top.response.observation.warnings,
        ...responses.flatMap(frameFailureWarning)
      ]
    }
  };
}

function mergeFrameSnapshotResponses(
  responses: FrameRpcResponse[]
): ContentRpcResponse {
  const successful = responses.filter(isSnapshotFrameResponse);
  const top = successful.find((item) => item.frameId === 0) ?? successful[0];
  if (!top) {
    return firstFailure(responses);
  }

  return {
    ok: true,
    snapshot: {
      ...top.response.snapshot,
      elements: successful.flatMap((item) =>
        item.response.snapshot.elements.map((ref) =>
          prefixElementRef(ref, item.frameId)
        )
      ),
      warnings: [
        ...top.response.snapshot.warnings,
        ...responses.flatMap(frameFailureWarning)
      ]
    }
  };
}

function mergeFormFields(
  responses: Array<FrameRpcResponse & { response: { ok: true; observation: Observation } }>
): {
  status: 'ready' | 'empty' | 'partial';
  fields: FormFieldSnapshot[];
  count: number;
  submit?: FormSubmitSummary | undefined;
  warnings: StructuredPageWarning[];
  emptyReason?: string | undefined;
} {
  const fields = responses.flatMap((item) => {
    const formFields = readFormFields(item.response.observation.formFields);
    return formFields.fields.map((field) => prefixFormField(field, item.frameId));
  });
  const warnings = responses.flatMap((item) =>
    readFormFields(item.response.observation.formFields).warnings
  );
  const submit = responses
    .map((item) =>
      prefixSubmit(readFormFields(item.response.observation.formFields).submit, item.frameId)
    )
    .find(Boolean);

  if (fields.length === 0) {
    return {
      status: 'empty',
      fields: [],
      count: 0,
      warnings,
      emptyReason: 'NO_FORM_FIELDS_DETECTED'
    };
  }

  return {
    status: warnings.length > 0 ? 'partial' : 'ready',
    fields,
    count: fields.length,
    submit,
    warnings
  };
}

function readFormFields(value: unknown): {
  fields: FormFieldSnapshot[];
  submit?: FormSubmitSummary | undefined;
  warnings: StructuredPageWarning[];
} {
  if (typeof value !== 'object' || value === null) {
    return { fields: [], warnings: [] };
  }
  const record = value as Record<string, unknown>;
  return {
    fields: Array.isArray(record.fields)
      ? (record.fields as FormFieldSnapshot[])
      : [],
    submit:
      typeof record.submit === 'object' && record.submit !== null
        ? (record.submit as FormSubmitSummary)
        : undefined,
    warnings: Array.isArray(record.warnings)
      ? (record.warnings as StructuredPageWarning[])
      : []
  };
}

function prefixFormField(
  field: FormFieldSnapshot,
  frameId: number
): FormFieldSnapshot {
  return {
    ...field,
    refId: prefixRefId(field.refId, frameId),
    submit: prefixSubmit(field.submit, frameId)
  };
}

function prefixSubmit(
  submit: FormSubmitSummary | undefined,
  frameId: number
): FormSubmitSummary | undefined {
  if (!submit) {
    return undefined;
  }
  return {
    ...submit,
    ...(submit.refId ? { refId: prefixRefId(submit.refId, frameId) } : {}),
    reason: submit.reason
      ? {
          ...submit.reason,
          ...(submit.reason.fieldRefId
            ? { fieldRefId: prefixRefId(submit.reason.fieldRefId, frameId) }
            : {})
        }
      : undefined
  };
}

function prefixElementRef<T extends ElementRef>(ref: T, frameId: number): T {
  return {
    ...ref,
    refId: prefixRefId(ref.refId, frameId)
  };
}

function prefixRefValue(ref: unknown, frameId: number): unknown {
  if (typeof ref !== 'object' || ref === null || !('refId' in ref)) {
    return ref;
  }
  return {
    ...ref,
    refId: prefixRefId(String(ref.refId), frameId)
  };
}

function prefixRefId(refId: string, frameId: number): string {
  return frameId === 0 ? refId : `frame_${frameId}:${refId}`;
}

function parseFrameRefId(refId: string): { frameId: number | undefined; refId: string } {
  const match = /^frame_(\d+):(.+)$/u.exec(refId);
  if (!match?.[1] || !match[2]) {
    return { frameId: undefined, refId };
  }
  return {
    frameId: Number(match[1]),
    refId: match[2]
  };
}

function isObservationFrameResponse(
  value: FrameRpcResponse
): value is FrameRpcResponse & { response: { ok: true; observation: Observation } } {
  return value.response.ok && 'observation' in value.response;
}

function isSnapshotFrameResponse(
  value: FrameRpcResponse
): value is FrameRpcResponse & { response: { ok: true; snapshot: A11ySnapshot } } {
  return value.response.ok && 'snapshot' in value.response;
}

function firstFailure(responses: FrameRpcResponse[]): ContentRpcResponse {
  const failed = responses.find((item) => !item.response.ok);
  return failed && !failed.response.ok
    ? failed.response
    : {
        ok: false,
        code: ERROR_CODES.CONTENT_SCRIPT_UNAVAILABLE,
        message: 'No frame returned content data'
      };
}

function frameFailureWarning(item: FrameRpcResponse): string[] {
  if (item.response.ok) {
    return [];
  }
  const frameLabel = item.url
    ? `frame_${item.frameId} ${item.url}`
    : `frame_${item.frameId}`;
  return [`${frameLabel}: ${item.response.code}`];
}

function joinText(values: string[]): string {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).join(' ');
}

async function safeSendFrameMessage(
  context: ContentRpcStrategyContext,
  frameId: number,
  message: ContentRpcRequest
): Promise<ContentRpcResponse> {
  try {
    return await context.sendFrameMessage(frameId, message);
  } catch (error) {
    return {
      ok: false,
      code: ERROR_CODES.CONTENT_SCRIPT_UNAVAILABLE,
      message: error instanceof Error ? error.message : 'Content script unavailable'
    };
  }
}
