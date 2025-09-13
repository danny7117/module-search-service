// module-search-service/app/api/search/route.js
import { NextResponse } from 'next/server';

/** 清掉 BOM、註解、尾逗號，避免 JSON 解析失敗 */
function sanitizeJson(text) {
  return text
    .replace(/^\uFEFF/, '')            // UTF-8 BOM
    .replace(/\/\/.*$/gm, '')          // // 單行註解
    .replace(/\/\*[\s\S]*?\*\//g, '')  // /* 多行註解 */
    .replace(/,\s*([}\]])/g, '$1');    // 尾逗號
}

async function fetchJson(url) {
  const res = await fetch(url, { next: { revalidate: 0 } });
  const raw = await res.text();
  try {
    return JSON.parse(raw);
  } catch {
    return JSON.parse(sanitizeJson(raw));
  }
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').toLowerCase().trim();
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);

  const CATALOG_URL = process.env.CATALOG_URL || '';
  const GROUPS_ENV = (process.env.MODULES_GROUPS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const errors = [];
  const items = [];

  if (!CATALOG_URL) {
    return NextResponse.json({ items: [], errors: ['CATALOG_URL not set'] }, { headers: { 'Cache-Control': 'no-store' } });
  }

  try {
    // 1) 基底用 …/main/，避免變成 modules/modules
    const base = CATALOG_URL.replace(/\/modules\/catalog\.json.*$/i, '/');

    // 2) 讀 catalog.json
    const catalog = await fetchJson(CATALOG_URL);
    const allGroups = Array.isArray(catalog.groups) ? catalog.groups : [];
    const groups = allGroups.filter(g => !GROUPS_ENV.length || GROUPS_ENV.includes(g.id));

    // 3) 逐一載入 *_modules_all.json，合併過濾
    for (const g of groups) {
      const url = new URL(g.path, base).toString();
      try {
        const data = await fetchJson(url);
        const list = Array.isArray(data.modules) ? data.modules : [];
        for (const m of list) {
          const hay = `${m.id || ''} ${m.name || ''} ${Array.isArray(m.tags) ? m.tags.join(' ') : ''}`.toLowerCase();
          if (!q || hay.includes(q)) {
            items.push({ ...m, group: g.id });
            if (items.length >= limit) break;
          }
        }
        if (items.length >= limit) break;
      } catch (e) {
        errors.push(`load fail: ${url} ${String(e && e.message || e)}`);
      }
    }
  } catch (e) {
    errors.push(String(e && e.message || e));
  }

  return NextResponse.json(
    { items: items.slice(0, limit), errors },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
