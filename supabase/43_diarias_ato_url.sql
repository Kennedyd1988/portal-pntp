-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 43 — Link do ato de concessão da diária (0.40.0)
-- A diária passa a guardar o PDF da portaria (ou outro ato) que a concedeu,
-- além do número (ato_concessao). Usado na migração do site antigo
-- (Plataforma B: as portarias de diárias vêm para o módulo Diárias) e no
-- cadastro manual. O site mostra o link junto do número do ato.
-- Rodar depois do 36. Pode rodar mais de uma vez.
-- =====================================================================

alter table public.diarias add column if not exists ato_url text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'diarias_ato_url_http') then
    alter table public.diarias add constraint diarias_ato_url_http check (ato_url is null or ato_url ~* '^https?://');
  end if;
end $$;

-- O site lê diárias por coluna (o CPF fica fechado): libera a coluna nova.
do $$ begin
  if exists (select 1 from information_schema.column_privileges where table_schema = 'public' and table_name = 'diarias' and grantee = 'anon' and privilege_type = 'SELECT') then
    grant select (ato_url) on public.diarias to anon;
  end if;
end $$;

-- Conferência
select 'diarias.ato_url' as item, count(*) as existe
  from information_schema.columns where table_schema = 'public' and table_name = 'diarias' and column_name = 'ato_url';
