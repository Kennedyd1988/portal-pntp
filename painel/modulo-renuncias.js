// =====================================================================
// Módulo "Renúncias de receita" — PNTP 16.1 a 16.4 (Poder Executivo).
//   16.1 desonerações concedidas, com o fundamento legal de cada uma;
//   16.2 valores da renúncia prevista e realizada, por espécie de benefício;
//   16.3 beneficiários (CPF de pessoa física sai mascarado no site);
//   16.4 projetos de incentivo à cultura e ao esporte.
// =====================================================================
(function () {
  'use strict';
  const P = window.PNTP;
  const S = P.setor;
  const { sb, el, ocupado } = P;
  const ESPECIES = { isencao: 'Isenção', anistia: 'Anistia', remissao: 'Remissão', credito_presumido: 'Crédito presumido', reducao_aliquota: 'Redução de alíquota',
    reducao_base: 'Redução de base de cálculo', subsidio: 'Subsídio', outro: 'Outro benefício' };
  const TRIBUTOS = { iptu: 'IPTU', iss: 'ISS', itbi: 'ITBI', taxas: 'Taxas', contribuicao_melhoria: 'Contribuição de melhoria', cosip: 'Contribuição de iluminação (COSIP)',
    divida_ativa: 'Dívida ativa (REFIS)', outro: 'Outro' };
  const AND_INC = { aprovado: 'Aprovado', em_execucao: 'Em execução', concluido: 'Concluído', cancelado: 'Cancelado' };
  let perm = {}, renuncias = [];
  const org = () => P.estado.orgao.id;
  const pode = () => perm.editar && !P.estado.alcanceUnidade;
  const nomeRen = (r) => ESPECIES[r.especie] + ' · ' + TRIBUTOS[r.tributo] + ' — ' + r.titulo;
  async function carregarRenuncias() {
    const { data, error } = await sb.from('renuncias').select('*').eq('orgao_id', org()).order('tributo').order('titulo').limit(500);
    if (error) throw error;
    renuncias = data || [];
    return renuncias;
  }
  const valoresAba = (r, travado, depois) => S.filhos({ tabela: 'renuncias_valores', pai: ['renuncia_id', r.id], travado, perm, modulo: 'renuncias', rotulo: 'exercício',
    ordem: [['exercicio', false]], depois, nome: (l) => 'valores de ' + l.exercicio,
    ajuda: 'PNTP 16.2: para cada exercício, o valor previsto (LDO/LOA, anexo de metas fiscais) e o efetivamente renunciado, com as medidas de compensação (art. 14 da LRF).',
    campos: [[{ k: 'exercicio', r: 'Exercício', t: 'int', min: 1990, maxv: 2100, ob: true, padrao: new Date().getFullYear() }, { k: 'valor_previsto', r: 'Valor previsto (R$)', t: 'num' },
      { k: 'valor_realizado', r: 'Valor realizado (R$)', t: 'num' }],
      { k: 'fonte_previsao', r: 'De onde vem a previsão', t: 'text', max: 200, ph: 'Ex.: LDO 2026, Anexo de Metas Fiscais, demonstrativo 7' },
      { k: 'compensacao', r: 'Medidas de compensação', t: 'area', max: 2000, linhas: 2, ph: 'Ex.: considerada na estimativa da receita da LOA (art. 14, I, da LRF)' }],
    colunas: [['Exercício', (l) => el('strong', null, String(l.exercicio))], ['Previsto', (l) => S.moeda(l.valor_previsto), 'num'], ['Realizado', (l) => S.moeda(l.valor_realizado), 'num'],
      ['Compensação', (l) => l.compensacao || '—', 'quebra']] });

  function abrirRenuncia(r, aba, depois) {
    return S.formulario({ tabela: 'renuncias', modulo: 'renuncias', titulo: 'renúncia de receita', registro: r, perm, rascunho: true, depois, reabrir: 'valores', abaInicial: aba,
      abas: [['dados', 'Desoneração (16.1)', [
        [{ k: 'tributo', r: 'Tributo', t: 'sel', op: TRIBUTOS }, { k: 'especie', r: 'Espécie', t: 'sel', op: ESPECIES }],
        { k: 'titulo', r: 'Nome do benefício', t: 'text', ob: true, minimo: 3, ph: 'Ex.: Isenção de IPTU para aposentados de baixa renda' },
        [{ k: 'fundamento_legal', r: 'Fundamento legal', t: 'text', max: 300, ob: true, minimo: 3, ph: 'Ex.: Lei nº 100/2010 (Código Tributário), art. 25' }, { k: 'norma_url', r: 'Link da lei', t: 'url' }],
        { k: 'descricao', r: 'Descrição', t: 'area', max: 2000, linhas: 2 },
        { k: 'requisitos', r: 'Requisitos para ter direito', t: 'area', max: 3000, linhas: 3, ph: 'Quem pode pedir e as condições' },
        { k: 'procedimento', r: 'Como pedir', t: 'area', max: 3000, linhas: 3, ph: 'Onde e como solicitar, documentos, prazos' },
        [{ k: 'setor', r: 'Setor / público beneficiado', t: 'text', max: 200, ph: 'Ex.: aposentados, templos, microempresas' }, { k: 'vigencia_inicio', r: 'Vigente desde', t: 'data' },
          { k: 'vigencia_fim', r: 'Vigente até', t: 'data' }]]]],
      extras: [['valores', 'Previsto × realizado (16.2)', (reg, travado) => valoresAba(reg, travado, depois)]],
      validar: (d) => d.vigencia_inicio && d.vigencia_fim && d.vigencia_fim < d.vigencia_inicio ? ['vigencia_fim', 'Não pode ser antes do início.'] : null });
  }

  // ---------- 16.1 desonerações ----------
  function desoneracoes(caixa) {
    async function listar() {
      try { await carregarRenuncias(); } catch (e) { caixa.replaceChildren(el('p', { class: 'msg msg-erro' }, P.erroGravacao(e))); return; }
      lista.replaceChildren(S.tabela([['Benefício', (r) => [el('strong', null, r.titulo), el('span', { class: 'sub-linha' }, ESPECIES[r.especie] + ' · ' + TRIBUTOS[r.tributo])], 'quebra'],
        ['Fundamento legal', (r) => r.fundamento_legal, 'quebra'], ['Situação', (r) => S.etiquetaSituacao(r.situacao)]], renuncias,
        (r) => [S.botao('Valores', () => abrirRenuncia(r, 'valores', listar)), S.botao(pode() ? 'Editar' : 'Ver', () => abrirRenuncia(r, null, listar)),
          pode() && perm.excluir ? S.botao('Excluir', () => S.excluir('renuncias', r, r.titulo, listar), true) : null],
        'Nenhuma desoneração cadastrada.'));
    }
    const lista = el('div', null, el('p', { class: 'vazio' }, 'Carregando…'));
    caixa.replaceChildren(
      S.secao('renuncias_desoneracoes', perm, { naoHa: 'O município não concede desonerações tributárias (isenções, anistias, remissões ou outros benefícios fiscais).' }),
      el('p', { class: 'ajuda' }, 'PNTP 16.1: cada benefício fiscal concedido (isenção, anistia, remissão…) com a lei que o autoriza, quem tem direito e como pedir.'),
      pode() ? el('p', null, el('button', { type: 'button', class: 'btn btn-primario', onclick: () => abrirRenuncia(null, null, listar) }, '+ Incluir desoneração')) : '',
      lista);
    listar();
    return caixa;
  }

  // ---------- 16.2 previsto × realizado (todas as renúncias de um exercício) ----------
  function valores(caixa) {
    const corpo = el('div', null, el('p', { class: 'vazio' }, 'Carregando…'));
    let ano = null;
    async function listar() {
      const [{ data: anos }, { data: vals, error }] = await Promise.all([
        sb.rpc('anos_setoriais', { p_orgao: org(), p_tabela: 'renuncias_valores' }),
        sb.from('renuncias_valores').select('*, renuncias(titulo, especie, tributo, situacao)').eq('orgao_id', org()).limit(5000)]);
      if (error) { corpo.replaceChildren(el('p', { class: 'msg msg-erro' }, P.erroGravacao(error))); return; }
      const lista = anos || [];
      if (!lista.some((x) => x.ano === ano)) ano = lista.length ? lista[0].ano : null;
      if (!ano) { corpo.replaceChildren(el('p', { class: 'vazio' }, 'Nenhum valor informado. Abra a desoneração e use a aba "Previsto × realizado".')); return; }
      const doAno = (vals || []).filter((v) => v.exercicio === ano).sort((a, b) => P.ordemAlfabetica(a.renuncias.titulo, b.renuncias.titulo));
      const soma = (k) => doAno.reduce((t, v) => t + Number(v[k] || 0), 0);
      corpo.replaceChildren(
        el('div', { class: 'abas abas-internas', role: 'tablist', 'aria-label': 'Exercício' }, lista.map((x) => el('button', { type: 'button', role: 'tab', class: 'aba aba-p',
          'aria-selected': x.ano === ano ? 'true' : 'false', onclick: () => { ano = x.ano; listar(); } }, String(x.ano), el('span', { class: 'aba-qtd' }, String(x.total))))),
        el('div', { class: 'painel-guia painel-guia-interno' },
          S.tabela([['Benefício', (v) => [el('strong', null, v.renuncias.titulo), el('span', { class: 'sub-linha' }, ESPECIES[v.renuncias.especie] + ' · ' + TRIBUTOS[v.renuncias.tributo])], 'quebra'],
            ['Previsto', (v) => S.moeda(v.valor_previsto), 'num'], ['Realizado', (v) => v.valor_realizado === null ? el('span', { class: 'falta' }, 'Falta') : S.moeda(v.valor_realizado), 'num']], doAno,
            (v) => [S.botao('Alterar', () => abrirRenuncia(renuncias.find((r) => r.id === v.renuncia_id) || { id: v.renuncia_id }, 'valores', listar))]),
          el('p', { class: 'ajuda' }, 'Total de ' + ano + ': previsto ' + S.moeda(soma('valor_previsto')) + ' · realizado ' + S.moeda(soma('valor_realizado')) + '.')));
    }
    caixa.replaceChildren(S.secao('renuncias_valores', perm, { naoHa: false }),
      el('p', { class: 'ajuda' }, 'PNTP 16.2: previsto e realizado de cada benefício por exercício. Os valores são lançados dentro de cada desoneração.'), corpo);
    carregarRenuncias().then(listar).catch(S.mostrarErro);
    return caixa;
  }

  // ---------- 16.3 beneficiários ----------
  function beneficiarios(caixa) {
    let ano = null, anos = [], itens = [], fim = false, total = 0;
    const f = { busca: '', renuncia_id: '' };
    const corpo = el('div', null, el('p', { class: 'vazio' }, 'Carregando…'));
    const consulta = (sel, op) => {
      let q = sb.from('renuncias_beneficiarios').select(sel, op).eq('orgao_id', org()).eq('exercicio', ano);
      // CNPJ/CPF digitado com pontos: procura só pelos números (é como fica guardado).
      const t = /^[\d.\/-]+$/.test(f.busca) ? f.busca.replace(/\D/g, '') : P.normalizar(f.busca).replace(/[%_]/g, '');
      if (f.busca) q = q.ilike('busca', '%' + t + '%');
      if (f.renuncia_id) q = q.eq('renuncia_id', f.renuncia_id);
      return q;
    };
    const lista = el('div');
    async function carregar(reiniciar) {
      const ultimo = reiniciar ? null : itens[itens.length - 1];
      const [pag, t] = await Promise.all([P.paginar(consulta, 'nome', ultimo, 100, true), reiniciar ? P.contar(consulta) : Promise.resolve(total)]);
      itens = reiniciar ? pag.linhas : itens.concat(pag.linhas); fim = pag.fim; total = t;
      const btnMais = el('button', { type: 'button', class: 'btn btn-claro' }, 'Carregar mais');
      btnMais.addEventListener('click', async () => { ocupado(btnMais, 'Carregando…'); try { await carregar(false); } catch (e) { S.mostrarErro(e); ocupado(btnMais); } });
      const ren = (id) => renuncias.find((r) => r.id === id) || {};
      lista.replaceChildren(S.tabela([['Beneficiário', (b) => [el('strong', null, b.nome), b.documento ? el('span', { class: 'sub-linha' }, P.formatarDoc(b.documento)) : null], 'quebra'],
        ['Benefício', (b) => ren(b.renuncia_id).titulo || '—', 'quebra'], ['Setor / produto', (b) => [b.setor || '—', b.produto ? el('span', { class: 'sub-linha' }, b.produto) : null]],
        ['Valor', (b) => S.moeda(b.valor), 'num']], itens,
        pode() ? (b) => [S.botao('Editar', () => abrir(b)), S.botao('Excluir', () => S.excluir('renuncias_beneficiarios', b, b.nome, () => recarregar()), true)] : null,
        'Nenhum beneficiário com esses filtros.'),
        el('div', { class: 'rodape-lista' }, el('span', { class: 'ajuda' }, 'Mostrando ' + itens.length + ' de ' + total), fim ? '' : btnMais));
    }
    const opRen = () => Object.fromEntries(renuncias.map((r) => [r.id, r.titulo]));
    const abrir = (b) => {
      if (!renuncias.length) return P.aviso('Cadastre a desoneração antes', 'O beneficiário fica ligado a uma desoneração (aba Desonerações).');
      S.formulario({ tabela: 'renuncias_beneficiarios', modulo: 'renuncias', titulo: 'beneficiário', registro: b || { exercicio: ano || new Date().getFullYear() }, perm, depois: () => recarregar(),
        abas: [['dados', 'Beneficiário', [
          [{ k: 'renuncia_id', r: 'Benefício', t: 'sel', op: opRen(), ob: true }, { k: 'exercicio', r: 'Exercício', t: 'int', min: 1990, maxv: 2100, ob: true }],
          [{ k: 'nome', r: 'Nome / razão social', t: 'text', ob: true, minimo: 2 }, { k: 'documento', r: 'CNPJ ou CPF', t: 'doc', aj: 'CPF aparece mascarado no site (LGPD).' }],
          [{ k: 'setor', r: 'Setor', t: 'text', max: 150 }, { k: 'produto', r: 'Produto / atividade', t: 'text', max: 150 }, { k: 'valor', r: 'Valor renunciado (R$)', t: 'num' }]]]] });
    };
    async function recarregar(manterAno) {
      try {
        const { data, error } = await sb.rpc('anos_setoriais', { p_orgao: org(), p_tabela: 'renuncias_beneficiarios' });
        if (error) throw error;
        anos = data || [];
        if (!manterAno && !anos.some((x) => x.ano === ano)) ano = anos.length ? anos[0].ano : null;
        desenhar();
        if (ano) await carregar(true);
      } catch (e) { S.mostrarErro(e); }
    }
    const importar = () => {
      if (!renuncias.length) return P.aviso('Cadastre a desoneração antes', 'Os beneficiários ficam ligados a uma desoneração (aba Desonerações).');
      const ex = el('input', { type: 'number', min: 1990, max: 2100, value: ano || new Date().getFullYear() });
      const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Continuar');
      const d = P.abrirDialogo('Importar beneficiários', el('div', { class: 'form-dialogo' }, P.campo('rb-ex', 'Exercício dos beneficiários', ex, 'A importação troca a lista deste exercício (ou acrescenta, se preferir).')),
        [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Cancelar'), btn]);
      btn.addEventListener('click', () => {
        const a = parseInt(ex.value, 10);
        if (!P.erroCampo('rb-ex', a >= 1990 && a <= 2100 ? '' : 'Ano inválido.')) return;
        d.close();
        S.importar({ titulo: 'Importar beneficiários de ' + a, tabela: 'renuncias_beneficiarios', exercicio: a, substituirTexto: 'Substituir os beneficiários de ' + a,
          ajuda: 'Use o relatório do sistema tributário. A coluna "Benefício" pode trazer o nome da desoneração como está cadastrada (basta o começo).',
          colunas: [{ k: 'renuncia_id', r: 'Benefício', t: 'sel', op: opRen(), ob: true }, { k: 'nome', r: 'Nome / razão social', t: 'text', ob: true },
            { k: 'documento', r: 'CNPJ ou CPF', t: 'doc' }, { k: 'setor', r: 'Setor', t: 'text', max: 150 }, { k: 'produto', r: 'Produto', t: 'text', max: 150 }, { k: 'valor', r: 'Valor', t: 'num' }],
          preparar: async (linhas) => linhas.map((l) => Object.assign({ exercicio: a }, l)),
          depois: async () => { ano = a; await recarregar(true); } });
      });
    };
    function desenhar() {
      const fBusca = el('input', { type: 'search', placeholder: 'Nome, CNPJ/CPF, setor', 'aria-label': 'Buscar', value: f.busca });
      const fRen = el('select', { 'aria-label': 'Benefício' }, S.opcoes(opRen(), f.renuncia_id, 'Benefício: todos'));
      const aplicar = () => { Object.assign(f, { busca: fBusca.value.trim(), renuncia_id: fRen.value }); carregar(true).catch(S.mostrarErro); };
      fRen.addEventListener('change', aplicar);
      let espera; fBusca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(aplicar, 400); });
      corpo.replaceChildren(anos.length ? el('div', null,
        el('div', { class: 'abas abas-internas', role: 'tablist', 'aria-label': 'Exercício' }, anos.map((x) => el('button', { type: 'button', role: 'tab', class: 'aba aba-p',
          'aria-selected': x.ano === ano ? 'true' : 'false', onclick: () => { ano = x.ano; recarregar(true); } }, String(x.ano), el('span', { class: 'aba-qtd' }, String(x.total))))),
        el('div', { class: 'painel-guia painel-guia-interno' }, el('div', { class: 'filtros' }, fBusca, fRen), lista))
        : el('p', { class: 'vazio' }, 'Nenhum beneficiário cadastrado.'));
    }
    caixa.replaceChildren(
      S.secao('renuncias_beneficiarios', perm, { naoHa: 'Não há beneficiários de renúncia de receita no exercício.' }),
      el('p', { class: 'ajuda' }, 'PNTP 16.3: quem recebeu cada benefício, com CNPJ, setor, produto e valor. Pessoa física: o site mostra o CPF mascarado (***.123.456-**).'),
      pode() ? el('p', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, el('button', { type: 'button', class: 'btn btn-primario', onclick: importar }, 'Importar beneficiários (colar ou CSV)'),
        el('button', { type: 'button', class: 'btn btn-claro', onclick: () => abrir() }, '+ Incluir um beneficiário')) : '',
      corpo);
    carregarRenuncias().then(() => recarregar()).catch(S.mostrarErro);
    return caixa;
  }

  // ---------- 16.4 incentivo à cultura e ao esporte ----------
  function incentivos(caixa) {
    const lista = el('div', null, el('p', { class: 'vazio' }, 'Carregando…'));
    async function listar() {
      const { data, error } = await sb.from('incentivos_projetos').select('*').eq('orgao_id', org()).order('exercicio', { ascending: false }).order('projeto').limit(1000);
      if (error) { lista.replaceChildren(el('p', { class: 'msg msg-erro' }, P.erroGravacao(error))); return; }
      lista.replaceChildren(S.tabela([['Projeto', (i) => [el('strong', null, i.projeto), el('span', { class: 'sub-linha' }, (i.area === 'esporte' ? 'Esporte' : 'Cultura') + ' · ' + i.exercicio)], 'quebra'],
        ['Proponente', (i) => [i.proponente, i.documento ? el('span', { class: 'sub-linha' }, P.formatarDoc(i.documento)) : null]],
        ['Aprovado', (i) => S.moeda(i.valor_aprovado), 'num'], ['Liberado', (i) => S.moeda(i.valor_liberado), 'num'], ['Andamento', (i) => AND_INC[i.andamento]],
        ['Situação', (i) => S.etiquetaSituacao(i.situacao)]], data || [],
        (i) => [S.botao(pode() ? 'Editar' : 'Ver', () => abrir(i)), pode() && perm.excluir ? S.botao('Excluir', () => S.excluir('incentivos_projetos', i, i.projeto, listar), true) : null],
        'Nenhum projeto cadastrado.'));
    }
    const abrir = (i) => S.formulario({ tabela: 'incentivos_projetos', modulo: 'renuncias', titulo: 'projeto incentivado', registro: i, perm, rascunho: true, depois: listar,
      abas: [['dados', 'Projeto', [
        [{ k: 'area', r: 'Área', t: 'sel', op: { cultura: 'Cultura', esporte: 'Esporte' } }, { k: 'exercicio', r: 'Exercício', t: 'int', min: 1990, maxv: 2100, ob: true, padrao: new Date().getFullYear() },
          { k: 'andamento', r: 'Andamento', t: 'sel', op: AND_INC }],
        { k: 'projeto', r: 'Projeto', t: 'text', max: 300, ob: true, minimo: 3 },
        [{ k: 'proponente', r: 'Proponente / beneficiário', t: 'text', ob: true, minimo: 2 }, { k: 'documento', r: 'CNPJ ou CPF', t: 'doc', aj: 'CPF aparece mascarado no site.' }],
        [{ k: 'valor_aprovado', r: 'Valor aprovado (R$)', t: 'num', ob: true }, { k: 'valor_liberado', r: 'Valor liberado (R$)', t: 'num' }],
        { k: 'lei_incentivo', r: 'Lei de incentivo / edital', t: 'text', max: 300, ph: 'Ex.: Lei Municipal de Incentivo à Cultura nº 300/2019; Edital 02/2026' },
        { k: 'arquivo', r: 'Ato de aprovação (PDF, opcional)', t: 'arquivo' }]]] });
    caixa.replaceChildren(
      S.secao('renuncias_incentivos', perm, { naoHa: 'Não há projetos de incentivo à cultura ou ao esporte aprovados por este órgão.' }),
      el('p', { class: 'ajuda' }, 'PNTP 16.4: projetos aprovados por lei de incentivo (cultura, esporte), com o beneficiário e o valor aprovado. Sem projetos, declare "não há" acima.'),
      pode() ? el('p', null, el('button', { type: 'button', class: 'btn btn-primario', onclick: () => abrir() }, '+ Incluir projeto')) : '',
      lista);
    listar();
    return caixa;
  }

  P.telas.renuncias = async function (c, mod, p) {
    perm = p;
    c.replaceChildren(el('h1', null, 'Renúncias de receita'), el('p', { class: 'sub' }, 'Carregando…'));
    try { await S.carregarSecoes(); } catch (e) { c.querySelector('.sub').textContent = S.faltaScript(e); return; }
    const caixa = () => el('div');
    c.replaceChildren(...[
      S.cabecalho('Renúncias de receita', 'Desonerações tributárias e fundamento legal, previsto × realizado, beneficiários e incentivos à cultura e ao esporte (PNTP 16.1 a 16.4).'),
      S.avisoSetorial(perm),
      P.abas([
        ['ren-deson', 'Desonerações', () => desoneracoes(caixa()), null, 'renuncias_desoneracoes'],
        ['ren-valores', 'Previsto × realizado', () => valores(caixa()), null, 'renuncias_valores'],
        ['ren-benef', 'Beneficiários', () => beneficiarios(caixa()), null, 'renuncias_beneficiarios'],
        ['ren-incent', 'Cultura e esporte', () => incentivos(caixa()), null, 'renuncias_incentivos']
      ])
    ].filter(Boolean));
  };
})();
