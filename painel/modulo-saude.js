// =====================================================================
// Módulo "Saúde" — PNTP 18.1 a 18.6 (matriz do Poder Executivo).
//   18.1 plano de saúde, programação anual e relatório de gestão;
//   18.2 estabelecimentos: local, horários, especialidades e profissionais;
//   18.3 lista de espera da regulação (consultas, exames e cirurgias);
//   18.4 medicamentos do SUS e como obtê-los (inclusive alto custo);
//   18.5 estoque das farmácias públicas;
//   18.6 composição e funcionamento do Conselho de Saúde.
// Partes com link externo (Aparência › Destinos das páginas) ficam com a aba
// desativada; as demais têm, quando cabe, a declaração "não há dados".
// =====================================================================
(function () {
  'use strict';
  const P = window.PNTP;
  const S = P.setor;
  const { sb, el, toast, ocupado } = P;
  const TIPOS_DOC = { plano_saude: 'Plano Municipal de Saúde', programacao_anual: 'Programação Anual de Saúde (PAS)',
    relatorio_gestao: 'Relatório Anual de Gestão (RAG)', relatorio_quadrimestral: 'Relatório Detalhado do Quadrimestre (RDQA)' };
  const TIPOS_ESTAB = { ubs: 'Unidade Básica de Saúde (UBS/ESF)', hospital: 'Hospital', upa: 'UPA / pronto atendimento', caps: 'CAPS',
    policlinica: 'Policlínica', centro_especialidades: 'Centro de especialidades', laboratorio: 'Laboratório', farmacia: 'Farmácia',
    vigilancia: 'Vigilância em saúde', academia_saude: 'Academia da Saúde', samu: 'SAMU / transporte', outro: 'Outro' };
  const TIPOS_ESPERA = { consulta: 'Consulta', exame: 'Exame', cirurgia: 'Cirurgia', procedimento: 'Outro procedimento' };
  const PRIORIDADES = { emergencia: 'Emergência', urgencia: 'Urgência', prioritario: 'Prioritário', eletivo: 'Eletivo' };
  const SIT_ESPERA = { aguardando: 'Aguardando', agendado: 'Agendado', realizado: 'Realizado', cancelado: 'Cancelado' };
  const COR_ESPERA = { aguardando: 'agendado', agendado: 'publicado', realizado: 'rascunho', cancelado: 'desativado' };
  const COMPONENTES = { basico: 'Básico (farmácia da unidade)', estrategico: 'Estratégico', especializado: 'Especializado (alto custo)', hospitalar: 'Hospitalar', municipal: 'Relação municipal (REMUME)' };
  let perm = {}, conteiner = null;
  const org = () => P.estado.orgao.id;
  const pode = () => perm.editar && !P.estado.alcanceUnidade;

  // ---------- 18.2 estabelecimentos e profissionais ----------
  function estabelecimentos(caixa) {
    async function listar() {
      const { data, error } = await sb.from('saude_estabelecimentos').select('*, saude_profissionais(count)').eq('orgao_id', org()).order('ordem').order('nome').limit(500);
      if (error) { caixa.replaceChildren(el('p', { class: 'msg msg-erro' }, P.erroGravacao(error))); return; }
      const lista = data || [];
      const abrir = (e, aba) => S.formulario({ tabela: 'saude_estabelecimentos', modulo: 'saude', titulo: 'estabelecimento', registro: e, perm, rascunho: true,
        depois: listar, reabrir: 'prof', abaInicial: aba,
        abas: [['dados', 'Local e horário', [
          [{ k: 'nome', r: 'Nome', t: 'text', ob: true, minimo: 3, ph: 'Ex.: UBS Maria de Lourdes (ESF Centro)' }, { k: 'tipo', r: 'Tipo', t: 'sel', op: TIPOS_ESTAB }],
          [{ k: 'endereco', r: 'Endereço', t: 'text', max: 300, aj: 'Obrigatório para publicar (PNTP 18.2: local).' }, { k: 'bairro', r: 'Bairro / localidade', t: 'text', max: 100 }],
          [{ k: 'horario', r: 'Dias e horário de atendimento', t: 'text', max: 300, ph: 'Ex.: segunda a sexta, 7h às 11h e 13h às 17h', aj: 'Obrigatório para publicar.' },
            { k: 'cnes', r: 'CNES', t: 'text', max: 7, ph: '7 números' }],
          [{ k: 'telefone', r: 'Telefone', t: 'text', max: 60 }, { k: 'email', r: 'E-mail', t: 'text', max: 150 }, { k: 'ordem', r: 'Ordem na lista', t: 'int', min: 0, maxv: 999, padrao: 0 }],
          { k: 'especialidades', r: 'Especialidades atendidas', t: 'area', max: 1500, linhas: 2, ph: 'Ex.: clínica geral, pediatria, odontologia, enfermagem' },
          { k: 'servicos', r: 'Serviços oferecidos', t: 'area', max: 3000, linhas: 3, ph: 'Ex.: consultas, vacinação, curativos, pré-natal, coleta de exames' }]]],
        extras: [['prof', 'Profissionais', (r, travado) => S.filhos({ tabela: 'saude_profissionais', pai: ['estabelecimento_id', r.id], travado, perm, modulo: 'saude', rotulo: 'profissional',
          ordem: [['especialidade', true], ['nome', true]], depois: listar, nome: (l) => l.nome,
          ajuda: 'Quem atende, em que especialidade e em quais dias e horários (PNTP 18.2).',
          campos: [[{ k: 'nome', r: 'Nome', t: 'text', ob: true, minimo: 3 }, { k: 'especialidade', r: 'Especialidade / função', t: 'text', max: 120, ob: true, minimo: 2, ph: 'Ex.: Médico clínico geral' }],
            [{ k: 'registro', r: 'Registro profissional', t: 'text', max: 40, ph: 'Ex.: CRM-RN 1234' }, { k: 'horario', r: 'Dias e horário', t: 'text', max: 300, ph: 'Ex.: terças e quintas, 7h às 11h' }]],
          colunas: [['Profissional', (l) => [el('strong', null, l.nome), el('span', { class: 'sub-linha' }, l.especialidade + (l.registro ? ' · ' + l.registro : ''))], 'quebra'],
            ['Dias e horário', (l) => l.horario || '—']] })]],
        validar: (d) => d.cnes && !/^\d{7}$/.test(d.cnes) ? ['cnes', 'O CNES tem 7 números.'] : null });
      caixa.replaceChildren(
        pode() ? el('p', null, el('button', { type: 'button', class: 'btn btn-primario', onclick: () => abrir() }, '+ Incluir estabelecimento')) : '',
        S.tabela([['Estabelecimento', (e) => [el('strong', null, e.nome), el('span', { class: 'sub-linha' }, TIPOS_ESTAB[e.tipo] + (e.bairro ? ' · ' + e.bairro : ''))], 'quebra'],
          ['Horário', (e) => e.horario || el('span', { class: 'etiqueta etiqueta-pendente' }, 'falta')],
          ['Profissionais', (e) => String(((e.saude_profissionais || [])[0] || {}).count || 0), 'num'], ['Situação', (e) => S.etiquetaSituacao(e.situacao)]], lista,
          (e) => [S.botao('Profissionais', () => abrir(e, 'prof')), S.botao(pode() ? 'Editar' : 'Ver', () => abrir(e)),
            pode() && perm.excluir ? S.botao('Excluir', () => S.excluir('saude_estabelecimentos', e, e.nome, listar), true) : null],
          'Nenhum estabelecimento cadastrado.'));
    }
    caixa.replaceChildren(el('p', { class: 'vazio' }, 'Carregando…'));
    listar();
    return caixa;
  }

  // ---------- 18.3 lista de espera da regulação ----------
  const CAMPOS_ESPERA = [
    [{ k: 'protocolo', r: 'Protocolo / código', t: 'text', max: 40, ob: true, aj: 'Identificação sem o nome do paciente (LGPD).' }, { k: 'tipo', r: 'Tipo', t: 'sel', op: TIPOS_ESPERA },
      { k: 'prioridade', r: 'Prioridade', t: 'sel', op: PRIORIDADES, padrao: 'eletivo' }],
    [{ k: 'procedimento', r: 'Procedimento', t: 'text', max: 200, ob: true, minimo: 2, ph: 'Ex.: Ultrassonografia de abdome total' }, { k: 'especialidade', r: 'Especialidade', t: 'text', max: 120 }],
    [{ k: 'data_solicitacao', r: 'Data da solicitação', t: 'data', ob: true }, { k: 'unidade_solicitante', r: 'Unidade que pediu', t: 'text', max: 150 },
      { k: 'situacao_espera', r: 'Situação', t: 'sel', op: SIT_ESPERA }],
    [{ k: 'data_agendamento', r: 'Data agendada', t: 'data' }, { k: 'local_atendimento', r: 'Local do atendimento', t: 'text', max: 200 }],
    { k: 'observacao', r: 'Observação', t: 'text', max: 300 }];
  const COLUNAS_IMPORT_ESPERA = [
    { k: 'protocolo', r: 'Protocolo', t: 'text', ob: true, max: 40 }, { k: 'tipo', r: 'Tipo', t: 'sel', op: TIPOS_ESPERA, ob: true },
    { k: 'procedimento', r: 'Procedimento', t: 'text', ob: true }, { k: 'especialidade', r: 'Especialidade', t: 'text', max: 120 },
    { k: 'data_solicitacao', r: 'Data da solicitação', t: 'data', ob: true }, { k: 'prioridade', r: 'Prioridade', t: 'sel', op: PRIORIDADES },
    { k: 'situacao_espera', r: 'Situação', t: 'sel', op: SIT_ESPERA }, { k: 'data_agendamento', r: 'Data agendada', t: 'data' },
    { k: 'unidade_solicitante', r: 'Unidade que pediu', t: 'text', max: 150 }, { k: 'local_atendimento', r: 'Local', t: 'text' }];

  function listaEspera(caixa) {
    const f = { busca: '', tipo: '', situacao_espera: 'aguardando', prioridade: '' };
    let itens = [], fim = false, total = 0;
    const consulta = (sel, op) => {
      let q = sb.from('saude_lista_espera_posicoes').select(sel, op).eq('orgao_id', org());
      if (f.busca) q = q.ilike('busca', '%' + P.normalizar(f.busca).replace(/[%_]/g, '') + '%');
      for (const k of ['tipo', 'situacao_espera', 'prioridade']) if (f[k]) q = q.eq(k, f[k]);
      return q;
    };
    const lista = el('div'), resumo = el('p', { class: 'ajuda' });
    async function carregar(reiniciar) {
      const ultimo = reiniciar ? null : itens[itens.length - 1];
      const [pag, t] = await Promise.all([P.paginar(consulta, 'data_solicitacao', ultimo, 100, true), reiniciar ? P.contar(consulta) : Promise.resolve(total)]);
      itens = reiniciar ? pag.linhas : itens.concat(pag.linhas); fim = pag.fim; total = t;
      desenhar();
    }
    const abrir = (r) => S.formulario({ tabela: 'saude_lista_espera', modulo: 'saude', titulo: 'pedido na lista de espera', registro: r, perm, depois: () => carregar(true).then(resumir),
      abas: [['dados', 'Pedido', CAMPOS_ESPERA]] });
    function desenhar() {
      const btnMais = el('button', { type: 'button', class: 'btn btn-claro' }, 'Carregar mais');
      btnMais.addEventListener('click', async () => { ocupado(btnMais, 'Carregando…'); try { await carregar(false); } catch (e) { S.mostrarErro(e); ocupado(btnMais); } });
      lista.replaceChildren(S.tabela([
        ['Posição', (r) => r.posicao ? r.posicao + 'º' : '—', 'num'],
        ['Protocolo', (r) => el('strong', null, r.protocolo)],
        ['Procedimento', (r) => [r.procedimento, el('span', { class: 'sub-linha' }, TIPOS_ESPERA[r.tipo] + (r.especialidade ? ' · ' + r.especialidade : ''))], 'quebra'],
        ['Solicitado em', (r) => P.dataBR(r.data_solicitacao), 'num'], ['Prioridade', (r) => PRIORIDADES[r.prioridade]],
        ['Situação', (r) => [el('span', { class: 'etiqueta etiqueta-' + COR_ESPERA[r.situacao_espera] }, SIT_ESPERA[r.situacao_espera]), r.data_agendamento ? el('span', { class: 'sub-linha' }, P.dataBR(r.data_agendamento)) : null]]],
      itens, pode() ? (r) => [S.botao('Editar', () => abrir(r)), S.botao('Excluir', () => S.excluir('saude_lista_espera', r, 'protocolo ' + r.protocolo, () => carregar(true).then(resumir)), true)] : null,
      'Nenhum pedido com esses filtros.'),
      el('div', { class: 'rodape-lista' }, el('span', { class: 'ajuda' }, 'Mostrando ' + itens.length + ' de ' + total), fim ? '' : btnMais));
    }
    async function resumir() {
      const { data } = await sb.from('saude_lista_espera').select('atualizado_em').eq('orgao_id', org()).order('atualizado_em', { ascending: false }).limit(1);
      const u = (data || [])[0];
      resumo.replaceChildren(u ? 'Última atualização da lista: ' + P.dataHoraBR(u.atualizado_em) + '. O PNTP pede a lista atualizada (até 30 dias).' : 'Nenhum pedido cadastrado ainda.');
    }
    const fBusca = el('input', { type: 'search', placeholder: 'Protocolo, procedimento, especialidade', 'aria-label': 'Buscar' });
    const fTipo = el('select', { 'aria-label': 'Tipo' }, S.opcoes(TIPOS_ESPERA, '', 'Tipo: todos'));
    const fSit = el('select', { 'aria-label': 'Situação' }, S.opcoes(SIT_ESPERA, 'aguardando', 'Situação: todas'));
    const fPri = el('select', { 'aria-label': 'Prioridade' }, S.opcoes(PRIORIDADES, '', 'Prioridade: todas'));
    const aplicar = () => { Object.assign(f, { busca: fBusca.value.trim(), tipo: fTipo.value, situacao_espera: fSit.value, prioridade: fPri.value }); carregar(true).catch(S.mostrarErro); };
    [fTipo, fSit, fPri].forEach((x) => x.addEventListener('change', aplicar));
    let espera; fBusca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(aplicar, 400); });
    const importar = () => S.importar({ titulo: 'Importar lista de espera da regulação', tabela: 'saude_lista_espera', colunas: COLUNAS_IMPORT_ESPERA,
      ajuda: 'Use o relatório do sistema de regulação (SISREG, sistema estadual ou próprio). Nunca inclua o nome do paciente: use o protocolo ou o código da solicitação.',
      depois: () => carregar(true).then(resumir) });
    caixa.replaceChildren(
      S.secao('saude_espera', perm, { naoHa: 'Não há pacientes aguardando consultas, exames ou cirurgias na regulação municipal.' }),
      resumo,
      pode() ? el('p', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, el('button', { type: 'button', class: 'btn btn-primario', onclick: importar }, 'Importar lista (colar ou CSV)'),
        el('button', { type: 'button', class: 'btn btn-claro', onclick: () => abrir() }, '+ Incluir um pedido')) : '',
      el('p', { class: 'ajuda' }, 'A posição é calculada por procedimento: primeiro a prioridade (emergência, urgência, prioritário, eletivo), depois a data da solicitação.'),
      el('div', { class: 'filtros' }, fBusca, fTipo, fSit, fPri), lista);
    carregar(true).catch(S.mostrarErro);
    resumir();
    return caixa;
  }

  // ---------- 18.4 medicamentos e 18.5 estoque ----------
  const CAMPOS_MED = [
    [{ k: 'nome', r: 'Medicamento', t: 'text', ob: true, minimo: 2, ph: 'Ex.: Losartana potássica' }, { k: 'apresentacao', r: 'Apresentação', t: 'text', ph: 'Ex.: 50 mg, comprimido' }],
    [{ k: 'componente', r: 'Componente', t: 'sel', op: COMPONENTES }, { k: 'onde_obter', r: 'Onde obter', t: 'text', max: 300, ph: 'Ex.: Farmácia Básica, Rua A, 10' }],
    { k: 'como_obter', r: 'Como obter', t: 'area', max: 1500, linhas: 2, ph: 'Ex.: receita do SUS, cartão do SUS e documento com foto. Alto custo: processo pela Unidade de Farmácia do Estado.' }];

  function medicamentos(caixa) {
    let busca = '', comp = '';
    const lista = el('div');
    async function listar() {
      let q = sb.from('saude_medicamentos').select('*').eq('orgao_id', org()).order('nome').order('apresentacao').limit(2000);
      if (busca) q = q.ilike('busca', '%' + P.normalizar(busca).replace(/[%_]/g, '') + '%');
      if (comp) q = q.eq('componente', comp);
      const { data, error } = await q;
      if (error) return S.mostrarErro(error);
      const meds = data || [];
      lista.replaceChildren(el('p', { class: 'ajuda' }, meds.length + ' medicamento(s)' + (meds.length === 2000 ? ' (mostrando os 2.000 primeiros; use a pesquisa)' : '') + '.'),
        S.tabela([['Medicamento', (m) => [el('strong', null, m.nome), m.apresentacao ? el('span', { class: 'sub-linha' }, m.apresentacao) : null], 'quebra'],
          ['Componente', (m) => COMPONENTES[m.componente]], ['Onde obter', (m) => m.onde_obter || '—']], meds,
          pode() ? (m) => [S.botao('Editar', () => abrir(m)), perm.excluir ? S.botao('Excluir', () => S.excluir('saude_medicamentos', m, m.nome + (m.apresentacao ? ' ' + m.apresentacao : '') + ' (e o estoque dele)', listar), true) : null] : null,
          'Nenhum medicamento com esses filtros.'));
    }
    const abrir = (m) => S.formulario({ tabela: 'saude_medicamentos', modulo: 'saude', titulo: 'medicamento', registro: m, perm, depois: listar, abas: [['dados', 'Medicamento', CAMPOS_MED]] });
    // Lista colada: inclui só o que ainda não existe (mesmo nome e apresentação).
    const importar = () => {
      const area = el('textarea', { rows: 10, placeholder: 'Uma linha por medicamento. Colunas: nome · apresentação · componente (básico, estratégico, especializado…) · onde obter' });
      const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Incluir');
      const dlg = P.abrirDialogo('Incluir vários medicamentos', el('div', { class: 'form-dialogo' },
        el('p', { class: 'ajuda' }, 'Cole a relação (REMUME ou a lista da farmácia). Os que já estão cadastrados com o mesmo nome e apresentação são ignorados.'),
        P.campo('med-colar', 'Linhas', area)), [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => dlg.close() }, 'Cancelar'), btn]);
      dlg.classList.add('dialogo-largo');
      btn.addEventListener('click', async () => {
        const novos = [], vistos = new Set();
        const { data: atuais } = await sb.from('saude_medicamentos').select('nome, apresentacao').eq('orgao_id', org()).limit(5000);
        for (const a of atuais || []) vistos.add(P.normalizar(a.nome) + '|' + P.normalizar(a.apresentacao || ''));
        for (const l of area.value.replace(/\r/g, '').split('\n')) {
          if (!l.trim()) continue;
          const c = l.split(l.includes('\t') ? '\t' : ';').map((x) => x.trim());
          if (!c[0] || c[0].length < 2 || /^medicamento|^nome/i.test(c[0])) continue;
          const chave = P.normalizar(c[0]) + '|' + P.normalizar(c[1] || '');
          if (vistos.has(chave)) continue;
          vistos.add(chave);
          const cp = Object.keys(COMPONENTES).find((k) => c[2] && (P.normalizar(c[2]).startsWith(k.slice(0, 5)) || P.normalizar(COMPONENTES[k]).startsWith(P.normalizar(c[2])))) || 'basico';
          novos.push({ orgao_id: org(), nome: c[0].slice(0, 200), apresentacao: (c[1] || '').slice(0, 200) || null, componente: cp, onde_obter: (c[3] || '').slice(0, 300) || null });
        }
        if (!P.erroCampo('med-colar', novos.length ? '' : 'Nenhum medicamento novo nas linhas coladas.')) return;
        ocupado(btn, 'Incluindo…');
        try {
          for (let k = 0; k < novos.length; k += 500) { const { error } = await sb.from('saude_medicamentos').insert(novos.slice(k, k + 500)); if (error) throw error; }
          dlg.close(); toast(novos.length + ' medicamento(s) incluído(s).'); listar();
        } catch (e) { S.mostrarErro(e); ocupado(btn); }
      });
    };
    const fBusca = el('input', { type: 'search', placeholder: 'Nome ou apresentação', 'aria-label': 'Buscar' });
    const fComp = el('select', { 'aria-label': 'Componente' }, S.opcoes(COMPONENTES, '', 'Componente: todos'));
    let espera; fBusca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(() => { busca = fBusca.value.trim(); listar(); }, 400); });
    fComp.addEventListener('change', () => { comp = fComp.value; listar(); });
    caixa.replaceChildren(
      S.secao('saude_medicamentos', perm, { naoHa: false, texto: { rotulo: 'Como obter os medicamentos (orientações gerais)', linhas: 4,
        ajuda: 'Aparece no alto da página: documentos e receita exigidos, horário da farmácia e como pedir os de alto custo (componente especializado).' } }),
      pode() ? el('p', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, el('button', { type: 'button', class: 'btn btn-primario', onclick: () => abrir() }, '+ Incluir medicamento'),
        el('button', { type: 'button', class: 'btn btn-claro', onclick: importar }, 'Colar vários')) : '',
      el('div', { class: 'filtros' }, fBusca, fComp), lista);
    listar();
    return caixa;
  }

  const COLUNAS_IMPORT_ESTOQUE = [
    { k: 'nome', r: 'Medicamento', t: 'text', ob: true }, { k: 'apresentacao', r: 'Apresentação', t: 'text' },
    { k: 'local', r: 'Farmácia / local', t: 'text', ob: true, max: 150 }, { k: 'quantidade', r: 'Quantidade', t: 'num', ob: true },
    { k: 'unidade', r: 'Unidade', t: 'text', max: 30 }, { k: 'posicao_em', r: 'Data da contagem', t: 'data' }];

  function estoque(caixa) {
    let busca = '';
    const lista = el('div'), resumo = el('p', { class: 'ajuda' });
    async function listar() {
      let q = sb.from('saude_estoques').select('*, saude_medicamentos!inner(nome, apresentacao, busca)').eq('orgao_id', org()).order('local').limit(3000);
      if (busca) q = q.ilike('saude_medicamentos.busca', '%' + P.normalizar(busca).replace(/[%_]/g, '') + '%');
      const { data, error } = await q;
      if (error) return S.mostrarErro(error);
      const linhas = (data || []).sort((a, b) => P.ordemAlfabetica(a.saude_medicamentos.nome, b.saude_medicamentos.nome) || P.ordemAlfabetica(a.local, b.local));
      const pos = linhas.map((x) => x.posicao_em).sort();
      resumo.replaceChildren(linhas.length ? 'Posição do estoque: ' + (pos[0] === pos[pos.length - 1] ? P.dataBR(pos[0]) : 'de ' + P.dataBR(pos[0]) + ' a ' + P.dataBR(pos[pos.length - 1])) + '. O PNTP pede o estoque atualizado (até 30 dias): importe a contagem nova sempre que fechar o mês.' : 'Nenhum estoque informado ainda.');
      lista.replaceChildren(S.tabela([['Medicamento', (e) => [el('strong', null, e.saude_medicamentos.nome), e.saude_medicamentos.apresentacao ? el('span', { class: 'sub-linha' }, e.saude_medicamentos.apresentacao) : null], 'quebra'],
        ['Local', (e) => e.local], ['Quantidade', (e) => S.numBR(e.quantidade) + (e.unidade ? ' ' + e.unidade : ''), 'num'], ['Posição em', (e) => P.dataBR(e.posicao_em), 'num']], linhas,
        pode() ? (e) => [S.botao('Editar', () => abrir(e)), S.botao('Excluir', () => S.excluir('saude_estoques', e, e.saude_medicamentos.nome + ' em ' + e.local, listar), true)] : null,
        'Nenhum estoque com esses filtros.'));
    }
    const abrir = (e) => S.formulario({ tabela: 'saude_estoques', modulo: 'saude', titulo: 'estoque — ' + e.saude_medicamentos.nome, registro: e, perm, depois: listar,
      abas: [['dados', 'Estoque', [[{ k: 'local', r: 'Farmácia / local', t: 'text', max: 150, ob: true }, { k: 'quantidade', r: 'Quantidade', t: 'num', ob: true },
        { k: 'unidade', r: 'Unidade', t: 'text', max: 30 }, { k: 'posicao_em', r: 'Data da contagem', t: 'data', ob: true }]]]] });
    // Importação: casa cada linha com o medicamento (nome + apresentação); o que não existe é cadastrado antes.
    const preparar = async (linhas) => {
      const { data } = await sb.from('saude_medicamentos').select('id, nome, apresentacao').eq('orgao_id', org()).limit(10000);
      const chave = (n, a) => P.normalizar(n) + '|' + P.normalizar(a || '');
      const mapa = new Map((data || []).map((m) => [chave(m.nome, m.apresentacao), m.id]));
      const novos = [];
      for (const l of linhas) { const k = chave(l.nome, l.apresentacao); if (!mapa.has(k)) { mapa.set(k, null); novos.push({ orgao_id: org(), nome: l.nome.slice(0, 200), apresentacao: l.apresentacao || null }); } }
      for (let k = 0; k < novos.length; k += 500) {
        const { data: criados, error } = await sb.from('saude_medicamentos').insert(novos.slice(k, k + 500)).select('id, nome, apresentacao');
        if (error) throw error;
        for (const m of criados || []) mapa.set(chave(m.nome, m.apresentacao), m.id);
      }
      // Mesmo medicamento e local repetidos na planilha: soma as quantidades (uma linha por local).
      const juntas = new Map();
      for (const l of linhas) {
        const id = mapa.get(chave(l.nome, l.apresentacao)), k = id + '|' + P.normalizar(l.local);
        const j = juntas.get(k);
        if (j) j.quantidade += l.quantidade;
        else juntas.set(k, { medicamento_id: id, local: l.local, quantidade: l.quantidade, unidade: l.unidade || null, posicao_em: l.posicao_em || S.hoje() });
      }
      if (novos.length) toast(novos.length + ' medicamento(s) novo(s) cadastrado(s) na relação (confira o componente na aba Medicamentos).');
      return [...juntas.values()];
    };
    const importar = () => S.importar({ titulo: 'Importar estoque das farmácias', tabela: 'saude_estoques', colunas: COLUNAS_IMPORT_ESTOQUE, preparar,
      substituirTexto: 'Substituir todo o estoque pela contagem importada',
      ajuda: 'Use o relatório de posição de estoque do sistema da farmácia (Hórus, sistema próprio ou planilha). Data da contagem em branco = hoje.', depois: listar });
    const fBusca = el('input', { type: 'search', placeholder: 'Medicamento', 'aria-label': 'Buscar' });
    let espera; fBusca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(() => { busca = fBusca.value.trim(); listar(); }, 400); });
    caixa.replaceChildren(
      S.secao('saude_estoque', perm, { naoHa: false }), resumo,
      pode() ? el('p', null, el('button', { type: 'button', class: 'btn btn-primario', onclick: importar }, 'Importar estoque (colar ou CSV)')) : '',
      el('div', { class: 'filtros' }, fBusca), lista);
    listar();
    return caixa;
  }

  P.telas.saude = async function (c, mod, p) {
    perm = p; conteiner = c;
    c.replaceChildren(el('h1', null, 'Saúde'), el('p', { class: 'sub' }, 'Carregando…'));
    try { await S.carregarSecoes(); } catch (e) { c.querySelector('.sub').textContent = S.faltaScript(e); return; }
    const caixa = () => el('div');
    c.replaceChildren(...[
      S.cabecalho('Saúde', 'Planos e relatórios, serviços e profissionais, lista de espera, medicamentos, estoque e Conselho de Saúde (PNTP 18.1 a 18.6).'),
      S.avisoSetorial(perm),
      P.abas([
        ['saude-docs', 'Planos e relatórios', () => [S.secao('saude_documentos', perm, { naoHa: false }),
          S.documentos(caixa(), { area: 'saude', modulo: 'saude', tipos: TIPOS_DOC, perm, exemplo: 'Ex.: Programação Anual de Saúde 2026',
            ajuda: 'PNTP 18.1: Plano Municipal de Saúde (4 anos), Programação Anual de cada ano e Relatório Anual de Gestão (e os RDQA quadrimestrais). Mantenha os dos anos anteriores (série histórica).' })], null, 'saude_documentos'],
        ['saude-servicos', 'Serviços e profissionais', () => [S.secao('saude_servicos', perm, { naoHa: false }),
          el('p', { class: 'ajuda' }, 'PNTP 18.2: cada estabelecimento com endereço, dias e horários, especialidades e os profissionais que atendem.'), estabelecimentos(caixa())], null, 'saude_servicos'],
        ['saude-espera', 'Lista de espera', () => listaEspera(caixa()), null, 'saude_espera'],
        ['saude-medicamentos', 'Medicamentos', () => [el('p', { class: 'ajuda' }, 'PNTP 18.4: medicamentos fornecidos pelo SUS e como obtê-los, inclusive os de alto custo (componente especializado).'), medicamentos(caixa())], null, 'saude_medicamentos'],
        ['saude-estoque', 'Estoque das farmácias', () => [el('p', { class: 'ajuda' }, 'PNTP 18.5: quantidade disponível de cada medicamento em cada farmácia pública.'), estoque(caixa())], null, 'saude_estoque'],
        ['saude-conselho', 'Conselho de Saúde', () => [S.secao('saude_conselho', perm, { naoHa: false }),
          S.conselhos(caixa(), { tipos: ['saude'], obrigatorios: { saude: 'PNTP 18.6' }, perm, modulo: 'saude' })], null, 'saude_conselho']
      ])
    ].filter(Boolean));
  };
})();
