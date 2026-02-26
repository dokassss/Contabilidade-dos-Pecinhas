/* ════════════════════════════════════════════════
   SW.JS — Service Worker do Contábil App
   Estratégia: Cache-First para assets estáticos,
               Network-First para API/Supabase.

   CACHE VERSION: incrementar ao fazer deploy
   para forçar atualização nos clientes.
════════════════════════════════════════════════ */

const CACHE_VERSION = 'contabil-v1';

// Assets que serão cacheados no install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/tokens.css',
  '/css/base.css',
  '/css/dashboard.css',
  '/css/pages.css',
  '/js/data.js',
  '/js/company.js',
  '/js/ui.js',
  '/js/pages.js',
  '/js/charts.js',
  '/js/supabase.js',
  '/js/api.js',
  '/js/onboarding.js',
  '/js/main-supabase.js',
  'https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Instrument+Serif:ital@0;1&family=DM+Mono:wght@400;500&display=swap'
];

// Domínios que NUNCA devem ser cacheados (sempre network)
const NETWORK_ONLY_ORIGINS = [
  'supabase.co',
  'supabase.com'
];

/* ─── INSTALL ─── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()) // ativa imediatamente sem esperar tab fechar
  );
});

/* ─── ACTIVATE ─── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION) // remove caches antigos
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim()) // assume controle imediato de todas as tabs
  );
});

/* ─── FETCH ─── */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Supabase e APIs externas — sempre network (sem cache)
  if (NETWORK_ONLY_ORIGINS.some(origin => url.hostname.includes(origin))) {
    event.respondWith(fetch(event.request));
    return;
  }

  // POST/PUT/DELETE — sempre network
  if (event.request.method !== 'GET') {
    event.respondWith(fetch(event.request));
    return;
  }

  // Fontes Google — cache primeiro, depois network (Cache-First)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
          return response;
        })
      )
    );
    return;
  }

  // Assets do app — Cache-First com fallback para network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        // Não cachear respostas inválidas
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => {
        // Offline fallback: serve index.html para navegação
        if (event.request.destination === 'document') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

/* ─── MENSAGENS ─── */
// Permite forçar update via postMessage({ type: 'SKIP_WAITING' })
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
