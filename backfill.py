"""One-off: rebuild a lender's rate history from archived copies of its own rate page.

Lenders don't publish their past rates. The Internet Archive (Wayback Machine) has saved copies of their rate
pages over time; this reads one copy per week with exactly the same rules the hourly scraper uses
(institutions.yaml), and writes what it found to a CSV report for review. It never touches history.json:
the reviewed results are merged separately. Nothing is estimated: a week whose copy can't be read is left out.

Usage:  python backfill.py "Lender name" out.csv
"""
import csv, os, sys, time
from datetime import date, datetime, timedelta

import requests
import yaml
from bs4 import BeautifulSoup

import scraper

CDX = "https://web.archive.org/cdx/search/cdx"
UA = scraper.USER_AGENT
# Where to start: BACKFILL_FROM (YYYY-MM-DD) if set, otherwise about a year back
START = date.fromisoformat(os.environ["BACKFILL_FROM"]) if os.environ.get("BACKFILL_FROM") else date.today() - timedelta(days=372)
END = date.fromisoformat(os.environ["BACKFILL_TO"]) if os.environ.get("BACKFILL_TO") else date(2026, 10, 13)  # the site's own daily history starts on 2026-10-14


def get(url, **kw):
    for attempt in range(4):
        try:
            r = requests.get(url, headers={"User-Agent": UA}, timeout=60, **kw)
            if r.status_code == 429:
                time.sleep(30)
                continue
            r.raise_for_status()
            return r
        except Exception:
            if attempt == 3:
                raise
            time.sleep(5 * (attempt + 1))


def weekly_snapshots(url):
    """One archived copy per week (the first that week), oldest first."""
    rows = get(CDX, params={"url": url, "from": START.strftime("%Y%m%d"), "to": END.strftime("%Y%m%d"), "output": "json",
                            "filter": "statuscode:200", "collapse": "timestamp:8", "fl": "timestamp,original"}).json()
    picked = {}
    for ts, original in rows[1:] if rows else []:
        week = datetime.strptime(ts[:8], "%Y%m%d").isocalendar()[:2]
        picked.setdefault(week, (ts, original))
    return [picked[k] for k in sorted(picked)]


LAYOUTS = yaml.safe_load(open("backfill/layouts.yaml")) if os.path.exists("backfill/layouts.yaml") else {}


def items_for(lender, day):
    """The settings for an archived copy from `day`: an older layout from backfill/layouts.yaml if one covers it."""
    for era in LAYOUTS.get(lender["name"]) or []:
        if day <= str(era["until"]):
            return [i for i in era["rates"] if i.get("enabled", True)]
    return scraper.active(lender)


def read_one(soup, item):
    if "pattern" not in item and "requires" not in item:
        return scraper.extract(soup, item)
    import re
    if "requires" in item:
        tags, text = scraper._tags(soup, item.get("after"), item.get("before"))
        if not any(scraper.norm(item["requires"]) in text[id(t)] for t in tags):
            raise ValueError(f"section doesn't mention {item['requires']!r}")
    # Check each place the label appears, in page order, and use the first whose text matches the pattern
    # (pages often repeat a label in hidden or template blocks before the real table row).
    want = scraper.norm(item["label"])
    tags, text = scraper._tags(soup, item.get("after"), item.get("before"))
    found = scraper._smallest(tags, text, want)
    shown = ""
    for el in found[:10]:
        for _ in range(6):  # climb from the label to the row that also holds the figures
            if el is None or el.name == "[document]":
                break
            shown = text[id(el)].split(want, 1)[-1].strip()
            if scraper.RATE_RE.search(shown):
                break
            el = el.parent
        m = re.search(item["pattern"], shown[:160], re.I)
        if m:
            return scraper.check_range(float(m.group(1)), scraper.is_deposit(item.get("product", ""))), shown[:100]
    raise ValueError(f"text after the label doesn't match the expected layout: {shown[:60]!r}")


def read(soup, items):
    found, errors = {}, {}
    for item in items:
        try:
            found[item["product"]] = read_one(soup, item)
        except Exception as e:
            errors[item["product"]] = str(e)[:120]
    return found, errors


MAX_DATA_DAYS = 14  # a replayed page's rate data must come from an archived copy within this many days of the page


def replay(ts, original):
    """Open the archived page in a browser so its scripts run, and report how far (in days) the rate data it
    loaded was saved from the page itself. The archive fills each request with the nearest copy it has, which can
    be months away, so a replay whose data is far off is not dated reliably."""
    import re
    from playwright.sync_api import sync_playwright
    seen = []
    def on_response(resp):
        req = resp.request
        m = re.search(r"/web/(\d{14})[a-z_]*/", resp.url)
        if not m or req.resource_type not in ("xhr", "fetch", "script"):
            return
        target = resp.url.split(m.group(0), 1)[-1].lower()
        if req.resource_type == "script" and not re.search(r"rate|taux|mortgage|hypoth", target):
            return  # ordinary site scripts (frameworks, analytics) don't carry rates
        seen.append(abs((datetime.strptime(m.group(1)[:8], "%Y%m%d") - datetime.strptime(ts[:8], "%Y%m%d")).days))
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        page = b.new_page(user_agent=UA)
        page.on("response", on_response)
        page.goto(f"https://web.archive.org/web/{ts}if_/{original}", wait_until="domcontentloaded", timeout=60000)
        try:
            page.wait_for_function(r"/\d\.\d{2,3}\s*%/.test(document.body.innerText)", timeout=30000)
            last, steady = None, 0
            for _ in range(20):
                shown = page.inner_text("body")
                steady = steady + 1 if shown == last else 0
                if steady >= 3:
                    break
                last = shown
                page.wait_for_timeout(1000)
        except Exception:
            pass
        html = page.content()
        b.close()
    return html, max(seen) if seen else 0


