"""One-off: rebuild up to 12 months of a lender's rate history from archived copies of its own rate page.

Lenders don't publish their past rates. The Internet Archive (Wayback Machine) has saved copies of their rate
pages over time; this reads one copy per week with exactly the same rules the hourly scraper uses
(institutions.yaml), and writes what it found to a CSV report for review. It never touches history.json:
the reviewed results are merged separately. Nothing is estimated: a week whose copy can't be read is left out.

Usage:  python backfill.py "Lender name" out.csv
"""
import csv, sys, time
from datetime import date, datetime, timedelta

import requests
import yaml
from bs4 import BeautifulSoup

import scraper

CDX = "https://web.archive.org/cdx/search/cdx"
UA = scraper.USER_AGENT
START = date.today() - timedelta(days=372)
END = date(2026, 10, 13)  # the site's own daily history starts on 2026-10-14


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


def read(soup, items):
    found, errors = {}, {}
    for item in items:
        try:
            found[item["product"]] = scraper.extract(soup, item)
        except Exception as e:
            errors[item["product"]] = str(e)[:120]
    return found, errors


def main(name, out):
    lender = next(l for l in yaml.safe_load(open("institutions.yaml")) if l["name"] == name)
    items = scraper.active(lender)
    snaps = weekly_snapshots(lender["url"])
    print(f"{name}: {len(snaps)} weekly copies between {START} and {END}")
    rows, use_browser = [], lender.get("mode") in ("browser", "manual")
    for ts, original in snaps:
        day = f"{ts[:4]}-{ts[4:6]}-{ts[6:8]}"
        found, errors = {}, {i["product"]: "not read" for i in items}
        try:  # the page exactly as archived, without the archive's toolbar or link rewriting
            found, errors = read(BeautifulSoup(get(f"https://web.archive.org/web/{ts}id_/{original}").text, "html.parser"), items)
        except Exception as e:
            errors = {i["product"]: f"fetch: {str(e)[:100]}" for i in items}
        via = "page"
        missing = [i for i in items if i["product"] not in found]
        if missing and (use_browser or not found):  # rates filled in by JavaScript: replay the archived page in a browser
            try:
                more, errors = read(BeautifulSoup(scraper.get_html(f"https://web.archive.org/web/{ts}if_/{original}", browser=True), "html.parser"), missing)
                if more:
                    found.update(more)
                    via = "browser"
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


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
