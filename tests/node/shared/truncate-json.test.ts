/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { describe, expect, it } from 'vitest';
import { truncateJson } from '../../../src/shared/truncate-json';

describe('truncateJson', () => {
  it('returns valid JSON string when within budget', () => {
    const obj = { a: 1, b: 'hello' };
    const result = truncateJson(obj, 500);
    expect(() => JSON.parse(result)).not.toThrow();
    const parsed = JSON.parse(result);
    expect(parsed).toEqual({ a: 1, b: 'hello' });
  });

  it('returns valid JSON when object is over budget', () => {
    const obj = { key: 'x'.repeat(300) };
    const result = truncateJson(obj, 100);
    expect(() => JSON.parse(result)).not.toThrow();
    const parsed = JSON.parse(result);
    expect(parsed.key).toBeTypeOf('string');
    // Should be truncated shorter than original
    expect(parsed.key.length).toBeLessThan(200);
  });

  it('truncates long string values but keeps JSON structure', () => {
    const obj = {
      name: 'short',
      longText: 'a'.repeat(1000),
      nested: { deep: 'b'.repeat(500) }
    };
    const result = truncateJson(obj, 200);
    expect(() => JSON.parse(result)).not.toThrow();
    const parsed = JSON.parse(result);
    expect(parsed.name).toBe('short');
    expect(parsed.longText).toBeTypeOf('string');
    expect(parsed.nested.deep).toBeTypeOf('string');
  });

  it('truncates arrays but keeps them valid', () => {
    const obj = { items: Array.from({ length: 100 }, (_, i) => ({ id: i, value: `item-${i}` })) };
    const result = truncateJson(obj, 500);
    expect(() => JSON.parse(result)).not.toThrow();
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed.items)).toBe(true);
    expect(parsed.items.length).toBeLessThan(100);
  });

  it('handles deeply nested objects', () => {
    const obj: Record<string, unknown> = {};
    let current = obj;
    for (let i = 0; i < 50; i++) {
      current.child = { value: `level-${i}` };
      current = current.child as Record<string, unknown>;
    }
    const result = truncateJson(obj, 300);
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it('handles empty objects and arrays', () => {
    expect(() => JSON.parse(truncateJson({}, 50))).not.toThrow();
    expect(() => JSON.parse(truncateJson([], 50))).not.toThrow();
    expect(() => JSON.parse(truncateJson({ a: [] }, 50))).not.toThrow();
  });

  it('handles primitive values', () => {
    expect(truncateJson('hello', 50)).toBe('"hello"');
    expect(truncateJson(42, 50)).toBe('42');
    expect(truncateJson(true, 50)).toBe('true');
    expect(truncateJson(null, 50)).toBe('null');
  });

  it('truncates a primitive string when over budget', () => {
    const long = 'x'.repeat(200);
    const result = truncateJson(long, 50);
    expect(result.length).toBeLessThanOrEqual(60);
    expect(() => JSON.parse(result)).not.toThrow();
    expect(JSON.parse(result)).toBeTypeOf('string');
  });

  it('handles very small budgets gracefully', () => {
    const obj = { key: 'value', num: 42 };
    const result = truncateJson(obj, 20);
    expect(() => JSON.parse(result)).not.toThrow();
    // At minimum it should produce a valid empty object or truncated result
  });

  it('preserves number and boolean values during truncation', () => {
    const obj = {
      count: 42,
      active: true,
      score: 3.14,
      nested: { enabled: false, total: 100 }
    };
    const result = truncateJson(obj, 200);
    expect(() => JSON.parse(result)).not.toThrow();
    const parsed = JSON.parse(result);
    expect(parsed.count).toBe(42);
    expect(parsed.active).toBe(true);
    expect(parsed.nested.enabled).toBe(false);
  });

  it('is deterministic — same input same output', () => {
    const obj = { items: Array.from({ length: 50 }, (_, i) => ({ id: i, text: 'hello world' })) };
    const a = truncateJson(obj, 300);
    const b = truncateJson(obj, 300);
    expect(a).toBe(b);
  });
});
