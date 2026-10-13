try {
  init();
} catch (e) {
  console.error("US Keyboard Sender: errore di avvio", e);
}

function init() {
  // ---- Tabella US: carattere -> {code fisico, shift} ----
  const US = {};
  const add = (codes, plain, shifted) => {
    [...plain].forEach((c, i) => {
      US[c] = { code: codes[i], shift: false };
      if (shifted) US[shifted[i]] = { code: codes[i], shift: true };
    });
  };
  add(["Backquote"], "`", "~");
  add([..."1234567890"].map(d => "Digit" + d), "1234567890", "!@#$%^&*()");
  add(["Minus", "Equal", "BracketLeft", "BracketRight", "Backslash"], "-=[]\\", "_+{}|");
  add(["Semicolon", "Quote", "Comma", "Period", "Slash"], ";',./", ":\"<>?");
  for (const c of "abcdefghijklmnopqrstuvwxyz") {
    US[c] = { code: "Key" + c.toUpperCase(), shift: false };
    US[c.toUpperCase()] = { code: "Key" + c.toUpperCase(), shift: true };
  }
  US[" "] = { code: "Space", shift: false };
  US["\t"] = { code: "Tab", shift: false, key: "Tab" };
  US["\n"] = { code: "Enter", shift: false, key: "Enter" };

  const KEYCODES = {
    Space: 32, Enter: 13, Backspace: 8, Tab: 9, Escape: 27, Delete: 46, Insert: 45,
    ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40,
    Home: 36, End: 35, PageUp: 33, PageDown: 34,
    ShiftLeft: 16, ControlLeft: 17, AltLeft: 18, MetaLeft: 91,
    Backquote: 192, Minus: 189, Equal: 187, BracketLeft: 219, BracketRight: 221,
    Backslash: 220, Semicolon: 186, Quote: 222, Comma: 188, Period: 190, Slash: 191,
  };
  const keyCode = code =>
    KEYCODES[code] ??
    (code.startsWith("Key") ? code.charCodeAt(3)
      : code.startsWith("Digit") ? code.charCodeAt(5)
      : /^F\d+$/.test(code) ? 111 + Number(code.slice(1)) : 0);

  const NAMED = new Set(["Enter", "Backspace", "Tab", "Escape", "Delete", "Insert",
    "ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);
  const isNamed = e => NAMED.has(e.code) || /^F\d+$/.test(e.code);
  const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "AltGraph", "Meta", "CapsLock"]);

  // ---- Stato (sincronizzato tra i frame della scheda) ----
  const state = { enabled: false, delay: 80 };
  let panel = null; // solo frame principale
  let queue = [];
  let running = false;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const broadcast = payload => browser.runtime.sendMessage({ type: "broadcast", payload }).catch(() => {});

  const frameId = Math.random().toString(36).slice(2);
  let activeFrame = null; // frame dove l'utente ha cliccato per ultimo (in tutta la scheda)
  let lastEl = null;      // ultimo elemento cliccato/focalizzato in questo frame

  function focusedElement() {
    let el = document.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
    return el;
  }
  const isBody = el => !el || el === document.body || el === document.documentElement;
  // Elemento a cui inviare i tasti, o null se spetta a un altro frame.
  function target() {
    if (!document.hasFocus()) return null;
    const el = focusedElement();
    if (el && el.tagName === "IFRAME") return null;
    if (!isBody(el)) return el;
    if (lastEl && lastEl.isConnected && !isBody(lastEl)) return lastEl;
    return document.querySelector("canvas") || document.body || document.documentElement;
  }
  // Target per l'invio dal pannello: il punto dove l'utente ha cliccato per ultimo.
  function panelTarget() {
    if (activeFrame !== frameId) return null;
    if (lastEl && lastEl.isConnected) return lastEl;
    return document.querySelector("canvas") || document.body || document.documentElement;
  }
  const report = text => broadcast({ type: "status", text });

  function remember(e) {
    if (!e.isTrusted || inPanel(e)) return;
    const el = e.composedPath()[0];
    if (el && el.nodeType === 1) lastEl = el;
    activeFrame = frameId;
    broadcast({ type: "active", id: frameId });
  }
  window.addEventListener("mousedown", remember, true);
  window.addEventListener("focusin", remember, true);

  // ---- Emissione eventi ----
  function fire(el, type, key, code, m) {
    const init = {
      key, code, keyCode: keyCode(code), charCode: type === "keypress" ? key.charCodeAt(0) : 0,
      shiftKey: !!m.shift, ctrlKey: !!m.ctrl, altKey: !!m.alt, metaKey: !!m.meta,
      bubbles: true, cancelable: true, composed: true,
    };
    // Crea l'evento nel contesto della pagina, così i suoi script lo leggono come uno nativo.
    try {
      const page = window.wrappedJSObject;
      const ev = new page.KeyboardEvent(type, cloneInto(init, page));
      return (el.wrappedJSObject || el).dispatchEvent(ev);
    } catch (e) {
      return el.dispatchEvent(new KeyboardEvent(type, init));
    }
  }

  // Campi di testo normali: gli eventi sintetici non scrivono, quindi inseriamo il testo noi.
  const TEXT_TYPES = new Set(["text", "search", "url", "tel", "email", "password", "number", ""]);
  function isEditable(el) {
    return el.isContentEditable || el.tagName === "TEXTAREA" ||
      (el.tagName === "INPUT" && TEXT_TYPES.has((el.type || "").toLowerCase()));
  }
  function applyToField(el, item) {
    if (item.ctrl || item.alt || item.meta) return;
    if (document.activeElement !== el && !(el.getRootNode && el.getRootNode().activeElement === el)) el.focus({ preventScroll: true });
    if (item.key.length === 1) document.execCommand("insertText", false, item.key);
    else if (item.key === "Backspace") document.execCommand("delete");
    else if (item.key === "Delete") document.execCommand("forwardDelete");
    else if (item.key === "Enter") {
      if (el.tagName === "TEXTAREA") document.execCommand("insertText", false, "\n");
      else if (el.isContentEditable) document.execCommand("insertParagraph");
      else if (el.form) el.form.requestSubmit ? el.form.requestSubmit() : el.form.submit();
    } else if (item.key === "Tab") document.execCommand("insertText", false, "\t");
  }

  async function press(item) {
    const el = item.el.isConnected ? item.el : (target() || item.el);
    const half = state.delay / 2;
    const mods = [["shift", "Shift", "ShiftLeft"], ["ctrl", "Control", "ControlLeft"],
                  ["alt", "Alt", "AltLeft"], ["meta", "Meta", "MetaLeft"]].filter(([f]) => item[f]);
    const m = { shift: item.shift, ctrl: item.ctrl, alt: item.alt, meta: item.meta };
    for (const [, k, c] of mods) { fire(el, "keydown", k, c, m); await sleep(half); }
    let allowed = fire(el, "keydown", item.key, item.code, m);
    if (item.key.length === 1 && !item.ctrl && !item.alt && !item.meta) allowed = fire(el, "keypress", item.key, item.code, m) && allowed;
    if (allowed && isEditable(el) && item.key !== "Tab") applyToField(el, item);
    await sleep(half);
    fire(el, "keyup", item.key, item.code, m);
    for (const [, k, c] of mods.reverse()) { await sleep(half); fire(el, "keyup", k, c, {}); }
    await sleep(state.delay);
  }

  async function run() {
    if (running) return;
    running = true;
    while (queue.length) await press(queue.shift());
    running = false;
  }
  function enqueue(item) {
    queue.push(item);
    if (state.enabled || item.fromPanel) report("Ultimo: " + (item.key.length === 1 ? item.key : item.code));
    run();
  }

  function enqueueText(text, el) {
    for (const ch of text.replace(/\r\n/g, "\n")) {
      const m = US[ch];
      if (m) enqueue({ el, key: m.key || ch, code: m.code, shift: m.shift }); // fuori dal layout US: saltato
    }
  }

  // ---- Cattura della tastiera fisica ----
  function inPanel(e) { return panel && e.composedPath().includes(panel.host); }

  function onKeyEvent(e) {
    if (!state.enabled || !e.isTrusted || inPanel(e)) return;
    const el = target();
    if (!el) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type !== "keydown" || MODIFIER_KEYS.has(e.key)) return;

    const altGr = e.getModifierState("AltGraph");
    const ctrl = e.ctrlKey && !altGr, meta = e.metaKey;
    if (ctrl && e.code === "KeyV" && !e.shiftKey) {
      navigator.clipboard.readText().then(t => enqueueText(t, el)).catch(() => setStatus("Incolla negato"));
      return;
    }
    if (isNamed(e)) {
      enqueue({ el, key: e.key, code: e.code, shift: e.shiftKey, ctrl, alt: e.altKey && !altGr, meta });
    } else if ((ctrl || meta) && US[e.key.toLowerCase()]) {
      const m = US[e.key.toLowerCase()];
      enqueue({ el, key: e.key.toLowerCase(), code: m.code, shift: e.shiftKey, ctrl, meta });
    } else if (e.key.length === 1) {
      enqueueText(e.key, el);
    }
  }
  for (const t of ["keydown", "keyup", "keypress"]) window.addEventListener(t, onKeyEvent, true);

  window.addEventListener("paste", e => {
    if (!state.enabled || !e.isTrusted || inPanel(e)) return;
    const el = target();
    if (!el) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    enqueueText(e.clipboardData.getData("text"), el);
  }, true);

  // ---- Messaggi ----
  browser.runtime.onMessage.addListener(msg => {
    switch (msg.type) {
      case "toggle": if (window === window.top) togglePanel(); break;
      case "state":
        state.enabled = msg.enabled; state.delay = msg.delay;
        if (!state.enabled) queue = [];
        refresh();
        break;
      case "stop": queue = []; break;
      case "active": activeFrame = msg.id; break;
      case "status": setStatus(msg.text); break;
      case "sendText": {
        const el = panelTarget();
        if (el) { enqueueText(msg.text, el); report("Invio di " + msg.text.length + " caratteri..."); }
        break;
      }
      case "cmd": { const el = panelTarget(); if (el) enqueue({ el, key: msg.name, code: msg.name, fromPanel: true }); break; }
      case "hello": if (window === window.top) pushState(); break;
    }
  });
  const pushState = () => broadcast({ type: "state", enabled: state.enabled, delay: state.delay });
  if (window !== window.top) broadcast({ type: "hello" });

  // ---- Pannello (solo frame principale) ----
  function setStatus(t) { if (panel) panel.status.textContent = t; }
  function refresh() {
    if (!panel) return;
    panel.cap.textContent = "Cattura: " + (state.enabled ? "ON" : "OFF");
    panel.cap.className = state.enabled ? "on" : "";
    panel.delay.textContent = state.delay + " ms";
    panel.status.textContent = state.enabled ? "Scrivi dove hai il focus" : "Disattivata";
  }

  function togglePanel() {
    if (!panel) buildPanel();
    else panel.host.style.display = panel.host.style.display === "none" ? "" : "none";
  }

  function buildPanel() {
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;top:12px;right:12px;z-index:2147483647;";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        .box{font:12px sans-serif;background:#222;color:#eee;border-radius:6px;width:190px;box-shadow:0 2px 10px #0008}
        .hd{cursor:move;padding:5px 8px;background:#444;border-radius:6px 6px 0 0;display:flex;justify-content:space-between}
        .bd{padding:8px;display:flex;flex-direction:column;gap:6px}
        .r{display:flex;gap:4px;align-items:center}
        button{flex:1;padding:4px;cursor:pointer}
        button.on{background:#2e8b3d;color:#fff}
        #st{color:#aaa;min-height:1.2em}
        textarea{width:100%;box-sizing:border-box;font:12px monospace;resize:vertical}
        #d{flex:2;text-align:center}
      </style>
      <div class="box">
        <div class="hd" id="hd"><span>US Keyboard</span><span id="x" style="cursor:pointer">✕</span></div>
        <div class="bd">
          <textarea id="tx" rows="3" placeholder="Scrivi o incolla qui, poi Invia"></textarea>
          <button id="send">Invia testo</button>
          <button id="cap">Cattura: OFF</button>
          <div class="r"><button id="dm">−</button><span id="d">80 ms</span><button id="dp">+</button></div>
          <div class="r"><button id="en">Invio ⏎</button><button id="bk">Cancella ⌫</button></div>
          <button id="stop">Stop coda</button>
          <div id="st"></div>
        </div>
      </div>`;
    const $ = id => root.getElementById(id);
    // Evita che i click sul pannello tolgano il focus alla pagina.
    root.addEventListener("mousedown", e => { if (e.composedPath()[0].tagName !== "TEXTAREA") e.preventDefault(); });
    // I tasti digitati nel pannello non devono arrivare alla pagina.
    for (const t of ["keydown", "keyup", "keypress"]) host.addEventListener(t, e => e.stopPropagation());
    panel = { host, cap: $("cap"), delay: $("d"), status: $("st") };

    $("send").onclick = () => broadcast({ type: "sendText", text: $("tx").value });
    $("cap").onclick =() => { state.enabled = !state.enabled; pushState(); };
    $("dm").onclick = () => { state.delay = Math.max(20, state.delay - 20); pushState(); };
    $("dp").onclick = () => { state.delay = Math.min(1000, state.delay + 20); pushState(); };
    $("en").onclick = () => broadcast({ type: "cmd", name: "Enter" });
    $("bk").onclick = () => broadcast({ type: "cmd", name: "Backspace" });
    $("stop").onclick = () => broadcast({ type: "stop" });
    $("x").onclick = () => { state.enabled = false; pushState(); host.style.display = "none"; };

    // Trascinamento
    $("hd").addEventListener("pointerdown", e => {
      const r = host.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      const move = ev => { host.style.left = ev.clientX - dx + "px"; host.style.top = ev.clientY - dy + "px"; host.style.right = "auto"; };
      const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });

    document.documentElement.appendChild(host);
    refresh();
  }
}
