import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, CircleCheck, ClipboardList, Download, ExternalLink, Eye, EyeOff, Inbox, LayoutDashboard, LoaderCircle, LockKeyhole, LogOut, Menu, MessageCircle, Plus, Printer, QrCode, RefreshCw, Search, Settings, ShieldCheck, Star, Store, Users, X } from 'lucide-react';
import { api, ApiError, dateText, patch, post, setCsrf, statusText, type Review, type ReviewStatus, type Staff, type Stats } from './api';
import { Brand, Dialog, Empty, Flower } from './components';

type Session = { username: string; csrf: string };
type Page = 'reviews' | 'staff' | 'qr' | 'settings';
type Filters = { q: string; status: string; target: string; rating: string; from: string; to: string };
const blankFilters = { q: '', status: '', target: '', rating: '', from: '', to: '' };
const pageNames = { reviews: '评价管理', staff: '员工管理', qr: '评价二维码', settings: '账号设置' };

function Stars({ value }: { value: number }) {
  return <span className="stars" aria-label={`${value} 星`}>{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={13} strokeWidth={1.4} fill={n <= value ? 'currentColor' : 'none'} className={n <= value ? '' : 'star-empty'}/>)}</span>;
}
function Login({ onLogin, notice }: { onLogin: (session: Session) => void; notice?: string }) {
  const [username, setUsername] = useState(''); const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true);
    try { onLogin(await post<Session>('/admin/login', { username, password })); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return <div className="login-page"><div className="login-header"><Brand/><a className="text-link" href="/"><ArrowLeft size={15}/> 返回意见箱</a></div><main className="login-main"><div className="login-art"><Flower/><span>每一份反馈，<br/>都是变好的开始。</span><p>延安梵玛西 · 管理工作台</p></div><section className="login-card"><div className="heading-icon"><LockKeyhole size={23}/></div><h1>欢迎回来</h1><p className="muted">登录工作台，听见顾客的声音。</p><form onSubmit={submit}><label className="form-label">管理员账号<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required maxLength={40} placeholder="请输入管理员账号"/></label><label className="form-label">登录密码<div className="password-input"><input value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? 'text' : 'password'} autoComplete="current-password" required maxLength={128} placeholder="请输入密码"/><button type="button" className="icon-button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? '隐藏密码' : '显示密码'}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></label>{error && <p className="error-message" role="alert">{error}</p>}<button disabled={busy} className="button primary full-width">{busy ? '正在登录…' : '登录工作台'}<ArrowRight size={17}/></button></form><div className="login-security"><ShieldCheck size={14}/> 受保护的管理区域，仅限授权人员访问</div></section></main><p className="login-foot">认真倾听，用心回应。</p></div>;
}

