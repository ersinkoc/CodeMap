/**
 * Truncate long type strings for readable map output.
 * @module
 */

const DEFAULT_MAX_LENGTH = 80;

/**
 * Truncate a type string if it exceeds the maximum length.
 *
 * @param type - Type string to potentially truncate
 * @param maxLength - Maximum allowed length (default: 80)
 * @returns Original type if short enough, or truncated with '...'
 *
 * @example
 * ```typescript
 * truncateType('string'); // 'string'
 * truncateType('Record<string, Array<{ id: number; name: string; ... }>>', 40);
 * // 'Record<string, Array<{ id: number; ...'
 * ```
 */
export function truncateType(type: string, maxLength: number = DEFAULT_MAX_LENGTH): string {
  if (type.length <= maxLength) {
    return type;
  }
  return type.slice(0, maxLength - 3) + '...';
}

/**
 * Simplify a complex type for compact display.
 * Removes excessive whitespace and normalizes formatting.
 *
 * @param type - Type string to simplify
 * @returns Simplified type string
 *
 * @example
 * ```typescript
 * simplifyType('  Record<  string ,  number  >  ');
 * // 'Record<string, number>'
 * ```
 */
export function simplifyType(type: string): string {
  return type
    .replace(/\s+/g, ' ')
    .replace(/\s*([<>,;{}[\]()])\s*/g, '$1')
    .replace(/,/g, ', ')
    .trim();
}

/**
 * Extract a clean return type string, handling multi-line return types.
 *
 * @param raw - Raw return type text (may contain newlines)
 * @returns Cleaned single-line return type
 */
export function cleanReturnType(raw: string): string {
  const cleaned = raw
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*\{[\s\S]*$/, '')
    .trim();

  return truncateType(simplifyType(cleaned));
}
