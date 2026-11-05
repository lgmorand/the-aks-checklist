# Checklist publishing tools

The website shell is maintained in [html-generator/template.html](html-generator/template.html). The canonical content lives in [the English item files](../en/items/) and [the section catalogue](../en/project/catalog.json).

Run commands from the repository root:

```shell
npm ci
npx playwright install chromium
npm run documents
npm test
npm run test:documents
npm run test:ui
npm run check:links
```

The shared Node pipeline in [scripts/](../../scripts/) validates every registered section and generates the website, Azure Review Checklist JSON, standalone HTML, editable Word document, and tagged PDF. The legacy .NET generator, Python transformation, and append-only shell/LaTeX export paths have been replaced so new sections cannot be silently omitted from an output.

English is currently the only maintained content language. The previous localization-count script referenced translations that are not present and did not verify semantic equivalence. If translations are introduced, retain canonical GUIDs and add language-aware validation before exposing a language selector.

See the [main README](../../README.md) for the architecture, exact commands, generated outputs, and contribution requirements.
