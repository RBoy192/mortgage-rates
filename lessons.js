// Today's numbers and small calculators for the Rates Explained: GICs and Savings chapters. Each page sets <body data-chapter="...">.
(function(){
if (typeof SITE_VERSION === "undefined" || SITE_VERSION !== "77") return;
if (location.hash) { try { const d = document.querySelector("details" + location.hash); if (d) { d.open = true; d.scrollIntoView(); } } catch (e) {} }  // FAQ: open the question in the address
const v = $("v"); if (!v) return;
const chap = document.body.dataset.chapter;
const m2 = x => x.toLocaleString("en-CA", {style: "currency", currency: "CAD", minimumFractionDigits: 2, maximumFractionDigits: 2});
const best = (ls, p) => { let b = null; ls.forEach(l => { const c = l.cells[p]; if (c && !c.stale && (!b || c.rate > b.rate)) b = {rate: c.rate, names: [l.name]}; else if (c && !c.stale && b && c.rate === b.rate) b.names.push(l.name); }); return b; };
const who = b => b.names.map(esc).join(", ");
// bars: [{label, rate, sub}] scaled to the highest
const bars = rows => { const hi = Math.max(...rows.map(r => r.rate || 0)) || 1;
  return `<div class="lbars">` + rows.map(r => `<div class="lbar"><span class="lbl">${esc(r.label)}</span><span class="trk"><i style="width:${r.rate ? (r.rate / hi * 100).toFixed(1) : 0}%"></i></span><b>${r.rate ? pct(r.rate) : "—"}</b><span class="s">${r.sub || ""}</span></div>`).join("") + `</div>`; };
const field = (id, label, val, unit, pre) => `<div class="pf"><label for="${id}">${label}</label><span class="dl">${pre ? `<span aria-hidden="true">${pre}</span>` : ""}<input id="${id}" type="text" inputmode="decimal"${pre === "$" ? ' data-money="1"' : ""} autocomplete="off" value="${val}">${unit ? `<span aria-hidden="true">${unit}</span>` : ""}</span></div>`;
const num = id => parseFloat(String($(id).value).replace(/[^0-9.]/g, "")) || 0;

const CH = {
  "g-term"(ls){
    v.innerHTML = bars(GIC_COLUMNS.map(([, p], i) => { const b = best(ls, p); return {label: `${i + 1} year`, rate: b && b.rate, sub: b ? who(b) : ""}; }));
  },
  "g-redeem"(ls){
    const a = best(ls, "1-year GIC"), b = best(ls, "1-year redeemable GIC");
    v.innerHTML = bars([{label: "Non-redeemable", rate: a && a.rate, sub: a ? `${who(a)}: about ${money(10000 * a.rate / 100)} on $10,000` : ""},
                        {label: "Redeemable", rate: b && b.rate, sub: b ? `${who(b)}: about ${money(10000 * b.rate / 100)} on $10,000` : ""}]);
  },
  "g-ladder"(ls){
    const rows = GIC_COLUMNS.map(([, p], i) => { const b = best(ls, p); return {y: i + 1, b}; });
    if (rows.some(r => !r.b)) { v.innerHTML = `<p class="m">Today's rates aren't all available right now.</p>`; return; }
    const first = rows.reduce((s, r) => s + 2000 * r.b.rate / 100, 0), avg = rows.reduce((s, r) => s + r.b.rate, 0) / 5;
    v.innerHTML = bars(rows.map(r => ({label: `$2,000 for ${r.y} yr`, rate: r.b.rate, sub: `${who(r.b)}: ${m2(2000 * r.b.rate / 100)} a year`})))
      + `<p class="m">Together: about <b>${money(first)}</b> of interest in the first year, an average of ${pct(+avg.toFixed(3))}. The 5-year rate alone today: ${pct(rows[4].b.rate)}.</p>`;
  },
  "g-interest"(ls){ gicCalc(ls, 1000, 4, 3); },
  "g-math"(ls){ const b = best(ls, "5-year GIC"); gicCalc(ls, 5000, b ? b.rate : 3.5, 5); },
  "s-interest"(ls){ const b = best(ls, SAVINGS); savCalc(10000, b ? b.rate : 2); },
  "s-math"(ls){ const b = best(ls, SAVINGS); savCalc(8000, b ? b.rate : 1.5); },
  "s-promo"(ls){
    let p = null; ls.forEach(l => { const c = l.cells[SAVINGS_PROMO], r = l.cells[SAVINGS]; if (c && !c.stale && r && (!p || c.rate > p.c.rate)) p = {l, c, r}; });
    const b = best(ls, SAVINGS);
    if (!p || !b) { v.innerHTML = `<p class="m">No promotional offers are listed right now.</p>`; return; }
    const promoYear = 10000 * p.c.rate / 100 * 3 / 12 + 10000 * p.r.rate / 100 * 9 / 12, regYear = 10000 * b.rate / 100;
    v.innerHTML = `<p class="m">If ${esc(p.l.name)}'s ${pct(p.c.rate)} offer lasted 3 months, then its regular ${pct(p.r.rate)} applied (offers vary: check the length and conditions):</p>`
      + bars([{label: "Promotion, then regular", rate: promoYear / 100, sub: `about ${money(promoYear)} in a year`},
              {label: "Highest regular rate", rate: regYear / 100, sub: `${who(b)} at ${pct(b.rate)}: about ${money(regYear)} in a year`}]).replace(/<b>[^<]*%<\/b>/g, "<b></b>");
  }
};

function gicCalc(ls, amt, rate, yrs){
  v.innerHTML = `<div class="payform lform">${field("la", "Amount", amt.toLocaleString("en-CA"), "", "$")}${field("lr", "Rate per year", rate, "%")}${field("ly", "Years", yrs, "")}</div><div id="lo"></div>`;
  const go = () => {
    const P = num("la"), r = num("lr") / 100, n = Math.min(10, Math.max(1, Math.round(num("ly"))));
    if (!(P > 0) || !(r > 0)) { $("lo").innerHTML = `<p class="m">Enter an amount and a rate.</p>`; return; }
    let rows = "", bal = P;
    for (let y = 1; y <= n; y++) { const i = bal * r; bal += i; rows += `<tr><td>Year ${y}</td><td>${m2(P * r)}</td><td>${m2(i)}</td><td>${m2(bal)}</td></tr>`; }
    $("lo").innerHTML = `<div class="c lres"><div class="k"><em>Interest paid out each year</em><b>${m2(P * r * n)}</b>${m2(P * r)} a year for ${n} year${n > 1 ? "s" : ""}</div>`
      + `<div class="k"><em>Compound interest, paid at the end</em><b>${m2(bal - P)}</b>You get back ${m2(bal)}</div></div>`
      + `<div class="t" tabindex="0" role="region" aria-label="Year by year"><table class="ltab"><thead><tr><th scope="col">Year</th><th scope="col">Paid out</th><th scope="col">Compound: interest that year</th><th scope="col">Compound: balance</th></tr></thead><tbody>${rows}</tbody></table></div>`
      + `<p class="s">Compound: ${m2(P)} × (1 + ${+(r).toFixed(5)})<sup>${n}</sup> = ${m2(bal)}</p>`;
  };
  ["la", "lr", "ly"].forEach(id => $(id).addEventListener("input", go)); go();
}
function savCalc(amt, rate){
  v.innerHTML = `<div class="payform lform">${field("la", "Balance", amt.toLocaleString("en-CA"), "", "$")}${field("lr", "Rate per year", rate, "%")}</div><div id="lo"></div>`;
  const go = () => {
    const P = num("la"), r = num("lr") / 100;
    if (!(P > 0) || !(r > 0)) { $("lo").innerHTML = `<p class="m">Enter a balance and a rate.</p>`; return; }
    const day = P * r / 365, month = day * 30;
    let bal = P; for (let mth = 0; mth < 12; mth++) bal += bal * r / 365 * (365 / 12);
    $("lo").innerHTML = `<div class="c lres"><div class="k"><em>Each day</em><b>${m2(day)}</b>${m2(P)} × ${+(r).toFixed(5)} ÷ 365</div>`
      + `<div class="k"><em>A 30-day month</em><b>${m2(month)}</b>The day's interest × 30</div>`
      + `<div class="k"><em>A year</em><b>${m2(bal - P)}</b>With each month's interest added on</div></div>`
      + `<p class="s">Assumes your balance and the rate stay the same all year. Savings rates can change at any time.</p>`;
  };
  ["la", "lr"].forEach(id => $(id).addEventListener("input", go)); go();
}
const f = CH[chap];
if (f) loadRates().then(d => f(groupLenders(d))).catch(() => f([]));
})();
