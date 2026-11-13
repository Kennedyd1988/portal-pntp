// =====================================================================
// Site público — Receitas (PNTP 3.1 a 3.3), Despesas (4.1 a 4.3), Ordem
// cronológica de pagamentos (9.4), Pessoal (6.1 a 6.5) e Diárias (7.1 e 7.2).
// Cada aba respeita a escolha do órgão no painel: dados do portal, link
// para o sistema externo (Aparência › Destinos das páginas) ou a declaração
// de que não há dados, com a data.
// CPF nunca sai inteiro: o site lê só as colunas públicas (documento
// mascarado); a busca pelo CPF do credor usa o resumo (hash) do número.
// =====================================================================
(function () {
  'use strict';
  const S = window.SITE;
  const { sb, el, dataBR, normalizar } = S;
  const R = S.rotas;
  const U = S.util;
  const T = S.setor;
  const C = window.CLASSIF_PNTP;
  const org = () => S.orgao.id;
  const moeda = (v) => v === null || v === undefined || v === '' ? '—' : U.moedaBR(v);
  const numBR = (v) => v === null || v === undefined ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  const pct = (a, b) => Number(b) ? (100 * Number(a) / Number(b)).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%' : '—';
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const opMeses = Object.fromEntries(MESES.map((m, i) => [String(i + 1).padStart(2, '0'), m[0].toUpperCase() + m.slice(1)]));
  const { td, busca, tabela, etq, novaAba } = T;
  const fimTd = () => el('td', { 'data-rotulo': '' });
  const meta = (t) => t ? el('span', { class: 'meta' }, t) : null;
  const anosRpc = (tabela) => async () => { const { data, error } = await sb.rpc('anos_financeiros', { p_orgao: org(), p_tabela: tabela }); return error ? null : data || []; };
  const cartoes = (pares) => el('div', { class: 'grade', style: 'margin-bottom:16px;grid-template-columns:repeat(auto-fit,minmax(190px,1fr))' },
    pares.map(([rot, val, sub]) => el('div', { class: 'cartao' }, el('span', { class: 'meta' }, rot), el('strong', { style: 'display:block;font-size:1.15em' }, val), sub ? meta(sub) : null)));
  // Data da última atualização de uma tabela (1 linha).
  const ultimaAtualizacao = async (tabela) => {
    const { data } = await sb.from(tabela).select('atualizado_em').eq('orgao_id', org()).order('atualizado_em', { ascending: false }).limit(1);
    return data && data[0] ? data[0].atualizado_em : null;
  };
  const notaAtualizacao = (quando, extra) => el('p', { class: 'meta' }, (quando ? 'Dados atualizados em ' + dataBR(quando) + '. ' : '') + (extra || ''));
  // Resumo (SHA-256) do CPF/CNPJ digitado: o site procura o credor sem poder ler o número.
  const resumos = new Map();
  async function resumoDoc(d) {
    if (!resumos.has(d)) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(d));
      resumos.set(d, [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join(''));
    }
    return resumos.get(d);
  }
  // Busca com CPF: calcula o resumo enquanto a pessoa digita (a lista espera 400 ms antes de buscar).
  const buscaComDoc = (ph) => {
    const e = busca(ph);
    e.addEventListener('input', () => { const d = e.value.replace(/\D/g, ''); if (/^\d{11}$/.test(d) && /^[\d.\s-]+$/.test(e.value.trim())) resumoDoc(d); });
    return e;
  };
  const filtroBusca = (q, v, comResumo) => {
    const d = v.replace(/\D/g, '');
    if (comResumo && /^\d{11}$/.test(d) && /^[\d.\s-]+$/.test(v) && resumos.has(d)) return q.eq('credor_doc_resumo', resumos.get(d));
    return q.ilike('busca', /^[\d.\/\s-]+$/.test(v) ? '%' + d + '%' : U.termo(v));
  };
  // Selecão preenchida depois (opções que dependem do exercício).
  const selecaoTardia = (todos) => el('select', null, el('option', { value: '' }, todos || 'Todos'));
  const preencher = (sel, pares) => { for (const [v, t] of pares) sel.append(el('option', { value: v }, t)); };

  // ===================================================================
  // RECEITAS (3.1 e 3.2): previsão e arrecadação por nível da classificação
  // ===================================================================
  async function receitasArrecadacao(caixa, prm) {
    const [anos, quando] = await Promise.all([anosRpc('receitas')(), ultimaAtualizacao('receitas')]);
    if (!anos) { caixa.replaceChildren(el('p', null, 'Não foi possível carregar. Tente novamente.')); return; }
    if (!anos.length) { caixa.replaceChildren(el('p', { class: 'vazio' }, 'Receitas em atualização.')); return; }
    let ano = anos.some((x) => x.ano === Number(prm.get('ano'))) ? Number(prm.get('ano')) : anos[0].ano;
    let prefixo = /^\d+(\.\d+)*$/.test(prm.get('nivel') || '') ? prm.get('nivel') : null;
    const painelAno = el('div', { class: 'painel-guia painel-guia-interno', role: 'tabpanel' });
    const faixa = U.faixaAbas(anos.map((x) => [x.ano, String(x.ano)]), ano, 'Exercício', true, (id) => { ano = Number(id); prefixo = null; abrirAno(true); });
    caixa.replaceChildren(notaAtualizacao(quando, 'Valores em reais. Previsão: a da Lei Orçamentária (inicial) e a atualizada pelas alterações do ano; arrecadado: a soma dos meses escolhidos.'), faixa.lista, painelAno);
    faixa.marcar(ano);

    async function abrirAno(trocou) {
      const { data: mensal } = await sb.rpc('receitas_mensal', { p_orgao: org(), p_exercicio: ano });
      const meses = (mensal || []).map((m) => m.mes);
      const ultimoMes = meses.length ? Math.max(...meses) : 12;
      const fDe = U.selecao(opMeses, 'Janeiro'), fAte = U.selecao(opMeses, 'Dezembro');
      fDe.firstChild.remove(); fAte.firstChild.remove();
      fDe.value = trocou ? '01' : String(Number(prm.get('de')) || 1).padStart(2, '0');
      fAte.value = trocou ? String(ultimoMes).padStart(2, '0') : String(Number(prm.get('ate')) || ultimoMes).padStart(2, '0');
      const fBusca = busca('Ex.: IPTU, FPM, ICMS, 1.7.1'); fBusca.value = trocou ? '' : prm.get('q') || '';
      const resumo = el('div'), trilhaNivel = el('nav', { class: 'meta', 'aria-label': 'Nível da classificação', style: 'margin:8px 0' }), corpo = el('div'), barra = el('div', { class: 'barra-lista' });
      let linhasAtuais = [];
      const mensalCx = el('details', { class: 'cartao', style: 'margin-top:20px' }, el('summary', { style: 'cursor:pointer;font-weight:600' }, 'Arrecadação mês a mês em ' + ano),
        (mensal || []).length ? tabela('Arrecadação mês a mês', ['Mês', 'Arrecadado no mês', 'Acumulado no ano'], (() => { let acc = 0; return (mensal || []).map((m) => ({ mes: m.mes, v: m.arrecadado, acc: (acc += Number(m.arrecadado)) })); })(),
          (m) => el('tr', null, td('Mês', opMeses[String(m.mes).padStart(2, '0')]), td('Arrecadado no mês', moeda(m.v), 'num'), td('Acumulado no ano', moeda(m.acc), 'num'))) : el('p', { class: 'vazio' }, 'Sem lançamentos.'),
        el('div', { class: 'barra-lista', style: 'margin-top:8px' }, el('span', { class: 'meta' }, 'Todos os lançamentos (natureza, fonte e mês)'),
          S.botoesExportar('receitas-lancamentos-' + ano, [['exercicio', 'Exercício'], ['mes', 'Mês'], ['natureza_codigo', 'Natureza'], ['natureza_descricao', 'Descrição'],
            ['fonte_codigo', 'Fonte'], ['fonte_descricao', 'Fonte (nome)'], ['previsto_inicial', 'Previsão inicial do ano'], ['previsto_atualizado', 'Previsão atualizada do ano'], ['arrecadado', 'Arrecadado no mês']],
          async (de, ate) => { const { data } = await sb.from('receitas').select('exercicio, mes, natureza_codigo, natureza_descricao, fonte_codigo, fonte_descricao, previsto_inicial, previsto_atualizado, arrecadado')
            .eq('orgao_id', org()).eq('exercicio', ano).order('natureza_codigo').order('mes').order('id').range(de, ate); return data || []; })));
      painelAno.replaceChildren(resumo,
        el('form', { class: 'filtros', role: 'search', onsubmit: (e) => { e.preventDefault(); desenhar(); } }, el('label', null, 'De', fDe), el('label', null, 'Até', fAte), el('label', null, 'Pesquisar natureza', fBusca)),
        trilhaNivel, barra, corpo, mensalCx);
      let espera;
      fDe.addEventListener('change', () => desenhar()); fAte.addEventListener('change', () => desenhar());
      fBusca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(desenhar, 400); });

      async function desenhar() {
        let de = Number(fDe.value), ate = Number(fAte.value);
        if (de > ate) { [de, ate] = [ate, de]; fDe.value = String(de).padStart(2, '0'); fAte.value = String(ate).padStart(2, '0'); }
        const q = fBusca.value.trim();
        history.replaceState(null, '', '#/receitas/arrecadacao?ano=' + ano + '&de=' + de + '&ate=' + ate + (prefixo ? '&nivel=' + prefixo : '') + (q ? '&q=' + encodeURIComponent(q) : ''));
        const periodo = de === 1 && ate === 12 ? 'no ano' : de === ate ? 'em ' + MESES[de - 1] : 'de ' + MESES[de - 1] + ' a ' + MESES[ate - 1];
        const [{ data: topo }, { data: linhas, error }] = await Promise.all([
          sb.rpc('receitas_niveis', { p_orgao: org(), p_exercicio: ano, p_mes_ini: de, p_mes_fim: ate }),
          sb.rpc('receitas_niveis', { p_orgao: org(), p_exercicio: ano, p_mes_ini: de, p_mes_fim: ate, p_prefixo: q ? null : prefixo, p_busca: q || null })]);
        if (error) { corpo.replaceChildren(el('p', null, 'Não foi possível carregar. Tente novamente.')); return; }
        const soma = (k) => (topo || []).reduce((t, r) => t + Number(r[k] || 0), 0);
        resumo.replaceChildren(cartoes([['Previsão inicial ' + ano, moeda(soma('previsto_inicial'))], ['Previsão atualizada ' + ano, moeda(soma('previsto_atualizado'))],
          ['Arrecadado ' + periodo, moeda(soma('arrecadado')), pct(soma('arrecadado'), soma('previsto_atualizado')) + ' da previsão atualizada']]));
        // Trilha do nível: Todas › 1 Receitas Correntes › 1.7 …
        const partes = prefixo ? prefixo.split('.') : [];
        const nomes = prefixo ? await Promise.all(partes.map(async (_, i) => {
          const cod = partes.slice(0, i + 1).join('.');
          const { data } = await sb.rpc('receitas_niveis', { p_orgao: org(), p_exercicio: ano, p_mes_ini: de, p_mes_fim: ate, p_prefixo: i ? partes.slice(0, i).join('.') : null });
          return [cod, ((data || []).find((x) => x.codigo === cod) || {}).descricao || ''];
        })) : [];
        const irNivel = (p) => (e) => { e.preventDefault(); prefixo = p; fBusca.value = ''; desenhar(); };
        trilhaNivel.replaceChildren(q ? el('span', null, 'Naturezas que contêm "' + q + '" (nível mais detalhado). ', el('a', { href: '#', onclick: (e) => { e.preventDefault(); fBusca.value = ''; desenhar(); } }, 'Limpar pesquisa'))
          : !nomes.length ? '' : el('span', null, el('a', { href: '#', onclick: irNivel(null) }, 'Todas as categorias'), nomes.map(([c, n], i) => [' › ', i === nomes.length - 1 ? el('strong', null, c + ' ' + n) : el('a', { href: '#', onclick: irNivel(c) }, c + ' ' + n)])));
        linhasAtuais = linhas || [];
        const nivelTxt = q ? 'natureza' : ['categoria econômica', 'origem', 'espécie', 'desdobramento', 'desdobramento', 'desdobramento', 'tipo'][prefixo ? partes.length : 0] || 'nível';
        barra.replaceChildren(el('span', { class: 'meta', role: 'status' }, linhasAtuais.length + ' ' + nivelTxt + (linhasAtuais.length === 1 ? '' : 's') + (q ? '' : '. Clique na descrição para ver o nível seguinte.')),
          S.botoesExportar('receitas-' + ano + (prefixo ? '-' + prefixo : ''), [['codigo', 'Código'], ['descricao', 'Descrição'], ['previsto_inicial', 'Previsão inicial'], ['previsto_atualizado', 'Previsão atualizada'],
            ['arrecadado', 'Arrecadado (' + periodo + ')']], async (d) => d ? [] : linhasAtuais));
        corpo.replaceChildren(linhasAtuais.length ? tabela('Receitas por natureza — ' + ano, ['Código', 'Descrição', 'Previsão inicial', 'Previsão atualizada', 'Arrecadado', '% da previsão'], linhasAtuais, (r) => el('tr', null,
          td('Código', el('span', { style: 'white-space:nowrap' }, r.codigo)),
          td('Descrição', !q && Number(r.filhos) > 0 ? el('a', { href: '#', onclick: irNivel(r.codigo) }, r.descricao || r.codigo) : r.descricao || '—', 'lic-obj'),
          td('Previsão inicial', moeda(r.previsto_inicial), 'num'), td('Previsão atualizada', moeda(r.previsto_atualizado), 'num'), td('Arrecadado', moeda(r.arrecadado), 'num'),
          td('% da previsão', pct(r.arrecadado, r.previsto_atualizado), 'num')))
          : el('p', { class: 'vazio' }, q ? 'Nenhuma natureza com esse texto.' : 'Sem lançamentos neste período.'));
      }
      await desenhar();
    }
    await abrirAno(false);
  }

  function dividaAtiva(caixa, prm) {
    const CAMPOS = 'id, exercicio, nome, documento_publico, ano_inscricao, tributo, valor, atualizado_em';
    return U.listaAnual(caixa, prm, {
      base: '#/receitas/divida-ativa', titulo: 'Inscritos em dívida ativa', rotuloAno: 'Posição em 31/12', nome: 'divida-ativa', unidade: ['inscrito', 'inscritos'],
      vazio: 'Não há inscritos em dívida ativa publicados até esta data.', anos: anosRpc('divida_ativa'), ordem: 'nome', crescente: true,
      montar: (sel, op, ano, f) => {
        let q = sb.from('divida_ativa').select(sel || CAMPOS, op).eq('orgao_id', org());
        if (ano !== 'todos') q = q.eq('exercicio', ano);
        if (f.busca) q = filtroBusca(q, f.busca);
        if (f.ano_inscricao) q = q.eq('ano_inscricao', Number(f.ano_inscricao));
        return q;
      },
      resumo: (ano) => {
        const cx = el('div');
        if (ano !== 'todos') sb.from('divida_ativa').select('valor').eq('orgao_id', org()).eq('exercicio', ano).limit(50000).then(({ data }) => {
          cx.replaceChildren(cartoes([['Total inscrito (posição em 31/12/' + ano + ')', moeda((data || []).reduce((t, r) => t + Number(r.valor), 0)), (data || []).length + ' inscrito(s)']]));
        });
        return cx;
      },
      filtros: (ano) => {
        const fAno = selecaoTardia('Todos');
        let q = sb.from('divida_ativa').select('ano_inscricao').eq('orgao_id', org()).limit(20000);
        if (ano !== 'todos') q = q.eq('exercicio', ano);
        q.then(({ data }) => preencher(fAno, [...new Set((data || []).map((x) => x.ano_inscricao))].sort((a, b) => b - a).map((a) => [String(a), String(a)])));
        return [['busca', 'Pesquisar (nome, CNPJ, origem do débito)', busca('Ex.: nome, 11.222.333/0001-81, IPTU')], ['ano_inscricao', 'Ano da inscrição', fAno]];
      },
      cabecalho: ['Inscrito', 'Origem do débito', 'Inscrição', 'Valor da dívida'],
      colunas: [['nome', 'Nome'], ['documento_publico', 'CPF/CNPJ'], ['tributo', 'Origem do débito'], ['ano_inscricao', 'Ano da inscrição'], ['valor', 'Valor'], ['exercicio', 'Posição em 31/12 de']],
      linha: (r) => el('tr', null, td('Inscrito', [el('strong', null, r.nome), meta(r.documento_publico)], 'lic-obj'), td('Origem do débito', r.tributo || '—'),
        td('Inscrição', String(r.ano_inscricao), 'num'), td('Valor da dívida', moeda(r.valor), 'num'), fimTd())
    });
  }

  R.receitas = function (main, partes, params) {
    const abas = [['arrecadacao', 'Previsão e arrecadação', 'Receita prevista e arrecadada por natureza (categoria econômica, origem, espécie e desdobramentos), com o código e a descrição de cada nível.',
      (c, prm) => T.comSecao(c, 'receitas_arrecadacao', '', () => receitasArrecadacao(c, prm))]];
    if (S.orgao.tipo === 'prefeitura') abas.push(['divida-ativa', 'Dívida ativa', 'Relação dos inscritos em dívida ativa, com o valor total da dívida.',
      (c, prm) => T.comSecao(c, 'receitas_divida_ativa', 'Não há créditos inscritos em dívida ativa no município.', () => dividaAtiva(c, prm))]);
    return T.paginaAbas(main, { rota: 'receitas', titulo: 'Receitas', sub: 'Quanto o órgão previu arrecadar e quanto arrecadou, mês a mês, por natureza da receita' + (abas.length > 1 ? ', e os inscritos em dívida ativa.' : '.'), abas }, partes, params);
  };

  // ===================================================================
  // DESPESAS (4.1 a 4.3)
  // ===================================================================
  const TIPO_EMP = { ordinario: 'Ordinário', estimativo: 'Estimativo', global: 'Global' };
  const TIPO_MOV = { liquidacao: 'Liquidação', pagamento: 'Pagamento', reforco: 'Reforço do empenho', anulacao: 'Anulação do empenho',
    estorno_liquidacao: 'Estorno de liquidação', estorno_pagamento: 'Estorno de pagamento' };
  const CAMPOS_DESP = 'id, numero, data_empenho, exercicio, tipo_empenho, unidade_codigo, unidade_nome, funcao_codigo, subfuncao_codigo, subfuncao_nome, programa_codigo, programa_nome, ' +
    'acao_codigo, acao_nome, natureza_codigo, natureza_nome, categoria, grupo, modalidade_aplicacao, elemento, fonte_codigo, fonte_nome, credor_nome, credor_doc_publico, objeto, ' +
    'modalidade, licitacao_numero, licitacao_id, contrato_id, processo, valor_empenhado, total_empenhado, total_liquidado, total_pago, ultima_movimentacao, atualizado_em';
  const procedimento = (d) => d.modalidade === 'nao_se_aplica' ? 'Não se aplica' : d.modalidade ? (C.contratacao[d.modalidade] || d.modalidade) + (d.licitacao_numero ? ' nº ' + d.licitacao_numero : '') : '—';
  const COLUNAS_DESP = [['numero', 'Empenho'], ['data_empenho', 'Data'], ['tipo_empenho', 'Tipo', (v) => TIPO_EMP[v]], ['unidade_codigo', 'Unidade (código)'], ['unidade_nome', 'Unidade'],
    ['funcao_codigo', 'Função'], ['funcao_codigo', 'Função (nome)', (v) => C.funcoes[v] || ''], ['subfuncao_codigo', 'Subfunção'], ['subfuncao_nome', 'Subfunção (nome)'],
    ['programa_codigo', 'Programa'], ['programa_nome', 'Programa (nome)'], ['acao_codigo', 'Ação'], ['acao_nome', 'Ação (nome)'], ['natureza_codigo', 'Natureza da despesa'],
    ['natureza_nome', 'Elemento (nome)'], ['fonte_codigo', 'Fonte'], ['fonte_nome', 'Fonte (nome)'], ['credor_nome', 'Credor'], ['credor_doc_publico', 'CPF/CNPJ'], ['objeto', 'Objeto'],
    ['modalidade', 'Procedimento', (v) => C.contratacao[v] || ''], ['licitacao_numero', 'Número do procedimento'], ['processo', 'Processo'],
    ['total_empenhado', 'Empenhado'], ['total_liquidado', 'Liquidado'], ['total_pago', 'Pago'], ['ultima_movimentacao', 'Último movimento']];

  async function empenhos(caixa, prm) {
    const quando = await ultimaAtualizacao('despesas');
    const nota = notaAtualizacao(quando, 'Empenhado: valor reservado no orçamento (com reforços e anulações); liquidado: bem ou serviço entregue e conferido; pago: valor pago ao credor.');
    const lista = el('div');
    caixa.replaceChildren(nota, lista);
    return U.listaAnual(lista, prm, {
      base: '#/despesas/empenhos', abrirRecente: true, titulo: 'Empenhos, liquidações e pagamentos', rotuloAno: 'Exercício', nome: 'despesas-empenhos', unidade: ['empenho', 'empenhos'],
      vazio: 'Despesas em atualização.', anos: anosRpc('despesas'), ordem: 'data_empenho', crescente: false,
      montar: (sel, op, ano, f) => {
        let q = sb.from('despesas').select(sel || CAMPOS_DESP, op).eq('orgao_id', org());
        if (ano !== 'todos') q = q.eq('exercicio', ano);
        if (f.busca) q = filtroBusca(q, f.busca, true);
        for (const k of ['funcao_codigo', 'elemento', 'fonte_codigo', 'modalidade']) if (f[k]) q = q.eq(k, f[k]);
        if (f.unidade) q = q.or('unidade_codigo.eq."' + f.unidade.replace(/"/g, '') + '",unidade_nome.eq."' + f.unidade.replace(/"/g, '') + '"');
        if (f.mes && ano !== 'todos') { const m = Number(f.mes); q = q.gte('data_empenho', ano + '-' + f.mes + '-01').lt('data_empenho', m === 12 ? (ano + 1) + '-01-01' : ano + '-' + String(m + 1).padStart(2, '0') + '-01'); }
        return q;
      },
      resumo: (ano) => {
        const cx = el('div');
        if (ano !== 'todos') sb.rpc('despesas_resumo', { p_orgao: org(), p_exercicio: ano }).then(({ data }) => {
          const t = (data || [])[0] || {};
          cx.replaceChildren(cartoes([['Empenhado em ' + ano, moeda(t.empenhado || 0), (t.empenhos || 0) + ' empenho(s)'], ['Liquidado em ' + ano, moeda(t.liquidado || 0), pct(t.liquidado, t.empenhado) + ' do empenhado'],
            ['Pago em ' + ano, moeda(t.pago || 0), pct(t.pago, t.empenhado) + ' do empenhado']]));
        });
        return cx;
      },
      filtros: (ano) => {
        const fUn = selecaoTardia('Todas'), fFun = selecaoTardia('Todas'), fEl = selecaoTardia('Todos'), fFon = selecaoTardia('Todas');
        if (ano !== 'todos') sb.rpc('despesas_opcoes', { p_orgao: org(), p_exercicio: ano }).then(({ data }) => {
          const de = (c) => (data || []).filter((x) => x.campo === c);
          preencher(fUn, de('unidade').map((x) => [x.codigo, (x.nome && x.nome !== x.codigo ? x.codigo + ' · ' + x.nome : x.codigo)]));
          preencher(fFun, de('funcao').map((x) => [x.codigo, x.codigo + ' · ' + (C.funcoes[x.codigo] || '')]));
          preencher(fEl, de('elemento').map((x) => [x.codigo, x.codigo + (x.nome ? ' · ' + x.nome : '')]));
          preencher(fFon, de('fonte').map((x) => [x.codigo, x.codigo + (x.nome ? ' · ' + x.nome : '')]));
        });
        const campos = [['busca', 'Pesquisar (credor, CPF/CNPJ, objeto, nº do empenho ou processo)', buscaComDoc('Ex.: nome da empresa, 11.222.333/0001-81, material')],
          ['unidade', 'Unidade orçamentária', fUn], ['funcao_codigo', 'Função', fFun], ['elemento', 'Elemento de despesa', fEl], ['fonte_codigo', 'Fonte de recursos', fFon],
          ['modalidade', 'Procedimento de origem', U.selecao(C.contratacao)]];
        if (ano !== 'todos') campos.splice(1, 0, ['mes', 'Mês do empenho', U.selecao(opMeses, 'Todos')]);
        return campos;
      },
      cabecalho: ['Empenho', 'Credor e objeto', 'Classificação', 'Empenhado', 'Liquidado', 'Pago'],
      colunas: COLUNAS_DESP,
      linha: (d) => el('tr', null,
        td('Empenho', [el('a', { href: '#/despesa/' + d.id }, el('strong', null, d.numero)), meta(dataBR(d.data_empenho)), meta(TIPO_EMP[d.tipo_empenho])], 'num'),
        td('Credor e objeto', [el('strong', null, d.credor_nome), meta(d.credor_doc_publico), el('span', { style: 'display:block;margin-top:2px' }, d.objeto), meta(procedimento(d))], 'lic-obj'),
        td('Classificação', [d.unidade_nome || d.unidade_codigo || '—', meta([d.natureza_codigo, d.natureza_nome].filter(Boolean).join(' · ')), meta(d.fonte_codigo ? 'Fonte ' + d.fonte_codigo + (d.fonte_nome ? ' · ' + d.fonte_nome : '') : null)]),
        td('Empenhado', moeda(d.total_empenhado), 'num'), td('Liquidado', moeda(d.total_liquidado), 'num'), td('Pago', moeda(d.total_pago), 'num'),
        el('td', { 'data-rotulo': '' }, el('a', { href: '#/despesa/' + d.id }, 'Detalhes', el('span', { class: 'sr' }, ' do empenho ' + d.numero))))
    });
  }

  // 4.2: totais por qualquer classificação, no período escolhido.
  const AGRUPAR = { funcao: 'Função', subfuncao: 'Subfunção', programa: 'Programa', acao: 'Ação (projeto/atividade)', unidade: 'Unidade orçamentária', categoria: 'Categoria econômica',
    grupo: 'Grupo de natureza', modalidade: 'Modalidade de aplicação', elemento: 'Elemento de despesa', fonte: 'Fonte de recursos', credor: 'Credor', mes: 'Mês' };
  const codigoClassif = (ag, c) => ag === 'grupo' ? c.split('').join('.') : ag === 'modalidade' ? c.slice(0, 1) + '.' + c.slice(1, 2) + '.' + c.slice(2) : ag === 'elemento' ? c.slice(0, 1) + '.' + c.slice(1, 2) + '.' + c.slice(2, 4) + '.' + c.slice(4) : c;
  const nomeClassif = (ag, r) => ag === 'funcao' ? C.funcoes[r.chave] : ag === 'categoria' ? C.categorias[r.chave] : ag === 'grupo' ? C.grupos[r.chave] : ag === 'modalidade' ? C.modalidades[r.chave.slice(2)]
    : ag === 'mes' ? opMeses[r.chave] : r.descricao;
  async function classificacao(caixa, prm) {
    const anos = await anosRpc('despesas')();
    if (!anos) { caixa.replaceChildren(el('p', null, 'Não foi possível carregar. Tente novamente.')); return; }
    if (!anos.length) { caixa.replaceChildren(el('p', { class: 'vazio' }, 'Despesas em atualização.')); return; }
    let ano = anos.some((x) => x.ano === Number(prm.get('ano'))) ? Number(prm.get('ano')) : anos[0].ano;
    const fAg = el('select', null, Object.entries(AGRUPAR).map(([k, v]) => el('option', { value: k }, v)));
    fAg.value = AGRUPAR[prm.get('por')] ? prm.get('por') : 'funcao';
    const fDe = el('input', { type: 'date', value: prm.get('de') || '' }), fAte = el('input', { type: 'date', value: prm.get('ate') || '' });
    const resumo = el('div'), barra = el('div', { class: 'barra-lista' }), corpo = el('div');
    const painelAno = el('div', { class: 'painel-guia painel-guia-interno', role: 'tabpanel' },
      el('form', { class: 'filtros', role: 'search', onsubmit: (e) => { e.preventDefault(); desenhar(); } },
        el('label', null, 'Agrupar por', fAg), el('label', null, 'De (data)', fDe), el('label', null, 'Até (data)', fAte)), resumo, barra, corpo);
    const faixa = U.faixaAbas(anos.map((x) => [x.ano, String(x.ano)]), ano, 'Exercício', true, (id) => { ano = Number(id); fDe.value = ''; fAte.value = ''; desenhar(); });
    caixa.replaceChildren(el('p', { class: 'meta' }, 'Empenhado, liquidado e pago no período, somados pela classificação escolhida. Sem datas, vale o exercício inteiro.'), faixa.lista, painelAno);
    faixa.marcar(ano);
    [fAg, fDe, fAte].forEach((x) => x.addEventListener('change', desenhar));
    async function desenhar() {
      const ag = fAg.value, de = fDe.value || null, ate = fAte.value || null;
      history.replaceState(null, '', '#/despesas/classificacao?ano=' + ano + '&por=' + ag + (de ? '&de=' + de : '') + (ate ? '&ate=' + ate : ''));
      const { data, error } = await sb.rpc('despesas_resumo', { p_orgao: org(), p_exercicio: ano, p_de: de, p_ate: ate, p_agrupar: ag });
      if (error) { corpo.replaceChildren(el('p', null, 'Não foi possível carregar. Tente novamente.')); return; }
      const linhas = (data || []).map((r) => Object.assign({}, r, { codigo: ag === 'credor' ? '' : codigoClassif(ag, r.chave || ''), nome: ag === 'credor' ? r.chave : nomeClassif(ag, r) || '' }))
        .sort((a, b) => ag === 'credor' ? Number(b.empenhado) - Number(a.empenhado) : 0);
      const s = (k) => linhas.reduce((t, r) => t + Number(r[k] || 0), 0);
      const periodo = de || ate ? (dataBR(de) || '01/01/' + ano) + ' a ' + (dataBR(ate) || '31/12/' + ano) : ano;
      resumo.replaceChildren(cartoes([['Empenhado (' + periodo + ')', moeda(s('empenhado'))], ['Liquidado', moeda(s('liquidado')), pct(s('liquidado'), s('empenhado')) + ' do empenhado'], ['Pago', moeda(s('pago')), pct(s('pago'), s('empenhado')) + ' do empenhado']]));
      barra.replaceChildren(el('span', { class: 'meta', role: 'status' }, linhas.length + ' linha(s) por ' + AGRUPAR[ag].toLowerCase()),
        S.botoesExportar('despesas-por-' + ag + '-' + ano, [['codigo', 'Código'], ['nome', AGRUPAR[ag]], ['empenhado', 'Empenhado'], ['liquidado', 'Liquidado'], ['pago', 'Pago'], ['empenhos', 'Empenhos']], async (x) => x ? [] : linhas));
      corpo.replaceChildren(linhas.length ? tabela('Despesas por ' + AGRUPAR[ag].toLowerCase() + ' — ' + periodo, [AGRUPAR[ag], 'Empenhado', 'Liquidado', 'Pago', 'Empenhos'], linhas, (r) => el('tr', null,
        td(AGRUPAR[ag], [r.codigo ? el('strong', null, r.codigo + ' ') : '', r.nome || (r.codigo ? '' : 'Não informado')], 'lic-obj'),
        td('Empenhado', moeda(r.empenhado), 'num'), td('Liquidado', moeda(r.liquidado), 'num'), td('Pago', moeda(r.pago), 'num'), td('Empenhos', String(r.empenhos), 'num')))
        : el('p', { class: 'vazio' }, 'Nenhuma despesa no período.'));
    }
    await desenhar();
  }

  R.despesas = function (main, partes, params) {
    return T.paginaAbas(main, { rota: 'despesas', titulo: 'Despesas', sub: 'Empenhos, liquidações e pagamentos com o credor, o bem ou serviço, a classificação orçamentária e o procedimento de origem (licitação, dispensa ou inexigibilidade).',
      abas: [
        ['empenhos', 'Empenhos e pagamentos', 'Cada empenho com o credor, o objeto, o procedimento de origem e os valores empenhado, liquidado e pago.',
          (c, prm) => T.comSecao(c, 'despesas_empenhos', '', () => empenhos(c, prm))],
        ['classificacao', 'Por classificação', 'Totais por função, programa, ação, unidade, natureza, fonte de recursos, credor ou mês, no período escolhido.',
          (c, prm) => T.comSecao(c, 'despesas_empenhos', '', () => classificacao(c, prm))]
      ] }, partes, params);
  };

  R.despesa = async function (main, partes) {
    const id = partes[0];
    if (!/^[0-9a-f-]{36}$/i.test(id || '')) return R['*'](main);
    const [{ data: d }, { data: movs }] = await Promise.all([sb.from('despesas').select(CAMPOS_DESP).eq('orgao_id', org()).eq('id', id).maybeSingle(),
      sb.from('despesas_movimentos').select('tipo, data, valor, documento, observacao').eq('despesa_id', id).order('data').order('criado_em').limit(2000)]);
    if (!d) return R['*'](main);
    S.titulo('Empenho ' + d.numero); S.trilha(['Transparência', '#/transparencia'], ['Despesas', '#/despesas/empenhos?ano=' + d.exercicio], ['Empenho ' + d.numero]);
    const linha = (rot, val) => val ? el('div', null, el('dt', null, rot), el('dd', null, val)) : null;
    const cod = (c, n) => c || n ? [c ? el('strong', null, c + ' ') : '', n || ''] : null;
    const proc = d.licitacao_id ? el('a', { href: '#/licitacao/' + d.licitacao_id }, procedimento(d)) : procedimento(d);
    U.pagina(main, el('p', { class: 'meta' }, 'Empenho ' + TIPO_EMP[d.tipo_empenho].toLowerCase() + ' · ' + dataBR(d.data_empenho)), el('h1', null, 'Empenho nº ' + d.numero),
      cartoes([['Empenhado', moeda(d.total_empenhado), d.total_empenhado !== d.valor_empenhado ? 'Valor original: ' + moeda(d.valor_empenhado) : null], ['Liquidado', moeda(d.total_liquidado)], ['Pago', moeda(d.total_pago)]]),
      el('section', { class: 'cartao' }, el('h2', { style: 'margin-top:0' }, 'Credor e objeto'),
        el('dl', { class: 'ficha-lic' }, linha('Credor', d.credor_nome), linha('CPF/CNPJ', d.credor_doc_publico), linha('Bem ou serviço', d.objeto),
          linha('Procedimento de origem', proc), linha('Processo', d.processo), linha('Contrato', d.contrato_id ? el('a', { href: '#/contrato/' + d.contrato_id }, 'Ver o contrato') : null))),
      el('section', { class: 'cartao', style: 'margin-top:16px' }, el('h2', { style: 'margin-top:0' }, 'Classificação orçamentária'),
        el('dl', { class: 'ficha-lic' }, linha('Unidade orçamentária', cod(d.unidade_codigo, d.unidade_nome)), linha('Função', cod(d.funcao_codigo, C.funcoes[d.funcao_codigo])),
          linha('Subfunção', cod(d.subfuncao_codigo, d.subfuncao_nome)), linha('Programa', cod(d.programa_codigo, d.programa_nome)), linha('Ação', cod(d.acao_codigo, d.acao_nome)),
          linha('Categoria econômica', cod(d.categoria, C.categorias[d.categoria])), linha('Grupo de natureza', cod(d.grupo ? d.grupo.split('').join('.') : null, C.grupos[d.grupo])),
          linha('Modalidade de aplicação', cod(d.modalidade_aplicacao, C.modalidades[d.modalidade_aplicacao])), linha('Natureza da despesa', cod(d.natureza_codigo, d.natureza_nome)),
          linha('Fonte de recursos', cod(d.fonte_codigo, d.fonte_nome)))),
      el('section', { style: 'margin-top:24px' }, el('div', { class: 'secao-titulo' }, el('h2', { style: 'margin:0' }, 'Liquidações e pagamentos'),
        S.botoesExportar('empenho-' + d.numero.replace(/\W+/g, '-'), [['data', 'Data'], ['tipo', 'Movimento', (v) => TIPO_MOV[v]], ['documento', 'Documento'], ['valor', 'Valor'], ['observacao', 'Observação']], async (x) => x ? [] : movs || [])),
        (movs || []).length ? tabela('Movimentos do empenho', ['Data', 'Movimento', 'Documento', 'Valor'], movs, (m) => el('tr', null,
          td('Data', dataBR(m.data), 'num'), td('Movimento', [TIPO_MOV[m.tipo], meta(m.observacao)]), td('Documento', m.documento || '—'), td('Valor', moeda(m.valor), 'num')))
          : el('p', { class: 'vazio' }, 'Ainda sem liquidação ou pagamento.')),
      el('p', { class: 'meta', style: 'margin-top:16px' }, 'Informações atualizadas em ' + dataBR(d.atualizado_em) + '.'));
  };

  // ===================================================================
  // ORDEM CRONOLÓGICA DE PAGAMENTOS (9.4)
  // ===================================================================
  R['ordem-cronologica'] = async function (main, partes, params) {
    S.titulo('Ordem cronológica de pagamentos'); S.trilha(['Transparência', '#/transparencia'], ['Ordem cronológica de pagamentos']);
    const caixa = el('div', null, el('p', { class: 'carregando' }, 'Carregando…'));
    U.pagina(main, el('h1', null, 'Ordem cronológica de pagamentos'),
      el('p', { class: 'sub' }, 'Pela Lei 14.133/2021 (art. 141), os pagamentos de contratos seguem a ordem em que os créditos ficaram exigíveis, numa fila para cada fonte de recursos, separada por categoria: fornecimento de bens, locações, prestação de serviços e obras. A ordem só pode ser alterada nas hipóteses da lei, com justificativa publicada.'),
      caixa);
    const CAMPOS = 'id, posicao, categoria, fonte_codigo, fonte_nome, credor_nome, credor_doc_publico, documento_fiscal, empenho_numero, despesa_id, contrato_numero, contrato_id, objeto, data_exigibilidade, exercicio, data_pagamento, valor, fora_da_ordem, motivo_alteracao, justificativa, ato_justificativa, justificativa_url, atualizado_em';
    await T.comSecao(caixa, 'ordem_cronologica', 'Não há pagamentos de contratos sujeitos à ordem cronológica (art. 141 da Lei 14.133/2021) no período.', async () => {
      const quando = await ultimaAtualizacao('ordem_cronologica');
      const lista = el('div');
      caixa.replaceChildren(notaAtualizacao(quando, 'A posição é a do crédito na fila da sua categoria e fonte de recursos, pela data em que ficou exigível.'), lista);
      return U.listaAnual(lista, params, {
        base: '#/ordem-cronologica', abrirRecente: true, titulo: 'Ordem cronológica de pagamentos', rotuloAno: 'Exercício', nome: 'ordem-cronologica-pagamentos', unidade: ['crédito', 'créditos'],
        vazio: 'Ordem cronológica em atualização.', anos: anosRpc('ordem_cronologica'), ordem: 'data_exigibilidade', crescente: true,
        montar: (sel, op, ano, f) => {
          let q = sb.from('ordem_cronologica_posicoes').select(sel || CAMPOS, op).eq('orgao_id', org());
          if (ano !== 'todos') q = q.eq('exercicio', ano);
          if (f.busca) q = filtroBusca(q, f.busca);
          if (f.categoria) q = q.eq('categoria', f.categoria);
          if (f.fonte) q = q.eq('fonte_codigo', f.fonte);
          if (f.situacao === 'a_pagar') q = q.is('data_pagamento', null);
          if (f.situacao === 'pago') q = q.not('data_pagamento', 'is', null);
          if (f.situacao === 'fora') q = q.eq('fora_da_ordem', true);
          return q;
        },
        filtros: (ano) => {
          const fFon = selecaoTardia('Todas');
          let q = sb.from('ordem_cronologica').select('fonte_codigo, fonte_nome').eq('orgao_id', org()).not('fonte_codigo', 'is', null).limit(5000);
          if (ano !== 'todos') q = q.eq('exercicio', ano);
          q.then(({ data }) => { const m = new Map(); for (const x of data || []) if (!m.has(x.fonte_codigo)) m.set(x.fonte_codigo, x.fonte_nome); preencher(fFon, [...m].sort().map(([c, n]) => [c, c + (n ? ' · ' + n : '')])); });
          return [['busca', 'Pesquisar (credor, nota fiscal, empenho, contrato)', busca('Ex.: nome da empresa, NF 1234')], ['categoria', 'Categoria', U.selecao(C.categoriasOC, 'Todas')],
            ['fonte', 'Fonte de recursos', fFon], ['situacao', 'Situação', U.selecao({ a_pagar: 'A pagar', pago: 'Pagos', fora: 'Pagos fora da ordem (com justificativa)' })]];
        },
        cabecalho: ['Posição', 'Credor e documento', 'Categoria e fonte', 'Exigível desde', 'Pagamento', 'Valor'],
        colunas: [['posicao', 'Posição na fila'], ['categoria', 'Categoria', (v) => C.categoriasOC[v]], ['fonte_codigo', 'Fonte'], ['fonte_nome', 'Fonte (nome)'], ['credor_nome', 'Credor'],
          ['credor_doc_publico', 'CPF/CNPJ'], ['documento_fiscal', 'Documento de cobrança'], ['empenho_numero', 'Empenho'], ['contrato_numero', 'Contrato'], ['objeto', 'Objeto'],
          ['data_exigibilidade', 'Exigível desde'], ['data_pagamento', 'Pago em'], ['valor', 'Valor'], ['fora_da_ordem', 'Fora da ordem', (v) => v ? 'Sim' : 'Não'],
          ['motivo_alteracao', 'Hipótese legal', (v) => C.motivosOC[v] || ''], ['justificativa', 'Justificativa'], ['ato_justificativa', 'Ato'], ['justificativa_url', 'Link do ato']],
        linha: (o) => el('tr', null, td('Posição', o.posicao + 'º', 'num'),
          td('Credor e documento', [el('strong', null, o.credor_nome), meta(o.credor_doc_publico), meta([o.documento_fiscal, o.empenho_numero && (o.despesa_id ? null : 'empenho ' + o.empenho_numero), o.contrato_numero && 'contrato ' + o.contrato_numero].filter(Boolean).join(' · ')),
            o.despesa_id ? el('span', { class: 'meta' }, el('a', { href: '#/despesa/' + o.despesa_id }, 'Empenho ' + (o.empenho_numero || ''))) : null,
            o.fora_da_ordem ? el('div', { class: 'cartao', style: 'margin-top:6px;padding:8px 10px' }, el('strong', null, 'Pago fora da ordem: '), C.motivosOC[o.motivo_alteracao] || '',
              o.justificativa ? el('span', { style: 'display:block;white-space:pre-line;margin-top:4px' }, o.justificativa) : null,
              o.ato_justificativa ? el('span', { class: 'meta' }, o.justificativa_url ? el('a', { href: o.justificativa_url, target: '_blank', rel: 'noopener' }, o.ato_justificativa, novaAba()) : o.ato_justificativa) : null) : null], 'lic-obj'),
          td('Categoria e fonte', [C.categoriasOC[o.categoria], meta(o.fonte_codigo ? 'Fonte ' + o.fonte_codigo + (o.fonte_nome ? ' · ' + o.fonte_nome : '') : null)]),
          td('Exigível desde', dataBR(o.data_exigibilidade), 'num'),
          td('Pagamento', o.data_pagamento ? [dataBR(o.data_pagamento), o.fora_da_ordem ? etq(['Fora da ordem', 'etiqueta-ambar']) : null] : etq(['A pagar', 'etiqueta-ambar']), 'num'),
          td('Valor', moeda(o.valor), 'num'), fimTd())
      });
    });
  };

  // ===================================================================
  // PESSOAL (6.1 a 6.5)
  // ===================================================================
  const VINCULOS = { efetivo: 'Efetivo', comissionado: 'Comissionado', temporario: 'Contratado temporário', eletivo: 'Agente político', celetista: 'Empregado (CLT)',
    cedido: 'Cedido', requisitado: 'Requisitado', aposentado: 'Aposentado', pensionista: 'Pensionista', outro: 'Outro' };
  const DESLIG = { exoneracao: 'Exoneração', demissao: 'Demissão', aposentadoria: 'Aposentadoria', falecimento: 'Falecimento', fim_contrato: 'Fim do contrato', fim_mandato: 'Fim do mandato', outro: 'Outro' };
  const FOLHAS = { mensal: 'Mensal', decimo_terceiro: '13º salário', ferias: 'Férias', rescisao: 'Rescisão', complementar: 'Complementar', adiantamento: 'Adiantamento' };
  const TIPOS_CARGO = { efetivo: 'Cargo efetivo', comissao: 'Cargo em comissão', funcao_gratificada: 'Função gratificada', temporario: 'Contrato temporário', eletivo: 'Subsídio (agente político)', outro: 'Outro' };
  const NIVEIS = { medio: 'Ensino médio', tecnico: 'Técnico', superior: 'Superior', pos: 'Pós-graduação' };

  function servidores(caixa, prm) {
    const CAMPOS = 'id, matricula, nome, cargo, funcao, vinculo, lotacao, carga_horaria, data_admissao, data_desligamento, motivo_desligamento, atualizado_em';
    const hoje = new Date().toISOString().slice(0, 10);
    return U.listaAnual(caixa, prm, {
      base: '#/pessoal/servidores', titulo: 'Servidores e agentes públicos', rotuloAno: 'No quadro em', nome: 'servidores', unidade: ['pessoa', 'pessoas'],
      vazio: 'Relação de servidores em atualização.', anos: anosRpc('pessoal_vinculos'), ordem: 'nome', crescente: true,
      montar: (sel, op, ano, f) => {
        let q = sb.from('pessoal_vinculos').select(sel || CAMPOS, op).eq('orgao_id', org());
        if (ano !== 'todos') q = q.lte('data_admissao', ano + '-12-31').or('data_desligamento.is.null,data_desligamento.gte.' + ano + '-01-01');
        if (f.busca) q = q.ilike('busca', U.termo(f.busca));
        if (f.vinculo) q = q.eq('vinculo', f.vinculo);
        if (f.situacao === 'ativos') q = q.or('data_desligamento.is.null,data_desligamento.gte.' + hoje);
        if (f.situacao === 'desligados') q = q.lt('data_desligamento', hoje);
        return q;
      },
      filtros: () => [['busca', 'Pesquisar (nome, matrícula, cargo, função ou lotação)', busca('Ex.: professor, Secretaria de Saúde')], ['vinculo', 'Vínculo', U.selecao(VINCULOS)],
        ['situacao', 'Situação hoje', U.selecao({ ativos: 'No quadro', desligados: 'Desligados' })]],
      cabecalho: ['Nome', 'Cargo e função', 'Vínculo', 'Lotação e carga horária', 'Admissão', 'Desligamento'],
      colunas: [['nome', 'Nome'], ['matricula', 'Matrícula'], ['cargo', 'Cargo'], ['funcao', 'Função'], ['vinculo', 'Vínculo', (v) => VINCULOS[v]], ['lotacao', 'Lotação'],
        ['carga_horaria', 'Carga horária'], ['data_admissao', 'Admissão'], ['data_desligamento', 'Desligamento'], ['motivo_desligamento', 'Motivo do desligamento', (v) => DESLIG[v] || '']],
      linha: (v) => el('tr', null, td('Nome', [el('strong', null, v.nome), meta(v.matricula ? 'Matrícula ' + v.matricula : null)], 'lic-obj'), td('Cargo e função', [v.cargo, meta(v.funcao)]),
        td('Vínculo', VINCULOS[v.vinculo]), td('Lotação e carga horária', [v.lotacao || '—', meta(v.carga_horaria)]), td('Admissão', dataBR(v.data_admissao), 'num'),
        td('Desligamento', v.data_desligamento ? [dataBR(v.data_desligamento), meta(DESLIG[v.motivo_desligamento])] : '—', 'num'), fimTd())
    });
  }

  async function remuneracao(caixa, prm) {
    const CAMPOS = 'id, exercicio, mes, folha, matricula, nome, cargo, vinculo, lotacao, remuneracao_basica, vantagens, eventuais, indenizacoes, bruto, descontos, liquido, atualizado_em';
    const { data: ult } = await sb.from('pessoal_remuneracoes').select('exercicio, mes').eq('orgao_id', org()).order('exercicio', { ascending: false }).order('mes', { ascending: false }).limit(1);
    const u = (ult || [])[0];
    const lista = el('div');
    caixa.replaceChildren(el('p', { class: 'meta' }, (u ? 'Última folha publicada: ' + MESES[u.mes - 1] + ' de ' + u.exercicio + '. ' : '') + 'Bruto = remuneração básica + vantagens + eventuais + indenizações; líquido = bruto − descontos obrigatórios.'), lista);
    return U.listaAnual(lista, prm, {
      base: '#/pessoal/remuneracao', abrirRecente: true, titulo: 'Remuneração nominal', rotuloAno: 'Ano', nome: 'remuneracao', unidade: ['remuneração', 'remunerações'],
      vazio: 'Folha de pagamento em atualização.', anos: anosRpc('pessoal_remuneracoes'), ordem: 'nome', crescente: true,
      montar: (sel, op, ano, f) => {
        let q = sb.from('pessoal_remuneracoes').select(sel || CAMPOS, op).eq('orgao_id', org());
        if (ano !== 'todos') q = q.eq('exercicio', ano);
        if (f.mes) q = q.eq('mes', Number(f.mes));
        if (f.folha) q = q.eq('folha', f.folha);
        if (f.vinculo) q = q.eq('vinculo', f.vinculo);
        if (f.busca) q = q.ilike('busca', U.termo(f.busca));
        return q;
      },
      filtros: (ano) => {
        const fMes = U.selecao(opMeses, 'Todos');
        if (ano !== 'todos') fMes.value = u && ano === u.exercicio ? String(u.mes).padStart(2, '0') : '12';
        if (prm.get('mes') && ano === Number(prm.get('ano'))) fMes.value = String(Number(prm.get('mes'))).padStart(2, '0');
        return [['mes', 'Mês', fMes], ['busca', 'Pesquisar (nome, matrícula, cargo ou lotação)', busca('Ex.: nome, professor')], ['vinculo', 'Vínculo', U.selecao(VINCULOS)], ['folha', 'Folha', U.selecao(FOLHAS, 'Todas')]];
      },
      cabecalho: ['Nome', 'Cargo e lotação', 'Mês', 'Bruto', 'Descontos', 'Líquido'],
      colunas: [['exercicio', 'Ano'], ['mes', 'Mês'], ['folha', 'Folha', (v) => FOLHAS[v]], ['nome', 'Nome'], ['matricula', 'Matrícula'], ['cargo', 'Cargo'], ['vinculo', 'Vínculo', (v) => VINCULOS[v] || ''],
        ['lotacao', 'Lotação'], ['remuneracao_basica', 'Remuneração básica'], ['vantagens', 'Vantagens'], ['eventuais', 'Eventuais'], ['indenizacoes', 'Indenizações'], ['bruto', 'Bruto'],
        ['descontos', 'Descontos'], ['liquido', 'Líquido']],
      linha: (r) => el('tr', null, td('Nome', [el('strong', null, r.nome), meta(r.matricula ? 'Matrícula ' + r.matricula : null)], 'lic-obj'),
        td('Cargo e lotação', [r.cargo, meta([VINCULOS[r.vinculo], r.lotacao].filter(Boolean).join(' · '))]),
        td('Mês', [MESES[r.mes - 1].slice(0, 3) + '/' + r.exercicio, meta(r.folha !== 'mensal' ? FOLHAS[r.folha] : null)], 'num'),
        td('Bruto', [moeda(r.bruto), meta([['Básica', r.remuneracao_basica], ['Vantagens', r.vantagens], ['Eventuais', r.eventuais], ['Indenizações', r.indenizacoes]]
          .filter((x) => Number(x[1])).map((x) => x[0] + ' ' + moeda(x[1])).join(' · '))], 'num'),
        td('Descontos', moeda(r.descontos), 'num'), td('Líquido', moeda(r.liquido), 'num'), fimTd())
    });
  }

  // PNTP 6.3 e 7.2: tabela com mais de um ano precisa dizer que é a vigente no exercício atual.
  const avisoVigente = (lista, oque) => {
    const hoje = new Date().toISOString().slice(0, 10);
    return lista.some((x) => !x.vigencia_fim || x.vigencia_fim >= hoje) ? el('p', { class: 'meta' }, oque + ' vigente para o exercício de ' + hoje.slice(0, 4) + '.') : '';
  };
  async function cargos(caixa, s) {
    const { data } = await sb.from('pessoal_cargos').select('cargo, tipo, referencia, carga_horaria, vencimento, norma, norma_url, vigencia_inicio, vigencia_fim, ordem, atualizado_em')
      .eq('orgao_id', org()).order('ordem').order('cargo').limit(3000);
    const lista = data || [];
    const quando = lista.map((x) => x.atualizado_em).sort().pop();
    T.listaLocal(caixa, { titulo: 'Tabela de cargos e salários', dados: lista, nome: 'cargos-e-salarios', unidade: ['cargo', 'cargos'], vazio: 'Tabela em atualização.',
      antes: [notaAtualizacao(quando), avisoVigente(lista, 'Tabela remuneratória'), s.texto ? el('section', { class: 'cartao', style: 'margin-bottom:16px' }, el('p', { style: 'white-space:pre-line;margin:0' }, s.texto)) : ''],
      filtros: [['Pesquisar', busca('Ex.: professor, enfermeiro'), T.contem('cargo', 'referencia', 'norma')], ['Tipo', U.selecao(Object.fromEntries([...new Set(lista.map((c) => c.tipo))].map((t) => [t, TIPOS_CARGO[t]]))), (d, v) => d.tipo === v]],
      cabecalho: ['Cargo ou função', 'Tipo', 'Carga horária', 'Vencimento', 'Lei', 'Vigência'],
      colunas: [['cargo', 'Cargo'], ['tipo', 'Tipo', (v) => TIPOS_CARGO[v]], ['referencia', 'Referência'], ['carga_horaria', 'Carga horária'], ['vencimento', 'Vencimento'], ['norma', 'Lei'],
        ['norma_url', 'Link da lei'], ['vigencia_inicio', 'Vigente desde'], ['vigencia_fim', 'Vigente até']],
      linha: (c) => el('tr', null, td('Cargo ou função', [el('strong', null, c.cargo), meta(c.referencia)], 'lic-obj'), td('Tipo', TIPOS_CARGO[c.tipo]), td('Carga horária', c.carga_horaria || '—'),
        td('Vencimento', moeda(c.vencimento), 'num'), td('Lei', c.norma ? (c.norma_url ? el('a', { href: c.norma_url, target: '_blank', rel: 'noopener' }, c.norma, novaAba()) : c.norma) : '—'),
        td('Vigência', c.vigencia_inicio || c.vigencia_fim ? (dataBR(c.vigencia_inicio) || '…') + ' a ' + (dataBR(c.vigencia_fim) || 'atual') : '—', 'num')) });
  }

  function estagiarios(caixa, prm) {
    const CAMPOS = 'id, nome, instituicao, curso, nivel, lotacao, carga_horaria, bolsa, data_inicio, data_fim, data_desligamento, atualizado_em';
    return U.listaAnual(caixa, prm, {
      base: '#/pessoal/estagiarios', titulo: 'Estagiários', rotuloAno: 'Em estágio em', nome: 'estagiarios', unidade: ['estagiário', 'estagiários'],
      vazio: 'Não há estagiários publicados até esta data.', anos: anosRpc('pessoal_estagiarios'), ordem: 'nome', crescente: true,
      montar: (sel, op, ano, f) => {
        let q = sb.from('pessoal_estagiarios').select(sel || CAMPOS, op).eq('orgao_id', org());
        if (ano !== 'todos') q = q.lte('data_inicio', ano + '-12-31').or('data_desligamento.gte.' + ano + '-01-01,and(data_desligamento.is.null,data_fim.gte.' + ano + '-01-01)');
        if (f.busca) q = q.ilike('busca', U.termo(f.busca));
        if (f.contratacao) q = q.gte('data_inicio', f.contratacao + '-01-01').lte('data_inicio', f.contratacao + '-12-31');
        return q;
      },
      filtros: () => {
        const fAno = selecaoTardia('Todos');
        sb.from('pessoal_estagiarios').select('data_inicio').eq('orgao_id', org()).limit(20000)
          .then(({ data }) => preencher(fAno, [...new Set((data || []).map((x) => x.data_inicio.slice(0, 4)))].sort().reverse().map((a) => [a, a])));
        return [['busca', 'Pesquisar (nome, instituição, curso ou lotação)', busca('Ex.: administração, UERN')], ['contratacao', 'Ano de contratação', fAno]];
      },
      cabecalho: ['Estagiário', 'Instituição e curso', 'Lotação', 'Bolsa', 'Período'],
      colunas: [['nome', 'Nome'], ['instituicao', 'Instituição'], ['curso', 'Curso'], ['nivel', 'Nível', (v) => NIVEIS[v] || ''], ['lotacao', 'Lotação'], ['carga_horaria', 'Carga horária'],
        ['bolsa', 'Bolsa'], ['data_inicio', 'Início'], ['data_fim', 'Término previsto'], ['data_desligamento', 'Encerrado em']],
      linha: (e) => el('tr', null, td('Estagiário', el('strong', null, e.nome), 'lic-obj'), td('Instituição e curso', [e.instituicao || '—', meta([e.curso, NIVEIS[e.nivel]].filter(Boolean).join(' · '))]),
        td('Lotação', [e.lotacao || '—', meta(e.carga_horaria)]), td('Bolsa', moeda(e.bolsa), 'num'),
        td('Período', [dataBR(e.data_inicio) + ' a ' + dataBR(e.data_fim), meta(e.data_desligamento ? 'Encerrado em ' + dataBR(e.data_desligamento) : null)], 'num'), fimTd())
    });
  }

  function terceirizados(caixa, prm) {
    const CAMPOS = 'id, exercicio, nome, documento_publico, funcao, empresa, empresa_cnpj, contrato_numero, contrato_id, lotacao, data_inicio, data_fim, atualizado_em';
    const cnpj = (d) => d ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : '';
    return U.listaAnual(caixa, prm, {
      base: '#/pessoal/terceirizados', titulo: 'Terceirizados', rotuloAno: 'Exercício', nome: 'terceirizados', unidade: ['trabalhador', 'trabalhadores'],
      vazio: 'Não há terceirizados publicados até esta data.', anos: anosRpc('pessoal_terceirizados'), ordem: 'nome', crescente: true,
      montar: (sel, op, ano, f) => {
        let q = sb.from('pessoal_terceirizados').select(sel || CAMPOS, op).eq('orgao_id', org());
        if (ano !== 'todos') q = q.eq('exercicio', ano);
        if (f.busca) q = filtroBusca(q, f.busca);
        return q;
      },
      filtros: () => [['busca', 'Pesquisar (nome, função, empresa ou CNPJ)', busca('Ex.: vigilante, nome da empresa')]],
      cabecalho: ['Nome', 'Função e local', 'Empresa empregadora', 'Período'],
      colunas: [['exercicio', 'Exercício'], ['nome', 'Nome'], ['documento_publico', 'CPF'], ['funcao', 'Função'], ['lotacao', 'Local de trabalho'], ['empresa', 'Empresa'],
        ['empresa_cnpj', 'CNPJ da empresa', (v) => cnpj(v)], ['contrato_numero', 'Contrato'], ['data_inicio', 'Início'], ['data_fim', 'Fim']],
      linha: (t) => el('tr', null, td('Nome', [el('strong', null, t.nome), meta(t.documento_publico)], 'lic-obj'), td('Função e local', [t.funcao, meta(t.lotacao)]),
        td('Empresa empregadora', [t.empresa, meta(cnpj(t.empresa_cnpj)), t.contrato_numero ? (t.contrato_id ? el('span', { class: 'meta' }, el('a', { href: '#/contrato/' + t.contrato_id }, 'Contrato ' + t.contrato_numero)) : meta('Contrato ' + t.contrato_numero)) : null]),
        td('Período', t.data_inicio || t.data_fim ? U.periodoBR(t.data_inicio, t.data_fim) : '—', 'num'), fimTd())
    });
  }

  R.pessoal = function (main, partes, params) {
    return T.paginaAbas(main, { rota: 'pessoal', titulo: 'Pessoal', sub: 'Servidores, agentes políticos e demais agentes públicos, com cargo, lotação e remuneração; tabela de cargos e salários; estagiários e terceirizados.',
      abas: [
        ['servidores', 'Servidores', 'Relação nominal com cargo, função, vínculo, lotação, data de admissão e carga horária.', (c, prm) => T.comSecao(c, 'pessoal_servidores', '', () => servidores(c, prm))],
        ['remuneracao', 'Remuneração', 'Remuneração de cada servidor e agente político, mês a mês.', (c, prm) => T.comSecao(c, 'pessoal_remuneracao', '', () => remuneracao(c, prm))],
        ['cargos', 'Cargos e salários', 'Padrão remuneratório dos cargos, funções e subsídios, com a lei que fixa cada valor.', (c) => T.comSecao(c, 'pessoal_cargos', '', (cx, s) => cargos(c, s))],
        ['estagiarios', 'Estagiários', 'Estagiários com a instituição de ensino, a lotação e o período do estágio.', (c, prm) => T.comSecao(c, 'pessoal_estagiarios', 'O órgão não tem estagiários.', () => estagiarios(c, prm))],
        ['terceirizados', 'Terceirizados', 'Trabalhadores terceirizados com a função e a empresa empregadora.', (c, prm) => T.comSecao(c, 'pessoal_terceirizados', 'O órgão não tem trabalhadores terceirizados.', () => terceirizados(c, prm))],
        ['concursos', 'Concursos e seleções', 'Editais e todos os atos dos concursos e processos seletivos.', (c) => {
          const d = S.destino('concursos');
          c.replaceChildren(el('p', null, el('a', { class: 'botao', href: d ? d.href : '#/concursos', target: d && d.externo ? '_blank' : null, rel: d && d.externo ? 'noopener' : null }, 'Abrir concursos e processos seletivos')));
        }]
      ] }, partes, params);
  };

  // ===================================================================
  // DIÁRIAS (7.1 e 7.2)
  // ===================================================================
  const ABR_DIARIA = { estado: 'No estado', fora_estado: 'Fora do estado', exterior: 'Exterior' };
  const ABR_TABELA = { estado: 'Dentro do estado', capital: 'Capital do estado', fora_estado: 'Fora do estado', brasilia: 'Brasília/DF', exterior: 'Exterior', outra: 'Outra' };
  function concedidas(caixa, prm) {
    const CAMPOS = 'id, nome, cargo, unidade, destino, abrangencia, motivo, data_inicio, data_fim, exercicio, quantidade, valor_unitario, valor_total, data_pagamento, empenho_numero, ato_concessao, atualizado_em';
    return U.listaAnual(caixa, prm, {
      base: '#/diarias/concedidas', abrirRecente: true, titulo: 'Diárias concedidas', rotuloAno: 'Exercício', nome: 'diarias', unidade: ['concessão', 'concessões'],
      vazio: 'Não há diárias publicadas até esta data.', anos: anosRpc('diarias'), ordem: 'data_inicio', crescente: false,
      montar: (sel, op, ano, f) => {
        let q = sb.from('diarias').select(sel || CAMPOS, op).eq('orgao_id', org());
        if (ano !== 'todos') q = q.eq('exercicio', ano);
        if (f.busca) q = q.ilike('busca', U.termo(f.busca));
        if (f.abrangencia) q = q.eq('abrangencia', f.abrangencia);
        if (f.mes && ano !== 'todos') { const m = Number(f.mes); q = q.gte('data_inicio', ano + '-' + f.mes + '-01').lt('data_inicio', m === 12 ? (ano + 1) + '-01-01' : ano + '-' + String(m + 1).padStart(2, '0') + '-01'); }
        return q;
      },
      resumo: (ano) => {
        const cx = el('div');
        if (ano !== 'todos') sb.from('diarias').select('quantidade, valor_total').eq('orgao_id', org()).eq('exercicio', ano).limit(20000).then(({ data }) => {
          const l = data || [];
          cx.replaceChildren(cartoes([['Total pago em diárias em ' + ano, moeda(l.reduce((t, x) => t + Number(x.valor_total), 0)), l.length + ' concessão(ões)'],
            ['Diárias usufruídas', numBR(l.reduce((t, x) => t + Number(x.quantidade), 0))]]));
        });
        return cx;
      },
      filtros: (ano) => {
        const c = [['busca', 'Pesquisar (nome, cargo, destino ou motivo)', busca('Ex.: Natal, capacitação, secretário')], ['abrangencia', 'Destino', U.selecao(ABR_DIARIA)]];
        if (ano !== 'todos') c.push(['mes', 'Mês da viagem', U.selecao(opMeses)]);
        return c;
      },
      cabecalho: ['Beneficiário', 'Destino e motivo', 'Período', 'Diárias', 'Valor total'],
      colunas: [['nome', 'Beneficiário'], ['cargo', 'Cargo'], ['unidade', 'Unidade'], ['destino', 'Destino'], ['abrangencia', 'Abrangência', (v) => ABR_DIARIA[v] || ''], ['motivo', 'Motivo'],
        ['data_inicio', 'Saída'], ['data_fim', 'Retorno'], ['quantidade', 'Nº de diárias'], ['valor_unitario', 'Valor da diária'], ['valor_total', 'Valor total'], ['data_pagamento', 'Pago em'],
        ['empenho_numero', 'Empenho'], ['ato_concessao', 'Ato de concessão']],
      linha: (d) => el('tr', null, td('Beneficiário', [el('strong', null, d.nome), meta([d.cargo, d.unidade].filter(Boolean).join(' · '))], 'lic-obj'),
        td('Destino e motivo', [d.destino + (d.abrangencia ? ' (' + ABR_DIARIA[d.abrangencia].toLowerCase() + ')' : ''), meta(d.motivo)]),
        td('Período', [dataBR(d.data_inicio) + (d.data_fim !== d.data_inicio ? ' a ' + dataBR(d.data_fim) : ''), meta(d.ato_concessao)], 'num'),
        td('Diárias', numBR(d.quantidade), 'num'), td('Valor total', [moeda(d.valor_total), meta(d.valor_unitario !== null ? moeda(d.valor_unitario) + ' cada' : null)], 'num'), fimTd())
    });
  }

  async function tabelaDiarias(caixa, s) {
    const { data } = await sb.from('diarias_valores').select('grupo, abrangencia, destino_descricao, valor, moeda, norma, norma_url, vigencia_inicio, vigencia_fim, ordem, atualizado_em')
      .eq('orgao_id', org()).order('ordem').order('grupo').limit(500);
    const lista = data || [];
    const quando = lista.map((x) => x.atualizado_em).sort().pop();
    const valor = (v) => v.moeda === 'BRL' ? moeda(v.valor) : (v.moeda === 'USD' ? 'US$ ' : '€ ') + numBR(v.valor);
    T.listaLocal(caixa, { titulo: 'Valores das diárias', dados: lista, nome: 'diarias-tabela-de-valores', unidade: ['valor', 'valores'], vazio: 'Tabela de valores em atualização.',
      antes: [notaAtualizacao(quando), avisoVigente(lista, 'Tabela de valores das diárias'), s.texto ? el('section', { class: 'cartao', style: 'margin-bottom:16px' }, el('p', { style: 'white-space:pre-line;margin:0' }, s.texto)) : ''],
      filtros: [['Destino', U.selecao(Object.fromEntries([...new Set(lista.map((v) => v.abrangencia))].map((a) => [a, ABR_TABELA[a]]))), (d, v) => d.abrangencia === v]],
      cabecalho: ['Quem recebe', 'Destino', 'Valor da diária', 'Norma', 'Vigência'],
      colunas: [['grupo', 'Quem recebe'], ['abrangencia', 'Destino', (v) => ABR_TABELA[v]], ['destino_descricao', 'Descrição do destino'], ['valor', 'Valor'], ['moeda', 'Moeda'],
        ['norma', 'Norma'], ['norma_url', 'Link da norma'], ['vigencia_inicio', 'Vigente desde'], ['vigencia_fim', 'Vigente até']],
      linha: (v) => el('tr', null, td('Quem recebe', el('strong', null, v.grupo), 'lic-obj'), td('Destino', [ABR_TABELA[v.abrangencia], meta(v.destino_descricao)]), td('Valor da diária', valor(v), 'num'),
        td('Norma', v.norma_url ? el('a', { href: v.norma_url, target: '_blank', rel: 'noopener' }, v.norma, novaAba()) : v.norma),
        td('Vigência', v.vigencia_inicio || v.vigencia_fim ? (dataBR(v.vigencia_inicio) || '…') + ' a ' + (dataBR(v.vigencia_fim) || 'atual') : '—', 'num')) });
  }

  R.diarias = function (main, partes, params) {
    return T.paginaAbas(main, { rota: 'diarias', titulo: 'Diárias', sub: 'Diárias pagas a servidores e agentes políticos em viagens a serviço, com o destino, o motivo, o período e o valor, e a tabela de valores conforme a norma local.',
      abas: [
        ['concedidas', 'Diárias concedidas', 'Nome e cargo de quem recebeu, destino, motivo, período, número de diárias e valor total.',
          (c, prm) => T.comSecao(c, 'diarias_concedidas', 'Não houve concessão de diárias no período.', () => concedidas(c, prm))],
        ['tabela', 'Tabela de valores', 'Valor da diária dentro do estado, fora do estado e no exterior, por grupo de cargos.', (c) => T.comSecao(c, 'diarias_tabela', '', (cx, s) => tabelaDiarias(c, s))]
      ] }, partes, params);
  };
})();
