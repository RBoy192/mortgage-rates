"""One-off: merge a reviewed GIC and savings backfill report into history.json.

Keeps only readings whose text shows the same figure that was recorded, drops isolated spikes (a reading that
differs from both neighbours by more than SPIKE points while the neighbours agree), and only adds dates before
the site's own saved history for that lender and product.

Usage:  python merge_deposits.py backfill/deposits-report-<run>.csv [--dry]
"""
import collections, csv, json, re, sys

import scraper

SPIKE = 0.75


def ok(r):
    if not r["rate"]:
        return False
    t = r["text_read"].replace(",", ".")
    v = float(r["rate"])
    if "${" in t or "{{" in t:
        return False  # an unfilled template
    if scraper.is_deposit(r["product"]) and any(float(x) >= 5 for x in re.findall(r"(\d{1,2}\.\d{1,4})\s*%", t)):
        return False  # a 5%+ figure beside it means the label matched a mortgage or loan row in an older layout
    if re.fullmatch(r"\d{1,2}\.\d{2,4}", t.strip()):
        return abs(float(t) - v) < 1e-9
    m = None
    for d in (2, 3, 4):
        m = re.search(re.escape(f"{v:.{d}f}") + r"\s*%", t)
        if m:
            break
    if not m:
        return False
    prefix = t[:m.start()]
    for i, ch in enumerate(prefix):  # an empty "%" before the reading means the real figure was missing
        if ch == "%":
            before = prefix[:i].rstrip()
            if not before or not before[-1].isdigit():
                return False
    return True


def despike(pts):
    out = []
    for k, p in enumerate(pts):
        if 0 < k < len(pts) - 1:
            a, b = pts[k - 1][1], pts[k + 1][1]
            if abs(a - b) <= 0.25 and abs(p[1] - a) > SPIKE and abs(p[1] - b) > SPIKE:
                continue
        out.append(p)
    return out


def main(path, dry=False):
    rows = list(csv.DictReader(open(path)))
    good = [r for r in rows if ok(r)]
    rejected = collections.Counter((r["lender"], r["product"]) for r in rows if r["rate"] and not ok(r))
    print(f"readings {sum(1 for r in rows if r['rate'])}, accepted {len(good)}, rejected {sum(rejected.values())}")
    h = json.load(open("history.json"))
    S = h["series"]
    by = collections.defaultdict(dict)
    for r in good:
        by[f'{r["lender"]}|{r["product"]}'][r["date"]] = float(r["rate"])
    added, dropped, first_site = collections.Counter(), collections.Counter(), {}
    for key, days in by.items():
        site = S.get(key, [])
        start = site[0][0] if site else "9999"
        first_site[key] = start
        pts = despike(sorted([d, v] for d, v in days.items() if d < start))
        dropped[key.split("|")[0]] += sum(1 for d in days if d < start) - len(pts)
        pts = scraper.changes_only(pts) if pts else []
        if pts:
            S[key] = pts + site
            added[key.split("|")[0]] += len(pts)
    if added and any(scraper.is_deposit(k.split("|")[1]) for k in by):
        h["deposit_archive_note"] = True
        h["deposit_history_from"] = h.get("deposit_history_from") or min(v for k, v in first_site.items() if k in by and v != "9999")
    for lender in sorted(set(k.split("|")[0] for k in by)):
        keys = sorted(k for k in by if k.startswith(lender + "|"))
        span = [S[k][0][0] for k in keys if k in S]
        print(f"  {lender}: {added[lender]} points kept, {dropped[lender]} spikes dropped, from {min(span) if span else '-'}")
    print("rejected:", dict(rejected))
    if not dry:
        json.dump(h, open("history.json", "w"), separators=(",", ":"))


if __name__ == "__main__":
    main(sys.argv[1], "--dry" in sys.argv)
