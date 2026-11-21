import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import tls from 'node:tls';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';

function resolveServerPort(): number {
  // In reverse-proxied Cloud Run / AI Studio environments, outer Nginx occupies NGINX_PORT (often
  // exported as PORT=8080) while forwarding app traffic to DEFAULT_APP_PORT (3000).
  if (process.env.NGINX_PORT && process.env.PORT === process.env.NGINX_PORT) {
    return Number(process.env.DEFAULT_APP_PORT || 3000);
  }
  return Number(process.env.PORT || process.env.DEFAULT_APP_PORT || 3000);
}

const PORT = resolveServerPort();
const IS_PROD = process.env.NODE_ENV === 'production';
const DB_PATH = process.env.SQLITE_PATH || path.join(process.cwd(), 'data', 'diecut.db');
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'totale.room@gmail.com').trim().toLowerCase();
const ADMIN_INITIAL_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD || 'DieCutAdmin2026!';
const COOKIE_NAME = 'diecut_session';
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 14; // 14 days

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

function isEnvPlaceholder(val: string | undefined): boolean {
  if (!val) return true;
  const trimmed = val.trim().toLowerCase();
  return (
    trimmed.length === 0 ||
    trimmed.startsWith('replace-with-') ||
    trimmed.startsWith('changethis') ||
    trimmed === 'change_this'
  );
}

function resolveSessionSecret(): string {
  const envSecret = (process.env.SESSION_SECRET || '').trim();
  if (envSecret.length >= 16 && !isEnvPlaceholder(envSecret)) {
    return envSecret;
  }
  const secretFile = path.join(path.dirname(DB_PATH), '.session_secret');
  if (fs.existsSync(secretFile)) {
    const saved = fs.readFileSync(secretFile, 'utf8').trim();
    if (saved.length >= 32) return saved;
  }
  const generated = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(secretFile, generated, { mode: 0o600 });
  return generated;
}

const SESSION_SECRET = resolveSessionSecret();

// Initialize embedded SQLite database
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    company TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    status TEXT NOT NULL DEFAULT 'pending',
    access_origin TEXT NOT NULL DEFAULT '',
    access_path TEXT NOT NULL DEFAULT '',
    access_referrer TEXT NOT NULL DEFAULT '',
    device_summary TEXT NOT NULL DEFAULT '',
    timezone TEXT NOT NULL DEFAULT '',
    last_ip TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    last_login_at TEXT
  );

  CREATE TABLE IF NOT EXISTS bct_history (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    label TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS saved_projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    box_style TEXT NOT NULL,
    dims_summary TEXT NOT NULL,
    config_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_history_user ON bct_history(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_projects_user ON saved_projects(user_id, updated_at DESC);

  CREATE TABLE IF NOT EXISTS system_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'info',
    actor_email TEXT NOT NULL DEFAULT '',
    target_email TEXT NOT NULL DEFAULT '',
    detail TEXT NOT NULL DEFAULT '',
    ip_address TEXT NOT NULL DEFAULT '',
    origin TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
`);

function ensureUsersColumn(name: string, ddl: string) {
  const cols = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === name)) {
    db.exec(`ALTER TABLE users ADD COLUMN ${ddl};`);
  }
}

ensureUsersColumn('token_version', 'token_version INTEGER NOT NULL DEFAULT 1');
ensureUsersColumn('failed_login_count', 'failed_login_count INTEGER NOT NULL DEFAULT 0');
ensureUsersColumn('locked_until', 'locked_until TEXT');

function getSystemMeta(key: string): { value: string; updatedAt: string } | null {
  const row = db
    .prepare('SELECT value, updated_at FROM system_meta WHERE key = ? LIMIT 1')
    .get(key) as { value: string; updated_at: string } | undefined;
  return row ? { value: row.value, updatedAt: row.updated_at } : null;
}

function setSystemMeta(key: string, value: string) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO system_meta (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, value, now);
}

function deleteSystemMeta(key: string) {
  db.prepare('DELETE FROM system_meta WHERE key = ?').run(key);
}

const SMTP_CRYPTO_KEY = crypto.scryptSync(SESSION_SECRET, 'diecut-smtp-aes256-v1', 32);

function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', SMTP_CRYPTO_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

function decryptSecret(payload: string): string {
  const parts = payload.split('.');
  if (parts.length !== 3) return '';
  try {
    const iv = Buffer.from(parts[0], 'base64url');
    const tag = Buffer.from(parts[1], 'base64url');
    const ciphertext = Buffer.from(parts[2], 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', SMTP_CRYPTO_KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

interface SmtpConfig {
  source: 'console' | 'env';
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

interface StoredConsoleSmtp {
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  passEnc?: string;
  from?: string;
}

function getConsoleSmtpRaw(): StoredConsoleSmtp | null {
  const meta = getSystemMeta('admin_smtp_config_json');
  if (!meta?.value) return null;
  try {
    return JSON.parse(meta.value) as StoredConsoleSmtp;
  } catch {
    return null;
  }
}

function resolveSmtpConfig(): SmtpConfig | null {
  const consoleCfg = getConsoleSmtpRaw();
  if (consoleCfg?.host && consoleCfg.host.trim()) {
    const port = Number(consoleCfg.port) || 587;
    const pass = consoleCfg.passEnc ? decryptSecret(consoleCfg.passEnc) : '';
    const user = (consoleCfg.user || '').trim();
    const from = (consoleCfg.from || user || `noreply@${consoleCfg.host.trim()}`).trim();
    if (user && pass) {
      return {
        source: 'console',
        host: consoleCfg.host.trim(),
        port,
        secure: typeof consoleCfg.secure === 'boolean' ? consoleCfg.secure : port === 465,
        user,
        pass,
        from,
      };
    }
  }

  const host = (process.env.SMTP_HOST || '').trim();
  const user = (process.env.SMTP_USER || '').trim();
  const pass = (process.env.SMTP_PASS || '').trim();
  if (!host || isEnvPlaceholder(host) || !user || !pass || isEnvPlaceholder(pass)) {
    return null;
  }
  const port = Number(process.env.SMTP_PORT || 587);
  const secureEnv = (process.env.SMTP_SECURE || '').trim().toLowerCase();
  const secure = secureEnv === 'true' ? true : secureEnv === 'false' ? false : port === 465;
  const from = (process.env.SMTP_FROM || user).trim();
  return { source: 'env', host, port, secure, user, pass, from };
}

function sanitizeHeaderVal(str: string): string {
  return str.replace(/[\r\n]+/g, ' ').trim();
}

async function sendSmtpEmail(
  cfg: SmtpConfig,
  opts: { to: string; subject: string; text: string }
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let socket: net.Socket | tls.TLSSocket;

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      try {
        socket?.destroy();
      } catch {
        // ignore
      }
      reject(err);
    };

    const succeed = () => {
      if (settled) return;
      settled = true;
      try {
        socket?.end();
      } catch {
        // ignore
      }
      resolve();
    };

    const createLineReader = (s: net.Socket | tls.TLSSocket) => {
      let buffer = '';
      let lines: string[] = [];
      let waiter: ((res: { code: number; lines: string[] }) => void) | null = null;
      let errWaiter: ((err: Error) => void) | null = null;

      const onData = (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        let nlIdx: number;
        while ((nlIdx = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, nlIdx).replace(/\r$/, '');
          buffer = buffer.slice(nlIdx + 1);
          lines.push(line);
          if (/^\d{3} /.test(line) && waiter) {
            const code = Number(line.slice(0, 3));
            const out = lines;
            lines = [];
            const cb = waiter;
            waiter = null;
            errWaiter = null;
            cb({ code, lines: out });
          }
        }
      };

      const onError = (err: Error) => {
        if (errWaiter) {
          const cb = errWaiter;
          waiter = null;
          errWaiter = null;
          cb(err);
        } else {
          fail(err);
        }
      };

      const onClose = () => {
        if (errWaiter) {
          const cb = errWaiter;
          waiter = null;
          errWaiter = null;
          cb(new Error('Koneksi SMTP terputus sebelum selesai.'));
        }
      };

      s.on('data', onData);
      s.on('error', onError);
      s.on('close', onClose);

      return {
        readReply: () =>
          new Promise<{ code: number; lines: string[] }>((res, rej) => {
            waiter = res;
            errWaiter = rej;
          }),
        detach: () => {
          s.off('data', onData);
          s.off('error', onError);
          s.off('close', onClose);
        },
      };
    };

    const runProtocol = async () => {
      socket.setTimeout(15000, () => fail(new Error('Timeout koneksi ke server SMTP (15s).')));

      let reader = createLineReader(socket);
      const sendCmd = async (cmd: string, expectedCodes: number[]) => {
        socket.write(`${cmd}\r\n`);
        const reply = await reader.readReply();
        if (!expectedCodes.includes(reply.code)) {
          throw new Error(`SMTP error (${reply.code}): ${reply.lines.join(' | ')}`);
        }
        return reply;
      };

      const greeting = await reader.readReply();
      if (greeting.code !== 220) {
        throw new Error(`SMTP greeting invalid (${greeting.code})`);
      }

      const ehloDomain = sanitizeHeaderVal(cfg.host) || 'localhost';
      let ehlo = await sendCmd(`EHLO ${ehloDomain}`, [250]);

      if (!cfg.secure && ehlo.lines.some((l) => l.toUpperCase().includes('STARTTLS'))) {
        await sendCmd('STARTTLS', [220]);
        reader.detach();
        socket = await new Promise<tls.TLSSocket>((resTls, rejTls) => {
          const upgraded = tls.connect(
            {
              socket: socket as net.Socket,
              servername: cfg.host,
              minVersion: 'TLSv1.2',
            },
            () => resTls(upgraded)
          );
          upgraded.once('error', rejTls);
        });
        socket.setTimeout(15000, () => fail(new Error('Timeout TLS SMTP (15s).')));
        reader = createLineReader(socket);
        ehlo = await sendCmd(`EHLO ${ehloDomain}`, [250]);
      }

      const authCaps = ehlo.lines.join(' ').toUpperCase();
      if (authCaps.includes('PLAIN')) {
        const token = Buffer.from(`\0${cfg.user}\0${cfg.pass}`, 'utf8').toString('base64');
        await sendCmd(`AUTH PLAIN ${token}`, [235]);
      } else {
        await sendCmd('AUTH LOGIN', [334]);
        await sendCmd(Buffer.from(cfg.user, 'utf8').toString('base64'), [334]);
        await sendCmd(Buffer.from(cfg.pass, 'utf8').toString('base64'), [235]);
      }

      const fromAddrMatch = cfg.from.match(/<([^>]+)>/);
      const envelopeFrom = sanitizeHeaderVal(fromAddrMatch ? fromAddrMatch[1] : cfg.from);
      const envelopeTo = sanitizeHeaderVal(opts.to);

      await sendCmd(`MAIL FROM:<${envelopeFrom}>`, [250]);
      await sendCmd(`RCPT TO:<${envelopeTo}>`, [250, 251]);
      await sendCmd('DATA', [354]);

      const messageId = `<${crypto.randomUUID()}@diecut.room>`;
      const headers = [
        `From: ${sanitizeHeaderVal(cfg.from)}`,
        `To: ${envelopeTo}`,
        `Subject: ${sanitizeHeaderVal(opts.subject)}`,
        `Date: ${new Date().toUTCString()}`,
        `Message-ID: ${messageId}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
      ].join('\r\n');

      const stuffedBody = opts.text
        .replace(/\r?\n/g, '\r\n')
        .split('\r\n')
        .map((line) => (line.startsWith('.') ? `.${line}` : line))
        .join('\r\n');

      socket.write(`${headers}\r\n\r\n${stuffedBody}\r\n.\r\n`);
      const dataReply = await reader.readReply();
      if (dataReply.code !== 250) {
        throw new Error(`SMTP DATA rejected (${dataReply.code}): ${dataReply.lines.join(' ')}`);
      }

      try {
        await sendCmd('QUIT', [221]);
      } catch {
        // ignore QUIT failure after 250 OK
      }
      succeed();
    };

    if (cfg.secure) {
      socket = tls.connect(
        { host: cfg.host, port: cfg.port, servername: cfg.host, minVersion: 'TLSv1.2' },
        () => {
          void runProtocol().catch(fail);
        }
      );
      socket.once('error', fail);
    } else {
      socket = net.connect({ host: cfg.host, port: cfg.port }, () => {
        void runProtocol().catch(fail);
      });
      socket.once('error', fail);
    }
  });
}

function generateHumanRecoveryKey(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(16);
  let raw = '';
  for (let i = 0; i < 16; i++) {
    raw += alphabet[bytes[i] % alphabet.length];
  }
  return `DCR-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
}

function recordAuditLog(params: {
  eventType: string;
  severity?: 'info' | 'warning' | 'critical';
  actorEmail?: string;
  targetEmail?: string;
  detail?: string;
  ipAddress?: string;
  origin?: string;
}) {
  try {
    db.prepare(
      `INSERT INTO audit_logs (id, event_type, severity, actor_email, target_email, detail, ip_address, origin, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      params.eventType,
      params.severity || 'info',
      (params.actorEmail || '').slice(0, 140),
      (params.targetEmail || '').slice(0, 140),
      (params.detail || '').slice(0, 300),
      (params.ipAddress || '').slice(0, 64),
      (params.origin || '').slice(0, 200),
      new Date().toISOString()
    );

    // Keep audit table compact for constrained VPS storage (max 500 newest rows)
    db.prepare(
      `DELETE FROM audit_logs
       WHERE id NOT IN (SELECT id FROM audit_logs ORDER BY created_at DESC LIMIT 500)`
    ).run();
  } catch {
    // Non-fatal: audit log write failure must never break auth requests
  }
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

function timingSafeStringMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Seed initial Admin user if missing
function ensureAdminAccount() {
  const existingAdmin = db
    .prepare("SELECT id, email, role, status FROM users WHERE role = 'admin' LIMIT 1")
    .get() as { id: string; email: string; role: string; status: string } | undefined;

  if (!existingAdmin) {
    const existingByEmail = db
      .prepare('SELECT id FROM users WHERE email = ? LIMIT 1')
      .get(ADMIN_EMAIL) as { id: string } | undefined;

    if (existingByEmail) {
      db.prepare("UPDATE users SET role = 'admin', status = 'active' WHERE id = ?").run(
        existingByEmail.id
      );
    } else {
      db.prepare(
        `INSERT INTO users (id, name, email, company, password_hash, role, status, access_origin, created_at)
         VALUES (?, ?, ?, ?, ?, 'admin', 'active', 'system-bootstrap', ?)`
      ).run(
        crypto.randomUUID(),
        'DieCut Administrator',
        ADMIN_EMAIL,
        'DieCut.Room Admin',
        hashPassword(ADMIN_INITIAL_PASSWORD),
        new Date().toISOString()
      );
    }
  }
}

ensureAdminAccount();

interface UserRow {
  id: string;
  name: string;
  email: string;
  company: string;
  password_hash: string;
  role: 'admin' | 'user';
  status: 'pending' | 'active' | 'disabled';
  access_origin: string;
  access_path: string;
  access_referrer: string;
  device_summary: string;
  timezone: string;
  last_ip: string;
  created_at: string;
  last_login_at: string | null;
  token_version: number;
  failed_login_count: number;
  locked_until: string | null;
}

function sanitizeUser(row: UserRow) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    company: row.company,
    role: row.role,
    status: row.status,
    accessOrigin: row.access_origin,
    accessPath: row.access_path,
    accessReferrer: row.access_referrer,
    deviceSummary: row.device_summary,
    timezone: row.timezone,
    lastIp: row.last_ip,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

function signSessionToken(userId: string, tokenVersion = 1): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SEC;
  const payload = Buffer.from(JSON.stringify({ uid: userId, tv: tokenVersion, exp })).toString(
    'base64url'
  );
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifySessionToken(token: string): { uid: string; tv: number } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      uid?: string;
      tv?: number;
      exp?: number;
    };
    if (!parsed.uid || !parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return {
      uid: parsed.uid,
      tv: typeof parsed.tv === 'number' ? parsed.tv : 1,
    };
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  cookieHeader.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    if (key) {
      try {
        out[key] = decodeURIComponent(val);
      } catch {
        out[key] = val;
      }
    }
  });
  return out;
}

function isHttpsRequest(req: Request): boolean {
  const proto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  const origin = String(req.headers.origin || '').toLowerCase();
  const referer = String(req.headers.referer || '').toLowerCase();
  return (
    req.secure ||
    proto.includes('https') ||
    origin.startsWith('https://') ||
    referer.startsWith('https://')
  );
}

