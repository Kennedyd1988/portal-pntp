// =====================================================================
// Módulo "Consórcio público" (órgão do tipo consórcio) — PNTP 2026, matriz
// específica dos Consórcios Públicos (script 39). Abas:
//   Entes consorciados ........ 25.7 (lei de ratificação, ingresso, saída)
//   Documentos constitutivos .. 25.1 protocolo de intenções, contrato de consórcio,
//                               25.2 estatuto e alterações estatutárias
//   Contratos de rateio ....... 25.3 um por ente em cada exercício (filtro por ano e por ente)
//   Contratos de programa ..... 25.4 (ente e vigência)
//   Dirigentes e atas ......... 25.5 ata de eleição, 25.6 atas da assembleia geral
//   Orçamento ................. 11.11 receita estimada e despesa fixada do exercício
// Os nomes dos dirigentes (2.3) e a estrutura (assembleia, diretoria, setores — 2.1)
// ficam em Unidades e gestores; as cotas de rateio recebidas mês a mês, em Receitas.
// =====================================================================
(function () {
  'use strict';
  const P = window.PNTP;
  const { sb, el, toast } = P;
  const T = () => P.setor;   // peças comuns (modulo-setoriais-comum.js)

  const TIPOS_DOC = { protocolo_intencoes: 'Protocolo de intenções', contrato_consorcio: 'Contrato de consórcio público', estatuto: 'Estatuto',
    alteracao_estatutaria: 'Alteração estatutária', contrato_rateio: 'Contrato de rateio', contrato_programa: 'Contrato de programa',
    ata_eleicao: 'Ata de eleição dos dirigentes', ata_assembleia: 'Ata da assembleia geral', orcamento: 'Orçamento do consórcio', outros: 'Outro documento' };
  const CONSTITUTIVOS = ['protocolo_intencoes', 'contrato_consorcio', 'estatuto', 'alteracao_estatutaria', 'outros'];
  const ATAS = ['ata_eleicao', 'ata_assembleia'];
  const TIPOS_ENTE = { municipio: 'Município', estado: 'Estado', uniao: 'União', outro: 'Outro ente' };
  const SIT_ENTE = { ativo: 'Ativo', retirado: 'Retirado (saiu do consórcio)', excluido: 'Excluído (pela assembleia)' };
  const UFS = 'AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO'.split(' ');

  let perm = {}, entes = [];
  const org = () => P.estado.orgao.id;
  const pode = () => perm.editar && !P.estado.alcanceUnidade;
  const anoAtual = () => new Date().getFullYear();
  const so = (tipos) => Object.fromEntries(tipos.map((t) => [t, TIPOS_DOC[t]]));
  const ente = (id) => entes.find((e) => e.id === id);
  const nomeEnte = (id) => { const e = ente(id); return e ? e.nome + ' / ' + e.uf : '—'; };
  const opEntes = (todos) => Object.fromEntries(entes.filter((e) => todos || e.situacao_ente === 'ativo').map((e) => [e.id, e.nome + ' / ' + e.uf]));
  const moeda = (v) => T().moeda(v);
  const periodo = (a, b) => a || b ? (P.dataBR(a) || '…') + ' a ' + (P.dataBR(b) || '…') : '—';
  const linkArq = (r) => T().linkArquivo(r);
  const sit = (r) => T().etiquetaSituacao(r.situacao);
  const vazio = (t) => el('p', { class: 'vazio' }, t);

  async function carregarEntes() {
    const { data, error } = await sb.from('consorcio_entes').select('*').eq('orgao_id', org()).order('ordem').order('nome');
    if (error) throw error;
    entes = data || [];
  }

  // ---------- janela de documento (todas as abas) ----------
  // o = { tipos: [códigos], exercicio: 'ob'|'op'|null, ente: 'ob'|'op'|null, valor: rótulo|null, vigencia: bool, exemplo, depois }
  function formDoc(r, o) {
    const campos = [];
    const linha1 = [];
    if (o.tipos.length > 1) linha1.push({ k: 'tipo', r: 'Tipo', t: 'sel', op: so(o.tipos), ob: true });
    linha1.push({ k: 'numero', r: 'Número (opcional)', t: 'text', max: 40, ph: 'Ex.: 01/2026' }, { k: 'data', r: 'Data (assinatura ou aprovação)', t: 'data', ob: true });
    campos.push(linha1);
    if (o.exercicio || o.ente) {
      const l = [];
      if (o.exercicio) l.push({ k: 'exercicio', r: 'Exercício', t: 'int', min: 1990, maxv: 2100, ob: o.exercicio === 'ob' });
      if (o.ente) l.push({ k: 'ente_id', r: 'Ente consorciado', t: 'sel', op: opEntes(true), ob: o.ente === 'ob', vazio: o.ente === 'ob' ? 'Escolha o ente' : 'Nenhum (vale para o consórcio)' });
      campos.push(l);
    }
    campos.push({ k: 'titulo', r: 'Título', t: 'text', max: 300, ob: !o.tituloAuto, minimo: 3, ph: o.exemplo || '', aj: o.tituloAuto ? 'Em branco: o sistema monta o título (tipo, exercício e ente).' : null });
    if (o.valor || o.vigencia) {
      const l = [];
      if (o.valor) l.push({ k: 'valor', r: o.valor, t: 'num' });
      if (o.vigencia) l.push({ k: 'vigencia_inicio', r: 'Vigência: início', t: 'data' }, { k: 'vigencia_fim', r: 'Vigência: fim', t: 'data' });
      campos.push(l);
    }
    campos.push({ k: 'descricao', r: 'Observação (opcional)', t: 'area', max: 4000, ph: o.descricao || 'Ex.: aprovado na assembleia geral de 20/03/2026' });
    campos.push({ k: 'arquivo', r: 'PDF', t: 'arquivo', obPublicar: true });
    return T().formulario({ tabela: 'consorcio_documentos', modulo: 'consorcio', titulo: o.nome || 'documento', registro: r, perm, rascunho: true,
      fixos: o.tipos.length === 1 ? { tipo: o.tipos[0] } : null, depois: o.depois,
      abas: [['dados', 'Documento', campos]],
      validar: (d) => {
        const tipo = d.tipo || o.tipos[0];
        if (tipo === 'contrato_rateio' && !d.exercicio) return ['exercicio', 'Informe o exercício do contrato de rateio.'];
        if (tipo === 'contrato_rateio' && !d.ente_id) return ['ente_id', 'Escolha o ente consorciado.'];
        if (tipo === 'contrato_programa' && !d.ente_id) return ['ente_id', 'Escolha o ente com quem o contrato de programa foi firmado.'];
        if (tipo === 'orcamento' && !d.exercicio) return ['exercicio', 'Informe o exercício do orçamento.'];
        if (d.vigencia_inicio && d.vigencia_fim && d.vigencia_fim < d.vigencia_inicio) return ['vigencia_fim', 'O fim não pode ser antes do início.'];
        if (!d.titulo) d.titulo = TIPOS_DOC[tipo] + (d.exercicio ? ' ' + d.exercicio : '') + (d.ente_id ? ' — ' + (ente(d.ente_id) || {}).nome : '');
        return null;
      } });
  }
  const botaoNovo = (rot, fn) => pode() ? el('button', { type: 'button', class: 'btn btn-primario', onclick: fn }, rot) : '';
  const acoesDoc = (abrir, depois) => (r) => [T().botao(pode() ? 'Editar' : 'Ver', () => abrir(r)),
    pode() && perm.excluir ? T().botao('Excluir', () => T().excluir('consorcio_documentos', r, r.titulo, depois), true) : null];
  // Declarações de que não há dados no pé da aba; ao mudar, as abas de ano se refazem.
  const declaracao = (chave, lista) => P.declaracoes(chave, { perm, aoMudar: () => lista && lista.recarregar(true) });

  // ===================================================================
  // ENTES CONSORCIADOS (25.7)
  // ===================================================================
  function abaEntes() {
    const caixa = el('div');
    const abrir = (r, aba) => T().formulario({ tabela: 'consorcio_entes', modulo: 'consorcio', titulo: 'ente consorciado', registro: r || { situacao_ente: 'ativo', uf: P.estado.orgao.uf || 'RN' },
      perm, rascunho: true, abaInicial: aba, depois: async () => { await carregarEntes(); desenhar(); },
      abas: [['dados', 'Ente', [
        [{ k: 'nome', r: 'Nome do ente', t: 'text', ob: true, minimo: 3, ph: 'Ex.: Município de Riacho da Cruz' }, { k: 'tipo_ente', r: 'Tipo', t: 'sel', op: TIPOS_ENTE },
          { k: 'uf', r: 'UF', t: 'sel', op: Object.fromEntries(UFS.map((u) => [u, u])), ob: true }],
        [{ k: 'cnpj', r: 'CNPJ do ente', t: 'doc', doc: 'cnpj', ph: '00.000.000/0000-00' }, { k: 'lei_ratificacao', r: 'Lei de ratificação', t: 'text', max: 200, ph: 'Ex.: Lei nº 512/2019' },
          { k: 'lei_ratificacao_url', r: 'Link da lei', t: 'url' }],
        [{ k: 'data_ingresso', r: 'Data de ingresso', t: 'data' }, { k: 'situacao_ente', r: 'Situação no consórcio', t: 'sel', op: SIT_ENTE }, { k: 'data_saida', r: 'Data de saída', t: 'data' }],
        [{ k: 'ordem', r: 'Ordem na lista', t: 'int', min: 0, maxv: 999, padrao: 0 }]]]],
      extras: [['contratos', 'Contratos do ente', (x) => contratosDoEnte(x)]],
      validar: (d) => {
        if (d.situacao_ente !== 'ativo' && !d.data_saida) return ['data_saida', 'Informe a data de saída do ente.'];
        if (d.situacao_ente === 'ativo' && d.data_saida) return ['situacao_ente', 'Ente com data de saída não está ativo: escolha "Retirado" ou "Excluído".'];
        if (d.data_ingresso && d.data_saida && d.data_saida < d.data_ingresso) return ['data_saida', 'A saída não pode ser antes do ingresso.'];
        return null;
      } });
    function contratosDoEnte(x) {
      const c = el('div', null, vazio('Carregando…'));
      sb.from('consorcio_documentos').select('*').eq('ente_id', x.id).order('ano', { ascending: false }).order('data', { ascending: false }).then(({ data, error }) => {
        if (error) { c.replaceChildren(el('p', { class: 'msg msg-erro' }, P.erroGravacao(error))); return; }
        c.replaceChildren(el('p', { class: 'ajuda' }, 'Contratos de rateio e de programa deste ente (cadastre nas abas Contratos de rateio e Contratos de programa). Ente com contrato ligado não pode ser excluído.'),
          T().tabela([['Documento', (d) => [el('strong', null, d.titulo), el('span', { class: 'sub-linha' }, TIPOS_DOC[d.tipo])], 'quebra'], ['Exercício', (d) => d.exercicio || '—', 'num'],
            ['Valor', (d) => moeda(d.valor), 'num'], ['Arquivo', linkArq], ['Situação', sit]], data || [], null, 'Nenhum contrato ligado a este ente.'));
      });
      return c;
    }
    function desenhar() {
      const ativos = entes.filter((e) => e.situacao_ente === 'ativo');
      const semLei = ativos.filter((e) => !e.lei_ratificacao && !e.lei_ratificacao_url);
      const rasc = ativos.filter((e) => e.situacao !== 'publicado');
      const faltas = [!ativos.length ? 'Cadastre e publique os entes consorciados (PNTP 25.7).' : null,
        rasc.length ? rasc.length + ' ente(s) ativo(s) em rascunho: publique para aparecer no site.' : null,
        semLei.length ? 'Sem a lei de ratificação do protocolo de intenções: ' + semLei.map((e) => e.nome).join(', ') + ' (boa prática, Lei 11.107/2005, art. 5º).' : null].filter(Boolean);
      caixa.replaceChildren(
        el('p', { class: 'ajuda' }, 'Municípios, estados ou outros entes que integram o consórcio, com a lei que ratificou o protocolo de intenções. Quem saiu continua na lista, com a data de saída (composição vigente no site).'),
        faltas.length ? el('div', { class: 'msg msg-falta' }, el('strong', null, 'Para atender o PNTP: '), el('ul', { style: 'margin:4px 0 0 18px' }, faltas.map((t) => el('li', null, t)))) : '',
        el('p', null, botaoNovo('+ Novo ente consorciado', () => abrir())),
        T().tabela([['Ente', (e) => [el('strong', null, e.nome), el('span', { class: 'sub-linha' }, TIPOS_ENTE[e.tipo_ente] + ' · ' + e.uf + (e.cnpj ? ' · CNPJ ' + P.formatarDoc(e.cnpj) : ''))], 'quebra'],
          ['Lei de ratificação', (e) => e.lei_ratificacao_url ? el('a', { href: e.lei_ratificacao_url, target: '_blank', rel: 'noopener' }, e.lei_ratificacao || 'abrir') : e.lei_ratificacao || '—'],
          ['No consórcio', (e) => [SIT_ENTE[e.situacao_ente].split(' (')[0], el('span', { class: 'sub-linha' }, (e.data_ingresso ? 'desde ' + P.dataBR(e.data_ingresso) : '') + (e.data_saida ? ' · saiu em ' + P.dataBR(e.data_saida) : ''))]],
          ['Situação', sit]], entes,
          (e) => [T().botao('Contratos', () => abrir(e, 'contratos')), T().botao(pode() ? 'Editar' : 'Ver', () => abrir(e)),
            pode() && perm.excluir ? T().botao('Excluir', () => T().excluir('consorcio_entes', e, e.nome, async () => { await carregarEntes(); desenhar(); }), true) : null],
          'Nenhum ente cadastrado.'));
    }
    desenhar();
    return caixa;
  }

  // ===================================================================
  // DOCUMENTOS CONSTITUTIVOS (25.1 e 25.2)
  // ===================================================================
  function abaConstitutivos() {
    const caixa = el('div');
    let lista;
    const abrir = (r) => formDoc(r || { tipo: 'protocolo_intencoes' }, { tipos: CONSTITUTIVOS, ente: 'op', exemplo: 'Ex.: Estatuto do Consórcio — versão consolidada de 2026',
      depois: () => lista.recarregar(true) });
    caixa.append(el('p', { class: 'ajuda' }, 'Protocolo de intenções (25.1), contrato de consórcio público e estatuto (25.2). Publique sempre a versão vigente do estatuto e, separadas, as alterações aprovadas pela assembleia geral.'));
    lista = T().listaAno(caixa, { tabela: 'consorcio_documentos', base: (q) => q.in('tipo', CONSTITUTIVOS), ordem: 'data',
      filtros: [{ k: 'tipo', r: 'Tipo', t: 'sel', op: so(CONSTITUTIVOS), vazio: 'Tipo: todos' }, { k: 'busca', r: 'Pesquisar', t: 'busca', ph: 'Título, número' }],
      botoes: () => [botaoNovo('+ Incluir documento', () => abrir())],
      colunas: [['Documento', (d) => [el('strong', null, d.titulo), el('span', { class: 'sub-linha' }, TIPOS_DOC[d.tipo] + (d.numero ? ' nº ' + d.numero : ''))], 'quebra'],
        ['Data', (d) => P.dataBR(d.data), 'num'], ['Arquivo', linkArq], ['Situação', sit]],
      acoes: acoesDoc(abrir, () => lista.recarregar(true)), vazio: 'Nenhum documento constitutivo cadastrado.' });
    // Aviso local do que o PNTP pede e falta.
    (async () => {
      const { data } = await sb.from('consorcio_documentos').select('tipo, situacao').eq('orgao_id', org()).in('tipo', ['protocolo_intencoes', 'estatuto']).eq('situacao', 'publicado');
      const tem = (t) => (data || []).some((d) => d.tipo === t);
      const f = [tem('protocolo_intencoes') ? null : 'Protocolo de intenções (25.1) não publicado.', tem('estatuto') ? null : 'Estatuto (25.2) não publicado.'].filter(Boolean);
      if (f.length && caixa.isConnected !== false) caixa.firstChild.after(el('div', { class: 'msg msg-falta' }, el('strong', null, 'Para atender o PNTP: '), f.join(' ')));
    })();
    return caixa;
  }

  // ===================================================================
  // CONTRATOS DE RATEIO (25.3)
  // ===================================================================
  function abaRateio() {
    const caixa = el('div');
    const faltas = el('div');
    let lista;
    const abrir = (r) => formDoc(r || { exercicio: lista && lista.ano() || anoAtual(), data: T().hoje() }, { tipos: ['contrato_rateio'], nome: 'contrato de rateio', exercicio: 'ob', ente: 'ob',
      valor: 'Valor do rateio no exercício (R$)', vigencia: true, tituloAuto: true, exemplo: 'Ex.: Contrato de rateio 2026 — Município de Riacho da Cruz',
      descricao: 'Ex.: valor dividido em 12 parcelas mensais; dotação orçamentária do ente…', depois: async () => { await lista.recarregar(true); avisar(); } });
    async function avisar() {
      const ano = anoAtual();
      const { data, error } = await sb.rpc('consorcio_rateio_faltando', { p_orgao: org(), p_ano: ano });
      if (error) { faltas.replaceChildren(); return; }
      faltas.replaceChildren((data || []).length ? el('div', { class: 'msg msg-falta' }, el('strong', null, 'Para atender o PNTP (25.3): '),
        'Contrato de rateio de ' + ano + ' faltando para ' + data.map((x) => x.nome + ' / ' + x.uf).join(', ') + '.',
        pode() ? el('span', null, ' ', T().botao('Incluir agora', () => abrir({ exercicio: ano, data: T().hoje(), ente_id: data[0].ente_id }))) : '')
        : !entes.length ? el('div', { class: 'msg msg-falta' }, el('strong', null, 'Para atender o PNTP (25.3): '), 'cadastre os entes consorciados (aba Entes consorciados): o rateio é conferido ente por ente.') : '');
    }
    caixa.append(el('p', { class: 'ajuda' }, 'Um contrato de rateio para cada ente consorciado em cada exercício (Lei 11.107/2005, art. 8º). O PNTP confere o ano atual e os 3 anteriores. Os valores das cotas recebidas mês a mês vão em Receitas (previsão e arrecadação).'), faltas);
    lista = T().listaAno(caixa, { tabela: 'consorcio_documentos', base: (q) => q.eq('tipo', 'contrato_rateio'), ordem: 'data', rotuloAno: 'Exercício', declaracao: 'consorcio_rateio',
      anos: async () => { const { data, error } = await sb.rpc('consorcio_anos', { p_orgao: org(), p_qual: 'rateio' }); if (error) throw error; return data || []; },
      filtroAno: (q, ano) => q.eq('exercicio', ano),
      filtros: [{ k: 'ente_id', r: 'Ente', t: 'sel', op: opEntes(true), vazio: 'Ente: todos' }, { k: 'busca', r: 'Pesquisar', t: 'busca', ph: 'Título, número' }],
      botoes: () => [botaoNovo('+ Incluir contrato de rateio', () => abrir())],
      colunas: [['Ente', (d) => [el('strong', null, nomeEnte(d.ente_id)), el('span', { class: 'sub-linha' }, d.titulo + (d.numero ? ' · nº ' + d.numero : ''))], 'quebra'],
        ['Exercício', (d) => String(d.exercicio), 'num'], ['Valor', (d) => moeda(d.valor), 'num'], ['Vigência', (d) => periodo(d.vigencia_inicio, d.vigencia_fim), 'num'],
        ['Arquivo', linkArq], ['Situação', sit]],
      acoes: acoesDoc(abrir, async () => { await lista.recarregar(true); avisar(); }), vazio: 'Nenhum contrato de rateio cadastrado.' });
    caixa.append(declaracao('consorcio_rateio', lista));
    avisar();
    return caixa;
  }

  // ===================================================================
  // CONTRATOS DE PROGRAMA (25.4)
  // ===================================================================
  function abaProgramas() {
    const caixa = el('div');
    let lista;
    const abrir = (r) => formDoc(r || { data: T().hoje() }, { tipos: ['contrato_programa'], nome: 'contrato de programa', exercicio: 'op', ente: 'ob', valor: 'Valor (R$, opcional)', vigencia: true,
      exemplo: 'Ex.: Contrato de programa — coleta e destinação de resíduos sólidos', descricao: 'Objeto: serviço público prestado pelo consórcio ao ente…', depois: () => lista.recarregar(true) });
    caixa.append(el('p', { class: 'ajuda' }, 'Contratos de programa firmados com os entes para a prestação de serviços públicos (Lei 11.107/2005, art. 13). Se o consórcio não tem contrato de programa, registre a declaração no pé da página.'));
    lista = T().listaAno(caixa, { tabela: 'consorcio_documentos', base: (q) => q.eq('tipo', 'contrato_programa'), ordem: 'data', rotuloAno: 'Ano', declaracao: 'consorcio_programa',
      anos: async () => { const { data, error } = await sb.rpc('consorcio_anos', { p_orgao: org(), p_qual: 'programa' }); if (error) throw error; return data || []; },
      filtroAno: (q, ano) => q.eq('ano', ano),
      filtros: [{ k: 'ente_id', r: 'Ente', t: 'sel', op: opEntes(true), vazio: 'Ente: todos' }, { k: 'busca', r: 'Pesquisar', t: 'busca', ph: 'Objeto, número' }],
      botoes: () => [botaoNovo('+ Incluir contrato de programa', () => abrir())],
      colunas: [['Contrato', (d) => [el('strong', null, d.titulo), el('span', { class: 'sub-linha' }, nomeEnte(d.ente_id) + (d.numero ? ' · nº ' + d.numero : ''))], 'quebra'],
        ['Vigência', (d) => periodo(d.vigencia_inicio, d.vigencia_fim), 'num'], ['Valor', (d) => moeda(d.valor), 'num'], ['Arquivo', linkArq], ['Situação', sit]],
      acoes: acoesDoc(abrir, () => lista.recarregar(true)), vazio: 'Nenhum contrato de programa cadastrado.' });
    caixa.append(declaracao('consorcio_programa', lista));
    return caixa;
  }

  // ===================================================================
  // DIRIGENTES E ATAS (25.5 e 25.6)
  // ===================================================================
  function abaAtas() {
    const caixa = el('div');
    let lista;
    const abrir = (r) => formDoc(r || { tipo: 'ata_assembleia', data: T().hoje() }, { tipos: ATAS, nome: 'ata', exemplo: 'Ex.: Ata da 1ª assembleia geral ordinária de 2026',
      descricao: 'Ex.: aprovou o orçamento de 2027 e elegeu a diretoria para o biênio 2027–2028', depois: () => lista.recarregar(true) });
    caixa.append(el('p', { class: 'ajuda' }, 'A ata da eleição dos atuais dirigentes (25.5) e as atas da assembleia geral (25.6: a mais recente com até 1 ano, mais os 3 anos anteriores). Os nomes do presidente e da diretoria vão em ',
      el('a', { href: '#/m/institucional' }, 'Unidades e gestores'), ' (2.3), com a assembleia geral, a diretoria executiva e os setores como unidades (estrutura organizacional, 2.1).'));
    lista = T().listaAno(caixa, { tabela: 'consorcio_documentos', base: (q) => q.in('tipo', ATAS), ordem: 'data', rotuloAno: 'Ano', declaracao: 'consorcio_atas',
      anos: async () => { const { data, error } = await sb.rpc('consorcio_anos', { p_orgao: org(), p_qual: 'atas' }); if (error) throw error; return data || []; },
      filtroAno: (q, ano) => q.eq('ano', ano),
      filtros: [{ k: 'tipo', r: 'Tipo', t: 'sel', op: so(ATAS), vazio: 'Tipo: todas' }, { k: 'busca', r: 'Pesquisar', t: 'busca', ph: 'Título, assunto' }],
      botoes: () => [botaoNovo('+ Incluir ata', () => abrir())],
      colunas: [['Ata', (d) => [el('strong', null, d.titulo), el('span', { class: 'sub-linha' }, TIPOS_DOC[d.tipo])], 'quebra'], ['Data', (d) => P.dataBR(d.data), 'num'],
        ['Arquivo', linkArq], ['Situação', sit]],
      acoes: acoesDoc(abrir, () => lista.recarregar(true)), vazio: 'Nenhuma ata cadastrada.' });
    caixa.append(declaracao('consorcio_atas', lista));
    return caixa;
  }

  // ===================================================================
  // ORÇAMENTO (11.11)
  // ===================================================================
  function abaOrcamento() {
    const caixa = el('div');
    let lista;
    const abrir = (r) => formDoc(r || { exercicio: anoAtual(), data: T().hoje() }, { tipos: ['orcamento'], nome: 'orçamento', exercicio: 'ob', valor: 'Total do orçamento (R$)', tituloAuto: true,
      exemplo: 'Ex.: Orçamento do consórcio para 2026', descricao: 'Ex.: aprovado na assembleia geral de 30/11/2025 (Resolução nº 3/2025)', depois: () => lista.recarregar(true) });
    caixa.append(el('p', { class: 'ajuda' }, 'O orçamento de cada exercício, com a estimativa da receita e a fixação da despesa (PNTP 11.11; LC 101/2000, art. 48). Publique o do ano atual e mantenha os 3 anteriores. Se o orçamento for publicado como LOA em Planejamento e contas, ele também conta.'));
    lista = T().listaAno(caixa, { tabela: 'consorcio_documentos', base: (q) => q.eq('tipo', 'orcamento'), ordem: 'data', rotuloAno: 'Exercício', declaracao: 'consorcio_orcamento',
      anos: async () => { const { data, error } = await sb.rpc('consorcio_anos', { p_orgao: org(), p_qual: 'orcamento' }); if (error) throw error; return data || []; },
      filtroAno: (q, ano) => q.eq('exercicio', ano),
      botoes: () => [botaoNovo('+ Incluir orçamento', () => abrir())],
      colunas: [['Orçamento', (d) => [el('strong', null, d.titulo), d.descricao ? el('span', { class: 'sub-linha' }, d.descricao) : null], 'quebra'], ['Exercício', (d) => String(d.exercicio), 'num'],
        ['Total', (d) => moeda(d.valor), 'num'], ['Arquivo', linkArq], ['Situação', sit]],
      acoes: acoesDoc(abrir, () => lista.recarregar(true)), vazio: 'Nenhum orçamento cadastrado.' });
    caixa.append(declaracao('consorcio_orcamento', lista));
    return caixa;
  }

  // ===================================================================
  P.telas.consorcio = async function (c, mod, p) {
    perm = p;
    c.replaceChildren(el('h1', null, 'Consórcio público'), el('p', { class: 'sub' }, 'Carregando…'));
    if (!T()) { c.querySelector('.sub').textContent = 'Atualize a página (falta carregar uma parte do painel).'; return; }
    try { await carregarEntes(); }
    catch (e) { c.querySelector('.sub').textContent = /consorcio_entes|Could not find|does not exist/i.test(e.message || '') ? 'Falta rodar o script 39 no banco.' : P.erroGravacao(e); return; }
    c.replaceChildren(
      el('div', { class: 'cabecalho-modulo' }, el('div', null, el('h1', null, 'Consórcio público'),
        el('p', { class: 'sub' }, 'Entes consorciados, documentos constitutivos, contratos de rateio e de programa, atas e orçamento (PNTP 2026, matriz dos Consórcios Públicos).'))),
      P.estado.alcanceUnidade && perm.editar ? el('p', { class: 'msg msg-info' }, 'Os documentos do consórcio são do órgão todo: só quem tem acesso ao órgão inteiro altera.') : null,
      P.abas([
        ['entes', 'Entes consorciados', abaEntes, null, 'consorcio_entes'],
        ['constitutivos', 'Documentos constitutivos', abaConstitutivos, null, 'consorcio_documentos'],
        ['rateio', 'Contratos de rateio', abaRateio, null, 'consorcio_rateio'],
        ['programa', 'Contratos de programa', abaProgramas, null, 'consorcio_programa'],
        ['atas', 'Dirigentes e atas', abaAtas, null, 'consorcio_atas'],
        ['orcamento', 'Orçamento', abaOrcamento, null, 'consorcio_orcamento']
      ]));
  };
})();
