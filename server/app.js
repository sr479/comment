import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import QRCode from 'qrcode';
import { hashPassword, verifyPassword } from './db.js';

export const TAGS = ['服务态度', '专业体验', '环境卫生', '预约安排', '消费体验', '其他建议'];
const cookieName = 'fm_admin_session';
const statuses = ['new', 'following', 'done'];
const digest = (text) => createHash('sha256').update(text).digest('hex');
const reviewSchema = z.object({
  submissionId: z.uuid(), token: z.string().max(300),
  target: z.enum(['store', 'staff']), staffId: z.number().int().positive().nullable(),
  rating: z.number().int().min(1).max(5),
  tags: z.array(z.enum(TAGS)).max(TAGS.length).transform((tags) => [...new Set(tags)]),
  content: z.string().trim().min(5, '请至少写下 5 个字').max(2000),
  website: z.string().max(200).optional().default(''),
});
const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  q: z.string().trim().max(100).default(''),
  status: z.enum(['', ...statuses]).default(''),
  target: z.enum(['', 'store', 'staff']).default(''),
  rating: z.enum(['', 'low', 'high']).default(''),
  from: z.iso.date().or(z.literal('')).default(''),
  to: z.iso.date().or(z.literal('')).default(''),
});

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function createApp(db, config = {}) {
  const app = express();
  const production = config.production ?? false;
  const publicOrigin = config.publicOrigin;
  const sessionMs = 12 * 60 * 60 * 1000;
  const formSecret = db.prepare("SELECT value FROM meta WHERE key='form_secret'").get().value;
  const tokenSignature = (payload) => createHmac('sha256', formSecret).update(payload).digest('base64url');
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);
  app.use(helmet({
    contentSecurityPolicy: production ? { directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'], connectSrc: ["'self'"], fontSrc: ["'self'"],
      objectSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"],
    } } : false,
    strictTransportSecurity: production ? { maxAge: 31536000, includeSubDomains: false } : false,
    crossOriginEmbedderPolicy: false,
  }));
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use('/api', express.json({ limit: '16kb', strict: true }));

  const originFor = (req) => publicOrigin || `${req.protocol}://${req.get('host')}`;
  app.use('/api', (req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('origin') !== originFor(req)) {
      return next(new HttpError(403, '请求来源校验失败，请刷新页面后重试'));
    }
    next();
  });

  const rateOptions = { standardHeaders: 'draft-8', legacyHeaders: false, windowMs: 60 * 60 * 1000,
    message: { error: '操作过于频繁，请稍后再试' }, skip: () => config.disableRateLimit === true };
  const submitLimit = rateLimit({ ...rateOptions, limit: config.submitLimit ?? 20 });
  // 先按来源限制密码运算，再全局限制，避免无限并发的 scrypt 运算。
  const loginLimit = rateLimit({ ...rateOptions, windowMs: 15 * 60 * 1000, limit: 10 });
  const globalLoginLimit = rateLimit({ ...rateOptions, windowMs: 60 * 1000, limit: 60, keyGenerator: () => 'login' });
  const apiLimit = rateLimit({ ...rateOptions, windowMs: 60 * 1000, limit: 120 });
  app.use('/api', apiLimit);

  function auth(req, res, next) {
    const raw = req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    if (!raw || !/^[a-f0-9]{64}$/.test(raw)) return next(new HttpError(401, '请先登录管理员账号'));
    const session = db.prepare(`SELECT sessions.*, admins.username FROM sessions JOIN admins ON admins.id=sessions.admin_id
      WHERE token_hash=? AND expires_at>?`).get(digest(raw), Date.now());
    if (!session) return next(new HttpError(401, '登录已过期，请重新登录'));
    req.adminSession = session;
    if (!['GET', 'HEAD'].includes(req.method) && req.get('x-csrf-token') !== session.csrf) {
      return next(new HttpError(403, '安全校验失败，请刷新页面'));
    }
    next();
  }

  function makeToken() {
    const payload = `${Date.now()}.${randomBytes(16).toString('hex')}`;
    return `${payload}.${tokenSignature(payload)}`;
  }
  function checkToken(token) {
    const [timestamp, nonce, signature, extra] = token.split('.');
    if (!timestamp || !nonce || !signature || extra) return false;
    const expected = tokenSignature(`${timestamp}.${nonce}`);
    const a = Buffer.from(signature); const b = Buffer.from(expected);
    const age = Date.now() - Number(timestamp);
    return a.length === b.length && timingSafeEqual(a, b) && age >= (config.minFormAgeMs ?? 1000) && age < 2 * 60 * 60 * 1000;
  }

  app.get('/api/health', (_req, res) => {
    db.prepare('SELECT 1').get(); res.json({ ok: true });
  });
  app.get('/api/form', (_req, res) => {
    res.json({ storeName: '延安梵玛西', staff: db.prepare('SELECT id,name FROM staff WHERE active=1 ORDER BY id').all(),
      tags: TAGS, token: makeToken(), icpNumber: config.icpNumber || '' });
  });
  app.post('/api/reviews', submitLimit, (req, res) => {
    const data = reviewSchema.parse(req.body);
    if (data.website || !checkToken(data.token)) throw new HttpError(400, '页面已过期或提交过快，请刷新后重试');
    if (data.target === 'store' && data.staffId !== null) throw new HttpError(400, '评价门店时请勿选择员工');
    // 幂等键仅用于返回同一次提交的回执，不会开放评价内容。
    const previous = db.prepare('SELECT id FROM reviews WHERE submission_id=?').get(data.submissionId);
    if (previous) return res.json({ id: previous.id });
    let staff = null;
    if (data.target === 'staff') {
      staff = db.prepare('SELECT id,name FROM staff WHERE id=? AND active=1').get(data.staffId);
      if (!staff) throw new HttpError(400, '该员工暂不可选，请刷新名单或选择门店');
    }
    const id = randomUUID(); const now = new Date().toISOString();
    db.prepare(`INSERT INTO reviews(id,submission_id,target,staff_id,staff_name,rating,tags,content,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id, data.submissionId, data.target, staff?.id ?? null, staff?.name ?? null,
      data.rating, JSON.stringify(data.tags), data.content, now, now);
    res.status(201).json({ id });
  });
  app.post('/api/admin/login', loginLimit, globalLoginLimit, async (req, res) => {
    const data = z.object({ username: z.string().trim().min(1).max(40), password: z.string().min(1).max(128) }).parse(req.body);
    const admin = db.prepare('SELECT * FROM admins WHERE username=?').get(data.username);
    // 不存在的用户也执行相同成本的密码运算，避免通过响应时间枚举账号。
    const dummy = `00000000000000000000000000000000:${'00'.repeat(64)}`;
    const valid = await verifyPassword(data.password, admin?.password_hash || dummy);
    if (!admin || !valid) throw new HttpError(401, '账号或密码不正确');
    const token = randomBytes(32).toString('hex'); const csrf = randomBytes(32).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(Date.now());
    db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(digest(token), admin.id, csrf, Date.now() + sessionMs);
    res.cookie(cookieName, token, { httpOnly: true, secure: production, sameSite: 'strict', path: '/api/admin', maxAge: sessionMs });
    res.json({ username: admin.username, csrf });
  });
  app.use('/api/admin', auth);
  app.get('/api/admin/session', (req, res) => res.json({ username: req.adminSession.username, csrf: req.adminSession.csrf }));
  app.post('/api/admin/logout', (req, res) => {
    db.prepare('DELETE FROM sessions WHERE token_hash=?').run(req.adminSession.token_hash);
    res.clearCookie(cookieName, { httpOnly: true, secure: production, sameSite: 'strict', path: '/api/admin' });
    res.json({ ok: true });
  });
  app.post('/api/admin/password', loginLimit, async (req, res) => {
    const data = z.object({ currentPassword: z.string().min(1).max(128), password: z.string().min(12).max(128) }).parse(req.body);
    const admin = db.prepare('SELECT * FROM admins WHERE id=?').get(req.adminSession.admin_id);
    if (!(await verifyPassword(data.currentPassword, admin.password_hash))) throw new HttpError(400, '原密码不正确');
    const hash = await hashPassword(data.password);
    db.prepare('UPDATE admins SET password_hash=? WHERE id=?').run(hash, admin.id);
    db.prepare('DELETE FROM sessions WHERE admin_id=?').run(admin.id);
    res.clearCookie(cookieName, { httpOnly: true, secure: production, sameSite: 'strict', path: '/api/admin' });
    res.json({ ok: true });
  });

  function filters(query) {
    const data = querySchema.parse(query);
    if (data.from && data.to && data.from > data.to) throw new HttpError(400, '开始日期不能晚于结束日期');
    const clauses = []; const values = [];
    if (data.q) { clauses.push("(content LIKE ? ESCAPE '\\' OR coalesce(staff_name,'') LIKE ? ESCAPE '\\')");
      const term = `%${data.q.replace(/[\\%_]/g, '\\$&')}%`; values.push(term, term); }
    for (const field of ['status', 'target']) if (data[field]) { clauses.push(`${field}=?`); values.push(data[field]); }
    if (data.rating) clauses.push(data.rating === 'low' ? 'rating<=2' : 'rating>=4');
    if (data.from) { clauses.push('created_at>=?'); values.push(new Date(`${data.from}T00:00:00+08:00`).toISOString()); }
    if (data.to) { clauses.push('created_at<=?'); values.push(new Date(`${data.to}T23:59:59.999+08:00`).toISOString()); }
    return { ...data, where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', values };
  }
  const serializeReview = (row) => ({ ...row, tags: JSON.parse(row.tags) });
  app.get('/api/admin/reviews', (req, res) => {
    const f = filters(req.query);
    const total = db.prepare(`SELECT count(*) AS total FROM reviews ${f.where}`).get(...f.values).total;
    const rows = db.prepare(`SELECT * FROM reviews ${f.where} ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET ?`).all(...f.values, (f.page - 1) * 20);
    res.json({ rows: rows.map(serializeReview), total, page: f.page, pageSize: 20 });
  });
  app.get('/api/admin/stats', (_req, res) => {
    const stats = db.prepare(`SELECT count(*) AS total, coalesce(sum(status='new'),0) AS unread,
      coalesce(sum(status='following'),0) AS following, round(avg(rating),1) AS average,
      coalesce(sum(rating<=2),0) AS low, coalesce(sum(date(created_at,'+8 hours')=date('now','+8 hours')),0) AS today FROM reviews`).get();
    const distribution = db.prepare('SELECT rating,count(*) AS count FROM reviews GROUP BY rating ORDER BY rating DESC').all();
    const trend = db.prepare(`SELECT date(created_at,'+8 hours') AS day,count(*) AS count FROM reviews
      WHERE date(created_at,'+8 hours')>=date('now','+8 hours','-6 days') GROUP BY day ORDER BY day`).all();
    res.json({ ...stats, distribution, trend });
  });
  app.patch('/api/admin/reviews/:id', (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const data = z.object({ status: z.enum(statuses), note: z.string().trim().max(2000) }).parse(req.body);
    const changed = db.prepare('UPDATE reviews SET status=?,note=?,updated_at=? WHERE id=?').run(data.status, data.note, new Date().toISOString(), id);
    if (!changed.changes) throw new HttpError(404, '评价不存在');
    res.json(serializeReview(db.prepare('SELECT * FROM reviews WHERE id=?').get(id)));
  });
  app.get('/api/admin/export', (req, res) => {
    const f = filters(req.query);
    // 上限明确返回错误，避免在后台导出时悄悄丢失数据。
    const total = db.prepare(`SELECT count(*) AS n FROM reviews ${f.where}`).get(...f.values).n;
    if (total > 50000) throw new HttpError(400, '单次最多导出 50000 条，请缩小日期范围');
    const rows = db.prepare(`SELECT * FROM reviews ${f.where} ORDER BY created_at DESC`).all(...f.values);
    const cell = (value) => { let text = String(value ?? ''); if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
      return `"${text.replaceAll('"', '""')}"`; };
    const statusNames = { new: '待查看', following: '跟进中', done: '已处理' };
    const lines = [['时间（北京时间）', '评价对象', '满意度', '标签', '评价内容', '处理状态', '内部备注'],
      ...rows.map((r) => [new Date(r.created_at).toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }),
        r.staff_name || '门店整体', r.rating, JSON.parse(r.tags).join('、'), r.content, statusNames[r.status], r.note])];
    res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', 'attachment; filename="fanmaxi-feedback.csv"');
    res.send('\uFEFF' + lines.map((line) => line.map(cell).join(',')).join('\r\n'));
  });
  app.get('/api/admin/staff', (_req, res) => res.json(db.prepare('SELECT * FROM staff ORDER BY active DESC,id').all()));
  app.post('/api/admin/staff', (req, res) => {
    const { name } = z.object({ name: z.string().trim().min(1).max(30) }).parse(req.body);
    if (db.prepare('SELECT id FROM staff WHERE name=?').get(name)) throw new HttpError(409, '该姓名已存在，可启用原员工');
    if (db.prepare('SELECT count(*) AS n FROM staff').get().n >= 200) throw new HttpError(400, '员工数量已达上限');
    const result = db.prepare('INSERT INTO staff(name) VALUES (?)').run(name);
    res.status(201).json({ id: Number(result.lastInsertRowid), name, active: 1 });
  });
  app.patch('/api/admin/staff/:id', (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    if (!db.prepare('UPDATE staff SET active=? WHERE id=?').run(Number(active), id).changes) throw new HttpError(404, '员工不存在');
    res.json({ ok: true });
  });
  app.get('/api/admin/site', (req, res) => res.json({ url: originFor(req), storeName: '延安梵玛西', icpNumber: config.icpNumber || '' }));
  app.get('/api/admin/qrcode.png', async (req, res) => {
    const buffer = await QRCode.toBuffer(`${originFor(req)}/`, { type: 'png', width: 900, margin: 3, errorCorrectionLevel: 'M', color: { dark: '#503d4c', light: '#ffffff' } });
    res.type('png'); if (req.query.download === '1') res.attachment('fanmaxi-feedback-qr.png');
    res.send(buffer);
  });
  app.use('/api', (_req, _res, next) => next(new HttpError(404, '接口不存在')));
  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues[0]?.message || '请检查填写内容' });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: '提交内容过长' });
    if (error instanceof SyntaxError && error.status === 400) return res.status(400).json({ error: '请求格式有误' });
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    // 不记录原始请求、评价正文或网络地址。
    console.error('服务内部异常:', error.name, error.code || 'unknown');
    res.status(500).json({ error: '服务暂时不可用，请稍后重试' });
  });
  return app;
}
