import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
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

function resolveSessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) {
    return process.env.SESSION_SECRET;
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
`);

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

function signSessionToken(userId: string): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SEC;
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifySessionToken(token: string): string | null {
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
      exp?: number;
    };
    if (!parsed.uid || !parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed.uid;
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
  return req.secure || proto.includes('https');
}

function setSessionCookie(req: Request, res: Response, token: string) {
  const https = isHttpsRequest(req);
  const attrs = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${SESSION_MAX_AGE_SEC}`,
    https ? 'SameSite=None; Secure' : 'SameSite=Lax',
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
    https ? 'SameSite=None; Secure' : 'SameSite=Lax',
  ];
  res.setHeader('Set-Cookie', attrs.join('; '));
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

function requireActiveUser(req: AuthedRequest, res: Response, next: NextFunction) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const uid = verifySessionToken(token);
  if (!uid) {
    clearSessionCookie(req, res);
    res.status(401).json({ error: 'Session expired' });
    return;
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ? LIMIT 1').get(uid) as unknown as
    | UserRow
    | undefined;
  if (!user) {
    clearSessionCookie(req, res);
    res.status(401).json({ error: 'Account not found' });
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

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  if (process.env.TRUST_PROXY !== 'false') {
    app.set('trust proxy', 1);
  }

  app.use(express.json({ limit: '2mb' }));

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
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[COOKIE_NAME];
    if (!token) {
      res.status(401).json({ user: null });
      return;
    }
    const uid = verifySessionToken(token);
    if (!uid) {
      clearSessionCookie(req, res);
      res.status(401).json({ user: null });
      return;
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ? LIMIT 1').get(uid) as unknown as
      | UserRow
      | undefined;
    if (!user) {
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
    res.status(201).json({
      status: 'pending',
      message:
        'Pendaftaran berhasil dicatat. Silakan konfirmasi ke Admin via WhatsApp untuk aktivasi akun.',
      user: sanitizeUser(created),
    });
  });

  // Login (blocks pending and disabled accounts with structured code)
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const email = clipStr(req.body?.email, 120).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const clientMeta = req.body?.clientMeta || {};

    if (!email || !password) {
      res.status(400).json({ error: 'Email dan password wajib diisi.' });
      return;
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ? LIMIT 1').get(email) as unknown as
      | UserRow
      | undefined;
    if (!user || !verifyPassword(password, user.password_hash)) {
      res.status(401).json({ error: 'Email atau password salah.' });
      return;
    }

    const accessOrigin =
      clipStr(clientMeta.origin, 200) || user.access_origin || clipStr(req.headers.host, 120);
    const accessPath = clipStr(clientMeta.path, 200) || user.access_path;
    const accessReferrer = clipStr(clientMeta.referrer, 240) || user.access_referrer;
    const deviceSummary = clipStr(clientMeta.deviceSummary, 200) || user.device_summary;
    const timezone = clipStr(clientMeta.timezone, 64) || user.timezone;
    const lastIp = extractClientIp(req);

    if (user.status === 'pending') {
      db.prepare(
        `UPDATE users SET access_origin = ?, access_path = ?, device_summary = ?, timezone = ?, last_ip = ? WHERE id = ?`
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

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE users SET access_origin = ?, access_path = ?, access_referrer = ?, device_summary = ?, timezone = ?, last_ip = ?, last_login_at = ? WHERE id = ?`
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
    const token = signSessionToken(user.id);
    setSessionCookie(req, res, token);
    res.json({ user: sanitizeUser(updated) });
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  // Admin: List all registered users + usage counts
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
      })),
    });
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
      db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, targetId);
      const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId) as unknown as UserRow;
      res.json({ user: sanitizeUser(updated) });
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
      const target = db.prepare('SELECT id FROM users WHERE id = ?').get(targetId) as
        | { id: string }
        | undefined;
      if (!target) {
        res.status(404).json({ error: 'User tidak ditemukan.' });
        return;
      }
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
        hashPassword(newPassword),
        targetId
      );
      res.json({ ok: true });
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
      const result = db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
      if (result.changes === 0) {
        res.status(404).json({ error: 'User tidak ditemukan.' });
        return;
      }
      res.json({ ok: true });
    }
  );

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
