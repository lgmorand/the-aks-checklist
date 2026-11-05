"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const api = require("../../src/web/scripts/checklist-state.js");
const legacy = JSON.parse(fs.readFileSync(path.join(__dirname, "../en/legacy-index.json"), "utf8"));
const sections = Object.keys(legacy.sections);
const first = sections[0];
const second = sections[1];
const [merged, unique, reference] = legacy.sections[first];
const predecessor = legacy.sections[second][0];
const added = "00000000-0000-4000-8000-000000000001";
const later = "00000000-0000-4000-8000-000000000002";
const manifest = {
    version: 1,
    legacy,
    items: [
        { guid: merged, title: "Merged cross-section control", section: first, priority: "high", supersedes: [predecessor] },
        { guid: unique, title: "Unique conditional control", section: first, priority: "medium", applicability: "Only when this feature is used.", related: [merged] },
        { guid: reference, title: "Unscored tool", section: first, priority: "high", kind: "reference" },
        { guid: added, title: "New control", section: second, priority: "high" }
    ]
};

class Storage {
    constructor(entries = {}) {
        this.entries = new Map(Object.entries(entries));
        this.writes = 0;
    }
    get length() { return this.entries.size; }
    key(index) { return [...this.entries.keys()][index] ?? null; }
    getItem(key) { return this.entries.get(key) ?? null; }
    setItem(key, value) { this.entries.set(key, String(value)); this.writes++; }
    removeItem(key) { this.entries.delete(key); }
    snapshot() { return Object.fromEntries(this.entries); }
}

const selected = (...ids) => JSON.stringify(ids.map((id) => ({ id: String(id), state: "checked" })));
const clone = (value) => JSON.parse(JSON.stringify(value));
let passed = 0;
function test(name, action) {
    action();
    passed++;
    console.log("PASS " + name);
}

test("frozen 196 legacy positions are unique and retain the disaster-recovery slug", () => {
    assert.equal(legacy.version, 1);
    const ids = Object.values(legacy.sections).flat();
    assert.equal(ids.length, 196);
    assert.equal(new Set(ids).size, 196);
    assert.ok(legacy.sections["biz-continuity---disaster-recovery"]);
    for (const [section, guids] of Object.entries(legacy.sections)) {
        const fixture = { version: 1, legacy, items: guids.map((guid) => ({ guid, section, priority: "high" })) };
        for (let index = 0; index < guids.length; index++) {
            const state = api.migrateLegacy(fixture, { [section]: selected(index) });
            assert.deepEqual(Object.keys(state.items).filter((guid) => state.items[guid] === "fulfilled"), [guids[index]]);
        }
    }
});

test("cross-section merge requires every predecessor; unique answers survive and new controls stay open", () => {
    const storage = new Storage({ [first]: selected(0, 1, 2), [second]: selected(0), unrelated: "preserve" });
    const original = storage.snapshot();
    const { state, writable, warnings } = api.initialize(storage, manifest);
    assert.equal(writable, true);
    assert.deepEqual(warnings, []);
    assert.equal(state.items[merged], "fulfilled");
    assert.equal(state.items[unique], "fulfilled");
    assert.equal(state.items[added], "open");
    assert.equal(state.items[reference], undefined);
    assert.deepEqual(state.review, []);
    assert.equal(storage.getItem(first), original[first]);
    assert.equal(storage.getItem(second), original[second]);
    assert.equal(storage.getItem("unrelated"), "preserve");
    assert.deepEqual(JSON.parse(storage.getItem(api.BACKUP_KEY)).sections, { [first]: original[first], [second]: original[second] });
});

test("conflicting, missing, and partial predecessors remain open with persistent review notices", () => {
    for (const entries of [{ [first]: selected(0) }, { [second]: selected(0) }, { [first]: selected(0), [second]: "[]" }]) {
        const storage = new Storage(entries);
        const { state } = api.initialize(storage, manifest);
        assert.equal(state.items[merged], "open");
        assert.deepEqual(state.review, [merged]);
        assert.deepEqual(api.initialize(storage, manifest).state, state);
    }
    assert.deepEqual(api.initialize(new Storage(), manifest).state.review, []);
});

