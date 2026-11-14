// =====================================================================
// Painel SOFT+ · Portal PNTP — app.js
// Login, recuperação de senha, escolha do órgão e menu por permissão.
// =====================================================================
(function () {
  'use strict';

  const cfg = window.CONFIG_PNTP;

  // Tipo do link que abriu a página (convite ou recuperação de senha).
  // Lido ANTES de criar o cliente da Supabase, porque ele limpa o endereço
  // ao processar o link — depois disso não daria mais para saber de onde a pessoa veio.
  const LINK_INICIAL = (() => {
    const h = new URLSearchParams(location.hash.replace(/^#/, ''));
    const q = new URLSearchParams(location.search);
    return {
      tipo: h.get('type') || q.get('type') || (q.get('code') ? 'recovery' : null),
      erro: h.get('error_code') || h.get('error') || q.get('error_code') || null
    };
  })();

  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseChave);

  // Estado da sessão no navegador
  const estado = {
    usuario: null,      // ficha de public.usuarios
    orgaos: [],         // resultado de meus_orgaos()
    orgao: null,        // órgão aberto
    modulos: [],        // catálogo de módulos
    permissoes: {}      // { codigo: {ver, editar, publicar, excluir} }
  };

  // Registro das telas de cada módulo (preenchido pelos arquivos modulo-*.js).
  const telas = {};

  // Fase em que cada módulo será construído (só para a tela "em construção").
  const FASE_MODULO = {
    noticias: 1, institucional: 1, paginas: 1, servicos: 1, publicacoes: 1, lgpd: 1, aparencia: 1, menu: 1, usuarios: 1, historico: 1,
    licitacoes: 2, contratos: 2, contas: 2, financeiro: 2, pessoal: 2, convenios: 2, emendas: 2, concursos: 2, obras: 2, saude: 2, educacao: 2, renuncias: 2, importacoes: 2,
    esic: 3, ouvidoria: 3
  };

  const TIPO_ORGAO = {
    prefeitura: 'Prefeitura', camara: 'Câmara Municipal', rpps: 'Previdência (RPPS)',
    consorcio: 'Consórcio Público', autarquia: 'Autarquia', outro: 'Outro'
  };

  // ---------- utilidades ----------
  const $ = (id) => document.getElementById(id);

  // Cria elementos sem usar innerHTML com dados vindos do banco (evita injeção de código).
  function el(tag, attrs, ...filhos) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const f of filhos.flat(Infinity)) {
      if (f === null || f === undefined || f === false) continue;
      e.append(f instanceof Node ? f : document.createTextNode(String(f)));
    }
    return e;
  }

  function guardar(chave, valor) { try { localStorage.setItem(chave, valor); } catch (e) { /* navegador sem armazenamento */ } }
  function ler(chave) { try { return localStorage.getItem(chave); } catch (e) { return null; } }

  function mostrarTela(id) {
    for (const t of document.querySelectorAll('.tela')) t.hidden = (t.id !== id);
  }
  // Barra de carregamento da entrada (0.22.0): avança por etapa, com o texto do que está sendo feito.
  function etapa(pct, texto) {
    const barra = document.querySelector('.barra-carregando');
    const v = $('barra-carregando-valor');
    if (!barra || !v) return;
    v.style.width = pct + '%';
    barra.setAttribute('aria-valuenow', String(pct));
    if (texto) $('carregando-texto').textContent = texto;
  }

  function toast(texto, erro) {
    const t = $('toast');
    // Janela aberta (dialog) fica numa camada acima de tudo: o aviso precisa ir para
    // dentro dela, senão aparece escondido atrás do fundo escurecido.
    const janela = [...document.querySelectorAll('dialog[open]')].pop();
    if (t.parentElement !== (janela || document.body)) (janela || document.body).append(t);
    t.textContent = texto;
    t.classList.toggle('erro', !!erro);
    t.hidden = false;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { t.hidden = true; }, 4500);
  }

  function msg(id, texto, tipo) {
    const m = $(id);
    if (!texto) { m.hidden = true; return; }
    m.textContent = texto;
    m.className = 'msg msg-' + (tipo || 'erro');
    m.hidden = false;
  }

  // Destaque vermelho + mensagem curta no campo (regra do projeto: nunca só um alerta genérico).
  function erroCampo(inputId, texto) {
    const i = $(inputId);
    const span = $(inputId + '-erro');
    i.classList.toggle('invalido', !!texto);
    i.setAttribute('aria-invalid', texto ? 'true' : 'false');
    if (span) span.textContent = texto || '';
    // Campo dentro de uma aba da janela: abre a aba e marca em vermelho as que têm erro
    // (senão o aviso ficaria escondido numa aba fechada).
    const painel = i.closest('[data-aba-painel]');
    if (painel && painel._marcar) { if (texto) painel._abrir(); painel._marcar(); }
    if (texto) i.focus();
    return !texto;
  }

  // ---------------------------------------------------------------------
  // Janela dividida em abas (padrão do projeto: guia de navegador).
  //   abas: [[id, rótulo, conteúdo]] — conteúdo é lista de elementos ou
  //   função (montada na 1ª vez que a aba abre; útil para listas que vêm do banco).
  //   Uma aba pode vir como [id, rótulo, null, 'motivo'] = desativada, com o motivo.
  // Todas as abas ficam no formulário ao mesmo tempo (só escondidas), então os
  // campos de todas são lidos e validados juntos ao salvar.
  // ---------------------------------------------------------------------
  // ---------- Destinos externos (Aparência › Destinos das páginas) ----------
  // Página (ou parte) com link externo não recebe cadastro manual no painel: o site leva para o
  // sistema externo e não mostraria o que fosse cadastrado aqui.
  function externo(chave) {
    if (!chave || !window.externoPNTP) return null;
    for (const k of [].concat(chave)) { const u = window.externoPNTP((estado.orgao || {}).configuracoes || {}, k); if (u) return { chave: k, url: u }; }
    return null;
  }
  function avisoExterno(ext) {
    const d = (window.DESTINOS_PNTP || []).find((x) => x[0] === ext.chave);
    const podeAparencia = estado.permissoes.aparencia && estado.permissoes.aparencia.ver;
    const lugar = podeAparencia ? el('a', { href: '#/m/aparencia?aba=destinos' }, 'Aparência › Destinos das páginas') : el('strong', null, 'Aparência › Destinos das páginas');
    return el('div', { class: 'cartao aviso-externo' },
      el('h2', null, 'Cadastro desativado: link externo'),
      el('p', null, 'Em ', lugar, ', "' + (d ? d[1] : ext.chave) + '" leva para o sistema externo ',
        el('a', { href: ext.url, target: '_blank', rel: 'noopener' }, ext.url), '. Enquanto for assim, o cadastro manual fica desativado aqui e o site mostra só o sistema externo.'),
      el('p', { class: 'ajuda' }, 'Para voltar a cadastrar no portal, escolha "Página do portal" nessa linha. O que já estava cadastrado continua guardado.'));
  }

  // lista: [id, rótulo, conteúdo, motivo (desativa a aba), chave(s) de destino (aba vira aviso se tiver link externo)]
  function abas(lista, inicial) {
    // Sem aba inicial: usa a do endereço (#/m/modulo?aba=…, links "Corrigir" da autoavaliação) uma vez só.
    if (inicial == null) {
      const q = new URLSearchParams(location.hash.split('?')[1] || '').get('aba');
      if (q && lista.some((x) => x[0] === q)) { inicial = q; history.replaceState(null, '', location.pathname + location.search + location.hash.split('?')[0]); }
    }
    const botoes = [], paineis = [];
    lista.forEach((x) => { const ext = !x[3] && externo(x[4]); if (ext) { x[2] = () => avisoExterno(ext); x._externo = true; } });
    let atual = null;
    const ir = (id, focar) => {
      const k = lista.findIndex((x) => x[0] === id);
      if (k < 0 || lista[k][3]) return;
      atual = id;
      lista.forEach((x, n) => {
        const sel = n === k;
        botoes[n].setAttribute('aria-selected', sel ? 'true' : 'false');
        botoes[n].tabIndex = sel ? 0 : -1;
        paineis[n].hidden = !sel;
        if (sel && typeof x[2] === 'function' && !paineis[n]._montado) { paineis[n]._montado = true; paineis[n].replaceChildren(...[].concat(x[2]()).filter(Boolean)); }
      });
      if (focar) botoes[k].focus();
    };
    lista.forEach(([id, rotulo, conteudo, motivo], n) => {
      const ext = lista[n]._externo;
      const b = el('button', { type: 'button', role: 'tab', class: 'aba' + (ext ? ' aba-externa' : ''), id: 'aba-j-' + id, 'aria-controls': 'painel-j-' + id,
        disabled: !!motivo, title: motivo || (ext ? 'Cadastro desativado: esta parte leva a um link externo' : null), onclick: () => ir(id) },
        rotulo, ext ? el('span', { class: 'aba-ext' }, el('span', { 'aria-hidden': 'true' }, '↗'), el('span', { class: 'sr' }, ' (link externo, cadastro desativado)')) : null);
      const p = el('div', { role: 'tabpanel', id: 'painel-j-' + id, 'aria-labelledby': 'aba-j-' + id, 'data-aba-painel': id, hidden: true },
        motivo ? el('p', { class: 'vazio' }, motivo) : typeof conteudo === 'function' ? null : [].concat(conteudo || []).filter(Boolean));
      p._abrir = () => ir(id);
      p._marcar = () => b.classList.toggle('aba-erro', !!p.querySelector('.invalido'));
      botoes.push(b); paineis.push(p);
    });
    const barra = el('div', { class: 'abas abas-janela', role: 'tablist' }, botoes);
    barra.addEventListener('keydown', (e) => {
      const ativos = lista.filter((x) => !x[3]).map((x) => x[0]);
      const i = ativos.indexOf(atual);
      const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
      if (n === null) return;
      e.preventDefault(); ir(ativos[(n + ativos.length) % ativos.length], true);
    });
    const caixa = el('div', { class: 'janela-abas' }, barra, el('div', { class: 'painel-guia' }, paineis));
    caixa.ir = ir;
    // Libera uma aba que estava desativada (ex.: "Documentos" depois do 1º salvamento).
    caixa.liberar = (id, conteudo, abrir) => {
      const k = lista.findIndex((x) => x[0] === id); if (k < 0) return;
      lista[k][2] = conteudo; lista[k][3] = null;
      botoes[k].disabled = false; botoes[k].removeAttribute('title');
      paineis[k]._montado = false; paineis[k].replaceChildren();
      if (typeof conteudo !== 'function') paineis[k].replaceChildren(...[].concat(conteudo || []).filter(Boolean));
      if (abrir) ir(id);
    };
    caixa.recarregar = (id) => { const k = lista.findIndex((x) => x[0] === id); if (k >= 0) { paineis[k]._montado = false; if (atual === id) ir(id); } };
    ir(inicial && lista.some((x) => x[0] === inicial && !x[3]) ? inicial : (lista.find((x) => !x[3] && !x._externo) || lista.find((x) => !x[3]))[0]);
    return caixa;
  }

  function ocupado(btn, texto) {
    if (texto) { btn.dataset.textoOriginal = btn.textContent; btn.textContent = texto; btn.disabled = true; }
    else { btn.textContent = btn.dataset.textoOriginal || btn.textContent; btn.disabled = false; }
  }

  // Traduz as mensagens da Supabase para algo que o usuário entenda.
  // Nomes, para o usuário, das tabelas que podem impedir uma exclusão (vínculos no banco, script 26).
  const NOMES_VINCULO = {
    licitacoes_documentos: 'documentos da licitação', contratos: 'contratos', contratos_aditivos: 'aditivos do contrato',
    contratos_fiscais: 'fiscais do contrato', despesas: 'empenhos (despesas)', despesas_movimentos: 'liquidações e pagamentos do empenho',
    ordem_cronologica: 'pagamentos na ordem cronológica', pessoal_terceirizados: 'terceirizados', obras: 'obras',
    obras_itens: 'itens da planilha da obra', obras_medicoes: 'medições da obra', obras_paralisacoes: 'paralisações da obra',
    emendas: 'emendas parlamentares', concursos_documentos: 'edital e atos da seleção', conselhos_documentos: 'documentos do conselho',
    conselhos_membros: 'membros do conselho', renuncias_valores: 'valores previstos e realizados da renúncia',
    renuncias_beneficiarios: 'beneficiários da renúncia', saude_profissionais: 'profissionais do estabelecimento',
    saude_estoques: 'estoques do medicamento', banners: 'banners', gestores: 'gestores', noticias: 'notícias',
    publicacoes: 'publicações', servicos: 'serviços da Carta', unidades: 'unidades subordinadas', usuarios_orgaos: 'usuários',
    atendimento_canais: 'canais do e-SIC/Ouvidoria', atendimentos: 'pedidos e manifestações', atendimentos_tramites: 'andamentos de pedidos',
    lgpd: 'LGPD e Governo Digital (norma)', menu_itens: 'subitens do menu', orgaos: 'órgãos vinculados'
  };
  function traduzirErro(e) {
    const t = (e && (e.message || e.error_description || String(e))) || '';
    const dep = /violates foreign key constraint/i.test(t) && /^update or delete on table/i.test(t) && (t + ' ' + ((e && e.details) || '')).match(/(?:on table|from table) "([a-z_]+)"\.?\s*$|still referenced from table "([a-z_]+)"/i);
    if (dep) {
      const tab = dep[2] || dep[1];
      return 'Não é possível excluir: há ' + (NOMES_VINCULO[tab] || 'outros registros') + ' ligados a este registro. '
        + 'Exclua ou desvincule esses itens antes (para manter o histórico, prefira mudar a situação em vez de excluir).';
    }
    if (/violates foreign key constraint/i.test(t)) return 'Não foi possível gravar: o registro escolhido para vincular não existe mais. Atualize a tela e escolha de novo.';
    if (/invalid login credentials/i.test(t)) return 'E-mail ou senha incorretos.';
    if (/email not confirmed/i.test(t)) return 'Este e-mail ainda não foi confirmado.';
    if (/rate limit|too many/i.test(t)) return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.';
    if (/password should be at least/i.test(t)) return 'A senha precisa ter pelo menos 8 caracteres.';
    if (/same.*password|different from the old/i.test(t)) return 'A nova senha precisa ser diferente da anterior.';
    if (/failed to fetch|network/i.test(t)) return 'Sem conexão com o servidor. Verifique a internet.';
    if (/jwt|session/i.test(t)) return 'Sua sessão expirou. Entre novamente.';
    return 'Não foi possível concluir: ' + t;
  }

  // Ao digitar num campo marcado em vermelho, a marca e a mensagem somem.
  document.addEventListener('input', (ev) => {
    const i = ev.target;
    if (i.classList && i.classList.contains('invalido')) {
      i.classList.remove('invalido');
      i.setAttribute('aria-invalid', 'false');
      const span = i.id && document.getElementById(i.id + '-erro');
      if (span) span.textContent = '';
    }
  });

  const emailValido = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  function siglaDe(o) {
    if (o.sigla) return o.sigla.slice(0, 4).toUpperCase();
    const palavras = o.nome.split(/\s+/).filter((p) => p.length > 2 && !/^(de|da|do|dos|das)$/i.test(p));
    return palavras.slice(0, 3).map((p) => p[0]).join('').toUpperCase();
  }

  // ---------- versão ----------
  function mostrarVersao() {
    for (const s of document.querySelectorAll('.versao-app')) s.textContent = window.VERSAO_APP || '—';
  }

  // Confere a cada 5 minutos (e ao voltar para a aba) se há versão nova publicada.
  async function conferirVersao() {
    try {
      const r = await fetch('versao.json?t=' + Date.now(), { cache: 'no-store' });
      const v = await r.json();
      if (v.versao && v.versao !== window.VERSAO_APP) {
        $('aviso-versao-texto').textContent = 'Nova versão ' + v.versao + ' disponível.' +
          (v.notas && v.notas[0] ? ' ' + v.notas[0] : '');
        $('aviso-versao').hidden = false;
      }
    } catch (e) { /* sem internet: tenta na próxima */ }
  }
  $('btn-atualizar-versao').addEventListener('click', () => location.reload());
  setInterval(conferirVersao, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) conferirVersao(); });

  // ---------- botão "Instalar app" (regra do projeto: não depender só do banner do navegador) ----------
  // Android/computador: usa o pedido de instalação do navegador quando ele existir.
  // iPhone/iPad (Safari não tem esse pedido) e demais casos: mostra o passo a passo.
  let pedidoInstalacao = null;
  const appInstalado = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const btnInstalar = $('btn-instalar');
  if (btnInstalar && !appInstalado()) btnInstalar.hidden = false;
  addEventListener('beforeinstallprompt', (ev) => { ev.preventDefault(); pedidoInstalacao = ev; });
  addEventListener('appinstalled', () => { if (btnInstalar) btnInstalar.hidden = true; pedidoInstalacao = null; });
  if (btnInstalar) btnInstalar.addEventListener('click', async () => {
    if (pedidoInstalacao) {
      pedidoInstalacao.prompt();
      const r = await pedidoInstalacao.userChoice.catch(() => ({}));
      pedidoInstalacao = null;
      if (r.outcome === 'accepted') btnInstalar.hidden = true;
      return;
    }
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const safari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|Chrome|Android/i.test(ua);
    let passos;
    if (ios && !safari) {
      passos = [el('li', null, 'Abra este endereço no ', el('strong', null, 'Safari'), ' (no iPhone, só o Safari instala apps pela página).'),
        el('li', null, 'Depois siga os passos do Safari: Compartilhar → "Adicionar à Tela de Início".')];
    } else if (ios) {
      passos = [el('li', null, 'Toque no botão ', el('strong', null, 'Compartilhar'), ' (quadrado com seta para cima), na barra do Safari.'),
        el('li', null, 'Role a lista e toque em ', el('strong', null, '"Adicionar à Tela de Início"'), '.'),
        el('li', null, 'Confirme em ', el('strong', null, '"Adicionar"'), '. O ícone do Painel SOFT+ aparece junto dos outros apps.')];
    } else if (/Android/i.test(ua)) {
      passos = [el('li', null, 'Toque no menu ', el('strong', null, '⋮'), ' do navegador (canto superior direito).'),
        el('li', null, 'Toque em ', el('strong', null, '"Instalar app"'), ' ou ', el('strong', null, '"Adicionar à tela inicial"'), '.'),
        el('li', null, 'Confirme. Se a opção não aparecer, abra o painel no Google Chrome.')];
    } else {
      passos = [el('li', null, 'No Chrome ou Edge, clique no ícone de instalar no fim da barra de endereço (monitor com seta).'),
        el('li', null, 'Ou abra o menu ', el('strong', null, '⋮'), ' e escolha ', el('strong', null, '"Instalar Painel SOFT+"'), ' (no Edge: Aplicativos → Instalar este site).'),
        el('li', null, 'O painel passa a abrir numa janela própria, com ícone na área de trabalho.')];
    }
    const dlg = abrirDialogo('Instalar o Painel SOFT+', el('div', null,
      el('p', null, 'Com o app instalado, o painel abre direto pelo ícone, como um aplicativo, e se atualiza sozinho.'),
      el('ol', { class: 'passos-instalar' }, passos)),
      [el('button', { type: 'button', class: 'btn btn-primario', onclick: () => dlg.close() }, 'Entendi')]);
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  }

  // ---------- login ----------
  for (const b of document.querySelectorAll('.btn-ver-senha')) {
    b.addEventListener('click', () => {
      const i = $(b.dataset.alvo);
      const mostrar = i.type === 'password';
      i.type = mostrar ? 'text' : 'password';
      b.textContent = mostrar ? 'Ocultar' : 'Mostrar';
      b.setAttribute('aria-label', mostrar ? 'Ocultar senha' : 'Mostrar senha');
    });
  }

  function mostrarForm(id) {
    for (const f of ['form-login', 'form-recuperar', 'form-nova-senha']) $(f).hidden = (f !== id);
    mostrarTela('tela-login');
  }

  $('form-login').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    msg('login-msg');
    const email = $('login-email').value.trim();
    const senha = $('login-senha').value;
    if (!erroCampo('login-email', emailValido(email) ? '' : 'Informe um e-mail válido.')) return;
    if (!erroCampo('login-senha', senha ? '' : 'Informe a senha.')) return;

    const btn = $('btn-entrar');
    ocupado(btn, 'Entrando…');
    const { error } = await sb.auth.signInWithPassword({ email, password: senha });
    ocupado(btn);
    if (error) { msg('login-msg', traduzirErro(error)); return; }
    $('login-senha').value = '';
    await carregarContexto();
  });

  $('link-esqueci').addEventListener('click', () => {
    $('rec-email').value = $('login-email').value;
    msg('rec-msg');
    mostrarForm('form-recuperar');
    $('rec-email').focus();
  });
  $('link-voltar-login').addEventListener('click', () => mostrarForm('form-login'));

  $('form-recuperar').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const email = $('rec-email').value.trim();
    if (!erroCampo('rec-email', emailValido(email) ? '' : 'Informe um e-mail válido.')) return;
    const btn = $('btn-recuperar');
    ocupado(btn, 'Enviando…');
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: location.origin + location.pathname
    });
    ocupado(btn);
    // Mesmo texto com ou sem conta: não revela quais e-mails estão cadastrados.
    if (error && !/rate limit/i.test(error.message)) { msg('rec-msg', traduzirErro(error)); return; }
    msg('rec-msg', 'Se este e-mail estiver cadastrado, você receberá o link em alguns minutos. Confira também a caixa de spam.', 'ok');
  });

  // Mesmo formulário para quem chegou pelo convite (cria a primeira senha) e pela recuperação.
  let modoSenha = 'recovery';
  function prepararNovaSenha(tipo) {
    modoSenha = tipo;
    const convite = tipo === 'invite' || tipo === 'primeiro';
    $('nova-titulo').textContent = tipo === 'primeiro' ? 'Bem-vindo(a)! Crie sua senha' : convite ? 'Bem-vindo(a)! Crie sua senha' : 'Criar nova senha';
    $('nova-sub').textContent = tipo === 'primeiro'
      ? 'Você entrou com a senha inicial que recebeu. Agora escolha a sua: pelo menos 8 caracteres, misturando letras e números. Só você vai saber.'
      : convite ? 'Seu acesso ao painel foi liberado. Escolha uma senha com pelo menos 8 caracteres, misturando letras e números.'
      : 'Use pelo menos 8 caracteres, misturando letras e números.';
    $('btn-salvar-senha').textContent = convite ? 'Criar senha e entrar' : 'Salvar nova senha';
    msg('nova-msg');
    mostrarForm('form-nova-senha');
    $('nova-senha').focus();
  }

  $('form-nova-senha').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const s1 = $('nova-senha').value;
    const s2 = $('nova-senha2').value;
    const forte = s1.length >= 8 && /[a-z]/i.test(s1) && /\d/.test(s1);
    if (!erroCampo('nova-senha', forte ? '' : 'Use pelo menos 8 caracteres, com letras e números.')) return;
    if (!erroCampo('nova-senha2', s1 === s2 ? '' : 'As duas senhas não são iguais.')) return;
    const btn = $('btn-salvar-senha');
    ocupado(btn, 'Salvando…');
    const { error } = await sb.auth.updateUser({ password: s1, data: { trocar_senha: false } });
    ocupado(btn);
    if (error) { msg('nova-msg', /different from the old|same.*password/i.test(error.message) ? 'A nova senha precisa ser diferente da senha inicial.' : traduzirErro(error)); return; }
    $('nova-senha').value = '';
    $('nova-senha2').value = '';
    history.replaceState(null, '', location.pathname);
    toast(modoSenha === 'invite' || modoSenha === 'primeiro' ? 'Senha criada. Seja bem-vindo(a)!' : 'Senha alterada com sucesso.');
    await carregarContexto();
  });

  // ---------- minha conta (nome e senha da própria pessoa) ----------
  function minhaConta() {
    const nome = el('input', { type: 'text', id: 'mc-nome', maxlength: 120, value: estado.usuario.nome || '' });
    const s1 = el('input', { type: 'password', id: 'mc-senha', autocomplete: 'new-password' });
    const s2 = el('input', { type: 'password', id: 'mc-senha2', autocomplete: 'new-password' });
    const campo = (id, rotulo, input, ajuda) => el('div', { class: 'campo' },
      el('label', { for: id }, rotulo), input,
      ajuda ? el('span', { class: 'ajuda' }, ajuda) : null,
      el('span', { class: 'erro-campo', id: id + '-erro' }));
    const corpo = el('form', { class: 'form-dialogo', novalidate: true },
      campo('mc-nome', 'Seu nome', nome, 'Aparece no histórico de alterações.'),
      el('p', { class: 'ajuda' }, 'E-mail de acesso: ' + estado.usuario.email),
      el('fieldset', { class: 'opcoes' },
        el('legend', null, 'Trocar senha (deixe em branco para manter)'),
        el('div', { class: 'grade-campos' },
          campo('mc-senha', 'Nova senha', s1),
          campo('mc-senha2', 'Repita a nova senha', s2)))
    );
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar');
    const dlg = abrirDialogo('Minha conta', corpo, [
      el('button', { type: 'button', class: 'btn btn-claro', onclick: () => dlg.close() }, 'Cancelar'), btn
    ]);
    corpo.addEventListener('submit', (ev) => { ev.preventDefault(); btn.click(); });
    btn.addEventListener('click', async () => {
      const n = nome.value.trim().replace(/\s+/g, ' ');
      if (!erroCampo('mc-nome', n.length >= 3 ? '' : 'Informe seu nome.')) return;
      if (s1.value || s2.value) {
        const forte = s1.value.length >= 8 && /[a-z]/i.test(s1.value) && /\d/.test(s1.value);
        if (!erroCampo('mc-senha', forte ? '' : 'Use pelo menos 8 caracteres, com letras e números.')) return;
        if (!erroCampo('mc-senha2', s1.value === s2.value ? '' : 'As duas senhas não são iguais.')) return;
      }
      ocupado(btn, 'Salvando…');
      try {
        if (n !== estado.usuario.nome) {
          const { data: { user } } = await sb.auth.getUser();
          const { error } = await sb.from('usuarios').update({ nome: n }).eq('id', user.id);
          if (error) throw error;
          estado.usuario.nome = n;
          $('topo-usuario').textContent = n;
        }
        if (s1.value) {
          const { error } = await sb.auth.updateUser({ password: s1.value, data: { trocar_senha: false } });
          if (error) throw error;
        }
        dlg.close();
        toast('Dados atualizados.');
      } catch (e) { toast(traduzirErro(e), true); }
      finally { ocupado(btn); }
    });
  }
  $('topo-usuario').addEventListener('click', () => minhaConta());

  async function sair() {
    await sb.auth.signOut();
    estado.usuario = null; estado.orgao = null; estado.orgaos = [];
    mostrarForm('form-login');
  }
  $('btn-sair').addEventListener('click', sair);
  $('btn-sair-orgaos').addEventListener('click', sair);

  // ---------- contexto: usuário e órgãos ----------
  async function carregarContexto() {
    mostrarTela('tela-carregando');
    etapa(25, 'Conferindo seu acesso…');
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { mostrarForm('form-login'); return; }
    etapa(45, 'Buscando seus órgãos…');
    // Cadastrado pelo administrador com senha inicial: troca a senha antes de entrar (0.21.0).
    if (user.user_metadata && user.user_metadata.trocar_senha) { prepararNovaSenha('primeiro'); return; }

    const [ficha, orgaos, modulos] = await Promise.all([
      sb.from('usuarios').select('id, nome, email, suporte_softplus').eq('id', user.id).maybeSingle(),
      sb.rpc('meus_orgaos'),
      sb.from('modulos').select('codigo, nome, grupo, ordem').order('ordem')
    ]);
    const falha = ficha.error || orgaos.error || modulos.error;
    if (falha) { toast(traduzirErro(falha), true); mostrarForm('form-login'); return; }

    estado.usuario = ficha.data || { nome: '', email: user.email };
    estado.orgaos = orgaos.data || [];
    estado.modulos = modulos.data || [];

    if (estado.orgaos.length === 0) {
      mostrarListaOrgaos();
      msg('orgaos-msg', 'Seu usuário ainda não está vinculado a nenhum órgão. Fale com o administrador do seu órgão ou com o suporte da SOFT+.', 'info');
      return;
    }
    if (estado.orgaos.length === 1) { await abrirOrgao(estado.orgaos[0]); return; }

    // Reabre o último órgão usado neste navegador, se ainda tiver acesso.
    const ultimo = estado.orgaos.find((o) => o.id === ler('pntp_ultimo_orgao'));
    if (ultimo) { await abrirOrgao(ultimo); return; }
    mostrarListaOrgaos();
  }

  function mostrarListaOrgaos() {
    mostrarTela('tela-orgaos');
    msg('orgaos-msg');
    const nome = estado.usuario.nome || estado.usuario.email;
    $('orgaos-sub').textContent = 'Olá, ' + nome + '. Você tem acesso a ' + estado.orgaos.length +
      (estado.orgaos.length === 1 ? ' órgão.' : ' órgãos.');
    const busca = $('busca-orgao');
    busca.hidden = estado.orgaos.length < 6;
    busca.value = '';
    desenharListaOrgaos('');
  }

  function desenharListaOrgaos(filtro) {
    const normal = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const f = normal(filtro);
    const lista = $('lista-orgaos');
    lista.replaceChildren();
    // Ordem alfabética, com os subsites logo abaixo do órgão-pai.
    const pais = estado.orgaos.filter((o) => !o.orgao_pai_id || !estado.orgaos.some((p) => p.id === o.orgao_pai_id));
    const ordenados = [];
    for (const p of pais.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))) {
      ordenados.push(p);
      ordenados.push(...estado.orgaos.filter((s) => s.orgao_pai_id === p.id).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
    }
    for (const o of ordenados) {
      if (f && !normal(o.nome).includes(f)) continue;
      const subsite = !!o.orgao_pai_id;
      lista.append(el('li', null,
        el('button', { type: 'button', class: 'item-orgao', style: subsite ? 'margin-left:28px;width:calc(100% - 28px)' : null, onclick: () => abrirOrgao(o) },
          el('span', { class: 'item-orgao-sigla', 'aria-hidden': 'true' }, siglaDe(o)),
          el('span', { class: 'item-orgao-texto' },
            el('span', { class: 'item-orgao-nome' }, o.nome),
            el('span', { class: 'item-orgao-det' }, (subsite ? 'Subsite · ' : '') + (TIPO_ORGAO[o.tipo] || o.tipo) + ' · ' + o.perfil)
          ),
          o.ativo ? null : el('span', { class: 'etiqueta etiqueta-inativo' }, 'Inativo')
        )
      ));
    }
  }
  $('busca-orgao').addEventListener('input', (ev) => desenharListaOrgaos(ev.target.value));

  async function abrirOrgao(o) {
    mostrarTela('tela-carregando');
    etapa(70, 'Abrindo ' + (o.sigla || o.nome) + '…');
    const { data, error } = await sb.rpc('minhas_permissoes', { p_orgao: o.id });
    if (error) { toast(traduzirErro(error), true); mostrarListaOrgaos(); return; }
    estado.orgao = o;
    estado.permissoes = {};
    for (const p of data || []) {
      estado.permissoes[p.modulo] = { ver: p.pode_ver, editar: p.pode_editar, publicar: p.pode_publicar, excluir: p.pode_excluir };
    }
    etapa(85, 'Montando o menu…');
    // Usuários (0.21.0): página única de todos os órgãos que a pessoa gerencia, aberta com qualquer
    // órgão. O que ela pode fazer em cada órgão a própria tela confere (orgaos_que_gerencio).
    if (!(estado.permissoes.usuarios && estado.permissoes.usuarios.ver)) {
      const g = await sb.rpc('pode_gerir_usuarios');
      if (!g.error && g.data) estado.permissoes.usuarios = { ver: true, editar: false, publicar: false, excluir: false };
    }
    // Alcance: unidade à qual o vínculo está limitado (null = órgão todo).
    // Usado para esconder botões de registros de outras unidades (o banco também bloqueia).
    estado.alcanceUnidade = null;
    estado.alcanceNome = null;
    if (estado.usuario && estado.usuario.id) {
      const v = await sb.from('usuarios_orgaos').select('unidade_id, unidades(nome)')
        .eq('orgao_id', o.id).eq('usuario_id', estado.usuario.id).maybeSingle();
      if (v.data && v.data.unidade_id) {
        estado.alcanceUnidade = v.data.unidade_id;
        estado.alcanceNome = v.data.unidades ? v.data.unidades.nome : null;
      }
    }
    guardar('pntp_ultimo_orgao', o.id);
    // "Ver site": enquanto o domínio do órgão não aponta para o portal, o site
    // abre pelo endereço do GitHub com ?orgao= (o site descobre o órgão por ele).
    $('btn-ver-site').onclick = () => window.open('../site/?orgao=' + o.id, '_blank', 'noopener');
    etapa(100, 'Pronto.');
    montarPainel();
  }

  // ---------- painel ----------
  function montarPainel() {
    const o = estado.orgao;
    $('topo-orgao-nome').textContent = o.nome;
    $('topo-orgao-perfil').textContent = (TIPO_ORGAO[o.tipo] || o.tipo) + ' · Seu perfil: ' + o.perfil +
      (estado.alcanceNome ? ' · ' + estado.alcanceNome : '');
    $('topo-usuario').textContent = estado.usuario.nome || estado.usuario.email;
    $('btn-trocar-orgao').hidden = estado.orgaos.length < 2;

    // Menu: só módulos que o perfil pode ver, agrupados e na ordem do catálogo.
    // Cada grupo é um bloco (título + itens recuados), para a pesquisa do menu esconder grupos vazios.
    const menu = $('menu');
    menu.replaceChildren(el('a', { href: '#/inicio', 'data-rota': 'inicio', class: 'menu-inicio' }, 'Início'));
    let bloco = null, grupoAtual = null;
    for (const m of estado.modulos) {
      if (!(estado.permissoes[m.codigo] && estado.permissoes[m.codigo].ver)) continue;
      if (m.grupo !== grupoAtual) {
        grupoAtual = m.grupo;
        bloco = el('div', { class: 'menu-bloco', role: 'group', 'aria-label': m.grupo }, el('span', { class: 'menu-grupo', 'aria-hidden': 'true' }, m.grupo));
        menu.append(bloco);
      }
      bloco.append(el('a', { href: '#/m/' + m.codigo, 'data-rota': m.codigo, 'data-busca': normalizar(m.nome + ' ' + m.grupo) }, m.nome));
    }
    menu.append(el('p', { class: 'menu-nada', hidden: true }, 'Nenhum item com esse nome.'));
    const busca = $('menu-busca');
    busca.value = '';
    mostrarTela('tela-painel');
    rotear();
  }

  $('btn-trocar-orgao').addEventListener('click', () => { estado.orgao = null; mostrarListaOrgaos(); });
  // Pesquisa no menu lateral: filtra os itens pelo nome (sem acento); Enter abre o primeiro.
  $('menu-busca').addEventListener('input', () => {
    const t = normalizar($('menu-busca').value.trim());
    let algum = false;
    for (const b of $('menu').querySelectorAll('.menu-bloco')) {
      let n = 0;
      for (const a of b.querySelectorAll('a')) { const ok = !t || a.dataset.busca.includes(t); a.hidden = !ok; if (ok) n++; }
      b.hidden = !n; if (n) algum = true;
    }
    $('menu').querySelector('.menu-inicio').hidden = !!t && !'inicio'.includes(t);
    $('menu').querySelector('.menu-nada').hidden = algum || !t;
  });
  $('menu-busca').addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { ev.target.value = ''; ev.target.dispatchEvent(new Event('input')); }
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    const a = [...$('menu').querySelectorAll('a')].find((x) => !x.hidden && !(x.closest('.menu-bloco') || {}).hidden);
    if (a) { location.hash = a.getAttribute('href'); ev.target.value = ''; ev.target.dispatchEvent(new Event('input')); }
  });
  $('btn-menu').addEventListener('click', () => {
    const aberta = $('lateral').classList.toggle('aberta');
    $('btn-menu').setAttribute('aria-expanded', aberta ? 'true' : 'false');
  });
  $('menu').addEventListener('click', (ev) => {
    if (ev.target.tagName === 'A') { $('lateral').classList.remove('aberta'); $('btn-menu').setAttribute('aria-expanded', 'false'); }
  });

  function rotear() {
    if (!estado.orgao) return;
    const hash = location.hash || '#/inicio';
    const m = hash.match(/^#\/m\/([a-z_]+)(?:\?.*)?$/);
    const rota = m ? m[1] : 'inicio';
    for (const a of $('menu').querySelectorAll('a')) {
      if (a.dataset.rota === rota) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    }
    const conteudo = $('conteudo');
    if (conteudo._vigia) { conteudo._vigia.disconnect(); conteudo._vigia = null; }
    if (rota === 'inicio') telaInicio(conteudo);
    else telaModulo(conteudo, rota);
    conteudo.focus({ preventScroll: true });
    // Toda troca de tela começa do alto da página.
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', rotear);

  function telaInicio(c) {
    const o = estado.orgao;
    const nome = (estado.usuario.nome || '').split(' ')[0];
    c.replaceChildren(
      el('h1', null, nome ? 'Olá, ' + nome : 'Início'),
      el('p', { class: 'sub' }, 'Painel de gestão · ' + o.nome + ' · ' + (TIPO_ORGAO[o.tipo] || o.tipo) + ' · seu perfil: ' + o.perfil),
      painelAvaliacao(),
      quadroLinksFora(),
      quadroLembretes()
    );
  }

  // Endereços externos (Destinos das páginas e sistemas) que não responderam em 2 verificações
  // seguidas (script 27). A autoavaliação conta a página externa como atendida; este quadro avisa
  // quando o endereço deixou de abrir, para o órgão corrigir antes da avaliação do Tribunal.
  function quadroLinksFora() {
    const sec = el('section', { class: 'cartao lembretes-inicio', hidden: true });
    sb.rpc('situacao_links_orgao', { p_orgao: estado.orgao.id }).then(({ data, error }) => {
      const fora = error ? [] : (data || []).filter((x) => x.falhas_seguidas >= 2);
      if (!fora.length) return;
      const pode = estado.permissoes.aparencia && estado.permissoes.aparencia.ver;
      sec.hidden = false;
      sec.replaceChildren(el('h2', null, 'Endereços externos sem responder'),
        el('div', { class: 'msg msg-falta' }, el('p', null, fora.length + ' endereço(s) externo(s) não abriram nas últimas verificações diárias. Para quem visita o site (e para o Tribunal de Contas), a informação está fora do ar.'),
          el('ul', null, fora.map((x) => el('li', null, el('strong', null, x.url), ' — ', x.erro || 'não respondeu', ' (', x.falhas_seguidas, ' verificações seguidas)'))),
          pode ? el('p', null, el('a', { href: '#/m/aparencia?aba=destinos' }, 'Corrigir em Aparência › Destinos das páginas')) : null));
    });
    return sec;
  }

  // ---------- Autoavaliação automática do PNTP (script 26) ----------
  // avaliacao_pntp: um registro por critério da matriz (96 na prefeitura), com os itens de
  // verificação atendidos, o que falta e onde corrigir. avaliacao_pntp_resumo: índice e nível.
  // Guardada por 2 minutos (troca de tela rápida); gravar algo e voltar ao Início recalcula.
  const NIVEIS_PNTP = {
    diamante: ['Diamante', 'nivel-diamante'], ouro: ['Ouro', 'nivel-ouro'], prata: ['Prata', 'nivel-prata'],
    elevado: ['Elevado', 'nivel-elevado'], intermediario: ['Intermediário', 'nivel-intermediario'], basico: ['Básico', 'nivel-basico'],
    inicial: ['Inicial', 'nivel-inicial'], inexistente: ['Inexistente', 'nivel-inicial']
  };
  const CLASSIF_PNTP = { essencial: 'Essencial', obrigatoria: 'Obrigatória', recomendada: 'Recomendada' };
  const ITENS_PNTP = [['D', 'disponibilidade', 'Disponibilidade'], ['A', 'atualidade', 'Atualidade'], ['S', 'serie_historica', 'Série histórica'],
    ['G', 'gravacao', 'Gravação de relatórios'], ['F', 'filtro', 'Filtro de pesquisa']];
  let aval = { quando: 0, linhas: null, resumo: null };
  async function avaliacao(forcar) {
    if (!forcar && aval.linhas && Date.now() - aval.quando < 120000 && aval.orgao === estado.orgao.id) return aval;
    const [l, r] = await Promise.all([sb.rpc('avaliacao_pntp', { p_orgao: estado.orgao.id }), sb.rpc('avaliacao_pntp_resumo', { p_orgao: estado.orgao.id })]);
    if (l.error || r.error) throw (l.error || r.error);
    aval = { quando: Date.now(), orgao: estado.orgao.id, linhas: l.data || [], resumo: (r.data || [])[0] || null };
    return aval;
  }
  const pct = (v) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  const podeVerCriterio = (x) => !x.modulo || (estado.permissoes[x.modulo] && estado.permissoes[x.modulo].ver);
  // Peso que falta no índice: o que mais sobe a nota vem primeiro (essenciais sempre antes).
  const impacto = (x) => (x.classificacao === 'essencial' ? 1000 : 0) + Number(x.peso_dimensao) * Number(x.peso_criterio) * (1 - Number(x.nota));

  // Uma linha de critério (mesmo desenho no Início e no alto de cada módulo).
  function linhaCriterio(x, comModulo) {
    const mod = x.modulo && estado.modulos.find((m) => m.codigo === x.modulo);
    const icone = x.situacao === 'atende' ? '✓' : x.situacao === 'parcial' ? '!' : '✕';
    const itens = ITENS_PNTP.filter(([letra]) => x.itens.includes(letra)).map(([, campo, rotulo]) =>
      el('span', { class: 'item-pntp ' + (x[campo] ? 'item-ok' : 'item-falta') }, el('span', { 'aria-hidden': 'true' }, x[campo] ? '✓ ' : '! '), rotulo,
        el('span', { class: 'sr' }, x[campo] ? ' (atendido)' : ' (falta)')));
    const corrigir = x.rota && x.situacao !== 'atende' && podeVerCriterio(x)
      ? el('a', { class: 'btn btn-claro btn-p', href: x.rota }, 'Corrigir', el('span', { class: 'sr' }, ' o critério ' + x.codigo)) : null;
    return el('li', { class: 'crit-pntp crit-' + x.situacao },
      el('span', { class: 'crit-icone', 'aria-hidden': 'true' }, icone),
      el('div', { class: 'crit-corpo' },
        el('div', { class: 'crit-titulo' }, el('strong', null, x.codigo), ' ', x.titulo,
          el('span', { class: 'etiqueta etiqueta-classif-' + x.classificacao }, CLASSIF_PNTP[x.classificacao]),
          x.externo ? el('span', { class: 'etiqueta' }, 'sistema externo: conferir lá') : null,
          comModulo && mod ? el('span', { class: 'crit-modulo' }, mod.nome) : null),
        el('div', { class: 'itens-pntp' }, itens),
        x.falta && x.falta.length ? el('ul', { class: 'crit-falta' }, x.falta.map((t) => el('li', null, t))) : null),
      corrigir);
  }

  function painelAvaliacao() {
    const sec = el('section', { class: 'cartao painel-pntp', 'aria-labelledby': 'tit-aval' },
      el('h2', { id: 'tit-aval' }, 'Autoavaliação automática do PNTP 2026'), el('p', { class: 'ajuda' }, 'Calculando…'));
    avaliacao(true).then(({ linhas, resumo }) => {
      if (!resumo) throw new Error('sem resumo');
      const nv = NIVEIS_PNTP[resumo.nivel] || [resumo.nivel, ''];
      const quando = new Date(resumo.calculado_em || Date.now());
      const visiveis = linhas.filter(podeVerCriterio);
      const pend = visiveis.filter((x) => x.situacao !== 'atende').sort((a, b) => impacto(b) - impacto(a));
      const externos = visiveis.filter((x) => x.externo);
      // Próximo nível: o que falta para subir.
      const ind = Number(resumo.indice) || 0;
      const faltaEss = resumo.essenciais - resumo.essenciais_atendidos;
      const meta = ind >= 95 ? null : ind >= 85 ? ['Diamante', 95] : ind >= 75 ? ['Ouro', 85] : ['Prata', 75];
      const proximo = resumo.nivel === 'diamante' ? 'Nível máximo alcançado na autoavaliação.'
        : (meta ? 'Para chegar a ' + meta[0] + ': índice de ' + meta[1] + '%' + (ind < meta[1] ? ' (faltam ' + pct(meta[1] - ind) + ')' : '') : '')
          + (faltaEss > 0 ? (meta ? ' e ' : 'Para ter selo: ') + 'atender todos os critérios essenciais (falta' + (faltaEss > 1 ? 'm ' : ' ') + faltaEss + ').' : '.');
      // Por dimensão.
      const dims = [];
      linhas.forEach((x) => {
        let d = dims.find((y) => y.nome === x.dimensao);
        if (!d) dims.push(d = { nome: x.dimensao, peso: 0, pontos: 0, total: 0, ok: 0 });
        const p = Number(x.peso_dimensao) * Number(x.peso_criterio);
        d.peso += p; d.pontos += p * Number(x.nota); d.total++; if (x.situacao === 'atende') d.ok++;
      });
      const barra = (v) => el('span', { class: 'barra-pntp', role: 'img', 'aria-label': pct(v) }, el('span', { style: 'width:' + Math.max(0, Math.min(100, v)) + '%' }));
      const todos = el('details', { class: 'todos-pntp' }, el('summary', null, 'Ver os ' + linhas.length + ' critérios da matriz'),
        el('ul', { class: 'lista-crit' }, linhas.filter(podeVerCriterio).map((x) => linhaCriterio(x, true))),
        linhas.length > visiveis.length ? el('p', { class: 'ajuda' }, (linhas.length - visiveis.length) + ' critério(s) de módulos que o seu perfil não acessa ficam ocultos; contam no índice.') : null);
      sec.replaceChildren(...[
        el('div', { class: 'cab-pntp' },
          el('div', null, el('h2', { id: 'tit-aval' }, 'Autoavaliação automática do PNTP 2026'),
            el('p', { class: 'ajuda' }, 'Situação atual, calculada em ' + quando.toLocaleDateString('pt-BR') + ' às ' + quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
              + ' com o que está publicado no portal. É uma estimativa: o que depende de leitura (qualidade dos textos, conteúdo dos arquivos, sistemas externos) cabe à conferência do próprio órgão, e a nota oficial é a do Tribunal de Contas.')),
          el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => sec.replaceWith(painelAvaliacao()) }, 'Recalcular')),
        el('div', { class: 'resumo-pntp' },
          el('div', { class: 'indice-pntp' }, el('span', { class: 'rotulo' }, 'Índice estimado'), el('strong', null, pct(resumo.indice)), barra(ind)),
          el('div', { class: 'nivel-pntp ' + nv[1] }, el('span', { class: 'rotulo' }, 'Nível atual'), el('strong', null, nv[0])),
          el('div', null, el('span', { class: 'rotulo' }, 'Essenciais atendidos'), el('strong', { class: faltaEss ? 'txt-falta' : 'txt-ok' }, resumo.essenciais_atendidos + ' de ' + resumo.essenciais)),
          el('div', null, el('span', { class: 'rotulo' }, 'Critérios'), el('strong', null, resumo.atendidos + ' ✓ · ' + resumo.parciais + ' ! · ' + resumo.nao_atendidos + ' ✕'),
            el('span', { class: 'sub-linha' }, 'atendidos · parciais · não atendidos'))),
        el('p', { class: 'proximo-pntp' }, proximo),
        el('details', { class: 'dims-pntp' }, el('summary', null, 'Situação por dimensão'),
          el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela tabela-compacta' },
            el('thead', null, el('tr', null, el('th', null, 'Dimensão'), el('th', null, 'Critérios atendidos'), el('th', null, 'Pontuação'))),
            el('tbody', null, dims.map((d) => el('tr', null, el('td', null, d.nome), el('td', { class: 'num' }, d.ok + ' de ' + d.total),
              el('td', null, barra(100 * d.pontos / d.peso), ' ', pct(100 * d.pontos / d.peso)))))))),
        el('h3', { class: 'tit-pend' }, pend.length ? 'O que falta (' + pend.length + '), começando pelo que mais pesa' : 'Nada pendente nos módulos que você acessa'),
        pend.length ? el('div', { class: 'aviso-pntp' }, el('ul', { class: 'lista-crit' }, pend.slice(0, 12).map((x) => linhaCriterio(x, true))),
          pend.length > 12 ? el('details', { class: 'todos-pntp' }, el('summary', null, 'Mostrar as outras ' + (pend.length - 12) + ' pendências'),
            el('ul', { class: 'lista-crit' }, pend.slice(12).map((x) => linhaCriterio(x, true)))) : null)
          : el('p', { class: 'msg msg-ok' }, '✓ Todos os critérios dos seus módulos estão atendidos na autoavaliação.'),
        externos.length ? el('p', { class: 'ajuda' }, 'Atendidos por sistema externo (conferir lá): ' + externos.map((x) => x.codigo).join(', ') + '.') : null,
        todos].filter(Boolean));
    }).catch((e) => {
      sec.replaceChildren(el('h2', { id: 'tit-aval' }, 'Autoavaliação automática do PNTP 2026'),
        el('p', { class: 'msg msg-erro' }, /avaliacao_pntp|Could not find|does not exist/i.test((e && e.message) || '') ? 'Falta rodar o script 26 no banco.' : traduzirErro(e)));
    });
    return sec;
  }

  // Aviso padrão no alto de cada módulo: critérios do PNTP do módulo + lembretes de prazo.
  // (Antes, cada módulo tinha o seu quadro; agora todos usam este.)
  // Depois de gravar numa tela que não se redesenha: tira o aviso e o vigia põe de novo, recalculado.
  function atualizarAvisos() { document.querySelectorAll('#conteudo .aviso-modulo').forEach((x) => x.remove()); }
  async function avisosDoModulo(c, codigo) {
    let crit = [];
    try { crit = (await avaliacao(true)).linhas.filter((x) => x.modulo === codigo); } catch (_) { /* sem o script 26 */ }
    const lemb = (await pendencias()).filter((x) => x.modulo === codigo && !COBERTO_PELA_AVALIACAO.test(x.mensagem));
    if ((!crit.length && !lemb.length) || !c.isConnected) return;
    const pend = crit.filter((x) => x.situacao !== 'atende').sort((a, b) => impacto(b) - impacto(a));
    const ok = crit.length - pend.length;
    const titulo = pend.length ? 'Situação no PNTP: ' + pend.length + ' critério(s) com pendência' + (ok ? ' · ' + ok + ' atendido(s)' : '')
      : crit.length ? 'Situação no PNTP: ' + crit.length + ' critério(s) atendido(s)' : 'Lembretes de prazo';
    const caixa = el('details', { class: 'aviso-pntp aviso-modulo' + (pend.length || lemb.some((x) => x.nivel === 'alerta') ? '' : ' aviso-pntp-ok'), open: false },  // fechado: o título já diz quantas pendências; quem quiser clica para ver (0.22.1)
      el('summary', null, el('span', { 'aria-hidden': 'true' }, pend.length || lemb.length ? '⚠ ' : '✓ '), titulo),
      crit.length ? el('ul', { class: 'lista-crit' }, pend.concat(crit.filter((x) => x.situacao === 'atende')).map((x) => linhaCriterio(x, false))) : null,
      lemb.length ? el('div', { class: 'lembretes' }, el('strong', null, 'Lembretes de prazo'),
        el('ul', null, lemb.map((x) => el('li', { class: 'pend-' + x.nivel }, /^[^\s(]+\([a-zõ]+\)/.test(x.mensagem) ? x.quantidade + ' ' : '', x.mensagem)))) : null,
      el('p', { class: 'ajuda' }, 'Autoavaliação automática com o que está publicado. ', el('a', { href: '#/inicio' }, 'Ver o painel completo no Início')));
    c.querySelectorAll('.aviso-modulo').forEach((x) => x.remove());
    const antes = c.querySelector('.cabecalho-modulo') || c.querySelector('h1');
    if (antes) antes.after(caixa); else c.prepend(caixa);
  }

  // ---------- lembretes de prazo (pendencias_atualizacao, scripts 20 a 25) ----------
  // O que já entra na autoavaliação (mensagens com "PNTP" e as regras de prazo que ela confere)
  // não se repete; ficam os lembretes do dia a dia (fila do e-SIC, notícias, aditivos…).
  const COBERTO_PELA_AVALIACAO = /PNTP|valor repassado sem conferência|vigência encerrada ainda marcados|sem medição há mais|previsão de conclusão vencida|abertura já passada|inscrições encerradas ainda/;
  let pend = { quando: 0, linhas: [] };
  async function pendencias(forcar) {
    if (!forcar && Date.now() - pend.quando < 120000 && pend.orgao === estado.orgao.id) return pend.linhas;
    const { data, error } = await sb.rpc('pendencias_atualizacao', { p_orgao: estado.orgao.id });
    pend = { quando: Date.now(), orgao: estado.orgao.id, linhas: error ? [] : (data || []).filter((x) => estado.permissoes[x.modulo] && estado.permissoes[x.modulo].ver) };
    return pend.linhas;
  }
  function quadroLembretes() {
    const sec = el('section', { class: 'cartao lembretes-inicio', hidden: true });
    pendencias(true).then((linhas) => {
      const l = linhas.filter((x) => !COBERTO_PELA_AVALIACAO.test(x.mensagem));
      if (!l.length) return;
      sec.hidden = false;
      sec.replaceChildren(el('h2', null, 'Lembretes de prazo'),
        el('div', { class: 'aviso-pntp' }, el('ul', null, l.map((x) => {
          const mod = estado.modulos.find((m) => m.codigo === x.modulo);
          return el('li', { class: 'pend-' + x.nivel }, mod ? [el('a', { href: '#/m/' + x.modulo }, mod.nome), ': '] : null, /^[^\s(]+\([a-zõ]+\)/.test(x.mensagem) ? x.quantidade + ' ' : '', x.mensagem);
        }))));
    });
    return sec;
  }

  // Módulo que corresponde a uma página inteira do site (os que têm várias páginas, como Receitas e
  // despesas, desativam aba por aba).
  const DESTINO_MODULO = { licitacoes: 'licitacoes', pca: 'pca', sancoes: 'sancionados', contratos: 'contratos', obras: 'obras', convenios: 'convenios',
    emendas: 'emendas', contas: 'planejamento', concursos: 'concursos', servicos: 'carta_servicos', publicacoes: 'publicacoes',
    saude: 'saude', educacao: 'educacao', renuncias: 'renuncias', pessoal: 'pessoal', diarias: 'diarias',
    esic: 'esic', ouvidoria: 'ouvidoria' };
  function telaModulo(c, codigo) {
    const mod = estado.modulos.find((m) => m.codigo === codigo);
    const p = estado.permissoes[codigo];
    if (!mod || !p || !p.ver) {
      c.replaceChildren(el('h1', null, 'Acesso não permitido'),
        el('p', { class: 'sub' }, 'Seu perfil não tem acesso a este módulo.'));
      return;
    }
    if (telas[codigo]) {
      c.replaceChildren(el('h1', null, mod.nome), el('p', { class: 'sub' }, 'Carregando…'));
      // Destinos atualizados (podem ter mudado em Aparência) antes de desenhar a tela.
      sb.from('orgaos').select('configuracoes').eq('id', estado.orgao.id).maybeSingle().then(({ data }) => {
        if (data) estado.orgao.configuracoes = data.configuracoes || {};
        if (location.hash.split('?')[0] !== '#/m/' + codigo) return;
        const ext = externo(DESTINO_MODULO[codigo]);
        if (ext) { c.replaceChildren(el('h1', null, mod.nome), el('p', { class: 'sub' }, mod.grupo), avisoExterno(ext)); return; }
        // Depois que a tela termina de desenhar, coloca os avisos de prazo do módulo no alto.
        Promise.resolve(telas[codigo](c, mod, p)).then(() => avisosDoModulo(c, codigo)).catch(() => {});
        // A tela se redesenha depois de gravar (o aviso some junto): o aviso volta, recalculado.
        if (c._vigia) c._vigia.disconnect();
        let espera = null;
        c._vigia = new MutationObserver(() => {
          if (c.querySelector('.aviso-modulo') || location.hash.split('?')[0] !== '#/m/' + codigo) return;
          clearTimeout(espera); espera = setTimeout(() => { if (!c.querySelector('.aviso-modulo')) avisosDoModulo(c, codigo).catch(() => {}); }, 500);
        });
        c._vigia.observe(c, { childList: true, subtree: true });
      });
      return;
    }
    const chip = (rotulo, ok) => el('span', { class: 'chip ' + (ok ? 'chip-sim' : 'chip-nao') }, rotulo);
    c.replaceChildren(
      el('h1', null, mod.nome),
      el('p', { class: 'sub' }, mod.grupo),
      el('div', { class: 'grade' },
        el('section', { class: 'cartao' },
          el('h2', null, 'Em construção'),
          el('p', null, 'Este módulo será construído na Fase ' + (FASE_MODULO[codigo] || '—') + '.')
        ),
        el('section', { class: 'cartao' },
          el('h2', null, 'O que o seu perfil pode fazer aqui'),
          el('div', { class: 'chips' },
            chip('Ver', p.ver), chip('Cadastrar e editar', p.editar),
            chip('Aprovar e publicar', p.publicar), chip('Excluir', p.excluir))
        )
      )
    );
  }

  // ---------- paginação automática das listagens ----------
  // Toda tabela de listagem do painel (.tabela-caixa) com mais de 25 linhas ganha páginas
  // numeradas (25 por página). Funciona junto com "Carregar mais": as linhas novas entram nas
  // páginas seguintes. As linhas escondidas continuam no formulário (ex.: planilha de obras).
  const POR_PAGINA = 25;
  function paginarTabela(caixa) {
    const corpo = caixa.querySelector('tbody');
    if (!corpo) return;
    const linhas = [...corpo.children];
    let nav = caixa.nextElementSibling && caixa.nextElementSibling.classList.contains('paginacao') ? caixa.nextElementSibling : null;
    const paginas = Math.ceil(linhas.length / POR_PAGINA);
    if (paginas <= 1) { linhas.forEach((l) => { if (l.dataset.pag) { l.hidden = false; delete l.dataset.pag; } }); if (nav) nav.remove(); return; }
    let atual = Math.min(Number(caixa.dataset.pagina || 1), paginas);
    const mostrar = (n, rolar) => {
      atual = n; caixa.dataset.pagina = n;
      linhas.forEach((l, k) => { l.dataset.pag = '1'; l.hidden = Math.floor(k / POR_PAGINA) + 1 !== n; });
      const botao = (rot, alvo, extra) => el('button', Object.assign({ type: 'button', class: 'pag-btn', disabled: alvo < 1 || alvo > paginas || alvo === n ? (alvo === n && typeof rot === 'number' ? null : true) : null,
        'aria-current': typeof rot === 'number' && alvo === n ? 'page' : null, onclick: () => mostrar(alvo, true) }, extra || {}), String(rot));
      const nums = [];
      for (let i = 1; i <= paginas; i++) {
        if (i === 1 || i === paginas || Math.abs(i - n) <= 2) nums.push(botao(i, i));
        else if (nums.length && nums[nums.length - 1].textContent !== '…') nums.push(el('span', { class: 'pag-reticencias' }, '…'));
      }
      const novo = el('nav', { class: 'paginacao', 'aria-label': 'Páginas da lista' },
        botao('‹', n - 1, { 'aria-label': 'Página anterior' }), nums, botao('›', n + 1, { 'aria-label': 'Próxima página' }),
        el('span', { class: 'ajuda pag-info' }, 'Linhas ' + ((n - 1) * POR_PAGINA + 1) + '–' + Math.min(n * POR_PAGINA, linhas.length) + ' de ' + linhas.length));
      if (nav) nav.replaceWith(novo); else caixa.after(novo);
      nav = novo;
      if (rolar) caixa.scrollIntoView({ block: 'start', behavior: 'smooth' });
    };
    mostrar(atual, false);
  }
  let pagPendente = false;
  new MutationObserver((mut) => {
    // Ignora as mudanças feitas pela própria paginação.
    if (mut.every((m) => [...m.addedNodes, ...m.removedNodes].every((n) => n.nodeType === 1 && n.classList.contains('paginacao')))) return;
    if (pagPendente) return;
    pagPendente = true;
    requestAnimationFrame(() => {
      pagPendente = false;
      for (const caixa of document.querySelectorAll('#conteudo .tabela-caixa')) paginarTabela(caixa);
    });
  }).observe(document.getElementById('conteudo'), { childList: true, subtree: true });

  // ---------- início ----------
  // Link de recuperação de senha: a Supabase abre a página já com sessão e avisa por este evento.
  sb.auth.onAuthStateChange((evento) => {
    if (evento === 'PASSWORD_RECOVERY') prepararNovaSenha(LINK_INICIAL.tipo === 'invite' ? 'invite' : 'recovery');
    if (evento === 'SIGNED_OUT') { estado.usuario = null; estado.orgao = null; mostrarForm('form-login'); }
  });

  async function iniciar() {
    mostrarVersao();
    // Link vencido ou já usado: a Supabase devolve o erro no endereço.
    if (LINK_INICIAL.erro) {
      history.replaceState(null, '', location.pathname);
      mostrarForm('form-login');
      msg('login-msg', /expired/i.test(LINK_INICIAL.erro) || LINK_INICIAL.erro === 'access_denied'
        ? 'O link expirou ou já foi usado. Peça um novo link ao administrador do órgão ou use "Esqueci minha senha".'
        : 'Não foi possível usar o link. Peça um novo ao administrador do órgão.', 'info');
      return;
    }
    // Veio por convite ou recuperação: getSession espera a Supabase processar o link.
    if (LINK_INICIAL.tipo === 'invite' || LINK_INICIAL.tipo === 'recovery') {
      mostrarTela('tela-carregando');
      const { data: { session } } = await sb.auth.getSession();
      history.replaceState(null, '', location.pathname);
      if (session) { prepararNovaSenha(LINK_INICIAL.tipo); return; }
      mostrarForm('form-login');
      msg('login-msg', 'O link expirou ou já foi usado. Peça um novo link ao administrador do órgão ou use "Esqueci minha senha".', 'info');
      return;
    }
    const { data: { session } } = await sb.auth.getSession();
    if (session) await carregarContexto();
    else mostrarForm('form-login');
  }

  // ---------- utilidades compartilhadas com os módulos ----------

  // Caixa de diálogo padrão (formulários e confirmações).
  function abrirDialogo(titulo, corpo, acoes) {
    const d = el('dialog', { class: 'dialogo', 'aria-label': titulo },
      el('div', { class: 'dialogo-topo' },
        el('h2', null, titulo),
        el('button', { type: 'button', class: 'dialogo-fechar', 'aria-label': 'Fechar', onclick: () => d.close() }, '×')
      ),
      el('div', { class: 'dialogo-corpo' }, corpo),
      el('div', { class: 'dialogo-acoes' }, acoes || [])
    );
    d.addEventListener('close', () => {
      // Devolve o aviso para a página antes de apagar a janela (senão ele some junto).
      const t = $('toast');
      if (d.contains(t)) document.body.append(t);
      d.remove();
    });
    document.body.append(d);
    d.showModal();
    return d;
  }

  function confirmar(titulo, texto, rotuloOk, perigo) {
    return new Promise((resolver) => {
      let resposta = false;
      const btnOk = el('button', { type: 'button', class: 'btn ' + (perigo ? 'btn-perigo' : 'btn-primario') }, rotuloOk || 'Confirmar');
      const d = abrirDialogo(titulo, el('p', null, texto), [
        el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Cancelar'),
        btnOk
      ]);
      btnOk.addEventListener('click', () => { resposta = true; d.close(); });
      d.addEventListener('close', () => resolver(resposta));
    });
  }

  function aviso(titulo, texto) {
    const d = abrirDialogo(titulo, el('p', null, texto), [
      el('button', { type: 'button', class: 'btn btn-primario', onclick: () => d.close() }, 'Entendi')
    ]);
  }

  // Reduz a imagem no navegador antes de enviar (regra do projeto: nada de arquivo gigante).
  function reduzirImagem(arquivo, ladoMaximo) {
    return new Promise((resolver, rejeitar) => {
      const img = new Image();
      img.onload = () => {
        const escala = Math.min(1, ladoMaximo / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * escala);
        c.height = Math.round(img.height * escala);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        // WebP mantém transparência (brasão) e fica bem menor; PNG se o navegador não gerar WebP.
        c.toBlob((b) => {
          if (b && b.type === 'image/webp') resolver({ blob: b, ext: 'webp' });
          else c.toBlob((p) => p ? resolver({ blob: p, ext: 'png' }) : rejeitar(new Error('Não foi possível ler a imagem.')), 'image/png');
        }, 'image/webp', 0.9);
      };
      img.onerror = () => rejeitar(new Error('Arquivo de imagem inválido.'));
      img.src = URL.createObjectURL(arquivo);
    });
  }

  // PONTO ÚNICO DE ENVIO DE ARQUIVOS.
  // Hoje grava no Storage da Supabase; na produção, trocar só esta função para o Cloudflare R2.
  // Caminho: <órgão>/<módulo>/<nome aleatório>.<ext> — as regras do banco conferem a permissão pelo caminho.
  const BUCKET = 'arquivos';
  async function enviarArquivo(modulo, blob, ext, tipo) {
    const caminho = estado.orgao.id + '/' + modulo + '/' + crypto.randomUUID() + '.' + ext;
    const { error } = await sb.storage.from(BUCKET).upload(caminho, blob, { contentType: tipo || blob.type, upsert: false });
    if (error) throw error;
    return sb.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl;
  }

  // Apaga um arquivo antigo do nosso bucket (quando substituído). Falha silenciosa: não trava o salvamento.
  async function apagarArquivo(url) {
    if (!url) return;
    const marca = '/storage/v1/object/public/' + BUCKET + '/';
    const i = url.indexOf(marca);
    if (i < 0) return;
    try { await sb.storage.from(BUCKET).remove([url.slice(i + marca.length)]); } catch (e) { /* ignora */ }
  }

  const normalizar = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const ordemAlfabetica = (a, b) => (a || '').localeCompare(b || '', 'pt-BR', { sensitivity: 'base' });


  // ---------- utilidades do Lote 3 (conteúdo) ----------

  // Campo de formulário padrão: rótulo, entrada, ajuda e mensagem de erro.
  function campo(id, rotulo, input, ajuda, obrigatorio) {
    input.id = id;
    return el('div', { class: 'campo' },
      el('label', { for: id }, rotulo, obrigatorio ? el('span', { class: 'obrigatorio', 'aria-hidden': 'true' }, ' *') : null),
      input,
      ajuda ? el('span', { class: 'ajuda', id: id + '-ajuda' }, ajuda) : null,
      el('span', { class: 'erro-campo', id: id + '-erro' }));
  }


  // ---------- Declarações de que não há dados (script 23) ----------
  // Bloco usado em todo item do PNTP: situação atual ("o órgão não tem estagiários") ou um período
  // (mês, bimestre, trimestre, quadrimestre, semestre, ano ou datas). O texto é sugerido conforme o
  // item e o período (DECLARACOES_PNTP, em site/destinos.js) e pode ser reescrito pelo usuário.
  // o = { perm, aoMudar(lista) }. Devolve o elemento (com .recarregar()).
  const ABRANGENCIAS = { atual: 'Situação atual (sem período)', mes: 'Mês', bimestre: 'Bimestre', trimestre: 'Trimestre', quadrimestre: 'Quadrimestre',
    semestre: 'Semestre', ano: 'Ano (exercício)', periodo: 'Outro período (datas)' };
  const QTD_PERIODOS = { mes: 12, bimestre: 6, trimestre: 4, quadrimestre: 3, semestre: 2 };
  const NOMES_MES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  let seqDecl = 0;
  const declAbertos = new Set();   // blocos que o usuário abriu continuam abertos ao redesenhar o módulo
  const cacheDecl = { orgao: null, lista: null };
  // Todas as declarações do órgão (para as abas de ano dos módulos). recarregar: ignora o que está guardado.
  async function declaracoesDoOrgao(recarregar) {
    if (recarregar || cacheDecl.orgao !== estado.orgao.id || !cacheDecl.lista) {
      const { data, error } = await sb.from('declaracoes_inexistencia').select('*').eq('orgao_id', estado.orgao.id)
        .order('data_fim', { ascending: false, nullsFirst: true }).order('criado_em', { ascending: false }).limit(3000);
      cacheDecl.orgao = estado.orgao.id; cacheDecl.lista = error ? [] : data || [];
    }
    return cacheDecl.lista;
  }
  // Ajuda para as abas de ano: { lista, anos(anos) → anos + os só declarados, doAno(ano), texto(ano) }.
  async function declaracoesAnuais(chaves) {
    const ks = [].concat(chaves || []);
    const lista = (await declaracoesDoOrgao()).filter((d) => ks.includes(d.secao));
    const doAno = (ano) => lista.filter((d) => d.abrangencia !== 'atual' && Number(d.exercicio) === Number(ano));
    return {
      lista, doAno,
      atual: lista.find((d) => d.abrangencia === 'atual') || null,
      anos: (anos) => {
        const r = (anos || []).slice();
        for (const d of lista) if (d.abrangencia !== 'atual' && d.exercicio && !r.some((x) => Number(x.ano) === Number(d.exercicio))) r.push({ ano: Number(d.exercicio), total: 0 });
        return r.sort((a, b) => b.ano - a.ano);
      },
      // Mensagem para o ano sem registros: as declarações dele (ou nada).
      aviso: (ano) => {
        const d = doAno(ano);
        return d.length ? el('div', { class: 'msg msg-info' }, el('strong', null, 'Declarado: '), d.map((x) => window.periodoDeclaracaoPNTP(x) + ' — "' + x.texto + '"').join(' · ')) : null;
      }
    };
  }
  function declaracoes(chave, o) {
    o = o || {};
    const pode = !!(o.perm && o.perm.editar) && !estado.alcanceUnidade;
    const pre = 'dcl' + (++seqDecl) + '-';
    const info = (window.DECLARACOES_PNTP || {})[chave];
    const atualTopo = el('div'), lista = el('div'), resumo = el('span', { class: 'ajuda' });
    const det = el('details', { class: 'declaracoes' },
      el('summary', null, 'Declarar que não há dados', info ? ' — ' + info[0] : '', ' ', resumo),
      el('p', { class: 'ajuda' }, 'Quando não houver o que publicar, registre a declaração: para a situação atual (o site mostra só a declaração, no lugar da lista) ou para um período, como um ano, um mês ou um semestre (o site mostra a declaração dentro daquele período, com a data do registro). O texto vem sugerido e pode ser alterado.'),
      lista);
    det.open = declAbertos.has(chave);
    det.addEventListener('toggle', () => { if (det.open) declAbertos.add(chave); else declAbertos.delete(chave); });
    let itens = [];
    async function carregar() {
      const { data, error } = await sb.from('declaracoes_inexistencia').select('*').eq('orgao_id', estado.orgao.id).eq('secao', chave)
        .order('data_fim', { ascending: false, nullsFirst: true }).order('criado_em', { ascending: false }).limit(500);
      if (error) {
        det.replaceChildren(el('summary', null, 'Declarar que não há dados'), el('p', { class: 'msg msg-erro' },
          /declaracoes_inexistencia|Could not find|does not exist/i.test(error.message || '') ? 'Falta rodar o script 23 no banco.' : erroGravacao(error)));
        return;
      }
      itens = data || [];
      desenhar();
    }
    function desenhar() {
      const atual = itens.find((x) => x.abrangencia === 'atual');
      const periodos = itens.filter((x) => x.abrangencia !== 'atual');
      atualTopo.replaceChildren(atual ? el('p', { class: 'msg msg-info' }, el('strong', null, 'Declaração em vigor: '), '"' + atual.texto + '". ',
        'O site mostra só esta declaração, no lugar da lista. Para voltar a mostrar os dados, exclua-a em "Declarar que não há dados".') : '');
      resumo.textContent = itens.length ? '(' + itens.length + (itens.length === 1 ? ' registrada)' : ' registradas)') : '';
      lista.replaceChildren(
        itens.length ? el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela tabela-declaracoes' },
          el('thead', null, el('tr', null, ['Período', 'Declaração', 'Registrada em'].map((t) => el('th', { scope: 'col' }, t)), el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Ações')))),
          el('tbody', null, [atual].concat(periodos).filter(Boolean).map((d) => el('tr', null,
            el('td', null, el('strong', null, window.periodoDeclaracaoPNTP(d))),
            el('td', { class: 'quebra' }, d.texto),
            el('td', { class: 'num' }, dataBR(String(d.criado_em).slice(0, 10))),
            el('td', { class: 'acoes' }, pode ? el('button', { type: 'button', class: 'btn btn-claro btn-p btn-texto-perigo', onclick: () => excluir(d) }, 'Excluir') : null)))))) : el('p', { class: 'ajuda' }, 'Nenhuma declaração registrada.'),
        pode ? formulario() : '');
    }
    async function mudou() {
      await carregar();
      await declaracoesDoOrgao(true);
      if (o.aoMudar) o.aoMudar(itens);
    }
    async function excluir(d) {
      if (!await confirmar('Excluir declaração', 'Excluir a declaração "' + window.periodoDeclaracaoPNTP(d) + '"? Ela sai do site.', 'Excluir', true)) return;
      const { data, error } = await sb.from('declaracoes_inexistencia').delete().eq('id', d.id).select('id');
      if (error) return toast(erroGravacao(error), true);
      if (!data || !data.length) return toast('Seu perfil não pode excluir esta declaração.', true);
      toast('Declaração excluída.'); await mudou();
    }
    function formulario() {
      const Y = new Date().getFullYear();
      const fAbr = el('select', null, Object.entries(ABRANGENCIAS).map(([k, v]) => el('option', { value: k, selected: k === 'ano' }, v)));
      const fEx = el('input', { type: 'number', min: 1990, max: 2100, value: Y - 1 });
      let exMexido = false;   // o usuário trocou o exercício: as sugestões não mexem mais nele
      fEx.addEventListener('input', () => { exMexido = true; });
      const fNum = el('select');
      const fIni = el('input', { type: 'date' }), fFim = el('input', { type: 'date' });
      const fTxt = el('textarea', { rows: 2, maxlength: 500 });
      let editado = false;   // depois que o usuário mexe no texto, a sugestão não sobrescreve mais
      fTxt.addEventListener('input', () => { editado = fTxt.value.trim() !== ''; });
      const cEx = campo(pre + 'ex', 'Exercício', fEx), cNum = campo(pre + 'num', 'Período', fNum), cIni = campo(pre + 'ini', 'De', fIni), cFim = campo(pre + 'fim', 'Até', fFim);
      const atualDoForm = () => ({ abrangencia: fAbr.value, exercicio: parseInt(fEx.value, 10), numero: parseInt(fNum.value, 10), data_inicio: fIni.value, data_fim: fFim.value });
      const sugerir = () => { if (!editado && info) fTxt.value = window.textoDeclaracaoPNTP(chave, atualDoForm()); };
      const ajustar = () => {
        const a = fAbr.value, n = QTD_PERIODOS[a];
        cEx.hidden = a === 'atual' || a === 'periodo'; cNum.hidden = !n; cIni.hidden = cFim.hidden = a !== 'periodo';
        if (n) {
          fNum.replaceChildren(...Array.from({ length: n }, (_, k) => el('option', { value: k + 1 }, a === 'mes' ? NOMES_MES[k] : (k + 1) + 'º ' + a)));
          // Padrão: o último período já encerrado (em janeiro, o último do ano anterior).
          const atualIdx = Math.floor(new Date().getMonth() / (12 / n));   // período em curso, contando de 0
          if (!exMexido) fEx.value = atualIdx === 0 ? Y - 1 : Y;
          fNum.value = String(atualIdx === 0 ? n : atualIdx);
        } else if (a === 'ano' && !exMexido) fEx.value = Y - 1;
        sugerir();
      };
      fAbr.addEventListener('change', ajustar);
      [fEx, fNum, fIni, fFim].forEach((x) => x.addEventListener('change', sugerir));
      fEx.addEventListener('input', sugerir);
      ajustar();
      const restaurar = el('button', { type: 'button', class: 'link', onclick: () => { editado = false; sugerir(); } }, 'Usar o texto sugerido');
      const btn = el('button', { type: 'button', class: 'btn btn-claro' }, 'Registrar declaração');
      btn.addEventListener('click', async () => {
        const a = fAbr.value;
        const reg = { orgao_id: estado.orgao.id, secao: chave, abrangencia: a, texto: fTxt.value.trim() };
        if (!erroCampo(pre + 'txt', reg.texto.length < 10 ? 'Escreva a declaração (mínimo de 10 letras).' : '')) return;
        if (a === 'periodo') {
          if (!erroCampo(pre + 'ini', fIni.value ? '' : 'Informe o início.')) return;
          if (!erroCampo(pre + 'fim', fFim.value && fFim.value >= fIni.value ? '' : 'Informe o fim (igual ou depois do início).')) return;
          reg.data_inicio = fIni.value; reg.data_fim = fFim.value;
        } else if (a !== 'atual') {
          const ex = parseInt(fEx.value, 10);
          if (!erroCampo(pre + 'ex', ex >= 1990 && ex <= 2100 ? '' : 'Ano inválido.')) return;
          reg.exercicio = ex; if (QTD_PERIODOS[a]) reg.numero = parseInt(fNum.value, 10);
        }
        ocupado(btn, 'Registrando…');
        try {
          const { error } = await sb.from('declaracoes_inexistencia').insert(reg);
          if (error) throw error;
          toast('Declaração registrada.'); editado = false; await mudou();
        } catch (e) {
          if (/declaracoes_inexistencia_uk/.test((e && e.message) || '')) toast(a === 'atual' ? 'Já existe uma declaração de situação atual neste item.' : 'Esse período já tem declaração neste item.', true);
          else toast(erroGravacao(e), true);
        } finally { ocupado(btn); }
      });
      return el('fieldset', { class: 'opcoes declaracao-nova' }, el('legend', null, 'Nova declaração'),
        el('div', { class: 'grade-campos' }, campo(pre + 'abr', 'Vale para', fAbr), cEx, cNum, cIni, cFim),
        campo(pre + 'txt', 'Texto da declaração (aparece no site)', fTxt, 'Sugerido conforme o item e o período; pode ser alterado.'),
        el('div', { class: 'secao-parte-acoes' }, btn, restaurar));
    }
    carregar();
    const caixa = el('div', { class: 'bloco-declaracoes' }, atualTopo, det);
    caixa.recarregar = carregar;
    return caixa;
  }

  const dataBR = (d) => d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('pt-BR') : '';
  const dataHoraBR = (d) => d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  // Valor para <input type="datetime-local"> no horário local.
  function paraDataHoraLocal(iso) {
    const d = iso ? new Date(iso) : new Date();
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  const urlValida = (v) => /^https?:\/\/[^\s.]+\.\S+/.test(v || '');

  // Texto com formatação simples (estilo "markdown" reduzido) — nunca HTML.
  // Motivo: o conteúdo vai para o site público; aceitar HTML permitiria
  // colar código malicioso. Monta os elementos um a um, sem innerHTML.
  //   ## Título · **negrito** · *itálico* · - lista · 1. lista · [texto](https://…)
  function trechoFormatado(linha) {
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
  function renderTexto(texto) {
    const raiz = el('div', { class: 'texto-formatado' });
    const blocos = String(texto || '').replace(/\r/g, '').split(/\n{2,}/);
    for (const b of blocos) {
      const linhas = b.split('\n').filter((l) => l.trim());
      if (!linhas.length) continue;
      if (/^#{2,3}\s/.test(linhas[0]) && linhas.length === 1) {
        raiz.append(el('h3', null, trechoFormatado(linhas[0].replace(/^#{2,3}\s+/, ''))));
      } else if (linhas.every((l) => /^\s*[-*]\s+/.test(l))) {
        raiz.append(el('ul', null, linhas.map((l) => el('li', null, trechoFormatado(l.replace(/^\s*[-*]\s+/, ''))))));
      } else if (linhas.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
        raiz.append(el('ol', null, linhas.map((l) => el('li', null, trechoFormatado(l.replace(/^\s*\d+[.)]\s+/, ''))))));
      } else {
        const p = el('p');
        linhas.forEach((l, k) => { if (k) p.append(el('br')); p.append(trechoFormatado(l)); });
        raiz.append(p);
      }
    }
    return raiz;
  }

  // Editor de texto simples: barra de botões que insere a marcação + pré-visualização.
  function editorTexto(id, valor, linhas) {
    const area = el('textarea', { id, rows: linhas || 10, class: 'editor-area' });
    area.value = valor || '';
    // Sem nada selecionado, insere um texto de exemplo já selecionado: é só digitar por cima.
    const envolver = (antes, depois, exemplo) => {
      const ini = area.selectionStart, fim = area.selectionEnd;
      const sel = area.value.slice(ini, fim) || exemplo;
      area.setRangeText(antes + sel + depois, ini, fim, 'end');
      area.focus();
      area.setSelectionRange(ini + antes.length, ini + antes.length + sel.length);
    };
    // Lista/título: marca o começo da linha atual e deixa o cursor no fim dela.
    const prefixar = (prefixo) => {
      const ini = area.value.lastIndexOf('\n', area.selectionStart - 1) + 1;
      area.setRangeText(prefixo, ini, ini, 'end');
      let fimLinha = area.value.indexOf('\n', ini);
      if (fimLinha < 0) fimLinha = area.value.length;
      area.focus();
      area.setSelectionRange(fimLinha, fimLinha);
    };
    const previa = el('div', { class: 'editor-previa', hidden: true });
    const btnPrevia = el('button', { type: 'button', class: 'btn btn-claro btn-p', 'aria-pressed': 'false' }, 'Pré-visualizar');
    btnPrevia.addEventListener('click', () => {
      const ver = previa.hidden;
      previa.hidden = !ver; area.hidden = ver;
      btnPrevia.textContent = ver ? 'Voltar a editar' : 'Pré-visualizar';
      btnPrevia.setAttribute('aria-pressed', ver ? 'true' : 'false');
      if (ver) previa.replaceChildren(renderTexto(area.value));
    });
    const b = (rotulo, titulo, acao) => el('button', { type: 'button', class: 'btn btn-claro btn-p', title: titulo, onclick: acao }, rotulo);
    const barra = el('div', { class: 'editor-barra' },
      b('Título', 'Subtítulo dentro do texto', () => prefixar('## ')),
      b('Negrito', 'Negrito', () => envolver('**', '**', 'texto')),
      b('Itálico', 'Itálico', () => envolver('*', '*', 'texto')),
      b('• Lista', 'Lista com marcadores', () => prefixar('- ')),
      b('1. Lista', 'Lista numerada', () => prefixar('1. ')),
      b('Link', 'Link para outro endereço', () => {
        const url = prompt('Endereço do link (começando com https://):', 'https://');
        if (url && urlValida(url)) envolver('[', '](' + url + ')', 'texto do link');
      }),
      el('span', { style: 'flex:1' }),
      btnPrevia);
    return { elemento: el('div', { class: 'editor' }, barra, area, previa), area };
  }

  // Lista de escolha com opção "Outra (digitar)…".
  // Substitui o <datalist> do navegador, cuja lista sobreposta (escura, no Chrome) não
  // segue o visual do painel nem funciona igual em todos os aparelhos.
  function campoOutra(id, rotulo, opcoes, atual, ajuda, rotuloVazio) {
    const lista = [...new Set(opcoes.filter(Boolean))].sort(ordemAlfabetica);
    const OUTRA = '__outra__';
    const sel = el('select', { id },
      el('option', { value: '' }, rotuloVazio || '— Nenhuma —'),
      lista.map((o) => el('option', { value: o, selected: o === atual }, o)),
      el('option', { value: OUTRA }, 'Outra (digitar)…'));
    const txt = el('input', { type: 'text', id: id + '-outra', maxlength: 60, placeholder: 'Digite o nome', 'aria-label': rotulo + ': outra', hidden: true });
    if (atual && !lista.includes(atual)) { sel.value = OUTRA; txt.hidden = false; txt.value = atual; }
    sel.addEventListener('change', () => { txt.hidden = sel.value !== OUTRA; if (!txt.hidden) txt.focus(); });
    return {
      campo: el('div', { class: 'campo' },
        el('label', { for: id }, rotulo),
        el('div', { class: 'seletor-outra' }, sel, txt),
        ajuda ? el('span', { class: 'ajuda' }, ajuda) : null,
        el('span', { class: 'erro-campo', id: id + '-erro' })),
      valor: () => (sel.value === OUTRA ? txt.value.trim().replace(/\s+/g, ' ') : sel.value) || null
    };
  }

  // Lista paginada por cursor (regra do projeto: nunca carregar tudo).
  // montar(select, opcoes) devolve a consulta já com os filtros; a ordem é
  // <coluna> decrescente + id decrescente, e o cursor é a última linha exibida.
  // crescente = true para listas de cadastro (ordem alfabética, ex.: serviços).
  async function paginar(montar, coluna, ultimo, lote, crescente) {
    const op = crescente ? 'gt' : 'lt';
    let q = montar('*').order(coluna, { ascending: !!crescente }).order('id', { ascending: !!crescente }).limit(lote);
    if (ultimo) {
      const v = '"' + String(ultimo[coluna]).replace(/"/g, '') + '"';
      q = q.or(coluna + '.' + op + '.' + v + ',and(' + coluna + '.eq.' + v + ',id.' + op + '.' + ultimo.id + ')');
    }
    const { data, error } = await q;
    if (error) throw error;
    return { linhas: data, fim: data.length < lote };
  }
  // Total da consulta contado no servidor (sem baixar as linhas).
  async function contar(montar) {
    const { count, error } = await montar('id', { count: 'exact', head: true });
    if (error) throw error;
    return count || 0;
  }

  // ---------- CPF e CNPJ: dígitos verificadores e máscara ----------
  function cpfValido(d) {
    if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
    for (const t of [9, 10]) {
      let soma = 0;
      for (let i = 0; i < t; i++) soma += Number(d[i]) * (t + 1 - i);
      if ((soma * 10 % 11) % 10 !== Number(d[t])) return false;
    }
    return true;
  }
  function cnpjValido(d) {
    if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
    const calc = (n) => { const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const r = pesos.reduce((t, p, i) => t + Number(d[i]) * p, 0) % 11; return r < 2 ? 0 : 11 - r; };
    return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
  }
  // Mensagem de erro para um CPF/CNPJ (só números) ou '' se estiver certo. tipo: 'cpf', 'cnpj' ou os dois.
  function erroDoc(d, tipo) {
    if (!d) return '';
    if (tipo !== 'cnpj' && d.length === 11) return cpfValido(d) ? '' : 'CPF inválido: confira os números.';
    if (tipo !== 'cpf' && d.length === 14) return cnpjValido(d) ? '' : 'CNPJ inválido: confira os números.';
    return tipo === 'cnpj' ? 'O CNPJ tem 14 números.' : tipo === 'cpf' ? 'O CPF tem 11 números.' : 'CPF tem 11 números; CNPJ, 14.';
  }
  const formatarDoc = (d) => d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : d;
  // Máscara no campo: ao sair, formata e avisa na hora se o número não confere.
  function mascaraDoc(input, tipo) {
    input.setAttribute('inputmode', 'numeric');
    input.addEventListener('blur', () => {
      const d = input.value.replace(/\D/g, '');
      if (!d) return;
      input.value = formatarDoc(d);
      if (input.id) erroCampo(input.id, erroDoc(d, tipo));
    });
    return input;
  }

  // Erros comuns de gravação traduzidos (regras do banco já escrevem em português).
  function erroGravacao(e) {
    const t = (e && e.message) || '';
    if (e && e.amigavel) return t;
    if (/Seu perfil não pode publicar|Este processo está publicado|não pertence a um processo|dois níveis|mesmo órgão|dentro dele mesmo|tem subitens/.test(t)) return t;
    if (/row-level security/i.test(t)) return 'Seu perfil não tem permissão para gravar aqui (ou o registro está fora do seu alcance).';
    return traduzirErro(e);
  }
  const amigavel = (texto) => Object.assign(new Error(texto), { amigavel: true });

  // Grava e confere se a linha mudou (0 linhas = sem permissão/alcance).
  async function gravarRegistro(tabela, registro, id) {
    const q = id
      ? sb.from(tabela).update(registro).eq('id', id).select('id')
      : sb.from(tabela).insert(Object.assign({ orgao_id: estado.orgao.id }, registro)).select('id');
    const { data, error } = await q;
    if (error) throw error;
    if (!data || !data.length) throw amigavel('Nada foi gravado: seu perfil não tem permissão ou o registro está fora do seu alcance.');
    return data[0].id;
  }

  // Envio de PDF com as validações de tipo e tamanho.
  function validarPdf(arquivo) {
    if (!arquivo) return null;
    if (arquivo.type !== 'application/pdf') throw amigavel('Escolha um arquivo PDF.');
    if (arquivo.size > 10 * 1024 * 1024) throw amigavel('O PDF passa de 10 MB. Reduza o arquivo antes de enviar.');
    return arquivo;
  }

  // Registro das telas de cada módulo (preenchido pelos arquivos modulo-*.js).
  window.PNTP = {
    sb, estado, el, $, toast, msg, ocupado, erroCampo, traduzirErro, emailValido,
    cpfValido, cnpjValido, erroDoc, formatarDoc, mascaraDoc,
    abrirDialogo, confirmar, aviso, reduzirImagem, enviarArquivo, apagarArquivo,
    normalizar, ordemAlfabetica, telas, iniciar, rotear,
    campo, campoOutra, abas, externo, avisoExterno, declaracoes, declaracoesAnuais, declaracoesDoOrgao, dataBR, dataHoraBR, paraDataHoraLocal, urlValida, renderTexto, editorTexto,
    paginar, contar, erroGravacao, amigavel, gravarRegistro, validarPdf, atualizarAvisos
  };
})();
