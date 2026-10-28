// Rate history charts. Data: history.json (one value per lender, product and day), written by the hourly update.
(function(){
if (typeof SITE_VERSION === "undefined") return;
const RANGES = [["1M", 31], ["3M", 92], ["6M", 183], ["1Y", 366], ["5Y", 1827], ["10Y", 3653], ["All", Infinity]];
// The big-bank posted-rate line starts switched off; visitors can tap it on.
let H = {series: {}}, range = "1Y", hidden = new Set(["Big-bank posted rate (Bank of Canada)"]);
try { range = localStorage.getItem("hist-range2") || "1Y"; const s = localStorage.getItem("hist-hidden2"); if (s !== null) hidden = new Set(JSON.parse(s)); } catch (e) {}
const save = () => { try { localStorage.setItem("hist-range2", range); localStorage.setItem("hist-hidden2", JSON.stringify([...hidden])); } catch (e) {} };
const day = iso => new Date(iso + "T12:00:00").getTime();
const short = (t, wide) => new Date(t).toLocaleDateString([], wide ? {month: "short", year: "numeric"} : {month: "short", day: "numeric"});  // wide: the chart spans more than a year
const long = t => new Date(t).toLocaleDateString([], {dateStyle: "medium"});
const valueAt = (pts, t) => { let v = null; for (const [d, r] of pts) { if (day(d) <= t) v = r; else break; } return v; };

// Which rates to chart: mortgages, GICs or savings (picked with the buttons above the charts; remembered, and in the address)
const KINDS = {mortgages: COLUMNS.map(([, p]) => [p.charAt(0).toUpperCase() + p.slice(1), p]),
  gics: GIC_COLUMNS.map(([, p]) => [p.replace("-year GIC", "-year non-redeemable GIC"), p]), savings: [["Savings accounts (regular rate)", SAVINGS]]};
let kind = "mortgages";
try { const k = (location.hash || "").slice(1) || localStorage.getItem("hist-kind"); if (KINDS[k]) kind = k; } catch (e) {}
const prods = () => KINDS[kind].map(([, p]) => p);
function lenders(){
  const want = new Set(prods());
  const names = new Set(Object.keys(H.series).filter(k => k.includes("|") && !k.startsWith("posted|") && want.has(k.split("|").slice(1).join("|"))).map(k => k.split("|")[0]));
  return [...names].sort((a, b) => (LENDER_ORDER.indexOf(a) + 1 || 99) - (LENDER_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b));
}

// Region filter: Nationwide shows every lender (those that lend across Canada first, then the regional ones); a province shows
// the lenders available there: its local lenders plus those that lend across Canada.
// Only provinces with at least one local lender are offered (Ontario and British Columbia first). Starts on Nationwide.
let region = "Nationwide";
// shareable view: ?region=Ontario&range=5Y (the rate type is in the #hash)
const HQ = new URLSearchParams(location.search);
function syncURL(){
  const q = new URLSearchParams();
  if (region !== "Nationwide") q.set("region", region);
  if (range !== "1Y") q.set("range", range);
  try { history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : "") + (kind === "mortgages" ? "" : "#" + kind)); } catch (e) {}
}
const PROVINCES = (() => { const s = new Set(Object.values(LENDER_REGIONS).flat()); return ["Ontario", "British Columbia"].filter(p => s.has(p)).concat([...s].filter(p => p !== "Ontario" && p !== "British Columbia").sort()); })();
if (PROVINCES.includes(HQ.get("region"))) region = HQ.get("region");
if (RANGES.some(([k]) => k === HQ.get("range"))) range = HQ.get("range");
const local = n => !!LENDER_REGIONS[n];
const inRegion = n => region === "Nationwide" || !local(n) || LENDER_REGIONS[n].includes(region);
const avail = () => lenders().filter(inRegion);

