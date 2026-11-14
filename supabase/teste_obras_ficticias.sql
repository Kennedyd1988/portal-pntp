-- =====================================================================
-- PORTAL PNTP · SOFT+
-- DADOS FICTÍCIOS PARA TESTE — Obras (Riacho da Cruz)
--
-- Não faz parte da instalação: serve só para ver como o painel e o site
-- ficam. Rodar no SQL Editor DEPOIS do script 18. Pode repetir: apaga e
-- insere de novo. Liga a obra de pavimentação ao contrato de teste da
-- concorrência 001/2026, se o teste de contratos já tiver sido rodado.
-- Identificação dos dados de teste: fonte do recurso começando com "TESTE".
-- =====================================================================

-- Script 26: registros ligados não saem junto; planilha, medições e paralisações saem antes.
delete from public.obras_itens where obra_id in (select id from public.obras where fonte_recurso like 'TESTE%');
delete from public.obras_medicoes where obra_id in (select id from public.obras where fonte_recurso like 'TESTE%');
delete from public.obras_paralisacoes where obra_id in (select id from public.obras where fonte_recurso like 'TESTE%');
delete from public.obras
where orgao_id = (select id from public.orgaos where cnpj = '08.153.454/0001-04') and fonte_recurso like 'TESTE%';

-- 1. Obras (todas criadas "em andamento"; a paralisada passa a paralisada no passo 4).
with o as (select id from public.orgaos where cnpj = '08.153.454/0001-04')
insert into public.obras (orgao_id, contrato_id, titulo, descricao, local, unidade_nome, contratada_nome, contratada_doc, fonte_recurso,
  valor_contratado, situacao_obra, percentual, etapa_atual, data_inicio, previsao_conclusao, data_conclusao, situacao)
select o.id,
       case when v.k = 1 then (select c.id from public.contratos c join public.licitacoes l on l.id = c.licitacao_id
                               where c.orgao_id = o.id and c.processo like 'TESTE%' and l.modalidade = 'concorrencia_eletronica' and l.numero = '001/2026' limit 1) end,
       v.titulo, v.descricao, v.local, v.unidade, v.empresa, v.doc, v.fonte, v.valor, v.sit, v.perc, v.etapa, v.ini, v.prev, v.conc, 'publicado'
from o, (values
  (1, 'Pavimentação em paralelepípedo de ruas do bairro Centro', 'Pavimentação de 3.200 m² nas ruas São José, Padre Cícero e Sete de Setembro, com meio-fio e drenagem.',
      'Bairro Centro', 'Secretaria Municipal de Obras', 'Construtora Potiguar Ltda', '10071271000118', 'TESTE · Convênio MCidades 945123/2025 + recursos próprios',
      1198650.32, 'em_andamento', 46.30, 'Assentamento do calçamento (2ª etapa de 3)', date '2026-06-01', date '2027-02-28', null::date),
  (2, 'Construção de quadra poliesportiva coberta na Escola Municipal Maria das Graças', 'Quadra de 600 m² com cobertura metálica, arquibancada e vestiários.',
      'Sítio Barra', 'Secretaria Municipal de Educação', 'Engenharia Oeste Ltda', '10079190000119', 'TESTE · FNDE/PAR 2025',
      874500.00, 'em_andamento', 22.00, 'Estrutura metálica da cobertura', date '2026-02-15', date '2026-12-15', null),
  (3, 'Reforma da Unidade Básica de Saúde do Sítio Lagoa', 'Troca de piso, cobertura, instalações elétricas e hidráulicas.',
      'Sítio Lagoa', 'Secretaria Municipal de Saúde', 'Reforma Já Construções ME', '10087109000110', 'TESTE · Emenda parlamentar 2025',
      186300.00, 'concluida', 100, 'Concluída e entregue', date '2025-09-01', date '2026-01-30', date '2026-02-20'),
  (4, 'Construção de passagem molhada na comunidade Sítio Barra', 'Passagem molhada em concreto armado com 42 m.',
      'Sítio Barra', 'Secretaria Municipal de Obras', 'Construtora Vale Ltda', '10095028000111', 'TESTE · Recursos próprios',
      296400.00, 'concluida', 100, null, date '2022-07-01', date '2022-11-30', date '2022-12-16')
) v(k, titulo, descricao, local, unidade, empresa, doc, fonte, valor, sit, perc, etapa, ini, prev, conc);

