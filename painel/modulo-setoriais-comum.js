// =====================================================================
// Peças comuns dos módulos Saúde, Educação e Renúncias (P.setor):
//   secao()      → "Como esta parte aparece no site": dados do portal ou
//                  declaração de que não há dados, mais um texto da seção
//                  (ex.: critérios das creches). O link para sistema externo
//                  fica só em Aparência › Destinos das páginas.
//   formulario() → janela de cadastro montada a partir da lista de campos
//                  (rascunho → publicado quando a tabela tem situação).
//   filhos()     → lista com inclusão/edição dentro da janela (profissionais,
//                  membros, atas, valores por exercício).
//   importar()   → colar da planilha ou enviar CSV e trocar a lista inteira
//                  de uma vez (função importar_lista do banco).
//   documentos() → planos e relatórios (18.1, 19.1) de uma área.
//   conselhos()  → conselhos com composição e atas (18.6, 19.3, 19.4).
// =====================================================================
(function () {
  'use strict';
  const P = window.PNTP;
  const { sb, el, toast, ocupado, erroCampo, campo } = P;
  const LIMITE_MB = 50;
  let seq = 0;

  const opcoes = (obj, atual, vazio) => [vazio ? el('option', { value: '' }, vazio) : null]
    .concat(Object.entries(obj).map(([k, v]) => el('option', { value: k, selected: String(atual) === k }, v))).filter(Boolean);
  const moeda = (v) => v === null || v === undefined || v === '' ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const numBR = (v) => v === null || v === undefined ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  const hoje = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  // Número no padrão brasileiro (1.234,56) ou com ponto decimal (1234.56).
  function lerNumero(t) {
    let s = String(t === null || t === undefined ? '' : t).trim().replace(/\s|R\$/g, '');
    if (!s) return null;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }
  // Data dd/mm/aaaa, dd-mm-aaaa ou aaaa-mm-dd → aaaa-mm-dd (ou NaN se não der).
  function lerData(t) {
    const s = String(t || '').trim();
    if (!s) return null;
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return lerData(m[3] + '/' + m[2] + '/' + m[1]);
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
    if (!m) return NaN;
    const a = m[3].length === 2 ? '20' + m[3] : m[3];
    const d = new Date(Number(a), Number(m[2]) - 1, Number(m[1]), 12);
    // 31/02 "vira" 03/03 no JavaScript: confere se o dia e o mês continuaram os mesmos.
    if (d.getDate() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1) return NaN;
    return a + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  }
  const etiquetaSituacao = (s) => el('span', { class: 'etiqueta etiqueta-' + (s === 'publicado' ? 'publicado' : 'rascunho') }, s === 'publicado' ? 'No ar' : 'Rascunho');
  const linkArquivo = (r) => r.arquivo_url || r.link_externo ? el('a', { href: r.arquivo_url || r.link_externo, target: '_blank', rel: 'noopener' }, r.arquivo_url ? 'PDF' : 'Link') : '—';
  const mostrarErro = (e) => {
    const t = (e && e.message) || '';
    if (/_tipo"?$|documentos_setoriais_tipo/.test(t)) return toast('Esse tipo de documento não é desta área.', true);
    if (/_arquivo|_publicar/.test(t)) return toast('Para publicar, preencha os itens obrigatórios (arquivo ou link, local e horário).', true);
    if (/_anos|_mandato|_vigencia|_inscricoes/.test(t)) return toast('Confira as datas: o fim não pode ser antes do início.', true);
    if (/conselhos_tipo_uk/.test(t)) return toast('Já existe um conselho desse tipo. Use o tipo "Outro conselho" para um segundo.', true);
    if (/saude_medicamentos_uk/.test(t)) return toast('Esse medicamento (com essa apresentação) já está cadastrado.', true);
    if (/saude_estoques_uk/.test(t)) return toast('Esse medicamento já tem estoque nesse local: altere a linha existente.', true);
    if (/renuncias_valores_renuncia_id_exercicio_key/.test(t)) return toast('Esse exercício já tem valores nesta renúncia: altere a linha existente.', true);
    if (/despesas_numero_uk/.test(t)) return toast('Já existe um empenho com esse número neste exercício.', true);
    if (/receitas_uk/.test(t)) return toast('Esse mês já tem lançamento dessa natureza e fonte: altere a linha existente.', true);
    if (/receitas_naturezas_orgao_id_codigo_key/.test(t)) return toast('Esse código já tem descrição: altere a linha existente.', true);
    if (/natureza_codigo_check|codigo_check/.test(t)) return toast('Código da natureza fora do padrão: use os números separados por pontos (ex.: 1.1.1.2.50.0.1 ou 3.3.90.30).', true);
    if (/ordem_cronologica_justificativa/.test(t)) return toast('Pagamento fora da ordem precisa da hipótese legal e da justificativa (mínimo de 20 letras).', true);
    if (/_datas"?$|_datas\b/.test(t)) return toast('Confira as datas: o fim (ou desligamento) não pode ser antes do início.', true);
    if (/Seu perfil|publicad[oa]\. Só quem|não pertence|beneficiários cadastrados|Envie de 1|Informe o exercício|Nenhuma coluna|não fecham|data do movimento|Há movimentos|ficaria menor|não é deste órgão/.test(t)) return toast(t, true);
    toast(P.erroGravacao(e), true);
  };

  // ---------- campos ----------
  // c = { k, r (rótulo), t: text|area|sel|data|int|num|url|doc|bool|arquivo, op, ob, max, aj, ph, linhas }
  // 'arquivo' cuida do par arquivo_url (PDF) + link_externo.
  function montarCampo(c, valor, pre, reg) {
    const id = pre + c.k;
    let input;
    if (c.t === 'area') { input = el('textarea', { rows: c.linhas || 3, maxlength: c.max || 2000, placeholder: c.ph || null }); input.value = valor || ''; }
    else if (c.t === 'sel') input = el('select', null, opcoes(c.op, valor === undefined || valor === null ? (c.vazio ? c.padrao || '' : c.padrao || Object.keys(c.op)[0]) : valor, c.vazio));
    else if (c.t === 'data') input = el('input', { type: 'date', value: valor || '' });
    else if (c.t === 'int') input = el('input', { type: 'number', step: 1, min: c.min, max: c.maxv, value: valor === undefined || valor === null ? (c.padrao !== undefined ? c.padrao : '') : valor });
    else if (c.t === 'num') input = el('input', { type: 'text', inputmode: 'decimal', value: valor === undefined || valor === null ? '' : Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: 2 }), placeholder: c.ph || '0,00' });
    else if (c.t === 'bool') input = el('input', { type: 'checkbox', checked: !!valor });
    else if (c.t === 'doc') { input = P.mascaraDoc(el('input', { type: 'text', maxlength: 18, value: valor ? P.formatarDoc(valor) : '', placeholder: c.ph || 'CPF ou CNPJ' }), c.doc); }
    else if (c.t === 'arquivo') {
      const pdf = el('input', { type: 'file', accept: 'application/pdf' });
      const link = el('input', { type: 'url', value: (reg && reg.link_externo) || '', placeholder: 'https://… (no lugar do PDF)' });
      pdf.id = id + '-pdf'; link.id = id + '-link';
      const atual = reg && reg.arquivo_url ? el('p', { class: 'ajuda' }, 'Arquivo atual: ', el('a', { href: reg.arquivo_url, target: '_blank', rel: 'noopener' }, 'abrir PDF'), ' (envie outro para trocar)') : null;
      const caixa = el('div', { class: 'grade-campos' }, campo(id + '-pdf', c.r || 'PDF', pdf, 'Até ' + LIMITE_MB + ' MB.', c.ob), campo(id + '-link', 'ou link', link));
      return { el: el('div', null, caixa, atual), ler: () => ({ pdf: pdf.files[0] || null, link: link.value.trim() }), inputs: [pdf, link] };
    }
    else input = el('input', { type: c.t === 'url' ? 'url' : 'text', maxlength: c.max || 200, value: valor || '', placeholder: c.ph || null });
    if (c.t === 'bool') {
      input.id = id;
      return { el: el('label', { class: 'check', style: 'display:flex;gap:8px;align-items:center;margin:8px 0' }, input, c.r), input };
    }
    return { el: campo(id, c.r, input, c.aj, c.ob), input };
  }
  // Lê e confere um campo. Devolve { ok, valor }.
  function lerCampo(c, m, pre) {
    const id = pre + c.k, i = m.input;
    let v;
    if (c.t === 'bool') return { ok: true, valor: i.checked };
    if (c.t === 'sel' || c.t === 'data') v = i.value || null;
    else if (c.t === 'int') { v = i.value === '' ? null : parseInt(i.value, 10); if (v !== null && (Number.isNaN(v) || (c.min !== undefined && v < c.min) || (c.maxv !== undefined && v > c.maxv))) return { ok: erroCampo(id, 'Número inválido.') }; }
    else if (c.t === 'num') { v = lerNumero(i.value); if (Number.isNaN(v) || (v !== null && v < 0 && !c.negativo)) return { ok: erroCampo(id, 'Valor inválido. Ex.: 1.234,56') }; }
    else if (c.t === 'doc') { v = i.value.replace(/\D/g, '') || null; const e = P.erroDoc(v || '', c.doc); if (e) return { ok: erroCampo(id, e) }; }
    else { v = i.value.trim() || null; if (v && c.t === 'url' && !P.urlValida(v)) return { ok: erroCampo(id, 'Endereço completo, começando com https://') }; }
    if (v === null && c.padrao !== undefined && (c.t === 'int' || c.t === 'num')) v = c.padrao;   // coluna obrigatória com valor padrão (ex.: ordem)
    if (c.ob && (v === null || v === '')) return { ok: erroCampo(id, c.obMsg || 'Preencha este campo.') };
    if (v && c.minimo && String(v).length < c.minimo) return { ok: erroCampo(id, 'Mínimo de ' + c.minimo + ' caracteres.') };
    erroCampo(id, '');
    return { ok: true, valor: v };
  }
  const linhaCampos = (lista, mapa) => lista.map((x) => Array.isArray(x) ? el('div', { class: 'grade-campos' }, x.map((c) => mapa[c.k].el)) : mapa[x.k].el);

  // ---------- janela de cadastro ----------
  // o = { tabela, modulo, titulo, registro, perm, rascunho, abas: [[id, rótulo, [campos ou [grade]]]],
  //       extras: [[id, rótulo, (reg, travado) => elemento]], validar(dados) → [k, msg] | null,
  //       fixos (colunas fixas na gravação), depois(id, dados, novo), reabrir (aba ao criar), aviso }
  function formulario(o) {
    const r = o.registro || {};
    const editando = !!r.id, publicado = o.rascunho && r.situacao === 'publicado', travado = publicado && !o.perm.publicar;
    const pre = 'sf' + (++seq) + '-';
    const mapa = {}, todos = [];
    for (const [, , lista] of o.abas) for (const x of lista.flat()) { mapa[x.k] = montarCampo(x, r[x.k], pre, r); todos.push(x); }
    const abasJanela = o.abas.map(([id, rot, lista]) => [id, rot, linhaCampos(lista, mapa)])
      .concat((o.extras || []).map(([id, rot, fn]) => editando ? [id, rot, () => fn(r, travado)] : [id, rot, null, 'Salve primeiro para preencher esta parte.']));
    const abas = abasJanela.length > 1 ? P.abas(abasJanela) : el('div', null, abasJanela[0][2]);
    const corpo = el('form', { class: 'form-dialogo', novalidate: true, onsubmit: (e) => e.preventDefault() },
      travado ? el('p', { class: 'msg msg-info' }, 'Este registro está publicado. Só quem tem permissão de publicar pode alterá-lo.') : null,
      o.aviso || null, abas);
    if (travado || !o.perm.editar) for (const i of corpo.querySelectorAll('input, select, textarea')) if (!i.closest('[data-livre]')) i.disabled = true;
    const acoes = [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => dlg.close() }, travado || !o.perm.editar ? 'Fechar' : 'Cancelar')];
    const btnR = el('button', { type: 'button', class: o.rascunho ? 'btn btn-claro' : 'btn btn-primario' }, o.rascunho ? (publicado ? 'Tirar do ar (rascunho)' : 'Salvar rascunho') : 'Salvar');
    const btnP = el('button', { type: 'button', class: 'btn btn-primario' }, publicado ? 'Salvar' : 'Publicar');
    if (!travado && o.perm.editar) {
      if (!o.rascunho || !publicado || o.perm.publicar) acoes.push(btnR);
      if (o.rascunho && o.perm.publicar) acoes.push(btnP);
    }
    const dlg = P.abrirDialogo((editando ? 'Editar ' : 'Incluir ') + o.titulo, corpo, acoes);
    dlg.classList.add('dialogo-largo');

    async function salvar(situacao, btn) {
      const dados = Object.assign({}, o.fixos || {});
      let arq = null;
      for (const c of todos) {
        if (c.t === 'arquivo') {
          const v = mapa[c.k].ler();
          if (!erroCampo(pre + c.k + '-link', v.link && !P.urlValida(v.link) ? 'Endereço completo, começando com https://' : '')) return;
          if (!erroCampo(pre + c.k + '-pdf', v.pdf && (v.pdf.type !== 'application/pdf' || v.pdf.size > LIMITE_MB * 1048576) ? 'Envie um PDF de até ' + LIMITE_MB + ' MB.' : '')) return;
          const tera = v.pdf || v.link || r.arquivo_url;
          if (!erroCampo(pre + c.k + '-pdf', (c.ob || situacao === 'publicado' && c.obPublicar) && !tera ? 'Envie o PDF ou informe o link.' : '')) return;
          arq = v; dados.link_externo = v.link || null;
          continue;
        }
        const x = lerCampo(c, mapa[c.k], pre);
        if (!x.ok) return;
        dados[c.k] = x.valor;
      }
      if (o.validar) { const e = o.validar(dados, situacao); if (e) { erroCampo(pre + e[0], e[1]); return; } }
      if (o.rascunho) dados.situacao = situacao;
      ocupado(btn, 'Salvando…');
      try {
        if (arq && arq.pdf) dados.arquivo_url = await P.enviarArquivo(o.modulo, arq.pdf, 'pdf', 'application/pdf');
        else if (arq && arq.link && r.arquivo_url) dados.arquivo_url = null;   // trocou o PDF pelo link
        const id = await P.gravarRegistro(o.tabela, dados, r.id);
        if (arq && r.arquivo_url && dados.arquivo_url !== undefined && dados.arquivo_url !== r.arquivo_url) P.apagarArquivo(r.arquivo_url);
        dlg.close();
        toast(situacao === 'publicado' ? 'Publicado.' : o.rascunho ? 'Rascunho salvo.' : 'Salvo.');
        if (o.depois) await o.depois(id, dados, !editando);
        if (!editando && o.reabrir) {
          const { data } = await sb.from(o.tabela).select('*').eq('id', id).maybeSingle();
          if (data) formulario(Object.assign({}, o, { registro: data, abaInicial: o.reabrir }));
        }
      } catch (e) { mostrarErro(e); } finally { ocupado(btn); }
    }
    btnR.addEventListener('click', () => salvar(o.rascunho ? 'rascunho' : null, btnR));
    btnP.addEventListener('click', () => salvar('publicado', btnP));
    if (o.abaInicial && abas.ir) abas.ir(o.abaInicial);
    return dlg;
  }

  async function excluir(tabela, r, nome, depois, arquivos) {
    if (!await P.confirmar('Excluir', 'Excluir "' + nome + '"?', 'Excluir', true)) return false;
    const { data, error } = await sb.from(tabela).delete().eq('id', r.id).select('id');
    if (error) { mostrarErro(error); return false; }
    if (!data || !data.length) { toast('Seu perfil não pode excluir este registro.', true); return false; }
    for (const a of [].concat(arquivos || r.arquivo_url || [])) P.apagarArquivo(a);
    toast('Excluído.');
    if (depois) await depois();
    return true;
  }

  // Tabela simples: colunas [[rótulo, fn(linha) → conteúdo, classe]], acoes(linha) → botões.
  function tabela(colunas, linhas, acoes, vazio) {
    if (!linhas.length) return el('p', { class: 'vazio' }, vazio || 'Nada cadastrado ainda.');
    return el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela' },
      el('thead', null, el('tr', null, colunas.map((c) => el('th', { scope: 'col' }, c[0])), acoes ? el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Ações')) : null)),
      el('tbody', null, linhas.map((l) => el('tr', null, colunas.map((c) => el('td', { class: c[2] || null }, c[1](l))), acoes ? el('td', { class: 'acoes' }, acoes(l)) : null)))));
  }
  const botao = (rot, fn, perigo) => el('button', { type: 'button', class: 'btn btn-claro btn-p' + (perigo ? ' btn-texto-perigo' : ''), onclick: fn }, rot);

  // ---------- filhos dentro da janela ----------
  // o = { tabela, pai: [coluna, id], campos: [...], colunas, ordem: [[col, asc]], travado, perm, modulo, rotulo, ajuda, depois }
  function filhos(o) {
    const caixa = el('div', null, el('p', { class: 'vazio' }, 'Carregando…'));
    const pre = 'sk' + (++seq) + '-';
    let editandoId = null;
    async function listar() {
      let q = sb.from(o.tabela).select('*').eq(o.pai[0], o.pai[1]);
      for (const [c, asc] of o.ordem || [['criado_em', true]]) q = q.order(c, { ascending: asc !== false });
      const { data, error } = await q.limit(1000);
      if (error) { caixa.replaceChildren(el('p', { class: 'msg msg-erro' }, P.erroGravacao(error))); return; }
      const linhas = data || [];
      const pode = !o.travado && o.perm.editar;
      const mapa = {};
      for (const c of o.campos.flat()) mapa[c.k] = montarCampo(c, undefined, pre, null);
      const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Adicionar');
      const btnCancelar = el('button', { type: 'button', class: 'btn btn-claro', hidden: true }, 'Cancelar alteração');
      const preencher = (l) => {
        editandoId = l ? l.id : null;
        for (const c of o.campos.flat()) {
          const m = mapa[c.k], v = l ? l[c.k] : undefined;
          if (c.t === 'arquivo') { m.inputs[0].value = ''; m.inputs[1].value = l ? l.link_externo || '' : ''; continue; }
          if (c.t === 'bool') m.input.checked = !!v;
          else if (c.t === 'num') m.input.value = v === null || v === undefined ? '' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
          else if (c.t === 'doc') m.input.value = v ? P.formatarDoc(v) : '';
          else if (c.t === 'sel') m.input.value = v || c.padrao || (c.vazio ? '' : Object.keys(c.op)[0]);
          else if (c.t === 'data') m.input.value = v || (c.hoje && !l ? hoje() : '');
          else m.input.value = v === null || v === undefined ? (c.padrao !== undefined && !l ? c.padrao : '') : v;
        }
        btn.textContent = l ? 'Salvar alteração' : 'Adicionar';
        btnCancelar.hidden = !l;
        if (l) formCaixa.scrollIntoView({ block: 'nearest' });
      };
      btnCancelar.addEventListener('click', () => preencher(null));
      btn.addEventListener('click', async () => {
        const dados = {};
        let arq = null;
        for (const c of o.campos.flat()) {
          if (c.t === 'arquivo') {
            const v = mapa[c.k].ler();
            if (!erroCampo(pre + c.k + '-link', v.link && !P.urlValida(v.link) ? 'Endereço completo, começando com https://' : '')) return;
            const atual = editandoId && (linhas.find((x) => x.id === editandoId) || {}).arquivo_url;
            if (!erroCampo(pre + c.k + '-pdf', !v.pdf && !v.link && !atual ? 'Envie o PDF ou informe o link.' : v.pdf && (v.pdf.type !== 'application/pdf' || v.pdf.size > LIMITE_MB * 1048576) ? 'Envie um PDF de até ' + LIMITE_MB + ' MB.' : '')) return;
            arq = v; dados.link_externo = v.link || null;
            continue;
          }
          const x = lerCampo(c, mapa[c.k], pre);
          if (!x.ok) return;
          dados[c.k] = x.valor;
        }
        if (o.validar) { const e = o.validar(dados); if (e) { erroCampo(pre + e[0], e[1]); return; } }
        ocupado(btn, 'Salvando…');
        try {
          if (arq && arq.pdf) dados.arquivo_url = await P.enviarArquivo(o.modulo, arq.pdf, 'pdf', 'application/pdf');
          let r;
          if (editandoId) r = await sb.from(o.tabela).update(dados).eq('id', editandoId).select('id');
          else r = await sb.from(o.tabela).insert(Object.assign({ [o.pai[0]]: o.pai[1], orgao_id: P.estado.orgao.id }, dados)).select('id');
          if (r.error) throw r.error;
          if (!r.data || !r.data.length) throw P.amigavel('Nada foi gravado: seu perfil não tem permissão.');
          toast(editandoId ? 'Alteração salva.' : 'Incluído.');
          editandoId = null;
          if (o.depois) o.depois();
          await listar();
        } catch (e) { mostrarErro(e); ocupado(btn); }
      });
      const formCaixa = pode ? el('div', { class: 'cartao', style: 'margin-top:12px', 'data-livre': '' }, el('h3', { style: 'margin-top:0' }, 'Incluir ' + (o.rotulo || 'item')),
        linhaCampos(o.campos, mapa), el('div', { style: 'display:flex;gap:8px' }, btn, btnCancelar)) : null;
      caixa.replaceChildren(o.ajuda ? el('p', { class: 'ajuda' }, o.ajuda) : '',
        tabela(o.colunas, linhas, pode ? (l) => [botao('Editar', () => preencher(l)),
          botao('Excluir', () => excluir(o.tabela, l, o.nome ? o.nome(l) : 'item', async () => { if (o.depois) o.depois(); await listar(); }), true)] : null, 'Nenhum item ainda.'),
        formCaixa);
      if (formCaixa) preencher(null);
    }
    listar();
    return caixa;
  }

  // ---------- seção: dados do portal, link externo ou "não há" ----------
  let secoes = { orgao: null, mapa: {} };
  async function carregarSecoes() {
    const [{ data, error }, { data: o }] = await Promise.all([sb.from('secoes_setoriais').select('*').eq('orgao_id', P.estado.orgao.id),
      sb.from('orgaos').select('configuracoes').eq('id', P.estado.orgao.id).maybeSingle()]);
    if (error) throw error;
    secoes = { orgao: P.estado.orgao.id, mapa: Object.fromEntries((data || []).map((s) => [s.secao, s])), destinos: ((o || {}).configuracoes || {}).destinos || {} };
    return secoes.mapa;
  }
  // Link externo da parte (ou da página inteira) definido em Aparência › Destinos das páginas.
  const destinoExterno = (chave) => secoes.destinos[chave] || secoes.destinos[chave.split('_')[0]] || null;
  const secaoAtual = (chave) => secoes.mapa[chave] || {};
  const ROTULO_MODO = { portal: 'dados do portal', link: 'link externo', nao_ha: 'declaração "não há"' };
  // o = { titulo, texto: {rotulo, ajuda, obrigatorio}, naoHa: 'texto da declaração' | false, aoMudar }
  // O link para sistema externo NÃO fica aqui: é definido só em Aparência › Destinos das páginas
  // (mesma chave), para todo direcionamento do site ficar num lugar só.
  function secao(chave, perm, o) {
    o = o || {};
    const s = secaoAtual(chave);
    const pre = 'ss' + (++seq) + '-';
    const ext = destinoExterno(chave);
    const modo = ext ? 'link' : s.sem_ocorrencia ? 'nao_ha' : 'portal';
    const escolha = o.naoHa === false ? null : el('select', { id: pre + 'modo' },
      opcoes({ portal: 'Dados cadastrados aqui no painel', nao_ha: 'Não há dados: o site mostra a declaração com a data' }, s.sem_ocorrencia ? 'nao_ha' : 'portal'));
    const texto = o.texto ? el('textarea', { rows: o.texto.linhas || 4, maxlength: 8000 }) : null;
    if (texto) texto.value = s.texto || '';
    const btn = el('button', { type: 'button', class: 'btn btn-claro' }, 'Salvar');
    btn.addEventListener('click', async () => {
      const naoHa = !!escolha && escolha.value === 'nao_ha';
      if (texto && o.texto.obrigatorio && !ext && !erroCampo(pre + 'texto', !naoHa && texto.value.trim().length < 20 ? 'Escreva o texto (é pedido pelo PNTP).' : '')) return;
      ocupado(btn, 'Salvando…');
      try {
        const reg = { orgao_id: P.estado.orgao.id, secao: chave, sem_ocorrencia: naoHa, texto: texto ? texto.value.trim() || null : s.texto || null };
        const { data, error } = await sb.from('secoes_setoriais').upsert(reg, { onConflict: 'orgao_id,secao' }).select('*');
        if (error) throw error;
        if (!data || !data.length) throw P.amigavel('Nada foi gravado: seu perfil não tem permissão.');
        secoes.mapa[chave] = data[0];
        toast('Seção salva.');
        info.replaceChildren(rodape(data[0]));
        const m = ext ? 'link' : data[0].sem_ocorrencia ? 'nao_ha' : 'portal';
        etiqueta.className = 'etiqueta etiqueta-' + (m === 'portal' ? 'publicado' : 'agendado');
        etiqueta.textContent = ROTULO_MODO[m];
        if (o.aoMudar) o.aoMudar(data[0]);
      } catch (e) { mostrarErro(e); } finally { ocupado(btn); }
    });
    const etiqueta = el('span', { class: 'etiqueta etiqueta-' + (modo === 'portal' ? 'publicado' : 'agendado') }, ROTULO_MODO[modo]);
    const rodape = (x) => x && x.atualizado_em ? 'Última alteração desta seção: ' + P.dataHoraBR(x.atualizado_em) + '.' : '';
    const info = el('span', { class: 'ajuda' }, rodape(s));
    const podeAparencia = P.estado.permissoes.aparencia && P.estado.permissoes.aparencia.ver;
    const linkAparencia = podeAparencia ? el('a', { href: '#/m/aparencia' }, 'Aparência › Destinos das páginas') : 'Aparência › Destinos das páginas';
    const caixa = el('details', { class: 'cartao secao-setorial', open: modo !== 'portal' || (o.texto && o.texto.obrigatorio && !s.texto) ? true : null, style: 'margin-bottom:14px;padding:12px 16px' },
      el('summary', { style: 'cursor:pointer;font-weight:600' }, (o.titulo || 'Como esta parte aparece no site') + ': ', etiqueta),
      el('div', { style: 'margin-top:10px' },
        ext ? el('p', { class: 'msg msg-info' }, 'No site, esta parte leva para o sistema externo ', el('a', { href: ext, target: '_blank', rel: 'noopener' }, ext),
          ', definido em ', linkAparencia, '. Os dados cadastrados aqui ficam guardados, mas não aparecem enquanto o link estiver lá.')
          : el('p', { class: 'ajuda' }, 'Para mandar esta parte para um sistema próprio da Secretaria (regulação, farmácia, matrícula…), informe o link em ', linkAparencia, ' — é o lugar único de todos os direcionamentos do site.'),
        escolha ? campo(pre + 'modo', 'Como publicar', escolha, 'Declaração usada: "' + o.naoHa + '"') : null,
        texto ? campo(pre + 'texto', o.texto.rotulo, texto, o.texto.ajuda, o.texto.obrigatorio) : null,
        (escolha || texto) && perm.editar && !P.estado.alcanceUnidade ? el('div', { style: 'display:flex;gap:12px;align-items:center' }, btn, info) : info));
    if (!perm.editar || P.estado.alcanceUnidade) for (const i of caixa.querySelectorAll('input, select, textarea')) i.disabled = true;
    return caixa;
  }

  // ---------- importação de listas ----------
  // o = { titulo, tabela, colunas: [{k, r, t: text|data|num|int|sel|doc, ob, op: {valor: rótulo}, padrao}],
  //       exercicio, ajuda, substituirTexto, preparar(linhas) → linhas (async, opcional), depois() }
  function importar(o) {
    const pre = 'si' + (++seq) + '-';
    const area = el('textarea', { rows: 10, placeholder: 'Copie as linhas da planilha (Excel, LibreOffice ou o relatório do sistema) e cole aqui.\nColunas, nesta ordem:\n' + o.colunas.map((c) => c.r + (c.ob ? '' : ' (opcional)')).join(' · ') });
    const arquivo = el('input', { type: 'file', accept: '.csv,.txt,text/csv,text/plain' });
    const modo = el('select', null, opcoes({ substituir: o.substituirTexto || 'Substituir a lista atual pela importada', acrescentar: 'Acrescentar à lista atual' }, 'substituir'));
    const resumo = el('div', { role: 'status' });
    arquivo.addEventListener('change', async () => {
      const f = arquivo.files[0]; if (!f) return;
      const buf = await f.arrayBuffer();
      let t = new TextDecoder('utf-8').decode(buf);
      if (t.includes('�')) t = new TextDecoder('windows-1252').decode(buf);   // CSV salvo pelo Excel
      area.value = t.replace(/^﻿/, '');
      conferir();
    });
    // Valor de uma coluna: aceita o código ou o rótulo das opções (sem acento, sem maiúsculas).
    const doSelect = (c, v) => {
      if (v === '') return null;
      const n = P.normalizar(v);
      for (const [k, rot] of Object.entries(c.op)) if (n === k || n === P.normalizar(rot) || P.normalizar(rot).startsWith(n)) return k;
      return undefined;
    };
    let validas = [];
    function conferir() {
      const linhas = area.value.replace(/\r/g, '').split('\n').filter((l) => l.trim());
      const erros = [];
      validas = [];
      linhas.forEach((l, k) => {
        const sep = l.includes('\t') ? '\t' : l.includes(';') ? ';' : ',';
        const cel = l.split(sep).map((x) => x.trim().replace(/^"(.*)"$/, '$1'));
        // Cabeçalho: 1ª linha cujo 1º valor é o rótulo da 1ª coluna.
        if (k === 0 && P.normalizar(cel[0]).startsWith(P.normalizar(o.colunas[0].r).slice(0, 5))) return;
        const reg = {}, falhas = [];
        o.colunas.forEach((c, n) => {
          const v = cel[n] === undefined ? '' : cel[n];
          let x;
          if (c.t === 'data') x = lerData(v);
          else if (c.t === 'num') x = lerNumero(v);
          else if (c.t === 'int') x = v === '' ? null : /^\d+$/.test(v) ? Number(v) : NaN;
          else if (c.t === 'sel') x = doSelect(c, v);
          else if (c.t === 'doc') { x = v.replace(/\D/g, '') || null; if (x && P.erroDoc(x)) x = NaN; }
          else x = v === '' ? null : v.slice(0, c.max || 200);
          if (x === undefined || (typeof x === 'number' && Number.isNaN(x))) { falhas.push(c.r); return; }
          if (x === null && c.ob) { falhas.push(c.r + ' (vazio)'); return; }
          if (x !== null) reg[c.k] = x;
          else if (c.padrao !== undefined) reg[c.k] = c.padrao;
        });
        if (falhas.length) erros.push('Linha ' + (k + 1) + ': ' + falhas.join(', '));
        else validas.push(reg);
      });
      resumo.replaceChildren(
        el('p', { class: 'msg ' + (erros.length ? 'msg-erro' : validas.length ? 'msg-ok' : 'msg-info') },
          validas.length + ' linha(s) pronta(s) para importar' + (erros.length ? '; ' + erros.length + ' com problema (corrija e cole de novo):' : '.')),
        erros.length ? el('ul', { class: 'ajuda' }, erros.slice(0, 12).map((e) => el('li', null, e)), erros.length > 12 ? el('li', null, '… e mais ' + (erros.length - 12)) : null) : '');
      return !erros.length;
    }
    let espera;
    area.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(conferir, 500); });
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Importar');
    const dlg = P.abrirDialogo(o.titulo, el('div', { class: 'form-dialogo' },
      o.ajuda ? el('p', { class: 'ajuda' }, o.ajuda) : null,
      el('p', { class: 'ajuda' }, 'Datas como 31/12/2026; valores como 1.234,56. Pode colar com a linha de títulos: ela é ignorada. Opções aceitas: ',
        o.colunas.filter((c) => c.t === 'sel').map((c) => c.r + ' = ' + Object.values(c.op).join(' / ')).join('; ') || '—', '.'),
      campo(pre + 'arq', 'Arquivo CSV (opcional)', arquivo, 'Separado por ponto e vírgula, como o Excel salva em "CSV".'),
      campo(pre + 'txt', 'Linhas', area), campo(pre + 'modo', 'O que fazer', modo), resumo),
      [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => dlg.close() }, 'Cancelar'), btn]);
    dlg.classList.add('dialogo-largo');
    btn.addEventListener('click', async () => {
      if (!conferir() || !validas.length) { erroCampo(pre + 'txt', validas.length ? 'Corrija as linhas com problema.' : 'Cole pelo menos uma linha.'); return; }
      erroCampo(pre + 'txt', '');
      const substituir = modo.value === 'substituir';
      if (substituir && !await P.confirmar('Substituir a lista', 'A lista atual' + (o.exercicio ? ' de ' + o.exercicio : '') + ' será apagada e trocada por ' + validas.length + ' linha(s). Continuar?', 'Substituir', true)) return;
      ocupado(btn, 'Importando…');
      try {
        const linhas = o.preparar ? await o.preparar(validas) : validas;
        let total = 0;
        for (let k = 0; k < linhas.length || k === 0; k += 2000) {
          const { data, error } = await sb.rpc('importar_lista', { p_orgao: P.estado.orgao.id, p_tabela: o.tabela, p_linhas: linhas.slice(k, k + 2000),
            p_substituir: substituir && k === 0, p_exercicio: o.exercicio || null });
          if (error) throw error;
          total += data || 0;
          if (!linhas.length) break;
        }
        dlg.close();
        toast(total + ' linha(s) importada(s).');
        if (o.depois) await o.depois();
      } catch (e) { mostrarErro(e); } finally { ocupado(btn); }
    });
    return dlg;
  }

  // ---------- planos e relatórios de uma área (18.1 e 19.1) ----------
  // o = { area, modulo, tipos: {código: rótulo}, perm, ajuda, exemplo }
  function documentos(caixa, o) {
    async function listar() {
      const { data, error } = await sb.from('documentos_setoriais').select('*').eq('orgao_id', P.estado.orgao.id).eq('area', o.area)
        .order('exercicio', { ascending: false }).order('data_publicacao', { ascending: false, nullsFirst: false }).limit(500);
      if (error) { caixa.replaceChildren(el('p', { class: 'msg msg-erro' }, P.erroGravacao(error))); return; }
      const docs = data || [];
      const pode = o.perm.editar && !P.estado.alcanceUnidade;
      const abrir = (d) => formulario({ tabela: 'documentos_setoriais', modulo: o.modulo, titulo: 'documento', registro: d, perm: o.perm, rascunho: true,
        fixos: { area: o.area }, depois: listar,
        abas: [['dados', 'Documento', [
          [{ k: 'tipo', r: 'Tipo', t: 'sel', op: Object.assign({}, o.tipos, { outro: 'Outro documento' }), ob: true },
            { k: 'exercicio', r: 'Exercício (ano)', t: 'int', min: 1990, maxv: 2100, ob: true, padrao: new Date().getFullYear() },
            { k: 'exercicio_fim', r: 'Até o ano (planos de vários anos)', t: 'int', min: 1990, maxv: 2100 }],
          { k: 'titulo', r: 'Título', t: 'text', max: 300, ob: true, minimo: 3, ph: o.exemplo },
          [{ k: 'periodo', r: 'Período (opcional)', t: 'text', max: 60, ph: 'Ex.: 1º quadrimestre' }, { k: 'data_publicacao', r: 'Data de publicação', t: 'data' }],
          { k: 'descricao', r: 'Observação (opcional)', t: 'area', max: 2000, ph: 'Ex.: aprovado pela Resolução nº 3/2026 do Conselho' },
          { k: 'arquivo', r: 'PDF', t: 'arquivo', obPublicar: true }]]],
        validar: (d) => d.exercicio_fim && d.exercicio_fim < d.exercicio ? ['exercicio_fim', 'Não pode ser antes do exercício.'] : null });
      caixa.replaceChildren(
        o.ajuda ? el('p', { class: 'ajuda' }, o.ajuda) : '',
        pode ? el('p', null, el('button', { type: 'button', class: 'btn btn-primario', onclick: () => abrir() }, '+ Incluir documento')) : '',
        tabela([['Documento', (d) => [el('strong', null, d.titulo), el('span', { class: 'sub-linha' }, (o.tipos[d.tipo] || 'Outro documento') + (d.periodo ? ' · ' + d.periodo : ''))], 'quebra'],
          ['Exercício', (d) => d.exercicio + (d.exercicio_fim && d.exercicio_fim !== d.exercicio ? '–' + d.exercicio_fim : ''), 'num'],
          ['Publicação', (d) => P.dataBR(d.data_publicacao) || '—', 'num'], ['Arquivo', linkArquivo], ['Situação', (d) => etiquetaSituacao(d.situacao)]], docs,
          (d) => [botao(pode ? 'Editar' : 'Ver', () => abrir(d)), pode && o.perm.excluir ? botao('Excluir', () => excluir('documentos_setoriais', d, d.titulo, listar), true) : null],
          'Nenhum documento cadastrado.'));
    }
    caixa.replaceChildren(el('p', { class: 'vazio' }, 'Carregando…'));
    listar();
    return caixa;
  }

  // ---------- conselhos (composição, funcionamento e atas) ----------
  const TIPOS_CONSELHO = { saude: 'Conselho Municipal de Saúde', fundeb: 'Conselho de Acompanhamento e Controle Social do Fundeb',
    assistencia_social: 'Conselho Municipal de Assistência Social', educacao: 'Conselho Municipal de Educação', alimentacao_escolar: 'Conselho de Alimentação Escolar',
    crianca_adolescente: 'Conselho dos Direitos da Criança e do Adolescente', outro: 'Outro conselho' };
  const FUNCOES = { presidente: 'Presidente', vice_presidente: 'Vice-presidente', secretario: 'Secretário(a)', conselheiro: 'Conselheiro(a)' };
  const DOCS_CONSELHO = { ata: 'Ata de reunião', pauta: 'Pauta / convocação', resolucao: 'Resolução', calendario: 'Calendário de reuniões', regimento: 'Regimento interno',
    parecer: 'Parecer', relatorio: 'Relatório', lei: 'Lei / decreto', outro: 'Outro documento' };
  // o = { tipos: [códigos], obrigatorios: {código: 'critério'}, perm, modulo }
  function conselhos(caixa, o) {
    const opTipos = Object.fromEntries(o.tipos.map((t) => [t, TIPOS_CONSELHO[t]]));
    async function listar() {
      const { data, error } = await sb.from('conselhos').select('*, conselhos_membros(count), conselhos_documentos(count)').eq('orgao_id', P.estado.orgao.id).in('tipo', o.tipos).order('nome');
      if (error) { caixa.replaceChildren(el('p', { class: 'msg msg-erro' }, P.erroGravacao(error))); return; }
      const lista = data || [];
      const pode = o.perm.editar && !P.estado.alcanceUnidade;
      const hojeTxt = hoje();
      const abrir = (c, aba) => formulario({ tabela: 'conselhos', modulo: o.modulo, titulo: 'conselho', registro: c, perm: o.perm, rascunho: true, depois: listar, reabrir: 'membros', abaInicial: aba,
        abas: [['dados', 'Dados e funcionamento', [
          [{ k: 'tipo', r: 'Conselho', t: 'sel', op: opTipos, ob: true }, { k: 'sigla', r: 'Sigla', t: 'text', max: 20, ph: 'Ex.: CMS' }],
          { k: 'nome', r: 'Nome', t: 'text', max: 200, ob: true, minimo: 3, ph: 'Ex.: Conselho Municipal de Saúde de Riacho da Cruz' },
          [{ k: 'norma_criacao', r: 'Lei de criação', t: 'text', max: 300, ph: 'Ex.: Lei nº 512/2021' }, { k: 'norma_url', r: 'Link da lei', t: 'url' }],
          { k: 'competencias', r: 'Competências e funcionamento', t: 'area', max: 4000, linhas: 4, ph: 'Atribuições, como as reuniões funcionam, como participar…' },
          [{ k: 'periodicidade', r: 'Reuniões', t: 'text', max: 200, ph: 'Ex.: mensais, na 1ª terça-feira, às 9h' }, { k: 'local_reunioes', r: 'Local das reuniões', t: 'text', max: 300 }],
          [{ k: 'telefone', r: 'Telefone', t: 'text', max: 60 }, { k: 'email', r: 'E-mail', t: 'text', max: 150 }, { k: 'regimento_url', r: 'Link do regimento interno', t: 'url' }],
          [{ k: 'mandato_inicio', r: 'Mandato atual: início', t: 'data' }, { k: 'mandato_fim', r: 'Mandato atual: fim', t: 'data' }]]]],
        extras: [['membros', 'Composição', (r, travado) => filhos({ tabela: 'conselhos_membros', pai: ['conselho_id', r.id], travado, perm: o.perm, modulo: o.modulo, rotulo: 'membro',
            ordem: [['ordem', true], ['nome', true]], depois: listar, nome: (l) => l.nome,
            ajuda: 'Composição atual: titulares e suplentes, com o segmento e a entidade que cada um representa (PNTP pede composição atualizada).',
            campos: [[{ k: 'nome', r: 'Nome', t: 'text', ob: true, minimo: 3 }, { k: 'funcao', r: 'Função', t: 'sel', op: FUNCOES, padrao: 'conselheiro' }, { k: 'condicao', r: 'Titular/suplente', t: 'sel', op: { titular: 'Titular', suplente: 'Suplente' } }],
              [{ k: 'segmento', r: 'Segmento', t: 'text', max: 150, ph: 'Ex.: usuários, trabalhadores, governo' }, { k: 'entidade', r: 'Entidade que representa', t: 'text', max: 200 }],
              [{ k: 'mandato_inicio', r: 'Mandato: início', t: 'data' }, { k: 'mandato_fim', r: 'Mandato: fim', t: 'data' }, { k: 'ato', r: 'Ato de nomeação', t: 'text', max: 200, ph: 'Ex.: Portaria nº 45/2025' }],
              [{ k: 'ordem', r: 'Ordem na lista', t: 'int', min: 0, maxv: 999, padrao: 0 }]],
            colunas: [['Nome', (l) => [el('strong', null, l.nome), el('span', { class: 'sub-linha' }, FUNCOES[l.funcao] + ' · ' + (l.condicao === 'suplente' ? 'Suplente' : 'Titular'))], 'quebra'],
              ['Representa', (l) => [l.segmento || '—', l.entidade ? el('span', { class: 'sub-linha' }, l.entidade) : null]],
              ['Mandato', (l) => l.mandato_inicio || l.mandato_fim ? (P.dataBR(l.mandato_inicio) || '…') + ' a ' + (P.dataBR(l.mandato_fim) || '…') : '—', 'num']] })],
          ['docs', 'Atas e documentos', (r, travado) => filhos({ tabela: 'conselhos_documentos', pai: ['conselho_id', r.id], travado, perm: o.perm, modulo: o.modulo, rotulo: 'documento',
            ordem: [['data', false]], depois: listar, nome: (l) => l.titulo,
            ajuda: 'Atas, pautas, resoluções e o calendário das reuniões (funcionamento do conselho).',
            campos: [[{ k: 'tipo', r: 'Tipo', t: 'sel', op: DOCS_CONSELHO }, { k: 'data', r: 'Data', t: 'data', ob: true, hoje: true }],
              { k: 'titulo', r: 'Título', t: 'text', ob: true, minimo: 2, ph: 'Ex.: Ata da 3ª reunião ordinária de 2026' }, { k: 'arquivo', r: 'PDF', t: 'arquivo' }],
            colunas: [['Documento', (l) => [el('strong', null, l.titulo), el('span', { class: 'sub-linha' }, DOCS_CONSELHO[l.tipo] || '')], 'quebra'],
              ['Data', (l) => P.dataBR(l.data), 'num'], ['Arquivo', linkArquivo]] })]],
        validar: (d) => d.mandato_inicio && d.mandato_fim && d.mandato_fim < d.mandato_inicio ? ['mandato_fim', 'O fim não pode ser antes do início.'] : null });
      // Faixa dos conselhos que o PNTP pede (ex.: Fundeb e Assistência Social).
      const faltas = Object.entries(o.obrigatorios || {}).map(([t, crit]) => {
        const c = lista.find((x) => x.tipo === t);
        const txt = !c ? 'não cadastrado' : c.situacao !== 'publicado' ? 'em rascunho' : c.mandato_fim && c.mandato_fim < hojeTxt ? 'mandato vencido em ' + P.dataBR(c.mandato_fim) : null;
        return txt ? el('li', null, TIPOS_CONSELHO[t] + ' (' + crit + '): ' + txt + '.') : null;
      }).filter(Boolean);
      caixa.replaceChildren(
        faltas.length ? el('div', { class: 'msg msg-info' }, el('strong', null, 'Para atender o PNTP: '), el('ul', { style: 'margin:4px 0 0 18px' }, faltas)) : '',
        pode ? el('p', null, el('button', { type: 'button', class: 'btn btn-primario', onclick: () => abrir({ tipo: o.tipos.find((t) => !lista.some((x) => x.tipo === t)) || 'outro' }) }, '+ Incluir conselho')) : '',
        tabela([['Conselho', (c) => [el('strong', null, c.nome), el('span', { class: 'sub-linha' }, TIPOS_CONSELHO[c.tipo])], 'quebra'],
          ['Mandato', (c) => c.mandato_inicio || c.mandato_fim ? (P.dataBR(c.mandato_inicio) || '…') + ' a ' + (P.dataBR(c.mandato_fim) || '…') : '—', 'num'],
          ['Membros', (c) => String(((c.conselhos_membros || [])[0] || {}).count || 0), 'num'], ['Documentos', (c) => String(((c.conselhos_documentos || [])[0] || {}).count || 0), 'num'],
          ['Situação', (c) => etiquetaSituacao(c.situacao)]], lista,
          (c) => [botao('Composição', () => abrir(c, 'membros')), botao('Atas', () => abrir(c, 'docs')), pode ? botao('Editar', () => abrir(c)) : null,
            pode && o.perm.excluir ? botao('Excluir', () => excluir('conselhos', c, c.nome, listar), true) : null],
          'Nenhum conselho cadastrado.'));
    }
    caixa.replaceChildren(el('p', { class: 'vazio' }, 'Carregando…'));
    listar();
    return caixa;
  }

  // ---------- lista por exercício (abas de ano + filtros + "Carregar mais") ----------
  // cfg = { tabela, anos: async () => [{ano, total}] (sem = lista sem abas de ano), filtroAno(q, ano),
  //         ordem, crescente, filtros: [{k, r, t: 'busca'|'sel', op, vazio, ph, aplicar(q, v)}],
  //         colunas, acoes(linha) → botões, botoes() → botões do alto, aoTrocarAno(ano) → {k: valor} (async),
  //         rodape(ano) → elemento, vazio, rotuloAno }
  // Devolve { recarregar(manterAno), ano() }.
  function listaAno(caixa, cfg) {
    let anos = [], ano = null, itens = [], fim = false, total = 0, versao = 0;
    const f = {};
    const termoBusca = (v) => /^[\d.\/-]+$/.test(v) ? v.replace(/\D/g, '') : P.normalizar(v).replace(/[%_]/g, '');
    const consulta = (sel, op) => {
      let q = sb.from(cfg.tabela).select(sel, op).eq('orgao_id', P.estado.orgao.id);
      if (cfg.anos && ano !== null) q = cfg.filtroAno ? cfg.filtroAno(q, ano) : q.eq('exercicio', ano);
      for (const x of cfg.filtros || []) {
        const v = f[x.k];
        if (v === undefined || v === null || v === '') continue;
        q = x.aplicar ? x.aplicar(q, v) : x.t === 'busca' ? q.ilike('busca', '%' + termoBusca(v) + '%') : q.eq(x.k, v);
      }
      return q;
    };
    const lista = el('div'), corpo = el('div', null, el('p', { class: 'vazio' }, 'Carregando…'));
    async function carregar(reiniciar) {
      const minha = reiniciar ? ++versao : versao;
      const ultimo = reiniciar ? null : itens[itens.length - 1];
      const [pag, t] = await Promise.all([P.paginar(consulta, cfg.ordem, ultimo, 100, cfg.crescente), reiniciar ? P.contar(consulta) : Promise.resolve(total)]);
      if (minha !== versao) return;
      itens = reiniciar ? pag.linhas : itens.concat(pag.linhas); fim = pag.fim; total = t;
      const btnMais = el('button', { type: 'button', class: 'btn btn-claro' }, 'Carregar mais');
      btnMais.addEventListener('click', async () => { ocupado(btnMais, 'Carregando…'); try { await carregar(false); } catch (e) { mostrarErro(e); ocupado(btnMais); } });
      lista.replaceChildren(tabela(cfg.colunas, itens, cfg.acoes || null, Object.values(f).some(Boolean) ? 'Nenhum registro com esses filtros.' : cfg.vazio || 'Nada cadastrado ainda.'),
        el('div', { class: 'rodape-lista' }, el('span', { class: 'ajuda' }, 'Mostrando ' + itens.length + ' de ' + total), fim ? '' : btnMais));
    }
    function desenhar() {
      const campos = (cfg.filtros || []).map((x) => {
        const e = x.t === 'sel' ? el('select', { 'aria-label': x.r }, opcoes(x.op, f[x.k] || '', x.vazio || x.r + ': todos'))
          : el('input', { type: 'search', placeholder: x.ph || 'Pesquisar', 'aria-label': x.r, value: f[x.k] || '' });
        return [x.k, e];
      });
      const aplicar = () => { for (const [k, e] of campos) f[k] = e.value.trim(); carregar(true).catch(mostrarErro); };
      let espera;
      for (const [, e] of campos) {
        if (e.tagName === 'SELECT') e.addEventListener('change', aplicar);
        else e.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(aplicar, 400); });
      }
      const miolo = el('div', null, campos.length ? el('div', { class: 'filtros' }, campos.map((x) => x[1])) : '', cfg.rodape ? cfg.rodape(ano) : '', lista);
      corpo.replaceChildren(
        cfg.botoes ? el('p', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, cfg.botoes()) : '',
        !cfg.anos ? miolo : anos.length ? el('div', null,
          el('div', { class: 'abas abas-internas', role: 'tablist', 'aria-label': cfg.rotuloAno || 'Exercício' }, anos.map((x) => el('button', { type: 'button', role: 'tab', class: 'aba aba-p',
            'aria-selected': x.ano === ano ? 'true' : 'false', onclick: () => { ano = x.ano; recarregar(true); } }, String(x.ano), el('span', { class: 'aba-qtd' }, String(x.total))))),
          el('div', { class: 'painel-guia painel-guia-interno' }, miolo))
          : el('p', { class: 'vazio' }, cfg.vazio || 'Nada cadastrado ainda.'));
    }
    async function recarregar(manterAno) {
      try {
        if (cfg.anos) {
          anos = (await cfg.anos()) || [];
          if (!manterAno || !anos.some((x) => x.ano === ano)) ano = anos.length ? anos[0].ano : null;
          if (cfg.aoTrocarAno && ano !== null) Object.assign(f, await cfg.aoTrocarAno(ano));
        }
        desenhar();
        if (!cfg.anos || ano !== null) await carregar(true);
      } catch (e) { corpo.replaceChildren(el('p', { class: 'msg msg-erro' }, P.erroGravacao(e))); }
    }
    caixa.append(corpo);
    recarregar();
    return { recarregar, ano: () => ano, irPara: (a) => { ano = a; return recarregar(true); } };
  }
  // Exercícios com dados das tabelas do script 22 (receitas, despesas, pessoal, diárias).
  const anosFinanceiros = (tabela) => async () => {
    const { data, error } = await sb.rpc('anos_financeiros', { p_orgao: P.estado.orgao.id, p_tabela: tabela });
    if (error) throw error;
    return data || [];
  };
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const opMeses = Object.fromEntries(MESES.map((m, i) => [String(i + 1), m[0].toUpperCase() + m.slice(1)]));

  // Cabeçalho padrão dos três módulos.
  const cabecalho = (titulo, sub) => el('div', { class: 'cabecalho-modulo' }, el('div', null, el('h1', null, titulo), el('p', { class: 'sub' }, sub)));
  const avisoSetorial = (perm) => P.estado.alcanceUnidade && perm.editar ? el('p', { class: 'msg msg-info' }, 'Estes dados são do órgão todo: só quem tem acesso ao órgão inteiro altera.') : null;
  const faltaScript = (e) => /secoes_setoriais|documentos_setoriais|Could not find|does not exist/i.test((e && e.message) || '') ? 'Falta rodar o script 21 no banco.' : P.erroGravacao(e);

  P.setor = { opcoes, moeda, numBR, hoje, lerNumero, lerData, etiquetaSituacao, linkArquivo, mostrarErro, formulario, excluir, tabela, botao, filhos,
    carregarSecoes, secaoAtual, secao, importar, documentos, conselhos, cabecalho, avisoSetorial, faltaScript, TIPOS_CONSELHO,
    listaAno, anosFinanceiros, MESES, opMeses };
})();
