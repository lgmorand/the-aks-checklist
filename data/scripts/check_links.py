"""Audit source hyperlinks, redirects and Microsoft Learn fragment targets."""

import argparse
import concurrent.futures
import json
import re
import time
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urldefrag, urlsplit
from urllib.request import Request, urlopen

from checklist import ROOT, load_items


class Targets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.identifiers = set()

    def handle_starttag(self, tag, attrs):
        self.identifiers.update(
            value for key, value in attrs if key in ("id", "name") and value
        )


class ProjectLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = set()

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        candidates = [values.get("href"), values.get("src")]
        if tag == "meta" and (
            values.get("property") in ("og:image", "og:url")
            or values.get("name") == "twitter:image"
        ):
            candidates.append(values.get("content"))
        self.urls.update(
            url for url in candidates if url and url.startswith(("https://", "http://"))
        )


def collect_links(data):
    links = {}
    for category, items in data.items():
        for item in items:
            for kind in ("documentation", "tools"):
                for link in item.get(kind, []):
                    links.setdefault(link["url"], []).append(f"{category}: {item['guid']}")
    for path in (ROOT / "README.md", ROOT / "data" / "tooling" / "html-generator" / "template.html"):
        text = path.read_text(encoding="utf-8")
        if path.suffix == ".html":
            document = ProjectLinks()
            document.feed(text)
            urls = document.urls
        else:
            urls = re.findall(r'https?://[^\s<>"\)\[\]]+', text)
        for url in urls:
            links.setdefault(url, []).append(str(path.relative_to(ROOT)))
    return links


def fetch_page(url):
    for attempt in range(3):
        try:
            request = Request(url, headers={"User-Agent": "AKS-Checklist-Link-Audit/1.0"})
            with urlopen(request, timeout=30) as response:
                body = response.read(4 * 1024 * 1024)
                return {
                    "http_status": response.status,
                    "final_url": response.url,
                    "body": body.decode("utf-8", errors="replace"),
                }
        except HTTPError as error:
            if (error.code == 429 or error.code >= 500) and attempt < 2:
                retry_after = error.headers.get("Retry-After", "")
                delay = int(retry_after) if retry_after.isdigit() else 10 * (2 ** attempt)
                if delay > 120:
                    return {"http_status": error.code, "final_url": error.url, "error": str(error)}
                time.sleep(delay)
                continue
            return {"http_status": error.code, "final_url": error.url, "error": str(error)}
        except (URLError, TimeoutError, OSError) as error:
            if attempt < 2:
                time.sleep(2 ** attempt)
                continue
            return {"http_status": None, "final_url": url, "error": str(error)}


def classify(url, page):
    result = {key: value for key, value in page.items() if key != "body"}
    result["url"] = url
    status = page["http_status"]
    if status in (404, 410):
        result["result"] = "broken"
    elif status is None or status in (401, 403, 429) or status >= 500:
        result["result"] = "unverified"
    elif not 200 <= status < 300:
        result["result"] = "broken"
    else:
        result["result"] = "ok"
        final = urlsplit(page["final_url"])
        original = urlsplit(url)
        if original.hostname == "aka.ms" and final.hostname in ("bing.com", "www.bing.com"):
            result["result"] = "redirect-review"
        if final.hostname == "learn.microsoft.com":
            # A redirect to a product landing page is not proof of the intended article.
            if final.path.rstrip("/") in ("", "/en-us", "/azure", "/en-us/azure"):
                result["result"] = "redirect-review"
            fragment = unquote(original.fragment).split(":~:text=", 1)[0]
            if fragment:
                targets = Targets()
                targets.feed(page.get("body", ""))
                if fragment not in targets.identifiers:
                    result["result"] = "fragment-missing"
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path, default=ROOT / "output" / "link-report.json")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--retry-report", type=Path, help="Reuse successful checks from a saved audit; retry failures and new URLs")
    args = parser.parse_args()
    links = collect_links(load_items())
    previous = {}
    if args.retry_report:
        previous = {
            entry["url"]: entry for entry in json.loads(args.retry_report.read_text(encoding="utf-8"))
            if entry["result"] == "ok" and entry["url"] in links
        }
    bases = sorted({urldefrag(url)[0] for url in links if url not in previous})
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
        pages = dict(zip(bases, executor.map(fetch_page, bases)))
    results = [
        {**(previous[url] if url in previous else classify(url, pages[urldefrag(url)[0]])),
         "sources": sorted(set(sources))}
        for url, sources in sorted(links.items())
    ]
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
    failures = [item for item in results if item["result"] != "ok"]
    for item in failures:
        print(f"{item['result']}: {item['http_status']} {item['url']}")
    print(f"{len(results) - len(failures)}/{len(results)} links verified; report: {args.report}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
