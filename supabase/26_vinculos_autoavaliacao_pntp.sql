-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 26 — Vínculos protegidos e autoavaliação automática do PNTP 2026
--
-- Rodar no SQL Editor DEPOIS do 25. Pode rodar mais de uma vez.
--
-- Parte 1: nenhum registro ligado a outro pode ser excluído. Antes, excluir um
-- contrato apagava junto os aditivos e os fiscais, excluir uma licitação deixava
-- os empenhos sem a licitação de origem, e assim por diante. Agora o banco recusa
-- a exclusão enquanto houver registros ligados (o painel diz quais).
-- Ficam como estavam, de propósito:
--   · tudo o que depende do órgão (excluir um órgão é ação deliberada da SOFT+);
--   · login da pessoa (usuarios): o histórico guarda quem fez, mesmo sem o login;
--   · peças internas: permissões do perfil, contador de visualizações da notícia,
--     linhas do relatório estatístico e o miolo de cada pedido do e-SIC/Ouvidoria.
-- "NO ACTION" (e não "RESTRICT") deixa a exclusão do órgão inteiro funcionar: a
-- conferência acontece no fim do comando, quando os ligados também já saíram.
-- =====================================================================

do $$
declare
  k record;
  def text;
begin
  for k in
    select c.oid, c.conname, c.conrelid::regclass as tabela, c.confrelid::regclass as alvo, a.attname as coluna, pg_get_constraintdef(c.oid) as definicao
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace
      and c.confdeltype in ('c', 'n', 'r', 'd')
      and a.attname <> 'orgao_id'
      and c.confrelid not in ('public.usuarios'::regclass, 'auth.users'::regclass)
      and c.conrelid not in ('public.perfil_permissoes'::regclass, 'public.noticias_visualizacoes'::regclass,
                             'public.atendimento_relatorios_itens'::regclass)
      and not (c.confrelid in ('public.atendimentos'::regclass, 'public.atendimentos_tramites'::regclass)
               and c.conrelid::text like 'atendimentos\_%')
  loop
    def := regexp_replace(k.definicao, '\s+ON DELETE (CASCADE|SET NULL|RESTRICT|SET DEFAULT)', '', 'i');
    execute format('alter table %s drop constraint %I', k.tabela, k.conname);
    execute format('alter table %s add constraint %I %s', k.tabela, k.conname, def);
    raise notice 'Vínculo protegido: %.% → %', k.tabela, k.coluna, k.alvo;
  end loop;
end $$;

-- =====================================================================
-- Parte 2: autoavaliação automática do PNTP 2026 (Cartilha e Matriz 2026)
--
-- pntp_criterios: os 96 critérios da prefeitura (matriz comum 72, matriz do
--   Poder Executivo 23 e o 11.6, comum a Executivo e consórcios), com a
--   classificação (essencial 2, obrigatória 1,5, recomendada 1), o peso da
--   dimensão (4 a 1), os itens de verificação que valem para cada um
--   (D disponibilidade 3, A atualidade 3, S série histórica 2, G gravação de
--   relatórios 1, F filtro de pesquisa 1) e onde corrigir no painel.
-- avaliacao_pntp(órgão): para cada critério, o que o banco consegue conferir
--   com os dados do próprio portal. Nota do critério = soma dos pesos dos itens
--   atendidos ÷ soma dos pesos dos itens que valem para ele; sem disponibilidade,
--   nenhum outro item conta. Página que leva a sistema externo (Destinos das
--   páginas) conta como atendida e vem marcada "externo": conferir lá.
--   Declaração de que não há dados atende disponibilidade, filtro e gravação;
--   atualidade e série histórica seguem o período declarado (Cartilha 2026).
-- avaliacao_pntp_resumo(órgão): índice estimado = Σ(peso da dimensão × peso do
--   critério × nota) ÷ Σ(peso da dimensão × peso do critério); nível pela tabela
--   do PNTP (Diamante, Ouro e Prata exigem 100% dos essenciais).
-- É ESTIMATIVA: o que é subjetivo (qualidade de textos, conteúdo dos PDFs,
-- sistemas externos) cabe à conferência do próprio órgão; a nota oficial é a do
-- Tribunal de Contas.
-- =====================================================================

create table if not exists public.pntp_criterios (
  codigo         text primary key,
  ordem          integer not null,
  dimensao       text not null,
  peso_dimensao  numeric not null,
  titulo         text not null,
  classificacao  text not null check (classificacao in ('essencial', 'obrigatoria', 'recomendada')),
  matriz         text not null check (matriz in ('comum', 'executivo', 'executivo_consorcio')),
  itens          text not null,            -- letras D A S G F que valem para o critério
  modulo         text,                     -- módulo do painel (permissão e link); nulo = atendido pelo próprio sistema
  rota           text,                     -- onde corrigir no painel
  pagina         text                      -- onde conferir no site
);
alter table public.pntp_criterios enable row level security;
drop policy if exists pntp_criterios_ler on public.pntp_criterios;
create policy pntp_criterios_ler on public.pntp_criterios for select using (true);
grant select on public.pntp_criterios to anon, authenticated;

