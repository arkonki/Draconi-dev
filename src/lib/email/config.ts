import { initializeSmtp } from './smtp';

export async function setupEmailSystem() {
  // Validate required environment variables
  const requiredVars = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'];
  const missingVars = requiredVars.filter(varName => !import.meta.env[varName]);
  
  if (missingVars.length > 0) {
    console.error('Missing required environment variables:', missingVars.join(', '));
    return false;
  }

  const config = {
    host: import.meta.env.SMTP_HOST,
    port: parseInt(import.meta.env.SMTP_PORT, 10),
    secure: true,
    auth: {
      user: import.meta.env.SMTP_USER,
      pass: import.meta.env.SMTP_PASS
    }
  };

  const success = await initializeSmtp(config);
  if (!success) {
    console.error('Failed to initialize email system');
  }
  return success;
}
