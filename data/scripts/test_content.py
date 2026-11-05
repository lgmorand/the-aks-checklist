import json
import unittest

from checklist import LEGACY_INDEX, is_check, load_items
from transform_to_ft import transform


class ContentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = load_items()
        cls.items = {
            item["guid"]: item for entries in cls.data.values() for item in entries
        }

    def test_consolidated_controls_preserve_historical_identities(self):
        replacements = {
            "5e3df584-eccc-4d97-a3b6-bcda3b50eb2e": "fc1e68dd-ac89-4851-8e53-8fbac3461d26",
            "af4dc5bd-f37e-44df-a4c9-d6a00e64a61a": "9e89373e-8f02-4c52-9901-a3bd98606b66",
            "d2e0d5d7-71d4-41e3-910c-c57b4a4b1410": "c958d1cb-0e91-4362-9fb0-c1bff3701680",
            "23fda718-b80b-44c8-b2e4-d46580ab6651": "c9e95ffe-6dd1-4a17-8c5f-110389ca9b21",
            "a71e024f-ac46-4d0e-86d8-fad9a86c99af": "c9e95ffe-6dd1-4a17-8c5f-110389ca9b21",
            "5b56ad48-408f-4e72-934c-476ba280dcf5": "dbb1cf7f-dbf5-44bc-94cc-515c77aac07f",
            "13bb9e32-6f48-4747-9531-0147f20f4b03": "0b56d03c-5fc8-42b1-943b-9e4b4d0f3de8",
            "13bb9e32-6f48-4747-9531-0147f20f4b04": "7b613b26-df38-49a8-94bf-c5301a91d558",
            "574bd2fe-f58b-4199-b334-f7eff3ef90c8": "7b613b26-df38-49a8-94bf-c5301a91d558",
            "b78f2dec-d75e-44c3-937a-7509fd7a54f1": "5388e9de-d167-4dd1-a2b0-ac241b999a64",
            "170265f4-bb46-4a39-9af7-f317284797b1": "5d0bb60d-b8e0-4031-9c5b-1f0a735f771f",
            "c755562f-2b4e-4456-9b4d-874a748b662e": "c88681ab-bb2b-46d1-9ea6-72564b75429a",
            "495e0503-5fbd-4ba7-8c33-2551b1676d1e": "7f8b07c5-882b-45ba-9ec9-bcc29b4721ff",
            "b54eb2eb-03dd-4aa3-9927-18e2edb11726": "4868aa30-95a9-49fd-867e-57e70cb0d1d5",
            "4536365b-a82d-49dc-b68d-5b13f47d598f": "b3f09641-e9cb-4ddd-8d35-f5c7f0851f86",
            "d34f49c0-e964-4465-9211-520479338b13": "126c7653-e87f-44f1-b622-9ad72dd66a6a",
            "d167dd18-2b0a-4c24-8b99-9a646f8389a7": "3b77c0ee-3f84-4a86-bb46-c6dc3070168c",
            "e38f1680-8ddc-4c93-bf09-6b932a4935ca": "6ae51d09-8142-4979-95ed-7ec3451de81c",
            "3c763963-7a55-42d5-a15e-401955387e5c": "d695618d-6d63-471f-bc4b-a4231fe2d573",
        }
        for old, canonical in replacements.items():
            with self.subTest(old=old):
                self.assertNotIn(old, self.items)
                self.assertIn(old, self.items[canonical].get("supersedes", []))

    def test_reference_material_is_unscored_and_not_in_fta(self):
        exported = {item["guid"] for item in transform(self.data)["items"]}
        for identifier in (
            "73b32a5a-67f7-4a9e-b5b3-1f38c3f39812",
            "fd926057-60e1-4d6c-afc2-0f03b5ab3763",
        ):
            with self.subTest(identifier=identifier):
                item = self.items[identifier]
                self.assertFalse(is_check(item))
                self.assertFalse(item.get("optionalFields", {}).get("score"))
                self.assertNotIn(identifier, exported)

    def test_configuration_flags_are_not_exported_as_outcome_compliance(self):
        for identifier in (
            "0751f099-e6f4-4250-b405-d2b26c707432",
            "3b365a91-7ecb-4e48-bbe5-4cd7df2e8bba",
            "9ca48e4a-85e2-4223-bce8-bb12307ca5f1",
            "24367b33-6971-45b1-952b-eee0b9b588de",
            "a0f61565-9de5-458f-a372-49c831112dbd",
            "ed127dd1-42b0-46b2-8c69-99a646f3389a",
            "6f158e3e-a3a9-42c2-be7e-2165c3a87af4",
        ):
            with self.subTest(identifier=identifier):
                self.assertNotIn("graph", self.items[identifier].get("optionalFields", {}).get("score", {}))

    def test_availability_controls_have_consistent_high_priority(self):
        for identifier in (
            "de1b6b38-4fa9-4f6e-ab92-d824346dd20c",
            "dc4828a3-fc4f-4ac5-8844-122b8482dbb1",
            "4f1f88f9-98a3-48f5-a37f-4d9c9aecbb11",
            "1eea4888-8c2a-40b2-a40b-cacdc5f55497",
            "8c6703c5-42e9-46ef-93f1-7f6232af25fc",
            "d695618d-6d63-471f-bc4b-a4231fe2d573",
        ):
            with self.subTest(identifier=identifier):
                self.assertEqual(self.items[identifier]["priority"], "High")
                self.assertTrue(self.items[identifier].get("applicability"))

    def test_specialist_options_have_explicit_applicability(self):
        for identifier in (
            "17bd8ae4-8ee7-472d-bca5-c7e3cc9b6d82",
            "26886d20-b66c-457b-a591-19bf8e8f5c58",
            "57bf217f-6dc8-481c-81e2-785773e9c00f",
            "ec8e4e42-0344-41b0-b865-9123e8956d31",
            "5ae124ba-34df-4585-bcdc-e9bd3bb0cdb3",
            "c88681ab-bb2b-46d1-9ea6-72564b75429a",
            "2a5f0cab-92b2-46dc-81a6-d358f7fd062a",
            "87e651ea-bc4a-4a87-a6df-c06a4b570ebc",
            "64d1a846-e28a-4b6b-9a33-22a635c15a21",
            "24367b33-6971-45b1-952b-eee0b9b588de",
        ):
            with self.subTest(identifier=identifier):
                self.assertTrue(self.items[identifier].get("applicability"))

    def test_new_operational_controls_have_official_guidance(self):
        legacy = json.loads(LEGACY_INDEX.read_text(encoding="utf-8"))
        original = {identifier for entries in legacy["sections"].values() for identifier in entries}
        for category, url in (
            ("networking", "https://learn.microsoft.com/azure/aks/app-routing-gateway-api-dns-tls"),
            ("operations", "https://learn.microsoft.com/azure/architecture/operator-guides/aks/aks-triage-controllers"),
            ("operations", "https://learn.microsoft.com/azure/well-architected/reliability/testing-strategy"),
        ):
            with self.subTest(category=category, url=url):
                matches = [
                    item for item in self.data[category]
                    if item["guid"] not in original
                    and url in {link["url"] for link in item.get("documentation", [])}
                ]
                self.assertEqual(len(matches), 1)
                self.assertEqual(matches[0]["priority"], "High")

    def test_platform_migration_is_distinct_from_application_releases(self):
        item = self.items["ce5731c5-a19f-4bfb-adc8-4086c764b3c9"]
        self.assertIn(
            "https://learn.microsoft.com/azure/architecture/guide/aks/blue-green-deployment-for-aks",
            {link["url"] for link in item["documentation"]},
        )
        text = f"{item['description']} {item.get('detail', '')}".lower()
        self.assertTrue("blue/green" in text or "blue-green" in text)
        self.assertIn("rollback", text)


if __name__ == "__main__":
    unittest.main()