function setSessionCookie(req: Request, res: Response, token: string) {
  const https = isHttpsRequest(req);
  const attrs = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${SESSION_MAX_AGE_SEC}`,
    https ? 'SameSite=None; Secure; Partitioned' : 'SameSite=Lax',
  ];
  res.setHeader('Set-Cookie', attrs.join('; '));
}

function clearSessionCookie(req: Request, res: Response) {
  const https = isHttpsRequest(req);
  const attrs = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
    https ? 'SameSite=None; Secure; Partitioned' : 'SameSite=Lax',
  ];
  res.setHeader('Set-Cookie', attrs.join('; '));
}

function extractSessionToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies[COOKIE_NAME] || null;
}

function clipStr(val: unknown, max = 260): string {
  return typeof val === 'string' ? val.trim().slice(0, max) : '';
}

function extractClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim().slice(0, 64);
  }
  return (req.ip || req.socket.remoteAddress || '').slice(0, 64);
}

interface AuthedRequest extends Request {
  authUser?: UserRow;
}

// Sliding-window in-memory rate limiter for brute-force auth/recovery protection
const ipAttemptBuckets = new Map<string, number[]>();

function checkIpRateLimit(bucketKey: string, maxAttempts: number, windowMs: number): number {
  const now = Date.now();
  const prev = (ipAttemptBuckets.get(bucketKey) || []).filter((ts) => now - ts < windowMs);
  if (prev.length >= maxAttempts) {
    const oldest = prev[0];
    return Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
  }
  ipAttemptBuckets.set(bucketKey, prev);
  return 0;
}

function recordIpAttempt(bucketKey: string, windowMs: number) {
  const now = Date.now();
  const prev = (ipAttemptBuckets.get(bucketKey) || []).filter((ts) => now - ts < windowMs);
  prev.push(now);
  ipAttemptBuckets.set(bucketKey, prev);
}

function clearIpAttempt(bucketKey: string) {
  ipAttemptBuckets.delete(bucketKey);
}

function requireActiveUser(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = extractSessionToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const verified = verifySessionToken(token);
  if (!verified) {
    clearSessionCookie(req, res);
    res.status(401).json({ error: 'Session expired' });
    return;
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ? LIMIT 1').get(verified.uid) as unknown as
    | UserRow
    | undefined;
  if (!user) {
    clearSessionCookie(req, res);
    res.status(401).json({ error: 'Account not found' });
    return;
  }
  if (Number(user.token_version || 1) !== verified.tv) {
    clearSessionCookie(req, res);
    res.status(401).json({ error: 'Session revoked. Silakan login kembali.' });
    return;
  }
  if (user.status !== 'active') {
    clearSessionCookie(req, res);
    res.status(403).json({
      code: user.status === 'pending' ? 'ACCOUNT_PENDING' : 'ACCOUNT_DISABLED',
      error:
        user.status === 'pending'
          ? 'Akun Anda sedang menunggu persetujuan Admin.'
          : 'Akun Anda dinonaktifkan oleh Admin.',
      user: { name: user.name, email: user.email, status: user.status },
    });
    return;
  }
  req.authUser = user;
  next();
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  requireActiveUser(req, res, () => {
    if (req.authUser?.role !== 'admin') {
      res.status(403).json({ error: 'Admin privileges required' });
      return;
    }
    next();
  });
}

// ============================================================================
// External Agent Integration (Hermes Skill Handshake, MCP HTTP, & BCT Engine)
// ============================================================================

const AGENT_SKILL_VERSION = '1.1.0';
const AGENT_DIELINE_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MM_TO_IN = 0.0393701;
const KGF_CM_TO_LBF_IN = 5.59974;
const LBF_TO_KGF = 0.453592;
const MCKEE_K = 5.87;

interface AgentFluteSpec {
  id: string;
  name: string;
  thickness: number;
  tuf1: number;
  tuf2?: number;
  wall: 'single-wall' | 'double-wall';
}

const AGENT_FLUTE_SPECS: Record<string, AgentFluteSpec> = {
  F: { id: 'F', name: 'F-Flute (0.8mm)', thickness: 0.8, tuf1: 1.21, wall: 'single-wall' },
  E: { id: 'E', name: 'E-Flute (1.5mm)', thickness: 1.5, tuf1: 1.26, wall: 'single-wall' },
  B: { id: 'B', name: 'Flute B (3.18mm)', thickness: 3.18, tuf1: 1.33, wall: 'single-wall' },
  C: { id: 'C', name: 'Flute C (3.97mm)', thickness: 3.97, tuf1: 1.44, wall: 'single-wall' },
  A: { id: 'A', name: 'Flute A (4.76mm)', thickness: 4.76, tuf1: 1.54, wall: 'single-wall' },
  EB: { id: 'EB', name: 'EB-Flute (4.5mm DW)', thickness: 4.5, tuf1: 1.26, tuf2: 1.33, wall: 'double-wall' },
  BC: { id: 'BC', name: 'Flute BC (7.14mm DW)', thickness: 7.14, tuf1: 1.33, tuf2: 1.44, wall: 'double-wall' },
  AB: { id: 'AB', name: 'Flute AB (7.94mm DW)', thickness: 7.94, tuf1: 1.54, tuf2: 1.33, wall: 'double-wall' },
  AA: { id: 'AA', name: 'AA-Flute (10.0mm DW)', thickness: 10.0, tuf1: 1.54, tuf2: 1.54, wall: 'double-wall' },
};

const AGENT_PAPER_GRADES: Record<string, { rct: number; gsm: number; kind: 'liner' | 'medium' }> = {
  K110: { rct: 1.1, gsm: 110, kind: 'liner' },
  K125: { rct: 1.4, gsm: 125, kind: 'liner' },
  K140: { rct: 1.6, gsm: 140, kind: 'liner' },
  K150: { rct: 1.75, gsm: 150, kind: 'liner' },
  K175: { rct: 1.95, gsm: 175, kind: 'liner' },
  K200: { rct: 2.2, gsm: 200, kind: 'liner' },
  K220: { rct: 2.45, gsm: 220, kind: 'liner' },
  K250: { rct: 2.8, gsm: 250, kind: 'liner' },
  K275: { rct: 3.1, gsm: 275, kind: 'liner' },
  K300: { rct: 3.4, gsm: 300, kind: 'liner' },
  WKL140: { rct: 1.5, gsm: 140, kind: 'liner' },
  WKL175: { rct: 1.85, gsm: 175, kind: 'liner' },
  WKL200: { rct: 2.15, gsm: 200, kind: 'liner' },
  TL115: { rct: 0.95, gsm: 115, kind: 'liner' },
  TL125: { rct: 1.15, gsm: 125, kind: 'liner' },
  TL140: { rct: 1.3, gsm: 140, kind: 'liner' },
  TL150: { rct: 1.45, gsm: 150, kind: 'liner' },
  TL175: { rct: 1.65, gsm: 175, kind: 'liner' },
  TL200: { rct: 1.9, gsm: 200, kind: 'liner' },
  M100: { rct: 0.8, gsm: 100, kind: 'medium' },
  M110: { rct: 0.9, gsm: 110, kind: 'medium' },
  M125: { rct: 0.95, gsm: 125, kind: 'medium' },
  M140: { rct: 1.15, gsm: 140, kind: 'medium' },
  M150: { rct: 1.35, gsm: 150, kind: 'medium' },
  M165: { rct: 1.5, gsm: 165, kind: 'medium' },
  M180: { rct: 1.65, gsm: 180, kind: 'medium' },
  M200: { rct: 1.85, gsm: 200, kind: 'medium' },
  SC125: { rct: 1.2, gsm: 125, kind: 'medium' },
  SC150: { rct: 1.55, gsm: 150, kind: 'medium' },
  SC175: { rct: 1.85, gsm: 175, kind: 'medium' },
};

const AGENT_STANDARD_ECT_TABLE: Record<string, number> = {
  'K125-M125-K125-B': 3.3,
  'K125-M125-K125-C': 3.5,
  'K150-M125-K150-B': 4.2,
  'K150-M125-K150-C': 4.5,
  'K150-M150-K150-B': 5.0,
  'K150-M150-K150-C': 5.3,
  'K175-M150-K175-B': 6.0,
  'K175-M150-K175-C': 6.4,
  'K200-M150-K200-B': 7.0,
  'K200-M150-K200-C': 7.5,
  'K125-M125-M125-B': 3.05,
  'K125-M125-M125-C': 3.25,
  'K150-M125-M125-B': 3.65,
  'K150-M125-M125-C': 3.9,
  'K150-M125-K125-B': 3.85,
  'K150-M125-K125-C': 4.1,
  'K150-M150-M125-C': 4.45,
  'K175-M125-M125-C': 4.2,
  'K200-M125-K150-C': 5.2,
  'WKL140-M125-K125-C': 3.85,
  'WKL175-M150-K175-C': 6.1,
  'K125-M125-K125-E': 3.2,
  'K150-M125-K150-E': 4.1,
  'K150-M150-K150-A': 5.6,
  'K200-M150-K200-A': 7.9,
  'K275-M150-K275-C': 9.4,
  'K125-M125-M125-M125-K125-BC': 5.5,
  'K150-M125-M125-M125-K150-BC': 6.4,
  'K150-M125-M125-M125-M125-BC': 5.85,
  'K150-M150-M125-M150-K150-BC': 7.4,
  'K200-M150-M125-M150-K200-BC': 8.8,
  'K200-M150-K200-M150-K200-BC': 10.2,
  'K275-M150-K200-M150-K275-BC': 11.6,
  'K200-M150-M125-M150-K200-AB': 9.3,
};

function hashAgentKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey, 'utf8').digest('hex');
}

function getAgentKeyStatus() {
  const hashMeta = getSystemMeta('agent_api_key_hash');
  const prefixMeta = getSystemMeta('agent_api_key_prefix');
  const updatedMeta = getSystemMeta('agent_api_key_updated_at');
  return {
    configured: Boolean(hashMeta?.value),
    prefix: prefixMeta?.value || null,
    updatedAt: updatedMeta?.value || hashMeta?.updatedAt || null,
    skillVersion: AGENT_SKILL_VERSION,
  };
}

function extractAgentApiKey(req: Request): string {
  const headerKey = req.headers['x-agent-key'];
  if (typeof headerKey === 'string' && headerKey.trim()) {
    return headerKey.trim();
  }
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  return '';
}

function verifyAgentApiKey(rawKey: string): boolean {
  if (!rawKey) return false;
  const saved = getSystemMeta('agent_api_key_hash')?.value;
  if (!saved) return false;
  const candidate = hashAgentKey(rawKey);
  if (candidate.length !== saved.length) return false;
  return crypto.timingSafeEqual(Buffer.from(candidate, 'utf8'), Buffer.from(saved, 'utf8'));
}

function requireAgentKey(req: Request, res: Response, next: NextFunction) {
  const rawKey = extractAgentApiKey(req);
  if (!verifyAgentApiKey(rawKey)) {
    res.status(401).json({
      error: 'API Key Agent tidak valid atau belum dikonfigurasi oleh Admin.',
    });
    return;
  }
  next();
}

function getBaseUrlFromReq(req: Request): string {
  const proto = isHttpsRequest(req) ? 'https' : req.protocol || 'http';
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || `127.0.0.1:${PORT}`).split(',')[0].trim();
  return `${proto}://${host}`;
}

function buildAgentFormTemplateText(): string {
  return [
    'Silakan salin, isi nilai Anda, lalu kirim balik ke saya:',
    '',
    'ID Panjang (mm): ',
    'ID Lebar (mm): ',
    'ID Tinggi (mm): ',
    'Flute Type (F/E/B/C/A/EB/BC/AB/AA): ',
    'Material (contoh K150/M125/K150): ',
    'Print Coverage (%): 60',
    'Jumlah Ink Colors: 1',
    'Safety Factor: 6:1',
  ].join('\n');
}

function buildHermesSkillMarkdown(baseUrl: string): string {
  return [
    '---',
    'name: diecut-room-bct',
    'description: Hitung BCT Corrected, ECT, Engineering Summary, dan generate Dieline 2D SVG (Clean CAD / Spec Sheet 1:1 mm) lewat DieCut.Room berdasarkan input Direct ID, flute type, material, print coverage (default 60%), ink colors, dan safety factor (default 6:1).',
    `version: "${AGENT_SKILL_VERSION}"`,
    'metadata:',
    `  skill_version: "${AGENT_SKILL_VERSION}"`,
    '  author: DieCut.Room',
    '  channels: [telegram, whatsapp, cli]',
    '---',
    '',
    '# Skill Kalkulasi BCT & Generate Dieline CAD — DieCut.Room',
    '',
    '## Aturan Wajib Alur Kerja (Telegram, WhatsApp, Web/CLI)',
    `1. **Simpan Skill & Versi Aktif**: Anda sudah menerima skill versi \`${AGENT_SKILL_VERSION}\`. Jangan meminta ulang skill ke server kecuali versi naik; selalu kirim \`skill_version: "${AGENT_SKILL_VERSION}"\` (atau header \`X-Skill-Version: ${AGENT_SKILL_VERSION}\`).`,
    `2. **Minta Template Form dari Server**: Saat pengguna ingin menghitung kardus/BCT atau membuat dieline tanpa ukuran lengkap, panggil tool MCP \`diecut_connect\` dengan \`skill_version: "${AGENT_SKILL_VERSION}"\` (atau \`POST /api/agent/connect\` dengan header \`X-Skill-Version: ${AGENT_SKILL_VERSION}\`).`,
    '3. **Tampilkan Template Form ke Pengguna Apa Adanya**: Salin dan kirimkan teks `templateFormText` dari server ke pengguna agar mereka mengisinya secara manual. Jangan menebak atau mengarang ukuran dimensi ID pengguna.',
    '4. **Kalkulasi BCT & Engineering**: Setelah pengguna mengisi form, panggil tool MCP `diecut_calculate` (`form_text`) atau `POST /api/agent/calculate`. Sajikan `formattedReply` (ringkasan BCT Corrected, ECT, dan Engineering) langsung kepada pengguna.',
    '5. **Generate Dieline 2D SVG / Clean CAD**: Jika pengguna meminta gambar pisau pon / CAD / SVG (atau setelah kalkulasi selesai dan user ingin file CAD-nya), panggil tool MCP `diecut_generate_dieline` (atau `POST /api/agent/dieline`) dengan `mode: "clean-cad"` (untuk mesin plotter/laser/Illustrator — hanya Cut, Crease, Perforation) atau `mode: "spec-sheet"` (lengkap dengan label dimensi 12 pt, arah flute, & title block). Bagikan `downloadUrl` yang dikembalikan server agar pengguna Telegram/WhatsApp dapat mengunduh file `.svg` 1:1 mm dalam 1 klik, atau simpan `svgContent` ke file lokal bila memakai CLI/terminal.',
    '',
    '## Nilai Default & Catatan Input',
    '- **Direct ID (Inner Dimension)**: Panjang (`L`), Lebar (`W`), Tinggi (`D`) dalam `mm`.',
    '- **FEFCO Box Style**: `0201` (RSC default), `0200` (HSC), `0202` (OSC), `0203` (FOL), `0204` (CSSC).',
    '- **Flute Type**: Single-wall (`F`, `E`, `B`, `C`, `A`) atau Double-wall (`EB`, `BC`, `AB`, `AA`).',
    '- **Material**: Format substance 3-ply (misal `K150/M125/K150`) atau 5-ply (misal `K200/M150/M125/M150/K200`). Grade valid: Kraft `K110..K300`, White Top `WKL140..WKL200`, Testliner `TL115..TL200`, Medium `M100..M200`, Semi-Chem `SC125..SC175`.',
    '- **Print Coverage**: Default `60%` jika tidak diubah pengguna.',
    '- **Jumlah Ink Colors**: Jumlah warna cetak (0–10).',
    '- **Safety Factor**: Default `6:1` jika tidak diubah pengguna.',
    '- **Dieline Mode**: Default `"clean-cad"` (Cut `#000000`, Crease `#E11D48`). Gunakan `"spec-sheet"` untuk lembar persetujuan lengkap berdimensi `12 pt`.',
    '',
    '## Referensi Endpoint REST',
    `- Base URL: \`${baseUrl}\``,
    `- Connect / Handshake: \`POST ${baseUrl}/api/agent/connect\` (Header: \`X-Agent-Key\`, \`X-Skill-Version: ${AGENT_SKILL_VERSION}\`)`,
    `- Calculate BCT: \`POST ${baseUrl}/api/agent/calculate\` (Header: \`X-Agent-Key\`, Body: \`{"formText": "..."}\` atau field terstruktur)`,
    `- Generate Dieline SVG: \`POST ${baseUrl}/api/agent/dieline\` (Header: \`X-Agent-Key\`, Body: \`{"idLengthMm":300,"idWidthMm":200,"idDepthMm":150,"fluteType":"C","mode":"clean-cad"}\`)`,
  ].join('\n');
}

function normalizeFluteTypeInput(raw: string | undefined): AgentFluteSpec | null {
  if (!raw || !raw.trim()) return AGENT_FLUTE_SPECS.C;
  const cleaned = raw
    .trim()
    .toUpperCase()
    .replace(/\bFLUTE\b/g, '')
    .replace(/\bDW\b|\bSW\b/g, '')
    .replace(/[^A-Z]/g, '');
  if (!cleaned) return AGENT_FLUTE_SPECS.C;
  return AGENT_FLUTE_SPECS[cleaned] || null;
}

function parseMaterialSubstanceServer(raw: string): {
  top: string;
  medium: string;
  center?: string;
  medium2?: string;
  bottom: string;
  isDoubleWall: boolean;
} | null {
  const parts = raw
    .trim()
    .toUpperCase()
    .split(/[/\-+\s,]+/)
    .filter(Boolean);
  if (parts.length === 3) {
    const [t, m, b] = parts;
    if (AGENT_PAPER_GRADES[t] && AGENT_PAPER_GRADES[m] && AGENT_PAPER_GRADES[b]) {
      return { top: t, medium: m, bottom: b, isDoubleWall: false };
    }
    return null;
  }
  if (parts.length === 5) {
    const [t, m1, c, m2, b] = parts;
    if (
      AGENT_PAPER_GRADES[t] &&
      AGENT_PAPER_GRADES[m1] &&
      AGENT_PAPER_GRADES[c] &&
      AGENT_PAPER_GRADES[m2] &&
      AGENT_PAPER_GRADES[b]
    ) {
      return { top: t, medium: m1, center: c, medium2: m2, bottom: b, isDoubleWall: true };
    }
    return null;
  }
  return null;
}

function parseSafetyFactorVal(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) {
    return Math.min(12, Math.max(1.2, val));
  }
  if (typeof val === 'string') {
    const m = val.trim().match(/(\d+(?:[.,]\d+)?)/);
    if (m) {
      const n = Number(m[1].replace(',', '.'));
      if (Number.isFinite(n)) return Math.min(12, Math.max(1.2, n));
    }
  }
  return 6;
}

function parseNumLoose(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string') {
    const m = val.trim().match(/-?\d+(?:[.,]\d+)?/);
    if (m) {
      const n = Number(m[0].replace(',', '.'));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

interface ParsedAgentFormInput {
  idLengthMm?: number;
  idWidthMm?: number;
  idDepthMm?: number;
  fluteType?: string;
  material?: string;
  printCoveragePct?: number;
  inkColorsCount?: number;
  safetyFactor?: number;
  boxStyle?: string;
  relativeHumidity?: number;
  fluteDirection?: 'vertical' | 'horizontal';
  handlingRisk?: boolean;
}

function parseAgentFormText(formText: string): ParsedAgentFormInput {
  const out: ParsedAgentFormInput = {};
  const lines = formText.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim().replace(/^[-*•\d.)\s]+/, '');
    if (!line) continue;
    const sepIdx = line.search(/[:=]/);
    if (sepIdx === -1) continue;
    const key = line.slice(0, sepIdx).trim().toLowerCase();
    const val = line.slice(sepIdx + 1).trim();
    if (!val) continue;

    if (
      (key.includes('dimensi') || key === 'id' || key.includes('ukuran')) &&
      /\d+\s*[x×*]\s*\d+\s*[x×*]\s*\d+/i.test(val)
    ) {
      const m = val.match(/(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)/i);
      if (m) {
        out.idLengthMm = Number(m[1].replace(',', '.'));
        out.idWidthMm = Number(m[2].replace(',', '.'));
        out.idDepthMm = Number(m[3].replace(',', '.'));
      }
      continue;
    }

    if (key.includes('panjang') || key.includes('length') || key === 'l' || key === 'id l') {
      const n = parseNumLoose(val);
      if (n !== null) out.idLengthMm = n;
    } else if (key.includes('lebar') || key.includes('width') || key === 'w' || key === 'id w') {
      const n = parseNumLoose(val);
      if (n !== null) out.idWidthMm = n;
    } else if (key.includes('tinggi') || key.includes('depth') || key.includes('height') || key === 'd' || key === 'id d') {
      const n = parseNumLoose(val);
      if (n !== null) out.idDepthMm = n;
    } else if (key.includes('flute direction') || key.includes('arah flute')) {
      out.fluteDirection = val.toLowerCase().includes('horiz') ? 'horizontal' : 'vertical';
    } else if (key.includes('flute')) {
      out.fluteType = val;
    } else if (key.includes('material') || key.includes('substance') || key.includes('kertas') || key.includes('komposisi')) {
      out.material = val;
    } else if (key.includes('print') || key.includes('coverage') || key.includes('cetak')) {
      const n = parseNumLoose(val);
      if (n !== null) out.printCoveragePct = Math.min(100, Math.max(0, n));
    } else if (key.includes('ink') || key.includes('warna') || key.includes('color')) {
      const n = parseNumLoose(val);
      if (n !== null) out.inkColorsCount = Math.min(10, Math.max(0, Math.round(n)));
    } else if (key.includes('safety') || key.includes('faktor keamanan') || key === 'sf') {
      out.safetyFactor = parseSafetyFactorVal(val);
    } else if (key.includes('style') || key.includes('fefco') || key.includes('model')) {
      const m = val.match(/020[0-4]/);
      if (m) out.boxStyle = m[0];
    } else if (key.includes('rh') || key.includes('kelembaban') || key.includes('humidity')) {
      const n = parseNumLoose(val);
      if (n !== null) out.relativeHumidity = Math.min(90, Math.max(30, n));
    }
  }

  return out;
}

function computeAgentHumidityFactor(rh: number): number {
  const points = [
    { rh: 50, factor: 1.0 },
    { rh: 55, factor: 0.95 },
    { rh: 60, factor: 0.9 },
    { rh: 65, factor: 0.85 },
    { rh: 70, factor: 0.8 },
    { rh: 75, factor: 0.75 },
    { rh: 80, factor: 0.7 },
    { rh: 85, factor: 0.65 },
    { rh: 90, factor: 0.6 },
  ];
  if (rh <= 50) return 1.0;
  if (rh >= 90) return 0.6;
  for (let i = 0; i < points.length - 1; i++) {
    if (rh >= points[i].rh && rh <= points[i + 1].rh) {
      const t = (rh - points[i].rh) / (points[i + 1].rh - points[i].rh);
      return parseFloat((points[i].factor + t * (points[i + 1].factor - points[i].factor)).toFixed(3));
    }
  }
  return 0.9;
}

