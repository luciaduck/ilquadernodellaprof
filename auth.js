/* ───────────────────────────────────────────────────────────
   Pagine Protette — maschera password e resa del contenuto. 

   Protocollo (servizio stateless, nessun cookie, nessun token):
     POST /api/v1/protected { id, password } → { id, titolo, html }
     password errata → 401 · pagina inesistente → 404

   Niente vive oltre la pagina: la password sta in un campo del
   form finché il form esiste, il testo ricevuto sta nel DOM.
   Ricaricare la pagina significa ricominciare da capo — per
   progetto.

   Uso nei template: inserire questo file in extra_js nel front matter.

     <div class="post-content" id="auth-content"
          data-page-id="{{ page.fileSlug }}"
          data-classe="{{ classe }}">
       {{ content }}
       <a href="javascript:history.back()" class="btn-torna">← Torna indietro</a>
     </div>

   - data-page-id  → lo slug della pagina, stesso id dei file .md
                     nel repo dei contenuti (auth/<slug>.md);
   - data-classe   → facoltativo: melanzana, notte, lampone,
                     fiordaliso, senape… per tingere il box come
                     nel form contatti; senza, usa --green-dark.

   Lo script si attiva solo se trova #auth-content: nelle altre
   pagine non fa nulla. Il box viene inserito in testa al
   contenuto; a password giusta, il box sparisce e al suo posto
   compare il testo. Ciò che 11ty ha già messo nel content (es.
   il bottone "Torna indietro") resta dov'è.
   ─────────────────────────────────────────────────────────── */