insert into public.pntp_criterios (codigo, ordem, dimensao, peso_dimensao, titulo, classificacao, matriz, itens, modulo, rota, pagina) values
  ('1.1',   101, 'Informações prioritárias', 2, 'Site oficial próprio, no domínio do órgão', 'essencial', 'comum', 'D', 'aparencia', '#/m/aparencia?aba=identidade', '/'),
  ('1.2',   102, 'Informações prioritárias', 2, 'Portal da transparência (próprio ou compartilhado)', 'essencial', 'comum', 'D', null, null, '/transparencia'),
  ('1.3',   103, 'Informações prioritárias', 2, 'Acesso ao portal da transparência na página inicial', 'obrigatoria', 'comum', 'D', null, null, '/'),
  ('1.4',   104, 'Informações prioritárias', 2, 'Ferramenta de pesquisa no site e no portal', 'obrigatoria', 'comum', 'D', null, null, '/busca'),
  ('2.1',   201, 'Informações institucionais', 2, 'Estrutura organizacional e a norma que a institui', 'obrigatoria', 'comum', 'D', 'institucional', '#/m/institucional', '/estrutura'),
  ('2.2',   202, 'Informações institucionais', 2, 'Competências e atribuições das unidades', 'obrigatoria', 'comum', 'D', 'institucional', '#/m/institucional', '/estrutura'),
  ('2.3',   203, 'Informações institucionais', 2, 'Nome dos atuais responsáveis pela gestão', 'obrigatoria', 'comum', 'D', 'institucional', '#/m/institucional', '/gestores'),
  ('2.4',   204, 'Informações institucionais', 2, 'Endereços, telefones e e-mails institucionais', 'obrigatoria', 'comum', 'D', 'aparencia', '#/m/aparencia?aba=contatos', '/contato'),
  ('2.5',   205, 'Informações institucionais', 2, 'Horário de atendimento', 'obrigatoria', 'comum', 'D', 'aparencia', '#/m/aparencia?aba=contatos', '/contato'),
  ('2.6',   206, 'Informações institucionais', 2, 'Atos normativos próprios', 'obrigatoria', 'comum', 'DGF', 'publicacoes', '#/m/publicacoes', '/publicacoes'),
  ('2.7',   207, 'Informações institucionais', 2, 'Perguntas e respostas frequentes', 'obrigatoria', 'comum', 'D', 'paginas', '#/m/paginas', '/perguntas'),
  ('2.8',   208, 'Informações institucionais', 2, 'Links das redes sociais do órgão', 'recomendada', 'comum', 'D', 'aparencia', '#/m/aparencia?aba=contatos', '/'),
  ('2.9',   209, 'Informações institucionais', 2, 'Botão do Radar Nacional da Transparência Pública', 'recomendada', 'comum', 'D', null, null, '/'),
  ('3.1',   301, 'Receita', 4, 'Receitas: previsão e arrecadação', 'essencial', 'comum', 'DASGF', 'financeiro', '#/m/financeiro?aba=fin-receitas', '/receitas'),
  ('3.2',   302, 'Receita', 4, 'Receita por natureza (categoria, origem, espécie, desdobramento)', 'essencial', 'executivo', 'DASGF', 'financeiro', '#/m/financeiro?aba=fin-receitas', '/receitas'),
  ('3.3',   303, 'Receita', 4, 'Inscritos em dívida ativa (nome e valor)', 'obrigatoria', 'executivo', 'DAGF', 'financeiro', '#/m/financeiro?aba=fin-divida', '/receitas/divida-ativa'),
  ('4.1',   401, 'Despesa', 4, 'Despesas empenhadas, liquidadas e pagas', 'essencial', 'comum', 'DASGF', 'financeiro', '#/m/financeiro?aba=fin-despesas', '/despesas'),
  ('4.2',   402, 'Despesa', 4, 'Despesas por classificação orçamentária', 'essencial', 'comum', 'DASGF', 'financeiro', '#/m/financeiro?aba=fin-despesas', '/despesas'),
  ('4.3',   403, 'Despesa', 4, 'Empenhos com credor, objeto, valor e licitação de origem', 'essencial', 'comum', 'DASGF', 'financeiro', '#/m/financeiro?aba=fin-despesas', '/despesas'),
  ('5.1',   501, 'Convênios e transferências', 1, 'Transferências recebidas (com inteiro teor)', 'obrigatoria', 'comum', 'DASGF', 'convenios', '#/m/convenios', '/convenios'),
  ('5.2',   502, 'Convênios e transferências', 1, 'Transferências realizadas (com inteiro teor)', 'obrigatoria', 'comum', 'DASGF', 'convenios', '#/m/convenios', '/convenios'),
  ('5.3',   503, 'Convênios e transferências', 1, 'Acordos sem transferência de recursos', 'obrigatoria', 'comum', 'DASGF', 'convenios', '#/m/convenios', '/convenios'),
  ('6.1',   601, 'Recursos humanos', 3, 'Servidores: cargo, lotação, admissão e carga horária', 'obrigatoria', 'comum', 'DAGF', 'pessoal', '#/m/pessoal?aba=pes-servidores', '/pessoal/servidores'),
  ('6.2',   602, 'Recursos humanos', 3, 'Remuneração nominal de cada servidor', 'obrigatoria', 'comum', 'DASGF', 'pessoal', '#/m/pessoal?aba=pes-remuneracao', '/pessoal/remuneracao'),
  ('6.3',   603, 'Recursos humanos', 3, 'Tabela de cargos e salários (padrão remuneratório)', 'obrigatoria', 'comum', 'DAGF', 'pessoal', '#/m/pessoal?aba=pes-cargos', '/pessoal/cargos'),
  ('6.4',   604, 'Recursos humanos', 3, 'Estagiários', 'recomendada', 'comum', 'DAGF', 'pessoal', '#/m/pessoal?aba=pes-estagiarios', '/pessoal/estagiarios'),
  ('6.5',   605, 'Recursos humanos', 3, 'Terceirizados', 'recomendada', 'comum', 'DAGF', 'pessoal', '#/m/pessoal?aba=pes-terceirizados', '/pessoal/terceirizados'),
  ('6.6',   606, 'Recursos humanos', 3, 'Editais de concursos e processos seletivos', 'obrigatoria', 'comum', 'DS', 'concursos', '#/m/concursos', '/concursos'),
  ('6.7',   607, 'Recursos humanos', 3, 'Demais atos de concursos e seleções (resultados, nomeações)', 'obrigatoria', 'comum', 'DS', 'concursos', '#/m/concursos', '/concursos'),
  ('7.1',   701, 'Diárias', 1, 'Diárias concedidas (beneficiário, valor, período, motivo, destino)', 'obrigatoria', 'comum', 'DASGF', 'diarias', '#/m/diarias?aba=dia-concedidas', '/diarias/concedidas'),
  ('7.2',   702, 'Diárias', 1, 'Tabela de valores das diárias', 'obrigatoria', 'comum', 'D', 'diarias', '#/m/diarias?aba=dia-tabela', '/diarias/tabela'),
  ('8.1',   801, 'Licitações', 3, 'Relação das licitações em ordem sequencial', 'obrigatoria', 'comum', 'DASGF', 'licitacoes', '#/m/licitacoes', '/licitacoes'),
  ('8.2',   802, 'Licitações', 3, 'Íntegra dos editais', 'obrigatoria', 'comum', 'DS', 'licitacoes', '#/m/licitacoes', '/licitacoes'),
  ('8.3',   803, 'Licitações', 3, 'Documentos das fases interna e externa', 'obrigatoria', 'comum', 'DS', 'licitacoes', '#/m/licitacoes', '/licitacoes'),
  ('8.4',   804, 'Licitações', 3, 'Dispensas e inexigibilidades: documentos principais', 'obrigatoria', 'comum', 'DS', 'licitacoes', '#/m/licitacoes', '/licitacoes'),
  ('8.5',   805, 'Licitações', 3, 'Adesões a atas de registro de preços', 'obrigatoria', 'comum', 'DS', 'licitacoes', '#/m/licitacoes', '/licitacoes'),
  ('8.6',   806, 'Licitações', 3, 'Plano de Contratações Anual', 'recomendada', 'comum', 'DS', 'pca', '#/m/pca', '/licitacoes/pca'),
  ('8.7',   807, 'Licitações', 3, 'Licitantes e contratados sancionados', 'recomendada', 'comum', 'DAGF', 'sancoes', '#/m/sancoes', '/licitacoes/sancionados'),
  ('9.1',   901, 'Contratos', 3, 'Relação dos contratos e aditivos', 'obrigatoria', 'comum', 'DASGF', 'contratos', '#/m/contratos', '/contratos'),
  ('9.2',   902, 'Contratos', 3, 'Íntegra dos contratos e aditivos', 'obrigatoria', 'comum', 'DS', 'contratos', '#/m/contratos', '/contratos'),
  ('9.3',   903, 'Contratos', 3, 'Fiscais dos contratos vigentes e encerrados', 'obrigatoria', 'comum', 'DAGF', 'contratos', '#/m/contratos', '/contratos/fiscais'),
  ('9.4',   904, 'Contratos', 3, 'Ordem cronológica de pagamentos e justificativas', 'obrigatoria', 'comum', 'DASGF', 'financeiro', '#/m/financeiro?aba=fin-ordem', '/ordem-cronologica'),
  ('10.1', 1001, 'Obras', 2, 'Obras: objeto, situação, datas, contratada e percentual', 'recomendada', 'comum', 'DAGF', 'obras', '#/m/obras', '/obras'),
  ('10.2', 1002, 'Obras', 2, 'Quantitativos e preços contratados', 'obrigatoria', 'comum', 'D', 'obras', '#/m/obras', '/obras'),
  ('10.3', 1003, 'Obras', 2, 'Quantitativos executados e valores pagos', 'obrigatoria', 'comum', 'DA', 'obras', '#/m/obras', '/obras'),
  ('10.4', 1004, 'Obras', 2, 'Obras paralisadas: motivo, responsável e previsão de retomada', 'obrigatoria', 'comum', 'DA', 'obras', '#/m/obras', '/obras'),
  ('11.1', 1101, 'Planejamento e prestação de contas', 4, 'Prestação de contas do ano anterior (Balanço Geral)', 'obrigatoria', 'comum', 'DAS', 'contas', '#/m/contas', '/planejamento'),
  ('11.2', 1102, 'Planejamento e prestação de contas', 4, 'Relatório de gestão ou de atividades', 'obrigatoria', 'comum', 'DAS', 'contas', '#/m/contas', '/planejamento'),
  ('11.3', 1103, 'Planejamento e prestação de contas', 4, 'Parecer do Tribunal de Contas sobre as contas', 'obrigatoria', 'comum', 'DAS', 'contas', '#/m/contas', '/planejamento'),
  ('11.4', 1104, 'Planejamento e prestação de contas', 4, 'Julgamento das contas do Prefeito pela Câmara', 'obrigatoria', 'executivo', 'DAS', 'contas', '#/m/contas', '/planejamento'),
  ('11.5', 1105, 'Planejamento e prestação de contas', 4, 'Relatório de Gestão Fiscal (RGF)', 'essencial', 'comum', 'DAS', 'contas', '#/m/contas', '/planejamento'),
  ('11.6', 1106, 'Planejamento e prestação de contas', 4, 'Relatório Resumido da Execução Orçamentária (RREO)', 'essencial', 'executivo_consorcio', 'DAS', 'contas', '#/m/contas', '/planejamento'),
  ('11.7', 1107, 'Planejamento e prestação de contas', 4, 'Plano estratégico institucional', 'recomendada', 'comum', 'D', 'contas', '#/m/contas', '/planejamento'),
  ('11.8', 1108, 'Planejamento e prestação de contas', 4, 'Plano Plurianual (PPA) e anexos', 'essencial', 'executivo', 'DA', 'contas', '#/m/contas', '/planejamento'),
  ('11.9', 1109, 'Planejamento e prestação de contas', 4, 'Lei de Diretrizes Orçamentárias (LDO) e anexos', 'essencial', 'executivo', 'DAS', 'contas', '#/m/contas', '/planejamento'),
  ('11.10',1110, 'Planejamento e prestação de contas', 4, 'Lei Orçamentária Anual (LOA) e anexos', 'essencial', 'executivo', 'DAS', 'contas', '#/m/contas', '/planejamento'),
  ('12.1', 1201, 'Serviço de Informação ao Cidadão (SIC)', 2, 'SIC com unidade e responsável identificados', 'obrigatoria', 'comum', 'D', 'esic', '#/m/esic?aba=esic-como', '/esic'),
  ('12.2', 1202, 'Serviço de Informação ao Cidadão (SIC)', 2, 'SIC: endereço, telefone, e-mail e horário', 'obrigatoria', 'comum', 'D', 'esic', '#/m/esic?aba=esic-como', '/esic'),
  ('12.3', 1203, 'Serviço de Informação ao Cidadão (SIC)', 2, 'Pedido de acesso pela internet (e-SIC)', 'obrigatoria', 'comum', 'D', 'esic', '#/m/esic?aba=esic-como', '/esic/pedir'),
  ('12.4', 1204, 'Serviço de Informação ao Cidadão (SIC)', 2, 'Pedido sem exigências que dificultem o acesso', 'obrigatoria', 'comum', 'D', 'esic', '#/m/esic?aba=esic-como', '/esic/pedir'),
  ('12.5', 1205, 'Serviço de Informação ao Cidadão (SIC)', 2, 'Norma local que regulamenta a LAI', 'obrigatoria', 'comum', 'D', 'esic', '#/m/esic?aba=esic-como', '/esic'),
  ('12.6', 1206, 'Serviço de Informação ao Cidadão (SIC)', 2, 'Prazos de resposta e de recurso, autoridades e procedimento', 'recomendada', 'comum', 'D', 'esic', '#/m/esic?aba=esic-prazos', '/esic/prazos'),
  ('12.7', 1207, 'Serviço de Informação ao Cidadão (SIC)', 2, 'Relatório estatístico anual dos pedidos', 'obrigatoria', 'comum', 'DAS', 'esic', '#/m/esic?aba=esic-relatorios', '/esic/relatorios'),
  ('12.8', 1208, 'Serviço de Informação ao Cidadão (SIC)', 2, 'Informações classificadas por grau de sigilo', 'obrigatoria', 'comum', 'DA', 'esic', '#/m/esic?aba=esic-classificadas', '/esic/classificadas'),
  ('12.9', 1209, 'Serviço de Informação ao Cidadão (SIC)', 2, 'Informações desclassificadas nos últimos 12 meses', 'obrigatoria', 'comum', 'DA', 'esic', '#/m/esic?aba=esic-desclassificadas', '/esic/desclassificadas'),
  ('13.1', 1301, 'Acessibilidade', 1, 'Símbolo de acessibilidade em destaque', 'obrigatoria', 'comum', 'D', null, null, '/acessibilidade'),
  ('13.2', 1302, 'Acessibilidade', 1, 'Caminho de navegação na página', 'obrigatoria', 'comum', 'D', null, null, '/'),
  ('13.3', 1303, 'Acessibilidade', 1, 'Opção de alto contraste', 'obrigatoria', 'comum', 'D', null, null, '/'),
  ('13.4', 1304, 'Acessibilidade', 1, 'Ajuste do tamanho do texto', 'obrigatoria', 'comum', 'D', null, null, '/'),
  ('13.5', 1305, 'Acessibilidade', 1, 'Mapa do site', 'recomendada', 'comum', 'D', null, null, '/mapa-do-site'),
  ('14.1', 1401, 'Ouvidoria', 1, 'Atendimento presencial da ouvidoria (endereço, telefone, horário)', 'obrigatoria', 'comum', 'D', 'ouvidoria', '#/m/ouvidoria?aba=ouv-como', '/ouvidoria'),
  ('14.2', 1402, 'Ouvidoria', 1, 'Canal eletrônico para manifestações', 'obrigatoria', 'comum', 'D', 'ouvidoria', '#/m/ouvidoria?aba=ouv-como', '/ouvidoria/manifestar'),
  ('14.3', 1403, 'Ouvidoria', 1, 'Carta de Serviços ao Usuário', 'obrigatoria', 'comum', 'D', 'servicos', '#/m/servicos', '/servicos'),
  ('15.1', 1501, 'LGPD e governo digital', 1, 'Encarregado de dados pessoais e contato', 'obrigatoria', 'comum', 'D', 'lgpd', '#/m/lgpd', '/lgpd'),
  ('15.2', 1502, 'LGPD e governo digital', 1, 'Política de privacidade e proteção de dados', 'recomendada', 'comum', 'D', 'lgpd', '#/m/lgpd', '/lgpd'),
  ('15.3', 1503, 'LGPD e governo digital', 1, 'Serviços que podem ser pedidos pela internet', 'obrigatoria', 'comum', 'D', 'servicos', '#/m/servicos', '/servicos-online'),
  ('15.4', 1504, 'LGPD e governo digital', 1, 'Dados abertos com acesso automatizado e regras de uso', 'obrigatoria', 'comum', 'D', null, null, '/dados-abertos'),
  ('15.5', 1505, 'LGPD e governo digital', 1, 'Norma local do Governo Digital (Lei 14.129/2021)', 'recomendada', 'comum', 'D', 'lgpd', '#/m/lgpd', '/lgpd'),
  ('15.6', 1506, 'LGPD e governo digital', 1, 'Pesquisa de satisfação e seus resultados', 'obrigatoria', 'comum', 'D', 'ouvidoria', '#/m/ouvidoria?aba=ouv-satisfacao', '/ouvidoria/satisfacao'),
  ('16.1', 1601, 'Renúncia de receita', 1, 'Desonerações concedidas e o fundamento legal', 'obrigatoria', 'executivo', 'D', 'renuncias', '#/m/renuncias?aba=ren-deson', '/renuncias/desoneracoes'),
  ('16.2', 1602, 'Renúncia de receita', 1, 'Valores previstos e realizados das renúncias', 'obrigatoria', 'executivo', 'DAS', 'renuncias', '#/m/renuncias?aba=ren-valores', '/renuncias/valores'),
  ('16.3', 1603, 'Renúncia de receita', 1, 'Beneficiários das renúncias e incentivos', 'recomendada', 'executivo', 'DAGF', 'renuncias', '#/m/renuncias?aba=ren-benef', '/renuncias/beneficiarios'),
  ('16.4', 1604, 'Renúncia de receita', 1, 'Projetos de incentivo à cultura e ao esporte', 'recomendada', 'executivo', 'D', 'renuncias', '#/m/renuncias?aba=ren-incent', '/renuncias/incentivos'),
  ('17.1', 1701, 'Emendas parlamentares', 1, 'Emendas federais recebidas', 'obrigatoria', 'executivo', 'DASGF', 'emendas', '#/m/emendas', '/emendas'),
  ('17.2', 1702, 'Emendas parlamentares', 1, 'Emendas estaduais e municipais', 'obrigatoria', 'executivo', 'DASGF', 'emendas', '#/m/emendas', '/emendas'),
  ('17.3', 1703, 'Emendas parlamentares', 1, 'Execução orçamentária e financeira das emendas', 'obrigatoria', 'executivo', 'DAGF', 'emendas', '#/m/emendas', '/emendas'),
  ('18.1', 1801, 'Saúde', 1, 'Plano de saúde, programação anual e relatório de gestão', 'obrigatoria', 'executivo', 'DAS', 'saude', '#/m/saude?aba=saude-docs', '/saude/planos'),
  ('18.2', 1802, 'Saúde', 1, 'Serviços de saúde: horários, profissionais e locais', 'obrigatoria', 'executivo', 'DA', 'saude', '#/m/saude?aba=saude-servicos', '/saude/servicos'),
  ('18.3', 1803, 'Saúde', 1, 'Lista de espera da regulação', 'recomendada', 'executivo', 'DAGF', 'saude', '#/m/saude?aba=saude-espera', '/saude/lista-de-espera'),
  ('18.4', 1804, 'Saúde', 1, 'Medicamentos do SUS e como obtê-los', 'recomendada', 'executivo', 'D', 'saude', '#/m/saude?aba=saude-medicamentos', '/saude/medicamentos'),
  ('18.5', 1805, 'Saúde', 1, 'Estoque de medicamentos das farmácias públicas', 'obrigatoria', 'executivo', 'DAGF', 'saude', '#/m/saude?aba=saude-estoque', '/saude/estoque'),
  ('18.6', 1806, 'Saúde', 1, 'Conselho de Saúde: composição e funcionamento', 'recomendada', 'executivo', 'DA', 'saude', '#/m/saude?aba=saude-conselho', '/saude/conselho'),
  ('19.1', 1901, 'Educação e assistência social', 1, 'Plano de educação e relatório de resultados', 'recomendada', 'executivo', 'DA', 'educacao', '#/m/educacao?aba=edu-docs', '/educacao/plano'),
  ('19.2', 1902, 'Educação e assistência social', 1, 'Lista de espera das creches e critérios de prioridade', 'obrigatoria', 'executivo', 'DAGF', 'educacao', '#/m/educacao?aba=edu-creches', '/educacao/creches'),
  ('19.3', 1903, 'Educação e assistência social', 1, 'Conselho do Fundeb: composição e funcionamento', 'obrigatoria', 'executivo', 'DA', 'educacao', '#/m/educacao?aba=edu-fundeb', '/educacao/fundeb'),
  ('19.4', 1904, 'Educação e assistência social', 1, 'Conselho de Assistência Social: composição e funcionamento', 'recomendada', 'executivo', 'DA', 'educacao', '#/m/educacao?aba=edu-assist', '/educacao/assistencia-social')
