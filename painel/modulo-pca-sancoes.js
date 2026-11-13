// =====================================================================
// Módulos "Plano de Contratações Anual (PCA)" e "Sanções a licitantes e
// contratados" — PNTP 8.6 e 8.7 (fecham a dimensão Licitações).
//   PCA: o plano do ano e as atualizações, cada um com PDF ou link (ex.:
//        página do PCA no PNCP). Obrigatório por lei: não há "declaração
//        de inexistência" (não pontua no PNTP).
//   Sanções: relação dos licitantes/contratados sancionados pelo próprio
//        órgão (Lei 14.133, art. 156). Sem nenhuma, o site declara que
//        não há sancionados. O CEIS/CNEP é complemento, não substitui.
// Telas no padrão de abas de ano do projeto.
// =====================================================================
(function () {
  'use strict';
  const P = window.PNTP;
  const { sb, el, toast, ocupado, erroCampo, campo } = P;
  const LOTE = 50;
  const LIMITE_MB = 50;
  const moeda = (v) => v === null || v === undefined || v === '' ? '' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const hoje = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const docFormatado = (d) => !d ? '' : d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  const etiquetaSituacao = (s) => el('span', { class: 'etiqueta etiqueta-' + (s === 'publicado' ? 'publicado' : 'rascunho') }, s === 'publicado' ? 'No ar' : 'Rascunho');
  const linkDoc = (r) => r.arquivo_url || r.link_externo
    ? el('a', { href: r.arquivo_url || r.link_externo, target: '_blank', rel: 'noopener' }, r.arquivo_url ? 'PDF' : 'Link')
    : el('span', { class: 'falta-leve' }, 'Sem documento');

  // Bloco "documento": PDF enviado aqui ou link externo (o banco exige um dos dois para publicar).
  function blocoDocumento(prefixo, r, rotuloPdf, ajudaLink) {
    const pdf = el('input', { type: 'file', accept: 'application/pdf' });
    const link = el('input', { type: 'url', value: r.link_externo || '', placeholder: 'https://…' });
    return {
      pdf, link,
      elementos: [
        campo(prefixo + '-pdf', r.arquivo_url ? 'Trocar o PDF' : rotuloPdf, pdf, 'Até ' + LIMITE_MB + ' MB. Prefira PDF com texto pesquisável.'),
        r.arquivo_url ? el('a', { href: r.arquivo_url, target: '_blank', rel: 'noopener', class: 'ajuda' }, 'Ver PDF atual') : null,
        r.arquivo_url ? el('label', { class: 'checkbox' }, el('input', { type: 'checkbox', id: prefixo + '-tirar' }), ' Remover o PDF atual') : null,
        campo(prefixo + '-link', 'Link (opcional)', link, ajudaLink)
      ],
      // Confere e envia; devolve { arquivo_url, link_externo } ou null se houve erro de campo.
      async gravar(modulo, situacao) {
        const l = link.value.trim();
        if (!erroCampo(prefixo + '-link', l && !P.urlValida(l) ? 'Endereço completo, começando com https://' : '')) return null;
        const arq = pdf.files[0];
        if (arq && !erroCampo(prefixo + '-pdf', arq.type !== 'application/pdf' ? 'Envie um PDF.' : arq.size > LIMITE_MB * 1048576 ? 'O arquivo passa de ' + LIMITE_MB + ' MB.' : '')) return null;
        const tirar = document.getElementById(prefixo + '-tirar');
        const ficaAntigo = r.arquivo_url && !(tirar && tirar.checked);
        if (situacao === 'publicado' && !arq && !ficaAntigo && !l
            && !erroCampo(prefixo + '-pdf', 'Para publicar, envie o PDF ou informe o link.')) return null;
        let url = ficaAntigo ? r.arquivo_url : null;
        if (arq) url = await P.enviarArquivo(modulo, arq, 'pdf', 'application/pdf');
        return { arquivo_url: url, link_externo: l || null };
      },
      // Depois de gravar: apaga do armazenamento o PDF que foi trocado/removido.
      limpar(novaUrl) { if (r.arquivo_url && r.arquivo_url !== novaUrl) P.apagarArquivo(r.arquivo_url); }
    };
  }

  function botoesDialogo(perm, publicado, travado, fechar) {
    const acoes = [el('button', { type: 'button', class: 'btn btn-claro', onclick: fechar }, travado ? 'Fechar' : 'Cancelar')];
    const btnR = el('button', { type: 'button', class: 'btn btn-claro' }, publicado ? 'Tirar do ar (rascunho)' : 'Salvar rascunho');
    const btnP = el('button', { type: 'button', class: 'btn btn-primario' }, publicado ? 'Salvar' : 'Publicar');
    if (!travado) { if (!publicado || perm.publicar) acoes.push(btnR); if (perm.publicar) acoes.push(btnP); }
    return { acoes, btnR, btnP };
  }

  const abasAno = (anos, atual, escolher) => el('div', { class: 'abas abas-internas', role: 'tablist', 'aria-label': 'Ano' },
    anos.map((x) => el('button', { type: 'button', role: 'tab', class: 'aba aba-p', 'aria-selected': atual === x.ano ? 'true' : 'false',
      onclick: () => { if (atual !== x.ano) escolher(x.ano); } }, String(x.ano), el('span', { class: 'aba-qtd' }, String(x.total)))));

  // =====================================================================
  // PCA — PNTP 8.6
  // =====================================================================
  (function () {
    const TIPOS = { plano: 'Plano do ano', atualizacao: 'Atualização / revisão' };
    let perm = {}, conteiner = null, ano = null, anos = [], itens = [];
    const podeGravar = () => perm.editar && !P.estado.alcanceUnidade;
    const mostrarErro = (e) => {
      const t = (e && e.message) || '';
      if (/pca_plano_uk/.test(t)) return toast('Já existe o plano deste ano. Para mudanças, cadastre uma "Atualização / revisão".', true);
      if (/pca_documento/.test(t)) return toast('Para publicar, envie o PDF ou informe o link.', true);
      toast(P.erroGravacao(e), true);
    };

    let decl = null;   // declarações de que não há dados (script 23)
    async function carregar() {
      const { data, error } = await sb.rpc('pca_anos', { p_orgao: P.estado.orgao.id });
      if (error) throw error;
      decl = await P.declaracoesAnuais('pca');
      anos = decl.anos(data || []);
      const Y = new Date().getFullYear();
      // O ano corrente aparece sempre: o PCA do ano é obrigatório, a falta precisa ficar visível.
      if (!anos.some((x) => x.ano === Y)) anos = [{ ano: Y, total: 0 }].concat(anos).sort((a, b) => b.ano - a.ano);
      if (!anos.some((x) => x.ano === ano)) ano = anos[0].ano;
      const r = await sb.from('pca').select('*').eq('orgao_id', P.estado.orgao.id).eq('ano', ano)
        .order('tipo', { ascending: false }).order('data_aprovacao', { ascending: false }).limit(200);
      if (r.error) throw r.error;
      itens = r.data || [];
    }

    function form(r) {
      r = r || {};
      const editando = !!r.id, publicado = r.situacao === 'publicado', travado = publicado && !perm.publicar;
      const temPlano = itens.some((x) => x.tipo === 'plano' && x.id !== r.id);
      const f = {
        ano: el('input', { type: 'number', min: 2021, max: 2100, value: r.ano || ano }),
        tipo: el('select', null, Object.entries(TIPOS).map(([k, v]) => el('option', { value: k, selected: (r.tipo || (temPlano ? 'atualizacao' : 'plano')) === k }, v))),
        data: el('input', { type: 'date', value: r.data_aprovacao || hoje() }),
        ato: el('input', { type: 'text', maxlength: 200, value: r.ato_aprovacao || '', placeholder: 'Ex.: Portaria nº 12/2026' }),
        valor: el('input', { type: 'number', min: 0, step: '0.01', value: r.valor_total ?? '' }),
        qtd: el('input', { type: 'number', min: 0, step: 1, value: r.qtd_itens ?? '' }),
        desc: el('textarea', { rows: 3, maxlength: 1000, placeholder: 'Ex.: Inclusão de 3 itens da Secretaria de Saúde.' })
      };
      f.desc.value = r.descricao || '';
      const doc = blocoDocumento('pca', r, 'PDF do PCA', 'Ex.: endereço do PCA no PNCP (pncp.gov.br). Pode ser usado no lugar do PDF.');
      const corpo = el('form', { class: 'form-dialogo', novalidate: true },
        travado ? el('p', { class: 'msg msg-info' }, 'Este documento está publicado. Só quem tem permissão de publicar pode alterá-lo.') : null,
        P.abas([
          ['dados', 'Dados do plano', [
            el('div', { class: 'grade-campos' }, campo('pca-ano', 'Ano do plano', f.ano, null, true), campo('pca-tipo', 'Documento', f.tipo, null, true),
              campo('pca-data', 'Data de aprovação', f.data, null, true)),
            campo('pca-ato', 'Ato de aprovação', f.ato),
            el('div', { class: 'grade-campos' }, campo('pca-valor', 'Valor total estimado (R$)', f.valor), campo('pca-qtd', 'Quantidade de itens', f.qtd)),
            campo('pca-desc', 'Observação', f.desc, 'Nas atualizações, diga o que mudou.')]],
          ['documento', 'Documento', doc.elementos]
        ]));
      if (travado) for (const i of corpo.querySelectorAll('input, select, textarea')) i.disabled = true;
      const b = botoesDialogo(perm, publicado, travado, () => dlg.close());
      const dlg = P.abrirDialogo(editando ? 'Editar documento do PCA' : 'Novo documento do PCA', corpo, b.acoes);
      dlg.classList.add('dialogo-largo');

      async function salvar(situacao, btn) {
        const a = parseInt(f.ano.value, 10);
        if (!erroCampo('pca-ano', a >= 2021 && a <= 2100 ? '' : 'Ano inválido (o PCA existe desde a Lei 14.133/2021).')) return;
        if (!erroCampo('pca-tipo', f.tipo.value === 'plano' && a === ano && temPlano ? 'Já existe o plano deste ano: escolha "Atualização / revisão".' : '')) return;
        if (!erroCampo('pca-data', f.data.value ? '' : 'Informe a data.')) return;
        if (!erroCampo('pca-valor', f.valor.value === '' || Number(f.valor.value) >= 0 ? '' : 'Valor inválido.')) return;
        ocupado(btn, doc.pdf.files[0] ? 'Enviando…' : 'Salvando…');
        try {
          const d = await doc.gravar('pca', situacao);
          if (!d) return;
          const dados = Object.assign({
            ano: a, tipo: f.tipo.value, data_aprovacao: f.data.value, ato_aprovacao: f.ato.value.trim() || null,
            valor_total: f.valor.value === '' ? null : Number(f.valor.value), qtd_itens: f.qtd.value === '' ? null : parseInt(f.qtd.value, 10),
            descricao: f.desc.value.trim() || null, situacao
          }, d);
          await P.gravarRegistro('pca', dados, r.id);
          doc.limpar(d.arquivo_url);
          dlg.close();
          toast(situacao === 'publicado' ? 'Publicado.' : 'Rascunho salvo.');
          ano = a; await recarregar();
        } catch (e) { mostrarErro(e); }
        finally { ocupado(btn); }
      }
      b.btnR.addEventListener('click', () => salvar('rascunho', b.btnR));
      b.btnP.addEventListener('click', () => salvar('publicado', b.btnP));
    }

    async function excluir(r) {
      if (!await P.confirmar('Excluir documento', 'Excluir "' + TIPOS[r.tipo] + ' ' + r.ano + '"? O PNTP pede manter a série histórica; prefira publicar uma atualização.', 'Excluir', true)) return;
      const { data, error } = await sb.from('pca').delete().eq('id', r.id).select('id');
      if (error) return mostrarErro(error);
      if (!data || !data.length) return toast('Seu perfil não pode excluir este documento.', true);
      P.apagarArquivo(r.arquivo_url);
      toast('Documento excluído.'); await recarregar();
    }

    function desenhar() {
      const plano = itens.find((x) => x.tipo === 'plano');
      const declarado = decl && decl.aviso(ano);
      const aviso = !plano && declarado ? declarado : !plano ? el('p', { class: 'msg msg-erro' }, 'Falta o PCA de ' + ano + '. O plano é obrigatório (Lei 14.133/2021, art. 12, VII): declarar que não existe não atende o PNTP 8.6.')
        : plano.situacao !== 'publicado' ? el('p', { class: 'msg msg-info' }, 'O PCA de ' + ano + ' está como rascunho: ainda não aparece no site.') : null;
      const tabela = itens.length ? el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela' },
        el('thead', null, el('tr', null, ['Documento', 'Aprovação', 'Valor total', 'Itens', 'Arquivo', 'Situação'].map((t) => el('th', { scope: 'col' }, t)), el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Ações')))),
        el('tbody', null, itens.map((r) => el('tr', null,
          el('td', { class: 'quebra' }, el('strong', null, TIPOS[r.tipo]), r.ato_aprovacao || r.descricao ? el('span', { class: 'sub-linha' }, [r.ato_aprovacao, r.descricao].filter(Boolean).join(' · ')) : null),
          el('td', { class: 'num' }, P.dataBR(r.data_aprovacao)),
          el('td', { class: 'num' }, moeda(r.valor_total)),
          el('td', { class: 'num' }, r.qtd_itens ?? ''),
          el('td', null, linkDoc(r)),
          el('td', null, etiquetaSituacao(r.situacao)),
          el('td', { class: 'acoes' },
            podeGravar() ? el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => form(r) }, r.situacao === 'publicado' && !perm.publicar ? 'Ver' : 'Editar') : null,
            perm.excluir && podeGravar() ? el('button', { type: 'button', class: 'btn btn-claro btn-p btn-texto-perigo', onclick: () => excluir(r) }, 'Excluir') : null))))))
        : el('p', { class: 'vazio' }, 'Nenhum documento do PCA de ' + ano + '.');
      conteiner.replaceChildren(...[
        el('div', { class: 'cabecalho-modulo' },
          el('div', null, el('h1', null, 'Plano de Contratações Anual'),
            el('p', { class: 'sub' }, 'O plano de cada ano e as atualizações, com o PDF ou o link do PNCP (PNTP 8.6).')),
          podeGravar() ? el('div', { class: 'botoes-cabecalho' }, el('button', { type: 'button', class: 'btn btn-primario', onclick: () => form() }, '+ Novo documento')) : null),
        P.estado.alcanceUnidade && perm.editar ? el('p', { class: 'msg msg-info' }, 'O PCA é do órgão todo: só quem tem acesso ao órgão inteiro altera.') : null,
        aviso,
        P.declaracoes('pca', { perm, aoMudar: recarregar }),
        el('div', { class: 'painel-guia' }, abasAno(anos, ano, async (a) => { ano = a; await recarregar(); }), el('div', { class: 'painel-guia painel-guia-interno' }, tabela))
      ].filter(Boolean));
    }

    async function recarregar() { try { await carregar(); desenhar(); } catch (e) { mostrarErro(e); } }

    P.telas.pca = async function (c, mod, p) {
      perm = p; conteiner = c;
      c.replaceChildren(el('h1', null, 'Plano de Contratações Anual'), el('p', { class: 'sub' }, 'Carregando…'));
      try { await carregar(); desenhar(); }
      catch (e) { c.querySelector('.sub').textContent = /pca_anos|Could not find/i.test(e.message || '') ? 'Falta rodar o script 16 no banco.' : P.erroGravacao(e); }
    };
  })();

  // =====================================================================
  // SANÇÕES — PNTP 8.7
  // =====================================================================
  (function () {
    const TIPOS = {
      advertencia: 'Advertência', multa: 'Multa', impedimento: 'Impedimento de licitar e contratar',
      inidoneidade: 'Declaração de inidoneidade', suspensao: 'Suspensão temporária (Lei 8.666)', outra: 'Outra'
    };
    // Fundamento sugerido ao escolher o tipo (Lei 14.133/2021, art. 156; Lei 8.666/1993, art. 87).
    const FUNDAMENTO = {
      advertencia: 'Lei 14.133/2021, art. 156, I', multa: 'Lei 14.133/2021, art. 156, II', impedimento: 'Lei 14.133/2021, art. 156, III',
      inidoneidade: 'Lei 14.133/2021, art. 156, IV', suspensao: 'Lei 8.666/1993, art. 87, III'
    };
    const COM_PRAZO = ['impedimento', 'inidoneidade', 'suspensao'];
    let perm = {}, conteiner = null, ano = null, anos = [], itens = [], fim = false, total = 0;
    const filtros = { busca: '', tipo: '', vigencia: '', situacao: '' };
    const podeGravar = () => perm.editar && !P.estado.alcanceUnidade;
    const vigente = (s) => COM_PRAZO.includes(s.tipo) && (!s.fim || s.fim >= hoje()) && (!s.inicio || s.inicio <= hoje());
    const mostrarErro = (e) => {
      const t = (e && e.message) || '';
      if (/sancoes_periodo/.test(t)) return toast('O fim da sanção não pode ser antes do início.', true);
      if (/sancoes_multa/.test(t)) return toast('Valor de multa só no tipo "Multa".', true);
      toast(P.erroGravacao(e), true);
    };

    function consulta(sel, opcoes) {
      let q = sb.from('sancoes').select(sel, opcoes).eq('orgao_id', P.estado.orgao.id);
      if (ano) q = q.eq('ano', ano);
      if (filtros.busca) q = q.ilike('busca', '%' + P.normalizar(filtros.busca).replace(/[%_]/g, '') + '%');
      if (filtros.tipo) q = q.eq('tipo', filtros.tipo);
      if (filtros.vigencia === 'vigente') q = q.in('tipo', COM_PRAZO).or('fim.is.null,fim.gte.' + hoje());
      if (filtros.vigencia === 'encerrada') q = q.or('fim.lt.' + hoje() + ',tipo.in.(advertencia,multa,outra)');
      if (filtros.situacao) q = q.eq('situacao', filtros.situacao);
      return q;
    }
    let declS = null;   // declarações de que não há dados (script 23)
    async function carregarAnos() {
      const { data, error } = await sb.rpc('sancoes_anos', { p_orgao: P.estado.orgao.id });
      if (error) throw error;
      declS = await P.declaracoesAnuais('sancionados');
      anos = declS.anos(data || []);
      if (!anos.some((x) => x.ano === ano)) ano = anos.length ? anos[0].ano : null;
    }
    async function carregar(reiniciar) {
      if (!ano || !Number((anos.find((x) => x.ano === ano) || {}).total)) { itens = []; fim = true; total = 0; return; }
      const ultimo = reiniciar ? null : itens[itens.length - 1];
      const [pag, t] = await Promise.all([P.paginar(consulta, 'data_aplicacao', ultimo, LOTE), reiniciar ? P.contar(consulta) : Promise.resolve(total)]);
      itens = reiniciar ? pag.linhas : itens.concat(pag.linhas);
      fim = pag.fim; total = t;
    }

    function form(s) {
      s = s || {};
      const editando = !!s.id, publicado = s.situacao === 'publicado', travado = publicado && !perm.publicar;
      const f = {
        nome: el('input', { type: 'text', maxlength: 200, value: s.sancionado_nome || '' }),
        doc: P.mascaraDoc(el('input', { type: 'text', maxlength: 18, value: docFormatado(s.sancionado_doc), placeholder: 'CNPJ ou CPF' })),
        tipo: el('select', null, el('option', { value: '' }, '— Escolha —'), Object.entries(TIPOS).map(([k, v]) => el('option', { value: k, selected: s.tipo === k }, v))),
        fundamento: el('input', { type: 'text', maxlength: 300, value: s.fundamento || '' }),
        motivo: el('textarea', { rows: 3, maxlength: 2000, placeholder: 'Ex.: Não entregou os itens empenhados no prazo do contrato.' }),
        processo: el('input', { type: 'text', maxlength: 100, value: s.processo || '', placeholder: 'Nº do processo sancionador' }),
        referencia: el('input', { type: 'text', maxlength: 200, value: s.referencia || '', placeholder: 'Ex.: Pregão eletrônico 012/2025 · Contrato 031/2025' }),
        data: el('input', { type: 'date', value: s.data_aplicacao || hoje() }),
        inicio: el('input', { type: 'date', value: s.inicio || '' }),
        fimS: el('input', { type: 'date', value: s.fim || '' }),
        multa: el('input', { type: 'number', min: 0, step: '0.01', value: s.valor_multa ?? '' }),
        ato: el('input', { type: 'text', maxlength: 200, value: s.ato || '', placeholder: 'Ex.: Portaria nº 45/2026, Diário Oficial de 10/03/2026' })
      };
      f.motivo.value = s.motivo || '';
      const bPrazo = el('div', { class: 'grade-campos' }, campo('sa-ini', 'Início da sanção', f.inicio), campo('sa-fim', 'Fim da sanção', f.fimS, 'Impedimento: até 3 anos. Inidoneidade: de 3 a 6 anos.'));
      const bMulta = campo('sa-multa', 'Valor da multa (R$)', f.multa);
      const ajustar = () => {
        bPrazo.hidden = !COM_PRAZO.includes(f.tipo.value);
        bMulta.hidden = f.tipo.value !== 'multa';
      };
      f.tipo.addEventListener('change', () => {
        // Sugere o fundamento se o campo estiver vazio ou com outra sugestão nossa.
        const atual = f.fundamento.value.trim();
        if (!atual || Object.values(FUNDAMENTO).includes(atual)) f.fundamento.value = FUNDAMENTO[f.tipo.value] || '';
        ajustar();
      });
      const doc = blocoDocumento('sa', s, 'PDF do ato (decisão ou publicação)', 'Ex.: publicação no Diário Oficial.');
      const corpo = el('form', { class: 'form-dialogo', novalidate: true },
        travado ? el('p', { class: 'msg msg-info' }, 'Esta sanção está publicada. Só quem tem permissão de publicar pode alterá-la.') : null,
        P.abas([
          ['sancionado', 'Sancionado e sanção', [
            el('div', { class: 'grade-campos' }, campo('sa-nome', 'Licitante ou contratado (nome ou razão social)', f.nome, null, true), campo('sa-doc', 'CNPJ ou CPF', f.doc, 'No site, CPF aparece mascarado (LGPD).')),
            el('div', { class: 'grade-campos' }, campo('sa-tipo', 'Sanção', f.tipo, null, true), campo('sa-fund', 'Fundamento legal', f.fundamento)),
            campo('sa-mot', 'Motivo', f.motivo, 'Resumo da infração. Sem dados pessoais além do nome.'),
            el('div', { class: 'grade-campos' }, campo('sa-proc', 'Processo administrativo', f.processo), campo('sa-ref', 'Licitação ou contrato', f.referencia))]],
          ['prazos', 'Datas e valores', [
            el('div', { class: 'grade-campos' }, campo('sa-data', 'Data da aplicação', f.data, 'Define o ano em que a sanção aparece.', true)),
            bPrazo, bMulta,
            el('p', { class: 'ajuda' }, 'Lembrete: a Lei 14.133/2021 (art. 161) manda registrar a sanção no CEIS/CNEP em até 15 dias úteis. A relação aqui é a do próprio órgão (PNTP 8.7).')]],
          ['ato', 'Ato de aplicação', [campo('sa-ato', 'Ato', f.ato)].concat(doc.elementos)]
        ]));
      ajustar();
      if (travado) for (const i of corpo.querySelectorAll('input, select, textarea')) i.disabled = true;
      const b = botoesDialogo(perm, publicado, travado, () => dlg.close());
      const dlg = P.abrirDialogo(editando ? 'Editar sanção' : 'Nova sanção', corpo, b.acoes);
      dlg.classList.add('dialogo-largo');

      async function salvar(situacao, btn) {
        if (!erroCampo('sa-nome', f.nome.value.trim().length >= 2 ? '' : 'Informe o licitante ou contratado.')) return;
        const d = f.doc.value.replace(/\D/g, '');
        if (!erroCampo('sa-doc', P.erroDoc(d))) return;
        if (!erroCampo('sa-tipo', f.tipo.value ? '' : 'Escolha a sanção.')) return;
        if (!erroCampo('sa-data', f.data.value ? '' : 'Informe a data da aplicação.')) return;
        const prazo = COM_PRAZO.includes(f.tipo.value);
        if (prazo && situacao === 'publicado' && !erroCampo('sa-fim', f.fimS.value ? '' : 'Informe até quando vale a sanção.')) return;
        if (!erroCampo('sa-fim', !f.inicio.value || !f.fimS.value || f.fimS.value >= f.inicio.value ? '' : 'O fim não pode ser antes do início.')) return;
        ocupado(btn, doc.pdf.files[0] ? 'Enviando…' : 'Salvando…');
        try {
          const dd = await doc.gravar('sancoes', 'rascunho');   // ato é recomendável, não obrigatório para publicar
          if (!dd) return;
          const dados = Object.assign({
            sancionado_nome: f.nome.value.trim(), sancionado_doc: d || null, tipo: f.tipo.value, fundamento: f.fundamento.value.trim() || null,
            motivo: f.motivo.value.trim() || null, processo: f.processo.value.trim() || null, referencia: f.referencia.value.trim() || null,
            data_aplicacao: f.data.value, inicio: prazo ? f.inicio.value || null : null, fim: prazo ? f.fimS.value || null : null,
            valor_multa: f.tipo.value === 'multa' && f.multa.value !== '' ? Number(f.multa.value) : null,
            ato: f.ato.value.trim() || null, situacao
          }, dd);
          await P.gravarRegistro('sancoes', dados, s.id);
          doc.limpar(dd.arquivo_url);
          dlg.close();
          toast(situacao === 'publicado' ? 'Publicado.' : 'Rascunho salvo.');
          ano = Number(f.data.value.slice(0, 4)); await recarregar();
        } catch (e) { mostrarErro(e); }
        finally { ocupado(btn); }
      }
      b.btnR.addEventListener('click', () => salvar('rascunho', b.btnR));
      b.btnP.addEventListener('click', () => salvar('publicado', b.btnP));
    }

    async function excluir(s) {
      if (!await P.confirmar('Excluir sanção', 'Excluir a sanção de "' + s.sancionado_nome + '"? Sanção encerrada continua na relação (série histórica); exclua só se foi lançada por engano ou anulada.', 'Excluir', true)) return;
      const { data, error } = await sb.from('sancoes').delete().eq('id', s.id).select('id');
      if (error) return mostrarErro(error);
      if (!data || !data.length) return toast('Seu perfil não pode excluir esta sanção.', true);
      P.apagarArquivo(s.arquivo_url);
      toast('Sanção excluída.'); await recarregar();
    }

    function desenhar() {
      const fBusca = el('input', { type: 'search', placeholder: 'Nome, CNPJ/CPF, processo, licitação', value: filtros.busca, 'aria-label': 'Buscar' });
      const fTipo = el('select', { 'aria-label': 'Sanção' }, el('option', { value: '' }, 'Sanção: todas'), Object.entries(TIPOS).map(([k, v]) => el('option', { value: k, selected: filtros.tipo === k }, v)));
      const fVig = el('select', { 'aria-label': 'Vigência' }, el('option', { value: '' }, 'Vigência: todas'),
        [['vigente', 'Em vigor'], ['encerrada', 'Encerradas / sem prazo']].map(([k, v]) => el('option', { value: k, selected: filtros.vigencia === k }, v)));
      const fSit = el('select', { 'aria-label': 'Situação' }, el('option', { value: '' }, 'Situação: todas'),
        el('option', { value: 'publicado', selected: filtros.situacao === 'publicado' }, 'No ar'), el('option', { value: 'rascunho', selected: filtros.situacao === 'rascunho' }, 'Rascunho'));
      const lista = el('div');
      const aplicar = () => {
        Object.assign(filtros, { busca: fBusca.value.trim(), tipo: fTipo.value, vigencia: fVig.value, situacao: fSit.value });
        lista.replaceChildren(el('p', { class: 'vazio' }, 'Carregando…'));
        carregar(true).then(desenharLista).catch(mostrarErro);
      };
      [fTipo, fVig, fSit].forEach((x) => x.addEventListener('change', aplicar));
      let espera; fBusca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(aplicar, 400); });

      function desenharLista() {
        if (!itens.length) { lista.replaceChildren((declS && declS.aviso(ano)) || el('p', { class: 'vazio' }, Object.values(filtros).some(Boolean) ? 'Nenhuma sanção com esses filtros.' : 'Nenhuma sanção neste ano.')); return; }
        const btnMais = el('button', { type: 'button', class: 'btn btn-claro' }, 'Carregar mais');
        btnMais.addEventListener('click', async () => { ocupado(btnMais, 'Carregando…'); try { await carregar(false); desenharLista(); } catch (e) { mostrarErro(e); ocupado(btnMais); } });
        lista.replaceChildren(
          el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela' },
            el('thead', null, el('tr', null, ['Sancionado', 'Sanção', 'Aplicação', 'Prazo', 'Ato', 'Situação'].map((t) => el('th', { scope: 'col' }, t)), el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Ações')))),
            el('tbody', null, itens.map((s) => el('tr', null,
              el('td', { class: 'quebra' }, el('strong', null, s.sancionado_nome), s.sancionado_doc ? el('span', { class: 'sub-linha' }, docFormatado(s.sancionado_doc)) : null),
              el('td', { class: 'quebra' }, TIPOS[s.tipo] || s.tipo, s.tipo === 'multa' && s.valor_multa != null ? el('span', { class: 'sub-linha' }, moeda(s.valor_multa)) : null),
              el('td', { class: 'num' }, P.dataBR(s.data_aplicacao)),
              el('td', null, COM_PRAZO.includes(s.tipo)
                ? el('span', { class: 'etiqueta etiqueta-' + (vigente(s) ? 'ativo' : 'desativado') }, (vigente(s) ? 'Em vigor' : 'Encerrada') + (s.fim ? ' · até ' + P.dataBR(s.fim) : ''))
                : '—'),
              el('td', null, linkDoc(s)),
              el('td', null, etiquetaSituacao(s.situacao)),
              el('td', { class: 'acoes' },
                podeGravar() ? el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => form(s) }, s.situacao === 'publicado' && !perm.publicar ? 'Ver' : 'Editar') : null,
                perm.excluir && podeGravar() ? el('button', { type: 'button', class: 'btn btn-claro btn-p btn-texto-perigo', onclick: () => excluir(s) }, 'Excluir') : null)))))),
          el('div', { class: 'rodape-lista' }, el('span', { class: 'ajuda' }, 'Mostrando ' + itens.length + ' de ' + total), fim ? '' : btnMais));
      }

      conteiner.replaceChildren(...[
        el('div', { class: 'cabecalho-modulo' },
          el('div', null, el('h1', null, 'Sanções a licitantes e contratados'),
            el('p', { class: 'sub' }, 'Advertências, multas, impedimentos e inidoneidades aplicados por este órgão (PNTP 8.7).')),
          podeGravar() ? el('div', { class: 'botoes-cabecalho' }, el('button', { type: 'button', class: 'btn btn-primario', onclick: () => form() }, '+ Nova sanção')) : null),
        P.estado.alcanceUnidade && perm.editar ? el('p', { class: 'msg msg-info' }, 'Sanções são do órgão todo: só quem tem acesso ao órgão inteiro altera.') : null,
        el('p', { class: 'ajuda' }, 'Sem nenhuma sanção publicada, o site declara automaticamente que não há licitantes ou contratados sancionados por este órgão.'),
        P.declaracoes('sancionados', { perm, aoMudar: recarregar }),
        el('div', { class: 'painel-guia' },
          anos.length ? abasAno(anos, ano, async (a) => { ano = a; await recarregarLista(); }) : null,
          anos.length ? el('div', { class: 'painel-guia painel-guia-interno' }, el('div', { class: 'filtros' }, fBusca, fTipo, fVig, fSit), lista)
            : el('p', { class: 'vazio' }, 'Nenhuma sanção cadastrada.'))
      ].filter(Boolean));
      if (anos.length) desenharLista();
    }

    async function recarregarLista() { try { await carregar(true); desenhar(); } catch (e) { mostrarErro(e); } }
    async function recarregar() { try { await carregarAnos(); await carregar(true); desenhar(); } catch (e) { mostrarErro(e); } }

    P.telas.sancoes = async function (c, mod, p) {
      perm = p; conteiner = c;
      c.replaceChildren(el('h1', null, 'Sanções a licitantes e contratados'), el('p', { class: 'sub' }, 'Carregando…'));
      try { await carregarAnos(); await carregar(true); desenhar(); }
      catch (e) { c.querySelector('.sub').textContent = /sancoes_anos|Could not find/i.test(e.message || '') ? 'Falta rodar o script 16 no banco.' : P.erroGravacao(e); }
    };
  })();
})();
