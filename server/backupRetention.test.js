import { chmod, mkdir, mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AUTOMATIC_BACKUP_PATTERN, DEPLOY_DUMP_PATTERN, pruneAutomaticBackups, pruneDeployDumps, selectDumpsToPrune } from './backupRetention.js';

const NOW = Date.parse('2026-10-09T12:00:00Z');
const day = 86_400_000;
const file = (name, daysOld) => ({ filename: name, size: 10, createdAt: new Date(NOW - daysOld * day).toISOString() });

describe('selectDumpsToPrune', () => {
  const files = [file('a', 1), file('b', 5), file('c', 20), file('d', 40), file('e', 90)];

  it('keeps the newest N and anything younger than the minimum age', () => {
    expect(selectDumpsToPrune(files, { keep: 2, minAgeDays: 14, now: NOW }).map((f) => f.filename)).toEqual(['c', 'd', 'e']);
    expect(selectDumpsToPrune(files, { keep: 2, minAgeDays: 30, now: NOW }).map((f) => f.filename)).toEqual(['d', 'e']);
  });

  it('never removes anything when fewer than N exist', () => {
    expect(selectDumpsToPrune(files, { keep: 10, minAgeDays: 0, now: NOW })).toEqual([]);
  });

  it('does not depend on input order', () => {
    expect(selectDumpsToPrune([...files].reverse(), { keep: 4, minAgeDays: 0, now: NOW }).map((f) => f.filename)).toEqual(['e']);
  });
});

describe('DEPLOY_DUMP_PATTERN', () => {
  it('matches deployment dumps only, not manual or other files', () => {
    expect(DEPLOY_DUMP_PATTERN.test('database-20261008T062420Z-d4e1a78.dump')).toBe(true);
    expect(DEPLOY_DUMP_PATTERN.test('database-manual-recovery-20261008T062420Z.dump')).toBe(false);
    expect(DEPLOY_DUMP_PATTERN.test('dragonbane-backup-20261008T062420Z-abcdef12.tar.gz')).toBe(false);
  });
});

describe('pruneDeployDumps', () => {
  let root;
  afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); });

  const setup = async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'retention-'));
    const directory = path.join(root, 'predeploy');
    await mkdir(directory);
    const names = [];
    for (let age = 1; age <= 6; age += 1) {
      const name = `database-2026100${age}T000000Z-abc${age}.dump`;
      await writeFile(path.join(directory, name), 'x');
      const when = new Date(NOW / 1000 * 1000 - age * 30 * day);
      await utimes(path.join(directory, name), when, when);
      names.push(name);
    }
    await writeFile(path.join(directory, 'database-manual-recovery-20261008T062420Z.dump'), 'x');
    await writeFile(path.join(root, 'dragonbane-backup-20260101T000000Z-abcdef12.tar.gz'), 'x');
    return directory;
  };

  it('previews without deleting', async () => {
    const directory = await setup();
    const result = await pruneDeployDumps(root, { dryRun: true, policy: { keep: 2, minAgeDays: 14 }, now: NOW });
    expect(result).toMatchObject({ dryRun: true, prunable: 4, kept: 2 });
    expect(await readdir(directory)).toHaveLength(7);
  });

  it('deletes only old deployment dumps and leaves everything else', async () => {
    const directory = await setup();
    const result = await pruneDeployDumps(root, { policy: { keep: 2, minAgeDays: 14 }, now: NOW });
    expect(result.prunable).toBe(4);
    expect((await readdir(directory)).sort()).toEqual([
      'database-20261001T000000Z-abc1.dump',
      'database-20261002T000000Z-abc2.dump',
      'database-manual-recovery-20261008T062420Z.dump',
    ]);
    expect(await readdir(root)).toContain('dragonbane-backup-20260101T000000Z-abcdef12.tar.gz');
  });

  it('reports files it cannot remove instead of failing', async () => {
    const directory = await setup();
    await chmod(directory, 0o500);
    try {
      const result = await pruneDeployDumps(root, { policy: { keep: 2, minAgeDays: 14 }, now: NOW });
      if (process.getuid?.() === 0) return; // root ignores directory permissions
      expect(result.prunable).toBe(0);
      expect(result.failed).toHaveLength(4);
    } finally {
      await chmod(directory, 0o700);
    }
  });

  it('copes with a missing directory', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'retention-'));
    expect(await pruneDeployDumps(root, { policy: { keep: 1, minAgeDays: 0 } })).toMatchObject({ prunable: 0, kept: 0 });
  });
});

describe('pruneAutomaticBackups', () => {
  let root;
  afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); });

  it('keeps the newest automatic sets and leaves manual sets, safety copies and dumps alone', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'auto-retention-'));
    const names = [];
    for (let index = 1; index <= 5; index += 1) {
      const name = `dragonbane-auto-2026100${index}T020000Z-abcdef0${index}.tar.gz`;
      await writeFile(path.join(root, name), 'x');
      const when = new Date(Date.UTC(2026, 9, index));
      await utimes(path.join(root, name), when, when);
      names.push(name);
    }
    const others = ['dragonbane-backup-20260101T000000Z-abcdef01.tar.gz', 'pre-restore-20260101T000000Z-abcdef01.tar.gz', 'database-20260101T000000Z-abc.dump'];
    for (const name of others) await writeFile(path.join(root, name), 'x');

    const preview = await pruneAutomaticBackups(root, { keep: 2, dryRun: true });
    expect(preview).toMatchObject({ prunable: 3, kept: 2 });
    expect((await readdir(root)).length).toBe(8);

    await pruneAutomaticBackups(root, { keep: 2 });
    expect((await readdir(root)).sort()).toEqual([...others, names[3], names[4]].sort());
  });

  it('recognises only automatic sets', () => {
    expect(AUTOMATIC_BACKUP_PATTERN.test('dragonbane-auto-20261009T020000Z-abcdef01.tar.gz')).toBe(true);
    expect(AUTOMATIC_BACKUP_PATTERN.test('dragonbane-backup-20261009T020000Z-abcdef01.tar.gz')).toBe(false);
  });

  it('copes with a missing directory', async () => {
    expect(await pruneAutomaticBackups('/nonexistent/backup/root', { keep: 3 })).toMatchObject({ prunable: 0, kept: 0 });
  });
});
