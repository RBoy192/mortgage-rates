// My rates: rates a visitor pins (a star on any rate card) and alerts they set ("tell me when the highest 1-year GIC
// is above 3.75%"). Kept only in this browser (localStorage "my-rates"); nothing is sent anywhere.
// A link can carry them to another device (?mr=...). Used by the main page, My rates and Rate alerts.
const MR_KEY = "my-rates";
const MR_PROVS = ["Ontario", "British Columbia", "Alberta", "Manitoba", "New Brunswick", "Newfoundland and Labrador", "Northwest Territories",
  "Nova Scotia", "Nunavut", "Prince Edward Island", "Quebec", "Saskatchewan", "Yukon"];
const MR_PRODUCTS = [["Mortgages", COLUMNS.map(([, p]) => p)], ["GICs", GIC_COLUMNS.map(([, p]) => p).concat(["1-year redeemable GIC"])], ["Savings", [SAVINGS]]];
const mrCap = p => p.charAt(0).toUpperCase() + p.slice(1);
const mrLabel = (p, prov) => mrCap(p) + (p === SAVINGS ? " account" : "") + (prov ? ", " + prov : "");
const mrKey = (p, prov) => p + "|" + (prov || "");
function mrGet(){
  try { const o = JSON.parse(localStorage.getItem(MR_KEY) || "{}"); return {pins: Array.isArray(o.pins) ? o.pins : [], alerts: Array.isArray(o.alerts) ? o.alerts : [], seen: o.seen || {}}; }
  catch (e) { return {pins: [], alerts: [], seen: {}}; }
}
function mrSet(s){ try { localStorage.setItem(MR_KEY, JSON.stringify(s)); } catch (e) {} }
// The best advertised rate for a product (lowest for mortgages, highest for GICs and savings), among lenders serving a province
function mrBest(lenders, p, prov){
  const dep = isDeposit(p); let best = null;
  lenders.forEach(l => {
    if (prov && LENDER_REGIONS[l.name] && !LENDER_REGIONS[l.name].includes(prov)) return;
    const c = l.cells[p]; if (!c || c.stale) return;
    if (!best || (dep ? c.rate > best.rate : c.rate < best.rate)) best = {rate: c.rate, names: [l.name]};
    else if (c.rate === best.rate) best.names.push(l.name);
  });
  return best;
}
const mrPinned = (p, prov) => mrGet().pins.some(x => x.p === p && (x.prov || "") === (prov || ""));
function mrToggle(p, prov){
  const s = mrGet(), i = s.pins.findIndex(x => x.p === p && (x.prov || "") === (prov || ""));
  if (i >= 0) s.pins.splice(i, 1); else s.pins.push({p, prov: prov || ""});
  mrSet(s); return i < 0;
}
// a star for a rate card: pins that product (and province) to My rates
function pinBtn(p, prov){
  const on = mrPinned(p, prov), what = mrLabel(p, prov);
  return `<button type="button" class="pin" data-pin="${esc(p)}" data-prov="${esc(prov || "")}" aria-pressed="${on}" title="${on ? "In My rates: tap to remove" : "Add to My rates"}"><span aria-hidden="true">${on ? "★" : "☆"}</span><span class="vh">${on ? "Remove " + esc(what) + " from" : "Add " + esc(what) + " to"} My rates</span></button>`;
}
// Remembers each pinned rate as it was last seen; when it has moved since, keeps the earlier figure to show the change
function mrRefresh(lenders){
  const s = mrGet(), today = todayISO();
  const out = s.pins.map(x => {
    const k = mrKey(x.p, x.prov), b = mrBest(lenders, x.p, x.prov);
    let sn = s.seen[k];
    if (b) {
      if (!sn) sn = {rate: b.rate, at: today};
      else if (Math.abs(sn.rate - b.rate) >= 0.0005) sn = {rate: b.rate, at: today, prev: sn.rate, prevAt: sn.at};
      s.seen[k] = sn;
    }
    return Object.assign({}, x, {best: b, seen: sn});
  });
  mrSet(s);
  return out;
}
function mrAlerts(lenders){
  return mrGet().alerts.map(a => { const b = mrBest(lenders, a.p, a.prov); return Object.assign({}, a, {best: b, met: !!b && (a.dir === "above" ? b.rate >= a.rate : b.rate <= a.rate)}); });
}
const mrWho = b => b.names.length > 2 ? esc(b.names.slice(0, 2).join(", ")) + ` and ${b.names.length - 2} more` : esc(b.names.join(" and "));
function mrChange(r){
  const sn = r.seen; if (!sn || sn.prev == null) return "";
  const d = sn.rate - sn.prev, dep = isDeposit(r.p), good = dep ? d > 0 : d < 0;
  return `<span class="chg ${d > 0 ? "up" : "dn"}${dep ? " dep" : ""}" title="${good ? "Better" : "Worse"} for you than when you looked on ${dstr(sn.prevAt)}"><span aria-hidden="true">${d > 0 ? "▲" : "▼"}</span>${Math.abs(d).toFixed(2)}<span class="vh"> ${d > 0 ? "higher" : "lower"}</span></span><span class="s">since you looked on ${dstr(sn.prevAt)} (${pct(sn.prev)})</span>`;
}
const mrAlertText = a => `${esc(mrLabel(a.p, a.prov))} ${a.dir === "above" ? "at or above" : "at or below"} ${pct(a.rate)}`;
// The strip at the top of the main page: pinned rates, and any alert that has been met
function mrCard(el, lenders){
  if (!el) return;
  const pins = mrRefresh(lenders), alerts = mrAlerts(lenders), met = alerts.filter(a => a.met);
  if (!pins.length && !alerts.length) {
    el.innerHTML = `<p class="mrhint"><span aria-hidden="true">☆</span> Tap the star on any rate card to keep that rate in <a href="my-rates.html">My rates</a>, or set an alert for when a rate crosses a level you choose.</p>`;
    el.hidden = false; return;
  }
  el.innerHTML = `<div class="mrhead"><h2 class="mrh">My rates</h2><a href="my-rates.html">Edit or add alerts <span aria-hidden="true">→</span></a></div>`
    + (met.length ? met.map(a => `<p class="mralert"><b>Alert:</b> ${a.best.names.length ? mrWho(a.best) : ""} ${a.best.names.length > 1 ? "have" : "has"} ${esc(a.p)}${a.prov ? " in " + esc(a.prov) : ""} at <b>${pct(a.best.rate)}</b>, ${a.dir === "above" ? "at or above" : "at or below"} your ${pct(a.rate)}.</p>`).join("") : "")
    + (pins.length ? `<div class="mrlist">` + pins.map(r => `<div class="mri"><em>${esc(mrLabel(r.p, r.prov))}</em>`
      + (r.best ? `<b>${pct(r.best.rate)}</b><span class="s">${isDeposit(r.p) ? "Highest" : "Lowest"}: ${mrWho(r.best)}</span>${mrChange(r)}` : `<b class="none">—</b><span class="s">No lender lists this rate right now.</span>`) + `</div>`).join("") + `</div>` : "")
    + (alerts.length && !met.length ? `<p class="s mrwait">${alerts.length} alert${alerts.length > 1 ? "s" : ""} set; none met yet.</p>` : "");
  el.hidden = false;
}
// A form to add an alert, and the list of alerts with where each stands today
function mrAlertUI(form, list, getLenders, after){
  const opts = MR_PRODUCTS.map(([g, ps]) => `<optgroup label="${g}">` + ps.map(p => `<option value="${esc(p)}">${esc(mrCap(p))}</option>`).join("") + `</optgroup>`).join("");
  form.innerHTML = `<div class="pf"><label for="al_p">When the best</label><select id="al_p">${opts}</select></div>`
    + `<div class="pf"><label for="al_dir">rate is</label><select id="al_dir"><option value="above">at or above</option><option value="below">at or below</option></select></div>`
    + `<div class="pf"><label for="al_rate">Rate</label><span class="dl"><input id="al_rate" type="text" inputmode="decimal" autocomplete="off" placeholder="e.g. 3.75"><span aria-hidden="true">%</span></span></div>`
    + `<div class="pf"><label for="al_prov">Province</label><select id="al_prov"><option value="">All provinces</option>${MR_PROVS.map(p => `<option>${p}</option>`).join("")}</select></div>`
    + `<div class="pf"><span class="pfl" aria-hidden="true">&nbsp;</span><button type="button" class="btn" id="al_add">Add alert</button></div><p class="s" id="al_msg" role="status"></p>`;
  const sync = () => { $("al_dir").value = isDeposit($("al_p").value) ? "above" : "below"; };
  $("al_p").addEventListener("change", sync); sync();
  const draw = () => {
    const ls = getLenders(), al = mrAlerts(ls);
    list.innerHTML = !al.length ? `<p class="m">No alerts yet.</p>` : `<ul class="mral">` + al.map((a, i) => `<li class="${a.met ? "met" : ""}"><span><b>${mrAlertText(a)}</b><span class="s">${!ls.length ? "" : !a.best ? "No lender lists this rate right now." : a.met ? `Met now: ${mrWho(a.best)} at ${pct(a.best.rate)}.` : `Not yet: the ${isDeposit(a.p) ? "highest" : "lowest"} is ${pct(a.best.rate)} (${mrWho(a.best)}).`}</span></span><button type="button" class="lk" data-del="${i}">Remove<span class="vh"> this alert</span></button></li>`).join("") + `</ul>`;
    if (after) after();
  };
  $("al_add").onclick = () => {
    const rate = parseFloat(String($("al_rate").value).replace(",", "."));
    if (!(rate > 0 && rate < 20)) { $("al_msg").textContent = "Enter a rate, like 3.75."; $("al_rate").focus(); return; }
    const s = mrGet(); s.alerts.push({p: $("al_p").value, dir: $("al_dir").value, rate: +rate.toFixed(2), prov: $("al_prov").value}); mrSet(s);
    $("al_msg").textContent = "Alert added. It's checked each time you open this site."; $("al_rate").value = ""; draw();
  };
  list.addEventListener("click", e => { const b = e.target.closest("button[data-del]"); if (!b) return; const s = mrGet(); s.alerts.splice(+b.dataset.del, 1); mrSet(s); draw(); });
  return draw;
}
// Moving My rates to another device: a link that carries the pins and alerts (not the "last seen" figures)
function mrLink(){
  const s = mrGet(), data = btoa(unescape(encodeURIComponent(JSON.stringify({pins: s.pins, alerts: s.alerts}))));
  return location.origin + "/my-rates.html?mr=" + encodeURIComponent(data);
}
function mrImport(){
  const q = new URLSearchParams(location.search).get("mr"); if (!q) return 0;
  let n = 0;
  try {
    const o = JSON.parse(decodeURIComponent(escape(atob(q)))), s = mrGet(), ok = p => MR_PRODUCTS.some(([, ps]) => ps.includes(p));
    (o.pins || []).forEach(x => { if (ok(x.p) && !s.pins.some(y => y.p === x.p && (y.prov || "") === (x.prov || ""))) { s.pins.push({p: x.p, prov: MR_PROVS.includes(x.prov) ? x.prov : ""}); n++; } });
    (o.alerts || []).forEach(a => { if (ok(a.p) && +a.rate > 0 && (a.dir === "above" || a.dir === "below")) { s.alerts.push({p: a.p, dir: a.dir, rate: +a.rate, prov: MR_PROVS.includes(a.prov) ? a.prov : ""}); n++; } });
    mrSet(s);
  } catch (e) {}
  try { history.replaceState(null, "", location.pathname); } catch (e) {}
  return n;
}
// Stars anywhere on a page: tapping one pins or unpins that rate
document.addEventListener("click", e => {
  const b = e.target.closest("button.pin"); if (!b) return;
  const on = mrToggle(b.dataset.pin, b.dataset.prov);
  document.querySelectorAll(`button.pin[data-pin="${CSS.escape(b.dataset.pin)}"][data-prov="${CSS.escape(b.dataset.prov)}"]`).forEach(x => { const t = document.createElement("div"); t.innerHTML = pinBtn(x.dataset.pin, x.dataset.prov); const n = t.firstChild;
    x.setAttribute("aria-pressed", n.getAttribute("aria-pressed")); x.title = n.title; x.innerHTML = n.innerHTML; });  // updated in place, so focus stays put
  document.dispatchEvent(new CustomEvent("myrates", {detail: {on}}));
});
