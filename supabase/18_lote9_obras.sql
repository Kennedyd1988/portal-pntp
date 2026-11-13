-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 18 — Fase 2 · Lote 9: Obras (PNTP 10.1 a 10.4)
--   10.1 informações das obras: início, etapas, percentual concluído,
--        situação e previsão de conclusão (recomendada)
--   10.2 quantitativos e preços unitários e totais contratados (obrigatória)
--   10.3 quantitativos executados e preços efetivamente praticados (obrigatória)
--   10.4 obras paralisadas: motivo, responsável pela inexecução temporária e
--        data prevista para o reinício (obrigatória; Lei 14.133, art. 115, §6º)
--   Sem obras, ou sem obras paralisadas, o site declara isso expressamente.
--
-- Estrutura:
--   obras               a obra (pode ligar ao contrato do módulo Contratos)
--   obras_itens         planilha contratada × executada (10.2 e 10.3)
--   obras_medicoes      medições/etapas, com valor medido e valor pago
--   obras_paralisacoes  cada paralisação (aberta enquanto não houver reinício)
-- A situação "paralisada" é mantida pelo banco: existe paralisação aberta →
-- paralisada; a última é encerrada → volta para "em andamento".
--
-- O módulo "obras" já existe desde o script 01 (com as permissões).
-- Como usar: SQL Editor › New query › colar tudo › Run. Pode repetir.
-- Rodar DEPOIS dos scripts 01 a 17.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. OBRAS
-- ---------------------------------------------------------------------
create table if not exists public.obras (
  id                 uuid primary key default gen_random_uuid(),
  orgao_id           uuid not null references public.orgaos(id) on delete cascade,
  -- Contrato de origem (opcional). RESTRICT: não se apaga um contrato que tem obra.
  contrato_id        uuid references public.contratos(id) on delete restrict,
  titulo             text not null check (char_length(titulo) between 5 and 300),
  descricao          text check (descricao is null or char_length(descricao) <= 4000),
  local              text check (local is null or char_length(local) <= 300),        -- endereço, bairro, comunidade
  unidade_nome       text check (unidade_nome is null or char_length(unidade_nome) <= 150),
  contratada_nome    text check (contratada_nome is null or char_length(contratada_nome) <= 200),
  contratada_doc     text check (contratada_doc is null or contratada_doc ~ '^(\d{11}|\d{14})$'),
  fonte_recurso      text check (fonte_recurso is null or char_length(fonte_recurso) <= 200),  -- ex.: Convênio 912345/2025 + contrapartida
  valor_contratado   numeric(16, 2) check (valor_contratado is null or valor_contratado >= 0),
  situacao_obra      text not null default 'nao_iniciada' check (situacao_obra in ('nao_iniciada', 'em_andamento', 'paralisada', 'concluida', 'cancelada')),
  percentual         numeric(5, 2) not null default 0 check (percentual between 0 and 100),
  etapa_atual        text check (etapa_atual is null or char_length(etapa_atual) <= 300),
  data_inicio        date,
  previsao_conclusao date,
  data_conclusao     date,
  ano                integer not null check (ano between 1990 and 2100),   -- abas de ano (início; sem início, o ano do cadastro)
  link_externo       text check (link_externo is null or link_externo ~* '^https?://'),   -- ex.: Obrasgov, TCE
  situacao           text not null default 'rascunho' check (situacao in ('rascunho', 'publicado')),
  publicado_em       timestamptz,
  busca              text generated always as (public.normalizar_texto(
                       titulo || ' ' || coalesce(descricao, '') || ' ' || coalesce(local, '') || ' ' || coalesce(unidade_nome, '') || ' ' ||
                       coalesce(contratada_nome, '') || ' ' || coalesce(contratada_doc, '') || ' ' || coalesce(fonte_recurso, ''))) stored,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  constraint obras_previsao check (coalesce(data_inicio is null or previsao_conclusao is null or previsao_conclusao >= data_inicio, false)),
  constraint obras_conclusao check (coalesce(data_inicio is null or data_conclusao is null or data_conclusao >= data_inicio, false)),
  constraint obras_concluida check (coalesce(situacao_obra <> 'concluida' or data_conclusao is not null, false))
);
create index if not exists obras_lista_idx on public.obras (orgao_id, ano desc, atualizado_em desc, id desc);
create index if not exists obras_situacao_idx on public.obras (orgao_id, situacao_obra);
create index if not exists obras_contrato_idx on public.obras (contrato_id);

