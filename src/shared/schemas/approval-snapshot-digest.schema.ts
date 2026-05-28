/**
 * Snapshot digest for submit approval stale detection.
 *
 * Built at approval creation time from the field state the model observed.
 * Re-computed at approval time from the live page state.
 * If the digests differ, the submit is blocked with APPROVAL_CONTEXT_STALE.
 */

/** Per-field summary used in the snapshot digest. */
export type FieldPresenceDigest = {
  refId: string;
  label?: string | undefined;
  type?: string | undefined;
  presence: 'empty' | 'non-empty' | 'checked' | 'unchecked' | 'unknown';
  disabled?: boolean | undefined;
  readonly?: boolean | undefined;
};

/** Full snapshot digest for a submit approval. */
export type SubmitApprovalSnapshotDigest = {
  formRefId?: string | undefined;
  fieldRefIds: string[];
  submitTargetRefId?: string | undefined;
  frameKey?: string | undefined;
  formAction?: string | undefined;
  formMethod?: string | undefined;
  fieldDigests: FieldPresenceDigest[];
  hash: string;
};

/**
 * Builds a deterministic hash from the full digest context.
 * Includes: field digests, form identity, and submit target.
 * Uses FNV-1a 32-bit for cross-runtime determinism.
 */
export function buildSnapshotDigestHash(params: {
  fieldDigests: FieldPresenceDigest[];
  formRefId?: string | undefined;
  submitTargetRefId?: string | undefined;
  frameKey?: string | undefined;
  formAction?: string | undefined;
  formMethod?: string | undefined;
}): string {
  const sorted = [...params.fieldDigests].sort((a, b) => a.refId.localeCompare(b.refId));
  const fieldLines = sorted
    .map((d) =>
      [
        d.refId,
        d.label ?? '',
        d.type ?? '',
        d.presence,
        String(d.disabled ?? false),
        String(d.readonly ?? false)
      ].join('|')
    )
    .join('\n');

  const contextLines = [
    params.formRefId ?? '',
    params.submitTargetRefId ?? '',
    params.frameKey ?? '',
    params.formAction ?? '',
    params.formMethod ?? ''
  ].join('|');

  const input = contextLines + '\n' + fieldLines;

  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Builds a snapshot digest from field metadata (as passed by bh_form_submit_with_approval).
 */
export function buildSubmitApprovalSnapshotDigest(params: {
  formRefId?: string | undefined;
  fieldRefIds: string[];
  submitTargetRefId?: string | undefined;
  frameKey?: string | undefined;
  formAction?: string | undefined;
  formMethod?: string | undefined;
  fields: Array<{
    fieldRefId: string;
    label: string;
    type: string;
    valuePreview: string;
    isSensitive: boolean;
    skipped?: boolean | undefined;
  }>;
}): SubmitApprovalSnapshotDigest {
  const fieldDigests: FieldPresenceDigest[] = params.fields.map((f) => ({
    refId: f.fieldRefId,
    label: f.label,
    type: f.type,
    presence: f.valuePreview === 'empty' || f.valuePreview === ''
      ? 'empty'
      : f.valuePreview === 'checked'
        ? 'checked'
        : f.valuePreview === 'unchecked'
          ? 'unchecked'
          : 'non-empty',
    // disabled/readonly are not available from the model-provided args;
    // they will be checked during re-verification by buildCurrentDigest.
    disabled: undefined,
    readonly: undefined
  }));

  const hash = buildSnapshotDigestHash({
    fieldDigests,
    formRefId: params.formRefId,
    submitTargetRefId: params.submitTargetRefId,
    frameKey: params.frameKey,
    formAction: params.formAction,
    formMethod: params.formMethod
  });

  return {
    formRefId: params.formRefId,
    fieldRefIds: params.fieldRefIds,
    submitTargetRefId: params.submitTargetRefId,
    frameKey: params.frameKey,
    formAction: params.formAction,
    formMethod: params.formMethod,
    fieldDigests,
    hash
  };
}
