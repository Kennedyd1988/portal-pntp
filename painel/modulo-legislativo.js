// =====================================================================
// Módulo "Atividade legislativa" (Câmara Municipal) — PNTP 2026, matriz do
// Poder Legislativo (dimensão 20). Abas:
//   Vereadores ........ 20.1 composição e biografias
//   Proposições ....... 20.3 projetos, autoria, relatoria e tramitação (20.11 vem daqui)
//   Sessões ........... 20.4 pauta do Plenário, 20.6 ata e presenças, 20.7 votações, 20.9 vídeo
//   Comissões ......... 20.5 composição e (pelas reuniões em Sessões) pautas
//   Verba indenizatória 20.10 regulamentação e valores
//   Transmissão ....... 20.9 canal das sessões
// Leis, resoluções e decretos legislativos (20.2) ficam em Publicações oficiais;
// o julgamento das contas do Prefeito (20.8) em Planejamento e contas.
// =====================================================================
(function () {
  'use strict';
  const P = window.PNTP;
  const { sb, el, toast, ocupado, erroCampo, campo } = P;
  const LIMITE_MB = 200;
  const TIPOS_PROP = { projeto_lei: 'Projeto de Lei', projeto_lei_complementar: 'Projeto de Lei Complementar', projeto_emenda_lei_organica: 'Proposta de Emenda à Lei Orgânica',
    projeto_resolucao: 'Projeto de Resolução', projeto_decreto_legislativo: 'Projeto de Decreto Legislativo', requerimento: 'Requerimento', indicacao: 'Indicação',
    mocao: 'Moção', veto: 'Veto', emenda: 'Emenda', outro: 'Outra proposição' };
  const INICIATIVA_PROP = { legislativo: 'Legislativo (vereadores, Mesa, comissões)', executivo: 'Executivo (Prefeito)', popular: 'Popular', outra: 'Outra' };
  const ANDAMENTO_PROP = { em_tramitacao: 'Em tramitação', aprovada: 'Aprovada', rejeitada: 'Rejeitada', arquivada: 'Arquivada', retirada: 'Retirada',
    vetada: 'Vetada', transformada_norma: 'Transformada em norma', prejudicada: 'Prejudicada' };
  const TIPOS_SESSAO = { ordinaria: 'Sessão ordinária', extraordinaria: 'Sessão extraordinária', solene: 'Sessão solene', especial: 'Sessão especial',
    audiencia_publica: 'Audiência pública', reuniao: 'Reunião de comissão' };
  const ANDAMENTO_SESSAO = { prevista: 'Prevista', realizada: 'Realizada', cancelada: 'Cancelada', adiada: 'Adiada' };
  const TIPOS_COMISSAO = { permanente: 'Permanente', temporaria: 'Temporária', especial: 'Especial', cpi: 'Comissão Parlamentar de Inquérito', outra: 'Outra' };
  const FUNCOES = { presidente: 'Presidente', vice_presidente: 'Vice-presidente', relator: 'Relator', membro: 'Membro', suplente: 'Suplente' };
  const PAPEIS = { autor: 'Autor', coautor: 'Coautor', relator: 'Relator' };
  const VOTOS = { sim: 'Sim', nao: 'Não', abstencao: 'Abstenção', ausente: 'Ausente', nao_votou: 'Não votou (presidente)' };

  let perm = {}, conteiner = null, cfg = {};
  let parlamentares = [], comissoes = [];
  const org = () => P.estado.orgao.id;
  const podeGravar = () => perm.editar && !P.estado.alcanceUnidade;
  const opcoes = (obj, atual, vazio) => [vazio != null ? el('option', { value: '' }, vazio) : null]
    .concat(Object.entries(obj).map(([k, v]) => el('option', { value: k, selected: atual === k }, v))).filter(Boolean);
  const nomeParl = (p) => p ? (p.nome_parlamentar || p.nome) + (p.partido ? ' (' + p.partido + ')' : '') : '—';
  const parlPorId = (id) => parlamentares.find((p) => p.id === id);
  const etiquetaSit = (s) => el('span', { class: 'etiqueta etiqueta-' + (s === 'publicado' ? 'publicado' : 'rascunho') }, s === 'publicado' ? 'No ar' : 'Rascunho');
  const mostrarErro = (e) => toast(P.erroGravacao(e), true);
  const hoje = () => new Date().toISOString().slice(0, 10);

  async function carregarBase() {
    const [p, c, o] = await Promise.all([
      sb.from('parlamentares').select('*').eq('orgao_id', org()).order('em_exercicio', { ascending: false }).order('ordem').order('nome'),
      sb.from('comissoes').select('*').eq('orgao_id', org()).order('ativa', { ascending: false }).order('nome'),
      sb.from('orgaos').select('configuracoes').eq('id', org()).maybeSingle()
    ]);
    if (p.error) throw p.error;
    if (c.error) throw c.error;
    parlamentares = p.data || []; comissoes = c.data || []; cfg = (o.data && o.data.configuracoes) || {};
  }

  // PDF ou link num mesmo campo: devolve o endereço (enviando o PDF, se houver).
  function campoArquivo(id, rotulo, atual, ajuda) {
    const pdf = el('input', { type: 'file', accept: 'application/pdf' });
    const link = el('input', { type: 'url', placeholder: 'https://… (ou envie o PDF)', value: atual || '' });
    const caixa = el('div', null, el('div', { class: 'grade-campos' }, campo(id + '-pdf', rotulo + ' (PDF)', pdf, ajuda || 'Até ' + LIMITE_MB + ' MB.'), campo(id, 'ou endereço', link)),
      atual ? el('p', { class: 'ajuda' }, 'Atual: ', el('a', { href: atual, target: '_blank', rel: 'noopener' }, 'abrir')) : null);
    return {
      caixa,
      validar() {
        const arq = pdf.files[0], l = link.value.trim();
        if (arq && (arq.type !== 'application/pdf' || arq.size > LIMITE_MB * 1048576)) return erroCampo(id + '-pdf', 'Envie um PDF de até ' + LIMITE_MB + ' MB.');
        erroCampo(id + '-pdf', '');
        return erroCampo(id, l && !P.urlValida(l) ? 'Endereço completo, começando com https://' : '');
      },
      async valor() { const arq = pdf.files[0]; return arq ? P.enviarArquivo('legislativo', arq, 'pdf', 'application/pdf') : (link.value.trim() || null); }
    };
  }

  // Botões padrão de gravação (rascunho / publicar), como nas outras telas.
  function acoesGravar(dlg, registro, salvar) {
    const publicado = registro.situacao === 'publicado', travado = publicado && !perm.publicar;
    const acoes = [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => dlg.fechar() }, travado ? 'Fechar' : 'Cancelar')];
    const btnR = el('button', { type: 'button', class: 'btn btn-claro' }, publicado ? 'Tirar do ar (rascunho)' : 'Salvar rascunho');
    const btnP = el('button', { type: 'button', class: 'btn btn-primario' }, publicado ? 'Salvar' : 'Publicar');
    btnR.addEventListener('click', () => salvar('rascunho', btnR));
    btnP.addEventListener('click', () => salvar('publicado', btnP));
    if (!travado && podeGravar()) { if (!publicado || perm.publicar) acoes.push(btnR); if (perm.publicar) acoes.push(btnP); }
    return { acoes, travado };
  }
  function dialogo(titulo, corpo, montarAcoes) {
    const ref = { fechar: () => d.close() };
    const r = montarAcoes(ref);
    if (r.travado) for (const i of corpo.querySelectorAll('input, select, textarea')) i.disabled = true;
    const d = P.abrirDialogo(titulo, el('form', { class: 'form-dialogo', novalidate: true }, r.travado ? el('p', { class: 'msg msg-info' }, 'Registro publicado: só quem tem permissão de publicar pode alterá-lo.') : null, corpo), r.acoes);
    d.classList.add('dialogo-largo');
    return d;
  }
  const PECAS_LEG = { proposicoes: 'os autores e a tramitação', sessoes: 'as presenças e as votações', comissoes: 'os membros', votacoes: 'os votos' };
  async function excluirRegistro(tabela, id, nome, arquivos) {
    if (!await P.confirmar('Excluir', 'Excluir "' + nome + '"' + (PECAS_LEG[tabela] ? ' com ' + PECAS_LEG[tabela] : '') + '? Registros de outras partes ligados a ele (ex.: vereador com proposições ou votos) impedem a exclusão.', 'Excluir', true)) return false;
    const { data, error } = PECAS_LEG[tabela] ? await P.excluirComPecas(tabela, id) : await sb.from(tabela).delete().eq('id', id).select('id');
    if (error) { mostrarErro(error); return false; }
    if (!data || !data.length) { toast('Seu perfil não pode excluir este registro.', true); return false; }
    for (const a of arquivos || []) P.apagarArquivo(a);
    toast('Excluído.'); return true;
  }
  const tabela = (cab, linhas) => el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela' },
    el('thead', null, el('tr', null, cab.map((h) => el('th', { scope: 'col' }, h)), el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Ações')))),
    el('tbody', null, linhas)));
  const botao = (rotulo, fn, perigo) => el('button', { type: 'button', class: 'btn btn-claro btn-p' + (perigo ? ' btn-texto-perigo' : ''), onclick: fn }, rotulo);

  // ===================================================================
  // VEREADORES (20.1)
  // ===================================================================
  function abaVereadores() {
    const caixa = el('div');
    function desenhar() {
      caixa.replaceChildren(
        el('p', { class: 'ajuda' }, 'Composição da Casa com foto, partido e biografia de cada vereador (PNTP 20.1). Ex-vereadores ficam no histórico: desmarque "Em exercício".'),
        podeGravar() ? el('p', null, el('button', { type: 'button', class: 'btn btn-primario', onclick: () => formVereador() }, '+ Novo vereador')) : null,
        parlamentares.length ? tabela(['Vereador', 'Partido', 'Mesa', 'Legislatura', 'Situação'], parlamentares.map((p) => el('tr', null,
          el('td', null, el('strong', null, p.nome_parlamentar || p.nome), p.nome_parlamentar ? el('span', { class: 'sub-linha' }, p.nome) : null,
            p.em_exercicio ? null : el('span', { class: 'sub-linha' }, 'Fora de exercício')),
          el('td', null, p.partido || '—'), el('td', null, p.cargo_mesa || '—'),
          el('td', { class: 'num' }, p.legislatura_inicio ? p.legislatura_inicio + '–' + (p.legislatura_fim || '') : '—'),
          el('td', null, etiquetaSit(p.situacao)),
          el('td', { class: 'acoes' }, podeGravar() ? botao('Editar', () => formVereador(p)) : null,
            perm.excluir && podeGravar() ? botao('Excluir', async () => { if (await excluirRegistro('parlamentares', p.id, p.nome, [p.foto_url])) { await carregarBase(); desenhar(); } }, true) : null))))
          : el('p', { class: 'vazio' }, 'Nenhum vereador cadastrado.'));
    }
    function formVereador(p) {
      p = p || {};
      const f = {
        nome: el('input', { type: 'text', maxlength: 200, value: p.nome || '' }),
        nomeParl: el('input', { type: 'text', maxlength: 120, value: p.nome_parlamentar || '', placeholder: 'Nome usado na Câmara' }),
        partido: el('input', { type: 'text', maxlength: 40, value: p.partido || '', placeholder: 'Sigla. Ex.: MDB' }),
        mesa: el('input', { type: 'text', maxlength: 80, value: p.cargo_mesa || '', placeholder: 'Ex.: Presidente, 1º Secretário' }),
        foto: el('input', { type: 'file', accept: 'image/*' }),
        bio: el('textarea', { rows: 6, maxlength: 8000, placeholder: 'Formação, profissão, mandatos, atuação…' }),
        email: el('input', { type: 'email', maxlength: 160, value: p.email || '' }),
        tel: el('input', { type: 'text', maxlength: 60, value: p.telefone || '' }),
        ini: el('input', { type: 'number', min: 1990, max: 2100, value: p.legislatura_inicio || '' }),
        fim: el('input', { type: 'number', min: 1990, max: 2100, value: p.legislatura_fim || '' }),
        ordem: el('input', { type: 'number', min: 0, max: 999, value: p.ordem || 0 }),
        exerc: el('input', { type: 'checkbox' })
      };
      f.bio.value = p.biografia || ''; f.exerc.checked = p.em_exercicio !== false;
      const corpo = el('div', null,
        el('div', { class: 'grade-campos' }, campo('lv-nome', 'Nome civil', f.nome, null, true), campo('lv-np', 'Nome parlamentar', f.nomeParl)),
        el('div', { class: 'grade-campos' }, campo('lv-part', 'Partido', f.partido), campo('lv-mesa', 'Cargo na Mesa Diretora', f.mesa), campo('lv-ord', 'Ordem na lista', f.ordem)),
        campo('lv-foto', 'Foto', f.foto, p.foto_url ? 'Já tem foto. Envie outra só para trocar.' : 'JPG ou PNG; é reduzida automaticamente.'),
        campo('lv-bio', 'Biografia', f.bio),
        el('div', { class: 'grade-campos' }, campo('lv-email', 'E-mail', f.email), campo('lv-tel', 'Telefone', f.tel)),
        el('div', { class: 'grade-campos' }, campo('lv-ini', 'Legislatura: início (ano)', f.ini), campo('lv-fim', 'fim (ano)', f.fim)),
        el('label', { class: 'checkbox' }, f.exerc, ' Em exercício (aparece na composição atual)'));
      const dlg = dialogo(p.id ? 'Editar vereador' : 'Novo vereador', corpo, (ref) => acoesGravar(ref, p, async (situacao, btn) => {
        if (!erroCampo('lv-nome', f.nome.value.trim().length >= 3 ? '' : 'Informe o nome.')) return;
        if (!erroCampo('lv-email', !f.email.value.trim() || P.emailValido(f.email.value.trim()) ? '' : 'E-mail inválido.')) return;
        ocupado(btn, 'Salvando…');
        try {
          let foto = p.foto_url || null;
          if (f.foto.files[0]) { const r = await P.reduzirImagem(f.foto.files[0], 600); foto = await P.enviarArquivo('legislativo', r.blob, r.ext); }
          await P.gravarRegistro('parlamentares', { nome: f.nome.value.trim(), nome_parlamentar: f.nomeParl.value.trim() || null, partido: f.partido.value.trim().toUpperCase() || null,
            cargo_mesa: f.mesa.value.trim() || null, foto_url: foto, biografia: f.bio.value.trim() || null, email: f.email.value.trim() || null, telefone: f.tel.value.trim() || null,
            legislatura_inicio: +f.ini.value || null, legislatura_fim: +f.fim.value || null, ordem: +f.ordem.value || 0, em_exercicio: f.exerc.checked, situacao }, p.id);
          if (foto !== p.foto_url && p.foto_url) P.apagarArquivo(p.foto_url);
          ref.fechar(); toast(situacao === 'publicado' ? 'Publicado.' : 'Rascunho salvo.'); await carregarBase(); desenhar();
        } catch (e) { mostrarErro(e); } finally { ocupado(btn); }
      }));
      return dlg;
    }
    desenhar();
    return caixa;
  }

  // ===================================================================
  // PROPOSIÇÕES (20.3 e 20.11)
  // ===================================================================
  function abaProposicoes() {
    const caixa = el('div', null, el('p', { class: 'vazio' }, 'Carregando…'));
    let ano = null, anos = [];
    const filtros = { busca: '', tipo: '', andamento: '' };
    async function carregar() {
      const { data, error } = await sb.rpc('legislativo_anos', { p_orgao: org(), p_qual: 'proposicoes' });
      if (error) throw error;
      anos = data || [];
      if (!anos.some((x) => x.ano === ano)) ano = anos.length ? anos[0].ano : new Date().getFullYear();
      let q = sb.from('proposicoes').select('*, proposicoes_autores(parlamentar_id, papel)').eq('orgao_id', org()).eq('ano', ano)
        .order('data_apresentacao', { ascending: false }).order('criado_em', { ascending: false }).limit(500);
      if (filtros.busca) q = q.ilike('busca', '%' + P.normalizar(filtros.busca).replace(/[%_]/g, '') + '%');
      if (filtros.tipo) q = q.eq('tipo', filtros.tipo);
      if (filtros.andamento) q = q.eq('andamento', filtros.andamento);
      const r = await q;
      if (r.error) throw r.error;
      return r.data || [];
    }
    async function desenhar() {
      let itens;
      try { itens = await carregar(); } catch (e) { caixa.replaceChildren(el('p', { class: 'msg msg-erro' }, P.erroGravacao(e))); return; }
      const fBusca = el('input', { type: 'search', placeholder: 'Número, ementa, autoria', value: filtros.busca, 'aria-label': 'Buscar' });
      const fTipo = el('select', { 'aria-label': 'Tipo' }, opcoes(TIPOS_PROP, filtros.tipo, 'Tipo: todos'));
      const fAnd = el('select', { 'aria-label': 'Andamento' }, opcoes(ANDAMENTO_PROP, filtros.andamento, 'Andamento: todos'));
      const aplicar = () => { Object.assign(filtros, { busca: fBusca.value.trim(), tipo: fTipo.value, andamento: fAnd.value }); desenhar(); };
      [fTipo, fAnd].forEach((x) => x.addEventListener('change', aplicar));
      let espera; fBusca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(aplicar, 500); });
      const autores = (x) => (x.proposicoes_autores || []).filter((a) => a.papel !== 'relator').map((a) => nomeParl(parlPorId(a.parlamentar_id))).join(', ') || x.autoria_externa || 'Sem autor';
      caixa.replaceChildren(
        el('p', { class: 'ajuda' }, 'Projetos de lei, de resolução, de decreto legislativo, requerimentos, indicações e moções, com autor, relator e tramitação (PNTP 20.3). A atividade de cada vereador (20.11) é montada a partir da autoria e da relatoria.'),
        podeGravar() ? el('p', null, el('button', { type: 'button', class: 'btn btn-primario', onclick: () => formProposicao() }, '+ Nova proposição')) : null,
        el('div', { class: 'abas abas-internas', role: 'tablist', 'aria-label': 'Ano' }, (anos.length ? anos : [{ ano, total: 0 }]).map((x) =>
          el('button', { type: 'button', role: 'tab', class: 'aba aba-p', 'aria-selected': x.ano === ano ? 'true' : 'false', onclick: () => { ano = x.ano; desenhar(); } }, String(x.ano), el('span', { class: 'aba-qtd' }, String(x.total))))),
        el('div', { class: 'filtros' }, fBusca, fTipo, fAnd),
        itens.length ? tabela(['Proposição', 'Autoria', 'Andamento', 'Situação'], itens.map((x) => el('tr', null,
          el('td', { class: 'quebra' }, el('strong', null, (TIPOS_PROP[x.tipo] || x.tipo) + (x.iniciativa === 'executivo' ? ' do Executivo' : '') + ' nº ' + x.numero + '/' + x.ano), el('span', { class: 'sub-linha' }, x.ementa)),
          el('td', { class: 'quebra' }, autores(x)),
          el('td', null, ANDAMENTO_PROP[x.andamento] || x.andamento),
          el('td', null, etiquetaSit(x.situacao)),
          el('td', { class: 'acoes' }, botao('Tramitação', () => formProposicao(x, 'tramitacao')), podeGravar() ? botao('Editar', () => formProposicao(x)) : null,
            perm.excluir && podeGravar() ? botao('Excluir', async () => { if (await excluirRegistro('proposicoes', x.id, (TIPOS_PROP[x.tipo] || '') + ' ' + x.numero + '/' + x.ano, [x.arquivo_url])) desenhar(); }, true) : null))))
          : el('p', { class: 'vazio' }, 'Nenhuma proposição em ' + ano + (filtros.busca || filtros.tipo || filtros.andamento ? ' com esses filtros' : '') + '.'));
    }
    function abaAutoria(x) {
      const caixa2 = el('div', null, el('p', { class: 'vazio' }, 'Carregando…'));
      async function listar() {
        const { data, error } = await sb.from('proposicoes_autores').select('*').eq('proposicao_id', x.id).order('papel');
        if (error) { caixa2.replaceChildren(el('p', { class: 'msg msg-erro' }, P.erroGravacao(error))); return; }
        const sel = el('select', null, opcoes(Object.fromEntries(parlamentares.map((p) => [p.id, nomeParl(p)])), '', 'Escolha o vereador'));
        const papel = el('select', null, opcoes(PAPEIS, (data || []).some((a) => a.papel === 'autor') ? 'relator' : 'autor'));
        const add = el('button', { type: 'button', class: 'btn btn-primario' }, 'Incluir');
        add.addEventListener('click', async () => {
          if (!sel.value) return toast('Escolha o vereador.', true);
          ocupado(add, 'Salvando…');
          const { error: e2 } = await sb.from('proposicoes_autores').insert({ orgao_id: org(), proposicao_id: x.id, parlamentar_id: sel.value, papel: papel.value });
          ocupado(add); if (e2) return mostrarErro(e2); await listar();
        });
        caixa2.replaceChildren(
          (data || []).length ? tabela(['Vereador', 'Papel'], data.map((a) => el('tr', null, el('td', null, nomeParl(parlPorId(a.parlamentar_id))), el('td', null, PAPEIS[a.papel]),
            el('td', { class: 'acoes' }, podeGravar() ? botao('Remover', async () => { const { error: e3 } = await sb.from('proposicoes_autores').delete().eq('id', a.id); if (e3) return mostrarErro(e3); await listar(); }, true) : null))))
            : el('p', { class: 'vazio' }, x.autoria_externa ? 'Autoria: ' + x.autoria_externa + '. Inclua aqui o relator, se houver.' : 'Nenhum autor ou relator ainda.'),
          podeGravar() ? el('div', { class: 'cartao mt-1' }, el('div', { class: 'grade-campos' }, campo('pa-parl', 'Vereador', sel), campo('pa-papel', 'Papel', papel)), add) : null);
      }
      listar();
      return caixa2;
    }
    function abaTramitacao(x) {
      const caixa2 = el('div', null, el('p', { class: 'vazio' }, 'Carregando…'));
      async function listar() {
        const { data, error } = await sb.from('proposicoes_tramites').select('*').eq('proposicao_id', x.id).order('data').order('criado_em');
        if (error) { caixa2.replaceChildren(el('p', { class: 'msg msg-erro' }, P.erroGravacao(error))); return; }
        const data_ = el('input', { type: 'date', value: hoje() });
        const desc = el('input', { type: 'text', maxlength: 1000, placeholder: 'Ex.: Lido em plenário; Parecer favorável da CLJ; Aprovado em 1ª discussão' });
        const arq = campoArquivo('pt-arq', 'Documento', null, 'Parecer, emenda, autógrafo… (opcional)');
        const add = el('button', { type: 'button', class: 'btn btn-primario' }, 'Incluir andamento');
        add.addEventListener('click', async () => {
          if (!erroCampo('pt-desc', desc.value.trim().length >= 3 ? '' : 'Descreva o andamento.')) return;
          if (!arq.validar()) return;
          ocupado(add, 'Salvando…');
          try {
            const url = await arq.valor();
            const { error: e2 } = await sb.from('proposicoes_tramites').insert({ orgao_id: org(), proposicao_id: x.id, data: data_.value || hoje(), descricao: desc.value.trim(), arquivo_url: url });
            if (e2) throw e2;
            toast('Andamento incluído.'); await listar();
          } catch (e) { mostrarErro(e); } finally { ocupado(add); }
        });
        caixa2.replaceChildren(
          (data || []).length ? tabela(['Data', 'Andamento', 'Documento'], data.map((t) => el('tr', null, el('td', { class: 'num' }, P.dataBR(t.data)), el('td', { class: 'quebra' }, t.descricao),
            el('td', null, t.arquivo_url ? el('a', { href: t.arquivo_url, target: '_blank', rel: 'noopener' }, 'Abrir') : '—'),
            el('td', { class: 'acoes' }, podeGravar() ? botao('Excluir', async () => { const { error: e3 } = await sb.from('proposicoes_tramites').delete().eq('id', t.id); if (e3) return mostrarErro(e3); P.apagarArquivo(t.arquivo_url); await listar(); }, true) : null))))
            : el('p', { class: 'vazio' }, 'Nenhum andamento registrado.'),
          podeGravar() ? el('div', { class: 'cartao mt-1' }, el('h3', { class: 'mt-0' }, 'Novo andamento'), el('div', { class: 'grade-campos' }, campo('pt-data', 'Data', data_)), campo('pt-desc', 'Andamento', desc), arq.caixa, add) : null);
      }
      listar();
      return caixa2;
    }
    function formProposicao(x, abaInicial) {
      x = x || {};
      const f = {
        tipo: el('select', null, opcoes(TIPOS_PROP, x.tipo || 'projeto_lei')),
        iniciativa: el('select', null, opcoes(INICIATIVA_PROP, x.iniciativa || '', 'Não informada')),
        numero: el('input', { type: 'text', maxlength: 20, value: x.numero || '' }),
        ano: el('input', { type: 'number', min: 1990, max: 2100, value: x.ano || new Date().getFullYear() }),
        data: el('input', { type: 'date', value: x.data_apresentacao || hoje() }),
        ementa: el('textarea', { rows: 3, maxlength: 2000 }),
        autoria: el('input', { type: 'text', maxlength: 200, value: x.autoria_externa || '', placeholder: 'Quando não é de vereador: Poder Executivo, Mesa Diretora, Comissão…' }),
        andamento: el('select', null, opcoes(ANDAMENTO_PROP, x.andamento || 'em_tramitacao')),
        link: el('input', { type: 'url', value: x.link_externo || '', placeholder: 'https://… (no sistema legislativo, se houver)' })
      };
      f.ementa.value = x.ementa || '';
      const texto = campoArquivo('pp-arq', 'Texto da proposição', x.arquivo_url);
      const abas = P.abas([
        ['dados', 'Dados', [
          el('div', { class: 'grade-campos' }, campo('pp-tipo', 'Tipo', f.tipo, null, true), campo('pp-ini', 'Iniciativa', f.iniciativa, 'Executivo e Legislativo numeram cada um na sua série.'), campo('pp-num', 'Número', f.numero, null, true), campo('pp-ano', 'Ano', f.ano, null, true), campo('pp-data', 'Apresentação', f.data, null, true)),
          campo('pp-em', 'Ementa', f.ementa, null, true), campo('pp-aut', 'Autoria (fora da Câmara)', f.autoria, 'Autores e relatores vereadores vão na aba Autoria e relatoria.'),
          campo('pp-and', 'Situação atual', f.andamento), texto.caixa, campo('pp-link', 'Link no sistema legislativo (opcional)', f.link)]],
        ['autoria', 'Autoria e relatoria', x.id ? () => abaAutoria(x) : null, x.id ? null : 'Salve a proposição primeiro.'],
        ['tramitacao', 'Tramitação', x.id ? () => abaTramitacao(x) : null, x.id ? null : 'Salve a proposição primeiro.']
      ]);
      const dlg = dialogo(x.id ? 'Proposição' : 'Nova proposição', abas, (ref) => acoesGravar(ref, x, async (situacao, btn) => {
        const a = +f.ano.value;
        if (!erroCampo('pp-num', f.numero.value.trim() ? '' : 'Informe o número.')) return;
        if (!erroCampo('pp-ano', a >= 1990 && a <= 2100 ? '' : 'Ano inválido.')) return;
        if (!erroCampo('pp-em', f.ementa.value.trim().length >= 5 ? '' : 'Informe a ementa.')) return;
        if (!erroCampo('pp-link', f.link.value.trim() && !P.urlValida(f.link.value.trim()) ? 'Endereço completo, começando com https://' : '')) return;
        if (!texto.validar()) return;
        ocupado(btn, 'Salvando…');
        try {
          const arquivo = await texto.valor();
          const reg = { tipo: f.tipo.value, numero: f.numero.value.trim(), ano: a, data_apresentacao: f.data.value || hoje(),
            ementa: f.ementa.value.trim(), autoria_externa: f.autoria.value.trim() || null, andamento: f.andamento.value, arquivo_url: arquivo,
            link_externo: f.link.value.trim() || null, situacao };
          // Coluna do script 46: só vai quando escolhida ou quando o registro já a tem (banco sem o script continua gravando).
          if (f.iniciativa.value || 'iniciativa' in x) reg.iniciativa = f.iniciativa.value || null;
          const id = await P.gravarRegistro('proposicoes', reg, x.id);
          ref.fechar(); toast(situacao === 'publicado' ? 'Publicado.' : 'Rascunho salvo.');
          await desenhar();
          if (!x.id) { const { data } = await sb.from('proposicoes').select('*').eq('id', id).maybeSingle(); if (data) formProposicao(data, 'autoria'); }
        } catch (e) {
          toast(/proposicoes_uk|duplicate/i.test(e.message || '') ? 'Já existe proposição deste tipo, iniciativa, número e ano.'
            : /iniciativa/i.test(e.message || '') ? 'Rode o script 46 na Supabase para usar o campo Iniciativa.' : P.erroGravacao(e), true);
        } finally { ocupado(btn); }
      }));
      if (abaInicial) abas.ir(abaInicial);
      return dlg;
    }
    desenhar();
    return caixa;
  }

  // ===================================================================
  // SESSÕES (20.4, 20.6, 20.7, 20.9) e reuniões de comissão (20.5)
  // ===================================================================
  function abaSessoes() {
    const caixa = el('div', null, el('p', { class: 'vazio' }, 'Carregando…'));
    let ano = null, anos = [], colegiado = '';
    async function desenhar() {
      const r0 = await sb.rpc('legislativo_anos', { p_orgao: org(), p_qual: 'sessoes' });
      if (r0.error) { caixa.replaceChildren(el('p', { class: 'msg msg-erro' }, P.erroGravacao(r0.error))); return; }
      anos = r0.data || [];
      if (!anos.some((x) => x.ano === ano)) ano = anos.length ? anos[0].ano : new Date().getFullYear();
      let q = sb.from('sessoes').select('*, votacoes(id), sessoes_presencas(id)').eq('orgao_id', org()).gte('data', ano + '-01-01').lte('data', ano + '-12-31')
        .order('data', { ascending: false }).limit(500);
      if (colegiado === 'plenario') q = q.is('comissao_id', null); else if (colegiado) q = q.eq('comissao_id', colegiado);
      const { data, error } = await q;
      if (error) { caixa.replaceChildren(el('p', { class: 'msg msg-erro' }, P.erroGravacao(error))); return; }
      const fCol = el('select', { 'aria-label': 'Colegiado' }, el('option', { value: '' }, 'Plenário e comissões'), el('option', { value: 'plenario', selected: colegiado === 'plenario' }, 'Só o Plenário'),
        comissoes.map((c) => el('option', { value: c.id, selected: colegiado === c.id }, c.nome)));
      fCol.addEventListener('change', () => { colegiado = fCol.value; desenhar(); });
      const nomeCol = (s) => s.comissao_id ? ((comissoes.find((c) => c.id === s.comissao_id) || {}).nome || 'Comissão') : 'Plenário';
      caixa.replaceChildren(
        el('p', { class: 'ajuda' }, 'Cada sessão do Plenário ou reunião de comissão com a pauta (20.4 e 20.5), a ata e a lista de presença (20.6), as votações nominais (20.7) e o vídeo (20.9). Publique a pauta antes da sessão; depois, a ata, as presenças e os votos.'),
        podeGravar() ? el('p', null, el('button', { type: 'button', class: 'btn btn-primario', onclick: () => formSessao() }, '+ Nova sessão ou reunião')) : null,
        el('div', { class: 'abas abas-internas', role: 'tablist', 'aria-label': 'Ano' }, (anos.length ? anos : [{ ano, total: 0 }]).map((x) =>
          el('button', { type: 'button', role: 'tab', class: 'aba aba-p', 'aria-selected': x.ano === ano ? 'true' : 'false', onclick: () => { ano = x.ano; desenhar(); } }, String(x.ano), el('span', { class: 'aba-qtd' }, String(x.total))))),
        el('div', { class: 'filtros' }, fCol),
        (data || []).length ? tabela(['Data', 'Sessão', 'Pauta', 'Ata e presenças', 'Votações', 'Situação'], data.map((s) => el('tr', null,
          el('td', { class: 'num' }, P.dataBR(s.data) + (s.hora ? ' ' + s.hora.slice(0, 5) : '')),
          el('td', { class: 'quebra' }, el('strong', null, (TIPOS_SESSAO[s.tipo] || s.tipo) + (s.numero ? ' nº ' + s.numero : '')), el('span', { class: 'sub-linha' }, nomeCol(s) + ' · ' + (ANDAMENTO_SESSAO[s.andamento] || ''))),
          el('td', null, s.pauta || s.pauta_url ? 'Sim' : el('span', { class: 'texto-alerta' }, 'Falta')),
          el('td', null, s.andamento !== 'realizada' ? '—' : (s.ata_url ? 'Ata' : el('span', { class: 'texto-alerta' }, 'Sem ata')), ' · ', (s.sessoes_presencas || []).length ? (s.sessoes_presencas.length + ' presenças') : el('span', { class: 'texto-alerta' }, 'sem presenças')),
          el('td', { class: 'num' }, String((s.votacoes || []).length)),
          el('td', null, etiquetaSit(s.situacao)),
          el('td', { class: 'acoes' }, podeGravar() ? botao('Editar', () => formSessao(s)) : null,
            perm.excluir && podeGravar() ? botao('Excluir', async () => { if (await excluirRegistro('sessoes', s.id, (TIPOS_SESSAO[s.tipo] || 'Sessão') + ' de ' + P.dataBR(s.data), [s.pauta_url, s.ata_url])) desenhar(); }, true) : null))))
          : el('p', { class: 'vazio' }, 'Nenhuma sessão em ' + ano + '.'),
        P.declaracoes('legislativo_comissoes', { perm }),
        P.declaracoes('legislativo_votacoes', { perm }));
    }
    function abaPresencas(s) {
      const caixa2 = el('div', null, el('p', { class: 'vazio' }, 'Carregando…'));
      (async () => {
        const { data, error } = await sb.from('sessoes_presencas').select('*').eq('sessao_id', s.id);
        if (error) { caixa2.replaceChildren(el('p', { class: 'msg msg-erro' }, P.erroGravacao(error))); return; }
        const membros = s.comissao_id ? (await sb.from('comissoes_membros').select('parlamentar_id').eq('comissao_id', s.comissao_id)).data || [] : null;
        const lista = parlamentares.filter((p) => (data || []).some((d) => d.parlamentar_id === p.id) || (membros ? membros.some((m) => m.parlamentar_id === p.id) : p.em_exercicio));
        const linhas = lista.map((p) => {
          const atual = (data || []).find((d) => d.parlamentar_id === p.id);
          const pres = el('input', { type: 'checkbox' }); pres.checked = atual ? atual.presente : true;
          const just = el('input', { type: 'text', maxlength: 300, value: (atual && atual.justificativa) || '', placeholder: 'Justificativa da ausência (opcional)' });
          return { p, pres, just, atual };
        });
        const salvar = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar presenças');
        salvar.addEventListener('click', async () => {
          ocupado(salvar, 'Salvando…');
          try {
            const reg = linhas.map((l) => ({ orgao_id: org(), sessao_id: s.id, parlamentar_id: l.p.id, presente: l.pres.checked, justificativa: l.pres.checked ? null : (l.just.value.trim() || null) }));
            const { error: e2 } = await sb.from('sessoes_presencas').upsert(reg, { onConflict: 'sessao_id,parlamentar_id' });
            if (e2) throw e2;
            toast('Presenças salvas.');
          } catch (e) { mostrarErro(e); } finally { ocupado(salvar); }
        });
        caixa2.replaceChildren(lista.length ? el('div', null,
          el('p', { class: 'ajuda' }, membros ? 'Membros da comissão.' : 'Vereadores em exercício.', ' Desmarque quem faltou.'),
          tabela(['Vereador', 'Presente', 'Justificativa'], linhas.map((l) => el('tr', null, el('td', null, nomeParl(l.p)), el('td', null, l.pres), el('td', null, l.just), el('td')))),
          podeGravar() ? salvar : null) : el('p', { class: 'vazio' }, membros ? 'Inclua os membros da comissão (aba Comissões) para registrar as presenças.' : 'Cadastre os vereadores primeiro.'));
      })();
      return caixa2;
    }
    function abaVotacoes(s) {
      const caixa2 = el('div', null, el('p', { class: 'vazio' }, 'Carregando…'));
      async function listar() {
        const { data, error } = await sb.from('votacoes').select('*, votacoes_votos(parlamentar_id, voto)').eq('sessao_id', s.id).order('criado_em');
        if (error) { caixa2.replaceChildren(el('p', { class: 'msg msg-erro' }, P.erroGravacao(error))); return; }
        caixa2.replaceChildren(
          (data || []).length ? tabela(['Matéria', 'Resultado', 'Votos'], data.map((v) => el('tr', null,
            el('td', { class: 'quebra' }, v.descricao), el('td', null, v.resultado === 'aprovada' ? 'Aprovada' : v.resultado === 'rejeitada' ? 'Rejeitada' : 'Outro', v.unanime ? ' (unânime)' : ''),
            el('td', { class: 'quebra' }, (v.votacoes_votos || []).length ? v.votacoes_votos.map((x) => nomeParl(parlPorId(x.parlamentar_id)).split(' (')[0] + ': ' + VOTOS[x.voto]).join('; ')
              : v.votos_sim != null ? 'Sim ' + v.votos_sim + ' · Não ' + (v.votos_nao || 0) + ' · Abst. ' + (v.abstencoes || 0) : '—'),
            el('td', { class: 'acoes' }, podeGravar() ? botao('Editar', () => formVotacao(v)) : null, podeGravar() ? botao('Excluir', async () => {
              await sb.from('votacoes_votos').delete().eq('votacao_id', v.id);
              const { error: e3 } = await sb.from('votacoes').delete().eq('id', v.id); if (e3) return mostrarErro(e3); await listar(); }, true) : null))))
            : el('p', { class: 'vazio' }, 'Nenhuma votação registrada nesta sessão.'),
          podeGravar() ? el('p', { class: 'mt-1' }, el('button', { type: 'button', class: 'btn btn-primario', onclick: () => formVotacao() }, '+ Registrar votação')) : null);
      }
      async function formVotacao(v) {
        v = v || {};
        const { data: props } = await sb.from('proposicoes').select('id, tipo, numero, ano, ementa').eq('orgao_id', org()).gte('ano', new Date(s.data).getFullYear() - 2).order('ano', { ascending: false }).limit(300);
        const fp = { prop: el('select', null, el('option', { value: '' }, 'Sem proposição ligada'), (props || []).map((p) => el('option', { value: p.id, selected: v.proposicao_id === p.id }, (TIPOS_PROP[p.tipo] || p.tipo) + ' ' + p.numero + '/' + p.ano))),
          desc: el('input', { type: 'text', maxlength: 500, value: v.descricao || '', placeholder: 'Ex.: Projeto de Lei nº 12/2026 — votação em 2º turno' }),
          forma: el('select', null, opcoes({ nominal: 'Nominal', simbolica: 'Simbólica', secreta: 'Secreta' }, v.forma || 'nominal')),
          res: el('select', null, opcoes({ aprovada: 'Aprovada', rejeitada: 'Rejeitada', outro: 'Outro' }, v.resultado || 'aprovada')),
          unan: el('input', { type: 'checkbox' }) };
        fp.unan.checked = !!v.unanime;
        fp.prop.addEventListener('change', () => { const p = (props || []).find((x) => x.id === fp.prop.value); if (p && !fp.desc.value.trim()) fp.desc.value = (TIPOS_PROP[p.tipo] || '') + ' nº ' + p.numero + '/' + p.ano; });
        const atuais = Object.fromEntries((v.votacoes_votos || []).map((x) => [x.parlamentar_id, x.voto]));
        const votos = parlamentares.filter((p) => p.em_exercicio || atuais[p.id]).map((p) => ({ p, sel: el('select', { 'aria-label': 'Voto de ' + nomeParl(p) }, opcoes(VOTOS, atuais[p.id] || 'sim', '—')) }));
        const corpo = el('div', null, campo('vt-prop', 'Proposição', fp.prop), campo('vt-desc', 'Matéria votada', fp.desc, null, true),
          el('div', { class: 'grade-campos' }, campo('vt-forma', 'Forma', fp.forma), campo('vt-res', 'Resultado', fp.res)),
          el('label', { class: 'checkbox' }, fp.unan, ' Aprovada/rejeitada por unanimidade (a lista nominal é dispensada, mas é boa prática registrar)'),
          el('h3', null, 'Voto de cada vereador'), tabela(['Vereador', 'Voto'], votos.map((x) => el('tr', null, el('td', null, nomeParl(x.p)), el('td', null, x.sel), el('td')))));
        const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar votação');
        const dlg = P.abrirDialogo('Votação', el('form', { class: 'form-dialogo', novalidate: true }, corpo), [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => dlg.close() }, 'Cancelar'), btn]);
        dlg.classList.add('dialogo-largo');
        btn.addEventListener('click', async () => {
          if (!erroCampo('vt-desc', fp.desc.value.trim().length >= 3 ? '' : 'Informe a matéria votada.')) return;
          ocupado(btn, 'Salvando…');
          try {
            const escolhidos = votos.filter((x) => x.sel.value);
            const conta = (k) => escolhidos.filter((x) => x.sel.value === k).length;
            const reg = { orgao_id: org(), sessao_id: s.id, proposicao_id: fp.prop.value || null, descricao: fp.desc.value.trim(), forma: fp.forma.value, resultado: fp.res.value,
              unanime: fp.unan.checked, votos_sim: escolhidos.length ? conta('sim') : null, votos_nao: escolhidos.length ? conta('nao') : null, abstencoes: escolhidos.length ? conta('abstencao') : null };
            const r = v.id ? await sb.from('votacoes').update(reg).eq('id', v.id).select('id') : await sb.from('votacoes').insert(reg).select('id');
            if (r.error) throw r.error;
            const vid = r.data[0].id;
            await sb.from('votacoes_votos').delete().eq('votacao_id', vid);
            if (escolhidos.length) {
              const { error: e2 } = await sb.from('votacoes_votos').insert(escolhidos.map((x) => ({ orgao_id: org(), votacao_id: vid, parlamentar_id: x.p.id, voto: x.sel.value })));
              if (e2) throw e2;
            }
            dlg.close(); toast('Votação salva.'); await listar();
          } catch (e) { mostrarErro(e); } finally { ocupado(btn); }
        });
      }
      listar();
      return caixa2;
    }
    function formSessao(s, abaInicial) {
      s = s || {};
      const f = {
        col: el('select', null, el('option', { value: '' }, 'Plenário'), comissoes.map((c) => el('option', { value: c.id, selected: s.comissao_id === c.id }, c.nome))),
        tipo: el('select', null, opcoes(TIPOS_SESSAO, s.tipo || 'ordinaria')),
        numero: el('input', { type: 'text', maxlength: 20, value: s.numero || '' }),
        data: el('input', { type: 'date', value: s.data || hoje() }),
        hora: el('input', { type: 'time', value: s.hora ? s.hora.slice(0, 5) : '' }),
        local: el('input', { type: 'text', maxlength: 200, value: s.local || '', placeholder: 'Ex.: Plenário da Câmara' }),
        andamento: el('select', null, opcoes(ANDAMENTO_SESSAO, s.andamento || 'prevista')),
        pauta: el('textarea', { rows: 8, maxlength: 20000, placeholder: 'Matérias da ordem do dia, uma por linha. O texto fica pesquisável no site.' }),
        aprov: el('input', { type: 'date', value: s.ata_aprovada_em || '' }),
        video: el('input', { type: 'url', value: s.video_url || '', placeholder: 'https://… (transmissão ou gravação)' })
      };
      f.pauta.value = s.pauta || '';
      f.col.addEventListener('change', () => { if (f.col.value && f.tipo.value === 'ordinaria') f.tipo.value = 'reuniao'; });
      const pautaArq = campoArquivo('ss-pauta', 'Pauta', s.pauta_url), ataArq = campoArquivo('ss-ata', 'Ata', s.ata_url);
      const abas = P.abas([
        ['dados', 'Dados', [
          el('div', { class: 'grade-campos' }, campo('ss-col', 'Colegiado', f.col), campo('ss-tipo', 'Tipo', f.tipo), campo('ss-num', 'Número', f.numero)),
          el('div', { class: 'grade-campos' }, campo('ss-data', 'Data', f.data, null, true), campo('ss-hora', 'Hora', f.hora), campo('ss-and', 'Andamento', f.andamento)),
          campo('ss-local', 'Local', f.local), campo('ss-video', 'Vídeo da sessão (20.9)', f.video)]],
        ['pauta', 'Pauta', [campo('ss-ptxt', 'Matérias da pauta', f.pauta), pautaArq.caixa]],
        ['ata', 'Ata', [ataArq.caixa, campo('ss-aprov', 'Ata aprovada em', f.aprov)]],
        ['presencas', 'Presenças', s.id ? () => abaPresencas(s) : null, s.id ? null : 'Salve a sessão primeiro.'],
        ['votacoes', 'Votações', s.id ? () => abaVotacoes(s) : null, s.id ? null : 'Salve a sessão primeiro.']
      ]);
      const dlg = dialogo(s.id ? 'Sessão' : 'Nova sessão ou reunião', abas, (ref) => acoesGravar(ref, s, async (situacao, btn) => {
        if (!erroCampo('ss-data', f.data.value ? '' : 'Informe a data.')) return;
        if (!erroCampo('ss-video', f.video.value.trim() && !P.urlValida(f.video.value.trim()) ? 'Endereço completo, começando com https://' : '')) return;
        if (!pautaArq.validar() || !ataArq.validar()) return;
        ocupado(btn, 'Salvando…');
        try {
          const [pu, au] = [await pautaArq.valor(), await ataArq.valor()];
          const id = await P.gravarRegistro('sessoes', { comissao_id: f.col.value || null, tipo: f.tipo.value, numero: f.numero.value.trim() || null, data: f.data.value,
            hora: f.hora.value || null, local: f.local.value.trim() || null, andamento: f.andamento.value, pauta: f.pauta.value.trim() || null, pauta_url: pu,
            ata_url: au, ata_aprovada_em: f.aprov.value || null, video_url: f.video.value.trim() || null, situacao }, s.id);
          ref.fechar(); toast(situacao === 'publicado' ? 'Publicado.' : 'Rascunho salvo.'); await desenhar();
          if (!s.id && f.andamento.value === 'realizada') { const { data } = await sb.from('sessoes').select('*').eq('id', id).maybeSingle(); if (data) formSessao(data, 'presencas'); }
        } catch (e) { mostrarErro(e); } finally { ocupado(btn); }
      }));
      if (abaInicial) abas.ir(abaInicial);
      return dlg;
    }
    desenhar();
    return caixa;
  }

  // ===================================================================
  // COMISSÕES (20.5)
  // ===================================================================
  function abaComissoes() {
    const caixa = el('div');
    function desenhar() {
      caixa.replaceChildren(
        el('p', { class: 'ajuda' }, 'Comissões permanentes e temporárias com os membros. As pautas das reuniões são cadastradas em Sessões, escolhendo a comissão (PNTP 20.5).'),
        podeGravar() ? el('p', null, el('button', { type: 'button', class: 'btn btn-primario', onclick: () => formComissao() }, '+ Nova comissão')) : null,
        comissoes.length ? tabela(['Comissão', 'Tipo', 'Situação'], comissoes.map((c) => el('tr', null,
          el('td', { class: 'quebra' }, el('strong', null, c.nome), c.ativa ? null : el('span', { class: 'sub-linha' }, 'Encerrada')),
          el('td', null, TIPOS_COMISSAO[c.tipo] || c.tipo), el('td', null, etiquetaSit(c.situacao)),
          el('td', { class: 'acoes' }, botao('Membros', () => formComissao(c, 'membros')), podeGravar() ? botao('Editar', () => formComissao(c)) : null,
            perm.excluir && podeGravar() ? botao('Excluir', async () => { if (await excluirRegistro('comissoes', c.id, c.nome)) { await carregarBase(); desenhar(); } }, true) : null))))
          : el('p', { class: 'vazio' }, 'Nenhuma comissão cadastrada.'));
    }
    function abaMembros(c) {
      const caixa2 = el('div', null, el('p', { class: 'vazio' }, 'Carregando…'));
      async function listar() {
        const { data, error } = await sb.from('comissoes_membros').select('*').eq('comissao_id', c.id);
        if (error) { caixa2.replaceChildren(el('p', { class: 'msg msg-erro' }, P.erroGravacao(error))); return; }
        const sel = el('select', null, opcoes(Object.fromEntries(parlamentares.filter((p) => !(data || []).some((m) => m.parlamentar_id === p.id)).map((p) => [p.id, nomeParl(p)])), '', 'Escolha o vereador'));
        const fun = el('select', null, opcoes(FUNCOES, 'membro'));
        const add = el('button', { type: 'button', class: 'btn btn-primario' }, 'Incluir');
        add.addEventListener('click', async () => {
          if (!sel.value) return toast('Escolha o vereador.', true);
          const { error: e2 } = await sb.from('comissoes_membros').insert({ orgao_id: org(), comissao_id: c.id, parlamentar_id: sel.value, funcao: fun.value });
          if (e2) return mostrarErro(e2); await listar();
        });
        caixa2.replaceChildren(
          (data || []).length ? tabela(['Vereador', 'Função'], data.map((m) => el('tr', null, el('td', null, nomeParl(parlPorId(m.parlamentar_id))), el('td', null, FUNCOES[m.funcao]),
            el('td', { class: 'acoes' }, podeGravar() ? botao('Remover', async () => { const { error: e3 } = await sb.from('comissoes_membros').delete().eq('id', m.id); if (e3) return mostrarErro(e3); await listar(); }, true) : null))))
            : el('p', { class: 'vazio' }, 'Nenhum membro ainda.'),
          podeGravar() ? el('div', { class: 'cartao mt-1' }, el('div', { class: 'grade-campos' }, campo('cm-parl', 'Vereador', sel), campo('cm-fun', 'Função', fun)), add) : null);
      }
      listar();
      return caixa2;
    }
    function formComissao(c, abaInicial) {
      c = c || {};
      const f = { nome: el('input', { type: 'text', maxlength: 200, value: c.nome || '', placeholder: 'Ex.: Comissão de Legislação, Justiça e Redação Final' }),
        tipo: el('select', null, opcoes(TIPOS_COMISSAO, c.tipo || 'permanente')), comp: el('textarea', { rows: 4, maxlength: 4000, placeholder: 'Competências (o que a comissão analisa)' }),
        ini: el('input', { type: 'date', value: c.inicio || '' }), fim: el('input', { type: 'date', value: c.fim || '' }), ativa: el('input', { type: 'checkbox' }) };
      f.comp.value = c.competencias || ''; f.ativa.checked = c.ativa !== false;
      const abas = P.abas([
        ['dados', 'Dados', [campo('co-nome', 'Nome', f.nome, null, true), campo('co-tipo', 'Tipo', f.tipo), campo('co-comp', 'Competências', f.comp),
          el('div', { class: 'grade-campos' }, campo('co-ini', 'Início', f.ini), campo('co-fim', 'Fim', f.fim)), el('label', { class: 'checkbox' }, f.ativa, ' Em funcionamento')]],
        ['membros', 'Membros', c.id ? () => abaMembros(c) : null, c.id ? null : 'Salve a comissão primeiro.']]);
      const dlg = dialogo(c.id ? 'Comissão' : 'Nova comissão', abas, (ref) => acoesGravar(ref, c, async (situacao, btn) => {
        if (!erroCampo('co-nome', f.nome.value.trim().length >= 3 ? '' : 'Informe o nome.')) return;
        if (!erroCampo('co-fim', !f.ini.value || !f.fim.value || f.fim.value >= f.ini.value ? '' : 'O fim não pode ser antes do início.')) return;
        ocupado(btn, 'Salvando…');
        try {
          const id = await P.gravarRegistro('comissoes', { nome: f.nome.value.trim(), tipo: f.tipo.value, competencias: f.comp.value.trim() || null, inicio: f.ini.value || null,
            fim: f.fim.value || null, ativa: f.ativa.checked, situacao }, c.id);
          ref.fechar(); toast(situacao === 'publicado' ? 'Publicado.' : 'Rascunho salvo.'); await carregarBase(); desenhar();
          if (!c.id) { const nova = comissoes.find((x) => x.id === id); if (nova) formComissao(nova, 'membros'); }
        } catch (e) { mostrarErro(e); } finally { ocupado(btn); }
      }));
      if (abaInicial) abas.ir(abaInicial);
      return dlg;
    }
    desenhar();
    return caixa;
  }

  // ===================================================================
  // VERBA INDENIZATÓRIA (20.10)
  // ===================================================================
  function abaVerba() {
    const caixa = el('div', null, el('p', { class: 'vazio' }, 'Carregando…'));
    let ano = null;
    async function desenhar() {
      const r0 = await sb.rpc('legislativo_anos', { p_orgao: org(), p_qual: 'verba' });
      if (r0.error) { caixa.replaceChildren(el('p', { class: 'msg msg-erro' }, P.erroGravacao(r0.error))); return; }
      const anos = r0.data || [];
      if (!anos.some((x) => x.ano === ano)) ano = anos.length ? anos[0].ano : new Date().getFullYear();
      const { data, error } = await sb.from('verba_indenizatoria').select('*').eq('orgao_id', org()).gte('data', ano + '-01-01').lte('data', ano + '-12-31').order('data', { ascending: false }).limit(1000);
      if (error) { caixa.replaceChildren(el('p', { class: 'msg msg-erro' }, P.erroGravacao(error))); return; }
      const inexist = el('input', { type: 'checkbox' }); inexist.checked = !!cfg.verba_inexistente;
      const norma = el('input', { type: 'text', maxlength: 300, value: cfg.verba_norma || '', placeholder: 'Ex.: Resolução nº 05/2021' });
      const normaUrl = el('input', { type: 'url', value: cfg.verba_norma_url || '', placeholder: 'https://…' });
      const salvarCfg = el('button', { type: 'button', class: 'btn btn-claro' }, 'Salvar regulamentação');
      salvarCfg.addEventListener('click', async () => {
        if (!erroCampo('vb-url', normaUrl.value.trim() && !P.urlValida(normaUrl.value.trim()) ? 'Endereço completo, começando com https://' : '')) return;
        ocupado(salvarCfg, 'Salvando…');
        const { data: novo, error: e2 } = await sb.rpc('salvar_config_legislativo', { p_orgao: org(), p: { verba_inexistente: inexist.checked, verba_norma: norma.value.trim(), verba_norma_url: normaUrl.value.trim() } });
        ocupado(salvarCfg); if (e2) return mostrarErro(e2); Object.assign(cfg, novo); toast('Regulamentação salva.');
      });
      const total = (data || []).reduce((t, v) => t + Number(v.valor), 0);
      caixa.replaceChildren(
        el('section', { class: 'cartao' }, el('h3', { class: 'mt-0' }, 'Regulamentação'),
          el('label', { class: 'checkbox' }, inexist, ' A Câmara não paga verba indenizatória nem cota parlamentar'),
          el('div', { class: 'grade-campos' }, campo('vb-norma', 'Norma que regulamenta', norma), campo('vb-url', 'Link da norma', normaUrl)), podeGravar() ? salvarCfg : null),
        el('p', { class: 'ajuda mt-1' }, 'Cada pagamento ou reembolso: vereador, data, descrição, quem recebeu e o valor (PNTP 20.10). O CPF de quem recebeu aparece mascarado no site.'),
        podeGravar() ? el('p', null, el('button', { type: 'button', class: 'btn btn-primario', onclick: () => formVerba() }, '+ Novo pagamento')) : null,
        el('div', { class: 'abas abas-internas', role: 'tablist', 'aria-label': 'Ano' }, (anos.length ? anos : [{ ano, total: 0 }]).map((x) =>
          el('button', { type: 'button', role: 'tab', class: 'aba aba-p', 'aria-selected': x.ano === ano ? 'true' : 'false', onclick: () => { ano = x.ano; desenhar(); } }, String(x.ano), el('span', { class: 'aba-qtd' }, String(x.total))))),
        (data || []).length ? el('div', null, tabela(['Data', 'Vereador', 'Descrição', 'Valor', 'Situação'], data.map((v) => el('tr', null,
          el('td', { class: 'num' }, P.dataBR(v.data)), el('td', null, nomeParl(parlPorId(v.parlamentar_id))),
          el('td', { class: 'quebra' }, v.descricao, v.beneficiario_nome ? el('span', { class: 'sub-linha' }, v.beneficiario_nome) : null),
          el('td', { class: 'num' }, Number(v.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })), el('td', null, etiquetaSit(v.situacao)),
          el('td', { class: 'acoes' }, podeGravar() ? botao('Editar', () => formVerba(v)) : null,
            perm.excluir && podeGravar() ? botao('Excluir', async () => { if (await excluirRegistro('verba_indenizatoria', v.id, v.descricao, [v.documento_url])) desenhar(); }, true) : null)))),
          el('p', { class: 'ajuda' }, 'Total em ' + ano + ': ' + total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })))
          : el('p', { class: 'vazio' }, 'Nenhum pagamento em ' + ano + '.'),
        P.declaracoes('legislativo_verba', { perm }));
    }
    function formVerba(v) {
      v = v || {};
      const f = { parl: el('select', null, opcoes(Object.fromEntries(parlamentares.map((p) => [p.id, nomeParl(p)])), v.parlamentar_id || '', 'Escolha o vereador')),
        data: el('input', { type: 'date', value: v.data || hoje() }), desc: el('input', { type: 'text', maxlength: 500, value: v.descricao || '', placeholder: 'Ex.: Combustível — viagem a Natal para audiência na FEMURN' }),
        bnome: el('input', { type: 'text', maxlength: 200, value: v.beneficiario_nome || '', placeholder: 'Quem recebeu (empresa, posto…)' }),
        bdoc: el('input', { type: 'text', maxlength: 18, value: v.beneficiario_doc ? P.formatarDoc(v.beneficiario_doc) : '', placeholder: 'CPF ou CNPJ' }),
        valor: el('input', { type: 'number', min: 0.01, step: 0.01, value: v.valor || '' }) };
      P.mascaraDoc(f.bdoc);
      const comprov = campoArquivo('vb-doc', 'Comprovante', v.documento_url, 'Nota fiscal ou recibo (opcional).');
      const corpo = el('div', null, campo('vb-parl', 'Vereador', f.parl, null, true), el('div', { class: 'grade-campos' }, campo('vb-data', 'Data', f.data, null, true), campo('vb-valor', 'Valor (R$)', f.valor, null, true)),
        campo('vb-desc', 'Descrição', f.desc, null, true), el('div', { class: 'grade-campos' }, campo('vb-bnome', 'Recebedor', f.bnome), campo('vb-bdoc', 'CPF/CNPJ do recebedor', f.bdoc)), comprov.caixa);
      dialogo(v.id ? 'Pagamento de verba' : 'Novo pagamento de verba', corpo, (ref) => acoesGravar(ref, v, async (situacao, btn) => {
        const doc = f.bdoc.value.replace(/\D/g, '');
        if (!erroCampo('vb-parl', f.parl.value ? '' : 'Escolha o vereador.')) return;
        if (!erroCampo('vb-valor', +f.valor.value > 0 ? '' : 'Informe o valor.')) return;
        if (!erroCampo('vb-desc', f.desc.value.trim().length >= 3 ? '' : 'Descreva a despesa.')) return;
        if (!erroCampo('vb-bdoc', !doc || P.erroDoc(doc) === '' ? '' : P.erroDoc(doc))) return;
        if (!comprov.validar()) return;
        ocupado(btn, 'Salvando…');
        try {
          const url = await comprov.valor();
          await P.gravarRegistro('verba_indenizatoria', { parlamentar_id: f.parl.value, data: f.data.value, descricao: f.desc.value.trim(), beneficiario_nome: f.bnome.value.trim() || null,
            beneficiario_doc: doc || null, valor: +f.valor.value, documento_url: url, situacao }, v.id);
          ref.fechar(); toast(situacao === 'publicado' ? 'Publicado.' : 'Rascunho salvo.'); ano = +f.data.value.slice(0, 4); await desenhar();
        } catch (e) { mostrarErro(e); } finally { ocupado(btn); }
      }));
    }
    desenhar();
    return caixa;
  }

  // ===================================================================
  // TRANSMISSÃO (20.9)
  // ===================================================================
  function abaTransmissao() {
    const url = el('input', { type: 'url', value: cfg.transmissao_url || '', placeholder: 'https://www.youtube.com/@camara… (canal das sessões ao vivo)' });
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar');
    btn.addEventListener('click', async () => {
      if (!erroCampo('tr-url', url.value.trim() && !P.urlValida(url.value.trim()) ? 'Endereço completo, começando com https://' : '')) return;
      ocupado(btn, 'Salvando…');
      const { data, error } = await sb.rpc('salvar_config_legislativo', { p_orgao: org(), p: { transmissao_url: url.value.trim() } });
      ocupado(btn); if (error) return mostrarErro(error); Object.assign(cfg, data); toast('Salvo.');
    });
    return el('div', null,
      el('p', { class: 'ajuda' }, 'Onde o cidadão assiste às sessões, audiências e consultas públicas ao vivo (rádio, TV ou internet). O vídeo de cada sessão vai no cadastro da sessão (PNTP 20.9).'),
      campo('tr-url', 'Canal de transmissão', url), podeGravar() ? btn : null);
  }

  // ===================================================================
  P.telas.legislativo = async function (c, mod, p) {
    perm = p; conteiner = c;
    c.replaceChildren(el('h1', null, 'Atividade legislativa'), el('p', { class: 'sub' }, 'Carregando…'));
    try { await carregarBase(); }
    catch (e) { c.querySelector('.sub').textContent = /parlamentares|Could not find|does not exist/i.test(e.message || '') ? 'Falta rodar o script 34 no banco.' : P.erroGravacao(e); return; }
    c.replaceChildren(
      el('div', { class: 'cabecalho-modulo' }, el('div', null, el('h1', null, 'Atividade legislativa'),
        el('p', { class: 'sub' }, 'Vereadores, proposições, sessões, comissões, votações e verba indenizatória (PNTP 2026, matriz do Poder Legislativo).'))),
      P.estado.alcanceUnidade && perm.editar ? el('p', { class: 'msg msg-info' }, 'A atividade legislativa é da Câmara toda: só quem tem acesso ao órgão inteiro altera.') : '',
      el('p', { class: 'ajuda' }, 'Leis, resoluções e decretos legislativos (20.2) ficam em Publicações oficiais. O decreto legislativo do julgamento das contas do Prefeito (20.8) fica em Planejamento e contas.'),
      P.abas([
        ['parlamentares', 'Vereadores', abaVereadores, null, 'parlamentares'],
        ['proposicoes', 'Proposições', abaProposicoes, null, 'proposicoes'],
        ['sessoes', 'Sessões', abaSessoes, null, 'sessoes'],
        ['comissoes', 'Comissões', abaComissoes, null, 'comissoes'],
        ['verba', 'Verba indenizatória', abaVerba, null, 'verba_indenizatoria'],
        ['transmissao', 'Transmissão', abaTransmissao]
      ]));
  };
})();
