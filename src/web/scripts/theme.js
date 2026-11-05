(function (root, factory) {
    "use strict";
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    else root.AksChecklistTheme = api.createController(root);
}(typeof globalThis === "object" ? globalThis : this, function () {
    "use strict";

    const STORAGE_KEY = "aks-checklist:theme:v1";
    const INVALID_STORAGE = "The saved theme preference is invalid and has been ignored. Choose a theme to replace it.";
    const READ_FAILURE = "Your saved theme preference could not be read. Theme changes are session-only; saved data has not been changed.";
    const WRITE_FAILURE = "Your theme preference could not be saved. Theme changes still work in this tab; previously saved data has not been changed.";

    function isTheme(value) {
        return value === "light" || value === "dark";
    }

    function queryTheme(search) {
        const value = new URLSearchParams(search).get("scoutTheme");
        return isTheme(value) ? value : null;
    }

    function resolveTheme(urlTheme, storedTheme, prefersDark) {
        if (isTheme(urlTheme)) return { theme: urlTheme, source: "url" };
        if (isTheme(storedTheme)) return { theme: storedTheme, source: "storage" };
        return { theme: prefersDark ? "dark" : "light", source: "system" };
    }

    function createController(environment) {
        const document = environment.document;
        const warnings = new Set();
        const buttons = new WeakSet();
        let mounted = false;
        let storage;
        let readFailed = false;
        let media = null;
        let storedTheme = null;
        let urlOverride = queryTheme(environment.location ? environment.location.search : "");
        try {
            if (typeof environment.matchMedia === "function") {
                media = environment.matchMedia("(prefers-color-scheme: dark)");
            }
        } catch (_) {
            // Some embedded browsers expose matchMedia without allowing its use.
        }
        try {
            storage = environment.localStorage;
            storedTheme = storage.getItem(STORAGE_KEY);
            if (storedTheme !== null && !isTheme(storedTheme)) warnings.add(INVALID_STORAGE);
        } catch (_) {
            readFailed = true;
            warnings.add(READ_FAILURE);
        }

        let current = resolveTheme(urlOverride, storedTheme, Boolean(media && media.matches));

        function render() {
            if (!mounted) return;
            const button = document.getElementById("theme-toggle");
            if (button) {
                const action = current.theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
                button.setAttribute("type", "button");
                button.setAttribute("aria-label", action);
                button.setAttribute("title", action);
                button.setAttribute("aria-pressed", String(current.theme === "dark"));
                const label = button.querySelector(".theme-label");
                if (label) label.textContent = current.theme === "dark" ? "Dark" : "Light";
            }
            let status = document.getElementById("theme-status");
            if (!status && warnings.size && document.body) {
                status = document.createElement("p");
                status.id = "theme-status";
                if (button && button.parentNode) button.parentNode.appendChild(status);
                else document.body.appendChild(status);
            }
            if (status) {
                status.setAttribute("role", "status");
                status.setAttribute("aria-live", "polite");
                status.textContent = [...warnings].join(" ");
                status.hidden = !warnings.size;
            }
        }

        function apply(theme, source) {
            current = { theme, source };
            if (document.documentElement.getAttribute("data-theme") !== theme) {
                document.documentElement.setAttribute("data-theme", theme);
            }
            render();
        }

        function setTheme(theme) {
            if (!isTheme(theme)) throw new TypeError("Theme must be light or dark.");
            // A manual choice supersedes the URL's initial override for this tab.
            urlOverride = null;
            if (!readFailed) {
                try {
                    storage.setItem(STORAGE_KEY, theme);
                    warnings.delete(INVALID_STORAGE);
                    warnings.delete(WRITE_FAILURE);
                } catch (_) {
                    warnings.add(WRITE_FAILURE);
                }
            }
            apply(theme, "user");
        }

        function toggle() {
            setTheme(current.theme === "dark" ? "light" : "dark");
        }

        function mount() {
            mounted = true;
            const button = document.getElementById("theme-toggle");
            if (button && !buttons.has(button)) {
                button.addEventListener("click", toggle);
                buttons.add(button);
            }
            render();
            return Boolean(button);
        }

        function onSystemChange(event) {
            if (current.source === "system") apply(event.matches ? "dark" : "light", "system");
        }

        function onStorageChange(event) {
            if (event.key !== STORAGE_KEY && event.key !== null) return;
            if (event.storageArea && storage && event.storageArea !== storage) return;
            if (urlOverride) return;
            const value = event.key === null ? null : event.newValue;
            if (value !== null && !isTheme(value)) warnings.add(INVALID_STORAGE);
            else warnings.delete(INVALID_STORAGE);
            const next = resolveTheme(null, value, Boolean(media && media.matches));
            apply(next.theme, next.source);
        }

        apply(current.theme, current.source);
        if (media && typeof media.addEventListener === "function") media.addEventListener("change", onSystemChange);
        else if (media && typeof media.addListener === "function") media.addListener(onSystemChange);
        if (typeof environment.addEventListener === "function") environment.addEventListener("storage", onStorageChange);

        return {
            mount,
            setTheme,
            toggle,
            getState: () => ({ ...current, warnings: [...warnings] })
        };
    }

    return { STORAGE_KEY, isTheme, queryTheme, resolveTheme, createController };
}));
