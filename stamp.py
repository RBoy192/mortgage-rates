"""Deploy step: mark pages that show live rates with the time the rates were collected (for search engines).

In the site folder, sets dateModified in each page's structured data marked data-live="1" to rates.json's
updated_at, and the sitemap's <lastmod> to that date for pages listed as changing hourly or daily.
Usage: python stamp.py site
"""
import json, re, sys
from pathlib import Path

site = Path(sys.argv[1] if len(sys.argv) > 1 else "site")
try:
    when = json.loads((site / "rates.json").read_text())["updated_at"]
except Exception as e:
    sys.exit(f"stamp: no rates.json time ({e}); pages left as built")
day = when[:10]
n = 0
for page in site.glob("*.html"):
    s = page.read_text()
    m = re.search(r'(<script type="application/ld\+json" id="ld" data-live="1">)(.*?)(</script>)', s, re.S)
    if not m:
        continue
    block = re.sub(r'"dateModified": ?"[^"]*"', f'"dateModified": "{when}"', m.group(2))
    page.write_text(s[:m.start(2)] + block + s[m.end(2):])
    n += 1
sm = site / "sitemap.xml"
if sm.exists():
    sm.write_text(re.sub(r"<lastmod>[^<]*</lastmod>(<changefreq>(?:hourly|daily)</changefreq>)", f"<lastmod>{day}</lastmod>\\1", sm.read_text()))
print(f"stamp: {n} live pages dated {when}")
