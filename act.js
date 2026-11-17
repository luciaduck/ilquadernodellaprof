/* ───────────────────────────────────────────────────────────
   Attività — una domanda per volta.

   Protocollo (servizio stateless, nessun cookie):
     carica     POST { id }                       → { domande: [...] }
     risponde   POST { id, questionId, optionId } → { status, correzione? }

   Ogni richiesta porta con sé l'id: il servizio non conserva nulla
   fra una chiamata e l'altra. Le soluzioni restano di là — il client
   sa solo se una risposta è "next" o "stop", mai quale sarebbe stata
   quella giusta.

   L'avanzamento è l'unica cosa che vive qui, in localStorage.
   ─────────────────────────────────────────────────────────── */
(async () => {
  const container = document.getElementById("act-content");
  if (!container) return;

  const API_URL =
    window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
      ? "http://localhost:3000"
      : "https://coinhier.alwaysdata.net/";

  const pageId = container.dataset.pageId;
  const STORAGE_KEY = `act_data_${pageId}`;
  const TIMEOUT_MS = 10000;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ─── Trasporto ────────────────────────────────────────────
     Un solo punto in cui si parla con Coinhier. Gli errori sono
     distinti per tipo: allo studente serve sapere se è colpa
     della connessione (riprova) o del servizio (torna dopo). */

  class ActError extends Error {
    constructor(kind, message) {
      super(message);
      this.name = "ActError";
      this.kind = kind; // "network" | "http" | "protocol"
    }
  }

  const MESSAGES = {
    network: "Non riesco a raggiungere il servizio che mostra l'attività. Controlla la connessione e riprova.",
    http: "L'attività c'è ma è timida: il servizio non risponde. Ci sarà di nuovo fra poco. Riprova!",
    protocol: "C'è un piccolo problema col servizio. Riprova fra poco."
  };

  const request = async (payload, { retries = 1, keepalive = false } = {}) => {
    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        const res = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
          keepalive
        });

        if (!res.ok) throw new ActError("http", `HTTP ${res.status}`);

        let data;
        try {
          data = await res.json();
        } catch (e) {
          throw new ActError("protocol", "Risposta non leggibile");
        }

        if (!data || typeof data !== "object") throw new ActError("protocol", "Risposta vuota");
        // Un errore applicativo può arrivare con HTTP 200: va trattato
        // come errore, non come contenuto da mostrare.
        if (data.error) throw new ActError("protocol", String(data.error));

        return data;
      } catch (err) {
        const wrapped = err instanceof ActError ? err : new ActError("network", err.message);
        // Rete e timeout meritano un secondo tentativo; un servizio che
        // risponde male non cambia idea se glielo si richiede subito.
        if (wrapped.kind === "network" && attempt < retries) continue;
        throw wrapped;
      } finally {
        clearTimeout(timer);
      }
    }
  };

  /* ─── Normalizzazione ──────────────────────────────────────
     Tutto ciò che arriva da coinhier passa di qui e ne esce nella
     forma che il resto del codice si aspetta. Se domani i nomi
     dei campi cambiano, si cambiano in questo blocco e basta. */

  const readActivity = (raw) => {
    const list = Array.isArray(raw.domande) ? raw.domande : [];

    return list.map((q, i) => ({
      key: String(q.id ?? `q-${i}`),   // identità locale (storage, DOM)
      ref: q.id ?? i,                  // identità per coinhier
      title: q.titolo || q.testo || `Domanda ${i + 1}`,
      options: (Array.isArray(q.opzioni) ? q.opzioni : []).map((o, j) => ({
        id: o.id ?? `opt-${i}-${j}`,
        text: o.testo || ""
      }))
    }));
  };

  const readVerdict = (raw) => {
    const status = String(raw.status || "").toLowerCase();
    // Uno status che non riconosco è un guasto, non una risposta sbagliata.
    if (status !== "next" && status !== "stop") {
      throw new ActError("protocol", `Verdetto sconosciuto: ${raw.status}`);
    }
    return {
      status,
      correzione: status === "stop" ? raw.correzione || null : null
    };
  };

  /* ─── Avanzamento ──────────────────────────────────────────
     Unico stato locale. Il servizio non lo conosce e non gli serve. */

  const store = {
    read() {
      try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
        return parsed && typeof parsed.answers === "object" ? parsed : { answers: {} };
      } catch (e) {
        return { answers: {} };
      }
    },
    write(state) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (e) {
        // Storage non disponibile: l'attività prosegue, si perde
        // solo la possibilità di riprenderla più tardi.
      }
    },
    clear() {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {}
    }
  };

  // Risposte a domande che non esistono più falserebbero conteggi
  // e riepilogo: si buttano all'avvio.
  const prune = (state, questions) => {
    const valid = new Set(questions.map((q) => q.key));
    let changed = false;
    Object.keys(state.answers).forEach((key) => {
      if (!valid.has(key)) {
        delete state.answers[key];
        changed = true;
      }
    });
    if (changed) store.write(state);
  };

  /* ─── Utility DOM ──────────────────────────────────────────── */

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };

  const button = (className, text) => {
    const b = el("button", className, text);
    b.type = "button";
    return b;
  };

  const bring = (node) => {
    node.focus({ preventScroll: true });
    node.scrollIntoView({ block: "nearest", behavior: reducedMotion ? "auto" : "smooth" });
  };

  const showLoadError = (err) => {
    console.error("Attività non caricata:", err);
    container.innerHTML = "";
    const box = el("div", "act-error-box");
    box.appendChild(el("p", null, MESSAGES[err.kind] || MESSAGES.protocol));
    const again = button("act-send", "Riprova");
    again.addEventListener("click", () => location.reload());
    box.appendChild(again);
    container.appendChild(box);
  };

  /* ─── Avvio ────────────────────────────────────────────────── */

  let questions;
  try {
    questions = readActivity(await request({ id: pageId }));
  } catch (err) {
    showLoadError(err);
    return;
  }

  container.innerHTML = "";

  if (!questions.length) {
    container.appendChild(el("p", "act-empty", "Questa attività non contiene ancora domande."));
    return;
  }

  const total = questions.length;
  const state = store.read();
  prune(state, questions);

  const answerOf = (q) => state.answers[q.key];
  const answered = () => questions.filter(answerOf).length;
  const isComplete = () => answered() === total;

  // Prima domanda ancora aperta a partire da un punto, girando in tondo.
  const nextOpen = (from = -1) => {
    for (let i = from + 1; i < total; i++) if (!answerOf(questions[i])) return i;
    for (let i = 0; i <= from && i < total; i++) if (!answerOf(questions[i])) return i;
    return -1;
  };

  /* ─── Statistica anonima ───────────────────────────────────
     A riepilogo aperto parte un pacchetto con i numeri delle
     domande indovinate e di quelle sbagliate. Nessun identificativo
     di chi risponde: di là i numeri finiscono in contatori separati
     e non collegati fra loro. Se non parte, non se ne accorge
     nessuno e non fa vedere errori. */

  const report = () => {
    if (state.reported) return;

    // Estrae gli ID reali (q.ref) di tutte le domande con verdetto 'stop'
    const sbagliate = questions
      .filter((q) => answerOf(q)?.status === "stop")
      .map((q) => q.ref);

    // Se lo studente non ha risposto ad alcuna domanda, non invia nulla
    if (!questions.some(answerOf)) return;

    state.reported = true;
    store.write(state);

    // Invia solo l'elenco degli esercizi sbagliati
    request({ id: pageId, esito: { sbagliate } }, { retries: 0, keepalive: true })
      .catch((err) => console.debug("Statistica non inviata:", err.message));
  };


  /* ─── Riepilogo ────────────────────────────────────────────── */

  const renderFinal = ({ focus = true } = {}) => {
    container.innerHTML = "";

    const wrong = questions.filter((q) => answerOf(q)?.status === "stop");
    const right = total - wrong.length;

    const final = el("div", "act-final");
    final.tabIndex = -1;

    final.appendChild(el("h2", "act-final__title", "Hai concluso l'attività!"));

    const score = el("p", "act-score");
    const value = el("span", "act-score__value");
    value.appendChild(el("strong", "act-score__right", String(right)));
    value.appendChild(el("span", "act-score__sep", "/"));
    value.appendChild(el("span", "act-score__total", String(total)));
    score.appendChild(value);
    score.appendChild(el("span", "act-score__label", right === 1 ? "risposta corretta" : "risposte corrette"));
    final.appendChild(score);

    final.appendChild(
      el(
        "p",
        "act-final__msg",
        wrong.length === 0
          ? "Non hai sbagliato nemmeno un esercizio! 🎉"
          : "Sbagliare è il modo migliore per imparare. Qui sotto trovi tutte le correzioni che hai ricevuto: leggile per ripassare. Se vuoi riprovare, più sotto c'è un simpatico bottone che ti aspetta!"
      )
    );

    if (wrong.length) {
      const corrections = el("section", "act-corrections");
      corrections.setAttribute("aria-labelledby", "act-corrections-title");

      const title = el("h3", "act-corrections__title", "Le mie correzioni");
      title.id = "act-corrections-title";
      corrections.appendChild(title);

      questions.forEach((q, index) => {
        const ans = answerOf(q);
        if (!ans || ans.status !== "stop") return;

        const item = el("article", "act-stop act-correction");

        const head = el("h4", "act-correction__title");
        head.appendChild(el("span", "act-correction__num", String(index + 1)));
        head.appendChild(el("span", "act-correction__text", q.title));
        item.appendChild(head);

        const body = el("div", "act-correction__body");
        body.innerHTML = ans.correzione || "Correzione non disponibile.";
        item.appendChild(body);

        corrections.appendChild(item);
      });

      final.appendChild(corrections);
    }

    const actions = el("div", "act-final__actions");

    const retry = button("act-send", "Riprova l'attività");
    retry.addEventListener("click", () => {
      store.clear();
      state.answers = {};
      state.reported = false; // il tentativo nuovo va contato di nuovo
      buildQuiz(0, { focus: true });
    });

    const review = button("act-ghost", "Torna alle domande");
    review.addEventListener("click", () => buildQuiz(0, { focus: true }));

    actions.appendChild(retry);
    actions.appendChild(review);
    final.appendChild(actions);

    container.appendChild(final);
    if (focus) bring(final);

    report();
  };

  /* ─── Attività ─────────────────────────────────────────────── */

  const buildQuiz = (startIndex = 0, { focus = false } = {}) => {
    container.innerHTML = "";

    const nav = el("nav", "act-quest");
    nav.setAttribute("aria-label", "Domande dell'attività");

    const track = el("div", "act-track");
    const navButtons = [];
    const slides = [];
    const bodies = [];

    let current = startIndex;

    const statusOf = (q) => {
      const ans = answerOf(q);
      if (!ans) return "todo";
      return ans.status === "next" ? "correct" : "wrong";
    };

    const statusWords = {
      todo: "senza risposta",
      correct: "risposta corretta",
      wrong: "risposta sbagliata"
    };
    const badgeChar = { todo: "", correct: "✓", wrong: "✕" };

    const refreshNav = () => {
      questions.forEach((q, i) => {
        const status = statusOf(q);
        const btn = navButtons[i];
        btn.dataset.status = status;
        btn.setAttribute("aria-label", `Domanda ${i + 1} di ${total}, ${statusWords[status]}`);
        const badge = btn.querySelector(".act-quest__badge");
        badge.textContent = badgeChar[status];
        badge.hidden = status === "todo";
      });
    };

    const setCurrent = (index, { focus: doFocus = true } = {}) => {
      current = index;
      slides.forEach((s, i) => {
        s.hidden = i !== index;
      });
      navButtons.forEach((b, i) => {
        if (i === index) b.setAttribute("aria-current", "true");
        else b.removeAttribute("aria-current");
      });
      if (doFocus) bring(slides[index]);
    };

    questions.forEach((q, index) => {
      const btn = button("act-quest__btn");
      btn.appendChild(el("span", "act-quest__num", String(index + 1)));
      const badge = el("span", "act-quest__badge");
      badge.setAttribute("aria-hidden", "true");
      btn.appendChild(badge);
      btn.addEventListener("click", () => setCurrent(index));
      navButtons.push(btn);
      nav.appendChild(btn);
    });

    questions.forEach((q, index) => {
      const slide = el("section", "act-slide");
      slide.tabIndex = -1;
      slide.hidden = true;
      slide.setAttribute("aria-roledescription", "domanda");
      slide.setAttribute("aria-label", `Domanda ${index + 1} di ${total}`);

      const head = el("div", "act-question");
      const counter = el("p", "act-question__counter", `Domanda ${index + 1} di ${total}`);
      counter.setAttribute("aria-hidden", "true"); // già nell'aria-label della slide
      const h2 = el("h2", "act-question__title", q.title);
      h2.id = `act-q${index}-title`;
      head.appendChild(counter);
      head.appendChild(h2);

      const body = el("div", "act-body");
      bodies[index] = body;

      slide.appendChild(head);
      slide.appendChild(body);
      track.appendChild(slide);
      slides.push(slide);
    });

    const buildContinue = (index) => {
      const target = nextOpen(index);
      const btn = button("act-send act-continue", target === -1 ? "Vai al riepilogo" : "Continua!");
      btn.addEventListener("click", () => {
        if (target === -1) renderFinal();
        else setCurrent(target);
      });
      return btn;
    };

    const renderBody = (index, { focusFeedback = false } = {}) => {
      const q = questions[index];
      const body = bodies[index];
      body.innerHTML = "";

      const ans = answerOf(q);

      if (ans) {
        // Il riquadro riceve il focus: il contenuto viene letto una volta
        // sola (niente aria-live, che raddoppierebbe l'annuncio).
        const feedback = el("div", "act-feedback");
        feedback.tabIndex = -1;

        if (ans.status === "next") {
          const box = el("div", "act-next");
          box.appendChild(el("p", "act-reaction__title", "Risposta corretta!"));
          feedback.appendChild(box);
        } else {
          const box = el("div", "act-stop");
          box.appendChild(el("p", "act-reaction__title", "Risposta sbagliata: ti spiego perché."));
          const text = el("div", "act-reaction__body");
          text.innerHTML = ans.correzione || "";
          box.appendChild(text);
          feedback.appendChild(box);
        }

        feedback.appendChild(buildContinue(index));
        body.appendChild(feedback);

        // Il focus si sposta solo se la domanda è ancora quella aperta:
        // se nel frattempo l'utente è andato altrove, non lo si tira
        // indietro dentro una slide nascosta.
        if (focusFeedback && current === index) bring(feedback);
        return;
      }

      if (!q.options.length) {
        body.appendChild(el("p", "act-empty", "Questa domanda non ha risposte."));
        return;
      }

      const group = el("div", "act-options");
      group.setAttribute("role", "radiogroup");
      group.setAttribute("aria-labelledby", `act-q${index}-title`);

      const options = [];
      let selectedId = null;
      let sending = false;

      const select = (i, { focus: doFocus = false } = {}) => {
        if (sending) return;
        selectedId = q.options[i].id;
        options.forEach((b, j) => {
          const on = j === i;
          b.setAttribute("aria-checked", String(on));
          b.classList.toggle("is-selected", on);
          b.tabIndex = on ? 0 : -1;
        });
        sendBtn.disabled = false;
        if (doFocus) options[i].focus();
      };

      const move = (from, step) => {
        select((from + step + options.length) % options.length, { focus: true });
      };

      q.options.forEach((opt, i) => {
        const b = button("act-try", opt.text);
        b.setAttribute("role", "radio");
        b.setAttribute("aria-checked", "false");
        b.tabIndex = i === 0 ? 0 : -1;

        b.addEventListener("click", () => select(i));
        b.addEventListener("keydown", (ev) => {
          switch (ev.key) {
            case "ArrowDown":
            case "ArrowRight": ev.preventDefault(); move(i, 1); break;
            case "ArrowUp":
            case "ArrowLeft": ev.preventDefault(); move(i, -1); break;
            case "Home": ev.preventDefault(); select(0, { focus: true }); break;
            case "End": ev.preventDefault(); select(options.length - 1, { focus: true }); break;
          }
        });

        options.push(b);
        group.appendChild(b);
      });

      const actions = el("div", "act-actions");
      const sendBtn = button("act-send", "Invia");
      sendBtn.disabled = true; // finché non c'è una scelta

      const setError = (text) => {
        let error = actions.querySelector(".act-error");
        if (!error) {
          error = el("p", "act-error");
          error.setAttribute("role", "alert");
          actions.appendChild(error);
        }
        error.textContent = text;
      };

      sendBtn.addEventListener("click", async () => {
        if (sending || !selectedId) return;

        sending = true;
        sendBtn.disabled = true;
        sendBtn.setAttribute("aria-busy", "true");
        sendBtn.textContent = "Invio…";
        options.forEach((b) => (b.disabled = true));
        actions.querySelector(".act-error")?.remove();

        try {
          const verdict = readVerdict(
            await request({ id: pageId, questionId: q.ref, optionId: selectedId })
          );

          state.answers[q.key] = verdict;
          store.write(state);

          refreshNav();
          renderBody(index, { focusFeedback: true });
        } catch (err) {
          console.error("Risposta non registrata:", err);
          sending = false;
          sendBtn.removeAttribute("aria-busy");
          sendBtn.textContent = "Invia";
          sendBtn.disabled = false;
          options.forEach((b) => (b.disabled = false));
          setError(MESSAGES[err.kind] || MESSAGES.protocol);
        }
      });

      actions.appendChild(sendBtn);
      body.appendChild(group);
      body.appendChild(actions);
    };

    questions.forEach((_, i) => renderBody(i));
    refreshNav();

    container.appendChild(nav);
    container.appendChild(track);

    setCurrent(startIndex, { focus });
  };

  if (isComplete()) renderFinal({ focus: false });
  else buildQuiz(Math.max(nextOpen(-1), 0)); // riprende da dove si era rimasti
})();

// Gestione sostituzione titolo header durante lo scroll
(() => {
  const siteTitle = document.querySelector("#site-header .site-title");
  const postTitle = document.getElementById("post-title");

  if (!siteTitle || !postTitle) return;

  const originalTitleText = siteTitle.textContent;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) {
        siteTitle.textContent = postTitle.textContent;
      } else {
        siteTitle.textContent = originalTitleText;
      }
    });
  }, { threshold: 0 });

  observer.observe(postTitle);
})();