create or replace function public.obra_ano()
returns trigger language plpgsql set search_path = public as $$
begin
  new.ano := extract(year from coalesce(new.data_inicio, new.criado_em, now()))::integer;
  return new;
end;
$$;
drop trigger if exists obras_ano on public.obras;
create trigger obras_ano before insert or update on public.obras
  for each row execute function public.obra_ano();

drop trigger if exists obras_publicacao on public.obras;
create trigger obras_publicacao before insert or update on public.obras
  for each row execute function public.controlar_publicacao('obras');
drop trigger if exists obras_atualizado on public.obras;
create trigger obras_atualizado before update on public.obras
  for each row execute function public.marcar_atualizacao();
drop trigger if exists obras_historico on public.obras;
create trigger obras_historico after insert or update or delete on public.obras
  for each row execute function public.registrar_historico();


-- ---------------------------------------------------------------------
-- 2. PLANILHA (10.2 e 10.3), MEDIÇÕES E PARALISAÇÕES (10.4)
-- ---------------------------------------------------------------------
create table if not exists public.obras_itens (
  id                    uuid primary key default gen_random_uuid(),
  obra_id               uuid not null references public.obras(id) on delete cascade,
  orgao_id              uuid not null references public.orgaos(id) on delete cascade,
  ordem                 integer not null default 0,
  codigo                text check (codigo is null or char_length(codigo) <= 40),   -- item da planilha / código SINAPI
  descricao             text not null check (char_length(descricao) between 2 and 1000),
  unidade               text check (unidade is null or char_length(unidade) <= 20),   -- m², m³, un, vb…
  quantidade            numeric(16, 4) not null default 0 check (quantidade >= 0),     -- contratada
  preco_unitario        numeric(16, 2) not null default 0 check (preco_unitario >= 0), -- contratado
  quantidade_executada  numeric(16, 4) not null default 0 check (quantidade_executada >= 0),
  preco_praticado       numeric(16, 2) check (preco_praticado is null or preco_praticado >= 0),  -- vazio = o contratado
  total_contratado      numeric(18, 2) generated always as (round(quantidade * preco_unitario, 2)) stored,
  total_executado       numeric(18, 2) generated always as (round(quantidade_executada * coalesce(preco_praticado, preco_unitario), 2)) stored,
  criado_em             timestamptz not null default now()
);
create index if not exists obras_itens_idx on public.obras_itens (obra_id, ordem, id);

create table if not exists public.obras_medicoes (
  id              uuid primary key default gen_random_uuid(),
  obra_id         uuid not null references public.obras(id) on delete cascade,
  orgao_id        uuid not null references public.orgaos(id) on delete cascade,
  numero          integer not null check (numero between 1 and 999),
  descricao       text check (descricao is null or char_length(descricao) <= 500),   -- etapa / serviços medidos
  periodo_inicio  date,
  periodo_fim     date,
  valor_medido    numeric(16, 2) check (valor_medido is null or valor_medido >= 0),
  valor_pago      numeric(16, 2) check (valor_pago is null or valor_pago >= 0),
  data_pagamento  date,
  percentual_acumulado numeric(5, 2) check (percentual_acumulado is null or percentual_acumulado between 0 and 100),
  arquivo_url     text,
  link_externo    text check (link_externo is null or link_externo ~* '^https?://'),
  criado_em       timestamptz not null default now(),
  constraint obras_medicoes_periodo check (coalesce(periodo_inicio is null or periodo_fim is null or periodo_fim >= periodo_inicio, false))
);
create unique index if not exists obras_medicoes_uk on public.obras_medicoes (obra_id, numero);

