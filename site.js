const SITE_VERSION = "42";
// Your contact email for the footer and the Terms and privacy page. Leave it empty to hide the contact line.
const CONTACT_EMAIL = "";
// Shared by every page: helpers, header, light/dark switch, loading rates, and the mortgage maths.
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pct = x => (Math.round(x*1000) % 10 ? x.toFixed(3) : x.toFixed(2)) + "%";
const fmt = iso => new Date(iso).toLocaleString([], {dateStyle:"medium", timeStyle:"short"});
const money = x => Math.round(x).toLocaleString("en-CA", {style:"currency", currency:"CAD", maximumFractionDigits:0});
const EXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg><span class="vh"> (opens in a new tab)</span>';

// Columns across the top of the rates table: [heading shown, product name as it appears in rates.json]
const COLUMNS = [["3-year fixed", "3-year fixed"], ["5-year variable", "5-year variable"], ["5-year fixed", "5-year fixed"]];
const rateOf = (l, p) => l.cells[p] ? l.cells[p].rate : Infinity;

// Header with links to each page, plus the light / dark switch (light by default; the visitor's choice is remembered)
(function(){
  const page = document.body.dataset.page, el = $("site-header"), base = page === "404" ? "/" : "";
  const links = [["calc", "calculators.html", "Interactive Calculators"], ["history", "rate-history.html", "Rate history"], ["crash", "crash-course.html", "Mortgages Explained"], ["extras", "faq.html", "Extras"]];
  el.className = el.closest(".band") ? "n" : "n band";
  el.innerHTML = `<div class="nw"><a class="brand" href="${base}index.html"><svg class="bm" viewBox="10 10 44 44" aria-hidden="true"><circle cx="21" cy="21" r="7.5" fill="none" stroke="currentColor" stroke-width="5"/><circle cx="43" cy="43" r="7.5" fill="none" stroke="currentColor" stroke-width="5"/><path d="M45 16 19 48" stroke="currentColor" stroke-width="5.5" stroke-linecap="round"/></svg>What's the rate?</a>`
    + `<button type="button" class="menu" id="menubtn" aria-expanded="false" aria-controls="mainnav"><span aria-hidden="true">☰</span> Menu</button>`
    + `<nav class="mainnav" id="mainnav" aria-label="Main">` + links.map(([k, u, t]) => `<a class="nl" href="${base}${u}"${k === page ? ' aria-current="page"' : ""}>${t}</a>`).join("") + `</nav></div>`
    + `<div class="r"><button class="mode" id="mode" type="button" aria-label="Switch to dark mode" title="Switch to dark mode">`
    + `<svg class="mo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>`
    + `<svg class="su" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`
    + `</button></div>`;
  const root = document.documentElement;
  const show = () => { const t = root.dataset.theme === "dark" ? "Switch to light mode" : "Switch to dark mode"; $("mode").setAttribute("aria-label", t); $("mode").title = t; };  // icon only: the moon or sun says it
  const flip = () => {
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem("theme", root.dataset.theme); } catch (e) {}
    show();
  };
  // Quick fade between light and dark. Browsers with view transitions cross-fade the whole page
  // (charts included); others ease the colours. Skipped when the person has asked for less motion.
  $("mode").onclick = () => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return flip();
    if (document.startViewTransition) { document.startViewTransition(flip); return; }
    root.classList.add("theming");
    flip();
    clearTimeout(root._tm);
    root._tm = setTimeout(() => root.classList.remove("theming"), 350);
  };
  show();
  $("menubtn").onclick = () => { const open = $("menubtn").getAttribute("aria-expanded") !== "true"; $("menubtn").setAttribute("aria-expanded", open); el.classList.toggle("open", open); };
  // "Skip to content" for keyboard and screen-reader users
  const main = document.querySelector("main"), target = document.querySelector("h1") || main;
  if (target && !target.id) target.id = "content";
  target && target.setAttribute("tabindex", "-1");
  document.body.insertAdjacentHTML("afterbegin", `<a class="skip" href="#${target ? target.id : "top"}">Skip to content</a>`);
  // On phones, the side list of pages becomes a dropdown
  document.querySelectorAll("nav.tabs").forEach(nav => {
    const label = nav.getAttribute("aria-label") || "Pages", links = [...nav.querySelectorAll("a")];
    const id = "pick-" + label.replace(/\W+/g, "").toLowerCase();
    nav.insertAdjacentHTML("beforebegin", `<label class="tabsel">${label === "Calculators" ? "Choose a calculator" : label === "Extras" ? "Choose a page" : "Choose a chapter"}<select id="${id}">`
      + links.map(a => `<option value="${a.getAttribute("href")}"${a.getAttribute("aria-current") ? " selected" : ""}>${esc(a.textContent)}</option>`).join("") + `</select></label>`);
    $(id).onchange = e => { location.href = e.target.value; };
  });
  // Footer on every page
  const year = new Date().getFullYear();
  main && main.insertAdjacentHTML("beforeend", `<footer class="sitefoot"><nav aria-label="Footer"><a href="${base}index.html">Today's rates</a><a href="${base}calculators.html">Calculators</a><a href="${base}crash-course.html">Mortgages Explained</a><a href="${base}faq.html">FAQ</a><a href="${base}glossary.html">Glossary</a><a href="${base}about.html">About</a><a href="${base}terms.html">Terms and privacy</a></nav>`
    + `<p>Rates are collected every hour from each lender's own website. Information only, not financial advice: always confirm rates and terms with the lender.</p>`
    + `<p>© ${year} What's the rate?${typeof CONTACT_EMAIL !== "undefined" && CONTACT_EMAIL ? ` · <a href="mailto:${esc(CONTACT_EMAIL)}">${esc(CONTACT_EMAIL)}</a>` : ""}</p></footer>`);
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

