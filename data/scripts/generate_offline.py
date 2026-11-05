"""Build styled offline Markdown/HTML and optional PDF/Word from canonical JSON."""

import argparse
import html
import os
import shutil
import subprocess
import tempfile
from datetime import date
from pathlib import Path

from checklist import CATEGORIES, ROOT, is_check, load_items

INTRODUCTION = (
    "An architecture review aid, not a certification or a guarantee of production readiness. "
    "Apply checks according to workload requirements, risk, region and service support. "
    "Record exceptions and evidence. Verify current feature availability, retirement notices "
    "and pricing in the linked documentation before implementation. "
    "Conditional checks require an applicability decision; record Not applicable separately "
    "from Fulfilled. Reference guidance is not scored."
)
STYLE = """
@page {
  size: A4; margin: 17mm 17mm 19mm;
  @top-left { content: "AKS  /  ARCHITECTURE FIELD GUIDE"; font: 7.5pt Arial; color: #526779; }
  @top-right { content: "THE AKS CHECKLIST"; font: 7.5pt Arial; color: #526779; }
  @bottom-left { content: "The AKS Checklist"; font: 8pt Arial; color: #526779; }
  @bottom-right { content: counter(page) " / " counter(pages); font: 8pt Arial; color: #526779; }
}
@page :first {
  @top-left { content: none; } @top-right { content: none; }
  @bottom-left { content: none; } @bottom-right { content: none; }
}
:root {
  color-scheme: light; --navy: #102a43; --azure: #0078d4; --teal: #008c95;
  --ink: #243b53; --muted: #526779; --line: #d7e3ed; --pale: #eaf3fa;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; scroll-padding-top: 24px; }
body { margin: 0; background: #edf2f7; color: var(--ink); font: 15px/1.65 Arial, sans-serif; }
main { max-width: 1120px; margin: 36px auto 64px; }
h1, h2, h3, p { margin: 0; }
h1, h2, h3 { color: var(--navy); line-height: 1.22; }
a { color: #0067b8; text-underline-offset: 3px; overflow-wrap: anywhere; }
a:hover { color: #004578; }
a:focus-visible { outline: 3px solid var(--teal); outline-offset: 4px; }
p, li { orphans: 3; widows: 3; }
.eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; }
.cover {
  position: relative; overflow: hidden; padding: 64px 60px 48px; color: #fff;
  background: linear-gradient(125deg, #102a43 15%, #124c70 75%, #006b76);
  border-radius: 20px; box-shadow: 0 16px 40px #102a4320;
}
.cover::after {
  content: ""; position: absolute; width: 380px; height: 380px; right: -170px; top: -150px;
  border: 60px solid #ffffff0d; border-radius: 50%; pointer-events: none;
}
.cover-content { position: relative; z-index: 1; }
.cover .eyebrow { color: #9cdeee; margin-bottom: 34px; }
.cover h1 { color: #fff; font-size: 51px; max-width: 760px; letter-spacing: -1.6px; }
.cover-subtitle { margin-top: 22px; font-size: 21px; color: #b6e4f0; }
.cover-lead { margin-top: 18px; color: #e0edf5; max-width: 650px; font-size: 15px; }
.cover-rule { width: 64px; height: 5px; background: #36c4c6; margin: 32px 0; }
.cover-edition { font-size: 12px; color: #c4deec; }
.cover-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 38px; }
.cover-stat { padding: 18px 22px; border: 1px solid #ffffff35; border-radius: 9px; background: #ffffff0a; }
.cover-stat strong { display: block; font-size: 34px; color: #fff; line-height: 1.1; }
.cover-stat span { display: block; margin-top: 8px; font-size: 12px; color: #d5e9f2; }
.cover-note { margin-top: 28px; color: #c4deec; font-size: 11px; max-width: 760px; }
.reading-guide, .contents, .checklist-section { background: #fff; border: 1px solid var(--line); border-radius: 14px; margin-top: 28px; padding: 40px; }
.reading-guide h2, .contents h2 { font-size: 28px; margin: 10px 0 18px; }
.reading-guide > p:not(.eyebrow) { color: var(--muted); }
.guide-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 26px; }
.guide-step { border-top: 3px solid var(--azure); padding-top: 14px; }
.guide-step strong { display: block; color: var(--navy); margin-bottom: 5px; }
.guide-step p { font-size: 13px; color: var(--muted); }
.priority-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 28px; padding-top: 20px; border-top: 1px solid var(--line); font-size: 12px; }
.contents ol { list-style: none; padding: 0; margin: 26px 0 0; display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.contents a { display: flex; align-items: center; gap: 14px; min-height: 80px; padding: 15px 18px; color: var(--navy); text-decoration: none; border: 1px solid var(--line); border-radius: 8px; }
.contents a:hover { background: var(--pale); border-color: #85bde4; }
.contents-number { font-size: 25px; color: var(--azure); font-weight: 700; min-width: 34px; }
.contents-title { display: block; font-size: 14px; font-weight: 700; line-height: 1.4; }
.contents-count { display: block; margin-top: 3px; color: var(--muted); font-size: 11px; }
.section-heading { border-bottom: 2px solid var(--azure); padding-bottom: 25px; margin-bottom: 28px; }
.section-heading .eyebrow { color: var(--azure); margin-bottom: 8px; }
.section-heading h2 { font-size: 32px; letter-spacing: -.5px; }
.section-description { margin-top: 13px; color: var(--muted); max-width: 850px; }
.section-counts { margin-top: 14px; font-size: 12px; color: var(--muted); }
.control { border: 1px solid var(--line); border-left: 4px solid var(--azure); border-radius: 8px; margin: 0 0 22px; padding: 24px 26px; background: #fff; break-inside: avoid; }
.control:last-child { margin-bottom: 0; }
.control-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 9px; margin-bottom: 11px; break-after: avoid; }
.control-number { font-size: 10px; font-weight: 700; letter-spacing: 1.2px; color: var(--muted); margin-right: auto; }
.priority { display: inline-block; border-radius: 4px; padding: 3px 9px; font-size: 10px; font-weight: 700; letter-spacing: .2px; }
.priority-high { color: #8c2f26; background: #fcece9; }
.priority-medium { color: #755000; background: #fff3d4; }
.priority-low { color: #00665c; background: #e2f4ee; }
.priority-reference { color: #435b70; background: #edf2f7; }
.control h3 { font-size: 19px; margin-bottom: 14px; break-after: avoid; }
.control p { margin-top: 12px; }
.control .control-description { margin-top: 0; }
.control .control-detail { color: #40586c; }
.applicability { border-left: 3px solid var(--teal); background: #f0f8f9; padding: 11px 14px; font-size: 13px; margin-bottom: 15px; }
.applicability strong { color: #00636b; }
.resources { border-top: 1px solid var(--line); margin-top: 19px; padding-top: 13px; }
.resource-label { color: var(--muted); font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; break-after: avoid; }
.resources ul { padding-left: 18px; margin: 6px 0 0; font-size: 12px; }
.resources li { padding-left: 2px; margin: 3px 0; }
.resources li::marker { color: var(--azure); }
.reference-control { border-left-color: #73899c; }
.publication-footer { padding: 28px 8px; font-size: 12px; color: var(--muted); text-align: center; }
@media (max-width: 760px) {
  main { margin: 0 auto; } .cover { border-radius: 0; padding: 42px 25px 32px; }
  .cover h1 { font-size: 37px; letter-spacing: -.8px; }
  .cover-stats { gap: 8px; } .cover-stat { padding: 14px 10px; }
  .cover-stat strong { font-size: 28px; } .cover-stat span { font-size: 10px; }
  .reading-guide, .contents, .checklist-section { border-radius: 0; padding: 28px 22px; margin-top: 16px; }
  .guide-grid, .contents ol { grid-template-columns: 1fr; }
  .control { padding: 20px 17px; } .section-heading h2 { font-size: 28px; }
}
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
@media print {
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html { scroll-behavior: auto; } body { background: #fff; font-size: 9.5pt; line-height: 1.5; }
  main { max-width: none; margin: 0; }
  .cover { border-radius: 0; box-shadow: none; min-height: 254mm; padding: 25mm 14mm 16mm; break-after: page; }
  .cover .eyebrow { margin-bottom: 20mm; font-size: 8pt; }
  .cover h1 { font-size: 36pt; line-height: 1.13; max-width: 138mm; letter-spacing: -1pt; }
  .cover-subtitle { margin-top: 9mm; font-size: 17pt; }
  .cover-lead { margin-top: 6mm; font-size: 10.5pt; }
  .cover-rule { margin: 10mm 0 8mm; }
  .cover-edition { font-size: 9pt; }
  .cover-stats { margin-top: 13mm; gap: 3mm; }
  .cover-stat { padding: 5mm 4mm; } .cover-stat strong { font-size: 25pt; }
  .cover-stat span { font-size: 8pt; }
  .cover-note { font-size: 8pt; margin-top: 10mm; }
  .reading-guide, .contents, .checklist-section { margin: 0; padding: 0; border: 0; border-radius: 0; }
  .reading-guide { break-after: page; }
  .reading-guide h2, .contents h2 { font-size: 25pt; margin: 4mm 0 6mm; }
  .reading-guide > .eyebrow, .contents > .eyebrow { margin-top: 7mm; font-size: 8pt; color: var(--azure); }
  .guide-grid { grid-template-columns: 1fr; gap: 6mm; margin-top: 9mm; }
  .guide-step { padding: 4mm 5mm; background: #f5f8fc; border-top: 0; border-left: 3px solid var(--azure); }
  .guide-step p { font-size: 9pt; }
  .priority-legend { margin-top: 8mm; padding-top: 5mm; font-size: 9pt; }
  .contents { break-after: page; }
  .contents ol { grid-template-columns: repeat(2, 1fr); margin-top: 8mm; gap: 3mm; }
  .contents a { padding: 4mm; gap: 3mm; min-height: 24mm; }
  .contents-number { font-size: 20pt; min-width: 9mm; }
  .contents-title { font-size: 10pt; } .contents-count { font-size: 8pt; }
  .checklist-section { break-before: page; }
  .section-heading { padding-bottom: 6mm; margin-bottom: 6mm; break-inside: avoid; break-after: avoid; }
  .section-heading .eyebrow { font-size: 8pt; margin-bottom: 3mm; }
  .section-heading h2 { font-size: 25pt; }
  .section-description { margin-top: 4mm; font-size: 9.5pt; }
  .section-counts { font-size: 8pt; margin-top: 4mm; }
  .control { padding: 5mm 5.5mm; margin-bottom: 5mm; border-radius: 2mm; }
  .control-meta { margin-bottom: 3mm; gap: 2mm; }
  .control-number { font-size: 7pt; letter-spacing: .8pt; }
  .priority { font-size: 7pt; padding: 1mm 2mm; }
  .control h3 { font-size: 12pt; margin-bottom: 3.5mm; }
  .control p { margin-top: 3mm; }
  .applicability { padding: 3mm; margin-bottom: 4mm; font-size: 8.5pt; }
  .resources { margin-top: 4mm; padding-top: 3mm; }
  .resource-label { font-size: 7pt; }
  .resources ul { margin-top: 2mm; font-size: 8.5pt; }
  .resources li { margin: 1mm 0; }
  .publication-footer { padding: 7mm 0 0; font-size: 8pt; }
}
"""

