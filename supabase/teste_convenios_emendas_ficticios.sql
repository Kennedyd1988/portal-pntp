-- =====================================================================
-- PORTAL PNTP · SOFT+
-- DADOS FICTÍCIOS PARA TESTE — Convênios e emendas (Riacho da Cruz)
--
-- Não faz parte da instalação: serve só para ver como o painel e o site
-- ficam. Rodar no SQL Editor DEPOIS do script 19. Pode repetir: apaga e
-- insere de novo. Identificação: processo começando com "TESTE" (convênios)
-- e observação começando com "TESTE" (emendas). Limpeza no fim.
-- =====================================================================

delete from public.emendas
where orgao_id = (select id from public.orgaos where cnpj = '08.153.454/0001-04') and observacao like 'TESTE%';
delete from public.convenios
where orgao_id = (select id from public.orgaos where cnpj = '08.153.454/0001-04') and processo like 'TESTE%';

with o as (select id from public.orgaos where cnpj = '08.153.454/0001-04')
insert into public.convenios (orgao_id, tipo, instrumento, numero, processo, objeto, parte_nome, parte_doc, esfera, unidade_nome, programa,
  valor_previsto, valor_contrapartida, valor_repassado, repasse_atualizado_em, data_assinatura, vigencia_inicio, vigencia_fim, andamento, obrigacoes,
  link_externo, link_acompanhamento, situacao)
select o.id, v.tipo, v.inst, v.num, 'TESTE ' || v.num, v.obj, v.parte, v.doc, v.esf, v.uni, v.prog, v.prev, v.contra, v.rep, v.pos::date,
       v.ass::date, v.ass::date, v.fim::date, v.anda, v.obr, 'https://www.diariomunicipal.com.br/femurn/?teste=1',
       case when v.esf = 'federal' then 'https://www.gov.br/transferegov/?teste=1' end, 'publicado'
from o, (values
  ('recebida', 'convenio', '912345/2024', 'Aquisição de patrulha mecanizada (trator, grade e carreta) para a agricultura familiar', 'Ministério do Desenvolvimento Agrário', '00394544000185', 'federal', 'Secretaria de Agricultura', 'Fortalecimento da Agricultura Familiar', 450000.00, 9000.00, 450000.00, '2025-03-10', '2024-06-12', '2026-06-12', 'prestacao_contas', null::text),
  ('recebida', 'contrato_repasse', '934567/2025', 'Pavimentação em paralelepípedo de ruas do bairro Centro', 'Ministério das Cidades (Caixa)', '00394445000101', 'federal', 'Secretaria de Obras', 'Apoio à Política Nacional de Desenvolvimento Urbano', 980000.00, 20000.00, 392000.00, '2026-10-30', '2025-08-01', '2027-08-01', 'em_execucao', null),
  ('recebida', 'termo_compromisso', '015/2026', 'Construção de quadra poliesportiva coberta na Escola Municipal Maria de Lourdes', 'Governo do Estado do RN', '08241747000143', 'estadual', 'Secretaria de Educação', null, 620000.00, 0, 0, null, '2026-03-20', '2027-03-20', 'em_execucao', null),
  ('realizada', 'termo_fomento', '001/2026', 'Apoio às oficinas de música e artes para crianças e adolescentes', 'Associação Cultural Riachense', '11222333000181', 'privada', 'Secretaria de Assistência Social', null, 60000.00, null, 30000.00, '2026-09-30', '2026-02-01', '2026-12-31', 'em_execucao', 'Atender 80 crianças por mês; prestar contas a cada trimestre.'),
  ('realizada', 'termo_colaboracao', '002/2025', 'Manutenção do atendimento a pessoas com deficiência', 'APAE de Riacho da Cruz', '11444777000161', 'privada', 'Secretaria de Saúde', null, 48000.00, null, 48000.00, '2025-12-20', '2025-01-15', '2025-12-31', 'contas_aprovadas', null),
  ('sem_repasse', 'acordo_cooperacao', '003/2026', 'Cooperação técnica para estágio supervisionado de estudantes de enfermagem na rede municipal de saúde', 'Universidade Federal Rural do Semi-Árido (UFERSA)', '24529265000140', 'federal', 'Secretaria de Saúde', null, null, null, null, null, '2026-04-01', '2028-04-01', 'em_execucao', 'Município: ceder campo de estágio, sala e transporte. UFERSA: indicar professor supervisor, seguro dos estagiários e relatório semestral.')
) as v(tipo, inst, num, obj, parte, doc, esf, uni, prog, prev, contra, rep, pos, ass, fim, anda, obr);

