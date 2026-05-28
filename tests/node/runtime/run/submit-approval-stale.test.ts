import { describe, expect, it } from 'vitest';
import {
  buildSubmitApprovalSnapshotDigest,
  buildSnapshotDigestHash
} from '../../../../src/shared/schemas/approval-snapshot-digest.schema';
import type { FieldPresenceDigest } from '../../../../src/shared/schemas/approval-snapshot-digest.schema';

describe('approval snapshot digest', () => {
  const fields = [
    { fieldRefId: 'f1', label: 'Name', type: 'text', valuePreview: 'empty', isSensitive: false },
    { fieldRefId: 'f2', label: 'Email', type: 'email', valuePreview: 'user@test.com', isSensitive: false },
    { fieldRefId: 'f3', label: 'Agree', type: 'checkbox', valuePreview: 'unchecked', isSensitive: false }
  ];

  describe('buildSubmitApprovalSnapshotDigest', () => {
    it('produces a digest with all required fields', () => {
      const digest = buildSubmitApprovalSnapshotDigest({
        formRefId: 'form-1',
        fieldRefIds: ['f1', 'f2', 'f3'],
        submitTargetRefId: 'btn-1',
        fields
      });
      expect(digest.formRefId).toBe('form-1');
      expect(digest.fieldRefIds).toEqual(['f1', 'f2', 'f3']);
      expect(digest.submitTargetRefId).toBe('btn-1');
      expect(digest.fieldDigests).toHaveLength(3);
      expect(digest.hash).toBeTypeOf('string');
      expect(digest.hash.length).toBeGreaterThan(0);
    });

    it('detects empty value presence', () => {
      const digest = buildSubmitApprovalSnapshotDigest({
        fieldRefIds: ['f1'], fields: [fields[0]!]
      });
      expect(digest.fieldDigests[0]!.presence).toBe('empty');
    });

    it('detects non-empty value presence', () => {
      const digest = buildSubmitApprovalSnapshotDigest({
        fieldRefIds: ['f2'], fields: [fields[1]!]
      });
      expect(digest.fieldDigests[0]!.presence).toBe('non-empty');
    });

    it('detects unchecked presence', () => {
      const digest = buildSubmitApprovalSnapshotDigest({
        fieldRefIds: ['f3'], fields: [fields[2]!]
      });
      expect(digest.fieldDigests[0]!.presence).toBe('unchecked');
    });

    it('produces same hash for identical fields', () => {
      const a = buildSubmitApprovalSnapshotDigest({ fieldRefIds: ['f1', 'f2'], fields: [fields[0]!, fields[1]!] });
      const b = buildSubmitApprovalSnapshotDigest({ fieldRefIds: ['f1', 'f2'], fields: [fields[0]!, fields[1]!] });
      expect(a.hash).toBe(b.hash);
    });

    it('produces different hash when field presence changes', () => {
      const a = buildSubmitApprovalSnapshotDigest({ fieldRefIds: ['f1'], fields: [{ ...fields[0]!, valuePreview: 'empty' }] });
      const b = buildSubmitApprovalSnapshotDigest({ fieldRefIds: ['f1'], fields: [{ ...fields[0]!, valuePreview: 'John' }] });
      expect(a.hash).not.toBe(b.hash);
    });
  });

  describe('buildSnapshotDigestHash', () => {
    const baseDigests: FieldPresenceDigest[] = [
      { refId: 'f1', label: 'Name', type: 'text', presence: 'empty' },
      { refId: 'f2', label: 'Email', type: 'email', presence: 'non-empty' }
    ];

    it('is stable for the same input', () => {
      expect(buildSnapshotDigestHash({ fieldDigests: baseDigests }))
        .toBe(buildSnapshotDigestHash({ fieldDigests: baseDigests }));
    });

    it('is order-independent (sorted by refId)', () => {
      const a = buildSnapshotDigestHash({ fieldDigests: [
        { refId: 'f2', presence: 'non-empty' },
        { refId: 'f1', presence: 'empty' }
      ]});
      const b = buildSnapshotDigestHash({ fieldDigests: [
        { refId: 'f1', presence: 'empty' },
        { refId: 'f2', presence: 'non-empty' }
      ]});
      expect(a).toBe(b);
    });

    it('returns different hash for different presence', () => {
      const a = buildSnapshotDigestHash({ fieldDigests: [{ refId: 'f1', presence: 'empty' }] });
      const b = buildSnapshotDigestHash({ fieldDigests: [{ refId: 'f1', presence: 'non-empty' }] });
      expect(a).not.toBe(b);
    });

    it('includes form context in hash', () => {
      const a = buildSnapshotDigestHash({ fieldDigests: [{ refId: 'f1', presence: 'empty' }], formAction: '/submit' });
      const b = buildSnapshotDigestHash({ fieldDigests: [{ refId: 'f1', presence: 'empty' }], formAction: '/other' });
      expect(a).not.toBe(b);
    });

    it('returns non-empty hex string', () => {
      const hash = buildSnapshotDigestHash({ fieldDigests: [{ refId: 'f1', presence: 'empty' }] });
      expect(hash).toBeTypeOf('string');
      expect(hash.length).toBe(8);
      expect(/^[a-f0-9]+$/u.test(hash)).toBe(true);
    });
  });
});
