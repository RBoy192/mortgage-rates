"""Keep dated evidence of each lender's rates page, privately.

When a lender's rates change (and at least every 30 days as a baseline), this saves:
  - a screenshot of the lender's rates page, and the page's HTML (compressed);
  - SHA-256 fingerprints of both, so it can be shown later that the files haven't changed since;
  - a request to the Internet Archive (Wayback Machine) to save the page too, as an independent, time-stamped copy.

The files go into a separate PRIVATE repository (EVIDENCE_REPO, cloned by the workflow into ./evidence-repo using the
EVIDENCE_TOKEN secret), with one line per capture in its manifest.csv. Nothing here is published on the site.
Until that repository and secret exist, only the Internet Archive copies are requested.

Usage (by the hourly workflow, after the scraper): python evidence.py <previous rates.json>
"""
import csv, gzip, hashlib, json, os, re, sys, time
from datetime import datetime, timezone, timedelta
from pathlib import Path

USER_AGENT = "MortgageRatesBot/1.0 (+https://whatstherate.ca)"
REPO = Path(os.environ.get("EVIDENCE_DIR", "evidence-repo"))
BASELINE_DAYS = 30
BASELINE_PER_RUN = 6  # spread the monthly baseline copies over several hourly runs
FIELDS = ["captured_at_utc", "lender", "url", "reason", "rates", "screenshot", "screenshot_sha256", "html", "html_sha256", "wayback"]


def load_rates(path):
    try:
        return {(r["institution"], r["product"]): r for r in json.loads(Path(path).read_text()).get("rates", [])}
    except Exception:
        return {}


def changed_pages(old, new):
    """(lender, page) for each automatically read rate that is new or different from the previous update.
    A lender's GIC and savings rates can be on other pages than its mortgage rates, so each page is kept."""
    out = set()
    for k, r in new.items():
        if r.get("method") != "automatic" or r.get("stale"):
            continue
        if k not in old or abs(float(old[k]["rate"]) - float(r["rate"])) > 1e-9:
            out.add((k[0], r.get("source") or ""))
    return sorted(out)


def changed_lenders(old, new):
    return sorted({n for n, _ in changed_pages(old, new)})


def last_captures(manifest):
    last = {}
    if manifest.exists():
        for row in csv.DictReader(manifest.open()):
            try:
                t = datetime.fromisoformat(row["captured_at_utc"].replace("Z", "+00:00"))
            except ValueError:
                continue
            k = (row["lender"], row.get("url", ""))
            if k not in last or t > last[k]:
                last[k] = t
    return last


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def wayback(url):
    """Ask the Internet Archive to save the page now; return the snapshot address if it says where it put it."""
    import requests
    try:
        r = requests.get("https://web.archive.org/save/" + url, headers={"User-Agent": USER_AGENT}, timeout=45, allow_redirects=True)
        loc = r.headers.get("Content-Location") or ""
        if loc.startswith("/web/"):
            return "https://web.archive.org" + loc
        if "/web/" in r.url:
            return r.url
        return f"requested (status {r.status_code})"
    except Exception as e:
        return f"failed: {str(e)[:80]}"


def capture(page, url, folder, stem):
    page.goto(url, wait_until="domcontentloaded", timeout=60000)
    try:
        page.wait_for_function(r"/\d\.\d{2,3}\s*%/.test(document.body.innerText)", timeout=30000)
    except Exception:
        pass
    page.wait_for_timeout(3000)
    shot = folder / f"{stem}.jpg"
    page.screenshot(path=str(shot), full_page=True, type="jpeg", quality=70)
    html = folder / f"{stem}.html.gz"
    with gzip.open(html, "wb") as f:
        f.write(page.content().encode("utf-8"))
    sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
    return shot, sha(shot), html, sha(html)


def main(prev_path):
    import yaml
    old, new = load_rates(prev_path), load_rates("rates.json")
    lenders = {l["name"]: l for l in yaml.safe_load(Path("institutions.yaml").read_text()) or [] if l.get("enabled", True)}
    have_repo = (REPO / ".git").exists()
    manifest = REPO / "manifest.csv"
    now = datetime.now(timezone.utc)
    changed = set(changed_pages(old, new))
    last = last_captures(manifest) if have_repo else {}
    todo = []
    for name, l in lenders.items():
        pages = []  # each page this lender's rates are read from automatically (manual ones block automated visits)
        for item in l.get("rates") or []:
            u, m = item.get("url") or l["url"], item.get("mode", l.get("mode", "auto"))
            if m != "manual" and item.get("enabled", True) and u not in pages:
                pages.append(u)
        for url in pages:
            if (name, url) in changed:
                todo.append((name, url, "rate change"))
            elif have_repo and now - last.get((name, url), datetime(2000, 1, 1, tzinfo=timezone.utc)) >= timedelta(days=BASELINE_DAYS) \
                    and sum(1 for t in todo if t[2] == "baseline") < BASELINE_PER_RUN:
                todo.append((name, url, "baseline"))
    if not todo:
        print("evidence: nothing to capture")
        return 0
    print(f"evidence: {len(todo)} page(s) to capture; private repository {'found' if have_repo else 'not set up, Internet Archive copies only'}")
    rows = []
    from concurrent.futures import ThreadPoolExecutor
    pool = ThreadPoolExecutor(max_workers=4)
    archived = {(name, url): pool.submit(wayback, url) for name, url, _ in todo}
    if have_repo:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            b = pw.chromium.launch()
            page = b.new_page(user_agent=USER_AGENT, viewport={"width": 1280, "height": 900})
            for name, url, reason in todo:
                stamp = datetime.now(timezone.utc)
                folder = REPO / stamp.strftime("%Y/%m/%d")
                folder.mkdir(parents=True, exist_ok=True)
                stem = f"{slug(name)}-{stamp.strftime('%H%M%S')}"
                try:
                    shot, shot_sha, html, html_sha = capture(page, url, folder, stem)
                except Exception as e:
                    print(f"evidence: {name}: capture failed ({str(e)[:80]})")
                    continue
                rates = "; ".join(f"{p}: {r['rate']}" for (n, p), r in sorted(new.items()) if n == name and (r.get("source") or url) == url)
                rows.append({"captured_at_utc": stamp.strftime("%Y-%m-%dT%H:%M:%SZ"), "lender": name, "url": url, "reason": reason,
                             "rates": rates, "screenshot": str(shot.relative_to(REPO)), "screenshot_sha256": shot_sha,
                             "html": str(html.relative_to(REPO)), "html_sha256": html_sha, "wayback": archived[(name, url)]})
                print(f"evidence: {name}: saved ({reason})")
            b.close()
        for r in rows:
            try:
                r["wayback"] = r["wayback"].result(timeout=90)
            except Exception as ex:
                r["wayback"] = f"failed: {str(ex)[:60]}"
        new_file = not manifest.exists()
        with manifest.open("a", newline="") as f:
            w = csv.DictWriter(f, fieldnames=FIELDS)
            if new_file:
                w.writeheader()
            w.writerows(rows)
    else:
        for name, url, reason in todo:
            try:
                print(f"evidence: {name}: Internet Archive {archived[(name, url)].result(timeout=90)}")
            except Exception as ex:
                print(f"evidence: {name}: Internet Archive failed ({str(ex)[:60]})")
    pool.shutdown(wait=False, cancel_futures=True)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "/tmp/rates.prev.json"))
