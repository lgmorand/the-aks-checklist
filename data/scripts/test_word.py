import copy
import json
import shutil
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from xml.etree import ElementTree as ET

from checklist import load_items
from generate_word import (
    CONTENT_WIDTH, MARGIN, PAGE_HEIGHT, PAGE_WIDTH, R, STATS_MARKER, W,
    _apply_styles, _document, _element, _paragraph, _serialize, _statistics,
    _style_docx, _keep_controls_together, bookmark, build_docx,
)

NS = {"w": W, "r": R}


def fixture():
    first = {
        "guid": "00000000-0000-4000-8000-000000000001",
        "title": "Use <supported> settings & verify",
        "description": "Literal *markup*, <tags> & `commands` remain intact.",
        "detail": "Extended guidance with café and Unicode \u2014 preserved.",
        "priority": "High",
        "applicability": "Only when <required>.",
        "documentation": [{"title": "AKS documentation", "url": "https://learn.microsoft.com/azure/aks/"}],
        "tools": [{"title": "A useful tool", "url": "https://example.com/tool?a=1&b=2"}],
        "supersedes": ["90000000-0000-4000-8000-000000000001"],
    }
    second = {
        "guid": "00000000-0000-4000-8000-000000000002",
        "title": "A related control", "description": "Second check.", "priority": "Low",
    }
    reference = {
        "guid": "00000000-0000-4000-8000-000000000003",
        "title": "Reference material", "description": "Unscored background.", "priority": "Medium",
        "kind": "reference",
    }
    first["related"] = [second["guid"]]
    return {"identity": [first, reference], "storage": [second]}


