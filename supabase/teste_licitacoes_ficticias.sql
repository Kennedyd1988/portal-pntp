-- =====================================================================
-- PORTAL PNTP · SOFT+
-- DADOS FICTÍCIOS PARA TESTE — Licitações (Riacho da Cruz)
--
-- Não faz parte da instalação: serve só para ver como o painel e o site
-- ficam. Rodar no SQL Editor DEPOIS do script 12. Pode rodar mais de uma
-- vez: apaga os dados de teste anteriores e insere de novo.
-- Precisa do script 14 (tipos de documento parecer, orçamento, justificativa).
-- Todos os processos de teste têm o "processo administrativo" começando
-- com "TESTE", o que permite apagar tudo de uma vez (comando no fim).
-- =====================================================================

-- Script 26: registros ligados não saem junto. Se já houver contratos, empenhos ou obras de teste
-- ligados a estes processos, rode antes teste_apagar_ficticios.sql (apaga todos os dados de teste).
do $$ begin
  if exists (select 1 from public.contratos c join public.licitacoes l on l.id = c.licitacao_id where l.processo like 'TESTE%')
     or exists (select 1 from public.despesas d join public.licitacoes l on l.id = d.licitacao_id where l.processo like 'TESTE%') then
    raise exception 'Há contratos ou empenhos ligados às licitações de teste: rode antes teste_apagar_ficticios.sql.';
  end if;
end $$;
delete from public.licitacoes_documentos where licitacao_id in (select id from public.licitacoes where processo like 'TESTE%');
delete from public.licitacoes
where orgao_id = (select id from public.orgaos where cnpj = '08.153.454/0001-04')
  and processo like 'TESTE%';

