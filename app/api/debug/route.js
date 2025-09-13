// module-search-service/app/api/debug/route.js
import { NextResponse } from 'next/server';

function sanitizeJson(text) {
  return text
    .replace(/^\uFEFF/, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/,\s*([}\]])/g, '$1');
}

async function fetchJson(url) {
  const res = await fetch(url, { next: { revalidate: 0 } });
  const raw = await res.text();
  try { return JSON.parse(raw); }
  catch { return JSON.parse(sanitizeJson(raw)); }
}

export async function GET(req) {
  const CATALOG_URL = process.env.CATALOG_URL || '';
  const GROUPS_ENV = (process.env.MODULES_GROUPS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const out = {
    CATALOG_URL,
    MODULES_GROUPS: GROUPS_ENV,
    loaded: [],
    errors: [],
    catalog_ok: false,
  };

  try {
    const base = CATALOG_URL.replace(/\/modules\/catalog\.json.*$/i, '/');
    const catalog = await fetchJson(CATALOG_URL);
    out.catalog_ok = !!(catalog && catalog.groups && catalog.groups.length);
    const groups = (catalog.groups || []).filter(g => !GROUPS_ENV.length || GROUPS_ENV.includes(g.id));

    for (const g of groups) {
      const url = new URL(g.path, base).toString();
      try {
        const data = await fetchJson(url);
        const count = Array.isArray(data.modules) ? data.modules.length : 0;
        out.loaded.push({ id: g.id, path: g.path, url, count });
      } catch (e) {
        out.errors.push(`load fail: ${url} ${String(e && e.message || e)}`);
      }
    }
  } catch (e) {
    out.errors.push(String(e && e.message || e));
  }

  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } });
}
