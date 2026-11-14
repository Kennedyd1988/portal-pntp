// =====================================================================
// Módulo "Obras" (Lote 9 · Fase 2) — PNTP 10.1 a 10.4
// Cada obra: dados, andamento (situação, % concluído, etapa, datas),
// planilha contratada × executada (10.2/10.3), medições com valor pago
// e paralisações (10.4: motivo, responsável e previsão de reinício).
// A situação "paralisada" é controlada pelo banco a partir das
// paralisações: abrir uma paralisação paralisa; informar o reinício libera.
// Telas no padrão de abas do projeto: ano → lista; janela da obra em abas.
// =====================================================================
(function () {
  'use strict';
  const P = window.PNTP;
  const { sb, el, toast, ocupado, erroCampo, campo } = P;
  const LOTE = 50;
  const LIMITE_MB = 50;

  const SITUACOES = { nao_iniciada: 'Não iniciada', em_andamento: 'Em andamento', paralisada: 'Paralisada', concluida: 'Concluída', cancelada: 'Cancelada' };
  const COR = { nao_iniciada: 'rascunho', em_andamento: 'agendado', paralisada: 'desativado', concluida: 'publicado', cancelada: 'inativo' };

  let perm = {}, conteiner = null;
  let ano = null, anos = [], itens = [], fim = false, total = 0;
  let abaTopo = 'obras';   // 'obras' (por ano de início) ou 'paralisadas' (todas, como a aba do site)
  const filtros = { busca: '', obra: '', situacao: '' };

  const podeGravar = () => perm.editar && !P.estado.alcanceUnidade;
  const moeda = (v) => v === null || v === undefined || v === '' ? '' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const numBR = (v, casas) => v === null || v === undefined ? '' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: casas === undefined ? 4 : casas });
  const hoje = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const docFormatado = (d) => !d ? '' : d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  const etiquetaObra = (s) => el('span', { class: 'etiqueta etiqueta-' + (COR[s] || 'rascunho') }, SITUACOES[s] || s);
  // Número digitado no padrão brasileiro (1.234,56) ou com ponto decimal (1234.56).
  function lerNumero(t) {
    let s = String(t || '').trim().replace(/\s|R\$/g, '');
    if (!s) return null;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }
  const mostrarErro = (e) => {
    const t = (e && e.message) || '';
    if (/obras_concluida/.test(t)) return toast('Obra concluída precisa da data de conclusão.', true);
    if (/obras_previsao|obras_conclusao/.test(t)) return toast('As datas de previsão e de conclusão não podem ser antes do início.', true);
    if (/obras_medicoes_uk/.test(t)) return toast('Já existe uma medição com esse número.', true);
    if (/obras_paralisacao_aberta_uk/.test(t)) return toast('Esta obra já tem uma paralisação aberta. Informe o reinício dela antes de abrir outra.', true);
    if (/obras_paralisacoes_datas/.test(t)) return toast('Previsão de reinício e reinício não podem ser antes do início da paralisação.', true);
    if (/obras_contrato_id_fkey/.test(t)) return toast('Contrato ligado a uma obra não pode ser excluído.', true);
    if (/Para marcar a obra|paralisação aberta|Esta obra está publicada|não pertence/.test(t)) return toast(t.replace(/^.*?(Para marcar|A obra tem|Esta obra|O registro)/, '$1'), true);
    toast(P.erroGravacao(e), true);
  };

  // ---------------------------------------------------------------------
  // Dados
  // ---------------------------------------------------------------------
  function consulta(sel, opcoes) {
    let q = sb.from('obras').select(sel, opcoes).eq('orgao_id', P.estado.orgao.id);
    if (abaTopo === 'paralisadas') q = q.eq('situacao_obra', 'paralisada');
    else if (ano) q = q.eq('ano', ano);
    if (filtros.busca) q = q.ilike('busca', '%' + P.normalizar(filtros.busca).replace(/[%_]/g, '') + '%');
    if (filtros.obra) q = q.eq('situacao_obra', filtros.obra);
    if (filtros.situacao) q = q.eq('situacao', filtros.situacao);
    return q;
  }
  let decl = null;   // declarações de que não há dados (script 23)
  async function carregarAnos() {
    const { data, error } = await sb.rpc('obras_anos', { p_orgao: P.estado.orgao.id });
    if (error) throw error;
    decl = await P.declaracoesAnuais('obras');
    anos = decl.anos(data || []);
    if (!anos.some((x) => x.ano === ano)) ano = anos.length ? anos[0].ano : null;
  }
  async function carregar(reiniciar) {
    if (abaTopo !== 'paralisadas' && (!ano || !Number((anos.find((x) => x.ano === ano) || {}).total))) { itens = []; fim = true; total = 0; return; }
    const ultimo = reiniciar ? null : itens[itens.length - 1];
    const [pag, t] = await Promise.all([P.paginar(consulta, 'atualizado_em', ultimo, LOTE), reiniciar ? P.contar(consulta) : Promise.resolve(total)]);
    itens = reiniciar ? pag.linhas : itens.concat(pag.linhas);
    fim = pag.fim; total = t;
  }

  // Escolha do contrato de origem (busca, sem datalist). Ao escolher, sugere contratada e valor.
  function escolhaContrato(atualId, atualRotulo, aoEscolher) {
    let escolhido = atualId || null;
    const atual = el('div', { class: 'escolha-atual' });
    const busca = el('input', { type: 'search', id: 'ob-ctr', placeholder: 'Digite o número, o objeto ou a contratada' });
    const lista = el('div', { class: 'escolha-noticias' });
    const mostrarAtual = (txt) => atual.replaceChildren(escolhido
      ? el('span', null, 'Vinculada a: ', el('strong', null, txt || 'contrato selecionado'), ' ',
        el('button', { type: 'button', class: 'link', onclick: () => { escolhido = null; mostrarAtual(); } }, 'remover vínculo'))
      : el('span', { class: 'ajuda' }, 'Sem contrato vinculado (opcional). Com o vínculo, o site mostra o contrato, os aditivos e os fiscais.'));
    mostrarAtual(atualRotulo);
    let espera;
    busca.addEventListener('input', () => {
      clearTimeout(espera);
      espera = setTimeout(async () => {
        const t = busca.value.trim();
        if (t.length < 2) { lista.replaceChildren(); return; }
        const { data } = await sb.from('contratos').select('id, numero, objeto, contratado_nome, contratado_doc, valor_atual, vigencia_inicio').eq('orgao_id', P.estado.orgao.id)
          .ilike('busca', '%' + P.normalizar(t).replace(/[%_]/g, '') + '%').order('data_assinatura', { ascending: false }).limit(8);
        lista.replaceChildren(...(data || []).map((c) => el('button', { type: 'button', class: 'escolha-item', onclick: () => {
          escolhido = c.id; mostrarAtual((c.numero || 's/nº') + ' — ' + c.contratado_nome); lista.replaceChildren(); busca.value = '';
          aoEscolher(c);
        } }, el('span', { class: 'escolha-textos' }, el('strong', null, 'Contrato ' + (c.numero || 's/nº') + ' · ' + c.contratado_nome), el('span', { class: 'ajuda' }, c.objeto.slice(0, 120))))),
        (data || []).length ? '' : el('p', { class: 'ajuda' }, 'Nenhum contrato encontrado.'));
      }, 350);
    });
    return { bloco: el('div', null, busca, lista, atual), valor: () => escolhido };
  }

  // ---------------------------------------------------------------------
  // Janela da obra
  // ---------------------------------------------------------------------
  async function form(o, abaInicial) {
    o = o || {};
    const editando = !!o.id;
    const publicado = o.situacao === 'publicado';
    const travado = publicado && !perm.publicar;
    let ctrRotulo = null;
    if (o.contrato_id) {
      const { data } = await sb.from('contratos').select('numero, contratado_nome').eq('id', o.contrato_id).maybeSingle();
      if (data) ctrRotulo = (data.numero || 's/nº') + ' — ' + data.contratado_nome;
    }
    const f = {
      titulo: el('input', { type: 'text', maxlength: 300, value: o.titulo || '', placeholder: 'Ex.: Pavimentação em paralelepípedo da Rua São José' }),
      descricao: el('textarea', { rows: 3, maxlength: 4000 }),
      local: el('input', { type: 'text', maxlength: 300, value: o.local || '', placeholder: 'Endereço, bairro ou comunidade' }),
      unidade: el('input', { type: 'text', maxlength: 150, value: o.unidade_nome || '', placeholder: 'Secretaria responsável' }),
      contratada: el('input', { type: 'text', maxlength: 200, value: o.contratada_nome || '' }),
      doc: P.mascaraDoc(el('input', { type: 'text', maxlength: 18, value: docFormatado(o.contratada_doc), placeholder: 'CNPJ ou CPF' })),
      fonte: el('input', { type: 'text', maxlength: 200, value: o.fonte_recurso || '', placeholder: 'Ex.: Convênio 912345/2025 (União) + recursos próprios' }),
      valor: el('input', { type: 'number', min: 0, step: '0.01', value: o.valor_contratado ?? '' }),
      link: el('input', { type: 'url', value: o.link_externo || '', placeholder: 'https://… (ex.: Obrasgov.br)' }),
      sit: el('select', null, Object.entries(SITUACOES).filter(([k]) => k !== 'paralisada')
        .map(([k, v]) => el('option', { value: k, selected: (o.situacao_obra || 'nao_iniciada') === k }, v))),
      perc: el('input', { type: 'number', min: 0, max: 100, step: '0.01', value: o.percentual ?? 0 }),
      etapa: el('input', { type: 'text', maxlength: 300, value: o.etapa_atual || '', placeholder: 'Ex.: Assentamento do calçamento (2ª etapa de 3)' }),
      inicio: el('input', { type: 'date', value: o.data_inicio || '' }),
      previsao: el('input', { type: 'date', value: o.previsao_conclusao || '' }),
      conclusao: el('input', { type: 'date', value: o.data_conclusao || '' })
    };
    f.descricao.value = o.descricao || '';
    const ctr = escolhaContrato(o.contrato_id, ctrRotulo, (c) => {
      if (!f.contratada.value.trim()) f.contratada.value = c.contratado_nome;
      if (!f.doc.value.trim()) f.doc.value = docFormatado(c.contratado_doc);
      if (f.valor.value === '' && c.valor_atual != null) f.valor.value = c.valor_atual;
      if (!f.inicio.value && c.vigencia_inicio) f.inicio.value = c.vigencia_inicio;
    });
    // "Paralisada" não se escolhe aqui: vem da aba Paralisações (o 10.4 exige motivo e responsável).
    const avisoParalisada = el('p', { class: 'msg msg-erro', hidden: true }, 'Obra paralisada. Para retomar, informe a data de reinício na aba "Paralisações".');
    let situacaoAtual = o.situacao_obra || 'nao_iniciada';
    const mostrarSituacao = (s) => {
      situacaoAtual = s;
      const par = s === 'paralisada';
      avisoParalisada.hidden = !par; f.sit.disabled = par || travado;
      if (!par) f.sit.value = s;
    };
    const percPlanilha = el('span', { class: 'ajuda' });
    const det = editando ? detalhes(o, {
      situacao: (s) => mostrarSituacao(s),
      percentual: (p) => {
        percPlanilha.replaceChildren(p === null ? '' : ['Pela planilha executada: ' + numBR(p, 2) + '%. ',
          travado ? null : el('button', { type: 'button', class: 'link', onclick: () => { f.perc.value = p.toFixed(2); } }, 'usar este valor')]);
      }
    }) : null;
    const salveAntes = 'Salve a obra primeiro: a aba abre logo em seguida.';
    const corpo = el('form', { class: 'form-dialogo', novalidate: true },
      travado ? el('p', { class: 'msg msg-info' }, 'Esta obra está publicada. Só quem tem permissão de publicar pode alterá-la.') : null,
      P.abas([
        ['dados', 'Dados da obra', [
          campo('ob-tit', 'Obra', f.titulo, 'Nome pelo qual a obra é conhecida.', true),
          campo('ob-desc', 'Descrição', f.descricao),
          el('div', { class: 'grade-campos' }, campo('ob-loc', 'Local', f.local), campo('ob-un', 'Unidade responsável', f.unidade)),
          el('div', { class: 'campo' }, el('label', { for: 'ob-ctr' }, 'Contrato'), ctr.bloco),
          el('div', { class: 'grade-campos' }, campo('ob-ctd', 'Empresa contratada', f.contratada), campo('ob-doc', 'CNPJ ou CPF', f.doc, 'No site, CPF aparece mascarado (LGPD).')),
          el('div', { class: 'grade-campos' }, campo('ob-val', 'Valor contratado (R$)', f.valor), campo('ob-fonte', 'Fonte do recurso', f.fonte)),
          campo('ob-link', 'Link externo (opcional)', f.link)]],
        ['andamento', 'Andamento', [
          avisoParalisada,
          el('div', { class: 'grade-campos' }, campo('ob-sit', 'Situação', f.sit, null, true), campo('ob-perc', 'Percentual concluído (%)', f.perc, null, true)),
          percPlanilha,
          campo('ob-etapa', 'Etapa atual', f.etapa, 'O PNTP 10.1 pede as etapas: as medições (aba "Medições") mostram cada etapa medida.'),
          el('div', { class: 'grade-campos' }, campo('ob-ini', 'Data de início', f.inicio), campo('ob-prev', 'Previsão de conclusão', f.previsao), campo('ob-conc', 'Data de conclusão', f.conclusao, 'Obrigatória quando a obra está concluída.'))]],
        det ? ['planilha', 'Planilha (quantitativos)', det.planilha] : ['planilha', 'Planilha (quantitativos)', null, salveAntes],
        det ? ['medicoes', 'Medições e pagamentos', det.medicoes] : ['medicoes', 'Medições e pagamentos', null, salveAntes],
        det ? ['paralisacoes', 'Paralisações', det.paralisacoes] : ['paralisacoes', 'Paralisações', null, salveAntes]
      ], abaInicial));
    mostrarSituacao(situacaoAtual);
    if (travado) for (const i of corpo.querySelectorAll('input, select, textarea, button.link')) i.disabled = true;

    const acoes = [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => dlg.close() }, travado ? 'Fechar' : 'Cancelar')];
    const btnR = el('button', { type: 'button', class: 'btn btn-claro' }, publicado ? 'Tirar do ar (rascunho)' : 'Salvar rascunho');
    const btnP = el('button', { type: 'button', class: 'btn btn-primario' }, publicado ? 'Salvar' : 'Publicar');
    if (!travado) { if (!publicado || perm.publicar) acoes.push(btnR); if (perm.publicar) acoes.push(btnP); }
    const dlg = P.abrirDialogo(editando ? 'Editar obra' : 'Nova obra', corpo, acoes);
    dlg.classList.add('dialogo-largo');
    dlg.addEventListener('close', () => { if (det && det.mudou()) recarregar(); });

    async function salvar(situacao, btn) {
      if (!erroCampo('ob-tit', f.titulo.value.trim().length >= 5 ? '' : 'Informe o nome da obra (pelo menos 5 letras).')) return;
      const d = f.doc.value.replace(/\D/g, '');
      if (!erroCampo('ob-doc', P.erroDoc(d))) return;
      const link = f.link.value.trim();
      if (!erroCampo('ob-link', link && !P.urlValida(link) ? 'Endereço completo, começando com https://' : '')) return;
      const perc = Number(f.perc.value);
      if (!erroCampo('ob-perc', f.perc.value !== '' && perc >= 0 && perc <= 100 ? '' : 'Informe de 0 a 100.')) return;
      const sit = f.sit.value;
      if (!f.sit.disabled && sit === 'concluida' && !erroCampo('ob-conc', f.conclusao.value ? '' : 'Informe a data de conclusão.')) return;
      if (situacao === 'publicado' && !['nao_iniciada', 'cancelada'].includes(sit) && !erroCampo('ob-ini', f.inicio.value ? '' : 'Informe a data de início (PNTP 10.1).')) return;
      if (!erroCampo('ob-prev', !f.inicio.value || !f.previsao.value || f.previsao.value >= f.inicio.value ? '' : 'A previsão não pode ser antes do início.')) return;
      if (!erroCampo('ob-conc', !f.inicio.value || !f.conclusao.value || f.conclusao.value >= f.inicio.value ? '' : 'A conclusão não pode ser antes do início.')) return;
      const dados = {
        titulo: f.titulo.value.trim(), descricao: f.descricao.value.trim() || null, local: f.local.value.trim() || null, unidade_nome: f.unidade.value.trim() || null,
        contrato_id: ctr.valor(), contratada_nome: f.contratada.value.trim() || null, contratada_doc: d || null, fonte_recurso: f.fonte.value.trim() || null,
        valor_contratado: f.valor.value === '' ? null : Number(f.valor.value), link_externo: link || null,
        percentual: perc, etapa_atual: f.etapa.value.trim() || null,
        data_inicio: f.inicio.value || null, previsao_conclusao: f.previsao.value || null, data_conclusao: f.conclusao.value || null, situacao
      };
      ocupado(btn, 'Salvando…');
      try {
        // A situação "paralisada" é do banco: confere a atual antes de gravar a escolhida.
        if (editando) {
          const { data: atual } = await sb.from('obras').select('situacao_obra').eq('id', o.id).maybeSingle();
          if (atual && atual.situacao_obra !== 'paralisada' && !f.sit.disabled) dados.situacao_obra = sit;
        } else dados.situacao_obra = sit;
        const id = await P.gravarRegistro('obras', dados, o.id);
        dlg.close();
        toast(situacao === 'publicado' ? 'Publicado.' : 'Rascunho salvo.');
        await recarregar();
        // Obra nova: reabre a janela na aba Planilha (o PNTP 10.2 é obrigatório).
        if (!editando) form(Object.assign({}, o, dados, { id }), 'planilha');
      } catch (e) { mostrarErro(e); }
      finally { ocupado(btn); }
    }
    btnR.addEventListener('click', () => salvar('rascunho', btnR));
    btnP.addEventListener('click', () => salvar('publicado', btnP));
  }

  // ---------------------------------------------------------------------
  // Abas Planilha | Medições | Paralisações (montadas na 1ª abertura)
  // ---------------------------------------------------------------------
  function detalhes(o, avisar) {
    const travado = o.situacao === 'publicado' && !perm.publicar;
    const pode = podeGravar() && !travado;
    const areaI = el('div'), areaM = el('div'), areaP = el('div');
    let mudou = false;
    const org = P.estado.orgao.id;
    const aviso = () => travado ? el('p', { class: 'msg msg-info' }, 'Obra publicada: só quem tem permissão de publicar altera planilha, medições e paralisações.') : null;
    const excluirLinha = async (tabela, id, msg, depois) => {
      if (!await P.confirmar('Excluir', msg, 'Excluir', true)) return;
      const { data, error } = await sb.from(tabela).delete().eq('id', id).select('id');
      if (error) return mostrarErro(error);
      if (!data || !data.length) return toast('Seu perfil não pode excluir.', true);
      mudou = true; toast('Excluído.'); depois();
    };

    // ----- Planilha: contratado (10.2) × executado (10.3) -----
    async function planilha() {
      const { data, error } = await sb.from('obras_itens').select('*').eq('obra_id', o.id).order('ordem').order('id').limit(2000);
      if (error) throw error;
      const lista = data || [];
      const tc = lista.reduce((s, i) => s + Number(i.total_contratado || 0), 0);
      const te = lista.reduce((s, i) => s + Number(i.total_executado || 0), 0);
      avisar.percentual(tc > 0 ? Math.min(100, te / tc * 100) : null);
      const execs = new Map();
      const linhas = lista.map((i) => {
        const qe = el('input', { type: 'text', inputmode: 'decimal', value: numBR(i.quantidade_executada), 'aria-label': 'Quantidade executada de ' + i.descricao, class: 'campo-num', disabled: !pode });
        const pp = el('input', { type: 'text', inputmode: 'decimal', value: i.preco_praticado == null ? '' : numBR(i.preco_praticado, 2), placeholder: numBR(i.preco_unitario, 2),
          'aria-label': 'Preço praticado de ' + i.descricao, class: 'campo-num', disabled: !pode });
        execs.set(i.id, { i, qe, pp });
        return el('tr', null,
          el('td', null, i.codigo || ''), el('td', { class: 'quebra' }, i.descricao), el('td', null, i.unidade || ''),
          el('td', { class: 'num' }, numBR(i.quantidade)), el('td', { class: 'num' }, moeda(i.preco_unitario)), el('td', { class: 'num' }, moeda(i.total_contratado)),
          el('td', null, qe), el('td', null, pp), el('td', { class: 'num' }, moeda(i.total_executado)),
          el('td', { class: 'acoes' }, pode ? el('button', { type: 'button', class: 'btn btn-claro btn-p btn-texto-perigo', onclick: () => excluirLinha('obras_itens', i.id, 'Excluir o item "' + i.descricao.slice(0, 60) + '"?', () => planilha().catch(mostrarErro)) }, 'Excluir') : null));
      });
      const btnExec = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar executado');
      btnExec.addEventListener('click', async () => {
        const mudados = [];
        for (const [id, { i, qe, pp }] of execs) {
          const q = lerNumero(qe.value), p = lerNumero(pp.value);
          if (Number.isNaN(q) || (q !== null && q < 0) || Number.isNaN(p) || (p !== null && p < 0)) { toast('Valor inválido no item "' + i.descricao.slice(0, 40) + '".', true); qe.focus(); return; }
          if ((q || 0) !== Number(i.quantidade_executada) || p !== (i.preco_praticado == null ? null : Number(i.preco_praticado))) mudados.push({ id, quantidade_executada: q || 0, preco_praticado: p });
        }
        if (!mudados.length) return toast('Nada mudou.');
        ocupado(btnExec, 'Salvando…');
        try {
          for (const m of mudados) {
            const { error: e } = await sb.from('obras_itens').update({ quantidade_executada: m.quantidade_executada, preco_praticado: m.preco_praticado }).eq('id', m.id);
            if (e) throw e;
          }
          mudou = true; toast(mudados.length + ' item(ns) atualizado(s).'); planilha().catch(mostrarErro);
        } catch (e) { mostrarErro(e); ocupado(btnExec); }
      });

      // Incluir: um item, ou vários colados de uma planilha (Excel/LibreOffice).
      const n = {
        codigo: el('input', { type: 'text', maxlength: 40, placeholder: 'Ex.: 1.1 ou SINAPI 94273' }),
        desc: el('input', { type: 'text', maxlength: 1000 }),
        un: el('input', { type: 'text', maxlength: 20, placeholder: 'm², m³, un…' }),
        qtd: el('input', { type: 'text', inputmode: 'decimal' }),
        preco: el('input', { type: 'text', inputmode: 'decimal' }),
        colar: el('textarea', { rows: 6, placeholder: 'Copie as linhas da planilha e cole aqui. Colunas, nesta ordem:\nitem/código · descrição · unidade · quantidade · preço unitário · (opcional) quantidade executada' })
      };
      const btnUm = el('button', { type: 'button', class: 'btn btn-claro' }, 'Adicionar item');
      btnUm.addEventListener('click', async () => {
        if (!erroCampo('oi-desc', n.desc.value.trim().length >= 2 ? '' : 'Descreva o item.')) return;
        const q = lerNumero(n.qtd.value), p = lerNumero(n.preco.value);
        if (!erroCampo('oi-qtd', q !== null && !Number.isNaN(q) && q >= 0 ? '' : 'Quantidade inválida.')) return;
        if (!erroCampo('oi-preco', p !== null && !Number.isNaN(p) && p >= 0 ? '' : 'Preço inválido.')) return;
        ocupado(btnUm, 'Salvando…');
        try {
          const { error: e } = await sb.from('obras_itens').insert({ obra_id: o.id, orgao_id: org, ordem: (lista.length + 1) * 10, codigo: n.codigo.value.trim() || null,
            descricao: n.desc.value.trim(), unidade: n.un.value.trim() || null, quantidade: q, preco_unitario: p });
          if (e) throw e;
          mudou = true; toast('Item incluído.'); planilha().catch(mostrarErro);
        } catch (e) { mostrarErro(e); ocupado(btnUm); }
      });
      const btnColar = el('button', { type: 'button', class: 'btn btn-claro' }, 'Incluir linhas coladas');
      btnColar.addEventListener('click', async () => {
        const novas = [], erros = [];
        n.colar.value.replace(/\r/g, '').split('\n').forEach((l, k) => {
          if (!l.trim()) return;
          const c = l.split(l.includes('\t') ? '\t' : ';').map((x) => x.trim());
          const q = lerNumero(c[3]), p = lerNumero(c[4]), qe = c[5] !== undefined && c[5] !== '' ? lerNumero(c[5]) : 0;
                    const vazioOuTexto = (x) => x === null || Number.isNaN(x);
          if (vazioOuTexto(q) && vazioOuTexto(p)) return;   // cabeçalho ou título de grupo
          if (!c[1] || c[1].length < 2 || [q, p, qe].some((x) => x === null || Number.isNaN(x) || x < 0)) { erros.push(k + 1); return; }
          novas.push({ obra_id: o.id, orgao_id: org, ordem: (lista.length + novas.length + 1) * 10, codigo: (c[0] || '').slice(0, 40) || null, descricao: c[1].slice(0, 1000),
            unidade: (c[2] || '').slice(0, 20) || null, quantidade: q, preco_unitario: p, quantidade_executada: qe });
        });
        if (erros.length) { erroCampo('oi-colar', 'Confira a(s) linha(s) ' + erros.slice(0, 10).join(', ') + ': faltam descrição, quantidade ou preço.'); return; }
        if (!novas.length) { erroCampo('oi-colar', 'Cole pelo menos uma linha com quantidade e preço.'); return; }
        erroCampo('oi-colar', '');
        ocupado(btnColar, 'Incluindo…');
        try {
          for (let k = 0; k < novas.length; k += 200) {
            const { error: e } = await sb.from('obras_itens').insert(novas.slice(k, k + 200));
            if (e) throw e;
          }
          mudou = true; toast(novas.length + ' item(ns) incluído(s).'); planilha().catch(mostrarErro);
        } catch (e) { mostrarErro(e); ocupado(btnColar); }
      });

      areaI.replaceChildren(
        el('p', { class: 'ajuda' }, 'Quantitativos e preços contratados (PNTP 10.2) e o que já foi executado, com o preço efetivamente praticado (10.3). Preço praticado em branco = o contratado.'),
        lista.length ? el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela tabela-planilha' },
          el('thead', null, el('tr', null, ['Item', 'Descrição', 'Un.', 'Qtd. contratada', 'Preço unit.', 'Total contratado', 'Qtd. executada', 'Preço praticado', 'Total executado'].map((t) => el('th', { scope: 'col' }, t)),
            el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Ações')))),
          el('tbody', null, linhas),
          el('tfoot', null, el('tr', null, el('th', { scope: 'row', colspan: 5 }, 'Totais'), el('td', { class: 'num' }, el('strong', null, moeda(tc))), el('td', { colspan: 2 }),
            el('td', { class: 'num' }, el('strong', null, moeda(te))), el('td')))))
          : el('p', { class: 'vazio' }, 'Nenhum item na planilha. O PNTP 10.2 (obrigatório) pede os quantitativos e os preços unitários e totais contratados.'),
        pode && lista.length ? el('div', { style: 'margin:10px 0 16px' }, btnExec) : null,
        pode ? el('fieldset', { class: 'opcoes' }, el('legend', null, 'Colar da planilha orçamentária'), campo('oi-colar', 'Linhas copiadas', n.colar,
          'Funciona com Excel, LibreOffice e Google Planilhas. Linhas de título (sem quantidade e preço) são ignoradas.'), el('div', { class: 'mt-1' }, btnColar)) : null,
        pode ? el('fieldset', { class: 'opcoes' }, el('legend', null, 'Ou adicionar um item'),
          el('div', { class: 'grade-campos' }, campo('oi-cod', 'Item / código', n.codigo), campo('oi-un', 'Unidade', n.un)),
          campo('oi-desc', 'Descrição', n.desc, null, true),
          el('div', { class: 'grade-campos' }, campo('oi-qtd', 'Quantidade contratada', n.qtd, null, true), campo('oi-preco', 'Preço unitário (R$)', n.preco, null, true)),
          el('div', { class: 'mt-1' }, btnUm)) : null);
    }

    // ----- Medições: etapas medidas e valores pagos -----
    async function medicoes() {
      const { data, error } = await sb.from('obras_medicoes').select('*').eq('obra_id', o.id).order('numero').limit(500);
      if (error) throw error;
      const lista = data || [];
      const f = {
        numero: el('input', { type: 'number', min: 1, max: 999, value: (lista.length ? Math.max(...lista.map((m) => m.numero)) : 0) + 1 }),
        desc: el('input', { type: 'text', maxlength: 500, placeholder: 'Ex.: Terraplenagem e meio-fio (trecho 1)' }),
        ini: el('input', { type: 'date' }), fimP: el('input', { type: 'date' }),
        medido: el('input', { type: 'number', min: 0, step: '0.01' }), pago: el('input', { type: 'number', min: 0, step: '0.01' }),
        dataPag: el('input', { type: 'date' }), perc: el('input', { type: 'number', min: 0, max: 100, step: '0.01' }),
        pdf: el('input', { type: 'file', accept: 'application/pdf' }), link: el('input', { type: 'url', placeholder: 'https://…' })
      };
      const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Adicionar medição');
      btn.addEventListener('click', async () => {
        const num = parseInt(f.numero.value, 10);
        if (!erroCampo('om-num', num >= 1 && num <= 999 ? '' : 'Número de 1 a 999.')) return;
        if (!erroCampo('om-fim', !f.ini.value || !f.fimP.value || f.fimP.value >= f.ini.value ? '' : 'O fim do período não pode ser antes do início.')) return;
        if (!erroCampo('om-perc', f.perc.value === '' || (Number(f.perc.value) >= 0 && Number(f.perc.value) <= 100) ? '' : 'De 0 a 100.')) return;
        const arq = f.pdf.files[0], link = f.link.value.trim();
        if (arq && !erroCampo('om-pdf', arq.type !== 'application/pdf' ? 'Envie um PDF.' : arq.size > LIMITE_MB * 1048576 ? 'Passa de ' + LIMITE_MB + ' MB.' : '')) return;
        if (!erroCampo('om-link', link && !P.urlValida(link) ? 'Endereço completo (https://…).' : '')) return;
        ocupado(btn, 'Salvando…');
        try {
          const url = arq ? await P.enviarArquivo('obras', arq, 'pdf', 'application/pdf') : null;
          const v = (x) => x.value === '' ? null : Number(x.value);
          const { error: e } = await sb.from('obras_medicoes').insert({ obra_id: o.id, orgao_id: org, numero: num, descricao: f.desc.value.trim() || null,
            periodo_inicio: f.ini.value || null, periodo_fim: f.fimP.value || null, valor_medido: v(f.medido), valor_pago: v(f.pago), data_pagamento: f.dataPag.value || null,
            percentual_acumulado: v(f.perc), arquivo_url: url, link_externo: link || null });
          if (e) { if (url) P.apagarArquivo(url); throw e; }
          mudou = true; toast('Medição registrada.'); medicoes().catch(mostrarErro);
        } catch (e) { mostrarErro(e); ocupado(btn); }
      });
      const soma = (k) => lista.reduce((s, m) => s + Number(m[k] || 0), 0);
      areaM.replaceChildren(
        el('p', { class: 'ajuda' }, 'Cada medição é uma etapa executada, com o valor medido e o valor efetivamente pago (PNTP 10.1 e 10.3).'),
        lista.length ? el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela' },
          el('thead', null, el('tr', null, ['Medição', 'Período', 'Valor medido', 'Valor pago', '% acumulado', 'Arquivo'].map((t) => el('th', { scope: 'col' }, t)), el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Ações')))),
          el('tbody', null, lista.map((m) => el('tr', null,
            el('td', { class: 'quebra' }, el('strong', null, m.numero + 'ª medição'), m.descricao ? el('span', { class: 'sub-linha' }, m.descricao) : null),
            el('td', { class: 'num' }, m.periodo_inicio || m.periodo_fim ? (P.dataBR(m.periodo_inicio) || '…') + ' a ' + (P.dataBR(m.periodo_fim) || '…') : ''),
            el('td', { class: 'num' }, moeda(m.valor_medido)),
            el('td', { class: 'num' }, moeda(m.valor_pago), m.data_pagamento ? el('span', { class: 'sub-linha' }, 'em ' + P.dataBR(m.data_pagamento)) : null),
            el('td', { class: 'num' }, m.percentual_acumulado == null ? '' : numBR(m.percentual_acumulado, 2) + '%'),
            el('td', null, m.arquivo_url || m.link_externo ? el('a', { href: m.arquivo_url || m.link_externo, target: '_blank', rel: 'noopener' }, m.arquivo_url ? 'PDF' : 'Link') : el('span', { class: 'falta' }, 'Sem arquivo')),
            el('td', { class: 'acoes' }, pode ? el('button', { type: 'button', class: 'btn btn-claro btn-p btn-texto-perigo', onclick: () => excluirLinha('obras_medicoes', m.id, 'Excluir a ' + m.numero + 'ª medição?', () => { if (m.arquivo_url) P.apagarArquivo(m.arquivo_url); medicoes().catch(mostrarErro); }) }, 'Excluir') : null)))),
          el('tfoot', null, el('tr', null, el('th', { scope: 'row', colspan: 2 }, 'Totais'), el('td', { class: 'num' }, el('strong', null, moeda(soma('valor_medido')))),
            el('td', { class: 'num' }, el('strong', null, moeda(soma('valor_pago')))), el('td', { colspan: 3 })))))
          : el('p', { class: 'vazio' }, 'Nenhuma medição registrada.'),
        pode ? el('fieldset', { class: 'opcoes' }, el('legend', null, 'Nova medição'),
          el('div', { class: 'grade-campos' }, campo('om-num', 'Nº da medição', f.numero, null, true), campo('om-ini', 'Período: de', f.ini), campo('om-fim', 'até', f.fimP)),
          campo('om-desc', 'Etapa / serviços medidos', f.desc),
          el('div', { class: 'grade-campos' }, campo('om-med', 'Valor medido (R$)', f.medido), campo('om-pago', 'Valor pago (R$)', f.pago), campo('om-dpag', 'Data do pagamento', f.dataPag)),
          el('div', { class: 'grade-campos' }, campo('om-perc', '% acumulado da obra', f.perc), campo('om-pdf', 'PDF do boletim de medição', f.pdf), campo('om-link', 'Ou link', f.link)),
          el('div', { class: 'mt-1' }, btn)) : null);
    }

    // ----- Paralisações (10.4) -----
    async function paralisacoes() {
      const { data, error } = await sb.from('obras_paralisacoes').select('*').eq('obra_id', o.id).order('inicio', { ascending: false }).limit(200);
      if (error) throw error;
      const lista = data || [];
      const aberta = lista.find((p) => !p.reinicio);
      avisar.situacao(aberta ? 'paralisada' : (await sb.from('obras').select('situacao_obra').eq('id', o.id).maybeSingle()).data?.situacao_obra || 'em_andamento');
      const f = {
        inicio: el('input', { type: 'date', value: hoje() }),
        motivo: el('textarea', { rows: 3, maxlength: 2000, placeholder: 'Ex.: Chuvas intensas impediram a execução da terraplenagem.' }),
        resp: el('input', { type: 'text', maxlength: 300, placeholder: 'Ex.: Contratada (Construtora X Ltda) · Prefeitura (falta de repasse do convênio)' }),
        previsao: el('input', { type: 'date' }),
        ato: el('input', { type: 'text', maxlength: 200, placeholder: 'Ex.: Ordem de paralisação nº 02/2026' }),
        pdf: el('input', { type: 'file', accept: 'application/pdf' })
      };
      const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Registrar paralisação');
      btn.addEventListener('click', async () => {
        if (!erroCampo('op-ini', f.inicio.value ? '' : 'Informe a data.')) return;
        if (!erroCampo('op-mot', f.motivo.value.trim().length >= 5 ? '' : 'Informe o motivo (PNTP 10.4).')) return;
        if (!erroCampo('op-resp', f.resp.value.trim().length >= 2 ? '' : 'Informe o responsável pela inexecução (PNTP 10.4).')) return;
        if (!erroCampo('op-prev', !f.previsao.value || f.previsao.value >= f.inicio.value ? '' : 'A previsão não pode ser antes da paralisação.')) return;
        const arq = f.pdf.files[0];
        if (arq && !erroCampo('op-pdf', arq.type !== 'application/pdf' ? 'Envie um PDF.' : arq.size > LIMITE_MB * 1048576 ? 'Passa de ' + LIMITE_MB + ' MB.' : '')) return;
        ocupado(btn, 'Salvando…');
        try {
          const url = arq ? await P.enviarArquivo('obras', arq, 'pdf', 'application/pdf') : null;
          const { error: e } = await sb.from('obras_paralisacoes').insert({ obra_id: o.id, orgao_id: org, inicio: f.inicio.value, motivo: f.motivo.value.trim(),
            responsavel: f.resp.value.trim(), previsao_reinicio: f.previsao.value || null, ato: f.ato.value.trim() || null, arquivo_url: url });
          if (e) { if (url) P.apagarArquivo(url); throw e; }
          mudou = true; toast('Paralisação registrada: a obra passou a "Paralisada".'); paralisacoes().catch(mostrarErro);
        } catch (e) { mostrarErro(e); ocupado(btn); }
      });
      function blocoReinicio(p) {
        const data = el('input', { type: 'date', value: hoje(), 'aria-label': 'Data de reinício' });
        const prev = el('input', { type: 'date', value: p.previsao_reinicio || '', 'aria-label': 'Nova previsão de reinício' });
        const bR = el('button', { type: 'button', class: 'btn btn-primario btn-p' }, 'Registrar reinício');
        const bP = el('button', { type: 'button', class: 'btn btn-claro btn-p' }, 'Atualizar previsão');
        const gravar = async (b, dados, msg) => {
          ocupado(b, 'Salvando…');
          try {
            const { data: d, error: e } = await sb.from('obras_paralisacoes').update(dados).eq('id', p.id).select('id');
            if (e) throw e;
            if (!d || !d.length) throw P.amigavel('Seu perfil não pode alterar esta paralisação.');
            mudou = true; toast(msg); paralisacoes().catch(mostrarErro);
          } catch (e) { mostrarErro(e); ocupado(b); }
        };
        bR.addEventListener('click', () => { if (!data.value || data.value < p.inicio) return toast('Data de reinício inválida.', true); gravar(bR, { reinicio: data.value }, 'Reinício registrado: a obra voltou para "Em andamento".'); });
        bP.addEventListener('click', () => { if (prev.value && prev.value < p.inicio) return toast('Previsão inválida.', true); gravar(bP, { previsao_reinicio: prev.value || null }, 'Previsão atualizada.'); });
        return el('div', { class: 'grade-campos' },
          el('div', { class: 'campo' }, el('label', null, 'Nova previsão de reinício'), prev, el('div', { class: 'mt-05' }, bP)),
          el('div', { class: 'campo' }, el('label', null, 'Obra retomada em'), data, el('div', { class: 'mt-05' }, bR)));
      }
      areaP.replaceChildren(
        aberta ? el('div', { class: 'msg msg-erro' }, el('strong', null, 'Paralisada desde ' + P.dataBR(aberta.inicio) + '. '),
          'Motivo: ' + aberta.motivo + ' · Responsável: ' + aberta.responsavel + ' · Previsão de reinício: ' + (P.dataBR(aberta.previsao_reinicio) || 'não informada')) : null,
        aberta && pode ? el('fieldset', { class: 'opcoes' }, el('legend', null, 'Paralisação em aberto'), blocoReinicio(aberta)) : null,
        lista.length ? el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela' },
          el('thead', null, el('tr', null, ['Período', 'Motivo', 'Responsável', 'Previsão de reinício', 'Ato'].map((t) => el('th', { scope: 'col' }, t)), el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Ações')))),
          el('tbody', null, lista.map((p) => el('tr', null,
            el('td', { class: 'num' }, P.dataBR(p.inicio) + ' a ' + (p.reinicio ? P.dataBR(p.reinicio) : 'em aberto')),
            el('td', { class: 'quebra' }, p.motivo), el('td', { class: 'quebra' }, p.responsavel), el('td', { class: 'num' }, P.dataBR(p.previsao_reinicio)),
            el('td', null, p.ato || '', p.arquivo_url ? el('a', { href: p.arquivo_url, target: '_blank', rel: 'noopener', class: 'sub-linha' }, 'PDF') : null),
            el('td', { class: 'acoes' }, pode ? el('button', { type: 'button', class: 'btn btn-claro btn-p btn-texto-perigo', onclick: () => excluirLinha('obras_paralisacoes', p.id,
              'Excluir este registro de paralisação? O PNTP pede o histórico; exclua só se foi lançado por engano.', () => { if (p.arquivo_url) P.apagarArquivo(p.arquivo_url); paralisacoes().catch(mostrarErro); }) }, 'Excluir') : null))))))
          : el('p', { class: 'vazio' }, 'Esta obra nunca foi paralisada.'),
        pode && !aberta ? el('fieldset', { class: 'opcoes' }, el('legend', null, 'Registrar paralisação'),
          el('div', { class: 'grade-campos' }, campo('op-ini', 'Paralisada em', f.inicio, null, true), campo('op-prev', 'Previsão de reinício', f.previsao, 'O PNTP 10.4 pede a data prevista.')),
          campo('op-mot', 'Motivo', f.motivo, null, true),
          campo('op-resp', 'Responsável pela inexecução temporária', f.resp, null, true),
          el('div', { class: 'grade-campos' }, campo('op-ato', 'Ato', f.ato), campo('op-pdf', 'PDF do ato', f.pdf)),
          el('div', { class: 'mt-1' }, btn)) : null);
    }

    const montar = (area, fn) => () => { area.replaceChildren(el('p', { class: 'vazio' }, 'Carregando…')); fn().catch(mostrarErro); return [aviso(), area]; };
    // A planilha calcula o % sugerido, mesmo antes de a aba ser aberta.
    planilha().catch(() => {});
    return { planilha: montar(areaI, planilha), medicoes: montar(areaM, medicoes), paralisacoes: montar(areaP, paralisacoes), mudou: () => mudou };
  }

  async function excluir(o) {
    if (!await P.confirmar('Excluir obra', 'Excluir "' + o.titulo + '"? Antes, exclua a planilha, as medições e as paralisações dela. '
      + 'O PNTP pede manter o histórico; para obra que não vai acontecer, prefira a situação "Cancelada".', 'Excluir', true)) return;
    const { data, error } = await sb.from('obras').delete().eq('id', o.id).select('id');
    if (error) return mostrarErro(error);
    if (!data || !data.length) return toast('Seu perfil não pode excluir esta obra.', true);
    toast('Obra excluída.'); await recarregar();
  }

  // ---------------------------------------------------------------------
  // Tela
  // ---------------------------------------------------------------------
  function desenhar() {
    const botaoAno = (x) => el('button', { type: 'button', role: 'tab', class: 'aba aba-p', 'aria-selected': ano === x.ano ? 'true' : 'false',
      onclick: async () => { if (ano === x.ano) return; ano = x.ano; await recarregarLista(); } }, String(x.ano), el('span', { class: 'aba-qtd' }, String(x.total)));
    const fBusca = el('input', { type: 'search', placeholder: 'Obra, local, contratada, fonte', value: filtros.busca, 'aria-label': 'Buscar' });
    const fObra = el('select', { 'aria-label': 'Situação da obra' }, el('option', { value: '' }, 'Situação da obra: todas'),
      Object.entries(SITUACOES).map(([k, v]) => el('option', { value: k, selected: filtros.obra === k }, v)));
    const fSit = el('select', { 'aria-label': 'Publicação' }, el('option', { value: '' }, 'Publicação: todas'),
      el('option', { value: 'publicado', selected: filtros.situacao === 'publicado' }, 'No ar'), el('option', { value: 'rascunho', selected: filtros.situacao === 'rascunho' }, 'Rascunho'));
    const lista = el('div');
    const aplicar = () => {
      Object.assign(filtros, { busca: fBusca.value.trim(), obra: fObra.value, situacao: fSit.value });
      lista.replaceChildren(el('p', { class: 'vazio' }, 'Carregando…'));
      carregar(true).then(desenharLista).catch(mostrarErro);
    };
    [fObra, fSit].forEach((x) => x.addEventListener('change', aplicar));
    let espera; fBusca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(aplicar, 400); });

    function desenharLista() {
      if (!itens.length) { lista.replaceChildren((abaTopo !== 'paralisadas' && decl && decl.aviso(ano)) || el('p', { class: 'vazio' }, Object.values(filtros).some(Boolean) ? 'Nenhuma obra com esses filtros.' : abaTopo === 'paralisadas' ? 'Nenhuma obra paralisada: o site declara que não há obras paralisadas.' : 'Nenhuma obra neste ano.')); return; }
      const btnMais = el('button', { type: 'button', class: 'btn btn-claro' }, 'Carregar mais');
      btnMais.addEventListener('click', async () => { ocupado(btnMais, 'Carregando…'); try { await carregar(false); desenharLista(); } catch (e) { mostrarErro(e); ocupado(btnMais); } });
      lista.replaceChildren(
        el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela' },
          el('thead', null, el('tr', null, ['Obra', 'Situação', '% concluído', 'Início / previsão', 'Valor contratado', 'Publicação'].map((t) => el('th', { scope: 'col' }, t)), el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Ações')))),
          el('tbody', null, itens.map((o) => el('tr', null,
            el('td', { class: 'quebra' }, el('strong', null, o.titulo), el('span', { class: 'sub-linha' }, [o.local, o.contratada_nome].filter(Boolean).join(' · '))),
            el('td', null, etiquetaObra(o.situacao_obra)),
            el('td', { class: 'num' }, numBR(o.percentual, 2) + '%'),
            el('td', { class: 'num' }, (P.dataBR(o.data_inicio) || '—') + ' / ' + (P.dataBR(o.data_conclusao || o.previsao_conclusao) || '—')),
            el('td', { class: 'num' }, moeda(o.valor_contratado)),
            el('td', null, el('span', { class: 'etiqueta etiqueta-' + (o.situacao === 'publicado' ? 'publicado' : 'rascunho') }, o.situacao === 'publicado' ? 'No ar' : 'Rascunho')),
            el('td', { class: 'acoes' },
              el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => form(o, 'planilha') }, 'Planilha'),
              podeGravar() ? el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => form(o) }, o.situacao === 'publicado' && !perm.publicar ? 'Ver' : 'Editar') : null,
              perm.excluir && podeGravar() ? el('button', { type: 'button', class: 'btn btn-claro btn-p btn-texto-perigo', onclick: () => excluir(o) }, 'Excluir') : null)))))),
        el('div', { class: 'rodape-lista' }, el('span', { class: 'ajuda' }, 'Mostrando ' + itens.length + ' de ' + total), fim ? '' : btnMais));
    }

    conteiner.replaceChildren(...[
      el('div', { class: 'cabecalho-modulo' },
        el('div', null, el('h1', null, 'Obras'),
          el('p', { class: 'sub' }, 'Situação, percentual, etapas, planilha contratada e executada, medições e paralisações (PNTP 10.1 a 10.4).')),
        podeGravar() ? el('div', { class: 'botoes-cabecalho' }, el('button', { type: 'button', class: 'btn btn-primario', onclick: () => form() }, '+ Nova obra')) : null),
      P.estado.alcanceUnidade && perm.editar ? el('p', { class: 'msg msg-info' }, 'Obras são do órgão todo: só quem tem acesso ao órgão inteiro altera.') : null,
      el('p', { class: 'ajuda' }, 'Sem obras publicadas, o site declara que não há obras; sem obras paralisadas, declara que não há obras paralisadas (exigência do PNTP).'),
      // Abas iguais às do site: Obras (por ano de início) e Obras paralisadas (10.4).
      el('div', { class: 'abas', role: 'tablist', 'aria-label': 'Obras' }, [['obras', 'Obras'], ['paralisadas', 'Obras paralisadas']].map(([id, rot]) =>
        el('button', { type: 'button', role: 'tab', class: 'aba', 'aria-selected': abaTopo === id ? 'true' : 'false',
          onclick: async () => { if (abaTopo === id) return; abaTopo = id; filtros.obra = ''; await recarregarLista(); } }, rot))),
      abaTopo === 'paralisadas'
        ? el('div', { class: 'painel-guia' }, P.declaracoes('obras_paralisadas', { perm }), el('p', { class: 'ajuda' }, 'Obras com paralisação aberta, de qualquer ano. O motivo, o responsável e a previsão de reinício ficam na aba "Paralisações" de cada obra.'),
          el('div', { class: 'filtros' }, fBusca, fSit), lista)
        : el('div', { class: 'painel-guia' },
          P.declaracoes('obras', { perm, aoMudar: recarregar }),
          anos.length ? el('div', { class: 'abas abas-internas', role: 'tablist', 'aria-label': 'Ano de início' }, anos.map(botaoAno)) : null,
          anos.length ? el('div', { class: 'painel-guia painel-guia-interno' }, el('div', { class: 'filtros' }, fBusca, fObra, fSit), lista)
            : el('p', { class: 'vazio' }, 'Nenhuma obra cadastrada. Use "+ Nova obra".'))
    ].filter(Boolean));
    if (anos.length || abaTopo === 'paralisadas') desenharLista();
  }

  async function recarregarLista() { try { await carregar(true); desenhar(); } catch (e) { mostrarErro(e); } }
  async function recarregar() { try { await carregarAnos(); await carregar(true); desenhar(); } catch (e) { mostrarErro(e); } }

  P.telas.obras = async function (c, mod, p) {
    perm = p; conteiner = c;
    c.replaceChildren(el('h1', null, 'Obras'), el('p', { class: 'sub' }, 'Carregando…'));
    try { await carregarAnos(); await carregar(true); desenhar(); }
    catch (e) { c.querySelector('.sub').textContent = /obras_anos|Could not find/i.test(e.message || '') ? 'Falta rodar o script 18 no banco.' : P.erroGravacao(e); }
  };
})();
