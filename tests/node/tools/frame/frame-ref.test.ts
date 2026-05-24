import { describe, expect, it } from 'vitest';

import { parseFrameRef } from '../../../../src/tools/frame/frame-ref';

describe('frame ref parser', () => {
  it('parses composite frame ref ids', () => {
    expect(parseFrameRef({ refId: 'frame_7:ref_102' })).toEqual({
      ok: true,
      frameId: 7,
      innerRefId: 'ref_102',
      refId: 'frame_7:ref_102'
    });
  });

  it('rejects ref ids without a frame prefix', () => {
    expect(parseFrameRef({ refId: 'ref_102' })).toMatchObject({
      ok: false,
      code: 'FRAME_REF_INVALID'
    });
  });

  it('rejects invalid frame ids', () => {
    expect(parseFrameRef({ refId: 'frame_abc:ref_102' })).toMatchObject({
      ok: false,
      code: 'FRAME_REF_INVALID'
    });
  });

  it('rejects explicit frameId that conflicts with composite ref id', () => {
    expect(parseFrameRef({ refId: 'frame_7:ref_102', frameId: 8 })).toMatchObject({
      ok: false,
      code: 'FRAME_REF_MISMATCH'
    });
  });
});
