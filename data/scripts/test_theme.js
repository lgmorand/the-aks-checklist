"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const api = require("../../src/web/scripts/theme.js");
const checklist = require("../../src/web/scripts/checklist-state.js");
let passed = 0;

function test(name, action) {
    action();
    passed++;
    console.log("PASS " + name);
}

class Storage {
    constructor(entries = {}) {
        this.entries = new Map(Object.entries(entries));
        this.reads = [];
        this.writes = [];
    }
    get length() { return this.entries.size; }
    key(index) { return [...this.entries.keys()][index] ?? null; }
    getItem(key) {
        this.reads.push(key);
        if (this.denyRead) throw new Error("Denied read");
        return this.entries.get(key) ?? null;
    }
    setItem(key, value) {
        if (this.denyWrite) throw new Error("Denied write");
        this.writes.push([key, value]);
        this.entries.set(key, String(value));
    }
    removeItem(key) { this.entries.delete(key); }
    snapshot() { return Object.fromEntries(this.entries); }
}

function fixture(options = {}) {
    const elements = new Map();
    const windowListeners = new Map();
    const mediaListeners = new Set();
    const attributes = new Map();
    const rootWrites = [];
    const storage = options.storage || new Storage(options.entries);
    const createElement = () => ({
        attributes: {},
        listeners: new Map(),
        hidden: false,
        textContent: "",
        setAttribute(name, value) { this.attributes[name] = value; },
        addEventListener(name, listener) {
            if (!this.listeners.has(name)) this.listeners.set(name, []);
            this.listeners.get(name).push(listener);
        },
        querySelector(selector) { return selector === ".theme-label" ? this.label : null; },
        appendChild(element) { elements.set(element.id, element); },
        click() { for (const listener of this.listeners.get("click") || []) listener(); }
    });
    const document = {
        documentElement: {
            getAttribute(name) { return attributes.get(name) ?? null; },
            setAttribute(name, value) {
                attributes.set(name, value);
                rootWrites.push([name, value]);
            }
        },
        getElementById(id) { return elements.get(id) || null; },
        createElement,
        body: null
    };
    const media = {
        matches: Boolean(options.dark),
        addEventListener(name, listener) {
            assert.equal(name, "change");
            mediaListeners.add(listener);
        }
    };
    const environment = {
        document,
        location: { search: options.search || "" },
        localStorage: storage,
        matchMedia: () => media,
        addEventListener(name, listener) {
            if (!windowListeners.has(name)) windowListeners.set(name, []);
            windowListeners.get(name).push(listener);
        }
    };
    if (options.noMatchMedia) delete environment.matchMedia;
    if (options.deniedGetter) {
        Object.defineProperty(environment, "localStorage", { get() { throw new Error("Denied storage"); } });
    }
    function markup(withStatus = true) {
        document.body = createElement();
        const button = createElement();
        button.parentNode = document.body;
        button.label = createElement();
        elements.set("theme-toggle", button);
        if (withStatus) elements.set("theme-status", createElement());
        return button;
    }
    function systemChange(dark) {
        media.matches = dark;
        for (const listener of mediaListeners) listener({ matches: dark });
    }
    function storageChange(value, key = api.STORAGE_KEY, storageArea = storage) {
        for (const listener of windowListeners.get("storage") || []) {
            listener({ key, newValue: value, storageArea });
        }
    }
    return {
        environment, document, storage, media, rootWrites, mediaListeners, windowListeners,
        markup, systemChange, storageChange,
        theme: () => attributes.get("data-theme"),
        status: () => elements.get("theme-status")
    };
}

test("only exact supported themes are accepted and URL parsing ignores invalid overrides", () => {
    for (const value of ["light", "dark"]) {
        assert.equal(api.isTheme(value), true);
        assert.equal(api.queryTheme("?scoutTheme=" + value), value);
    }
    for (const value of [null, undefined, "", "DARK", " dark", "dark ", "auto", {}, ["dark"]]) {
        assert.equal(api.isTheme(value), false);
    }
    for (const search of ["", "?scoutTheme=", "?scoutTheme=sepia", "?scoutTheme=%E0%A4%A", "?other=dark"]) {
        assert.equal(api.queryTheme(search), null);
    }
});

test("precedence is valid URL then raw saved preference then system, for every combination", () => {
    for (const url of [null, "", "invalid", "light", "dark"]) {
        for (const saved of [null, "invalid", '"dark"', "light", "dark"]) {
            for (const dark of [false, true]) {
                const expected = api.isTheme(url) ? { theme: url, source: "url" }
                    : api.isTheme(saved) ? { theme: saved, source: "storage" }
                        : { theme: dark ? "dark" : "light", source: "system" };
                assert.deepEqual(api.resolveTheme(url, saved, dark), expected);
                const view = fixture({
                    search: url === null ? "" : "?scoutTheme=" + encodeURIComponent(url),
                    entries: saved === null ? {} : { [api.STORAGE_KEY]: saved }, dark
                });
                const controller = api.createController(view.environment);
                assert.equal(view.theme(), expected.theme);
                assert.equal(controller.getState().source, expected.source);
                assert.equal(view.storage.writes.length, 0, "Initialization must not overwrite saved data");
            }
        }
    }
});

