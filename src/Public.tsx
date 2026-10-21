import { useEffect, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, Check, CheckCheck, ChevronDown, Heart, LockKeyhole, MessageCircle, ShieldCheck, Sparkles, Store, UserRound } from 'lucide-react';
import { api, post, type FormInfo } from './api';
import { Brand, Dialog, Face, Flower } from './components';

const ratings = ['很不满意', '不太满意', '一般', '满意', '非常满意'];
export function PrivacyContent() {
  return <div className="privacy-content">
    <div className="privacy-lead"><ShieldCheck size={26}/><p>放心表达，认真倾听。</p></div>
    <h3>无需提供身份信息</h3><p>提交评价不需要登录，不要求填写姓名、手机号、微信号或订单信息。我们不会主动获取您的位置或通讯录。</p>
    <h3>仅管理员可见</h3><p>评价内容、所选员工和满意度仅供门店管理员查看和改进服务，不会在网站公开。请避免在正文中填写自己或他人的姓名、联系方式等隐私信息。</p>
    <h3>信息如何保存</h3><p>评价内容和提交时间保存在门店的服务数据库中。应用不将网络 IP 地址存入评价记录；为减少恶意提交，会在短时间内按网络来源限制请求。服务器或网络服务商可能按其规则处理必要的连接日志。</p>
    <h3>关于反馈处理</h3><p>由于没有收集联系方式，门店无法直接回复您。需要即时处理或联系回复的问题，请通过您平时与门店沟通的渠道联系工作人员。</p>
    <p className="muted">请基于真实体验、理性表达。每一条反馈都会成为改进的参考。</p>
  </div>;
}
export default function Public() {
  const [info, setInfo] = useState<FormInfo | null>(null);
  const [loadError, setLoadError] = useState('');
  const [target, setTarget] = useState<'store' | 'staff'>('store');
  const [staffId, setStaffId] = useState('');
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [content, setContent] = useState('');
  const [website, setWebsite] = useState('');
  const [privacy, setPrivacy] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState('');
  const [submissionId, setSubmissionId] = useState(() => crypto.randomUUID());
  async function load() {
    setLoadError('');
    try { setInfo(await api<FormInfo>('/form')); }
    catch (err) { setLoadError((err as Error).message); }
  }
  useEffect(() => { void load(); }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy || !info) return;
    setError('');
    if (target === 'staff' && !staffId) return setError('请选择您想评价的员工');
    if (!rating) return setError('请选择本次体验的满意度');
    if (content.trim().length < 5) return setError('请至少写下 5 个字，帮助我们了解您的感受');
    setBusy(true);
    try {
      // 每次发送前更新表单凭证；网络重试保留同一幂等键，避免重复入库。
      let token = info.token;
      if (Date.now() - Number(token.split('.')[0]) > 90 * 60 * 1000) token = (await api<FormInfo>('/form')).token;
      const result = await post<{ id: string }>('/reviews', { submissionId, token, target, staffId: target === 'staff' ? Number(staffId) : null, rating, tags, content, website });
      setReceipt(result.id); window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) { setError((err as Error).message); await load(); }
    finally { setBusy(false); }
  }
  const privacyPage = location.pathname === '/privacy';
  return <div className="public-page">
    <header className="public-header"><Brand/><span className="private-pill"><LockKeyhole size={12}/> 匿名 · 私密 · 用心倾听</span></header>
    {privacyPage ? <main className="privacy-page"><a className="text-link" href="/"><ArrowLeft size={16}/> 返回意见箱</a><h1>关于匿名与隐私</h1><PrivacyContent/></main> : <main className={`public-main ${receipt ? 'has-success' : ''}`}>
      <aside className="public-story">
        <div className="eyebrow"><span/> 延安梵玛西 · 匿名意见箱</div>
        <h1>你的感受，<br/>我们<span>认真倾听</span>。</h1>
        <p className="hero-copy">好的体验，或是有待改进的地方，<br/>都值得被听见。把想说的话，留在这里。</p>
        <div className="story-art"><Flower className="art-flower"/><div className="art-orbit"/><div className="art-message"><span>每一个声音</span><strong>都让我们变得更好</strong><Heart size={21} strokeWidth={1.2}/></div><span className="art-spark"><Sparkles size={23} strokeWidth={1}/></span></div>
        <div className="story-foot"><span className="small-line"/><p>因为在意，所以倾听。<br/><span>感谢你，帮助我们把服务做得更好。</span></p></div>
        <a href="#feedback" className="mobile-jump">留下你的感受 <ArrowDown size={14}/></a>
      </aside>
      <section className="feedback-panel" id="feedback">
        {receipt ? <div className="success-panel"><span className="success-icon"><CheckCheck size={36} strokeWidth={1.6}/></span><div className="eyebrow">THANK YOU FOR YOUR VOICE</div><h2>你的心声，我们收到了。</h2><p>谢谢你的坦诚与信任。<br/>每一条反馈，我们都会认真阅读。</p><div className="receipt"><ShieldCheck size={17}/><span>反馈已匿名送达，仅管理员可见</span></div><small className="receipt-code">回执编号 {receipt.slice(0, 8).toUpperCase()}</small><button className="button primary" onClick={() => { setReceipt(''); setContent(''); setRating(0); setTags([]); setStaffId(''); setTarget('store'); setSubmissionId(crypto.randomUUID()); void load(); }}>返回意见箱 <ArrowRight size={17}/></button><p className="success-note">愿每一次相遇，都有更好的体验。</p></div> : <>
          <div className="form-heading"><span className="heading-icon"><MessageCircle size={21} strokeWidth={1.6}/></span><div><h2>想说的话，放心说</h2><p>大约 1 分钟，让我们更懂你</p></div><span className="form-decoration">✳</span></div>
          <div className="privacy-banner"><ShieldCheck size={18}/><p><strong>不记名，也不需要联系方式</strong><span>你的反馈仅管理员可见，请放心表达。</span></p></div>
          {loadError ? <div className="load-error" role="alert"><p>{loadError}</p><button className="button secondary" onClick={load}>重新加载</button></div> : !info ? <div className="loading" role="status">正在准备你的意见箱…</div> : <form onSubmit={submit} noValidate>
            <fieldset className="form-section"><legend><span className="step">01</span> 你想对谁说？</legend>
              <div className="target-switch" role="group" aria-label="评价对象"><button type="button" className={target === 'store' ? 'active' : ''} onClick={() => setTarget('store')}><Store size={18}/> 门店整体 {target === 'store' && <Check size={14}/>}</button>{info.staff.length > 0 && <button type="button" className={target === 'staff' ? 'active' : ''} onClick={() => setTarget('staff')}><UserRound size={18}/> 某位员工 {target === 'staff' && <Check size={14}/>}</button>}</div>
              {target === 'staff' && <div className="select-wrap"><select aria-label="选择员工" value={staffId} onChange={(event) => setStaffId(event.target.value)}><option value="">请选择员工</option>{info.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select><ChevronDown size={15}/></div>}
            </fieldset>
            <fieldset className="form-section"><legend><span className="step">02</span> 这次体验，感觉怎么样？<span className="required">必选</span></legend><div className="rating-options" role="radiogroup" aria-label="满意度">{ratings.map((label, index) => <button type="button" key={label} role="radio" aria-checked={rating === index + 1} onClick={() => setRating(index + 1)} className={`rating-option ${rating === index + 1 ? 'active' : ''}`}><Face value={index + 1} selected={rating === index + 1}/><span>{label}</span></button>)}</div></fieldset>
            <fieldset className="form-section content-section"><legend><span className="step">03</span> 留下你的真实感受<span className="required">必填</span></legend><p className="field-hint">表扬、吐槽或建议，任何感受都欢迎。</p><div className="textarea-wrap"><textarea aria-label="评价内容" value={content} onChange={(event) => setContent(event.target.value)} maxLength={2000} minLength={5} placeholder="有哪些让你印象深刻的地方？&#10;或者，你希望我们做出哪些改变？" rows={5}/><span className="char-count">{content.length} / 2000</span></div>
              <p className="tags-label">关于哪些方面？<span>选填，可多选</span></p><div className="tag-options">{info.tags.map((tag) => <button type="button" key={tag} aria-pressed={tags.includes(tag)} className={tags.includes(tag) ? 'active' : ''} onClick={() => setTags((current) => current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag])}>{tags.includes(tag) && <Check size={12}/>} {tag}</button>)}</div>
            </fieldset>
            <div className="honey" aria-hidden="true"><label>Website<input value={website} onChange={(event) => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off"/></label></div>
            {error && <p className="error-message" role="alert">{error}</p>}
            <button className="button primary submit-button" disabled={busy}><LockKeyhole size={16}/><span>{busy ? '正在匿名送达…' : '匿名提交'}</span><ArrowRight size={18}/></button>
            <p className="submit-caption">提交即表示你已了解 <button type="button" onClick={() => setPrivacy(true)}>匿名与隐私说明</button></p>
          </form>}
        </>}
      </section>
    </main>}
    <footer className="public-footer"><span>用心对待每一份信任 <Heart size={11}/></span><div><button onClick={() => setPrivacy(true)}>匿名与隐私</button><i/> <a href="/admin">管理入口</a>{info?.icpNumber && <><i/><a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer">{info.icpNumber}</a></>}</div></footer>
    {privacy && <Dialog title="关于匿名与隐私" onClose={() => setPrivacy(false)}><PrivacyContent/><button className="button primary full-width" onClick={() => setPrivacy(false)}>我知道了</button></Dialog>}
  </div>;
}