def main(name, out):
    lender = next(l for l in yaml.safe_load(open("institutions.yaml")) if l["name"] == name)
    items = scraper.active(lender)
    snaps = weekly_snapshots(lender["url"])
    print(f"{name}: {len(snaps)} weekly copies between {START} and {END}")
    rows, use_browser = [], lender.get("mode") in ("browser", "manual")
    for ts, original in snaps:
        day = f"{ts[:4]}-{ts[4:6]}-{ts[6:8]}"
        items = items_for(lender, day)  # an older page layout, if backfill/layouts.yaml has one for this date
        found, errors = {}, {i["product"]: "not read" for i in items}
        try:  # the page exactly as archived, without the archive's toolbar or link rewriting
            found, errors = read(BeautifulSoup(get(f"https://web.archive.org/web/{ts}id_/{original}").text, "html.parser"), items)
        except Exception as e:
            errors = {i["product"]: f"fetch: {str(e)[:100]}" for i in items}
        via = "page"
        missing = [i for i in items if i["product"] not in found]
        if missing and (use_browser or not found):  # rates filled in by JavaScript: replay the archived page in a browser
            try:
                html, offset = replay(ts, original)
                if offset > MAX_DATA_DAYS:
                    raise ValueError(f"the replayed rates came from a copy {offset} days away")
                more, errors = read(BeautifulSoup(html, "html.parser"), missing)
                if more:
                    found.update(more)
                    via = f"browser (data within {offset} days)"
            except Exception as e:
                errors = {i["product"]: f"browser: {str(e)[:100]}" for i in missing}
        for item in items:
            p = item["product"]
            if p in found:
                rate, shown = found[p]
                rows.append([name, p, day, ts, rate, via, shown[:100], ""])
            else:
                rows.append([name, p, day, ts, "", "", "", errors.get(p, "not read")])
        print(f"  {day}: " + ", ".join(f"{p} {found[p][0]}%" if p in found else f"{p} -" for p in (i["product"] for i in items)))
        time.sleep(2)  # be gentle with the archive
    with open(out, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["lender", "product", "date", "archived_at", "rate", "via", "text_read", "error"])
        w.writerows(rows)


def survey(name, out, years=10):
    """How far back can this lender's history go? For each of the last `years` years: how many days the archive
    saved a copy of the rate page, and whether two sample copies (about January and July) can be read with
    today's institutions.yaml settings. Writes one CSV row per sample; nothing is merged anywhere."""
    lender = next(l for l in yaml.safe_load(open("institutions.yaml")) if l["name"] == name)
    items = scraper.active(lender)
    first = date.today().year - years + 1
    rows = get(CDX, params={"url": lender["url"], "from": f"{first}0101", "to": END.strftime("%Y%m%d"), "output": "json",
                            "filter": "statuscode:200", "collapse": "timestamp:8", "fl": "timestamp,original"}).json()
    days = rows[1:] if rows else []
    by_year = {}
    for ts, original in days:
        by_year.setdefault(int(ts[:4]), []).append((ts, original))
    out_rows = []
    for year in range(first, date.today().year + 1):
        copies = by_year.get(year, [])
        samples = []
        for month in ("01", "07"):  # the first copy on or after Jan 1 and Jul 1 of that year
            pick_ = next((c for c in copies if c[0][4:6] >= month), None)
            if pick_ and pick_ not in samples:
                samples.append(pick_)
        if not samples:
            out_rows.append([name, year, len(copies), "", "", "", 0, len(items), ""] + [""] * len(items))
            continue
        for ts, original in samples:
            day = f"{ts[:4]}-{ts[4:6]}-{ts[6:8]}"
            found, errors, via = {}, {}, "page"
            try:
                found, errors = read(BeautifulSoup(get(f"https://web.archive.org/web/{ts}id_/{original}").text, "html.parser"), items)
            except Exception as e:
                errors = {i["product"]: f"fetch: {str(e)[:80]}" for i in items}
            missing = [i for i in items if i["product"] not in found]
            if missing:
                try:
                    more, errors2 = read(BeautifulSoup(scraper.get_html(f"https://web.archive.org/web/{ts}if_/{original}", browser=True), "html.parser"), missing)
                    if more:
                        found.update(more); via = "browser"
                    errors.update(errors2)
                except Exception as e:
                    pass
            cells = [f"{i['product']}: " + (f"{found[i['product']][0]} | {found[i['product']][1][:50]}" if i["product"] in found else f"ERROR {errors.get(i['product'], '')[:70]}") for i in items]
            out_rows.append([name, year, len(copies), day, ts, via, len(found), len(items), original] + cells)
            print(f"  {day}: {len(found)}/{len(items)} read")
            time.sleep(2)
    with open(out, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["lender", "year", "days_with_copies", "sample_date", "archived_at", "via", "rates_read", "rates_wanted", "archived_url",
                    "reading_1", "reading_2", "reading_3"])
        w.writerows(out_rows)
    print(f"{name}: " + ", ".join(f"{y}: {len(by_year.get(y, []))} days" for y in range(first, date.today().year + 1)))


if __name__ == "__main__":
    if sys.argv[1] == "--survey":
        survey(sys.argv[2], sys.argv[3], int(sys.argv[4]) if len(sys.argv) > 4 else 10)
    else:
        main(sys.argv[1], sys.argv[2])