SECTION_DESCRIPTIONS = {
    "identity": "Establish trusted identities and deliberately scoped access for people, clusters and workloads.",
    "cluster_security": "Build layered protection around the control plane, nodes, secrets and policy boundaries.",
    "cluster_multi": "Choose isolation boundaries that reflect tenant trust, operational ownership and risk.",
    "storage": "Match persistent storage to application performance, availability and data-protection requirements.",
    "networking": "Design predictable connectivity, ingress, egress and address space across the application platform.",
    "resource_management": "Balance workload demand, scheduling, scaling and cost without sacrificing reliability.",
    "operations": "Make cluster changes observable, repeatable and recoverable throughout the platform lifecycle.",
    "bc_dr": "Test failure assumptions and prove that applications and data can meet recovery objectives.",
    "windows": "Review the support, security and operational requirements specific to Windows workloads.",
    "application": "Translate platform capabilities into safe releases and resilient application behavior.",
    "container": "Protect the image supply chain from build and registry through admission and runtime.",
}


def render_entry(item, titles, md, body, number):
    anchor = f"item-{item['guid']}"
    status = f"Priority: {item['priority']}" if is_check(item) else "Reference guidance (not scored)"
    md.extend([f'<a id="{anchor}"></a>', f"### {item['title']}", "", status, ""])
    body.extend([
        f'<article class="control{"" if is_check(item) else " reference-control"}" id="{anchor}">',
        '<div class="control-meta">',
        f'<span class="control-number">{"Control" if is_check(item) else "Reference"} {number}</span>',
        f'<span class="priority priority-{item["priority"].lower() if is_check(item) else "reference"}">{html.escape(status)}</span>',
        f'</div><h3>{html.escape(item["title"])}</h3>',
    ])
    if item.get("applicability"):
        md.extend([f"**Applicability:** {item['applicability']}", ""])
        body.append(f'<div class="applicability"><strong>Applicability:</strong> {html.escape(item["applicability"])}</div>')
    md.extend([item["description"], ""])
    body.append(f'<p class="control-description">{html.escape(item["description"])}</p>')
    if item.get("detail"):
        md.extend([item["detail"], ""])
        body.append(f'<p class="control-detail">{html.escape(item["detail"])}</p>')
    if item.get("related"):
        md.extend(["**Related controls**", ""])
        body.append('<div class="resources"><div class="resource-label">Related controls</div><ul>')
        for identifier in item["related"]:
            title = titles[identifier]
            md.append(f"- [{title}](#item-{identifier})")
            body.append(f'<li><a href="#item-{identifier}">{html.escape(title)}</a></li>')
        md.append("")
        body.append("</ul></div>")
    for key, label in (("documentation", "Documentation"), ("tools", "Tools")):
        if item.get(key):
            md.extend([f"**{label}**", ""])
            body.append(f'<div class="resources"><div class="resource-label">{label}</div><ul>')
            for link in item[key]:
                md.append(f"- [{link['title']}]({link['url']})")
                body.append(f'<li><a href="{html.escape(link["url"], quote=True)}">{html.escape(link["title"])}</a></li>')
            md.append("")
            body.append("</ul></div>")
    body.append("</article>")