// "How much can I afford?" maths. CMHC's maximum debt service ratios are GDS 39% and TDS 44%, and the mortgage payment
// is tested at the stress-test rate: the greater of the contract rate + 2% or 5.25%.
const AFF = {income: 100000, debts: 500, tax: 300, heat: 120, condo: 0, saved: 100000, years: 25, rate: "5-year fixed", custom: 5, gds: 39, tds: 44, stress: 2, floor: 5.25};  // typical starting values
function loadAfford(){ try { return Object.assign({}, AFF, JSON.parse(localStorage.getItem("afford") || "{}")); } catch (e) { return Object.assign({}, AFF); } }
function saveAfford(a){ try { localStorage.setItem("afford", JSON.stringify(a)); } catch (e) {} }
function premPct(price, down, years){
  if (down >= price * 0.19999) return 0;
  const ltv = (price - down) / price * 100;
  return (ltv > 90 ? 4 : ltv > 85 ? 3.1 : 2.8) + (years > 25 ? 0.2 : 0);
}
function afford(a, best){
  const income = +a.income, debts = +a.debts, tax = +a.tax, heat = +a.heat, condo = +a.condo, D = +a.saved, years = +a.years;
  const fromTable = a.rate !== "custom" && !!best[a.rate];
  const rate = fromTable ? best[a.rate].rate : +a.custom;
  if (!(income > 0) || !(D >= 0) || !(rate > 0 && rate < 30) || !(+a.gds > 0) || !(+a.tds > 0) || ![debts, tax, heat, condo].every(x => x >= 0)) return null;
  const variable = fromTable && a.rate.indexOf("variable") > -1;
  const mi = income / 12, other = tax + heat + condo * 0.5, n = years * 12, qual = Math.max(rate + (+a.stress), +a.floor);
  const monthly = r => variable ? r / 1200 : Math.pow(1 + r / 200, 1 / 6) - 1;
  const qi = monthly(qual), i = monthly(rate), payFor = (L, ii) => L * ii / (1 - Math.pow(1 + ii, -n));
  const gdsPay = (+a.gds / 100) * mi - other, tdsPay = (+a.tds / 100) * mi - other - debts, maxPay = Math.min(gdsPay, tdsPay);
  const base = {income, debts, tax, heat, condo, saved: D, years, rate, qual, variable, fromTable, mi, other, gdsPay, tdsPay, gdsLimit: +a.gds, tdsLimit: +a.tds};
  if (maxPay <= 0 || D <= 0) return Object.assign(base, {none: true, needDown: D <= 0});
  const Pmax = maxPay * (1 - Math.pow(1 + qi, -n)) / qi;
  const loanFor = p => (p - D) * (1 + premPct(p, D, years) / 100);
  const ok = p => loanFor(p) <= Pmax && D >= minDown(p) - 0.5 && !(p >= 1.5e6 && D < p * 0.2 - 0.5);
  let lo = D + 1, hi = D + Pmax * 2 + 1;
  for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (ok(mid)) lo = mid; else hi = mid; }
  const price = Math.floor(lo / 1000) * 1000;
  const prem = premPct(price, D, years), L0 = price - D, premium = L0 * prem / 100, L = L0 + premium;
  const qpay = payFor(L, qi);
  return Object.assign(base, {price, L0, prem, premium, L, Pmax, qpay, pay: payFor(L, i), insured: prem > 0,
    gds: (qpay + other) / mi * 100, tds: (qpay + other + debts) / mi * 100, limit: gdsPay <= tdsPay ? "GDS" : "TDS"});
}

