// =====================================================================
// Módulo "Planejamento e prestação de contas" (Lote 6 · Fase 2)
// PNTP 11.1 a 11.10: PPA, LDO, LOA, RREO, RGF, Balanço Geral, Relatório
// de Gestão, parecer do Tribunal de Contas, julgamento pela Câmara e
// Plano Estratégico. Cada linha é um arquivo; lei e anexos do mesmo
// instrumento ficam em linhas com a mesma identificação e "parte"
// diferente (o cadastro aceita vários PDFs de uma vez).
// No topo, o aviso padrão do PNTP (autoavaliação, app.js) mostra o que falta por exercício/período,
// considerando os prazos legais (série histórica de 3 anos).
// =====================================================================
(function () {
  'use strict';
  const P = window.PNTP;
  const { sb, el, toast, ocupado, erroCampo, campo } = P;
  const LOTE = 50;
  const LIMITE_MB = 50;

  // [nome, critério PNTP, classificação]
  const TIPOS = {
    ppa: ['PPA – Plano Plurianual', '11.8', 'Essencial'],
    ldo: ['LDO – Lei de Diretrizes Orçamentárias', '11.9', 'Essencial'],
    loa: ['LOA – Lei Orçamentária Anual', '11.10', 'Essencial'],
    rreo: ['RREO – Relatório Resumido da Execução Orçamentária', '11.6', 'Essencial'],
    rgf: ['RGF – Relatório de Gestão Fiscal', '11.5', 'Essencial'],
    balanco: ['Prestação de contas anual (Balanço Geral)', '11.1', 'Obrigatória'],
    relatorio_gestao: ['Relatório de Gestão ou de Atividades', '11.2', 'Obrigatória'],
    parecer_tce: ['Parecer / decisão do Tribunal de Contas', '11.3', 'Obrigatória'],
    julgamento_camara: ['Julgamento das contas pela Câmara', '11.4', 'Obrigatória'],
    plano_estrategico: ['Plano Estratégico Institucional', '11.7', 'Recomendada']
  };
  const RESULTADOS = { aprovadas: 'Aprovadas', aprovadas_ressalvas: 'Aprovadas com ressalvas', rejeitadas: 'Rejeitadas', pendente: 'Pendente de apreciação' };
  const nomeCurto = (t) => TIPOS[t][0].split(' – ')[0];
  // Mesmas abas (e ordem) da página "Planejamento e prestação de contas" do site.
  const ABAS_SITE = [['ppa', 'PPA'], ['ldo', 'LDO'], ['loa', 'LOA'], ['plano_estrategico', 'Plano Estratégico'], ['rreo', 'RREO'], ['rgf', 'RGF'],
    ['balanco', 'Balanço'], ['relatorio_gestao', 'Relatório de Gestão'], ['parecer_tce', 'Parecer TCE'], ['julgamento_camara', 'Julgamento Câmara']];

  let perm = {};
  let conteiner = null;
  let itens = [], fim = false, total = 0;
  let rgfPeriodicidade = 'quadrimestral';
  const filtros = { busca: '', tipo: '', exercicio: '', documento: '', situacao: '' };

  const podeGravar = () => perm.editar && !P.estado.alcanceUnidade;
  const mostrarErro = (e) => {
    const t = (e && e.message) || '';
    if (/contas_periodo/.test(t)) return toast('Informe o período (bimestre, quadrimestre ou semestre).', true);
    if (/contas_documento/.test(t)) return toast('Para publicar, envie o PDF ou informe o link (ou marque o resultado como "pendente").', true);
    toast(P.erroGravacao(e), true);
  };

  function periodoTexto(d) {
    if (d.tipo === 'rreo') return d.periodo + 'º bimestre de ' + d.exercicio;
    if (d.tipo === 'rgf') return d.periodo + 'º ' + (d.periodicidade === 'semestral' ? 'semestre' : 'quadrimestre') + ' de ' + d.exercicio;
    if (d.exercicio_fim) return d.exercicio + '–' + d.exercicio_fim;
    if (d.tipo === 'parecer_tce' || d.tipo === 'julgamento_camara') return 'contas de ' + d.exercicio;
    return String(d.exercicio);
  }

  // Periodicidade do RGF (a autoavaliação do PNTP, no alto da tela, cobra os períodos por ela).
  function periodicidadeRgf() {
    const selRgf = el('select', { 'aria-label': 'Periodicidade do RGF' },
      el('option', { value: 'quadrimestral', selected: rgfPeriodicidade === 'quadrimestral' }, 'quadrimestral'),
      el('option', { value: 'semestral', selected: rgfPeriodicidade === 'semestral' }, 'semestral (até 50 mil hab.)'));
    selRgf.addEventListener('change', async () => {
      const cfg = Object.assign({}, P.estado.orgao.configuracoes || {}, { rgf_periodicidade: selRgf.value });
      const { data, error } = await sb.from('orgaos').update({ configuracoes: cfg }).eq('id', P.estado.orgao.id).select('id');
      if (error || !data || !data.length) { toast('Só quem altera "Aparência e contatos" pode mudar a periodicidade do RGF.', true); selRgf.value = rgfPeriodicidade; return; }
      P.estado.orgao.configuracoes = cfg; rgfPeriodicidade = selRgf.value;
      toast('Periodicidade do RGF: ' + selRgf.value + '.'); desenhar();
    });
    return el('p', { class: 'ajuda' }, 'O RGF deste órgão é publicado ', selRgf, ' (a autoavaliação do PNTP cobra os períodos por esta escolha).');
  }

  // ---------------------------------------------------------------------
  // Lista
  // ---------------------------------------------------------------------
  function consulta(sel, opcoes) {
    let q = sb.from('documentos_contas').select(sel, opcoes).eq('orgao_id', P.estado.orgao.id);
    if (filtros.busca) q = q.ilike('busca', '%' + P.normalizar(filtros.busca).replace(/[%_]/g, '') + '%');
    if (filtros.tipo) q = q.eq('tipo', filtros.tipo);
    if (filtros.documento === 'pdf') q = q.not('arquivo_url', 'is', null);
    if (filtros.documento === 'link') q = q.is('arquivo_url', null).not('link_externo', 'is', null);
    if (filtros.documento === 'sem') q = q.is('arquivo_url', null).is('link_externo', null);
    if (filtros.exercicio) q = q.eq('exercicio', parseInt(filtros.exercicio, 10));
    if (filtros.situacao) q = q.eq('situacao', filtros.situacao);
    return q;
  }
  async function carregar(reiniciar) {
    const ultimo = reiniciar ? null : itens[itens.length - 1];
    const [pag, t] = await Promise.all([
      P.paginar(consulta, 'data_publicacao', ultimo, LOTE),
      reiniciar ? P.contar(consulta) : Promise.resolve(total)
    ]);
    itens = reiniciar ? pag.linhas : itens.concat(pag.linhas);
    fim = pag.fim; total = t;
  }

  // ---------------------------------------------------------------------
  // Formulário
  // ---------------------------------------------------------------------
  function form(d) {
    d = d || {};
    const editando = !!d.id;
    const publicado = d.situacao === 'publicado';
    const travado = publicado && !perm.publicar;
    const Y = new Date().getFullYear();
    const f = {
      tipo: el('select', null, el('option', { value: '' }, '— Escolha —'),
        Object.entries(TIPOS).map(([k, v]) => el('option', { value: k, selected: d.tipo === k }, v[0] + ' (PNTP ' + v[1] + ')'))),
      exercicio: el('input', { type: 'number', min: 1990, max: 2100, value: d.exercicio || Y }),
      exercicioFim: el('input', { type: 'number', min: 1990, max: 2100, value: d.exercicio_fim || '' }),
      bimestre: el('select', null, [1, 2, 3, 4, 5, 6].map((b) => el('option', { value: b, selected: d.periodo === b }, b + 'º bimestre'))),
      rgfPer: el('select', null,
        el('option', { value: 'quadrimestral', selected: (d.periodicidade || rgfPeriodicidade) === 'quadrimestral' }, 'Quadrimestral'),
        el('option', { value: 'semestral', selected: (d.periodicidade || rgfPeriodicidade) === 'semestral' }, 'Semestral')),
      rgfPeriodo: el('select'),
      resultado: el('select', null, el('option', { value: '' }, '— Escolha —'),
        Object.entries(RESULTADOS).map(([k, v]) => el('option', { value: k, selected: d.resultado === k }, v))),
      numeroAto: el('input', { type: 'text', maxlength: 120, value: d.numero_ato || '', placeholder: 'Ex.: Parecer Prévio nº 123/2025-TC' }),
      data: el('input', { type: 'date', value: d.data_publicacao || new Date().toISOString().slice(0, 10) }),
      descricao: el('input', { type: 'text', maxlength: 300, value: d.descricao || '' }),
      parte: el('input', { type: 'text', maxlength: 120, value: d.parte || 'Documento completo' }),
      pdfs: el('input', { type: 'file', accept: 'application/pdf', multiple: !editando }),
      link: el('input', { type: 'url', value: d.link_externo || '', placeholder: 'https://…' })
    };
    const desenharRgf = () => {
      const n = f.rgfPer.value === 'semestral' ? 2 : 3;
      const nome = f.rgfPer.value === 'semestral' ? 'semestre' : 'quadrimestre';
      f.rgfPeriodo.replaceChildren(...Array.from({ length: n }, (_, k) => el('option', { value: k + 1, selected: d.periodo === k + 1 }, (k + 1) + 'º ' + nome)));
    };
    f.rgfPer.addEventListener('change', desenharRgf); desenharRgf();

    const bExFim = campo('ct-exfim', 'Último ano', f.exercicioFim, 'PPA: 4 anos a partir do 1º.');
    const bBim = campo('ct-bim', 'Bimestre', f.bimestre);
    const bRgf = el('div', { class: 'grade-campos' }, campo('ct-rgfper', 'Periodicidade', f.rgfPer), campo('ct-rgfp', 'Período', f.rgfPeriodo));
    const bRes = el('div', { class: 'grade-campos' }, campo('ct-res', 'Resultado', f.resultado, '"Pendente" informa que as contas ainda não foram apreciadas (sem documento).', true), campo('ct-ato', 'Número do ato', f.numeroAto));
    const rotEx = el('label', { for: 'ct-ex' }, 'Exercício');
    const ajustar = () => {
      const t = f.tipo.value;
      bExFim.hidden = !(t === 'ppa' || t === 'plano_estrategico');
      bBim.hidden = t !== 'rreo';
      bRgf.hidden = t !== 'rgf';
      bRes.hidden = !(t === 'parecer_tce' || t === 'julgamento_camara');
      rotEx.textContent = t === 'ppa' || t === 'plano_estrategico' ? 'Primeiro ano' : (t === 'parecer_tce' || t === 'julgamento_camara') ? 'Exercício das contas' : 'Exercício';
      if (t === 'ppa' && !f.exercicioFim.value) f.exercicioFim.value = (parseInt(f.exercicio.value, 10) || Y) + 3;
    };
    f.tipo.addEventListener('change', ajustar);
    f.exercicio.addEventListener('change', () => { if (f.tipo.value === 'ppa') f.exercicioFim.value = (parseInt(f.exercicio.value, 10) || Y) + 3; });
    f.exercicio.id = 'ct-ex';

    // Vários PDFs de uma vez (lei + anexos): cada um vira uma linha com sua "parte".
    const listaArquivos = el('div', { class: 'lista-arquivos' });
    let partes = [];
    f.pdfs.addEventListener('change', () => {
      partes = [...f.pdfs.files].map((arq, k) => ({ arq, parte: el('input', { type: 'text', maxlength: 120, 'aria-label': 'Nome da parte ' + (k + 1),
        value: k === 0 && f.pdfs.files.length > 1 ? 'Lei' : arq.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ') }) }));
      listaArquivos.replaceChildren(...partes.map((p) => el('div', { class: 'linha-arquivo' }, p.parte,
        el('span', { class: 'ajuda' }, (p.arq.size / 1048576).toFixed(1).replace('.', ',') + ' MB'))));
    });
    const usaLink = !!(d.link_externo && !d.arquivo_url);
    const rPdf = el('input', { type: 'radio', name: 'ct-doc', value: 'pdf', checked: !usaLink });
    const rLink = el('input', { type: 'radio', name: 'ct-doc', value: 'link', checked: usaLink });
    const bPdf = el('div', null,
      campo('ct-pdf', editando ? 'Trocar o PDF' : 'Arquivos PDF', f.pdfs, editando ? (d.arquivo_url ? 'Deixe em branco para manter o atual.' : null)
        : 'Pode escolher vários de uma vez (lei e anexos). Até ' + LIMITE_MB + ' MB cada. Use PDF com texto pesquisável (não escaneado).'),
      d.arquivo_url ? el('a', { href: d.arquivo_url, target: '_blank', rel: 'noopener', class: 'ajuda' }, 'Ver PDF atual') : null,
      listaArquivos);
    const bLink = el('div', null, campo('ct-link', 'Link do documento', f.link, 'Ex.: página no site do TCE-RN, da Câmara ou do Diário Oficial.'),
      campo('ct-parte-l', 'Parte', f.parte, 'Ex.: "Lei", "Anexo I – Metas fiscais", "Documento completo".'));
    const alternarDoc = () => { bPdf.hidden = !rPdf.checked; bLink.hidden = !rLink.checked; };
    rPdf.addEventListener('change', alternarDoc); rLink.addEventListener('change', alternarDoc);

    const parteEdicao = editando && !usaLink ? campo('ct-parte', 'Parte', el('input', { type: 'text', maxlength: 120, value: d.parte || '' })) : null;
    const corpo = el('form', { class: 'form-dialogo', novalidate: true },
      travado ? el('p', { class: 'msg msg-info' }, 'Este documento está publicado. Só quem tem permissão de publicar pode alterá-lo.') : null,
      P.abas([
        ['periodo', 'Tipo e período', [
          campo('ct-tipo', 'Documento', f.tipo, null, true),
          el('div', { class: 'grade-campos' }, el('div', { class: 'campo' }, rotEx, f.exercicio, el('span', { class: 'erro-campo', id: 'ct-ex-erro' })), bExFim, bBim),
          bRgf, bRes,
          el('div', { class: 'grade-campos' }, campo('ct-data', 'Data de publicação', f.data, null, true), campo('ct-desc', 'Observação', f.descricao))]],
        ['arquivos', 'Arquivos', [
          el('fieldset', { class: 'opcoes' }, el('legend', null, 'Documento'),
            el('label', { class: 'checkbox' }, rPdf, ' Enviar PDF'), el('label', { class: 'checkbox' }, rLink, ' Link externo'),
            parteEdicao, bPdf, bLink)]]
      ]));
    ajustar(); alternarDoc();
    if (travado) for (const i of corpo.querySelectorAll('input, select')) i.disabled = true;

    const acoes = [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => dlg.close() }, travado ? 'Fechar' : 'Cancelar')];
    const btnR = el('button', { type: 'button', class: 'btn btn-claro' }, publicado ? 'Tirar do ar (rascunho)' : 'Salvar rascunho');
    const btnP = el('button', { type: 'button', class: 'btn btn-primario' }, publicado ? 'Salvar' : 'Publicar');
    if (!travado) { if (!publicado || perm.publicar) acoes.push(btnR); if (perm.publicar) acoes.push(btnP); }
    const dlg = P.abrirDialogo(editando ? 'Editar documento' : 'Novo documento', corpo, acoes);
    dlg.classList.add('dialogo-largo');

    async function salvar(situacao, btn) {
      const t = f.tipo.value;
      if (!erroCampo('ct-tipo', t ? '' : 'Escolha o documento.')) return;
      const ex = parseInt(f.exercicio.value, 10);
      if (!erroCampo('ct-ex', ex >= 1990 && ex <= 2100 ? '' : 'Ano inválido.')) return;
      const exFim = (t === 'ppa' || t === 'plano_estrategico') && f.exercicioFim.value ? parseInt(f.exercicioFim.value, 10) : null;
      if ((t === 'ppa' || t === 'plano_estrategico') && !erroCampo('ct-exfim', exFim && exFim >= ex ? '' : 'Informe o último ano (igual ou depois do primeiro).')) return;
      const resultado = (t === 'parecer_tce' || t === 'julgamento_camara') ? f.resultado.value : null;
      if ((t === 'parecer_tce' || t === 'julgamento_camara') && !erroCampo('ct-res', resultado ? '' : 'Escolha o resultado.')) return;
      if (!erroCampo('ct-data', f.data.value ? '' : 'Informe a data.')) return;
      const link = f.link.value.trim();
      if (rLink.checked && !erroCampo('ct-link', !link || P.urlValida(link) ? '' : 'Endereço completo, começando com https://')) return;
      const arquivos = rPdf.checked ? [...f.pdfs.files] : [];
      for (const a of arquivos) {
        if (a.type !== 'application/pdf') { erroCampo('ct-pdf', '"' + a.name + '" não é PDF.'); return; }
        if (a.size > LIMITE_MB * 1048576) { erroCampo('ct-pdf', '"' + a.name + '" passa de ' + LIMITE_MB + ' MB. Reduza o arquivo ou use link externo.'); return; }
      }
      const semDoc = rPdf.checked ? !arquivos.length && !d.arquivo_url : !link;
      if (situacao === 'publicado' && semDoc && resultado !== 'pendente') { erroCampo(rPdf.checked ? 'ct-pdf' : 'ct-link', 'Para publicar, informe o documento.'); return; }

      const base = {
        tipo: t, exercicio: ex, exercicio_fim: exFim,
        periodicidade: t === 'rreo' ? 'bimestral' : t === 'rgf' ? f.rgfPer.value : null,
        periodo: t === 'rreo' ? parseInt(f.bimestre.value, 10) : t === 'rgf' ? parseInt(f.rgfPeriodo.value, 10) : null,
        resultado, numero_ato: resultado ? (f.numeroAto.value.trim() || null) : null,
        data_publicacao: f.data.value, descricao: f.descricao.value.trim() || null, situacao
      };
      ocupado(btn, arquivos.length > 1 ? 'Enviando 1 de ' + arquivos.length + '…' : 'Salvando…');
      try {
        if (editando) {
          const antigo = d.arquivo_url || null;
          let url = rPdf.checked ? antigo : null;
          if (arquivos[0]) url = await P.enviarArquivo('contas', arquivos[0], 'pdf', 'application/pdf');
          const parte = rLink.checked ? (f.parte.value.trim() || 'Documento completo') : ((parteEdicao && parteEdicao.querySelector('input').value.trim()) || d.parte);
          await P.gravarRegistro('documentos_contas', Object.assign(base, { arquivo_url: url, link_externo: rLink.checked ? (link || null) : null, parte }), d.id);
          if (antigo && antigo !== url) P.apagarArquivo(antigo);
        } else if (rPdf.checked && arquivos.length) {
          // Um registro por arquivo, na ordem escolhida.
          for (let k = 0; k < arquivos.length; k++) {
            btn.textContent = 'Enviando ' + (k + 1) + ' de ' + arquivos.length + '…';
            const url = await P.enviarArquivo('contas', arquivos[k], 'pdf', 'application/pdf');
            const parte = (partes[k] && partes[k].parte.value.trim()) || 'Parte ' + (k + 1);
            await P.gravarRegistro('documentos_contas', Object.assign({}, base, { arquivo_url: url, parte, ordem: (k + 1) * 10 }));
          }
        } else {
          await P.gravarRegistro('documentos_contas', Object.assign(base, {
            link_externo: rLink.checked ? (link || null) : null,
            // Contas pendentes sem documento: o nome da parte é o que aparece no site.
            parte: rLink.checked && link ? (f.parte.value.trim() || 'Documento completo') : resultado === 'pendente' ? 'Aguardando apreciação' : 'Documento completo'
          }));
        }
        dlg.close();
        toast(situacao === 'publicado' ? 'Publicado.' : 'Rascunho salvo.');
        await recarregar();
      } catch (e) { mostrarErro(e); }
      finally { ocupado(btn); }
    }
    btnR.addEventListener('click', () => salvar('rascunho', btnR));
    btnP.addEventListener('click', () => salvar('publicado', btnP));
  }

  async function excluir(d) {
    if (!await P.confirmar('Excluir documento', 'Excluir "' + nomeCurto(d.tipo) + ' · ' + periodoTexto(d) + ' · ' + d.parte + '"? Documentos de prestação de contas normalmente não são apagados: o PNTP exige série histórica de 3 anos.', 'Excluir', true)) return;
    const { data, error } = await sb.from('documentos_contas').delete().eq('id', d.id).select('id');
    if (error) return mostrarErro(error);
    if (!data || !data.length) return toast('Seu perfil não pode excluir este documento.', true);
    P.apagarArquivo(d.arquivo_url);
    toast('Documento excluído.'); await recarregar();
  }

  // ---------------------------------------------------------------------
  // Tela
  // ---------------------------------------------------------------------
  function desenhar() {
    const Y = new Date().getFullYear();
    const fTipo = el('select', { 'aria-label': 'Documento' }, el('option', { value: '' }, 'Documento: todos'),
      Object.entries(TIPOS).map(([k, v]) => el('option', { value: k, selected: filtros.tipo === k }, v[0])));
    const fEx = el('select', { 'aria-label': 'Exercício' }, el('option', { value: '' }, 'Exercício: todos'),
      Array.from({ length: 12 }, (_, k) => Y + 1 - k).map((a) => el('option', { value: a, selected: String(a) === filtros.exercicio }, String(a))));
    const fBusca = el('input', { type: 'search', placeholder: 'Parte, observação ou nº do ato', value: filtros.busca, 'aria-label': 'Buscar' });
    const fDoc = el('select', { 'aria-label': 'Arquivo' }, el('option', { value: '' }, 'Arquivo: todos'),
      [['pdf', 'Com PDF'], ['link', 'Com link externo'], ['sem', 'Sem documento']].map(([k, v]) => el('option', { value: k, selected: filtros.documento === k }, v)));
    const fSit = el('select', { 'aria-label': 'Situação' }, el('option', { value: '' }, 'Situação: todas'),
      el('option', { value: 'publicado', selected: filtros.situacao === 'publicado' }, 'Publicados'),
      el('option', { value: 'rascunho', selected: filtros.situacao === 'rascunho' }, 'Rascunhos'));
    const lista = el('div');
    const aplicar = () => {
      Object.assign(filtros, { busca: fBusca.value.trim(), tipo: fTipo.value, exercicio: fEx.value, documento: fDoc.value, situacao: fSit.value });
      lista.replaceChildren(el('p', { class: 'vazio' }, 'Carregando…'));
      carregar(true).then(desenharLista).catch(mostrarErro);
    };
    [fTipo, fEx, fDoc, fSit].forEach((x) => x.addEventListener('change', aplicar));
    let espera; fBusca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(aplicar, 400); });

    function desenharLista() {
      if (!itens.length) { lista.replaceChildren(el('p', { class: 'vazio' }, Object.values(filtros).some(Boolean) ? 'Nenhum documento com esses filtros.' : 'Nenhum documento cadastrado ainda. Comece pela LOA, LDO e PPA vigentes (critérios essenciais).')); return; }
      const btnMais = el('button', { type: 'button', class: 'btn btn-claro' }, 'Carregar mais');
      btnMais.addEventListener('click', async () => { ocupado(btnMais, 'Carregando…'); try { await carregar(false); desenharLista(); } catch (e) { mostrarErro(e); ocupado(btnMais); } });
      lista.replaceChildren(
        el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela' },
          el('thead', null, el('tr', null, ['Documento', 'Parte', 'Publicado em', 'Situação', 'Arquivo'].map((t) => el('th', { scope: 'col' }, t)), el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Ações')))),
          el('tbody', null, itens.map((d) => {
            const doc = d.arquivo_url || d.link_externo;
            return el('tr', null,
              el('td', null, el('strong', null, nomeCurto(d.tipo)), el('span', { class: 'sub-linha' }, periodoTexto(d)),
                d.resultado ? el('span', { class: 'mt-05 etiqueta etiqueta-' + (d.resultado === 'pendente' ? 'agendado' : d.resultado === 'rejeitadas' ? 'desativado' : 'publicado') }, RESULTADOS[d.resultado]) : null),
              el('td', { class: 'quebra' }, d.parte, d.descricao ? el('span', { class: 'sub-linha' }, d.descricao) : null),
              el('td', { class: 'num' }, P.dataBR(d.data_publicacao)),
              el('td', null, el('span', { class: 'etiqueta etiqueta-' + (d.situacao === 'publicado' ? 'publicado' : 'rascunho') }, d.situacao === 'publicado' ? 'No ar' : 'Rascunho')),
              el('td', null, doc ? el('a', { href: doc, target: '_blank', rel: 'noopener' }, d.arquivo_url ? 'PDF' : 'Link') : (d.resultado === 'pendente' ? el('span', { class: 'falta-leve' }, '—') : el('span', { class: 'falta' }, 'Sem documento'))),
              el('td', { class: 'acoes' },
                podeGravar() ? el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => form(d) }, d.situacao === 'publicado' && !perm.publicar ? 'Ver' : 'Editar') : null,
                perm.excluir && podeGravar() ? el('button', { type: 'button', class: 'btn btn-claro btn-p btn-texto-perigo', onclick: () => excluir(d) }, 'Excluir') : null));
          })))),
        el('div', { class: 'rodape-lista' }, el('span', { class: 'ajuda' }, 'Mostrando ' + itens.length + ' de ' + total), fim ? '' : btnMais));
    }

    conteiner.replaceChildren(...[
      el('div', { class: 'cabecalho-modulo' },
        el('div', null, el('h1', null, 'Planejamento e prestação de contas'),
          el('p', { class: 'sub' }, 'PPA, LDO, LOA, RREO, RGF, Balanço Geral, Relatório de Gestão, pareceres e julgamentos das contas (PNTP 11.1 a 11.10).')),
        podeGravar() ? el('button', { type: 'button', class: 'btn btn-primario', onclick: () => form(filtros.tipo ? { tipo: filtros.tipo } : null) }, '+ Novo documento') : null),
      P.estado.alcanceUnidade && perm.editar ? el('p', { class: 'msg msg-info' }, 'Estes documentos são do órgão todo: só quem tem acesso ao órgão inteiro altera.') : null,
      periodicidadeRgf(),
      // Abas na mesma ordem das do site (uma por documento), com "Todos" à frente.
      el('div', { class: 'abas', role: 'tablist', 'aria-label': 'Documento' }, [['', 'Todos']].concat(ABAS_SITE).map(([k, rot]) =>
        el('button', { type: 'button', role: 'tab', class: 'aba', 'aria-selected': filtros.tipo === k ? 'true' : 'false', title: k ? TIPOS[k][0] : null,
          onclick: async () => { if (filtros.tipo === k) return; filtros.tipo = k; try { await carregar(true); desenhar(); } catch (e) { mostrarErro(e); } } }, rot))),
      el('div', { class: 'painel-guia' },
        filtros.tipo ? P.declaracoes('planejamento_' + filtros.tipo, { perm })
          : el('p', { class: 'ajuda' }, 'Para declarar que não há um documento num exercício (ex.: parecer do Tribunal de Contas ainda não emitido), abra a aba do documento.'),
        el('div', { class: 'filtros filtros-6' }, fBusca, fEx, fDoc, fSit), lista)
    ].filter(Boolean));
    desenharLista();
  }

  async function recarregar() {
    try { await carregar(true); desenhar(); } catch (e) { mostrarErro(e); }
  }

  P.telas.contas = async function (c, mod, p) {
    perm = p; conteiner = c;
    c.replaceChildren(el('h1', null, 'Planejamento e prestação de contas'), el('p', { class: 'sub' }, 'Carregando…'));
    try {
      const o = await sb.from('orgaos').select('configuracoes').eq('id', P.estado.orgao.id).maybeSingle();
      P.estado.orgao.configuracoes = (o.data && o.data.configuracoes) || {};
      rgfPeriodicidade = P.estado.orgao.configuracoes.rgf_periodicidade === 'semestral' ? 'semestral' : 'quadrimestral';
      await carregar(true);
      desenhar();
    } catch (e) { c.querySelector('.sub').textContent = P.erroGravacao(e); }
  };
})();
