"""Export an editable, designed Word field guide using Pandoc and the standard library."""

import json
import os
import re
import subprocess
import tempfile
import uuid
import zipfile
from datetime import date
from pathlib import Path
from xml.etree import ElementTree as ET

from checklist import CATEGORIES, is_check

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
REL = "http://schemas.openxmlformats.org/package/2006/relationships"
CT = "http://schemas.openxmlformats.org/package/2006/content-types"
ET.register_namespace("w", W)
ET.register_namespace("r", R)

NAVY = "102A43"
AZURE = "0078D4"
TEAL = "008C95"
PALE = "EAF3FA"
MUTED = "526779"
PAGE_WIDTH, PAGE_HEIGHT, MARGIN = 11906, 16838, 1134
CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
STATS_MARKER = "AKS_COVER_STATISTICS"


def bookmark(identifier):
    """Return a stable Word bookmark name (letter first, no hyphens, under 40 chars)."""
    return "aks_" + uuid.UUID(identifier).hex


def _text(value):
    result = []
    for token in re.split(r"(\r\n|\r|\n|[^\S\r\n]+)", value):
        if token:
            if token in ("\r\n", "\r", "\n"):
                result.append({"t": "LineBreak"})
            else:
                result.append({"t": "Space"} if token.isspace() else {"t": "Str", "c": token})
    return result


def _para(value, style=None):
    paragraph = {"t": "Para", "c": _text(value) if isinstance(value, str) else value}
    if not style:
        return paragraph
    return {"t": "Div", "c": [["", [], [["custom-style", style]]], [paragraph]]}


def _link(label, target):
    return {"t": "Link", "c": [["", [], []], _text(label), [target, ""]]}


def _heading(level, label, identifier):
    return {"t": "Header", "c": [level, [identifier, [], []], _text(label)]}


def _document(data, reviewed, api_version):
    checks = sum(is_check(item) for entries in data.values() for item in entries)
    references = [item for entries in data.values() for item in entries if not is_check(item)]
    titles = {item["guid"]: item["title"] for entries in data.values() for item in entries}
    blocks = [
        _para("THE AKS CHECKLIST", "Cover Eyebrow"),
        _para("The Azure Kubernetes\nService Checklist", "Cover Title"),
        _para("Architecture review field guide", "Cover Subtitle"),
        _para(f"CONTENT REVIEWED  /  {reviewed}", "Cover Date"),
        _para(
            "A practical companion for deliberate architecture decisions, "
            "evidence-led reviews and continuous improvement.",
            "Cover Introduction",
        ),
        _para(STATS_MARKER),
        _para(
            "Azure Kubernetes Service  /  Architecture, operations and workload design",
            "Cover Caption",
        ),
        _para("Inside this guide", "Contents Heading"),
        _para("Jump to a section. Each check has a stable, linked control identity.", "Body Text"),
    ]
    for index, (category, entries) in enumerate(data.items(), 1):
        count = sum(is_check(item) for item in entries)
        blocks.append(_para(
            [_link(f"{index:02d}   {CATEGORIES[category]}   /   {count} checks", f"#section_{category}")],
            "Contents Entry",
        ))
    if references:
        blocks.append(_para(
            [_link(f"Appendix   Reference guidance   /   {len(references)} unscored entries", "#references")],
            "Contents Entry",
        ))
    blocks.extend([
        _para("Review outcomes, not feature adoption.", "Review Guide Heading"),
        _para(
            "Decide applicability first. Review each applicable control, collect evidence, "
            "and record an owner, action or exception. Keep Not applicable separate from Fulfilled. "
            "Reference guidance is not scored.",
            "Body Text",
        ),
        _para(
            "Use priorities to sequence discussion, not as a substitute for workload risk. "
            "This guide is an architecture review aid, not a certification or a guarantee of "
            "production readiness. Verify current feature availability, region and service support, "
            "retirement notices and pricing in the linked documentation.",
            "Body Text",
        ),
        _para("Priority legend", "Guide Heading"),
        _para("HIGH  /  Review first", "Legend High"),
        _para("MEDIUM  /  Plan deliberately", "Legend Medium"),
        _para("LOW  /  Refine for context", "Legend Low"),
    ])

    def entry(item, number):
        blocks.append(_heading(2, f"{number}   {item['title']}", bookmark(item["guid"])))
        blocks.append(_para(
            f"{item['priority'].upper()} PRIORITY" if is_check(item) else "REFERENCE GUIDANCE / NOT SCORED",
            f"Priority {item['priority']}" if is_check(item) else "Reference Marker",
        ))
        if item.get("applicability"):
            blocks.append(_para(f"APPLICABILITY  /  {item['applicability']}", "Applicability"))
        blocks.append(_para(item["description"], "Body Text"))
        if item.get("detail"):
            blocks.append(_para(item["detail"], "Body Text"))
        for key, label in (
            ("documentation", "DOCUMENTATION"), ("tools", "TOOLS"), ("related", "RELATED CONTROLS"),
        ):
            if not item.get(key):
                continue
            blocks.append(_para(label, "Resource Label"))
            for value in item[key]:
                title, url = (
                    (titles[value], "#" + bookmark(value))
                    if key == "related" else (value["title"], value["url"])
                )
                blocks.append(_para([_link(title, url)], "Resource Link"))

    for index, (category, entries) in enumerate(data.items(), 1):
        count = sum(is_check(item) for item in entries)
        blocks.extend([
            _heading(1, f"{index:02d}   {CATEGORIES[category]}", f"section_{category}"),
            _para(f"SECTION {index:02d}  /  {count} CHECKS", "Section Summary"),
        ])
        for control_index, item in enumerate((item for item in entries if is_check(item)), 1):
            entry(item, f"{index:02d}.{control_index:02d}")
    if references:
        blocks.extend([
            _heading(1, "Appendix A   Reference guidance", "references"),
            _para(f"{len(references)} REFERENCE ENTRIES  /  NOT SCORED", "Section Summary"),
        ])
        for index, item in enumerate(references, 1):
            entry(item, f"A.{index:02d}")
    return {
        "pandoc-api-version": api_version,
        "meta": {"title": {"t": "MetaString", "c": "The AKS Checklist"}},
        "blocks": blocks,
    }


