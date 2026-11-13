// =====================================================================
// Módulo "Licitações" (Lote 7 · Fase 2) — PNTP 8.1 a 8.5
// Licitações de todas as modalidades, dispensas, inexigibilidades e
// adesões a atas, com os documentos de cada fase.
// Cada processo vem de uma fonte, à escolha do órgão:
//   portal → cadastrado aqui, com os arquivos enviados aqui;
//   link   → só os dados básicos e o link do processo em outro sistema;
//   pncp   → importado do PNCP (botão "Importar do PNCP"); reimportar
//            atualiza os dados e a lista de arquivos vindos de lá.
// Telas divididas em abas no estilo de guia (padrão do projeto):
// grupo de modalidade → exercício.
// =====================================================================
(function () {
  'use strict';
  const P = window.PNTP;
  const { sb, el, toast, ocupado, erroCampo, campo } = P;
  const LOTE = 50;
  const LIMITE_MB = 50;

  const MODALIDADES = {
    pregao_eletronico: 'Pregão eletrônico', pregao_presencial: 'Pregão presencial',
    concorrencia_eletronica: 'Concorrência eletrônica', concorrencia_presencial: 'Concorrência presencial',
    concurso: 'Concurso', leilao_eletronico: 'Leilão eletrônico', leilao_presencial: 'Leilão presencial',
    dialogo_competitivo: 'Diálogo competitivo', credenciamento: 'Credenciamento', pre_qualificacao: 'Pré-qualificação',
    manifestacao_interesse: 'Manifestação de interesse', chamada_publica: 'Chamada pública',
    tomada_precos: 'Tomada de preços (Lei 8.666)', convite: 'Convite (Lei 8.666)',
    dispensa: 'Dispensa de licitação', inexigibilidade: 'Inexigibilidade', adesao_ata: 'Adesão a ata de registro de preços', outra: 'Outra'
  };
  // Abas de grupo: o PNTP trata licitação (8.1–8.3), contratação direta (8.4) e adesão (8.5) separadamente.
  const GRUPOS = [
    ['todos', 'Todos os processos', Object.keys(MODALIDADES)],
    ['licitacoes', 'Licitações', Object.keys(MODALIDADES).filter((m) => !['dispensa', 'inexigibilidade', 'adesao_ata'].includes(m))],
    ['diretas', 'Dispensas e inexigibilidades', ['dispensa', 'inexigibilidade']],
    ['adesoes', 'Adesões a atas', ['adesao_ata']]
  ];
  const ANDAMENTOS = {
    prevista: 'Prevista', aberta: 'Aberta (recebendo propostas)', em_andamento: 'Em andamento', suspensa: 'Suspensa',
    homologada: 'Homologada', deserta: 'Deserta', fracassada: 'Fracassada', revogada: 'Revogada', anulada: 'Anulada', encerrada: 'Encerrada'
  };
  const COR_ANDAMENTO = { aberta: 'publicado', em_andamento: 'agendado', prevista: 'agendado', suspensa: 'rascunho', homologada: 'publicado', encerrada: 'publicado',
    deserta: 'desativado', fracassada: 'desativado', revogada: 'desativado', anulada: 'desativado' };
  // Tipos de documento: cobrem a lista do PNTP 8.3 (fase interna e externa) e 8.4 (contratação direta).
  const TIPOS_DOC = {
    estudo_tecnico: 'Estudo técnico preliminar (ETP)', justificativa: 'Justificativa (da contratação, do contratado e do preço)',
    orcamento: 'Orçamento / pesquisa de preços / mapa', parecer: 'Parecer técnico ou jurídico', emergencia: 'Caracterização da emergência ou calamidade',
    aviso: 'Aviso de licitação', edital: 'Edital', anexo: 'Anexo', termo_referencia: 'Termo de referência / projeto básico',
    esclarecimento: 'Esclarecimento', impugnacao: 'Impugnação e resposta', retificacao: 'Retificação / errata', ata: 'Ata da sessão',
    resultado: 'Resultado / julgamento', recurso: 'Recurso e decisão', adjudicacao: 'Adjudicação', homologacao: 'Homologação',
    ratificacao: 'Ratificação (contratação direta)', contrato: 'Contrato / ata de registro de preços', outro: 'Outro documento'
  };
  // Códigos de modalidade do PNCP → modalidades daqui.
  const PNCP_MOD = { 1: 'leilao_eletronico', 2: 'dialogo_competitivo', 3: 'concurso', 4: 'concorrencia_eletronica', 5: 'concorrencia_presencial',
    6: 'pregao_eletronico', 7: 'pregao_presencial', 8: 'dispensa', 9: 'inexigibilidade', 10: 'manifestacao_interesse',
    11: 'pre_qualificacao', 12: 'credenciamento', 13: 'leilao_presencial' };

  let perm = {}, conteiner = null;
  let grupo = 'todos', ano = null, anos = [];
  let itens = [], fim = false, total = 0;
  const filtros = { busca: '', modalidade: '', andamento: '', origem: '', situacao: '' };

  const podeGravar = () => perm.editar && !P.estado.alcanceUnidade;
  const moeda = (v) => v === null || v === undefined || v === '' ? '' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const rotuloProcesso = (l) => (MODALIDADES[l.modalidade] || l.modalidade) + (l.numero ? ' nº ' + l.numero : '');
  const modalidadesDoGrupo = () => GRUPOS.find((g) => g[0] === grupo)[2];
  const mostrarErro = (e) => {
    const t = (e && e.message) || '';
    if (/licitacoes_link/.test(t)) return toast('Informe o link do processo no outro sistema.', true);
    if (/licitacoes_pncp_uk/.test(t)) return toast('Este processo do PNCP já foi importado.', true);
    if (/contratos_licitacao_id_fkey/.test(t)) return toast('Não dá para excluir: há contratos ligados a este processo. Desvincule ou exclua os contratos antes (em Contratos).', true);
    if (/Este processo está publicado|não pertence/.test(t)) return toast(t.replace(/^.*?(Este processo|O documento)/, '$1'), true);
    toast(P.erroGravacao(e), true);
  };

  // ---------------------------------------------------------------------
  // Dados
  // ---------------------------------------------------------------------
  function consulta(sel, opcoes) {
    let q = sb.from('licitacoes').select(sel, opcoes).eq('orgao_id', P.estado.orgao.id).in('modalidade', modalidadesDoGrupo());
    if (ano) q = q.eq('ano', ano);
    if (filtros.busca) q = q.ilike('busca', '%' + P.normalizar(filtros.busca).replace(/[%_]/g, '') + '%');
    if (filtros.modalidade) q = q.eq('modalidade', filtros.modalidade);
    if (filtros.andamento) q = q.eq('andamento', filtros.andamento);
    if (filtros.origem) q = q.eq('origem', filtros.origem);
    if (filtros.situacao) q = q.eq('situacao', filtros.situacao);
    return q;
  }
  // Declarações de que não há dados (script 23), uma por aba de grupo; "Todos" reúne as três.
  const CHAVES_DECL = { licitacoes: 'licitacoes_licitacoes', diretas: 'licitacoes_diretas', adesoes: 'licitacoes_adesoes' };
  let decl = null;
  async function carregarAnos() {
    const { data, error } = await sb.rpc('licitacoes_anos', { p_orgao: P.estado.orgao.id, p_modalidades: modalidadesDoGrupo() });
    if (error) throw error;
    anos = (data || []).map((x) => ({ ano: x.ano, total: x.total }));
    decl = await P.declaracoesAnuais(CHAVES_DECL[grupo] || Object.values(CHAVES_DECL));
    anos = decl.anos(anos);
    if (!anos.some((x) => x.ano === ano)) ano = anos.length ? anos[0].ano : null;
  }
  async function carregar(reiniciar) {
    if (!ano || !Number((anos.find((x) => x.ano === ano) || {}).total)) { itens = []; fim = true; total = 0; return; }
    const ultimo = reiniciar ? null : itens[itens.length - 1];
    const [pag, t] = await Promise.all([
      P.paginar(consulta, 'chave_ordem', ultimo, LOTE, true),   // modalidade + número (PNTP 8.1; script 17)
      reiniciar ? P.contar(consulta) : Promise.resolve(total)
    ]);
    itens = reiniciar ? pag.linhas : itens.concat(pag.linhas);
    fim = pag.fim; total = t;
  }

  // ---------------------------------------------------------------------
  // Formulário do processo
  // ---------------------------------------------------------------------
  // v0.9.1: processo e documentos numa só janela, em abas (Documentos só depois do 1º salvamento).
  function form(l, abaInicial) {
    l = l || {};
    const editando = !!l.id;
    const publicado = l.situacao === 'publicado';
    const travado = publicado && !perm.publicar;
    const doPncp = l.origem === 'pncp';
    const Y = new Date().getFullYear();
    const modsGrupo = editando ? Object.keys(MODALIDADES) : modalidadesDoGrupo();
    const f = {
      modalidade: el('select', null, el('option', { value: '' }, '— Escolha —'),
        modsGrupo.map((m) => el('option', { value: m, selected: l.modalidade === m }, MODALIDADES[m]))),
      numero: el('input', { type: 'text', maxlength: 30, value: l.numero || '', placeholder: 'Ex.: 012/2026' }),
      ano: el('input', { type: 'number', min: 1990, max: 2100, value: l.ano || ano || Y }),
      processo: el('input', { type: 'text', maxlength: 60, value: l.processo || '', placeholder: 'Nº do processo administrativo' }),
      objeto: el('textarea', { rows: 3, maxlength: 4000 }),
      srp: el('input', { type: 'checkbox', checked: !!l.srp }),
      criterio: el('input', { type: 'text', maxlength: 80, value: l.criterio || '', placeholder: 'Ex.: Menor preço por item' }),
      amparo: el('input', { type: 'text', maxlength: 200, value: l.amparo_legal || '', placeholder: 'Ex.: Lei 14.133/2021, art. 75, II' }),
      unidade: el('input', { type: 'text', maxlength: 150, value: l.unidade_nome || '', placeholder: 'Secretaria ou setor requisitante' }),
      estimado: el('input', { type: 'number', min: 0, step: '0.01', value: l.valor_estimado ?? '' }),
      homologado: el('input', { type: 'number', min: 0, step: '0.01', value: l.valor_homologado ?? '' }),
      publicacao: el('input', { type: 'date', value: l.data_publicacao || new Date().toISOString().slice(0, 10) }),
      abertura: el('input', { type: 'datetime-local', value: P.paraDataHoraLocal(l.data_abertura) }),
      andamento: el('select', null, Object.entries(ANDAMENTOS).map(([k, v]) => el('option', { value: k, selected: (l.andamento || 'em_andamento') === k }, v))),
      vencedores: el('textarea', { rows: 2, maxlength: 2000, placeholder: 'Ex.: Empresa X Ltda – R$ 12.300,00 (itens 1 a 5)' }),
      link: el('input', { type: 'url', value: l.link_externo || '', placeholder: 'https://…' })
    };
    f.objeto.value = l.objeto || ''; f.vencedores.value = l.vencedores || '';
    const rPortal = el('input', { type: 'radio', name: 'lc-origem', value: 'portal', checked: (l.origem || 'portal') === 'portal' });
    const rLink = el('input', { type: 'radio', name: 'lc-origem', value: 'link', checked: l.origem === 'link' });
    const bLink = campo('lc-link', doPncp ? 'Página no PNCP' : 'Link do processo no outro sistema', f.link,
      doPncp ? 'Vem do PNCP.' : 'Obrigatório quando os documentos ficam em outro sistema.');
    const ajustar = () => { bLink.hidden = !doPncp && !rLink.checked && !l.link_externo; if (rLink.checked) bLink.hidden = false; };
    rPortal.addEventListener('change', ajustar); rLink.addEventListener('change', ajustar);

    const corpo = el('form', { class: 'form-dialogo', novalidate: true },
      travado ? el('p', { class: 'msg msg-info' }, 'Este processo está publicado. Só quem tem permissão de publicar pode alterá-lo.') : null,
      doPncp ? el('p', { class: 'msg msg-info' }, 'Importado do PNCP. Uma nova importação atualiza modalidade, número, objeto, valores, datas, andamento e os arquivos do PNCP; '
        + 'o que você acrescentar aqui (vencedores, critério e documentos próprios) é mantido.') : null,
      doPncp ? null : el('fieldset', { class: 'opcoes' }, el('legend', null, 'Onde ficam os documentos'),
        el('label', { class: 'checkbox' }, rPortal, ' Neste portal (enviar os arquivos aqui)'),
        el('label', { class: 'checkbox' }, rLink, ' Em outro sistema (só link)')),
      el('div', { class: 'grade-campos' }, campo('lc-mod', 'Modalidade', f.modalidade, null, true), campo('lc-num', 'Número', f.numero), campo('lc-ano', 'Ano', f.ano, null, true)),
      campo('lc-obj', 'Objeto', f.objeto, 'Descreva o que será contratado, como no edital.', true),
      el('div', { class: 'grade-campos' }, campo('lc-proc', 'Processo administrativo', f.processo), campo('lc-un', 'Unidade requisitante', f.unidade)),
      el('div', { class: 'grade-campos' }, campo('lc-crit', 'Critério de julgamento', f.criterio), campo('lc-amp', 'Fundamento legal', f.amparo)),
      el('label', { class: 'checkbox' }, f.srp, ' Registro de preços (SRP)'),
      bLink);
    // Os campos acima vão para a 1ª aba; montamos as abas depois de criar tudo.
    const dadosProc = [...corpo.childNodes].filter((n) => !(n.classList && n.classList.contains('msg')));
    dadosProc.forEach((n) => n.remove());
    corpo.append(P.abas([
      ['processo', 'Dados do processo', dadosProc],
      ['valores', 'Valores e datas', [
        el('div', { class: 'grade-campos' }, campo('lc-pub', 'Data de publicação', f.publicacao, null, true), campo('lc-abe', 'Abertura / sessão pública', f.abertura),
          campo('lc-and', 'Andamento', f.andamento)),
        el('div', { class: 'grade-campos' }, campo('lc-est', 'Valor estimado (R$)', f.estimado), campo('lc-hom', 'Valor homologado / contratado (R$)', f.homologado)),
        campo('lc-ven', 'Vencedores / resultado', f.vencedores, 'Resumo do resultado. Os documentos completos vão na aba "Documentos".')]],
      editando ? ['documentos', 'Documentos', () => documentos(l)]
        : ['documentos', 'Documentos', null, 'Salve o processo primeiro: a aba de documentos abre logo em seguida.']
    ], abaInicial));
    ajustar();
    if (travado) for (const i of corpo.querySelectorAll('input, select, textarea')) i.disabled = true;

    const acoes = [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => dlg.close() }, travado ? 'Fechar' : 'Cancelar')];
    const btnR = el('button', { type: 'button', class: 'btn btn-claro' }, publicado ? 'Tirar do ar (rascunho)' : 'Salvar rascunho');
    const btnP = el('button', { type: 'button', class: 'btn btn-primario' }, publicado ? 'Salvar' : 'Publicar');
    if (!travado) { if (!publicado || perm.publicar) acoes.push(btnR); if (perm.publicar) acoes.push(btnP); }
    const dlg = P.abrirDialogo(editando ? 'Editar processo' : 'Novo processo', corpo, acoes);
    dlg.classList.add('dialogo-largo');

    async function salvar(situacao, btn) {
      if (!erroCampo('lc-mod', f.modalidade.value ? '' : 'Escolha a modalidade.')) return;
      const a = parseInt(f.ano.value, 10);
      if (!erroCampo('lc-ano', a >= 1990 && a <= 2100 ? '' : 'Ano inválido.')) return;
      if (!erroCampo('lc-obj', f.objeto.value.trim().length >= 5 ? '' : 'Descreva o objeto (pelo menos 5 letras).')) return;
      if (!erroCampo('lc-pub', f.publicacao.value ? '' : 'Informe a data.')) return;
      const origem = doPncp ? 'pncp' : rLink.checked ? 'link' : 'portal';
      const link = f.link.value.trim();
      if (!erroCampo('lc-link', origem === 'link' && !link ? 'Informe o link do processo.' : link && !P.urlValida(link) ? 'Endereço completo, começando com https://' : '')) return;
      const num = (x) => x.value === '' ? null : Number(x.value);
      if (!erroCampo('lc-est', num(f.estimado) === null || num(f.estimado) >= 0 ? '' : 'Valor inválido.')) return;
      const dados = {
        origem, modalidade: f.modalidade.value, numero: f.numero.value.trim() || null, ano: a, processo: f.processo.value.trim() || null,
        objeto: f.objeto.value.trim(), srp: f.srp.checked, criterio: f.criterio.value.trim() || null, amparo_legal: f.amparo.value.trim() || null,
        unidade_nome: f.unidade.value.trim() || null, valor_estimado: num(f.estimado), valor_homologado: num(f.homologado),
        data_publicacao: f.publicacao.value, data_abertura: f.abertura.value ? new Date(f.abertura.value).toISOString() : null,
        andamento: f.andamento.value, vencedores: f.vencedores.value.trim() || null, link_externo: link || null, situacao
      };
      ocupado(btn, 'Salvando…');
      try {
        const id = await P.gravarRegistro('licitacoes', dados, l.id);
        dlg.close();
        toast(situacao === 'publicado' ? 'Publicado.' : 'Rascunho salvo.');
        ano = a; await recarregar();
        // Processo novo: reabre a mesma janela já na aba Documentos, para anexar o edital.
        if (!editando) form(Object.assign({}, l, dados, { id }), 'documentos');
      } catch (e) { mostrarErro(e); }
      finally { ocupado(btn); }
    }
    btnR.addEventListener('click', () => salvar('rascunho', btnR));
    btnP.addEventListener('click', () => salvar('publicado', btnP));
  }

  // ---------------------------------------------------------------------
  // Documentos do processo (lista + envio de vários PDFs de uma vez).
  // Desde a v0.9.1 é o conteúdo da aba "Documentos" da janela do processo.
  // ---------------------------------------------------------------------
  function documentos(l) {
    const travado = l.situacao === 'publicado' && !perm.publicar;
    const pode = podeGravar() && !travado;
    const lista = el('div', null, el('p', { class: 'vazio' }, 'Carregando…'));
    const corpo = el('div', null,
      travado ? el('p', { class: 'msg msg-info' }, 'Processo publicado: só quem tem permissão de publicar altera os documentos.') : null,
      lista);

    async function atualizar() {
      const { data, error } = await sb.from('licitacoes_documentos').select('*').eq('licitacao_id', l.id).order('data').order('ordem').order('criado_em').limit(500);
      if (error) { lista.replaceChildren(el('p', { class: 'msg msg-erro' }, P.erroGravacao(error))); return; }
      const docs = data || [];
      lista.replaceChildren(
        docs.length ? el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela' },
          el('thead', null, el('tr', null, ['Documento', 'Data', 'Arquivo'].map((t) => el('th', { scope: 'col' }, t)), el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Ações')))),
          el('tbody', null, docs.map((d) => el('tr', null,
            el('td', { class: 'quebra' }, el('strong', null, d.titulo), el('span', { class: 'sub-linha' }, (TIPOS_DOC[d.tipo] || d.tipo) + (d.origem === 'pncp' ? ' · PNCP' : ''))),
            el('td', { class: 'num' }, P.dataBR(d.data)),
            el('td', null, el('a', { href: d.arquivo_url || d.link_externo, target: '_blank', rel: 'noopener' }, d.arquivo_url ? 'PDF' : 'Link')),
            el('td', { class: 'acoes' }, pode && d.origem !== 'pncp' ? el('button', { type: 'button', class: 'btn btn-claro btn-p btn-texto-perigo', onclick: () => apagar(d) }, 'Excluir') : null))))))
          : el('p', { class: 'vazio' }, l.origem === 'link' ? 'Os documentos deste processo ficam no outro sistema (link do processo). Pode anexar aqui também, se quiser.' : 'Nenhum documento ainda. Comece pelo edital (ou, na contratação direta, pelo termo de ratificação).'),
        pode ? novo() : null);
    }
    async function apagar(d) {
      if (!await P.confirmar('Excluir documento', 'Excluir "' + d.titulo + '"?', 'Excluir', true)) return;
      const { data, error } = await sb.from('licitacoes_documentos').delete().eq('id', d.id).select('id');
      if (error) return mostrarErro(error);
      if (!data || !data.length) return toast('Seu perfil não pode excluir este documento.', true);
      if (d.arquivo_url) P.apagarArquivo(d.arquivo_url);
      toast('Documento excluído.'); atualizar();
    }
    function novo() {
      const arq = el('input', { type: 'file', accept: 'application/pdf', multiple: true });
      const linhas = el('div', { class: 'lista-arquivos' });
      let partes = [];
      const selTipo = (padrao) => el('select', { 'aria-label': 'Tipo do documento' }, Object.entries(TIPOS_DOC).map(([k, v]) => el('option', { value: k, selected: k === padrao }, v)));
      const palpite = (nome) => /\betp\b|estudo.?t[eé]cnico/i.test(nome) ? 'estudo_tecnico' : /parecer/i.test(nome) ? 'parecer'
        : /justificativa/i.test(nome) ? 'justificativa' : /or[cç]amento|pesquisa.?de.?pre[cç]o|cota[cç][aã]o|mapa/i.test(nome) ? 'orcamento'
        : /emerg[eê]ncia|calamidade/i.test(nome) ? 'emergencia' : /edital/i.test(nome) ? 'edital' : /aviso/i.test(nome) ? 'aviso' : /termo.?de.?refer|^tr\b/i.test(nome) ? 'termo_referencia'
        : /\bata\b/i.test(nome) ? 'ata' : /homolog/i.test(nome) ? 'homologacao' : /adjudic/i.test(nome) ? 'adjudicacao' : /ratific/i.test(nome) ? 'ratificacao'
        : /result/i.test(nome) ? 'resultado' : /anexo/i.test(nome) ? 'anexo' : /esclarec/i.test(nome) ? 'esclarecimento' : /impugna/i.test(nome) ? 'impugnacao'
        : /contrato/i.test(nome) ? 'contrato' : 'outro';
      arq.addEventListener('change', () => {
        partes = [...arq.files].map((a) => {
          const nome = a.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();
          return { a, tipo: selTipo(palpite(nome)), titulo: el('input', { type: 'text', maxlength: 200, value: nome, 'aria-label': 'Título' }) };
        });
        linhas.replaceChildren(...partes.map((p) => el('div', { class: 'linha-arquivo linha-doc' }, p.tipo, p.titulo,
          el('span', { class: 'ajuda' }, (p.a.size / 1048576).toFixed(1).replace('.', ',') + ' MB'))));
      });
      const data = el('input', { type: 'date', value: new Date().toISOString().slice(0, 10) });
      const linkTit = el('input', { type: 'text', maxlength: 200, placeholder: 'Título' });
      const linkUrl = el('input', { type: 'url', placeholder: 'https://…', id: 'ld-link' });
      const linkTipo = selTipo('outro'); linkTipo.setAttribute('aria-label', 'Tipo do documento do link');
      const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Adicionar');
      btn.addEventListener('click', async () => {
        const arquivos = partes;
        const temLink = linkUrl.value.trim();
        if (!arquivos.length && !temLink) { erroCampo('ld-arq', 'Escolha um ou mais PDFs ou informe um link.'); return; }
        for (const p of arquivos) {
          if (p.a.type !== 'application/pdf') { erroCampo('ld-arq', '"' + p.a.name + '" não é PDF.'); return; }
          if (p.a.size > LIMITE_MB * 1048576) { erroCampo('ld-arq', '"' + p.a.name + '" passa de ' + LIMITE_MB + ' MB.'); return; }
          if (!p.titulo.value.trim()) { erroCampo('ld-arq', 'Dê um título a cada arquivo.'); return; }
        }
        if (temLink && (!P.urlValida(temLink) || !linkTit.value.trim())) { erroCampo('ld-link', 'Informe título e endereço completo (https://…).'); return; }
        erroCampo('ld-arq', ''); erroCampo('ld-link', '');
        ocupado(btn, 'Enviando…');
        try {
          for (let k = 0; k < arquivos.length; k++) {
            btn.textContent = 'Enviando ' + (k + 1) + ' de ' + arquivos.length + '…';
            const url = await P.enviarArquivo('licitacoes', arquivos[k].a, 'pdf', 'application/pdf');
            const { error } = await sb.from('licitacoes_documentos').insert({ licitacao_id: l.id, orgao_id: P.estado.orgao.id, tipo: arquivos[k].tipo.value,
              titulo: arquivos[k].titulo.value.trim(), data: data.value || null, arquivo_url: url, ordem: (k + 1) * 10 });
            if (error) { P.apagarArquivo(url); throw error; }
          }
          if (temLink) {
            const { error } = await sb.from('licitacoes_documentos').insert({ licitacao_id: l.id, orgao_id: P.estado.orgao.id, tipo: linkTipo.value,
              titulo: linkTit.value.trim(), data: data.value || null, link_externo: temLink });
            if (error) throw error;
          }
          toast('Documento(s) adicionado(s).'); atualizar();
        } catch (e) { mostrarErro(e); ocupado(btn); }
      });
      return el('fieldset', { class: 'opcoes' }, el('legend', null, 'Adicionar documentos'),
        campo('ld-data', 'Data do documento', data),
        campo('ld-arq', 'Arquivos PDF', arq, 'Pode escolher vários (edital e anexos de uma vez). Até ' + LIMITE_MB + ' MB cada. O tipo é sugerido pelo nome do arquivo.'),
        linhas,
        el('div', { class: 'campo' }, el('label', { for: 'ld-link' }, 'Ou um link (ex.: documento no sistema de outra empresa)'),
          el('div', { class: 'linha-arquivo linha-doc' }, linkTipo, linkTit, linkUrl), el('span', { class: 'erro-campo', id: 'ld-link-erro' })),
        el('div', { style: 'margin-top:10px' }, btn));
    }
    atualizar();
    return corpo;
  }

  // ---------------------------------------------------------------------
  // Importação do PNCP
  //   Consulta pela função "pncp" (ponte, por causa do CORS) e grava com o
  //   login de quem importa: as regras do banco valem normalmente.
  // ---------------------------------------------------------------------
  async function pncp(caminho) {
    const { data, error } = await sb.functions.invoke('pncp', { body: { orgao_id: P.estado.orgao.id, caminho } });
    if (error) {
      const st = error.context && error.context.status;
      if (st === 404 || /Failed to send a request|not found/i.test(error.message)) throw P.amigavel('A função "pncp" ainda não foi instalada na Supabase. Siga o passo "Função pncp" do README.');
      throw error;
    }
    if (!data || !data.ok) throw P.amigavel((data && data.erro) || 'Falha na consulta ao PNCP.');
    return data.dados;
  }
  const aaaammdd = (d) => d.replace(/-/g, '');
  function mapear(c, cnpj) {
    const sit = c.situacaoCompraId;
    const enc = c.dataEncerramentoProposta ? new Date(c.dataEncerramentoProposta) : null;
    const andamento = sit === 2 ? 'revogada' : sit === 3 ? 'anulada' : sit === 4 ? 'suspensa'
      : Number(c.valorTotalHomologado) > 0 ? 'homologada' : enc && enc > new Date() ? 'aberta' : 'em_andamento';
    return {
      orgao_id: P.estado.orgao.id, origem: 'pncp', pncp_controle: c.numeroControlePNCP,
      modalidade: PNCP_MOD[c.modalidadeId] || 'outra',
      numero: c.numeroCompra ? String(c.numeroCompra) + (String(c.numeroCompra).includes('/') ? '' : '/' + c.anoCompra) : null,
      ano: c.anoCompra, processo: c.processo || null, objeto: (c.objetoCompra || 'Objeto não informado no PNCP').slice(0, 4000), srp: !!c.srp,
      amparo_legal: c.amparoLegal ? (c.amparoLegal.nome || c.amparoLegal.descricao || null) : null,
      unidade_nome: c.unidadeOrgao ? c.unidadeOrgao.nomeUnidade || null : null,
      valor_estimado: c.valorTotalEstimado ?? null, valor_homologado: Number(c.valorTotalHomologado) > 0 ? c.valorTotalHomologado : null,
      data_publicacao: (c.dataPublicacaoPncp || c.dataInclusao || new Date().toISOString()).slice(0, 10),
      data_abertura: c.dataAberturaProposta ? new Date(c.dataAberturaProposta).toISOString() : null,
      andamento,
      link_externo: 'https://pncp.gov.br/app/editais/' + cnpj + '/' + c.anoCompra + '/' + c.sequencialCompra,
      pncp_atualizado: c.dataAtualizacao ? new Date(c.dataAtualizacao).toISOString() : null
    };
  }
  const tipoDocPncp = (n) => { n = n || ''; return /estudo t[eé]cnico/i.test(n) ? 'estudo_tecnico' : /parecer/i.test(n) ? 'parecer' : /aviso/i.test(n) ? 'aviso' : /edital/i.test(n) ? 'edital' : /termo de refer|projeto b/i.test(n) ? 'termo_referencia'
    : /ata/i.test(n) ? 'ata' : /contrato/i.test(n) ? 'contrato' : /anexo/i.test(n) ? 'anexo' : /homolog/i.test(n) ? 'homologacao' : /ratific/i.test(n) ? 'ratificacao' : 'outro'; };

  function importar() {
    const cfg = P.estado.orgao.configuracoes || {};
    const cnpjOrgao = (P.estado.orgao.cnpj || '').replace(/\D/g, '');
    const Y = new Date().getFullYear();
    const f = {
      cnpjs: el('input', { type: 'text', value: (Array.isArray(cfg.pncp_cnpjs) && cfg.pncp_cnpjs.length ? cfg.pncp_cnpjs : [cnpjOrgao]).join(', ') }),
      inicio: el('input', { type: 'date', value: Y + '-01-01' }),
      fim: el('input', { type: 'date', value: new Date().toISOString().slice(0, 10) }),
      publicar: el('input', { type: 'checkbox', checked: !!perm.publicar, disabled: !perm.publicar }),
      arquivos: el('input', { type: 'checkbox', checked: true })
    };
    const progresso = el('div', { class: 'progresso-importacao', role: 'status', 'aria-live': 'polite' });
    const corpo = el('form', { class: 'form-dialogo', novalidate: true },
      el('p', { class: 'ajuda' }, 'Busca no Portal Nacional de Contratações Públicas as licitações, dispensas e inexigibilidades publicadas no período, de todas as modalidades. '
        + 'Processos já importados são atualizados; não cria repetidos. Os arquivos ficam como links para o PNCP (não ocupam espaço aqui).'),
      campo('pn-cnpj', 'CNPJ(s) no PNCP', f.cnpjs, 'Separe por vírgula. Inclua os fundos com CNPJ próprio (ex.: Fundo Municipal de Saúde), se publicarem no PNCP.', true),
      el('div', { class: 'grade-campos' }, campo('pn-ini', 'De', f.inicio, null, true), campo('pn-fim', 'Até', f.fim, null, true)),
      el('label', { class: 'checkbox' }, f.publicar, ' Publicar no site os processos novos (sem marcar, entram como rascunho para revisão)'),
      el('label', { class: 'checkbox' }, f.arquivos, ' Trazer a lista de arquivos de cada processo (mais demorado)'),
      progresso,
      automatico());
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Importar');
    const dlg = P.abrirDialogo('Importar do PNCP', corpo, [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => dlg.close() }, 'Fechar'), btn]);
    dlg.classList.add('dialogo-largo');

    btn.addEventListener('click', async () => {
      const cnpjs = [...new Set(f.cnpjs.value.split(/[,;\s]+/).map((x) => x.replace(/\D/g, '')).filter(Boolean))];
      if (!erroCampo('pn-cnpj', !cnpjs.length ? 'Informe o CNPJ.' : (cnpjs.map((x) => P.erroDoc(x, 'cnpj')).find(Boolean) || ''))) return;
      if (!erroCampo('pn-ini', f.inicio.value ? '' : 'Informe a data inicial.')) return;
      if (!erroCampo('pn-fim', f.fim.value && f.fim.value >= f.inicio.value ? '' : 'A data final deve ser igual ou depois da inicial.')) return;
      ocupado(btn, 'Importando…');
      const linha = (t) => progresso.append(el('p', null, t));
      progresso.replaceChildren();
      let novos = 0, atualizados = 0, iguais = 0, docs = 0;
      try {
        // Guarda os CNPJs escolhidos para a próxima importação (se tiver permissão em Aparência; se não, segue).
        if (cnpjs.join() !== (cfg.pncp_cnpjs || []).join()) {
          const novaCfg = Object.assign({}, cfg, { pncp_cnpjs: cnpjs });
          const r = await sb.from('orgaos').update({ configuracoes: novaCfg }).eq('id', P.estado.orgao.id).select('id');
          if (!r.error && r.data && r.data.length) P.estado.orgao.configuracoes = novaCfg;
        }
        // Período em janelas de até 1 ano (o PNCP limita consultas longas).
        const janelas = [];
        for (let d = new Date(f.inicio.value + 'T12:00:00'); d <= new Date(f.fim.value + 'T12:00:00');) {
          const ate = new Date(Math.min(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 364, 12).getTime(), new Date(f.fim.value + 'T12:00:00').getTime()));
          janelas.push([d.toISOString().slice(0, 10), ate.toISOString().slice(0, 10)]);
          d = new Date(ate.getFullYear(), ate.getMonth(), ate.getDate() + 1, 12);
        }
        const achados = [];
        for (const cnpj of cnpjs) for (const [de, ate] of janelas) for (const cod of Object.keys(PNCP_MOD)) {
          btn.textContent = 'Consultando ' + MODALIDADES[PNCP_MOD[cod]].toLowerCase() + '…';
          for (let pg = 1; pg <= 200; pg++) {
            const r = await pncp('/api/consulta/v1/contratacoes/publicacao?dataInicial=' + aaaammdd(de) + '&dataFinal=' + aaaammdd(ate)
              + '&codigoModalidadeContratacao=' + cod + '&cnpj=' + cnpj + '&pagina=' + pg + '&tamanhoPagina=50');
            const lista = (r && r.data) || [];
            for (const c of lista) achados.push({ c, cnpj: (c.orgaoEntidade && c.orgaoEntidade.cnpj) || cnpj });
            if (!r || !r.paginasRestantes || !lista.length) break;
          }
        }
        linha(achados.length + (achados.length === 1 ? ' processo encontrado no PNCP.' : ' processos encontrados no PNCP.'));
        // Quais já existem (em blocos de 100 identificadores).
        const existentes = new Map();
        const controles = achados.map((x) => x.c.numeroControlePNCP);
        for (let i = 0; i < controles.length; i += 100) {
          const { data, error } = await sb.from('licitacoes').select('id, pncp_controle, pncp_atualizado, situacao').eq('orgao_id', P.estado.orgao.id).in('pncp_controle', controles.slice(i, i + 100));
          if (error) throw error;
          for (const x of data || []) existentes.set(x.pncp_controle, x);
        }
        const novosReg = [], mudados = [];
        for (const { c, cnpj } of achados) {
          const reg = mapear(c, cnpj);
          const ex = existentes.get(reg.pncp_controle);
          if (!ex) novosReg.push(Object.assign(reg, { situacao: f.publicar.checked ? 'publicado' : 'rascunho' }));
          else if (!ex.pncp_atualizado || !reg.pncp_atualizado || new Date(reg.pncp_atualizado) > new Date(ex.pncp_atualizado)) mudados.push({ reg, ex });
          else iguais++;
        }
        // Gravação em lotes de 50 (nunca um a um em sequência para os novos).
        btn.textContent = 'Gravando…';
        const comArquivos = [];
        for (let i = 0; i < novosReg.length; i += 50) {
          const { data, error } = await sb.from('licitacoes').insert(novosReg.slice(i, i + 50)).select('id, pncp_controle, situacao');
          if (error) throw error;
          novos += data.length;
          for (const x of data) comArquivos.push(x);
        }
        // Existentes: atualiza só os campos do PNCP (situação e campos próprios ficam como estão).
        for (let i = 0; i < mudados.length; i += 50) {
          const bloco = mudados.slice(i, i + 50).map(({ reg }) => reg);
          const { data, error } = await sb.from('licitacoes').upsert(bloco, { onConflict: 'orgao_id,pncp_controle' }).select('id, pncp_controle, situacao');
          if (error) throw error;
          atualizados += data.length;
          for (const x of data) comArquivos.push(x);
        }
        linha(novos + ' novo(s), ' + atualizados + ' atualizado(s), ' + iguais + ' sem mudança.');
        // Arquivos: só dos processos novos ou alterados; os do PNCP são trocados pela lista atual.
        if (f.arquivos.checked && comArquivos.length) {
          const porControle = new Map(achados.map((x) => [x.c.numeroControlePNCP, x]));
          let k = 0;
          for (const x of comArquivos) {
            btn.textContent = 'Arquivos ' + (++k) + ' de ' + comArquivos.length + '…';
            const a = porControle.get(x.pncp_controle);
            if (!a) continue;
            let lista = null;
            try { lista = await pncp('/api/pncp/v1/orgaos/' + a.cnpj + '/compras/' + a.c.anoCompra + '/' + a.c.sequencialCompra + '/arquivos'); }
            catch (_) { continue; }   // um processo sem resposta não derruba a importação inteira
            const ativos = (Array.isArray(lista) ? lista : []).filter((d) => d.statusAtivo !== false && (d.url || d.uri));
            const del = await sb.from('licitacoes_documentos').delete().eq('licitacao_id', x.id).eq('origem', 'pncp');
            if (del.error) throw del.error;
            if (!ativos.length) continue;
            const regs = ativos.map((d, n) => ({ licitacao_id: x.id, orgao_id: P.estado.orgao.id, origem: 'pncp', tipo: tipoDocPncp(d.tipoDocumentoNome || d.titulo),
              titulo: String(d.titulo || d.tipoDocumentoNome || 'Documento').slice(0, 200).padEnd(2, ' '),
              data: (d.dataPublicacaoPncp || new Date().toISOString()).slice(0, 10), link_externo: d.url || d.uri, ordem: (n + 1) * 10 }));
            const ins = await sb.from('licitacoes_documentos').insert(regs);
            if (ins.error) throw ins.error;
            docs += regs.length;
          }
          linha(docs + ' arquivo(s) vinculados.');
        }
        toast('Importação concluída.');
        await recarregar();
      } catch (e) {
        linha('Parou com erro: ' + P.erroGravacao(e) + (novos || atualizados ? ' (o que já foi gravado fica salvo; rode de novo para continuar).' : ''));
        mostrarErro(e);
      } finally { ocupado(btn); btn.textContent = 'Importar de novo'; }
    });
  }

  // Importação automática: o banco chama a função "pncp-sincronizar" todo dia de
  // madrugada (script 13). Aqui só liga/desliga e mostra a última execução.
  function situacaoAuto() {
    const cfg = P.estado.orgao.configuracoes || {};
    if (!cfg.pncp_auto) return null;
    const s = cfg.pncp_sinc;
    return 'Importação automática do PNCP ligada (todo dia de madrugada)' + (s && s.quando
      ? ' · última: ' + P.dataHoraBR(s.quando) + (s.erro ? ' — falhou: ' + s.erro + ' (tenta de novo na próxima noite)' : ' — ' + (s.novos || 0) + ' novo(s), ' + (s.atualizados || 0) + ' atualizado(s)')
      : ' · ainda não rodou.');
  }
  function automatico() {
    const cfg = P.estado.orgao.configuracoes || {};
    const auto = el('input', { type: 'checkbox', checked: !!cfg.pncp_auto });
    const pub = el('input', { type: 'checkbox', checked: !!cfg.pncp_publicar_auto, disabled: !perm.publicar });
    const info = el('p', { class: 'ajuda' }, situacaoAuto() || 'Desligada.');
    const btn = el('button', { type: 'button', class: 'btn btn-claro' }, 'Salvar importação automática');
    btn.addEventListener('click', async () => {
      const cnpjs = [...new Set(document.getElementById('pn-cnpj').value.split(/[,;\s]+/).map((x) => x.replace(/\D/g, '')).filter(Boolean))];
      if (auto.checked && !erroCampo('pn-cnpj', !cnpjs.length ? 'Informe o CNPJ.' : (cnpjs.map((x) => P.erroDoc(x, 'cnpj')).find(Boolean) || ''))) return;
      ocupado(btn, 'Salvando…');
      try {
        const { error } = await sb.rpc('definir_pncp_automatico', { p_orgao: P.estado.orgao.id, p_auto: auto.checked, p_publicar: pub.checked, p_cnpjs: cnpjs });
        if (error) throw error;
        Object.assign(P.estado.orgao.configuracoes = P.estado.orgao.configuracoes || {}, { pncp_auto: auto.checked, pncp_publicar_auto: pub.checked, pncp_cnpjs: cnpjs });
        info.textContent = situacaoAuto() || 'Desligada.';
        toast(auto.checked ? 'Importação automática ligada.' : 'Importação automática desligada.');
        desenhar();
      } catch (e) { toast(/function .*definir_pncp_automatico|Could not find/i.test(e.message || '') ? 'Falta rodar o script 13 no banco.' : P.erroGravacao(e), true); }
      finally { ocupado(btn); }
    });
    return el('fieldset', { class: 'opcoes', style: 'margin-top:14px' }, el('legend', null, 'Importação automática'),
      el('label', { class: 'checkbox' }, auto, ' Buscar no PNCP todo dia de madrugada as licitações e os contratos, sem ninguém precisar clicar'),
      el('label', { class: 'checkbox' }, pub, ' Publicar no site os processos novos automaticamente (sem marcar, entram como rascunho)'),
      el('p', { class: 'ajuda' }, 'Usa os CNPJs informados acima. Cada noite busca o que foi publicado ou alterado desde a última vez (na primeira, os últimos 120 dias). '
        + 'Para períodos mais antigos, use "Importar" com as datas.'),
      info, btn);
  }

  async function excluir(l) {
    const { data: ds } = await sb.from('licitacoes_documentos').select('arquivo_url').eq('licitacao_id', l.id).not('arquivo_url', 'is', null).limit(500);
    const qtd = (ds || []).length;
    if (!await P.confirmar('Excluir processo', 'Excluir "' + rotuloProcesso(l) + '"' + (qtd ? ' e os ' + qtd + ' arquivo(s) enviados?' : '?')
      + ' O PNTP exige manter o histórico das licitações; prefira mudar o andamento (ex.: revogada).', 'Excluir', true)) return;
    const { data, error } = await sb.from('licitacoes').delete().eq('id', l.id).select('id');
    if (error) return mostrarErro(error);
    if (!data || !data.length) return toast('Seu perfil não pode excluir este processo.', true);
    for (const d of ds || []) P.apagarArquivo(d.arquivo_url);
    toast('Processo excluído.'); await recarregar();
  }

  // ---------------------------------------------------------------------
  // Tela
  // ---------------------------------------------------------------------
  function desenhar() {
    const botaoGrupo = (id, rot) => el('button', { type: 'button', role: 'tab', class: 'aba', 'aria-selected': grupo === id ? 'true' : 'false',
      onclick: async () => { if (grupo === id) return; grupo = id; ano = null; filtros.modalidade = ''; await recarregar(); } }, rot);
    const botaoAno = (x) => el('button', { type: 'button', role: 'tab', class: 'aba aba-p', 'aria-selected': ano === x.ano ? 'true' : 'false',
      onclick: async () => { if (ano === x.ano) return; ano = x.ano; await recarregarLista(); } }, String(x.ano), el('span', { class: 'aba-qtd' }, String(x.total)));

    const fBusca = el('input', { type: 'search', placeholder: 'Objeto, número, processo, vencedor', value: filtros.busca, 'aria-label': 'Buscar' });
    const fMod = el('select', { 'aria-label': 'Modalidade' }, el('option', { value: '' }, 'Modalidade: todas'),
      modalidadesDoGrupo().map((m) => el('option', { value: m, selected: filtros.modalidade === m }, MODALIDADES[m])));
    const fAnd = el('select', { 'aria-label': 'Andamento' }, el('option', { value: '' }, 'Andamento: todos'),
      Object.entries(ANDAMENTOS).map(([k, v]) => el('option', { value: k, selected: filtros.andamento === k }, v)));
    const fOri = el('select', { 'aria-label': 'Origem' }, el('option', { value: '' }, 'Origem: todas'),
      [['portal', 'Cadastrado no portal'], ['link', 'Link externo'], ['pncp', 'Importado do PNCP']].map(([k, v]) => el('option', { value: k, selected: filtros.origem === k }, v)));
    const fSit = el('select', { 'aria-label': 'Situação' }, el('option', { value: '' }, 'Situação: todas'),
      el('option', { value: 'publicado', selected: filtros.situacao === 'publicado' }, 'No ar'), el('option', { value: 'rascunho', selected: filtros.situacao === 'rascunho' }, 'Rascunho'));
    const lista = el('div');
    const aplicar = () => {
      Object.assign(filtros, { busca: fBusca.value.trim(), modalidade: fMod.value, andamento: fAnd.value, origem: fOri.value, situacao: fSit.value });
      lista.replaceChildren(el('p', { class: 'vazio' }, 'Carregando…'));
      carregar(true).then(desenharLista).catch(mostrarErro);
    };
    [fMod, fAnd, fOri, fSit].forEach((x) => x.addEventListener('change', aplicar));
    let espera; fBusca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(aplicar, 400); });

    function desenharLista() {
      if (!itens.length) { lista.replaceChildren((decl && decl.aviso(ano)) || el('p', { class: 'vazio' }, Object.values(filtros).some(Boolean) ? 'Nenhum processo com esses filtros.' : 'Nenhum processo neste ano.')); return; }
      const btnMais = el('button', { type: 'button', class: 'btn btn-claro' }, 'Carregar mais');
      btnMais.addEventListener('click', async () => { ocupado(btnMais, 'Carregando…'); try { await carregar(false); desenharLista(); } catch (e) { mostrarErro(e); ocupado(btnMais); } });
      lista.replaceChildren(
        el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela tabela-lic' },
          el('thead', null, el('tr', null, ['Processo', 'Publicação', 'Andamento', 'Valor', 'Origem', 'Situação'].map((t) => el('th', { scope: 'col' }, t)), el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Ações')))),
          el('tbody', null, itens.map((l) => el('tr', null,
            el('td', { class: 'quebra' }, el('strong', null, rotuloProcesso(l)), el('span', { class: 'sub-linha' }, l.objeto.length > 160 ? l.objeto.slice(0, 160) + '…' : l.objeto)),
            el('td', { class: 'num' }, P.dataBR(l.data_publicacao)),
            el('td', null, el('span', { class: 'etiqueta etiqueta-' + (COR_ANDAMENTO[l.andamento] || 'rascunho') }, ANDAMENTOS[l.andamento] || l.andamento)),
            el('td', { class: 'num' }, moeda(l.valor_homologado ?? l.valor_estimado)),
            el('td', null, l.origem === 'pncp' ? 'PNCP' : l.origem === 'link' ? el('a', { href: l.link_externo, target: '_blank', rel: 'noopener' }, 'Link') : 'Portal'),
            el('td', null, el('span', { class: 'etiqueta etiqueta-' + (l.situacao === 'publicado' ? 'publicado' : 'rascunho') }, l.situacao === 'publicado' ? 'No ar' : 'Rascunho')),
            el('td', { class: 'acoes' },
              el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => form(l, 'documentos') }, 'Documentos'),
              podeGravar() ? el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => form(l) }, l.situacao === 'publicado' && !perm.publicar ? 'Ver' : 'Editar') : null,
              perm.excluir && podeGravar() ? el('button', { type: 'button', class: 'btn btn-claro btn-p btn-texto-perigo', onclick: () => excluir(l) }, 'Excluir') : null)))))),
        el('div', { class: 'rodape-lista' }, el('span', { class: 'ajuda' }, 'Mostrando ' + itens.length + ' de ' + total), fim ? '' : btnMais));
    }

    const ext = (P.estado.orgao.configuracoes || {}).licitacoes_url;
    conteiner.replaceChildren(...[
      el('div', { class: 'cabecalho-modulo' },
        el('div', null, el('h1', null, 'Licitações'),
          el('p', { class: 'sub' }, 'Licitações, dispensas, inexigibilidades e adesões a atas, com os documentos de cada fase (PNTP 8.1 a 8.5).')),
        podeGravar() ? el('div', { class: 'botoes-cabecalho' },
          el('button', { type: 'button', class: 'btn btn-claro', onclick: importar }, 'Importar do PNCP'),
          el('button', { type: 'button', class: 'btn btn-primario', onclick: () => form() }, '+ Novo processo')) : null),
      P.estado.alcanceUnidade && perm.editar ? el('p', { class: 'msg msg-info' }, 'Licitações são do órgão todo: só quem tem acesso ao órgão inteiro altera.') : null,
      situacaoAuto() ? el('p', { class: 'msg msg-info' }, situacaoAuto()) : null,
      ext ? el('p', { class: 'ajuda' }, 'Sistema externo de licitações informado em Aparência: ', el('a', { href: ext, target: '_blank', rel: 'noopener' }, ext), '. O site mostra os processos daqui e um link para ele.') : null,
      el('div', { class: 'abas', role: 'tablist', 'aria-label': 'Tipo de processo' }, GRUPOS.map(([id, rot]) => botaoGrupo(id, rot))),
      el('div', { class: 'painel-guia' },
        CHAVES_DECL[grupo] ? P.declaracoes(CHAVES_DECL[grupo], { perm, aoMudar: recarregar })
          : el('p', { class: 'ajuda' }, 'Para declarar que não houve licitações, dispensas ou adesões num período, use a aba do tipo de processo.'),
        anos.length ? el('div', { class: 'abas abas-internas', role: 'tablist', 'aria-label': 'Ano' }, anos.map(botaoAno)) : null,
        anos.length ? el('div', { class: 'painel-guia painel-guia-interno' },
          el('div', { class: 'filtros filtros-5' }, fBusca, fMod, fAnd, fOri, fSit), lista)
          : el('p', { class: 'vazio' }, 'Nenhum processo cadastrado neste grupo. Use "+ Novo processo" ou "Importar do PNCP".'))
    ].filter(Boolean));
    if (anos.length) desenharLista();
  }

  async function recarregarLista() {
    try { await carregar(true); desenhar(); } catch (e) { mostrarErro(e); }
  }
  async function recarregar() {
    try { await carregarAnos(); await carregar(true); desenhar(); } catch (e) { mostrarErro(e); }
  }

  P.telas.licitacoes = async function (c, mod, p) {
    perm = p; conteiner = c;
    c.replaceChildren(el('h1', null, 'Licitações'), el('p', { class: 'sub' }, 'Carregando…'));
    try {
      const o = await sb.from('orgaos').select('cnpj, configuracoes').eq('id', P.estado.orgao.id).maybeSingle();
      if (o.data) { P.estado.orgao.cnpj = o.data.cnpj; P.estado.orgao.configuracoes = o.data.configuracoes || {}; }
      await carregarAnos(); await carregar(true); desenhar();
    } catch (e) { c.querySelector('.sub').textContent = P.erroGravacao(e); }
  };
})();
