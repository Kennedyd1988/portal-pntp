-- =====================================================================
-- PORTAL PNTP · SOFT+
-- DADOS FICTÍCIOS PARA TESTE — e-SIC (12.1 a 12.9) e Ouvidoria (14.1 e
-- 14.2) (Riacho da Cruz)
--
-- Não faz parte da instalação: serve só para ver como o painel e o site
-- ficam. Rodar no SQL Editor DEPOIS do script 24. Pode repetir: apaga os
-- dados de teste anteriores e insere de novo.
-- Identificação dos dados de teste: observação/código começando com "TESTE".
-- Os dados de contato dos canais são gravados só se o canal ainda não
-- tiver responsável (não apaga o que já foi preenchido).
-- =====================================================================

delete from public.atendimento_relatorios
where orgao_id = (select id from public.orgaos where cnpj = '08.153.454/0001-04') and observacao like 'TESTE%';
delete from public.informacoes_classificadas
where orgao_id = (select id from public.orgaos where cnpj = '08.153.454/0001-04') and codigo like 'TESTE%';

-- Canais: SIC na Controladoria e Ouvidoria no Gabinete (dados de exemplo).
with o as (select id from public.orgaos where cnpj = '08.153.454/0001-04')
insert into public.atendimento_canais (orgao_id, canal, setor, responsavel_nome, responsavel_cargo, responsavel_ato, endereco, telefone, email, horario,
  canal_url, outros_canais, prazo_resposta, prazo_recurso, prazo_decisao_recurso, autoridade_recurso_1, autoridade_recurso_2, procedimento_recurso, norma_texto, norma_url)
select o.id, 'esic', 'Controladoria-Geral do Município', 'Maria das Graças Souza', 'Controladora-Geral', 'Portaria nº 012/2026',
  'Rua Pedro Velho, 120, Centro, Riacho da Cruz/RN', '(84) 3333-0000', 'sic@riachodacruz.rn.gov.br', 'Segunda a sexta, das 7h às 13h',
  'https://falabr.cgu.gov.br/web/home?teste=1', 'Pedido por carta ou no balcão do SIC, no endereço acima.',
  '20 dias, prorrogáveis por mais 10 dias com justificativa (LAI, art. 11, §§ 1º e 2º).',
  '10 dias a contar da ciência da decisão (LAI, art. 15).', '5 dias (LAI, art. 15, parágrafo único).',
  'Controlador-Geral do Município', 'Prefeito Municipal',
  'O recurso é apresentado pelo mesmo canal do pedido, informando o número do protocolo e os motivos.',
  'Decreto nº 045/2013 (regulamenta a LAI no Município)', 'https://riachodacruz.rn.gov.br/teste/decreto-45-2013.pdf'
from o
on conflict (orgao_id, canal) do update set setor = excluded.setor, responsavel_nome = excluded.responsavel_nome, responsavel_cargo = excluded.responsavel_cargo,
  responsavel_ato = excluded.responsavel_ato, endereco = excluded.endereco, telefone = excluded.telefone, email = excluded.email, horario = excluded.horario,
  canal_url = coalesce(public.atendimento_canais.canal_url, excluded.canal_url), outros_canais = excluded.outros_canais, prazo_resposta = excluded.prazo_resposta,
  prazo_recurso = excluded.prazo_recurso, prazo_decisao_recurso = excluded.prazo_decisao_recurso, autoridade_recurso_1 = excluded.autoridade_recurso_1,
  autoridade_recurso_2 = excluded.autoridade_recurso_2, procedimento_recurso = excluded.procedimento_recurso, norma_texto = excluded.norma_texto, norma_url = excluded.norma_url
where public.atendimento_canais.responsavel_nome is null;

