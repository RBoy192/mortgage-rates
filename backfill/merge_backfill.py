import csv, json, re, collections, sys
rows=list(csv.DictReader(open(sys.argv[1] if len(sys.argv) > 1 else "backfill/backfill_report.csv")))  # or a report-<run>.csv
def ok(r):
    if not r["rate"]: return False
    t=r["text_read"]; v=float(r["rate"])
    if "${" in t: return False
    if "with prime" in t: return True
    if re.fullmatch(r"\d{1,2}\.\d{2,3}", t.strip()): return abs(float(t)-v)<1e-9   # a table cell holding just the number (plain: true)
    m=None
    for d in (2,3):
        m=re.search(re.escape(f"{v:.{d}f}")+r"\s*%", t)
        if m: break
    if not m: return False
    prefix=t[:m.start()]
    for i,ch in enumerate(prefix):          # an empty "%" before the reading means the real figure was missing
        if ch=="%":
            before=prefix[:i].rstrip()
            if not before or not before[-1].isdigit(): return False
    return True
acc=[r for r in rows if ok(r)]
rej=collections.Counter((r["lender"],r["product"]) for r in rows if r["rate"] and not ok(r))
print("accepted",len(acc),"rejected",sum(rej.values())); print(dict(rej))
h=json.load(open("history.json")); S=h["series"]; added=collections.Counter()
for r in acc:
    k=f'{r["lender"]}|{r["product"]}'; pts=S.setdefault(k,[])
    if r["date"]>="2026-10-14" or any(p[0]==r["date"] for p in pts): continue
    pts.append([r["date"], float(r["rate"])]); added[r["lender"]]+=1
for pts in S.values(): pts.sort(key=lambda p:p[0])
h["lender_archive_note"]=True
json.dump(h,open("history.json","w"),separators=(",",":"))
print(dict(added))
