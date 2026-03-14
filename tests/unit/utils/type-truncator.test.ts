import { describe, it, expect } from 'vitest';
import { truncateType, simplifyType, cleanReturnType } from '../../../src/utils/type-truncator.js';

describe('type-truncator', () => {
  describe('truncateType', () => {
    it('should return short types unchanged', () => {
      expect(truncateType('string')).toBe('string');
      expect(truncateType('number')).toBe('number');
    });

    it('should truncate long types', () => {
      const longType = 'Record<string, Array<{ id: number; name: string; email: string; role: string; createdAt: Date }>>';
      const result = truncateType(longType, 40);
      expect(result.length).toBe(40);
      expect(result).toContain('...');
    });

    it('should use default max length of 80', () => {
      const type = 'A'.repeat(100);
      const result = truncateType(type);
      expect(result.length).toBe(80);
    });

    it('should not truncate exactly at max length', () => {
      const type = 'A'.repeat(80);
      expect(truncateType(type)).toBe(type);
    });
  });

  describe('simplifyType', () => {
    it('should normalize whitespace', () => {
      expect(simplifyType('  Record<  string ,  number  >  ')).toBe('Record<string, number>');
    });

    it('should normalize comma spacing', () => {
      expect(simplifyType('Map<string,number>')).toBe('Map<string, number>');
    });

    it('should trim', () => {
      expect(simplifyType('  string  ')).toBe('string');
    });
  });

  describe('cleanReturnType', () => {
    it('should clean simple return types', () => {
      expect(cleanReturnType('string')).toBe('string');
    });

    it('should remove trailing brace', () => {
      expect(cleanReturnType('void {')).toBe('void');
    });

    it('should normalize multi-line', () => {
      expect(cleanReturnType('Promise<\n  User\n>')).toBe('Promise<User>');
    });
  });
});