def _element(name, attributes=None, text=None):
    element = ET.Element(f"{{{W}}}{name}", {
        f"{{{W}}}{key}": str(value) for key, value in (attributes or {}).items()
    })
    element.text = text
    return element


def _set(parent, name, attributes=None):
    existing = parent.find(f"w:{name}", {"w": W})
    if existing is not None:
        parent.remove(existing)
    element = _element(name, attributes)
    parent.append(element)
    return element


def _properties(parent, name):
    found = parent.find(f"w:{name}", {"w": W})
    if found is None:
        found = _element(name)
        parent.insert(0, found)
    return found


def _rule(properties, color=AZURE, edge="bottom", size=12, space=8):
    borders = _properties(properties, "pBdr")
    _set(borders, edge, {"val": "single", "sz": size, "space": space, "color": color})


def _font(properties, size=20, color=NAVY, bold=False):
    _set(properties, "rFonts", {"ascii": "Arial", "hAnsi": "Arial", "cs": "Arial", "eastAsia": "Arial"})
    _set(properties, "color", {"val": color})
    _set(properties, "sz", {"val": size})
    _set(properties, "szCs", {"val": size})
    _set(properties, "b", {"val": int(bold)})


def _style(styles, name, size=20, color=NAVY, bold=False, before=0, after=100,
           keep=False, page_break=False, outline=None):
    style = next((
        item for item in styles.findall(f"{{{W}}}style")
        if item.get(f"{{{W}}}styleId") == name.replace(" ", "")
        or (item.find(f"{{{W}}}name") is not None
            and item.find(f"{{{W}}}name").get(f"{{{W}}}val") == name)
    ), None)
    if style is None:
        style = _element("style", {"type": "paragraph", "customStyle": 1, "styleId": name.replace(" ", "")})
        styles.append(style)
        _set(style, "name", {"val": name})
    _set(style, "basedOn", {"val": "Normal"})
    _set(style, "next", {"val": "BodyText"})
    for property_name in ("pPr", "rPr"):
        existing = style.find(f"{{{W}}}{property_name}")
        if existing is not None:
            style.remove(existing)
    ppr = _element("pPr")
    style.append(ppr)
    _set(ppr, "keepNext", {"val": int(keep)})
    _set(ppr, "keepLines", {"val": 0})
    _set(ppr, "pageBreakBefore", {"val": int(page_break)})
    _set(ppr, "widowControl")
    _set(ppr, "spacing", {"before": before, "after": after, "line": 276, "lineRule": "auto"})
    if outline is not None:
        _set(ppr, "outlineLvl", {"val": outline})
    rpr = _element("rPr")
    style.append(rpr)
    _font(rpr, size, color, bold)
    return ppr


