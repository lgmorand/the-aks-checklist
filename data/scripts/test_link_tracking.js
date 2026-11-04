const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const bundle = fs.readFileSync(
  path.join(__dirname, "../../src/web/scripts/app.bundle.js"), "utf8"
);
const match = bundle.match(/\{key:"addRef",value:(function\(\).*?)\},\s*\{key:"enableAnalytics"/);
assert.ok(match, "The bundled link-tracking method must exist");
const links = [
  "https://learn.microsoft.com/azure/aks/article#supported",
  "https://example.com/article?view=azure#section",
  "https://example.com/article?ref=old&view=azure#section",
].map((href) => ({
  href,
  setAttribute(name, value) {
    assert.equal(name, "href");
    this.href = value;
  },
}));
const context = {
  URL,
  document: { querySelectorAll: () => [{ querySelectorAll: () => links }] },
};
vm.runInNewContext(`(${match[1]})()`, context);
assert.equal(links[0].href, "https://learn.microsoft.com/azure/aks/article?ref=the-aks-checklist#supported");
for (const link of links.slice(1)) {
  const url = new URL(link.href);
  assert.equal(url.hash, "#section");
  assert.equal(url.searchParams.get("view"), "azure");
  assert.deepEqual(url.searchParams.getAll("ref"), ["the-aks-checklist"]);
}
const first = links.map((link) => link.href);
vm.runInNewContext(`(${match[1]})()`, context);
assert.deepEqual(links.map((link) => link.href), first);
console.log("Link tracking preserves fragments and queries and is idempotent.");
