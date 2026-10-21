export type Staff = { id: number; name: string; active?: number };
export type ReviewStatus = 'new' | 'following' | 'done';
export type Review = {
  id: string; target: 'store' | 'staff'; staff_name: string | null; rating: number;
  tags: string[]; content: string; status: ReviewStatus; note: string; created_at: string;
};
export type Stats = {
  total: number; unread: number; following: number; today: number; average: number | null; low: number;
  distribution: { rating: number; count: number }[]; trend: { day: string; count: number }[];
};
export type FormInfo = { storeName: string; staff: Staff[]; tags: string[]; token: string; icpNumber: string };
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
let csrf = '';
export const setCsrf = (value: string) => { csrf = value; };
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set('Content-Type', 'application/json');
  if (csrf && options.method && options.method !== 'GET') headers.set('X-CSRF-Token', csrf);
  let response: Response;
  try { response = await fetch(`/api${path}`, { ...options, headers, credentials: 'same-origin' }); }
  catch { throw new ApiError('网络连接失败，请检查网络后重试', 0); }
  const data = await response.json().catch(() => ({ error: '服务暂时不可用，请稍后重试' }));
  if (!response.ok) throw new ApiError(data.error || '请求失败，请稍后重试', response.status);
  return data;
}
export const post = <T>(path: string, data: unknown = {}) => api<T>(path, { method: 'POST', body: JSON.stringify(data) });
export const patch = <T>(path: string, data: unknown) => api<T>(path, { method: 'PATCH', body: JSON.stringify(data) });
export const dateText = (value: string) => new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(value));
export const statusText = { new: '待查看', following: '跟进中', done: '已处理' };
