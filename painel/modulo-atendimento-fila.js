// =====================================================================
// e-SIC e Ouvidoria · sistema próprio (script 25): fila de pedidos e
// manifestações, ficha do atendimento, registro no balcão, feriados e
// pesquisa de satisfação. Usado por modulo-atendimento.js (P.atendimento).
//
// Regras (no banco):
//   - a equipe central (acesso ao órgão todo + "editar" no módulo) vê a fila
//     inteira, encaminha, prorroga, responde e decide recursos;
//   - quem tem alcance numa unidade vê só o que foi encaminhado a ela e pode
//     registrar notas, anexos e devolver com a proposta de resposta;
//   - a identificação de quem pediu só aparece para a equipe central, por
//     função que grava cada acesso. Nada de dado pessoal na lista nem no CSV.
// =====================================================================
(function () {
  'use strict';
  const P = window.PNTP;
  const S = P.setor;
  const { sb, el, toast, ocupado, campo } = P;
  const org = () => P.estado.orgao.id;
  const hoje = () => S.hoje();
  let seq = 0;

  const SITUACOES = { aberto: 'Em análise', aguardando_cidadao: 'Aguardando o cidadão', respondido: 'Respondido', em_recurso: 'Em recurso', encerrado: 'Encerrado' };
  const ETQ_SIT = { aberto: 'etiqueta-pendente', aguardando_cidadao: 'etiqueta-nivel-importante', respondido: 'etiqueta-ativo', em_recurso: 'etiqueta-nivel-importante', encerrado: 'etiqueta-encerrado' };
  const TIPOS = { pedido: 'Pedido de informação', reclamacao: 'Reclamação', denuncia: 'Denúncia', sugestao: 'Sugestão', elogio: 'Elogio', solicitacao: 'Solicitação', simplificacao: 'Simplificação' };
  const TIPOS_OUV = Object.fromEntries(Object.entries(TIPOS).filter(([k]) => k !== 'pedido'));
  const MEIOS = { internet: 'Internet', presencial: 'Presencial (balcão)', email: 'E-mail', telefone: 'Telefone', carta: 'Carta', outro: 'Outro' };
  const IDENT = { identificado: 'Identificado', preservada: 'Identidade preservada', anonimo: 'Anônimo' };
  const RES_ESIC = { concedido: 'Acesso concedido', parcial: 'Acesso parcialmente concedido', negado: 'Acesso negado', inexistente: 'Informação inexistente',
    incompetencia: 'O órgão não tem competência', nao_pedido: 'Não se trata de pedido de informação', duplicado: 'Pedido repetido' };
  const RES_OUV = { concluida: 'Respondida (resposta conclusiva)', arquivada: 'Arquivada (sem elementos ou não conhecida)', fora_competencia: 'Fora da competência do órgão' };
  const MOTIVOS = { dados_pessoais: 'Informação pessoal (LAI, art. 31)', classificada: 'Informação classificada (LAI, art. 23)', sigilo_legal: 'Sigilo previsto em outra lei',
    generico: 'Pedido genérico', desproporcional: 'Pedido desproporcional ou desarrazoado', trabalho_adicional: 'Exige trabalho adicional de análise',
    processo_decisorio: 'Documento preparatório (processo em andamento)', outro: 'Outro motivo' };
  const DECISOES = { provido: 'Recurso aceito', parcial: 'Recurso aceito em parte', desprovido: 'Recurso negado', nao_conhecido: 'Recurso não conhecido (fora do prazo, sem objeto…)' };
  const TRAMITES = { registro: 'Registro', encaminhamento: 'Encaminhado', devolucao: 'Devolvido à equipe central', prorrogacao: 'Prazo prorrogado', complemento_pedido: 'Pedido de complemento',
    complemento_cidadao: 'Complemento do cidadão', retomada: 'Análise retomada', resposta: 'Resposta', recurso: 'Recurso', decisao_recurso: 'Decisão do recurso',
    reabertura: 'Reaberto', nota: 'Nota interna', classificacao: 'Classificação', encerramento: 'Encerrado' };
  const FAIXAS = { ate_17: 'Até 17 anos', '18_29': '18 a 29 anos', '30_44': '30 a 44 anos', '45_59': '45 a 59 anos', '60_mais': '60 anos ou mais' };
  const ESCOLAR = { sem: 'Sem escolaridade', fundamental: 'Ensino fundamental', medio: 'Ensino médio', superior: 'Ensino superior', pos: 'Pós-graduação' };
  const SEXOS = { feminino: 'Feminino', masculino: 'Masculino', nao_informado: 'Não informado' };
  const ACEITOS_EQUIPE = '.pdf,.jpg,.jpeg,.png,.webp,.csv,.xlsx,.docx,.odt,.ods,.zip';
  const nomeCanal = (c) => c === 'esic' ? 'SIC' : 'Ouvidoria';
  const etq = (t, cls) => el('span', { class: 'etiqueta ' + cls }, t);
  const mostrarErro = (e) => toast(P.erroGravacao(e), true);
  const dataH = (d) => P.dataHoraBR(d);

  // Selo do prazo: vencido (vermelho), vence em até N dias (âmbar), no prazo.
  function seloPrazo(a, avisoDias) {
    if (!['aberto', 'aguardando_cidadao'].includes(a.situacao)) return el('span', null, P.dataBR(a.prazo));
    const dias = Math.round((new Date(a.prazo + 'T12:00:00') - new Date(hoje() + 'T12:00:00')) / 864e5);
    if (a.situacao === 'aguardando_cidadao' && a.suspenso_em) return [P.dataBR(a.prazo), el('span', { class: 'sub-linha' }, 'prazo parado (aguardando)')];
    if (dias < 0) return [P.dataBR(a.prazo), el('span', { class: 'sub-linha' }, etq('Vencido há ' + -dias + ' dia(s)', 'etiqueta-nivel-urgente'))];
    if (dias <= (avisoDias || 5)) return [P.dataBR(a.prazo), el('span', { class: 'sub-linha' }, etq(dias === 0 ? 'Vence hoje' : 'Vence em ' + dias + ' dia(s)', 'etiqueta-nivel-importante'))];
    return [P.dataBR(a.prazo), el('span', { class: 'sub-linha' }, dias + ' dia(s)')];
  }

  // Exporta as linhas (sem texto e sem dado pessoal).
  function exportar(nome, formato, colunas, linhas) {
    const esc = (v) => { const t = v === null || v === undefined ? '' : String(v); return /[;"\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
    const dados = linhas.map((r) => Object.fromEntries(colunas.map(([k, rot, f]) => [rot, f ? f(r[k], r) : r[k]])));
    const conteudo = formato === 'json' ? JSON.stringify(dados, null, 2)
      : '﻿' + [colunas.map((c) => esc(c[1])).join(';')].concat(dados.map((d) => colunas.map((c) => esc(d[c[1]])).join(';'))).join('\r\n');
    const url = URL.createObjectURL(new Blob([conteudo], { type: formato === 'json' ? 'application/json' : 'text/csv;charset=utf-8' }));
    const a = el('a', { href: url, download: nome + '.' + formato }); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // Aviso do SMTP: os e-mails ficam na fila até o SMTP próprio ser ligado.
  async function avisoEmails() {
    const { data } = await sb.rpc('atendimento_emails_situacao', { p_orgao: org() });
    const s = (data || [])[0];
    if (!s) return null;
    if (!s.smtp_ativo) return el('p', { class: 'msg msg-info' }, el('strong', null, 'E-mails desativados: '), 'o SMTP próprio ainda não foi configurado. Os avisos ao cidadão e à equipe ficam guardados na fila (' +
      s.pendentes + ' aguardando) e não são enviados. O cidadão acompanha pela consulta do protocolo com o código de acesso, que funciona sem e-mail.');
    return Number(s.erros) ? el('p', { class: 'msg msg-erro' }, s.erros + ' e-mail(s) não puderam ser enviados depois de 3 tentativas. Fale com o suporte SOFT+.') : null;
  }

  // ===================================================================
  // FILA
  // ===================================================================
  // ctx = { canal, perm, canalReg (atendimento_canais), unidades }
  async function fila(caixa, ctx) {
    const { canal, perm } = ctx;
    const esic = canal === 'esic';
    const central = perm.editar && !P.estado.alcanceUnidade;
    const c = ctx.canalReg() || {};
    const aviso = c.aviso_dias || 5;
    const nomeUn = (id) => (ctx.unidades().find((u) => u.id === id) || {}).nome || '—';
    const [resumoR, avisoMail] = await Promise.all([sb.rpc('atendimento_resumo', { p_orgao: org() }), avisoEmails()]);
    const rs = ((resumoR.data || []).find((x) => x.canal === canal)) || { abertos: 0, vencendo: 0, vencidos: 0, recursos: 0, aguardando: 0 };
    let lst;
    const chips = el('div', { class: 'chips', style: 'margin:4px 0 12px' },
      [['Em análise', rs.abertos, ''], ['Vencem em até ' + aviso + ' dias', rs.vencendo, 'chip-nao'], ['Prazo vencido', rs.vencidos, 'chip-nao'],
        ['Em recurso', rs.recursos, ''], ['Aguardando o cidadão', rs.aguardando, '']].map(([t, q, cls]) => el('span', { class: 'chip ' + (Number(q) && cls ? cls : 'chip-sim') }, t + ': ' + q)));
    const desligado = !c.sistema_proprio ? el('p', { class: 'msg msg-info' }, 'O sistema próprio está desligado: o site não recebe ' + (esic ? 'pedidos' : 'manifestações') +
      ' pela internet. Para ligar, use a aba "' + (esic ? 'Como pedir' : 'Como se manifestar') + '". A equipe pode registrar atendimentos feitos no balcão, por telefone ou e-mail.') : null;
    const colunasExp = [['protocolo', 'Protocolo'], ['tipo', 'Tipo', (v) => TIPOS[v]], ['assunto', 'Assunto'], ['classificacao', 'Classificação'], ['meio', 'Meio', (v) => MEIOS[v]],
      ['identificacao', 'Identificação', (v) => IDENT[v]], ['unidade_id', 'Unidade', (v) => v ? nomeUn(v) : ''], ['situacao', 'Situação', (v) => SITUACOES[v]],
      ['data_registro', 'Registro'], ['prazo', 'Prazo'], ['prorrogado_em', 'Prorrogado', (v) => v ? 'sim' : 'não'], ['respondido_em', 'Respondido em', (v) => v ? String(v).slice(0, 10) : ''],
      ['resultado', 'Resultado', (v) => (esic ? RES_ESIC : RES_OUV)[v] || ''], ['motivo_negativa', 'Motivo da negativa', (v) => MOTIVOS[v] || '']];
    const SEL = 'id, orgao_id, canal, protocolo, ano, tipo, assunto, texto, meio, identificacao, unidade_id, classificacao, situacao, registrado_em, data_registro, prazo, prorrogado_em, suspenso_em, respondido_em, resultado, motivo_negativa, prazo_recurso';
    const filtros = [
      { k: 'situacao', r: 'Situação', t: 'sel', op: { abertos: 'Em aberto (análise, aguardando, recurso)', aberto: 'Em análise', aguardando_cidadao: 'Aguardando o cidadão', em_recurso: 'Em recurso', respondido: 'Respondido', encerrado: 'Encerrado' },
        vazio: 'Situação: todas', aplicar: (q, v) => v === 'abertos' ? q.in('situacao', ['aberto', 'aguardando_cidadao', 'em_recurso']) : q.eq('situacao', v) },
      { k: 'prazo', r: 'Prazo', t: 'sel', op: { vencido: 'Prazo vencido', vencendo: 'Vence em até ' + aviso + ' dias', noprazo: 'No prazo' }, vazio: 'Prazo: todos',
        aplicar: (q, v) => {
          const lim = new Date(Date.now() + aviso * 864e5).toISOString().slice(0, 10);
          q = q.in('situacao', ['aberto', 'aguardando_cidadao']);
          return v === 'vencido' ? q.lt('prazo', hoje()) : v === 'vencendo' ? q.gte('prazo', hoje()).lte('prazo', lim) : q.gte('prazo', hoje());
        } }]
      .concat(esic ? [] : [{ k: 'tipo', r: 'Tipo', t: 'sel', op: TIPOS_OUV, vazio: 'Tipo: todos' }])
      .concat(central ? [{ k: 'unidade_id', r: 'Unidade', t: 'sel', op: Object.assign({ central: 'Com a equipe central' }, Object.fromEntries(ctx.unidades().map((u) => [u.id, u.nome]))), vazio: 'Unidade: todas',
        aplicar: (q, v) => v === 'central' ? q.is('unidade_id', null) : q.eq('unidade_id', v) }] : [])
      .concat([{ k: 'ano', r: 'Ano', t: 'sel', op: Object.fromEntries(Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map((a) => [String(a), String(a)])), vazio: 'Ano: todos' },
        { k: 'busca', r: 'Pesquisar', t: 'busca', ph: 'Protocolo, assunto ou texto' }]);
    const exportar2 = (formato) => async (ev) => {
      const b = ev.target; ocupado(b, '…');
      try {
        const { data, error } = await sb.from('atendimentos').select(SEL).eq('orgao_id', org()).eq('canal', canal).order('data_registro', { ascending: false }).limit(5000);
        if (error) throw error;
        exportar((esic ? 'pedidos-esic' : 'manifestacoes-ouvidoria') + '-' + hoje(), formato, colunasExp, data || []);
      } catch (e) { mostrarErro(e); } finally { ocupado(b); }
    };
    caixa.append(...[avisoMail, desligado, chips].filter(Boolean),
      el('p', { class: 'ajuda' }, central ? 'Fila do ' + nomeCanal(canal) + ': clique em "Abrir" para ver, encaminhar, prorrogar, responder ou decidir recurso. A lista e o CSV não trazem dados pessoais.'
        : 'Atendimentos encaminhados à sua unidade. Registre a proposta de resposta e devolva à equipe central, que responde ao cidadão. A identificação de quem pediu não aparece aqui.'));
    lst = S.listaAno(caixa, { tabela: 'atendimentos', ordem: 'prazo', crescente: true, vazio: esic ? 'Nenhum pedido.' : 'Nenhuma manifestação.', inicial: { situacao: 'abertos' },
      base: (q) => q.eq('canal', canal),
      filtros: filtros.map((x) => x.k === 'ano' ? Object.assign(x, { aplicar: (q, v) => q.eq('ano', Number(v)) }) : x),
      rodape: () => el('p', { class: 'ajuda', style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' }, 'Baixar a fila (sem dados pessoais):',
        el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: exportar2('csv') }, 'CSV'), el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: exportar2('json') }, 'JSON')),
      botoes: () => central ? [el('button', { type: 'button', class: 'btn btn-primario', onclick: () => registrarBalcao(ctx, () => lst.recarregar(true)) }, esic ? '+ Registrar pedido (balcão, telefone, e-mail)' : '+ Registrar manifestação (balcão, telefone, e-mail)')] : [],
      colunas: [['Protocolo', (a) => [el('strong', null, a.protocolo), el('span', { class: 'sub-linha' }, P.dataBR(a.data_registro) + ' · ' + MEIOS[a.meio])]],
        [esic ? 'Pedido' : 'Manifestação', (a) => [esic ? null : el('strong', null, TIPOS[a.tipo] + ' '), a.assunto || a.texto.slice(0, 90) + (a.texto.length > 90 ? '…' : ''),
          a.identificacao !== 'identificado' ? el('span', { class: 'sub-linha' }, IDENT[a.identificacao]) : null], 'quebra'],
        ['Unidade', (a) => a.unidade_id ? nomeUn(a.unidade_id) : el('span', { class: 'sub-linha' }, 'Equipe central')],
        ['Situação', (a) => [etq(SITUACOES[a.situacao], ETQ_SIT[a.situacao]), a.resultado ? el('span', { class: 'sub-linha' }, (esic ? RES_ESIC : RES_OUV)[a.resultado]) : null]],
        ['Prazo', (a) => seloPrazo(a, aviso), 'num']],
      acoes: (a) => [S.botao('Abrir', () => ficha(a.id, ctx, () => lst.recarregar(true)))] });
    return caixa;
  }

  // ===================================================================
  // FICHA DO ATENDIMENTO
  // ===================================================================
  async function ficha(id, ctx, depois, silencioso) {
    const { canal, perm } = ctx;
    const esic = canal === 'esic';
    const central = perm.editar && !P.estado.alcanceUnidade;
    const [ra, rt, rr, rx] = await Promise.all([
      sb.from('atendimentos').select('*').eq('id', id).maybeSingle(),
      sb.from('atendimentos_tramites').select('id, tipo, texto, publico, unidade_de, unidade_para, criado_em, usuarios(nome)').eq('atendimento_id', id).order('criado_em'),
      sb.from('atendimentos_recursos').select('*').eq('atendimento_id', id).order('instancia'),
      sb.from('atendimentos_anexos').select('id, nome, caminho, tamanho, origem, publico, criado_em').eq('atendimento_id', id).order('criado_em')]);
    if (ra.error || !ra.data) {
      // Devolvido pela unidade: deixa de aparecer para ela (não é erro).
      if (silencioso && !ra.error) toast('Gravado. O atendimento voltou para a equipe central.'); else mostrarErro(ra.error || P.amigavel('Atendimento não encontrado.'));
      return false;
    }
    const a = ra.data, tramites = rt.data || [], recursos = rr.data || [], anexos = rx.data || [];
    const c = ctx.canalReg() || {};
    const nomeUn = (uid) => (ctx.unidades().find((u) => u.id === uid) || {}).nome || '—';
    let dlg;
    const recarregar = async () => { dlg.close(); await ficha(id, ctx, depois, true); if (depois) depois(); };
    // Executa uma ação no banco e reabre a ficha.
    const acao = (nome, dados, btn, ok) => async () => {
      ocupado(btn, 'Gravando…');
      try {
        const { error } = await sb.rpc('atendimento_acao', { p_id: id, p_acao: nome, p_dados: dados() });
        if (error) throw error;
        toast(ok || 'Gravado.');
        await recarregar();
      } catch (e) { mostrarErro(e); ocupado(btn); }
    };
    const area = (linhas, max, ph) => el('textarea', { rows: linhas || 4, maxlength: max || 20000, placeholder: ph || null });
    const sel = (op, vazio) => el('select', null, S.opcoes(op, '', vazio || '— Escolha —'));
    const pre = 'fa' + (++seq) + '-';
    const blocoAcao = (titulo, ajuda, campos, rotulo, nome, ler, perigo) => {
      const b = el('button', { type: 'button', class: 'btn ' + (perigo ? 'btn-claro' : 'btn-primario') }, rotulo);
      b.addEventListener('click', acao(nome, ler, b));
      return el('section', { class: 'cartao' }, el('h3', null, titulo), ajuda ? el('p', { class: 'ajuda' }, ajuda) : null, campos, el('p', null, b));
    };

    // --- aba Atendimento ---
    const dados = el('dl', { class: 'dados' },
      [['Protocolo', a.protocolo], ['Tipo', TIPOS[a.tipo]], ['Meio de entrada', MEIOS[a.meio]], ['Identificação', IDENT[a.identificacao]],
        ['Registrado em', dataH(a.registrado_em)], ['Situação', etq(SITUACOES[a.situacao], ETQ_SIT[a.situacao])],
        ['Prazo de resposta', [seloPrazo(a, c.aviso_dias), a.prorrogado_em ? el('span', { class: 'sub-linha' }, 'Prorrogado em ' + dataH(a.prorrogado_em)) : null]],
        ['Unidade', a.unidade_id ? nomeUn(a.unidade_id) : 'Equipe central'], ['Classificação (assunto)', a.classificacao || '—'],
        esic ? ['Forma de resposta pedida', { sistema: 'Consulta do protocolo', email: 'E-mail', correspondencia: 'Carta', presencial: 'Presencial' }[a.forma_resposta]] : null,
        a.resultado ? ['Resultado', (esic ? RES_ESIC : RES_OUV)[a.resultado] + (a.motivo_negativa ? ' — ' + MOTIVOS[a.motivo_negativa] : '')] : null,
        a.prazo_recurso && a.situacao === 'respondido' ? ['Cidadão pode recorrer até', P.dataBR(a.prazo_recurso)] : null]
        .filter(Boolean).flatMap(([dt, dd]) => [el('dt', null, dt), el('dd', null, dd)]));
    const preservada = a.identificacao === 'preservada' ? el('p', { class: 'msg msg-info' }, 'Identidade preservada: o cidadão pediu que só o SIC saiba quem fez o pedido. Ao encaminhar, não repasse nome nem contatos.') : null;
    const abaAtend = [preservada, dados, a.assunto ? el('p', null, el('strong', null, a.assunto)) : null,
      el('div', { class: 'pre cartao' }, a.texto),
      a.resposta ? el('section', { class: 'cartao' }, el('h3', null, 'Resposta enviada (' + dataH(a.respondido_em) + ')'), el('p', { class: 'pre' }, a.resposta)) : null];

    // --- aba Identificação (equipe central) ---
    const abaIdent = () => {
      const caixa = el('div');
      if (a.identificacao === 'anonimo') { caixa.append(el('p', { class: 'msg msg-info' }, 'Denúncia anônima: não há dados de quem se manifestou.')); return caixa; }
      const b = el('button', { type: 'button', class: 'btn btn-primario' }, 'Ver identificação');
      b.addEventListener('click', async () => {
        ocupado(b, 'Abrindo…');
        const { data, error } = await sb.rpc('atendimento_identificacao', { p_id: id });
        if (error) { mostrarErro(error); ocupado(b); return; }
        const doc = data.documento ? P.formatarDoc(data.documento) : '—';
        caixa.replaceChildren(el('dl', { class: 'dados' }, [['Nome', data.nome], ['CPF/CNPJ', doc], ['Tipo de pessoa', { fisica: 'Física', juridica: 'Jurídica' }[data.tipo_pessoa] || '—'],
          ['E-mail', data.email || '—'], ['Telefone', data.telefone || '—'], ['Endereço', data.endereco || '—'], ['Município/UF', data.municipio_uf || '—'],
          ['Sexo', SEXOS[data.sexo] || '—'], ['Faixa etária', FAIXAS[data.faixa_etaria] || '—'], ['Escolaridade', ESCOLAR[data.escolaridade] || '—']]
          .flatMap(([dt, dd]) => [el('dt', null, dt), el('dd', null, dd)])),
        el('p', { class: 'ajuda' }, 'Este acesso foi registrado (LGPD). Use os dados só para tratar ' + (esic ? 'o pedido' : 'a manifestação') + '.'));
      });
      caixa.append(el('p', { class: 'ajuda' }, 'Dados pessoais de quem ' + (esic ? 'pediu' : 'se manifestou') + '. Só a equipe central do ' + nomeCanal(canal) + ' vê; cada abertura fica registrada com o seu nome e o horário (aba "Acessos").'), el('p', null, b));
      return caixa;
    };

    // --- aba Andamento ---
    const notaTxt = area(3, 20000, 'Nota interna (o cidadão não vê)');
    const btnNota = el('button', { type: 'button', class: 'btn btn-claro' }, 'Registrar nota');
    btnNota.addEventListener('click', acao('nota', () => ({ texto: notaTxt.value }), btnNota, 'Nota registrada.'));
    const abaAnd = [el('ol', { class: 'andamento' }, tramites.slice().reverse().map((t) => el('li', null,
      el('strong', null, TRAMITES[t.tipo]), ' ', t.publico ? etq('o cidadão vê', 'etiqueta-ativo') : etq('interno', 'etiqueta-rascunho'),
      el('span', { class: 'sub-linha' }, dataH(t.criado_em) + (t.usuarios && t.usuarios.nome ? ' · ' + t.usuarios.nome : t.tipo === 'registro' && a.meio === 'internet' ? ' · pelo site' : '')),
      t.texto ? el('p', { style: 'white-space:pre-line;margin:4px 0 10px' }, t.texto) : null))),
      perm.editar ? el('section', { class: 'cartao' }, campo(pre + 'nota', 'Nota interna', notaTxt), el('p', null, btnNota)) : null];

    // --- aba Recursos (e-SIC) ---
    const abaRec = recursos.length ? recursos.map((r) => el('section', { class: 'cartao' },
      el('h3', null, r.instancia + 'ª instância', ' ', r.decisao ? etq(DECISOES[r.decisao], 'etiqueta-encerrado') : etq('Aguardando decisão até ' + P.dataBR(r.prazo_decisao), r.prazo_decisao < hoje() ? 'etiqueta-nivel-urgente' : 'etiqueta-nivel-importante')),
      el('p', { class: 'ajuda' }, 'Registrado em ' + dataH(r.registrado_em) + (r.autoridade ? ' · decide: ' + r.autoridade : '')),
      el('p', { class: 'pre' }, r.texto), r.decisao_texto ? el('p', { class: 'pre' }, el('strong', null, 'Decisão: '), r.decisao_texto) : null))
      : [el('p', { class: 'vazio' }, 'Nenhum recurso.')];

    // --- aba Anexos ---
    const abaAnexos = () => {
      const caixa = el('div');
      const linha = (x) => el('li', null, el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: async () => {
        const { data, error } = await sb.storage.from('atendimento').createSignedUrl(x.caminho, 120, { download: x.nome });
        if (error) { mostrarErro(error); return; }
        window.open(data.signedUrl, '_blank', 'noopener');
      } }, x.nome), ' ', el('span', { class: 'sub-linha', style: 'display:inline' }, (x.origem === 'cidadao' ? 'do cidadão' : 'da equipe' + (x.publico ? ', vai para o cidadão' : ', interno')) + ' · ' + dataH(x.criado_em)));
      const arq = el('input', { type: 'file', accept: ACEITOS_EQUIPE, multiple: true });
      const publico = el('input', { type: 'checkbox', checked: central });
      const b = el('button', { type: 'button', class: 'btn btn-primario' }, 'Enviar anexos');
      b.addEventListener('click', async () => {
        const fs = [...arq.files];
        if (!fs.length) { toast('Escolha o arquivo.', true); return; }
        if (fs.some((f) => f.size > 10 * 1048576)) { toast('Cada arquivo pode ter até 10 MB.', true); return; }
        ocupado(b, 'Enviando…');
        try {
          for (const f of fs) {
            const ext = (f.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
            const caminho = org() + '/' + id + '/' + crypto.randomUUID() + '.' + ext;
            const up = await sb.storage.from('atendimento').upload(caminho, f, { contentType: f.type || 'application/octet-stream', upsert: false });
            if (up.error) throw up.error;
            const { error } = await sb.rpc('atendimento_acao', { p_id: id, p_acao: 'anexo', p_dados: { nome: f.name, caminho, tamanho: f.size, tipo: f.type, publico: publico.checked } });
            if (error) { await sb.storage.from('atendimento').remove([caminho]); throw error; }
          }
          toast('Anexos enviados.');
          await recarregar();
        } catch (e) { mostrarErro(e); ocupado(b); }
      });
      caixa.append(anexos.length ? el('ul', { class: 'lista-simples' }, anexos.map(linha)) : el('p', { class: 'vazio' }, 'Nenhum anexo.'),
        perm.editar ? el('section', { class: 'cartao' }, el('h3', null, 'Anexar'), campo(pre + 'arq', 'Arquivos (até 10 MB cada)', arq),
          central ? el('label', { class: 'check', style: 'display:flex;gap:8px;align-items:center;margin:8px 0' }, publico, 'Enviar ao cidadão (aparece na consulta do protocolo)')
            : el('p', { class: 'ajuda' }, 'Os anexos da unidade ficam internos: a equipe central decide o que vai para o cidadão.'), el('p', null, b)) : null);
      return caixa;
    };

    // --- aba Ações ---
    const abaAcoes = () => {
      const l = [];
      if (!perm.editar) return [el('p', { class: 'vazio' }, 'Seu perfil só pode ver os atendimentos.')];
      if (!central) {
        const t = area(6, 20000, 'Proposta de resposta e informações para a equipe central');
        l.push(blocoAcao('Devolver à equipe central', 'Escreva a proposta de resposta (e anexe os documentos na aba Anexos). A equipe central confere e responde ao cidadão.',
          campo(pre + 'dev', 'Proposta / observação', t), 'Devolver', 'devolver', () => ({ texto: t.value })));
        return l;
      }
      const aberto = ['aberto', 'aguardando_cidadao'].includes(a.situacao);
      if (aberto || a.situacao === 'em_recurso') {
        const u = sel(Object.fromEntries(ctx.unidades().filter((x) => x.ativo !== false).map((x) => [x.id, x.nome])));
        const t = area(3, 20000, 'Orientação para a unidade (interna)');
        l.push(blocoAcao('Encaminhar para uma unidade', 'A unidade vê o texto ' + (esic ? 'do pedido' : 'da manifestação') + ', sem a identificação, e devolve com a proposta de resposta. O cidadão vê que foi encaminhado.',
          [campo(pre + 'un', 'Unidade', u), campo(pre + 'enc', 'Orientação (opcional)', t)], 'Encaminhar', 'encaminhar', () => ({ unidade_id: u.value, texto: t.value })));
      }
      if (a.unidade_id) l.push(blocoAcao('Trazer de volta para a equipe central', null, null, 'Trazer de volta', 'devolver', () => ({ texto: 'Trazido de volta pela equipe central.' }), true));
      if (aberto) {
        const res = sel(esic ? RES_ESIC : RES_OUV), mot = sel(MOTIVOS, '— Motivo da negativa —'), t = area(10);
        const motCampo = campo(pre + 'mot', 'Motivo da negativa (LAI, art. 11, § 1º, II)', mot);
        motCampo.hidden = true;
        res.addEventListener('change', () => { motCampo.hidden = !['parcial', 'negado'].includes(res.value); });
        l.push(blocoAcao('Responder', esic ? 'A resposta vai para o cidadão na consulta do protocolo' + (c.email ? '' : '') + '. Depois dela, o cidadão tem ' + ((c.dias_recurso || 10)) + ' dias para recorrer. Anexe os documentos antes, na aba Anexos (marcando "enviar ao cidadão").'
          : 'A resposta conclusiva vai para o cidadão na consulta do protocolo e encerra a manifestação (Lei 13.460/2017, art. 12).',
          [campo(pre + 'res', 'Resultado', res), motCampo, campo(pre + 'resp', 'Resposta ao cidadão', t)], 'Enviar resposta', 'responder',
          () => ({ resultado: res.value, motivo_negativa: mot.value || null, resposta: t.value })));
        if (!a.prorrogado_em) {
          const m = area(3, 2000, 'Ex.: o pedido envolve documentos de vários setores e exige levantamento no arquivo.');
          l.push(blocoAcao('Prorrogar o prazo', 'Uma vez, por mais ' + (c.dias_prorrogacao || (esic ? 10 : 30)) + ' dias, antes do fim do prazo e com justificativa enviada ao cidadão (' + (esic ? 'LAI, art. 11, § 2º' : 'Lei 13.460/2017, art. 16') + ').',
            campo(pre + 'pr', 'Justificativa', m), 'Prorrogar', 'prorrogar', () => ({ motivo: m.value }), true));
        }
        if (a.situacao === 'aberto') {
          const t2 = area(3, 20000, 'O que falta para responder');
          l.push(blocoAcao('Pedir complemento ao cidadão', esic ? 'O cidadão vê o pedido na consulta do protocolo (e por e-mail, quando ativo). O prazo continua correndo.'
            : 'O prazo fica parado até o cidadão responder (Decreto 9.492/2018, art. 18).', campo(pre + 'cp', 'Pedido de complemento', t2), 'Pedir complemento', 'pedir_complemento', () => ({ texto: t2.value }), true));
        } else {
          l.push(blocoAcao('Retomar sem o complemento', 'Use se o cidadão não respondeu e já é possível tratar ' + (esic ? 'o pedido' : 'a manifestação') + '.', null, 'Retomar', 'retomar', () => ({}), true));
        }
      }
      const aguardando = recursos.find((r) => !r.decisao);
      if (aguardando) {
        const d = sel(DECISOES), t = area(8);
        l.push(blocoAcao('Decidir o recurso (' + aguardando.instancia + 'ª instância)', 'Registre a decisão da autoridade (' + (aguardando.autoridade || 'conforme a norma local') + '). Se for aceito, inclua na decisão a informação ou anexe os documentos.',
          [campo(pre + 'dc', 'Decisão', d), campo(pre + 'dt', 'Texto da decisão (vai para o cidadão)', t)], 'Registrar decisão', 'decidir_recurso', () => ({ decisao: d.value, texto: t.value })));
      } else if (esic && ['respondido', 'aberto', 'aguardando_cidadao'].includes(a.situacao)) {
        const t = area(4), m = sel({ negativa: 'Discorda da negativa', incompleta: 'Resposta incompleta', omissao: 'Sem resposta no prazo', outro: 'Outro' });
        l.push(blocoAcao('Registrar recurso recebido no balcão', 'Quando o cidadão recorre pessoalmente ou por escrito. Pelo site, ele recorre sozinho na consulta do protocolo.',
          [campo(pre + 'rm', 'Motivo', m), campo(pre + 'rt', 'Texto do recurso', t)], 'Registrar recurso', 'registrar_recurso', () => ({ motivo: m.value, texto: t.value }), true));
      }
      const cl = el('input', { type: 'text', maxlength: 120, value: a.classificacao || '', placeholder: 'Ex.: Saúde, Obras, Tributos' });
      const tp = esic || a.identificacao === 'anonimo' ? null : el('select', null, S.opcoes(TIPOS_OUV, a.tipo));
      l.push(blocoAcao('Classificar', 'O assunto entra nas estatísticas (distribuição por assunto).' + (tp ? ' O tipo pode ser corrigido (ex.: reclamação que na verdade é denúncia).' : ''),
        [campo(pre + 'cl', 'Assunto', cl), tp ? campo(pre + 'tp', 'Tipo', tp) : null], 'Salvar classificação', 'classificar', () => ({ classificacao: cl.value, tipo: tp ? tp.value : null }), true));
      if (['respondido', 'encerrado'].includes(a.situacao) && !recursos.length) {
        const m = area(2, 2000);
        l.push(blocoAcao('Reabrir', 'Só para corrigir um erro (ex.: resposta enviada no protocolo errado). Fica no andamento interno.', campo(pre + 'ra', 'Motivo', m), 'Reabrir', 'reabrir', () => ({ motivo: m.value }), true));
      }
      return l.length ? l : [el('p', { class: 'vazio' }, 'Nenhuma ação disponível nesta situação.')];
    };

    // --- aba Acessos (LGPD) ---
    const abaAcessos = async () => {
      const { data, error } = await sb.from('atendimentos_acessos').select('criado_em, usuario_id, usuarios(nome, email)').eq('atendimento_id', id).order('criado_em', { ascending: false }).limit(200);
      if (error) return el('p', { class: 'msg msg-erro' }, P.erroGravacao(error));
      return data.length ? el('ul', { class: 'lista-simples' }, data.map((x) => el('li', null, dataH(x.criado_em) + ' · ' + ((x.usuarios && (x.usuarios.nome || x.usuarios.email)) || x.usuario_id))))
        : el('p', { class: 'vazio' }, 'Ninguém abriu a identificação.');
    };
    const caixaAcessos = () => { const c2 = el('div', null, el('p', { class: 'ajuda' }, 'Carregando…')); abaAcessos().then((x) => c2.replaceChildren(el('p', { class: 'ajuda' }, 'Quem abriu os dados pessoais deste atendimento (LGPD, art. 37).'), x)); return c2; };

    const abas = [['at', 'Atendimento', abaAtend], ['ac', central ? 'Responder e encaminhar' : 'Devolver', abaAcoes], ['an', 'Andamento (' + tramites.length + ')', abaAnd]]
      .concat(esic ? [['rc', 'Recursos (' + recursos.length + ')', abaRec]] : [])
      .concat([['ax', 'Anexos (' + anexos.length + ')', abaAnexos]])
      .concat(central ? [['id', 'Identificação', abaIdent], ['lg', 'Acessos', caixaAcessos]] : []);
    dlg = P.abrirDialogo((esic ? 'Pedido ' : TIPOS[a.tipo] + ' · ') + a.protocolo, P.abas(abas), [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => dlg.close() }, 'Fechar')]);
    dlg.classList.add('dialogo-largo');
  }

  // ===================================================================
  // REGISTRO NO BALCÃO (presencial, telefone, e-mail, carta)
  // ===================================================================
  function registrarBalcao(ctx, depois) {
    const { canal } = ctx;
    const esic = canal === 'esic';
    const pre = 'rb' + (++seq) + '-';
    const f = { meio: el('select', null, S.opcoes({ presencial: 'Presencial (balcão)', telefone: 'Telefone', email: 'E-mail', carta: 'Carta', outro: 'Outro' }, 'presencial')),
      tipo: esic ? null : el('select', null, S.opcoes(TIPOS_OUV, 'reclamacao')), ident: el('select', null, S.opcoes(esic ? { identificado: 'Identificado', preservada: 'Identidade preservada' } : { identificado: 'Identificado', anonimo: 'Anônimo (só denúncia)' }, 'identificado')),
      texto: el('textarea', { rows: 6, maxlength: 8000 }), assunto: el('input', { type: 'text', maxlength: 200 }), nome: el('input', { type: 'text', maxlength: 200 }),
      documento: P.mascaraDoc(el('input', { type: 'text', maxlength: 18, placeholder: 'CPF ou CNPJ' })), email: el('input', { type: 'email', maxlength: 160 }), telefone: el('input', { type: 'text', maxlength: 40 }),
      endereco: el('input', { type: 'text', maxlength: 300 }), municipio: el('input', { type: 'text', maxlength: 120 }),
      sexo: el('select', null, S.opcoes(SEXOS, '', 'Não informado')), faixa: el('select', null, S.opcoes(FAIXAS, '', 'Não informada')), escolar: el('select', null, S.opcoes(ESCOLAR, '', 'Não informada')) };
    const corpo = el('form', { class: 'form-dialogo', novalidate: true, onsubmit: (e) => e.preventDefault() },
      el('p', { class: 'ajuda' }, 'Registre aqui o que chegou fora do site. O sistema gera o protocolo e o código de acesso para entregar ao cidadão (mostrado uma vez só).'),
      el('div', { class: 'grade-campos' }, campo(pre + 'meio', 'Meio de entrada', f.meio), esic ? null : campo(pre + 'tipo', 'Tipo', f.tipo), campo(pre + 'ident', 'Identificação', f.ident)),
      campo(pre + 'texto', esic ? 'Informação pedida' : 'Descrição da manifestação', f.texto, null, true), campo(pre + 'assunto', 'Assunto (resumo)', f.assunto),
      el('div', { class: 'grade-campos' }, campo(pre + 'nome', 'Nome', f.nome, null, esic), campo(pre + 'doc', 'CPF ou CNPJ', f.documento, esic ? 'Exigido pela LAI (art. 10).' : null, esic)),
      el('div', { class: 'grade-campos' }, campo(pre + 'email', 'E-mail', f.email), campo(pre + 'tel', 'Telefone', f.telefone)),
      el('div', { class: 'grade-campos' }, campo(pre + 'end', 'Endereço', f.endereco), campo(pre + 'mun', 'Município/UF', f.municipio)),
      esic ? el('div', { class: 'grade-campos' }, campo(pre + 'sexo', 'Sexo', f.sexo), campo(pre + 'faixa', 'Faixa etária', f.faixa), campo(pre + 'esc', 'Escolaridade', f.escolar)) : null);
    const b = el('button', { type: 'button', class: 'btn btn-primario' }, 'Registrar');
    const dlg = P.abrirDialogo(esic ? 'Registrar pedido' : 'Registrar manifestação', corpo, [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => dlg.close() }, 'Cancelar'), b]);
    dlg.classList.add('dialogo-largo');
    b.addEventListener('click', async () => {
      const anon = f.ident.value === 'anonimo';
      if (f.texto.value.trim().length < 10) { P.erroCampo(pre + 'texto', 'Descreva com pelo menos 10 letras.'); return; }
      if (esic && f.nome.value.trim().length < 3) { P.erroCampo(pre + 'nome', 'Informe o nome (LAI, art. 10).'); return; }
      const doc = f.documento.value.replace(/\D/g, '');
      if (esic && !doc) { P.erroCampo(pre + 'doc', 'Informe o CPF ou o CNPJ.'); return; }
      if (doc && P.erroDoc(doc)) { P.erroCampo(pre + 'doc', P.erroDoc(doc)); return; }
      ocupado(b, 'Registrando…');
      const dados = { meio: f.meio.value, tipo: esic ? 'pedido' : f.tipo.value, identificacao: f.ident.value, texto: f.texto.value.trim(), assunto: f.assunto.value.trim() };
      if (!anon) Object.assign(dados, { nome: f.nome.value.trim() || 'Não informado', documento: doc, email: f.email.value.trim(), telefone: f.telefone.value.trim(),
        endereco: f.endereco.value.trim(), municipio_uf: f.municipio.value.trim(), sexo: f.sexo.value, faixa_etaria: f.faixa.value, escolaridade: f.escolar.value });
      const { data, error } = await sb.rpc('registrar_atendimento', { p_orgao: org(), p_canal: canal, p_dados: dados });
      if (error) { mostrarErro(error); ocupado(b); return; }
      dlg.close();
      const d2 = P.abrirDialogo('Entregue ao cidadão', el('div', { class: 'comprovante' },
        el('dl', { class: 'dados' }, el('dt', null, 'Protocolo'), el('dd', null, el('strong', { style: 'font-size:1.3em;font-family:monospace' }, data.protocolo)),
          el('dt', null, 'Código de acesso'), el('dd', null, el('strong', { style: 'font-size:1.3em;font-family:monospace' }, data.codigo)),
          el('dt', null, 'Prazo de resposta'), el('dd', null, P.dataBR(data.prazo))),
        el('p', { class: 'msg msg-info' }, 'Anote ou imprima agora: o código de acesso não é mostrado de novo. Com ele o cidadão acompanha e ' + (esic ? 'recorre' : 'avalia') + ' pelo site, na aba "Acompanhar".')),
        [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => window.print() }, 'Imprimir'), el('button', { type: 'button', class: 'btn btn-primario', onclick: () => d2.close() }, 'Concluir')]);
      if (depois) depois();
    });
  }

  // ===================================================================
  // FERIADOS E DIAS SEM EXPEDIENTE (contagem dos prazos)
  // ===================================================================
  function feriados(perm) {
    const sec = el('section', { class: 'cartao' }, el('h2', null, 'Feriados e dias sem expediente'),
      el('p', { class: 'ajuda' }, 'Os prazos contam em dias corridos; se o último dia cair em sábado, domingo, feriado nacional ou numa data desta lista, o prazo passa para o dia útil seguinte. Os feriados nacionais (inclusive a Sexta-feira Santa) já são considerados: cadastre aqui os municipais e os pontos facultativos.'));
    const corpo = el('div');
    const podeF = perm.editar && !P.estado.alcanceUnidade;
    const data = el('input', { type: 'date' }), nome = el('input', { type: 'text', maxlength: 120, placeholder: 'Ex.: Padroeira do município' });
    const b = el('button', { type: 'button', class: 'btn btn-claro' }, 'Incluir');
    async function carregarF() {
      const { data: l, error } = await sb.from('feriados').select('id, data, nome').eq('orgao_id', org()).gte('data', (new Date().getFullYear() - 1) + '-01-01').order('data').limit(300);
      if (error) { corpo.replaceChildren(el('p', { class: 'msg msg-erro' }, P.erroGravacao(error))); return; }
      corpo.replaceChildren(S.tabela([['Data', (x) => P.dataBR(x.data)], ['Descrição', (x) => x.nome]], l || [],
        podeF ? (x) => [S.botao('Excluir', async () => { const { error: e } = await sb.from('feriados').delete().eq('id', x.id); if (e) mostrarErro(e); else carregarF(); }, true)] : null, 'Nenhum feriado local cadastrado.'));
    }
    b.addEventListener('click', async () => {
      if (!data.value || nome.value.trim().length < 2) { toast('Informe a data e a descrição.', true); return; }
      ocupado(b, '…');
      const { error } = await sb.from('feriados').insert({ orgao_id: org(), data: data.value, nome: nome.value.trim() });
      ocupado(b);
      if (error) { mostrarErro(/feriados_uk|duplicate/i.test(error.message) ? P.amigavel('Essa data já está na lista.') : error); return; }
      data.value = ''; nome.value = ''; carregarF();
    });
    sec.append(corpo, podeF ? el('div', { class: 'grade-campos' }, campo('fer-d' + (++seq), 'Data', data), campo('fer-n' + seq, 'Descrição', nome), el('div', { class: 'campo', style: 'justify-content:flex-end' }, b)) : null);
    carregarF();
    return sec;
  }

  // ===================================================================
  // PESQUISA DE SATISFAÇÃO (15.6)
  // ===================================================================
  async function satisfacao(caixa, perm, canaisReg) {
    const ligados = ['esic', 'ouvidoria'].filter((k) => (canaisReg[k] || {}).sistema_proprio && (canaisReg[k] || {}).pesquisa_satisfacao);
    caixa.append(el('p', { class: 'ajuda' }, 'PNTP 15.6: depois da resposta, quem pediu ou se manifestou pelo portal pode avaliar o atendimento (nota de 1 a 5 e se a resposta resolveu). O site publica os resultados somados, por ano; os comentários ficam só aqui. Ligue ou desligue a pesquisa de cada canal em "Como pedir" (e-SIC) e "Como se manifestar" (Ouvidoria).'),
      ligados.length ? el('p', { class: 'msg msg-ok' }, 'Pesquisa ligada: ' + ligados.map((k) => k === 'esic' ? 'e-SIC' : 'Ouvidoria').join(' e ') + '.')
        : el('p', { class: 'msg msg-info' }, 'A pesquisa só funciona com o sistema próprio ligado. Se o órgão usa a pesquisa de um sistema externo, informe o link em Aparência › Destinos das páginas ("Ouvidoria: pesquisa de satisfação").'));
    const [{ data: agg }, { data: coms, error }] = await Promise.all([sb.rpc('atendimento_satisfacao', { p_orgao: org() }),
      sb.from('atendimentos_avaliacoes').select('atendimento_id, canal, nota, resolvido, comentario, data, atendimentos(protocolo)').eq('orgao_id', org()).order('data', { ascending: false }).limit(500)]);
    const linhas = agg || [];
    if (!linhas.length) { caixa.append(el('p', { class: 'vazio' }, 'Ainda não há avaliações.')); return caixa; }
    const anos = [...new Set(linhas.map((x) => x.ano))];
    const tot = (l) => l.reduce((t, x) => t + Number(x.quantidade), 0);
    const media = (l) => tot(l) ? (l.reduce((t, x) => t + x.nota * Number(x.quantidade), 0) / tot(l)).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '—';
    const pct = (l, k) => tot(l) ? Math.round(100 * tot(l.filter((x) => x.resolvido === k)) / tot(l)) + '%' : '—';
    caixa.append(S.tabela([['Ano', (a) => String(a)], ['Avaliações', (a) => String(tot(linhas.filter((x) => x.ano === a))), 'num'], ['Nota média', (a) => media(linhas.filter((x) => x.ano === a)), 'num'],
      ['Resolveu', (a) => pct(linhas.filter((x) => x.ano === a), 'sim'), 'num'], ['e-SIC', (a) => String(tot(linhas.filter((x) => x.ano === a && x.canal === 'esic'))), 'num'],
      ['Ouvidoria', (a) => String(tot(linhas.filter((x) => x.ano === a && x.canal === 'ouvidoria'))), 'num']], anos, null));
    if (!error) {
      const cm = (coms || []).filter((x) => x.comentario);
      caixa.append(el('h3', null, 'Comentários (' + cm.length + ')'), cm.length ? S.tabela([['Data', (x) => P.dataBR(x.data)], ['Protocolo', (x) => (x.atendimentos || {}).protocolo || '—'],
        ['Nota', (x) => String(x.nota), 'num'], ['Resolveu', (x) => ({ sim: 'Sim', parcial: 'Em parte', nao: 'Não' })[x.resolvido]], ['Comentário', (x) => x.comentario, 'quebra']], cm, null)
        : el('p', { class: 'vazio' }, 'Nenhum comentário.'));
    }
    return caixa;
  }

  P.atendimento = { fila, ficha, feriados, satisfacao, avisoEmails, SITUACOES, TIPOS };
})();
