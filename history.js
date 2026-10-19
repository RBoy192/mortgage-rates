// Rate history charts. Data: history.json (one value per lender, product and day), written by the hourly update.
(function(){
if (typeof SITE_VERSION === "undefined") return;
const RANGES = [["1M", 31], ["3M", 92], ["6M", 183], ["1Y", 366], ["All", Infinity]];
let H = {series: {}}, range = "All", hidden = new Set();
try { range = localStorage.getItem("hist-range") || "All"; hidden = new Set(JSON.parse(localStorage.getItem("hist-hidden") || "[]")); } catch (e) {}
const save = () => { try { localStorage.setItem("hist-range", range); localStorage.setItem("hist-hidden", JSON.stringify([...hidden])); } catch (e) {} };
const day = iso => new Date(iso + "T12:00:00").getTime();
const short = t => new Date(t).toLocaleDateString([], {month: "short", day: "numeric"});
const long = t => new Date(t).toLocaleDateString([], {dateStyle: "medium"});
const valueAt = (pts, t) => { let v = null; for (const [d, r] of pts) { if (day(d) <= t) v = r; else break; } return v; };

function lenders(){
  const names = new Set(Object.keys(H.series).filter(k => k.includes("|") && !k.startsWith("posted|")).map(k => k.split("|")[0]));
  return [...names].sort((a, b) => (LENDER_ORDER.indexOf(a) + 1 || 99) - (LENDER_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b));
}

function controls(){
  $("range").innerHTML = RANGES.map(([k]) => `<button type="button" aria-pressed="${k === range}" data-r="${k}">${k}</button>`).join("");
  const P = "Big-bank posted rate (Bank of Canada)";
  $("chips").innerHTML = (Object.keys(H.series).some(k => k.startsWith("posted|")) ? `<button type="button" class="chip" aria-pressed="${!hidden.has(P)}" data-n="${P}"><i style="background:var(--mu)"></i>Big-bank posted rate</button>` : "") + lenders().map(n => `<button type="button" class="chip" aria-pressed="${!hidden.has(n)}" data-n="${esc(n)}"><i style="background:${seriesVar(n)}"></i>${esc(n)}</button>`).join("");
}

function chart(el, title, series){
  const end = day(todayISO()), all = series.flatMap(s => s.points.map(p => day(p[0])));
  if (!all.length) { el.innerHTML = `<h2 class="h3">${title}</h2><p class="empty">No history yet. It fills in as the site saves each day's rates.</p>`; return; }
  const span = RANGES.find(r => r[0] === range)[1];
  let start = Math.max(Math.min(...all), end - span * 864e5);
  if (start >= end) start = end - 7 * 864e5;
  const vis = series.map(s => Object.assign({}, s, {v: s.points.filter(p => day(p[0]) >= start), before: valueAt(s.points, start)}))
    .filter(s => s.v.length || s.before != null);
  const vals = vis.flatMap(s => [...s.v.map(p => p[1]), ...(s.before != null ? [s.before] : [])]);
  if (!vals.length) { el.innerHTML = `<h2 class="h3">${title}</h2><p class="empty">No rates in this time range.</p>`; return; }
  const vmin = Math.min(...vals), vmax = Math.max(...vals);
  const stepY = [0.05, 0.1, 0.25, 0.5, 1, 2].find(s => Math.ceil((vmax + 0.05) / s) - Math.floor((vmin - 0.05) / s) <= 5) || 2;
  const lo = Math.floor((vmin - 0.05) / stepY) * stepY, hi = Math.ceil((vmax + 0.05) / stepY) * stepY;
  const W = Math.max(300, el.clientWidth - 48), Ht = 240, m = {l: 48, r: 12, t: 10, b: 26}, iw = W - m.l - m.r, ih = Ht - m.t - m.b;
  const x = t => m.l + (t - start) / (end - start) * iw, y = r => m.t + (hi - r) / (hi - lo) * ih;
  const ticks = []; for (let v = lo; v <= hi + 1e-9; v += stepY) ticks.push(v);
  const xt = [0, 1, 2, 3].map(k => start + (end - start) * k / 3);
  const path = s => {
    const pts = (s.before != null && (!s.v.length || day(s.v[0][0]) > start) ? [[start, s.before]] : []).concat(s.v.map(p => [day(p[0]), p[1]]));
    let d = "";
    pts.forEach(([t, r], k) => { d += k ? `H${x(t).toFixed(1)}V${y(r).toFixed(1)}` : `M${x(t).toFixed(1)},${y(r).toFixed(1)}`; });
    return d + `H${x(end).toFixed(1)}`;
  };
  const lastDots = vis.map(s => { const r = s.v.length ? s.v[s.v.length - 1][1] : s.before; return `<circle cx="${x(end).toFixed(1)}" cy="${y(r).toFixed(1)}" r="4" fill="${s.color}" stroke="var(--card)" stroke-width="2"/>`; }).join("");
  const dates = [...new Set(vis.flatMap(s => s.v.map(p => p[0])))].sort().reverse();
  el.innerHTML = `<h2 class="h3">${title}</h2>`
    + `<svg viewBox="0 0 ${W} ${Ht}" width="${W}" height="${Ht}" role="img" aria-label="${esc(title)} rates over time, ${long(start)} to ${long(end)}">`
    + `<g class="ax">${ticks.map(v => `<line class="gl" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${v.toFixed(2)}%</text>`).join("")}`
    + `${xt.map((t, k) => `<text x="${x(t)}" y="${Ht - 6}" text-anchor="${k === 0 ? "start" : k === 3 ? "end" : "middle"}">${short(t)}</text>`).join("")}</g>`
    + vis.map(s => `<path d="${path(s)}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"${s.dash ? ' stroke-dasharray="6 4"' : ""}/>`).join("")
    + lastDots + `<line class="cross" y1="${m.t}" y2="${m.t + ih}" x1="0" x2="0" visibility="hidden"/>`
    + `<rect x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent" style="cursor:crosshair"/></svg>`
    + `<div class="tip" hidden></div>`
    + `<div class="lgd">${vis.map(s => `<span><i style="${s.dash ? `background:repeating-linear-gradient(90deg,${s.color} 0 5px,transparent 5px 8px)` : `background:${s.color}`}"></i>${esc(s.name)}</span>`).join("")}</div>`
    + `<details class="tv"><summary>Show as a table</summary><div class="t" tabindex="0" role="region" aria-label="${esc(title)} rates by day"><table><thead><tr><th>Date</th>${vis.map(s => `<th>${esc(s.name)}</th>`).join("")}</tr></thead><tbody>`
    + dates.map(d => `<tr><td>${dstr(d)}</td>${vis.map(s => { const p = s.v.find(q => q[0] === d); return `<td>${p ? pct(p[1]) : "—"}</td>`; }).join("")}</tr>`).join("")
    + `</tbody></table></div><p class="s">Only days when the rate was saved are listed.</p></details>`;
  const svg = el.querySelector("svg"), tip = el.querySelector(".tip"), cross = el.querySelector(".cross"), hit = el.querySelector("rect");
  const move = e => {
    const r = svg.getBoundingClientRect(), sx = (e.clientX - r.left) * W / r.width;
    const t = Math.min(end, Math.max(start, start + (sx - m.l) / iw * (end - start)));
    const rows = vis.map(s => [s, valueAt(s.points, t)]).filter(([, v]) => v != null).sort((a, b) => a[1] - b[1]);
    cross.setAttribute("x1", x(t)); cross.setAttribute("x2", x(t)); cross.setAttribute("visibility", "visible");
    tip.innerHTML = `<b>${long(t)}</b>` + rows.map(([s, v]) => `<div><span><i class="sq" style="background:${s.color}"></i>${esc(s.name)}</span><span>${pct(v)}</span></div>`).join("");
    tip.hidden = false;
    const left = (x(t) / W) * r.width + svg.offsetLeft;
    tip.style.left = Math.min(Math.max(0, left + 12), el.clientWidth - tip.offsetWidth - 8) + "px";
    tip.style.top = (svg.offsetTop + 8) + "px";
  };
  const leave = () => { tip.hidden = true; cross.setAttribute("visibility", "hidden"); };
  hit.addEventListener("pointermove", move); hit.addEventListener("pointerdown", move); hit.addEventListener("pointerleave", leave);
}

// Other pages (rate-type and lender pages) reuse the chart: histChart(element, title, series)
window.histChart = chart;
window.histRange = r => { if (r) range = r; return range; };
if (!$("range")) return;

function render(){
  controls();
  const ls = lenders().filter(n => !hidden.has(n));
  // The Bank of Canada publishes the big banks' typical posted rate for fixed terms; it's drawn dashed for context.
  const POSTED = "Big-bank posted rate (Bank of Canada)";
  COLUMNS.forEach(([, p], k) => chart($("ch" + k), p.charAt(0).toUpperCase() + p.slice(1),
    ls.filter(n => H.series[n + "|" + p]).map(n => ({name: n, color: seriesVar(n), points: H.series[n + "|" + p]}))
      .concat(H.series["posted|" + p] && !hidden.has(POSTED) ? [{name: POSTED, color: "var(--mu)", dash: true, points: H.series["posted|" + p]}] : [])));
  chart($("chb"), "Bank of Canada policy rate and prime rate", [["policy_rate", "BoC policy rate", "var(--s1)"], ["prime_rate", "Prime rate", "var(--s2)"]]
    .filter(([k]) => H.series[k]).map(([k, name, color]) => ({name, color, points: H.series[k]})));
  const lenderFirst = Object.entries(H.series).filter(([k]) => k.includes("|") && !k.startsWith("posted|")).flatMap(([, s]) => s.map(p => p[0])).sort()[0];
  $("since").textContent = (H.boc_history_from ? `Bank of Canada figures go back to ${dstr(H.boc_history_from)}. ` : "")
    + (lenderFirst ? `Each lender's own rates start on ${dstr(lenderFirst)}, when this site began saving them once a day; lenders don't publish their past rates.` : "");
}

$("range").onclick = e => { const b = e.target.closest("button"); if (b) { range = b.dataset.r; save(); render(); } };
$("chips").onclick = e => { const b = e.target.closest("button"); if (b) { const n = b.dataset.n; hidden.has(n) ? hidden.delete(n) : hidden.add(n); save(); render(); } };
let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(render, 150); });
loadHistory().then(h => { H = h && h.series ? h : {series: {}}; render(); });
})();
