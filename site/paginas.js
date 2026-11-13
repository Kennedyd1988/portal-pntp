// =====================================================================
// Site público — páginas (Portal PNTP · SOFT+)
// Cada função recebe (main, partes da rota, parâmetros) e desenha a página.
// Os números entre parênteses nos comentários são os critérios do PNTP
// que cada página atende.
// =====================================================================
(function () {
  'use strict';
  const S = window.SITE;
  const { sb, el, texto, dataBR, dataLonga, normalizar } = S;
  const R = S.rotas;

  const TIPOS = {
    lei_organica: 'Lei Orgânica', emenda_lei_organica: 'Emenda à Lei Orgânica', lei_complementar: 'Lei Complementar',
    lei: 'Lei Ordinária', decreto: 'Decreto', portaria: 'Portaria', resolucao: 'Resolução',
    instrucao_normativa: 'Instrução Normativa', ato: 'Ato', edital: 'Edital', outro: 'Outro'
  };
  const VIGENCIA = { vigente: 'Vigente', alterada: 'Alterada', revogada: 'Revogada', sem_efeito: 'Sem efeito' };
  const COR_VIG = { vigente: 'etiqueta-verde', alterada: 'etiqueta-ambar', revogada: 'etiqueta-vermelha', sem_efeito: 'etiqueta-vermelha' };
  const FORMAS = { presencial: 'Presencial', digital: 'Pela internet', presencial_digital: 'Presencial e pela internet' };
  const RADAR = 'https://radardatransparencia.atricon.org.br/panel.html';
  const org = () => S.orgao.id;
  const ato = (x) => (TIPOS[x.tipo] || x.tipo) + (x.numero ? ' nº ' + x.numero + '/' + x.ano : ' de ' + x.ano);
  const pagina = (main, ...filhos) => main.replaceChildren(el('div', { class: 'limite pagina' }, ...filhos));
  const termo = (t) => '%' + normalizar(t).replace(/[%_*(),]/g, ' ').trim() + '%';

  // Ícones simples (traço), usados nos acessos rápidos.
  const ICONES = {
    transparencia: 'M3 3h18v4H3zM5 9h4v12H5zM10 13h4v8h-4zM15 6h4v15h-4z',
    licitacao: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8',
    servicos: 'M4 6h16M4 12h16M4 18h10',
    publicacoes: 'M4 4h12l4 4v12H4zM8 10h8M8 14h8M8 18h5',
    diario: 'M4 5h16v14H4zM8 9h8M8 13h8',
    ouvidoria: 'M4 4h16v12H8l-4 4z',
    esic: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 8v5M12 16h.01',
    faq: 'M9 9a3 3 0 1 1 4 2.8c-.6.3-1 .8-1 1.5V14M12 18h.01'
  };
  const icone = (n) => el('span', { class: 'icone', 'aria-hidden': 'true' }, (() => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', '24'); s.setAttribute('height', '24');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', ICONES[n]); p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '2'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
    s.append(p); return s;
  })());

  // Lista paginada por cursor (mais recentes primeiro, ou alfabética).
  async function paginar(montar, coluna, ultimo, lote, crescente) {
    const op = crescente ? 'gt' : 'lt';
    let q = montar().order(coluna, { ascending: !!crescente }).order('id', { ascending: !!crescente }).limit(lote);
    if (ultimo) {
      const v = '"' + String(ultimo[coluna]).replace(/"/g, '') + '"';
      q = q.or(coluna + '.' + op + '.' + v + ',and(' + coluna + '.eq.' + v + ',id.' + op + '.' + ultimo.id + ')');
    }
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }

  // Total de visualizações por notícia (tabela separada; se o script 09 ainda não
  // foi rodado, a consulta falha e os contadores simplesmente não aparecem).
  async function visualizacoes(ids) {
    if (!ids.length) return {};
    const { data, error } = await sb.from('noticias_visualizacoes').select('noticia_id, total').in('noticia_id', ids);
    if (error) return {};
    return Object.fromEntries((data || []).map((v) => [v.noticia_id, Number(v.total)]));
  }
  const iconeOlho = () => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', '18'); s.setAttribute('height', '18'); s.setAttribute('aria-hidden', 'true');
    s.innerHTML = '<path fill="none" stroke="currentColor" stroke-width="2" d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/>';
    return s;
  };
  // Cartão horizontal da página inicial: foto à esquerda; data, visualizações,
  // categoria, título, resumo e "Continuar lendo" à direita.
  // Texto da notícia sem a marcação (##, **, listas, links), cortado no tamanho pedido.
  function textoCorrido(t, max) {
    // Só os parágrafos corridos: subtítulos e listas ficam de fora (soltos no meio de uma frase confundem).
    const paragrafos = String(t || '').replace(/\r/g, '').split(/\n{2,}/)
      .filter((b) => b.trim() && !/^\s*(#{2,3}\s|[-*]\s|\d+[.)]\s)/.test(b));
    const limpo = paragrafos.join(' ').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\*\*?([^*]+)\*\*?/g, '$1').replace(/\s+/g, ' ').trim();
    return limpo.length > max ? limpo.slice(0, limpo.lastIndexOf(' ', max)) + '…' : limpo;
  }

  function cartaoHorizontal(n, vis, grande) {
    const total = vis[n.id];
    return el('article', { class: 'noticia-h' + (grande ? ' noticia-h-grande' : '') },
      el('a', { class: 'noticia-h-foto', href: '#/noticia/' + n.id, tabindex: '-1', 'aria-hidden': 'true' },
        n.capa_url ? el('img', { src: n.capa_url, alt: '', loading: grande ? 'eager' : 'lazy' }) : el('span', { class: 'noticia-sem-foto' }, 'Notícia')),
      el('div', { class: 'noticia-h-texto' },
        el('div', { class: 'noticia-h-topo' },
          total ? el('span', { class: 'noticia-h-vis', title: total + ' visualizações' }, el('strong', null, total.toLocaleString('pt-BR')), iconeOlho(),
            el('span', { class: 'sr' }, ' visualizações')) : null,
          el('span', { class: 'noticia-h-meta' }, el('span', null, dataLonga(n.publicado_em)),
            n.categoria ? el('span', { class: 'noticia-h-cat' }, n.categoria) : null)),
        el(grande ? 'h3' : 'h3', null, el('a', { href: '#/noticia/' + n.id }, n.titulo)),
        n.resumo ? el('p', null, n.resumo) : null,
        // Na notícia grande, um trecho do texto completa o espaço ao lado da foto.
        grande && n.conteudo ? el('p', { class: 'noticia-h-trecho' }, textoCorrido(n.conteudo, 420)) : null,
        el('a', { class: 'noticia-h-mais', href: '#/noticia/' + n.id }, 'Continuar lendo', el('span', { class: 'sr' }, ': ' + n.titulo), el('span', { 'aria-hidden': 'true' }, ' →'))));
  }

  function cartaoNoticia(n, grande) {
    return el('a', { class: 'cartao noticia-cartao', href: '#/noticia/' + n.id },
      n.capa_url ? el('img', { src: n.capa_url, alt: n.capa_legenda || '', loading: 'lazy' }) : el('span', { class: 'noticia-sem-foto', 'aria-hidden': 'true' }, 'Notícia'),
      el('span', { class: 'meta' }, (n.categoria ? n.categoria + ' · ' : '') + dataBR(n.publicado_em)),
      el(grande ? 'h3' : 'h3', null, n.titulo),
      n.resumo ? el('p', { class: 'meta', style: 'margin:0' }, n.resumo) : null);
  }

  // ===================================================================
  // INÍCIO (1.3 transparência na capa, 2.3 gestores, 2.8 redes, 2.9 Radar)
  // ===================================================================
  R[''] = async function (main) {
    S.titulo('');
    const c = S.conf;
    const agora = new Date().toISOString();
    const [bn, nt, pb, gs, sv] = await Promise.all([
      sb.from('banners').select('*').eq('orgao_id', org()).eq('ativo', true).order('ordem').limit(8),
      sb.from('noticias').select('id, titulo, resumo, conteudo, capa_url, capa_legenda, categoria, publicado_em, destaque').eq('orgao_id', org())
        .lte('publicado_em', agora).order('publicado_em', { ascending: false }).limit(7),
      ultimasPublicacoes(),
      sb.from('gestores').select('*').eq('orgao_id', org()).eq('destaque_capa', true).order('ordem').limit(8),
      sb.from('servicos').select('id, nome, categoria, link_digital').eq('orgao_id', org())
        .in('forma_prestacao', ['digital', 'presencial_digital']).order('nome').limit(6)
    ]);
    const banners = bn.data || [], noticias = nt.data || [], pubs = pb, gestores = gs.data || [], digitais = sv.data || [];
    // A notícia grande é a mais recente; se alguma das recentes foi marcada como
    // "Destacar na página inicial", ela ocupa o lugar.
    const destaque = noticias.find((n) => n.destaque) || noticias[0];
    const demais = noticias.filter((n) => n !== destaque).slice(0, 4);
    const vis = await visualizacoes(noticias.map((n) => n.id));

    const blocos = [];
    // Selos e certificações: faixa compacta no alto da página inicial (cadastro em Aparência).
    const selos = (Array.isArray(c.selos) ? c.selos : []).filter((x) => x && x.titulo).slice(0, 6);
    if (selos.length) blocos.push(faixaSelos(selos));
    if (banners.length) blocos.push(el('div', { class: 'limite banner-limite' }, carrossel(banners)));

    const acessos = [
      ['transparencia', 'Portal da Transparência', 'Receitas, despesas, folha e contas', '#/transparencia'],
      ['licitacao', 'Licitações e contratos', 'Editais, resultados e contratos', '#/licitacoes'],
      ['servicos', 'Carta de Serviços', 'Como pedir cada serviço', '#/servicos'],
      ['publicacoes', 'Leis e atos oficiais', 'Leis, decretos e portarias', '#/publicacoes'],
      ['diario', 'Diário Oficial', c.diario_oficial_nome || 'Publicações oficiais', '#/diario-oficial'],
      ['ouvidoria', 'Ouvidoria', 'Elogios, sugestões e reclamações', '#/ouvidoria'],
      ['esic', 'e-SIC', 'Pedido de acesso à informação', '#/esic'],
      ['faq', 'Perguntas frequentes', 'Respostas rápidas', '#/faq']
    ];
    blocos.push(el('section', { class: 'secao', 'aria-labelledby': 'tit-acessos' }, el('div', { class: 'limite' },
      el('h2', { id: 'tit-acessos' }, 'Serviços e acessos rápidos'),
      el('div', { class: 'grade g4 acessos' }, acessos.map(([ic, t, d, h]) =>
        el('a', { class: 'cartao', href: h }, icone(ic), el('span', null, el('strong', null, t), el('span', { class: 'meta' }, d))))))));

    blocos.push(el('section', { class: 'secao', style: 'padding-top:0', 'aria-labelledby': 'tit-transp' }, el('div', { class: 'limite' },
      el('div', { class: 'faixa-transparencia' },
        el('div', null, el('h2', { id: 'tit-transp' }, 'Transparência pública'),
          el('p', null, 'Acompanhe como os recursos públicos são aplicados: receitas, despesas, licitações, contratos, servidores e prestação de contas.')),
        el('div', { class: 'faixa-botoes' },
          el('a', { class: 'botao botao-transparencia', href: '#/transparencia' }, 'Portal da Transparência'),
          el('a', { class: 'botao botao-radar', href: RADAR, target: '_blank', rel: 'noopener' }, 'Radar da Transparência Pública',
            el('span', { class: 'sr' }, ' (abre em nova aba)')))))));

    if (destaque) {
      blocos.push(el('section', { class: 'secao secao-cinza', 'aria-labelledby': 'tit-noticias' }, el('div', { class: 'limite' },
        el('div', { class: 'secao-titulo' }, el('h2', { id: 'tit-noticias' }, 'Notícias'), el('a', { href: '#/noticias' }, 'Todas as notícias →')),
        cartaoHorizontal(destaque, vis, true),
        demais.length ? el('div', { class: 'grade g2 noticias-lista' }, demais.map((n) => cartaoHorizontal(n, vis))) : null)));
    }

    if (digitais.length) {
      blocos.push(el('section', { class: 'secao', 'aria-labelledby': 'tit-digitais' }, el('div', { class: 'limite' },
        el('div', { class: 'secao-titulo' }, el('h2', { id: 'tit-digitais' }, 'Serviços pela internet'), el('a', { href: '#/servicos' }, 'Carta de Serviços completa →')),
        el('div', { class: 'grade g3' }, digitais.map((s) => el('a', { class: 'cartao', href: '#/servico/' + s.id },
          el('strong', null, s.nome), el('span', { class: 'meta', style: 'display:block' }, (s.categoria ? s.categoria + ' · ' : '') + 'Pedido sem ir ao balcão')))))));
    }

    if (pubs.some((g) => g.itens.length)) blocos.push(secaoPublicacoes(pubs));
    if (gestores.length) {
      await S.carregarUnidades();
      blocos.push(el('section', { class: 'secao secao-cinza', 'aria-labelledby': 'tit-gestao' }, el('div', { class: 'limite' },
        el('div', { class: 'secao-titulo' }, el('h2', { id: 'tit-gestao' }, 'Gestão'), el('a', { href: '#/gestores' }, 'Todos os gestores →')),
        el('div', { class: 'grade g4' }, gestores.map(cartaoGestor)))));
    }

    const redes = S.redesDoOrgao(c);
    if (redes.length) blocos.push(el('section', { class: 'secao secao-cinza', 'aria-labelledby': 'tit-redes' }, el('div', { class: 'limite' },
      el('h2', { id: 'tit-redes' }, 'Redes sociais oficiais'),
      el('div', { class: 'faixa-botoes' }, redes.map((r) => S.linkRede(r, 'botao botao-claro botao-rede'))))));

    main.replaceChildren(...blocos);
  };

  // ---------- ÚLTIMAS PUBLICAÇÕES (abas por tipo de ato) ----------
  // Uma consulta pequena por aba (6 itens), para cada aba trazer os seus mais recentes
  // mesmo que outro tipo seja muito mais frequente. Aba sem publicação não aparece.
  const ABAS_PUB = [
    ['todas', 'Todas', null],
    ['leis', 'Leis', ['lei', 'lei_complementar', 'lei_organica', 'emenda_lei_organica']],
    ['decretos', 'Decretos', ['decreto']],
    ['portarias', 'Portarias', ['portaria']],
    ['editais', 'Editais', ['edital']]
  ];
  async function ultimasPublicacoes() {
    return Promise.all(ABAS_PUB.map(async ([id, rotulo, tipos]) => {
      let q = sb.from('publicacoes').select('id, tipo, numero, ano, data_publicacao, ementa, vigencia, arquivo_url, link_externo').eq('orgao_id', org());
      if (tipos) q = q.in('tipo', tipos);
      const { data } = await q.order('data_publicacao', { ascending: false }).order('id', { ascending: false }).limit(6);
      return { id, rotulo, itens: data || [] };
    }));
  }
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  function cartaoPublicacao(p) {
    const d = new Date(p.data_publicacao + 'T12:00:00');
    const doc = p.arquivo_url || p.link_externo;
    return el('article', { class: 'pub-cartao' },
      el('div', { class: 'pub-data', 'aria-hidden': 'true' },
        el('span', { class: 'pub-dia' }, String(d.getDate()).padStart(2, '0')),
        el('span', { class: 'pub-mes' }, MESES[d.getMonth()]), el('span', { class: 'pub-ano' }, String(d.getFullYear()))),
      el('div', { class: 'pub-texto' },
        el('div', { class: 'pub-etiquetas' }, el('span', { class: 'etiqueta' }, TIPOS[p.tipo] || p.tipo),
          p.vigencia !== 'vigente' ? el('span', { class: 'etiqueta ' + COR_VIG[p.vigencia] }, VIGENCIA[p.vigencia]) : null),
        el('h3', null, ato(p)),
        el('span', { class: 'sr' }, 'Publicado em ' + dataBR(p.data_publicacao) + '. '),
        el('p', null, p.ementa),
        doc ? el('a', { class: 'pub-ver', href: doc, target: '_blank', rel: 'noopener' }, 'Ver documento',
          el('span', { class: 'sr' }, ' de ' + ato(p) + ' (abre em nova aba)'), el('span', { 'aria-hidden': 'true' }, ' →'))
          : el('a', { class: 'pub-ver', href: '#/publicacoes?q=' + encodeURIComponent((p.numero || '') + ' ' + p.ano) }, 'Ver na lista →')));
  }
  function faixaSelos(selos) {
    const seloIcone = () => {
      const sv = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: 20, height: 20, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) sv.setAttribute(k, v);
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', 'M12 3l2.5 2 3.2-.3.8 3.1 2.6 1.9-1.3 2.9 1.3 3-2.6 1.8-.8 3.1-3.2-.3L12 21l-2.5-2-3.2.3-.8-3.1-2.6-1.8 1.3-3-1.3-2.9 2.6-1.9.8-3.1 3.2.3z M9 12l2 2 4-4');
      sv.append(p); return sv;
    };
    // Só os símbolos, alinhados à direita. O nome e o detalhe aparecem num balão ao
    // passar o mouse ou focar pelo teclado; o leitor de tela lê o texto escondido.
    return el('section', { class: 'faixa-selos', 'aria-labelledby': 'tit-selos' }, el('div', { class: 'limite' },
      el('h2', { id: 'tit-selos', class: 'sr' }, 'Selos e certificações'),
      el('ul', { class: 'selos' }, selos.map((x) => {
        const conteudo = [
          el('span', { class: 'selo-marca' + (x.imagem_url ? ' com-imagem' : '') }, x.imagem_url ? el('img', { src: x.imagem_url, alt: '', loading: 'lazy' }) : seloIcone()),
          el('span', { class: 'selo-balao', role: 'tooltip' }, el('strong', null, x.titulo), x.descricao ? el('span', null, x.descricao) : null)];
        return el('li', null, x.url ? el('a', { class: 'selo', href: x.url, target: '_blank', rel: 'noopener' }, ...conteudo, el('span', { class: 'sr' }, ' (abre em nova aba)'))
          : el('span', { class: 'selo', tabindex: '0' }, ...conteudo));
      }))));
  }

  function secaoPublicacoes(grupos) {
    const abas = grupos.filter((g) => g.itens.length);
    const grade = el('div', { class: 'grade g3 pub-grade' });
    const painel = el('div', { class: 'painel-guia', role: 'tabpanel', id: 'painel-pub', tabindex: '0' }, grade);
    const botoes = abas.map((g) => el('button', { type: 'button', role: 'tab', class: 'aba-guia', id: 'aba-pub-' + g.id, 'aria-controls': 'painel-pub' }, g.rotulo));
    function abrir(k) {
      botoes.forEach((b, i) => { b.setAttribute('aria-selected', i === k ? 'true' : 'false'); b.tabIndex = i === k ? 0 : -1; });
      painel.setAttribute('aria-labelledby', botoes[k].id);
      grade.replaceChildren(...abas[k].itens.map(cartaoPublicacao));
    }
    botoes.forEach((b, k) => {
      b.addEventListener('click', () => abrir(k));
      // Setas do teclado trocam de aba (padrão de abas acessíveis).
      b.addEventListener('keydown', (ev) => {
        if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
        const n = (k + (ev.key === 'ArrowRight' ? 1 : -1) + botoes.length) % botoes.length;
        abrir(n); botoes[n].focus();
      });
    });
    abrir(0);
    const c = S.conf;
    return el('section', { class: 'secao', 'aria-labelledby': 'tit-pub' }, el('div', { class: 'limite' },
      el('div', { class: 'secao-titulo' }, el('h2', { id: 'tit-pub' }, 'Últimas publicações'),
        el('span', { class: 'pub-links' },
          c.diario_oficial_url ? el('a', { class: 'botao botao-claro pub-diario', href: c.diario_oficial_url, target: '_blank', rel: 'noopener' },
            'Diário Oficial', el('span', { class: 'sr' }, ' (abre em nova aba)'), el('span', { 'aria-hidden': 'true' }, ' ↗')) : null,
          el('a', { href: '#/publicacoes' }, 'Todas as publicações →'))),
      el('div', { class: 'abas-guia', role: 'tablist', 'aria-label': 'Tipo de publicação' }, botoes),
      painel));
  }

  // Carrossel acessível: pausa ao passar o mouse/focar, botão de pausa, sem rodar se o usuário pede menos movimento.
  // Banners deslizam para o lado (trilho com translateX). Os que estão fora da tela
  // ficam "inert": o teclado e o leitor de tela só alcançam o banner visível.
  function carrossel(lista) {
    let atual = 0, timer = null, pausado = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const slides = lista.map((b, k) => {
      const img = el('img', { src: b.imagem_url, alt: b.titulo, loading: k ? 'lazy' : 'eager' });
      const destino = b.noticia_id ? '#/noticia/' + b.noticia_id : b.link_url;
      const externo = !b.noticia_id && b.link_url && /^https?:/.test(b.link_url);
      return el('div', { class: 'banner-slide', role: 'group', 'aria-roledescription': 'slide', 'aria-label': (k + 1) + ' de ' + lista.length, 'aria-hidden': k ? 'true' : null, inert: k ? true : null },
        destino ? el('a', { href: destino, target: externo ? '_blank' : null, rel: externo ? 'noopener' : null }, img) : img);
    });
    const trilho = el('div', { class: 'banner-trilho' }, slides);
    const pontos = lista.map((b, k) => el('button', { type: 'button', 'aria-label': 'Banner ' + (k + 1), 'aria-current': k ? 'false' : 'true', onclick: () => ir(k) }));
    const btnPausa = el('button', { type: 'button', 'aria-label': 'Pausar a troca automática' }, '❚❚');
    function ir(k) {
      atual = (k + lista.length) % lista.length;
      trilho.style.transform = 'translateX(' + (-100 * atual) + '%)';
      slides.forEach((s, i) => {
        if (i === atual) { s.removeAttribute('aria-hidden'); s.inert = false; }
        else { s.setAttribute('aria-hidden', 'true'); s.inert = true; }
      });
      pontos.forEach((p, i) => p.setAttribute('aria-current', i === atual ? 'true' : 'false'));
    }
    const iniciar = () => { clearInterval(timer); if (!pausado && lista.length > 1) timer = setInterval(() => ir(atual + 1), 7000); };
    btnPausa.addEventListener('click', () => {
      pausado = !pausado;
      btnPausa.textContent = pausado ? '▶' : '❚❚';
      btnPausa.setAttribute('aria-label', pausado ? 'Retomar a troca automática' : 'Pausar a troca automática');
      iniciar();
    });
    // Deslizar com o dedo no celular.
    let toqueX = null;
    trilho.addEventListener('touchstart', (ev) => { toqueX = ev.touches[0].clientX; clearInterval(timer); }, { passive: true });
    trilho.addEventListener('touchend', (ev) => {
      if (toqueX === null) return;
      const dx = ev.changedTouches[0].clientX - toqueX;
      if (Math.abs(dx) > 40) ir(atual + (dx < 0 ? 1 : -1));
      toqueX = null; iniciar();
    });
    const caixa = el('section', { class: 'banner', 'aria-roledescription': 'carrossel', 'aria-label': 'Destaques' }, trilho,
      lista.length > 1 ? el('div', { class: 'banner-controles' },
        el('button', { type: 'button', 'aria-label': 'Banner anterior', onclick: () => ir(atual - 1) }, '‹'),
        el('span', { class: 'banner-pontos' }, pontos), btnPausa,
        el('button', { type: 'button', 'aria-label': 'Próximo banner', onclick: () => ir(atual + 1) }, '›')) : null);
    caixa.addEventListener('mouseenter', () => clearInterval(timer));
    caixa.addEventListener('mouseleave', iniciar);
    caixa.addEventListener('focusin', () => clearInterval(timer));
    caixa.addEventListener('focusout', iniciar);
    iniciar();
    return caixa;
  }

  // ===================================================================
  // NOTÍCIAS
  // ===================================================================
  R.noticias = async function (main, partes, params) {
    S.titulo('Notícias'); S.trilha(['Notícias']);
    await S.carregarUnidades();
    const f = { busca: params.get('q') || '', categoria: '', unidade: params.get('unidade') || '', de: '', ate: '' };
    const LOTE = 12;
    let itens = [];
    const { data: cats } = await sb.from('noticias').select('categoria').eq('orgao_id', org()).not('categoria', 'is', null).limit(1000);
    const categorias = [...new Set((cats || []).map((x) => x.categoria))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const montar = () => {
      let q = sb.from('noticias').select('id, titulo, resumo, capa_url, capa_legenda, categoria, publicado_em').eq('orgao_id', org());
      if (f.busca) q = q.ilike('busca', termo(f.busca));
      if (f.categoria) q = q.eq('categoria', f.categoria);
      if (f.unidade) q = q.or('unidade_id.eq.' + f.unidade + ',unidades_relacionadas.cs.{' + f.unidade + '}');
      if (f.de) q = q.gte('publicado_em', new Date(f.de + 'T00:00:00').toISOString());
      if (f.ate) q = q.lt('publicado_em', new Date(new Date(f.ate + 'T00:00:00').getTime() + 864e5).toISOString());
      return q;
    };
    const grade = el('div', { class: 'grade g3' });
    const mais = el('div', { class: 'mais' });
    async function carregar(reiniciar) {
      if (reiniciar) itens = [];
      const lote = await paginar(montar, 'publicado_em', itens[itens.length - 1], LOTE);
      itens = itens.concat(lote);
      grade.replaceChildren(...itens.map((n) => cartaoNoticia(n)));
      if (!itens.length) grade.replaceChildren(el('p', { class: 'vazio' }, 'Nenhuma notícia encontrada.'));
      const btn = el('button', { type: 'button', class: 'botao botao-claro' }, 'Carregar mais notícias');
      btn.addEventListener('click', async () => { btn.disabled = true; btn.textContent = 'Carregando…'; await carregar(false); });
      mais.replaceChildren(lote.length === LOTE ? btn : '');
    }
    const fBusca = el('input', { type: 'search', value: f.busca, placeholder: 'Assunto' });
    const fCat = el('select', null, el('option', { value: '' }, 'Todas'), categorias.map((x) => el('option', { value: x }, x)));
    const fUn = el('select', null, el('option', { value: '' }, 'Todas'),
      [...S.unidades].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map((u) => el('option', { value: u.id, selected: f.unidade === u.id }, u.nome)));
    const fDe = el('input', { type: 'date' }), fAte = el('input', { type: 'date' });
    let espera;
    const aplicar = () => { Object.assign(f, { busca: fBusca.value.trim(), categoria: fCat.value, unidade: fUn.value, de: fDe.value, ate: fAte.value }); carregar(true); };
    fBusca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(aplicar, 400); });
    [fCat, fUn, fDe, fAte].forEach((x) => x.addEventListener('change', aplicar));
    pagina(main, el('h1', null, 'Notícias'),
      el('form', { class: 'filtros', role: 'search', onsubmit: (e) => { e.preventDefault(); aplicar(); } },
        el('label', null, 'Pesquisar', fBusca), el('label', null, 'Categoria', fCat), el('label', null, 'Secretaria', fUn),
        el('label', null, 'De', fDe), el('label', null, 'Até', fAte)),
      grade, mais);
    await carregar(true);
  };

  R.noticia = async function (main, partes) {
    const { data: n } = await sb.from('noticias').select('*').eq('orgao_id', org()).eq('id', partes[0]).maybeSingle();
    if (!n) return R['*'](main);
    await S.carregarUnidades();
    S.titulo(n.titulo); S.trilha(['Notícias', '#/noticias'], [n.titulo]);
    const secretarias = [n.unidade_id].concat(n.unidades_relacionadas || []).filter(Boolean);
    const url = location.href;
    // Conta a leitura uma vez por notícia em cada sessão do navegador.
    let jaContou = false;
    try { jaContou = sessionStorage.getItem('vis_' + n.id) === '1'; sessionStorage.setItem('vis_' + n.id, '1'); } catch (e) { /* sem armazenamento */ }
    if (!jaContou) await sb.rpc('registrar_visualizacao', { p_noticia: n.id });
    const vis = await visualizacoes([n.id]);
    // Relacionadas: mesma categoria ou mesma secretaria; completa com as mais recentes.
    const campos = 'id, titulo, resumo, capa_url, capa_legenda, categoria, publicado_em';
    const filtros = [n.categoria ? 'categoria.eq."' + n.categoria.replace(/"/g, '') + '"' : null, n.unidade_id ? 'unidade_id.eq.' + n.unidade_id : null].filter(Boolean);
    let outras = [];
    if (filtros.length) {
      const r = await sb.from('noticias').select(campos).eq('orgao_id', org()).neq('id', n.id).or(filtros.join(','))
        .order('publicado_em', { ascending: false }).limit(3);
      outras = r.data || [];
    }
    if (outras.length < 3) {
      const r = await sb.from('noticias').select(campos).eq('orgao_id', org()).neq('id', n.id)
        .order('publicado_em', { ascending: false }).limit(6);
      outras = outras.concat((r.data || []).filter((x) => !outras.some((o) => o.id === x.id))).slice(0, 3);
    }
    pagina(main, el('article', { class: 'artigo' },
      el('span', { class: 'meta' }, (n.categoria ? n.categoria + ' · ' : '') + 'Publicada em ' + dataLonga(n.publicado_em) +
        (n.atualizado_em && new Date(n.atualizado_em) - new Date(n.publicado_em) > 36e5 ? ' · atualizada em ' + dataBR(n.atualizado_em) : '') +
        (vis[n.id] ? ' · ' + vis[n.id].toLocaleString('pt-BR') + ' visualizações' : '')),
      el('h1', null, n.titulo),
      n.resumo ? el('p', { class: 'resumo' }, n.resumo) : null,
      secretarias.length ? el('p', { class: 'meta' }, 'Secretaria' + (secretarias.length > 1 ? 's' : '') + ': ',
        secretarias.map((id, k) => [k ? ', ' : '', el('a', { href: '#/unidade/' + id }, S.nomeUnidade(id))])) : null,
      n.capa_url ? el('figure', { class: 'artigo-capa' }, el('img', { src: n.capa_url, alt: n.capa_legenda || '' }),
        n.capa_legenda ? el('figcaption', null, n.capa_legenda) : null) : null,
      texto(n.conteudo),
      el('div', { class: 'compartilhar' }, el('span', { class: 'meta' }, 'Compartilhar:'),
        el('a', { class: 'botao botao-claro', href: 'https://wa.me/?text=' + encodeURIComponent(n.titulo + ' ' + url), target: '_blank', rel: 'noopener' }, 'WhatsApp'),
        el('a', { class: 'botao botao-claro', href: 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url), target: '_blank', rel: 'noopener' }, 'Facebook'),
        el('button', { type: 'button', class: 'botao botao-claro', onclick: (ev) => { navigator.clipboard && navigator.clipboard.writeText(url); ev.target.textContent = 'Link copiado'; } }, 'Copiar link'))),
      outras.length ? el('section', { style: 'margin-top:40px' }, el('h2', null, 'Notícias relacionadas'), el('div', { class: 'grade g3' }, outras.map((x) => cartaoNoticia(x)))) : null);
  };

  // ===================================================================
  // PUBLICAÇÕES OFICIAIS (2.6 atos normativos) — filtros, total e exportação
  // ===================================================================
  R.publicacoes = async function (main, partes, params) {
    S.titulo('Publicações oficiais'); S.trilha(['Publicações oficiais']);
    const f = { busca: params.get('q') || '', tipo: '', ano: '', vigencia: '' };
    const LOTE = 20;
    let itens = [];
    const montar = (sel, op) => {
      let q = sb.from('publicacoes').select(sel || 'id, tipo, numero, ano, data_publicacao, ementa, vigencia, observacao, arquivo_url, link_externo', op).eq('orgao_id', org());
      if (f.busca) q = q.ilike('busca', termo(f.busca));
      if (f.tipo) q = q.eq('tipo', f.tipo);
      if (f.ano) q = q.eq('ano', parseInt(f.ano, 10));
      if (f.vigencia) q = q.eq('vigencia', f.vigencia);
      return q;
    };
    const corpo = el('tbody');
    const totalTxt = el('span', { class: 'meta', role: 'status' });
    const mais = el('div', { class: 'mais' });
    async function carregar(reiniciar) {
      if (reiniciar) {
        itens = [];
        const { count } = await montar('id', { count: 'exact', head: true });
        totalTxt.textContent = (count || 0) + (count === 1 ? ' publicação encontrada' : ' publicações encontradas');
      }
      const lote = await paginar(() => montar(), 'data_publicacao', itens[itens.length - 1], LOTE);
      itens = itens.concat(lote);
      corpo.replaceChildren(...itens.map((p) => {
        const doc = p.arquivo_url || p.link_externo;
        return el('tr', null,
          el('td', null, el('strong', null, ato(p))),
          el('td', null, p.ementa, p.observacao ? el('span', { class: 'meta', style: 'display:block' }, p.observacao) : null),
          el('td', null, dataBR(p.data_publicacao)),
          el('td', null, el('span', { class: 'etiqueta ' + COR_VIG[p.vigencia] }, VIGENCIA[p.vigencia])),
          el('td', null, doc ? el('a', { href: doc, target: '_blank', rel: 'noopener' }, p.arquivo_url ? 'PDF' : 'Abrir', el('span', { class: 'sr' }, ' de ' + ato(p) + ' (abre em nova aba)')) : '—'));
      }));
      if (!itens.length) corpo.replaceChildren(el('tr', null, el('td', { colspan: 5, class: 'vazio' }, 'Nenhuma publicação encontrada.')));
      const btn = el('button', { type: 'button', class: 'botao botao-claro' }, 'Carregar mais');
      btn.addEventListener('click', async () => { btn.disabled = true; btn.textContent = 'Carregando…'; await carregar(false); });
      mais.replaceChildren(lote.length === LOTE ? btn : '');
    }
    const fBusca = el('input', { type: 'search', value: f.busca, placeholder: 'Número ou assunto' });
    const fTipo = el('select', null, el('option', { value: '' }, 'Todos'), Object.entries(TIPOS).map(([k, v]) => el('option', { value: k }, v)));
    const fAno = el('input', { type: 'number', min: 1900, max: 2100, placeholder: 'Ex.: 2026' });
    const fVig = el('select', null, el('option', { value: '' }, 'Todas'), Object.entries(VIGENCIA).map(([k, v]) => el('option', { value: k }, v)));
    let espera;
    const aplicar = () => { Object.assign(f, { busca: fBusca.value.trim(), tipo: fTipo.value, ano: fAno.value, vigencia: fVig.value }); carregar(true); };
    [fBusca, fAno].forEach((x) => x.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(aplicar, 400); }));
    [fTipo, fVig].forEach((x) => x.addEventListener('change', aplicar));
    const colunas = [['tipo', 'Tipo', (v) => TIPOS[v] || v], ['numero', 'Número'], ['ano', 'Ano'], ['data_publicacao', 'Data de publicação'],
      ['ementa', 'Ementa'], ['vigencia', 'Situação', (v) => VIGENCIA[v]], ['observacao', 'Observação'], ['documento', 'Documento', (v, r) => r.arquivo_url || r.link_externo || '']];
    const exportar = S.botoesExportar('publicacoes-oficiais', colunas, async (de, ate) => {
      const { data } = await montar().order('data_publicacao', { ascending: false }).order('id').range(de, ate);
      return data || [];
    });
    const c = S.conf;
    pagina(main, el('h1', null, 'Publicações oficiais'),
      el('p', { class: 'sub' }, 'Leis, decretos, portarias e demais atos normativos.',
        c.diario_oficial_url ? [' A íntegra das edições do Diário Oficial está em ', el('a', { href: '#/diario-oficial' }, c.diario_oficial_nome || 'Diário Oficial'), '.'] : null),
      el('form', { class: 'filtros', role: 'search', onsubmit: (e) => { e.preventDefault(); aplicar(); } },
        el('label', null, 'Pesquisar', fBusca), el('label', null, 'Tipo', fTipo), el('label', null, 'Ano', fAno), el('label', null, 'Situação', fVig)),
      el('div', { class: 'barra-lista' }, totalTxt, exportar),
      el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela' },
        el('caption', { class: 'sr' }, 'Publicações oficiais'),
        el('thead', null, el('tr', null, ['Ato', 'Ementa', 'Data', 'Situação', 'Documento'].map((t) => el('th', { scope: 'col' }, t)))), corpo)),
      mais);
    await carregar(true);
  };

  R['diario-oficial'] = async function (main) {
    S.titulo('Diário Oficial'); S.trilha(['Diário Oficial']);
    const c = S.conf;
    pagina(main, el('h1', null, 'Diário Oficial'),
      c.diario_oficial_url
        ? [el('p', null, 'Os atos oficiais deste órgão são publicados no ', el('strong', null, c.diario_oficial_nome || 'Diário Oficial'), ', sistema externo onde ficam as edições completas.'),
          el('p', null, el('a', { class: 'botao', href: c.diario_oficial_url, target: '_blank', rel: 'noopener' }, 'Acessar o Diário Oficial', el('span', { class: 'sr' }, ' (abre em nova aba)')))]
        : el('p', null, 'Endereço do Diário Oficial ainda não informado.'),
      el('p', null, 'Leis, decretos e portarias também podem ser pesquisados em ', el('a', { href: '#/publicacoes' }, 'Publicações oficiais'), '.'));
  };

  // ===================================================================
  // ESTRUTURA, UNIDADES E GESTORES (2.1 a 2.5)
  // ===================================================================
  async function gestoresAtivos() {
    const { data } = await sb.from('gestores').select('*').eq('orgao_id', org()).order('ordem').order('nome').limit(500);
    return data || [];
  }
  function cartaoGestor(g) {
    const ini = (g.nome || '?').split(' ').filter(Boolean).map((p) => p[0]).slice(0, 2).join('');
    return el('div', { class: 'cartao gestor' },
      g.foto_url ? el('img', { src: g.foto_url, alt: 'Foto de ' + g.nome, loading: 'lazy' }) : el('span', { class: 'sem-foto', 'aria-hidden': 'true' }, ini),
      el('strong', { style: 'display:block' }, g.nome),
      el('span', { class: 'meta', style: 'display:block' }, g.cargo),
      g.unidade_id && S.nomeUnidade(g.unidade_id) ? el('a', { href: '#/unidade/' + g.unidade_id, style: 'display:block;font-size:.9rem' }, S.nomeUnidade(g.unidade_id)) : null,
      g.email ? el('a', { href: 'mailto:' + g.email, style: 'display:block;font-size:.9rem' }, g.email) : null,
      g.telefone ? el('span', { class: 'meta', style: 'display:block' }, g.telefone) : null,
      g.curriculo_url ? el('a', { href: g.curriculo_url, target: '_blank', rel: 'noopener', style: 'display:block;font-size:.9rem' }, 'Currículo (PDF)') : null);
  }

  R.estrutura = async function (main) {
    S.titulo('Estrutura organizacional'); S.trilha(['Estrutura organizacional']);
    const [unidades, gestores] = await Promise.all([S.carregarUnidades(), gestoresAtivos()]);
    const ativas = unidades.filter((u) => u.ativo !== false);
    const responsavel = (id) => gestores.find((g) => g.unidade_id === id);
    const filhos = (pai) => ativas.filter((u) => (u.unidade_pai_id || null) === pai).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    const no = (u) => {
      const r = responsavel(u.id);
      const sub = filhos(u.id);
      return el('li', null, el('a', { href: '#/unidade/' + u.id }, el('strong', null, u.nome)),
        r ? el('span', { class: 'meta' }, ' — ' + r.nome + (r.cargo ? ', ' + r.cargo : '')) : null,
        sub.length ? el('ul', null, sub.map(no)) : null);
    };
    const c = S.conf;
    const colunas = [['nome', 'Unidade'], ['sigla', 'Sigla'], ['responsavel', 'Responsável', (v, u) => (responsavel(u.id) || {}).nome || ''],
      ['endereco', 'Endereço'], ['telefone', 'Telefone'], ['email', 'E-mail'], ['horario_atendimento', 'Horário'],
      ['competencias', 'Competências'], ['norma_criacao', 'Norma de criação'], ['norma_url', 'Link da norma']];
    pagina(main, el('h1', null, 'Estrutura organizacional'),
      el('p', { class: 'sub' }, 'Unidades administrativas, responsáveis, competências, contatos e horários de atendimento.'),
      c.estrutura_norma || c.estrutura_norma_url ? el('p', { class: 'cartao' }, el('strong', null, 'Norma que institui a estrutura: '),
        c.estrutura_norma_url ? el('a', { href: c.estrutura_norma_url, target: '_blank', rel: 'noopener' }, c.estrutura_norma || 'Abrir') : c.estrutura_norma) : null,
      el('div', { class: 'barra-lista' }, el('span', { class: 'meta' }, ativas.length + ' unidades'),
        S.botoesExportar('estrutura-organizacional', colunas, async (de) => de ? [] : ativas)),
      ativas.length ? el('ul', { class: 'arvore' }, filhos(null).map(no)) : el('p', { class: 'vazio' }, 'Estrutura em cadastramento.'));
  };

  R.unidade = async function (main, partes) {
    const [unidades, gestores] = await Promise.all([S.carregarUnidades(), gestoresAtivos()]);
    const u = unidades.find((x) => x.id === partes[0]);
    if (!u) return R['*'](main);
    S.titulo(u.nome); S.trilha(['Estrutura organizacional', '#/estrutura'], [u.nome]);
    const daUnidade = gestores.filter((g) => g.unidade_id === u.id);
    const pai = unidades.find((x) => x.id === u.unidade_pai_id);
    const [nt, sv] = await Promise.all([
      sb.from('noticias').select('id, titulo, resumo, capa_url, capa_legenda, categoria, publicado_em').eq('orgao_id', org())
        .or('unidade_id.eq.' + u.id + ',unidades_relacionadas.cs.{' + u.id + '}').order('publicado_em', { ascending: false }).limit(3),
      sb.from('servicos').select('id, nome, forma_prestacao').eq('orgao_id', org()).eq('unidade_id', u.id).order('nome').limit(30)
    ]);
    const c = S.conf;
    pagina(main, el('h1', null, u.nome),
      pai ? el('p', { class: 'meta' }, 'Vinculada a: ', el('a', { href: '#/unidade/' + pai.id }, pai.nome)) : null,
      el('div', { class: 'grade g2', style: 'margin-top:16px' },
        el('div', { class: 'cartao' }, el('h2', null, 'Contato e atendimento'),
          el('dl', { class: 'dados' },
            u.sigla ? [el('dt', null, 'Sigla'), el('dd', null, u.sigla)] : null,
            el('dt', null, 'Endereço'), el('dd', null, u.endereco || c.endereco || '—'),
            el('dt', null, 'Telefone'), el('dd', null, u.telefone || c.telefone || '—'),
            el('dt', null, 'E-mail'), el('dd', null, (u.email || c.email) ? el('a', { href: 'mailto:' + (u.email || c.email) }, u.email || c.email) : '—'),
            el('dt', null, 'Horário'), el('dd', null, u.horario_atendimento || c.horario || '—'),
            u.norma_criacao || u.norma_url ? [el('dt', null, 'Norma de criação'), el('dd', null,
              u.norma_url ? el('a', { href: u.norma_url, target: '_blank', rel: 'noopener' }, u.norma_criacao || 'Abrir') : u.norma_criacao)] : null)),
        el('div', null, el('h2', null, daUnidade.length > 1 ? 'Responsáveis' : 'Responsável'),
          daUnidade.length ? el('div', { class: 'grade' + (daUnidade.length > 1 ? ' g2' : '') }, daUnidade.map(cartaoGestor)) : el('p', { class: 'vazio' }, 'Responsável em designação.'))),
      el('section', { style: 'margin-top:28px' }, el('h2', null, 'Competências e atribuições'),
        u.competencias ? texto(u.competencias) : el('p', { class: 'vazio' }, 'Competências em cadastramento.')),
      sv.data && sv.data.length ? el('section', { style: 'margin-top:28px' }, el('h2', null, 'Serviços desta unidade'),
        el('ul', null, sv.data.map((s) => el('li', null, el('a', { href: '#/servico/' + s.id }, s.nome), el('span', { class: 'meta' }, ' · ' + FORMAS[s.forma_prestacao]))))) : null,
      nt.data && nt.data.length ? el('section', { style: 'margin-top:28px' },
        el('div', { class: 'secao-titulo' }, el('h2', null, 'Notícias'), el('a', { href: '#/noticias?unidade=' + u.id }, 'Todas desta unidade →')),
        el('div', { class: 'grade g3' }, nt.data.map((n) => cartaoNoticia(n)))) : null);
  };

  R.gestores = async function (main) {
    S.titulo('Gestores'); S.trilha(['Gestores']);
    await S.carregarUnidades();
    const gestores = await gestoresAtivos();
    pagina(main, el('h1', null, 'Gestores e responsáveis'),
      el('p', { class: 'sub' }, 'Atuais responsáveis pela gestão do órgão e de cada unidade.'),
      gestores.length ? el('div', { class: 'grade g4' }, gestores.map(cartaoGestor)) : el('p', { class: 'vazio' }, 'Em cadastramento.'));
  };

  // ===================================================================
  // CARTA DE SERVIÇOS (14.3) e serviços pela internet (15.3)
  // ===================================================================
  R.servicos = async function (main, partes, params) {
    S.titulo('Carta de Serviços'); S.trilha(['Carta de Serviços']);
    await S.carregarUnidades();
    const { data: carta } = await sb.from('carta_servicos').select('*').eq('orgao_id', org()).maybeSingle();
    const { data: areasD } = await sb.from('servicos').select('categoria').eq('orgao_id', org()).not('categoria', 'is', null).limit(1000);
    const areas = [...new Set((areasD || []).map((x) => x.categoria))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const f = { busca: params.get('q') || '', area: '', unidade: '', forma: '' };
    const LOTE = 30;
    let itens = [];
    const montar = (sel, op) => {
      let q = sb.from('servicos').select(sel || 'id, nome, categoria, unidade_id, forma_prestacao, prazo_maximo, custo', op).eq('orgao_id', org());
      if (f.busca) q = q.ilike('busca', termo(f.busca));
      if (f.area) q = q.eq('categoria', f.area);
      if (f.unidade) q = q.eq('unidade_id', f.unidade);
      if (f.forma === 'internet') q = q.in('forma_prestacao', ['digital', 'presencial_digital']);
      if (f.forma === 'presencial') q = q.eq('forma_prestacao', 'presencial');
      return q;
    };
    const lista = el('div', { class: 'grade g3' });
    const totalTxt = el('span', { class: 'meta', role: 'status' });
    const mais = el('div', { class: 'mais' });
    async function carregar(reiniciar) {
      if (reiniciar) {
        itens = [];
        const { count } = await montar('id', { count: 'exact', head: true });
        totalTxt.textContent = (count || 0) + (count === 1 ? ' serviço' : ' serviços');
      }
      const lote = await paginar(() => montar(), 'nome', itens[itens.length - 1], LOTE, true);
      itens = itens.concat(lote);
      lista.replaceChildren(...itens.map((s) => el('a', { class: 'cartao', href: '#/servico/' + s.id },
        el('span', { class: 'meta' }, s.categoria || 'Serviço'),
        el('h3', { style: 'margin:4px 0' }, s.nome),
        el('span', { class: 'etiqueta' + (s.forma_prestacao !== 'presencial' ? ' etiqueta-verde' : '') }, FORMAS[s.forma_prestacao]),
        s.prazo_maximo ? el('span', { class: 'meta', style: 'display:block;margin-top:6px' }, 'Prazo: ' + s.prazo_maximo) : null,
        s.unidade_id ? el('span', { class: 'meta', style: 'display:block' }, S.nomeUnidade(s.unidade_id)) : null)));
      if (!itens.length) lista.replaceChildren(el('p', { class: 'vazio' }, 'Nenhum serviço encontrado.'));
      const btn = el('button', { type: 'button', class: 'botao botao-claro' }, 'Carregar mais');
      btn.addEventListener('click', async () => { btn.disabled = true; btn.textContent = 'Carregando…'; await carregar(false); });
      mais.replaceChildren(lote.length === LOTE ? btn : '');
    }
    const fBusca = el('input', { type: 'search', value: f.busca, placeholder: 'Ex.: IPTU, matrícula, consulta' });
    const fArea = el('select', null, el('option', { value: '' }, 'Todas'), areas.map((a) => el('option', { value: a }, a)));
    const fUn = el('select', null, el('option', { value: '' }, 'Todas'),
      [...S.unidades].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map((u) => el('option', { value: u.id }, u.nome)));
    const fForma = el('select', null, el('option', { value: '' }, 'Todas'), el('option', { value: 'internet' }, 'Pedido pela internet'), el('option', { value: 'presencial' }, 'Só presencial'));
    let espera;
    const aplicar = () => { Object.assign(f, { busca: fBusca.value.trim(), area: fArea.value, unidade: fUn.value, forma: fForma.value }); carregar(true); };
    fBusca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(aplicar, 400); });
    [fArea, fUn, fForma].forEach((x) => x.addEventListener('change', aplicar));
    const colunas = [['nome', 'Serviço'], ['categoria', 'Área'], ['unidade_id', 'Unidade', (v) => S.nomeUnidade(v)], ['descricao', 'Descrição'],
      ['publico_alvo', 'Quem pode pedir'], ['requisitos', 'Requisitos e documentos'], ['etapas', 'Etapas'], ['prazo_maximo', 'Prazo máximo'],
      ['forma_prestacao', 'Forma', (v) => FORMAS[v]], ['link_digital', 'Endereço na internet'], ['local_atendimento', 'Local'], ['horario', 'Horário'], ['custo', 'Custo']];
    pagina(main, el('h1', null, 'Carta de Serviços ao Usuário'),
      carta && carta.apresentacao ? texto(carta.apresentacao) : el('p', { class: 'sub' }, 'Serviços prestados, como pedir, documentos, prazos e onde se manifestar (Lei 13.460/2017).'),
      el('form', { class: 'filtros', role: 'search', onsubmit: (e) => { e.preventDefault(); aplicar(); } },
        el('label', null, 'Pesquisar serviço', fBusca), el('label', null, 'Área', fArea), el('label', null, 'Secretaria', fUn), el('label', null, 'Forma', fForma)),
      el('div', { class: 'barra-lista' }, totalTxt, S.botoesExportar('carta-de-servicos', colunas, async (de, ate) => {
        const { data } = await montar('*').order('nome').range(de, ate); return data || [];
      })),
      lista, mais,
      carta && carta.compromissos ? el('section', { class: 'cartao', style: 'margin-top:32px' }, el('h2', null, 'Compromissos de qualidade do atendimento'), texto(carta.compromissos)) : null,
      carta && carta.manifestacao ? el('section', { class: 'cartao', style: 'margin-top:16px' }, el('h2', null, 'Elogios, sugestões e reclamações'), texto(carta.manifestacao)) : null);
    await carregar(true);
  };

  R.servico = async function (main, partes) {
    const { data: s } = await sb.from('servicos').select('*').eq('orgao_id', org()).eq('id', partes[0]).maybeSingle();
    if (!s) return R['*'](main);
    await S.carregarUnidades();
    const { data: carta } = await sb.from('carta_servicos').select('manifestacao').eq('orgao_id', org()).maybeSingle();
    S.titulo(s.nome); S.trilha(['Carta de Serviços', '#/servicos'], [s.nome]);
    const c = S.conf;
    const bloco = (titulo, conteudo) => conteudo ? el('section', { class: 'servico-bloco' }, el('h2', null, titulo), typeof conteudo === 'string' ? texto(conteudo) : conteudo) : null;
    pagina(main, el('article', { class: 'artigo' },
      el('span', { class: 'meta' }, s.categoria || 'Serviço'),
      el('h1', null, s.nome),
      s.unidade_id ? el('p', { class: 'meta' }, 'Responsável: ', el('a', { href: '#/unidade/' + s.unidade_id }, S.nomeUnidade(s.unidade_id))) : null,
      s.link_digital ? el('p', null, el('a', { class: 'botao', href: s.link_digital, target: '_blank', rel: 'noopener' }, 'Solicitar pela internet', el('span', { class: 'sr' }, ' (abre em nova aba)'))) : null,
      bloco('O que é', s.descricao),
      bloco('Quem pode pedir', s.publico_alvo),
      bloco('Requisitos e documentos necessários', s.requisitos),
      bloco('Principais etapas', s.etapas),
      bloco('Prazo e custo', el('dl', { class: 'dados' },
        el('dt', null, 'Prazo máximo'), el('dd', null, s.prazo_maximo || 'Não informado'),
        el('dt', null, 'Custo'), el('dd', null, s.custo || 'Não informado'))),
      bloco('Onde e quando', el('dl', { class: 'dados' },
        el('dt', null, 'Forma'), el('dd', null, FORMAS[s.forma_prestacao]),
        s.forma_prestacao !== 'digital' ? [el('dt', null, 'Local'), el('dd', null, s.local_atendimento || c.endereco || '—'),
          el('dt', null, 'Horário'), el('dd', null, s.horario || c.horario || '—')] : null,
        s.prioridades ? [el('dt', null, 'Prioridade'), el('dd', null, s.prioridades)] : null,
        s.tempo_espera ? [el('dt', null, 'Tempo de espera'), el('dd', null, s.tempo_espera)] : null)),
      bloco('Reclamações, sugestões e elogios', s.manifestacao || (carta && carta.manifestacao) || 'Procure a Ouvidoria pelo menu Atendimento.'),
      el('p', { class: 'meta' }, 'Informações atualizadas em ' + dataBR(s.atualizado_em) + '.')));
  };

  // ===================================================================
  // PERGUNTAS FREQUENTES (2.7) e PÁGINAS LIVRES
  // ===================================================================
  R.faq = async function (main) {
    S.titulo('Perguntas frequentes'); S.trilha(['Perguntas frequentes']);
    const { data } = await sb.from('faq').select('*').eq('orgao_id', org()).order('ordem').order('pergunta').limit(500);
    const faq = data || [];
    const caixa = el('div');
    const desenhar = (filtro) => {
      const f = normalizar(filtro);
      const lista = faq.filter((q) => !f || normalizar(q.pergunta + ' ' + q.resposta + ' ' + (q.categoria || '')).includes(f));
      const grupos = {};
      lista.forEach((q) => { (grupos[q.categoria || 'Geral'] = grupos[q.categoria || 'Geral'] || []).push(q); });
      caixa.replaceChildren(...Object.keys(grupos).sort((a, b) => a.localeCompare(b, 'pt-BR')).map((g) => el('section', { style: 'margin-bottom:22px' },
        el('h2', null, g), grupos[g].map((q) => el('details', { class: 'faq' }, el('summary', null, q.pergunta), el('div', null, texto(q.resposta)))))));
      if (!lista.length) caixa.replaceChildren(el('p', { class: 'vazio' }, faq.length ? 'Nenhuma pergunta encontrada.' : 'Em cadastramento.'));
    };
    const busca = el('input', { type: 'search', placeholder: 'Pesquisar nas perguntas' });
    busca.addEventListener('input', () => desenhar(busca.value));
    pagina(main, el('h1', null, 'Perguntas frequentes'),
      el('form', { class: 'filtros', style: 'grid-template-columns:1fr', role: 'search', onsubmit: (e) => e.preventDefault() }, el('label', null, 'Pesquisar', busca)),
      caixa);
    desenhar('');
  };

  R.pagina = async function (main, partes) {
    const { data: p } = await sb.from('paginas').select('*').eq('orgao_id', org()).eq('slug', partes[0] || '').maybeSingle();
    if (!p) return R['*'](main);
    S.titulo(p.titulo); S.trilha([p.titulo]);
    pagina(main, el('article', { class: 'artigo' }, el('h1', null, p.titulo), texto(p.conteudo),
      el('p', { class: 'meta', style: 'margin-top:24px' }, 'Atualizada em ' + dataBR(p.atualizado_em) + '.')));
  };

  // ===================================================================
  // LGPD (15.1, 15.2, 15.5) e DADOS ABERTOS (15.4)
  // ===================================================================
  R.lgpd = async function (main) {
    S.titulo('Proteção de dados pessoais'); S.trilha(['Proteção de dados (LGPD)']);
    const l = S.lgpd || {};
    let norma = null;
    if (l.gov_digital_publicacao) {
      const { data } = await sb.from('publicacoes').select('*').eq('id', l.gov_digital_publicacao).maybeSingle();
      norma = data;
    }
    const normaDoc = norma && (norma.arquivo_url || norma.link_externo);
    pagina(main, el('h1', null, 'Proteção de dados pessoais (LGPD)'),
      el('section', { class: 'cartao', style: 'margin:18px 0' }, el('h2', null, 'Encarregado pelo tratamento de dados pessoais'),
        l.encarregado_nome ? el('dl', { class: 'dados' },
          el('dt', null, 'Nome'), el('dd', null, l.encarregado_nome),
          l.encarregado_cargo ? [el('dt', null, 'Cargo'), el('dd', null, l.encarregado_cargo)] : null,
          l.encarregado_email ? [el('dt', null, 'E-mail'), el('dd', null, el('a', { href: 'mailto:' + l.encarregado_email }, l.encarregado_email))] : null,
          l.encarregado_telefone ? [el('dt', null, 'Telefone'), el('dd', null, l.encarregado_telefone)] : null,
          l.encarregado_ato ? [el('dt', null, 'Designação'), el('dd', null, l.encarregado_ato_url ? el('a', { href: l.encarregado_ato_url, target: '_blank', rel: 'noopener' }, l.encarregado_ato) : l.encarregado_ato)] : null)
          : el('p', null, 'Encarregado em designação.')),
      el('section', { style: 'margin:28px 0' }, el('h2', null, 'Política de privacidade e proteção de dados'),
        l.politica_texto ? texto(l.politica_texto) : null,
        l.politica_url ? el('p', null, el('a', { href: l.politica_url, target: '_blank', rel: 'noopener' }, 'Política de privacidade em PDF')) : null,
        !l.politica_texto && !l.politica_url ? el('p', { class: 'vazio' }, 'Em elaboração.') : null,
        l.politica_atualizada_em ? el('p', { class: 'meta' }, 'Última atualização: ' + dataBR(l.politica_atualizada_em) + '.') : null),
      el('section', { class: 'cartao' }, el('h2', null, 'Governo Digital (Lei 14.129/2021)'),
        norma ? el('p', null, 'Regulamentada por ', normaDoc ? el('a', { href: normaDoc, target: '_blank', rel: 'noopener' }, ato(norma)) : el('strong', null, ato(norma)), ' — ' + norma.ementa)
          : l.gov_digital_texto || l.gov_digital_url ? el('p', null, 'Regulamentada por ', l.gov_digital_url ? el('a', { href: l.gov_digital_url, target: '_blank', rel: 'noopener' }, l.gov_digital_texto || 'norma do órgão') : l.gov_digital_texto, '.')
            : el('p', null, 'Regulamentação em elaboração.'),
        el('p', null, 'Serviços que podem ser pedidos pela internet estão na ', el('a', { href: '#/servicos' }, 'Carta de Serviços'), '. Regras de uso dos dados em ', el('a', { href: '#/dados-abertos' }, 'Dados abertos'), '.')));
  };

  // Catálogo de dados abertos: download completo (CSV/JSON) e endereço para acesso automatizado.
  R['dados-abertos'] = async function (main) {
    S.titulo('Dados abertos'); S.trilha(['Dados abertos']);
    await S.carregarUnidades();
    const cfg = window.CONFIG_PNTP;
    const api = (tabela, sel, extra) => cfg.supabaseUrl + '/rest/v1/' + tabela + '?select=' + sel + '&orgao_id=eq.' + org() + (extra || '') + '&apikey=' + cfg.supabaseChave;
    const conjuntos = [
      ['Publicações oficiais (atos normativos)', 'publicacoes', 'tipo,numero,ano,data_publicacao,ementa,vigencia,observacao,arquivo_url,link_externo', '&order=data_publicacao.desc'],
      ['Contratos', 'contratos', 'tipo,numero,ano,processo,objeto,contratado_nome,valor_inicial,valor_atual,data_assinatura,vigencia_inicio,vigencia_fim_atual,rescindido_em,unidade_nome,link_externo', '&order=data_assinatura.desc'],
      ['Fiscais de contratos', 'contratos_fiscais', 'nome,funcao,ato,inicio,fim', '&order=nome'],
      ['Licitações', 'licitacoes', 'modalidade,numero,ano,processo,objeto,srp,criterio,amparo_legal,unidade_nome,valor_estimado,valor_homologado,data_publicacao,data_abertura,andamento,vencedores,link_externo', '&order=chave_ordem.asc'],
      ['Plano de contratações anual (PCA)', 'pca', 'ano,tipo,data_aprovacao,ato_aprovacao,valor_total,qtd_itens,descricao,arquivo_url,link_externo', '&order=ano.desc'],
      ['Licitantes e contratados sancionados', 'sancoes', 'sancionado_nome,tipo,fundamento,motivo,processo,referencia,data_aplicacao,inicio,fim,valor_multa,ato,arquivo_url,link_externo', '&order=data_aplicacao.desc'],
      ['Planejamento e prestação de contas', 'documentos_contas', 'tipo,exercicio,exercicio_fim,periodicidade,periodo,parte,resultado,numero_ato,data_publicacao,descricao,arquivo_url,link_externo', '&order=exercicio.desc'],
      ['Carta de Serviços', 'servicos', 'nome,categoria,descricao,publico_alvo,requisitos,etapas,prazo_maximo,forma_prestacao,link_digital,local_atendimento,horario,custo', '&order=nome'],
      ['Estrutura organizacional (unidades)', 'unidades', 'nome,sigla,endereco,telefone,email,horario_atendimento,competencias,norma_criacao,norma_url', '&order=nome'],
      ['Gestores', 'gestores', 'nome,cargo,email,telefone,curriculo_url', '&order=ordem'],
      ['Notícias', 'noticias', 'titulo,resumo,categoria,publicado_em', '&order=publicado_em.desc'],
      ['Perguntas frequentes', 'faq', 'pergunta,resposta,categoria', '&order=ordem']
    ];
    const linhas = conjuntos.map(([nome, tabela, sel, extra]) => {
      const colunas = sel.split(',').map((c) => [c, c]);
      const buscar = async (de, ate) => {
        let q = sb.from(tabela).select(sel).eq('orgao_id', org());
        const ordem = extra.replace('&order=', '').split('.');
        q = q.order(ordem[0], { ascending: ordem[1] !== 'desc' }).range(de, ate);
        const { data } = await q; return data || [];
      };
      const endereco = api(tabela, sel, extra);
      return el('tr', null, el('td', null, el('strong', null, nome)),
        el('td', null, S.botoesExportar(tabela, colunas, buscar)),
        el('td', null, el('code', { style: 'word-break:break-all;font-size:.8rem' }, endereco)));
    });
    const l = S.lgpd || {};
    pagina(main, el('h1', null, 'Dados abertos'),
      el('p', { class: 'sub' }, 'Dados deste site em formato aberto e legível por máquina, para baixar ou para acesso automatizado por outros sistemas.'),
      el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela' },
        el('caption', { class: 'sr' }, 'Conjuntos de dados'),
        el('thead', null, el('tr', null, ['Conjunto de dados', 'Baixar', 'Acesso automatizado (API, formato JSON)'].map((t) => el('th', { scope: 'col' }, t)))),
        el('tbody', null, linhas))),
      el('p', { class: 'meta', style: 'margin-top:10px' }, 'O endereço de acesso automatizado responde em JSON e aceita filtros e ordenação no padrão PostgREST (ex.: &ano=eq.2026).'),
      el('section', { style: 'margin-top:28px' }, el('h2', null, 'Regras de utilização'),
        l.dados_abertos_texto ? texto(l.dados_abertos_texto) : el('p', null, 'Uso livre, citando a fonte.')));
  };

  // ===================================================================
  // ATENDIMENTO, CONTATO, ACESSIBILIDADE, MAPA DO SITE
  // ===================================================================
  R.contato = async function (main) {
    S.titulo('Contato'); S.trilha(['Contato']);
    const c = S.conf;
    const unidades = (await S.carregarUnidades()).filter((u) => u.ativo !== false && (u.telefone || u.email)).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    pagina(main, el('h1', null, 'Contato e atendimento'),
      el('div', { class: 'grade g2', style: 'margin-top:16px' },
        el('div', { class: 'cartao' }, el('h2', null, S.conf.nome_exibicao || S.orgao.nome),
          el('dl', { class: 'dados' },
            el('dt', null, 'Endereço'), el('dd', null, c.endereco || '—', c.cep ? ' · CEP ' + c.cep : '',
              c.endereco ? el('a', { href: 'https://www.google.com/maps/search/' + encodeURIComponent(c.endereco + (c.cep ? ' ' + c.cep : '')), target: '_blank', rel: 'noopener', style: 'display:block' }, 'Ver no mapa') : null),
            el('dt', null, 'Telefone'), el('dd', null, c.telefone ? el('a', { href: 'tel:' + c.telefone.replace(/\D/g, '') }, c.telefone) : '—'),
            el('dt', null, 'E-mail'), el('dd', null, c.email ? el('a', { href: 'mailto:' + c.email }, c.email) : '—'),
            el('dt', null, 'Horário'), el('dd', null, c.horario || '—'),
            c.whatsapp ? [el('dt', null, 'WhatsApp'), el('dd', null, c.whatsapp)] : null)),
        el('div', { class: 'cartao' }, el('h2', null, 'Fale com o órgão'),
          el('p', null, el('a', { href: '#/ouvidoria' }, 'Ouvidoria'), ': elogios, sugestões, reclamações e denúncias.'),
          el('p', null, el('a', { href: '#/esic' }, 'e-SIC'), ': pedido de acesso à informação (Lei 12.527/2011).'),
          el('p', null, el('a', { href: '#/faq' }, 'Perguntas frequentes'), ': respostas para as dúvidas mais comuns.'))),
      unidades.length ? el('section', { style: 'margin-top:28px' }, el('h2', null, 'Contatos das unidades'),
        el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela' },
          el('thead', null, el('tr', null, ['Unidade', 'Telefone', 'E-mail', 'Horário'].map((t) => el('th', { scope: 'col' }, t)))),
          el('tbody', null, unidades.map((u) => el('tr', null,
            el('td', null, el('a', { href: '#/unidade/' + u.id }, u.nome)), el('td', null, u.telefone || '—'),
            el('td', null, u.email ? el('a', { href: 'mailto:' + u.email }, u.email) : '—'), el('td', null, u.horario_atendimento || c.horario || '—'))))))) : null);
  };

  R.acessibilidade = async function (main) {
    S.titulo('Acessibilidade'); S.trilha(['Acessibilidade']);
    pagina(main, el('article', { class: 'artigo' }, el('h1', null, 'Acessibilidade'),
      el('p', null, 'Este site segue as recomendações do Modelo de Acessibilidade em Governo Eletrônico (e-MAG) e das diretrizes internacionais WCAG, para que todas as pessoas possam usá-lo.'),
      el('h2', null, 'Atalhos de teclado'),
      el('ul', null,
        el('li', null, el('strong', null, 'Alt + 1'), ': ir para o conteúdo'),
        el('li', null, el('strong', null, 'Alt + 2'), ': ir para o menu'),
        el('li', null, el('strong', null, 'Alt + 3'), ': ir para a busca'),
        el('li', null, el('strong', null, 'Alt + 4'), ': ir para o rodapé')),
      el('p', { class: 'meta' }, 'No Firefox, use Alt + Shift + número. No Mac, use Control + Option + número.'),
      el('h2', null, 'Recursos'),
      el('ul', null,
        el('li', null, el('strong', null, 'Alto contraste'), ': botão na barra do topo; fica lembrado neste navegador.'),
        el('li', null, el('strong', null, 'Tamanho do texto'), ': botões A+, A e A− na barra do topo.'),
        el('li', null, el('strong', null, 'Libras'), ': o ícone do VLibras, na lateral da tela, traduz o conteúdo para a Língua Brasileira de Sinais.'),
        el('li', null, 'Imagens com descrição em texto, para quem usa leitor de tela.'),
        el('li', null, 'Navegação completa pelo teclado (Tab, Enter e Esc).')),
      el('h2', null, 'Encontrou alguma barreira?'),
      el('p', null, 'Conte para a gente pela ', el('a', { href: '#/ouvidoria' }, 'Ouvidoria'), (S.conf.email ? [' ou pelo e-mail ', el('a', { href: 'mailto:' + S.conf.email }, S.conf.email)] : null), '.')));
  };

  R['mapa-do-site'] = async function (main) {
    S.titulo('Mapa do site'); S.trilha(['Mapa do site']);
    const principais = S.menu.filter((i) => !i.pai_id).sort((a, b) => a.ordem - b.ordem);
    const filhos = (id) => S.menu.filter((i) => i.pai_id === id).sort((a, b) => a.ordem - b.ordem);
    const { data: pags } = await sb.from('paginas').select('titulo, slug').eq('orgao_id', org()).order('titulo').limit(300);
    const fixos = [['Notícias', '#/noticias'], ['Publicações oficiais', '#/publicacoes'], ['Diário Oficial', '#/diario-oficial'],
      ['Estrutura organizacional', '#/estrutura'], ['Gestores', '#/gestores'], ['Carta de Serviços', '#/servicos'], ['Perguntas frequentes', '#/faq'],
      ['Transparência', '#/transparencia'], ['Planejamento e prestação de contas', '#/planejamento'], ['Licitações', '#/licitacoes'], ['Plano de contratações anual (PCA)', '#/licitacoes/pca'], ['Sancionados', '#/licitacoes/sancionados'], ['Contratos', '#/contratos'], ['Fiscais de contratos', '#/contratos/fiscais'], ['Ouvidoria', '#/ouvidoria'], ['e-SIC', '#/esic'],
      ['Proteção de dados (LGPD)', '#/lgpd'], ['Dados abertos', '#/dados-abertos'], ['Acessibilidade', '#/acessibilidade'], ['Contato', '#/contato']];
    pagina(main, el('h1', null, 'Mapa do site'),
      el('div', { class: 'grade g2' },
        principais.length ? el('section', null, el('h2', null, 'Menu principal'), el('ul', { class: 'arvore' }, principais.map((p) => el('li', null,
          el('a', { href: S.destinoMenu(p) }, p.rotulo), filhos(p.id).length ? el('ul', null, filhos(p.id).map((s) => el('li', null, el('a', { href: S.destinoMenu(s) }, s.rotulo)))) : null)))) : null,
        el('section', null, el('h2', null, 'Todas as seções'), el('ul', { class: 'arvore' },
          fixos.map(([t, h]) => el('li', null, el('a', { href: h }, t))),
          (pags || []).map((p) => el('li', null, el('a', { href: '#/pagina/' + p.slug }, p.titulo)))))));
  };

  // Sistemas que ainda estão fora do portal (transparência, licitações, e-SIC, ouvidoria):
  // levam ao endereço externo informado no painel; sem ele, explicam e dão o contato.
  function externo(chave, titulo, descricao, chaveUrl) {
    return async function (main) {
      S.titulo(titulo); S.trilha([titulo]);
      const url = S.conf[chaveUrl];
      const c = S.conf;
      pagina(main, el('h1', null, titulo), el('p', { class: 'sub' }, descricao),
        url ? el('p', null, el('a', { class: 'botao', href: url, target: '_blank', rel: 'noopener' }, 'Acessar ' + titulo, el('span', { class: 'sr' }, ' (abre em nova aba)')))
          : el('div', { class: 'cartao' }, el('p', null, 'Esta seção está em implantação.'),
            el('p', null, 'Enquanto isso, fale com o órgão: ', c.telefone || '', c.telefone && c.email ? ' · ' : '', c.email ? el('a', { href: 'mailto:' + c.email }, c.email) : '', c.horario ? ' · ' + c.horario : '')),
        chave === 'transparencia' ? el('p', { style: 'margin-top:20px' }, el('a', { class: 'botao botao-claro', href: RADAR, target: '_blank', rel: 'noopener' }, 'Radar da Transparência Pública', el('span', { class: 'sr' }, ' (abre em nova aba)'))) : null);
    };
  }

  // ===================================================================
  // PLANEJAMENTO E PRESTAÇÃO DE CONTAS (11.1 a 11.10)
  // O PNTP pede "seção específica" para cada instrumento: a página geral
  // mostra os grupos e cada tipo tem endereço próprio (#/planejamento/loa…).
  // A série histórica vem em blocos de 4 exercícios ("Exercícios anteriores")
  // para não baixar décadas de documentos de uma vez.
  // ===================================================================
  const CONTAS = {
    ppa: ['PPA – Plano Plurianual', 'Planejamento de médio prazo (4 anos): programas, objetivos e metas do governo.', 'Planejamento'],
    ldo: ['LDO – Lei de Diretrizes Orçamentárias', 'Metas e prioridades do ano seguinte e regras para elaborar a LOA, com os anexos de metas e riscos fiscais.', 'Planejamento'],
    loa: ['LOA – Lei Orçamentária Anual', 'Orçamento do ano: estimativa das receitas e fixação das despesas.', 'Planejamento'],
    plano_estrategico: ['Plano Estratégico', 'Planejamento estratégico institucional: missão, visão, objetivos e indicadores.', 'Planejamento'],
    rreo: ['RREO – Relatório Resumido da Execução Orçamentária', 'Publicado a cada bimestre (LRF, art. 52): como estão as receitas e despesas do orçamento.', 'Gestão fiscal'],
    rgf: ['RGF – Relatório de Gestão Fiscal', 'Publicado a cada quadrimestre ou semestre (LRF, art. 54): despesa com pessoal, dívida e limites da LRF.', 'Gestão fiscal'],
    balanco: ['Prestação de contas anual (Balanço Geral)', 'Contas anuais do exercício encerrado, com balanços e demonstrativos.', 'Prestação de contas'],
    relatorio_gestao: ['Relatório de Gestão ou de Atividades', 'O que foi feito no ano: ações, resultados e metas alcançadas.', 'Prestação de contas'],
    parecer_tce: ['Parecer do Tribunal de Contas', 'Parecer prévio ou decisão do Tribunal de Contas sobre as contas anuais, inclusive as ainda pendentes de apreciação.', 'Prestação de contas'],
    julgamento_camara: ['Julgamento das contas pela Câmara', 'Resultado do julgamento das contas anuais pelo Poder Legislativo.', 'Prestação de contas']
  };
  const RESULTADO_CONTAS = { aprovadas: ['Aprovadas', 'etiqueta-verde'], aprovadas_ressalvas: ['Aprovadas com ressalvas', 'etiqueta-ambar'], rejeitadas: ['Rejeitadas', 'etiqueta-vermelha'], pendente: ['Pendente de apreciação', 'etiqueta-ambar'] };
  const curtoContas = (t) => CONTAS[t][0].split(' – ')[0];
  function periodoContas(d) {
    if (d.tipo === 'rreo') return d.periodo + 'º bimestre';
    if (d.tipo === 'rgf') return d.periodo + 'º ' + (d.periodicidade === 'semestral' ? 'semestre' : 'quadrimestre');
    if (d.exercicio_fim) return d.exercicio + ' a ' + d.exercicio_fim;
    if (d.tipo === 'parecer_tce' || d.tipo === 'julgamento_camara') return 'Contas de ' + d.exercicio;
    return 'Exercício ' + d.exercicio;
  }
  const COLUNAS_CONTAS = [['tipo', 'Documento', (v) => CONTAS[v] ? CONTAS[v][0] : v], ['exercicio', 'Exercício'], ['exercicio_fim', 'Último ano'],
    ['periodo', 'Período', (v, r) => r.periodo ? periodoContas(r) : ''], ['parte', 'Parte'], ['resultado', 'Resultado', (v) => v ? RESULTADO_CONTAS[v][0] : ''],
    ['numero_ato', 'Número do ato'], ['data_publicacao', 'Data de publicação'], ['descricao', 'Observação'], ['documento', 'Documento', (v, r) => r.arquivo_url || r.link_externo || '']];
  const CAMPOS_CONTAS = 'id, tipo, exercicio, exercicio_fim, periodicidade, periodo, parte, descricao, resultado, numero_ato, data_publicacao, arquivo_url, link_externo, ordem';

  // Abas de Planejamento e contas: uma por tipo, na ordem dos grupos.
  const ABAS_CONTAS = [['ppa', 'PPA'], ['ldo', 'LDO'], ['loa', 'LOA'], ['plano_estrategico', 'Plano Estratégico'], ['rreo', 'RREO'], ['rgf', 'RGF'],
    ['balanco', 'Balanço'], ['relatorio_gestao', 'Relatório de Gestão'], ['parecer_tce', 'Parecer TCE'], ['julgamento_camara', 'Julgamento Câmara']];

  R.planejamento = async function (main, partes, params) {
    let tipo = partes[0] || ABAS_CONTAS[0][0];
    if (!CONTAS[tipo]) return R['*'](main);
    S.titulo('Planejamento e prestação de contas');
    const conteudo = el('div', { id: 'painel-contas', class: 'painel-guia', role: 'tabpanel', tabindex: '-1' });
    // Aba trocada no lugar (sem recarregar a página nem voltar ao topo); o endereço
    // muda por replaceState para o link continuar compartilhável (#/planejamento/rreo).
    const abas = ABAS_CONTAS.map(([t, rot]) => el('a', { class: 'aba-guia', href: '#/planejamento/' + t, role: 'tab', id: 'aba-' + t,
      'aria-selected': t === tipo ? 'true' : 'false', 'aria-controls': 'painel-contas', tabindex: t === tipo ? '0' : '-1' }, rot));
    const lista = el('div', { class: 'abas-guia', role: 'tablist', 'aria-label': 'Documentos' }, abas);
    function escolher(t, focar) {
      tipo = t;
      for (const a of abas) { const sel = a.id === 'aba-' + t; a.setAttribute('aria-selected', sel ? 'true' : 'false'); a.tabIndex = sel ? 0 : -1; if (sel && focar) { a.focus(); a.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } }
      // No celular as abas rolam de lado: traz a escolhida para dentro da faixa visível.
      const ativa = abas.find((x) => x.id === 'aba-' + t);
      if (ativa.offsetLeft < lista.scrollLeft || ativa.offsetLeft + ativa.offsetWidth > lista.scrollLeft + lista.clientWidth) lista.scrollLeft = ativa.offsetLeft - 8;
      conteudo.setAttribute('aria-labelledby', 'aba-' + t);
      history.replaceState(null, '', '#/planejamento/' + t);
      S.trilha(['Transparência', '#/transparencia'], ['Planejamento e contas', '#/planejamento'], [curtoContas(t)]);
      secaoContas(conteudo, t, t === partes[0] ? params : new URLSearchParams()).catch((e) => { console.error(e); conteudo.replaceChildren(el('p', null, 'Não foi possível carregar. Tente novamente.')); });
    }
    lista.addEventListener('click', (e) => { const a = e.target.closest('a.aba-guia'); if (!a || e.ctrlKey || e.metaKey || e.shiftKey) return; e.preventDefault(); escolher(a.id.slice(4), false); });
    lista.addEventListener('keydown', (e) => {
      const i = ABAS_CONTAS.findIndex((x) => x[0] === tipo);
      const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? ABAS_CONTAS.length - 1 : null;
      if (n === null) return;
      e.preventDefault(); escolher(ABAS_CONTAS[(n + ABAS_CONTAS.length) % ABAS_CONTAS.length][0], true);
    });
    pagina(main, el('h1', null, 'Planejamento e prestação de contas'),
      el('p', { class: 'sub' }, 'Leis do orçamento, relatórios fiscais da LRF e as contas anuais, com o parecer do Tribunal de Contas e o julgamento pela Câmara.'),
      lista, conteudo);
    escolher(tipo, false);
  };

  // Conteúdo de uma aba de documento: segunda faixa de abas, uma por exercício
  // (abas dentro de abas). Cada exercício é buscado só quando a aba é aberta.
  async function secaoContas(alvo, tipo, params) {
    const [nome, descricao] = CONTAS[tipo];
    const comPeriodo = tipo === 'rreo' || tipo === 'rgf';
    const exportar = S.botoesExportar(tipo.replace('_', '-'), COLUNAS_CONTAS, async (de, ate) => {
      const { data } = await sb.from('documentos_contas').select(CAMPOS_CONTAS).eq('orgao_id', org()).eq('tipo', tipo)
        .order('exercicio', { ascending: false }).order('periodo').order('ordem').order('id').range(de, ate);
      return data || [];
    });
    alvo.replaceChildren(el('h2', { class: 'titulo-aba' }, nome), el('p', { class: 'meta' }, descricao), el('p', { class: 'carregando' }, 'Carregando…'));

    // Lista de exercícios: só a coluna "exercicio" deste tipo (poucas linhas por ano),
    // sem repetição. Não há "distinct" na API, por isso a deduplicação aqui.
    const { data: anosBrutos, error } = await sb.from('documentos_contas').select('exercicio, exercicio_fim')
      .eq('orgao_id', org()).eq('tipo', tipo).order('exercicio', { ascending: false }).limit(2000);
    if (error) throw error;
    const fimDe = {};
    for (const r of anosBrutos || []) if (!(r.exercicio in fimDe)) fimDe[r.exercicio] = r.exercicio_fim;
    const anos = Object.keys(fimDe).map(Number).sort((a, b) => b - a);
    const cabecalho = el('div', { class: 'barra-lista' },
      el('span', { class: 'meta' }, anos.length ? anos.length + (anos.length === 1 ? ' exercício publicado' : ' exercícios publicados') : ''), anos.length ? exportar : '');
    if (!anos.length) {
      alvo.replaceChildren(el('h2', { class: 'titulo-aba' }, nome), el('p', { class: 'meta' }, descricao), el('p', { class: 'vazio' }, 'Nenhum documento publicado ainda.'));
      return;
    }
    const rotuloAno = (a) => fimDe[a] ? a + '–' + fimDe[a] : String(a);
    const pedido = parseInt(params.get('ano'), 10);
    let ano = anos.includes(pedido) ? pedido : anos[0];
    const painel = el('div', { class: 'painel-guia painel-guia-interno', role: 'tabpanel', id: 'painel-ano', tabindex: '-1' });
    const abas = anos.map((a) => el('a', { class: 'aba-guia aba-guia-p', href: '#/planejamento/' + tipo + '?ano=' + a, role: 'tab', id: 'aba-ano-' + a,
      'aria-controls': 'painel-ano' }, rotuloAno(a)));
    const lista = el('div', { class: 'abas-guia abas-guia-interna', role: 'tablist', 'aria-label': 'Exercício' }, abas);
    let versao = 0;   // descarta resposta de um ano anterior se a aba for trocada rápido

    async function abrirAno(a, focar) {
      ano = a;
      for (const x of abas) { const sel = x.id === 'aba-ano-' + a; x.setAttribute('aria-selected', sel ? 'true' : 'false'); x.tabIndex = sel ? 0 : -1; if (sel && focar) x.focus(); }
      const ativa = abas.find((x) => x.id === 'aba-ano-' + a);
      if (ativa.offsetLeft < lista.scrollLeft || ativa.offsetLeft + ativa.offsetWidth > lista.scrollLeft + lista.clientWidth) lista.scrollLeft = ativa.offsetLeft - 8;
      painel.setAttribute('aria-labelledby', 'aba-ano-' + a);
      history.replaceState(null, '', '#/planejamento/' + tipo + '?ano=' + a);
      const minha = ++versao;
      painel.replaceChildren(el('p', { class: 'carregando' }, 'Carregando…'));
      const { data, error: e } = await sb.from('documentos_contas').select(CAMPOS_CONTAS).eq('orgao_id', org()).eq('tipo', tipo).eq('exercicio', a)
        .order('periodo', { ascending: true }).order('ordem').order('id').limit(500);
      if (minha !== versao) return;
      if (e) { painel.replaceChildren(el('p', null, 'Não foi possível carregar. Tente novamente.')); return; }
      desenhar(data || []);
    }

    function desenhar(docs) {
      if (!docs.length) { painel.replaceChildren(el('p', { class: 'vazio' }, 'Nenhum documento neste exercício.')); return; }
      // Agrupa as partes (lei e anexos) do mesmo período.
      const chaves = [...new Set(docs.map((d) => (d.periodicidade || '') + ':' + (d.periodo || 0)))];
      painel.replaceChildren(
        el('h3', { class: 'sr' }, (tipo === 'parecer_tce' || tipo === 'julgamento_camara' ? 'Contas de ' : 'Exercício ') + rotuloAno(ano)),
        ...chaves.map((ch) => {
          const grupo = docs.filter((d) => (d.periodicidade || '') + ':' + (d.periodo || 0) === ch).sort((x, y) => x.ordem - y.ordem);
          const res = grupo.find((d) => d.resultado);
          return el('div', { class: 'cartao bloco-contas' },
            comPeriodo || res ? el('div', { class: 'cabeca-contas' },
              comPeriodo ? el('strong', null, periodoContas(grupo[0])) : null,
              res ? el('span', { class: 'etiqueta ' + RESULTADO_CONTAS[res.resultado][1] }, RESULTADO_CONTAS[res.resultado][0]) : null,
              res && res.numero_ato ? el('span', { class: 'meta' }, res.numero_ato) : null) : null,
            el('ul', { class: 'partes-contas' }, grupo.map((d) => {
              const doc = d.arquivo_url || d.link_externo;
              return el('li', null,
                doc ? el('a', { href: doc, target: '_blank', rel: 'noopener' }, d.parte, el('span', { class: 'sr' }, ' — ' + curtoContas(tipo) + ' ' + periodoContas(d) + (comPeriodo ? ' de ' + d.exercicio : '') + ' (abre em nova aba)'))
                  : el('span', null, d.resultado === 'pendente' ? 'Contas ainda não apreciadas' : d.parte),
                el('span', { class: 'meta' }, (doc ? (d.arquivo_url ? 'PDF' : 'Link') + ' · ' : '') + 'publicado em ' + dataBR(d.data_publicacao) + (d.descricao ? ' · ' + d.descricao : '')));
            })));
        }));
    }

    lista.addEventListener('click', (e) => { const x = e.target.closest('a.aba-guia'); if (!x || e.ctrlKey || e.metaKey || e.shiftKey) return; e.preventDefault(); abrirAno(Number(x.id.slice(8)), false); });
    lista.addEventListener('keydown', (e) => {
      const i = anos.indexOf(ano);
      const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? anos.length - 1 : null;
      if (n === null) return;
      e.preventDefault(); abrirAno(anos[(n + anos.length) % anos.length], true);
    });
    alvo.replaceChildren(el('h2', { class: 'titulo-aba' }, nome), el('p', { class: 'meta' }, descricao), cabecalho, lista, painel);
    await abrirAno(ano, false);
  }

  // ===================================================================
  // TRANSPARÊNCIA: capa organizada pelos grupos do PNTP (Atricon).
  // Cada item leva à seção do portal quando ela já existe aqui; o resto
  // (receitas, despesas, pessoal…) vai para o sistema externo informado
  // no painel. O número do critério aparece ao lado de cada item.
  // ===================================================================
  const IC_T = {
    receita: 'M12 3v18 M16.5 7.5c0-1.7-2-2.8-4.5-2.8S7.5 5.8 7.5 7.5s2 2.4 4.5 2.8 4.5 1.4 4.5 3.2-2 3-4.5 3-4.5-1.2-4.5-3',
    despesa: 'M3 6h18v13H3z M3 10h18 M7 15h4',
    licit: 'M9 3h6v4H9z M7 5H5v16h14V5h-2 M8 12h8 M8 16h5',
    contrato: 'M6 3h9l4 4v14H6z M9 14l2 2 4-4',
    pessoas: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M2 21c0-3.9 3.1-6 7-6s7 2.1 7 6 M16 4a3.5 3.5 0 0 1 0 7 M22 20c0-2.6-1.6-4.4-4-5',
    viagem: 'M3 11l18-7-6 17-3-7z',
    obra: 'M3 21h18 M5 21V10l7-5 7 5v11 M10 21v-5h4v5',
    convenio: 'M8 12l3 3 5-6 M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0',
    chat: 'M4 5h16v11H9l-5 4z M8 9h8 M8 12h5',
    ouvido: 'M4 13a8 8 0 0 1 16 0v5a2 2 0 0 1-2 2h-1v-6h3 M4 14h3v6H6a2 2 0 0 1-2-2z',
    lock: 'M6 11h12v10H6z M8 11V7a4 4 0 0 1 8 0v4',
    saude: 'M12 20s-8-4.8-8-10.5A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 8 2.5C20 15.2 12 20 12 20z',
    edu: 'M2 9l10-5 10 5-10 5z M6 11v5c3.5 2.5 8.5 2.5 12 0v-5',
    legis: 'M4 21h10 M9 17V8 M4 8h10 M5 8l2-4h4l2 4 M17 6v15 M15 21h4',
    play: 'M3 5h18v14H3z M10 9v6l5-3z',
    banco: 'M3 10l9-6 9 6 M5 10v8 M9.5 10v8 M14.5 10v8 M19 10v8 M3 21h18',
    grafico: 'M4 19V10 M10 19V5 M16 19v-7 M21 19H3'
  };
  function iconeT(nome) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', '22'); s.setAttribute('height', '22'); s.setAttribute('aria-hidden', 'true');
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.8'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', IC_T[nome]); s.append(p);
    return s;
  }
  function gruposTransparencia() {
    const c = S.conf;
    const tipo = S.orgao.tipo;
    const exec = tipo === 'prefeitura', cam = tipo === 'camara', cons = tipo === 'consorcio';
    const ext = c.transparencia_url || null;        // sistema externo (receitas, despesas, folha…)
    // L(texto, critério, destino): destino '#/…' é página do portal; null = sistema externo.
    const L = (t, cod, h) => ({ t, cod, h: h === undefined ? ext : h });
    const plan = [];
    if (exec || cam) plan.push(L('Plano Plurianual (PPA)', '11.8', '#/planejamento/ppa'), L('Lei de Diretrizes Orçamentárias (LDO)', '11.9', '#/planejamento/ldo'), L('Lei Orçamentária Anual (LOA)', '11.10', '#/planejamento/loa'));
    if (exec || cons) plan.push(L('RREO', '11.6', '#/planejamento/rreo'));
    plan.push(L('RGF', '11.5', '#/planejamento/rgf'), L('Prestação de contas anual (Balanço)', '11.1', '#/planejamento/balanco'),
      L('Relatório de gestão ou atividades', '11.2', '#/planejamento/relatorio_gestao'), L('Parecer do Tribunal de Contas', '11.3', '#/planejamento/parecer_tce'));
    if (exec) plan.push(L('Julgamento das contas pela Câmara', '11.4', '#/planejamento/julgamento_camara'));
    plan.push(L('Plano estratégico institucional', '11.7', '#/planejamento/plano_estrategico'));
    const receita = [L('Receitas previstas e arrecadadas', '3.1')];
    if (exec) receita.push(L('Receita por natureza (classificação)', '3.2'), L('Inscritos em dívida ativa', '3.3'));
    const g = [
      ['Informações institucionais', 'banco', [L('Estrutura organizacional', '2.1', '#/estrutura'), L('Competências e atribuições', '2.2', '#/estrutura'), L('Gestores responsáveis', '2.3', '#/gestores'),
        L('Endereços, telefones e horários', '2.4–2.5', '#/estrutura'), L('Atos normativos', '2.6', '#/publicacoes'), L('Perguntas frequentes', '2.7', '#/faq')]],
      ['Receitas', 'receita', receita],
      ['Despesas', 'despesa', [L('Empenhos, liquidações e pagamentos', '4.1 / 4.3'), L('Despesas por classificação', '4.2'), L('Ordem cronológica de pagamentos', '9.4')]],
      ['Convênios e transferências', 'convenio', [L('Transferências recebidas', '5.1'), L('Transferências realizadas', '5.2'), L('Acordos sem repasse de recursos', '5.3')]],
      ['Pessoal', 'pessoas', [L('Servidores e lotação', '6.1'), L('Remuneração nominal', '6.2'), L('Tabela de cargos e salários', '6.3'), L('Estagiários', '6.4'), L('Terceirizados', '6.5'), L('Concursos e seleções', '6.6–6.7')]],
      ['Diárias', 'viagem', [L('Diárias concedidas', '7.1'), L('Tabela de valores das diárias', '7.2')]],
      ['Licitações', 'licit', [L('Relação das licitações', '8.1', '#/licitacoes/todos'), L('Editais e documentos das fases', '8.2–8.3', '#/licitacoes/licitacoes'), L('Dispensas e inexigibilidades', '8.4', '#/licitacoes/diretas'),
        L('Adesões a atas (SRP)', '8.5', '#/licitacoes/adesoes'), L('Plano de contratações anual', '8.6', '#/licitacoes/pca'), L('Licitantes e contratados sancionados', '8.7', '#/licitacoes/sancionados')]],
      ['Contratos', 'contrato', [L('Contratos e termos aditivos', '9.1–9.2', '#/contratos'), L('Fiscais de contratos', '9.3', '#/contratos/fiscais'), L('Ordem cronológica de pagamentos', '9.4')]],
      ['Obras', 'obra', [L('Obras e situação atual', '10.1'), L('Quantitativos e preços', '10.2–10.3'), L('Obras paralisadas', '10.4')]],
      ['Planejamento e prestação de contas', 'grafico', plan],
      ['Serviço de Informação ao Cidadão', 'chat', [L('e-SIC: fazer pedido', '12.1–12.4', '#/esic'), L('Regulamentação da LAI', '12.5', '#/publicacoes?q=acesso a informacao'),
        L('Prazos e autoridades', '12.6', '#/esic'), L('Relatório estatístico anual', '12.7', '#/esic'), L('Informações classificadas', '12.8', '#/esic'), L('Informações desclassificadas', '12.9', '#/esic')]],
      ['Ouvidoria e serviços', 'ouvido', [L('Ouvidoria: atendimento presencial', '14.1', '#/ouvidoria'), L('Ouvidoria: canal eletrônico', '14.2', '#/ouvidoria'),
        L('Carta de Serviços ao Usuário', '14.3', '#/servicos'), L('Serviços digitais', '15.3', '#/servicos'), L('Pesquisa de satisfação', '15.6', '#/ouvidoria')]],
      ['Privacidade e dados abertos', 'lock', [L('Encarregado de dados (LGPD)', '15.1', '#/lgpd'), L('Política de privacidade', '15.2', '#/lgpd'), L('Dados abertos e API', '15.4', '#/dados-abertos'), L('Regulamentação do Governo Digital', '15.5', '#/lgpd')]]
    ];
    if (exec) {
      g.push(['Renúncias de receita', 'receita', [L('Desonerações e fundamento legal', '16.1'), L('Renúncia prevista e realizada', '16.2'), L('Beneficiários', '16.3'), L('Incentivo à cultura e ao esporte', '16.4')]],
        ['Emendas parlamentares', 'legis', [L('Emendas federais', '17.1'), L('Emendas estaduais e municipais', '17.2'), L('Execução das emendas', '17.3')]],
        ['Saúde', 'saude', [L('Plano, programação e relatório', '18.1'), L('Serviços, horários e profissionais', '18.2'), L('Lista de espera da regulação', '18.3'), L('Medicamentos do SUS', '18.4'), L('Estoque das farmácias', '18.5'), L('Conselho de Saúde', '18.6')]],
        ['Educação e assistência social', 'edu', [L('Plano de educação e resultados', '19.1'), L('Lista de espera em creches', '19.2'), L('Conselho do Fundeb', '19.3'), L('Conselho de Assistência Social', '19.4')]]);
    }
    if (cam) {
      g.push(['Atividade legislativa', 'legis', [L('Vereadores e biografias', '20.1'), L('Leis e atos produzidos', '20.2', '#/publicacoes'), L('Projetos e tramitação', '20.3'), L('Pauta do plenário e comissões', '20.4–20.5'),
        L('Atas e presenças', '20.6'), L('Votações nominais', '20.7'), L('Julgamento das contas do Executivo', '20.8', '#/planejamento/julgamento_camara')]],
        ['Participação e verbas', 'play', [L('Transmissão das sessões', '20.9'), L('Cota parlamentar / verba indenizatória', '20.10'), L('Atividades dos vereadores', '20.11')]]);
    }
    if (cons) {
      g.push(['Atividades do consórcio', 'banco', [L('Protocolo de intenções', '25.1'), L('Estatuto', '25.2'), L('Contratos de rateio', '25.3'), L('Contrato de programa', '25.4'),
        L('Ata de eleição dos dirigentes', '25.5'), L('Atas da assembleia geral', '25.6'), L('Municípios consorciados', '25.7')]]);
    }
    return g;
  }

  R.transparencia = async function (main) {
    S.titulo('Portal da Transparência'); S.trilha(['Portal da Transparência']);
    const c = S.conf;
    // Faixa de situação: última atualização e exercícios disponíveis (consultas de 1 linha cada).
    const tabelas = ['noticias', 'publicacoes', 'servicos', 'paginas', 'unidades', 'documentos_contas'];
    const [datas, menor, maior] = await Promise.all([
      Promise.all(tabelas.map((t) => sb.from(t).select('atualizado_em').eq('orgao_id', org()).order('atualizado_em', { ascending: false }).limit(1))),
      sb.from('documentos_contas').select('exercicio').eq('orgao_id', org()).order('exercicio').limit(1),
      sb.from('documentos_contas').select('exercicio').eq('orgao_id', org()).order('exercicio', { ascending: false }).limit(1)
    ]);
    const ultima = datas.flatMap((x) => (x.data || []).map((d) => d.atualizado_em)).sort().pop();
    const ex1 = ((menor.data || [])[0] || {}).exercicio, ex2 = Math.min(((maior.data || [])[0] || {}).exercicio || 0, new Date().getFullYear());
    const campoBusca = el('input', { id: 'busca-transp', type: 'search', placeholder: 'Pesquise: lei, LOA, RREO, serviço, secretaria…' });
    const externo = (h) => h && /^https?:/.test(h);
    main.replaceChildren(
      el('section', { class: 'transp-topo' }, el('div', { class: 'limite' },
        el('h1', null, 'Portal da Transparência'),
        el('p', null, 'Informações sobre a gestão dos recursos públicos, organizadas conforme a Lei de Acesso à Informação, a Lei de Responsabilidade Fiscal e o Programa Nacional de Transparência Pública.'),
        el('form', { class: 'transp-busca', role: 'search', onsubmit: (e) => { e.preventDefault(); const q = campoBusca.value.trim(); if (q) location.hash = '#/busca?q=' + encodeURIComponent(q); } },
          el('label', { for: 'busca-transp', class: 'sr' }, 'Pesquisar no Portal da Transparência'), campoBusca, el('button', { type: 'submit' }, 'Pesquisar')),
        el('div', { class: 'transp-atalhos' }, el('span', null, 'Mais acessados:'),
          [['Despesas', ext()], ['Servidores', ext()], ['Licitações', '#/licitacoes'], ['Contratos', '#/contratos'], ['Planejamento e contas', '#/planejamento'], ['Leis e decretos', '#/publicacoes']]
            .filter((x) => x[1]).map(([t, h]) => el('a', { href: h, target: externo(h) ? '_blank' : null, rel: externo(h) ? 'noopener' : null }, t))))),
      el('div', { class: 'transp-fundo' }, el('div', { class: 'limite pagina transp-corpo' },
        el('div', { class: 'transp-status' },
          el('span', null, el('b', null, 'Última atualização dos dados: '), ultima ? dataBR(ultima) : '—'),
          ex1 ? el('span', null, el('b', null, 'Exercícios disponíveis: '), ex1 === ex2 ? String(ex1) : ex1 + ' a ' + ex2) : null,
          el('span', null, el('b', null, 'Formatos: '), 'CSV, JSON e PDF'),
          el('a', { href: '#/dados-abertos' }, 'Dados abertos e API →')),
        el('div', { class: 'grade g3 transp-grupos' }, gruposTransparencia().map(([titulo, ic, links]) => el('section', { class: 'transp-grupo' },
          el('div', { class: 'transp-grupo-topo' }, el('span', { class: 'transp-icone' }, iconeT(ic)), el('h2', null, titulo)),
          el('ul', null, links.map((l) => el('li', null, l.h
            ? el('a', { href: l.h, target: externo(l.h) ? '_blank' : null, rel: externo(l.h) ? 'noopener' : null },
              el('span', null, l.t, externo(l.h) ? el('span', { class: 'sr' }, ' (abre em nova aba, no sistema de transparência)') : null),
              el('span', { class: 'transp-cod', title: 'Critério ' + l.cod + ' do PNTP' }, l.cod))
            : el('span', { class: 'transp-sem' }, el('span', null, l.t, el('span', { class: 'sr' }, ' (endereço ainda não informado)')), el('span', { class: 'transp-cod' }, l.cod)))))))),
        el('p', { class: 'meta transp-nota' }, 'Os itens de receitas, despesas, pessoal, diárias, convênios e obras abrem o sistema de transparência do órgão em nova aba.',
          ' ', el('a', { href: RADAR, target: '_blank', rel: 'noopener' }, 'Radar da Transparência Pública', el('span', { class: 'sr' }, ' (abre em nova aba)'))))));
    function ext() { return c.transparencia_url || null; }
  };
  // ===================================================================
  // LICITAÇÕES (8.1 a 8.5)
  // Abas no estilo de guia: grupo (licitações / contratações diretas /
  // adesões) → exercício. Cada ano é buscado só quando a aba é aberta,
  // em lotes de 50 com "Carregar mais".
  // ===================================================================
  const MOD_LIC = {
    pregao_eletronico: 'Pregão eletrônico', pregao_presencial: 'Pregão presencial', concorrencia_eletronica: 'Concorrência eletrônica',
    concorrencia_presencial: 'Concorrência presencial', concurso: 'Concurso', leilao_eletronico: 'Leilão eletrônico', leilao_presencial: 'Leilão presencial',
    dialogo_competitivo: 'Diálogo competitivo', credenciamento: 'Credenciamento', pre_qualificacao: 'Pré-qualificação',
    manifestacao_interesse: 'Manifestação de interesse', chamada_publica: 'Chamada pública', tomada_precos: 'Tomada de preços', convite: 'Convite',
    dispensa: 'Dispensa de licitação', inexigibilidade: 'Inexigibilidade', adesao_ata: 'Adesão a ata de registro de preços', outra: 'Outra'
  };
  // "Todos os processos" é a relação do PNTP 8.1, que inclui dispensas e inexigibilidades;
  // as outras abas separam por tipo (8.2/8.3, 8.4 e 8.5). O 4º item é a frase para ano sem processo.
  const GRUPOS_LIC = [
    ['todos', 'Todos os processos', Object.keys(MOD_LIC), 'Não foram realizadas licitações nem contratações diretas em {ano}'],
    ['licitacoes', 'Licitações', Object.keys(MOD_LIC).filter((m) => !['dispensa', 'inexigibilidade', 'adesao_ata'].includes(m)), 'Não foram realizadas licitações em {ano}'],
    ['diretas', 'Dispensas e inexigibilidades', ['dispensa', 'inexigibilidade'], 'Não houve dispensas nem inexigibilidades em {ano}'],
    ['adesoes', 'Adesões a atas', ['adesao_ata'], 'Não houve adesões a atas de registro de preços em {ano}']
  ];
  const ABAS_LIC_EXTRA = [['pca', 'Plano de contratações (PCA)'], ['sancionados', 'Sancionados']];
  const AND_LIC = { prevista: ['Prevista', 'etiqueta-ambar'], aberta: ['Aberta', 'etiqueta-verde'], em_andamento: ['Em andamento', 'etiqueta-ambar'],
    suspensa: ['Suspensa', 'etiqueta-ambar'], homologada: ['Homologada', 'etiqueta-verde'], encerrada: ['Encerrada', 'etiqueta-verde'],
    deserta: ['Deserta', 'etiqueta-vermelha'], fracassada: ['Fracassada', 'etiqueta-vermelha'], revogada: ['Revogada', 'etiqueta-vermelha'], anulada: ['Anulada', 'etiqueta-vermelha'] };
  const DOC_LIC = { estudo_tecnico: 'Estudo técnico preliminar', justificativa: 'Justificativa', orcamento: 'Orçamento / pesquisa de preços', parecer: 'Parecer',
    emergencia: 'Caracterização da emergência', aviso: 'Aviso de licitação', edital: 'Edital', anexo: 'Anexo', termo_referencia: 'Termo de referência', esclarecimento: 'Esclarecimento',
    impugnacao: 'Impugnação', retificacao: 'Retificação', ata: 'Ata da sessão', resultado: 'Resultado', recurso: 'Recurso', adjudicacao: 'Adjudicação',
    homologacao: 'Homologação', ratificacao: 'Ratificação', contrato: 'Contrato / ata de RP', outro: 'Documento' };
  const moedaBR = (v) => v === null || v === undefined ? '' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const nomeLic = (l) => (MOD_LIC[l.modalidade] || l.modalidade) + (l.numero ? ' nº ' + l.numero : '');
  const CAMPOS_LIC = 'id, modalidade, numero, ano, processo, objeto, srp, criterio, amparo_legal, unidade_nome, valor_estimado, valor_homologado, data_publicacao, data_abertura, andamento, vencedores, link_externo, origem, atualizado_em, chave_ordem';
  const COLUNAS_LIC = [['modalidade', 'Modalidade', (v) => MOD_LIC[v] || v], ['numero', 'Número'], ['ano', 'Ano'], ['processo', 'Processo'], ['objeto', 'Objeto'],
    ['andamento', 'Andamento', (v) => AND_LIC[v] ? AND_LIC[v][0] : v], ['data_publicacao', 'Publicação'], ['data_abertura', 'Abertura'],
    ['valor_estimado', 'Valor estimado'], ['valor_homologado', 'Valor homologado'], ['vencedores', 'Vencedores'], ['unidade_nome', 'Unidade'],
    ['srp', 'Registro de preços', (v) => v ? 'Sim' : 'Não'], ['amparo_legal', 'Fundamento legal'], ['link_externo', 'Link']];

  // Faixa de abas reutilizável (guia de navegador): troca no lugar e atualiza o endereço.
  function faixaAbas(itens, atual, rotulo, interna, aoEscolher) {
    const abas = itens.map(([id, texto]) => el('a', { class: 'aba-guia' + (interna ? ' aba-guia-p' : ''), href: '#', role: 'tab', 'data-id': id,
      'aria-selected': String(id) === String(atual) ? 'true' : 'false', tabindex: String(id) === String(atual) ? '0' : '-1' }, texto));
    const lista = el('div', { class: 'abas-guia' + (interna ? ' abas-guia-interna' : ''), role: 'tablist', 'aria-label': rotulo }, abas);
    function marcar(id, focar) {
      for (const a of abas) { const s = a.dataset.id === String(id); a.setAttribute('aria-selected', s ? 'true' : 'false'); a.tabIndex = s ? 0 : -1; if (s && focar) a.focus(); }
      const at = abas.find((a) => a.dataset.id === String(id));
      if (at && (at.offsetLeft < lista.scrollLeft || at.offsetLeft + at.offsetWidth > lista.scrollLeft + lista.clientWidth)) lista.scrollLeft = at.offsetLeft - 8;
    }
    lista.addEventListener('click', (e) => { const a = e.target.closest('a.aba-guia'); if (!a) return; e.preventDefault(); marcar(a.dataset.id); aoEscolher(a.dataset.id); });
    lista.addEventListener('keydown', (e) => {
      const i = abas.findIndex((a) => a.getAttribute('aria-selected') === 'true');
      const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? abas.length - 1 : null;
      if (n === null) return;
      e.preventDefault(); const a = abas[(n + abas.length) % abas.length]; marcar(a.dataset.id, true); aoEscolher(a.dataset.id);
    });
    return { lista, marcar };
  }

  R.licitacoes = async function (main, partes, params) {
    S.titulo('Licitações'); S.trilha(['Transparência', '#/transparencia'], ['Licitações']);
    const c = S.conf;
    let grupo = GRUPOS_LIC.some((g) => g[0] === partes[0]) ? partes[0] : 'todos';
    const conteudo = el('div', { class: 'painel-guia', role: 'tabpanel' });
    // PCA (8.6) e sancionados (8.7) ficam na mesma faixa de abas: é onde o avaliador procura.
    if (ABAS_LIC_EXTRA.some((x) => x[0] === partes[0])) grupo = partes[0];
    const { lista } = faixaAbas(GRUPOS_LIC.map((g) => [g[0], g[1]]).concat(ABAS_LIC_EXTRA), grupo, 'Tipo de processo', false, (id) => { grupo = id; abrirGrupo(new URLSearchParams()); });
    const ext = c.licitacoes_url;
    pagina(main, el('h1', null, 'Licitações'),
      el('p', { class: 'sub' }, 'Relação das licitações, dispensas, inexigibilidades e adesões a atas de registro de preços, com edital e documentos de cada fase; plano de contratações anual e licitantes e contratados sancionados.'),
      ext ? el('p', { class: 'meta' }, 'Também disponível no sistema de licitações: ', el('a', { href: ext, target: '_blank', rel: 'noopener' }, 'acessar', el('span', { class: 'sr' }, ' (abre em nova aba)')), '.') : null,
      lista, conteudo,
      el('p', { class: 'meta', style: 'margin-top:18px' }, 'Consulte também: ',
        el('a', { href: 'https://pncp.gov.br/app/editais?q=&pagina=1', target: '_blank', rel: 'noopener' }, 'Portal Nacional de Contratações Públicas (PNCP)'), ' · ',
        el('a', { href: 'https://portaldatransparencia.gov.br/sancoes/ceis', target: '_blank', rel: 'noopener' }, 'empresas punidas (CEIS/CNEP)')));
    await abrirGrupo(params);

    async function abrirGrupo(prm) {
      if (grupo === 'pca') return abrirPca(conteudo, prm);
      if (grupo === 'sancionados') return abrirSancoes(conteudo, prm);
      const g = GRUPOS_LIC.find((x) => x[0] === grupo);
      const mods = g[2];
      conteudo.replaceChildren(el('p', { class: 'carregando' }, 'Carregando…'));
      const { data: anosLic, error } = await sb.rpc('licitacoes_anos', { p_orgao: org(), p_modalidades: mods });
      if (error) { conteudo.replaceChildren(el('p', null, 'Não foi possível carregar. Tente novamente.')); return; }
      // O ano corrente sempre aparece: sem processos, a página diz isso expressamente (exigência do PNTP 8.1).
      const anoAtual = new Date().getFullYear();
      const contagem = new Map((anosLic || []).map((x) => [x.ano, x.total]));
      if (!contagem.has(anoAtual)) contagem.set(anoAtual, 0);
      const anos = [...contagem.keys()].sort((a, b) => b - a);
      const pedido = parseInt(prm.get('ano'), 10);
      let ano = anos.includes(pedido) ? pedido : anos[0];
      const painelAno = el('div', { class: 'painel-guia painel-guia-interno', role: 'tabpanel' });
      const faixa = faixaAbas(anos.map((a) => [a, a + ' (' + contagem.get(a) + ')']), ano, 'Ano', true, (id) => { ano = Number(id); abrirAno(); });
      conteudo.replaceChildren(faixa.lista, painelAno);
      faixa.marcar(ano);
      abrirAno();

      function abrirAno() {
        history.replaceState(null, '', '#/licitacoes/' + grupo + '?ano=' + ano);
        if (!contagem.get(ano)) {
          painelAno.replaceChildren(el('p', { class: 'vazio' }, g[3].replace('{ano}', ano) + (ano === anoAtual ? ' até esta data.' : '.')));
          return;
        }
        const f = { busca: '', mes: '', modalidade: '', andamento: '' };
        const montar = (sel, op) => {
          let q = sb.from('licitacoes').select(sel || CAMPOS_LIC, op).eq('orgao_id', org()).in('modalidade', mods).eq('ano', ano);
          if (f.busca) q = q.ilike('busca', termo(f.busca));
          // Mês pela data de publicação (dentro do ano escolhido).
          if (f.mes) { const m = Number(f.mes); q = q.gte('data_publicacao', ano + '-' + String(m).padStart(2, '0') + '-01').lt('data_publicacao', (m === 12 ? (ano + 1) + '-01' : ano + '-' + String(m + 1).padStart(2, '0')) + '-01'); }
          if (f.modalidade) q = q.eq('modalidade', f.modalidade);
          if (f.andamento) q = q.eq('andamento', f.andamento);
          return q;
        };
        // Tabela HTML estruturada (PNTP 8.1): nº e modalidade, objeto, data da sessão, valor e situação.
        // Ordem numérica sequencial por modalidade (Matriz 2026): coluna chave_ordem do script 17.
        const corpoTab = el('tbody');
        const tabela = el('div', { class: 'tabela-rolagem' }, el('table', { class: 'tabela-dados tabela-lic' },
          el('caption', { class: 'sr' }, g[1] + ' de ' + ano),
          el('thead', null, el('tr', null, ['Nº / Modalidade', 'Objeto', 'Data da sessão', 'Valor estimado / homologado', 'Situação'].map((t) => el('th', { scope: 'col' }, t)),
            el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Detalhes')))),
          corpoTab));
        const vazio = el('div');
        const mais = el('div', { class: 'mais' });
        const totalTxt = el('span', { class: 'meta', role: 'status' });
        let itens = [], versao = 0;
        async function carregar(reiniciar) {
          const minha = reiniciar ? ++versao : versao;
          const [linhas, cont] = await Promise.all([
            paginar(montar, 'chave_ordem', reiniciar ? null : itens[itens.length - 1], 50, true),   // modalidade + número (PNTP 8.1)
            reiniciar ? montar('id', { count: 'exact', head: true }) : Promise.resolve(null)]);
          if (minha !== versao) return;
          if (cont) totalTxt.textContent = (cont.count || 0) + ((cont.count || 0) === 1 ? ' processo' : ' processos');
          itens = reiniciar ? linhas : itens.concat(linhas);
          tabela.hidden = !itens.length;
          vazio.replaceChildren(itens.length ? '' : el('p', { class: 'vazio' }, 'Nenhum processo com esses filtros.'));
          if (reiniciar) corpoTab.replaceChildren(...linhas.map(linhaLic)); else corpoTab.append(...linhas.map(linhaLic));
          const btn = el('button', { type: 'button', class: 'botao botao-claro' }, 'Carregar mais');
          btn.addEventListener('click', async () => { btn.disabled = true; btn.textContent = 'Carregando…'; await carregar(false); });
          mais.replaceChildren(linhas.length === 50 ? btn : '');
        }
        const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        const fBusca = el('input', { type: 'search', placeholder: 'Ex.: merenda, combustível, 012/2026' });
        const fMes = el('select', null, el('option', { value: '' }, 'Todos'), MESES.map((m, k) => el('option', { value: k + 1 }, m)));
        const fMod = el('select', null, el('option', { value: '' }, 'Todas'), mods.map((m) => el('option', { value: m }, MOD_LIC[m])));
        const fAnd = el('select', null, el('option', { value: '' }, 'Todas'), Object.entries(AND_LIC).map(([k, v]) => el('option', { value: k }, v[0])));
        let espera;
        const aplicar = () => { Object.assign(f, { busca: fBusca.value.trim(), mes: fMes.value, modalidade: fMod.value, andamento: fAnd.value }); carregar(true); };
        [fMes, fMod, fAnd].forEach((x) => x.addEventListener('change', aplicar));
        fBusca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(aplicar, 400); });
        const exportar = S.botoesExportar('licitacoes-' + grupo + '-' + ano, COLUNAS_LIC, async (de, ate) => {
          const { data } = await montar().order('chave_ordem').order('id').range(de, ate);
          return data || [];
        });
        painelAno.replaceChildren(
          el('form', { class: 'filtros', role: 'search', onsubmit: (e) => { e.preventDefault(); aplicar(); } },
            el('label', null, 'Pesquisar (objeto ou número)', fBusca), el('label', null, 'Mês', fMes),
            mods.length > 1 ? el('label', null, 'Modalidade', fMod) : null, el('label', null, 'Situação', fAnd)),
          el('div', { class: 'barra-lista' }, totalTxt, exportar), tabela, vazio, mais);
        tabela.hidden = true;
        carregar(true).catch(() => vazio.replaceChildren(el('p', null, 'Não foi possível carregar. Tente novamente.')));
      }
    }
  };

  // ---------- PCA (PNTP 8.6) ----------
  // Abas de ano; o ano corrente aparece sempre. Sem PCA no ano, a página diz que ainda não foi
  // publicado (não é "declaração de inexistência": o PCA é obrigatório e isso não pontua).
  const TIPO_PCA = { plano: 'Plano de Contratações Anual', atualizacao: 'Atualização / revisão' };
  const COLUNAS_PCA = [['ano', 'Ano'], ['tipo', 'Documento', (v) => TIPO_PCA[v] || v], ['data_aprovacao', 'Aprovação'], ['ato_aprovacao', 'Ato de aprovação'],
    ['valor_total', 'Valor total estimado'], ['qtd_itens', 'Itens'], ['descricao', 'Observação'], ['arquivo_url', 'Arquivo'], ['link_externo', 'Link']];
  async function abrirPca(conteudo, prm) {
    conteudo.replaceChildren(el('p', { class: 'carregando' }, 'Carregando…'));
    const { data: anosPca, error } = await sb.rpc('pca_anos', { p_orgao: org() });
    if (error) { conteudo.replaceChildren(el('p', null, 'Não foi possível carregar. Tente novamente.')); return; }
    const anoAtual = new Date().getFullYear();
    const contagem = new Map((anosPca || []).map((x) => [x.ano, x.total]));
    if (!contagem.has(anoAtual)) contagem.set(anoAtual, 0);
    const anos = [...contagem.keys()].sort((a, b) => b - a);
    const pedido = parseInt(prm.get('ano'), 10);
    let ano = anos.includes(pedido) ? pedido : anos[0];
    const painelAno = el('div', { class: 'painel-guia painel-guia-interno', role: 'tabpanel' });
    const faixa = faixaAbas(anos.map((a) => [a, String(a)]), ano, 'Ano', true, (id) => { ano = Number(id); abrirAno(); });
    conteudo.replaceChildren(el('p', { class: 'meta' }, 'O PCA reúne as contratações que o órgão planeja fazer no ano (Lei 14.133/2021, art. 12, VII).'), faixa.lista, painelAno);
    faixa.marcar(ano);
    abrirAno();

    async function abrirAno() {
      history.replaceState(null, '', '#/licitacoes/pca?ano=' + ano);
      painelAno.replaceChildren(el('p', { class: 'carregando' }, 'Carregando…'));
      const buscar = () => sb.from('pca').select('id, ano, tipo, data_aprovacao, ato_aprovacao, valor_total, qtd_itens, descricao, arquivo_url, link_externo')
        .eq('orgao_id', org()).eq('ano', ano).order('tipo', { ascending: false }).order('data_aprovacao', { ascending: false });
      const { data, error: e2 } = await buscar().limit(200);
      if (e2) { painelAno.replaceChildren(el('p', null, 'Não foi possível carregar. Tente novamente.')); return; }
      const docs = data || [];
      if (!docs.length) { painelAno.replaceChildren(el('p', { class: 'vazio' }, 'O Plano de Contratações Anual de ' + ano + ' ainda não foi publicado neste portal.')); return; }
      const exportar = S.botoesExportar('pca-' + ano, COLUNAS_PCA, async (de, ate) => { const r = await buscar().range(de, ate); return r.data || []; });
      painelAno.replaceChildren(
        el('div', { class: 'barra-lista' }, el('span', { class: 'meta' }, docs.length + (docs.length === 1 ? ' documento' : ' documentos')), exportar),
        el('div', { class: 'tabela-rolagem' }, el('table', { class: 'tabela-dados tabela-lic' },
          el('caption', { class: 'sr' }, 'Plano de Contratações Anual de ' + ano),
          el('thead', null, el('tr', null, ['Documento', 'Aprovação', 'Valor total estimado', 'Itens', 'Arquivo'].map((t) => el('th', { scope: 'col' }, t)))),
          el('tbody', null, docs.map((d) => el('tr', null,
            el('td', { 'data-rotulo': 'Documento' }, el('strong', null, TIPO_PCA[d.tipo] + ' ' + d.ano),
              d.ato_aprovacao ? el('span', { class: 'meta' }, d.ato_aprovacao) : null, d.descricao ? el('span', { class: 'meta' }, d.descricao) : null),
            el('td', { 'data-rotulo': 'Aprovação', class: 'num' }, dataBR(d.data_aprovacao)),
            el('td', { 'data-rotulo': 'Valor total estimado', class: 'num' }, d.valor_total != null ? moedaBR(d.valor_total) : '—'),
            el('td', { 'data-rotulo': 'Itens', class: 'num' }, d.qtd_itens != null ? String(d.qtd_itens) : '—'),
            el('td', { 'data-rotulo': 'Arquivo' },
              d.arquivo_url ? el('a', { href: d.arquivo_url, target: '_blank', rel: 'noopener', class: 'botao botao-claro botao-p' }, 'PDF', el('span', { class: 'sr' }, ' de ' + TIPO_PCA[d.tipo] + ' ' + d.ano + ' (abre em nova aba)')) : null,
              d.link_externo ? el('a', { href: d.link_externo, target: '_blank', rel: 'noopener', class: 'botao botao-claro botao-p' }, /pncp\.gov\.br/.test(d.link_externo) ? 'Ver no PNCP' : 'Link',
                el('span', { class: 'sr' }, ' (abre em nova aba)')) : null)))))));
    }
  }

  // ---------- sancionados (PNTP 8.7) ----------
  // Relação do PRÓPRIO órgão (o CEIS/CNEP é complemento). Sem nenhuma sanção publicada, a
  // página declara expressamente que não há sancionados (exigência da Cartilha 2026).
  const TIPO_SANCAO = { advertencia: 'Advertência', multa: 'Multa', impedimento: 'Impedimento de licitar e contratar',
    inidoneidade: 'Declaração de inidoneidade', suspensao: 'Suspensão temporária', outra: 'Outra sanção' };
  const SANCAO_PRAZO = ['impedimento', 'inidoneidade', 'suspensao'];
  const sancaoVigente = (s) => SANCAO_PRAZO.includes(s.tipo) && (!s.fim || s.fim >= hojeISO()) && (!s.inicio || s.inicio <= hojeISO());
  const CAMPOS_SANCAO = 'id, sancionado_nome, sancionado_doc, tipo, fundamento, motivo, processo, referencia, ano, data_aplicacao, inicio, fim, valor_multa, ato, arquivo_url, link_externo';
  const COLUNAS_SANCAO = [['sancionado_nome', 'Sancionado'], ['sancionado_doc', 'CNPJ/CPF', (v) => docCtr(v)], ['tipo', 'Sanção', (v) => TIPO_SANCAO[v] || v],
    ['fundamento', 'Fundamento'], ['motivo', 'Motivo'], ['processo', 'Processo'], ['referencia', 'Licitação ou contrato'], ['data_aplicacao', 'Aplicação'],
    ['inicio', 'Início'], ['fim', 'Fim'], ['valor_multa', 'Valor da multa'], ['ato', 'Ato'], ['arquivo_url', 'Arquivo'], ['link_externo', 'Link']];
  async function abrirSancoes(conteudo) {
    history.replaceState(null, '', '#/licitacoes/sancionados');
    conteudo.replaceChildren(el('p', { class: 'carregando' }, 'Carregando…'));
    const { count, error } = await sb.from('sancoes').select('id', { count: 'exact', head: true }).eq('orgao_id', org());
    if (error) { conteudo.replaceChildren(el('p', null, 'Não foi possível carregar. Tente novamente.')); return; }
    const intro = el('p', { class: 'meta' }, 'Licitantes e contratados que receberam sanção administrativa deste órgão (Lei 14.133/2021, art. 156). Consulte também o cadastro nacional de ',
      el('a', { href: 'https://portaldatransparencia.gov.br/sancoes/ceis', target: '_blank', rel: 'noopener' }, 'empresas punidas (CEIS/CNEP)', el('span', { class: 'sr' }, ' (abre em nova aba)')), '.');
    if (!count) {
      conteudo.replaceChildren(intro, el('p', { class: 'vazio' }, 'Não há licitantes ou contratados sancionados administrativamente por este órgão até esta data.'));
      return;
    }
    const f = { busca: '', tipo: '', vigencia: '' };
    const montar = (sel, op) => {
      let q = sb.from('sancoes').select(sel || CAMPOS_SANCAO, op).eq('orgao_id', org());
      if (f.busca) q = q.ilike('busca', termo(f.busca));
      if (f.tipo) q = q.eq('tipo', f.tipo);
      if (f.vigencia === 'vigente') q = q.in('tipo', SANCAO_PRAZO).or('fim.is.null,fim.gte.' + hojeISO());
      if (f.vigencia === 'encerrada') q = q.or('fim.lt.' + hojeISO() + ',tipo.in.(advertencia,multa,outra)');
      if (f.ano) q = q.eq('ano', Number(f.ano));
      return q;
    };
    const corpoTab = el('tbody');
    const tabela = el('div', { class: 'tabela-rolagem' }, el('table', { class: 'tabela-dados tabela-lic' },
      el('caption', { class: 'sr' }, 'Licitantes e contratados sancionados'),
      el('thead', null, el('tr', null, ['Sancionado', 'Sanção', 'Aplicação', 'Prazo', 'Processo / ato'].map((t) => el('th', { scope: 'col' }, t)))), corpoTab));
    const vazio = el('div'), mais = el('div', { class: 'mais' }), totalTxt = el('span', { class: 'meta', role: 'status' });
    let itens = [], versao = 0;
    const linha = (s) => el('tr', null,
      el('td', { 'data-rotulo': 'Sancionado' }, el('strong', null, s.sancionado_nome), s.sancionado_doc ? el('span', { class: 'meta' }, docCtr(s.sancionado_doc)) : null,
        s.referencia ? el('span', { class: 'meta' }, s.referencia) : null),
      el('td', { 'data-rotulo': 'Sanção' }, TIPO_SANCAO[s.tipo] || s.tipo, s.tipo === 'multa' && s.valor_multa != null ? el('span', { class: 'meta' }, moedaBR(s.valor_multa)) : null,
        s.fundamento ? el('span', { class: 'meta' }, s.fundamento) : null, s.motivo ? el('span', { class: 'meta' }, s.motivo) : null),
      el('td', { 'data-rotulo': 'Aplicação', class: 'num' }, dataBR(s.data_aplicacao)),
      el('td', { 'data-rotulo': 'Prazo' }, SANCAO_PRAZO.includes(s.tipo)
        ? [el('span', { class: 'etiqueta ' + (sancaoVigente(s) ? 'etiqueta-vermelha' : 'etiqueta-verde') }, sancaoVigente(s) ? 'Em vigor' : 'Encerrada'),
          el('span', { class: 'meta' }, (s.inicio ? dataBR(s.inicio) : '') + (s.fim ? ' a ' + dataBR(s.fim) : ''))]
        : '—'),
      el('td', { 'data-rotulo': 'Processo / ato' }, s.processo ? el('span', null, 'Processo ' + s.processo) : null, s.ato ? el('span', { class: 'meta' }, s.ato) : null,
        s.arquivo_url || s.link_externo ? el('a', { href: s.arquivo_url || s.link_externo, target: '_blank', rel: 'noopener', class: 'botao botao-claro botao-p' },
          s.arquivo_url ? 'PDF do ato' : 'Ver ato', el('span', { class: 'sr' }, ' de ' + s.sancionado_nome + ' (abre em nova aba)')) : null));
    async function carregar(reiniciar) {
      const minha = reiniciar ? ++versao : versao;
      const [linhas, cont] = await Promise.all([
        paginar(montar, 'data_aplicacao', reiniciar ? null : itens[itens.length - 1], 50),
        reiniciar ? montar('id', { count: 'exact', head: true }) : Promise.resolve(null)]);
      if (minha !== versao) return;
      if (cont) totalTxt.textContent = (cont.count || 0) + ((cont.count || 0) === 1 ? ' sanção' : ' sanções');
      itens = reiniciar ? linhas : itens.concat(linhas);
      tabela.hidden = !itens.length;
      vazio.replaceChildren(itens.length ? '' : el('p', { class: 'vazio' }, 'Nenhuma sanção com esses filtros.'));
      if (reiniciar) corpoTab.replaceChildren(...linhas.map(linha)); else corpoTab.append(...linhas.map(linha));
      const btn = el('button', { type: 'button', class: 'botao botao-claro' }, 'Carregar mais');
      btn.addEventListener('click', async () => { btn.disabled = true; btn.textContent = 'Carregando…'; await carregar(false); });
      mais.replaceChildren(linhas.length === 50 ? btn : '');
    }
    const { data: anosS } = await sb.rpc('sancoes_anos', { p_orgao: org() });
    const fBusca = el('input', { type: 'search', placeholder: 'Nome, CNPJ, processo ou licitação' });
    const fTipo = el('select', null, el('option', { value: '' }, 'Todas'), Object.entries(TIPO_SANCAO).map(([k, v]) => el('option', { value: k }, v)));
    const fVig = el('select', null, el('option', { value: '' }, 'Todas'), el('option', { value: 'vigente' }, 'Em vigor'), el('option', { value: 'encerrada' }, 'Encerradas ou sem prazo'));
    const fAno = el('select', null, el('option', { value: '' }, 'Todos'), (anosS || []).map((x) => el('option', { value: x.ano }, String(x.ano))));
    let espera;
    const aplicar = () => { Object.assign(f, { busca: fBusca.value.trim(), tipo: fTipo.value, vigencia: fVig.value, ano: fAno.value }); carregar(true); };
    [fTipo, fVig, fAno].forEach((x) => x.addEventListener('change', aplicar));
    fBusca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(aplicar, 400); });
    const exportar = S.botoesExportar('sancionados', COLUNAS_SANCAO, async (de, ate) => {
      const { data } = await montar().order('data_aplicacao', { ascending: false }).order('id').range(de, ate);
      return data || [];
    });
    conteudo.replaceChildren(intro,
      el('form', { class: 'filtros', role: 'search', onsubmit: (e) => { e.preventDefault(); aplicar(); } },
        el('label', null, 'Pesquisar', fBusca), el('label', null, 'Sanção', fTipo), el('label', null, 'Vigência', fVig), el('label', null, 'Ano da aplicação', fAno)),
      el('div', { class: 'barra-lista' }, totalTxt, exportar), tabela, vazio, mais);
    tabela.hidden = true;
    carregar(true).catch(() => vazio.replaceChildren(el('p', null, 'Não foi possível carregar. Tente novamente.')));
  }

  function linhaLic(l) {
    const and = AND_LIC[l.andamento] || [l.andamento, 'etiqueta-ambar'];
    const homologado = l.valor_homologado !== null && l.valor_homologado !== undefined;
    const valor = homologado ? l.valor_homologado : l.valor_estimado;
    const data = l.data_abertura ? new Date(l.data_abertura).toLocaleDateString('pt-BR') : dataBR(l.data_publicacao);
    const link = '#/licitacao/' + l.id;
    return el('tr', null,
      el('td', { 'data-rotulo': 'Nº / Modalidade' }, el('a', { href: link, class: 'lic-num' }, l.numero || 's/nº'), el('span', { class: 'meta' }, MOD_LIC[l.modalidade] || l.modalidade),
        l.srp ? el('span', { class: 'meta' }, 'Registro de preços') : null),
      el('td', { 'data-rotulo': 'Objeto', class: 'lic-obj' }, l.objeto.length > 220 ? l.objeto.slice(0, 220) + '…' : l.objeto),
      el('td', { 'data-rotulo': 'Data da sessão', class: 'num' }, data, l.data_abertura ? null : el('span', { class: 'meta' }, 'publicação')),
      el('td', { 'data-rotulo': 'Valor', class: 'num' }, valor !== null && valor !== undefined ? moedaBR(valor) : '—', valor !== null && valor !== undefined ? el('span', { class: 'meta' }, homologado ? 'homologado' : 'estimado') : null),
      el('td', { 'data-rotulo': 'Situação' }, el('span', { class: 'etiqueta ' + and[1] }, and[0])),
      el('td', { 'data-rotulo': '' }, el('a', { href: link, class: 'botao botao-claro botao-p' }, 'Detalhes', el('span', { class: 'sr' }, ' de ' + nomeLic(l)))));
  }

  R.licitacao = async function (main, partes) {
    const id = partes[0];
    if (!/^[0-9a-f-]{36}$/i.test(id || '')) return R['*'](main);
    const [{ data: l }, { data: docs }, { data: ctrs }] = await Promise.all([
      sb.from('licitacoes').select(CAMPOS_LIC).eq('orgao_id', org()).eq('id', id).maybeSingle(),
      sb.from('contratos').select('id, tipo, numero, contratado_nome, valor_atual').eq('licitacao_id', id).order('data_assinatura').limit(100),
      sb.from('licitacoes_documentos').select('tipo, titulo, data, arquivo_url, link_externo, ordem').eq('licitacao_id', id).order('data').order('ordem').limit(500)
    ]);
    if (!l) return R['*'](main);
    const grupo = (GRUPOS_LIC.slice(1).find((g) => g[2].includes(l.modalidade)) || GRUPOS_LIC[0]);
    S.titulo(nomeLic(l)); S.trilha(['Transparência', '#/transparencia'], ['Licitações', '#/licitacoes/' + grupo[0] + '?ano=' + l.ano], [nomeLic(l)]);
    const and = AND_LIC[l.andamento] || [l.andamento, 'etiqueta-ambar'];
    const linha = (rot, val) => val || val === 0 ? el('div', null, el('dt', null, rot), el('dd', null, val)) : null;
    const lista = docs || [];
    pagina(main,
      el('p', { class: 'meta' }, grupo[1]),
      el('h1', null, nomeLic(l)),
      el('p', null, el('span', { class: 'etiqueta ' + and[1] }, and[0]), l.srp ? el('span', { class: 'etiqueta', style: 'margin-left:6px' }, 'Registro de preços') : null),
      el('section', { class: 'cartao' }, el('h2', null, 'Objeto'), el('p', { style: 'white-space:pre-line' }, l.objeto)),
      el('dl', { class: 'ficha-lic' },
        linha('Modalidade', MOD_LIC[l.modalidade] || l.modalidade), linha('Número', l.numero), linha('Processo administrativo', l.processo),
        linha('Data de publicação', dataBR(l.data_publicacao)),
        linha('Abertura / sessão pública', l.data_abertura ? new Date(l.data_abertura).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : null),
        linha('Critério de julgamento', l.criterio), linha('Fundamento legal', l.amparo_legal), linha('Unidade requisitante', l.unidade_nome),
        linha('Valor estimado', l.valor_estimado !== null ? moedaBR(l.valor_estimado) : null), linha('Valor homologado / contratado', l.valor_homologado !== null ? moedaBR(l.valor_homologado) : null),
        linha('Resultado', l.vencedores)),
      el('section', { style: 'margin-top:24px' }, el('h2', null, 'Documentos'),
        lista.length ? el('ul', { class: 'partes-contas cartao' }, lista.map((d) => el('li', null,
          el('a', { href: d.arquivo_url || d.link_externo, target: '_blank', rel: 'noopener' }, d.titulo, el('span', { class: 'sr' }, ' (abre em nova aba)')),
          el('span', { class: 'meta' }, (DOC_LIC[d.tipo] || 'Documento') + ' · ' + dataBR(d.data) + (d.arquivo_url ? ' · PDF' : '')))))
          : el('p', { class: 'vazio' }, l.link_externo ? 'Os documentos deste processo estão no link abaixo.' : 'Nenhum documento publicado ainda.')),
      l.link_externo ? el('p', { style: 'margin-top:16px' }, el('a', { class: 'botao botao-claro', href: l.link_externo, target: '_blank', rel: 'noopener' },
        l.origem === 'pncp' ? 'Ver no PNCP' : 'Ver o processo no sistema de origem', el('span', { class: 'sr' }, ' (abre em nova aba)'))) : null,
      (ctrs || []).length ? el('section', { style: 'margin-top:24px' }, el('h2', null, 'Contratos decorrentes'),
        el('ul', { class: 'partes-contas cartao' }, ctrs.map((c) => el('li', null, el('a', { href: '#/contrato/' + c.id }, nomeCtr(c)),
          el('span', { class: 'meta' }, c.contratado_nome + (c.valor_atual !== null ? ' · ' + moedaBR(c.valor_atual) : '')))))) : null,
      el('p', { class: 'meta', style: 'margin-top:18px' }, 'Última atualização: ' + dataBR(l.atualizado_em)));
  };

  // ===================================================================
  // CONTRATOS (9.1 a 9.3)
  // Abas: Contratos (com abas de ano) | Fiscais de contratos — a Cartilha
  // não aceita a lista de fiscais só dentro de cada contrato (9.3).
  // Filtro mínimo exigido no 9.1: período.
  // ===================================================================
  const TIPO_CTR = { contrato: 'Contrato', ata_registro_precos: 'Ata de registro de preços', empenho: 'Nota de empenho', carta_contrato: 'Carta-contrato', outro: 'Instrumento' };
  const FUNCAO_CTR = { gestor: 'Gestor', fiscal: 'Fiscal', fiscal_tecnico: 'Fiscal técnico', fiscal_administrativo: 'Fiscal administrativo', fiscal_suplente: 'Fiscal suplente' };
  const ADIT_CTR = { prazo: 'Prazo', valor: 'Valor', prazo_valor: 'Prazo e valor', qualitativo: 'Qualitativo', apostilamento: 'Apostilamento', rescisao: 'Rescisão', outro: 'Outro' };
  const CAMPOS_CTR = 'id, licitacao_id, tipo, numero, ano, processo, objeto, contratado_nome, contratado_doc, unidade_nome, valor_inicial, valor_atual, data_assinatura, vigencia_inicio, vigencia_fim, vigencia_fim_atual, rescindido_em, arquivo_url, link_externo, origem, atualizado_em';
  const hojeISO = () => new Date().toISOString().slice(0, 10);
  // CPF de pessoa física aparece mascarado (LGPD); CNPJ completo.
  const docCtr = (d) => !d ? '' : d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : '***.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-**';
  const nomeCtr = (c) => (TIPO_CTR[c.tipo] || 'Contrato') + (c.numero ? ' nº ' + c.numero : '');
  const vigCtr = (c) => c.rescindido_em ? ['Rescindido', 'etiqueta-vermelha'] : !c.vigencia_fim_atual ? ['Vigência não informada', 'etiqueta-ambar']
    : c.vigencia_fim_atual >= hojeISO() ? ['Vigente', 'etiqueta-verde'] : ['Encerrado', 'etiqueta-ambar'];
  const COLUNAS_CTR = [['tipo', 'Instrumento', (v) => TIPO_CTR[v] || v], ['numero', 'Número'], ['ano', 'Ano'], ['processo', 'Processo'], ['objeto', 'Objeto'],
    ['contratado_nome', 'Contratado'], ['contratado_doc', 'CNPJ/CPF', (v) => docCtr(v)], ['valor_inicial', 'Valor inicial'], ['valor_atual', 'Valor atual (com aditivos)'],
    ['data_assinatura', 'Assinatura'], ['vigencia_inicio', 'Início da vigência'], ['vigencia_fim_atual', 'Fim da vigência (atual)'], ['rescindido_em', 'Rescindido em'],
    ['unidade_nome', 'Unidade'], ['arquivo_url', 'Inteiro teor', (v, r) => v || r.link_externo || '']];

  R.contratos = async function (main, partes, params) {
    S.titulo('Contratos'); S.trilha(['Transparência', '#/transparencia'], ['Contratos']);
    let aba = partes[0] === 'fiscais' ? 'fiscais' : 'contratos';
    const conteudo = el('div', { class: 'painel-guia', role: 'tabpanel' });
    const { lista } = faixaAbas([['contratos', 'Contratos e aditivos'], ['fiscais', 'Fiscais de contratos']], aba, 'Seção', false, (id) => { aba = id; abrir(new URLSearchParams()); });
    pagina(main, el('h1', null, 'Contratos'),
      el('p', { class: 'sub' }, 'Contratos celebrados, com contratado, valor, objeto, vigência, aditivos, inteiro teor e fiscais.'),
      lista, conteudo,
      el('p', { class: 'meta', style: 'margin-top:18px' }, 'A ordem cronológica de pagamentos fica no ',
        S.conf.transparencia_url ? el('a', { href: S.conf.transparencia_url, target: '_blank', rel: 'noopener' }, 'Portal da Transparência') : 'Portal da Transparência', '.'));
    await abrir(params);

    async function abrir(prm) { return aba === 'fiscais' ? abrirFiscais() : abrirContratos(prm); }

    async function abrirContratos(prm) {
      conteudo.replaceChildren(el('p', { class: 'carregando' }, 'Carregando…'));
      const { data: anosC, error } = await sb.rpc('contratos_anos', { p_orgao: org() });
      if (error) { conteudo.replaceChildren(el('p', null, 'Não foi possível carregar. Tente novamente.')); return; }
      const anoAtual = new Date().getFullYear();
      const contagem = new Map((anosC || []).map((x) => [x.ano, x.total]));
      if (!contagem.has(anoAtual)) contagem.set(anoAtual, 0);
      const anos = [...contagem.keys()].sort((a, b) => b - a);
      const pedido = parseInt(prm.get('ano'), 10);
      let ano = anos.includes(pedido) ? pedido : anos[0];
      const painelAno = el('div', { class: 'painel-guia painel-guia-interno', role: 'tabpanel' });
      const faixa = faixaAbas(anos.map((a) => [a, a + ' (' + contagem.get(a) + ')']), ano, 'Ano', true, (id) => { ano = Number(id); abrirAno(); });
      conteudo.replaceChildren(faixa.lista, painelAno);
      faixa.marcar(ano);
      abrirAno();

      function abrirAno() {
        history.replaceState(null, '', '#/contratos?ano=' + ano);
        if (!contagem.get(ano)) { painelAno.replaceChildren(el('p', { class: 'vazio' }, 'Não foram celebrados contratos em ' + ano + (ano === anoAtual ? ' até esta data.' : '.'))); return; }
        const f = { busca: '', de: '', ate: '', vig: '' };
        const montar = (sel, op) => {
          let q = sb.from('contratos').select(sel || CAMPOS_CTR, op).eq('orgao_id', org()).eq('ano', ano);
          if (f.busca) q = q.ilike('busca', termo(f.busca));
          // Período: contratos cuja vigência toca o intervalo escolhido.
          if (f.de) q = q.gte('vigencia_fim_atual', f.de);
          if (f.ate) q = q.lte('vigencia_inicio', f.ate);
          if (f.vig === 'vigente') q = q.is('rescindido_em', null).gte('vigencia_fim_atual', hojeISO());
          if (f.vig === 'encerrado') q = q.or('vigencia_fim_atual.lt.' + hojeISO() + ',rescindido_em.not.is.null');
          return q;
        };
        const corpoTab = el('tbody');
        const tabela = el('div', { class: 'tabela-rolagem' }, el('table', { class: 'tabela-dados tabela-lic tabela-ctr' },
          el('caption', { class: 'sr' }, 'Contratos de ' + ano),
          el('thead', null, el('tr', null, ['Nº / Instrumento', 'Contratado', 'Objeto', 'Valor', 'Vigência', 'Situação'].map((t) => el('th', { scope: 'col' }, t)), el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Detalhes')))),
          corpoTab));
        const vazio = el('div'), mais = el('div', { class: 'mais' }), totalTxt = el('span', { class: 'meta', role: 'status' });
        let itens = [], versao = 0;
        async function carregar(reiniciar) {
          const minha = reiniciar ? ++versao : versao;
          const [linhas, cont] = await Promise.all([paginar(montar, 'data_assinatura', reiniciar ? null : itens[itens.length - 1], 50),
            reiniciar ? montar('id', { count: 'exact', head: true }) : Promise.resolve(null)]);
          if (minha !== versao) return;
          if (cont) totalTxt.textContent = (cont.count || 0) + ((cont.count || 0) === 1 ? ' contrato' : ' contratos');
          itens = reiniciar ? linhas : itens.concat(linhas);
          tabela.hidden = !itens.length;
          vazio.replaceChildren(itens.length ? '' : el('p', { class: 'vazio' }, 'Nenhum contrato com esses filtros.'));
          if (reiniciar) corpoTab.replaceChildren(...linhas.map(linhaCtr)); else corpoTab.append(...linhas.map(linhaCtr));
          const btn = el('button', { type: 'button', class: 'botao botao-claro' }, 'Carregar mais');
          btn.addEventListener('click', async () => { btn.disabled = true; btn.textContent = 'Carregando…'; await carregar(false); });
          mais.replaceChildren(linhas.length === 50 ? btn : '');
        }
        const fBusca = el('input', { type: 'search', placeholder: 'Contratado, CNPJ, objeto ou número' });
        const fDe = el('input', { type: 'date' }), fAte = el('input', { type: 'date' });
        const fVig = el('select', null, el('option', { value: '' }, 'Todos'), el('option', { value: 'vigente' }, 'Vigentes'), el('option', { value: 'encerrado' }, 'Encerrados ou rescindidos'));
        let espera;
        const aplicar = () => { Object.assign(f, { busca: fBusca.value.trim(), de: fDe.value, ate: fAte.value, vig: fVig.value }); carregar(true); };
        [fDe, fAte, fVig].forEach((x) => x.addEventListener('change', aplicar));
        fBusca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(aplicar, 400); });
        const exportar = S.botoesExportar('contratos-' + ano, COLUNAS_CTR, async (de, ate) => {
          const { data } = await montar().order('data_assinatura', { ascending: false }).order('id').range(de, ate);
          return data || [];
        });
        painelAno.replaceChildren(
          el('form', { class: 'filtros', role: 'search', onsubmit: (e) => { e.preventDefault(); aplicar(); } },
            el('label', null, 'Pesquisar', fBusca), el('label', null, 'Vigência de', fDe), el('label', null, 'até', fAte), el('label', null, 'Situação', fVig)),
          el('div', { class: 'barra-lista' }, totalTxt, exportar), tabela, vazio, mais);
        tabela.hidden = true;
        carregar(true).catch(() => vazio.replaceChildren(el('p', null, 'Não foi possível carregar. Tente novamente.')));
      }
    }

    async function abrirFiscais() {
      history.replaceState(null, '', '#/contratos/fiscais');
      const f = { busca: '', vig: '' };
      // Só fiscais de contratos publicados aparecem (regra do banco); a junção traz o contrato.
      const SEL = 'id, nome, funcao, ato, inicio, fim, contratos!inner(id, numero, ano, tipo, objeto, contratado_nome, vigencia_inicio, vigencia_fim_atual, rescindido_em)';
      const montar = (sel, op) => {
        let q = sb.from('contratos_fiscais').select(sel || SEL, op).eq('orgao_id', org());
        if (f.busca) q = q.ilike('busca', termo(f.busca));
        if (f.vig === 'vigente') q = q.is('contratos.rescindido_em', null).gte('contratos.vigencia_fim_atual', hojeISO());
        if (f.vig === 'encerrado') q = q.lt('contratos.vigencia_fim_atual', hojeISO());
        return q;
      };
      const corpoTab = el('tbody');
      const tabela = el('div', { class: 'tabela-rolagem' }, el('table', { class: 'tabela-dados' },
        el('caption', { class: 'sr' }, 'Fiscais de contratos'),
        el('thead', null, el('tr', null, ['Fiscal', 'Função', 'Contrato', 'Contratado', 'Vigência do contrato', 'Situação'].map((t) => el('th', { scope: 'col' }, t)))), corpoTab));
      const vazio = el('div'), mais = el('div', { class: 'mais' }), totalTxt = el('span', { class: 'meta', role: 'status' });
      let itens = [], versao = 0;
      const linha = (x) => {
        const c = x.contratos, sv = vigCtr(c);
        return el('tr', null,
          el('td', { 'data-rotulo': 'Fiscal' }, el('strong', null, x.nome), x.ato ? el('span', { class: 'meta' }, x.ato) : null),
          el('td', { 'data-rotulo': 'Função' }, FUNCAO_CTR[x.funcao] || x.funcao, x.inicio || x.fim ? el('span', { class: 'meta' }, (x.inicio ? dataBR(x.inicio) : '…') + ' a ' + (x.fim ? dataBR(x.fim) : 'atual')) : null),
          el('td', { 'data-rotulo': 'Contrato' }, el('a', { href: '#/contrato/' + c.id }, nomeCtr(c)), el('span', { class: 'meta' }, c.objeto.length > 90 ? c.objeto.slice(0, 90) + '…' : c.objeto)),
          el('td', { 'data-rotulo': 'Contratado' }, c.contratado_nome),
          el('td', { 'data-rotulo': 'Vigência', class: 'num' }, (dataBR(c.vigencia_inicio) || '?') + ' a ' + (dataBR(c.vigencia_fim_atual) || '?')),
          el('td', { 'data-rotulo': 'Situação' }, el('span', { class: 'etiqueta ' + sv[1] }, sv[0])));
      };
      async function carregar(reiniciar) {
        const minha = reiniciar ? ++versao : versao;
        const ultimo = reiniciar ? null : itens[itens.length - 1];
        // Ordem alfabética por nome (é cadastro de pessoas); cursor nome + id.
        let q = montar().order('nome').order('id').limit(50);
        if (ultimo) q = q.or('nome.gt.' + JSON.stringify(ultimo.nome) + ',and(nome.eq.' + JSON.stringify(ultimo.nome) + ',id.gt.' + ultimo.id + ')');
        const [{ data }, cont] = await Promise.all([q, reiniciar ? montar('id, contratos!inner(id)', { count: 'exact', head: true }) : Promise.resolve(null)]);
        if (minha !== versao) return;
        const linhas = data || [];
        if (cont) totalTxt.textContent = (cont.count || 0) + ((cont.count || 0) === 1 ? ' designação' : ' designações');
        itens = reiniciar ? linhas : itens.concat(linhas);
        tabela.hidden = !itens.length;
        vazio.replaceChildren(itens.length ? '' : el('p', { class: 'vazio' }, f.busca || f.vig ? 'Nenhum fiscal com esses filtros.' : 'Nenhum fiscal publicado ainda.'));
        if (reiniciar) corpoTab.replaceChildren(...linhas.map(linha)); else corpoTab.append(...linhas.map(linha));
        const btn = el('button', { type: 'button', class: 'botao botao-claro' }, 'Carregar mais');
        btn.addEventListener('click', async () => { btn.disabled = true; btn.textContent = 'Carregando…'; await carregar(false); });
        mais.replaceChildren(linhas.length === 50 ? btn : '');
      }
      const fBusca = el('input', { type: 'search', placeholder: 'Nome do fiscal ou portaria' });
      const fVig = el('select', null, el('option', { value: '' }, 'Vigentes e encerrados'), el('option', { value: 'vigente' }, 'Contratos vigentes'), el('option', { value: 'encerrado' }, 'Contratos encerrados'));
      let espera;
      const aplicar = () => { Object.assign(f, { busca: fBusca.value.trim(), vig: fVig.value }); carregar(true); };
      fVig.addEventListener('change', aplicar);
      fBusca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(aplicar, 400); });
      const exportar = S.botoesExportar('fiscais-de-contratos', [['nome', 'Fiscal'], ['funcao', 'Função', (v) => FUNCAO_CTR[v] || v], ['ato', 'Designação'],
        ['contrato', 'Contrato', (v, r) => nomeCtr(r.contratos)], ['objeto', 'Objeto', (v, r) => r.contratos.objeto], ['contratado', 'Contratado', (v, r) => r.contratos.contratado_nome],
        ['vig_ini', 'Início da vigência', (v, r) => r.contratos.vigencia_inicio], ['vig_fim', 'Fim da vigência', (v, r) => r.contratos.vigencia_fim_atual]],
        async (de, ate) => { const { data } = await montar().order('nome').order('id').range(de, ate); return data || []; });
      conteudo.replaceChildren(
        el('p', { class: 'meta' }, 'Relação dos fiscais e gestores de cada contrato, vigente e encerrado (PNTP 9.3).'),
        el('form', { class: 'filtros', role: 'search', onsubmit: (e) => { e.preventDefault(); aplicar(); } }, el('label', null, 'Pesquisar', fBusca), el('label', null, 'Contratos', fVig)),
        el('div', { class: 'barra-lista' }, totalTxt, exportar), tabela, vazio, mais);
      tabela.hidden = true;
      carregar(true).catch(() => vazio.replaceChildren(el('p', null, 'Não foi possível carregar. Tente novamente.')));
    }
  };

  function linhaCtr(c) {
    const sv = vigCtr(c);
    const link = '#/contrato/' + c.id;
    return el('tr', null,
      el('td', { 'data-rotulo': 'Nº / Instrumento' }, el('a', { href: link, class: 'lic-num' }, c.numero || 's/nº'), el('span', { class: 'meta' }, TIPO_CTR[c.tipo] || 'Contrato')),
      el('td', { 'data-rotulo': 'Contratado' }, c.contratado_nome, c.contratado_doc ? el('span', { class: 'meta nowrap' }, docCtr(c.contratado_doc)) : null),
      el('td', { 'data-rotulo': 'Objeto', class: 'lic-obj' }, c.objeto.length > 200 ? c.objeto.slice(0, 200) + '…' : c.objeto),
      el('td', { 'data-rotulo': 'Valor', class: 'num' }, c.valor_atual !== null ? moedaBR(c.valor_atual) : '—',
        c.valor_atual !== null && c.valor_inicial !== null && Number(c.valor_atual) !== Number(c.valor_inicial) ? el('span', { class: 'meta' }, 'inicial ' + moedaBR(c.valor_inicial)) : null),
      el('td', { 'data-rotulo': 'Vigência', class: 'num' }, (dataBR(c.vigencia_inicio) || '?') + ' a ' + (dataBR(c.vigencia_fim_atual) || '?'),
        c.vigencia_fim && c.vigencia_fim_atual && c.vigencia_fim !== c.vigencia_fim_atual ? el('span', { class: 'meta' }, 'prorrogado') : null),
      el('td', { 'data-rotulo': 'Situação' }, el('span', { class: 'etiqueta ' + sv[1] }, sv[0])),
      el('td', { 'data-rotulo': '' }, el('a', { href: link, class: 'botao botao-claro botao-p' }, 'Detalhes', el('span', { class: 'sr' }, ' de ' + nomeCtr(c)))));
  }

  R.contrato = async function (main, partes) {
    const id = partes[0];
    if (!/^[0-9a-f-]{36}$/i.test(id || '')) return R['*'](main);
    const [{ data: c }, { data: ad }, { data: fi }] = await Promise.all([
      sb.from('contratos').select(CAMPOS_CTR).eq('orgao_id', org()).eq('id', id).maybeSingle(),
      sb.from('contratos_aditivos').select('numero, tipo, data_assinatura, descricao, valor, nova_vigencia_fim, arquivo_url, link_externo').eq('contrato_id', id).order('data_assinatura').limit(200),
      sb.from('contratos_fiscais').select('nome, funcao, ato, inicio, fim').eq('contrato_id', id).order('funcao').order('nome').limit(100)
    ]);
    if (!c) return R['*'](main);
    let lic = null;
    if (c.licitacao_id) { const r = await sb.from('licitacoes').select('id, modalidade, numero').eq('id', c.licitacao_id).maybeSingle(); lic = r.data; }
    S.titulo(nomeCtr(c)); S.trilha(['Transparência', '#/transparencia'], ['Contratos', '#/contratos?ano=' + c.ano], [nomeCtr(c)]);
    const sv = vigCtr(c);
    const linha = (rot, val) => val || val === 0 ? el('div', null, el('dt', null, rot), el('dd', null, val)) : null;
    const teor = c.arquivo_url || c.link_externo;
    pagina(main,
      el('p', { class: 'meta' }, 'Contratos'),
      el('h1', null, nomeCtr(c)),
      el('p', null, el('span', { class: 'etiqueta ' + sv[1] }, sv[0])),
      el('section', { class: 'cartao' }, el('h2', null, 'Objeto'), el('p', { style: 'white-space:pre-line' }, c.objeto)),
      el('dl', { class: 'ficha-lic' },
        linha('Contratado', c.contratado_nome), linha('CNPJ / CPF', docCtr(c.contratado_doc)), linha('Processo administrativo', c.processo),
        linha('Licitação de origem', lic ? el('a', { href: '#/licitacao/' + lic.id }, (MOD_LIC[lic.modalidade] || '') + (lic.numero ? ' nº ' + lic.numero : '')) : null),
        linha('Assinatura', dataBR(c.data_assinatura)), linha('Vigência', (dataBR(c.vigencia_inicio) || '?') + ' a ' + (dataBR(c.vigencia_fim_atual) || '?')),
        linha('Rescindido em', c.rescindido_em ? dataBR(c.rescindido_em) : null),
        linha('Valor inicial', c.valor_inicial !== null ? moedaBR(c.valor_inicial) : null), linha('Valor atual (com aditivos)', c.valor_atual !== null ? moedaBR(c.valor_atual) : null),
        linha('Unidade contratante', c.unidade_nome)),
      teor ? el('p', { style: 'margin-top:16px' }, el('a', { class: 'botao', href: teor, target: '_blank', rel: 'noopener' },
        c.arquivo_url ? 'Inteiro teor do contrato (PDF)' : c.origem === 'pncp' ? 'Ver o contrato no PNCP' : 'Ver o contrato no sistema de origem', el('span', { class: 'sr' }, ' (abre em nova aba)'))) : null,
      el('section', { style: 'margin-top:24px' }, el('h2', null, 'Aditivos e apostilamentos'),
        (ad || []).length ? el('div', { class: 'tabela-rolagem' }, el('table', { class: 'tabela-dados' },
          el('thead', null, el('tr', null, ['Termo', 'Assinatura', 'Valor', 'Nova vigência', 'Inteiro teor'].map((t) => el('th', { scope: 'col' }, t)))),
          el('tbody', null, ad.map((a) => el('tr', null,
            el('td', { 'data-rotulo': 'Termo' }, el('strong', null, a.numero || ADIT_CTR[a.tipo]), el('span', { class: 'meta' }, ADIT_CTR[a.tipo] + (a.descricao ? ' · ' + a.descricao : ''))),
            el('td', { 'data-rotulo': 'Assinatura', class: 'num' }, dataBR(a.data_assinatura)),
            el('td', { 'data-rotulo': 'Valor', class: 'num' }, a.valor !== null ? moedaBR(a.valor) : '—'),
            el('td', { 'data-rotulo': 'Nova vigência', class: 'num' }, a.nova_vigencia_fim ? dataBR(a.nova_vigencia_fim) : '—'),
            el('td', { 'data-rotulo': 'Inteiro teor' }, a.arquivo_url || a.link_externo ? el('a', { href: a.arquivo_url || a.link_externo, target: '_blank', rel: 'noopener' }, a.arquivo_url ? 'PDF' : 'Link', el('span', { class: 'sr' }, ' (abre em nova aba)')) : '—'))))))
          : el('p', { class: 'vazio' }, 'Este contrato não tem aditivos.')),
      el('section', { style: 'margin-top:24px' }, el('h2', null, 'Fiscais e gestor'),
        (fi || []).length ? el('ul', { class: 'partes-contas cartao' }, fi.map((x) => el('li', null, el('strong', null, x.nome),
          el('span', { class: 'meta' }, (FUNCAO_CTR[x.funcao] || x.funcao) + (x.ato ? ' · ' + x.ato : '') + (x.inicio || x.fim ? ' · ' + (x.inicio ? dataBR(x.inicio) : '…') + ' a ' + (x.fim ? dataBR(x.fim) : 'atual') : '')))))
          : el('p', { class: 'vazio' }, 'Fiscal não informado.'),
        el('p', { class: 'meta' }, el('a', { href: '#/contratos/fiscais' }, 'Ver a relação de todos os fiscais de contratos'))),
      el('p', { class: 'meta', style: 'margin-top:18px' }, 'Última atualização: ' + dataBR(c.atualizado_em)));
  };

  R.ouvidoria = externo('ouvidoria', 'Ouvidoria', 'Elogios, sugestões, reclamações, solicitações e denúncias sobre os serviços.', 'ouvidoria_url');
  R.esic = externo('esic', 'e-SIC', 'Serviço de Informação ao Cidadão: pedidos de acesso à informação (Lei 12.527/2011).', 'esic_url');

  // ===================================================================
  // BUSCA GERAL (1.4)
  // ===================================================================
  R.busca = async function (main, partes, params) {
    const q = (params.get('q') || '').trim();
    S.titulo('Busca'); S.trilha(['Busca']);
    const campo = document.getElementById('campo-busca'); if (campo) campo.value = q;
    if (q.length < 2) { pagina(main, el('h1', null, 'Busca'), el('p', null, 'Digite pelo menos 2 letras no campo de pesquisa.')); return; }
    // Dentro de or() o curinga é * (o % confunde a sintaxe do filtro).
    const n = termo(q), cru = '*' + q.replace(/[%_*(),.]/g, ' ').trim() + '*';
    const [nt, pb, sv, pg, fq, un, ct, lc, co] = await Promise.all([
      sb.from('noticias').select('id, titulo, publicado_em').eq('orgao_id', org()).ilike('busca', n).order('publicado_em', { ascending: false }).limit(8),
      sb.from('publicacoes').select('id, tipo, numero, ano, ementa, arquivo_url, link_externo').eq('orgao_id', org()).ilike('busca', n).order('data_publicacao', { ascending: false }).limit(8),
      sb.from('servicos').select('id, nome').eq('orgao_id', org()).ilike('busca', n).order('nome').limit(8),
      sb.from('paginas').select('titulo, slug').eq('orgao_id', org()).or('titulo.ilike.' + cru + ',conteudo.ilike.' + cru).limit(8),
      sb.from('faq').select('pergunta').eq('orgao_id', org()).or('pergunta.ilike.' + cru + ',resposta.ilike.' + cru).limit(8),
      sb.from('unidades').select('id, nome').eq('orgao_id', org()).or('nome.ilike.' + cru + ',competencias.ilike.' + cru).limit(8),
      sb.from('documentos_contas').select('tipo, exercicio, exercicio_fim, periodo, periodicidade, parte').eq('orgao_id', org()).ilike('busca', n).order('exercicio', { ascending: false }).limit(8),
      sb.from('licitacoes').select('id, modalidade, numero, objeto').eq('orgao_id', org()).ilike('busca', n).order('data_publicacao', { ascending: false }).limit(8),
      sb.from('contratos').select('id, tipo, numero, objeto, contratado_nome').eq('orgao_id', org()).ilike('busca', n).order('data_assinatura', { ascending: false }).limit(8)
    ]);
    const grupos = [
      ['Serviços', (sv.data || []).map((s) => [s.nome, '#/servico/' + s.id]), '#/servicos?q=' + encodeURIComponent(q)],
      ['Notícias', (nt.data || []).map((x) => [x.titulo + ' (' + dataBR(x.publicado_em) + ')', '#/noticia/' + x.id]), '#/noticias?q=' + encodeURIComponent(q)],
      ['Publicações oficiais', (pb.data || []).map((x) => [ato(x) + ' — ' + x.ementa, x.arquivo_url || x.link_externo || '#/publicacoes?q=' + encodeURIComponent(q)]), '#/publicacoes?q=' + encodeURIComponent(q)],
      ['Contratos', (co.data || []).map((x) => [nomeCtr(x) + ' · ' + x.contratado_nome + ' · ' + (x.objeto.length > 70 ? x.objeto.slice(0, 70) + '…' : x.objeto), '#/contrato/' + x.id]), '#/contratos'],
      ['Licitações', (lc.data || []).map((x) => [nomeLic(x) + ' · ' + (x.objeto.length > 90 ? x.objeto.slice(0, 90) + '…' : x.objeto), '#/licitacao/' + x.id]), '#/licitacoes'],
      ['Planejamento e contas', (ct.data || []).map((x) => [curtoContas(x.tipo) + ' · ' + periodoContas(x) + (x.periodo ? ' de ' + x.exercicio : '') + ' · ' + x.parte, '#/planejamento/' + x.tipo + '?ano=' + x.exercicio]), '#/planejamento'],
      ['Unidades', (un.data || []).map((x) => [x.nome, '#/unidade/' + x.id]), null],
      ['Páginas', (pg.data || []).map((x) => [x.titulo, '#/pagina/' + x.slug]), null],
      ['Perguntas frequentes', (fq.data || []).map((x) => [x.pergunta, '#/faq']), null]
    ].filter((g) => g[1].length);
    const total = grupos.reduce((s, g) => s + g[1].length, 0);
    pagina(main, el('h1', null, 'Resultados para “' + q + '”'),
      el('p', { class: 'sub', role: 'status' }, total ? total + ' resultado' + (total > 1 ? 's' : '') + ' (até 8 por seção).' : 'Nenhum resultado. Tente outra palavra ou consulte o Mapa do site.'),
      grupos.map(([t, itens, todos]) => el('section', { style: 'margin-bottom:24px' },
        el('div', { class: 'secao-titulo' }, el('h2', null, t), todos && itens.length === 8 ? el('a', { href: todos }, 'Ver todos →') : null),
        el('ul', null, itens.map(([rot, href]) => el('li', { style: 'margin:6px 0' }, el('a', { href, target: href.startsWith('http') ? '_blank' : null, rel: href.startsWith('http') ? 'noopener' : null }, rot)))))));
  };

  R['*'] = async function (main) {
    S.titulo('Página não encontrada'); S.trilha(['Página não encontrada']);
    pagina(main, el('h1', null, 'Página não encontrada'),
      el('p', null, 'O endereço pode ter mudado ou o conteúdo foi retirado do ar.'),
      el('p', null, el('a', { href: '#/' }, 'Voltar para o início'), ' · ', el('a', { href: '#/mapa-do-site' }, 'Mapa do site')));
  };
})();
