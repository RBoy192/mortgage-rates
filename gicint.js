// GIC interest calculator: interest paid out each year vs compounded, at today's highest advertised rate,
// a chosen lender's rate, or your own. Choices are kept in this browser and can be shared as a link.
(function(){
if (typeof SITE_VERSION === "undefined") return;
const KEY = "gic-interest", PROVS = ["Ontario", "British Columbia", "Alberta", "Manitoba", "New Brunswick", "Newfoundland and Labrador", "Northwest Territories",
  "Nova Scotia", "Nunavut", "Prince Edward Island", "Quebec", "Saskatchewan", "Yukon"];
const DEF = {amt: 10000, term: 1, type: "non", prov: "", rate: "best", custom: 3.5};
let st = Object.assign({}, DEF), all = [], filled = false;  // filled: the rate list holds real rates
try { Object.assign(st, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) {}
try { if (!localStorage.getItem(KEY)) st.prov = localStorage.getItem("home-prov") || ""; } catch (e) {}
const q = fromURL();
["amt", "term", "type", "prov", "rate", "custom"].forEach(k => { if (q[k] !== undefined) st[k] = q[k]; });
st.term = [1, 2, 3, 4, 5].includes(+st.term) ? +st.term : 1;
if (st.type !== "red") st.type = "non";
if (!PROVS.includes(st.prov)) st.prov = "";
$("gi_prov").insertAdjacentHTML("beforeend", PROVS.map(p => `<option>${p}</option>`).join(""));
const m2 = x => x.toLocaleString("en-CA", {style: "currency", currency: "CAD"});
const product = () => st.term + (st.type === "red" ? "-year redeemable GIC" : "-year GIC");
const serves = n => !st.prov || !LENDER_REGIONS[n] || LENDER_REGIONS[n].includes(st.prov);

function write(){ setv("gi_amt", st.amt); $("gi_term").value = st.term; $("gi_type").value = st.type; $("gi_prov").value = st.prov; $("gi_custom").value = st.custom; }
function read(){ st.amt = val("gi_amt"); st.term = +$("gi_term").value; st.type = $("gi_type").value; st.prov = $("gi_prov").value; if (filled) st.rate = $("gi_rate").value || st.rate; st.custom = parseFloat($("gi_custom").value) || 0; }
// the rate list: today's highest for this term, then each lender's rate, highest first, then your own
function rateOptions(){
  const p = product(), offers = all.filter(l => serves(l.name) && l.cells[p] && !l.cells[p].stale).map(l => ({n: l.name, r: l.cells[p].rate})).sort((a, b) => b.r - a.r || a.n.localeCompare(b.n));
  const words = `${st.term}-year ${st.type === "red" ? "redeemable" : "non-redeemable"} GIC`;
  let html = "";
  if (offers.length) {
    const top = offers.filter(o => o.r === offers[0].r).map(o => o.n).join(", ");
    html += `<option value="best">Today's highest: ${pct(offers[0].r)} (${esc(top)})</option>`;
    html += `<optgroup label="Each lender's ${esc(words)} rate">` + offers.map(o => `<option value="${esc(o.n)}">${esc(o.n)}: ${pct(o.r)}</option>`).join("") + `</optgroup>`;
  }
  html += `<option value="custom">My own rate</option>`;
  $("gi_rate").innerHTML = html;
  if (!offers.length && all.length) st.rate = "custom";
  else if (st.rate !== "custom" && st.rate !== "best" && !offers.some(o => o.n === st.rate)) st.rate = "best";
  $("gi_rate").value = st.rate; filled = true;
  return offers;
}
function render(){
  read();
  const offers = all.length ? rateOptions() : [];
  if (!all.length) $("gi_rate").value = "custom";
  $("gi_customl").hidden = $("gi_rate").value !== "custom";
  const pick = st.rate === "best" ? offers[0] : offers.find(o => o.n === st.rate);
  const rate = $("gi_rate").value === "custom" || !pick ? st.custom : pick.r;
  const who = $("gi_rate").value === "custom" || !pick ? "your rate" : st.rate === "best" ? "today's highest advertised rate" : pick.n + "'s advertised rate";
  try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {}
  const P = st.amt, r = rate / 100, n = st.term;
  if (!(P > 0) || !(r > 0)) { $("gi_out").innerHTML = `<span class="m">Interest over the term</span><b>—</b><ul><li>Enter an amount and a rate.</li></ul>`; $("gi_below").innerHTML = ""; return; }
  const paid = P * r * n, comp = P * Math.pow(1 + r, n) - P;
  let rows = "", bal = P;
  for (let y = 1; y <= n; y++) { const i = bal * r; bal += i; rows += `<tr><td>Year ${y}</td><td>${m2(P * r)}</td><td>${m2(i)}</td><td>${m2(bal)}</td></tr>`; }
  $("gi_out").innerHTML = `<p class="say">${m2(P)} in a ${n}-year GIC at ${pct(rate)} would earn about ${m2(comp)} if the interest is added on each year, or ${m2(paid)} if it's paid out to you.</p>`
    + `<b>${m2(comp)}</b><span class="big-sub">Interest over ${n} year${n > 1 ? "s" : ""}, compounded. You get back ${m2(P + comp)}.</span>`
    + `<div class="how"><p class="howh">How this is worked out</p><ul>`
    + `<li>Rate: ${pct(rate)} a year, ${esc(who)}.</li>`
    + `<li>Paid out each year: ${m2(P)} × ${+r.toFixed(5)} = ${m2(P * r)} a year, so ${m2(paid)} over ${n} year${n > 1 ? "s" : ""}. Your ${m2(P)} stays the same.</li>`
    + `<li>Compounded: ${m2(P)} × (1 + ${+r.toFixed(5)})<sup>${n}</sup> = ${m2(P + comp)}, so ${m2(comp)} of interest.${n > 1 ? ` That's ${m2(comp - paid)} more than having it paid out, because the interest earns interest.` : " For a 1-year GIC both ways come to the same."}</li>`
    + `</ul></div>`;
  $("gi_below").innerHTML = n > 1 ? `<div class="t gi_t" tabindex="0" role="region" aria-label="Year by year"><table class="cmpt"><thead><tr><th scope="col">Year</th><th scope="col">Paid out to you</th><th scope="col">Compounded: interest that year</th><th scope="col">Compounded: balance</th></tr></thead><tbody>${rows}</tbody></table></div>` : "";
  try { const u = new URLSearchParams(); if (st.amt !== DEF.amt) u.set("amt", Math.round(st.amt)); if (st.term !== 1) u.set("term", st.term); if (st.type !== "non") u.set("type", st.type); if (st.prov) u.set("prov", st.prov); if (st.rate !== "best") u.set("rate", st.rate); if (st.rate === "custom") u.set("custom", st.custom);
    history.replaceState(null, "", location.pathname + (u.toString() ? "?" + u : "")); } catch (e) {}
}
$("gi_form").addEventListener("input", render);
$("gi_form").addEventListener("change", render);
$("gi_reset").onclick = () => { st = Object.assign({}, DEF); write(); rateOptions(); render(); };
$("gi_share").onclick = () => copyLink(Object.fromEntries(new URLSearchParams(location.search)), $("gi_share"));
write(); render();
loadRates().then(d => { all = groupLenders(d); render(); }, () => render());
})();
