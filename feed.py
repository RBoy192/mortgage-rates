"""Write feed.xml: an Atom feed of lender rate changes from history.json (newest first), so visitors can follow
rate moves in any feed reader app. Run by the hourly workflow after the scraper."""
import json, html
from datetime import date, timedelta
from pathlib import Path

SITE = "https://whatstherate.ca/"
DAYS = 60       # changes from the last 60 days
MAX_ENTRIES = 60


KINDS = {"mortgages": ("Mortgage rate changes", "an advertised mortgage rate"), "gics": ("GIC rate changes", "an advertised GIC rate"),
         "savings": ("Savings rate changes", "an advertised savings account rate")}


def kind_of(product):
    return "gics" if "GIC" in product else "savings" if "Savings" in product else "mortgages"


def changes(history, today=None, days=DAYS, kind=None):
    today = today or date.today()
    since = (today - timedelta(days=days)).isoformat()
    out = []
    for key, pts in history.get("series", {}).items():
        if "|" not in key or key.startswith("posted|"):
            continue
        lender, product = key.split("|", 1)
        if kind and kind_of(product) != kind:
            continue
        pts = sorted(pts, key=lambda p: p[0])
        for (d0, v0), (d1, v1) in zip(pts, pts[1:]):
            if d1 >= since and round(v1 - v0, 3) != 0 and (date.fromisoformat(d1) - date.fromisoformat(d0)).days <= 14:
                out.append({"lender": lender, "product": product, "date": d1, "old": v0, "new": v1})
    out.sort(key=lambda c: (c["date"], c["lender"], c["product"]), reverse=True)
    return out[:MAX_ENTRIES]


def entry_text(c):
    diff = round(c["new"] - c["old"], 2)
    word = "down" if diff < 0 else "up"
    return (f"{c['lender']} {c['product']}: {c['new']:.2f}% ({word} {abs(diff):.2f})",
            f"{c['lender']} changed its {c['product']} rate from {c['old']:.2f}% to {c['new']:.2f}% on {c['date']}.")


def atom(items, updated, name="feed.xml", title="Rate changes", what="an advertised mortgage, GIC or savings rate"):
    e = html.escape
    entries = []
    for c in items:
        title, summary = entry_text(c)
        slug = f"{c['lender']}-{c['product']}-{c['date']}".lower().replace(" ", "-")
        entries.append(f"""  <entry>
    <title>{e(title)}</title>
    <id>tag:whatstherate.ca,2026:{e(slug)}</id>
    <updated>{c['date']}T12:00:00Z</updated>
    <link href="{SITE}rate-history.html"/>
    <summary>{e(summary)}</summary>
  </entry>""")
    return f"""<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>What's the rate? {e(title)}</title>
  <subtitle>Each time a Canadian lender changes {e(what)}.</subtitle>
  <link href="{SITE}"/>
  <link rel="self" href="{SITE}{name}"/>
  <id>{SITE}{name}</id>
  <updated>{updated}</updated>
  <author><name>What's the rate?</name></author>
{chr(10).join(entries)}
</feed>
"""


def main():
    history = json.loads(Path("history.json").read_text())
    items = changes(history)
    updated = (items[0]["date"] + "T12:00:00Z") if items else (history.get("updated_at") or date.today().isoformat() + "T00:00:00Z")
    Path("feed.xml").write_text(atom(items, updated))
    print(f"feed.xml: {len(items)} rate changes")
    # one feed per kind of rate, for people who only follow mortgages, GICs or savings
    for k, (title, what) in KINDS.items():
        its = changes(history, kind=k)
        Path(f"feed-{k}.xml").write_text(atom(its, (its[0]["date"] + "T12:00:00Z") if its else updated, f"feed-{k}.xml", title, what))
        print(f"feed-{k}.xml: {len(its)} rate changes")


if __name__ == "__main__":
    main()
