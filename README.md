# US Keyboard Sender

Estensione Firefox che converte la tastiera IT in tasti con layout US su qualsiasi pagina web, con un pannello flottante sempre visibile (modalità cattura e inserimento testo nei campi).

## Utilizzo in debugging su Firefox

L'estensione non richiede build: si carica direttamente dai sorgenti come *temporary add-on*.

### Metodo 1: about:debugging

1. Apri Firefox e vai su `about:debugging#/runtime/this-firefox`.
2. Clicca su **Carica componente aggiuntivo temporaneo…** (*Load Temporary Add-on…*).
3. Seleziona il file `manifest.json` di questa cartella.
4. L'icona dell'estensione compare nella toolbar: cliccala per mostrare/nascondere il pannello.

L'estensione resta caricata fino alla chiusura di Firefox. Dopo ogni modifica al codice clicca **Ricarica** (*Reload*) accanto all'estensione in `about:debugging`; le pagine già aperte vanno ricaricate per rieseguire `content.js`.

### Metodo 2: web-ext (live reload)

```bash
npm install --global web-ext
cd firefoxExt
web-ext run            # avvia un Firefox pulito con l'estensione e ricarica automatica
web-ext lint           # controlla il manifest e il codice
```

Opzioni utili: `--firefox=/percorso/firefox`, `--start-url https://example.com`, `--browser-console`.

### Ispezionare e leggere i log

- **Background script** (`background.js`): in `about:debugging` clicca **Ispeziona** accanto all'estensione per aprire la console/debugger dedicati.
- **Content script** (`content.js`): apri gli strumenti sviluppatore della pagina (`F12`), scheda **Console**; i sorgenti si trovano nel debugger sotto la voce dell'estensione.
- **Browser Console** globale: `Ctrl+Shift+J`.

### Problemi comuni

- Il pannello non appare: le pagine interne (`about:*`, `addons.mozilla.org`) non permettono content script; prova su un sito normale e ricarica la pagina.
- Modifiche non applicate: premi **Ricarica** in `about:debugging` e poi aggiorna la scheda.
- Il caricamento temporaneo viene perso al riavvio di Firefox: ripeti il passaggio 2.
