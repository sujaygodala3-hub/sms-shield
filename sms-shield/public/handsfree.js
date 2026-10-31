/* SMS Shield hands-free mode. Face tracking runs right in the browser with
   MediaPipe Face Landmarker (free, no account, frames never leave the device).
   If it can't load and the server has AWS keys, frames go to /api/face
   (Amazon Rekognition) instead. Face signals move focus and choose things:
     turn head right  -> next item       turn head left -> previous item
     open mouth       -> select          close eyes ~2s -> read this page aloud
   Each gesture must return to neutral before it can fire again. Frames are
   never stored. Big Back / Next / Select buttons are always there as a
   fallback, and work with a mouse, switch or keyboard. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const POLL_MS = 600;
  const YAW_ON = 22, YAW_OFF = 10;
  const DISTRESS_FRAMES = 3, DISTRESS_COOLDOWN = 3 * 60 * 1000;

  let stream = null, timer = 0, busy = false, failures = 0, paused = false;
  let turned = null, mouthOpen = false, eyesClosedFrames = 0, distressFrames = 0, lastDistress = 0;
  let swap = false;
  try { swap = localStorage.getItem("sms:hf-swap") === "1"; } catch { /* storage blocked */ }

  const panel = document.createElement("aside");
  panel.className = "hf-panel";
  panel.setAttribute("aria-label", "Hands-free controls");
  panel.hidden = true;
  panel.innerHTML = `
    <div class="hf-head">
      <video class="hf-cam" playsinline muted aria-hidden="true"></video>
      <div><strong>Hands-free</strong><p class="hf-status" role="status" aria-live="polite">Starting the camera…</p></div>
    </div>
    <ul class="hf-legend">
      <li data-g="right"><b>Turn right</b> Next</li>
      <li data-g="left"><b>Turn left</b> Back</li>
      <li data-g="mouth"><b>Open mouth</b> Select</li>
      <li data-g="eyes"><b>Close eyes 2s</b> Read aloud</li>
    </ul>
    <p class="hf-now" aria-hidden="true"></p>
    <div class="hf-buttons">
      <button type="button" class="btn btn-secondary" data-hf="back">Back</button>
      <button type="button" class="btn btn-secondary" data-hf="next">Next</button>
      <button type="button" class="btn btn-primary" data-hf="select">Select</button>
    </div>
    <div class="hf-row">
      <button type="button" class="link-btn" data-hf="pause">Pause face control</button>
      <label class="hf-swap"><input type="checkbox"> Swap left and right</label>
    </div>`;
  document.body.appendChild(panel);
  const video = $(".hf-cam", panel), statusEl = $(".hf-status", panel), nowEl = $(".hf-now", panel);
  const swapBox = $(".hf-swap input", panel);
  swapBox.checked = swap;

  const setStatus = (t) => { statusEl.textContent = t; };
  const flash = (g) => {
    const li = $(`[data-g="${g}"]`, panel);
    if (!li) return;
    li.classList.add("hit"); setTimeout(() => li.classList.remove("hit"), 700);
  };
  function showFocused() {
    const el = document.activeElement;
    const text = (el?.innerText || "").split("\n").map((t) => t.trim()).find((t) => t.length > 2);
    const name = el && el !== document.body ? (el.getAttribute("aria-label") || $("b, h3, h4", el)?.innerText || text || el.value || el.placeholder || "").trim().slice(0, 60) : "";
    nowEl.textContent = name ? `Now on: ${name}` : "";
  }

  // Face focus walks the current page, then the open chat, then the Help dock.
  // The header stays reachable by keyboard, but head turns go straight to content.
  function items() {
    const roots = [$(".page:not([hidden])"), $("#chat:not([hidden])"), $(".dock")].filter(Boolean);
    return roots.flatMap((r) => [...r.querySelectorAll('a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select, textarea, summary')])
      .filter((el) => el.offsetParent !== null && !el.closest("[hidden]") && !(el.closest("details:not([open])") && el.tagName !== "SUMMARY"));
  }
  function move(dir) {
    const list = items();
    if (!list.length) return;
    const cur = panel.contains(document.activeElement) ? lastFocus : document.activeElement;
    const i = list.indexOf(cur);
    const next = list[i === -1 ? (dir > 0 ? 0 : list.length - 1) : (i + dir + list.length) % list.length];
    next.focus({ preventScroll: true });
    next.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    showFocused();
  }
  const act = {
    next: () => move(1),
    back: () => move(-1),
    select: () => { window.A11y.activateFocused(); setTimeout(showFocused, 300); },
    read: () => window.A11y.toggleReadPage(),
  };
  panel.addEventListener("click", (e) => {
    const b = e.target.closest("[data-hf]");
    if (!b) return;
    const k = b.dataset.hf;
    if (k === "pause") { paused = !paused; b.textContent = paused ? "Resume face control" : "Pause face control"; setStatus(paused ? "Face control is paused." : "Face control is on."); return; }
    // Act on the page item the user was on, never on the panel button itself.
    if (k === "next" || k === "back" || k === "select") {
      e.preventDefault();
      if (panel.contains(document.activeElement) && lastFocus?.isConnected) lastFocus.focus();
      if (panel.contains(document.activeElement)) { if (k === "select") return; document.activeElement.blur(); }
      act[k]();
    }
  });
  // Clicking a panel button would steal focus; remember the last page item instead.
  let lastFocus = null;
  document.addEventListener("focusin", (e) => { if (!panel.contains(e.target)) lastFocus = e.target; });
  panel.addEventListener("mousedown", (e) => { if (e.target.closest("[data-hf]")) e.preventDefault(); });
  swapBox.addEventListener("change", () => {
    swap = swapBox.checked;
    try { localStorage.setItem("sms:hf-swap", swap ? "1" : "0"); } catch { /* storage blocked */ }
  });

  function fallback(message) {
    stopCamera();
    panel.classList.add("hf-fallback");
    setStatus(message);
    window.A11y?.announce(message, { interrupt: true });
  }

  // In-browser face tracking. Loaded only when hands-free mode starts.
  const MP = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
  const MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
  let landmarker = null, local = false, raf = 0, lastRun = 0, closedSince = 0;
  async function loadLocal() {
    if (landmarker) return true;
    try {
      const { FaceLandmarker, FilesetResolver } = await import(`${MP}/vision_bundle.mjs`);
      const files = await FilesetResolver.forVisionTasks(`${MP}/wasm`);
      landmarker = await FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: MODEL, delegate: "GPU" },
        runningMode: "VIDEO", numFaces: 1, outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true,
      });
      return true;
    } catch (err) {
      console.warn("Face tracking could not load:", err);
      return false;
    }
  }
  // Turn MediaPipe's output into the same signals the gesture code expects.
  function readLocal() {
    const out = landmarker.detectForVideo(video, performance.now());
    const shapes = out.faceBlendshapes?.[0]?.categories;
    if (!shapes) return { face: false };
    const score = (n) => shapes.find((c) => c.categoryName === n)?.score || 0;
    const m = out.facialTransformationMatrixes?.[0]?.data || [];
    const yaw = m.length ? Math.round((Math.atan2(m[8], m[10]) * 180) / Math.PI) : 0;
    const blink = (score("eyeBlinkLeft") + score("eyeBlinkRight")) / 2;
    const frown = (score("mouthFrownLeft") + score("mouthFrownRight")) / 2;
    return {
      face: true,
      eyesOpen: { value: blink < 0.5, confidence: 90 },
      mouthOpen: { value: score("jawOpen") > 0.35, confidence: 90 },
      yaw,
      distress: score("browInnerUp") > 0.6 && frown > 0.4,
    };
  }
  function localLoop(now) {
    raf = requestAnimationFrame(localLoop);
    if (paused || !stream || document.hidden || !video.videoWidth || now - lastRun < 100) return;
    lastRun = now;
    try { handle(readLocal()); } catch { /* skip a bad frame */ }
  }

  async function start() {
    panel.hidden = false;
    document.documentElement.classList.add("hf-on");
    panel.classList.remove("hf-fallback");
    setStatus("Loading face tracking…");
    local = await loadLocal();
    if (!local) {
      let status = {};
      try { status = await (await fetch("/api/status")).json(); } catch { /* offline */ }
      if (!status.rekognition) return fallback("Face control could not load. Use the big Back, Next and Select buttons, or Tab and Enter on a keyboard.");
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: "user" }, audio: false });
      video.srcObject = stream; await video.play();
    } catch {
      return fallback("We can't use the camera. That's okay. Use the big Back, Next and Select buttons, or Tab and Enter.");
    }
    failures = 0;
    setStatus("Face control is on. Turn your head to move.");
    if (!lastFocus) move(1);
    showFocused();
    if (local) raf = requestAnimationFrame(localLoop); else tick();
  }
  function stopCamera() {
    clearTimeout(timer); timer = 0;
    cancelAnimationFrame(raf); raf = 0;
    stream?.getTracks().forEach((t) => t.stop()); stream = null;
    video.srcObject = null;
  }
  function stop() {
    stopCamera();
    panel.hidden = true;
    document.documentElement.classList.remove("hf-on");
  }

  function frame() {
    const c = document.createElement("canvas");
    c.width = 320; c.height = 240;
    c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.7);
  }

  async function tick() {
    timer = setTimeout(tick, POLL_MS);
    if (busy || paused || !stream || document.hidden || !video.videoWidth) return;
    busy = true;
    try {
      const r = await fetch("/api/face", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: frame() }) });
      const f = await r.json();
      if (!r.ok) throw new Error(f.error);
      failures = 0;
      handle(f);
    } catch {
      if (++failures >= 4) fallback("Face control stopped working. Use the big Back, Next and Select buttons, or Tab and Enter.");
    } finally { busy = false; }
  }

  function handle(f) {
    if (!f.face) { setStatus("I can't see your face. Move into the camera view."); return; }
    if (statusEl.textContent.startsWith("I can't")) setStatus("Face control is on.");

    // Head turn: fire once, then wait for the head to come back to center.
    const yaw = swap ? -f.yaw : f.yaw;
    if (!turned && Math.abs(yaw) >= YAW_ON) {
      turned = yaw > 0 ? "right" : "left";
      flash(turned);
      turned === "right" ? act.next() : act.back();
    } else if (turned && Math.abs(yaw) <= YAW_OFF) turned = null;

    const open = f.mouthOpen.value && f.mouthOpen.confidence >= 70;
    if (open && !mouthOpen) { flash("mouth"); act.select(); }
    mouthOpen = open;

    // Eyes closed for about two seconds reads the page. Normal blinks are too short to count.
    const closed = !f.eyesOpen.value && f.eyesOpen.confidence >= 70;
    if (!closed) { closedSince = 0; eyesClosedFrames = 0; }
    else if (!closedSince) closedSince = performance.now();
    else if (!eyesClosedFrames && performance.now() - closedSince > 1800) { eyesClosedFrames = 1; flash("eyes"); act.read(); }

    // Signs of distress: gently offer help through the chat, at most every few minutes.
    distressFrames = f.distress ? distressFrames + 1 : 0;
    if (distressFrames >= (local ? DISTRESS_FRAMES * 10 : DISTRESS_FRAMES) && Date.now() - lastDistress > DISTRESS_COOLDOWN) {
      lastDistress = Date.now(); distressFrames = 0;
      window.dispatchEvent(new CustomEvent("sms:distress"));
    }
  }

  window.addEventListener("sms:modechange", (e) => (e.detail === "handsfree" ? start() : stop()));
  window.addEventListener("pagehide", stopCamera);
})();
