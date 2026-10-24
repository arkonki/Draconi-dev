import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mailEnabled, mailSettings } from './mailer.js';

// A small in-memory stand-in for the users, auth_tokens, app_credentials and app_sessions tables.
function fakeDatabase() {
  const state = {
    users: [{ id: 'u1', email: 'hero@example.com', username: 'hero', is_active: true, is_email_verified: false }],
    tokens: [], credentials: { u1: 'old-hash' }, sessions: ['u1'], mails: [],
  };
  const query = async (sql, params = []) => {
    if (/FROM users WHERE lower\(email\)/.test(sql)) {
      return { rows: state.users.filter((u) => u.email === params[0] && u.is_active && (!/is_email_verified = false/.test(sql) || !u.is_email_verified)) };
    }
    if (/DELETE FROM auth_tokens WHERE expires_at/.test(sql)) return { rows: [] };
    if (/DELETE FROM auth_tokens WHERE user_id = \$1 AND purpose = \$2/.test(sql)) {
      state.tokens = state.tokens.filter((t) => !(t.user_id === params[0] && t.purpose === params[1] && !t.used_at));
      return { rows: [] };
    }
    if (/DELETE FROM auth_tokens WHERE user_id = \$1 AND purpose = 'reset_password'/.test(sql)) {
      state.tokens = state.tokens.filter((t) => !(t.user_id === params[0] && t.purpose === 'reset_password'));
      return { rows: [] };
    }
    if (/INSERT INTO auth_tokens/.test(sql)) {
      state.tokens.push({ token_hash: params[0], user_id: params[1], purpose: params[2], hours: params[3], used_at: null, expired: false });
      return { rows: [] };
    }
    if (/UPDATE auth_tokens SET used_at/.test(sql)) {
      const token = state.tokens.find((t) => t.token_hash === params[0] && t.purpose === params[1] && !t.used_at && !t.expired);
      if (!token) return { rows: [] };
      token.used_at = Date.now();
      return { rows: [{ user_id: token.user_id }] };
    }
    if (/UPDATE users SET is_email_verified/.test(sql)) { state.users.find((u) => u.id === params[0]).is_email_verified = true; return { rows: [] }; }
    if (/UPDATE app_credentials/.test(sql)) { state.credentials[params[1]] = params[0]; return { rows: [] }; }
    if (/DELETE FROM app_sessions/.test(sql)) { state.sessions = state.sessions.filter((id) => id !== params[0]); return { rows: [] }; }
    throw new Error(`Unexpected query: ${sql}`);
  };
  return { state, pool: { query }, withTransaction: async (callback) => callback({ query }) };
}

const smtp = { SMTP_HOST: 'smtp.example.com', SMTP_FROM: 'Draconi <no-reply@example.com>' };
const request = (address = '10.0.0.1') => ({ headers: { 'x-forwarded-for': address } });

describe('mail settings', () => {
  it('needs a host and a sender, and picks TLS from the port', () => {
    expect(mailEnabled({})).toBe(false);
    expect(mailEnabled({ SMTP_HOST: 'smtp.example.com' })).toBe(false);
    expect(mailEnabled(smtp)).toBe(true);
    expect(mailSettings({ ...smtp, SMTP_PORT: '465' })).toMatchObject({ port: 465, secure: true });
    expect(mailSettings({ ...smtp, SMTP_PORT: '587' })).toMatchObject({ port: 587, secure: false });
    expect(mailSettings({ ...smtp, SMTP_PORT: 'nonsense' }).port).toBe(587);
  });
});

