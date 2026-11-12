// =====================================================================
// Módulo "Usuários e permissões" (Lote 2)
// Abas: Pessoas (convite, perfil, alcance, desativar) e Perfis
// (perfis do sistema + perfis próprios do órgão, com a tabela de permissões).
//
// Toda regra de segurança está no banco (script 05) e na função de convite.
// Esta tela só esconde o que a pessoa não pode fazer e explica o motivo.
// =====================================================================
(function () {
  'use strict';
  const P = window.PNTP;
  const { sb, el, toast, ocupado, erroCampo, traduzirErro, emailValido, normalizar, ordemAlfabetica } = P;

  const ACOES = [
    ['pode_ver', 'Ver'], ['pode_editar', 'Cadastrar e editar'],
    ['pode_publicar', 'Publicar'], ['pode_excluir', 'Excluir']
  ];

  let perm = {};
  let aba = 'pessoas';
  let conteiner = null;
  const filtros = { busca: '', perfil: '', alcance: '', situacao: '' };
  let d = { pessoas: [], perfis: [], permissoes: [], unidades: [], eAdmin: false, minhaUnidade: null, euId: null };

  // Pessoas por órgão são poucas (dezenas): carregam de uma vez.
  async function carregar() {
    const org = P.estado.orgao.id;
    const { data: { user } } = await sb.auth.getUser();
    const [pe, pf, un, adm, meu] = await Promise.all([
      sb.rpc('usuarios_do_orgao', { p_orgao: org }),
      sb.from('perfis').select('id, nome, descricao, orgao_id, e_administrador').or('orgao_id.is.null,orgao_id.eq.' + org),
      sb.from('unidades').select('id, nome').eq('orgao_id', org).order('nome').limit(500),
      sb.rpc('e_admin_do_orgao', { p_orgao: org }),
      sb.from('usuarios_orgaos').select('unidade_id').eq('orgao_id', org).eq('usuario_id', user.id).maybeSingle()
    ]);
    for (const r of [pe, pf, un, adm]) if (r.error) throw r.error;
    const ids = pf.data.map((p) => p.id);
    const pp = await sb.from('perfil_permissoes').select('*').in('perfil_id', ids);
    if (pp.error) throw pp.error;
    d = {
      pessoas: pe.data, perfis: pf.data.sort((a, b) => ordemAlfabetica(a.nome, b.nome)),
      permissoes: pp.data, unidades: un.data, eAdmin: !!adm.data,
      minhaUnidade: meu.data ? meu.data.unidade_id : null, euId: user.id
    };
  }

  const perfilPorId = (id) => d.perfis.find((p) => p.id === id) || {};
  const nomeUnidade = (id) => (d.unidades.find((u) => u.id === id) || {}).nome || '';
  const amigavel = (texto) => Object.assign(new Error(texto), { amigavel: true });
  function mostrarErro(e) {
    const t = (e && e.message) || '';
    // Mensagens que o próprio banco já escreve em português passam direto.
    if (e && e.amigavel) return toast(t, true);
    if (/administrador ativo|não pode alterar o seu próprio|só pode dar acesso|Só um administrador/i.test(t)) return toast(t, true);
    toast(traduzirErro(e), true);
  }
  const dataHora = (iso) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;

  function situacao(p) {
    if (!p.ativo) return 'desativado';
    if (p.pendente) return 'pendente';
    return 'ativo';
  }
  const ROTULO_SITUACAO = { ativo: 'Ativo', pendente: 'Convite pendente', desativado: 'Desativado' };

  // A tela pode mexer nesta pessoa? (o banco confere de novo)
  function podeMexer(p) {
    if (!perm.editar || p.usuario_id === d.euId) return false;
    if (p.e_administrador && !d.eAdmin) return false;
    if (d.minhaUnidade && p.unidade_id !== d.minhaUnidade) return false;
    return true;
  }

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

  function seletorPerfil(atual) {
    const s = el('select', null, el('option', { value: '' }, '— Escolha —'));
    const grupo = (rotulo, lista) => {
      if (!lista.length) return;
      s.append(el('optgroup', { label: rotulo }, lista.map((p) =>
        el('option', { value: p.id, selected: p.id === atual }, p.nome))));
    };
    // Só administrador entrega o perfil de administrador.
    const disponiveis = d.perfis.filter((p) => !p.e_administrador || d.eAdmin || p.id === atual);
    grupo('Perfis do órgão', disponiveis.filter((p) => p.orgao_id));
    grupo('Perfis padrão', disponiveis.filter((p) => !p.orgao_id));
    return s;
  }

  function seletorAlcance(atual) {
    // Gestor setorial só cadastra gente da própria unidade.
    if (d.minhaUnidade) {
      return el('select', { disabled: true }, el('option', { value: d.minhaUnidade }, nomeUnidade(d.minhaUnidade) + ' (seu alcance)'));
    }
    return el('select', null,
      el('option', { value: '' }, 'Todo o órgão'),
      d.unidades.map((u) => el('option', { value: u.id, selected: u.id === atual }, 'Só: ' + u.nome)));
  }

  // Descrição do perfil escolhido logo abaixo do campo.
  function ligarDescricao(sel, id) {
    const atualizar = () => {
      const a = document.getElementById(id + '-ajuda');
      if (a) a.textContent = perfilPorId(sel.value).descricao || 'Veja o que cada perfil pode fazer na aba "Perfis".';
    };
    sel.addEventListener('change', atualizar);
    setTimeout(atualizar);
  }

  // ---------- chamada da função de convite ----------
  async function chamarFuncao(corpo) {
    const { data, error } = await sb.functions.invoke('convidar-usuario', {
      body: Object.assign({ orgao_id: P.estado.orgao.id, redirecionar: location.origin + location.pathname }, corpo)
    });
    if (error) {
      const status = error.context && error.context.status;
      if (status === 404 || /Failed to send a request|not found/i.test(error.message)) {
        throw amigavel('A função de convite ainda não foi instalada na Supabase. Siga o passo "Função de convite" do README.');
      }
      if (status === 401) throw amigavel('Sua sessão expirou. Saia e entre novamente.');
      throw error;
    }
    if (!data || !data.ok) throw amigavel((data && data.erro) || 'Não foi possível concluir.');
    return data;
  }

  function mostrarLink(nomePessoa, email, link) {
    const orgao = P.estado.orgao.nome;
    const texto = 'Olá, ' + (nomePessoa || '').split(' ')[0] + '! Você recebeu acesso ao painel do site da ' + orgao +
      '. Para criar sua senha, abra este link (ele só funciona uma vez): ' + link;
    const caixa = el('textarea', { rows: 4, readonly: true, class: 'link-convite', 'aria-label': 'Mensagem com o link' });
    caixa.value = texto;
    const btnCopiar = el('button', { type: 'button', class: 'btn btn-claro' }, 'Copiar mensagem');
    btnCopiar.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(texto); toast('Mensagem copiada.'); }
      catch (e) { caixa.select(); document.execCommand('copy'); toast('Mensagem copiada.'); }
    });
    const dlg = P.abrirDialogo('Link de acesso pronto', el('div', null,
      el('p', null, 'Envie a mensagem abaixo para ', el('strong', null, email), '. Ao abrir o link, a pessoa cria a própria senha.'),
      caixa,
      el('p', { class: 'ajuda' }, 'O link só funciona uma vez e tem validade limitada. Se vencer, use "Novo link" na lista. Não envie o link em grupos: quem abrir primeiro cria a senha.')
    ), [
      btnCopiar,
      el('a', { class: 'btn btn-claro', href: 'https://wa.me/?text=' + encodeURIComponent(texto), target: '_blank', rel: 'noopener' }, 'Enviar pelo WhatsApp'),
      el('button', { type: 'button', class: 'btn btn-primario', onclick: () => dlg.close() }, 'Concluir')
    ]);
  }

  function resultadoConvite(r, nomePessoa) {
    if (r.situacao === 'link') return mostrarLink(nomePessoa, r.email, r.link);
    if (r.situacao === 'email_enviado') return P.aviso('Convite enviado', 'Um e-mail foi enviado para ' + r.email + ' com o link para criar a senha. Peça para conferir a caixa de spam.');
    P.aviso('Acesso liberado', r.email + ' já tinha cadastro no painel. Ao entrar com a senha de sempre, verá este órgão na lista. Se não lembrar a senha, pode usar "Esqueci minha senha".');
  }

  // ================= PESSOAS =================
  function formConvite() {
    const f = {
      nome: el('input', { type: 'text', maxlength: 120, autocomplete: 'off' }),
      email: el('input', { type: 'email', maxlength: 160, autocomplete: 'off' }),
      perfil: seletorPerfil(null),
      alcance: seletorAlcance(null)
    };
    const modoLink = el('input', { type: 'radio', name: 'modo-convite', value: 'link', checked: true });
    const modoEmail = el('input', { type: 'radio', name: 'modo-convite', value: 'email' });
    const corpo = el('form', { class: 'form-dialogo', novalidate: true },
      campo('cv-nome', 'Nome completo', f.nome, null, true),
      campo('cv-email', 'E-mail', f.email, 'É o e-mail que a pessoa vai usar para entrar.', true),
      el('div', { class: 'grade-campos' },
        campo('cv-perfil', 'Perfil', f.perfil, ' ', true),
        campo('cv-alcance', 'Alcance', f.alcance, 'Com uma unidade escolhida, a pessoa só mexe nos dados dela.')
      ),
      el('fieldset', { class: 'opcoes' },
        el('legend', null, 'Como entregar o convite'),
        el('label', { class: 'checkbox' }, modoLink, ' Gerar link para eu enviar (WhatsApp ou e-mail próprio)'),
        el('label', { class: 'checkbox' }, modoEmail, ' Enviar e-mail automático (só depois de configurar o e-mail da Supabase)')
      )
    );
    ligarDescricao(f.perfil, 'cv-perfil');

    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Convidar');
    const dlg = P.abrirDialogo('Convidar pessoa', corpo, [
      el('button', { type: 'button', class: 'btn btn-claro', onclick: () => dlg.close() }, 'Cancelar'), btn
    ]);
    corpo.addEventListener('submit', (ev) => { ev.preventDefault(); btn.click(); });
    btn.addEventListener('click', async () => {
      const nome = f.nome.value.trim().replace(/\s+/g, ' ');
      const email = f.email.value.trim().toLowerCase();
      if (!erroCampo('cv-nome', nome.split(' ').length >= 2 ? '' : 'Informe nome e sobrenome.')) return;
      if (!erroCampo('cv-email', emailValido(email) ? '' : 'Informe um e-mail válido.')) return;
      if (d.pessoas.some((p) => p.email.toLowerCase() === email)) {
        erroCampo('cv-email', 'Esta pessoa já está na lista deste órgão.');
        return;
      }
      if (!erroCampo('cv-perfil', f.perfil.value ? '' : 'Escolha o perfil.')) return;
      ocupado(btn, 'Convidando…');
      try {
        const r = await chamarFuncao({
          acao: 'convidar', nome, email, perfil_id: f.perfil.value,
          unidade_id: f.alcance.value || null, modo: modoEmail.checked ? 'email' : 'link'
        });
        dlg.close();
        await recarregar();
        resultadoConvite(r, nome);
      } catch (e) { mostrarErro(e); }
      finally { ocupado(btn); }
    });
    f.nome.focus();
  }

  function formAcesso(p) {
    const f = { perfil: seletorPerfil(p.perfil_id), alcance: seletorAlcance(p.unidade_id) };
    const corpo = el('form', { class: 'form-dialogo', novalidate: true },
      el('p', null, el('strong', null, p.nome || p.email), el('span', { class: 'sub-linha' }, p.email)),
      campo('ac-perfil', 'Perfil', f.perfil, ' ', true),
      campo('ac-alcance', 'Alcance', f.alcance, 'Com uma unidade escolhida, a pessoa só mexe nos dados dela.')
    );
    ligarDescricao(f.perfil, 'ac-perfil');
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar');
    const dlg = P.abrirDialogo('Alterar acesso', corpo, [
      el('button', { type: 'button', class: 'btn btn-claro', onclick: () => dlg.close() }, 'Cancelar'), btn
    ]);
    btn.addEventListener('click', async () => {
      if (!erroCampo('ac-perfil', f.perfil.value ? '' : 'Escolha o perfil.')) return;
      ocupado(btn, 'Salvando…');
      try {
        await atualizarVinculo(p, { perfil_id: f.perfil.value, unidade_id: f.alcance.value || null });
        dlg.close();
        toast('Acesso alterado.');
        await recarregar();
      } catch (e) { mostrarErro(e); }
      finally { ocupado(btn); }
    });
  }

  // Grava e confere se mudou de fato (0 linhas = fora do alcance), com o motivo exato vindo do banco.
  async function atualizarVinculo(p, mudanca) {
    const novo = Object.assign({ perfil_id: p.perfil_id, unidade_id: p.unidade_id }, mudanca);
    const { data: motivo } = await sb.rpc('motivo_bloqueio_acesso', {
      p_orgao: P.estado.orgao.id, p_perfil: novo.perfil_id, p_unidade: novo.unidade_id, p_usuario: p.usuario_id
    });
    if (motivo) throw amigavel(motivo);
    const { data, error } = await sb.from('usuarios_orgaos').update(mudanca).eq('id', p.vinculo_id).select('id');
    if (error) throw error;
    if (!data || !data.length) throw amigavel('Nada foi alterado: esta pessoa está fora do alcance do seu perfil.');
  }

  async function alternarAtivo(p) {
    const desativar = p.ativo;
    const ok = await P.confirmar(desativar ? 'Desativar acesso' : 'Reativar acesso',
      desativar
        ? (p.nome || p.email) + ' não vai mais conseguir abrir este órgão no painel. O histórico do que a pessoa fez continua guardado. Dá para reativar depois.'
        : (p.nome || p.email) + ' volta a ter acesso com o perfil "' + p.perfil + '".',
      desativar ? 'Desativar' : 'Reativar', desativar);
    if (!ok) return;
    try {
      await atualizarVinculo(p, { ativo: !desativar });
      toast(desativar ? 'Acesso desativado.' : 'Acesso reativado.');
      await recarregar();
    } catch (e) { mostrarErro(e); }
  }

  async function remover(p) {
    if (!p.pendente) {
      P.aviso('Prefira desativar', (p.nome || p.email) + ' já entrou no painel e tem alterações no histórico. Para tirar o acesso, use "Desativar": o registro de quem fez o quê continua completo.');
      return;
    }
    if (!await P.confirmar('Cancelar convite', 'Cancelar o convite de ' + (p.nome || p.email) + '? O link enviado deixa de dar acesso a este órgão.', 'Cancelar convite', true)) return;
    const { data, error } = await sb.from('usuarios_orgaos').delete().eq('id', p.vinculo_id).select('id');
    if (error) return mostrarErro(error);
    if (!data || !data.length) return toast('Seu perfil não pode remover esta pessoa.', true);
    toast('Convite cancelado.');
    await recarregar();
  }

  async function novoLink(p, btn) {
    ocupado(btn, 'Gerando…');
    try {
      const r = await chamarFuncao({ acao: 'novo_link', usuario_id: p.usuario_id, modo: 'link' });
      mostrarLink(p.nome, r.email, r.link);
    } catch (e) { mostrarErro(e); }
    finally { ocupado(btn); }
  }

  // Um filtro para cada coluna da listagem (regra do projeto).
  function barraFiltrosPessoas(redesenhar) {
    const busca = el('input', { type: 'search', placeholder: 'Nome ou e-mail', value: filtros.busca, 'aria-label': 'Buscar por nome ou e-mail' });
    const perfil = el('select', { 'aria-label': 'Filtrar por perfil' }, el('option', { value: '' }, 'Todos os perfis'),
      d.perfis.filter((x) => d.pessoas.some((p) => p.perfil_id === x.id)).map((x) => el('option', { value: x.id, selected: filtros.perfil === x.id }, x.nome)));
    const alcance = el('select', { 'aria-label': 'Filtrar por alcance' }, el('option', { value: '' }, 'Qualquer alcance'),
      el('option', { value: 'todo', selected: filtros.alcance === 'todo' }, 'Todo o órgão'),
      d.unidades.filter((u) => d.pessoas.some((p) => p.unidade_id === u.id)).map((u) => el('option', { value: u.id, selected: filtros.alcance === u.id }, u.nome)));
    const sit = el('select', { 'aria-label': 'Filtrar por situação' }, el('option', { value: '' }, 'Qualquer situação'),
      Object.entries(ROTULO_SITUACAO).map(([k, v]) => el('option', { value: k, selected: filtros.situacao === k }, v)));
    busca.addEventListener('input', () => { filtros.busca = busca.value; redesenhar(); });
    perfil.addEventListener('change', () => { filtros.perfil = perfil.value; redesenhar(); });
    alcance.addEventListener('change', () => { filtros.alcance = alcance.value; redesenhar(); });
    sit.addEventListener('change', () => { filtros.situacao = sit.value; redesenhar(); });
    return el('div', { class: 'filtros' }, busca, perfil, alcance, sit);
  }

  function tabelaPessoas() {
    const fb = normalizar(filtros.busca);
    const lista = d.pessoas.filter((p) =>
      (!fb || normalizar(p.nome + ' ' + p.email).includes(fb)) &&
      (!filtros.perfil || p.perfil_id === filtros.perfil) &&
      (!filtros.alcance || (filtros.alcance === 'todo' ? !p.unidade_id : p.unidade_id === filtros.alcance)) &&
      (!filtros.situacao || situacao(p) === filtros.situacao));
    if (!lista.length) return el('p', { class: 'vazio' }, d.pessoas.length ? 'Ninguém encontrado com esses filtros.' : 'Nenhuma pessoa com acesso ainda.');

    return el('div', { class: 'tabela-caixa' },
      el('table', { class: 'tabela' },
        el('thead', null, el('tr', null,
          ['Pessoa', 'Perfil', 'Alcance', 'Situação', 'Último acesso'].map((t) => el('th', { scope: 'col' }, t)),
          el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Ações')))),
        el('tbody', null, lista.map((p) => {
          const s = situacao(p);
          const mexe = podeMexer(p);
          const btnLink = el('button', { type: 'button', class: 'btn btn-claro btn-p' }, 'Novo link');
          btnLink.addEventListener('click', () => novoLink(p, btnLink));
          return el('tr', null,
            el('td', null,
              el('strong', null, p.nome || '(sem nome)'),
              p.usuario_id === d.euId ? el('span', { class: 'etiqueta', style: 'margin-left:6px' }, 'você') : null,
              el('span', { class: 'sub-linha' }, p.email)),
            el('td', null, p.perfil),
            el('td', null, p.unidade || 'Todo o órgão'),
            el('td', null, el('span', { class: 'etiqueta etiqueta-' + s }, ROTULO_SITUACAO[s])),
            el('td', null, dataHora(p.ultimo_acesso) || el('span', { class: 'falta-leve' }, 'Nunca entrou')),
            el('td', { class: 'acoes' },
              mexe ? el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => formAcesso(p) }, 'Alterar') : null,
              mexe && p.pendente && p.ativo ? btnLink : null,
              mexe && !p.pendente ? el('button', { type: 'button', class: 'btn btn-claro btn-p' + (p.ativo ? ' btn-texto-perigo' : ''), onclick: () => alternarAtivo(p) }, p.ativo ? 'Desativar' : 'Reativar') : null,
              mexe && p.pendente && perm.excluir ? el('button', { type: 'button', class: 'btn btn-claro btn-p btn-texto-perigo', onclick: () => remover(p) }, 'Cancelar convite') : null,
              mexe && p.pendente && !perm.excluir ? el('button', { type: 'button', class: 'btn btn-claro btn-p btn-texto-perigo', onclick: () => alternarAtivo(p) }, 'Desativar') : null
            )
          );
        }))
      )
    );
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
    const somenteLeitura = !d.eAdmin || (editar && !base.orgao_id);
    const nome = el('input', { type: 'text', maxlength: 80, value: editar ? base.nome : (base ? base.nome + ' (cópia)' : '') });
    const descricao = el('input', { type: 'text', maxlength: 200, value: base ? base.descricao || '' : '' });
    const matriz = matrizPermissoes(base ? base.id : null, somenteLeitura);
    if (somenteLeitura) { nome.disabled = true; descricao.disabled = true; }

    const corpo = el('form', { class: 'form-dialogo', novalidate: true },
      editar && !base.orgao_id ? el('p', { class: 'msg msg-info' }, 'Perfil padrão do sistema: não pode ser alterado. Para ajustar, use "Criar cópia" e mude a cópia.') : null,
      el('div', { class: 'grade-campos' },
        campo('pf-nome', 'Nome do perfil', nome, null, true),
        campo('pf-descricao', 'Descrição', descricao, 'Uma frase dizendo para quem é o perfil.')
      ),
      matriz.tabela
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
      const repetido = d.perfis.some((p) => normalizar(p.nome) === normalizar(n) && (!editar || p.id !== base.id));
      if (!erroCampo('pf-nome', repetido ? 'Já existe um perfil com esse nome.' : '')) return;
      const linhas = matriz.ler();
      if (!linhas.some((l) => l.pode_ver)) { toast('Marque pelo menos um módulo que o perfil pode ver.', true); return; }
      ocupado(btn, 'Salvando…');
      try {
        let id = editar ? base.id : null;
        const reg = { nome: n, descricao: descricao.value.trim() || null };
        const q = editar
          ? sb.from('perfis').update(reg).eq('id', id).select('id')
          : sb.from('perfis').insert(Object.assign({ orgao_id: P.estado.orgao.id }, reg)).select('id');
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
    const usando = d.pessoas.filter((x) => x.perfil_id === p.id);
    if (usando.length) {
      P.aviso('Não é possível excluir', 'O perfil "' + p.nome + '" está em uso por ' + usando.length +
        (usando.length === 1 ? ' pessoa (' : ' pessoas (') + usando.map((x) => x.nome || x.email).join(', ') +
        '). Mude o perfil dessas pessoas antes de excluir.');
      return;
    }
    if (!await P.confirmar('Excluir perfil', 'Excluir o perfil "' + p.nome + '"? A ação fica no histórico.', 'Excluir', true)) return;
    const { data, error } = await sb.from('perfis').delete().eq('id', p.id).select('id');
    if (error) return toast(/foreign key/i.test(error.message) ? 'O perfil ainda está em uso e não pode ser excluído.' : traduzirErro(error), true);
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
        el('tbody', null, d.perfis.map((p) => {
          const qtd = d.pessoas.filter((x) => x.perfil_id === p.id).length;
          const proprio = !!p.orgao_id;
          return el('tr', null,
            el('td', null, el('strong', null, p.nome), p.descricao ? el('span', { class: 'sub-linha' }, p.descricao) : null),
            el('td', null, proprio ? 'Do órgão' : 'Padrão do sistema'),
            el('td', null, resumo(p.id)),
            el('td', null, String(qtd)),
            el('td', { class: 'acoes' },
              el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => formPerfil(p, true) }, proprio && d.eAdmin ? 'Editar' : 'Ver permissões'),
              d.eAdmin && !p.e_administrador ? el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => formPerfil(p, false) }, 'Criar cópia') : null,
              d.eAdmin && proprio ? el('button', { type: 'button', class: 'btn btn-claro btn-p btn-texto-perigo', onclick: () => excluirPerfil(p) }, 'Excluir') : null
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
    if (aba === 'pessoas' && perm.editar) botaoNovo = el('button', { type: 'button', class: 'btn btn-primario', onclick: formConvite }, '+ Convidar pessoa');
    if (aba === 'perfis' && d.eAdmin) botaoNovo = el('button', { type: 'button', class: 'btn btn-primario', onclick: () => formPerfil(null, false) }, '+ Novo perfil');

    const pendentes = d.pessoas.filter((p) => p.ativo && p.pendente).length;
    if (aba === 'pessoas') redesenharPessoas(); else area.replaceChildren(tabelaPerfis());

    conteiner.replaceChildren(...[
      el('div', { class: 'cabecalho-modulo' },
        el('div', null,
          el('h1', null, 'Usuários e permissões'),
          el('p', { class: 'sub' }, 'Quem tem acesso ao painel deste órgão, com qual perfil e em qual unidade.')),
        botaoNovo),
      aba === 'pessoas' && pendentes ? el('p', { class: 'msg msg-info' }, pendentes + (pendentes === 1 ? ' convite ainda não foi aceito.' : ' convites ainda não foram aceitos.') + ' Se o link venceu, use "Novo link".') : null,
      aba === 'perfis' && !d.eAdmin ? el('p', { class: 'msg msg-info' }, 'Só administradores do órgão criam ou alteram perfis. Você pode consultar as permissões.') : null,
      el('div', { class: 'abas', role: 'tablist' },
        botaoAba('pessoas', 'Pessoas', d.pessoas.length),
        botaoAba('perfis', 'Perfis', d.perfis.length)),
      aba === 'pessoas' ? barraFiltrosPessoas(redesenharPessoas) : null,
      area
    ].filter(Boolean));
  }

  async function recarregar() {
    try { await carregar(); desenhar(); }
    catch (e) { mostrarErro(e); }
  }

  P.telas.usuarios = async function (c, mod, p) {
    perm = p;
    conteiner = c;
    c.replaceChildren(el('h1', null, 'Usuários e permissões'), el('p', { class: 'sub' }, 'Carregando…'));
    try { await carregar(); desenhar(); }
    catch (e) { c.querySelector('.sub').textContent = traduzirErro(e); }
  };
})();
