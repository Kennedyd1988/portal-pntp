// =====================================================================
// Módulo "Histórico de alterações" (Lote 2)
// Quem alterou o quê e quando. O histórico cresce sem limite, então
// carrega 50 por vez (cursor pelo id, mais novo primeiro) com "Carregar mais".
// Um filtro para cada coluna: data, quem alterou, ação e área.
// =====================================================================
(function () {
  'use strict';
  const P = window.PNTP;
  const { sb, el, toast, traduzirErro, ordemAlfabetica } = P;
  const LOTE = 50;

  const AREAS = {
    orgaos: 'Aparência e dados do órgão',
    unidades: 'Unidades',
    gestores: 'Gestores',
    usuarios_orgaos: 'Acesso de usuários',
    noticias: 'Notícias', banners: 'Banners', avisos: 'Avisos', publicacoes: 'Publicações oficiais',
    paginas: 'Páginas', faq: 'Perguntas frequentes', menu_itens: 'Menu do site',
    servicos: 'Carta de Serviços', carta_servicos: 'Textos da Carta de Serviços', lgpd: 'LGPD e Governo Digital',
    perfis: 'Perfis',
    perfil_permissoes: 'Permissões de perfil'
  };
  const ACOES = { inserir: 'Inclusão', editar: 'Edição', excluir: 'Exclusão' };

  // Nome legível de cada campo (o que não estiver aqui aparece com o nome técnico).
  const CAMPOS = {
    nome: 'Nome', sigla: 'Sigla', telefone: 'Telefone', email: 'E-mail', endereco: 'Endereço',
    horario_atendimento: 'Horário de atendimento', competencias: 'Competências', norma_criacao: 'Norma de criação',
    norma_url: 'PDF da norma', unidade_pai_id: 'Fica dentro de', ativo: 'Ativo', ordem: 'Ordem',
    cargo: 'Cargo', foto_url: 'Foto', curriculo_url: 'Currículo', destaque_capa: 'Na página inicial',
    unidade_id: 'Unidade / alcance', unidades_relacionadas: 'Outras secretarias envolvidas',
    titulo: 'Título', resumo: 'Resumo', conteudo: 'Texto', capa_url: 'Foto de capa', capa_legenda: 'Descrição da foto',
    categoria: 'Categoria', situacao: 'Situação', publicado_em: 'Data de publicação', destaque: 'Destaque',
    tipo: 'Tipo', numero: 'Número', ano: 'Ano', data_publicacao: 'Data', ementa: 'Ementa', arquivo_url: 'PDF',
    link_externo: 'Link', vigencia: 'Situação do ato', observacao: 'Observação', slug: 'Endereço',
    pergunta: 'Pergunta', resposta: 'Resposta', rotulo: 'Texto do item', destino: 'Leva para', pai_id: 'Fica dentro de',
    publico_alvo: 'Quem pode pedir', requisitos: 'Requisitos e documentos', etapas: 'Etapas', prazo_maximo: 'Prazo máximo',
    forma_prestacao: 'Forma de prestação', link_digital: 'Endereço pela internet', local_atendimento: 'Local', horario: 'Horário',
    custo: 'Custo', prioridades: 'Atendimento prioritário', tempo_espera: 'Tempo de espera', manifestacao: 'Onde se manifestar',
    apresentacao: 'Apresentação', compromissos: 'Compromissos', encarregado_nome: 'Encarregado', encarregado_cargo: 'Cargo do encarregado',
    encarregado_email: 'E-mail do encarregado', encarregado_telefone: 'Telefone do encarregado', encarregado_ato: 'Ato de designação',
    encarregado_ato_url: 'Link do ato', politica_texto: 'Política de privacidade', politica_url: 'PDF da política',
    politica_atualizada_em: 'Política atualizada em', gov_digital_publicacao: 'Norma do Governo Digital', gov_digital_texto: 'Norma (texto)',
    gov_digital_url: 'Link da norma', dados_abertos_texto: 'Regras dos dados abertos',
    imagem_url: 'Imagem', link_url: 'Link', inicio: 'Início', fim: 'Fim', texto: 'Texto', nivel: 'Nível', perfil_id: 'Perfil', usuario_id: 'Pessoa', descricao: 'Descrição',
    dominio: 'Domínio', modulo: 'Módulo', pode_ver: 'Ver', pode_editar: 'Cadastrar e editar',
    pode_publicar: 'Publicar', pode_excluir: 'Excluir',
    'configuracoes.nome_exibicao': 'Nome exibido no site', 'configuracoes.cor_principal': 'Cor principal',
    'configuracoes.brasao_url': 'Brasão', 'configuracoes.endereco': 'Endereço', 'configuracoes.cep': 'CEP',
    'configuracoes.telefone': 'Telefone', 'configuracoes.email': 'E-mail', 'configuracoes.horario': 'Horário',
    'configuracoes.instagram': 'Instagram', 'configuracoes.facebook': 'Facebook', 'configuracoes.youtube': 'YouTube',
    'configuracoes.whatsapp': 'WhatsApp'
  };
  // Campos técnicos que não interessam ao usuário.
  const IGNORAR = new Set(['id', 'orgao_id', 'criado_em', 'atualizado_em', 'busca', 'data_ordem', 'autor_id']);

  let conteiner = null;
  let itens = [];
  let fim = false;
  let carregando = false;
  const filtros = { de: '', ate: '', usuario: '', acao: '', tabela: '' };
  // Nomes para traduzir ids (unidade, perfil, pessoa) em texto.
  const nomes = { unidades: {}, perfis: {}, pessoas: {}, modulos: {} };
  let autores = [];

  async function carregarApoio() {
    const org = P.estado.orgao.id;
    const pode = (m) => P.estado.permissoes[m] && P.estado.permissoes[m].ver;
    const [un, pf, au, pe] = await Promise.all([
      sb.from('unidades').select('id, nome').eq('orgao_id', org).limit(500),
      sb.from('perfis').select('id, nome').or('orgao_id.is.null,orgao_id.eq.' + org),
      sb.rpc('autores_historico', { p_orgao: org }),
      pode('usuarios') ? sb.rpc('usuarios_do_orgao', { p_orgao: org }) : Promise.resolve({ data: [] })
    ]);
    if (au.error) throw au.error;
    for (const u of un.data || []) nomes.unidades[u.id] = u.nome;
    for (const p of pf.data || []) nomes.perfis[p.id] = p.nome;
    for (const p of pe.data || []) nomes.pessoas[p.usuario_id] = p.nome || p.email;
    for (const a of au.data || []) if (!nomes.pessoas[a.usuario_id]) nomes.pessoas[a.usuario_id] = a.nome.replace(/ \(suporte SOFT\+\)$/, '');
    for (const m of P.estado.modulos) nomes.modulos[m.codigo] = m.nome;
    autores = (au.data || []).sort((a, b) => ordemAlfabetica(a.nome, b.nome));
  }

  async function buscar(reiniciar) {
    if (carregando) return;
    carregando = true;
    if (reiniciar) { itens = []; fim = false; }
    const ultimo = itens.length ? itens[itens.length - 1].id : null;
    const { data, error } = await sb.rpc('historico_do_orgao', {
      p_orgao: P.estado.orgao.id, p_antes: ultimo, p_limite: LOTE,
      p_tabela: filtros.tabela || null, p_usuario: filtros.usuario || null, p_acao: filtros.acao || null,
      p_de: filtros.de || null, p_ate: filtros.ate || null
    });
    carregando = false;
    if (error) { toast(traduzirErro(error), true); return; }
    itens = itens.concat(data);
    fim = data.length < LOTE;
    desenharLista();
  }

  // ---------- texto de cada linha ----------
  function achatar(obj) {
    // configuracoes (jsonb) vira configuracoes.cor_principal etc., para comparar campo a campo.
    const r = {};
    for (const [k, v] of Object.entries(obj || {})) {
      if (k === 'configuracoes' && v && typeof v === 'object') for (const [k2, v2] of Object.entries(v)) r['configuracoes.' + k2] = v2;
      else r[k] = v;
    }
    return r;
  }

  function camposAlterados(h) {
    const a = achatar(h.dados_antes), b = achatar(h.dados_depois);
    const chaves = new Set([...Object.keys(a), ...Object.keys(b)]);
    const r = [];
    for (const k of chaves) {
      if (IGNORAR.has(k)) continue;
      if (h.acao === 'editar' && JSON.stringify(a[k]) === JSON.stringify(b[k])) continue;
      if (h.acao !== 'editar' && (b[k] ?? a[k]) == null) continue;   // inclusão/exclusão: só campos preenchidos
      r.push(k);
    }
    return r;
  }

  function valorLegivel(campo, v) {
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
    if (campo === 'unidade_id' || campo === 'unidade_pai_id') return nomes.unidades[v] || (campo === 'unidade_id' ? 'Unidade removida' : '—');
    if (campo === 'perfil_id') return nomes.perfis[v] || 'Perfil removido';
    if (campo === 'usuario_id') return nomes.pessoas[v] || 'Pessoa';
    if (campo === 'modulo') return nomes.modulos[v] || v;
    if (campo === 'unidades_relacionadas' && Array.isArray(v)) return v.length ? v.map((id) => nomes.unidades[id] || 'Unidade removida').join(', ') : '—';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  function descrever(h) {
    const x = h.dados_depois || h.dados_antes || {};
    switch (h.tabela) {
      case 'orgaos': return 'Dados do órgão';
      case 'usuarios_orgaos': {
        const quem = nomes.pessoas[x.usuario_id] || 'uma pessoa';
        return 'Acesso de ' + quem + (x.perfil_id ? ' · ' + (nomes.perfis[x.perfil_id] || 'perfil') : '');
      }
      case 'perfil_permissoes': return (nomes.perfis[x.perfil_id] || 'Perfil') + ' · ' + (nomes.modulos[x.modulo] || x.modulo);
      case 'publicacoes': return (x.tipo || '') + (x.numero ? ' nº ' + x.numero : '') + (x.ano ? '/' + x.ano : '');
      case 'faq': return x.pergunta || '—';
      case 'carta_servicos': return 'Textos gerais da Carta';
      case 'lgpd': return 'Encarregado, política e Governo Digital';
      case 'menu_itens': return 'Item "' + (x.rotulo || '') + '"';
      case 'avisos': return x.texto || '—';
      default: return x.nome || x.titulo || x.email || '—';
    }
  }

  function resumoMudanca(h) {
    if (h.acao !== 'editar') return null;
    const c = camposAlterados(h);
    if (!c.length) return null;
    const nomesCampos = c.map((k) => CAMPOS[k] || k);
    return nomesCampos.slice(0, 4).join(', ') + (nomesCampos.length > 4 ? ' e mais ' + (nomesCampos.length - 4) : '');
  }

  const dataHora = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  function detalhes(h) {
    const campos = camposAlterados(h);
    const a = achatar(h.dados_antes), b = achatar(h.dados_depois);
    const corpo = el('div', null,
      el('dl', { class: 'dados' },
        el('dt', null, 'Quando'), el('dd', null, dataHora(h.criado_em)),
        el('dt', null, 'Quem'), el('dd', null, h.usuario_nome),
        el('dt', null, 'Ação'), el('dd', null, ACOES[h.acao] + ' · ' + (AREAS[h.tabela] || h.tabela)),
        el('dt', null, 'Registro'), el('dd', null, descrever(h))
      ),
      campos.length ? el('div', { class: 'tabela-caixa', style: 'margin-top:14px' }, el('table', { class: 'tabela tabela-compacta' },
        el('thead', null, el('tr', null,
          el('th', { scope: 'col' }, 'Campo'),
          h.acao !== 'inserir' ? el('th', { scope: 'col' }, 'Antes') : null,
          h.acao !== 'excluir' ? el('th', { scope: 'col' }, h.acao === 'inserir' ? 'Valor' : 'Depois') : null)),
        el('tbody', null, campos.map((k) => el('tr', null,
          el('td', null, CAMPOS[k] || k),
          h.acao !== 'inserir' ? el('td', { class: 'quebra' }, valorLegivel(k, a[k])) : null,
          h.acao !== 'excluir' ? el('td', { class: 'quebra' }, valorLegivel(k, b[k])) : null)))
      )) : el('p', { class: 'ajuda' }, 'Sem campos alterados.')
    );
    const dlg = P.abrirDialogo('Detalhes da alteração', corpo, [
      el('button', { type: 'button', class: 'btn btn-primario', onclick: () => dlg.close() }, 'Fechar')
    ]);
    dlg.classList.add('dialogo-largo');
  }

  // ---------- tela ----------
  let areaLista = null;

  function desenharLista() {
    if (!areaLista) return;
    if (!itens.length) {
      areaLista.replaceChildren(el('p', { class: 'vazio' }, carregando ? 'Carregando…' : 'Nenhuma alteração encontrada com esses filtros.'));
      return;
    }
    const tabela = el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela' },
      el('thead', null, el('tr', null,
        ['Data e hora', 'Quem alterou', 'Ação', 'Área', 'Registro'].map((t) => el('th', { scope: 'col' }, t)),
        el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Detalhes')))),
      el('tbody', null, itens.map((h) => el('tr', null,
        el('td', { class: 'num' }, dataHora(h.criado_em)),
        el('td', null, h.usuario_nome),
        el('td', null, el('span', { class: 'etiqueta etiqueta-' + h.acao }, ACOES[h.acao])),
        el('td', null, AREAS[h.tabela] || h.tabela),
        el('td', null, descrever(h), resumoMudanca(h) ? el('span', { class: 'sub-linha' }, 'Mudou: ' + resumoMudanca(h)) : null),
        el('td', { class: 'acoes' }, el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => detalhes(h) }, 'Detalhes'))
      )))
    ));
    const rodape = el('div', { class: 'rodape-lista' },
      el('span', { class: 'ajuda' }, itens.length + (itens.length === 1 ? ' alteração exibida' : ' alterações exibidas')),
      fim ? null : el('button', {
        type: 'button', class: 'btn btn-claro',
        onclick: (ev) => { P.ocupado(ev.target, 'Carregando…'); buscar(false); }
      }, 'Carregar mais'));
    areaLista.replaceChildren(tabela, rodape);
  }

  function desenhar() {
    const de = el('input', { type: 'date', value: filtros.de, 'aria-label': 'De' });
    const ate = el('input', { type: 'date', value: filtros.ate, 'aria-label': 'Até' });
    const quem = el('select', { 'aria-label': 'Quem alterou' }, el('option', { value: '' }, 'Qualquer pessoa'),
      autores.map((a) => el('option', { value: a.usuario_id, selected: filtros.usuario === a.usuario_id }, a.nome)));
    const acao = el('select', { 'aria-label': 'Ação' }, el('option', { value: '' }, 'Qualquer ação'),
      Object.entries(ACOES).map(([k, v]) => el('option', { value: k, selected: filtros.acao === k }, v)));
    const area = el('select', { 'aria-label': 'Área' }, el('option', { value: '' }, 'Todas as áreas'),
      Object.entries(AREAS).sort((x, y) => ordemAlfabetica(x[1], y[1])).map(([k, v]) => el('option', { value: k, selected: filtros.tabela === k }, v)));

    const aplicar = () => {
      if (de.value && ate.value && de.value > ate.value) { toast('A data inicial é depois da final.', true); return; }
      Object.assign(filtros, { de: de.value, ate: ate.value, usuario: quem.value, acao: acao.value, tabela: area.value });
      areaLista.replaceChildren(el('p', { class: 'vazio' }, 'Carregando…'));
      buscar(true);
    };
    for (const c of [de, ate, quem, acao, area]) c.addEventListener('change', aplicar);
    const limpar = el('button', { type: 'button', class: 'btn btn-claro', onclick: () => {
      Object.assign(filtros, { de: '', ate: '', usuario: '', acao: '', tabela: '' });
      desenhar(); buscar(true);
    } }, 'Limpar filtros');

    areaLista = el('div', null, el('p', { class: 'vazio' }, 'Carregando…'));
    conteiner.replaceChildren(
      el('div', { class: 'cabecalho-modulo' },
        el('div', null,
          el('h1', null, 'Histórico de alterações'),
          el('p', { class: 'sub' }, 'Tudo o que foi incluído, alterado ou excluído no painel, com data, hora e responsável. Ninguém consegue apagar estes registros.'))),
      el('div', { class: 'filtros filtros-historico' },
        el('label', { class: 'filtro-data' }, 'De', de),
        el('label', { class: 'filtro-data' }, 'Até', ate),
        quem, acao, area, limpar),
      areaLista
    );
    desenharLista();
  }

  P.telas.historico = async function (c) {
    conteiner = c;
    c.replaceChildren(el('h1', null, 'Histórico de alterações'), el('p', { class: 'sub' }, 'Carregando…'));
    try {
      await carregarApoio();
      desenhar();
      await buscar(true);
    } catch (e) { c.querySelector('.sub').textContent = traduzirErro(e); }
  };
})();