on conflict (codigo) do update set ordem = excluded.ordem, dimensao = excluded.dimensao, peso_dimensao = excluded.peso_dimensao,
  titulo = excluded.titulo, classificacao = excluded.classificacao, matriz = excluded.matriz, itens = excluded.itens,
  modulo = excluded.modulo, rota = excluded.rota, pagina = excluded.pagina;

-- ---------------------------------------------------------------------
-- Ajudantes
-- ---------------------------------------------------------------------
-- Há declaração de que não há dados (parte p_secoes) cobrindo o intervalo?
create or replace function public.pntp_declarado(p_orgao uuid, p_secoes text[], p_ini date, p_fim date)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.declaracoes_inexistencia d
    where d.orgao_id = p_orgao and d.secao = any (p_secoes)
      and (d.abrangencia = 'atual' or daterange(d.data_inicio, d.data_fim, '[]') && daterange(p_ini, p_fim, '[]')))
  or exists (select 1 from public.secoes_setoriais s where s.orgao_id = p_orgao and s.secao = any (p_secoes) and s.sem_ocorrencia);
$$;

-- Anos da série histórica (p_ultimo e os 2 anteriores) sem dados e sem declaração.
create or replace function public.pntp_anos_faltando(p_orgao uuid, p_secoes text[], p_anos integer[], p_ultimo integer)
returns integer[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(a order by a), '{}') from generate_series(p_ultimo - 2, p_ultimo) a
  where not (a = any (coalesce(p_anos, '{}')))
    and not public.pntp_declarado(p_orgao, p_secoes, make_date(a, 1, 1), make_date(a, 12, 31));
$$;

-- Algum destino (Destinos das páginas) leva a sistema externo?
create or replace function public.pntp_externo(p_cfg jsonb, p_chaves text[])
returns boolean language sql immutable as $$
  select exists (select 1 from unnest(p_chaves) k where coalesce(p_cfg -> 'destinos' ->> k, '') ~* '^https?://');
$$;

drop function if exists public.avaliacao_pntp(uuid);
create or replace function public.avaliacao_pntp(p_orgao uuid)
returns table (codigo text, ordem integer, dimensao text, peso_dimensao numeric, titulo text, classificacao text,
               peso_criterio numeric, modulo text, rota text, pagina text, itens text,
               disponibilidade boolean, atualidade boolean, serie_historica boolean, gravacao boolean, filtro boolean,
               nota numeric, situacao text, externo boolean, falta text[])
language plpgsql stable security definer set search_path = public as $$
declare
  hoje date := current_date;
  v_ano int := extract(year from current_date)::int;
  o record;
  cfg jsonb;
  exec boolean;
  -- resultado de cada critério (preenchido antes de cada "perform anotar")
  r jsonb := '[]'::jsonb;
  d boolean; a boolean; s boolean; ext boolean; f text[];
  n bigint; n2 bigint; n3 bigint; ult date; anos int[]; falt int[]; x record; ce record; co record; lg record; cs record;
  ult_enc int;   -- último exercício encerrado com prazo de publicação vencido
