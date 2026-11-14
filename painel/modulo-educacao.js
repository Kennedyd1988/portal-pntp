// =====================================================================
// Módulo "Educação, assistência social e conselhos" — PNTP 19.1 a 19.4.
//   19.1 plano de educação e relatório de resultados;
//   19.2 lista de espera das creches e critérios de prioridade;
//   19.3 composição e funcionamento do Conselho do Fundeb;
//   19.4 composição e funcionamento do Conselho de Assistência Social.
// Também guarda os demais conselhos (Educação, Alimentação Escolar,
// Criança e Adolescente…) e os planos da assistência social.
// =====================================================================
(function () {
  'use strict';
  const P = window.PNTP;
  const S = P.setor;
  const { sb, el, ocupado } = P;
  const SIT = { aguardando: 'Aguardando', convocado: 'Convocado', matriculado: 'Matriculado', desistente: 'Desistente', cancelado: 'Cancelado' };
  const COR = { aguardando: 'agendado', convocado: 'publicado', matriculado: 'rascunho', desistente: 'desativado', cancelado: 'desativado' };
  let perm = {};
  const org = () => P.estado.orgao.id;
  const pode = () => perm.editar && !P.estado.alcanceUnidade;

  const CAMPOS = [
    [{ k: 'protocolo', r: 'Protocolo / inscrição', t: 'text', max: 40, ob: true, aj: 'Nunca o nome da criança (ECA e LGPD).' },
      { k: 'crianca', r: 'Iniciais (opcional)', t: 'text', max: 20, ph: 'Ex.: M. S. A.' }, { k: 'situacao_espera', r: 'Situação', t: 'sel', op: SIT }],
    [{ k: 'creche', r: 'Creche pretendida', t: 'text', max: 150, ob: true, minimo: 2 }, { k: 'turma', r: 'Turma / faixa etária', t: 'text', max: 60, ob: true, minimo: 2, ph: 'Ex.: Berçário, Maternal I' }],
    [{ k: 'data_inscricao', r: 'Data da inscrição', t: 'data', ob: true }, { k: 'pontuacao', r: 'Pontuação (se houver)', t: 'num' },
      { k: 'criterio', r: 'Critério de prioridade', t: 'text', max: 200, ph: 'Ex.: família no CadÚnico' }],
    { k: 'observacao', r: 'Observação', t: 'text', max: 300 }];
  const COLUNAS_IMPORT = [
    { k: 'protocolo', r: 'Protocolo', t: 'text', ob: true, max: 40 }, { k: 'creche', r: 'Creche', t: 'text', ob: true, max: 150 },
    { k: 'turma', r: 'Turma', t: 'text', ob: true, max: 60 }, { k: 'data_inscricao', r: 'Data da inscrição', t: 'data', ob: true },
    { k: 'pontuacao', r: 'Pontuação', t: 'num' }, { k: 'criterio', r: 'Critério de prioridade', t: 'text' },
    { k: 'situacao_espera', r: 'Situação', t: 'sel', op: SIT }, { k: 'crianca', r: 'Iniciais', t: 'text', max: 20 }];

  function creches(caixa) {
    const f = { busca: '', creche: '', situacao_espera: 'aguardando' };
    let itens = [], fim = false, total = 0;
    const consulta = (sel, op) => {
      let q = sb.from('creches_espera_posicoes').select(sel, op).eq('orgao_id', org());
      if (f.busca) q = q.ilike('busca', '%' + P.normalizar(f.busca).replace(/[%_]/g, '') + '%');
      if (f.situacao_espera) q = q.eq('situacao_espera', f.situacao_espera);
      return q;
    };
    const lista = el('div'), resumo = el('p', { class: 'ajuda' });
    async function carregar(reiniciar) {
      const ultimo = reiniciar ? null : itens[itens.length - 1];
      const [pag, t] = await Promise.all([P.paginar(consulta, 'data_inscricao', ultimo, 100, true), reiniciar ? P.contar(consulta) : Promise.resolve(total)]);
      itens = reiniciar ? pag.linhas : itens.concat(pag.linhas); fim = pag.fim; total = t;
      const btnMais = el('button', { type: 'button', class: 'btn btn-claro' }, 'Carregar mais');
      btnMais.addEventListener('click', async () => { ocupado(btnMais, 'Carregando…'); try { await carregar(false); } catch (e) { S.mostrarErro(e); ocupado(btnMais); } });
      lista.replaceChildren(S.tabela([
        ['Posição', (r) => r.posicao ? r.posicao + 'º' : '—', 'num'], ['Protocolo', (r) => [el('strong', null, r.protocolo), r.crianca ? el('span', { class: 'sub-linha' }, r.crianca) : null]],
        ['Creche e turma', (r) => [r.creche, el('span', { class: 'sub-linha' }, r.turma)], 'quebra'], ['Inscrição', (r) => P.dataBR(r.data_inscricao), 'num'],
        ['Prioridade', (r) => [r.criterio || '—', r.pontuacao !== null ? el('span', { class: 'sub-linha' }, S.numBR(r.pontuacao) + ' ponto(s)') : null]],
        ['Situação', (r) => el('span', { class: 'etiqueta etiqueta-' + COR[r.situacao_espera] }, SIT[r.situacao_espera])]],
      itens, pode() ? (r) => [S.botao('Editar', () => abrir(r)), S.botao('Excluir', () => S.excluir('creches_espera', r, 'inscrição ' + r.protocolo, recarregar), true)] : null,
      'Nenhuma inscrição com esses filtros.'),
      el('div', { class: 'rodape-lista' }, el('span', { class: 'ajuda' }, 'Mostrando ' + itens.length + ' de ' + total), fim ? '' : btnMais));
    }
    async function resumir() {
      const { data } = await sb.from('creches_espera').select('atualizado_em').eq('orgao_id', org()).order('atualizado_em', { ascending: false }).limit(1);
      const u = (data || [])[0];
      resumo.replaceChildren(u ? 'Última atualização da lista: ' + P.dataHoraBR(u.atualizado_em) + '. O PNTP pede a lista atualizada (até 30 dias).' : 'Nenhuma inscrição cadastrada ainda.');
    }
    const recarregar = () => carregar(true).then(resumir).catch(S.mostrarErro);
    const abrir = (r) => S.formulario({ tabela: 'creches_espera', modulo: 'educacao', titulo: 'inscrição na lista de espera', registro: r, perm, depois: recarregar, abas: [['dados', 'Inscrição', CAMPOS]] });
    const importar = () => S.importar({ titulo: 'Importar lista de espera das creches', tabela: 'creches_espera', colunas: COLUNAS_IMPORT, depois: recarregar,
      ajuda: 'Use o relatório do sistema de matrícula (ou a planilha da Secretaria). Identifique a criança só pelo protocolo da inscrição (e, se quiser, as iniciais).' });
    const fBusca = el('input', { type: 'search', placeholder: 'Protocolo, creche, turma', 'aria-label': 'Buscar' });
    const fSit = el('select', { 'aria-label': 'Situação' }, S.opcoes(SIT, 'aguardando', 'Situação: todas'));
    const aplicar = () => { Object.assign(f, { busca: fBusca.value.trim(), situacao_espera: fSit.value }); carregar(true).catch(S.mostrarErro); };
    fSit.addEventListener('change', aplicar);
    let espera; fBusca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(aplicar, 400); });
    caixa.replaceChildren(
      S.secao('educacao_creches', perm, { naoHa: 'Não há crianças aguardando vaga em creche da rede municipal.',
        texto: { rotulo: 'Critérios de prioridade de acesso às creches', obrigatorio: true, linhas: 5,
          ajuda: 'O PNTP 19.2 pede a lista E os critérios. Ex.: 1º crianças com deficiência; 2º famílias do CadÚnico; 3º mãe ou responsável trabalhando; desempate pela data de inscrição. Cite a norma (portaria/resolução).' } }),
      resumo,
      pode() ? el('p', { class: 'linha-botoes' }, el('button', { type: 'button', class: 'btn btn-primario', onclick: importar }, 'Importar lista (colar ou CSV)'),
        el('button', { type: 'button', class: 'btn btn-claro', onclick: () => abrir() }, '+ Incluir uma inscrição')) : '',
      el('p', { class: 'ajuda' }, 'A posição é calculada por creche e turma: maior pontuação primeiro e, no empate, a inscrição mais antiga.'),
      el('div', { class: 'filtros' }, fBusca, fSit), lista);
    recarregar();
    return caixa;
  }

  P.telas.educacao = async function (c, mod, p) {
    perm = p;
    c.replaceChildren(el('h1', null, mod.nome), el('p', { class: 'sub' }, 'Carregando…'));
    try { await S.carregarSecoes(); } catch (e) { c.querySelector('.sub').textContent = S.faltaScript(e); return; }
    const caixa = () => el('div');
    c.replaceChildren(...[
      S.cabecalho(mod.nome, 'Plano de educação e resultados, lista de espera das creches, conselhos (Fundeb, Assistência Social e outros) e planos da assistência social (PNTP 19.1 a 19.4).'),
      S.avisoSetorial(perm),
      P.abas([
        ['edu-docs', 'Plano e resultados', () => [S.secao('educacao_documentos', perm, { naoHa: false }),
          S.documentos(caixa(), { area: 'educacao', modulo: 'educacao', perm, exemplo: 'Ex.: Plano Municipal de Educação 2015-2025',
            tipos: { plano_educacao: 'Plano Municipal de Educação (PME)', relatorio_educacao: 'Relatório de monitoramento / resultados do PME' },
            ajuda: 'PNTP 19.1: o Plano Municipal de Educação (com o período de vigência) e o relatório de resultados (monitoramento das metas). Mantenha os anteriores (série histórica).' })], null, 'educacao_documentos'],
        ['edu-creches', 'Creches: lista de espera', () => creches(caixa()), null, 'educacao_creches'],
        ['edu-fundeb', 'Conselho do Fundeb', () => [
          S.secao('educacao_fundeb', perm, { titulo: 'Conselho do Fundeb (19.3) no site', naoHa: false }),
          el('p', { class: 'ajuda' }, 'Composição atual (titulares e suplentes, com quem cada um representa), funcionamento, atas, pautas e resoluções.'),
          S.conselhos(caixa(), { tipos: ['fundeb'], obrigatorios: { fundeb: 'PNTP 19.3' }, perm, modulo: 'educacao' })], null, 'educacao_fundeb'],
        ['edu-assist', 'Assistência social', () => [
          S.secao('educacao_assistencia', perm, { titulo: 'Conselho de Assistência Social (19.4) no site', naoHa: false }),
          S.conselhos(caixa(), { tipos: ['assistencia_social'], obrigatorios: { assistencia_social: 'PNTP 19.4' }, perm, modulo: 'educacao' }),
          el('h2', { class: 'mt-3' }, 'Planos e relatórios da assistência social'),
          S.documentos(caixa(), { area: 'assistencia_social', modulo: 'educacao', perm, exemplo: 'Ex.: Plano Municipal de Assistência Social 2026-2029',
            tipos: { plano_assistencia: 'Plano Municipal de Assistência Social', relatorio_assistencia: 'Relatório de gestão da assistência social' },
            ajuda: 'Opcional: planos e relatórios da assistência social (aparecem na mesma aba do site).' })], null, 'educacao_assistencia'],
        ['edu-outros', 'Outros conselhos', () => [
          S.secao('educacao_conselhos', perm),
          el('p', { class: 'ajuda' }, 'Conselhos de Educação, Alimentação Escolar, Criança e Adolescente e outros. Os conselhos de Saúde ficam no módulo Saúde.'),
          S.conselhos(caixa(), { tipos: ['educacao', 'alimentacao_escolar', 'crianca_adolescente', 'outro'], perm, modulo: 'educacao' })]]
      ])
    ].filter(Boolean));
  };
})();
