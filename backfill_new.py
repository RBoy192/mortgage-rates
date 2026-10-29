"""One-off (temporary): read archived copies of one lender's own rate pages or data files from the Internet Archive
and write what they showed to a CSV report (lender, product, date, rate, text_read) for review. Changes nothing else.

Usage:  python backfill_new.py "Lender name" out.csv      (BACKFILL_FROM / BACKFILL_TO: YYYY-MM-DD)
"""
import csv, json, os, sys, time, urllib.parse
import requests, yaml
from bs4 import BeautifulSoup
import scraper

UA = {"User-Agent": scraper.USER_AGENT}
SIMPLII = "https://online.simplii.com/ebm-pno/api/v2/json/rates/ALL"
GIC = lambda t: {"product": f"{t}-year GIC", "json": {"rateProductCategory": "GIC", "registered": False, "rateType": "apy_rate", "term.value": t},
                 "field": "interestRates[tierTo=99999.99].rateValue", "effective": "interestRates[tierTo=99999.99].effectiveDate"}
EXTRA = {  # Simplii's GIC and savings rates, from the data file its own rates pages read
    "Simplii Financial": [dict(GIC(t), url=SIMPLII) for t in range(1, 6)] + [
        {"product": "Savings", "url": SIMPLII, "json": {"rateProductCategory": "SAVINGS", "investment": True, "registered": False, "taxFree": False},
         "field": "interestRates[tierFrom=0.00].rateValue", "effective": "interestRates[tierFrom=0.00].effectiveDate"}]}


def get(url, tries=4):
    for i in range(tries):
        try:
            r = requests.get(url, headers=UA, timeout=60)
            if r.status_code == 200:
                return r
        except requests.RequestException:
            pass
        time.sleep(5 * (i + 1))
    return None


def days(url, since, until):
    q = "https://web.archive.org/cdx/search/cdx?" + urllib.parse.urlencode({"url": url, "output": "json", "filter": "statuscode:200",
        "collapse": "timestamp:8", "fl": "timestamp", "from": since.replace("-", ""), "to": until.replace("-", "")})
    r = get(q)
    return [x[0] for x in (r.json()[1:] if r else [])]


def main(name, out):
    since, until = os.environ.get("BACKFILL_FROM", "2023-10-28"), os.environ.get("BACKFILL_TO", "2026-10-28")
    lender = next((l for l in yaml.safe_load(open("institutions.yaml")) if l["name"] == name), {"name": name, "url": "", "rates": []})
    items = EXTRA.get(name) or [i for i in lender.get("rates") or [] if i.get("enabled", True)]
    pages = {}
    for i in items:
        pages.setdefault(i.get("url") or lender["url"], []).append(i)
    w = csv.writer(open(out, "w", newline=""))
    w.writerow(["lender", "product", "date", "rate", "text_read", "copy"])
    for url, todo in pages.items():
        stamps = days(url, since, until)
        print(f"::notice title={name}::{len(stamps)} archived days of {url}")
        for ts in stamps:
            r = get(f"https://web.archive.org/web/{ts}id_/{url}")
            time.sleep(1)
            date = f"{ts[:4]}-{ts[4:6]}-{ts[6:8]}"
            if not r:
                continue
            data = soup = None
            try:
                if any("json" in i for i in todo):
                    data = json.loads(r.text)
                else:
                    soup = BeautifulSoup(r.text, "html.parser")
            except Exception:
                continue
            for i in todo:
                try:
                    rate, text = scraper.json_rate(data, i) if data is not None else scraper.extract(soup, i)
                except Exception:
                    continue
                w.writerow([name, i["product"], date, rate, f"{rate:.2f}% " + text, ts])
                if data is not None and i.get("effective"):  # the data file also says since when the rate has applied
                    eff = [scraper._path(o, i["effective"]) for o in (data if isinstance(data, list) else [])
                           if isinstance(o, dict) and all(scraper._path(o, k) == v for k, v in i["json"].items())]
                    eff = sorted({str(e)[:10] for e in eff if e})
                    if len(eff) == 1 and since <= eff[0] < date:
                        w.writerow([name, i["product"], eff[0], rate, f"{rate:.2f}% effective {eff[0]} (per the copy of {date})", ts])


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
