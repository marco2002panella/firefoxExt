// Tabella US: carattere -> {code fisico, shift}
const US = {};
function add(codes, plain, shifted) {
  [...plain].forEach((c, i) => {
    US[c] = { code: codes[i], shift: false };
    if (shifted) US[shifted[i]] = { code: codes[i], shift: true };
  });
}
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
  Space: 32, Enter: 13, Backspace: 8, Tab: 9, ShiftLeft: 16,
  Backquote: 192, Minus: 189, Equal: 187, BracketLeft: 219, BracketRight: 221,
  Backslash: 220, Semicolon: 186, Quote: 222, Comma: 188, Period: 190, Slash: 191,
};
const keyCode = code =>
  KEYCODES[code] ?? (code.startsWith("Key") ? code.charCodeAt(3) : code.startsWith("Digit") ? code.charCodeAt(5) : 0);

const sleep = ms => new Promise(r => setTimeout(r, ms));
let stopped = false;

// Elemento con il focus, scendendo anche negli shadow DOM.
function focusedElement() {
  let el = document.activeElement;
  while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
  return el;
}

function target() {
  const el = focusedElement();
  if (el && el.tagName === "IFRAME") return null; // gestirà il frame figlio
  if (el && el !== document.body && el !== document.documentElement) return el;
  // Nessun focus esplicito: solo il frame principale riceve i tasti
  return window === window.top ? (document.body || document.documentElement) : null;
}

function fire(el, type, key, code, shift) {
  el.dispatchEvent(new KeyboardEvent(type, {
    key, code, keyCode: keyCode(code), charCode: type === "keypress" ? key.charCodeAt(0) : 0,
    shiftKey: shift, bubbles: true, cancelable: true, composed: true,
  }));
}

async function press(el, key, code, shift, delay) {
  if (shift) { fire(el, "keydown", "Shift", "ShiftLeft", true); await sleep(delay / 2); }
  fire(el, "keydown", key, code, shift);
  if (key.length === 1) fire(el, "keypress", key, code, shift);
  await sleep(delay / 2);
  fire(el, "keyup", key, code, shift);
  if (shift) { await sleep(delay / 2); fire(el, "keyup", "Shift", "ShiftLeft", false); }
  await sleep(delay);
}

browser.runtime.onMessage.addListener(async msg => {
  if (msg.type === "stop") { stopped = true; return; }
  const el = target();
  if (!el) return;
  stopped = false;
  if (msg.type === "key") {
    await press(el, msg.name, msg.name, false, msg.delay);
  } else if (msg.type === "text") {
    for (const ch of msg.text.replace(/\r\n/g, "\n")) {
      if (stopped) break;
      const m = US[ch];
      if (!m) continue; // carattere non presente nel layout US
      await press(el, m.key || ch, m.code, m.shift, msg.delay);
    }
  }
});
