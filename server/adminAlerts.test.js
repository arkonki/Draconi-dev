import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ALERT_EVENTS, createNotifier, defaultAlertSettings, digestMessage, immediateMessage, parseAlertSettings } from './adminAlerts.js';

const MINUTE = 60_000;

function harness(overrides = {}) {
  let time = 1_000_000;
  const sent = [];
  const settings = { ...defaultAlertSettings(), ...overrides };
  const notifier = createNotifier({ now: () => time, settings: () => settings, deliver: async (message) => { sent.push(message); }, maxPerHour: overrides.maxPerHour ?? 20 });
  return { notifier, sent, settings, advance: (ms) => { time += ms; } };
}

describe('alert settings', () => {
  it('turns on everything except the server-start notice by default', () => {
    const defaults = defaultAlertSettings();
    expect(defaults.enabled).toBe(true);
    expect(defaults.events.deadlock).toBe(true);
    expect(defaults.events.user_registered).toBe(true);
    expect(defaults.events.server_started).toBe(false);
    expect(Object.keys(defaults.events).sort()).toEqual(ALERT_EVENTS.map((event) => event.id).sort());
  });

  it('merges changes over the current settings and validates recipients', () => {
    const parsed = parseAlertSettings({ events: { deadlock: false }, extraRecipients: 'Ops@Example.com, ops@example.com; second@example.com' });
    expect(parsed.events.deadlock).toBe(false);
    expect(parsed.events.backup_failed).toBe(true);
    expect(parsed.extraRecipients).toEqual(['ops@example.com', 'second@example.com']);
    expect(() => parseAlertSettings({ events: { nonsense: true } })).toThrow(/Unknown alert event/);
    expect(() => parseAlertSettings({ extraRecipients: ['not-an-address'] })).toThrow(/not an email address/);
    expect(() => parseAlertSettings({ extraRecipients: Array.from({ length: 11 }, (_, index) => `a${index}@example.com`) })).toThrow(/At most/);
    expect(parseAlertSettings({ enabled: false }).enabled).toBe(false);
  });
});

describe('immediate alerts', () => {
  it('sends an urgent event at once and counts repeats inside the cooldown into the next email', async () => {
    const { notifier, sent, advance } = harness();
    await notifier.handle('deadlock', { detail: 'Process 1 waits for ShareLock' });
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toContain('Database deadlock');
    expect(sent[0].text).toContain('ShareLock');
    await notifier.handle('deadlock', {});
    await notifier.handle('deadlock', {});
    expect(sent).toHaveLength(1);
    advance(61 * MINUTE);
    await notifier.handle('deadlock', {});
    expect(sent).toHaveLength(2);
    expect(sent[1].text).toContain('2 more of the same kind');
  });

  it('keeps separate cooldowns per event type', async () => {
    const { notifier, sent } = harness();
    await notifier.handle('deadlock', {});
    await notifier.handle('backup_failed', { message: 'No space left' });
    expect(sent.map((message) => message.subject)).toEqual([expect.stringContaining('deadlock'), expect.stringContaining('backup failed')]);
    expect(sent[1].text).toContain('No space left');
  });

  it('ignores disabled events and everything while alerts are off', async () => {
    const off = harness({ events: { ...defaultAlertSettings().events, deadlock: false } });
    await off.notifier.handle('deadlock', {});
    expect(off.sent).toHaveLength(0);
    const master = harness({ enabled: false });
    await master.notifier.handle('backup_failed', {});
    expect(master.sent).toHaveLength(0);
    const unknown = harness();
    await unknown.notifier.handle('made_up', {});
    expect(unknown.sent).toHaveLength(0);
  });

  it('never sends more than the hourly cap, so a storm cannot flood the inbox', async () => {
    const { notifier, sent, advance } = harness({ maxPerHour: 2, events: { ...defaultAlertSettings().events, server_started: true } });
    for (let index = 0; index < 5; index += 1) await notifier.handle('server_started', {});
    expect(sent).toHaveLength(2);
    advance(61 * MINUTE);
    await notifier.handle('server_started', {});
    expect(sent).toHaveLength(3);
  });
});

describe('digest alerts', () => {
  it('collects routine events into one email, grouped by type', async () => {
    const { notifier, sent } = harness();
    await notifier.handle('user_registered', { username: 'alice', email: 'alice@example.com' });
    await notifier.handle('user_registered', { username: 'bob', email: 'bob@example.com' });
    await notifier.handle('account_deleted', { username: 'carol' });
    expect(sent).toHaveLength(0);
    expect(notifier.pendingCount()).toBe(3);
    expect(await notifier.flushDigest()).toBe(3);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toContain('3 events to review');
    expect(sent[0].text).toContain('New account (2)');
    expect(sent[0].text).toContain('alice <alice@example.com>');
    expect(sent[0].text).toContain('Account deleted (1)');
    expect(notifier.pendingCount()).toBe(0);
    expect(await notifier.flushDigest()).toBe(0);
    expect(sent).toHaveLength(1);
  });

  it('counts the same subject once per digest', async () => {
    const { notifier, sent } = harness();
    for (let index = 0; index < 6; index += 1) await notifier.handle('login_lockout', { account: 'hero@example.com' }, { key: 'hero@example.com' });
    await notifier.handle('login_lockout', { account: 'other@example.com' }, { key: 'other@example.com' });
    await notifier.flushDigest();
    expect(sent[0].text).toContain('Sign-in lockout (2)');
    await notifier.handle('login_lockout', { account: 'hero@example.com' }, { key: 'hero@example.com' });
    expect(notifier.pendingCount()).toBe(1);
  });

  it('caps the lines shown per type', () => {
    const entries = Array.from({ length: 40 }, (_, index) => ({ type: 'user_registered', details: { username: `u${index}`, email: `u${index}@example.com` }, at: new Date() }));
    const message = digestMessage(entries);
    expect(message.text).toContain('New account (40)');
    expect(message.text).toContain('... and 25 more');
  });
});

describe('message text', () => {
  it('names health findings with their severity', () => {
    const message = immediateMessage('attention', { items: [{ severity: 'critical', title: 'Backups are old', detail: 'Newest is 40 days old' }] });
    expect(message.subject).toContain('Health warning');
    expect(message.text).toContain('[critical] Backups are old - Newest is 40 days old');
  });
});

describe('alert bus', () => {
  let bus;
  beforeEach(async () => { vi.resetModules(); bus = await import('./alertBus.js'); });
  afterEach(() => vi.restoreAllMocks());

  it('delivers events to every listener and survives a failing one', () => {
    const received = [];
    bus.onAlert(() => { throw new Error('boom'); });
    bus.onAlert(async () => { throw new Error('async boom'); });
    const stop = bus.onAlert((type, details, options) => received.push([type, details, options]));
    expect(() => bus.emitAlert('deadlock', { a: 1 }, { key: 'k' })).not.toThrow();
    expect(received).toEqual([['deadlock', { a: 1 }, { key: 'k' }]]);
    stop();
    bus.emitAlert('deadlock');
    expect(received).toHaveLength(1);
  });
});