// "How much income do I need?" maths: the reverse of the affordability calculator
const NEED = {price: 500000, saved: 100000, debts: 500, tax: 300, heat: 120, condo: 0, years: 25, rate: "5-year fixed", custom: 5, gds: 39, tds: 44, stress: 2, floor: 5.25};
function loadNeed(){ try { return Object.assign({}, NEED, JSON.parse(localStorage.getItem("need") || "{}")); } catch (e) { return Object.assign({}, NEED); } }
function saveNeed(n){ try { localStorage.setItem("need", JSON.stringify(n)); } catch (e) {} }
function need(n, best){
  const price = +n.price, D = +n.saved, debts = +n.debts, tax = +n.tax, heat = +n.heat, condo = +n.condo, years = +n.years;
  const fromTable = n.rate !== "custom" && !!best[n.rate];
  const rate = fromTable ? best[n.rate].rate : +n.custom;
  if (!(price > 0) || !(D >= 0 && D < price) || !(rate > 0 && rate < 30) || !(+n.gds > 0) || !(+n.tds > 0) || ![debts, tax, heat, condo].every(x => x >= 0)) return null;
  const variable = fromTable && n.rate.indexOf("variable") > -1, nper = years * 12, qual = Math.max(rate + (+n.stress), +n.floor);
  const monthly = r => variable ? r / 1200 : Math.pow(1 + r / 200, 1 / 6) - 1, qi = monthly(qual), i = monthly(rate);
  const payFor = (L, ii) => L * ii / (1 - Math.pow(1 + ii, -nper));
  const prem = premPct(price, D, years), L0 = price - D, premium = L0 * prem / 100, L = L0 + premium;
  const qpay = payFor(L, qi), other = tax + heat + condo * 0.5, housing = qpay + other;
  const incGds = housing / (+n.gds / 100) * 12, incTds = (housing + debts) / (+n.tds / 100) * 12;
  return {price, saved: D, downPct: D / price * 100, debts, tax, heat, condo, years, rate, qual, variable, fromTable, prem, premium, L0, L, insured: prem > 0,
    qpay, pay: payFor(L, i), other, housing, incGds, incTds, income: Math.max(incGds, incTds), limit: incGds >= incTds ? "GDS" : "TDS",
    min: minDown(price), belowMin: D < minDown(price) - 1, overCap: prem > 0 && price >= 1.5e6};
}

// Numbers typed into money boxes (data-money="1") get thousands commas automatically
const val = id => parseFloat(String($(id).value).replace(/,/g, "")) || 0;
function commaFormat(el){
  const raw = el.value, digitsBefore = raw.slice(0, el.selectionStart || 0).replace(/[^0-9.]/g, "").length;
  const parts = raw.replace(/[^0-9.]/g, "").split(".");
  const int = parts[0].replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const out = int + (parts.length > 1 ? "." + parts.slice(1).join("").slice(0, 2) : "");
  el.value = out;
  let seen = 0, p = 0;
  while (p < out.length && seen < digitsBefore) { if (/[0-9.]/.test(out[p])) seen++; p++; }
  try { el.setSelectionRange(p, p); } catch (e) {}
}
function setv(id, v){ const el = $(id); el.value = el.dataset.money === "1" ? Number(v).toLocaleString("en-CA", {maximumFractionDigits: 2}) : v; syncSlider(el); }

// Sliders: any box with data-slider="min,max,step" gets a slider under it that moves the box (and the box moves the slider)
function syncSlider(el){
  const s = el && $("sl_" + el.id); if (!s) return;
  const [lo, hi, st] = el.dataset.slider.split(",").map(Number);
  s.min = lo; s.max = hi; s.step = st; s.value = parseFloat(String(el.value).replace(/,/g, "")) || 0;
}
function addSlider(el){
  if ($("sl_" + el.id)) return;
  const lab = el.closest("label"), s = document.createElement("input");
  s.type = "range"; s.id = "sl_" + el.id; s.className = "sl";
  s.setAttribute("aria-label", "Slider for " + (el.getAttribute("aria-label") || (lab && lab.childNodes[0].textContent.trim()) || el.id));
  el.insertAdjacentElement("afterend", s);
  syncSlider(el);
  s.addEventListener("input", () => { setv(el.id, s.value); el.dispatchEvent(new Event("input", {bubbles: true})); });
}
document.querySelectorAll("input[data-slider]").forEach(addSlider);
document.addEventListener("input", e => { if (e.target.dataset && e.target.dataset.slider) syncSlider(e.target); }, true);

// Quick fade between pages
document.addEventListener("click", e => {
  const l = e.target.closest && e.target.closest("a[href]");
  if (!l || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || l.target || l.origin !== location.origin) return;
  if (l.pathname === location.pathname && l.hash) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  e.preventDefault(); document.body.classList.add("leaving");
  setTimeout(() => { location.href = l.href; }, 150);
});
addEventListener("pageshow", e => { if (e.persisted) document.body.classList.remove("leaving"); });
document.addEventListener("input", e => { if (e.target.dataset && e.target.dataset.money === "1") commaFormat(e.target); }, true);

// Bank of Canada announcement dates (from the Bank's Policy interest rate page). Add next year's dates when the Bank publishes them.
const BOC_DATES = ["2026-01-28", "2026-03-18", "2026-04-29", "2026-06-10", "2026-07-15", "2026-09-02", "2026-10-28", "2026-12-09",
  "2027-01-27", "2027-03-03", "2027-04-28", "2027-06-02", "2027-07-21", "2027-09-08", "2027-10-27", "2027-12-08"];