create table if not exists public.obras_paralisacoes (
  id                 uuid primary key default gen_random_uuid(),
  obra_id            uuid not null references public.obras(id) on delete cascade,
  orgao_id           uuid not null references public.orgaos(id) on delete cascade,
  inicio             date not null default current_date,
  motivo             text not null check (char_length(motivo) between 5 and 2000),
  responsavel        text not null check (char_length(responsavel) between 2 and 300),   -- responsável pela inexecução temporária
  previsao_reinicio  date,
  reinicio           date,                                                             -- preenchido quando a obra volta: encerra a paralisação
  ato                text check (ato is null or char_length(ato) <= 200),              -- ordem de paralisação
  arquivo_url        text,
  criado_em          timestamptz not null default now(),
  constraint obras_paralisacoes_datas check (coalesce((previsao_reinicio is null or previsao_reinicio >= inicio) and (reinicio is null or reinicio >= inicio), false))
);
create index if not exists obras_paralisacoes_idx on public.obras_paralisacoes (obra_id, inicio);
-- No máximo uma paralisação aberta por obra.
create unique index if not exists obras_paralisacao_aberta_uk on public.obras_paralisacoes (obra_id) where reinicio is null;

-- Regras dos filhos (igual aos contratos): mesmo órgão da obra; mexer em filho
-- de obra JÁ PUBLICADA exige permissão de publicar.
create or replace function public.validar_filho_obra()
returns trigger language plpgsql set search_path = public as $$
declare
  v_obra uuid := coalesce(new.obra_id, old.obra_id);
  v_orgao uuid := coalesce(new.orgao_id, old.orgao_id);
  v_situacao text;
begin
  select o.situacao into v_situacao from public.obras o where o.id = v_obra and o.orgao_id = v_orgao;
  if v_situacao is null then
    if tg_op = 'DELETE' then return old; end if;   -- exclusão em cascata
    raise exception 'O registro não pertence a uma obra deste órgão.';
  end if;
  if current_user in ('anon', 'authenticated') and v_situacao = 'publicado'
     and not public.tem_permissao(v_orgao, 'obras', 'publicar') then
    raise exception 'Esta obra está publicada. Só quem tem permissão de publicar altera planilha, medições e paralisações dela.';
  end if;
  return coalesce(new, old);
end;
$$;
do $$
declare t text;
begin
  foreach t in array array['obras_itens', 'obras_medicoes', 'obras_paralisacoes'] loop
    execute format('drop trigger if exists %1$s_validar on public.%1$I', t);
    execute format('create trigger %1$s_validar before insert or update or delete on public.%1$I for each row execute function public.validar_filho_obra()', t);
    execute format('drop trigger if exists %1$s_historico on public.%1$I', t);
    execute format('create trigger %1$s_historico after insert or update or delete on public.%1$I for each row execute function public.registrar_historico()', t);
  end loop;
end $$;

-- Paralisação mudou → situação da obra. SECURITY DEFINER: é cálculo do banco
-- (quem mexeu na paralisação já passou pela regra acima).
create or replace function public.recalcular_situacao_obra()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := coalesce(new.obra_id, old.obra_id);
begin
  if exists (select 1 from public.obras_paralisacoes p where p.obra_id = v_id and p.reinicio is null) then
    update public.obras set situacao_obra = 'paralisada' where id = v_id and situacao_obra <> 'paralisada';
  else
    update public.obras set situacao_obra = 'em_andamento' where id = v_id and situacao_obra = 'paralisada';
  end if;
  return null;
end;
$$;
drop trigger if exists obras_paralisacoes_situacao on public.obras_paralisacoes;
create trigger obras_paralisacoes_situacao after insert or update or delete on public.obras_paralisacoes
  for each row execute function public.recalcular_situacao_obra();

-- A obra só fica "paralisada" com uma paralisação aberta (motivo e responsável são
-- obrigatórios no 10.4), e não sai dela enquanto a paralisação estiver aberta.
create or replace function public.conferir_situacao_obra()
returns trigger language plpgsql set search_path = public as $$
declare
  v_aberta boolean := exists (select 1 from public.obras_paralisacoes p where p.obra_id = new.id and p.reinicio is null);
begin
  if new.situacao_obra = 'paralisada' and not v_aberta then
    raise exception 'Para marcar a obra como paralisada, registre a paralisação (motivo, responsável e previsão de reinício).';
  end if;
  if new.situacao_obra <> 'paralisada' and v_aberta then
    raise exception 'A obra tem paralisação aberta: informe a data de reinício na paralisação antes de mudar a situação.';
  end if;
  return new;
end;
$$;
drop trigger if exists obras_conferir_situacao on public.obras;
create trigger obras_conferir_situacao before insert or update of situacao_obra on public.obras
  for each row execute function public.conferir_situacao_obra();


