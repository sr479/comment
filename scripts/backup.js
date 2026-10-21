import { backup } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { openDatabase } from '../server/db.js';

process.umask(0o077);
const directory = resolve(process.env.BACKUP_DIR || './backups');
mkdirSync(directory, { recursive: true, mode: 0o700 });
const filename = resolve(directory, `feedback-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
const db = openDatabase(resolve(process.env.DATABASE_PATH || './data/feedback.sqlite'));
try { await backup(db, filename); chmodSync(filename, 0o600); console.log(`备份完成：${filename}`); }
finally { db.close(); }
