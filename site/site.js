// =====================================================================
// Site público — núcleo (Portal PNTP · SOFT+)
// Um único site para todos os órgãos: o órgão é descoberto pelo endereço
// (domínio cadastrado no painel) ou por ?orgao=CNPJ (enquanto o domínio
// não aponta para cá, ex.: GitHub Pages). Navegação por "#/rota" para
// funcionar em hospedagem estática sem configuração de servidor.
// As páginas ficam em paginas.js (SITE.rotas).
// =====================================================================
(function () {
  'use strict';
  const cfg = window.CONFIG_PNTP;

  // O site SEMPRE lê como visitante: sem guardar nem reaproveitar sessão.
  // Motivo: painel e site ficam no mesmo endereço; se o site usasse a sessão
  // de quem está logado no painel, mostraria rascunhos como se fossem públicos.
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseChave, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'pntp-site-visitante' }
  });

  const $ = (id) => document.getElementById(id);
  function el(tag, attrs, ...filhos) {
    const e = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k === 'class') e.className = v;
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, v);
    }
    const add = (f) => {
      if (f === null || f === undefined || f === false) return;
      if (Array.isArray(f)) f.forEach(add);
      else e.append(f instanceof Node ? f : String(f));
    };
    filhos.forEach(add);
    return e;
  }
  const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* navegador sem armazenamento */ } };
  const ler = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const normalizar = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const dataBR = (d) => d ? new Date(String(d).length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('pt-BR') : '';
  const dataLonga = (d) => d ? new Date(String(d).length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  // Logotipos das redes (desenho simples, uma cor) usados no início e no rodapé.
  const SVG = 'http://www.w3.org/2000/svg';
  const REDES = {
    Instagram: { cor: '#E1306C', partes: [['rect', { x: 3, y: 3, width: 18, height: 18, rx: 5 }], ['circle', { cx: 12, cy: 12, r: 4 }], ['circle', { cx: 17.5, cy: 6.5, r: 1, fill: 'currentColor' }]] },
    Facebook: { cor: '#1877F2', partes: [['path', { d: 'M15 3h-2.5A4.5 4.5 0 0 0 8 7.5V10H5v4h3v7h4v-7h3l1-4h-4V7.5c0-.3.2-.5.5-.5H15z', fill: 'currentColor', stroke: 'none' }]] },
    YouTube: { cor: '#FF0000', partes: [['rect', { x: 2, y: 5, width: 20, height: 14, rx: 4, fill: 'currentColor', stroke: 'none' }], ['path', { d: 'M10 9l5 3-5 3z', fill: '#fff', stroke: 'none' }]] },
    WhatsApp: { cor: '#25D366', partes: [['path', { d: 'M3 21l1.6-4.6A9 9 0 1 1 8 19.6z' }], ['path', { d: 'M9 9.5c0 3 2.5 5.5 5.5 5.5l1.2-1.4-2-1-1 .9a4 4 0 0 1-2.2-2.2l.9-1-1-2z', fill: 'currentColor', stroke: 'none' }]] }
  };
  function logoRede(nome) {
    const r = REDES[nome];
    const s = document.createElementNS(SVG, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', '22'); s.setAttribute('height', '22'); s.setAttribute('aria-hidden', 'true');
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2');
    s.style.color = r.cor;
    for (const [tag, at] of r.partes) {
      const e = document.createElementNS(SVG, tag);
      for (const [k, v] of Object.entries(at)) e.setAttribute(k, v);
      s.append(e);
    }
    return s;
  }
  // Lista de redes do órgão: [nome, endereço].
  function redesDoOrgao(c) {
    const zap = c.whatsapp ? 'https://wa.me/55' + c.whatsapp.replace(/\D/g, '').replace(/^55/, '') : null;
    return [['Instagram', c.instagram], ['Facebook', c.facebook], ['YouTube', c.youtube], ['WhatsApp', zap]].filter((r) => r[1]);
  }
  const linkRede = ([nome, url], classe) => el('a', { class: classe, href: url, target: '_blank', rel: 'noopener' },
    logoRede(nome), el('span', null, nome), el('span', { class: 'sr' }, ' (abre em nova aba)'));

  const TIPO_ORGAO = { prefeitura: 'Poder Executivo Municipal', camara: 'Poder Legislativo Municipal', rpps: 'Regime Próprio de Previdência', consorcio: 'Consórcio Público', autarquia: 'Autarquia', outro: '' };

  // ---------- texto com formatação simples (mesmo formato do painel) ----------
  // Nunca HTML: o conteúdo é montado elemento a elemento.
  function trecho(linha) {
    const frag = document.createDocumentFragment();
    const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g;
    let i = 0, m;
    while ((m = re.exec(linha))) {
      if (m.index > i) frag.append(linha.slice(i, m.index));
      if (m[1]) frag.append(el('strong', null, m[1]));
      else if (m[2]) frag.append(el('em', null, m[2]));
      else frag.append(el('a', { href: m[4], target: '_blank', rel: 'noopener' }, m[3]));
      i = re.lastIndex;
    }
    if (i < linha.length) frag.append(linha.slice(i));
    return frag;
  }
  function texto(t) {
    const raiz = el('div', { class: 'texto-formatado' });
    for (const b of String(t || '').replace(/\r/g, '').split(/\n{2,}/)) {
      const linhas = b.split('\n').filter((l) => l.trim());
      if (!linhas.length) continue;
      if (/^#{2,3}\s/.test(linhas[0]) && linhas.length === 1) raiz.append(el('h3', null, trecho(linhas[0].replace(/^#{2,3}\s+/, ''))));
      else if (linhas.every((l) => /^\s*[-*]\s+/.test(l))) raiz.append(el('ul', null, linhas.map((l) => el('li', null, trecho(l.replace(/^\s*[-*]\s+/, ''))))));
      else if (linhas.every((l) => /^\s*\d+[.)]\s+/.test(l))) raiz.append(el('ol', null, linhas.map((l) => el('li', null, trecho(l.replace(/^\s*\d+[.)]\s+/, ''))))));
      else { const p = el('p'); linhas.forEach((l, k) => { if (k) p.append(el('br')); p.append(trecho(l)); }); raiz.append(p); }
    }
    return raiz;
  }

  // ---------- órgão ----------
  const S = window.SITE = {
    sb, el, $, redesDoOrgao, linkRede, normalizar, dataBR, dataLonga, texto, guardar, ler,
    orgao: null, conf: {}, menu: [], lgpd: null, rotas: {}, unidades: null
  };

  function formatarCnpj(d) {
    return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }

  async function descobrirOrgao() {
    const chave = new URLSearchParams(location.search).get('orgao');
    let q = sb.from('orgaos').select('id, nome, sigla, tipo, cnpj, dominio, configuracoes');
    if (chave && /^[0-9a-f-]{36}$/i.test(chave)) q = q.eq('id', chave);
    else if (chave && /^\d{14}$/.test(chave.replace(/\D/g, ''))) q = q.eq('cnpj', formatarCnpj(chave.replace(/\D/g, '')));
    else q = q.eq('dominio', location.hostname.replace(/^www\./, '').toLowerCase());
    const { data, error } = await q.limit(1).maybeSingle();
    if (error) throw error;
    return data;
  }

  // Mistura a cor com preto (para hover/escura) ou branco (fundo claro).
  function misturar(hex, alvo, fator) {
    const n = parseInt(hex.slice(1), 16), a = alvo === 'branco' ? 255 : 0;
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (a - v) * fator));
    return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  // ---------- links do menu e rotas ----------
  // Rotas internas (vindas do menu do painel, ex. "/noticias") viram "#/noticias".
  S.link = (rota) => '#' + (rota.startsWith('/') ? rota : '/' + rota);
  // Destino único de cada página (site/destinos.js): portal ou link externo escolhido em Aparência.
  S.destino = (chave) => window.destinoPNTP(S.conf, chave);
  // Radar da Transparência Pública: link definido em Aparência (ex.: página do órgão no Radar) ou o painel geral.
  S.RADAR_PADRAO = 'https://radardatransparencia.atricon.org.br/panel.html';
  S.radar = () => (S.conf && /^https?:\/\//.test(S.conf.radar_url || '') ? S.conf.radar_url : S.RADAR_PADRAO);
  // Link pronto para uma chave de destino: abre em nova aba quando é externo. Sem destino: texto simples.
  S.linkDestino = (chave, conteudo, attrs) => {
    const d = S.destino(chave);
    if (!d) return el('span', Object.assign({ class: 'sem-destino' }, attrs || {}), conteudo);
    return el('a', Object.assign({}, attrs || {}, { href: d.href, target: d.externo ? '_blank' : null, rel: d.externo ? 'noopener' : null }),
      conteudo, d.externo ? el('span', { class: 'sr' }, ' (abre em nova aba)') : null);
  };
  // Item interno do menu cuja página o órgão mandou para link externo segue o link.
  // Com mais de um endereço cadastrado, o item segue para a página do portal, que explica cada um.
  const externoDaRota = (rota) => {
    const k = window.chaveDaRotaPNTP(rota);
    return k && !window.outrosLinksPNTP(S.conf, k).length ? window.externoPNTP(S.conf, k) : null;
  };
  // Quadro padrão dos endereços externos de uma chave (Aparência › Destinos das páginas): o principal
  // (quando a página está em sistema externo) e os outros, cada um com os exercícios e a explicação.
  S.caixaExterna = (chave, opcoes) => {
    const o = opcoes || {};
    const principal = window.externoPNTP(S.conf, chave);
    const outros = window.outrosLinksPNTP(S.conf, chave);
    if (!principal && !outros.length) return null;
    const abrir = (url, rot, classe) => el('a', { class: classe || null, href: url, target: '_blank', rel: 'noopener' }, rot, el('span', { class: 'sr' }, ' (abre em nova aba)'));
    return el('section', { class: 'caixa-externa', 'aria-label': 'Onde consultar' },
      principal ? [
        el(o.nivel || 'h2', null, outros.length ? 'Onde consultar' : 'Informação publicada em outro sistema'),
        el('p', null, outros.length ? 'Endereço atual, indicado pelo órgão:' : 'Esta informação é publicada no sistema indicado pelo órgão:'),
        el('p', null, abrir(principal, 'Acessar' + (o.rotulo ? ' ' + o.rotulo : ''), 'botao'), el('span', { class: 'url-ext' }, principal))
      ] : [
        el(o.nivel || 'h2', null, 'Períodos anteriores em outros sistemas'),
        el('p', null, 'Os dados desta página são publicados neste portal. Os períodos abaixo estão nos endereços indicados pelo órgão:')
      ],
      outros.length ? [principal ? el('p', { class: 'mt-2' }, el('strong', null, 'Outros períodos e sistemas:')) : null,
        el('ul', { class: 'lista-externos' }, outros.map((l) => el('li', null,
          el('span', { class: 'periodo-ext' }, window.periodoLinkPNTP(l)),
          el('span', { class: 'descricao-ext' }, l.descricao || '', el('span', { class: 'url-ext' }, l.url)),
          abrir(l.url, 'Acessar'))))] : null);
  };
  S.destinoMenu = (i) => i.tipo === 'link' ? i.destino : i.tipo === 'pagina' ? S.link('/pagina/' + i.destino) : externoDaRota(i.destino) || S.link(i.destino);

  function montarMenu() {
    const lista = $('menu-lista');
    const principais = S.menu.filter((i) => !i.pai_id).sort((a, b) => a.ordem - b.ordem);
    const filhos = (id) => S.menu.filter((i) => i.pai_id === id).sort((a, b) => a.ordem - b.ordem);
    const ancora = (i) => {
      const novaAba = (i.tipo === 'link' && i.nova_aba) || (i.tipo === 'interno' && !!externoDaRota(i.destino));
      return el('a', { href: S.destinoMenu(i), target: novaAba ? '_blank' : null, rel: novaAba || i.tipo === 'link' ? 'noopener' : null }, i.rotulo,
        novaAba ? el('span', { class: 'sr' }, ' (abre em nova aba)') : null);
    };
    const itens = principais.map((p, k) => {
      const sub = filhos(p.id);
      if (!sub.length) return el('li', null, ancora(p));
      const idSub = 'submenu-' + k;
      const btn = el('button', { type: 'button', 'aria-expanded': 'false', 'aria-controls': idSub }, p.rotulo + ' ▾');
      const ul = el('ul', { class: 'submenu', id: idSub }, sub.map((s) => el('li', null, ancora(s))));
      btn.addEventListener('click', () => {
        const abrir = btn.getAttribute('aria-expanded') !== 'true';
        fecharSubmenus();
        btn.setAttribute('aria-expanded', abrir ? 'true' : 'false');
        ul.classList.toggle('aberto', abrir);
      });
      return el('li', null, btn, ul);
    });
    // Busca dentro do menu no celular (no computador fica no cabeçalho).
    const fb = el('form', { role: 'search' }, el('label', { for: 'campo-busca-menu', class: 'sr' }, 'Pesquisar no site'),
      el('input', { type: 'search', id: 'campo-busca-menu', placeholder: 'Pesquisar no site' }), el('button', { type: 'submit' }, 'Buscar'));
    fb.addEventListener('submit', (ev) => { ev.preventDefault(); irBusca(fb.querySelector('input').value); });
    lista.replaceChildren(...itens, el('li', { class: 'menu-busca' }, fb));
    if (!principais.length) lista.replaceChildren(el('li', null, el('a', { href: '#/' }, 'Início')), el('li', null, el('a', { href: '#/noticias' }, 'Notícias')),
      el('li', null, el('a', { href: '#/servicos' }, 'Serviços')), el('li', null, el('a', { href: '#/contato' }, 'Contato')), el('li', { class: 'menu-busca' }, fb));
  }
  function fecharSubmenus() {
    document.querySelectorAll('.submenu.aberto').forEach((u) => u.classList.remove('aberto'));
    document.querySelectorAll('.menu-lista button[aria-expanded="true"]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  }
  document.addEventListener('click', (ev) => { if (!ev.target.closest('.menu-lista')) fecharSubmenus(); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') fecharSubmenus(); });

  function irBusca(termo) {
    const t = String(termo || '').trim();
    if (!t) return;
    location.hash = '#/busca?q=' + encodeURIComponent(t);
  }

  // ---------- acessibilidade ----------
  function acessibilidade() {
    // Alto contraste e tamanho do texto ficam lembrados neste navegador.
    const aplicarContraste = (on) => {
      document.documentElement.classList.toggle('contraste', on);
      $('btn-contraste').setAttribute('aria-pressed', on ? 'true' : 'false');
    };
    aplicarContraste(ler('site_contraste') === '1');
    $('btn-contraste').addEventListener('click', () => {
      const on = !document.documentElement.classList.contains('contraste');
      aplicarContraste(on); guardar('site_contraste', on ? '1' : '0');
    });
    let escala = parseInt(ler('site_fonte'), 10) || 100;
    const aplicarFonte = () => { document.documentElement.style.fontSize = escala + '%'; guardar('site_fonte', String(escala)); };
    aplicarFonte();
    $('fonte-mais').addEventListener('click', () => { escala = Math.min(150, escala + 10); aplicarFonte(); });
    $('fonte-menos').addEventListener('click', () => { escala = Math.max(80, escala - 10); aplicarFonte(); });
    $('fonte-normal').addEventListener('click', () => { escala = 100; aplicarFonte(); });

    // Atalhos de teclado: Alt+1..4 (padrão e-MAG). Os links "Ir para…" fazem o mesmo.
    const alvos = { 1: 'conteudo', 2: 'menu-principal', 3: 'campo-busca', 4: 'rodape' };
    const focar = (id) => {
      let alvo = $(id);
      if (id === 'campo-busca' && alvo && !alvo.offsetParent) { abrirMenuMobile(true); alvo = $('campo-busca-menu'); }
      if (id === 'menu-principal' && window.innerWidth <= 960) abrirMenuMobile(true);
      if (alvo) { alvo.focus(); alvo.scrollIntoView({ block: 'start' }); }
    };
    document.addEventListener('keydown', (ev) => { if (ev.altKey && alvos[ev.key]) { ev.preventDefault(); focar(alvos[ev.key]); } });
    document.querySelectorAll('.atalhos a').forEach((a) => a.addEventListener('click', (ev) => { ev.preventDefault(); focar(a.dataset.alvo); }));

    // VLibras (governo federal): tradução do conteúdo para Libras.
    const s = el('script', { src: 'https://vlibras.gov.br/app/vlibras-plugin.js' });
    s.onload = () => { try { new window.VLibras.Widget('https://vlibras.gov.br/app'); } catch (e) { /* serviço externo fora do ar */ } };
    document.body.append(s);
  }
  function abrirMenuMobile(abrir) {
    $('menu-principal').classList.toggle('aberto', abrir);
    $('btn-menu-mobile').setAttribute('aria-expanded', abrir ? 'true' : 'false');
  }

  // ---------- faixa acima do menu: redes sociais (esquerda) e selos (direita) ----------
  function seloIcone() {
    const sv = document.createElementNS(SVG, 'svg');
    for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: 18, height: 18, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) sv.setAttribute(k, v);
    const p = document.createElementNS(SVG, 'path');
    p.setAttribute('d', 'M12 3l2.5 2 3.2-.3.8 3.1 2.6 1.9-1.3 2.9 1.3 3-2.6 1.8-.8 3.1-3.2-.3L12 21l-2.5-2-3.2.3-.8-3.1-2.6-1.8 1.3-3-1.3-2.9 2.6-1.9.8-3.1 3.2.3z M9 12l2 2 4-4');
    sv.append(p); return sv;
  }
  function montarFaixaTopo() {
    const c = S.conf;
    const redes = redesDoOrgao(c);
    const selos = (Array.isArray(c.selos) ? c.selos : []).filter((x) => x && x.titulo).slice(0, 6);
    const faixa = $('faixa-topo');
    if (!redes.length && !selos.length) { faixa.hidden = true; return; }
    faixa.hidden = false;
    faixa.replaceChildren(el('div', { class: 'limite faixa-topo-int' },
      redes.length ? el('ul', { class: 'redes-topo', 'aria-label': 'Redes sociais oficiais' }, redes.map(([nome, url]) => el('li', null,
        el('a', { href: url, target: '_blank', rel: 'noopener', title: nome }, logoRede(nome), el('span', { class: 'sr' }, nome + ' (abre em nova aba)'))))) : el('span'),
      // Só os símbolos dos selos; nome e detalhe aparecem num balão ao passar o mouse ou focar.
      selos.length ? el('ul', { class: 'selos', 'aria-label': 'Selos e certificações' }, selos.map((x) => {
        const conteudo = [
          el('span', { class: 'selo-marca' + (x.imagem_url ? ' com-imagem' : '') }, x.imagem_url ? el('img', { src: x.imagem_url, alt: '' }) : seloIcone()),
          el('span', { class: 'selo-balao', role: 'tooltip' }, el('strong', null, x.titulo), x.descricao ? el('span', null, x.descricao) : null)];
        return el('li', null, x.url ? el('a', { class: 'selo', href: x.url, target: '_blank', rel: 'noopener' }, ...conteudo, el('span', { class: 'sr' }, ' (abre em nova aba)'))
          : el('span', { class: 'selo', tabindex: '0' }, ...conteudo));
      })) : null));
  }

  // ---------- rodapé ----------
  function montarRodape() {
    const c = S.conf, o = S.orgao, l = S.lgpd || {};
    const redes = redesDoOrgao(c);
    const zap = c.whatsapp ? 'https://wa.me/55' + c.whatsapp.replace(/\D/g, '').replace(/^55/, '') : null;
    $('rodape').replaceChildren(
      el('div', { class: 'limite rodape-int' },
        el('div', null,
          el('h2', null, c.nome_exibicao || o.nome),
          o.cnpj ? el('p', null, 'CNPJ ' + o.cnpj) : null,
          c.endereco ? el('p', null, c.endereco) : null,
          c.cep ? el('p', null, 'CEP ' + c.cep) : null,
          redes.length ? el('div', { class: 'redes', 'aria-label': 'Redes sociais oficiais' }, redes.map((r) => linkRede(r, 'rede'))) : null),
        el('div', null,
          el('h2', null, 'Atendimento'),
          c.horario ? el('p', null, c.horario) : null,
          c.telefone ? el('p', null, 'Telefone: ', el('a', { href: 'tel:' + c.telefone.replace(/\D/g, '') }, c.telefone)) : null,
          c.email ? el('p', null, 'E-mail: ', el('a', { href: 'mailto:' + c.email }, c.email)) : null,
          zap ? el('p', null, el('a', { href: zap, target: '_blank', rel: 'noopener' }, 'Atendimento por WhatsApp')) : null),
        el('div', null,
          el('h2', null, 'Institucional'),
          el('ul', null,
            el('li', null, el('a', { href: '#/estrutura' }, 'Estrutura organizacional')),
            el('li', null, el('a', { href: '#/gestores' }, 'Gestores')),
            el('li', null, el('a', { href: '#/servicos' }, 'Carta de Serviços')),
            el('li', null, el('a', { href: '#/faq' }, 'Perguntas frequentes')),
            el('li', null, el('a', { href: '#/dados-abertos' }, 'Dados abertos')),
            el('li', null, el('a', { href: '#/mapa-do-site' }, 'Mapa do site')))),
        el('div', null,
          el('h2', null, 'Proteção de dados (LGPD)'),
          l.encarregado_nome ? el('p', null, 'Encarregado: ' + l.encarregado_nome) : el('p', null, 'Encarregado: em designação'),
          l.encarregado_email ? el('p', null, el('a', { href: 'mailto:' + l.encarregado_email }, l.encarregado_email)) : null,
          l.encarregado_telefone ? el('p', null, l.encarregado_telefone) : null,
          el('p', null, el('a', { href: '#/lgpd' }, 'Política de privacidade')),
          el('p', null, el('a', { href: S.radar(), target: '_blank', rel: 'noopener' }, 'Radar da Transparência Pública')))),
      el('div', { class: 'rodape-fim' }, el('div', { class: 'limite' },
        el('span', { id: 'ultima-atualizacao' }, ''),
        el('span', null, 'Plataforma SOFT+ · Portal Institucional · versão ' + (window.VERSAO_SITE || '')))));
    ultimaAtualizacao();
  }

  // Data da última alteração de conteúdo (atualidade é critério do PNTP).
  async function ultimaAtualizacao() {
    const org = S.orgao.id;
    const tabelas = ['noticias', 'publicacoes', 'servicos', 'paginas', 'unidades'];
    const r = await Promise.all(tabelas.map((t) => sb.from(t).select('atualizado_em').eq('orgao_id', org)
      .order('atualizado_em', { ascending: false }).limit(1)));
    const datas = r.flatMap((x) => (x.data || []).map((d) => d.atualizado_em)).sort();
    const alvo = $('ultima-atualizacao');
    if (datas.length && alvo) alvo.textContent = 'Última atualização do site: ' + dataBR(datas[datas.length - 1]);
  }

  // ---------- avisos de topo ----------
  // Ícones da faixa de aviso (SVG em traço, herdam a cor do texto).
  const ICONE_AVISO = {
    informativo: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 11v6', 'M12 7.5h.01'],
    importante: ['M12 3l10 18H2z', 'M12 10v5', 'M12 18h.01'],
    urgente: ['M8.5 2h7L22 8.5v7L15.5 22h-7L2 15.5v-7z', 'M12 7.5v5.5', 'M12 16.5h.01'],
    fechar: ['M6 6l12 12', 'M18 6L6 18']
  };
  function iconeAviso(nome) {
    const s = document.createElementNS(SVG, 'svg');
    for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: nome === 'fechar' ? 18 : 22, height: nome === 'fechar' ? 18 : 22, fill: 'none', stroke: 'currentColor',
      'stroke-width': nome === 'fechar' ? 2.2 : 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) s.setAttribute(k, v);
    for (const d of ICONE_AVISO[nome] || ICONE_AVISO.informativo) { const p = document.createElementNS(SVG, 'path'); p.setAttribute('d', d); s.append(p); }
    return s;
  }

  async function montarAvisos() {
    const agora = new Date().toISOString();
    const { data } = await sb.from('avisos').select('*').eq('orgao_id', S.orgao.id).eq('ativo', true)
      .lte('inicio', agora).or('fim.is.null,fim.gt.' + agora).limit(5);
    const peso = { urgente: 0, importante: 1, informativo: 2 };
    // Aviso fechado pelo cidadão não volta neste navegador — a não ser que o órgão
    // altere o aviso (a chave inclui a data de atualização).
    let fechados = [];
    try { fechados = JSON.parse(ler('site_avisos_fechados') || '[]'); } catch (e) { fechados = []; }
    const chave = (a) => a.id + '@' + a.atualizado_em;
    const visiveis = (data || []).filter((a) => !fechados.includes(chave(a)))
      .sort((a, b) => peso[a.nivel] - peso[b.nivel]).slice(0, 3);
    $('faixa-avisos').replaceChildren(...visiveis.map((a) => {
      const caixa = el('div', { class: 'aviso aviso-' + a.nivel, role: a.nivel === 'urgente' ? 'alert' : 'status' });
      const fechar = el('button', { type: 'button', class: 'aviso-fechar', 'aria-label': 'Fechar aviso' }, iconeAviso('fechar'));
      fechar.addEventListener('click', () => {
        fechados = fechados.concat(chave(a)).slice(-50);
        guardar('site_avisos_fechados', JSON.stringify(fechados));
        caixa.remove();
      });
      // Layout único para todos os níveis (só cor e ícone mudam): ícone · título + texto · ação · fechar.
      caixa.append(el('div', { class: 'limite' }, el('span', { class: 'aviso-icone' }, iconeAviso(a.nivel)),
        el('span', { class: 'aviso-texto' }, a.titulo ? el('b', null, a.titulo + ':') : null, a.titulo ? ' ' : null, a.texto),
        a.link_url ? el('a', { class: 'aviso-acao', href: a.link_url, target: '_blank', rel: 'noopener' }, a.link_rotulo || 'Saiba mais', el('span', { class: 'sr' }, ' (abre em nova aba)')) : null, fechar));
      return caixa;
    }));
  }

  // ---------- roteador ----------
  function lerRota() {
    const h = decodeURI(location.hash.replace(/^#/, '')) || '/';
    const [caminho, consulta] = h.split('?');
    const partes = caminho.split('/').filter(Boolean);
    return { partes, params: new URLSearchParams(consulta || '') };
  }

  // Trilha "Você está em" — cada página informa seus níveis.
  S.trilha = function (...niveis) {
    const t = $('trilha');
    if (!niveis.length) { t.replaceChildren(); return; }
    t.replaceChildren(el('ol', null, el('li', null, el('a', { href: '#/' }, 'Início')),
      niveis.map((n, k) => el('li', null, k === niveis.length - 1 || !n[1] ? el('span', { 'aria-current': 'page' }, n[0]) : el('a', { href: n[1] }, n[0])))));
  };
  S.titulo = (t) => { document.title = (t ? t + ' · ' : '') + (S.conf.nome_exibicao || S.orgao.nome); };

  // A página foi configurada como link externo (Aparência › Destinos): explica e leva para lá.
  function paginaExterna(url, chave) {
    const d = window.DESTINOS_PNTP.find((x) => x[0] === chave);
    return async (main) => {
      S.titulo(d[1]); S.trilha([d[1]]);
      main.replaceChildren(el('div', { class: 'limite pagina' }, el('h1', null, d[1]), S.caixaExterna(chave, { rotulo: d[1] })));
    };
  }
  // Página do portal com outros endereços (anos anteriores em outro sistema): quadro logo abaixo do título.
  function quadroOutrosPeriodos(main, rota) {
    const k = window.chaveDaRotaPNTP(rota);
    if (!k || window.externoPNTP(S.conf, k) || !window.outrosLinksPNTP(S.conf, k).length || main.querySelector('.caixa-externa')) return;
    const h1 = main.querySelector('h1');
    if (!h1) return;
    const depois = h1.nextElementSibling && h1.nextElementSibling.classList.contains('sub') ? h1.nextElementSibling : h1;
    depois.after(S.caixaExterna(k));
  }

  let primeiraRota = true;
  async function rotear() {
    fecharSubmenus(); abrirMenuMobile(false);
    const { partes, params } = lerRota();
    const nome = partes[0] || '';
    const main = $('conteudo');
    // Página inteira em sistema externo: mostra o quadro de endereços (um ou vários).
    const chaveRota = window.chaveDaRotaPNTP(partes.join('/'));
    const chavePagina = chaveRota && (window.paiPNTP(chaveRota) || chaveRota);
    const ext = chavePagina && (S.conf.destinos || {})[chavePagina];
    const pagina = ext ? paginaExterna(ext, chavePagina) : S.rotas[nome] || S.rotas['*'];
    main.replaceChildren(el('p', { class: 'limite carregando' }, 'Carregando…'));
    S.trilha();
    try { await pagina(main, partes.slice(1), params); if (!ext) quadroOutrosPeriodos(main, partes.join('/')); }
    catch (e) {
      console.error(e);
      main.replaceChildren(el('div', { class: 'limite pagina' }, el('h1', null, 'Não foi possível carregar'), el('p', null, 'Tente novamente em instantes.')));
    }
    // Leva o foco ao conteúdo (leitor de tela anuncia a página nova), menos na primeira carga.
    if (!primeiraRota) { main.focus({ preventScroll: true }); window.scrollTo(0, 0); }
    primeiraRota = false;
  }

  // ---------- exportação (dados abertos e "gravação de relatórios" do PNTP) ----------
  // buscar(de, ate) devolve as linhas daquele intervalo; baixa em lotes de 1000.
  S.exportar = async function (nomeArquivo, formato, colunas, buscar, botao) {
    const original = botao ? botao.textContent : '';
    if (botao) { botao.disabled = true; botao.textContent = 'Gerando…'; }
    try {
      let todas = [];
      for (let de = 0; de < 20000; de += 1000) {
        const lote = await buscar(de, de + 999);
        todas = todas.concat(lote);
        if (lote.length < 1000) break;
      }
      let conteudo, tipo;
      if (formato === 'json') {
        conteudo = JSON.stringify(todas.map((r) => Object.fromEntries(colunas.map(([k, rot, f]) => [k, f ? f(r[k], r) : r[k]]))), null, 2);
        tipo = 'application/json';
      } else {
        const esc = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
        conteudo = '﻿' + [colunas.map((c) => esc(c[1])).join(';')]
          .concat(todas.map((r) => colunas.map(([k, , f]) => esc(f ? f(r[k], r) : r[k])).join(';'))).join('\r\n');
        tipo = 'text/csv;charset=utf-8';
      }
      const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
      const a = el('a', { href: url, download: nomeArquivo + '.' + formato });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      alert('Não foi possível gerar o arquivo. Tente novamente.');
    } finally {
      if (botao) { botao.disabled = false; botao.textContent = original; }
    }
  };
  S.botoesExportar = (nome, colunas, buscar) => el('span', { class: 'exportar' },
    el('span', { class: 'meta' }, 'Baixar: '),
    ['csv', 'json'].map((f) => {
      const b = el('button', { type: 'button', class: 'botao botao-claro', style: 'padding:6px 12px;margin-left:6px' }, f.toUpperCase());
      b.addEventListener('click', () => S.exportar(nome, f, colunas, buscar, b));
      return b;
    }));

  // Unidades carregadas uma vez (nomes usados em várias páginas).
  // ---------- Declarações de que não há dados (script 23) ----------
  // Cada declaração vale para a situação atual (substitui a lista) ou para um período, e aparece
  // dentro do período: o ano declarado vira aba própria e o mês filtrado mostra a declaração.
  S.decl = {
    cache: null,
    async todas() {
      if (!this.cache || this.cache.orgao !== S.orgao.id) {
        const { data, error } = await sb.from('declaracoes_inexistencia').select('secao, abrangencia, exercicio, numero, data_inicio, data_fim, texto, criado_em')
          .eq('orgao_id', S.orgao.id).order('data_fim', { ascending: false, nullsFirst: true }).limit(3000);
        this.cache = { orgao: S.orgao.id, lista: error ? [] : data || [] };   // sem o script 23, fica vazia
      }
      return this.cache.lista;
    },
    async de(chaves) { const ks = [].concat(chaves || []); return (await this.todas()).filter((d) => ks.includes(d.secao)); },
    atual: (lista) => lista.find((d) => d.abrangencia === 'atual') || null,
    doAno: (lista, ano) => lista.filter((d) => d.abrangencia !== 'atual' && Number(d.exercicio) === Number(ano)),
    // Declarações que tocam o mês (o mês inteiro ou parte dele).
    doMes: (lista, ano, mes) => {
      const ini = ano + '-' + String(mes).padStart(2, '0') + '-01';
      const fim = new Date(Date.UTC(ano, Number(mes), 0)).toISOString().slice(0, 10);
      return lista.filter((d) => d.abrangencia !== 'atual' && d.data_inicio <= fim && d.data_fim >= ini);
    },
    // Junta à lista de anos ([{ano, total}]) os anos que só têm declaração (total 0).
    mesclarAnos: (anos, lista) => {
      const r = (anos || []).slice();
      for (const d of lista) if (d.abrangencia !== 'atual' && d.exercicio && !r.some((x) => Number(x.ano) === Number(d.exercicio))) r.push({ ano: Number(d.exercicio), total: 0 });
      return r.sort((a, b) => b.ano - a.ano);
    },
    // Quadro com as declarações (titulo opcional). Lista vazia: nada.
    quadro(lista, titulo) {
      if (!lista.length) return '';
      const linha = (d) => el('li', null, d.abrangencia === 'atual' || d.abrangencia === 'ano' ? '' : el('strong', null, window.periodoDeclaracaoPNTP(d) + ': '), d.texto,
        el('span', { class: 'meta' }, ' (declaração registrada em ' + dataBR(String(d.criado_em).slice(0, 10)) + ')'));
      const ul = el('ul', { class: 'declaracoes-lista' }, lista.slice(0, 8).map(linha));
      const mais = lista.length > 8 ? el('button', { type: 'button', class: 'botao botao-claro', onclick: () => { ul.replaceChildren(...lista.map(linha)); mais.remove(); } },
        'Ver todas as declarações (' + lista.length + ')') : '';
      return el('section', { class: 'cartao declaracoes-site', 'aria-label': titulo || 'Declarações de que não há dados' },
        titulo ? el('h3', null, titulo) : '', ul, mais);
    },
    // Para listas com abas de ano próprias: marca a caixa (o comSecao não repete o quadro), junta os
    // anos só declarados e devolve { decl, atual, anos }.
    async anual(caixa, chave, anos) {
      const decl = await this.de(chave);
      caixa.dataset.declAnual = '1';
      return { decl, atual: this.atual(decl), anos: this.mesclarAnos(anos || [], decl) };
    },
    // Partes sem abas de ano: a declaração atual substitui o conteúdo; as de período ficam num quadro no alto.
    async envolver(caixa, chave, desenhar) {
      const d = await this.de(chave), a = this.atual(d);
      if (a) { caixa.replaceChildren(this.cartaoAtual(a)); return; }
      const r = await desenhar();
      const p = d.filter((x) => x.abrangencia !== 'atual');
      if (p.length && !caixa.dataset.declAnual) caixa.prepend(this.quadro(p, 'Períodos sem ocorrência'));
      return r;
    },
    semDados: (anos, ano) => !Number((anos.find((x) => Number(x.ano) === Number(ano)) || {}).total),
    // Declaração da situação atual, no lugar da lista.
    cartaoAtual: (d) => el('div', { class: 'cartao' }, el('p', null, el('strong', null, d.texto)),
      el('p', { class: 'meta' }, 'Declaração registrada em ' + dataBR(String(d.criado_em).slice(0, 10)) + '.'))
  };

  S.carregarUnidades = async function () {
    if (S.unidades) return S.unidades;
    const { data } = await sb.from('unidades').select('*').eq('orgao_id', S.orgao.id).limit(500);
    S.unidades = data || [];
    return S.unidades;
  };
  S.nomeUnidade = (id) => ((S.unidades || []).find((u) => u.id === id) || {}).nome || '';

  // ---------- início ----------
  S.iniciar = async function () {
    acessibilidade();
    $('btn-menu-mobile').addEventListener('click', () => abrirMenuMobile(!$('menu-principal').classList.contains('aberto')));
    $('form-busca').addEventListener('submit', (ev) => { ev.preventDefault(); irBusca($('campo-busca').value); });

    let o;
    try { o = await descobrirOrgao(); }
    catch (e) { o = null; }
    if (!o) {
      $('marca-nome').textContent = 'Portal institucional';
      $('conteudo').replaceChildren(el('div', { class: 'limite pagina' },
        el('h1', null, 'Órgão não encontrado'),
        el('p', null, 'Este endereço ainda não está ligado a nenhum órgão. Para visualizar, acrescente ao endereço ?orgao= seguido do CNPJ (só números).')));
      return;
    }
    S.orgao = o;
    S.conf = o.configuracoes || {};

    // Identidade do órgão (cor, brasão, nome).
    const cor = /^#[0-9a-f]{6}$/i.test(S.conf.cor_principal || '') ? S.conf.cor_principal : '#0d4fc4';
    const raiz = document.documentElement.style;
    raiz.setProperty('--cor', cor);
    raiz.setProperty('--cor-escura', misturar(cor, 'preto', 0.22));
    raiz.setProperty('--cor-clara', misturar(cor, 'branco', 0.9));
    document.querySelector('meta[name="theme-color"]').setAttribute('content', cor);
    $('marca-nome').textContent = S.conf.nome_exibicao || o.nome;
    $('marca-esfera').textContent = TIPO_ORGAO[o.tipo] || '';
    if (S.conf.brasao_url) { const b = $('marca-brasao'); b.src = S.conf.brasao_url; b.alt = 'Brasão'; b.hidden = false; }
    // Ícone da aba do navegador: o escolhido em Aparência; sem ele, o brasão.
    const icone = S.conf.favicon_url || S.conf.brasao_url;
    if (icone) document.querySelector('link[rel="icon"]').href = icone;
    const desc = document.querySelector('meta[name="description"]');
    desc.setAttribute('content', 'Site oficial: ' + (S.conf.nome_exibicao || o.nome) + '. Notícias, serviços, publicações oficiais e transparência.');

    const [menu, lgpd] = await Promise.all([
      sb.from('menu_itens').select('*').eq('orgao_id', o.id).eq('ativo', true).limit(200),
      sb.from('lgpd').select('*').eq('orgao_id', o.id).maybeSingle()
    ]);
    S.menu = menu.data || [];
    S.lgpd = lgpd.data || null;
    montarMenu();
    montarFaixaTopo();
    montarRodape();
    montarAvisos();
    addEventListener('hashchange', rotear);
    await rotear();
  };
})();
