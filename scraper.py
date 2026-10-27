#!/usr/bin/env python3
"""Collect mortgage rates from the lenders in institutions.yaml and write rates.json and history.json.

  python scraper.py                           run the scrape (what the hourly job does)
  python scraper.py --inspect URL             show the rates on a page with the text just before each one
  python scraper.py --inspect URL --browser   same, for pages that load their rates with JavaScript
  python scraper.py --demo                    write sample data so the site has something to show

How each rate is collected (saved as "method" in rates.json):
  automatic   read from the lender's page during this run
  manual      typed into manual_rates.yaml by you; used only when automatic collection fails or a lender is set to mode: manual
A rate that couldn't be refreshed is never shown as current: it keeps its last value with stale: true, and the site says so.
"""
import json, re, subprocess, sys
from datetime import datetime, timezone, date
from pathlib import Path
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

USER_AGENT = "MortgageRatesBot/1.0 (+https://whatstherate.ca)"
MIN_RATE, MAX_RATE = 0.5, 15.0  # anything outside this range is treated as a scraping error
DEP_MIN, DEP_MAX = 0.01, 10.0  # GIC and savings rates can be close to zero
DEPOSIT_RE = re.compile(r"\bGIC\b|savings", re.I)  # products that are deposits rather than mortgages


def is_deposit(product):
    return bool(DEPOSIT_RE.search(product))
RATE_RE = re.compile(r"(?<![\d.,])(\d{1,2}(?:[.,]\d{1,4})?)\s*%")  # also "4,89 %" (decimal comma, as some pages write it)
PLAIN_RE = re.compile(r"(?<![\d.])(\d{1,2}\.\d{2,3})(?![\d.])")  # "5.28" in tables that leave off the % sign (only with  plain: true)
PRIME_PLUS_RE = re.compile(r"\bP(?:rime)?\s?\d?\s*([+\-\u2212\u2013])\s*(\d{1,2}(?:\.\d{1,3})?)\s*%", re.I)  # "P + 0.34%", "Prime - 0.31%"
SKIP_TAGS = ("script", "style", "noscript", "template")
OUT, HISTORY, MANUAL = Path("rates.json"), Path("history.json"), Path("manual_rates.yaml")
MANUAL_MAX_DAYS = 7  # a hand-entered rate older than this is shown as "not refreshed"
POLICY_URL = "https://www.bankofcanada.ca/core-functions/monetary-policy/key-interest-rate/"  # the page the site links to
VALET = "https://www.bankofcanada.ca/valet/observations/{}/json?recent=1"  # the Bank's official data feed
PRIME_URL = "https://bankofcanada.ca/rates/banking-and-financial-statistics/posted-interest-rates-offered-by-chartered-banks"


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def today():
    """Today's date in Toronto, so a day's history matches the Canadian calendar."""
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("America/Toronto")).date().isoformat()
    except Exception:
        return datetime.now(timezone.utc).date().isoformat()


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
            try:  # wait until real rates (like 4.99%) show up on the page...
                page.wait_for_function(r"/\d\.\d{2,3}\s*%/.test(document.body.innerText)", timeout=30000)
                last, steady = None, 0  # ...then until the page's text stops changing, since some rates load late
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
            return html
    import requests
    r = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=30)
    r.raise_for_status()
    return r.text


def check_range(rate, deposit=False):
    lo, hi = (DEP_MIN, DEP_MAX) if deposit else (MIN_RATE, MAX_RATE)
    if not lo <= rate <= hi:
        raise ValueError(f"rate {rate} is outside the plausible range")
    return rate


def pick(text, nth=1, plain=False, deposit=False):
    """Return the nth percentage in text, or None if there are fewer than that.
    plain: the page shows rates as bare numbers like 5.28 (no % sign)."""
    found = RATE_RE.findall(text) or (PLAIN_RE.findall(text) if plain else [])
    if len(found) < nth:
        return None
    return check_range(float(found[nth - 1].replace(",", ".")), deposit)


