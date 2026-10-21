import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { resolve } from 'node:path';
import { openDatabase, createAdmin, hashPassword } from '../server/db.js';

process.umask(0o077);
const db = openDatabase(resolve(process.env.DATABASE_PATH || './data/feedback.sqlite'));
const reset = process.argv.includes('--reset');
const usernameFlag = process.argv.indexOf('--username');
let username = usernameFlag >= 0 ? process.argv[usernameFlag + 1] : 'admin';
let password;
if (process.stdin.isTTY) {
  let muted = false;
  const output = new Writable({ write(chunk, _encoding, callback) { if (!muted) process.stdout.write(chunk); callback(); } });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  if (usernameFlag < 0) username = (await rl.question('管理员账号（默认 admin）：')).trim() || 'admin';
  process.stdout.write('管理员密码（至少 12 位，输入不可见）：'); muted = true;
  password = await rl.question(''); muted = false; process.stdout.write('\n');
  process.stdout.write('再次输入密码：'); muted = true;
  const confirm = await rl.question(''); muted = false; process.stdout.write('\n'); rl.close();
  if (password !== confirm) { db.close(); throw new Error('两次密码不一致'); }
} else {
  // 自动化可从 stdin 提供密码，避免密码出现在进程参数或 Git 配置中。
  const chunks = []; for await (const chunk of process.stdin) chunks.push(chunk);
  password = Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}
try {
  const existing = db.prepare('SELECT id FROM admins WHERE username=?').get(username);
  if (existing) {
    if (!reset) throw new Error('账号已存在。需要重置时，请显式追加 --reset');
    if (password.length < 12 || password.length > 128) throw new Error('密码长度须为 12–128 位');
    db.prepare('UPDATE admins SET password_hash=? WHERE id=?').run(await hashPassword(password), existing.id);
    db.prepare('DELETE FROM sessions WHERE admin_id=?').run(existing.id);
    console.log(`管理员 ${username} 的密码已重置，旧会话已失效。`);
  } else {
    await createAdmin(db, username, password);
    console.log(`管理员 ${username} 已创建。密码未写入配置文件。`);
  }
} finally { db.close(); }