const dstr = iso => new Date(iso + "T12:00:00").toLocaleDateString([], {dateStyle: "medium"});
function todayISO(){ const t = new Date(); return t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0"); }
function addDays(iso, n){ const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }

// Where the outside numbers come from (shown as links under each page's content)
const SRC = {
  gds: ["CMHC: Calculating GDS and TDS", "https://cmhc-schl.gc.ca/professionals/project-funding-and-mortgage-financing/mortgage-loan-insurance/calculating-gds-tds"],
  grid: ["CMHC: Premium information for homeowner loans", "https://www.cmhc-schl.gc.ca/en/professionals/project-funding-and-mortgage-financing/mortgage-loan-insurance/mortgage-loan-insurance-homeownership-programs/premium-information-for-homeowner-and-small-rental-loans"],
  dof: ["Department of Finance Canada: mortgage rule changes", "https://www.canada.ca/en/department-finance/news/2024/09/delivering-the-boldest-mortgage-reforms-in-decades.html"],
  fcac: ["Financial Consumer Agency of Canada: mortgage terms and amortization", "https://www.canada.ca/en/financial-consumer-agency/services/mortgages/mortgage-terms-amortization.html"],
  down: ["Financial Consumer Agency of Canada: down payments and mortgage insurance", "https://www.canada.ca/en/financial-consumer-agency/services/mortgages/down-payment.html"],
  act: ["Interest Act, section 6 (Justice Laws)", "https://laws-lois.justice.gc.ca/eng/acts/I-15/section-6.html"],
  act10: ["Interest Act, section 10 (Justice Laws)", "https://laws-lois.justice.gc.ca/eng/acts/I-15/section-10.html"],
  pen: ["Financial Consumer Agency of Canada: prepayment penalties", "https://www.canada.ca/en/financial-consumer-agency/services/mortgages/reduce-prepayment-penalties.html"],
  buy: ["Financial Consumer Agency of Canada: buying a home (closing costs)", "https://www.canada.ca/en/financial-consumer-agency/services/buying-home.html"],
  equity: ["Financial Consumer Agency of Canada: borrowing against home equity", "https://www.canada.ca/en/financial-consumer-agency/services/mortgages/borrow-home-equity.html"],
  b20: ["OSFI Guideline B-20: residential mortgage underwriting", "https://www.osfi-bsif.gc.ca/en/guidance/guidance-library/residential-mortgage-underwriting-practices-procedures-guideline-2017"],
  bank418: ["Bank Act, section 418 (Justice Laws)", "https://laws-lois.justice.gc.ca/eng/acts/B-1.01/section-418.html"],
  onltt: ["Ontario: calculating land transfer tax", "https://www.ontario.ca/document/land-transfer-tax/calculating-land-transfer-tax"],
  onrefund: ["Ontario: land transfer tax refunds for first-time homebuyers", "https://www.ontario.ca/document/land-transfer-tax/land-transfer-tax-refunds-first-time-homebuyers"],
  to: ["City of Toronto: municipal land transfer tax rates", "https://www.toronto.ca/services-payments/property-taxes-utilities/municipal-land-transfer-tax-mltt/municipal-land-transfer-tax-mltt-rates-and-fees/"],
  torebate: ["City of Toronto: MLTT rebates", "https://www.toronto.ca/services-payments/property-taxes-utilities/municipal-land-transfer-tax-mltt/municipal-land-transfer-tax-mltt-rebate-opportunities/"],
  bc: ["B.C.: property transfer tax", "https://www2.gov.bc.ca/gov/content/taxes/property-taxes/property-transfer-tax"],
  bcfthb: ["B.C.: first time home buyers' exemption amounts", "https://www2.gov.bc.ca/gov/content/taxes/property-taxes/property-transfer-tax/exemptions/first-time-home-buyers/current-amount"],
  mb: ["Manitoba: land transfer tax", "https://www.gov.mb.ca/finance/other/landtransfertax.html"],
  qc: ["Québec: duties on transfers of immovables", "https://www.quebec.ca/gouvernement/gestion-municipale/finances-fiscalite-municipales/fiscalite/droits-mutations-immobilieres"],
  mtl: ["Ville de Montréal: how property transfer duties are calculated", "https://montreal.ca/en/articles/how-property-transfer-duties-are-calculated-9279"],
  nb: ["New Brunswick: Real Property Transfer Tax Act", "https://laws.gnb.ca/en/showdoc/cs/R-2.1"],
  ns: ["Nova Scotia: municipal deed transfer tax rates", "https://novascotia.ca/sns/pdf/ans-property-dtt-rates.pdf"],
  pe: ["P.E.I.: real property transfer tax guide", "https://www.princeedwardisland.ca/sites/default/files/publications/rpttg_102.pdf"],
  ab: ["Alberta: land titles fee schedule", "https://www.alberta.ca/system/files/sartr-land-titles-and-surveys-common-documents-fee-schedule.pdf"],
  sk: ["ISC (Saskatchewan land titles): fees", "https://www.isc.ca/SignedInHome/Fees/Pages/default.aspx"],
  nl: ["Newfoundland and Labrador: registry of deeds fees", "https://www.gov.nl.ca/gs/files/forms-files-fees-deed.pdf"],
  onrst: ["Ontario: retail sales tax on insurance", "https://www.ontario.ca/document/retail-sales-tax/insurance-and-benefits-plans"],
  qcipt: ["Revenu Québec: tax on insurance premiums", "https://www.revenuquebec.ca/en/press-room/tax-news/details/2026-04-09/harmonization-of-the-insurance-premiums-tax-rate-with-the-qst-rate/"],
  skpst: ["Saskatchewan: PST on insurance premiums", "https://www.saskatchewan.ca/government/news-and-media/2017/may/17/changes-made-to-pst-on-insurance-premiums"],
  boc: ["Bank of Canada: policy interest rate", "https://www.bankofcanada.ca/core-functions/monetary-policy/key-interest-rate/"],
  renew: ["Financial Consumer Agency of Canada: renewing your mortgage", "https://www.canada.ca/en/financial-consumer-agency/services/mortgages/renew-mortgage.html"],
  interest: ["Financial Consumer Agency of Canada: interest on mortgages", "https://www.canada.ca/en/financial-consumer-agency/services/mortgages/interest-on-mortgages.html"],
  choose: ["Financial Consumer Agency of Canada: choosing a mortgage", "https://www.canada.ca/en/financial-consumer-agency/services/mortgages/choose-mortgage.html"],
  switch: ["OSFI: uninsured mortgage straight switches", "https://www.osfi-bsif.gc.ca/en/guidance/guidance-library/osfi-exempts-uninsured-mortgage-straight-switches-prescribed-mqr-implements-portfolio-lti-limits"],
  bocposted: ["Bank of Canada: posted interest rates offered by chartered banks", "https://www.bankofcanada.ca/rates/banking-and-financial-statistics/posted-interest-rates-offered-by-chartered-banks/"]
};
// The site's stick-figure mascot, holding up a % sign. pose: "hold" (default), "shrug" (something's missing)
function mascot(pose = "hold", size = 96){
  const arms = pose === "shrug" ? "M60,72 L38,64 L30,52 M60,72 L82,64 L90,52" : "M60,72 L37,58 L41,34 M60,72 L83,58 L79,34";  // shoulders on the body, clear of the head
  const sign = pose === "shrug"
    ? '<text x="22" y="30" class="mq">?</text><text x="92" y="26" class="mq">?</text>'
    : '<rect x="30" y="2" width="60" height="30" rx="8" class="ms"/><text x="60" y="25" text-anchor="middle" class="mp">%</text>';
  return `<svg class="mascot" width="${size}" height="${size * 1.25}" viewBox="0 0 120 150" aria-hidden="true">${sign}`
    + `<circle cx="60" cy="48" r="13" class="mk"/><circle cx="55.5" cy="45.5" r="1.8" class="md"/><circle cx="64.5" cy="45.5" r="1.8" class="md"/>`
    + `<path class="mk" d="${pose === "shrug" ? "M55,54 q5,-3 10,0" : "M55,52 q5,5 10,0"}"/>`
    + `<path class="mk" d="M60,61 L60,104 M60,104 L46,140 M60,104 L74,140 ${arms}"/></svg>`;
}
// A friendly message with the mascot, for errors and empty states
const mascotNote = (text, pose = "shrug") => `<div class="mnote">${mascot(pose, 56)}<p>${text}</p></div>`;

// Drawings play a short animation the first time they scroll into view (skipped if the visitor prefers less motion)
(function(){
  const figs = document.querySelectorAll("figure.ill");
  if (!figs.length || !("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  document.documentElement.classList.add("anim");
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("go"); io.unobserve(e.target); } }), {threshold: 0.35});
  figs.forEach(f => io.observe(f));
  addEventListener("beforeprint", () => figs.forEach(f => f.classList.add("go")));
})();
// Calculator messages: warnings stay in view; notes go in the result's "How this is worked out" panel (id + "_n")
function putMsgs(id, msgs){
  $(id).innerHTML = msgs.filter(m => m[0] === "w").map(([, t]) => `<p class="msg w">${t}</p>`).join("");
  const n = $(id + "_n"); if (n) n.innerHTML = msgs.filter(m => m[0] !== "w").map(([, t]) => `<p class="msg">${t}</p>`).join("");
}
// Printing shows the workings too
addEventListener("beforeprint", () => document.querySelectorAll("details.how").forEach(d => { d.open = true; }));
function srcLinks(keys){
  return '<b>Sources</b><ol class="refs">' + keys.map(k => `<li><a href="${SRC[k][1]}" target="_blank" rel="noopener">${SRC[k][0]}</a></li>`).join("") + '</ol>';
}
(function(){ const el = $("src"); if (el && el.dataset.keys) { el.className = "f src"; el.innerHTML = srcLinks(el.dataset.keys.split(",")); } })();


