#!/usr/bin/env python3
"""Collect mortgage rates from the lenders in institutions.yaml and write rates.json.

  python scraper.py                           run the scrape (what the hourly job does)
  python scraper.py --inspect URL             list elements on a page that contain a rate, with CSS selectors
  python scraper.py --inspect URL --browser   same, for pages that load their rates with JavaScript
  python scraper.py --demo                    write sample data so the site has something to show
"""
import json, re, subprocess, sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

USER_AGENT = "MortgageRatesBot/1.0 (+https://whatstherate.ca)"
MIN_RATE, MAX_RATE = 0.5, 15.0  # anything outside this range is treated as a scraping error
RATE_RE = re.compile(r"(\d{1,2}(?:\.\d{1,3})?)\s*%")
SKIP_TAGS = ("script", "style", "noscript", "template")
OUT = Path("rates.json")


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def norm(s):
    return re.sub(r"\s+", " ", s or "").strip().lower()


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
            try:
                b = pw.chromium.launch()
            except Exception:  # browser not installed yet: install it once, then retry
                subprocess.run([sys.executable, "-m", "playwright", "install", "--with-deps", "chromium"], check=True)
                b = pw.chromium.launch()
            page = b.new_page(user_agent=USER_AGENT)
            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            try:  # wait until real rates (like 4.99%) show up on the page
                page.wait_for_function(r"/\d\.\d{2,3}\s*%/.test(document.body.innerText)", timeout=30000)
                page.wait_for_timeout(2000)
            except Exception:
                pass
            html = page.content()
            b.close()
            return html
    import requests
    r = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=30)
    r.raise_for_status()
    return r.text


def pick(text, nth=1):
    """Return the nth percentage in text, or None if there are fewer than that."""
    found = RATE_RE.findall(text)
    if len(found) < nth:
        return None
    rate = float(found[nth - 1])
    if not MIN_RATE <= rate <= MAX_RATE:
        raise ValueError(f"rate {rate} is outside the plausible range")
    return rate


def rate_by_label(soup, label, nth=1, after=None, occurrence=1):
    """Find the table row or card whose text includes `label` and return the nth % figure after it.
    `after`: only look below the first place on the page that mentions this text.
    `occurrence`: use the 2nd, 3rd... time the label appears (for pages with repeated tables)."""
    want = norm(label)
    tags = [t for t in soup.find_all(True) if t.name not in SKIP_TAGS]
    text = {id(t): norm(t.get_text(" ", strip=True)) for t in tags}

    def smallest(pool, needle):  # the innermost elements whose text contains `needle`
        ids = {id(t) for t in pool if needle in text[id(t)]}
        return [t for t in pool if id(t) in ids and not any(id(c) in ids for c in t.find_all(True, recursive=False))]

    if after:
        marker = smallest(tags, norm(after))
        if not marker:
            raise ValueError(f"section {after!r} not found")
        tags = tags[tags.index(marker[0]) + 1:]
    found = smallest(tags, want)
    found.sort(key=lambda t: text[id(t)] != want)  # whole-cell matches first; sort is stable, so page order is kept
    rates = []
    for el in found:
        for _ in range(6):  # climb from the label up to the row or card that also holds the rates
            if el is None or el.name == "[document]":
                break
            after_text = text[id(el)].split(want, 1)[-1]
            if RATE_RE.search(after_text):
                rate = pick(after_text, nth)  # None if this row has fewer figures than nth: don't borrow from other rows
                if rate is not None:
                    rates.append(rate)
                break
            el = el.parent
        if len(rates) >= occurrence:
            return rates[occurrence - 1]
    raise ValueError(f"no rate found next to the label {label!r}")


def extract(soup, item):
    if "label" in item:
        return rate_by_label(soup, item["label"], item.get("nth", 1), item.get("after"), item.get("occurrence", 1))
    el = soup.select_one(item["selector"])
    if el is None:
        raise ValueError(f"selector not found: {item['selector']}")
    rate = pick(el.get_text(" ", strip=True), item.get("nth", 1))
    if rate is None:
        raise ValueError(f"no rate with a % sign inside {item['selector']}")
    return rate


def scrape_lender(lender):
    """Return ({product: rate}, {product: error}) for one lender."""
    from bs4 import BeautifulSoup
    url, mode = lender["url"], lender.get("mode", "auto")
    if not robots_ok(url):
        return {}, {i["product"]: "robots.txt does not allow fetching this page" for i in lender["rates"]}
    results, todo, errors = {}, lender["rates"], {}
    for browser in ([False, True] if mode == "auto" else [mode == "browser"]):
        errors = {}
        try:
            soup = BeautifulSoup(get_html(url, browser), "html.parser")
        except Exception as e:
            errors = {i["product"]: e for i in todo}
        else:
            for item in todo:
                try:
                    results[item["product"]] = extract(soup, item)
                except Exception as e:
                    errors[item["product"]] = e
        todo = [i for i in todo if i["product"] in errors]
        if not todo:
            break
    return results, errors


def run():
    import yaml
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
        try:
            results, errs = scrape_lender(lender)
        except Exception as e:
            results, errs = {}, {i["product"]: e for i in lender["rates"]}
        for item in lender["rates"]:
            product = item["product"]
            if product in results:
                print(f"OK    {name} / {product}: {results[product]}%")
                rates.append({"institution": name, "product": product, "rate": results[product],
                              "source": url, "fetched_at": now(), "stale": False})
            else:
                errors.append(f"{name} / {product}: {errs.get(product, 'unknown error')}")
                if (name, product) in old:  # keep the last good value, flagged as stale
                    rates.append({**old[(name, product)], "stale": True})
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