function runAgentEngineeringCalc(rawBody: Record<string, unknown>) {
  const formText =
    typeof rawBody.formText === 'string'
      ? rawBody.formText
      : typeof rawBody.form_text === 'string'
      ? rawBody.form_text
      : typeof rawBody.text === 'string'
      ? rawBody.text
      : '';

  const fromText = formText ? parseAgentFormText(formText) : {};

  const idLengthMm =
    parseNumLoose(rawBody.idLengthMm ?? rawBody.id_length_mm ?? rawBody.length) ?? fromText.idLengthMm;
  const idWidthMm =
    parseNumLoose(rawBody.idWidthMm ?? rawBody.id_width_mm ?? rawBody.width) ?? fromText.idWidthMm;
  const idDepthMm =
    parseNumLoose(rawBody.idDepthMm ?? rawBody.id_depth_mm ?? rawBody.depth) ?? fromText.idDepthMm;

  const missing: string[] = [];
  if (!idLengthMm || idLengthMm < 20) missing.push('ID Panjang (mm >= 20)');
  if (!idWidthMm || idWidthMm < 20) missing.push('ID Lebar (mm >= 20)');
  if (!idDepthMm || idDepthMm < 20) missing.push('ID Tinggi (mm >= 20)');

  const rawFlute = String(
    rawBody.fluteType ?? rawBody.flute_type ?? rawBody.flute ?? fromText.fluteType ?? 'C'
  );
  const fluteSpec = normalizeFluteTypeInput(rawFlute);
  if (!fluteSpec) {
    return {
      ok: false as const,
      status: 400,
      error: `Flute type "${rawFlute}" tidak dikenali. Pilihan valid: F, E, B, C, A, EB, BC, AB, AA.`,
      missingFields: ['Flute Type'],
    };
  }

  if (missing.length > 0) {
    return {
      ok: false as const,
      status: 400,
      error: `Data dimensi belum lengkap atau < 20 mm: ${missing.join(', ')}.`,
      missingFields: missing,
      templateFormText: buildAgentFormTemplateText(),
    };
  }

  const L = Math.round(idLengthMm! * 10) / 10;
  const W = Math.round(idWidthMm! * 10) / 10;
  const D = Math.round(idDepthMm! * 10) / 10;
  const T = fluteSpec.thickness;

  const rawMaterial = String(
    rawBody.material ?? rawBody.substance ?? fromText.material ?? ''
  ).trim();

  let topLayer = 'K150';
  let mediumLayer = 'M125';
  let centerLayer = 'M125';
  let mediumLayer2 = 'M125';
  let bottomLayer = 'K150';
  const notes: string[] = [];

  if (rawMaterial) {
    const parsedMat = parseMaterialSubstanceServer(rawMaterial);
    if (!parsedMat) {
      return {
        ok: false as const,
        status: 400,
        error: `Format material "${rawMaterial}" tidak valid. Gunakan format substance seperti K150/M125/K150 (single-wall) atau K200/M150/M125/M150/K200 (double-wall). Grade tersedia: K110..K300, WKL140..WKL200, TL115..TL200, M100..M200, SC125..SC175.`,
        missingFields: ['Material'],
      };
    }
    topLayer = parsedMat.top;
    mediumLayer = parsedMat.medium;
    bottomLayer = parsedMat.bottom;
    if (parsedMat.isDoubleWall && parsedMat.center && parsedMat.medium2) {
      centerLayer = parsedMat.center;
      mediumLayer2 = parsedMat.medium2;
      if (fluteSpec.wall === 'single-wall') {
        notes.push(
          `Material 5-ply (${rawMaterial.toUpperCase()}) diberikan untuk ${fluteSpec.id}-Flute (single-wall); kalkulasi memakai lapisan luar/medium/dalam (${topLayer}/${mediumLayer}/${bottomLayer}).`
        );
      }
    } else if (fluteSpec.wall === 'double-wall') {
      centerLayer = 'M125';
      mediumLayer2 = mediumLayer;
      notes.push(
        `Flute ${fluteSpec.id} adalah Double-Wall (5-ply); material 3-ply (${topLayer}/${mediumLayer}/${bottomLayer}) otomatis diekspansi menjadi ${topLayer}/${mediumLayer}/${centerLayer}/${mediumLayer2}/${bottomLayer}.`
      );
    }
  } else {
    if (fluteSpec.wall === 'double-wall') {
      notes.push('Material tidak diisi; menggunakan standar Double-Wall K150/M125/M125/M125/K150.');
    } else {
      notes.push('Material tidak diisi; menggunakan standar Single-Wall K150/M125/K150.');
    }
  }

  const substanceString =
    fluteSpec.wall === 'double-wall'
      ? `${topLayer}/${mediumLayer}/${centerLayer}/${mediumLayer2}/${bottomLayer}`
      : `${topLayer}/${mediumLayer}/${bottomLayer}`;

  const printCoveragePct = Math.min(
    100,
    Math.max(
      0,
      parseNumLoose(
        rawBody.printCoveragePct ?? rawBody.print_coverage_pct ?? rawBody.printCoverage
      ) ??
        fromText.printCoveragePct ??
        60
    )
  );

  const inkColorsCount = Math.min(
    10,
    Math.max(
      0,
      Math.round(
        parseNumLoose(
          rawBody.inkColorsCount ?? rawBody.ink_colors_count ?? rawBody.inkColors
        ) ??
          fromText.inkColorsCount ??
          1
      )
    )
  );

  const safetyFactor = parseSafetyFactorVal(
    rawBody.safetyFactor ?? rawBody.safety_factor ?? fromText.safetyFactor ?? 6
  );

  const rawBoxStyle = String(
    rawBody.boxStyle ?? rawBody.box_style ?? fromText.boxStyle ?? '0201'
  );
  const boxStyle = ['0200', '0201', '0202', '0203', '0204'].includes(rawBoxStyle)
    ? rawBoxStyle
    : '0201';
  const hasTopFlaps = boxStyle !== '0200';
  const relativeHumidity = Math.min(
    90,
    Math.max(
      30,
      parseNumLoose(rawBody.relativeHumidity ?? rawBody.relative_humidity) ??
        fromText.relativeHumidity ??
        50
    )
  );
  const fluteDirection: 'vertical' | 'horizontal' =
    rawBody.fluteDirection === 'horizontal' ||
    rawBody.flute_direction === 'horizontal' ||
    fromText.fluteDirection === 'horizontal'
      ? 'horizontal'
      : 'vertical';
  const handlingRisk = Boolean(rawBody.handlingRisk ?? rawBody.handling_risk ?? false);

  // Geometry & OD/Blank Calculations (Inner-Flap Depth Allowance ON by default)
  const lPanel = L + T;
  const wPanel = W + T;
  const depthAllowanceMm = hasTopFlaps ? 2 * T : T;
  const dPanel = D + depthAllowanceMm;
  const outerL = parseFloat((L + 2 * T).toFixed(2));
  const outerW = parseFloat((W + 2 * T).toFixed(2));
  const outerD = parseFloat((dPanel + (hasTopFlaps ? 2 * T : T)).toFixed(2));

  const flapGap = 3;
  const glueFlapWidth = 35;
  let flapL = Math.max(10, (wPanel - flapGap) / 2);
  let flapW = Math.max(10, (wPanel - flapGap) / 2);
  if (boxStyle === '0202') flapL = Math.min(wPanel - T / 2, Math.max(10, (wPanel + 30) / 2));
  else if (boxStyle === '0203') flapL = Math.max(wPanel / 2, wPanel - Math.max(flapGap, T / 2));
  else if (boxStyle === '0204') flapW = Math.max(10, (lPanel - flapGap) / 2);
  flapW = Math.max(10, flapW - T / 2); // Anti-fishtail default

  const blankWidthMm = Math.ceil(glueFlapWidth + 2 * (lPanel + wPanel));
  const blankHeightMm = Math.ceil(
    dPanel + Math.max(flapL, flapW) + (hasTopFlaps ? Math.max(flapL, flapW) : 0)
  );
  const blankAreaSqM = parseFloat(((blankWidthMm / 1000) * (blankHeightMm / 1000)).toFixed(4));

  // Board GSM
  const topG = AGENT_PAPER_GRADES[topLayer];
  const med1G = AGENT_PAPER_GRADES[mediumLayer];
  const cenG = AGENT_PAPER_GRADES[centerLayer];
  const med2G = AGENT_PAPER_GRADES[mediumLayer2];
  const botG = AGENT_PAPER_GRADES[bottomLayer];
  const boardGsm =
    fluteSpec.wall === 'double-wall'
      ? Math.round(
          topG.gsm +
            med1G.gsm * fluteSpec.tuf1 +
            cenG.gsm +
            med2G.gsm * (fluteSpec.tuf2 ?? fluteSpec.tuf1) +
            botG.gsm
        )
      : Math.round(topG.gsm + botG.gsm + med1G.gsm * fluteSpec.tuf1);

  // TAPPI Calibrated ECT
  const ectKey =
    fluteSpec.wall === 'double-wall'
      ? `${topLayer}-${mediumLayer}-${centerLayer}-${mediumLayer2}-${bottomLayer}-${fluteSpec.id}`
      : `${topLayer}-${mediumLayer}-${bottomLayer}-${fluteSpec.id}`;

  let ectKgfCm: number;
  let ectSource: 'STANDARD_ECT' | 'ESTIMATED_ECT';
  if (AGENT_STANDARD_ECT_TABLE[ectKey]) {
    ectKgfCm = AGENT_STANDARD_ECT_TABLE[ectKey];
    ectSource = 'STANDARD_ECT';
  } else {
    ectSource = 'ESTIMATED_ECT';
    if (fluteSpec.wall === 'double-wall') {
      const tuf2 = fluteSpec.tuf2 ?? fluteSpec.tuf1;
      ectKgfCm = parseFloat(
        (
          1.02 *
          (topG.rct + fluteSpec.tuf1 * med1G.rct + cenG.rct + tuf2 * med2G.rct + botG.rct)
        ).toFixed(2)
      );
    } else {
      ectKgfCm = parseFloat((1.02 * (topG.rct + fluteSpec.tuf1 * med1G.rct + botG.rct)).toFixed(2));
    }
  }
  const ectLbfIn = parseFloat((ectKgfCm * KGF_CM_TO_LBF_IN).toFixed(2));

  // McKee Theoretical BCT using Outer Perimeter
  const outerPerimeterMm = 2 * (outerL + outerW);
  const rawBctKgf = parseFloat(
    (
      MCKEE_K *
      ectLbfIn *
      Math.pow(Math.max(0.5, T) * MM_TO_IN, 0.508) *
      Math.pow(Math.max(20, outerPerimeterMm) * MM_TO_IN, 0.492) *
      LBF_TO_KGF
    ).toFixed(2)
  );
  const rawBctLbf = parseFloat((rawBctKgf / LBF_TO_KGF).toFixed(2));

  // Correction Factors
  let printingFactor = 1 - (printCoveragePct / 100) * 0.15;
  if (inkColorsCount > 0) {
    printingFactor *= 1 - Math.min(inkColorsCount * 0.02, 0.08);
  }
  printingFactor = parseFloat(printingFactor.toFixed(3));
  const humidityFactor = computeAgentHumidityFactor(relativeHumidity);
  const handlingFactor = handlingRisk ? 0.85 : 1.0;
  const slendernessRatio = D / Math.max(1, Math.min(L, W));
  const stabilityFactor =
    slendernessRatio <= 1.5 ? 1.0 : slendernessRatio <= 2.0 ? 0.95 : slendernessRatio <= 2.5 ? 0.9 : 0.85;
  const fluteGrainFactor = fluteDirection === 'vertical' ? 1.0 : 0.55;

  const combinedFactor = parseFloat(
    (printingFactor * humidityFactor * handlingFactor * stabilityFactor * fluteGrainFactor).toFixed(3)
  );
  const correctedBctKgf = parseFloat((rawBctKgf * combinedFactor).toFixed(2));
  const correctedBctLbf = parseFloat((correctedBctKgf / LBF_TO_KGF).toFixed(2));
  const maxStackingLoadKgf = parseFloat((correctedBctKgf / safetyFactor).toFixed(2));
  const maxStackingLoadLbf = parseFloat((maxStackingLoadKgf / LBF_TO_KGF).toFixed(2));

  if (printCoveragePct >= 50) {
    notes.push(
      `Print coverage ${printCoveragePct}% + ${inkColorsCount} warna menurunkan faktor kekuatan cetak ke ${(
        printingFactor * 100
      ).toFixed(1)}% akibat tekanan silinder anilox/plate flexo.`
    );
  }
  if (slendernessRatio > 1.5) {
    notes.push(
      `Rasio tinggi terhadap sisi terpendek ${slendernessRatio.toFixed(
        2
      )}x (>1.5x) mengaktifkan faktor stabilitas kolom ${(stabilityFactor * 100).toFixed(0)}%.`
    );
  }
  if (fluteDirection === 'horizontal') {
    notes.push('Flute horizontal menurunkan BCT sebesar 45%; gunakan flute vertical untuk tumpukan palet.');
  }
  if (notes.length === 0) {
    notes.push('Konfigurasi struktur, flute vertikal, dan dimensi blank dalam batas standar produksi.');
  }

  const formattedReply = [
    `*Ringkasan Kalkulasi DieCut.Room (${boxStyle} · ${fluteSpec.name})*`,
    '',
    `*1. BCT Corrected*`,
    `• Corrected BCT: *${correctedBctKgf.toFixed(1)} kgf* (${correctedBctLbf.toFixed(1)} lbf)`,
    `• Raw McKee BCT: ${rawBctKgf.toFixed(1)} kgf (${rawBctLbf.toFixed(1)} lbf)`,
    `• Combined Factor: ${(combinedFactor * 100).toFixed(1)}% (Print ${(printingFactor * 100).toFixed(1)}% · RH ${relativeHumidity}% ${(humidityFactor * 100).toFixed(0)}% · Stabilitas ${(stabilityFactor * 100).toFixed(0)}%)`,
    `• Max Safe Stacking Load (SF ${safetyFactor}:1): *${maxStackingLoadKgf.toFixed(1)} kgf* (${maxStackingLoadLbf.toFixed(1)} lbf)`,
    '',
    `*2. ECT (Edge Crush Test)*`,
    `• ECT: *${ectKgfCm.toFixed(2)} kgf/cm* (${ectLbfIn.toFixed(1)} lbf/in)`,
    `• Sumber: ${ectSource === 'STANDARD_ECT' ? 'Tabel Standar Pabrik' : 'Estimasi RCT TAPPI'} · Caliper ${T} mm`,
    '',
    `*3. Engineering Summary*`,
    `• Inner Dimension (ID): ${L} × ${W} × ${D} mm`,
    `• Outer Dimension (OD): ${outerL} × ${outerW} × ${outerD} mm (incl. inner-flap depth +${depthAllowanceMm.toFixed(1)} mm)`,
    `• Blank Size / Area: ${blankWidthMm} × ${blankHeightMm} mm (${blankAreaSqM.toFixed(3)} m²)`,
    `• Material Substance: ${substanceString} (~${boardGsm} gsm)`,
    `• Printing: ${printCoveragePct}% coverage · ${inkColorsCount} ink color(s)`,
    `• Catatan Teknis: ${notes.join(' ')}`,
  ].join('\n');

  return {
    ok: true as const,
    input: {
      boxStyle,
      innerDimensionsMm: { length: L, width: W, depth: D },
      fluteType: fluteSpec.id,
      boardGrade: fluteSpec.wall,
      materialSubstance: substanceString,
      printCoveragePct,
      inkColorsCount,
      safetyFactor,
      relativeHumidity,
      fluteDirection,
    },
    bctCorrected: {
      correctedBctKgf,
      correctedBctLbf,
      rawMcKeeBctKgf: rawBctKgf,
      rawMcKeeBctLbf: rawBctLbf,
      maxStackingLoadKgf,
      maxStackingLoadLbf,
      safetyFactorLabel: `${safetyFactor}:1`,
      factors: {
        printing: printingFactor,
        humidity: humidityFactor,
        handling: handlingFactor,
        stability: stabilityFactor,
        fluteGrain: fluteGrainFactor,
        combined: combinedFactor,
      },
    },
    ect: {
      ectKgfCm,
      ectLbfIn,
      source: ectSource,
      caliperMm: T,
    },
    engineering: {
      method: 'TAPPI / McKee Calibrated',
      boxStyle,
      outerDimensionsMm: { length: outerL, width: outerW, depth: outerD },
      innerFlapDepthAllowanceMm: depthAllowanceMm,
      blankDimensionsMm: { width: blankWidthMm, height: blankHeightMm },
      blankAreaSqM,
      outerPerimeterMm: parseFloat(outerPerimeterMm.toFixed(1)),
      boardGsm,
      materialSubstance: substanceString,
      fluteName: fluteSpec.name,
      printCoveragePct,
      inkColorsCount,
      notes,
    },
    formattedReply,
  };
}

type AgentDielineMode = 'clean-cad' | 'spec-sheet';

interface AgentDielineTokenPayload {
  L: number;
  W: number;
  D: number;
  fluteType: string;
  boxStyle: string;
  mode: AgentDielineMode;
  glueFlapWidthMm: number;
  glueFlapPosition: 'left' | 'right';
  flapGapMm: number;
  slotGapMm: number;
  flapOverlapMm: number;
  fishtailCompensation: boolean;
  compensateInnerFlapDepth: boolean;
  fluteDirection: 'vertical' | 'horizontal';
  dimFontSizePt: number;
  material: string;
  exp: number;
}

function escapeXmlAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function signAgentDielinePayload(payload: AgentDielineTokenPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyAgentDielineToken(token: string): AgentDielineTokenPayload | null {
  if (!token || !token.includes('.')) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, providedSig] = parts;
  if (!encoded || !providedSig) return null;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  const bufA = Buffer.from(providedSig, 'utf8');
  const bufB = Buffer.from(expectedSig, 'utf8');
  if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as AgentDielineTokenPayload;
    if (!parsed || typeof parsed.exp !== 'number' || Date.now() > parsed.exp) return null;
    if (!Number.isFinite(parsed.L) || !Number.isFinite(parsed.W) || !Number.isFinite(parsed.D)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function buildServerDielineSvg(params: AgentDielineTokenPayload) {
  const fluteSpec = AGENT_FLUTE_SPECS[params.fluteType] || AGENT_FLUTE_SPECS.C;
  const L = Math.max(20, params.L);
  const W = Math.max(20, params.W);
  const D = Math.max(20, params.D);
  const T = Math.max(0.5, fluteSpec.thickness);
  const G = Math.max(10, params.glueFlapWidthMm);
  const flapGap = Math.max(0, params.flapGapMm);
  const slotGap = Math.max(2, params.slotGapMm);
  const boxStyle = ['0200', '0201', '0202', '0203', '0204'].includes(params.boxStyle)
    ? params.boxStyle
    : '0201';
  const hasTopFlaps = boxStyle !== '0200';
  const glueFlapPosition = params.glueFlapPosition === 'right' ? 'right' : 'left';
  const fishtailCompensation = params.fishtailCompensation !== false;
  const compensateInnerFlapDepth = params.compensateInnerFlapDepth !== false;

  const lPanel = L + T;
  const wPanel = W + T;
  const depthAllowanceMm = compensateInnerFlapDepth ? (hasTopFlaps ? 2 * T : T) : 0;
  const dPanel = D + depthAllowanceMm;
  const outerL = Math.round((L + 2 * T) * 100) / 100;
  const outerW = Math.round((W + 2 * T) * 100) / 100;
  const outerD = Math.round((dPanel + (hasTopFlaps ? 2 * T : T)) * 100) / 100;

  let bottomFlapL = Math.max(10, (wPanel - flapGap) / 2);
  let bottomFlapW = Math.max(10, (wPanel - flapGap) / 2);
  if (boxStyle === '0202') {
    bottomFlapL = Math.min(wPanel - T / 2, Math.max(10, (wPanel + Math.max(0, params.flapOverlapMm)) / 2));
  } else if (boxStyle === '0203') {
    bottomFlapL = Math.max(wPanel / 2, wPanel - Math.max(flapGap, T / 2));
  } else if (boxStyle === '0204') {
    bottomFlapW = Math.max(10, (lPanel - flapGap) / 2);
  }
  if (fishtailCompensation) {
    bottomFlapW = Math.max(10, bottomFlapW - T / 2);
  }

  const topFlapL = hasTopFlaps ? bottomFlapL : 0;
  const topFlapW = hasTopFlaps ? bottomFlapW : 0;
  const halfSlot = slotGap / 2;
  const slotOvercut = fishtailCompensation ? T : 0;
  const topSlotOvercut = hasTopFlaps ? slotOvercut : 0;

  let x0 = 0;
  let x1 = 0;
  let x2 = 0;
  let x3 = 0;
  let x4 = 0;
  let x5 = 0;
  let pL1_x1 = 0;
  let pL1_x2 = 0;
  let pW1_x1 = 0;
  let pW1_x2 = 0;
  let pL2_x1 = 0;
  let pL2_x2 = 0;
  let pW2_x1 = 0;
  let pW2_x2 = 0;
  let pGlue_x1 = 0;
  let pGlue_x2 = 0;

  if (glueFlapPosition === 'left') {
    x0 = 0;
    x1 = G;
    x2 = x1 + lPanel;
    x3 = x2 + wPanel;
    x4 = x3 + lPanel;
    x5 = x4 + wPanel;
    pGlue_x1 = x0; pGlue_x2 = x1;
    pL1_x1 = x1; pL1_x2 = x2;
    pW1_x1 = x2; pW1_x2 = x3;
    pL2_x1 = x3; pL2_x2 = x4;
    pW2_x1 = x4; pW2_x2 = x5;
  } else {
    x0 = 0;
    x1 = lPanel;
    x2 = x1 + wPanel;
    x3 = x2 + lPanel;
    x4 = x3 + wPanel;
    x5 = x4 + G;
    pL1_x1 = x0; pL1_x2 = x1;
    pW1_x1 = x1; pW1_x2 = x2;
    pL2_x1 = x2; pL2_x2 = x3;
    pW2_x1 = x3; pW2_x2 = x4;
    pGlue_x1 = x4; pGlue_x2 = x5;
  }

  const y1 = hasTopFlaps ? Math.max(topFlapL, topFlapW) : 0;
  const y0_L = y1 - topFlapL;
  const y0_W = y1 - topFlapW;
  const y2 = y1 + dPanel;
  const y3_L = y2 + bottomFlapL;
  const y3_W = y2 + bottomFlapW;

  const glueTaper = Math.min(15, dPanel / 4, bottomFlapL / 2);
  const r = (val: number) => Math.round(val * 100) / 100;

  const cutLines: string[] = [];
  const addLine = (xA: number, yA: number, xB: number, yB: number) => {
    if (Math.abs(xA - xB) < 0.001 && Math.abs(yA - yB) < 0.001) return;
    cutLines.push(`M ${r(xA)} ${r(yA)} L ${r(xB)} ${r(yB)}`);
  };

  if (glueFlapPosition === 'left') {
    addLine(pGlue_x1, y1 + glueTaper, pGlue_x2, y1);
    addLine(pGlue_x1, y1 + glueTaper, pGlue_x1, y2 - glueTaper);
    addLine(pGlue_x1, y2 - glueTaper, pGlue_x2, y2);
    addLine(pW2_x2, y1, pW2_x2, y2);
  } else {
    addLine(pL1_x1, y1, pL1_x1, y2);
    addLine(pGlue_x1, y1, pGlue_x2, y1 + glueTaper);
    addLine(pGlue_x2, y1 + glueTaper, pGlue_x2, y2 - glueTaper);
    addLine(pGlue_x2, y2 - glueTaper, pGlue_x1, y2);
  }

  if (hasTopFlaps) {
    addLine(pL1_x1, y1, pL1_x1, y0_L);
    addLine(pL1_x1, y0_L, pL1_x2 - halfSlot, y0_L);
    addLine(pL1_x2 - halfSlot, y0_L, pL1_x2 - halfSlot, y1 + topSlotOvercut);

    addLine(pL1_x2 - halfSlot, y1 + topSlotOvercut, pW1_x1 + halfSlot, y1 + topSlotOvercut);
    addLine(pW1_x1 + halfSlot, y1 + topSlotOvercut, pW1_x1 + halfSlot, y0_W);
    addLine(pW1_x1 + halfSlot, y0_W, pW1_x2 - halfSlot, y0_W);
    addLine(pW1_x2 - halfSlot, y0_W, pW1_x2 - halfSlot, y1 + topSlotOvercut);

    addLine(pW1_x2 - halfSlot, y1 + topSlotOvercut, pL2_x1 + halfSlot, y1 + topSlotOvercut);
    addLine(pL2_x1 + halfSlot, y1 + topSlotOvercut, pL2_x1 + halfSlot, y0_L);
    addLine(pL2_x1 + halfSlot, y0_L, pL2_x2 - halfSlot, y0_L);
    addLine(pL2_x2 - halfSlot, y0_L, pL2_x2 - halfSlot, y1 + topSlotOvercut);

    addLine(pL2_x2 - halfSlot, y1 + topSlotOvercut, pW2_x1 + halfSlot, y1 + topSlotOvercut);
    addLine(pW2_x1 + halfSlot, y1 + topSlotOvercut, pW2_x1 + halfSlot, y0_W);
    addLine(pW2_x1 + halfSlot, y0_W, pW2_x2, y0_W);
    addLine(pW2_x2, y0_W, pW2_x2, y1);
  } else {
    addLine(pL1_x1, y1, pW2_x2, y1);
  }

  addLine(pW2_x2, y2, pW2_x2, y3_W);
  addLine(pW2_x2, y3_W, pW2_x1 + halfSlot, y3_W);
  addLine(pW2_x1 + halfSlot, y3_W, pW2_x1 + halfSlot, y2 - slotOvercut);

  addLine(pW2_x1 + halfSlot, y2 - slotOvercut, pL2_x2 - halfSlot, y2 - slotOvercut);
  addLine(pL2_x2 - halfSlot, y2 - slotOvercut, pL2_x2 - halfSlot, y3_L);
  addLine(pL2_x2 - halfSlot, y3_L, pL2_x1 + halfSlot, y3_L);
  addLine(pL2_x1 + halfSlot, y3_L, pL2_x1 + halfSlot, y2 - slotOvercut);

  addLine(pL2_x1 + halfSlot, y2 - slotOvercut, pW1_x2 - halfSlot, y2 - slotOvercut);
  addLine(pW1_x2 - halfSlot, y2 - slotOvercut, pW1_x2 - halfSlot, y3_W);
  addLine(pW1_x2 - halfSlot, y3_W, pW1_x1 + halfSlot, y3_W);
  addLine(pW1_x1 + halfSlot, y3_W, pW1_x1 + halfSlot, y2 - slotOvercut);

  addLine(pW1_x1 + halfSlot, y2 - slotOvercut, pL1_x2 - halfSlot, y2 - slotOvercut);
  addLine(pL1_x2 - halfSlot, y2 - slotOvercut, pL1_x2 - halfSlot, y3_L);
  addLine(pL1_x2 - halfSlot, y3_L, pL1_x1, y3_L);
  addLine(pL1_x1, y3_L, pL1_x1, y2);

  const creaseLines: string[] = [];
  const addCrease = (xA: number, yA: number, xB: number, yB: number) => {
    creaseLines.push(`M ${r(xA)} ${r(yA)} L ${r(xB)} ${r(yB)}`);
  };
  if (hasTopFlaps) addCrease(pL1_x1, y1, pW2_x2, y1);
  addCrease(pL1_x1, y2, pW2_x2, y2);
  if (glueFlapPosition === 'left') addCrease(pL1_x1, y1, pL1_x1, y2);
  else addCrease(pW2_x2, y1, pW2_x2, y2);
  addCrease(pW1_x1, y1 + topSlotOvercut, pW1_x1, y2 - slotOvercut);
  addCrease(pL2_x1, y1 + topSlotOvercut, pL2_x1, y2 - slotOvercut);
  addCrease(pW2_x1, y1 + topSlotOvercut, pW2_x1, y2 - slotOvercut);

  const topAnchor = Math.min(y0_L, y0_W, y1);
  const bottomAnchor = Math.max(y3_L, y3_W, y2);
  const blankWidthMm = Math.round((x5 - x0) * 100) / 100;
  const blankHeightMm = Math.round((bottomAnchor - topAnchor) * 100) / 100;
  const blankAreaSqM = parseFloat(((blankWidthMm / 1000) * (blankHeightMm / 1000)).toFixed(4));

  const isCleanCad = params.mode === 'clean-cad';
  const dimOffsetTop = topAnchor - 26;
  const dimOffsetTopTotal = topAnchor - 52;
  const dimOffsetLeft = x0 - 26;
  const dimOffsetLeftTotal = x0 - 52;

  const titleBlockW = 590;
  const titleBlockH = 148;
  const pad = isCleanCad ? 4 : 20;
  const contentMinX = isCleanCad ? x0 : Math.min(dimOffsetLeftTotal - 16, x0 - 4);
  const contentMinY = isCleanCad ? topAnchor : Math.min(dimOffsetTopTotal - 14, topAnchor - 4);
  const contentMaxX = Math.max(x5 + 14, isCleanCad ? x5 : Math.max(x5 + 14, contentMinX + titleBlockW));
  const contentMaxY = isCleanCad ? bottomAnchor : bottomAnchor + 28 + titleBlockH;

  const viewBoxMinX = r(contentMinX - pad);
  const viewBoxMinY = r(contentMinY - pad);
  const viewBoxW = r(contentMaxX - contentMinX + pad * 2);
  const viewBoxH = r(contentMaxY - contentMinY + pad * 2);

  const cutPathsMarkup = cutLines
    .map((d) => `    <path d="${d}" />`)
    .join('\n');
  const creasePathsMarkup = creaseLines
    .map((d) => `    <path d="${d}" />`)
    .join('\n');

  let extraLayersMarkup = '';
  if (!isCleanCad) {
    const dimFont = Math.min(20, Math.max(8, params.dimFontSizePt || 12));
    const fmt = (val: number) => String(Math.round(val * 10) / 10);
    const dimSpecs = [
      { x1: x0, y1: dimOffsetTop, x2: x1, y2: dimOffsetTop, text: fmt(x1 - x0), isV: false },
      { x1: x1, y1: dimOffsetTop, x2: x2, y2: dimOffsetTop, text: fmt(x2 - x1), isV: false },
      { x1: x2, y1: dimOffsetTop, x2: x3, y2: dimOffsetTop, text: fmt(x3 - x2), isV: false },
      { x1: x3, y1: dimOffsetTop, x2: x4, y2: dimOffsetTop, text: fmt(x4 - x3), isV: false },
      { x1: x4, y1: dimOffsetTop, x2: x5, y2: dimOffsetTop, text: fmt(x5 - x4), isV: false },
      { x1: x0, y1: dimOffsetTopTotal, x2: x5, y2: dimOffsetTopTotal, text: fmt(x5 - x0), isV: false },
      ...(hasTopFlaps
        ? [{ x1: dimOffsetLeft, y1: y0_L, x2: dimOffsetLeft, y2: y1, text: fmt(topFlapL), isV: true }]
        : []),
      { x1: dimOffsetLeft, y1: y1, x2: dimOffsetLeft, y2: y2, text: fmt(dPanel), isV: true },
      { x1: dimOffsetLeft, y1: y2, x2: dimOffsetLeft, y2: y3_L, text: fmt(bottomFlapL), isV: true },
      {
        x1: dimOffsetLeftTotal,
        y1: topAnchor,
        x2: dimOffsetLeftTotal,
        y2: bottomAnchor,
        text: fmt(bottomAnchor - topAnchor),
        isV: true,
      },
    ];

    const dimMarkup = dimSpecs
      .map((d) => {
        const cx = r((d.x1 + d.x2) / 2);
        const cy = r((d.y1 + d.y2) / 2);
        const textLen = d.text.length * (dimFont * 0.62);
        const boxW = d.isV ? dimFont + 4 : textLen + 8;
        const boxH = d.isV ? textLen + 8 : dimFont + 4;
        const baselineY = r(cy + dimFont * 0.35);
        const a1 = d.isV
          ? `${r(d.x1 - 2)},${r(d.y1 + 4)} ${r(d.x1)},${r(d.y1)} ${r(d.x1 + 2)},${r(d.y1 + 4)}`
          : `${r(d.x1 + 4)},${r(d.y1 - 2)} ${r(d.x1)},${r(d.y1)} ${r(d.x1 + 4)},${r(d.y1 + 2)}`;
        const a2 = d.isV
          ? `${r(d.x2 - 2)},${r(d.y2 - 4)} ${r(d.x2)},${r(d.y2)} ${r(d.x2 + 2)},${r(d.y2 - 4)}`
          : `${r(d.x2 - 4)},${r(d.y2 - 2)} ${r(d.x2)},${r(d.y2)} ${r(d.x2 - 4)},${r(d.y2 + 2)}`;
        const rotAttr = d.isV ? ` transform="rotate(-90 ${cx},${cy})"` : '';
        return [
          `    <line x1="${r(d.x1)}" y1="${r(d.y1)}" x2="${r(d.x2)}" y2="${r(d.y2)}" />`,
          `    <polygon points="${a1}" fill="#3B82F6" stroke="none" />`,
          `    <polygon points="${a2}" fill="#3B82F6" stroke="none" />`,
          `    <rect x="${r(cx - boxW / 2)}" y="${r(cy - boxH / 2)}" width="${r(boxW)}" height="${r(boxH)}" fill="#FFFFFF" stroke="none" />`,
          `    <text x="${cx}" y="${baselineY}" fill="#1D4ED8" stroke="none" font-size="${dimFont}" font-family="Arial, Helvetica, sans-serif" font-weight="bold" text-anchor="middle"${rotAttr}>${escapeXmlAttr(d.text)}</text>`,
        ].join('\n');
      })
      .join('\n');

    const flCx = r((pL2_x1 + pL2_x2) / 2);
    const flCy = r(y1 + Math.min(dPanel * 0.36, 42));
    const flHalf = r(Math.max(18, Math.min(38, dPanel * 0.38, lPanel * 0.35)) / 2);
    const flIsV = params.fluteDirection !== 'horizontal';
    const fluteMarkup = flIsV
      ? `    <line x1="${flCx}" y1="${r(flCy - flHalf)}" x2="${flCx}" y2="${r(flCy + flHalf)}" stroke="#475569" stroke-width="1.1" />\n    <text x="${flCx}" y="${r(flCy + flHalf + 10)}" font-size="7" font-family="Arial, Helvetica, sans-serif" font-weight="bold" fill="#334155" text-anchor="middle">FLUTE VERTICAL</text>`
      : `    <line x1="${r(flCx - flHalf)}" y1="${flCy}" x2="${r(flCx + flHalf)}" y2="${flCy}" stroke="#B45309" stroke-width="1.1" />\n    <text x="${flCx}" y="${r(flCy + 12)}" font-size="7" font-family="Arial, Helvetica, sans-serif" font-weight="bold" fill="#B45309" text-anchor="middle">FLUTE HORIZONTAL</text>`;

    const tbX = r(contentMaxX - titleBlockW);
    const tbY = r(bottomAnchor + 28);
    const titleBlockMarkup = `  <g id="LAYER_TITLE_BLOCK" transform="translate(${tbX}, ${tbY})">
    <rect x="0" y="0" width="${titleBlockW}" height="${titleBlockH}" fill="#FFFFFF" stroke="#94A3B8" stroke-width="1.2" rx="4" />
    <text x="14" y="20" font-size="9.5" font-family="Arial, Helvetica, sans-serif" fill="#334155" font-weight="bold">LEGEND &amp; SCALE</text>
    <line x1="14" y1="34" x2="42" y2="34" stroke="#000000" stroke-width="1.5" />
    <text x="48" y="37" font-size="8" font-family="Arial, Helvetica, sans-serif" fill="#0F172A">CUT LINE</text>
    <line x1="14" y1="49" x2="42" y2="49" stroke="#E11D48" stroke-width="1.3" stroke-dasharray="5,3" />
    <text x="48" y="52" font-size="8" font-family="Arial, Helvetica, sans-serif" fill="#0F172A">CREASE LINE</text>
    <text x="14" y="76" font-size="7.5" font-family="Arial, Helvetica, sans-serif" fill="#64748B">Scale: 1:1 (1 unit = 1 mm)</text>
    <text x="14" y="92" font-size="7.5" font-family="Arial, Helvetica, sans-serif" fill="#64748B">Flute: ${escapeXmlAttr(params.fluteDirection.toUpperCase())}</text>
    <text x="14" y="108" font-size="7.5" font-family="Arial, Helvetica, sans-serif" fill="#0F172A">Depth Allow: ${compensateInnerFlapDepth ? `+${depthAllowanceMm} mm (ON)` : '0 mm (OFF)'}</text>
    <text x="14" y="132" font-size="8" font-family="Arial, Helvetica, sans-serif" font-weight="bold" fill="#0F172A">CAD: DieCut.Room</text>
    <line x1="160" y1="12" x2="160" y2="${titleBlockH - 12}" stroke="#E2E8F0" stroke-width="1" />
    <text x="176" y="20" font-size="9.5" font-family="Arial, Helvetica, sans-serif" fill="#334155" font-weight="bold">BOX SPECIFICATIONS</text>
    <text x="176" y="38" font-size="8.5" font-family="Arial, Helvetica, sans-serif" fill="#64748B">Style:</text>
    <text x="260" y="38" font-size="8.5" font-family="Arial, Helvetica, sans-serif" fill="#0F172A" font-weight="bold">FEFCO ${escapeXmlAttr(boxStyle)} · ${escapeXmlAttr(fluteSpec.name)}</text>
    <text x="176" y="56" font-size="8.5" font-family="Arial, Helvetica, sans-serif" fill="#64748B">Inner (ID):</text>
    <text x="260" y="56" font-size="8.5" font-family="Arial, Helvetica, sans-serif" fill="#0F172A" font-weight="bold">${L} x ${W} x ${D} mm</text>
    <text x="176" y="74" font-size="8.5" font-family="Arial, Helvetica, sans-serif" fill="#64748B">Outer (OD):</text>
    <text x="260" y="74" font-size="8.5" font-family="Arial, Helvetica, sans-serif" fill="#0F172A" font-weight="bold">${outerL} x ${outerW} x ${outerD} mm</text>
    <text x="176" y="92" font-size="8.5" font-family="Arial, Helvetica, sans-serif" fill="#64748B">Blank / Area:</text>
    <text x="260" y="92" font-size="8.5" font-family="Arial, Helvetica, sans-serif" fill="#0F172A">${Math.ceil(blankWidthMm)} x ${Math.ceil(blankHeightMm)} mm (${blankAreaSqM.toFixed(3)} m2)</text>
    <text x="176" y="110" font-size="8.5" font-family="Arial, Helvetica, sans-serif" fill="#64748B">Material:</text>
    <text x="260" y="110" font-size="8.5" font-family="Arial, Helvetica, sans-serif" fill="#0F172A">${escapeXmlAttr(params.material || 'Standard')}</text>
  </g>`;

    extraLayersMarkup = `
  <g id="LAYER_PREPRESS_FLUTE">
${fluteMarkup}
  </g>
  <g id="LAYER_DIMENSIONS" stroke="#3B82F6" stroke-width="0.6" fill="none">
${dimMarkup}
  </g>
${titleBlockMarkup}`;
  }

  const bgMarkup = isCleanCad
    ? ''
    : `\n  <rect x="${viewBoxMinX}" y="${viewBoxMinY}" width="${viewBoxW}" height="${viewBoxH}" fill="#FFFFFF" stroke="none" />`;

  const svgContent = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<!-- Exported from DieCut.Room · FEFCO ${boxStyle} · Mode: ${params.mode} · Scale 1:1 mm -->`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBoxMinX} ${viewBoxMinY} ${viewBoxW} ${viewBoxH}" width="${viewBoxW}mm" height="${viewBoxH}mm">${bgMarkup}`,
    '  <g id="LAYER_CUT" stroke="#000000" stroke-width="1.5" stroke-linecap="square" fill="none">',
    cutPathsMarkup,
    '  </g>',
    '  <g id="LAYER_CREASE" stroke="#E11D48" stroke-width="1.3" stroke-dasharray="10, 5" stroke-linecap="square" fill="none">',
    creasePathsMarkup,
    '  </g>',
    extraLayersMarkup,
    '</svg>',
  ]
    .filter(Boolean)
    .join('\n');

  const suffix = isCleanCad ? 'cad' : 'spec';
  const filename = `diecut-room-fefco-${boxStyle}-${Math.ceil(blankWidthMm)}x${Math.ceil(blankHeightMm)}mm-${suffix}.svg`;

  return {
    svgContent,
    filename,
    geometry: {
      boxStyle,
      fluteType: fluteSpec.id,
      caliperMm: T,
      innerDimensionsMm: { length: L, width: W, depth: D },
      outerDimensionsMm: { length: outerL, width: outerW, depth: outerD },
      innerFlapDepthAllowanceMm: depthAllowanceMm,
      blankDimensionsMm: { width: Math.ceil(blankWidthMm), height: Math.ceil(blankHeightMm) },
      blankAreaSqM,
      viewBoxMm: { width: viewBoxW, height: viewBoxH },
    },
  };
}

function runAgentDielineGenerator(rawBody: Record<string, unknown>, baseUrl: string) {
  const formText =
    typeof rawBody.formText === 'string'
      ? rawBody.formText
      : typeof rawBody.form_text === 'string'
      ? rawBody.form_text
      : typeof rawBody.text === 'string'
      ? rawBody.text
      : '';
  const fromText = formText ? parseAgentFormText(formText) : {};

  const idLengthMm =
    parseNumLoose(rawBody.idLengthMm ?? rawBody.id_length_mm ?? rawBody.length) ?? fromText.idLengthMm;
  const idWidthMm =
    parseNumLoose(rawBody.idWidthMm ?? rawBody.id_width_mm ?? rawBody.width) ?? fromText.idWidthMm;
  const idDepthMm =
    parseNumLoose(rawBody.idDepthMm ?? rawBody.id_depth_mm ?? rawBody.depth) ?? fromText.idDepthMm;

  const missing: string[] = [];
  if (!idLengthMm || idLengthMm < 20) missing.push('ID Panjang (mm >= 20)');
  if (!idWidthMm || idWidthMm < 20) missing.push('ID Lebar (mm >= 20)');
  if (!idDepthMm || idDepthMm < 20) missing.push('ID Tinggi (mm >= 20)');

  const rawFlute = String(
    rawBody.fluteType ?? rawBody.flute_type ?? rawBody.flute ?? fromText.fluteType ?? 'C'
  );
  const fluteSpec = normalizeFluteTypeInput(rawFlute);
  if (!fluteSpec) {
    return {
      ok: false as const,
      status: 400,
      error: `Flute type "${rawFlute}" tidak dikenali. Pilihan valid: F, E, B, C, A, EB, BC, AB, AA.`,
      missingFields: ['Flute Type'],
    };
  }

  if (missing.length > 0) {
    return {
      ok: false as const,
      status: 400,
      error: `Data dimensi belum lengkap atau < 20 mm: ${missing.join(', ')}.`,
      missingFields: missing,
      templateFormText: buildAgentFormTemplateText(),
    };
  }

  const rawMode = String(rawBody.mode ?? rawBody.exportMode ?? rawBody.export_mode ?? 'clean-cad')
    .trim()
    .toLowerCase();
  const mode: AgentDielineMode = rawMode === 'spec-sheet' || rawMode === 'spec' ? 'spec-sheet' : 'clean-cad';

  const rawBoxStyle = String(
    rawBody.boxStyle ?? rawBody.box_style ?? fromText.boxStyle ?? '0201'
  );
  const boxStyle = ['0200', '0201', '0202', '0203', '0204'].includes(rawBoxStyle)
    ? rawBoxStyle
    : '0201';

  const glueFlapWidthMm = Math.min(
    80,
    Math.max(15, parseNumLoose(rawBody.glueFlapWidthMm ?? rawBody.glue_flap_width_mm) ?? 35)
  );
  const glueFlapPosition: 'left' | 'right' =
    rawBody.glueFlapPosition === 'right' || rawBody.glue_flap_position === 'right'
      ? 'right'
      : 'left';
  const flapGapMm = Math.min(20, Math.max(0, parseNumLoose(rawBody.flapGapMm ?? rawBody.flap_gap_mm) ?? 3));
  const slotGapMm = Math.min(20, Math.max(2, parseNumLoose(rawBody.slotGapMm ?? rawBody.slot_gap_mm) ?? 7));
  const flapOverlapMm = Math.min(100, Math.max(0, parseNumLoose(rawBody.flapOverlapMm ?? rawBody.flap_overlap_mm) ?? 30));
  const fishtailCompensation =
    rawBody.fishtailCompensation !== false && rawBody.fishtail_compensation !== false;
  const compensateInnerFlapDepth =
    rawBody.compensateInnerFlapDepth !== false && rawBody.compensate_inner_flap_depth !== false;
  const fluteDirection: 'vertical' | 'horizontal' =
    rawBody.fluteDirection === 'horizontal' ||
    rawBody.flute_direction === 'horizontal' ||
    fromText.fluteDirection === 'horizontal'
      ? 'horizontal'
      : 'vertical';
  const dimFontSizePt = Math.min(
    20,
    Math.max(8, parseNumLoose(rawBody.dimFontSizePt ?? rawBody.dim_font_size_pt) ?? 12)
  );
  const material = String(rawBody.material ?? fromText.material ?? '').trim() || (fluteSpec.wall === 'double-wall' ? 'K150/M125/M125/M125/K150' : 'K150/M125/K150');

  const exp = Date.now() + AGENT_DIELINE_TOKEN_TTL_MS;
  const payload: AgentDielineTokenPayload = {
    L: Math.round(idLengthMm! * 10) / 10,
    W: Math.round(idWidthMm! * 10) / 10,
    D: Math.round(idDepthMm! * 10) / 10,
    fluteType: fluteSpec.id,
    boxStyle,
    mode,
    glueFlapWidthMm,
    glueFlapPosition,
    flapGapMm,
    slotGapMm,
    flapOverlapMm,
    fishtailCompensation,
    compensateInnerFlapDepth,
    fluteDirection,
    dimFontSizePt,
    material,
    exp,
  };

  const built = buildServerDielineSvg(payload);
  const token = signAgentDielinePayload(payload);
  const downloadUrl = `${baseUrl}/api/agent/dieline/download?token=${encodeURIComponent(token)}`;
  const includeSvgContent = rawBody.includeSvgContent !== false && rawBody.include_svg_content !== false;

  const formattedReply = [
    `*Dieline 2D SVG (${mode === 'clean-cad' ? 'Clean CAD 1:1 mm' : 'Spec Sheet 1:1 mm'})*`,
    `• Style & Flute: FEFCO ${boxStyle} · ${fluteSpec.name}`,
    `• Inner (ID): ${payload.L} × ${payload.W} × ${payload.D} mm`,
    `• Outer (OD): ${built.geometry.outerDimensionsMm.length} × ${built.geometry.outerDimensionsMm.width} × ${built.geometry.outerDimensionsMm.depth} mm`,
    `• Blank Size: ${built.geometry.blankDimensionsMm.width} × ${built.geometry.blankDimensionsMm.height} mm (${built.geometry.blankAreaSqM.toFixed(3)} m²)`,
    `• File SVG: ${built.filename}`,
    `• Unduh Langsung (berlaku 24 jam): ${downloadUrl}`,
  ].join('\n');

  return {
    ok: true as const,
    mode,
    filename: built.filename,
    downloadUrl,
    expiresAt: new Date(exp).toISOString(),
    geometry: built.geometry,
    ...(includeSvgContent ? { svgContent: built.svgContent } : {}),
    formattedReply,
  };
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  if (process.env.TRUST_PROXY !== 'false') {
    app.set('trust proxy', 1);
  }
  app.set('etag', false);

  app.use(express.json({ limit: '2mb' }));

  // Optional strict CORS allowlist for Split-Deploy (e.g., Vercel frontend + Debian VPS API)
  const corsAllowedOrigins = new Set(
    (process.env.CORS_ALLOWED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim().replace(/\/+$/, ''))
      .filter((s) => /^https?:\/\/[^*\s]+$/i.test(s))
  );

  // Prevent browser, reverse proxy, or Service Worker caching on dynamic auth/admin/user APIs
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    const reqOrigin = typeof req.headers.origin === 'string' ? req.headers.origin.trim().replace(/\/+$/, '') : '';
    if (reqOrigin && corsAllowedOrigins.has(reqOrigin)) {
      res.setHeader('Access-Control-Allow-Origin', reqOrigin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Agent-Key');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }
    }
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, db: 'sqlite', timestamp: new Date().toISOString() });
  });

  app.get('/api/fonts/available', (_req: Request, res: Response) => {
    const candidateDirs = [
      path.join(process.cwd(), 'public', 'fonts'),
      path.join(process.cwd(), 'dist', 'fonts'),
    ];
    const seen = new Set<string>();
    const files: Array<{ url: string; weight: string; format: 'woff2' | 'woff' }> = [];

    const inferWeight = (filename: string): string => {
      const lower = filename.toLowerCase();
      if (lower.includes('bold') && lower.includes('semi')) return '600';
      if (lower.includes('bold')) return '700';
      if (lower.includes('medium')) return '500';
      if (lower.includes('regular')) return '400';
      if (lower.includes('light')) return '300';
      return '100 900';
    };

    for (const dir of candidateDirs) {
      if (!fs.existsSync(dir)) continue;
      for (const entry of fs.readdirSync(dir)) {
        const lower = entry.toLowerCase();
        if (!lower.includes('timeless')) continue;
        if (!lower.endsWith('.woff2') && !lower.endsWith('.woff')) continue;
        if (seen.has(entry)) continue;
        seen.add(entry);
        files.push({
          url: `/fonts/${encodeURIComponent(entry)}`,
          weight: inferWeight(entry),
          format: lower.endsWith('.woff2') ? 'woff2' : 'woff',
        });
      }
    }

    res.json({ files });
  });

  // Check active session
  app.get('/api/auth/me', (req: Request, res: Response) => {
    const token = extractSessionToken(req);
    if (!token) {
      res.status(401).json({ user: null });
      return;
    }
    const verified = verifySessionToken(token);
    if (!verified) {
      clearSessionCookie(req, res);
      res.status(401).json({ user: null });
      return;
    }
    const user = db
      .prepare('SELECT * FROM users WHERE id = ? LIMIT 1')
      .get(verified.uid) as unknown as UserRow | undefined;
    if (!user || Number(user.token_version || 1) !== verified.tv) {
      clearSessionCookie(req, res);
      res.status(401).json({ user: null });
      return;
    }
    if (user.status !== 'active') {
      clearSessionCookie(req, res);
      res.status(403).json({
        code: user.status === 'pending' ? 'ACCOUNT_PENDING' : 'ACCOUNT_DISABLED',
        user: { name: user.name, email: user.email, status: user.status },
      });
      return;
    }
    res.json({ user: sanitizeUser(user) });
  });

  // Self-registration -> always starts in PENDING state until Admin activates
  app.post('/api/auth/register', (req: Request, res: Response) => {
    const name = clipStr(req.body?.name, 80);
    const email = clipStr(req.body?.email, 120).toLowerCase();
    const company = clipStr(req.body?.company, 100);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const clientMeta = req.body?.clientMeta || {};

    if (name.length < 2) {
      res.status(400).json({ error: 'Nama lengkap minimal 2 karakter.' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Format alamat email tidak valid.' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'Password minimal 6 karakter.' });
      return;
    }

    const existing = db.prepare('SELECT id, status FROM users WHERE email = ? LIMIT 1').get(
      email
    ) as { id: string; status: string } | undefined;

    if (existing) {
      if (existing.status === 'pending') {
        res.status(409).json({
          code: 'ALREADY_PENDING',
          error:
            'Email ini sudah terdaftar dan masih menunggu persetujuan Admin. Silakan konfirmasi via WhatsApp.',
        });
      } else if (existing.status === 'disabled') {
        res.status(409).json({
          code: 'ALREADY_DISABLED',
          error:
            'Akun dengan email ini sedang dinonaktifkan. Hubungi Admin melalui WhatsApp untuk aktivasi kembali.',
        });
      } else {
        res.status(409).json({
          error: 'Email sudah terdaftar. Silakan masuk melalui tab Login.',
        });
      }
      return;
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const accessOrigin =
      clipStr(clientMeta.origin, 200) ||
      clipStr(req.headers.origin, 200) ||
      clipStr(req.headers.host, 120);
    const accessPath = clipStr(clientMeta.path, 200) || '/';
    const accessReferrer =
      clipStr(clientMeta.referrer, 240) || clipStr(req.headers.referer, 240);
    const deviceSummary =
      clipStr(clientMeta.deviceSummary, 200) || clipStr(req.headers['user-agent'], 180);
    const timezone = clipStr(clientMeta.timezone, 64);
    const lastIp = extractClientIp(req);

    db.prepare(
      `INSERT INTO users (
        id, name, email, company, password_hash, role, status,
        access_origin, access_path, access_referrer, device_summary, timezone, last_ip, created_at
      ) VALUES (?, ?, ?, ?, ?, 'user', 'pending', ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      name,
      email,
      company,
      hashPassword(password),
      accessOrigin,
      accessPath,
      accessReferrer,
      deviceSummary,
      timezone,
      lastIp,
      now
    );

    const created = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow;
    recordAuditLog({
      eventType: 'register_pending',
      severity: 'info',
      actorEmail: email,
      targetEmail: email,
      detail: `Pendaftaran baru (${company || 'tanpa perusahaan'}) menunggu aktivasi`,
      ipAddress: lastIp,
      origin: accessOrigin,
    });
    res.status(201).json({
      status: 'pending',
      message:
        'Pendaftaran berhasil dicatat. Silakan konfirmasi ke Admin via WhatsApp untuk aktivasi akun.',
      user: sanitizeUser(created),
    });
  });

  // Login (with brute-force protection, account lockout, and structured pending/disabled codes)
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const email = clipStr(req.body?.email, 120).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const clientMeta = req.body?.clientMeta || {};
    const lastIp = extractClientIp(req);
    const ipBucket = `login:${lastIp}`;

    const ipWaitSec = checkIpRateLimit(ipBucket, 25, 15 * 60 * 1000);
    if (ipWaitSec > 0) {
      res.status(429).json({
        error: `Terlalu banyak percobaan login dari IP ini. Coba lagi dalam ${Math.ceil(
          ipWaitSec / 60
        )} menit.`,
      });
      return;
    }

    if (!email || !password) {
      res.status(400).json({ error: 'Email dan password wajib diisi.' });
      return;
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ? LIMIT 1').get(email) as unknown as
      | UserRow
      | undefined;

    if (user?.locked_until) {
      const lockMs = new Date(user.locked_until).getTime();
      if (Number.isFinite(lockMs) && lockMs > Date.now()) {
        const waitMin = Math.max(1, Math.ceil((lockMs - Date.now()) / 60000));
        res.status(429).json({
          error: `Akun dikunci sementara setelah beberapa kali salah password. Coba lagi dalam ${waitMin} menit atau hubungi Admin.`,
        });
        return;
      }
    }

    if (!user || !verifyPassword(password, user.password_hash)) {
      recordIpAttempt(ipBucket, 15 * 60 * 1000);
      if (user) {
        const nextFails = Number(user.failed_login_count || 0) + 1;
        const shouldLock = nextFails >= 5;
        const lockedUntil = shouldLock ? new Date(Date.now() + 5 * 60 * 1000).toISOString() : null;
        db.prepare('UPDATE users SET failed_login_count = ?, locked_until = ? WHERE id = ?').run(
          nextFails,
          lockedUntil,
          user.id
        );
        recordAuditLog({
          eventType: shouldLock ? 'login_locked' : 'login_failed',
          severity: shouldLock ? 'critical' : 'warning',
          actorEmail: email,
          targetEmail: email,
          detail: shouldLock
            ? `Akun dikunci 5 menit setelah ${nextFails} kali gagal login`
            : `Percobaan login gagal ke-${nextFails}`,
          ipAddress: lastIp,
          origin: clipStr(clientMeta.origin || req.headers.origin || req.headers.host, 200),
        });
      } else {
        recordAuditLog({
          eventType: 'login_failed',
          severity: 'warning',
          actorEmail: email,
          targetEmail: email,
          detail: 'Percobaan login gagal (email tidak terdaftar)',
          ipAddress: lastIp,
          origin: clipStr(clientMeta.origin || req.headers.origin || req.headers.host, 200),
        });
      }
      res.status(401).json({ error: 'Email atau password salah.' });
      return;
    }

    const accessOrigin =
      clipStr(clientMeta.origin, 200) || user.access_origin || clipStr(req.headers.host, 120);
    const accessPath = clipStr(clientMeta.path, 200) || user.access_path;
    const accessReferrer = clipStr(clientMeta.referrer, 240) || user.access_referrer;
    const deviceSummary = clipStr(clientMeta.deviceSummary, 200) || user.device_summary;
    const timezone = clipStr(clientMeta.timezone, 64) || user.timezone;

    if (user.status === 'pending') {
      db.prepare(
        `UPDATE users SET access_origin = ?, access_path = ?, device_summary = ?, timezone = ?, last_ip = ?, failed_login_count = 0, locked_until = NULL WHERE id = ?`
      ).run(accessOrigin, accessPath, deviceSummary, timezone, lastIp, user.id);

      res.status(403).json({
        code: 'ACCOUNT_PENDING',
        error: 'Akun Anda masih Pending dan menunggu persetujuan Admin.',
        user: { name: user.name, email: user.email, status: user.status },
      });
      return;
    }

    if (user.status === 'disabled') {
      res.status(403).json({
        code: 'ACCOUNT_DISABLED',
        error: 'Akun Anda sedang dinonaktifkan oleh Admin.',
        user: { name: user.name, email: user.email, status: user.status },
      });
      return;
    }

    clearIpAttempt(ipBucket);
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE users SET access_origin = ?, access_path = ?, access_referrer = ?, device_summary = ?, timezone = ?, last_ip = ?, last_login_at = ?, failed_login_count = 0, locked_until = NULL WHERE id = ?`
    ).run(
      accessOrigin,
      accessPath,
      accessReferrer,
      deviceSummary,
      timezone,
      lastIp,
      now,
      user.id
    );

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as unknown as UserRow;
    const token = signSessionToken(user.id, Number(updated.token_version || 1));
    setSessionCookie(req, res, token);
    recordAuditLog({
      eventType: 'login_success',
      severity: 'info',
      actorEmail: updated.email,
      targetEmail: updated.email,
      detail: `${updated.role === 'admin' ? 'Admin' : 'User'} masuk via ${deviceSummary || 'browser'}`,
      ipAddress: lastIp,
      origin: accessOrigin,
    });
    res.json({ user: sanitizeUser(updated), token });
  });

  // Hidden Admin Emergency Recovery via Recovery Key (for when Admin forgets password)
  app.post('/api/auth/admin-recover', (req: Request, res: Response) => {
    const email = clipStr(req.body?.email, 120).toLowerCase();
    const recoveryKey = clipStr(req.body?.recoveryKey, 120);
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
    const lastIp = extractClientIp(req);
    const origin = clipStr(req.headers.origin || req.headers.host, 200);
    const bucket = `admin-recover:${lastIp}`;

    const waitSec = checkIpRateLimit(bucket, 6, 15 * 60 * 1000);
    if (waitSec > 0) {
      res.status(429).json({
        error: `Terlalu banyak percobaan pemulihan Admin. Tunggu ${Math.ceil(
          waitSec / 60
        )} menit atau gunakan CLI VPS (npm run admin:reset).`,
      });
      return;
    }

    if (!email || !recoveryKey || newPassword.length < 6) {
      res.status(400).json({
        error: 'Email Admin, Recovery Key, dan password baru (min. 6 karakter) wajib diisi.',
      });
      return;
    }

    const adminUser = db
      .prepare("SELECT * FROM users WHERE email = ? AND role = 'admin' LIMIT 1")
      .get(email) as unknown as UserRow | undefined;

    const storedHash = getSystemMeta('admin_recovery_key_hash')?.value || '';
    const envRecovery = (process.env.ADMIN_RECOVERY_KEY || '').trim();
    const envRecoveryValid = envRecovery.length >= 8 && !isEnvPlaceholder(envRecovery);

    const matchesDb = storedHash ? verifyPassword(recoveryKey, storedHash) : false;
    const matchesEnv = envRecoveryValid ? timingSafeStringMatch(recoveryKey, envRecovery) : false;

    if (!adminUser || (!matchesDb && !matchesEnv)) {
      recordIpAttempt(bucket, 15 * 60 * 1000);
      recordAuditLog({
        eventType: 'login_failed',
        severity: 'critical',
        actorEmail: email,
        targetEmail: email,
        detail: 'Percobaan pemulihan Admin via Recovery Key ditolak (kunci/email tidak cocok)',
        ipAddress: lastIp,
        origin,
      });
      res.status(401).json({
        error:
          'Email Admin atau Recovery Key tidak cocok. Jika lupa keduanya, jalankan `npm run admin:reset` di VPS.',
      });
      return;
    }

    clearIpAttempt(bucket);
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE users
       SET password_hash = ?,
           status = 'active',
           failed_login_count = 0,
           locked_until = NULL,
           token_version = token_version + 1,
           last_ip = ?,
           last_login_at = ?
       WHERE id = ?`
    ).run(hashPassword(newPassword), lastIp, now, adminUser.id);

    const updated = db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(adminUser.id) as unknown as UserRow;
    const token = signSessionToken(updated.id, Number(updated.token_version || 1));
    setSessionCookie(req, res, token);

    recordAuditLog({
      eventType: 'admin_recover',
      severity: 'warning',
      actorEmail: updated.email,
      targetEmail: updated.email,
      detail: `Password Admin dipulihkan via ${
        matchesDb ? 'Recovery Key UI' : 'ENV Recovery Key'
      }; sesi lama dicabut`,
      ipAddress: lastIp,
      origin,
    });

    res.json({ user: sanitizeUser(updated), token });
  });

  // Public Recovery Options Capability Check (does not leak SMTP credentials or admin email)
  app.get('/api/auth/recovery-options', (_req: Request, res: Response) => {
    const smtp = resolveSmtpConfig();
    const envRecovery = (process.env.ADMIN_RECOVERY_KEY || '').trim();
    const hasEnvRecovery = envRecovery.length >= 8 && !isEnvPlaceholder(envRecovery);
    const hasDbRecovery = Boolean(getSystemMeta('admin_recovery_key_hash')?.value);
    res.json({
      emailOtpEnabled: Boolean(smtp),
      recoveryKeyConfigured: hasEnvRecovery || hasDbRecovery,
    });
  });

  // Step 1: Request 6-digit Email OTP for Admin Emergency Recovery
  app.post('/api/auth/admin-recover/request-otp', async (req: Request, res: Response) => {
    const email = clipStr(req.body?.email, 120).toLowerCase();
    const lastIp = extractClientIp(req);
    const origin = clipStr(req.headers.origin || req.headers.host, 200);
    const bucket = `admin-otp-req:${lastIp}`;

    const waitSec = checkIpRateLimit(bucket, 5, 15 * 60 * 1000);
    if (waitSec > 0) {
      res.status(429).json({
        error: `Terlalu banyak permintaan kode OTP dari IP ini. Coba lagi dalam ${Math.ceil(
          waitSec / 60
        )} menit.`,
      });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Masukkan alamat email Admin yang valid.' });
      return;
    }

    const smtp = resolveSmtpConfig();
    if (!smtp) {
      res.status(400).json({
        error:
          'Layanan Email OTP belum dikonfigurasi (SMTP belum aktif). Gunakan Recovery Key, minta Admin Cadangan mereset dari browser, atau jalankan `npm run admin:reset` di VPS.',
      });
      return;
    }

    const otpMetaKey = `admin_otp:${email}`;
    const existingOtpRaw = getSystemMeta(otpMetaKey)?.value;
    if (existingOtpRaw) {
      try {
        const parsed = JSON.parse(existingOtpRaw) as { lastSentAt?: number };
        if (parsed.lastSentAt) {
          const elapsedSec = Math.floor((Date.now() - parsed.lastSentAt) / 1000);
          if (elapsedSec < 60) {
            res.status(429).json({
              error: `Kode OTP baru saja dikirim. Tunggu ${60 - elapsedSec} detik untuk mengirim ulang.`,
              cooldownSec: 60 - elapsedSec,
            });
            return;
          }
        }
      } catch {
        // ignore malformed cache
      }
    }

    const adminUser = db
      .prepare("SELECT * FROM users WHERE email = ? AND role = 'admin' AND status = 'active' LIMIT 1")
      .get(email) as unknown as UserRow | undefined;

    if (!adminUser) {
      recordIpAttempt(bucket, 15 * 60 * 1000);
      recordAuditLog({
        eventType: 'login_failed',
        severity: 'warning',
        actorEmail: email,
        targetEmail: email,
        detail: 'Permintaan OTP Admin ditolak (bukan email Admin aktif)',
        ipAddress: lastIp,
        origin,
      });
      res.json({
        ok: true,
        cooldownSec: 60,
        expiresInSec: 600,
        message: 'Jika email terdaftar sebagai Admin aktif, kode OTP 6 digit telah dikirim.',
      });
      return;
    }

    const otpCode = String(crypto.randomInt(100000, 1000000));
    const expiresAt = Date.now() + 10 * 60 * 1000;
    const payload = {
      otpHash: hashPassword(otpCode),
      expiresAt,
      attempts: 0,
      lastSentAt: Date.now(),
    };

    try {
      await sendSmtpEmail(smtp, {
        to: adminUser.email,
        subject: `[DieCut.Room] Kode OTP Pemulihan Admin: ${otpCode}`,
        text: [
          `Halo ${adminUser.name},`,
          '',
          `Gunakan kode OTP 6 digit berikut untuk mereset password Admin DieCut.Room:`,
          '',
          `    ${otpCode}`,
          '',
          'Kode ini berlaku selama 10 menit dan hanya dapat digunakan satu kali.',
          `Permintaan berasal dari IP: ${lastIp}`,
          '',
          'Jika Anda tidak meminta pemulihan ini, abaikan email ini dan cabut sesi aktif dari Konsol Admin.',
        ].join('\n'),
      });
    } catch (err) {
      recordAuditLog({
        eventType: 'otp_requested',
        severity: 'critical',
        actorEmail: adminUser.email,
        targetEmail: adminUser.email,
        detail: `Gagal mengirim Email OTP via SMTP: ${
          err instanceof Error ? err.message : 'SMTP error'
        }`,
        ipAddress: lastIp,
        origin,
      });
      res.status(502).json({
        error:
          'Server gagal mengirim email OTP lewat SMTP. Periksa pengaturan SMTP atau minta Admin Cadangan mereset password Anda.',
      });
      return;
    }

    setSystemMeta(otpMetaKey, JSON.stringify(payload));
    recordAuditLog({
      eventType: 'otp_requested',
      severity: 'warning',
      actorEmail: adminUser.email,
      targetEmail: adminUser.email,
      detail: 'Kode OTP 6 digit pemulihan Admin dikirim ke email',
      ipAddress: lastIp,
      origin,
    });

    res.json({
      ok: true,
      cooldownSec: 60,
      expiresInSec: 600,
      message: 'Jika email terdaftar sebagai Admin aktif, kode OTP 6 digit telah dikirim.',
    });
  });

  // Step 2: Verify 6-digit Email OTP & reset Admin password
  app.post('/api/auth/admin-recover/verify-otp', (req: Request, res: Response) => {
    const email = clipStr(req.body?.email, 120).toLowerCase();
    const otp = clipStr(req.body?.otp, 12).replace(/\s+/g, '');
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
    const lastIp = extractClientIp(req);
    const origin = clipStr(req.headers.origin || req.headers.host, 200);
    const bucket = `admin-otp-verify:${lastIp}`;

    const waitSec = checkIpRateLimit(bucket, 10, 15 * 60 * 1000);
    if (waitSec > 0) {
      res.status(429).json({
        error: `Terlalu banyak percobaan verifikasi OTP. Tunggu ${Math.ceil(
          waitSec / 60
        )} menit atau hubungi Admin Cadangan.`,
      });
      return;
    }

    if (!email || !/^\d{6}$/.test(otp) || newPassword.length < 6) {
      res.status(400).json({
        error: 'Email Admin, kode OTP 6 digit, dan password baru (min. 6 karakter) wajib diisi.',
      });
      return;
    }

    const otpMetaKey = `admin_otp:${email}`;
    const rawOtp = getSystemMeta(otpMetaKey)?.value;
    if (!rawOtp) {
      recordIpAttempt(bucket, 15 * 60 * 1000);
      res.status(401).json({ error: 'Kode OTP belum diminta atau sudah kedaluwarsa. Minta kode baru.' });
      return;
    }

    let otpRecord: { otpHash?: string; expiresAt?: number; attempts?: number };
    try {
      otpRecord = JSON.parse(rawOtp) as { otpHash?: string; expiresAt?: number; attempts?: number };
    } catch {
      deleteSystemMeta(otpMetaKey);
      res.status(401).json({ error: 'Data OTP tidak valid. Silakan minta kode baru.' });
      return;
    }

    if (!otpRecord.expiresAt || Date.now() > otpRecord.expiresAt) {
      deleteSystemMeta(otpMetaKey);
      res.status(401).json({ error: 'Kode OTP sudah kedaluwarsa (> 10 menit). Silakan minta kode baru.' });
      return;
    }

    const attempts = Number(otpRecord.attempts || 0);
    if (attempts >= 5) {
      deleteSystemMeta(otpMetaKey);
      res.status(401).json({ error: 'Batas salah OTP tercapai. Silakan minta kode OTP baru.' });
      return;
    }

    const adminUser = db
      .prepare("SELECT * FROM users WHERE email = ? AND role = 'admin' AND status = 'active' LIMIT 1")
      .get(email) as unknown as UserRow | undefined;

    if (!adminUser || !otpRecord.otpHash || !verifyPassword(otp, otpRecord.otpHash)) {
      const nextAttempts = attempts + 1;
      if (nextAttempts >= 5) {
        deleteSystemMeta(otpMetaKey);
      } else {
        setSystemMeta(otpMetaKey, JSON.stringify({ ...otpRecord, attempts: nextAttempts }));
      }
      recordIpAttempt(bucket, 15 * 60 * 1000);
      recordAuditLog({
        eventType: 'login_failed',
        severity: 'critical',
        actorEmail: email,
        targetEmail: email,
        detail: `Verifikasi OTP pemulihan Admin gagal (percobaan ${nextAttempts}/5)`,
        ipAddress: lastIp,
        origin,
      });
      res.status(401).json({
        error:
          nextAttempts >= 5
            ? 'Kode OTP salah 5 kali dan telah hangus. Silakan minta kode OTP baru.'
            : `Kode OTP tidak cocok (sisa percobaan ${5 - nextAttempts}×).`,
      });
      return;
    }

    deleteSystemMeta(otpMetaKey);
    clearIpAttempt(bucket);
    clearIpAttempt(`admin-otp-req:${lastIp}`);

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE users
       SET password_hash = ?,
           status = 'active',
           failed_login_count = 0,
           locked_until = NULL,
           token_version = token_version + 1,
           last_ip = ?,
           last_login_at = ?
       WHERE id = ?`
    ).run(hashPassword(newPassword), lastIp, now, adminUser.id);

    const updated = db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(adminUser.id) as unknown as UserRow;
    const token = signSessionToken(updated.id, Number(updated.token_version || 1));
    setSessionCookie(req, res, token);

    recordAuditLog({
      eventType: 'admin_recover',
      severity: 'warning',
      actorEmail: updated.email,
      targetEmail: updated.email,
      detail: 'Password Admin dipulihkan via Email OTP; semua sesi lama dicabut',
      ipAddress: lastIp,
      origin,
    });

    res.json({ user: sanitizeUser(updated), token });
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  // Admin: List all registered users + usage counts + security state
  app.get('/api/admin/users', requireAdmin, (_req: AuthedRequest, res: Response) => {
    const rows = db
      .prepare(
        `SELECT u.*,
          (SELECT COUNT(*) FROM bct_history h WHERE h.user_id = u.id) AS history_count,
          (SELECT COUNT(*) FROM saved_projects p WHERE p.user_id = u.id) AS project_count
         FROM users u
         ORDER BY CASE u.status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 ELSE 2 END, u.created_at DESC`
      )
      .all() as unknown as Array<UserRow & { history_count: number; project_count: number }>;

    res.json({
      users: rows.map((row) => ({
        ...sanitizeUser(row),
        historyCount: Number(row.history_count || 0),
        projectCount: Number(row.project_count || 0),
        failedLoginCount: Number(row.failed_login_count || 0),
        lockedUntil: row.locked_until || null,
        tokenVersion: Number(row.token_version || 1),
      })),
    });
  });

  // Admin: Direct create user account (can skip pending)
  app.post('/api/admin/users', requireAdmin, (req: AuthedRequest, res: Response) => {
    const name = clipStr(req.body?.name, 80);
    const email = clipStr(req.body?.email, 120).toLowerCase();
    const company = clipStr(req.body?.company, 100);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const role = req.body?.role === 'admin' ? 'admin' : 'user';
    const status = ['pending', 'active', 'disabled'].includes(req.body?.status)
      ? (req.body.status as 'pending' | 'active' | 'disabled')
      : 'active';

    if (name.length < 2) {
      res.status(400).json({ error: 'Nama lengkap minimal 2 karakter.' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Format email tidak valid.' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'Password minimal 6 karakter.' });
      return;
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ? LIMIT 1').get(email) as
      | { id: string }
      | undefined;
    if (existing) {
      res.status(409).json({ error: 'Email sudah terdaftar di sistem.' });
      return;
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO users (
        id, name, email, company, password_hash, role, status,
        access_origin, access_path, created_at, token_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'admin-console', '/', ?, 1)`
    ).run(id, name, email, company, hashPassword(password), role, status, now);

    const created = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow;
    recordAuditLog({
      eventType: 'user_created',
      severity: role === 'admin' ? 'warning' : 'info',
      actorEmail: req.authUser!.email,
      targetEmail: email,
      detail: `Akun dibuat langsung oleh Admin (role=${role}, status=${status})`,
      ipAddress: extractClientIp(req),
      origin: clipStr(req.headers.origin || req.headers.host, 200),
    });

    res.status(201).json({
      user: {
        ...sanitizeUser(created),
        historyCount: 0,
        projectCount: 0,
        failedLoginCount: 0,
        lockedUntil: null,
        tokenVersion: 1,
      },
    });
  });

  // Admin: Edit user profile & role (with last-active-admin safeguard)
  app.patch('/api/admin/users/:id', requireAdmin, (req: AuthedRequest, res: Response) => {
    const targetId = req.params.id;
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId) as unknown as
      | UserRow
      | undefined;
    if (!target) {
      res.status(404).json({ error: 'User tidak ditemukan.' });
      return;
    }

    const nextName = req.body?.name !== undefined ? clipStr(req.body.name, 80) : target.name;
    const nextEmail =
      req.body?.email !== undefined ? clipStr(req.body.email, 120).toLowerCase() : target.email;
    const nextCompany =
      req.body?.company !== undefined ? clipStr(req.body.company, 100) : target.company;
    const nextRole =
      req.body?.role === 'admin' || req.body?.role === 'user' ? req.body.role : target.role;

    if (nextName.length < 2) {
      res.status(400).json({ error: 'Nama minimal 2 karakter.' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      res.status(400).json({ error: 'Format email tidak valid.' });
      return;
    }

    if (nextEmail !== target.email) {
      const dup = db
        .prepare('SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1')
        .get(nextEmail, targetId);
      if (dup) {
        res.status(409).json({ error: 'Email tersebut sudah digunakan akun lain.' });
        return;
      }
    }

    if (target.role === 'admin' && nextRole !== 'admin') {
      if (target.id === req.authUser?.id) {
        res.status(400).json({ error: 'Admin tidak dapat menurunkan role akun sendiri.' });
        return;
      }
      const otherAdmins = db
        .prepare(
          "SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin' AND status = 'active' AND id != ?"
        )
        .get(targetId) as { cnt: number };
      if (Number(otherAdmins.cnt || 0) === 0) {
        res.status(400).json({ error: 'Harus selalu ada minimal satu Admin aktif.' });
        return;
      }
    }

    const roleChanged = nextRole !== target.role;
    db.prepare(
      `UPDATE users
       SET name = ?, email = ?, company = ?, role = ?,
           token_version = token_version + ?
       WHERE id = ?`
    ).run(nextName, nextEmail, nextCompany, nextRole, roleChanged ? 1 : 0, targetId);

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId) as unknown as UserRow;
    recordAuditLog({
      eventType: roleChanged ? 'role_changed' : 'user_updated',
      severity: roleChanged ? 'warning' : 'info',
      actorEmail: req.authUser!.email,
      targetEmail: updated.email,
      detail: roleChanged
        ? `Role diubah dari ${target.role} menjadi ${nextRole}`
        : `Profil diperbarui (${updated.name})`,
      ipAddress: extractClientIp(req),
      origin: clipStr(req.headers.origin || req.headers.host, 200),
    });

    res.json({
      user: {
        ...sanitizeUser(updated),
        failedLoginCount: Number(updated.failed_login_count || 0),
        lockedUntil: updated.locked_until || null,
        tokenVersion: Number(updated.token_version || 1),
      },
    });
  });

  // Admin: Bulk approve all pending users
  app.post('/api/admin/users/bulk-approve', requireAdmin, (req: AuthedRequest, res: Response) => {
    const pendingRows = db
      .prepare("SELECT id, email FROM users WHERE status = 'pending'")
      .all() as Array<{ id: string; email: string }>;

    if (pendingRows.length === 0) {
      res.json({ approvedCount: 0 });
      return;
    }

    db.prepare(
      "UPDATE users SET status = 'active', failed_login_count = 0, locked_until = NULL WHERE status = 'pending'"
    ).run();

    recordAuditLog({
      eventType: 'status_changed',
      severity: 'info',
      actorEmail: req.authUser!.email,
      targetEmail: pendingRows.map((r) => r.email).join(', '),
      detail: `Aktivasi massal ${pendingRows.length} akun pending`,
      ipAddress: extractClientIp(req),
      origin: clipStr(req.headers.origin || req.headers.host, 200),
    });

    res.json({ approvedCount: pendingRows.length });
  });

  // Admin: Activate / Deactivate / Set Pending
  app.patch(
    '/api/admin/users/:id/status',
    requireAdmin,
    (req: AuthedRequest, res: Response) => {
      const targetId = req.params.id;
      const status = req.body?.status;
      if (!['pending', 'active', 'disabled'].includes(status)) {
        res.status(400).json({ error: 'Status harus pending, active, atau disabled.' });
        return;
      }
      if (targetId === req.authUser?.id && status !== 'active') {
        res.status(400).json({ error: 'Admin tidak dapat menonaktifkan akun sendiri.' });
        return;
      }
      const target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId) as unknown as
        | UserRow
        | undefined;
      if (!target) {
        res.status(404).json({ error: 'User tidak ditemukan.' });
        return;
      }
      if (target.role === 'admin' && target.status === 'active' && status !== 'active') {
        const otherAdmins = db
          .prepare(
            "SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin' AND status = 'active' AND id != ?"
          )
          .get(targetId) as { cnt: number };
        if (Number(otherAdmins.cnt || 0) === 0) {
          res.status(400).json({ error: 'Harus selalu ada minimal satu Admin aktif.' });
          return;
        }
      }
      const bumpTv = status !== 'active' ? 1 : 0;
      db.prepare(
        `UPDATE users
         SET status = ?,
             failed_login_count = CASE WHEN ? = 'active' THEN 0 ELSE failed_login_count END,
             locked_until = CASE WHEN ? = 'active' THEN NULL ELSE locked_until END,
             token_version = token_version + ?
         WHERE id = ?`
      ).run(status, status, status, bumpTv, targetId);

      const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId) as unknown as UserRow;
      recordAuditLog({
        eventType: 'status_changed',
        severity: status === 'disabled' ? 'warning' : 'info',
        actorEmail: req.authUser!.email,
        targetEmail: updated.email,
        detail: `Status diubah dari ${target.status} menjadi ${status}`,
        ipAddress: extractClientIp(req),
        origin: clipStr(req.headers.origin || req.headers.host, 200),
      });

      res.json({
        user: {
          ...sanitizeUser(updated),
          failedLoginCount: Number(updated.failed_login_count || 0),
          lockedUntil: updated.locked_until || null,
          tokenVersion: Number(updated.token_version || 1),
        },
      });
    }
  );

  // Admin: Directly type and update a user's password after WhatsApp verification
  app.patch(
    '/api/admin/users/:id/password',
    requireAdmin,
    (req: AuthedRequest, res: Response) => {
      const targetId = req.params.id;
      const newPassword = typeof req.body?.password === 'string' ? req.body.password : '';
      if (newPassword.length < 6) {
        res.status(400).json({ error: 'Password baru minimal 6 karakter.' });
        return;
      }
      const target = db
        .prepare('SELECT id, email FROM users WHERE id = ?')
        .get(targetId) as { id: string; email: string } | undefined;
      if (!target) {
        res.status(404).json({ error: 'User tidak ditemukan.' });
        return;
      }
      db.prepare(
        `UPDATE users
         SET password_hash = ?,
             failed_login_count = 0,
             locked_until = NULL,
             token_version = token_version + 1
         WHERE id = ?`
      ).run(hashPassword(newPassword), targetId);

      recordAuditLog({
        eventType: 'password_changed',
        severity: 'warning',
        actorEmail: req.authUser!.email,
        targetEmail: target.email,
        detail: 'Password direset oleh Admin & sesi lama dicabut',
        ipAddress: extractClientIp(req),
        origin: clipStr(req.headers.origin || req.headers.host, 200),
      });
      res.json({ ok: true });
    }
  );

  // Admin: Force revoke all active sessions & clear login lockout for a user
  app.post(
    '/api/admin/users/:id/revoke-sessions',
    requireAdmin,
    (req: AuthedRequest, res: Response) => {
      const targetId = req.params.id;
      const target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId) as unknown as
        | UserRow
        | undefined;
      if (!target) {
        res.status(404).json({ error: 'User tidak ditemukan.' });
        return;
      }

      db.prepare(
        `UPDATE users
         SET token_version = token_version + 1,
             failed_login_count = 0,
             locked_until = NULL
         WHERE id = ?`
      ).run(targetId);

      const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId) as unknown as UserRow;
      recordAuditLog({
        eventType: 'session_revoked',
        severity: 'warning',
        actorEmail: req.authUser!.email,
        targetEmail: updated.email,
        detail: `Semua sesi aktif dicabut (token_version=${updated.token_version}) & kunci login dibuka`,
        ipAddress: extractClientIp(req),
        origin: clipStr(req.headers.origin || req.headers.host, 200),
      });

      res.json({
        ok: true,
        tokenVersion: Number(updated.token_version || 1),
      });
    }
  );

  // Admin: Delete user account permanently
  app.delete(
    '/api/admin/users/:id',
    requireAdmin,
    (req: AuthedRequest, res: Response) => {
      const targetId = req.params.id;
      if (targetId === req.authUser?.id) {
        res.status(400).json({ error: 'Admin tidak dapat menghapus akun sendiri.' });
        return;
      }
      const target = db
        .prepare('SELECT id, email, role, status FROM users WHERE id = ?')
        .get(targetId) as { id: string; email: string; role: string; status: string } | undefined;
      if (!target) {
        res.status(404).json({ error: 'User tidak ditemukan.' });
        return;
      }
      if (target.role === 'admin' && target.status === 'active') {
        const otherAdmins = db
          .prepare(
            "SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin' AND status = 'active' AND id != ?"
          )
          .get(targetId) as { cnt: number };
        if (Number(otherAdmins.cnt || 0) === 0) {
          res.status(400).json({ error: 'Harus selalu ada minimal satu Admin aktif.' });
          return;
        }
      }
      const result = db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
      if (result.changes === 0) {
        res.status(404).json({ error: 'User tidak ditemukan.' });
        return;
      }
      recordAuditLog({
        eventType: 'user_deleted',
        severity: 'warning',
        actorEmail: req.authUser!.email,
        targetEmail: target.email,
        detail: `Akun (${target.role}) beserta proyek & riwayat BCT dihapus permanen`,
        ipAddress: extractClientIp(req),
        origin: clipStr(req.headers.origin || req.headers.host, 200),
      });
      res.json({ ok: true });
    }
  );

  // Admin Self-Security: Change own password seamlessly (re-issues fresh cookie + Bearer token)
  app.post(
    '/api/admin/security/change-password',
    requireAdmin,
    (req: AuthedRequest, res: Response) => {
      const currentPassword =
        typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
      const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
      const admin = req.authUser!;

      if (!verifyPassword(currentPassword, admin.password_hash)) {
        res.status(401).json({ error: 'Password saat ini tidak sesuai.' });
        return;
      }
      if (newPassword.length < 6) {
        res.status(400).json({ error: 'Password baru minimal 6 karakter.' });
        return;
      }

      db.prepare(
        `UPDATE users
         SET password_hash = ?,
             failed_login_count = 0,
             locked_until = NULL,
             token_version = token_version + 1
         WHERE id = ?`
      ).run(hashPassword(newPassword), admin.id);

      const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(admin.id) as unknown as UserRow;
      const token = signSessionToken(updated.id, Number(updated.token_version || 1));
      setSessionCookie(req, res, token);

      recordAuditLog({
        eventType: 'password_changed',
        severity: 'warning',
        actorEmail: updated.email,
        targetEmail: updated.email,
        detail: 'Admin mengubah password sendiri & memperbarui sesi saat ini',
        ipAddress: extractClientIp(req),
        origin: clipStr(req.headers.origin || req.headers.host, 200),
      });

      res.json({ ok: true, token });
    }
  );

  // Admin Self-Security: Generate / rotate Recovery Key (returned plaintext ONCE)
  app.post(
    '/api/admin/security/rotate-recovery-key',
    requireAdmin,
    (req: AuthedRequest, res: Response) => {
      const recoveryKey = generateHumanRecoveryKey();
      const now = new Date().toISOString();
      setSystemMeta('admin_recovery_key_hash', hashPassword(recoveryKey));
      setSystemMeta('admin_recovery_key_rotated_at', now);

      recordAuditLog({
        eventType: 'recovery_key_rotated',
        severity: 'warning',
        actorEmail: req.authUser!.email,
        targetEmail: req.authUser!.email,
        detail: 'Admin Recovery Key baru dibuat & hash disimpan di SQLite',
        ipAddress: extractClientIp(req),
        origin: clipStr(req.headers.origin || req.headers.host, 200),
      });

      res.json({ recoveryKey, rotatedAt: now });
    }
  );

  // Admin Self-Security: Read masked SMTP configuration
  app.get('/api/admin/security/smtp', requireAdmin, (_req: Request, res: Response) => {
    const resolved = resolveSmtpConfig();
    const consoleRaw = getConsoleSmtpRaw();
    if (resolved) {
      res.json({
        source: resolved.source,
        host: resolved.host,
        port: resolved.port,
        secure: resolved.secure,
        user: resolved.user,
        from: resolved.from,
        hasPassword: true,
      });
      return;
    }
    res.json({
      source: 'none',
      host: consoleRaw?.host || '',
      port: Number(consoleRaw?.port || 587),
      secure: Boolean(consoleRaw?.secure),
      user: consoleRaw?.user || '',
      from: consoleRaw?.from || '',
      hasPassword: Boolean(consoleRaw?.passEnc),
    });
  });

  // Admin Self-Security: Save or clear Console SMTP configuration (password encrypted at rest)
  app.post('/api/admin/security/smtp', requireAdmin, (req: AuthedRequest, res: Response) => {
    if (req.body?.clearConsoleOverride) {
      deleteSystemMeta('admin_smtp_config_json');
      recordAuditLog({
        eventType: 'smtp_updated',
        severity: 'warning',
        actorEmail: req.authUser!.email,
        targetEmail: req.authUser!.email,
        detail: 'Konfigurasi SMTP Konsol Admin dihapus (kembali ke ENV jika ada)',
        ipAddress: extractClientIp(req),
        origin: clipStr(req.headers.origin || req.headers.host, 200),
      });
      const resolved = resolveSmtpConfig();
      res.json({
        source: resolved ? resolved.source : 'none',
        host: resolved?.host || '',
        port: resolved?.port || 587,
        secure: resolved?.secure || false,
        user: resolved?.user || '',
        from: resolved?.from || '',
        hasPassword: Boolean(resolved),
      });
      return;
    }

    const host = clipStr(req.body?.host, 180);
    const port = Number(req.body?.port || 587);
    const secure = Boolean(req.body?.secure);
    const user = clipStr(req.body?.user, 160);
    const passInput = typeof req.body?.pass === 'string' ? req.body.pass.trim() : '';
    const from = clipStr(req.body?.from, 180) || user;

    if (!host || !user || !Number.isInteger(port) || port < 1 || port > 65535) {
      res.status(400).json({ error: 'Host SMTP, Port valid (1-65535), dan Username wajib diisi.' });
      return;
    }

    const existingConsole = getConsoleSmtpRaw();
    const passEnc = passInput
      ? encryptSecret(passInput)
      : existingConsole?.passEnc || '';
    if (!passEnc) {
      res.status(400).json({ error: 'Password / App Password SMTP wajib diisi.' });
      return;
    }

    setSystemMeta(
      'admin_smtp_config_json',
      JSON.stringify({ host, port, secure, user, passEnc, from })
    );

    recordAuditLog({
      eventType: 'smtp_updated',
      severity: 'warning',
      actorEmail: req.authUser!.email,
      targetEmail: user,
      detail: `Pengaturan Email OTP SMTP disimpan (${host}:${port}, ${secure ? 'TLS' : 'STARTTLS'})`,
      ipAddress: extractClientIp(req),
      origin: clipStr(req.headers.origin || req.headers.host, 200),
    });

    res.json({
      source: 'console',
      host,
      port,
      secure,
      user,
      from,
      hasPassword: true,
    });
  });

  // Admin Self-Security: Send a live SMTP verification email to the signed-in admin
  app.post(
    '/api/admin/security/smtp-test',
    requireAdmin,
    async (req: AuthedRequest, res: Response) => {
      const smtp = resolveSmtpConfig();
      if (!smtp) {
        res.status(400).json({ error: 'Simpan konfigurasi SMTP terlebih dahulu sebelum mengirim uji coba.' });
        return;
      }

      try {
        await sendSmtpEmail(smtp, {
          to: req.authUser!.email,
          subject: '[DieCut.Room] Uji Konfigurasi Email OTP SMTP Berhasil',
          text: [
            `Halo ${req.authUser!.name},`,
            '',
            'Konfigurasi Email OTP SMTP untuk DieCut.Room berhasil diverifikasi.',
            `Host: ${smtp.host}:${smtp.port} (${smtp.secure ? 'TLS' : 'STARTTLS'})`,
            `Sumber: ${smtp.source === 'console' ? 'Konsol Admin' : 'Environment Variable'}`,
            '',
            'Email ini menjadi jalur pemulihan darurat apabila suatu saat Anda lupa password maupun Recovery Key.',
          ].join('\n'),
        });

        recordAuditLog({
          eventType: 'smtp_tested',
          severity: 'info',
          actorEmail: req.authUser!.email,
          targetEmail: req.authUser!.email,
          detail: `Email uji SMTP berhasil terkirim via ${smtp.host}:${smtp.port}`,
          ipAddress: extractClientIp(req),
          origin: clipStr(req.headers.origin || req.headers.host, 200),
        });

        res.json({ ok: true, sentTo: req.authUser!.email });
      } catch (err) {
        recordAuditLog({
          eventType: 'smtp_tested',
          severity: 'critical',
          actorEmail: req.authUser!.email,
          targetEmail: req.authUser!.email,
          detail: `Uji SMTP gagal: ${err instanceof Error ? err.message : 'Unknown error'}`,
          ipAddress: extractClientIp(req),
          origin: clipStr(req.headers.origin || req.headers.host, 200),
        });
        res.status(502).json({
          error: `Gagal mengirim email uji: ${
            err instanceof Error ? err.message : 'Koneksi SMTP ditolak'
          }`,
        });
      }
    }
  );

  // Admin Agent API Key Management (Hermes / External MCP & REST Clients)
  app.get('/api/admin/security/agent-key', requireAdmin, (_req: Request, res: Response) => {
    res.json(getAgentKeyStatus());
  });

  app.post('/api/admin/security/agent-key', requireAdmin, (_req: Request, res: Response) => {
    const rawKey = `dcr_ag_${crypto.randomBytes(20).toString('hex')}`;
    const prefix = `${rawKey.slice(0, 13)}...${rawKey.slice(-4)}`;
    const now = new Date().toISOString();
    setSystemMeta('agent_api_key_hash', hashAgentKey(rawKey));
    setSystemMeta('agent_api_key_prefix', prefix);
    setSystemMeta('agent_api_key_updated_at', now);
    res.json({
      apiKey: rawKey,
      configured: true,
      prefix,
      updatedAt: now,
      skillVersion: AGENT_SKILL_VERSION,
    });
  });

  app.delete('/api/admin/security/agent-key', requireAdmin, (_req: Request, res: Response) => {
    deleteSystemMeta('agent_api_key_hash');
    deleteSystemMeta('agent_api_key_prefix');
    deleteSystemMeta('agent_api_key_updated_at');
    res.json({
      configured: false,
      prefix: null,
      updatedAt: null,
      skillVersion: AGENT_SKILL_VERSION,
    });
  });

  // External Agent REST Handshake, Skill Delivery (Once), Manual Template & Calculation
  // Note: Per privacy preference, external agent calculations are NOT written to Admin audit_logs.
  app.get('/api/agent/skill', requireAgentKey, (req: Request, res: Response) => {
    const baseUrl = getBaseUrlFromReq(req);
    const skillMarkdown = buildHermesSkillMarkdown(baseUrl);
    if (req.query.format === 'raw' || String(req.headers.accept || '').includes('text/markdown')) {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.send(skillMarkdown);
      return;
    }
    res.json({
      skillVersion: AGENT_SKILL_VERSION,
      skillName: 'diecut-room-bct',
      skillMarkdown,
    });
  });

  app.all('/api/agent/connect', requireAgentKey, (req: Request, res: Response) => {
    const clientSkillVersion = String(
      req.headers['x-skill-version'] ||
        req.body?.skillVersion ||
        req.body?.skill_version ||
        req.query?.skillVersion ||
        req.query?.skill_version ||
        ''
    ).trim();

    if (clientSkillVersion !== AGENT_SKILL_VERSION) {
      const baseUrl = getBaseUrlFromReq(req);
      res.json({
        status: 'skill_required',
        skillDelivered: true,
        skillVersion: AGENT_SKILL_VERSION,
        skillMarkdown: buildHermesSkillMarkdown(baseUrl),
        message:
          `Skill dikirim untuk kontak pertama (atau versi berubah). Simpan skill ini lalu hubungi kembali dengan header X-Skill-Version: ${AGENT_SKILL_VERSION} untuk menerima template form.`,
      });
      return;
    }

    res.json({
      status: 'ready_for_input',
      skillDelivered: false,
      skillVersion: AGENT_SKILL_VERSION,
      templateFormText: buildAgentFormTemplateText(),
      defaults: {
        printCoveragePct: 60,
        safetyFactor: '6:1',
        inkColorsCount: 1,
        boxStyle: '0201',
        dielineMode: 'clean-cad',
      },
      submitEndpoint: '/api/agent/calculate',
      dielineEndpoint: '/api/agent/dieline',
      message:
        'Skill valid dan aktif. Kirimkan templateFormText ini apa adanya ke pengguna untuk diisi manual, lalu kirim hasilnya ke /api/agent/calculate atau /api/agent/dieline.',
    });
  });

  app.post('/api/agent/calculate', requireAgentKey, (req: Request, res: Response) => {
    const result = runAgentEngineeringCalc((req.body || {}) as Record<string, unknown>);
    if (!result.ok) {
      res.status(result.status).json(result);
      return;
    }
    res.json(result);
  });

  app.post('/api/agent/dieline', requireAgentKey, (req: Request, res: Response) => {
    const baseUrl = getBaseUrlFromReq(req);
    const body = (req.body || {}) as Record<string, unknown>;
    const result = runAgentDielineGenerator(body, baseUrl);
    if (!result.ok) {
      res.status(result.status).json(result);
      return;
    }

    const wantsRawSvg =
      body.format === 'svg' ||
      req.query.format === 'svg' ||
      String(req.headers.accept || '').includes('image/svg+xml');

    if (wantsRawSvg && result.svgContent) {
      res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.send(result.svgContent);
      return;
    }

    res.json(result);
  });

  app.get('/api/agent/dieline/download', (req: Request, res: Response) => {
    const token = String(req.query.token || '').trim();
    const payload = verifyAgentDielineToken(token);
    if (!payload) {
      res.status(401).json({
        error: 'Link unduh Dieline SVG tidak valid atau sudah kedaluwarsa (berlaku 24 jam).',
      });
      return;
    }
    const built = buildServerDielineSvg(payload);
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${built.filename}"`);
    res.send(built.svgContent);
  });

  // Streamable HTTP MCP Endpoint for Nous Research Hermes Agent (~/.hermes/config.yaml)
  app.get('/api/mcp', (_req: Request, res: Response) => {
    res.setHeader('Allow', 'POST');
    res.status(405).json({
      error: 'Use POST JSON-RPC 2.0 on /api/mcp (Streamable HTTP transport).',
    });
  });

  app.post('/api/mcp', requireAgentKey, (req: Request, res: Response) => {
    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
      res.status(400).json({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32600, message: 'Invalid JSON-RPC request' },
      });
      return;
    }

    const id = payload.id !== undefined ? payload.id : null;
    const method = String(payload.method || '');
    const params = (payload.params || {}) as Record<string, unknown>;

    if (method === 'notifications/initialized' || method.startsWith('notifications/')) {
      res.status(202).end();
      return;
    }

    if (method === 'initialize') {
      res.json({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: {
            name: 'diecut-room-mcp',
            version: AGENT_SKILL_VERSION,
          },
        },
      });
      return;
    }

    if (method === 'ping') {
      res.json({ jsonrpc: '2.0', id, result: {} });
      return;
    }

    if (method === 'tools/list') {
      res.json({
        jsonrpc: '2.0',
        id,
        result: {
          tools: [
            {
              name: 'diecut_connect',
              description:
                `Handshake dengan DieCut.Room. Kirim skill_version yang sedang aktif ("${AGENT_SKILL_VERSION}" jika sudah punya). Jika belum punya atau versi lama, server mengirim SKILL.md sekali; jika sudah aktif, server langsung mengembalikan template form manual untuk diisi user di Telegram/WhatsApp/CLI.`,
              inputSchema: {
                type: 'object',
                properties: {
                  skill_version: {
                    type: 'string',
                    description: `Versi skill yang saat ini aktif di agen (contoh: "${AGENT_SKILL_VERSION}"). Kosongkan jika kontak pertama.`,
                  },
                },
              },
            },
            {
              name: 'diecut_get_template',
              description:
                'Ambil template form manual siap salin-isi untuk dikirim ke pengguna di chat (ID P/L/T, Flute, Material, Print Coverage default 60%, Ink Colors, Safety Factor default 6:1).',
              inputSchema: {
                type: 'object',
                properties: {},
              },
            },
            {
              name: 'diecut_calculate',
              description:
                'Hitung BCT Corrected, ECT, dan Engineering Summary dari isian form manual pengguna (bisa kirim form_text mentah dari chat atau field terstruktur).',
              inputSchema: {
                type: 'object',
                properties: {
                  form_text: {
                    type: 'string',
                    description: 'Teks form yang sudah diisi oleh pengguna di chat Telegram/WhatsApp/CLI.',
                  },
                  id_length_mm: { type: 'number', description: 'Direct ID Panjang (mm)' },
                  id_width_mm: { type: 'number', description: 'Direct ID Lebar (mm)' },
                  id_depth_mm: { type: 'number', description: 'Direct ID Tinggi (mm)' },
                  flute_type: { type: 'string', description: 'Tipe flute (F, E, B, C, A, EB, BC, AB, AA)' },
                  material: { type: 'string', description: 'Substance kertas (contoh K150/M125/K150)' },
                  print_coverage_pct: { type: 'number', description: 'Print coverage % (default 60)' },
                  ink_colors_count: { type: 'number', description: 'Jumlah ink colors (0-10)' },
                  safety_factor: { type: 'number', description: 'Safety factor (default 6 untuk 6:1)' },
                  box_style: { type: 'string', description: 'FEFCO style (0201, 0200, 0202, 0203, 0204)' },
                },
              },
            },
            {
              name: 'diecut_generate_dieline',
              description:
                'Generate file Dieline 2D SVG presisi 1:1 mm (mode "clean-cad" hanya Cut/Crease untuk mesin plotter & Illustrator, atau "spec-sheet" dengan dimensi 12 pt, arah flute, dan title block). Mengembalikan ringkasan ukuran blank, downloadUrl 24 jam untuk chat, serta svgContent.',
              inputSchema: {
                type: 'object',
                properties: {
                  form_text: {
                    type: 'string',
                    description: 'Opsional: teks form yang sudah diisi pengguna untuk mengekstrak dimensi & flute.',
                  },
                  id_length_mm: { type: 'number', description: 'Direct ID Panjang (mm >= 20)' },
                  id_width_mm: { type: 'number', description: 'Direct ID Lebar (mm >= 20)' },
                  id_depth_mm: { type: 'number', description: 'Direct ID Tinggi (mm >= 20)' },
                  flute_type: { type: 'string', description: 'Tipe flute (F, E, B, C, A, EB, BC, AB, AA)' },
                  box_style: { type: 'string', description: 'FEFCO style (0201, 0200, 0202, 0203, 0204)' },
                  mode: {
                    type: 'string',
                    enum: ['clean-cad', 'spec-sheet'],
                    description: 'clean-cad (default, vektor Cut/Crease murni) atau spec-sheet (dengan dimensi & title block).',
                  },
                  glue_flap_width_mm: { type: 'number', description: 'Lebar glue flap mm (default 35)' },
                  glue_flap_position: { type: 'string', enum: ['left', 'right'], description: 'Posisi glue flap (default left)' },
                  flute_direction: { type: 'string', enum: ['vertical', 'horizontal'], description: 'Arah flute (default vertical)' },
                  compensate_inner_flap_depth: { type: 'boolean', description: 'Inner-flap depth allowance 2T/T (default true)' },
                  include_svg_content: { type: 'boolean', description: 'Sertakan XML SVG lengkap di structuredContent (default true)' },
                },
              },
            },
          ],
        },
      });
      return;
    }

    if (method === 'tools/call') {
      const toolName = String(params.name || '');
      const args = ((params.arguments || {}) as Record<string, unknown>);

      if (toolName === 'diecut_connect') {
        const ver = String(args.skill_version || req.headers['x-skill-version'] || '').trim();
        if (ver !== AGENT_SKILL_VERSION) {
          const skillMd = buildHermesSkillMarkdown(getBaseUrlFromReq(req));
          const structured = {
            status: 'skill_required',
            skillDelivered: true,
            skillVersion: AGENT_SKILL_VERSION,
            skillMarkdown: skillMd,
          };
          res.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: skillMd }],
              structuredContent: structured,
            },
          });
          return;
        }
        const tmpl = buildAgentFormTemplateText();
        res.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: tmpl }],
            structuredContent: {
              status: 'ready_for_input',
              skillDelivered: false,
              skillVersion: AGENT_SKILL_VERSION,
              templateFormText: tmpl,
            },
          },
        });
        return;
      }

      if (toolName === 'diecut_get_template') {
        const tmpl = buildAgentFormTemplateText();
        res.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: tmpl }],
            structuredContent: {
              skillVersion: AGENT_SKILL_VERSION,
              templateFormText: tmpl,
            },
          },
        });
        return;
      }

      if (toolName === 'diecut_calculate') {
        const calc = runAgentEngineeringCalc(args);
        if (!calc.ok) {
          res.json({
            jsonrpc: '2.0',
            id,
            result: {
              isError: true,
              content: [
                {
                  type: 'text',
                  text: calc.templateFormText
                    ? `${calc.error}\n\n${calc.templateFormText}`
                    : calc.error,
                },
              ],
              structuredContent: calc,
            },
          });
          return;
        }
        res.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: calc.formattedReply }],
            structuredContent: calc,
          },
        });
        return;
      }

      if (toolName === 'diecut_generate_dieline') {
        const dielineRes = runAgentDielineGenerator(args, getBaseUrlFromReq(req));
        if (!dielineRes.ok) {
          res.json({
            jsonrpc: '2.0',
            id,
            result: {
              isError: true,
              content: [
                {
                  type: 'text',
                  text: dielineRes.templateFormText
                    ? `${dielineRes.error}\n\n${dielineRes.templateFormText}`
                    : dielineRes.error,
                },
              ],
              structuredContent: dielineRes,
            },
          });
          return;
        }
        res.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: dielineRes.formattedReply }],
            structuredContent: dielineRes,
          },
        });
        return;
      }

      res.json({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Unknown MCP tool: ${toolName}` },
      });
      return;
    }

    res.json({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Unsupported MCP method: ${method}` },
    });
  });

  // Admin Proactive Health Radar & Predictive Alerts
  app.get('/api/admin/health-radar', requireAdmin, (req: Request, res: Response) => {
    const mem = process.memoryUsage();
    const rssMb = Math.round((mem.rss / (1024 * 1024)) * 10) / 10;
    const heapUsedMb = Math.round((mem.heapUsed / (1024 * 1024)) * 10) / 10;
    const memLimitMb = Number(process.env.MEMORY_LIMIT_MB || 256);
    const rssPctOfLimit = Math.round((rssMb / memLimitMb) * 100);

    const dbSizeBytes = fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).size : 0;
    const walPath = `${DB_PATH}-wal`;
    const walSizeBytes = fs.existsSync(walPath) ? fs.statSync(walPath).size : 0;

    let diskFreeBytes: number | null = null;
    let diskTotalBytes: number | null = null;
    try {
      const stat = fs.statfsSync(path.dirname(DB_PATH));
      diskFreeBytes = Number(stat.bavail) * Number(stat.bsize);
      diskTotalBytes = Number(stat.blocks) * Number(stat.bsize);
    } catch {
      // ignore if unsupported
    }

    const https = isHttpsRequest(req);
    const trustProxy = process.env.TRUST_PROXY !== 'false';
    const cookieMode = https ? 'SameSite=None; Secure; Partitioned' : 'SameSite=Lax (HTTP local)';
    const envSessionSecret = (process.env.SESSION_SECRET || '').trim();
    const hasStrongSessionSecret =
      (envSessionSecret.length >= 16 && !isEnvPlaceholder(envSessionSecret)) ||
      fs.existsSync(path.join(path.dirname(DB_PATH), '.session_secret'));
    const recoveryMeta = getSystemMeta('admin_recovery_key_hash');
    const recoveryRotatedMeta = getSystemMeta('admin_recovery_key_rotated_at');
    const lastBackupMeta = getSystemMeta('last_backup_at');
    const envRecoveryRaw = (process.env.ADMIN_RECOVERY_KEY || '').trim();
    const hasEnvRecoveryKey = envRecoveryRaw.length >= 8 && !isEnvPlaceholder(envRecoveryRaw);
    const hasDbRecoveryKey = Boolean(recoveryMeta?.value);
    const resolvedSmtp = resolveSmtpConfig();
    const smtpConfigured = Boolean(resolvedSmtp);
    const smtpSource: 'console' | 'env' | 'none' = resolvedSmtp ? resolvedSmtp.source : 'none';
    const distBuilt = fs.existsSync(path.join(process.cwd(), 'dist', 'index.html'));
    const swBuilt = fs.existsSync(path.join(process.cwd(), 'dist', 'sw.js'));

    const userStats = db
      .prepare(
        `SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
          SUM(CASE WHEN role = 'admin' AND status = 'active' THEN 1 ELSE 0 END) AS active_admins,
          SUM(CASE WHEN status = 'disabled' THEN 1 ELSE 0 END) AS disabled,
          SUM(CASE WHEN locked_until IS NOT NULL AND locked_until > ? THEN 1 ELSE 0 END) AS locked,
          SUM(CASE WHEN status = 'pending' AND created_at < ? THEN 1 ELSE 0 END) AS stale_pending
         FROM users`
      )
      .get(
        new Date().toISOString(),
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      ) as Record<string, number>;

    const projectStats = db.prepare('SELECT COUNT(*) AS cnt FROM saved_projects').get() as {
      cnt: number;
    };
    const historyStats = db.prepare('SELECT COUNT(*) AS cnt FROM bct_history').get() as {
      cnt: number;
    };
    const failedStats = db
      .prepare(
        "SELECT COUNT(*) AS cnt FROM audit_logs WHERE event_type IN ('login_failed', 'login_locked') AND created_at > ?"
      )
      .get(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) as { cnt: number };

    const pendingUsers = Number(userStats.pending || 0);
    const stalePendingUsers = Number(userStats.stale_pending || 0);
    const activeAdmins = Number(userStats.active_admins || 0);
    const lockedUsers = Number(userStats.locked || 0);
    const failedLogins24h = Number(failedStats.cnt || 0);

    const alerts: Array<{
      id: string;
      severity: 'critical' | 'warning' | 'info' | 'ok';
      title: string;
      detail: string;
      actionTab?: 'users' | 'audit' | 'security';
      actionFilter?: 'pending' | 'all';
    }> = [];

    if (!hasDbRecoveryKey && !hasEnvRecoveryKey) {
      alerts.push({
        id: 'missing-recovery-key',
        severity: 'critical',
        title: 'Admin Recovery Key belum dibuat',
        detail:
          'Jika Anda lupa password Admin dan tidak memiliki akses SSH CLI, akun Admin tidak bisa dipulihkan via kunci. Buat dan simpan Recovery Key sekarang.',
        actionTab: 'security',
      });
    }

    if (activeAdmins < 2) {
      alerts.push({
        id: 'single-admin',
        severity: 'warning',
        title: 'Hanya ada 1 akun Admin aktif',
        detail:
          'Tambahkan minimal 1 Admin Cadangan (Co-Admin) di tab Keamanan agar akun kedua dapat mereset password Anda langsung lewat browser jika terkunci.',
        actionTab: 'security',
      });
    }

    if (!smtpConfigured) {
      alerts.push({
        id: 'smtp-not-configured',
        severity: 'info',
        title: 'Email OTP pemulihan belum aktif (SMTP opsional)',
        detail:
          'Aktifkan konfigurasi SMTP di tab Keamanan agar Admin dapat menerima kode OTP 6 digit lewat email saat lupa password sekaligus Recovery Key.',
        actionTab: 'security',
      });
    }

    if (lockedUsers > 0 || failedLogins24h >= 5) {
      alerts.push({
        id: 'auth-failures',
        severity: lockedUsers > 0 ? 'critical' : 'warning',
        title:
          lockedUsers > 0
            ? `${lockedUsers} akun sedang terkunci sementara`
            : `${failedLogins24h} percobaan login gagal dalam 24 jam`,
        detail:
          'Pantau Log Audit untuk mendeteksi percobaan brute-force atau pengguna yang kesulitan masuk.',
        actionTab: 'audit',
      });
    }

    if (pendingUsers > 0) {
      alerts.push({
        id: 'pending-users',
        severity: stalePendingUsers > 0 ? 'warning' : 'info',
        title:
          stalePendingUsers > 0
            ? `${pendingUsers} akun menunggu aktivasi (${stalePendingUsers} > 24 jam)`
            : `${pendingUsers} akun baru menunggu persetujuan Admin`,
        detail: 'Tinjau pendaftar terbaru agar pengguna tidak tertahan di halaman Pending.',
        actionTab: 'users',
        actionFilter: 'pending',
      });
    }

    const backupStale =
      !lastBackupMeta?.value ||
      Date.now() - new Date(lastBackupMeta.value).getTime() > 7 * 24 * 60 * 60 * 1000;
    if (backupStale) {
      alerts.push({
        id: 'backup-recommended',
        severity: 'warning',
        title: lastBackupMeta?.value ? 'Backup SQLite berusia > 7 hari' : 'Belum pernah membuat backup dari Konsol',
        detail:
          'Unduh snapshot SQLite secara berkala sebelum update container atau migrasi VPS.',
        actionTab: 'security',
      });
    }

    if (rssPctOfLimit >= 80) {
      alerts.push({
        id: 'memory-pressure',
        severity: 'critical',
        title: `Pemakaian RAM tinggi (${rssMb} MB / ${memLimitMb} MB)`,
        detail:
          'Mendekati batas memory container VPS. Pertimbangkan restart terjadwal jika terus naik.',
      });
    }

    if (diskFreeBytes !== null && diskFreeBytes < 500 * 1024 * 1024) {
      alerts.push({
        id: 'low-disk',
        severity: 'critical',
        title: 'Sisa ruang disk sangat tipis (< 500 MB)',
        detail:
          'SQLite WAL dan backup membutuhkan ruang kosong. Bersihkan cache build atau file lama di VPS.',
      });
    }

    if (!https && IS_PROD) {
      alerts.push({
        id: 'http-in-prod',
        severity: 'warning',
        title: 'Traffic terdeteksi HTTP non-TLS di mode produksi',
        detail:
          'Pastikan Nginx meneruskan X-Forwarded-Proto: https agar cookie SameSite=None; Secure aktif.',
      });
    }

    if (alerts.length === 0) {
      alerts.push({
        id: 'all-healthy',
        severity: 'ok',
        title: 'Semua sistem nominal — tidak ada risiko mendesak',
        detail:
          'Recovery Key, Admin Cadangan, Email OTP, memori server, dan backup terkini dalam kondisi optimal.',
      });
    }

    res.json({
      generatedAt: new Date().toISOString(),
      runtime: {
        nodeVersion: process.version,
        platform: process.platform,
        uptimeSec: Math.round(process.uptime()),
        rssMb,
        heapUsedMb,
        memLimitMb,
        rssPctOfLimit,
        dbSizeBytes,
        walSizeBytes,
        diskFreeBytes,
        diskTotalBytes,
      },
      environment: {
        nodeEnv: IS_PROD ? 'production' : 'development',
        isHttps: https,
        trustProxy,
        cookieMode,
        hasStrongSessionSecret,
        hasEnvRecoveryKey,
        hasDbRecoveryKey,
        recoveryKeyRotatedAt: recoveryRotatedMeta?.value || null,
        smtpConfigured,
        smtpSource,
        lastBackupAt: lastBackupMeta?.value || null,
        distBuilt,
        swBuilt,
      },
      metrics: {
        totalUsers: Number(userStats.total || 0),
        pendingUsers,
        stalePendingUsers,
        activeUsers: Number(userStats.active || 0),
        activeAdmins,
        disabledUsers: Number(userStats.disabled || 0),
        lockedUsers,
        failedLogins24h,
        totalProjects: Number(projectStats.cnt || 0),
        totalHistory: Number(historyStats.cnt || 0),
      },
      alerts,
    });
  });

  // Admin Audit Trail Log Viewer
  app.get('/api/admin/audit-logs', requireAdmin, (req: Request, res: Response) => {
    const category = String(req.query.category || 'all');
    let where = '';
    if (category === 'auth') {
      where = "WHERE event_type IN ('login_success', 'register_pending')";
    } else if (category === 'failed') {
      where = "WHERE event_type IN ('login_failed', 'login_locked')";
    } else if (category === 'account') {
      where =
        "WHERE event_type IN ('user_created', 'user_updated', 'status_changed', 'role_changed', 'user_deleted', 'session_revoked')";
    } else if (category === 'security') {
      where =
        "WHERE event_type IN ('admin_recover', 'otp_requested', 'smtp_updated', 'smtp_tested', 'password_changed', 'recovery_key_rotated', 'backup_exported', 'login_locked')";
    }

    const rows = db
      .prepare(
        `SELECT id, event_type, severity, actor_email, target_email, detail, ip_address, origin, created_at
         FROM audit_logs
         ${where}
         ORDER BY created_at DESC
         LIMIT 150`
      )
      .all() as Array<{
      id: string;
      event_type: string;
      severity: 'info' | 'warning' | 'critical';
      actor_email: string;
      target_email: string;
      detail: string;
      ip_address: string;
      origin: string;
      created_at: string;
    }>;

    res.json({
      logs: rows.map((r) => ({
        id: r.id,
        eventType: r.event_type,
        severity: r.severity,
        actorEmail: r.actor_email,
        targetEmail: r.target_email,
        detail: r.detail,
        ipAddress: r.ip_address,
        origin: r.origin,
        createdAt: r.created_at,
      })),
    });
  });

  // Admin Consistent SQLite Snapshot Download (WAL-safe via VACUUM INTO)
  app.get('/api/admin/backup/sqlite', requireAdmin, (req: AuthedRequest, res: Response) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const tmpFile = path.join(path.dirname(DB_PATH), `.backup-${stamp}-${crypto.randomUUID().slice(0, 6)}.db`);

    try {
      const escaped = tmpFile.replace(/'/g, "''");
      db.exec(`VACUUM INTO '${escaped}';`);
      const buf = fs.readFileSync(tmpFile);
      setSystemMeta('last_backup_at', new Date().toISOString());
      recordAuditLog({
        eventType: 'backup_exported',
        severity: 'info',
        actorEmail: req.authUser!.email,
        targetEmail: 'sqlite',
        detail: `Snapshot SQLite diunduh (${(buf.length / 1024).toFixed(1)} KB)`,
        ipAddress: extractClientIp(req),
        origin: clipStr(req.headers.origin || req.headers.host, 200),
      });

      res.setHeader('Content-Type', 'application/vnd.sqlite3');
      res.setHeader('Content-Disposition', `attachment; filename="diecut-backup-${stamp}.db"`);
      res.send(buf);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Gagal membuat snapshot SQLite.',
      });
    } finally {
      try {
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      } catch {
        // ignore temp cleanup failure
      }
    }
  });

  // Admin Portable Sanitized JSON Export
  app.get('/api/admin/backup/json', requireAdmin, (req: AuthedRequest, res: Response) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const users = (db.prepare('SELECT * FROM users ORDER BY created_at DESC').all() as unknown as UserRow[]).map(
      sanitizeUser
    );
    const projects = db.prepare('SELECT id, user_id, name, box_style, dims_summary, config_json, updated_at FROM saved_projects').all();
    const history = db.prepare('SELECT id, user_id, label, payload_json, created_at FROM bct_history').all();

    setSystemMeta('last_backup_at', new Date().toISOString());
    recordAuditLog({
      eventType: 'backup_exported',
      severity: 'info',
      actorEmail: req.authUser!.email,
      targetEmail: 'json',
      detail: `Ekspor JSON diunduh (${users.length} akun, ${projects.length} proyek)`,
      ipAddress: extractClientIp(req),
      origin: clipStr(req.headers.origin || req.headers.host, 200),
    });

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="diecut-export-${stamp}.json"`);
    res.send(
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          users,
          projects,
          history,
        },
        null,
        2
      )
    );
  });

  // Authenticated User: Per-account BCT History sync
  app.get('/api/history', requireActiveUser, (req: AuthedRequest, res: Response) => {
    const rows = db
      .prepare(
        'SELECT payload_json FROM bct_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 100'
      )
      .all(req.authUser!.id) as Array<{ payload_json: string }>;

    const entries = rows
      .map((r) => {
        try {
          return JSON.parse(r.payload_json);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    res.json({ entries });
  });

  app.post('/api/history', requireActiveUser, (req: AuthedRequest, res: Response) => {
    const entry = req.body?.entry;
    if (!entry || typeof entry.id !== 'string' || typeof entry.label !== 'string') {
      res.status(400).json({ error: 'Payload riwayat BCT tidak valid.' });
      return;
    }
    const createdAt =
      typeof entry.createdAt === 'string' ? entry.createdAt : new Date().toISOString();

    db.prepare(
      `INSERT INTO bct_history (id, user_id, label, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET label = excluded.label, payload_json = excluded.payload_json`
    ).run(entry.id, req.authUser!.id, entry.label.slice(0, 140), JSON.stringify(entry), createdAt);

    res.status(201).json({ ok: true, entry });
  });

  app.delete('/api/history/:id', requireActiveUser, (req: AuthedRequest, res: Response) => {
    db.prepare('DELETE FROM bct_history WHERE id = ? AND user_id = ?').run(
      req.params.id,
      req.authUser!.id
    );
    res.json({ ok: true });
  });

  // Authenticated User: Saved Dieline Box Projects CRUD
  app.get('/api/projects', requireActiveUser, (req: AuthedRequest, res: Response) => {
    const rows = db
      .prepare(
        'SELECT id, name, box_style, dims_summary, config_json, updated_at FROM saved_projects WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100'
      )
      .all(req.authUser!.id) as Array<{
      id: string;
      name: string;
      box_style: string;
      dims_summary: string;
      config_json: string;
      updated_at: string;
    }>;

    const projects = rows
      .map((r) => {
        try {
          return {
            id: r.id,
            name: r.name,
            boxStyle: r.box_style,
            dimsSummary: r.dims_summary,
            config: JSON.parse(r.config_json),
            updatedAt: r.updated_at,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    res.json({ projects });
  });

  app.post('/api/projects', requireActiveUser, (req: AuthedRequest, res: Response) => {
    const id = typeof req.body?.id === 'string' && req.body.id ? req.body.id : crypto.randomUUID();
    const name = clipStr(req.body?.name, 100);
    const config = req.body?.config;
    if (!name || !config || !config.dimensions || !config.boxStyle) {
      res.status(400).json({ error: 'Nama proyek dan konfigurasi box wajib diisi.' });
      return;
    }

    const dimsSummary = `${Math.round(config.dimensions.length)}x${Math.round(
      config.dimensions.width
    )}x${Math.round(config.dimensions.depth)} mm`;
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO saved_projects (id, user_id, name, box_style, dims_summary, config_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, box_style = excluded.box_style, dims_summary = excluded.dims_summary, config_json = excluded.config_json, updated_at = excluded.updated_at`
    ).run(id, req.authUser!.id, name, String(config.boxStyle), dimsSummary, JSON.stringify(config), now);

    res.status(201).json({
      project: {
        id,
        name,
        boxStyle: String(config.boxStyle),
        dimsSummary,
        config,
        updatedAt: now,
      },
    });
  });

  app.delete('/api/projects/:id', requireActiveUser, (req: AuthedRequest, res: Response) => {
    db.prepare('DELETE FROM saved_projects WHERE id = ? AND user_id = ?').run(
      req.params.id,
      req.authUser!.id
    );
    res.json({ ok: true });
  });

  // Frontend Delivery: Vite middleware in development, built static assets in production
  if (!IS_PROD) {
    // Evict any stale Service Workers (dev-sw.js or sw.js) left behind in user browsers
    const swKillScript =
      "self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',(e)=>{e.waitUntil(caches.keys().then((ks)=>Promise.all(ks.map((k)=>caches.delete(k)))).then(()=>self.registration.unregister()));});";
    app.get(['/dev-sw.js', '/sw.js'], (_req: Request, res: Response) => {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(swKillScript);
    });
    app.get('/registerSW.js', (_req: Request, res: Response) => {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(
        "if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then((rs)=>rs.forEach((r)=>r.unregister())).catch(()=>{});}"
      );
    });

    const disableHmr = process.env.DISABLE_HMR === 'true' || Boolean(process.env.NGINX_PORT);
    const vitePromise = import('vite').then(({ createServer: createViteServer }) =>
      createViteServer({
        server: {
          middlewareMode: true,
          hmr: disableHmr ? false : { server: httpServer },
          ws: disableHmr ? false : undefined,
        },
        appType: 'spa',
      })
    );

    vitePromise.catch((err) => {
      console.error('Failed to initialize Vite dev middleware:', err);
    });

    app.use(async (req: Request, res: Response, next: NextFunction) => {
      try {
        const vite = await vitePromise;
        vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  } else {
    const distDir = path.join(process.cwd(), 'dist');
    app.use(
      express.static(distDir, {
        setHeaders(res, filePath) {
          if (
            filePath.endsWith('index.html') ||
            filePath.endsWith('sw.js') ||
            filePath.endsWith('registerSW.js') ||
            filePath.endsWith('manifest.webmanifest')
          ) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      })
    );
    app.get('*', (req: Request, res: Response) => {
      // Never serve HTML for missing hashed JS/CSS/font assets (prevents MIME-type white screen)
      if (
        req.path.startsWith('/assets/') ||
        req.path.startsWith('/fonts/') ||
        /\.(js|mjs|css|map|woff2?|svg|png|ico|webmanifest)$/i.test(req.path)
      ) {
        res.status(404).end();
        return;
      }
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`DieCut.Room server listening on http://0.0.0.0:${PORT} (${IS_PROD ? 'production' : 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start DieCut.Room server:', err);
  process.exit(1);
});
