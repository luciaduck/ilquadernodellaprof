// IMPORTANTE: CACHE_VERSION va cambiata a mano ogni volta che modifichi
// questo file o uno degli asset elencati.

const CACHE_VERSION = 'v4.4';
const PRECACHE = `qua-precache-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';

// ── Pagine ────────────────────────────────────────────────────────
// URL senza .html: è la forma che serve Cloudflare Pages.
// /offline.html fa eccezione: ha un permalink esplicito.
const PAGES = [
  '/',
  OFFLINE_URL,
  '/about/',
  '/credits',
  '/privacy',
  '/LICENSE',
  '/accessibility',
];

// ── Fogli di stile ────────────────────────────────────────────────
const CSS = [
  '/assets/main.css',
  '/assets/index.css',
  '/assets/about.css',
  '/assets/book.css',
  '/assets/homeroom.css',
  '/assets/buttons.css',
  '/assets/credit.css',
  '/assets/egg.css',
  '/assets/minimal-footer.css',
];

// ── Font ─────────────────────────────────────────────────────────
const FONTS = [
  '/assets/fonts/righteous-v18-latin-regular.woff2',
  '/assets/fonts/nunito-v32-latin-800.woff2',
  '/assets/fonts/nunito-sans-v19-latin-regular.woff2',
  '/assets/fonts/nunito-sans-v19-latin-700.woff2',
  '/assets/fonts/nunito-sans-v19-latin-italic.woff2',
  '/assets/fonts/nunito-sans-v19-latin-700italic.woff2',
  '/assets/fonts/OpenDyslexic-Regular.otf',
  '/assets/fonts/OpenDyslexic-Bold.otf',
];

// ── Immagini ─────────────────────────────────────────────────────────
const ICONS = [
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/download.png',
  '/assets/icons/drowning.png',
  '/assets/icons/ducklings.png',
  '/assets/icons/duckxmas.jpg',
  '/assets/icons/summer.png',
  '/assets/icons/travel.png',
  '/assets/icons/og.png',
];

const PRECACHE_URLS = [...PAGES, ...CSS, ...FONTS, ...ICONS];

// ── Installazione ─────────────────────────────────────────────────

self.addEventListener('install', event => {
  self.skipWaiting(); // attiva subito il nuovo SW senza aspettare
  event.waitUntil(precacheAll());
});

// Un file alla volta invece di cache.addAll().
async function precacheAll() {
  const cache = await caches.open(PRECACHE);
  const results = await Promise.allSettled(
    PRECACHE_URLS.map(url => cacheOne(cache, url))
  );

  const falliti = PRECACHE_URLS.filter((url, i) => results[i].status === 'rejected');
  if (falliti.length) {
    console.warn('[sw] non messi in cache:', falliti);
  } else {
    console.log(`[sw] precache completo: ${PRECACHE_URLS.length} file`);
  }
}

async function cacheOne(cache, url) {
  // cache: 'reload' salta la cache HTTP del browser, così a ogni nuova
  // versione del SW scarichiamo davvero i file aggiornati.
  const response = await fetch(url, { cache: 'reload' });
  if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`);

  // Se Cloudflare ha risposto con un redirect (tipico di .html → URL
  // pulita), la risposta porta il flag "redirected" e il browser la
  // rifiuta quando la usiamo per una navigazione: la ricostruiamo.
  const daSalvare = response.redirected
    ? new Response(await response.blob(), {
        status: 200,
        statusText: 'OK',
        headers: response.headers,
      })
    : response;

  await cache.put(url, daSalvare);
}

// ── Attivazione ───────────────────────────────────────────────────

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(key => key !== PRECACHE) // cancella tutto tranne la versione attuale
          .map(key => caches.delete(key))
      );
      await self.clients.claim(); // prende subito il controllo delle tab aperte
    })()
  );
});

// ── Richieste ─────────────────────────────────────────────────────

self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate') {
    event.respondWith(strategiaPagine(event.request));
  } else {
    event.respondWith(strategiaAsset(event.request));
  }
});

// Pagine: sempre rete. Senza rete, solo se la pagina è una delle sette
// del precache la serviamo da lì; in tutti gli altri casi, offline.html.
// Nessuna pagina entra mai in cache navigandola.
async function strategiaPagine(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(PRECACHE);
    const inPrecache = await cache.match(request, { ignoreSearch: true });
    return inPrecache || (await cache.match(OFFLINE_URL)) || Response.error();
  }
}

// Asset: prima la cache. ignoreSearch serve perché i CSS sono chiamati
// con ?v=1.6 mentre in cache stanno senza query string.
async function strategiaAsset(request) {
  const cache = await caches.open(PRECACHE);
  const inPrecache = await cache.match(request, { ignoreSearch: true });
  return inPrecache || fetch(request);
}