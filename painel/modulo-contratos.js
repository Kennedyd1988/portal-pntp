// =====================================================================
// Módulo "Contratos" (Lote 8 · Fase 2) — PNTP 9.1 a 9.3
// Contratos com o inteiro teor, aditivos (prazo, valor, apostilamento,
// rescisão) e fiscais. Fontes: portal, link ou PNCP (como as licitações).
// Valor e vigência "atuais" são calculados pelo banco a partir dos aditivos.
// Telas em abas no estilo de guia (padrão do projeto): ano → lista;
// no diálogo do contrato: Aditivos | Fiscais.
// =====================================================================
(function () {
  'use strict';
  const P = window.PNTP;
  const { sb, el, toast, ocupado, erroCampo, campo } = P;
  const LOTE = 50;
  const LIMITE_MB = 50;

  const TIPOS = { contrato: 'Contrato', ata_registro_precos: 'Ata de registro de preços', empenho: 'Nota de empenho (substitui contrato)', carta_contrato: 'Carta-contrato', outro: 'Outro instrumento' };
  const TIPOS_ADITIVO = { prazo: 'Prazo', valor: 'Valor (acréscimo/supressão)', prazo_valor: 'Prazo e valor', qualitativo: 'Alteração qualitativa', apostilamento: 'Apostilamento (reajuste)', rescisao: 'Rescisão', outro: 'Outro' };
  const FUNCOES = { gestor: 'Gestor do contrato', fiscal: 'Fiscal', fiscal_tecnico: 'Fiscal técnico', fiscal_administrativo: 'Fiscal administrativo', fiscal_suplente: 'Fiscal suplente' };

  let perm = {}, conteiner = null;
  let ano = null, anos = [];
  let itens = [], fim = false, total = 0;
  const filtros = { busca: '', vigencia: '', origem: '', situacao: '' };

  const podeGravar = () => perm.editar && !P.estado.alcanceUnidade;
  const moeda = (v) => v === null || v === undefined || v === '' ? '' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const hoje = () => new Date().toISOString().slice(0, 10);
  const situacaoVigencia = (c) => c.rescindido_em ? ['Rescindido', 'desativado'] : !c.vigencia_fim_atual ? ['Sem vigência informada', 'rascunho']
    : c.vigencia_fim_atual >= hoje() ? ['Vigente', 'publicado'] : ['Encerrado', 'agendado'];
  const docFormatado = (d) => !d ? '' : d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  const rotulo = (c) => (TIPOS[c.tipo] || 'Contrato') + (c.numero ? ' nº ' + c.numero : '');
  const mostrarErro = (e) => {
    const t = (e && e.message) || '';
    if (/contratos_link/.test(t)) return toast('Informe o link do contrato no outro sistema.', true);
    if (/contratos_vigencia/.test(t)) return toast('O fim da vigência não pode ser antes do início.', true);
    if (/contratado_doc/.test(t)) return toast('CPF ou CNPJ inválido: use 11 ou 14 números.', true);
    if (/Este contrato está publicado|não pertence/.test(t)) return toast(t.replace(/^.*?(Este contrato|O registro)/, '$1'), true);
    toast(P.erroGravacao(e), true);
  };

  // ---------------------------------------------------------------------
  // Dados
  // ---------------------------------------------------------------------
  function consulta(sel, opcoes) {
    let q = sb.from('contratos').select(sel, opcoes).eq('orgao_id', P.estado.orgao.id);
    if (ano) q = q.eq('ano', ano);
    if (filtros.busca) q = q.ilike('busca', '%' + P.normalizar(filtros.busca).replace(/[%_]/g, '') + '%');
    if (filtros.vigencia === 'vigente') q = q.is('rescindido_em', null).gte('vigencia_fim_atual', hoje());
    if (filtros.vigencia === 'encerrado') q = q.or('vigencia_fim_atual.lt.' + hoje() + ',rescindido_em.not.is.null');
    if (filtros.origem) q = q.eq('origem', filtros.origem);
    if (filtros.situacao) q = q.eq('situacao', filtros.situacao);
    return q;
  }
  async function carregarAnos() {
    const { data, error } = await sb.rpc('contratos_anos', { p_orgao: P.estado.orgao.id });
    if (error) throw error;
    anos = data || [];
    if (!anos.some((x) => x.ano === ano)) ano = anos.length ? anos[0].ano : null;
  }
  async function carregar(reiniciar) {
    if (!ano) { itens = []; fim = true; total = 0; return; }
    const ultimo = reiniciar ? null : itens[itens.length - 1];
    const [pag, t] = await Promise.all([P.paginar(consulta, 'data_assinatura', ultimo, LOTE), reiniciar ? P.contar(consulta) : Promise.resolve(total)]);
    itens = reiniciar ? pag.linhas : itens.concat(pag.linhas);
    fim = pag.fim; total = t;
  }

  // ---------------------------------------------------------------------
  // Escolher a licitação de origem (lista de escolha do painel, sem datalist)
  // ---------------------------------------------------------------------
  function escolhaLicitacao(atualId, atualRotulo) {
    let escolhido = atualId || null;
    const atual = el('div', { class: 'escolha-atual' });
    const busca = el('input', { type: 'search', id: 'ct-lic', placeholder: 'Digite parte do objeto ou o número do processo' });
    const lista = el('div', { class: 'escolha-noticias' });
    const mostrarAtual = (txt) => atual.replaceChildren(escolhido
      ? el('span', null, 'Vinculado a: ', el('strong', null, txt || 'processo selecionado'), ' ',
        el('button', { type: 'button', class: 'link', onclick: () => { escolhido = null; mostrarAtual(); } }, 'remover vínculo'))
      : el('span', { class: 'ajuda' }, 'Sem processo vinculado (opcional).'));
    mostrarAtual(atualRotulo);
    let espera;
    busca.addEventListener('input', () => {
      clearTimeout(espera);
      espera = setTimeout(async () => {
        const t = busca.value.trim();
        if (t.length < 2) { lista.replaceChildren(); return; }
        const { data } = await sb.from('licitacoes').select('id, modalidade, numero, ano, objeto').eq('orgao_id', P.estado.orgao.id)
          .ilike('busca', '%' + P.normalizar(t).replace(/[%_]/g, '') + '%').order('data_publicacao', { ascending: false }).limit(8);
        lista.replaceChildren(...(data || []).map((l) => el('button', { type: 'button', class: 'escolha-item', onclick: () => {
          escolhido = l.id; mostrarAtual((l.numero || '') + ' — ' + l.objeto.slice(0, 80)); lista.replaceChildren(); busca.value = '';
        } }, el('span', { class: 'escolha-textos' }, el('strong', null, (l.numero || 's/nº') + ' · ' + l.modalidade.replace(/_/g, ' ')), el('span', { class: 'ajuda' }, l.objeto.slice(0, 120))))),
        (data || []).length ? '' : el('p', { class: 'ajuda' }, 'Nenhum processo encontrado.'));
      }, 350);
    });
    return { bloco: el('div', null, busca, lista, atual), valor: () => escolhido };
  }

  // ---------------------------------------------------------------------
  // Formulário do contrato
  // ---------------------------------------------------------------------
  // v0.9.1: contrato, inteiro teor, aditivos e fiscais numa só janela, em abas.
  async function form(c, abaInicial) {
    c = c || {};
    const editando = !!c.id;
    const publicado = c.situacao === 'publicado';
    const travado = publicado && !perm.publicar;
    const doPncp = c.origem === 'pncp';
    let licRotulo = null;
    if (c.licitacao_id) {
      const { data } = await sb.from('licitacoes').select('numero, objeto').eq('id', c.licitacao_id).maybeSingle();
      if (data) licRotulo = (data.numero || '') + ' — ' + data.objeto.slice(0, 80);
    }
    const f = {
      tipo: el('select', null, Object.entries(TIPOS).map(([k, v]) => el('option', { value: k, selected: (c.tipo || 'contrato') === k }, v))),
      numero: el('input', { type: 'text', maxlength: 40, value: c.numero || '', placeholder: 'Ex.: 015/2026' }),
      ano: el('input', { type: 'number', min: 1990, max: 2100, value: c.ano || ano || new Date().getFullYear() }),
      processo: el('input', { type: 'text', maxlength: 60, value: c.processo || '' }),
      objeto: el('textarea', { rows: 3, maxlength: 4000 }),
      contratado: el('input', { type: 'text', maxlength: 200, value: c.contratado_nome || '' }),
      doc: P.mascaraDoc(el('input', { type: 'text', maxlength: 18, value: docFormatado(c.contratado_doc), placeholder: 'CNPJ ou CPF' })),
      unidade: el('input', { type: 'text', maxlength: 150, value: c.unidade_nome || '' }),
      valor: el('input', { type: 'number', min: 0, step: '0.01', value: c.valor_inicial ?? '' }),
      assinatura: el('input', { type: 'date', value: c.data_assinatura || '' }),
      inicio: el('input', { type: 'date', value: c.vigencia_inicio || '' }),
      fimVig: el('input', { type: 'date', value: c.vigencia_fim || '' }),
      rescisao: el('input', { type: 'date', value: c.rescindido_em || '' }),
      pdf: el('input', { type: 'file', accept: 'application/pdf' }),
      link: el('input', { type: 'url', value: c.link_externo || '', placeholder: 'https://…' })
    };
    f.objeto.value = c.objeto || '';
    const lic = escolhaLicitacao(c.licitacao_id, licRotulo);
    const rPortal = el('input', { type: 'radio', name: 'ct-origem', value: 'portal', checked: (c.origem || 'portal') === 'portal' });
    const rLink = el('input', { type: 'radio', name: 'ct-origem', value: 'link', checked: c.origem === 'link' });

    const corpo = el('form', { class: 'form-dialogo', novalidate: true },
      travado ? el('p', { class: 'msg msg-info' }, 'Este contrato está publicado. Só quem tem permissão de publicar pode alterá-lo.') : null,
      doPncp ? el('p', { class: 'msg msg-info' }, 'Importado do PNCP: uma nova importação atualiza número, objeto, contratado, valores, vigência e os aditivos do PNCP. Fiscais e o que você acrescentar aqui são mantidos.') : null,
      null);
    const det = editando ? detalhes(c) : null;
    const salveAntes = 'Salve o contrato primeiro: a aba abre logo em seguida.';
    corpo.append(P.abas([
      ['gerais', 'Dados gerais', [
        el('div', { class: 'grade-campos' }, campo('ct-tipo', 'Instrumento', f.tipo), campo('ct-num', 'Número', f.numero), campo('ct-ano', 'Ano', f.ano, null, true)),
        campo('ct-obj', 'Objeto', f.objeto, null, true),
        el('div', { class: 'grade-campos' }, campo('ct-ctd', 'Contratado (nome ou razão social)', f.contratado, null, true), campo('ct-doc', 'CNPJ ou CPF', f.doc, 'No site, CPF aparece mascarado (LGPD).')),
        el('div', { class: 'grade-campos' }, campo('ct-proc', 'Processo administrativo', f.processo), campo('ct-un', 'Unidade contratante', f.unidade)),
        el('div', { class: 'campo' }, el('label', { for: 'ct-lic' }, 'Licitação de origem'), lic.bloco)]],
      ['valores', 'Valores e vigência', [
        el('div', { class: 'grade-campos' }, campo('ct-val', 'Valor inicial (R$)', f.valor, 'Aditivos de valor são somados automaticamente.'), campo('ct-ass', 'Data de assinatura', f.assinatura, null, true)),
        el('div', { class: 'grade-campos' }, campo('ct-ini', 'Vigência: início', f.inicio, null, true), campo('ct-fim', 'Vigência: fim (original)', f.fimVig, 'Prorrogações vão na aba "Aditivos".', true),
          campo('ct-resc', 'Rescindido em', f.rescisao, 'Só se houve rescisão antecipada.')),
        editando && (c.valor_atual != null || c.vigencia_fim_atual) ? el('p', { class: 'ajuda' }, 'Com os aditivos: valor atual ' + moeda(c.valor_atual) + (c.vigencia_fim_atual ? ' · vigente até ' + P.dataBR(c.vigencia_fim_atual) : '') + '.') : null]],
      ['teor', 'Inteiro teor', [
        doPncp ? null : el('fieldset', { class: 'opcoes' }, el('legend', null, 'Onde fica o inteiro teor'),
          el('label', { class: 'checkbox' }, rPortal, ' Neste portal (enviar o PDF aqui)'), el('label', { class: 'checkbox' }, rLink, ' Em outro sistema (só link)')),
        doPncp ? null : campo('ct-pdf', c.arquivo_url ? 'Trocar o PDF do contrato' : 'PDF do contrato (inteiro teor)', f.pdf, 'Até ' + LIMITE_MB + ' MB. Prefira PDF com texto pesquisável.'),
        c.arquivo_url ? el('a', { href: c.arquivo_url, target: '_blank', rel: 'noopener', class: 'ajuda' }, 'Ver PDF atual') : null,
        campo('ct-link', doPncp ? 'Página no PNCP' : 'Link do contrato', f.link, doPncp ? null : 'Obrigatório se o inteiro teor estiver em outro sistema.')]],
      det ? ['aditivos', 'Aditivos', det.aditivos] : ['aditivos', 'Aditivos', null, salveAntes],
      det ? ['fiscais', 'Fiscais e gestor', det.fiscais] : ['fiscais', 'Fiscais e gestor', null, salveAntes]
    ], abaInicial));
    if (travado) for (const i of corpo.querySelectorAll('input, select, textarea, button.link')) i.disabled = true;

    const acoes = [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => dlg.close() }, travado ? 'Fechar' : 'Cancelar')];
    const btnR = el('button', { type: 'button', class: 'btn btn-claro' }, publicado ? 'Tirar do ar (rascunho)' : 'Salvar rascunho');
    const btnP = el('button', { type: 'button', class: 'btn btn-primario' }, publicado ? 'Salvar' : 'Publicar');
    if (!travado) { if (!publicado || perm.publicar) acoes.push(btnR); if (perm.publicar) acoes.push(btnP); }
    const dlg = P.abrirDialogo(editando ? 'Editar contrato' : 'Novo contrato', corpo, acoes);
    dlg.classList.add('dialogo-largo');
    // Aditivo muda valor/vigência atuais: ao fechar, a lista é atualizada.
    dlg.addEventListener('close', () => { if (det && det.mudou()) recarregarLista(); });

    async function salvar(situacao, btn) {
      const a = parseInt(f.ano.value, 10);
      if (!erroCampo('ct-ano', a >= 1990 && a <= 2100 ? '' : 'Ano inválido.')) return;
      if (!erroCampo('ct-obj', f.objeto.value.trim().length >= 5 ? '' : 'Descreva o objeto.')) return;
      if (!erroCampo('ct-ctd', f.contratado.value.trim().length >= 2 ? '' : 'Informe o contratado.')) return;
      const doc = f.doc.value.replace(/\D/g, '');
      if (!erroCampo('ct-doc', P.erroDoc(doc))) return;
      if (!erroCampo('ct-ass', f.assinatura.value ? '' : 'Informe a data de assinatura.')) return;
      if (situacao === 'publicado') {
        if (!erroCampo('ct-ini', f.inicio.value ? '' : 'Informe o início da vigência.')) return;
        if (!erroCampo('ct-fim', f.fimVig.value ? '' : 'Informe o fim da vigência (PNTP 9.1).')) return;
      }
      if (!erroCampo('ct-fim', !f.inicio.value || !f.fimVig.value || f.fimVig.value >= f.inicio.value ? '' : 'O fim não pode ser antes do início.')) return;
      const origem = doPncp ? 'pncp' : rLink.checked ? 'link' : 'portal';
      const link = f.link.value.trim();
      if (!erroCampo('ct-link', origem === 'link' && !link ? 'Informe o link.' : link && !P.urlValida(link) ? 'Endereço completo, começando com https://' : '')) return;
      const arq = !doPncp && f.pdf.files[0];
      if (arq && !erroCampo('ct-pdf', arq.type !== 'application/pdf' ? 'Envie um PDF.' : arq.size > LIMITE_MB * 1048576 ? 'O arquivo passa de ' + LIMITE_MB + ' MB.' : '')) return;
      ocupado(btn, arq ? 'Enviando…' : 'Salvando…');
      try {
        const antigo = c.arquivo_url || null;
        let url = antigo;
        if (arq) url = await P.enviarArquivo('contratos', arq, 'pdf', 'application/pdf');
        const dados = {
          origem, tipo: f.tipo.value, numero: f.numero.value.trim() || null, ano: a, processo: f.processo.value.trim() || null, objeto: f.objeto.value.trim(),
          contratado_nome: f.contratado.value.trim(), contratado_doc: doc || null, unidade_nome: f.unidade.value.trim() || null,
          valor_inicial: f.valor.value === '' ? null : Number(f.valor.value), data_assinatura: f.assinatura.value,
          vigencia_inicio: f.inicio.value || null, vigencia_fim: f.fimVig.value || null, rescindido_em: f.rescisao.value || null,
          licitacao_id: lic.valor(), arquivo_url: url, link_externo: link || null, situacao
        };
        const id = await P.gravarRegistro('contratos', dados, c.id);
        if (antigo && antigo !== url) P.apagarArquivo(antigo);
        dlg.close();
        toast(situacao === 'publicado' ? 'Publicado.' : 'Rascunho salvo.');
        ano = a; await recarregar();
        // Contrato novo: reabre a mesma janela na aba Fiscais (o PNTP 9.3 exige a lista de fiscais).
        if (!editando) form(Object.assign({}, c, dados, { id }), 'fiscais');
      } catch (e) { mostrarErro(e); }
      finally { ocupado(btn); }
    }
    btnR.addEventListener('click', () => salvar('rascunho', btnR));
    btnP.addEventListener('click', () => salvar('publicado', btnP));
  }

  // ---------------------------------------------------------------------
  // Aditivos e fiscais: conteúdo das abas da janela do contrato (v0.9.1).
  // Cada aba é montada na 1ª vez que abre e se redesenha após incluir/excluir.
  // ---------------------------------------------------------------------
  function detalhes(c) {
    const travado = c.situacao === 'publicado' && !perm.publicar;
    const pode = podeGravar() && !travado;
    const areaA = el('div'), areaF = el('div');
    let mudou = false;

    async function aditivos() {
      const { data, error } = await sb.from('contratos_aditivos').select('*').eq('contrato_id', c.id).order('data_assinatura').limit(200);
      if (error) throw error;
      const lista = data || [];
      const f = {
        numero: el('input', { type: 'text', maxlength: 60, placeholder: 'Ex.: 1º Termo Aditivo' }),
        tipo: el('select', null, Object.entries(TIPOS_ADITIVO).map(([k, v]) => el('option', { value: k }, v))),
        data: el('input', { type: 'date', value: hoje() }),
        valor: el('input', { type: 'number', step: '0.01', placeholder: 'Ex.: 5000 ou -2000' }),
        vig: el('input', { type: 'date' }),
        desc: el('input', { type: 'text', maxlength: 500 }),
        pdf: el('input', { type: 'file', accept: 'application/pdf' }),
        link: el('input', { type: 'url', placeholder: 'https://…' })
      };
      const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Adicionar aditivo');
      btn.addEventListener('click', async () => {
        if (!erroCampo('ad-data', f.data.value ? '' : 'Informe a data.')) return;
        const arq = f.pdf.files[0], link = f.link.value.trim();
        if (arq && !erroCampo('ad-pdf', arq.type !== 'application/pdf' ? 'Envie um PDF.' : arq.size > LIMITE_MB * 1048576 ? 'Passa de ' + LIMITE_MB + ' MB.' : '')) return;
        if (!erroCampo('ad-link', link && !P.urlValida(link) ? 'Endereço completo (https://…).' : '')) return;
        ocupado(btn, 'Salvando…');
        try {
          const url = arq ? await P.enviarArquivo('contratos', arq, 'pdf', 'application/pdf') : null;
          const { error: e } = await sb.from('contratos_aditivos').insert({ contrato_id: c.id, orgao_id: P.estado.orgao.id, numero: f.numero.value.trim() || null,
            tipo: f.tipo.value, data_assinatura: f.data.value, valor: f.valor.value === '' ? null : Number(f.valor.value), nova_vigencia_fim: f.vig.value || null,
            descricao: f.desc.value.trim() || null, arquivo_url: url, link_externo: link || null });
          if (e) { if (url) P.apagarArquivo(url); throw e; }
          mudou = true; toast('Aditivo registrado. Valor e vigência do contrato foram recalculados.'); aditivos().catch(mostrarErro);
        } catch (e) { mostrarErro(e); ocupado(btn); }
      });
      areaA.replaceChildren(
        lista.length ? el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela' },
          el('thead', null, el('tr', null, ['Termo', 'Data', 'Valor', 'Nova vigência', 'Arquivo'].map((t) => el('th', { scope: 'col' }, t)), el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Ações')))),
          el('tbody', null, lista.map((a) => el('tr', null,
            el('td', { class: 'quebra' }, el('strong', null, a.numero || TIPOS_ADITIVO[a.tipo]), el('span', { class: 'sub-linha' }, TIPOS_ADITIVO[a.tipo] + (a.descricao ? ' · ' + a.descricao : '') + (a.origem === 'pncp' ? ' · PNCP' : ''))),
            el('td', { class: 'num' }, P.dataBR(a.data_assinatura)), el('td', { class: 'num' }, moeda(a.valor)), el('td', { class: 'num' }, P.dataBR(a.nova_vigencia_fim)),
            el('td', null, a.arquivo_url || a.link_externo ? el('a', { href: a.arquivo_url || a.link_externo, target: '_blank', rel: 'noopener' }, a.arquivo_url ? 'PDF' : 'Link') : el('span', { class: 'falta-leve' }, 'Sem arquivo')),
            el('td', { class: 'acoes' }, pode && a.origem !== 'pncp' ? el('button', { type: 'button', class: 'btn btn-claro btn-p btn-texto-perigo', onclick: async () => {
              if (!await P.confirmar('Excluir aditivo', 'Excluir "' + (a.numero || TIPOS_ADITIVO[a.tipo]) + '"? O valor e a vigência do contrato serão recalculados.', 'Excluir', true)) return;
              const { data: d, error: e } = await sb.from('contratos_aditivos').delete().eq('id', a.id).select('id');
              if (e) return mostrarErro(e);
              if (!d || !d.length) return toast('Seu perfil não pode excluir este aditivo.', true);
              if (a.arquivo_url) P.apagarArquivo(a.arquivo_url);
              mudou = true; toast('Aditivo excluído.'); aditivos().catch(mostrarErro);
            } }, 'Excluir') : null))))))
          : el('p', { class: 'vazio' }, 'Nenhum aditivo.'),
        pode ? el('fieldset', { class: 'opcoes' }, el('legend', null, 'Novo aditivo, apostilamento ou rescisão'),
          el('div', { class: 'grade-campos' }, campo('ad-num', 'Identificação', f.numero), campo('ad-tipo', 'Tipo', f.tipo), campo('ad-data', 'Data de assinatura', f.data, null, true)),
          el('div', { class: 'grade-campos' }, campo('ad-val', 'Valor (R$)', f.valor, 'Acréscimo positivo; supressão negativa.'), campo('ad-vig', 'Nova data de fim da vigência', f.vig, 'Só se prorrogar.')),
          campo('ad-desc', 'Descrição', f.desc),
          el('div', { class: 'grade-campos' }, campo('ad-pdf', 'PDF do termo (inteiro teor)', f.pdf), campo('ad-link', 'Ou link', f.link)),
          el('div', { style: 'margin-top:10px' }, btn)) : null);
    }

    async function fiscais() {
      const { data, error } = await sb.from('contratos_fiscais').select('*').eq('contrato_id', c.id).order('funcao').order('nome').limit(100);
      if (error) throw error;
      const lista = data || [];
      const f = {
        nome: el('input', { type: 'text', maxlength: 150 }),
        funcao: el('select', null, Object.entries(FUNCOES).map(([k, v]) => el('option', { value: k, selected: k === 'fiscal' }, v))),
        ato: el('input', { type: 'text', maxlength: 120, placeholder: 'Ex.: Portaria nº 45/2026' }),
        inicio: el('input', { type: 'date' }), fim: el('input', { type: 'date' })
      };
      const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Adicionar');
      btn.addEventListener('click', async () => {
        if (!erroCampo('fi-nome', f.nome.value.trim().length >= 3 ? '' : 'Informe o nome completo.')) return;
        ocupado(btn, 'Salvando…');
        try {
          const { error: e } = await sb.from('contratos_fiscais').insert({ contrato_id: c.id, orgao_id: P.estado.orgao.id, nome: f.nome.value.trim(), funcao: f.funcao.value,
            ato: f.ato.value.trim() || null, inicio: f.inicio.value || null, fim: f.fim.value || null });
          if (e) throw e;
          toast('Registrado.'); fiscais().catch(mostrarErro);
        } catch (e) { mostrarErro(e); ocupado(btn); }
      });
      areaF.replaceChildren(
        lista.length ? el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela' },
          el('thead', null, el('tr', null, ['Nome', 'Função', 'Designação', 'Período'].map((t) => el('th', { scope: 'col' }, t)), el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Ações')))),
          el('tbody', null, lista.map((x) => el('tr', null, el('td', null, el('strong', null, x.nome)), el('td', null, FUNCOES[x.funcao]), el('td', null, x.ato || ''),
            el('td', { class: 'num' }, x.inicio || x.fim ? (P.dataBR(x.inicio) || '…') + ' a ' + (P.dataBR(x.fim) || 'atual') : 'Todo o contrato'),
            el('td', { class: 'acoes' }, pode ? el('button', { type: 'button', class: 'btn btn-claro btn-p btn-texto-perigo', onclick: async () => {
              if (!await P.confirmar('Remover', 'Remover ' + x.nome + ' deste contrato? Para troca de fiscal, prefira informar a data de fim (o PNTP pede o histórico).', 'Remover', true)) return;
              const { data: d, error: e } = await sb.from('contratos_fiscais').delete().eq('id', x.id).select('id');
              if (e) return mostrarErro(e);
              if (!d || !d.length) return toast('Seu perfil não pode remover.', true);
              toast('Removido.'); fiscais().catch(mostrarErro);
            } }, 'Remover') : null))))))
          : el('p', { class: 'vazio' }, 'Nenhum fiscal informado. O PNTP (9.3) exige a relação dos fiscais de cada contrato, vigente e encerrado.'),
        pode ? el('fieldset', { class: 'opcoes' }, el('legend', null, 'Adicionar fiscal ou gestor'),
          el('div', { class: 'grade-campos' }, campo('fi-nome', 'Nome', f.nome, null, true), campo('fi-fun', 'Função', f.funcao), campo('fi-ato', 'Ato de designação', f.ato)),
          el('div', { class: 'grade-campos' }, campo('fi-ini', 'Desde', f.inicio, 'Em branco: desde o início do contrato.'), campo('fi-fim', 'Até', f.fim, 'Preencha quando for substituído.')),
          el('div', { style: 'margin-top:10px' }, btn)) : null);
    }
    const aviso = travado ? el('p', { class: 'msg msg-info' }, 'Contrato publicado: só quem tem permissão de publicar altera aditivos e fiscais.') : null;
    return {
      aditivos: () => { areaA.replaceChildren(el('p', { class: 'vazio' }, 'Carregando…')); aditivos().catch(mostrarErro); return [aviso && aviso.cloneNode(true), areaA]; },
      fiscais: () => { areaF.replaceChildren(el('p', { class: 'vazio' }, 'Carregando…')); fiscais().catch(mostrarErro); return [aviso && aviso.cloneNode(true), areaF]; },
      mudou: () => mudou
    };
  }

  // ---------------------------------------------------------------------
  // Importação do PNCP (mesma ponte "pncp" das licitações)
  // ---------------------------------------------------------------------
  async function pncp(caminho) {
    const { data, error } = await sb.functions.invoke('pncp', { body: { orgao_id: P.estado.orgao.id, caminho } });
    if (error) throw P.amigavel('A função "pncp" não respondeu. Confira se ela está instalada e com a versão nova (lista de endereços com "termos").');
    if (!data || !data.ok) throw P.amigavel((data && data.erro) || 'Falha na consulta ao PNCP.');
    return data.dados;
  }
  const tipoPncp = (n) => /empenho/i.test(n || '') ? 'empenho' : /ata/i.test(n || '') ? 'ata_registro_precos' : /carta/i.test(n || '') ? 'carta_contrato' : /contrato/i.test(n || '') ? 'contrato' : 'outro';
  // O mapeamento PNCP → contratos também existe em supabase/functions/pncp-sincronizar. Mudou um, mude o outro.
  function mapear(x, cnpj, licPorControle) {
    const num = x.numeroContratoEmpenho ? String(x.numeroContratoEmpenho) : null;
    const doc = String(x.niFornecedor || '').replace(/\D/g, '');
    return {
      orgao_id: P.estado.orgao.id, origem: 'pncp', pncp_controle: x.numeroControlePNCP, tipo: tipoPncp(x.tipoContrato && x.tipoContrato.nome),
      numero: num ? num + (num.includes('/') ? '' : '/' + x.anoContrato) : null, ano: x.anoContrato, processo: x.processo || null,
      objeto: String(x.objetoContrato || 'Objeto não informado no PNCP').slice(0, 4000).padEnd(5, ' '),
      contratado_nome: String(x.nomeRazaoSocialFornecedor || 'Não informado').slice(0, 200), contratado_doc: doc.length === 11 || doc.length === 14 ? doc : null,
      unidade_nome: x.unidadeOrgao ? x.unidadeOrgao.nomeUnidade || null : null,
      valor_inicial: x.valorInicial ?? x.valorGlobal ?? null, data_assinatura: x.dataAssinatura || x.dataVigenciaInicio || String(x.dataPublicacaoPncp || hoje()).slice(0, 10),
      vigencia_inicio: x.dataVigenciaInicio || null, vigencia_fim: x.dataVigenciaFim && (!x.dataVigenciaInicio || x.dataVigenciaFim >= x.dataVigenciaInicio) ? x.dataVigenciaFim : null,
      licitacao_id: licPorControle.get(x.numeroControlePncpCompra) || null,
      link_externo: 'https://pncp.gov.br/app/contratos/' + cnpj + '/' + x.anoContrato + '/' + x.sequencialContrato,
      pncp_atualizado: x.dataAtualizacao ? new Date(x.dataAtualizacao).toISOString() : null
    };
  }

  function importar() {
    const cfg = P.estado.orgao.configuracoes || {};
    const cnpjOrgao = (P.estado.orgao.cnpj || '').replace(/\D/g, '');
    const Y = new Date().getFullYear();
    const f = {
      cnpjs: el('input', { type: 'text', value: (Array.isArray(cfg.pncp_cnpjs) && cfg.pncp_cnpjs.length ? cfg.pncp_cnpjs : [cnpjOrgao]).join(', ') }),
      inicio: el('input', { type: 'date', value: Y + '-01-01' }), fim: el('input', { type: 'date', value: hoje() }),
      publicar: el('input', { type: 'checkbox', checked: !!perm.publicar, disabled: !perm.publicar }),
      aditivos: el('input', { type: 'checkbox', checked: true })
    };
    const progresso = el('div', { class: 'progresso-importacao', role: 'status', 'aria-live': 'polite' });
    const corpo = el('form', { class: 'form-dialogo', novalidate: true },
      el('p', { class: 'ajuda' }, 'Busca no PNCP os contratos (e empenhos que substituem contrato) publicados no período. Já importados são atualizados; não cria repetidos. '
        + 'Vincula à licitação de origem quando ela também veio do PNCP. Fiscais não existem no PNCP: informe-os aqui depois. '
        + ((P.estado.orgao.configuracoes || {}).pncp_auto ? 'A importação automática noturna (ligada em Licitações) também traz os contratos.' : 'A importação automática noturna é ligada em Licitações › Importar do PNCP e passa a trazer contratos também.')),
      campo('cp-cnpj', 'CNPJ(s) no PNCP', f.cnpjs, 'Separe por vírgula.', true),
      el('div', { class: 'grade-campos' }, campo('cp-ini', 'De', f.inicio, null, true), campo('cp-fim', 'Até', f.fim, null, true)),
      el('label', { class: 'checkbox' }, f.publicar, ' Publicar no site os contratos novos (sem marcar, entram como rascunho)'),
      el('label', { class: 'checkbox' }, f.aditivos, ' Trazer os termos aditivos de cada contrato'),
      progresso);
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Importar');
    const dlg = P.abrirDialogo('Importar contratos do PNCP', corpo, [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => dlg.close() }, 'Fechar'), btn]);
    dlg.classList.add('dialogo-largo');
    btn.addEventListener('click', async () => {
      const cnpjs = [...new Set(f.cnpjs.value.split(/[,;\s]+/).map((x) => x.replace(/\D/g, '')).filter(Boolean))];
      if (!erroCampo('cp-cnpj', !cnpjs.length ? 'Informe o CNPJ.' : (cnpjs.map((x) => P.erroDoc(x, 'cnpj')).find(Boolean) || ''))) return;
      if (!erroCampo('cp-fim', f.inicio.value && f.fim.value >= f.inicio.value ? '' : 'Período inválido.')) return;
      ocupado(btn, 'Consultando…');
      const linha = (t) => progresso.append(el('p', null, t));
      progresso.replaceChildren();
      let novos = 0, atualizados = 0, termos = 0;
      try {
        const janelas = [];
        for (let d = new Date(f.inicio.value + 'T12:00:00'); d <= new Date(f.fim.value + 'T12:00:00');) {
          const ate = new Date(Math.min(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 364, 12).getTime(), new Date(f.fim.value + 'T12:00:00').getTime()));
          janelas.push([d.toISOString().slice(0, 10).replace(/-/g, ''), ate.toISOString().slice(0, 10).replace(/-/g, '')]);
          d = new Date(ate.getFullYear(), ate.getMonth(), ate.getDate() + 1, 12);
        }
        const achados = [];
        for (const cnpj of cnpjs) for (const [de, ate] of janelas) for (let pg = 1; pg <= 200; pg++) {
          const r = await pncp('/api/consulta/v1/contratos?dataInicial=' + de + '&dataFinal=' + ate + '&cnpjOrgao=' + cnpj + '&pagina=' + pg + '&tamanhoPagina=50');
          const lista = (r && r.data) || [];
          for (const x of lista) achados.push({ x, cnpj: (x.orgaoEntidade && x.orgaoEntidade.cnpj) || cnpj });
          if (!r || !r.paginasRestantes || !lista.length) break;
        }
        linha(achados.length + ' contrato(s) encontrados no PNCP.');
        const controles = achados.map((a) => a.x.numeroControlePNCP);
        const comprasPncp = [...new Set(achados.map((a) => a.x.numeroControlePncpCompra).filter(Boolean))];
        const existentes = new Map(), licPorControle = new Map();
        for (let i = 0; i < controles.length; i += 100) {
          const { data, error } = await sb.from('contratos').select('id, pncp_controle, pncp_atualizado').eq('orgao_id', P.estado.orgao.id).in('pncp_controle', controles.slice(i, i + 100));
          if (error) throw error;
          for (const x of data || []) existentes.set(x.pncp_controle, x);
        }
        for (let i = 0; i < comprasPncp.length; i += 100) {
          const { data } = await sb.from('licitacoes').select('id, pncp_controle').eq('orgao_id', P.estado.orgao.id).in('pncp_controle', comprasPncp.slice(i, i + 100));
          for (const x of data || []) licPorControle.set(x.pncp_controle, x.id);
        }
        const novosReg = [], mudados = [];
        for (const { x, cnpj } of achados) {
          const reg = mapear(x, cnpj, licPorControle);
          const ex = existentes.get(reg.pncp_controle);
          if (!ex) novosReg.push(Object.assign(reg, { situacao: f.publicar.checked ? 'publicado' : 'rascunho' }));
          else if (!ex.pncp_atualizado || !reg.pncp_atualizado || new Date(reg.pncp_atualizado) > new Date(ex.pncp_atualizado)) mudados.push(reg);
        }
        btn.textContent = 'Gravando…';
        const comTermos = [];
        for (let i = 0; i < novosReg.length; i += 50) {
          const { data, error } = await sb.from('contratos').insert(novosReg.slice(i, i + 50)).select('id, pncp_controle');
          if (error) throw error;
          novos += data.length; comTermos.push(...data);
        }
        for (let i = 0; i < mudados.length; i += 50) {
          const { data, error } = await sb.from('contratos').upsert(mudados.slice(i, i + 50), { onConflict: 'orgao_id,pncp_controle' }).select('id, pncp_controle');
          if (error) throw error;
          atualizados += data.length; comTermos.push(...data);
        }
        linha(novos + ' novo(s), ' + atualizados + ' atualizado(s), ' + (achados.length - novos - atualizados) + ' sem mudança.');
        if (f.aditivos.checked && comTermos.length) {
          const porControle = new Map(achados.map((a) => [a.x.numeroControlePNCP, a]));
          let k = 0;
          for (const c of comTermos) {
            btn.textContent = 'Aditivos ' + (++k) + ' de ' + comTermos.length + '…';
            const a = porControle.get(c.pncp_controle);
            if (!a) continue;
            let lista;
            try { lista = await pncp('/api/pncp/v1/orgaos/' + a.cnpj + '/contratos/' + a.x.anoContrato + '/' + a.x.sequencialContrato + '/termos'); } catch (_) { continue; }
            const del = await sb.from('contratos_aditivos').delete().eq('contrato_id', c.id).eq('origem', 'pncp');
            if (del.error) throw del.error;
            const regs = (Array.isArray(lista) ? lista : []).filter((t) => t.statusAtivo !== false).map((t) => ({
              contrato_id: c.id, orgao_id: P.estado.orgao.id, origem: 'pncp', pncp_sequencial: t.sequencialTermoContrato || null,
              numero: t.numeroTermoContrato ? 'Termo ' + t.numeroTermoContrato : null,
              tipo: t.qualificacaoVigencia && t.qualificacaoAcrescimoSupressao ? 'prazo_valor' : t.qualificacaoVigencia ? 'prazo' : t.qualificacaoAcrescimoSupressao ? 'valor' : t.qualificacaoReajuste ? 'apostilamento' : 'outro',
              data_assinatura: t.dataAssinatura || hoje(), descricao: t.objetoTermoContrato ? String(t.objetoTermoContrato).slice(0, 500) : null,
              valor: t.valorAcrescido ?? null, nova_vigencia_fim: t.qualificacaoVigencia ? (t.dataVigenciaFim || null) : null,
              link_externo: 'https://pncp.gov.br/app/contratos/' + a.cnpj + '/' + a.x.anoContrato + '/' + a.x.sequencialContrato }));
            if (regs.length) { const ins = await sb.from('contratos_aditivos').insert(regs); if (ins.error) throw ins.error; termos += regs.length; }
          }
          linha(termos + ' termo(s) aditivo(s) vinculados.');
        }
        toast('Importação concluída.'); await recarregar();
      } catch (e) {
        linha('Parou com erro: ' + P.erroGravacao(e) + (novos || atualizados ? ' (o que já foi gravado fica salvo).' : ''));
        mostrarErro(e);
      } finally { ocupado(btn); btn.textContent = 'Importar de novo'; }
    });
  }

  async function excluir(c) {
    const [{ data: ad }] = await Promise.all([sb.from('contratos_aditivos').select('arquivo_url').eq('contrato_id', c.id).not('arquivo_url', 'is', null).limit(200)]);
    if (!await P.confirmar('Excluir contrato', 'Excluir "' + rotulo(c) + '" com seus aditivos e fiscais? O PNTP exige manter o histórico de contratos encerrados; prefira só corrigir.', 'Excluir', true)) return;
    const { data, error } = await sb.from('contratos').delete().eq('id', c.id).select('id');
    if (error) return mostrarErro(error);
    if (!data || !data.length) return toast('Seu perfil não pode excluir este contrato.', true);
    if (c.arquivo_url) P.apagarArquivo(c.arquivo_url);
    for (const a of ad || []) P.apagarArquivo(a.arquivo_url);
    toast('Contrato excluído.'); await recarregar();
  }

  // ---------------------------------------------------------------------
  // Tela
  // ---------------------------------------------------------------------
  // Aba "Fiscais de contratos" (igual à do site, PNTP 9.3): todos os fiscais e gestores, com o contrato.
  // A inclusão e a troca de fiscais continuam dentro de cada contrato (aba "Fiscais e gestor").
  let abaTopo = 'contratos';
  function telaFiscais(caixa) {
    const fBusca = el('input', { type: 'search', placeholder: 'Nome do fiscal ou portaria', 'aria-label': 'Buscar fiscal' });
    const fVig = el('select', { 'aria-label': 'Designação' }, el('option', { value: 'atuais' }, 'Designações atuais'), el('option', { value: '' }, 'Todas, inclusive encerradas'));
    const lista = el('div', null, el('p', { class: 'vazio' }, 'Carregando…'));
    async function carregarFiscais() {
      const hojeTxt = new Date().toISOString().slice(0, 10);
      let q = sb.from('contratos_fiscais').select('id, nome, funcao, ato, inicio, fim, contrato_id, contratos(id, tipo, numero, ano, objeto, contratado_nome, situacao)')
        .eq('orgao_id', P.estado.orgao.id).order('nome').limit(1000);
      if (fBusca.value.trim()) q = q.ilike('busca', '%' + P.normalizar(fBusca.value.trim()).replace(/[%_]/g, '') + '%');
      if (fVig.value === 'atuais') q = q.or('fim.is.null,fim.gte.' + hojeTxt);
      const { data, error } = await q;
      if (error) { lista.replaceChildren(el('p', { class: 'msg msg-erro' }, P.erroGravacao(error))); return; }
      const l = data || [];
      lista.replaceChildren(!l.length ? el('p', { class: 'vazio' }, 'Nenhum fiscal designado com esses filtros. Os fiscais são incluídos dentro de cada contrato.')
        : el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela' },
          el('thead', null, el('tr', null, ['Fiscal ou gestor', 'Função', 'Contrato', 'Designação', 'Período'].map((t) => el('th', { scope: 'col' }, t)), el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Ações')))),
          el('tbody', null, l.map((x) => el('tr', null,
            el('td', null, el('strong', null, x.nome)), el('td', null, FUNCOES[x.funcao] || x.funcao),
            el('td', { class: 'quebra' }, x.contratos ? [rotulo(x.contratos) + (x.contratos.ano && !String(x.contratos.numero || '').includes('/') ? '/' + x.contratos.ano : ''),
              el('span', { class: 'sub-linha' }, x.contratos.contratado_nome)] : '—'),
            el('td', null, x.ato || '—'),
            el('td', { class: 'num' }, (P.dataBR(x.inicio) || '…') + ' a ' + (P.dataBR(x.fim) || 'atual')),
            el('td', { class: 'acoes' }, el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: async () => {
              const { data: ct } = await sb.from('contratos').select('*').eq('id', x.contrato_id).maybeSingle();
              if (ct) form(ct, 'fiscais');
            } }, 'Abrir contrato'))))))),
        el('p', { class: 'ajuda' }, l.length + ' designação(ões).'));
    }
    let espera; fBusca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(carregarFiscais, 400); });
    fVig.addEventListener('change', carregarFiscais);
    caixa.replaceChildren(el('p', { class: 'ajuda' }, 'Fiscais e gestores de todos os contratos, como aparecem no site (PNTP 9.3). Para incluir, trocar ou encerrar uma designação, abra o contrato.'),
      el('div', { class: 'filtros' }, fBusca, fVig), lista);
    carregarFiscais();
  }

  function desenhar() {
    const botaoAno = (x) => el('button', { type: 'button', role: 'tab', class: 'aba', 'aria-selected': ano === x.ano ? 'true' : 'false',
      onclick: async () => { if (ano === x.ano) return; ano = x.ano; await recarregarLista(); } }, String(x.ano), el('span', { class: 'aba-qtd' }, String(x.total)));
    const fBusca = el('input', { type: 'search', placeholder: 'Contratado, CNPJ, objeto ou número', value: filtros.busca, 'aria-label': 'Buscar' });
    const fVig = el('select', { 'aria-label': 'Vigência' }, el('option', { value: '' }, 'Vigência: todos'),
      el('option', { value: 'vigente', selected: filtros.vigencia === 'vigente' }, 'Vigentes'), el('option', { value: 'encerrado', selected: filtros.vigencia === 'encerrado' }, 'Encerrados ou rescindidos'));
    const fOri = el('select', { 'aria-label': 'Origem' }, el('option', { value: '' }, 'Origem: todas'),
      [['portal', 'Cadastrado no portal'], ['link', 'Link externo'], ['pncp', 'Importado do PNCP']].map(([k, v]) => el('option', { value: k, selected: filtros.origem === k }, v)));
    const fSit = el('select', { 'aria-label': 'Situação' }, el('option', { value: '' }, 'Situação: todas'),
      el('option', { value: 'publicado', selected: filtros.situacao === 'publicado' }, 'No ar'), el('option', { value: 'rascunho', selected: filtros.situacao === 'rascunho' }, 'Rascunho'));
    const lista = el('div');
    const aplicar = () => {
      Object.assign(filtros, { busca: fBusca.value.trim(), vigencia: fVig.value, origem: fOri.value, situacao: fSit.value });
      lista.replaceChildren(el('p', { class: 'vazio' }, 'Carregando…'));
      carregar(true).then(desenharLista).catch(mostrarErro);
    };
    [fVig, fOri, fSit].forEach((x) => x.addEventListener('change', aplicar));
    let espera; fBusca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(aplicar, 400); });

    function desenharLista() {
      if (!itens.length) { lista.replaceChildren(el('p', { class: 'vazio' }, Object.values(filtros).some(Boolean) ? 'Nenhum contrato com esses filtros.' : 'Nenhum contrato neste ano.')); return; }
      const btnMais = el('button', { type: 'button', class: 'btn btn-claro' }, 'Carregar mais');
      btnMais.addEventListener('click', async () => { ocupado(btnMais, 'Carregando…'); try { await carregar(false); desenharLista(); } catch (e) { mostrarErro(e); ocupado(btnMais); } });
      lista.replaceChildren(
        el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela tabela-lic' },
          el('thead', null, el('tr', null, ['Contrato', 'Contratado', 'Valor atual', 'Vigência', 'Origem', 'Situação'].map((t) => el('th', { scope: 'col' }, t)), el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Ações')))),
          el('tbody', null, itens.map((c) => {
            const sv = situacaoVigencia(c);
            return el('tr', null,
              el('td', { class: 'quebra' }, el('strong', null, rotulo(c)), el('span', { class: 'sub-linha' }, c.objeto.length > 140 ? c.objeto.slice(0, 140) + '…' : c.objeto)),
              el('td', { class: 'quebra' }, c.contratado_nome, c.contratado_doc ? el('span', { class: 'sub-linha' }, docFormatado(c.contratado_doc)) : null),
              el('td', { class: 'num' }, moeda(c.valor_atual)),
              el('td', { class: 'num' }, (P.dataBR(c.vigencia_inicio) || '?') + ' a ' + (P.dataBR(c.vigencia_fim_atual) || '?'), el('span', { class: 'etiqueta etiqueta-' + sv[1], style: 'margin-top:4px' }, sv[0])),
              el('td', null, c.origem === 'pncp' ? 'PNCP' : c.origem === 'link' ? el('a', { href: c.link_externo, target: '_blank', rel: 'noopener' }, 'Link') : 'Portal'),
              el('td', null, el('span', { class: 'etiqueta etiqueta-' + (c.situacao === 'publicado' ? 'publicado' : 'rascunho') }, c.situacao === 'publicado' ? 'No ar' : 'Rascunho')),
              el('td', { class: 'acoes' },
                el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => form(c, 'aditivos') }, 'Aditivos e fiscais'),
                podeGravar() ? el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => form(c) }, c.situacao === 'publicado' && !perm.publicar ? 'Ver' : 'Editar') : null,
                perm.excluir && podeGravar() ? el('button', { type: 'button', class: 'btn btn-claro btn-p btn-texto-perigo', onclick: () => excluir(c) }, 'Excluir') : null));
          })))),
        el('div', { class: 'rodape-lista' }, el('span', { class: 'ajuda' }, 'Mostrando ' + itens.length + ' de ' + total), fim ? '' : btnMais));
    }

    conteiner.replaceChildren(...[
      el('div', { class: 'cabecalho-modulo' },
        el('div', null, el('h1', null, 'Contratos'),
          el('p', { class: 'sub' }, 'Contratos, atas e empenhos, com inteiro teor, aditivos e fiscais (PNTP 9.1 a 9.3).')),
        podeGravar() ? el('div', { class: 'botoes-cabecalho' },
          el('button', { type: 'button', class: 'btn btn-claro', onclick: importar }, 'Importar do PNCP'),
          el('button', { type: 'button', class: 'btn btn-primario', onclick: () => form() }, '+ Novo contrato')) : null),
      P.estado.alcanceUnidade && perm.editar ? el('p', { class: 'msg msg-info' }, 'Contratos são do órgão todo: só quem tem acesso ao órgão inteiro altera.') : null,
      // Abas iguais às do site: Contratos e aditivos (por ano) e Fiscais de contratos.
      el('div', { class: 'abas', role: 'tablist', 'aria-label': 'Contratos' }, [['contratos', 'Contratos e aditivos'], ['fiscais', 'Fiscais de contratos']].map(([id, rot]) =>
        el('button', { type: 'button', role: 'tab', class: 'aba', 'aria-selected': abaTopo === id ? 'true' : 'false',
          onclick: () => { if (abaTopo === id) return; abaTopo = id; desenhar(); } }, rot))),
      abaTopo === 'fiscais' ? (() => { const cx = el('div', { class: 'painel-guia' }); telaFiscais(cx); return cx; })()
        : el('div', { class: 'painel-guia' },
          anos.length ? el('div', { class: 'abas abas-internas', role: 'tablist', 'aria-label': 'Ano' }, anos.map((x) => { const b = botaoAno(x); b.classList.add('aba-p'); return b; })) : null,
          anos.length ? el('div', { class: 'painel-guia painel-guia-interno' }, el('div', { class: 'filtros' }, fBusca, fVig, fOri, fSit), lista)
            : el('p', { class: 'vazio' }, 'Nenhum contrato cadastrado. Use "+ Novo contrato" ou "Importar do PNCP".'))
    ].filter(Boolean));
    if (anos.length && abaTopo === 'contratos') desenharLista();
  }

  async function recarregarLista() { try { await carregar(true); desenhar(); } catch (e) { mostrarErro(e); } }
  async function recarregar() { try { await carregarAnos(); await carregar(true); desenhar(); } catch (e) { mostrarErro(e); } }

  P.telas.contratos = async function (c, mod, p) {
    perm = p; conteiner = c;
    c.replaceChildren(el('h1', null, 'Contratos'), el('p', { class: 'sub' }, 'Carregando…'));
    try {
      const o = await sb.from('orgaos').select('cnpj, configuracoes').eq('id', P.estado.orgao.id).maybeSingle();
      if (o.data) { P.estado.orgao.cnpj = o.data.cnpj; P.estado.orgao.configuracoes = o.data.configuracoes || {}; }
      await carregarAnos(); await carregar(true); desenhar();
    } catch (e) { c.querySelector('.sub').textContent = P.erroGravacao(e); }
  };
})();
