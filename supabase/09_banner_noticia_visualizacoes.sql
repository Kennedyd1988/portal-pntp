-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 09 — Banner ligado a notícia e contador de visualizações
--
-- Como usar: Supabase › SQL Editor › New query › colar tudo › Run.
-- Pode ser executado mais de uma vez. Rodar DEPOIS dos scripts 01 a 08.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. BANNER QUE ABRE UMA NOTÍCIA
--    O banner pode levar a uma notícia cadastrada (noticia_id) OU a um
--    endereço (link_url). "on delete restrict": a notícia usada por um
--    banner não pode ser excluída sem antes trocar o banner (o painel
--    explica o motivo) — nunca fica banner apontando para o nada.
-- ---------------------------------------------------------------------
alter table public.banners
  add column if not exists noticia_id uuid references public.noticias(id) on delete restrict;

create index if not exists banners_noticia_idx on public.banners (noticia_id) where noticia_id is not null;

-- A notícia escolhida precisa ser do mesmo órgão do banner.
create or replace function public.validar_banner_noticia()
returns trigger language plpgsql as $$
begin
  if new.noticia_id is not null and not exists (
    select 1 from public.noticias n where n.id = new.noticia_id and n.orgao_id = new.orgao_id
  ) then
    raise exception 'A notícia escolhida não pertence a este órgão.';
  end if;
  return new;
end;
$$;
drop trigger if exists banners_validar_noticia on public.banners;
create trigger banners_validar_noticia before insert or update on public.banners
  for each row execute function public.validar_banner_noticia();


-- ---------------------------------------------------------------------
-- 2. VISUALIZAÇÕES DAS NOTÍCIAS
--    Tabela separada de propósito: somar 1 na própria notícia dispararia
--    os gatilhos de "atualizado em" e de histórico a cada leitura (o
--    histórico encheria de lixo e a data de atualização ficaria errada).
-- ---------------------------------------------------------------------
create table if not exists public.noticias_visualizacoes (
  noticia_id uuid primary key references public.noticias(id) on delete cascade,
  total      bigint not null default 0
);
alter table public.noticias_visualizacoes enable row level security;

drop policy if exists "noticias_visualizacoes: leitura" on public.noticias_visualizacoes;
create policy "noticias_visualizacoes: leitura" on public.noticias_visualizacoes
  for select to anon, authenticated using (true);
grant select on public.noticias_visualizacoes to anon, authenticated;

-- Única forma de gravar: soma 1, e só para notícia publicada e já no ar.
-- (O site chama uma vez por notícia por sessão do navegador.)
create or replace function public.registrar_visualizacao(p_noticia uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.noticias
                 where id = p_noticia and situacao = 'publicado' and publicado_em <= now()) then
    return;
  end if;
  insert into public.noticias_visualizacoes (noticia_id, total) values (p_noticia, 1)
  on conflict (noticia_id) do update set total = public.noticias_visualizacoes.total + 1;
end;
$$;
revoke execute on function public.registrar_visualizacao(uuid) from public;
grant execute on function public.registrar_visualizacao(uuid) to anon, authenticated;
