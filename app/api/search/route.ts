import { NextResponse } from 'next/server';
type Group = { id: string; path: string };
type Catalog = { groups: Group[] };
type Mod = { id?: string; name?: string; tags?: string[]; [k: string]: any };

const UA = 'ModuleSearch/1.0';
async function j<T>(url: string) {
  const r = await fetch(url, { cache: 'no-store', headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`fetch ${url} ${r.status}`);
  return r.json() as Promise<T>;
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const q = (u.searchParams.get('q') || '').toLowerCase().trim();
  const limit = Number(u.searchParams.get('limit') || 20);
  const indexUrl = process.env.CATALOG_URL;
  if (!indexUrl) return NextResponse.json({ items: [], error: 'CATALOG_URL not set' }, { status: 500 });

  const catalog = await j<Catalog>(indexUrl);
  const idx = new URL(indexUrl); idx.search = '';
  const base = idx.toString().replace(/\/[^/]+$/, '/');

  const all: Mod[] = [];
  for (const g of catalog.groups || []) {
    const url = g.path.startsWith('http') ? g.path : base + g.path;
    try {
      const gj = await j<any>(url);
      const arr: Mod[] = Array.isArray(gj) ? gj : Array.isArray(gj?.modules) ? gj.modules : [];
      all.push(...arr);
    } catch {}
  }

  const items = (q
    ? all.filter(m => {
        const s = `${m.id || ''} ${m.name || ''} ${(m.tags || []).join(' ')}`.toLowerCase();
        return s.includes(q);
      })
    : all).slice(0, isFinite(limit) ? limit : 20);

  return NextResponse.json({ items }, { headers: { 'x-source': 'module-search-service' } });
}
