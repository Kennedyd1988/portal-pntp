// =====================================================================
// Módulo "Aparência e contatos" — identidade, contatos, redes sociais e
// Diário Oficial do órgão. O menu do site tem módulo próprio (modulo-menu.js).
// =====================================================================
(function () {
  'use strict';
  const P = window.PNTP;
  const { sb, el, toast, ocupado, erroCampo, traduzirErro, emailValido } = P;

  // Razão de contraste (WCAG) entre a cor e o branco: o texto dos botões e do menu é branco.
  function contrasteComBranco(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return 0;
    const n = parseInt(m[1], 16);
    const canal = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const L = 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
    return 1.05 / (L + 0.05);
  }

  function campo(id, rotulo, input, ajuda) {
    input.id = id;
    return el('div', { class: 'campo' },
      el('label', { for: id }, rotulo),
      input,
      ajuda ? el('span', { class: 'ajuda' }, ajuda) : null,
      el('span', { class: 'erro-campo', id: id + '-erro' })
    );
  }
  const texto = (valor, extra) => el('input', Object.assign({ type: 'text', value: valor || '' }, extra || {}));

  P.telas.aparencia = async function (c, mod, perm) {
    c.replaceChildren(el('h1', null, mod.nome), el('p', { class: 'sub' }, 'Carregando…'));
    const { data: org, error } = await sb.from('orgaos')
      .select('id, nome, dominio, configuracoes').eq('id', P.estado.orgao.id).maybeSingle();
    if (error || !org) { c.querySelector('.sub').textContent = traduzirErro(error || 'Órgão não encontrado.'); return; }

    const cfg = org.configuracoes || {};
    const podeEditar = !!perm.editar;
    let brasaoUrl = cfg.brasao_url || null;
    let brasaoNovo = null;   // { blob, ext } escolhido e ainda não enviado

    // ----- Identidade -----
    const preview = el('div', { class: 'brasao-preview' });
    function mostrarBrasao(src) {
      preview.replaceChildren(src
        ? el('img', { src, alt: 'Brasão atual' })
        : el('span', null, 'Sem brasão'));
    }
    mostrarBrasao(brasaoUrl);

    const inputArquivo = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', class: 'sr', id: 'brasao-arquivo' });
    inputArquivo.addEventListener('change', async () => {
      const f = inputArquivo.files[0];
      if (!f) return;
      if (f.size > 10 * 1024 * 1024) { toast('A imagem passa de 10 MB. Escolha um arquivo menor.', true); return; }
      try {
        brasaoNovo = await P.reduzirImagem(f, 600);
        mostrarBrasao(URL.createObjectURL(brasaoNovo.blob));
        toast('Brasão pronto. Clique em "Salvar alterações" para gravar.');
      } catch (e) { toast(e.message, true); }
    });

    const cor = el('input', { type: 'color', value: cfg.cor_principal || '#0d4fc4', class: 'cor-amostra', 'aria-label': 'Escolher cor' });
    const corTexto = texto(cfg.cor_principal || '#0d4fc4', { maxlength: 7, class: 'cor-texto' });
    const corAviso = el('span', { class: 'ajuda' });
    function conferirCor() {
      const r = contrasteComBranco(corTexto.value);
      if (!r) { corAviso.textContent = 'Use o formato #RRGGBB.'; corAviso.className = 'ajuda ajuda-erro'; return; }
      const ok = r >= 4.5;
      corAviso.textContent = (ok ? '✓ Contraste aprovado com texto branco (' : '⚠ Contraste baixo com texto branco (') +
        r.toFixed(1).replace('.', ',') + ':1). ' + (ok ? '' : 'Para a acessibilidade, o mínimo é 4,5:1. Escolha uma cor mais escura.');
      corAviso.className = 'ajuda ' + (ok ? 'ajuda-ok' : 'ajuda-erro');
    }
    cor.addEventListener('input', () => { corTexto.value = cor.value; conferirCor(); });
    corTexto.addEventListener('input', () => { if (/^#[0-9a-f]{6}$/i.test(corTexto.value)) cor.value = corTexto.value; conferirCor(); });
    conferirCor();

    const f = {
      nome_exibicao: texto(cfg.nome_exibicao || org.nome),
      endereco: texto(cfg.endereco),
      cep: texto(cfg.cep, { inputmode: 'numeric', maxlength: 10 }),
      telefone: texto(cfg.telefone, { inputmode: 'tel' }),
      email: texto(cfg.email, { type: 'email' }),
      horario: texto(cfg.horario),
      instagram: texto(cfg.instagram, { type: 'url', placeholder: 'https://instagram.com/…' }),
      facebook: texto(cfg.facebook, { type: 'url', placeholder: 'https://facebook.com/…' }),
      youtube: texto(cfg.youtube, { type: 'url', placeholder: 'https://youtube.com/…' }),
      whatsapp: texto(cfg.whatsapp, { inputmode: 'tel', placeholder: '(84) 90000-0000' }),
      dominio: texto(org.dominio, { placeholder: 'riachodacruz.rn.gov.br' }),
      diario_nome: texto(cfg.diario_oficial_nome, { placeholder: 'Diário Oficial dos Municípios do RN (FEMURN)' }),
      diario_url: texto(cfg.diario_oficial_url, { type: 'url', placeholder: 'https://www.diariomunicipal.com.br/femurn/' }),
      transparencia_url: texto(cfg.transparencia_url, { type: 'url', placeholder: 'https://…' }),
      licitacoes_url: texto(cfg.licitacoes_url, { type: 'url', placeholder: 'https://…' }),
      estrutura_norma: texto(cfg.estrutura_norma, { placeholder: 'Ex.: Lei Complementar nº 5/2021' }),
      estrutura_norma_url: texto(cfg.estrutura_norma_url, { type: 'url', placeholder: 'https://…' })
    };

    // ----- Selos e certificações (aparecem no topo da página inicial do site) -----
    // Ficam em configuracoes.selos: [{ titulo, descricao, url, imagem_url }], no máximo 6.
    // A imagem (opcional) é reduzida no navegador e só é enviada ao salvar.
    const MAX_SELOS = 6;
    const selos = (Array.isArray(cfg.selos) ? cfg.selos : []).map((x) => ({
      titulo: texto(x.titulo, { maxlength: 60 }), descricao: texto(x.descricao, { maxlength: 80 }),
      url: texto(x.url, { type: 'url', placeholder: 'https://…' }), imagem_url: x.imagem_url || null, imagem_nova: null
    }));
    const listaSelos = el('div', { class: 'lista-selos' });
    const btnAddSelo = el('button', { type: 'button', class: 'btn btn-claro', onclick: () => {
      selos.push({ titulo: texto('', { maxlength: 60 }), descricao: texto('', { maxlength: 80 }), url: texto('', { type: 'url', placeholder: 'https://…' }), imagem_url: null, imagem_nova: null });
      desenharSelos(); selos[selos.length - 1].titulo.focus();
    } }, '+ Adicionar selo');
    function desenharSelos() {
      listaSelos.replaceChildren(...selos.map((s, k) => {
        s.titulo.id = 'ap-selo-t-' + k; s.descricao.id = 'ap-selo-d-' + k; s.url.id = 'ap-selo-u-' + k;
        const mini = el('div', { class: 'selo-mini' });
        const mostrar = () => mini.replaceChildren(s.imagem_nova ? el('img', { src: URL.createObjectURL(s.imagem_nova.blob), alt: '' })
          : s.imagem_url ? el('img', { src: s.imagem_url, alt: '' }) : el('span', null, 'Sem imagem'));
        mostrar();
        const arq = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', class: 'sr', id: 'ap-selo-img-' + k });
        arq.addEventListener('change', async () => {
          const fl = arq.files[0]; if (!fl) return;
          if (fl.size > 10 * 1024 * 1024) { toast('A imagem passa de 10 MB.', true); return; }
          try { s.imagem_nova = await P.reduzirImagem(fl, 240); mostrar(); } catch (e) { toast(e.message, true); }
        });
        return el('div', { class: 'linha-selo' },
          el('div', { class: 'selo-imagem' }, mini, arq,
            el('label', { for: 'ap-selo-img-' + k, class: 'link' + (podeEditar ? '' : ' desativado') }, s.imagem_url || s.imagem_nova ? 'Trocar imagem' : 'Imagem (opcional)'),
            s.imagem_url || s.imagem_nova ? el('button', { type: 'button', class: 'link', hidden: !podeEditar, onclick: () => { s.imagem_url = null; s.imagem_nova = null; desenharSelos(); } }, 'Tirar imagem') : null),
          el('div', { class: 'grade-campos selo-campos' },
            campo('ap-selo-t-' + k, 'Nome do selo', s.titulo, 'Ex.: Selo PNTP Diamante'),
            campo('ap-selo-d-' + k, 'Detalhe', s.descricao, 'Ex.: Atricon · ciclo 2025'),
            campo('ap-selo-u-' + k, 'Link (opcional)', s.url, 'Página que comprova o selo')),
          podeEditar ? el('button', { type: 'button', class: 'btn btn-claro btn-p btn-texto-perigo', onclick: () => { selos.splice(k, 1); desenharSelos(); } }, 'Remover') : null);
      }), selos.length ? '' : el('p', { class: 'ajuda' }, 'Nenhum selo cadastrado. Sem selos, a faixa não aparece no site.'));
      btnAddSelo.hidden = !podeEditar || selos.length >= MAX_SELOS;
    }
    desenharSelos();

    // ----- Ícone da aba do navegador (favicon) e faixa oficial do Radar -----
    // Imagens opcionais, enviadas só ao salvar. Sem ícone, o site usa o brasão.
    function blocoImagem(id, atual, largura, rotuloBotao, ajuda) {
      const st = { url: atual || null, novo: null };
      const prev = el('div', { class: 'brasao-preview' + (id === 'ap-favicon' ? ' preview-favicon' : ' preview-radar') });
      const mostrar = () => prev.replaceChildren(st.novo ? el('img', { src: URL.createObjectURL(st.novo.blob), alt: '' }) : st.url ? el('img', { src: st.url, alt: '' }) : el('span', null, 'Nenhuma'));
      mostrar();
      const arq = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', class: 'sr', id });
      arq.addEventListener('change', async () => {
        const fl = arq.files[0]; if (!fl) return;
        if (fl.size > 10 * 1024 * 1024) { toast('A imagem passa de 10 MB.', true); return; }
        try { st.novo = await P.reduzirImagem(fl, largura); mostrar(); } catch (e) { toast(e.message, true); }
      });
      const tirar = el('button', { type: 'button', class: 'link', hidden: !podeEditar, onclick: () => { st.url = null; st.novo = null; mostrar(); } }, 'Remover');
      st.bloco = el('div', { class: 'brasao-linha' }, prev, el('div', { class: 'brasao-acoes' }, arq,
        el('label', { for: id, class: 'btn btn-claro' + (podeEditar ? '' : ' desativado') }, rotuloBotao), tirar, el('span', { class: 'ajuda' }, ajuda)));
      return st;
    }
    const favicon = blocoImagem('ap-favicon', cfg.favicon_url, 128, 'Escolher ícone', 'Imagem quadrada (PNG, JPG ou WebP), de preferência só o símbolo. Sem ícone, o site usa o brasão.');
    const radarImg = blocoImagem('ap-radar', cfg.radar_imagem_url, 1600, 'Enviar faixa oficial', 'Opcional: a imagem oficial do Radar da Transparência Pública (Atricon). Sem ela, o site mostra a faixa padrão com o texto do Radar.');
    const RADAR_PADRAO = 'https://radardatransparencia.atricon.org.br/panel.html';
    const radarLink = texto(cfg.radar_url || '', { type: 'url', placeholder: RADAR_PADRAO });

    // ----- Destinos das páginas (fonte única em site/destinos.js) -----
    // Para cada página: "Página do portal" (cadastro/importação) ou "Link externo".
    const D = window.DESTINOS_PNTP || [];
    const destinosCfg = cfg.destinos || {};
    const destinos = D.map(([chave, rotulo, rota, cod, grupo]) => {
      const usaLink = !!destinosCfg[chave] || !rota;
      const modo = el('select', { 'aria-label': 'Destino de ' + rotulo },
        rota ? el('option', { value: 'portal', selected: !usaLink }, 'Página do portal') : null,
        el('option', { value: 'link', selected: usaLink }, 'Link externo'));
      const url = texto(destinosCfg[chave] || '', { type: 'url', placeholder: rota ? 'https://…' : 'Em branco: usa o Portal da Transparência externo', id: 'ap-dest-' + chave });
      const ajustar = () => { url.hidden = modo.value !== 'link'; };
      modo.addEventListener('change', ajustar); ajustar();
      return { chave, rotulo, rota, cod, grupo, modo, url };
    });
    const tabelaDestinos = el('div', null, [...new Set(D.map((d) => d[4]))].map((g) => el('div', null, el('h3', { class: 'destinos-grupo' }, g),
      el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela tabela-destinos' },
        el('thead', null, el('tr', null, ['Página', 'PNTP', 'Destino', 'Endereço do link externo'].map((t) => el('th', { scope: 'col' }, t)))),
        el('tbody', null, destinos.filter((d) => d.grupo === g).map((d) => el('tr', null,
          el('td', null, el('strong', null, d.rotulo), el('span', { class: 'sub-linha' }, d.rota ? 'Página do portal: ' + d.rota : 'Ainda não existe no portal: só link externo')),
          el('td', { class: 'num' }, d.cod || '—'), el('td', null, d.modo),
          el('td', null, el('div', { class: 'campo', style: 'margin:0' }, d.url, el('span', { class: 'erro-campo', id: 'ap-dest-' + d.chave + '-erro' })))))))))));

    const btnSalvar = el('button', { type: 'submit', class: 'btn btn-primario' }, 'Salvar alterações');
    const form = el('form', { class: 'form-aparencia', novalidate: true },
      P.abas([
        ['identidade', 'Identidade', el('div', { class: 'grade grade-2' },
          el('section', { class: 'cartao' },
            el('h2', null, 'Brasão, nome e cor'),
            el('div', { class: 'brasao-linha' },
              preview,
              el('div', { class: 'brasao-acoes' },
                inputArquivo,
                el('label', { for: 'brasao-arquivo', class: 'btn btn-claro' + (podeEditar ? '' : ' desativado') }, 'Escolher brasão ou logotipo'),
                el('button', { type: 'button', class: 'link', hidden: !brasaoUrl || !podeEditar, onclick: (ev) => {
                  brasaoNovo = null; brasaoUrl = null; mostrarBrasao(null); ev.target.hidden = true;
                } }, 'Remover brasão'),
                el('span', { class: 'ajuda' }, 'PNG, JPG ou WebP. A imagem é reduzida automaticamente.'))),
            campo('ap-nome', 'Nome exibido no site', f.nome_exibicao, 'Nome oficial cadastrado: ' + org.nome),
            el('div', { class: 'campo' }, el('label', { for: 'ap-cor' }, 'Cor principal'), el('div', { class: 'cor-linha' }, cor, corTexto), corAviso)),
          el('section', { class: 'cartao' },
            el('h2', null, 'Ícone da aba do navegador'),
            el('p', { class: 'ajuda' }, 'Aparece na aba do navegador e nos favoritos, ao lado do nome do site.'),
            favicon.bloco),
          el('section', { class: 'cartao' },
            el('h2', null, 'Endereço do site'),
            campo('ap-dominio', 'Domínio', f.dominio, 'Endereço próprio do órgão (quando apontar para o portal).')))],
        ['contatos', 'Contatos e redes', el('div', { class: 'grade grade-2' },
          el('section', { class: 'cartao' },
            el('h2', null, 'Contato e atendimento'),
            el('p', { class: 'ajuda' }, 'Aparece no rodapé de todas as páginas (PNTP 2.4 e 2.5).'),
            campo('ap-endereco', 'Endereço da sede', f.endereco),
            el('div', { class: 'grade-campos' }, campo('ap-cep', 'CEP', f.cep), campo('ap-telefone', 'Telefone', f.telefone)),
            campo('ap-email', 'E-mail institucional', f.email),
            campo('ap-horario', 'Horário de atendimento', f.horario, 'Ex.: Segunda a sexta, das 8h às 12h e das 13h às 17h')),
          el('section', { class: 'cartao' },
            el('h2', null, 'Redes sociais e WhatsApp'),
            el('p', { class: 'ajuda' }, 'Botões no alto do site, à esquerda, acima do menu, e no rodapé (PNTP 2.8). Deixe em branco o que o órgão não usa.'),
            campo('ap-instagram', 'Instagram', f.instagram),
            campo('ap-facebook', 'Facebook', f.facebook),
            campo('ap-youtube', 'YouTube', f.youtube),
            campo('ap-whatsapp', 'WhatsApp de atendimento', f.whatsapp)))],
        ['destinos', 'Destinos das páginas', el('section', { class: 'cartao' },
          el('h2', null, 'Para onde cada página leva'),
          el('p', { class: 'ajuda' }, 'Escolha, para cada página, se ela fica no próprio portal (cadastro ou importação) ou num sistema externo. Menu, capa da Transparência, página inicial, mapa do site e busca seguem esta tabela: nenhum botão leva a um lugar diferente do outro.'),
          campo('ap-transparencia', 'Portal da Transparência externo (geral)', f.transparencia_url, 'Usado pelas páginas que ainda não existem no portal e estão sem link próprio (receitas, despesas, folha…).'),
          tabelaDestinos)],
        ['publicacoes', 'Diário Oficial e sistemas', el('div', { class: 'grade grade-2' },
          el('section', { class: 'cartao' },
            el('h2', null, 'Diário Oficial'),
            el('p', { class: 'ajuda' }, 'Onde o órgão publica os atos oficiais. Se for um sistema externo (ex.: FEMURN), o site leva o cidadão para lá.'),
            campo('ap-diario-nome', 'Nome do Diário Oficial', f.diario_nome),
            campo('ap-diario-url', 'Endereço (link)', f.diario_url)),
          el('section', { class: 'cartao' },
            el('h2', null, 'Sistemas de atendimento'),
            el('p', { class: 'ajuda' }, 'Endereço usado dentro da página de Licitações (botão "sistema de licitações"). Os formulários do e-SIC e da Ouvidoria ficam nos módulos e-SIC e Ouvidoria, aba "Como pedir" / "Como se manifestar".'),
            campo('ap-licitacoes', 'Sistema de licitações (complementar)', f.licitacoes_url)),
          el('section', { class: 'cartao' },
            el('h2', null, 'Norma da estrutura organizacional'),
            el('p', { class: 'ajuda' }, 'Lei que institui ou altera a estrutura administrativa do órgão (PNTP 2.1). Aparece no topo da página "Estrutura organizacional".'),
            campo('ap-estrutura-norma', 'Identificação', f.estrutura_norma),
            campo('ap-estrutura-url', 'Link', f.estrutura_norma_url)))],
        ['selos', 'Selos e Radar', el('div', null,
          el('section', { class: 'cartao' },
            el('h2', null, 'Selos e certificações'),
            el('p', { class: 'ajuda' }, 'Aparecem no alto do site, à direita, logo acima do menu: só o símbolo de cada selo; o nome e o detalhe surgem ao passar o mouse.'),
            listaSelos, btnAddSelo),
          el('section', { class: 'cartao', style: 'margin-top:16px' },
            el('h2', null, 'Faixa do Radar da Transparência Pública'),
            radarImg.bloco,
            campo('ap-radar-url', 'Link da faixa (opcional)', radarLink, 'Para onde a faixa, o rodapé e a página da Transparência levam (PNTP 2.9). Ex.: a página do órgão no Radar. Em branco: painel geral do Radar (' + RADAR_PADRAO + ').')))]
      ], (/[?&]aba=([a-z]+)/.exec(location.hash) || [])[1]),
      podeEditar ? el('div', { class: 'barra-salvar' }, btnSalvar) : el('p', { class: 'msg msg-info' }, 'Seu perfil pode ver, mas não alterar a aparência.')
    );
    corTexto.id = 'ap-cor';

    if (!podeEditar) for (const i of form.querySelectorAll('input, select')) i.disabled = true;

    const urlValida = (v) => !v || /^https?:\/\/\S+\.\S+/.test(v);

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const v = (k) => f[k].value.trim();
      // Validação campo a campo, com destaque em vermelho.
      if (!erroCampo('ap-nome', v('nome_exibicao') ? '' : 'Informe o nome exibido no site.')) return;
      if (!erroCampo('ap-cor', contrasteComBranco(corTexto.value) ? '' : 'Use o formato #RRGGBB.')) return;
      if (!erroCampo('ap-email', !v('email') || emailValido(v('email')) ? '' : 'E-mail inválido.')) return;
      for (const r of ['instagram', 'facebook', 'youtube']) {
        if (!erroCampo('ap-' + r, urlValida(v(r)) ? '' : 'Informe o endereço completo, começando com https://')) return;
      }
      for (const [id, k] of [['ap-diario-url', 'diario_url'], ['ap-transparencia', 'transparencia_url'], ['ap-licitacoes', 'licitacoes_url'],
        ['ap-estrutura-url', 'estrutura_norma_url']]) {
        if (!erroCampo(id, urlValida(v(k)) ? '' : 'Informe o endereço completo, começando com https://')) return;
      }
      if (!erroCampo('ap-radar-url', urlValida(radarLink.value.trim()) ? '' : 'Informe o endereço completo, começando com https://')) return;
      for (let k = 0; k < selos.length; k++) {
        if (!erroCampo('ap-selo-t-' + k, selos[k].titulo.value.trim() ? '' : 'Informe o nome do selo (ou remova a linha).')) return;
        if (!erroCampo('ap-selo-u-' + k, urlValida(selos[k].url.value.trim()) ? '' : 'Informe o endereço completo, começando com https://')) return;
      }
      for (const d of destinos) {
        const u = d.url.value.trim();
        if (d.modo.value === 'link' && d.rota && !erroCampo('ap-dest-' + d.chave, u ? '' : 'Informe o link externo ou escolha "Página do portal".')) return;
        if (!erroCampo('ap-dest-' + d.chave, urlValida(u) ? '' : 'Informe o endereço completo, começando com https://')) return;
      }
      const dominio = v('dominio').toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      if (!erroCampo('ap-dominio', !dominio || /^[a-z0-9.-]+\.[a-z]{2,}$/.test(dominio) ? '' : 'Domínio inválido. Ex.: riachodacruz.rn.gov.br')) return;

      ocupado(btnSalvar, 'Salvando…');
      try {
        const antigo = cfg.brasao_url || null;
        if (brasaoNovo) brasaoUrl = await P.enviarArquivo('aparencia', brasaoNovo.blob, brasaoNovo.ext);
        for (const sl of selos) if (sl.imagem_nova) { sl.imagem_url = await P.enviarArquivo('aparencia', sl.imagem_nova.blob, sl.imagem_nova.ext); sl.imagem_nova = null; }
        const imagemNova = async (st) => { if (st.novo) { st.url = await P.enviarArquivo('aparencia', st.novo.blob, st.novo.ext); st.novo = null; } return st.url; };
        const faviconUrl = await imagemNova(favicon), radarUrl = await imagemNova(radarImg);
        const destinosGravar = {};
        for (const d of destinos) if (d.modo.value === 'link' && d.url.value.trim()) destinosGravar[d.chave] = d.url.value.trim();
        const selosAntigos = (Array.isArray(cfg.selos) ? cfg.selos : []).map((x) => x.imagem_url).filter(Boolean);
        const selosGravar = selos.map((sl) => ({ titulo: sl.titulo.value.trim(), descricao: sl.descricao.value.trim(), url: sl.url.value.trim(), imagem_url: sl.imagem_url || null }));
        const novaCfg = Object.assign({}, cfg, {
          nome_exibicao: v('nome_exibicao'), cor_principal: corTexto.value.toLowerCase(),
          brasao_url: brasaoUrl, endereco: v('endereco'), cep: v('cep'), telefone: v('telefone'),
          email: v('email'), horario: v('horario'), instagram: v('instagram'), facebook: v('facebook'),
          youtube: v('youtube'), whatsapp: v('whatsapp'),
          diario_oficial_nome: v('diario_nome'), diario_oficial_url: v('diario_url'),
          transparencia_url: v('transparencia_url'), licitacoes_url: v('licitacoes_url'),
          estrutura_norma: v('estrutura_norma'), estrutura_norma_url: v('estrutura_norma_url'),
          selos: selosGravar, favicon_url: faviconUrl, radar_imagem_url: radarUrl, radar_url: radarLink.value.trim() || null, destinos: destinosGravar
        });
        const { data, error: e2 } = await sb.from('orgaos')
          .update({ configuracoes: novaCfg, dominio: dominio || null })
          .eq('id', org.id).select('id');
        if (e2) throw e2;
        if (!data || !data.length) throw Object.assign(new Error('Seu perfil não tem permissão para alterar a aparência deste órgão.'), { amigavel: true });
        if (antigo && antigo !== brasaoUrl) P.apagarArquivo(antigo);
        for (const k of ['favicon_url', 'radar_imagem_url']) if (cfg[k] && cfg[k] !== novaCfg[k]) P.apagarArquivo(cfg[k]);
        // Imagens de selos trocadas ou removidas: apaga do armazenamento.
        for (const u of selosAntigos) if (!selosGravar.some((x) => x.imagem_url === u)) P.apagarArquivo(u);
        Object.assign(cfg, novaCfg);
        brasaoNovo = null;
        toast('Aparência salva.');
      } catch (e) {
        toast(/duplicate key.*dominio/i.test(e.message || '') ? 'Este domínio já está cadastrado para outro órgão.' : (e.amigavel ? e.message : traduzirErro(e)), true);
      } finally {
        ocupado(btnSalvar);
      }
    });

    c.replaceChildren(
      el('h1', null, 'Aparência e contatos'),
      el('p', { class: 'sub' }, 'Identidade visual e dados de contato usados no site e no Portal da Transparência.'),
      form
    );
  };
})();
