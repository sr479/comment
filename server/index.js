import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { openDatabase, createAdmin } from './db.js';
import { createApp } from './app.js';

process.umask(0o077);
const dev = process.argv.includes('--dev');
const production = process.env.NODE_ENV === 'production' && !dev;
const origin = process.env.PUBLIC_ORIGIN?.replace(/\/$/, '');
if (production && (!origin || new URL(origin).origin !== origin || !origin.startsWith('https://'))) {
  throw new Error('生产环境必须设置 PUBLIC_ORIGIN=https://你的子域名');
}
const db = openDatabase(resolve(process.env.DATABASE_PATH || './data/feedback.sqlite'));
if (!db.prepare('SELECT id FROM admins LIMIT 1').get()) {
  if (!dev) throw new Error('尚未创建管理员，请先运行 npm run admin:init');
  const password = randomBytes(18).toString('base64url');
  await createAdmin(db, 'admin', password);
  mkdirSync('.local', { recursive: true, mode: 0o700 });
  writeFileSync('.local/admin-credentials', `用户名：admin\n密码：${password}\n仅用于本机开发；生产环境请单独初始化账号。\n`, { mode: 0o600 });
  console.log('开发账号已生成，见 .local/admin-credentials（已被 Git 忽略）');
}
const proxySetting = process.env.TRUST_PROXY;
const trustProxy = proxySetting && /^\d+$/.test(proxySetting) ? Number(proxySetting) : proxySetting;
const app = createApp(db, { production, publicOrigin: dev ? undefined : origin,
  trustProxy, icpNumber: process.env.ICP_NUMBER });
const server = createServer(app);
let vite;
if (dev) {
  const { createServer: createViteServer } = await import('vite');
  vite = await createViteServer({ server: { middlewareMode: true, hmr: { server } }, appType: 'spa' });
  app.use(vite.middlewares);
} else {
  if (!existsSync('dist/index.html')) throw new Error('请先运行 npm run build');
  const { default: express } = await import('express');
  app.use(express.static(resolve('dist'), { maxAge: '1h', index: false }));
  app.get(['/', '/admin', '/admin/{*path}', '/privacy'], (_req, res) => {
    res.set('Cache-Control', 'no-cache').sendFile(resolve('dist/index.html'));
  });
  app.use((_req, res) => res.status(404).type('text').send('页面不存在'));
}
const port = Number(process.env.PORT || 3086); const host = process.env.HOST || '127.0.0.1';
server.listen(port, host, () => console.log(`Local: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`));
const shutdown = () => {
  server.close(async () => { await vite?.close(); db.close(); process.exit(0); });
  setTimeout(() => process.exit(1), 10000).unref();
};
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
