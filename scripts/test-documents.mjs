import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { loadChecklist, fromRoot } from './lib.mjs';

function zipEntry(buffer, filename) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end >= 0, 'DOCX must be a ZIP package');
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  for (let index = 0; index < count; index++) {
    assert.equal(buffer.readUInt32LE(offset), 0x02014b50);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    if (name === filename) {
      const local = buffer.readUInt32LE(offset + 42);
      const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
      const bytes = buffer.subarray(start, start + buffer.readUInt32LE(offset + 20));
      const compression = buffer.readUInt16LE(offset + 10);
      assert.ok([0, 8].includes(compression), 'Supported DOCX compression');
      return (compression === 8 ? inflateRawSync(bytes) : bytes).toString('utf8');
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`Missing DOCX part: ${filename}`);
}
const normalized = (text) => text.normalize('NFKC').replace(/\s+/g, ' ').trim();
const { catalog, sections, items } = await loadChecklist();
const pdfBytes = await readFile(fromRoot('output', 'AKS-Checklist.pdf'));
assert.ok(pdfBytes.subarray(0, 5).toString() === '%PDF-', 'PDF signature');
const loadingTask = getDocument({ data: new Uint8Array(pdfBytes), isEvalSupported: false });
const pdf = await loadingTask.promise;
assert.ok(pdf.numPages > sections.length && pdf.numPages < 100, 'Sensible field guide page count');
const pages = [];
for (let index = 1; index <= pdf.numPages; index++) {
  const page = await pdf.getPage(index);
  const content = await page.getTextContent();
  const text = normalized(content.items.filter((item) => 'str' in item).map((item) => item.str).join(' '));
  assert.ok(text.length > 80, `Page ${index} must not be blank or nearly empty`);
  assert.ok(Math.abs(page.view[2] - 595.28) < 2 && Math.abs(page.view[3] - 841.89) < 2, `A4 dimensions on page ${index}`);
  pages.push(text);
}
const text = pages.join(' ');
for (const item of items) assert.ok(text.replace(/\s/g, '').includes(normalized(item.title).replace(/\s/g, '')), `PDF includes: ${item.title}`);
assert.ok(pages[0].includes('Production-ready.'), 'PDF cover');
assert.ok(text.includes(catalog.reviewed), 'PDF review date');
assert.ok((await pdf.getOutline())?.length > 0, 'PDF outline/bookmarks');
assert.ok(await (await pdf.getPage(1)).getStructTree(), 'PDF is tagged');
await loadingTask.destroy();

const docx = await readFile(fromRoot('output', 'AKS-Checklist.docx'));
const document = zipEntry(docx, 'word/document.xml');
const styles = zipEntry(docx, 'word/styles.xml');
const relationships = zipEntry(docx, 'word/_rels/document.xml.rels');
const decodeXml = (value) => value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
const docxText = normalized(decodeXml(document.replace(/<[^>]+>/g, '')));
for (const item of items) assert.ok(docxText.includes(normalized(item.title)), `DOCX includes: ${item.title}`);
for (const section of sections) assert.ok(document.includes(`w:name="${section.id}"`), `DOCX bookmark: ${section.id}`);
assert.ok(document.includes('0C3476') && document.includes('7EDDEB'), 'DOCX blue/cyan cover styling');
assert.ok(styles.includes('Heading1') && styles.includes('Heading2'), 'DOCX semantic heading styles');
for (const url of new Set(items.flatMap((item) => [...item.documentation, ...(item.tools ?? [])].map((link) => link.url)))) {
  assert.ok(decodeXml(relationships).includes(url), `DOCX hyperlink: ${url}`);
}
for (const filename of ['AKS-Checklist.pdf', 'AKS-Checklist.docx', 'AKS-Checklist.html']) {
  assert.deepEqual(await readFile(fromRoot('output', filename)), await readFile(fromRoot('src', 'web', 'docs', filename)), `Published ${filename} matches output`);
}
console.log(`Validated ${pdf.numPages}-page tagged A4 PDF, outline, nonblank pages, all ${items.length} check titles, DOCX styles/bookmarks/hyperlinks, and identical published copies.`);
