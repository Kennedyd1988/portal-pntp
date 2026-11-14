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
  // Tipos de publicação criados pelo órgão (painel › Publicações › Tipos personalizados).
  let tiposCarregados = null;
  const tiposPub = () => tiposCarregados || (tiposCarregados = sb.from('publicacoes_tipos').select('codigo, nome').eq('orgao_id', org())
    .then(({ data }) => { for (const t of data || []) TIPOS[t.codigo] = t.nome; }, () => {}));
  const VIGENCIA = { vigente: 'Vigente', alterada: 'Alterada', revogada: 'Revogada', sem_efeito: 'Sem efeito' };
  const COR_VIG = { vigente: 'etiqueta-verde', alterada: 'etiqueta-ambar', revogada: 'etiqueta-vermelha', sem_efeito: 'etiqueta-vermelha' };
  const FORMAS = { presencial: 'Presencial', digital: 'Pela internet', presencial_digital: 'Presencial e pela internet' };
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
      n.resumo ? el('p', { class: 'm-0 meta' }, n.resumo) : null);
  }

  // ===================================================================
  // INÍCIO (1.3 transparência na capa, 2.3 gestores, 2.8 redes, 2.9 Radar)
  // ===================================================================
  R[''] = async function (main) {
    S.titulo('');
    await tiposPub();
    const c = S.conf;
    const agora = new Date().toISOString();
    const [bn, nt, pb, gs, sv] = await Promise.all([
      sb.from('banners').select('*').eq('orgao_id', org()).eq('ativo', true).order('ordem').limit(8),
      sb.from('noticias').select('id, titulo, resumo, conteudo, capa_url, capa_legenda, categoria, publicado_em, destaque').eq('orgao_id', org())
        .lte('publicado_em', agora).order('publicado_em', { ascending: false }).limit(7),
      ultimasPublicacoes(),
      sb.from('gestores').select('*').eq('orgao_id', org()).order('destaque_capa', { ascending: false }).order('ordem').order('nome').limit(120),
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
    if (banners.length) blocos.push(el('div', { class: 'limite banner-limite' }, carrossel(banners)));

    // Acessos rápidos: os que têm chave de destino seguem Aparência › Destinos das páginas.
    const acessos = [
      ['transparencia', 'Portal da Transparência', 'Receitas, despesas, folha e contas', null, '#/transparencia'],
      ['licitacao', 'Licitações', 'Editais, dispensas e resultados', 'licitacoes'],
      ['licitacao', 'Contratos', 'Contratos, aditivos e fiscais', 'contratos'],
      ['servicos', 'Carta de Serviços', 'Como pedir cada serviço', 'carta_servicos'],
      ['publicacoes', 'Leis e atos oficiais', 'Leis, decretos e portarias', 'publicacoes'],
      ['diario', 'Diário Oficial', c.diario_oficial_nome || 'Publicações oficiais', 'diario_oficial'],
      ['ouvidoria', 'Ouvidoria', 'Elogios, sugestões e reclamações', 'ouvidoria'],
      ['esic', 'e-SIC', 'Pedido de acesso à informação', 'esic']
    ];
    blocos.push(el('section', { class: 'secao', 'aria-labelledby': 'tit-acessos' }, el('div', { class: 'limite' },
      el('h2', { id: 'tit-acessos' }, 'Serviços e acessos rápidos'),
      el('div', { class: 'grade g4 acessos' }, acessos.map(([ic, t, d, chave, h]) => {
        const conteudo = [icone(ic), el('span', null, el('strong', null, t), el('span', { class: 'meta' }, d))];
        return chave ? S.linkDestino(chave, conteudo, { class: 'cartao' }) : el('a', { class: 'cartao', href: h }, conteudo);
      })))));

    // Faixa do Radar da Transparência Pública (PNTP 2.9). Com a imagem oficial enviada em
    // Aparência, a faixa inteira é a imagem; sem ela, faixa nas cores do Radar com o texto.
    blocos.push(el('section', { class: 'pt-0 secao', 'aria-labelledby': 'tit-radar' }, el('div', { class: 'limite' },
      c.radar_imagem_url
        ? el('a', { class: 'faixa-radar-img', href: S.radar(), target: '_blank', rel: 'noopener' },
          el('img', { src: c.radar_imagem_url, alt: 'Radar da Transparência Pública' }), el('h2', { id: 'tit-radar', class: 'sr' }, 'Radar da Transparência Pública (abre em nova aba)'))
        : el('a', { class: 'faixa-radar', href: S.radar(), target: '_blank', rel: 'noopener' },
          iconeRadar(),
          el('span', { class: 'faixa-radar-textos' }, el('h2', { id: 'tit-radar' }, 'Radar da Transparência Pública'),
            el('span', null, 'Consulte a avaliação dos portais de transparência de todo o país (Atricon e Tribunais de Contas).')),
          el('span', { class: 'faixa-radar-botao' }, 'Acessar o Radar', el('span', { class: 'sr' }, ' (abre em nova aba)'), el('span', { 'aria-hidden': 'true' }, ' ↗'))))));

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
          el('strong', null, s.nome), el('span', { class: 'bloco meta' }, (s.categoria ? s.categoria + ' · ' : '') + 'Pedido sem ir ao balcão')))))));
    }

    if (pubs.some((g) => g.itens.length)) blocos.push(secaoPublicacoes(pubs));
    if (gestores.length) {
      await S.carregarUnidades();
      blocos.push(el('section', { class: 'secao secao-cinza', 'aria-labelledby': 'tit-gestao' }, el('div', { class: 'limite' },
        el('div', { class: 'secao-titulo' }, el('h2', { id: 'tit-gestao' }, 'Gestão'), el('a', { href: '#/gestores' }, 'Todos os gestores →')),
        carrosselGestores(gestores))));
    }

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
  // Ícone genérico de gráfico (pizza) da faixa do Radar.
  function iconeRadar() {
    const NS = 'http://www.w3.org/2000/svg', sv = document.createElementNS(NS, 'svg');
    for (const [k, v] of Object.entries({ viewBox: '0 0 48 48', width: 56, height: 56, 'aria-hidden': 'true' })) sv.setAttribute(k, v);
    for (const [d, f] of [['M24 4a20 20 0 1 1-20 20h20z', '#ffffff'], ['M20 0v20H0A20 20 0 0 1 20 0z', '#f2b33d']]) {
      const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); p.setAttribute('fill', f);
      if (f === '#f2b33d') p.setAttribute('transform', 'translate(2 2)'); sv.append(p);
    }
    return sv;
  }

  // Gestão: todos os gestores lado a lado, 4 por vez (menos em telas menores), rolando sozinho
  // para o lado um cartão por vez. No fim, segue em frente para o primeiro (cópias dos primeiros
  // cartões no final do trilho, trocadas sem animação), sem voltar de ré. Para ao passar o
  // mouse/focar, tem botão de pausa e não anda quando o sistema pede menos movimento.
  function carrosselGestores(lista) {
    const n = lista.length;
    const trilho = el('div', { class: 'gest-trilho' }, lista.map((g) => el('div', { class: 'gest-item' }, cartaoGestor(g))));
    let pos = 0, timer = null, clones = 0, pausado = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const porVez = () => { const w = trilho.parentElement ? trilho.parentElement.clientWidth : 1200; return w < 560 ? 1 : w < 860 ? 2 : w < 1100 ? 3 : 4; };
    const roda = () => n > porVez();
    // Cópias (só visuais) dos primeiros cartões no fim do trilho, para emendar o fim no começo.
    function montarClones() {
      const k = roda() ? porVez() : 0;
      if (k === clones) return;
      [...trilho.querySelectorAll('.gest-clone')].forEach((x) => x.remove());
      for (let i = 0; i < k; i++) {
        const c = trilho.children[i].cloneNode(true);
        c.classList.add('gest-clone'); c.inert = true; c.setAttribute('aria-hidden', 'true');
        trilho.append(c);
      }
      clones = k;
    }
    function mover(animar) {
      trilho.style.transition = animar ? '' : 'none';
      trilho.style.transform = 'translateX(' + (-100 / porVez() * pos) + '%)';
      [...trilho.children].forEach((it, k) => {
        if (it.classList.contains('gest-clone')) return;
        const vis = k >= pos && k < pos + porVez();
        it.inert = !vis; it.setAttribute('aria-hidden', vis ? 'false' : 'true');
      });
      if (!animar) void trilho.offsetWidth;   // aplica a posição antes de religar a animação
    }
    const ir = (alvo) => {
      if (!roda()) { pos = 0; mover(false); return; }
      if (alvo < 0) { pos = n; mover(false); alvo = n - 1; }   // voltar do primeiro: parte das cópias
      pos = alvo; mover(true);
      if (pos >= n) setTimeout(() => { if (pos >= n) { pos -= n; mover(false); } }, 520);   // chegou nas cópias: troca pelo original
    };
    const btnPausa = el('button', { type: 'button', 'aria-label': 'Pausar a rolagem automática' }, '❚❚');
    const iniciar = () => { clearInterval(timer); if (!pausado && roda()) timer = setInterval(() => ir(pos + 1), 3500); };
    btnPausa.addEventListener('click', () => {
      pausado = !pausado; btnPausa.textContent = pausado ? '▶' : '❚❚';
      btnPausa.setAttribute('aria-label', pausado ? 'Retomar a rolagem automática' : 'Pausar a rolagem automática'); iniciar();
    });
    const janela = el('div', { class: 'gest-janela' }, trilho);
    const controles = el('div', { class: 'banner-controles gest-controles' },
      el('button', { type: 'button', 'aria-label': 'Anterior', onclick: () => ir(pos - 1) }, '‹'), btnPausa,
      el('button', { type: 'button', 'aria-label': 'Próximo', onclick: () => ir(pos + 1) }, '›'));
    const caixa = el('div', { class: 'gest-carrossel', role: 'region', 'aria-roledescription': 'carrossel', 'aria-label': 'Gestores' }, janela, controles);
    caixa.addEventListener('mouseenter', () => clearInterval(timer));
    caixa.addEventListener('mouseleave', iniciar);
    caixa.addEventListener('focusin', () => clearInterval(timer));
    caixa.addEventListener('focusout', iniciar);
    const ajustar = () => {
      trilho.style.setProperty('--por-vez', porVez());
      montarClones();
      controles.hidden = !roda();
      if (pos >= n) pos = 0;
      mover(false); iniciar();
    };
    addEventListener('resize', ajustar);
    requestAnimationFrame(ajustar);
    return caixa;
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
      outras.length ? el('section', { class: 'mt-4' }, el('h2', null, 'Notícias relacionadas'), el('div', { class: 'grade g3' }, outras.map((x) => cartaoNoticia(x)))) : null);
  };

  // ===================================================================
  // PUBLICAÇÕES OFICIAIS (2.6 atos normativos) — filtros, total e exportação
  // ===================================================================
  R.publicacoes = async function (main, partes, params) {
    await tiposPub();
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
          el('td', null, p.ementa, p.observacao ? el('span', { class: 'bloco meta' }, p.observacao) : null),
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
      el('strong', { class: 'bloco' }, g.nome),
      el('span', { class: 'bloco meta' }, g.cargo),
      g.unidade_id && S.nomeUnidade(g.unidade_id) ? el('a', { class: 'bloco menor', href: '#/unidade/' + g.unidade_id }, S.nomeUnidade(g.unidade_id)) : null,
      g.email ? el('a', { class: 'bloco menor', href: 'mailto:' + g.email }, g.email) : null,
      g.telefone ? el('span', { class: 'bloco meta' }, g.telefone) : null,
      g.curriculo_url ? el('a', { class: 'bloco menor', href: g.curriculo_url, target: '_blank', rel: 'noopener' }, 'Currículo (PDF)') : null);
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
    // Cartões por unidade (responsável com foto, contatos, competências e subunidades),
    // com pesquisa; a árvore completa fica na aba "Organograma".
    const iniciais = (n) => String(n || '').split(/\s+/).filter((x) => x.length > 2).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
    const cartao = (u) => {
      const r = responsavel(u.id), sub = filhos(u.id);
      return el('article', { class: 'cartao est-cartao', 'data-busca': normalizar([u.nome, u.sigla, u.competencias, r && r.nome, sub.map((x) => x.nome).join(' ')].join(' ')) },
        el('div', { class: 'est-topo' },
          r && r.foto_url ? el('img', { class: 'est-foto', src: r.foto_url, alt: 'Foto de ' + r.nome, loading: 'lazy' }) : el('span', { class: 'est-foto est-sem-foto', 'aria-hidden': 'true' }, iniciais(r ? r.nome : u.nome)),
          el('div', null, el('h2', null, el('a', { href: '#/unidade/' + u.id }, u.nome)), u.sigla ? el('span', { class: 'etiqueta' }, u.sigla) : null,
            r ? el('p', { class: 'est-resp' }, el('strong', null, r.nome), r.cargo ? el('span', { class: 'meta' }, r.cargo) : null) : el('p', { class: 'meta' }, 'Responsável não informado'))),
        el('ul', { class: 'est-contatos' },
          u.telefone ? el('li', null, el('span', { class: 'meta' }, 'Telefone '), el('a', { href: 'tel:' + u.telefone.replace(/\D/g, '') }, u.telefone)) : null,
          u.email ? el('li', null, el('span', { class: 'meta' }, 'E-mail '), el('a', { href: 'mailto:' + u.email }, u.email)) : null,
          u.horario_atendimento ? el('li', null, el('span', { class: 'meta' }, 'Horário '), u.horario_atendimento) : null,
          u.endereco ? el('li', null, el('span', { class: 'meta' }, 'Endereço '), u.endereco) : null),
        u.competencias ? el('p', { class: 'est-comp' }, u.competencias.length > 220 ? u.competencias.slice(0, 220) + '…' : u.competencias) : null,
        sub.length ? el('div', { class: 'est-sub' }, el('span', { class: 'meta' }, 'Unidades vinculadas: '), sub.map((x) => el('a', { class: 'chip-est', href: '#/unidade/' + x.id }, x.nome))) : null,
        el('a', { class: 'est-mais', href: '#/unidade/' + u.id }, 'Competências, gestores e serviços →', el('span', { class: 'sr' }, ' de ' + u.nome)));
    };
    const topo = filhos(null);
    const grade = el('div', { class: 'grade g2 est-grade' }, topo.map(cartao));
    const total = el('span', { class: 'meta', role: 'status' }, topo.length + ' unidades principais · ' + ativas.length + ' no total');
    const busca = el('input', { type: 'search', placeholder: 'Ex.: saúde, tributos, nome do secretário' });
    busca.addEventListener('input', () => {
      const t = normalizar(busca.value.trim());
      // Pesquisa em todas as unidades (inclusive as vinculadas), mostrando o cartão de cada uma.
      const lista = t ? ativas.filter((u) => normalizar([u.nome, u.sigla, u.competencias, (responsavel(u.id) || {}).nome].join(' ')).includes(t)) : topo;
      grade.replaceChildren(...lista.map(cartao));
      total.textContent = t ? lista.length + (lista.length === 1 ? ' unidade encontrada' : ' unidades encontradas') : topo.length + ' unidades principais · ' + ativas.length + ' no total';
    });
    const painelCartoes = el('div', null,
      el('form', { class: 'filtros', role: 'search', onsubmit: (e) => e.preventDefault() }, el('label', null, 'Pesquisar unidade, competência ou responsável', busca)),
      el('div', { class: 'barra-lista' }, total, S.botoesExportar('estrutura-organizacional', colunas, async (de) => de ? [] : ativas)), grade);
    const painelArvore = el('div', null, el('ul', { class: 'arvore est-arvore' },
      el('li', null, el('strong', null, c.nome_exibicao || S.orgao.nome), el('ul', null, topo.map(no)))));
    const conteudo = el('div', { class: 'painel-guia', role: 'tabpanel' }, painelCartoes);
    const faixa = faixaAbas([['cartoes', 'Unidades'], ['arvore', 'Organograma']], 'cartoes', 'Forma de visualização', false,
      (id) => conteudo.replaceChildren(id === 'arvore' ? painelArvore : painelCartoes));
    pagina(main, el('h1', null, 'Estrutura organizacional'),
      el('p', { class: 'sub' }, 'Unidades administrativas, responsáveis, competências, contatos e horários de atendimento.'),
      c.estrutura_norma || c.estrutura_norma_url ? el('p', { class: 'cartao est-norma' }, el('strong', null, 'Norma que institui a estrutura: '),
        c.estrutura_norma_url ? el('a', { href: c.estrutura_norma_url, target: '_blank', rel: 'noopener' }, c.estrutura_norma || 'Abrir') : c.estrutura_norma) : null,
      ativas.length ? [faixa.lista, conteudo] : el('p', { class: 'vazio' }, 'Estrutura em cadastramento.'));
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
      el('div', { class: 'mt-2 grade g2' },
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
      el('section', { class: 'mt-4' }, el('h2', null, 'Competências e atribuições'),
        u.competencias ? texto(u.competencias) : el('p', { class: 'vazio' }, 'Competências em cadastramento.')),
      sv.data && sv.data.length ? el('section', { class: 'mt-4' }, el('h2', null, 'Serviços desta unidade'),
        el('ul', null, sv.data.map((s) => el('li', null, el('a', { href: '#/servico/' + s.id }, s.nome), el('span', { class: 'meta' }, ' · ' + FORMAS[s.forma_prestacao]))))) : null,
      nt.data && nt.data.length ? el('section', { class: 'mt-4' },
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
        s.unidade_id ? el('span', { class: 'bloco meta' }, S.nomeUnidade(s.unidade_id)) : null)));
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
      carta && carta.compromissos ? el('section', { class: 'mt-4 cartao' }, el('h2', null, 'Compromissos de qualidade do atendimento'), texto(carta.compromissos)) : null,
      carta && carta.manifestacao ? el('section', { class: 'mt-2 cartao' }, el('h2', null, 'Elogios, sugestões e reclamações'), texto(carta.manifestacao)) : null);
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
      caixa.replaceChildren(...Object.keys(grupos).sort((a, b) => a.localeCompare(b, 'pt-BR')).map((g) => el('section', { class: 'mb-3' },
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
      el('p', { class: 'mt-3 meta' }, 'Atualizada em ' + dataBR(p.atualizado_em) + '.')));
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
      ['Receitas: previsão e arrecadação mensal por natureza', 'receitas', 'exercicio,mes,natureza_codigo,natureza_descricao,fonte_codigo,fonte_descricao,previsto_inicial,previsto_atualizado,arrecadado', '&order=exercicio.desc'],
      ['Receitas: descrição dos níveis da classificação', 'receitas_naturezas', 'codigo,descricao', '&order=codigo.asc'],
      ['Dívida ativa: inscritos', 'divida_ativa', 'exercicio,nome,documento_publico,ano_inscricao,tributo,valor', '&order=exercicio.desc'],
      ['Despesas: empenhos', 'despesas', 'id,numero,data_empenho,tipo_empenho,unidade_codigo,unidade_nome,funcao_codigo,subfuncao_codigo,subfuncao_nome,programa_codigo,programa_nome,acao_codigo,acao_nome,natureza_codigo,natureza_nome,fonte_codigo,fonte_nome,credor_nome,credor_doc_publico,objeto,modalidade,licitacao_numero,processo,valor_empenhado,total_empenhado,total_liquidado,total_pago', '&order=data_empenho.desc'],
      ['Despesas: liquidações e pagamentos', 'despesas_movimentos', 'despesa_id,tipo,data,valor,documento,observacao', '&order=data.desc'],
      ['Ordem cronológica de pagamentos', 'ordem_cronologica_posicoes', 'exercicio,categoria,fonte_codigo,fonte_nome,posicao,credor_nome,credor_doc_publico,documento_fiscal,empenho_numero,contrato_numero,objeto,data_exigibilidade,data_pagamento,valor,fora_da_ordem,motivo_alteracao,justificativa,ato_justificativa,justificativa_url', '&order=data_exigibilidade.desc'],
      ['Pessoal: servidores e agentes públicos', 'pessoal_vinculos', 'matricula,nome,cargo,funcao,vinculo,lotacao,carga_horaria,data_admissao,data_desligamento,motivo_desligamento', '&order=nome.asc'],
      ['Pessoal: remuneração mensal', 'pessoal_remuneracoes', 'exercicio,mes,folha,matricula,nome,cargo,vinculo,lotacao,remuneracao_basica,vantagens,eventuais,indenizacoes,bruto,descontos,liquido', '&order=exercicio.desc'],
      ['Pessoal: cargos e salários', 'pessoal_cargos', 'cargo,tipo,referencia,carga_horaria,vencimento,norma,norma_url,vigencia_inicio,vigencia_fim', '&order=ordem.asc'],
      ['Pessoal: estagiários', 'pessoal_estagiarios', 'nome,instituicao,curso,nivel,lotacao,carga_horaria,bolsa,data_inicio,data_fim,data_desligamento', '&order=data_inicio.desc'],
      ['Pessoal: terceirizados', 'pessoal_terceirizados', 'exercicio,nome,documento_publico,funcao,empresa,empresa_cnpj,contrato_numero,lotacao,data_inicio,data_fim', '&order=exercicio.desc'],
      ['Diárias concedidas', 'diarias', 'nome,cargo,unidade,destino,abrangencia,motivo,data_inicio,data_fim,quantidade,valor_unitario,valor_total,data_pagamento,empenho_numero,ato_concessao', '&order=data_inicio.desc'],
      ['Diárias: tabela de valores', 'diarias_valores', 'grupo,abrangencia,destino_descricao,valor,moeda,norma,norma_url,vigencia_inicio,vigencia_fim', '&order=ordem.asc'],
      ['Publicações oficiais (atos normativos)', 'publicacoes', 'tipo,numero,ano,data_publicacao,ementa,vigencia,observacao,arquivo_url,link_externo', '&order=data_publicacao.desc'],
      ['Contratos', 'contratos', 'tipo,numero,ano,processo,objeto,contratado_nome,valor_inicial,valor_atual,data_assinatura,vigencia_inicio,vigencia_fim_atual,rescindido_em,unidade_nome,link_externo', '&order=data_assinatura.desc'],
      ['Fiscais de contratos', 'contratos_fiscais', 'nome,funcao,ato,inicio,fim', '&order=nome'],
      ['Licitações', 'licitacoes', 'modalidade,numero,ano,processo,objeto,srp,criterio,amparo_legal,unidade_nome,valor_estimado,valor_homologado,data_publicacao,data_abertura,andamento,vencedores,link_externo', '&order=chave_ordem.asc'],
      ['Plano de contratações anual (PCA)', 'pca', 'ano,tipo,data_aprovacao,ato_aprovacao,valor_total,qtd_itens,descricao,arquivo_url,link_externo', '&order=ano.desc'],
      ['Licitantes e contratados sancionados', 'sancoes', 'sancionado_nome,tipo,fundamento,motivo,processo,referencia,data_aplicacao,inicio,fim,valor_multa,ato,arquivo_url,link_externo', '&order=data_aplicacao.desc'],
      ['Obras', 'obras', 'titulo,local,situacao_obra,percentual,etapa_atual,data_inicio,previsao_conclusao,data_conclusao,contratada_nome,valor_contratado,fonte_recurso,unidade_nome,link_externo', '&order=atualizado_em.desc'],
      ['Obras: planilha contratada e executada', 'obras_itens', 'obra_id,codigo,descricao,unidade,quantidade,preco_unitario,total_contratado,quantidade_executada,preco_praticado,total_executado', '&order=obra_id.asc'],
      ['Convênios e transferências (recebidas, realizadas e acordos)', 'convenios', 'tipo,instrumento,numero,ano,objeto,parte_nome,esfera,valor_previsto,valor_contrapartida,valor_repassado,data_assinatura,vigencia_inicio,vigencia_fim,andamento,obrigacoes,arquivo_url,link_externo', '&order=ano.desc'],
      ['Concursos e processos seletivos', 'concursos', 'tipo,numero,ano,titulo,vagas,inscricoes_inicio,inscricoes_fim,data_prova,validade_ate,andamento,organizadora,link_externo', '&order=ano.desc'],
      ['Renúncias de receita (desonerações)', 'renuncias', 'especie,tributo,titulo,descricao,fundamento_legal,norma_url,requisitos,procedimento,setor,vigencia_inicio,vigencia_fim', '&order=titulo.asc'],
      ['Renúncias: previsto e realizado', 'renuncias_valores', 'renuncia_id,exercicio,valor_previsto,valor_realizado,fonte_previsao,compensacao', '&order=exercicio.desc'],
      ['Renúncias: beneficiários', 'renuncias_beneficiarios', 'renuncia_id,exercicio,nome,documento_publico,setor,produto,valor', '&order=exercicio.desc'],
      ['Incentivos à cultura e ao esporte', 'incentivos_projetos', 'exercicio,area,projeto,proponente,documento_publico,valor_aprovado,valor_liberado,lei_incentivo,andamento,arquivo_url,link_externo', '&order=exercicio.desc'],
      ['Saúde: planos e relatórios; educação: plano e resultados', 'documentos_setoriais', 'area,tipo,titulo,exercicio,exercicio_fim,periodo,data_publicacao,descricao,arquivo_url,link_externo', '&order=exercicio.desc'],
      ['Saúde: estabelecimentos', 'saude_estabelecimentos', 'nome,tipo,cnes,endereco,bairro,telefone,email,horario,especialidades,servicos', '&order=nome.asc'],
      ['Saúde: profissionais', 'saude_profissionais', 'estabelecimento_id,nome,especialidade,registro,horario', '&order=nome.asc'],
      ['Saúde: lista de espera da regulação', 'saude_lista_espera', 'protocolo,tipo,procedimento,especialidade,unidade_solicitante,data_solicitacao,prioridade,situacao_espera,data_agendamento,local_atendimento', '&order=data_solicitacao.asc'],
      ['Saúde: medicamentos do SUS', 'saude_medicamentos', 'nome,apresentacao,componente,onde_obter,como_obter', '&order=nome.asc'],
      ['Saúde: estoque das farmácias', 'saude_estoques', 'medicamento_id,local,quantidade,unidade,posicao_em', '&order=posicao_em.desc'],
      ['Educação: lista de espera das creches', 'creches_espera', 'protocolo,crianca,turma,creche,data_inscricao,criterio,pontuacao,situacao_espera', '&order=data_inscricao.asc'],
      ['Conselhos municipais', 'conselhos', 'tipo,nome,sigla,norma_criacao,norma_url,competencias,periodicidade,local_reunioes,telefone,email,mandato_inicio,mandato_fim,regimento_url', '&order=nome.asc'],
      ['Conselhos: composição', 'conselhos_membros', 'conselho_id,nome,funcao,condicao,segmento,entidade,mandato_inicio,mandato_fim,ato', '&order=nome.asc'],
      ['Conselhos: atas e documentos', 'conselhos_documentos', 'conselho_id,tipo,titulo,data,arquivo_url,link_externo', '&order=data.desc'],
      ['Emendas parlamentares', 'emendas', 'exercicio,origem,tipo,forma_repasse,numero,autor,objeto,funcao,beneficiario,valor_previsto,valor_realizado,valor_empenhado,valor_liquidado,valor_pago,execucao_em,andamento', '&order=exercicio.desc'],
      ['Obras: paralisações', 'obras_paralisacoes', 'obra_id,inicio,reinicio,motivo,responsavel,previsao_reinicio,ato', '&order=inicio.desc'],
      ['Planejamento e prestação de contas', 'documentos_contas', 'tipo,exercicio,exercicio_fim,periodicidade,periodo,parte,resultado,numero_ato,data_publicacao,descricao,arquivo_url,link_externo', '&order=exercicio.desc'],
      ['Carta de Serviços', 'servicos', 'nome,categoria,descricao,publico_alvo,requisitos,etapas,prazo_maximo,forma_prestacao,link_digital,local_atendimento,horario,custo', '&order=nome'],
      ['e-SIC e Ouvidoria: relatórios estatísticos', 'atendimento_relatorios', 'canal,exercicio,abrangencia,numero,recebidos,atendidos,parciais,indeferidos,em_andamento,outros,recursos_1,recursos_2,prazo_medio_dias,pessoas_fisicas,pessoas_juridicas,sexo_feminino,sexo_masculino,sexo_nao_informado,reclamacoes,denuncias,sugestoes,elogios,solicitacoes,simplifique,observacao,arquivo_url,link_externo', '&order=exercicio.desc'],
      ['e-SIC e Ouvidoria: distribuições dos relatórios', 'atendimento_relatorios_itens', 'relatorio_id,dimensao,item,quantidade', '&order=relatorio_id,dimensao,ordem'],
      ['e-SIC: informações classificadas e desclassificadas', 'informacoes_classificadas', 'codigo,assunto,grau,fundamento,unidade,autoridade,data_classificacao,prazo_fim,evento_fim,data_desclassificacao,motivo_desclassificacao', '&order=data_classificacao.desc'],
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
      el('p', { class: 'mt-1 meta' }, 'O endereço de acesso automatizado responde em JSON e aceita filtros e ordenação no padrão PostgREST (ex.: &ano=eq.2026).'),
      el('section', { class: 'mt-4' }, el('h2', null, 'Regras de utilização'),
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
      el('div', { class: 'mt-2 grade g2' },
        el('div', { class: 'cartao' }, el('h2', null, S.conf.nome_exibicao || S.orgao.nome),
          el('dl', { class: 'dados' },
            el('dt', null, 'Endereço'), el('dd', null, c.endereco || '—', c.cep ? ' · CEP ' + c.cep : '',
              c.endereco ? el('a', { class: 'bloco', href: 'https://www.google.com/maps/search/' + encodeURIComponent(c.endereco + (c.cep ? ' ' + c.cep : '')), target: '_blank', rel: 'noopener' }, 'Ver no mapa') : null),
            el('dt', null, 'Telefone'), el('dd', null, c.telefone ? el('a', { href: 'tel:' + c.telefone.replace(/\D/g, '') }, c.telefone) : '—'),
            el('dt', null, 'E-mail'), el('dd', null, c.email ? el('a', { href: 'mailto:' + c.email }, c.email) : '—'),
            el('dt', null, 'Horário'), el('dd', null, c.horario || '—'),
            c.whatsapp ? [el('dt', null, 'WhatsApp'), el('dd', null, c.whatsapp)] : null)),
        el('div', { class: 'cartao' }, el('h2', null, 'Fale com o órgão'),
          el('p', null, el('a', { href: '#/ouvidoria' }, 'Ouvidoria'), ': elogios, sugestões, reclamações e denúncias.'),
          el('p', null, el('a', { href: '#/esic' }, 'e-SIC'), ': pedido de acesso à informação (Lei 12.527/2011).'),
          el('p', null, el('a', { href: '#/faq' }, 'Perguntas frequentes'), ': respostas para as dúvidas mais comuns.'))),
      unidades.length ? el('section', { class: 'mt-4' }, el('h2', null, 'Contatos das unidades'),
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

  // Seções do site (mapa do site e busca): [título, chave de destino ou null, rota, palavras extras].
  // As que têm chave seguem Aparência › Destinos das páginas (portal ou link externo).
  function secoesDoSite() {
    const fixas = [['Notícias', null, '#/noticias', 'noticia'], ['Estrutura organizacional', null, '#/estrutura', 'secretarias orgaos unidades organograma'],
      ['Gestores', null, '#/gestores', 'prefeito secretario autoridades'], ['Perguntas frequentes', null, '#/faq', 'duvidas faq'],
      ['Portal da Transparência', null, '#/transparencia', 'transparencia'],
      ['Obras paralisadas', null, '#/obras/paralisadas', ''], ['Proteção de dados (LGPD)', null, '#/lgpd', 'privacidade encarregado'],
      ['Dados abertos', null, '#/dados-abertos', 'api csv json'], ['Conselhos municipais', null, '#/conselhos', 'conselho fundeb saude assistencia social atas'], ['Acessibilidade', null, '#/acessibilidade', 'libras contraste'], ['Contato', null, '#/contato', 'telefone email endereco']];
    const cat = window.DESTINOS_PNTP.filter((d) => S.destino(d[0])).map((d) => [d[1], d[0], null, '']);
    return cat.concat(fixas).sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  }

  R['mapa-do-site'] = async function (main) {
    S.titulo('Mapa do site'); S.trilha(['Mapa do site']);
    const principais = S.menu.filter((i) => !i.pai_id).sort((a, b) => a.ordem - b.ordem);
    const filhos = (id) => S.menu.filter((i) => i.pai_id === id).sort((a, b) => a.ordem - b.ordem);
    const { data: pags } = await sb.from('paginas').select('titulo, slug').eq('orgao_id', org()).order('titulo').limit(300);
    pagina(main, el('h1', null, 'Mapa do site'),
      el('div', { class: 'grade g2' },
        principais.length ? el('section', null, el('h2', null, 'Menu principal'), el('ul', { class: 'arvore' }, principais.map((p) => el('li', null,
          el('a', { href: S.destinoMenu(p) }, p.rotulo), filhos(p.id).length ? el('ul', null, filhos(p.id).map((s) => el('li', null, el('a', { href: S.destinoMenu(s) }, s.rotulo)))) : null)))) : null,
        el('section', null, el('h2', null, 'Todas as seções'), el('ul', { class: 'arvore' },
          secoesDoSite().map(([t, chave, h]) => el('li', null, chave ? S.linkDestino(chave, t) : el('a', { href: h }, t))),
          (pags || []).map((p) => el('li', null, el('a', { href: '#/pagina/' + p.slug }, p.titulo)))))));
  };

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
    // Declarações de que não há dados (script 23): a atual substitui a lista; ano declarado vira aba.
    const decl = await S.decl.de('planejamento_' + tipo);
    if (S.decl.atual(decl)) { alvo.replaceChildren(el('h2', { class: 'titulo-aba' }, nome), el('p', { class: 'meta' }, descricao), S.decl.cartaoAtual(S.decl.atual(decl))); return; }
    for (const x of S.decl.mesclarAnos([], decl)) if (!(x.ano in fimDe)) fimDe[x.ano] = null;
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
      const declAno = S.decl.doAno(decl, ano);
      if (!docs.length) { painel.replaceChildren(declAno.length ? S.decl.quadro(declAno) : el('p', { class: 'vazio' }, 'Nenhum documento neste exercício.')); return; }
      // Agrupa as partes (lei e anexos) do mesmo período.
      const chaves = [...new Set(docs.map((d) => (d.periodicidade || '') + ':' + (d.periodo || 0)))];
      painel.replaceChildren(S.decl.quadro(declAno, 'Declarações de ' + ano),
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
    // Cada item segue Aparência › Destinos das páginas: rota interna com link externo escolhido vai
    // para o link; item sem rota (h undefined) usa a chave do destino (ou o sistema externo geral).
    const L = (t, cod, h, chave) => {
      if (chave) { const d = S.destino(chave); return { t, cod, h: d ? d.href : null }; }
      if (h && h.startsWith('#/')) { const k = window.chaveDaRotaPNTP(h); const e = k && !window.outrosLinksPNTP(c, k).length && window.externoPNTP(c, k); if (e) return { t, cod, h: e }; }
      return { t, cod, h: h === undefined ? ext : h };
    };
    const plan = [];
    if (exec || cam) plan.push(L('Plano Plurianual (PPA)', '11.8', '#/planejamento/ppa'), L('Lei de Diretrizes Orçamentárias (LDO)', '11.9', '#/planejamento/ldo'), L('Lei Orçamentária Anual (LOA)', '11.10', '#/planejamento/loa'));
    if (exec || cons) plan.push(L('RREO', '11.6', '#/planejamento/rreo'));
    plan.push(L('RGF', '11.5', '#/planejamento/rgf'), L('Prestação de contas anual (Balanço)', '11.1', '#/planejamento/balanco'),
      L('Relatório de gestão ou atividades', '11.2', '#/planejamento/relatorio_gestao'), L('Parecer do Tribunal de Contas', '11.3', '#/planejamento/parecer_tce'));
    if (exec) plan.push(L('Julgamento das contas pela Câmara', '11.4', '#/planejamento/julgamento_camara'));
    plan.push(L('Plano estratégico institucional', '11.7', '#/planejamento/plano_estrategico'));
    const receita = [L('Receitas previstas e arrecadadas', '3.1', '#/receitas/arrecadacao'), L('Receita por natureza (classificação)', '3.2', '#/receitas/arrecadacao')];
    if (exec) receita.push(L('Inscritos em dívida ativa', '3.3', '#/receitas/divida-ativa'));
    const g = [
      ['Informações institucionais', 'banco', [L('Estrutura organizacional', '2.1', '#/estrutura'), L('Competências e atribuições', '2.2', '#/estrutura'), L('Gestores responsáveis', '2.3', '#/gestores'),
        L('Endereços, telefones e horários', '2.4–2.5', '#/estrutura'), L('Atos normativos', '2.6', '#/publicacoes'), L('Perguntas frequentes', '2.7', '#/faq')]],
      ['Receitas', 'receita', receita],
      ['Despesas', 'despesa', [L('Empenhos, liquidações e pagamentos', '4.1 / 4.3', '#/despesas/empenhos'), L('Despesas por classificação', '4.2', '#/despesas/classificacao'), L('Ordem cronológica de pagamentos', '9.4', '#/ordem-cronologica')]],
      ['Convênios e transferências', 'convenio', [L('Transferências recebidas', '5.1', '#/convenios/recebidas'), L('Transferências realizadas', '5.2', '#/convenios/realizadas'), L('Acordos sem repasse de recursos', '5.3', '#/convenios/acordos')]],
      ['Pessoal', 'pessoas', [L('Servidores e lotação', '6.1', '#/pessoal/servidores'), L('Remuneração nominal', '6.2', '#/pessoal/remuneracao'), L('Tabela de cargos e salários', '6.3', '#/pessoal/cargos'), L('Estagiários', '6.4', '#/pessoal/estagiarios'), L('Terceirizados', '6.5', '#/pessoal/terceirizados'), L('Concursos e seleções', '6.6–6.7', undefined, 'concursos')]],
      ['Diárias', 'viagem', [L('Diárias concedidas', '7.1', '#/diarias/concedidas'), L('Tabela de valores das diárias', '7.2', '#/diarias/tabela')]],
      ['Licitações', 'licit', [L('Relação das licitações', '8.1', '#/licitacoes/todos'), L('Editais e documentos das fases', '8.2–8.3', '#/licitacoes/licitacoes'), L('Dispensas e inexigibilidades', '8.4', '#/licitacoes/diretas'),
        L('Adesões a atas (SRP)', '8.5', '#/licitacoes/adesoes'), L('Plano de contratações anual', '8.6', '#/licitacoes/pca'), L('Licitantes e contratados sancionados', '8.7', '#/licitacoes/sancionados')]],
      ['Contratos', 'contrato', [L('Contratos e termos aditivos', '9.1–9.2', '#/contratos'), L('Fiscais de contratos', '9.3', '#/contratos/fiscais'), L('Ordem cronológica de pagamentos', '9.4', '#/ordem-cronologica')]],
      ['Obras', 'obra', [L('Obras e situação atual', '10.1', '#/obras'), L('Quantitativos e preços', '10.2–10.3', '#/obras'), L('Obras paralisadas', '10.4', '#/obras/paralisadas')]],
      ['Planejamento e prestação de contas', 'grafico', plan],
      ['Serviço de Informação ao Cidadão', 'chat', [L('SIC: unidade, endereço e horário', '12.1–12.2', '#/esic/como-pedir'), L('e-SIC: fazer pedido', '12.3–12.4', '#/esic/pedir'), L('e-SIC: acompanhar pedido e recorrer', '', '#/esic/acompanhar'),
        L('Regulamentação da LAI', '12.5', '#/esic/como-pedir'), L('Prazos e recursos', '12.6', '#/esic/prazos'), L('Relatório estatístico anual', '12.7', '#/esic/relatorios'),
        L('Informações classificadas', '12.8', '#/esic/classificadas'), L('Informações desclassificadas', '12.9', '#/esic/desclassificadas')]],
      ['Ouvidoria e serviços', 'ouvido', [L('Ouvidoria: atendimento presencial', '14.1', '#/ouvidoria/como-manifestar'), L('Ouvidoria: canal eletrônico', '14.2', '#/ouvidoria/manifestar'), L('Ouvidoria: acompanhar manifestação', '', '#/ouvidoria/acompanhar'),
        L('Ouvidoria: relatórios estatísticos', '', '#/ouvidoria/relatorios'),
        L('Carta de Serviços ao Usuário', '14.3', '#/servicos'), L('Serviços on-line', '15.3', '#/servicos-online'), L('Pesquisa de satisfação', '15.6', '#/ouvidoria/satisfacao')]],
      ['Privacidade e dados abertos', 'lock', [L('Encarregado de dados (LGPD)', '15.1', '#/lgpd'), L('Política de privacidade', '15.2', '#/lgpd'), L('Dados abertos e API', '15.4', '#/dados-abertos'), L('Regulamentação do Governo Digital', '15.5', '#/lgpd')]]
    ];
    if (exec) {
      g.push(['Renúncias de receita', 'receita', [L('Desonerações e fundamento legal', '16.1', '#/renuncias/desoneracoes'), L('Renúncia prevista e realizada', '16.2', '#/renuncias/valores'),
        L('Beneficiários', '16.3', '#/renuncias/beneficiarios'), L('Incentivo à cultura e ao esporte', '16.4', '#/renuncias/incentivos')]],
        ['Emendas parlamentares', 'legis', [L('Emendas federais', '17.1', '#/emendas/federais'), L('Emendas estaduais e municipais', '17.2', '#/emendas/estaduais'), L('Execução das emendas', '17.3', '#/emendas/execucao')]],
        ['Saúde', 'saude', [L('Plano, programação e relatório', '18.1', '#/saude/planos'), L('Serviços, horários e profissionais', '18.2', '#/saude/servicos'), L('Lista de espera da regulação', '18.3', '#/saude/lista-de-espera'),
          L('Medicamentos do SUS', '18.4', '#/saude/medicamentos'), L('Estoque das farmácias', '18.5', '#/saude/estoque'), L('Conselho de Saúde', '18.6', '#/saude/conselho')]],
        ['Educação e assistência social', 'edu', [L('Plano de educação e resultados', '19.1', '#/educacao/plano'), L('Lista de espera em creches', '19.2', '#/educacao/creches'),
          L('Conselho do Fundeb', '19.3', '#/educacao/fundeb'), L('Conselho de Assistência Social', '19.4', '#/educacao/assistencia-social'), L('Todos os conselhos municipais', '', '#/conselhos')]]);
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
          [['Despesas', 'despesas'], ['Servidores', 'pessoal'], ['Licitações', 'licitacoes'], ['Contratos', 'contratos'], ['Planejamento e contas', 'planejamento'], ['Leis e decretos', 'publicacoes']].map(([t, k]) => [t, (S.destino(k) || {}).href])
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
        el('p', { class: 'meta transp-nota' }, 'Itens que ficam em sistema externo abrem em nova aba.',
          ' ', el('a', { href: S.radar(), target: '_blank', rel: 'noopener' }, 'Radar da Transparência Pública', el('span', { class: 'sr' }, ' (abre em nova aba)'))))));
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
      el('p', { class: 'mt-2 meta' }, 'Consulte também: ',
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
      // Declarações de que não há dados (script 23): a atual substitui a lista; ano declarado vira aba.
      const CHAVES_LIC = { licitacoes: ['licitacoes_licitacoes'], diretas: ['licitacoes_diretas'], adesoes: ['licitacoes_adesoes'],
        todos: ['licitacoes_licitacoes', 'licitacoes_diretas', 'licitacoes_adesoes'] };
      const decl = await S.decl.de(CHAVES_LIC[grupo]);
      const declAtual = grupo === 'todos' ? null : S.decl.atual(decl);
      if (declAtual) { history.replaceState(null, '', '#/licitacoes/' + grupo); conteudo.replaceChildren(S.decl.cartaoAtual(declAtual)); return; }
      for (const x of S.decl.mesclarAnos([], decl)) if (!contagem.has(x.ano)) contagem.set(x.ano, 0);
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
        const declAno = S.decl.doAno(decl, ano);
        if (!contagem.get(ano)) {
          painelAno.replaceChildren(declAno.length ? S.decl.quadro(declAno)
            : el('p', { class: 'vazio' }, g[3].replace('{ano}', ano) + (ano === anoAtual ? ' até esta data.' : '.')));
          return;
        }
        const declMes = el('div');
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
          declMes.replaceChildren(f.mes ? S.decl.quadro(S.decl.doMes(decl, ano, f.mes)) : '');
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
        painelAno.replaceChildren(S.decl.quadro(declAno, 'Períodos sem ocorrência em ' + ano),
          el('form', { class: 'filtros', role: 'search', onsubmit: (e) => { e.preventDefault(); aplicar(); } },
            el('label', null, 'Pesquisar (objeto ou número)', fBusca), el('label', null, 'Mês', fMes),
            mods.length > 1 ? el('label', null, 'Modalidade', fMod) : null, el('label', null, 'Situação', fAnd)),
          declMes, el('div', { class: 'barra-lista' }, totalTxt, exportar), tabela, vazio, mais);
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
    const decl = await S.decl.de('pca');
    if (S.decl.atual(decl)) { conteudo.replaceChildren(S.decl.cartaoAtual(S.decl.atual(decl))); return; }
    for (const x of S.decl.mesclarAnos([], decl)) if (!contagem.has(x.ano)) contagem.set(x.ano, 0);
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
      const declAno = S.decl.doAno(decl, ano);
      if (!docs.length) { painelAno.replaceChildren(declAno.length ? S.decl.quadro(declAno) : el('p', { class: 'vazio' }, 'O Plano de Contratações Anual de ' + ano + ' ainda não foi publicado neste portal.')); return; }
      const exportar = S.botoesExportar('pca-' + ano, COLUNAS_PCA, async (de, ate) => { const r = await buscar().range(de, ate); return r.data || []; });
      painelAno.replaceChildren(S.decl.quadro(declAno, 'Declarações de ' + ano),
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
    const { data: anosDadosS } = await sb.rpc('sancoes_anos', { p_orgao: org() });
    // Declarações (script 23): a atual substitui a lista; as de período aparecem no ano filtrado (ou todas).
    const declS = await S.decl.de('sancionados');
    if (S.decl.atual(declS)) { conteudo.replaceChildren(intro, S.decl.cartaoAtual(S.decl.atual(declS))); return; }
    const anosS = S.decl.mesclarAnos(anosDadosS || [], declS);
    const declBox = el('div');
    const mostrarDecl = () => declBox.replaceChildren(S.decl.quadro(f.ano ? S.decl.doAno(declS, f.ano) : declS.filter((d) => d.abrangencia !== 'atual'), 'Períodos sem ocorrência'));
    const fBusca = el('input', { type: 'search', placeholder: 'Nome, CNPJ, processo ou licitação' });
    const fTipo = el('select', null, el('option', { value: '' }, 'Todas'), Object.entries(TIPO_SANCAO).map(([k, v]) => el('option', { value: k }, v)));
    const fVig = el('select', null, el('option', { value: '' }, 'Todas'), el('option', { value: 'vigente' }, 'Em vigor'), el('option', { value: 'encerrada' }, 'Encerradas ou sem prazo'));
    const fAno = el('select', null, el('option', { value: '' }, 'Todos'), (anosS || []).map((x) => el('option', { value: x.ano }, String(x.ano))));
    let espera;
    const aplicar = () => { Object.assign(f, { busca: fBusca.value.trim(), tipo: fTipo.value, vigencia: fVig.value, ano: fAno.value }); mostrarDecl(); carregar(true); };
    [fTipo, fVig, fAno].forEach((x) => x.addEventListener('change', aplicar));
    fBusca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(aplicar, 400); });
    const exportar = S.botoesExportar('sancionados', COLUNAS_SANCAO, async (de, ate) => {
      const { data } = await montar().order('data_aplicacao', { ascending: false }).order('id').range(de, ate);
      return data || [];
    });
    conteudo.replaceChildren(intro,
      el('form', { class: 'filtros', role: 'search', onsubmit: (e) => { e.preventDefault(); aplicar(); } },
        el('label', null, 'Pesquisar', fBusca), el('label', null, 'Sanção', fTipo), el('label', null, 'Vigência', fVig), el('label', null, 'Ano da aplicação', fAno)),
      declBox, el('div', { class: 'barra-lista' }, totalTxt, exportar), tabela, vazio, mais);
    mostrarDecl();
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
      el('p', null, el('span', { class: 'etiqueta ' + and[1] }, and[0]), l.srp ? el('span', { class: 'ml-1 etiqueta' }, 'Registro de preços') : null),
      el('section', { class: 'cartao' }, el('h2', null, 'Objeto'), el('p', { class: 'pre' }, l.objeto)),
      el('dl', { class: 'ficha-lic' },
        linha('Modalidade', MOD_LIC[l.modalidade] || l.modalidade), linha('Número', l.numero), linha('Processo administrativo', l.processo),
        linha('Data de publicação', dataBR(l.data_publicacao)),
        linha('Abertura / sessão pública', l.data_abertura ? new Date(l.data_abertura).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : null),
        linha('Critério de julgamento', l.criterio), linha('Fundamento legal', l.amparo_legal), linha('Unidade requisitante', l.unidade_nome),
        linha('Valor estimado', l.valor_estimado !== null ? moedaBR(l.valor_estimado) : null), linha('Valor homologado / contratado', l.valor_homologado !== null ? moedaBR(l.valor_homologado) : null),
        linha('Resultado', l.vencedores)),
      el('section', { class: 'mt-3' }, el('h2', null, 'Documentos'),
        lista.length ? el('ul', { class: 'partes-contas cartao' }, lista.map((d) => el('li', null,
          el('a', { href: d.arquivo_url || d.link_externo, target: '_blank', rel: 'noopener' }, d.titulo, el('span', { class: 'sr' }, ' (abre em nova aba)')),
          el('span', { class: 'meta' }, (DOC_LIC[d.tipo] || 'Documento') + ' · ' + dataBR(d.data) + (d.arquivo_url ? ' · PDF' : '')))))
          : el('p', { class: 'vazio' }, l.link_externo ? 'Os documentos deste processo estão no link abaixo.' : 'Nenhum documento publicado ainda.')),
      l.link_externo ? el('p', { class: 'mt-2' }, el('a', { class: 'botao botao-claro', href: l.link_externo, target: '_blank', rel: 'noopener' },
        l.origem === 'pncp' ? 'Ver no PNCP' : 'Ver o processo no sistema de origem', el('span', { class: 'sr' }, ' (abre em nova aba)'))) : null,
      (ctrs || []).length ? el('section', { class: 'mt-3' }, el('h2', null, 'Contratos decorrentes'),
        el('ul', { class: 'partes-contas cartao' }, ctrs.map((c) => el('li', null, el('a', { href: '#/contrato/' + c.id }, nomeCtr(c)),
          el('span', { class: 'meta' }, c.contratado_nome + (c.valor_atual !== null ? ' · ' + moedaBR(c.valor_atual) : '')))))) : null,
      el('p', { class: 'mt-2 meta' }, 'Última atualização: ' + dataBR(l.atualizado_em)));
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
      el('p', { class: 'mt-2 meta' }, 'A ordem cronológica de pagamentos fica no ',
        S.conf.transparencia_url ? el('a', { href: S.conf.transparencia_url, target: '_blank', rel: 'noopener' }, 'Portal da Transparência') : 'Portal da Transparência', '.'));
    await abrir(params);

    async function abrir(prm) { return aba === 'fiscais' ? S.decl.envolver(conteudo, 'fiscais', abrirFiscais) : abrirContratos(prm); }

    async function abrirContratos(prm) {
      conteudo.replaceChildren(el('p', { class: 'carregando' }, 'Carregando…'));
      const { data: anosC, error } = await sb.rpc('contratos_anos', { p_orgao: org() });
      if (error) { conteudo.replaceChildren(el('p', null, 'Não foi possível carregar. Tente novamente.')); return; }
      const anoAtual = new Date().getFullYear();
      const contagem = new Map((anosC || []).map((x) => [x.ano, x.total]));
      if (!contagem.has(anoAtual)) contagem.set(anoAtual, 0);
      const decl = await S.decl.de('contratos');
      if (S.decl.atual(decl)) { history.replaceState(null, '', '#/contratos'); conteudo.replaceChildren(S.decl.cartaoAtual(S.decl.atual(decl))); return; }
      for (const x of S.decl.mesclarAnos([], decl)) if (!contagem.has(x.ano)) contagem.set(x.ano, 0);
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
        const declAno = S.decl.doAno(decl, ano);
        if (!contagem.get(ano)) { painelAno.replaceChildren(declAno.length ? S.decl.quadro(declAno) : el('p', { class: 'vazio' }, 'Não foram celebrados contratos em ' + ano + (ano === anoAtual ? ' até esta data.' : '.'))); return; }
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
        painelAno.replaceChildren(S.decl.quadro(declAno, 'Períodos sem ocorrência em ' + ano),
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
      el('section', { class: 'cartao' }, el('h2', null, 'Objeto'), el('p', { class: 'pre' }, c.objeto)),
      el('dl', { class: 'ficha-lic' },
        linha('Contratado', c.contratado_nome), linha('CNPJ / CPF', docCtr(c.contratado_doc)), linha('Processo administrativo', c.processo),
        linha('Licitação de origem', lic ? el('a', { href: '#/licitacao/' + lic.id }, (MOD_LIC[lic.modalidade] || '') + (lic.numero ? ' nº ' + lic.numero : '')) : null),
        linha('Assinatura', dataBR(c.data_assinatura)), linha('Vigência', (dataBR(c.vigencia_inicio) || '?') + ' a ' + (dataBR(c.vigencia_fim_atual) || '?')),
        linha('Rescindido em', c.rescindido_em ? dataBR(c.rescindido_em) : null),
        linha('Valor inicial', c.valor_inicial !== null ? moedaBR(c.valor_inicial) : null), linha('Valor atual (com aditivos)', c.valor_atual !== null ? moedaBR(c.valor_atual) : null),
        linha('Unidade contratante', c.unidade_nome)),
      teor ? el('p', { class: 'mt-2' }, el('a', { class: 'botao', href: teor, target: '_blank', rel: 'noopener' },
        c.arquivo_url ? 'Inteiro teor do contrato (PDF)' : c.origem === 'pncp' ? 'Ver o contrato no PNCP' : 'Ver o contrato no sistema de origem', el('span', { class: 'sr' }, ' (abre em nova aba)'))) : null,
      el('section', { class: 'mt-3' }, el('h2', null, 'Aditivos e apostilamentos'),
        (ad || []).length ? el('div', { class: 'tabela-rolagem' }, el('table', { class: 'tabela-dados' },
          el('thead', null, el('tr', null, ['Termo', 'Assinatura', 'Valor', 'Nova vigência', 'Inteiro teor'].map((t) => el('th', { scope: 'col' }, t)))),
          el('tbody', null, ad.map((a) => el('tr', null,
            el('td', { 'data-rotulo': 'Termo' }, el('strong', null, a.numero || ADIT_CTR[a.tipo]), el('span', { class: 'meta' }, ADIT_CTR[a.tipo] + (a.descricao ? ' · ' + a.descricao : ''))),
            el('td', { 'data-rotulo': 'Assinatura', class: 'num' }, dataBR(a.data_assinatura)),
            el('td', { 'data-rotulo': 'Valor', class: 'num' }, a.valor !== null ? moedaBR(a.valor) : '—'),
            el('td', { 'data-rotulo': 'Nova vigência', class: 'num' }, a.nova_vigencia_fim ? dataBR(a.nova_vigencia_fim) : '—'),
            el('td', { 'data-rotulo': 'Inteiro teor' }, a.arquivo_url || a.link_externo ? el('a', { href: a.arquivo_url || a.link_externo, target: '_blank', rel: 'noopener' }, a.arquivo_url ? 'PDF' : 'Link', el('span', { class: 'sr' }, ' (abre em nova aba)')) : '—'))))))
          : el('p', { class: 'vazio' }, 'Este contrato não tem aditivos.')),
      el('section', { class: 'mt-3' }, el('h2', null, 'Fiscais e gestor'),
        (fi || []).length ? el('ul', { class: 'partes-contas cartao' }, fi.map((x) => el('li', null, el('strong', null, x.nome),
          el('span', { class: 'meta' }, (FUNCAO_CTR[x.funcao] || x.funcao) + (x.ato ? ' · ' + x.ato : '') + (x.inicio || x.fim ? ' · ' + (x.inicio ? dataBR(x.inicio) : '…') + ' a ' + (x.fim ? dataBR(x.fim) : 'atual') : '')))))
          : el('p', { class: 'vazio' }, 'Fiscal não informado.'),
        el('p', { class: 'meta' }, el('a', { href: '#/contratos/fiscais' }, 'Ver a relação de todos os fiscais de contratos'))),
      el('p', { class: 'mt-2 meta' }, 'Última atualização: ' + dataBR(c.atualizado_em)));
  };

  // e-SIC e Ouvidoria: páginas próprias em atendimento.js (Fase 3).

  // ===================================================================
  // BUSCA GERAL (1.4)
  // ===================================================================
  R.busca = async function (main, partes, params) {
    const q = (params.get('q') || '').trim();
    await tiposPub();
    S.titulo('Busca'); S.trilha(['Busca']);
    const campo = document.getElementById('campo-busca'); if (campo) campo.value = q;
    if (q.length < 2) { pagina(main, el('h1', null, 'Busca'), el('p', null, 'Digite pelo menos 2 letras no campo de pesquisa.')); return; }
    // Dentro de or() o curinga é * (o % confunde a sintaxe do filtro).
    const n = termo(q), cru = '*' + q.replace(/[%_*(),.]/g, ' ').trim() + '*';
    const [nt, pb, sv, pg, fq, un, ct, lc, co, cv, em, ob, cs, rn, ds, es, md, cn, pv, dp] = await Promise.all([
      sb.from('noticias').select('id, titulo, publicado_em').eq('orgao_id', org()).ilike('busca', n).order('publicado_em', { ascending: false }).limit(8),
      sb.from('publicacoes').select('id, tipo, numero, ano, ementa, arquivo_url, link_externo').eq('orgao_id', org()).ilike('busca', n).order('data_publicacao', { ascending: false }).limit(8),
      sb.from('servicos').select('id, nome').eq('orgao_id', org()).ilike('busca', n).order('nome').limit(8),
      sb.from('paginas').select('titulo, slug').eq('orgao_id', org()).or('titulo.ilike.' + cru + ',conteudo.ilike.' + cru).limit(8),
      sb.from('faq').select('pergunta').eq('orgao_id', org()).or('pergunta.ilike.' + cru + ',resposta.ilike.' + cru).limit(8),
      sb.from('unidades').select('id, nome').eq('orgao_id', org()).or('nome.ilike.' + cru + ',competencias.ilike.' + cru).limit(8),
      sb.from('documentos_contas').select('tipo, exercicio, exercicio_fim, periodo, periodicidade, parte').eq('orgao_id', org()).ilike('busca', n).order('exercicio', { ascending: false }).limit(8),
      sb.from('licitacoes').select('id, modalidade, numero, objeto').eq('orgao_id', org()).ilike('busca', n).order('data_publicacao', { ascending: false }).limit(8),
      sb.from('contratos').select('id, tipo, numero, objeto, contratado_nome').eq('orgao_id', org()).ilike('busca', n).order('data_assinatura', { ascending: false }).limit(8),
      sb.from('convenios').select('id, tipo, instrumento, numero, objeto, parte_nome').eq('orgao_id', org()).ilike('busca', n).order('ano', { ascending: false }).limit(8),
      sb.from('emendas').select('id, numero, autor, objeto').eq('orgao_id', org()).ilike('busca', n).order('exercicio', { ascending: false }).limit(8),
      sb.from('obras').select('id, titulo').eq('orgao_id', org()).ilike('busca', n).order('atualizado_em', { ascending: false }).limit(8),
      sb.from('concursos').select('id, tipo, numero, titulo').eq('orgao_id', org()).ilike('busca', n).order('ano', { ascending: false }).limit(8),
      sb.from('renuncias').select('titulo').eq('orgao_id', org()).ilike('busca', n).order('titulo').limit(8),
      sb.from('documentos_setoriais').select('area, titulo, arquivo_url, link_externo').eq('orgao_id', org()).ilike('busca', n).order('exercicio', { ascending: false }).limit(8),
      sb.from('saude_estabelecimentos').select('nome').eq('orgao_id', org()).ilike('busca', n).order('nome').limit(8),
      sb.from('saude_medicamentos').select('nome, apresentacao').eq('orgao_id', org()).ilike('busca', n).order('nome').limit(8),
      sb.from('conselhos').select('id, nome').eq('orgao_id', org()).or('nome.ilike.' + cru + ',sigla.ilike.' + cru).limit(8),
      sb.from('pessoal_vinculos').select('nome, cargo, lotacao').eq('orgao_id', org()).ilike('busca', n).order('nome').limit(8),
      sb.from('despesas').select('id, numero, credor_nome, objeto').eq('orgao_id', org()).ilike('busca', n).order('data_empenho', { ascending: false }).limit(8)
    ]);
    // Nomes das seções do site: quem digita "contratos" ou "licitação" chega à página, mesmo que
    // a palavra não apareça dentro dos registros. Compara sem acento e sem plural simples.
    const raiz = (t) => normalizar(t).replace(/(oes|aes|ais|eis|s)$/, '');
    const palavras = normalizar(q).split(/\s+/).filter((w) => w.length > 2).map(raiz);
    const secoes = secoesDoSite().filter(([t, , , extra]) => {
      const alvo = normalizar(t + ' ' + extra).split(/[^a-z0-9]+/).map(raiz);
      return palavras.length && palavras.every((w) => alvo.some((x) => x.startsWith(w) || w.startsWith(x) && x.length > 3));
    });
    const grupos = [
      ['Páginas do site', secoes.map(([t, chave, h]) => [t, chave ? (S.destino(chave) || {}).href : h]).filter((x) => x[1]), null],
      ['Serviços', (sv.data || []).map((s) => [s.nome, '#/servico/' + s.id]), '#/servicos?q=' + encodeURIComponent(q)],
      ['Notícias', (nt.data || []).map((x) => [x.titulo + ' (' + dataBR(x.publicado_em) + ')', '#/noticia/' + x.id]), '#/noticias?q=' + encodeURIComponent(q)],
      ['Publicações oficiais', (pb.data || []).map((x) => [ato(x) + ' — ' + x.ementa, x.arquivo_url || x.link_externo || '#/publicacoes?q=' + encodeURIComponent(q)]), '#/publicacoes?q=' + encodeURIComponent(q)],
      ['Contratos', (co.data || []).map((x) => [nomeCtr(x) + ' · ' + x.contratado_nome + ' · ' + (x.objeto.length > 70 ? x.objeto.slice(0, 70) + '…' : x.objeto), '#/contrato/' + x.id]), '#/contratos'],
      ['Licitações', (lc.data || []).map((x) => [nomeLic(x) + ' · ' + (x.objeto.length > 90 ? x.objeto.slice(0, 90) + '…' : x.objeto), '#/licitacao/' + x.id]), '#/licitacoes'],
      ['Planejamento e contas', (ct.data || []).map((x) => [curtoContas(x.tipo) + ' · ' + periodoContas(x) + (x.periodo ? ' de ' + x.exercicio : '') + ' · ' + x.parte, '#/planejamento/' + x.tipo + '?ano=' + x.exercicio]), '#/planejamento'],
      ['Convênios e transferências', (cv.data || []).map((x) => [nomeConv(x) + ' · ' + x.parte_nome + ' · ' + (x.objeto.length > 70 ? x.objeto.slice(0, 70) + '…' : x.objeto), '#/convenio/' + x.id]), '#/convenios'],
      ['Emendas parlamentares', (em.data || []).map((x) => ['Emenda nº ' + x.numero + ' · ' + x.autor + ' · ' + (x.objeto.length > 70 ? x.objeto.slice(0, 70) + '…' : x.objeto), '#/emenda/' + x.id]), '#/emendas'],
      ['Obras', (ob.data || []).map((x) => [x.titulo, '#/obra/' + x.id]), '#/obras'],
      ['Concursos e seleções', (cs.data || []).map((x) => [nomeSel(x) + ' · ' + x.titulo, '#/concurso/' + x.id]), '#/concursos'],
      ['Renúncias de receita', (rn.data || []).map((x) => [x.titulo, '#/renuncias/desoneracoes']), '#/renuncias'],
      ['Saúde e educação: planos e relatórios', (ds.data || []).map((x) => [x.titulo, x.arquivo_url || x.link_externo || (x.area === 'saude' ? '#/saude/planos' : '#/educacao/plano')]), null],
      ['Unidades de saúde', (es.data || []).map((x) => [x.nome, '#/saude/servicos']), '#/saude/servicos'],
      ['Medicamentos do SUS', (md.data || []).map((x) => [x.nome + (x.apresentacao ? ' ' + x.apresentacao : ''), '#/saude/medicamentos']), '#/saude/medicamentos'],
      ['Conselhos municipais', (cn.data || []).map((x) => [x.nome, '#/conselho/' + x.id]), '#/conselhos'],
      ['Servidores', (pv.data || []).map((x) => [x.nome + ' · ' + x.cargo + (x.lotacao ? ' · ' + x.lotacao : ''), (S.destino('pessoal_servidores') || {}).href]).filter((x) => x[1]), (S.destino('pessoal_servidores') || {}).href],
      ['Despesas (empenhos)', (dp.data || []).map((x) => ['Empenho ' + x.numero + ' · ' + x.credor_nome + ' · ' + (x.objeto.length > 70 ? x.objeto.slice(0, 70) + '…' : x.objeto), '#/despesa/' + x.id]), (S.destino('despesas') || {}).href],
      ['Unidades', (un.data || []).map((x) => [x.nome, '#/unidade/' + x.id]), null],
      ['Páginas', (pg.data || []).map((x) => [x.titulo, '#/pagina/' + x.slug]), null],
      ['Perguntas frequentes', (fq.data || []).map((x) => [x.pergunta, '#/faq']), null]
    ].filter((g) => g[1].length);
    const total = grupos.reduce((s, g) => s + g[1].length, 0);
    pagina(main, el('h1', null, 'Resultados para “' + q + '”'),
      el('p', { class: 'sub', role: 'status' }, total ? total + ' resultado' + (total > 1 ? 's' : '') + ' (até 8 por seção).' : 'Nenhum resultado. Tente outra palavra ou consulte o Mapa do site.'),
      grupos.map(([t, itens, todos]) => el('section', { class: 'mb-3' },
        el('div', { class: 'secao-titulo' }, el('h2', null, t), todos && itens.length === 8 ? el('a', { href: todos }, 'Ver todos →') : null),
        el('ul', null, itens.map(([rot, href]) => el('li', { style: 'margin:6px 0' }, el('a', { href, target: href.startsWith('http') ? '_blank' : null, rel: href.startsWith('http') ? 'noopener' : null }, rot)))))));
  };

  // ---------- Concursos e processos seletivos (PNTP 6.6 e 6.7) ----------
  const TIPO_SEL = { concurso: 'Concurso público', processo_seletivo: 'Processo seletivo simplificado', estagio: 'Seleção de estágio',
    chamamento: 'Chamamento público', credenciamento: 'Credenciamento', outro: 'Seleção' };
  const AND_SEL = { previsto: ['Previsto', 'etiqueta-ambar'], inscricoes_abertas: ['Inscrições abertas', 'etiqueta-verde'], em_andamento: ['Em andamento', 'etiqueta-ambar'],
    resultado: ['Resultado divulgado', 'etiqueta-ambar'], homologado: ['Homologado', 'etiqueta-verde'], suspenso: ['Suspenso', 'etiqueta-vermelha'],
    cancelado: ['Cancelado', 'etiqueta-vermelha'], encerrado: ['Encerrado', 'etiqueta-ambar'] };
  const DOC_SEL = { edital: 'Edital', retificacao: 'Retificação', anexo: 'Anexo', inscritos: 'Inscritos', gabarito: 'Gabarito', resultado_preliminar: 'Resultado preliminar',
    recurso: 'Recursos', resultado_final: 'Resultado final', homologacao: 'Homologação', convocacao: 'Convocação', nomeacao: 'Nomeação', prorrogacao: 'Prorrogação', outro: 'Documento' };
  const nomeSel = (c) => (TIPO_SEL[c.tipo] || 'Seleção') + (c.numero ? ' nº ' + c.numero : '');
  const CAMPOS_SEL = 'id, tipo, numero, ano, titulo, descricao, unidade_nome, vagas, organizadora, inscricoes_inicio, inscricoes_fim, data_prova, validade_ate, andamento, link_externo, atualizado_em';

  R.concursos = async function (main, partes, params) {
    S.titulo('Concursos e processos seletivos'); S.trilha(['Transparência', '#/transparencia'], ['Concursos e processos seletivos']);
    const conteudo = el('div', { class: 'painel-guia', role: 'tabpanel' }, el('p', { class: 'carregando' }, 'Carregando…'));
    pagina(main, el('h1', null, 'Concursos e processos seletivos'),
      el('p', { class: 'sub' }, 'Editais (íntegra) e todos os atos de concursos públicos, processos seletivos, seleções de estágio e chamamentos: retificações, inscritos, resultados, recursos, homologação e convocações.'),
      conteudo);
    return listaAnual(conteudo, params, {
      base: '#/concursos', declaracao: 'concursos', titulo: 'Concursos e processos seletivos', rotuloAno: 'Ano', nome: 'concursos-e-selecoes', unidade: ['seleção', 'seleções'],
      vazio: 'Não há concursos públicos ou processos seletivos realizados por este órgão até esta data. Atualizado em ' + new Date().toLocaleDateString('pt-BR') + '.',
      anos: async () => { const { data, error } = await sb.rpc('concursos_anos', { p_orgao: org() }); return error ? null : data || []; },
      montar: (sel, op, ano, f) => {
        let q = sb.from('concursos').select(sel || CAMPOS_SEL, op).eq('orgao_id', org());
        if (ano !== 'todos') q = q.eq('ano', ano);
        if (f.busca) q = q.ilike('busca', termo(f.busca));
        if (f.tipo) q = q.eq('tipo', f.tipo);
        if (f.andamento) q = q.eq('andamento', f.andamento);
        return q;
      },
      filtros: () => [['busca', 'Pesquisar (título, cargo, edital)', el('input', { type: 'search', placeholder: 'Ex.: agente de saúde, professor, 01/2026' })],
        ['tipo', 'Tipo', selecao(TIPO_SEL)], ['andamento', 'Andamento', selecao(AND_SEL)]],
      cabecalho: ['Seleção', 'Inscrições', 'Vagas', 'Andamento'],
      colunas: [['tipo', 'Tipo', (v) => TIPO_SEL[v] || v], ['numero', 'Edital'], ['ano', 'Ano'], ['titulo', 'Título'], ['vagas', 'Vagas'], ['inscricoes_inicio', 'Início das inscrições'],
        ['inscricoes_fim', 'Fim das inscrições'], ['data_prova', 'Prova'], ['validade_ate', 'Validade até'], ['andamento', 'Andamento', (v) => AND_SEL[v] ? AND_SEL[v][0] : v], ['organizadora', 'Organizadora'], ['unidade_nome', 'Unidade']],
      linha: (c) => {
        const a = AND_SEL[c.andamento] || [c.andamento, 'etiqueta-ambar'];
        return el('tr', null,
          el('td', { 'data-rotulo': 'Seleção', class: 'lic-obj' }, el('a', { href: '#/concurso/' + c.id }, el('strong', null, nomeSel(c))), el('span', { class: 'meta' }, c.titulo)),
          el('td', { 'data-rotulo': 'Inscrições', class: 'num' }, periodoBR(c.inscricoes_inicio, c.inscricoes_fim)),
          el('td', { 'data-rotulo': 'Vagas' }, c.vagas || '—'),
          el('td', { 'data-rotulo': 'Andamento' }, el('span', { class: 'etiqueta ' + a[1] }, a[0])),
          el('td', { 'data-rotulo': '' }, el('a', { href: '#/concurso/' + c.id, class: 'botao botao-claro botao-p' }, 'Edital e atos', el('span', { class: 'sr' }, ' de ' + nomeSel(c)))));
      }
    });
  };

  R.concurso = async function (main, partes) {
    const id = partes[0];
    if (!/^[0-9a-f-]{36}$/i.test(id || '')) return R['*'](main);
    const [{ data: c }, { data: docs }] = await Promise.all([
      sb.from('concursos').select(CAMPOS_SEL).eq('orgao_id', org()).eq('id', id).maybeSingle(),
      sb.from('concursos_documentos').select('tipo, titulo, data, arquivo_url, link_externo').eq('concurso_id', id).order('data').limit(300)
    ]);
    if (!c) return R['*'](main);
    S.titulo(nomeSel(c)); S.trilha(['Transparência', '#/transparencia'], ['Concursos e processos seletivos', '#/concursos'], [nomeSel(c)]);
    const linha = (rot, val) => val ? el('div', null, el('dt', null, rot), el('dd', null, val)) : null;
    const a = AND_SEL[c.andamento] || [c.andamento, 'etiqueta-ambar'];
    const lista = docs || [];
    pagina(main, el('p', { class: 'meta' }, 'Concursos e processos seletivos · ' + c.ano), el('h1', null, nomeSel(c)),
      el('p', { class: 'sub' }, c.titulo), el('p', null, el('span', { class: 'etiqueta ' + a[1] }, a[0])),
      c.descricao ? el('section', { class: 'cartao' }, el('h2', null, 'Sobre a seleção'), el('p', { class: 'pre' }, c.descricao)) : null,
      el('dl', { class: 'ficha-lic' }, linha('Vagas', c.vagas), linha('Inscrições', c.inscricoes_inicio || c.inscricoes_fim ? periodoBR(c.inscricoes_inicio, c.inscricoes_fim) : null),
        linha('Prova / avaliação', c.data_prova ? dataBR(c.data_prova) : null), linha('Validade até', c.validade_ate ? dataBR(c.validade_ate) : null),
        linha('Organizadora', c.organizadora), linha('Unidade', c.unidade_nome)),
      c.link_externo ? el('p', { class: 'mt-2' }, el('a', { class: 'botao botao-claro', href: c.link_externo, target: '_blank', rel: 'noopener' }, 'Página da seleção (inscrições)', el('span', { class: 'sr' }, ' (abre em nova aba)'))) : null,
      el('section', { class: 'mt-3' }, el('h2', null, 'Edital e atos da seleção'),
        lista.length ? el('ul', { class: 'partes-contas cartao' }, lista.map((d) => el('li', null,
          el('a', { href: d.arquivo_url || d.link_externo, target: '_blank', rel: 'noopener' }, d.titulo, el('span', { class: 'sr' }, ' (abre em nova aba)')),
          el('span', { class: 'meta' }, (DOC_SEL[d.tipo] || 'Documento') + ' · ' + dataBR(d.data) + (d.arquivo_url ? ' · PDF' : '')))))
          : el('p', { class: 'vazio' }, 'Nenhum documento publicado.')));
  };

  // ---------- Serviços on-line (PNTP 15.3) ----------
  // Os serviços da Carta que podem ser pedidos pela internet, com o botão para o endereço do pedido.
  R['servicos-online'] = async function (main, partes, params) {
    S.titulo('Serviços on-line'); S.trilha(['Serviços on-line']);
    const { data } = await sb.from('servicos').select('id, nome, categoria, descricao, link_digital, publico_alvo').eq('orgao_id', org())
      .in('forma_prestacao', ['digital', 'presencial_digital']).order('nome').limit(500);
    const lista = data || [];
    const cats = [...new Set(lista.map((x) => x.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const fBusca = el('input', { type: 'search', placeholder: 'Ex.: alvará, IPTU, matrícula', value: params.get('q') || '' });
    const fCat = el('select', null, el('option', { value: '' }, 'Todas'), cats.map((c) => el('option', { value: c }, c)));
    const grade = el('div', { class: 'grade g3' }), total = el('p', { class: 'meta', role: 'status' });
    const desenhar = () => {
      const t = normalizar(fBusca.value.trim()), c = fCat.value;
      const vis = lista.filter((x) => (!c || x.categoria === c) && (!t || normalizar(x.nome + ' ' + (x.descricao || '') + ' ' + (x.categoria || '')).includes(t)));
      total.textContent = vis.length + (vis.length === 1 ? ' serviço' : ' serviços');
      grade.replaceChildren(...vis.map((x) => el('div', { class: 'cartao servico-online' },
        x.categoria ? el('span', { class: 'etiqueta' }, x.categoria) : null,
        el('h2', { style: 'font-size:1.05rem;margin:8px 0 6px' }, x.nome),
        x.descricao ? el('p', { class: 'meta' }, x.descricao.length > 160 ? x.descricao.slice(0, 160) + '…' : x.descricao) : null,
        el('p', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 0' },
          x.link_digital ? el('a', { class: 'botao botao-p', href: x.link_digital, target: '_blank', rel: 'noopener' }, 'Acessar o serviço', el('span', { class: 'sr' }, ' ' + x.nome + ' (abre em nova aba)')) : null,
          el('a', { class: 'botao botao-claro botao-p', href: '#/servico/' + x.id }, 'Como pedir', el('span', { class: 'sr' }, ' ' + x.nome))))));
    };
    let espera;
    fBusca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(desenhar, 250); });
    fCat.addEventListener('change', desenhar);
    pagina(main, el('h1', null, 'Serviços on-line'),
      el('p', { class: 'sub' }, 'Serviços que você pode pedir pela internet, sem ir ao balcão. As regras de cada um estão na ', el('a', { href: '#/servicos' }, 'Carta de Serviços ao Usuário'), '.'),
      lista.length ? [el('form', { class: 'filtros', role: 'search', onsubmit: (e) => { e.preventDefault(); desenhar(); } },
        el('label', null, 'Pesquisar serviço', fBusca), el('label', null, 'Categoria', fCat)), total, grade]
        : el('p', { class: 'vazio' }, 'Ainda não há serviços oferecidos pela internet. Consulte a Carta de Serviços para saber como pedir cada serviço.'));
    if (lista.length) desenhar();
  };

  // ---------- Convênios e transferências (PNTP 5.1 a 5.3) e emendas parlamentares (17.1 a 17.3) ----------
  // Lista anual reutilizável: faixa de anos ("Todos" primeiro), filtros, total, tabela e CSV/JSON.
  // cfg: { base, rotuloAno, anos: async () => [{ano,total}], montar(sel, op, ano, f), filtros: [[chave, rotulo, elemento]],
  //        cabecalho, linha(r), colunas, nome, vazioFiltro, ordem }
  // cfg.declaracao: chave(s) das declarações de que não há dados (script 23). A declaração atual
  // substitui a lista; ano só declarado vira aba própria (com a declaração no lugar da lista); as do
  // ano aparecem no alto; com um mês filtrado, as que tocam aquele mês.
  function listaAnual(conteudo, prm, cfg) {
    return Promise.all([cfg.anos(), cfg.declaracao ? S.decl.de(cfg.declaracao) : []]).then(([anosLst, decl]) => {
      if (!anosLst) { conteudo.replaceChildren(el('p', null, 'Não foi possível carregar. Tente novamente.')); return; }
      if (cfg.declaracao) conteudo.dataset.declAnual = '1';
      const declAtual = S.decl.atual(decl);
      if (declAtual) { history.replaceState(null, '', cfg.base); conteudo.replaceChildren(S.decl.cartaoAtual(declAtual)); return; }
      anosLst = S.decl.mesclarAnos(anosLst, decl);
      if (!anosLst.length) { history.replaceState(null, '', cfg.base); conteudo.replaceChildren(el('p', { class: 'vazio' }, cfg.vazio)); return; }
      const contagem = new Map(anosLst.map((x) => [x.ano, Number(x.total)]));
      const anos = ['todos'].concat([...contagem.keys()].sort((a, b) => b - a));
      const pedido = Number(prm.get('ano'));
      // abrirRecente: abre no último exercício (os filtros de mês só existem com um ano escolhido).
      const soDeclarado = ![...contagem.values()].some((n) => Number(n) > 0);   // sem registros, só declarações: abre no ano declarado
      let ano = anos.includes(pedido) ? pedido : (cfg.abrirRecente || soDeclarado) && prm.get('ano') !== 'todos' && anos.length > 1 ? anos[1] : 'todos';
      const painelAno = el('div', { class: 'painel-guia painel-guia-interno', role: 'tabpanel' });
      const totalGeral = [...contagem.values()].reduce((s, n) => s + n, 0);
      const faixa = faixaAbas(anos.map((a) => [a, a === 'todos' ? 'Todos (' + totalGeral + ')' : contagem.get(a) ? a + ' (' + contagem.get(a) + ')' : String(a)]), ano, cfg.rotuloAno, true,
        (id) => { ano = id === 'todos' ? 'todos' : Number(id); abrirAno(); });
      conteudo.replaceChildren(faixa.lista, painelAno);
      faixa.marcar(ano);
      abrirAno();

      function abrirAno() {
        history.replaceState(null, '', cfg.base + (ano === 'todos' ? (cfg.abrirRecente ? '?ano=todos' : '') : '?ano=' + ano));
        const declAno = ano === 'todos' ? [] : S.decl.doAno(decl, ano);
        // Ano sem registros, só com declaração: a declaração no lugar da lista.
        if (ano !== 'todos' && !contagem.get(ano)) { painelAno.replaceChildren(S.decl.quadro(declAno)); return; }
        const declMes = el('div');
        const f = {};
        const montar = (sel, op) => cfg.montar(sel, op, ano, f);
        const corpoTab = el('tbody');
        const tabela = el('div', { class: 'tabela-rolagem' }, el('table', { class: 'tabela-dados tabela-lic' },
          el('caption', { class: 'sr' }, cfg.titulo + (ano === 'todos' ? '' : ' — ' + ano)),
          el('thead', null, el('tr', null, cfg.cabecalho.map((t) => el('th', { scope: 'col' }, t)), el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Detalhes')))), corpoTab));
        const vazio = el('div'), mais = el('div', { class: 'mais' }), totalTxt = el('span', { class: 'meta', role: 'status' });
        let itens = [], versao = 0;
        async function carregar(reiniciar) {
          const minha = reiniciar ? ++versao : versao;
          const [linhas, cont] = await Promise.all([
            paginar(montar, cfg.ordem || 'atualizado_em', reiniciar ? null : itens[itens.length - 1], 50, !!cfg.crescente),
            reiniciar ? montar('id', { count: 'exact', head: true }) : Promise.resolve(null)]);
          if (minha !== versao) return;
          // Mês filtrado com declaração: mostra a declaração daquele mês.
          declMes.replaceChildren(f.mes && ano !== 'todos' ? S.decl.quadro(S.decl.doMes(decl, ano, f.mes)) : '');
          if (cont) totalTxt.textContent = (cont.count || 0) + ' ' + ((cont.count || 0) === 1 ? cfg.unidade[0] : cfg.unidade[1]);
          itens = reiniciar ? linhas : itens.concat(linhas);
          tabela.hidden = !itens.length;
          vazio.replaceChildren(itens.length ? '' : el('p', { class: 'vazio' }, 'Nenhum registro com esses filtros.'));
          if (reiniciar) corpoTab.replaceChildren(...linhas.map(cfg.linha)); else corpoTab.append(...linhas.map(cfg.linha));
          const btn = el('button', { type: 'button', class: 'botao botao-claro' }, 'Carregar mais');
          btn.addEventListener('click', async () => { btn.disabled = true; btn.textContent = 'Carregando…'; await carregar(false); });
          mais.replaceChildren(linhas.length === 50 ? btn : '');
        }
        const campos = cfg.filtros(ano);
        for (const [k, , e] of campos) if (e.value) f[k] = e.value.trim();   // filtro que já vem marcado (ex.: último mês)
        let espera;
        const aplicar = () => { for (const [k, , e] of campos) f[k] = e.value.trim(); carregar(true); };
        for (const [, , e] of campos) {
          if (e.tagName === 'SELECT') e.addEventListener('change', aplicar);
          else e.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(aplicar, 400); });
        }
        const exportar = S.botoesExportar(cfg.nome + (ano === 'todos' ? '' : '-' + ano), cfg.colunas, async (de, ate) => {
          const { data } = await montar().order(cfg.ordem || 'atualizado_em', { ascending: !!cfg.crescente }).order('id', { ascending: !!cfg.crescente }).range(de, ate);
          return data || [];
        });
        painelAno.replaceChildren(
          S.decl.quadro(declAno, 'Períodos sem ocorrência em ' + ano),
          cfg.resumo ? cfg.resumo(ano, anosLst) : '',
          el('form', { class: 'filtros', role: 'search', onsubmit: (e) => { e.preventDefault(); aplicar(); } }, campos.map(([, rot, e]) => el('label', null, rot, e))),
          declMes, el('div', { class: 'barra-lista' }, totalTxt, exportar), tabela, vazio, mais);
        tabela.hidden = true;
        carregar(true).catch(() => vazio.replaceChildren(el('p', null, 'Não foi possível carregar. Tente novamente.')));
      }
    });
  }
  // Chaves como '01'…'99' saem fora de ordem em Object.entries (as que parecem inteiros vêm antes): ordena.
  const selecao = (obj, todos) => el('select', null, el('option', { value: '' }, todos || 'Todos'), Object.entries(obj).sort((x, y) => /^\d+$/.test(x[0] + y[0]) ? x[0].localeCompare(y[0]) : 0).map(([k, v]) => el('option', { value: k }, Array.isArray(v) ? v[0] : v)));
  const periodoBR = (a, b) => a || b ? (dataBR(a) || '…') + ' a ' + (dataBR(b) || '…') : '—';

  const TIPOS_CONV = {
    recebida: ['Transferências recebidas', '5.1', 'Concedente', 'Recebido', 'Não há transferências recebidas por convênio ou instrumento congênere por este órgão até esta data.'],
    realizada: ['Transferências realizadas', '5.2', 'Beneficiário', 'Concedido', 'Não há transferências realizadas por convênio ou instrumento congênere por este órgão até esta data.'],
    sem_repasse: ['Acordos sem repasse de recursos', '5.3', 'Partes', null, 'Não há acordos firmados sem transferência de recursos por este órgão até esta data.']
  };
  const INST_CONV = {
    convenio: 'Convênio', contrato_repasse: 'Contrato de repasse', termo_fomento: 'Termo de fomento', termo_colaboracao: 'Termo de colaboração',
    acordo_cooperacao: 'Acordo de cooperação', termo_execucao_descentralizada: 'Termo de execução descentralizada', termo_compromisso: 'Termo de compromisso',
    transferencia_especial: 'Transferência especial', fundo_a_fundo: 'Transferência fundo a fundo', protocolo_intencoes: 'Protocolo de intenções', outro: 'Instrumento'
  };
  const ESF_CONV = { federal: 'Federal', estadual: 'Estadual', municipal: 'Municipal', privada: 'Entidade privada / OSC', internacional: 'Internacional' };
  const AND_CONV = { em_execucao: ['Em execução', 'etiqueta-ambar'], concluido: ['Concluído', 'etiqueta-verde'], prestacao_contas: ['Em prestação de contas', 'etiqueta-ambar'],
    contas_aprovadas: ['Contas aprovadas', 'etiqueta-verde'], contas_rejeitadas: ['Contas rejeitadas', 'etiqueta-vermelha'], rescindido: ['Rescindido', 'etiqueta-vermelha'], cancelado: ['Cancelado', 'etiqueta-vermelha'] };
  const nomeConv = (c) => (INST_CONV[c.instrumento] || 'Instrumento') + (c.numero ? ' nº ' + c.numero : ' s/nº');
  const CAMPOS_CONV = 'id, tipo, instrumento, numero, ano, processo, objeto, parte_nome, parte_doc, esfera, unidade_nome, programa, valor_previsto, valor_contrapartida, valor_repassado, repasse_atualizado_em, data_assinatura, vigencia_inicio, vigencia_fim, andamento, obrigacoes, arquivo_url, link_externo, link_acompanhamento, atualizado_em';
  const colunasConv = (tipo) => [['instrumento', 'Instrumento', (v) => INST_CONV[v] || v], ['numero', 'Número'], ['ano', 'Ano'], ['objeto', 'Objeto'],
    ['parte_nome', TIPOS_CONV[tipo][2]], ['parte_doc', 'CNPJ/CPF', (v) => docCtr(v)], ['esfera', 'Esfera', (v) => ESF_CONV[v] || ''],
    ['vigencia_inicio', 'Início da vigência'], ['vigencia_fim', 'Fim da vigência']]
    .concat(tipo === 'sem_repasse' ? [['obrigacoes', 'Obrigações ajustadas']] : [['valor_previsto', 'Valor total previsto'], ['valor_contrapartida', 'Contrapartida'], ['valor_repassado', 'Valor ' + TIPOS_CONV[tipo][3].toLowerCase()]])
    .concat([['andamento', 'Andamento', (v) => AND_CONV[v] ? AND_CONV[v][0] : v], ['arquivo_url', 'Inteiro teor', (v, r) => v || r.link_externo || ''], ['processo', 'Processo'], ['unidade_nome', 'Unidade']]);

  R.convenios = async function (main, partes, params) {
    S.titulo('Convênios e transferências'); S.trilha(['Transparência', '#/transparencia'], ['Convênios e transferências']);
    const ids = Object.keys(TIPOS_CONV), mapa = { recebidas: 'recebida', realizadas: 'realizada', acordos: 'sem_repasse' };
    let tipo = mapa[partes[0]] || 'recebida';
    const rota = (t) => '#/convenios/' + Object.keys(mapa).find((k) => mapa[k] === t);
    const conteudo = el('div', { class: 'painel-guia', role: 'tabpanel' });
    const { lista } = faixaAbas(ids.map((t) => [t, TIPOS_CONV[t][0]]), tipo, 'Tipo de instrumento', false, (id) => { tipo = id; abrir(new URLSearchParams()); });
    pagina(main, el('h1', null, 'Convênios e transferências'),
      el('p', { class: 'sub' }, 'Recursos recebidos e repassados por convênio, contrato de repasse, termo de fomento ou colaboração, e acordos firmados sem repasse de dinheiro, com o inteiro teor de cada instrumento.'),
      lista, conteudo);
    await abrir(params);

    function abrir(prm) {
      conteudo.replaceChildren(el('p', { class: 'carregando' }, 'Carregando…'));
      const T = TIPOS_CONV[tipo], semValor = tipo === 'sem_repasse';
      return listaAnual(conteudo, prm, {
        base: rota(tipo), declaracao: ({ recebida: 'convenios_recebidas', realizada: 'convenios_realizadas', sem_repasse: 'convenios_acordos' })[tipo], titulo: T[0], rotuloAno: 'Ano', nome: 'convenios-' + tipo, unidade: ['instrumento', 'instrumentos'],
        vazio: T[4] + ' Atualizado em ' + new Date().toLocaleDateString('pt-BR') + '.',
        anos: async () => { const { data, error } = await sb.rpc('convenios_anos', { p_orgao: org(), p_tipo: tipo }); return error ? null : data || []; },
        montar: (sel, op, ano, f) => {
          let q = sb.from('convenios').select(sel || CAMPOS_CONV, op).eq('orgao_id', org()).eq('tipo', tipo);
          if (ano !== 'todos') q = q.eq('ano', ano);
          if (f.busca) q = q.ilike('busca', termo(f.busca));
          if (f.andamento) q = q.eq('andamento', f.andamento);
          if (f.esfera) q = q.eq('esfera', f.esfera);
          if (f.vigencia === 'vigente') q = q.or('vigencia_fim.is.null,vigencia_fim.gte.' + hojeISO());
          if (f.vigencia === 'encerrada') q = q.lt('vigencia_fim', hojeISO());
          return q;
        },
        filtros: () => [['busca', 'Pesquisar (número, objeto ou ' + T[2].toLowerCase() + ')', el('input', { type: 'search', placeholder: 'Ex.: patrulha mecanizada, 912345' })],
          ['vigencia', 'Vigência', el('select', null, el('option', { value: '' }, 'Todas'), el('option', { value: 'vigente' }, 'Vigentes'), el('option', { value: 'encerrada' }, 'Encerradas'))],
          ['andamento', 'Andamento', selecao(AND_CONV)]].concat(semValor ? [] : [['esfera', tipo === 'recebida' ? 'Origem do recurso' : 'Esfera do beneficiário', selecao(ESF_CONV, 'Todas')]]),
        cabecalho: ['Instrumento e objeto', T[2], 'Vigência'].concat(semValor ? ['Obrigações'] : ['Valor previsto', T[3]], ['Andamento']),
        colunas: colunasConv(tipo),
        linha: (c) => {
          const a = AND_CONV[c.andamento] || [c.andamento, 'etiqueta-ambar'];
          return el('tr', null,
            el('td', { 'data-rotulo': 'Instrumento', class: 'lic-obj' }, el('a', { href: '#/convenio/' + c.id }, el('strong', null, nomeConv(c))), el('span', { class: 'meta' }, c.objeto)),
            el('td', { 'data-rotulo': T[2] }, c.parte_nome, c.esfera ? el('span', { class: 'meta' }, ESF_CONV[c.esfera]) : null),
            el('td', { 'data-rotulo': 'Vigência', class: 'num' }, periodoBR(c.vigencia_inicio, c.vigencia_fim)),
            semValor ? el('td', { 'data-rotulo': 'Obrigações', class: 'lic-obj' }, c.obrigacoes ? (c.obrigacoes.length > 140 ? c.obrigacoes.slice(0, 140) + '…' : c.obrigacoes) : '—') : null,
            semValor ? null : el('td', { 'data-rotulo': 'Valor previsto', class: 'num' }, c.valor_previsto != null ? moedaBR(c.valor_previsto) : '—'),
            semValor ? null : el('td', { 'data-rotulo': T[3], class: 'num' }, c.valor_repassado != null ? moedaBR(c.valor_repassado) : '—',
              c.repasse_atualizado_em ? el('span', { class: 'meta' }, 'em ' + dataBR(c.repasse_atualizado_em)) : null),
            el('td', { 'data-rotulo': 'Andamento' }, el('span', { class: 'etiqueta ' + a[1] }, a[0])),
            el('td', { 'data-rotulo': '' }, el('a', { href: '#/convenio/' + c.id, class: 'botao botao-claro botao-p' }, 'Detalhes', el('span', { class: 'sr' }, ' de ' + nomeConv(c)))));
        }
      });
    }
  };

  R.convenio = async function (main, partes) {
    const id = partes[0];
    if (!/^[0-9a-f-]{36}$/i.test(id || '')) return R['*'](main);
    const [{ data: c }, { data: ems }] = await Promise.all([
      sb.from('convenios').select(CAMPOS_CONV).eq('orgao_id', org()).eq('id', id).maybeSingle(),
      sb.from('emendas').select('id, numero, origem, autor, valor_previsto').eq('convenio_id', id).limit(50)
    ]);
    if (!c) return R['*'](main);
    const T = TIPOS_CONV[c.tipo];
    S.titulo(nomeConv(c)); S.trilha(['Transparência', '#/transparencia'], ['Convênios e transferências', '#/convenios'], [nomeConv(c)]);
    const linha = (rot, val) => val || val === 0 ? el('div', null, el('dt', null, rot), el('dd', null, val)) : null;
    const a = AND_CONV[c.andamento] || [c.andamento, 'etiqueta-ambar'];
    const teor = c.arquivo_url || c.link_externo;
    pagina(main,
      el('p', { class: 'meta' }, T[0] + ' (PNTP ' + T[1] + ')'),
      el('h1', null, nomeConv(c)),
      el('p', null, el('span', { class: 'etiqueta ' + a[1] }, a[0])),
      el('section', { class: 'cartao' }, el('h2', null, 'Objeto'), el('p', { class: 'pre' }, c.objeto)),
      el('dl', { class: 'ficha-lic' },
        linha(T[2], c.parte_nome), linha('CNPJ / CPF', docCtr(c.parte_doc)), linha('Esfera', ESF_CONV[c.esfera]),
        linha('Processo', c.processo), linha('Programa / ação', c.programa), linha('Unidade executora', c.unidade_nome),
        linha('Assinatura', c.data_assinatura ? dataBR(c.data_assinatura) : null), linha('Vigência', periodoBR(c.vigencia_inicio, c.vigencia_fim)),
        c.tipo === 'sem_repasse' ? null : linha('Valor total previsto', c.valor_previsto != null ? moedaBR(c.valor_previsto) : null),
        c.tipo === 'sem_repasse' ? null : linha('Contrapartida', c.valor_contrapartida != null ? moedaBR(c.valor_contrapartida) : null),
        c.tipo === 'sem_repasse' ? null : linha('Valor ' + T[3].toLowerCase(), c.valor_repassado != null ? moedaBR(c.valor_repassado) + (c.repasse_atualizado_em ? ' (posição em ' + dataBR(c.repasse_atualizado_em) + ')' : '') : null)),
      c.obrigacoes ? el('section', { class: 'mt-2 cartao' }, el('h2', null, c.tipo === 'sem_repasse' ? 'Obrigações ajustadas' : 'Obrigações e metas'), el('p', { class: 'pre' }, c.obrigacoes)) : null,
      el('p', { class: 'linha-botoes mt-2' },
        teor ? el('a', { class: 'botao', href: teor, target: '_blank', rel: 'noopener' }, 'Inteiro teor do instrumento', el('span', { class: 'sr' }, ' (abre em nova aba)')) : el('span', { class: 'meta' }, 'Inteiro teor não anexado.'),
        c.link_acompanhamento ? el('a', { class: 'botao botao-claro', href: c.link_acompanhamento, target: '_blank', rel: 'noopener' }, 'Acompanhar a execução', el('span', { class: 'sr' }, ' (abre em nova aba)')) : null),
      (ems || []).length ? el('section', { class: 'mt-3' }, el('h2', null, 'Emendas parlamentares ligadas'),
        el('ul', null, ems.map((e) => el('li', null, el('a', { href: '#/emenda/' + e.id }, 'Emenda nº ' + e.numero + ' (' + (ORI_EMENDA[e.origem] || e.origem) + ') — ' + e.autor + ' · ' + moedaBR(e.valor_previsto)))))) : null);
  };

  const ORI_EMENDA = { federal: 'Federal', estadual: 'Estadual', municipal: 'Municipal' };
  const TIPO_EMENDA = { individual: 'Individual', bancada: 'De bancada', comissao: 'De comissão', relator: 'De relator', outra: 'Outra' };
  const FORMA_EMENDA = { transferencia_especial: 'Transferência especial', finalidade_definida: 'Transferência com finalidade definida', fundo_a_fundo: 'Fundo a fundo',
    convenio: 'Convênio / contrato de repasse', execucao_propria: 'Execução direta', outra: 'Outra' };
  const AND_EMENDA = { prevista: ['Prevista', 'etiqueta-ambar'], em_execucao: ['Em execução', 'etiqueta-ambar'], concluida: ['Concluída', 'etiqueta-verde'], impedida: ['Impedida', 'etiqueta-vermelha'], cancelada: ['Cancelada', 'etiqueta-vermelha'] };
  const FUNCOES_GOV = { '01': 'Legislativa', '02': 'Judiciária', '03': 'Essencial à Justiça', '04': 'Administração', '05': 'Defesa Nacional', '06': 'Segurança Pública',
    '07': 'Relações Exteriores', '08': 'Assistência Social', '09': 'Previdência Social', '10': 'Saúde', '11': 'Trabalho', '12': 'Educação', '13': 'Cultura',
    '14': 'Direitos da Cidadania', '15': 'Urbanismo', '16': 'Habitação', '17': 'Saneamento', '18': 'Gestão Ambiental', '19': 'Ciência e Tecnologia',
    '20': 'Agricultura', '21': 'Organização Agrária', '22': 'Indústria', '23': 'Comércio e Serviços', '24': 'Comunicações', '25': 'Energia', '26': 'Transporte',
    '27': 'Desporto e Lazer', '28': 'Encargos Especiais', '99': 'Reserva de Contingência' };
  const funcaoBR = (k) => k ? k + ' – ' + (FUNCOES_GOV[k] || '') : '';
  const CAMPOS_EMENDA = 'id, exercicio, origem, tipo, forma_repasse, numero, autor, objeto, funcao, beneficiario, unidade_nome, valor_previsto, valor_realizado, valor_empenhado, valor_liquidado, valor_pago, execucao_em, andamento, impedimento, convenio_id, observacao, arquivo_url, link_externo, atualizado_em';
  const COLUNAS_EMENDA = [['exercicio', 'Exercício'], ['origem', 'Origem', (v) => ORI_EMENDA[v] || v], ['tipo', 'Tipo de emenda', (v) => TIPO_EMENDA[v] || v],
    ['forma_repasse', 'Forma de repasse', (v) => FORMA_EMENDA[v] || v], ['numero', 'Número da emenda'], ['autor', 'Autoria'], ['objeto', 'Objeto'],
    ['funcao', 'Função de governo', (v) => funcaoBR(v)], ['beneficiario', 'Beneficiário'], ['valor_previsto', 'Valor previsto'], ['valor_realizado', 'Valor realizado'],
    ['valor_empenhado', 'Empenhado'], ['valor_liquidado', 'Liquidado'], ['valor_pago', 'Pago'], ['execucao_em', 'Posição da execução'],
    ['andamento', 'Andamento', (v) => AND_EMENDA[v] ? AND_EMENDA[v][0] : v], ['impedimento', 'Impedimento'], ['unidade_nome', 'Unidade']];
  const ABAS_EMENDA = [['todas', 'Todas as emendas', null], ['federais', 'Federais (17.1)', ['federal']], ['estaduais', 'Estaduais e municipais (17.2)', ['estadual', 'municipal']], ['execucao', 'Execução (17.3)', null]];

  R.emendas = async function (main, partes, params) {
    S.titulo('Emendas parlamentares'); S.trilha(['Transparência', '#/transparencia'], ['Emendas parlamentares']);
    let aba = ABAS_EMENDA.some((x) => x[0] === partes[0]) ? partes[0] : 'todas';
    const conteudo = el('div', { class: 'painel-guia', role: 'tabpanel' });
    const { lista } = faixaAbas(ABAS_EMENDA.map((x) => [x[0], x[1]]), aba, 'Emendas', false, (id) => { aba = id; abrir(new URLSearchParams()); });
    pagina(main, el('h1', null, 'Emendas parlamentares'),
      el('p', { class: 'sub' }, 'Emendas federais, estaduais e municipais (inclusive as aprovadas no orçamento do próprio município) destinadas a este órgão, com autoria, valores e a execução de cada uma.'),
      lista, conteudo);
    await abrir(params);

    function abrir(prm) {
      conteudo.replaceChildren(el('p', { class: 'carregando' }, 'Carregando…'));
      const def = ABAS_EMENDA.find((x) => x[0] === aba), exec = aba === 'execucao';
      return listaAnual(conteudo, prm, {
        base: '#/emendas' + (aba === 'todas' ? '' : '/' + aba), declaracao: ({ federais: 'emendas_federais', estaduais: 'emendas_estaduais' })[aba], titulo: def[1], rotuloAno: 'Exercício', nome: 'emendas' + (aba === 'todas' ? '' : '-' + aba), unidade: ['emenda', 'emendas'],
        vazio: 'Não há emendas parlamentares ' + (aba === 'federais' ? 'federais ' : aba === 'estaduais' ? 'estaduais ou municipais ' : '') + 'destinadas a este órgão até esta data. Atualizado em ' + new Date().toLocaleDateString('pt-BR') + '.',
        anos: async () => {
          let q = sb.from('emendas').select('exercicio').eq('orgao_id', org()).limit(5000);
          if (def[2]) q = q.in('origem', def[2]);
          const { data, error } = await q;
          if (error) return null;
          const m = new Map(); for (const r of data || []) m.set(r.exercicio, (m.get(r.exercicio) || 0) + 1);
          return [...m].map(([ano, total]) => ({ ano, total }));
        },
        montar: (sel, op, ano, f) => {
          let q = sb.from('emendas').select(sel || CAMPOS_EMENDA, op).eq('orgao_id', org());
          if (def[2]) q = q.in('origem', def[2]);
          if (ano !== 'todos') q = q.eq('exercicio', ano);
          if (f.busca) q = q.ilike('busca', termo(f.busca));
          for (const k of ['origem', 'forma_repasse', 'funcao', 'andamento']) if (f[k]) q = q.eq(k, f[k]);
          return q;
        },
        resumo: exec ? (ano) => {
          const caixa = el('div', { class: 'grade', style: 'margin-bottom:16px;grid-template-columns:repeat(auto-fit,minmax(160px,1fr))' });
          let q = sb.from('emendas').select('valor_previsto, valor_realizado, valor_empenhado, valor_liquidado, valor_pago').eq('orgao_id', org()).limit(5000);
          if (ano !== 'todos') q = q.eq('exercicio', ano);
          q.then(({ data }) => {
            const s = (k) => (data || []).reduce((t, r) => t + Number(r[k] || 0), 0);
            caixa.replaceChildren(...[['Previsto', 'valor_previsto'], ['Realizado', 'valor_realizado'], ['Empenhado', 'valor_empenhado'], ['Liquidado', 'valor_liquidado'], ['Pago', 'valor_pago']]
              .map(([r, k]) => el('div', { class: 'cartao' }, el('span', { class: 'meta' }, r + (ano === 'todos' ? '' : ' em ' + ano)), el('strong', { class: 'bloco maior' }, moedaBR(s(k))))));
          });
          return caixa;
        } : null,
        filtros: () => [['busca', 'Pesquisar (número, autor, objeto)', el('input', { type: 'search', placeholder: 'Ex.: ambulância, nome do parlamentar' })]]
          .concat(aba === 'estaduais' ? [['origem', 'Origem', el('select', null, el('option', { value: '' }, 'Estaduais e municipais'), el('option', { value: 'estadual' }, 'Estaduais'), el('option', { value: 'municipal' }, 'Municipais (próprias)'))]]
            : aba === 'federais' ? [] : [['origem', 'Origem', selecao(ORI_EMENDA, 'Todas')]],
          [['forma_repasse', 'Forma de repasse', selecao(FORMA_EMENDA)], ['funcao', 'Função de governo', selecao(Object.fromEntries(Object.keys(FUNCOES_GOV).map((k) => [k, funcaoBR(k)])), 'Todas')],
            ['andamento', 'Andamento', selecao(AND_EMENDA)]]),
        cabecalho: exec ? ['Emenda', 'Objeto', 'Previsto', 'Empenhado', 'Liquidado', 'Pago'] : ['Emenda', 'Autoria', 'Objeto e função', 'Valor previsto', 'Valor realizado', 'Andamento'],
        colunas: COLUNAS_EMENDA,
        linha: (e) => {
          const a = AND_EMENDA[e.andamento] || [e.andamento, 'etiqueta-ambar'];
          const cab = el('td', { 'data-rotulo': 'Emenda' }, el('a', { href: '#/emenda/' + e.id }, el('strong', null, 'Nº ' + e.numero)),
            el('span', { class: 'meta' }, (ORI_EMENDA[e.origem] || e.origem) + ' · ' + (TIPO_EMENDA[e.tipo] || '') + ' · ' + e.exercicio), el('span', { class: 'meta' }, FORMA_EMENDA[e.forma_repasse] || ''));
          const v = (rot, x) => el('td', { 'data-rotulo': rot, class: 'num' }, x != null ? moedaBR(x) : '—');
          const det = el('td', { 'data-rotulo': '' }, el('a', { href: '#/emenda/' + e.id, class: 'botao botao-claro botao-p' }, 'Detalhes', el('span', { class: 'sr' }, ' da emenda ' + e.numero)));
          return exec
            ? el('tr', null, cab, el('td', { 'data-rotulo': 'Objeto', class: 'lic-obj' }, e.objeto, e.execucao_em ? el('span', { class: 'meta' }, 'Posição em ' + dataBR(e.execucao_em)) : null),
              v('Previsto', e.valor_previsto), v('Empenhado', e.valor_empenhado), v('Liquidado', e.valor_liquidado), v('Pago', e.valor_pago), det)
            : el('tr', null, cab, el('td', { 'data-rotulo': 'Autoria' }, e.autor),
              el('td', { 'data-rotulo': 'Objeto', class: 'lic-obj' }, e.objeto, el('span', { class: 'meta' }, funcaoBR(e.funcao))),
              v('Valor previsto', e.valor_previsto), v('Valor realizado', e.valor_realizado),
              el('td', { 'data-rotulo': 'Andamento' }, el('span', { class: 'etiqueta ' + a[1] }, a[0])), det);
        }
      });
    }
  };

  R.emenda = async function (main, partes) {
    const id = partes[0];
    if (!/^[0-9a-f-]{36}$/i.test(id || '')) return R['*'](main);
    const { data: e } = await sb.from('emendas').select(CAMPOS_EMENDA).eq('orgao_id', org()).eq('id', id).maybeSingle();
    if (!e) return R['*'](main);
    let cv = null;
    if (e.convenio_id) { const r = await sb.from('convenios').select('id, instrumento, numero, parte_nome').eq('id', e.convenio_id).maybeSingle(); cv = r.data; }
    const titulo = 'Emenda nº ' + e.numero;
    S.titulo(titulo); S.trilha(['Transparência', '#/transparencia'], ['Emendas parlamentares', '#/emendas'], [titulo]);
    const linha = (rot, val) => val || val === 0 ? el('div', null, el('dt', null, rot), el('dd', null, val)) : null;
    const a = AND_EMENDA[e.andamento] || [e.andamento, 'etiqueta-ambar'];
    const m = (x) => x != null ? moedaBR(x) : null;
    pagina(main,
      el('p', { class: 'meta' }, 'Emenda parlamentar ' + (ORI_EMENDA[e.origem] || '').toLowerCase() + ' · exercício ' + e.exercicio),
      el('h1', null, titulo),
      el('p', null, el('span', { class: 'etiqueta ' + a[1] }, a[0])),
      e.andamento === 'impedida' && e.impedimento ? el('div', { class: 'cartao aviso-obra' }, el('h2', null, 'Impedimento'), el('p', null, e.impedimento)) : null,
      el('section', { class: 'cartao' }, el('h2', null, 'Objeto'), el('p', { class: 'pre' }, e.objeto)),
      el('dl', { class: 'ficha-lic' },
        linha('Origem', ORI_EMENDA[e.origem]), linha('Tipo de emenda', TIPO_EMENDA[e.tipo]), linha('Forma de repasse', FORMA_EMENDA[e.forma_repasse]),
        linha('Autoria', e.autor), linha('Função de governo', funcaoBR(e.funcao)), linha('Beneficiário', e.beneficiario), linha('Unidade executora', e.unidade_nome),
        linha('Valor previsto', m(e.valor_previsto)), linha('Valor realizado', m(e.valor_realizado)),
        linha('Empenhado', m(e.valor_empenhado)), linha('Liquidado', m(e.valor_liquidado)), linha('Pago', m(e.valor_pago)),
        linha('Posição da execução', e.execucao_em ? dataBR(e.execucao_em) : null),
        linha('Convênio', cv ? el('a', { href: '#/convenio/' + cv.id }, nomeConv(cv) + ' — ' + cv.parte_nome) : null)),
      e.observacao ? el('p', { class: 'pre mt-2' }, e.observacao) : null,
      e.arquivo_url || e.link_externo ? el('p', { class: 'mt-2' }, el('a', { class: 'botao botao-claro', href: e.arquivo_url || e.link_externo, target: '_blank', rel: 'noopener' }, 'Mais informações sobre a emenda', el('span', { class: 'sr' }, ' (abre em nova aba)'))) : null);
  };

  // ---------- Obras (PNTP 10.1 a 10.4) ----------
  // Aba "Obras": abas de ano, tabela com situação, % concluído, início e previsão (10.1), filtros e
  // CSV/JSON. Aba "Obras paralisadas": motivo, responsável e previsão de reinício (10.4). Sem obras,
  // ou sem obras paralisadas, a página declara isso expressamente. Planilha (10.2/10.3) na página da obra.
  const SIT_OBRA = { nao_iniciada: ['Não iniciada', 'etiqueta-ambar'], em_andamento: ['Em andamento', 'etiqueta-ambar'], paralisada: ['Paralisada', 'etiqueta-vermelha'],
    concluida: ['Concluída', 'etiqueta-verde'], cancelada: ['Cancelada', 'etiqueta-vermelha'] };
  const CAMPOS_OBRA = 'id, contrato_id, titulo, descricao, local, unidade_nome, contratada_nome, contratada_doc, fonte_recurso, valor_contratado, situacao_obra, percentual, etapa_atual, data_inicio, previsao_conclusao, data_conclusao, ano, link_externo, atualizado_em';
  const COLUNAS_OBRA = [['titulo', 'Obra'], ['local', 'Local'], ['situacao_obra', 'Situação', (v) => SIT_OBRA[v] ? SIT_OBRA[v][0] : v], ['percentual', '% concluído'],
    ['etapa_atual', 'Etapa atual'], ['data_inicio', 'Início'], ['previsao_conclusao', 'Previsão de conclusão'], ['data_conclusao', 'Conclusão'],
    ['contratada_nome', 'Contratada'], ['contratada_doc', 'CNPJ/CPF', (v) => docCtr(v)], ['valor_contratado', 'Valor contratado'], ['fonte_recurso', 'Fonte do recurso'], ['unidade_nome', 'Unidade']];
  const pctBR = (v) => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%';
  const qtdBR = (v) => v === null || v === undefined ? '' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 4 });
  const barraObra = (v) => el('span', { class: 'barra-obra', role: 'img', 'aria-label': pctBR(v) + ' concluído' }, el('span', { style: 'width:' + Math.max(0, Math.min(100, Number(v || 0))) + '%' }));

  R.obras = async function (main, partes, params) {
    S.titulo('Obras'); S.trilha(['Transparência', '#/transparencia'], ['Obras']);
    let aba = partes[0] === 'paralisadas' ? 'paralisadas' : 'todas';
    const conteudo = el('div', { class: 'painel-guia', role: 'tabpanel' });
    const { lista } = faixaAbas([['todas', 'Obras'], ['paralisadas', 'Obras paralisadas']], aba, 'Obras', false, (id) => { aba = id; abrir(new URLSearchParams()); });
    pagina(main, el('h1', null, 'Obras'),
      el('p', { class: 'sub' }, 'Obras do órgão com a situação, o percentual concluído, as etapas, a planilha contratada e executada, os pagamentos e as paralisações.'),
      lista, conteudo);
    await abrir(params);

    async function abrir(prm) {
      conteudo.replaceChildren(el('p', { class: 'carregando' }, 'Carregando…'));
      return aba === 'paralisadas' ? S.decl.envolver(conteudo, 'obras_paralisadas', paralisadas) : todas(prm);
    }

    async function paralisadas() {
      history.replaceState(null, '', '#/obras/paralisadas');
      const { data, error } = await sb.from('obras_paralisacoes')
        .select('id, inicio, motivo, responsavel, previsao_reinicio, ato, arquivo_url, obras!inner(id, titulo, local, contratada_nome, percentual, situacao)')
        .eq('orgao_id', org()).is('reinicio', null).eq('obras.situacao', 'publicado').order('inicio').limit(500);
      if (error) { conteudo.replaceChildren(el('p', null, 'Não foi possível carregar. Tente novamente.')); return; }
      const ps = data || [];
      const hojeTxt = new Date().toLocaleDateString('pt-BR');
      if (!ps.length) {
        conteudo.replaceChildren(el('p', { class: 'vazio' }, 'Não há obras paralisadas neste órgão. Atualizado em ' + hojeTxt + '.'));
        return;
      }
      const COL = [['obra', 'Obra', (v, r) => r.obras.titulo], ['local', 'Local', (v, r) => r.obras.local || ''], ['inicio', 'Paralisada desde'], ['motivo', 'Motivo'],
        ['responsavel', 'Responsável pela inexecução'], ['previsao_reinicio', 'Previsão de reinício'], ['ato', 'Ato']];
      conteudo.replaceChildren(
        el('p', { class: 'meta' }, 'Obras com execução interrompida (Lei 14.133/2021, art. 115, § 6º). Atualizado em ' + hojeTxt + '.'),
        el('div', { class: 'barra-lista' }, el('span', { class: 'meta', role: 'status' }, ps.length + (ps.length === 1 ? ' obra paralisada' : ' obras paralisadas')),
          S.botoesExportar('obras-paralisadas', COL, async (de, ate) => ps.slice(de, ate + 1))),
        el('div', { class: 'tabela-rolagem' }, el('table', { class: 'tabela-dados tabela-lic' },
          el('caption', { class: 'sr' }, 'Obras paralisadas'),
          el('thead', null, el('tr', null, ['Obra', 'Paralisada desde', 'Motivo', 'Responsável pela inexecução', 'Previsão de reinício'].map((t) => el('th', { scope: 'col' }, t)))),
          el('tbody', null, ps.map((p) => el('tr', null,
            el('td', { 'data-rotulo': 'Obra' }, el('a', { href: '#/obra/' + p.obras.id }, el('strong', null, p.obras.titulo)), p.obras.local ? el('span', { class: 'meta' }, p.obras.local) : null,
              el('span', { class: 'meta' }, pctBR(p.obras.percentual) + ' concluído')),
            el('td', { 'data-rotulo': 'Paralisada desde', class: 'num' }, dataBR(p.inicio)),
            el('td', { 'data-rotulo': 'Motivo', class: 'lic-obj' }, p.motivo, p.ato ? el('span', { class: 'meta' }, p.ato) : null),
            el('td', { 'data-rotulo': 'Responsável pela inexecução' }, p.responsavel),
            el('td', { 'data-rotulo': 'Previsão de reinício', class: 'num' }, p.previsao_reinicio ? dataBR(p.previsao_reinicio) : 'Não informada')))))));
    }

    async function todas(prm) {
      const { data: anosDadosOb, error } = await sb.rpc('obras_anos', { p_orgao: org() });
      if (error) { conteudo.replaceChildren(el('p', null, 'Não foi possível carregar. Tente novamente.')); return; }
      const declOb = await S.decl.de('obras');
      if (S.decl.atual(declOb)) { history.replaceState(null, '', '#/obras'); conteudo.replaceChildren(S.decl.cartaoAtual(S.decl.atual(declOb))); return; }
      const anosOb = S.decl.mesclarAnos(anosDadosOb || [], declOb);
      if (!(anosOb || []).length) {
        history.replaceState(null, '', '#/obras');
        conteudo.replaceChildren(el('p', { class: 'vazio' }, 'Não há obras públicas executadas ou em execução por este órgão até esta data.'));
        return;
      }
      const contagem = new Map(anosOb.map((x) => [x.ano, x.total]));
      // "Todos os anos" primeiro: obra em andamento iniciada em ano anterior continua à vista.
      const anos = ['todos'].concat([...contagem.keys()].sort((a, b) => b - a));
      const pedido = prm.get('ano');
      let ano = pedido && anos.includes(Number(pedido)) ? Number(pedido) : 'todos';
      const painelAno = el('div', { class: 'painel-guia painel-guia-interno', role: 'tabpanel' });
      const totalGeral = [...contagem.values()].reduce((s, n) => s + Number(n), 0);
      const faixa = faixaAbas(anos.map((a) => [a, a === 'todos' ? 'Todas (' + totalGeral + ')' : Number(contagem.get(a)) ? a + ' (' + contagem.get(a) + ')' : String(a)]), ano, 'Ano de início', true,
        (id) => { ano = id === 'todos' ? 'todos' : Number(id); abrirAno(); });
      conteudo.replaceChildren(faixa.lista, painelAno);
      faixa.marcar(ano);
      abrirAno();

      function abrirAno() {
        history.replaceState(null, '', '#/obras' + (ano === 'todos' ? '' : '?ano=' + ano));
        const declAno = ano === 'todos' ? [] : S.decl.doAno(declOb, ano);
        if (ano !== 'todos' && !Number(contagem.get(ano))) { painelAno.replaceChildren(S.decl.quadro(declAno)); return; }
        const f = { busca: '', situacao: '' };
        const montar = (sel, op) => {
          let q = sb.from('obras').select(sel || CAMPOS_OBRA, op).eq('orgao_id', org());
          if (ano !== 'todos') q = q.eq('ano', ano);
          if (f.busca) q = q.ilike('busca', termo(f.busca));
          if (f.situacao) q = q.eq('situacao_obra', f.situacao);
          return q;
        };
        const corpoTab = el('tbody');
        const tabela = el('div', { class: 'tabela-rolagem' }, el('table', { class: 'tabela-dados tabela-lic' },
          el('caption', { class: 'sr' }, 'Obras' + (ano === 'todos' ? '' : ' iniciadas em ' + ano)),
          el('thead', null, el('tr', null, ['Obra', 'Situação', '% concluído', 'Início', 'Previsão / conclusão', 'Valor contratado'].map((t) => el('th', { scope: 'col' }, t)),
            el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Detalhes')))), corpoTab));
        const vazio = el('div'), mais = el('div', { class: 'mais' }), totalTxt = el('span', { class: 'meta', role: 'status' });
        let itens = [], versao = 0;
        const linha = (o) => {
          const s = SIT_OBRA[o.situacao_obra] || [o.situacao_obra, 'etiqueta-ambar'];
          return el('tr', null,
            el('td', { 'data-rotulo': 'Obra', class: 'lic-obj' }, el('a', { href: '#/obra/' + o.id }, el('strong', null, o.titulo)),
              o.local ? el('span', { class: 'meta' }, o.local) : null, o.contratada_nome ? el('span', { class: 'meta' }, o.contratada_nome) : null),
            el('td', { 'data-rotulo': 'Situação' }, el('span', { class: 'etiqueta ' + s[1] }, s[0]), o.etapa_atual ? el('span', { class: 'meta' }, o.etapa_atual) : null),
            el('td', { 'data-rotulo': '% concluído', class: 'num' }, pctBR(o.percentual), barraObra(o.percentual)),
            el('td', { 'data-rotulo': 'Início', class: 'num' }, o.data_inicio ? dataBR(o.data_inicio) : '—'),
            el('td', { 'data-rotulo': 'Previsão / conclusão', class: 'num' }, o.data_conclusao ? dataBR(o.data_conclusao) : o.previsao_conclusao ? dataBR(o.previsao_conclusao) : '—',
              el('span', { class: 'meta' }, o.data_conclusao ? 'concluída' : o.previsao_conclusao ? 'previsão' : '')),
            el('td', { 'data-rotulo': 'Valor contratado', class: 'num' }, o.valor_contratado != null ? moedaBR(o.valor_contratado) : '—'),
            el('td', { 'data-rotulo': '' }, el('a', { href: '#/obra/' + o.id, class: 'botao botao-claro botao-p' }, 'Detalhes', el('span', { class: 'sr' }, ' de ' + o.titulo))));
        };
        async function carregar(reiniciar) {
          const minha = reiniciar ? ++versao : versao;
          const [linhas, cont] = await Promise.all([
            paginar(montar, 'atualizado_em', reiniciar ? null : itens[itens.length - 1], 50),
            reiniciar ? montar('id', { count: 'exact', head: true }) : Promise.resolve(null)]);
          if (minha !== versao) return;
          if (cont) totalTxt.textContent = (cont.count || 0) + ((cont.count || 0) === 1 ? ' obra' : ' obras');
          itens = reiniciar ? linhas : itens.concat(linhas);
          tabela.hidden = !itens.length;
          vazio.replaceChildren(itens.length ? '' : el('p', { class: 'vazio' }, 'Nenhuma obra com esses filtros.'));
          if (reiniciar) corpoTab.replaceChildren(...linhas.map(linha)); else corpoTab.append(...linhas.map(linha));
          const btn = el('button', { type: 'button', class: 'botao botao-claro' }, 'Carregar mais');
          btn.addEventListener('click', async () => { btn.disabled = true; btn.textContent = 'Carregando…'; await carregar(false); });
          mais.replaceChildren(linhas.length === 50 ? btn : '');
        }
        const fBusca = el('input', { type: 'search', placeholder: 'Ex.: pavimentação, escola, nome da empresa' });
        const fSit = el('select', null, el('option', { value: '' }, 'Todas'), Object.entries(SIT_OBRA).map(([k, v]) => el('option', { value: k }, v[0])));
        let espera;
        const aplicar = () => { Object.assign(f, { busca: fBusca.value.trim(), situacao: fSit.value }); carregar(true); };
        fSit.addEventListener('change', aplicar);
        fBusca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(aplicar, 400); });
        const exportar = S.botoesExportar('obras' + (ano === 'todos' ? '' : '-' + ano), COLUNAS_OBRA, async (de, ate) => {
          const { data } = await montar().order('atualizado_em', { ascending: false }).order('id', { ascending: false }).range(de, ate);
          return data || [];
        });
        painelAno.replaceChildren(S.decl.quadro(declAno, 'Períodos sem ocorrência em ' + ano),
          el('form', { class: 'filtros', role: 'search', onsubmit: (e) => { e.preventDefault(); aplicar(); } },
            el('label', null, 'Pesquisar (obra, local ou empresa)', fBusca), el('label', null, 'Situação', fSit)),
          el('div', { class: 'barra-lista' }, totalTxt, exportar), tabela, vazio, mais);
        tabela.hidden = true;
        carregar(true).catch(() => vazio.replaceChildren(el('p', null, 'Não foi possível carregar. Tente novamente.')));
      }
    }
  };

  R.obra = async function (main, partes) {
    const id = partes[0];
    if (!/^[0-9a-f-]{36}$/i.test(id || '')) return R['*'](main);
    const [{ data: o }, { data: it }, { data: md }, { data: pa }] = await Promise.all([
      sb.from('obras').select(CAMPOS_OBRA).eq('orgao_id', org()).eq('id', id).maybeSingle(),
      sb.from('obras_itens').select('codigo, descricao, unidade, quantidade, preco_unitario, total_contratado, quantidade_executada, preco_praticado, total_executado').eq('obra_id', id).order('ordem').order('id').limit(2000),
      sb.from('obras_medicoes').select('numero, descricao, periodo_inicio, periodo_fim, valor_medido, valor_pago, data_pagamento, percentual_acumulado, arquivo_url, link_externo').eq('obra_id', id).order('numero').limit(500),
      sb.from('obras_paralisacoes').select('inicio, reinicio, motivo, responsavel, previsao_reinicio, ato, arquivo_url').eq('obra_id', id).order('inicio', { ascending: false }).limit(200)
    ]);
    if (!o) return R['*'](main);
    let ctr = null;
    if (o.contrato_id) { const r = await sb.from('contratos').select('id, tipo, numero').eq('id', o.contrato_id).maybeSingle(); ctr = r.data; }
    S.titulo(o.titulo); S.trilha(['Transparência', '#/transparencia'], ['Obras', '#/obras'], [o.titulo]);
    const s = SIT_OBRA[o.situacao_obra] || [o.situacao_obra, 'etiqueta-ambar'];
    const linha = (rot, val) => val || val === 0 ? el('div', null, el('dt', null, rot), el('dd', null, val)) : null;
    const itens = it || [], meds = md || [], pars = pa || [];
    const soma = (lst, k) => lst.reduce((t, x) => t + Number(x[k] || 0), 0);
    const aberta = pars.find((p) => !p.reinicio);
    const COL_ITENS = [['codigo', 'Item'], ['descricao', 'Descrição'], ['unidade', 'Unidade'], ['quantidade', 'Quantidade contratada'], ['preco_unitario', 'Preço unitário contratado'],
      ['total_contratado', 'Total contratado'], ['quantidade_executada', 'Quantidade executada'], ['preco_praticado', 'Preço praticado', (v, r) => v ?? r.preco_unitario], ['total_executado', 'Total executado']];
    pagina(main,
      el('p', { class: 'meta' }, 'Obras'),
      el('h1', null, o.titulo),
      el('p', null, el('span', { class: 'etiqueta ' + s[1] }, s[0]), ' ', el('span', { class: 'meta' }, pctBR(o.percentual) + ' concluído')),
      barraObra(o.percentual),
      aberta ? el('div', { class: 'cartao aviso-obra' }, el('h2', null, 'Obra paralisada desde ' + dataBR(aberta.inicio)),
        el('p', null, el('strong', null, 'Motivo: '), aberta.motivo), el('p', null, el('strong', null, 'Responsável pela inexecução: '), aberta.responsavel),
        el('p', null, el('strong', null, 'Previsão de reinício: '), aberta.previsao_reinicio ? dataBR(aberta.previsao_reinicio) : 'não informada')) : null,
      o.descricao ? el('section', { class: 'cartao' }, el('h2', null, 'Descrição'), el('p', { class: 'pre' }, o.descricao)) : null,
      el('dl', { class: 'ficha-lic' },
        linha('Local', o.local), linha('Unidade responsável', o.unidade_nome), linha('Etapa atual', o.etapa_atual),
        linha('Início', o.data_inicio ? dataBR(o.data_inicio) : 'Não iniciada'), linha('Previsão de conclusão', o.previsao_conclusao ? dataBR(o.previsao_conclusao) : null),
        linha('Conclusão', o.data_conclusao ? dataBR(o.data_conclusao) : null),
        linha('Empresa contratada', o.contratada_nome), linha('CNPJ / CPF', docCtr(o.contratada_doc)),
        linha('Contrato', ctr ? el('a', { href: '#/contrato/' + ctr.id }, 'Contrato' + (ctr.numero ? ' nº ' + ctr.numero : '') + ' (aditivos e fiscais)') : null),
        linha('Valor contratado', o.valor_contratado != null ? moedaBR(o.valor_contratado) : null), linha('Fonte do recurso', o.fonte_recurso),
        linha('Total medido', meds.length ? moedaBR(soma(meds, 'valor_medido')) : null), linha('Total pago', meds.length ? moedaBR(soma(meds, 'valor_pago')) : null)),
      o.link_externo ? el('p', { class: 'mt-2' }, el('a', { class: 'botao botao-claro', href: o.link_externo, target: '_blank', rel: 'noopener' }, 'Mais informações sobre a obra', el('span', { class: 'sr' }, ' (abre em nova aba)'))) : null,
      el('section', { class: 'mt-3' }, el('h2', null, 'Planilha: quantitativos contratados e executados'),
        itens.length ? [
          // Filtro da planilha (PNTP 10.2/10.3 exigem filtro): no próprio navegador, a planilha já veio inteira.
          el('form', { class: 'filtros', role: 'search', onsubmit: (e) => e.preventDefault() }, el('label', null, 'Pesquisar na planilha (item ou descrição)',
            el('input', { type: 'search', placeholder: 'Ex.: meio-fio, 2.1', oninput: (e) => {
              const t = normalizar(e.target.value.trim());
              let n = 0;
              for (const tr of e.target.closest('section').querySelectorAll('tbody tr')) { const ok = !t || normalizar(tr.textContent).includes(t); tr.hidden = !ok; if (ok) n++; }
              e.target.closest('section').querySelector('.qtd-itens').textContent = n + (n === 1 ? ' item' : ' itens');
            } }))),
          el('div', { class: 'barra-lista' }, el('span', { class: 'meta qtd-itens', role: 'status' }, itens.length + (itens.length === 1 ? ' item' : ' itens')), S.botoesExportar('obra-planilha', COL_ITENS, async (de, ate) => itens.slice(de, ate + 1))),
          el('div', { class: 'tabela-rolagem' }, el('table', { class: 'tabela-dados' },
            el('caption', { class: 'sr' }, 'Quantitativos e preços contratados e executados'),
            el('thead', null, el('tr', null, ['Item', 'Descrição', 'Un.', 'Qtd. contratada', 'Preço unit.', 'Total contratado', 'Qtd. executada', 'Preço praticado', 'Total executado'].map((t) => el('th', { scope: 'col' }, t)))),
            el('tbody', null, itens.map((i) => el('tr', null,
              el('td', { 'data-rotulo': 'Item' }, i.codigo || ''), el('td', { 'data-rotulo': 'Descrição' }, i.descricao), el('td', { 'data-rotulo': 'Unidade' }, i.unidade || ''),
              el('td', { 'data-rotulo': 'Qtd. contratada', class: 'num' }, qtdBR(i.quantidade)), el('td', { 'data-rotulo': 'Preço unitário', class: 'num' }, moedaBR(i.preco_unitario)),
              el('td', { 'data-rotulo': 'Total contratado', class: 'num' }, moedaBR(i.total_contratado)),
              el('td', { 'data-rotulo': 'Qtd. executada', class: 'num' }, qtdBR(i.quantidade_executada)),
              el('td', { 'data-rotulo': 'Preço praticado', class: 'num' }, moedaBR(i.preco_praticado ?? i.preco_unitario)),
              el('td', { 'data-rotulo': 'Total executado', class: 'num' }, moedaBR(i.total_executado))))),
            el('tfoot', null, el('tr', null, el('th', { scope: 'row', colspan: 5 }, 'Totais'), el('td', { class: 'num' }, el('strong', null, moedaBR(soma(itens, 'total_contratado')))),
              el('td', { colspan: 2 }), el('td', { class: 'num' }, el('strong', null, moedaBR(soma(itens, 'total_executado'))))))))]
          : el('p', { class: 'vazio' }, 'Planilha ainda não informada.')),
      el('section', { class: 'mt-3' }, el('h2', null, 'Etapas medidas e pagamentos'),
        meds.length ? el('div', { class: 'tabela-rolagem' }, el('table', { class: 'tabela-dados' },
          el('thead', null, el('tr', null, ['Medição', 'Período', 'Valor medido', 'Valor pago', '% acumulado', 'Boletim'].map((t) => el('th', { scope: 'col' }, t)))),
          el('tbody', null, meds.map((m) => el('tr', null,
            el('td', { 'data-rotulo': 'Medição' }, el('strong', null, m.numero + 'ª medição'), m.descricao ? el('span', { class: 'meta' }, m.descricao) : null),
            el('td', { 'data-rotulo': 'Período', class: 'num' }, m.periodo_inicio || m.periodo_fim ? (dataBR(m.periodo_inicio) || '…') + ' a ' + (dataBR(m.periodo_fim) || '…') : '—'),
            el('td', { 'data-rotulo': 'Valor medido', class: 'num' }, m.valor_medido != null ? moedaBR(m.valor_medido) : '—'),
            el('td', { 'data-rotulo': 'Valor pago', class: 'num' }, m.valor_pago != null ? moedaBR(m.valor_pago) : '—', m.data_pagamento ? el('span', { class: 'meta' }, 'em ' + dataBR(m.data_pagamento)) : null),
            el('td', { 'data-rotulo': '% acumulado', class: 'num' }, m.percentual_acumulado != null ? pctBR(m.percentual_acumulado) : '—'),
            el('td', { 'data-rotulo': 'Boletim' }, m.arquivo_url || m.link_externo ? el('a', { href: m.arquivo_url || m.link_externo, target: '_blank', rel: 'noopener' }, m.arquivo_url ? 'PDF' : 'Link', el('span', { class: 'sr' }, ' da ' + m.numero + 'ª medição (abre em nova aba)')) : '—'))))))
          : el('p', { class: 'vazio' }, 'Nenhuma medição registrada.')),
      el('section', { class: 'mt-3' }, el('h2', null, 'Paralisações'),
        pars.length ? el('div', { class: 'tabela-rolagem' }, el('table', { class: 'tabela-dados' },
          el('thead', null, el('tr', null, ['Período', 'Motivo', 'Responsável pela inexecução', 'Previsão de reinício'].map((t) => el('th', { scope: 'col' }, t)))),
          el('tbody', null, pars.map((p) => el('tr', null,
            el('td', { 'data-rotulo': 'Período', class: 'num' }, dataBR(p.inicio) + ' a ' + (p.reinicio ? dataBR(p.reinicio) : 'em aberto')),
            el('td', { 'data-rotulo': 'Motivo' }, p.motivo, p.ato ? el('span', { class: 'meta' }, p.ato) : null),
            el('td', { 'data-rotulo': 'Responsável pela inexecução' }, p.responsavel),
            el('td', { 'data-rotulo': 'Previsão de reinício', class: 'num' }, p.previsao_reinicio ? dataBR(p.previsao_reinicio) : '—'))))))
          : el('p', { class: 'vazio' }, 'Esta obra não teve paralisações.')),
      el('p', { class: 'mt-2 meta' }, 'Última atualização: ' + dataBR(o.atualizado_em)));
  };

  // Peças usadas também por setoriais.js (saúde, educação, renúncias, conselhos).
  S.util = { faixaAbas, listaAnual, selecao, moedaBR, termo, pagina, periodoBR };

  R['*'] = async function (main) {
    S.titulo('Página não encontrada'); S.trilha(['Página não encontrada']);
    pagina(main, el('h1', null, 'Página não encontrada'),
      el('p', null, 'O endereço pode ter mudado ou o conteúdo foi retirado do ar.'),
      el('p', null, el('a', { href: '#/' }, 'Voltar para o início'), ' · ', el('a', { href: '#/mapa-do-site' }, 'Mapa do site')));
  };
})();
