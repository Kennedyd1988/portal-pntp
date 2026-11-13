-- =====================================================================
-- PORTAL PNTP · SOFT+
-- DADOS FICTÍCIOS PARA TESTE — Planejamento e prestação de contas
-- (Riacho da Cruz)
--
-- Não faz parte da instalação: serve só para ver como o painel e o site
-- ficam. Rodar no SQL Editor DEPOIS do script 10. Pode rodar mais de uma
-- vez: apaga os dados de teste anteriores e insere de novo.
-- Todos os documentos apontam para um link terminado em "?teste=1"
-- (ou são "pendentes" com a observação "TESTE"), o que permite apagar
-- tudo de uma vez (comando no fim).
--
-- Faltas propositais, para ver o quadro do PNTP no painel apontar:
--   · RREO do 6º bimestre de 2024;
--   · julgamento da Câmara das contas de 2025.
-- =====================================================================

delete from public.documentos_contas
where orgao_id = (select id from public.orgaos where cnpj = '08.153.454/0001-04')
  and (link_externo like '%teste=1%' or descricao = 'TESTE');

with o as (select id from public.orgaos where cnpj = '08.153.454/0001-04'),
docs (tipo, exercicio, exercicio_fim, periodicidade, periodo, parte, ordem, resultado, numero_ato, data_publicacao) as (
  -- PPA (dois ciclos)
  select 'ppa'::text, 2022, 2025, null::text, null::int, 'Lei nº 432/2021'::text, 10, null::text, null::text, date '2021-12-15' union all
  select 'ppa', 2022, 2025, null, null, 'Anexo – Programas e metas', 20, null, null, date '2021-12-15' union all
  select 'ppa', 2026, 2029, null, null, 'Lei nº 497/2025', 10, null, null, date '2025-12-10' union all
  select 'ppa', 2026, 2029, null, null, 'Anexo I – Programas temáticos', 20, null, null, date '2025-12-10' union all
  select 'ppa', 2026, 2029, null, null, 'Anexo II – Metas e prioridades', 30, null, null, date '2025-12-10' union all
  -- Plano Estratégico
  select 'plano_estrategico', 2025, 2028, null, null, 'Documento completo', 10, null, null, date '2025-03-20' union all
  -- LDO e LOA (lei + anexos), de 2023 a 2026; LDO 2027 já aprovada
  select t, a, null, null, null, p, ord, null, null, make_date(a - 1, case when t = 'ldo' then 7 else 12 end, 15)
  from (values ('ldo'), ('loa')) x(t), generate_series(2023, 2026) a,
       (values ('Lei', 10), ('Anexo de Metas Fiscais', 20), ('Anexo de Riscos Fiscais', 30)) y(p, ord)
  where not (t = 'loa' and ord = 30) union all
  select 'ldo', 2027, null, null, null, 'Lei', 10, null, null, date '2026-07-14' union all
  select 'ldo', 2027, null, null, null, 'Anexo de Metas Fiscais', 20, null, null, date '2026-07-14' union all
  -- RREO bimestral, 2023 a 2026 (sem o 6º de 2024; 2026 até o 4º, o 5º vence em 30/11)
  select 'rreo', a, null, 'bimestral', b, 'Relatório completo', 10, null, null,
         (make_date(a, 1, 1) + make_interval(months => 2 * b) + interval '25 days')::date
  from generate_series(2023, 2026) a, generate_series(1, 6) b
  where make_date(a, 1, 1) + make_interval(months => 2 * b) + interval '25 days' <= current_date
    and not (a = 2024 and b = 6) union all
  -- RGF semestral (município com menos de 50 mil habitantes)
  select 'rgf', a, null, 'semestral', s, 'Relatório completo', 10, null, null,
         (make_date(a, 1, 1) + make_interval(months => 6 * s) + interval '25 days')::date
  from generate_series(2023, 2026) a, generate_series(1, 2) s
  where make_date(a, 1, 1) + make_interval(months => 6 * s) + interval '25 days' <= current_date union all
  -- Balanço Geral e Relatório de Gestão, 2022 a 2025
  select 'balanco', a, null, null, null, 'Balanço Geral', 10, null, null, make_date(a + 1, 3, 28) from generate_series(2022, 2025) a union all
  select 'balanco', a, null, null, null, 'Notas explicativas', 20, null, null, make_date(a + 1, 3, 28) from generate_series(2022, 2025) a union all
  select 'relatorio_gestao', a, null, null, null, 'Documento completo', 10, null, null, make_date(a + 1, 3, 28) from generate_series(2022, 2025) a union all
  -- Parecer do TCE
  select 'parecer_tce', 2022, null, null, null, 'Parecer prévio', 10, 'aprovadas', 'Parecer Prévio nº 101/2024-TC', date '2024-06-12' union all
  select 'parecer_tce', 2023, null, null, null, 'Parecer prévio', 10, 'aprovadas', 'Parecer Prévio nº 088/2025-TC', date '2025-05-20' union all
  select 'parecer_tce', 2024, null, null, null, 'Parecer prévio', 10, 'aprovadas_ressalvas', 'Parecer Prévio nº 134/2026-TC', date '2026-08-04' union all
  select 'parecer_tce', 2025, null, null, null, 'Aguardando apreciação', 10, 'pendente', null, date '2026-04-30' union all
  -- Julgamento pela Câmara (2025 falta de propósito)
  select 'julgamento_camara', 2022, null, null, null, 'Decreto Legislativo', 10, 'aprovadas', 'Decreto Legislativo nº 3/2024', date '2024-10-08' union all
  select 'julgamento_camara', 2023, null, null, null, 'Decreto Legislativo', 10, 'aprovadas', 'Decreto Legislativo nº 2/2025', date '2025-09-16' union all
  select 'julgamento_camara', 2024, null, null, null, 'Aguardando julgamento', 10, 'pendente', null, date '2026-08-20'
)
insert into public.documentos_contas
  (orgao_id, tipo, exercicio, exercicio_fim, periodicidade, periodo, parte, ordem, resultado, numero_ato,
   data_publicacao, link_externo, descricao, situacao)
select o.id, d.tipo, d.exercicio, d.exercicio_fim, d.periodicidade, d.periodo, d.parte, d.ordem, d.resultado, d.numero_ato,
       d.data_publicacao,
       case when d.resultado = 'pendente' then null else 'https://www.diariomunicipal.com.br/femurn/?teste=1' end,
       case when d.resultado = 'pendente' then 'TESTE' end,
       'publicado'
from o, docs d;

-- Conferência: quantos documentos de teste existem, por tipo.
select tipo, count(*) as qtd from public.documentos_contas
where link_externo like '%teste=1%' or descricao = 'TESTE' group by tipo order by tipo;

-- Para APAGAR todos os dados de teste depois (tire os dois traços e rode):
-- delete from public.documentos_contas where link_externo like '%teste=1%' or descricao = 'TESTE';
