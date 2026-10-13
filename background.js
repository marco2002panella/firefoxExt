// Click sull'icona: mostra/nasconde il pannello nel frame principale.
async function inject(tabId) {
  // Prima il frame principale, poi gli altri uno per uno (quelli senza permesso vengono ignorati).
  await browser.tabs.executeScript(tabId, { file: "content.js", frameId: 0 });
  const frames = (await browser.webNavigation.getAllFrames({ tabId })) || [];
  for (const f of frames) {
    if (f.frameId === 0) continue;
    await browser.tabs.executeScript(tabId, { file: "content.js", frameId: f.frameId }).catch(() => {});
  }
}

browser.browserAction.onClicked.addListener(async tab => {
  try {
    await browser.tabs.sendMessage(tab.id, { type: "toggle" }, { frameId: 0 });
  } catch (e) {
    // Pagina aperta prima dell'installazione: inietta lo script ora.
    try {
      await inject(tab.id);
      await browser.tabs.sendMessage(tab.id, { type: "toggle" }, { frameId: 0 });
    } catch (err) {
      console.error("Impossibile attivare il pannello su", tab.url, err);
    }
  }
});

// Rilancia i messaggi a tutti i frame della stessa scheda.
browser.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === "broadcast" && sender.tab) {
    browser.tabs.sendMessage(sender.tab.id, msg.payload).catch(() => {});
  }
});
