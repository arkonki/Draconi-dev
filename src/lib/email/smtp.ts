import nodemailer from 'nodemailer';
import { EmailTemplate } from './templates';
import { checkRateLimit, EmailRateLimitError } from './rateLimiter';
import { logEmailEvent, logEmailError } from './logger';

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

let transporter: nodemailer.Transporter | null = null;

export async function initializeSmtp(config: SmtpConfig) {
  transporter = nodemailer.createTransport(config);
  
  try {
    // Verify SMTP connection
    await transporter.verify();
    logEmailEvent('smtp_initialized', { host: config.host, port: config.port });
    return true;
  } catch (error) {
    logEmailError(error as Error, { 
      context: 'smtp_initialization',
      host: config.host,
      port: config.port
    });
    transporter = null;
    return false;
  }
}

export async function sendEmail(
  to: string,
  template: EmailTemplate,
  userId: string,
  from?: string
) {
  if (!transporter) {
    const error = new Error('SMTP not initialized');
    logEmailError(error, { context: 'send_email', to, template: template.subject });
    throw error;
  }

  try {
    // Check rate limits before sending
    await checkRateLimit(userId);

    const startTime = Date.now();
    const info = await transporter.sendMail({
      from: from || process.env.SMTP_FROM_ADDRESS,
      to,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });

    const duration = Date.now() - startTime;

    // Log successful email send
    logEmailEvent('email_sent', {
      messageId: info.messageId,
      to,
      subject: template.subject,
      userId,
      duration,
    });

    return true;
  } catch (error) {
    if (error instanceof EmailRateLimitError) {
      logEmailEvent('rate_limit_exceeded', {
        userId,
        to,
        subject: template.subject
      });
    } else {
      logEmailError(error as Error, {
        context: 'send_email',
        to,
        subject: template.subject,
        userId
      });
    }
    throw error;
  }
}