def _tags(soup, after=None, before=None):
    tags = [t for t in soup.find_all(True) if t.name not in SKIP_TAGS and not t.find_parent(SKIP_TAGS)]
    text = {id(t): norm(t.get_text(" ", strip=True)) for t in tags}
    for a in ([after] if isinstance(after, str) else after or []):  # a list: each one below the one before
        marker = _smallest(tags, text, norm(a))
        if not marker:
            raise ValueError(f"section {a!r} not found")
        tags = tags[tags.index(marker[0]) + 1:]
    if before:  # stop at the first place (after `after`, if given) that mentions this text
        marker = _smallest(tags, text, norm(before))
        if not marker:
            raise ValueError(f"section {before!r} not found")
        tags = tags[:tags.index(marker[0])]
    return tags, text


def _smallest(pool, text, needle):  # the innermost elements whose text contains `needle`
    ids = {id(t) for t in pool if needle in text[id(t)]}
    return [t for t in pool if id(t) in ids and not any(id(c) in ids for c in t.find_all(True, recursive=False))]


def rate_by_label(soup, label, nth=1, after=None, occurrence=1, before=None, plain=False, deposit=False, whole=False):
    """Find the table row or card whose text includes `label` and return (the nth % figure after it, the text it read).
    `after`: only look below the first place on the page that mentions this text.
    `occurrence`: use the 2nd, 3rd... time the label appears (for pages with repeated tables)."""
    want = norm(label)
    tags, text = _tags(soup, after, before)
    found = _smallest(tags, text, want)
    found.sort(key=lambda t: text[id(t)] != want)  # whole-cell matches first; sort is stable, so page order is kept
    rates = []
    for el in found:
        for _ in range(6):  # climb from the label up to the row or card that also holds the rates
            if el is None or el.name == "[document]":
                break
            after_text = text[id(el)] if whole else text[id(el)].split(want, 1)[-1]  # whole: the rate may come before the label
            if RATE_RE.search(after_text) or (plain and PLAIN_RE.search(after_text)):
                rate = pick(after_text, nth, plain, deposit)  # None if this row has fewer figures than nth: don't borrow from other rows
                if rate is not None:
                    rates.append((rate, after_text.strip()[:100]))
                break
            el = el.parent
        if len(rates) >= occurrence:
            return rates[occurrence - 1]
    raise ValueError(f"no rate found next to the label {label!r}")


def cell_by_column(soup, label, column, after=None, occurrence=1):
    """In a table, find the row whose first cell includes `label` and return the text of its cell under the
    column heading that includes `column` (for tables that list terms across the top). Works for HTML tables and
    for tables built from elements marked role="row" / role="cell"."""
    want, col = norm(label), norm(column)
    tags, text = _tags(soup, after)
    is_row = lambda t: t.name == "tr" or t.get("role") == "row"
    cells_of = lambda r: (r.find_all(["td", "th"], recursive=False) or r.find_all(["td", "th"])) if r.name == "tr" \
        else r.find_all(attrs={"role": ["cell", "gridcell", "columnheader", "rowheader"]})
    rows = [t for t in tags if is_row(t) and cells_of(t) and want in norm(cells_of(t)[0].get_text(" "))]
    if len(rows) < occurrence:
        raise ValueError(f"no table row labelled {label!r}")
    row = rows[occurrence - 1]
    if row.name == "tr":
        table = row.find_parent("table")
        head = next((tr for tr in table.find_all("tr") if tr.find("th")), None) or table.find("tr")
    else:
        table = row.find_parent(attrs={"role": ["table", "grid"]})
        if table is None:
            raise ValueError(f"row {label!r} is not inside a table")
        head = next((r for r in table.find_all(attrs={"role": "row"}) if r.find(attrs={"role": "columnheader"})), None) \
            or table.find(attrs={"role": "row"})
    heads = [norm(c.get_text(" ")) for c in cells_of(head)]
    idx = next((i for i, h in enumerate(heads) if col in h), None)
    if idx is None:
        raise ValueError(f"no column headed {column!r}")
    cells = cells_of(row)
    if idx >= len(cells):
        raise ValueError(f"row {label!r} has no cell under {column!r}")
    return norm(cells[idx].get_text(" ", strip=True))


