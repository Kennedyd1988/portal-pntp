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
      sb.from('noticias').select('id, titulo, resumo, capa_url, capa_legenda, categoria, publicado_em, destaque').eq('orgao_id', org())
        .lte('publicado_em', agora).order('publicado_em', { ascending: false }).limit(7),
      sb.from('publicacoes').select('id, tipo, numero, ano, data_publicacao, ementa').eq('orgao_id', org())
        .order('data_publicacao', { ascending: false }).limit(5),
      sb.from('gestores').select('*').eq('orgao_id', org()).eq('destaque_capa', true).order('ordem').limit(8),
      sb.from('servicos').select('id, nome, categoria, link_digital').eq('orgao_id', org())
        .in('forma_prestacao', ['digital', 'presencial_digital']).order('nome').limit(6)
    ]);
    const banners = bn.data || [], noticias = nt.data || [], pubs = pb.data || [], gestores = gs.data || [], digitais = sv.data || [];
    const destaque = noticias.find((n) => n.destaque) || noticias[0];
    const demais = noticias.filter((n) => n !== destaque).slice(0, 4);

    const blocos = [];
    if (banners.length) blocos.push(carrossel(banners));

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
        el('a', { class: 'cartao noticia-destaque', href: '#/noticia/' + destaque.id },
          destaque.capa_url ? el('img', { src: destaque.capa_url, alt: destaque.capa_legenda || '', style: 'width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:8px' })
            : el('span', { class: 'noticia-sem-foto', 'aria-hidden': 'true' }, 'Notícia'),
          el('div', null, el('span', { class: 'meta' }, (destaque.categoria ? destaque.categoria + ' · ' : '') + dataLonga(destaque.publicado_em)),
            el('h3', null, destaque.titulo), destaque.resumo ? el('p', null, destaque.resumo) : null)),
        demais.length ? el('div', { class: 'grade g4', style: 'margin-top:16px' }, demais.map((n) => cartaoNoticia(n))) : null)));
    }

    if (digitais.length) {
      blocos.push(el('section', { class: 'secao', 'aria-labelledby': 'tit-digitais' }, el('div', { class: 'limite' },
        el('div', { class: 'secao-titulo' }, el('h2', { id: 'tit-digitais' }, 'Serviços pela internet'), el('a', { href: '#/servicos' }, 'Carta de Serviços completa →')),
        el('div', { class: 'grade g3' }, digitais.map((s) => el('a', { class: 'cartao', href: '#/servico/' + s.id },
          el('strong', null, s.nome), el('span', { class: 'meta', style: 'display:block' }, (s.categoria ? s.categoria + ' · ' : '') + 'Pedido sem ir ao balcão')))))));
    }

    const colunas = [];
    if (pubs.length) colunas.push(el('div', null,
      el('div', { class: 'secao-titulo' }, el('h2', null, 'Publicações oficiais'), el('a', { href: '#/publicacoes' }, 'Ver todas →')),
      el('ul', { style: 'list-style:none;padding:0;margin:0' }, pubs.map((p) => el('li', { style: 'padding:10px 0;border-bottom:1px solid var(--linha)' },
        el('a', { href: '#/publicacoes?q=' + encodeURIComponent((p.numero || '') + ' ' + p.ano) }, el('strong', null, ato(p))),
        el('span', { class: 'meta', style: 'display:block' }, dataBR(p.data_publicacao) + ' · ' + p.ementa))))));
    if (gestores.length) {
      await S.carregarUnidades();
      colunas.push(el('div', null,
        el('div', { class: 'secao-titulo' }, el('h2', null, 'Gestão'), el('a', { href: '#/gestores' }, 'Todos os gestores →')),
        el('div', { class: 'grade g2' }, gestores.map(cartaoGestor))));
    }
    if (colunas.length) blocos.push(el('section', { class: 'secao' }, el('div', { class: 'limite grade ' + (colunas.length > 1 ? 'g2' : '') }, colunas)));

    const redes = S.redesDoOrgao(c);
    if (redes.length) blocos.push(el('section', { class: 'secao secao-cinza', 'aria-labelledby': 'tit-redes' }, el('div', { class: 'limite' },
      el('h2', { id: 'tit-redes' }, 'Redes sociais oficiais'),
      el('div', { class: 'faixa-botoes' }, redes.map((r) => S.linkRede(r, 'botao botao-claro botao-rede'))))));

    main.replaceChildren(...blocos);
  };

  // Carrossel acessível: pausa ao passar o mouse/focar, botão de pausa, sem rodar se o usuário pede menos movimento.
  function carrossel(lista) {
    let atual = 0, timer = null, pausado = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const slides = lista.map((b, k) => {
      const img = el('img', { src: b.imagem_url, alt: b.titulo, loading: k ? 'lazy' : 'eager' });
      return el('div', { class: 'banner-slide' + (k ? '' : ' ativo'), role: 'group', 'aria-roledescription': 'slide', 'aria-label': (k + 1) + ' de ' + lista.length },
        b.link_url ? el('a', { href: b.link_url }, img) : img);
    });
    const pontos = lista.map((b, k) => el('button', { type: 'button', 'aria-label': 'Banner ' + (k + 1), 'aria-current': k ? 'false' : 'true', onclick: () => ir(k) }));
    const btnPausa = el('button', { type: 'button', 'aria-label': 'Pausar a troca automática' }, '❚❚');
    function ir(k) {
      atual = (k + lista.length) % lista.length;
      slides.forEach((s, i) => s.classList.toggle('ativo', i === atual));
      pontos.forEach((p, i) => p.setAttribute('aria-current', i === atual ? 'true' : 'false'));
    }
    const iniciar = () => { clearInterval(timer); if (!pausado && lista.length > 1) timer = setInterval(() => ir(atual + 1), 7000); };
    btnPausa.addEventListener('click', () => {
      pausado = !pausado;
      btnPausa.textContent = pausado ? '▶' : '❚❚';
      btnPausa.setAttribute('aria-label', pausado ? 'Retomar a troca automática' : 'Pausar a troca automática');
      iniciar();
    });
    const caixa = el('section', { class: 'banner', 'aria-roledescription': 'carrossel', 'aria-label': 'Destaques' }, slides,
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
    const { data: outras } = await sb.from('noticias').select('id, titulo, resumo, capa_url, capa_legenda, categoria, publicado_em')
      .eq('orgao_id', org()).neq('id', n.id).order('publicado_em', { ascending: false }).limit(3);
    pagina(main, el('article', { class: 'artigo' },
      el('span', { class: 'meta' }, (n.categoria ? n.categoria + ' · ' : '') + 'Publicada em ' + dataLonga(n.publicado_em) +
        (n.atualizado_em && new Date(n.atualizado_em) - new Date(n.publicado_em) > 36e5 ? ' · atualizada em ' + dataBR(n.atualizado_em) : '')),
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
      outras && outras.length ? el('section', { style: 'margin-top:40px' }, el('h2', null, 'Outras notícias'), el('div', { class: 'grade g3' }, outras.map((x) => cartaoNoticia(x)))) : null);
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
      ['Portal da Transparência', '#/transparencia'], ['Licitações e contratos', '#/licitacoes'], ['Ouvidoria', '#/ouvidoria'], ['e-SIC', '#/esic'],
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
  R.transparencia = externo('transparencia', 'Portal da Transparência', 'Receitas, despesas, folha de pagamento, contratos, convênios, obras e prestação de contas.', 'transparencia_url');
  R.licitacoes = externo('licitacoes', 'Licitações e contratos', 'Editais, avisos, resultados, atas e contratos.', 'licitacoes_url');
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
    const [nt, pb, sv, pg, fq, un] = await Promise.all([
      sb.from('noticias').select('id, titulo, publicado_em').eq('orgao_id', org()).ilike('busca', n).order('publicado_em', { ascending: false }).limit(8),
      sb.from('publicacoes').select('id, tipo, numero, ano, ementa, arquivo_url, link_externo').eq('orgao_id', org()).ilike('busca', n).order('data_publicacao', { ascending: false }).limit(8),
      sb.from('servicos').select('id, nome').eq('orgao_id', org()).ilike('busca', n).order('nome').limit(8),
      sb.from('paginas').select('titulo, slug').eq('orgao_id', org()).or('titulo.ilike.' + cru + ',conteudo.ilike.' + cru).limit(8),
      sb.from('faq').select('pergunta').eq('orgao_id', org()).or('pergunta.ilike.' + cru + ',resposta.ilike.' + cru).limit(8),
      sb.from('unidades').select('id, nome').eq('orgao_id', org()).or('nome.ilike.' + cru + ',competencias.ilike.' + cru).limit(8)
    ]);
    const grupos = [
      ['Serviços', (sv.data || []).map((s) => [s.nome, '#/servico/' + s.id]), '#/servicos?q=' + encodeURIComponent(q)],
      ['Notícias', (nt.data || []).map((x) => [x.titulo + ' (' + dataBR(x.publicado_em) + ')', '#/noticia/' + x.id]), '#/noticias?q=' + encodeURIComponent(q)],
      ['Publicações oficiais', (pb.data || []).map((x) => [ato(x) + ' — ' + x.ementa, x.arquivo_url || x.link_externo || '#/publicacoes?q=' + encodeURIComponent(q)]), '#/publicacoes?q=' + encodeURIComponent(q)],
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
