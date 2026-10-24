// Checks the SMTP settings in .env: connects, logs in, and sends one test message.
// Usage: npm run mail:test -- you@example.com
import { mailEnabled, mailSettings, sendMail, verifyMailConnection } from '../server/mailer.js';

const recipient = process.argv[2];
if (!mailEnabled()) {
  console.error('Email is not configured. Set SMTP_HOST and SMTP_FROM in .env.');
  process.exit(1);
}
if (!recipient || !/^\S+@\S+\.\S+$/.test(recipient)) {
  console.error('Usage: npm run mail:test -- you@example.com');
  process.exit(1);
}
const { host, port, secure, user } = mailSettings();
console.log(`Connecting to ${host}:${port} (${secure ? 'TLS' : 'STARTTLS'})${user ? ` as ${user}` : ' without login'}...`);
try {
  await verifyMailConnection();
  console.log('Connected and logged in.');
  const info = await sendMail({
    to: recipient,
    subject: 'Test email from Dragonbane Character Manager',
    text: 'If you can read this, outgoing email works.',
  });
  console.log(`Sent to ${recipient}. Server reply: ${info.response}`);
} catch (error) {
  console.error(`Failed: ${error.message}`);
  process.exit(1);
}
