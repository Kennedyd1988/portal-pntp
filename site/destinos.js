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
  ['receitas', 'Receitas', null, '3.1–3.3', 'Transparência'],
  ['despesas', 'Despesas (empenhos, liquidações e pagamentos)', null, '4.1–4.3', 'Transparência'],
  ['ordem_cronologica', 'Ordem cronológica de pagamentos', null, '9.4', 'Transparência'],
  ['pessoal', 'Pessoal e folha de pagamento', null, '6.1–6.5', 'Transparência'],
  ['diarias', 'Diárias', null, '7.1–7.2', 'Transparência'],
  ['convenios', 'Convênios e transferências', '/convenios', '5.1–5.3', 'Transparência'],
  ['emendas', 'Emendas parlamentares', '/emendas', '17.1–17.3', 'Transparência'],
  ['licitacoes', 'Licitações', '/licitacoes', '8.1–8.5', 'Transparência'],
  ['pca', 'Plano de contratações anual (PCA)', '/licitacoes/pca', '8.6', 'Transparência'],
  ['sancionados', 'Licitantes e contratados sancionados', '/licitacoes/sancionados', '8.7', 'Transparência'],
  ['contratos', 'Contratos', '/contratos', '9.1–9.2', 'Transparência'],
  ['fiscais', 'Fiscais de contratos', '/contratos/fiscais', '9.3', 'Transparência'],
  ['obras', 'Obras', '/obras', '10.1–10.4', 'Transparência'],
  ['planejamento', 'Planejamento e prestação de contas', '/planejamento', '11.1–11.10', 'Transparência'],
  ['renuncias', 'Renúncias de receita', null, '16.1–16.4', 'Transparência'],
  ['saude', 'Saúde', null, '18.1–18.6', 'Transparência'],
  ['educacao', 'Educação', null, '19.1–19.4', 'Transparência'],
  ['concursos', 'Concursos e processos seletivos', null, '6.6–6.7', 'Transparência'],
  ['esic', 'e-SIC (acesso à informação)', '/esic', '12.1–12.9', 'Atendimento e publicações'],
  ['ouvidoria', 'Ouvidoria', '/ouvidoria', '14.1–14.2', 'Atendimento e publicações'],
  ['carta_servicos', 'Carta de Serviços ao Usuário', '/servicos', '14.3', 'Atendimento e publicações'],
  ['servicos_online', 'Serviços on-line', '/servicos-online', '15.3', 'Atendimento e publicações'],
  ['diario_oficial', 'Diário Oficial', '/diario-oficial', '', 'Atendimento e publicações'],
  ['publicacoes', 'Publicações oficiais', '/publicacoes', '2.6', 'Atendimento e publicações']
];

// Resolve o destino de uma chave para o órgão: { href, externo, rotulo } ou null (sem destino).
window.destinoPNTP = function (conf, chave) {
  const d = window.DESTINOS_PNTP.find((x) => x[0] === chave);
  if (!d) return null;
  const ext = ((conf || {}).destinos || {})[chave];
  if (ext) return { href: ext, externo: true, rotulo: d[1] };
  if (d[2]) return { href: '#' + d[2], externo: false, rotulo: d[1] };
  return conf && conf.transparencia_url ? { href: conf.transparencia_url, externo: true, rotulo: d[1] } : null;
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
