/* SMS Shield home page: help for each kind of disability, quick display
   settings, a before-your-visit checklist and numbers to know. Rights come
   from the shared legal module, so every one carries its citation. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const L = window.SMSLegal;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // Lowercase the first letter only, so "ASL" stays "ASL" mid-sentence.
  const lowerFirst = (t) => t.charAt(0).toLowerCase() + t.slice(1);
  const R = (id) => L.RIGHTS.find((r) => r.id === id);

  const GROUPS = [
    {
      id: "vision", tab: "Blind or low vision", mode: "voice",
      helps: ["Voice mode reads every step and result to you", "Say commands like \"take photo\" or \"read\"", "Large text and high contrast in one tap"],
      ask: ["Forms and results in large print, braille or an accessible digital file", "Staff to read forms to you and fill them in with you", "Your guide dog or service dog with you", "A staff member to guide you to the room"],
      tips: ["Ask for your format when you book, not at the desk", "Ask if their patient portal works with your screen reader"],
      rights: ["formats", "service-animal", "no-charge"],
    },
    {
      id: "hearing", tab: "Deaf or hard of hearing", mode: "text",
      helps: ["Text mode shows everything as text and captions", "Nothing depends on sound", "Chat with the helper by typing"],
      ask: ["A free qualified ASL interpreter, in person or by video", "Live captions or written notes", "Text or email instead of phone calls", "Staff to face you when they speak"],
      tips: ["Book the interpreter when you make the appointment", "You do not have to bring a family member to interpret"],
      rights: ["interpreter", "no-family-interpreter", "no-charge"],
    },
    {
      id: "mobility", tab: "Limited movement", mode: "handsfree",
      helps: ["Hands-free mode: move and choose with your face", "Big Back, Next and Select buttons", "Speak into any text box instead of typing"],
      ask: ["An accessible exam room with a table that lowers", "A lift and help with transfers", "A scale you can use, like a wheelchair scale", "Help filling out forms"],
      tips: ["Ask which room and equipment they will use before you go", "You should get a full exam, not a skipped one"],
      rights: ["exam-room", "longer-visit", "equal-access"],
    },
    {
      id: "thinking", tab: "Thinking, memory or learning", mode: "standard",
      helps: ["Plain words and one step at a time", "Read a short summary aloud on any page", "A printable summary to bring with you"],
      ask: ["Plain language and one thing at a time", "Written steps to take home", "A support person in the room with you", "Extra time to ask and answer questions"],
      tips: ["Write your questions down before the visit", "Ask them to repeat back the plan in simple words"],
      rights: ["longer-visit", "formats", "section-504"],
    },
    {
      id: "mental", tab: "Mental health", mode: "standard",
      helps: ["A calm helper you can ask anything", "No time limits on any page", "Crisis numbers always one tap away"],
      ask: ["A quiet room, or waiting outside until they call you", "To be told what will happen before each step", "Breaks during the visit", "A support person with you"],
      tips: ["It is okay to say you are anxious and need a minute", "In a crisis, call or text 988"],
      rights: ["longer-visit", "equal-access", "section-1557"],
    },
  ];

  const CHECKLIST = [
    "Call ahead and say what you need for the visit",
    "Ask for it in writing with an accommodation letter",
    "Ask how much it will cost and about financial help",
    "Bring a list of your medicines",
    "Bring a support person if you want one",
    "Ask for your results in a format you can use",
  ];

  const NUMBERS = [
    ["911", "Emergency. In many areas you can also text 911."],
    ["988", "Mental health crisis line. Call or text, any time."],
    ["711", "Relay service. Connects TTY and other relay calls to any phone number."],
    ["1-800-985-3059", "No Surprises Help Desk, for surprise medical bills."],
    ["1-800-949-4232", "ADA National Network, free answers about disability rights."],
    ["1-800-368-1019", "HHS Office for Civil Rights, to report discrimination in health care."],
  ];

  function panel(g) {
    const rights = g.rights.map(R).filter(Boolean);
    return `
      <div class="dz-cols">
        <div class="dz-col">
          <p class="eyebrow accent">How SMS Shield helps</p>
          <ul class="dz-list">${g.helps.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>
          ${g.mode !== "standard" ? `<button class="btn btn-secondary" type="button" data-mode-go="${g.mode}">Turn on ${g.mode === "voice" ? "voice" : g.mode === "text" ? "text" : "hands-free"} mode</button>` : ""}
          <p class="eyebrow accent dz-gap">Before your visit</p>
          <ul class="dz-list">${g.tips.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>
        </div>
        <div class="dz-col">
          <p class="eyebrow accent">What you can ask for</p>
          <ul class="dz-list check">${g.ask.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>
          <button class="btn btn-primary" type="button" data-letter-go>Make an accommodation letter</button>
        </div>
        <div class="dz-col">
          <p class="eyebrow accent">Your rights</p>
          <ol class="dz-rights">${rights.map((r, i) => `
            <li><span class="right-num">${String(i + 1).padStart(2, "0")}</span><div><b>${esc(r.title)}</b><p>${esc(r.plain)}</p><span class="cite">${esc(L.label(r))}</span></div></li>`).join("")}</ol>
          <p class="legal-note">${L.DISCLAIMER}</p>
        </div>
      </div>`;
  }

  function renderGroups() {
    const box = $("#dzTabs");
    if (!box) return;
    box.innerHTML = `
      <div class="dz-tablist" role="tablist" aria-label="Choose a disability">
        ${GROUPS.map((g, i) => `<button class="dz-tab" role="tab" id="dz-tab-${g.id}" aria-controls="dz-panel-${g.id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${esc(g.tab)}</button>`).join("")}
      </div>
      ${GROUPS.map((g, i) => `<div class="dz-panel" role="tabpanel" id="dz-panel-${g.id}" aria-labelledby="dz-tab-${g.id}" tabindex="0" ${i ? "hidden" : ""}>${panel(g)}</div>`).join("")}`;
    const tabs = $$(".dz-tab", box);
    const select = (t, focus) => {
      tabs.forEach((x) => { const on = x === t; x.setAttribute("aria-selected", on); x.tabIndex = on ? 0 : -1; $(`#${x.getAttribute("aria-controls")}`).hidden = !on; });
      if (focus) t.focus();
      const g = GROUPS[tabs.indexOf(t)];
      window.A11y?.setSummary("home", `Showing help for ${g.tab}. You can ask for ${lowerFirst(g.ask[0])}. Your top right: ${R(g.rights[0]).title}.`);
    };
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => select(t));
      // Arrow keys move between tabs, the usual tab pattern for screen readers.
      t.addEventListener("keydown", (e) => {
        const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (d) { e.preventDefault(); select(tabs[(i + d + tabs.length) % tabs.length], true); }
        if (e.key === "Home") { e.preventDefault(); select(tabs[0], true); }
        if (e.key === "End") { e.preventDefault(); select(tabs[tabs.length - 1], true); }
      });
    });
    box.addEventListener("click", (e) => {
      const m = e.target.closest("[data-mode-go]");
      if (m) window.A11y?.chooseMode(m.dataset.modeGo);
    });
  }

  function renderChecklist() {
    const box = $("#visitChecklist");
    if (!box) return;
    box.innerHTML = CHECKLIST.map((c, i) => `
      <li><label class="check-row"><input type="checkbox" id="vc-${i}"><span>${esc(c)}</span></label></li>`).join("");
    const update = () => {
      const done = $$("input:checked", box).length;
      $("#checklistCount").textContent = `${done} of ${CHECKLIST.length} done`;
      $("#checklistBar").style.transform = `scaleX(${done / CHECKLIST.length})`;
    };
    box.addEventListener("change", update);
    update();
  }

  function renderNumbers() {
    const box = $("#numbers");
    if (!box) return;
    box.innerHTML = NUMBERS.map(([n, d]) => `
      <li><a class="num-call" href="tel:${n.replace(/\D/g, "")}"><b>${esc(n)}</b><span>${esc(d)}</span></a></li>`).join("");
  }

  // Display settings right on the home page, shared with the Accessibility dialog.
  function initSettings() {
    const html = document.documentElement;
    const sync = (id, other) => {
      const a = $(id), b = $(other);
      if (!a || !b) return;
      a.checked = b.checked;
      a.addEventListener("change", () => { b.checked = a.checked; b.dispatchEvent(new Event("change")); });
    };
    sync("#homeContrast", "#prefContrast");
    sync("#homeLarge", "#prefLarge");
    const rm = $("#homeMotion");
    let calm = false;
    try { calm = localStorage.getItem("sms:calm") === "1"; } catch { /* storage blocked */ }
    html.classList.toggle("rm", calm);
    if (rm) {
      rm.checked = calm;
      rm.addEventListener("change", () => {
        html.classList.toggle("rm", rm.checked);
        try { localStorage.setItem("sms:calm", rm.checked ? "1" : "0"); } catch { /* storage blocked */ }
      });
    }
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-letter-go]")) window.dispatchEvent(new CustomEvent("sms:letter", { detail: "accommodation" }));
  });

  renderGroups(); renderChecklist(); renderNumbers(); initSettings();
})();
