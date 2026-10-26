// Pictures and worked examples for the crash course chapters. Each chapter page sets <body data-chapter="...">.
(function(){
if (typeof SITE_VERSION === "undefined" || SITE_VERSION !== "67") return;
const share = y => Math.round(y.int / (y.int + y.pr) * 100);
// A bar split into parts, with its labels in a key underneath (so nothing is squeezed or cut off inside the bar)
const bar = (parts, inner) => (parts = parts.filter(p => p.w > 0.05), `<div class="bar" role="img" aria-label="${esc(parts.map(p => p.t).join(", "))}">`
  + parts.map(p => `<div class="seg ${p.c}" style="width:${Math.max(0, p.w).toFixed(2)}%" title="${esc(p.t)}">${inner ? (p.n || "") : ""}</div>`).join("") + `</div>`);
const key = parts => `<div class="lg">${parts.map(p => `<span><i class="sq ${p.c}"></i>${p.t}</span>`).join("")}</div>`;
const CH = {
  basics(c){
    const parts = [{c: "a", w: c.downPct, t: `You pay (down payment): <b>${money(c.downAmt)}</b>`}, {c: "o", w: 100 - c.downPct, t: `The bank lends (mortgage): <b>${money(c.P0)}</b>`}];
    $("v").innerHTML = `<p class="vt"><span>Home price: <b>${money(c.price)}</b></span></p>` + bar(parts) + key(parts)
      + (c.insured ? `<p class="s">With less than 20% down, an insurance fee of ${money(c.premium)} is added to the mortgage.</p>` : "");
  },
  term(c){
    const segs = [];
    for (let a = 0, k = 1; a < c.years; a += c.term, k++) {
      const len = Math.min(c.term, c.years - a);
      segs.push({c: k === 1 ? "a" : "o", w: len / c.years * 100, n: k, t: `Term ${k}: ${len} years`});
    }
    $("v").innerHTML = `<p class="vt"><span>The whole trip (amortization): <b>${c.years} years</b>, in ${segs.length} terms of ${c.term} years</span></p>` + `<div class="bar terms">${segs.map(p => `<div class="seg ${p.c}" style="width:${p.w.toFixed(2)}%" title="${p.t}">${p.n}</div>`).join("")}</div>`
      + key([{c: "a", t: "Term 1: your rate is set"}, {c: "o", t: "Later terms: you pick a new rate each time"}]);
  },
  split(c){
    $("v").innerHTML = `<div class="yb">${c.yrs.map((y, k) => `<div class="yc" title="Year ${k + 1}: ${share(y)}% interest, ${100 - share(y)}% principal"><div class="i" style="height:${share(y)}%"></div><div class="p" style="height:${100 - share(y)}%"></div></div>`).join("")}</div>`
      + `<div class="ax"><span>Year 1</span><span>Year ${c.years}</span></div><div class="lg"><span><i class="sq ow"></i>Interest</span><span><i class="sq ac"></i>Principal</span></div>`
      + `<p class="m">In year 1, about ${share(c.yrs[0])}% of what you pay is interest. In year ${c.years}, it's about ${share(c.yrs[c.yrs.length - 1])}%.</p>`;
  },
  equity(c){
    const row = (label, owe) => { const eq = Math.min(100, Math.max(0, (c.price - owe) / c.price * 100));
      return `<div class="eq"><p class="vt"><b>${label}</b><span>Yours: <b>${money(Math.max(0, c.price - owe))}</b> · Still owed: <b>${money(Math.max(0, owe))}</b></span></p>${bar([{c: "a", w: eq, t: "Yours"}, {c: "o", w: 100 - eq, t: "Still owed"}])}</div>`; };
    $("v").innerHTML = row("Day 1", c.P) + row(`After ${c.term} years`, c.tb) + row(`After ${c.years} years`, 0) + key([{c: "a", t: "Yours (equity)"}, {c: "o", t: "Still owed to the bank"}]);
  },
  gds(c, best){
    const a = afford(loadAfford(), best), lim = (a && a.gdsLimit) || 39, lim2 = (a && a.tdsLimit) || 44;
    if (!a || a.none) { $("v").innerHTML = `<p class="m">Enter your income and down payment in the <a href="calculators.html">affordability calculator</a> to see your own ratios here.</p>`; return; }
    const hp = (a.qpay + a.other) / a.mi * 100, dp = a.debts / a.mi * 100, rest = Math.max(0, 100 - hp - dp);
    $("v").innerHTML = `<p class="s">Using your numbers from the <a href="calculators.html">affordability calculator</a>, with a gross monthly income of ${money(a.mi)}. If you borrowed the most you qualify for (${money(a.L)}), your income would be split like this:</p>`
      + (() => { const parts = [{c: "a", w: hp, t: `Home: <b>${hp.toFixed(1)}%</b>`}, {c: "o", w: dp, t: `Other debts: <b>${dp.toFixed(1)}%</b>`}, {c: "lo", w: rest, t: `Left over: <b>${rest.toFixed(1)}%</b>`}]; return bar(parts) + key(parts); })()
      + `<ol class="wk"><li>Gross monthly income = ${money(a.income)} ÷ 12 = <strong>${money(a.mi)}</strong></li>`
      + `<li>Mortgage payment at the stress-test rate (${a.qual.toFixed(2)}%) = <strong>${money(a.qpay)}</strong></li>`
      + `<li>GDS = (${money(a.qpay)} + ${money(a.tax)} tax + ${money(a.heat)} heat + ${money(a.condo * 0.5)} half of condo fees) ÷ ${money(a.mi)} = <strong>${a.gds.toFixed(1)}%</strong> (limit ${lim}%)</li>`
      + `<li>TDS = (${money(a.qpay + a.other)} + ${money(a.debts)} other debts) ÷ ${money(a.mi)} = <strong>${a.tds.toFixed(1)}%</strong> (limit ${lim2}%)</li></ol>`
      + `<p class="s">The tighter limit here is ${a.limit}, which is what caps the mortgage.</p>`;
  },
  math(c){
    const r = +(c.rate / 100).toFixed(6), iStr = c.i.toFixed(6), i1 = c.P * c.i, p1 = c.pay - i1;
    const whole = c.variable
      ? `${money(c.P)} × (${r}÷12) ÷ [1 − (1 + ${r}÷12)^(−12 × ${c.years})] = ${money(c.pay)}`
      : `${money(c.P)} × [(1 + ${r}÷2)^(1÷6) − 1] ÷ [1 − (1 + ${r}÷2)^(−2 × ${c.years})] = ${money(c.pay)}`;
    $("v").innerHTML = `<p><b>Try it with your numbers</b></p><ol class="wk">`
      + `<li>Mortgage amount: ${money(c.price)} − ${money(c.downAmt)}${c.insured ? ` + ${money(c.premium)} insurance` : ""} = <strong>${money(c.P)}</strong></li>`
      + `<li>Rate per month: ${c.variable ? `${c.rate}% ÷ 12` : `(1 + ${c.rate}% ÷ 2)^(1/6) − 1`} = <strong>${iStr}</strong> (${(c.i * 100).toFixed(4)}%)</li>`
      + `<li>Number of payments: ${c.years} × 12 = <strong>${c.n}</strong></li>`
      + `<li>Payment = ${money(c.P)} × ${iStr} ÷ (1 − (1 + ${iStr})^(−${c.n})) = <strong>${money(c.pay)}</strong></li>`
      + `<li>Month 1: interest ${money(i1)}, principal ${money(p1)}, new balance ${money(c.P - p1)}</li></ol>`
      + `<p><b>The whole formula, with your numbers</b></p><span class="fm">${whole}</span>`
      + `<p class="s">Prefer a spreadsheet? Try the <a href="offline-calculator.html">offline calculator</a>.</p>`;
  },
  offline(c){
    const r = +(c.rate / 100).toFixed(6);
    const rows = [
      ["Home price", Math.round(c.price), ""],
      ["Down payment", Math.round(c.downAmt), ""],
      ["Insurance premium rate", +(c.prem / 100).toFixed(4), "0 if you put down 20% or more. Otherwise 4%, 3.1% or 2.8% (type 4% or 0.04)"],
      ["Mortgage amount (with premium)", "=(B1-B2)*(1+B3)", ""],
      ["Annual interest rate", r, "Type 4.84% or 0.0484"],
      ["Rate type", c.variable ? "variable" : "fixed", "Type fixed or variable"],
      ["Amortization (years)", c.years, ""],
      ["Term (years)", c.term, ""],
      ["Rate per month", '=IF(B6="variable",B5/12,(1+B5/2)^(1/6)-1)', ""],
      ["Number of payments", "=B7*12", ""],
      ["Monthly payment", "=B4*B9/(1-(1+B9)^(-B10))", "The longhand formula"],
      ["Same payment using PMT", "=PMT(B9,B10,-B4)", "The spreadsheet shortcut"],
      ["Interest in month 1", "=B4*B9", ""],
      ["Principal in month 1", "=B11-B13", ""],
      ["Balance at end of term", "=B4*(1+B9)^(B8*12)-B11*((1+B9)^(B8*12)-1)/B9", "What you'd renew"],
      ["Interest over the term", "=B11*B8*12-(B4-B15)", ""],
      ["Interest over the full amortization", "=B11*B10-B4", "If the rate never changed"]
    ];
    $("sheet").value = rows.map(x => x.join("\t")).join("\n");
    $("copy").onclick = () => {
      const done = () => { $("copied").hidden = false; setTimeout(() => { $("copied").hidden = true; }, 2000); };
      const fallback = () => { $("sheet").select(); try { document.execCommand("copy"); done(); } catch (e) {} };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText($("sheet").value).then(done, fallback); else fallback();
    };
  }
};
function go(best){
  const c = calc(loadState(), best) || calc(Object.assign({}, DEF, {rate: "custom", custom: 5}), {});
  if ($("using")) $("using").textContent = `${money(c.price)} home, ${money(c.downAmt)} down, ${c.years}-year amortization, ${c.term}-year term at ${pct(c.rate)} ${c.variable ? "variable" : "fixed"}`;
  const f = CH[document.body.dataset.chapter];
  if (f) f(c, best);
}
loadRates().then(d => go(bestRates(groupLenders(d)))).catch(() => go({}));
})();