// ---- Shared mortgage maths ----
// Rate per period: Canadian fixed rates compound twice a year, variable rates monthly. k = payments per year.
const perPeriod = (rate, variable, k = 12) => variable ? Math.pow(1 + rate / 1200, 12 / k) - 1 : Math.pow(1 + rate / 200, 2 / k) - 1;
const pmt = (P, i, n) => i === 0 ? P / n : P * i / (1 - Math.pow(1 + i, -n));
const balanceAfter = (P, i, pay, m) => i === 0 ? P - pay * m : P * Math.pow(1 + i, m) - pay * (Math.pow(1 + i, m) - 1) / i;
const yrs = m => { m = Math.round(m); const y = Math.floor(m / 12), r = m % 12; return (y ? y + (y === 1 ? " year" : " years") : "") + (y && r ? ", " : "") + (r ? r + (r === 1 ? " month" : " months") : (y ? "" : "0 months")); };

// ---- Lenders: logo and chart colour ----
// Logos are the sharpest image each lender publishes, loaded from its own website. [address, zoom, which part to show, fit, tile colour]
const LOGOS = {
  "RBC Royal Bank": ["https://www.rbcroyalbank.com/dvl/v1.0/assets/images/logos/rbc-logo-shield.svg"],
  "TD Canada Trust": ["https://www.td.com/content/dam/tdct/images/navigation-header-and-footer/td-logo-desktop.png"],
  "Scotiabank": ["https://www.scotiabank.com/content/dam/scotiabank/images/logos/2023/scotiabank-logo-red-mobile.svg"],
  "Tangerine": ["https://www.tangerine.ca/etc.clientlibs/tangerine/clientlibs/clientlib-site/resources/icon-310x310.png"],
  "National Bank": ["https://www.bnc.ca/content/dam/bnc/commun/logo/logo-bnc-flag.svg"],
  "BMO": ["https://www.bmo.com/dist/favicon/apple-touch-icon.png"],
  "CIBC": ["https://www.cibc.com/content/dam/global-assets/logos/partner-logos/apple/apple-touch-icon-152x152.png"],
  "EQ Bank": ["https://images.ctfassets.net/ymwa45h4u77x/4oX5L57Tc4Xrv2iKG72VPN/481fb11b7a59027ebd4316579313fe3d/eqbank-logo.svg", 1, "left", "cover"],
  "ATB Financial": ["https://www.atb.com/static/img/apple-touch-icon-180x180.png"],
  "Meridian": ["https://www.meridiancu.ca/getContentAsset/6c76e806-df80-4b7c-a633-cab25199417c/dfc3d011-8f63-43f6-9ed8-4b444333a1d0/meridian-icon.svg?language=en-US"],
  "Servus Credit Union": ["https://servus.ca/media/ihwf0qof/favicon.png"],
  "Coast Capital Savings": ["https://www.coastcapitalsavings.com/media/3890/coast-capital-symbol_rgb_foamwhite.svg", 0.7, "center", "contain", "#0056FF"]  // white mark, shown on Coast's own blue
};
function logo(name, source){
  const w = name.split(/\s+/), ini = esc(/^[A-Z]{2,4}$/.test(w[0]) ? w[0] : w.map(x => x[0]).join("").slice(0, 2).toUpperCase());
  let [src, zoom, pos, fit, bg] = LOGOS[name] || [""];
  if (!src) { try { src = new URL(source).origin + "/favicon.ico"; } catch (e) {} }
  const st = `transform:scale(${+zoom || 1});object-position:${pos || "center"};object-fit:${fit || "contain"}`;
  return `<span class="lg-logo" aria-hidden="true"${bg ? ` style="background:${bg};border-radius:6px;overflow:hidden"` : ""}>${src ? `<img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" style="${st}" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${ini}'}))">` : `<span>${ini}</span>`}</span>`;
}
// Chart colours follow the lender, never its rank, so a bank keeps its colour when others are hidden.
const LENDER_ORDER = ["BMO", "CIBC", "EQ Bank", "Manulife Bank", "National Bank", "RBC Royal Bank", "Scotiabank", "Tangerine", "TD Canada Trust", "ATB Financial", "Alterna Savings", "Coast Capital Savings", "Desjardins", "First National", "Meridian", "Servus Credit Union", "Vancity"];
// Each lender keeps its chart colour for good: new lenders are added at the end of this list.
const LENDER_COLOURS = ["BMO", "CIBC", "EQ Bank", "National Bank", "RBC Royal Bank", "Scotiabank", "Tangerine", "TD Canada Trust", "ATB Financial", "Alterna Savings", "Coast Capital Savings", "Desjardins", "Servus Credit Union", "Manulife Bank", "Vancity", "Meridian", "First National"];
// Lenders that aren't banks (credit unions, co-operatives and ATB, an Alberta Crown corporation). Everyone else is listed as a bank.
const NON_BANKS = ["ATB Financial", "Alterna Savings", "Coast Capital Savings", "Desjardins", "First National", "Meridian", "Servus Credit Union", "Vancity"];
const LENDER_GROUPS = [["Banks", n => !NON_BANKS.includes(n)], ["Credit unions and other lenders", n => NON_BANKS.includes(n)]];
// Each lender's own page on this site: bmo-mortgage-rates.html and so on
const LENDER_SLUGS = {"BMO": "bmo", "CIBC": "cibc", "EQ Bank": "eq-bank", "National Bank": "national-bank", "RBC Royal Bank": "rbc", "Scotiabank": "scotiabank", "Tangerine": "tangerine", "TD Canada Trust": "td", "ATB Financial": "atb", "Alterna Savings": "alterna", "Coast Capital Savings": "coast-capital", "Desjardins": "desjardins", "Servus Credit Union": "servus", "Manulife Bank": "manulife-bank", "Vancity": "vancity", "Meridian": "meridian", "First National": "first-national"};
const seriesVar = name => { const i = LENDER_COLOURS.indexOf(name); return i < 0 ? "var(--mu)" : `var(--s${i + 1})`; };

