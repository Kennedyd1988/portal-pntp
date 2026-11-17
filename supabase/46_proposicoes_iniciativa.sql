-- =====================================================================
-- Script 46 — Iniciativa da proposição: Legislativo × Executivo (0.43.0)
-- Nas Câmaras, o Executivo e o Legislativo numeram os projetos de lei cada um
-- na sua série: "Projeto de Lei nº 1/2026" do Prefeito e "Projeto de Lei
-- nº 1/2026" de um vereador são proposições diferentes. Até aqui o banco não
-- deixava as duas existirem (e a migração do site antigo juntava as duas).
--
-- · nova coluna iniciativa: legislativo, executivo, popular ou outra
--   (vazia = não informada, como estava antes);
-- · a regra de "não repetir" passa a considerar também a iniciativa.
-- Nada é apagado. Pode rodar mais de uma vez.
-- Como usar: SQL Editor › New query › colar tudo › Run.
-- =====================================================================
alter table public.proposicoes add column if not exists iniciativa text;
alter table public.proposicoes drop constraint if exists proposicoes_iniciativa_check;
alter table public.proposicoes add constraint proposicoes_iniciativa_check
  check (iniciativa is null or iniciativa in ('legislativo', 'executivo', 'popular', 'outra'));

drop index if exists public.proposicoes_uk;
create unique index if not exists proposicoes_uk on public.proposicoes
  (orgao_id, tipo, coalesce(iniciativa, ''), public.normalizar_texto(numero), ano);

-- Proposições já cadastradas com autoria do Prefeito/Executivo: marca como Executivo.
update public.proposicoes set iniciativa = 'executivo'
 where iniciativa is null and autoria_externa is not null
   and public.normalizar_texto(autoria_externa) ~ '(prefeit|executivo)';
