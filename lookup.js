// Rate lookup (Extras): what each lender advertised on a chosen date, from history.json.
// A series is a list of [date, rate] points with runs of unchanged readings shortened to their ends, so the rate on a
// date is the last point on or before it, and the next point says whether it had changed by then.
// Choices are kept in the address (?date=2025-06-01&lender=EQ%20Bank&type=5-year%20fixed) so a lookup can be shared.
(function(){
if (typeof SITE_VERSION === "undefined") return;
const Q = new URLSearchParams(location.search);
const BOC = {"policy_rate": "Bank of Canada policy rate", "prime_rate": "Prime rate (Bank of Canada)"};
const KIND = [["Mortgages", p => !isDeposit(p)], ["GICs", p => /GIC/.test(p)], ["Savings", p => /^Savings/.test(p)]];
const ORDER = MR_PRODUCTS.flatMap(([, ps]) => ps);
const prodRank = p => { const i = ORDER.indexOf(p.replace(/ insured$/, "")); return (i < 0 ? 99 : i) * 2 + (/ insured$/.test(p) ? 1 : 0); };
const lendRank = n => { const i = LENDER_ORDER.indexOf(n); return i < 0 ? 999 : i; };
let H = null, keys = [], first = "";
const st = {date: Q.get("date") || "", lender: Q.get("lender") || "", type: Q.get("type") || ""};

function sync(){
  const q = new URLSearchParams();
  if (st.date) q.set("date", st.date);
  if (st.lender) q.set("lender", st.lender);
  if (st.type) q.set("type", st.type);
  try { history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : "")); } catch (e) {}
}
// days between two ISO dates
const gap = (a, b) => Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 864e5);

// What the series says about one date: null if it has no reading on or before it.
function at(pts, d, complete){
  let i = -1;
  for (let k = 0; k < pts.length && pts[k][0] <= d; k++) i = k;
  if (i < 0) return null;
  const [pd, pv] = pts[i], nx = pts[i + 1] || null;
  let j = i; while (j > 0 && pts[j - 1][1] === pv) j--;
  const res = {rate: pv, seen: pd, since: pts[j][0], next: nx};
  // was this rate read near the chosen date? Readings saved by this site every day are shortened to the ends of each
  // unchanged run, so the gap between two points only means "unknown" in the archived part (or for a stopped series).
  res.exact = pd === d;
  res.unsure = !res.exact && !complete(pd, nx) && (nx ? gap(pd, nx[0]) > 8 : gap(pd, d) > 8);
  return res;
}

function fill(){
  const S = H.series;
  keys = Object.keys(S).filter(k => k.includes("|") && !k.startsWith("posted|") && S[k].length);
  first = keys.reduce((m, k) => S[k][0][0] < m ? S[k][0][0] : m, todayISO());
  const lenders = [...new Set(keys.map(k => k.split("|")[0]))].sort((a, b) => lendRank(a) - lendRank(b) || a.localeCompare(b));
  const types = [...new Set(keys.map(k => k.split("|")[1]))].sort((a, b) => prodRank(a) - prodRank(b) || a.localeCompare(b));
  $("lk_lender").innerHTML = `<option value="">All lenders</option>` + LENDER_GROUPS.map(([g, f]) => {
    const ls = lenders.filter(f); return ls.length ? `<optgroup label="${esc(g)}">` + ls.map(n => `<option>${esc(n)}</option>`).join("") + `</optgroup>` : ""; }).join("")
    + (Object.keys(BOC).some(k => S[k] && S[k].length) ? `<optgroup label="Bank of Canada"><option value="boc">Policy rate, prime rate and posted rates</option></optgroup>` : "");
  $("lk_type").innerHTML = `<option value="">All rate types</option>` + KIND.map(([g, f]) => {
    const ts = types.filter(f); return ts.length ? `<optgroup label="${g}">` + ts.map(t => `<option value="${esc(t)}">${esc(mrCap(t))}</option>`).join("") + `</optgroup>` : ""; }).join("");
  const today = todayISO();
  $("lk_date").min = first; $("lk_date").max = today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(st.date) || st.date > today) st.date = today;
  if (st.date < first) st.date = first;
  $("lk_date").value = st.date;
  if (st.lender && ![...$("lk_lender").options].some(o => o.value === st.lender)) st.lender = "";
  if (st.type && !types.includes(st.type)) st.type = "";
  $("lk_lender").value = st.lender; $("lk_type").value = st.type;
  $("lk_from").textContent = dstr(first);
}

