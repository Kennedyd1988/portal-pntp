-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 31 — Migração do site antigo (0.23.0)
--
-- Rodar no SQL Editor depois do 30. Pode rodar mais de uma vez.
--
-- · migracao_itens: o que já foi trazido do site antigo (endereço de origem →
--   registro novo). Rodar a migração de novo não duplica nada.
-- · Módulo "Migração do site antigo" (Suporte SOFT+ e administrador do órgão).
-- · Bucket "arquivos": até 50 MB por arquivo e também Word, Excel, ODT/ODS,
--   CSV e ZIP (documentos antigos de licitação e contas vêm nesses formatos).
-- =====================================================================

create table if not exists public.migracao_itens (
  orgao_id     uuid not null references public.orgaos(id) on delete cascade,
  origem_url   text not null,
  secao        text not null,
  tabela       text,
  registro_id  uuid,
  ano          integer,
  situacao     text not null default 'importado' check (situacao in ('importado', 'ja_existia', 'fora_periodo', 'ignorado', 'erro')),
  detalhe      text,
  bytes        bigint,
  criado_em    timestamptz not null default now(),
  primary key (orgao_id, origem_url)
);
create index if not exists migracao_itens_secao_idx on public.migracao_itens (orgao_id, secao);
alter table public.migracao_itens enable row level security;
drop policy if exists "migracao_itens: administrador" on public.migracao_itens;
create policy "migracao_itens: administrador" on public.migracao_itens for all to authenticated
  using (public.e_admin_do_orgao(orgao_id)) with check (public.e_admin_do_orgao(orgao_id));
grant select, insert, update, delete on public.migracao_itens to authenticated;
grant all on public.migracao_itens to service_role;

-- Resumo por seção para a tela.
create or replace function public.migracao_resumo(p_orgao uuid)
returns table (secao text, importados integer, ja_existiam integer, fora_periodo integer, erros integer, bytes bigint, ultimo timestamptz)
language sql stable security definer set search_path = public as $$
  select m.secao, count(*) filter (where m.situacao = 'importado')::int, count(*) filter (where m.situacao = 'ja_existia')::int,
         count(*) filter (where m.situacao = 'fora_periodo')::int, count(*) filter (where m.situacao = 'erro')::int,
         coalesce(sum(m.bytes), 0)::bigint, max(m.criado_em)
  from public.migracao_itens m where m.orgao_id = p_orgao and public.e_admin_do_orgao(p_orgao)
  group by m.secao order by m.secao;
$$;
grant execute on function public.migracao_resumo(uuid) to authenticated;

-- Espaço já usado no Storage pelo órgão (para comparar com o 1 GB do plano gratuito).
create or replace function public.armazenamento_orgao(p_orgao uuid)
returns table (pasta text, arquivos integer, bytes bigint)
language sql stable security definer set search_path = public, storage as $$
  select split_part(o.name, '/', 2), count(*)::int, coalesce(sum((o.metadata ->> 'size')::bigint), 0)
  from storage.objects o
  where o.bucket_id = 'arquivos' and split_part(o.name, '/', 1) = p_orgao::text and public.e_admin_do_orgao(p_orgao)
  group by 1 order by 3 desc;
$$;
grant execute on function public.armazenamento_orgao(uuid) to authenticated;

insert into public.modulos (codigo, nome, grupo, ordem)
values ('migracao', 'Migração do site antigo', 'Plataforma SOFT+', 910)
on conflict (codigo) do update set nome = excluded.nome, grupo = excluded.grupo, ordem = excluded.ordem;

update storage.buckets set file_size_limit = 52428800,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet',
    'application/zip', 'text/csv']
where id = 'arquivos';

select 'migracao pronta' as situacao;
