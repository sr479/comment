import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Brand({ light = false }: { light?: boolean }) {
  return <a className={`brand ${light ? 'brand-light' : ''}`} href="/" aria-label="延安梵玛西首页">
    <span className="brand-mark"><svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 37C7 30 8 15 16 14c7-2 8 9 8 9s1-11 8-9c8 1 9 16-8 23Z"/><path d="M24 36V23"/></svg></span>
    <span><strong>梵玛西<span className="brand-city">延安</span></strong><small>让美好，从倾听开始</small></span>
  </a>;
}
export function Face({ value, selected = false }: { value: number; selected?: boolean }) {
  return <svg width="34" height="34" viewBox="0 0 40 40" fill="none" aria-hidden="true" className={selected ? 'face selected' : 'face'}>
    <circle cx="20" cy="20" r="17" stroke="currentColor" strokeWidth="1.6"/>
    {value === 5 ? <><path d="m11 16 3-2 3 2m6 0 3-2 3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><path d="M12 23h16c-1 10-15 10-16 0Z" fill="currentColor" opacity=".18"/><path d="M12 23c1 10 15 10 16 0H12Z" stroke="currentColor" strokeWidth="1.5"/></> : <><circle cx="14" cy="16" r="1.5" fill="currentColor"/><circle cx="26" cy="16" r="1.5" fill="currentColor"/><path d={value === 1 ? 'M13 29q7-10 14 0' : value === 2 ? 'M14 27q6-5 12 0' : value === 3 ? 'M14 25h12' : 'M13 23q7 10 14 0'} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></>}
  </svg>;
}
export function Flower({ className = '' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 360 360" fill="none" aria-hidden="true"><g stroke="currentColor" strokeWidth="1.1">
    {[0, 45, 90, 135, 180, 225, 270, 315].map((n) => <ellipse key={n} cx="180" cy="120" rx="44" ry="82" transform={`rotate(${n} 180 180)`}/>)}
    <circle cx="180" cy="180" r="26"/><circle cx="180" cy="180" r="11"/>
  </g></svg>;
}
export function Dialog({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current; dialog?.showModal();
    const before = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { dialog?.close(); document.body.style.overflow = before; };
  }, []);
  return <dialog ref={ref} className={`dialog ${wide ? 'dialog-wide' : ''}`} onCancel={onClose} onClick={(event) => { if (event.target === ref.current) onClose(); }}>
    <div className="dialog-header"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="关闭"><X size={20}/></button></div>
    {children}
  </dialog>;
}
export function Empty({ title, children, icon }: { title: string; children?: ReactNode; icon: ReactNode }) {
  return <div className="empty"><div className="empty-icon">{icon}</div><h3>{title}</h3>{children && <p>{children}</p>}</div>;
}
