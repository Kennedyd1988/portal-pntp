// =====================================================================
// Módulos "e-SIC (acesso à informação)" (PNTP 12.1 a 12.9) e "Ouvidoria"
// (14.1, 14.2 e 15.6). Abas iguais às da página do site (no site, "Fazer
// pedido" e "Acompanhar" são duas abas; aqui, a fila "Pedidos"):
//   e-SIC: Como pedir (12.1 a 12.5) · Pedidos · Prazos e recursos (12.6) ·
//          Relatórios estatísticos (12.7) · Informações classificadas
//          (12.8) · Informações desclassificadas (12.9)
//   Ouvidoria: Como se manifestar (14.1, 14.2) · Manifestações ·
//          Relatórios estatísticos · Pesquisa de satisfação (15.6)
// Formulário: sistema próprio do portal (ligado em "Como pedir" / "Como se
// manifestar") ou sistema externo (link em Aparência › Destinos das páginas,
// partes "e-SIC: pedidos" e "Ouvidoria: manifestações", que desativa a fila).
// A fila, a ficha e o registro no balcão estão em modulo-atendimento-fila.js.
// =====================================================================
(function () {
  'use strict';
  const P = window.PNTP;
  const S = P.setor;
  const { sb, el, toast, ocupado, erroCampo, campo } = P;
  let perm = {}, seq = 0;
  const org = () => P.estado.orgao.id;
  const pode = () => perm.editar && !P.estado.alcanceUnidade;
  const dois = (a, b) => [a, b ? el('span', { class: 'sub-linha' }, b) : null];
  const canais = {};          // registro de atendimento_canais por canal
  let unidades = [], normas = [];

  const GRAUS = { ultrassecreto: 'Ultrassecreto (até 25 anos)', secreto: 'Secreto (até 15 anos)', reservado: 'Reservado (até 5 anos)' };
  const ANOS_GRAU = { ultrassecreto: 25, secreto: 15, reservado: 5 };
  const MOTIVOS_DESC = { prazo: 'Fim do prazo de sigilo', evento: 'Ocorreu o evento que encerrava o sigilo', reavaliacao: 'Reavaliação (de ofício)', recurso: 'Pedido de desclassificação ou recurso', outro: 'Outro' };
  const ABRANGENCIAS = { ano: 'Exercício (anual)', semestre: 'Semestre', trimestre: 'Trimestre', mes: 'Mês' };
  const DIMENSOES = { faixa_etaria: 'Faixa etária', escolaridade: 'Escolaridade', profissao: 'Profissão / ocupação', localidade: 'Localidade (UF ou município)',
    meio: 'Meio de entrada (internet, presencial…)', assunto: 'Assunto', unidade: 'Unidade responsável', motivo_negativa: 'Motivo da negativa', outra: 'Outra' };
  const FUNDAMENTOS = ['Lei 12.527/2011, art. 23, I (defesa e soberania nacionais)', 'Lei 12.527/2011, art. 23, III (vida, segurança ou saúde da população)',
    'Lei 12.527/2011, art. 23, IV (estabilidade financeira, econômica ou monetária)', 'Lei 12.527/2011, art. 23, VI (pesquisa e desenvolvimento científico ou tecnológico)',
    'Lei 12.527/2011, art. 23, VII (segurança de instituições ou de autoridades)', 'Lei 12.527/2011, art. 23, VIII (atividades de inteligência, investigação ou fiscalização)'];

  // ---------- textos sugeridos (o usuário pode reescrever) ----------
  const SUGESTOES = {
    esic: {
      instrucoes: ['## Como fazer um pedido de acesso à informação',
        'Qualquer pessoa, física ou jurídica, pode pedir informações ao órgão. Não é preciso dizer por que quer a informação (Lei 12.527/2011, art. 10, § 3º).', '',
        '- **Pela internet:** use o botão "Fazer pedido pela internet" desta página. Informe seu nome, um documento de identificação, um meio de contato (e-mail ou endereço) e descreva com clareza a informação que procura.',
        '- **Presencialmente:** no Serviço de Informação ao Cidadão (SIC), no endereço e horário informados nesta página. O atendente registra o pedido e entrega o número do protocolo.',
        '- **Por escrito:** carta ou requerimento entregue no SIC.', '',
        'Não é exigido envio de documentos, firma reconhecida, declaração de responsabilidade nem comprovação de maioridade (art. 10, § 1º). Guarde o número do protocolo: com ele você acompanha o pedido e apresenta recurso.', '',
        '## O que acontece depois',
        'Se a informação estiver disponível, ela é entregue de imediato; se não, o órgão responde nos prazos da aba "Prazos e recursos". Se o pedido for negado, a resposta traz o motivo e informa como recorrer. O pedido é gratuito: só pode ser cobrado o custo de reprodução de documentos, quando houver (art. 12).'].join('\n'),
      prazo_resposta: '20 dias, prorrogáveis por mais 10 dias com justificativa expressa (Lei 12.527/2011, art. 11, §§ 1º e 2º).',
      prazo_recurso: '10 dias, contados da ciência da decisão (Lei 12.527/2011, art. 15).',
      prazo_decisao_recurso: '5 dias (Lei 12.527/2011, art. 15, parágrafo único).',
      procedimento_recurso: ['Se o pedido for negado, total ou parcialmente, ou se a resposta não chegar no prazo, você pode recorrer:',
        '1. Apresente o recurso pelo mesmo canal do pedido (internet ou SIC), com o número do protocolo e os motivos da discordância.',
        '2. O recurso é dirigido à autoridade hierarquicamente superior à que respondeu (1ª instância), que decide no prazo indicado acima.',
        '3. Negado o recurso, cabe novo recurso à autoridade de 2ª instância, conforme a norma local que regulamenta a LAI.', '',
        'Recorrer não tem custo.'].join('\n')
    },
    ouvidoria: {
      instrucoes: ['## O que você pode registrar na Ouvidoria',
        '- **Reclamação:** insatisfação com um serviço público ou com o atendimento recebido.',
        '- **Denúncia:** comunicação de irregularidade ou de ato ilícito que precisa ser apurado.',
        '- **Sugestão:** ideia ou proposta para melhorar os serviços.',
        '- **Elogio:** reconhecimento ou satisfação com um serviço ou atendimento.',
        '- **Solicitação:** pedido de atendimento ou de providência.',
        '- **Simplificação:** proposta para simplificar um serviço ou acabar com uma exigência desnecessária.', '',
        'Para pedir acesso a informações públicas (documentos, dados, relatórios), use o e-SIC (Lei 12.527/2011).', '',
        '## Como registrar',
        '- **Pela internet:** use o botão "Registrar manifestação" desta página.',
        '- **Presencialmente ou por telefone:** no endereço, telefone e horário informados nesta página.', '',
        'Não são feitas exigências que dificultem a manifestação, e os dados de quem se manifesta são protegidos (Lei 13.460/2017, art. 10, §§ 1º e 7º). Guarde o número do protocolo para acompanhar a resposta.'].join('\n'),
      prazo_resposta: '30 dias, prorrogáveis uma vez por igual período, com justificativa (Lei 13.460/2017, art. 16).'
    }
  };

  // ---------- leitura comum ----------
  async function carregar(canal) {
    const [c, u, n] = await Promise.all([
      sb.from('atendimento_canais').select('*').eq('orgao_id', org()).eq('canal', canal).maybeSingle(),
      sb.from('unidades').select('id, nome, sigla, endereco, telefone, email, horario_atendimento, ativo').eq('orgao_id', org()).order('nome').limit(500),
      // Candidatas a norma: na ouvidoria, a que institui a ouvidoria ou regulamenta a Lei 13.460; no e-SIC, a da LAI.
      sb.from('publicacoes').select('id, tipo, numero, ano, ementa, situacao').eq('orgao_id', org())
        .or(canal === 'esic' ? 'busca.ilike.*12.527*,busca.ilike.*12527*,busca.ilike.*acesso a informac*'
          : 'busca.ilike.*ouvidoria*,busca.ilike.*13.460*,busca.ilike.*13460*')
        .order('data_publicacao', { ascending: false }).limit(50)
    ]);
    if (c.error) throw c.error;
    canais[canal] = c.data || { canal };
    unidades = u.data || [];
    normas = n.data || [];
  }
  async function carregarOutro(canal) {
    const { data } = await sb.from('atendimento_canais').select('*').eq('orgao_id', org()).eq('canal', canal).maybeSingle();
    canais[canal] = data || { canal };
  }
  const nomeAto = (n) => ({ decreto: 'Decreto', lei: 'Lei', lei_complementar: 'Lei Complementar', portaria: 'Portaria', resolucao: 'Resolução' }[n.tipo] || n.tipo) +
    (n.numero ? ' nº ' + n.numero : '') + '/' + n.ano;


  // ---------- formulário do canal (uma parte dos campos por aba) ----------
  // grupos: [[título, ajuda, [campos]]]; campo = { k, r, t: text|area|url|unidade|norma|texto, ... }
  function formCanal(caixa, canal, grupos, depois) {
    const c = canais[canal] || {};
    const pre = 'at' + (++seq) + '-';
    const mapa = {};
    const editores = {};
    const montar = (x) => {
      const id = pre + x.k;
      if (x.t === 'unidade') {
        const s = el('select', null, el('option', { value: '' }, '— Nenhuma (informar o setor ao lado) —'),
          unidades.map((u) => el('option', { value: u.id, selected: c.unidade_id === u.id }, u.nome + (u.ativo === false ? ' (desativada)' : ''))));
        mapa[x.k] = { input: s };
        return campo(id, x.r, s, x.aj);
      }
      if (x.t === 'norma') {
        const s = el('select', null, el('option', { value: '' }, normas.length ? '— Escolha a norma cadastrada —' : 'Nenhuma publicação encontrada'),
          normas.map((n) => el('option', { value: n.id, selected: c.norma_publicacao === n.id }, nomeAto(n) + ' — ' + n.ementa.slice(0, 70) + (n.situacao === 'publicado' ? '' : ' (rascunho)'))));
        mapa[x.k] = { input: s };
        return campo(id, x.r, s, x.aj);
      }
      if (x.t === 'texto') {
        const ed = P.editorTexto(id, c[x.k], x.linhas || 10);
        editores[x.k] = ed;
        mapa[x.k] = { input: ed.area };
        const usar = SUGESTOES[canal][x.k] ? el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => {
          if (ed.area.value.trim() && !confirm('Substituir o texto atual pelo texto sugerido?')) return;
          ed.area.value = SUGESTOES[canal][x.k]; ed.area.focus();
        } }, 'Usar o texto sugerido') : null;
        return el('div', { class: 'campo' }, el('label', { for: id }, x.r, ' ', usar), ed.elemento || ed, x.aj ? el('span', { class: 'ajuda' }, x.aj) : null,
          el('span', { class: 'erro-campo', id: id + '-erro' }));
      }
      const m = S.montarCampo(x, c[x.k], pre, c);
      mapa[x.k] = m;
      if (SUGESTOES[canal][x.k] && pode()) {
        const usar = el('button', { type: 'button', class: 'btn btn-claro btn-p', style: 'margin-top:4px', onclick: () => { m.input.value = SUGESTOES[canal][x.k]; m.input.focus(); } }, 'Usar o texto sugerido');
        m.el.append(usar);
      }
      return m.el;
    };
    const todos = grupos.flatMap((g) => g[2].flat());
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar');
    const info = el('span', { class: 'ajuda' }, c.atualizado_em ? 'Alterado em ' + P.dataHoraBR(c.atualizado_em) + '.' : 'Ainda não preenchido.');
    const cartoes = grupos.map(([titulo, ajuda, lista, extra]) => el('section', { class: 'cartao' }, el('h2', null, titulo), ajuda ? el('p', { class: 'ajuda' }, ajuda) : null,
      lista.map((x) => Array.isArray(x) ? el('div', { class: 'grade-campos' }, x.map(montar)) : montar(x)), extra ? extra(mapa) : null));
    btn.addEventListener('click', async () => {
      const dados = { orgao_id: org(), canal };
      for (const x of todos) {
        if (x.t === 'unidade' || x.t === 'norma' || x.t === 'texto') { dados[x.k] = mapa[x.k].input.value.trim() || null; continue; }
        const r = S.lerCampo(x, mapa[x.k], pre);
        if (!r.ok) return;
        dados[x.k] = r.valor;
      }
      if (todos.some((x) => x.k === 'email') && dados.email && !P.emailValido(dados.email)) { erroCampo(pre + 'email', 'E-mail inválido.'); return; }
      ocupado(btn, 'Salvando…');
      try {
        const { data, error } = await sb.from('atendimento_canais').upsert(dados, { onConflict: 'orgao_id,canal' }).select('*');
        if (error) throw error;
        if (!data || !data.length) throw P.amigavel('Nada foi gravado: seu perfil não tem permissão.');
        canais[canal] = data[0];
        info.textContent = 'Alterado em ' + P.dataHoraBR(data[0].atualizado_em) + '.';
        toast('Salvo.');
        if (depois) depois();
      } catch (e) { S.mostrarErro(e); } finally { ocupado(btn); }
    });
    caixa.append(...cartoes, el('div', { class: 'secao-parte-acoes', style: 'margin-top:12px' }, pode() ? btn : null, info));
    if (!pode()) for (const i of caixa.querySelectorAll('input, select, textarea, .editor-barra button, .campo label button')) i.disabled = true;
    return caixa;
  }

  // Copia o contato da unidade escolhida para os campos (o usuário confere e salva).
  const copiarDaUnidade = (mapa) => {
    const b = el('button', { type: 'button', class: 'btn btn-claro btn-p' }, 'Copiar da unidade escolhida');
    b.addEventListener('click', () => {
      const u = unidades.find((x) => x.id === (mapa.unidade_id && mapa.unidade_id.input.value));
      if (!u) { toast('Escolha a unidade responsável primeiro (cartão acima).', true); return; }
      const par = { endereco: u.endereco, telefone: u.telefone, email: u.email, horario: u.horario_atendimento };
      for (const [k, v] of Object.entries(par)) if (mapa[k] && v) mapa[k].input.value = v;
      toast('Dados da unidade copiados. Confira e salve.');
    });
    return pode() ? el('p', null, b) : null;
  };

  // ===================================================================
  // COMO PEDIR (12.1 a 12.5) · COMO SE MANIFESTAR (14.1, 14.2)
  // ===================================================================
  function comoPedir(caixa, canal) {
    // Situação do formulário: sistema externo (Destinos), sistema próprio ligado ou desligado.
    let caixaSistema = null, mapaSistema = null;
    const situacaoSistema = (mapa) => { mapaSistema = mapa; caixaSistema = el('div', null, desenharSistema(mapa)); return caixaSistema; };
    const desenharSistema = (mapa) => {
      const c = canais[canal] || {};
      const ext = P.externo(canal === 'esic' ? 'esic_pedidos' : 'ouvidoria_manifestacoes');
      const nome = canal === 'esic' ? '"e-SIC: pedidos"' : '"Ouvidoria: manifestações"';
      const aba = canal === 'esic' ? '"Pedidos"' : '"Manifestações"';
      const lugar = P.estado.permissoes.aparencia && P.estado.permissoes.aparencia.ver ? el('a', { href: '#/m/aparencia?aba=destinos' }, 'Aparência › Destinos das páginas') : el('strong', null, 'Aparência › Destinos das páginas');
      if (ext) {
        if (mapa.sistema_proprio) mapa.sistema_proprio.input.disabled = true;
        return el('div', { class: 'msg msg-info' }, el('p', null, 'Hoje o formulário é o do sistema externo: ', el('a', { href: ext.url, target: '_blank', rel: 'noopener' }, ext.url), ' (', lugar, ', linha ' + nome + ').'),
          el('p', null, 'Para passar a usar o sistema próprio: escolha "Página do portal" nessa linha, volte aqui, marque a caixa e salve. Os ' + (canal === 'esic' ? 'pedidos' : 'registros') + ' antigos continuam no sistema externo; os relatórios do período anterior continuam os que foram digitados.'));
      }
      if (c.sistema_proprio) return el('p', { class: 'msg msg-ok' }, 'Sistema próprio ligado desde ' + P.dataBR(c.sistema_desde) + '. O site recebe ' + (canal === 'esic' ? 'os pedidos na aba "Fazer pedido"' : 'as manifestações na aba "Registrar manifestação"') +
        ' e a fila fica na aba ' + aba + '. Os relatórios estatísticos são gerados e publicados sozinhos desde essa data. Desligar não apaga nada: só deixa de receber pelo site.');
      return el('p', { class: 'msg msg-info' }, 'Para ligar: informe a unidade ou o setor responsável (no alto)' + (canal === 'esic' ? ' e a autoridade que decide o recurso (aba "Prazos e recursos")' : '') + ', marque a caixa e salve.');
    };
    // A situação no PNTP (12.1 a 12.6, 14.1, 14.2 e 15.6) fica no aviso padrão do alto da tela.
    const redesenhar = () => P.atualizarAvisos();
    const esic = canal === 'esic';
    return formCanal(caixa, canal, [
      [esic ? 'Unidade responsável pelo SIC (12.1)' : 'Ouvidoria: unidade e ouvidor', esic ? 'Unidade ou setor que recebe os pedidos de acesso à informação, inclusive os feitos no balcão.' : null, [
        [{ k: 'unidade_id', r: 'Unidade', t: 'unidade', aj: 'Do cadastro de Unidades e gestores.' }, { k: 'setor', r: 'Ou nome do setor', t: 'text', max: 200, ph: esic ? 'Ex.: Serviço de Informação ao Cidadão' : 'Ex.: Ouvidoria-Geral do Município' }],
        [{ k: 'responsavel_nome', r: esic ? 'Responsável pelo SIC' : 'Ouvidor(a)', t: 'text', max: 200 }, { k: 'responsavel_cargo', r: 'Cargo', t: 'text', max: 150 },
          { k: 'responsavel_ato', r: 'Ato de designação', t: 'text', max: 200, ph: 'Ex.: Portaria nº 12/2026' }]]],
      [esic ? 'Atendimento presencial (12.2)' : 'Atendimento presencial (14.1)', 'Em branco, o site usa o endereço, o telefone, o e-mail e o horário da unidade escolhida.', [
        { k: 'endereco', r: 'Endereço', t: 'text', max: 300 },
        [{ k: 'telefone', r: 'Telefone', t: 'text', max: 80 }, { k: 'email', r: 'E-mail', t: 'text', max: 160 }],
        { k: 'horario', r: 'Horário de funcionamento', t: 'text', max: 200, ph: 'Ex.: segunda a sexta, das 7h às 13h' }], copiarDaUnidade],
      [esic ? 'Pedido pela internet (12.3 e 12.4)' : 'Canal eletrônico (14.2)', esic
        ? 'O formulário pode ser o do próprio portal (sem cadastro do cidadão, com protocolo, código de acesso, prazos, recursos e estatísticas automáticas) ou o de um sistema externo (Fala.BR, e-SIC do estado…), informado em Aparência › Destinos das páginas.'
        : 'O canal pode ser o do próprio portal (sem cadastro, com denúncia anônima, protocolo, prazos e estatísticas automáticas) ou o de um sistema externo, informado em Aparência › Destinos das páginas.', [
        { k: 'sistema_proprio', r: esic ? 'Receber os pedidos pelo formulário do próprio portal (sistema próprio)' : 'Receber as manifestações pelo formulário do próprio portal (sistema próprio)', t: 'bool' },
        [{ k: 'aceita_anexos', r: 'Aceitar anexos do cidadão (até 3 por envio, PDF ou imagem, 10 MB)', t: 'bool' },
          { k: 'pesquisa_satisfacao', r: 'Pesquisa de satisfação depois da resposta (PNTP 15.6)', t: 'bool' }],
        [{ k: 'aviso_dias', r: 'Avisar quantos dias antes do vencimento', t: 'int', min: 1, maxv: 30, padrao: 5 },
          { k: 'emails_equipe', r: 'Outros e-mails da equipe (avisos), separados por vírgula', t: 'text', max: 500, ph: 'Ex.: ouvidor@…, apoio@…' }],
        { k: 'outros_canais', r: 'Outras formas', t: 'area', max: 1000, linhas: 2, ph: esic ? 'Ex.: carta entregue no SIC' : 'Ex.: WhatsApp (84) 9…, urna na recepção' },
        { k: 'instrucoes', r: esic ? 'Como fazer o pedido (aparece no site)' : 'Como se manifestar (aparece no site)', t: 'texto', linhas: 12 }].concat(esic ? [] : [
        { k: 'prazo_resposta', r: 'Prazo de resposta (texto do site)', t: 'area', max: 500, linhas: 2 },
        [{ k: 'dias_resposta', r: 'Prazo em dias (contagem do sistema)', t: 'int', min: 1, maxv: 90, aj: 'Em branco: 30 dias (Lei 13.460/2017, art. 16).' },
          { k: 'dias_prorrogacao', r: 'Prorrogação em dias', t: 'int', min: 0, maxv: 90, aj: 'Em branco: mais 30 dias.' }]]), situacaoSistema],
      [esic ? 'Regulamentação da LAI (12.5)' : 'Norma da Ouvidoria (opcional)', esic
        ? 'Norma do órgão que regulamenta a Lei 12.527/2011. Se ela estiver em "Publicações oficiais", escolha na lista; senão, informe o nome e o link.'
        : 'Lei ou decreto que cria a Ouvidoria ou regulamenta a Lei 13.460/2017 no órgão.', [
        { k: 'norma_publicacao', r: 'Publicação cadastrada', t: 'norma' },
        [{ k: 'norma_texto', r: 'Ou identificação da norma', t: 'text', max: 200, ph: 'Ex.: Decreto nº 45/2013' }, { k: 'norma_url', r: 'Link da norma', t: 'url' }]]]
    ], () => { redesenhar(); recarregarAbas(); if (caixaSistema) caixaSistema.replaceChildren(desenharSistema(mapaSistema)); });
    if (canal === 'ouvidoria') caixa.append(P.atendimento.feriados(perm));
    return caixa;
  }

  // ===================================================================
  // PRAZOS E RECURSOS (12.6)
  // ===================================================================
  function prazos(caixa) {
    caixa.append(el('p', { class: 'ajuda' }, 'PNTP 12.6 (recomendada): prazos de resposta e de recurso, autoridades que decidem os recursos e o procedimento, em destaque na página do e-SIC. Os textos sugeridos seguem a LAI; ajuste se a norma local for diferente.'));
    return formCanal(caixa, 'esic', [
      ['Prazos', null, [
        { k: 'prazo_resposta', r: 'Prazo de resposta ao pedido', t: 'area', max: 500, linhas: 2 },
        [{ k: 'prazo_recurso', r: 'Prazo para recorrer', t: 'area', max: 500, linhas: 2 }, { k: 'prazo_decisao_recurso', r: 'Prazo para decidir o recurso', t: 'area', max: 500, linhas: 2 }]]],
      ['Autoridades e procedimento', null, [
        [{ k: 'autoridade_recurso_1', r: 'Autoridade que decide o recurso (1ª instância)', t: 'text', max: 300, ph: 'Ex.: Controlador-Geral do Município' },
          { k: 'autoridade_recurso_2', r: 'Autoridade de 2ª instância', t: 'text', max: 300, ph: 'Ex.: Prefeito Municipal' }],
        { k: 'procedimento_recurso', r: 'Como recorrer (aparece no site)', t: 'texto', linhas: 8 }]],
      ['Contagem dos prazos no sistema próprio', 'Em branco, vale o prazo da LAI. Mude só se a norma local for diferente (e ajuste os textos acima para dizer o mesmo).', [
        [{ k: 'dias_resposta', r: 'Resposta (dias)', t: 'int', min: 1, maxv: 90, aj: 'LAI: 20.' }, { k: 'dias_prorrogacao', r: 'Prorrogação (dias)', t: 'int', min: 0, maxv: 90, aj: 'LAI: 10.' }],
        [{ k: 'dias_recurso', r: 'Para recorrer (dias)', t: 'int', min: 1, maxv: 60, aj: 'LAI: 10.' }, { k: 'dias_decisao_recurso', r: 'Decisão do recurso (dias)', t: 'int', min: 1, maxv: 60, aj: 'LAI: 5.' }],
        [{ k: 'dias_recurso_2', r: 'Para recorrer em 2ª instância (dias)', t: 'int', min: 1, maxv: 60, aj: 'Em branco: o mesmo da 1ª.' },
          { k: 'dias_decisao_recurso_2', r: 'Decisão em 2ª instância (dias)', t: 'int', min: 1, maxv: 60, aj: 'Em branco: o mesmo da 1ª.' }]]]
    ]).append(P.atendimento.feriados(perm)) || caixa;
  }

  // ===================================================================
  // RELATÓRIOS ESTATÍSTICOS (12.7 · ouvidoria)
  // ===================================================================
  const periodoRel = (r) => r.abrangencia === 'ano' ? 'Exercício de ' + r.exercicio
    : r.abrangencia === 'mes' ? S.opMeses[String(r.numero)] + '/' + r.exercicio : r.numero + 'º ' + r.abrangencia + ' de ' + r.exercicio;
  const n = (v) => v === null || v === undefined ? '—' : Number(v).toLocaleString('pt-BR');
  function relatorios(caixa, canal) {
    const esic = canal === 'esic';
    let lst;
    const totais = [
      [{ k: 'exercicio', r: 'Exercício', t: 'int', ob: true, min: 2012, maxv: 2100, padrao: new Date().getFullYear() - 1 }, { k: 'abrangencia', r: 'Período', t: 'sel', op: ABRANGENCIAS },
        { k: 'numero', r: 'Qual (semestre, trimestre ou mês)', t: 'int', min: 1, maxv: 12, aj: 'Em branco no relatório anual.' }],
      [{ k: 'recebidos', r: esic ? 'Pedidos recebidos' : 'Manifestações recebidas', t: 'int', ob: true, min: 0, padrao: 0 },
        { k: 'atendidos', r: esic ? 'Atendidos (deferidos)' : 'Respondidas / concluídas', t: 'int', min: 0 }].concat(esic ? [{ k: 'parciais', r: 'Parcialmente atendidos', t: 'int', min: 0 }] : []),
      [{ k: 'indeferidos', r: esic ? 'Indeferidos (negados)' : 'Arquivadas / não conhecidas', t: 'int', min: 0 }, { k: 'em_andamento', r: 'Em andamento', t: 'int', min: 0 }]
        .concat(esic ? [{ k: 'outros', r: 'Outros (não é pedido de informação, fora da competência…)', t: 'int', min: 0 }] : []),
      (esic ? [{ k: 'recursos_1', r: 'Recursos em 1ª instância', t: 'int', min: 0 }, { k: 'recursos_2', r: 'Recursos em 2ª instância', t: 'int', min: 0 }] : [])
        .concat([{ k: 'prazo_medio_dias', r: 'Prazo médio de resposta (dias)', t: 'num', ph: 'Ex.: 12,5' }])];
    const abasForm = [['totais', 'Período e totais', totais],
      esic ? ['perfil', 'Solicitantes', [
        el('p', { class: 'ajuda' }, 'PNTP 12.7 pede informações genéricas sobre os solicitantes, sem identificar ninguém. Faixa etária, escolaridade, localidade e outras divisões ficam em "Outras distribuições" (depois de salvar).'),
        [{ k: 'pessoas_fisicas', r: 'Pessoas físicas', t: 'int', min: 0 }, { k: 'pessoas_juridicas', r: 'Pessoas jurídicas', t: 'int', min: 0 }],
        [{ k: 'sexo_feminino', r: 'Feminino', t: 'int', min: 0 }, { k: 'sexo_masculino', r: 'Masculino', t: 'int', min: 0 }, { k: 'sexo_nao_informado', r: 'Não informado', t: 'int', min: 0 }]]]
        : ['tipos', 'Manifestações por tipo', [
          [{ k: 'reclamacoes', r: 'Reclamações', t: 'int', min: 0 }, { k: 'denuncias', r: 'Denúncias', t: 'int', min: 0 }, { k: 'sugestoes', r: 'Sugestões', t: 'int', min: 0 }],
          [{ k: 'elogios', r: 'Elogios', t: 'int', min: 0 }, { k: 'solicitacoes', r: 'Solicitações', t: 'int', min: 0 }, { k: 'simplifique', r: 'Simplificação', t: 'int', min: 0 }]]],
      ['documento', 'Relatório completo', [{ k: 'arquivo', r: 'Relatório em PDF (opcional)', t: 'arquivo' },
        { k: 'observacao', r: 'Observação (aparece no site)', t: 'area', max: 4000, linhas: 3 }]]];
    // Campos "soltos" (elementos) não entram no formulário genérico: só os objetos com k.
    const abasOk = abasForm.map(([id, rot, lista]) => [id, rot, lista.filter((x) => !(x instanceof Node))]);
    const avisoPerfil = esic ? el('p', { class: 'msg msg-info' }, abasForm[1][2][0].textContent) : null;
    const abrir = (r) => S.formulario({ tabela: 'atendimento_relatorios', modulo: canal, titulo: 'relatório estatístico', perm, rascunho: true,
      registro: r || { abrangencia: 'ano' }, fixos: { canal }, abas: abasOk, aviso: avisoPerfil, depois: () => lst.recarregar(true), reabrir: 'itens',
      extras: [['itens', 'Outras distribuições', (reg, travado) => S.filhos({ tabela: 'atendimento_relatorios_itens', pai: ['relatorio_id', reg.id], travado, perm, modulo: canal,
        rotulo: 'linha', nome: (l) => DIMENSOES[l.dimensao] + ': ' + l.item, ordem: [['dimensao', true], ['ordem', true], ['item', true]],
        ajuda: 'Quantidades por faixa etária, escolaridade, assunto, unidade, motivo da negativa etc. Cada linha é um item de uma divisão.',
        campos: [[{ k: 'dimensao', r: 'Divisão', t: 'sel', op: DIMENSOES }, { k: 'item', r: 'Item', t: 'text', max: 200, ob: true, ph: 'Ex.: 25 a 39 anos' },
          { k: 'quantidade', r: 'Quantidade', t: 'int', min: 0, ob: true }, { k: 'ordem', r: 'Ordem', t: 'int', min: 0, maxv: 999, padrao: 0 }]],
        colunas: [['Divisão', (l) => DIMENSOES[l.dimensao]], ['Item', (l) => l.item], ['Quantidade', (l) => n(l.quantidade), 'num']] })]],
      validar: (d, situacao) => {
        if (d.abrangencia === 'ano') d.numero = null;
        else {
          const max = { semestre: 2, trimestre: 4, mes: 12 }[d.abrangencia];
          if (!d.numero || d.numero > max) return ['numero', 'Informe de 1 a ' + max + '.'];
        }
        const soma = ['atendidos', 'parciais', 'indeferidos', 'em_andamento', 'outros'].reduce((t, k) => t + (d[k] || 0), 0);
        if (soma > d.recebidos && !confirm('A soma de atendidos, indeferidos, em andamento e outros (' + soma + ') passa do total recebido (' + d.recebidos + '). Pode ser por pedidos de períodos anteriores. Salvar assim mesmo?')) return ['recebidos', 'Confira os totais.'];
        if (esic && situacao === 'publicado' && d.recebidos > 0 && [d.pessoas_fisicas, d.pessoas_juridicas, d.sexo_feminino, d.sexo_masculino, d.sexo_nao_informado].every((v) => v === null))
          return ['pessoas_fisicas', 'Para publicar, informe ao menos um dado genérico dos solicitantes (PNTP 12.7).'];
        return null;
      } });
    const parte = canal + '_relatorios';
    const c = canais[canal] || {};
    const proprio = c.sistema_proprio && !P.externo(canal === 'esic' ? 'esic_pedidos' : 'ouvidoria_manifestacoes');
    const btnGerar = el('button', { type: 'button', class: 'btn btn-claro' }, 'Atualizar agora');
    btnGerar.addEventListener('click', async () => {
      ocupado(btnGerar, 'Atualizando…');
      const { data, error } = await sb.rpc('gerar_relatorios_atendimento', { p_orgao: org(), p_canal: canal });
      ocupado(btnGerar);
      if (error) { S.mostrarErro(error); return; }
      toast(data ? data + ' relatório(s) atualizado(s).' : 'Os relatórios já estavam em dia.');
      lst.recarregar(true);
    });
    caixa.append(proprio ? el('div', { class: 'msg msg-ok' }, el('p', null, 'Sistema próprio ligado desde ' + P.dataBR(c.sistema_desde) + ': os relatórios de mês, trimestre, semestre e ano são gerados e publicados pelo banco a partir da fila, todo dia de madrugada (o período em curso aparece como parcial). Só a observação e o relatório completo em PDF podem ser editados.'),
        pode() ? el('p', null, btnGerar) : null,
        el('p', { class: 'ajuda' }, 'No período em que o sistema começou, abra o relatório e informe em "Parte do sistema anterior" os números de antes da troca: eles são somados aos do portal. Os relatórios dos períodos anteriores continuam manuais.')) : null,
      S.secao(parte, perm, { aoMudarDeclaracao: () => lst && lst.recarregar(true) }),
      el('p', { class: 'ajuda' }, esic
        ? 'PNTP 12.7: relatório anual com os pedidos recebidos, atendidos e indeferidos e informações genéricas dos solicitantes; o site mostra o último exercício encerrado e os 3 anteriores. Relatórios de semestre, trimestre ou mês são opcionais.'
        : 'Lei 13.460/2017, arts. 14 e 15: relatório anual de gestão da Ouvidoria, com o número de manifestações recebidas, os tipos e as respostas.'));
    lst = S.listaAno(caixa, { declaracao: parte, tabela: 'atendimento_relatorios', ordem: 'data_inicio', crescente: false, vazio: 'Nenhum relatório cadastrado.',
      anos: async () => { const { data, error } = await sb.rpc('atendimento_anos', { p_orgao: org(), p_parte: parte }); if (error) throw error; return data || []; },
      filtroAno: (q, ano) => q.eq('canal', canal).eq('exercicio', ano),
      botoes: () => pode() ? [el('button', { type: 'button', class: 'btn btn-primario', onclick: () => abrir() }, '+ Incluir relatório')] : [],
      colunas: [['Período', (r) => dois(el('strong', null, periodoRel(r)), r.origem === 'sistema' ? 'Gerado pelo sistema' + (r.parcial ? ' · parcial (em curso)' : '') + (r.parcela_manual ? ' · com a parte do sistema anterior' : '') : r.observacao)],
        ['Recebidos', (r) => n(r.recebidos), 'num'],
        [esic ? 'Atendidos' : 'Respondidas', (r) => n(r.atendidos), 'num'], [esic ? 'Indeferidos' : 'Arquivadas', (r) => n(r.indeferidos), 'num'],
        ['Prazo médio', (r) => r.prazo_medio_dias !== null ? S.numBR(r.prazo_medio_dias) + ' dias' : '—', 'num'], ['Situação', (r) => S.etiquetaSituacao(r.situacao)]],
      acoes: (l) => l.origem === 'sistema' ? [S.botao(pode() ? 'Editar' : 'Ver', () => abrirSistema(l))]
        : [S.botao(pode() ? 'Editar' : 'Ver', () => abrir(l)), pode() && perm.excluir ? S.botao('Excluir', () => S.excluir('atendimento_relatorios', l, periodoRel(l), () => lst.recarregar(true)), true) : null] });

    // Relatório do sistema: números travados; observação, PDF e, no período da troca, a parte do sistema anterior.
    function abrirSistema(r) {
      const pre = 'rs' + (++seq) + '-';
      const antes = r.data_inicio < c.sistema_desde;
      const pm = r.parcela_manual || {};
      const campos = (esic ? [['recebidos', 'Recebidos'], ['atendidos', 'Atendidos'], ['parciais', 'Parcialmente atendidos'], ['indeferidos', 'Indeferidos'], ['em_andamento', 'Em andamento'],
        ['outros', 'Outros'], ['recursos_1', 'Recursos 1ª instância'], ['recursos_2', 'Recursos 2ª instância'], ['pessoas_fisicas', 'Pessoas físicas'], ['pessoas_juridicas', 'Pessoas jurídicas'],
        ['sexo_feminino', 'Feminino'], ['sexo_masculino', 'Masculino'], ['sexo_nao_informado', 'Sexo não informado']]
        : [['recebidos', 'Recebidas'], ['atendidos', 'Respondidas'], ['indeferidos', 'Arquivadas'], ['em_andamento', 'Em andamento'], ['outros', 'Outras'],
          ['reclamacoes', 'Reclamações'], ['denuncias', 'Denúncias'], ['sugestoes', 'Sugestões'], ['elogios', 'Elogios'], ['solicitacoes', 'Solicitações'], ['simplifique', 'Simplificação']]);
      const entradas = {};
      const obs = el('textarea', { rows: 3, maxlength: 4000 }); obs.value = r.observacao || '';
      const link = el('input', { type: 'url', value: r.link_externo || '', placeholder: 'https://… (relatório completo, opcional)' });
      const pdf = el('input', { type: 'file', accept: 'application/pdf' });
      const pmPrazo = el('input', { type: 'text', inputmode: 'decimal', value: pm.prazo_medio_dias !== undefined ? String(pm.prazo_medio_dias).replace('.', ',') : '' });
      const tabelaNum = el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela' }, el('thead', null, el('tr', null, el('th', null, 'Item'), el('th', { class: 'num' }, 'Total publicado'),
        antes ? el('th', { class: 'num' }, 'Parte do sistema anterior') : null)), el('tbody', null, campos.map(([k, rot]) => {
        const i = antes ? el('input', { type: 'number', min: 0, step: 1, value: pm[k] !== undefined ? pm[k] : '', style: 'width:110px', 'aria-label': rot + ' — sistema anterior' }) : null;
        entradas[k] = i;
        return el('tr', null, el('td', null, rot), el('td', { class: 'num' }, n(r[k])), antes ? el('td', { class: 'num' }, i) : null);
      }))));
      const corpo = el('form', { class: 'form-dialogo', novalidate: true, onsubmit: (e) => e.preventDefault() },
        el('p', { class: 'msg msg-info' }, 'Gerado pelo sistema a partir da fila' + (r.parcial ? ' (período em curso, parcial)' : '') + '. Os números não podem ser digitados.'),
        antes ? el('p', { class: 'ajuda' }, 'Este período começou antes do sistema próprio (' + P.dataBR(c.sistema_desde) + '). Informe na última coluna os números do sistema usado antes: eles são somados aos do portal e o total publicado é refeito ao salvar.') : null,
        tabelaNum, antes ? campo(pre + 'pm', 'Prazo médio do sistema anterior (dias)', pmPrazo) : null,
        campo(pre + 'obs', 'Observação (aparece no site)', obs), el('div', { class: 'grade-campos' }, campo(pre + 'pdf', 'Relatório completo em PDF (opcional)', pdf), campo(pre + 'lk', 'ou link', link)));
      if (!pode()) for (const i of corpo.querySelectorAll('input, textarea')) i.disabled = true;
      const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar');
      const dlg = P.abrirDialogo('Relatório · ' + periodoRel(r), corpo, [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => dlg.close() }, pode() ? 'Cancelar' : 'Fechar')].concat(pode() ? [btn] : []));
      dlg.classList.add('dialogo-largo');
      btn.addEventListener('click', async () => {
        const dados = { observacao: obs.value.trim() || null, link_externo: link.value.trim() || null };
        if (dados.link_externo && !P.urlValida(dados.link_externo)) { P.erroCampo(pre + 'lk', 'Endereço completo, começando com https://'); return; }
        if (antes) {
          const parc = {};
          for (const [k] of campos) { const v = entradas[k].value; if (v !== '') { const x = parseInt(v, 10); if (Number.isNaN(x) || x < 0) { toast('Número inválido em "' + campos.find((y) => y[0] === k)[1] + '".', true); return; } parc[k] = x; } }
          const pz = S.lerNumero(pmPrazo.value);
          if (pz !== null && !Number.isNaN(pz)) parc.prazo_medio_dias = pz;
          dados.parcela_manual = Object.keys(parc).length ? parc : null;
        }
        ocupado(btn, 'Salvando…');
        try {
          if (pdf.files[0]) { P.validarPdf(pdf.files[0]); dados.arquivo_url = await P.enviarArquivo(canal, pdf.files[0], 'pdf', 'application/pdf'); }
          const { error } = await sb.from('atendimento_relatorios').update(dados).eq('id', r.id);
          if (error) throw error;
          if (antes) { const g = await sb.rpc('gerar_relatorios_atendimento', { p_orgao: org(), p_canal: canal }); if (g.error) throw g.error; }
          dlg.close(); toast('Salvo.'); lst.recarregar(true);
        } catch (e) { S.mostrarErro(e); } finally { ocupado(btn); }
      });
    }
    return caixa;
  }

  // ===================================================================
  // INFORMAÇÕES CLASSIFICADAS (12.8) E DESCLASSIFICADAS (12.9)
  // ===================================================================
  function classificadas(caixa, desclassificadas) {
    let lst;
    const abrir = (r) => S.formulario({ tabela: 'informacoes_classificadas', modulo: 'esic', titulo: desclassificadas && !(r && r.id) ? 'informação desclassificada' : 'informação classificada',
      perm, rascunho: true, registro: r || { grau: 'reservado' }, depois: () => lst.recarregar(true), abaInicial: desclassificadas ? 'desc' : null,
      aviso: el('p', { class: 'ajuda' }, 'Descreva o assunto sem revelar o conteúdo sigiloso. O prazo de sigilo conta da data da classificação: reservado até 5 anos, secreto até 15 e ultrassecreto até 25 (LAI, art. 24, § 1º).'),
      abas: [['dados', 'Informação', [
        [{ k: 'codigo', r: 'Código de indexação / processo', t: 'text', max: 100 }, { k: 'grau', r: 'Grau de sigilo', t: 'sel', op: GRAUS }],
        { k: 'assunto', r: 'Assunto (resumo)', t: 'area', max: 1000, linhas: 2, ob: true, minimo: 5 },
        { k: 'fundamento', r: 'Fundamento legal', t: 'text', max: 300, ob: true, minimo: 3, ph: 'Ex.: Lei 12.527/2011, art. 23, VIII', aj: 'Hipóteses do art. 23 da LAI: ' + FUNDAMENTOS.map((f) => f.split(', art. 23, ')[1]).join('; ') + '.' },
        [{ k: 'unidade', r: 'Unidade que guarda a informação', t: 'text', max: 200 }, { k: 'autoridade', r: 'Autoridade que classificou', t: 'text', max: 200 }],
        [{ k: 'data_classificacao', r: 'Data da classificação', t: 'data', ob: true }, { k: 'prazo_fim', r: 'Sigilo até', t: 'data' }],
        { k: 'evento_fim', r: 'Ou evento que encerra o sigilo', t: 'text', max: 300, ph: 'Ex.: conclusão da investigação' },
        { k: 'observacao', r: 'Observação', t: 'area', max: 2000, linhas: 2 }]],
      ['desc', 'Desclassificação', [
        el('p', { class: 'ajuda' }, 'Preencha quando o sigilo terminar ou for retirado. A informação passa a aparecer também em "Informações desclassificadas" (PNTP 12.9).'),
        [{ k: 'data_desclassificacao', r: 'Data da desclassificação', t: 'data' }, { k: 'motivo_desclassificacao', r: 'Motivo', t: 'sel', op: MOTIVOS_DESC, vazio: '—' }]]]]
        .map(([id, rot, l]) => [id, rot, l.filter((x) => !(x instanceof Node))]),
      validar: (d) => {
        if (!d.prazo_fim && !d.evento_fim) return ['prazo_fim', 'Informe a data final do sigilo ou o evento que o encerra.'];
        if (d.prazo_fim && d.prazo_fim <= d.data_classificacao) return ['prazo_fim', 'Precisa ser depois da classificação.'];
        if (d.prazo_fim) {
          const lim = new Date(d.data_classificacao + 'T12:00:00'); lim.setFullYear(lim.getFullYear() + ANOS_GRAU[d.grau]);
          if (d.prazo_fim > lim.toISOString().slice(0, 10)) return ['prazo_fim', 'Passa do prazo máximo do grau (' + ANOS_GRAU[d.grau] + ' anos): até ' + P.dataBR(lim.toISOString().slice(0, 10)) + '.'];
        }
        if (d.data_desclassificacao && !d.motivo_desclassificacao) return ['motivo_desclassificacao', 'Informe o motivo da desclassificação.'];
        if (!d.data_desclassificacao && d.motivo_desclassificacao) return ['data_desclassificacao', 'Informe a data da desclassificação.'];
        if (desclassificadas && !(r && r.id) && !d.data_desclassificacao) return ['data_desclassificacao', 'Informe a data da desclassificação.'];
        if (d.data_desclassificacao && d.data_desclassificacao < d.data_classificacao) return ['data_desclassificacao', 'Não pode ser antes da classificação.'];
        if (d.data_desclassificacao && d.data_desclassificacao > S.hoje()) return ['data_desclassificacao', 'Não pode ser data futura.'];
        return null;
      } });
    const parte = desclassificadas ? 'esic_desclassificadas' : 'esic_classificadas';
    const hoje = S.hoje();
    const sigilo = (r) => r.data_desclassificacao ? el('span', { class: 'etiqueta etiqueta-encerrado' }, 'Desclassificada em ' + P.dataBR(r.data_desclassificacao))
      : r.prazo_fim && r.prazo_fim < hoje ? el('span', { class: 'falta' }, 'Prazo encerrado: registre a desclassificação') : el('span', { class: 'etiqueta etiqueta-ativo' }, 'Em sigilo');
    caixa.append(S.secao(parte, perm, { aoMudarDeclaracao: () => lst && lst.recarregar(true) }),
      el('p', { class: 'ajuda' }, desclassificadas
        ? 'PNTP 12.9: rol das informações desclassificadas nos últimos 12 meses (abas pelo ano da desclassificação). Se não houve, declare acima. Para desclassificar uma informação já cadastrada, abra-a em "Informações classificadas" e preencha a aba Desclassificação.'
        : 'PNTP 12.8: rol dos documentos classificados em cada grau de sigilo, com assunto, grau, fundamento legal e prazo (abas pelo ano da classificação; série de 3 anos). Se não houve classificação no ano, declare acima.'));
    lst = S.listaAno(caixa, { declaracao: parte, tabela: 'informacoes_classificadas', ordem: desclassificadas ? 'data_desclassificacao' : 'data_classificacao', crescente: false,
      vazio: desclassificadas ? 'Nenhuma informação desclassificada.' : 'Nenhuma informação classificada.',
      anos: async () => { const { data, error } = await sb.rpc('atendimento_anos', { p_orgao: org(), p_parte: parte }); if (error) throw error; return data || []; },
      filtroAno: (q, ano) => q.eq(desclassificadas ? 'ano_desclassificacao' : 'exercicio', ano),
      filtros: [{ k: 'grau', r: 'Grau', t: 'sel', op: { ultrassecreto: 'Ultrassecreto', secreto: 'Secreto', reservado: 'Reservado' }, vazio: 'Grau: todos' }]
        .concat(desclassificadas ? [] : [{ k: 'sigilo', r: 'Situação', t: 'sel', op: { sigilo: 'Em sigilo', desclassificada: 'Desclassificadas' }, vazio: 'Situação: todas',
          aplicar: (q, v) => v === 'sigilo' ? q.is('data_desclassificacao', null) : q.not('data_desclassificacao', 'is', null) }])
        .concat([{ k: 'busca', r: 'Pesquisar', t: 'busca', ph: 'Assunto, código, fundamento ou autoridade' }]),
      botoes: () => pode() ? [el('button', { type: 'button', class: 'btn btn-primario', onclick: () => abrir() }, desclassificadas ? '+ Incluir informação desclassificada' : '+ Incluir informação classificada')] : [],
      colunas: [['Assunto', (r) => dois(el('strong', null, r.assunto), r.codigo), 'quebra'], ['Grau', (r) => GRAUS[r.grau].split(' (')[0]],
        ['Fundamento', (r) => r.fundamento, 'quebra'], ['Classificação', (r) => dois(P.dataBR(r.data_classificacao), r.autoridade), 'num'],
        ['Sigilo até', (r) => r.prazo_fim ? P.dataBR(r.prazo_fim) : r.evento_fim, 'quebra'],
        desclassificadas ? ['Desclassificação', (r) => dois(P.dataBR(r.data_desclassificacao), MOTIVOS_DESC[r.motivo_desclassificacao])] : ['Situação', sigilo],
        ['No site', (r) => S.etiquetaSituacao(r.situacao)]],
      acoes: (l) => [S.botao(pode() ? 'Editar' : 'Ver', () => abrir(l)), pode() && perm.excluir ? S.botao('Excluir', () => S.excluir('informacoes_classificadas', l, l.assunto.slice(0, 60), () => lst.recarregar(true)), true) : null] });
    return caixa;
  }

  // ===================================================================
  // TELAS
  // ===================================================================
  async function iniciar(c, mod, p, canal, abas, sub) {
    perm = p;
    c.replaceChildren(el('h1', null, mod.nome), el('p', { class: 'sub' }, 'Carregando…'));
    try { await Promise.all([S.carregarSecoes(), carregar(canal)]); if (canal === 'ouvidoria') await carregarOutro('esic'); }
    catch (e) { c.querySelector('.sub').textContent = /atendimento_canais|Could not find|does not exist/i.test((e && e.message) || '') ? 'Falta rodar o script 24 no banco.' : S.faltaScript(e); return; }
    abasTela = P.abas(abas, new URLSearchParams(location.hash.split('?')[1] || '').get('aba'));
    c.replaceChildren(...[S.cabecalho(mod.nome, sub), S.avisoSetorial(perm), abasTela].filter(Boolean));
  }
  const caixa = () => el('div');

  // ctx da fila: canal, permissões e dados já carregados (canal e unidades).
  const ctxFila = (canal) => ({ canal, perm, canalReg: () => canais[canal], unidades: () => unidades });
  let abasTela = null;
  const recarregarAbas = () => { if (abasTela) for (const id of ['esic-pedidos', 'ouv-manifestacoes', 'esic-relatorios', 'ouv-relatorios', 'ouv-satisfacao']) abasTela.recarregar(id); };

  P.telas.esic = (c, mod, p) => iniciar(c, mod, p, 'esic', [
    ['esic-como', 'Como pedir', () => comoPedir(caixa(), 'esic')],
    ['esic-pedidos', 'Pedidos', () => { const x = caixa(); P.atendimento.fila(x, ctxFila('esic')); return x; }, null, 'esic_pedidos'],
    ['esic-prazos', 'Prazos e recursos', () => prazos(caixa())],
    ['esic-relatorios', 'Relatórios estatísticos', () => relatorios(caixa(), 'esic'), null, 'esic_relatorios'],
    ['esic-classificadas', 'Informações classificadas', () => classificadas(caixa(), false), null, 'esic_classificadas'],
    ['esic-desclassificadas', 'Informações desclassificadas', () => classificadas(caixa(), true), null, 'esic_desclassificadas']
  ], 'Serviço de Informação ao Cidadão: unidade responsável, contatos, formulário eletrônico (próprio ou externo), fila dos pedidos, norma da LAI, prazos e recursos, relatórios estatísticos e rol das informações classificadas e desclassificadas (PNTP 12.1 a 12.9).');

  P.telas.ouvidoria = (c, mod, p) => iniciar(c, mod, p, 'ouvidoria', [
    ['ouv-como', 'Como se manifestar', () => comoPedir(caixa(), 'ouvidoria')],
    ['ouv-manifestacoes', 'Manifestações', () => { const x = caixa(); P.atendimento.fila(x, ctxFila('ouvidoria')); return x; }, null, 'ouvidoria_manifestacoes'],
    ['ouv-relatorios', 'Relatórios estatísticos', () => relatorios(caixa(), 'ouvidoria'), null, 'ouvidoria_relatorios'],
    ['ouv-satisfacao', 'Pesquisa de satisfação', () => { const x = caixa(); P.atendimento.satisfacao(x, perm, canais); return x; }, null, 'ouvidoria_satisfacao']
  ], 'Atendimento presencial e canal eletrônico da Ouvidoria, com o ouvidor, os tipos de manifestação e o prazo de resposta (PNTP 14.1 e 14.2), a fila das manifestações, os relatórios estatísticos e a pesquisa de satisfação (15.6).');
})();