function controls(){
  $("region").innerHTML = ["Nationwide", ...PROVINCES].map(p => `<option${p === region ? " selected" : ""}>${p}</option>`).join("");
  $("range").innerHTML = RANGES.map(([k]) => `<button type="button" aria-pressed="${k === range}" data-r="${k}">${k}</button>`).join("");
  const P = "Big-bank posted rate (Bank of Canada)", all = avail(), shown = all.filter(n => !hidden.has(n));
  const banks = all.filter(n => !NON_BANKS.includes(n)), only = set => shown.length === set.length && set.every(n => !hidden.has(n));
  $("quick").innerHTML = [["all", "Show all", shown.length === all.length], ["banks", "Banks only", only(banks)],
    ["others", "Credit unions and others", only(all.filter(n => NON_BANKS.includes(n)))], ["none", "Clear all", !shown.length && hidden.has(P)]]
    .map(([k, t, on]) => `<button type="button" data-q="${k}" aria-pressed="${on}">${t}</button>`).join("");
  $("chips").innerHTML = (prods().some(p => H.series["posted|" + p]) ? `<button type="button" class="chip" aria-pressed="${!hidden.has(P)}" data-n="${P}"><i style="background:var(--mu)"></i>Big-bank posted rate</button>` : "") + (() => {
    const chip = n => `<button type="button" class="chip" aria-pressed="${!hidden.has(n)}" data-n="${esc(n)}"><i style="background:${seriesVar(n)}"></i>${esc(n)}</button>`;
    if (region === "Nationwide") { const nat = all.filter(n => !local(n)), reg = all.filter(local);
      return nat.map(chip).join("") + (reg.length ? `<p class="chh">Regional lenders</p>` + reg.map(chip).join("") : ""); }
    const here = all.filter(local), nat = all.filter(n => !local(n));  // a province: its own lenders first, then the nationwide ones
    return `<p class="chh">${esc(region)}</p>` + here.map(chip).join("") + `<p class="chh">Nationwide</p>` + nat.map(chip).join("");
  })();
}