def extract(soup, item):
    """Return (rate, the text it was read from)."""
    dep = is_deposit(item.get("product", ""))
    if "column" in item:
        shown = cell_by_column(soup, item["label"], item["column"], item.get("after"), item.get("occurrence", 1))
    elif "label" in item and "prime_label" not in item:
        return rate_by_label(soup, item["label"], item.get("nth", 1), item.get("after"), item.get("occurrence", 1), item.get("before"), item.get("plain", False), dep, item.get("whole", False))
    elif "label" in item:
        shown = rate_by_label(soup, item["label"], 1, item.get("after"), item.get("occurrence", 1), item.get("before"))[1]
    else:
        el = soup.select_one(item["selector"])
        if el is None:
            raise ValueError(f"selector not found: {item['selector']}")
        shown = el.get_text(" ", strip=True)
    if "prime_label" in item:  # the page shows "P + 0.34%": add that to the lender's own prime rate
        m = PRIME_PLUS_RE.search(shown)
        if not m:
            raise ValueError(f"no 'P + x%' figure found (read: {shown[:60]!r})")
        prime, _ = rate_by_label(soup, item["prime_label"], plain=item.get("plain", False))
        spread = float(m.group(2)) * (1 if m.group(1) == "+" else -1)  # minus may be -, − or –
        return check_range(round(prime + spread, 3)), f"{shown[:60]} with prime {prime}%"
    rate = pick(shown, item.get("nth", 1), item.get("plain", False), dep)
    if rate is None:
        raise ValueError(f"no rate with a % sign found (read: {shown[:60]!r})")
    return rate, shown[:100]


def active(lender):
    return [i for i in lender.get("rates") or [] if i.get("enabled", True)]


def scrape_lender(lender):
    """Return ({product: (rate, text read)}, {product: error}) for one lender."""
    from bs4 import BeautifulSoup
    results, errors = {}, {}
    # rates can come from more than one page (GIC and savings rates usually have their own): one visit per page
    pages = {}
    for item in active(lender):
        key = (item_url(lender, item), item.get("mode", lender.get("mode", "auto")))
        pages.setdefault(key, []).append(item)
    for (url, mode), items in pages.items():
        r, e = scrape_page(url, mode, items, BeautifulSoup)
        results.update(r); errors.update(e)
    return results, errors


def item_url(lender, item):
    return item.get("url") or lender["url"]


def scrape_page(url, mode, todo, BeautifulSoup):
    if mode == "manual":
        return {}, {i["product"]: "set to manual entry" for i in todo}
    if not robots_ok(url):
        return {}, {i["product"]: "robots.txt does not allow fetching this page" for i in todo}
    results, errors = {}, {}
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


def valet_rate(series, page):
    """Read the latest value of a Bank of Canada series from the Bank's official Valet data API."""
    import requests
    api = VALET.format(series)
    if not robots_ok(api):
        raise RuntimeError("robots.txt does not allow fetching the Valet API")
    r = requests.get(api, headers={"User-Agent": USER_AGENT}, timeout=30)
    r.raise_for_status()
    try:
        latest = max(r.json()["observations"], key=lambda o: o["d"])
        rate = float(latest[series]["v"])
    except (KeyError, TypeError, ValueError):
        raise ValueError("unexpected response from the Bank of Canada Valet API")
    if not 0 <= rate <= 25:
        raise ValueError(f"rate {rate} is outside the plausible range")
    return {"rate": rate, "as_of": latest["d"], "source": page, "fetched_at": now(), "stale": False}


def policy_rate():  # target for the overnight rate (the policy interest rate)
    return valet_rate("V39079", POLICY_URL)


def prime_rate():  # the major banks' typical prime rate (a weekly series)
    return valet_rate("V80691311", PRIME_URL)


def load_manual():
    """Rates typed into manual_rates.yaml, keyed by (institution, product)."""
    import yaml
    if not MANUAL.exists():
        return {}
    out = {}
    for m in yaml.safe_load(MANUAL.read_text()) or []:
        try:
            rate = check_range(float(m["rate"]), is_deposit(str(m.get("product", ""))))
            checked = date.fromisoformat(str(m["checked"]))
        except (KeyError, TypeError, ValueError) as e:
            print(f"WARNING: skipping a manual_rates.yaml entry ({e}): {m}", file=sys.stderr)
            continue
        out[(m["institution"], m["product"])] = {"rate": rate, "checked": checked, "source": m.get("source"), "note": m.get("note")}
    return out


