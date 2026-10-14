// Shared by every page: helpers, header, light/dark switch, loading rates, and the mortgage maths.
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pct = x => (Math.round(x*1000) % 10 ? x.toFixed(3) : x.toFixed(2)) + "%";
const fmt = iso => new Date(iso).toLocaleString([], {dateStyle:"medium", timeStyle:"short"});
const money = x => Math.round(x).toLocaleString("en-CA", {style:"currency", currency:"CAD", maximumFractionDigits:0});
const EXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg><span class="vh"> (opens in a new tab)</span>';

// Columns across the top of the rates table: [heading shown, product name as it appears in rates.json]
const COLUMNS = [["3 yr fixed", "3-year fixed"], ["5 yr var", "5-year variable"], ["5 yr fixed", "5-year fixed"]];
const rateOf = (l, p) => l.cells[p] ? l.cells[p].rate : Infinity;

// Header with links to each page, plus the light / dark switch (light by default; the visitor's choice is remembered)
(function(){
  const page = document.body.dataset.page, el = $("site-header");
  const links = [["estimator", "estimator.html", "Payment estimator"], ["crash", "crash-course.html", "Crash course"]];
  el.className = "n";
  el.innerHTML = `<div class="nw"><a class="brand" href="index.html">What's the rate?</a>`
    + links.map(([k, u, t]) => `<a class="nl" href="${u}"${k === page ? ' aria-current="page"' : ""}>${t}</a>`).join("") + `</div>`
    + `<div class="r">${page === "rates" ? '<span class="pill">Updated hourly</span>' : ""}<button class="mode" id="mode" type="button">`
    + `<svg class="mo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>`
    + `<svg class="su" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`
    + `<span id="ml">Dark mode</span></button></div>`;
  const root = document.documentElement;
  const show = () => { $("ml").textContent = root.dataset.theme === "dark" ? "Light mode" : "Dark mode"; };
  $("mode").onclick = () => {
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem("theme", root.dataset.theme); } catch (e) {}
    show();
  };
  show();
})();

// Rates
function loadRates(){ return fetch("rates.json?t=" + Date.now(), {cache:"no-store"}).then(r => r.json()); }
function groupLenders(d){
  const by = {};
  d.rates.forEach(r => {
    const l = by[r.institution] = by[r.institution] || {name: r.institution, source: r.source, cells: {}};
    l.cells[r.product] = r;
  });
  return Object.values(by);
}
function bestRates(lenders){
  const b = {};
  COLUMNS.forEach(([, p]) => {
    const r = Math.min(...lenders.map(l => rateOf(l, p)));
    if (r !== Infinity) b[p] = {rate: r, names: lenders.filter(l => rateOf(l, p) === r).map(l => l.name).join(", ")};
  });
  return b;
}

// Payment estimator maths (shared with the crash course so both use the same numbers)
const DEF = {price: 500000, down: 20, mode: "pct", years: 25, rate: "5-year fixed", custom: 5, term: 5};  // typical starting values
function loadState(){ try { return Object.assign({}, DEF, JSON.parse(localStorage.getItem("estimator") || "{}")); } catch (e) { return Object.assign({}, DEF); } }
function saveState(s){ try { localStorage.setItem("estimator", JSON.stringify(s)); } catch (e) {} }
// Minimum down payment: 5% of the first $500,000, 10% of the part up to $1.5 million, 20% at $1.5 million and above
const minDown = p => p >= 1.5e6 ? p * 0.2 : p <= 5e5 ? p * 0.05 : 25000 + (p - 5e5) * 0.1;

function calc(s, best){
  const price = +s.price, down = +s.down, downAmt = s.mode === "amt" ? down : price * down / 100;
  const fromTable = s.rate !== "custom" && !!best[s.rate];
  const rate = fromTable ? best[s.rate].rate : +s.custom;
  if (!(price > 0) || !(downAmt >= 0 && downAmt < price) || !(rate > 0 && rate < 30)) return null;
  const years = +s.years, variable = fromTable && s.rate.indexOf("variable") > -1;
  const term = Math.min(fromTable ? parseInt(s.rate, 10) : (+s.term || 5), years);
  const downPct = downAmt / price * 100, insured = downPct < 19.999;
  const P0 = price - downAmt, ltv = P0 / price * 100;
  const prem = !insured ? 0 : (ltv > 90 ? 4 : ltv > 85 ? 3.1 : 2.8) + (years > 25 ? 0.2 : 0);
  const premium = P0 * prem / 100, P = P0 + premium, n = years * 12;
  const i = variable ? rate / 1200 : Math.pow(1 + rate / 200, 1 / 6) - 1;
  const pay = P * i / (1 - Math.pow(1 + i, -n));
  let bal = P, iy = 0, py = 0;
  const yrs = [];
  for (let m = 1; m <= n; m++) {
    const int = bal * i, pr = pay - int;
    bal -= pr; iy += int; py += pr;
    if (m % 12 === 0) { yrs.push({int: iy, pr: py, bal: Math.max(bal, 0)}); iy = py = 0; }
  }
  const tm = yrs.slice(0, term), sum = k => tm.reduce((a, y) => a + y[k], 0);
  return {price, downAmt, downPct, insured, prem, premium, P0, P, years, rate, variable, fromTable, term, n, i, pay, yrs,
    ti: sum("int"), tp: sum("pr"), tb: tm[tm.length - 1].bal, total: pay * n - P,
    min: minDown(price), belowMin: downAmt < minDown(price) - 1, overCap: insured && price >= 1.5e6};
}
