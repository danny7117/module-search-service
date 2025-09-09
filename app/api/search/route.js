import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';  // 每次打都不要用舊快取
export const runtime = 'nodejs';         // 用 Node runtime，避免 Edge 某些 API 不相容

const norm = (s) => (s || '').toString().toLowerCase();

function pickGroups(catalog, groupsEnv) {
  if (!groupsEnv) return catalog.groups || [];
  const want = new Set(groupsEnv.split(',').map(s => s.trim()).filter(Boolean));
  return (catalog.groups || []).filter(g => want.has(g.id));
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const q = norm(searchParams.get('q'));
    const limitRaw = parseInt(searchParams.get('limit') || '20', 10);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, limitRaw)) : 20;

    const catalogUrl = process.env.CATALOG_URL;
    if (!catalogUrl) {
      return NextResponse.json({ items: [], error: 'CATALOG_URL not set' }, { status: 500 });
    }

    // 加 _ts 避免 CDN 舊快取
    const ts = searchParams.get('_ts') || Date.now();
    const catUrl = catalogUrl + (catalogUrl.includes('?') ? `&_ts=${ts}` : `?_ts=${ts}`);

    const catRes = await fetch(catUrl, { cache: 'no-store' });
    if (!catRes.ok) throw new Error(`catalog fetch failed: ${catRes.status}`);
    const catalog = await catRes.json();

    // 以 catalog.json 的目錄當 base，去抓 groups 裡每個 path 指向的 *_modules_all.json
    const base = new URL('.', catalogUrl);
    const groups = pickGroups(catalog, process.env.MODULES_GROUPS);
    const allModules = [];

    for (const g of groups) {
      try {
        const url = new URL(g.path, base);
        const urlStr = url.toString() + (url.toString().includes('?') ? `&_ts=${ts}` : `?_ts=${ts}`);
        const r = await fetch(urlStr, { cache: 'no-store' });
        if (!r.ok) continue;
        const data = await r.json();
        const arr = Array.isArray(data?.modules) ? data.modules : [];
        for (const m of arr) allModules.push(m);
      } catch {}
    }

    let items = allModules;
    if (q) {
      items = allModules.filter((m) => {
        const id = norm(m.id);
        const name = norm(m.name);
        const tags = Array.isArray(m.tags) ? m.tags.map(norm) : [];
        return id.includes(q) || name.includes(q) || tags.some(t => t.includes(q));
      });
    }

    return NextResponse.json(
      { items: items.slice(0, limit) },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    return NextResponse.json(
      { items: [], error: String(err?.message || err) },
      { status: 500 }
    );
  }
}
