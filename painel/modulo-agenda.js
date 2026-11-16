// =====================================================================
// Agenda (0.41.0) — aba "Agenda" de Notícias, banners e avisos.
// Compromissos e eventos do órgão (sessões, reuniões, audiências, eventos…).
// O site mostra a página #/agenda (próximos e anteriores, por mês) e o bloco
// "Agenda" na página inicial com os próximos compromissos.
// =====================================================================
(function () {
  'use strict';
  const P = window.PNTP;
  const { sb, el, toast, ocupado, erroCampo, campo } = P;

  const ANDAMENTO = { prevista: 'Previsto', realizada: 'Realizado', adiada: 'Adiado', cancelada: 'Cancelado' };
  const COR = { prevista: 'agendado', realizada: 'publicado', adiada: 'rascunho', cancelada: 'rascunho' };
  const CATEGORIAS = ['Sessão', 'Reunião', 'Audiência pública', 'Evento', 'Solenidade', 'Visita', 'Capacitação', 'Agenda do gestor'];
  const LOTE = 50;

  let ctx = null;   // { area, perm, alcance }
  let filtro = 'proximos', lista = [], fim = true;
  // Início do dia de hoje: compromisso de hoje ainda aparece em "Próximos".
  const hoje0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };

  const quando = (a) => a.dia_inteiro
    ? P.dataBR(a.inicio) + (a.fim && P.dataBR(a.fim) !== P.dataBR(a.inicio) ? ' a ' + P.dataBR(a.fim) : '') + ' (dia inteiro)'
    : P.dataHoraBR(a.inicio) + (a.fim ? ' às ' + new Date(a.fim).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');

  function consulta() {
    let q = sb.from('agenda').select('*').eq('orgao_id', P.estado.orgao.id);
    q = filtro === 'proximos' ? q.gte('inicio', hoje0()).order('inicio', { ascending: true }) : q.lt('inicio', hoje0()).order('inicio', { ascending: false });
    return q.order('id', { ascending: true });
  }
  async function carregar(reiniciar) {
    const de = reiniciar ? 0 : lista.length;
    const { data, error } = await consulta().range(de, de + LOTE - 1);
    if (error) {
      ctx.area.replaceChildren(el('p', { class: 'msg msg-erro' }, /agenda|does not exist|Could not find/i.test(error.message || '') ? 'Falta rodar o script 44 no banco.' : P.erroGravacao(error)));
      return;
    }
    lista = reiniciar ? data || [] : lista.concat(data || []);
    fim = !data || data.length < LOTE;
    desenhar();
  }
  function desenhar() {
    const pode = ctx.perm.editar && !ctx.alcance;
    const botaoFiltro = (id, rotulo) => el('button', { type: 'button', role: 'tab', class: 'aba', 'aria-selected': filtro === id ? 'true' : 'false',
      onclick: () => { filtro = id; ctx.area.replaceChildren(el('p', { class: 'vazio' }, 'Carregando…')); carregar(true); } }, rotulo);
    const btnMais = el('button', { type: 'button', class: 'btn btn-claro', onclick: async () => { ocupado(btnMais, 'Carregando…'); await carregar(false); } }, 'Carregar mais');
    ctx.area.replaceChildren(
      el('p', { class: 'ajuda' }, 'Sessões, reuniões, audiências e eventos. O site mostra os próximos compromissos na página inicial e todos na página Agenda. Depois que o compromisso acontecer, marque como "Realizado" (ou "Adiado"/"Cancelado"); ele continua no site, entre os anteriores.'),
      el('div', { class: 'abas abas-p', role: 'tablist' }, botaoFiltro('proximos', 'Próximos'), botaoFiltro('anteriores', 'Anteriores')),
      lista.length ? el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela' },
        el('thead', null, el('tr', null, ['Quando', 'Compromisso', 'Andamento', 'Situação'].map((h) => el('th', { scope: 'col' }, h)), el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Ações')))),
        el('tbody', null, lista.map((a) => el('tr', null,
          el('td', { class: 'num' }, quando(a)),
          el('td', { class: 'quebra' }, el('strong', null, a.titulo), a.categoria ? el('span', { class: 'etiqueta', style: 'margin-left:6px' }, a.categoria) : null,
            a.local ? el('span', { class: 'sub-linha' }, a.local) : null),
          el('td', null, el('span', { class: 'etiqueta etiqueta-' + COR[a.andamento] }, ANDAMENTO[a.andamento])),
          el('td', null, el('span', { class: 'etiqueta etiqueta-' + (a.situacao === 'publicado' ? 'publicado' : 'rascunho') }, a.situacao === 'publicado' ? 'No ar' : 'Rascunho')),
          el('td', { class: 'acoes' }, pode ? el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => form(a) }, 'Editar') : null,
            pode ? el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => form(Object.assign({}, a, { id: null, situacao: 'rascunho', andamento: 'prevista' })) }, 'Duplicar') : null,
            pode && ctx.perm.excluir ? el('button', { type: 'button', class: 'btn btn-claro btn-p btn-texto-perigo', onclick: () => excluir(a) }, 'Excluir') : null))))))
        : el('p', { class: 'vazio' }, filtro === 'proximos' ? 'Nenhum compromisso marcado de hoje em diante.' : 'Nenhum compromisso anterior.'),
      fim ? '' : el('div', { class: 'rodape-lista' }, el('span'), btnMais));
  }
  async function excluir(a) {
    if (!await P.confirmar('Excluir compromisso', 'Excluir "' + a.titulo + '" (' + quando(a) + ') da agenda?', 'Excluir', true)) return;
    const { data, error } = await sb.from('agenda').delete().eq('id', a.id).select('id');
    if (error) return toast(P.erroGravacao(error), true);
    if (!data || !data.length) return toast('Seu perfil não pode excluir este compromisso.', true);
    toast('Compromisso excluído.'); carregar(true);
  }
  // Data e hora locais (campos separados) ↔ timestamptz
  const soData = (iso) => (iso ? P.paraDataHoraLocal(iso).slice(0, 10) : '');
  const soHora = (iso) => (iso ? P.paraDataHoraLocal(iso).slice(11, 16) : '');
  const juntar = (d, h) => (d ? new Date(d + 'T' + (h || '00:00') + ':00').toISOString() : null);

  function form(a) {
    a = a || {};
    const lista = el('datalist', { id: 'ag-cats' }, CATEGORIAS.map((c) => el('option', { value: c })));
    const f = {
      titulo: el('input', { type: 'text', maxlength: 200, value: a.titulo || '', placeholder: 'Ex.: Sessão ordinária' }),
      categoria: el('input', { type: 'text', maxlength: 60, value: a.categoria || '', list: 'ag-cats', placeholder: 'Escolha ou escreva' }),
      data: el('input', { type: 'date', value: soData(a.inicio) || new Date().toISOString().slice(0, 10) }),
      hora: el('input', { type: 'time', value: a.dia_inteiro ? '' : soHora(a.inicio) }),
      dataFim: el('input', { type: 'date', value: a.fim ? soData(a.fim) : '' }),
      horaFim: el('input', { type: 'time', value: a.fim && !a.dia_inteiro ? soHora(a.fim) : '' }),
      diaInteiro: el('input', { type: 'checkbox' }),
      local: el('input', { type: 'text', maxlength: 300, value: a.local || '', placeholder: 'Ex.: Plenário da Câmara' }),
      link: el('input', { type: 'url', value: a.link_url || '', placeholder: 'https://… (transmissão, inscrição ou mais informações)' }),
      andamento: el('select', null, Object.entries(ANDAMENTO).map(([v, t]) => el('option', { value: v, selected: (a.andamento || 'prevista') === v }, t))),
      desc: el('textarea', { rows: 4, maxlength: 4000 })
    };
    f.desc.value = a.descricao || ''; f.diaInteiro.checked = !!a.dia_inteiro;
    const horas = () => { f.hora.disabled = f.horaFim.disabled = f.diaInteiro.checked; if (f.diaInteiro.checked) f.hora.value = f.horaFim.value = ''; };
    f.diaInteiro.addEventListener('change', horas); horas();
    const publicado = a.situacao === 'publicado', travado = publicado && !ctx.perm.publicar;
    const btnR = el('button', { type: 'button', class: 'btn btn-claro' }, publicado ? 'Tirar do ar (rascunho)' : 'Salvar rascunho');
    const btnP = el('button', { type: 'button', class: 'btn btn-primario' }, publicado ? 'Salvar' : 'Publicar');
    const acoes = [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => dlg.close() }, 'Cancelar')];
    if (!travado) { if (!publicado || ctx.perm.publicar) acoes.push(btnR); if (ctx.perm.publicar) acoes.push(btnP); }
    const dlg = P.abrirDialogo(a.id ? 'Editar compromisso' : 'Novo compromisso', el('form', { class: 'form-dialogo', novalidate: true }, lista,
      campo('ag-tit', 'Compromisso', f.titulo, null, true),
      el('div', { class: 'grade-campos' }, campo('ag-cat', 'Tipo', f.categoria), campo('ag-and', 'Andamento', f.andamento)),
      el('div', { class: 'grade-campos' }, campo('ag-data', 'Data', f.data, null, true), campo('ag-hora', 'Hora', f.hora, 'Em branco: sem hora definida.')),
      el('label', { class: 'checkbox' }, f.diaInteiro, ' Dia inteiro (sem horário)'),
      el('div', { class: 'grade-campos' }, campo('ag-dfim', 'Termina em (opcional)', f.dataFim, 'Para eventos de mais de um dia.'), campo('ag-hfim', 'Hora do fim (opcional)', f.horaFim)),
      campo('ag-local', 'Local', f.local), campo('ag-link', 'Link (opcional)', f.link),
      campo('ag-desc', 'Descrição (opcional)', f.desc, 'Pauta, quem participa, como acompanhar…')), acoes);
    async function salvar(situacao, btn) {
      if (!erroCampo('ag-tit', f.titulo.value.trim().length >= 3 ? '' : 'Informe o compromisso.')) return;
      if (!erroCampo('ag-data', f.data.value ? '' : 'Informe a data.')) return;
      if (!erroCampo('ag-link', !f.link.value.trim() || P.urlValida(f.link.value.trim()) ? '' : 'Endereço completo, começando com https://')) return;
      const diaInteiro = f.diaInteiro.checked;
      const inicio = juntar(f.data.value, diaInteiro ? null : f.hora.value);
      const fimD = f.dataFim.value || (f.horaFim.value ? f.data.value : '');
      const fimTs = fimD ? juntar(fimD, diaInteiro ? '23:59' : (f.horaFim.value || '23:59')) : null;
      if (!erroCampo('ag-dfim', !fimTs || fimTs >= inicio ? '' : 'O fim não pode ser antes do início.')) return;
      ocupado(btn, 'Salvando…');
      try {
        await P.gravarRegistro('agenda', { titulo: f.titulo.value.trim(), categoria: f.categoria.value.trim() || null, inicio, fim: fimTs, dia_inteiro: diaInteiro,
          local: f.local.value.trim() || null, link_url: f.link.value.trim() || null, andamento: f.andamento.value, descricao: f.desc.value.trim() || null, situacao }, a.id);
        dlg.close(); toast(situacao === 'publicado' ? 'Publicado.' : 'Rascunho salvo.'); carregar(true);
      } catch (e) { toast(P.erroGravacao(e), true); } finally { ocupado(btn); }
    }
    btnR.addEventListener('click', () => salvar('rascunho', btnR));
    btnP.addEventListener('click', () => salvar('publicado', btnP));
  }

  P.agenda = {
    tela(area, perm, alcance) { ctx = { area, perm, alcance }; area.replaceChildren(el('p', { class: 'vazio' }, 'Carregando…')); carregar(true); },
    novo() { form(); }
  };
})();
