import { describe, it, expect } from 'vitest';
import { getIncrementalFiles } from '../../src/plugins/optional/incremental.js';

describe('Incremental Scan', () => {
  it('should return null when no cache exists', () => {
    const result = getIncrementalFiles('/nonexistent', '/nonexistent/.codemap');
    expect(result).toBeNull();
  });

  it('should return null when not in a git repo', () => {
    const result = getIncrementalFiles('/tmp', '/tmp/.codemap');
    expect(result).toBeNull();
  });
});
