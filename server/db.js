import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  if (path !== ':memory:') chmodSync(path, 0o600);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, admin_id INTEGER NOT NULL REFERENCES admins(id),
      csrf TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY, submission_id TEXT NOT NULL UNIQUE,
      target TEXT NOT NULL CHECK(target IN ('store','staff')),
      staff_id INTEGER REFERENCES staff(id), staff_name TEXT,
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      tags TEXT NOT NULL DEFAULT '[]', content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','following','done')),
      note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS reviews_created ON reviews(created_at DESC);
    CREATE INDEX IF NOT EXISTS reviews_status ON reviews(status);
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  db.prepare("INSERT OR IGNORE INTO meta(key,value) VALUES ('form_secret',?)").run(randomBytes(32).toString('hex'));
  return db;
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [salt, expected] = stored.split(':');
  const actual = await scrypt(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}

export async function createAdmin(db, username, password) {
  if (!/^[a-zA-Z0-9_.-]{3,40}$/.test(username)) throw new Error('用户名须为 3–40 位字母、数字或 _ . -');
  if (password.length < 12 || password.length > 128) throw new Error('密码长度须为 12–128 位');
  const hash = await hashPassword(password);
  db.prepare('INSERT INTO admins(username,password_hash) VALUES (?,?)').run(username, hash);
}
