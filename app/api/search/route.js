import { NextResponse } from 'next/server';

export async function GET() {
  const url = process.env.CATALOG_URL;
  const groups = (process.env.MODULES_GROUPS || '').split(',').map(s => s.trim()).filter(Boolean);
  const out = { CATALOG_URL: url, MODULES_GROUPS: groups, loaded: [], errors: [] };

  try {
    const res = await fetch(url, { next: { revalidate: 0 } });
    const catalog = await res.json();
    out.catalog_ok = !!catalog?.groups?.length;

    const base = url.replace(/\/[^/]+$/, '/'); // 指向 /modules/
    for (const id of groups) {
      const g = catalog.groups.find(x => x.id === id);
      if (!g) { out.errors.push(`group not found: ${id}`); continue; }
      const fileUrl = base + g.path;
      const r = await fetch(fileUrl, { next: { revalidate: 0 } });
      if (!r.ok) { out.errors.push(`fetch fail: ${fileUrl} (${r.status})`); continue; }
      const json = await r.json();
      out.loaded.push({ id, path: g.path, count: (json.modules || []).length });
    }
  } catch (e) {
    out.errors.push(String(e));
  }

  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' }});
}