// `scale`: the lines the axes are sized for (every lender, shown or not), so filtering never rescales the chart
function chart(el, title, series, scale = series, nonePicked = false){
  const end = day(todayISO()), all = scale.flatMap(s => s.points.map(p => day(p[0])));
  if (!series.length && nonePicked) { el.innerHTML = `<h2 class="h3">${title}</h2>` + mascotNote(`No lenders picked. Tap a lender ${matchMedia("(min-width:1000px)").matches && document.querySelector(".hside") ? "on the left" : "above"}, or use Show all, to bring the lines back.`, "hold"); return; }
  if (!all.length) { el.innerHTML = `<h2 class="h3">${title}</h2>${mascotNote("No history yet. It fills in as the site saves each day's rates.", "hold")}`; return; }
  const span = RANGES.find(r => r[0] === range)[1];
  let start = Math.max(Math.min(...all), end - span * 864e5);
  if (start >= end) start = end - 7 * 864e5;
  const vis = series.map(s => Object.assign({}, s, {v: s.points.filter(p => day(p[0]) >= start), before: valueAt(s.points, start)}))
    .filter(s => s.v.length || s.before != null);
  const vals = scale.flatMap(s => { const v = s.points.filter(p => day(p[0]) >= start).map(p => p[1]), b = valueAt(s.points, start); return b != null ? [...v, b] : v; });
  if (!vis.length || !vals.length) { el.innerHTML = `<h2 class="h3">${title}</h2><p class="empty">No rates in this time range.</p>`; return; }
  const vmin = Math.min(...vals), vmax = Math.max(...vals);
  const stepY = [0.05, 0.1, 0.25, 0.5, 1, 2].find(s => Math.ceil((vmax + 0.05) / s) - Math.floor((vmin - 0.05) / s) <= 5) || 2;
  const lo = Math.max(0, Math.floor((vmin - 0.05) / stepY) * stepY),  /* rates never go below zero */ hi = Math.ceil((vmax + 0.05) / stepY) * stepY;
  const W = Math.max(300, el.clientWidth - 48), Ht = 240, m = {l: 48, r: 12, t: 10, b: 26}, iw = W - m.l - m.r, ih = Ht - m.t - m.b;
  const x = t => m.l + (t - start) / (end - start) * iw, y = r => m.t + (hi - r) / (hi - lo) * ih;
  const ticks = []; for (let v = lo; v <= hi + 1e-9; v += stepY) ticks.push(v);
  const xt = [0, 1, 2, 3].map(k => start + (end - start) * k / 3);
  // Smooth curve through the saved points (monotone, so it never bulges above or below the real rates)
  const GAP = 120 * 864e5;  // more than ~4 months between readings: leave a gap rather than draw a line we can't vouch for
  const curve = raw => {
    const P = raw.map(([t, r]) => [x(t), y(r)]).filter((p, k, a) => !k || p[0] > a[k - 1][0] + 0.01);
    if (P.length < 2) return P.length ? `M${P[0][0].toFixed(1)},${P[0][1].toFixed(1)}h0.1` : "";
    const n = P.length, dx = [], m = [], tg = new Array(n);
    for (let k = 0; k < n - 1; k++) { dx[k] = P[k + 1][0] - P[k][0]; m[k] = (P[k + 1][1] - P[k][1]) / dx[k]; }
    tg[0] = m[0]; tg[n - 1] = m[n - 2];
    for (let k = 1; k < n - 1; k++) tg[k] = m[k - 1] * m[k] <= 0 ? 0 : 3 * (dx[k - 1] + dx[k]) / ((2 * dx[k] + dx[k - 1]) / m[k - 1] + (dx[k] + 2 * dx[k - 1]) / m[k]);
    if (m[0] === 0) tg[0] = 0; if (m[n - 2] === 0) tg[n - 1] = 0;
    let d = `M${P[0][0].toFixed(1)},${P[0][1].toFixed(1)}`;
    for (let k = 0; k < n - 1; k++) {
      const h = dx[k] / 3;
      d += `C${(P[k][0] + h).toFixed(1)},${(P[k][1] + tg[k] * h).toFixed(1)} ${(P[k + 1][0] - h).toFixed(1)},${(P[k + 1][1] - tg[k + 1] * h).toFixed(1)} ${P[k + 1][0].toFixed(1)},${P[k + 1][1].toFixed(1)}`;
    }
    return d;
  };
  const path = s => {
    const raw = (s.before != null && (!s.v.length || day(s.v[0][0]) > start) ? [[start, s.before]] : []).concat(s.v.map(p => [day(p[0]), p[1]]));
    if (raw.length && raw[raw.length - 1][0] < end) raw.push([end, raw[raw.length - 1][1]]);
    const runs = [[]];  // split at long gaps (not for Bank of Canada lines, which only store the dates rates changed)
    raw.forEach((p, k) => { if (k && p[0] - raw[k - 1][0] > GAP && !s.dash && !s.steps) runs.push([]); runs[runs.length - 1].push(p); });
    s.runs = runs;
    // a faint dotted straight line across each gap: no saved reading in between
    s.bridge = runs.slice(1).map((r, k) => { const a = runs[k][runs[k].length - 1], b = r[0]; return `M${x(a[0]).toFixed(1)},${y(a[1]).toFixed(1)}L${x(b[0]).toFixed(1)},${y(b[1]).toFixed(1)}`; }).join("");
    return runs.map(curve).join("");
  };
  const lastDots = vis.map(s => { const r = s.v.length ? s.v[s.v.length - 1][1] : s.before; return `<circle cx="${x(end).toFixed(1)}" cy="${y(r).toFixed(1)}" r="4" fill="${s.color}" stroke="var(--card)" stroke-width="2"/>`; }).join("");
  const dates = [...new Set(vis.flatMap(s => s.v.map(p => p[0])))].sort().reverse();
  el.innerHTML = `<h2 class="h3">${title}</h2>`
    + `<svg viewBox="0 0 ${W} ${Ht}" width="${W}" height="${Ht}" role="img" aria-label="${esc(title)} rates over time, ${long(start)} to ${long(end)}">`
    + `<g class="ax">${ticks.map(v => `<line class="gl" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${v.toFixed(2)}%</text>`).join("")}`
    + `${xt.map((t, k) => `<text x="${x(t)}" y="${Ht - 6}" text-anchor="${k === 0 ? "start" : k === 3 ? "end" : "middle"}">${short(t, xt[xt.length - 1] - xt[0] > 200 * 864e5)}</text>`).join("")}</g>`
    + vis.map(s => { path(s); return s.bridge ? `<path class="gapln" d="${s.bridge}" fill="none" stroke="${s.color}" stroke-width="1.5" stroke-dasharray="1.5 5" stroke-linecap="round"/>` : ""; }).join("")
    + vis.map((s, i) => `<path class="ln" data-i="${i}" d="${path(s)}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"${s.dash ? ' stroke-dasharray="6 4"' : ""}/>`).join("")
    + lastDots + `<line class="cross" y1="${m.t}" y2="${m.t + ih}" x1="0" x2="0" visibility="hidden"/>`
    + `<rect x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent" style="cursor:crosshair"/></svg>`
    + `<div class="tip" hidden></div><div class="lpop" aria-hidden="true"></div>`
    + `<div class="lgd">${vis.map(s => `<span style="--c:${s.color}"><i class="${s.dash ? "dash" : ""}"></i>${esc(s.name)}</span>`).join("")}</div>`
    + `<details class="tv"><summary>Show as a table</summary><div class="t" tabindex="0" role="region" aria-label="${esc(title)} rates by day"><table><thead><tr><th>Date</th>${vis.map(s => `<th>${esc(s.name)}</th>`).join("")}</tr></thead><tbody>`
    + dates.map(d => `<tr><td>${dstr(d)}</td>${vis.map(s => { const p = s.v.find(q => q[0] === d); return `<td>${p ? pct(p[1]) : "—"}</td>`; }).join("")}</tr>`).join("")
    + `</tbody></table></div><p class="s">Only days when the rate was saved are listed.</p></details>`;
  const svg = el.querySelector("svg"), tip = el.querySelector(".tip"), cross = el.querySelector(".cross"), hit = el.querySelector("rect");
  const pop = el.querySelector(".lpop"), lines = [...svg.querySelectorAll("path.ln")];
  // Where a line is drawn at time t (straight between readings, close to the curve), or null in a gap
  const lineAt = (s, t) => {
    for (const run of s.runs || []) {
      if (!run.length || t < run[0][0] || t > run[run.length - 1][0]) continue;
      for (let k = 1; k < run.length; k++) if (t <= run[k][0]) { const [t0, v0] = run[k - 1], [t1, v1] = run[k]; return t1 === t0 ? v1 : v0 + (v1 - v0) * (t - t0) / (t1 - t0); }
      return run[run.length - 1][1];
    }
    return null;
  };
  const near = (t, sy) => {  // the line closest to the pointer, if it's within about 14px
    let best = null;
    vis.forEach((s, i) => { const v = lineAt(s, t); if (v == null) return; const dy = Math.abs(y(v) - sy); if (dy < 14 && (!best || dy < best.dy)) best = {s, i, dy, v}; });
    return best;
  };
  const unfocus = () => { pop.classList.remove("on"); svg.classList.remove("focus"); lines.forEach(p => p.classList.remove("on")); };
  const move = e => {
    const r = svg.getBoundingClientRect(), sx = (e.clientX - r.left) * W / r.width;
    const t = Math.min(end, Math.max(start, start + (sx - m.l) / iw * (end - start)));
    const rows = vis.filter(s => lineAt(s, t) != null).map(s => [s, valueAt(s.points, t)]).filter(([, v]) => v != null).sort((a, b) => a[1] - b[1]);  // skip lines in a gap
    cross.setAttribute("x1", x(t)); cross.setAttribute("x2", x(t)); cross.setAttribute("visibility", "visible");
    tip.innerHTML = `<b>${long(t)}</b>` + rows.map(([s, v]) => `<div><span><i class="sq" style="background:${s.color}"></i>${esc(s.name)}</span><span>${pct(v)}</span></div>`).join("");
    tip.hidden = false;
    const er = el.getBoundingClientRect(), ox = r.left - er.left, oy = r.top - er.top;  // the drawing's position inside the card
    const left = (x(t) / W) * r.width + ox;
    const touch = e.pointerType === "touch" || e.pointerType === "pen", gapX = touch ? 36 : 16;  // a finger covers more than a cursor
    const right = left < el.clientWidth / 2;  // keep the list on the side away from the pointer
    tip.style.left = (right ? Math.min(left + gapX, el.clientWidth - tip.offsetWidth - 8) : Math.max(8, left - tip.offsetWidth - gapX)) + "px";
    tip.style.top = (oy + 8) + "px";
    const sy = (e.clientY - r.top) * Ht / r.height, hitLine = near(t, sy);
    if (!hitLine) return unfocus();
    tip.hidden = true;  // near a line: just name that line
    const v = valueAt(hitLine.s.points, t);
    pop.innerHTML = `<i style="background:${hitLine.s.color}"></i>${esc(hitLine.s.name)}${v != null ? ` <b>${pct(v)}</b>` : ""}`;
    const px = left, py = (y(hitLine.v) / Ht) * r.height + oy;
    if (touch) {  // well above the fingertip, on the side away from the finger, so the name isn't hidden under it
      const fy = e.clientY - er.top;
      pop.style.left = (right ? Math.min(px + 32, el.clientWidth - pop.offsetWidth - 8) : Math.max(8, px - pop.offsetWidth - 32)) + "px";
      pop.style.top = Math.max(0, Math.min(py, fy) - pop.offsetHeight - 48) + "px";
    } else {
      pop.style.left = Math.min(Math.max(0, px + 14), el.clientWidth - pop.offsetWidth - 8) + "px";
      pop.style.top = Math.max(0, py - pop.offsetHeight - 10) + "px";
    }
    pop.classList.add("on"); svg.classList.add("focus");
    lines.forEach((p, k) => p.classList.toggle("on", k === hitLine.i));
  };
  const leave = () => { tip.hidden = true; cross.setAttribute("visibility", "hidden"); unfocus(); };
  hit.addEventListener("pointermove", move); hit.addEventListener("pointerdown", move);
  // A mouse leaving hides the labels; after a tap they stay until the next tap somewhere else on the page.
  hit.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") leave(); });
  document.addEventListener("pointerdown", e => { if (e.pointerType !== "mouse" && !el.contains(e.target)) leave(); });
}

