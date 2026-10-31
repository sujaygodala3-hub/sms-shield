/* SMS Shield motion layer. Small, reusable effects on top of the content:
   headings that blur in word by word, eyebrows that rise out of a mask,
   highlight sweeps, staggered card contents, a cursor spotlight on cards,
   a scroll progress line, and the FAQ accordion. All of it stops under
   reduced motion or calm mode, and none of it hides content from screen
   readers (the words stay real text). */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("rm");

  // Split headings into words, each with its own delay. Done once per heading.
  function splitWords(root = document) {
    // Headings the app relabels or moves focus to are left alone.
    $$("main h2:not([data-split]):not([tabindex]):not(.lit-text), .page-head h1:not([data-split]), .welcome h1:not([data-split])", root).forEach((h) => {
      if (h.closest(".gv-stage, .tour-card, .chat") || h.children.length) return;
      h.dataset.split = "1";
      const words = h.textContent.trim().split(/\s+/);
      const safe = (w) => w.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
      h.innerHTML = words.map((w, i) => `<span class="w" style="--wi:${i}">${safe(w)}</span>`).join(" ");
      h.classList.add("words");
    });
    $$("main .eyebrow:not([data-split])", root).forEach((e) => {
      if (e.closest(".gv-stage, .tour-card") || e.children.length) return;
      e.dataset.split = "1";
      e.innerHTML = `<span class="mask"><span class="mask-in">${e.innerHTML}</span></span>`;
      e.classList.add("rise");
    });
  }

  // Anything marked for motion plays once when it scrolls into view.
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add("on");
    io.unobserve(e.target);
  }), { threshold: 0.2, rootMargin: "0px 0px -8% 0px" });
  function watch(root = document) {
    splitWords(root);
    $$(".words:not([data-w]), .rise:not([data-w]), .hl:not([data-w]), .stagger:not([data-w]), .statement:not([data-w])", root).forEach((el) => {
      el.dataset.w = "1";
      if (calm()) el.classList.add("on"); else io.observe(el);
    });
  }

  // Cards follow the cursor with a soft red spotlight.
  document.addEventListener("pointermove", (e) => {
    const card = e.target.closest?.(".spot, .mode-card, .home-card, .option-card, a.tool-card, .num-call, .right-card, .dz-panel, .faq-item");
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${e.clientX - r.left}px`);
    card.style.setProperty("--my", `${e.clientY - r.top}px`);
  }, { passive: true });

  // A thin progress line under the header shows how far down the page you are.
  const bar = document.createElement("div");
  bar.className = "scroll-line";
  bar.setAttribute("aria-hidden", "true");
  document.body.appendChild(bar);
  let ticking = false;
  const progress = () => {
    ticking = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
  };
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(progress); } }, { passive: true });

  // FAQ: one open at a time, height animates through grid rows.
  document.addEventListener("click", (e) => {
    const q = e.target.closest(".faq-q");
    if (!q) return;
    const item = q.closest(".faq-item"), open = !item.classList.contains("open");
    $$(".faq-item.open", item.parentElement).forEach((x) => { x.classList.remove("open"); $(".faq-q", x).setAttribute("aria-expanded", "false"); });
    item.classList.toggle("open", open);
    q.setAttribute("aria-expanded", String(open));
    if (open) window.A11y?.setSummary("home", `${q.textContent.trim()} ${$(".faq-a p", item).textContent.trim()}`);
  });

  // New results get the same treatment when they arrive.
  new MutationObserver((list) => {
    for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1 && !n.closest(".gv-stage")) { watch(n.parentElement || n); return; }
  }).observe($("main"), { childList: true, subtree: true });

  // The problem statement lights up word by word as it scrolls through the screen.
  // Words are wrapped in place, so the accent word keeps its styling.
  const lit = $(".lit-text");
  if (lit) {
    const wrap = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) frag.appendChild(document.createTextNode(part));
            else { const s = document.createElement("span"); s.className = "lw"; s.textContent = part; frag.appendChild(s); }
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) wrap(n);
      });
    };
    wrap(lit);
    const words = $$(".lw", lit);
    let pending = false;
    const light = () => {
      pending = false;
      if (calm()) { words.forEach((w) => w.classList.add("on")); return; }
      const r = lit.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (innerHeight * 0.85 - r.top) / (r.height + innerHeight * 0.35)));
      const n = Math.round(p * words.length);
      words.forEach((w, i) => w.classList.toggle("on", i < n));
    };
    addEventListener("scroll", () => { if (!pending) { pending = true; requestAnimationFrame(light); } }, { passive: true });
    light();
  }

  watch();
  addEventListener("hashchange", () => setTimeout(() => watch(), 50));
})();