test("browser UMD initializes synchronously in the head and mounting never reapplies the root theme", () => {
    const view = fixture({ entries: { [api.STORAGE_KEY]: "dark" } });
    view.environment.URLSearchParams = URLSearchParams;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../../src/web/scripts/theme.js"), "utf8"), view.environment);
    assert.equal(view.theme(), "dark", "Theme must resolve before markup exists");
    const controller = view.environment.AksChecklistTheme;
    assert.equal(typeof controller.mount, "function");
    assert.equal(view.document.body, null);
    const writes = view.rootWrites.length;
    view.markup();
    controller.mount();
    controller.mount();
    assert.equal(view.rootWrites.length, writes, "Mount must not create a post-startup theme flash");
});

test("mount is repeatable before or after markup and binds one accessible toggle", () => {
    const view = fixture();
    const controller = api.createController(view.environment);
    assert.equal(controller.mount(), false);
    const button = view.markup();
    for (let index = 0; index < 3; index++) assert.equal(controller.mount(), true);
    assert.equal(button.listeners.get("click").length, 1);
    assert.equal(view.mediaListeners.size, 1);
    assert.equal(view.windowListeners.get("storage").length, 1);
    assert.equal(button.attributes.type, "button");
    assert.equal(button.attributes["aria-label"], "Switch to dark mode");
    assert.equal(button.attributes.title, "Switch to dark mode");
    assert.equal(button.attributes["aria-pressed"], "false");
    assert.equal(button.label.textContent, "Light");
    assert.equal(view.status().hidden, true);
    button.click();
    assert.equal(view.theme(), "dark");
    assert.equal(button.attributes["aria-label"], "Switch to light mode");
    assert.equal(button.attributes.title, "Switch to light mode");
    assert.equal(button.attributes["aria-pressed"], "true");
    assert.equal(button.label.textContent, "Dark");
    assert.deepEqual(view.storage.writes, [[api.STORAGE_KEY, "dark"]]);
    button.click();
    assert.equal(view.theme(), "light");
    assert.equal(view.storage.getItem(api.STORAGE_KEY), "light");
    const replacement = view.markup();
    controller.mount();
    controller.mount();
    assert.equal(replacement.listeners.get("click").length, 1);
});

test("system changes follow automatically only without an explicit choice", () => {
    const view = fixture();
    const controller = api.createController(view.environment);
    view.systemChange(true);
    assert.equal(view.theme(), "dark", "System listeners work even before mounting");
    const button = view.markup();
    controller.mount();
    view.systemChange(false);
    assert.equal(view.theme(), "light");
    assert.equal(button.label.textContent, "Light");
    button.click();
    view.systemChange(false);
    assert.equal(view.theme(), "dark");
    assert.equal(view.storage.writes.length, 1);
    for (const options of [{ entries: { [api.STORAGE_KEY]: "light" } }, { search: "?scoutTheme=light" }]) {
        const explicit = fixture(options);
        api.createController(explicit.environment);
        explicit.systemChange(true);
        assert.equal(explicit.theme(), "light");
        assert.equal(explicit.storage.writes.length, 0);
    }
});

test("missing or unavailable matchMedia falls back to light without breaking manual choice", () => {
    for (const unavailable of [false, true]) {
        const view = fixture({ noMatchMedia: true });
        if (unavailable) view.environment.matchMedia = () => { throw new Error("Not available"); };
        const controller = api.createController(view.environment);
        assert.equal(view.theme(), "light");
        const button = view.markup();
        controller.mount();
        button.click();
        assert.equal(view.theme(), "dark");
    }
    const legacy = fixture();
    delete legacy.media.addEventListener;
    legacy.media.addListener = (listener) => legacy.mediaListeners.add(listener);
    api.createController(legacy.environment);
    legacy.systemChange(true);
    assert.equal(legacy.theme(), "dark");
});

test("invalid saved data warns visibly and is preserved until an explicit choice", () => {
    const view = fixture({ entries: { [api.STORAGE_KEY]: '{"theme":"dark"}', unrelated: "keep" }, dark: true });
    const original = view.storage.snapshot();
    const controller = api.createController(view.environment);
    assert.equal(view.theme(), "dark");
    const button = view.markup();
    controller.mount();
    assert.equal(view.status().attributes.role, "status");
    assert.equal(view.status().attributes["aria-live"], "polite");
    assert.equal(view.status().hidden, false);
    assert.match(view.status().textContent, /invalid.*ignored/);
    assert.deepEqual(view.storage.snapshot(), original);
    button.click();
    assert.equal(view.storage.getItem(api.STORAGE_KEY), "light");
    assert.equal(view.status().hidden, true);
    assert.equal(view.storage.getItem("unrelated"), "keep");
});