test("GUID state is stable across reorders, section moves, additions, and idempotent reloads", () => {
    const storage = new Storage({ [first]: selected(0, 1), [second]: selected(0) });
    const initial = api.initialize(storage, manifest).state;
    const reordered = clone(manifest);
    reordered.items.reverse();
    reordered.items.find((item) => item.guid === unique).section = second;
    reordered.items.push({ guid: later, title: "Later new control", section: first, priority: "low" });
    const state = api.initialize(storage, reordered).state;
    assert.equal(state.items[merged], initial.items[merged]);
    assert.equal(state.items[unique], initial.items[unique]);
    assert.equal(state.items[later], "open");
    const writes = storage.writes;
    assert.deepEqual(api.initialize(storage, reordered).state, state);
    assert.equal(storage.writes, writes, "Reload must not rewrite authoritative GUID state or backups");
});

test("future GUID consolidations reconcile conservatively and ignore retired references", () => {
    const prior = api.emptyState(manifest);
    prior.items[merged] = "fulfilled";
    prior.items[predecessor] = "open";
    prior.items[reference] = "fulfilled";
    const result = api.reconcile(manifest, prior);
    assert.equal(result.items[merged], "open");
    assert.deepEqual(result.review, [merged]);
    assert.equal(result.items[reference], undefined);
    prior.items[predecessor] = "fulfilled";
    assert.equal(api.reconcile(manifest, prior).items[merged], "fulfilled");
});

test("N/A persists separately, restores, and is excluded from all scoring denominators", () => {
    const before = api.emptyState(manifest);
    let state = api.setStatus(before, manifest, unique, "na");
    state = api.setStatus(state, manifest, merged, "fulfilled");
    const storage = new Storage({ [api.STATE_KEY]: JSON.stringify(state) });
    assert.deepEqual(api.initialize(storage, manifest).state, state);
    assert.equal(before.items[unique], "open", "State transitions must not mutate previous state");
    assert.deepEqual(api.score(state, manifest.items), { fulfilled: 1, total: 2, na: 1, open: 1, percent: 50 });
    assert.deepEqual(api.score(state, manifest.items.filter((item) => item.section === first)),
        { fulfilled: 1, total: 1, na: 1, open: 0, percent: 100 });
    assert.deepEqual(api.score(state, manifest.items.filter((item) => item.priority === "medium")),
        { fulfilled: 0, total: 0, na: 1, open: 0, percent: 0 });
    const restored = api.setStatus(state, manifest, unique, "open");
    assert.equal(api.score(restored, manifest.items).total, 3);
    assert.equal(restored.items[unique], "open");
});

test("all N/A is zero Fulfilled, never 100%, and references never affect counts", () => {
    let state = api.emptyState(manifest);
    for (const item of manifest.items.filter((item) => item.kind !== "reference")) {
        state = api.setStatus(state, manifest, item.guid, "na");
    }
    assert.deepEqual(api.score(state, manifest.items), { fulfilled: 0, total: 0, na: 3, open: 0, percent: 0 });
    assert.throws(() => api.setStatus(state, manifest, reference, "fulfilled"), /Invalid control/);
    assert.deepEqual(api.score(state, []), { fulfilled: 0, total: 0, na: 0, open: 0, percent: 0 });
});

test("section bulk operations preserve N/A and unrelated sections irrespective of filtering", () => {
    let state = api.setStatus(api.emptyState(manifest), manifest, unique, "na");
    state.review = [merged];
    state = api.bulkStatus(state, manifest, first, true);
    assert.equal(state.items[unique], "na");
    assert.equal(state.items[merged], "fulfilled");
    assert.equal(state.items[added], "open");
    assert.deepEqual(state.review, []);
    state = api.bulkStatus(state, manifest, first, false);
    assert.equal(state.items[unique], "na");
    assert.equal(state.items[merged], "open");
});

test("scoped reset preserves project metadata, unrelated keys, and raw backups without replay", () => {
    const metadata = { "project-name": '["AKS"]', "developer-name": '["Reviewer"]', "page-title": '["Production"]', unrelated: "untouched" };
    const storage = new Storage({ ...metadata, [first]: selected(0, 1), [second]: selected(0), tag: '[{"filter":"cost"}]', "hide-sections": "[]" });
    api.initialize(storage, manifest);
    const originalBackup = storage.getItem(api.BACKUP_KEY);
    const resetState = api.reset(storage, manifest);
    assert.deepEqual(resetState, api.emptyState(manifest));
    for (const [key, value] of Object.entries(metadata)) assert.equal(storage.getItem(key), value);
    for (const key of [first, second, "tag", "hide-sections"]) assert.equal(storage.getItem(key), null);
    assert.equal(storage.getItem(api.BACKUP_KEY), originalBackup);
    assert.deepEqual(api.initialize(storage, manifest).state, resetState);
    storage.removeItem(api.STATE_KEY);
    assert.deepEqual(api.initialize(storage, manifest).state, resetState, "No replay of retained backups after reset");
    assert.ok(Object.keys(api.rawRecovery(storage, manifest)).some((key) => key.startsWith("aks-checklist:reset-backup:")));
});

