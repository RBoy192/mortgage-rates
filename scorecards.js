// Lender feature scorecards: the mortgage features each lender publishes (scorecards.json), compared side by side
// on scorecards.html, and listed for one lender on its own page (scoreSection). Marks: 2 more flexible, 1 typical,
// 0 more limited, -1 no mark (a matter of preference, or not published).
const SC_MARKS = {2: "More flexible", 1: "Typical", 0: "More limited"};
function loadScorecards(){ return fetch("scorecards.json?v=" + (typeof SITE_VERSION === "undefined" ? "" : SITE_VERSION)).then(r => r.ok ? r.json() : null).catch(() => null); }
const scMark = m => SC_MARKS[m] !== undefined ? `<span class="mk m${m}" aria-hidden="true"></span><span class="vh">${SC_MARKS[m]}: </span>` : `<span class="mk mn" aria-hidden="true"></span>`;
const scCell = x => !x ? `<span class="m">Not published</span>` : `<div class="scv">${scMark(x.mark)}<div><b${x.v === "Not published" ? ' class="np"' : ""}>${esc(x.v)}</b>${x.note ? `<span class="s">${esc(x.note)}</span>` : ""}</div></div>`;
function scCounts(L){
  const c = {2: 0, 1: 0, 0: 0, np: 0, pref: 0};
  Object.values(L.values).forEach(x => { if (x.v === "Not published") c.np++; else if (x.mark < 0) c.pref++; else c[x.mark]++; });
  return c;
}
const scLegend = () => `<div class="sclegend"><span>${scMark(2)}More flexible</span><span>${scMark(1)}Typical</span><span>${scMark(0)}More limited</span><span>No mark: a matter of preference, or not published</span></div>`;

// One lender's features, on its own page
function scoreSection(name){
  const sec = $("featsec");
  if (!sec) return;
  loadScorecards().then(d => {
    const L = d && d.lenders[name];
    if (!L) return;
    const c = scCounts(L), groups = [...new Set(d.features.map(f => f.group))];
    sec.innerHTML = `<h2 class="sh">${esc(name)} mortgage features</h2>`
      + `<p class="f">${esc(L.product)}. Read from ${esc(name)}'s own website on ${dstr(d.checked)}. These are the lender's published terms; your mortgage agreement has the final word.</p>`
      + `<div class="sccount"><span><b>${c[2]}</b> more flexible</span><span><b>${c[1]}</b> typical</span><span><b>${c[0]}</b> more limited</span><span><b>${c.np}</b> not published</span></div>`
      + `<div class="t" tabindex="0" role="region" aria-label="${esc(name)} mortgage features"><table class="ltab sct1"><tbody>`
      + groups.map(g => `<tr><th colspan="2" scope="colgroup" class="scg">${esc(g)}</th></tr>` + d.features.filter(f => f.group === g).map(f =>
          `<tr><th scope="row">${esc(f.name)}<span class="s">${esc(f.why)}</span></th><td>${scCell(L.values[f.id])}</td></tr>`).join("")).join("")
      + `</tbody></table></div>` + scLegend()
      + `<p class="f"><a href="scorecards.html?l=${encodeURIComponent(name)}">Compare ${esc(name)}'s features with other banks</a> · <a href="scorecard-method.html">How the marks work</a></p>`
      + `<p class="f src"><b>Feature sources</b></p><ol class="refs">${Object.values(L.sources).map(([t, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(name)}: ${esc(t)}</a></li>`).join("")}</ol>`;
    sec.hidden = false;
  });
}

// The comparison page
function scorePage(){
  const out = $("sc_out");
  if (!out) return;
  loadScorecards().then(d => {
    if (!d) { out.innerHTML = `<p class="m">The scorecards didn't load. Please refresh the page.</p>`; return; }
    const names = Object.keys(d.lenders).sort((a, b) => LENDER_ORDER.indexOf(a) - LENDER_ORDER.indexOf(b));
    const Q = new URLSearchParams(location.search);
    let pick = (Q.get("l") || "").split(",").filter(n => names.includes(n));
    if (pick.length === 1) pick = [pick[0]].concat(names.filter(n => n !== pick[0]).slice(0, 3));
    if (!pick.length) pick = names.slice();
    let diff = Q.get("diff") === "1";
    $("sc_pick").innerHTML = names.map(n => `<label class="chipck"><input type="checkbox" value="${esc(n)}"${pick.includes(n) ? " checked" : ""}>${esc(n)}</label>`).join("");
    $("sc_diff").checked = diff;
    $("sc_date").textContent = dstr(d.checked);
    const draw = () => {
      pick = [...$("sc_pick").querySelectorAll("input:checked")].map(i => i.value);
      diff = $("sc_diff").checked;
      try { const q = new URLSearchParams(); if (pick.length && pick.length < names.length) q.set("l", pick.join(",")); if (diff) q.set("diff", "1");
        history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : "")); } catch (e) {}
      if (!pick.length) { out.innerHTML = `<p class="m">Pick at least one lender.</p>`; $("sc_src").innerHTML = ""; return; }
      const groups = [...new Set(d.features.map(f => f.group))];
      const same = f => { const vs = pick.map(n => (d.lenders[n].values[f.id] || {}).v); return pick.length > 1 && vs.every(v => v === vs[0]); };
      let hidden = 0;
      const rows = groups.map(g => {
        const fs = d.features.filter(f => f.group === g && !(diff && same(f) && ++hidden));
        return fs.length ? `<tr><th colspan="${pick.length + 1}" scope="colgroup" class="scg">${esc(g)}</th></tr>` + fs.map(f =>
          `<tr><th scope="row">${esc(f.name)}<span class="s">${esc(f.why)}</span></th>${pick.map(n => `<td>${scCell(d.lenders[n].values[f.id])}</td>`).join("")}</tr>`).join("") : "";
      }).join("");
      out.innerHTML = `<div class="t" tabindex="0" role="region" aria-label="Lender features side by side"><table class="ltab sct"><thead><tr><th scope="col">Feature</th>`
        + pick.map(n => `<th scope="col"><a href="${LENDER_SLUGS[n]}-mortgage-rates.html#featsec">${esc(n)}</a></th>`).join("") + `</tr></thead><tbody>`
        + `<tr class="sccrow"><th scope="row">At a glance</th>${pick.map(n => { const c = scCounts(d.lenders[n]); return `<td><span class="s">${c[2]} more flexible · ${c[1]} typical · ${c[0]} more limited · ${c.np} not published</span></td>`; }).join("")}</tr>`
        + rows + `</tbody></table></div>`
        + (hidden ? `<p class="f">${hidden} feature${hidden > 1 ? "s are" : " is"} the same for every lender you picked and ${hidden > 1 ? "are" : "is"} hidden.</p>` : "")
        + scLegend()
        + `<p class="f">Products compared: ${pick.map(n => `<b>${esc(n)}</b>: ${esc(d.lenders[n].product)}`).join("; ")}.</p>`;
      $("sc_src").innerHTML = pick.map(n => Object.values(d.lenders[n].sources).map(([t, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(n)}: ${esc(t)}</a></li>`).join("")).join("");
    };
    $("sc_pick").addEventListener("change", draw);
    $("sc_diff").addEventListener("change", draw);
    $("sc_share").onclick = () => copyLink(Object.fromEntries(new URLSearchParams(location.search)), $("sc_share"));
    draw();
  });
}
if (typeof SITE_VERSION !== "undefined") {
  if (document.getElementById("sc_out")) scorePage();
}
