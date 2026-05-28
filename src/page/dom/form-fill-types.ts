/**
 * Shared DOM-side form fill types.
 *
 * These contracts are used by content-script form actions and kept separate
 * from DOM mutation helpers so execution modules can stay focused.
 */

export interface FillFieldTarget {
  fieldRefId: string;
  value: string;
  clear?: boolean | undefined;
}

export interface FillFieldResult {
  fieldRefId: string;
  label?: string | undefined;
  name?: string | undefined;
  type: string;
  status: 'filled' | 'skipped' | 'failed' | 'cleared';
  requestedValue?: string | undefined;
  actualValuePreview?: string | undefined;
  maskedActualValue?: string | undefined;
  skipReason?: string | undefined;
  error?: string | undefined;
  retried?: boolean | undefined;
  changedPage?: boolean | undefined;
}

export interface FillManyResult {
  ok: boolean;
  formRefId?: string | undefined;
  fields: FillFieldResult[];
  filledCount: number;
  skippedCount: number;
  failedCount: number;
  changedPage: boolean;
  requiresObserve: boolean;
  retried?: boolean | undefined;
  fallbackAvailable?: boolean | undefined;
  summary: string;
}

export interface SyntheticFormGroup {
  syntheticFormRefId: string;
  fieldRefIds: string[];
  submitControlRefId?: string | undefined;
  label?: string | undefined;
  hasNativeForm: boolean;
}

export interface SubmitResult {
  outcome: 'success' | 'failure' | 'unknown';
  evidence: {
    urlChanged?: boolean | undefined;
    urlAfter?: string | undefined;
    successTextDetected?: string[] | undefined;
    successToastDetected?: boolean | undefined;
    formReset?: boolean | undefined;
    errorsCleared?: boolean | undefined;
    visibleErrors?: string[] | undefined;
    pageUnchanged?: boolean | undefined;
    currentFormErrors?: string[] | undefined;
  };
  summary: string;
}
