-- =====================================================================
-- PORTAL PNTP · SOFT+
-- DADOS FICTÍCIOS PARA TESTE — Receitas, despesas, ordem cronológica,
-- pessoal e diárias (Riacho da Cruz)
--
-- Não faz parte da instalação: serve só para ver como o painel e o site
-- ficam. Rodar no SQL Editor DEPOIS do script 22. Pode repetir: apaga e
-- insere de novo. Nomes, CPFs e valores são inventados.
-- Identificação dos dados de teste:
--   receitas: fonte começando com "TESTE"; despesas: processo "TESTE…";
--   ordem cronológica: documento fiscal "TESTE…"; pessoal e folha:
--   matrícula "T-…"; cargos e tabela de diárias: norma "TESTE…";
--   estagiários: instituição "TESTE…"; terceirizados: contrato "TESTE…";
--   dívida ativa: tributo terminando em "(teste)"; diárias: ato "TESTE…".
-- =====================================================================

do $$
declare
  o uuid := (select id from public.orgaos where cnpj = '08.153.454/0001-04');
begin
  if o is null then raise exception 'Órgão piloto (Riacho da Cruz) não encontrado: rode os scripts 01 a 04.'; end if;
  perform set_config('pntp.importando', '1', true);   -- sem uma linha de histórico por registro

  delete from public.receitas where orgao_id = o and fonte_descricao like 'TESTE%';
  delete from public.divida_ativa where orgao_id = o and tributo like '%(teste)';
  delete from public.ordem_cronologica where orgao_id = o and documento_fiscal like 'TESTE%';
  delete from public.despesas where orgao_id = o and processo like 'TESTE%';
  delete from public.pessoal_remuneracoes where orgao_id = o and matricula like 'T-%';
  delete from public.pessoal_vinculos where orgao_id = o and matricula like 'T-%';
  delete from public.pessoal_cargos where orgao_id = o and norma like 'TESTE%';
  delete from public.pessoal_estagiarios where orgao_id = o and instituicao like 'TESTE%';
  delete from public.pessoal_terceirizados where orgao_id = o and contrato_numero like 'TESTE%';
  delete from public.diarias where orgao_id = o and ato_concessao like 'TESTE%';
  delete from public.diarias_valores where orgao_id = o and norma like 'TESTE%';

  -- -------------------------------------------------------------------
  -- RECEITAS: descrição dos níveis intermediários (3.2) e lançamentos
  -- mensais de 2025 (ano todo) e 2026 (janeiro a outubro).
  -- -------------------------------------------------------------------
  insert into public.receitas_naturezas (orgao_id, codigo, descricao) values
    (o, '1.1.1.2', 'Impostos sobre o Patrimônio'), (o, '1.1.1.2.50', 'Imposto sobre a Propriedade Predial e Territorial Urbana'),
    (o, '1.1.1.3', 'Impostos sobre a Renda e Proventos de Qualquer Natureza'), (o, '1.1.1.3.03', 'Imposto de Renda Retido na Fonte'),
    (o, '1.1.1.4', 'Impostos sobre a Produção, Circulação de Mercadorias e Serviços'), (o, '1.1.1.4.51', 'Imposto sobre Serviços de Qualquer Natureza'),
    (o, '1.1.2.2', 'Taxas pela Prestação de Serviços'), (o, '1.1.2.2.50', 'Taxas pela Prestação de Serviços'),
    (o, '1.3.2', 'Valores Mobiliários'), (o, '1.3.2.1', 'Juros e Correções Monetárias'), (o, '1.3.2.1.00', 'Remuneração de Depósitos Bancários'),
    (o, '1.7.1.1', 'Transferências de Repartição da Receita da União'), (o, '1.7.1.1.51', 'Cota-Parte do Fundo de Participação dos Municípios'),
    (o, '1.7.1.1.52', 'Cota-Parte do Imposto sobre a Propriedade Territorial Rural'),
    (o, '1.7.1.4', 'Transferências de Recursos do Sistema Único de Saúde'), (o, '1.7.1.4.50', 'Transferências do SUS - Atenção Primária'),
    (o, '1.7.2.1', 'Participação na Receita dos Estados'), (o, '1.7.2.1.50', 'Cota-Parte do ICMS'), (o, '1.7.2.1.51', 'Cota-Parte do IPVA'),
    (o, '1.7.5.1', 'Transferências de Recursos do FUNDEB'), (o, '1.7.5.1.50', 'Transferências de Recursos do FUNDEB'),
    (o, '2.4.1', 'Transferências de Capital da União'), (o, '2.4.1.5', 'Transferências de Convênios da União'), (o, '2.4.1.5.00', 'Convênios da União para obras')
  on conflict (orgao_id, codigo) do update set descricao = excluded.descricao;

  insert into public.receitas (orgao_id, exercicio, mes, natureza_codigo, natureza_descricao, fonte_codigo, fonte_descricao, previsto_inicial, previsto_atualizado, arrecadado)
  select o, a.ano, m.mes, n.cod, n.descr, n.fonte, 'TESTE · ' || n.fonte_nome,
         round(n.anual * (case when a.ano = 2025 then 0.93 else 1 end), 2),
         round(n.anual * (case when a.ano = 2025 then 0.93 else 1 end) * (case when m.mes >= 7 then 1.04 else 1 end), 2),
         round(n.anual * (case when a.ano = 2025 then 0.93 else 1 end) / 12 * (1 + 0.12 * sin(m.mes * 1.7 + n.k))::numeric * n.sazonal[m.mes], 2)
  from (values (2025), (2026)) a(ano)
  cross join generate_series(1, 12) m(mes)
  cross join (values
    (1, '11125001', 'IPTU - Principal', '1500', 'Recursos não vinculados de impostos', 180000.00, array[0.3,2.5,2.2,1,0.8,0.7,0.6,0.6,0.7,0.8,0.9,0.9]::numeric[]),
    (2, '11145111', 'ISSQN - Principal', '1500', 'Recursos não vinculados de impostos', 420000.00, array[1,1,1,1,1,1,1,1,1,1,1,1]::numeric[]),
    (3, '11130311', 'IRRF sobre rendimentos do trabalho - Principal', '1500', 'Recursos não vinculados de impostos', 650000.00, array[1,1,1,1,1,1,1,1,1,1,1,1.4]::numeric[]),
    (4, '11225001', 'Taxa de limpeza pública - Principal', '1500', 'Recursos não vinculados de impostos', 36000.00, array[0.4,2.4,2,1,0.8,0.8,0.8,0.8,0.8,0.8,0.7,0.7]::numeric[]),
    (5, '13210011', 'Remuneração de depósitos bancários - Principal', '1500', 'Recursos não vinculados de impostos', 48000.00, array[1,1,1,1,1,1,1,1,1,1,1,1]::numeric[]),
    (6, '17115111', 'Cota-Parte do FPM - Cota mensal - Principal', '1500', 'Recursos não vinculados de impostos', 14800000.00, array[1.1,1.2,0.9,1,1.1,0.8,1.3,0.9,0.8,1,1.1,0.8]::numeric[]),
    (7, '17115201', 'Cota-Parte do ITR - Principal', '1500', 'Recursos não vinculados de impostos', 24000.00, array[0.2,0.2,0.2,0.2,0.2,0.2,0.2,0.2,0.2,0.2,4,6]::numeric[]),
    (8, '17145001', 'Piso da Atenção Primária - Principal', '1600', 'Transferências do SUS - Bloco de Manutenção', 3100000.00, array[1,1,1,1,1,1,1,1,1,1,1,1]::numeric[]),
    (9, '17215001', 'Cota-Parte do ICMS - Principal', '1500', 'Recursos não vinculados de impostos', 5200000.00, array[1,1,1,1,1,1,1,1,1,1,1,1.1]::numeric[]),
    (10, '17215101', 'Cota-Parte do IPVA - Principal', '1500', 'Recursos não vinculados de impostos', 310000.00, array[2,2,1.6,1,0.8,0.6,0.6,0.6,0.6,0.7,0.7,0.6]::numeric[]),
    (11, '17515001', 'Transferências do FUNDEB - Principal', '1540', 'FUNDEB - Impostos e transferências de impostos', 9800000.00, array[1,1,1,1,1,1,1,1,1,1,1,1.2]::numeric[]),
    (12, '24150011', 'Convênio MCidades - Pavimentação - Principal', '1700', 'Convênios com a União', 850000.00, array[0,0,0,0,3,0,0,4,0,0,0,5]::numeric[])
  ) n(k, cod, descr, fonte, fonte_nome, anual, sazonal)
  where a.ano = 2025 or m.mes <= 10;

  -- Dívida ativa (posição em 31/12/2025).
  insert into public.divida_ativa (orgao_id, exercicio, nome, documento, ano_inscricao, tributo, valor)
  select o, 2025, v.nome, v.doc, v.ano, v.trib || ' (teste)', v.valor from (values
    ('Maria das Dores Fernandes', '52601815906', 2021, 'IPTU', 1842.37), ('José Ribamar de Souza', '08301661305', 2019, 'IPTU', 3210.90),
    ('Comercial Oeste Potiguar Ltda', '10071271000191', 2022, 'ISS', 15480.12), ('Antônio Carlos Bezerra', '18609139034', 2023, 'Taxa de licença', 412.50),
    ('Francisca Lúcia Nogueira', '99603082430', 2024, 'IPTU', 987.66), ('Engenharia Oeste Ltda', '10079190000138', 2020, 'ISS', 22740.00),
    ('Raimundo Nonato da Silva', '62819482112', 2018, 'IPTU', 5120.33), ('Pedro Henrique Rocha', '99351819019', 2024, 'Multa de posturas', 650.00)
  ) v(nome, doc, ano, trib, valor);

  -- -------------------------------------------------------------------
  -- DESPESAS: empenhos de 2025 e 2026 com liquidações e pagamentos.
  -- -------------------------------------------------------------------
  insert into public.despesas (orgao_id, numero, data_empenho, tipo_empenho, unidade_codigo, unidade_nome, funcao_codigo, subfuncao_codigo, subfuncao_nome,
    programa_codigo, programa_nome, acao_codigo, acao_nome, natureza_codigo, natureza_nome, fonte_codigo, fonte_nome, credor_nome, credor_doc, objeto,
    modalidade, licitacao_numero, processo, valor_empenhado)
  select o, lpad(((g.n - 1) % 30 + 1)::text, 4, '0') || '/' || g.ano, make_date(g.ano, 1 + (g.n * 7) % (case when g.ano = 2026 then 10 else 12 end), 1 + (g.n * 11) % 27),
         case when c.tipo = 'pessoal' then 'estimativo' when g.n % 5 = 0 then 'global' else 'ordinario' end,
         c.uc, c.un, c.fu, c.sf, c.sfn, c.pr, c.prn, c.ac, c.acn, c.nat, c.natn, c.fo, c.fon, c.cred, c.doc, c.obj || ' (' || g.ano || ')',
         c.mod, case when c.mod in ('nao_se_aplica') then null else c.lic || '/' || g.ano end, 'TESTE ' || lpad(g.n::text, 3, '0') || '/' || g.ano,
         round(c.valor * (1 + (g.n % 7) * 0.05), 2)
  from (select ano, n from (values (2025), (2026)) a(ano), generate_series(1, 30) n where not (ano = 2025 and n > 18)) g
  join (values
    (0, 'pessoal', '02.01', 'Gabinete do Prefeito', '04', '122', 'Administração Geral', '0001', 'Gestão Administrativa', '2001', 'Manutenção do Gabinete do Prefeito', '3.1.90.11', 'Vencimentos e Vantagens Fixas - Pessoal Civil', '1500', 'Recursos não vinculados de impostos', 'Folha de pagamento do Gabinete', null::text, 'Folha de pagamento dos servidores do Gabinete', 'nao_se_aplica', null::text, 98000.00),
    (1, 'compra', '02.05', 'Secretaria Municipal de Educação', '12', '361', 'Ensino Fundamental', '0010', 'Educação de Qualidade', '2010', 'Manutenção do Ensino Fundamental', '3.3.90.30', 'Material de Consumo', '1540', 'FUNDEB - Impostos e transferências de impostos', 'Comercial Oeste Potiguar Ltda', '10071271000191', 'Aquisição de material de expediente e limpeza para as escolas', 'pregao_eletronico', '012', 38500.00),
    (2, 'servico', '02.06', 'Secretaria Municipal de Saúde', '10', '301', 'Atenção Básica', '0020', 'Saúde para Todos', '2020', 'Manutenção da Atenção Primária', '3.3.90.39', 'Outros Serviços de Terceiros - Pessoa Jurídica', '1600', 'Transferências do SUS - Bloco de Manutenção', 'Clínica Imagem Oeste Ltda', '10079190000138', 'Prestação de serviços de exames de imagem', 'credenciamento', '002', 24800.00),
    (3, 'obra', '02.08', 'Secretaria Municipal de Obras', '15', '451', 'Infraestrutura Urbana', '0030', 'Cidade Melhor', '1030', 'Pavimentação de Vias Urbanas', '4.4.90.51', 'Obras e Instalações', '1700', 'Convênios com a União', 'Construtora Potiguar Ltda', '10071271000191', 'Pavimentação em paralelepípedo de ruas do Centro', 'concorrencia_eletronica', '001', 210000.00),
    (4, 'servico', '02.01', 'Gabinete do Prefeito', '04', '122', 'Administração Geral', '0001', 'Gestão Administrativa', '2001', 'Manutenção do Gabinete do Prefeito', '3.3.90.36', 'Outros Serviços de Terceiros - Pessoa Física', '1500', 'Recursos não vinculados de impostos', 'Antônio Carlos Bezerra', '18609139034', 'Locação de imóvel para o arquivo municipal', 'dispensa', '015', 1800.00),
    (5, 'compra', '02.06', 'Secretaria Municipal de Saúde', '10', '303', 'Suporte Profilático e Terapêutico', '0020', 'Saúde para Todos', '2021', 'Assistência Farmacêutica Básica', '3.3.90.30', 'Material de Consumo', '1600', 'Transferências do SUS - Bloco de Manutenção', 'Distribuidora de Medicamentos Mossoró Ltda', '10079190000138', 'Aquisição de medicamentos da farmácia básica', 'pregao_eletronico', '008', 45200.00),
    (6, 'diaria', '02.05', 'Secretaria Municipal de Educação', '12', '122', 'Administração Geral', '0010', 'Educação de Qualidade', '2011', 'Manutenção da Secretaria de Educação', '3.3.90.14', 'Diárias - Pessoal Civil', '1500', 'Recursos não vinculados de impostos', 'Francisca Lúcia Nogueira', '99603082430', 'Diárias para participação em capacitação em Natal/RN', 'nao_se_aplica', null, 900.00)
  ) c(k, tipo, uc, un, fu, sf, sfn, pr, prn, ac, acn, nat, natn, fo, fon, cred, doc, obj, mod, lic, valor) on c.k = g.n % 7;

  -- Movimentos: liquidação 10 dias depois; pagamento 8 dias depois da liquidação (os mais recentes ainda a pagar).
  insert into public.despesas_movimentos (despesa_id, orgao_id, tipo, data, valor, documento)
  select d.id, o, 'liquidacao', d.data_empenho + 10, round(d.valor_empenhado * case when d.tipo_empenho = 'global' then 0.5 else 1 end, 2), 'NF ' || (1000 + row_number() over ())
  from public.despesas d where d.orgao_id = o and d.processo like 'TESTE%' and d.data_empenho + 10 <= current_date;
  insert into public.despesas_movimentos (despesa_id, orgao_id, tipo, data, valor, documento)
  select m.despesa_id, o, 'pagamento', m.data + 8, m.valor, 'OP ' || (5000 + row_number() over ())
  from public.despesas_movimentos m join public.despesas d on d.id = m.despesa_id
  where d.orgao_id = o and d.processo like 'TESTE%' and m.tipo = 'liquidacao' and m.data + 8 <= current_date - 12;
  -- Um reforço e uma anulação para aparecerem no detalhe.
  insert into public.despesas_movimentos (despesa_id, orgao_id, tipo, data, valor, observacao)
  select d.id, o, case when row_number() over (order by d.data_empenho) = 1 then 'reforco' else 'anulacao' end, d.data_empenho + 3, 500.00, 'Ajuste do valor (teste)'
  from (select * from public.despesas where orgao_id = o and processo like 'TESTE%' and tipo_empenho = 'global' and exercicio = 2026 order by data_empenho limit 2) d;

  -- -------------------------------------------------------------------
  -- ORDEM CRONOLÓGICA (9.4): uma linha por liquidação de fornecedor.
  -- -------------------------------------------------------------------
  insert into public.ordem_cronologica (orgao_id, categoria, fonte_codigo, fonte_nome, credor_nome, credor_doc, documento_fiscal, empenho_numero, despesa_id,
    objeto, data_exigibilidade, data_pagamento, valor)
  select o, case when d.natureza_codigo like '4.4.90.51%' then 'obras' when d.natureza_codigo like '3.3.90.30%' then 'bens'
                 when d.objeto like 'Locação%' then 'locacoes' else 'servicos' end,
         d.fonte_codigo, d.fonte_nome, d.credor_nome, d.credor_doc, 'TESTE ' || m.documento, d.numero, d.id, d.objeto, m.data,
         (select p.data from public.despesas_movimentos p where p.despesa_id = d.id and p.tipo = 'pagamento' order by p.data limit 1), m.valor
  from public.despesas d join public.despesas_movimentos m on m.despesa_id = d.id and m.tipo = 'liquidacao'
  where d.orgao_id = o and d.processo like 'TESTE%' and d.modalidade <> 'nao_se_aplica';
  -- Um pagamento fora da ordem, com a justificativa (art. 141, § 1º).
  update public.ordem_cronologica set fora_da_ordem = true, motivo_alteracao = 'emergencia',
         justificativa = 'Pagamento antecipado para evitar a interrupção do fornecimento de medicamentos da farmácia básica (risco à saúde da população).',
         ato_justificativa = 'Despacho do Secretário de Finanças nº 12/2026 (teste)'
   where id = (select id from public.ordem_cronologica where orgao_id = o and documento_fiscal like 'TESTE%' and exercicio = 2026 and categoria = 'bens'
               and data_pagamento is not null order by data_exigibilidade desc limit 1);

  -- -------------------------------------------------------------------
  -- PESSOAL (6.1 a 6.5)
  -- -------------------------------------------------------------------
  insert into public.pessoal_cargos (orgao_id, cargo, tipo, referencia, carga_horaria, vencimento, norma, vigencia_inicio, ordem) values
    (o, 'Prefeito', 'eletivo', null, null, 15000.00, 'TESTE · Lei nº 820/2024 (subsídios 2025-2028)', '2025-01-01', 1),
    (o, 'Vice-prefeito', 'eletivo', null, null, 7500.00, 'TESTE · Lei nº 820/2024 (subsídios 2025-2028)', '2025-01-01', 2),
    (o, 'Secretário municipal', 'comissao', 'CC-1', '40 horas', 6000.00, 'TESTE · Lei nº 801/2023 (estrutura administrativa)', '2025-01-01', 3),
    (o, 'Diretor de departamento', 'comissao', 'CC-2', '40 horas', 3200.00, 'TESTE · Lei nº 801/2023 (estrutura administrativa)', '2025-01-01', 4),
    (o, 'Professor', 'efetivo', 'Nível I, classe A', '30 horas', 3580.78, 'TESTE · Lei nº 790/2022 (Plano de Carreira do Magistério)', '2026-01-01', 10),
    (o, 'Professor', 'efetivo', 'Nível II, classe A', '30 horas', 4296.94, 'TESTE · Lei nº 790/2022 (Plano de Carreira do Magistério)', '2026-01-01', 11),
    (o, 'Enfermeiro', 'efetivo', 'Padrão I', '40 horas', 3800.00, 'TESTE · Lei nº 700/2018 (Plano de Cargos e Salários)', '2026-01-01', 12),
    (o, 'Técnico de enfermagem', 'efetivo', 'Padrão I', '40 horas', 1700.00, 'TESTE · Lei nº 700/2018 (Plano de Cargos e Salários)', '2026-01-01', 13),
    (o, 'Agente administrativo', 'efetivo', 'Padrão I', '40 horas', 1518.00, 'TESTE · Lei nº 700/2018 (Plano de Cargos e Salários)', '2026-01-01', 14),
    (o, 'Auxiliar de serviços gerais', 'efetivo', 'Padrão I', '40 horas', 1518.00, 'TESTE · Lei nº 700/2018 (Plano de Cargos e Salários)', '2026-01-01', 15),
    (o, 'Gratificação de coordenação', 'funcao_gratificada', 'FG-1', null, 800.00, 'TESTE · Lei nº 801/2023 (estrutura administrativa)', '2025-01-01', 20);

  insert into public.pessoal_vinculos (orgao_id, matricula, nome, documento, cargo, funcao, vinculo, lotacao, carga_horaria, data_admissao, data_desligamento, motivo_desligamento)
  select o, 'T-' || lpad(n::text, 4, '0'),
         (array['Ana','Antônio','Francisca','José','Maria','Raimundo','Joana','Pedro','Luzia','Francisco','Josefa','Manoel','Rita','Sebastião','Tereza'])[1 + n % 15] || ' ' ||
         (array['da Silva','Fernandes','Nogueira','Bezerra','Rocha','de Souza','Pereira','Medeiros','Dantas','Queiroz'])[1 + (n * 3) % 10] || ' ' ||
         (array['Lima','Costa','Oliveira','Freitas','Barbosa','Carvalho','Moura'])[1 + (n * 5) % 7],
         (array['52601815906','08301661305','18609139034','99603082430','62819482112','99351819019','93786579741','54323194897','75749118606','25276018987',
                '55597971115','47104974601','50752917080','34236671255','76842684650','56321223360','07924402691','85995289047','78666617667','03137215994',
                '01092815945','01396245979','57117777427','12154728030','38528084132','48525388831','53933633893','75004743932','57551313761','35379907580'])[n],
         c.cargo, c.funcao, c.vinc, c.lot, c.ch, make_date(c.ano_adm - (n % 6), 1 + n % 12, 1 + n % 25),
         case when n in (7, 19) then date '2026-03-31' end, case when n = 7 then 'exoneracao' when n = 19 then 'aposentadoria' end
  from generate_series(1, 30) n
  join (values
    (0, 'Professor', null, 'efetivo', 'Secretaria Municipal de Educação', '30 horas', 2015),
    (1, 'Professor', null, 'efetivo', 'Escola Municipal Maria das Graças', '30 horas', 2012),
    (2, 'Enfermeiro', null, 'efetivo', 'Secretaria Municipal de Saúde', '40 horas', 2016),
    (3, 'Técnico de enfermagem', null, 'efetivo', 'UBS Sítio Lagoa', '40 horas', 2018),
    (4, 'Agente administrativo', null, 'efetivo', 'Secretaria Municipal de Administração', '40 horas', 2014),
    (5, 'Auxiliar de serviços gerais', null, 'efetivo', 'Secretaria Municipal de Obras', '40 horas', 2010),
    (6, 'Diretor de departamento', 'Diretor de Compras', 'comissionado', 'Secretaria Municipal de Administração', '40 horas', 2025),
    (7, 'Técnico de enfermagem', null, 'temporario', 'UBS Centro', '40 horas', 2026),
    (8, 'Agente administrativo', 'Coordenador do Cadastro Único', 'efetivo', 'Secretaria Municipal de Assistência Social', '40 horas', 2013),
    (9, 'Professor', null, 'efetivo', 'Escola Municipal São José', '30 horas', 2011)
  ) c(k, cargo, funcao, vinc, lot, ch, ano_adm) on c.k = n % 10;

  -- Autoridades (secretários e agentes políticos).
  insert into public.pessoal_vinculos (orgao_id, matricula, nome, documento, cargo, funcao, vinculo, lotacao, carga_horaria, data_admissao) values
    (o, 'T-9001', 'Ricardo Alves de Medeiros', '11637265166', 'Prefeito', null, 'eletivo', 'Gabinete do Prefeito', null, '2025-01-01'),
    (o, 'T-9002', 'Luciana Freitas Dantas', '67612220288', 'Vice-prefeito', null, 'eletivo', 'Gabinete do Prefeito', null, '2025-01-01'),
    (o, 'T-9003', 'Marcos Queiroz Lima', '97299752808', 'Secretário municipal', 'Secretário de Finanças', 'comissionado', 'Secretaria Municipal de Finanças', '40 horas', '2025-01-02'),
    (o, 'T-9004', 'Patrícia Moura Costa', '82001826303', 'Secretário municipal', 'Secretária de Educação', 'comissionado', 'Secretaria Municipal de Educação', '40 horas', '2025-01-02');

  -- Folha mensal de 2026 (janeiro a outubro) de quem estava no quadro em cada mês.
  insert into public.pessoal_remuneracoes (orgao_id, exercicio, mes, folha, matricula, nome, cargo, vinculo, lotacao, remuneracao_basica, vantagens, eventuais,
    indenizacoes, bruto, descontos, liquido)
  select o, 2026, m, 'mensal', v.matricula, v.nome, v.cargo, v.vinculo, v.lotacao, x.basica, x.vant, x.event, x.inden,
         x.basica + x.vant + x.event + x.inden, round((x.basica + x.vant + x.event) * 0.19, 2),
         x.basica + x.vant + x.event + x.inden - round((x.basica + x.vant + x.event) * 0.19, 2)
  from public.pessoal_vinculos v
  cross join generate_series(1, 10) m
  cross join lateral (select coalesce((select c.vencimento from public.pessoal_cargos c where c.orgao_id = o and c.cargo = v.cargo order by c.vencimento limit 1), 1518.00) as basica,
                             case when v.vinculo = 'efetivo' then round(150 + (length(v.nome) % 7) * 45.5, 2) else 0 end as vant,
                             case when m = 7 and v.vinculo = 'efetivo' then 1200.00 else 0 end as event,
                             case when v.lotacao like 'UBS%' or v.lotacao like 'Escola%' then 180.00 else 0 end as inden) x
  where v.orgao_id = o and v.matricula like 'T-%'
    and v.data_admissao <= make_date(2026, m, 1) + interval '1 month' - interval '1 day'
    and (v.data_desligamento is null or v.data_desligamento >= make_date(2026, m, 1));

  insert into public.pessoal_estagiarios (orgao_id, nome, instituicao, curso, nivel, lotacao, carga_horaria, bolsa, data_inicio, data_fim, data_desligamento) values
    (o, 'Gabriel Nogueira Pereira', 'TESTE · UERN - Campus Pau dos Ferros', 'Administração', 'superior', 'Secretaria Municipal de Administração', '20 horas', 700.00, '2026-02-01', '2027-01-31', null),
    (o, 'Larissa Bezerra Rocha', 'TESTE · IFRN - Campus Pau dos Ferros', 'Técnico em Informática', 'tecnico', 'Secretaria Municipal de Educação', '20 horas', 600.00, '2025-08-01', '2026-07-31', null),
    (o, 'Thiago Medeiros Lima', 'TESTE · UFERSA - Campus Pau dos Ferros', 'Engenharia Civil', 'superior', 'Secretaria Municipal de Obras', '30 horas', 900.00, '2026-03-01', '2027-02-28', '2026-09-30');

  insert into public.pessoal_terceirizados (orgao_id, exercicio, nome, documento, funcao, empresa, empresa_cnpj, contrato_numero, lotacao, data_inicio, data_fim)
  select o, 2026, v.nome, v.doc, v.funcao, 'Serviços Gerais Oeste Ltda', '10079190000138', 'TESTE 015/2026', v.lot, '2026-03-01', '2027-02-28' from (values
    ('Cícero Rodrigues da Silva', '30434839523', 'Vigilante', 'Prefeitura (sede)'), ('Maria José Fernandes', '48620579851', 'Auxiliar de limpeza', 'UBS Centro'),
    ('Francisco das Chagas Lima', '68282880760', 'Motorista', 'Secretaria Municipal de Saúde'), ('Joana Darc Pereira', '29022279146', 'Recepcionista', 'Secretaria Municipal de Saúde'),
    ('José Wilson Barbosa', '80588871885', 'Vigilante', 'Escola Municipal Maria das Graças')) v(nome, doc, funcao, lot);

  -- -------------------------------------------------------------------
  -- DIÁRIAS (7.1 e 7.2)
  -- -------------------------------------------------------------------
  insert into public.diarias_valores (orgao_id, grupo, abrangencia, destino_descricao, valor, norma, vigencia_inicio, ordem) values
    (o, 'Prefeito e vice-prefeito', 'estado', 'Municípios do Rio Grande do Norte', 350.00, 'TESTE · Decreto nº 15/2025', '2025-02-01', 1),
    (o, 'Prefeito e vice-prefeito', 'fora_estado', 'Outros estados e Distrito Federal', 600.00, 'TESTE · Decreto nº 15/2025', '2025-02-01', 2),
    (o, 'Secretários municipais', 'estado', 'Municípios do Rio Grande do Norte', 250.00, 'TESTE · Decreto nº 15/2025', '2025-02-01', 3),
    (o, 'Secretários municipais', 'fora_estado', 'Outros estados e Distrito Federal', 450.00, 'TESTE · Decreto nº 15/2025', '2025-02-01', 4),
    (o, 'Demais servidores', 'estado', 'Municípios do Rio Grande do Norte', 150.00, 'TESTE · Decreto nº 15/2025', '2025-02-01', 5),
    (o, 'Demais servidores', 'fora_estado', 'Outros estados e Distrito Federal', 300.00, 'TESTE · Decreto nº 15/2025', '2025-02-01', 6);

  insert into public.diarias (orgao_id, nome, documento, cargo, unidade, destino, abrangencia, motivo, data_inicio, data_fim, quantidade, valor_unitario, valor_total,
    data_pagamento, empenho_numero, ato_concessao)
  select o, v.nome, v.doc, v.cargo, v.unid, v.dest, v.abr, v.mot, v.ini, v.ini + (v.qtd::int), v.qtd, v.vu, v.qtd * v.vu, v.ini - 2, v.emp, 'TESTE · Portaria nº ' || v.port
  from (values
    ('Ricardo Alves de Medeiros', '11637265166', 'Prefeito', 'Gabinete do Prefeito', 'Natal/RN', 'estado', 'Audiência na FEMURN sobre o FPM', date '2026-10-20', 1.5, 350.00, '0120/2026', '210/2026'),
    ('Ricardo Alves de Medeiros', '11637265166', 'Prefeito', 'Gabinete do Prefeito', 'Brasília/DF', 'fora_estado', 'Marcha dos Prefeitos e audiências em ministérios', date '2026-05-18', 3.5, 600.00, '0081/2026', '098/2026'),
    ('Marcos Queiroz Lima', '97299752808', 'Secretário municipal', 'Secretaria Municipal de Finanças', 'Natal/RN', 'estado', 'Treinamento do SIAI no TCE-RN', date '2026-08-11', 2.5, 250.00, '0102/2026', '177/2026'),
    ('Patrícia Moura Costa', '82001826303', 'Secretário municipal', 'Secretaria Municipal de Educação', 'Mossoró/RN', 'estado', 'Reunião da UNDIME regional', date '2026-04-08', 1.0, 250.00, '0060/2026', '071/2026'),
    ('Francisca Lúcia Nogueira', '99603082430', 'Professor', 'Secretaria Municipal de Educação', 'Natal/RN', 'estado', 'Capacitação do programa Alfabetiza RN', date '2026-09-22', 3.0, 150.00, '0110/2026', '190/2026'),
    ('José Ribamar de Souza', '08301661305', 'Motorista', 'Secretaria Municipal de Saúde', 'Natal/RN', 'estado', 'Transporte de pacientes para tratamento fora do domicílio', date '2026-10-27', 1.0, 150.00, '0121/2026', '214/2026'),
    ('Ricardo Alves de Medeiros', '11637265166', 'Prefeito', 'Gabinete do Prefeito', 'Natal/RN', 'estado', 'Assinatura de convênio com o Governo do Estado', date '2025-11-05', 1.0, 350.00, '0140/2025', '230/2025'),
    ('Marcos Queiroz Lima', '97299752808', 'Secretário municipal', 'Secretaria Municipal de Finanças', 'Recife/PE', 'fora_estado', 'Congresso de gestão fiscal municipal', date '2025-09-15', 2.5, 450.00, '0118/2025', '188/2025')
  ) v(nome, doc, cargo, unid, dest, abr, mot, ini, qtd, vu, emp, port);

  perform set_config('pntp.importando', '', true);
end;
$$;

-- Diárias: o órgão não paga diárias internacionais (o site mostra junto da tabela).
insert into public.secoes_setoriais (orgao_id, secao, texto)
select id, 'diarias_tabela', 'Valores fixados pelo Decreto nº 15/2025 (teste). Não há previsão de diárias para viagens ao exterior.'
from public.orgaos where cnpj = '08.153.454/0001-04'
on conflict (orgao_id, secao) do update set texto = excluded.texto;

select 'receitas' as tabela, count(*) from public.receitas where fonte_descricao like 'TESTE%'
union all select 'despesas', count(*) from public.despesas where processo like 'TESTE%'
union all select 'movimentos', count(*) from public.despesas_movimentos m join public.despesas d on d.id = m.despesa_id where d.processo like 'TESTE%'
union all select 'ordem_cronologica', count(*) from public.ordem_cronologica where documento_fiscal like 'TESTE%'
union all select 'servidores', count(*) from public.pessoal_vinculos where matricula like 'T-%'
union all select 'folha', count(*) from public.pessoal_remuneracoes where matricula like 'T-%'
union all select 'diarias', count(*) from public.diarias where ato_concessao like 'TESTE%';
