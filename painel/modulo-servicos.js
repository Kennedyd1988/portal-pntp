// =====================================================================
// Módulo "Carta de Serviços" (Lote 4) — PNTP 14.3 e 15.3
// Cada serviço com o que a Lei 13.460/2017 (art. 7º) e a cartilha pedem.
// A lista mostra o que falta em cada serviço, para a Carta ficar completa.
// Lista em ordem alfabética (é cadastro), paginada no servidor.
// =====================================================================
(function () {
  'use strict';
  const P = window.PNTP;
  const { sb, el, toast, ocupado, erroCampo, normalizar, ordemAlfabetica, campo } = P;
  const LOTE = 50;
  const CATEGORIAS = ['Administração', 'Agricultura', 'Assistência Social', 'Cultura', 'Educação', 'Esporte',
    'Infraestrutura e Obras', 'Meio Ambiente', 'Saúde', 'Trânsito e Transporte', 'Tributos e Taxas', 'Urbanismo'];
  const FORMAS = { presencial: 'Presencial', digital: 'Pela internet', presencial_digital: 'Presencial e pela internet' };

  let perm = {};
  let conteiner = null;
  let aba = 'servicos';
  let unidades = [];
  let orgao = {};
  let itens = [], fim = false, total = 0;
  const filtros = { busca: '', categoria: '', unidade: '', forma: '', situacao: '' };

  const alcance = () => P.estado.alcanceUnidade;
  const nomeUnidade = (id) => (unidades.find((u) => u.id === id) || {}).nome || '';
  const mostrarErro = (e) => {
    const t = (e && e.message) || '';
    if (/servicos_nome_unico|duplicate key/i.test(t)) return toast('Já existe um serviço com esse nome.', true);
    if (/servicos_digital_link/i.test(t)) return toast('Serviço pela internet precisa do endereço onde é pedido.', true);
    toast(P.erroGravacao(e), true);
  };

  // O que a lei exige e ainda está vazio (aparece em amarelo na lista).
  function faltando(s) {
    const f = [];
    if (!s.descricao) f.push('descrição');
    if (!s.requisitos) f.push('requisitos/documentos');
    if (!s.etapas) f.push('etapas');
    if (!s.prazo_maximo) f.push('prazo');
    if (s.forma_prestacao !== 'digital' && !s.local_atendimento) f.push('local');
    return f;
  }

  function consulta(sel, opcoes) {
    let q = sb.from('servicos').select(sel, opcoes).eq('orgao_id', P.estado.orgao.id);
    const f = filtros;
    if (f.busca) q = q.ilike('busca', '%' + normalizar(f.busca).replace(/[%_]/g, '') + '%');
    if (f.categoria) q = q.eq('categoria', f.categoria);
    if (f.unidade === 'nenhuma') q = q.is('unidade_id', null);
    else if (f.unidade) q = q.eq('unidade_id', f.unidade);
    if (f.forma === 'internet') q = q.in('forma_prestacao', ['digital', 'presencial_digital']);
    else if (f.forma) q = q.eq('forma_prestacao', f.forma);
    if (f.situacao) q = q.eq('situacao', f.situacao);
    return q;
  }

  async function carregar(reiniciar) {
    const ultimo = reiniciar ? null : itens[itens.length - 1];
    const [pag, t] = await Promise.all([
      P.paginar(consulta, 'nome', ultimo, LOTE, true),
      reiniciar ? P.contar(consulta) : Promise.resolve(total)
    ]);
    itens = reiniciar ? pag.linhas : itens.concat(pag.linhas);
    fim = pag.fim; total = t;
  }

  // ======================= FORMULÁRIO =======================
  function form(s) {
    s = s || {};
    const publicado = s.situacao === 'publicado';
    const travado = publicado && !perm.publicar;
    const cfg = orgao.configuracoes || {};
    const txt = (v, max, extra) => el('input', Object.assign({ type: 'text', maxlength: max || 200, value: v || '' }, extra || {}));
    const area = (v, linhas) => { const a = el('textarea', { rows: linhas || 3 }); a.value = v || ''; return a; };
    const f = {
      nome: txt(s.nome, 200),
      unidade: alcance()
        ? el('select', { disabled: true }, el('option', { value: alcance() }, nomeUnidade(alcance())))
        : el('select', null, el('option', { value: '' }, '— Órgão todo —'),
          [...unidades].sort((a, b) => ordemAlfabetica(a.nome, b.nome)).map((u) => el('option', { value: u.id, selected: s.unidade_id === u.id }, u.nome))),
      descricao: area(s.descricao, 3),
      publico: txt(s.publico_alvo, 200, { placeholder: 'Ex.: Moradores do município, estudantes da rede municipal' }),
      requisitos: P.editorTexto('sv-requisitos', s.requisitos, 4),
      etapas: P.editorTexto('sv-etapas', s.etapas, 4),
      prazo: txt(s.prazo_maximo, 100, { placeholder: 'Ex.: Até 15 dias úteis' }),
      custo: txt(s.custo, 100, { placeholder: 'Ex.: Gratuito' }),
      forma: el('select', null, Object.entries(FORMAS).map(([k, v]) => el('option', { value: k, selected: (s.forma_prestacao || 'presencial') === k }, v))),
      link: el('input', { type: 'url', value: s.link_digital || '', placeholder: 'https://…' }),
      local: txt(s.local_atendimento, 200, { placeholder: cfg.endereco || '' }),
      horario: txt(s.horario, 120, { placeholder: cfg.horario || '' }),
      prioridades: txt(s.prioridades, 200, { placeholder: 'Ex.: Idosos, gestantes, pessoas com deficiência (Lei 10.048/2000)' }),
      espera: txt(s.tempo_espera, 100, { placeholder: 'Ex.: Até 30 minutos' }),
      manifestacao: area(s.manifestacao, 2)
    };
    const categoria = P.campoOutra('sv-categoria', 'Área', CATEGORIAS.concat(itens.map((x) => x.categoria)), s.categoria, null, '— Sem área —');
    const blocoLink = campo('sv-link', 'Endereço para pedir pela internet', f.link, 'Onde o cidadão faz o pedido sem ir ao balcão (PNTP 15.3).', true);
    const alternar = () => { blocoLink.hidden = f.forma.value === 'presencial'; };
    f.forma.addEventListener('change', alternar); alternar();

    const secao = (titulo, ...filhos) => el('div', { class: 'secao-form' }, el('h3', null, titulo), ...filhos);
    const corpo = el('form', { class: 'form-dialogo', novalidate: true },
      travado ? el('p', { class: 'msg msg-info' }, 'Este serviço está publicado. Só quem tem permissão de publicar pode alterá-lo.') : null,
      campo('sv-nome', 'Nome do serviço', f.nome, 'Como o cidadão procura. Ex.: Emissão de 2ª via do IPTU', true),
      el('div', { class: 'grade-campos' }, categoria.campo, campo('sv-unidade', 'Unidade responsável', f.unidade)),
      campo('sv-descricao', 'O que é o serviço', f.descricao),
      campo('sv-publico', 'Quem pode pedir', f.publico),
      secao('Como pedir',
        el('div', { class: 'campo' }, el('label', { for: 'sv-requisitos' }, 'Requisitos e documentos necessários'), f.requisitos.elemento),
        el('div', { class: 'campo' }, el('label', { for: 'sv-etapas' }, 'Principais etapas'), f.etapas.elemento),
        el('div', { class: 'grade-campos' }, campo('sv-prazo', 'Prazo máximo para atender', f.prazo), campo('sv-custo', 'Custo', f.custo))),
      secao('Onde e quando',
        campo('sv-forma', 'Forma de prestação', f.forma), blocoLink,
        el('div', { class: 'grade-campos' },
          campo('sv-local', 'Local de atendimento', f.local, 'Em branco: o endereço da sede.'),
          campo('sv-horario', 'Horário', f.horario, 'Em branco: o horário geral do órgão.')),
        el('div', { class: 'grade-campos' }, campo('sv-prioridades', 'Atendimento prioritário', f.prioridades), campo('sv-espera', 'Tempo de espera previsto', f.espera))),
      secao('Reclamações e sugestões',
        campo('sv-manifestacao', 'Onde se manifestar sobre este serviço', f.manifestacao,
          'Em branco: vale o texto padrão da aba "Textos da Carta" (Ouvidoria).'))
    );
    if (travado) for (const i of corpo.querySelectorAll('input, textarea, select, .editor-barra button')) i.disabled = true;

    const acoes = [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => dlg.close() }, travado ? 'Fechar' : 'Cancelar')];
    const btnRascunho = el('button', { type: 'button', class: 'btn btn-claro' }, publicado ? 'Tirar do ar (rascunho)' : 'Salvar rascunho');
    const btnPublicar = el('button', { type: 'button', class: 'btn btn-primario' }, publicado ? 'Salvar' : 'Publicar');
    if (!travado) {
      if (!publicado || perm.publicar) acoes.push(btnRascunho);
      if (perm.publicar) acoes.push(btnPublicar);
    }
    const dlg = P.abrirDialogo(s.id ? 'Editar serviço' : 'Novo serviço', corpo, acoes);
    dlg.classList.add('dialogo-largo');

    async function salvar(situacao, btn) {
      const nome = f.nome.value.trim();
      if (!erroCampo('sv-nome', nome.length >= 3 ? '' : 'Informe o nome do serviço.')) return;
      const link = f.link.value.trim();
      if (f.forma.value !== 'presencial' && !erroCampo('sv-link', P.urlValida(link) ? '' : 'Informe o endereço completo, começando com https://')) return;
      const reg = {
        nome, categoria: categoria.valor(), unidade_id: f.unidade.value || null,
        descricao: f.descricao.value.trim() || null, publico_alvo: f.publico.value.trim() || null,
        requisitos: f.requisitos.area.value.trim() || null, etapas: f.etapas.area.value.trim() || null,
        prazo_maximo: f.prazo.value.trim() || null, custo: f.custo.value.trim() || null,
        forma_prestacao: f.forma.value, link_digital: f.forma.value === 'presencial' ? null : link,
        local_atendimento: f.local.value.trim() || null, horario: f.horario.value.trim() || null,
        prioridades: f.prioridades.value.trim() || null, tempo_espera: f.espera.value.trim() || null,
        manifestacao: f.manifestacao.value.trim() || null, situacao
      };
      // A lei pede esses dados: publicar com lacuna é permitido, mas avisado.
      const falta = faltando(reg);
      if (situacao === 'publicado' && falta.length &&
        !await P.confirmar('Faltam informações', 'Para a Carta de Serviços ficar completa (PNTP 14.3), ainda faltam: ' + falta.join(', ') + '. Publicar mesmo assim?', 'Publicar assim', false)) return;
      ocupado(btn, situacao === 'publicado' ? 'Publicando…' : 'Salvando…');
      try {
        await P.gravarRegistro('servicos', reg, s.id);
        dlg.close();
        toast(situacao === 'publicado' ? 'Serviço publicado.' : 'Rascunho salvo.');
        await recarregar();
      } catch (e) { mostrarErro(e); }
      finally { ocupado(btn); }
    }
    btnRascunho.addEventListener('click', () => salvar('rascunho', btnRascunho));
    btnPublicar.addEventListener('click', () => salvar('publicado', btnPublicar));
    f.nome.focus();
  }

  async function excluir(s) {
    if (!await P.confirmar('Excluir serviço', 'Excluir "' + s.nome + '" da Carta de Serviços? Se o serviço só foi suspenso, prefira "Tirar do ar".', 'Excluir', true)) return;
    const { data, error } = await sb.from('servicos').delete().eq('id', s.id).select('id');
    if (error) return mostrarErro(error);
    if (!data || !data.length) return toast('Seu perfil não pode excluir este serviço.', true);
    toast('Serviço excluído.'); await recarregar();
  }

  // ======================= LISTA =======================
  function telaServicos(areaTela) {
    const busca = el('input', { type: 'search', placeholder: 'Nome ou descrição', value: filtros.busca, 'aria-label': 'Buscar serviço' });
    const cat = el('select', { 'aria-label': 'Área' }, el('option', { value: '' }, 'Todas as áreas'),
      CATEGORIAS.map((c) => el('option', { value: c, selected: filtros.categoria === c }, c)));
    const un = el('select', { 'aria-label': 'Unidade' }, el('option', { value: '' }, 'Todas as unidades'),
      el('option', { value: 'nenhuma', selected: filtros.unidade === 'nenhuma' }, 'Órgão todo (sem unidade)'),
      [...unidades].sort((a, b) => ordemAlfabetica(a.nome, b.nome)).map((u) => el('option', { value: u.id, selected: filtros.unidade === u.id }, u.nome)));
    const forma = el('select', { 'aria-label': 'Forma' }, el('option', { value: '' }, 'Qualquer forma'),
      el('option', { value: 'internet', selected: filtros.forma === 'internet' }, 'Pedido pela internet'),
      el('option', { value: 'presencial', selected: filtros.forma === 'presencial' }, 'Só presencial'));
    const sit = el('select', { 'aria-label': 'Situação' }, el('option', { value: '' }, 'Publicados e rascunhos'),
      el('option', { value: 'publicado', selected: filtros.situacao === 'publicado' }, 'Publicados'),
      el('option', { value: 'rascunho', selected: filtros.situacao === 'rascunho' }, 'Rascunhos'));
    const lista = el('div');
    let espera = null;
    const aplicar = () => {
      Object.assign(filtros, { busca: busca.value.trim(), categoria: cat.value, unidade: un.value, forma: forma.value, situacao: sit.value });
      lista.replaceChildren(el('p', { class: 'vazio' }, 'Carregando…'));
      carregar(true).then(desenharLista).catch(mostrarErro);
    };
    busca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(aplicar, 350); });
    for (const c of [cat, un, forma, sit]) c.addEventListener('change', aplicar);

    function desenharLista() {
      if (!itens.length) {
        lista.replaceChildren(el('p', { class: 'vazio' }, Object.values(filtros).some(Boolean) ? 'Nenhum serviço com esses filtros.' : 'Nenhum serviço cadastrado ainda. Comece pelos mais procurados: IPTU, matrícula escolar, marcação de consultas, alvará.'));
        return;
      }
      const btnMais = el('button', { type: 'button', class: 'btn btn-claro' }, 'Carregar mais');
      btnMais.addEventListener('click', async () => {
        ocupado(btnMais, 'Carregando…');
        try { await carregar(false); desenharLista(); } catch (e) { mostrarErro(e); ocupado(btnMais); }
      });
      lista.replaceChildren(
        el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela' },
          el('thead', null, el('tr', null, ['Serviço', 'Unidade', 'Forma', 'Prazo', 'Situação'].map((t) => el('th', { scope: 'col' }, t)),
            el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Ações')))),
          el('tbody', null, itens.map((s) => {
            const falta = faltando(s);
            const mexe = !alcance() || s.unidade_id === alcance();
            return el('tr', null,
              el('td', null, el('strong', null, s.nome), s.categoria ? el('span', { class: 'sub-linha' }, s.categoria) : null,
                falta.length ? el('span', { class: 'falta-itens' }, 'Falta: ' + falta.join(', ')) : null),
              el('td', null, nomeUnidade(s.unidade_id) || 'Órgão todo'),
              el('td', null, el('span', { class: 'etiqueta etiqueta-forma-' + s.forma_prestacao }, FORMAS[s.forma_prestacao])),
              el('td', null, s.prazo_maximo || '—'),
              el('td', null, el('span', { class: 'etiqueta etiqueta-' + (s.situacao === 'publicado' ? 'publicado' : 'rascunho') }, s.situacao === 'publicado' ? 'Publicado' : 'Rascunho')),
              el('td', { class: 'acoes' },
                perm.editar && mexe ? el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => form(s) }, s.situacao === 'publicado' && !perm.publicar ? 'Ver' : 'Editar') : null,
                perm.excluir && mexe ? el('button', { type: 'button', class: 'btn btn-claro btn-p btn-texto-perigo', onclick: () => excluir(s) }, 'Excluir') : null));
          })))),
        el('div', { class: 'rodape-lista' }, el('span', { class: 'ajuda' }, 'Mostrando ' + itens.length + ' de ' + total), fim ? null : btnMais));
    }
    areaTela.replaceChildren(el('div', { class: 'filtros filtros-6' }, busca, cat, un, forma, sit), lista);
    desenharLista();
  }

  // ======================= TEXTOS DA CARTA =======================
  async function telaTextos(areaTela) {
    const podeGravar = perm.editar && !alcance();
    const { data, error } = await sb.from('carta_servicos').select('*').eq('orgao_id', P.estado.orgao.id).maybeSingle();
    if (error) { mostrarErro(error); return; }
    const c = data || {};
    const cfg = orgao.configuracoes || {};
    const padraoManifestacao = 'Elogios, sugestões, reclamações e denúncias sobre qualquer serviço podem ser feitos na Ouvidoria: pelo site (menu Atendimento › Ouvidoria)' +
      (cfg.email ? ', pelo e-mail ' + cfg.email : '') + (cfg.telefone ? ', pelo telefone ' + cfg.telefone : '') +
      (cfg.endereco ? ' ou pessoalmente na sede (' + cfg.endereco + ')' : '') + (cfg.horario ? ', ' + cfg.horario.charAt(0).toLowerCase() + cfg.horario.slice(1) : '') + '.';
    const apres = P.editorTexto('ct-apresentacao', c.apresentacao, 4);
    const comp = P.editorTexto('ct-compromissos', c.compromissos, 6);
    const manif = P.editorTexto('ct-manifestacao', c.manifestacao || (podeGravar ? padraoManifestacao : ''), 3);
    const usarModelo = el('button', { type: 'button', class: 'btn btn-claro btn-p' }, 'Usar texto sugerido');
    usarModelo.addEventListener('click', () => {
      if (comp.area.value.trim() && !confirm('Substituir o texto atual pelo sugerido?')) return;
      comp.area.value = [
        'Nosso compromisso com quem procura os serviços:', '',
        '- Atender com respeito, cordialidade e sem discriminação.',
        '- Dar prioridade a idosos, gestantes, lactantes, pessoas com crianças de colo e pessoas com deficiência.',
        '- Informar com clareza os documentos necessários, as etapas e o prazo de cada serviço.',
        '- Cumprir os prazos informados nesta Carta e avisar com antecedência quando houver atraso.',
        '- Manter os locais de atendimento limpos, sinalizados e acessíveis.',
        '- Proteger os dados pessoais conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018).',
        '- Receber e responder elogios, sugestões e reclamações pela Ouvidoria.'].join('\n');
    });
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar textos');
    btn.addEventListener('click', async () => {
      ocupado(btn, 'Salvando…');
      try {
        const { data: r, error: e } = await sb.from('carta_servicos').upsert({
          orgao_id: P.estado.orgao.id, apresentacao: apres.area.value.trim() || null,
          compromissos: comp.area.value.trim() || null, manifestacao: manif.area.value.trim() || null
        }, { onConflict: 'orgao_id' }).select('orgao_id');
        if (e) throw e;
        if (!r || !r.length) throw P.amigavel('Seu perfil não pode alterar os textos da Carta.');
        toast('Textos da Carta salvos.');
      } catch (e) { mostrarErro(e); }
      finally { ocupado(btn); }
    });
    const bloco = el('div', { class: 'cartao' },
      el('p', { class: 'ajuda' }, 'Textos gerais que abrem a Carta de Serviços no site. Valem para todos os serviços.'),
      el('div', { class: 'campo' }, el('label', { for: 'ct-apresentacao' }, 'Apresentação'), apres.elemento,
        el('span', { class: 'ajuda' }, 'Ex.: "Esta Carta informa os serviços prestados pela Prefeitura, como pedir e em quanto tempo."')),
      el('div', { class: 'campo' }, el('label', { for: 'ct-compromissos' }, 'Compromissos de qualidade do atendimento ', usarModelo), comp.elemento),
      el('div', { class: 'campo' }, el('label', { for: 'ct-manifestacao' }, 'Onde reclamar, sugerir ou elogiar (padrão de todos os serviços)'), manif.elemento),
      podeGravar ? el('div', { class: 'barra-salvar' }, btn) : el('p', { class: 'msg msg-info' }, 'Só quem tem acesso ao órgão inteiro altera estes textos.'));
    if (!podeGravar) for (const i of bloco.querySelectorAll('textarea, .editor-barra button')) i.disabled = true;
    areaTela.replaceChildren(bloco);
  }

  // ======================= TELA =======================
  function desenhar() {
    const areaTela = el('div');
    const botaoAba = (id, rotulo) => el('button', {
      type: 'button', role: 'tab', class: 'aba', 'aria-selected': aba === id ? 'true' : 'false',
      onclick: () => { aba = id; desenhar(); }
    }, rotulo, id === 'servicos' ? el('span', { class: 'aba-qtd' }, String(total)) : null);
    if (aba === 'servicos') telaServicos(areaTela); else telaTextos(areaTela);
    conteiner.replaceChildren(
      el('div', { class: 'cabecalho-modulo' },
        el('div', null, el('h1', null, 'Carta de Serviços'),
          el('p', { class: 'sub' }, 'Serviços prestados, como pedir, prazos e onde reclamar (Lei 13.460/2017 · PNTP 14.3 e 15.3).')),
        aba === 'servicos' && perm.editar ? el('button', { type: 'button', class: 'btn btn-primario', onclick: () => form() }, '+ Novo serviço') : null),
      el('div', { class: 'abas', role: 'tablist' }, botaoAba('servicos', 'Serviços'), botaoAba('textos', 'Textos da Carta')),
      areaTela);
  }

  async function recarregar() {
    try { await carregar(true); desenhar(); } catch (e) { mostrarErro(e); }
  }

  P.telas.servicos = async function (c, mod, p) {
    perm = p; conteiner = c;
    c.replaceChildren(el('h1', null, 'Carta de Serviços'), el('p', { class: 'sub' }, 'Carregando…'));
    try {
      const [u, o] = await Promise.all([
        sb.from('unidades').select('id, nome').eq('orgao_id', P.estado.orgao.id).limit(500),
        sb.from('orgaos').select('nome, configuracoes').eq('id', P.estado.orgao.id).maybeSingle()
      ]);
      if (u.error) throw u.error;
      unidades = u.data; orgao = o.data || {};
      await carregar(true);
      desenhar();
    } catch (e) { c.querySelector('.sub').textContent = P.erroGravacao(e); }
  };
})();
