/* SMS Shield accessibility layer: check-in gate, modes, speech output, captions,
   voice commands and focus management. Loaded before app.js, which calls
   window.A11y.announce() whenever it has something to tell the user. */
window.A11y = (() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const html = document.documentElement;
  const PREFS_KEY = "sms:a11y";
  const MODES = ["voice", "text", "handsfree", "full", "typing", "standard"];
  const MODE_NAMES = { voice: "Voice mode", text: "Text mode", handsfree: "Hands-free mode", full: "Full access", typing: "Typing mode", standard: "Standard mode" };
  // Full access assumes the worst: it speaks everything and captions everything,
  // and never needs the user to speak.
  const speaks = () => prefs.mode === "voice" || prefs.mode === "full";
  const captionsOn = () => prefs.mode === "text" || prefs.mode === "full";

  const prefs = Object.assign({ mode: null, contrast: false, large: false }, read());
  function read() { try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; } }
  function save() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* storage blocked */ } }

  let services = { voice: false };
  fetch("/api/status").then((r) => r.json()).then((s) => { services = s; }).catch(() => {});

  function applyPrefs() {
    MODES.forEach((m) => html.classList.toggle(`mode-${m}`, prefs.mode === m));
    html.classList.toggle("hc", !!prefs.contrast);
    html.classList.toggle("lg", !!prefs.large);
    $("#captions").hidden = !captionsOn();
    $$("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === prefs.mode)));
  }

  /* ---------------- Speech output: ElevenLabs first, browser voice as fallback ---------------- */
  const queue = [];
  let speaking = false, audio = null, lastSpoken = "";

  // `force` speaks in any mode (Read aloud buttons). `cache` marks fixed phrases
  // so the server and this page keep the audio and replay it instantly.
  function speak(text, { interrupt = false, force = false, cache = false } = {}) {
    text = String(text || "").replace(/\s+/g, " ").trim();
    if (!text || (!speaks() && !force)) return Promise.resolve();
    if (interrupt) stopSpeaking();
    return new Promise((done) => {
      queue.push({ text, cache, done });
      if (!speaking) drain();
    });
  }
  async function drain() {
    speaking = true;
    listener.pause();
    while (queue.length) {
      const { text, cache, done } = queue.shift();
      lastSpoken = text;
      try { await playVoice(text, cache); } catch { await browserSpeak(text); }
      done();
    }
    speaking = false;
    listener.resume();
  }
  const clipCache = new Map(); // text -> object URL, fixed phrases only
  async function fetchClip(text, cache) {
    if (cache && clipCache.has(text)) return clipCache.get(text);
    if (!services.voice) throw new Error("voice off");
    const r = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, cache }) });
    if (!r.ok) throw new Error("voice failed");
    const url = URL.createObjectURL(await r.blob());
    if (cache) clipCache.set(text, url);
    return url;
  }
  // Warm the cache for phrases we know are coming (countdown, page intros).
  function preload(texts) { if (services.voice) texts.forEach((t) => fetchClip(t, true).catch(() => {})); }
  async function playVoice(text, cache) {
    const url = await fetchClip(text, cache);
    audio = new Audio(url);
    await new Promise((resolve, reject) => {
      audio.onended = resolve; audio.onerror = reject; audio.onpause = resolve;
      audio.play().catch(reject);
    }).finally(() => { if (!cache) URL.revokeObjectURL(url); });
  }
  function browserSpeak(text) {
    return new Promise((resolve) => {
      if (!("speechSynthesis" in window)) return resolve();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1; u.lang = "en-US";
      u.onend = resolve; u.onerror = resolve;
      speechSynthesis.speak(u);
      setTimeout(resolve, 2000 + text.length * 90); // never hang if the engine stalls
    });
  }
  function stopSpeaking() {
    queue.splice(0).forEach((q) => q.done());
    if (audio) { audio.pause(); audio = null; }
    if ("speechSynthesis" in window) speechSynthesis.cancel();
  }

  /* ---------------- Announcements: screen reader, captions and voice ---------------- */
  function announce(text, { assertive = false, speakIt = true, interrupt = false } = {}) {
    text = String(text || "").trim();
    if (!text) return;
    const region = $(assertive ? "#srAssertive" : "#srPolite");
    region.textContent = "";
    requestAnimationFrame(() => { region.textContent = text; });
    caption(text);
    if (speakIt) speak(text, { interrupt });
  }
  function caption(text) {
    if (!captionsOn()) return;
    const log = $("#captionsLog");
    const p = document.createElement("p");
    p.textContent = text;
    log.appendChild(p);
    while (log.children.length > 2) log.firstChild.remove();
  }

  /* ---------------- Voice commands (Web Speech API) ---------------- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const listener = {
    rec: null, on: false, paused: false, handler: null,
    start(handler) {
      if (!SR) return false;
      this.handler = handler; this.on = true; this.paused = false;
      if (!this.rec) {
        this.rec = new SR();
        this.rec.lang = "en-US"; this.rec.continuous = true; this.rec.interimResults = false;
        this.rec.onresult = (e) => {
          const said = e.results[e.results.length - 1][0].transcript.trim();
          if (said && this.handler) this.handler(said.toLowerCase(), said);
        };
        this.rec.onend = () => { if (this.on && !this.paused) setTimeout(() => this.kick(), 250); };
        this.rec.onerror = (e) => { if (e.error === "not-allowed" || e.error === "service-not-allowed") this.on = false; };
      }
      this.kick();
      return true;
    },
    kick() { try { this.rec.start(); } catch { /* already running */ } },
    pause() { if (this.rec && this.on) { this.paused = true; try { this.rec.abort(); } catch { /* idle */ } } },
    resume() { if (this.rec && this.on && this.paused) { this.paused = false; this.kick(); } },
    stop() { this.on = false; if (this.rec) try { this.rec.abort(); } catch { /* idle */ } },
  };

  const PAGE_WORDS = [
    ["bill", "bill"], ["symptom", "symptoms"], ["photo", "photo"], ["picture", "photo"], ["camera", "photo"],
    ["next step", "next"], ["clinic", "next"], ["cost", "cost"], ["price of care", "cost"],
    ["medication", "meds"], ["medicine", "meds"], ["pharmacy", "meds"], ["drug", "meds"],
    ["legal", "legal"], ["letter", "legal"], ["dispute", "legal"], ["home", "home"],
  ];
  function pageFrom(said) {
    const hit = PAGE_WORDS.find(([w]) => said.includes(w));
    return hit && $(`[data-page="${hit[1]}"]`) ? hit[1] : null;
  }

  function onCommand(said, raw) {
    if (gateOpen()) {
      const pick = /\bblind|vision|one\b/.test(said) ? "voice" : /\bdeaf|hearing|two\b/.test(said) ? "text"
        : /\bmovement|hands|four\b/.test(said) ? "handsfree" : /\b(start|begin|go|hello|space|help|full)\b/.test(said) ? "full" : null;
      if (pick) proceedFromGate(pick);
      return;
    }
    if (modesOpen() || (!prefs.mode && currentPage() === "home")) {
      const m = /voice|one|\b1\b/.test(said) ? "voice" : /text|two|\b2\b/.test(said) ? "text"
        : /hands|free|three|\b3\b/.test(said) ? "handsfree" : /full|all|four|\b4\b/.test(said) ? "full" : /standard|normal|five|\b5\b/.test(said) ? "standard" : null;
      if (m) chooseMode(m);
      return;
    }
    if (/^(stop|quiet|be quiet|pause)$/.test(said)) return stopSpeaking();
    if (/\b(help|what can i say)\b/.test(said)) return help();
    if (/\b(repeat|say that again)\b/.test(said)) return speak(lastSpoken || "Nothing to repeat yet.", { interrupt: true });
    if (/\bread (everything|all|the whole page)\b/.test(said)) return readAll();
    if (/\b(read|results|summary|summarize)\b/.test(said)) return toggleReadPage();
    if (/\b(next|forward)\b/.test(said) && !/next step/.test(said)) return moveFocus(1);
    if (/\b(previous|back)\b/.test(said)) return moveFocus(-1);
    if (/^(select|click|press|choose|okay|ok|yes)\b/.test(said)) return activateFocused();
    if (/\b(take|snap)\b.*\b(photo|picture)\b/.test(said)) { window.dispatchEvent(new CustomEvent("sms:capture")); return; }
    const ask = said.match(/^(ask|assistant|question)\s*(.*)$/);
    if (ask) { window.dispatchEvent(new CustomEvent("sms:ask", { detail: ask[2] ? raw.slice(raw.length - ask[2].length) : "" })); return; }
    const sym = raw.match(/^(?:i have|i feel|i've got|my symptoms are|it hurts)\s*(.*)$/i);
    if (sym && currentPage() === "symptoms") { window.dispatchEvent(new CustomEvent("sms:symptoms", { detail: raw })); return; }
    if (/\b(go to|open|show|take me to)\b/.test(said) || said.split(" ").length <= 3) {
      const page = pageFrom(said);
      if (page) { location.hash = page; return; }
    }
    speak(`I heard "${raw}". Say help to hear what you can say.`, { interrupt: true });
  }

  /* ---------------- Page guidance in voice mode ---------------- */
  const GUIDE = {
    home: "Home page. SMS Shield helps you check a health worry, plan your next step, and know your rights. Say photo to start a photo check, or say symptoms, bill check, or rights. Say help at any time.",
    bill: "Bill Check. A form asks about a medical bill you received. Press Tab to move through each question, or say next. When you are done, choose Check this bill, then say read results.",
    symptoms: "Symptom Checker. Say what you are feeling, starting with I have or I feel. For example, say: I have a sore throat and fever. Or type it in the box and choose Check symptoms.",
    photo: "Photo Check. Point your camera at the problem area. Say take photo or press the space bar, and I will count down from three before taking it.",
    next: "Next steps. Your options are to see a doctor, care for it at home, or find an affordable clinic, with cost ranges. Say read results to hear them.",
    cost: "Cost Explorer. This compares the cost of treating a condition early with treating it late. Say read results to hear the comparison.",
    meds: "Medication Prices. This shows generic and brand name prices side by side. Say read results to hear them.",
    legal: "Rights and letters. This page has the steps to dispute a bill, the laws that apply, and a dispute letter written from your answers. Say read results to hear the letter.",
  };
  function currentPage() { return ($(".page:not([hidden])") || {}).dataset?.page || "home"; }

  function pageChanged() {
    const page = currentPage();
    const heading = $(`.page[data-page="${page}"] h1`);
    if (heading && !gateOpen() && !modesOpen()) {
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
    if (speaks()) speak(GUIDE[page] || heading?.textContent || "", { interrupt: true, cache: Boolean(GUIDE[page]) });
  }

  function help() {
    speak("You can say a page name, like home, bill check, symptoms, photo, costs, medications, or legal. Say read, to hear a short summary, or read everything. Say repeat, next, previous, select, or stop. Say ask, then your question, to use the assistant. On the keyboard, press H for help, R to repeat, S to stop, and A for the assistant.", { interrupt: true });
  }

  // "Read this page aloud" gives a short summary, not every word: what the page
  // is for, then what matters in the results. Pages report their results with
  // setSummary(). "Read everything" is there for anyone who wants it all.
  const SUMMARY = {
    home: "SMS Shield home. Choose voice, text or hands-free mode. Then start a photo check, or see the rights and tips for your disability.",
    photo: "Photo check. Take or upload a photo of the problem area, or describe it in words.",
    next: "Next steps. Three options: see a doctor, care at home, or an affordable clinic. Each one shows what to ask for and has a letter button.",
    summary: "Your summary. You can read it aloud, download it, or print it.",
    symptoms: "Symptom checker. Type or say how you feel, then press Check symptoms.",
    bill: "Bill check. Answer a few questions about a medical bill to see if it breaks the law.",
    cost: "Cost explorer. Compares the cost of treating a condition early versus late.",
    meds: "Medication prices. Generic and brand prices side by side.",
    legal: "Rights and letters. The steps to dispute a bill, the laws behind it, and a letter you can send.",
  };
  const results = {};
  function setSummary(page, text) { if (text) results[page] = text; else delete results[page]; }
  function pageSummary() {
    const page = currentPage();
    const base = SUMMARY[page] || $(`.page[data-page="${page}"] h1`)?.textContent || "";
    return results[page] ? `${base} ${results[page]}` : base;
  }

  let reading = false;
  function setReading(on) {
    reading = on;
    const b = $("#readAloudBtn");
    b.setAttribute("aria-pressed", String(on));
    $("span", b).textContent = on ? "Stop reading" : "Read a summary aloud";
  }
  function pageText() {
    const page = $(`.page[data-page="${currentPage()}"]`);
    if (!page) return "";
    const parts = $$("h1, h2, h3, h4, p, li, .impact strong, textarea", page)
      .filter((el) => el.offsetParent !== null && !el.closest("details:not([open]) > :not(summary)") && !el.closest("li li"))
      .map((el) => (el.value || el.innerText || "").trim()).filter(Boolean);
    return [...new Set(parts)].join(". ").replace(/\.\s*\./g, ".").slice(0, 2400);
  }
  async function toggleReadPage() {
    if (reading) { stopSpeaking(); setReading(false); return; }
    setReading(true);
    await speak(`${pageSummary()} Say read everything, or press E, to hear the whole page.`, { force: true, interrupt: true });
    setReading(false);
  }
  async function readAll() {
    setReading(true);
    await speak(pageText() || "This page is empty.", { force: true, interrupt: true });
    setReading(false);
  }

  function readResults() {
    const page = $(`.page[data-page="${currentPage()}"]`);
    const target = page && ($("[data-read]", page) || $(".results, #symptomResults, #costView, #medGrid, #letterOutput", page));
    if (!target) return speak("There are no results on this page yet.", { interrupt: true });
    const text = target.value || target.innerText;
    speak(text.slice(0, 1400) || "There are no results on this page yet.", { interrupt: true });
  }

  function focusables() {
    return $$('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select, textarea, [tabindex="0"]')
      .filter((el) => el.offsetParent !== null && !el.closest("[hidden]"));
  }
  function moveFocus(dir) {
    const list = focusables();
    const i = list.indexOf(document.activeElement);
    const next = list[(i + dir + list.length) % list.length];
    if (next) { next.focus(); next.scrollIntoView({ block: "center", behavior: "smooth" }); }
  }
  function activateFocused() {
    const el = document.activeElement;
    if (!el || el === document.body) return speak("Nothing is selected. Say next to move to an item.", { interrupt: true });
    if (el.matches("input[type=checkbox]")) el.click();
    else if (el.matches("select")) speak(`This is a list. Current choice: ${el.options[el.selectedIndex]?.text}. Use the arrow keys to change it.`, { interrupt: true });
    else el.click();
  }

  // Name an element the way a screen reader would, for low-vision users without one.
  function nameOf(el) {
    const label = el.getAttribute("aria-label") || (el.id && $(`label[for="${el.id}"]`)?.innerText) || el.closest("label")?.innerText?.split("\n")[0];
    let name = (label || el.innerText || el.placeholder || el.value || "").trim().split("\n")[0];
    if (el.matches("select")) name += `, list, ${el.options[el.selectedIndex]?.text || ""}`;
    else if (el.matches("input[type=checkbox]")) name += el.checked ? ", checked" : ", not checked";
    else if (el.matches("input, textarea")) name += ", edit text";
    else if (el.matches("a")) name += ", link";
    else if (el.matches("button")) name += ", button";
    return name.slice(0, 160);
  }
  let focusTimer = 0;
  document.addEventListener("focusin", (e) => {
    if (!speaks() || e.target.matches("h1, h2, main")) return;
    clearTimeout(focusTimer);
    focusTimer = setTimeout(() => speak(nameOf(e.target), { interrupt: true }), 120);
  });

  /* ---------------- Gate and mode chooser ---------------- */
  const gateOpen = () => !$("#a11yGate").hidden && !$("#a11yGate").classList.contains("leaving");
  const modesOpen = () => !$("#a11yModes").hidden;
  function setOverlay(on) { html.classList.toggle("a11y-gate-open", on); }

  // The logo intro doubles as the check-in: voice users need one key press before
  // the browser lets us talk. Other returning users see it briefly, once per visit.
  let gateTimer = 0;
  // First screen for everyone. We can't know who is here, so it works with no
  // sight (screen readers read the focused heading), no hearing (it is all text)
  // and no voice (one key does it). Space turns on full access.
  const GATE_SAY = "Welcome to SMS Shield. I will read each choice. Press the space bar, or tap anywhere, when you hear yours.";
  const calmNow = () => matchMedia("(prefers-reduced-motion: reduce)").matches || html.classList.contains("rm");
  // The logo intro plays first (gavel strikes, logo lands) and waits for a scroll,
  // then lifts away to the chooser. Space or a number also chooses straight away.
  let introDone = false;
  function openGate() {
    const gate = $("#a11yGate");
    gate.hidden = false; setOverlay(true);
    introDone = false;
    gate.classList.remove("revealed");
    $("#introStage").hidden = false;
    $("#gateTitle").focus();
    // The intro stays until the visitor scrolls, swipes, clicks or presses a key,
    // once the logo has landed. No timer pushes it away.
    introReadyAt = performance.now() + (calmNow() ? 0 : 1600);
    listener.start(onCommand);
  }
  let introReadyAt = 0, touchY = 0;
  const introScroll = (dy) => { if (!introDone && !$("#a11yGate").hidden && dy > 4 && performance.now() >= introReadyAt) endIntro(); };
  window.addEventListener("wheel", (e) => introScroll(e.deltaY), { passive: true });
  window.addEventListener("touchstart", (e) => { touchY = e.touches[0].clientY; }, { passive: true });
  window.addEventListener("touchmove", (e) => introScroll(touchY - e.touches[0].clientY), { passive: true });
  function endIntro() {
    if (introDone) return;
    introDone = true;
    clearTimeout(gateTimer);
    const gate = $("#a11yGate");
    // Returning users who need no speech go straight in after the intro.
    if (prefs.mode && !speaks()) { $("#introStage").hidden = true; return closeGateQuietly(); }
    gate.classList.add("revealed");
    setTimeout(() => { $("#introStage").hidden = true; }, calmNow() ? 0 : 560);
    $("#gateTitle").focus();
    startScan();
  }

  // Timed choices: each one lights up in turn and is read out loud. Press the
  // space bar, or tap anywhere, while yours is lit. One key or one tap is all it
  // takes, so it works without sight, hearing, speech or fine movement.
  const SCAN = [
    ["voice", "Blind or low vision"],
    ["text", "Deaf or hard of hearing"],
    ["typing", "Can't speak"],
    ["handsfree", "Limited movement"],
    ["full", "Full access. Blind, deaf, or can't speak"],
    ["continue", "No changes"],
  ];
  const SCAN_MS = 4000;
  let scanI = -1, scanRun = 0;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // Speak, but never let a blocked or slow voice hold up the timing.
  const sayFor = (text, max) => Promise.race([speak(text, { force: true, interrupt: true, cache: true }), wait(max)]);
  function markScan() {
    const choice = scanI >= 0 ? SCAN[scanI][0] : null;
    $$("#a11yGate [data-choice]").forEach((b) => b.classList.toggle("scan", b.dataset.choice === choice));
    const now = $("#gateNow");
    if (now) now.innerHTML = choice ? `Now: <b>${SCAN[scanI][1]}</b> · press space or tap anywhere` : "";
    const btn = $(`#a11yGate [data-choice="${choice}"]`);
    if (btn) { btn.style.setProperty("--scan-ms", `${SCAN_MS}ms`); btn.focus({ preventScroll: true }); btn.scrollIntoView({ block: "nearest" }); }
  }
  async function startScan() {
    const run = ++scanRun;
    scanI = -1; markScan();
    await sayFor(GATE_SAY, 7000);
    while (run === scanRun && gateOpen()) {
      for (let i = 0; i < SCAN.length && run === scanRun && gateOpen(); i++) {
        scanI = i; markScan();
        await Promise.all([sayFor(`${SCAN[i][1]}. Press space now.`, SCAN_MS + 1500), wait(SCAN_MS)]);
      }
    }
  }
  function stopScan() { scanRun++; scanI = -1; $$("#a11yGate .scan").forEach((b) => b.classList.remove("scan")); }
  function pickScanned() {
    const choice = scanI >= 0 ? SCAN[scanI][0] : "full";
    stopScan();
    proceedFromGate(choice);
  }
  function closeGateQuietly() {
    clearTimeout(gateTimer);
    closeOverlays();
    try { sessionStorage.setItem("sms:intro", "1"); } catch { /* storage blocked */ }
    pageChanged();
  }
  // From the gate, everyone lands on the gavel opening at the top of home.
  function toTop() {
    if (location.hash && location.hash !== "#home") location.hash = "home";
    setTimeout(() => window.scrollTo({ top: 0, behavior: "auto" }), 40);
  }
  function proceedFromGate(choice = "continue") {
    stopScan();
    clearTimeout(gateTimer);
    try { sessionStorage.setItem("sms:intro", "1"); } catch { /* storage blocked */ }
    toTop();
    if (choice !== "continue") return chooseMode(choice);
    if (prefs.mode && speaks()) return chooseMode(prefs.mode);
    if (prefs.mode) return closeGateQuietly();
    // Enter means "I don't need extra help". Remember that, so the check-in only
    // flashes past on later visits. Full access is one key away on the gate.
    listener.stop();
    chooseMode("standard");
  }
  function openModes() {
    $("#a11yGate").hidden = true;
    $("#a11yModes").hidden = false; setOverlay(true);
    $("#prefContrast").checked = !!prefs.contrast;
    $("#prefLarge").checked = !!prefs.large;
    $("#modesTitle").focus();
    if (prefs.mode && !speaks()) return;
    speak("How would you like to use SMS Shield? Press 1 for voice mode, for blind or low vision users. Press 2 for text mode, for deaf or hard of hearing users. Press 3 to control the site with your face. Press 4 for full access, which reads everything out loud and shows captions. Press 5 for typing mode, if you cannot speak. Press 6 for standard mode.", { interrupt: true, force: true });
  }
  function closeOverlays() {
    const gate = $("#a11yGate");
    // The logo intro lifts away; everything else closes at once.
    if (!gate.hidden && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gate.classList.add("leaving");
      setTimeout(() => { gate.hidden = true; gate.classList.remove("leaving"); }, 500);
    } else gate.hidden = true;
    $("#a11yModes").hidden = true; setOverlay(false);
  }

  function chooseMode(mode) {
    prefs.mode = mode; save(); applyPrefs(); closeOverlays();
    if (mode === "voice") listener.start(onCommand); else listener.stop();
    // Warm the voice cache with fixed phrases so they play instantly later.
    if (mode === "voice") preload(["3", "2", "1", GUIDE.photo, GUIDE.next, GUIDE.home]);
    if (mode === "full") preload(["3", "2", "1", GUIDE.photo, GUIDE.next, GUIDE.home]);
    if (mode !== "voice" && mode !== "full") stopSpeaking();
    if (mode === "voice" || mode === "handsfree") window.dispatchEvent(new CustomEvent("sms:skipintro"));
    window.dispatchEvent(new CustomEvent("sms:modechange", { detail: mode }));
    const intro = {
      voice: "Voice mode is on. I will read each page out loud, including your rights. Say help at any time to hear what you can say.",
      text: "Text mode is on. Spoken messages appear as captions in the corner, and nothing depends on sound.",
      handsfree: "Hands-free mode is on. Allow camera access when asked.",
      typing: "Typing mode is on. Everything works by typing, tapping or your keyboard. Nothing asks you to speak. Use the Help button to type a question at any time.",
      full: "Full access is on. I will read each page out loud and show everything as captions. You never need to speak. Press the down arrow to scroll, Tab to move, Enter to choose, H for help, and S to stop me talking.",
      standard: "Standard mode is on.",
    }[mode];
    announce(intro, { interrupt: true });
    setTimeout(pageChanged, speaks() ? 50 : 0);
  }

  // Tab and the arrow keys walk the gate's choices in a loop.
  function cycleGate(dir) {
    const items = $$("#a11yGate .gate-inner button");
    const i = items.indexOf(document.activeElement);
    items[(i + dir + items.length) % items.length].focus();
  }

  function trapFocus(e, root) {
    const items = $$("button, input, [tabindex='-1']", root).filter((el) => !el.closest("[hidden]"));
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ---------------- Keyboard ---------------- */
  // Capture phase, so the scroll intro never sees keys meant for the gate.
  window.addEventListener("keydown", (e) => {
    if (gateOpen()) {
      if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
      const pick = { 1: "voice", 2: "text", 3: "typing", 4: "handsfree", 5: "full" }[e.key];
      const space = e.key === " " || e.key === "Spacebar";
      // During the intro: a number chooses right away, any other key (space too) shows the choices.
      if (!introDone) { e.preventDefault(); e.stopImmediatePropagation(); return pick ? proceedFromGate(pick) : endIntro(); }
      // Space picks whichever choice is lit right now.
      if (space) { e.preventDefault(); e.stopImmediatePropagation(); return pickScanned(); }
      if (e.key === "Tab") { e.preventDefault(); return cycleGate(e.shiftKey ? -1 : 1); }
      if (["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(e.key)) { e.preventDefault(); return cycleGate(/Down|Right/.test(e.key) ? 1 : -1); }
      e.preventDefault(); e.stopImmediatePropagation();
      if (pick) return proceedFromGate(pick);
      // Enter on a focused choice does what it says; Enter anywhere else continues.
      if (e.key === "Enter") return proceedFromGate(document.activeElement?.dataset?.choice || "continue");
      if (e.key === "Escape") return proceedFromGate("continue");
      return;
    }
    // Welcome screen: 1, 2, 3 pick a mode until one is chosen.
    if (!prefs.mode && currentPage() === "home" && !/input|textarea|select/i.test(document.activeElement?.tagName)) {
      const n = { 1: "voice", 2: "text", 3: "handsfree", 4: "full" }[e.key];
      if (n) { e.preventDefault(); chooseMode(n); return; }
    }
    if (modesOpen()) {
      e.stopImmediatePropagation();
      const n = { 1: "voice", 2: "text", 3: "handsfree", 4: "full", 5: "typing", 6: "standard" }[e.key];
      if (n) { e.preventDefault(); chooseMode(n); }
      else if (e.key === "Escape" && prefs.mode) { e.preventDefault(); closeOverlays(); $("#a11yBtn").focus(); }
      else if (e.key === "Tab") trapFocus(e, $("#a11yModes"));
      return;
    }
    if (!speaks() || e.metaKey || e.ctrlKey || e.altKey) return;
    if (/input|textarea|select/i.test(document.activeElement?.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === "h") { e.preventDefault(); help(); }
    else if (k === "r") { e.preventDefault(); speak(lastSpoken || "Nothing to repeat yet.", { interrupt: true }); }
    else if (k === "s") { e.preventDefault(); stopSpeaking(); }
    else if (k === "e") { e.preventDefault(); readAll(); }
    else if (k === "a") { e.preventDefault(); window.dispatchEvent(new CustomEvent("sms:ask", { detail: "" })); }
  }, true);

  function init() {
    applyPrefs();
    $$("#a11yGate [data-choice]").forEach((b) => b.addEventListener("click", () => proceedFromGate(b.dataset.choice)));
    $("#introStage").addEventListener("click", endIntro);
    // Tapping anywhere that isn't a specific button picks the lit choice.
    $("#a11yGate").addEventListener("click", (e) => {
      if (!introDone || e.target.closest("button, #introStage")) return;
      pickScanned();
    });
    $$("[data-mode]").forEach((b) => b.addEventListener("click", () => chooseMode(b.dataset.mode)));
    $("#readAloudBtn").addEventListener("click", toggleReadPage);
    $("#prefContrast").addEventListener("change", (e) => { prefs.contrast = e.target.checked; save(); applyPrefs(); });
    $("#prefLarge").addEventListener("change", (e) => { prefs.large = e.target.checked; save(); applyPrefs(); });
    $("#a11yBtn").addEventListener("click", openModes);
    window.addEventListener("hashchange", () => setTimeout(pageChanged, 30));
    let seen = false;
    try { seen = sessionStorage.getItem("sms:intro") === "1"; } catch { /* storage blocked */ }
    // First visit, or voice mode (which needs a key press before the browser allows speech).
    if (!prefs.mode || speaks() || !seen) openGate();
    if (prefs.mode === "handsfree") window.dispatchEvent(new CustomEvent("sms:modechange", { detail: "handsfree" }));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();

  return {
    announce, speak, preload, stopSpeaking, help, readResults, toggleReadPage, readAll, setSummary, chooseMode, moveFocus, activateFocused, currentPage,
    get mode() { return prefs.mode; },
    speaks, captionsOn,
    // The scroll intro is skipped for voice and hands-free users, and while the check-in is open.
    shouldSkipIntro: () => speaks() || prefs.mode === "handsfree",
    blocksIntro: () => html.classList.contains("a11y-gate-open"),
    commands: listener,
  };
})();