function render(){
  if (!H) return;
  st.date = $("lk_date").value || todayISO(); st.lender = $("lk_lender").value; st.type = $("lk_type").value;
  if (st.date < first) st.date = first;
  if (st.date > todayISO()) st.date = todayISO();
  sync();
  const S = H.series, d = st.date;
  // the site's own daily saves start here (earlier points come from archived copies of the lenders' pages)
  const siteFrom = p => isDeposit(p) ? (H.deposit_history_from || H.site_history_from || "9999") : (H.site_history_from || "9999");
  const rows = [], old = [];
  if (st.lender === "boc") {
    Object.entries(BOC).forEach(([k, label]) => { const pts = S[k]; if (!pts || !pts.length) return;
      const r = at(pts, d, () => true); if (r) rows.push({boc: true, name: label, p: "", r}); });
    Object.keys(S).filter(k => k.startsWith("posted|") && S[k].length).forEach(k => {
      const r = at(S[k], d, () => true); if (r) rows.push({boc: true, name: "Bank of Canada Posted Rate", p: k.slice(7), r}); });
  }
  if (st.lender !== "boc") keys.forEach(k => {
    const [n, p] = k.split("|");
    if ((st.lender && n !== st.lender) || (st.type && p !== st.type)) return;
    const r = at(S[k], d, (pd, nx) => pd >= siteFrom(p) && (nx ? nx[0] >= siteFrom(p) : gap(pd, d) <= 1));
    if (!r) return;
    if (!r.exact && gap(r.seen, d) > 90 && (!r.next || r.next[1] !== r.rate)) { old.push(n); return; }
    rows.push({name: n, p, r});
  });
  rows.sort((a, b) => (a.p ? 1 : 0) - (b.p ? 1 : 0) || prodRank(a.p) - prodRank(b.p) || (isDeposit(a.p) ? b.r.rate - a.r.rate : a.r.rate - b.r.rate) || lendRank(a.name) - lendRank(b.name));
  const what = st.lender === "boc" ? "Bank of Canada rates" : (st.lender ? st.lender + "'s " : "") + (st.type ? "advertised " + mrCap(st.type) + " rates" : "advertised rates");
  $("lk_head").textContent = `${what.charAt(0).toUpperCase() + what.slice(1)} on ${dstr(d)}`;
  const oldNote = old.length ? `<p class="f">Left out: ${esc([...new Set(old)].sort((a, b) => lendRank(a) - lendRank(b)).join(", "))}. No reading of ${old.length > 1 ? "those rates" : "that rate"} within 90 days before this date, and ${old.length > 1 ? "they had" : "it had"} changed by the next reading, so the advertised rate on this date isn't known.</p>` : "";
  if (!rows.length) {
    $("lk_out").innerHTML = `<p class="m">No saved rate${st.lender && st.lender !== "boc" ? " from " + esc(st.lender) : ""}${st.type ? " for " + esc(mrCap(st.type)) : ""} on or before ${dstr(d)}. The saved history starts on different dates for each lender; try a later date.</p>` + oldNote;
    return;
  }
  const basis = (r, boc) => {
    if (boc) return `Bank of Canada figure since ${dstr(r.since)}` + (r.next && r.next[1] !== r.rate ? `; ${pct(r.next[1])} from ${dstr(r.next[0])}` : "");
    if (r.exact) return `Read on ${dstr(r.seen)}`;
    const nx = r.next;
    let s = `Last read ${dstr(r.seen)}`;
    if (nx && nx[1] !== r.rate) s += `; ${pct(nx[1])} by ${dstr(nx[0])}`;
    else if (nx) s += `; same rate on ${dstr(nx[0])}`;
    return s;
  };
  const unsure = rows.some(x => x.r.unsure), showType = !st.type || st.lender === "boc";
  $("lk_out").innerHTML = `<div class="t" tabindex="0" role="region" aria-label="${esc($("lk_head").textContent)}"><table class="ltab dep lkt${showType ? "" : " notype"}"><thead><tr><th scope="col">${st.lender === "boc" ? "Figure" : "Lender"}</th>${showType ? `<th scope="col">${st.lender === "boc" ? "For" : "Rate type"}</th>` : ""}<th scope="col">${st.lender === "boc" ? "Rate" : "Advertised rate"}</th><th scope="col">${st.lender === "boc" ? "Source" : "When it was read"}</th></tr></thead><tbody>`
    + rows.map(x => `<tr><td>${x.boc ? esc(x.name) : `<a href="${LENDER_SLUGS[x.name] ? LENDER_SLUGS[x.name] + "-mortgage-rates.html" : "#"}">${esc(x.name)}</a>`}</td>${showType ? `<td>${esc(x.p ? mrCap(x.p) : "")}</td>` : ""}<td><b>${pct(x.r.rate)}</b>${x.r.unsure ? `<sup aria-hidden="true">†</sup><span class="vh"> (not read near this date)</span>` : ""}</td><td class="s">${basis(x.r, x.boc)}</td></tr>`).join("")
    + `</tbody></table></div>`
    + oldNote + (unsure ? `<p class="f"><sup>†</sup> Not read near this date. This figure comes from an archived copy of the lender's page, and the next reading is more than 8 days away, so the advertised rate may have been different on ${dstr(d)}.</p>` : "")
    + (st.lender === "boc" ? `<p class="f">These are the Bank of Canada's own figures, not lender rates: the policy rate it sets, and the prime rate it records for Canada's major banks (weekly).</p>`
      : `<p class="f">${rows.length} rate${rows.length > 1 ? "s" : ""}. Mortgages are listed lowest first and GICs and savings highest first, within each rate type.</p>`);
}

["lk_date", "lk_lender", "lk_type"].forEach(id => $(id).addEventListener("change", render));
$("lk_date").addEventListener("input", () => { if (/^\d{4}-\d{2}-\d{2}$/.test($("lk_date").value)) render(); });
$("lk_today").onclick = () => { $("lk_date").value = todayISO(); render(); };
$("lk_share").onclick = () => copyLink(Object.fromEntries(new URLSearchParams(location.search)), $("lk_share"));
loadHistory().then(h => {
  H = h && h.series ? h : {series: {}};
  if (!Object.keys(H.series).length) { $("lk_out").innerHTML = `<p class="m">The rate history didn't load. Please refresh the page.</p>`; return; }
  fill(); render();
});
})();
