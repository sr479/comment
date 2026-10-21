import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import Public from './Public';
import './styles.css';
import './readability.css';
const Admin = lazy(() => import('./Admin'));
createRoot(document.getElementById('root')!).render(<StrictMode><Suspense fallback={<div className="loading">正在打开工作台…</div>}>{location.pathname.startsWith('/admin') ? <Admin/> : <Public/>}</Suspense></StrictMode>);