test("malformed legacy storage is preserved byte-for-byte, with visible-warning data and writes blocked", () => {
    const malformed = ["{", "null", "{}", '[{"id":"-1"}]', '[{"id":"1","state":"unchecked"}]', '[{"id":0}]',
        '[{"id":"9999"}]', '[{"id":"01"}]', '[{"id":"' + merged + '"}]'];
    for (const raw of malformed) {
        const storage = new Storage({ [first]: selected(1), [second]: raw, unrelated: "safe" });
        const original = storage.snapshot();
        const result = api.initialize(storage, manifest);
        assert.equal(result.writable, false);
        assert.match(result.warnings[0], /not been overwritten/);
        assert.deepEqual(storage.snapshot(), original);
        assert.equal(storage.writes, 0);
    }
});

test("malformed GUID state and existing corrupt backups are not overwritten or silently replayed", () => {
    for (const raw of ["{", "[]", '{"version":2,"items":{},"review":null}',
        JSON.stringify({ version: 2, items: { [merged]: "checked" }, review: [] })]) {
        const storage = new Storage({ [api.STATE_KEY]: raw, [first]: selected(0, 1) });
        const original = storage.snapshot();
        assert.equal(api.initialize(storage, manifest).writable, false);
        assert.deepEqual(storage.snapshot(), original);
        api.reset(storage, manifest);
        const recovery = Object.entries(api.rawRecovery(storage, manifest)).find(([key]) => key.startsWith("aks-checklist:reset-backup:"));
        assert.equal(JSON.parse(recovery[1])[api.STATE_KEY], raw);
        assert.deepEqual(api.initialize(storage, manifest).state, api.emptyState(manifest));
    }
    const storage = new Storage({ [api.BACKUP_KEY]: "{", [first]: selected(1) });
    const original = storage.snapshot();
    assert.equal(api.initialize(storage, manifest).writable, false);
    assert.deepEqual(storage.snapshot(), original);
});

test("storage access/quota failures become explicit warnings without destroying originals", () => {
    const denied = new Storage();
    denied.getItem = () => { throw new Error("Access denied"); };
    assert.match(api.initialize(denied, manifest).warnings[0], /Access denied/);
    const quota = new Storage({ [first]: selected(1) });
    quota.setItem = () => { throw new Error("Quota exceeded"); };
    const original = quota.snapshot();
    assert.match(api.initialize(quota, manifest).warnings[0], /Quota exceeded/);
    assert.deepEqual(quota.snapshot(), original);
    assert.throws(() => api.reset(quota, manifest), /Quota exceeded/);
    assert.deepEqual(quota.snapshot(), original);
});

test("manifest rejects ambiguous aliases and links to retired/reference/self targets", () => {
    api.validateManifest(manifest);
    for (const id of [reference, predecessor, unique]) {
        const invalid = clone(manifest);
        invalid.items[1].related = [id];
        assert.throws(() => api.validateManifest(invalid), /Related controls/);
    }
    const invalid = clone(manifest);
    invalid.items[1].supersedes = [predecessor];
    assert.throws(() => api.validateManifest(invalid), /Ambiguous/);
});

test("documentation tracking preserves modernization query/fragment behavior and is idempotent", () => {
    for (const href of ["https://learn.microsoft.com/azure/aks/article#supported",
        "https://example.com/article?view=azure#section", "https://example.com/article?ref=old&view=azure#section"]) {
        const result = api.trackedUrl(href);
        const url = new URL(result);
        assert.equal(url.hash, new URL(href).hash);
        assert.equal(url.searchParams.get("view"), new URL(href).searchParams.get("view"));
        assert.deepEqual(url.searchParams.getAll("ref"), ["the-aks-checklist"]);
        assert.equal(api.trackedUrl(result), result);
    }
});

