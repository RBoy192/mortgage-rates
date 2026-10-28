// GIC and savings tables on the main page. For savers a higher rate is better, so the highest comes first.
// Each section (banks; credit unions and other lenders) shows its 3 highest rates until it's expanded.
// cfg: {id: prefix of the element ids (head, rows, tiles, stale), cols: [[heading, product]], key: product sorted by default,
//       store: localStorage prefix, what: "GIC" | "savings", promo: bool, label: words for the tiles,
//       filter(name): which lenders to show (province), where(): " in Ontario" for the tiles, hist(): history.json for the arrows}
function depositTable(cfg){
  const TOP_N = 3, el = s => $(cfg.id + "_" + s);
  let lenders = [], cols = cfg.cols, sortBy = cfg.key, sortDir = -1, open = [false, false], ready = false;
  const group = () => { try { const g = localStorage.getItem("home-tiles"); return ["all", "banks", "others"].includes(g) ? g : "banks"; } catch (e) { return "banks"; } };
  try { const o = JSON.parse(localStorage.getItem(cfg.store + "-open") || "null"); if (Array.isArray(o)) open = [!!o[0], !!o[1]]; } catch (e) {}
  const rate = (l, p) => l.cells[p] && !l.cells[p].stale ? l.cells[p].rate : -Infinity;  // missing rates sort last
  const ncol = () => cols.length + 1 + (cfg.promo ? 1 : 0);
  const head = () => {
    el("head").innerHTML = `<tr><th scope="col" data-p="name"><button type="button">Lender<span class="si" aria-hidden="true"></span></button></th>`
      + cols.map(([label, p]) => `<th scope="col" data-p="${esc(p)}"><button type="button">${esc(label).replace("year", '<span class="yl">year</span><span class="ys">yr</span>')}<span class="si" aria-hidden="true"></span></button></th>`).join("")
      + (cfg.promo ? `<th scope="col" class="promoh">Promotional offer</th>` : "") + "</tr>";
  };
  head();
  el("head").addEventListener("click", e => {  // first click: highest to lowest (A to Z for lenders); again: the other way
    const th = e.target.closest("th[data-p]"); if (!th) return;
    if (sortBy === th.dataset.p) sortDir = -sortDir; else { sortBy = th.dataset.p; sortDir = th.dataset.p === "name" ? 1 : -1; }
    render();
  });
  el("rows").addEventListener("click", e => { const b = e.target.closest(".morebtn"); if (!b) return; const gi = +b.dataset.g; open[gi] = !open[gi];
    try { localStorage.setItem(cfg.store + "-open", JSON.stringify(open)); } catch (er) {} render(); const nb = el("rows").querySelector(`.morebtn[data-g="${gi}"]`); if (nb) nb.focus(); });
  const promoCell = l => { const p = l.cells[SAVINGS_PROMO];
    if (!p || p.stale) return '<td class="none promo">—</td>';
    return `<td class="promo"><b>${pct(p.rate)}</b>${p.note ? `<span class="pn">${esc(p.note)}</span>` : ""}</td>`; };
  function render(){
    if (!ready) return;
    const pool = lenders.filter(l => cols.some(([, p]) => l.cells[p]) && (!cfg.filter || cfg.filter(l.name))), tileGroup = group();
    const best = cols.map(([, p]) => Math.max(...pool.map(l => rate(l, p))));
    const tpool = pool.filter(l => tileGroup === "all" || (tileGroup === "banks") === !NON_BANKS.includes(l.name));
    const who = {all: "", banks: " at a bank", others: " at a credit union or other lender"}[tileGroup] + (cfg.where ? cfg.where() : "");
    el("tiles").innerHTML = cols.map(([label, p]) => { const b = Math.max(...tpool.map(l => rate(l, p))); return b === -Infinity ? "" :
      `<div class="k"><em>Highest ${esc(cfg.label(label, p))}${who}</em><b>${pct(b)}</b>${tpool.filter(l => rate(l, p) === b).map(l => esc(l.name)).join(", ")}</div>`; }).join("")
      || `<p class="m">No ${esc(cfg.label("", ""))} rates${who} yet.</p>`;
    const cmp = (a, b) => {
      if (sortBy === "name") return sortDir * a.name.localeCompare(b.name);
      const x = rate(a, sortBy), y = rate(b, sortBy);
      if (x !== y) return x === -Infinity ? 1 : y === -Infinity ? -1 : -sortDir * (y - x);
      return a.name.localeCompare(b.name);
    };
    const rows = [...pool].sort(cmp);
    el("head").querySelectorAll("th[data-p]").forEach(th => {
      const on = th.dataset.p === sortBy, b = th.querySelector("button"), nm = th.dataset.p === "name";
      if (on) th.setAttribute("aria-sort", sortDir > 0 ? "ascending" : "descending"); else th.removeAttribute("aria-sort");
      th.querySelector(".si").textContent = on ? (sortDir > 0 ? " ▲" : " ▼") : "";
      b.title = nm ? (on && sortDir > 0 ? "Sort Z to A" : "Sort A to Z") : (on && sortDir < 0 ? "Sort lowest to highest" : "Sort by highest " + th.dataset.p + " rate");
    });
    const row = (l, gb) => `<tr><td class="ln" style="--c:${seriesVar(l.name)}">${logo(l.name, l.dsource || l.source)}<a href="${esc(l.dsource || l.source)}" target="_blank" rel="noopener">${esc(l.name)}${EXT}</a></td>`
      + cols.map(([, p], i) => { const c = l.cells[p]; if (!c) return '<td class="none">—</td>';
        const top = c.rate === best[i] && !c.stale, gtop = !top && c.rate === gb[i] && !c.stale;
        const H = cfg.hist ? cfg.hist() : null, ch = c.stale || !H ? null : weekChange(H.series[l.name + "|" + p], c.rate);
        return `<td class="rate${top ? " low" : gtop ? " glow" : ""}${c.stale ? " st" : ""}" data-s="${esc(l.name + "|" + p)}"${c.stale ? ' title="This rate couldn\'t be refreshed in the latest update"' : ""}><span class="rc">${arrow(ch)}<b>${pct(c.rate)}</b></span>${c.note ? `<span class="pn">${esc(c.note)}</span>` : ""}</td>`; }).join("")
      + (cfg.promo ? promoCell(l) : "") + "</tr>";
    const key = sortBy !== "name" && cols.some(([, p]) => p === sortBy) ? sortBy : cfg.key;
    const keyLabel = cfg.label((cols.find(([, p]) => p === key) || [""])[0], key);
    const chev = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    el("rows").innerHTML = rows.length ? LENDER_GROUPS.map(([title, inGroup], gi) => {
      const g = rows.filter(l => inGroup(l.name)), gb = cols.map(([, p]) => Math.max(...g.map(l => rate(l, p))));
      if (!g.length) return "";
      const isOpen = open[gi] || g.length <= TOP_N;
      let shown = g;
      if (!isOpen) { const top = new Set([...g].sort((a, b) => rate(b, key) - rate(a, key) || a.name.localeCompare(b.name)).slice(0, TOP_N)); shown = g.filter(l => top.has(l)); }
      const what = gi === 0 ? "banks" : "credit unions and other lenders";
      const more = g.length <= TOP_N ? "" : `<tr class="more${open[gi] ? " open" : ""}"><td colspan="${ncol()}"><button type="button" class="morebtn" data-g="${gi}" aria-expanded="${open[gi]}">${open[gi] ? `Show only the ${TOP_N} highest` : `Show all ${g.length} ${what}`}${chev}</button></td></tr>`;
      return `<tr class="grp"><th scope="colgroup" colspan="${ncol()}">${esc(title)} <span class="gn">(${g.length})</span>${isOpen ? "" : `<span class="gsub">${TOP_N} highest ${esc(keyLabel)}</span>`}</th></tr>` + shown.map(l => row(l, gb)).join("") + more;
    }).join("") : `<tr><td colspan="${ncol()}">No ${esc(cfg.what)} rates yet. They appear here after the next update.</td></tr>`;
    el("stale").hidden = !pool.some(l => cols.some(([, p]) => l.cells[p] && l.cells[p].stale));
  }
  return {
    data(ls){ lenders = ls; ready = true; render(); },
    cols(c, key){ cols = c; if (!cols.some(([, p]) => p === sortBy)) { sortBy = key; sortDir = -1; } cfg.key = key; head(); render(); },
    render
  };
}