describe('account emails', () => {
  let database;
  let accountEmails;
  let sent;

  beforeEach(async () => {
    database = fakeDatabase();
    sent = [];
    Object.assign(process.env, smtp, { PUBLIC_BASE_URL: 'https://draconi.example' });
    vi.resetModules();
    vi.doMock('./db.js', () => ({ pool: database.pool, withTransaction: database.withTransaction }));
    vi.doMock('./mailer.js', async (original) => ({ ...(await original()), sendMail: async (message) => { sent.push(message); } }));
    accountEmails = await import('./accountEmails.js');
    accountEmails.resetRequestLimits();
  });

  afterEach(() => {
    vi.doUnmock('./db.js');
    vi.doUnmock('./mailer.js');
    for (const key of Object.keys(smtp)) delete process.env[key];
    delete process.env.PUBLIC_BASE_URL;
  });

  const tokenFrom = (message) => new URL(message.text.match(/https?:\/\/\S+/)[0]).searchParams.get('token');

  it('emails a one-time reset link, and answers the same way for an unknown address', async () => {
    await expect(accountEmails.requestPasswordReset(request(), { email: 'Hero@Example.com' })).resolves.toEqual({ ok: true });
    await expect(accountEmails.requestPasswordReset(request(), { email: 'nobody@example.com' })).resolves.toEqual({ ok: true });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: 'hero@example.com' });
    expect(sent[0].text).toContain('https://draconi.example/reset-password?token=');
    expect(database.state.tokens[0].token_hash).not.toBe(tokenFrom(sent[0]));
  });

  it('resets the password once, signs the person out everywhere and confirms their email', async () => {
    await accountEmails.requestPasswordReset(request(), { email: 'hero@example.com' });
    const token = tokenFrom(sent[0]);
    const hash = vi.fn((password) => `hashed:${password}`);
    await accountEmails.resetPassword({ token, password: 'a-new-password' }, hash);
    expect(database.state.credentials.u1).toBe('hashed:a-new-password');
    expect(database.state.sessions).toEqual([]);
    expect(database.state.users[0].is_email_verified).toBe(true);
    await expect(accountEmails.resetPassword({ token, password: 'another-one-1' }, hash)).rejects.toMatchObject({ status: 400, code: 'TOKEN_INVALID' });
    await expect(accountEmails.resetPassword({ token: 'forged', password: 'another-one-1' }, hash)).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
  });

  it('does not use up a reset link when the new password is rejected', async () => {
    await accountEmails.requestPasswordReset(request(), { email: 'hero@example.com' });
    const token = tokenFrom(sent[0]);
    const strict = (password) => { if (password.length < 8) throw Object.assign(new Error('short'), { status: 400 }); return 'h'; };
    await expect(accountEmails.resetPassword({ token, password: 'short' }, strict)).rejects.toThrow('short');
    await expect(accountEmails.resetPassword({ token, password: 'long-enough-1' }, strict)).resolves.toEqual({ ok: true });
  });

  it('confirms an email address with a verification link, only once', async () => {
    await accountEmails.sendVerificationEmail(database.state.users[0]);
    expect(sent[0].text).toContain('https://draconi.example/verify-email?token=');
    const token = tokenFrom(sent[0]);
    await accountEmails.verifyEmail({ token });
    expect(database.state.users[0].is_email_verified).toBe(true);
    await expect(accountEmails.verifyEmail({ token })).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
  });

  it('only resends verification to accounts that are still unverified', async () => {
    await accountEmails.resendVerification(request(), { email: 'hero@example.com' });
    expect(sent).toHaveLength(1);
    database.state.users[0].is_email_verified = true;
    await accountEmails.resendVerification(request(), { email: 'hero@example.com' });
    expect(sent).toHaveLength(1);
  });

  it('limits requests per email address and refuses when email is not configured', async () => {
    for (let index = 0; index < 5; index += 1) await accountEmails.requestPasswordReset(request(`10.0.1.${index}`), { email: 'hero@example.com' });
    await expect(accountEmails.requestPasswordReset(request('10.0.9.9'), { email: 'hero@example.com' }))
      .rejects.toMatchObject({ status: 429, code: 'RATE_LIMITED' });
    delete process.env.SMTP_HOST;
    await expect(accountEmails.requestPasswordReset(request(), { email: 'other@example.com' })).rejects.toMatchObject({ status: 503, code: 'EMAIL_DISABLED' });
  });
});