export default function Admin() {
  const [session, setSession] = useState<Session | null>(null); const [checking, setChecking] = useState(true);
  const [page, setPage] = useState<Page>('reviews'); const [mobileMenu, setMobileMenu] = useState(false);
  const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const [stats, setStats] = useState<Stats | null>(null); const [reviews, setReviews] = useState<Review[]>([]);
  const [total, setTotal] = useState(0); const [pageNumber, setPageNumber] = useState(1);
  const [filters, setFilters] = useState<Filters>(blankFilters); const [refresh, setRefresh] = useState(0); const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Review | null>(null);
  const signIn = useCallback((value: Session) => { setCsrf(value.csrf); setSession(value); setError(''); }, []);
  const handleError = useCallback((err: unknown) => {
    if (err instanceof ApiError && err.status === 401) { setSession(null); setCsrf(''); setError(''); }
    else setError((err as Error).message);
  }, []);
  useEffect(() => { api<Session>('/admin/session').then(signIn).catch(handleError).finally(() => setChecking(false)); }, [handleError, signIn]);
  useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(''), 4500); return () => clearTimeout(timer); }, [message]);
  useEffect(() => {
    if (!session || page !== 'reviews') return;
    let ignore = false;
    const timer = setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const query = new URLSearchParams({ ...filters, page: String(pageNumber) });
        const [list, overview] = await Promise.all([api<{ rows: Review[]; total: number }>(`/admin/reviews?${query}`), api<Stats>('/admin/stats')]);
        if (!ignore) { setReviews(list.rows); setTotal(list.total); setStats(overview); }
      } catch (err) { if (!ignore) handleError(err); }
      finally { if (!ignore) setLoading(false); }
    }, 220);
    return () => { ignore = true; clearTimeout(timer); };
  }, [session, page, pageNumber, filters, refresh, handleError]);
  if (checking) return <div className="loading"><LoaderCircle className="spin" size={20}/> 正在打开工作台…</div>;
  if (!session) return <><Login onLogin={signIn} notice={message}/>{message && <div className="toast" role="status"><CircleCheck size={17}/>{message}</div>}</>;
  async function logout() {
    try { await post('/admin/logout'); setSession(null); setCsrf(''); } catch (err) { handleError(err); }
  }
  function filter(key: keyof Filters, value: string) { setFilters((f) => ({ ...f, [key]: value })); setPageNumber(1); }
  const navItems: { key: Page; icon: typeof Inbox; label: string }[] = [
    { key: 'reviews', icon: LayoutDashboard, label: '评价管理' }, { key: 'staff', icon: Users, label: '员工管理' },
    { key: 'qr', icon: QrCode, label: '评价二维码' }, { key: 'settings', icon: Settings, label: '账号设置' },
  ];
  return <div className="admin-app">
    {mobileMenu && <button className="sidebar-backdrop" aria-label="关闭导航" onClick={() => setMobileMenu(false)}/>}
    <aside className={`admin-sidebar ${mobileMenu ? 'open' : ''}`}><Brand/><div className="workspace-label">管理工作台 <span>WORKSPACE</span></div><nav>{navItems.map(({ key, icon: Icon, label }) => <button key={key} className={page === key ? 'active' : ''} onClick={() => { setPage(key); setMobileMenu(false); setError(''); }}><Icon size={19}/>{label}{key === 'reviews' && !!stats?.unread && <span className="nav-count">{stats.unread}</span>}</button>)}</nav><div className="sidebar-note"><ShieldCheck size={21}/><strong>每一份信任，都值得守护</strong><p>顾客评价仅管理员可见，<br/>请妥善保管后台账号。</p></div><div className="sidebar-bottom"><span className="admin-avatar">{session.username[0].toUpperCase()}</span><div><strong>{session.username}</strong><small>门店管理员</small></div><button onClick={logout} className="icon-button" aria-label="退出登录"><LogOut size={17}/></button></div></aside>
    <div className="admin-body"><header className="admin-topbar"><button className="icon-button mobile-menu" aria-label="打开导航" onClick={() => setMobileMenu(true)}><Menu size={22}/></button><div className="breadcrumb">管理工作台 <ChevronRight size={13}/><strong>{pageNames[page]}</strong></div><span className="admin-protected"><span/> 仅管理员可见</span><a className="public-entry" href="/" target="_blank" rel="noreferrer">查看意见箱 <ExternalLink size={13}/></a></header>
      <main className="admin-content">
        {message && <div className="toast" role="status"><CircleCheck size={17}/>{message}<button className="icon-button" onClick={() => setMessage('')} aria-label="关闭通知"><X size={15}/></button></div>}
        {error && <div className="error-banner" role="alert">{error}<button className="text-link" onClick={() => { setError(''); setRefresh((n) => n + 1); }}>重试</button></div>}
        {page === 'reviews' && <>
          <div className="page-heading"><div><div className="eyebrow">LISTEN. UNDERSTAND. IMPROVE.</div><h1>每一个声音，都值得被听见<span>。</span></h1><p>在这里了解真实感受，让每一次体验更好。</p></div><span className="date-badge">{new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())}</span></div>
          <div className="stat-grid"><StatCard label="累计反馈" value={stats?.total ?? 0} hint="每一份反馈，都认真对待" icon={<MessageCircle size={20}/>} /><StatCard label="待查看" value={stats?.unread ?? 0} hint={stats?.unread ? '有新的心声等待倾听' : '所有反馈均已查看'} icon={<Inbox size={20}/>} accent/><StatCard label="平均满意度" value={stats?.average ?? '—'} hint={stats?.total ? '满分 5 分 · 全部评价' : '收到评价后自动计算'} icon={<Star size={20}/>} /><StatCard label="今日新增" value={stats?.today ?? 0} hint={`跟进中 ${stats?.following ?? 0} 条`} icon={<ClipboardList size={20}/>} /></div>
          <div className="overview-grid"><section className="insight-card"><div className="section-heading"><h2>近 7 天的声音</h2><span>反馈趋势</span></div><TrendChart stats={stats}/></section><section className="insight-card distribution-card"><div className="section-heading"><h2>体验满意度</h2><span>{stats?.total ?? 0} 份反馈</span></div><div className="distribution">{[5, 4, 3, 2, 1].map((rating) => { const count = stats?.distribution.find((d) => d.rating === rating)?.count || 0; return <div key={rating}><span>{rating}<Star size={11} fill="currentColor"/></span><i><b style={{ width: `${stats?.total ? count / stats.total * 100 : 0}%` }}/></i><small>{count}</small></div>; })}</div></section></div>
          <section className="reviews-section"><div className="section-heading reviews-heading"><div><h2>全部评价 <span className="count-badge">{total}</span></h2><p>真实的建议，是变得更好的起点。</p></div><div className="review-actions"><button className="button secondary small-button" disabled={loading} onClick={() => setRefresh((n) => n + 1)}><RefreshCw size={14}/>刷新</button><a className="button secondary small-button" href={`/api/admin/export?${new URLSearchParams(filters)}`}><Download size={15}/> 导出 CSV</a></div></div>
            <div className="filters"><div className="search-input"><Search size={16}/><input value={filters.q} onChange={(event) => filter('q', event.target.value)} placeholder="搜索评价内容、员工姓名" aria-label="搜索评价"/>{filters.q && <button className="icon-button" onClick={() => filter('q', '')} aria-label="清空搜索"><X size={13}/></button>}</div><select aria-label="处理状态" value={filters.status} onChange={(event) => filter('status', event.target.value)}><option value="">全部状态</option><option value="new">待查看</option><option value="following">跟进中</option><option value="done">已处理</option></select><select aria-label="评价对象筛选" value={filters.target} onChange={(event) => filter('target', event.target.value)}><option value="">全部对象</option><option value="store">门店整体</option><option value="staff">员工评价</option></select><select aria-label="满意度筛选" value={filters.rating} onChange={(event) => filter('rating', event.target.value)}><option value="">全部满意度</option><option value="low">1–2 星</option><option value="high">4–5 星</option></select><div className="date-filter"><input type="date" aria-label="开始日期" value={filters.from} onChange={(event) => filter('from', event.target.value)}/><span>至</span><input type="date" aria-label="结束日期" value={filters.to} onChange={(event) => filter('to', event.target.value)}/></div>{Object.values(filters).some(Boolean) && <button className="clear-filters" onClick={() => { setFilters(blankFilters); setPageNumber(1); }}>重置</button>}</div>
            {loading ? <div className="loading"><LoaderCircle className="spin" size={19}/> 正在读取评价…</div> : reviews.length ? <div className="review-table"><div className="table-head"><span>评价内容</span><span>评价对象</span><span>满意度</span><span>提交时间</span><span>处理状态</span><span/></div>{reviews.map((review) => <button className="review-row" key={review.id} onClick={() => setSelected(review)}><div className="review-preview"><span className="anonymous-avatar"><UserIcon/></span><div><div className="review-meta"><strong>匿名顾客</strong><small>{review.tags.slice(0, 2).join(' · ') || '一份真实的声音'}</small></div><p>{review.content}</p></div></div><div className="target-cell">{review.target === 'store' ? <Store size={14}/> : <Users size={14}/>}<span>{review.staff_name || '门店整体'}</span></div><Stars value={review.rating}/><time>{dateText(review.created_at)}</time><span className={`status-badge status-${review.status}`}><i/>{statusText[review.status]}</span><ChevronRight size={15}/></button>)}</div> : <Empty icon={<Inbox size={28}/>} title={Object.values(filters).some(Boolean) ? '没有找到符合条件的评价' : '意见箱已准备好，等待第一份心声'}>{Object.values(filters).some(Boolean) ? '试试调整筛选条件或搜索词。' : <><span>把评价二维码放在店里，邀请顾客留下真实感受。</span><button className="button secondary small-button" onClick={() => setPage('qr')}>查看评价二维码 <ArrowRight size={14}/></button></>}</Empty>}
            <div className="pagination"><span>共 {total} 条 · 每页 20 条</span><div><button className="icon-button" disabled={pageNumber <= 1} onClick={() => setPageNumber((n) => n - 1)} aria-label="上一页"><ChevronLeft size={16}/></button><span>{pageNumber} / {Math.max(1, Math.ceil(total / 20))}</span><button className="icon-button" disabled={pageNumber >= Math.ceil(total / 20)} onClick={() => setPageNumber((n) => n + 1)} aria-label="下一页"><ChevronRight size={16}/></button></div></div>
          </section>
        </>}
        {page === 'staff' && <StaffManager key={refresh} notify={setMessage} onError={handleError}/>}
        {page === 'qr' && <QrPanel key={refresh} notify={setMessage} onError={handleError}/>}
        {page === 'settings' && <AccountSettings key={refresh} username={session.username} notify={setMessage} onError={handleError} onChanged={() => { setSession(null); setCsrf(''); }}/>}
        <footer className="admin-footer">延安梵玛西 · 管理工作台<span>认真倾听，用心回应。</span></footer>
      </main>
    </div>
    {selected && <ReviewDialog review={selected} onClose={() => setSelected(null)} onSaved={() => { setSelected(null); setRefresh((n) => n + 1); setMessage('评价处理记录已保存'); }} onError={handleError}/>}
  </div>;
}
function UserIcon() { return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="3"/><path d="M5 20v-2a7 7 0 0 1 14 0v2"/></svg>; }
function StatCard({ label, value, hint, icon, accent = false }: { label: string; value: string | number; hint: string; icon: React.ReactNode; accent?: boolean }) {
  return <div className={`stat-card ${accent ? 'stat-accent' : ''}`}><div><span>{label}</span><i>{icon}</i></div><strong>{value}</strong><p>{hint}</p></div>;
}
function TrendChart({ stats }: { stats: Stats | null }) {
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  const days = Array.from({ length: 7 }, (_, index) => { const day = new Date(today); day.setDate(day.getDate() - 6 + index); const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`; return { label: `${day.getMonth() + 1}/${day.getDate()}`, count: stats?.trend.find((d) => d.day === key)?.count || 0 }; });
  const max = Math.max(4, ...days.map((d) => d.count));
  return <div className="trend-chart"><div className="trend-scale"><span>{max}</span><span>{Math.round(max / 2)}</span><span>0</span></div><div className="trend-plot"><div className="trend-grid"/>{days.map((day) => <div className="trend-column" key={day.label}><span className="trend-bar-wrap"><i style={{ height: `${day.count / max * 90}%` }}><small>{day.count || ''}</small></i></span><span>{day.label}</span></div>)}</div></div>;
}
function ReviewDialog({ review, onClose, onSaved, onError }: { review: Review; onClose: () => void; onSaved: () => void; onError: (err: unknown) => void }) {
  const [status, setStatus] = useState<ReviewStatus>(review.status); const [note, setNote] = useState(review.note); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await patch(`/admin/reviews/${review.id}`, { status, note }); onSaved(); }
    catch (err) { setError((err as Error).message); if (err instanceof ApiError && err.status === 401) onError(err); } finally { setBusy(false); }
  }
  return <Dialog title="顾客的声音" onClose={onClose} wide><div className="detail-meta"><span className="anonymous-avatar"><UserIcon/></span><div><strong>匿名顾客</strong><small>{dateText(review.created_at)} · 北京时间</small></div><Stars value={review.rating}/></div><div className="detail-target"><span>评价对象</span><strong>{review.staff_name || '门店整体'}</strong><span className={`status-badge status-${review.status}`}><i/>{statusText[review.status]}</span></div><p className="detail-content">{review.content}</p><div className="detail-tags">{review.tags.map((tag) => <span key={tag}>{tag}</span>)}</div><form className="detail-form" onSubmit={save}><h3>处理记录 <LockKeyhole size={13}/><small>仅管理员可见</small></h3><label className="form-label">处理状态<select value={status} onChange={(event) => setStatus(event.target.value as ReviewStatus)}>{Object.entries(statusText).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="form-label">内部备注<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} rows={4} placeholder="记录问题原因、跟进安排或改进措施…"/></label>{error && <p className="error-message" role="alert">{error}</p>}<div className="dialog-actions"><button type="button" className="button secondary" onClick={onClose}>关闭</button><button className="button primary" disabled={busy}>{busy ? '正在保存…' : '保存处理记录'}<Check size={16}/></button></div></form></Dialog>;
}
type PanelProps = { notify: (text: string) => void; onError: (err: unknown) => void };
function StaffManager({ notify, onError }: PanelProps) {
  const [staff, setStaff] = useState<Staff[]>([]); const [name, setName] = useState(''); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true); const [loaded, setLoaded] = useState(false);
  async function load() { try { setStaff(await api<Staff[]>('/admin/staff')); setLoaded(true); } catch (err) { onError(err); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, []);
  async function add(event: FormEvent) { event.preventDefault(); setBusy(true); try { await post('/admin/staff', { name }); setName(''); await load(); notify('员工已添加，顾客现在可以选择该员工'); } catch (err) { onError(err); } finally { setBusy(false); } }
  async function toggle(person: Staff) { setBusy(true); try { await patch(`/admin/staff/${person.id}`, { active: !person.active }); await load(); notify(person.active ? '已停用，历史评价仍然保留' : '员工已重新启用'); } catch (err) { onError(err); } finally { setBusy(false); } }
  return <><PanelHeading eyebrow="THE PEOPLE BEHIND THE EXPERIENCE" title="员工管理" description="维护顾客可以选择的员工名单，听见更具体的建议。"/><section className="management-card"><div className="section-heading"><h2>添加员工</h2><span>无需为员工创建登录账号</span></div><form className="add-staff" onSubmit={add}><input aria-label="员工姓名或工作昵称" value={name} onChange={(event) => setName(event.target.value)} required maxLength={30} placeholder="输入员工姓名或工作昵称"/><button className="button primary" disabled={busy || !loaded}><Plus size={16}/> 添加员工</button></form><p className="field-hint">没有启用员工时，意见箱只显示“门店整体”。请使用顾客熟悉的称呼。</p></section><section className="management-card"><div className="section-heading"><h2>员工名单 <span className="count-badge">{staff.length}</span></h2><span>{staff.filter((s) => s.active).length} 位已启用</span></div>{loading ? <div className="loading">正在读取员工名单…</div> : !staff.length ? <Empty title="还没有添加员工" icon={<Users size={27}/>}>添加后，顾客可在意见箱中选择评价员工。</Empty> : <div className="staff-list">{staff.map((person) => <div className="staff-row" key={person.id}><span className={`staff-avatar ${person.active ? '' : 'inactive'}`}>{person.name.slice(0, 1)}</span><strong>{person.name}</strong><span className={`status-badge ${person.active ? 'status-done' : 'status-muted'}`}>{person.active ? '已启用' : '已停用'}</span><button className="button secondary small-button" disabled={busy} onClick={() => toggle(person)}>{person.active ? '停用' : '重新启用'}</button></div>)}</div>}<p className="management-note"><ShieldCheck size={14}/> 停用后，顾客将无法选择该员工；已有评价和处理记录会继续保留。</p></section></>;
}
function PanelHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}<span>。</span></h1><p>{description}</p></div></div>;
}
function QrPanel({ notify, onError }: PanelProps) {
  const [site, setSite] = useState<{ url: string; storeName: string } | null>(null);
  useEffect(() => { api<{ url: string; storeName: string }>('/admin/site').then(setSite).catch(onError); }, []);
  async function copy() { if (!site) return; try { await navigator.clipboard.writeText(`${site.url}/`); notify('评价链接已复制'); } catch { notify('无法自动复制，请长按下方链接手动复制'); } }
  return <><PanelHeading eyebrow="A LITTLE CODE. A LOT OF HONEST VOICES." title="把意见箱，放在顾客身边" description="下载或打印门店二维码，顾客用微信、相机扫码即可匿名反馈。"/><div className="qr-layout"><section className="qr-print-card" id="qr-print"><Brand/><div className="eyebrow">YOUR VOICE MATTERS</div><h2>有些话，<br/>可以悄悄对我们说。</h2><p>表扬也好，吐槽也好，<br/>你的真实感受，我们都认真倾听。</p>{site ? <img src="/api/admin/qrcode.png" alt="扫码进入延安梵玛西匿名意见箱" width="220" height="220"/> : <div className="loading">正在生成二维码…</div>}<strong className="qr-caption">扫一扫，留下你的心声</strong><span className="qr-privacy"><LockKeyhole size={13}/> 无需登录 · 匿名提交 · 仅管理员可见</span><Flower className="qr-flower"/></section><div className="qr-instructions"><section className="management-card"><h2>一个入口，持续倾听</h2><ol><li><span>01</span><div><strong>下载二维码或打印立牌</strong><p>放在前台、等候区，或服务结束时邀请顾客扫码。</p></div></li><li><span>02</span><div><strong>顾客扫码，匿名表达</strong><p>无需登录，不用留下姓名和手机号。</p></div></li><li><span>03</span><div><strong>后台查看，及时改进</strong><p>只有管理员能看到评价，支持备注与处理状态。</p></div></li></ol><div className="qr-buttons"><a className="button primary" href="/api/admin/qrcode.png?download=1"><Download size={16}/> 下载二维码</a><button className="button secondary" onClick={() => window.print()} disabled={!site}><Printer size={16}/> 打印立牌</button></div></section><section className="management-card"><h3>评价链接</h3><p className="field-hint">更新员工名单不影响二维码，无需重新打印。</p><div className="share-link"><code>{site ? `${site.url}/` : '正在读取…'}</code><button className="button secondary small-button" disabled={!site} onClick={copy}>复制链接</button></div>{site?.url.includes('localhost') || site?.url.includes('127.0.0.1') ? <p className="local-notice">当前为本机预览链接。正式上线后，请使用绑定域名的二维码再打印，手机无法通过这个本机地址访问。</p> : <p className="field-hint">打印前请用手机试扫一次，确认链接能够正常打开。</p>}</section></div></div></>;
}
function AccountSettings({ username, notify, onError, onChanged }: PanelProps & { username: string; onChanged: () => void }) {
  const [currentPassword, setCurrent] = useState(''); const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (password !== confirm) return setError('两次输入的新密码不一致');
    setBusy(true);
    try { await post('/admin/password', { currentPassword, password }); notify('密码已更新，请使用新密码重新登录'); onChanged(); }
    catch (err) { setError((err as Error).message); if (err instanceof ApiError && err.status === 401) onError(err); } finally { setBusy(false); }
  }
  return <><PanelHeading eyebrow="KEEP EVERY VOICE PROTECTED" title="账号设置" description="妥善管理登录凭证，保护顾客的信任。"/><section className="management-card settings-card"><div className="section-heading"><h2>修改登录密码</h2><span>当前账号：{username}</span></div><form onSubmit={submit}><label className="form-label">原密码<input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} required maxLength={128}/></label><label className="form-label">新密码<input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={12} maxLength={128} required placeholder="至少 12 位，建议混合字母、数字和符号"/></label><label className="form-label">确认新密码<input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={12} maxLength={128} required/></label>{error && <p className="error-message" role="alert">{error}</p>}<button className="button primary" disabled={busy}>{busy ? '正在更新…' : '更新密码'}<LockKeyhole size={15}/></button></form><p className="management-note"><ShieldCheck size={14}/> 修改后，所有已登录的设备都会退出，需要使用新密码重新登录。</p></section></>;
}