test("denied reads or storage access expose notices and preserve originals while toggling in-session", () => {
    for (const deniedGetter of [false, true]) {
        const storage = new Storage({ [api.STORAGE_KEY]: "dark", project: "keep" });
        storage.denyRead = true;
        const original = storage.snapshot();
        const view = fixture({ storage, deniedGetter });
        const controller = api.createController(view.environment);
        const button = view.markup(false);
        controller.mount();
        assert.equal(view.status().hidden, false, "Notice must be created if template omitted it");
        assert.equal(view.status().attributes.role, "status");
        assert.match(view.status().textContent, /could not be read.*session-only.*not been changed/);
        button.click();
        assert.equal(view.theme(), "dark");
        view.systemChange(false);
        assert.equal(view.theme(), "dark", "A session-only choice still overrides system changes");
        button.click();
        assert.equal(view.theme(), "light");
        assert.deepEqual(storage.snapshot(), original);
        assert.equal(storage.writes.length, 0, "Never overwrite an unreadable original");
    }
});

test("denied writes leave old data intact and show a notice without disabling the toggle", () => {
    const view = fixture({ entries: { [api.STORAGE_KEY]: "dark", unrelated: "keep" } });
    view.storage.denyWrite = true;
    const original = view.storage.snapshot();
    const controller = api.createController(view.environment);
    const button = view.markup();
    controller.mount();
    button.click();
    assert.equal(view.theme(), "light");
    assert.equal(button.label.textContent, "Light");
    assert.equal(view.status().hidden, false);
    assert.match(view.status().textContent, /could not be saved.*still work.*not been changed/);
    assert.deepEqual(view.storage.snapshot(), original);
    button.click();
    assert.equal(view.theme(), "dark");
    view.storage.denyWrite = false;
    button.click();
    assert.equal(view.storage.getItem(api.STORAGE_KEY), "light");
    assert.equal(view.status().hidden, true, "Successful retry resolves the write warning");
});

test("cross-tab updates sync only the theme key and removal or clear resumes system tracking", () => {
    const view = fixture({ entries: { [api.STORAGE_KEY]: "light" } });
    const controller = api.createController(view.environment);
    const button = view.markup();
    controller.mount();
    view.storageChange("dark", "project-name");
    view.storageChange("dark", api.STORAGE_KEY, new Storage());
    assert.equal(view.theme(), "light");
    view.storageChange("dark");
    assert.equal(view.theme(), "dark");
    assert.equal(button.label.textContent, "Dark");
    assert.equal(controller.getState().source, "storage");
    view.systemChange(false);
    assert.equal(view.theme(), "dark");
    view.storageChange(null);
    assert.equal(view.theme(), "light");
    view.systemChange(true);
    assert.equal(view.theme(), "dark");
    view.storageChange("light");
    view.storageChange(null, null);
    assert.equal(view.theme(), "dark");
    assert.equal(controller.getState().source, "system");
    view.storageChange("invalid");
    assert.equal(view.theme(), "dark");
    assert.equal(view.status().hidden, false);
    view.storageChange("light");
    assert.equal(view.theme(), "light");
    assert.equal(view.status().hidden, true);
    assert.equal(view.storage.writes.length, 0, "Storage events must never write back");
});

test("URL overrides survive cross-tab removal but a manual choice supersedes the initial URL", () => {
    const view = fixture({ search: "?scoutTheme=dark", entries: { [api.STORAGE_KEY]: "light" } });
    const controller = api.createController(view.environment);
    const button = view.markup();
    controller.mount();
    view.storageChange("light");
    view.storageChange(null);
    view.storageChange(null, null);
    view.systemChange(false);
    assert.equal(view.theme(), "dark");
    button.click();
    assert.equal(view.theme(), "light");
    assert.equal(view.storage.getItem(api.STORAGE_KEY), "light");
    view.storageChange("dark");
    assert.equal(view.theme(), "dark");
    view.storageChange(null);
    assert.equal(view.theme(), "light");
    assert.equal(controller.getState().source, "system");
});

