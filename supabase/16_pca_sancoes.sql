-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 16 — Fase 2 · Lote 8.1: PCA e sanções (fecha a dimensão Licitações)
--   PNTP 8.6 Divulga o plano de contratações anual? (recomendada)
--        O PCA é obrigatório (Lei 14.133/2021, art. 12, VII e §1º): declarar
--        que não existe NÃO pontua. Por isso não há "declaração" de PCA.
--   PNTP 8.7 Divulga a relação dos licitantes e/ou contratados sancionados
--        administrativamente pelo Poder ou órgão? (recomendada)
--        Sem sanções, o site declara expressamente que não há sancionados.
--        O link para o CEIS/CNEP NÃO substitui a relação do próprio órgão.
--
-- Dois módulos novos no painel (permissões copiadas de "licitacoes"):
--   pca      → Plano de Contratações Anual (o plano e as atualizações)
--   sancoes  → Sanções a licitantes e contratados
--
-- Como usar: SQL Editor › New query › colar tudo › Run. Pode repetir.
-- Rodar DEPOIS dos scripts 01 a 15.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. MÓDULOS NO PAINEL
-- ---------------------------------------------------------------------
insert into public.modulos (codigo, nome, grupo, ordem) values
  ('pca',     'Plano de Contratações Anual (PCA)',     'Transparência', 52),
  ('sancoes', 'Sanções a licitantes e contratados',    'Transparência', 53)
on conflict (codigo) do nothing;

insert into public.perfil_permissoes (perfil_id, modulo, pode_ver, pode_editar, pode_publicar, pode_excluir)
select perfil_id, m.codigo, pode_ver, pode_editar, pode_publicar, pode_excluir
from public.perfil_permissoes, (values ('pca'), ('sancoes')) as m(codigo)
where modulo = 'licitacoes'
on conflict (perfil_id, modulo) do nothing;


-- ---------------------------------------------------------------------
-- 2. PLANO DE CONTRATAÇÕES ANUAL
--    Uma linha por DOCUMENTO: o plano do ano (tipo 'plano', no máximo um
--    por ano) e as atualizações/revisões ao longo do ano (tipo 'atualizacao').
--    O documento pode ser o PDF enviado aqui ou o link do PCA no PNCP.
-- ---------------------------------------------------------------------
create table if not exists public.pca (
  id              uuid primary key default gen_random_uuid(),
  orgao_id        uuid not null references public.orgaos(id) on delete cascade,
  ano             integer not null check (ano between 2021 and 2100),
  tipo            text not null default 'plano' check (tipo in ('plano', 'atualizacao')),
  descricao       text check (descricao is null or char_length(descricao) <= 1000),
  ato_aprovacao   text check (ato_aprovacao is null or char_length(ato_aprovacao) <= 200),  -- ex.: Portaria nº 12/2026
  data_aprovacao  date not null default current_date,       -- não nulo: é a coluna da ordem/paginação
  valor_total     numeric(16, 2) check (valor_total is null or valor_total >= 0),
  qtd_itens       integer check (qtd_itens is null or qtd_itens >= 0),
  arquivo_url     text,
  link_externo    text check (link_externo is null or link_externo ~* '^https?://'),   -- ex.: página do PCA no PNCP
  situacao        text not null default 'rascunho' check (situacao in ('rascunho', 'publicado')),
  publicado_em    timestamptz,
  busca           text generated always as (public.normalizar_texto(
                    ano || ' ' || tipo || ' ' || coalesce(descricao, '') || ' ' || coalesce(ato_aprovacao, ''))) stored,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  -- coalesce(…, false): numa regra CHECK, resultado nulo conta como aprovado.
  constraint pca_documento check (coalesce(situacao = 'rascunho' or arquivo_url is not null or link_externo is not null, false))
);
create unique index if not exists pca_plano_uk on public.pca (orgao_id, ano) where tipo = 'plano';
create index if not exists pca_lista_idx on public.pca (orgao_id, ano desc, data_aprovacao desc, id desc);

drop trigger if exists pca_publicacao on public.pca;
create trigger pca_publicacao before insert or update on public.pca
  for each row execute function public.controlar_publicacao('pca');
drop trigger if exists pca_atualizado on public.pca;
create trigger pca_atualizado before update on public.pca
  for each row execute function public.marcar_atualizacao();
drop trigger if exists pca_historico on public.pca;
create trigger pca_historico after insert or update or delete on public.pca
  for each row execute function public.registrar_historico();


