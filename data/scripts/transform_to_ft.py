"""Export the canonical checklist to the Azure Review Checklists format."""

import argparse
import csv
import json
from pathlib import Path

from checklist import ROOT, is_check, load_items


def transform(data):
    with (Path(__file__).with_name("filename_map.csv")).open(
        encoding="utf-8", newline=""
    ) as stream:
        mapping = {row["filename"]: row["actualname"] for row in csv.DictReader(stream)}
    categories = list(dict.fromkeys(mapping[name] for name in data))
    titles = {item["guid"]: item["title"] for entries in data.values() for item in entries}
    items = []
    for name, entries in data.items():
        for entry in entries:
            if not is_check(entry):
                continue
            links = entry.get("documentation", []) or entry.get("tools", [])
            description = [
                f"Applicability: {entry['applicability']}" if entry.get("applicability") else "",
                entry["description"],
                entry.get("detail", ""),
            ]
            if entry.get("related"):
                description.append("Related controls: " + "; ".join(
                    f"{titles[identifier]} ({identifier})" for identifier in entry["related"]
                ))
            item = {
                "text": entry["title"],
                "description": "\n\n".join(part for part in description if part),
                "guid": entry["guid"],
                "subcategory": next(
                    (tag.title() for tag in entry["tags"] if tag != "all"), "Other"
                ),
                "category": mapping[name],
                "severity": entry["priority"],
                "link": links[0]["url"] if links else "",
            }
            if entry.get("supersedes"):
                item["supersedes"] = entry["supersedes"]
            scores = entry.get("optionalFields", {}).get("score", {})
            item.update(
                (key, scores[key])
                for key in ("scale", "simple", "ha", "cost", "graph", "security")
                if key in scores
            )
            items.append(item)
    return {
        "categories": [{"name": name} for name in categories],
        "status": [
            {"name": "Not verified", "description": "This check has not been looked at yet"},
            {"name": "Open", "description": "There is an action item associated to this check"},
            {"name": "Fulfilled", "description": "This check has been verified, and there are no further action items associated to it"},
            {"name": "Not required", "description": "Recommendation understood, but not needed by current requirements"},
            {"name": "N/A", "description": "Not applicable for current design"},
        ],
        "severities": [{"name": value} for value in ("High", "Medium", "Low")],
        "metadata": {"name": "Azure AKS Review", "state": "GA"},
        "items": items,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output", type=Path,
        default=ROOT / "src" / "web" / "fta" / "aks_checklist.en.json",
    )
    args = parser.parse_args()
    result = transform(load_items())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Exported {len(result['items'])} items to {args.output}")


if __name__ == "__main__":
    main()
