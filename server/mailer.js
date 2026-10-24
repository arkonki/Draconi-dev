import nodemailer from 'nodemailer';

let cachedTransport = null;
let cachedKey = '';

export function mailSettings(env = process.env) {
  const host = String(env.SMTP_HOST || '').trim();
  const port = Number(env.SMTP_PORT || 587);
  return {
    host,
    port: Number.isInteger(port) && port > 0 && port < 65536 ? port : 587,
    // Port 465 uses TLS from the first byte; the other usual ports upgrade with STARTTLS.
    secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465,
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
  const settings = mailSettings(env);
  const key = JSON.stringify(settings);
  if (cachedTransport && cachedKey === key) return cachedTransport;
  cachedTransport = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    requireTLS: !settings.secure && env.SMTP_REQUIRE_TLS !== 'false',
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
