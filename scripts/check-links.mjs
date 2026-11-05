import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fromRoot, readJson } from './lib.mjs';

// Check source links rather than counting repeated links in generated artifacts.
const catalog = await readJson('data', 'en', 'project', 'catalog.json');
const { readdir } = await import('node:fs/promises');
const sources = new Map();
function add(url, source) {
  if (!sources.has(url)) sources.set(url, new Set());
  sources.get(url).add(source);
}
for (const file of await readdir(fromRoot('data', 'en', 'items'))) {
  if (!file.endsWith('.json')) continue;
  for (const item of await readJson('data', 'en', 'items', file)) {
    for (const link of [...(item.documentation ?? []), ...(item.tools ?? [])]) add(link.url, `${file}: ${item.guid}`);
  }
}
for (const notice of catalog.notices) add(notice.url, 'catalog.json');
const readme = await readFile(fromRoot('README.md'), 'utf8');
for (const match of readme.matchAll(/\]\((https:\/\/[^)\s]+)\)/g)) add(match[1], 'README.md');

const pageCache = new Map();
async function getPage(url) {
  if (!pageCache.has(url)) pageCache.set(url, (async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(25000),
          headers: { 'User-Agent': 'AKS-Checklist-Link-Audit/2.0', Accept: 'text/html,application/json' }
        });
        const html = await response.text();
        if ((response.status === 429 || response.status >= 500) && attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
          continue;
        }
        return { status: response.status, finalUrl: response.url, html };
      } catch (error) {
        if (attempt === 2) return { status: 0, error: error.message, html: '' };
      }
    }
  })());
  return pageCache.get(url);
}
const queue = [...sources.keys()];
const results = [];
async function worker() {
  while (queue.length) {
    const url = queue.shift();
    const parsed = new URL(url);
    const fragment = decodeURIComponent(parsed.hash.slice(1));
    parsed.hash = '';
    const page = await getPage(parsed.href);
    const ids = new Set([...page.html.matchAll(/\b(?:id|name)=["']([^"']+)["']/gi)].map((m) => m[1]));
    const dynamicHost = ['github.com', 'www.youtube.com', 'youtu.be'].includes(parsed.hostname);
    const fragmentChecked = Boolean(fragment && !dynamicHost && page.status === 200 && page.html.includes('<html'));
    const fragmentFound = !fragmentChecked || ids.has(fragment) || fragment.startsWith(':~:text=');
    const title = page.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '';
    const authRedirect = page.finalUrl && /login\.microsoftonline\.com|\/signin(?:[/?-]|$)/i.test(page.finalUrl);
    const ok = page.status >= 200 && page.status < 300 && fragmentFound && !authRedirect && !/404 - Page not found/i.test(title);
    results.push({
      url, status: page.status, finalUrl: page.finalUrl, title, fragmentChecked, fragmentFound,
      outcome: ok ? 'pass' : [401, 403, 429].includes(page.status) ? 'blocked' : 'fail',
      ...(page.error ? { error: page.error } : {}), sources: [...sources.get(url)]
    });
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
results.sort((a, b) => a.url.localeCompare(b.url));
const counts = Object.fromEntries(['pass', 'fail', 'blocked'].map((status) =>
  [status, results.filter((r) => r.outcome === status).length]));
await mkdir(fromRoot('output'), { recursive: true });
await writeFile(fromRoot('output', 'link-audit.json'), JSON.stringify({
  checkedAt: new Date().toISOString(), counts, results
}, null, 2) + '\n');
console.log(`Checked ${results.length} links: ${JSON.stringify(counts)}. Report: output/link-audit.json`);
for (const result of results.filter((r) => r.outcome !== 'pass')) {
  console.log(`${result.outcome.toUpperCase()} ${result.status} ${result.url}${result.fragmentFound ? '' : ' (missing fragment)'}`);
}
if (counts.fail || counts.blocked) process.exitCode = 1;
