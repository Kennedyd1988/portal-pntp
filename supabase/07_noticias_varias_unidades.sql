-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 07 — Notícia ligada a mais de uma secretaria
--
-- Como usar: Supabase › SQL Editor › New query › colar tudo › Run.
-- Pode ser executado mais de uma vez. Rodar DEPOIS do script 06.
--
-- Regra: a notícia continua com UMA unidade responsável (unidade_id) — é
-- ela que define quem pode editar (alcance). As "outras secretarias
-- envolvidas" só fazem a notícia aparecer também na página delas no site
-- e no filtro do painel. Ex.: campanha da Saúde com a Educação.
-- =====================================================================

alter table public.noticias
  add column if not exists unidades_relacionadas uuid[] not null default '{}';

-- Índice próprio para listas (arrays): permite "notícias da Educação"
-- (responsável OU envolvida) sem varrer a tabela.
create index if not exists noticias_relacionadas_idx
  on public.noticias using gin (unidades_relacionadas);

-- Limpa e confere a lista: sem repetição, sem a própria responsável e
-- só com unidades do mesmo órgão.
create or replace function public.validar_unidades_noticia()
returns trigger language plpgsql as $$
begin
  new.unidades_relacionadas := coalesce(array(
    select distinct u from unnest(new.unidades_relacionadas) u
    where u is not null and u is distinct from new.unidade_id
  ), '{}');
  if exists (
    select 1 from unnest(new.unidades_relacionadas) u
    where not exists (select 1 from public.unidades x where x.id = u and x.orgao_id = new.orgao_id)
  ) then
    raise exception 'Uma das secretarias envolvidas não pertence a este órgão.';
  end if;
  return new;
end;
$$;
drop trigger if exists noticias_validar_unidades on public.noticias;
create trigger noticias_validar_unidades
  before insert or update on public.noticias
  for each row execute function public.validar_unidades_noticia();

-- A lista não tem chave estrangeira (o banco não protege arrays sozinho),
-- então a exclusão de uma unidade citada como "envolvida" é barrada aqui.
create or replace function public.proteger_unidade_citada()
returns trigger language plpgsql as $$
declare
  qtd integer;
begin
  select count(*) into qtd from public.noticias where old.id = any(unidades_relacionadas);
  if qtd > 0 then
    raise exception 'Esta unidade aparece como envolvida em % notícia(s). Tire-a dessas notícias antes de excluir, ou marque a unidade como inativa.', qtd;
  end if;
  return old;
end;
$$;
drop trigger if exists unidades_proteger_citada on public.unidades;
create trigger unidades_proteger_citada
  before delete on public.unidades
  for each row execute function public.proteger_unidade_citada();

-- ---------------------------------------------------------------------
-- Correção de segurança encontrada nesta revisão:
-- o acesso de um usuário limitado a uma unidade apontava para ela com
-- "on delete set null". Se a unidade fosse excluída, o alcance virava
-- NULL = ÓRGÃO TODO, ou seja, a pessoa ganhava acesso a tudo sem ninguém
-- perceber. Agora a exclusão da unidade é barrada enquanto houver
-- usuário limitado a ela (o painel explica o motivo).
-- ---------------------------------------------------------------------
alter table public.usuarios_orgaos drop constraint if exists usuarios_orgaos_unidade_id_fkey;
alter table public.usuarios_orgaos
  add constraint usuarios_orgaos_unidade_id_fkey
  foreign key (unidade_id) references public.unidades(id) on delete restrict;