def walk(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


def fake_pandoc_docx(path, data):
    document = _element("document")
    body = _element("body")
    document.append(body)
    body.append(_paragraph(STATS_MARKER, "Normal"))
    identifiers = [f"section_{category}" for category in data] + ["references"] + [
        bookmark(item["guid"]) for entries in data.values() for item in entries
    ]
    for index, identifier in enumerate(identifiers):
        paragraph = _paragraph(identifier, "Normal")
        paragraph.append(_element("bookmarkStart", {"id": index, "name": identifier}))
        paragraph.append(_element("bookmarkEnd", {"id": index}))
        body.append(paragraph)
    body.append(_element("sectPr"))
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("word/document.xml", _serialize(document))
        archive.writestr("word/styles.xml", _serialize(_element("styles")))
        archive.writestr("word/_rels/document.xml.rels",
                        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>')
        archive.writestr("[Content_Types].xml",
                        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')


class WordTests(unittest.TestCase):
    def setUp(self):
        self.data = fixture()

    def workspace(self):
        return tempfile.TemporaryDirectory(prefix=".word-test-", dir=Path.cwd())

    def test_bookmarks_are_stable_word_safe_and_guid_based(self):
        identifier = self.data["identity"][0]["guid"]
        self.assertEqual(bookmark(identifier), "aks_" + identifier.replace("-", ""))
        self.assertRegex(bookmark(identifier), r"^[A-Za-z][A-Za-z0-9_]{0,39}$")
        self.assertEqual(bookmark(identifier), bookmark(identifier.upper()))

    def test_ast_is_deterministic_preserves_literal_content_and_does_not_mutate_data(self):
        original = copy.deepcopy(self.data)
        document = _document(self.data, "2026-11-04", [1, 23])
        self.assertEqual(document, _document(self.data, "2026-11-04", [1, 23]))
        self.assertEqual(self.data, original)
        text = " ".join(node["c"] for node in walk(document) if node.get("t") == "Str")
        for entries in self.data.values():
            for item in entries:
                for field in ("title", "description", "detail", "applicability"):
                    if field in item:
                        self.assertIn(item[field], text)
        links = [node["c"][2][0] for node in walk(document) if node.get("t") == "Link"]
        self.assertIn(self.data["identity"][0]["tools"][0]["url"], links)
        self.assertIn("#" + bookmark(self.data["storage"][0]["guid"]), links)

    def test_contents_links_only_to_sections_and_appendix(self):
        document = _document(self.data, "2026-11-04", [1, 23])
        entries = [
            node for node in walk(document)
            if node.get("t") == "Div" and node["c"][0][2] == [["custom-style", "Contents Entry"]]
        ]
        targets = [
            node["c"][2][0] for entry in entries for node in walk(entry) if node.get("t") == "Link"
        ]
        self.assertEqual(targets, ["#section_identity", "#section_storage", "#references"])

    def test_references_are_unscored_and_control_numbers_ignore_them(self):
        document = _document(self.data, "2026-11-04", [1, 23])
        headings = [
            " ".join(node["c"] for node in walk(block["c"][2]) if node.get("t") == "Str")
            for block in document["blocks"] if block["t"] == "Header"
        ]
        self.assertIn("01.01 Use <supported> settings & verify", headings)
        self.assertIn("02.01 A related control", headings)
        self.assertIn("A.01 Reference material", headings)
        styles = [node["c"][0][2] for node in walk(document) if node.get("t") == "Div"]
        self.assertEqual(styles.count([["custom-style", "Priority Medium"]]), 0)
        self.assertEqual(styles.count([["custom-style", "Legend Medium"]]), 1)
        self.assertEqual(styles.count([["custom-style", "Reference Marker"]]), 1)

    def test_stats_table_uses_real_counts_explicit_grid_and_matching_cell_widths(self):
        table = _statistics(178, 11, 2)
        widths = [int(node.get(f"{{{W}}}w")) for node in table.findall("w:tblGrid/w:gridCol", NS)]
        cells = [int(node.get(f"{{{W}}}w")) for node in table.findall("w:tr/w:tc/w:tcPr/w:tcW", NS)]
        self.assertEqual(sum(widths), CONTENT_WIDTH)
        self.assertEqual(widths, cells)
        text = "".join(table.itertext())
        self.assertIn("178CHECKS", text)
        self.assertIn("11SECTIONS", text)
        self.assertIn("2UNSCORED REFERENCES", text)

    def test_named_styles_are_arial_readable_and_allow_body_to_flow(self):
        styles = _element("styles")
        _apply_styles(styles)
        by_id = {node.get(f"{{{W}}}styleId"): node for node in styles}
        self.assertEqual(by_id["Heading1"].find("w:rPr/w:color", NS).get(f"{{{W}}}val"), "102A43")
        self.assertEqual(by_id["Heading1"].find("w:pPr/w:pageBreakBefore", NS).get(f"{{{W}}}val"), "1")
        self.assertEqual(by_id["BodyText"].find("w:pPr/w:keepNext", NS).get(f"{{{W}}}val"), "0")
        self.assertEqual(by_id["BodyText"].find("w:pPr/w:keepLines", NS).get(f"{{{W}}}val"), "0")
        self.assertIsNotNone(by_id["BodyText"].find("w:pPr/w:widowControl", NS))
        self.assertEqual(by_id["Applicability"].find("w:pPr/w:shd", NS).get(f"{{{W}}}fill"), "EAF3FA")
        self.assertEqual(by_id["CoverTitle"].find("w:rPr/w:rFonts", NS).get(f"{{{W}}}ascii"), "Arial")
        self.assertEqual(by_id["CoverTitle"].find("w:rPr/w:color", NS).get(f"{{{W}}}val"), "FFFFFF")
        self.assertEqual(by_id["CoverTitle"].find("w:pPr/w:shd", NS).get(f"{{{W}}}fill"), "102A43")
        self.assertEqual(by_id["ContentsEntry"].find("w:pPr/w:shd", NS).get(f"{{{W}}}fill"), "EAF3FA")
        self.assertEqual(by_id["ReviewGuideHeading"].find("w:pPr/w:pageBreakBefore", NS).get(f"{{{W}}}val"), "1")
        self.assertEqual(by_id["PriorityMedium"].find("w:pPr/w:shd", NS).get(f"{{{W}}}fill"), "FFF3D4")
        self.assertIsNone(by_id["Normal"].find("w:basedOn", NS))

    def test_package_has_a4_layout_running_furniture_page_field_and_aliases(self):
        with self.workspace() as directory:
            source, output = Path(directory) / "raw.docx", Path(directory) / "styled.docx"
            fake_pandoc_docx(source, self.data)
            _style_docx(source, output, self.data, "2026-11-04")
            with zipfile.ZipFile(output) as archive:
                self.assertIsNone(archive.testzip())
                document = ET.fromstring(archive.read("word/document.xml"))
                section = document.find("w:body/w:sectPr", NS)
                self.assertEqual(section.find("w:pgSz", NS).attrib, {
                    f"{{{W}}}w": str(PAGE_WIDTH), f"{{{W}}}h": str(PAGE_HEIGHT),
                    f"{{{W}}}orient": "portrait",
                })
                self.assertEqual(section.find("w:pgMar", NS).get(f"{{{W}}}left"), str(MARGIN))
                self.assertIsNotNone(section.find("w:titlePg", NS))
                self.assertEqual(len(section.findall("w:headerReference", NS)), 1)
                footer = ET.fromstring(archive.read("word/aks-footer.xml"))
                self.assertEqual(footer.find(".//w:fldSimple", NS).get(f"{{{W}}}instr"), " PAGE ")
                names = {node.get(f"{{{W}}}name") for node in document.findall(".//w:bookmarkStart", NS)}
                self.assertIn(bookmark(self.data["identity"][0]["supersedes"][0]), names)
                self.assertNotIn(STATS_MARKER, "".join(document.itertext()))
                self.assertIn("2026-11-04", "".join(footer.itertext()))

    def test_control_groups_keep_their_evidence_and_links_with_the_control(self):
        body = _element("body")
        for label, style in (
            ("Cover", "CoverTitle"), ("Section", "Heading1"),
            ("Control", "Heading2"), ("Description", "BodyText"),
            ("Documentation", "ResourceLabel"), ("Link", "ResourceLink"),
            ("Next section", "Heading1"),
        ):
            body.append(_paragraph(label, style))
        _keep_controls_together(body)
        paragraphs = list(body)
        self.assertIsNone(paragraphs[0].find("w:pPr/w:keepNext", NS))
        for index in (2, 3, 4):
            self.assertEqual(paragraphs[index].find("w:pPr/w:keepNext", NS).get(f"{{{W}}}val"), "1")
            self.assertEqual(paragraphs[index].find("w:pPr/w:keepLines", NS).get(f"{{{W}}}val"), "1")
        self.assertEqual(paragraphs[5].find("w:pPr/w:keepNext", NS).get(f"{{{W}}}val"), "0")
        self.assertIsNone(paragraphs[6].find("w:pPr/w:keepNext", NS))

    def test_successful_mocked_conversion_publishes_and_cleans_work_directory(self):
        with self.workspace() as directory:
            destination = Path(directory) / "guide.docx"

            def pandoc(command, **kwargs):
                if "--to=json" in command:
                    return SimpleNamespace(stdout=json.dumps({"pandoc-api-version": [1, 23]}))
                fake_pandoc_docx(Path(command[command.index("--output") + 1]), self.data)
                return SimpleNamespace(stdout="")

            with patch("generate_word.subprocess.run", side_effect=pandoc) as run:
                self.assertEqual(build_docx(self.data, "2026-11-04", destination), destination)
            self.assertEqual(run.call_count, 2)
            self.assertTrue(zipfile.is_zipfile(destination))
            self.assertEqual(list(Path(directory).iterdir()), [destination])

    def test_conversion_failure_preserves_existing_destination_and_cleans_work_directory(self):
        with self.workspace() as directory:
            destination = Path(directory) / "guide.docx"
            destination.write_bytes(b"existing document")
            for failure in (
                FileNotFoundError("Pandoc is missing"),
                subprocess.CalledProcessError(1, "pandoc", stderr=b"Conversion failed"),
                subprocess.TimeoutExpired("pandoc", 30),
            ):
                with self.subTest(failure=type(failure).__name__):
                    with patch("generate_word.subprocess.run", side_effect=failure):
                        with self.assertRaises(type(failure)):
                            build_docx(self.data, "2026-11-04", destination)
                    self.assertEqual(destination.read_bytes(), b"existing document")
                    self.assertEqual(list(Path(directory).iterdir()), [destination])

    def test_postprocessing_failure_also_preserves_existing_destination(self):
        with self.workspace() as directory:
            destination = Path(directory) / "guide.docx"
            destination.write_bytes(b"existing document")

            def pandoc(command, **kwargs):
                if "--to=json" in command:
                    return SimpleNamespace(stdout='{"pandoc-api-version": [1, 23]}')
                Path(command[command.index("--output") + 1]).write_bytes(b"not a zip")
                return SimpleNamespace(stdout="")

            with patch("generate_word.subprocess.run", side_effect=pandoc):
                with self.assertRaises(zipfile.BadZipFile):
                    build_docx(self.data, "2026-11-04", destination)
            self.assertEqual(destination.read_bytes(), b"existing document")
            self.assertEqual(list(Path(directory).iterdir()), [destination])

    def test_invalid_review_date_fails_before_invoking_pandoc(self):
        with patch("generate_word.subprocess.run") as run:
            with self.assertRaises(ValueError):
                build_docx(self.data, "not-a-date", Path("unused.docx"))
        run.assert_not_called()

    @unittest.skipUnless(shutil.which("pandoc"), "Pandoc is optional for the Word integration test")
    def test_real_pandoc_preserves_every_canonical_entry_link_and_bookmark(self):
        data = load_items()
        with self.workspace() as directory:
            destination = Path(directory) / "guide.docx"
            build_docx(data, "2026-11-04", destination)
            with zipfile.ZipFile(destination) as archive:
                for name in archive.namelist():
                    if name.endswith(".xml") or name.endswith(".rels"):
                        ET.fromstring(archive.read(name))
                document = ET.fromstring(archive.read("word/document.xml"))
                first = document.find("w:body/w:p/w:pPr/w:pStyle", NS)
                self.assertEqual(first.get(f"{{{W}}}val"), "CoverEyebrow")
                text = " ".join(node.text or "" for node in document.findall(".//w:t", NS))
                names = {node.get(f"{{{W}}}name") for node in document.findall(".//w:bookmarkStart", NS)}
                for entries in data.values():
                    for item in entries:
                        self.assertIn(bookmark(item["guid"]), names)
                        for alias in item.get("supersedes", []):
                            self.assertIn(bookmark(alias), names)
                        for field in ("title", "description", "detail", "applicability"):
                            if item.get(field):
                                self.assertIn(" ".join(item[field].split()), text)
                relationships = ET.fromstring(archive.read("word/_rels/document.xml.rels"))
                targets = {node.get("Target") for node in relationships}
                for entries in data.values():
                    for item in entries:
                        for field in ("documentation", "tools"):
                            for link in item.get(field, []):
                                self.assertIn(link["url"], targets)
                                self.assertIn(" ".join(link["title"].split()), text)
                h2 = [
                    paragraph for paragraph in document.findall(".//w:p", NS)
                    if paragraph.find("w:pPr/w:pStyle[@w:val='Heading2']", NS) is not None
                ]
                self.assertEqual(len(h2), sum(map(len, data.values())))
                self.assertIn("178", text)
                self.assertIn("11", text)


if __name__ == "__main__":
    unittest.main()
