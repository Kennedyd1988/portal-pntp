-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 42 — Publicações: competência e anexos (0.37.0)
-- Para qualquer tipo de publicação (inclusive os tipos criados pelo órgão
-- em "Outros atos"):
--   • competência: o período a que o documento se refere, em texto livre
--     (ex.: "Outubro/2026", "1º bimestre/2026", "Exercício 2025");
--   • anexos: outros arquivos além do documento principal, cada um com o seu título.
-- Pode rodar mais de uma vez.
-- =====================================================================

alter table public.publicacoes add column if not exists competencia text
  check (competencia is null or char_length(competencia) between 2 and 60);

create table if not exists public.publicacoes_anexos (
  id             uuid primary key default gen_random_uuid(),
  publicacao_id  uuid not null references public.publicacoes(id) on delete cascade,
  orgao_id       uuid not null references public.orgaos(id) on delete cascade,
  titulo         text not null check (char_length(titulo) between 2 and 200),
  arquivo_url    text not null,
  ordem          integer not null default 0,
  criado_em      timestamptz not null default now()
);
create index if not exists publicacoes_anexos_idx on public.publicacoes_anexos (publicacao_id, ordem);

drop trigger if exists publicacoes_anexos_historico on public.publicacoes_anexos;
create trigger publicacoes_anexos_historico after insert or update or delete on public.publicacoes_anexos
  for each row execute function public.registrar_historico();

alter table public.publicacoes_anexos enable row level security;
drop policy if exists "publicacoes_anexos: leitura" on public.publicacoes_anexos;
create policy "publicacoes_anexos: leitura" on public.publicacoes_anexos for select to anon, authenticated
  using (public.e_membro(orgao_id) or exists (select 1 from public.publicacoes p where p.id = publicacao_id and p.situacao = 'publicado'));
drop policy if exists "publicacoes_anexos: inclusão" on public.publicacoes_anexos;
create policy "publicacoes_anexos: inclusão" on public.publicacoes_anexos for insert to authenticated
  with check (public.tem_permissao(orgao_id, 'publicacoes', 'editar') and public.no_alcance(orgao_id, null));
drop policy if exists "publicacoes_anexos: edição" on public.publicacoes_anexos;
create policy "publicacoes_anexos: edição" on public.publicacoes_anexos for update to authenticated
  using (public.tem_permissao(orgao_id, 'publicacoes', 'editar') and public.no_alcance(orgao_id, null))
  with check (public.tem_permissao(orgao_id, 'publicacoes', 'editar') and public.no_alcance(orgao_id, null));
drop policy if exists "publicacoes_anexos: exclusão" on public.publicacoes_anexos;
create policy "publicacoes_anexos: exclusão" on public.publicacoes_anexos for delete to authenticated
  using (public.tem_permissao(orgao_id, 'publicacoes', 'editar') and public.no_alcance(orgao_id, null));
grant select on public.publicacoes_anexos to anon;

select 'competência e anexos das publicações prontos' as situacao;
