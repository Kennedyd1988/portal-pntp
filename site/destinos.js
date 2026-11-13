// =====================================================================
// Destinos das páginas (Portal PNTP · SOFT+) — fonte ÚNICA, usada pelo
// site e pelo painel (Aparência › Destinos das páginas).
// Para cada página, o órgão escolhe: página do próprio portal (cadastro ou
// importação) ou link externo. Menu, capa da Transparência, página inicial,
// mapa do site e busca perguntam aqui — assim nenhum botão aponta para um
// lugar e outro para outro.
// Gravado em orgaos.configuracoes.destinos = { chave: 'https://…' }.
// Sem link gravado: vai para a rota interna; se a página ainda não existe no
// portal (rota nula), vai para o Portal da Transparência externo
// (configuracoes.transparencia_url).
// [chave, rótulo, rota interna (ou null), critério PNTP, grupo]
// =====================================================================
window.DESTINOS_PNTP = [
  ['receitas', 'Receitas', '/receitas', '3.1–3.3', 'Transparência'],
  ['despesas', 'Despesas (empenhos, liquidações e pagamentos)', '/despesas', '4.1–4.3', 'Transparência'],
  ['ordem_cronologica', 'Ordem cronológica de pagamentos', '/ordem-cronologica', '9.4', 'Transparência'],
  ['pessoal', 'Pessoal e folha de pagamento', '/pessoal', '6.1–6.5', 'Transparência'],
  ['diarias', 'Diárias', '/diarias', '7.1–7.2', 'Transparência'],
  ['convenios', 'Convênios e transferências', '/convenios', '5.1–5.3', 'Transparência'],
  ['emendas', 'Emendas parlamentares', '/emendas', '17.1–17.3', 'Transparência'],
  ['licitacoes', 'Licitações', '/licitacoes', '8.1–8.5', 'Transparência'],
  ['pca', 'Plano de contratações anual (PCA)', '/licitacoes/pca', '8.6', 'Transparência'],
  ['sancionados', 'Licitantes e contratados sancionados', '/licitacoes/sancionados', '8.7', 'Transparência'],
  ['contratos', 'Contratos', '/contratos', '9.1–9.2', 'Transparência'],
  ['fiscais', 'Fiscais de contratos', '/contratos/fiscais', '9.3', 'Transparência'],
  ['obras', 'Obras', '/obras', '10.1–10.4', 'Transparência'],
  ['planejamento', 'Planejamento e prestação de contas', '/planejamento', '11.1–11.10', 'Transparência'],
  ['renuncias', 'Renúncias de receita', '/renuncias', '16.1–16.4', 'Transparência'],
  ['saude', 'Saúde', '/saude', '18.1–18.6', 'Transparência'],
  ['educacao', 'Educação e assistência social', '/educacao', '19.1–19.4', 'Transparência'],
  ['concursos', 'Concursos e processos seletivos', '/concursos', '6.6–6.7', 'Transparência'],
  // Partes de cada página: a chave é a mesma da seção no painel (secoes_setoriais). Sem link
  // próprio, a parte segue o link da página inteira (externoPNTP).
  ['receitas_arrecadacao', 'Receitas: previsão e arrecadação por natureza', '/receitas/arrecadacao', '3.1–3.2', 'Receitas (por parte)'],
  ['receitas_divida_ativa', 'Receitas: inscritos em dívida ativa', '/receitas/divida-ativa', '3.3', 'Receitas (por parte)'],
  ['pessoal_servidores', 'Pessoal: servidores e lotação', '/pessoal/servidores', '6.1', 'Pessoal (por parte)'],
  ['pessoal_remuneracao', 'Pessoal: remuneração nominal', '/pessoal/remuneracao', '6.2', 'Pessoal (por parte)'],
  ['pessoal_cargos', 'Pessoal: tabela de cargos e salários', '/pessoal/cargos', '6.3', 'Pessoal (por parte)'],
  ['pessoal_estagiarios', 'Pessoal: estagiários', '/pessoal/estagiarios', '6.4', 'Pessoal (por parte)'],
  ['pessoal_terceirizados', 'Pessoal: terceirizados', '/pessoal/terceirizados', '6.5', 'Pessoal (por parte)'],
  ['diarias_concedidas', 'Diárias: concedidas', '/diarias/concedidas', '7.1', 'Diárias (por parte)'],
  ['diarias_tabela', 'Diárias: tabela de valores', '/diarias/tabela', '7.2', 'Diárias (por parte)'],
  ['renuncias_desoneracoes', 'Renúncias: desonerações e fundamento legal', '/renuncias/desoneracoes', '16.1', 'Renúncias de receita (por parte)'],
  ['renuncias_valores', 'Renúncias: previsto × realizado', '/renuncias/valores', '16.2', 'Renúncias de receita (por parte)'],
  ['renuncias_beneficiarios', 'Renúncias: beneficiários', '/renuncias/beneficiarios', '16.3', 'Renúncias de receita (por parte)'],
  ['renuncias_incentivos', 'Renúncias: incentivo à cultura e ao esporte', '/renuncias/incentivos', '16.4', 'Renúncias de receita (por parte)'],
  ['saude_documentos', 'Saúde: plano, programação e relatório de gestão', '/saude/planos', '18.1', 'Saúde (por parte)'],
  ['saude_servicos', 'Saúde: serviços, horários e profissionais', '/saude/servicos', '18.2', 'Saúde (por parte)'],
  ['saude_espera', 'Saúde: lista de espera da regulação', '/saude/lista-de-espera', '18.3', 'Saúde (por parte)'],
  ['saude_medicamentos', 'Saúde: medicamentos do SUS', '/saude/medicamentos', '18.4', 'Saúde (por parte)'],
  ['saude_estoque', 'Saúde: estoque das farmácias', '/saude/estoque', '18.5', 'Saúde (por parte)'],
  ['saude_conselho', 'Saúde: Conselho de Saúde', '/saude/conselho', '18.6', 'Saúde (por parte)'],
  ['educacao_documentos', 'Educação: plano e relatório de resultados', '/educacao/plano', '19.1', 'Educação e assistência social (por parte)'],
  ['educacao_creches', 'Educação: lista de espera das creches', '/educacao/creches', '19.2', 'Educação e assistência social (por parte)'],
  ['educacao_fundeb', 'Educação: Conselho do Fundeb', '/educacao/fundeb', '19.3', 'Educação e assistência social (por parte)'],
  ['educacao_assistencia', 'Assistência social: Conselho e planos', '/educacao/assistencia-social', '19.4', 'Educação e assistência social (por parte)'],
  ['esic', 'e-SIC (acesso à informação)', '/esic', '12.1–12.9', 'Atendimento e publicações'],
  ['ouvidoria', 'Ouvidoria', '/ouvidoria', '14.1–14.2', 'Atendimento e publicações'],
  ['carta_servicos', 'Carta de Serviços ao Usuário', '/servicos', '14.3', 'Atendimento e publicações'],
  ['servicos_online', 'Serviços on-line', '/servicos-online', '15.3', 'Atendimento e publicações'],
  ['diario_oficial', 'Diário Oficial', '/diario-oficial', '', 'Atendimento e publicações'],
  ['publicacoes', 'Publicações oficiais', '/publicacoes', '2.6', 'Atendimento e publicações']
];