-- ---------------------------------------------------------------------
-- 3. REGRAS DE ACESSO — do órgão todo (sem alcance setorial), como contratos
-- ---------------------------------------------------------------------
alter table public.obras enable row level security;
drop policy if exists "obras: leitura" on public.obras;
create policy "obras: leitura" on public.obras for select to anon, authenticated
  using (situacao = 'publicado' or public.e_membro(orgao_id));
drop policy if exists "obras: inclusão" on public.obras;
create policy "obras: inclusão" on public.obras for insert to authenticated
  with check (public.tem_permissao(orgao_id, 'obras', 'editar') and public.no_alcance(orgao_id, null));
drop policy if exists "obras: edição" on public.obras;
create policy "obras: edição" on public.obras for update to authenticated
  using (public.tem_permissao(orgao_id, 'obras', 'editar') and public.no_alcance(orgao_id, null))
  with check (public.tem_permissao(orgao_id, 'obras', 'editar') and public.no_alcance(orgao_id, null));
drop policy if exists "obras: exclusão" on public.obras;
create policy "obras: exclusão" on public.obras for delete to authenticated
  using (public.tem_permissao(orgao_id, 'obras', 'excluir') and public.no_alcance(orgao_id, null));

do $$
declare t text;
begin
  foreach t in array array['obras_itens', 'obras_medicoes', 'obras_paralisacoes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%1$s: leitura" on public.%1$I', t);
    execute format('create policy "%1$s: leitura" on public.%1$I for select to anon, authenticated using (public.e_membro(orgao_id) or exists (select 1 from public.obras o where o.id = obra_id and o.situacao = ''publicado''))', t);
    execute format('drop policy if exists "%1$s: inclusão" on public.%1$I', t);
    execute format('create policy "%1$s: inclusão" on public.%1$I for insert to authenticated with check (public.tem_permissao(orgao_id, ''obras'', ''editar'') and public.no_alcance(orgao_id, null))', t);
    execute format('drop policy if exists "%1$s: edição" on public.%1$I', t);
    execute format('create policy "%1$s: edição" on public.%1$I for update to authenticated using (public.tem_permissao(orgao_id, ''obras'', ''editar'') and public.no_alcance(orgao_id, null)) with check (public.tem_permissao(orgao_id, ''obras'', ''editar'') and public.no_alcance(orgao_id, null))', t);
    execute format('drop policy if exists "%1$s: exclusão" on public.%1$I', t);
    execute format('create policy "%1$s: exclusão" on public.%1$I for delete to authenticated using (public.tem_permissao(orgao_id, ''obras'', ''editar'') and public.no_alcance(orgao_id, null))', t);
  end loop;
end $$;

grant select on public.obras, public.obras_itens, public.obras_medicoes, public.obras_paralisacoes to anon;
grant select, insert, update, delete on public.obras, public.obras_itens, public.obras_medicoes, public.obras_paralisacoes to authenticated;


-- ---------------------------------------------------------------------
-- 4. RESUMO POR OBRA (totais da planilha e das medições) e ABAS DE ANO
--    security invoker: respeita as regras de leitura de quem consulta.
-- ---------------------------------------------------------------------
create or replace view public.obras_resumo with (security_invoker = true) as
select o.id as obra_id, o.orgao_id,
       (select count(*) from public.obras_itens i where i.obra_id = o.id) as itens,
       (select coalesce(sum(i.total_contratado), 0) from public.obras_itens i where i.obra_id = o.id) as total_planilha,
       (select coalesce(sum(i.total_executado), 0) from public.obras_itens i where i.obra_id = o.id) as total_executado,
       (select coalesce(sum(m.valor_medido), 0) from public.obras_medicoes m where m.obra_id = o.id) as total_medido,
       (select coalesce(sum(m.valor_pago), 0) from public.obras_medicoes m where m.obra_id = o.id) as total_pago,
       (select count(*) from public.obras_medicoes m where m.obra_id = o.id) as medicoes
from public.obras o;
grant select on public.obras_resumo to anon, authenticated;

create or replace function public.obras_anos(p_orgao uuid)
returns table (ano integer, total bigint)
language sql stable security invoker set search_path = public as $$
  select o.ano, count(*) from public.obras o where o.orgao_id = p_orgao group by o.ano order by o.ano desc;
$$;
grant execute on function public.obras_anos(uuid) to anon, authenticated;
