-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 15 — Lote 8 (Fase 2): Contratos
--   PNTP 9.1 relação dos contratos (contratado, valor, objeto, vigência e
--   aditivos), 9.2 inteiro teor dos contratos e aditivos, 9.3 relação dos
--   fiscais de cada contrato vigente e encerrado.
--   (9.4, ordem cronológica de pagamentos, é dado financeiro: fica no
--   sistema externo, como receitas e despesas.)
--
-- Como nas licitações, cada contrato vem de uma fonte: portal, link ou
-- pncp (importado do PNCP; reimportar atualiza).
--
-- Como usar: SQL Editor › New query › colar tudo › Run. Pode repetir.
-- Rodar DEPOIS dos scripts 01 a 14.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. MÓDULO NO PAINEL
--    "Licitações e contratos" vira dois módulos: Licitações e Contratos.
--    Quem já tinha acesso a licitações recebe o mesmo acesso a contratos.
-- ---------------------------------------------------------------------
update public.modulos set nome = 'Licitações' where codigo = 'licitacoes';
insert into public.modulos (codigo, nome, grupo, ordem) values
  ('contratos', 'Contratos', 'Transparência', 51)
on conflict (codigo) do nothing;

insert into public.perfil_permissoes (perfil_id, modulo, pode_ver, pode_editar, pode_publicar, pode_excluir)
select perfil_id, 'contratos', pode_ver, pode_editar, pode_publicar, pode_excluir
from public.perfil_permissoes where modulo = 'licitacoes'
on conflict (perfil_id, modulo) do nothing;


-- ---------------------------------------------------------------------
-- 2. CONTRATOS
-- ---------------------------------------------------------------------
create table if not exists public.contratos (
  id                 uuid primary key default gen_random_uuid(),
  orgao_id           uuid not null references public.orgaos(id) on delete cascade,
  -- Processo de origem (opcional). RESTRICT: não se apaga uma licitação que tem contrato.
  licitacao_id       uuid references public.licitacoes(id) on delete restrict,
  origem             text not null default 'portal' check (origem in ('portal', 'link', 'pncp')),
  tipo               text not null default 'contrato' check (tipo in ('contrato', 'ata_registro_precos', 'empenho', 'carta_contrato', 'outro')),
  numero             text,                         -- ex.: 015/2026
  ano                integer not null check (ano between 1990 and 2100),
  processo           text,
  objeto             text not null check (char_length(objeto) between 5 and 4000),
  contratado_nome    text not null check (char_length(contratado_nome) between 2 and 200),
  -- CNPJ ou CPF só com números. CPF aparece mascarado no site (LGPD).
  contratado_doc     text check (contratado_doc is null or contratado_doc ~ '^(\d{11}|\d{14})$'),
  unidade_nome       text,                         -- secretaria/unidade contratante
  valor_inicial      numeric(16, 2) check (valor_inicial is null or valor_inicial >= 0),
  data_assinatura    date not null default current_date,   -- não nulo: é a coluna da ordem/paginação
  vigencia_inicio    date,
  vigencia_fim       date,                         -- fim ORIGINAL
  rescindido_em      date,                         -- rescisão antecipada, se houver
  -- Mantidos pelo banco a partir dos aditivos (não editar à mão):
  valor_atual        numeric(16, 2),               -- valor inicial + acréscimos − supressões
  vigencia_fim_atual date,                         -- maior "nova vigência" dos aditivos
  arquivo_url        text,                         -- inteiro teor (PDF enviado)
  link_externo       text check (link_externo is null or link_externo ~* '^https?://'),
  pncp_controle      text,
  pncp_atualizado    timestamptz,
  situacao           text not null default 'rascunho' check (situacao in ('rascunho', 'publicado')),
  publicado_em       timestamptz,
  busca              text generated always as (public.normalizar_texto(
                       coalesce(numero, '') || ' ' || ano || ' ' || coalesce(processo, '') || ' ' || objeto || ' ' ||
                       contratado_nome || ' ' || coalesce(contratado_doc, '') || ' ' || coalesce(unidade_nome, ''))) stored,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  constraint contratos_link check (coalesce(origem <> 'link' or link_externo is not null, false)),
  constraint contratos_pncp check (coalesce(origem <> 'pncp' or pncp_controle is not null, false)),
  constraint contratos_vigencia check (coalesce(vigencia_inicio is null or vigencia_fim is null or vigencia_fim >= vigencia_inicio, false))
);
-- Sem "where" pelo mesmo motivo das licitações (upsert da importação).
create unique index if not exists contratos_pncp_uk on public.contratos (orgao_id, pncp_controle);
create index if not exists contratos_lista_idx on public.contratos (orgao_id, ano desc, data_assinatura desc, id desc);
create index if not exists contratos_vigencia_idx on public.contratos (orgao_id, vigencia_fim_atual);
create index if not exists contratos_licitacao_idx on public.contratos (licitacao_id);

