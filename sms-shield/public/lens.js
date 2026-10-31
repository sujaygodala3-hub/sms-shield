/* SMS Shield lens. The gavel in a round lens: a tick ring that turns, a white
   scan line, a gavel that lifts and strikes, sound rings where it lands, and a
   band of tissue below with hairpin vessels and white dashes flowing through them.
   Used big in the home hero and small at the top of every other page.
   Decorative only: the tags beside it repeat in words what matters. */
(() => {
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Hairpin vessels across the bottom of the lens, like a nailfold view.
  const loopPaths = [[46, 300, 28], [92, 286, 30], [140, 296, 32], [190, 280, 36], [242, 292, 30], [290, 284, 32], [338, 298, 28]]
    .map(([x, top, w]) => `M${x} 412V${top + w / 2}c0-${w * 0.9} ${w} -${w * 0.9} ${w} 0V412`);

  function lensHTML({ tags = [], scale = "3 rights", caption = "Illustration of a rights check", mini = false }) {
    const id = Math.random().toString(36).slice(2, 7);
    return `
      <div class="hv-lens">
        <div class="hv-inner">
          <div class="hv-grid"></div>
          <svg class="hv-svg" viewBox="0 0 400 400" aria-hidden="true">
            <defs>
              <linearGradient id="tis-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F85C70"/><stop offset=".55" stop-color="#C83A4E"/><stop offset="1" stop-color="#7F171F"/></linearGradient>
              <filter id="soft-${id}"><feGaussianBlur stdDeviation="1.4"/></filter>
            </defs>
            <path d="M0 292 C80 266 160 300 220 282 S340 262 400 284 L400 400 L0 400Z" fill="url(#tis-${id})" opacity=".92"/>
            <path d="M0 292 C80 266 160 300 220 282 S340 262 400 284" fill="none" stroke="#FADADD" stroke-opacity=".55" stroke-width="2"/>
            <g class="hv-caps" filter="url(#soft-${id})">${loopPaths.map((d, i) => `<path class="${i === 3 ? "hot" : ""}" d="${d}"/>`).join("")}</g>
            <g class="hv-flow">${loopPaths.map((d) => `<path d="${d}"/>`).join("")}</g>
            <g class="hv-waves"><path d="M112 72a46 46 0 0 0 0 64"/><path d="M92 58a70 70 0 0 0 0 92"/><path d="M72 44a94 94 0 0 0 0 120"/><path d="M292 72a46 46 0 0 1 0 64"/><path d="M312 58a70 70 0 0 1 0 92"/></g>
          </svg>
          <div class="hv-arm">
            <img class="hv-gavel" src="assets/gavel.png" alt="" width="356" height="687" decoding="async">
          </div>
          <span class="hv-ripple"></span>
          <div class="hv-scan"></div>
          <div class="hv-scale"><i></i><b>${esc(scale)}</b></div>
        </div>
        <div class="hv-ticks"></div>
      </div>
      ${tags.map(([b, s], i) => `<div class="hv-tag hv-t${i + 1}"><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join("")}
      ${mini ? "" : `<figcaption>${esc(caption)}</figcaption>`}`;
  }

  // The home hero lens.
  $$("[data-lens]").forEach((fig) => {
    const tags = JSON.parse(fig.dataset.lens || "[]");
    fig.innerHTML = lensHTML({ tags, scale: fig.dataset.scale, caption: fig.dataset.caption });
  });

  // A small lens at the top of every other page, with tags for that page.
  const PAGES = {
    photo: { scale: "Not saved", tags: [["Your photo", "Checked once, never saved"], ["Rights check", "After every result"]] },
    next: { scale: "3 options", tags: [["Accommodation", "One click letter"], ["Clinic", "Sliding fee by income"]] },
    summary: { scale: "Your visit", tags: [["Summary", "Read, print or download"], ["Your rights", "Listed for your visit"]] },
    symptoms: { scale: "Could be", tags: [["Careful words", "Never a diagnosis"], ["Red flags", "Urgent care first"]] },
    bill: { scale: "4 checks", tags: [["Surprise bill", "No Surprises Act"], ["Charity care", "IRS 501(r)"]] },
    cost: { scale: "Early vs late", tags: [["Treat early", "Usually costs less"], ["Financial help", "Ask the hospital"]] },
    meds: { scale: "Generic", tags: [["Same medicine", "Lower price"], ["Ask for", "The cash price"]] },
    legal: { scale: "6 letters", tags: [["Interpreter", "Free by law"], ["Letters", "Ready to send"]] },
  };
  Object.entries(PAGES).forEach(([page, cfg]) => {
    const wrap = document.querySelector(`.page[data-page="${page}"] .page-head .wrap`);
    if (!wrap || wrap.querySelector(".hv-wrap")) return;
    const copy = document.createElement("div");
    copy.className = "page-head-copy";
    while (wrap.firstChild) copy.appendChild(wrap.firstChild);
    const fig = document.createElement("figure");
    fig.className = "hv-wrap hv-mini";
    fig.setAttribute("aria-hidden", "true");
    fig.innerHTML = lensHTML({ ...cfg, mini: true });
    wrap.classList.add("has-lens");
    wrap.append(copy, fig);
  });
})();
