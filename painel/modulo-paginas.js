// =====================================================================
// Módulo "Páginas e perguntas frequentes" (Lote 3)
// Páginas livres do site (História, Símbolos…) com rascunho → publicado,
// e a lista de Perguntas frequentes. Ambas são poucas por órgão
// (dezenas), então carregam de uma vez com teto de segurança.
// =====================================================================
(function () {
  'use strict';
  const P = window.PNTP;
  const { sb, el, toast, ocupado, erroCampo, normalizar, ordemAlfabetica, campo } = P;
  const LIMITE = 300;
  const SUGESTOES = [
    ['historia', 'História do município'], ['simbolos', 'Símbolos municipais'],
    ['dados-gerais', 'Dados gerais do município'], ['acessibilidade', 'Acessibilidade']
  ];

  let perm = {};
  let conteiner = null;
  let aba = 'paginas';
  let paginas = [], faq = [], slugsNoMenu = new Set();
  let busca = '';

  const mostrarErro = (e) => {
    const t = (e && e.message) || '';
    if (/paginas_slug_unico|duplicate key/i.test(t)) return toast('Já existe uma página com esse endereço. Mude o endereço.', true);
    toast(P.erroGravacao(e), true);
  };
  // Alcance setorial não altera páginas (valem para o órgão todo).
  const podeGravar = () => perm.editar && !P.estado.alcanceUnidade;
  const gerarSlug = (t) => normalizar(t).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

  async function carregar() {
    const org = P.estado.orgao.id;
    const [p, f, m] = await Promise.all([
      sb.from('paginas').select('*').eq('orgao_id', org).order('titulo').limit(LIMITE),
      sb.from('faq').select('*').eq('orgao_id', org).order('ordem').order('pergunta').limit(LIMITE),
      sb.from('menu_itens').select('destino').eq('orgao_id', org).eq('tipo', 'pagina').limit(LIMITE)
    ]);
    for (const r of [p, f, m]) if (r.error) throw r.error;
    paginas = p.data; faq = f.data;
    slugsNoMenu = new Set(m.data.map((x) => x.destino));
  }

  // ======================= PÁGINAS =======================
  function formPagina(pg, sugestao) {
    pg = pg || {};
    const publicada = pg.situacao === 'publicado';
    const travada = publicada && !perm.publicar;
    const noMenu = pg.id && slugsNoMenu.has(pg.slug);
    const titulo = el('input', { type: 'text', maxlength: 160, value: pg.titulo || (sugestao ? sugestao[1] : '') });
    const slug = el('input', { type: 'text', maxlength: 60, value: pg.slug || (sugestao ? sugestao[0] : ''), disabled: noMenu });
    let slugManual = !!pg.id;
    slug.addEventListener('input', () => { slugManual = true; });
    titulo.addEventListener('input', () => { if (!slugManual) slug.value = gerarSlug(titulo.value); });
    const editor = P.editorTexto('pg-conteudo', pg.conteudo, 16);

    const corpo = el('form', { class: 'form-dialogo', novalidate: true },
      travada ? el('p', { class: 'msg msg-info' }, 'Esta página está publicada. Só quem tem permissão de publicar pode alterá-la.') : null,
      el('div', { class: 'grade-campos' },
        campo('pg-titulo', 'Título', titulo, null, true),
        campo('pg-slug', 'Endereço no site', slug, noMenu
          ? 'Esta página está no menu do site: o endereço fica travado para o link não quebrar.'
          : 'Só letras minúsculas, números e hífen. Ex.: historia', true)),
      el('div', { class: 'campo' }, el('label', { for: 'pg-conteudo' }, 'Conteúdo'), editor.elemento));
    if (travada) for (const i of corpo.querySelectorAll('input, textarea, .editor-barra button')) i.disabled = true;

    const acoes = [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => dlg.close() }, travada ? 'Fechar' : 'Cancelar')];
    const btnRascunho = el('button', { type: 'button', class: 'btn btn-claro' }, publicada ? 'Tirar do ar (rascunho)' : 'Salvar rascunho');
    const btnPublicar = el('button', { type: 'button', class: 'btn btn-primario' }, publicada ? 'Salvar' : 'Publicar');
    if (!travada) {
      if (!publicada || perm.publicar) acoes.push(btnRascunho);
      if (perm.publicar) acoes.push(btnPublicar);
    }
    const dlg = P.abrirDialogo(pg.id ? 'Editar página' : 'Nova página', corpo, acoes);
    dlg.classList.add('dialogo-largo');

    async function salvar(situacao, btn) {
      const t = titulo.value.trim();
      const s = slug.value.trim();
      if (!erroCampo('pg-titulo', t.length >= 3 ? '' : 'Informe o título.')) return;
      if (!erroCampo('pg-slug', /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) ? '' : 'Use só letras minúsculas sem acento, números e hífen.')) return;
      if (!erroCampo('pg-slug', paginas.some((x) => x.slug === s && x.id !== pg.id) ? 'Já existe uma página com esse endereço.' : '')) return;
      if (situacao === 'publicado' && !editor.area.value.trim()) { toast('Escreva o conteúdo antes de publicar.', true); return; }
      ocupado(btn, 'Salvando…');
      try {
        await P.gravarRegistro('paginas', { titulo: t, slug: s, conteudo: editor.area.value.trim() || null, situacao }, pg.id);
        dlg.close();
        toast(situacao === 'publicado' ? 'Página publicada.' : 'Rascunho salvo.');
        await recarregar();
      } catch (e) { mostrarErro(e); }
      finally { ocupado(btn); }
    }
    btnRascunho.addEventListener('click', () => salvar('rascunho', btnRascunho));
    btnPublicar.addEventListener('click', () => salvar('publicado', btnPublicar));
  }

  async function excluirPagina(pg) {
    if (slugsNoMenu.has(pg.slug)) {
      P.aviso('Não é possível excluir', 'A página "' + pg.titulo + '" está no menu do site. Tire-a do menu (tela "Menu do site") antes de excluir, para não deixar um link quebrado.');
      return;
    }
    if (!await P.confirmar('Excluir página', 'Excluir a página "' + pg.titulo + '"?', 'Excluir', true)) return;
    const { data, error } = await sb.from('paginas').delete().eq('id', pg.id).select('id');
    if (error) return mostrarErro(error);
    if (!data || !data.length) return toast('Seu perfil não pode excluir esta página.', true);
    toast('Página excluída.'); await recarregar();
  }

  function telaPaginas(area) {
    const f = normalizar(busca);
    const lista = paginas.filter((p) => !f || normalizar(p.titulo + ' ' + p.slug).includes(f))
      .sort((a, b) => ordemAlfabetica(a.titulo, b.titulo));
    const faltando = SUGESTOES.filter(([s]) => !paginas.some((p) => p.slug === s));
    area.replaceChildren(...[
      podeGravar() && faltando.length ? el('div', { class: 'sugestoes' }, el('span', { class: 'ajuda' }, 'Páginas comuns que ainda não existem:'),
        faltando.map((sg) => el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => formPagina(null, sg) }, '+ ' + sg[1]))) : null,
      lista.length ? el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela' },
        el('thead', null, el('tr', null, ['Página', 'Endereço', 'Situação', 'Atualizada em'].map((t) => el('th', { scope: 'col' }, t)), el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Ações')))),
        el('tbody', null, lista.map((p) => el('tr', null,
          el('td', null, el('strong', null, p.titulo), slugsNoMenu.has(p.slug) ? el('span', { class: 'etiqueta', style: 'margin-left:6px' }, 'no menu') : null),
          el('td', { class: 'num' }, '/' + p.slug),
          el('td', null, el('span', { class: 'etiqueta etiqueta-' + (p.situacao === 'publicado' ? 'publicado' : 'rascunho') }, p.situacao === 'publicado' ? 'Publicada' : 'Rascunho')),
          el('td', { class: 'num' }, P.dataHoraBR(p.atualizado_em)),
          el('td', { class: 'acoes' },
            podeGravar() ? el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => formPagina(p) }, p.situacao === 'publicado' && !perm.publicar ? 'Ver' : 'Editar') : null,
            perm.excluir && podeGravar() ? el('button', { type: 'button', class: 'btn btn-claro btn-p btn-texto-perigo', onclick: () => excluirPagina(p) }, 'Excluir') : null)))))) :
        el('p', { class: 'vazio' }, busca ? 'Nenhuma página encontrada.' : 'Nenhuma página criada ainda.')
    ].filter(Boolean));
  }

  // ======================= PERGUNTAS FREQUENTES =======================
  function formFaq(q) {
    q = q || {};
    const pergunta = el('input', { type: 'text', maxlength: 300, value: q.pergunta || '' });
    const editor = P.editorTexto('fq-resposta', q.resposta, 6);
    const categoria = P.campoOutra('fq-categoria', 'Assunto', faq.map((x) => x.categoria).concat(['Saúde', 'Tributos', 'Educação', 'Assistência Social', 'Atendimento']),
      q.categoria, null, '— Sem assunto —');
    const ordem = el('input', { type: 'number', min: 0, max: 999, value: q.ordem == null ? 10 : q.ordem });
    const ativo = el('input', { type: 'checkbox', checked: q.id ? q.ativo : true });
    const corpo = el('form', { class: 'form-dialogo', novalidate: true },
      campo('fq-pergunta', 'Pergunta', pergunta, null, true),
      el('div', { class: 'campo' }, el('label', { for: 'fq-resposta' }, 'Resposta', el('span', { class: 'obrigatorio', 'aria-hidden': 'true' }, ' *')), editor.elemento,
        el('span', { class: 'erro-campo', id: 'fq-resposta-erro' })),
      el('div', { class: 'grade-campos grade-3' },
        categoria.campo,
        campo('fq-ordem', 'Ordem', ordem),
        el('label', { class: 'checkbox', style: 'align-self:center' }, ativo, ' Aparece no site')),
    );
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar');
    const dlg = P.abrirDialogo(q.id ? 'Editar pergunta' : 'Nova pergunta', corpo, [
      el('button', { type: 'button', class: 'btn btn-claro', onclick: () => dlg.close() }, 'Cancelar'), btn]);
    dlg.classList.add('dialogo-largo');
    btn.addEventListener('click', async () => {
      if (!erroCampo('fq-pergunta', pergunta.value.trim().length >= 5 ? '' : 'Escreva a pergunta.')) return;
      if (!erroCampo('fq-resposta', editor.area.value.trim() ? '' : 'Escreva a resposta.')) return;
      ocupado(btn, 'Salvando…');
      try {
        await P.gravarRegistro('faq', {
          pergunta: pergunta.value.trim(), resposta: editor.area.value.trim(), categoria: categoria.valor(),
          ordem: parseInt(ordem.value, 10) || 0, ativo: ativo.checked
        }, q.id);
        dlg.close(); toast('Pergunta salva.'); await recarregar();
      } catch (e) { mostrarErro(e); }
      finally { ocupado(btn); }
    });
  }

  async function excluirFaq(q) {
    if (!await P.confirmar('Excluir pergunta', 'Excluir "' + q.pergunta + '"?', 'Excluir', true)) return;
    const { data, error } = await sb.from('faq').delete().eq('id', q.id).select('id');
    if (error) return mostrarErro(error);
    if (!data || !data.length) return toast('Seu perfil não pode excluir esta pergunta.', true);
    toast('Pergunta excluída.'); await recarregar();
  }

  function telaFaq(area) {
    const f = normalizar(busca);
    const lista = faq.filter((q) => !f || normalizar(q.pergunta + ' ' + (q.categoria || '')).includes(f));
    area.replaceChildren(lista.length ? el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela' },
      el('thead', null, el('tr', null, ['Pergunta', 'Assunto', 'Ordem', 'Situação'].map((t) => el('th', { scope: 'col' }, t)), el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Ações')))),
      el('tbody', null, lista.map((q) => el('tr', null,
        el('td', null, el('strong', null, q.pergunta)),
        el('td', null, q.categoria || '—'),
        el('td', null, String(q.ordem)),
        el('td', null, el('span', { class: 'etiqueta etiqueta-' + (q.ativo ? 'publicado' : 'desativado') }, q.ativo ? 'No site' : 'Oculta')),
        el('td', { class: 'acoes' },
          podeGravar() ? el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => formFaq(q) }, 'Editar') : null,
          perm.excluir && podeGravar() ? el('button', { type: 'button', class: 'btn btn-claro btn-p btn-texto-perigo', onclick: () => excluirFaq(q) }, 'Excluir') : null))))))
      : el('p', { class: 'vazio' }, busca ? 'Nenhuma pergunta encontrada.' : 'Nenhuma pergunta cadastrada ainda.'));
  }

  // ======================= TELA =======================
  function desenhar() {
    const area = el('div');
    const campoBusca = el('input', { type: 'search', class: 'busca', value: busca, 'aria-label': 'Buscar',
      placeholder: aba === 'paginas' ? 'Buscar página' : 'Buscar pergunta ou assunto' });
    campoBusca.addEventListener('input', () => { busca = campoBusca.value; aba === 'paginas' ? telaPaginas(area) : telaFaq(area); });
    const botaoAba = (id, rotulo, qtd) => el('button', {
      type: 'button', role: 'tab', class: 'aba', 'aria-selected': aba === id ? 'true' : 'false',
      onclick: () => { aba = id; busca = ''; desenhar(); }
    }, rotulo, el('span', { class: 'aba-qtd' }, String(qtd)));
    if (aba === 'paginas') telaPaginas(area); else telaFaq(area);
    conteiner.replaceChildren(...[
      el('div', { class: 'cabecalho-modulo' },
        el('div', null, el('h1', null, 'Páginas e perguntas frequentes'),
          el('p', { class: 'sub' }, 'Páginas livres do site e as perguntas mais comuns do cidadão.')),
        podeGravar() ? el('button', { type: 'button', class: 'btn btn-primario', onclick: () => aba === 'paginas' ? formPagina() : formFaq() },
          aba === 'paginas' ? '+ Nova página' : '+ Nova pergunta') : null),
      P.estado.alcanceUnidade && perm.editar ? el('p', { class: 'msg msg-info' }, 'Páginas e perguntas valem para o órgão todo: só quem tem acesso ao órgão inteiro altera.') : null,
      el('div', { class: 'abas', role: 'tablist' }, botaoAba('paginas', 'Páginas', paginas.length), botaoAba('faq', 'Perguntas frequentes', faq.length)),
      el('div', { class: 'painel-guia' }, campoBusca, area)
    ].filter(Boolean));
  }

  async function recarregar() {
    try { await carregar(); desenhar(); } catch (e) { mostrarErro(e); }
  }

  P.telas.paginas = async function (c, mod, p) {
    perm = p; conteiner = c;
    c.replaceChildren(el('h1', null, 'Páginas e perguntas frequentes'), el('p', { class: 'sub' }, 'Carregando…'));
    try { await carregar(); desenhar(); }
    catch (e) { c.querySelector('.sub').textContent = P.erroGravacao(e); }
  };
})();