// ---- Rate history (history.json, one value per lender, product and day) ----
function loadHistory(){ return fetch("history.json?t=" + Date.now(), {cache: "no-store"}).then(r => r.ok ? r.json() : {series: {}}).catch(() => ({series: {}})); }
// Change over the last 7 days: the current rate compared with the latest value recorded at least 7 days ago
// (or the earliest value, if the history is younger than that). null when there's nothing to compare.
function weekChange(points, current){
  if (!points || !points.length || current == null) return null;
  const cutoff = addDays(todayISO(), -7);
  const base = points.filter(p => p[0] <= cutoff).pop() || (points[0][0] < todayISO() ? points[0] : null);
  if (!base || Math.abs(current - base[1]) < 0.0005) return null;
  return {diff: current - base[1], from: base[1], date: base[0]};
}
function arrow(ch){
  if (!ch) return "";
  const up = ch.diff > 0, amt = Math.abs(ch.diff).toFixed(2);
  return `<span class="chg ${up ? "up" : "dn"}" title="${up ? "Up" : "Down"} ${amt} from ${pct(ch.from)} on ${dstr(ch.date)}"><span aria-hidden="true">${up ? "▲" : "▼"}</span>${amt}<span class="vh"> ${up ? "higher" : "lower"} than on ${dstr(ch.date)}</span></span>`;
}

