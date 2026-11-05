import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const fromRoot = (...parts) => path.join(root, ...parts);
export const readJson = async (...parts) => JSON.parse(await readFile(fromRoot(...parts), 'utf8'));
export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function validate(catalog, sections) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(catalog.reviewed)) throw new Error('Invalid review date');
  const ids = new Set();
  const guids = new Set();
  const titles = new Set();
  for (const section of sections) {
    if (!/^[a-z][a-z_]*$/.test(section.id) || ids.has(section.id)) throw new Error(`Invalid/duplicate category: ${section.id}`);
    ids.add(section.id);
    if (!section.items?.length) throw new Error(`Empty category: ${section.id}`);
    for (const item of section.items) {
      const location = `${section.id}: ${item.title}`;
      if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(item.guid) || guids.has(item.guid)) {
        throw new Error(`Invalid/duplicate GUID: ${location}`);
      }
      guids.add(item.guid);
      if (!item.title?.trim() || !item.description?.trim()) throw new Error(`Missing text: ${location}`);
      const title = item.title.trim().toLowerCase();
      if (titles.has(title)) throw new Error(`Duplicate title: ${location}`);
      titles.add(title);
      if (!['High', 'Medium', 'Low'].includes(item.priority)) throw new Error(`Invalid priority: ${location}`);
      if (!Array.isArray(item.tags) || !item.tags.includes('all')) throw new Error(`Missing tags: ${location}`);
      if (!item.documentation?.length) throw new Error(`Missing documentation: ${location}`);
      for (const link of [...item.documentation, ...(item.tools ?? [])]) {
        if (!link.title?.trim()) throw new Error(`Missing link title: ${location}`);
        const url = new URL(link.url);
        if (url.protocol !== 'https:') throw new Error(`Non-HTTPS link: ${link.url}`);
      }
    }
  }
}

export async function loadChecklist() {
  const catalog = await readJson('data', 'en', 'project', 'catalog.json');
  const sections = await Promise.all(catalog.categories.map(async (category) => ({
    ...category, items: await readJson('data', 'en', 'items', `${category.id}.json`)
  })));
  const files = (await readdir(fromRoot('data', 'en', 'items'))).filter((file) => file.endsWith('.json'));
  if (files.length !== sections.length || files.some((file) => !sections.some((s) => `${s.id}.json` === file))) {
    throw new Error('Every item file must be registered in catalog.json');
  }
  validate(catalog, sections);
  return { catalog, sections, items: sections.flatMap((s) => s.items) };
}

export function toFta(catalog, sections) {
  return {
    categories: [...new Set(sections.map((s) => s.fta))].map((name) => ({ name })),
    status: [
      { name: 'Not verified', description: 'This check has not been looked at yet' },
      { name: 'Open', description: 'There is an action item associated to this check' },
      { name: 'Fulfilled', description: 'This check has been verified, with no further action items' },
      { name: 'Not required', description: 'Recommendation understood, but not needed by current requirements' },
      { name: 'N/A', description: 'Not applicable for the current design' }
    ],
    severities: ['High', 'Medium', 'Low'].map((name) => ({ name })),
    metadata: { name: 'Azure AKS Review', state: 'GA', reviewed: catalog.reviewed },
    items: sections.flatMap((s) => s.items.map((item) => ({
      text: item.title, description: [item.description, item.detail].filter(Boolean).join('\n\n'),
      guid: item.guid, subcategory: item.tags.find((t) => t !== 'all') ?? 'Other',
      category: s.fta, severity: item.priority, link: item.documentation[0].url,
      ...(item.optionalFields?.score ?? {})
    })))
  };
}
