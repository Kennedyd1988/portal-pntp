// =====================================================================
// Módulo "Concursos e processos seletivos" — PNTP 6.6 e 6.7.
//   6.6 íntegra dos editais de concursos e processos seletivos;
//   6.7 demais atos de cada seleção (retificações, inscritos, resultados,
//       recursos, homologação, convocações, nomeações).
// Uma janela com abas: Dados | Datas e andamento | Documentos. Publicar
// exige o edital na aba Documentos (o banco confere).
// =====================================================================
(function () {
  'use strict';
  const P = window.PNTP;
  const { sb, el, toast, ocupado, erroCampo, campo } = P;
  const LOTE = 50, LIMITE_MB = 50;
  const TIPOS = { concurso: 'Concurso público', processo_seletivo: 'Processo seletivo simplificado', estagio: 'Seleção de estágio',
    chamamento: 'Chamamento público', credenciamento: 'Credenciamento', outro: 'Outra seleção' };
  const ANDAMENTOS = { previsto: 'Previsto', inscricoes_abertas: 'Inscrições abertas', em_andamento: 'Em andamento', resultado: 'Resultado divulgado',
    homologado: 'Homologado', suspenso: 'Suspenso', cancelado: 'Cancelado', encerrado: 'Encerrado' };
  const COR = { previsto: 'rascunho', inscricoes_abertas: 'agendado', em_andamento: 'agendado', resultado: 'publicado', homologado: 'publicado', suspenso: 'desativado', cancelado: 'desativado', encerrado: 'rascunho' };
  const DOCS = { edital: 'Edital (íntegra)', retificacao: 'Retificação / errata', anexo: 'Anexo', inscritos: 'Relação de inscritos', gabarito: 'Gabarito',
    resultado_preliminar: 'Resultado preliminar', recurso: 'Recursos e respostas', resultado_final: 'Resultado final', homologacao: 'Homologação',
    convocacao: 'Convocação', nomeacao: 'Nomeação / contratação', prorrogacao: 'Prorrogação da validade', outro: 'Outro documento' };
  let perm = {}, conteiner = null, ano = null, anos = [], itens = [], fim = false, total = 0;
  const filtros = { busca: '', tipo: '', andamento: '', situacao: '' };
  const podeGravar = () => perm.editar && !P.estado.alcanceUnidade;
  const rotulo = (c) => (TIPOS[c.tipo] || 'Seleção') + (c.numero ? ' nº ' + c.numero : '');
  const opcoes = (obj, atual, vazio) => [vazio ? el('option', { value: '' }, vazio) : null].concat(Object.entries(obj).map(([k, v]) => el('option', { value: k, selected: atual === k }, v))).filter(Boolean);
  const mostrarErro = (e) => {
    const t = (e && e.message) || '';
    if (/concursos_inscricoes/.test(t)) return toast('O fim das inscrições não pode ser antes do início.', true);
    if (/anexe o edital|edital não pode|não pertence/.test(t)) return toast(t, true);
    toast(P.erroGravacao(e), true);
  };

  function consulta(sel, op) {
    let q = sb.from('concursos').select(sel, op).eq('orgao_id', P.estado.orgao.id);
    if (ano) q = q.eq('ano', ano);
    if (filtros.busca) q = q.ilike('busca', '%' + P.normalizar(filtros.busca).replace(/[%_]/g, '') + '%');
    for (const k of ['tipo', 'andamento', 'situacao']) if (filtros[k]) q = q.eq(k, filtros[k]);
    return q;
  }
  async function carregarAnos() {
    const { data, error } = await sb.rpc('concursos_anos', { p_orgao: P.estado.orgao.id });
    if (error) throw error;
    anos = data || [];
    if (!anos.some((x) => x.ano === ano)) ano = anos.length ? anos[0].ano : null;
  }
  async function carregar(reiniciar) {
    if (!ano) { itens = []; fim = true; total = 0; return; }
    const ultimo = reiniciar ? null : itens[itens.length - 1];
    const [pag, t] = await Promise.all([P.paginar(consulta, 'atualizado_em', ultimo, LOTE), reiniciar ? P.contar(consulta) : Promise.resolve(total)]);
    itens = reiniciar ? pag.linhas : itens.concat(pag.linhas);
    fim = pag.fim; total = t;
  }

  // Aba Documentos: lista e inclusão (PDF ou link), consultada só quando a aba abre.
  function abaDocumentos(c, travado) {
    const caixa = el('div', null, el('p', { class: 'vazio' }, 'Carregando…'));
    async function listar() {
      const { data, error } = await sb.from('concursos_documentos').select('*').eq('concurso_id', c.id).order('data').order('criado_em');
      if (error) { caixa.replaceChildren(el('p', { class: 'msg msg-erro' }, P.erroGravacao(error))); return; }
      const docs = data || [];
      const tipo = el('select', null, opcoes(DOCS, docs.some((d) => d.tipo === 'edital') ? 'resultado_preliminar' : 'edital'));
      const titulo = el('input', { type: 'text', maxlength: 200, placeholder: 'Ex.: Edital nº 01/2026 — Agentes Comunitários de Saúde' });
      const data_ = el('input', { type: 'date', value: new Date().toISOString().slice(0, 10) });
      const pdf = el('input', { type: 'file', accept: 'application/pdf' });
      const link = el('input', { type: 'url', placeholder: 'https://… (no lugar do PDF)' });
      const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Adicionar documento');
      tipo.addEventListener('change', () => { if (!titulo.value.trim()) titulo.placeholder = DOCS[tipo.value]; });
      btn.addEventListener('click', async () => {
        const t = titulo.value.trim() || DOCS[tipo.value];
        const l = link.value.trim(), arq = pdf.files[0];
        if (!erroCampo('cd-link', l && !P.urlValida(l) ? 'Endereço completo, começando com https://' : '')) return;
        if (!erroCampo('cd-pdf', !arq && !l ? 'Envie o PDF ou informe o link.' : arq && (arq.type !== 'application/pdf' || arq.size > LIMITE_MB * 1048576) ? 'Envie um PDF de até ' + LIMITE_MB + ' MB.' : '')) return;
        ocupado(btn, arq ? 'Enviando…' : 'Salvando…');
        try {
          const url = arq ? await P.enviarArquivo('concursos', arq, 'pdf', 'application/pdf') : null;
          const { error: e2 } = await sb.from('concursos_documentos').insert({ concurso_id: c.id, orgao_id: P.estado.orgao.id, tipo: tipo.value, titulo: t, data: data_.value, arquivo_url: url, link_externo: l || null });
          if (e2) throw e2;
          toast('Documento incluído.'); await listar();
        } catch (e) { mostrarErro(e); } finally { ocupado(btn); }
      });
      const excluir = async (d) => {
        if (!await P.confirmar('Excluir documento', 'Excluir "' + d.titulo + '"?', 'Excluir', true)) return;
        const { data: r, error: e3 } = await sb.from('concursos_documentos').delete().eq('id', d.id).select('id');
        if (e3) return mostrarErro(e3);
        if (!r || !r.length) return toast('Seu perfil não pode excluir este documento.', true);
        P.apagarArquivo(d.arquivo_url); toast('Documento excluído.'); await listar();
      };
      caixa.replaceChildren(
        docs.some((d) => d.tipo === 'edital') ? null : el('p', { class: 'msg msg-info' }, 'Falta o edital: sem ele a seleção não pode ser publicada (PNTP 6.6).'),
        docs.length ? el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela' },
          el('thead', null, el('tr', null, ['Documento', 'Tipo', 'Data', 'Arquivo'].map((h) => el('th', { scope: 'col' }, h)), el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Ações')))),
          el('tbody', null, docs.map((d) => el('tr', null, el('td', { class: 'quebra' }, d.titulo), el('td', null, DOCS[d.tipo] || d.tipo), el('td', { class: 'num' }, P.dataBR(d.data)),
            el('td', null, el('a', { href: d.arquivo_url || d.link_externo, target: '_blank', rel: 'noopener' }, d.arquivo_url ? 'PDF' : 'Link')),
            el('td', { class: 'acoes' }, !travado && perm.editar ? el('button', { type: 'button', class: 'btn btn-claro btn-p btn-texto-perigo', onclick: () => excluir(d) }, 'Excluir') : null))))))
          : el('p', { class: 'vazio' }, 'Nenhum documento ainda.'),
        travado || !perm.editar ? null : el('div', { class: 'cartao', style: 'margin-top:12px' }, el('h3', { style: 'margin-top:0' }, 'Incluir documento'),
          el('div', { class: 'grade-campos' }, campo('cd-tipo', 'Tipo', tipo), campo('cd-data', 'Data', data_)),
          campo('cd-tit', 'Título', titulo, 'Em branco: usa o nome do tipo.'),
          el('div', { class: 'grade-campos' }, campo('cd-pdf', 'PDF', pdf, 'Até ' + LIMITE_MB + ' MB.'), campo('cd-link', 'ou link', link)), btn));
    }
    listar();
    return caixa;
  }

  function form(c, abaInicial) {
    c = c || {};
    const editando = !!c.id, publicado = c.situacao === 'publicado', travado = publicado && !perm.publicar;
    const f = {
      tipo: el('select', null, opcoes(TIPOS, c.tipo || 'processo_seletivo')),
      numero: el('input', { type: 'text', maxlength: 40, value: c.numero || '', placeholder: 'Ex.: 01/2026' }),
      ano: el('input', { type: 'number', min: 1990, max: 2100, value: c.ano || new Date().getFullYear() }),
      titulo: el('input', { type: 'text', maxlength: 300, value: c.titulo || '', placeholder: 'Ex.: Processo seletivo para Agentes Comunitários de Saúde' }),
      descricao: el('textarea', { rows: 4, maxlength: 4000, placeholder: 'Cargos, requisitos, carga horária, remuneração…' }),
      unidade: el('input', { type: 'text', maxlength: 150, value: c.unidade_nome || '' }),
      vagas: el('input', { type: 'text', maxlength: 200, value: c.vagas || '', placeholder: 'Ex.: 12 vagas + cadastro reserva' }),
      organizadora: el('input', { type: 'text', maxlength: 200, value: c.organizadora || '', placeholder: 'Comissão ou banca organizadora' }),
      insIni: el('input', { type: 'date', value: c.inscricoes_inicio || '' }),
      insFim: el('input', { type: 'date', value: c.inscricoes_fim || '' }),
      prova: el('input', { type: 'date', value: c.data_prova || '' }),
      validade: el('input', { type: 'date', value: c.validade_ate || '' }),
      andamento: el('select', null, opcoes(ANDAMENTOS, c.andamento || 'inscricoes_abertas')),
      link: el('input', { type: 'url', value: c.link_externo || '', placeholder: 'https://… (site das inscrições ou da banca)' })
    };
    f.descricao.value = c.descricao || '';
    const abas = P.abas([
      ['dados', 'Dados da seleção', [
        el('div', { class: 'grade-campos' }, campo('cc-tipo', 'Tipo', f.tipo, null, true), campo('cc-num', 'Número do edital', f.numero), campo('cc-ano', 'Ano', f.ano, null, true)),
        campo('cc-tit', 'Título', f.titulo, null, true), campo('cc-desc', 'Descrição', f.descricao),
        el('div', { class: 'grade-campos' }, campo('cc-uni', 'Unidade', f.unidade), campo('cc-vagas', 'Vagas', f.vagas), campo('cc-org', 'Organizadora', f.organizadora)),
        campo('cc-link', 'Link externo (opcional)', f.link)]],
      ['datas', 'Datas e andamento', [
        el('div', { class: 'grade-campos' }, campo('cc-ii', 'Início das inscrições', f.insIni), campo('cc-if', 'Fim das inscrições', f.insFim)),
        el('div', { class: 'grade-campos' }, campo('cc-prova', 'Data da prova / avaliação', f.prova), campo('cc-val', 'Validade da seleção até', f.validade)),
        campo('cc-and', 'Andamento', f.andamento)]],
      ['documentos', 'Documentos', editando ? () => abaDocumentos(c, travado) : null, editando ? null : 'Salve a seleção primeiro para incluir o edital e os demais documentos.']
    ]);
    const corpo = el('form', { class: 'form-dialogo', novalidate: true },
      travado ? el('p', { class: 'msg msg-info' }, 'Esta seleção está publicada. Só quem tem permissão de publicar pode alterá-la.') : null, abas);
    if (travado) for (const i of corpo.querySelectorAll('input, select, textarea')) i.disabled = true;
    const acoes = [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => dlg.close() }, travado ? 'Fechar' : 'Cancelar')];
    const btnR = el('button', { type: 'button', class: 'btn btn-claro' }, publicado ? 'Tirar do ar (rascunho)' : 'Salvar rascunho');
    const btnP = el('button', { type: 'button', class: 'btn btn-primario' }, publicado ? 'Salvar' : 'Publicar');
    if (!travado) { if (!publicado || perm.publicar) acoes.push(btnR); if (perm.publicar && editando) acoes.push(btnP); }
    const dlg = P.abrirDialogo(editando ? 'Editar seleção' : 'Nova seleção', corpo, acoes);
    dlg.classList.add('dialogo-largo');
    if (abaInicial) abas.ir(abaInicial);

    async function salvar(situacao, btn) {
      const a = parseInt(f.ano.value, 10);
      if (!erroCampo('cc-tit', f.titulo.value.trim().length >= 5 ? '' : 'Informe o título.')) return;
      if (!erroCampo('cc-ano', a >= 1990 && a <= 2100 ? '' : 'Ano inválido.')) return;
      if (!erroCampo('cc-if', !f.insIni.value || !f.insFim.value || f.insFim.value >= f.insIni.value ? '' : 'O fim não pode ser antes do início.')) return;
      if (!erroCampo('cc-link', f.link.value.trim() && !P.urlValida(f.link.value.trim()) ? 'Endereço completo, começando com https://' : '')) return;
      ocupado(btn, 'Salvando…');
      try {
        const dados = { tipo: f.tipo.value, numero: f.numero.value.trim() || null, ano: a, titulo: f.titulo.value.trim(), descricao: f.descricao.value.trim() || null,
          unidade_nome: f.unidade.value.trim() || null, vagas: f.vagas.value.trim() || null, organizadora: f.organizadora.value.trim() || null,
          inscricoes_inicio: f.insIni.value || null, inscricoes_fim: f.insFim.value || null, data_prova: f.prova.value || null, validade_ate: f.validade.value || null,
          andamento: f.andamento.value, link_externo: f.link.value.trim() || null, situacao };
        const id = await P.gravarRegistro('concursos', dados, c.id);
        dlg.close();
        toast(situacao === 'publicado' ? 'Publicado.' : 'Rascunho salvo.');
        ano = a; await recarregar();
        // Seleção nova: reabre na aba Documentos para incluir o edital (6.6).
        if (!editando) { const { data } = await sb.from('concursos').select('*').eq('id', id).maybeSingle(); if (data) form(data, 'documentos'); }
      } catch (e) { mostrarErro(e); } finally { ocupado(btn); }
    }
    btnR.addEventListener('click', () => salvar('rascunho', btnR));
    btnP.addEventListener('click', () => salvar('publicado', btnP));
  }

  async function excluir(c) {
    if (!await P.confirmar('Excluir seleção', 'Excluir "' + rotulo(c) + '" e todos os documentos? Seleção encerrada continua na relação (PNTP 6.6 e 6.7); exclua só se foi lançada por engano.', 'Excluir', true)) return;
    const { data: docs } = await sb.from('concursos_documentos').select('arquivo_url').eq('concurso_id', c.id);
    const { data, error } = await sb.from('concursos').delete().eq('id', c.id).select('id');
    if (error) return mostrarErro(error);
    if (!data || !data.length) return toast('Seu perfil não pode excluir esta seleção.', true);
    for (const d of docs || []) P.apagarArquivo(d.arquivo_url);
    toast('Seleção excluída.'); await recarregar();
  }

  function desenhar() {
    const botaoAno = (x) => el('button', { type: 'button', role: 'tab', class: 'aba aba-p', 'aria-selected': ano === x.ano ? 'true' : 'false',
      onclick: async () => { if (ano === x.ano) return; ano = x.ano; await recarregarLista(); } }, String(x.ano), el('span', { class: 'aba-qtd' }, String(x.total)));
    const fBusca = el('input', { type: 'search', placeholder: 'Título, edital, cargo, organizadora', value: filtros.busca, 'aria-label': 'Buscar' });
    const fTipo = el('select', { 'aria-label': 'Tipo' }, opcoes(TIPOS, filtros.tipo, 'Tipo: todos'));
    const fAnd = el('select', { 'aria-label': 'Andamento' }, opcoes(ANDAMENTOS, filtros.andamento, 'Andamento: todos'));
    const fSit = el('select', { 'aria-label': 'Situação' }, opcoes({ publicado: 'No ar', rascunho: 'Rascunho' }, filtros.situacao, 'Situação: todas'));
    const lista = el('div');
    const aplicar = () => {
      Object.assign(filtros, { busca: fBusca.value.trim(), tipo: fTipo.value, andamento: fAnd.value, situacao: fSit.value });
      carregar(true).then(desenharLista).catch(mostrarErro);
    };
    [fTipo, fAnd, fSit].forEach((x) => x.addEventListener('change', aplicar));
    let espera; fBusca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(aplicar, 400); });
    function desenharLista() {
      if (!itens.length) { lista.replaceChildren(el('p', { class: 'vazio' }, 'Nenhuma seleção com esses filtros.')); return; }
      const btnMais = el('button', { type: 'button', class: 'btn btn-claro' }, 'Carregar mais');
      btnMais.addEventListener('click', async () => { ocupado(btnMais, 'Carregando…'); try { await carregar(false); desenharLista(); } catch (e) { mostrarErro(e); ocupado(btnMais); } });
      lista.replaceChildren(el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela' },
        el('thead', null, el('tr', null, ['Seleção', 'Inscrições', 'Andamento', 'Situação'].map((h) => el('th', { scope: 'col' }, h)), el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Ações')))),
        el('tbody', null, itens.map((c) => el('tr', null,
          el('td', { class: 'quebra' }, el('strong', null, rotulo(c)), el('span', { class: 'sub-linha' }, c.titulo)),
          el('td', { class: 'num' }, c.inscricoes_inicio || c.inscricoes_fim ? (P.dataBR(c.inscricoes_inicio) || '…') + ' a ' + (P.dataBR(c.inscricoes_fim) || '…') : '—'),
          el('td', null, el('span', { class: 'etiqueta etiqueta-' + (COR[c.andamento] || 'rascunho') }, ANDAMENTOS[c.andamento] || c.andamento)),
          el('td', null, el('span', { class: 'etiqueta etiqueta-' + (c.situacao === 'publicado' ? 'publicado' : 'rascunho') }, c.situacao === 'publicado' ? 'No ar' : 'Rascunho')),
          el('td', { class: 'acoes' },
            el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => form(c, 'documentos') }, 'Documentos'),
            podeGravar() ? el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => form(c) }, c.situacao === 'publicado' && !perm.publicar ? 'Ver' : 'Editar') : null,
            perm.excluir && podeGravar() ? el('button', { type: 'button', class: 'btn btn-claro btn-p btn-texto-perigo', onclick: () => excluir(c) }, 'Excluir') : null)))))),
      el('div', { class: 'rodape-lista' }, el('span', { class: 'ajuda' }, 'Mostrando ' + itens.length + ' de ' + total), fim ? '' : btnMais));
    }
    conteiner.replaceChildren(...[
      el('div', { class: 'cabecalho-modulo' },
        el('div', null, el('h1', null, 'Concursos e processos seletivos'),
          el('p', { class: 'sub' }, 'Editais e todos os atos de concursos, processos seletivos, seleções de estágio e chamamentos (PNTP 6.6 e 6.7).')),
        podeGravar() ? el('div', { class: 'botoes-cabecalho' }, el('button', { type: 'button', class: 'btn btn-primario', onclick: () => form() }, '+ Nova seleção')) : null),
      P.estado.alcanceUnidade && perm.editar ? el('p', { class: 'msg msg-info' }, 'Seleções são do órgão todo: só quem tem acesso ao órgão inteiro altera.') : null,
      el('p', { class: 'ajuda' }, 'Sem seleção publicada, o site declara que não há concursos ou processos seletivos. Publicar exige o edital (íntegra) na aba Documentos.'),
      el('div', { class: 'painel-guia' },
        anos.length ? el('div', { class: 'abas abas-internas', role: 'tablist', 'aria-label': 'Ano' }, anos.map(botaoAno)) : null,
        anos.length ? el('div', { class: 'painel-guia painel-guia-interno' }, el('div', { class: 'filtros' }, fBusca, fTipo, fAnd, fSit), lista)
          : el('p', { class: 'vazio' }, 'Nenhuma seleção cadastrada.'))
    ].filter(Boolean));
    if (anos.length) desenharLista();
  }

  async function recarregarLista() { try { await carregar(true); desenhar(); } catch (e) { mostrarErro(e); } }
  async function recarregar() { try { await carregarAnos(); await carregar(true); desenhar(); } catch (e) { mostrarErro(e); } }

  P.telas.concursos = async function (c, mod, p) {
    perm = p; conteiner = c;
    c.replaceChildren(el('h1', null, 'Concursos e processos seletivos'), el('p', { class: 'sub' }, 'Carregando…'));
    try { await carregarAnos(); await carregar(true); desenhar(); }
    catch (e) { c.querySelector('.sub').textContent = /concursos_anos|Could not find/i.test(e.message || '') ? 'Falta rodar o script 20 no banco.' : P.erroGravacao(e); }
  };
})();