def render(data, reviewed):
    count = sum(is_check(item) for entries in data.values() for item in entries)
    references = [item for entries in data.values() for item in entries if not is_check(item)]
    titles = {item["guid"]: item["title"] for entries in data.values() for item in entries}
    summary = f"{count} checks across {len(data)} sections; {len(references)} unscored reference entries."
    md = [
        "# The Azure Kubernetes Service Checklist", "",
        f"Content reviewed: {reviewed}. {summary}", "",
        INTRODUCTION, "", "## Contents", "",
    ]
    body = [
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">",
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        "<title>The AKS Checklist</title>", f"<style>{STYLE}</style></head><body>",
        '<main id="top"><header class="cover"><div class="cover-content">',
        '<p class="eyebrow">AKS / Architecture field guide</p>',
        "<h1>The Azure Kubernetes Service Checklist</h1>",
        '<p class="cover-subtitle">A deliberate approach to production readiness.</p>',
        '<p class="cover-lead">Review the decisions that matter. Build resilient foundations, protect workloads and operate with evidence.</p>',
        '<div class="cover-rule"></div>',
        f'<p class="cover-edition">Content reviewed: {html.escape(reviewed)} / English edition</p>',
        '<div class="cover-stats">',
        f'<div class="cover-stat"><strong>{count}</strong><span>Review controls</span></div>',
        f'<div class="cover-stat"><strong>{len(data):02d}</strong><span>Architecture domains</span></div>',
        f'<div class="cover-stat"><strong>{len(references):02d}</strong><span>Unscored references</span></div>',
        '</div><p class="cover-note">An independent architecture review aid. Not a certification or a guarantee of production readiness.</p>',
        '</div></header>',
        '<aside class="reading-guide" aria-labelledby="review-guide">',
        '<p class="eyebrow">Start here</p><h2 id="review-guide">Review outcomes, not feature adoption.</h2>',
        f'<p>{INTRODUCTION}</p>',
        '<div class="guide-grid">',
        '<div class="guide-step"><strong>01 / Establish applicability</strong><p>Read the scope of each control. Choose implementations that fit the workload, risk and operating model.</p></div>',
        '<div class="guide-step"><strong>02 / Capture evidence</strong><p>Record the configuration, observations and recovery tests that demonstrate the intended outcome.</p></div>',
        '<div class="guide-step"><strong>03 / Make a clear decision</strong><p>Distinguish Fulfilled, Open and Not applicable. Assign an owner to exceptions and revisit them as the platform changes.</p></div>',
        '</div><div class="priority-legend"><strong>Priority guide</strong>',
        '<span class="priority priority-high">High</span><span class="priority priority-medium">Medium</span>',
        '<span class="priority priority-low">Low</span><span>Review priority, not an automatic compliance verdict.</span></div></aside>',
        '<nav class="contents" aria-label="Contents"><p class="eyebrow">Explore the guide</p>',
        f'<h2>Contents</h2><p>{len(data)} architecture domains. One coherent review.</p><ol>',
    ]
    for index, name in enumerate(data, 1):
        title = CATEGORIES[name]
        section_count = sum(is_check(item) for item in data[name])
        md.append(f"- [{title}](#{name.replace('_', '-')})")
        body.append(
            f'<li><a href="#{name}"><span class="contents-number">{index:02d}</span>'
            f'<span><span class="contents-title">{html.escape(title)}</span>'
            f'<span class="contents-count">{section_count} review controls</span></span></a></li>'
        )
    if references:
        md.append("- [Reference guidance (not scored)](#reference-guidance)")
        body.append(
            '<li><a href="#reference-guidance"><span class="contents-number">A</span>'
            '<span><span class="contents-title">Reference guidance (not scored)</span>'
            f'<span class="contents-count">{len(references)} supporting references</span></span></a></li>'
        )
    body.append("</ol></nav>")
    for index, (name, entries) in enumerate(data.items(), 1):
        title = CATEGORIES[name]
        controls = [item for item in entries if is_check(item)]
        counts = " / ".join(
            f'{sum(item["priority"] == priority for item in controls)} {priority.lower()}'
            for priority in ("High", "Medium", "Low")
        )
        md.extend(["", f'<a id="{name.replace("_", "-")}"></a>', f"## {title}", ""])
        body.extend([
            f'<section class="checklist-section" aria-labelledby="{name}">',
            '<div class="section-heading">',
            f'<p class="eyebrow">Architecture domain {index:02d} / {len(data):02d}</p>',
            f'<h2 id="{name}">{html.escape(title)}</h2>',
            f'<p class="section-description">{SECTION_DESCRIPTIONS[name]}</p>',
            f'<p class="section-counts">{len(controls)} review controls / {counts}</p></div>',
        ])
        for control_index, item in enumerate(controls, 1):
            render_entry(item, titles, md, body, f"{index:02d}.{control_index:02d}")
        body.append("</section>")
    if references:
        md.extend(["", '<a id="reference-guidance"></a>', "## Reference guidance (not scored)", ""])
        body.extend([
            '<section class="checklist-section" aria-labelledby="reference-guidance">',
            '<div class="section-heading"><p class="eyebrow">Appendix A / Supporting resources</p>',
            '<h2 id="reference-guidance">Reference guidance (not scored)</h2>',
            '<p class="section-description">Useful conventions and tools to support the review. These references are not readiness requirements and never affect the score.</p></div>',
        ])
        for index, item in enumerate(references, 1):
            render_entry(item, titles, md, body, f"A.{index:02d}")
        body.append("</section>")
    body.append('<footer class="publication-footer">The AKS Checklist / Architecture review field guide</footer></main></body></html>')
    return "\n".join(md) + "\n", "\n".join(body)