test("only the theme key is accessed by theme behavior and checklist reset leaves theme intact", () => {
    const original = {
        "aks-checklist:state:v2": '{"version":2,"items":{},"review":[]}',
        "project-name": '["Production"]', "developer-name": '["Reviewer"]',
        tag: '[{"filter":"cost"}]', "hide-sections": "[]", unrelated: "preserve"
    };
    const view = fixture({ entries: original });
    const controller = api.createController(view.environment);
    const button = view.markup();
    controller.mount();
    button.click();
    assert.deepEqual(view.storage.reads, [api.STORAGE_KEY]);
    assert.deepEqual(view.storage.writes, [[api.STORAGE_KEY, "dark"]]);
    for (const [key, value] of Object.entries(original)) assert.equal(view.storage.getItem(key), value);
    const guid = "00000000-0000-4000-8000-000000000001";
    const manifest = {
        version: 1, legacy: { version: 1, sections: { example: [guid] } },
        items: [{ guid, section: "example", priority: "high" }]
    };
    checklist.reset(view.storage, manifest);
    assert.equal(view.storage.getItem(api.STORAGE_KEY), "dark");
    assert.equal(view.theme(), "dark");
});

test("invalid explicit choices cannot change the DOM or saved theme and snapshots are independent", () => {
    const view = fixture();
    const controller = api.createController(view.environment);
    for (const value of ["", "system", null]) assert.throws(() => controller.setTheme(value), /light or dark/);
    assert.equal(view.theme(), "light");
    assert.equal(view.storage.writes.length, 0);
    const snapshot = controller.getState();
    snapshot.theme = "dark";
    snapshot.warnings.push("injected");
    assert.deepEqual(controller.getState(), { theme: "light", source: "system", warnings: [] });
});

test("the generator template initializes theme before styling and mounts the accessible toggle", () => {
    const template = fs.readFileSync(path.join(__dirname, "../tooling/html-generator/template.html"), "utf8");
    const early = template.indexOf('document.documentElement.setAttribute("data-theme", theme)');
    const script = template.indexOf('<script src="scripts/theme.js"></script>');
    const stylesheet = template.indexOf('<link rel="stylesheet" href="styles/checklist.css">');
    assert.ok(early > 0 && early < script && script < stylesheet, "Initial theme must resolve before rendering");
    assert.match(template, /<button[^>]+id="theme-toggle"[^>]+aria-label="Switch to dark mode"[^>]+aria-pressed="false"/);
    for (const selector of ["theme-icon-sun", "theme-icon-moon", "theme-label", 'id="theme-status"']) {
        assert.ok(template.includes(selector), selector);
    }
    assert.match(template, /AksChecklistState\.mount\(\);<\/script>\s*<script>AksChecklistTheme\.mount\(\);<\/script>/);
    assert.doesNotMatch(template, /main\.min\.css|app\.bundle\.js/);
    const worker = fs.readFileSync(path.join(__dirname, "../../src/web/service-worker.js"), "utf8");
    for (const asset of ["./scripts/theme.js", "./styles/checklist.css"]) assert.ok(worker.includes(asset));
});

test("both themes share responsive, keyboard-accessible and light-print component styling", () => {
    const stylesheet = fs.readFileSync(path.join(__dirname, "../../src/web/styles/checklist.css"), "utf8");
    for (const contract of [
        'html[data-theme="dark"]', "color-scheme: dark", "linear-gradient(",
        ":focus-visible", "prefers-reduced-motion: reduce", "@media print",
        "@media (max-width: 760px)", '[data-item-visible="false"]',
        ".theme-icon-sun", ".theme-icon-moon"
    ]) assert.ok(stylesheet.includes(contract), contract);
    const printStyles = stylesheet.slice(stylesheet.indexOf("@media print"));
    assert.match(printStyles, /color-scheme: light/);
    assert.match(printStyles, /--cp-bg: #ffffff/);
    assert.doesNotMatch(stylesheet, /@import|https?:\/\//, "Styling must not depend on remote fonts or styles");
});

test("website branding matches the field guide's deep blue palette in both themes and print", () => {
    const stylesheet = fs.readFileSync(path.join(__dirname, "../../src/web/styles/checklist.css"), "utf8");
    const light = stylesheet.match(/^:root \{([^]*?)\}/)[1];
    const dark = stylesheet.match(/html\[data-theme="dark"\] \{([^]*?)\}/)[1];
    const print = stylesheet.slice(stylesheet.indexOf("@media print"));
    assert.match(light, /--cp-hero-start: #102a43/);
    assert.match(light, /--cp-hero-middle: #124c70/);
    assert.match(light, /--cp-accent: #124c70/);
    assert.match(dark, /--cp-bg: #0b1727/);
    assert.match(dark, /--cp-accent: #8bd3f4/);
    assert.match(print, /--cp-accent: #124c70/);
    assert.match(print, /--cp-hero-text: var\(--cp-text\)/);
    assert.doesNotMatch(stylesheet, /#b11f4b|#9a1a41|#fd8ea1|#fb7b91|rgba\(177, 31, 75|rgba\(253, 142, 161/i);
});

console.log(`Theme behavior: ${passed} tests passed.`);
