/* SMS Shield home walkthrough. As each step scrolls to the middle of the
   screen it becomes active, and the demo card beside it plays that part of a
   real check: the photo, the 3-2-1 countdown, conditions appearing one at a
   time, the rights check with status pills settling, next steps, the letter.
   The tabs switch the demo between access modes. Also counts up the stat chips.
   The card is decorative (aria-hidden); the step text carries the content. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const steps = $$("#tourSteps .tour-step"), card = $("#tourCard");
  if (!steps.length || !card) return;
  const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("rm");
  let active = -1, demoMode = "voice", timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, reduce() ? 0 : ms));
  const clear = () => { timers.forEach(clearTimeout); timers = []; };

  const ASK = {
    voice: ["Forms in large print or braille", "Staff read forms aloud", "Your service dog with you"],
    text: ["A free ASL interpreter", "Written notes or captions", "Text instead of phone calls"],
    handsfree: ["An accessible exam room", "Help with transfers", "Help filling out forms"],
  };
  const LETTER = {
    voice: "I am asking for my forms and results in large print or an accessible digital file, and for staff to read forms aloud.",
    text: "I am asking for a free qualified ASL interpreter at my visit, and for written notes or captions.",
    handsfree: "I am asking for an accessible exam room with a lowering table, and help with transfers.",
  };

  const views = [
    () => `<div class="tc-head"><span>Photo check</span><span class="tc-pill">Camera on</span></div>
      <div class="tc-cam"><div class="tc-frame"></div><span class="tc-hint">Point at the problem area</span></div>
      <div class="tc-btn">Take photo</div>`,
    () => `<div class="tc-head"><span>Photo check</span><span class="tc-pill">Counting</span></div>
      <div class="tc-cam"><div class="tc-count" id="tcCount">3</div></div>
      <div class="tc-btn muted">Hold still</div>`,
    () => `<div class="tc-head"><span>What it could be</span><span class="tc-pill" id="tcUrg">Reading</span></div>
      <ul class="tc-list">
        <li class="tc-item"><b>01</b> Could be: a skin infection</li>
        <li class="tc-item"><b>02</b> Could be: an allergic reaction</li>
        <li class="tc-item"><b>03</b> Could be: an insect bite</li>
      </ul>
      <p class="tc-flag tc-item">Get urgent care if: fever or spreading redness</p>`,
    () => `<div class="tc-head"><span>Rights check</span><span class="tc-pill">3 findings</span></div>
      <ul class="tc-list">
        ${[["Financial help may apply", "protected"], ["Check the network first", "action"], [ASK[demoMode][0], "action"]].map(([t, s]) => `
          <li class="tc-item tc-row"><span>${t}</span><span class="status-pill checking" data-final="${s}">Checking</span></li>`).join("")}
      </ul>
      <p class="tc-note tc-item">General information, not legal advice.</p>`,
    () => `<div class="tc-head"><span>Next steps</span><span class="tc-pill">3 options</span></div>
      <ul class="tc-list">
        <li class="tc-item tc-opt"><b>01 · See a doctor</b><span>Ask for: ${ASK[demoMode][0]}</span></li>
        <li class="tc-item tc-opt"><b>02 · Care at home</b><span>Written care steps you can use</span></li>
        <li class="tc-item tc-opt"><b>03 · Affordable clinic</b><span>Sliding fee by income</span></li>
      </ul>
      <div class="tc-btn tc-item">Generate letter</div>`,
    () => `<div class="tc-head"><span>Accommodation request</span><span class="tc-pill" id="tcSent">Writing</span></div>
      <div class="tc-letter"><p>To the ADA Coordinator,</p><p class="tc-type">${LETTER[demoMode]}</p><p class="tc-cite">ADA · 28 CFR 36.303</p></div>`,
  ];

  // Small scripted moments inside each view.
  const plays = {
    1: () => ["3", "2", "1"].forEach((n, i) => later(() => {
      const c = $("#tcCount"); if (!c) return;
      c.textContent = n; c.classList.remove("pop"); void c.offsetWidth; c.classList.add("pop");
    }, i * 800)),
    2: () => later(() => { const u = $("#tcUrg"); if (u) { u.textContent = "Within 24 hours"; u.classList.add("warn"); } }, 1500),
    3: () => $$("[data-final]", card).forEach((p, i) => later(() => {
      p.className = `status-pill ${p.dataset.final}`;
      p.textContent = p.dataset.final === "protected" ? "Protected" : "Action available";
    }, 900 + i * 500)),
    5: () => later(() => { const s = $("#tcSent"); if (s) { s.textContent = "Ready to send"; s.classList.add("ok"); } }, 1200),
  };

  function show(i, force = false) {
    if (i === active && !force) return;
    active = i;
    clear();
    steps.forEach((s, j) => { s.classList.toggle("is-active", j === i); s.classList.toggle("is-past", j < i); });
    $$("#tourRail i").forEach((t, j) => { t.classList.toggle("on", j === i); t.classList.toggle("done", j < i); });
    $("#tourCount").textContent = `${String(i + 1).padStart(2, "0")} / ${String(steps.length).padStart(2, "0")}`;
    card.classList.remove("swap"); void card.offsetWidth; card.classList.add("swap");
    card.innerHTML = views[i]();
    $$(".tc-item", card).forEach((el, j) => later(() => el.classList.add("in"), 150 + j * 260));
    plays[i]?.();
  }

  // The step whose middle crosses the middle of the screen is active.
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) show(+e.target.dataset.step); });
  }, { rootMargin: "-45% 0px -45% 0px" });
  steps.forEach((s) => io.observe(s));
  // Clicking a step also shows it, for anyone not scrolling.
  steps.forEach((s) => s.addEventListener("click", () => show(+s.dataset.step)));

  $$(".tour-tabs span").forEach((t) => t.addEventListener("click", () => {
    demoMode = t.dataset.tab;
    $$(".tour-tabs span").forEach((x) => x.classList.toggle("on", x === t));
    show(Math.max(active, 0), true);
  }));
  // Follow the mode the user picked, so the demo speaks their language.
  window.addEventListener("sms:modechange", (e) => {
    const tab = $(`.tour-tabs [data-tab="${e.detail}"]`);
    if (tab) tab.click();
  });
  show(0);

  /* Count-up stat chips */
  const counter = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    counter.unobserve(e.target);
    const el = e.target, to = +el.dataset.to;
    if (reduce()) { el.textContent = to; return; }
    const t0 = performance.now(), dur = 1100;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur), eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(to * eased);
      if (p < 1) requestAnimationFrame(step);
    };
    el.textContent = "0";
    requestAnimationFrame(step);
  }), { threshold: 0.6 });
  $$(".count[data-to]").forEach((el) => counter.observe(el));
})();
