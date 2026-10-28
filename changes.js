// Rate changes page: every change in lenders' advertised rates over the last 7, 30 or 90 days, grouped by day.
// Choices are kept in the address (?days=30&kind=gics&prov=Ontario) so a view can be shared.
(function(){
if (typeof SITE_VERSION === "undefined") return;
const Q = new URLSearchParams(location.search);
const ALL_PROVINCES = ["Ontario", "British Columbia", "Alberta", "Manitoba", "New Brunswick", "Newfoundland and Labrador", "Northwest Territories",
  "Nova Scotia", "Nunavut", "Prince Edward Island", "Quebec", "Saskatchewan", "Yukon"];
const PRODUCTS = {mortgages: COLUMNS.map(([, p]) => p).flatMap(p => [p, p + " insured"]), gics: GIC_COLUMNS.concat(RGIC_COLUMNS).map(([, p]) => p), savings: [SAVINGS, SAVINGS_PROMO]};
const WORD = {mortgages: "mortgage", gics: "GIC", savings: "savings"};
let days = [7, 30, 90].includes(+Q.get("days")) ? +Q.get("days") : 7;
let kind = PRODUCTS[Q.get("kind")] ? Q.get("kind") : "all";
let province = ALL_PROVINCES.includes(Q.get("prov")) ? Q.get("prov") : (() => { try { const p = localStorage.getItem("home-prov") || ""; return ALL_PROVINCES.includes(p) ? p : ""; } catch (e) { return ""; } })();
let hist = null;
$("prov").insertAdjacentHTML("beforeend", ALL_PROVINCES.map(p => `<option${p === province ? " selected" : ""}>${p}</option>`).join(""));
const serves = n => !province || !LENDER_REGIONS[n] || LENDER_REGIONS[n].includes(province);
const kindOf = p => PRODUCTS.mortgages.includes(p) ? "mortgages" : PRODUCTS.gics.includes(p) ? "gics" : "savings";
const press = (id, attr, v) => document.querySelectorAll(`#${id} button`).forEach(b => b.setAttribute("aria-pressed", String(b.dataset[attr] === String(v))));

function sync(){
  const q = new URLSearchParams();
  if (days !== 7) q.set("days", days);
  if (kind !== "all") q.set("kind", kind);
  if (province) q.set("prov", province);
  try { history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : "")); } catch (e) {}
}
function render(){
  press("cdays", "d", days); press("ckind", "k", kind);
  if (!hist) return;
  const since = addDays(todayISO(), -days + 1);
  const kinds = kind === "all" ? ["mortgages", "gics", "savings"] : [kind];
  const ch = rateChanges(hist, kinds.flatMap(k => PRODUCTS[k]), since, serves);
  // the Bank of Canada's own moves in the same period
  const boc = [["policy_rate", "Bank of Canada policy rate"], ["prime_rate", "Big-bank prime rate"]].flatMap(([k, label]) => {
    const pts = hist.series[k] || [], out = [];
    for (let j = 1; j < pts.length; j++) if (pts[j][0] >= since && Math.abs(pts[j][1] - pts[j - 1][1]) >= 0.0005) out.push({name: label, product: "", date: pts[j][0], from: pts[j - 1][1], to: pts[j][1], boc: true});
    return out;
  });
  const span = days === 7 ? "the last 7 days" : `the last ${days} days`;
  $("csum").innerHTML = kinds.map(k => {
    const c = ch.filter(x => kindOf(x.product) === k), up = c.filter(x => x.to > x.from).length, dn = c.length - up;
    return `<div class="k"><em>${WORD[k].charAt(0).toUpperCase() + WORD[k].slice(1)} rate changes</em><b>${c.length}</b>${c.length ? `${dn} cut${dn === 1 ? "" : "s"}, ${up} increase${up === 1 ? "" : "s"}` : "None in " + span}</div>`;
  }).join("");
  const all = boc.concat(ch).sort((a, b) => b.date.localeCompare(a.date) || (b.boc ? 1 : 0) - (a.boc ? 1 : 0));
  if (!all.length) { $("clist").innerHTML = `<p class="m">No lender${province ? " serving " + esc(province) : ""} changed its advertised ${kind === "all" ? "" : WORD[kind] + " "}rates in ${span}.</p>`; return; }
  const byDay = {};
  all.forEach(c => (byDay[c.date] = byDay[c.date] || []).push(c));
  $("clist").innerHTML = Object.keys(byDay).sort().reverse().map(d => {
    const label = new Date(d + "T12:00:00").toLocaleDateString("en-CA", {weekday: "long", month: "long", day: "numeric"});
    return `<h2 class="cday">${label}<span class="s"> ${agoText(d) === "today" || agoText(d) === "yesterday" ? "(" + agoText(d) + ")" : ""}</span></h2><ul class="clist">` + byDay[d].map(c => {
      const up = c.to > c.from, dep = !c.boc && kindOf(c.product) !== "mortgages";
      const who = c.boc ? `<b>${esc(c.name)}</b>` : `<a href="${LENDER_SLUGS[c.name]}-mortgage-rates.html${dep ? "#depsec" : ""}">${esc(c.name)}</a>`;
      return `<li class="${c.boc ? "boc" : ""}"><span class="chg ${up ? "up" : "dn"}${dep ? " dep" : ""}"><span aria-hidden="true">${up ? "▲" : "▼"}</span><span class="vh">${up ? "Up" : "Down"} </span>${Math.abs(c.to - c.from).toFixed(2)}</span>`
        + `<span class="cw">${who}${c.product ? `<span class="cp">${esc(c.product.replace(" insured", ", less than 20% down"))}</span>` : ""}</span><span class="cr">${pct(c.from)} <span aria-hidden="true">→</span><span class="vh">to</span> <b>${pct(c.to)}</b></span></li>`;
    }).join("") + "</ul>";
  }).join("");
}
$("cdays").onclick = e => { const b = e.target.closest("button[data-d]"); if (!b) return; days = +b.dataset.d; sync(); render(); };
$("ckind").onclick = e => { const b = e.target.closest("button[data-k]"); if (!b) return; kind = b.dataset.k; sync(); render(); };
$("prov").onchange = e => { province = e.target.value; try { localStorage.setItem("home-prov", province); } catch (er) {} sync(); render(); };
render();
loadHistory().then(h => { hist = h && h.series ? h : {series: {}}; render(); });
})();