begin
  if not public.e_membro(p_orgao) then return; end if;
  select * into o from public.orgaos where id = p_orgao;
  cfg := coalesce(o.configuracoes, '{}'::jsonb);
  exec := o.tipo = 'prefeitura';
  ult_enc := case when hoje > make_date(v_ano, 4, 30) then v_ano - 1 else v_ano - 2 end;

  -- Cada critério termina com: r := r || jsonb_build_object(código, d, a, s, ext, falta).
  -- ---------- 1. Informações prioritárias ----------
  d := coalesce(o.dominio, '') <> '';
  r := r || jsonb_build_object('c', '1.1', 'd', d, 'f', case when d then '{}'::text[] else
    array['O site ainda está no endereço provisório: aponte o domínio oficial do órgão (ex.: .rn.gov.br) e cadastre-o em Aparência › Identidade.'] end);
  r := r || jsonb_build_object('c', '1.2', 'd', true);
  r := r || jsonb_build_object('c', '1.3', 'd', true);
  r := r || jsonb_build_object('c', '1.4', 'd', true);

  -- ---------- 2. Informações institucionais ----------
  select count(*) into n from public.unidades u where u.orgao_id = p_orgao and u.ativo;
  f := '{}';
  if n = 0 then f := f || 'Cadastre as unidades (secretarias e setores) em Unidades e gestores.'::text; end if;
  if coalesce(cfg ->> 'estrutura_norma', '') = '' and coalesce(cfg ->> 'estrutura_norma_url', '') = ''
     and exists (select 1 from public.unidades u where u.orgao_id = p_orgao and u.ativo and coalesce(u.norma_criacao, '') = '' and coalesce(u.norma_url, '') = '') then
    f := f || 'Informe a norma que institui a estrutura organizacional (Aparência › Identidade, ou a norma de criação de cada unidade).'::text;
  end if;
  r := r || jsonb_build_object('c', '2.1', 'd', cardinality(f) = 0, 'f', f);

  select count(*) into n2 from public.unidades u where u.orgao_id = p_orgao and u.ativo and coalesce(char_length(u.competencias), 0) < 20;
  r := r || jsonb_build_object('c', '2.2', 'd', n > 0 and n2 = 0, 'f', case when n = 0 then array['Cadastre as unidades e as competências de cada uma.']
    when n2 > 0 then array[n2 || ' unidade(s) sem as competências preenchidas.'] else '{}'::text[] end);

  select count(*) into n2 from public.unidades u where u.orgao_id = p_orgao and u.ativo
    and not exists (select 1 from public.gestores g where g.unidade_id = u.id and g.ativo);
  d := n > 0 and n2 = 0 and exists (select 1 from public.gestores g where g.orgao_id = p_orgao and g.ativo);
  r := r || jsonb_build_object('c', '2.3', 'd', d, 'f', case when d then '{}'::text[] when n = 0 then array['Cadastre as unidades e os gestores.']
    else array[n2 || ' unidade(s) sem responsável (gestor ativo) cadastrado.'] end);

  f := '{}';
  if coalesce(cfg ->> 'endereco', '') = '' then f := f || 'endereço'::text; end if;
  if coalesce(cfg ->> 'telefone', '') = '' then f := f || 'telefone'::text; end if;
  if coalesce(cfg ->> 'email', '') = '' then f := f || 'e-mail institucional'::text; end if;
  r := r || jsonb_build_object('c', '2.4', 'd', cardinality(f) = 0, 'f', case when cardinality(f) = 0 then '{}'::text[] else array['Falta em Aparência › Contatos: ' || array_to_string(f, ', ') || '.'] end);
  d := coalesce(cfg ->> 'horario', '') <> '';
  r := r || jsonb_build_object('c', '2.5', 'd', d, 'f', case when d then '{}'::text[] else array['Informe o horário de atendimento em Aparência › Contatos.'] end);

  d := exists (select 1 from public.publicacoes p where p.orgao_id = p_orgao and p.situacao = 'publicado');
  r := r || jsonb_build_object('c', '2.6', 'd', d, 'ext', pntp_externo(cfg, array['publicacoes']),
    'f', case when d then '{}'::text[] else array['Nenhum ato normativo publicado (leis, decretos, portarias).'] end);
  d := exists (select 1 from public.faq q where q.orgao_id = p_orgao and q.ativo);
  r := r || jsonb_build_object('c', '2.7', 'd', d, 'f', case when d then '{}'::text[] else array['Cadastre as perguntas frequentes em Páginas e perguntas frequentes.'] end);
  d := coalesce(cfg ->> 'facebook', '') <> '' or coalesce(cfg ->> 'instagram', '') <> '' or coalesce(cfg ->> 'youtube', '') <> '' or coalesce(cfg ->> 'whatsapp', '') <> '';
  r := r || jsonb_build_object('c', '2.8', 'd', d, 'f', case when d then '{}'::text[] else array['Informe as redes sociais em Aparência › Contatos.'] end);
  r := r || jsonb_build_object('c', '2.9', 'd', true);

  -- ---------- 3. Receita ----------
  ext := pntp_externo(cfg, array['receitas', 'receitas_arrecadacao']);
  select max((make_date(x2.exercicio, x2.mes, 1) + interval '1 month' - interval '1 day')::date), array_agg(distinct x2.exercicio)
    into ult, anos from public.receitas x2 where x2.orgao_id = p_orgao;
  d := ult is not null or pntp_declarado(p_orgao, array['receitas_arrecadacao'], hoje - 30, hoje);
  a := (ult is not null and ult >= hoje - 30) or pntp_declarado(p_orgao, array['receitas_arrecadacao'], hoje - 30, hoje);
  falt := pntp_anos_faltando(p_orgao, array['receitas_arrecadacao'], anos, v_ano - 1);
  f := '{}';
  if not d then f := f || 'Nenhuma receita lançada: cadastre a previsão e a arrecadação mês a mês.'::text;
  elsif not a then f := f || ('Arrecadação lançada só até ' || to_char(ult, 'MM/YYYY') || ' (dados de até 30 dias).')::text; end if;
  if cardinality(falt) > 0 then f := f || ('Série histórica: faltam as receitas de ' || array_to_string(falt, ', ') || '.')::text; end if;
  r := r || jsonb_build_object('c', '3.1', 'd', d, 'a', a, 's', cardinality(falt) = 0, 'ext', ext, 'f', f);
  -- 3.2: mesma série, com a natureza da receita.
  select count(*) filter (where coalesce(x2.natureza_codigo, '') = '') into n from public.receitas x2 where x2.orgao_id = p_orgao and x2.exercicio >= v_ano - 3;
  r := r || jsonb_build_object('c', '3.2', 'd', d and n = 0, 'a', a, 's', cardinality(falt) = 0, 'ext', ext,
    'f', case when n > 0 then f || (n || ' lançamento(s) de receita sem a natureza (categoria, origem, espécie).')::text else f end);
  ext := pntp_externo(cfg, array['receitas', 'receitas_divida_ativa']);
  select max(x2.exercicio) into n from public.divida_ativa x2 where x2.orgao_id = p_orgao;
  d := n is not null or pntp_declarado(p_orgao, array['receitas_divida_ativa'], make_date(v_ano - 1, 1, 1), make_date(v_ano - 1, 12, 31));
  a := coalesce(n >= v_ano - 1, false) or pntp_declarado(p_orgao, array['receitas_divida_ativa'], make_date(v_ano - 1, 1, 1), make_date(v_ano - 1, 12, 31));
  r := r || jsonb_build_object('c', '3.3', 'd', d, 'a', a, 'ext', ext, 'f', case when not d then array['Publique a relação dos inscritos em dívida ativa.']
    when not a then array['Falta a relação dos inscritos em dívida ativa de ' || (v_ano - 1) || ' (último exercício encerrado).'] else '{}'::text[] end);

  -- ---------- 4. Despesa ----------
  ext := pntp_externo(cfg, array['despesas', 'despesas_empenhos']);
  select max(x2.ultima_movimentacao), array_agg(distinct x2.exercicio) into ult, anos from public.despesas x2 where x2.orgao_id = p_orgao;
  d := ult is not null or pntp_declarado(p_orgao, array['despesas_empenhos'], hoje - 30, hoje);
  a := (ult is not null and ult >= hoje - 30) or pntp_declarado(p_orgao, array['despesas_empenhos'], hoje - 30, hoje);
  falt := pntp_anos_faltando(p_orgao, array['despesas_empenhos'], anos, v_ano - 1);
  f := '{}';
  if not d then f := f || 'Nenhum empenho lançado.'::text;
  elsif not a then f := f || ('Último empenho, liquidação ou pagamento lançado em ' || to_char(ult, 'DD/MM/YYYY') || ' (dados de até 30 dias).')::text; end if;
  if cardinality(falt) > 0 then f := f || ('Série histórica: faltam as despesas de ' || array_to_string(falt, ', ') || '.')::text; end if;
  r := r || jsonb_build_object('c', '4.1', 'd', d, 'a', a, 's', cardinality(falt) = 0, 'ext', ext, 'f', f);
  select count(*) into n from public.despesas x2 where x2.orgao_id = p_orgao and x2.exercicio >= v_ano - 3
    and (coalesce(x2.funcao_codigo, '') = '' or coalesce(x2.natureza_codigo, '') = '' or coalesce(x2.programa_codigo, '') = '');
  r := r || jsonb_build_object('c', '4.2', 'd', d and n = 0, 'a', a, 's', cardinality(falt) = 0, 'ext', ext,
    'f', case when n > 0 then f || (n || ' empenho(s) sem função, programa ou natureza da despesa.')::text else f end);
  select count(*) into n from public.despesas x2 where x2.orgao_id = p_orgao and x2.exercicio >= v_ano - 3
    and (coalesce(x2.credor_nome, '') = '' or coalesce(x2.objeto, '') = '' or x2.modalidade is null
         or (x2.modalidade <> 'nao_se_aplica' and x2.licitacao_numero is null and x2.licitacao_id is null));
  r := r || jsonb_build_object('c', '4.3', 'd', d and n = 0, 'a', a, 's', cardinality(falt) = 0, 'ext', ext,
    'f', case when n > 0 then f || (n || ' empenho(s) sem credor, objeto ou licitação/dispensa de origem.')::text else f end);

  -- ---------- 5. Convênios e transferências ----------
  for x in select * from (values ('5.1', 'recebida', 'convenios_recebidas', 'transferência recebida'),
                                 ('5.2', 'realizada', 'convenios_realizadas', 'transferência realizada'),
                                 ('5.3', 'sem_repasse', 'convenios_acordos', 'acordo sem repasse')) v(cod, tipo, secao, nome) loop
    ext := pntp_externo(cfg, array['convenios', x.secao]);
    select count(*), array_agg(distinct coalesce(c.ano, extract(year from c.data_assinatura)::int)),
           count(*) filter (where c.andamento = 'em_execucao' and (c.vigencia_fim < hoje
              or (c.tipo <> 'sem_repasse' and coalesce(c.repasse_atualizado_em, c.data_assinatura, c.criado_em::date) < hoje - 30)))
      into n, anos, n2 from public.convenios c where c.orgao_id = p_orgao and c.tipo = x.tipo and c.situacao = 'publicado';
    d := n > 0 or pntp_declarado(p_orgao, array[x.secao], hoje - 365, hoje);
    a := d and n2 = 0;
    -- Vigentes em anos anteriores também contam para a série.
    select coalesce(array_agg(distinct g), '{}') into anos from public.convenios c,
      generate_series(coalesce(extract(year from c.vigencia_inicio)::int, c.ano), coalesce(extract(year from least(c.vigencia_fim, hoje))::int, v_ano)) g
      where c.orgao_id = p_orgao and c.tipo = x.tipo and c.situacao = 'publicado';
    falt := pntp_anos_faltando(p_orgao, array[x.secao], anos, v_ano - 1);
    f := '{}';
    if not d then f := f || ('Nenhuma ' || x.nome || ' publicada: cadastre ou declare que não há.')::text; end if;
    if n2 > 0 then f := f || (n2 || ' instrumento(s) em execução com vigência vencida ou valor repassado sem conferência há mais de 30 dias.')::text; end if;
    if cardinality(falt) > 0 then f := f || ('Série histórica: sem dados nem declaração em ' || array_to_string(falt, ', ') || '.')::text; end if;
    r := r || jsonb_build_object('c', x.cod, 'd', d, 'a', a, 's', cardinality(falt) = 0, 'ext', ext, 'f', f);
  end loop;

  -- ---------- 6. Recursos humanos ----------
  ext := pntp_externo(cfg, array['pessoal', 'pessoal_servidores']);
  select max(v.atualizado_em)::date into ult from public.pessoal_vinculos v where v.orgao_id = p_orgao;
  d := ult is not null or pntp_declarado(p_orgao, array['pessoal_servidores'], hoje - 30, hoje);
  a := coalesce(ult >= hoje - 30, false) or pntp_declarado(p_orgao, array['pessoal_servidores'], hoje - 30, hoje);
  r := r || jsonb_build_object('c', '6.1', 'd', d, 'a', a, 'ext', ext, 'f', case when not d then array['Nenhum servidor cadastrado.']
    when not a then array['Relação de servidores sem atualização desde ' || to_char(ult, 'DD/MM/YYYY') || ' (dados de até 30 dias).'] else '{}'::text[] end);

  ext := pntp_externo(cfg, array['pessoal', 'pessoal_remuneracao']);
  select max((make_date(x2.exercicio, x2.mes, 1) + interval '1 month' - interval '1 day')::date), array_agg(distinct x2.exercicio)
    into ult, anos from public.pessoal_remuneracoes x2 where x2.orgao_id = p_orgao;
  d := ult is not null or pntp_declarado(p_orgao, array['pessoal_remuneracao'], hoje - 30, hoje);
  a := coalesce(ult >= hoje - 30, false) or pntp_declarado(p_orgao, array['pessoal_remuneracao'], hoje - 30, hoje);
  falt := pntp_anos_faltando(p_orgao, array['pessoal_remuneracao'], anos, v_ano - 1);
  f := '{}';
  if not d then f := f || 'Nenhuma remuneração lançada.'::text; elsif not a then f := f || ('Remuneração lançada só até ' || to_char(ult, 'MM/YYYY') || ' (dados de até 30 dias).')::text; end if;
  if cardinality(falt) > 0 then f := f || ('Série histórica: faltam as folhas de ' || array_to_string(falt, ', ') || '.')::text; end if;
  r := r || jsonb_build_object('c', '6.2', 'd', d, 'a', a, 's', cardinality(falt) = 0, 'ext', ext, 'f', f);

  ext := pntp_externo(cfg, array['pessoal', 'pessoal_cargos']);
  select max(c.atualizado_em) into ult from public.pessoal_cargos c where c.orgao_id = p_orgao;
  d := ult is not null;
  a := coalesce(ult >= hoje - 365, false) or exists (select 1 from public.secoes_setoriais s where s.orgao_id = p_orgao and s.secao = 'pessoal_cargos'
         and coalesce(char_length(s.texto), 0) >= 10 and s.atualizado_em >= now() - interval '1 year');
  r := r || jsonb_build_object('c', '6.3', 'd', d, 'a', a, 'ext', ext, 'f', case when not d then array['Falta a tabela de cargos e salários.']
    when not a then array['Tabela sem mudança há mais de 1 ano: confirme na aba Cargos e salários que é a vigente em ' || v_ano || '.'] else '{}'::text[] end);

  for x in select * from (values ('6.4', 'pessoal_estagiarios', 'estagiário'), ('6.5', 'pessoal_terceirizados', 'terceirizado')) v(cod, secao, nome) loop
    ext := pntp_externo(cfg, array['pessoal', x.secao]);
    if x.cod = '6.4' then select max(e.atualizado_em)::date into ult from public.pessoal_estagiarios e where e.orgao_id = p_orgao;
    else select max(e.atualizado_em)::date into ult from public.pessoal_terceirizados e where e.orgao_id = p_orgao; end if;
    d := ult is not null or pntp_declarado(p_orgao, array[x.secao], hoje - 180, hoje);
    a := coalesce(ult >= hoje - 180, false) or pntp_declarado(p_orgao, array[x.secao], hoje - 180, hoje);
    r := r || jsonb_build_object('c', x.cod, 'd', d, 'a', a, 'ext', ext, 'f', case when not d then array['Nenhum ' || x.nome || ' cadastrado: cadastre ou declare que não há.']
      when not a then array['Relação de ' || x.nome || 's sem atualização há mais de 180 dias.'] else '{}'::text[] end);
  end loop;

  ext := pntp_externo(cfg, array['concursos']);
  select count(*), coalesce(array_agg(distinct c.ano), '{}'),
         count(*) filter (where not exists (select 1 from public.concursos_documentos k where k.concurso_id = c.id and k.tipo = 'edital'))
    into n, anos, n2 from public.concursos c where c.orgao_id = p_orgao and c.situacao = 'publicado';
  d := n > 0 or pntp_declarado(p_orgao, array['concursos'], hoje - 365, hoje);
  falt := pntp_anos_faltando(p_orgao, array['concursos'], anos, v_ano - 1);
  f := '{}';
  if not d then f := f || 'Nenhuma seleção publicada: cadastre ou declare que não houve concurso ou seleção.'::text; end if;
  if n2 > 0 then f := f || (n2 || ' seleção(ões) publicada(s) sem o edital.')::text; end if;
  if cardinality(falt) > 0 then f := f || ('Série histórica: sem seleção nem declaração em ' || array_to_string(falt, ', ') || '.')::text; end if;
  r := r || jsonb_build_object('c', '6.6', 'd', d and n2 = 0, 's', cardinality(falt) = 0, 'ext', ext, 'f', f);
  select count(*) into n2 from public.concursos c where c.orgao_id = p_orgao and c.situacao = 'publicado' and coalesce(c.inscricoes_fim, hoje) < hoje
    and not exists (select 1 from public.concursos_documentos k where k.concurso_id = c.id and k.tipo not in ('edital', 'retificacao', 'anexo'));
  f := '{}';
  if not d then f := f || 'Nenhuma seleção publicada: cadastre ou declare que não houve.'::text; end if;
  if n2 > 0 then f := f || (n2 || ' seleção(ões) com inscrições encerradas sem os atos seguintes (inscritos, resultados, homologação, convocações).')::text; end if;
  if cardinality(falt) > 0 then f := f || ('Série histórica: sem seleção nem declaração em ' || array_to_string(falt, ', ') || '.')::text; end if;
  r := r || jsonb_build_object('c', '6.7', 'd', d and n2 = 0, 's', cardinality(falt) = 0, 'ext', ext, 'f', f);

  -- ---------- 7. Diárias ----------
  ext := pntp_externo(cfg, array['diarias', 'diarias_concedidas']);
  select max(greatest(x2.data_inicio, x2.atualizado_em::date)), array_agg(distinct x2.exercicio) into ult, anos from public.diarias x2 where x2.orgao_id = p_orgao;
  d := ult is not null or pntp_declarado(p_orgao, array['diarias_concedidas'], hoje - 30, hoje);
  a := coalesce(ult >= hoje - 30, false) or pntp_declarado(p_orgao, array['diarias_concedidas'], hoje - 30, hoje);
  falt := pntp_anos_faltando(p_orgao, array['diarias_concedidas'], anos, v_ano - 1);
  f := '{}';
  if not d then f := f || 'Nenhuma diária cadastrada: cadastre ou declare que não houve.'::text;
  elsif not a then f := f || ('Nenhuma diária lançada desde ' || to_char(ult, 'DD/MM/YYYY') || ': lance as novas ou declare que não houve no período.')::text; end if;
  if cardinality(falt) > 0 then f := f || ('Série histórica: sem diárias nem declaração em ' || array_to_string(falt, ', ') || '.')::text; end if;
  r := r || jsonb_build_object('c', '7.1', 'd', d, 'a', a, 's', cardinality(falt) = 0, 'ext', ext, 'f', f);
  d := exists (select 1 from public.diarias_valores v where v.orgao_id = p_orgao);
  r := r || jsonb_build_object('c', '7.2', 'd', d, 'ext', pntp_externo(cfg, array['diarias', 'diarias_tabela']),
    'f', case when d then '{}'::text[] else array['Falta a tabela de valores das diárias.'] end);

  -- ---------- 8. Licitações ----------
  ext := pntp_externo(cfg, array['licitacoes']) or coalesce(cfg ->> 'licitacoes_url', '') ~* '^https?://';
  select count(*), coalesce(array_agg(distinct l.ano), '{}'),
         count(*) filter (where l.andamento in ('aberta', 'prevista') and l.data_abertura::date < hoje - 1)
    into n, anos, n2 from public.licitacoes l where l.orgao_id = p_orgao and l.situacao = 'publicado';
  d := n > 0 or pntp_declarado(p_orgao, array['licitacoes_licitacoes', 'licitacoes_diretas'], hoje - 365, hoje);
  falt := pntp_anos_faltando(p_orgao, array['licitacoes_licitacoes', 'licitacoes_diretas', 'licitacoes_adesoes'], anos, v_ano - 1);
  f := '{}';
  if not d then f := f || 'Nenhum processo publicado: cadastre, importe do PNCP ou declare que não houve.'::text; end if;
  if n2 > 0 then f := f || (n2 || ' processo(s) com a abertura já passada ainda como "aberta" ou "prevista": atualize o andamento.')::text; end if;
  if cardinality(falt) > 0 then f := f || ('Série histórica: sem processos nem declaração em ' || array_to_string(falt, ', ') || '.')::text; end if;
  r := r || jsonb_build_object('c', '8.1', 'd', d, 'a', d and n2 = 0, 's', cardinality(falt) = 0, 'ext', ext, 'f', f);

  -- 8.2 a 8.5: documentos de cada processo do portal (os vindos do PNCP ou com link já levam aos documentos).
  for x in select * from (values
      ('8.2', array['pregao_eletronico','pregao_presencial','concorrencia_eletronica','concorrencia_presencial','concurso','leilao_eletronico','leilao_presencial','dialogo_competitivo','credenciamento','pre_qualificacao','manifestacao_interesse','chamada_publica','tomada_precos','convite'],
              array['edital'], null::text[], 'licitacoes_licitacoes', 'sem o edital'),
      ('8.3', array['pregao_eletronico','pregao_presencial','concorrencia_eletronica','concorrencia_presencial','concurso','leilao_eletronico','leilao_presencial','dialogo_competitivo','chamada_publica','tomada_precos','convite'],
              array['estudo_tecnico','termo_referencia','orcamento','parecer','justificativa'], array['ata','resultado','adjudicacao','homologacao'], 'licitacoes_licitacoes', 'concluído(s) sem documento da fase interna (estudo, termo de referência, orçamento, parecer) ou da externa (ata, resultado, homologação)'),
      ('8.4', array['dispensa','inexigibilidade'], array['justificativa','parecer','ratificacao','orcamento','emergencia','estudo_tecnico','termo_referencia'], null::text[], 'licitacoes_diretas', 'sem justificativa, parecer, orçamento ou ratificação'),
      ('8.5', array['adesao_ata'], array['ata','justificativa','parecer','orcamento','contrato','outro','ratificacao','anexo'], null::text[], 'licitacoes_adesoes', 'sem documentos da adesão')) v(cod, mods, docs1, docs2, secao, nome) loop
    select count(*), coalesce(array_agg(distinct l.ano), '{}') into n, anos
      from public.licitacoes l where l.orgao_id = p_orgao and l.situacao = 'publicado' and l.modalidade = any (x.mods);
    select count(*) filter (where l.ano >= v_ano), count(*) filter (where l.ano between v_ano - 3 and v_ano - 1)
      into n2, n3
      from public.licitacoes l where l.orgao_id = p_orgao and l.situacao = 'publicado' and l.modalidade = any (x.mods) and l.origem = 'portal'
        and (x.cod <> '8.3' or l.andamento in ('homologada', 'encerrada'))
        and (not exists (select 1 from public.licitacoes_documentos k where k.licitacao_id = l.id and k.tipo = any (x.docs1))
             or (x.docs2 is not null and not exists (select 1 from public.licitacoes_documentos k where k.licitacao_id = l.id and k.tipo = any (x.docs2))));
    d := (n > 0 or pntp_declarado(p_orgao, array[x.secao], hoje - 365, hoje)) and n2 = 0;
    if n = 0 and x.cod in ('8.2', '8.3') then d := (select (e ->> 'd')::boolean from jsonb_array_elements(r) e where e ->> 'c' = '8.1') and n2 = 0; end if;
    falt := pntp_anos_faltando(p_orgao, array[x.secao], anos, v_ano - 1);
    if x.cod in ('8.2', '8.3') then falt := pntp_anos_faltando(p_orgao, array['licitacoes_licitacoes'],
        (select coalesce(array_agg(distinct l.ano), '{}') from public.licitacoes l where l.orgao_id = p_orgao and l.situacao = 'publicado'), v_ano - 1); end if;
    f := '{}';
    if n = 0 and not pntp_declarado(p_orgao, array[x.secao], hoje - 365, hoje) and x.cod in ('8.4', '8.5') then
      f := f || ('Nenhum processo deste tipo publicado: cadastre ou declare que não houve.')::text; end if;
    if n2 > 0 then f := f || (n2 || ' processo(s) de ' || v_ano || ' ' || x.nome || '.')::text; end if;
    if n3 > 0 then f := f || (n3 || ' processo(s) de ' || (v_ano - 3) || ' a ' || (v_ano - 1) || ' ' || x.nome || '.')::text; end if;
    if cardinality(falt) > 0 then f := f || ('Série histórica: sem processos nem declaração em ' || array_to_string(falt, ', ') || '.')::text; end if;
    r := r || jsonb_build_object('c', x.cod, 'd', d, 's', cardinality(falt) = 0 and n3 = 0, 'ext', ext, 'f', f);
  end loop;

  ext := pntp_externo(cfg, array['pca']);
  select coalesce(array_agg(distinct p.ano), '{}') into anos from public.pca p where p.orgao_id = p_orgao and p.tipo = 'plano' and p.situacao = 'publicado';
  d := v_ano = any (anos) or pntp_declarado(p_orgao, array['pca'], make_date(v_ano, 1, 1), hoje);
  falt := array(select y from unnest(pntp_anos_faltando(p_orgao, array['pca'], anos, v_ano - 1)) y where y >= 2023);   -- PCA existe desde a Lei 14.133
  f := '{}';
  if not d then f := f || ('Falta publicar o Plano de Contratações Anual de ' || v_ano || '.')::text; end if;
  if cardinality(falt) > 0 then f := f || ('Série histórica: falta o PCA de ' || array_to_string(falt, ', ') || '.')::text; end if;
  r := r || jsonb_build_object('c', '8.6', 'd', d, 's', cardinality(falt) = 0, 'ext', ext, 'f', f);

  d := exists (select 1 from public.sancoes x2 where x2.orgao_id = p_orgao and x2.situacao = 'publicado') or pntp_declarado(p_orgao, array['sancionados'], hoje - 365, hoje);
  r := r || jsonb_build_object('c', '8.7', 'd', d, 'a', d, 'ext', pntp_externo(cfg, array['sancionados']),
    'f', case when d then '{}'::text[] else array['Nenhuma sanção publicada: cadastre ou declare que não há licitantes ou contratados sancionados.'] end);

  -- ---------- 9. Contratos ----------
  ext := pntp_externo(cfg, array['contratos']);
  select count(*), coalesce(array_agg(distinct coalesce(c.ano, extract(year from c.data_assinatura)::int)), '{}')
    into n, anos from public.contratos c where c.orgao_id = p_orgao and c.situacao = 'publicado';
  select coalesce(array_agg(distinct g), '{}') into anos from public.contratos c,
    generate_series(coalesce(extract(year from coalesce(c.vigencia_inicio, c.data_assinatura))::int, c.ano), coalesce(extract(year from least(c.vigencia_fim_atual, hoje))::int, c.ano, v_ano)) g
    where c.orgao_id = p_orgao and c.situacao = 'publicado';
  d := n > 0 or pntp_declarado(p_orgao, array['contratos'], hoje - 365, hoje);
  falt := pntp_anos_faltando(p_orgao, array['contratos'], anos, v_ano - 1);
  f := '{}';
  if not d then f := f || 'Nenhum contrato publicado: cadastre, importe do PNCP ou declare que não há.'::text; end if;
  if cardinality(falt) > 0 then f := f || ('Série histórica: sem contratos nem declaração em ' || array_to_string(falt, ', ') || '.')::text; end if;
  r := r || jsonb_build_object('c', '9.1', 'd', d, 'a', d, 's', cardinality(falt) = 0, 'ext', ext, 'f', f);
  select count(*) filter (where coalesce(c.ano, extract(year from c.data_assinatura)::int) >= v_ano - 3 and c.origem = 'portal' and c.arquivo_url is null and c.link_externo is null),
         (select count(*) from public.contratos_aditivos ad join public.contratos c2 on c2.id = ad.contrato_id
           where c2.orgao_id = p_orgao and c2.situacao = 'publicado' and ad.origem is distinct from 'pncp' and ad.arquivo_url is null and ad.link_externo is null
             and coalesce(extract(year from ad.data_assinatura)::int, v_ano) >= v_ano - 3)
    into n, n2 from public.contratos c where c.orgao_id = p_orgao and c.situacao = 'publicado';
  f := case when (r -> -1 ->> 'd')::boolean then '{}'::text[] else array['Nenhum contrato publicado.'] end;
  if n > 0 then f := f || (n || ' contrato(s) de ' || (v_ano - 3) || ' em diante sem o arquivo ou link do inteiro teor.')::text; end if;
  if n2 > 0 then f := f || (n2 || ' aditivo(s) sem o arquivo ou link do inteiro teor.')::text; end if;
  r := r || jsonb_build_object('c', '9.2', 'd', (r -> -1 ->> 'd')::boolean and n = 0 and n2 = 0, 's', cardinality(falt) = 0 and n = 0, 'ext', ext, 'f', f);
  select count(*) into n from public.contratos c where c.orgao_id = p_orgao and c.situacao = 'publicado' and c.rescindido_em is null
    and coalesce(c.vigencia_fim_atual, hoje) >= hoje and coalesce(c.vigencia_inicio, hoje) <= hoje
    and not exists (select 1 from public.contratos_fiscais k where k.contrato_id = c.id and coalesce(k.fim, hoje) >= hoje);
  d := exists (select 1 from public.contratos_fiscais k where k.orgao_id = p_orgao) or pntp_declarado(p_orgao, array['fiscais', 'contratos'], hoje - 365, hoje);
  r := r || jsonb_build_object('c', '9.3', 'd', d, 'a', d and n = 0, 'ext', pntp_externo(cfg, array['fiscais', 'contratos']),
    'f', case when not d then array['Nenhum fiscal de contrato cadastrado.'] when n > 0 then array[n || ' contrato(s) vigente(s) sem fiscal vigente.'] else '{}'::text[] end);
  ext := pntp_externo(cfg, array['ordem_cronologica']);
  select max(coalesce(x2.data_pagamento, x2.data_exigibilidade)), array_agg(distinct x2.exercicio),
         count(*) filter (where x2.fora_da_ordem and coalesce(x2.justificativa, '') = '')
    into ult, anos, n from public.ordem_cronologica x2 where x2.orgao_id = p_orgao;
  d := ult is not null or pntp_declarado(p_orgao, array['ordem_cronologica'], hoje - 30, hoje);
  a := coalesce(ult >= hoje - 30, false) or pntp_declarado(p_orgao, array['ordem_cronologica'], hoje - 30, hoje);
  falt := array(select y from unnest(pntp_anos_faltando(p_orgao, array['ordem_cronologica'], anos, v_ano - 1)) y where y >= 2023);
  f := '{}';
  if not d then f := f || 'Nenhum pagamento na ordem cronológica: publique a fila mês a mês.'::text;
  elsif not a then f := f || ('Ordem cronológica lançada só até ' || to_char(ult, 'DD/MM/YYYY') || ' (publicação mensal).')::text; end if;
  if n > 0 then f := f || (n || ' pagamento(s) fora da ordem sem a justificativa.')::text; end if;
  if cardinality(falt) > 0 then f := f || ('Série histórica: falta a ordem cronológica de ' || array_to_string(falt, ', ') || '.')::text; end if;
  r := r || jsonb_build_object('c', '9.4', 'd', d and n = 0, 'a', a, 's', cardinality(falt) = 0, 'ext', ext, 'f', f);

  -- ---------- 10. Obras ----------
  ext := pntp_externo(cfg, array['obras']);
  select count(*),
         count(*) filter (where ob.situacao_obra = 'em_andamento'
           and coalesce((select max(coalesce(m.periodo_fim, m.data_pagamento, m.criado_em::date)) from public.obras_medicoes m where m.obra_id = ob.id),
                        ob.data_inicio, ob.criado_em::date) < hoje - 30),
         count(*) filter (where ob.situacao_obra in ('em_andamento', 'nao_iniciada') and ob.previsao_conclusao < hoje)
    into n, n2, n3 from public.obras ob where ob.orgao_id = p_orgao and ob.situacao = 'publicado';
  d := n > 0 or pntp_declarado(p_orgao, array['obras'], hoje - 30, hoje);
  f := '{}';
  if not d then f := f || 'Nenhuma obra publicada: cadastre ou declare que não há obras.'::text; end if;
  if n2 > 0 then f := f || (n2 || ' obra(s) em andamento sem medição há mais de 30 dias.')::text; end if;
  if n3 > 0 then f := f || (n3 || ' obra(s) com previsão de conclusão vencida: atualize a situação ou a previsão.')::text; end if;
  r := r || jsonb_build_object('c', '10.1', 'd', d, 'a', d and n2 = 0 and n3 = 0, 'ext', ext, 'f', f);
  select count(*) into n2 from public.obras ob where ob.orgao_id = p_orgao and ob.situacao = 'publicado' and ob.situacao_obra <> 'cancelada'
    and not exists (select 1 from public.obras_itens i where i.obra_id = ob.id);
  r := r || jsonb_build_object('c', '10.2', 'd', d and n2 = 0, 'ext', ext,
    'f', case when not d then array['Nenhuma obra publicada.'] when n2 > 0 then array[n2 || ' obra(s) sem a planilha contratada (quantidades e preços).'] else '{}'::text[] end);
  select count(*) filter (where not exists (select 1 from public.obras_medicoes m where m.obra_id = ob.id)
                            and not exists (select 1 from public.obras_itens i where i.obra_id = ob.id and coalesce(i.quantidade_executada, 0) > 0)),
         count(*) filter (where ob.situacao_obra = 'em_andamento'
           and coalesce((select max(coalesce(m.periodo_fim, m.data_pagamento, m.criado_em::date)) from public.obras_medicoes m where m.obra_id = ob.id),
                        ob.data_inicio, ob.criado_em::date) < hoje - 30)
    into n, n2 from public.obras ob where ob.orgao_id = p_orgao and ob.situacao = 'publicado' and ob.situacao_obra in ('em_andamento', 'paralisada', 'concluida');
  r := r || jsonb_build_object('c', '10.3', 'd', d and n = 0, 'a', d and n = 0 and n2 = 0, 'ext', ext,
    'f', case when not d then array['Nenhuma obra publicada.'] else array_remove(array[
      case when n > 0 then n || ' obra(s) iniciada(s) sem medição nem quantidade executada.' end,
      case when n2 > 0 then n2 || ' obra(s) em andamento sem medição há mais de 30 dias.' end], null) end);
  select count(*), count(*) filter (where not exists (select 1 from public.obras_paralisacoes p where p.obra_id = ob.id and p.reinicio is null
      and coalesce(p.motivo, '') <> '' and coalesce(p.responsavel, '') <> '' and p.previsao_reinicio is not null))
    into n, n2 from public.obras ob where ob.orgao_id = p_orgao and ob.situacao = 'publicado' and ob.situacao_obra = 'paralisada';
  d := n > 0 or pntp_declarado(p_orgao, array['obras_paralisadas', 'obras'], hoje - 30, hoje);
  r := r || jsonb_build_object('c', '10.4', 'd', d and n2 = 0, 'a', d and n2 = 0, 'ext', ext,
    'f', case when not d then array['Nenhuma obra paralisada cadastrada: se não há, declare "não há obras paralisadas" na aba Paralisadas.']
      when n2 > 0 then array[n2 || ' obra(s) paralisada(s) sem motivo, responsável ou previsão de retomada.'] else '{}'::text[] end);

  -- ---------- 11. Planejamento e prestação de contas ----------
  ext := pntp_externo(cfg, array['planejamento']);
  for x in select * from (values ('11.1', 'balanco', 'planejamento_balanco', 'o Balanço Geral (prestação de contas)'),
                                 ('11.2', 'relatorio_gestao', 'planejamento_relatorio_gestao', 'o Relatório de Gestão'),
                                 ('11.3', 'parecer_tce', 'planejamento_parecer_tce', 'o parecer do Tribunal de Contas (ou "pendente de apreciação")'),
                                 ('11.4', 'julgamento_camara', 'planejamento_julgamento_camara', 'o julgamento da Câmara (ou "pendente de apreciação")')) v(cod, tipo, secao, nome) loop
    select coalesce(array_agg(distinct g), '{}') into anos from public.documentos_contas k, generate_series(k.exercicio, coalesce(k.exercicio_fim, k.exercicio)) g
      where k.orgao_id = p_orgao and k.tipo = x.tipo and k.situacao = 'publicado';
    d := cardinality(anos) > 0 or pntp_declarado(p_orgao, array[x.secao], make_date(ult_enc, 1, 1), make_date(ult_enc, 12, 31));
    a := ult_enc = any (anos) or pntp_declarado(p_orgao, array[x.secao], make_date(ult_enc, 1, 1), make_date(ult_enc, 12, 31));
    falt := pntp_anos_faltando(p_orgao, array[x.secao], anos, ult_enc - 1);
    f := '{}';
    if not a then f := f || ('Falta ' || x.nome || ' de ' || ult_enc || '.')::text; end if;
    if cardinality(falt) > 0 then f := f || ('Série histórica: falta ' || x.nome || ' de ' || array_to_string(falt, ', ') || '.')::text; end if;
    r := r || jsonb_build_object('c', x.cod, 'd', d, 'a', a, 's', cardinality(falt) = 0, 'ext', ext, 'f', f);
  end loop;

  -- 11.5 RGF e 11.6 RREO: último período com prazo vencido (30 dias depois do fim do período).
  for x in select * from (values ('11.5', 'rgf', 'planejamento_rgf'), ('11.6', 'rreo', 'planejamento_rreo')) v(cod, tipo, secao) loop
    select coalesce(array_agg(distinct k.exercicio), '{}') into anos from public.documentos_contas k where k.orgao_id = p_orgao and k.tipo = x.tipo and k.situacao = 'publicado';
    -- períodos que já deviam estar publicados neste ano e no anterior
    select array_agg(p.ex || '/' || p.per order by p.ex, p.per) filter (where not exists (select 1 from public.documentos_contas k
             where k.orgao_id = p_orgao and k.tipo = x.tipo and k.situacao = 'publicado' and k.exercicio = p.ex and k.periodo = p.per)
             and not pntp_declarado(p_orgao, array[x.secao], p.ini, p.fim))
      into f from (
        select ex, per, make_date(ex, (per - 1) * passo + 1, 1) as ini, (make_date(ex, per * passo, 1) + interval '1 month' - interval '1 day')::date as fim
        from (select case when x.tipo = 'rreo' then 2 when coalesce(cfg ->> 'rgf_periodicidade', 'quadrimestral') = 'semestral' then 6 else 4 end as passo) pp,
             generate_series(v_ano - 1, v_ano) ex, generate_series(1, 12 / pp.passo) per) p
      where p.fim + 30 < hoje;
    falt := pntp_anos_faltando(p_orgao, array[x.secao], anos, v_ano - 1);
    d := cardinality(anos) > 0 or pntp_declarado(p_orgao, array[x.secao], hoje - 365, hoje);
    a := coalesce(cardinality(f), 0) = 0;
    r := r || jsonb_build_object('c', x.cod, 'd', d, 'a', d and a, 's', cardinality(falt) = 0, 'ext', ext,
      'f', array_remove(array[
        case when not d then 'Nenhum ' || upper(x.tipo) || ' publicado.' end,
        case when not a then 'Falta o ' || upper(x.tipo) || ' (exercício/período): ' || array_to_string(f, ', ') || '.' end,
        case when cardinality(falt) > 0 then 'Série histórica: falta o ' || upper(x.tipo) || ' de ' || array_to_string(falt, ', ') || '.' end], null));
  end loop;

  d := exists (select 1 from public.documentos_contas k where k.orgao_id = p_orgao and k.tipo = 'plano_estrategico' and k.situacao = 'publicado'
               and v_ano between k.exercicio and coalesce(k.exercicio_fim, k.exercicio + 3));
  r := r || jsonb_build_object('c', '11.7', 'd', d, 'ext', ext, 'f', case when d then '{}'::text[] else array['Falta o plano estratégico vigente em ' || v_ano || '.'] end);
  d := exists (select 1 from public.documentos_contas k where k.orgao_id = p_orgao and k.tipo = 'ppa' and k.situacao = 'publicado'
               and v_ano between k.exercicio and coalesce(k.exercicio_fim, k.exercicio + 3));
  r := r || jsonb_build_object('c', '11.8', 'd', d, 'a', d, 'ext', ext, 'f', case when d then '{}'::text[] else array['Falta o PPA vigente em ' || v_ano || ' (com os anexos).'] end);
  for x in select * from (values ('11.9', 'ldo', 'LDO', 'planejamento_ldo'), ('11.10', 'loa', 'LOA', 'planejamento_loa')) v(cod, tipo, nome, secao) loop
    select coalesce(array_agg(distinct k.exercicio), '{}') into anos from public.documentos_contas k where k.orgao_id = p_orgao and k.tipo = x.tipo and k.situacao = 'publicado';
    d := cardinality(anos) > 0;
    a := v_ano = any (anos);
    falt := pntp_anos_faltando(p_orgao, array[x.secao], anos, v_ano - 1);
    r := r || jsonb_build_object('c', x.cod, 'd', d, 'a', a, 's', cardinality(falt) = 0, 'ext', ext, 'f', array_remove(array[
      case when not a then 'Falta a ' || x.nome || ' de ' || v_ano || ' (com os anexos).' end,
      case when cardinality(falt) > 0 then 'Série histórica: falta a ' || x.nome || ' de ' || array_to_string(falt, ', ') || '.' end], null));
  end loop;

  -- ---------- 12. SIC ----------
  select k.*, u.endereco as u_end, u.telefone as u_tel, u.email as u_email, u.horario_atendimento as u_hor
    into ce from public.atendimento_canais k left join public.unidades u on u.id = k.unidade_id
    where k.orgao_id = p_orgao and k.canal = 'esic';
  ext := pntp_externo(cfg, array['esic']);
  d := ce.id is not null and (ce.unidade_id is not null or coalesce(ce.setor, '') <> '') and coalesce(ce.responsavel_nome, '') <> '';
  r := r || jsonb_build_object('c', '12.1', 'd', d, 'ext', ext, 'f', case when d then '{}'::text[] else array['Informe a unidade do SIC e o responsável (aba Como pedir).'] end);
  f := '{}';
  if coalesce(ce.endereco, ce.u_end, cfg ->> 'endereco', '') = '' then f := f || 'endereço'::text; end if;
  if coalesce(ce.telefone, ce.u_tel, cfg ->> 'telefone', '') = '' then f := f || 'telefone'::text; end if;
  if coalesce(ce.email, ce.u_email, '') = '' then f := f || 'e-mail'::text; end if;
  if coalesce(ce.horario, ce.u_hor, cfg ->> 'horario', '') = '' then f := f || 'horário'::text; end if;
  r := r || jsonb_build_object('c', '12.2', 'd', ce.id is not null and cardinality(f) = 0, 'ext', ext,
    'f', case when ce.id is null then array['Cadastre o SIC na aba Como pedir.'] when cardinality(f) > 0 then array['Falta no SIC: ' || array_to_string(f, ', ') || '.'] else '{}'::text[] end);
  d := coalesce(ce.sistema_proprio, false) or pntp_externo(cfg, array['esic_pedidos']);
  r := r || jsonb_build_object('c', '12.3', 'd', d, 'ext', ext or (not coalesce(ce.sistema_proprio, false) and d),
    'f', case when d then '{}'::text[] else array['Ligue o formulário do próprio portal (aba Como pedir) ou informe o endereço do e-SIC externo.'] end);
  r := r || jsonb_build_object('c', '12.4', 'd', d, 'ext', ext or (not coalesce(ce.sistema_proprio, false) and d),
    'f', case when d then '{}'::text[] else array['Sem formulário eletrônico de pedido.'] end);
  d := ce.norma_publicacao is not null or coalesce(ce.norma_url, '') <> '' or coalesce(char_length(ce.norma_texto), 0) >= 10;
  r := r || jsonb_build_object('c', '12.5', 'd', d, 'ext', ext, 'f', case when d then '{}'::text[] else array['Informe a norma local que regulamenta a LAI (aba Como pedir).'] end);
  f := '{}';
  if coalesce(ce.prazo_resposta, '') = '' and ce.dias_resposta is null then f := f || 'prazo de resposta'::text; end if;
  if coalesce(ce.prazo_recurso, '') = '' and ce.dias_recurso is null then f := f || 'prazo de recurso'::text; end if;
  if coalesce(ce.autoridade_recurso_1, '') = '' then f := f || 'autoridade do recurso'::text; end if;
  if coalesce(ce.procedimento_recurso, '') = '' then f := f || 'como recorrer'::text; end if;
  r := r || jsonb_build_object('c', '12.6', 'd', ce.id is not null and cardinality(f) = 0, 'ext', ext,
    'f', case when ce.id is null then array['Cadastre o SIC.'] when cardinality(f) > 0 then array['Falta na aba Prazos e recursos: ' || array_to_string(f, ', ') || '.'] else '{}'::text[] end);

  ext := pntp_externo(cfg, array['esic', 'esic_relatorios']);
  select coalesce(array_agg(distinct k.exercicio), '{}') into anos from public.atendimento_relatorios k
    where k.orgao_id = p_orgao and k.canal = 'esic' and k.abrangencia = 'ano' and k.situacao = 'publicado';
  d := cardinality(anos) > 0 or pntp_declarado(p_orgao, array['esic_relatorios'], make_date(v_ano - 1, 1, 1), make_date(v_ano - 1, 12, 31));
  a := (v_ano - 1) = any (anos) or pntp_declarado(p_orgao, array['esic_relatorios'], make_date(v_ano - 1, 1, 1), make_date(v_ano - 1, 12, 31));
  falt := pntp_anos_faltando(p_orgao, array['esic_relatorios'], anos, v_ano - 2);
  r := r || jsonb_build_object('c', '12.7', 'd', d, 'a', a, 's', cardinality(falt) = 0, 'ext', ext, 'f', array_remove(array[
    case when not a then 'Falta o relatório estatístico anual de ' || (v_ano - 1) || ' (aba Relatórios estatísticos).' end,
    case when cardinality(falt) > 0 then 'Série histórica: falta o relatório de ' || array_to_string(falt, ', ') || '.' end], null));
  ext := pntp_externo(cfg, array['esic', 'esic_classificadas']);
  select count(*), max(k.atualizado_em)::date into n, ult from public.informacoes_classificadas k where k.orgao_id = p_orgao and k.situacao = 'publicado';
  d := n > 0 or pntp_declarado(p_orgao, array['esic_classificadas'], hoje - 365, hoje);
  a := coalesce(ult >= hoje - 365, false) or pntp_declarado(p_orgao, array['esic_classificadas'], hoje - 365, hoje);
  r := r || jsonb_build_object('c', '12.8', 'd', d, 'a', a, 'ext', ext, 'f', case when not d then array['Publique o rol das informações classificadas ou declare que não há.']
    when not a then array['Rol das informações classificadas sem revisão há mais de 12 meses: confira e atualize (ou declare que não há).'] else '{}'::text[] end);
  ext := pntp_externo(cfg, array['esic', 'esic_desclassificadas']);
  d := exists (select 1 from public.informacoes_classificadas k where k.orgao_id = p_orgao and k.situacao = 'publicado' and k.data_desclassificacao >= hoje - 365)
       or pntp_declarado(p_orgao, array['esic_desclassificadas'], hoje - 365, hoje);
  r := r || jsonb_build_object('c', '12.9', 'd', d, 'a', d, 'ext', ext,
    'f', case when d then '{}'::text[] else array['Sem desclassificação nos últimos 12 meses: declare que não houve (aba Informações desclassificadas).'] end);

  -- ---------- 13. Acessibilidade (o próprio site atende) ----------
  r := r || jsonb_build_object('c', '13.1', 'd', true) || jsonb_build_object('c', '13.2', 'd', true) || jsonb_build_object('c', '13.3', 'd', true)
         || jsonb_build_object('c', '13.4', 'd', true) || jsonb_build_object('c', '13.5', 'd', true);

  -- ---------- 14. Ouvidoria ----------
  select k.*, u.endereco as u_end, u.telefone as u_tel, u.email as u_email, u.horario_atendimento as u_hor
    into co from public.atendimento_canais k left join public.unidades u on u.id = k.unidade_id
    where k.orgao_id = p_orgao and k.canal = 'ouvidoria';
  ext := pntp_externo(cfg, array['ouvidoria']);
  f := '{}';
  if co.id is null then f := f || 'Cadastre a Ouvidoria na aba Como se manifestar.'::text;
  else
    if coalesce(co.endereco, co.u_end, cfg ->> 'endereco', '') = '' then f := f || 'Falta o endereço do atendimento presencial.'::text; end if;
    if coalesce(co.telefone, co.u_tel, cfg ->> 'telefone', '') = '' then f := f || 'Falta o telefone da Ouvidoria.'::text; end if;
    if coalesce(co.horario, co.u_hor, cfg ->> 'horario', '') = '' then f := f || 'Falta o horário de atendimento da Ouvidoria.'::text; end if;
  end if;
  r := r || jsonb_build_object('c', '14.1', 'd', cardinality(f) = 0, 'ext', ext, 'f', f);
  d := coalesce(co.sistema_proprio, false) or pntp_externo(cfg, array['ouvidoria_manifestacoes']);
  r := r || jsonb_build_object('c', '14.2', 'd', d, 'ext', ext or (not coalesce(co.sistema_proprio, false) and d),
    'f', case when d then '{}'::text[] else array['Ligue o formulário do próprio portal (aba Como se manifestar) ou informe o endereço do canal externo.'] end);
  select count(*), count(*) filter (where coalesce(s2.descricao, '') = '' or coalesce(s2.requisitos, '') = '' or coalesce(s2.etapas, '') = ''
           or coalesce(s2.prazo_maximo, '') = '' or (s2.forma_prestacao is distinct from 'digital' and coalesce(s2.local_atendimento, '') = ''))
    into n, n2 from public.servicos s2 where s2.orgao_id = p_orgao and s2.situacao = 'publicado';
  r := r || jsonb_build_object('c', '14.3', 'd', n > 0 and n2 = 0, 'ext', pntp_externo(cfg, array['carta_servicos']),
    'f', case when n = 0 then array['Nenhum serviço publicado na Carta de Serviços.'] when n2 > 0 then array[n2 || ' serviço(s) com informação faltando (descrição, requisitos, etapas, prazo ou local).'] else '{}'::text[] end);

  -- ---------- 15. LGPD e governo digital ----------
  select * into lg from public.lgpd k where k.orgao_id = p_orgao;
  d := coalesce(lg.encarregado_nome, '') <> '' and coalesce(lg.encarregado_email, lg.encarregado_telefone, '') <> '';
  r := r || jsonb_build_object('c', '15.1', 'd', d, 'f', case when d then '{}'::text[] else array['Informe o encarregado de dados pessoais e o contato dele.'] end);
  d := coalesce(char_length(lg.politica_texto), 0) >= 50 or coalesce(lg.politica_url, '') <> '';
  r := r || jsonb_build_object('c', '15.2', 'd', d, 'f', case when d then '{}'::text[] else array['Publique a política de privacidade e proteção de dados.'] end);
  d := exists (select 1 from public.servicos s2 where s2.orgao_id = p_orgao and s2.situacao = 'publicado' and coalesce(s2.link_digital, '') ~* '^https?://')
       or pntp_externo(cfg, array['servicos_online']);
  r := r || jsonb_build_object('c', '15.3', 'd', d, 'ext', pntp_externo(cfg, array['servicos_online']),
    'f', case when d then '{}'::text[] else array['Nenhum serviço com endereço para pedir pela internet: preencha o link nos serviços da Carta ou o destino "Serviços on-line".'] end);
  r := r || jsonb_build_object('c', '15.4', 'd', true);
  d := lg.gov_digital_publicacao is not null or coalesce(lg.gov_digital_url, '') <> '' or coalesce(char_length(lg.gov_digital_texto), 0) >= 10;
  r := r || jsonb_build_object('c', '15.5', 'd', d, 'f', case when d then '{}'::text[] else array['Informe a norma local do Governo Digital (Lei 14.129/2021).'] end);
  d := (coalesce(co.sistema_proprio, false) and coalesce(co.pesquisa_satisfacao, false)) or (coalesce(ce.sistema_proprio, false) and coalesce(ce.pesquisa_satisfacao, false))
       or pntp_externo(cfg, array['ouvidoria_satisfacao']);
  r := r || jsonb_build_object('c', '15.6', 'd', d, 'ext', pntp_externo(cfg, array['ouvidoria_satisfacao']),
    'f', case when d then '{}'::text[] else array['Ligue a pesquisa de satisfação do portal (Ouvidoria › Como se manifestar) ou informe o endereço da pesquisa externa.'] end);

  -- ---------- Matriz do Poder Executivo ----------
  if exec then
    -- 16. Renúncias
    ext := pntp_externo(cfg, array['renuncias', 'renuncias_desoneracoes']);
    d := exists (select 1 from public.renuncias k where k.orgao_id = p_orgao and k.situacao = 'publicado') or pntp_declarado(p_orgao, array['renuncias_desoneracoes'], hoje - 365, hoje);
    r := r || jsonb_build_object('c', '16.1', 'd', d, 'ext', ext, 'f', case when d then '{}'::text[] else array['Nenhuma desoneração publicada: cadastre ou declare que o município não concede.'] end);
    ext := pntp_externo(cfg, array['renuncias', 'renuncias_valores']);
    select coalesce(array_agg(distinct v.exercicio) filter (where v.valor_realizado is not null), '{}') into anos
      from public.renuncias_valores v join public.renuncias k on k.id = v.renuncia_id where v.orgao_id = p_orgao and k.situacao = 'publicado';
    d := cardinality(anos) > 0 or pntp_declarado(p_orgao, array['renuncias_valores', 'renuncias_desoneracoes'], make_date(v_ano - 1, 1, 1), make_date(v_ano - 1, 12, 31));
    a := (v_ano - 1) = any (anos) or pntp_declarado(p_orgao, array['renuncias_valores', 'renuncias_desoneracoes'], make_date(v_ano - 1, 1, 1), make_date(v_ano - 1, 12, 31));
    falt := pntp_anos_faltando(p_orgao, array['renuncias_valores', 'renuncias_desoneracoes'], anos, v_ano - 2);
    r := r || jsonb_build_object('c', '16.2', 'd', d, 'a', a, 's', cardinality(falt) = 0, 'ext', ext, 'f', array_remove(array[
      case when not a then 'Falta o valor realizado das renúncias de ' || (v_ano - 1) || '.' end,
      case when cardinality(falt) > 0 then 'Série histórica: falta o previsto × realizado de ' || array_to_string(falt, ', ') || '.' end], null));
    ext := pntp_externo(cfg, array['renuncias', 'renuncias_beneficiarios']);
    select max(b.atualizado_em)::date into ult from public.renuncias_beneficiarios b where b.orgao_id = p_orgao;
    d := ult is not null or pntp_declarado(p_orgao, array['renuncias_beneficiarios', 'renuncias_desoneracoes'], hoje - 365, hoje);
    a := coalesce(ult >= hoje - 365, false) or pntp_declarado(p_orgao, array['renuncias_beneficiarios', 'renuncias_desoneracoes'], hoje - 365, hoje);
    r := r || jsonb_build_object('c', '16.3', 'd', d, 'a', a, 'ext', ext, 'f', case when not d then array['Publique os beneficiários das renúncias ou declare que não há.']
      when not a then array['Beneficiários sem atualização há mais de 1 ano.'] else '{}'::text[] end);
    d := exists (select 1 from public.incentivos_projetos k where k.orgao_id = p_orgao and k.situacao = 'publicado') or pntp_declarado(p_orgao, array['renuncias_incentivos'], hoje - 365, hoje);
    r := r || jsonb_build_object('c', '16.4', 'd', d, 'ext', pntp_externo(cfg, array['renuncias', 'renuncias_incentivos']),
      'f', case when d then '{}'::text[] else array['Nenhum projeto de incentivo à cultura ou ao esporte: cadastre ou declare que não há.'] end);

    -- 17. Emendas
    for x in select * from (values ('17.1', array['federal'], 'emendas_federais', 'federal'), ('17.2', array['estadual', 'municipal'], 'emendas_estaduais', 'estadual ou municipal')) v(cod, origens, secao, nome) loop
      ext := pntp_externo(cfg, array['emendas', x.secao]);
      select count(*), coalesce(array_agg(distinct e.exercicio), '{}'),
             count(*) filter (where e.andamento = 'em_execucao' and coalesce(e.execucao_em, e.criado_em::date) < hoje - 30)
        into n, anos, n2 from public.emendas e where e.orgao_id = p_orgao and e.situacao = 'publicado' and e.origem = any (x.origens);
      d := n > 0 or pntp_declarado(p_orgao, array[x.secao], hoje - 365, hoje);
      falt := pntp_anos_faltando(p_orgao, array[x.secao], anos, v_ano - 1);
      r := r || jsonb_build_object('c', x.cod, 'd', d, 'a', d and n2 = 0, 's', cardinality(falt) = 0, 'ext', ext, 'f', array_remove(array[
        case when not d then 'Nenhuma emenda ' || x.nome || ' publicada: cadastre ou declare que não houve.' end,
        case when n2 > 0 then n2 || ' emenda(s) em execução sem atualização dos valores há mais de 30 dias.' end,
        case when cardinality(falt) > 0 then 'Série histórica: sem emendas nem declaração em ' || array_to_string(falt, ', ') || '.' end], null));
    end loop;
    select count(*), count(*) filter (where e.andamento in ('em_execucao', 'concluida') and e.valor_empenhado is null and e.valor_pago is null),
           count(*) filter (where e.andamento = 'em_execucao' and coalesce(e.execucao_em, e.criado_em::date) < hoje - 30)
      into n, n2, n3 from public.emendas e where e.orgao_id = p_orgao and e.situacao = 'publicado';
    d := n > 0 or pntp_declarado(p_orgao, array['emendas_federais', 'emendas_estaduais'], hoje - 365, hoje);
    r := r || jsonb_build_object('c', '17.3', 'd', d and n2 = 0, 'a', d and n2 = 0 and n3 = 0, 'ext', pntp_externo(cfg, array['emendas']), 'f', array_remove(array[
      case when not d then 'Nenhuma emenda publicada.' end,
      case when n2 > 0 then n2 || ' emenda(s) em execução ou concluída(s) sem empenhado/pago.' end,
      case when n3 > 0 then n3 || ' emenda(s) em execução sem atualização há mais de 30 dias.' end], null));

    -- 18. Saúde
    ext := pntp_externo(cfg, array['saude', 'saude_documentos']);
    f := array_remove(array[
      case when not exists (select 1 from public.documentos_setoriais k where k.orgao_id = p_orgao and k.tipo = 'plano_saude' and k.situacao = 'publicado'
             and v_ano between k.exercicio and coalesce(k.exercicio_fim, k.exercicio + 3)) then 'Falta o Plano Municipal de Saúde vigente.' end,
      case when not exists (select 1 from public.documentos_setoriais k where k.orgao_id = p_orgao and k.tipo = 'programacao_anual' and k.situacao = 'publicado'
             and v_ano between k.exercicio and coalesce(k.exercicio_fim, k.exercicio)) then 'Falta a Programação Anual de Saúde de ' || v_ano || '.' end,
      case when hoje > make_date(v_ano, 3, 31) and not exists (select 1 from public.documentos_setoriais k where k.orgao_id = p_orgao and k.tipo = 'relatorio_gestao'
             and k.situacao = 'publicado' and k.exercicio = v_ano - 1) then 'Falta o Relatório Anual de Gestão de ' || (v_ano - 1) || '.' end], null);
    select coalesce(array_agg(distinct k.exercicio), '{}') into anos from public.documentos_setoriais k where k.orgao_id = p_orgao and k.tipo = 'relatorio_gestao' and k.situacao = 'publicado';
    falt := pntp_anos_faltando(p_orgao, array['saude_documentos'], anos, v_ano - 2);
    d := exists (select 1 from public.documentos_setoriais k where k.orgao_id = p_orgao and k.area = 'saude' and k.situacao = 'publicado');
    if cardinality(falt) > 0 then f := f || ('Série histórica: falta o Relatório Anual de Gestão de ' || array_to_string(falt, ', ') || '.')::text; end if;
    r := r || jsonb_build_object('c', '18.1', 'd', d, 'a', d and not exists (select 1 from unnest(f) t where t not like 'Série%'), 's', cardinality(falt) = 0, 'ext', ext, 'f', f);
    ext := pntp_externo(cfg, array['saude', 'saude_servicos']);
    select count(*), count(*) filter (where coalesce(k.horario, '') = '' or not exists (select 1 from public.saude_profissionais p where p.estabelecimento_id = k.id))
      into n, n2 from public.saude_estabelecimentos k where k.orgao_id = p_orgao and k.situacao = 'publicado';
    r := r || jsonb_build_object('c', '18.2', 'd', n > 0, 'a', n > 0 and n2 = 0, 'ext', ext,
      'f', case when n = 0 then array['Nenhum estabelecimento de saúde publicado.'] when n2 > 0 then array[n2 || ' estabelecimento(s) sem horário ou sem profissionais.'] else '{}'::text[] end);
    ext := pntp_externo(cfg, array['saude', 'saude_espera']);
    select max(k.atualizado_em)::date into ult from public.saude_lista_espera k where k.orgao_id = p_orgao;
    d := ult is not null or pntp_declarado(p_orgao, array['saude_espera'], hoje - 30, hoje);
    a := coalesce(ult >= hoje - 30, false) or pntp_declarado(p_orgao, array['saude_espera'], hoje - 30, hoje);
    r := r || jsonb_build_object('c', '18.3', 'd', d, 'a', a, 'ext', ext, 'f', case when not d then array['Publique a lista de espera da regulação.']
      when not a then array['Lista de espera sem atualização há mais de 30 dias.'] else '{}'::text[] end);
    select count(*), count(*) filter (where coalesce(k.como_obter, '') = '' and coalesce(k.onde_obter, '') = '') into n, n2 from public.saude_medicamentos k where k.orgao_id = p_orgao;
    r := r || jsonb_build_object('c', '18.4', 'd', n > 0 and n2 = 0, 'ext', pntp_externo(cfg, array['saude', 'saude_medicamentos']),
      'f', case when n = 0 then array['Cadastre a relação de medicamentos do SUS.'] when n2 > 0 then array[n2 || ' medicamento(s) sem onde ou como obter.'] else '{}'::text[] end);
    ext := pntp_externo(cfg, array['saude', 'saude_estoque']);
    select max(k.posicao_em) into ult from public.saude_estoques k where k.orgao_id = p_orgao;
    d := ult is not null;
    -- Lei 14.654/2023: estoque das farmácias públicas atualizado a cada 15 dias.
    a := coalesce(ult >= hoje - 15, false);
    r := r || jsonb_build_object('c', '18.5', 'd', d, 'a', a, 'ext', ext, 'f', case when not d then array['Publique o estoque das farmácias públicas.']
      when not a then array['Estoque com posição de ' || to_char(ult, 'DD/MM/YYYY') || ': atualize a cada 15 dias.'] else '{}'::text[] end);

    -- 18.6, 19.3 e 19.4: conselhos
    for x in select * from (values ('18.6', 'saude', 'saude_conselho', 'Conselho Municipal de Saúde', 'saude'),
                                   ('19.3', 'fundeb', 'educacao_fundeb', 'Conselho do Fundeb', 'educacao'),
                                   ('19.4', 'assistencia_social', 'educacao_assistencia', 'Conselho de Assistência Social', 'educacao')) v(cod, tipo, secao, nome, pag) loop
      select k.* into cs from public.conselhos k where k.orgao_id = p_orgao and k.tipo = x.tipo and k.situacao = 'publicado' order by k.mandato_fim desc nulls last limit 1;
      d := cs.id is not null and exists (select 1 from public.conselhos_membros m where m.conselho_id = cs.id);
      a := d and coalesce(cs.mandato_fim, hoje) >= hoje and exists (select 1 from public.conselhos_documentos k where k.conselho_id = cs.id and k.tipo = 'ata' and k.data >= hoje - 90);
      r := r || jsonb_build_object('c', x.cod, 'd', d, 'a', a, 'ext', pntp_externo(cfg, array[x.pag, x.secao]), 'f', array_remove(array[
        case when cs.id is null then 'Publique o ' || x.nome || ' (composição e funcionamento).'
             when not d then 'Cadastre os membros do ' || x.nome || '.' end,
        case when d and cs.mandato_fim < hoje then 'Mandato do ' || x.nome || ' vencido em ' || to_char(cs.mandato_fim, 'DD/MM/YYYY') || ': atualize a composição.' end,
        case when d and not exists (select 1 from public.conselhos_documentos k where k.conselho_id = cs.id and k.tipo = 'ata' and k.data >= hoje - 90)
             then 'Nenhuma ata do ' || x.nome || ' nos últimos 90 dias.' end], null));
      cs := null;
    end loop;

    -- 19. Educação
    ext := pntp_externo(cfg, array['educacao', 'educacao_documentos']);
    d := exists (select 1 from public.documentos_setoriais k where k.orgao_id = p_orgao and k.tipo = 'plano_educacao' and k.situacao = 'publicado'
                 and v_ano between k.exercicio and coalesce(k.exercicio_fim, k.exercicio + 9));
    a := exists (select 1 from public.documentos_setoriais k where k.orgao_id = p_orgao and k.tipo = 'relatorio_educacao' and k.situacao = 'publicado' and k.exercicio >= v_ano - 1);
    r := r || jsonb_build_object('c', '19.1', 'd', d, 'a', a, 'ext', ext, 'f', array_remove(array[
      case when not d then 'Falta o Plano Municipal de Educação vigente.' end,
      case when not a then 'Falta o relatório de resultados da educação de ' || (v_ano - 1) || ' ou ' || v_ano || '.' end], null));
    ext := pntp_externo(cfg, array['educacao', 'educacao_creches']);
    select max(k.atualizado_em)::date into ult from public.creches_espera k where k.orgao_id = p_orgao;
    d := (ult is not null or pntp_declarado(p_orgao, array['educacao_creches'], hoje - 30, hoje))
         and exists (select 1 from public.secoes_setoriais s where s.orgao_id = p_orgao and s.secao = 'educacao_creches' and coalesce(char_length(s.texto), 0) >= 20);
    a := coalesce(ult >= hoje - 30, false) or pntp_declarado(p_orgao, array['educacao_creches'], hoje - 30, hoje);
    r := r || jsonb_build_object('c', '19.2', 'd', d, 'a', a, 'ext', ext, 'f', array_remove(array[
      case when ult is null and not pntp_declarado(p_orgao, array['educacao_creches'], hoje - 30, hoje) then 'Publique a lista de espera das creches (ou declare que não há).' end,
      case when not exists (select 1 from public.secoes_setoriais s where s.orgao_id = p_orgao and s.secao = 'educacao_creches' and coalesce(char_length(s.texto), 0) >= 20)
           then 'Faltam os critérios de prioridade de acesso às creches.' end,
      case when ult is not null and not a then 'Lista de espera das creches sem atualização há mais de 30 dias.' end], null));
  end if;

  -- ---------- Monta a saída ----------
  return query
  select k.codigo, k.ordem, k.dimensao, k.peso_dimensao, k.titulo, k.classificacao,
         case k.classificacao when 'essencial' then 2.0 when 'obrigatoria' then 1.5 else 1.0 end,
         k.modulo, k.rota, k.pagina, k.itens,
         v.d, case when k.itens like '%A%' then v.a end, case when k.itens like '%S%' then v.s end,
         case when k.itens like '%G%' then v.d end, case when k.itens like '%F%' then v.d end,
         v.nota,
         case when v.nota >= 1 then 'atende' when v.nota > 0 then 'parcial' else 'nao_atende' end,
         v.ext, v.falta
  from public.pntp_criterios k
  cross join lateral (
    select e from jsonb_array_elements(r) e where e ->> 'c' = k.codigo limit 1) j
  cross join lateral (
    select coalesce((j.e ->> 'ext')::boolean, false) as ext) x0
  cross join lateral (
    select (x0.ext or coalesce((j.e ->> 'd')::boolean, false)) as d,
           (x0.ext or (coalesce((j.e ->> 'd')::boolean, false) and coalesce((j.e ->> 'a')::boolean, (j.e ->> 'd')::boolean, false))) as a,
           (x0.ext or (coalesce((j.e ->> 'd')::boolean, false) and coalesce((j.e ->> 's')::boolean, (j.e ->> 'd')::boolean, false))) as s,
           x0.ext,
           case when x0.ext then '{}'::text[] else coalesce(array(select jsonb_array_elements_text(coalesce(j.e -> 'f', '[]'::jsonb))), '{}') end as falta) v0
  cross join lateral (
    select v0.d, v0.a, v0.s, v0.ext, v0.falta,
           round((case when v0.d then 3 else 0 end
                  + case when k.itens like '%A%' and v0.d and v0.a then 3 else 0 end
                  + case when k.itens like '%S%' and v0.d and v0.s then 2 else 0 end
                  + case when k.itens like '%G%' and v0.d then 1 else 0 end
                  + case when k.itens like '%F%' and v0.d then 1 else 0 end)::numeric
                 / (3 + case when k.itens like '%A%' then 3 else 0 end + case when k.itens like '%S%' then 2 else 0 end
                      + case when k.itens like '%G%' then 1 else 0 end + case when k.itens like '%F%' then 1 else 0 end), 4) as nota) v
  where k.matriz = 'comum' or (exec and k.matriz in ('executivo', 'executivo_consorcio'))
  order by k.ordem;
