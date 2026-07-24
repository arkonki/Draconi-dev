// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { normalizeRealtimeWaitMs } from './data.js';

describe('realtime long polling', () => {
  it('normalizes requested wait times to the supported window', () => {
    expect(normalizeRealtimeWaitMs(undefined)).toBe(0);
    expect(normalizeRealtimeWaitMs(-1)).toBe(0);
    expect(normalizeRealtimeWaitMs('1500')).toBe(1500);
    expect(normalizeRealtimeWaitMs(25_000)).toBe(20_000);
  });
});
