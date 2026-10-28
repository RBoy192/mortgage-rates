// The My rates page: pinned rates (add, remove, see where each stands) and alerts. Storage lives in myrates.js.
(function(){
if (typeof SITE_VERSION === "undefined") return;
let lenders = [];
const added = mrImport();
if (added) $("mr_msg").textContent = `Added ${added} rate${added > 1 ? "s and alerts" : " or alert"} from the link.`;
$("mr_p").innerHTML = MR_PRODUCTS.map(([g, ps]) => `<optgroup label="${g}">` + ps.map(p => `<option value="${esc(p)}">${esc(mrCap(p))}</option>`).join("") + `</optgroup>`).join("");
$("mr_prov").insertAdjacentHTML("beforeend", MR_PROVS.map(p => `<option>${p}</option>`).join(""));
try { const hp = localStorage.getItem("home-prov"); if (MR_PROVS.includes(hp)) $("mr_prov").value = hp; } catch (e) {}
const pageOf = p => p === SAVINGS ? "high-interest-savings-rates.html" : /GIC/.test(p) && !/redeemable/.test(p) ? p.replace(" GIC", "-gic-rates.html").replace(/^(\d)-year-gic/, "$1-year-gic") : /GIC/.test(p) ? "index.html#gics" : p.replace(/ /g, "-") + "-mortgage-rates.html";
function pins(){
  const rs = mrRefresh(lenders);
  $("mr_pins").innerHTML = !rs.length ? `<p class="m">Nothing here yet. Add a rate below, or tap the star on a rate card on the main page.</p>`
    : rs.map((r, i) => `<div class="mri"><em>${esc(mrLabel(r.p, r.prov))}</em>`
      + (!lenders.length ? `<b>…</b>` : r.best ? `<b>${pct(r.best.rate)}</b><span class="s">${isDeposit(r.p) ? "Highest" : "Lowest"}: ${mrWho(r.best)}</span>${mrChange(r)}` : `<b class="none">—</b><span class="s">No lender lists this rate right now.</span>`)
      + `<span class="s"><a href="${pageOf(r.p)}">See every lender</a></span><button type="button" class="lk rm" data-rm="${i}">Remove<span class="vh"> ${esc(mrLabel(r.p, r.prov))}</span></button></div>`).join("");
}
$("mr_pins").addEventListener("click", e => { const b = e.target.closest("button[data-rm]"); if (!b) return; const s = mrGet(); s.pins.splice(+b.dataset.rm, 1); mrSet(s); pins(); });
$("mr_add").onclick = () => {
  const p = $("mr_p").value, prov = $("mr_prov").value;
  if (mrPinned(p, prov)) { $("mr_msg").textContent = mrLabel(p, prov) + " is already in My rates."; return; }
  mrToggle(p, prov); $("mr_msg").textContent = "Added " + mrLabel(p, prov) + "."; pins();
};
const drawAlerts = mrAlertUI($("al_form"), $("al_list"), () => lenders);
$("mr_copy").onclick = () => {
  const url = mrLink(), b = $("mr_copy"), done = () => { const t = b.textContent; b.textContent = "Link copied"; setTimeout(() => { b.textContent = t; }, 2000); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => prompt("Copy this link:", url)); else prompt("Copy this link:", url);
};
pins(); drawAlerts();
loadRates().then(d => { lenders = groupLenders(d); pins(); drawAlerts(); }, () => { $("mr_msg").textContent = "The latest rates didn't load. Please refresh the page."; });
})();
