import { getDb } from '../db/index.js';
import { v4 as uuid } from 'uuid';

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export class EmailService {
  private transporter: any = null;

  constructor() {
    const host = process.env.SMTP_HOST || '';
    const port = parseInt(process.env.SMTP_PORT || '587');
    const user = process.env.SMTP_USER || '';
    const pass = process.env.SMTP_PASS || '';

    if (host && user) {
      // nodemailer createTransport would go here
      // this.transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
      console.log(`[Email] SMTP configured: ${host}:${port}`);
    } else {
      console.log('[Email] SMTP not configured — emails will be logged');
    }
  }

  isConfigured(): boolean {
    return !!process.env.SMTP_HOST && !!process.env.SMTP_USER;
  }

  async send(payload: EmailPayload): Promise<void> {
    if (this.transporter) {
      // await this.transporter.sendMail({ from: process.env.SMTP_FROM || 'noreply@echo-gpt.app', ...payload });
      console.log(`[Email] Sent to ${payload.to}: ${payload.subject}`);
    } else {
      // Log instead of sending
      console.log(`[Email] Would send to ${payload.to}: ${payload.subject}`);
      // Store in DB for debugging
      const db = getDb();
      db.prepare(
        'INSERT INTO email_logs (id, recipient, subject, body, created_at) VALUES (?, ?, ?, ?, ?)',
      ).run(uuid(), payload.to, payload.subject, payload.html, new Date().toISOString());
    }
  }

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const url = `${process.env.APP_URL || 'http://localhost:5173'}/verify-email?token=${token}`;
    await this.send({
      to: email,
      subject: 'Verify your Echo GPT email',
      html: `<p>Click <a href="${url}">here</a> to verify your email address.</p>`,
    });
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const url = `${process.env.APP_URL || 'http://localhost:5173'}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
    await this.send({
      to: email,
      subject: 'Reset your Echo GPT password',
      html: `<p>Click <a href="${url}">here</a> to reset your password. This link expires in 1 hour.</p>`,
    });
  }

  async sendNotification(email: string, title: string, body: string): Promise<void> {
    await this.send({ to: email, subject: title, html: `<p>${body}</p>` });
  }
}

export const emailService = new EmailService();
