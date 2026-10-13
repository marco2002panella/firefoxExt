const $ = id => document.getElementById(id);
const status = msg => { $("status").textContent = msg; };

$("delay").value = localStorage.getItem("delay") || 80;
$("delay").addEventListener("change", () => localStorage.setItem("delay", $("delay").value));

async function send(msg) {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  try {
    await browser.tabs.sendMessage(tabs[0].id, { ...msg, delay: Number($("delay").value) || 80 });
  } catch (e) {
    status("Errore: ricarica la pagina del VNC");
  }
}

$("send").onclick = () => { status("Invio in corso..."); send({ type: "text", text: $("text").value }); };
$("stop").onclick = () => { status("Fermato"); send({ type: "stop" }); };
$("enter").onclick = () => send({ type: "key", name: "Enter" });
$("bksp").onclick = () => send({ type: "key", name: "Backspace" });
