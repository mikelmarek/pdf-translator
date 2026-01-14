import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { Request } from 'express';

function envBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value.trim() === '') return defaultValue;
  const v = value.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'y';
}

function getTransporter(): Transporter | null {
  const host = process.env.SMTP_HOST;
  const portRaw = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const passRaw = process.env.SMTP_PASS;

  if (!host || !portRaw || !user || !passRaw) return null;

  // App passwords are often copied with spaces (e.g. Gmail). Normalize.
  const pass = passRaw.replace(/\s+/g, '');

  const port = Number(portRaw);
  if (!Number.isFinite(port) || port <= 0) return null;

  const secure = envBool(process.env.SMTP_SECURE, port === 465);

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

function detectSource(req: Request): string {
  if (process.env.VERCEL) return 'vercel';
  const host = req.headers.host || '';
  if (typeof host === 'string' && host.includes('localhost')) return 'localhost';
  return 'server';
}

type EmailSendResult =
  | { ok: true; source: string }
  | { ok: false; source: string; error: { message?: string; code?: string; responseCode?: number; response?: string } };

function buildLoginEmail(params: { username: string; req: Request }): {
  to: string;
  from: string;
  subject: string;
  text: string;
  source: string;
} {
  const to = process.env.LOGIN_NOTIFY_TO || 'mikelmarek.work@gmail.com';
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@localhost';

  const ip = (params.req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
    || params.req.socket.remoteAddress
    || 'unknown';
  const ua = params.req.headers['user-agent'] || 'unknown';
  const when = new Date().toISOString();
  const source = detectSource(params.req);

  const subject = `Login: ${params.username} (${source}) ${when}`;
  const text = [
    `Login detected`,
    ``,
    `Username: ${params.username}`,
    `Source: ${source}`,
    `Host: ${params.req.headers.host || 'unknown'}`,
    `Time: ${when}`,
    `IP: ${ip}`,
    `User-Agent: ${ua}`,
  ].join('\n');

  return { to, from, subject, text, source };
}

export async function trySendLoginEmail(params: { username: string; req: Request }): Promise<EmailSendResult> {
  const transporter = getTransporter();
  const { to, from, subject, text, source } = buildLoginEmail(params);
  if (!transporter) {
    return { ok: false, source, error: { message: 'SMTP not configured' } };
  }

  try {
    await transporter.sendMail({ to, from, subject, text });
    return { ok: true, source };
  } catch (e) {
    const err = e as any;
    return {
      ok: false,
      source,
      error: {
        message: err?.message,
        code: err?.code,
        responseCode: err?.responseCode,
        response: err?.response,
      },
    };
  }
}

export async function sendLoginEmail(params: {
  username: string;
  req: Request;
}): Promise<void> {
  const transporter = getTransporter();
  if (!transporter) return;

  const to = process.env.LOGIN_NOTIFY_TO || 'mikelmarek.work@gmail.com';
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@localhost';

  const ip = (params.req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
    || params.req.socket.remoteAddress
    || 'unknown';
  const ua = params.req.headers['user-agent'] || 'unknown';
  const when = new Date().toISOString();
  const source = detectSource(params.req);

  const subject = `Login: ${params.username} (${source}) ${when}`;
  const text = [
    `Login detected`,
    ``,
    `Username: ${params.username}`,
    `Source: ${source}`,
    `Host: ${params.req.headers.host || 'unknown'}`,
    `Time: ${when}`,
    `IP: ${ip}`,
    `User-Agent: ${ua}`,
  ].join('\n');

  await transporter.sendMail({
    to,
    from,
    subject,
    text,
  });
}

export function queueLoginEmail(params: { username: string; req: Request }): boolean {
  const transporter = getTransporter();
  if (!transporter) return false;

  const { to, from, subject, text } = buildLoginEmail(params);

  void transporter.sendMail({ to, from, subject, text }).catch((e) => {
    const err = e as any;
    console.warn('Login email failed', {
      message: err?.message,
      code: err?.code,
      responseCode: err?.responseCode,
      response: err?.response,
    });
  });

  return true;
}