def manual_record(name, product, m, url, day=None):
    day = date.fromisoformat(day or today())
    age = (day - m["checked"]).days
    rec = {"institution": name, "product": product, "rate": m["rate"], "source": m["source"] or url,
           "fetched_at": now(), "checked_at": m["checked"].isoformat(), "method": "manual", "stale": age > MANUAL_MAX_DAYS}
    if m.get("note"):
        rec["note"] = m["note"]
    return rec


# Official Bank of Canada series loaded into history.json (ten years back, refreshed every run):
# the policy rate, the major banks' typical prime rate, their typical posted 3- and 5-year fixed rates,
# their typical 1-, 3- and 5-year GIC rates and their typical non-chequable savings deposit rate.
BOC_HISTORY = {"policy_rate": "V39079", "prime_rate": "V80691311", "posted|3-year fixed": "V80691334", "posted|5-year fixed": "V80691335",
               "posted|1-year GIC": "V80691339", "posted|3-year GIC": "V80691340", "posted|5-year GIC": "V80691341",
               "posted|Savings": "V80691338"}
HISTORY_DAYS = 3653  # ten years


def changes_only(points):
    """Keep the first point, the last reading before each change, each point where the value changes, and the
    last point, so a chart line stays flat until the date the rate actually moved."""
    out = []
    for k, (d, v) in enumerate(points):
        if out and v != out[-1][1] and k > 0 and points[k - 1][0] != out[-1][0]:
            out.append(list(points[k - 1]))
        if not out or v != out[-1][1] or k == len(points) - 1:
            out.append([d, v])
    return out


def boc_history(day=None):
    """The last ten years of the BOC_HISTORY series from the Bank of Canada's Valet API, as {key: [[date, value], ...]}."""
    import requests
    from datetime import timedelta
    start = (date.fromisoformat(day or today()) - timedelta(days=HISTORY_DAYS)).isoformat()
    url = "https://www.bankofcanada.ca/valet/observations/{}/json?start_date={}".format(",".join(BOC_HISTORY.values()), start)
    r = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=30)
    r.raise_for_status()
    obs = sorted(r.json()["observations"], key=lambda o: o["d"])
    found = {}
    for key, sid in BOC_HISTORY.items():
        pts = []
        for o in obs:
            try:
                v = float(o[sid]["v"])
            except (KeyError, TypeError, ValueError):
                continue
            if 0 <= v <= 25:
                pts.append([o["d"], v])
        if pts:
            found[key] = changes_only(pts)
    if not found:
        raise ValueError("no observations in the Bank of Canada Valet response")
    return found


def merge_boc_history(history, found):
    """Replace the Bank of Canada series up to their latest official date; keep any later daily points the site saved."""
    series = history.setdefault("series", {})
    if not found:
        return history
    for key, pts in found.items():
        last = pts[-1][0]
        series[key] = pts + [p for p in series.get(key, []) if p[0] > last]
    history["boc_history_from"] = min(p[0][0] for p in found.values())
    return history


def update_history(history, out, day=None):
    """Add today's rates to history.json: one value per lender, product and day (the latest that day).
    Rates that couldn't be refreshed (stale) are left out, so the history only holds rates that were current."""
    day = day or today()
    series = history.setdefault("series", {})

    def put(key, rate):
        pts = series.setdefault(key, [])
        if pts and pts[-1][0] == day:
            pts[-1][1] = rate
        else:
            pts.append([day, rate])

    for r in out.get("rates", []):
        if not r.get("stale"):
            put(f"{r['institution']}|{r['product']}", r["rate"])
    for key in ("policy_rate", "prime_rate"):
        if out.get(key) and not out[key].get("stale"):
            put(key, out[key]["rate"])
    history["updated_at"] = now()
    return history