with o as (select id from public.orgaos where cnpj = '08.153.454/0001-04'),
base (modalidade, numero, ano, objeto, srp, criterio, unidade, estimado, homologado, publicacao, abertura, andamento, vencedores, origem, amparo) as (values
  ('pregao_eletronico'::text, '001/2026'::text, 2026, 'Registro de preços para aquisição de gêneros alimentícios para a merenda escolar da rede municipal de ensino.'::text, true, 'Menor preço por item'::text, 'Secretaria Municipal de Educação'::text, 486500.00::numeric, 452310.75::numeric, date '2026-02-10', timestamptz '2026-02-26 09:00-03', 'homologada'::text, 'Mercadinho Bom Preço Ltda – R$ 301.200,50 (lotes 1 a 4); Distribuidora Oeste Ltda – R$ 151.110,25 (lotes 5 e 6)'::text, 'portal'::text, null::text),
  ('pregao_eletronico', '002/2026', 2026, 'Registro de preços para aquisição de combustíveis (gasolina comum e óleo diesel S10) para a frota municipal.', true, 'Menor preço por item', 'Secretaria Municipal de Administração', 612000.00, 598440.00, date '2026-03-04', timestamptz '2026-03-19 09:00-03', 'homologada', 'Posto Riacho Ltda – R$ 598.440,00', 'portal', null),
  ('pregao_eletronico', '003/2026', 2026, 'Contratação de empresa para locação de veículos tipo passeio e utilitário para atender às secretarias municipais.', false, 'Menor preço global', 'Secretaria Municipal de Administração', 288000.00, null, date '2026-05-12', timestamptz '2026-05-27 09:00-03', 'em_andamento', null, 'portal', null),
  ('pregao_eletronico', '004/2026', 2026, 'Aquisição de medicamentos da atenção básica para as Unidades Básicas de Saúde.', true, 'Menor preço por item', 'Secretaria Municipal de Saúde', 354780.00, null, date '2026-10-28', timestamptz '2026-11-19 09:00-03', 'aberta', null, 'link', null),
  ('concorrencia_eletronica', '001/2026', 2026, 'Contratação de empresa de engenharia para pavimentação em paralelepípedo de ruas do bairro Centro, conforme projeto básico.', false, 'Menor preço global', 'Secretaria Municipal de Obras', 1245800.00, 1198650.32, date '2026-04-02', timestamptz '2026-05-06 09:00-03', 'homologada', 'Construtora Potiguar Ltda – R$ 1.198.650,32', 'portal', null),
  ('concorrencia_eletronica', '002/2026', 2026, 'Construção de quadra poliesportiva coberta na Escola Municipal Maria das Graças.', false, 'Menor preço global', 'Secretaria Municipal de Educação', 890000.00, null, date '2026-09-15', timestamptz '2026-10-20 09:00-03', 'suspensa', null, 'portal', null),
  ('credenciamento', '001/2026', 2026, 'Credenciamento de profissionais médicos para plantões no Hospital Municipal.', false, null, 'Secretaria Municipal de Saúde', 420000.00, null, date '2026-01-20', null, 'em_andamento', null, 'portal', null),
  ('chamada_publica', '001/2026', 2026, 'Aquisição de gêneros alimentícios da agricultura familiar para a alimentação escolar (PNAE).', false, null, 'Secretaria Municipal de Educação', 98000.00, 97450.00, date '2026-02-24', timestamptz '2026-03-17 09:00-03', 'homologada', 'Associação dos Agricultores do Riacho – R$ 97.450,00', 'portal', 'Lei 11.947/2009, art. 14'),
  ('pregao_eletronico', '001/2025', 2025, 'Registro de preços para aquisição de material de expediente e de limpeza.', true, 'Menor preço por item', 'Secretaria Municipal de Administração', 156000.00, 141220.40, date '2025-02-11', timestamptz '2025-02-27 09:00-03', 'homologada', 'Papelaria Central Ltda – R$ 141.220,40', 'portal', null),
  ('pregao_eletronico', '002/2025', 2025, 'Contratação de empresa para manutenção preventiva e corretiva da frota municipal, com fornecimento de peças.', true, 'Maior desconto', 'Secretaria Municipal de Obras', 320000.00, null, date '2025-04-08', timestamptz '2025-04-24 09:00-03', 'deserta', null, 'portal', null),
  ('pregao_eletronico', '003/2025', 2025, 'Contratação de empresa para manutenção preventiva e corretiva da frota municipal, com fornecimento de peças (repetição).', true, 'Maior desconto', 'Secretaria Municipal de Obras', 320000.00, 305000.00, date '2025-05-20', timestamptz '2025-06-04 09:00-03', 'homologada', 'Auto Peças Oeste Ltda – desconto de 18%', 'portal', null),
  ('concorrencia_eletronica', '001/2025', 2025, 'Reforma e ampliação da Unidade Básica de Saúde do Sítio Lagoa.', false, 'Menor preço global', 'Secretaria Municipal de Saúde', 540000.00, null, date '2025-08-12', timestamptz '2025-09-16 09:00-03', 'revogada', null, 'portal', null),
  ('pregao_presencial', '005/2024', 2024, 'Aquisição de kits escolares para os alunos da rede municipal.', false, 'Menor preço por lote', 'Secretaria Municipal de Educação', 88000.00, 79800.00, date '2024-01-15', timestamptz '2024-01-30 09:00-03', 'homologada', 'Comercial Escolar Ltda – R$ 79.800,00', 'portal', null),
  ('tomada_precos', '002/2022', 2022, 'Construção de passagem molhada na comunidade Sítio Barra.', false, 'Menor preço global', 'Secretaria Municipal de Obras', 310000.00, 296400.00, date '2022-06-01', timestamptz '2022-06-20 09:00-03', 'encerrada', 'Construtora Vale Ltda – R$ 296.400,00', 'portal', 'Lei 8.666/1993'),
  ('dispensa', '014/2026', 2026, 'Contratação de serviço de manutenção do sistema de ar-condicionado da sede da Prefeitura.', false, null, 'Secretaria Municipal de Administração', 18400.00, 17900.00, date '2026-03-02', null, 'homologada', 'Frio Norte Refrigeração ME – R$ 17.900,00', 'portal', 'Lei 14.133/2021, art. 75, II'),
  ('dispensa', '021/2026', 2026, 'Aquisição emergencial de cestas básicas para famílias atingidas pelas chuvas.', false, null, 'Secretaria Municipal de Assistência Social', 45000.00, 44100.00, date '2026-04-18', null, 'homologada', 'Mercadinho Bom Preço Ltda – R$ 44.100,00', 'portal', 'Lei 14.133/2021, art. 75, VIII'),
  ('inexigibilidade', '003/2026', 2026, 'Contratação de atração artística para a festa de emancipação política do município.', false, null, 'Secretaria Municipal de Cultura', 60000.00, 60000.00, date '2026-06-05', null, 'homologada', 'Banda Forró Raiz – R$ 60.000,00', 'portal', 'Lei 14.133/2021, art. 74, II'),
  ('inexigibilidade', '001/2025', 2025, 'Contratação de assessoria contábil especializada.', false, null, 'Secretaria Municipal de Finanças', 96000.00, 96000.00, date '2025-01-08', null, 'homologada', 'Contabilidade Pública Assessoria Ltda – R$ 96.000,00', 'portal', 'Lei 14.133/2021, art. 74, III'),
  ('adesao_ata', '001/2026', 2026, 'Adesão à Ata de Registro de Preços nº 12/2025 do Consórcio CIMOP para aquisição de máquina retroescavadeira.', false, null, 'Secretaria Municipal de Agricultura', 520000.00, 512000.00, date '2026-07-22', null, 'homologada', 'Máquinas Nordeste S/A – R$ 512.000,00', 'portal', 'Lei 14.133/2021, art. 86, § 2º')
),
ins as (
  insert into public.licitacoes (orgao_id, origem, modalidade, numero, ano, processo, objeto, srp, criterio, unidade_nome,
    valor_estimado, valor_homologado, data_publicacao, data_abertura, andamento, vencedores, link_externo, amparo_legal, situacao)
  select o.id, b.origem, b.modalidade, b.numero, b.ano, 'TESTE ' || lpad((row_number() over ())::text, 3, '0') || '/' || b.ano, b.objeto, b.srp, b.criterio, b.unidade,
         b.estimado, b.homologado, b.publicacao, b.abertura, b.andamento, b.vencedores,
         case when b.origem = 'link' then 'https://www.diariomunicipal.com.br/femurn/?teste=1' end, b.amparo, 'publicado'
  from o, base b
  returning id, orgao_id, modalidade, andamento, data_publicacao, origem
)
-- Documentos de teste (links): edital/aviso para licitações; termo de ratificação nas diretas;
-- ata e homologação quando homologada.
insert into public.licitacoes_documentos (licitacao_id, orgao_id, tipo, titulo, data, link_externo, ordem)
select i.id, i.orgao_id, d.tipo, d.titulo, i.data_publicacao + d.dias, 'https://www.diariomunicipal.com.br/femurn/?teste=1', d.ordem
from ins i
cross join lateral (values
  ('aviso', 'Aviso de licitação', 0, 10, i.modalidade not in ('dispensa', 'inexigibilidade', 'adesao_ata') and i.origem = 'portal'),
  ('edital', 'Edital e anexos', 0, 20, i.modalidade not in ('dispensa', 'inexigibilidade', 'adesao_ata') and i.origem = 'portal'),
  ('termo_referencia', 'Termo de referência', 0, 30, i.origem = 'portal'),
  ('orcamento', 'Pesquisa de preços e mapa comparativo', -10, 25, i.origem = 'portal'),
  ('parecer', 'Parecer jurídico', -3, 28, i.origem = 'portal'),
  ('justificativa', 'Justificativa da escolha do contratado e do preço', 0, 35, i.modalidade in ('dispensa', 'inexigibilidade', 'adesao_ata')),
  ('ata', 'Ata da sessão pública', 16, 40, i.andamento in ('homologada', 'deserta', 'encerrada') and i.modalidade not in ('dispensa', 'inexigibilidade', 'adesao_ata')),
  ('homologacao', 'Termo de homologação e adjudicação', 22, 50, i.andamento in ('homologada', 'encerrada') and i.modalidade not in ('dispensa', 'inexigibilidade', 'adesao_ata')),
  ('ratificacao', 'Termo de ratificação', 2, 50, i.modalidade in ('dispensa', 'inexigibilidade', 'adesao_ata')),
  ('contrato', 'Contrato', 10, 60, i.andamento = 'homologada'),
  ('outro', 'Aviso de suspensão', 20, 70, i.andamento = 'suspensa'),
  ('outro', 'Termo de revogação', 30, 70, i.andamento = 'revogada')
) d(tipo, titulo, dias, ordem, usar)
where d.usar;

-- Conferência
select modalidade, ano, count(*) from public.licitacoes where processo like 'TESTE%' group by 1, 2 order by 2 desc, 1;

-- Para APAGAR todos os dados de teste depois (tire os dois traços e rode; os documentos vão junto):
-- (para apagar tudo, use teste_apagar_ficticios.sql)
