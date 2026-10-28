"""One-off: rate history (mortgage, GIC and savings) from archived copies of each lender's own rate pages.

Same method as the mortgage backfill (backfill.py): the Internet Archive's saved copies of a lender's page,
one per week, read with exactly the rules the hourly scraper uses (institutions.yaml). Results go to a CSV
report for review; nothing is merged here. Hand-entered (manual) items and promotional savings rates are
left out: there are no reading rules for the first, and promotions come and go.

Usage:  python backfill_deposits.py "Lender name" out.csv
"""
import csv, sys, time
import yaml
from bs4 import BeautifulSoup

import backfill as B
import scraper


def main(name, out):
    lender = next(l for l in yaml.safe_load(open("institutions.yaml")) if l["name"] == name)
    pages = {}
    for item in scraper.active(lender):
        mode = item.get("mode", lender.get("mode", "auto"))
        if item["product"] == "Savings promo" or "label" not in item:
            continue  # promotions come and go; items without reading rules can't be read from a copy
        if mode == "manual":
            mode = "auto"  # hand-read today because the live site blocks automated visits; the archive's copies can be read normally
        pages.setdefault(scraper.item_url(lender, item), (mode, []))[1].append(item)
    rows = []
    for url, (mode, items) in pages.items():
        snaps = B.weekly_snapshots(url)
        print(f"{name}: {len(snaps)} weekly copies of {url}")
        for ts, original in snaps:
            day = f"{ts[:4]}-{ts[4:6]}-{ts[6:8]}"
            found, errors = {}, {}
            try:
                found, errors = B.read(BeautifulSoup(B.get(f"https://web.archive.org/web/{ts}id_/{original}").text, "html.parser"), items)
            except Exception as e:
                errors = {i["product"]: f"fetch: {str(e)[:100]}" for i in items}
            via = "page"
            missing = [i for i in items if i["product"] not in found]
            if missing and (mode == "browser" or not found):  # rates filled in by JavaScript: replay the copy in a browser
                try:
                    html, offset = B.replay(ts, original)
                    if offset > B.MAX_DATA_DAYS:
                        raise ValueError(f"the replayed rates came from a copy {offset} days away")
                    more, errors = B.read(BeautifulSoup(html, "html.parser"), missing)
                    if more:
                        found.update(more)
                        via = f"browser (data within {offset} days)"
                except Exception as e:
                    errors = {i["product"]: f"browser: {str(e)[:100]}" for i in missing}
            for item in items:
                p = item["product"]
                if p in found:
                    rate, shown = found[p]
                    rows.append([name, p, day, ts, rate, via, shown[:100], "", url])
                else:
                    rows.append([name, p, day, ts, "", "", "", errors.get(p, "not read"), url])
            print(f"  {day}: " + ", ".join(f"{p} {found[p][0]}%" if p in found else f"{p} -" for p in (i["product"] for i in items)))
            time.sleep(2)  # be gentle with the archive
    with open(out, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["lender", "product", "date", "archived_at", "rate", "via", "text_read", "error", "page"])
        w.writerows(rows)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
