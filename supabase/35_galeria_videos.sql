-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 35 — Galeria de vídeos (0.26.0)
-- Vídeos do órgão (YouTube, Vimeo ou outro endereço): página "Vídeos" no site
-- e bloco "Galeria multimídia" na página inicial (vídeo em destaque + os mais
-- recentes). Cadastro em Notícias, banners e avisos › Vídeos (mesmas
-- permissões das notícias). Pode rodar mais de uma vez.
-- =====================================================================
create table if not exists public.videos (
  id            uuid primary key default gen_random_uuid(),
  orgao_id      uuid not null references public.orgaos(id) on delete cascade,
  titulo        text not null check (char_length(titulo) between 3 and 200),
  descricao     text check (descricao is null or char_length(descricao) <= 2000),
  url           text not null check (url ~* '^https?://'),            -- endereço do vídeo (YouTube, Vimeo…)
  miniatura_url text check (miniatura_url is null or miniatura_url ~* '^https?://'),   -- em branco: a do YouTube
  data          date not null default current_date,
  destaque      boolean not null default false,                       -- aparece grande na página inicial
  situacao      text not null default 'rascunho' check (situacao in ('rascunho', 'publicado')),
  publicado_em  timestamptz,
  busca         text generated always as (public.normalizar_texto(titulo || ' ' || coalesce(descricao, ''))) stored,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists videos_lista_idx on public.videos (orgao_id, data desc, id desc);

alter table public.videos enable row level security;
drop trigger if exists videos_publicacao on public.videos;
create trigger videos_publicacao before insert or update on public.videos for each row execute function public.controlar_publicacao('noticias');
drop trigger if exists videos_atualizado on public.videos;
create trigger videos_atualizado before update on public.videos for each row execute function public.marcar_atualizacao();
drop trigger if exists videos_historico on public.videos;
create trigger videos_historico after insert or update or delete on public.videos for each row execute function public.registrar_historico();

drop policy if exists "videos: leitura" on public.videos;
create policy "videos: leitura" on public.videos for select to anon, authenticated using (situacao = 'publicado' or public.e_membro(orgao_id));
drop policy if exists "videos: inclusão" on public.videos;
create policy "videos: inclusão" on public.videos for insert to authenticated
  with check (public.tem_permissao(orgao_id, 'noticias', 'editar') and public.no_alcance(orgao_id, null));
drop policy if exists "videos: edição" on public.videos;
create policy "videos: edição" on public.videos for update to authenticated
  using (public.tem_permissao(orgao_id, 'noticias', 'editar') and public.no_alcance(orgao_id, null))
  with check (public.tem_permissao(orgao_id, 'noticias', 'editar') and public.no_alcance(orgao_id, null));
drop policy if exists "videos: exclusão" on public.videos;
create policy "videos: exclusão" on public.videos for delete to authenticated
  using (public.tem_permissao(orgao_id, 'noticias', 'excluir') and public.no_alcance(orgao_id, null));
grant select on public.videos to anon;
grant select, insert, update, delete on public.videos to authenticated;