def run():
    import yaml
    lenders = [x for x in (yaml.safe_load(Path("institutions.yaml").read_text()) or []) if x.get("enabled", True)]
    if not lenders:
        print("No lenders enabled in institutions.yaml; leaving rates.json unchanged.")
        return 0
    old, prev = {}, {}
    if OUT.exists():
        prev = json.loads(OUT.read_text())
        if not prev.get("demo"):
            old = {(r["institution"], r["product"]): r for r in prev.get("rates", [])}
    manual = load_manual()
    rates, errors, warnings = [], [], []
    for lender in lenders:
        name, url = lender["name"], lender["url"]
        try:
            results, errs = scrape_lender(lender)
        except Exception as e:
            results, errs = {}, {i["product"]: e for i in active(lender)}
        for item in active(lender):
            product, publish = item["product"], item.get("publish", True)
            if product in results:
                rate, shown = results[product]
                print(f"{'OK   ' if publish else 'CHECK'} {name} / {product}: {rate}%   (read: {shown})"
                      + ("" if publish else "   [not published]"))
                if publish:
                    stamp = now()
                    rec = {"institution": name, "product": product, "rate": rate, "source": item_url(lender, item),
                           "fetched_at": stamp, "checked_at": stamp, "method": "automatic", "stale": False}
                    if item.get("note"):
                        rec["note"] = item["note"]
                    rates.append(rec)
                continue
            why = f"{name} / {product}: {errs.get(product, 'unknown error')}"
            if publish and (name, product) in manual:
                rec = manual_record(name, product, manual[(name, product)], item_url(lender, item))
                if item.get("note") and "note" not in rec:
                    rec["note"] = item["note"]
                rates.append(rec)
                state = "is more than %d days old, shown as not refreshed" % MANUAL_MAX_DAYS if rec["stale"] else "used"
                print(f"MANUAL {name} / {product}: {rec['rate']}% (checked {rec['checked_at']}) {state}")
                (errors if rec["stale"] else warnings).append(why + (" (manual rate used)" if not rec["stale"] else " (manual rate is out of date)"))
                continue
            errors.append(why)
            if publish and (name, product) in old:  # keep the last good value, flagged as stale
                rates.append({**old[(name, product)], "stale": True})
    extras = {}
    for key, label, fetch in (("policy_rate", "Bank of Canada policy rate", policy_rate), ("prime_rate", "Prime rate", prime_rate)):
        kept = None if prev.get("demo") else prev.get(key)
        try:
            extras[key] = fetch()
            print(f"OK    {label}: {extras[key]['rate']}%   (as of {extras[key]['as_of']})")
        except Exception as e:
            errors.append(f"{label}: {e}")
            if kept:  # keep the last good value, flagged as stale
                extras[key] = {**kept, "stale": True}
    out = {"updated_at": now(), "demo": False, "rates": rates, **extras}
    OUT.write_text(json.dumps(out, indent=2))
    history = json.loads(HISTORY.read_text()) if HISTORY.exists() else {}
    try:
        history = merge_boc_history(history, boc_history())
    except Exception as e:
        warnings.append(f"Bank of Canada rate history: {e}")
    HISTORY.write_text(json.dumps(update_history(history, out), separators=(",", ":")))
    for w in warnings:
        print("WARNING:", w, file=sys.stderr)
    for e in errors:
        print("ERROR:", e, file=sys.stderr)
    return 1 if errors else 0


def show_rates(url, browser):
    """Print each rate on a page with the few pieces of text just before it, so the labels are easy to spot."""
    from bs4 import BeautifulSoup
    if not robots_ok(url):
        print("robots.txt does not allow fetching this page.")
        return
    soup = BeautifulSoup(get_html(url, browser), "html.parser")
    strings = [" ".join(s.split()) for s in soup.find_all(string=True) if s.parent.name not in SKIP_TAGS]
    strings = [s for s in strings if s]
    shown = 0
    for i, s in enumerate(strings):
        if RATE_RE.search(s):
            print(" | ".join(strings[max(0, i - 3):i + 1])[:220])
            shown += 1
            if shown >= 80:
                print("...stopping after 80 matches")
                break
    if not shown:
        print("No rates found on the page. If it fills them in with JavaScript, run it with the browser option on.")


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
        show_rates(a[1], "--browser" in a)
    else:
        sys.exit(run())
