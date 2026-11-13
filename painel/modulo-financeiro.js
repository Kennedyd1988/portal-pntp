// =====================================================================
// Módulo "Receitas, despesas e pagamentos" (código "financeiro").
//   3.1–3.2 receitas: previsão e arrecadação mês a mês, por natureza
//           (código e descrição de cada nível da classificação);
//   3.3     inscritos em dívida ativa (Poder Executivo);
//   4.1–4.3 empenhos com a classificação orçamentária, o credor, o objeto e
//           a licitação de origem; reforços, anulações, liquidações e
//           pagamentos (o banco mantém os totais do empenho);
//   9.4     ordem cronológica de pagamentos (art. 141 da Lei 14.133/2021),
//           com a justificativa quando a ordem é alterada.
// Dados contábeis vêm do sistema de contabilidade: não há rascunho, ficam
// públicos ao salvar. A importação de arquivos entra na próxima etapa.
// =====================================================================
(function () {
  'use strict';
  const P = window.PNTP;
  const S = P.setor;
  const C = window.CLASSIF_PNTP;
  const { sb, el } = P;
  const TIPO_EMP = { ordinario: 'Ordinário', estimativo: 'Estimativo', global: 'Global' };
  const TIPO_MOV = { liquidacao: 'Liquidação', pagamento: 'Pagamento', reforco: 'Reforço do empenho', anulacao: 'Anulação do empenho',
    estorno_liquidacao: 'Estorno de liquidação', estorno_pagamento: 'Estorno de pagamento' };
  let perm = {};
  const org = () => P.estado.orgao.id;
  const pode = () => perm.editar && !P.estado.alcanceUnidade;
  const doisValores = (a, b) => [a, b ? el('span', { class: 'sub-linha' }, b) : null];
  const anoAtual = () => new Date().getFullYear();
  const codigoReceita = (v) => {
    const d = String(v || '').replace(/\s/g, '');
    return /^\d{8}$/.test(d) ? d.replace(/^(\d)(\d)(\d)(\d)(\d{2})(\d)(\d)$/, '$1.$2.$3.$4.$5.$6.$7') : d;
  };
  const codigoDespesa = (v) => {
    const d = String(v || '').replace(/\D/g, '');
    return d.length >= 6 && d.length <= 10 ? d.slice(0, 1) + '.' + d.slice(1, 2) + '.' + d.slice(2, 4) + '.' + d.slice(4, 6) + (d.length > 6 ? '.' + d.slice(6) : '') : v;
  };
  const botoesLinha = (tabela, abrir, nome, recarregar, excluir) => (l) => [S.botao(pode() ? 'Editar' : 'Ver', () => abrir(l)),
    pode() && (excluir === undefined ? perm.editar : excluir) ? S.botao('Excluir', () => S.excluir(tabela, l, nome(l), () => recarregar()), true) : null];

  // ===================================================================
  // RECEITAS (3.1 e 3.2)
  // ===================================================================
  function receitas(caixa) {
    let lst;
    const abrir = (r) => S.formulario({ tabela: 'receitas', modulo: 'financeiro', titulo: 'lançamento de receita', perm,
      registro: r || { exercicio: lst && lst.ano() || anoAtual(), mes: new Date().getMonth() + 1 },
      depois: () => lst.recarregar(true),
      abas: [['dados', 'Lançamento do mês', [
        [{ k: 'exercicio', r: 'Exercício', t: 'int', min: 1990, maxv: 2100, ob: true }, { k: 'mes', r: 'Mês', t: 'sel', op: S.opMeses }],
        [{ k: 'natureza_codigo', r: 'Natureza da receita (código)', t: 'text', max: 40, ob: true, ph: 'Ex.: 1.1.1.2.50.0.1 ou 11125001',
          aj: 'Código do nível mais detalhado. Os níveis acima (categoria, origem, espécie…) são somados pelo site.' },
          { k: 'natureza_descricao', r: 'Descrição', t: 'text', max: 300, ob: true, minimo: 2, ph: 'Ex.: IPTU - Principal' }],
        [{ k: 'fonte_codigo', r: 'Fonte de recursos (código)', t: 'text', max: 20, ph: 'Ex.: 1500' }, { k: 'fonte_descricao', r: 'Fonte de recursos (nome)', t: 'text', max: 200, ph: 'Ex.: Recursos não vinculados de impostos' }],
        [{ k: 'previsto_inicial', r: 'Previsão inicial do ano (R$)', t: 'num', aj: 'Valor da LOA.' }, { k: 'previsto_atualizado', r: 'Previsão atualizada do ano (R$)', t: 'num', aj: 'Com as alterações até este mês.' },
          { k: 'arrecadado', r: 'Arrecadado no mês (R$)', t: 'num', negativo: true, aj: 'Deduções (ex.: FUNDEB) entram com sinal de menos.' }]]]],
      validar: (d) => {
        d.natureza_codigo = codigoReceita(d.natureza_codigo);
        if (!/^\d+(\.\d+)*$/.test(d.natureza_codigo)) return ['natureza_codigo', 'Use só números separados por pontos (ex.: 1.1.1.2.50.0.1).'];
        d.mes = Number(d.mes);
        if (d.arrecadado === null) d.arrecadado = 0;
        return null;
      } });
    const resumo = (ano) => {
      const box = el('div', { class: 'ajuda', style: 'margin:6px 0 10px' }, 'Somando os meses…');
      sb.rpc('receitas_mensal', { p_orgao: org(), p_exercicio: ano }).then(({ data }) => {
        const m = data || [];
        const total = m.reduce((t, x) => t + Number(x.arrecadado || 0), 0);
        box.replaceChildren(el('strong', null, 'Arrecadado em ' + ano + ': ' + S.moeda(total) + '. '),
          'Meses lançados: ', m.length ? m.map((x) => S.MESES[x.mes - 1].slice(0, 3) + ' (' + x.lancamentos + ')').join(' · ') : 'nenhum', '.');
      });
      return box;
    };
    caixa.append(
      S.secao('receitas_arrecadacao', perm, { aoMudarDeclaracao: () => lst && lst.recarregar(true), naoHa: false }),
      el('p', { class: 'ajuda' }, 'PNTP 3.1 e 3.2: previsão (inicial e atualizada) e arrecadação de cada natureza da receita, mês a mês, no nível mais detalhado. O site soma os níveis da classificação (categoria econômica, origem, espécie, desdobramentos) e mostra o código e a descrição de cada um.'));
    lst = S.listaAno(caixa, { declaracao: 'receitas_arrecadacao', tabela: 'receitas', anos: S.anosFinanceiros('receitas'), ordem: 'natureza_codigo', crescente: true,
      vazio: 'Nenhuma receita lançada. Inclua os lançamentos do mês ou aguarde a importação do sistema de contabilidade.',
      aoTrocarAno: async (ano) => {
        const { data } = await sb.from('receitas').select('mes').eq('orgao_id', org()).eq('exercicio', ano).order('mes', { ascending: false }).limit(1);
        return { mes: data && data[0] ? String(data[0].mes) : '' };
      },
      filtros: [{ k: 'mes', r: 'Mês', t: 'sel', op: S.opMeses, vazio: 'Todos os meses' }, { k: 'busca', r: 'Pesquisar', t: 'busca', ph: 'Código, descrição ou fonte' }],
      rodape: resumo,
      botoes: () => pode() ? [el('button', { type: 'button', class: 'btn btn-primario', onclick: () => abrir() }, '+ Incluir lançamento'),
        el('button', { type: 'button', class: 'btn btn-claro', onclick: niveis }, 'Descrição dos níveis (3.2)')] : [el('button', { type: 'button', class: 'btn btn-claro', onclick: niveis }, 'Descrição dos níveis (3.2)')],
      colunas: [['Natureza', (r) => doisValores(el('strong', null, r.natureza_codigo), r.natureza_descricao), 'quebra'],
        ['Fonte', (r) => r.fonte_codigo ? doisValores(r.fonte_codigo, r.fonte_descricao) : '—'],
        ['Mês', (r) => S.MESES[r.mes - 1].slice(0, 3) + '/' + r.exercicio, 'num'],
        ['Previsão inicial', (r) => S.moeda(r.previsto_inicial), 'num'], ['Previsão atualizada', (r) => S.moeda(r.previsto_atualizado), 'num'],
        ['Arrecadado no mês', (r) => S.moeda(r.arrecadado), 'num']],
      acoes: botoesLinha('receitas', abrir, (r) => r.natureza_codigo + ' de ' + S.MESES[r.mes - 1], () => lst.recarregar(true)) });
    return caixa;
  }
  // Descrição de cada nível (categoria, origem, espécie…): usada pelo site no lugar do código puro.
  function niveis() {
    const caixa = el('div');
    const d = P.abrirDialogo('Descrição dos níveis da receita', caixa, [el('button', { type: 'button', class: 'btn btn-primario', onclick: () => d.close() }, 'Fechar')]);
    d.classList.add('dialogo-largo');
    caixa.append(el('p', { class: 'ajuda' }, 'O site já usa os nomes padronizados dos primeiros níveis (ex.: 1 Receitas Correntes, 1.1 Impostos, Taxas e Contribuições de Melhoria, 1.7 Transferências Correntes). ' +
      'Informe aqui a descrição dos demais níveis (ex.: 1.1.1.2 Impostos sobre o Patrimônio), para o visitante ver código e nome em todos (PNTP 3.2).'),
    S.filhos({ tabela: 'receitas_naturezas', pai: ['orgao_id', org()], perm: Object.assign({}, perm, { editar: pode() }), modulo: 'financeiro', rotulo: 'nível',
      ordem: [['codigo', true]], nome: (l) => l.codigo,
      campos: [[{ k: 'codigo', r: 'Código do nível', t: 'text', max: 40, ob: true, ph: 'Ex.: 1.1.1.2' }, { k: 'descricao', r: 'Descrição', t: 'text', max: 300, ob: true, minimo: 2, ph: 'Ex.: Impostos sobre o Patrimônio' }]],
      validar: (x) => { x.codigo = codigoReceita(x.codigo); return /^\d+(\.\d+)*$/.test(x.codigo) ? null : ['codigo', 'Só números separados por pontos.']; },
      colunas: [['Código', (l) => el('strong', null, l.codigo)], ['Descrição', (l) => l.descricao, 'quebra']] }));
  }

  // ===================================================================
  // DÍVIDA ATIVA (3.3)
  // ===================================================================
  function dividaAtiva(caixa) {
    let lst;
    const abrir = (r) => S.formulario({ tabela: 'divida_ativa', modulo: 'financeiro', titulo: 'inscrito em dívida ativa', perm,
      registro: r || { exercicio: lst && lst.ano() || anoAtual() - 1 }, depois: () => lst.recarregar(true),
      abas: [['dados', 'Inscrito', [
        [{ k: 'exercicio', r: 'Posição em 31/12 do ano', t: 'int', min: 1990, maxv: 2100, ob: true }, { k: 'ano_inscricao', r: 'Ano da inscrição', t: 'int', min: 1950, maxv: 2100, ob: true }],
        [{ k: 'nome', r: 'Nome / razão social', t: 'text', max: 200, ob: true, minimo: 2 }, { k: 'documento', r: 'CPF ou CNPJ', t: 'doc', aj: 'CPF aparece mascarado no site (LGPD).' }],
        [{ k: 'tributo', r: 'Origem do débito', t: 'text', max: 100, ph: 'Ex.: IPTU, ISS, taxas, multa' }, { k: 'valor', r: 'Valor total da dívida (R$)', t: 'num', ob: true }]]]] });
    caixa.append(
      S.secao('receitas_divida_ativa', perm, { aoMudarDeclaracao: () => lst && lst.recarregar(true), naoHa: 'Não há créditos inscritos em dívida ativa no município.' }),
      el('p', { class: 'ajuda' }, 'PNTP 3.3 (recomendada, Poder Executivo): relação dos inscritos em dívida ativa com o nome e o valor total da dívida. A posição é a do fim de cada exercício.'));
    lst = S.listaAno(caixa, { declaracao: 'receitas_divida_ativa', tabela: 'divida_ativa', anos: S.anosFinanceiros('divida_ativa'), rotuloAno: 'Posição em 31/12', ordem: 'nome', crescente: true,
      vazio: 'Nenhum inscrito cadastrado.',
      filtros: [{ k: 'busca', r: 'Pesquisar', t: 'busca', ph: 'Nome, CNPJ ou origem do débito' }],
      botoes: () => pode() ? [el('button', { type: 'button', class: 'btn btn-primario', onclick: () => abrir() }, '+ Incluir inscrito')] : [],
      colunas: [['Inscrito', (r) => doisValores(el('strong', null, r.nome), r.documento ? P.formatarDoc(r.documento) : null), 'quebra'],
        ['Origem', (r) => r.tributo || '—'], ['Inscrição', (r) => String(r.ano_inscricao), 'num'], ['Valor', (r) => S.moeda(r.valor), 'num']],
      acoes: botoesLinha('divida_ativa', abrir, (r) => r.nome, () => lst.recarregar(true)) });
    return caixa;
  }

  // ===================================================================
  // DESPESAS (4.1 a 4.3)
  // ===================================================================
  const movimentos = (r, travado, depois) => S.filhos({ tabela: 'despesas_movimentos', pai: ['despesa_id', r.id], travado, perm, modulo: 'financeiro', rotulo: 'movimento',
    ordem: [['data', true], ['criado_em', true]], depois, nome: (l) => TIPO_MOV[l.tipo] + ' de ' + P.dataBR(l.data),
    ajuda: 'Liquidações e pagamentos do empenho, com a data (PNTP 4.1 pede dados de até 30 dias). Reforço e anulação mudam o valor empenhado. O banco confere: o liquidado não passa do empenhado, nem o pago passa do liquidado.',
    campos: [[{ k: 'tipo', r: 'Movimento', t: 'sel', op: TIPO_MOV }, { k: 'data', r: 'Data', t: 'data', ob: true, hoje: true }, { k: 'valor', r: 'Valor (R$)', t: 'num', ob: true }],
      [{ k: 'documento', r: 'Documento', t: 'text', max: 60, ph: 'Nº da liquidação, nota fiscal ou ordem de pagamento' }, { k: 'observacao', r: 'Observação', t: 'text', max: 300 }]],
    validar: (x) => !(x.valor > 0) ? ['valor', 'Informe um valor maior que zero.'] : null,
    colunas: [['Data', (l) => P.dataBR(l.data), 'num'], ['Movimento', (l) => doisValores(TIPO_MOV[l.tipo], l.documento)], ['Valor', (l) => S.moeda(l.valor), 'num'],
      ['Observação', (l) => l.observacao || '—', 'quebra']] });

  function despesas(caixa) {
    let lst;
    const abrir = (r, aba) => S.formulario({ tabela: 'despesas', modulo: 'financeiro', titulo: 'empenho', perm, abaInicial: aba, reabrir: 'movimentos',
      registro: r || { data_empenho: S.hoje(), modalidade: null }, depois: () => lst.recarregar(true),
      aviso: r && r.id ? el('p', { class: 'ajuda' }, 'Totais mantidos pelo banco: empenhado ' + S.moeda(r.total_empenhado) + ' · liquidado ' + S.moeda(r.total_liquidado) + ' · pago ' + S.moeda(r.total_pago) + '.') : null,
      abas: [['dados', 'Empenho', [
        [{ k: 'numero', r: 'Número do empenho', t: 'text', max: 30, ob: true, ph: 'Ex.: 0123/2026' }, { k: 'data_empenho', r: 'Data do empenho', t: 'data', ob: true },
          { k: 'tipo_empenho', r: 'Tipo', t: 'sel', op: TIPO_EMP }],
        [{ k: 'valor_empenhado', r: 'Valor original do empenho (R$)', t: 'num', ob: true, aj: 'Reforços e anulações entram na aba Liquidações e pagamentos.' }, { k: 'processo', r: 'Processo administrativo', t: 'text', max: 60 }],
        { k: 'objeto', r: 'Bem fornecido ou serviço prestado (histórico do empenho)', t: 'area', max: 2000, ob: true, minimo: 3, linhas: 3 }]],
      ['classif', 'Classificação (4.2)', [
        [{ k: 'unidade_codigo', r: 'Unidade orçamentária (código)', t: 'text', max: 20, ph: 'Ex.: 02.05' }, { k: 'unidade_nome', r: 'Unidade orçamentária (nome)', t: 'text', max: 200, ph: 'Ex.: Secretaria Municipal de Educação' }],
        [{ k: 'funcao_codigo', r: 'Função', t: 'sel', op: Object.fromEntries(Object.entries(C.funcoes).map(([k, v]) => [k, k + ' · ' + v])), vazio: '—' },
          { k: 'subfuncao_codigo', r: 'Subfunção (código)', t: 'text', max: 3, ph: 'Ex.: 361' }, { k: 'subfuncao_nome', r: 'Subfunção (nome)', t: 'text', max: 150, ph: 'Ex.: Ensino Fundamental' }],
        [{ k: 'programa_codigo', r: 'Programa (código)', t: 'text', max: 10 }, { k: 'programa_nome', r: 'Programa (nome)', t: 'text', max: 200 }],
        [{ k: 'acao_codigo', r: 'Ação / projeto-atividade (código)', t: 'text', max: 10 }, { k: 'acao_nome', r: 'Ação (nome)', t: 'text', max: 300 }],
        [{ k: 'natureza_codigo', r: 'Natureza da despesa', t: 'text', max: 20, ph: 'Ex.: 3.3.90.30 ou 3.3.90.30.01', aj: 'Categoria, grupo, modalidade, elemento e desdobramento.' },
          { k: 'natureza_nome', r: 'Elemento / desdobramento (nome)', t: 'text', max: 200, ph: 'Ex.: Material de Consumo' }],
        [{ k: 'fonte_codigo', r: 'Fonte de recursos (código)', t: 'text', max: 20, ph: 'Ex.: 1500' }, { k: 'fonte_nome', r: 'Fonte de recursos (nome)', t: 'text', max: 200 }]]],
      ['credor', 'Credor e licitação (4.3)', [
        [{ k: 'credor_nome', r: 'Credor (favorecido)', t: 'text', max: 200, ob: true, minimo: 2 }, { k: 'credor_doc', r: 'CPF ou CNPJ', t: 'doc', aj: 'CPF aparece mascarado no site; o visitante pode procurar pelo número inteiro.' }],
        [{ k: 'modalidade', r: 'Procedimento de origem', t: 'sel', op: C.contratacao, vazio: '— Escolha —', ob: true, obMsg: 'Informe o procedimento (ou "Não se aplica" para folha, encargos, diárias…). É pedido pelo PNTP 4.3.' }, { k: 'licitacao_numero', r: 'Número do procedimento', t: 'text', max: 40, ph: 'Ex.: 012/2026' }]]]],
      extras: [['movimentos', 'Liquidações e pagamentos', (reg, travado) => movimentos(reg, travado, () => lst.recarregar(true))]],
      validar: (d) => {
        if (d.funcao_codigo === '') d.funcao_codigo = null;
        if (d.subfuncao_codigo && !/^\d{3}$/.test(d.subfuncao_codigo)) return ['subfuncao_codigo', 'A subfunção tem 3 números.'];
        if (d.natureza_codigo) { d.natureza_codigo = codigoDespesa(d.natureza_codigo); if (!/^\d\.\d\.\d{2}\.\d{2}(\.\d+)?$/.test(d.natureza_codigo)) return ['natureza_codigo', 'Use o formato 3.3.90.30 (pode ter o desdobramento: 3.3.90.30.01).']; }
        if (!d.modalidade) return ['modalidade', 'Informe o procedimento (ou "Não se aplica" para folha, encargos, diárias…). É pedido pelo PNTP 4.3.'];
        if (d.modalidade === 'nao_se_aplica') d.licitacao_numero = null;
        return null;
      } });
    const resumo = (ano) => {
      const box = el('div', { class: 'ajuda', style: 'margin:6px 0 10px' }, 'Somando…');
      sb.rpc('despesas_resumo', { p_orgao: org(), p_exercicio: ano }).then(({ data, error }) => {
        const t = (data || [])[0];
        box.replaceChildren(error ? P.erroGravacao(error) : t ? el('strong', null, ano + ': empenhado ' + S.moeda(t.empenhado) + ' · liquidado ' + S.moeda(t.liquidado) + ' · pago ' + S.moeda(t.pago) + ' (' + t.empenhos + ' empenhos).') : '');
      });
      return box;
    };
    caixa.append(
      S.secao('despesas_empenhos', perm, { aoMudarDeclaracao: () => lst && lst.recarregar(true), naoHa: false }),
      el('p', { class: 'ajuda' }, 'PNTP 4.1 a 4.3: cada empenho com a classificação orçamentária, o credor, o bem ou serviço e o procedimento de origem; as liquidações e os pagamentos com a data. O site soma empenhado, liquidado e pago por qualquer classificação e período.'));
    lst = S.listaAno(caixa, { declaracao: 'despesas_empenhos', tabela: 'despesas', anos: S.anosFinanceiros('despesas'), ordem: 'data_empenho', crescente: false,
      vazio: 'Nenhum empenho lançado. Inclua os empenhos ou aguarde a importação do sistema de contabilidade.',
      filtros: [{ k: 'busca', r: 'Pesquisar', t: 'busca', ph: 'Número, credor, CNPJ, objeto ou processo' },
        { k: 'modalidade', r: 'Procedimento', t: 'sel', op: C.contratacao, vazio: 'Procedimento: todos' }],
      rodape: resumo,
      botoes: () => pode() ? [el('button', { type: 'button', class: 'btn btn-primario', onclick: () => abrir() }, '+ Incluir empenho')] : [],
      colunas: [['Empenho', (r) => doisValores(el('strong', null, r.numero), P.dataBR(r.data_empenho) + ' · ' + TIPO_EMP[r.tipo_empenho]), 'num'],
        ['Credor e objeto', (r) => [el('strong', null, r.credor_nome), r.credor_doc ? ' · ' + P.formatarDoc(r.credor_doc) : '', el('span', { class: 'sub-linha' }, r.objeto.length > 120 ? r.objeto.slice(0, 117) + '…' : r.objeto)], 'quebra'],
        ['Classificação', (r) => doisValores(r.natureza_codigo || '—', [r.unidade_codigo, r.funcao_codigo && 'função ' + r.funcao_codigo, r.fonte_codigo && 'fonte ' + r.fonte_codigo].filter(Boolean).join(' · '))],
        ['Empenhado', (r) => S.moeda(r.total_empenhado), 'num'], ['Liquidado', (r) => S.moeda(r.total_liquidado), 'num'], ['Pago', (r) => S.moeda(r.total_pago), 'num']],
      acoes: (r) => [S.botao('Pagamentos', () => abrir(r, 'movimentos')), S.botao(pode() ? 'Editar' : 'Ver', () => abrir(r)),
        pode() && perm.excluir ? S.botao('Excluir', () => S.excluir('despesas', r, 'empenho ' + r.numero, () => lst.recarregar(true)), true) : null] });
    return caixa;
  }

  // ===================================================================
  // ORDEM CRONOLÓGICA DE PAGAMENTOS (9.4)
  // ===================================================================
  function ordemCronologica(caixa) {
    let lst;
    const abrir = (r) => S.formulario({ tabela: 'ordem_cronologica', modulo: 'financeiro', titulo: 'crédito na ordem cronológica', perm,
      registro: r || { data_exigibilidade: S.hoje() }, depois: () => lst.recarregar(true),
      abas: [['dados', 'Crédito', [
        [{ k: 'categoria', r: 'Categoria do contrato', t: 'sel', op: C.categoriasOC }, { k: 'fonte_codigo', r: 'Fonte de recursos (código)', t: 'text', max: 20, ph: 'Ex.: 1500' },
          { k: 'fonte_nome', r: 'Fonte de recursos (nome)', t: 'text', max: 200 }],
        [{ k: 'credor_nome', r: 'Credor', t: 'text', max: 200, ob: true, minimo: 2 }, { k: 'credor_doc', r: 'CPF ou CNPJ', t: 'doc' }],
        [{ k: 'documento_fiscal', r: 'Documento de cobrança', t: 'text', max: 80, ph: 'Ex.: NF 1234, fatura, medição nº 3' }, { k: 'empenho_numero', r: 'Empenho', t: 'text', max: 30 },
          { k: 'contrato_numero', r: 'Contrato', t: 'text', max: 60 }],
        { k: 'objeto', r: 'Objeto', t: 'text', max: 500 },
        [{ k: 'data_exigibilidade', r: 'Exigível desde', t: 'data', ob: true, aj: 'Data em que o credor pode exigir o pagamento (liquidação, atesto da nota).' },
          { k: 'data_pagamento', r: 'Pago em', t: 'data' }, { k: 'valor', r: 'Valor (R$)', t: 'num', ob: true }]]],
      ['alteracao', 'Alteração da ordem', [
        { k: 'fora_da_ordem', r: 'Este pagamento foi feito fora da ordem cronológica', t: 'bool' },
        { k: 'motivo_alteracao', r: 'Hipótese legal (art. 141, § 1º, da Lei 14.133/2021)', t: 'sel', op: C.motivosOC, vazio: '—' },
        { k: 'justificativa', r: 'Justificativa', t: 'area', max: 3000, linhas: 4, ph: 'Por que a ordem foi alterada (o PNTP pede a justificativa publicada).' },
        [{ k: 'ato_justificativa', r: 'Ato que autorizou', t: 'text', max: 200, ph: 'Ex.: Despacho nº 12/2026 do Secretário de Finanças' }, { k: 'justificativa_url', r: 'Link do ato', t: 'url' }]]]],
      validar: (d) => {
        if (!(d.valor > 0)) return ['valor', 'Informe um valor maior que zero.'];
        if (d.fora_da_ordem && !d.motivo_alteracao) return ['motivo_alteracao', 'Escolha a hipótese legal.'];
        if (d.fora_da_ordem && (d.justificativa || '').length < 20) return ['justificativa', 'Escreva a justificativa (mínimo de 20 letras).'];
        if (!d.fora_da_ordem) d.motivo_alteracao = null;
        return null;
      } });
    caixa.append(
      S.secao('ordem_cronologica', perm, { aoMudarDeclaracao: () => lst && lst.recarregar(true), naoHa: 'Não há pagamentos de contratos sujeitos à ordem cronológica (art. 141 da Lei 14.133/2021) no período.' }),
      el('p', { class: 'ajuda' }, 'PNTP 9.4 (recomendada): a fila de pagamentos de cada fonte de recursos, separada por categoria (bens, locações, serviços e obras), na ordem em que os créditos ficaram exigíveis. Pagamento fora da ordem só com a hipótese legal e a justificativa, que o site publica.'));
    lst = S.listaAno(caixa, { declaracao: 'ordem_cronologica', tabela: 'ordem_cronologica', anos: S.anosFinanceiros('ordem_cronologica'), ordem: 'data_exigibilidade', crescente: true,
      vazio: 'Nenhum crédito lançado na ordem cronológica.',
      filtros: [{ k: 'categoria', r: 'Categoria', t: 'sel', op: C.categoriasOC, vazio: 'Categoria: todas' },
        { k: 'situacao', r: 'Situação', t: 'sel', op: { a_pagar: 'A pagar', pago: 'Pagos', fora: 'Pagos fora da ordem' }, vazio: 'Situação: todos',
          aplicar: (q, v) => v === 'a_pagar' ? q.is('data_pagamento', null) : v === 'pago' ? q.not('data_pagamento', 'is', null) : q.eq('fora_da_ordem', true) },
        { k: 'busca', r: 'Pesquisar', t: 'busca', ph: 'Credor, nota, empenho ou contrato' }],
      botoes: () => pode() ? [el('button', { type: 'button', class: 'btn btn-primario', onclick: () => abrir() }, '+ Incluir crédito')] : [],
      colunas: [['Exigível desde', (r) => P.dataBR(r.data_exigibilidade), 'num'],
        ['Credor', (r) => doisValores(el('strong', null, r.credor_nome), [r.documento_fiscal, r.empenho_numero && 'empenho ' + r.empenho_numero].filter(Boolean).join(' · ')), 'quebra'],
        ['Categoria e fonte', (r) => doisValores(C.categoriasOC[r.categoria], r.fonte_codigo ? 'fonte ' + r.fonte_codigo : null)],
        ['Valor', (r) => S.moeda(r.valor), 'num'],
        ['Pagamento', (r) => r.data_pagamento ? [P.dataBR(r.data_pagamento), r.fora_da_ordem ? el('span', { class: 'etiqueta etiqueta-pendente', style: 'margin-left:6px' }, 'fora da ordem') : null] : el('span', { class: 'etiqueta etiqueta-agendado' }, 'a pagar')]],
      acoes: botoesLinha('ordem_cronologica', abrir, (r) => r.credor_nome + ' · ' + P.dataBR(r.data_exigibilidade), () => lst.recarregar(true)) });
    return caixa;
  }

  P.telas.financeiro = async function (c, mod, p) {
    perm = p;
    c.replaceChildren(el('h1', null, mod.nome), el('p', { class: 'sub' }, 'Carregando…'));
    try {
      await S.carregarSecoes();
      const { error } = await sb.from('despesas').select('id', { head: true, count: 'exact' }).eq('orgao_id', org());
      if (error) throw error;
    } catch (e) { c.querySelector('.sub').textContent = /despesas|Could not find|does not exist/i.test((e && e.message) || '') ? 'Falta rodar o script 22 no banco.' : S.faltaScript(e); return; }
    const caixa = () => el('div');
    c.replaceChildren(...[
      S.cabecalho(mod.nome, 'Receitas previstas e arrecadadas, dívida ativa, empenhos, liquidações e pagamentos, e a ordem cronológica dos pagamentos (PNTP 3.1 a 3.3, 4.1 a 4.3 e 9.4).'),
      S.avisoSetorial(perm),
      el('p', { class: 'msg msg-info' }, 'Os dados entram no ar ao salvar (vêm do sistema de contabilidade, sem rascunho). A importação de arquivos do sistema contábil será liberada na próxima etapa; até lá, inclua ou corrija aqui.'),
      P.abas([
        ['fin-receitas', 'Previsão e arrecadação', () => receitas(caixa()), null, 'receitas_arrecadacao'],
        ['fin-divida', 'Dívida ativa', () => dividaAtiva(caixa()), null, 'receitas_divida_ativa'],
        ['fin-despesas', 'Empenhos e pagamentos', () => despesas(caixa()), null, 'despesas'],
        ['fin-ordem', 'Ordem cronológica', () => ordemCronologica(caixa()), null, 'ordem_cronologica']
      ])
    ].filter(Boolean));
  };
})();
