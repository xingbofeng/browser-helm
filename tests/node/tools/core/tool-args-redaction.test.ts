import { describe, expect, it } from 'vitest';

import { redactToolArgs } from '../../../../src/tools/core/tool-args-redaction';
import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';

describe('tool args redaction', () => {
  it('redacts clipboard write text from trace args', () => {
    const redacted = redactToolArgs(TOOL_NAMES.CLIPBOARD_WRITE_WITH_APPROVAL, {
      text: 'copy this private value'
    });

    expect(redacted).toEqual({
      valuePreview: {
        masked: true,
        preview: '[MASKED]',
        reason: 'redacted'
      }
    });
  });

  it('keeps only the file basename for upload approval previews', () => {
    const redacted = redactToolArgs(TOOL_NAMES.FILE_UPLOAD_WITH_APPROVAL, {
      targetRefId: 'ref_upload',
      fileName: '/Users/counter/secret/avatar.png'
    });

    expect(redacted).toEqual({
      targetRefId: 'ref_upload',
      fileName: 'avatar.png'
    });
  });
});
