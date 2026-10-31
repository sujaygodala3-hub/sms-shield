/* SMS Shield front end: routing, shared state, and the five tools. */
(() => {
  const D = window.MR_DATA;
  const L = window.SMSLegal;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const money = (n) => "$" + Math.round(n).toLocaleString("en-US");
  // Lowercase the first letter only, so "ASL" stays "ASL" mid-sentence.
  const lowerFirst = (t) => t.charAt(0).toLowerCase() + t.slice(1);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------------- Shared state (kept in this browser only) ---------------- */
  const STORE_KEY = "smsshield:v1";
  const state = Object.assign(
    { loc: { state: "", zip: "" }, bill: null, symptoms: null, condition: "strep", highlightMeds: [], ai: false },
    load()
  );
  function load() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; } }
  function save() {
    const { loc, bill, symptoms, condition, highlightMeds } = state;
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ loc, bill, symptoms, condition, highlightMeds })); } catch { /* storage unavailable */ }
  }

  // Screen reader, captions (text mode) and speech (voice mode) all go through A11y.
  const announce = (text, opts) => window.A11y?.announce(text, opts);

  function toast(msg) {
    announce(msg, { speakIt: false });
    const t = $("#toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2400);
  }

  /* ---------------- Location → price multiplier ---------------- */
  function multiplier() {
    const s = D.STATES[state.loc.state];
    let m = s ? s[1] : 1;
    if (/^\d{5}$/.test(state.loc.zip) && D.METRO_ZIP3.includes(state.loc.zip.slice(0, 3))) m *= 1.08;
    return m;
  }
  const drugMultiplier = () => 1 + (multiplier() - 1) * 0.5; // drug prices vary less by place
  function locLabel() {
    const s = D.STATES[state.loc.state];
    if (!s) return "US typical prices";
    const metro = /^\d{5}$/.test(state.loc.zip) && D.METRO_ZIP3.includes(state.loc.zip.slice(0, 3));
    return `${s[0]}${state.loc.zip ? " " + state.loc.zip : ""}${metro ? " (metro area)" : ""}`;
  }

  function initLocation() {
    const sel = $("#stateSelect"), zip = $("#zipInput");
    sel.innerHTML = `<option value="">State</option>` +
      Object.entries(D.STATES).map(([k, [name]]) => `<option value="${k}" title="${name}">${k}</option>`).join("");
    sel.value = state.loc.state; zip.value = state.loc.zip;
    sel.addEventListener("change", () => { state.loc.state = sel.value; onLocChange(); });
    zip.addEventListener("input", () => {
      zip.value = zip.value.replace(/\D/g, "").slice(0, 5);
      zip.classList.toggle("bad", zip.value.length > 0 && zip.value.length < 5);
      if (zip.value.length === 5 || zip.value.length === 0) { state.loc.zip = zip.value; onLocChange(); }
    });
    updateLocLabels();
  }
  function onLocChange() {
    save(); updateLocLabels(); renderCost(); renderMeds();
    toast(`Prices updated for ${locLabel()}`);
  }
  function updateLocLabels() { $$(".loc-label").forEach((el) => (el.textContent = locLabel())); }

  /* ---------------- Router ---------------- */
  const PAGES = ["home", "photo", "next", "summary", "bill", "symptoms", "cost", "meds", "legal"];
  function route() {
    const hash = location.hash.slice(1);
    const page = PAGES.includes(hash) ? hash : "home";
    // In-page anchors on the home page (e.g. #tools) stay on home.
    if (!PAGES.includes(hash) && hash && document.getElementById(hash)) {
      showPage("home"); return;
    }
    showPage(page);
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }
  function showPage(page) {
    $$(".page").forEach((p) => (p.hidden = p.dataset.page !== page));
    $$("[data-nav]").forEach((a) => {
      a.classList.toggle("active", a.dataset.nav === page);
      if (a.dataset.nav === page) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    $("#mainNav").classList.remove("open");
    document.title = page === "home" ? "SMS Shield | Health help and your rights"
      : `${$(`.page[data-page="${page}"] h1`)?.textContent || "SMS Shield"} | SMS Shield`;
    if (page === "cost") renderCost();
    if (page === "meds") renderMeds();
    if (page === "legal") renderLetter();
    if (page === "next") renderNext();
    if (page === "summary") renderSummary();
    if (page !== "photo") stopCamera();
    updateHeaderTone();
    revealIn($(`.page[data-page="${page}"]`));
  }

  /* ---------------- Header behaviour ---------------- */
  function updateHeaderTone() { $("#siteHeader").classList.toggle("scrolled", window.scrollY > 8); }
  window.addEventListener("scroll", updateHeaderTone, { passive: true });
  $("#menuBtn").addEventListener("click", () => {
    const open = $("#mainNav").classList.toggle("open");
    $("#menuBtn").setAttribute("aria-expanded", open);
  });

  /* ---------------- Fade and rise on scroll ---------------- */
  // Anything with .reveal rises in once when it scrolls into view. New results call revealIn().
  const revealer = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("in"); revealer.unobserve(e.target); }
    }), { threshold: 0.12 })
    : null;
  function revealIn(root = document) {
    $$(".reveal:not(.in)", root).forEach((el) => (revealer ? revealer.observe(el) : el.classList.add("in")));
  }

  /* ---------------- Tab 1: Bill Check (rules live in legal.js) ---------------- */
  const analyzeBill = (b) => L.analyzeBill(b);

  function initBill() {
    const form = $("#billForm");
    if (state.bill) Object.entries(state.bill).forEach(([k, v]) => {
      const el = form.elements[k]; if (!el) return;
      if (el.type === "checkbox") el.checked = !!v; else el.value = v;
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const b = Object.fromEntries(fd.entries());
      b.signedWaiver = form.elements.signedWaiver.checked;
      b.accessCharge = form.elements.accessCharge.checked;
      state.bill = b; save();
      renderBill(analyzeBill(b), true);
      syncLetterFromBill(true);
    });
    if (state.bill) renderBill(analyzeBill(state.bill));
  }

  /* ---------------- Shared legal UI, used on every results screen ---------------- */
  const STATUS = { checking: "Checking", protected: "Protected", action: "Action available" };
  function rightsCardsHTML(items) {
    return `<ol class="rights-cards">${items.map((r, i) => `
      <li class="right-card reveal" style="--i:${i}">
        <div class="right-top"><span class="right-num">${String(i + 1).padStart(2, "0")}</span>
          <span class="status-pill ${r.status || "protected"}">${STATUS[r.status || "protected"]}</span></div>
        <h4>${esc(r.title)}</h4>
        <p>${esc(r.body || r.plain)}</p>
        ${r.ask ? `<p class="right-ask"><b>What to say:</b> ${esc(r.ask)}</p>` : ""}
        <p class="cite">${esc(r.cite && !r.law ? r.cite : L.label(r))}</p>
      </li>`).join("")}</ol>
      <p class="legal-note">${L.DISCLAIMER}</p>`;
  }
  function precedentHTML(tags) {
    const p = L.precedentFor(tags);
    return `<details class="precedent">
      <summary>Similar cases and how to dispute</summary>
      ${p.cases.length ? `<p class="eyebrow accent">Similar authority in our data</p><ul class="prec-cases">${p.cases.map((c) => `<li><b>${esc(c.title)}</b> ${esc(c.holding)} <span class="cite">${esc(c.cite)}</span></li>`).join("")}</ul>` : ""}
      <p class="eyebrow accent">Typical steps</p>
      <ol class="prec-steps">${p.steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
      <p class="prec-outcome">${esc(p.outcome)}</p>
      <p class="legal-note">${p.disclaimer}</p>
    </details>`;
  }

  function renderBill(findings, fresh = false) {
    const flags = findings.filter((f) => f.level === "high").length;
    const top = findings.find((f) => f.reason && f.level === "high") || findings[0];
    if (fresh) {
      announce(`${flags ? `${flags} likely issue${flags > 1 ? "s" : ""} found.` : "No clear violations found."} ` +
        findings.filter((f) => f.level !== "info").map((f) => `${f.title}. ${f.impact.replace(/\.$/, "")}.`).join(" ") +
        " Go to Legal Backup for your dispute letter.", { interrupt: true });
    }
    $("#billResults").setAttribute("data-read", "");
    window.A11y?.setSummary("bill", `${flags ? `${flags} likely problem${flags > 1 ? "s" : ""}: ${findings.filter((f) => f.level === "high").map((f) => f.title).join(". ")}.` : "No clear problems found."} Press Get my dispute letter for a letter.`);
    $("#billResults").innerHTML = `
      <div class="summary-bar">
        <div><span class="eyebrow" style="color:var(--rose);margin-bottom:6px">Results</span>
          <strong>${flags ? `${flags} likely issue${flags > 1 ? "s" : ""} found` : "No clear violations found"}</strong></div>
        <a href="#legal" class="btn btn-primary sm" data-reason="${top.reason || "itemized"}" id="toLegal">Get my dispute letter</a>
      </div>
      ${findings.map((f) => `
        <article class="finding ${f.level}">
          <div class="finding-top"><h3>${esc(f.title)}</h3>
            <span class="pill ${f.level === "high" ? "wine" : ""}">${f.level === "high" ? "Likely" : f.level === "medium" ? "Possible" : "Tip"}</span></div>
          <p>${esc(f.body)}</p>
          <div class="impact"><span class="eyebrow accent">Impact</span><strong>${esc(f.impact)}</strong></div>
          <div class="sources">▲ ${f.sources.length} source${f.sources.length > 1 ? "s" : ""} <span>· ${f.sources.map(esc).join(" · ")}</span></div>
          ${f.reason ? `<a href="#legal" class="link-accent" data-reason="${f.reason}">Next steps in Legal Backup</a>` : ""}
        </article>`).join("")}
      ${precedentHTML([...new Set(findings.filter((f) => f.level !== "info" && f.tag).map((f) => f.tag))])}
      <p class="legal-note">${L.DISCLAIMER}</p>`;
    $$("#billResults [data-reason]").forEach((a) => a.addEventListener("click", () => {
      $("#letterForm").elements.reason.value = a.dataset.reason; renderLetter();
    }));
    if (window.innerWidth < 900) $("#billResults").scrollIntoView({ behavior: "smooth" });
  }

  /* ---------------- Tab 2: Symptom Checker ---------------- */
  function demoSymptoms(text) {
    const t = text.toLowerCase();
    const hits = (w) => new RegExp("\\b" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(t);
    const scored = D.SYMPTOM_RULES.map((r) => ({ r, score: r.words.filter(hits).length }))
      .filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
    const picks = scored.length ? scored : [{ r: D.SYMPTOM_RULES[4], score: 0 }];
    return {
      summary: "Demo mode: matched on keywords. Add an API key for AI-ranked results.",
      redFlags: D.RED_FLAGS,
      conditions: picks.map(({ r, score }, i) => ({
        name: r.name, conditionKey: r.key, likelihood: i === 0 && score > 1 ? "high" : i === 0 ? "medium" : "low",
        urgency: r.urgency, why: r.why, nextStep: r.next, medications: (D.CONDITIONS[r.key]?.meds || []),
      })),
    };
  }

  async function runSymptoms(text) {
    const box = $("#symptomResults");
    box.innerHTML = `<div class="loading"><span class="spinner"></span>Checking your symptoms…</div>`;
    let result;
    try {
      const r = await fetch("/api/symptoms", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, age: $("#symptomAge").value, duration: $("#symptomDuration").value, state: state.loc.state }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Request failed");
      result = data.demo ? demoSymptoms(text) : data.result;
    } catch (err) {
      console.warn("Symptom AI unavailable, using demo rules:", err);
      toast("AI unavailable, showing keyword matches instead");
      result = demoSymptoms(text);
    }
    state.symptoms = { text, result };
    check = fromSymptoms(result, "words");
    connectFromSymptoms(result);
    save();
    renderSymptoms(true);
  }

  // Results fill in the other tabs.
  function connectFromSymptoms(result) {
    const first = result.conditions.find((c) => D.CONDITIONS[c.conditionKey]);
    if (first) state.condition = first.conditionKey;
    const meds = new Set();
    result.conditions.forEach((c) => {
      (c.medications || []).forEach((m) => {
        const hit = D.MEDS.find((x) => m.toLowerCase().includes(x.generic.toLowerCase().split(" ")[0]) || x.id === m.toLowerCase());
        if (hit) meds.add(hit.id);
      });
      (D.CONDITIONS[c.conditionKey]?.meds || []).forEach((m) => meds.add(m));
    });
    state.highlightMeds = [...meds];
  }

  const URG = {
    emergency: ["urg-emergency", "Go to the ER now"], urgent: ["urg-urgent", "Within 24 hours"],
    soon: ["urg-soon", "This week"], "self-care": ["urg-self", "Self-care"],
  };

  function renderSymptoms(fresh = false) {
    const box = $("#symptomResults");
    if (!state.symptoms) return;
    const { result } = state.symptoms;
    const anyEmergency = result.conditions.some((c) => c.urgency === "emergency");
    if (fresh) {
      const top = result.conditions[0];
      announce((anyEmergency ? "This could be an emergency. Call 911 or go to the ER now. " : "") +
        result.conditions.map((c) => `${c.name}, ${c.likelihood} likelihood. ${(URG[c.urgency] || URG.soon)[1]}.`).join(" ") +
        (top ? ` Next step: ${top.nextStep}` : "") + " Say costs or medications to see prices.", { assertive: anyEmergency, interrupt: true });
    }
    box.innerHTML = `
      <div class="results-head">
        <div><p class="eyebrow accent">Likely conditions</p><h2>${anyEmergency ? "Get care now" : "Here's what it might be"}</h2></div>
        <p>${esc(result.summary)}</p>
      </div>
      ${result.redFlags?.length ? `<div class="redflags"><p class="eyebrow">Call 911 if you have</p><ul>${result.redFlags.slice(0, 6).map((f) => `<li>${esc(f)}</li>`).join("")}</ul></div>` : ""}
      <div class="cond-grid">
        ${result.conditions.map((c) => {
          const [cls, label] = URG[c.urgency] || URG.soon;
          const known = D.CONDITIONS[c.conditionKey];
          return `<article class="cond-card">
            <div class="cond-meta"><span class="urg ${cls}">${label}</span><span class="like">${esc(c.likelihood)} likelihood</span></div>
            <h3>${esc(c.name)}</h3>
            <p>${esc(c.why)}</p>
            <div class="impact"><span class="eyebrow accent">Next step</span><strong>${esc(c.nextStep)}</strong></div>
            ${c.medications?.length ? `<p style="font-size:13px">Often treated with: ${c.medications.map(esc).join(", ")}</p>` : ""}
            <div class="cond-actions">
              ${known ? `<a href="#cost" class="link-accent" data-cond="${c.conditionKey}">See costs</a>` : ""}
              ${known ? `<a href="#meds" class="link-accent" data-cond="${c.conditionKey}">See medication prices</a>` : ""}
            </div>
          </article>`;
        }).join("")}
      </div>
      <p class="fineprint">This is not a diagnosis. A clinician can confirm what's going on.</p>
      <div class="symptom-rights">
        <p class="eyebrow accent">Rights check</p>
        <h2>What protects you at the visit</h2>
        ${rightsCardsHTML(L.costAndRights({ urgency: anyEmergency ? "emergency" : "soon", mode: mode(), insurance: state.bill?.insurance }).items.map((x) => ({ ...x, law: null })))}
        <a class="btn btn-primary btn-lg" href="#next">See my next steps and letters</a>
      </div>`;
window.A11y?.setSummary("symptoms", `It could be ${result.conditions.slice(0, 2).map((c) => c.name).join(" or ")}. ${(URG[result.conditions[0]?.urgency] || URG.soon)[1]}. Next, see your next steps and rights.`);
        revealIn(box);
    $$("[data-cond]", box).forEach((a) => a.addEventListener("click", () => { state.condition = a.dataset.cond; save(); }));
  }

  function initSymptoms() {
    $("#symptomForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const text = $("#symptomText").value.trim();
      if (text.length < 3) { $("#symptomText").focus(); toast("Describe your symptoms first"); return; }
      runSymptoms(text);
    });
    $$("#symptomExamples .chip").forEach((c) => c.addEventListener("click", () => {
      $("#symptomText").value = c.textContent; runSymptoms(c.textContent);
    }));
    if (state.symptoms) { $("#symptomText").value = state.symptoms.text; renderSymptoms(); }
    // Voice mode: "I have a sore throat..." fills the box and runs the check.
    window.addEventListener("sms:symptoms", (e) => { $("#symptomText").value = e.detail; runSymptoms(e.detail); });
  }

  /* ---------------- Tab 3: Cost Explorer ---------------- */
  function renderCost() {
    const chips = $("#conditionChips");
    chips.innerHTML = Object.entries(D.CONDITIONS).map(([k, c]) =>
      `<button class="chip ${k === state.condition ? "active" : ""}" data-k="${k}">${esc(c.name)}</button>`).join("");
    $$(".chip", chips).forEach((b) => b.addEventListener("click", () => { state.condition = b.dataset.k; save(); renderCost(); }));

    const c = D.CONDITIONS[state.condition] || D.CONDITIONS.strep;
    const m = multiplier();
    const sum = (rows) => rows.reduce((a, [, v]) => a + v * m, 0);
    const early = sum(c.early), late = sum(c.late), max = Math.max(early, late);
    const fromSymptoms = state.symptoms?.result.conditions.some((x) => x.conditionKey === state.condition);
    $("#costView").innerHTML = `
      <div class="cost-chart">
        <h3>${esc(c.name)}</h3>
        <p class="sub">${c.unit ? `Costs over the ${c.unit}` : "Typical total cost"} · ${esc(locLabel())}${fromSymptoms ? " · from your symptom check" : ""}</p>
        <div class="bars">
          <div class="bar-row"><div class="bar-label"><b>Treated early</b><span>${money(early)}</span></div>
            <div class="bar-track"><div class="bar-fill early" data-w="${(early / max) * 100}"></div></div></div>
          <div class="bar-row"><div class="bar-label"><b>Treated late</b><span>${money(late)}</span></div>
            <div class="bar-track"><div class="bar-fill late" data-w="${(late / max) * 100}"></div></div></div>
        </div>
        <div class="breakdown">
          <div><h4>Early</h4><ul>${c.early.map(([n, v]) => `<li><span>${esc(n)}</span><span>${money(v * m)}</span></li>`).join("")}</ul></div>
          <div><h4>Late</h4><ul>${c.late.map(([n, v]) => `<li><span>${esc(n)}</span><span>${money(v * m)}</span></li>`).join("")}</ul></div>
        </div>
      </div>
      <div class="cost-side">
        <div class="big-impact"><span class="eyebrow">Cost of waiting</span><strong>${(late / early).toFixed(1)}×</strong>
          <p>${money(late - early)} more if it's treated late. ${esc(c.lateLabel)}.</p></div>
        <div class="side-card"><p class="eyebrow accent">Medications</p><p>${c.meds.map((id) => D.MEDS.find((x) => x.id === id)?.generic).filter(Boolean).join(", ")}</p>
          <a href="#meds" class="link-accent">Compare generic and brand prices</a></div>
        <div class="side-card"><p class="eyebrow accent">Got a bill for this?</p><p>Check it for surprise charges and charity-care eligibility.</p>
          <a href="#bill" class="link-accent">Open Bill Check</a></div>
      </div>`;
    requestAnimationFrame(() => requestAnimationFrame(() => $$(".bar-fill").forEach((b) => (b.style.width = b.dataset.w + "%"))));
    state.highlightMeds = state.highlightMeds?.length ? state.highlightMeds : c.meds;
  }

  /* ---------------- Tab 4: Medication Prices ---------------- */
  let medFilter = "all";
  function renderMeds() {
    const filters = $("#medFilters");
    const opts = [["all", "All"], ["mine", "From my results"], ...Object.entries(D.CONDITIONS).filter(([k]) => D.MEDS.some((m) => m.for.includes(k))).map(([k, c]) => [k, c.name])];
    if (medFilter === "mine" && !state.highlightMeds?.length) medFilter = "all";
    filters.innerHTML = opts.map(([k, n]) => `<button class="chip ${k === medFilter ? "active" : ""}" data-f="${k}">${esc(n)}</button>`).join("");
    $$(".chip", filters).forEach((b) => b.addEventListener("click", () => { medFilter = b.dataset.f; renderMeds(); }));

    const q = $("#medSearch").value.trim().toLowerCase();
    const dm = drugMultiplier();
    const hl = new Set(state.highlightMeds || []);
    let list = D.MEDS.filter((m) =>
      (medFilter === "all" || (medFilter === "mine" ? hl.has(m.id) : m.for.includes(medFilter))) &&
      (!q || [m.generic, m.brand, ...m.for.map((k) => D.CONDITIONS[k]?.name || "")].join(" ").toLowerCase().includes(q)));
    list = list.sort((a, b) => (hl.has(b.id) - hl.has(a.id)));
    $("#medGrid").innerHTML = list.length ? list.map((m) => {
      const g = m.g * dm, b = m.b * dm, pct = Math.round((1 - g / b) * 100);
      return `<article class="med-card ${hl.has(m.id) ? "highlight" : ""}">
        <div><h3>${esc(m.generic)}</h3><p class="for">${esc(m.dose)}${m.for.length ? " · " + m.for.map((k) => esc(D.CONDITIONS[k].name)).join(", ") : ""}</p></div>
        <div class="price-pair">
          <div class="price generic"><small>Generic</small><b>${money(g)}</b><span>${esc(m.generic)}</span></div>
          <div class="price"><small>Brand</small><b>${money(b)}</b><span>${esc(m.brand)}</span></div>
        </div>
        <p class="savings">Generic saves <b>${money(b - g)}</b> (${pct}%)</p>
      </article>`;
    }).join("") : `<div class="empty-state"><h3>No matches</h3><p>Try another name or clear the filter.</p></div>`;
  }
  function initMeds() { $("#medSearch").addEventListener("input", renderMeds); }

  /* ---------------- Tab 5: Legal Backup ---------------- */
  let caseFilter = "all";
  function renderCases() {
    const opts = [["all", "All"], ["access", "Disability access"], ["nsa", "No Surprises Act"], ["charity", "Charity care"], ["appeal", "Appeals"], ["state", "State law"]];
    $("#caseFilters").innerHTML = opts.map(([k, n]) => `<button class="chip ${k === caseFilter ? "active" : ""}" data-f="${k}">${n}</button>`).join("");
    $$("#caseFilters .chip").forEach((b) => b.addEventListener("click", () => { caseFilter = b.dataset.f; renderCases(); }));
    $("#caseGrid").innerHTML = L.CASES.filter((c) => caseFilter === "all" || c.tag === caseFilter).map((c) => `
      <article class="case-card">
        <div class="case-kind"><span class="eyebrow accent" style="margin:0">${esc(c.kind)}</span></div>
        <h3>${esc(c.title)}</h3>
        <p class="holding">${esc(c.holding)}</p>
        <p>${esc(c.body)}</p>
        <p class="cite">${esc(c.cite)} · <a href="${c.url}" target="_blank" rel="noopener">Source</a></p>
      </article>`).join("");
  }

  function syncLetterFromBill(force) {
    const f = $("#letterForm").elements, b = state.bill;
    if (!b) return;
    if (force || !f.provider.value) f.provider.value = b.provider || "";
    if (force || !f.billed.value) f.billed.value = b.billed || "";
    if (force || !f.date.value) f.date.value = b.date || "";
    const findings = analyzeBill(b);
    const top = findings.find((x) => x.level === "high" && x.reason);
    if (top && force) f.reason.value = top.reason;
    renderLetter();
  }

  function renderLetter() {
    const f = Object.fromEntries(new FormData($("#letterForm")).entries());
    $("#letterOutput").value = L.letter(f.reason, { ...f, mode: window.A11y?.mode }, state.bill || {});
  }

  // "Make an accommodation letter" from anywhere: open the letter on Rights and letters.
  window.addEventListener("sms:letter", (e) => {
    location.hash = "legal";
    setTimeout(() => {
      $("#letterForm").elements.reason.value = e.detail; renderLetter();
      const wrap = $("#letterForm").closest(".letter-grid");
      wrap.scrollIntoView({ behavior: "smooth", block: "start" });
      $("#letterForm").elements.name.focus({ preventScroll: true });
      announce("Your accommodation letter is ready. Type or say your name and the clinic name to fill it in.", { interrupt: true });
      window.A11y?.setSummary("legal", "Your accommodation request letter is open. Add your name and clinic, then copy or download it.");
    }, 80);
  });

  function initLegal() {
    renderCases();
    $("#letterForm").addEventListener("input", renderLetter);
    syncLetterFromBill(false);
    renderLetter();
    $("#copyLetter").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText($("#letterOutput").value); toast("Letter copied"); }
      catch { $("#letterOutput").select(); toast("Press Ctrl/Cmd+C to copy"); }
    });
    $("#downloadLetter").addEventListener("click", () => {
      const blob = new Blob([$("#letterOutput").value], { type: "text/plain" });
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "sms-shield-dispute-letter.txt" });
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
      toast("Letter downloaded");
    });
  }

  /* ---------------- Guided flow: photo → next steps → summary ---------------- */
  // The current check lives in memory only. Photos and personal details are never stored.
  // check: { source: "photo" | "words", summary, conditions: [{ name, conditionKey, why }], urgency, redFlag }
  let check = null;
  const letterInfo = { kind: "accommodation" };
  const lettersMade = new Set();
  const mode = () => window.A11y?.mode || "standard";
  const say = (text, opts = {}) => window.A11y?.speak(text, opts);
  const setSummary = (page, text) => window.A11y?.setSummary(page, text);

  const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("rm");
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const URG_RANK = { emergency: 0, urgent: 1, soon: 2, "self-care": 3 };

  // Estimated range from the cost data: treated early (low) to treated late (high).
  function costRangeFor(c) {
    const known = (c?.conditions || []).map((x) => D.CONDITIONS[x.conditionKey]).find(Boolean);
    if (!known) return null;
    const m = multiplier(), sum = (rows) => rows.reduce((a, [, v]) => a + v * m, 0);
    return { low: sum(known.early), high: sum(known.late), name: known.name, early: sum(known.early) };
  }

  /* Camera */
  let stream = null;
  async function startCamera() {
    const video = $("#camVideo");
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } }, audio: false });
      video.srcObject = stream; video.hidden = false; await video.play();
      $("#camShot").hidden = true; $("#camMsg").hidden = true;
      $("#photoMain").textContent = "Take photo";
      announce("The camera is on. Point it at the problem area. Press Take photo, press the space bar, or say take photo.", { interrupt: true });
      return true;
    } catch {
      $("#camMsg").hidden = false;
      $("#camMsg").textContent = "We can't use the camera. That's okay. You can upload a photo, or describe it in words below.";
      $("#describeBox").open = true;
      announce("We can't use the camera. That's okay. You can upload a photo, or describe it in words.", { interrupt: true });
      return false;
    }
  }
  function stopCamera() {
    stream?.getTracks().forEach((t) => t.stop()); stream = null;
    const v = $("#camVideo"); if (v) { v.srcObject = null; v.hidden = true; }
  }

  // The 3, 2, 1 countdown: a big number that pops each second with the spoken number.
  let counting = false;
  async function countdown() {
    const box = $("#countdown");
    for (const n of ["3", "2", "1"]) {
      box.innerHTML = `<span>${n}</span>`;
      $("#srAssertive").textContent = n;
      say(n, { force: mode() !== "text", interrupt: true, cache: true });
      await wait(1000);
    }
    box.innerHTML = "";
  }
  function grabFrame(source, w, h) {
    const scale = Math.min(1, 1024 / Math.max(w, h));
    const canvas = Object.assign(document.createElement("canvas"), { width: Math.round(w * scale), height: Math.round(h * scale) });
    canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  }
  async function takePhoto() {
    if (counting) return;
    if (!stream && !(await startCamera())) return;
    counting = true; $("#photoMain").disabled = true;
    try {
      await countdown();
      const v = $("#camVideo");
      const image = grabFrame(v, v.videoWidth, v.videoHeight);
      $("#camShot").src = image; $("#camShot").hidden = false;
      stopCamera();
      $("#photoMain").textContent = "Retake photo";
      await analyzePhoto(image);
    } finally { counting = false; $("#photoMain").disabled = false; }
  }
  function loadFile(file) {
    if (!file || !file.type.startsWith("image/")) { toast("Please choose a photo file."); return; }
    const img = new Image();
    img.onload = () => {
      const image = grabFrame(img, img.naturalWidth, img.naturalHeight);
      URL.revokeObjectURL(img.src);
      stopCamera();
      $("#camShot").src = image; $("#camShot").hidden = false; $("#camMsg").hidden = true;
      $("#photoMain").textContent = "Retake with camera";
      analyzePhoto(image);
    };
    img.onerror = () => toast("That photo could not be opened. Please try another one.");
    img.src = URL.createObjectURL(file);
  }

  async function analyzePhoto(image) {
    const box = $("#photoResults");
    box.innerHTML = `<div class="loading"><span class="spinner"></span>Looking at your photo…</div>`;
    announce("Looking at your photo. This takes a few seconds.", { interrupt: true });
    try {
      const r = await fetch("/api/vision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image, note: $("#photoNote").value }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "unavailable");
      const res = data.result;
      if (!res.imageUsable) {
        box.innerHTML = `<div class="kind-error" role="alert"><h3>Let's try that photo again</h3><p>${esc(res.summary)}</p></div>`;
        announce(`Let's try that photo again. ${res.summary}`, { interrupt: true });
        return;
      }
      check = { source: "photo", summary: res.summary, conditions: res.possibleConditions, urgency: res.urgency, redFlag: res.redFlag };
      renderCheck(box, true);
    } catch {
      $("#describeBox").open = true;
      box.innerHTML = `<div class="kind-error" role="alert"><h3>Photo check is resting right now</h3><p>That's okay. Tell us in words in the box above, and we will still show your options and your rights.</p></div>`;
      announce("Photo check is not available right now. That's okay. Describe it in words instead, and we will still show your options and your rights.", { interrupt: true });
      $("#describeText").focus();
    }
  }

  // Words instead of a photo: reuse the symptom checker and shape it like a photo result.
  async function describeCheck(text) {
    const box = $("#photoResults");
    box.innerHTML = `<div class="loading"><span class="spinner"></span>Checking…</div>`;
    let result;
    try {
      const r = await fetch("/api/symptoms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, state: state.loc.state }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      result = data.demo ? demoSymptoms(text) : data.result;
    } catch { result = demoSymptoms(text); }
    check = fromSymptoms(result, "words");
    renderCheck(box, true);
  }
  function fromSymptoms(result, source) {
    const conds = result.conditions || [];
    const urgency = conds.map((c) => c.urgency).sort((a, b) => URG_RANK[a] - URG_RANK[b])[0] || "soon";
    return {
      source, summary: result.summary,
      conditions: conds.map((c) => ({ name: c.name, conditionKey: c.conditionKey, why: c.why })),
      urgency, redFlag: (result.redFlags || []).slice(0, 3).join(". ") || "Call 911 for trouble breathing, chest pain, or confusion.",
    };
  }

  // Shared result view: conditions one at a time, urgency, red flag, then cost and rights.
  function renderCheck(box, fresh = false) {
    if (!check) return;
    const [ucls, ulabel] = URG[check.urgency] || URG.soon;
    const range = costRangeFor(check);
    const panel = L.costAndRights({ urgency: check.urgency, mode: mode(), costRange: range, insurance: state.bill?.insurance });
    const items = panel.items.map((x) => ({ ...x, law: null }));
    box.innerHTML = `
      ${check.urgency === "emergency" ? `<div class="emergency-banner" role="alert"><strong>This could be an emergency.</strong> Call 911 or go to the ER now. The ER must treat you even if you cannot pay.</div>` : ""}
      <section class="result-block" aria-labelledby="condTitle">
        <div class="result-head"><p class="eyebrow accent">What it could be</p>
          <span class="urg big ${ucls}" id="urgPill">${esc(ulabel)}</span></div>
        <h2 id="condTitle" tabindex="-1">${esc(check.summary || "Here is what it could be")}</h2>
        <ol class="cond-seq">${check.conditions.map((c, i) => `
          <li class="seq" style="--i:${i}"><span class="right-num">${String(i + 1).padStart(2, "0")}</span>
            <div><h3>Could be: ${esc(c.name)}</h3><p>${esc(c.why)}</p></div></li>`).join("")}</ol>
        <div class="redflag-note"><strong>Get urgent care if:</strong> ${esc(check.redFlag)}</div>
        <p class="fineprint">This is not a diagnosis. A clinician can tell you for sure.</p>
      </section>
      <section class="result-block rights-panel" aria-labelledby="rightsTitle">
        <p class="eyebrow accent">Rights check</p>
        <h2 id="rightsTitle">What this could cost and what protects you</h2>
        <div class="cost-strip">${range
          ? `<div><span class="eyebrow">Estimated cost</span><strong>${esc(panel.cost)}</strong><small>Treated early to treated late, for ${esc(range.name)}. ${esc(panel.costNote)}</small></div>`
          : `<div><span class="eyebrow">Estimated cost</span><strong>Varies</strong><small>We don't have price data for this one. Financial help and your rights below still apply.</small></div>`}</div>
        ${rightsCardsHTML(items).replace(/status-pill (\w+)">[^<]+</g, 'status-pill checking" data-final="$1">Checking<')}
        ${precedentHTML(["access", ...items.map((x) => x.tag)])}
        <div class="btn-row">
          <a class="btn btn-primary btn-lg" href="#next">See my next steps</a>
          <button class="btn btn-secondary btn-lg" type="button" data-read-rights>Read my rights</button>
        </div>
      </section>`;
    playSequence(box);
    const brief = `${check.urgency === "emergency" ? "This could be an emergency. Call 911. " : ""}It could be ${check.conditions.slice(0, 2).map((c) => c.name).join(" or ")}. ${ulabel}. ` +
      `${items.length} rights apply: ${items.map((x) => x.title).join(", ")}. Next, open your next steps.`;
    setSummary("photo", brief);
    $("[data-read-rights]", box).addEventListener("click", () => readRights(items));
    if (fresh) {
      const spoken = `${check.urgency === "emergency" ? "This could be an emergency. Call 911 or go to the ER now. " : ""}` +
        `It could be ${check.conditions.map((c) => c.name).join(", or ")}. ${ulabel}. Get urgent care if: ${check.redFlag}. ` +
        `Your rights check: ${items.map((x) => `${x.title}. ${x.body}`).join(" ")} ${L.DISCLAIMER} Say next step to see your options.`;
      announce(spoken, { interrupt: true, assertive: check.urgency === "emergency" });
      $("#condTitle").focus({ preventScroll: true });
      $("#condTitle").scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
    }
  }
  // Conditions appear one by one, then each rights status settles from Checking.
  function playSequence(root) {
    const seq = $$(".seq", root), pills = $$("[data-final]", root);
    const settle = (p) => { p.className = `status-pill ${p.dataset.final}`; p.textContent = STATUS[p.dataset.final]; };
    if (reduceMotion()) { seq.forEach((el) => el.classList.add("in")); pills.forEach(settle); $$(".reveal", root).forEach((el) => el.classList.add("in")); return; }
    seq.forEach((el, i) => setTimeout(() => el.classList.add("in"), 250 + i * 450));
    const base = 250 + seq.length * 450;
    $$(".reveal", root).forEach((el, i) => setTimeout(() => el.classList.add("in"), base + i * 220));
    pills.forEach((p, i) => setTimeout(() => settle(p), base + 600 + i * 450));
  }
  function readRights(items) {
    say(`Your rights. ${items.map((x, i) => `${i + 1}. ${x.title}. ${x.body || x.plain} ${x.ask || ""}`).join(" ")} ${L.DISCLAIMER}`, { force: true, interrupt: true });
  }

  function initPhoto() {
    $("#photoMain").addEventListener("click", () => (stream ? takePhoto() : startCamera()));
    $("#photoFile").addEventListener("change", (e) => { loadFile(e.target.files[0]); e.target.value = ""; });
    $("#describeForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const t = $("#describeText").value.trim();
      if (t.length < 3) { toast("Tell us a little about it first."); $("#describeText").focus(); return; }
      describeCheck(t);
    });
    window.addEventListener("sms:capture", () => { if (location.hash !== "#photo") location.hash = "photo"; setTimeout(takePhoto, 200); });
    document.addEventListener("keydown", (e) => {
      if (e.key !== " " || location.hash !== "#photo" || /input|textarea|select|button|a/i.test(document.activeElement?.tagName)) return;
      e.preventDefault(); takePhoto();
    });
  }

  /* Next steps: three options, each with its legal angle and a letter */
  const OPTION_LETTERS = { doctor: "accommodation", home: "appeal", clinic: "charity" };
  function renderNext() {
    const box = $("#nextOptions");
    if (!check) {
      box.innerHTML = `<div class="empty-state"><h3>Start with a photo check</h3><p>Take a photo or describe what is going on. Then your options and rights show up here.</p><a class="btn btn-primary btn-lg" href="#photo">Start a photo check</a></div>`;
      $("#toSummary").hidden = true; $("#letterPanel").hidden = true;
      return;
    }
    $("#toSummary").hidden = false;
    const range = costRangeFor(check);
    const emergency = check.urgency === "emergency";
    const acc = L.accommodationsFor(mode());
    const R = (id) => L.RIGHTS.find((r) => r.id === id);
    const options = [
      {
        id: "doctor", num: "01", title: emergency ? "Go to the ER now" : "See a doctor",
        when: emergency ? "Call 911 or go to the nearest ER." : check.urgency === "urgent" ? "Within 24 hours, at urgent care or your doctor." : "Book a visit this week.",
        cost: range ? `About ${money(range.early)} if treated early` : "Varies by plan and place",
        ask: acc.slice(0, 3), rights: [emergency ? R("emtala") : R("longer-visit"), emergency ? R("nsa-emergency") : R("nsa-oon")],
        letter: "Accommodation request",
      },
      {
        id: "home", num: "02", title: "Care for it at home",
        when: emergency ? "Not safe for this. Get emergency care." : "Rest, keep it clean, and watch for the warning signs below.",
        cost: "Usually under $30 for supplies or generic medicine",
        ask: ["Written care instructions in a format you can use", "The generic version of any medicine"],
        rights: [R("formats"), R("appeal")], letter: "Insurance appeal",
      },
      {
        id: "clinic", num: "03", title: "Find an affordable clinic",
        when: "A community health center or a nonprofit hospital clinic near you.",
        cost: "Sliding fee based on your income",
        ask: ["Their sliding fee scale", "The financial assistance application"],
        rights: [R("sliding-fee"), R("charity")], letter: "Financial help request",
      },
    ];
    box.innerHTML = `
      ${emergency ? `<div class="emergency-banner" role="alert"><strong>This could be an emergency.</strong> Call 911 or go to the ER now.</div>` : ""}
      <p class="context-line">Based on your ${check.source === "photo" ? "photo" : "description"}: could be ${esc(check.conditions.map((c) => c.name).join(" or "))}. <span class="urg ${(URG[check.urgency] || URG.soon)[0]}">${esc((URG[check.urgency] || URG.soon)[1])}</span></p>
      <div class="option-grid">${options.map((o, i) => `
        <article class="option-card stagger reveal${emergency && o.id === "home" ? " muted" : ""}" style="--i:${i}" aria-labelledby="opt-${o.id}">
          <span class="tool-num">${o.num} · Option</span>
          <h3 id="opt-${o.id}">${esc(o.title)}</h3>
          <p>${esc(o.when)}</p>
          <p class="opt-cost"><b>Cost:</b> ${esc(o.cost)}</p>
          <div class="legal-angle">
            <p class="eyebrow accent">Your legal angle</p>
            <p><b>Ask for:</b></p>
            <ul>${o.ask.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>
            <ul class="angle-rights">${o.rights.filter(Boolean).map((r) => `<li><b>${esc(r.title)}.</b> ${esc(r.plain)} <span class="cite">${esc(L.label(r))}</span></li>`).join("")}</ul>
          </div>
          <div class="opt-actions">
            <button class="btn btn-primary" type="button" data-letter="${OPTION_LETTERS[o.id]}">Generate ${esc(o.letter.toLowerCase())}</button>
            <button class="btn btn-secondary" type="button" data-read-opt="${o.id}">Read rights</button>
          </div>
        </article>`).join("")}</div>
      <p class="legal-note">${L.DISCLAIMER} Cost figures are estimates.</p>`;
    revealIn(box);
    setSummary("next", `${emergency ? "This could be an emergency. Go to the ER now. " : ""}For a doctor visit, ask for ${lowerFirst(acc[0])}. A clinic near you may charge by income. Press a Generate letter button to make a letter.`);
    $$("[data-letter]", box).forEach((b) => b.addEventListener("click", () => openLetter(b.dataset.letter)));
    $$("[data-read-opt]", box).forEach((b) => b.addEventListener("click", () => {
      const o = options.find((x) => x.id === b.dataset.readOpt);
      readRights([...o.rights.filter(Boolean), { title: "Ask for", body: o.ask.join(". ") + "." }]);
    }));
  }

  function renderFlowLetter() {
    const f = Object.fromEntries(new FormData($("#flowLetterForm")).entries());
    Object.assign(letterInfo, f);
    const needs = L.accommodationsFor(mode());
    $("#flowLetterOutput").value = L.letter(f.kind, { ...f, mode: mode(), needs, billed: state.bill?.billed }, state.bill || {});
  }
  function openLetter(kind) {
    const panel = $("#letterPanel");
    panel.hidden = false;
    $("#flowLetterKind").value = kind;
    renderFlowLetter();
    lettersMade.add(kind);
    setSummary("next", `Your ${L.LETTER_KINDS[kind].toLowerCase()} is ready. Add your name, then copy or download it.`);
    $("#letterTitle").textContent = `${L.LETTER_KINDS[kind]}: ready to send`;
    $("#letterTitle").focus({ preventScroll: true });
    panel.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
    announce(`Your ${L.LETTER_KINDS[kind].toLowerCase()} is ready. Add your name to fill it in, then copy or download it. Say read results to hear it.`, { interrupt: true });
  }
  function initNext() {
    const sel = $("#flowLetterKind");
    sel.innerHTML = Object.entries(L.LETTER_KINDS).map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join("");
    $("#flowLetterForm").addEventListener("input", renderFlowLetter);
    $("#flowLetterForm").addEventListener("change", () => { renderFlowLetter(); lettersMade.add(sel.value); });
    $("#flowLetterRead").addEventListener("click", () => say($("#flowLetterOutput").value, { force: true, interrupt: true }));
    $("#flowLetterCopy").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText($("#flowLetterOutput").value); toast("Letter copied"); }
      catch { $("#flowLetterOutput").select(); toast("Press Ctrl or Cmd and C to copy"); }
    });
    $("#flowLetterDownload").addEventListener("click", () => downloadText($("#flowLetterOutput").value, `sms-shield-${sel.value}-letter.txt`, "Letter downloaded"));
  }
  function downloadText(text, filename, msg) {
    const blob = new Blob([text], { type: "text/plain" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: filename });
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
    toast(msg);
  }

  /* Summary */
  function summaryText() {
    if (!check) return "";
    const [, ulabel] = URG[check.urgency] || URG.soon;
    const range = costRangeFor(check);
    const rights = L.rightsFor({ mode: mode(), urgency: check.urgency, tags: ["cost"] }).slice(0, 6);
    return [
      "SMS Shield summary",
      `Date: ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
      "",
      "WHAT IT COULD BE",
      ...check.conditions.map((c) => `- Could be ${c.name}: ${c.why}`),
      `How soon: ${ulabel}`,
      `Get urgent care if: ${check.redFlag}`,
      "",
      "COST",
      range ? `Estimated ${money(range.low)} to ${money(range.high)} (treated early to treated late). This is an estimate.` : "Cost varies.",
      "",
      "ACCOMMODATIONS TO ASK FOR",
      ...L.accommodationsFor(mode()).map((a) => `- ${a}`),
      "",
      "YOUR RIGHTS",
      ...rights.map((r) => `- ${r.title}. ${r.plain} (${L.label(r)})`),
      "",
      lettersMade.size ? `LETTERS YOU MADE: ${[...lettersMade].map((k) => L.LETTER_KINDS[k]).join(", ")}` : "LETTERS: none yet. You can make one on the Next steps page.",
      "",
      "This is not a diagnosis. I am not a doctor or lawyer. General information, not legal advice. In an emergency, call 911.",
    ].join("\n");
  }
  function renderSummary() {
    const body = $("#summaryBody");
    $$(".page[data-page=summary] .btn-row .btn").forEach((b) => (b.hidden = !check));
    if (!check) {
      body.innerHTML = `<div class="empty-state"><h3>Nothing to sum up yet</h3><p>Start a photo check first.</p><a class="btn btn-primary btn-lg" href="#photo">Start a photo check</a></div>`;
      return;
    }
    const sections = summaryText().split("\n\n").slice(1);
    body.innerHTML = `<article class="summary-doc">${sections.map((sec, i) => {
      const [head, ...lines] = sec.split("\n");
      const isList = lines.length && lines.every((l) => l.startsWith("- "));
      return `<section class="summary-sec reveal" style="--i:${i}">${/^[A-Z ]+(:|$)/.test(head) ? `<h2>${esc(head.split(":")[0].toLowerCase().replace(/^\w/, (c) => c.toUpperCase()))}</h2>${head.includes(":") ? `<p>${esc(head.split(": ").slice(1).join(": "))}</p>` : ""}` : `<p>${esc(head)}</p>`}
        ${isList ? `<ul>${lines.map((l) => `<li>${esc(l.slice(2))}</li>`).join("")}</ul>` : lines.map((l) => `<p>${esc(l.replace(/^- /, ""))}</p>`).join("")}</section>`;
    }).join("")}</article>`;
    revealIn(body);
    const range = costRangeFor(check);
    setSummary("summary", `It could be ${check.conditions[0]?.name}. ${(URG[check.urgency] || URG.soon)[1]}.${range ? ` Estimated cost ${money(range.low)} to ${money(range.high)}.` : ""} Ask for ${lowerFirst(L.accommodationsFor(mode())[0])}.`);
  }
  function initSummary() {
    $("#summaryRead").addEventListener("click", () => say(summaryText(), { force: true, interrupt: true }));
    $("#summaryDownload").addEventListener("click", () => downloadText(summaryText(), "sms-shield-summary.txt", "Summary downloaded"));
    $("#summaryPrint").addEventListener("click", () => window.print());
  }

  /* ---------------- Floating chat ---------------- */
  const chatHistory = [];
  function initChat() {
    const fab = $("#chatFab"), chat = $("#chat"), log = $("#chatLog"), input = $("#chatInput");
    const toggle = (open) => {
      chat.hidden = !open; fab.setAttribute("aria-expanded", open);
      if (open) input.focus(); else if (chat.contains(document.activeElement) || document.activeElement === document.body) fab.focus();
    };
    fab.addEventListener("click", () => toggle(chat.hidden));
    $("#chatClose").addEventListener("click", () => toggle(false));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !chat.hidden) toggle(false); });

    // Bot replies may use light markdown: **bold** and "- " bullets. A "Your rights:" line
    // becomes a rights card and the disclaimer gets its own line, so both are easy to find.
    const fmt = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/^\s*[-*]\s+/gm, "• ");
    const add = (role, text) => {
      const el = document.createElement("div");
      el.className = `msg ${role}`;
      if (role === "bot") {
        const disc = /I am not a doctor or lawyer\.?[^\n]*$/i;
        const rest = text.replace(disc, "").trim();
        const [body, rights] = rest.split(/\n?\s*\**Your rights:?\**:?\s*/i);
        el.innerHTML = fmt(body.trim()) +
          (rights ? `<div class="chat-rights"><span class="eyebrow accent">Your rights</span>${fmt(rights.trim())}</div>` : "") +
          (disc.test(text) ? `<p class="chat-disc">I am not a doctor or lawyer. ${L.DISCLAIMER}</p>` : "");
      } else el.textContent = text;
      log.appendChild(el); log.scrollTop = log.scrollHeight; return el;
    };
    // Offline answers: the billing FAQ plus any matching right from the legal module.
    const RIGHT_WORDS = [
      ["interpret", "interpreter"], ["asl", "interpreter"], ["sign language", "interpreter"], ["deaf", "interpreter"],
      ["braille", "formats"], ["large print", "formats"], ["blind", "formats"], ["service dog", "service-animal"], ["service animal", "service-animal"],
      ["wheelchair", "exam-room"], ["exam table", "exam-room"], ["accommodat", "longer-visit"], ["longer appointment", "longer-visit"],
      ["medicaid", "medicaid-hearing"], ["refuse", "equal-access"], ["turned away", "equal-access"], ["discriminat", "section-1557"],
      ["emergency room", "emtala"], ["can't pay", "emtala"], ["cant pay", "emtala"],
    ];
    const demoReply = (q) => {
      const t = q.toLowerCase();
      const hit = D.CHAT_ANSWERS.find((a) => a.words.some((w) => t.includes(w)));
      const ids = [...new Set(RIGHT_WORDS.filter(([w]) => t.includes(w)).map(([, id]) => id))];
      const rights = ids.map((id) => L.RIGHTS.find((r) => r.id === id)).filter(Boolean);
      if (!hit && !rights.length) return "I'm in offline mode right now. I can still answer questions about interpreters, accessible formats, service animals, accommodations, surprise bills, charity care, appeals and Medicaid. For symptoms, try the photo check or Symptoms page.\n\nI am not a doctor or lawyer. General information, not legal advice.";
      const body = hit ? hit.reply : rights.map((r) => `${r.plain} ${r.ask}`).join(" ");
      const cites = rights.length ? `\nYour rights: ${rights.map((r) => `${r.title} (${L.label(r)})`).join("; ")}` : "";
      return `${body}${cites}\n\nI am not a doctor or lawyer. General information, not legal advice.`;
    };
    const context = () => {
      const parts = [];
      if (state.loc.state) parts.push(`Location: ${locLabel()}`);
      if (state.symptoms) parts.push(`Symptom check: "${state.symptoms.text}" → ${state.symptoms.result.conditions.map((c) => c.name).join(", ")}`);
      if (state.bill) parts.push(`Bill: ${state.bill.setting}, ${state.bill.insurance}, billed ${state.bill.billed || "?"}, hospital ${state.bill.hospital}`);
      return parts.join("; ");
    };
    async function ask(q) {
      q = q.trim(); if (!q) return;
      add("user", q); chatHistory.push({ role: "user", content: q });
      input.value = "";
      const typing = add("bot typing", "Thinking…");
      let reply;
      try {
        const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: chatHistory, context: context() }) });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        reply = data.demo ? demoReply(q) : data.reply;
      } catch (err) {
        console.warn("Chat AI unavailable, using demo answers:", err);
        $("#chatMode").textContent = `AI error: ${String(err.message || err).slice(0, 60)} · showing demo answers`;
        reply = demoReply(q);
      }
      typing.remove();
      add("bot", reply); chatHistory.push({ role: "assistant", content: reply });
      if (window.A11y?.speaks()) window.A11y.speak(reply.replace(/\*\*/g, ""), { interrupt: true });
    }
    $("#chatForm").addEventListener("submit", (e) => { e.preventDefault(); ask(input.value); });
    // Voice commands: "ask <question>" opens the assistant, a bare "ask" just opens it.
    window.addEventListener("sms:ask", (e) => { toggle(true); if (e.detail) ask(e.detail); });
    // Hands-free mode noticed signs of distress: offer help gently, never force it.
    window.addEventListener("sms:distress", () => {
      if (!chat.hidden && log.lastElementChild?.dataset.distress) return;
      toggle(true);
      const text = "You seem like you might be having a hard time. Do you want help? I can explain your options, or show urgent care choices. If this is an emergency, call 911.";
      const el = add("bot", text); el.dataset.distress = "1";
      chatHistory.push({ role: "assistant", content: text });
      if (window.A11y?.speaks()) window.A11y.speak(text, { interrupt: true });
      else window.A11y?.announce(text, { speakIt: false });
    });
    $$("#chatChips .chip").forEach((c) => c.addEventListener("click", () => ask(c.textContent)));

    // Voice input: ElevenLabs speech to text when the server has a key, otherwise the
    // browser's Web Speech API. The text box always works as the fallback.
    const mic = $("#micBtn");
    let listening = false, stopMic = null;
    const setMic = (on) => {
      listening = on; mic.classList.toggle("listening", on);
      mic.setAttribute("aria-label", on ? "Stop listening" : "Speak your question");
      if (on) window.A11y?.commands.pause(); else window.A11y?.commands.resume();
    };
    async function recordWithElevenLabs() {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setMic(false);
        input.placeholder = "Listening done. Turning speech into text…";
        try {
          const r = await fetch("/api/stt", { method: "POST", headers: { "Content-Type": rec.mimeType || "audio/webm" }, body: new Blob(chunks) });
          const data = await r.json();
          if (!r.ok || !data.text) throw new Error(data.error || "No speech found");
          ask(data.text);
        } catch {
          toast("I couldn't make out that recording. Please type your question.");
          input.focus();
        } finally { input.placeholder = "Ask a question"; }
      };
      rec.start();
      setMic(true);
      toast("Listening. Press the microphone again when you are done.");
      const auto = setTimeout(() => rec.state === "recording" && rec.stop(), 15000);
      stopMic = () => { clearTimeout(auto); if (rec.state === "recording") rec.stop(); };
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    function recordWithBrowser() {
      const rec = new SR(); rec.lang = "en-US"; rec.interimResults = true;
      rec.onresult = (e) => { input.value = [...e.results].map((r) => r[0].transcript).join(""); if (e.results[e.results.length - 1].isFinal) ask(input.value); };
      rec.onend = () => setMic(false);
      rec.onerror = () => { toast("I couldn't hear that. You can type your question instead."); input.focus(); };
      setMic(true); rec.start();
      stopMic = () => rec.stop();
    }
    mic.addEventListener("click", async () => {
      if (listening) { stopMic?.(); return; }
      try {
        if (state.stt && window.MediaRecorder && navigator.mediaDevices) await recordWithElevenLabs();
        else if (SR) recordWithBrowser();
        else { toast("Voice input isn't available in this browser. Please type your question."); input.focus(); }
      } catch {
        setMic(false);
        toast("The microphone is blocked. You can type your question instead.");
        input.focus();
      }
    });
  }

  async function checkStatus() {
    try {
      const r = await fetch("/api/status"); const s = await r.json();
      state.ai = s.ai; state.stt = s.stt;
      $("#chatMode").textContent = s.ai ? "AI assistant · not medical or legal advice" : "Demo mode · add an API key for AI answers";
    } catch { $("#chatMode").textContent = "Offline demo mode"; }
  }

  /* ---------------- Boot ---------------- */
  initLocation(); initPhoto(); initNext(); initSummary(); initBill(); initSymptoms(); initMeds(); initLegal(); initChat(); checkStatus();
  window.addEventListener("hashchange", route);
  route();
})();