test("template embeds state before synchronous startup and never invokes unsafe positional legacy controller", () => {
    const template = fs.readFileSync(path.join(__dirname, "../tooling/html-generator/template.html"), "utf8");
    assert.ok(template.indexOf('id="checklist-manifest"') < template.indexOf('src="scripts/checklist-state.js"'));
    assert.match(template, /<script src="scripts\/checklist-state.js"><\/script>\s*<script>AksChecklistState.mount\(\);<\/script>/);
    assert.doesNotMatch(template, /<script[^>]+src="scripts\/app\.bundle\.js"/);
    assert.ok(template.includes('id="checklist-state-notice"'));
    const worker = fs.readFileSync(path.join(__dirname, "../../src/web/service-worker.js"), "utf8");
    assert.ok(worker.includes("./scripts/checklist-state.js"));
});

test("mount initializes documentation and navigation once, independently of related links, and dates reports", () => {
    const source = fs.readFileSync(path.join(__dirname, "../../src/web/scripts/checklist-state.js"), "utf8");
    for (const relatedCount of [0, 3]) {
        const listeners = new Map();
        const link = {
            href: "https://learn.microsoft.com/azure/aks/article?view=azure#supported",
            getAttribute() { return this.href; }
        };
        const related = Array.from({ length: relatedCount }, () => ({
            getAttribute: () => merged,
            addEventListener() {}
        }));
        const generatedDate = { textContent: "" };
        const embedded = { version: 1, items: [], legacy: { version: 1, sections: {} } };
        let documentationQueries = 0;
        const context = {
            URL,
            window: {
                localStorage: new Storage(),
                addEventListener(type, action) {
                    if (!listeners.has(type)) listeners.set(type, []);
                    listeners.get(type).push(action);
                }
            },
            document: {
                getElementById(id) {
                    if (id === "checklist-manifest") return { textContent: JSON.stringify(embedded) };
                    if (id === "js-main") return { querySelector: () => null };
                    if (id === "generated-date") return generatedDate;
                    return null;
                },
                querySelector: (selector) => selector === ".c-nav" ? {} : null,
                querySelectorAll(selector) {
                    if (selector === "[data-related-guid]") return related;
                    if (selector === ".js-details a[href]") {
                        documentationQueries++;
                        return [link];
                    }
                    return [];
                }
            }
        };
        vm.runInNewContext(source, context);
        context.AksChecklistState.mount();
        context.AksChecklistState.mount();
        assert.equal(documentationQueries, 1);
        assert.equal(listeners.get("scroll").length, 1);
        assert.equal(link.href, "https://learn.microsoft.com/azure/aks/article?view=azure&ref=the-aks-checklist#supported");
        listeners.get("beforeprint")[0]();
        assert.match(generatedDate.textContent, /^Report generated: .+/);
        listeners.get("afterprint")[0]();
    }
});

if (process.argv[2]) test("generated HTML embeds the frozen manifest, GUID anchors, applicability, related controls, and an unscored appendix", () => {
    const html = fs.readFileSync(process.argv[2], "utf8");
    const match = html.match(/<script type="application\/json" id="checklist-manifest">([^]*?)<\/script>/);
    assert.ok(match, "Generated page must include a manifest");
    const generated = JSON.parse(match[1]);
    api.validateManifest(generated);
    assert.deepEqual(generated.legacy, legacy);
    const active = generated.items.filter((item) => item.kind !== "reference");
    assert.equal((html.match(/class="c-checklist__item js-item /g) || []).length, active.length);
    assert.equal((html.match(/class="js-na"/g) || []).length, active.length);
    assert.equal((html.match(/class="checklist-priority-label"/g) || []).length, active.length);
    for (const item of generated.items) {
        assert.ok(html.includes('id="item-' + item.guid + '"'));
        assert.ok(html.includes('data-item-id="' + item.guid + '"'));
        for (const related of item.related) assert.ok(html.includes('href="#item-' + related + '"'));
        if (item.kind === "reference") {
            const element = html.slice(html.indexOf('id="item-' + item.guid + '"')).split("</li>")[0];
            assert.doesNotMatch(element, /type="checkbox"|data-item-priority|class="js-na"/);
        }
    }
    assert.equal((html.match(/class="checklist-applicability"/g) || []).length, generated.items.filter((item) => item.applicability).length);
    for (const priority of ["high", "medium", "low"]) {
        const row = html.match(new RegExp('class="c-notation__details__item js-detail-' + priority + '"([^]*?)</li>'))[1];
        const total = Number(row.match(/class="js-notation-total">(\d+)</)[1]);
        assert.equal(total, active.filter((item) => item.priority === priority).length);
    }
    assert.doesNotMatch(html, /%CHECKLIST_MANIFEST%|%CONTENT%/);
});

console.log(`${passed} checklist-state regression tests passed.`);
