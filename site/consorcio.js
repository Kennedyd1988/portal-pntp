// =====================================================================
// Site público — Consórcio público (Portal PNTP · SOFT+)
// Matriz específica dos Consórcios Públicos do PNTP 2026 (script 39):
//   #/entes, #/ente/:id ............ 25.7 entes consorciados (e os contratos de cada um)
//   #/documentos-consorcio ......... 25.1 protocolo de intenções, contrato de consórcio, 25.2 estatuto e alterações
//   #/rateio ....................... 25.3 contratos de rateio (por exercício e por ente)
//   #/programa ..................... 25.4 contratos de programa
//   #/dirigentes-atas .............. 25.5 ata de eleição dos dirigentes, 25.6 atas da assembleia geral
//   #/orcamento-consorcio .......... 11.11 orçamento (receita estimada e despesa fixada)
// =====================================================================
(function () {
  'use strict';
  const S = window.SITE;
  const { sb, el, dataBR } = S;
  const R = S.rotas;
  const U = S.util;
  const org = () => S.orgao.id;
  const pagina = U.pagina;
  const so = (main, chave) => { if (S.orgao.tipo !== 'consorcio' || (chave && S.oculta(chave))) { R['*'](main); return false; } return true; };
  const TIPOS = { protocolo_intencoes: 'Protocolo de intenções', contrato_consorcio: 'Contrato de consórcio público', estatuto: 'Estatuto',
    alteracao_estatutaria: 'Alteração estatutária', contrato_rateio: 'Contrato de rateio', contrato_programa: 'Contrato de programa',
    ata_eleicao: 'Ata de eleição dos dirigentes', ata_assembleia: 'Ata da assembleia geral', orcamento: 'Orçamento', outros: 'Outro documento' };
  const CONSTITUTIVOS = ['protocolo_intencoes', 'contrato_consorcio', 'estatuto', 'alteracao_estatutaria', 'outros'];
  const TIPOS_ENTE = { municipio: 'Município', estado: 'Estado', uniao: 'União', outro: 'Outro ente' };
  const SIT_ENTE = { ativo: ['Ativo', 'etiqueta-verde'], retirado: ['Retirado', 'etiqueta-ambar'], excluido: ['Excluído', 'etiqueta-vermelha'] };
  const CAMPOS = 'id, tipo, titulo, numero, exercicio, data, ente_id, valor, vigencia_inicio, vigencia_fim, descricao, arquivo_url, link_externo, ano, atualizado_em, consorcio_entes(id, nome, uf)';
  const novaAba = () => el('span', { class: 'sr' }, ' (abre em nova aba)');
  const linkExt = (href, rotulo, cls) => el('a', { href, target: '_blank', rel: 'noopener', class: cls || null }, rotulo, novaAba());
  const arquivo = (d) => d.arquivo_url || d.link_externo ? linkExt(d.arquivo_url || d.link_externo, d.arquivo_url ? 'PDF' : 'Abrir', 'botao botao-claro botao-p') : '—';
  const periodo = (a, b) => a || b ? (dataBR(a) || '…') + ' a ' + (dataBR(b) || '…') : '—';
  const cnpjBR = (v) => /^\d{14}$/.test(v || '') ? v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : v || '';
  const nomeEnte = (d) => d.consorcio_entes ? d.consorcio_entes.nome + ' / ' + d.consorcio_entes.uf : '';
  const linkEnte = (d) => d.consorcio_entes ? el('a', { href: '#/ente/' + d.consorcio_entes.id }, nomeEnte(d)) : '—';
  const etiqueta = (par) => el('span', { class: 'etiqueta ' + par[1] }, par[0]);
  const trilha = (...x) => S.trilha(['O Consórcio', '#/entes'], ...x);
  const anosDe = (qual) => async () => { const { data, error } = await sb.rpc('consorcio_anos', { p_orgao: org(), p_qual: qual }); return error ? null : data || []; };
  // Colunas da exportação (CSV, JSON, XML, XLSX, PDF e imprimir).
  const COLS = {
    tipo: ['tipo', 'Tipo', (v) => TIPOS[v] || v], titulo: ['titulo', 'Título'], numero: ['numero', 'Número'], exercicio: ['exercicio', 'Exercício'],
    data: ['data', 'Data'], ente: ['ente_id', 'Ente consorciado', (v, r) => nomeEnte(r)], valor: ['valor', 'Valor (R$)'],
    vi: ['vigencia_inicio', 'Início da vigência'], vf: ['vigencia_fim', 'Fim da vigência'], desc: ['descricao', 'Observação'], arq: ['arquivo_url', 'Arquivo', (v, r) => v || r.link_externo || '']
  };
  let cacheEntes = null;
  async function entes() {
    if (!cacheEntes || cacheEntes.org !== org()) {
      const { data } = await sb.from('consorcio_entes').select('id, nome, tipo_ente, uf, cnpj, lei_ratificacao, lei_ratificacao_url, data_ingresso, data_saida, situacao_ente, ordem')
        .eq('orgao_id', org()).order('ordem').order('nome');
      cacheEntes = { org: org(), lista: data || [] };
    }
    return cacheEntes.lista;
  }
  const opEntes = async () => Object.fromEntries((await entes()).map((e) => [e.id, e.nome + ' / ' + e.uf]));

  // ---------- 25.7 Entes consorciados ----------
  R.entes = async function (main) {
    if (!so(main, 'consorcio_entes')) return;
    S.titulo('Entes consorciados'); trilha(['Entes consorciados']);
    const lista = await entes();
    const ativos = lista.filter((e) => e.situacao_ente === 'ativo'), saidos = lista.filter((e) => e.situacao_ente !== 'ativo');
    const colunas = [['nome', 'Ente'], ['tipo_ente', 'Tipo', (v) => TIPOS_ENTE[v] || v], ['uf', 'UF'], ['cnpj', 'CNPJ', (v) => cnpjBR(v)], ['lei_ratificacao', 'Lei de ratificação'],
      ['lei_ratificacao_url', 'Link da lei'], ['data_ingresso', 'Ingresso'], ['data_saida', 'Saída'], ['situacao_ente', 'Situação', (v) => SIT_ENTE[v] ? SIT_ENTE[v][0] : v]];
    const tabela = (itens, cap) => el('div', { class: 'tabela-rolagem' }, el('table', { class: 'tabela-dados' }, el('caption', { class: 'sr' }, cap),
      el('thead', null, el('tr', null, ['Ente', 'CNPJ', 'Lei de ratificação', 'No consórcio', 'Situação', ''].map((t) => el('th', { scope: 'col' }, t)))),
      el('tbody', null, itens.map((e) => el('tr', null,
        el('td', { 'data-rotulo': 'Ente', class: 'lic-obj' }, el('a', { href: '#/ente/' + e.id }, el('strong', null, e.nome)), el('span', { class: 'meta' }, (TIPOS_ENTE[e.tipo_ente] || '') + ' · ' + e.uf)),
        el('td', { 'data-rotulo': 'CNPJ', class: 'num' }, cnpjBR(e.cnpj) || '—'),
        el('td', { 'data-rotulo': 'Lei de ratificação' }, e.lei_ratificacao_url ? linkExt(e.lei_ratificacao_url, e.lei_ratificacao || 'Lei') : e.lei_ratificacao || '—'),
        el('td', { 'data-rotulo': 'No consórcio', class: 'num' }, (e.data_ingresso ? 'desde ' + dataBR(e.data_ingresso) : '—') + (e.data_saida ? ' · saiu em ' + dataBR(e.data_saida) : '')),
        el('td', { 'data-rotulo': 'Situação' }, etiqueta(SIT_ENTE[e.situacao_ente] || [e.situacao_ente, 'etiqueta-ambar'])),
        el('td', { 'data-rotulo': '' }, el('a', { href: '#/ente/' + e.id, class: 'botao botao-claro botao-p' }, 'Contratos', el('span', { class: 'sr' }, ' de ' + e.nome))))))));
    pagina(main, el('h1', null, 'Entes consorciados'),
      el('p', { class: 'sub' }, 'Municípios e demais entes que integram o consórcio, com a lei que ratificou o protocolo de intenções. Em cada ente, os contratos de rateio e de programa dele.'),
      el('div', { class: 'barra-lista' }, el('span', { class: 'meta' }, ativos.length + ' ente(s) na composição atual · atualizado em ' + new Date().toLocaleDateString('pt-BR')),
        S.botoesExportar('entes-consorciados', colunas, async (de) => de ? [] : lista)),
      ativos.length ? tabela(ativos, 'Composição atual do consórcio') : el('p', { class: 'vazio' }, 'Composição em atualização.'),
      saidos.length ? el('section', { class: 'mt-3' }, el('h2', null, 'Entes que saíram do consórcio'), tabela(saidos, 'Entes que saíram do consórcio')) : null,
      el('p', { class: 'mt-2' }, S.linkDestino('consorcio_rateio', 'Contratos de rateio →'), ' · ', S.linkDestino('consorcio_programa', 'Contratos de programa →'), ' · ',
        S.linkDestino('consorcio_documentos', 'Documentos constitutivos →')));
  };

  R.ente = async function (main, partes) {
    if (!so(main, 'consorcio_entes')) return;
    const id = partes[0];
    const e = (await entes()).find((x) => x.id === id);
    if (!e) return R['*'](main);
    const { data } = await sb.from('consorcio_documentos').select(CAMPOS).eq('orgao_id', org()).eq('ente_id', id).order('ano', { ascending: false }).order('data', { ascending: false }).limit(500);
    const docs = data || [];
    const rateio = docs.filter((d) => d.tipo === 'contrato_rateio'), programa = docs.filter((d) => d.tipo === 'contrato_programa'), outros = docs.filter((d) => !['contrato_rateio', 'contrato_programa'].includes(d.tipo));
    S.titulo(e.nome); trilha(['Entes consorciados', '#/entes'], [e.nome]);
    const linha = (rot, val) => val ? el('div', null, el('dt', null, rot), el('dd', null, val)) : null;
    const tab = (itens, cab, cels, nome) => itens.length ? el('div', null,
      el('div', { class: 'barra-lista' }, el('span', { class: 'meta' }, itens.length + ' documento(s)'),
        S.botoesExportar(nome, [COLS.tipo, COLS.exercicio, COLS.numero, COLS.titulo, COLS.data, COLS.valor, COLS.vi, COLS.vf, COLS.arq], async (de) => de ? [] : itens)),
      el('div', { class: 'tabela-rolagem' }, el('table', { class: 'tabela-dados' }, el('thead', null, el('tr', null, cab.map((t) => el('th', { scope: 'col' }, t)))),
        el('tbody', null, itens.map((d) => el('tr', null, cels(d)))))))
      : el('p', { class: 'vazio' }, 'Nenhum documento publicado.');
    pagina(main, el('p', { class: 'meta' }, 'Ente consorciado · ' + (TIPOS_ENTE[e.tipo_ente] || '')), el('h1', null, e.nome),
      el('p', null, etiqueta(SIT_ENTE[e.situacao_ente] || [e.situacao_ente, 'etiqueta-ambar'])),
      el('dl', { class: 'ficha-lic' }, linha('UF', e.uf), linha('CNPJ', cnpjBR(e.cnpj)),
        linha('Lei de ratificação', e.lei_ratificacao_url ? linkExt(e.lei_ratificacao_url, e.lei_ratificacao || 'abrir') : e.lei_ratificacao),
        linha('Ingresso no consórcio', dataBR(e.data_ingresso)), linha('Saída', dataBR(e.data_saida))),
      el('section', { class: 'mt-3' }, el('h2', null, 'Contratos de rateio'),
        tab(rateio, ['Exercício', 'Contrato', 'Valor', 'Vigência', 'Arquivo'], (d) => [el('td', { 'data-rotulo': 'Exercício', class: 'num' }, String(d.exercicio)),
          el('td', { 'data-rotulo': 'Contrato', class: 'lic-obj' }, el('strong', null, d.titulo), d.numero ? el('span', { class: 'meta' }, 'nº ' + d.numero) : null),
          el('td', { 'data-rotulo': 'Valor', class: 'num' }, d.valor != null ? U.moedaBR(d.valor) : '—'), el('td', { 'data-rotulo': 'Vigência', class: 'num' }, periodo(d.vigencia_inicio, d.vigencia_fim)),
          el('td', { 'data-rotulo': 'Arquivo' }, arquivo(d))], 'rateio-' + e.nome)),
      el('section', { class: 'mt-3' }, el('h2', null, 'Contratos de programa'),
        tab(programa, ['Contrato', 'Vigência', 'Valor', 'Arquivo'], (d) => [el('td', { 'data-rotulo': 'Contrato', class: 'lic-obj' }, el('strong', null, d.titulo), d.descricao ? el('span', { class: 'meta' }, d.descricao) : null),
          el('td', { 'data-rotulo': 'Vigência', class: 'num' }, periodo(d.vigencia_inicio, d.vigencia_fim)), el('td', { 'data-rotulo': 'Valor', class: 'num' }, d.valor != null ? U.moedaBR(d.valor) : '—'),
          el('td', { 'data-rotulo': 'Arquivo' }, arquivo(d))], 'programa-' + e.nome)),
      outros.length ? el('section', { class: 'mt-3' }, el('h2', null, 'Outros documentos'),
        tab(outros, ['Documento', 'Data', 'Arquivo'], (d) => [el('td', { 'data-rotulo': 'Documento', class: 'lic-obj' }, el('strong', null, d.titulo), el('span', { class: 'meta' }, TIPOS[d.tipo])),
          el('td', { 'data-rotulo': 'Data', class: 'num' }, dataBR(d.data)), el('td', { 'data-rotulo': 'Arquivo' }, arquivo(d))], 'documentos-' + e.nome)) : null,
      el('p', { class: 'mt-2' }, el('a', { href: '#/entes' }, '← Todos os entes consorciados')));
  };

  // ---------- 25.1 e 25.2 Documentos constitutivos ----------
  R['documentos-consorcio'] = async function (main) {
    if (!so(main)) return;
    S.titulo('Documentos constitutivos'); trilha(['Documentos constitutivos']);
    const { data } = await sb.from('consorcio_documentos').select(CAMPOS).eq('orgao_id', org()).in('tipo', CONSTITUTIVOS).order('data', { ascending: false }).limit(500);
    const docs = data || [];
    let tipo = 'todos';
    const caixa = el('div');
    const abas = [['todos', 'Todos (' + docs.length + ')']].concat(CONSTITUTIVOS.filter((t) => docs.some((d) => d.tipo === t)).map((t) => [t, TIPOS[t] + ' (' + docs.filter((d) => d.tipo === t).length + ')']));
    const faixa = U.faixaAbas(abas, tipo, 'Tipo de documento', true, (id) => { tipo = id; desenhar(); });
    const estatuto = docs.find((d) => d.tipo === 'estatuto');
    pagina(main, el('h1', null, 'Documentos constitutivos'),
      el('p', { class: 'sub' }, 'Protocolo de intenções, contrato de consórcio público, estatuto vigente e as alterações aprovadas pela assembleia geral (Lei 11.107/2005).'),
      estatuto ? el('section', { class: 'cartao destaque-acao mb-2' }, el('h2', { class: 'mt-0' }, 'Estatuto vigente'), el('p', null, estatuto.titulo + ' · ' + dataBR(estatuto.data)), arquivo(estatuto)) : null,
      docs.length ? [faixa.lista, el('div', { class: 'painel-guia painel-guia-interno', role: 'tabpanel' }, caixa)] : el('p', { class: 'vazio' }, 'Documentos em atualização.'));
    function desenhar() {
      const itens = tipo === 'todos' ? docs : docs.filter((d) => d.tipo === tipo);
      caixa.replaceChildren(el('div', { class: 'barra-lista' }, el('span', { class: 'meta' }, itens.length + ' documento(s)'),
        S.botoesExportar('documentos-constitutivos', [COLS.tipo, COLS.titulo, COLS.numero, COLS.data, COLS.desc, COLS.arq], async (de) => de ? [] : itens)),
        el('div', { class: 'tabela-rolagem' }, el('table', { class: 'tabela-dados' }, el('caption', { class: 'sr' }, 'Documentos constitutivos'),
          el('thead', null, el('tr', null, ['Documento', 'Tipo', 'Data', 'Arquivo'].map((t) => el('th', { scope: 'col' }, t)))),
          el('tbody', null, itens.map((d) => el('tr', null,
            el('td', { 'data-rotulo': 'Documento', class: 'lic-obj' }, el('strong', null, d.titulo + (d.numero ? ' nº ' + d.numero : '')), d.descricao ? el('span', { class: 'meta' }, d.descricao) : null),
            el('td', { 'data-rotulo': 'Tipo' }, TIPOS[d.tipo]), el('td', { 'data-rotulo': 'Data', class: 'num' }, dataBR(d.data)), el('td', { 'data-rotulo': 'Arquivo' }, arquivo(d))))))));
    }
    if (docs.length) { faixa.marcar(tipo); desenhar(); }
  };

  // Lista anual dos documentos de um tipo (rateio, programa, atas, orçamento).
  function listaDocs(conteudo, params, o) {
    return U.listaAnual(conteudo, params, {
      base: o.base, titulo: o.titulo, rotuloAno: o.rotuloAno || 'Ano', nome: o.nome, unidade: o.unidade, ordem: 'data', declaracao: o.declaracao, abrirRecente: true,
      vazio: o.vazio + ' Atualizado em ' + new Date().toLocaleDateString('pt-BR') + '.',
      anos: anosDe(o.qual),
      montar: (sel, op, ano, f) => {
        let q = sb.from('consorcio_documentos').select(sel || CAMPOS, op).eq('orgao_id', org()).in('tipo', o.tipos);
        if (ano !== 'todos') q = q.eq(o.colunaAno || 'ano', ano);
        if (f.busca) q = q.ilike('busca', U.termo(f.busca));
        if (f.ente) q = q.eq('ente_id', f.ente);
        if (f.tipo) q = q.eq('tipo', f.tipo);
        return q;
      },
      filtros: o.filtros, cabecalho: o.cabecalho, colunas: o.colunas, linha: o.linha, resumo: o.resumo
    });
  }

  // ---------- 25.3 Contratos de rateio ----------
  R.rateio = async function (main, partes, params) {
    if (!so(main)) return;
    S.titulo('Contratos de rateio'); trilha(['Contratos de rateio']);
    const opE = await opEntes();
    const conteudo = el('div', { class: 'painel-guia', role: 'tabpanel' }, el('p', { class: 'carregando' }, 'Carregando…'));
    pagina(main, el('h1', null, 'Contratos de rateio'),
      el('p', { class: 'sub' }, 'Contrato firmado a cada exercício com cada ente consorciado, com o valor que ele repassa ao consórcio (Lei 11.107/2005, art. 8º). As cotas recebidas mês a mês estão em Receitas.'),
      el('p', null, S.linkDestino('consorcio_programa', 'Contratos de programa →'), ' · ', S.linkDestino('consorcio_entes', 'Entes consorciados →'), ' · ', S.linkDestino('receitas', 'Receitas (cotas recebidas) →')),
      conteudo);
    return listaDocs(conteudo, params, {
      base: '#/rateio', titulo: 'Contratos de rateio', rotuloAno: 'Exercício', nome: 'contratos-de-rateio', unidade: ['contrato', 'contratos'], qual: 'rateio', tipos: ['contrato_rateio'],
      colunaAno: 'exercicio', declaracao: 'consorcio_rateio', vazio: 'Não há contratos de rateio publicados.',
      filtros: () => [['ente', 'Ente consorciado', U.selecao(opE, 'Todos os entes')], ['busca', 'Pesquisar', el('input', { type: 'search', placeholder: 'Número, título' })]],
      cabecalho: ['Ente', 'Exercício', 'Contrato', 'Valor', 'Vigência', 'Arquivo'],
      colunas: [COLS.exercicio, COLS.ente, COLS.numero, COLS.titulo, COLS.data, COLS.valor, COLS.vi, COLS.vf, COLS.arq],
      linha: (d) => el('tr', null,
        el('td', { 'data-rotulo': 'Ente', class: 'lic-obj' }, linkEnte(d)),
        el('td', { 'data-rotulo': 'Exercício', class: 'num' }, String(d.exercicio)),
        el('td', { 'data-rotulo': 'Contrato' }, d.numero ? 'nº ' + d.numero : d.titulo, el('span', { class: 'meta' }, 'Assinado em ' + dataBR(d.data))),
        el('td', { 'data-rotulo': 'Valor', class: 'num' }, d.valor != null ? U.moedaBR(d.valor) : '—'),
        el('td', { 'data-rotulo': 'Vigência', class: 'num' }, periodo(d.vigencia_inicio, d.vigencia_fim)),
        el('td', { 'data-rotulo': 'Arquivo' }, arquivo(d)))
    });
  };

  // ---------- 25.4 Contratos de programa ----------
  R.programa = async function (main, partes, params) {
    if (!so(main)) return;
    S.titulo('Contratos de programa'); trilha(['Contratos de programa']);
    const opE = await opEntes();
    const conteudo = el('div', { class: 'painel-guia', role: 'tabpanel' }, el('p', { class: 'carregando' }, 'Carregando…'));
    pagina(main, el('h1', null, 'Contratos de programa'),
      el('p', { class: 'sub' }, 'Contratos firmados com os entes consorciados para a prestação de serviços públicos pelo consórcio (Lei 11.107/2005, art. 13).'),
      el('p', null, S.linkDestino('consorcio_rateio', 'Contratos de rateio →'), ' · ', S.linkDestino('consorcio_entes', 'Entes consorciados →')), conteudo);
    return listaDocs(conteudo, params, {
      base: '#/programa', titulo: 'Contratos de programa', nome: 'contratos-de-programa', unidade: ['contrato', 'contratos'], qual: 'programa', tipos: ['contrato_programa'],
      declaracao: 'consorcio_programa', vazio: 'Não há contratos de programa publicados.',
      filtros: () => [['ente', 'Ente consorciado', U.selecao(opE, 'Todos os entes')], ['busca', 'Pesquisar', el('input', { type: 'search', placeholder: 'Objeto, número' })]],
      cabecalho: ['Contrato', 'Ente', 'Vigência', 'Valor', 'Arquivo'],
      colunas: [COLS.numero, COLS.titulo, COLS.ente, COLS.data, COLS.vi, COLS.vf, COLS.valor, COLS.desc, COLS.arq],
      linha: (d) => el('tr', null,
        el('td', { 'data-rotulo': 'Contrato', class: 'lic-obj' }, el('strong', null, d.titulo + (d.numero ? ' (nº ' + d.numero + ')' : '')), d.descricao ? el('span', { class: 'meta' }, d.descricao) : null),
        el('td', { 'data-rotulo': 'Ente' }, linkEnte(d)),
        el('td', { 'data-rotulo': 'Vigência', class: 'num' }, periodo(d.vigencia_inicio, d.vigencia_fim)),
        el('td', { 'data-rotulo': 'Valor', class: 'num' }, d.valor != null ? U.moedaBR(d.valor) : '—'),
        el('td', { 'data-rotulo': 'Arquivo' }, arquivo(d)))
    });
  };

  // ---------- 25.5 e 25.6 Dirigentes e atas ----------
  R['dirigentes-atas'] = async function (main, partes, params) {
    if (!so(main)) return;
    S.titulo('Dirigentes e assembleia geral'); trilha(['Dirigentes e assembleia geral']);
    const [{ data: eleicao }, { data: gest }] = await Promise.all([
      sb.from('consorcio_documentos').select(CAMPOS).eq('orgao_id', org()).eq('tipo', 'ata_eleicao').order('data', { ascending: false }).limit(1),
      sb.from('gestores').select('nome, cargo').eq('orgao_id', org()).eq('ativo', true).order('ordem').limit(30)]);
    const el0 = (eleicao || [])[0];
    const conteudo = el('div', { class: 'painel-guia', role: 'tabpanel' }, el('p', { class: 'carregando' }, 'Carregando…'));
    pagina(main, el('h1', null, 'Dirigentes e assembleia geral'),
      el('p', { class: 'sub' }, 'Os atuais dirigentes do consórcio, a ata da eleição deles e as atas das reuniões da assembleia geral.'),
      el('div', { class: 'grade g2 mb-2' },
        el('section', { class: 'cartao' }, el('h2', { class: 'mt-0' }, 'Dirigentes atuais'),
          (gest || []).length ? el('ul', null, gest.map((g) => el('li', null, el('strong', null, g.nome), ' — ' + g.cargo))) : el('p', { class: 'vazio' }, 'Em atualização.'),
          el('p', null, el('a', { href: '#/gestores' }, 'Gestores e responsáveis →'), ' · ', el('a', { href: '#/estrutura' }, 'Estrutura organizacional →'))),
        el('section', { class: 'cartao' }, el('h2', { class: 'mt-0' }, 'Ata de eleição dos atuais dirigentes'),
          el0 ? [el('p', null, el0.titulo + ' · ' + dataBR(el0.data)), arquivo(el0)] : el('p', { class: 'vazio' }, 'Em atualização.'))),
      el('h2', null, 'Atas'), conteudo);
    return listaDocs(conteudo, params, {
      base: '#/dirigentes-atas', titulo: 'Atas da assembleia geral', nome: 'atas-assembleia', unidade: ['ata', 'atas'], qual: 'atas', tipos: ['ata_eleicao', 'ata_assembleia'],
      declaracao: 'consorcio_atas', vazio: 'Não há atas publicadas.',
      filtros: () => [['tipo', 'Tipo', U.selecao({ ata_assembleia: 'Atas da assembleia geral', ata_eleicao: 'Atas de eleição' }, 'Todas')], ['busca', 'Pesquisar', el('input', { type: 'search', placeholder: 'Assunto, título' })]],
      cabecalho: ['Data', 'Ata', 'Arquivo'],
      colunas: [COLS.data, COLS.tipo, COLS.titulo, COLS.desc, COLS.arq],
      linha: (d) => el('tr', null,
        el('td', { 'data-rotulo': 'Data', class: 'num' }, dataBR(d.data)),
        el('td', { 'data-rotulo': 'Ata', class: 'lic-obj' }, el('strong', null, d.titulo), el('span', { class: 'meta' }, TIPOS[d.tipo] + (d.descricao ? ' · ' + d.descricao : ''))),
        el('td', { 'data-rotulo': 'Arquivo' }, arquivo(d)))
    });
  };

  // ---------- 11.11 Orçamento do consórcio ----------
  R['orcamento-consorcio'] = async function (main, partes, params) {
    if (!so(main)) return;
    S.titulo('Orçamento do consórcio'); S.trilha(['Transparência', '#/transparencia'], ['Orçamento do consórcio']);
    const conteudo = el('div', { class: 'painel-guia', role: 'tabpanel' }, el('p', { class: 'carregando' }, 'Carregando…'));
    pagina(main, el('h1', null, 'Orçamento do consórcio'),
      el('p', { class: 'sub' }, 'Orçamento de cada exercício, com a estimativa da receita e a fixação da despesa, aprovado pela assembleia geral (LC 101/2000, art. 48; Portaria STN 274/2016).'),
      el('p', null, el('a', { href: '#/planejamento' }, 'Planejamento e prestação de contas (RREO, RGF, balanço) →')), conteudo);
    return listaDocs(conteudo, params, {
      base: '#/orcamento-consorcio', titulo: 'Orçamento do consórcio', rotuloAno: 'Exercício', nome: 'orcamento-consorcio', unidade: ['documento', 'documentos'], qual: 'orcamento', tipos: ['orcamento'],
      colunaAno: 'exercicio', declaracao: 'consorcio_orcamento', vazio: 'Não há orçamento publicado.',
      filtros: () => [],
      cabecalho: ['Exercício', 'Orçamento', 'Total', 'Arquivo'],
      colunas: [COLS.exercicio, COLS.titulo, COLS.valor, COLS.data, COLS.desc, COLS.arq],
      linha: (d) => el('tr', null,
        el('td', { 'data-rotulo': 'Exercício', class: 'num' }, String(d.exercicio)),
        el('td', { 'data-rotulo': 'Orçamento', class: 'lic-obj' }, el('strong', null, d.titulo), d.descricao ? el('span', { class: 'meta' }, d.descricao) : null),
        el('td', { 'data-rotulo': 'Total', class: 'num' }, d.valor != null ? U.moedaBR(d.valor) : '—'),
        el('td', { 'data-rotulo': 'Arquivo' }, arquivo(d)))
    });
  };

  // Busca do site: documentos do consórcio (usada por paginas.js › R.busca).
  S.buscarConsorcio = async (n) => {
    if (S.orgao.tipo !== 'consorcio') return [];
    const { data } = await sb.from('consorcio_documentos').select('id, tipo, titulo, ente_id, ano').eq('orgao_id', org()).ilike('busca', n).order('data', { ascending: false }).limit(8);
    const rota = { contrato_rateio: '#/rateio', contrato_programa: '#/programa', ata_eleicao: '#/dirigentes-atas', ata_assembleia: '#/dirigentes-atas', orcamento: '#/orcamento-consorcio' };
    return (data || []).map((d) => [TIPOS[d.tipo] + ' · ' + d.titulo, d.ente_id && d.tipo !== 'contrato_rateio' && d.tipo !== 'contrato_programa' ? '#/ente/' + d.ente_id
      : (rota[d.tipo] || '#/documentos-consorcio') + (rota[d.tipo] && d.ano ? '?ano=' + d.ano : '')]);
  };
})();
