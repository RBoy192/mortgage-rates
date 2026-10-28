// GIC ladder calculator: split an amount across 1- to 5-year GICs, each at today's highest advertised rate for its term
// (or all at one lender). Choices are kept in the address (?ladder=25000&rungs=3&prov=Ontario&lender=EQ Bank) to share.
(function(){
if (typeof SITE_VERSION === "undefined") return;
const Q = new URLSearchParams(location.search), KEY = "gic-ladder";
const PROVS = ["Ontario", "British Columbia", "Alberta", "Manitoba", "New Brunswick", "Newfoundland and Labrador", "Northwest Territories",
  "Nova Scotia", "Nunavut", "Prince Edward Island", "Quebec", "Saskatchewan", "Yukon"];
let all = [], st = {amt: 25000, rungs: 5, prov: "", lender: ""};
try { Object.assign(st, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) {}
try { if (!Q.has("prov")) st.prov = localStorage.getItem("home-prov") || st.prov; } catch (e) {}
if (+Q.get("ladder") > 0) st.amt = +Q.get("ladder");
if (Q.get("rungs") === "3" || Q.get("rungs") === "5") st.rungs = +Q.get("rungs");
if (Q.has("prov")) st.prov = Q.get("prov");
if (Q.has("lender")) st.lender = Q.get("lender");
if (!PROVS.includes(st.prov)) st.prov = "";
$("lad_amt").value = Math.round(st.amt).toLocaleString("en-CA");
$("lad_n").value = String(st.rungs);
$("lad_prov").insertAdjacentHTML("beforeend", PROVS.map(p => `<option${p === st.prov ? " selected" : ""}>${p}</option>`).join(""));
const serves = n => !st.prov || !LENDER_REGIONS[n] || LENDER_REGIONS[n].includes(st.prov);
const m2 = x => x.toLocaleString("en-CA", {style: "currency", currency: "CAD"});

function sync(){
  const q = new URLSearchParams();
  if (st.amt !== 25000) q.set("ladder", Math.round(st.amt));
  if (st.rungs !== 5) q.set("rungs", st.rungs);
  if (st.prov) q.set("prov", st.prov);
  if (st.lender) q.set("lender", st.lender);
  try { history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : "")); localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {}
}
function render(){
  st.amt = parseFloat(String($("lad_amt").value).replace(/[^0-9.]/g, "")) || 0;
  st.rungs = +$("lad_n").value; st.prov = $("lad_prov").value; st.lender = $("lad_who").value || (all.length ? "" : st.lender);
  const pool = all.filter(l => serves(l.name));
  const terms = st.rungs === 3 ? [1, 3, 5] : [1, 2, 3, 4, 5];
  // one lender for every rung: only lenders with a rate for each of the terms
  const full = pool.filter(l => terms.every(t => l.cells[t + "-year GIC"] && !l.cells[t + "-year GIC"].stale)).map(l => l.name).sort((a, b) => a.localeCompare(b));
  if (all.length && !full.includes(st.lender)) st.lender = "";
  $("lad_who").innerHTML = `<option value="">Highest rate for each term</option>` + full.map(x => `<option${x === st.lender ? " selected" : ""}>${esc(x)}</option>`).join("");
  sync();
  if (!all.length) return;
  if (!(st.amt > 0)) { $("lad_out").innerHTML = `<p class="m">Enter an amount to build your ladder.</p>`; return; }
  const per = st.amt / terms.length;
  const rungs = terms.map(t => {
    let best = null;
    pool.forEach(l => { const c = l.cells[t + "-year GIC"]; if (!c || c.stale || (st.lender && l.name !== st.lender)) return;
      if (!best || c.rate > best.rate) best = {rate: c.rate, names: [l.name]}; else if (c.rate === best.rate) best.names.push(l.name); });
    return {t, best};
  });
  if (rungs.some(r => !r.best)) { $("lad_out").innerHTML = `<p class="m">Not every term has an advertised rate${st.prov ? " in " + esc(st.prov) : ""} right now.</p>`; return; }
  const year1 = rungs.reduce((s, r) => s + per * r.best.rate / 100, 0), avg = rungs.reduce((s, r) => s + r.best.rate, 0) / rungs.length;
  const last = terms[terms.length - 1], longRate = rungs[rungs.length - 1].best.rate;
  $("lad_out").innerHTML = `<div class="c lres"><div class="k"><em>Interest in the first year</em><b>${m2(year1)}</b>An average of ${pct(+avg.toFixed(3))} across ${terms.length} GICs</div>`
    + `<div class="k"><em>Each GIC</em><b>${m2(per)}</b>${terms.length} equal parts of ${m2(st.amt)}</div></div>`
    + `<div class="t" tabindex="0" role="region" aria-label="Your GIC ladder"><table class="ltab dep ladt"><thead><tr><th scope="col">Term</th><th scope="col">Lender</th><th scope="col">Rate</th><th scope="col">Interest each year</th><th scope="col">Comes due</th></tr></thead><tbody>`
    + rungs.map(r => `<tr><td>${r.t} year${r.t > 1 ? "s" : ""}</td><td>${r.best.names.map(x => `<a href="${LENDER_SLUGS[x]}-mortgage-rates.html#depsec">${esc(x)}</a>`).join(", ")}</td><td><b>${pct(r.best.rate)}</b></td><td>${m2(per * r.best.rate / 100)}</td><td>${dstr(addDays(todayISO(), Math.round(r.t * 365.25)))}</td></tr>`).join("")
    + `</tbody></table></div>`
    + `<p class="f">Each time a GIC comes due, put the money into a new ${last}-year GIC (${pct(longRate)} today). After ${last - 1} years every rung earns the long-term rate, and one GIC still comes due ${st.rungs === 3 ? "every year or two" : "every year"}. Interest assumes it's paid out yearly; rates for new GICs will change.</p>`
    + `<div class="acts"><button type="button" class="lk" id="lad_share">Copy a link to this ladder</button><button type="button" class="lk" onclick="print()">Print results</button></div>`;
  $("lad_share").onclick = () => copyLink(Object.fromEntries(new URLSearchParams(location.search)), $("lad_share"));
}
$("lad_amt").addEventListener("input", render);
["lad_n", "lad_prov", "lad_who"].forEach(id => $(id).addEventListener("change", render));
render();
loadRates().then(d => { all = groupLenders(d); render(); }, () => { $("lad_out").innerHTML = `<p class="m">The latest rates didn't load. Please refresh the page.</p>`; });
})();
