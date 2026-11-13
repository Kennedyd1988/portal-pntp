// =====================================================================
// Módulo "Publicações oficiais e atos normativos" (Lote 3)
// Leis, decretos, portarias… com PDF enviado OU link externo (ex.: a
// edição do Diário Oficial na FEMURN). Importação por planilha entra
// quando o layout for definido. Lista paginada no servidor (50 por vez).
// =====================================================================
(function () {
  'use strict';
  const P = window.PNTP;
  const { sb, el, toast, ocupado, erroCampo, normalizar, ordemAlfabetica, campo } = P;
  const LOTE = 50;

  const TIPOS = {
    lei_organica: 'Lei Orgânica', emenda_lei_organica: 'Emenda à Lei Orgânica', lei_complementar: 'Lei Complementar',
    lei: 'Lei Ordinária', decreto: 'Decreto', portaria: 'Portaria', resolucao: 'Resolução',
    instrucao_normativa: 'Instrução Normativa', ato: 'Ato', edital: 'Edital', outro: 'Outro'
  };
  const VIGENCIA = { vigente: 'Vigente', alterada: 'Alterada', revogada: 'Revogada', sem_efeito: 'Sem efeito' };

  let perm = {};
  let conteiner = null;
  let unidades = [];
  let itens = [], fim = false, total = 0;
  const filtros = { busca: '', tipo: '', ano: '', vigencia: '', situacao: '', unidade: '' };

  const alcance = () => P.estado.alcanceUnidade;
  const nomeUnidade = (id) => (unidades.find((u) => u.id === id) || {}).nome || '';
  const mostrarErro = (e) => {
    const t = (e && e.message) || '';
    if (/publicacoes_unica_idx|duplicate key/i.test(t)) return toast('Já existe uma publicação com esse tipo, número e ano.', true);
    if (/publicacoes_documento/i.test(t)) return toast('Para publicar, envie o PDF ou informe o link do documento.', true);
    toast(P.erroGravacao(e), true);
  };
  const identificacao = (x) => (TIPOS[x.tipo] || x.tipo) + (x.numero ? ' nº ' + x.numero + '/' + x.ano : ' de ' + x.ano);

  function consulta(sel, opcoes) {
    let q = sb.from('publicacoes').select(sel, opcoes).eq('orgao_id', P.estado.orgao.id);
    const f = filtros;
    if (f.busca) q = q.ilike('busca', '%' + normalizar(f.busca).replace(/[%_]/g, '') + '%');
    if (f.tipo) q = q.eq('tipo', f.tipo);
    if (f.ano) q = q.eq('ano', parseInt(f.ano, 10));
    if (f.vigencia) q = q.eq('vigencia', f.vigencia);
    if (f.situacao) q = q.eq('situacao', f.situacao);
    if (f.unidade === 'nenhuma') q = q.is('unidade_id', null);
    else if (f.unidade) q = q.eq('unidade_id', f.unidade);
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

  function form(x) {
    x = x || {};
    const publicada = x.situacao === 'publicado';
    const travada = publicada && !perm.publicar;
    const cfg = P.estado.orgao.configuracoes || {};
    const f = {
      tipo: el('select', null, el('option', { value: '' }, '— Escolha —'),
        Object.entries(TIPOS).map(([k, v]) => el('option', { value: k, selected: x.tipo === k }, v))),
      numero: el('input', { type: 'text', maxlength: 20, value: x.numero || '', placeholder: 'Ex.: 012' }),
      data: el('input', { type: 'date', value: x.data_publicacao || '' }),
      ano: el('input', { type: 'number', min: 1900, max: 2100, value: x.ano || new Date().getFullYear() }),
      ementa: el('textarea', { rows: 3 }),
      vigencia: el('select', null, Object.entries(VIGENCIA).map(([k, v]) => el('option', { value: k, selected: (x.vigencia || 'vigente') === k }, v))),
      observacao: el('input', { type: 'text', maxlength: 300, value: x.observacao || '', placeholder: 'Ex.: Revogada pela Lei nº 123/2026' }),
      unidade: alcance()
        ? el('select', { disabled: true }, el('option', { value: alcance() }, nomeUnidade(alcance())))
        : el('select', null, el('option', { value: '' }, '— Órgão todo —'),
          [...unidades].sort((a, b) => ordemAlfabetica(a.nome, b.nome)).map((u) => el('option', { value: u.id, selected: x.unidade_id === u.id }, u.nome))),
      pdf: el('input', { type: 'file', accept: 'application/pdf' }),
      link: el('input', { type: 'url', value: x.link_externo || '', placeholder: cfg.diario_oficial_url || 'https://…' })
    };
    f.ementa.value = x.ementa || '';
    // Ano acompanha a data (e continua editável para leis antigas digitadas fora de ordem).
    f.data.addEventListener('change', () => { if (f.data.value) f.ano.value = f.data.value.slice(0, 4); });

    const usaLink = x.link_externo && !x.arquivo_url;
    const rPdf = el('input', { type: 'radio', name: 'pb-doc', value: 'pdf', checked: !usaLink });
    const rLink = el('input', { type: 'radio', name: 'pb-doc', value: 'link', checked: !!usaLink });
    const blocoPdf = el('div', null, campo('pb-pdf', 'Arquivo PDF', f.pdf, x.arquivo_url ? null : 'Até 10 MB.'),
      x.arquivo_url ? el('a', { href: x.arquivo_url, target: '_blank', rel: 'noopener', class: 'ajuda' }, 'Ver PDF atual') : null);
    const blocoLink = el('div', null, campo('pb-link', 'Link do documento', f.link,
      'Ex.: a página da edição no ' + (cfg.diario_oficial_nome || 'Diário Oficial') + '.'));
    const alternar = () => { blocoPdf.hidden = !rPdf.checked; blocoLink.hidden = !rLink.checked; };
    rPdf.addEventListener('change', alternar); rLink.addEventListener('change', alternar); alternar();

    const corpo = el('form', { class: 'form-dialogo', novalidate: true },
      travada ? el('p', { class: 'msg msg-info' }, 'Esta publicação está no ar. Só quem tem permissão de publicar pode alterá-la.') : null,
      P.abas([
        ['ato', 'Identificação do ato', [el('div', { class: 'grade-campos grade-3' },
          campo('pb-tipo', 'Tipo', f.tipo, null, true),
          campo('pb-numero', 'Número', f.numero),
          campo('pb-data', 'Data de publicação', f.data, null, true)),
          campo('pb-ementa', 'Ementa', f.ementa, 'Resumo oficial do ato ("Dispõe sobre…"). É por ela que o cidadão pesquisa.', true),
          campo('pb-ano', 'Ano', f.ano, null, true)]],
        ['documento', 'Documento', [el('fieldset', { class: 'opcoes' },
          el('legend', null, 'Como o documento chega ao cidadão'),
          el('label', { class: 'checkbox' }, rPdf, ' Enviar o PDF'),
          el('label', { class: 'checkbox' }, rLink, ' Apontar para um link externo (Diário Oficial, outro sistema)'),
          blocoPdf, blocoLink)]],
        ['situacao', 'Situação e unidade', [el('div', { class: 'grade-campos' },
          campo('pb-vigencia', 'Situação do ato', f.vigencia),
          campo('pb-unidade', 'Unidade', f.unidade)),
          campo('pb-obs', 'Observação', f.observacao)]]
      ])
    );
    if (travada) for (const i of corpo.querySelectorAll('input, textarea, select')) i.disabled = true;

    const acoes = [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => dlg.close() }, travada ? 'Fechar' : 'Cancelar')];
    const btnRascunho = el('button', { type: 'button', class: 'btn btn-claro' }, publicada ? 'Tirar do ar (rascunho)' : 'Salvar rascunho');
    const btnPublicar = el('button', { type: 'button', class: 'btn btn-primario' }, publicada ? 'Salvar' : 'Publicar');
    if (!travada) {
      if (!publicada || perm.publicar) acoes.push(btnRascunho);
      if (perm.publicar) acoes.push(btnPublicar);
    }
    const dlg = P.abrirDialogo(x.id ? 'Editar publicação' : 'Nova publicação', corpo, acoes);
    dlg.classList.add('dialogo-largo');

    async function salvar(situacao, btn) {
      if (!erroCampo('pb-tipo', f.tipo.value ? '' : 'Escolha o tipo.')) return;
      if (!erroCampo('pb-data', f.data.value ? '' : 'Informe a data.')) return;
      if (!erroCampo('pb-ementa', f.ementa.value.trim().length >= 5 ? '' : 'Informe a ementa.')) return;
      const ano = parseInt(f.ano.value, 10);
      if (!erroCampo('pb-ano', ano >= 1900 && ano <= 2100 ? '' : 'Ano inválido.')) return;
      const link = f.link.value.trim();
      if (rLink.checked && !erroCampo('pb-link', !link || P.urlValida(link) ? '' : 'Endereço completo, começando com https://')) return;
      let pdf = null;
      try { pdf = rPdf.checked ? P.validarPdf(f.pdf.files[0]) : null; } catch (e) { erroCampo('pb-pdf', e.message); return; }
      if (situacao === 'publicado') {
        const temDoc = rPdf.checked ? (pdf || x.arquivo_url) : link;
        if (!temDoc) { erroCampo(rPdf.checked ? 'pb-pdf' : 'pb-link', 'Para publicar, informe o documento.'); return; }
      }
      ocupado(btn, situacao === 'publicado' ? 'Publicando…' : 'Salvando…');
      try {
        const antigo = x.arquivo_url || null;
        let arquivo = rPdf.checked ? antigo : null;
        if (pdf) arquivo = await P.enviarArquivo('publicacoes', pdf, 'pdf', 'application/pdf');
        await P.gravarRegistro('publicacoes', {
          tipo: f.tipo.value, numero: f.numero.value.trim() || null, ano, data_publicacao: f.data.value,
          ementa: f.ementa.value.trim(), vigencia: f.vigencia.value, observacao: f.observacao.value.trim() || null,
          unidade_id: f.unidade.value || null, arquivo_url: arquivo, link_externo: rLink.checked ? (link || null) : null,
          origem: rLink.checked ? 'link' : 'manual', situacao
        }, x.id);
        if (antigo && antigo !== arquivo) P.apagarArquivo(antigo);
        dlg.close();
        toast(situacao === 'publicado' ? 'Publicação no ar.' : 'Rascunho salvo.');
        await recarregar();
      } catch (e) { mostrarErro(e); }
      finally { ocupado(btn); }
    }
    btnRascunho.addEventListener('click', () => salvar('rascunho', btnRascunho));
    btnPublicar.addEventListener('click', () => salvar('publicado', btnPublicar));
  }

  async function excluir(x) {
    // Vínculo: a publicação pode ser a norma do Governo Digital (tela LGPD).
    const { count } = await sb.from('lgpd').select('orgao_id', { count: 'exact', head: true }).eq('gov_digital_publicacao', x.id);
    if (count) {
      P.aviso('Não é possível excluir', '"' + identificacao(x) + '" está indicada como a norma do Governo Digital na tela "LGPD e Governo Digital". Troque a indicação lá antes de excluir.');
      return;
    }
    if (!await P.confirmar('Excluir publicação', 'Excluir "' + identificacao(x) + '"? Atos oficiais normalmente não são apagados: se foi revogado, prefira mudar a situação para "Revogada".', 'Excluir', true)) return;
    const { data, error } = await sb.from('publicacoes').delete().eq('id', x.id).select('id');
    if (error) return mostrarErro(error);
    if (!data || !data.length) return toast('Seu perfil não pode excluir esta publicação.', true);
    P.apagarArquivo(x.arquivo_url);
    toast('Publicação excluída.');
    await recarregar();
  }

  function desenhar() {
    const cfg = P.estado.orgao.configuracoes || {};
    const busca = el('input', { type: 'search', placeholder: 'Número ou ementa', value: filtros.busca, 'aria-label': 'Buscar por número ou ementa' });
    const tipo = el('select', { 'aria-label': 'Tipo' }, el('option', { value: '' }, 'Todos os tipos'),
      Object.entries(TIPOS).map(([k, v]) => el('option', { value: k, selected: filtros.tipo === k }, v)));
    const ano = el('input', { type: 'number', min: 1900, max: 2100, placeholder: 'Ano', value: filtros.ano, 'aria-label': 'Ano' });
    const vig = el('select', { 'aria-label': 'Situação do ato' }, el('option', { value: '' }, 'Qualquer situação do ato'),
      Object.entries(VIGENCIA).map(([k, v]) => el('option', { value: k, selected: filtros.vigencia === k }, v)));
    const sit = el('select', { 'aria-label': 'Publicação' }, el('option', { value: '' }, 'No ar e rascunhos'),
      el('option', { value: 'publicado', selected: filtros.situacao === 'publicado' }, 'No ar'),
      el('option', { value: 'rascunho', selected: filtros.situacao === 'rascunho' }, 'Rascunhos'));
    const un = el('select', { 'aria-label': 'Unidade' }, el('option', { value: '' }, 'Todas as unidades'),
      el('option', { value: 'nenhuma', selected: filtros.unidade === 'nenhuma' }, 'Órgão todo (sem unidade)'),
      [...unidades].sort((a, b) => ordemAlfabetica(a.nome, b.nome)).map((u) => el('option', { value: u.id, selected: filtros.unidade === u.id }, u.nome)));
    const lista = el('div');
    let espera = null;
    const aplicar = () => {
      Object.assign(filtros, { busca: busca.value.trim(), tipo: tipo.value, ano: ano.value, vigencia: vig.value, situacao: sit.value, unidade: un.value });
      lista.replaceChildren(el('p', { class: 'vazio' }, 'Carregando…'));
      carregar(true).then(desenharLista).catch(mostrarErro);
    };
    for (const c of [busca, ano]) c.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(aplicar, 400); });
    for (const c of [tipo, vig, sit, un]) c.addEventListener('change', aplicar);

    function desenharLista() {
      if (!itens.length) { lista.replaceChildren(el('p', { class: 'vazio' }, Object.values(filtros).some(Boolean) ? 'Nenhuma publicação com esses filtros.' : 'Nenhuma publicação cadastrada ainda.')); return; }
      const btnMais = el('button', { type: 'button', class: 'btn btn-claro' }, 'Carregar mais');
      btnMais.addEventListener('click', async () => {
        ocupado(btnMais, 'Carregando…');
        try { await carregar(false); desenharLista(); } catch (e) { mostrarErro(e); ocupado(btnMais); }
      });
      lista.replaceChildren(
        el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela' },
          el('thead', null, el('tr', null, ['Ato', 'Ementa', 'Data', 'Situação do ato', 'Publicação', 'Documento'].map((t) => el('th', { scope: 'col' }, t)),
            el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Ações')))),
          el('tbody', null, itens.map((x) => {
            const mexe = !alcance() || x.unidade_id === alcance();
            const doc = x.arquivo_url || x.link_externo;
            return el('tr', null,
              el('td', null, el('strong', null, identificacao(x)), x.unidade_id ? el('span', { class: 'sub-linha' }, nomeUnidade(x.unidade_id)) : null),
              el('td', { class: 'quebra' }, x.ementa, x.observacao ? el('span', { class: 'sub-linha' }, x.observacao) : null),
              el('td', { class: 'num' }, P.dataBR(x.data_publicacao)),
              el('td', null, el('span', { class: 'etiqueta etiqueta-vig-' + x.vigencia }, VIGENCIA[x.vigencia])),
              el('td', null, el('span', { class: 'etiqueta etiqueta-' + (x.situacao === 'publicado' ? 'publicado' : 'rascunho') }, x.situacao === 'publicado' ? 'No ar' : 'Rascunho')),
              el('td', null, doc ? el('a', { href: doc, target: '_blank', rel: 'noopener' }, x.arquivo_url ? 'PDF' : 'Link') : el('span', { class: 'falta' }, 'Sem documento')),
              el('td', { class: 'acoes' },
                perm.editar && mexe ? el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => form(x) }, x.situacao === 'publicado' && !perm.publicar ? 'Ver' : 'Editar') : null,
                perm.excluir && mexe ? el('button', { type: 'button', class: 'btn btn-claro btn-p btn-texto-perigo', onclick: () => excluir(x) }, 'Excluir') : null));
          })))),
        el('div', { class: 'rodape-lista' }, el('span', { class: 'ajuda' }, 'Mostrando ' + itens.length + ' de ' + total), fim ? null : btnMais));
    }

    conteiner.replaceChildren(...[
      el('div', { class: 'cabecalho-modulo' },
        el('div', null, el('h1', null, 'Publicações oficiais e atos normativos'),
          el('p', { class: 'sub' }, 'Leis, decretos, portarias e demais atos. Cada um com PDF ou link para o documento oficial.')),
        el('div', { class: 'botoes-cabecalho' },
          perm.editar ? el('button', { type: 'button', class: 'btn btn-claro', disabled: true, title: 'O layout da planilha de importação será definido numa próxima etapa.' }, 'Importar planilha (em breve)') : null,
          perm.editar ? el('button', { type: 'button', class: 'btn btn-primario', onclick: () => form() }, '+ Nova publicação') : null)),
      el('div', { class: 'cartao cartao-diario' },
        el('div', null,
          el('strong', null, 'Diário Oficial'),
          el('span', { class: 'sub-linha' }, cfg.diario_oficial_url
            ? 'Publicado em sistema externo: ' + (cfg.diario_oficial_nome || cfg.diario_oficial_url) + '. O site leva o cidadão até lá.'
            : 'Endereço do Diário Oficial ainda não informado (tela "Aparência e contatos").')),
        cfg.diario_oficial_url ? el('a', { class: 'btn btn-claro btn-p', href: cfg.diario_oficial_url, target: '_blank', rel: 'noopener' }, 'Abrir') : null),
      el('div', { class: 'filtros filtros-6' }, busca, tipo, ano, vig, sit, un),
      lista
    ].filter(Boolean));
    desenharLista();
  }

  async function recarregar() {
    try { await carregar(true); desenhar(); } catch (e) { mostrarErro(e); }
  }

  P.telas.publicacoes = async function (c, mod, p) {
    perm = p; conteiner = c;
    c.replaceChildren(el('h1', null, 'Publicações oficiais e atos normativos'), el('p', { class: 'sub' }, 'Carregando…'));
    try {
      const [u, o] = await Promise.all([
        sb.from('unidades').select('id, nome').eq('orgao_id', P.estado.orgao.id).limit(500),
        // Configurações lidas frescas (o Diário Oficial pode ter mudado na tela de Aparência).
        sb.from('orgaos').select('configuracoes').eq('id', P.estado.orgao.id).maybeSingle()
      ]);
      if (u.error) throw u.error;
      unidades = u.data;
      P.estado.orgao.configuracoes = (o.data && o.data.configuracoes) || {};
      await carregar(true);
      desenhar();
    } catch (e) { c.querySelector('.sub').textContent = P.erroGravacao(e); }
  };
})();