-- ---------------------------------------------------------------------
-- 3. SANÇÕES ADMINISTRATIVAS
--    Lei 14.133/2021, art. 156: advertência, multa, impedimento de licitar
--    e contratar, declaração de inidoneidade. As da Lei 8.666/1993
--    (suspensão temporária) entram para a série histórica.
--    "Vigente" × "encerrada" é calculado na leitura (fim da sanção x hoje),
--    para não depender de tarefa agendada.
-- ---------------------------------------------------------------------
create table if not exists public.sancoes (
  id              uuid primary key default gen_random_uuid(),
  orgao_id        uuid not null references public.orgaos(id) on delete cascade,
  sancionado_nome text not null check (char_length(sancionado_nome) between 2 and 200),
  -- CNPJ ou CPF só com números. CPF aparece mascarado no site (LGPD).
  sancionado_doc  text check (sancionado_doc is null or sancionado_doc ~ '^(\d{11}|\d{14})$'),
  tipo            text not null check (tipo in ('advertencia', 'multa', 'impedimento', 'inidoneidade', 'suspensao', 'outra')),
  fundamento      text check (fundamento is null or char_length(fundamento) <= 300),      -- ex.: Lei 14.133/2021, art. 156, III
  motivo          text check (motivo is null or char_length(motivo) <= 2000),
  processo        text check (processo is null or char_length(processo) <= 100),          -- processo administrativo sancionador
  referencia      text check (referencia is null or char_length(referencia) <= 200),      -- licitação/contrato em que ocorreu
  ano             integer not null check (ano between 1990 and 2100),                     -- ano da aplicação (abas de ano)
  data_aplicacao  date not null default current_date,
  inicio          date,
  fim             date,                                                                   -- prazo final (impedimento/inidoneidade/suspensão)
  valor_multa     numeric(16, 2) check (valor_multa is null or valor_multa >= 0),
  ato             text check (ato is null or char_length(ato) <= 200),                    -- ex.: Portaria nº 45/2026, DOM de 10/03/2026
  arquivo_url     text,
  link_externo    text check (link_externo is null or link_externo ~* '^https?://'),
  situacao        text not null default 'rascunho' check (situacao in ('rascunho', 'publicado')),
  publicado_em    timestamptz,
  busca           text generated always as (public.normalizar_texto(
                    sancionado_nome || ' ' || coalesce(sancionado_doc, '') || ' ' || tipo || ' ' || coalesce(processo, '') || ' ' ||
                    coalesce(referencia, '') || ' ' || coalesce(motivo, '') || ' ' || coalesce(ato, ''))) stored,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  constraint sancoes_periodo check (coalesce(inicio is null or fim is null or fim >= inicio, false)),
  constraint sancoes_multa check (coalesce(tipo = 'multa' or valor_multa is null, false))
);
create index if not exists sancoes_lista_idx on public.sancoes (orgao_id, ano desc, data_aplicacao desc, id desc);
create index if not exists sancoes_fim_idx on public.sancoes (orgao_id, fim);

-- O ano acompanha a data de aplicação (ninguém precisa digitar duas vezes).
create or replace function public.sancao_ano()
returns trigger language plpgsql set search_path = public as $$
begin
  new.ano := extract(year from new.data_aplicacao)::integer;
  return new;
end;
$$;
drop trigger if exists sancoes_ano on public.sancoes;
create trigger sancoes_ano before insert or update on public.sancoes
  for each row execute function public.sancao_ano();

drop trigger if exists sancoes_publicacao on public.sancoes;
create trigger sancoes_publicacao before insert or update on public.sancoes
  for each row execute function public.controlar_publicacao('sancoes');
drop trigger if exists sancoes_atualizado on public.sancoes;
create trigger sancoes_atualizado before update on public.sancoes
  for each row execute function public.marcar_atualizacao();
drop trigger if exists sancoes_historico on public.sancoes;
create trigger sancoes_historico after insert or update or delete on public.sancoes
  for each row execute function public.registrar_historico();


-- ---------------------------------------------------------------------
-- 4. REGRAS DE ACESSO — do órgão todo (sem alcance setorial), como licitações
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['pca', 'sancoes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%1$s: leitura" on public.%1$I', t);
    execute format('create policy "%1$s: leitura" on public.%1$I for select to anon, authenticated using (situacao = ''publicado'' or public.e_membro(orgao_id))', t);
    execute format('drop policy if exists "%1$s: inclusão" on public.%1$I', t);
    execute format('create policy "%1$s: inclusão" on public.%1$I for insert to authenticated with check (public.tem_permissao(orgao_id, %2$L, ''editar'') and public.no_alcance(orgao_id, null))', t, t);
    execute format('drop policy if exists "%1$s: edição" on public.%1$I', t);
    execute format('create policy "%1$s: edição" on public.%1$I for update to authenticated using (public.tem_permissao(orgao_id, %2$L, ''editar'') and public.no_alcance(orgao_id, null)) with check (public.tem_permissao(orgao_id, %2$L, ''editar'') and public.no_alcance(orgao_id, null))', t, t);
    execute format('drop policy if exists "%1$s: exclusão" on public.%1$I', t);
    execute format('create policy "%1$s: exclusão" on public.%1$I for delete to authenticated using (public.tem_permissao(orgao_id, %2$L, ''excluir'') and public.no_alcance(orgao_id, null))', t, t);
  end loop;
end $$;

grant select on public.pca, public.sancoes to anon;
grant select, insert, update, delete on public.pca, public.sancoes to authenticated;


-- ---------------------------------------------------------------------
-- 5. EXERCÍCIOS (abas de ano)
-- ---------------------------------------------------------------------
create or replace function public.pca_anos(p_orgao uuid)
returns table (ano integer, total bigint)
language sql stable security invoker set search_path = public as $$
  select p.ano, count(*) from public.pca p where p.orgao_id = p_orgao group by p.ano order by p.ano desc;
$$;
grant execute on function public.pca_anos(uuid) to anon, authenticated;

create or replace function public.sancoes_anos(p_orgao uuid)
returns table (ano integer, total bigint)
language sql stable security invoker set search_path = public as $$
  select s.ano, count(*) from public.sancoes s where s.orgao_id = p_orgao group by s.ano order by s.ano desc;
$$;
grant execute on function public.sancoes_anos(uuid) to anon, authenticated;
