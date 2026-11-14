// =====================================================================
// Módulo "Usuários e permissões" — página única para todos os órgãos (0.21.0)
// Abas: Pessoas (uma linha por pessoa, com os acessos de cada órgão) e Perfis
// (do órgão escolhido). Quem vê: Suporte SOFT+ (todos) e quem tem "Usuários"
// no perfil (por padrão, o Administrador do órgão) — só as pessoas e os
// acessos dos órgãos que gerencia (script 28: orgaos_que_gerencio,
// usuarios_unificados). Cadastro sem convite: o administrador cria o login
// com senha inicial e a pessoa entra direto, trocando a senha no 1º acesso.
//
// Toda regra de segurança está no banco (scripts 05 e 28) e na função
// convidar-usuario. Esta tela só esconde o que a pessoa não pode fazer.
// =====================================================================
(function () {
  'use strict';
  const P = window.PNTP;
  const { sb, el, toast, ocupado, erroCampo, traduzirErro, emailValido, normalizar, ordemAlfabetica } = P;

  const ACOES = [
    ['pode_ver', 'Ver'], ['pode_editar', 'Cadastrar e editar'],
    ['pode_publicar', 'Publicar'], ['pode_excluir', 'Excluir']
  ];

  let aba = 'pessoas';
  let conteiner = null;
  let orgPerfis = null;          // órgão escolhido na aba Perfis
  const filtros = { busca: '', orgao: '', perfil: '', situacao: '' };
  let d = { orgaos: [], vinculos: [], pessoas: [], perfis: [], permissoes: [], unidades: [], euId: null };

  async function carregar() {
    const { data: { user } } = await sb.auth.getUser();
    const [og, vi] = await Promise.all([sb.rpc('orgaos_que_gerencio'), sb.rpc('usuarios_unificados')]);
    for (const r of [og, vi]) if (r.error) throw r.error;
    const ids = og.data.map((o) => o.id);
    const [pf, un] = await Promise.all([
      sb.from('perfis').select('id, nome, descricao, orgao_id, e_administrador').or('orgao_id.is.null' + (ids.length ? ',orgao_id.in.(' + ids.join(',') + ')' : '')),
      ids.length ? sb.from('unidades').select('id, nome, orgao_id').in('orgao_id', ids).order('nome').limit(2000) : { data: [] }
    ]);
    for (const r of [pf, un]) if (r.error) throw r.error;
    const pp = await sb.from('perfil_permissoes').select('*').in('perfil_id', pf.data.map((p) => p.id));
    if (pp.error) throw pp.error;
    // Agrupa os acessos por pessoa.
    const mapa = new Map();
    for (const v of vi.data) {
      if (!mapa.has(v.usuario_id)) mapa.set(v.usuario_id, { usuario_id: v.usuario_id, nome: v.nome, email: v.email, pendente: v.pendente, ultimo_acesso: v.ultimo_acesso, acessos: [] });
      mapa.get(v.usuario_id).acessos.push(v);
    }
    d = { orgaos: og.data, vinculos: vi.data, pessoas: [...mapa.values()], perfis: pf.data.sort((a, b) => ordemAlfabetica(a.nome, b.nome)),
      permissoes: pp.data, unidades: un.data, euId: user.id };
    if (!orgPerfis || !d.orgaos.some((o) => o.id === orgPerfis)) {
      orgPerfis = (d.orgaos.find((o) => o.id === P.estado.orgao.id) || d.orgaos[0] || {}).id || null;
    }
  }

  const orgao = (id) => d.orgaos.find((o) => o.id === id) || {};
  const adminDe = (id) => !!orgao(id).e_admin;
  const perfisDoOrgao = (id) => d.perfis.filter((p) => !p.orgao_id || p.orgao_id === id);
  const perfilPorId = (id) => d.perfis.find((p) => p.id === id) || {};
  const unidadesDo = (id) => d.unidades.filter((u) => u.orgao_id === id);
  const nomeOrgao = (o) => o.sigla ? o.nome + ' (' + o.sigla + ')' : o.nome;
  const amigavel = (texto) => Object.assign(new Error(texto), { amigavel: true });
  function mostrarErro(e) {
    const t = (e && e.message) || '';
    if (e && e.amigavel) return toast(t, true);
    if (/administrador ativo|não pode alterar o seu próprio|só pode dar|Só um administrador|iguais ou menores/i.test(t)) return toast(t, true);
    toast(traduzirErro(e), true);
  }
  const dataHora = (iso) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;

  // Situação de um acesso: desativado, "nunca entrou" ou ativo.
  function situacao(v) {
    if (!v.ativo) return 'desativado';
    if (v.pendente) return 'pendente';
    return 'ativo';
  }
  const ROTULO_SITUACAO = { ativo: 'Ativo', pendente: 'Ainda não entrou', desativado: 'Desativado' };
  const situacaoPessoa = (p) => p.acessos.some((v) => situacao(v) === 'ativo') ? 'ativo' : p.acessos.some((v) => v.ativo) ? 'pendente' : 'desativado';

  // A tela pode mexer neste acesso? (o banco confere de novo)
  function podeMexer(v) {
    const o = orgao(v.orgao_id);
    if (!o.pode_editar || v.usuario_id === d.euId) return false;
    if (v.e_administrador && !o.e_admin) return false;
    if (o.minha_unidade && v.unidade_id !== o.minha_unidade) return false;
    return true;
  }
  const orgaosEditaveis = () => d.orgaos.filter((o) => o.pode_editar);

  // ---------- campos ----------
  function campo(id, rotulo, input, ajuda, obrigatorio) {
    input.id = id;
    return el('div', { class: 'campo' },
      el('label', { for: id }, rotulo, obrigatorio ? el('span', { class: 'obrigatorio', 'aria-hidden': 'true' }, ' *') : null),
      input,
      ajuda ? el('span', { class: 'ajuda', id: id + '-ajuda' }, ajuda) : null,
      el('span', { class: 'erro-campo', id: id + '-erro' })
    );
  }

  function seletorPerfil(orgId, atual) {
    const s = el('select', null, el('option', { value: '' }, '— Escolha o perfil —'));
    const grupo = (rotulo, lista) => {
      if (!lista.length) return;
      s.append(el('optgroup', { label: rotulo }, lista.map((p) => el('option', { value: p.id, selected: p.id === atual }, p.nome))));
    };
    // Só administrador entrega o perfil de administrador.
    const disponiveis = perfisDoOrgao(orgId).filter((p) => !p.e_administrador || adminDe(orgId) || p.id === atual);
    grupo('Perfis do órgão', disponiveis.filter((p) => p.orgao_id));
    grupo('Perfis padrão', disponiveis.filter((p) => !p.orgao_id));
    return s;
  }

  // Perfis adicionais (0.22.0): as permissões somam. O de administrador só como principal.
  function seletorExtras(orgId, atuais, principal) {
    const caixas = perfisDoOrgao(orgId).filter((p) => !p.e_administrador).map((p) => ({ p,
      cb: el('input', { type: 'checkbox', value: p.id, checked: (atuais || []).includes(p.id) }) }));
    const resumo = el('span', { class: 'ajuda' });
    const ajustar = () => {
      const pr = principal ? principal.value : '';
      for (const c of caixas) { c.cb.disabled = c.p.id === pr; if (c.p.id === pr) c.cb.checked = false; }
      const n = caixas.filter((c) => c.cb.checked).length;
      resumo.textContent = n ? n + ' adicional(is): ' + caixas.filter((c) => c.cb.checked).map((c) => c.p.nome).join(', ') : 'Nenhum';
    };
    caixas.forEach((c) => c.cb.addEventListener('change', ajustar));
    if (principal) principal.addEventListener('change', ajustar);
    ajustar();
    const bloco = el('details', { class: 'perfis-extras', open: (atuais || []).length > 0 },
      el('summary', null, 'Perfis adicionais (opcional) · ', resumo),
      el('p', { class: 'ajuda' }, 'A pessoa soma as permissões do perfil principal e destes.'),
      el('div', { class: 'lista-extras' }, caixas.map((c) => el('label', { class: 'checkbox' }, c.cb, ' ' + c.p.nome))));
    return { bloco, ler: () => caixas.filter((c) => c.cb.checked && !c.cb.disabled).map((c) => c.p.id) };
  }
  const rotuloPerfis = (v) => v.perfil + ((v.perfis_extras_nomes || []).length ? ' + ' + v.perfis_extras_nomes.join(' + ') : '');

  function seletorAlcance(orgId, atual) {
    const minha = orgao(orgId).minha_unidade;
    if (minha) {
      const u = d.unidades.find((x) => x.id === minha);
      return el('select', { disabled: true }, el('option', { value: minha }, (u ? u.nome : 'Sua unidade') + ' (seu alcance)'));
    }
    return el('select', null, el('option', { value: '' }, 'Todo o órgão'),
      unidadesDo(orgId).map((u) => el('option', { value: u.id, selected: u.id === atual }, 'Só: ' + u.nome)));
  }

  // ---------- função de servidor ----------
  async function chamarFuncao(corpo) {
    const { data, error } = await sb.functions.invoke('convidar-usuario', {
      body: Object.assign({ orgao_id: P.estado.orgao.id, redirecionar: location.origin + location.pathname }, corpo)
    });
    if (error) {
      const status = error.context && error.context.status;
      if (status === 404 || /Failed to send a request|not found/i.test(error.message)) {
        throw amigavel('A função "convidar-usuario" não está instalada (ou está desatualizada) na Supabase. Siga o passo "Função de convite" do README.');
      }
      if (status === 401) throw amigavel('Sua sessão expirou. Saia e entre novamente.');
      throw error;
    }
    if (!data || !data.ok) throw amigavel((data && data.erro) || 'Não foi possível concluir.');
    return data;
  }

  // Senha inicial sugerida: 10 caracteres sem letras parecidas (l/1, O/0).
  function gerarSenha() {
    const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ', numeros = '23456789';
    const r = (s) => s[crypto.getRandomValues(new Uint32Array(1))[0] % s.length];
    let x = '';
    for (let i = 0; i < 7; i++) x += r(letras);
    for (let i = 0; i < 3; i++) x += r(numeros);
    return x;
  }
  const senhaForte = (v) => v.length >= 8 && /[a-z]/i.test(v) && /\d/.test(v);

  function campoSenha(id) {
    const senha = el('input', { type: 'text', maxlength: 72, autocomplete: 'off', value: gerarSenha(), spellcheck: false, class: 'senha-inicial' });
    const btn = el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => { senha.value = gerarSenha(); } }, 'Gerar outra');
    senha.id = id;
    return { senha, bloco: el('div', { class: 'campo' },
      el('label', { for: id }, 'Senha inicial', el('span', { class: 'obrigatorio', 'aria-hidden': 'true' }, ' *')),
      el('div', { class: 'linha-botoes' }, senha, btn),
      el('span', { class: 'ajuda' }, 'Pelo menos 8 caracteres, com letras e números. Já vem uma sugerida.'),
      el('span', { class: 'erro-campo', id: id + '-erro' })) };
  }

  // Mensagem pronta para mandar à pessoa (WhatsApp ou e-mail próprio).
  function mostrarAcesso(nome, email, senha, trocar, orgaos) {
    const endereco = location.origin + location.pathname;
    const texto = 'Olá, ' + (nome || '').split(' ')[0] + '! Seu acesso ao painel do site' + (orgaos.length === 1 ? ' da ' + orgaos[0] : '') + ' está pronto.\n' +
      'Endereço: ' + endereco + '\nE-mail: ' + email + '\nSenha inicial: ' + senha +
      (trocar ? '\nNo primeiro acesso, o painel pede para você criar a sua própria senha.' : '');
    const caixa = el('textarea', { rows: 6, readonly: true, class: 'link-convite', 'aria-label': 'Mensagem com os dados de acesso' });
    caixa.value = texto;
    const btnCopiar = el('button', { type: 'button', class: 'btn btn-claro' }, 'Copiar mensagem');
    btnCopiar.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(texto); toast('Mensagem copiada.'); }
      catch (e) { caixa.select(); document.execCommand('copy'); toast('Mensagem copiada.'); }
    });
    const dlg = P.abrirDialogo('Acesso pronto', el('div', null,
      el('p', null, el('strong', null, nome), ' já pode entrar no painel' + (orgaos.length > 1 ? ' (' + orgaos.join('; ') + ')' : '') + '. Envie os dados abaixo só para ela.'),
      caixa,
      el('p', { class: 'ajuda' }, trocar ? 'Na primeira entrada a pessoa troca a senha: depois disso, nem você sabe a senha dela.'
        : 'Você marcou para não pedir troca de senha. Oriente a pessoa a trocar em "Minha conta" (clicando no nome, no alto).')
    ), [
      btnCopiar,
      el('a', { class: 'btn btn-claro', href: 'https://wa.me/?text=' + encodeURIComponent(texto), target: '_blank', rel: 'noopener' }, 'Enviar pelo WhatsApp'),
      el('button', { type: 'button', class: 'btn btn-primario', onclick: () => dlg.close() }, 'Concluir')
    ]);
  }

  // ================= PESSOAS =================
  // Linhas de órgão para marcar no cadastro (ou para acrescentar acesso a quem já existe).
  function linhasDeOrgaos(lista) {
    return lista.map((o) => {
      const marca = el('input', { type: 'checkbox', checked: lista.length === 1, 'aria-label': 'Dar acesso a ' + o.nome });
      const perfil = seletorPerfil(o.id, null);
      const alcance = seletorAlcance(o.id, null);
      const extras = seletorExtras(o.id, [], perfil);
      perfil.setAttribute('aria-label', 'Perfil em ' + o.nome); alcance.setAttribute('aria-label', 'Alcance em ' + o.nome);
      const erro = el('span', { class: 'erro-campo' });
      const ajustar = () => { perfil.disabled = !marca.checked; extras.bloco.hidden = !marca.checked; if (!orgao(o.id).minha_unidade) alcance.disabled = !marca.checked; };
      marca.addEventListener('change', ajustar); ajustar();
      return { o, marca, perfil, alcance, erro, extras,
        linha: el('div', { class: 'acesso-orgao' }, el('label', { class: 'checkbox' }, marca, ' ', el('strong', null, nomeOrgao(o))),
          el('div', { class: 'grade-campos' }, perfil, alcance), extras.bloco, erro) };
    });
  }
  function lerLinhas(linhas) {
    const escolhidas = linhas.filter((l) => l.marca.checked);
    let ok = true;
    for (const l of linhas) {
      l.erro.textContent = l.marca.checked && !l.perfil.value ? 'Escolha o perfil neste órgão.' : '';
      if (l.erro.textContent) ok = false;
    }
    return ok ? escolhidas.map((l) => ({ orgao_id: l.o.id, perfil_id: l.perfil.value, unidade_id: l.alcance.value || null, perfis_extras: l.extras.ler(), nome: l.o.nome })) : null;
  }

  function formCadastro() {
    const f = {
      nome: el('input', { type: 'text', maxlength: 120, autocomplete: 'off' }),
      email: el('input', { type: 'email', maxlength: 160, autocomplete: 'off' })
    };
    const s = campoSenha('cd-senha');
    const trocar = el('input', { type: 'checkbox', checked: true });
    const linhas = linhasDeOrgaos(orgaosEditaveis());
    const corpo = el('form', { class: 'form-dialogo', novalidate: true },
      campo('cd-nome', 'Nome completo', f.nome, null, true),
      campo('cd-email', 'E-mail', f.email, 'É o e-mail que a pessoa usa para entrar. Se ela já tiver cadastro em outro órgão, só recebe os novos acessos (a senha dela não muda).', true),
      s.bloco,
      el('label', { class: 'checkbox mb-2' }, trocar, ' Pedir nova senha no primeiro acesso (recomendado)'),
      el('fieldset', { class: 'opcoes' }, el('legend', null, linhas.length > 1 ? 'Órgãos, perfil e alcance' : 'Perfil e alcance'),
        linhas.map((l) => l.linha),
        el('span', { class: 'erro-campo', id: 'cd-orgaos-erro' })));
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Cadastrar');
    const dlg = P.abrirDialogo('Cadastrar pessoa', corpo, [
      el('button', { type: 'button', class: 'btn btn-claro', onclick: () => dlg.close() }, 'Cancelar'), btn]);
    corpo.addEventListener('submit', (ev) => { ev.preventDefault(); btn.click(); });
    btn.addEventListener('click', async () => {
      const nome = f.nome.value.trim().replace(/\s+/g, ' ');
      const email = f.email.value.trim().toLowerCase();
      if (!erroCampo('cd-nome', nome.split(' ').length >= 2 ? '' : 'Informe nome e sobrenome.')) return;
      if (!erroCampo('cd-email', emailValido(email) ? '' : 'Informe um e-mail válido.')) return;
      const existente = d.pessoas.find((p) => (p.email || '').toLowerCase() === email);
      if (!erroCampo('cd-senha', existente || senhaForte(s.senha.value) ? '' : 'Use pelo menos 8 caracteres, com letras e números.')) return;
      const vinc = lerLinhas(linhas);
      if (!vinc) return;
      document.getElementById('cd-orgaos-erro').textContent = vinc.length ? '' : 'Marque pelo menos um órgão.';
      if (!vinc.length) return;
      if (existente) {
        const repetidos = vinc.filter((v) => existente.acessos.some((a) => a.orgao_id === v.orgao_id));
        if (repetidos.length) {
          erroCampo('cd-email', (existente.nome || email) + ' já tem acesso a ' + repetidos.map((v) => v.nome).join(', ') +
            '. Para mudar o perfil, feche esta janela e use "Abrir" na linha da pessoa.');
          return;
        }
      }
      ocupado(btn, 'Cadastrando…');
      try {
        const r = await chamarFuncao({ acao: 'cadastrar', nome, email, senha: s.senha.value, trocar_senha: trocar.checked,
          vinculos: vinc.map(({ orgao_id, perfil_id, unidade_id, perfis_extras }) => ({ orgao_id, perfil_id, unidade_id, perfis_extras })) });
        dlg.close();
        await recarregar();
        if (r.situacao === 'cadastrado') mostrarAcesso(nome, email, s.senha.value, trocar.checked, vinc.map((v) => v.nome));
        else P.aviso('Acesso acrescentado', email + ' já tinha cadastro no painel: recebeu o acesso agora e entra com a senha de sempre. Se não lembrar, use "Definir nova senha" ou "Esqueci minha senha".');
      } catch (e) { mostrarErro(e); }
      finally { ocupado(btn); }
    });
    f.nome.focus();
  }

  // Grava e confere se mudou de fato (0 linhas = fora do alcance), com o motivo exato vindo do banco.
  async function atualizarVinculo(v, mudanca) {
    const novo = Object.assign({ perfil_id: v.perfil_id, unidade_id: v.unidade_id }, mudanca);
    const { data: motivo } = await sb.rpc('motivo_bloqueio_acesso', {
      p_orgao: v.orgao_id, p_perfil: novo.perfil_id, p_unidade: novo.unidade_id, p_usuario: v.usuario_id
    });
    if (motivo) throw amigavel(motivo);
    if (mudanca.perfis_extras) {
      const { data: m2 } = await sb.rpc('motivo_bloqueio_extras', { p_orgao: v.orgao_id, p_principal: novo.perfil_id, p_extras: mudanca.perfis_extras });
      if (m2) throw amigavel(m2);
    }
    const { data, error } = await sb.from('usuarios_orgaos').update(mudanca).eq('id', v.vinculo_id).select('id');
    if (error) throw error;
    if (!data || !data.length) throw amigavel('Nada foi alterado: este acesso está fora do alcance do seu perfil.');
  }

  function formAcesso(v, depois) {
    const f = { perfil: seletorPerfil(v.orgao_id, v.perfil_id), alcance: seletorAlcance(v.orgao_id, v.unidade_id) };
    const extras = seletorExtras(v.orgao_id, v.perfis_extras || [], f.perfil);
    const corpo = el('form', { class: 'form-dialogo', novalidate: true },
      el('p', null, el('strong', null, v.nome || v.email), el('span', { class: 'sub-linha' }, v.orgao)),
      campo('ac-perfil', 'Perfil', f.perfil, perfilPorId(v.perfil_id).descricao || ' ', true),
      campo('ac-alcance', 'Alcance', f.alcance, 'Com uma unidade escolhida, a pessoa só mexe nos dados dela.'), extras.bloco);
    f.perfil.addEventListener('change', () => { document.getElementById('ac-perfil-ajuda').textContent = perfilPorId(f.perfil.value).descricao || ''; });
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar');
    const dlg = P.abrirDialogo('Alterar acesso', corpo, [
      el('button', { type: 'button', class: 'btn btn-claro', onclick: () => dlg.close() }, 'Cancelar'), btn]);
    btn.addEventListener('click', async () => {
      if (!erroCampo('ac-perfil', f.perfil.value ? '' : 'Escolha o perfil.')) return;
      ocupado(btn, 'Salvando…');
      try {
        await atualizarVinculo(v, { perfil_id: f.perfil.value, unidade_id: f.alcance.value || null, perfis_extras: extras.ler() });
        dlg.close(); toast('Acesso alterado.'); await recarregar(); depois();
      } catch (e) { mostrarErro(e); }
      finally { ocupado(btn); }
    });
  }

  async function alternarAtivo(v, depois) {
    const desativar = v.ativo;
    const ok = await P.confirmar(desativar ? 'Desativar acesso' : 'Reativar acesso',
      desativar ? (v.nome || v.email) + ' não vai mais conseguir abrir "' + v.orgao + '" no painel. O histórico do que a pessoa fez continua guardado. Dá para reativar depois.'
        : (v.nome || v.email) + ' volta a ter acesso a "' + v.orgao + '" com o perfil "' + v.perfil + '".',
      desativar ? 'Desativar' : 'Reativar', desativar);
    if (!ok) return;
    try { await atualizarVinculo(v, { ativo: !desativar }); toast(desativar ? 'Acesso desativado.' : 'Acesso reativado.'); await recarregar(); depois(); }
    catch (e) { mostrarErro(e); }
  }

  // Excluir só quem nunca entrou (cadastro errado); quem já entrou é desativado.
  async function remover(v, depois) {
    if (!v.pendente) {
      P.aviso('Prefira desativar', (v.nome || v.email) + ' já entrou no painel e tem alterações no histórico. Para tirar o acesso, use "Desativar".');
      return;
    }
    if (!await P.confirmar('Remover acesso', 'Remover o acesso de ' + (v.nome || v.email) + ' a "' + v.orgao + '"? A pessoa ainda não tinha entrado.', 'Remover', true)) return;
    const { data, error } = await sb.from('usuarios_orgaos').delete().eq('id', v.vinculo_id).select('id');
    if (error) return mostrarErro(error);
    if (!data || !data.length) return toast('Seu perfil não pode remover este acesso.', true);
    toast('Acesso removido.'); await recarregar(); depois();
  }

  function formSenha(p) {
    const s = campoSenha('ns-senha');
    const trocar = el('input', { type: 'checkbox', checked: true });
    const corpo = el('form', { class: 'form-dialogo', novalidate: true },
      el('p', null, 'Nova senha inicial para ', el('strong', null, p.nome || p.email), '. A senha atual deixa de funcionar.'),
      s.bloco, el('label', { class: 'checkbox' }, trocar, ' Pedir nova senha no próximo acesso (recomendado)'));
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Definir senha');
    const dlg = P.abrirDialogo('Definir nova senha', corpo, [
      el('button', { type: 'button', class: 'btn btn-claro', onclick: () => dlg.close() }, 'Cancelar'), btn]);
    btn.addEventListener('click', async () => {
      if (!erroCampo('ns-senha', senhaForte(s.senha.value) ? '' : 'Use pelo menos 8 caracteres, com letras e números.')) return;
      ocupado(btn, 'Salvando…');
      try {
        await chamarFuncao({ acao: 'definir_senha', usuario_id: p.usuario_id, senha: s.senha.value, trocar_senha: trocar.checked });
        dlg.close();
        mostrarAcesso(p.nome, p.email, s.senha.value, trocar.checked, p.acessos.map((v) => v.orgao));
      } catch (e) { mostrarErro(e); }
      finally { ocupado(btn); }
    });
  }

  // Dar acesso a mais órgãos para quem já está na lista.
  function formMaisOrgaos(p, depois) {
    const livres = orgaosEditaveis().filter((o) => !p.acessos.some((v) => v.orgao_id === o.id));
    const linhas = linhasDeOrgaos(livres);
    const corpo = el('form', { class: 'form-dialogo', novalidate: true },
      el('p', null, 'Acesso de ', el('strong', null, p.nome || p.email), ' a mais órgãos. Ela entra com a mesma senha.'),
      linhas.map((l) => l.linha), el('span', { class: 'erro-campo', id: 'mo-erro' }));
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Dar acesso');
    const dlg = P.abrirDialogo('Dar acesso a outro órgão', corpo, [
      el('button', { type: 'button', class: 'btn btn-claro', onclick: () => dlg.close() }, 'Cancelar'), btn]);
    btn.addEventListener('click', async () => {
      const vinc = lerLinhas(linhas);
      if (!vinc) return;
      document.getElementById('mo-erro').textContent = vinc.length ? '' : 'Marque pelo menos um órgão.';
      if (!vinc.length) return;
      ocupado(btn, 'Salvando…');
      try {
        for (const v of vinc) {
          const { data: motivo } = await sb.rpc('motivo_bloqueio_acesso', { p_orgao: v.orgao_id, p_perfil: v.perfil_id, p_unidade: v.unidade_id, p_usuario: p.usuario_id });
          if (motivo) throw amigavel(v.nome + ': ' + motivo);
          const { data: m2 } = await sb.rpc('motivo_bloqueio_extras', { p_orgao: v.orgao_id, p_principal: v.perfil_id, p_extras: v.perfis_extras });
          if (m2) throw amigavel(v.nome + ': ' + m2);
          const { error } = await sb.from('usuarios_orgaos').insert({ usuario_id: p.usuario_id, orgao_id: v.orgao_id, perfil_id: v.perfil_id, unidade_id: v.unidade_id, perfis_extras: v.perfis_extras });
          if (error) throw error;
        }
        dlg.close(); toast('Acesso liberado. A pessoa vê o novo órgão na próxima vez que entrar.'); await recarregar(); depois();
      } catch (e) { mostrarErro(e); }
      finally { ocupado(btn); }
    });
  }

  // Ficha da pessoa: os acessos que eu posso ver, com as ações de cada um.
  function fichaPessoa(usuarioId) {
    let dlg = null;
    const desenharFicha = () => {
      const p = d.pessoas.find((x) => x.usuario_id === usuarioId);
      if (!p) { if (dlg) dlg.close(); return; }
      const eu = p.usuario_id === d.euId;
      const livres = orgaosEditaveis().filter((o) => !p.acessos.some((v) => v.orgao_id === o.id));
      const gerenciaAlgum = p.acessos.some((v) => podeMexer(v));
      const corpo = el('div', null,
        el('p', null, el('strong', null, p.nome || '(sem nome)'), eu ? el('span', { class: 'ml-1 etiqueta' }, 'você') : null,
          el('span', { class: 'sub-linha' }, p.email + ' · ' + (dataHora(p.ultimo_acesso) ? 'último acesso em ' + dataHora(p.ultimo_acesso) : 'ainda não entrou'))),
        el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela' },
          el('thead', null, el('tr', null, ['Órgão', 'Perfil', 'Alcance', 'Situação'].map((t) => el('th', { scope: 'col' }, t)), el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Ações')))),
          el('tbody', null, p.acessos.map((v) => {
            const mexe = podeMexer(v), s = situacao(v);
            const re = () => desenharFicha();
            return el('tr', null, el('td', null, v.orgao), el('td', null, rotuloPerfis(v)), el('td', null, v.unidade || 'Todo o órgão'),
              el('td', null, el('span', { class: 'etiqueta etiqueta-' + s }, ROTULO_SITUACAO[s])),
              el('td', { class: 'acoes' },
                mexe ? el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => formAcesso(v, re) }, 'Alterar') : null,
                mexe && !v.pendente ? el('button', { type: 'button', class: 'btn btn-claro btn-p' + (v.ativo ? ' btn-texto-perigo' : ''), onclick: () => alternarAtivo(v, re) }, v.ativo ? 'Desativar' : 'Reativar') : null,
                mexe && v.pendente && orgao(v.orgao_id).pode_excluir ? el('button', { type: 'button', class: 'btn btn-claro btn-p btn-texto-perigo', onclick: () => remover(v, re) }, 'Remover') : null,
                mexe && v.pendente && !orgao(v.orgao_id).pode_excluir ? el('button', { type: 'button', class: 'btn btn-claro btn-p btn-texto-perigo', onclick: () => alternarAtivo(v, re) }, v.ativo ? 'Desativar' : 'Reativar') : null));
          })))),
        el('p', { class: 'ajuda' }, 'Aqui aparecem só os acessos aos órgãos que você gerencia.'));
      const acoes = [
        !eu && livres.length ? el('button', { type: 'button', class: 'btn btn-claro', onclick: () => formMaisOrgaos(p, desenharFicha) }, '+ Dar acesso a outro órgão') : null,
        !eu && gerenciaAlgum ? el('button', { type: 'button', class: 'btn btn-claro', onclick: () => formSenha(p) }, 'Definir nova senha') : null,
        el('button', { type: 'button', class: 'btn btn-primario', onclick: () => dlg.close() }, 'Fechar')].filter(Boolean);
      if (dlg) dlg.close();
      dlg = P.abrirDialogo('Acessos de ' + (p.nome || p.email), corpo, acoes);
      dlg.classList.add('dialogo-largo');
    };
    desenharFicha();
  }

  // Um filtro para cada coluna da listagem (regra do projeto).
  function barraFiltrosPessoas(redesenhar) {
    const busca = el('input', { type: 'search', placeholder: 'Nome ou e-mail', value: filtros.busca, 'aria-label': 'Buscar por nome ou e-mail' });
    const org = el('select', { 'aria-label': 'Filtrar por órgão' }, el('option', { value: '' }, 'Todos os órgãos'),
      d.orgaos.map((o) => el('option', { value: o.id, selected: filtros.orgao === o.id }, o.nome)));
    const nomesPerfis = [...new Set(d.vinculos.flatMap((v) => [v.perfil].concat(v.perfis_extras_nomes || [])))].sort(ordemAlfabetica);
    const perfil = el('select', { 'aria-label': 'Filtrar por perfil' }, el('option', { value: '' }, 'Todos os perfis'),
      nomesPerfis.map((x) => el('option', { value: x, selected: filtros.perfil === x }, x)));
    const sit = el('select', { 'aria-label': 'Filtrar por situação' }, el('option', { value: '' }, 'Qualquer situação'),
      Object.entries(ROTULO_SITUACAO).map(([k, v]) => el('option', { value: k, selected: filtros.situacao === k }, v)));
    busca.addEventListener('input', () => { filtros.busca = busca.value; redesenhar(); });
    org.addEventListener('change', () => { filtros.orgao = org.value; redesenhar(); });
    perfil.addEventListener('change', () => { filtros.perfil = perfil.value; redesenhar(); });
    sit.addEventListener('change', () => { filtros.situacao = sit.value; redesenhar(); });
    return el('div', { class: 'filtros' }, busca, d.orgaos.length > 1 ? org : null, perfil, sit);
  }

  function tabelaPessoas() {
    const fb = normalizar(filtros.busca);
    const lista = d.pessoas.filter((p) =>
      (!fb || normalizar(p.nome + ' ' + p.email).includes(fb)) &&
      p.acessos.some((v) => (!filtros.orgao || v.orgao_id === filtros.orgao) && (!filtros.perfil || v.perfil === filtros.perfil || (v.perfis_extras_nomes || []).includes(filtros.perfil)) &&
        (!filtros.situacao || situacao(v) === filtros.situacao)));
    if (!lista.length) return el('p', { class: 'vazio' }, d.pessoas.length ? 'Ninguém encontrado com esses filtros.' : 'Nenhuma pessoa cadastrada ainda.');
    const varios = d.orgaos.length > 1;
    return el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela' },
      el('thead', null, el('tr', null, ['Pessoa', varios ? 'Órgãos e perfis' : 'Perfil e alcance', 'Último acesso'].map((t) => el('th', { scope: 'col' }, t)),
        el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Ações')))),
      el('tbody', null, lista.map((p) => el('tr', null,
        el('td', null, el('strong', null, p.nome || '(sem nome)'), p.usuario_id === d.euId ? el('span', { class: 'ml-1 etiqueta' }, 'você') : null,
          el('span', { class: 'sub-linha' }, p.email)),
        el('td', null, el('ul', { class: 'lista-acessos' }, p.acessos.map((v) => {
          const s = situacao(v);
          return el('li', null, varios ? el('strong', null, v.orgao + ': ') : null, rotuloPerfis(v), v.unidade ? ' · só ' + v.unidade : '',
            s !== 'ativo' ? el('span', { class: 'ml-1 etiqueta etiqueta-' + s }, ROTULO_SITUACAO[s]) : null);
        }))),
        el('td', null, dataHora(p.ultimo_acesso) || el('span', { class: 'falta-leve' }, 'Nunca entrou')),
        el('td', { class: 'acoes' }, el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => fichaPessoa(p.usuario_id) }, 'Abrir')))))));
  }

