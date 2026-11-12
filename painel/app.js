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
    noticias: 1, institucional: 1, servicos: 1, publicacoes: 1, aparencia: 1, usuarios: 1, historico: 1,
    licitacoes: 2, financeiro: 2, pessoal: 2, convenios: 2, obras: 2, setoriais: 2, importacoes: 2,
    atendimento: 3
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
    for (const f of filhos.flat()) {
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
    if (texto) i.focus();
    return !texto;
  }

  function ocupado(btn, texto) {
    if (texto) { btn.dataset.textoOriginal = btn.textContent; btn.textContent = texto; btn.disabled = true; }
    else { btn.textContent = btn.dataset.textoOriginal || btn.textContent; btn.disabled = false; }
  }

  // Traduz as mensagens da Supabase para algo que o usuário entenda.
  function traduzirErro(e) {
    const t = (e && (e.message || e.error_description || String(e))) || '';
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
    const convite = tipo === 'invite';
    $('nova-titulo').textContent = convite ? 'Bem-vindo(a)! Crie sua senha' : 'Criar nova senha';
    $('nova-sub').textContent = convite
      ? 'Seu acesso ao painel foi liberado. Escolha uma senha com pelo menos 8 caracteres, misturando letras e números.'
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
    const { error } = await sb.auth.updateUser({ password: s1 });
    ocupado(btn);
    if (error) { msg('nova-msg', traduzirErro(error)); return; }
    $('nova-senha').value = '';
    $('nova-senha2').value = '';
    history.replaceState(null, '', location.pathname);
    toast(modoSenha === 'invite' ? 'Senha criada. Seja bem-vindo(a)!' : 'Senha alterada com sucesso.');
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
          const { error } = await sb.auth.updateUser({ password: s1.value });
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
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { mostrarForm('form-login'); return; }

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
    const { data, error } = await sb.rpc('minhas_permissoes', { p_orgao: o.id });
    if (error) { toast(traduzirErro(error), true); mostrarListaOrgaos(); return; }
    estado.orgao = o;
    estado.permissoes = {};
    for (const p of data || []) {
      estado.permissoes[p.modulo] = { ver: p.pode_ver, editar: p.pode_editar, publicar: p.pode_publicar, excluir: p.pode_excluir };
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
    const menu = $('menu');
    menu.replaceChildren(el('a', { href: '#/inicio', 'data-rota': 'inicio' }, 'Início'));
    let grupoAtual = null;
    for (const m of estado.modulos) {
      if (!(estado.permissoes[m.codigo] && estado.permissoes[m.codigo].ver)) continue;
      if (m.grupo !== grupoAtual) {
        grupoAtual = m.grupo;
        menu.append(el('span', { class: 'menu-grupo' }, m.grupo));
      }
      menu.append(el('a', { href: '#/m/' + m.codigo, 'data-rota': m.codigo }, m.nome));
    }
    mostrarTela('tela-painel');
    rotear();
  }

  $('btn-trocar-orgao').addEventListener('click', () => { estado.orgao = null; mostrarListaOrgaos(); });
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
    const m = hash.match(/^#\/m\/([a-z_]+)$/);
    const rota = m ? m[1] : 'inicio';
    for (const a of $('menu').querySelectorAll('a')) {
      if (a.dataset.rota === rota) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    }
    const conteudo = $('conteudo');
    if (rota === 'inicio') telaInicio(conteudo);
    else telaModulo(conteudo, rota);
    conteudo.focus({ preventScroll: true });
  }
  window.addEventListener('hashchange', rotear);

  function telaInicio(c) {
    const o = estado.orgao;
    const nome = (estado.usuario.nome || '').split(' ')[0];
    c.replaceChildren(
      el('h1', null, nome ? 'Olá, ' + nome : 'Início'),
      el('p', { class: 'sub' }, 'Painel de gestão · ' + o.nome),
      el('div', { class: 'grade' },
        el('section', { class: 'cartao' },
          el('h2', null, 'Órgão'),
          el('dl', { class: 'dados' },
            el('dt', null, 'Nome'), el('dd', null, o.nome),
            el('dt', null, 'Tipo'), el('dd', null, TIPO_ORGAO[o.tipo] || o.tipo),
            el('dt', null, 'Situação'), el('dd', null, o.ativo ? 'Ativo' : 'Inativo'),
            el('dt', null, 'Seu perfil'), el('dd', null, o.perfil)
          )
        ),
        el('section', { class: 'cartao' },
          el('h2', null, 'Fase 0 · Fundação'),
          el('ul', { class: 'lista-check' },
            el('li', null, 'Login e recuperação de senha'),
            el('li', null, 'Separação de dados entre órgãos'),
            el('li', null, 'Menu conforme as permissões do perfil'),
            el('li', null, 'Histórico automático de alterações'),
            el('li', null, 'Controle de versões do painel')
          )
        ),
        el('section', { class: 'cartao' },
          el('h2', null, 'Fase 1 · Conteúdo do site'),
          el('ul', { class: 'lista-check' },
            el('li', null, 'Aparência e contatos do órgão'),
            el('li', null, 'Unidades e gestores'),
            el('li', null, 'Usuários, perfis e convites'),
            el('li', null, 'Histórico de alterações')
          ),
          el('ul', { class: 'lista-check lista-proximos', style: 'margin-top:8px' },
            el('li', null, 'Menu e links do site'),
            el('li', null, 'Páginas institucionais'),
            el('li', null, 'Notícias, banners e avisos'),
            el('li', null, 'Carta de Serviços')
          )
        )
      )
    );
  }

  function telaModulo(c, codigo) {
    const mod = estado.modulos.find((m) => m.codigo === codigo);
    const p = estado.permissoes[codigo];
    if (!mod || !p || !p.ver) {
      c.replaceChildren(el('h1', null, 'Acesso não permitido'),
        el('p', { class: 'sub' }, 'Seu perfil não tem acesso a este módulo.'));
      return;
    }
    if (telas[codigo]) { telas[codigo](c, mod, p); return; }
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

  // Registro das telas de cada módulo (preenchido pelos arquivos modulo-*.js).
  window.PNTP = {
    sb, estado, el, $, toast, msg, ocupado, erroCampo, traduzirErro, emailValido,
    abrirDialogo, confirmar, aviso, reduzirImagem, enviarArquivo, apagarArquivo,
    normalizar, ordemAlfabetica, telas, iniciar, rotear
  };
})();
