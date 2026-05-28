/**
 * Structured JSON truncation that always produces legal JSON.
 *
 * Unlike raw string slicing, this function walks the JSON value tree
 * and shortens strings / drops array elements / prunes object keys
 * while keeping the output parsable.
 */

const TRUNCATION_SUFFIX = '…[truncated]';
const MIN_STRING_CHARS = 20;

/**
 * Truncates any JSON-serializable value to fit within `maxChars`,
 * always producing a legal JSON string.
 *
 * Strategy (applied in order until within budget):
 *   1. Serialize normally — if within budget, return as-is.
 *   2. For strings: shorten content, append truncation suffix.
 *   3. For objects: first shorten long string values; then drop keys.
 *   4. For arrays: first shorten long string items; then drop items.
 *   5. For other primitives: return as-is (cannot be shortened).
 */
export function truncateJson(value: unknown, maxChars: number): string {
  const serialized = JSON.stringify(value);
  if (serialized.length <= maxChars) {
    return serialized;
  }

  // For primitive strings
  if (typeof value === 'string') {
    return truncateStringValue(value, maxChars);
  }

  // For non-string primitives, return as-is (can't be shortened)
  if (value === null || typeof value !== 'object') {
    // If even a primitive overflows budget, the budget is too small.
    // Return a minimal representation.
    if (maxChars < 4) return 'null';
    return serialized;
  }

  // For objects and arrays
  return truncateStructure(value, maxChars);
}

function truncateStringValue(str: string, maxChars: number): string {
  const overhead = 2; // quotes
  const suffixLen = TRUNCATION_SUFFIX.length;
  const maxContent = Math.max(MIN_STRING_CHARS, maxChars - overhead - suffixLen);
  if (maxContent >= str.length) {
    return JSON.stringify(str);
  }
  return JSON.stringify(str.slice(0, maxContent) + TRUNCATION_SUFFIX);
}

function truncateStructure(value: unknown, maxChars: number): string {
  // Phase 1: Try shortening long string values without dropping structure
  const withShortenedStrings = shortenStringValues(value, maxChars);
  const phase1Json = JSON.stringify(withShortenedStrings);
  if (phase1Json.length <= maxChars) {
    return phase1Json;
  }

  // Phase 2: Drop array items or object keys
  if (Array.isArray(value)) {
    return truncateArrayItems(value, maxChars);
  }

  if (typeof value === 'object' && value !== null) {
    return truncateObjectKeys(value as Record<string, unknown>, maxChars);
  }

  // Fallback
  return phase1Json.slice(0, Math.max(1, maxChars - 3)) + TRUNCATION_SUFFIX;
}

/**
 * Recursively shorten long string values in an object/array,
 * keeping the structure intact. Returns a new value (not mutated).
 */
function shortenStringValues(value: unknown, budget: number): unknown {
  if (typeof value === 'string' && value.length > MIN_STRING_CHARS) {
    // Estimate overhead for this string within its parent context
    // We don't know the exact overhead, so be conservative
    const maxStrLen = Math.max(MIN_STRING_CHARS, Math.floor(budget / 4));
    if (value.length > maxStrLen) {
      return value.slice(0, maxStrLen - TRUNCATION_SUFFIX.length) + TRUNCATION_SUFFIX;
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => shortenStringValues(item, Math.floor(budget / Math.max(1, value.length))));
  }

  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    const perKeyBudget = Math.floor(budget / Math.max(1, keys.length));
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      result[key] = shortenStringValues(obj[key], perKeyBudget);
    }
    return result;
  }

  return value;
}

function truncateArrayItems(arr: unknown[], maxChars: number): string {
  let lo = 0;
  let hi = arr.length;
  let best = 0;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const slice = arr.slice(0, mid);
    const testVal = mid < arr.length
      ? [...slice, `[+${arr.length - mid} omitted]`]
      : slice;
    const testJson = JSON.stringify(testVal);
    if (testJson.length <= maxChars) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (best === 0) {
    return '[]';
  }

  const result = arr.slice(0, best);
  if (best < arr.length) {
    result.push(`[+${arr.length - best} omitted]`);
  }
  return JSON.stringify(result);
}

function truncateObjectKeys(obj: Record<string, unknown>, maxChars: number): string {
  const keys = Object.keys(obj);

  // First try keeping 1 key at a time, with value truncation
  let lo = 0;
  let hi = keys.length;
  let best = 0;
  let bestResult: Record<string, unknown> = {};

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const keptKeys = keys.slice(0, mid);

    // Calculate overhead for keys + omission marker
    const markerEntry = mid < keys.length
      ? { _omitted: `[+${keys.length - mid} keys omitted]` }
      : {};
    const overhead = JSON.stringify({ ...Object.fromEntries(keptKeys.map((k) => [k, null])), ...markerEntry }).length;

    // Remaining budget for values
    const valueBudget = maxChars - overhead;
    if (valueBudget <= 0) {
      hi = mid - 1;
      continue;
    }

    // Try keeping these keys with truncated values
    const testObj: Record<string, unknown> = {};
    let fits = true;
    let remainingBudget = valueBudget;

    for (const key of keptKeys) {
      const val = obj[key];
      const valJson = tryTruncateValue(val, remainingBudget);
      if (valJson === undefined) {
        fits = false;
        break;
      }
      const parsed = safeJsonParse(valJson);
      if (parsed === undefined) {
        fits = false;
        break;
      }
      testObj[key] = parsed;
      remainingBudget -= valJson.length;
    }

    if (fits) {
      // Add omission marker
      Object.assign(testObj, markerEntry);
      best = mid;
      bestResult = { ...testObj };
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (best === 0) {
    return '{}';
  }

  return JSON.stringify(bestResult);
}

/**
 * Try to truncate a value to fit within budget. Returns JSON string or undefined.
 */
function tryTruncateValue(
  val: unknown,
  budget: number
): string | undefined {
  if (budget <= 0) return undefined;

  // Primitives that can't be shortened
  if (val === null) return 'null';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'number') {
    const s = JSON.stringify(val);
    return s.length <= budget ? s : undefined;
  }

  // String values
  if (typeof val === 'string') {
    const minLen = 4; // "" + 2 chars
    if (budget < minLen) return undefined;
    if (val.length + 2 <= budget) return JSON.stringify(val);
    return truncateStringValue(val, budget);
  }

  // Array values — truncate items
  if (Array.isArray(val)) {
    return truncateArrayItems(val, budget);
  }

  // Object values — recursively truncate keys
  if (typeof val === 'object') {
    return truncateObjectKeys(val as Record<string, unknown>, budget);
  }

  return undefined;
}

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}