-- 2. Planilha (contratado × executado) das obras 1 e 2.
insert into public.obras_itens (obra_id, orgao_id, ordem, codigo, descricao, unidade, quantidade, preco_unitario, quantidade_executada, preco_praticado)
select ob.id, ob.orgao_id, v.ordem, v.codigo, v.descricao, v.un, v.qtd, v.preco, v.exec, v.praticado
from public.obras ob
join (values
  ('Pavimentação%', 10, '1.1', 'Serviços preliminares: placa da obra em chapa galvanizada', 'm²', 6.00, 395.40, 6.00, null::numeric),
  ('Pavimentação%', 20, '2.1', 'Regularização e compactação do subleito', 'm²', 3200.00, 4.85, 3200.00, null),
  ('Pavimentação%', 30, '2.2', 'Pavimentação em paralelepípedo sobre colchão de areia', 'm²', 3200.00, 182.30, 1280.00, null),
  ('Pavimentação%', 40, '3.1', 'Meio-fio de pedra granítica rejuntado', 'm', 1450.00, 48.60, 900.00, null),
  ('Pavimentação%', 50, '4.1', 'Sarjeta em concreto, 30 cm', 'm', 1450.00, 39.90, 450.00, 41.20),
  ('Pavimentação%', 60, '5.1', 'Boca de lobo em alvenaria com grelha', 'un', 12.00, 1850.00, 4.00, null),
  ('Construção de quadra%', 10, '1.1', 'Fundação em concreto armado (sapatas e vigas baldrame)', 'm³', 62.00, 2150.00, 62.00, null),
  ('Construção de quadra%', 20, '2.1', 'Estrutura metálica da cobertura', 'kg', 18500.00, 18.40, 4200.00, null),
  ('Construção de quadra%', 30, '3.1', 'Piso de concreto polido com pintura de demarcação', 'm²', 600.00, 165.00, 0, null),
  ('Construção de quadra%', 40, '4.1', 'Vestiários (alvenaria, revestimento e louças)', 'vb', 1.00, 148000.00, 0, null)
) v(titulo, ordem, codigo, descricao, un, qtd, preco, exec, praticado) on ob.titulo like v.titulo
where ob.fonte_recurso like 'TESTE%';

-- 3. Medições (etapas) e pagamentos.
insert into public.obras_medicoes (obra_id, orgao_id, numero, descricao, periodo_inicio, periodo_fim, valor_medido, valor_pago, data_pagamento, percentual_acumulado, link_externo)
select ob.id, ob.orgao_id, v.n, v.descricao, v.ini, v.fim, v.medido, v.pago, v.dpag, v.perc, 'https://www.diariomunicipal.com.br/femurn/?teste=1'
from public.obras ob
join (values
  ('Pavimentação%', 1, 'Serviços preliminares e regularização do subleito', date '2026-06-01', date '2026-06-30', 17891.40, 17891.40, date '2026-07-15', 1.50),
  ('Pavimentação%', 2, 'Calçamento e meio-fio: Rua São José', date '2026-07-01', date '2026-08-31', 277004.00, 277004.00, date '2026-09-18', 24.60),
  ('Pavimentação%', 3, 'Calçamento e meio-fio: Rua Padre Cícero (parcial)', date '2026-09-01', date '2026-10-31', 259740.20, null, null, 46.30),
  ('Construção de quadra%', 1, 'Fundações', date '2026-02-15', date '2026-04-30', 133300.00, 133300.00, date '2026-05-20', 15.20),
  ('Construção de quadra%', 2, 'Estrutura metálica (parcial)', date '2026-05-01', date '2026-06-30', 77280.00, 77280.00, date '2026-07-22', 22.00),
  ('Reforma da Unidade%', 1, 'Medição única (obra concluída)', date '2025-09-01', date '2026-02-20', 186300.00, 186300.00, date '2026-03-10', 100.00)
) v(titulo, n, descricao, ini, fim, medido, pago, dpag, perc) on ob.titulo like v.titulo
where ob.fonte_recurso like 'TESTE%';

-- 4. Paralisações: a quadra está paralisada (aberta); a pavimentação teve uma já encerrada.
insert into public.obras_paralisacoes (obra_id, orgao_id, inicio, reinicio, motivo, responsavel, previsao_reinicio, ato)
select ob.id, ob.orgao_id, v.ini, v.reinicio, v.motivo, v.resp, v.prev, v.ato
from public.obras ob
join (values
  ('Construção de quadra%', date '2026-07-10', null::date, 'Atraso no repasse da 2ª parcela do FNDE; contratada sem cobertura financeira para a cobertura metálica.',
     'Prefeitura Municipal (aguardando repasse do FNDE)', date '2026-12-01', 'Ordem de paralisação nº 02/2026'),
  ('Pavimentação%', date '2026-08-05', date '2026-08-19', 'Chuvas intensas impediram a execução do calçamento.', 'Ninguém (caso fortuito: chuvas)', date '2026-08-20', 'Ordem de paralisação nº 01/2026')
) v(titulo, ini, reinicio, motivo, resp, prev, ato) on ob.titulo like v.titulo
where ob.fonte_recurso like 'TESTE%';

select ob.titulo, ob.situacao_obra, ob.percentual, r.itens, r.total_planilha, r.total_executado, r.total_pago
from public.obras ob join public.obras_resumo r on r.obra_id = ob.id
where ob.fonte_recurso like 'TESTE%' order by ob.data_inicio desc;

-- Para APAGAR (tire os dois traços e rode; planilha, medições e paralisações vão junto):
-- delete from public.obras where fonte_recurso like 'TESTE%';
