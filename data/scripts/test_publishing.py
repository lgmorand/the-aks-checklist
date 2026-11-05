import copy
import json
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path
from unittest.mock import patch

from checklist import CATEGORIES, load_items, validate_legacy_index
from check_links import classify, collect_links
from generate_offline import build_pdf, main, render
from transform_to_ft import transform


def fixture():
    return {
        name: [{
            "guid": f"00000000-0000-4000-8000-{index:012d}",
            "title": f"Check {name}",
            "description": "Use <supported> settings & verify.",
            "detail": "Extended guidance.",
            "priority": "High",
            "tags": ["all", "security"],
            "documentation": [{"title": "AKS", "url": "https://learn.microsoft.com/azure/aks/"}],
            "tools": [{"title": "Tool", "url": "https://example.com/tool"}],
            "optionalFields": {"score": {"security": 1}},
        }]
        for index, name in enumerate(CATEGORIES)
    }


class PublishingTests(unittest.TestCase):
    def setUp(self):
        self.data = fixture()

    def validate(self, data):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            for name, entries in data.items():
                (path / f"{name}.json").write_text(json.dumps(entries), encoding="utf-8")
            return load_items(path)

    def test_valid_data_preserves_order(self):
        self.assertEqual(list(self.validate(self.data)), list(CATEGORIES))

    def test_duplicate_guid_across_categories_is_rejected(self):
        self.data["storage"][0]["guid"] = self.data["identity"][0]["guid"]
        with self.assertRaisesRegex(ValueError, "duplicate GUID"):
            self.validate(self.data)

    def test_missing_category_is_rejected(self):
        del self.data["windows"]
        with self.assertRaisesRegex(ValueError, "Category mismatch"):
            self.validate(self.data)

    def test_invalid_guid_priority_tags_and_legacy_details_are_rejected(self):
        for key, value in (
            ("guid", "bad"), ("priority", "Critical"), ("tags", ["all", 'bad"tag']),
            ("details", "ignored text"),
        ):
            with self.subTest(key=key):
                data = copy.deepcopy(self.data)
                data["identity"][0][key] = value
                with self.assertRaises(ValueError):
                    self.validate(data)

    def test_insecure_documentation_is_rejected(self):
        self.data["identity"][0]["documentation"][0]["url"] = "http://example.com"
        with self.assertRaisesRegex(ValueError, "HTTPS"):
            self.validate(self.data)

    def test_checklist_item_nested_inside_documentation_is_rejected(self):
        self.data["identity"][0]["documentation"].append(self.data["storage"][0])
        with self.assertRaisesRegex(ValueError, "nested checklist"):
            self.validate(self.data)

    def test_fta_preserves_all_guids_detail_and_scores(self):
        result = transform(self.data)
        self.assertEqual(len(result["items"]), len(CATEGORIES))
        item = result["items"][0]
        self.assertEqual(item["guid"], self.data["identity"][0]["guid"])
        self.assertIn("Extended guidance.", item["description"])
        self.assertEqual(item["security"], 1)
        self.assertNotIn("cost", item)
        self.assertEqual(item["link"], "https://learn.microsoft.com/azure/aks/")
        categories = {entry["name"] for entry in result["categories"]}
        self.assertTrue(all(entry["category"] in categories for entry in result["items"]))

    def test_fta_uses_tools_when_documentation_is_empty(self):
        self.data["identity"][0]["documentation"] = []
        self.assertEqual(transform(self.data)["items"][0]["link"], "https://example.com/tool")

    def test_offline_is_deterministic_complete_and_html_escaped(self):
        first = render(self.data, "2026-11-04")
        self.assertEqual(first, render(self.data, "2026-11-04"))
        markdown, document = first
        self.assertEqual(document.count("<article "), len(CATEGORIES))
        self.assertIn("&lt;supported&gt; settings &amp; verify.", document)
        self.assertNotIn("<supported>", document)
        self.assertEqual(markdown.count("Extended guidance."), len(CATEGORIES))
        self.assertEqual(document.count('href="https://example.com/tool"'), len(CATEGORIES))
        for name in CATEGORIES:
            self.assertIn(f'href="#{name}"', document)
            self.assertIn(f'id="{name}"', document)

    def test_offline_publication_has_numbered_cards_and_complete_navigation(self):
        self.data["identity"][0]["applicability"] = "Only when applicable."
        _, document = render(self.data, "2026-11-04")
        self.assertIn('class="cover-stats"', document)
        self.assertIn('class="guide-grid"', document)
        self.assertIn('class="applicability"', document)
        self.assertIn('class="priority priority-high"', document)
        self.assertIn('Control 01.01', document)
        self.assertIn('Control 11.01', document)
        self.assertIn('@media print', document)
        self.assertIn('@media (max-width: 760px)', document)
        self.assertIn('print-color-adjust: exact', document)
        identifiers, anchors = [], []

        class Navigation(HTMLParser):
            def handle_starttag(self, tag, attrs):
                attributes = dict(attrs)
                if "id" in attributes:
                    identifiers.append(attributes["id"])
                if tag == "a" and attributes.get("href", "").startswith("#"):
                    anchors.append(attributes["href"][1:])

        Navigation().feed(document)
        self.assertEqual(len(identifiers), len(set(identifiers)))
        self.assertTrue(set(anchors).issubset(identifiers))
        self.assertEqual(len(anchors), len(CATEGORIES))

    def test_reference_guidance_is_not_exported_or_counted_as_a_check(self):
        reference = self.data["identity"][0]
        reference["kind"] = "reference"
        del reference["optionalFields"]
        self.validate(self.data)
        exported = transform(self.data)
        self.assertNotIn(reference["guid"], {item["guid"] for item in exported["items"]})
        markdown, document = render(self.data, "2026-11-04")
        self.assertIn("10 checks across 11 sections; 1 unscored reference entries.", markdown)
        self.assertIn('id="reference-guidance"', document)
        self.assertEqual(document.count(reference["title"]), 1)
        self.assertIn("Reference guidance (not scored)", document)

    def test_applicability_aliases_and_cross_references_are_preserved(self):
        entry = self.data["identity"][0]
        target = self.data["storage"][0]
        entry["applicability"] = "Only when <required>."
        entry["supersedes"] = ["90000000-0000-4000-8000-000000000001"]
        entry["related"] = [target["guid"]]
        self.validate(self.data)
        exported = transform(self.data)["items"][0]
        self.assertEqual(exported["supersedes"], entry["supersedes"])
        self.assertIn("Applicability: Only when <required>.", exported["description"])
        self.assertIn(target["title"], exported["description"])
        markdown, document = render(self.data, "2026-11-04")
        self.assertIn("Only when &lt;required&gt;.", document)
        self.assertIn(f'href="#item-{target["guid"]}"', document)
        self.assertIn(f'id="item-{target["guid"]}"', document)
        self.assertIn(f"[{target['title']}](#item-{target['guid']})", markdown)

    def test_invalid_review_metadata_is_rejected(self):
        identifier = self.data["identity"][0]["guid"]
        cases = (
            {"kind": "advanced"},
            {"kind": "reference"},
            {"applicability": ""},
            {"applicability": True},
            {"supersedes": "not-an-array"},
            {"supersedes": [1]},
            {"supersedes": [identifier]},
            {"supersedes": [self.data["storage"][0]["guid"]]},
            {"supersedes": ["90000000-0000-4000-8000-000000000001"] * 2},
            {"related": ["90000000-0000-4000-8000-000000000001"]},
            {"related": [identifier]},
        )
        for change in cases:
            with self.subTest(change=change):
                data = copy.deepcopy(self.data)
                data["identity"][0].update(change)
                with self.assertRaises(ValueError):
                    self.validate(data)

    def test_alias_cannot_be_owned_by_multiple_controls(self):
        alias = "90000000-0000-4000-8000-000000000001"
        self.data["identity"][0]["supersedes"] = [alias]
        self.data["storage"][0]["supersedes"] = [alias]
        with self.assertRaisesRegex(ValueError, "ambiguous superseded"):
            self.validate(self.data)

    def test_related_controls_must_not_target_reference_material(self):
        self.data["storage"][0]["kind"] = "reference"
        del self.data["storage"][0]["optionalFields"]
        self.data["identity"][0]["related"] = [self.data["storage"][0]["guid"]]
        with self.assertRaisesRegex(ValueError, "related control does not exist"):
            self.validate(self.data)

    def test_legacy_positions_must_remain_represented_after_consolidation(self):
        legacy = {"version": 1, "sections": {
            ("Biz continuity - disaster recovery" if name == "bc_dr" else title).lower().replace(" ", "-"):
                [item["guid"] for item in self.data[name]]
            for name, title in CATEGORIES.items()
        }}
        validate_legacy_index(self.data, legacy)
        old = self.data["identity"][0]["guid"]
        self.data["identity"][0]["guid"] = "90000000-0000-4000-8000-000000000001"
        with self.assertRaisesRegex(ValueError, "Unmapped legacy GUIDs"):
            validate_legacy_index(self.data, legacy)
        self.data["storage"][0]["supersedes"] = [old]
        validate_legacy_index(self.data, legacy)
        legacy["sections"]["storage"].append(old)
        with self.assertRaisesRegex(ValueError, "Duplicate legacy GUID"):
            validate_legacy_index(self.data, legacy)

    def test_pdf_renderer_failure_does_not_replace_existing_pdf(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "existing.pdf"
            output.write_bytes(b"%PDF-existing")
            with patch("generate_offline.subprocess.run"):
                with self.assertRaisesRegex(RuntimeError, "valid PDF"):
                    build_pdf(Path(directory) / "source.html", output, "browser")
            self.assertEqual(output.read_bytes(), b"%PDF-existing")

    def test_offline_cli_uses_the_styled_word_exporter(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            destination = output / "AKS-Checklist.docx"
            arguments = [
                "generate_offline.py", "--output-dir", str(output),
                "--date", "2026-11-04", "--docx", str(destination),
                "--pandoc", "custom-pandoc",
            ]
            with patch("sys.argv", arguments), patch("generate_offline.load_items", return_value=self.data), \
                    patch("generate_word.build_docx") as word:
                main()
            word.assert_called_once_with(self.data, "2026-11-04", destination, pandoc="custom-pandoc")
            self.assertTrue((output / "AKS-Checklist.html").is_file())
            self.assertTrue((output / "AKS-Checklist.md").is_file())

    def test_links_check_fragments_and_do_not_hide_network_failures(self):
        url = "https://learn.microsoft.com/azure/aks/article#supported"
        page = {"http_status": 200, "final_url": url, "body": '<h2 id="supported">Title</h2>'}
        self.assertEqual(classify(url, page)["result"], "ok")
        self.assertEqual(classify(url + "-missing", page)["result"], "fragment-missing")
        for status, expected in ((404, "broken"), (410, "broken"), (403, "unverified"), (429, "unverified"), (None, "unverified")):
            with self.subTest(status=status):
                self.assertEqual(classify(url, {**page, "http_status": status})["result"], expected)
        self.assertEqual(
            classify(url, {**page, "final_url": "https://learn.microsoft.com/en-us/azure/aks/overview"})["result"],
            "ok",
        )

    def test_markdown_url_labels_do_not_merge_with_their_destinations(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            template = root / "data" / "tooling" / "html-generator" / "template.html"
            template.parent.mkdir(parents=True)
            template.write_text('<a href="https://example.com/article#supported">Guide</a>', encoding="utf-8")
            (root / "README.md").write_text(
                "[https://aka.ms/the-aks-checklist](https://aka.ms/the-aks-checklist)\n"
                "![Status](https://example.com/badge.svg)\n",
                encoding="utf-8",
            )
            with patch("check_links.ROOT", root):
                links = collect_links({})
            self.assertEqual(set(links), {
                "https://aka.ms/the-aks-checklist",
                "https://example.com/badge.svg",
                "https://example.com/article#supported",
            })

    def test_short_link_fallback_to_search_is_not_a_verified_document(self):
        result = classify("https://aka.ms/missing-checklist", {
            "http_status": 200, "final_url": "https://www.bing.com/?ref=aka",
            "body": "",
        })
        self.assertEqual(result["result"], "redirect-review")

    def test_redirect_to_documentation_root_requires_review(self):
        url = "https://learn.microsoft.com/azure/aks/old"
        result = classify(url, {
            "http_status": 200, "final_url": "https://learn.microsoft.com/en-us/azure/",
            "body": "",
        })
        self.assertEqual(result["result"], "redirect-review")


if __name__ == "__main__":
    unittest.main()
