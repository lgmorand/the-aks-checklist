(function (root, factory) {
    "use strict";
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    else root.AksChecklistState = api;
}(typeof globalThis === "object" ? globalThis : this, function () {
    "use strict";

    const STATE_KEY = "aks-checklist:state:v2";
    const BACKUP_KEY = "aks-checklist:legacy-backup:v1";
    const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
    const checks = (manifest) => manifest.items.filter((item) => item.kind !== "reference");
    const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
    let mounted = false;

    function validateManifest(manifest) {
        if (!isObject(manifest) || manifest.version !== 1 || !Array.isArray(manifest.items) ||
            !isObject(manifest.legacy) || manifest.legacy.version !== 1 || !isObject(manifest.legacy.sections)) {
            throw new Error("Missing or invalid embedded migration manifest.");
        }
        const ids = new Set();
        const aliases = new Set();
        for (const [section, legacyIds] of Object.entries(manifest.legacy.sections)) {
            if (!section || !Array.isArray(legacyIds) || legacyIds.some((id) => !GUID.test(id))) {
                throw new Error("Invalid frozen legacy section map.");
            }
        }
        for (const item of manifest.items) {
            if (!isObject(item) || !GUID.test(item.guid) || ids.has(item.guid) ||
                !own(manifest.legacy.sections, item.section) ||
                !["high", "medium", "low"].includes(item.priority) ||
                ![undefined, "check", "reference"].includes(item.kind) ||
                (item.applicability != null && (typeof item.applicability !== "string" || !item.applicability.trim())) ||
                (item.supersedes !== undefined && !Array.isArray(item.supersedes)) ||
                (item.related !== undefined && !Array.isArray(item.related))) {
                throw new Error("Invalid or duplicate canonical control in migration manifest.");
            }
            ids.add(item.guid);
            for (const id of item.supersedes || []) {
                if (!GUID.test(id) || id === item.guid || aliases.has(id)) throw new Error("Ambiguous superseded control.");
                aliases.add(id);
            }
        }
        if ([...aliases].some((id) => ids.has(id))) throw new Error("A superseded control is still active.");
        const activeChecks = new Set(checks(manifest).map((item) => item.guid));
        for (const item of manifest.items) {
            if ((item.related || []).some((id) => id === item.guid || !activeChecks.has(id))) {
                throw new Error("Related controls must target active checks.");
            }
        }
    }

    function emptyState(manifest) {
        return { version: 2, items: Object.fromEntries(checks(manifest).map((item) => [item.guid, "open"])), review: [] };
    }

    function parseState(raw) {
        const state = JSON.parse(raw);
        if (!isObject(state) || state.version !== 2 || !isObject(state.items) ||
            !Array.isArray(state.review) || state.review.some((id) => typeof id !== "string" || !GUID.test(id)) ||
            Object.entries(state.items).some(([id, status]) => !GUID.test(id) || !["open", "fulfilled", "na"].includes(status))) {
            throw new Error("Malformed GUID checklist state.");
        }
        return state;
    }

    function parseLegacy(rawSections, legacy) {
        const checked = new Set();
        for (const [section, raw] of Object.entries(rawSections)) {
            const entries = JSON.parse(raw);
            if (!Array.isArray(entries)) throw new Error("Malformed saved section: " + section);
            for (const entry of entries) {
                if (!isObject(entry) || typeof entry.id !== "string" || !/^(0|[1-9][0-9]*)$/.test(entry.id) ||
                    !Number.isSafeInteger(Number(entry.id)) || Number(entry.id) >= legacy.sections[section].length ||
                    (entry.state !== undefined && entry.state !== "checked")) {
                    throw new Error("Invalid legacy position in section: " + section);
                }
                checked.add(legacy.sections[section][Number(entry.id)]);
            }
        }
        return checked;
    }

    function migrateLegacy(manifest, rawSections) {
        const checked = parseLegacy(rawSections, manifest.legacy);
        const legacyIds = new Set(Object.values(manifest.legacy.sections).flat());
        const state = emptyState(manifest);
        for (const item of checks(manifest)) {
            const predecessors = [item.guid, ...(item.supersedes || [])].filter((id) => legacyIds.has(id));
            const selected = predecessors.filter((id) => checked.has(id)).length;
            if (predecessors.length && selected === predecessors.length) state.items[item.guid] = "fulfilled";
            else if (selected) state.review.push(item.guid);
        }
        return state;
    }

    function reconcile(manifest, previous) {
        const state = emptyState(manifest);
        for (const item of checks(manifest)) {
            state.items[item.guid] = previous.items[item.guid] || "open";
            const retired = (item.supersedes || []).filter((id) => own(previous.items, id));
            if (retired.length) {
                const statuses = [state.items[item.guid], ...retired.map((id) => previous.items[id])];
                state.items[item.guid] = statuses.every((status) => status === "fulfilled") ? "fulfilled" : "open";
                if (state.items[item.guid] === "open" && statuses.some((status) => status !== "open")) state.review.push(item.guid);
            }
            if (previous.review.includes(item.guid) && !state.review.includes(item.guid)) state.review.push(item.guid);
        }
        return state;
    }

    function initialize(storage, manifest) {
        validateManifest(manifest);
        const result = { state: emptyState(manifest), warnings: [], writable: true };
        try {
            const rawState = storage.getItem(STATE_KEY);
            if (rawState !== null) {
                result.state = reconcile(manifest, parseState(rawState));
                return result;
            }
            const rawSections = {};
            for (const section of Object.keys(manifest.legacy.sections)) {
                const raw = storage.getItem(section);
                if (raw !== null) rawSections[section] = raw;
            }
            result.state = migrateLegacy(manifest, rawSections);
            if (Object.keys(rawSections).length) {
                const backup = storage.getItem(BACKUP_KEY);
                if (backup !== null) {
                    const parsed = JSON.parse(backup);
                    if (!isObject(parsed) || parsed.version !== 1 || !isObject(parsed.sections) ||
                        Object.values(parsed.sections).some((raw) => typeof raw !== "string")) {
                        throw new Error("The existing raw migration backup is malformed.");
                    }
                } else {
                    storage.setItem(BACKUP_KEY, JSON.stringify({ version: 1, sections: rawSections }));
                }
            }
            storage.setItem(STATE_KEY, JSON.stringify(result.state));
        } catch (error) {
            result.state = emptyState(manifest);
            result.writable = false;
            result.warnings.push("Saved checklist data could not be safely read or migrated: " + error.message +
                " Originals have not been overwritten. Changes are session-only until you explicitly start a new checklist.");
        }
        return result;
    }

    function setStatus(state, manifest, guid, status) {
        if (!["open", "fulfilled", "na"].includes(status) || !checks(manifest).some((item) => item.guid === guid)) {
            throw new Error("Invalid control or checklist status.");
        }
        return {
            version: 2,
            items: { ...state.items, [guid]: status },
            review: state.review.filter((id) => id !== guid)
        };
    }

    function bulkStatus(state, manifest, section, fulfilled) {
        let next = state;
        for (const item of checks(manifest)) {
            if (item.section === section && state.items[item.guid] !== "na") {
                next = setStatus(next, manifest, item.guid, fulfilled ? "fulfilled" : "open");
            }
        }
        return next;
    }

    function score(state, items) {
        const controls = items.filter((item) => item.kind !== "reference");
        const na = controls.filter((item) => state.items[item.guid] === "na").length;
        const fulfilled = controls.filter((item) => state.items[item.guid] === "fulfilled").length;
        const total = controls.length - na;
        return { fulfilled, total, na, open: total - fulfilled, percent: total ? Math.floor(100 * fulfilled / total) : 0 };
    }

    function trackedUrl(href) {
        const url = new URL(href);
        if (url.protocol === "http:" || url.protocol === "https:") url.searchParams.set("ref", "the-aks-checklist");
        return url.href;
    }

    function rawRecovery(storage, manifest, includeResetBackups = true) {
        const keys = [STATE_KEY, BACKUP_KEY, ...Object.keys(manifest.legacy.sections), "tag", "hide-sections"];
        if (includeResetBackups) {
            for (let index = 0; index < storage.length; index++) {
                const key = storage.key(index);
                if (key && key.startsWith("aks-checklist:reset-backup:")) keys.push(key);
            }
        }
        return Object.fromEntries(keys.map((key) => [key, storage.getItem(key)]).filter(([, raw]) => raw !== null));
    }

    function reset(storage, manifest) {
        const state = emptyState(manifest);
        const recovery = rawRecovery(storage, manifest, false);
        // Keep even malformed data recoverable before an explicit reset replaces it.
        const prefix = "aks-checklist:reset-backup:" + Date.now();
        let backupKey = prefix;
        let suffix = 0;
        while (storage.getItem(backupKey) !== null) backupKey = prefix + "-" + (++suffix);
        storage.setItem(backupKey, JSON.stringify(recovery));
        // A valid empty GUID state is also the tombstone: raw backups are never replayed.
        storage.setItem(STATE_KEY, JSON.stringify(state));
        for (const key of [...Object.keys(manifest.legacy.sections), "tag", "hide-sections"]) storage.removeItem(key);
        return state;
    }

    function mount() {
        if (mounted) return;
        mounted = true;
        const notice = document.getElementById("checklist-state-notice");
        const announce = (message) => {
            if (notice) {
                notice.hidden = false;
                notice.textContent = message;
            }
        };
        let manifest;
        let storage;
        let model;
        try {
            manifest = JSON.parse(document.getElementById("checklist-manifest").textContent);
            validateManifest(manifest);
            storage = window.localStorage;
            model = initialize(storage, manifest);
        } catch (error) {
            announce("Checklist state is unavailable: " + error.message + " Saved data has not been changed.");
            document.querySelectorAll(".js-item input, .js-na, .js-check-all, .js-uncheck-all").forEach((el) => { el.disabled = true; });
            return;
        }
        const controls = checks(manifest);
        const elements = new Map(controls.map((item) => [item.guid, document.getElementById("item-" + item.guid)]));
        const corruptPreferences = new Set();
        let filter = "all";
        const warningText = () => {
            const messages = [...model.warnings];
            if (model.state.review.length) {
                const names = controls.filter((item) => model.state.review.includes(item.guid)).map((item) => item.title);
                messages.push("Review needed: merged controls had conflicting or partial predecessor answers and remain Open: " + names.join("; ") + ".");
            }
            if (messages.length) messages.push("Raw recovery: AksChecklistState.recovery() in the browser console; original migration backup key: " + BACKUP_KEY + ". Backups are never replayed after reset.");
            if (notice) {
                notice.hidden = !messages.length;
                notice.textContent = messages.join(" ");
            }
        };
        const persist = () => {
            if (!model.writable) return;
            try {
                storage.setItem(STATE_KEY, JSON.stringify(model.state));
            } catch (error) {
                model.warnings.push("Saving failed: " + error.message + ". Changes are session-only.");
                model.writable = false;
            }
        };
        const writePreference = (key, value) => {
            if (!model.writable || corruptPreferences.has(key)) return;
            try { storage.setItem(key, JSON.stringify(value)); }
            catch (error) {
                model.warnings.push("Could not save " + key + ": " + error.message);
                warningText();
            }
        };
        const setDropdown = (element, open) => {
            element.setAttribute("data-item-dropdown", open ? "open" : "close");
            const button = element.querySelector(".js-dropdown");
            if (button) button.setAttribute("aria-expanded", String(open));
            const details = element.querySelector(".js-details");
            if (details) details.hidden = !open;
            const arrow = element.querySelector(".icon-arrow");
            if (arrow) arrow.classList.toggle("icon-rotate", !open);
            if (open) element.querySelectorAll("img[data-src]").forEach((image) => {
                image.src = image.getAttribute("data-src");
                image.removeAttribute("data-src");
            });
        };
        const summary = (value) => value.fulfilled + "/" + value.total + " Fulfilled; " + value.na + " N/A excluded; " + value.open + " Open" +
            (value.total ? "" : " — no applicable controls");
        const updateProgress = (scope, value, selector) => {
            const progress = scope.querySelector(selector);
            if (!progress) return;
            progress.value = value.percent;
            const label = scope.querySelector(".c-progress__label");
            if (label) label.textContent = value.percent + " %";
            const text = scope.querySelector(".c-progress__text");
            if (text) text.textContent = " " + summary(value);
        };
        const render = () => {
            for (const item of controls) {
                const element = elements.get(item.guid);
                if (!element) continue;
                const status = model.state.items[item.guid];
                element.setAttribute("data-item-state", status);
                element.setAttribute("data-item-check", String(status === "fulfilled"));
                const checkbox = element.querySelector("input[type=checkbox]");
                checkbox.checked = status === "fulfilled";
                checkbox.disabled = status === "na";
                const naButton = element.querySelector(".js-na");
                naButton.setAttribute("aria-pressed", String(status === "na"));
                naButton.textContent = status === "na" ? "Applies — restore Open" : "Mark N/A";
                element.querySelector(".js-item-status").textContent = status === "na" ? "N/A — excluded, not Fulfilled" :
                    status === "fulfilled" ? "Fulfilled" : model.state.review.includes(item.guid) ? "Open — review merged answers" : "Open";
            }
            document.querySelectorAll(".js-section").forEach((section) => {
                const slug = section.getAttribute("data-section");
                const value = score(model.state, controls.filter((item) => item.section === slug));
                updateProgress(section, value, ".js-progress");
                const nav = document.getElementById("js-nav-" + slug);
                if (nav) {
                    nav.setAttribute("data-notation", String(value.percent));
                    nav.setAttribute("aria-label", summary(value));
                    nav.title = summary(value);
                }
            });
            const total = score(model.state, controls);
            const main = document.getElementById("js-main");
            updateProgress(main, total, ".js-all-progress");
            const overall = document.getElementById("checklist-overall-status");
            if (overall) overall.textContent = summary(total) + ". N/A is a reviewer decision, never automatic.";
            for (const priority of ["high", "medium", "low"]) {
                const value = score(model.state, controls.filter((item) => item.priority === priority));
                const element = document.querySelector(".js-detail-" + priority);
                if (!element) continue;
                element.querySelector(".js-notation-checked").textContent = value.fulfilled;
                element.querySelector(".js-notation-total").textContent = value.total;
                let excluded = element.querySelector(".checklist-priority-na");
                if (!excluded) {
                    excluded = document.createElement("span");
                    excluded.className = "checklist-priority-na";
                    element.appendChild(excluded);
                }
                excluded.textContent = " (" + value.na + " N/A excluded)";
            }
            const notation = document.getElementById("js-notation");
            if (notation) {
                notation.setAttribute("data-notation", String(total.percent));
                notation.querySelector(".c-notation__letter").textContent = !total.total ? "—" :
                    total.percent <= 20 ? "F" : total.percent <= 40 ? "E" : total.percent <= 60 ? "D" :
                    total.percent <= 80 ? "C" : total.percent < 100 ? "B" : "A";
            }
            warningText();
        };
        const change = (next) => {
            model.state = next;
            persist();
            render();
        };
        const applyFilter = (tag) => {
            filter = tag;
            document.querySelectorAll(".js-item, .js-reference").forEach((element) => {
                const visible = tag === "all" || element.classList.contains(tag);
                element.setAttribute("data-item-visible", String(visible));
                element.setAttribute("aria-hidden", String(!visible));
            });
            document.querySelectorAll(".js-filter-tag").forEach((button) => {
                const active = button.getAttribute("data-tag") === tag;
                button.classList.toggle("filter-active", active);
                button.setAttribute("aria-pressed", String(active));
            });
        };
        try {
            const rawFilter = storage.getItem("tag");
            if (rawFilter !== null) {
                const saved = JSON.parse(rawFilter);
                if (!Array.isArray(saved) || saved.length !== 1 || !isObject(saved[0]) ||
                    typeof saved[0].filter !== "string" || !Array.from(document.querySelectorAll(".js-filter-tag")).some((button) => button.getAttribute("data-tag") === saved[0].filter)) {
                    throw new Error("Malformed tag filter.");
                }
                filter = saved[0].filter;
            }
        } catch (error) {
            corruptPreferences.add("tag");
            model.warnings.push("The saved filter was not restored or overwritten: " + error.message);
        }
        for (const item of controls) {
            const element = elements.get(item.guid);
            if (!element) continue;
            element.querySelector("input[type=checkbox]").addEventListener("change", (event) => {
                if (model.state.items[item.guid] === "na") return;
                const status = event.target.checked ? "fulfilled" : "open";
                change(setStatus(model.state, manifest, item.guid, status));
                if (status === "fulfilled") setDropdown(element, false);
            });
            element.querySelector(".js-na").addEventListener("click", () => {
                change(setStatus(model.state, manifest, item.guid, model.state.items[item.guid] === "na" ? "open" : "na"));
            });
            const dropdown = element.querySelector(".js-dropdown");
            if (dropdown) dropdown.addEventListener("click", () => setDropdown(element, element.getAttribute("data-item-dropdown") !== "open"));
            setDropdown(element, model.state.items[item.guid] !== "fulfilled");
        }
        document.querySelectorAll(".js-section").forEach((section) => {
            const slug = section.getAttribute("data-section");
            for (const [selector, fulfilled] of [[".js-check-all", true], [".js-uncheck-all", false]]) {
                const button = section.querySelector(selector);
                if (button) button.addEventListener("click", () => {
                    change(bulkStatus(model.state, manifest, slug, fulfilled));
                    section.querySelectorAll(".js-item").forEach((element) => {
                        if (element.getAttribute("data-item-state") !== "na") setDropdown(element, !fulfilled);
                    });
                });
            }
            for (const [selector, open] of [[".js-expand-all", true], [".js-collapse-all", false]]) {
                const button = section.querySelector(selector);
                if (button) button.addEventListener("click", () => section.querySelectorAll(".js-item").forEach((element) => setDropdown(element, open)));
            }
        });
        document.querySelectorAll(".js-filter-tag").forEach((button) => button.addEventListener("click", () => {
            applyFilter(button.getAttribute("data-tag"));
            writePreference("tag", [{ filter }]);
        }));
        document.querySelectorAll("[data-related-guid]").forEach((link) => {
            const target = controls.find((item) => item.guid === link.getAttribute("data-related-guid"));
            if (target) link.textContent = target.title;
            link.addEventListener("click", () => {
                applyFilter("all");
                const element = target && elements.get(target.guid);
                if (element) setDropdown(element, true);
            });
        });
        document.querySelectorAll(".js-details a[href]").forEach((link) => {
            if (link.getAttribute("href").startsWith("#")) return;
            try { link.href = trackedUrl(link.href); }
            catch (error) {
                model.warnings.push("A documentation link could not be tracked: " + error.message);
            }
        });
        const nav = document.querySelector(".c-nav");
        if (nav) window.addEventListener("scroll", () => {
            const rect = nav.getBoundingClientRect();
            nav.classList.toggle("c-nav__sidebar", window.innerWidth > 1265 && !(rect.top >= 0 && rect.bottom <= window.innerHeight));
        }, { passive: true });
        const project = document.getElementById("project-name");
        if (project) {
            let valid = true;
            try {
                const raw = storage.getItem(project.name);
                if (raw !== null) {
                    const value = JSON.parse(raw);
                    if (!Array.isArray(value) || value.length !== 1 || typeof value[0] !== "string") throw new Error("Malformed project name.");
                    project.value = value[0];
                }
            } catch (error) {
                valid = false;
                model.warnings.push("Project metadata was preserved without changes: " + error.message);
            }
            project.addEventListener("blur", () => { if (valid) writePreference(project.name, [project.value]); });
        }
        const resetButton = document.querySelector(".js-reset-all");
        if (resetButton) resetButton.addEventListener("click", () => {
            try {
                model.state = reset(storage, manifest);
                model.writable = true;
                model.warnings = [];
                corruptPreferences.clear();
                applyFilter("all");
                elements.forEach((element) => { if (element) setDropdown(element, true); });
                render();
            } catch (error) {
                announce("Reset could not complete safely: " + error.message + ". Raw saved data remains recoverable.");
            }
        });
        const printButton = document.querySelector(".js-print");
        if (printButton) printButton.addEventListener("click", () => window.print());
        let beforePrint;
        window.addEventListener("beforeprint", () => {
            const generated = document.getElementById("generated-date");
            if (generated) generated.textContent = "Report generated: " + new Date().toLocaleString();
            beforePrint = { filter, dropdowns: [...elements].map(([id, element]) => [id, element && element.getAttribute("data-item-dropdown")]) };
            applyFilter("all");
            elements.forEach((element) => { if (element) setDropdown(element, true); });
        });
        window.addEventListener("afterprint", () => {
            if (!beforePrint) return;
            applyFilter(beforePrint.filter);
            beforePrint.dropdowns.forEach(([id, status]) => {
                const element = elements.get(id);
                if (element) setDropdown(element, status === "open");
            });
        });
        api.recovery = () => rawRecovery(storage, manifest);
        applyFilter(filter);
        render();
    }

    const api = { STATE_KEY, BACKUP_KEY, validateManifest, emptyState, parseState, migrateLegacy, reconcile, initialize, setStatus, bulkStatus, score, trackedUrl, rawRecovery, reset, mount };
    return api;
}));
