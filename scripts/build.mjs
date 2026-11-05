import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadChecklist, fromRoot, readJson, escapeHtml as e, toFta } from './lib.mjs';

export function renderLinks(links) {
  return links.map((link) => `<li><a href="${e(link.url)}" target="_blank" rel="noopener noreferrer">${e(link.title)}</a></li>`).join('\n');
}
export function renderItem(item) {
  return `<li class="check-item" data-id="${item.guid}" data-priority="${item.priority}" data-tags="${e(item.tags.join(' '))}" data-state="open" data-search="${e([item.title, item.description, item.detail ?? '', ...item.tags].join(' ').toLocaleLowerCase())}">
    <div class="item-topline"><input class="item-check" type="checkbox" id="check-${item.guid}"><label class="item-title" for="check-${item.guid}">${e(item.title)}</label><span class="priority priority-${item.priority.toLowerCase()}">${item.priority.toUpperCase()}</span></div>
    <p class="item-description">${e(item.description)}</p>
    <details class="item-details"><summary>Guidance, references &amp; evidence</summary><div class="detail-content">
      ${item.detail ? `<p>${e(item.detail)}</p>` : ''}
      <p class="reference-label">Documentation</p><ul class="reference-links">${renderLinks(item.documentation)}</ul>
      ${item.tools?.length ? `<p class="reference-label">Tools</p><ul class="reference-links">${renderLinks(item.tools)}</ul>` : ''}
      <div class="item-review"><label class="na-label"><input class="item-na" type="checkbox">Not applicable<span class="sr-only">: ${e(item.title)}</span></label><label class="evidence-label">Evidence / exception / action owner<span class="sr-only">: ${e(item.title)}</span><input class="evidence" type="text" maxlength="2000" placeholder="Record your decision or evidence"></label></div>
    </div></details>
  </li>`.replace(/[ \t]+$/gm, '');
}
export function renderSections(sections) {
  return sections.map((s, index) => `<section class="checklist-section" id="section-${s.id}" aria-labelledby="heading-${s.id}">
    <div class="section-heading"><span class="section-number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span><div><h2 id="heading-${s.id}">${e(s.title)}</h2><p>${e(s.summary)}</p></div><div class="section-controls"><span class="section-progress">0 / ${s.items.length}</span><button type="button" data-action="complete" aria-label="Complete visible applicable checks in ${e(s.title)}">Complete visible</button><button type="button" data-action="clear" aria-label="Clear visible completed checks in ${e(s.title)}">Clear</button></div></div>
    <ul class="checklist-items">${s.items.map(renderItem).join('\n')}</ul>
  </section>`).join('\n');
}
export function renderGuide(catalog, sections, css) {
  const count = sections.reduce((total, s) => total + s.items.length, 0);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="The AKS Checklist production-readiness field guide"><title>AKS Checklist | ${e(catalog.edition)} field guide</title><style>${css}</style></head><body>
    <header class="guide-cover"><div class="cover-kicker">AZURE KUBERNETES SERVICE / FIELD GUIDE</div><div class="cover-mark" aria-hidden="true">&#11041;</div><h1>Production-ready.<br><span>By design.</span></h1><p class="cover-lead">The AKS Checklist</p><p class="cover-description">An evidence-led guide to architecting, securing, and operating resilient Kubernetes platforms on Azure.</p><div class="cover-stats"><div><strong>${count}</strong>practical checks</div><div><strong>${sections.length}</strong>review areas</div><div><strong>5</strong>Well-Architected pillars</div></div><div class="cover-edition">${e(catalog.edition)}<br>Guidance reviewed ${catalog.reviewed}</div><p class="cover-credit">Community maintained · Microsoft guidance · Independent project</p></header>
    <main class="guide-main"><section class="guide-intro"><p class="kicker">BEFORE YOU BEGIN</p><h2>A stronger baseline, not a rubber stamp.</h2><p>Use this guide to make architecture decisions explicit. Select applicable checks, capture evidence, and assign owners to risks and exceptions. Completion is not a security certification or an application availability guarantee.</p><p>Guidance applies to AKS Automatic and Standard where supported. Validate your region, cloud, Kubernetes version, operating system, and feature support. Preview capabilities are not a production default. Always verify current Microsoft documentation before implementation.</p><div class="guide-notice"><strong>Lifecycle watch / ${e(catalog.edition)}</strong>${catalog.notices.map((n) => `<p><a href="${e(n.url)}">${e(n.title)}</a> — ${e(n.text)}</p>`).join('')}</div><h3>How to use this guide</h3><ol><li>Define business requirements, platform ownership, service objectives, and trust boundaries.</li><li>Review every applicable check with the workload and platform teams.</li><li>Record implementation evidence or a time-bound exception with an owner.</li><li>Test failure, upgrade, and recovery paths; revisit the review after material changes.</li></ol><p><strong>Priority:</strong> High highlights foundational or time-sensitive controls; Medium covers important design and operational practices; Low is generally context-dependent. Priority is not a vulnerability severity rating.</p><h3>Review map</h3><nav class="guide-toc" aria-label="Guide contents">${sections.map((s, index) => `<a href="#${s.id}"><span>${String(index + 1).padStart(2, '0')}</span>${e(s.title)}<b>${s.items.length} checks</b></a>`).join('')}</nav></section>
    ${sections.map((s, index) => `<section class="guide-section" id="${s.id}"><div class="guide-section-heading"><p class="kicker">REVIEW AREA ${String(index + 1).padStart(2, '0')} / ${sections.length}</p><h2>${e(s.title)}</h2><p>${e(s.summary)}</p></div>${s.items.map((item, itemIndex) => `<article class="guide-item" id="${item.guid}"><div class="guide-item-heading"><span class="guide-item-number">${index + 1}.${String(itemIndex + 1).padStart(2, '0')}</span><h3>${e(item.title)}</h3><span class="guide-priority">${item.priority}</span></div><p>${e(item.description)}</p>${item.detail ? `<p>${e(item.detail)}</p>` : ''}<div class="guide-references"><strong>READ MORE</strong><ul>${renderLinks(item.documentation)}${renderLinks(item.tools ?? [])}</ul></div></article>`).join('\n')}</section>`).join('\n')}
    <section class="guide-colophon"><h2>Keep the review alive.</h2><p>Revisit this assessment after platform upgrades, architecture changes, incidents, and retirement announcements. The linked documentation is authoritative for implementation and support terms.</p><p>Created by Louis-Guillaume Morand and the AKS Checklist contributors. This is an independent community project, not an official Microsoft product. Original code is based on David Dias’s Front-End Checklist. Licensed under MPL-2.0.</p><a href="https://github.com/lgmorand/the-aks-checklist">github.com/lgmorand/the-aks-checklist</a></section></main>
    <footer class="guide-footer">THE AKS CHECKLIST / ${e(catalog.edition)} / Reviewed ${catalog.reviewed}</footer></body></html>`;
}

export async function build() {
  const { catalog, sections, items } = await loadChecklist();
  const legacy = await readJson('data', 'en', 'project', 'legacy-progress.json');
  const template = await readFile(fromRoot('data', 'tooling', 'html-generator', 'template.html'), 'utf8');
  const guideCss = await readFile(fromRoot('src', 'web', 'styles', 'guide.css'), 'utf8');
  const navigation = sections.map((s, index) => `<a href="#section-${s.id}"><span>${String(index + 1).padStart(2, '0')}</span>${e(s.title)}<b>${s.items.length}</b></a>`).join('\n');
  const tags = [...new Set(items.flatMap((item) => item.tags).filter((tag) => tag !== 'all'))].sort();
  const replacements = {
    EDITION: catalog.edition, REVIEWED: catalog.reviewed, COUNT: String(items.length),
    SECTIONS: String(sections.length), NAVIGATION: navigation, CONTENT: renderSections(sections),
    NOTICE: e(catalog.notices[0].text), TAGS: tags.map((tag) => `<option value="${e(tag)}">${e(tag)}</option>`).join(''),
    DATA: JSON.stringify({ reviewed: catalog.reviewed, legacy }).replace(/</g, '\\u003c')
  };
  const html = template.replace(/%([A-Z_]+)%/g, (token, key) => {
    if (!(key in replacements)) throw new Error(`Unknown template token ${token}`);
    return replacements[key];
  });
  await Promise.all(['output', 'src/web/docs', 'src/web/fta'].map((directory) => mkdir(fromRoot(...directory.split('/')), { recursive: true })));
  await writeFile(fromRoot('src', 'web', 'index.html'), html);
  await writeFile(fromRoot('src', 'web', 'fta', 'aks_checklist.en.json'), JSON.stringify(toFta(catalog, sections), null, 2) + '\n');
  await writeFile(fromRoot('output', 'AKS-Checklist.html'), renderGuide(catalog, sections, guideCss));
  await copyFile(fromRoot('output', 'AKS-Checklist.html'), fromRoot('src', 'web', 'docs', 'AKS-Checklist.html'));
  const digest = createHash('sha256').update(JSON.stringify({ catalog, sections })).digest('hex');
  await writeFile(fromRoot('output', 'build-manifest.json'), JSON.stringify({
    reviewed: catalog.reviewed, sections: sections.length, checks: items.length, sourceSha256: digest
  }, null, 2) + '\n');
  console.log(`Built ${items.length} checks across ${sections.length} sections. Source SHA256: ${digest}`);
}
if (process.argv[1] && fromRoot('scripts', 'build.mjs') === process.argv[1]) await build();
