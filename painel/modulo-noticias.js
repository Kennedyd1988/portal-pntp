// =====================================================================
// Módulo "Notícias, banners e avisos" (Lote 3)
// Notícias: rascunho → publicado (quem só cadastra não publica; o banco
// garante). Lista paginada no servidor, 50 por vez, um filtro por coluna.
// Banners e avisos: com período de exibição; saem do ar sozinhos.
// =====================================================================
(function () {
  'use strict';
  const P = window.PNTP;
  const { sb, el, toast, ocupado, erroCampo, normalizar, ordemAlfabetica, campo } = P;
  const LOTE = 50;
  const CATEGORIAS = ['Administração', 'Agricultura', 'Assistência Social', 'Cultura', 'Educação', 'Esporte',
    'Eventos', 'Infraestrutura e Obras', 'Meio Ambiente', 'Saúde', 'Tributos', 'Turismo'];

  let perm = {};
  let conteiner = null;
  let aba = 'noticias';
  let unidades = [];

  const alcance = () => P.estado.alcanceUnidade;
  const nomeUnidade = (id) => (unidades.find((u) => u.id === id) || {}).nome || '';
  const mostrarErro = (e) => toast(P.erroGravacao(e), true);
  const agora = () => new Date().toISOString();

  function situacaoNoticia(n) {
    if (n.situacao === 'rascunho') return ['rascunho', 'Rascunho'];
    if (n.publicado_em && new Date(n.publicado_em) > new Date()) return ['agendado', 'Agendada'];
    return ['publicado', 'Publicada'];
  }

  function seletorUnidade(atual, obrigatoria) {
    if (alcance()) return el('select', { disabled: true }, el('option', { value: alcance() }, nomeUnidade(alcance())));
    return el('select', null,
      el('option', { value: '' }, obrigatoria ? '— Escolha —' : '— Órgão todo —'),
      [...unidades].sort((a, b) => ordemAlfabetica(a.nome, b.nome)).map((u) => el('option', { value: u.id, selected: u.id === atual }, u.nome)));
  }

  // Imagem escolhida: reduzida no navegador antes do envio.
  function campoImagem(id, urlAtual, ladoMax, rotulo, ajuda) {
    const prev = el('div', { class: 'imagem-prev' });
    const mostrar = (src) => prev.replaceChildren(src ? el('img', { src, alt: '' }) : el('span', null, 'Sem imagem'));
    mostrar(urlAtual);
    const input = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp' });
    const estadoImg = { nova: null, url: urlAtual || null, remover: false };
    input.addEventListener('change', async () => {
      const f = input.files[0];
      if (!f) return;
      if (f.size > 15 * 1024 * 1024) { toast('A imagem passa de 15 MB.', true); input.value = ''; return; }
      try { estadoImg.nova = await P.reduzirImagem(f, ladoMax); mostrar(URL.createObjectURL(estadoImg.nova.blob)); }
      catch (e) { toast(e.message, true); }
    });
    return { elemento: el('div', { class: 'imagem-campo' }, prev, campo(id, rotulo, input, ajuda)), estadoImg };
  }

  // ======================= NOTÍCIAS =======================
  const filtrosN = { busca: '', categoria: '', unidade: '', situacao: '', de: '', ate: '' };
  let noticias = [], fimN = false, totalN = 0;

  function consultaNoticias(sel, opcoes) {
    let q = sb.from('noticias').select(sel, opcoes).eq('orgao_id', P.estado.orgao.id);
    const f = filtrosN;
    if (f.busca) q = q.ilike('busca', '%' + normalizar(f.busca).replace(/[%_]/g, '') + '%');
    if (f.categoria) q = q.eq('categoria', f.categoria);
    if (f.unidade === 'nenhuma') q = q.is('unidade_id', null);
    // Responsável OU envolvida: a notícia conjunta aparece no filtro das duas secretarias.
    else if (f.unidade) q = q.or('unidade_id.eq.' + f.unidade + ',unidades_relacionadas.cs.{' + f.unidade + '}');
    if (f.situacao === 'rascunho') q = q.eq('situacao', 'rascunho');
    if (f.situacao === 'publicado') q = q.eq('situacao', 'publicado').lte('publicado_em', agora());
    if (f.situacao === 'agendado') q = q.eq('situacao', 'publicado').gt('publicado_em', agora());
    if (f.de) q = q.gte('data_ordem', new Date(f.de + 'T00:00:00').toISOString());
    if (f.ate) q = q.lt('data_ordem', new Date(new Date(f.ate + 'T00:00:00').getTime() + 864e5).toISOString());
    return q;
  }

  async function carregarNoticias(reiniciar) {
    const ultimo = reiniciar ? null : noticias[noticias.length - 1];
    const [pag, total] = await Promise.all([
      P.paginar(consultaNoticias, 'data_ordem', ultimo, LOTE),
      reiniciar ? P.contar(consultaNoticias) : Promise.resolve(totalN)
    ]);
    noticias = reiniciar ? pag.linhas : noticias.concat(pag.linhas);
    fimN = pag.fim; totalN = total;
  }

  function formNoticia(n) {
    n = n || {};
    const publicada = n.situacao === 'publicado';
    const travada = publicada && !perm.publicar;   // só quem publica mexe no que está no ar
    const f = {
      titulo: el('input', { type: 'text', maxlength: 200, value: n.titulo || '' }),
      resumo: el('textarea', { rows: 2, maxlength: 400 }),
      unidade: seletorUnidade(n.unidade_id, false),
      data: el('input', { type: 'datetime-local', value: P.paraDataHoraLocal(n.publicado_em) }),
      legenda: el('input', { type: 'text', maxlength: 200, value: n.capa_legenda || '' }),
      destaque: el('input', { type: 'checkbox', checked: !!n.destaque })
    };
    f.resumo.value = n.resumo || '';
    const editor = P.editorTexto('nt-conteudo', n.conteudo, 12);
    // Categorias fixas + as que já foram usadas nas notícias carregadas.
    const categoria = P.campoOutra('nt-categoria', 'Categoria', CATEGORIAS.concat(noticias.map((x) => x.categoria)), n.categoria, null, '— Sem categoria —');
    // Outras secretarias envolvidas: a notícia aparece também na página delas no site.
    // Quem edita continua sendo só a unidade responsável.
    const relacionadas = new Set(n.unidades_relacionadas || []);
    const caixaRel = el('div', { class: 'lista-marcar', role: 'group', 'aria-labelledby': 'nt-rel-rotulo' });
    const desenharRel = () => {
      const resp = f.unidade.value;
      caixaRel.replaceChildren(...[...unidades].sort((a, b) => ordemAlfabetica(a.nome, b.nome))
        .filter((u) => u.id !== resp)
        .map((u) => {
          const cb = el('input', { type: 'checkbox', value: u.id, checked: relacionadas.has(u.id) });
          cb.addEventListener('change', () => { cb.checked ? relacionadas.add(u.id) : relacionadas.delete(u.id); });
          return el('label', { class: 'checkbox' }, cb, ' ' + u.nome);
        }));
    };
    f.unidade.addEventListener('change', () => { relacionadas.delete(f.unidade.value); desenharRel(); });
    desenharRel();
    const capa = campoImagem('nt-capa', n.capa_url, 1600, 'Foto de capa', 'Reduzida automaticamente.');
    const contador = el('span', { class: 'ajuda' });
    const contar = () => { contador.textContent = f.resumo.value.length + '/400 caracteres. Aparece na lista de notícias e nas redes sociais.'; };
    f.resumo.addEventListener('input', contar); contar();

    const corpo = el('form', { class: 'form-dialogo', novalidate: true },
      travada ? el('p', { class: 'msg msg-info' }, 'Esta notícia está publicada. Só quem tem permissão de publicar pode alterá-la.') : null,
      P.abas([
        ['texto', 'Texto', [
          campo('nt-titulo', 'Título', f.titulo, null, true),
          el('div', { class: 'campo' }, el('label', { for: 'nt-resumo' }, 'Resumo'), Object.assign(f.resumo, { id: 'nt-resumo' }), contador),
          el('div', { class: 'campo' }, el('label', { for: 'nt-conteudo' }, 'Texto da notícia'), editor.elemento)]],
        ['foto', 'Foto de capa', [
          capa.elemento,
          campo('nt-legenda', 'Descrição da foto', f.legenda, 'Obrigatória quando há foto: é lida por quem usa leitor de tela (acessibilidade).')]],
        ['publicacao', 'Secretarias e publicação', [
          el('div', { class: 'grade-campos' }, categoria.campo, campo('nt-unidade', 'Unidade responsável', f.unidade)),
          el('div', { class: 'campo' },
            el('span', { class: 'rotulo', id: 'nt-rel-rotulo' }, 'Outras secretarias envolvidas'),
            caixaRel,
            el('span', { class: 'ajuda' }, 'Opcional. Ex.: campanha da Saúde com a Educação. A notícia aparece também na página dessas secretarias; quem edita continua sendo só a unidade responsável.')),
          el('div', { class: 'grade-campos' },
            campo('nt-data', 'Data de publicação', f.data, 'Data futura = a notícia entra no ar sozinha nesse dia e hora.'),
            el('label', { class: 'centro-v checkbox' }, f.destaque, ' Destacar na página inicial'))]]
      ])
    );
    if (travada) for (const i of corpo.querySelectorAll('input, textarea, select, .editor-barra button')) i.disabled = true;

    const acoes = [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => dlg.close() }, travada ? 'Fechar' : 'Cancelar')];
    const btnRascunho = el('button', { type: 'button', class: 'btn btn-claro' }, publicada ? 'Tirar do ar (rascunho)' : 'Salvar rascunho');
    const btnPublicar = el('button', { type: 'button', class: 'btn btn-primario' }, publicada ? 'Salvar' : 'Publicar');
    if (!travada) {
      if (!publicada || perm.publicar) acoes.push(btnRascunho);
      if (perm.publicar) acoes.push(btnPublicar);
    }
    const dlg = P.abrirDialogo(n.id ? 'Editar notícia' : 'Nova notícia', corpo, acoes);
    dlg.classList.add('dialogo-largo');
    if (!perm.publicar && !travada) {
      corpo.prepend(el('p', { class: 'msg msg-info' }, 'Seu perfil cadastra rascunhos. Quem tem permissão de publicar revisa e coloca no ar.'));
    }

    async function salvar(situacao, btn) {
      const titulo = f.titulo.value.trim();
      if (!erroCampo('nt-titulo', titulo.length >= 3 ? '' : 'Informe o título (pelo menos 3 letras).')) return;
      const temFoto = capa.estadoImg.nova || capa.estadoImg.url;
      if (!erroCampo('nt-legenda', !temFoto || f.legenda.value.trim() ? '' : 'Descreva a foto em poucas palavras.')) return;
      if (situacao === 'publicado' && !editor.area.value.trim() && !f.resumo.value.trim()) {
        toast('Para publicar, escreva o resumo ou o texto da notícia.', true); return;
      }
      if (!erroCampo('nt-data', f.data.value ? '' : 'Informe a data de publicação.')) return;
      ocupado(btn, situacao === 'publicado' ? 'Publicando…' : 'Salvando…');
      try {
        const antiga = n.capa_url || null;
        let capaUrl = capa.estadoImg.url;
        if (capa.estadoImg.nova) capaUrl = await P.enviarArquivo('noticias', capa.estadoImg.nova.blob, capa.estadoImg.nova.ext);
        await P.gravarRegistro('noticias', {
          titulo, resumo: f.resumo.value.trim() || null, conteudo: editor.area.value.trim() || null,
          capa_url: capaUrl, capa_legenda: f.legenda.value.trim() || null,
          categoria: categoria.valor(), unidade_id: f.unidade.value || null,
          unidades_relacionadas: [...relacionadas].filter((id) => id !== f.unidade.value),
          publicado_em: new Date(f.data.value).toISOString(), destaque: f.destaque.checked, situacao
        }, n.id);
        if (antiga && antiga !== capaUrl) P.apagarArquivo(antiga);
        dlg.close();
        toast(situacao === 'publicado' ? (new Date(f.data.value) > new Date() ? 'Notícia agendada.' : 'Notícia publicada.') : 'Rascunho salvo.');
        await recarregar(true);
      } catch (e) { mostrarErro(e); }
      finally { ocupado(btn); }
    }
    btnRascunho.addEventListener('click', () => salvar('rascunho', btnRascunho));
    btnPublicar.addEventListener('click', () => salvar('publicado', btnPublicar));
    f.titulo.focus();
  }

  async function excluirNoticia(n) {
    // Vínculo: banner que abre esta notícia (o banco também barra).
    const { data: usados } = await sb.from('banners').select('titulo').eq('noticia_id', n.id).limit(5);
    if (usados && usados.length) {
      P.aviso('Não é possível excluir', 'A notícia "' + n.titulo + '" é aberta pelo banner "' + usados.map((b) => b.titulo).join('", "') +
        '". Troque o destino do banner (aba Banners) antes de excluir, ou só tire a notícia do ar.');
      return;
    }
    if (!await P.confirmar('Excluir notícia', 'Excluir "' + n.titulo + '"? Se ela só não deve mais aparecer, prefira "Tirar do ar".', 'Excluir', true)) return;
    const { data, error } = await sb.from('noticias').delete().eq('id', n.id).select('id');
    if (error) return mostrarErro(error);
    if (!data || !data.length) return toast('Seu perfil não pode excluir esta notícia.', true);
    P.apagarArquivo(n.capa_url);
    toast('Notícia excluída.');
    await recarregar(true);
  }

  const podeMexer = (unidadeId) => !alcance() || unidadeId === alcance();

  function telaNoticias(area) {
    const busca = el('input', { type: 'search', placeholder: 'Título ou resumo', value: filtrosN.busca, 'aria-label': 'Buscar por título ou resumo' });
    const cat = el('select', { 'aria-label': 'Categoria' }, el('option', { value: '' }, 'Todas as categorias'),
      CATEGORIAS.map((c) => el('option', { value: c, selected: filtrosN.categoria === c }, c)));
    const un = el('select', { 'aria-label': 'Unidade' }, el('option', { value: '' }, 'Todas as unidades'),
      el('option', { value: 'nenhuma', selected: filtrosN.unidade === 'nenhuma' }, 'Órgão todo (sem unidade)'),
      [...unidades].sort((a, b) => ordemAlfabetica(a.nome, b.nome)).map((u) => el('option', { value: u.id, selected: filtrosN.unidade === u.id }, u.nome)));
    const sit = el('select', { 'aria-label': 'Situação' }, el('option', { value: '' }, 'Qualquer situação'),
      [['publicado', 'Publicadas'], ['agendado', 'Agendadas'], ['rascunho', 'Rascunhos']].map(([v, r]) => el('option', { value: v, selected: filtrosN.situacao === v }, r)));
    const de = el('input', { type: 'date', value: filtrosN.de, 'aria-label': 'De' });
    const ate = el('input', { type: 'date', value: filtrosN.ate, 'aria-label': 'Até' });
    const lista = el('div');

    let espera = null;
    const aplicar = () => {
      Object.assign(filtrosN, { busca: busca.value.trim(), categoria: cat.value, unidade: un.value, situacao: sit.value, de: de.value, ate: ate.value });
      lista.replaceChildren(el('p', { class: 'vazio' }, 'Carregando…'));
      carregarNoticias(true).then(desenharLista).catch(mostrarErro);
    };
    busca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(aplicar, 350); });
    for (const c of [cat, un, sit, de, ate]) c.addEventListener('change', aplicar);

    function desenharLista() {
      if (!noticias.length) { lista.replaceChildren(el('p', { class: 'vazio' }, totalN === 0 && !Object.values(filtrosN).some(Boolean) ? 'Nenhuma notícia cadastrada ainda.' : 'Nenhuma notícia com esses filtros.')); return; }
      const btnMais = el('button', { type: 'button', class: 'btn btn-claro' }, 'Carregar mais');
      btnMais.addEventListener('click', async () => {
        ocupado(btnMais, 'Carregando…');
        try { await carregarNoticias(false); desenharLista(); } catch (e) { mostrarErro(e); ocupado(btnMais); }
      });
      lista.replaceChildren(
        el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela' },
          el('thead', null, el('tr', null, ['Notícia', 'Categoria', 'Unidade', 'Situação', 'Data'].map((t) => el('th', { scope: 'col' }, t)),
            el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Ações')))),
          el('tbody', null, noticias.map((n) => {
            const [cls, rot] = situacaoNoticia(n);
            const mexe = podeMexer(n.unidade_id);
            return el('tr', null,
              el('td', null,
                el('div', { class: 'pessoa' },
                  n.capa_url ? el('img', { src: n.capa_url, alt: '', class: 'miniatura' }) : el('span', { class: 'miniatura miniatura-vazia', 'aria-hidden': 'true' }),
                  el('span', null, el('strong', null, n.titulo), n.destaque ? el('span', { class: 'ml-1 etiqueta' }, 'Destaque') : null,
                    n.resumo ? el('span', { class: 'sub-linha corta' }, n.resumo) : null))),
              el('td', null, n.categoria || '—'),
              el('td', null, nomeUnidade(n.unidade_id) || 'Órgão todo',
                (n.unidades_relacionadas || []).length ? el('span', { class: 'sub-linha' },
                  'Com: ' + n.unidades_relacionadas.map(nomeUnidade).filter(Boolean).join(', ')) : null),
              el('td', null, el('span', { class: 'etiqueta etiqueta-' + cls }, rot)),
              el('td', { class: 'num' }, P.dataHoraBR(n.publicado_em || n.criado_em)),
              el('td', { class: 'acoes' },
                perm.editar && mexe ? el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => formNoticia(n) },
                  n.situacao === 'publicado' && !perm.publicar ? 'Ver' : 'Editar') : null,
                perm.excluir && mexe ? el('button', { type: 'button', class: 'btn btn-claro btn-p btn-texto-perigo', onclick: () => excluirNoticia(n) }, 'Excluir') : null));
          })))),
        el('div', { class: 'rodape-lista' },
          el('span', { class: 'ajuda' }, 'Mostrando ' + noticias.length + ' de ' + totalN),
          fimN ? null : btnMais));
    }

    area.replaceChildren(
      el('div', { class: 'filtros filtros-6' }, busca, cat, un, sit,
        el('label', { class: 'filtro-data' }, 'De', de), el('label', { class: 'filtro-data' }, 'Até', ate)),
      lista);
    desenharLista();
  }

  // ======================= BANNERS =======================
  let banners = [], fimB = false;
  // Traz junto o título da notícia que o banner abre (para mostrar na lista).
  const consultaBanners = (sel, op) => sb.from('banners').select(sel === '*' ? '*, noticias(titulo)' : sel, op).eq('orgao_id', P.estado.orgao.id);

  // "Ao clicar no banner": nada, uma notícia cadastrada ou um endereço.
  // A notícia é escolhida por busca (até 20 resultados), sem baixar a lista inteira.
  function destinoBanner(b, inputLink) {
    const tipoInicial = b.noticia_id ? 'noticia' : b.link_url ? 'link' : 'nada';
    const sel = el('select', null,
      el('option', { value: 'nada', selected: tipoInicial === 'nada' }, 'Não abre nada'),
      el('option', { value: 'noticia', selected: tipoInicial === 'noticia' }, 'Abre uma notícia cadastrada'),
      el('option', { value: 'link', selected: tipoInicial === 'link' }, 'Abre um endereço (outro site, serviço…)'));
    // Escolha da notícia: campo de busca + lista de cartões clicáveis (com foto, título e data).
    // Substitui a lista nativa de várias linhas, que ficava minúscula dentro da janela.
    const busca = el('input', { type: 'search', placeholder: 'Pesquisar pelo título', 'aria-label': 'Pesquisar notícia', 'aria-controls': 'bn-noticia-lista' });
    const lista = el('div', { class: 'escolha-noticias', id: 'bn-noticia-lista', role: 'listbox', 'aria-label': 'Notícias' });
    const escolhidaCaixa = el('div', { class: 'escolha-atual' });
    let escolhida = b.noticia_id || null;
    let escolhidaDados = null;
    const linhaNoticia = (n) => [
      n.capa_url ? el('img', { src: n.capa_url, alt: '', class: 'escolha-foto' }) : el('span', { class: 'escolha-foto escolha-foto-vazia', 'aria-hidden': 'true' }),
      el('span', { class: 'escolha-textos' }, el('strong', null, n.titulo),
        el('span', { class: 'sub-linha' }, n.situacao === 'publicado' ? 'Publicada em ' + P.dataBR(n.publicado_em) : 'Rascunho (só abre depois de publicada)'))];
    function mostrarEscolhida() {
      if (!escolhidaDados) { escolhidaCaixa.replaceChildren(el('span', { class: 'ajuda' }, 'Nenhuma notícia escolhida. Clique em uma da lista abaixo.')); return; }
      escolhidaCaixa.replaceChildren(el('div', { class: 'escolha-item escolha-marcada' }, ...linhaNoticia(escolhidaDados),
        el('span', { class: 'etiqueta etiqueta-publicado' }, '✓ Escolhida')));
    }
    async function buscar() {
      lista.replaceChildren(el('p', { class: 'ajuda', style: 'padding:10px' }, 'Carregando…'));
      let q = sb.from('noticias').select('id, titulo, publicado_em, situacao, capa_url').eq('orgao_id', P.estado.orgao.id);
      const t = busca.value.trim();
      if (t) q = q.ilike('busca', '%' + normalizar(t).replace(/[%_]/g, '') + '%');
      const { data } = await q.order('data_ordem', { ascending: false }).limit(12);
      const itens = data || [];
      if (escolhida && !escolhidaDados) {
        escolhidaDados = itens.find((n) => n.id === escolhida) ||
          (await sb.from('noticias').select('id, titulo, publicado_em, situacao, capa_url').eq('id', escolhida).maybeSingle()).data;
        mostrarEscolhida();
      }
      lista.replaceChildren(...itens.map((n) => {
        const item = el('button', { type: 'button', role: 'option', class: 'escolha-item' + (n.id === escolhida ? ' escolha-marcada' : ''),
          'aria-selected': n.id === escolhida ? 'true' : 'false' }, ...linhaNoticia(n));
        item.addEventListener('click', () => {
          escolhida = n.id; escolhidaDados = n;
          lista.querySelectorAll('.escolha-item').forEach((x) => { x.classList.remove('escolha-marcada'); x.setAttribute('aria-selected', 'false'); });
          item.classList.add('escolha-marcada'); item.setAttribute('aria-selected', 'true');
          erroCampo('bn-noticia', '');
          mostrarEscolhida();
        });
        return item;
      }));
      if (!itens.length) lista.replaceChildren(el('p', { class: 'ajuda', style: 'padding:10px' }, t ? 'Nenhuma notícia com "' + t + '".' : 'Nenhuma notícia cadastrada.'));
    }
    let espera;
    busca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(buscar, 300); });
    busca.id = 'bn-noticia';
    mostrarEscolhida();
    const blocoNoticia = el('div', { class: 'campo' },
      el('label', { for: 'bn-noticia' }, 'Notícia'), escolhidaCaixa, busca, lista,
      el('span', { class: 'ajuda' }, 'Mostra as 12 mais recentes; pesquise para achar outras.'),
      el('span', { class: 'erro-campo', id: 'bn-noticia-erro' }));
    const blocoLink = campo('bn-link', 'Endereço', inputLink);
    const alternar = () => {
      blocoNoticia.hidden = sel.value !== 'noticia';
      blocoLink.hidden = sel.value !== 'link';
      if (sel.value === 'noticia' && !lista.children.length) buscar();
    };
    sel.addEventListener('change', alternar);
    alternar();
    return { campo: campo('bn-destino', 'Ao clicar no banner', sel), blocoNoticia, blocoLink, tipo: () => sel.value, noticia: () => escolhida };
  }

  function situacaoPeriodo(ativo, inicio, fim) {
    const hoje = new Date().toISOString().slice(0, 10);
    if (!ativo) return ['desativado', 'Desativado'];
    if (inicio && inicio > hoje) return ['agendado', 'Agendado'];
    if (fim && fim < hoje) return ['encerrado', 'Encerrado'];
    return ['publicado', 'No ar'];
  }

  function formBanner(b) {
    b = b || {};
    const img = campoImagem('bn-imagem', b.imagem_url, 1920, 'Imagem', 'Tamanho ideal 1920 × 600 pixels. Evite texto escrito na imagem: quem usa leitor de tela não consegue ler.');
    const f = {
      titulo: el('input', { type: 'text', maxlength: 160, value: b.titulo || '' }),
      link: el('input', { type: 'url', value: b.link_url || '', placeholder: 'https://…' }),
      inicio: el('input', { type: 'date', value: b.inicio || '' }),
      fim: el('input', { type: 'date', value: b.fim || '' }),
      ordem: el('input', { type: 'number', min: 0, max: 99, value: b.ordem == null ? 10 : b.ordem }),
      ativo: el('input', { type: 'checkbox', checked: b.id ? b.ativo : true })
    };
    const destino = destinoBanner(b, f.link);
    const corpo = el('form', { class: 'form-dialogo', novalidate: true },
      P.abas([
        ['imagem', 'Imagem', [img.elemento, campo('bn-titulo', 'Texto alternativo (o que a imagem mostra ou anuncia)', f.titulo, null, true)]],
        ['destino', 'Ao clicar', [destino.campo, destino.blocoNoticia, destino.blocoLink]],
        ['periodo', 'Período e ordem', [
          el('div', { class: 'grade-campos' },
            campo('bn-inicio', 'Mostrar a partir de', f.inicio, 'Em branco = já'),
            campo('bn-fim', 'Mostrar até', f.fim, 'Em branco = sem data para sair')),
          el('div', { class: 'grade-campos' },
            campo('bn-ordem', 'Ordem', f.ordem, '1 = primeiro'),
            el('label', { class: 'centro-v checkbox' }, f.ativo, ' Ativo'))]]
      ]));
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar');
    const dlg = P.abrirDialogo(b.id ? 'Editar banner' : 'Novo banner', corpo, [
      el('button', { type: 'button', class: 'btn btn-claro', onclick: () => dlg.close() }, 'Cancelar'), btn]);
    btn.addEventListener('click', async () => {
      if (!img.estadoImg.nova && !img.estadoImg.url) { toast('Escolha a imagem do banner.', true); return; }
      if (!erroCampo('bn-titulo', f.titulo.value.trim().length >= 3 ? '' : 'Descreva o banner.')) return;
      if (destino.tipo() === 'link' && !erroCampo('bn-link', P.urlValida(f.link.value.trim()) ? '' : 'Endereço completo, começando com https://')) return;
      if (destino.tipo() === 'noticia' && !erroCampo('bn-noticia', destino.noticia() ? '' : 'Escolha a notícia.')) return;
      if (!erroCampo('bn-fim', !f.fim.value || !f.inicio.value || f.fim.value >= f.inicio.value ? '' : 'A data final é antes da inicial.')) return;
      ocupado(btn, 'Salvando…');
      try {
        const antiga = b.imagem_url || null;
        let url = img.estadoImg.url;
        if (img.estadoImg.nova) url = await P.enviarArquivo('noticias', img.estadoImg.nova.blob, img.estadoImg.nova.ext);
        await P.gravarRegistro('banners', {
          titulo: f.titulo.value.trim(), imagem_url: url,
          link_url: destino.tipo() === 'link' ? f.link.value.trim() : null,
          noticia_id: destino.tipo() === 'noticia' ? destino.noticia() : null,
          inicio: f.inicio.value || null, fim: f.fim.value || null,
          ordem: parseInt(f.ordem.value, 10) || 0, ativo: f.ativo.checked
        }, b.id);
        if (antiga && antiga !== url) P.apagarArquivo(antiga);
        dlg.close(); toast('Banner salvo.'); await recarregar(true);
      } catch (e) { mostrarErro(e); }
      finally { ocupado(btn); }
    });
  }

  async function excluirSimples(tabela, reg, rotulo, arquivo) {
    if (!await P.confirmar('Excluir ' + rotulo, 'Excluir "' + (reg.titulo || reg.texto) + '"?', 'Excluir', true)) return;
    const { data, error } = await sb.from(tabela).delete().eq('id', reg.id).select('id');
    if (error) return mostrarErro(error);
    if (!data || !data.length) return toast('Seu perfil não pode excluir este registro.', true);
    if (arquivo) P.apagarArquivo(arquivo);
    toast('Excluído.'); await recarregar(true);
  }

  function telaBanners(area) {
    const podeGravar = perm.editar && !alcance();
    const btnMais = el('button', { type: 'button', class: 'btn btn-claro' }, 'Carregar mais');
    btnMais.addEventListener('click', async () => {
      ocupado(btnMais, 'Carregando…');
      try { const r = await P.paginar(consultaBanners, 'criado_em', banners[banners.length - 1], LOTE); banners = banners.concat(r.linhas); fimB = r.fim; telaBanners(area); }
      catch (e) { mostrarErro(e); ocupado(btnMais); }
    });
    const ordenados = [...banners].sort((a, b) => {
      const sa = situacaoPeriodo(a.ativo, a.inicio, a.fim)[0], sb2 = situacaoPeriodo(b.ativo, b.inicio, b.fim)[0];
      const peso = { publicado: 0, agendado: 1, encerrado: 2, desativado: 3 };
      return peso[sa] - peso[sb2] || a.ordem - b.ordem;
    });
    area.replaceChildren(
      el('p', { class: 'ajuda', style: 'margin-bottom:12px' }, 'Os banners "No ar" giram na página inicial na ordem indicada. Encerrados saem sozinhos na data final.'),
      banners.length ? el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela' },
        el('thead', null, el('tr', null, ['Banner', 'Período', 'Ordem', 'Situação'].map((t) => el('th', { scope: 'col' }, t)), el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Ações')))),
        el('tbody', null, ordenados.map((b) => {
          const [cls, rot] = situacaoPeriodo(b.ativo, b.inicio, b.fim);
          return el('tr', null,
            el('td', null, el('div', { class: 'pessoa' }, el('img', { src: b.imagem_url, alt: '', class: 'miniatura miniatura-larga' }),
              el('span', null, el('strong', null, b.titulo),
                b.noticia_id ? el('span', { class: 'sub-linha corta' }, 'Abre a notícia: ' + ((b.noticias && b.noticias.titulo) || '—'))
                  : b.link_url ? el('span', { class: 'sub-linha corta' }, b.link_url) : null))),
            el('td', null, (b.inicio ? P.dataBR(b.inicio) : 'Já') + ' → ' + (b.fim ? P.dataBR(b.fim) : 'sem fim')),
            el('td', null, String(b.ordem)),
            el('td', null, el('span', { class: 'etiqueta etiqueta-' + cls }, rot)),
            el('td', { class: 'acoes' },
              podeGravar ? el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => formBanner(b) }, 'Editar') : null,
              perm.excluir && !alcance() ? el('button', { type: 'button', class: 'btn btn-claro btn-p btn-texto-perigo', onclick: () => excluirSimples('banners', b, 'banner', b.imagem_url) }, 'Excluir') : null));
        })))) : el('p', { class: 'vazio' }, 'Nenhum banner cadastrado.'),
      fimB ? '' : el('div', { class: 'rodape-lista' }, el('span'), btnMais));
  }

  // ======================= AVISOS =======================
  let avisos = [], fimA = false;
  const consultaAvisos = (sel, op) => sb.from('avisos').select(sel, op).eq('orgao_id', P.estado.orgao.id);
  const NIVEIS = { informativo: 'Informativo', importante: 'Importante', urgente: 'Urgente' };

  function formAviso(a) {
    a = a || {};
    const f = {
      titulo: el('input', { type: 'text', maxlength: 60, value: a.titulo || '', placeholder: 'Ex.: IPTU 2026' }),
      texto: el('textarea', { rows: 3, maxlength: 300 }),
      rotulo: el('input', { type: 'text', maxlength: 30, value: a.link_rotulo || '', placeholder: 'Saiba mais' }),
      nivel: el('select', null, Object.entries(NIVEIS).map(([k, v]) => el('option', { value: k, selected: (a.nivel || 'informativo') === k }, v))),
      link: el('input', { type: 'url', value: a.link_url || '', placeholder: 'https://…' }),
      inicio: el('input', { type: 'datetime-local', value: P.paraDataHoraLocal(a.inicio) }),
      fim: el('input', { type: 'datetime-local', value: a.fim ? P.paraDataHoraLocal(a.fim) : '' }),
      ativo: el('input', { type: 'checkbox', checked: a.id ? a.ativo : true })
    };
    f.texto.value = a.texto || '';
    const corpo = el('form', { class: 'form-dialogo', novalidate: true },
      P.abas([
        ['mensagem', 'Mensagem', [
          campo('av-titulo', 'Título (opcional)', f.titulo, 'Aparece em negrito antes do texto. Até 60 caracteres.'),
          campo('av-texto', 'Texto do aviso', f.texto, 'Até 300 caracteres. Aparece numa faixa no topo de todas as páginas.', true),
          campo('av-nivel', 'Nível', f.nivel, 'Muda só a cor e o ícone; o formato da faixa é o mesmo.')]],
        ['botao', 'Botão de ação', [
          el('div', { class: 'grade-campos' }, campo('av-link', 'Link do botão (opcional)', f.link), campo('av-rotulo', 'Texto do botão', f.rotulo, 'Ex.: Emitir guia. Em branco: "Saiba mais".'))]],
        ['periodo', 'Período', [
          el('div', { class: 'grade-campos' }, campo('av-inicio', 'Início', f.inicio), campo('av-fim', 'Fim', f.fim, 'Em branco = até ser desativado')),
          el('label', { class: 'checkbox' }, f.ativo, ' Ativo')]]
      ]));
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar');
    const dlg = P.abrirDialogo(a.id ? 'Editar aviso' : 'Novo aviso', corpo, [
      el('button', { type: 'button', class: 'btn btn-claro', onclick: () => dlg.close() }, 'Cancelar'), btn]);
    btn.addEventListener('click', async () => {
      if (!erroCampo('av-texto', f.texto.value.trim().length >= 3 ? '' : 'Escreva o aviso.')) return;
      if (!erroCampo('av-link', !f.link.value.trim() || P.urlValida(f.link.value.trim()) ? '' : 'Endereço completo, começando com https://')) return;
      if (!erroCampo('av-fim', !f.fim.value || f.fim.value > f.inicio.value ? '' : 'O fim precisa ser depois do início.')) return;
      ocupado(btn, 'Salvando…');
      try {
        await P.gravarRegistro('avisos', {
          titulo: f.titulo.value.trim() || null, texto: f.texto.value.trim(), nivel: f.nivel.value, link_url: f.link.value.trim() || null,
          link_rotulo: f.link.value.trim() && f.rotulo.value.trim() ? f.rotulo.value.trim() : null,
          inicio: new Date(f.inicio.value || Date.now()).toISOString(), fim: f.fim.value ? new Date(f.fim.value).toISOString() : null,
          ativo: f.ativo.checked
        }, a.id);
        dlg.close(); toast('Aviso salvo.'); await recarregar(true);
      } catch (e) { mostrarErro(e); }
      finally { ocupado(btn); }
    });
  }

  function telaAvisos(area) {
    const podeGravar = perm.editar && !alcance();
    const agoraIso = agora();
    const sit = (a) => !a.ativo ? ['desativado', 'Desativado'] : a.inicio > agoraIso ? ['agendado', 'Agendado']
      : a.fim && a.fim <= agoraIso ? ['encerrado', 'Encerrado'] : ['publicado', 'No ar'];
    const btnMais = el('button', { type: 'button', class: 'btn btn-claro' }, 'Carregar mais');
    btnMais.addEventListener('click', async () => {
      ocupado(btnMais, 'Carregando…');
      try { const r = await P.paginar(consultaAvisos, 'inicio', avisos[avisos.length - 1], LOTE); avisos = avisos.concat(r.linhas); fimA = r.fim; telaAvisos(area); }
      catch (e) { mostrarErro(e); ocupado(btnMais); }
    });
    area.replaceChildren(
      avisos.length ? el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela' },
        el('thead', null, el('tr', null, ['Aviso', 'Nível', 'Período', 'Situação'].map((t) => el('th', { scope: 'col' }, t)), el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Ações')))),
        el('tbody', null, avisos.map((a) => {
          const [cls, rot] = sit(a);
          return el('tr', null,
            el('td', null, a.titulo ? el('strong', null, a.titulo + ': ') : null, a.texto),
            el('td', null, el('span', { class: 'etiqueta etiqueta-nivel-' + a.nivel }, NIVEIS[a.nivel])),
            el('td', { class: 'num' }, P.dataHoraBR(a.inicio) + ' → ' + (a.fim ? P.dataHoraBR(a.fim) : 'sem fim')),
            el('td', null, el('span', { class: 'etiqueta etiqueta-' + cls }, rot)),
            el('td', { class: 'acoes' },
              podeGravar ? el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => formAviso(a) }, 'Editar') : null,
              perm.excluir && !alcance() ? el('button', { type: 'button', class: 'btn btn-claro btn-p btn-texto-perigo', onclick: () => excluirSimples('avisos', a, 'aviso') }, 'Excluir') : null));
        })))) : el('p', { class: 'vazio' }, 'Nenhum aviso cadastrado.'),
      fimA ? '' : el('div', { class: 'rodape-lista' }, el('span'), btnMais));
  }

  // ======================= TELA =======================
  async function recarregar(reiniciar) {
    try {
      if (aba === 'noticias') await carregarNoticias(reiniciar);
      if (aba === 'banners') { const r = await P.paginar(consultaBanners, 'criado_em', null, LOTE); banners = r.linhas; fimB = r.fim; }
      if (aba === 'avisos') { const r = await P.paginar(consultaAvisos, 'inicio', null, LOTE); avisos = r.linhas; fimA = r.fim; }
      desenhar();
    } catch (e) { mostrarErro(e); }
  }

  function desenhar() {
    const area = el('div');
    const botaoAba = (id, rotulo) => el('button', {
      type: 'button', role: 'tab', class: 'aba', 'aria-selected': aba === id ? 'true' : 'false',
      onclick: () => { aba = id; area.replaceChildren(el('p', { class: 'vazio' }, 'Carregando…')); recarregar(true); }
    }, rotulo);
    let botaoNovo = null;
    if (aba === 'noticias' && perm.editar) botaoNovo = el('button', { type: 'button', class: 'btn btn-primario', onclick: () => formNoticia() }, '+ Nova notícia');
    if (aba === 'banners' && perm.editar && !alcance()) botaoNovo = el('button', { type: 'button', class: 'btn btn-primario', onclick: () => formBanner() }, '+ Novo banner');
    if (aba === 'avisos' && perm.editar && !alcance()) botaoNovo = el('button', { type: 'button', class: 'btn btn-primario', onclick: () => formAviso() }, '+ Novo aviso');

    if (aba === 'noticias') telaNoticias(area);
    if (aba === 'banners') telaBanners(area);
    if (aba === 'avisos') telaAvisos(area);

    conteiner.replaceChildren(...[
      el('div', { class: 'cabecalho-modulo' },
        el('div', null, el('h1', null, 'Notícias, banners e avisos'),
          el('p', { class: 'sub' }, 'O que aparece na página inicial do site.')),
        botaoNovo),
      alcance() && aba !== 'noticias' ? el('p', { class: 'msg msg-info' }, 'Banners e avisos valem para o órgão todo: só quem tem acesso ao órgão inteiro altera.') : null,
      el('div', { class: 'abas', role: 'tablist' }, botaoAba('noticias', 'Notícias'), botaoAba('banners', 'Banners'), botaoAba('avisos', 'Avisos')),
      el('div', { class: 'painel-guia' }, area)
    ].filter(Boolean));
  }

  P.telas.noticias = async function (c, mod, p) {
    perm = p; conteiner = c;
    c.replaceChildren(el('h1', null, 'Notícias, banners e avisos'), el('p', { class: 'sub' }, 'Carregando…'));
    try {
      const u = await sb.from('unidades').select('id, nome').eq('orgao_id', P.estado.orgao.id).limit(500);
      if (u.error) throw u.error;
      unidades = u.data;
      await recarregar(true);
    } catch (e) { c.querySelector('.sub').textContent = P.erroGravacao(e); }
  };
})();
