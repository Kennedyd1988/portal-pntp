// =====================================================================
// Site público — Câmara Municipal (Portal PNTP · SOFT+)
// Matriz do Poder Legislativo do PNTP 2026 (dimensão 20):
//   #/parlamentares, #/parlamentar/:id ..... 20.1 composição e biografias (e 20.11 de cada um)
//   #/proposicoes, #/proposicao/:id ........ 20.3 projetos, autoria, relatoria e tramitação
//   #/sessoes, #/sessao/:id ................ 20.4 pautas, 20.6 atas e presenças, 20.9 vídeo
//   #/comissoes ............................ 20.5 comissões e pautas das reuniões
//   #/votacoes ............................. 20.7 votações nominais
//   #/verba-indenizatoria .................. 20.10 regulamentação e valores
//   #/atividade-parlamentar ................ 20.11 atividade de cada vereador no ano
// Leis e decretos legislativos (20.2) ficam em #/publicacoes; o julgamento das contas (20.8)
// em #/planejamento.
// =====================================================================
(function () {
  'use strict';
  const S = window.SITE;
  const { sb, el, dataBR } = S;
  const R = S.rotas;
  const U = S.util;
  const org = () => S.orgao.id;
  const pagina = U.pagina;
  const so = (main) => { if (S.orgao.tipo !== 'camara') { R['*'](main); return false; } return true; };
  const TIPOS_PROP = { projeto_lei: 'Projeto de Lei', projeto_lei_complementar: 'Projeto de Lei Complementar', projeto_emenda_lei_organica: 'Proposta de Emenda à Lei Orgânica',
    projeto_resolucao: 'Projeto de Resolução', projeto_decreto_legislativo: 'Projeto de Decreto Legislativo', requerimento: 'Requerimento', indicacao: 'Indicação',
    mocao: 'Moção', veto: 'Veto', emenda: 'Emenda', outro: 'Proposição' };
  const AND_PROP = { em_tramitacao: ['Em tramitação', 'etiqueta-ambar'], aprovada: ['Aprovada', 'etiqueta-verde'], rejeitada: ['Rejeitada', 'etiqueta-vermelha'],
    arquivada: ['Arquivada', 'etiqueta-ambar'], retirada: ['Retirada', 'etiqueta-ambar'], vetada: ['Vetada', 'etiqueta-vermelha'],
    transformada_norma: ['Transformada em norma', 'etiqueta-verde'], prejudicada: ['Prejudicada', 'etiqueta-ambar'] };
  const TIPOS_SESSAO = { ordinaria: 'Sessão ordinária', extraordinaria: 'Sessão extraordinária', solene: 'Sessão solene', especial: 'Sessão especial',
    audiencia_publica: 'Audiência pública', reuniao: 'Reunião de comissão' };
  const AND_SESSAO = { prevista: ['Prevista', 'etiqueta-ambar'], realizada: ['Realizada', 'etiqueta-verde'], cancelada: ['Cancelada', 'etiqueta-vermelha'], adiada: ['Adiada', 'etiqueta-ambar'] };
  const FUNCOES = { presidente: 'Presidente', vice_presidente: 'Vice-presidente', relator: 'Relator', membro: 'Membro', suplente: 'Suplente' };
  const VOTOS = { sim: 'Sim', nao: 'Não', abstencao: 'Abstenção', ausente: 'Ausente', nao_votou: 'Não votou (presidente)' };
  const TIPOS_COMISSAO = { permanente: 'Permanente', temporaria: 'Temporária', especial: 'Especial', cpi: 'CPI', outra: 'Outra' };
  const nomeProp = (x) => (TIPOS_PROP[x.tipo] || 'Proposição') + ' nº ' + x.numero + '/' + x.ano;
  const nomeSessao = (s) => (TIPOS_SESSAO[s.tipo] || 'Sessão') + (s.numero ? ' nº ' + s.numero : '') + ' de ' + dataBR(s.data);
  const nomeParl = (p) => p ? (p.nome_parlamentar || p.nome) : '';
  const etiqueta = (par) => el('span', { class: 'etiqueta ' + par[1] }, par[0]);
  const novaAba = () => el('span', { class: 'sr' }, ' (abre em nova aba)');
  const linkExt = (href, rotulo, cls) => el('a', { href, target: '_blank', rel: 'noopener', class: cls || null }, rotulo, novaAba());
  let cacheParl = null;
  async function parlamentares() {
    if (!cacheParl || cacheParl.org !== org()) {
      const { data } = await sb.from('parlamentares').select('id, nome, nome_parlamentar, partido, cargo_mesa, foto_url, biografia, email, telefone, legislatura_inicio, legislatura_fim, em_exercicio, ordem')
        .eq('orgao_id', org()).order('em_exercicio', { ascending: false }).order('ordem').order('nome');
      cacheParl = { org: org(), lista: data || [] };
    }
    return cacheParl.lista;
  }
  const trilha = (...x) => S.trilha(['Câmara', '#/parlamentares'], ...x);

  // ---------- 20.1 Vereadores ----------
  const cartaoVereador = (p) => el('a', { class: 'cartao cartao-vereador', href: '#/parlamentar/' + p.id },
    p.foto_url ? el('img', { src: p.foto_url, alt: 'Foto de ' + nomeParl(p), loading: 'lazy', class: 'foto-vereador' }) : el('span', { class: 'foto-vereador foto-vazia', 'aria-hidden': 'true' }, nomeParl(p).slice(0, 1)),
    el('strong', null, nomeParl(p)), el('span', { class: 'meta' }, [p.partido, p.cargo_mesa].filter(Boolean).join(' · ')));
  R.parlamentares = async function (main) {
    if (!so(main)) return;
    S.titulo('Vereadores'); trilha(['Vereadores']);
    const lista = await parlamentares();
    const atuais = lista.filter((p) => p.em_exercicio), outros = lista.filter((p) => !p.em_exercicio);
    const leg = atuais.find((p) => p.legislatura_inicio);
    pagina(main, el('h1', null, 'Vereadores'),
      el('p', { class: 'sub' }, 'Composição da Câmara' + (leg ? ' na legislatura ' + leg.legislatura_inicio + (leg.legislatura_fim ? '–' + leg.legislatura_fim : '') : '') + ', com partido, cargo na Mesa Diretora e biografia de cada vereador.'),
      atuais.length ? el('div', { class: 'grade-vereadores' }, atuais.map(cartaoVereador)) : el('p', { class: 'vazio' }, 'Composição em atualização.'),
      el('p', { class: 'mt-2' }, S.linkDestino('atividade_parlamentar', 'Atividade de cada vereador (autoria, relatoria, presenças, diárias e emendas) →')),
      outros.length ? el('section', { class: 'mt-3' }, el('h2', null, 'Fora de exercício e legislaturas anteriores'), el('div', { class: 'grade-vereadores' }, outros.map(cartaoVereador))) : null);
  };
  R.parlamentar = async function (main, partes) {
    if (!so(main)) return;
    const id = partes[0];
    const p = (await parlamentares()).find((x) => x.id === id);
    if (!p) return R['*'](main);
    const ano = new Date().getFullYear();
    const [{ data: com }, { data: ativ }, { data: props }, { data: votos }, { data: verba }, { data: diar }, { data: emen }] = await Promise.all([
      sb.from('comissoes_membros').select('funcao, comissoes(nome, ativa)').eq('parlamentar_id', id),
      sb.rpc('atividade_parlamentar', { p_orgao: org(), p_ano: ano }),
      sb.from('proposicoes_autores').select('papel, proposicoes(id, tipo, numero, ano, ementa, andamento, data_apresentacao)').eq('parlamentar_id', id).limit(300),
      sb.from('votacoes_votos').select('voto, votacoes(descricao, resultado, sessoes(id, tipo, numero, data))').eq('parlamentar_id', id).limit(300),
      sb.rpc('verba_publica', { p_orgao: org(), p_ano: ano }),
      // Script 36: diárias que ele recebeu (desta Câmara) e emendas municipais de autoria dele (orçamento da Prefeitura).
      sb.from('diarias').select('id, destino, motivo, data_inicio, data_fim, quantidade, valor_total, exercicio').eq('parlamentar_id', id).order('data_inicio', { ascending: false }).limit(200),
      sb.from('emendas').select('id, exercicio, numero, objeto, beneficiario, valor_previsto, valor_pago, andamento').eq('parlamentar_id', id).eq('situacao', 'publicado').order('exercicio', { ascending: false }).limit(200)
    ]);
    const AND_EMENDA = { prevista: 'Prevista', em_execucao: 'Em execução', concluida: 'Concluída', impedida: 'Impedida', cancelada: 'Cancelada' };
    const minhasDiarias = diar || [], minhasEmendas = emen || [];
    const soma = (l, k) => l.reduce((t, x) => t + Number(x[k] || 0), 0);
    const meusVotos = (votos || []).filter((x) => x.votacoes && x.votacoes.sessoes).sort((a, b) => String(b.votacoes.sessoes.data).localeCompare(String(a.votacoes.sessoes.data))).slice(0, 20);
    const minhaVerba = (verba || []).filter((x) => x.parlamentar_id === id);
    const a = (ativ || []).find((x) => x.parlamentar_id === id);
    const lista = (props || []).filter((x) => x.proposicoes).sort((x, y) => String(y.proposicoes.data_apresentacao).localeCompare(String(x.proposicoes.data_apresentacao)));
    S.titulo(nomeParl(p)); trilha(['Vereadores', '#/parlamentares'], [nomeParl(p)]);
    pagina(main, el('div', { class: 'perfil-vereador' },
      p.foto_url ? el('img', { src: p.foto_url, alt: 'Foto de ' + nomeParl(p), class: 'foto-vereador foto-grande' }) : null,
      el('div', null, el('h1', null, nomeParl(p)), p.nome_parlamentar ? el('p', { class: 'meta' }, 'Nome civil: ' + p.nome) : null,
        el('p', null, [p.partido, p.cargo_mesa, p.legislatura_inicio ? 'Legislatura ' + p.legislatura_inicio + (p.legislatura_fim ? '–' + p.legislatura_fim : '') : null, p.em_exercicio ? null : 'Fora de exercício'].filter(Boolean).join(' · ')),
        p.email ? el('p', null, 'E-mail: ', el('a', { href: 'mailto:' + p.email }, p.email)) : null, p.telefone ? el('p', null, 'Telefone: ' + p.telefone) : null)),
      p.biografia ? el('section', { class: 'cartao mt-2' }, el('h2', null, 'Biografia'), el('p', { class: 'pre' }, p.biografia)) : null,
      (com || []).length ? el('section', { class: 'mt-2' }, el('h2', null, 'Comissões'), el('ul', null, com.filter((c) => c.comissoes).map((c) => el('li', null, c.comissoes.nome + ' — ' + (FUNCOES[c.funcao] || c.funcao) + (c.comissoes.ativa ? '' : ' (encerrada)'))))) : null,
      a ? el('section', { class: 'mt-2' }, el('h2', null, 'Atividade em ' + ano), el('ul', { class: 'numeros-atividade' },
        el('li', null, el('strong', null, String(a.autorias)), ' proposições de autoria'), el('li', null, el('strong', null, String(a.relatorias)), ' relatorias'),
        el('li', null, el('strong', null, a.presencas + ' de ' + a.sessoes), ' presenças em sessões'), el('li', null, el('strong', null, String(a.votos)), ' votos registrados'),
        a.diarias !== undefined ? el('li', null, el('strong', null, String(a.diarias)), ' diárias recebidas' + (Number(a.diarias) ? ' (' + U.moedaBR(Number(a.diarias_valor)) + ')' : '')) : null,
        a.emendas !== undefined ? el('li', null, el('strong', null, String(a.emendas)), ' emendas municipais' + (Number(a.emendas) ? ' (' + U.moedaBR(Number(a.emendas_valor)) + ' previstos)' : '')) : null)) : null,
      meusVotos.length ? el('section', { class: 'mt-2' }, el('h2', null, 'Votos recentes'), el('ul', { class: 'partes-contas cartao' }, meusVotos.map((x) => el('li', null,
        el('a', { href: '#/sessao/' + x.votacoes.sessoes.id }, x.votacoes.descricao), el('span', { class: 'meta' }, dataBR(x.votacoes.sessoes.data) + ' · votou: ' + (VOTOS[x.voto] || x.voto) + ' · ' + (x.votacoes.resultado === 'aprovada' ? 'aprovada' : x.votacoes.resultado === 'rejeitada' ? 'rejeitada' : x.votacoes.resultado)))))) : null,
      minhaVerba.length ? el('section', { class: 'mt-2' }, el('h2', null, 'Verba indenizatória em ' + ano), el('p', null, minhaVerba.length + ' pagamentos, total ' + U.moedaBR(minhaVerba.reduce((t, x) => t + Number(x.valor), 0)) + '. '),
        S.linkDestino('verba_indenizatoria', 'Ver todos os pagamentos →')) : null,
      minhasEmendas.length ? el('section', { class: 'mt-2' }, el('h2', null, 'Emendas ao orçamento municipal'),
        el('p', { class: 'meta' }, minhasEmendas.length + ' emenda(s) de autoria do vereador, publicadas pela Prefeitura · ' + U.moedaBR(soma(minhasEmendas, 'valor_previsto')) + ' previstos, ' + U.moedaBR(soma(minhasEmendas, 'valor_pago')) + ' pagos.'),
        el('ul', { class: 'partes-contas cartao' }, minhasEmendas.slice(0, 30).map((x) => el('li', null,
          el('strong', null, 'Emenda nº ' + x.numero + ' (' + x.exercicio + ')'),
          el('span', { class: 'meta' }, x.objeto + (x.beneficiario ? ' · Beneficiário: ' + x.beneficiario : '') + ' · ' + U.moedaBR(Number(x.valor_previsto)) + ' previstos · ' + (AND_EMENDA[x.andamento] || x.andamento)))))) : null,
      minhasDiarias.length ? el('section', { class: 'mt-2' }, el('h2', null, 'Diárias recebidas'),
        el('p', { class: 'meta' }, minhasDiarias.length + ' concessão(ões) · ' + U.moedaBR(soma(minhasDiarias, 'valor_total')) + ' no total. ', S.linkDestino('diarias', 'Ver todas as diárias da Câmara →')),
        el('ul', { class: 'partes-contas cartao' }, minhasDiarias.slice(0, 30).map((x) => el('li', null,
          el('strong', null, x.destino + ' · ' + dataBR(x.data_inicio) + (x.data_fim !== x.data_inicio ? ' a ' + dataBR(x.data_fim) : '')),
          el('span', { class: 'meta' }, x.motivo + ' · ' + String(x.quantidade).replace('.', ',') + ' diária(s) · ' + U.moedaBR(Number(x.valor_total))))))) : null,
      secaoProposicoes(lista));
  };
  // Proposições do vereador em abas por tipo (projetos de lei, indicações, requerimentos…) e relatorias.
  const PLURAL_PROP = { projeto_lei: 'Projetos de lei', projeto_lei_complementar: 'Projetos de lei complementar', projeto_emenda_lei_organica: 'Emendas à Lei Orgânica',
    projeto_resolucao: 'Projetos de resolução', projeto_decreto_legislativo: 'Projetos de decreto legislativo', requerimento: 'Requerimentos', indicacao: 'Indicações',
    mocao: 'Moções', veto: 'Vetos', emenda: 'Emendas', outro: 'Outras' };
  function secaoProposicoes(lista) {
    const sec = el('section', { class: 'mt-2' }, el('h2', null, 'Proposições'));
    if (!lista.length) { sec.append(el('p', { class: 'vazio' }, 'Nenhuma proposição registrada.')); return sec; }
    const autoria = lista.filter((x) => x.papel !== 'relator'), relatorias = lista.filter((x) => x.papel === 'relator');
    const tipos = Object.keys(PLURAL_PROP).filter((t) => autoria.some((x) => x.proposicoes.tipo === t));
    const abas = [['todas', 'Todas (' + autoria.length + ')']].concat(tipos.map((t) => [t, PLURAL_PROP[t] + ' (' + autoria.filter((x) => x.proposicoes.tipo === t).length + ')']),
      relatorias.length ? [['relatorias', 'Relatorias (' + relatorias.length + ')']] : []);
    const painel = el('div', { class: 'painel-guia painel-guia-interno', role: 'tabpanel' });
    const mostrar = (id) => {
      const itens = id === 'relatorias' ? relatorias : id === 'todas' ? autoria : autoria.filter((x) => x.proposicoes.tipo === id);
      painel.replaceChildren(itens.length ? el('ul', { class: 'partes-contas cartao' }, itens.map((x) => el('li', null,
        el('a', { href: '#/proposicao/' + x.proposicoes.id }, nomeProp(x.proposicoes)), ' ', AND_PROP[x.proposicoes.andamento] ? etiqueta(AND_PROP[x.proposicoes.andamento]) : null,
        el('span', { class: 'meta' }, (x.papel === 'coautor' ? 'Coautoria · ' : '') + (x.proposicoes.data_apresentacao ? dataBR(x.proposicoes.data_apresentacao) + ' · ' : '') + x.proposicoes.ementa))))
        : el('p', { class: 'vazio' }, 'Nenhuma proposição de autoria do vereador.'));
    };
    const inicial = autoria.length ? 'todas' : 'relatorias';
    const faixa = U.faixaAbas(abas, inicial, 'Tipo de proposição', true, mostrar);
    mostrar(inicial);
    sec.append(faixa.lista, painel, el('p', { class: 'mt-1' }, S.linkDestino('proposicoes', 'Todas as proposições da Câmara →')));
    return sec;
  }

  // ---------- 20.11 Atividade de cada vereador ----------
  R['atividade-parlamentar'] = async function (main, partes, params) {
    if (!so(main)) return;
    S.titulo('Atividade dos vereadores'); trilha(['Atividade dos vereadores']);
    const atual = new Date().getFullYear();
    let ano = Number(params.get('ano')) || atual;
    const caixa = el('div');
    const anos = []; for (let a = atual; a >= atual - 4; a--) anos.push([a, String(a)]);
    const faixa = U.faixaAbas(anos, ano, 'Ano', false, (id) => { ano = Number(id); history.replaceState(null, '', '#/atividade-parlamentar?ano=' + ano); desenhar(); });
    pagina(main, el('h1', null, 'Atividade dos vereadores'),
      el('p', { class: 'sub' }, 'Proposições de autoria, relatorias, presença nas sessões, votos registrados, diárias recebidas e emendas ao orçamento municipal de cada vereador, por ano. Os números vêm das proposições, sessões, votações, diárias e emendas publicadas.'),
      faixa.lista, el('div', { class: 'painel-guia painel-guia-interno', role: 'tabpanel' }, caixa));
    faixa.marcar(ano);
    async function desenhar() {
      caixa.replaceChildren(el('p', { class: 'carregando' }, 'Carregando…'));
      const { data, error } = await sb.rpc('atividade_parlamentar', { p_orgao: org(), p_ano: ano });
      if (error) { caixa.replaceChildren(el('p', null, 'Não foi possível carregar. Tente novamente.')); return; }
      const linhas = data || [];
      const comExtras = linhas.length && linhas[0].diarias !== undefined;   // script 36: diárias e emendas municipais
      const colunas = [['nome', 'Vereador'], ['partido', 'Partido'], ['autorias', 'Proposições de autoria'], ['relatorias', 'Relatorias'], ['presencas', 'Presenças'], ['sessoes', 'Sessões'], ['votos', 'Votos'], ['comissoes', 'Comissões']]
        .concat(comExtras ? [['diarias', 'Diárias recebidas'], ['diarias_valor', 'Valor das diárias (R$)'], ['emendas', 'Emendas municipais'], ['emendas_valor', 'Valor previsto das emendas (R$)']] : []);
      caixa.replaceChildren(el('div', { class: 'barra-lista' }, el('span', { class: 'meta' }, linhas.length + ' vereadores'), S.botoesExportar('atividade-vereadores-' + ano, colunas, async (de) => de ? [] : linhas)),
        linhas.length ? el('div', { class: 'tabela-rolagem' }, el('table', { class: 'tabela-dados' }, el('caption', { class: 'sr' }, 'Atividade dos vereadores em ' + ano),
          el('thead', null, el('tr', null, ['Vereador', 'Autoria', 'Relatoria', 'Presenças', 'Votos', 'Comissões'].concat(comExtras ? ['Diárias', 'Emendas'] : []).map((t) => el('th', { scope: 'col' }, t)))),
          el('tbody', null, linhas.map((x) => el('tr', null,
            el('td', { 'data-rotulo': 'Vereador' }, el('a', { href: '#/parlamentar/' + x.parlamentar_id }, x.nome), x.partido ? el('span', { class: 'meta' }, ' ' + x.partido) : null),
            el('td', { 'data-rotulo': 'Autoria', class: 'num' }, String(x.autorias)), el('td', { 'data-rotulo': 'Relatoria', class: 'num' }, String(x.relatorias)),
            el('td', { 'data-rotulo': 'Presenças', class: 'num' }, x.sessoes ? x.presencas + ' de ' + x.sessoes : '—'), el('td', { 'data-rotulo': 'Votos', class: 'num' }, String(x.votos)),
            el('td', { 'data-rotulo': 'Comissões' }, x.comissoes || '—'),
            comExtras ? el('td', { 'data-rotulo': 'Diárias', class: 'num' }, Number(x.diarias) ? x.diarias + ' · ' + U.moedaBR(Number(x.diarias_valor)) : '—') : null,
            comExtras ? el('td', { 'data-rotulo': 'Emendas', class: 'num' }, Number(x.emendas) ? x.emendas + ' · ' + U.moedaBR(Number(x.emendas_valor)) : '—') : null)))))
          : el('p', { class: 'vazio' }, 'Nenhum vereador publicado.'));
    }
    desenhar();
  };

  // ---------- 20.3 Proposições ----------
  const CAMPOS_PROP = 'id, tipo, numero, ano, ementa, autoria_externa, data_apresentacao, andamento, arquivo_url, link_externo, atualizado_em, proposicoes_autores(papel, parlamentares(nome, nome_parlamentar, partido))';
  const autoria = (x) => (x.proposicoes_autores || []).filter((a) => a.papel !== 'relator' && a.parlamentares).map((a) => nomeParl(a.parlamentares)).join(', ') || x.autoria_externa || '—';
  const relator = (x) => (x.proposicoes_autores || []).filter((a) => a.papel === 'relator' && a.parlamentares).map((a) => nomeParl(a.parlamentares)).join(', ');
  R.proposicoes = async function (main, partes, params) {
    if (!so(main)) return;
    S.titulo('Projetos e proposições'); trilha(['Projetos e proposições']);
    const conteudo = el('div', { class: 'painel-guia', role: 'tabpanel' }, el('p', { class: 'carregando' }, 'Carregando…'));
    pagina(main, el('h1', null, 'Projetos e proposições'),
      el('p', { class: 'sub' }, 'Projetos de lei, de resolução e de decreto legislativo, requerimentos, indicações e moções, com a ementa, o autor, o relator, a situação atual e a tramitação.'), conteudo);
    return U.listaAnual(conteudo, params, {
      base: '#/proposicoes', titulo: 'Projetos e proposições', rotuloAno: 'Ano', nome: 'proposicoes', unidade: ['proposição', 'proposições'], ordem: 'data_apresentacao',
      vazio: 'Não há proposições publicadas.',
      anos: async () => { const { data, error } = await sb.rpc('legislativo_anos', { p_orgao: org(), p_qual: 'proposicoes' }); return error ? null : data || []; },
      montar: (sel, op, ano, f) => {
        let q = sb.from('proposicoes').select(sel || CAMPOS_PROP, op).eq('orgao_id', org());
        if (ano !== 'todos') q = q.eq('ano', ano);
        if (f.busca) q = q.ilike('busca', U.termo(f.busca));
        if (f.tipo) q = q.eq('tipo', f.tipo);
        if (f.andamento) q = q.eq('andamento', f.andamento);
        return q;
      },
      filtros: () => [['busca', 'Pesquisar (número, ementa, autoria)', el('input', { type: 'search', placeholder: 'Ex.: 12/2026, iluminação, Poder Executivo' })],
        ['tipo', 'Tipo', U.selecao(TIPOS_PROP)], ['andamento', 'Situação', U.selecao(AND_PROP)]],
      cabecalho: ['Proposição', 'Autoria', 'Apresentação', 'Situação'],
      colunas: [['tipo', 'Tipo', (v) => TIPOS_PROP[v] || v], ['numero', 'Número'], ['ano', 'Ano'], ['ementa', 'Ementa'], ['data_apresentacao', 'Apresentação'],
        ['autoria_externa', 'Autoria', (v, r) => autoria(r)], ['andamento', 'Situação', (v) => AND_PROP[v] ? AND_PROP[v][0] : v], ['arquivo_url', 'Texto', (v, r) => v || r.link_externo || '']],
      linha: (x) => el('tr', null,
        el('td', { 'data-rotulo': 'Proposição', class: 'lic-obj' }, el('a', { href: '#/proposicao/' + x.id }, el('strong', null, nomeProp(x))), el('span', { class: 'meta' }, x.ementa)),
        el('td', { 'data-rotulo': 'Autoria' }, autoria(x)),
        el('td', { 'data-rotulo': 'Apresentação', class: 'num' }, dataBR(x.data_apresentacao)),
        el('td', { 'data-rotulo': 'Situação' }, etiqueta(AND_PROP[x.andamento] || [x.andamento, 'etiqueta-ambar'])),
        el('td', { 'data-rotulo': '' }, el('a', { href: '#/proposicao/' + x.id, class: 'botao botao-claro botao-p' }, 'Tramitação', el('span', { class: 'sr' }, ' de ' + nomeProp(x)))))
    });
  };
  R.proposicao = async function (main, partes) {
    if (!so(main)) return;
    const id = partes[0];
    if (!/^[0-9a-f-]{36}$/i.test(id || '')) return R['*'](main);
    const [{ data: x }, { data: tram }, { data: vot }] = await Promise.all([
      sb.from('proposicoes').select(CAMPOS_PROP + ', norma_id, publicacoes(tipo, numero, ano, arquivo_url, link_externo)').eq('orgao_id', org()).eq('id', id).maybeSingle(),
      sb.from('proposicoes_tramites').select('data, descricao, arquivo_url').eq('proposicao_id', id).order('data').order('criado_em'),
      sb.from('votacoes').select('descricao, resultado, unanime, votos_sim, votos_nao, abstencoes, sessoes(id, tipo, numero, data)').eq('proposicao_id', id)
    ]);
    if (!x) return R['*'](main);
    S.titulo(nomeProp(x)); trilha(['Projetos e proposições', '#/proposicoes'], [nomeProp(x)]);
    const linha = (rot, val) => val ? el('div', null, el('dt', null, rot), el('dd', null, val)) : null;
    const norma = x.publicacoes;
    pagina(main, el('p', { class: 'meta' }, 'Projetos e proposições · ' + x.ano), el('h1', null, nomeProp(x)), el('p', { class: 'sub' }, x.ementa),
      el('p', null, etiqueta(AND_PROP[x.andamento] || [x.andamento, 'etiqueta-ambar'])),
      el('dl', { class: 'ficha-lic' }, linha('Autoria', autoria(x)), linha('Relator', relator(x)), linha('Apresentação', dataBR(x.data_apresentacao)),
        linha('Norma resultante', norma ? ((norma.tipo || '') + ' nº ' + norma.numero + '/' + norma.ano) : null)),
      el('p', { class: 'mt-2' }, x.arquivo_url ? linkExt(x.arquivo_url, 'Texto da proposição (PDF)', 'botao') : null, ' ',
        x.link_externo ? linkExt(x.link_externo, 'Ver no sistema legislativo', 'botao botao-claro') : null, ' ',
        norma && (norma.arquivo_url || norma.link_externo) ? linkExt(norma.arquivo_url || norma.link_externo, 'Norma publicada', 'botao botao-claro') : null),
      el('section', { class: 'mt-3' }, el('h2', null, 'Tramitação'), (tram || []).length ? el('ol', { class: 'linha-tempo' }, tram.map((t) => el('li', null,
        el('strong', null, dataBR(t.data)), ' — ', t.descricao, t.arquivo_url ? [' · ', linkExt(t.arquivo_url, 'documento')] : null))) : el('p', { class: 'vazio' }, 'Sem andamentos registrados.')),
      (vot || []).length ? el('section', { class: 'mt-3' }, el('h2', null, 'Votações'), el('ul', null, vot.map((v) => el('li', null,
        v.sessoes ? el('a', { href: '#/sessao/' + v.sessoes.id }, nomeSessao(v.sessoes)) : null, ' — ', v.descricao, ': ', v.resultado === 'aprovada' ? 'aprovada' : v.resultado === 'rejeitada' ? 'rejeitada' : v.resultado,
        v.unanime ? ' por unanimidade' : v.votos_sim != null ? ' (' + v.votos_sim + ' a ' + (v.votos_nao || 0) + (v.abstencoes ? ', ' + v.abstencoes + ' abstenções' : '') + ')' : '')))) : null);
  };

  // ---------- 20.4, 20.6, 20.9 Sessões ----------
  const CAMPOS_SESSAO = 'id, tipo, numero, data, hora, local, pauta, pauta_url, ata_url, ata_aprovada_em, video_url, andamento, comissao_id, atualizado_em, comissoes(nome)';
  const caixaTransmissao = () => /^https?:\/\//.test(S.conf.transmissao_url || '') ? el('section', { class: 'cartao destaque-acao mb-2' },
    el('h2', null, 'Assista às sessões'), el('p', null, 'As sessões, audiências e consultas públicas são transmitidas ao vivo.'), linkExt(S.conf.transmissao_url, 'Canal de transmissão', 'botao')) : null;
  function listaSessoes(conteudo, params, base, soComissoes) {
    return U.listaAnual(conteudo, params, {
      base, titulo: soComissoes ? 'Reuniões das comissões' : 'Sessões', rotuloAno: 'Ano', nome: soComissoes ? 'reunioes-comissoes' : 'sessoes', unidade: soComissoes ? ['reunião', 'reuniões'] : ['sessão', 'sessões'],
      ordem: 'data', declaracao: soComissoes ? 'legislativo_comissoes' : null, abrirRecente: true,
      vazio: soComissoes ? 'Não há reuniões de comissão publicadas.' : 'Não há sessões publicadas.',
      anos: async () => { const { data, error } = await sb.rpc('legislativo_anos', { p_orgao: org(), p_qual: soComissoes ? 'comissoes' : 'sessoes' }); return error ? null : data || []; },
      montar: (sel, op, ano, f) => {
        let q = sb.from('sessoes').select(sel || CAMPOS_SESSAO, op).eq('orgao_id', org());
        if (ano !== 'todos') q = q.gte('data', ano + '-01-01').lte('data', ano + '-12-31');
        if (soComissoes) q = q.not('comissao_id', 'is', null);
        if (f.busca) q = q.ilike('busca', U.termo(f.busca));
        if (f.tipo) q = q.eq('tipo', f.tipo);
        if (f.colegiado === 'plenario') q = q.is('comissao_id', null); else if (f.colegiado === 'comissoes') q = q.not('comissao_id', 'is', null);
        return q;
      },
      filtros: () => [['busca', 'Pesquisar na pauta', el('input', { type: 'search', placeholder: 'Ex.: projeto de lei, orçamento' })], ['tipo', 'Tipo', U.selecao(TIPOS_SESSAO)]]
        .concat(soComissoes ? [] : [['colegiado', 'Colegiado', U.selecao({ plenario: 'Plenário', comissoes: 'Comissões' })]]),
      cabecalho: ['Data', 'Sessão', 'Pauta', 'Ata', 'Vídeo'],
      colunas: [['data', 'Data'], ['hora', 'Hora'], ['tipo', 'Tipo', (v) => TIPOS_SESSAO[v] || v], ['numero', 'Número'], ['comissao_id', 'Colegiado', (v, r) => r.comissoes ? r.comissoes.nome : 'Plenário'],
        ['andamento', 'Andamento', (v) => AND_SESSAO[v] ? AND_SESSAO[v][0] : v], ['pauta', 'Pauta'], ['pauta_url', 'Pauta (arquivo)'], ['ata_url', 'Ata'], ['video_url', 'Vídeo']],
      linha: (s) => el('tr', null,
        el('td', { 'data-rotulo': 'Data', class: 'num' }, dataBR(s.data) + (s.hora ? ' ' + s.hora.slice(0, 5) : '')),
        el('td', { 'data-rotulo': 'Sessão', class: 'lic-obj' }, el('a', { href: '#/sessao/' + s.id }, el('strong', null, (TIPOS_SESSAO[s.tipo] || 'Sessão') + (s.numero ? ' nº ' + s.numero : ''))),
          el('span', { class: 'meta' }, (s.comissoes ? s.comissoes.nome : 'Plenário') + ' · ' + (AND_SESSAO[s.andamento] || [''])[0])),
        el('td', { 'data-rotulo': 'Pauta' }, s.pauta_url ? linkExt(s.pauta_url, 'Pauta') : s.pauta ? el('a', { href: '#/sessao/' + s.id }, 'Ver pauta') : '—'),
        el('td', { 'data-rotulo': 'Ata' }, s.ata_url ? linkExt(s.ata_url, 'Ata') : '—'),
        el('td', { 'data-rotulo': 'Vídeo' }, s.video_url ? linkExt(s.video_url, 'Assistir') : '—'),
        el('td', { 'data-rotulo': '' }, el('a', { href: '#/sessao/' + s.id, class: 'botao botao-claro botao-p' }, 'Detalhes', el('span', { class: 'sr' }, ' de ' + nomeSessao(s)))))
    });
  }
  R.sessoes = async function (main, partes, params) {
    if (!so(main)) return;
    S.titulo('Sessões'); trilha(['Sessões']);
    const conteudo = el('div', { class: 'painel-guia', role: 'tabpanel' }, el('p', { class: 'carregando' }, 'Carregando…'));
    pagina(main, el('h1', null, 'Sessões'),
      el('p', { class: 'sub' }, 'Pauta das sessões do Plenário e das reuniões das comissões, atas com a lista de presença dos vereadores, votações e vídeos.'),
      caixaTransmissao(), el('p', null, S.linkDestino('votacoes', 'Votações nominais →'), ' · ', S.linkDestino('comissoes', 'Comissões →')), conteudo);
    return listaSessoes(conteudo, params, '#/sessoes', false);
  };
  R.sessao = async function (main, partes) {
    if (!so(main)) return;
    const id = partes[0];
    if (!/^[0-9a-f-]{36}$/i.test(id || '')) return R['*'](main);
    const [{ data: s }, { data: pres }, { data: vot }] = await Promise.all([
      sb.from('sessoes').select(CAMPOS_SESSAO).eq('orgao_id', org()).eq('id', id).maybeSingle(),
      sb.from('sessoes_presencas').select('presente, justificativa, parlamentares(id, nome, nome_parlamentar, partido)').eq('sessao_id', id),
      sb.from('votacoes').select('id, descricao, forma, resultado, unanime, votos_sim, votos_nao, abstencoes, proposicao_id, votacoes_votos(voto, parlamentares(nome, nome_parlamentar, partido))').eq('sessao_id', id).order('criado_em')
    ]);
    if (!s) return R['*'](main);
    S.titulo(nomeSessao(s)); trilha(['Sessões', '#/sessoes'], [nomeSessao(s)]);
    const pr = (pres || []).filter((x) => x.parlamentares).sort((a, b) => nomeParl(a.parlamentares).localeCompare(nomeParl(b.parlamentares), 'pt-BR'));
    pagina(main, el('p', { class: 'meta' }, (s.comissoes ? s.comissoes.nome : 'Plenário') + (s.local ? ' · ' + s.local : '')), el('h1', null, nomeSessao(s)),
      el('p', null, etiqueta(AND_SESSAO[s.andamento] || [s.andamento, 'etiqueta-ambar']), s.hora ? ' às ' + s.hora.slice(0, 5) : ''),
      el('p', null, s.pauta_url ? linkExt(s.pauta_url, 'Pauta (arquivo)', 'botao botao-claro') : null, ' ', s.ata_url ? linkExt(s.ata_url, 'Ata' + (s.ata_aprovada_em ? ' (aprovada em ' + dataBR(s.ata_aprovada_em) + ')' : ''), 'botao botao-claro') : null, ' ',
        s.video_url ? linkExt(s.video_url, 'Vídeo da sessão', 'botao botao-claro') : null),
      s.pauta ? el('section', { class: 'cartao mt-2' }, el('h2', null, 'Pauta'), el('p', { class: 'pre' }, s.pauta)) : null,
      pr.length ? el('section', { class: 'mt-3' }, el('h2', null, 'Lista de presença'), el('p', { class: 'meta' }, pr.filter((x) => x.presente).length + ' presentes de ' + pr.length),
        el('div', { class: 'tabela-rolagem' }, el('table', { class: 'tabela-dados' }, el('thead', null, el('tr', null, el('th', { scope: 'col' }, 'Vereador'), el('th', { scope: 'col' }, 'Presença'))),
          el('tbody', null, pr.map((x) => el('tr', null, el('td', { 'data-rotulo': 'Vereador' }, nomeParl(x.parlamentares) + (x.parlamentares.partido ? ' (' + x.parlamentares.partido + ')' : '')),
            el('td', { 'data-rotulo': 'Presença' }, x.presente ? 'Presente' : 'Ausente' + (x.justificativa ? ' — ' + x.justificativa : '')))))))) : null,
      (vot || []).length ? el('section', { class: 'mt-3' }, el('h2', null, 'Votações'), vot.map((v) => el('div', { class: 'cartao mb-2' },
        el('h3', { class: 'mt-0' }, v.descricao), el('p', null, v.resultado === 'aprovada' ? 'Aprovada' : v.resultado === 'rejeitada' ? 'Rejeitada' : 'Resultado: outro',
          v.unanime ? ' por unanimidade' : v.votos_sim != null ? ' — ' + v.votos_sim + ' sim, ' + (v.votos_nao || 0) + ' não, ' + (v.abstencoes || 0) + ' abstenções' : '',
          v.forma !== 'nominal' ? ' (votação ' + v.forma + ')' : ''),
        (v.votacoes_votos || []).length ? el('ul', { class: 'votos' }, v.votacoes_votos.filter((x) => x.parlamentares).map((x) => el('li', null, nomeParl(x.parlamentares) + ': ', el('strong', null, VOTOS[x.voto] || x.voto)))) : null))) : null);
  };

  // ---------- 20.5 Comissões ----------
  R.comissoes = async function (main, partes, params) {
    if (!so(main)) return;
    S.titulo('Comissões'); trilha(['Comissões']);
    const { data } = await sb.from('comissoes').select('id, nome, tipo, competencias, inicio, fim, ativa, comissoes_membros(funcao, parlamentares(id, nome, nome_parlamentar, partido))')
      .eq('orgao_id', org()).order('ativa', { ascending: false }).order('nome');
    const conteudo = el('div', { class: 'painel-guia', role: 'tabpanel' }, el('p', { class: 'carregando' }, 'Carregando…'));
    const ordemF = ['presidente', 'vice_presidente', 'relator', 'membro', 'suplente'];
    pagina(main, el('h1', null, 'Comissões'), el('p', { class: 'sub' }, 'Comissões permanentes e temporárias, seus membros e a pauta de cada reunião.'),
      (data || []).length ? el('div', { class: 'grade g2' }, data.map((c) => el('section', { class: 'cartao' },
        el('h2', { class: 'mt-0' }, c.nome), el('p', { class: 'meta' }, (TIPOS_COMISSAO[c.tipo] || c.tipo) + (c.ativa ? '' : ' · encerrada')),
        c.competencias ? el('p', null, c.competencias) : null,
        (c.comissoes_membros || []).length ? el('ul', null, c.comissoes_membros.filter((m) => m.parlamentares).sort((a, b) => ordemF.indexOf(a.funcao) - ordemF.indexOf(b.funcao))
          .map((m) => el('li', null, el('a', { href: '#/parlamentar/' + m.parlamentares.id }, nomeParl(m.parlamentares)), ' — ' + (FUNCOES[m.funcao] || m.funcao)))) : null)))
        : el('p', { class: 'vazio' }, 'Comissões em atualização.'),
      el('h2', { class: 'mt-3' }, 'Reuniões e pautas'), conteudo);
    return listaSessoes(conteudo, params, '#/comissoes', true);
  };

  // ---------- 20.7 Votações ----------
  R.votacoes = async function (main, partes, params) {
    if (!so(main)) return;
    S.titulo('Votações'); trilha(['Votações']);
    const conteudo = el('div', { class: 'painel-guia', role: 'tabpanel' }, el('p', { class: 'carregando' }, 'Carregando…'));
    pagina(main, el('h1', null, 'Votações'), el('p', { class: 'sub' }, 'Resultado de cada votação, com o voto nominal de cada vereador. Votações unânimes dispensam a lista nominal.'), conteudo);
    const CAMPOS = 'id, descricao, forma, resultado, unanime, votos_sim, votos_nao, abstencoes, criado_em, sessoes!inner(id, tipo, numero, data, situacao), votacoes_votos(voto, parlamentares(nome, nome_parlamentar))';
    return U.listaAnual(conteudo, params, {
      base: '#/votacoes', titulo: 'Votações', rotuloAno: 'Ano', nome: 'votacoes', unidade: ['votação', 'votações'], ordem: 'criado_em', declaracao: 'legislativo_votacoes', abrirRecente: true,
      vazio: 'Não há votações publicadas.',
      anos: async () => { const { data, error } = await sb.rpc('legislativo_anos', { p_orgao: org(), p_qual: 'votacoes' }); return error ? null : data || []; },
      montar: (sel, op, ano, f) => {
        let q = sb.from('votacoes').select(sel === 'id' ? 'id, sessoes!inner(data)' : (sel || CAMPOS), op).eq('orgao_id', org());
        if (ano !== 'todos') q = q.gte('sessoes.data', ano + '-01-01').lte('sessoes.data', ano + '-12-31');
        if (f.busca) q = q.ilike('descricao', U.termo(f.busca));
        if (f.resultado) q = q.eq('resultado', f.resultado);
        return q;
      },
      filtros: () => [['busca', 'Pesquisar a matéria', el('input', { type: 'search', placeholder: 'Ex.: Projeto de Lei 12/2026' })], ['resultado', 'Resultado', U.selecao({ aprovada: 'Aprovada', rejeitada: 'Rejeitada', outro: 'Outro' })]],
      cabecalho: ['Sessão', 'Matéria', 'Resultado', 'Votos'],
      colunas: [['sessoes', 'Data da sessão', (v) => v ? v.data : ''], ['descricao', 'Matéria'], ['resultado', 'Resultado'], ['unanime', 'Unânime', (v) => v ? 'sim' : 'não'],
        ['votos_sim', 'Sim'], ['votos_nao', 'Não'], ['abstencoes', 'Abstenções'],
        ['votacoes_votos', 'Votos nominais', (v) => (v || []).filter((x) => x.parlamentares).map((x) => nomeParl(x.parlamentares) + ': ' + (VOTOS[x.voto] || x.voto)).join('; ')]],
      linha: (v) => el('tr', null,
        el('td', { 'data-rotulo': 'Sessão' }, el('a', { href: '#/sessao/' + v.sessoes.id }, nomeSessao(v.sessoes))),
        el('td', { 'data-rotulo': 'Matéria', class: 'lic-obj' }, v.descricao),
        el('td', { 'data-rotulo': 'Resultado' }, etiqueta(v.resultado === 'aprovada' ? ['Aprovada', 'etiqueta-verde'] : v.resultado === 'rejeitada' ? ['Rejeitada', 'etiqueta-vermelha'] : ['Outro', 'etiqueta-ambar'])),
        el('td', { 'data-rotulo': 'Votos' }, v.unanime ? 'Unânime' : (v.votacoes_votos || []).length ? el('details', null, el('summary', null, (v.votos_sim || 0) + ' sim · ' + (v.votos_nao || 0) + ' não · ' + (v.abstencoes || 0) + ' abst.'),
          el('ul', { class: 'votos' }, v.votacoes_votos.filter((x) => x.parlamentares).map((x) => el('li', null, nomeParl(x.parlamentares) + ': ' + (VOTOS[x.voto] || x.voto))))) : '—'),
        el('td', { 'data-rotulo': '' }, el('a', { href: '#/sessao/' + v.sessoes.id, class: 'botao botao-claro botao-p' }, 'Sessão')))
    });
  };

  // ---------- 20.10 Verba indenizatória ----------
  R['verba-indenizatoria'] = async function (main, partes, params) {
    if (!so(main)) return;
    S.titulo('Verba indenizatória'); trilha(['Verba indenizatória']);
    const c = S.conf;
    const norma = c.verba_norma || c.verba_norma_url ? el('p', null, el('strong', null, 'Regulamentação: '), c.verba_norma_url ? linkExt(c.verba_norma_url, c.verba_norma || 'norma') : c.verba_norma) : null;
    if (c.verba_inexistente) {
      pagina(main, el('h1', null, 'Verba indenizatória e cota parlamentar'), el('p', { class: 'cartao' }, 'A Câmara não paga verba indenizatória nem cota para o exercício da atividade parlamentar. Atualizado em ' + new Date().toLocaleDateString('pt-BR') + '.'), norma);
      return;
    }
    const { data: anosLst } = await sb.rpc('legislativo_anos', { p_orgao: org(), p_qual: 'verba' });
    const decl = await S.decl.de('legislativo_verba');
    const declAtual = S.decl.atual(decl);
    const atual = new Date().getFullYear();
    const anos = S.decl.mesclarAnos(anosLst || [], decl).map((x) => x.ano).sort((a, b) => b - a);
    if (!anos.includes(atual)) anos.unshift(atual);
    let ano = Number(params.get('ano')) || anos[0];
    const caixa = el('div');
    const faixa = U.faixaAbas(anos.map((a) => [a, String(a)]), ano, 'Ano', false, (id) => { ano = Number(id); history.replaceState(null, '', '#/verba-indenizatoria?ano=' + ano); desenhar(); });
    pagina(main, el('h1', null, 'Verba indenizatória e cota parlamentar'),
      el('p', { class: 'sub' }, 'Valores pagos ou reembolsados a cada vereador para o exercício da atividade parlamentar, com a descrição da despesa e quem recebeu.'), norma,
      declAtual ? S.decl.cartaoAtual(declAtual) : [faixa.lista, el('div', { class: 'painel-guia painel-guia-interno', role: 'tabpanel' }, caixa)]);
    if (declAtual) return;
    faixa.marcar(ano);
    async function desenhar() {
      caixa.replaceChildren(el('p', { class: 'carregando' }, 'Carregando…'));
      const { data, error } = await sb.rpc('verba_publica', { p_orgao: org(), p_ano: ano });
      if (error) { caixa.replaceChildren(el('p', null, 'Não foi possível carregar. Tente novamente.')); return; }
      const linhas = data || [];
      const total = linhas.reduce((t, x) => t + Number(x.valor), 0);
      const colunas = [['data', 'Data'], ['parlamentar', 'Vereador'], ['descricao', 'Descrição'], ['beneficiario_nome', 'Recebedor'], ['beneficiario_doc', 'CPF/CNPJ do recebedor'], ['valor', 'Valor'], ['documento_url', 'Comprovante']];
      caixa.replaceChildren(S.decl.quadro(S.decl.doAno(decl, ano), 'Períodos sem pagamento em ' + ano),
        el('div', { class: 'barra-lista' }, el('span', { class: 'meta' }, linhas.length + ' pagamentos · total ' + U.moedaBR(total)), S.botoesExportar('verba-indenizatoria-' + ano, colunas, async (de) => de ? [] : linhas)),
        linhas.length ? el('div', { class: 'tabela-rolagem' }, el('table', { class: 'tabela-dados' }, el('caption', { class: 'sr' }, 'Verba indenizatória em ' + ano),
          el('thead', null, el('tr', null, ['Data', 'Vereador', 'Descrição', 'Recebedor', 'Valor', 'Comprovante'].map((t) => el('th', { scope: 'col' }, t)))),
          el('tbody', null, linhas.map((x) => el('tr', null, el('td', { 'data-rotulo': 'Data', class: 'num' }, dataBR(x.data)), el('td', { 'data-rotulo': 'Vereador' }, x.parlamentar),
            el('td', { 'data-rotulo': 'Descrição' }, x.descricao), el('td', { 'data-rotulo': 'Recebedor' }, [x.beneficiario_nome, /^\d{14}$/.test(x.beneficiario_doc || '') ? x.beneficiario_doc.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : x.beneficiario_doc].filter(Boolean).join(' · ') || '—'),
            el('td', { 'data-rotulo': 'Valor', class: 'num' }, U.moedaBR(x.valor)), el('td', { 'data-rotulo': 'Comprovante' }, x.documento_url ? linkExt(x.documento_url, 'Abrir') : '—'))))))
          : S.decl.doAno(decl, ano).length ? '' : el('p', { class: 'vazio' }, 'Nenhum pagamento publicado em ' + ano + '.'));
    }
    desenhar();
  };
})();
