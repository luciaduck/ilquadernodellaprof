---
title: Portfolio
classe: lampone
---

<div class="box-nota">
  <!-- Testata con Titolo e Switcher -->
  <header style="display: flex; justify-content: space-between; align-items: center;">
    <span><strong>Info</strong></span>
    <button class="btn-torna" id="lang-toggle" type="button" aria-label="Passa alla versione in inglese">
      IT &middot; EN
    </button>
  </header>

  <!-- Contenuto Italiano -->
  <div id="content-it" lang="it">
    <p>Da questa pagina è possibile accedere facilmente ad alcuni dei miei contenuti didattici.</p>
    <p>Li ho divisi per materia e ho segnato tra parentesi <em>"book"</em> se la pagina può essere visualizzata in <strong>modalità libro</strong> e <em>"act"</em> se si tratta di un'<strong>attività interattiva</strong>.</p>
  </div>

  <!-- Contenuto Inglese (Nascosto di default) -->
  <div id="content-en" lang="en" hidden>
    <p>The contents listed below serve as examples of my teaching materials and demonstrate how I built the frontend of this site.</p>
    <p>You can use the e-reader overlay on pages tagged with <em>book</em> and interact with the backend on pages tagged with <em>act</em>. A frontend sample of a password-protected page is available <a href="/classe/benvenuta">here</a>.</p>
    <p>Feel free to reach out on <a href="https://github.com/luciaduck/">GitHub</a> for more dev projects, including my AGPL-licensed Go backend. See the <a href="/LICENSE">license</a> for details.</p>
  </div>
</div>

## Italiano

- [Come preparare un attivatore "tutto in una pagina"](/pag/lettura/tuttoinunapagina) (Reading Workshop)
- [La prova della staccabilità](/pag/lingua/staccabile): come riconoscere un'espansione ai margini
- [Bignami valenziale-generativo](/pag/lingua/bignami): per fare il punto sull'educazione linguistica
- [Il pacco crudele](/pag/lingua/ruolosemantico): a Giada non piace il vetro e non è lei il soggetto! Una lezione sui ruoli semantici
  - [Un'attività sul ruolo semantico dell'agente](/act/semantica-agente-1) **(act)**

## Storia e Geografia

- Uniti nella diversità: si può? (Materiali propedeutici a un debate interdisciplinare)
  - [Nazioni e imperi](/pag/storia/nazioniimperi) **(book)**
  - [In Varietate Concordia](/pag/geografia/varietate2)
  - [La Romania](/pag/geografia/romania)

## Educazione civica

- [Come funzionano le AI?](/pag/lingua/ai/llm)
Quattro contenuti pensati per il *jigsaw* in preparazione di un *debate*.

<script>
  const btn = document.getElementById('lang-toggle');
  const it = document.getElementById('content-it');
  const en = document.getElementById('content-en');

  btn.addEventListener('click', () => {
    const isIT = en.hasAttribute('hidden');

    it.toggleAttribute('hidden', isIT);
    en.toggleAttribute('hidden', !isIT);

    btn.setAttribute('aria-label', isIT ? 'Switch to Italian version' : 'Passa alla versione in inglese');
  });
</script>
