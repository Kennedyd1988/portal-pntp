// =====================================================================
// Site público — e-SIC (PNTP 12.1 a 12.9), Ouvidoria (14.1 e 14.2) e
// pesquisa de satisfação (15.6).
//   #/esic/como-pedir · pedir · acompanhar · prazos · relatorios ·
//          classificadas · desclassificadas
//   #/ouvidoria/como-manifestar · manifestar · acompanhar · relatorios · satisfacao
// Os dados vêm dos módulos e-SIC e Ouvidoria do painel. O formulário é o do
// próprio portal (sistema próprio ligado no painel) ou o de um sistema
// externo (Fala.BR etc.: link em Aparência › Destinos das páginas, partes
// "e-SIC: pedidos" e "Ouvidoria: manifestações"). O site não lê a fila: só
// registra e consulta por protocolo + código de acesso (funções do script 25),
// sem nenhum dado pessoal na resposta.
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

  // ---------- formulário: sistema próprio do portal ou sistema externo ----------
  const CHAVE_FORM = { esic: 'esic_pedidos', ouvidoria: 'ouvidoria_manifestacoes' };
  const formExterno = (c) => window.externoPNTP(S.conf, CHAVE_FORM[c]);
  const proprio = (r) => !!(r && r.sistema_proprio) && !formExterno(r.canal);
  function botaoFormulario(c, r, rotulo, vazio) {
    if (proprio(r)) return el('p', { class: 'acoes-atend' }, el('a', { class: 'botao', href: '#/' + c + '/' + (c === 'esic' ? 'pedir' : 'manifestar') }, rotulo),
      el('a', { class: 'botao botao-claro', href: '#/' + c + '/acompanhar' }, 'Acompanhar pelo protocolo'));
    const ext = formExterno(c);
    return ext ? el('p', null, el('a', { class: 'botao', href: ext, target: '_blank', rel: 'noopener' }, rotulo, novaAba())) : el('p', { class: 'vazio' }, vazio);
  }

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
        botaoFormulario('esic', r, 'Fazer pedido pela internet (e-SIC)', 'O formulário eletrônico está em implantação. Faça o pedido no SIC, pelos contatos abaixo.'),
        r.outros_canais ? el('p', null, el('strong', null, 'Outras formas: '), r.outros_canais) : '',
        el('p', { class: 'meta' }, 'Prazos de resposta e como recorrer: ', el('a', { href: '#/esic/prazos' }, 'Prazos e recursos'), '.')),
      el('div', { class: 'grade grade-2' },
        cartaoContato('Serviço de Informação ao Cidadão (SIC)', d, 'Responsável'),
        cartaoNorma('Regulamentação da Lei de Acesso à Informação', d, 'Regulamentação local em elaboração.')),
      r.instrucoes ? el('section', { style: 'margin-top:24px' }, texto(r.instrucoes)) : '',
      el('section', { class: 'cartao', style: 'margin-top:24px' }, el('h2', null, 'Mais nesta seção'),
        el('ul', null, [['#/esic/acompanhar', 'Acompanhar um pedido ou recorrer'], ['#/esic/relatorios', 'Relatórios estatísticos dos pedidos'], ['#/esic/classificadas', 'Informações classificadas em grau de sigilo'],
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
      el('p', { style: 'margin-top:18px' }, proprio(r) ? el('a', { class: 'botao botao-claro', href: '#/esic/acompanhar' }, 'Acompanhar pedido ou recorrer')
        : formExterno('esic') ? el('a', { class: 'botao botao-claro', href: formExterno('esic'), target: '_blank', rel: 'noopener' }, 'Acompanhar pedido ou recorrer', novaAba()) : ''),
      atualizado(r));
  }

  // ---------- relatórios estatísticos (12.7 · ouvidoria) ----------
  async function relatorios(caixa, prm, c) {
    const esic = c === 'esic';
    const parte = c + '_relatorios';
    const [{ data, error }, { data: itens }, dc] = await Promise.all([
      sb.from('atendimento_relatorios').select('*').eq('orgao_id', org()).eq('canal', c).order('exercicio', { ascending: false }).order('data_inicio', { ascending: false }).limit(500),
      sb.from('atendimento_relatorios_itens').select('relatorio_id, dimensao, item, quantidade, ordem').eq('orgao_id', org()).order('dimensao').order('ordem').order('item').limit(5000), canal(c)]);
    const desde = dc.r.sistema_desde;
    // Relatório gerado pelo sistema do portal: de onde vêm os números e se o período está em curso.
    const notaSistema = (x) => x.origem !== 'sistema' ? '' : el('p', { class: 'meta nota-sistema' },
      'Gerado automaticamente a partir dos registros feitos no portal' + (x.parcela_manual ? ', somados aos do sistema usado antes de ' + dataBR(desde) : x.data_inicio < desde ? ' desde ' + dataBR(desde) + ' (o período anterior está no sistema usado antes)' : '') + '. ',
      x.parcial ? el('strong', null, 'Período em curso: números parciais, atualizados todo dia (última mudança em ' + dataBR(String(x.atualizado_em).slice(0, 10)) + ').') : '',
      !Number(x.recebidos) ? el('strong', { style: 'display:block' }, (esic ? 'Não houve pedidos de acesso à informação' : 'Não houve manifestações registradas na Ouvidoria') + ' ' + window.periodoFrasePNTP(x) + '.') : '');
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
      const resumo = el('section', null, el('h3', null, periodoRel(principal)), notaSistema(principal),
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
          linha: (x) => el('tr', null, td('Período', [el('strong', null, periodoRel(x)), x.parcial ? meta(' (parcial)') : null, x.arquivo_url || x.link_externo ? el('span', { class: 'meta' }, ' · ', linkFora(x.arquivo_url || x.link_externo, 'relatório')) : null]),
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

  // ===================================================================
  // SISTEMA PRÓPRIO: registrar, acompanhar (protocolo + código), recorrer,
  // complementar e avaliar. Nada pessoal volta do banco para a página.
  // ===================================================================
  const TIPOS_OUV = [
    ['reclamacao', 'Reclamação', 'Insatisfação com um serviço público ou com o atendimento.'],
    ['denuncia', 'Denúncia', 'Irregularidade ou ato ilícito que precisa ser apurado. Pode ser anônima.'],
    ['sugestao', 'Sugestão', 'Ideia ou proposta para melhorar um serviço.'],
    ['elogio', 'Elogio', 'Reconhecimento ou satisfação com um serviço ou atendimento.'],
    ['solicitacao', 'Solicitação', 'Pedido de atendimento ou de providência.'],
    ['simplificacao', 'Simplificação', 'Proposta para simplificar um serviço ou acabar com uma exigência desnecessária.']];
  const FAIXAS = { ate_17: 'Até 17 anos', '18_29': '18 a 29 anos', '30_44': '30 a 44 anos', '45_59': '45 a 59 anos', '60_mais': '60 anos ou mais' };
  const ESCOLAR = { sem: 'Sem escolaridade', fundamental: 'Ensino fundamental', medio: 'Ensino médio', superior: 'Ensino superior', pos: 'Pós-graduação' };
  const SEXOS = { feminino: 'Feminino', masculino: 'Masculino', nao_informado: 'Prefiro não informar' };
  const RESPOSTA = { sistema: 'Pela consulta do protocolo, nesta página', email: 'Por e-mail', correspondencia: 'Por correspondência (carta)', presencial: 'Retirar no atendimento presencial' };
  const MOTIVOS_REC = { negativa: 'Não concordo com a negativa', incompleta: 'A resposta está incompleta', omissao: 'O prazo venceu sem resposta', outro: 'Outro motivo' };
  const SIT_ETQ = { aberto: 'etiqueta-ambar', aguardando_cidadao: 'etiqueta-vermelha', respondido: 'etiqueta-verde', em_recurso: 'etiqueta-ambar', encerrado: 'etiqueta-verde' };
  const URL_ARQ = () => window.CONFIG_PNTP.supabaseUrl + '/functions/v1/atendimento-arquivos';
  const ACEITOS = 'application/pdf,image/jpeg,image/png,image/webp';
  const dataHora = (iso) => iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }) : '';
  let seqF = 0;

  // Campo de formulário com rótulo, ajuda e marca de obrigatório.
  function campoF(rotulo, input, ajuda, obrig) {
    const id = input.id || ('fa' + (++seqF));
    input.id = id;
    if (obrig) input.setAttribute('aria-required', 'true');
    if (ajuda) input.setAttribute('aria-describedby', id + '-aj');
    return el('div', { class: 'campo-atend' }, el('label', { for: id }, rotulo, obrig ? el('span', { class: 'obrig', 'aria-hidden': 'true' }, ' *') : ''), input,
      ajuda ? el('span', { class: 'ajuda-atend', id: id + '-aj' }, ajuda) : '');
  }
  const entrada = (attrs) => el('input', Object.assign({ type: 'text' }, attrs));
  const caixaTexto = (attrs) => el('textarea', Object.assign({ rows: 6 }, attrs));
  const lista = (obj, vazio) => el('select', null, el('option', { value: '' }, vazio || '—'), Object.entries(obj).map(([k, v]) => el('option', { value: k }, v)));
  const radios = (nome, opcoes, atual) => el('div', { class: 'radios-atend', role: 'radiogroup' }, opcoes.map(([v, rot, aj]) => el('label', { class: 'radio-atend' },
    el('input', { type: 'radio', name: nome, value: v, checked: v === atual }), el('span', null, el('strong', null, rot), aj ? el('span', { class: 'meta', style: 'display:block' }, aj) : ''))));
  const valorRadio = (form, nome) => (form.querySelector('input[name="' + nome + '"]:checked') || {}).value || '';

  // CPF ou CNPJ com dígitos verificadores.
  function documentoOk(v) {
    const d = String(v || '').replace(/\D/g, '');
    const dig = (base, pesos) => { const s = base.split('').reduce((t, c, i) => t + Number(c) * pesos[i], 0) % 11; return s < 2 ? 0 : 11 - s; };
    if (d.length === 11) {
      if (/^(\d)\1{10}$/.test(d)) return false;
      const p1 = [10, 9, 8, 7, 6, 5, 4, 3, 2], p2 = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
      const r1 = (d.slice(0, 9).split('').reduce((t, c, i) => t + Number(c) * p1[i], 0) * 10) % 11 % 10;
      const r2 = (d.slice(0, 10).split('').reduce((t, c, i) => t + Number(c) * p2[i], 0) * 10) % 11 % 10;
      return r1 === Number(d[9]) && r2 === Number(d[10]);
    }
    if (d.length === 14) {
      if (/^(\d)\1{13}$/.test(d)) return false;
      return dig(d.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(d[12]) && dig(d.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(d[13]);
    }
    return false;
  }

  // Seletor de anexos (até 3 por envio).
  function seletorAnexos() {
    const inp = el('input', { type: 'file', multiple: true, accept: ACEITOS });
    const info = el('span', { class: 'ajuda-atend', role: 'status' }, 'Opcional. Até 3 arquivos (PDF, JPG, PNG ou WEBP), de até 10 MB cada.');
    inp.addEventListener('change', () => {
      const fs = [...inp.files];
      const ruim = fs.find((f) => !ACEITOS.split(',').includes(f.type) || f.size > 10 * 1024 * 1024);
      info.textContent = fs.length > 3 ? 'Escolha no máximo 3 arquivos.' : ruim ? '"' + ruim.name + '": use PDF, JPG, PNG ou WEBP de até 10 MB.' : fs.length ? fs.map((f) => f.name).join(', ') : 'Opcional. Até 3 arquivos (PDF, JPG, PNG ou WEBP), de até 10 MB cada.';
    });
    const valido = () => { const fs = [...inp.files]; return fs.length <= 3 && fs.every((f) => ACEITOS.split(',').includes(f.type) && f.size <= 10 * 1024 * 1024); };
    return { el: el('div', { class: 'campo-atend' }, el('label', null, 'Anexos', inp), info), arquivos: () => [...inp.files], valido };
  }
  // Envia os anexos depois do registro (função atendimento-arquivos). Devolve as falhas.
  async function enviarAnexos(arquivos, protocolo, codigo, saida) {
    const falhas = [];
    for (const f of arquivos) {
      const linha = el('li', null, f.name + ': enviando…'); saida.append(linha);
      try {
        const fd = new FormData();
        fd.append('orgao', org()); fd.append('protocolo', protocolo); fd.append('codigo', codigo); fd.append('arquivo', f, f.name);
        const r = await fetch(URL_ARQ(), { method: 'POST', body: fd, headers: { apikey: window.CONFIG_PNTP.supabaseChave } });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.erro) throw new Error(j.erro || 'falha no envio');
        linha.textContent = f.name + ': enviado.';
      } catch (e) { linha.textContent = f.name + ': não foi enviado (' + e.message + '). Envie de novo pela consulta do protocolo.'; falhas.push(f.name); }
    }
    return falhas;
  }

  const msgErro = (caixa, texto) => { caixa.replaceChildren(texto ? el('p', { class: 'msg-erro-atend' }, texto) : ''); if (texto) caixa.scrollIntoView({ block: 'nearest' }); };
  const erroRPC = (e) => String((e && e.message) || e || '').replace(/^.*?ERROR:\s*/, '') || 'Não foi possível concluir. Tente de novo.';

  // ---------- registrar (e-SIC: pedido · Ouvidoria: manifestação) ----------
  async function registrar(caixa, c) {
    const d = await canal(c);
    const r = Object.assign({ canal: c }, d.r);
    const esic = c === 'esic';
    if (!proprio(r)) {
      const ext = formExterno(c);
      caixa.replaceChildren(ext ? el('div', { class: 'cartao' }, el('p', null, esic ? 'Os pedidos são feitos no sistema indicado pelo órgão:' : 'As manifestações são registradas no sistema indicado pelo órgão:'),
        el('p', null, el('a', { class: 'botao', href: ext, target: '_blank', rel: 'noopener' }, 'Acessar', novaAba())), el('p', { class: 'meta' }, ext))
        : el('div', { class: 'cartao' }, el('p', null, esic ? 'O formulário eletrônico está em implantação. Faça o pedido no SIC: ' : 'O canal eletrônico está em implantação. Fale com a Ouvidoria: '),
          el('a', { href: '#/' + c + '/' + (esic ? 'como-pedir' : 'como-manifestar') }, 'endereço, telefone e horário'), '.'));
      return;
    }
    const f = {
      tipo: null, texto: caixaTexto({ maxlength: 8000, required: true }), assunto: entrada({ maxlength: 200 }),
      nome: entrada({ maxlength: 200, autocomplete: 'name' }), documento: entrada({ maxlength: 18, inputmode: 'numeric', autocomplete: 'off' }),
      email: entrada({ type: 'email', maxlength: 160, autocomplete: 'email' }), telefone: entrada({ type: 'tel', maxlength: 40, autocomplete: 'tel' }),
      endereco: entrada({ maxlength: 300, autocomplete: 'street-address' }), municipio_uf: entrada({ maxlength: 120, placeholder: 'Ex.: Riacho da Cruz/RN' }),
      preservar: el('input', { type: 'checkbox' }), forma: lista(RESPOSTA), sexo: lista(SEXOS, 'Não informar'), faixa: lista(FAIXAS, 'Não informar'), escolar: lista(ESCOLAR, 'Não informar'),
      isca: el('input', { type: 'text', name: 'site', tabindex: '-1', autocomplete: 'off' })
    };
    f.forma.value = 'sistema';
    const anexos = r.aceita_anexos ? seletorAnexos() : null;
    const erros = el('div', { role: 'alert' });
    const btn = el('button', { type: 'submit', class: 'botao' }, esic ? 'Enviar pedido' : 'Enviar manifestação');
    const form = el('form', { class: 'form-atend', novalidate: true });
    const blocoIdent = el('div');
    const desenharIdent = () => {
      const anon = !esic && valorRadio(form, 'ident') === 'anonimo';
      blocoIdent.hidden = anon;
    };
    const tipos = esic ? null : radios('tipo', TIPOS_OUV.map((t) => [t[0], t[1], t[2]]), 'reclamacao');
    const ident = esic ? null : radios('ident', [['identificado', 'Com identificação', 'Seu nome e seus contatos ficam protegidos: só a Ouvidoria vê (Lei 13.460/2017, art. 10, § 7º).'],
      ['anonimo', 'Anônima', 'Só para denúncia. Sem nome, a Ouvidoria não consegue pedir mais detalhes nem avisar você: acompanhe pelo protocolo.']], 'identificado');
    const blocoAnon = el('fieldset', { class: 'grupo-atend', hidden: true }, el('legend', null, 'Identificação'), ident);
    if (!esic) {
      tipos.addEventListener('change', () => {
        const den = valorRadio(form, 'tipo') === 'denuncia';
        blocoAnon.hidden = !den;
        if (!den) form.querySelector('input[name="ident"][value="identificado"]').checked = true;
        desenharIdent();
      });
      ident.addEventListener('change', desenharIdent);
    }
    blocoIdent.append(
      el('div', { class: 'grade grade-2' }, campoF('Nome', f.nome, esic ? null : 'Pessoa ou empresa.', true),
        campoF('CPF ou CNPJ', f.documento, esic ? 'Exigido pela Lei 12.527/2011, art. 10. Não aparece em lugar nenhum do site.' : 'Opcional.', esic)),
      el('div', { class: 'grade grade-2' }, campoF('E-mail', f.email, 'Opcional. Para receber os avisos de andamento.'), campoF('Telefone', f.telefone, 'Opcional.')),
      el('div', { class: 'grade grade-2' }, campoF('Endereço', f.endereco, 'Opcional. Necessário se quiser a resposta por carta.'), campoF('Município/UF', f.municipio_uf, 'Opcional.')),
      esic ? el('label', { class: 'check-atend' }, f.preservar, el('span', null, el('strong', null, 'Preservar minha identidade. '),
        'Só a equipe do SIC verá o meu nome e os meus contatos; as secretarias que ajudarem a responder não verão.')) : '');
    form.append(erros,
      esic ? el('p', null, 'Escreva com clareza a informação que você procura. ', el('strong', null, 'Não é preciso dizer o motivo do pedido'), ' (Lei 12.527/2011, art. 10, § 3º).')
        : el('fieldset', { class: 'grupo-atend' }, el('legend', null, 'Tipo de manifestação'), tipos),
      !esic ? blocoAnon : '',
      el('fieldset', { class: 'grupo-atend' }, el('legend', null, esic ? 'Seu pedido' : 'Sua manifestação'),
        campoF(esic ? 'Informação desejada' : 'Descrição', f.texto, esic ? 'Ex.: "Cópia dos contratos de limpeza urbana de 2025, com os aditivos." Até 8.000 caracteres.'
          : 'O que aconteceu, onde e quando. Se for denúncia, informe tudo o que ajude a apurar. Até 8.000 caracteres.', true),
        campoF('Assunto (resumo)', f.assunto, 'Opcional. Até 200 caracteres.'), anexos ? anexos.el : ''),
      el('fieldset', { class: 'grupo-atend' }, el('legend', null, 'Quem ' + (esic ? 'pede' : 'se manifesta')), blocoIdent),
      esic ? el('fieldset', { class: 'grupo-atend' }, el('legend', null, 'Como quer receber a resposta'), campoF('Forma de resposta', f.forma, 'A resposta fica sempre disponível na consulta do protocolo.')) : '',
      esic ? el('details', { class: 'grupo-atend' }, el('summary', null, 'Perfil para as estatísticas (opcional)'),
        el('p', { class: 'meta' }, 'Usado só nos relatórios estatísticos, somado aos demais pedidos, sem identificar ninguém (Lei 12.527/2011, art. 30, III).'),
        el('div', { class: 'grade grade-3' }, campoF('Sexo', f.sexo), campoF('Faixa etária', f.faixa), campoF('Escolaridade', f.escolar))) : '',
      el('div', { class: 'isca-atend', 'aria-hidden': 'true' }, el('label', null, 'Não preencha', f.isca)),
      el('p', { class: 'meta' }, 'Os dados pessoais são usados só para tratar ' + (esic ? 'o pedido' : 'a manifestação') + ' (Lei 13.709/2018, art. 7º, II e III) e não aparecem no site nem nos dados abertos. ',
        el('a', { href: '#/lgpd' }, 'Política de privacidade'), '.'),
      el('p', null, btn));
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const anon = !esic && valorRadio(form, 'ident') === 'anonimo';
      const v = (k) => f[k].value.trim();
      if (v('texto').length < 10) { msgErro(erros, 'Descreva ' + (esic ? 'a informação que você procura' : 'a manifestação') + ' (pelo menos 10 letras).'); f.texto.focus(); return; }
      if (!anon && v('nome').length < 3) { msgErro(erros, 'Informe o seu nome' + (esic ? ' (Lei 12.527/2011, art. 10).' : ', ou escolha denúncia anônima.')); f.nome.focus(); return; }
      if (esic && !v('documento')) { msgErro(erros, 'Informe o CPF ou o CNPJ (Lei 12.527/2011, art. 10).'); f.documento.focus(); return; }
      if (!anon && v('documento') && !documentoOk(v('documento'))) { msgErro(erros, 'CPF ou CNPJ inválido. Confira os números.'); f.documento.focus(); return; }
      if (!anon && v('email') && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v('email'))) { msgErro(erros, 'E-mail inválido.'); f.email.focus(); return; }
      if (esic && f.forma.value === 'email' && !v('email')) { msgErro(erros, 'Para receber por e-mail, informe o e-mail.'); f.email.focus(); return; }
      if (esic && f.forma.value === 'correspondencia' && !v('endereco')) { msgErro(erros, 'Para receber por carta, informe o endereço.'); f.endereco.focus(); return; }
      if (anexos && !anexos.valido()) { msgErro(erros, 'Confira os anexos: até 3 arquivos PDF, JPG, PNG ou WEBP, de até 10 MB.'); return; }
      msgErro(erros, null);
      btn.disabled = true; btn.textContent = 'Enviando…';
      const dados = { texto: v('texto'), assunto: v('assunto'), site: f.isca.value,
        tipo: esic ? 'pedido' : valorRadio(form, 'tipo'), identificacao: esic ? (f.preservar.checked ? 'preservada' : 'identificado') : anon ? 'anonimo' : 'identificado' };
      if (!anon) Object.assign(dados, { nome: v('nome'), documento: v('documento'), email: v('email'), telefone: v('telefone'), endereco: v('endereco'), municipio_uf: v('municipio_uf') });
      if (esic) Object.assign(dados, { forma_resposta: f.forma.value, sexo: f.sexo.value, faixa_etaria: f.faixa.value, escolaridade: f.escolar.value });
      const { data, error } = await sb.rpc('registrar_atendimento', { p_orgao: org(), p_canal: c, p_dados: dados });
      if (error || !data) { btn.disabled = false; btn.textContent = esic ? 'Enviar pedido' : 'Enviar manifestação'; msgErro(erros, erroRPC(error)); return; }
      comprovante(caixa, c, data, anexos ? anexos.arquivos() : []);
    });
    caixa.replaceChildren(form);
  }

  // Comprovante: protocolo e código de acesso aparecem uma única vez.
  async function comprovante(caixa, c, d, arquivos) {
    const esic = c === 'esic';
    const saida = el('ul');
    const sec = el('section', { class: 'cartao comprovante-atend', tabindex: '-1' },
      el('h2', null, esic ? 'Pedido registrado' : 'Manifestação registrada'),
      el('dl', { class: 'dados' }, el('dt', null, 'Órgão'), el('dd', null, S.orgao.nome), el('dt', null, 'Protocolo'), el('dd', null, el('strong', { class: 'codigo-atend' }, d.protocolo)),
        el('dt', null, 'Código de acesso'), el('dd', null, el('strong', { class: 'codigo-atend' }, d.codigo)),
        el('dt', null, 'Prazo de resposta'), el('dd', null, dataBR(d.prazo)), el('dt', null, 'Registrado em'), el('dd', null, dataHora(new Date().toISOString()))),
      el('p', { class: 'msg-aviso-atend' }, el('strong', null, 'Guarde o protocolo e o código de acesso. '), 'O código não é mostrado de novo nem enviado por e-mail: sem ele não é possível consultar a resposta' + (esic ? ' nem recorrer' : '') + '.'),
      d.email ? el('p', { class: 'meta' }, 'Os avisos de andamento vão para o e-mail informado, quando o envio de e-mails estiver ativo no órgão.') : '',
      arquivos.length ? el('div', null, el('h3', null, 'Anexos'), saida) : '',
      el('p', { class: 'acoes-atend sem-impressao' }, el('button', { type: 'button', class: 'botao botao-claro', onclick: () => window.print() }, 'Imprimir ou salvar comprovante'),
        el('button', { type: 'button', class: 'botao botao-claro', onclick: (e) => { navigator.clipboard && navigator.clipboard.writeText('Protocolo ' + d.protocolo + ' · Código ' + d.codigo).then(() => { e.target.textContent = 'Copiado'; }); } }, 'Copiar protocolo e código'),
        el('a', { class: 'botao', href: '#/' + c + '/acompanhar?protocolo=' + encodeURIComponent(d.protocolo) }, 'Acompanhar')));
    caixa.replaceChildren(sec);
    sec.focus();
    if (arquivos.length) await enviarAnexos(arquivos, d.protocolo, d.codigo, saida);
  }

  // ---------- acompanhar ----------
  async function acompanhar(caixa, c, prm) {
    const d = await canal(c);
    const r = Object.assign({ canal: c }, d.r);
    if (!proprio(r)) {
      const ext = formExterno(c);
      caixa.replaceChildren(el('div', { class: 'cartao' }, ext ? [el('p', null, 'O acompanhamento é feito no sistema indicado pelo órgão:'),
        el('p', null, el('a', { class: 'botao', href: ext, target: '_blank', rel: 'noopener' }, 'Acessar', novaAba()))]
        : el('p', null, 'Para saber o andamento, fale com ' + (c === 'esic' ? 'o SIC' : 'a Ouvidoria') + ' pelos contatos da aba "' + (c === 'esic' ? 'Como pedir' : 'Como se manifestar') + '".')));
      return;
    }
    const prot = entrada({ maxlength: 20, autocomplete: 'off', placeholder: c === 'esic' ? 'SIC-2026-000123' : 'OUV-2026-000045', value: prm.get('protocolo') || '' });
    const cod = entrada({ maxlength: 14, autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false' });
    const erros = el('div', { role: 'alert' });
    const resultado = el('div', { 'aria-live': 'polite' });
    const btn = el('button', { type: 'submit', class: 'botao' }, 'Consultar');
    const form = el('form', { class: 'form-atend form-consulta', novalidate: true }, erros,
      el('div', { class: 'grade grade-3' }, campoF('Protocolo', prot, null, true), campoF('Código de acesso', cod, 'Entregue no registro.', true), el('div', { class: 'campo-atend campo-botao' }, btn)));
    let chave = null;   // protocolo + código desta consulta (só na memória da página)
    async function consultar(rolar) {
      const { data, error } = await sb.rpc('consultar_atendimento', { p_orgao: org(), p_protocolo: chave[0], p_codigo: chave[1] });
      if (error || !data || data.erro) { resultado.replaceChildren(); msgErro(erros, (data && data.erro) || erroRPC(error)); return; }
      msgErro(erros, null);
      desenharConsulta(resultado, c, data, chave, () => consultar(false));
      if (rolar) resultado.scrollIntoView({ block: 'start' });
    }
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const p = prot.value.trim().toUpperCase(), k = cod.value.trim().toUpperCase();
      if (!p || !k) { msgErro(erros, 'Informe o protocolo e o código de acesso.'); return; }
      chave = [p, k];
      btn.disabled = true;
      try { await consultar(true); } finally { btn.disabled = false; }
    });
    caixa.replaceChildren(el('p', null, 'Informe o protocolo e o código de acesso recebidos no registro. ',
      el('span', { class: 'meta' }, 'Por segurança, depois de 5 tentativas erradas o protocolo fica bloqueado por 15 minutos.')), form, resultado);
    if (prot.value) cod.focus();
  }

  function desenharConsulta(caixa, c, d, chave, recarregar) {
    const esic = c === 'esic';
    const hoje = new Date().toISOString().slice(0, 10);
    const andamento = (d.andamento || []).slice().reverse();
    const anexos = d.anexos || [];
    const linhaAnexo = (a) => el('li', null, el('button', { type: 'button', class: 'link-botao', onclick: async (e) => {
      e.target.disabled = true;
      try {
        const q = new URLSearchParams({ orgao: org(), protocolo: chave[0], codigo: chave[1], anexo: a.id });
        const r = await fetch(URL_ARQ() + '?' + q, { headers: { apikey: window.CONFIG_PNTP.supabaseChave } });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.url) throw new Error(j.erro || 'indisponível');
        window.open(j.url, '_blank', 'noopener');
      } catch (er) { alert('Não foi possível abrir o anexo: ' + er.message); } finally { e.target.disabled = false; }
    } }, a.nome), meta(' · ' + (a.origem === 'cidadao' ? 'enviado por você' : 'enviado pelo órgão') + ' · ' + dataHora(a.em)));
    const blocos = [
      el('section', { class: 'cartao' },
        el('div', { class: 'barra-lista' }, el('h2', { style: 'margin:0' }, d.protocolo), etq([d.situacao_rotulo, SIT_ETQ[d.situacao]])),
        el('dl', { class: 'dados' },
          el('dt', null, 'Tipo'), el('dd', null, d.tipo_rotulo + (d.identificacao === 'anonimo' ? ' (anônima)' : d.identificacao === 'preservada' ? ' (identidade preservada)' : '')),
          el('dt', null, 'Registrado em'), el('dd', null, dataHora(d.registrado_em)),
          d.respondido_em ? [el('dt', null, 'Respondido em'), el('dd', null, dataHora(d.respondido_em))]
            : [el('dt', null, 'Prazo de resposta'), el('dd', null, dataBR(d.prazo), d.prorrogado ? meta(' (prorrogado)') : '', d.prazo < hoje && d.situacao === 'aberto' ? etq(['Prazo vencido', 'etiqueta-vermelha']) : '')],
          d.unidade && !d.respondido_em ? [el('dt', null, 'Em análise em'), el('dd', null, d.unidade)] : ''),
        el('details', null, el('summary', null, esic ? 'Ver o pedido' : 'Ver a manifestação'), d.assunto ? el('p', null, el('strong', null, d.assunto)) : '', el('p', { style: 'white-space:pre-line' }, d.texto))),
      d.resposta ? el('section', { class: 'cartao' }, el('h3', null, 'Resposta'), el('p', null, el('strong', null, d.resultado_rotulo), d.motivo_negativa ? ' — ' + d.motivo_negativa : ''),
        el('p', { style: 'white-space:pre-line' }, d.resposta),
        esic && d.prazo_recurso && d.situacao === 'respondido' ? el('p', { class: 'meta' }, 'Se discordar, você pode recorrer até ' + dataBR(d.prazo_recurso) + '.') : '') : '',
      (d.recursos || []).length ? el('section', { class: 'cartao' }, el('h3', null, 'Recursos'), d.recursos.map((x) => el('div', { class: 'recurso-atend' },
        el('p', null, el('strong', null, x.instancia + 'ª instância'), meta(' · registrado em ' + dataHora(x.registrado_em) + (x.autoridade ? ' · decide: ' + x.autoridade : ''))),
        el('p', { style: 'white-space:pre-line' }, x.texto),
        x.decisao ? [el('p', null, el('strong', null, x.decisao_rotulo), meta(' · ' + dataHora(x.decidido_em))), el('p', { style: 'white-space:pre-line' }, x.decisao_texto)]
          : el('p', { class: 'meta' }, 'Aguardando decisão (prazo: ' + dataBR(x.prazo_decisao) + ').')))) : '',
      anexos.length ? el('section', { class: 'cartao' }, el('h3', null, 'Anexos'), el('ul', null, anexos.map(linhaAnexo))) : '',
      el('section', { class: 'cartao' }, el('h3', null, 'Andamento'), el('ol', { class: 'andamento-atend' }, andamento.map((t) => el('li', null,
        el('strong', null, t.rotulo), meta(' · ' + dataHora(t.em)), t.texto ? el('p', { style: 'white-space:pre-line;margin:4px 0 0' }, t.texto) : ''))))];
    // Ações do cidadão.
    if (d.pode_complementar) blocos.splice(1, 0, formAcao('Responder ao pedido de complemento', 'O órgão pediu mais informações. Escreva aqui o complemento.', 'Enviar complemento', d.aceita_anexos,
      async (texto) => sb.rpc('complementar_atendimento', { p_orgao: org(), p_protocolo: chave[0], p_codigo: chave[1], p_texto: texto }), chave, recarregar));
    if (d.recurso_possivel) blocos.splice(1, 0, formAcao('Recorrer (' + d.recurso_possivel + 'ª instância)', d.situacao === 'respondido'
      ? 'Se não concorda com a resposta, explique o motivo. O recurso é gratuito e decidido pela autoridade indicada na aba "Prazos e recursos".'
      : 'O prazo de resposta venceu. Você pode recorrer por falta de resposta.', 'Enviar recurso', false,
      async (texto, motivo) => sb.rpc('recorrer_atendimento', { p_orgao: org(), p_protocolo: chave[0], p_codigo: chave[1], p_texto: texto, p_motivo: motivo }), chave, recarregar,
      d.situacao === 'respondido' ? MOTIVOS_REC : null));
    if (d.pode_avaliar) blocos.push(formAvaliacao(c, chave, recarregar));
    if (d.avaliado) blocos.push(el('p', { class: 'meta' }, 'Obrigado por avaliar o atendimento.'));
    caixa.replaceChildren(...blocos);
  }

  function formAcao(titulo, ajuda, rotulo, comAnexos, enviar, chave, recarregar, motivos) {
    const texto = caixaTexto({ maxlength: 8000, rows: 4 });
    const motivo = motivos ? lista(motivos) : null;
    if (motivo) motivo.value = 'negativa';
    const anexos = comAnexos ? seletorAnexos() : null;
    const erros = el('div', { role: 'alert' });
    const btn = el('button', { type: 'submit', class: 'botao' }, rotulo);
    const saida = el('ul');
    const form = el('form', { class: 'cartao form-atend destaque-acao', novalidate: true }, el('h3', null, titulo), el('p', { class: 'meta' }, ajuda), erros,
      motivo ? campoF('Motivo', motivo) : '', campoF('Texto', texto, null, true), anexos ? anexos.el : '', el('p', null, btn), saida);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (texto.value.trim().length < 10) { msgErro(erros, 'Escreva pelo menos 10 letras.'); texto.focus(); return; }
      if (anexos && !anexos.valido()) { msgErro(erros, 'Confira os anexos: até 3 arquivos PDF, JPG, PNG ou WEBP, de até 10 MB.'); return; }
      btn.disabled = true;
      const { data, error } = await enviar(texto.value.trim(), motivo && motivo.value);
      if (error || !data || data.erro) { btn.disabled = false; msgErro(erros, (data && data.erro) || erroRPC(error)); return; }
      if (anexos && anexos.arquivos().length) await enviarAnexos(anexos.arquivos(), chave[0], chave[1], saida);
      recarregar();
    });
    return form;
  }

  function formAvaliacao(c, chave, recarregar) {
    const erros = el('div', { role: 'alert' });
    const coment = caixaTexto({ maxlength: 1000, rows: 3 });
    const btn = el('button', { type: 'submit', class: 'botao' }, 'Enviar avaliação');
    const form = el('form', { class: 'cartao form-atend', novalidate: true }, el('h3', null, 'Avalie o atendimento'),
      el('p', { class: 'meta' }, 'Pesquisa de satisfação: a sua resposta entra nos resultados publicados, sem identificar você.'), erros,
      el('fieldset', { class: 'grupo-atend' }, el('legend', null, 'Nota geral (1 = muito insatisfeito, 5 = muito satisfeito)'),
        el('div', { class: 'notas-atend' }, [1, 2, 3, 4, 5].map((n2) => el('label', null, el('input', { type: 'radio', name: 'nota', value: n2 }), el('span', null, String(n2)))))),
      el('fieldset', { class: 'grupo-atend' }, el('legend', null, 'A resposta resolveu o que você precisava?'),
        radios('resolvido', [['sim', 'Sim'], ['parcial', 'Em parte'], ['nao', 'Não']])),
      campoF('Comentário (opcional)', coment, 'Não escreva dados pessoais.'), el('p', null, btn));
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const nota = Number(valorRadio(form, 'nota')), res = valorRadio(form, 'resolvido');
      if (!nota || !res) { msgErro(erros, 'Escolha a nota e se a resposta resolveu.'); return; }
      btn.disabled = true;
      const { data, error } = await sb.rpc('avaliar_atendimento', { p_orgao: org(), p_protocolo: chave[0], p_codigo: chave[1], p_nota: nota, p_resolvido: res, p_comentario: coment.value.trim() || null });
      if (error || !data || data.erro) { btn.disabled = false; msgErro(erros, (data && data.erro) || erroRPC(error)); return; }
      recarregar();
    });
    return form;
  }

  // ---------- pesquisa de satisfação (15.6): resultados por ano ----------
  async function satisfacao(caixa, prm) {
    const [{ data, error }, dE, dO] = await Promise.all([sb.rpc('atendimento_satisfacao', { p_orgao: org() }), canal('esic'), canal('ouvidoria')]);
    if (error) { caixa.replaceChildren(el('p', null, 'Não foi possível carregar. Tente novamente.')); return; }
    const ativos = [Object.assign({ canal: 'esic' }, dE.r), Object.assign({ canal: 'ouvidoria' }, dO.r)].filter((r) => proprio(r) && r.pesquisa_satisfacao);
    const linhas = data || [];
    const intro = el('p', { class: 'meta' }, 'Quem recebe a resposta pelo portal pode avaliar o atendimento (nota de 1 a 5 e se a resposta resolveu). Os resultados são somados, sem identificar ninguém (Lei 13.460/2017, art. 23 e 24).');
    if (!linhas.length) {
      caixa.replaceChildren(intro, el('p', { class: 'vazio' }, ativos.length ? 'Ainda não há avaliações registradas.' : 'A pesquisa de satisfação está em implantação.'));
      return;
    }
    const anos = [...new Set(linhas.map((x) => x.ano))].sort((a, b) => b - a);
    let ano = anos.includes(Number(prm.get('ano'))) ? Number(prm.get('ano')) : anos[0];
    const painelAno = el('div', { class: 'painel-guia painel-guia-interno', role: 'tabpanel' });
    const faixa = U.faixaAbas(anos.map((a) => [a, String(a)]), ano, 'Ano', true, (id) => { ano = Number(id); abrir(); });
    caixa.replaceChildren(intro, faixa.lista, painelAno);
    faixa.marcar(ano);
    abrir();
    function abrir() {
      history.replaceState(null, '', '#/ouvidoria/satisfacao?ano=' + ano);
      const doAno = linhas.filter((x) => x.ano === ano);
      const resumo = (filtro) => {
        const l = doAno.filter(filtro);
        const tot = l.reduce((t, x) => t + Number(x.quantidade), 0);
        const media = tot ? l.reduce((t, x) => t + x.nota * Number(x.quantidade), 0) / tot : null;
        const res = (k) => l.filter((x) => x.resolvido === k).reduce((t, x) => t + Number(x.quantidade), 0);
        return { tot, media, sim: res('sim'), parcial: res('parcial'), nao: res('nao'), notas: [5, 4, 3, 2, 1].map((n2) => [n2, l.filter((x) => x.nota === n2).reduce((t, x) => t + Number(x.quantidade), 0)]) };
      };
      const pct = (a, b) => b ? (100 * a / b).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%' : '—';
      const cartaoCanal = (rot, r) => el('div', { class: 'cartao' }, el('h3', { style: 'margin-top:0' }, rot),
        el('p', null, el('strong', { style: 'font-size:1.3em' }, r.media === null ? '—' : r.media.toLocaleString('pt-BR', { maximumFractionDigits: 1 })), meta(' nota média · ' + n(r.tot) + ' avaliação(ões)')),
        el('p', null, 'Resolveu: ' + pct(r.sim, r.tot) + ' · em parte: ' + pct(r.parcial, r.tot) + ' · não: ' + pct(r.nao, r.tot)),
        el('table', { class: 'tabela-dados' }, el('caption', { class: 'sr' }, 'Notas — ' + rot + ' — ' + ano),
          el('thead', null, el('tr', null, el('th', { scope: 'col' }, 'Nota'), el('th', { scope: 'col', class: 'num' }, 'Avaliações'), el('th', { scope: 'col', class: 'num' }, '%'))),
          el('tbody', null, r.notas.map(([nota, q]) => el('tr', null, el('td', null, String(nota)), el('td', { class: 'num' }, n(q)), el('td', { class: 'num' }, pct(q, r.tot)))))));
      const exp = doAno.map((x) => ({ canal: x.canal === 'esic' ? 'e-SIC' : 'Ouvidoria', ano: x.ano, mes: x.mes, nota: x.nota, resolvido: x.resolvido, quantidade: Number(x.quantidade) }));
      painelAno.replaceChildren(
        el('div', { class: 'barra-lista' }, el('h3', { style: 'margin:0' }, 'Resultados de ' + ano), S.botoesExportar('pesquisa-satisfacao-' + ano,
          [['canal', 'Canal'], ['ano', 'Ano'], ['mes', 'Mês'], ['nota', 'Nota'], ['resolvido', 'Resolveu', (v) => ({ sim: 'Sim', parcial: 'Em parte', nao: 'Não' }[v])], ['quantidade', 'Avaliações']], async (de) => de ? [] : exp)),
        el('div', { class: 'grade grade-3', style: 'margin-top:12px' }, cartaoCanal('Todos os canais', resumo(() => true)),
          doAno.some((x) => x.canal === 'esic') ? cartaoCanal('e-SIC', resumo((x) => x.canal === 'esic')) : '',
          doAno.some((x) => x.canal === 'ouvidoria') ? cartaoCanal('Ouvidoria', resumo((x) => x.canal === 'ouvidoria')) : ''));
    }
  }

  R.esic = function (main, partes, params) {
    return T.paginaAbas(main, { rota: 'esic', titulo: 'e-SIC — Acesso à informação', trilha: [['Atendimento']],
      sub: 'Serviço de Informação ao Cidadão: como pedir informações ao órgão (Lei 12.527/2011), acompanhamento do pedido, prazos e recursos, relatórios estatísticos e informações classificadas e desclassificadas.',
      abas: [
        ['como-pedir', 'Como pedir', 'Unidade responsável, endereço, telefone, e-mail, horário, formulário eletrônico e a norma local da Lei de Acesso à Informação.', (c) => comoPedir(c)],
        ['pedir', 'Fazer pedido', 'Formulário do pedido de acesso à informação: sem cadastro e sem precisar dizer o motivo.', (c) => registrar(c, 'esic')],
        ['acompanhar', 'Acompanhar pedido', 'Situação, prazo, resposta e recurso pelo protocolo e pelo código de acesso.', (c, prm) => acompanhar(c, 'esic', prm)],
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
        botaoFormulario('ouvidoria', r, 'Registrar manifestação pela internet', 'O canal eletrônico está em implantação. Fale com a Ouvidoria pelos contatos abaixo.'),
        r.outros_canais ? el('p', null, el('strong', null, 'Outras formas: '), r.outros_canais) : '',
        r.prazo_resposta ? el('p', null, el('strong', null, 'Prazo de resposta: '), r.prazo_resposta) : ''),
      el('div', { class: 'grade grade-2' },
        cartaoContato('Atendimento presencial', d, 'Ouvidor(a)'),
        cartaoNorma('Norma da Ouvidoria', d, null)),
      r.instrucoes ? el('section', { style: 'margin-top:24px' }, texto(r.instrucoes)) : '',
      el('p', { style: 'margin-top:18px' }, el('a', { href: '#/ouvidoria/relatorios' }, 'Relatórios estatísticos das manifestações'), ' · ',
        S.linkDestino('ouvidoria_satisfacao', 'Pesquisa de satisfação'), ' · ', el('a', { href: '#/servicos' }, 'Carta de Serviços ao Usuário')),
      atualizado(r));
  }

  R.ouvidoria = function (main, partes, params) {
    return T.paginaAbas(main, { rota: 'ouvidoria', titulo: 'Ouvidoria', trilha: [['Atendimento']],
      sub: 'Canal para reclamações, denúncias, sugestões, elogios e solicitações sobre os serviços públicos (Lei 13.460/2017): onde e como se manifestar, acompanhamento, relatórios e pesquisa de satisfação.',
      abas: [
        ['como-manifestar', 'Como se manifestar', 'Endereço, telefone, horário, canal eletrônico, tipos de manifestação e prazo de resposta.', (c) => comoManifestar(c)],
        ['manifestar', 'Registrar manifestação', 'Reclamação, denúncia (inclusive anônima), sugestão, elogio, solicitação ou simplificação, sem cadastro.', (c) => registrar(c, 'ouvidoria')],
        ['acompanhar', 'Acompanhar', 'Situação, prazo e resposta pelo protocolo e pelo código de acesso.', (c, prm) => acompanhar(c, 'ouvidoria', prm)],
        ['relatorios', 'Relatórios estatísticos', 'Manifestações recebidas por exercício, por tipo e situação.',
          (c, prm) => T.comSecao(c, 'ouvidoria_relatorios', '', () => relatorios(c, prm, 'ouvidoria'))],
        ['satisfacao', 'Pesquisa de satisfação', 'Avaliação dos usuários sobre o atendimento do e-SIC e da Ouvidoria (PNTP 15.6).',
          (c, prm) => T.comSecao(c, 'ouvidoria_satisfacao', '', () => satisfacao(c, prm))]
      ] }, partes, params);
  };
})();
