import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const admin = { id: 'admin-1', role: 'admin', email: 'admin@example.test' };
const player = { id: 'player-1', role: 'player', email: 'player@example.test' };
const SECRET = 'x'.repeat(40);

function fakePool() {
  const rows = new Map();
  return {
    rows,
    async query(sql, params = []) {
      if (/SELECT value FROM app_settings/.test(sql)) return { rows: rows.has(params[0]) ? [{ value: rows.get(params[0]) }] : [] };
      if (/INSERT INTO app_settings/.test(sql)) { rows.set(params[0], JSON.parse(params[1])); return { rows: [] }; }
      if (/DELETE FROM app_settings/.test(sql)) { rows.delete(params[0]); return { rows: [] }; }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
}

describe('SMTP settings', () => {
  let pool;
  let smtp;
  let mailer;
  const form = { host: 'smtp.example.com', port: 587, from: 'Draconi <no-reply@example.com>', user: 'mailer', password: 'correct horse battery' };

  beforeEach(async () => {
    pool = fakePool();
    process.env.AI_KEY_ENCRYPTION_SECRET = SECRET;
    for (const key of ['SMTP_HOST', 'SMTP_FROM', 'SMTP_PASSWORD', 'SMTP_USER', 'SMTP_PORT']) delete process.env[key];
    vi.resetModules();
    vi.doMock('./db.js', () => ({ pool }));
    mailer = await import('./mailer.js');
    smtp = await import('./smtpSettings.js');
    smtp.resetSmtpTestLimit();
  });

  afterEach(() => {
    vi.doUnmock('./db.js');
    mailer.setStoredMailSettings(null);
    delete process.env.AI_KEY_ENCRYPTION_SECRET;
    for (const key of ['SMTP_HOST', 'SMTP_FROM', 'SMTP_PASSWORD']) delete process.env[key];
  });

  it('validates the form values', () => {
    expect(smtp.parseSmtpUpdate(form)).toMatchObject({ host: 'smtp.example.com', port: 587, secure: false, requireTls: true });
    expect(smtp.parseSmtpUpdate({ ...form, port: 465 }).secure).toBe(true);
    expect(() => smtp.parseSmtpUpdate({ ...form, host: 'bad host!' })).toThrow(/server name/);
    expect(() => smtp.parseSmtpUpdate({ ...form, host: '' })).toThrow(/server name/);
    expect(() => smtp.parseSmtpUpdate({ ...form, port: 70000 })).toThrow(/port/);
    expect(() => smtp.parseSmtpUpdate({ ...form, from: 'not-an-address' })).toThrow(/sender/);
    expect(() => smtp.parseSmtpUpdate({ ...form, from: 'a@b.co\nBcc: x@y.z' })).toThrow(/sender/);
    expect(smtp.validSender('no-reply@example.com')).toBe(true);
    expect(smtp.validSender('"Draconi RPG" <no-reply@example.com>')).toBe(true);
  });

  it('keeps, replaces and clears the password as asked, and drops it without a login name', () => {
    const current = { password: 'old-secret' };
    expect(smtp.parseSmtpUpdate({ ...form, password: undefined }, current).password).toBe('old-secret');
    expect(smtp.parseSmtpUpdate({ ...form, password: 'new-secret' }, current).password).toBe('new-secret');
    expect(smtp.parseSmtpUpdate({ ...form, password: null }, current).password).toBe('');
    expect(smtp.parseSmtpUpdate({ ...form, user: '', password: 'ignored' }, current).password).toBe('');
  });

  it('is for administrators only', async () => {
    await expect(smtp.getSmtpAdminView(player)).rejects.toMatchObject({ status: 403 });
    await expect(smtp.saveSmtp(player, form)).rejects.toMatchObject({ status: 403 });
    await expect(smtp.sendSmtpTest(player, {})).rejects.toMatchObject({ status: 403 });
  });

  it('stores the password encrypted, never returns it, and switches the mailer to the saved setup', async () => {
    const view = await smtp.saveSmtp(admin, form);
    expect(view).toMatchObject({ source: 'database', enabled: true, passwordSet: true, settings: { host: 'smtp.example.com', user: 'mailer' } });
    expect(JSON.stringify(view)).not.toContain('correct horse');
    expect(JSON.stringify([...pool.rows.values()])).not.toContain('correct horse');
    expect(mailer.mailSettings()).toMatchObject({ host: 'smtp.example.com', password: 'correct horse battery' });
    // Saving again without a password keeps the stored one.
    await smtp.saveSmtp(admin, { ...form, password: undefined, port: 2525 });
    expect(mailer.mailSettings()).toMatchObject({ port: 2525, password: 'correct horse battery' });
  });

  it('refuses to store a password without an encryption secret', async () => {
    delete process.env.AI_KEY_ENCRYPTION_SECRET;
    await expect(smtp.saveSmtp(admin, form)).rejects.toMatchObject({ status: 409, code: 'ENCRYPTION_SECRET_MISSING' });
    await expect(smtp.saveSmtp(admin, { ...form, user: '', password: undefined })).resolves.toMatchObject({ source: 'database' });
  });

  it('falls back to the environment when the saved setup is removed', async () => {
    process.env.SMTP_HOST = 'env.example.com';
    process.env.SMTP_FROM = 'env@example.com';
    await smtp.saveSmtp(admin, form);
    expect(mailer.mailSettings().host).toBe('smtp.example.com');
    const view = await smtp.clearSmtp(admin);
    expect(view).toMatchObject({ source: 'environment', settings: { host: 'env.example.com' } });
    expect(mailer.mailSettings().host).toBe('env.example.com');
  });

  it('tests with the unsaved form values, mailing the administrator, and reports the real failure', async () => {
    const send = vi.fn(async () => ({ response: '250 queued' }));
    await expect(smtp.sendSmtpTest(admin, { settings: form }, send)).resolves.toMatchObject({ ok: true, to: 'admin@example.test' });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp.example.com', password: 'correct horse battery' }), expect.objectContaining({ to: 'admin@example.test' }));
    const failing = vi.fn(async () => { throw new Error('Invalid login: 535 5.7.8 Authentication failed'); });
    await expect(smtp.sendSmtpTest(admin, { settings: form }, failing)).rejects.toMatchObject({ status: 502, code: 'SMTP_FAILED', message: expect.stringContaining('535') });
    await expect(smtp.sendSmtpTest(admin, {}, send)).rejects.toMatchObject({ code: 'EMAIL_DISABLED' });
  });

  it('limits how many test emails can be sent in a short time', async () => {
    const send = vi.fn(async () => ({ response: 'ok' }));
    for (let index = 0; index < 10; index += 1) await smtp.sendSmtpTest(admin, { settings: form }, send);
    await expect(smtp.sendSmtpTest(admin, { settings: form }, send)).rejects.toMatchObject({ status: 429 });
  });
});