def _apply_styles(styles):
    defaults = _properties(styles, "docDefaults")
    default_run = _properties(defaults, "rPrDefault")
    _font(_properties(default_run, "rPr"))
    _style(styles, "Normal")
    # Normal is the root style, never a style based on itself.
    normal = next(item for item in styles.findall(f"{{{W}}}style") if item.get(f"{{{W}}}styleId") == "Normal")
    normal.remove(normal.find(f"{{{W}}}basedOn"))
    _style(styles, "Body Text")
    _style(styles, "First Paragraph")
    heading = _style(styles, "Heading1", 48, bold=True, after=180, keep=True, page_break=True, outline=0)
    _rule(heading, size=16, space=12)
    control = _style(styles, "Heading2", 27, bold=True, before=340, after=120, keep=True, outline=1)
    _rule(control, color="D7E3ED", edge="top", size=5, space=10)
    cover = _style(styles, "Cover Title", 72, color="FFFFFF", bold=True, before=700, after=380, keep=True)
    _set(cover, "shd", {"val": "clear", "color": "auto", "fill": NAVY})
    for edge in ("top", "left", "bottom", "right"):
        _rule(cover, NAVY, edge=edge, size=24, space=18)
    _style(styles, "Cover Subtitle", 34, color=TEAL, after=600, keep=True)
    eyebrow = _style(styles, "Cover Eyebrow", 22, color=AZURE, bold=True, before=300, after=180, keep=True)
    _rule(eyebrow, size=24, space=14)
    _style(styles, "Cover Date", 19, color=TEAL, bold=True, after=250, keep=True)
    _style(styles, "Cover Introduction", 25, after=420, keep=True)
    _style(styles, "Cover Caption", 18, color=MUTED, before=220, after=0)
    _style(styles, "Statistic Value", 56, color=AZURE, bold=True, after=80, keep=True)
    _style(styles, "Statistic Label", 18, color=MUTED, bold=True, after=0)
    _style(styles, "Contents Heading", 50, bold=True, after=180, keep=True, page_break=True)
    contents = _style(styles, "Contents Entry", 21, before=100, after=160)
    _set(contents, "shd", {"val": "clear", "color": "auto", "fill": PALE})
    _set(contents, "ind", {"left": 180, "right": 180})
    _rule(contents, AZURE, "left", size=14, space=9)
    _style(styles, "Review Guide Heading", 50, bold=True, after=300, keep=True, page_break=True)
    _style(styles, "Guide Heading", 25, bold=True, before=220, after=90, keep=True)
    _style(styles, "Section Summary", 19, color=TEAL, bold=True, after=280, keep=True)
    for priority, color, fill in (
        ("High", "8C2F26", "FCECE9"), ("Medium", "755000", "FFF3D4"), ("Low", "00665C", "E2F4EE"),
    ):
        for prefix, keep in (("Priority", True), ("Legend", False)):
            marker = _style(styles, f"{prefix} {priority}", 17, color=color, bold=True, after=100, keep=keep)
            _rule(marker, color, "left", size=18, space=7)
            _set(marker, "ind", {"left": 160})
            _set(marker, "shd", {"val": "clear", "color": "auto", "fill": fill})
    reference = _style(styles, "Reference Marker", 17, color=MUTED, bold=True, after=100, keep=True)
    _set(reference, "shd", {"val": "clear", "color": "auto", "fill": "EDF2F7"})
    callout = _style(styles, "Applicability", 19, before=40, after=120, keep=True)
    _set(callout, "shd", {"val": "clear", "color": "auto", "fill": PALE})
    _set(callout, "ind", {"left": 160, "right": 160})
    _rule(callout, TEAL, "left", size=14, space=7)
    _style(styles, "Resource Label", 17, color=TEAL, bold=True, before=90, after=40, keep=True)
    link = _style(styles, "Resource Link", 19, after=45)
    _set(link, "ind", {"left": 160})
    _style(styles, "Running Footer", 17, color=MUTED, before=50, after=0)
    _rule(_style(styles, "Running Header", 17, color=MUTED, after=50), color="CCDDEB", size=5, space=5)
    hyperlink = next((
        item for item in styles.findall(f"{{{W}}}style")
        if item.get(f"{{{W}}}styleId") == "Hyperlink"
    ), None)
    if hyperlink is not None:
        _set(_properties(hyperlink, "rPr"), "color", {"val": AZURE})


