-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 11 — Avisos com título e texto do botão de ação
--
-- Como usar: Supabase › SQL Editor › New query › colar tudo › Run.
-- Pode ser executado mais de uma vez. Rodar DEPOIS dos scripts 01 a 10.
--
-- A faixa de aviso do site segue um layout único para todos os níveis:
-- ícone · título em negrito + texto · link de ação · botão de fechar.
-- Os dois campos novos são opcionais: avisos já cadastrados continuam
-- aparecendo só com o texto e o link "Saiba mais".
-- ---------------------------------------------------------------------
alter table public.avisos add column if not exists titulo text;
alter table public.avisos add column if not exists link_rotulo text;

alter table public.avisos drop constraint if exists avisos_titulo_tamanho;
alter table public.avisos add constraint avisos_titulo_tamanho
  check (titulo is null or char_length(titulo) <= 60);

alter table public.avisos drop constraint if exists avisos_link_rotulo_tamanho;
alter table public.avisos add constraint avisos_link_rotulo_tamanho
  check (link_rotulo is null or char_length(link_rotulo) <= 30);