// ================= PERFIS =================
  const permissoesDe = (perfilId) => d.permissoes.filter((x) => x.perfil_id === perfilId);

  function matrizPermissoes(perfilId, somenteLeitura) {
    const atual = {};
    for (const x of permissoesDe(perfilId)) atual[x.modulo] = x;
    const caixas = {};   // caixas[modulo][acao] = checkbox
    const linhas = [];
    let grupo = null;
    for (const m of P.estado.modulos) {
      if (m.grupo !== grupo) {
        grupo = m.grupo;
        linhas.push(el('tr', { class: 'linha-grupo' }, el('th', { colspan: 5, scope: 'colgroup' }, grupo)));
      }
      caixas[m.codigo] = {};
      const celulas = ACOES.map(([acao, rotulo]) => {
        const cb = el('input', { type: 'checkbox', checked: !!(atual[m.codigo] && atual[m.codigo][acao]), disabled: somenteLeitura, 'aria-label': rotulo + ' · ' + m.nome });
        caixas[m.codigo][acao] = cb;
        // Marcar qualquer ação marca "Ver"; desmarcar "Ver" desmarca as outras.
        cb.addEventListener('change', () => {
          const c = caixas[m.codigo];
          if (acao === 'pode_ver' && !cb.checked) ACOES.forEach(([a]) => { c[a].checked = false; });
          if (acao !== 'pode_ver' && cb.checked) c.pode_ver.checked = true;
        });
        return el('td', { class: 'centro' }, cb);
      });
      linhas.push(el('tr', null, el('td', null, m.nome), celulas));
    }
    const tabela = el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela tabela-matriz' },
      el('thead', null, el('tr', null, el('th', { scope: 'col' }, 'Módulo'), ACOES.map(([, r]) => el('th', { scope: 'col', class: 'centro' }, r)))),
      el('tbody', null, linhas)));
    const ler = () => P.estado.modulos.map((m) => {
      const r = { perfil_id: null, modulo: m.codigo };
      ACOES.forEach(([a]) => { r[a] = caixas[m.codigo][a].checked; });
      return r;
    });
    return { tabela, ler };
  }

  function formPerfil(base, editar) {
    // base: perfil de origem (cópia) ou o próprio perfil (edição); null = em branco.
    const suporte = !!(P.estado.usuario && P.estado.usuario.suporte_softplus);
    const sistema = editar && !base.orgao_id;
    // Perfil do sistema vale para todos os órgãos: só o Suporte SOFT+ altera (o de administrador, nunca).
    const somenteLeitura = !adminDe(orgPerfis) || (sistema && (!suporte || base.e_administrador));
    const nome = el('input', { type: 'text', maxlength: 80, value: editar ? base.nome : (base ? base.nome + ' (cópia)' : '') });
    const descricao = el('input', { type: 'text', maxlength: 200, value: base ? base.descricao || '' : '' });
    const matriz = matrizPermissoes(base ? base.id : null, somenteLeitura);
    if (somenteLeitura) { nome.disabled = true; descricao.disabled = true; }

    const corpo = el('form', { class: 'form-dialogo', novalidate: true },
      sistema && base.e_administrador ? el('p', { class: 'msg msg-info' }, 'Administrador do órgão: tem acesso a tudo e não pode ser alterado.') : null,
      sistema && !base.e_administrador && !suporte ? el('p', { class: 'msg msg-info' }, 'Perfil padrão do sistema: vale para todos os órgãos da plataforma, por isso só o Suporte SOFT+ altera. Para ajustar só neste órgão, use "Criar cópia" e mude a cópia.') : null,
      sistema && !base.e_administrador && suporte ? el('p', { class: 'msg msg-falta' }, 'Perfil padrão do sistema: a alteração vale para TODOS os órgãos e todas as pessoas com este perfil.') : null,
      // A matriz de permissões é longa: em aba própria, o nome do perfil não some de vista ao rolar.
      P.abas([
        ['perfil', 'Nome e descrição', [el('div', { class: 'grade-campos' },
          campo('pf-nome', 'Nome do perfil', nome, null, true),
          campo('pf-descricao', 'Descrição', descricao, 'Uma frase dizendo para quem é o perfil.'))]],
        ['permissoes', 'Permissões por módulo', [matriz.tabela]]
      ], somenteLeitura ? 'permissoes' : 'perfil')
    );
    const titulo = somenteLeitura ? 'Permissões · ' + base.nome : editar ? 'Editar perfil' : 'Novo perfil';
    const acoes = [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => dlg.close() }, somenteLeitura ? 'Fechar' : 'Cancelar')];
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar');
    if (!somenteLeitura) acoes.push(btn);
    const dlg = P.abrirDialogo(titulo, corpo, acoes);
    dlg.classList.add('dialogo-largo');

    btn.addEventListener('click', async () => {
      const n = nome.value.trim();
      if (!erroCampo('pf-nome', n ? '' : 'Informe o nome do perfil.')) return;
      const repetido = perfisDoOrgao(orgPerfis).some((p) => normalizar(p.nome) === normalizar(n) && (!editar || p.id !== base.id));
      if (!erroCampo('pf-nome', repetido ? 'Já existe um perfil com esse nome.' : '')) return;
      const linhas = matriz.ler();
      if (!linhas.some((l) => l.pode_ver)) { toast('Marque pelo menos um módulo que o perfil pode ver.', true); return; }
      ocupado(btn, 'Salvando…');
      try {
        let id = editar ? base.id : null;
        const reg = { nome: n, descricao: descricao.value.trim() || null };
        const q = editar
          ? sb.from('perfis').update(reg).eq('id', id).select('id')
          : sb.from('perfis').insert(Object.assign({ orgao_id: orgPerfis }, reg)).select('id');
        const { data, error } = await q;
        if (error) throw /duplicate key/i.test(error.message) ? amigavel('Já existe um perfil com esse nome.') : error;
        if (!data || !data.length) throw amigavel('Só um administrador do órgão pode mexer nos perfis.');
        id = data[0].id;
        linhas.forEach((l) => { l.perfil_id = id; });
        const r = await sb.from('perfil_permissoes').upsert(linhas, { onConflict: 'perfil_id,modulo' });
        if (r.error) throw r.error;
        dlg.close();
        toast(editar ? 'Perfil atualizado.' : 'Perfil criado.');
        await recarregar();
      } catch (e) { mostrarErro(e); }
      finally { ocupado(btn); }
    });
  }

  async function excluirPerfil(p) {
    const usando = d.vinculos.filter((x) => x.perfil_id === p.id || (x.perfis_extras || []).includes(p.id));
    if (usando.length) {
      P.aviso('Não é possível excluir', 'O perfil "' + p.nome + '" está em uso por ' + usando.length +
        (usando.length === 1 ? ' pessoa (' : ' pessoas (') + usando.map((x) => x.nome || x.email).join(', ') +
        '). Mude o perfil dessas pessoas antes de excluir.');
      return;
    }
    if (!await P.confirmar('Excluir perfil', 'Excluir o perfil "' + p.nome + '"? A ação fica no histórico.', 'Excluir', true)) return;
    const { data, error } = await sb.from('perfis').delete().eq('id', p.id).select('id');
    if (error) return toast(traduzirErro(error), true);
    if (!data || !data.length) return toast('Só um administrador do órgão pode excluir perfis.', true);
    toast('Perfil excluído.');
    await recarregar();
  }

  function tabelaPerfis() {
    const resumo = (id) => {
      const ps = permissoesDe(id);
      const ver = ps.filter((x) => x.pode_ver).length;
      const pub = ps.filter((x) => x.pode_publicar).length;
      return ver + ' de ' + P.estado.modulos.length + ' módulos' + (pub ? ' · publica em ' + pub : ' · não publica');
    };
    return el('div', { class: 'tabela-caixa' },
      el('table', { class: 'tabela' },
        el('thead', null, el('tr', null,
          ['Perfil', 'Tipo', 'Alcance das permissões', 'Pessoas'].map((t) => el('th', { scope: 'col' }, t)),
          el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Ações')))),
        el('tbody', null, perfisDoOrgao(orgPerfis).map((p) => {
          const qtd = d.vinculos.filter((x) => (x.perfil_id === p.id || (x.perfis_extras || []).includes(p.id)) && x.orgao_id === orgPerfis).length;
          const proprio = !!p.orgao_id;
          return el('tr', null,
            el('td', null, el('strong', null, p.nome), p.descricao ? el('span', { class: 'sub-linha' }, p.descricao) : null),
            el('td', null, proprio ? 'Do órgão' : 'Padrão do sistema'),
            el('td', null, resumo(p.id)),
            el('td', null, String(qtd)),
            el('td', { class: 'acoes' },
              el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => formPerfil(p, true) },
                (proprio && adminDe(orgPerfis)) || (!proprio && !p.e_administrador && P.estado.usuario && P.estado.usuario.suporte_softplus) ? 'Editar' : 'Ver permissões'),
              adminDe(orgPerfis) && !p.e_administrador ? el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => formPerfil(p, false) }, 'Criar cópia') : null,
              adminDe(orgPerfis) && proprio ? el('button', { type: 'button', class: 'btn btn-claro btn-p btn-texto-perigo', onclick: () => excluirPerfil(p) }, 'Excluir') : null
            )
          );
        }))
      )
    );
  }

    // ================= TELA =================
  function desenhar() {
    const area = el('div');
    const redesenharPessoas = () => area.replaceChildren(tabelaPessoas());
    const botaoAba = (id, rotulo, qtd) => el('button', {
      type: 'button', role: 'tab', class: 'aba', 'aria-selected': aba === id ? 'true' : 'false',
      onclick: () => { aba = id; desenhar(); }
    }, rotulo, el('span', { class: 'aba-qtd' }, String(qtd)));

    let botaoNovo = null;
    if (aba === 'pessoas' && orgaosEditaveis().length) botaoNovo = el('button', { type: 'button', class: 'btn btn-primario', onclick: formCadastro }, '+ Cadastrar pessoa');
    if (aba === 'perfis' && adminDe(orgPerfis)) botaoNovo = el('button', { type: 'button', class: 'btn btn-primario', onclick: () => formPerfil(null, false) }, '+ Novo perfil');

    let seletorOrgaoPerfis = null;
    if (aba === 'perfis' && d.orgaos.length > 1) {
      seletorOrgaoPerfis = el('select', { 'aria-label': 'Órgão dos perfis' }, d.orgaos.map((o) => el('option', { value: o.id, selected: o.id === orgPerfis }, o.nome)));
      seletorOrgaoPerfis.addEventListener('change', () => { orgPerfis = seletorOrgaoPerfis.value; desenhar(); });
    }
    if (aba === 'pessoas') redesenharPessoas(); else area.replaceChildren(tabelaPerfis());
    const nunca = d.pessoas.filter((p) => p.acessos.some((v) => v.ativo && v.pendente)).length;

    conteiner.replaceChildren(...[
      el('div', { class: 'cabecalho-modulo' },
        el('div', null, el('h1', null, 'Usuários e permissões'),
          el('p', { class: 'sub' }, d.orgaos.length > 1
            ? 'Pessoas com acesso aos ' + d.orgaos.length + ' órgãos que você gerencia, com o perfil e o alcance em cada um.'
            : 'Quem tem acesso ao painel, com qual perfil e em qual unidade.')),
        botaoNovo),
      aba === 'pessoas' && nunca ? el('p', { class: 'msg msg-info' }, nunca + (nunca === 1 ? ' pessoa ainda não entrou' : ' pessoas ainda não entraram') + ' no painel. Se perderam a senha inicial, use "Abrir" › "Definir nova senha".') : null,
      aba === 'perfis' && !adminDe(orgPerfis) ? el('p', { class: 'msg msg-info' }, 'Só administradores do órgão criam ou alteram perfis. Você pode consultar as permissões.') : null,
      el('div', { class: 'abas', role: 'tablist' },
        botaoAba('pessoas', 'Pessoas', d.pessoas.length),
        botaoAba('perfis', 'Perfis', perfisDoOrgao(orgPerfis).length)),
      el('div', { class: 'painel-guia' }, aba === 'pessoas' ? barraFiltrosPessoas(redesenharPessoas) : seletorOrgaoPerfis ? el('div', { class: 'filtros' }, seletorOrgaoPerfis) : null, area)
    ].filter(Boolean));
  }

  async function recarregar() {
    try { await carregar(); desenhar(); }
    catch (e) { mostrarErro(e); }
  }

  P.telas.usuarios = async function (c) {
    conteiner = c;
    c.replaceChildren(el('h1', null, 'Usuários e permissões'), el('p', { class: 'sub' }, 'Carregando…'));
    try { await carregar(); desenhar(); }
    catch (e) {
      c.querySelector('.sub').textContent = /orgaos_que_gerencio|usuarios_unificados/.test(e.message || '') ? 'Falta rodar o script 28 no banco.' : traduzirErro(e);
    }
  };
})();
