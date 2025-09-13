import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function rawBaseFromCatalog(catalogUrl) {
  try {
    const u = new URL(catalogUrl);
    const noQuery = new URL(u.origin + u.pathname);
    const parts = noQuery.pathname.split('/');
    parts.pop();
    const basePath = parts.join('/') + '/';
    return noQuery.origin + basePath;
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

export async function GET() {
  const out = {
    CATALOG_URL: process.env.CATALOG_URL,
    MODULES_GROUPS: (process.env.MODULES_GROUPS || '').split(',').map(s => s.trim()).filter(Boolean),
    loaded: [],
    errors: [],
    catalog_ok: false
  };
  try {
    const ts = Date.now();
    const catUrl = out.CATALOG_URL + (out.CATALOG_URL.includes('?') ? `&_ts=${ts}` : `?_ts=${ts}`);
    const catalog = await fetch(catUrl, { cache: 'no-store' }).then(r => r.json());
    out.catalog_ok = !!catalog?.groups?.length;
    const base = rawBaseFromCatalog(out.CATALOG_URL);

    const targets = (catalog.groups || []).filter(g => (out.MODULES_GROUPS.length ? out.MODULES_GROUPS.includes(g.id) : true));
    for (const g of targets) {
      const fileUrl = toAbsoluteUrl(g.path, base);
      try {
        const url = fileUrl + (fileUrl.includes('?') ? `&_ts=${ts}` : `?_ts=${ts}`);
        const json = await fetch(url, { cache: 'no-store' }).then(r => r.json());
        const count = Array.isArray(json?.modules) ? json.modules.length : 0;
        out.loaded.push({ id: g.id, path: g.path, resolved: fileUrl, count });
      } catch (e) {
        out.errors.push(`load fail: ${fileUrl} :: ${String(e?.message || e)}`);
      }
    }
  } catch (e) {
    out.errors.push(`catalog fail: ${String(e?.message || e)}`);
  }
  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } });
}
