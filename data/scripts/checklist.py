"""Shared, dependency-free loading and validation of the English source data."""

import json
import re
import uuid
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
ITEMS = ROOT / "data" / "en" / "items"
LEGACY_INDEX = ITEMS.parent / "legacy-index.json"
CATEGORIES = {
    "identity": "Identity - Authorization",
    "cluster_security": "Cluster security",
    "cluster_multi": "Multi-Tenant - Isolation",
    "storage": "Storage",
    "networking": "Networking",
    "resource_management": "Resource Management",
    "operations": "Cluster Operations",
    "bc_dr": "Business continuity - disaster recovery",
    "windows": "Windows",
    "application": "Application deployment",
    "container": "Image management",
}


def is_check(item):
    return item.get("kind", "check") == "check"


def validate_legacy_index(data, legacy):
    """Keep every published positional identity represented after consolidation."""
    if not isinstance(legacy, dict) or legacy.get("version") != 1:
        raise ValueError("Invalid legacy index version")
    sections = legacy.get("sections")
    expected = {
        title.lower().replace(" ", "-") for name, title in CATEGORIES.items()
        if name != "bc_dr"
    } | {"biz-continuity---disaster-recovery"}
    if not isinstance(sections, dict) or set(sections) != expected:
        raise ValueError("Legacy section mismatch")
    legacy_ids = set()
    for entries in sections.values():
        if not isinstance(entries, list):
            raise ValueError("Legacy indexes must be arrays")
        for value in entries:
            identifier = str(uuid.UUID(value))
            if identifier in legacy_ids:
                raise ValueError(f"Duplicate legacy GUID {identifier}")
            legacy_ids.add(identifier)
    represented = {
        identifier
        for entries in data.values()
        for item in entries
        for identifier in (item["guid"], *item.get("supersedes", []))
    }
    if missing := legacy_ids - represented:
        raise ValueError(f"Unmapped legacy GUIDs: {sorted(missing)}")


def load_items(directory=ITEMS):
    """Reject malformed data and globally duplicated IDs before publishing."""
    result = {}
    seen = set()
    directory = Path(directory)
    files = {path.stem for path in directory.glob("*.json")}
    if files != set(CATEGORIES):
        raise ValueError(f"Category mismatch: {files ^ set(CATEGORIES)}")
    for category in CATEGORIES:
        path = directory / f"{category}.json"
        entries = json.loads(path.read_text(encoding="utf-8-sig"))
        if not isinstance(entries, list) or not entries:
            raise ValueError(f"{path}: expected a nonempty array")
        for item in entries:
            if not isinstance(item, dict):
                raise ValueError(f"{path}: expected checklist objects")
            context = f"{path.name}: {item.get('title', '<missing title>')}"
            for field in ("title", "description", "guid"):
                if not isinstance(item.get(field), str) or not item[field].strip():
                    raise ValueError(f"{context}: missing {field}")
            identifier = str(uuid.UUID(item["guid"]))
            if identifier in seen:
                raise ValueError(f"{context}: duplicate GUID {identifier}")
            seen.add(identifier)
            if item.get("priority") not in ("High", "Medium", "Low"):
                raise ValueError(f"{context}: invalid priority")
            if item.get("kind", "check") not in ("check", "reference"):
                raise ValueError(f"{context}: invalid kind")
            if "applicability" in item and (
                not isinstance(item["applicability"], str)
                or not item["applicability"].strip()
            ):
                raise ValueError(f"{context}: applicability must be nonempty text")
            for field in ("supersedes", "related"):
                identifiers = item.get(field, [])
                if not isinstance(identifiers, list) or any(
                    not isinstance(value, str) for value in identifiers
                ):
                    raise ValueError(f"{context}: {field} must be an array")
                normalized = [str(uuid.UUID(value)) for value in identifiers]
                if len(set(normalized)) != len(normalized) or identifier in normalized:
                    raise ValueError(f"{context}: duplicate or self-referencing {field}")
                if normalized != identifiers:
                    raise ValueError(f"{context}: {field} must use canonical GUIDs")
            if identifier != item["guid"]:
                raise ValueError(f"{context}: use a canonical GUID")
            optional = item.get("optionalFields", {})
            if not isinstance(optional, dict) or not isinstance(optional.get("score", {}), dict):
                raise ValueError(f"{context}: invalid score metadata")
            scores = optional.get("score", {})
            if not is_check(item) and scores:
                raise ValueError(f"{context}: reference guidance must not be scored")
            tags = item.get("tags")
            if not isinstance(tags, list) or "all" not in tags or any(
                not isinstance(tag, str) or not re.fullmatch(r"[A-Za-z0-9-]+(?: [A-Za-z0-9-]+)*", tag)
                for tag in tags
            ):
                raise ValueError(f"{context}: invalid tags")
            if "details" in item:
                raise ValueError(f"{context}: use 'detail', not 'details'")
            if "detail" in item and not isinstance(item["detail"], str):
                raise ValueError(f"{context}: detail must be text")
            for kind in ("documentation", "tools"):
                links = item.get(kind, [])
                if not isinstance(links, list):
                    raise ValueError(f"{context}: {kind} must be an array")
                for link in links:
                    if not isinstance(link, dict) or not isinstance(link.get("url"), str):
                        raise ValueError(f"{context}: {kind} records need a URL, not nested checklist items")
                    url = urlsplit(link["url"])
                    if (
                        not isinstance(link.get("title"), str) or not link["title"].strip()
                        or url.scheme != "https" or not url.netloc
                    ):
                        raise ValueError(f"{context}: invalid HTTPS link {link}")
        result[category] = entries
    aliases = set()
    checks = {
        item["guid"] for entries in result.values() for item in entries if is_check(item)
    }
    for entries in result.values():
        for item in entries:
            for alias in item.get("supersedes", []):
                if alias in seen or alias in aliases:
                    raise ValueError(f"{item['title']}: ambiguous superseded GUID {alias}")
                aliases.add(alias)
            for related in item.get("related", []):
                if related not in checks:
                    raise ValueError(f"{item['title']}: related control does not exist: {related}")
    legacy_path = directory.parent / "legacy-index.json"
    if legacy_path.is_file():
        validate_legacy_index(result, json.loads(legacy_path.read_text(encoding="utf-8-sig")))
    return result


if __name__ == "__main__":
    data = load_items()
    checks = sum(is_check(item) for entries in data.values() for item in entries)
    references = sum(map(len, data.values())) - checks
    print(f"Validated {checks} checks and {references} reference entries in {len(data)} categories.")
