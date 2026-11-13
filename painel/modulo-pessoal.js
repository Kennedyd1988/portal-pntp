// =====================================================================
// Módulos "Pessoal e folha de pagamento" (PNTP 6.1 a 6.5) e "Diárias"
// (7.1 e 7.2).
//   6.1 servidores, autoridades e membros: cargo, função, vínculo, lotação,
//       admissão, desligamento e carga horária (CPF nunca vai ao site);
//   6.2 remuneração nominal de cada mês; 6.3 tabela de cargos e salários;
//   6.4 estagiários; 6.5 terceirizados (nome, função e empresa).
//   7.1 diárias pagas: beneficiário, cargo, destino, motivo, período,
//       quantidade e valor; 7.2 tabela de valores (estado, fora do estado,
//       exterior).
// Dados da folha e das diárias vêm dos sistemas do órgão: sem rascunho.
// =====================================================================
(function () {
  'use strict';
  const P = window.PNTP;
  const S = P.setor;
  const { sb, el, ocupado } = P;
  const VINCULOS = { efetivo: 'Efetivo', comissionado: 'Comissionado', temporario: 'Contratado temporário', eletivo: 'Agente político (eletivo)', celetista: 'Empregado (CLT)',
    cedido: 'Cedido', requisitado: 'Requisitado', aposentado: 'Aposentado', pensionista: 'Pensionista', outro: 'Outro' };
  const DESLIG = { exoneracao: 'Exoneração', demissao: 'Demissão', aposentadoria: 'Aposentadoria', falecimento: 'Falecimento', fim_contrato: 'Fim do contrato', fim_mandato: 'Fim do mandato', outro: 'Outro' };
  const FOLHAS = { mensal: 'Mensal', decimo_terceiro: '13º salário', ferias: 'Férias', rescisao: 'Rescisão', complementar: 'Complementar', adiantamento: 'Adiantamento' };
  const TIPOS_CARGO = { efetivo: 'Cargo efetivo', comissao: 'Cargo em comissão', funcao_gratificada: 'Função gratificada', temporario: 'Contrato temporário', eletivo: 'Agente político (subsídio)', outro: 'Outro' };
  const NIVEIS = { medio: 'Ensino médio', tecnico: 'Técnico', superior: 'Superior', pos: 'Pós-graduação' };
  const ABR_DIARIA = { estado: 'No estado', fora_estado: 'Fora do estado', exterior: 'Exterior' };
  const ABR_TABELA = { estado: 'Dentro do estado', capital: 'Capital do estado', fora_estado: 'Fora do estado', brasilia: 'Brasília/DF', exterior: 'Exterior', outra: 'Outra' };
  let perm = {};
  const org = () => P.estado.orgao.id;
  const pode = () => perm.editar && !P.estado.alcanceUnidade;
  const dois = (a, b) => [a, b ? el('span', { class: 'sub-linha' }, b) : null];
  const anoAtual = () => new Date().getFullYear();
  const acoes = (tabela, abrir, nome, lst) => (l) => [S.botao(pode() ? 'Editar' : 'Ver', () => abrir(l)),
    pode() ? S.botao('Excluir', () => S.excluir(tabela, l, nome(l), () => lst().recarregar(true)), true) : null];
  const datasOk = (d, ini, fim, rot) => d[ini] && d[fim] && d[fim] < d[ini] ? [fim, rot || 'Não pode ser antes do início.'] : null;

  // ===================================================================
  // 6.1 SERVIDORES
  // ===================================================================
  function servidores(caixa) {
    let lst;
    const abrir = (r) => S.formulario({ tabela: 'pessoal_vinculos', modulo: 'pessoal', titulo: 'servidor / agente público', perm, registro: r, depois: () => lst.recarregar(true),
      abas: [['dados', 'Servidor', [
        [{ k: 'nome', r: 'Nome completo', t: 'text', max: 200, ob: true, minimo: 3 }, { k: 'matricula', r: 'Matrícula', t: 'text', max: 30 },
          { k: 'documento', r: 'CPF', t: 'doc', doc: 'cpf', aj: 'Só para conferência: não aparece no site.' }],
        [{ k: 'cargo', r: 'Cargo', t: 'text', max: 150, ob: true, minimo: 2, ph: 'Ex.: Professor' }, { k: 'funcao', r: 'Função ou cargo em comissão exercido', t: 'text', max: 150, ph: 'Ex.: Diretor escolar' },
          { k: 'vinculo', r: 'Vínculo', t: 'sel', op: VINCULOS }],
        [{ k: 'lotacao', r: 'Lotação', t: 'text', max: 200, ph: 'Ex.: Escola Municipal São José' }, { k: 'carga_horaria', r: 'Carga horária', t: 'text', max: 40, ph: 'Ex.: 40 horas semanais' }],
        [{ k: 'data_admissao', r: 'Data de admissão / posse', t: 'data', ob: true }, { k: 'data_desligamento', r: 'Data do desligamento', t: 'data' },
          { k: 'motivo_desligamento', r: 'Motivo do desligamento', t: 'sel', op: DESLIG, vazio: '—' }]]]],
      validar: (d) => datasOk(d, 'data_admissao', 'data_desligamento', 'Não pode ser antes da admissão.') ||
        (d.data_desligamento && !d.motivo_desligamento ? ['motivo_desligamento', 'Informe o motivo do desligamento.'] : null) });
    caixa.append(S.secao('pessoal_servidores', perm, { naoHa: false }),
      el('p', { class: 'ajuda' }, 'PNTP 6.1: relação nominal de servidores, autoridades e agentes políticos com cargo, função, vínculo, lotação, data de admissão e carga horária. Quem saiu continua na lista com a data do desligamento (série histórica).'));
    lst = S.listaAno(caixa, { tabela: 'pessoal_vinculos', ordem: 'nome', crescente: true, vazio: 'Nenhum servidor cadastrado.',
      filtros: [{ k: 'situacao', r: 'Situação', t: 'sel', op: { ativos: 'No quadro', desligados: 'Desligados' }, vazio: 'Situação: todos',
          aplicar: (q, v) => v === 'ativos' ? q.is('data_desligamento', null) : q.not('data_desligamento', 'is', null) },
        { k: 'vinculo', r: 'Vínculo', t: 'sel', op: VINCULOS, vazio: 'Vínculo: todos' }, { k: 'busca', r: 'Pesquisar', t: 'busca', ph: 'Nome, matrícula, cargo ou lotação' }],
      botoes: () => pode() ? [el('button', { type: 'button', class: 'btn btn-primario', onclick: () => abrir() }, '+ Incluir servidor')] : [],
      colunas: [['Servidor', (r) => dois(el('strong', null, r.nome), r.matricula ? 'Matrícula ' + r.matricula : null), 'quebra'],
        ['Cargo e função', (r) => dois(r.cargo, r.funcao)], ['Vínculo', (r) => VINCULOS[r.vinculo]], ['Lotação', (r) => dois(r.lotacao || '—', r.carga_horaria)],
        ['Admissão', (r) => P.dataBR(r.data_admissao), 'num'],
        ['Desligamento', (r) => r.data_desligamento ? dois(P.dataBR(r.data_desligamento), DESLIG[r.motivo_desligamento]) : '—', 'num']],
      acoes: acoes('pessoal_vinculos', abrir, (r) => r.nome, () => lst) });
    return caixa;
  }

  // ===================================================================
  // 6.2 REMUNERAÇÃO NOMINAL
  // ===================================================================
  function remuneracao(caixa) {
    let lst;
    const abrir = (r) => S.formulario({ tabela: 'pessoal_remuneracoes', modulo: 'pessoal', titulo: 'remuneração', perm, depois: () => lst.recarregar(true),
      registro: r || { exercicio: lst && lst.ano() || anoAtual(), mes: new Date().getMonth() + 1, folha: 'mensal' },
      abas: [['dados', 'Remuneração do mês', [
        [{ k: 'exercicio', r: 'Ano', t: 'int', min: 1990, maxv: 2100, ob: true }, { k: 'mes', r: 'Mês', t: 'sel', op: S.opMeses }, { k: 'folha', r: 'Folha', t: 'sel', op: FOLHAS }],
        [{ k: 'nome', r: 'Nome', t: 'text', max: 200, ob: true, minimo: 3 }, { k: 'matricula', r: 'Matrícula', t: 'text', max: 30 }],
        [{ k: 'cargo', r: 'Cargo', t: 'text', max: 150, ob: true, minimo: 2 }, { k: 'vinculo', r: 'Vínculo', t: 'sel', op: VINCULOS, vazio: '—' }, { k: 'lotacao', r: 'Lotação', t: 'text', max: 200 }],
        [{ k: 'remuneracao_basica', r: 'Remuneração básica (R$)', t: 'num' }, { k: 'vantagens', r: 'Vantagens e gratificações (R$)', t: 'num' },
          { k: 'eventuais', r: 'Eventuais: 13º, férias, horas extras (R$)', t: 'num' }, { k: 'indenizacoes', r: 'Indenizações e auxílios (R$)', t: 'num' }],
        [{ k: 'bruto', r: 'Total bruto (R$)', t: 'num', aj: 'Em branco: soma das parcelas acima.' }, { k: 'descontos', r: 'Descontos obrigatórios (R$)', t: 'num', aj: 'Previdência, IR e demais.' },
          { k: 'liquido', r: 'Líquido (R$)', t: 'num', aj: 'Em branco: bruto menos descontos.' }]]]],
      validar: (d) => {
        d.mes = Number(d.mes);
        const partes = ['remuneracao_basica', 'vantagens', 'eventuais', 'indenizacoes'].map((k) => d[k]).filter((v) => v !== null);
        if (d.bruto === null) { if (!partes.length) return ['bruto', 'Informe o total bruto ou as parcelas.']; d.bruto = Math.round(partes.reduce((t, v) => t + v, 0) * 100) / 100; }
        if (d.descontos === null) d.descontos = 0;
        if (d.liquido === null) d.liquido = Math.round((d.bruto - d.descontos) * 100) / 100;
        return null;
      } });
    caixa.append(S.secao('pessoal_remuneracao', perm, { naoHa: false }),
      el('p', { class: 'ajuda' }, 'PNTP 6.2: remuneração nominal de cada servidor, autoridade e agente político, mês a mês (bruto, descontos e líquido, com as parcelas). A folha costuma entrar por importação do sistema de pessoal.'));
    lst = S.listaAno(caixa, { tabela: 'pessoal_remuneracoes', anos: S.anosFinanceiros('pessoal_remuneracoes'), ordem: 'nome', crescente: true, vazio: 'Nenhuma folha lançada.',
      aoTrocarAno: async (ano) => {
        const { data } = await sb.from('pessoal_remuneracoes').select('mes').eq('orgao_id', org()).eq('exercicio', ano).order('mes', { ascending: false }).limit(1);
        return { mes: data && data[0] ? String(data[0].mes) : '' };
      },
      filtros: [{ k: 'mes', r: 'Mês', t: 'sel', op: S.opMeses, vazio: 'Todos os meses' }, { k: 'folha', r: 'Folha', t: 'sel', op: FOLHAS, vazio: 'Folha: todas' },
        { k: 'busca', r: 'Pesquisar', t: 'busca', ph: 'Nome, matrícula, cargo ou lotação' }],
      botoes: () => pode() ? [el('button', { type: 'button', class: 'btn btn-primario', onclick: () => abrir() }, '+ Incluir remuneração')] : [],
      colunas: [['Nome', (r) => dois(el('strong', null, r.nome), r.matricula ? 'Matrícula ' + r.matricula : null), 'quebra'],
        ['Cargo', (r) => dois(r.cargo, [VINCULOS[r.vinculo], r.lotacao].filter(Boolean).join(' · '))],
        ['Mês', (r) => dois(S.MESES[r.mes - 1].slice(0, 3) + '/' + r.exercicio, r.folha !== 'mensal' ? FOLHAS[r.folha] : null), 'num'],
        ['Bruto', (r) => S.moeda(r.bruto), 'num'], ['Descontos', (r) => S.moeda(r.descontos), 'num'], ['Líquido', (r) => S.moeda(r.liquido), 'num']],
      acoes: acoes('pessoal_remuneracoes', abrir, (r) => r.nome + ' (' + S.MESES[r.mes - 1] + ')', () => lst) });
    return caixa;
  }

  // ===================================================================
  // 6.3 CARGOS E SALÁRIOS
  // ===================================================================
  function cargos(caixa) {
    let lst;
    const abrir = (r) => S.formulario({ tabela: 'pessoal_cargos', modulo: 'pessoal', titulo: 'cargo ou função', perm, registro: r, depois: () => lst.recarregar(true),
      abas: [['dados', 'Cargo', [
        [{ k: 'cargo', r: 'Cargo ou função', t: 'text', max: 150, ob: true, minimo: 2 }, { k: 'tipo', r: 'Tipo', t: 'sel', op: TIPOS_CARGO }],
        [{ k: 'referencia', r: 'Nível, classe ou referência', t: 'text', max: 60, ph: 'Ex.: Nível I, classe A' }, { k: 'carga_horaria', r: 'Carga horária', t: 'text', max: 40 },
          { k: 'vencimento', r: 'Vencimento / subsídio (R$)', t: 'num', ob: true }],
        [{ k: 'norma', r: 'Lei que fixa o valor', t: 'text', max: 300, ph: 'Ex.: Lei nº 790/2022 (Plano de Carreira do Magistério)' }, { k: 'norma_url', r: 'Link da lei', t: 'url' }],
        [{ k: 'vigencia_inicio', r: 'Vigente desde', t: 'data' }, { k: 'vigencia_fim', r: 'Vigente até', t: 'data' }, { k: 'ordem', r: 'Ordem na tabela', t: 'int', min: 0, maxv: 9999, padrao: 0 }]]]],
      validar: (d) => datasOk(d, 'vigencia_inicio', 'vigencia_fim') });
    caixa.append(S.secao('pessoal_cargos', perm, { naoHa: false, texto: { rotulo: 'Observação da tabela (aparece no site)', linhas: 2,
        ajuda: 'Ex.: "Tabela vigente em 2026; reajuste do magistério pela Lei nº 850/2026." Se a tabela não muda há mais de um ano, confirme aqui que continua vigente.' } }),
      el('p', { class: 'ajuda' }, 'PNTP 6.3 (recomendada): padrão remuneratório dos cargos efetivos, em comissão, funções gratificadas e subsídios, com a lei que fixa cada valor.'));
    lst = S.listaAno(caixa, { tabela: 'pessoal_cargos', ordem: 'ordem', crescente: true, vazio: 'Nenhum cargo cadastrado.',
      filtros: [{ k: 'tipo', r: 'Tipo', t: 'sel', op: TIPOS_CARGO, vazio: 'Tipo: todos' }, { k: 'busca', r: 'Pesquisar', t: 'busca', ph: 'Cargo, referência ou lei' }],
      botoes: () => pode() ? [el('button', { type: 'button', class: 'btn btn-primario', onclick: () => abrir() }, '+ Incluir cargo')] : [],
      colunas: [['Cargo', (r) => dois(el('strong', null, r.cargo), r.referencia), 'quebra'], ['Tipo', (r) => TIPOS_CARGO[r.tipo]], ['Carga horária', (r) => r.carga_horaria || '—'],
        ['Vencimento', (r) => S.moeda(r.vencimento), 'num'], ['Lei', (r) => r.norma || '—', 'quebra'],
        ['Vigência', (r) => r.vigencia_inicio || r.vigencia_fim ? (P.dataBR(r.vigencia_inicio) || '…') + ' a ' + (P.dataBR(r.vigencia_fim) || 'atual') : '—', 'num']],
      acoes: acoes('pessoal_cargos', abrir, (r) => r.cargo, () => lst) });
    return caixa;
  }

  // ===================================================================
  // 6.4 ESTAGIÁRIOS
  // ===================================================================
  function estagiarios(caixa) {
    let lst;
    const abrir = (r) => S.formulario({ tabela: 'pessoal_estagiarios', modulo: 'pessoal', titulo: 'estagiário', perm, registro: r, depois: () => lst.recarregar(true),
      abas: [['dados', 'Estagiário', [
        [{ k: 'nome', r: 'Nome', t: 'text', max: 200, ob: true, minimo: 3 }, { k: 'nivel', r: 'Nível', t: 'sel', op: NIVEIS, vazio: '—' }],
        [{ k: 'instituicao', r: 'Instituição de ensino', t: 'text', max: 200 }, { k: 'curso', r: 'Curso', t: 'text', max: 150 }],
        [{ k: 'lotacao', r: 'Lotação', t: 'text', max: 200 }, { k: 'carga_horaria', r: 'Carga horária', t: 'text', max: 40 }, { k: 'bolsa', r: 'Bolsa (R$)', t: 'num' }],
        [{ k: 'data_inicio', r: 'Início do estágio', t: 'data', ob: true }, { k: 'data_fim', r: 'Término previsto', t: 'data', ob: true }, { k: 'data_desligamento', r: 'Encerrado antes, em', t: 'data' }]]]],
      validar: (d) => datasOk(d, 'data_inicio', 'data_fim') || datasOk(d, 'data_inicio', 'data_desligamento') });
    caixa.append(S.secao('pessoal_estagiarios', perm, { naoHa: 'O órgão não tem estagiários.' }),
      el('p', { class: 'ajuda' }, 'PNTP 6.4 (recomendada): lista dos estagiários com a lotação e o período do estágio.'));
    const hoje = S.hoje();
    lst = S.listaAno(caixa, { tabela: 'pessoal_estagiarios', ordem: 'nome', crescente: true, vazio: 'Nenhum estagiário cadastrado.',
      filtros: [{ k: 'situacao', r: 'Situação', t: 'sel', op: { ativos: 'Em estágio', encerrados: 'Encerrados' }, vazio: 'Situação: todos',
          aplicar: (q, v) => v === 'ativos' ? q.is('data_desligamento', null).gte('data_fim', hoje) : q.or('data_desligamento.not.is.null,data_fim.lt.' + hoje) },
        { k: 'busca', r: 'Pesquisar', t: 'busca', ph: 'Nome, instituição, curso ou lotação' }],
      botoes: () => pode() ? [el('button', { type: 'button', class: 'btn btn-primario', onclick: () => abrir() }, '+ Incluir estagiário')] : [],
      colunas: [['Estagiário', (r) => dois(el('strong', null, r.nome), [r.curso, NIVEIS[r.nivel]].filter(Boolean).join(' · ')), 'quebra'], ['Instituição', (r) => r.instituicao || '—'],
        ['Lotação', (r) => dois(r.lotacao || '—', r.carga_horaria)], ['Bolsa', (r) => S.moeda(r.bolsa), 'num'],
        ['Período', (r) => dois(P.dataBR(r.data_inicio) + ' a ' + P.dataBR(r.data_fim), r.data_desligamento ? 'Encerrado em ' + P.dataBR(r.data_desligamento) : null), 'num']],
      acoes: acoes('pessoal_estagiarios', abrir, (r) => r.nome, () => lst) });
    return caixa;
  }

  // ===================================================================
  // 6.5 TERCEIRIZADOS
  // ===================================================================
  function terceirizados(caixa) {
    let lst;
    const abrir = (r) => S.formulario({ tabela: 'pessoal_terceirizados', modulo: 'pessoal', titulo: 'terceirizado', perm, depois: () => lst.recarregar(true),
      registro: r || { exercicio: lst && lst.ano() || anoAtual() },
      abas: [['dados', 'Terceirizado', [
        [{ k: 'exercicio', r: 'Exercício', t: 'int', min: 1990, maxv: 2100, ob: true }, { k: 'nome', r: 'Nome', t: 'text', max: 200, ob: true, minimo: 3 },
          { k: 'documento', r: 'CPF', t: 'doc', doc: 'cpf', aj: 'Aparece mascarado no site.' }],
        [{ k: 'funcao', r: 'Função', t: 'text', max: 150, ob: true, minimo: 2, ph: 'Ex.: Vigilante' }, { k: 'lotacao', r: 'Local de trabalho', t: 'text', max: 200 }],
        [{ k: 'empresa', r: 'Empresa empregadora', t: 'text', max: 200, ob: true, minimo: 2 }, { k: 'empresa_cnpj', r: 'CNPJ da empresa', t: 'doc', doc: 'cnpj', ph: 'CNPJ' },
          { k: 'contrato_numero', r: 'Contrato', t: 'text', max: 60 }],
        [{ k: 'data_inicio', r: 'Início', t: 'data' }, { k: 'data_fim', r: 'Fim', t: 'data' }]]]],
      validar: (d) => datasOk(d, 'data_inicio', 'data_fim') });
    // Repete a lista de um exercício no seguinte (a maior parte dos terceirizados continua).
    async function copiar() {
      const ano = lst.ano();
      if (!ano) return;
      if (!await P.confirmar('Copiar a lista', 'Copiar os terceirizados de ' + ano + ' para ' + (ano + 1) + '? Depois é só tirar quem saiu e incluir quem entrou.', 'Copiar')) return;
      try {
        const { data, error } = await sb.from('pessoal_terceirizados').select('nome, documento, funcao, empresa, empresa_cnpj, contrato_numero, contrato_id, lotacao, data_inicio, data_fim')
          .eq('orgao_id', org()).eq('exercicio', ano).limit(5000);
        if (error) throw error;
        const linhas = (data || []).filter((x) => !x.data_fim || x.data_fim >= (ano + 1) + '-01-01').map((x) => Object.assign({}, x, { orgao_id: org(), exercicio: ano + 1 }));
        if (!linhas.length) return P.aviso('Nada a copiar', 'Ninguém da lista de ' + ano + ' continua no ano seguinte (todos com fim antes de ' + (ano + 1) + ').');
        const r = await sb.from('pessoal_terceirizados').insert(linhas).select('id');
        if (r.error) throw r.error;
        P.toast(linhas.length + ' pessoa(s) copiada(s) para ' + (ano + 1) + '.');
        await lst.irPara(ano + 1);
      } catch (e) { S.mostrarErro(e); }
    }
    caixa.append(S.secao('pessoal_terceirizados', perm, { naoHa: 'O órgão não tem trabalhadores terceirizados.' }),
      el('p', { class: 'ajuda' }, 'PNTP 6.5 (recomendada): trabalhadores terceirizados que prestam serviço ao órgão, com nome, função e empresa empregadora, por exercício.'));
    lst = S.listaAno(caixa, { tabela: 'pessoal_terceirizados', anos: S.anosFinanceiros('pessoal_terceirizados'), ordem: 'nome', crescente: true, vazio: 'Nenhum terceirizado cadastrado.',
      filtros: [{ k: 'busca', r: 'Pesquisar', t: 'busca', ph: 'Nome, função, empresa ou CNPJ' }],
      botoes: () => pode() ? [el('button', { type: 'button', class: 'btn btn-primario', onclick: () => abrir() }, '+ Incluir terceirizado'),
        el('button', { type: 'button', class: 'btn btn-claro', onclick: copiar }, 'Copiar a lista para o ano seguinte')] : [],
      colunas: [['Nome', (r) => dois(el('strong', null, r.nome), r.documento ? P.formatarDoc(r.documento) : null), 'quebra'], ['Função', (r) => dois(r.funcao, r.lotacao)],
        ['Empresa', (r) => dois(r.empresa, [r.empresa_cnpj && P.formatarDoc(r.empresa_cnpj), r.contrato_numero && 'contrato ' + r.contrato_numero].filter(Boolean).join(' · ')), 'quebra'],
        ['Período', (r) => r.data_inicio || r.data_fim ? (P.dataBR(r.data_inicio) || '…') + ' a ' + (P.dataBR(r.data_fim) || '…') : '—', 'num']],
      acoes: acoes('pessoal_terceirizados', abrir, (r) => r.nome, () => lst) });
    return caixa;
  }

  // ===================================================================
  // 7.1 DIÁRIAS CONCEDIDAS · 7.2 TABELA DE VALORES
  // ===================================================================
  function diarias(caixa) {
    let lst;
    const abrir = (r) => S.formulario({ tabela: 'diarias', modulo: 'diarias', titulo: 'diária', perm, registro: r || { abrangencia: 'estado' }, depois: () => lst.recarregar(true),
      abas: [['dados', 'Diária', [
        [{ k: 'nome', r: 'Beneficiário', t: 'text', max: 200, ob: true, minimo: 3 }, { k: 'documento', r: 'CPF', t: 'doc', doc: 'cpf', aj: 'Só para conferência: não aparece no site.' }],
        [{ k: 'cargo', r: 'Cargo ou função', t: 'text', max: 150, ob: true, minimo: 2 }, { k: 'unidade', r: 'Unidade / secretaria', t: 'text', max: 200 }],
        [{ k: 'destino', r: 'Destino', t: 'text', max: 200, ob: true, minimo: 2, ph: 'Ex.: Natal/RN' }, { k: 'abrangencia', r: 'Abrangência', t: 'sel', op: ABR_DIARIA }],
        { k: 'motivo', r: 'Motivo da viagem', t: 'area', max: 1000, ob: true, minimo: 3, linhas: 2 },
        [{ k: 'data_inicio', r: 'Saída', t: 'data', ob: true }, { k: 'data_fim', r: 'Retorno', t: 'data', ob: true }, { k: 'quantidade', r: 'Nº de diárias', t: 'num', ob: true, ph: 'Ex.: 2,5' }],
        [{ k: 'valor_unitario', r: 'Valor da diária (R$)', t: 'num' }, { k: 'valor_total', r: 'Valor total (R$)', t: 'num', aj: 'Em branco: nº de diárias × valor da diária.' },
          { k: 'data_pagamento', r: 'Pago em', t: 'data' }],
        [{ k: 'empenho_numero', r: 'Empenho', t: 'text', max: 30 }, { k: 'ato_concessao', r: 'Ato de concessão', t: 'text', max: 120, ph: 'Ex.: Portaria nº 98/2026' }]]]],
      validar: (d) => {
        const e = datasOk(d, 'data_inicio', 'data_fim', 'O retorno não pode ser antes da saída.'); if (e) return e;
        if (!(d.quantidade > 0)) return ['quantidade', 'Informe o número de diárias.'];
        if (d.valor_total === null) { if (d.valor_unitario === null) return ['valor_total', 'Informe o valor total ou o valor da diária.']; d.valor_total = Math.round(d.quantidade * d.valor_unitario * 100) / 100; }
        return null;
      } });
    const resumo = (ano) => {
      const box = el('div', { class: 'ajuda', style: 'margin:6px 0 10px' });
      sb.from('diarias').select('valor_total, quantidade').eq('orgao_id', org()).eq('exercicio', ano).limit(10000).then(({ data }) => {
        const l = data || [];
        box.replaceChildren(el('strong', null, ano + ': ' + l.length + ' concessão(ões), ' + S.numBR(l.reduce((t, x) => t + Number(x.quantidade), 0)) + ' diárias, ' + S.moeda(l.reduce((t, x) => t + Number(x.valor_total), 0)) + '.'));
      });
      return box;
    };
    caixa.append(S.secao('diarias_concedidas', perm, { naoHa: 'Não houve concessão de diárias no período.' }),
      el('p', { class: 'ajuda' }, 'PNTP 7.1: nome e cargo de quem recebeu, destino, motivo, período, número de diárias e valor total de cada concessão.'));
    lst = S.listaAno(caixa, { tabela: 'diarias', anos: S.anosFinanceiros('diarias'), ordem: 'data_inicio', crescente: false, vazio: 'Nenhuma diária cadastrada.',
      filtros: [{ k: 'abrangencia', r: 'Abrangência', t: 'sel', op: ABR_DIARIA, vazio: 'Abrangência: todas' }, { k: 'busca', r: 'Pesquisar', t: 'busca', ph: 'Nome, cargo, destino ou motivo' }],
      rodape: resumo,
      botoes: () => pode() ? [el('button', { type: 'button', class: 'btn btn-primario', onclick: () => abrir() }, '+ Incluir diária')] : [],
      colunas: [['Beneficiário', (r) => dois(el('strong', null, r.nome), [r.cargo, r.unidade].filter(Boolean).join(' · ')), 'quebra'],
        ['Destino e motivo', (r) => dois(r.destino + ' · ' + (ABR_DIARIA[r.abrangencia] || ''), r.motivo), 'quebra'],
        ['Período', (r) => P.dataBR(r.data_inicio) + (r.data_fim !== r.data_inicio ? ' a ' + P.dataBR(r.data_fim) : ''), 'num'],
        ['Diárias', (r) => S.numBR(r.quantidade), 'num'], ['Valor', (r) => dois(S.moeda(r.valor_total), r.valor_unitario !== null ? S.moeda(r.valor_unitario) + ' cada' : null), 'num']],
      acoes: acoes('diarias', abrir, (r) => r.nome + ' · ' + P.dataBR(r.data_inicio), () => lst) });
    return caixa;
  }

  function tabelaDiarias(caixa) {
    let lst;
    const abrir = (r) => S.formulario({ tabela: 'diarias_valores', modulo: 'diarias', titulo: 'valor de diária', perm, registro: r || { moeda: 'BRL' }, depois: () => lst.recarregar(true),
      abas: [['dados', 'Valor', [
        [{ k: 'grupo', r: 'Quem recebe (grupo de cargos)', t: 'text', max: 200, ob: true, minimo: 2, ph: 'Ex.: Secretários municipais' }, { k: 'abrangencia', r: 'Destino', t: 'sel', op: ABR_TABELA }],
        [{ k: 'destino_descricao', r: 'Descrição do destino', t: 'text', max: 200, ph: 'Ex.: municípios a mais de 200 km' }, { k: 'valor', r: 'Valor da diária', t: 'num', ob: true },
          { k: 'moeda', r: 'Moeda', t: 'sel', op: { BRL: 'Real (R$)', USD: 'Dólar (US$)', EUR: 'Euro (€)' } }],
        [{ k: 'norma', r: 'Norma que fixa o valor', t: 'text', max: 300, ob: true, minimo: 3, ph: 'Ex.: Decreto nº 15/2025' }, { k: 'norma_url', r: 'Link da norma', t: 'url' }],
        [{ k: 'vigencia_inicio', r: 'Vigente desde', t: 'data' }, { k: 'vigencia_fim', r: 'Vigente até', t: 'data' }, { k: 'ordem', r: 'Ordem na tabela', t: 'int', min: 0, maxv: 999, padrao: 0 }]]]],
      validar: (d) => datasOk(d, 'vigencia_inicio', 'vigencia_fim') });
    caixa.append(S.secao('diarias_tabela', perm, { naoHa: false, texto: { rotulo: 'Observação da tabela (aparece no site)', linhas: 2,
        ajuda: 'O PNTP pede os valores dentro do estado, fora do estado e no exterior. Se não há previsão de viagem ao exterior, escreva aqui: "Não há previsão de diárias para viagens ao exterior."' } }),
      el('p', { class: 'ajuda' }, 'PNTP 7.2 (recomendada): valores das diárias por grupo de cargos e destino, conforme a norma local.'));
    lst = S.listaAno(caixa, { tabela: 'diarias_valores', ordem: 'ordem', crescente: true, vazio: 'Nenhum valor cadastrado.',
      botoes: () => pode() ? [el('button', { type: 'button', class: 'btn btn-primario', onclick: () => abrir() }, '+ Incluir valor')] : [],
      colunas: [['Grupo', (r) => el('strong', null, r.grupo), 'quebra'], ['Destino', (r) => dois(ABR_TABELA[r.abrangencia], r.destino_descricao)],
        ['Valor', (r) => r.moeda === 'BRL' ? S.moeda(r.valor) : r.moeda + ' ' + S.numBR(r.valor), 'num'], ['Norma', (r) => r.norma, 'quebra'],
        ['Vigência', (r) => r.vigencia_inicio || r.vigencia_fim ? (P.dataBR(r.vigencia_inicio) || '…') + ' a ' + (P.dataBR(r.vigencia_fim) || 'atual') : '—', 'num']],
      acoes: acoes('diarias_valores', abrir, (r) => r.grupo + ' · ' + ABR_TABELA[r.abrangencia], () => lst) });
    return caixa;
  }

  async function iniciar(c, mod, p, abas, sub) {
    perm = p;
    c.replaceChildren(el('h1', null, mod.nome), el('p', { class: 'sub' }, 'Carregando…'));
    try {
      await S.carregarSecoes();
      const { error } = await sb.from('pessoal_cargos').select('id', { head: true, count: 'exact' }).eq('orgao_id', org());
      if (error) throw error;
    } catch (e) { c.querySelector('.sub').textContent = /pessoal_cargos|Could not find|does not exist/i.test((e && e.message) || '') ? 'Falta rodar o script 22 no banco.' : S.faltaScript(e); return; }
    c.replaceChildren(...[S.cabecalho(mod.nome, sub), S.avisoSetorial(perm),
      el('p', { class: 'msg msg-info' }, 'Os dados entram no ar ao salvar (sem rascunho). A importação de arquivos do sistema de pessoal será liberada na próxima etapa; até lá, inclua ou corrija aqui.'),
      P.abas(abas)].filter(Boolean));
  }
  const caixa = () => el('div');

  P.telas.pessoal = (c, mod, p) => iniciar(c, mod, p, [
    ['pes-servidores', 'Servidores', () => servidores(caixa())],
    ['pes-remuneracao', 'Remuneração', () => remuneracao(caixa())],
    ['pes-cargos', 'Cargos e salários', () => cargos(caixa())],
    ['pes-estagiarios', 'Estagiários', () => estagiarios(caixa())],
    ['pes-terceirizados', 'Terceirizados', () => terceirizados(caixa())]
  ], 'Servidores e agentes políticos, remuneração mês a mês, tabela de cargos e salários, estagiários e terceirizados (PNTP 6.1 a 6.5). Concursos e seleções ficam no módulo próprio.');

  P.telas.diarias = (c, mod, p) => iniciar(c, mod, p, [
    ['dia-concedidas', 'Diárias concedidas', () => diarias(caixa())],
    ['dia-tabela', 'Tabela de valores', () => tabelaDiarias(caixa())]
  ], 'Diárias pagas, com o beneficiário, destino, motivo, período e valor, e a tabela de valores conforme a norma local (PNTP 7.1 e 7.2).');
})();
