import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { openDatabase, createAdmin } from '../server/db.js';

const origin = 'http://localhost:3086';
const password = 'test-password-very-long-2026';
async function fixture(options = {}) {
  const db = openDatabase(':memory:');
  await createAdmin(db, 'admin', password);
  const app = createApp(db, { publicOrigin: origin, minFormAgeMs: 0, disableRateLimit: true, ...options });
  const admin = request.agent(app);
  const login = await admin.post('/api/admin/login').set('Origin', origin).send({ username: 'admin', password }).expect(200);
  const csrf = login.body.csrf;
  const mutate = (method, path, data) => admin[method](`/api/admin${path}`).set('Origin', origin).set('X-CSRF-Token', csrf).send(data);
  async function submit(overrides = {}) {
    const form = await request(app).get('/api/form').expect(200);
    return request(app).post('/api/reviews').set('Origin', origin).send({ token: form.body.token,
      submissionId: randomUUID(), target: 'store', staffId: null, rating: 3, tags: ['服务态度'], content: '希望下次预约等候时间能更短一些。', ...overrides });
  }
  return { db, app, admin, mutate, submit, csrf };
}

test('匿名反馈、后台管理、权限与数据保护完整流程', async (t) => {
  const f = await fixture(); t.after(() => f.db.close());
  let id;
  await t.test('匿名表单只有公开配置，不暴露评价和管理员数据', async () => {
    const response = await request(f.app).get('/api/form').expect(200);
    assert.equal(response.body.storeName, '延安梵玛西');
    assert.deepEqual(response.body.staff, []);
    assert.equal(response.headers['cache-control'], 'no-store');
    await request(f.app).get('/api/admin/reviews').expect(401);
    await request(f.app).get('/api/reviews').expect(404);
    await request(f.app).get('/data/feedback.sqlite').expect(404);
    const columns = f.db.prepare('PRAGMA table_info(reviews)').all().map((c) => c.name);
    for (const privateField of ['ip', 'phone', 'name', 'user_agent', 'wechat']) assert.ok(!columns.includes(privateField));
  });
  await t.test('真实持久化，管理员能看到完整正文且摘要同步', async () => {
    const response = await f.submit(); assert.equal(response.status, 201); id = response.body.id;
    assert.ok(id); assert.deepEqual(Object.keys(response.body), ['id']);
    const rows = await f.admin.get('/api/admin/reviews').expect(200);
    assert.equal(rows.body.total, 1); assert.equal(rows.body.rows[0].id, id);
    assert.equal(rows.body.rows[0].content, '希望下次预约等候时间能更短一些。');
    const stats = await f.admin.get('/api/admin/stats').expect(200);
    assert.equal(stats.body.total, 1); assert.equal(stats.body.unread, 1); assert.equal(stats.body.average, 3);
  });
  await t.test('重复提交同一幂等键只产生一条评价', async () => {
    const submissionId = randomUUID(); const a = await f.submit({ submissionId }); const b = await f.submit({ submissionId });
    assert.equal(a.status, 201); assert.equal(b.status, 200); assert.equal(a.body.id, b.body.id);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM reviews WHERE submission_id=?').get(submissionId).n, 1);
  });
  await t.test('验证正文、评分、标签、表单凭证和评价对象', async () => {
    for (const overrides of [{ content: '太短' }, { rating: 0 }, { rating: 6 }, { tags: ['非法标签'] },
      { token: 'tampered' }, { website: 'spam.example' }, { target: 'staff', staffId: null }, { target: 'store', staffId: 1 }]) {
      assert.equal((await f.submit(overrides)).status, 400);
    }
    const secret = f.db.prepare("SELECT value FROM meta WHERE key='form_secret'").get().value;
    const { createHmac } = await import('node:crypto'); const payload = `${Date.now() - 3 * 60 * 60 * 1000}.random`;
    const token = `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
    assert.equal((await f.submit({ token })).status, 400);
  });
  await t.test('跨站、缺少来源和缺少 CSRF 的后台写入均被拒绝', async () => {
    await request(f.app).post('/api/reviews').set('Origin', 'https://attacker.example').send({}).expect(403);
    await request(f.app).post('/api/admin/login').send({ username: 'admin', password }).expect(403);
    await f.admin.patch(`/api/admin/reviews/${id}`).set('Origin', origin).send({ status: 'done', note: '' }).expect(403);
    await f.admin.patch(`/api/admin/reviews/${id}`).set('Origin', 'https://other.xiangzhen.site').set('X-CSRF-Token', f.csrf).send({ status: 'done', note: '' }).expect(403);
    await request(f.app).post('/api/admin/login').set('Origin', origin).send({ username: 'admin', password: 'incorrect' }).expect(401);
  });
  await t.test('保存处理状态与内部备注，不对公众开放', async () => {
    await f.mutate('patch', `/reviews/${id}`, { status: 'following', note: '调整预约时段并跟进' }).expect(200);
    const result = await f.admin.get('/api/admin/reviews?status=following').expect(200);
    assert.equal(result.body.rows[0].note, '调整预约时段并跟进'); assert.equal(result.body.total, 1);
    await request(f.app).get(`/api/admin/reviews/${id}`).expect(401);
  });
  await t.test('员工启停保留历史快照，重名拒绝，停用后不可新选', async () => {
    const response = await f.mutate('post', '/staff', { name: '体验顾问' }).expect(201); const staffId = response.body.id;
    await f.mutate('post', '/staff', { name: '体验顾问' }).expect(409);
    const review = await f.submit({ target: 'staff', staffId, rating: 5 }); assert.equal(review.status, 201);
    await f.mutate('patch', `/staff/${staffId}`, { active: false }).expect(200);
    const form = await request(f.app).get('/api/form'); assert.equal(form.body.staff.length, 0);
    assert.equal((await f.submit({ target: 'staff', staffId })).status, 400);
    const list = await f.admin.get('/api/admin/reviews?target=staff').expect(200);
    assert.equal(list.body.rows[0].staff_name, '体验顾问');
    await f.mutate('patch', `/staff/${staffId}`, { active: true }).expect(200);
    assert.equal((await request(f.app).get('/api/form')).body.staff.length, 1);
  });
  await t.test('搜索转义 SQL 通配符、评分筛选、分页与日期校验', async () => {
    assert.equal((await f.admin.get('/api/admin/reviews?q=%25')).body.total, 0);
    assert.equal((await f.admin.get('/api/admin/reviews?q=%27%20OR%201%3D1--')).body.total, 0);
    const high = await f.admin.get('/api/admin/reviews?rating=high').expect(200);
    assert.ok(high.body.rows.every((r) => r.rating >= 4));
    await f.admin.get('/api/admin/reviews?page=-1').expect(400);
    await f.admin.get('/api/admin/reviews?from=2026-12-31&to=2026-01-01').expect(400);
    await f.admin.get('/api/admin/reviews?from=not-a-date').expect(400);
    for (let index = 0; index < 22; index++) assert.equal((await f.submit({ content: `第 ${index} 条测试意见内容` })).status, 201);
    const page2 = await f.admin.get('/api/admin/reviews?page=2').expect(200);
    assert.equal(page2.body.page, 2); assert.equal(page2.body.pageSize, 20); assert.ok(page2.body.rows.length > 0);
    const page1 = await f.admin.get('/api/admin/reviews').expect(200);
    assert.equal(page1.body.rows.length, 20); assert.ok(!page1.body.rows.some((a) => page2.body.rows.some((b) => a.id === b.id)));
  });
  await t.test('CSV 导出匹配筛选并防止表格公式注入', async () => {
    const result = await f.submit({ content: '=HYPERLINK("https://example.com")', rating: 1 }); assert.equal(result.status, 201);
    const csv = await f.admin.get('/api/admin/export?rating=low').expect(200);
    assert.match(csv.headers['content-type'], /text\/csv/); assert.match(csv.text, /'=HYPERLINK/);
    assert.ok(!csv.text.includes('调整预约时段')); await request(f.app).get('/api/admin/export').expect(401);
  });
  await t.test('二维码为 PNG，仅登录管理员可下载', async () => {
    await request(f.app).get('/api/admin/qrcode.png').expect(401);
    const qr = await f.admin.get('/api/admin/qrcode.png').expect(200);
    assert.match(qr.headers['content-type'], /image\/png/); assert.ok(qr.body.length > 1000);
    assert.equal((await f.admin.get('/api/admin/site')).body.url, origin);
  });
  await t.test('超长与损坏请求安全返回，不泄漏内部错误', async () => {
    await request(f.app).post('/api/reviews').set('Origin', origin).send({ content: 'a'.repeat(20000) }).expect(413);
    await request(f.app).post('/api/reviews').set('Origin', origin).set('Content-Type', 'application/json').send('{broken').expect(400);
  });
  await t.test('修改密码使所有旧会话失效，旧密码不可再次登录', async () => {
    const second = request.agent(f.app);
    await second.post('/api/admin/login').set('Origin', origin).send({ username: 'admin', password }).expect(200);
    await f.mutate('post', '/password', { currentPassword: 'wrong', password: 'new-very-long-password' }).expect(400);
    await f.mutate('post', '/password', { currentPassword: password, password: 'new-very-long-password' }).expect(200);
    await f.admin.get('/api/admin/session').expect(401); await second.get('/api/admin/session').expect(401);
    await request(f.app).post('/api/admin/login').set('Origin', origin).send({ username: 'admin', password }).expect(401);
    await request(f.app).post('/api/admin/login').set('Origin', origin).send({ username: 'admin', password: 'new-very-long-password' }).expect(200);
    assert.ok(!f.db.prepare('SELECT password_hash FROM admins').get().password_hash.includes('new-very-long-password'));
  });
});

test('生产环境 Cookie、来源限制、安全头与真实限流', async (t) => {
  const secureOrigin = 'https://pingjia.xiangzhen.site';
  const db = openDatabase(':memory:'); t.after(() => db.close()); await createAdmin(db, 'admin', password);
  const app = createApp(db, { production: true, publicOrigin: secureOrigin, minFormAgeMs: 0, submitLimit: 2 });
  const response = await request(app).post('/api/admin/login').set('Origin', secureOrigin).send({ username: 'admin', password }).expect(200);
  const cookie = response.headers['set-cookie'].join(';');
  for (const value of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/api/admin']) assert.ok(cookie.includes(value));
  assert.match(response.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.ok(!response.headers['strict-transport-security'].includes('includeSubDomains'));
  const form = await request(app).get('/api/form');
  for (let i = 0; i < 3; i++) {
    const result = await request(app).post('/api/reviews').set('Origin', secureOrigin).send({ token: form.body.token, submissionId: randomUUID(), target: 'store', staffId: null, rating: 5, tags: [], content: '环境很干净，体验很好' });
    assert.equal(result.status, i < 2 ? 201 : 429);
  }
});

test('文件数据库重开后评价和管理员账号仍然保留', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs'); const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  const directory = mkdtempSync(join(tmpdir(), 'fanmaxi-test-')); const path = join(directory, 'data.sqlite');
  try {
    let db = openDatabase(path); await createAdmin(db, 'admin', password);
    const now = new Date().toISOString(); db.prepare('INSERT INTO reviews(id,submission_id,target,rating,content,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(randomUUID(), randomUUID(), 'store', 5, '数据重启后仍然存在', now, now);
    db.close(); db = openDatabase(path); assert.equal(db.prepare('SELECT count(*) AS n FROM reviews').get().n, 1); assert.equal(db.prepare('SELECT count(*) AS n FROM admins').get().n, 1); db.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