(() => {
  "use strict";

  const container = document.getElementById("auth-content");
  if (!container) return;

  const pageId = container.dataset.pageId;
  if (!pageId) {
    console.warn("auth.js: manca data-page-id su #auth-content");
    return;
  }

  const API_URL =
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
      ? "http://localhost:3000"
      : "https://coinhier.alwaysdata.net") + "/api/v1/protected";

  const TIMEOUT_MS = 10000;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ─── Testi (modifica pure qui) ─────────────────────────── */

  const TESTI = {
    titoloBox: "pagina protetta",
    intro:
      "Questa è una pagina riservata. " +
      "Scrivi la password che ti è stata data e premi «Entra».",
    labelPassword: "Parola d'ordine",
    placeholder: "Scrivi qui la password…",
    bottone: "Entra",
    attesa: "Un attimo…",
    passwordErrata: "La password non è giusta. Controlla e riprova!",
    paginaAssente: "Questa pagina non è ancora disponibile.",
    network:
      "Non riesco a raggiungere il servizio. Controlla la connessione e riprova.",
    http: "Il servizio non risponde in questo momento. Riprova fra poco!",
    protocol: "C'è un piccolo problema col servizio. Riprova fra poco."
  };

  /* ─── Stile (gemello di .contact-inner) ─────────────────── */

  // Tinta: data-classe="melanzana" → var(--melanzana); default green-dark.
  const classe = container.dataset.classe || "";
  const accent = /^[a-z][a-z0-9-]*$/.test(classe)
    ? `var(--${classe}, var(--green-dark))`
    : "var(--green-dark)";
  container.style.setProperty("--auth-accent", accent);

  if (!document.getElementById("auth-style")) {
    const style = document.createElement("style");
    style.id = "auth-style";
    style.textContent = `
      .auth-box {
        background: color-mix(in srgb, var(--auth-accent) 12%, var(--ivory));
        border-radius: 28px;
        padding: 1rem 2rem 2rem 2rem;
        border: 3px dashed var(--auth-accent);
        max-width: 640px;
        margin: 0.5rem auto 1.5rem;
      }
      .auth-box h2 {
        font-family: 'Righteous', sans-serif;
        font-size: clamp(1.8rem, 4vw, 3rem);
        color: var(--auth-accent);
        text-align: center;
        margin-bottom: .5rem;
      }
      .auth-box > p {
        margin-bottom: 1.5rem;
        overflow-wrap: break-word;
      }
      .auth-group { margin-bottom: 1.2rem; }
      .auth-group label {
        display: block;
        font-size: .82rem;
        font-weight: 500;
        letter-spacing: .06em;
        text-transform: uppercase;
        margin-bottom: .4rem;
      }
      .auth-group input {
        width: 100%;
        padding: .85rem 1.1rem;
        border-radius: 12px;
        border: 1.5px solid var(--auth-accent);
        background: var(--ivory);
        font-family: Nunito, serif;
        font-size: .95rem;
        color: var(--text-color);
        outline: none;
        transition: border-color .2s;
      }
      .auth-group input:focus { border-color: var(--auth-accent); }
      .btn-auth {
        width: 100%;
        margin-top: .5rem;
        padding: .75rem 1.6rem;
        border-radius: 50px;
        font-size: .9rem;
        font-weight: 500;
        background: var(--auth-accent);
        color: var(--ivory);
        border: none;
        cursor: pointer;
        transition: transform .2s;
      }
      .btn-auth:hover:not(:disabled) { transform: translateY(-2px); }
      .btn-auth:disabled { opacity: .7; cursor: wait; }
      .auth-errore {
        margin-top: 1rem;
        font-size: .9rem;
        font-weight: 600;
        color: var(--robinegg, #0b5373);
        text-align: center;
        min-height: 1.2em;
      }
      .auth-testo:focus { outline: none; }
      @media (prefers-reduced-motion: reduce) {
        .btn-auth { transition: none; }
        .btn-auth:hover:not(:disabled) { transform: none; }
      }
    `;
    document.head.appendChild(style);
  }

  /* ─── Maschera d'accesso ────────────────────────────────── */

  const box = document.createElement("section");
  box.className = "auth-box";
  box.innerHTML = `
    <h2></h2>
    <p></p>
    <form class="auth-form">
      <div class="auth-group">
        <label for="auth-password"></label>
        <input type="password" id="auth-password" name="password"
               required autocomplete="current-password" />
      </div>
      <button type="submit" class="btn-auth"></button>
      <p class="auth-errore" role="alert" aria-live="assertive"></p>
    </form>
  `;
  box.querySelector("h2").textContent = TESTI.titoloBox;
  box.querySelector("p").textContent = TESTI.intro;
  box.querySelector("label").textContent = TESTI.labelPassword;

  const form = box.querySelector("form");
  const input = box.querySelector("input");
  const button = box.querySelector("button");
  const errore = box.querySelector(".auth-errore");
  input.placeholder = TESTI.placeholder;
  button.textContent = TESTI.bottone;

  container.prepend(box);
  input.focus({ preventScroll: true });

  /* ─── Dialogo con Coinhier ──────────────────────────────── */

  const mostraErrore = (msg) => {
    errore.textContent = msg;
    input.select();
    input.focus();
  };

  const mostraContenuto = (html) => {
    const testo = document.createElement("div");
    testo.className = "auth-testo";
    testo.tabIndex = -1; // per portare il focus sul contenuto appena svelato
    testo.innerHTML = html; // HTML dell'autrice, già convertito dal backend
    box.replaceWith(testo);
    testo.focus({ preventScroll: reducedMotion });
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errore.textContent = "";
    button.disabled = true;
    const etichetta = button.textContent;
    button.textContent = TESTI.attesa;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: pageId, password: input.value }),
        signal: controller.signal
      });

      let data = null;
      try { data = await res.json(); } catch { /* body non JSON: gestito sotto */ }

      if (res.status === 401) {
        mostraErrore(TESTI.passwordErrata);
        return;
      }
      if (res.status === 404) {
        mostraErrore(TESTI.paginaAssente);
        return;
      }
      if (!res.ok) {
        // Il backend scrive messaggi già a misura di studente ("troppe
        // persone collegate…"): se c'è, usiamo quello.
        mostraErrore(data && typeof data.error === "string" ? data.error : TESTI.http);
        return;
      }
      if (!data || typeof data.html !== "string") {
        mostraErrore(TESTI.protocol);
        return;
      }
      mostraContenuto(data.html);
    } catch (err) {
      mostraErrore(TESTI.network);
    } finally {
      clearTimeout(timer);
      button.disabled = false;
      button.textContent = etichetta;
    }
  });
})();
