// Compare lenders: up to three lenders' rates side by side, and a chart of how one rate moved for each.
// The choice is kept in the address (?l=RBC Royal Bank,EQ Bank&p=5-year fixed) so it can be shared.
(function(){
if (typeof SITE_VERSION === "undefined") return;
const Q = new URLSearchParams(location.search), MAX = 3;
const ROWS = [["Mortgages", COLUMNS.map(([, p]) => [p.charAt(0).toUpperCase() + p.slice(1), p, -1])
                 .concat(COLUMNS.map(([, p]) => [p.charAt(0).toUpperCase() + p.slice(1) + ", less than 20% down", p + " insured", -1]))],
              ["GICs", GIC_COLUMNS.map(([, p]) => [p.replace("-year GIC", "-year GIC"), p, 1]).concat([["1-year redeemable GIC", "1-year redeemable GIC", 1]])],
              ["Savings", [["Savings account (regular rate)", SAVINGS, 1], ["Savings promotional offer", SAVINGS_PROMO, 1]]]];
let all = [], hist = {series: {}}, picked = [], range = 365;
let prod = Q.get("p") || "5-year fixed";
const chosen = (Q.get("l") || "").split(",").map(s => s.trim()).filter(Boolean);
try { if (!chosen.length) JSON.parse(localStorage.getItem("compare") || "[]").forEach(n => chosen.push(n)); } catch (e) {}

function sync(){
  const q = new URLSearchParams();
  if (picked.length) q.set("l", picked.join(","));
  if (prod !== "5-year fixed") q.set("p", prod);
  try { history.replaceState(null, "", location.pathname + "?" + q.toString().replace(/%2C/g, ",").replace(/\+/g, "%20")); localStorage.setItem("compare", JSON.stringify(picked)); } catch (e) {}
}
function pickers(){
  const names = all.map(l => l.name).sort((a, b) => a.localeCompare(b));
  const slots = picked.length < MAX ? picked.concat([""]) : picked;
  $("cmppick").innerHTML = slots.map((n, i) => `<div class="pf"><label for="cl${i}">${n ? "Lender " + (i + 1) : "Add a lender"}</label><select id="cl${i}" data-i="${i}">`
      + `<option value="">${n ? "Remove" : "Choose…"}</option>` + names.map(x => `<option${x === n ? " selected" : ""}${picked.includes(x) && x !== n ? " disabled" : ""}>${esc(x)}</option>`).join("") + `</select></div>`).join("");
}
$("cmppick").addEventListener("change", e => {
  const s = e.target.closest("select[data-i]"); if (!s) return;
  const i = +s.dataset.i;
  if (s.value) picked[i] = s.value; else picked.splice(i, 1);
  picked = picked.filter(Boolean);
  sync(); pickers(); table(); chart();
  const again = $("cl" + Math.min(i, picked.length)); if (again) again.focus();
});
function table(){
  const ls = picked.map(n => all.find(l => l.name === n)).filter(Boolean);
  if (!ls.length) { $("cmphead").innerHTML = ""; $("cmprows").innerHTML = `<tr><td>Choose a lender above to start.</td></tr>`; return; }
  $("cmphead").innerHTML = `<tr><th scope="col">Rate</th>${ls.map(l => `<th scope="col" class="ln" style="--c:${seriesVar(l.name)}">${logo(l.name, l.source || l.dsource)}<a href="${LENDER_SLUGS[l.name]}-mortgage-rates.html">${esc(l.name)}</a>${LENDER_REGIONS[l.name] ? `<span class="lnote">${esc(LENDER_REGIONS[l.name].join(", "))}</span>` : ""}</th>`).join("")}</tr>`;
  $("cmprows").innerHTML = ROWS.map(([group, rows]) => {
    const live = rows.filter(([, p]) => ls.some(l => l.cells[p]));
    if (!live.length) return "";
    return `<tr class="grp"><th scope="colgroup" colspan="${ls.length + 1}">${group}</th></tr>` + live.map(([label, p, dir]) => {
      const vals = ls.map(l => l.cells[p] && !l.cells[p].stale ? l.cells[p].rate : null).filter(v => v != null);
      const best = vals.length > 1 ? (dir < 0 ? Math.min(...vals) : Math.max(...vals)) : null;
      return `<tr><th scope="row">${esc(label)}</th>` + ls.map(l => {
        const c = l.cells[p]; if (!c) return '<td class="none">—</td>';
        const ch = c.stale ? null : weekChange(hist.series[l.name + "|" + p], c.rate);
        return `<td class="rate${best != null && c.rate === best && !c.stale ? " low" : ""}${c.stale ? " st" : ""}" data-s="${esc(l.name + "|" + p)}"><span class="rc">${dir > 0 ? arrow(ch).replace('class="chg ', 'class="chg dep ') : arrow(ch)}<b>${pct(c.rate)}</b></span>${c.note ? `<span class="pn">${esc(c.note)}</span>` : ""}</td>`;
      }).join("") + "</tr>";
    }).join("");
  }).join("");
}
// One rate for each picked lender over the chosen period: step lines, one colour per lender
function chart(){
  const opts = ROWS.flatMap(([, rows]) => rows).filter(([, p]) => picked.some(n => (hist.series[n + "|" + p] || []).length));
  if (opts.length && !opts.some(([, p]) => p === prod)) prod = opts[0][1];
  $("cprod").innerHTML = opts.map(([label, p]) => `<option value="${esc(p)}"${p === prod ? " selected" : ""}>${esc(label)}</option>`).join("");
  document.querySelectorAll("#crange button").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.r === range)));
  const end = todayISO(), start = addDays(end, -range);
  const lines = picked.map(n => {
    const pts = hist.series[n + "|" + prod] || [];
    const before = pts.filter(p => p[0] <= start).pop(), inside = pts.filter(p => p[0] > start);
    const use = (before ? [[start, before[1]]] : []).concat(inside);
    return {n, pts: use};
  }).filter(l => l.pts.length);
  if (!lines.length) { $("cmpchart").innerHTML = `<p class="m">No history for this rate yet.</p>`; return; }
  const W = 760, H = 260, m = {l: 44, r: 12, t: 12, b: 26};
  const vals = lines.flatMap(l => l.pts.map(p => p[1]));
  let lo = Math.min(...vals), hi = Math.max(...vals); if (hi - lo < 0.2) { lo -= 0.1; hi += 0.1; }
  lo = Math.max(0, Math.floor((lo - 0.05) * 10) / 10); hi = Math.ceil((hi + 0.05) * 10) / 10;
  const t0 = Date.parse(start), t1 = Date.parse(end);
  const X = d => m.l + (Date.parse(d) - t0) / (t1 - t0) * (W - m.l - m.r), Y = v => m.t + (hi - v) / (hi - lo) * (H - m.t - m.b);
  const step = (hi - lo) > 2 ? 0.5 : (hi - lo) > 0.8 ? 0.25 : 0.1;
  let grid = "";
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) grid += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="gl"/><text x="${m.l - 6}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${v.toFixed(2)}%</text>`;
  const ticks = [0, 0.5, 1].map(f => { const d = addDays(start, Math.round(range * f)); return `<text x="${X(d).toFixed(1)}" y="${H - 6}" text-anchor="${f === 0 ? "start" : f === 1 ? "end" : "middle"}">${new Date(d + "T12:00:00").toLocaleDateString("en-CA", {month: "short", year: "numeric"})}</text>`; }).join("");
  const paths = lines.map(l => {
    let d = "", prev = null;
    l.pts.forEach(p => { const x = X(p[0]).toFixed(1), y = Y(p[1]).toFixed(1); d += prev == null ? `M${x} ${y}` : `H${x}V${y}`; prev = y; });
    d += `H${X(end).toFixed(1)}`;
    return `<path d="${d}" fill="none" stroke="${seriesVar(l.n)}" stroke-width="2.4" stroke-linejoin="round"/>`;
  }).join("");
  $("cmpchart").innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(prod)} rates over time for ${esc(lines.map(l => l.n).join(", "))}">${grid}${ticks}${paths}</svg>`
    + `<div class="lg">${lines.map(l => `<span><i class="sq" style="background:${seriesVar(l.n)}"></i>${esc(l.n)}: ${pct(l.pts[l.pts.length - 1][1])}</span>`).join("")}</div>`;
}
$("cprod").onchange = e => { prod = e.target.value; sync(); chart(); };
$("crange").onclick = e => { const b = e.target.closest("button[data-r]"); if (!b) return; range = +b.dataset.r; chart(); };
$("cmpshare").onclick = () => { const q = new URLSearchParams(location.search); copyLink(Object.fromEntries(q), $("cmpshare")); };
sparkPop(document.querySelector(".cmpwrap"), () => hist);

loadRates().then(d => {
  all = groupLenders(d);
  picked = chosen.filter((n, i) => all.some(l => l.name === n) && chosen.indexOf(n) === i).slice(0, MAX);
  if (!picked.length) picked = ["RBC Royal Bank", "TD Canada Trust", "EQ Bank"].filter(n => all.some(l => l.name === n));
  sync(); pickers(); table(); chart();
  loadHistory().then(h => { hist = h && h.series ? h : {series: {}}; table(); chart(); });
}, () => { $("cmprows").innerHTML = `<tr><td>The latest rates didn't load. Please refresh the page.</td></tr>`; });
})();