// ---- Plain-language explanations: a "?" beside a term shows one of these ----
const GLOSSARY = {
  fixed: ["Fixed rate", "An interest rate that stays the same for your whole term, so your payment doesn't change. Fixed rates are usually a little higher than variable rates."],
  variable: ["Variable rate", "An interest rate that can go up or down during your term, because it moves with your lender's prime rate. It's often lower than a fixed rate to start, but it can change."],
  prime: ["Prime rate", "The rate each bank sets as its starting point for variable-rate loans. When the Bank of Canada changes its policy rate, banks usually change their prime rate too."],
  policy: ["Bank of Canada policy rate", "The interest rate the Bank of Canada sets to steer the economy. Banks' prime rates, and so variable mortgage rates, usually follow it."],
  posted: ["Posted rate", "A lender's standard advertised rate. Lenders often offer a lower \"special\" or discounted rate, and many people can negotiate a rate below the posted one."],
  special: ["Special-offer rate", "A discounted rate a lender advertises below its posted rate. Where a lender shows both, this site shows the special-offer rate."],
  term: ["Term", "How long your current rate and conditions last, often 1 to 5 years. When it ends, you renew, usually at a new rate."],
  amortization: ["Amortization", "The total time it would take to pay off your whole mortgage, often 25 or 30 years. A longer amortization means smaller payments but more interest overall."],
  principal: ["Principal", "The amount you actually borrowed. Each payment pays some interest and some principal."],
  interest: ["Interest", "What the lender charges you for borrowing, worked out on the amount you still owe."],
  down: ["Down payment", "The part of the home's price you pay yourself, up front. You borrow the rest. In Canada the minimum is 5% of the first $500,000 and 10% of the part above that, or 20% for homes of $1.5 million or more."],
  insurance: ["Mortgage default insurance", "Insurance you must buy if your down payment is under 20%. It protects the lender, not you, if the loan isn't repaid. The cost (the premium) is usually added to your mortgage."],
  gds: ["GDS (gross debt service)", "The share of your monthly income before tax that would go to housing: your mortgage payment, property tax, heating and half of any condo fees. For insured mortgages the limit is 39%."],
  tds: ["TDS (total debt service)", "Like GDS, but it also counts your other debt payments, such as car loans and credit cards. For insured mortgages the limit is 44%."],
  stress: ["Stress test", "To make sure you could still afford your payment if rates rose, lenders check whether you qualify at a higher rate: the greater of your rate plus 2% or 5.25%."],
  equity: ["Equity", "The part of your home you own outright: what it's worth minus what you still owe."],
  heloc: ["HELOC", "A home equity line of credit: a line of credit backed by your home that you can borrow from and repay as you like, up to a limit."],
  refinance: ["Refinancing", "Replacing your mortgage with a new, usually larger one, often to borrow against your home's equity."],
  prepayment: ["Prepayment privileges", "Extra payments your mortgage lets you make each year without a penalty, such as a yearly lump sum or a higher regular payment. Limits vary by lender."],
  penalty: ["Prepayment penalty", "A fee for paying off or breaking your mortgage before the end of its term. It's often three months' interest, or for fixed rates, sometimes a larger amount called the interest rate differential."],
  ird: ["Interest rate differential (IRD)", "One way lenders work out a penalty on a fixed-rate mortgage: roughly the interest they lose because rates have fallen since you signed."],
  ltt: ["Land transfer tax", "A tax most provinces charge when you buy a property, based on its price. Some cities, like Toronto and Montréal, add their own."],
  closing: ["Closing costs", "One-time costs paid when you buy, on top of your down payment: land transfer tax, legal fees, inspection, title insurance and so on."],
  renewal: ["Renewal", "When your term ends, you sign a new term, either with your current lender or a different one. Your lender must send a renewal statement at least 21 days before."],
  accelerated: ["Accelerated payments", "Paying half your monthly payment every two weeks (or a quarter every week). It adds up to one extra monthly payment a year, so you pay off your mortgage sooner."],
  rvr: ["Relationship pricing", "A lower rate some banks offer to clients who hold other products with them, such as a chequing account or investments."]
};
function tip(key){ const g = GLOSSARY[key]; return g ? `<button type="button" class="q" data-q="${key}" aria-label="What does ${esc(g[0])} mean?" aria-expanded="false">?</button>` : ""; }
function applyTips(root){ (root || document).querySelectorAll("[data-tip]:not([data-tipped])").forEach(el => { el.dataset.tipped = "1"; el.insertAdjacentHTML(el.dataset.tipAt === "after" ? "afterend" : "beforeend", " " + tip(el.dataset.tip)); }); }
(function(){
  let box = null, owner = null;
  const close = () => { if (box) { box.remove(); box = null; } if (owner) { owner.setAttribute("aria-expanded", "false"); owner = null; } };
  document.addEventListener("click", e => {
    const b = e.target.closest && e.target.closest("button.q");
    if (!b) { if (box && !box.contains(e.target)) close(); return; }
    e.preventDefault(); e.stopPropagation();
    const same = b === owner; close(); if (same) return;
    const g = GLOSSARY[b.dataset.q]; if (!g) return;
    owner = b; b.setAttribute("aria-expanded", "true");
    box = document.createElement("div"); box.className = "qpop"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", g[0]);
    box.innerHTML = `<b>${esc(g[0])}</b>${esc(g[1])}<a href="glossary.html#${b.dataset.q}">More terms in the glossary</a>`;
    document.body.appendChild(box);
    const r = b.getBoundingClientRect(), w = Math.min(320, innerWidth - 24);
    box.style.width = w + "px";
    box.style.left = Math.max(12, Math.min(innerWidth - w - 12, r.left + scrollX - w / 2 + r.width / 2)) + "px";
    box.style.top = (r.bottom + scrollY + 8) + "px";
  }, true);
  document.addEventListener("keydown", e => { if (e.key === "Escape" && box) { const o = owner; close(); o && o.focus(); } });
  addEventListener("resize", close);
  applyTips();
})();

