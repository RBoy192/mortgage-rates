// The newer calculators. Each page sets <body data-calc="..."> and this file builds its form, sliders, results and sources.
(function(){
if (typeof SITE_VERSION === "undefined") return;

// ---------- small helpers ----------
const INF = Infinity;
const brackets = (x, list) => { let tax = 0, lo = 0; for (const [hi, r] of list) { if (x > lo) tax += (Math.min(x, hi) - lo) * r / 100; lo = hi; } return tax; };
const p2 = x => x.toFixed(2) + "%";
const li = s => `<li>${s}</li>`;
function rateInfo(v, best, k = "rate", ck = "custom"){
  if (v[k] !== "custom" && best[v[k]]) return {rate: best[v[k]].rate, variable: v[k].indexOf("variable") > -1, label: `the lowest ${v[k]} rate (${pct(best[v[k]].rate)})`};
  return {rate: +v[ck], variable: false, label: `your rate of ${pct(+v[ck] || 0)}`};
}
const F = {
  money: (k, label, def, slider, help, extra) => Object.assign({k, label, type: "money", def, slider, help}, extra),
  num: (k, label, def, step, slider, help, extra) => Object.assign({k, label, type: "num", def, step, slider, help}, extra),
  rate: (k = "rate", def = "5-year fixed", label = "Interest rate") => ({k, label, type: "rate", def}),
  custom: (k = "custom", rk = "rate", def = 5, label = "Your rate (%)") => ({k, label, type: "num", def, step: 0.01, slider: "0,12,0.05", show: v => v[rk] === "custom"}),
  years: (def = 25, opts = [10, 15, 20, 25, 30], label = "Amortization (years)", help) => ({k: "years", label, type: "select", def, options: opts.map(x => [x, x]), help, numeric: true})
};

// ---------- the engine ----------
function makeCalc(cfg){
  const KEY = "calc-" + cfg.key, form = $("form"), groups = {};
  let best = {}, v = {};
  const fid = k => "c_" + k;
  const defOf = f => f.type === "rate" ? (best[f.def] ? f.def : "custom") : f.def;
  const defaults = () => Object.fromEntries(cfg.fields.map(f => [f.k, defOf(f)]));
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) {}
  v = Object.assign(Object.fromEntries(cfg.fields.map(f => [f.k, f.def])), saved);  // rate fields settle once the rates load

  // build the form
  cfg.fields.forEach(f => {
    let html;
    const df = `<span class="df" data-f="${f.k}">default</span>`, help = f.help ? `<span class="s">${f.help}</span>` : "";
    if (f.type === "check") html = `<label class="ck"><input id="${fid(f.k)}" type="checkbox">${f.label}</label>`;
    else if (f.type === "select" || f.type === "rate") html = `<label>${f.label} ${df}<select id="${fid(f.k)}">${(f.options || []).map(([val, t]) => `<option value="${esc(val)}">${esc(t)}</option>`).join("")}</select>${help}</label>`;
    else if (f.type === "money") html = `<label>${f.label} ${df}<input id="${fid(f.k)}" type="text" inputmode="numeric" data-money="1" autocomplete="off">${help}</label>`;
    else html = `<label>${f.label} ${df}<input id="${fid(f.k)}" type="number" inputmode="decimal" step="${f.step || 1}" autocomplete="off">${help}</label>`;
    let target = form;
    if (f.group) {
      if (!groups[f.group]) { form.insertAdjacentHTML("beforeend", `<details class="as"><summary>${f.group}</summary><div class="fl"></div></details>`); groups[f.group] = form.lastElementChild.querySelector(".fl"); }
      target = groups[f.group];
    }
    target.insertAdjacentHTML("beforeend", html);
    const el = $(fid(f.k));
    if (f.slider) { el.dataset.slider = f.slider; addSlider(el); }
  });

  const write = () => cfg.fields.forEach(f => {
    const el = $(fid(f.k));
    if (f.type === "check") el.checked = !!v[f.k];
    else if (f.type === "select" || f.type === "rate") el.value = v[f.k];
    else setv(fid(f.k), v[f.k]);
  });
  const read = () => cfg.fields.forEach(f => {
    const el = $(fid(f.k));
    v[f.k] = f.type === "check" ? el.checked : f.type === "rate" ? el.value : f.type === "select" ? (f.numeric ? +el.value : el.value) : val(fid(f.k));
  });

  function update(){
    read();
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {}
    cfg.fields.forEach(f => {
      const lab = $(fid(f.k)).closest("label");
      lab.hidden = !!(f.show && !f.show(v));
      const d = lab.querySelector(".df");
      if (d) d.hidden = v[f.k] !== defOf(f);
    });
    let r = null;
    try { r = cfg.compute(v, best); } catch (e) { r = null; console.error(e); }
    const msgs = r && r.msgs || [];
    $("msgs").innerHTML = msgs.map(([k, t]) => `<p class="msg ${k}">${t}</p>`).join("");
    if (!r) { $("out").innerHTML = `<span class="m">${cfg.bigLabel || "Result"}</span><b>—</b><ul id="res"><li>${cfg.empty || "Fill in the numbers to see a result."}</li></ul>`; return; }
    $("out").innerHTML = `<span class="m">${r.label}</span><b>${r.big}</b>${r.sub ? `<span class="big-sub">${r.sub}</span>` : ""}`
      + (r.items && r.items.length ? `<ul id="res">${r.items.map(li).join("")}</ul>` : "") + (r.table || "");
    if (r.src && $("src")) $("src").innerHTML = srcLinks(r.src);
  }
  function ready(b){
    best = b || {};
    cfg.fields.filter(f => f.type === "rate").forEach(f => {
      $(fid(f.k)).innerHTML = Object.keys(best).map(k => `<option value="${esc(k)}">Lowest ${esc(k)}: ${pct(best[k].rate)} (${esc(best[k].names)})</option>`).join("") + '<option value="custom">My own rate</option>';
      if (!(v[f.k] in best) && v[f.k] !== "custom") v[f.k] = defOf(f);
    });
    write(); update();
  }
  form.addEventListener("input", update);
  form.addEventListener("change", update);
  $("reset").onclick = () => { v = defaults(); write(); update(); };
  if (cfg.src && $("src")) { $("src").className = "f src"; $("src").innerHTML = srcLinks(cfg.src); }
  loadRates().then(d => ready(bestRates(groupLenders(d)))).catch(() => ready({}));
}

// ---------- the calculators ----------
const QUAL = "Qualifying rules (CMHC defaults, editable)";
const CALCS = {

  stress: {
    key: "stress", bigLabel: "Stress test", src: ["gds"],
    fields: [
      F.money("amount", "Mortgage amount", 400000, "50000,2000000,5000", "Include any mortgage insurance premium."),
      F.rate(), F.custom(), F.years(25, [15, 20, 25, 30]),
      F.money("income", "Household income before tax, per year", 100000, "20000,500000,1000"),
      F.money("debts", "Monthly debt payments", 500, "0,5000,25", "Car loans, credit cards, lines of credit, student loans. Use the minimum payments."),
      F.money("tax", "Property tax per month", 300, "0,2000,10", "", {group: "Assumptions you can change"}),
      F.money("heat", "Heating per month", 120, "0,500,5", "", {group: "Assumptions you can change"}),
      F.money("condo", "Condo fees per month", 0, "0,1500,10", "Lenders count half of condo fees.", {group: "Assumptions you can change"}),
      F.num("gds", "GDS limit (%)", 39, 0.5, "20,50,0.5", "", {group: QUAL}),
      F.num("tds", "TDS limit (%)", 44, 0.5, "25,55,0.5", "", {group: QUAL}),
      F.num("stress", "Stress test: add to your rate (%)", 2, 0.25, "0,5,0.25", "", {group: QUAL}),
      F.num("floor", "Stress test: minimum qualifying rate (%)", 5.25, 0.25, "3,8,0.25", "", {group: QUAL})
    ],
    compute(v, best){
      const R = rateInfo(v, best);
      if (!(v.amount > 0 && v.income > 0 && R.rate > 0 && v.gds > 0 && v.tds > 0)) return null;
      const n = v.years * 12, qual = Math.max(R.rate + v.stress, v.floor), qi = perPeriod(qual, R.variable), i = perPeriod(R.rate, R.variable);
      const qpay = pmt(v.amount, qi, n), mi = v.income / 12, other = v.tax + v.heat + v.condo / 2;
      const gds = (qpay + other) / mi * 100, tds = (qpay + other + v.debts) / mi * 100;
      const okG = gds <= v.gds + 1e-9, okT = tds <= v.tds + 1e-9, pass = okG && okT;
      const need = Math.max((qpay + other) / (v.gds / 100), (qpay + other + v.debts) / (v.tds / 100)) * 12;
      const maxPay = Math.min(v.gds / 100 * mi - other, v.tds / 100 * mi - other - v.debts);
      const maxLoan = maxPay > 0 ? maxPay * (1 - Math.pow(1 + qi, -n)) / qi : 0;
      return {
        label: "At the stress-test rate, you would", big: pass ? "Pass ✓" : "Not pass ✗", sub: `GDS ${gds.toFixed(1)}% (limit ${v.gds}%) · TDS ${tds.toFixed(1)}% (limit ${v.tds}%)`,
        items: [
          `Stress-test rate: <strong>${qual.toFixed(2)}%</strong>, the greater of ${R.label} plus ${v.stress}% or ${v.floor}%.`,
          `Payment lenders test you at: <strong>${money(qpay)}</strong> a month. At your actual rate it would be ${money(pmt(v.amount, i, n))}.`,
          `GDS ${gds.toFixed(1)}%: ${okG ? "within" : "<strong>over</strong>"} the ${v.gds}% limit. TDS ${tds.toFixed(1)}%: ${okT ? "within" : "<strong>over</strong>"} the ${v.tds}% limit.`,
          `Income needed to pass: <strong>${money(need)}</strong> a year.`,
          `Largest mortgage you'd pass with on this income: <strong>${money(maxLoan)}</strong>.`
        ]
      };
    }
  },

  down: {
    key: "down", bigLabel: "Minimum down payment", src: ["down", "grid", "dof"],
    fields: [
      F.money("price", "Home price", 500000, "100000,2500000,5000"),
      F.rate(), F.custom(),
      F.years(25, [25, 30], "Amortization (years)", "30 years on an insured mortgage is for first-time buyers and buyers of new builds.")
    ],
    compute(v, best){
      const R = rateInfo(v, best), P = v.price;
      if (!(P > 0 && R.rate > 0)) return null;
      const min = minDown(P), i = perPeriod(R.rate, R.variable), n = v.years * 12;
      const opts = P >= 1.5e6 ? [P * 0.2] : [min, ...[0.1, 0.15, 0.2].map(x => P * x).filter(d => d > min + 1)];
      const rows = opts.map(D => { const prem = premPct(P, D, v.years), premium = (P - D) * prem / 100, L = P - D + premium; return {D, prem, premium, L, pay: pmt(L, i, n)}; });
      const msgs = [];
      if (P >= 1.5e6) msgs.push(["w", "Mortgage insurance isn't available for homes of $1.5 million or more, so at least 20% down is required."]);
      if (v.years > 25) msgs.push(["", "A 30-year amortization adds 0.20% to the insurance premium (included above). With 20% or more down, your lender sets the maximum amortization."]);
      msgs.push(["", "Some provinces charge sales tax on the insurance premium, and it can't be added to your mortgage. The <a href=\"calc-closing.html\">closing costs calculator</a> includes it."]);
      return {
        label: "Minimum down payment", big: money(min), sub: `${(min / P * 100).toFixed(2)}% of the price`,
        items: [P >= 1.5e6 ? "At $1.5 million and above, the minimum is 20% of the price."
          : `5% of the first $500,000${P > 5e5 ? ` plus 10% of the ${money(P - 5e5)} above it` : ""}.`, `Monthly payments use ${R.label} over ${v.years} years.`],
        table: `<table class="cmpt"><thead><tr><th>Down payment</th><th>Insurance premium</th><th>Total mortgage</th><th>Monthly payment</th></tr></thead><tbody>`
          + rows.map(r => `<tr><td>${money(r.D)} (${(r.D / P * 100).toFixed(1)}%)</td><td>${r.prem ? `${money(r.premium)} (${r.prem.toFixed(2)}%)` : "None"}</td><td>${money(r.L)}</td><td>${money(r.pay)}</td></tr>`).join("") + "</tbody></table>",
        msgs
      };
    }
  },

  closing: {
    key: "closing", bigLabel: "Estimated closing costs", src: ["buy"],
    fields: [
      {k: "prov", label: "Province", type: "select", def: "ON", options: [["ON", "Ontario"], ["BC", "British Columbia"], ["AB", "Alberta"], ["SK", "Saskatchewan"], ["MB", "Manitoba"], ["QC", "Quebec"], ["NB", "New Brunswick"], ["NS", "Nova Scotia"], ["PE", "Prince Edward Island"], ["NL", "Newfoundland and Labrador"]]},
      F.money("price", "Home price", 500000, "100000,2500000,5000"),
      F.money("down", "Down payment", 100000, "0,1500000,5000", "Used to work out mortgage insurance and registration fees."),
      {k: "ftb", label: "First-time home buyer", type: "check", def: false},
      {k: "toronto", label: "The home is in the City of Toronto", type: "check", def: false, show: v => v.prov === "ON"},
      {k: "mtl", label: "The home is in Montréal", type: "check", def: false, show: v => v.prov === "QC"},
      F.num("nsrate", "Municipal deed transfer tax rate (%)", 1.5, 0.25, "1,1.5,0.25", "Halifax charges 1.5%. Rates across Nova Scotia range from 1% to 1.5%.", {show: v => v.prov === "NS"}),
      F.money("skfees", "Land titles fees", 0, "0,5000,25", "Saskatchewan charges value-based land titles fees. Enter the amount from your lawyer or ISC.", {show: v => v.prov === "SK"}),
      F.money("legal", "Legal fees", 1500, "0,5000,50", "", {group: "Other costs (typical placeholders: use your quotes)"}),
      F.money("inspect", "Home inspection", 500, "0,1500,25", "", {group: "Other costs (typical placeholders: use your quotes)"}),
      F.money("title", "Title insurance", 300, "0,1000,25", "", {group: "Other costs (typical placeholders: use your quotes)"}),
      F.money("other", "Other (appraisal, tax adjustments, moving)", 0, "0,10000,100", "", {group: "Other costs (typical placeholders: use your quotes)"})
    ],
    compute(v){
      const P = v.price, D = Math.min(v.down, P);
      if (!(P > 0)) return null;
      const prem = premPct(P, D, 25), premium = D < P && P < 1.5e6 ? (P - D) * prem / 100 : 0, L = Math.max(0, P - D + premium);
      const lines = [], msgs = [], src = ["buy"];
      const add = (label, amt) => { lines.push([label, amt]); };
      switch (v.prov) {
        case "ON": {
          const ltt = brackets(P, [[55000, .5], [250000, 1], [400000, 1.5], [2e6, 2], [INF, 2.5]]);
          add("Ontario land transfer tax", ltt); src.push("onltt");
          if (v.ftb) { add("First-time buyer refund (Ontario, up to $4,000)", -Math.min(ltt, 4000)); src.push("onrefund"); }
          if (v.toronto) {
            const m = brackets(P, [[55000, .5], [250000, 1], [400000, 1.5], [2e6, 2], [3e6, 2.5], [4e6, 4.4], [5e6, 5.45], [1e7, 6.5], [2e7, 7.55], [INF, 8.6]]);
            add("Toronto municipal land transfer tax", m); src.push("to");
            if (v.ftb) { add("First-time buyer rebate (Toronto, up to $4,475)", -Math.min(m, 4475)); src.push("torebate"); }
          }
          break;
        }
        case "BC": {
          const t = brackets(P, [[2e5, 1], [2e6, 2], [INF, 3]]) + Math.max(0, P - 3e6) * 0.02;
          add("B.C. property transfer tax", t); src.push("bc");
          if (v.ftb) {
            const ex = P <= 5e5 ? t : P <= 835000 ? Math.min(t, 8000) : P < 860000 ? 8000 * (860000 - P) / 25000 : 0;
            add("First time home buyers' exemption", -ex); src.push("bcfthb");
            msgs.push(["", "B.C.'s first-time buyer exemption has conditions (for example, living in Canada and making the home your principal residence). Amounts shown are for homes registered on or after April 1, 2024."]);
          }
          break;
        }
        case "MB": add("Manitoba land transfer tax", brackets(P, [[30000, 0], [90000, .5], [150000, 1], [200000, 1.5], [INF, 2]])); src.push("mb"); break;
        case "QC":
          if (v.mtl) { add("Montréal property transfer duties (2026 rates)", brackets(P, [[62900, .5], [315000, 1], [552300, 1.5], [1104700, 2], [2136500, 2.5], [3113000, 3.5], [INF, 4]])); src.push("mtl"); }
          else { add("Québec property transfer duties (2026 rates)", brackets(P, [[62900, .5], [315000, 1], [INF, 1.5]])); src.push("qc");
            if (P > 5e5) msgs.push(["", "Your municipality may charge a higher rate (up to 3%) on the part of the price above $500,000. Check with the municipality."]); }
          break;
        case "NB": add("New Brunswick real property transfer tax (1%)", P * 0.01); src.push("nb"); msgs.push(["", "New Brunswick's tax is charged on the greater of the price and the assessed value."]); break;
        case "NS": add(`Nova Scotia deed transfer tax (${v.nsrate}%)`, P * v.nsrate / 100); src.push("ns"); break;
        case "PE": add("P.E.I. real property transfer tax (1%)", P * 0.01); src.push("pe");
          msgs.push(["", "P.E.I.'s tax is 1% of the greater of the price and the assessed value. First-time home buyers may be exempt; check eligibility with the province."]); break;
        case "AB": {
          const fee = x => 50 + 5 * Math.ceil(x / 5000);
          add("Alberta land titles fee (transfer)", fee(P)); if (L > 0) add("Alberta land titles fee (mortgage)", fee(L)); src.push("ab");
          msgs.push(["", "Alberta has no land transfer tax, only these registration fees."]); break;
        }
        case "SK": add("Saskatchewan land titles fees (as entered)", v.skfees); src.push("sk"); break;
        case "NL": {
          const fee = x => x <= 500 ? 100 : 100 + 0.4 * Math.ceil((x - 500) / 100);
          add("Registry of deeds fee (deed)", fee(P)); if (L > 0) add("Registry of deeds fee (mortgage)", Math.min(5000, fee(L))); src.push("nl");
          msgs.push(["", "Newfoundland and Labrador has no land transfer tax, only these registration fees."]); break;
        }
      }
      const PST = {ON: [8, "onrst"], QC: [9, "qcipt"], SK: [6, "skpst"]}[v.prov];
      if (premium > 0) {
        if (PST) { add(`Sales tax on mortgage insurance premium (${PST[0]}% of ${money(premium)})`, premium * PST[0] / 100); src.push("grid", PST[1]);
          msgs.push(["", "Sales tax on the insurance premium can't be added to your mortgage, so it's paid at closing."
            + (v.prov === "QC" ? " Québec's rate rises from 9% to 9.975% for premiums paid after December 31, 2026." : "")]); }
        if (v.prov === "MB") { msgs.push(["", "The Financial Consumer Agency of Canada lists Manitoba among the provinces that charge sales tax on mortgage insurance premiums. Ask your lender for the amount."]); src.push("down"); }
      }
      if (D < minDown(P) - 1) msgs.push(["w", `Your down payment is below the minimum for this price (about ${money(minDown(P))}).`]);
      add("Legal fees", v.legal); add("Home inspection", v.inspect); add("Title insurance", v.title); if (v.other) add("Other", v.other);
      const total = lines.reduce((s, [, a]) => s + a, 0);
      return {
        label: "Estimated closing costs", big: money(total), sub: `${(total / P * 100).toFixed(1)}% of the price. The Financial Consumer Agency of Canada suggests budgeting 1.5% to 4% for closing costs.`,
        table: `<table class="cmpt"><tbody>${lines.map(([l, a]) => `<tr><td>${l}</td><td>${a < 0 ? "−" + money(-a) : money(a)}</td></tr>`).join("")}<tr class="hl"><td>Total</td><td>${money(total)}</td></tr></tbody></table>`,
        msgs, src: [...new Set(src)]
      };
    }
  },

  frequency: {
    key: "frequency", bigLabel: "Interest saved", src: ["act"],
    fields: [F.money("amount", "Mortgage amount", 400000, "50000,2000000,5000"), F.rate(), F.custom(), F.years(25)],
    compute(v, best){
      const R = rateInfo(v, best), P = v.amount;
      if (!(P > 0 && R.rate > 0)) return null;
      const pm = pmt(P, perPeriod(R.rate, R.variable, 12), v.years * 12);
      const sim = (k, pay) => { const i = perPeriod(R.rate, R.variable, k); let bal = P, int = 0, c = 0; while (bal > 0.005 && c < k * 60) { const it = bal * i; int += it; bal = bal + it - Math.min(pay, bal + it); c++; } return {int, m: c / k * 12}; };
      const rows = [["Monthly", 12, pm], ["Semi-monthly", 24, pm / 2], ["Bi-weekly", 26, pm * 12 / 26], ["Accelerated bi-weekly", 26, pm / 2], ["Weekly", 52, pm * 12 / 52], ["Accelerated weekly", 52, pm / 4]]
        .map(([name, k, pay]) => Object.assign({name, k, pay}, sim(k, pay)));
      const saved = rows[0].int - rows[3].int;
      return {
        label: "Accelerated bi-weekly payments would save you", big: money(saved), sub: `in interest, and you'd be mortgage-free ${yrs(rows[0].m - rows[3].m)} sooner`,
        items: [`"Accelerated" payments are half (bi-weekly) or a quarter (weekly) of the monthly payment. Because there are 26 or 52 of them a year, you pay the equivalent of one extra monthly payment each year.`,
          `Uses ${R.label}${R.variable ? ", compounded monthly" : ", compounded twice a year"}, held for the whole amortization.`],
        table: `<table class="cmpt"><thead><tr><th>How often you pay</th><th>Payment</th><th>Paid off in</th><th>Total interest</th></tr></thead><tbody>`
          + rows.map((r, j) => `<tr${j === 3 ? ' class="hl"' : ""}><td>${r.name}</td><td>${money(r.pay)}</td><td>${yrs(r.m)}</td><td>${money(r.int)}</td></tr>`).join("") + "</tbody></table>"
      };
    }
  },

  prepay: {
    key: "prepay", bigLabel: "Interest saved", src: ["pen"],
    fields: [
      F.money("balance", "Mortgage balance", 400000, "50000,2000000,5000"), F.rate(), F.custom(),
      F.num("years", "Years left on your amortization", 25, 1, "1,30,1"),
      F.money("extra", "Extra amount added to each monthly payment", 200, "0,5000,25"),
      F.money("lump", "Lump-sum payment once a year", 5000, "0,100000,500")
    ],
    compute(v, best){
      const R = rateInfo(v, best), B = v.balance, n = Math.round(v.years * 12);
      if (!(B > 0 && R.rate > 0 && n > 0)) return null;
      const i = perPeriod(R.rate, R.variable), pay = pmt(B, i, n), base = pay * n - B;
      let bal = B, int = 0, m = 0;
      while (bal > 0.005 && m < n) { const it = bal * i; int += it; bal = bal + it - Math.min(pay + v.extra, bal + it); m++; if (m % 12 === 0 && bal > 0) bal -= Math.min(v.lump, bal); }
      return {
        label: "Prepaying would save you", big: money(base - int), sub: `in interest, and you'd be mortgage-free ${yrs(n - m)} sooner`,
        items: [`Regular payment: <strong>${money(pay)}</strong> a month (${R.label}). With your extra amount: ${money(pay + v.extra)}.`,
          `Paid off in <strong>${yrs(m)}</strong> instead of ${yrs(n)}.`,
          `Total interest: <strong>${money(int)}</strong> instead of ${money(base)}, if the rate stayed the same.`]
      ,
        msgs: [["", "Most mortgages let you prepay only up to a yearly limit without a penalty, and unused room usually doesn't carry over. Check your mortgage's prepayment privileges before you pay extra."]]
      };
    }
  },

  renewal: {
    key: "renewal", bigLabel: "Over your term", src: ["act", "boc"],
    fields: [
      F.money("balance", "Balance at renewal", 400000, "50000,2000000,5000"),
      F.num("years", "Years left on your amortization", 20, 1, "5,30,1"),
      {k: "term", label: "Term (years)", type: "select", def: 5, options: [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5]], numeric: true},
      F.rate("frate", "5-year fixed", "Fixed rate"), F.custom("fcustom", "frate", 5, "Your fixed rate (%)"),
      F.rate("vrate", "5-year variable", "Variable rate"), F.custom("vcustom", "vrate", 4.5, "Your variable rate (%)"),
      F.num("change", "How much you expect the variable rate to move over the term (%)", 0, 0.25, "-3,3,0.25", "It moves gradually from today's rate. 0 means it stays the same; -1 means it falls by 1% by the end of the term.")
    ],
    compute(v, best){
      const B = v.balance, n = Math.round(v.years * 12), T = Math.min(v.term * 12, n);
      const Fx = rateInfo(v, best, "frate", "fcustom"), Vr = rateInfo(v, best, "vrate", "vcustom");
      if (!(B > 0 && n > 0 && Fx.rate > 0 && Vr.rate > 0)) return null;
      const fi = perPeriod(Fx.rate, Fx.variable), fpay = pmt(B, fi, n), fbal = balanceAfter(B, fi, fpay, T), fint = fpay * T - (B - fbal);
      const runVar = ch => { let bal = B, int = 0, first = 0, last = 0;
        for (let m = 0; m < T; m++) { const r = Math.max(0.01, Vr.rate + ch * m / T), i = perPeriod(r, true), pay = pmt(bal, i, n - m); if (!m) first = pay; last = pay; const it = bal * i; int += it; bal = bal + it - pay; }
        return {int, bal, first, last}; };
      const vv = runVar(v.change);
      let lo = -10, hi = 10; for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (runVar(mid).int < fint) lo = mid; else hi = mid; }
      const be = (lo + hi) / 2, diff = vv.int - fint;
      const beText = be >= 0 ? `Variable costs less in interest unless its rate rises by more than about <strong>${be.toFixed(2)}%</strong> over the term.`
        : `Variable only costs less if its rate falls by more than about <strong>${(-be).toFixed(2)}%</strong> over the term.`;
      return {
        label: `Over a ${v.term}-year term`, big: Math.abs(diff) < 1 ? "About the same" : `${diff > 0 ? "Fixed" : "Variable"} saves ${money(Math.abs(diff))}`, sub: "in interest, with your assumptions",
        items: [beText, `Fixed balance at the end of the term: ${money(fbal)}. Variable: ${money(vv.bal)}.`],
        table: `<table class="cmpt"><thead><tr><th></th><th>Fixed</th><th>Variable</th></tr></thead><tbody>`
          + `<tr><td>Rate</td><td>${pct(Fx.rate)}</td><td>${pct(Vr.rate)}${v.change ? ` → ${pct(Math.max(0.01, Vr.rate + v.change))}` : ""}</td></tr>`
          + `<tr><td>Monthly payment</td><td>${money(fpay)}</td><td>${money(vv.first)}${Math.abs(vv.last - vv.first) >= 1 ? ` → ${money(vv.last)}` : ""}</td></tr>`
          + `<tr><td>Interest over the term</td><td>${money(fint)}</td><td>${money(vv.int)}</td></tr></tbody></table>`,
        msgs: [["", "Nobody knows where variable rates will go. Variable rates move with your lender's prime rate, which usually follows the Bank of Canada's policy rate. Some variable mortgages keep the payment the same when rates change instead of adjusting it as this estimate does."]]
      };
    }
  },

  penalty: {
    key: "penalty", bigLabel: "Estimated penalty", src: ["pen", "act10"],
    fields: [
      {k: "kind", label: "Your mortgage rate type", type: "select", def: "fixed", options: [["fixed", "Fixed rate"], ["variable", "Variable rate"]]},
      F.money("balance", "Mortgage balance", 300000, "10000,2000000,5000"),
      F.num("crate", "Your mortgage rate (%)", 5.14, 0.01, "0,12,0.05"),
      F.num("months", "Months left in your term", 30, 1, "1,120,1"),
      Object.assign(F.rate("cmp", "3-year fixed", "Lender's current rate for a term close to the time you have left"), {show: v => v.kind === "fixed"}),
      Object.assign(F.custom("ccustom", "cmp", 4.5, "That rate (%)"), {show: v => v.kind === "fixed" && v.cmp === "custom"}),
      {k: "over5", label: "My term is longer than 5 years, and the mortgage started at least 5 years ago", type: "check", def: false, show: v => v.kind === "fixed"}
    ],
    compute(v, best){
      const B = v.balance;
      if (!(B > 0 && v.crate > 0 && v.months > 0)) return null;
      const cmp = rateInfo(v, best, "cmp", "ccustom"), three = B * v.crate / 100 * 3 / 12;
      const ird = Math.max(0, B * (v.crate - cmp.rate) / 100 * v.months / 12);
      let pen, why;
      if (v.kind === "variable") { pen = three; why = "Variable-rate mortgages usually charge three months' interest."; }
      else if (v.over5) { pen = three; why = "After 5 years on a term longer than 5 years, the Interest Act lets you pay off the mortgage with three months' interest."; }
      else { pen = Math.max(three, ird); why = `Fixed-rate mortgages usually charge the higher of the two: here that's the ${ird > three ? "interest rate differential" : "three months' interest"}.`; }
      const items = [`Three months' interest: ${money(B)} × ${p2(v.crate)} × 3 ÷ 12 = <strong>${money(three)}</strong>`];
      if (v.kind === "fixed") items.push(`Interest rate differential: ${money(B)} × (${p2(v.crate)} − ${p2(cmp.rate)}) × ${v.months} months ÷ 12 = <strong>${money(ird)}</strong>`);
      items.push(why);
      return {
        label: "Breaking your mortgage would cost about", big: money(pen), items,
        msgs: [["", "This is a simplified estimate. Lenders calculate the interest rate differential in different ways: some compare posted rates, or take your original discount off the comparison rate, which can make the penalty much larger. Administration fees may also apply. Ask your lender for the exact amount before you decide."]]
      };
    }
  },

  rentbuy: {
    key: "rentbuy", bigLabel: "After the years you compare", src: ["buy", "grid"],
    fields: [
      F.money("rent", "Monthly rent", 2500, "500,8000,50"),
      F.money("price", "Home price", 600000, "100000,2500000,5000"),
      F.money("down", "Down payment", 120000, "0,1500000,5000"),
      F.rate(), F.custom(), F.years(25, [15, 20, 25, 30]),
      F.num("horizon", "Years to compare", 10, 1, "1,30,1"),
      F.money("tax", "Property tax per month", 350, "0,2000,10", "", {group: "Owning costs"}),
      F.money("ins", "Home insurance per month", 100, "0,500,5", "", {group: "Owning costs"}),
      F.money("condo", "Condo fees per month", 0, "0,1500,10", "", {group: "Owning costs"}),
      F.num("maint", "Maintenance per year (% of the home's value)", 1, 0.25, "0,4,0.25", "", {group: "Owning costs"}),
      F.num("closing", "Closing costs when buying, incl. land transfer tax (% of price)", 3, 0.25, "0,6,0.25", 'Work yours out with the <a href="calc-closing.html">closing costs calculator</a>.', {group: "Owning costs"}),
      F.num("sell", "Costs when you sell (% of the home's value)", 5, 0.25, "0,8,0.25", "Real estate commission, legal fees and so on.", {group: "Owning costs"}),
      F.num("rentinc", "Rent increase per year (%)", 3, 0.25, "0,8,0.25", "", {group: "Assumptions about the future"}),
      F.num("growth", "Home value change per year (%)", 3, 0.25, "-3,8,0.25", "", {group: "Assumptions about the future"}),
      F.num("ret", "Investment return per year (%)", 5, 0.25, "0,10,0.25", "What the renter earns by investing the down payment and any money left over each month.", {group: "Assumptions about the future"})
    ],
    compute(v, best){
      const R = rateInfo(v, best), P = v.price, D = Math.min(v.down, P), H = Math.round(v.horizon * 12), n = v.years * 12;
      if (!(P > 0 && R.rate > 0 && H > 0 && v.rent >= 0)) return null;
      const prem = premPct(P, D, v.years), L = (P - D) * (1 + prem / 100), i = perPeriod(R.rate, R.variable), pay = pmt(L, i, n);
      const rr = Math.pow(1 + v.ret / 100, 1 / 12) - 1, gm = Math.pow(1 + v.growth / 100, 1 / 12) - 1;
      let value = P, bal = L, own = 0, renter = D + P * v.closing / 100, firstOwn = 0;
      for (let m = 0; m < H; m++) {
        const rent = v.rent * Math.pow(1 + v.rentinc / 100, Math.floor(m / 12));
        const cost = (m < n ? pay : 0) + v.tax + v.ins + v.condo + value * v.maint / 100 / 12;
        if (!m) firstOwn = cost;
        own *= 1 + rr; renter *= 1 + rr;
        if (cost > rent) renter += cost - rent; else own += rent - cost;
        if (m < n) bal = bal * (1 + i) - pay;
        value *= 1 + gm;
      }
      bal = Math.max(0, bal);
      const ownNW = value - bal - value * v.sell / 100 + own, diff = ownNW - renter;
      const msgs = [["", "These results depend heavily on the assumptions about the future, which nobody can know. Try a few different values to see how sensitive the answer is."]];
      if (D < minDown(P) - 1) msgs.unshift(["w", `The down payment is below the minimum for this price (about ${money(minDown(P))}).`]);
      return {
        label: `After ${v.horizon} ${v.horizon === 1 ? "year" : "years"}`, big: `${diff >= 0 ? "Buying" : "Renting"} comes out ahead by ${money(Math.abs(diff))}`,
        items: [`Owning, year 1: <strong>${money(firstOwn)}</strong> a month (${money(pay)} mortgage payment${prem ? `, including ${money(L - (P - D))} insurance added to the mortgage` : ""}, plus tax, insurance, condo fees and maintenance). Renting: ${money(v.rent)} a month.`,
          `Whoever spends less each month invests the difference at ${v.ret}% a year. The renter also invests the ${money(D)} down payment and the closing costs.`],
        table: `<table class="cmpt"><thead><tr><th>After ${v.horizon} years</th><th>Buy</th><th>Rent</th></tr></thead><tbody>`
          + `<tr><td>Home value</td><td>${money(value)}</td><td>—</td></tr><tr><td>Mortgage still owed</td><td>−${money(bal)}</td><td>—</td></tr>`
          + `<tr><td>Selling costs</td><td>−${money(value * v.sell / 100)}</td><td>—</td></tr><tr><td>Investments</td><td>${money(own)}</td><td>${money(renter)}</td></tr>`
          + `<tr class="hl"><td>What you'd have</td><td>${money(ownNW)}</td><td>${money(renter)}</td></tr></tbody></table>`,
        msgs
      };
    }
  },

  equity: {
    key: "equity", bigLabel: "You could access up to", src: ["equity", "bank418", "b20"],
    fields: [
      F.money("value", "Home value", 800000, "100000,3000000,5000"),
      F.money("mort", "Mortgage balance", 350000, "0,2500000,5000"),
      F.money("other", "Other borrowing secured by the home", 0, "0,1000000,1000", "For example, the balance on an existing home equity line of credit."),
      F.rate("rate", "5-year fixed", "Mortgage rate if you refinance"), F.custom(), F.years(25, [15, 20, 25, 30]),
      F.num("heloc", "HELOC interest rate (%)", 5.45, 0.05, "0,12,0.05", "A placeholder: ask your lender. HELOC rates are usually set relative to their prime rate.")
    ],
    compute(v, best){
      const V = v.value;
      if (!(V > 0)) return null;
      const R = rateInfo(v, best), cap = V * 0.8, owed = v.mort + v.other, avail = Math.max(0, cap - owed);
      const helocLimit = Math.max(0, Math.min(V * 0.65, cap - v.mort)), helocNew = Math.max(0, Math.min(helocLimit - v.other, avail));
      const items = [`80% of your home's value: <strong>${money(cap)}</strong>. You owe ${money(owed)} against it.`];
      if (avail > 0) {
        items.push(`Refinancing: a new mortgage of up to ${money(cap)}. Borrowing the extra ${money(avail)} at ${R.label} over ${v.years} years adds about <strong>${money(pmt(avail, perPeriod(R.rate, R.variable), v.years * 12))}</strong> a month.`);
        items.push(`HELOC: a revolving line of credit can't go above 65% of your home's value (${money(V * 0.65)}), so you could get a line of up to <strong>${money(helocNew)}</strong>. Interest only on the full amount at ${p2(v.heloc)} would be about ${money(helocNew * v.heloc / 100 / 12)} a month.`);
      }
      return {
        label: "You could access up to", big: money(avail), sub: "keeping everything you owe on the home at or below 80% of its value",
        items, msgs: [avail <= 0 ? ["w", "You already owe 80% or more of your home's value, so lenders generally can't lend more against it."] : ["", "Lenders still check that you can afford the new borrowing, including the stress test, and they may lend less than these limits."]]
      };
    }
  }
};

const c = CALCS[document.body.dataset.calc];
if (c) makeCalc(c);
})();
