// app/api/search/route.js
import { NextResponse } from 'next/server';

const TIMEOUT_MS = Number(process.env.CATALOG_TIMEOUT_MS || 1500);

async function fetchJSON(url, timeoutMs) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      signal: ac.signal,
      headers: { 'User-Agent': 'module-search/1' },
    });
    if (!res.ok) throw new Error(`Fetch ${url} failed ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').toLowerCase().trim();
  const limit = Math.min(Number(searchParams.get('limit') || 20), 50);

  const catalogUrl = process.env.CATALOG_URL;
  if (!catalogUrl) {
    return NextResponse.json({ items: [], error: 'CATALOG_URL not set' }, { status: 500 });
  }

  const catalog = await fetchJSON(catalogUrl, TIMEOUT_MS);

  const allowedGroups = (process.env.MODULES_GROUPS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const groups = Array.isArray(catalog.groups) ? catalog.groups : [];
  const groupList = allowedGroups.length
    ? groups.filter(g => allowedGroups.includes(g.id))
    : groups;

  const lists = await Promise.allSettled(
    groupList.map(g => {
      const u = new URL(g.path, catalogUrl).toString(); // 支援相對路徑
      return fetchJSON(u, TIMEOUT_MS);
    }),
  );

  const modules = [];
  for (const r of lists) {
    if (r.status === 'fulfilled' && r.value && Array.isArray(r.value.modules)) {
      modules.push(...r.value.modules);
    }
  }

  const items = modules
    .filter(m => {
      if (!q) return true;
      const hay = `${m.id} ${(m.name || '')} ${(m.tags || []).join(' ')}`.toLowerCase();
      return hay.includes(q);
    })
    .slice(0, limit);

  return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } });
}
