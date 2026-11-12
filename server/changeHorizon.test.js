// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createChangeEventHorizon } from './changeHorizon.js';

function harness() {
  const database = { lastId: 0, xmin: 100n, xmax: 100n };
  const horizon = createChangeEventHorizon({
    readLastAllocatedId: async () => database.lastId,
    readSnapshot: async () => ({ xmin: database.xmin, xmax: database.xmax }),
  });
  return { database, horizon };
}

describe('change-event horizon', () => {
  it('follows the last id while no transaction is open', async () => {
    const { database, horizon } = harness();
    database.lastId = 7;
    await expect(horizon()).resolves.toEqual({ safeId: 7, pending: false });
    database.lastId = 9;
    await expect(horizon()).resolves.toEqual({ safeId: 9, pending: false });
  });

  it('holds back ids handed out while an older transaction is still open', async () => {
    const { database, horizon } = harness();
    database.lastId = 10;
    await horizon();

    // Transaction 100 took id 11 and stays open; transaction 101 took id 12 and committed.
    Object.assign(database, { lastId: 12, xmin: 100n, xmax: 102n });
    await expect(horizon()).resolves.toEqual({ safeId: 10, pending: true });
    await expect(horizon()).resolves.toEqual({ safeId: 10, pending: true });

    // Transaction 100 commits: both ids are settled.
    database.xmin = 102n;
    await expect(horizon()).resolves.toEqual({ safeId: 12, pending: false });
  });

  it('releases earlier ids while later ones still wait', async () => {
    const { database, horizon } = harness();
    Object.assign(database, { lastId: 5, xmin: 100n, xmax: 101n });
    await expect(horizon()).resolves.toEqual({ safeId: null, pending: true });
    Object.assign(database, { lastId: 8, xmin: 101n, xmax: 103n });
    await expect(horizon()).resolves.toEqual({ safeId: 5, pending: true });
    database.xmin = 103n;
    await expect(horizon()).resolves.toEqual({ safeId: 8, pending: false });
  });

  it('shares one database round trip between concurrent callers', async () => {
    let reads = 0;
    const horizon = createChangeEventHorizon({
      readLastAllocatedId: async () => { reads += 1; return 3; },
      readSnapshot: async () => ({ xmin: 1n, xmax: 1n }),
    });
    const results = await Promise.all([horizon(), horizon(), horizon()]);
    expect(reads).toBe(1);
    expect(results.every((result) => result.safeId === 3)).toBe(true);
  });
});