// ---- Share links: a calculator's numbers saved in the page address ----
function fromURL(){
  const o = {}; new URLSearchParams(location.search).forEach((v, k) => { o[k] = v === "true" ? true : v === "false" ? false : (v !== "" && !isNaN(v) ? +v : v); });
  return o;
}
function copyLink(obj, btn){
  const url = location.origin + location.pathname + "?" + new URLSearchParams(Object.entries(obj).map(([k, v]) => [k, String(v)])).toString();
  const done = () => { const t = btn.textContent; btn.textContent = "Link copied"; setTimeout(() => { btn.textContent = t; }, 2000); };
  const fallback = () => { prompt("Copy this link:", url); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, fallback); else fallback();
  try { history.replaceState(null, "", url); } catch (e) {}
}
// "About $575 a month for every $100,000 you borrow" (25-year amortization)
const per100k = (rate, variable) => pmt(100000, perPeriod(rate, variable), 300);

// Printing: open collapsed sections so everything you entered prints, then put them back
addEventListener("beforeprint", () => document.querySelectorAll("details").forEach(d => { d.dataset.wasOpen = d.open ? "1" : ""; d.open = true; }));
addEventListener("afterprint", () => document.querySelectorAll("details").forEach(d => { if (d.dataset.wasOpen === "") d.open = false; }));
