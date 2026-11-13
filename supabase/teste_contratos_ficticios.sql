-- =====================================================================
-- PORTAL PNTP · SOFT+
-- DADOS FICTÍCIOS PARA TESTE — Contratos (Riacho da Cruz)
--
-- Rodar DEPOIS do script 15 e do teste de licitações (os contratos se
-- ligam às licitações de teste homologadas). Pode repetir: apaga e insere.
-- Identificação dos dados de teste: processo começando com "TESTE".
-- =====================================================================
delete from public.contratos
where orgao_id = (select id from public.orgaos where cnpj = '08.153.454/0001-04') and processo like 'TESTE%';

with o as (select id from public.orgaos where cnpj = '08.153.454/0001-04'),
-- Um contrato para cada licitação de teste homologada/encerrada.
base as (
  select l.id as lic, l.orgao_id, l.ano, l.objeto, l.modalidade, l.valor_homologado, l.data_publicacao,
         row_number() over (order by l.data_publicacao) as n,
         coalesce(nullif(split_part(l.vencedores, ' – ', 1), ''), 'Empresa Contratada Ltda') as contratado
  from public.licitacoes l join o on o.id = l.orgao_id
  where l.processo like 'TESTE%' and l.andamento in ('homologada', 'encerrada')
),
ins as (
  insert into public.contratos (orgao_id, licitacao_id, tipo, numero, ano, processo, objeto, contratado_nome, contratado_doc,
    valor_inicial, data_assinatura, vigencia_inicio, vigencia_fim, link_externo, situacao)
  select b.orgao_id, b.lic, case when b.modalidade = 'adesao_ata' then 'ata_registro_precos' else 'contrato' end,
         lpad(b.n::text, 3, '0') || '/' || b.ano, b.ano, 'TESTE C' || lpad(b.n::text, 3, '0'), b.objeto, b.contratado,
         lpad((10000000 + b.n * 7919)::text, 8, '0') || '0001' || lpad((b.n % 90 + 10)::text, 2, '0'),
         coalesce(b.valor_homologado, 50000), b.data_publicacao + 25, b.data_publicacao + 25,
         case when b.ano < 2026 then b.data_publicacao + 365 else b.data_publicacao + 300 end,
         'https://www.diariomunicipal.com.br/femurn/?teste=1', 'publicado'
  from base b
  returning id, orgao_id, valor_inicial, vigencia_fim, data_assinatura
),
fis as (
  insert into public.contratos_fiscais (contrato_id, orgao_id, nome, funcao, ato)
  select i.id, i.orgao_id, f.nome, f.funcao, 'Portaria nº ' || (10 + row_number() over ()) || '/' || extract(year from i.data_assinatura)
  from ins i cross join lateral (values
    ((array['Maria José da Silva', 'Antônio Carlos Souza', 'Francisca Lima Rocha', 'João Batista Nunes'])[1 + (abs(hashtext(i.id::text)) % 4)], 'fiscal'),
    ((array['Ana Paula Fernandes', 'Pedro Henrique Costa'])[1 + (abs(hashtext(i.id::text || 'g')) % 2)], 'gestor')
  ) f(nome, funcao)
  returning 1
)
-- Aditivo de prazo e valor em metade dos contratos.
insert into public.contratos_aditivos (contrato_id, orgao_id, numero, tipo, data_assinatura, descricao, valor, nova_vigencia_fim, link_externo)
select i.id, i.orgao_id, '1º Termo Aditivo', 'prazo_valor', i.vigencia_fim - 10, 'Prorrogação por 12 meses e acréscimo de 10%',
       round(i.valor_inicial * 0.10, 2), i.vigencia_fim + 365, 'https://www.diariomunicipal.com.br/femurn/?teste=1'
from ins i where abs(hashtext(i.id::text)) % 2 = 0;

select c.numero, c.contratado_nome, c.valor_inicial, c.valor_atual, c.vigencia_fim, c.vigencia_fim_atual
from public.contratos c where c.processo like 'TESTE%' order by c.data_assinatura;

-- Para APAGAR (tire os dois traços e rode; aditivos e fiscais vão junto):
-- delete from public.contratos where processo like 'TESTE%';