def find_browser():
    for name in ("google-chrome", "chromium", "chromium-browser", "msedge", "chrome"):
        if executable := shutil.which(name):
            return executable
    for variable, suffix in (
        ("PROGRAMFILES", r"Google\Chrome\Application\chrome.exe"),
        ("PROGRAMFILES(X86)", r"Microsoft\Edge\Application\msedge.exe"),
    ):
        if base := os.environ.get(variable):
            executable = Path(base) / suffix
            if executable.is_file():
                return str(executable)
    raise FileNotFoundError("Chrome/Chromium/Edge is required for --pdf; supply --browser.")


def build_pdf(source, destination, browser):
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="aks-checklist-") as profile:
        rendered = Path(profile) / "checklist.pdf"
        subprocess.run(
            [browser, "--headless", "--disable-gpu", "--no-pdf-header-footer",
             f"--user-data-dir={profile}", f"--print-to-pdf={rendered}", source.resolve().as_uri()],
            check=True, timeout=180, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
        if not rendered.is_file() or not rendered.read_bytes().startswith(b"%PDF-"):
            raise RuntimeError("Browser did not produce a valid PDF.")
        shutil.copyfile(rendered, destination)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "output")
    parser.add_argument("--date", type=date.fromisoformat, default=date.today())
    parser.add_argument("--pdf", type=Path, help="Destination PDF; requires a Chromium-based browser")
    parser.add_argument("--browser", help="Path to Chrome/Chromium/Edge")
    parser.add_argument("--docx", type=Path, help="Destination styled Word document; requires Pandoc")
    parser.add_argument("--pandoc", default="pandoc", help="Path to Pandoc for --docx")
    args = parser.parse_args()
    data = load_items()
    markdown, document = render(data, args.date.isoformat())
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "AKS-Checklist.md").write_text(markdown, encoding="utf-8")
    source = args.output_dir / "AKS-Checklist.html"
    source.write_text(document, encoding="utf-8")
    if args.pdf:
        build_pdf(source, args.pdf, args.browser or find_browser())
    if args.docx:
        from generate_word import build_docx

        build_docx(data, args.date.isoformat(), args.docx, pandoc=args.pandoc)
    print(f"Offline documents generated in {args.output_dir}")


if __name__ == "__main__":
    main()