-- valor_atual e vigencia_fim_atual partem do contrato até existirem aditivos.
create or replace function public.contrato_valores_iniciais()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.valor_inicial is distinct from old.valor_inicial or new.vigencia_fim is distinct from old.vigencia_fim then
    new.valor_atual := coalesce(new.valor_inicial, 0) + coalesce((select sum(a.valor) from public.contratos_aditivos a where a.contrato_id = new.id), 0);
    new.vigencia_fim_atual := greatest(new.vigencia_fim, (select max(a.nova_vigencia_fim) from public.contratos_aditivos a where a.contrato_id = new.id));
    if new.valor_inicial is null and not exists (select 1 from public.contratos_aditivos a where a.contrato_id = new.id) then new.valor_atual := null; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists contratos_publicacao on public.contratos;
create trigger contratos_publicacao before insert or update on public.contratos
  for each row execute function public.controlar_publicacao('contratos');
drop trigger if exists contratos_atualizado on public.contratos;
create trigger contratos_atualizado before update on public.contratos
  for each row execute function public.marcar_atualizacao();
drop trigger if exists contratos_historico on public.contratos;
create trigger contratos_historico after insert or update or delete on public.contratos
  for each row execute function public.registrar_historico();


-- ---------------------------------------------------------------------
-- 3. ADITIVOS (e apostilamentos, rescisão) e FISCAIS
-- ---------------------------------------------------------------------
create table if not exists public.contratos_aditivos (
  id               uuid primary key default gen_random_uuid(),
  contrato_id      uuid not null references public.contratos(id) on delete cascade,
  orgao_id         uuid not null references public.orgaos(id) on delete cascade,
  numero           text,                           -- ex.: 1º Termo Aditivo
  tipo             text not null default 'prazo' check (tipo in ('prazo', 'valor', 'prazo_valor', 'qualitativo', 'apostilamento', 'rescisao', 'outro')),
  data_assinatura  date not null default current_date,
  descricao        text,
  valor            numeric(16, 2),                 -- acréscimo (+) ou supressão (−)
  nova_vigencia_fim date,
  arquivo_url      text,
  link_externo     text check (link_externo is null or link_externo ~* '^https?://'),
  origem           text not null default 'portal' check (origem in ('portal', 'pncp')),
  pncp_sequencial  integer,
  criado_em        timestamptz not null default now()
);
create index if not exists contratos_aditivos_idx on public.contratos_aditivos (contrato_id, data_assinatura);

create table if not exists public.contratos_fiscais (
  id           uuid primary key default gen_random_uuid(),
  contrato_id  uuid not null references public.contratos(id) on delete cascade,
  orgao_id     uuid not null references public.orgaos(id) on delete cascade,
  nome         text not null check (char_length(nome) between 3 and 150),
  funcao       text not null default 'fiscal' check (funcao in ('gestor', 'fiscal', 'fiscal_tecnico', 'fiscal_administrativo', 'fiscal_suplente')),
  ato          text,                               -- portaria de designação
  inicio       date,
  fim          date,
  busca        text generated always as (public.normalizar_texto(nome || ' ' || coalesce(ato, ''))) stored,
  criado_em    timestamptz not null default now()
);
create index if not exists contratos_fiscais_idx on public.contratos_fiscais (orgao_id, nome);
create index if not exists contratos_fiscais_contrato_idx on public.contratos_fiscais (contrato_id);

-- Regras dos filhos (aditivo/fiscal), iguais às dos documentos de licitação:
--   · mesmo órgão do contrato;
--   · mexer em filho de contrato JÁ PUBLICADO exige permissão de publicar.
create or replace function public.validar_filho_contrato()
returns trigger language plpgsql set search_path = public as $$
declare
  v_contrato uuid := coalesce(new.contrato_id, old.contrato_id);
  v_orgao uuid := coalesce(new.orgao_id, old.orgao_id);
  v_situacao text;
begin
  select c.situacao into v_situacao from public.contratos c where c.id = v_contrato and c.orgao_id = v_orgao;
  if v_situacao is null then
    if tg_op = 'DELETE' then return old; end if;   -- exclusão em cascata
    raise exception 'O registro não pertence a um contrato deste órgão.';
  end if;
  if current_user in ('anon', 'authenticated') and v_situacao = 'publicado'
     and not public.tem_permissao(v_orgao, 'contratos', 'publicar') then
    raise exception 'Este contrato está publicado. Só quem tem permissão de publicar altera aditivos e fiscais dele.';
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists contratos_aditivos_validar on public.contratos_aditivos;
create trigger contratos_aditivos_validar before insert or update or delete on public.contratos_aditivos
  for each row execute function public.validar_filho_contrato();
drop trigger if exists contratos_fiscais_validar on public.contratos_fiscais;
create trigger contratos_fiscais_validar before insert or update or delete on public.contratos_fiscais
  for each row execute function public.validar_filho_contrato();