// Tabelas comuns da classificação orçamentária (site e painel): nomes padronizados
// das funções de governo (Portaria MOG 42/1999), categorias, grupos e modalidades de
// aplicação da despesa (Portaria Interministerial STN/SOF 163/2001) e as modalidades
// de contratação de origem do empenho.
window.CLASSIF_PNTP = {
  funcoes: { '01': 'Legislativa', '02': 'Judiciária', '03': 'Essencial à Justiça', '04': 'Administração', '05': 'Defesa Nacional', '06': 'Segurança Pública',
    '07': 'Relações Exteriores', '08': 'Assistência Social', '09': 'Previdência Social', '10': 'Saúde', '11': 'Trabalho', '12': 'Educação', '13': 'Cultura',
    '14': 'Direitos da Cidadania', '15': 'Urbanismo', '16': 'Habitação', '17': 'Saneamento', '18': 'Gestão Ambiental', '19': 'Ciência e Tecnologia',
    '20': 'Agricultura', '21': 'Organização Agrária', '22': 'Indústria', '23': 'Comércio e Serviços', '24': 'Comunicações', '25': 'Energia', '26': 'Transporte',
    '27': 'Desporto e Lazer', '28': 'Encargos Especiais', '99': 'Reserva de Contingência' },
  categorias: { '3': 'Despesas Correntes', '4': 'Despesas de Capital', '9': 'Reserva de Contingência' },
  grupos: { '31': 'Pessoal e Encargos Sociais', '32': 'Juros e Encargos da Dívida', '33': 'Outras Despesas Correntes', '44': 'Investimentos',
    '45': 'Inversões Financeiras', '46': 'Amortização da Dívida', '99': 'Reserva de Contingência' },
  modalidades: { '20': 'Transferências à União', '30': 'Transferências a Estados e ao Distrito Federal', '31': 'Transferências a Estados e ao DF - Fundo a Fundo',
    '40': 'Transferências a Municípios', '41': 'Transferências a Municípios - Fundo a Fundo', '50': 'Transferências a Instituições Privadas sem Fins Lucrativos',
    '60': 'Transferências a Instituições Privadas com Fins Lucrativos', '70': 'Transferências a Instituições Multigovernamentais',
    '71': 'Transferências a Consórcios Públicos (contrato de rateio)', '80': 'Transferências ao Exterior', '90': 'Aplicações Diretas',
    '91': 'Aplicação Direta entre Órgãos, Fundos e Entidades dos Orçamentos Fiscal e da Seguridade', '99': 'A Definir' },
  contratacao: { pregao_eletronico: 'Pregão eletrônico', pregao_presencial: 'Pregão presencial', concorrencia_eletronica: 'Concorrência eletrônica',
    concorrencia_presencial: 'Concorrência presencial', concurso: 'Concurso', leilao_eletronico: 'Leilão eletrônico', leilao_presencial: 'Leilão presencial',
    dialogo_competitivo: 'Diálogo competitivo', credenciamento: 'Credenciamento', pre_qualificacao: 'Pré-qualificação', manifestacao_interesse: 'Manifestação de interesse',
    chamada_publica: 'Chamada pública', tomada_precos: 'Tomada de preços', convite: 'Convite', dispensa: 'Dispensa de licitação', inexigibilidade: 'Inexigibilidade',
    adesao_ata: 'Adesão a ata de registro de preços', outra: 'Outra', nao_se_aplica: 'Não se aplica (folha, encargos, diárias, transferências…)' },
  categoriasOC: { bens: 'Fornecimento de bens', locacoes: 'Locações', servicos: 'Prestação de serviços', obras: 'Realização de obras' },
  // Art. 141, § 1º, da Lei 14.133/2021.
  motivosOC: { emergencia: 'I · Grave perturbação da ordem, emergência ou calamidade pública',
    pequenas_empresas: 'II · Microempresa, EPP, agricultor familiar, produtor rural, MEI ou cooperativa, com risco de descontinuidade do contrato',
    sistemas_estruturantes: 'III · Serviços necessários ao funcionamento dos sistemas estruturantes, com risco de descontinuidade',
    falencia: 'IV · Direitos de contrato em caso de falência, recuperação judicial ou dissolução da contratada',
    patrimonio_essencial: 'V · Objeto imprescindível ao patrimônio público ou às atividades finalísticas, com risco de descontinuidade' }
};

