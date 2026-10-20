"""Rebuild rate history from archived copies of lenders' own rate DATA files (the files their rate pages load).

Some lenders' rate pages fill in their rates from a separate file. The Internet Archive saved those files on their
own, often more often than the page, and each copy carries the exact date it was saved, so readings are dated
correctly. Each lender below names its file and exactly which entry to read; nothing is estimated, and an entry
that's missing or unreadable is skipped. Output is a CSV report in the same format as backfill.py (for review).

Usage:  python backfill_data.py out.csv [YYYY-MM-DD start]
"""
import csv, json, sys, time
import backfill

def tangerine(d):
    out = {}
    for r in d.get("rates", []):
        if r.get("group") != "mortgage":
            continue
        if r.get("profile_product_type") == "Mortgage" and r.get("term") in (3, 5):
            out[f"{r['term']}-year fixed"] = (float(r["interest_rate"]), f"Tangerine Mortgage {r['term']}-year: {float(r['interest_rate']):.2f}%")
        if r.get("profile_product_type") == "VarMortgage" and r.get("term") == 5:
            out["5-year variable"] = (float(r["interest_rate"]), f"Tangerine Mortgage 5-year variable: {float(r['interest_rate']):.2f}%")
    return out

def td(d):  # each entry: [posted rate, discount, special rate, APR, ...]; the site shows the special rate
    out = {}
    for code, product in (("MTGF036C", "3-year fixed"), ("MTGF060C", "5-year fixed"), ("MTGV060C", "5-year variable")):
        row = (d.get(code) or {}).get("nonHighRatio")
        if row and len(row) > 2:
            out[product] = (float(row[2]), f"{code} special rate: {float(row[2]):.2f}% (posted {row[0]}%)")
    return out

def scotiabank(d):  # posted rates for conventional residential mortgages (the site labels Scotiabank's fixed rates "Posted rate")
    out = {}
    for prod in d.get("data", []):
        if prod.get("PRODUCT") == "CONVENTIONAL RESIDENTIAL, ETC":
            for t in prod.get("TERMS", []):
                if t.get("TERM_UNIT") == "Y" and t.get("TERM_VALUE") in ("3", "5"):
                    out[f"{t['TERM_VALUE']}-year fixed"] = (float(t["RATE"]), f"Conventional residential {t['TERM_VALUE']}-year posted: {float(t['RATE']):.2f}%")
    return out

SOURCES = [
    ("Tangerine", "https://www.tangerine.ca/content/dam/tangerine-shared/product-rates/currentRates.json", tangerine),
    ("TD Canada Trust", "https://psservice.td.com/ca/en/carate/getRates", td),
    ("Scotiabank", "https://dmtsms.scotiabank.com/api/rates/daily/nonspecialmortgage", scotiabank),
]

def main(out, start="2017-01-01"):
    rows = []
    try:
        read_all(rows, start)
    finally:  # save whatever was read, even if something failed part-way
        with open(out, "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["lender", "product", "date", "archived_at", "rate", "via", "text_read", "error"])
            w.writerows(rows)


def read_all(rows, start):
    for name, url, read in SOURCES:
        try:
            caps = backfill.get(backfill.CDX, params={"url": url, "from": start.replace("-", ""), "to": backfill.END.strftime("%Y%m%d"),
                                                      "output": "json", "filter": "statuscode:200", "collapse": "timestamp:8", "fl": "timestamp,original"}).json()[1:]
        except Exception as e:
            print(f"{name}: couldn't list the archived copies ({str(e)[:80]})")
            continue
        print(f"{name}: {len(caps)} days with a saved copy of the data file", flush=True)
        for ts, original in caps:
            day = f"{ts[:4]}-{ts[4:6]}-{ts[6:8]}"
            try:
                found = read(json.loads(backfill.get(f"https://web.archive.org/web/{ts}id_/{original}").text))
            except Exception as e:
                found, err = {}, str(e)[:100]
            else:
                err = "entry not in file"
            for product in ("3-year fixed", "5-year fixed", "5-year variable"):
                if product in found:
                    rate, shown = found[product]
                    try:
                        backfill.scraper.check_range(rate)
                    except ValueError as e:
                        rows.append([name, product, day, ts, "", "", "", str(e)]); continue
                    rows.append([name, product, day, ts, rate, "data file", shown, ""])
                elif name != "Scotiabank" or product != "5-year variable":
                    rows.append([name, product, day, ts, "", "", "", err])
            time.sleep(1.5)

if __name__ == "__main__":
    main(sys.argv[1], *(sys.argv[2:3]))
