import nodemailer from 'nodemailer';

let cachedTransport = null;
let cachedKey = '';

// Settings an administrator saved in the app. They take precedence over the SMTP_* environment variables
// whenever the process reads the real environment (tests pass their own env object and are unaffected).
let storedSettings = null;

export function setStoredMailSettings(settings) {
  storedSettings = settings || null;
}

export function mailSettings(env = process.env) {
  if (env === process.env && storedSettings?.host) {
    return {
      host: storedSettings.host,
      port: storedSettings.port,
      secure: storedSettings.secure,
      requireTls: storedSettings.requireTls,
      user: storedSettings.user,
      // A saved setup without its own password keeps using the one from the environment, if any.
      password: storedSettings.password || String(env.SMTP_PASSWORD || ''),
      from: storedSettings.from,
    };
  }
  return mailSettingsFromEnv(env);
}

/** The setup described by SMTP_* environment variables only, ignoring anything saved in the app. */
export function mailSettingsFromEnv(env = process.env) {
  const host = String(env.SMTP_HOST || '').trim();
  const port = Number(env.SMTP_PORT || 587);
  return {
    host,
    port: Number.isInteger(port) && port > 0 && port < 65536 ? port : 587,
    // Port 465 uses TLS from the first byte; the other usual ports upgrade with STARTTLS.
    secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465,
    requireTls: env.SMTP_REQUIRE_TLS !== 'false',
    user: String(env.SMTP_USER || '').trim(),
    password: String(env.SMTP_PASSWORD || ''),
    from: String(env.SMTP_FROM || '').trim(),
  };
}

export function mailEnabled(env = process.env) {
  const settings = mailSettings(env);
  return Boolean(settings.host && settings.from);
}

function transportFor(env) {
  return transportForSettings(mailSettings(env));
}

function transportForSettings(settings) {
  const key = JSON.stringify(settings);
  if (cachedTransport && cachedKey === key) return cachedTransport;
  cachedTransport = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    requireTLS: !settings.secure && settings.requireTls,
    auth: settings.user ? { user: settings.user, pass: settings.password } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  cachedKey = key;
  return cachedTransport;
}

// Resolves when the SMTP server accepted the message. `transport` is injectable for tests.
export async function sendMail({ to, subject, text, html }, { env = process.env, transport = null } = {}) {
  if (!mailEnabled(env)) throw new Error('Email is not configured (set SMTP_HOST and SMTP_FROM)');
  const settings = mailSettings(env);
  return (transport || transportFor(env)).sendMail({ from: settings.from, to, subject, text, html });
}

export async function verifyMailConnection(env = process.env) {
  if (!mailEnabled(env)) throw new Error('Email is not configured (set SMTP_HOST and SMTP_FROM)');
  await transportFor(env).verify();
}

// Sends through explicit settings (a form the administrator has not saved yet) without touching the saved ones.
export async function sendMailWith(settings, { to, subject, text }) {
  const transport = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    requireTLS: !settings.secure && settings.requireTls,
    auth: settings.user ? { user: settings.user, pass: settings.password } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  try {
    await transport.verify();
    return await transport.sendMail({ from: settings.from, to, subject, text });
  } finally {
    transport.close();
  }
}
