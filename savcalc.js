// Savings interest calculator: a balance, deposits each month, a regular rate and an optional promotional rate to start.
// Interest is worked out on the balance and paid monthly, like most savings accounts. Choices are kept and can be shared.
(function(){
if (typeof SITE_VERSION === "undefined") return;
const KEY = "savings-calc", PROVS = ["Ontario", "British Columbia", "Alberta", "Manitoba", "New Brunswick", "Newfoundland and Labrador", "Northwest Territories",
  "Nova Scotia", "Nunavut", "Prince Edward Island", "Quebec", "Saskatchewan", "Yukon"];
const DEF = {bal: 10000, add: 0, months: 12, prov: "", rate: "best", custom: 1.5, promo: false, prate: 4, pmonths: 3};
let st = Object.assign({}, DEF), all = [], filled = false;
try { Object.assign(st, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) {}
const q = fromURL();
Object.keys(DEF).forEach(k => { if (q[k] !== undefined) st[k] = q[k]; });
if (![6, 12, 24, 36, 60].includes(+st.months)) st.months = 12;
if (![2, 3, 4, 5, 6, 12].includes(+st.pmonths)) st.pmonths = 3;
if (!PROVS.includes(st.prov)) st.prov = "";
$("sv_prov").insertAdjacentHTML("beforeend", PROVS.map(p => `<option>${p}</option>`).join(""));
const m2 = x => x.toLocaleString("en-CA", {style: "currency", currency: "CAD"});
const serves = n => !st.prov || !LENDER_REGIONS[n] || LENDER_REGIONS[n].includes(st.prov);
function write(){ setv("sv_bal", st.bal); setv("sv_add", st.add); $("sv_months").value = st.months; $("sv_prov").value = st.prov; $("sv_custom").value = st.custom; $("sv_promo").checked = !!st.promo; $("sv_prate").value = st.prate; $("sv_pmonths").value = st.pmonths; }
function read(){
  st.bal = val("sv_bal"); st.add = val("sv_add"); st.months = +$("sv_months").value; st.prov = $("sv_prov").value;
  if (filled) st.rate = $("sv_rate").value || st.rate;
  st.custom = parseFloat($("sv_custom").value) || 0; st.promo = $("sv_promo").checked; st.prate = parseFloat($("sv_prate").value) || 0; st.pmonths = +$("sv_pmonths").value;
}
function rateOptions(){
  const offers = all.filter(l => serves(l.name) && l.cells[SAVINGS] && !l.cells[SAVINGS].stale).map(l => ({n: l.name, r: l.cells[SAVINGS].rate, promo: l.cells[SAVINGS_PROMO]})).sort((a, b) => b.r - a.r || a.n.localeCompare(b.n));
  let html = "";
  if (offers.length) {
    html += `<option value="best">Today's highest: ${pct(offers[0].r)} (${esc(offers.filter(o => o.r === offers[0].r).map(o => o.n).join(", "))})</option>`;
    html += `<optgroup label="Each lender's regular savings rate">` + offers.map(o => `<option value="${esc(o.n)}">${esc(o.n)}: ${pct(o.r)}</option>`).join("") + `</optgroup>`;
  }
  $("sv_rate").innerHTML = html + `<option value="custom">My own rate</option>`;
  if (!offers.length && all.length) st.rate = "custom";
  else if (st.rate !== "custom" && st.rate !== "best" && !offers.some(o => o.n === st.rate)) st.rate = "best";
  $("sv_rate").value = st.rate; filled = true;
  return offers;
}
// month by month: interest on the balance for the month at that month's rate, paid at month end, then the deposit
function run(P, add, months, rate, prate, pm){
  let bal = P, int = 0; const rows = [];
  for (let m = 1; m <= months; m++) {
    const r = (pm && m <= pm ? prate : rate) / 100, i = bal * r / 12;
    int += i; bal += i + add;
    rows.push({m, r: r * 100, i, bal});
  }
  return {int, bal, rows};
}
function render(){
  read();
  const offers = all.length ? rateOptions() : [];
  if (!all.length) $("sv_rate").value = "custom";
  const custom = $("sv_rate").value === "custom";
  $("sv_customl").hidden = !custom;
  $("sv_prl").hidden = $("sv_pml").hidden = !st.promo;
  const pick = st.rate === "best" ? offers[0] : offers.find(o => o.n === st.rate);
  const rate = custom || !pick ? st.custom : pick.r;
  const who = custom || !pick ? "your rate" : st.rate === "best" ? "today's highest advertised regular rate" : pick.n + "'s advertised regular rate";
  // a lender with an advertised promotional offer: say so, and offer to use it
  const promoLender = pick && pick.promo && !pick.promo.stale ? pick : null;
  try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {}
  const P = st.bal, add = st.add, n = st.months;
  if (!(P > 0 || add > 0) || !(rate > 0)) { $("sv_out").innerHTML = `<span class="m">Interest</span><b>—</b><ul><li>Enter a balance and a rate.</li></ul>`; $("sv_below").innerHTML = ""; return; }
  const pm = st.promo && st.prate > 0 ? Math.min(st.pmonths, n) : 0;
  const R = run(P, add, n, rate, st.prate, pm), base = pm ? run(P, add, n, rate, 0, 0) : null;
  const span = n % 12 ? `${n} months` : n === 12 ? "1 year" : `${n / 12} years`;
  const firstMonth = R.rows[0].i, perYear = P * rate / 100;
  $("sv_out").innerHTML = `<p class="say">${m2(P)}${add ? ` plus ${m2(add)} a month` : ""} would earn about ${m2(R.int)} in interest over ${span}${pm ? `, with ${pct(st.prate)} for the first ${pm} month${pm > 1 ? "s" : ""}` : ""}.</p>`
    + `<b>${m2(R.int)}</b><span class="big-sub">Interest over ${span}. Balance at the end: ${m2(R.bal)}.</span>`
    + (promoLender ? `<p class="s">${esc(promoLender.n)} also advertises a promotional rate of ${pct(promoLender.promo.rate)}${promoLender.promo.note ? ` (${esc(promoLender.promo.note)})` : ""}. <button type="button" class="lk" id="sv_use">Use it</button></p>` : "")
    + `<div class="how"><p class="howh">How this is worked out</p><ul>`
    + `<li>Regular rate: ${pct(rate)} a year, ${esc(who)}.${pm ? ` Promotional rate: ${pct(st.prate)} for the first ${pm} month${pm > 1 ? "s" : ""}.` : ""}</li>`
    + `<li>Each month: balance × yearly rate ÷ 12. Month 1: ${m2(P)} × ${+(R.rows[0].r / 100).toFixed(5)} ÷ 12 = ${m2(firstMonth)}. The interest is added to your balance, so it earns interest too.</li>`
    + (add ? `<li>Your ${m2(add)} goes in at the end of each month, after that month's interest.</li>` : "")
    + `<li>At ${pct(rate)}, ${m2(P)} earns about ${m2(perYear)} a year before any interest on interest.</li>`
    + (base ? `<li>Without the promotion: ${m2(base.int)}, so the promotion adds about ${m2(R.int - base.int)}.</li>` : "")
    + `</ul></div>`;
  if ($("sv_use")) $("sv_use").onclick = () => { $("sv_promo").checked = true; $("sv_prate").value = promoLender.promo.rate; render(); };
  const yearly = n > 24, rows = yearly ? R.rows.filter(r => r.m % 12 === 0) : R.rows;
  let cum = 0; const cumAt = {}; R.rows.forEach(r => { cum += r.i; cumAt[r.m] = cum; });
  $("sv_below").innerHTML = `<div class="t gi_t" tabindex="0" role="region" aria-label="${yearly ? "Year" : "Month"} by ${yearly ? "year" : "month"}"><table class="cmpt"><thead><tr><th scope="col">${yearly ? "Year" : "Month"}</th><th scope="col">Rate</th><th scope="col">Interest ${yearly ? "that year" : "that month"}</th><th scope="col">Interest so far</th><th scope="col">Balance</th></tr></thead><tbody>`
    + rows.map(r => { const i = yearly ? R.rows.filter(x => x.m > r.m - 12 && x.m <= r.m).reduce((s, x) => s + x.i, 0) : r.i;
      return `<tr><td>${yearly ? "Year " + r.m / 12 : "Month " + r.m}</td><td>${pct(+r.r.toFixed(2))}</td><td>${m2(i)}</td><td>${m2(cumAt[r.m])}</td><td>${m2(r.bal)}</td></tr>`; }).join("")
    + `</tbody></table></div>`;
  try { const u = new URLSearchParams(); Object.keys(DEF).forEach(k => { if (k === "rate" ? st.rate !== "best" : String(st[k]) !== String(DEF[k])) u.set(k, st[k]); });
    history.replaceState(null, "", location.pathname + (u.toString() ? "?" + u : "")); } catch (e) {}
}
$("sv_form").addEventListener("input", render);
$("sv_form").addEventListener("change", render);
$("sv_reset").onclick = () => { st = Object.assign({}, DEF); write(); if (all.length) rateOptions(); render(); };
$("sv_share").onclick = () => copyLink(Object.fromEntries(new URLSearchParams(location.search)), $("sv_share"));
write(); render();
loadRates().then(d => { all = groupLenders(d); render(); }, () => render());
})();
