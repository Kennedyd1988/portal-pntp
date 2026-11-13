-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 17 — Licitações em ordem de modalidade e número (PNTP 8.1)
--   A Matriz 2026 pede a relação "em ordem numérica sequencial", com
--   número e modalidade. A lista passa a ser: modalidade (ordem fixa
--   abaixo) e, dentro dela, número do maior para o menor (o mais recente
--   no topo). A data de publicação continua como coluna e filtro.
--
-- O número é texto (ex.: 012/2026, 12/2026, PE-12/2026): a ordem usa só
-- o primeiro grupo de algarismos, para 3/2026 não vir depois de 12/2026.
-- Processo sem número fica no fim da sua modalidade.
--
-- Como usar: SQL Editor › New query › colar tudo › Run. Pode repetir.
-- Rodar DEPOIS dos scripts 01 a 16.
-- =====================================================================

-- Uma única coluna de ordem (texto) para a lista paginada por cursor:
--   2 dígitos da modalidade + 8 dígitos do número "invertido" (99999999 − n).
alter table public.licitacoes add column if not exists chave_ordem text generated always as (
  lpad((case modalidade
    when 'pregao_eletronico' then 1 when 'pregao_presencial' then 2
    when 'concorrencia_eletronica' then 3 when 'concorrencia_presencial' then 4
    when 'concurso' then 5 when 'leilao_eletronico' then 6 when 'leilao_presencial' then 7
    when 'dialogo_competitivo' then 8 when 'credenciamento' then 9 when 'pre_qualificacao' then 10
    when 'manifestacao_interesse' then 11 when 'chamada_publica' then 12
    when 'tomada_precos' then 13 when 'convite' then 14
    when 'dispensa' then 15 when 'inexigibilidade' then 16 when 'adesao_ata' then 17
    else 99 end)::text, 2, '0')
  || '-' ||
  lpad((99999999 - coalesce(substring(coalesce(numero, '') from '^\D*(\d{1,8})')::integer, 0))::text, 8, '0')
) stored;

create index if not exists licitacoes_ordem_idx on public.licitacoes (orgao_id, ano, chave_ordem, id);
