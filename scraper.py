#!/usr/bin/env python3
"""Collect mortgage rates from the lenders in institutions.yaml and write rates.json.

  python scraper.py                           run the scrape (what the hourly job does)
  python scraper.py --inspect URL             list elements on a page that contain a rate, with CSS selectors
  python scraper.py --inspect URL --browser   same, for pages that load their rates with JavaScript
  python scraper.py --demo                    write sample data so the site has something to show
"""
import json, re, sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

USER_AGENT = "MortgageRatesBot/1.0 (+https://YOUR-DOMAIN.com)"  # EDIT: put your own site address here
MIN_RATE, MAX_RATE = 0.5, 15.0  # anything outside this range is treated as a scraping error
RATE_RE = re.compile(r"(\d{1,2}(?:\.\d{1,3})?)\s*%")
OUT = Path("rates.json")


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def robots_ok(url):
    import requests
    p = urlparse(url)
    try:
        r = requests.get(f"{p.scheme}://{p.netloc}/robots.txt", headers={"User-Agent": USER_AGENT}, timeout=15)
        if r.status_code != 200:
            return True
        rp = RobotFileParser()
        rp.parse(r.text.splitlines())
        return rp.can_fetch(USER_AGENT, url)
    except requests.RequestException:
        return True


def get_html(url, browser=False):
    if browser:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            b = pw.chromium.launch()
            page = b.new_page(user_agent=USER_AGENT)
            page.goto(url, wait_until="networkidle", timeout=60000)
            html = page.content()
            b.close()
            return html
    import requests
    r = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=30)
    r.raise_for_status()
    return r.text


def parse_rate(text):
    m = RATE_RE.search(text or "")
    if not m:
        raise ValueError(f"no rate with a % sign found in {text!r}")
    rate = float(m.group(1))
    if not MIN_RATE <= rate <= MAX_RATE:
        raise ValueError(f"rate {rate} is outside the plausible range")
    return rate


def run():
    import yaml
    from bs4 import BeautifulSoup
    lenders = [x for x in (yaml.safe_load(Path("institutions.yaml").read_text()) or []) if x.get("enabled", True)]
    if not lenders:
        print("No lenders enabled in institutions.yaml; leaving rates.json unchanged.")
        return 0
    old = {}
    if OUT.exists():
        prev = json.loads(OUT.read_text())
        if not prev.get("demo"):
            old = {(r["institution"], r["product"]): r for r in prev.get("rates", [])}
    rates, errors = [], []
    for lender in lenders:
        name, url = lender["name"], lender["url"]
        soup = page_error = None
        try:
            if not robots_ok(url):
                raise RuntimeError("robots.txt does not allow fetching this page")
            soup = BeautifulSoup(get_html(url, lender.get("mode") == "browser"), "html.parser")
        except Exception as e:
            page_error = e
        for item in lender["rates"]:
            key = (name, item["product"])
            try:
                if page_error:
                    raise page_error
                el = soup.select_one(item["selector"])
                if el is None:
                    raise ValueError(f"selector not found: {item['selector']}")
                rates.append({"institution": name, "product": item["product"],
                              "rate": parse_rate(el.get_text(" ", strip=True)),
                              "source": url, "fetched_at": now(), "stale": False})
            except Exception as e:
                errors.append(f"{name} / {item['product']}: {e}")
                if key in old:  # keep the last good value, flagged as stale
                    rates.append({**old[key], "stale": True})
    OUT.write_text(json.dumps({"updated_at": now(), "demo": False, "rates": rates}, indent=2))
    for e in errors:
        print("ERROR:", e, file=sys.stderr)
    return 1 if errors else 0


def css_path(el):
    parts = []
    while el is not None and el.name != "[document]":
        same = [s for s in el.parent.children if getattr(s, "name", None) == el.name]
        part = el.name + (f"#{el['id']}" if el.get("id") else "")
        if len(same) > 1 and not el.get("id"):
            part += f":nth-of-type({[s is el for s in same].index(True) + 1})"
        parts.append(part)
        if el.get("id"):
            break
        el = el.parent
    return " > ".join(reversed(parts))


def find_selectors(url, browser):
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(get_html(url, browser), "html.parser")
    found = soup.find_all(string=RATE_RE)
    for text in found:
        print(f"{text.strip()[:40]:42} {css_path(text.parent)}")
    if not found:
        print("No rates found. If the page loads them with JavaScript, add --browser.")


def demo():
    sample = [("Sample Bank", "5-year fixed", 4.89), ("Sample Bank", "5-year variable", 5.45),
              ("Sample Credit Union", "5-year fixed", 4.79), ("Sample Credit Union", "3-year fixed", 4.99)]
    rates = [{"institution": i, "product": p, "rate": r, "source": "https://example.com",
              "fetched_at": now(), "stale": False} for i, p, r in sample]
    OUT.write_text(json.dumps({"updated_at": now(), "demo": True, "rates": rates}, indent=2))


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[:1] == ["--demo"]:
        demo()
    elif a[:1] == ["--inspect"] and len(a) > 1:
        find_selectors(a[1], "--browser" in a)
    else:
        sys.exit(run())
