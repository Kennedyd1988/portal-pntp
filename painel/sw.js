// Service worker do painel — estratégia "rede primeiro".
// Sempre busca a versão nova no servidor; o cache só é usado sem internet.
// Por isso o nome do cache não precisa mudar a cada versão: a troca de versão
// é controlada por versao.json (ver README › Controle de versões).
const CACHE = 'painel-pntp';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // Só arquivos do próprio painel. Chamadas à Supabase e a CDNs passam direto.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // versao.json nunca vem do cache: é ele que diz se há versão nova.
  if (url.pathname.endsWith('/versao.json')) return;

  e.respondWith(
    fetch(req)
      .then((resp) => {
        if (resp.ok) {
          const copia = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
        }
        return resp;
      })
      .catch(() => caches.match(req))
  );
});
