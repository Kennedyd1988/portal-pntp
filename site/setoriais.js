// =====================================================================
// Site público — Saúde (PNTP 18.1 a 18.6), Educação e assistência social
// (19.1 a 19.4), Renúncias de receita (16.1 a 16.4) e Conselhos.
// Cada aba respeita a escolha do órgão no painel (Destinos das páginas e a
// declaração "não há dados"): dados do portal, botão para o sistema externo ou a declaração
// de que não há dados (com a data da informação).
// =====================================================================
(function () {
  'use strict';
  const S = window.SITE;
  const { sb, el, dataBR, normalizar } = S;
  const R = S.rotas;
  const U = S.util;
  const org = () => S.orgao.id;
  const moeda = (v) => v === null || v === undefined ? '—' : U.moedaBR(v);
  const numBR = (v) => v === null || v === undefined ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  const novaAba = el.bind(null, 'span', { class: 'sr' }, ' (abre em nova aba)');
  const linkDoc = (d, rot) => d.arquivo_url || d.link_externo
    ? el('a', { href: d.arquivo_url || d.link_externo, target: '_blank', rel: 'noopener' }, rot || (d.arquivo_url ? 'PDF' : 'Acessar'), novaAba()) : '—';

  // ---------- seções (secoes_setoriais) ----------
  let secoes = null;
  async function secao(chave) {
    if (!secoes || secoes.orgao !== org()) {
      const { data } = await sb.from('secoes_setoriais').select('secao, texto, sem_ocorrencia, atualizado_em').eq('orgao_id', org());
      secoes = { orgao: org(), mapa: Object.fromEntries((data || []).map((x) => [x.secao, x])) };
    }
    return secoes.mapa[chave] || {};
  }
  // Desenha a aba conforme a seção: link externo, declaração "não há" ou os dados.
  async function comSecao(caixa, chave, declaracao, desenhar) {
    const s = await secao(chave);
    // Link externo vem de Aparência › Destinos das páginas (lugar único), como no resto do site.
    const ext = window.externoPNTP(S.conf, chave);
    if (ext) {
      caixa.replaceChildren(S.caixaExterna(chave, { nivel: 'h3' }), s.texto ? el('p', { class: 'pre mt-2' }, s.texto) : '');
      return;
    }
    // Declarações de que não há dados (script 23): a da situação atual substitui a lista. As de
    // período ficam no período: nas listas por ano (listaAnual), na aba do ano; nas demais partes
    // (documentos, estoque, tabelas…), num quadro no alto.
    const decl = await S.decl.de(chave);
    const atual = S.decl.atual(decl);
    if (atual || (s.sem_ocorrencia && !decl.length)) {
      caixa.replaceChildren(atual ? S.decl.cartaoAtual(atual) : el('div', { class: 'cartao' }, el('p', null, el('strong', null, declaracao)),
        el('p', { class: 'meta' }, 'Declaração registrada em ' + dataBR(String(s.atualizado_em || '').slice(0, 10)) + '.')));
      return;
    }
    const r = await desenhar(caixa, s);
    const anual = caixa.dataset.declAnual || caixa.querySelector('[data-decl-anual]');
    const periodos = decl.filter((d) => d.abrangencia !== 'atual');
    if (!anual && periodos.length) caixa.prepend(S.decl.quadro(periodos, 'Períodos sem ocorrência'));
    return r;
  }

  // ---------- tabela e lista filtrada no navegador ----------
  function tabela(titulo, cabecalho, linhas, linha) {
    return el('div', { class: 'tabela-rolagem' }, el('table', { class: 'tabela-dados tabela-lic' },
      el('caption', { class: 'sr' }, titulo),
      el('thead', null, el('tr', null, cabecalho.map((t) => el('th', { scope: 'col' }, t)))),
      el('tbody', null, linhas.map(linha))));
  }
  const td = (rot, conteudo, cls) => el('td', { 'data-rotulo': rot, class: cls || null }, conteudo);
  // o = { titulo, dados, filtros: [[rótulo, elemento, (linha, valor) → bool]], cabecalho, linha, nome, colunas, unidade: [um, vários], vazio, antes }
  function listaLocal(caixa, o) {
    const corpo = el('div'), total = el('span', { class: 'meta', role: 'status' });
    const desenhar = () => {
      const vals = o.filtros.map(([, e]) => e.value.trim());
      const lista = o.dados.filter((d) => o.filtros.every(([, , teste], k) => !vals[k] || teste(d, vals[k])));
      total.textContent = lista.length + ' ' + (lista.length === 1 ? o.unidade[0] : o.unidade[1]);
      corpo.replaceChildren(lista.length ? tabela(o.titulo, o.cabecalho, lista, o.linha) : el('p', { class: 'vazio' }, o.dados.length ? 'Nenhum registro com esses filtros.' : o.vazio));
      ultima = lista;
    };
    let ultima = [], espera;
    for (const [, e] of o.filtros) e.addEventListener(e.tagName === 'SELECT' ? 'change' : 'input', () => { clearTimeout(espera); espera = setTimeout(desenhar, e.tagName === 'SELECT' ? 0 : 250); });
    caixa.replaceChildren(...[].concat(o.antes || []),
      o.filtros.length ? el('form', { class: 'filtros', role: 'search', onsubmit: (e) => { e.preventDefault(); desenhar(); } }, o.filtros.map(([rot, e]) => el('label', null, rot, e))) : '',
      el('div', { class: 'barra-lista' }, total, S.botoesExportar(o.nome, o.colunas, async (de) => de ? [] : ultima)), corpo);
    desenhar();
  }
  const busca = (ph) => el('input', { type: 'search', placeholder: ph });
  const contem = (...campos) => (d, v) => normalizar(campos.map((c) => d[c] || '').join(' ')).includes(normalizar(v));

  // ---------- página com abas (endereço #/rota/aba) ----------
  function paginaAbas(main, o, partes, params) {
    S.titulo(o.titulo); S.trilha(...(o.trilha || [['Transparência', '#/transparencia']]), [o.titulo]);
    let aba = o.abas.some((x) => x[0] === partes[0]) ? partes[0] : o.abas[0][0];
    const conteudo = el('div', { class: 'painel-guia', role: 'tabpanel' });
    const { lista } = U.faixaAbas(o.abas.map((x) => [x[0], x[1]]), aba, o.titulo, false, (id) => { aba = id; abrir(new URLSearchParams()); });
    const titulo = el('h2', { class: 'sr' });
    U.pagina(main, el('h1', null, o.titulo), el('p', { class: 'sub' }, o.sub), lista, conteudo);
    function abrir(prm) {
      const def = o.abas.find((x) => x[0] === aba);
      history.replaceState(null, '', '#/' + o.rota + '/' + aba + (prm && String(prm) ? '?' + prm : ''));
      titulo.textContent = def[1];
      const caixa = el('div', null, el('p', { class: 'carregando' }, 'Carregando…'));
      conteudo.replaceChildren(titulo, def[2] ? el('p', { class: 'mt-0 meta' }, def[2]) : '', caixa);
      return Promise.resolve(def[3](caixa, prm || new URLSearchParams())).catch(() => caixa.replaceChildren(el('p', null, 'Não foi possível carregar. Tente novamente.')));
    }
    return abrir(params);
  }

  // ---------- planos e relatórios (18.1, 19.1) ----------
  const DOC_TIPOS = { plano_saude: 'Plano Municipal de Saúde', programacao_anual: 'Programação Anual de Saúde', relatorio_gestao: 'Relatório Anual de Gestão',
    relatorio_quadrimestral: 'Relatório Detalhado do Quadrimestre (RDQA)', plano_educacao: 'Plano Municipal de Educação', relatorio_educacao: 'Relatório de monitoramento e resultados',
    plano_assistencia: 'Plano Municipal de Assistência Social', relatorio_assistencia: 'Relatório de gestão da assistência social', outro: 'Outro documento' };
  async function documentos(caixa, area, nome, vazio) {
    const { data } = await sb.from('documentos_setoriais').select('id, tipo, titulo, exercicio, exercicio_fim, periodo, data_publicacao, descricao, arquivo_url, link_externo, atualizado_em')
      .eq('orgao_id', org()).eq('area', area).order('exercicio', { ascending: false }).order('data_publicacao', { ascending: false, nullsFirst: false }).limit(500);
    const docs = data || [];
    const tipos = Object.fromEntries([...new Set(docs.map((d) => d.tipo))].map((t) => [t, DOC_TIPOS[t]]));
    const anos = [...new Set(docs.flatMap((d) => [d.exercicio]))].sort((a, b) => b - a);
    const fTipo = U.selecao(tipos), fAno = el('select', null, el('option', { value: '' }, 'Todos'), anos.map((a) => el('option', { value: a }, a)));
    const ex = (d) => d.exercicio + (d.exercicio_fim && d.exercicio_fim !== d.exercicio ? '–' + d.exercicio_fim : '');
    listaLocal(caixa, { titulo: 'Planos e relatórios', dados: docs, nome, unidade: ['documento', 'documentos'], vazio,
      filtros: [['Pesquisar', busca('Ex.: programação anual, relatório'), contem('titulo', 'descricao', 'periodo')], ['Tipo', fTipo, (d, v) => d.tipo === v],
        ['Exercício', fAno, (d, v) => Number(v) >= d.exercicio && Number(v) <= (d.exercicio_fim || d.exercicio)]],
      cabecalho: ['Documento', 'Tipo', 'Exercício', 'Publicação', 'Arquivo'],
      colunas: [['tipo', 'Tipo', (v) => DOC_TIPOS[v] || v], ['titulo', 'Título'], ['exercicio', 'Exercício'], ['exercicio_fim', 'Até'], ['periodo', 'Período'],
        ['data_publicacao', 'Publicação'], ['descricao', 'Observação'], ['arquivo_url', 'PDF'], ['link_externo', 'Link']],
      linha: (d) => el('tr', null, td('Documento', [el('strong', null, d.titulo), d.periodo ? el('span', { class: 'meta' }, d.periodo) : null, d.descricao ? el('span', { class: 'meta' }, d.descricao) : null], 'lic-obj'),
        td('Tipo', DOC_TIPOS[d.tipo]), td('Exercício', ex(d), 'num'), td('Publicação', dataBR(d.data_publicacao) || '—', 'num'), td('Arquivo', linkDoc(d, 'Abrir')))
    });
  }

  // ---------- conselhos ----------
  const TIPOS_CONSELHO = { saude: 'Conselho Municipal de Saúde', fundeb: 'Conselho do Fundeb', assistencia_social: 'Conselho Municipal de Assistência Social',
    educacao: 'Conselho Municipal de Educação', alimentacao_escolar: 'Conselho de Alimentação Escolar', crianca_adolescente: 'Conselho dos Direitos da Criança e do Adolescente', outro: 'Conselho' };
  const FUNCOES = { presidente: 'Presidente', vice_presidente: 'Vice-presidente', secretario: 'Secretário(a)', conselheiro: 'Conselheiro(a)' };
  const DOCS_CONSELHO = { ata: 'Ata', pauta: 'Pauta', resolucao: 'Resolução', calendario: 'Calendário', regimento: 'Regimento interno', parecer: 'Parecer', relatorio: 'Relatório', lei: 'Lei / decreto', outro: 'Documento' };
  const CAMPOS_CONSELHO = 'id, tipo, nome, sigla, norma_criacao, norma_url, regimento_url, competencias, periodicidade, local_reunioes, telefone, email, mandato_inicio, mandato_fim, atualizado_em';
  async function desenharConselho(caixa, c, comTitulo) {
    const [{ data: membros }, { data: docs }] = await Promise.all([
      sb.from('conselhos_membros').select('nome, funcao, condicao, segmento, entidade, mandato_inicio, mandato_fim, ato, ordem').eq('conselho_id', c.id).order('ordem').order('nome').limit(300),
      sb.from('conselhos_documentos').select('tipo, titulo, data, arquivo_url, link_externo').eq('conselho_id', c.id).order('data', { ascending: false }).limit(1000)]);
    const linha = (rot, val) => val ? el('div', null, el('dt', null, rot), el('dd', null, val)) : null;
    const ordemFuncao = ['presidente', 'vice_presidente', 'secretario', 'conselheiro'];
    const lista = (membros || []).sort((a, b) => ordemFuncao.indexOf(a.funcao) - ordemFuncao.indexOf(b.funcao) || (a.condicao === b.condicao ? 0 : a.condicao === 'titular' ? -1 : 1) || a.ordem - b.ordem);
    const docsCaixa = el('div');
    const anos = [...new Set((docs || []).map((d) => d.data.slice(0, 4)))];
    caixa.replaceChildren(
      comTitulo ? el('h2', null, c.nome + (c.sigla ? ' (' + c.sigla + ')' : '')) : '',
      c.competencias ? el('section', { class: 'cartao' }, el('h3', { class: 'mt-0' }, 'Competências e funcionamento'), el('p', { class: 'pre' }, c.competencias)) : '',
      el('dl', { class: 'ficha-lic' }, linha('Criação', c.norma_criacao ? (c.norma_url ? el('a', { href: c.norma_url, target: '_blank', rel: 'noopener' }, c.norma_criacao, novaAba()) : c.norma_criacao) : null),
        linha('Mandato atual', c.mandato_inicio || c.mandato_fim ? U.periodoBR(c.mandato_inicio, c.mandato_fim) : null), linha('Reuniões', c.periodicidade), linha('Local das reuniões', c.local_reunioes),
        linha('Telefone', c.telefone), linha('E-mail', c.email ? el('a', { href: 'mailto:' + c.email }, c.email) : null),
        linha('Regimento interno', c.regimento_url ? el('a', { href: c.regimento_url, target: '_blank', rel: 'noopener' }, 'Abrir', novaAba()) : null)),
      el('section', { class: 'mt-3' }, el('div', { class: 'secao-titulo' }, el('h3', { class: 'm-0' }, 'Composição'),
        S.botoesExportar('composicao-' + (c.sigla || c.tipo), [['nome', 'Nome'], ['funcao', 'Função', (v) => FUNCOES[v]], ['condicao', 'Titular/suplente'], ['segmento', 'Segmento'],
          ['entidade', 'Entidade'], ['mandato_inicio', 'Mandato: início'], ['mandato_fim', 'Mandato: fim'], ['ato', 'Ato de nomeação']], async (de) => de ? [] : lista)),
        lista.length ? tabela('Composição do conselho', ['Nome', 'Função', 'Representação', 'Mandato'], lista, (m) => el('tr', null,
          td('Nome', [el('strong', null, m.nome), el('span', { class: 'meta' }, m.condicao === 'suplente' ? 'Suplente' : 'Titular')]), td('Função', FUNCOES[m.funcao]),
          td('Representação', [m.segmento || '—', m.entidade ? el('span', { class: 'meta' }, m.entidade) : null]),
          td('Mandato', m.mandato_inicio || m.mandato_fim ? U.periodoBR(m.mandato_inicio, m.mandato_fim) : '—', 'num')))
          : el('p', { class: 'vazio' }, 'Composição não informada.')),
      el('section', { class: 'mt-3' }, el('h3', null, 'Atas, pautas e resoluções'), docsCaixa),
      el('p', { class: 'mt-2 meta' }, 'Informações atualizadas em ' + dataBR(c.atualizado_em) + '.'));
    const fTipo = U.selecao(Object.fromEntries([...new Set((docs || []).map((d) => d.tipo))].map((t) => [t, DOCS_CONSELHO[t]])));
    const fAno = el('select', null, el('option', { value: '' }, 'Todos'), anos.map((a) => el('option', { value: a }, a)));
    listaLocal(docsCaixa, { titulo: 'Documentos do conselho', dados: docs || [], nome: 'documentos-' + (c.sigla || c.tipo), unidade: ['documento', 'documentos'], vazio: 'Nenhum documento publicado.',
      filtros: [['Pesquisar', busca('Ex.: ata, resolução, 2026'), contem('titulo')], ['Tipo', fTipo, (d, v) => d.tipo === v], ['Ano', fAno, (d, v) => d.data.startsWith(v)]],
      cabecalho: ['Documento', 'Tipo', 'Data'], colunas: [['tipo', 'Tipo', (v) => DOCS_CONSELHO[v]], ['titulo', 'Título'], ['data', 'Data'], ['arquivo_url', 'PDF'], ['link_externo', 'Link']],
      linha: (d) => el('tr', null, td('Documento', linkDoc(d, d.titulo), 'lic-obj'), td('Tipo', DOCS_CONSELHO[d.tipo]), td('Data', dataBR(d.data), 'num')) });
  }
  // Aba de um conselho obrigatório (18.6, 19.3, 19.4): o conselho daquele tipo ou a falta dele.
  async function conselhoDoTipo(caixa, tipo, chave) {
    return comSecao(caixa, chave, 'Não há ' + TIPOS_CONSELHO[tipo] + ' instituído neste município.', async () => {
      const { data } = await sb.from('conselhos').select(CAMPOS_CONSELHO).eq('orgao_id', org()).eq('tipo', tipo).maybeSingle();
      if (!data) { caixa.replaceChildren(el('p', { class: 'vazio' }, 'Informações do ' + TIPOS_CONSELHO[tipo] + ' em atualização.')); return; }
      await desenharConselho(caixa, data, true);
    });
  }

  R.conselhos = async function (main) {
    S.titulo('Conselhos municipais'); S.trilha(['Transparência', '#/transparencia'], ['Conselhos municipais']);
    const { data } = await sb.from('conselhos').select('id, tipo, nome, sigla, mandato_inicio, mandato_fim, periodicidade').eq('orgao_id', org()).order('nome').limit(100);
    const lista = data || [];
    U.pagina(main, el('h1', null, 'Conselhos municipais'),
      el('p', { class: 'sub' }, 'Composição, funcionamento, atas, pautas e resoluções dos conselhos de políticas públicas.'),
      lista.length ? el('div', { class: 'grade g2' }, lista.map((c) => el('a', { class: 'cartao', href: '#/conselho/' + c.id },
        el('strong', { class: 'bloco' }, c.nome + (c.sigla ? ' (' + c.sigla + ')' : '')),
        el('span', { class: 'bloco meta' }, c.mandato_inicio || c.mandato_fim ? 'Mandato: ' + U.periodoBR(c.mandato_inicio, c.mandato_fim) : TIPOS_CONSELHO[c.tipo]),
        c.periodicidade ? el('span', { class: 'bloco meta' }, 'Reuniões: ' + c.periodicidade) : null)))
        : el('p', { class: 'vazio' }, 'Nenhum conselho publicado até esta data.'));
  };
  R.conselho = async function (main, partes) {
    const id = partes[0];
    if (!/^[0-9a-f-]{36}$/i.test(id || '')) return R['*'](main);
    const { data: c } = await sb.from('conselhos').select(CAMPOS_CONSELHO).eq('orgao_id', org()).eq('id', id).maybeSingle();
    if (!c) return R['*'](main);
    S.titulo(c.nome); S.trilha(['Transparência', '#/transparencia'], ['Conselhos municipais', '#/conselhos'], [c.sigla || c.nome]);
    const caixa = el('div');
    U.pagina(main, el('p', { class: 'meta' }, TIPOS_CONSELHO[c.tipo]), el('h1', null, c.nome + (c.sigla ? ' (' + c.sigla + ')' : '')), caixa);
    await desenharConselho(caixa, c, false);
  };

  // ===================================================================
  // SAÚDE (18.1 a 18.6)
  // ===================================================================
  const TIPOS_ESTAB = { ubs: 'Unidade Básica de Saúde', hospital: 'Hospital', upa: 'Pronto atendimento', caps: 'CAPS', policlinica: 'Policlínica',
    centro_especialidades: 'Centro de especialidades', laboratorio: 'Laboratório', farmacia: 'Farmácia', vigilancia: 'Vigilância em saúde',
    academia_saude: 'Academia da Saúde', samu: 'SAMU / transporte', outro: 'Outro' };
  const TIPOS_ESPERA = { consulta: 'Consulta', exame: 'Exame', cirurgia: 'Cirurgia', procedimento: 'Outro procedimento' };
  const PRIORIDADES = { emergencia: ['Emergência', 'etiqueta-vermelha'], urgencia: ['Urgência', 'etiqueta-vermelha'], prioritario: ['Prioritário', 'etiqueta-ambar'], eletivo: ['Eletivo', 'etiqueta-verde'] };
  const SIT_ESPERA = { aguardando: ['Aguardando', 'etiqueta-ambar'], agendado: ['Agendado', 'etiqueta-verde'], realizado: ['Realizado', 'etiqueta-verde'], cancelado: ['Cancelado', 'etiqueta-vermelha'] };
  const COMPONENTES = { basico: 'Básico', estrategico: 'Estratégico', especializado: 'Especializado (alto custo)', hospitalar: 'Hospitalar', municipal: 'Relação municipal' };
  const etq = (par) => el('span', { class: 'etiqueta ' + par[1] }, par[0]);

  async function servicosSaude(caixa) {
    const [{ data: est }, { data: prof }] = await Promise.all([
      sb.from('saude_estabelecimentos').select('id, nome, tipo, cnes, endereco, bairro, telefone, email, horario, especialidades, servicos, ordem, atualizado_em').eq('orgao_id', org()).order('ordem').order('nome').limit(300),
      sb.from('saude_profissionais').select('estabelecimento_id, nome, especialidade, registro, horario').eq('orgao_id', org()).order('especialidade').order('nome').limit(3000)]);
    const lista = est || [], profs = prof || [];
    const fBusca = busca('Ex.: pediatria, odontologia, bairro, nome do profissional'), fTipo = U.selecao(Object.fromEntries([...new Set(lista.map((e) => e.tipo))].map((t) => [t, TIPOS_ESTAB[t]])));
    const grade = el('div', { class: 'grade' }), total = el('p', { class: 'meta', role: 'status' });
    const desenhar = () => {
      const t = normalizar(fBusca.value.trim());
      const vis = lista.filter((e) => (!fTipo.value || e.tipo === fTipo.value) && (!t || normalizar([e.nome, e.bairro, e.especialidades, e.servicos].concat(profs.filter((p) => p.estabelecimento_id === e.id).flatMap((p) => [p.nome, p.especialidade])).join(' ')).includes(t)));
      total.textContent = vis.length + ' estabelecimento' + (vis.length === 1 ? '' : 's');
      grade.replaceChildren(...(vis.length ? vis.map((e) => {
        const ps = profs.filter((p) => p.estabelecimento_id === e.id);
        return el('section', { class: 'cartao' },
          el('h3', { class: 'mt-0' }, e.nome), el('p', { class: 'meta' }, TIPOS_ESTAB[e.tipo] + (e.cnes ? ' · CNES ' + e.cnes : '')),
          el('dl', { class: 'mt-1 ficha-lic' },
            el('div', null, el('dt', null, 'Endereço'), el('dd', null, [e.endereco, e.bairro].filter(Boolean).join(' — '))),
            el('div', null, el('dt', null, 'Atendimento'), el('dd', null, e.horario)),
            e.telefone ? el('div', null, el('dt', null, 'Telefone'), el('dd', null, e.telefone)) : null,
            e.especialidades ? el('div', null, el('dt', null, 'Especialidades'), el('dd', null, e.especialidades)) : null),
          e.servicos ? el('p', { class: 'pre' }, el('strong', null, 'Serviços: '), e.servicos) : null,
          ps.length ? el('details', { open: ps.length <= 8 ? true : null }, el('summary', { style: 'cursor:pointer;font-weight:600' }, 'Profissionais (' + ps.length + ')'),
            tabela('Profissionais de ' + e.nome, ['Profissional', 'Especialidade', 'Dias e horário'], ps, (p) => el('tr', null,
              td('Profissional', [p.nome, p.registro ? el('span', { class: 'meta' }, p.registro) : null]), td('Especialidade', p.especialidade), td('Dias e horário', p.horario || '—'))))
            : el('p', { class: 'meta' }, 'Profissionais não informados.'));
      }) : [el('p', { class: 'vazio' }, lista.length ? 'Nenhum estabelecimento com esses filtros.' : 'Informações em atualização.')]));
    };
    let espera;
    fBusca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(desenhar, 250); }); fTipo.addEventListener('change', desenhar);
    const nomeEst = (id) => (lista.find((e) => e.id === id) || {}).nome || '';
    caixa.replaceChildren(el('form', { class: 'filtros', role: 'search', onsubmit: (e) => { e.preventDefault(); desenhar(); } }, el('label', null, 'Pesquisar', fBusca), el('label', null, 'Tipo', fTipo)),
      el('div', { class: 'barra-lista' }, total, S.botoesExportar('saude-profissionais', [['estabelecimento_id', 'Estabelecimento', (v) => nomeEst(v)], ['nome', 'Profissional'],
        ['especialidade', 'Especialidade'], ['registro', 'Registro'], ['horario', 'Dias e horário']], async (de) => de ? [] : profs)), grade);
    desenhar();
  }

  async function esperaSaude(caixa, prm) {
    const f = { busca: prm.get('q') || '', tipo: prm.get('tipo') || '', prioridade: '', situacao_espera: 'aguardando' };
    const CAMPOS = 'id, protocolo, tipo, procedimento, especialidade, unidade_solicitante, data_solicitacao, prioridade, situacao_espera, data_agendamento, local_atendimento, posicao, atualizado_em';
    const montar = (sel, op) => {
      let q = sb.from('saude_lista_espera_posicoes').select(sel || CAMPOS, op).eq('orgao_id', org());
      if (f.busca) q = q.ilike('busca', U.termo(f.busca));
      for (const k of ['tipo', 'prioridade', 'situacao_espera']) if (f[k]) q = q.eq(k, f[k]);
      return q;
    };
    const { data: ult } = await sb.from('saude_lista_espera').select('atualizado_em').eq('orgao_id', org()).order('atualizado_em', { ascending: false }).limit(1);
    const corpo = el('tbody'), totalTxt = el('span', { class: 'meta', role: 'status' }), mais = el('div', { class: 'mais' }), vazio = el('div');
    const tab = el('div', { class: 'tabela-rolagem' }, el('table', { class: 'tabela-dados tabela-lic' }, el('caption', { class: 'sr' }, 'Lista de espera da regulação'),
      el('thead', null, el('tr', null, ['Posição', 'Protocolo', 'Procedimento', 'Solicitado em', 'Prioridade', 'Situação'].map((t) => el('th', { scope: 'col' }, t)))), corpo));
    const linha = (r) => el('tr', null, td('Posição', r.posicao ? r.posicao + 'º' : '—', 'num'), td('Protocolo', el('strong', null, r.protocolo)),
      td('Procedimento', [r.procedimento, el('span', { class: 'meta' }, TIPOS_ESPERA[r.tipo] + (r.especialidade ? ' · ' + r.especialidade : ''))], 'lic-obj'),
      td('Solicitado em', dataBR(r.data_solicitacao), 'num'), td('Prioridade', etq(PRIORIDADES[r.prioridade])),
      td('Situação', [etq(SIT_ESPERA[r.situacao_espera]), r.data_agendamento ? el('span', { class: 'meta' }, dataBR(r.data_agendamento) + (r.local_atendimento ? ' · ' + r.local_atendimento : '')) : null]));
    let itens = [], versao = 0;
    async function carregar(reiniciar) {
      const minha = reiniciar ? ++versao : versao;
      const ultimo = reiniciar ? null : itens[itens.length - 1];
      let q = montar().order('data_solicitacao').order('id').limit(100);
      if (ultimo) q = q.or('data_solicitacao.gt.' + ultimo.data_solicitacao + ',and(data_solicitacao.eq.' + ultimo.data_solicitacao + ',id.gt.' + ultimo.id + ')');
      const [{ data }, cont] = await Promise.all([q, reiniciar ? montar('id', { count: 'exact', head: true }) : Promise.resolve(null)]);
      if (minha !== versao) return;
      const linhas = data || [];
      if (cont) totalTxt.textContent = (cont.count || 0) + ' pedido' + (cont.count === 1 ? '' : 's');
      itens = reiniciar ? linhas : itens.concat(linhas);
      if (reiniciar) corpo.replaceChildren(...linhas.map(linha)); else corpo.append(...linhas.map(linha));
      tab.hidden = !itens.length;
      vazio.replaceChildren(itens.length ? '' : el('p', { class: 'vazio' }, 'Nenhum pedido com esses filtros.'));
      const btn = el('button', { type: 'button', class: 'botao botao-claro' }, 'Carregar mais');
      btn.addEventListener('click', async () => { btn.disabled = true; btn.textContent = 'Carregando…'; await carregar(false); });
      mais.replaceChildren(linhas.length === 100 ? btn : '');
    }
    const fBusca = busca('Protocolo, procedimento ou especialidade'); fBusca.value = f.busca;
    const fTipo = U.selecao(TIPOS_ESPERA), fPri = U.selecao(PRIORIDADES, 'Todas'), fSit = U.selecao(SIT_ESPERA, 'Todas');
    fTipo.value = f.tipo; fSit.value = 'aguardando';
    const aplicar = () => { Object.assign(f, { busca: fBusca.value.trim(), tipo: fTipo.value, prioridade: fPri.value, situacao_espera: fSit.value }); carregar(true); };
    let espera;
    fBusca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(aplicar, 400); });
    [fTipo, fPri, fSit].forEach((x) => x.addEventListener('change', aplicar));
    const exportar = S.botoesExportar('lista-de-espera-regulacao', [['posicao', 'Posição'], ['protocolo', 'Protocolo'], ['tipo', 'Tipo', (v) => TIPOS_ESPERA[v]], ['procedimento', 'Procedimento'],
      ['especialidade', 'Especialidade'], ['data_solicitacao', 'Solicitado em'], ['prioridade', 'Prioridade', (v) => PRIORIDADES[v][0]], ['situacao_espera', 'Situação', (v) => SIT_ESPERA[v][0]],
      ['data_agendamento', 'Data agendada'], ['local_atendimento', 'Local'], ['unidade_solicitante', 'Unidade solicitante']],
      async (de, ate) => { const { data } = await montar().order('data_solicitacao').order('id').range(de, ate); return data || []; });
    caixa.replaceChildren(
      el('p', { class: 'meta' }, (ult && ult[0] ? 'Lista atualizada em ' + dataBR(ult[0].atualizado_em) + '. ' : '') +
        'Os pacientes são identificados pelo número do protocolo (Lei Geral de Proteção de Dados). A posição é por procedimento: primeiro a prioridade clínica, depois a data da solicitação.'),
      el('form', { class: 'filtros', role: 'search', onsubmit: (e) => { e.preventDefault(); aplicar(); } },
        el('label', null, 'Pesquisar', fBusca), el('label', null, 'Tipo', fTipo), el('label', null, 'Prioridade', fPri), el('label', null, 'Situação', fSit)),
      el('div', { class: 'barra-lista' }, totalTxt, exportar), tab, vazio, mais);
    tab.hidden = true;
    await carregar(true);
  }

  async function medicamentosSaude(caixa, s) {
    const { data } = await sb.from('saude_medicamentos').select('nome, apresentacao, componente, onde_obter, como_obter').eq('orgao_id', org()).order('nome').limit(5000);
    const fComp = U.selecao(Object.fromEntries([...new Set((data || []).map((m) => m.componente))].map((c) => [c, COMPONENTES[c]])));
    listaLocal(caixa, { titulo: 'Medicamentos do SUS', dados: data || [], nome: 'medicamentos-sus', unidade: ['medicamento', 'medicamentos'], vazio: 'Relação de medicamentos em atualização.',
      antes: s.texto ? el('section', { class: 'mb-2 cartao' }, el('h3', { class: 'mt-0' }, 'Como obter os medicamentos'), el('p', { class: 'pre' }, s.texto)) : '',
      filtros: [['Pesquisar', busca('Nome do medicamento'), contem('nome', 'apresentacao')], ['Componente', fComp, (d, v) => d.componente === v]],
      cabecalho: ['Medicamento', 'Componente', 'Onde obter', 'Como obter'],
      colunas: [['nome', 'Medicamento'], ['apresentacao', 'Apresentação'], ['componente', 'Componente', (v) => COMPONENTES[v]], ['onde_obter', 'Onde obter'], ['como_obter', 'Como obter']],
      linha: (m) => el('tr', null, td('Medicamento', [el('strong', null, m.nome), m.apresentacao ? el('span', { class: 'meta' }, m.apresentacao) : null], 'lic-obj'),
        td('Componente', m.componente === 'especializado' ? etq([COMPONENTES[m.componente], 'etiqueta-ambar']) : COMPONENTES[m.componente]), td('Onde obter', m.onde_obter || '—'), td('Como obter', m.como_obter || '—')) });
  }

  async function estoqueSaude(caixa) {
    const { data } = await sb.from('saude_estoques').select('local, quantidade, unidade, posicao_em, saude_medicamentos(nome, apresentacao)').eq('orgao_id', org()).limit(10000);
    const lista = (data || []).map((e) => Object.assign({ nome: e.saude_medicamentos.nome, apresentacao: e.saude_medicamentos.apresentacao }, e))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || a.local.localeCompare(b.local, 'pt-BR'));
    const pos = lista.map((x) => x.posicao_em).sort();
    const fLocal = U.selecao(Object.fromEntries([...new Set(lista.map((e) => e.local))].sort().map((l) => [l, l])));
    const fSit = U.selecao({ disponivel: 'Disponível', zerado: 'Em falta' });
    listaLocal(caixa, { titulo: 'Estoque das farmácias', dados: lista, nome: 'estoque-farmacias', unidade: ['item', 'itens'], vazio: 'Estoque em atualização.',
      antes: pos.length ? el('p', { class: 'meta' }, 'Posição do estoque em ' + (pos[0] === pos[pos.length - 1] ? dataBR(pos[0]) : dataBR(pos[0]) + ' a ' + dataBR(pos[pos.length - 1])) + '.') : '',
      filtros: [['Pesquisar', busca('Nome do medicamento'), contem('nome', 'apresentacao')], ['Farmácia', fLocal, (d, v) => d.local === v],
        ['Disponibilidade', fSit, (d, v) => v === 'zerado' ? Number(d.quantidade) === 0 : Number(d.quantidade) > 0]],
      cabecalho: ['Medicamento', 'Farmácia', 'Quantidade', 'Posição em'],
      colunas: [['nome', 'Medicamento'], ['apresentacao', 'Apresentação'], ['local', 'Farmácia'], ['quantidade', 'Quantidade'], ['unidade', 'Unidade'], ['posicao_em', 'Posição em']],
      linha: (e) => el('tr', null, td('Medicamento', [el('strong', null, e.nome), e.apresentacao ? el('span', { class: 'meta' }, e.apresentacao) : null], 'lic-obj'), td('Farmácia', e.local),
        td('Quantidade', Number(e.quantidade) === 0 ? etq(['Em falta', 'etiqueta-vermelha']) : numBR(e.quantidade) + (e.unidade ? ' ' + e.unidade : ''), 'num'), td('Posição em', dataBR(e.posicao_em), 'num')) });
  }

  R.saude = function (main, partes, params) {
    return paginaAbas(main, { rota: 'saude', titulo: 'Saúde', sub: 'Planos e relatórios da saúde, onde e quando cada unidade atende, lista de espera da regulação, medicamentos do SUS, estoque das farmácias e Conselho Municipal de Saúde.',
      abas: [
        ['planos', 'Planos e relatórios', 'Plano Municipal de Saúde, Programação Anual de Saúde e Relatório Anual de Gestão.',
          (c) => comSecao(c, 'saude_documentos', '', () => documentos(c, 'saude', 'saude-planos-e-relatorios', 'Documentos em atualização.'))],
        ['servicos', 'Serviços e profissionais', 'Unidades de saúde com endereço, horários, especialidades e os profissionais que atendem.',
          (c) => comSecao(c, 'saude_servicos', '', () => servicosSaude(c))],
        ['lista-de-espera', 'Lista de espera', 'Pedidos de consultas, exames e cirurgias aguardando na regulação.',
          (c, prm) => comSecao(c, 'saude_espera', 'Não há pacientes aguardando consultas, exames ou cirurgias na regulação municipal.', () => esperaSaude(c, prm))],
        ['medicamentos', 'Medicamentos', 'Medicamentos fornecidos pelo SUS, inclusive os de alto custo, e como obtê-los.',
          (c) => comSecao(c, 'saude_medicamentos', '', (cx, s) => medicamentosSaude(c, s))],
        ['estoque', 'Estoque das farmácias', 'Quantidade disponível de cada medicamento nas farmácias públicas.',
          (c) => comSecao(c, 'saude_estoque', '', () => estoqueSaude(c))],
        ['conselho', 'Conselho de Saúde', 'Composição e funcionamento do Conselho Municipal de Saúde.', (c) => conselhoDoTipo(c, 'saude', 'saude_conselho')]
      ] }, partes, params);
  };

  // ===================================================================
  // EDUCAÇÃO E ASSISTÊNCIA SOCIAL (19.1 a 19.4)
  // ===================================================================
  const SIT_CRECHE = { aguardando: ['Aguardando', 'etiqueta-ambar'], convocado: ['Convocado', 'etiqueta-verde'], matriculado: ['Matriculado', 'etiqueta-verde'],
    desistente: ['Desistente', 'etiqueta-vermelha'], cancelado: ['Cancelado', 'etiqueta-vermelha'] };
  async function creches(caixa, s) {
    const { data } = await sb.from('creches_espera_posicoes').select('protocolo, crianca, turma, creche, data_inscricao, criterio, pontuacao, situacao_espera, posicao, atualizado_em')
      .eq('orgao_id', org()).order('creche').order('turma').order('posicao', { nullsFirst: false }).order('data_inscricao').limit(10000);
    const lista = data || [];
    const ult = lista.map((x) => x.atualizado_em).sort().pop();
    const fCreche = U.selecao(Object.fromEntries([...new Set(lista.map((x) => x.creche))].sort().map((x) => [x, x])), 'Todas');
    const fTurma = U.selecao(Object.fromEntries([...new Set(lista.map((x) => x.turma))].sort().map((x) => [x, x])), 'Todas');
    const fSit = U.selecao(SIT_CRECHE, 'Todas'); fSit.value = 'aguardando';
    listaLocal(caixa, { titulo: 'Lista de espera das creches', dados: lista, nome: 'lista-de-espera-creches', unidade: ['inscrição', 'inscrições'], vazio: 'Lista em atualização.',
      antes: [s.texto ? el('section', { class: 'mb-2 cartao' }, el('h3', { class: 'mt-0' }, 'Critérios de prioridade de acesso'), el('p', { class: 'pre' }, s.texto)) : '',
        el('p', { class: 'meta' }, (ult ? 'Lista atualizada em ' + dataBR(ult) + '. ' : '') + 'As crianças são identificadas pelo número da inscrição (ECA e LGPD). A posição é por creche e turma.')],
      filtros: [['Pesquisar', busca('Número da inscrição'), contem('protocolo', 'crianca')], ['Creche', fCreche, (d, v) => d.creche === v], ['Turma', fTurma, (d, v) => d.turma === v],
        ['Situação', fSit, (d, v) => d.situacao_espera === v]],
      cabecalho: ['Posição', 'Inscrição', 'Creche e turma', 'Inscrita em', 'Prioridade', 'Situação'],
      colunas: [['posicao', 'Posição'], ['protocolo', 'Inscrição'], ['crianca', 'Iniciais'], ['creche', 'Creche'], ['turma', 'Turma'], ['data_inscricao', 'Inscrição em'],
        ['criterio', 'Critério de prioridade'], ['pontuacao', 'Pontuação'], ['situacao_espera', 'Situação', (v) => SIT_CRECHE[v][0]]],
      linha: (r) => el('tr', null, td('Posição', r.posicao ? r.posicao + 'º' : '—', 'num'), td('Inscrição', [el('strong', null, r.protocolo), r.crianca ? el('span', { class: 'meta' }, r.crianca) : null]),
        td('Creche e turma', [r.creche, el('span', { class: 'meta' }, r.turma)], 'lic-obj'), td('Inscrita em', dataBR(r.data_inscricao), 'num'),
        td('Prioridade', [r.criterio || '—', r.pontuacao !== null ? el('span', { class: 'meta' }, numBR(r.pontuacao) + ' ponto(s)') : null]), td('Situação', etq(SIT_CRECHE[r.situacao_espera]))) });
  }
  async function outrosConselhos(caixa) {
    const { data } = await sb.from('conselhos').select('id, tipo, nome, sigla, mandato_inicio, mandato_fim').eq('orgao_id', org()).not('tipo', 'in', '(saude,fundeb,assistencia_social)').order('nome');
    caixa.replaceChildren((data || []).length ? el('ul', { class: 'partes-contas cartao' }, data.map((c) => el('li', null, el('a', { href: '#/conselho/' + c.id }, c.nome + (c.sigla ? ' (' + c.sigla + ')' : '')),
      el('span', { class: 'meta' }, c.mandato_inicio || c.mandato_fim ? 'Mandato: ' + U.periodoBR(c.mandato_inicio, c.mandato_fim) : TIPOS_CONSELHO[c.tipo]))))
      : el('p', { class: 'vazio' }, 'Nenhum outro conselho publicado.'), el('p', { class: 'mt-1' }, el('a', { href: '#/conselhos' }, 'Todos os conselhos municipais →')));
  }
  R.educacao = function (main, partes, params) {
    return paginaAbas(main, { rota: 'educacao', titulo: 'Educação e assistência social', sub: 'Plano Municipal de Educação e resultados, lista de espera das creches com os critérios de prioridade, Conselho do Fundeb, Conselho de Assistência Social e demais conselhos.',
      abas: [
        ['plano', 'Plano e resultados', 'Plano Municipal de Educação e o relatório de resultados (monitoramento das metas).',
          (c) => comSecao(c, 'educacao_documentos', '', () => documentos(c, 'educacao', 'educacao-plano-e-resultados', 'Documentos em atualização.'))],
        ['creches', 'Creches: lista de espera', 'Crianças aguardando vaga e os critérios de prioridade de acesso.',
          (c) => comSecao(c, 'educacao_creches', 'Não há crianças aguardando vaga em creche da rede municipal.', (cx, s) => creches(c, s))],
        ['fundeb', 'Conselho do Fundeb', 'Composição e funcionamento do Conselho de Acompanhamento e Controle Social do Fundeb.', (c) => conselhoDoTipo(c, 'fundeb', 'educacao_fundeb')],
        ['assistencia-social', 'Assistência social', 'Composição e funcionamento do Conselho Municipal de Assistência Social, planos e relatórios.', async (c) => {
          const cons = el('div'), docs = el('div');
          c.replaceChildren(cons, el('h2', { class: 'mt-4' }, 'Planos e relatórios da assistência social'), docs);
          await Promise.all([conselhoDoTipo(cons, 'assistencia_social', 'educacao_assistencia'), documentos(docs, 'assistencia_social', 'assistencia-social-planos', 'Nenhum plano ou relatório publicado.')]);
        }],
        ['conselhos', 'Outros conselhos', 'Conselhos de Educação, Alimentação Escolar, Criança e Adolescente e outros.', (c) => S.decl.envolver(c, 'educacao_conselhos', () => outrosConselhos(c))]
      ] }, partes, params);
  };

  // ===================================================================
  // RENÚNCIAS DE RECEITA (16.1 a 16.4)
  // ===================================================================
  const ESPECIES = { isencao: 'Isenção', anistia: 'Anistia', remissao: 'Remissão', credito_presumido: 'Crédito presumido', reducao_aliquota: 'Redução de alíquota',
    reducao_base: 'Redução de base de cálculo', subsidio: 'Subsídio', outro: 'Outro benefício' };
  const TRIBUTOS = { iptu: 'IPTU', iss: 'ISS', itbi: 'ITBI', taxas: 'Taxas', contribuicao_melhoria: 'Contribuição de melhoria', cosip: 'COSIP', divida_ativa: 'Dívida ativa', outro: 'Outro' };
  const AND_INC = { aprovado: ['Aprovado', 'etiqueta-ambar'], em_execucao: ['Em execução', 'etiqueta-ambar'], concluido: ['Concluído', 'etiqueta-verde'], cancelado: ['Cancelado', 'etiqueta-vermelha'] };
  const anosRpc = (tabela, area) => async () => { const { data, error } = await sb.rpc('anos_setoriais', { p_orgao: org(), p_tabela: tabela, p_area: area || null }); return error ? null : data || []; };

  async function desoneracoes(caixa) {
    const { data } = await sb.from('renuncias').select('id, especie, tributo, titulo, descricao, fundamento_legal, norma_url, requisitos, procedimento, setor, vigencia_inicio, vigencia_fim, atualizado_em')
      .eq('orgao_id', org()).order('tributo').order('titulo').limit(500);
    const lista = data || [];
    const fTrib = U.selecao(Object.fromEntries([...new Set(lista.map((r) => r.tributo))].map((t) => [t, TRIBUTOS[t]]))), fEsp = U.selecao(Object.fromEntries([...new Set(lista.map((r) => r.especie))].map((t) => [t, ESPECIES[t]])));
    listaLocal(caixa, { titulo: 'Desonerações tributárias', dados: lista, nome: 'renuncias-desoneracoes', unidade: ['benefício', 'benefícios'], vazio: 'Informações em atualização.',
      filtros: [['Pesquisar', busca('Ex.: IPTU, aposentado, lei'), contem('titulo', 'descricao', 'fundamento_legal', 'setor')], ['Tributo', fTrib, (d, v) => d.tributo === v], ['Espécie', fEsp, (d, v) => d.especie === v]],
      cabecalho: ['Benefício', 'Fundamento legal', 'Quem tem direito e como pedir', 'Vigência'],
      colunas: [['tributo', 'Tributo', (v) => TRIBUTOS[v]], ['especie', 'Espécie', (v) => ESPECIES[v]], ['titulo', 'Benefício'], ['descricao', 'Descrição'], ['fundamento_legal', 'Fundamento legal'],
        ['norma_url', 'Link da lei'], ['requisitos', 'Requisitos'], ['procedimento', 'Como pedir'], ['setor', 'Setor beneficiado'], ['vigencia_inicio', 'Vigente desde'], ['vigencia_fim', 'Vigente até']],
      linha: (r) => el('tr', null,
        td('Benefício', [el('strong', null, r.titulo), el('span', { class: 'meta' }, ESPECIES[r.especie] + ' · ' + TRIBUTOS[r.tributo] + (r.setor ? ' · ' + r.setor : '')), r.descricao ? el('span', { class: 'meta' }, r.descricao) : null], 'lic-obj'),
        td('Fundamento legal', r.norma_url ? el('a', { href: r.norma_url, target: '_blank', rel: 'noopener' }, r.fundamento_legal, novaAba()) : r.fundamento_legal),
        td('Quem tem direito e como pedir', [r.requisitos ? el('span', { style: 'display:block;white-space:pre-line' }, el('strong', null, 'Requisitos: '), r.requisitos) : null,
          r.procedimento ? el('span', { class: 'bloco pre mt-05' }, el('strong', null, 'Como pedir: '), r.procedimento) : null, !r.requisitos && !r.procedimento ? '—' : null]),
        td('Vigência', r.vigencia_inicio || r.vigencia_fim ? U.periodoBR(r.vigencia_inicio, r.vigencia_fim) : 'Por prazo indeterminado', 'num')) });
  }

  function valoresRenuncia(caixa, prm) {
    return U.listaAnual(caixa, prm, {
      base: '#/renuncias/valores', declaracao: 'renuncias_valores', titulo: 'Renúncia prevista e realizada', rotuloAno: 'Exercício', nome: 'renuncias-previsto-realizado', unidade: ['benefício', 'benefícios'],
      vazio: 'Valores em atualização.', anos: anosRpc('renuncias_valores'),
      montar: (sel, op, ano) => {
        let q = sb.from('renuncias_valores').select(sel || 'id, exercicio, valor_previsto, valor_realizado, fonte_previsao, compensacao, atualizado_em, renuncias(titulo, especie, tributo)', op).eq('orgao_id', org());
        return ano !== 'todos' ? q.eq('exercicio', ano) : q;
      },
      resumo: (ano) => {
        const caixaT = el('div', { class: 'grade', style: 'margin-bottom:16px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr))' });
        let q = sb.from('renuncias_valores').select('valor_previsto, valor_realizado').eq('orgao_id', org()).limit(5000);
        if (ano !== 'todos') q = q.eq('exercicio', ano);
        q.then(({ data }) => {
          const s = (k) => (data || []).reduce((t, r) => t + Number(r[k] || 0), 0);
          caixaT.replaceChildren(...[['Previsto', 'valor_previsto'], ['Realizado', 'valor_realizado']].map(([r, k]) => el('div', { class: 'cartao' },
            el('span', { class: 'meta' }, r + (ano === 'todos' ? ' (todos os exercícios)' : ' em ' + ano)), el('strong', { class: 'bloco maior' }, U.moedaBR(s(k))))));
        });
        return caixaT;
      },
      filtros: () => [],
      cabecalho: ['Benefício', 'Exercício', 'Previsto', 'Realizado', 'Medidas de compensação'],
      colunas: [['renuncias', 'Benefício', (v) => v ? v.titulo : ''], ['renuncias', 'Espécie', (v) => v ? ESPECIES[v.especie] : ''], ['renuncias', 'Tributo', (v) => v ? TRIBUTOS[v.tributo] : ''],
        ['exercicio', 'Exercício'], ['valor_previsto', 'Previsto'], ['valor_realizado', 'Realizado'], ['fonte_previsao', 'Fonte da previsão'], ['compensacao', 'Medidas de compensação']],
      linha: (v) => el('tr', null, td('Benefício', [el('strong', null, (v.renuncias || {}).titulo || '—'), v.renuncias ? el('span', { class: 'meta' }, ESPECIES[v.renuncias.especie] + ' · ' + TRIBUTOS[v.renuncias.tributo]) : null], 'lic-obj'),
        td('Exercício', String(v.exercicio), 'num'), td('Previsto', [moeda(v.valor_previsto), v.fonte_previsao ? el('span', { class: 'meta' }, v.fonte_previsao) : null], 'num'),
        td('Realizado', moeda(v.valor_realizado), 'num'), td('Medidas de compensação', v.compensacao || '—'), el('td', { 'data-rotulo': '' }))
    });
  }

  async function beneficiariosRenuncia(caixa, prm) {
    const { data: rens } = await sb.from('renuncias').select('id, titulo').eq('orgao_id', org()).order('titulo').limit(500);
    const opRen = Object.fromEntries((rens || []).map((r) => [r.id, r.titulo]));
    return U.listaAnual(caixa, prm, {
      base: '#/renuncias/beneficiarios', declaracao: 'renuncias_beneficiarios', titulo: 'Beneficiários de renúncias', rotuloAno: 'Exercício', nome: 'renuncias-beneficiarios', unidade: ['beneficiário', 'beneficiários'],
      vazio: 'Não há beneficiários de renúncia de receita publicados até esta data.', anos: anosRpc('renuncias_beneficiarios'),
      montar: (sel, op, ano, f) => {
        let q = sb.from('renuncias_beneficiarios').select(sel || 'id, renuncia_id, exercicio, nome, documento_publico, setor, produto, valor, atualizado_em', op).eq('orgao_id', org());
        if (ano !== 'todos') q = q.eq('exercicio', ano);
        if (f.busca) q = q.ilike('busca', /^[\d./-]+$/.test(f.busca) ? '%' + f.busca.replace(/\D/g, '') + '%' : U.termo(f.busca));
        if (f.renuncia_id) q = q.eq('renuncia_id', f.renuncia_id);
        return q;
      },
      filtros: () => [['busca', 'Pesquisar (nome, CNPJ, setor)', busca('Ex.: nome da empresa, 11.222.333/0001-81')], ['renuncia_id', 'Benefício', U.selecao(opRen)]],
      cabecalho: ['Beneficiário', 'Benefício', 'Setor e produto', 'Exercício', 'Valor'],
      colunas: [['nome', 'Beneficiário'], ['documento_publico', 'CNPJ/CPF'], ['renuncia_id', 'Benefício', (v) => opRen[v] || ''], ['setor', 'Setor'], ['produto', 'Produto'], ['exercicio', 'Exercício'], ['valor', 'Valor']],
      linha: (b) => el('tr', null, td('Beneficiário', [el('strong', null, b.nome), b.documento_publico ? el('span', { class: 'meta' }, b.documento_publico) : null], 'lic-obj'),
        td('Benefício', opRen[b.renuncia_id] || '—'), td('Setor e produto', [b.setor || '—', b.produto ? el('span', { class: 'meta' }, b.produto) : null]),
        td('Exercício', String(b.exercicio), 'num'), td('Valor', moeda(b.valor), 'num'), el('td', { 'data-rotulo': '' }))
    });
  }

  function incentivosRenuncia(caixa, prm) {
    return U.listaAnual(caixa, prm, {
      base: '#/renuncias/incentivos', declaracao: 'renuncias_incentivos', titulo: 'Projetos de incentivo à cultura e ao esporte', rotuloAno: 'Exercício', nome: 'incentivos-cultura-esporte', unidade: ['projeto', 'projetos'],
      vazio: 'Não há projetos de incentivo à cultura ou ao esporte aprovados por este órgão até esta data.', anos: anosRpc('incentivos_projetos'),
      montar: (sel, op, ano, f) => {
        let q = sb.from('incentivos_projetos').select(sel || 'id, exercicio, area, projeto, proponente, documento_publico, valor_aprovado, valor_liberado, lei_incentivo, andamento, arquivo_url, link_externo, atualizado_em', op).eq('orgao_id', org());
        if (ano !== 'todos') q = q.eq('exercicio', ano);
        if (f.busca) q = q.ilike('busca', U.termo(f.busca));
        if (f.area) q = q.eq('area', f.area);
        if (f.andamento) q = q.eq('andamento', f.andamento);
        return q;
      },
      filtros: () => [['busca', 'Pesquisar (projeto, proponente)', busca('Ex.: festival, associação')], ['area', 'Área', U.selecao({ cultura: 'Cultura', esporte: 'Esporte' }, 'Todas')], ['andamento', 'Andamento', U.selecao(AND_INC)]],
      cabecalho: ['Projeto', 'Proponente', 'Aprovado', 'Liberado', 'Andamento'],
      colunas: [['area', 'Área'], ['exercicio', 'Exercício'], ['projeto', 'Projeto'], ['proponente', 'Proponente'], ['documento_publico', 'CNPJ/CPF'], ['valor_aprovado', 'Valor aprovado'],
        ['valor_liberado', 'Valor liberado'], ['lei_incentivo', 'Lei / edital'], ['andamento', 'Andamento', (v) => AND_INC[v][0]], ['arquivo_url', 'Ato (PDF)'], ['link_externo', 'Link']],
      linha: (i) => el('tr', null, td('Projeto', [el('strong', null, i.projeto), el('span', { class: 'meta' }, (i.area === 'esporte' ? 'Esporte' : 'Cultura') + ' · ' + i.exercicio + (i.lei_incentivo ? ' · ' + i.lei_incentivo : '')),
          i.arquivo_url || i.link_externo ? el('span', { class: 'meta' }, linkDoc(i, 'Ato de aprovação')) : null], 'lic-obj'),
        td('Proponente', [i.proponente, i.documento_publico ? el('span', { class: 'meta' }, i.documento_publico) : null]), td('Aprovado', moeda(i.valor_aprovado), 'num'),
        td('Liberado', moeda(i.valor_liberado), 'num'), td('Andamento', etq(AND_INC[i.andamento])), el('td', { 'data-rotulo': '' }))
    });
  }

  // Peças usadas também pelas páginas de receitas, despesas, pessoal e diárias (financeiro.js).
  S.setor = { comSecao, paginaAbas, listaLocal, tabela, td, busca, contem, linkDoc, etq, novaAba };

  R.renuncias = function (main, partes, params) {
    return paginaAbas(main, { rota: 'renuncias', titulo: 'Renúncias de receita', sub: 'Benefícios fiscais concedidos pelo município (isenções, anistias, remissões e outros), com o fundamento legal, os valores previstos e realizados, os beneficiários e os projetos de incentivo à cultura e ao esporte.',
      abas: [
        ['desoneracoes', 'Desonerações', 'Espécies de benefícios concedidos, fundamento legal, requisitos e como pedir.',
          (c) => comSecao(c, 'renuncias_desoneracoes', 'O município não concede desonerações tributárias (isenções, anistias, remissões ou outros benefícios fiscais).', () => desoneracoes(c))],
        ['valores', 'Previsto × realizado', 'Valor da renúncia prevista (LDO/LOA) e efetivamente realizada, por benefício e exercício.',
          (c, prm) => comSecao(c, 'renuncias_valores', 'Não há renúncia de receita prevista ou realizada.', () => valoresRenuncia(c, prm))],
        ['beneficiarios', 'Beneficiários', 'Quem recebeu cada benefício. CPF de pessoa física aparece mascarado (LGPD).',
          (c, prm) => comSecao(c, 'renuncias_beneficiarios', 'Não há beneficiários de renúncia de receita no exercício.', () => beneficiariosRenuncia(c, prm))],
        ['incentivos', 'Cultura e esporte', 'Projetos aprovados por leis de incentivo à cultura e ao esporte, com o beneficiário e o valor aprovado.',
          (c, prm) => comSecao(c, 'renuncias_incentivos', 'Não há projetos de incentivo à cultura ou ao esporte aprovados por este órgão.', () => incentivosRenuncia(c, prm))]
      ] }, partes, params);
  };
})();
