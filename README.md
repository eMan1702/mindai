# MindAI — mappe mentali nel browser con IA per nodo

App originale (non derivata da SimpleMind) che apre e salva i file **.smmx**.
Funziona in qualsiasi browser moderno: Windows, Ubuntu, macOS, tablet e smartphone.

## Come si usa
- Apri `MindAI.html` nel browser (doppio clic). È un unico file, senza installazione.
- **☰ › Apri file .smmx** (o trascina il file nella finestra) per aprire le tue mappe.
- **💾 / Ctrl+S** salva il file .smmx. Su Chrome/Edge sovrascrive lo stesso file; sugli altri browser lo scarica.
- Ogni modifica viene salvata anche nel browser (☰ › Mappe salvate nel browser).

## Pannelli in alto a destra
Outline · Nota · Icona · Foglio di stile · Stile · Presentazione · **✨ IA**

## Pannello IA
1. ☰ › **Impostazioni IA**: inserisci la chiave di Claude e/o OpenAI, oppure l'indirizzo di Ollama / LM Studio.
   Le chiavi restano solo in quel browser.
2. Seleziona un nodo, apri ✨ IA, scegli l'IA per quel nodo (o lascia "Eredita") e scrivi la richiesta.
3. La risposta si espande in nuovi nodi sotto quel nodo. Le domande fatte su quel nodo o sui suoi sotto-nodi
   restano nel ramo: l'IA vede la conversazione dei nodi superiori e dei sotto-nodi.
4. Con "Usa come contesto le conversazioni degli altri rami" l'IA vede anche le domande e risposte degli altri rami,
   per collegarle al tema centrale.

### Ollama dal browser
Ollama deve accettare richieste dal browser: imposta la variabile `OLLAMA_ORIGINS=*` e riavvialo.
- Windows: Impostazioni › Variabili d'ambiente › nuova variabile utente `OLLAMA_ORIGINS` = `*`.
- Ubuntu: `sudo systemctl edit ollama` e aggiungi `[Service]` + `Environment="OLLAMA_ORIGINS=*"`, poi `sudo systemctl restart ollama`.
- Da tablet/telefono: avvia Ollama con `OLLAMA_HOST=0.0.0.0` e usa l'indirizzo del PC (es. `http://192.168.1.10:11434`).

## Compatibilità con SimpleMind
- Testi, note, posizioni, colori del ramo (palette), collegamenti e immagini già presenti nel file vengono mantenuti.
- Stili personalizzati, icone emoji e conversazioni IA sono salvati in `document/mindai.json` dentro lo stesso .smmx:
  SimpleMind vede i nodi creati dall'IA come nodi normali.

## Scorciatoie
Tab figlio · Invio fratello · F2 o doppio clic modifica · Canc elimina · Spazio comprimi · Ctrl+I IA · Ctrl+Z/Y annulla/ripeti

## Sviluppo
Sorgenti in `src/`. `python3 build.py` crea `dist/index.html` (file unico).

## Pubblicazione
`docker-compose.yml` avvia nginx dietro a traefik sulla VPS: all'avvio scarica `index.html` da questo repository.
Per aggiornare il sito: ricostruisci con `python3 build.py`, copia `dist/index.html` in `index.html`, fai push e riavvia il progetto Docker "mindai".
