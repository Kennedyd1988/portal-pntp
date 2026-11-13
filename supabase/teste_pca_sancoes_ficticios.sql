-- =====================================================================
-- PORTAL PNTP · SOFT+
-- DADOS FICTÍCIOS PARA TESTE — PCA (8.6) e sanções (8.7) (Riacho da Cruz)
--
-- Não faz parte da instalação: serve só para ver como o painel e o site
-- ficam. Rodar no SQL Editor DEPOIS do script 16. Pode repetir: apaga os
-- dados de teste anteriores e insere de novo.
-- Identificação dos dados de teste: descrição/processo começando com "TESTE".
-- =====================================================================

delete from public.pca
where orgao_id = (select id from public.orgaos where cnpj = '08.153.454/0001-04') and descricao like 'TESTE%';
delete from public.sancoes
where orgao_id = (select id from public.orgaos where cnpj = '08.153.454/0001-04') and processo like 'TESTE%';

-- PCA: plano de 2024, 2025 e 2026 (+ duas atualizações de 2026, uma em rascunho).
with o as (select id from public.orgaos where cnpj = '08.153.454/0001-04')
insert into public.pca (orgao_id, ano, tipo, descricao, ato_aprovacao, data_aprovacao, valor_total, qtd_itens, link_externo, situacao)
select o.id, v.ano, v.tipo, v.descricao, v.ato, v.data, v.valor, v.itens, 'https://pncp.gov.br/app/pca?teste=1', v.situacao
from o, (values
  (2026, 'plano',       'TESTE · Plano de Contratações Anual 2026.',                                'Portaria nº 003/2026', date '2026-01-08', 4850000.00, 62, 'publicado'),
  (2026, 'atualizacao', 'TESTE · 1ª revisão: inclusão de 4 itens da Secretaria de Saúde.',           'Portaria nº 041/2026', date '2026-05-14', 5012300.00, 66, 'publicado'),
  (2026, 'atualizacao', 'TESTE · 2ª revisão (em análise): exclusão de 2 itens de obras.',            null,                   date '2026-10-30', 4890300.00, 64, 'rascunho'),
  (2025, 'plano',       'TESTE · Plano de Contratações Anual 2025.',                                'Portaria nº 002/2025', date '2025-01-10', 4310000.00, 55, 'publicado'),
  (2024, 'plano',       'TESTE · Plano de Contratações Anual 2024.',                                'Portaria nº 005/2024', date '2024-01-12', 3920000.00, 48, 'publicado')
) v(ano, tipo, descricao, ato, data, valor, itens, situacao);

-- Sanções: uma de cada tipo, vigentes e encerradas, 2023 a 2026 (uma em rascunho).
with o as (select id from public.orgaos where cnpj = '08.153.454/0001-04')
insert into public.sancoes (orgao_id, sancionado_nome, sancionado_doc, tipo, fundamento, motivo, processo, referencia,
  data_aplicacao, inicio, fim, valor_multa, ato, link_externo, situacao)
select o.id, v.nome, v.doc, v.tipo, v.fund, v.motivo, v.proc, v.ref, v.data, v.ini, v.fim, v.multa, v.ato,
       'https://www.diariomunicipal.com.br/femurn/?teste=1', v.situacao
from o, (values
  ('Distribuidora Oeste Ltda', '10007919000110', 'impedimento', 'Lei 14.133/2021, art. 156, III',
   'Não entregou os gêneros alimentícios dos lotes 5 e 6 nos prazos da ata de registro de preços.', 'TESTE PAS 004/2026', 'Pregão eletrônico 001/2026',
   date '2026-06-10', date '2026-06-10', date '2028-06-09', null::numeric, 'Portaria nº 052/2026, DOM/FEMURN de 11/06/2026', 'publicado'),
  ('Posto Riacho Ltda', '10015838000111', 'multa', 'Lei 14.133/2021, art. 156, II',
   'Atraso de 12 dias no abastecimento da frota.', 'TESTE PAS 007/2026', 'Contrato 002/2026',
   date '2026-08-21', null::date, null::date, 5984.40, 'Portaria nº 077/2026, DOM/FEMURN de 22/08/2026', 'publicado'),
  ('Frio Norte Refrigeração ME', '10023757000112', 'advertencia', 'Lei 14.133/2021, art. 156, I',
   'Atendimento fora do horário previsto no termo de referência.', 'TESTE PAS 002/2026', 'Dispensa 014/2026',
   date '2026-04-02', null, null, null, 'Ofício nº 015/2026', 'publicado'),
  ('Construtora Vale Ltda', '10031676000113', 'inidoneidade', 'Lei 14.133/2021, art. 156, IV',
   'Apresentação de atestado de capacidade técnica falso na concorrência.', 'TESTE PAS 011/2025', 'Concorrência eletrônica 001/2025',
   date '2025-10-15', date '2025-10-15', date '2029-10-14', null, 'Decreto nº 128/2025, DOM/FEMURN de 16/10/2025', 'publicado'),
  ('Comercial Escolar Ltda', '10039595000114', 'suspensao', 'Lei 8.666/1993, art. 87, III',
   'Entrega de kits escolares em desacordo com as especificações.', 'TESTE PAS 003/2023', 'Pregão presencial 005/2024',
   date '2023-11-20', date '2023-11-20', date '2025-11-19', null, 'Portaria nº 098/2023', 'publicado'),
  ('José Carlos de Almeida', '12345678901', 'multa', 'Lei 14.133/2021, art. 156, II',
   'Prestação parcial do serviço de transporte escolar (pessoa física).', 'TESTE PAS 009/2026', 'Contrato 019/2026',
   date '2026-10-05', null, null, 1200.00, 'Portaria nº 101/2026', 'rascunho')
) v(nome, doc, tipo, fund, motivo, proc, ref, data, ini, fim, multa, ato, situacao);

select 'pca' as tabela, ano::text as ano, tipo, situacao from public.pca where descricao like 'TESTE%'
union all
select 'sancoes', ano::text, tipo, situacao from public.sancoes where processo like 'TESTE%'
order by 1, 2 desc;

-- Para APAGAR (tire os dois traços e rode):
-- delete from public.pca where descricao like 'TESTE%';
-- delete from public.sancoes where processo like 'TESTE%';
