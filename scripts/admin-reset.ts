import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { DatabaseSync } from 'node:sqlite';

const DB_PATH = process.env.SQLITE_PATH || path.join(process.cwd(), 'data', 'diecut.db');

function hashSecret(secret: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(secret, salt, 64).toString('hex');
  return `${salt}:${derived}`;
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

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--email' && argv[i + 1]) {
      args.email = argv[++i];
    } else if (token === '--password' && argv[i + 1]) {
      args.password = argv[++i];
    } else if (token === '--rotate-recovery') {
      args.rotateRecovery = true;
    } else if (token === '--help' || token === '-h') {
      args.help = true;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(`
DieCut.Room — Emergency Admin CLI Reset

Usage:
  npm run admin:reset
  npm run admin:reset -- --email admin@domain.com --password "NewStrongPassword!"
  npm run admin:reset -- --rotate-recovery

Options:
  --email <email>       Target admin email (defaults to existing admin or ADMIN_EMAIL)
  --password <pwd>      New password (minimum 6 characters)
  --rotate-recovery     Generate & save a new Admin Recovery Key
`);
    process.exit(0);
  }

  if (!fs.existsSync(DB_PATH)) {
    console.error(`SQLite database not found at: ${DB_PATH}`);
    console.error('Start the server once or set SQLITE_PATH before running admin:reset.');
    process.exit(1);
  }

  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  // Ensure new schema columns/tables exist if CLI is run before server restart
  const cols = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
  const colNames = new Set(cols.map((c) => c.name));
  if (!colNames.has('token_version')) {
    db.exec('ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1;');
  }
  if (!colNames.has('failed_login_count')) {
    db.exec('ALTER TABLE users ADD COLUMN failed_login_count INTEGER NOT NULL DEFAULT 0;');
  }
  if (!colNames.has('locked_until')) {
    db.exec('ALTER TABLE users ADD COLUMN locked_until TEXT;');
  }
  db.exec(`
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
  `);

  const defaultAdmin = db
    .prepare("SELECT id, email, name FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1")
    .get() as { id: string; email: string; name: string } | undefined;

  let targetEmail =
    typeof args.email === 'string'
      ? args.email.trim().toLowerCase()
      : defaultAdmin?.email || (process.env.ADMIN_EMAIL || 'totale.room@gmail.com').trim().toLowerCase();

  let newPassword = typeof args.password === 'string' ? args.password : '';
  let rotateRecovery = Boolean(args.rotateRecovery);

  if (!newPassword && !rotateRecovery) {
    const rl = readline.createInterface({ input, output });
    try {
      const emailInput = (
        await rl.question(`Email Admin [${targetEmail}]: `)
      ).trim();
      if (emailInput) targetEmail = emailInput.toLowerCase();

      const pwdInput = await rl.question(
        'Password baru Admin (min 6 karakter, kosongkan jika hanya rotasi Recovery Key): '
      );
      newPassword = pwdInput;

      const rotateAns = (
        await rl.question('Buat / rotasi Admin Recovery Key baru? (y/N): ')
      ).trim().toLowerCase();
      rotateRecovery = rotateAns === 'y' || rotateAns === 'yes';
    } finally {
      rl.close();
    }
  }

  const now = new Date().toISOString();

  if (newPassword) {
    if (newPassword.length < 6) {
      console.error('Error: Password minimal 6 karakter.');
      process.exit(1);
    }

    const existing = db
      .prepare('SELECT id, email FROM users WHERE email = ? LIMIT 1')
      .get(targetEmail) as { id: string; email: string } | undefined;

    if (existing) {
      db.prepare(
        `UPDATE users
         SET password_hash = ?,
             role = 'admin',
             status = 'active',
             failed_login_count = 0,
             locked_until = NULL,
             token_version = token_version + 1
         WHERE id = ?`
      ).run(hashSecret(newPassword), existing.id);
      console.log(`Password Admin untuk ${targetEmail} berhasil direset & semua sesi lama dicabut.`);
    } else {
      db.prepare(
        `INSERT INTO users (id, name, email, company, password_hash, role, status, access_origin, created_at, token_version)
         VALUES (?, ?, ?, ?, ?, 'admin', 'active', 'cli-emergency-reset', ?, 1)`
      ).run(
        crypto.randomUUID(),
        'DieCut Administrator',
        targetEmail,
        'DieCut.Room Admin',
        hashSecret(newPassword),
        now
      );
      console.log(`Akun Admin baru ${targetEmail} berhasil dibuat & diaktifkan.`);
    }

    db.prepare(
      `INSERT INTO audit_logs (id, event_type, severity, actor_email, target_email, detail, ip_address, origin, created_at)
       VALUES (?, 'admin_recover', 'warning', 'vps-cli', ?, 'Password Admin direset via CLI VPS', 'localhost', 'cli', ?)`
    ).run(crypto.randomUUID(), targetEmail, now);
  }

  if (rotateRecovery) {
    const recoveryKey = generateHumanRecoveryKey();
    const hash = hashSecret(recoveryKey);
    db.prepare(
      `INSERT INTO system_meta (key, value, updated_at)
       VALUES ('admin_recovery_key_hash', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run(hash, now);
    db.prepare(
      `INSERT INTO system_meta (key, value, updated_at)
       VALUES ('admin_recovery_key_rotated_at', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run(now, now);
    db.prepare(
      `INSERT INTO audit_logs (id, event_type, severity, actor_email, target_email, detail, ip_address, origin, created_at)
       VALUES (?, 'recovery_key_rotated', 'warning', 'vps-cli', ?, 'Admin Recovery Key dirotasi via CLI VPS', 'localhost', 'cli', ?)`
    ).run(crypto.randomUUID(), targetEmail, now);

    console.log('');
    console.log('=== ADMIN RECOVERY KEY BARU (SIMPAN DI TEMPAT AMAN) ===');
    console.log(recoveryKey);
    console.log('=======================================================');
  }

  db.close();
}

main().catch((err) => {
  console.error('CLI reset failed:', err);
  process.exit(1);
});
