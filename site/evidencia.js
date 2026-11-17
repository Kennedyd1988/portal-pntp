// =====================================================================
// Site público — Modo evidência (Kit de evidências PNTP, 0.45.0)
// Carregado só quando o endereço tem ?evidencia=1 (o painel abre o site numa
// moldura escondida). Para cada print, o painel chama:
//   EVIDENCIA.preparar({ rota, url, itens: [{ c: '8.1', m: ['D','A','S','G','F', {s, t}, {col, t}] }] })
//     → abre a página, espera terminar de carregar, contorna em vermelho o que
//       prova cada critério (com etiqueta "Critério · itens"), põe o carimbo com
//       endereço, data e hora, e devolve o que leu da página (filtros, formatos,
//       anos, total, data de atualização, declarações, o que não achou).
//   EVIDENCIA.capturar() → PNG (data URL) da página marcada, gerado no navegador.
// Marcas por letra (Avalia): D Disponibilidade = a lista ou o conteúdo;
// A Atualidade = data da última atualização (ou o registro mais recente);
// S Série histórica = abas/seletor de anos; G Relatórios = botões de exportar;
// F Filtros = barra de filtros. {s: seletor, t: rótulo} e {col: cabeçalho, t}
// marcam um elemento ou uma coluna de tabela específicos.
// =====================================================================
(function () {
  'use strict';
  const S = window.SITE;
  const NOMES = { D: 'Disponibilidade', A: 'Atualidade', S: 'Série histórica', G: 'Relatórios', F: 'Filtros' };
  const ORDEM = ['D', 'A', 'S', 'G', 'F'];
  const camada = () => document.getElementById('evid-camada');
  const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const visivel = (e) => { if (!e || !e.isConnected) return false; const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(e).visibility !== 'hidden'; };
  const primeiro = (sel, raiz) => [...(raiz || document).querySelectorAll(sel)].find(visivel) || null;

  // Estilo do modo evidência: sem o tradutor de Libras flutuante, sem animações; marcas e carimbo.
  const css = document.createElement('style');
  css.textContent = '[vw], [vw-access-button], [vw-plugin-wrapper], .vw-plugin-wrapper, [class*="vw-"], [class*="vpw-"] { display: none !important; } *, *::before, *::after { animation: none !important; transition: none !important; }'
    + '#evid-carimbo { background: #fff4f4; border-bottom: 3px solid #c40000; color: #7a0000; font: 600 14px/1.35 system-ui, Arial, sans-serif; padding: 8px 16px; display: flex; gap: 18px; flex-wrap: wrap; }'
    + '#evid-carimbo strong { color: #c40000; } #evid-carimbo span { word-break: break-all; }'
    + '#evid-camada { position: absolute; left: 0; top: 0; width: 0; height: 0; z-index: 2147483000; pointer-events: none; }'
    + '.evid-caixa { position: absolute; border: 3px solid #e00000; border-radius: 4px; box-sizing: border-box; }'
    + '.evid-rotulo { position: absolute; background: #e00000; color: #fff; font: 700 12px/1.25 system-ui, Arial, sans-serif; padding: 3px 7px; border-radius: 3px; white-space: nowrap; }';
  document.head.append(css);

  // Espera a página terminar: sem "Carregando…" no conteúdo e sem mudanças por 900 ms (até 25 s).
  async function esperarPagina() {
    const main = document.getElementById('conteudo');
    let ultima = Date.now();
    const obs = new MutationObserver(() => { ultima = Date.now(); });
    obs.observe(main, { childList: true, subtree: true, attributes: true, characterData: true });
    const inicio = Date.now();
    try {
      while (Date.now() - inicio < 25000) {
        await espera(150);
        const carregando = [...main.querySelectorAll('.carregando')].some(visivel) || /^\s*Carregando…\s*$/.test(main.textContent);
        if (!carregando && Date.now() - ultima > 900) break;
      }
      // Imagens do conteúdo (fotos, brasão): até 5 s.
      const imgs = [...document.querySelectorAll('#conteudo img, .cabecalho img')].filter((i) => !i.complete);
      await Promise.race([Promise.all(imgs.map((i) => new Promise((ok) => { i.onload = i.onerror = ok; }))), espera(5000)]);
      if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, espera(3000)]);
    } finally { obs.disconnect(); }
  }

  // Elemento de cada letra (o primeiro que aparece na tela).
  function acharLetra(l) {
    const main = document.getElementById('conteudo');
    if (l === 'F') return primeiro('form.filtros', main);
    if (l === 'G') return primeiro('.exportar', main);
    if (l === 'S') return primeiro('.abas-guia-interna', main) || [...main.querySelectorAll('[role="tablist"]')].find((t) => visivel(t) && /^(ano|exerc)/i.test(t.getAttribute('aria-label') || ''))
      || [...main.querySelectorAll('form.filtros label')].find((x) => visivel(x) && /\b(ano|exerc[ií]cio)\b/i.test(x.firstChild && x.firstChild.textContent || ''));
    if (l === 'A') {
      // Texto de atualização na própria página; senão, o registro mais recente da lista.
      const cands = [...main.querySelectorAll('p, span, small, div, li')].filter((x) => visivel(x) && x.children.length <= 3
        && /(atualizad[oa]s? em|última atualização|ultima atualizacao|atualizada em|posição em|registrada em)/i.test(x.textContent) && x.textContent.length < 260);
      if (cands.length) return cands.sort((a, b) => a.textContent.length - b.textContent.length)[0];
      const tr = primeiro('table tbody tr', main);
      if (tr) return Object.assign(tr, { _evidSufixo: ' (registro mais recente)' });
      const rod = document.getElementById('ultima-atualizacao');
      return rod && rod.textContent ? rod : null;
    }
    if (l === 'D') {
      return primeiro('.declaracao-atual', main) || primeiro('.caixa-externa', main)
        || primeiro('.tabela-rolagem, .tabela-caixa', main) || primeiro('.grade', main) || primeiro('.lista-cartoes, .declaracoes-site', main)
        || primeiro('.painel-guia-interno', main) || primeiro('.painel-guia', main) || primeiro('.pagina', main);
    }
    return null;
  }
  // Coluna de tabela pelo texto do cabeçalho: devolve um retângulo do cabeçalho até a última linha visível.
  function acharColuna(texto) {
    const main = document.getElementById('conteudo');
    for (const tab of main.querySelectorAll('table')) {
      if (!visivel(tab)) continue;
      const ths = [...tab.querySelectorAll('thead th')];
      const i = ths.findIndex((th) => S.normalizar(th.textContent).trim() === S.normalizar(texto));
      if (i < 0) continue;
      const linhas = [...tab.querySelectorAll('tbody tr')].filter(visivel).slice(0, 12);
      const r1 = ths[i].getBoundingClientRect();
      let fundo = r1.bottom;
      for (const tr of linhas) { const c = tr.children[i]; if (c) fundo = Math.max(fundo, c.getBoundingClientRect().bottom); }
      return { rect: { left: r1.left, top: r1.top, right: r1.right, bottom: fundo } };
    }
    return null;
  }

  // Menor elemento visível do conteúdo que contém o texto (sem acento, sem diferença de maiúsculas).
  function acharTexto(texto) {
    const t = S.normalizar(texto);
    const cands = [...document.querySelectorAll('#conteudo h2, #conteudo h3, #conteudo p, #conteudo li, #conteudo dt, #conteudo dd, #conteudo div, #conteudo section, #conteudo label, #conteudo span')]
      .filter((x) => visivel(x) && S.normalizar(x.textContent).includes(t));
    return cands.sort((a, b) => a.textContent.length - b.textContent.length)[0] || null;
  }

  function retangulo(alvo) {
    if (alvo.rect) return alvo.rect;
    const r = alvo.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }

  function limpar() {
    const c = camada(); if (c) c.remove();
    const k = document.getElementById('evid-carimbo'); if (k) k.remove();
  }

  // Lê da página o que vai para o texto de esclarecimento.
  function lerPagina() {
    const main = document.getElementById('conteudo');
    const limpo = (t) => String(t || '').replace(/\s+/g, ' ').trim();
    const f = primeiro('form.filtros', main);
    const filtros = f ? [...f.querySelectorAll('label')].map((l) => limpo(l.firstChild && l.firstChild.nodeType === 3 ? l.firstChild.textContent : l.textContent.split('\n')[0])).filter(Boolean) : [];
    const ex = primeiro('.exportar', main);
    const exportar = ex ? [...ex.querySelectorAll('button')].map((b) => limpo(b.textContent)) : [];
    const s = acharLetra('S');
    const anos = s && s.matches && s.matches('[role="tablist"]') ? [...s.querySelectorAll('[role="tab"]')].map((a) => limpo(a.textContent)).filter((t) => /^\d{4}/.test(t)) : [];
    const totalEl = primeiro('.barra-lista .meta', main);
    const a = acharLetra('A');
    const decl = [...main.querySelectorAll('.declaracao-atual, .declaracoes-site li')].filter(visivel).map((x) => limpo(x.textContent)).slice(0, 12);
    const externos = [...main.querySelectorAll('.caixa-externa a[href^="http"]')].map((x) => x.href).filter((v, i, l) => l.indexOf(v) === i);
    const h1 = primeiro('h1', main);
    return { titulo: h1 ? limpo(h1.textContent) : '', filtros, exportar: exportar.filter((x) => x && !/^baixar/i.test(x)), anos,
      total: totalEl ? limpo(totalEl.textContent) : '', atualizacao: a && !a._evidSufixo ? limpo(a.textContent).slice(0, 200) : '', declaracoes: decl, externos };
  }

  async function preparar(pedido) {
    limpar();
    const alvoHash = '#' + pedido.rota;
    if (location.hash !== alvoHash) {
      const mudou = new Promise((ok) => addEventListener('hashchange', ok, { once: true }));
      location.hash = alvoHash;
      await Promise.race([mudou, espera(1500)]);
    } else {
      // Mesma página de novo: força recarregar o conteúdo.
      dispatchEvent(new HashChangeEvent('hashchange'));
    }
    await espera(200);
    await esperarPagina();
    window.scrollTo(0, 0);

    // Tradutor de Libras flutuante fora do print (o próprio plugin reexibe o botão; por isso sai do DOM).
    document.querySelectorAll('[vw], [vw-access-button], [vw-plugin-wrapper]').forEach((e) => e.remove());
    // Carimbo no alto da página (antes das marcas: ele empurra o conteúdo para baixo).
    const agora = new Date();
    const carimbo = S.el('div', { id: 'evid-carimbo' },
      S.el('span', null, S.el('strong', null, 'Endereço: '), pedido.url || location.href),
      S.el('span', null, S.el('strong', null, 'Capturado em: '), agora.toLocaleDateString('pt-BR') + ' às ' + agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        + ' (' + (Intl.DateTimeFormat().resolvedOptions().timeZone || 'hora local') + ')'),
      S.el('span', null, S.el('strong', null, 'Itens do PNTP: '), pedido.itens.map((x) => x.c).join(', ')));
    document.body.prepend(carimbo);
    await espera(120);

    // Junta as marcas pelo elemento: um contorno só, com todos os critérios e itens dele.
    const grupos = [];
    const faltou = [];
    for (const it of pedido.itens) {
      for (const m of it.m) {
        let alvo = null, nome = '';
        if (typeof m === 'string') { alvo = acharLetra(m); nome = NOMES[m] + (alvo && alvo._evidSufixo ? alvo._evidSufixo : ''); }
        else if (m.col) { alvo = acharColuna(m.col); nome = m.t || m.col; }
        else if (m.s) { alvo = primeiro(m.s); nome = m.t || ''; }
        else if (m.x) { alvo = acharTexto(m.x); nome = m.t || m.x; }
        if (!alvo) { faltou.push({ c: it.c, marca: typeof m === 'string' ? NOMES[m] : (m.t || m.col || m.x || m.s) }); continue; }
        let g = grupos.find((x) => x.alvo === alvo);
        if (!g) grupos.push(g = { alvo, nomes: [], itens: [] });
        if (!g.nomes.includes(nome)) g.nomes.push(nome);
        if (!g.itens.includes(it.c)) g.itens.push(it.c);
      }
    }
    const caixa = S.el('div', { id: 'evid-camada', 'aria-hidden': 'true' });
    document.body.append(caixa);
    let fundo = 0;
    const topoLivre = carimbo.getBoundingClientRect().bottom + scrollY + 2;   // etiqueta não cobre o carimbo
    const ocupados = [];
    const ordem = (n) => { const k = ORDEM.findIndex((l) => n.startsWith(NOMES[l])); return k < 0 ? 9 : k; };
    for (const g of grupos) {
      const r = retangulo(g.alvo);
      const x = Math.max(2, r.left + scrollX - 4), y = Math.max(2, r.top + scrollY - 4);
      const w = Math.min(document.documentElement.scrollWidth - x - 2, r.right - r.left + 8), h = r.bottom - r.top + 8;
      caixa.append(S.el('div', { class: 'evid-caixa', style: 'left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + h + 'px' }));
      // Etiqueta acima da caixa (ou dentro, se não couber); desce se já houver outra no mesmo lugar.
      let ty = y - 22 < topoLivre ? y + 3 : y - 22;
      while (ocupados.some((o) => Math.abs(o.y - ty) < 20 && Math.abs(o.x - x) < 260)) ty += 22;
      ocupados.push({ x, y: ty });
      g.nomes.sort((a, b) => ordem(a) - ordem(b));
      caixa.append(S.el('div', { class: 'evid-rotulo', style: 'left:' + x + 'px;top:' + ty + 'px' }, g.nomes.join(' · ') + ' — ' + g.itens.join(', ')));
      fundo = Math.max(fundo, y + h, ty + 22);
    }
    return { info: lerPagina(), faltou, marcas: grupos.map((g) => ({ nomes: g.nomes, itens: g.itens })), fundo: Math.ceil(fundo), altura: document.documentElement.scrollHeight };
  }

  let h2c = null;
  function carregarH2c() {
    if (window.html2canvas) return Promise.resolve();
    if (h2c) return h2c;
    h2c = new Promise((ok, erro) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
      s.onload = ok; s.onerror = () => { h2c = null; erro(new Error('Não foi possível carregar o gerador de imagens.')); };
      document.head.append(s);
    });
    return h2c;
  }

  // PNG da página marcada: do alto até um pouco abaixo da última marca (mínimo 900 px, máximo 4.500 px).
  async function capturar(fundo) {
    await carregarH2c();
    const largura = Math.max(document.documentElement.clientWidth, 1024);
    const total = document.documentElement.scrollHeight;
    const altura = Math.min(total, Math.max(900, (fundo || 0) + 80), 4500);
    const canvas = await window.html2canvas(document.documentElement, {
      useCORS: true, allowTaint: false, backgroundColor: '#ffffff', scale: 1, logging: false,
      x: 0, y: 0, scrollX: 0, scrollY: 0, width: largura, height: altura, windowWidth: largura, windowHeight: altura
    });
    return { png: canvas.toDataURL('image/png'), largura: canvas.width, altura: canvas.height };
  }

  window.EVIDENCIA = { pronto: true, preparar, capturar, limpar };
})();