// Other pages (rate-type and lender pages) reuse the chart: histChart(element, title, series)
window.histChart = chart;
window.histRange = r => { if (r) range = r; return range; };
if (!$("range")) return;

function render(){
  controls();
  const ls = avail().filter(n => !hidden.has(n));
  // The Bank of Canada publishes the big banks' typical posted rate for some fixed terms, GICs and savings; it's drawn dashed for context.
  const POSTED = "Big-bank posted rate (Bank of Canada)";
  document.querySelectorAll("#hkind button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.k === kind)));
  for (let k = 0; k < 5; k++) { const el = $("ch" + k); if (el) el.hidden = k >= KINDS[kind].length; }
  KINDS[kind].forEach(([title, p], k) => {
    const line = n => ({name: n, color: seriesVar(n), points: H.series[n + "|" + p]});
    const posted = H.series["posted|" + p] ? [{name: POSTED, color: "var(--mu)", dash: true, points: H.series["posted|" + p]}] : [];
    chart($("ch" + k), title,
      ls.filter(n => H.series[n + "|" + p]).map(line).concat(hidden.has(POSTED) ? [] : posted),
      lenders().filter(n => H.series[n + "|" + p]).map(line).concat(posted),  // axes fit every line, shown or not
      avail().length > 0 && !ls.length);  // every lender in this region switched off
  });
  chart($("chb"), "Bank of Canada policy rate and prime rate", [["policy_rate", "BoC policy rate", "var(--s1)"], ["prime_rate", "Prime rate", "var(--s2)"]]
    .filter(([k]) => H.series[k]).map(([k, name, color]) => ({name, color, steps: true, points: H.series[k]})));
  const lenderFirst = Object.entries(H.series).filter(([k]) => k.includes("|") && !k.startsWith("posted|") && prods().includes(k.split("|").slice(1).join("|"))).flatMap(([, s]) => s.map(p => p[0])).sort()[0];
  const dep = kind !== "mortgages", from = dep ? (H.deposit_history_from || H.site_history_from) : H.site_history_from;
  $("since").textContent = (H.boc_history_from ? `Bank of Canada figures go back to ${dstr(H.boc_history_from)}. ` : "")
    + ((dep ? H.deposit_archive_note : H.lender_archive_note) && from
      ? `Lenders don't publish their past rates. Before ${dstr(from)}, the lines come from archived copies of each lender's own rate page, which were saved at irregular times, so a change between two copies may show up late or be missed. A faint dotted line means no copy was saved in between. Since then, this site has saved every rate once a day.`
      : lenderFirst ? `Each lender's own rates start on ${dstr(lenderFirst)}, when this site began saving them once a day; lenders don't publish their past rates.` : "");
}

$("hkind").onclick = e => { const b = e.target.closest("button[data-k]"); if (!b) return; kind = b.dataset.k;
  try { localStorage.setItem("hist-kind", kind); } catch (er) {} syncURL();
  applyPick(); render(); };
$("range").onclick = e => { const b = e.target.closest("button"); if (b) { range = b.dataset.r; save(); render(); syncURL(); } };
// Quick picks: everyone, banks only, credit unions only, or nobody (then tap lenders one by one)
// Changing region keeps the lender-type choice: Banks only stays banks only, and so on. Hand-picked lenders stay as picked.
let pick = "all";
const applyPick = () => { if (!pick) return; const all = avail(), keep = {all, banks: all.filter(n => !NON_BANKS.includes(n)), others: all.filter(n => NON_BANKS.includes(n)), none: []}[pick]; all.forEach(n => keep.includes(n) ? hidden.delete(n) : hidden.add(n)); };
$("region").onchange = e => { region = e.target.value; applyPick(); render(); syncURL(); };
$("quick").onclick = e => {
  const b = e.target.closest("button"); if (!b) return;
  pick = b.dataset.q;
  const all = avail(), keep = {all: all, banks: all.filter(n => !NON_BANKS.includes(n)), others: all.filter(n => NON_BANKS.includes(n)), none: []}[b.dataset.q];
  all.forEach(n => keep.includes(n) ? hidden.delete(n) : hidden.add(n));
  const P = "Big-bank posted rate (Bank of Canada)";
  if (b.dataset.q === "none" || b.dataset.q === "all") hidden.add(P);  // Show all means every lender; the posted-rate line stays off until tapped
  save(); render();
};
$("chips").onclick = e => { const b = e.target.closest("button"); if (b) { const n = b.dataset.n; if (!n.startsWith("Big-bank")) pick = null; hidden.has(n) ? hidden.delete(n) : hidden.add(n); save(); render(); } };
let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(render, 150); });
// The pinned bar of time-range and quick-pick buttons: tell the CSS how tall it is, so the lender list pins just below it
if (window.ResizeObserver && $("hbar")) new ResizeObserver(([e]) => document.documentElement.style.setProperty("--hbar-h", Math.ceil(e.target.getBoundingClientRect().height) + "px")).observe($("hbar"));
loadHistory().then(h => { H = h && h.series ? h : {series: {}}; render(); });
})();
