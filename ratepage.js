// Rate-type pages (<body data-term="5-year fixed">) and lender pages (<body data-lender="BMO">).
// Everything comes from rates.json and history.json, the same files the main page uses, so the numbers always match.
(function(){
if (typeof SITE_VERSION === "undefined") return;
const term = document.body.dataset.term, lender = document.body.dataset.lender;
const TERMS = COLUMNS.map(([, p]) => p);
const dep = !!term && isDeposit(term);  // GIC and savings pages: the highest rate is the best
const termPage = p => p === SAVINGS ? "high-interest-savings-rates.html" : isDeposit(p) ? p.toLowerCase().replace(/ /g, "-") + "-rates.html" : p.replace(/ /g, "-") + "-mortgage-rates.html";
const nameOf = p => p === SAVINGS ? "savings account" : p;
const lenderPage = n => (LENDER_SLUGS[n] || n.toLowerCase().replace(/[^a-z0-9]+/g, "-")) + "-mortgage-rates.html";
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const ord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
let hist = {series: {}}, lenders = [], updatedAt = null;

function tick(){
  if (!updatedAt) return;
  const old = Date.now() - new Date(updatedAt) > 3 * 3600e3;
  $("updated").className = old ? "sw" : "m";
  $("updated").textContent = "Last updated " + fmt(updatedAt) + (old ? ". Rates may be out of date." : "");
}

// Lenders that list this rate, lowest first. Ties share a rank.
function ranked(p){
  const hi = isDeposit(p) ? -1 : 1;
  const rows = lenders.filter(l => l.cells[p]).map(l => ({l, c: l.cells[p]})).sort((a, b) => hi * (a.c.rate - b.c.rate) || a.l.name.localeCompare(b.l.name));
  rows.forEach((r, i) => { r.rank = i && Math.abs(r.c.rate - rows[i - 1].c.rate) < 0.0005 ? rows[i - 1].rank : i + 1; });
  return rows;
}

function renderTerm(){
  const rows = ranked(term), best = rows.length ? rows[0].c.rate : null;
  $("best").innerHTML = best == null ? "" : `<div class="k"><em>${dep ? "Highest" : "Lowest"} ${esc(nameOf(term))} rate today</em><b>${pct(best)}</b>${rows.filter(r => r.rank === 1).map(r => esc(r.l.name)).join(", ")}</div>`
    + `<div class="k"><em>${dep ? "Lowest" : "Highest"}</em><b>${pct(rows[rows.length - 1].c.rate)}</b>${esc(rows[rows.length - 1].l.name)}</div>`
    + `<div class="k"><em>Lenders compared</em><b>${rows.length}</b>Updated every hour</div>`;
  $("rows").innerHTML = rows.map(r => {
    const ch = r.c.stale ? null : weekChange(hist.series[r.l.name + "|" + term], r.c.rate), gap = dep ? best - r.c.rate : r.c.rate - best;
    return `<tr${r.rank === 1 ? ' class="top"' : ""}><td class="rk">${r.rank}</td>`
      + `<td class="ln">${logo(r.l.name, r.l.source)}<a href="${lenderPage(r.l.name)}">${esc(r.l.name)}</a>${dep && r.c.note ? `<span class="pn">${esc(r.c.note)}</span>` : ""}</td>`
      + `<td class="rate${r.rank === 1 ? " low" : ""}${r.c.stale ? " st" : ""}">${arrow(ch)}<b>${pct(r.c.rate)}</b></td>`
      + `<td class="gap">${gap < 0.0005 ? `<span class="lowtag">${dep ? "Highest" : "Lowest"}</span>` : (dep ? "−" : "+") + gap.toFixed(2)}</td></tr>`;
  }).join("") || `<tr><td colspan="4">No lender lists this rate right now.</td></tr>`;
  $("stalenote").hidden = !rows.some(r => r.c.stale);
  if (window.histChart) histChart($("chart"), cap(nameOf(term)) + " rates over time",
    rows.map(r => r.l.name).filter(n => hist.series[n + "|" + term]).map(n => ({name: n, color: seriesVar(n), points: hist.series[n + "|" + term]})));
}

function renderLender(){
  const l = lenders.find(x => x.name === lender);
  if (!l) { $("cards").innerHTML = '<p class="m">This lender\'s rates aren\'t available right now.</p>'; return; }
  $("lsrc").innerHTML = `<b>Where these rates come from</b><ol class="refs"><li><a href="${esc(l.source)}" target="_blank" rel="noopener">${esc(lender)}: mortgage rates${EXT}</a></li></ol>`;
  $("cards").innerHTML = TERMS.map(p => {
    const c = l.cells[p];
    if (!c) return `<div class="k"><em>${esc(cap(p))}</em><b class="none">—</b><span class="s">${esc(lender)} doesn't list this rate.</span></div>`;
    const rows = ranked(p), me = rows.find(r => r.l === l), best = rows[0];
    const ch = c.stale ? null : weekChange(hist.series[lender + "|" + p], c.rate);
    const tied = rows.filter(r => r.rank === me.rank).length > 1;
    const standing = me.rank === 1 ? (tied ? `Tied for lowest of ${rows.length} lenders` : `Lowest of ${rows.length} lenders`)
      : `${tied ? "Tied " : ""}${ord(me.rank)} lowest of ${rows.length} lenders. Lowest: ${pct(best.c.rate)} at <a href="${lenderPage(best.l.name)}">${esc(best.l.name)}</a>`;
    return `<div class="k${me.rank === 1 ? " lowk" : ""}${c.stale ? " st" : ""}"><em><a href="${termPage(p)}">${esc(cap(p))}</a></em><b>${pct(c.rate)}</b>${arrow(ch)}`
      + `<span class="s">${standing}</span>` + (c.note ? `<span class="s">${esc(c.note)}</span>` : "")
      + (c.stale ? `<span class="s sw">Couldn't be refreshed in the latest update</span>` : "") + `</div>`;
  }).join("");
  renderDeposits(l);
  if (window.histChart) histChart($("chart"), lender + " rates over time",
    TERMS.filter(p => hist.series[lender + "|" + p]).map((p, i) => ({name: cap(p), color: `var(--s${i + 1})`, points: hist.series[lender + "|" + p]})));
  const others = lenders.map(x => x.name).filter(n => n !== lender).sort();
  $("others").innerHTML = others.map(n => `<a href="${lenderPage(n)}">${logo(n, (lenders.find(x => x.name === n) || {}).source)}${esc(n)}</a>`).join("");
}

// GIC and savings rates on a lender page, ranked among lenders (highest first)
function renderDeposits(l){
  if (!$("dcards")) return;
  const items = [...GIC_COLUMNS.map(([, p]) => [p, p]), ["1-year redeemable GIC", "1-year redeemable GIC"], ["Savings account (regular rate)", SAVINGS]].filter(([, p]) => l.cells[p]);
  $("depsec").hidden = !items.length;
  if (!items.length) return;
  $("dcards").innerHTML = items.map(([label, p]) => {
    const c = l.cells[p], rows = ranked(p), me = rows.find(r => r.l === l), best = rows[0];
    const tied = rows.filter(r => r.rank === me.rank).length > 1;
    const standing = me.rank === 1 ? (tied ? `Tied for highest of ${rows.length} lenders` : `Highest of ${rows.length} lenders`)
      : `${tied ? "Tied " : ""}${ord(me.rank)} highest of ${rows.length}. Highest: ${pct(best.c.rate)} at <a href="${lenderPage(best.l.name)}">${esc(best.l.name)}</a>`;
    const head = p === SAVINGS || p.includes("redeemable") ? esc(cap(label)) : `<a href="${termPage(p)}">${esc(cap(label))}</a>`;
    return `<div class="k${me.rank === 1 ? " lowk" : ""}${c.stale ? " st" : ""}"><em>${p === SAVINGS ? `<a href="${termPage(p)}">${esc(label)}</a>` : head}</em><b>${pct(c.rate)}</b>`
      + `<span class="s">${standing}</span>` + (c.note ? `<span class="s">${esc(c.note)}</span>` : "")
      + (c.stale ? `<span class="s sw">Couldn't be refreshed in the latest update</span>` : "") + `</div>`;
  }).join("");
  const promo = l.cells[SAVINGS_PROMO];
  $("dpromo").innerHTML = promo && !promo.stale ? `<b>Promotional savings offer:</b> ${pct(promo.rate)}${promo.note ? ` (${esc(promo.note)})` : ""}. When it ends, the regular rate applies.` : "";
  $("dpromo").hidden = !(promo && !promo.stale);
  const srcs = [...new Set(Object.entries(l.cells).filter(([p]) => isDeposit(p)).map(([, c]) => c.source).filter(Boolean))];
  $("lsrc").insertAdjacentHTML("beforeend", srcs.length ? `<ol class="refs" start="2">${srcs.map(u => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(lender)}: GIC and savings rates${EXT}</a></li>`).join("")}</ol>` : "");
}

function render(){ (term ? renderTerm : renderLender)(); }

if (window.histRange) histRange("1Y");
loadRates().then(d => {
  lenders = groupLenders(d); updatedAt = d.updated_at; tick(); setInterval(tick, 30000);
  $("demo").hidden = !d.demo;
  render();
  loadHistory().then(h => { hist = h && h.series ? h : {series: {}}; render(); });
}, () => { $("updated").innerHTML = mascotNote("Hmm, the latest rates didn't load. Please refresh the page, or try again in a few minutes."); });
let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(render, 150); });
})();
