/* SMS Shield speak-to-type. Every text box gets a microphone button: press it,
   talk, press again (or pause for a moment) and the words land in the box.
   Uses /api/stt (free Groq Whisper on the server), then the browser's own
   speech recognition. Typing always still works. Audio is never saved. */
(() => {
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const SELECTOR = 'input:not([type]), input[type="text"], input[type="search"], input[type="number"], textarea';
  const SKIP = "#chatInput, .letter";
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let serverStt = false;
  fetch("/api/status").then((r) => r.json()).then((s) => { serverStt = !!s.stt; }).catch(() => {});

  const MIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
  const tell = (t) => window.A11y?.announce(t, { speakIt: false });

  function labelOf(field) {
    const l = field.getAttribute("aria-label") || field.closest("label")?.childNodes[0]?.textContent
      || (field.id && document.querySelector(`label[for="${field.id}"]`)?.textContent) || field.placeholder || "this box";
    return l.trim().replace(/\s+/g, " ").slice(0, 60);
  }

  // Put the words into the field the way typing would, so every listener updates.
  function insert(field, text) {
    text = text.trim();
    if (!text) return;
    if (field.type === "number") text = text.replace(/[^\d.]/g, "");
    const before = field.type === "number" ? "" : field.value.trim();
    field.value = before ? `${before} ${text}` : text;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    field.focus();
  }

  let active = null; // { button, stop }
  function setOn(button, on) {
    button.classList.toggle("listening", on);
    button.setAttribute("aria-pressed", String(on));
    button.setAttribute("aria-label", on ? "Stop listening and use what I said" : `Speak instead of typing: ${button.dataset.label}`);
    if (on) window.A11y?.commands.pause(); else window.A11y?.commands.resume();
  }

  async function recordServer(field, button) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream);
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise((resolve) => { rec.onstop = resolve; });
    rec.start();
    setOn(button, true);
    tell("Listening. Press the microphone again when you are done.");
    const auto = setTimeout(() => rec.state === "recording" && rec.stop(), 15000);
    active = { button, stop: () => rec.state === "recording" && rec.stop() };
    await done;
    clearTimeout(auto);
    stream.getTracks().forEach((t) => t.stop());
    setOn(button, false); active = null;
    button.classList.add("working");
    try {
      const r = await fetch("/api/stt", { method: "POST", headers: { "Content-Type": rec.mimeType || "audio/webm" }, body: new Blob(chunks) });
      const data = await r.json();
      if (!r.ok || !data.text) throw new Error(data.error || "empty");
      insert(field, data.text);
      tell(`Added: ${data.text}`);
    } catch {
      tell("I couldn't make that out. Please try again or type it.");
      field.focus();
    } finally { button.classList.remove("working"); }
  }

  function recordBrowser(field, button) {
    const rec = new SR();
    rec.lang = "en-US"; rec.interimResults = false;
    rec.onresult = (e) => { const t = e.results[0][0].transcript; insert(field, t); tell(`Added: ${t}`); };
    rec.onerror = () => { tell("I couldn't hear that. Please try again or type it."); field.focus(); };
    rec.onend = () => { setOn(button, false); active = null; };
    setOn(button, true);
    tell("Listening.");
    active = { button, stop: () => rec.stop() };
    rec.start();
  }

  async function toggle(field, button) {
    if (active) { const was = active.button; active.stop(); if (was === button) return; }
    try {
      if (serverStt && window.MediaRecorder && navigator.mediaDevices) await recordServer(field, button);
      else if (SR) recordBrowser(field, button);
      else { tell("Speaking isn't available in this browser. Please type instead."); field.focus(); }
    } catch {
      setOn(button, false); active = null;
      tell("The microphone is blocked. You can type instead.");
      field.focus();
    }
  }

  function enhance(root = document) {
    $$(SELECTOR, root).forEach((field) => {
      if (field.dataset.dictate || field.matches(SKIP) || field.readOnly) return;
      field.dataset.dictate = "1";
      const wrap = document.createElement("span");
      wrap.className = `dictate-wrap${field.tagName === "TEXTAREA" ? " is-area" : ""}`;
      field.parentNode.insertBefore(wrap, field);
      wrap.appendChild(field);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "dictate-btn";
      b.dataset.label = labelOf(field);
      b.innerHTML = MIC;
      setOn(b, false);
      b.addEventListener("click", (e) => { e.preventDefault(); toggle(field, b); });
      wrap.appendChild(b);
    });
  }

  enhance();
  // Results and forms added later (letters, describe box) get microphones too.
  new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach((n) => n.nodeType === 1 && enhance(n))))
    .observe(document.body, { childList: true, subtree: true });
})();
