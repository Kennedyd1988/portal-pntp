// =====================================================================
// PORTAL PNTP · SOFT+ — Coletor do site antigo (0.23.3)
//
// Roda DENTRO do site antigo do órgão (aberto pelo painel, módulo "Migração
// do site antigo", botão "Ler pelo navegador"), acionado pelo favorito
// "Coletor SOFT+". Serve de ponte: o painel pede páginas e arquivos e o
// coletor os lê como se fosse a pessoa navegando, e devolve ao painel.
//
// Por que existe: muitos sites de prefeitura bloqueiam leituras vindas de
// servidores (nuvem); pelo navegador de quem usa, a leitura sempre funciona.
//
// Segurança: só atende o painel (origem de onde este arquivo foi carregado),
// só a janela que abriu esta aba, e só endereços do próprio site antigo.
// Não lê nem envia senhas, cookies ou dados da pessoa: só páginas públicas.
// =====================================================================
(function () {
  'use strict';
  if (window.__softColetor) { window.__softColetor.anunciar(); return; }
  const script = document.currentScript;
  const SRC = script ? script.src : 'https://kennedyd1988.github.io/portal-pntp/painel/coletor.js';
  const PAINEL = new URL(SRC).origin;
  // Com quem conversa: a aba do painel que abriu esta (window.opener) ou, se o site
  // foi aberto direto, o painel embutido aqui mesmo numa moldura (login pedido nela).
  let parceiro = window.opener || null;
  const semWww = (h) => String(h || '').replace(/^www\./, '').toLowerCase();
  const AQUI = semWww(location.host);
  const liberados = new Set();
  let atendidos = 0;

  // Aviso no topo da página
  const faixa = document.createElement('div');
  faixa.style.cssText = 'position:fixed;z-index:2147483647;left:0;right:0;top:0;padding:10px 14px;font:600 14px/1.4 system-ui,sans-serif;' +
    'background:#0b5cad;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.3);text-align:center';
  document.body.appendChild(faixa);
  if (!parceiro) {
    const caixa = document.createElement('div');
    caixa.style.cssText = 'position:fixed;z-index:2147483646;left:0;right:0;bottom:0;top:44px;background:#fff;border-top:3px solid #0b5cad';
    const moldura = document.createElement('iframe');
    moldura.src = SRC.replace(/coletor\.js.*$/, '') + 'index.html?embutido=1#/m/migracao';
    moldura.style.cssText = 'border:0;width:100%;height:100%';
    caixa.appendChild(moldura);
    document.body.appendChild(caixa);
    parceiro = moldura.contentWindow;
  }
  const mostrar = (t, erro) => { faixa.textContent = t; faixa.style.background = erro ? '#a32020' : '#0b5cad'; };

  // Endereço do próprio site (com ou sem www) reescrito para esta aba (evita bloqueio entre www e sem www).
  function local(url) {
    const u = new URL(url, location.href);
    if (!/^https?:$/.test(u.protocol) || semWww(u.host) !== AQUI) throw new Error('Endereço fora do site antigo.');
    u.protocol = location.protocol; u.host = location.host;
    return u;
  }
  async function liberar(u) {
    const m = u.pathname.match(/^\/(licitacao|concurso)\//);
    if (!m || liberados.has(m[1])) return;
    try { await (await fetch('/' + m[1] + '/continua-' + m[1] + '/', { credentials: 'include' })).text(); } catch (_) { /* segue */ }
    liberados.add(m[1]);
  }
  async function tamanho(url) {
    try {
      const u = local(url);
      let r = await fetch(u.href, { method: 'HEAD', credentials: 'include' });
      let n = Number(r.headers.get('content-length') || 0);
      if (!n) {
        r = await fetch(u.href, { headers: { Range: 'bytes=0-0' }, credentials: 'include' });
        const cr = r.headers.get('content-range') || '';
        n = Number(cr.split('/')[1] || 0) || Number(r.headers.get('content-length') || 0);
        try { await r.body.cancel(); } catch (_) { /* ok */ }
      }
      return { url, bytes: n || null };
    } catch (_) { return { url, bytes: null }; }
  }

  async function atender(d) {
    if (d.acao === 'pagina') {
      const u = local(d.url); await liberar(u);
      const op = { credentials: 'include' };
      if (d.metodo === 'POST') Object.assign(op, { method: 'POST', body: String(d.corpo || ''),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' } });
      const r = await fetch(u.href, op);
      return { status: r.status, url_final: r.url, html: await r.text() };
    }
    if (d.acao === 'medir') {
      return { tamanhos: await Promise.all((d.urls || []).slice(0, 40).map(tamanho)) };
    }
    if (d.acao === 'arquivo') {
      const u = local(d.url); await liberar(u);
      const r = await fetch(u.href, { credentials: 'include' });
      if (!r.ok) throw new Error('O site antigo respondeu ' + r.status + ' para o arquivo.');
      const nome = ((r.headers.get('content-disposition') || '').match(/filename\*?=(?:UTF-8'')?"?([^";]+)/i) || [])[1] || new URL(r.url).pathname;
      const blob = await r.blob();
      return { blob, tipo: (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase(), nome };
    }
    if (d.acao === 'ping') return { host: location.host };
    throw new Error('Pedido desconhecido.');
  }

  window.addEventListener('message', async (ev) => {
    if (ev.origin !== PAINEL || !ev.data || !/^(pedido|ping)$/.test(ev.data.softColetor)) return;
    if (ev.data.softColetor === 'ping') { if (ev.source === parceiro) anunciar(); return; }
    if (ev.source !== parceiro) return;
    const d = ev.data;
    let resposta;
    try { resposta = Object.assign({ softColetor: 'resposta', id: d.id, ok: true }, await atender(d)); }
    catch (e) { resposta = { softColetor: 'resposta', id: d.id, ok: false, erro: e.message || String(e) }; }
    try { ev.source.postMessage(resposta, ev.origin); } catch (e) {
      ev.source.postMessage({ softColetor: 'resposta', id: d.id, ok: false, erro: 'Não foi possível devolver: ' + e.message }, ev.origin);
    }
    atendidos++;
    if (d.acao !== 'ping') mostrar('Coletor SOFT+ ativo — ' + atendidos + ' leituras feitas. Não feche esta aba; acompanhe pelo painel.');
  });

  function anunciar() {
    try { parceiro.postMessage({ softColetor: 'pronto', host: location.host }, PAINEL); } catch (_) { /* moldura ainda carregando */ }
    mostrar(window.opener ? 'Coletor SOFT+ conectado ao painel. Não feche esta aba; acompanhe pelo painel.'
      : 'Coletor SOFT+ — painel abaixo (entre com seu login, se pedir). Não feche esta aba.');
  }
  window.__softColetor = { anunciar };
  anunciar();
})();