// Resolve o destino de uma chave para o órgão: { href, externo, rotulo } ou null (sem destino).
window.destinoPNTP = function (conf, chave) {
  const d = window.DESTINOS_PNTP.find((x) => x[0] === chave);
  if (!d) return null;
  const ext = window.externoPNTP(conf, chave);
  if (ext) return { href: ext, externo: true, rotulo: d[1] };
  if (d[2]) return { href: '#' + d[2], externo: false, rotulo: d[1] };
  return conf && conf.transparencia_url ? { href: conf.transparencia_url, externo: true, rotulo: d[1] } : null;
};

// Link externo de uma chave. As partes (grupos "… (por parte)") herdam o link da página
// inteira: "saude_espera" sem link próprio usa o de "saude".
window.externoPNTP = function (conf, chave) {
  const dest = (conf || {}).destinos || {};
  if (dest[chave]) return dest[chave];
  const d = window.DESTINOS_PNTP.find((x) => x[0] === chave);
  if (!d || !/\(por parte\)$/.test(d[4]) || !d[2]) return null;
  const pai = window.DESTINOS_PNTP.find((x) => x[2] && d[2].startsWith(x[2] + '/') && !/\(por parte\)$/.test(x[4]));
  return pai && dest[pai[0]] ? dest[pai[0]] : null;
};

// Rota interna → chave (para o site desviar quando o órgão escolheu link externo).
// A rota mais longa ganha: "/licitacoes/pca" antes de "/licitacoes".
window.chaveDaRotaPNTP = function (rota) {
  const r = '/' + String(rota || '').replace(/^#?\/?/, '').split('?')[0].replace(/\/$/, '');
  let melhor = null;
  for (const d of window.DESTINOS_PNTP) {
    if (d[2] && (r === d[2] || r.startsWith(d[2] + '/')) && (!melhor || d[2].length > melhor[2].length)) melhor = d;
  }
  // "/licitacoes/todos" é a própria relação de licitações; "/licitacoes/xyz" de outra chave não cai aqui.
  return melhor ? melhor[0] : null;
};
