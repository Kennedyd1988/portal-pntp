// =====================================================================
// Módulo "Órgãos da plataforma" (só Suporte SOFT+, script 27).
// Todos os órgãos ficam no mesmo banco: cadastrar um órgão é gravar um registro
// (criar_orgao), que já sai com a identidade inicial e o menu padrão do site.
// A lista mostra o que falta para cada órgão entrar no ar (orgaos_plataforma).
// =====================================================================
(function () {
  'use strict';
  const P = window.PNTP;
  const { sb, el, toast, ocupado, erroCampo, traduzirErro, campo } = P;
  const TIPOS = { prefeitura: 'Prefeitura', camara: 'Câmara Municipal', rpps: 'Instituto de previdência (RPPS)', consorcio: 'Consórcio público',
    autarquia: 'Autarquia ou fundação', outro: 'Outro' };
  const UFS = 'AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO'.split(' ');

  let lista = [];
  let conteiner = null;

  async function carregar() {
    const { data, error } = await sb.rpc('orgaos_plataforma');
    if (error) throw error;
    lista = data || [];
  }

  function desenhar() {
    const c = conteiner;
    const btnNovo = el('button', { type: 'button', class: 'btn btn-primario', onclick: () => formulario({}) }, 'Cadastrar órgão');
    const prontos = lista.filter((o) => !o.pendencias.length).length;
    c.replaceChildren(
      el('div', { class: 'cabecalho-modulo' }, el('div', null, el('h1', null, 'Órgãos da plataforma'),
        el('p', { class: 'sub' }, lista.length + ' órgão(s) · ' + prontos + ' sem pendência de implantação')), el('div', { class: 'botoes-cabecalho' }, btnNovo)),
      el('p', { class: 'msg msg-info' }, 'Todos os órgãos usam o mesmo banco e o mesmo site: cadastrar um órgão não cria banco novo. ',
        'O órgão sai pronto, com o menu padrão do site. Depois: abra o órgão, convide o administrador (Usuários e permissões) e siga as pendências desta lista.'),
      lista.length ? el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela' },
        el('thead', null, el('tr', null, ['Órgão', 'Tipo', 'Endereço do site', 'Pessoas', 'Pendências de implantação', ''].map((t) => el('th', { scope: 'col' }, t)))),
        el('tbody', null, lista.map((o) => {
          const pai = o.orgao_pai_id && lista.find((x) => x.id === o.orgao_pai_id);
          return el('tr', null,
            el('td', null, el('strong', null, o.nome), el('span', { class: 'sub-linha' }, (o.cnpj || 'sem CNPJ') + ' · ' + (o.municipio || '') + '/' + (o.uf || '')),
              pai ? el('span', { class: 'sub-linha' }, 'Subsite de ' + pai.nome) : null,
              o.ativo ? null : el('span', { class: 'etiqueta etiqueta-inativo mt-05' }, 'Inativo')),
            el('td', null, TIPOS[o.tipo] || o.tipo),
            el('td', null, o.dominio || el('span', { class: 'falta-leve' }, 'provisório (?orgao=' + String(o.cnpj || '').replace(/\D/g, '') + ')')),
            el('td', { class: 'num' }, o.usuarios + ' (' + o.administradores + ' adm.)'),
            el('td', null, o.pendencias.length ? el('ul', { class: 'm-0 lista-pendencias' }, o.pendencias.map((t) => el('li', { class: 'falta' }, t)))
              : el('span', { class: 'etiqueta etiqueta-ativo' }, 'Implantação completa')),
            el('td', { class: 'acoes' }, el('button', { type: 'button', class: 'btn btn-claro', onclick: () => formulario(o) }, 'Editar'),
              el('button', { type: 'button', class: 'link', onclick: () => abrir(o.id) }, 'Abrir')));
        })))) : el('p', { class: 'vazio' }, 'Nenhum órgão cadastrado.'));
  }

  // Abre o órgão no painel (o Suporte SOFT+ enxerga todos).
  function abrir(id) {
    try { localStorage.setItem('pntp_ultimo_orgao', id); } catch (e) { /* navegador sem armazenamento */ }
    location.hash = '#/';
    location.reload();
  }

  function formulario(o) {
    const novo = !o.id;
    const txt = (v, extra) => el('input', Object.assign({ type: 'text', value: v || '' }, extra || {}));
    const f = {
      tipo: el('select', null, Object.entries(TIPOS).map(([k, t]) => el('option', { value: k, selected: (o.tipo || 'prefeitura') === k }, t))),
      nome: txt(o.nome, { maxlength: 160, placeholder: 'Ex.: Prefeitura Municipal de …' }), sigla: txt(o.sigla, { maxlength: 20 }),
      cnpj: txt(o.cnpj, { inputmode: 'numeric', maxlength: 18, placeholder: '00.000.000/0000-00' }),
      municipio: txt(o.municipio, { maxlength: 80 }),
      uf: el('select', null, UFS.map((u) => el('option', { value: u, selected: (o.uf || 'RN') === u }, u))),
      dominio: txt(o.dominio, { maxlength: 120, placeholder: 'Em branco até o domínio apontar para o portal' }),
      pai: el('select', null, el('option', { value: '' }, 'Não: é um órgão principal'),
        lista.filter((x) => !x.orgao_pai_id && x.id !== o.id).map((x) => el('option', { value: x.id, selected: o.orgao_pai_id === x.id }, 'Subsite de: ' + x.nome))),
      email: txt('', { type: 'email', maxlength: 120 }), telefone: txt('', { maxlength: 30 }),
      ativo: el('input', { type: 'checkbox', checked: novo || o.ativo })
    };
    const corpo = el('form', { class: 'form-dialogo', novalidate: true },
      el('div', { class: 'grade-campos' }, campo('og-tipo', 'Tipo', f.tipo, 'Define a matriz do PNTP que vale para o órgão.', true), campo('og-cnpj', 'CNPJ', f.cnpj, null, true)),
      campo('og-nome', 'Nome oficial', f.nome, null, true),
      el('div', { class: 'grade-campos' }, campo('og-sigla', 'Sigla', f.sigla), campo('og-municipio', 'Município', f.municipio, null, true), campo('og-uf', 'UF', f.uf, null, true)),
      campo('og-pai', 'Subsite?', f.pai, 'Subsite: IPREV, fundo ou secretaria com site próprio dentro do site do órgão principal.'),
      campo('og-dominio', 'Domínio oficial', f.dominio, 'Ex.: riachodacruz.rn.gov.br. Até apontar, o site abre pelo endereço provisório com ?orgao=CNPJ.'),
      novo ? el('div', { class: 'grade-campos' }, campo('og-email', 'E-mail institucional', f.email), campo('og-telefone', 'Telefone', f.telefone)) : null,
      novo ? null : el('label', { class: 'checkbox' }, f.ativo, ' Órgão ativo (desativado: o site e o painel deixam de abrir para o órgão)'));
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, novo ? 'Cadastrar' : 'Salvar');
    const dlg = P.abrirDialogo(novo ? 'Cadastrar órgão' : 'Editar órgão', corpo, [
      el('button', { type: 'button', class: 'btn btn-claro', onclick: () => dlg.close() }, 'Cancelar'), btn]);
    btn.addEventListener('click', async () => {
      if (!erroCampo('og-nome', f.nome.value.trim().length >= 5 ? '' : 'Informe o nome oficial.')) return;
      if (!erroCampo('og-cnpj', P.cnpjValido(f.cnpj.value.replace(/\D/g, '')) ? '' : 'CNPJ inválido.')) return;
      if (!erroCampo('og-municipio', f.municipio.value.trim().length >= 2 ? '' : 'Informe o município.')) return;
      if (novo && !erroCampo('og-email', !f.email.value.trim() || P.emailValido(f.email.value.trim()) ? '' : 'E-mail inválido.')) return;
      const dados = { tipo: f.tipo.value, nome: f.nome.value.trim(), sigla: f.sigla.value.trim(), cnpj: f.cnpj.value, municipio: f.municipio.value.trim(),
        uf: f.uf.value, dominio: f.dominio.value.trim(), orgao_pai_id: f.pai.value || null, email: f.email.value.trim(), telefone: f.telefone.value.trim(), ativo: f.ativo.checked };
      ocupado(btn, 'Salvando…');
      try {
        const r = novo ? await sb.rpc('criar_orgao', { p: dados }) : await sb.rpc('alterar_orgao', { p_orgao: o.id, p: dados });
        if (r.error) throw r.error;
        dlg.close();
        toast(novo ? 'Órgão cadastrado, com o menu padrão do site. Abra o órgão para convidar o administrador.' : 'Órgão atualizado.');
        await carregar(); desenhar();
      } catch (e) { toast(traduzirErro(e), true); }
      finally { ocupado(btn); }
    });
  }

  P.telas.orgaos = async function (c) {
    conteiner = c;
    c.replaceChildren(el('h1', null, 'Órgãos da plataforma'), el('p', { class: 'sub' }, 'Carregando…'));
    if (!(P.estado.usuario && P.estado.usuario.suporte_softplus)) {
      c.querySelector('.sub').replaceWith(el('p', { class: 'msg msg-erro' }, 'Só o Suporte SOFT+ cadastra e altera órgãos.'));
      return;
    }
    try { await carregar(); desenhar(); }
    catch (e) { c.querySelector('.sub').textContent = /orgaos_plataforma/.test(e.message || '') ? 'Falta rodar o script 27 no banco.' : traduzirErro(e); }
  };
})();