end;
$$;
grant execute on function public.avaliacao_pntp(uuid) to authenticated;

drop function if exists public.avaliacao_pntp_resumo(uuid);
create or replace function public.avaliacao_pntp_resumo(p_orgao uuid)
returns table (indice numeric, nivel text, criterios integer, atendidos integer, parciais integer, nao_atendidos integer,
               essenciais integer, essenciais_atendidos integer, externos integer, calculado_em timestamptz)
language sql stable security definer set search_path = public as $$
  with a as (select * from public.avaliacao_pntp(p_orgao)),
  t as (select round(100 * sum(a.peso_dimensao * a.peso_criterio * a.nota) / nullif(sum(a.peso_dimensao * a.peso_criterio), 0), 2) as indice,
               count(*)::int as criterios,
               count(*) filter (where a.situacao = 'atende')::int as atendidos,
               count(*) filter (where a.situacao = 'parcial')::int as parciais,
               count(*) filter (where a.situacao = 'nao_atende')::int as nao_atendidos,
               count(*) filter (where a.classificacao = 'essencial')::int as essenciais,
               count(*) filter (where a.classificacao = 'essencial' and a.situacao = 'atende')::int as essenciais_atendidos,
               count(*) filter (where a.externo)::int as externos
        from a)
  select t.indice,
         case when t.indice is null or t.indice = 0 then 'inexistente'
              when t.indice >= 75 and t.essenciais_atendidos < t.essenciais then 'elevado'
              when t.indice >= 95 then 'diamante' when t.indice >= 85 then 'ouro' when t.indice >= 75 then 'prata'
              when t.indice >= 50 then 'intermediario' when t.indice >= 30 then 'basico' else 'inicial' end,
         t.criterios, t.atendidos, t.parciais, t.nao_atendidos, t.essenciais, t.essenciais_atendidos, t.externos, now()
  from t;
$$;
grant execute on function public.avaliacao_pntp_resumo(uuid) to authenticated;