def _paragraph(text, style):
    paragraph = _element("p")
    ppr = _element("pPr")
    ppr.append(_element("pStyle", {"val": style.replace(" ", "")}))
    paragraph.append(ppr)
    run = _element("r")
    node = _element("t", text=str(text))
    node.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
    run.append(node)
    paragraph.append(run)
    return paragraph


def _statistics(checks, sections, references):
    table = _element("tbl")
    properties = _element("tblPr")
    properties.append(_element("tblW", {"w": CONTENT_WIDTH, "type": "dxa"}))
    properties.append(_element("tblLayout", {"type": "fixed"}))
    margins = _element("tblCellMar")
    for edge in ("top", "left", "bottom", "right"):
        margins.append(_element(edge, {"w": 220, "type": "dxa"}))
    properties.append(margins)
    table.append(properties)
    widths = [CONTENT_WIDTH // 3, CONTENT_WIDTH // 3, CONTENT_WIDTH - 2 * (CONTENT_WIDTH // 3)]
    grid = _element("tblGrid")
    for width in widths:
        grid.append(_element("gridCol", {"w": width}))
    table.append(grid)
    row = _element("tr")
    table.append(row)
    row_properties = _element("trPr")
    row_properties.append(_element("cantSplit"))
    row.append(row_properties)
    for width, (value, label) in zip(widths, (
        (checks, "CHECKS"), (sections, "SECTIONS"), (references, "UNSCORED REFERENCES"),
    )):
        cell = _element("tc")
        cell_properties = _element("tcPr")
        cell_properties.append(_element("tcW", {"w": width, "type": "dxa"}))
        cell_properties.append(_element("shd", {"val": "clear", "color": "auto", "fill": PALE}))
        cell.append(cell_properties)
        cell.append(_paragraph(value, "Statistic Value"))
        cell.append(_paragraph(label, "Statistic Label"))
        row.append(cell)
    return table


def _running_part(kind, reviewed):
    part = _element("hdr" if kind == "header" else "ftr")
    paragraph = _paragraph(
        "THE AKS CHECKLIST\tARCHITECTURE REVIEW FIELD GUIDE"
        if kind == "header" else f"Content reviewed {reviewed}\t",
        "Running Header" if kind == "header" else "Running Footer",
    )
    ppr = _properties(paragraph, "pPr")
    tabs = _element("tabs")
    tabs.append(_element("tab", {"val": "right", "pos": CONTENT_WIDTH}))
    ppr.append(tabs)
    # Tabs must be Word tab runs, not literal tab characters inside w:t.
    text = paragraph.find(f".//{{{W}}}t")
    left, right = text.text.split("\t")
    text.text = left
    run = _element("r")
    run.append(_element("tab"))
    paragraph.append(run)
    if right:
        paragraph.append(_paragraph(right, "Running Header").find(f"{{{W}}}r"))
    if kind == "footer":
        paragraph.append(_paragraph("PAGE ", "Running Footer").find(f"{{{W}}}r"))
        field = _element("fldSimple", {"instr": " PAGE "})
        field.append(_paragraph("1", "Running Footer").find(f"{{{W}}}r"))
        paragraph.append(field)
    part.append(paragraph)
    return part


def _ordered_properties(document):
    """Keep WordprocessingML property sequences valid after adding optional properties."""
    sequences = {
        "style": (
            "name", "aliases", "basedOn", "next", "link", "autoRedefine", "hidden",
            "uiPriority", "semiHidden", "unhideWhenUsed", "qFormat", "locked",
            "personal", "personalCompose", "personalReply", "rsid", "pPr", "rPr",
            "tblPr", "trPr", "tcPr", "tblStylePr",
        ),
        "pPr": (
            "pStyle", "keepNext", "keepLines", "pageBreakBefore", "framePr", "widowControl",
            "numPr", "suppressLineNumbers", "pBdr", "shd", "tabs", "suppressAutoHyphens",
            "kinsoku", "wordWrap", "overflowPunct", "topLinePunct", "autoSpaceDE", "autoSpaceDN",
            "bidi", "adjustRightInd", "snapToGrid", "spacing", "ind", "contextualSpacing",
            "mirrorIndents", "suppressOverlap", "jc", "textDirection", "textAlignment",
            "textboxTightWrap", "outlineLvl", "divId", "cnfStyle", "rPr", "sectPr", "pPrChange",
        ),
        "rPr": (
            "rStyle", "rFonts", "b", "bCs", "i", "iCs", "caps", "smallCaps", "strike",
            "dstrike", "outline", "shadow", "emboss", "imprint", "noProof", "snapToGrid",
            "vanish", "webHidden", "color", "spacing", "w", "kern", "position", "sz", "szCs",
            "highlight", "u", "effect", "bdr", "shd", "fitText", "vertAlign", "rtl", "cs",
            "em", "lang", "eastAsianLayout", "specVanish", "oMath", "rPrChange",
        ),
        "sectPr": (
            "headerReference", "footerReference", "footnotePr", "endnotePr", "type", "pgSz",
            "pgMar", "paperSrc", "pgBorders", "lnNumType", "pgNumType", "cols", "formProt",
            "vAlign", "noEndnote", "titlePg", "textDirection", "bidi", "rtlGutter",
            "docGrid", "printerSettings", "sectPrChange",
        ),
    }
    for name, sequence in sequences.items():
        order = {f"{{{W}}}{tag}": index for index, tag in enumerate(sequence)}
        for properties in document.iter(f"{{{W}}}{name}"):
            properties[:] = sorted(properties, key=lambda child: order.get(child.tag, len(order)))


def _serialize(element):
    _ordered_properties(element)
    return ET.tostring(element, encoding="utf-8", xml_declaration=True)


def _keep_controls_together(body):
    group = []

    def finish():
        for index, paragraph in enumerate(group):
            properties = _properties(paragraph, "pPr")
            _set(properties, "keepNext", {"val": int(index < len(group) - 1)})
            _set(properties, "keepLines", {"val": 1})

    for paragraph in body:
        if paragraph.tag != f"{{{W}}}p":
            continue
        style = paragraph.find("w:pPr/w:pStyle", {"w": W})
        name = style.get(f"{{{W}}}val") if style is not None else ""
        if name in ("Heading1", "Heading2"):
            finish()
            group = [paragraph] if name == "Heading2" else []
        elif group:
            group.append(paragraph)
    finish()


def _style_docx(source, destination, data, reviewed):
    with zipfile.ZipFile(source) as archive:
        if bad := archive.testzip():
            raise ValueError(f"Corrupt Pandoc DOCX part: {bad}")
        parts = {name: archive.read(name) for name in archive.namelist()}
    document = ET.fromstring(parts["word/document.xml"])
    styles = ET.fromstring(parts["word/styles.xml"])
    relationships = ET.fromstring(parts["word/_rels/document.xml.rels"])
    types = ET.fromstring(parts["[Content_Types].xml"])
    _apply_styles(styles)
    body = document.find(f"{{{W}}}body")
    if body is None:
        raise ValueError("Pandoc DOCX has no document body")
    _keep_controls_together(body)
    # Keep title metadata without Pandoc's additional, unstyled title on the cover.
    first = next(iter(body), None)
    if first is not None:
        title_style = first.find("w:pPr/w:pStyle", {"w": W})
        if title_style is not None and title_style.get(f"{{{W}}}val") == "Title":
            body.remove(first)
    checks = sum(is_check(item) for entries in data.values() for item in entries)
    references = sum(len(entries) for entries in data.values()) - checks
    markers = [
        paragraph for paragraph in body.findall(f"{{{W}}}p")
        if "".join(paragraph.itertext()) == STATS_MARKER
    ]
    if len(markers) != 1:
        raise ValueError("Pandoc DOCX is missing the unique cover statistics marker")
    position = list(body).index(markers[0])
    body.remove(markers[0])
    body.insert(position, _statistics(checks, len(data), references))
    section = body.find(f"{{{W}}}sectPr")
    if section is None:
        section = _element("sectPr")
        body.append(section)
    for name in ("headerReference", "footerReference"):
        for child in list(section.findall(f"{{{W}}}{name}")):
            section.remove(child)
    _set(section, "pgSz", {"w": PAGE_WIDTH, "h": PAGE_HEIGHT, "orient": "portrait"})
    _set(section, "pgMar", {
        "top": 1020, "right": MARGIN, "bottom": 1020, "left": MARGIN,
        "header": 450, "footer": 450, "gutter": 0,
    })
    _set(section, "titlePg")
    used_ids = {relationship.get("Id") for relationship in relationships}
    for kind in ("header", "footer"):
        part_name = f"aks-{kind}.xml"
        identifier = f"rIdAks{kind.title()}"
        while identifier in used_ids:
            identifier += "_"
        used_ids.add(identifier)
        relationships.append(ET.Element(f"{{{REL}}}Relationship", {
            "Id": identifier, "Type": f"{R}/{kind}", "Target": part_name,
        }))
        reference = _element(f"{kind}Reference", {"type": "default"})
        reference.set(f"{{{R}}}id", identifier)
        section.append(reference)
        parts[f"word/{part_name}"] = _serialize(_running_part(kind, reviewed))
        types.append(ET.Element(f"{{{CT}}}Override", {
            "PartName": f"/word/{part_name}",
            "ContentType": f"application/vnd.openxmlformats-officedocument.wordprocessingml.{kind}+xml",
        }))
    # A different first page suppresses both running furniture on the cover.
    # Preserve aliases as empty destinations so older control identities still work.
    starts = list(document.iter(f"{{{W}}}bookmarkStart"))
    next_id = max((int(node.get(f"{{{W}}}id")) for node in starts), default=0) + 1
    aliases = {
        bookmark(item["guid"]): item.get("supersedes", [])
        for entries in data.values() for item in entries
    }
    for parent in list(document.iter()):
        for start in list(parent.findall(f"{{{W}}}bookmarkStart")):
            for alias in aliases.get(start.get(f"{{{W}}}name"), []):
                position = list(parent).index(start)
                parent.insert(position, _element("bookmarkStart", {"id": next_id, "name": bookmark(alias)}))
                parent.insert(position + 1, _element("bookmarkEnd", {"id": next_id}))
                next_id += 1
    names = {node.get(f"{{{W}}}name") for node in document.iter(f"{{{W}}}bookmarkStart")}
    expected = {
        bookmark(identifier)
        for entries in data.values() for item in entries
        for identifier in [item["guid"], *item.get("supersedes", [])]
    }
    if not expected <= names:
        raise ValueError("Pandoc DOCX lost control bookmarks")
    for link in document.iter(f"{{{W}}}hyperlink"):
        anchor = link.get(f"{{{W}}}anchor")
        if anchor and anchor not in names:
            raise ValueError(f"Pandoc DOCX contains an unresolved internal link: {anchor}")
    parts["word/document.xml"] = _serialize(document)
    parts["word/styles.xml"] = _serialize(styles)
    parts["word/_rels/document.xml.rels"] = ET.tostring(relationships, encoding="utf-8", xml_declaration=True)
    parts["[Content_Types].xml"] = ET.tostring(types, encoding="utf-8", xml_declaration=True)
    # Rewriting a prefixed XML tree otherwise drops declarations used only by mc:Ignorable.
    for name in ("word/document.xml", "word/styles.xml"):
        root = ET.fromstring(parts[name])
        for key in list(root.attrib):
            if key.endswith("}Ignorable"):
                del root.attrib[key]
        parts[name] = _serialize(root)
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, content in parts.items():
            archive.writestr(name, content)


def build_docx(data, reviewed, destination, pandoc="pandoc"):
    """Write a Word field guide atomically; propagate conversion/validation failures.

    ``data`` is the ordered mapping returned by ``checklist.load_items()``.
    Existing destination bytes are retained unless every conversion step succeeds.
    All intermediate files live beside the destination, not in the system temp folder.
    """
    date.fromisoformat(reviewed)
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".aks-word-", dir=destination.parent) as directory:
        directory = Path(directory)
        probe = subprocess.run(
            [str(pandoc), "--from=markdown", "--to=json"], input="", encoding="utf-8",
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, timeout=30,
        )
        api_version = json.loads(probe.stdout)["pandoc-api-version"]
        source = directory / "checklist.json"
        source.write_text(json.dumps(_document(data, reviewed, api_version), ensure_ascii=False), encoding="utf-8")
        converted = directory / "pandoc.docx"
        subprocess.run(
            [str(pandoc), "--from=json", "--to=docx", "--standalone",
             "--output", str(converted), str(source)],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, timeout=180,
        )
        styled = directory / "checklist.docx"
        _style_docx(converted, styled, data, reviewed)
        os.replace(styled, destination)
    return destination