-- Aditivo mudou → recalcula valor e vigência atuais do contrato.
-- SECURITY DEFINER: é cálculo do próprio banco (quem mexeu no aditivo já
-- passou pela regra acima); assim o recálculo não esbarra na regra de publicação.
create or replace function public.recalcular_contrato()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := coalesce(new.contrato_id, old.contrato_id);
begin
  update public.contratos c set
    valor_atual = case when c.valor_inicial is null and not exists (select 1 from public.contratos_aditivos a where a.contrato_id = v_id and a.valor is not null)
                       then null
                       else coalesce(c.valor_inicial, 0) + coalesce((select sum(a.valor) from public.contratos_aditivos a where a.contrato_id = v_id), 0) end,
    vigencia_fim_atual = greatest(c.vigencia_fim, (select max(a.nova_vigencia_fim) from public.contratos_aditivos a where a.contrato_id = v_id))
  where c.id = v_id;
  return null;
end;
$$;
drop trigger if exists contratos_aditivos_recalcular on public.contratos_aditivos;
create trigger contratos_aditivos_recalcular after insert or update or delete on public.contratos_aditivos
  for each row execute function public.recalcular_contrato();

drop trigger if exists contratos_valores on public.contratos;
create trigger contratos_valores before insert or update on public.contratos
  for each row execute function public.contrato_valores_iniciais();


-- ---------------------------------------------------------------------
-- 4. REGRAS DE ACESSO — contratos do órgão todo (sem alcance setorial)
-- ---------------------------------------------------------------------
alter table public.contratos enable row level security;
alter table public.contratos_aditivos enable row level security;
alter table public.contratos_fiscais enable row level security;

drop policy if exists "contratos: leitura" on public.contratos;
create policy "contratos: leitura" on public.contratos for select to anon, authenticated
  using (situacao = 'publicado' or public.e_membro(orgao_id));
drop policy if exists "contratos: inclusão" on public.contratos;
create policy "contratos: inclusão" on public.contratos for insert to authenticated
  with check (public.tem_permissao(orgao_id, 'contratos', 'editar') and public.no_alcance(orgao_id, null));
drop policy if exists "contratos: edição" on public.contratos;
create policy "contratos: edição" on public.contratos for update to authenticated
  using (public.tem_permissao(orgao_id, 'contratos', 'editar') and public.no_alcance(orgao_id, null))
  with check (public.tem_permissao(orgao_id, 'contratos', 'editar') and public.no_alcance(orgao_id, null));
drop policy if exists "contratos: exclusão" on public.contratos;
create policy "contratos: exclusão" on public.contratos for delete to authenticated
  using (public.tem_permissao(orgao_id, 'contratos', 'excluir') and public.no_alcance(orgao_id, null));

do $$
declare t text;
begin
  foreach t in array array['contratos_aditivos', 'contratos_fiscais'] loop
    execute format('drop policy if exists "%1$s: leitura" on public.%1$I', t);
    execute format('create policy "%1$s: leitura" on public.%1$I for select to anon, authenticated using (public.e_membro(orgao_id) or exists (select 1 from public.contratos c where c.id = contrato_id and c.situacao = ''publicado''))', t);
    execute format('drop policy if exists "%1$s: inclusão" on public.%1$I', t);
    execute format('create policy "%1$s: inclusão" on public.%1$I for insert to authenticated with check (public.tem_permissao(orgao_id, ''contratos'', ''editar'') and public.no_alcance(orgao_id, null))', t);
    execute format('drop policy if exists "%1$s: edição" on public.%1$I', t);
    execute format('create policy "%1$s: edição" on public.%1$I for update to authenticated using (public.tem_permissao(orgao_id, ''contratos'', ''editar'') and public.no_alcance(orgao_id, null)) with check (public.tem_permissao(orgao_id, ''contratos'', ''editar'') and public.no_alcance(orgao_id, null))', t);
    execute format('drop policy if exists "%1$s: exclusão" on public.%1$I', t);
    execute format('create policy "%1$s: exclusão" on public.%1$I for delete to authenticated using (public.tem_permissao(orgao_id, ''contratos'', ''editar'') and public.no_alcance(orgao_id, null))', t);
  end loop;
end $$;

grant select on public.contratos, public.contratos_aditivos, public.contratos_fiscais to anon;
grant select, insert, update, delete on public.contratos, public.contratos_aditivos, public.contratos_fiscais to authenticated;
-- Importação automática do PNCP (função pncp-sincronizar):
grant select, insert, update, delete on public.contratos, public.contratos_aditivos, public.contratos_fiscais to service_role;


-- ---------------------------------------------------------------------
-- 5. EXERCÍCIOS COM CONTRATOS (abas de ano)
-- ---------------------------------------------------------------------
create or replace function public.contratos_anos(p_orgao uuid)
returns table (ano integer, total bigint)
language sql stable security invoker set search_path = public as $$
  select c.ano, count(*) from public.contratos c where c.orgao_id = p_orgao group by c.ano order by c.ano desc;
$$;
grant execute on function public.contratos_anos(uuid) to anon, authenticated;