with o as (select id from public.orgaos where cnpj = '08.153.454/0001-04')
insert into public.emendas (orgao_id, exercicio, origem, tipo, forma_repasse, numero, autor, objeto, funcao, beneficiario, unidade_nome,
  valor_previsto, valor_realizado, valor_empenhado, valor_liquidado, valor_pago, execucao_em, andamento, impedimento, convenio_id, observacao, link_externo, situacao)
select o.id, v.ex, v.ori, v.tipo, v.forma, v.num, v.aut, v.obj, v.fun, v.ben, v.uni, v.prev, v.real, v.emp, v.liq, v.pago, v.pos::date, v.anda, v.imp,
       (select c.id from public.convenios c where c.orgao_id = o.id and c.numero = v.conv), 'TESTE — emenda fictícia', 'https://www.gov.br/transferegov/?teste=1', 'publicado'
from o, (values
  (2024, 'federal', 'individual', 'convenio', '202440120003', 'Deputado Federal Fictício A', 'Patrulha mecanizada para a agricultura familiar', '20', null::text, 'Secretaria de Agricultura', 450000.00, 450000.00, 459000.00, 459000.00, 459000.00, '2025-03-10', 'concluida', null::text, '912345/2024'),
  (2025, 'federal', 'bancada', 'convenio', '202571230011', 'Bancada do Rio Grande do Norte', 'Pavimentação de ruas do bairro Centro', '15', null, 'Secretaria de Obras', 980000.00, 392000.00, 1000000.00, 410000.00, 400000.00, '2026-10-30', 'em_execucao', null, '934567/2025'),
  (2026, 'federal', 'individual', 'transferencia_especial', '202640150022', 'Senador Fictício B', 'Aquisição de ambulância para a atenção básica', '10', null, 'Secretaria de Saúde', 300000.00, 300000.00, 298500.00, 298500.00, 298500.00, '2026-09-15', 'concluida', null, null),
  (2026, 'federal', 'individual', 'fundo_a_fundo', '202640150023', 'Deputada Federal Fictícia C', 'Custeio da atenção primária à saúde', '10', null, 'Secretaria de Saúde', 200000.00, 200000.00, 150000.00, 120000.00, 120000.00, '2026-10-31', 'em_execucao', null, null),
  (2026, 'estadual', 'individual', 'finalidade_definida', '1234/2026', 'Deputado Estadual Fictício D', 'Quadra poliesportiva da Escola Maria de Lourdes', '27', null, 'Secretaria de Educação', 620000.00, 0, null, null, null, null, 'prevista', null, '015/2026'),
  (2025, 'estadual', 'individual', 'finalidade_definida', '0987/2025', 'Deputada Estadual Fictícia E', 'Aquisição de kits de irrigação', '20', null, 'Secretaria de Agricultura', 80000.00, 0, null, null, null, null, 'impedida', 'Impedimento técnico: plano de trabalho não aprovado no prazo.', null),
  (2026, 'municipal', 'individual', 'execucao_propria', 'EMI 03/2026', 'Vereador Fictício F', 'Reforma da praça do bairro Alto', '15', null, 'Secretaria de Obras', 40000.00, 35000.00, 35000.00, 35000.00, 20000.00, '2026-10-31', 'em_execucao', null, null),
  (2026, 'municipal', 'individual', 'convenio', 'EMI 07/2026', 'Vereadora Fictícia G', 'Oficinas de música para crianças', '08', 'Associação Cultural Riachense', 'Secretaria de Assistência Social', 30000.00, 30000.00, 30000.00, 15000.00, 15000.00, '2026-09-30', 'em_execucao', null, '001/2026')
) as v(ex, ori, tipo, forma, num, aut, obj, fun, ben, uni, prev, real, emp, liq, pago, pos, anda, imp, conv);

-- Limpeza (quando não precisar mais):
-- delete from public.emendas where observacao like 'TESTE%';
-- delete from public.convenios where processo like 'TESTE%';
