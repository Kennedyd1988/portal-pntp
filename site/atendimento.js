// =====================================================================
// Site público — e-SIC (PNTP 12.1 a 12.9) e Ouvidoria (14.1 e 14.2).
//   #/esic/como-pedir · prazos · relatorios · classificadas · desclassificadas
//   #/ouvidoria/como-manifestar · relatorios
// Os dados vêm dos módulos e-SIC e Ouvidoria do painel. O formulário
// eletrônico (e-SIC próprio, Fala.BR, sistema da ouvidoria) é um link. Página
// ou parte com link externo em Aparência › Destinos das páginas leva para
// lá; as partes com lista aceitam a declaração de que não há dados.
// =====================================================================
(function () {
  'use strict';
  const S = window.SITE;
  const { sb, el, dataBR, texto } = S;
  const R = S.rotas;
  const U = S.util;
  const T = S.setor;
  const { td, busca, novaAba, etq } = T;
  const org = () => S.orgao.id;
  const n = (v) => v === null || v === undefined ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const meta = (t) => t ? el('span', { class: 'meta' }, t) : null;
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const GRAUS = { ultrassecreto: ['Ultrassecreto', 'etiqueta-vermelha'], secreto: ['Secreto', 'etiqueta-ambar'], reservado: ['Reservado', 'etiqueta-ambar'] };
  const PRAZO_GRAU = { ultrassecreto: 'até 25 anos', secreto: 'até 15 anos', reservado: 'até 5 anos' };
  const MOTIVOS_DESC = { prazo: 'Fim do prazo de sigilo', evento: 'Ocorreu o evento que encerrava o sigilo', reavaliacao: 'Reavaliação', recurso: 'Pedido de desclassificação ou recurso', outro: 'Outro' };
  const DIMENSOES = { faixa_etaria: 'Faixa etária', escolaridade: 'Escolaridade', profissao: 'Profissão / ocupação', localidade: 'Localidade', meio: 'Meio de entrada',
    assunto: 'Assunto', unidade: 'Unidade', motivo_negativa: 'Motivo da negativa', outra: 'Outras informações' };
  const ABR = { ano: 'Anual', semestre: 'Semestre', trimestre: 'Trimestre', mes: 'Mês' };
  const periodoRel = (r) => r.abrangencia === 'ano' ? 'Exercício de ' + r.exercicio
    : r.abrangencia === 'mes' ? MESES[r.numero - 1].replace(/^./, (c) => c.toUpperCase()) + '/' + r.exercicio : r.numero + 'º ' + r.abrangencia + ' de ' + r.exercicio;

  // ---------- dados do canal (um por página; recarregado a cada visita) ----------
  async function canal(c) {
    const { data } = await sb.from('atendimento_canais').select('*').eq('orgao_id', org()).eq('canal', c).maybeSingle();
    const r = data || {};
    const [u, norma] = await Promise.all([
      r.unidade_id ? S.carregarUnidades().then((l) => l.find((x) => x.id === r.unidade_id) || null) : null,
      r.norma_publicacao ? sb.from('publicacoes').select('tipo, numero, ano, ementa, arquivo_url, link_externo').eq('id', r.norma_publicacao).maybeSingle().then((x) => x.data) : null
    ]);
    return { r, u, norma };
  }
  const nomeAto = (p) => ({ decreto: 'Decreto', lei: 'Lei', lei_complementar: 'Lei Complementar', portaria: 'Portaria', resolucao: 'Resolução' }[p.tipo] || p.tipo) +
    (p.numero ? ' nº ' + p.numero : '') + '/' + p.ano;
  const linkFora = (href, rot) => el('a', { href, target: '_blank', rel: 'noopener' }, rot, novaAba());

  // Cartão de contato: unidade/setor, responsável, endereço, telefone, e-mail e horário
  // (o que estiver em branco vem da unidade escolhida).
  function cartaoContato(titulo, d, rotResp) {
    const { r, u } = d;
    const v = (k, ku) => r[k] || (u && u[ku || k]) || null;
    const linhas = [
      ['Unidade responsável', u ? el('a', { href: '#/unidade/' + u.id }, u.nome) : r.setor],
      [rotResp, r.responsavel_nome ? [r.responsavel_nome, r.responsavel_cargo ? ' — ' + r.responsavel_cargo : '', r.responsavel_ato ? meta(' (' + r.responsavel_ato + ')') : null] : null],
      ['Endereço', v('endereco')],
      ['Telefone', v('telefone') ? el('a', { href: 'tel:' + v('telefone').replace(/[^\d+]/g, '') }, v('telefone')) : null],
      ['E-mail', v('email') ? el('a', { href: 'mailto:' + v('email') }, v('email')) : null],
      ['Horário de funcionamento', v('horario', 'horario_atendimento')]
    ].filter((x) => x[1]);
    return el('section', { class: 'cartao' }, el('h2', null, titulo),
      linhas.length ? el('dl', { class: 'dados' }, linhas.map(([dt, dd]) => [el('dt', null, dt), el('dd', null, dd)]))
        : el('p', { class: 'vazio' }, 'Informações em atualização.'));
  }
  function cartaoNorma(titulo, d, vazio) {
    const { r, norma } = d;
    const doc = norma && (norma.arquivo_url || norma.link_externo);
    const corpo = norma ? el('p', null, doc ? linkFora(doc, nomeAto(norma)) : el('strong', null, nomeAto(norma)), ' — ' + norma.ementa)
      : r.norma_texto || r.norma_url ? el('p', null, r.norma_url ? linkFora(r.norma_url, r.norma_texto || 'Norma do órgão') : r.norma_texto)
        : vazio ? el('p', { class: 'vazio' }, vazio) : null;
    return corpo ? el('section', { class: 'cartao' }, el('h2', null, titulo), corpo) : '';
  }
  const atualizado = (r) => r.atualizado_em ? el('p', { class: 'meta', style: 'margin-top:18px' }, 'Informações atualizadas em ' + dataBR(String(r.atualizado_em).slice(0, 10)) + '.') : '';

  // ===================================================================
  // e-SIC
  // ===================================================================
  async function comoPedir(caixa) {
    const d = await canal('esic');
    const r = d.r;
    caixa.replaceChildren(
      el('section', { class: 'cartao destaque-acao', style: 'margin-bottom:18px' },
        el('h2', null, 'Fazer um pedido de acesso à informação'),
        el('p', null, 'Qualquer pessoa pode pedir informações ao órgão, sem precisar dizer o motivo. Não são exigidos documentos, firma reconhecida, declaração de responsabilidade nem comprovação de maioridade.'),
        r.canal_url ? el('p', null, el('a', { class: 'botao', href: r.canal_url, target: '_blank', rel: 'noopener' }, 'Fazer pedido pela internet (e-SIC)', novaAba()))
          : el('p', { class: 'vazio' }, 'O formulário eletrônico está em implantação. Faça o pedido no SIC, pelos contatos abaixo.'),
        r.outros_canais ? el('p', null, el('strong', null, 'Outras formas: '), r.outros_canais) : '',
        el('p', { class: 'meta' }, 'Prazos de resposta e como recorrer: ', el('a', { href: '#/esic/prazos' }, 'Prazos e recursos'), '.')),
      el('div', { class: 'grade grade-2' },
        cartaoContato('Serviço de Informação ao Cidadão (SIC)', d, 'Responsável'),
        cartaoNorma('Regulamentação da Lei de Acesso à Informação', d, 'Regulamentação local em elaboração.')),
      r.instrucoes ? el('section', { style: 'margin-top:24px' }, texto(r.instrucoes)) : '',
      el('section', { class: 'cartao', style: 'margin-top:24px' }, el('h2', null, 'Mais nesta seção'),
        el('ul', null, [['#/esic/relatorios', 'Relatórios estatísticos dos pedidos'], ['#/esic/classificadas', 'Informações classificadas em grau de sigilo'],
          ['#/esic/desclassificadas', 'Informações desclassificadas'], ['#/ouvidoria', 'Ouvidoria (reclamações, denúncias, sugestões e elogios)']]
          .map(([h, t]) => el('li', null, S.linkDestino && window.chaveDaRotaPNTP(h) ? S.linkDestino(window.chaveDaRotaPNTP(h), t) : el('a', { href: h }, t))))),
      atualizado(r));
  }

  async function prazos(caixa) {
    const { r } = await canal('esic');
    const itens = [['Prazo de resposta', r.prazo_resposta], ['Prazo para recorrer', r.prazo_recurso], ['Prazo para decidir o recurso', r.prazo_decisao_recurso],
      ['Quem decide o recurso (1ª instância)', r.autoridade_recurso_1], ['Quem decide o recurso (2ª instância)', r.autoridade_recurso_2]].filter((x) => x[1]);
    caixa.replaceChildren(
      itens.length ? el('section', { class: 'cartao' }, el('h2', null, 'Prazos e autoridades'), el('dl', { class: 'dados' }, itens.map(([a, b]) => [el('dt', null, a), el('dd', null, b)])))
        : el('p', { class: 'vazio' }, 'Informações em atualização.'),
      r.procedimento_recurso ? el('section', { style: 'margin-top:24px' }, el('h2', null, 'Como recorrer'), texto(r.procedimento_recurso)) : '',
      el('p', { style: 'margin-top:18px' }, r.canal_url ? el('a', { class: 'botao botao-claro', href: r.canal_url, target: '_blank', rel: 'noopener' }, 'Acompanhar pedido ou recorrer', novaAba()) : ''),
      atualizado(r));
  }

  // ---------- relatórios estatísticos (12.7 · ouvidoria) ----------
  async function relatorios(caixa, prm, c) {
    const esic = c === 'esic';
    const parte = c + '_relatorios';
    const [{ data, error }, { data: itens }] = await Promise.all([
      sb.from('atendimento_relatorios').select('*').eq('orgao_id', org()).eq('canal', c).order('exercicio', { ascending: false }).order('data_inicio', { ascending: false }).limit(500),
      sb.from('atendimento_relatorios_itens').select('relatorio_id, dimensao, item, quantidade, ordem').eq('orgao_id', org()).order('dimensao').order('ordem').order('item').limit(5000)]);
    if (error) { caixa.replaceChildren(el('p', null, 'Não foi possível carregar. Tente novamente.')); return; }
    const lista = data || [];
    const porRel = new Map();
    for (const i of itens || []) { if (!porRel.has(i.relatorio_id)) porRel.set(i.relatorio_id, []); porRel.get(i.relatorio_id).push(i); }
    const contagem = [...lista.reduce((m, x) => m.set(x.exercicio, (m.get(x.exercicio) || 0) + 1), new Map())].map(([ano, total]) => ({ ano, total }));
    const { decl, anos } = await S.decl.anual(caixa, parte, contagem);
    if (!anos.length) { caixa.replaceChildren(el('p', { class: 'vazio' }, 'Relatórios em elaboração.')); return; }
    // Sem ano no endereço: o último exercício com relatório anual (o que o PNTP verifica).
    const anual = lista.find((x) => x.abrangencia === 'ano');
    let ano = anos.some((x) => x.ano === Number(prm.get('ano'))) ? Number(prm.get('ano')) : anual ? anual.exercicio : anos[0].ano;
    const painelAno = el('div', { class: 'painel-guia painel-guia-interno', role: 'tabpanel' });
    const faixa = U.faixaAbas(anos.map((x) => [x.ano, String(x.ano)]), ano, 'Exercício', true, (id) => { ano = Number(id); abrir(); });
    caixa.replaceChildren(el('p', { class: 'meta' }, esic ? 'Lei 12.527/2011, art. 30, III. Nenhum solicitante é identificado.' : 'Lei 13.460/2017, arts. 14 e 15.'), faixa.lista, painelAno);
    faixa.marcar(ano);
    abrir();

    function abrir() {
      history.replaceState(null, '', '#/' + c + '/relatorios?ano=' + ano);
      const declAno = S.decl.doAno(decl, ano);
      const doAno = lista.filter((x) => x.exercicio === ano);
      if (!doAno.length) { painelAno.replaceChildren(S.decl.quadro(declAno)); return; }
      const principal = doAno.find((x) => x.abrangencia === 'ano') || doAno[0];
      const cartoes = (pares) => el('div', { class: 'grade', style: 'margin:12px 0 16px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))' },
        pares.filter((p) => p[1] !== null && p[1] !== undefined).map(([rot, val, sub]) => el('div', { class: 'cartao' }, meta(rot), el('strong', { style: 'display:block;font-size:1.3em' }, n(val)), sub ? meta(sub) : null)));
      const resumo = el('section', null, el('h3', null, periodoRel(principal)),
        cartoes(esic ? [['Pedidos recebidos', principal.recebidos], ['Atendidos', principal.atendidos], ['Parcialmente atendidos', principal.parciais], ['Indeferidos', principal.indeferidos],
          ['Em andamento', principal.em_andamento], ['Recursos (1ª instância)', principal.recursos_1], ['Recursos (2ª instância)', principal.recursos_2], ['Prazo médio de resposta', principal.prazo_medio_dias, 'dias']]
          : [['Manifestações recebidas', principal.recebidos], ['Respondidas / concluídas', principal.atendidos], ['Arquivadas / não conhecidas', principal.indeferidos],
            ['Em andamento', principal.em_andamento], ['Prazo médio de resposta', principal.prazo_medio_dias, 'dias']]),
        distribuicoes(principal),
        principal.observacao ? el('p', { style: 'white-space:pre-line' }, principal.observacao) : '',
        principal.arquivo_url || principal.link_externo ? el('p', null, linkFora(principal.arquivo_url || principal.link_externo, 'Relatório completo' + (principal.arquivo_url ? ' (PDF)' : ''))) : '');
      const outros = doAno.length > 1 ? el('section', { style: 'margin-top:24px' }, el('h3', null, 'Todos os relatórios de ' + ano)) : '';
      painelAno.replaceChildren(S.decl.quadro(declAno, 'Períodos sem ocorrência em ' + ano), resumo, outros);
      if (outros) {
        const caixaLista = el('div'); outros.append(caixaLista);
        T.listaLocal(caixaLista, { titulo: 'Relatórios de ' + ano, dados: doAno, nome: c + '-relatorios-' + ano, unidade: ['relatório', 'relatórios'], vazio: '',
          filtros: [['Período', U.selecao(Object.fromEntries([...new Set(doAno.map((x) => x.abrangencia))].map((a) => [a, ABR[a]]))), (x, v) => x.abrangencia === v]],
          cabecalho: esic ? ['Período', 'Recebidos', 'Atendidos', 'Parciais', 'Indeferidos', 'Em andamento', 'Prazo médio'] : ['Período', 'Recebidas', 'Respondidas', 'Arquivadas', 'Em andamento', 'Prazo médio'],
          colunas: colunasRel(esic),
          linha: (x) => el('tr', null, td('Período', [el('strong', null, periodoRel(x)), x.arquivo_url || x.link_externo ? el('span', { class: 'meta' }, ' · ', linkFora(x.arquivo_url || x.link_externo, 'relatório')) : null]),
            td('Recebidos', n(x.recebidos), 'num'), td('Atendidos', n(x.atendidos), 'num'), esic ? td('Parciais', n(x.parciais), 'num') : null, td('Indeferidos', n(x.indeferidos), 'num'),
            td('Em andamento', n(x.em_andamento), 'num'), td('Prazo médio', x.prazo_medio_dias !== null ? n(x.prazo_medio_dias) + ' dias' : '—', 'num')) });
      } else {
        resumo.prepend(el('div', { class: 'barra-lista' }, el('span', { class: 'meta' }, '1 relatório'), S.botoesExportar(c + '-relatorios-' + ano, colunasRel(esic), async (de) => de ? [] : doAno)));
      }
    }
    // Perfil dos solicitantes (e-SIC), tipos (ouvidoria) e as demais distribuições do relatório.
    function distribuicoes(rel) {
      const grupos = [];
      if (esic) {
        grupos.push(['Tipo de solicitante', [['Pessoas físicas', rel.pessoas_fisicas], ['Pessoas jurídicas', rel.pessoas_juridicas]]]);
        grupos.push(['Sexo', [['Feminino', rel.sexo_feminino], ['Masculino', rel.sexo_masculino], ['Não informado', rel.sexo_nao_informado]]]);
      } else {
        grupos.push(['Manifestações por tipo', [['Reclamações', rel.reclamacoes], ['Denúncias', rel.denuncias], ['Sugestões', rel.sugestoes], ['Elogios', rel.elogios],
          ['Solicitações', rel.solicitacoes], ['Simplificação', rel.simplifique]]]);
      }
      const extras = porRel.get(rel.id) || [];
      for (const dim of Object.keys(DIMENSOES)) {
        const l = extras.filter((i) => i.dimensao === dim);
        if (l.length) grupos.push([DIMENSOES[dim], l.map((i) => [i.item, i.quantidade])]);
      }
      const visiveis = grupos.map(([t, pares]) => [t, pares.filter((p) => p[1] !== null && p[1] !== undefined)]).filter((g) => g[1].length);
      if (!visiveis.length) return '';
      const linhasExport = visiveis.flatMap(([t, pares]) => pares.map(([item, q]) => ({ divisao: t, item, quantidade: q })));
      return el('section', { style: 'margin-top:8px' },
        el('div', { class: 'barra-lista' }, el('h4', { style: 'margin:0' }, esic ? 'Perfil dos pedidos e dos solicitantes' : 'Distribuição das manifestações'),
          S.botoesExportar(c + '-distribuicoes-' + rel.exercicio + (rel.abrangencia === 'ano' ? '' : '-' + rel.abrangencia + '-' + rel.numero),
            [['divisao', 'Divisão'], ['item', 'Item'], ['quantidade', 'Quantidade']], async (de) => de ? [] : linhasExport)),
        el('div', { class: 'grade', style: 'grid-template-columns:repeat(auto-fit,minmax(240px,1fr));margin-top:8px' }, visiveis.map(([t, pares]) => {
          const total = pares.reduce((s, p) => s + Number(p[1]), 0);
          return el('div', { class: 'cartao' }, el('h5', { style: 'margin:0 0 8px' }, t),
            el('table', { class: 'tabela-dados' }, el('caption', { class: 'sr' }, t + ' — ' + periodoRel(rel)),
              el('thead', null, el('tr', null, el('th', { scope: 'col' }, 'Item'), el('th', { scope: 'col', class: 'num' }, 'Quantidade'), el('th', { scope: 'col', class: 'num' }, '%'))),
              el('tbody', null, pares.map(([item, q]) => el('tr', null, el('td', null, item), el('td', { class: 'num' }, n(q)),
                el('td', { class: 'num' }, total ? (100 * q / total).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%' : '—'))))));
        })));
    }
  }
  const colunasRel = (esic) => [['exercicio', 'Exercício'], ['abrangencia', 'Período', (v) => ABR[v]], ['numero', 'Número do período'],
    ['recebidos', esic ? 'Pedidos recebidos' : 'Manifestações recebidas'], ['atendidos', esic ? 'Atendidos' : 'Respondidas'],
    ...(esic ? [['parciais', 'Parcialmente atendidos']] : []), ['indeferidos', esic ? 'Indeferidos' : 'Arquivadas'], ['em_andamento', 'Em andamento'],
    ...(esic ? [['outros', 'Outros'], ['recursos_1', 'Recursos 1ª instância'], ['recursos_2', 'Recursos 2ª instância'], ['pessoas_fisicas', 'Pessoas físicas'], ['pessoas_juridicas', 'Pessoas jurídicas'],
      ['sexo_feminino', 'Feminino'], ['sexo_masculino', 'Masculino'], ['sexo_nao_informado', 'Sexo não informado']]
      : [['reclamacoes', 'Reclamações'], ['denuncias', 'Denúncias'], ['sugestoes', 'Sugestões'], ['elogios', 'Elogios'], ['solicitacoes', 'Solicitações'], ['simplifique', 'Simplificação']]),
    ['prazo_medio_dias', 'Prazo médio (dias)'], ['observacao', 'Observação'], ['arquivo_url', 'Relatório completo', (v, r) => v || r.link_externo || '']];

  // ---------- informações classificadas (12.8) e desclassificadas (12.9) ----------
  const CAMPOS_CLASS = 'id, codigo, assunto, grau, fundamento, unidade, autoridade, data_classificacao, prazo_fim, evento_fim, data_desclassificacao, motivo_desclassificacao, observacao, exercicio, ano_desclassificacao, atualizado_em';
  const COLUNAS_CLASS = [['codigo', 'Código'], ['assunto', 'Assunto'], ['grau', 'Grau de sigilo', (v) => GRAUS[v][0]], ['fundamento', 'Fundamento legal'], ['unidade', 'Unidade'],
    ['autoridade', 'Autoridade classificadora'], ['data_classificacao', 'Data da classificação'], ['prazo_fim', 'Sigilo até'], ['evento_fim', 'Evento que encerra o sigilo'],
    ['data_desclassificacao', 'Data da desclassificação'], ['motivo_desclassificacao', 'Motivo da desclassificação', (v) => v ? MOTIVOS_DESC[v] : '']];
  const prazoTxt = (r) => r.prazo_fim ? dataBR(r.prazo_fim) : r.evento_fim;
  function classificadas(caixa, prm, desc) {
    const hoje = new Date().toISOString().slice(0, 10);
    const parte = desc ? 'esic_desclassificadas' : 'esic_classificadas';
    return U.listaAnual(caixa, prm, {
      base: '#/esic/' + (desc ? 'desclassificadas' : 'classificadas'), declaracao: parte, abrirRecente: true, titulo: desc ? 'Informações desclassificadas' : 'Informações classificadas',
      rotuloAno: desc ? 'Ano da desclassificação' : 'Ano da classificação', nome: desc ? 'informacoes-desclassificadas' : 'informacoes-classificadas', unidade: ['informação', 'informações'],
      vazio: desc ? 'Não há informações desclassificadas publicadas até esta data.' : 'Não há informações classificadas publicadas até esta data.',
      anos: async () => { const { data, error } = await sb.rpc('atendimento_anos', { p_orgao: org(), p_parte: parte }); return error ? null : data || []; },
      ordem: desc ? 'data_desclassificacao' : 'data_classificacao', crescente: false,
      montar: (sel, op, ano, f) => {
        let q = sb.from('informacoes_classificadas').select(sel || CAMPOS_CLASS, op).eq('orgao_id', org());
        if (desc) q = q.not('data_desclassificacao', 'is', null);
        if (ano !== 'todos') q = q.eq(desc ? 'ano_desclassificacao' : 'exercicio', ano);
        if (f.grau) q = q.eq('grau', f.grau);
        if (f.sigilo === 'sigilo') q = q.is('data_desclassificacao', null);
        if (f.sigilo === 'desclassificada') q = q.not('data_desclassificacao', 'is', null);
        if (f.recentes) q = q.gte('data_desclassificacao', new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10));
        if (f.busca) q = q.ilike('busca', U.termo(f.busca));
        return q;
      },
      resumo: () => desc ? el('p', { class: 'meta' }, 'Informações que deixaram de ser sigilosas (Lei 12.527/2011, art. 30, I) e estão disponíveis para acesso: peça pelo ',
        el('a', { href: '#/esic/como-pedir' }, 'e-SIC'), '. Use o filtro "Últimos 12 meses" para o rol do período exigido pela lei.')
        : el('p', { class: 'meta' }, 'Rol das informações classificadas em grau de sigilo (Lei 12.527/2011, art. 30, II): o assunto é descrito sem revelar o conteúdo. Prazos máximos: ultrassecreto 25 anos, secreto 15 anos, reservado 5 anos (art. 24, § 1º).'),
      filtros: () => [['busca', 'Pesquisar (assunto, código, fundamento)', busca('Ex.: segurança, art. 23')], ['grau', 'Grau de sigilo', U.selecao({ ultrassecreto: 'Ultrassecreto', secreto: 'Secreto', reservado: 'Reservado' })]]
        .concat(desc ? [['recentes', 'Período', U.selecao({ '1': 'Últimos 12 meses' }, 'Todo o período')]] : [['sigilo', 'Situação', U.selecao({ sigilo: 'Em sigilo', desclassificada: 'Já desclassificadas' }, 'Todas')]]),
      cabecalho: desc ? ['Assunto', 'Grau e fundamento', 'Classificada em', 'Desclassificada em'] : ['Assunto', 'Grau e fundamento', 'Classificada em', 'Sigilo até', 'Situação'],
      colunas: COLUNAS_CLASS,
      linha: (r) => el('tr', null, td('Assunto', [el('strong', null, r.assunto), meta([r.codigo, r.unidade].filter(Boolean).join(' · '))], 'lic-obj'),
        td('Grau e fundamento', [etq(GRAUS[r.grau]), el('span', { class: 'meta', style: 'display:block' }, r.fundamento)]),
        td('Classificada em', [dataBR(r.data_classificacao), meta(r.autoridade)], 'num'),
        desc ? td('Desclassificada em', [dataBR(r.data_desclassificacao), meta(MOTIVOS_DESC[r.motivo_desclassificacao])], 'num')
          : td('Sigilo até', [prazoTxt(r), meta(PRAZO_GRAU[r.grau])], 'num'),
        desc ? null : td('Situação', r.data_desclassificacao ? etq(['Desclassificada em ' + dataBR(r.data_desclassificacao), 'etiqueta-verde'])
          : r.prazo_fim && r.prazo_fim < hoje ? etq(['Prazo de sigilo encerrado', 'etiqueta-verde']) : etq(['Em sigilo', 'etiqueta-ambar'])),
        el('td', { 'data-rotulo': '' }))
    });
  }

  R.esic = function (main, partes, params) {
    return T.paginaAbas(main, { rota: 'esic', titulo: 'e-SIC — Acesso à informação', trilha: [['Atendimento']],
      sub: 'Serviço de Informação ao Cidadão: como pedir informações ao órgão (Lei 12.527/2011), prazos e recursos, relatórios estatísticos e informações classificadas e desclassificadas.',
      abas: [
        ['como-pedir', 'Como pedir', 'Unidade responsável, endereço, telefone, e-mail, horário, formulário eletrônico e a norma local da Lei de Acesso à Informação.', (c) => comoPedir(c)],
        ['prazos', 'Prazos e recursos', 'Prazos de resposta e de recurso, quem decide e como recorrer.', (c) => prazos(c)],
        ['relatorios', 'Relatórios estatísticos', 'Pedidos recebidos, atendidos e indeferidos por exercício, com o perfil geral dos solicitantes.',
          (c, prm) => T.comSecao(c, 'esic_relatorios', '', () => relatorios(c, prm, 'esic'))],
        ['classificadas', 'Informações classificadas', 'Documentos classificados em cada grau de sigilo, com assunto, fundamento legal e prazo.',
          (c, prm) => T.comSecao(c, 'esic_classificadas', '', () => classificadas(c, prm, false))],
        ['desclassificadas', 'Informações desclassificadas', 'Informações que deixaram de ser sigilosas, com a data e o motivo.',
          (c, prm) => T.comSecao(c, 'esic_desclassificadas', '', () => classificadas(c, prm, true))]
      ] }, partes, params);
  };

  // ===================================================================
  // OUVIDORIA
  // ===================================================================
  async function comoManifestar(caixa) {
    const d = await canal('ouvidoria');
    const r = d.r;
    caixa.replaceChildren(
      el('section', { class: 'cartao destaque-acao', style: 'margin-bottom:18px' },
        el('h2', null, 'Registrar uma manifestação'),
        el('p', null, 'Reclamações, denúncias, sugestões, elogios e solicitações sobre os serviços do órgão. Para pedir documentos ou dados públicos, use o ', el('a', { href: '#/esic/como-pedir' }, 'e-SIC'), '.'),
        r.canal_url ? el('p', null, el('a', { class: 'botao', href: r.canal_url, target: '_blank', rel: 'noopener' }, 'Registrar manifestação pela internet', novaAba()))
          : el('p', { class: 'vazio' }, 'O canal eletrônico está em implantação. Fale com a Ouvidoria pelos contatos abaixo.'),
        r.outros_canais ? el('p', null, el('strong', null, 'Outras formas: '), r.outros_canais) : '',
        r.prazo_resposta ? el('p', null, el('strong', null, 'Prazo de resposta: '), r.prazo_resposta) : ''),
      el('div', { class: 'grade grade-2' },
        cartaoContato('Atendimento presencial', d, 'Ouvidor(a)'),
        cartaoNorma('Norma da Ouvidoria', d, null)),
      r.instrucoes ? el('section', { style: 'margin-top:24px' }, texto(r.instrucoes)) : '',
      el('p', { style: 'margin-top:18px' }, el('a', { href: '#/ouvidoria/relatorios' }, 'Relatórios estatísticos das manifestações'), ' · ', el('a', { href: '#/servicos' }, 'Carta de Serviços ao Usuário')),
      atualizado(r));
  }

  R.ouvidoria = function (main, partes, params) {
    return T.paginaAbas(main, { rota: 'ouvidoria', titulo: 'Ouvidoria', trilha: [['Atendimento']],
      sub: 'Canal para reclamações, denúncias, sugestões, elogios e solicitações sobre os serviços públicos (Lei 13.460/2017): onde e como se manifestar e os relatórios das manifestações.',
      abas: [
        ['como-manifestar', 'Como se manifestar', 'Endereço, telefone, horário, canal eletrônico, tipos de manifestação e prazo de resposta.', (c) => comoManifestar(c)],
        ['relatorios', 'Relatórios estatísticos', 'Manifestações recebidas por exercício, por tipo e situação.',
          (c, prm) => T.comSecao(c, 'ouvidoria_relatorios', '', () => relatorios(c, prm, 'ouvidoria'))]
      ] }, partes, params);
  };
})();
