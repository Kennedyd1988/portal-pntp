// =====================================================================
// Módulo "Menu do site" (Lote 3)
// Itens principais e subitens (dois níveis). Cada item aponta para uma
// tela do site, uma página institucional ou um link externo.
// O menu é curto (dezenas de itens): carrega de uma vez.
// =====================================================================
(function () {
  'use strict';
  const P = window.PNTP;
  const { sb, el, toast, ocupado, erroCampo, ordemAlfabetica, campo } = P;

  // Telas do site público (construído no Lote 5). Rotas fixas, iguais para todo órgão.
  const ROTAS = [
    ['/', 'Página inicial'], ['/noticias', 'Notícias'], ['/publicacoes', 'Publicações oficiais (leis, decretos…)'],
    ['/diario-oficial', 'Diário Oficial'], ['/transparencia', 'Transparência'], ['/planejamento', 'Planejamento e prestação de contas'], ['/licitacoes', 'Licitações'], ['/licitacoes/pca', 'Plano de contratações anual (PCA)'], ['/licitacoes/sancionados', 'Licitantes e contratados sancionados'], ['/contratos', 'Contratos'], ['/contratos/fiscais', 'Fiscais de contratos'], ['/obras', 'Obras'], ['/obras/paralisadas', 'Obras paralisadas'], ['/convenios', 'Convênios e transferências'], ['/emendas', 'Emendas parlamentares'], ['/concursos', 'Concursos e processos seletivos'],
    ['/estrutura', 'Estrutura organizacional'], ['/gestores', 'Gestores'], ['/servicos', 'Carta de Serviços'], ['/servicos-online', 'Serviços on-line'],
    ['/faq', 'Perguntas frequentes'], ['/ouvidoria', 'Ouvidoria'], ['/esic', 'e-SIC (acesso à informação)'],
    ['/lgpd', 'Proteção de dados (LGPD)'], ['/acessibilidade', 'Acessibilidade'], ['/contato', 'Contato'], ['/mapa-do-site', 'Mapa do site']
  ];
  const nomeRota = (r) => (ROTAS.find((x) => x[0] === r) || [r, r])[1];

  // Menu sugerido para começar (o órgão ajusta depois).
  const MENU_PADRAO = [
    ['Início', '/'],
    ['Institucional', '/estrutura', [['Estrutura organizacional', '/estrutura'], ['Gestores', '/gestores'], ['Perguntas frequentes', '/faq']]],
    ['Transparência', '/transparencia', [['Portal da Transparência', '/transparencia'], ['Planejamento e contas', '/planejamento'], ['Licitações', '/licitacoes'],
      ['Contratos', '/contratos'], ['Obras', '/obras'], ['Convênios e transferências', '/convenios'], ['Emendas parlamentares', '/emendas']]],
    ['Publicações', '/publicacoes', [['Leis, decretos e portarias', '/publicacoes'], ['Diário Oficial', '/diario-oficial']]],
    ['Notícias', '/noticias'],
    ['Serviços', '/servicos', [['Carta de Serviços ao Usuário', '/servicos'], ['Serviços on-line', '/servicos-online']]],
    ['Atendimento', '/contato', [['Ouvidoria', '/ouvidoria'], ['e-SIC', '/esic'], ['Contato', '/contato']]]
  ];

  let perm = {};
  let conteiner = null;
  let itens = [], paginas = [];

  const mostrarErro = (e) => toast(P.erroGravacao(e), true);
  const podeGravar = () => perm.editar && !P.estado.alcanceUnidade;
  const porOrdem = (a, b) => a.ordem - b.ordem || ordemAlfabetica(a.rotulo, b.rotulo);
  const principais = () => itens.filter((i) => !i.pai_id).sort(porOrdem);
  const filhos = (id) => itens.filter((i) => i.pai_id === id).sort(porOrdem);

  async function carregar() {
    const org = P.estado.orgao.id;
    const [m, p] = await Promise.all([
      sb.from('menu_itens').select('*').eq('orgao_id', org).limit(300),
      sb.from('paginas').select('slug, titulo, situacao').eq('orgao_id', org).limit(300)
    ]);
    if (m.error) throw m.error;
    if (p.error) throw p.error;
    itens = m.data; paginas = p.data.sort((a, b) => ordemAlfabetica(a.titulo, b.titulo));
  }

  function descreverDestino(i) {
    if (i.tipo === 'interno') return 'Tela do site: ' + nomeRota(i.destino);
    if (i.tipo === 'pagina') {
      const pg = paginas.find((p) => p.slug === i.destino);
      return pg ? 'Página: ' + pg.titulo + (pg.situacao === 'publicado' ? '' : ' (rascunho)') : 'Página removida';
    }
    return 'Link externo: ' + i.destino;
  }

  function form(item, paiPadrao) {
    item = item || {};
    const temFilhos = item.id && filhos(item.id).length > 0;
    const rotulo = el('input', { type: 'text', maxlength: 60, value: item.rotulo || '' });
    const pai = el('select', { disabled: temFilhos }, el('option', { value: '' }, '— Item principal —'),
      principais().filter((p) => p.id !== item.id).map((p) => el('option', { value: p.id, selected: (item.pai_id || paiPadrao) === p.id }, 'Dentro de: ' + p.rotulo)));
    const tipo = el('select', null,
      el('option', { value: 'interno', selected: (item.tipo || 'interno') === 'interno' }, 'Tela do site'),
      el('option', { value: 'pagina', selected: item.tipo === 'pagina' }, 'Página institucional'),
      el('option', { value: 'link', selected: item.tipo === 'link' }, 'Link externo'));
    const rota = el('select', null, ROTAS.map(([r, n]) => el('option', { value: r, selected: item.tipo === 'interno' && item.destino === r }, n)));
    const pagina = el('select', null, paginas.length ? paginas.map((p) => el('option', { value: p.slug, selected: item.tipo === 'pagina' && item.destino === p.slug },
      p.titulo + (p.situacao === 'publicado' ? '' : ' (rascunho)'))) : el('option', { value: '' }, 'Nenhuma página criada'));
    const url = el('input', { type: 'url', value: item.tipo === 'link' ? item.destino : '', placeholder: 'https://…' });
    const novaAba = el('input', { type: 'checkbox', checked: item.id ? item.nova_aba : true });
    const ativo = el('input', { type: 'checkbox', checked: item.id ? item.ativo : true });

    const bRota = campo('mn-rota', 'Tela', rota);
    const bPagina = campo('mn-pagina', 'Página', pagina, paginas.length ? 'Página em rascunho só abre no site depois de publicada.' : 'Crie a página em "Páginas e perguntas frequentes".');
    const bLink = el('div', null, campo('mn-url', 'Endereço', url), el('label', { class: 'checkbox' }, novaAba, ' Abrir em nova aba'));
    const alternar = () => { bRota.hidden = tipo.value !== 'interno'; bPagina.hidden = tipo.value !== 'pagina'; bLink.hidden = tipo.value !== 'link'; };
    tipo.addEventListener('change', alternar); alternar();
    // Sugere o rótulo a partir da tela escolhida, se ainda estiver vazio.
    rota.addEventListener('change', () => { if (!rotulo.value.trim()) rotulo.value = nomeRota(rota.value); });

    const corpo = el('form', { class: 'form-dialogo', novalidate: true },
      el('div', { class: 'grade-campos' },
        campo('mn-rotulo', 'Texto do item', rotulo, 'Curto: aparece na barra do menu.', true),
        campo('mn-pai', 'Posição', pai, temFilhos ? 'Tem subitens: continua como item principal.' : null)),
      campo('mn-tipo', 'Leva para', tipo), bRota, bPagina, bLink,
      el('label', { class: 'checkbox' }, ativo, ' Aparece no site'));
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar');
    const dlg = P.abrirDialogo(item.id ? 'Editar item do menu' : 'Novo item do menu', corpo, [
      el('button', { type: 'button', class: 'btn btn-claro', onclick: () => dlg.close() }, 'Cancelar'), btn]);
    btn.addEventListener('click', async () => {
      const r = rotulo.value.trim();
      if (!erroCampo('mn-rotulo', r.length >= 2 ? '' : 'Escreva o texto do item.')) return;
      let destino;
      if (tipo.value === 'interno') destino = rota.value;
      if (tipo.value === 'pagina') { destino = pagina.value; if (!erroCampo('mn-pagina', destino ? '' : 'Escolha a página.')) return; }
      if (tipo.value === 'link') { destino = url.value.trim(); if (!erroCampo('mn-url', P.urlValida(destino) ? '' : 'Endereço completo, começando com https://')) return; }
      const paiId = pai.value || null;
      // Novo item vai para o fim do grupo.
      const irmaos = itens.filter((i) => (i.pai_id || null) === paiId && i.id !== item.id);
      const ordem = item.id && (item.pai_id || null) === paiId ? item.ordem : (irmaos.reduce((m, i) => Math.max(m, i.ordem), 0) + 10);
      ocupado(btn, 'Salvando…');
      try {
        await P.gravarRegistro('menu_itens', { rotulo: r, pai_id: paiId, tipo: tipo.value, destino, nova_aba: tipo.value === 'link' && novaAba.checked, ativo: ativo.checked, ordem }, item.id);
        dlg.close(); toast('Menu atualizado.'); await recarregar();
      } catch (e) { mostrarErro(e); }
      finally { ocupado(btn); }
    });
  }

  async function mover(item, direcao) {
    const irmaos = item.pai_id ? filhos(item.pai_id) : principais();
    const i = irmaos.findIndex((x) => x.id === item.id);
    const j = i + direcao;
    if (j < 0 || j >= irmaos.length) return;
    [irmaos[i], irmaos[j]] = [irmaos[j], irmaos[i]];
    // Renumera o grupo (10, 20, 30…) e grava só o que mudou.
    const mudancas = irmaos.map((x, k) => ({ x, ordem: (k + 1) * 10 })).filter((m) => m.x.ordem !== m.ordem);
    try {
      for (const m of mudancas) await P.gravarRegistro('menu_itens', { ordem: m.ordem }, m.x.id);
      await recarregar();
    } catch (e) { mostrarErro(e); }
  }

  async function excluir(item) {
    const sub = filhos(item.id);
    if (sub.length) {
      P.aviso('Não é possível excluir', '"' + item.rotulo + '" tem ' + sub.length + (sub.length === 1 ? ' subitem (' : ' subitens (') +
        sub.map((s) => s.rotulo).join(', ') + '). Exclua ou mova os subitens antes.');
      return;
    }
    if (!await P.confirmar('Excluir item', 'Tirar "' + item.rotulo + '" do menu?', 'Excluir', true)) return;
    const { data, error } = await sb.from('menu_itens').delete().eq('id', item.id).select('id');
    if (error) return mostrarErro(error);
    if (!data || !data.length) return toast('Seu perfil não pode alterar o menu.', true);
    toast('Item excluído.'); await recarregar();
  }

  async function criarPadrao(btn, substituir) {
    if (substituir && !await P.confirmar('Recriar menu padrão', 'Apagar todos os itens atuais do menu e criar o menu padrão de novo? Ajustes feitos à mão serão perdidos.', 'Recriar', true)) return;
    ocupado(btn, 'Criando…');
    try {
      const org = P.estado.orgao.id;
      if (substituir) {
        // Subitens primeiro: item com subitens não pode ser excluído (regra do banco).
        const r0 = await sb.from('menu_itens').delete().eq('orgao_id', org).not('pai_id', 'is', null);
        if (r0.error) throw r0.error;
        const r1 = await sb.from('menu_itens').delete().eq('orgao_id', org);
        if (r1.error) throw r1.error;
      }
      const prin = MENU_PADRAO.map(([rotulo, destino], k) => ({ orgao_id: org, rotulo, tipo: 'interno', destino, ordem: (k + 1) * 10 }));
      const { data, error } = await sb.from('menu_itens').insert(prin).select('id, rotulo');
      if (error) throw error;
      const sub = [];
      MENU_PADRAO.forEach(([rotulo, , filhosPadrao]) => {
        if (!filhosPadrao) return;
        const pai = data.find((d) => d.rotulo === rotulo);
        filhosPadrao.forEach(([r, d], k) => sub.push({ orgao_id: org, pai_id: pai.id, rotulo: r, tipo: 'interno', destino: d, ordem: (k + 1) * 10 }));
      });
      const r2 = await sb.from('menu_itens').insert(sub);
      if (r2.error) throw r2.error;
      toast('Menu padrão criado. Ajuste à vontade.');
      await recarregar();
    } catch (e) { mostrarErro(e); ocupado(btn); }
  }

  function linha(item, nivel, pos, qtd) {
    const g = podeGravar();
    return el('tr', { class: nivel ? 'linha-sub' : null },
      el('td', null, el('span', { class: nivel ? 'recuo' : null }, nivel ? '↳ ' : '', el('strong', null, item.rotulo)),
        item.ativo ? null : el('span', { class: 'etiqueta etiqueta-desativado', style: 'margin-left:6px' }, 'Oculto')),
      el('td', { class: 'quebra' }, descreverDestino(item), item.nova_aba ? el('span', { class: 'sub-linha' }, 'Abre em nova aba') : null),
      el('td', { class: 'acoes' },
        g ? el('button', { type: 'button', class: 'btn btn-claro btn-p', disabled: pos === 0, 'aria-label': 'Subir ' + item.rotulo, onclick: () => mover(item, -1) }, '↑') : null,
        g ? el('button', { type: 'button', class: 'btn btn-claro btn-p', disabled: pos === qtd - 1, 'aria-label': 'Descer ' + item.rotulo, onclick: () => mover(item, 1) }, '↓') : null,
        g && !nivel ? el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => form(null, item.id) }, '+ Subitem') : null,
        g ? el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => form(item) }, 'Editar') : null,
        perm.excluir && g ? el('button', { type: 'button', class: 'btn btn-claro btn-p btn-texto-perigo', onclick: () => excluir(item) }, 'Excluir') : null));
  }

  // Prévia simples de como o menu fica no topo do site.
  function previa() {
    const ativos = principais().filter((i) => i.ativo);
    if (!ativos.length) return null;
    return el('div', { class: 'menu-previa', 'aria-label': 'Prévia do menu' },
      el('span', { class: 'ajuda' }, 'Prévia:'),
      ativos.map((p) => {
        const sub = filhos(p.id).filter((s) => s.ativo);
        return el('span', { class: 'menu-previa-item' }, p.rotulo + (sub.length ? ' ▾' : ''),
          sub.length ? el('span', { class: 'menu-previa-sub' }, sub.map((s) => el('span', null, s.rotulo))) : null);
      }));
  }

  function desenhar() {
    const linhas = [];
    const prin = principais();
    prin.forEach((p, k) => {
      linhas.push(linha(p, 0, k, prin.length));
      const f = filhos(p.id);
      f.forEach((s, j) => linhas.push(linha(s, 1, j, f.length)));
    });
    const btnPadrao = el('button', { type: 'button', class: 'btn btn-primario' }, 'Criar menu padrão');
    btnPadrao.addEventListener('click', () => criarPadrao(btnPadrao));
    conteiner.replaceChildren(...[
      el('div', { class: 'cabecalho-modulo' },
        el('div', null, el('h1', null, 'Menu do site'),
          el('p', { class: 'sub' }, 'Itens da barra de navegação do site, com até um nível de subitens.')),
        podeGravar() && itens.length ? el('div', { class: 'botoes-cabecalho' },
          perm.excluir ? el('button', { type: 'button', class: 'btn btn-claro', onclick: (e) => criarPadrao(e.currentTarget, true) }, 'Recriar menu padrão') : null,
          el('button', { type: 'button', class: 'btn btn-primario', onclick: () => form() }, '+ Novo item')) : null),
      previa(),
      itens.length
        ? el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela' },
          el('thead', null, el('tr', null, el('th', { scope: 'col' }, 'Item'), el('th', { scope: 'col' }, 'Leva para'), el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Ações')))),
          el('tbody', null, linhas)))
        : el('div', { class: 'vazio' },
          el('p', null, 'O menu ainda está vazio.'),
          podeGravar() ? el('p', null, 'Comece pelo menu padrão (Início, Institucional, Transparência, Publicações, Notícias, Serviços, Atendimento) e ajuste depois.') : null,
          podeGravar() ? el('div', { class: 'botoes-cabecalho', style: 'justify-content:center' }, btnPadrao,
            el('button', { type: 'button', class: 'btn btn-claro', onclick: () => form() }, 'Começar do zero')) : null)
    ].filter(Boolean));
  }

  async function recarregar() {
    try { await carregar(); desenhar(); } catch (e) { mostrarErro(e); }
  }

  P.telas.menu = async function (c, mod, p) {
    perm = p; conteiner = c;
    c.replaceChildren(el('h1', null, 'Menu do site'), el('p', { class: 'sub' }, 'Carregando…'));
    try { await carregar(); desenhar(); }
    catch (e) { c.querySelector('.sub').textContent = P.erroGravacao(e); }
  };
})();