with o as (select id from public.orgaos where cnpj = '08.153.454/0001-04')
insert into public.atendimento_canais (orgao_id, canal, setor, responsavel_nome, responsavel_cargo, endereco, telefone, email, horario, canal_url, outros_canais, prazo_resposta)
select o.id, 'ouvidoria', 'Ouvidoria-Geral do Município', 'José Ribamar Alves', 'Ouvidor-Geral',
  'Rua Pedro Velho, 120, Centro, Riacho da Cruz/RN', '(84) 3333-0001', 'ouvidoria@riachodacruz.rn.gov.br', 'Segunda a sexta, das 7h às 13h',
  'https://falabr.cgu.gov.br/web/home?teste=2', 'WhatsApp (84) 99999-0000 e urna na recepção da Prefeitura.',
  '30 dias, prorrogáveis uma vez por igual período com justificativa (Lei 13.460/2017, art. 16).'
from o
on conflict (orgao_id, canal) do update set setor = excluded.setor, responsavel_nome = excluded.responsavel_nome, responsavel_cargo = excluded.responsavel_cargo,
  endereco = excluded.endereco, telefone = excluded.telefone, email = excluded.email, horario = excluded.horario,
  canal_url = coalesce(public.atendimento_canais.canal_url, excluded.canal_url), outros_canais = excluded.outros_canais, prazo_resposta = excluded.prazo_resposta
where public.atendimento_canais.responsavel_nome is null;

-- Relatórios do e-SIC: 2023 a 2025 anuais (publicados), 1º semestre de 2026 (publicado) e 2º trimestre de 2026 (rascunho).
with o as (select id from public.orgaos where cnpj = '08.153.454/0001-04')
insert into public.atendimento_relatorios (orgao_id, canal, exercicio, abrangencia, numero, recebidos, atendidos, parciais, indeferidos, em_andamento, outros,
  recursos_1, recursos_2, prazo_medio_dias, pessoas_fisicas, pessoas_juridicas, sexo_feminino, sexo_masculino, sexo_nao_informado, observacao, link_externo, situacao)
select o.id, 'esic', v.* from o, (values
  (2025, 'ano', null::int, 64, 51, 6, 4, 0, 3, 3, 1, 12.4, 55, 9, 27, 26, 2, 'TESTE · Relatório anual de 2025.', 'https://riachodacruz.rn.gov.br/teste/relatorio-lai-2025.pdf', 'publicado'),
  (2024, 'ano', null, 48, 40, 3, 3, 0, 2, 2, 0, 14.0, 42, 6, 20, 21, 1, 'TESTE · Relatório anual de 2024.', null, 'publicado'),
  (2023, 'ano', null, 37, 30, 2, 4, 0, 1, 4, 1, 16.8, 33, 4, 15, 17, 1, 'TESTE · Relatório anual de 2023.', null, 'publicado'),
  (2026, 'semestre', 1, 35, 28, 2, 1, 3, 1, 1, 0, 11.2, 31, 4, 16, 14, 1, 'TESTE · 1º semestre de 2026.', null, 'publicado'),
  (2026, 'trimestre', 3, 19, 14, 1, 1, 3, 0, 0, 0, 10.5, 17, 2, 9, 8, 0, 'TESTE · 3º trimestre de 2026 (em conferência).', null, 'rascunho')
) v(exercicio, abrangencia, numero, recebidos, atendidos, parciais, indeferidos, em_andamento, outros, recursos_1, recursos_2, prazo, pf, pj, f, m, ni, obs, link, situacao);

-- Distribuições do relatório de 2025 (faixa etária, escolaridade, assunto, motivo da negativa).
with r as (select r.id, r.orgao_id from public.atendimento_relatorios r join public.orgaos o on o.id = r.orgao_id
           where o.cnpj = '08.153.454/0001-04' and r.canal = 'esic' and r.exercicio = 2025 and r.abrangencia = 'ano')
insert into public.atendimento_relatorios_itens (orgao_id, relatorio_id, dimensao, item, quantidade, ordem)
select r.orgao_id, r.id, v.* from r, (values
  ('faixa_etaria', 'Até 24 anos', 6, 1), ('faixa_etaria', '25 a 39 anos', 24, 2), ('faixa_etaria', '40 a 59 anos', 19, 3), ('faixa_etaria', '60 anos ou mais', 6, 4),
  ('escolaridade', 'Ensino médio', 21, 1), ('escolaridade', 'Ensino superior', 28, 2), ('escolaridade', 'Não informado', 6, 3),
  ('assunto', 'Licitações e contratos', 18, 1), ('assunto', 'Pessoal e folha', 15, 2), ('assunto', 'Obras', 11, 3), ('assunto', 'Saúde', 9, 4), ('assunto', 'Outros', 11, 5),
  ('motivo_negativa', 'Dados pessoais (LAI, art. 31)', 2, 1), ('motivo_negativa', 'Pedido genérico ou desproporcional (Decreto 7.724, art. 13)', 2, 2)
) v(dimensao, item, quantidade, ordem);

