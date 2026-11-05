import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build, renderItem, renderGuide } from '../scripts/build.mjs';
import { loadChecklist, validate, toFta, escapeHtml, fromRoot, readJson } from '../scripts/lib.mjs';
import { emptyReview, parseReview, completion } from '../src/web/scripts/review-state.js';

const { catalog, sections, items } = await loadChecklist();
await build();
test('all sections and items are validated, registered, and unique', () => {
  assert.equal(sections.length, 15);
  assert.ok(items.length >= 200);
  assert.doesNotThrow(() => validate(catalog, sections));
});
test('validation rejects duplicate GUIDs, titles, missing references, unsafe links, and priority typos', () => {
  for (const [field, value] of [
    ['guid', items[1].guid], ['title', items[1].title], ['documentation', []],
    ['documentation', [{ title: 'Unsafe', url: 'javascript:alert(1)' }]], ['priority', 'low']
  ]) {
    const changed = structuredClone(sections);
    const item = changed.find((s) => s.items.some((i) => i.guid === items[0].guid)).items[0];
    item[field] = value;
    assert.throws(() => validate(catalog, changed));
  }
});
test('HTML escapes text and attributes without treating data as markup', () => {
  assert.equal(escapeHtml('<a "x"> & \''), '&lt;a &quot;x&quot;&gt; &amp; &#39;');
  const item = { ...items[0], title: '<script>alert("x")</script>', description: '" onfocus="bad' };
  const html = renderItem(item);
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});
test('FTA contains every item and category and preserves scoring fields', () => {
  const fta = toFta(catalog, sections);
  assert.equal(fta.items.length, items.length);
  assert.equal(new Set(fta.items.map((i) => i.guid)).size, items.length);
  assert.ok(fta.items.every((i) => fta.categories.some((c) => c.name === i.category)));
  const scored = items.find((item) => item.optionalFields?.score?.simple !== undefined);
  assert.equal(fta.items.find((i) => i.guid === scored.guid).simple, scored.optionalFields.score.simple);
});
test('website, FTA, and standalone HTML are generated from the same complete source', async () => {
  const html = await readFile(fromRoot('src', 'web', 'index.html'), 'utf8');
  const guide = await readFile(fromRoot('output', 'AKS-Checklist.html'), 'utf8');
  const fta = await readJson('src', 'web', 'fta', 'aks_checklist.en.json');
  assert.equal((html.match(/class="check-item"/g) ?? []).length, items.length);
  assert.equal((guide.match(/class="guide-item"/g) ?? []).length, items.length);
  assert.equal(fta.items.length, items.length);
  for (const item of items) {
    assert.ok(html.includes(`data-id="${item.guid}"`));
    assert.ok(guide.includes(`id="${item.guid}"`));
  }
  assert.ok(!/%(?:CONTENT|COUNT|DATA|TAGS|EDITION)%/.test(html));
  assert.ok(!/[ \t]+$/m.test(html), 'Generated HTML has no trailing whitespace');
  assert.ok(!guide.includes('<link rel="stylesheet"'));
  assert.equal(guide, await readFile(fromRoot('src', 'web', 'docs', 'AKS-Checklist.html'), 'utf8'));
});
test('standalone guide includes support caveats, all sections, and priority meaning', () => {
  const guide = renderGuide(catalog, sections, '');
  assert.ok(guide.includes('not a security certification'));
  assert.ok(guide.includes('Preview capabilities are not a production default'));
  assert.ok(guide.includes('Priority is not a vulnerability severity rating'));
  for (const section of sections) assert.ok(guide.includes(`href="#${section.id}"`));
});
test('legacy mapping retains original positional IDs even when categories move', async () => {
  const legacy = await readJson('data', 'en', 'project', 'legacy-progress.json');
  assert.equal(legacy['identity---authorization'][0], '7e42c78e-78c0-46a6-8a21-94956e698dc4');
  assert.equal(legacy['cluster-security'][0], 'd34f49c0-e964-4465-9211-520479338b13');
  assert.ok(sections.find((s) => s.id === 'lifecycle').items.some((i) => i.guid === legacy['cluster-security'][0]));
});
test('review import validates shape, removes unknown IDs, and makes N/A mutually exclusive', () => {
  const ids = new Set([items[0].guid, items[1].guid]);
  const review = { ...emptyReview(), completed: [items[0].guid, items[1].guid, items[2].guid], notApplicable: [items[1].guid], evidence: { [items[0].guid]: '<script>evidence</script>' } };
  const parsed = parseReview(review, ids);
  assert.deepEqual(parsed.completed, [items[0].guid]);
  assert.deepEqual(parsed.notApplicable, [items[1].guid]);
  assert.equal(parsed.evidence[items[0].guid], '<script>evidence</script>');
  for (const invalid of [null, {}, { ...review, project: 12 }, { ...review, completed: ['__proto__'] }, { ...review, evidence: { bad: 'x' } }]) {
    assert.throws(() => parseReview(invalid, ids));
  }
});
test('progress excludes N/A without inventing success for an empty assessment', () => {
  assert.deepEqual(completion(10, 4, 2), { applicable: 8, percent: 50 });
  assert.deepEqual(completion(10, 0, 10), { applicable: 0, percent: 0 });
});
