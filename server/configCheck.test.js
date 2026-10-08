import { describe, expect, it } from 'vitest';
import { assertSafeBootstrapPassword, configProblems } from './configCheck.js';

describe('production configuration guard', () => {
  it('ignores non-production environments', () => {
    expect(configProblems({ NODE_ENV: 'development', DEVELOPMENT_TOKEN: 'x' })).toEqual([]);
  });

  it('flags short development tokens and default database passwords', () => {
    const problems = configProblems({
      NODE_ENV: 'production',
      DEVELOPMENT_TOKEN: 'short',
      DATABASE_URL: 'postgresql://u:dragonbane-local-password@db:5432/d',
    });
    expect(problems).toHaveLength(2);
  });

  it('accepts strong values and an empty (disabled) development token', () => {
    expect(configProblems({
      NODE_ENV: 'production',
      DATABASE_URL: `postgresql://u:${'a'.repeat(40)}@db:5432/d`,
    })).toEqual([]);
  });

  it('rejects the default bootstrap admin password in production only', () => {
    expect(() => assertSafeBootstrapPassword('change-me-now', { NODE_ENV: 'production' })).toThrow();
    expect(() => assertSafeBootstrapPassword('change-me-now', { NODE_ENV: 'development' })).not.toThrow();
  });
});