-- Relatórios da Ouvidoria: 2024 e 2025 (publicados).
with o as (select id from public.orgaos where cnpj = '08.153.454/0001-04')
insert into public.atendimento_relatorios (orgao_id, canal, exercicio, abrangencia, recebidos, atendidos, indeferidos, em_andamento, prazo_medio_dias,
  reclamacoes, denuncias, sugestoes, elogios, solicitacoes, simplifique, observacao, situacao)
select o.id, 'ouvidoria', v.* from o, (values
  (2025, 'ano', 212, 196, 9, 7, 18.5, 98, 21, 30, 25, 36, 2, 'TESTE · Relatório anual de gestão da Ouvidoria 2025.', 'publicado'),
  (2024, 'ano', 174, 165, 6, 3, 21.0, 80, 17, 26, 19, 31, 1, 'TESTE · Relatório anual de gestão da Ouvidoria 2024.', 'publicado')
) v(exercicio, abrangencia, recebidos, atendidos, indeferidos, em_andamento, prazo, rec, den, sug, elo, sol, simp, obs, situacao);

-- Informações classificadas (2023 a 2025) e desclassificadas.
with o as (select id from public.orgaos where cnpj = '08.153.454/0001-04')
insert into public.informacoes_classificadas (orgao_id, codigo, assunto, grau, fundamento, unidade, autoridade, data_classificacao, prazo_fim, evento_fim,
  data_desclassificacao, motivo_desclassificacao, situacao)
select o.id, v.* from o, (values
  ('TESTE-0001/2025', 'Plano de segurança das instalações do almoxarifado central', 'reservado', 'Lei 12.527/2011, art. 23, VII', 'Secretaria de Administração', 'Secretário de Administração',
    date '2025-03-10', date '2030-03-09', null, null::date, null, 'publicado'),
  ('TESTE-0002/2025', 'Estudo de localização de nova adutora (fase de negociação de desapropriações)', 'reservado', 'Lei 12.527/2011, art. 23, VI', 'Secretaria de Obras', 'Prefeito Municipal',
    date '2025-08-21', null, 'Publicação do decreto de utilidade pública', null, null, 'publicado'),
  ('TESTE-0003/2024', 'Relatório de inspeção de segurança da rede de abastecimento', 'secreto', 'Lei 12.527/2011, art. 23, III', 'Secretaria de Obras', 'Prefeito Municipal',
    date '2024-05-02', date '2039-05-01', null, null, null, 'publicado'),
  ('TESTE-0004/2023', 'Proposta de negociação de dívida com fornecedor de energia', 'reservado', 'Lei 12.527/2011, art. 23, IV', 'Secretaria de Finanças', 'Secretário de Finanças',
    date '2023-02-14', date '2026-02-13', null, date '2026-02-14', 'prazo', 'publicado'),
  ('TESTE-0005/2023', 'Laudo técnico de vulnerabilidade do sistema de TI', 'reservado', 'Lei 12.527/2011, art. 23, VIII', 'Secretaria de Administração', 'Secretário de Administração',
    date '2023-09-05', date '2028-09-04', null, date '2025-11-20', 'reavaliacao', 'publicado'),
  ('TESTE-0006/2026', 'Plano de contingência para eventos (em elaboração)', 'reservado', 'Lei 12.527/2011, art. 23, III', 'Gabinete do Prefeito', 'Prefeito Municipal',
    date '2026-10-01', date '2031-09-30', null, null, null, 'rascunho')
) v(codigo, assunto, grau, fundamento, unidade, autoridade, data_classificacao, prazo_fim, evento_fim, data_desclassificacao, motivo, situacao);
