import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const norm = (s) => (s || '').toString().toLowerCase();
const nowTs = () => Date.now();

function rawBaseFromCatalog(catalogUrl) {
  try {
    const u = new URL(catalogUrl);
    // 去掉檔名與 query，保留到包含 /modules/ 的目錄
    const noQuery = new URL(u.origin + u.pathname);
    const parts = noQuery.pathname.split('/');
    parts.pop(); // 移除 catalog.json
    const basePath = parts.join('/') + '/';
    return noQuery.origin + basePath; // .../modules/
  } catch {
    return catalogUrl.replace(/catalog\.json.*/i, '');
  }
}

function toAbsoluteUrl(pathOrUrl, base) {
  if (!pathOrUrl) return '';
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const clean = pathOrUrl.replace(/^\.?\/*/, '');
  return new URL(clean, base).href;
}

async function fetchJson(url, timeoutMs = 2000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(id);
  }
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = norm(searchParams.get('q'));
  const limitRaw = parseInt(searchParams.get('limit') || '20', 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, limitRaw)) : 20;

  const CATALOG_URL = process.env.CATALOG_URL;
  const GROUPS = (process.env.MODULES_GROUPS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (!CATALOG_URL) {
    return NextResponse.json({ items: [], error: 'CATALOG_URL not set' }, { status: 500 });
  }

  const timeoutMs = parseInt(process.env.CATALOG_TIMEOUT_MS || '2000', 10);
  const ts = searchParams.get('_ts') || nowTs();
  try {
    const catUrl = CATALOG_URL + (CATALOG_URL.includes('?') ? `&_ts=${ts}` : `?_ts=${ts}`);
    const catalog = await fetchJson(catUrl, timeoutMs);
    const base = rawBaseFromCatalog(CATALOG_URL);

    const selectedGroups = (catalog.groups || []).filter(g => (GROUPS.length ? GROUPS.includes(g.id) : true));
    const allModules = [];

    for (const g of selectedGroups) {
      const fileUrl = toAbsoluteUrl(g.path, base);
      try {
        const urlWithTs = fileUrl + (fileUrl.includes('?') ? `&_ts=${ts}` : `?_ts=${ts}`);
        const data = await fetchJson(urlWithTs, timeoutMs);
        const arr = Array.isArray(data?.modules) ? data.modules : [];
        for (const m of arr) allModules.push(m);
      } catch {
        // 忽略單一 group 失敗，保持韌性
      }
    }

    let items = allModules;
    if (q) {
      items = items.filter(m => {
        const id = norm(m.id);
        const name = norm(m.name);
        const tags = Array.isArray(m.tags) ? m.tags.map(norm) : [];
        return id.includes(q) || name.includes(q) || tags.some(t => t.includes(q));
      });
    }
    return NextResponse.json({ items: items.slice(0, limit) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ items: [], error: String(e?.message || e) }, { status: 500 });
  }
}
