import { writeFile, copyFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import {
  Document, Packer, Paragraph, TextRun, ExternalHyperlink, InternalHyperlink, Bookmark,
  HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  Header, Footer, AlignmentType, PageNumber, VerticalAlign, HeightRule
} from 'docx';
import { build } from './build.mjs';
import { loadChecklist, fromRoot } from './lib.mjs';
import { startPreview } from './preview.mjs';

await build();
const { catalog, sections, items } = await loadChecklist();
const blue = '0C3476';
const cyan = '7EDDEB';
const run = (text, options = {}) => new TextRun({ text, ...options });
const p = (text, options = {}) => new Paragraph({ children: [run(text)], ...options });
const link = (title, url) => new Paragraph({
  spacing: { after: 65 }, indent: { left: 220 },
  children: [new ExternalHyperlink({ link: url, children: [run(title, { style: 'Hyperlink', size: 18 })] })]
});
const borderless = Object.fromEntries(['top', 'bottom', 'left', 'right', 'insideHorizontal', 'insideVertical'].map((side) =>
  [side, { style: BorderStyle.NONE, size: 0, color: blue }]));
const cover = new Table({
  width: { size: 100, type: WidthType.PERCENTAGE }, borders: borderless,
  rows: [new TableRow({
    height: { value: 13900, rule: HeightRule.ATLEAST },
    children: [new TableCell({
      shading: { type: ShadingType.CLEAR, fill: blue }, verticalAlign: VerticalAlign.CENTER,
      margins: { top: 650, bottom: 650, left: 700, right: 700 },
      children: [
        new Paragraph({ spacing: { after: 1000 }, children: [run('AZURE KUBERNETES SERVICE / FIELD GUIDE', { color: 'B6D7FF', size: 19, bold: true, characterSpacing: 30 })] }),
        new Paragraph({ spacing: { after: 0 }, children: [run('Production-ready.', { color: 'FFFFFF', size: 76, bold: true })] }),
        new Paragraph({ spacing: { after: 650 }, children: [run('By design.', { color: cyan, size: 76, bold: true })] }),
        new Paragraph({ spacing: { after: 250 }, children: [run('The AKS Checklist', { color: 'FFFFFF', size: 40, bold: true })] }),
        new Paragraph({ spacing: { after: 950 }, children: [run('An evidence-led guide to architecting, securing, and operating resilient Kubernetes platforms on Azure.', { color: 'D7E7FF', size: 26 })] }),
        new Paragraph({ spacing: { after: 180 }, children: [run(`${items.length} practical checks   /   ${sections.length} review areas`, { color: cyan, size: 28, bold: true })] }),
        new Paragraph({ spacing: { after: 1100 }, children: [run('Five Well-Architected pillars. One stronger production baseline.', { color: 'D7E7FF', size: 21 })] }),
        new Paragraph({ spacing: { after: 150 }, children: [run(catalog.edition, { color: 'FFFFFF', size: 25, bold: true })] }),
        new Paragraph({ spacing: { after: 600 }, children: [run(`Guidance reviewed ${catalog.reviewed}`, { color: 'B6D7FF', size: 20 })] }),
        new Paragraph({ children: [run('COMMUNITY MAINTAINED / INDEPENDENT PROJECT', { color: 'B6D7FF', size: 16, characterSpacing: 18 })] })
      ]
    })]
  })]
});
const body = [
  new Paragraph({ heading: HeadingLevel.HEADING_1, children: [run('A stronger baseline, not a rubber stamp.')] }),
  p('Use this guide to make architecture decisions explicit. Select applicable checks, capture evidence, and assign owners to risks and exceptions. Completion is not a security certification or an application availability guarantee.'),
  p('Guidance applies to AKS Automatic and Standard where supported. Validate your region, cloud, Kubernetes version, operating system, and feature support. Preview capabilities are not a production default; verify current Microsoft documentation before implementation.'),
  new Paragraph({ heading: HeadingLevel.HEADING_2, text: `Lifecycle watch / ${catalog.edition}` }),
  ...catalog.notices.flatMap((notice) => [p(notice.text), link(notice.title, notice.url)]),
  new Paragraph({ heading: HeadingLevel.HEADING_2, text: 'How to use this guide' }),
  p('1. Define business requirements, platform ownership, service objectives, and trust boundaries.'),
  p('2. Review every applicable check with the workload and platform teams.'),
  p('3. Record evidence or a time-bound exception with an owner.'),
  p('4. Rehearse failure, upgrade, and recovery paths; revisit the review after material changes.'),
  p('Priority: High highlights foundational or time-sensitive controls; Medium covers important design and operational practices; Low is generally context-dependent. Priority is not a vulnerability severity rating.'),
  new Paragraph({ heading: HeadingLevel.HEADING_2, text: 'Review map' }),
  ...sections.map((section, index) => new Paragraph({
    spacing: { after: 95 },
    children: [new InternalHyperlink({ anchor: section.id, children: [run(`${String(index + 1).padStart(2, '0')}  ${section.title}  /  ${section.items.length} checks`, { color: blue, size: 22 })] })]
  })),
  new Paragraph({ heading: HeadingLevel.HEADING_2, text: 'Review context' }),
  p('Project: ____________________     Environment: ____________________'),
  p('Owner / team: ____________________     Review date: ____________________')
];
for (const [sectionIndex, section] of sections.entries()) {
  body.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1, pageBreakBefore: true,
      children: [new Bookmark({ id: section.id, children: [run(`${String(sectionIndex + 1).padStart(2, '0')} / ${section.title}`)] })]
    }),
    p(section.summary, { style: 'SectionSummary' })
  );
  for (const [itemIndex, item] of section.items.entries()) {
    body.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [run(`${sectionIndex + 1}.${String(itemIndex + 1).padStart(2, '0')}  ${item.title}`)]
      }),
      new Paragraph({ style: 'PriorityLabel', children: [run(`${item.priority.toUpperCase()} PRIORITY`, { bold: true })] }),
      p(item.description)
    );
    if (item.detail) body.push(p(item.detail));
    body.push(new Paragraph({ style: 'ReferenceLabel', children: [run('DOCUMENTATION & TOOLS', { bold: true })] }));
    for (const reference of [...item.documentation, ...(item.tools ?? [])]) body.push(link(reference.title, reference.url));
    body.push(p('Review: [ ] Complete   [ ] Action required   [ ] Not applicable', { style: 'ReviewField' }));
    body.push(p('Evidence / exception / action owner: __________________________________________', { style: 'ReviewField' }));
  }
}
body.push(
  new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, text: 'Keep the review alive.' }),
  p('Revisit this assessment after platform upgrades, architecture changes, incidents, and retirement announcements. The linked documentation is authoritative for implementation and support terms.'),
  p('Created by Louis-Guillaume Morand and the AKS Checklist contributors. This is an independent community project, not an official Microsoft product. Original code is based on David Dias’s Front-End Checklist. Licensed under MPL-2.0.'),
  link('The AKS Checklist on GitHub', 'https://github.com/lgmorand/the-aks-checklist')
);
const document = new Document({
  creator: 'AKS Checklist contributors', title: 'The AKS Checklist', subject: 'AKS production-readiness field guide',
  description: `${catalog.edition}. Reviewed ${catalog.reviewed}. ${items.length} checks across ${sections.length} review areas.`,
  keywords: 'Azure, AKS, Kubernetes, architecture, production readiness', language: 'en-US',
  styles: {
    default: {
      document: { run: { font: 'Calibri', size: 22, color: '233754' }, paragraph: { spacing: { after: 130, line: 285 } } },
      heading1: { run: { color: blue, size: 40, bold: true }, paragraph: { spacing: { before: 150, after: 250 }, keepNext: true } },
      heading2: { run: { color: blue, size: 25, bold: true }, paragraph: { spacing: { before: 280, after: 120 }, keepNext: true } },
      hyperlink: { run: { color: '1754B0', underline: {} } }
    },
    paragraphStyles: [
      { id: 'SectionSummary', name: 'Section summary', basedOn: 'Normal', run: { color: '536780', size: 24 }, paragraph: { spacing: { after: 320 }, keepNext: true } },
      { id: 'PriorityLabel', name: 'Priority label', basedOn: 'Normal', run: { color: '2868AC', size: 16 }, paragraph: { spacing: { after: 110 }, keepNext: true } },
      { id: 'ReferenceLabel', name: 'Reference label', basedOn: 'Normal', run: { color: '536780', size: 15 }, paragraph: { spacing: { before: 100, after: 80 }, keepNext: true } },
      { id: 'ReviewField', name: 'Review field', basedOn: 'Normal', run: { color: '526782', size: 17 }, paragraph: { spacing: { before: 60, after: 80 }, shading: { fill: 'F0F5FC', type: ShadingType.CLEAR } } }
    ]
  },
  sections: [
    { properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 720, bottom: 720, left: 720, right: 720 } } }, children: [cover] },
    {
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1100, bottom: 1100, left: 1000, right: 1000 } } },
      headers: { default: new Header({ children: [new Paragraph({ border: { bottom: { color: 'DDE7F3', style: BorderStyle.SINGLE, size: 6, space: 6 } }, children: [run('AKS / CHECKLIST', { color: blue, size: 17, bold: true }), run(`    ${catalog.edition} field guide`, { color: '536780', size: 17 })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [run('COMMUNITY GUIDANCE  /  ', { color: '536780', size: 16 }), new TextRun({ children: [PageNumber.CURRENT], color: blue, size: 16 }), run(' of ', { size: 16 }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16 })] })] }) },
      children: body
    }
  ]
});
await writeFile(fromRoot('output', 'AKS-Checklist.docx'), await Packer.toBuffer(document));
await copyFile(fromRoot('output', 'AKS-Checklist.docx'), fromRoot('src', 'web', 'docs', 'AKS-Checklist.docx'));

const preview = await startPreview();
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${preview.url}/docs/AKS-Checklist.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({
    path: fromRoot('output', 'AKS-Checklist.pdf'), format: 'A4', preferCSSPageSize: true,
    printBackground: true, displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: `<div style="width:100%;margin:0 16mm;font-family:Arial,sans-serif;font-size:8px;color:#536780;display:flex;justify-content:space-between"><span>THE AKS CHECKLIST / ${catalog.edition}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    margin: { top: '18mm', bottom: '20mm', left: '16mm', right: '16mm' },
    tagged: true, outline: true
  });
  await copyFile(fromRoot('output', 'AKS-Checklist.pdf'), fromRoot('src', 'web', 'docs', 'AKS-Checklist.pdf'));
  console.log('Generated matching HTML, DOCX, and tagged PDF field guides in output/ and src/web/docs/.');
} finally {
  if (browser) await browser.close();
  await preview.close();
}
