-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 19 — Fase 2 · Lote 10: convênios, transferências e emendas
--             parlamentares (PNTP 5.1 a 5.3 e 17.1 a 17.3)
--
--   5.1 transferências RECEBIDAS: número/ano, valor total previsto, valor
--       recebido, objeto, vigência, órgão repassador e inteiro teor
--   5.2 transferências REALIZADAS: número/ano, beneficiário, objeto, vigência,
--       valor total previsto para repasse, valor concedido e inteiro teor
--       (a Cartilha pede que fiquem separadas das recebidas)
--   5.3 acordos SEM transferência de recursos: partes, número/ano, objeto,
--       vigência, obrigações ajustadas e inteiro teor
--   17.1 emendas FEDERAIS recebidas e 17.2 emendas ESTADUAIS e MUNICIPAIS
--       (no município: inclusive as aprovadas no próprio orçamento):
--       origem, forma de repasse, tipo, número, autoria, valor previsto e
--       realizado, objeto e função de governo
--   17.3 execução orçamentária e financeira das emendas recebidas e próprias
--       (empenhado, liquidado e pago)
--   Sem registros, o site declara expressamente que não há.
--
-- Módulos no painel:
--   convenios → "Convênios e transferências" (já existia desde o script 01;
--               só muda o nome; as renúncias de receita ficam para o lote de
--               receitas)
--   emendas   → "Emendas parlamentares" (novo; permissões copiadas de convenios)
--
-- Como usar: SQL Editor › New query › colar tudo › Run. Pode repetir.
-- Rodar DEPOIS dos scripts 01 a 18.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. MÓDULOS NO PAINEL
-- ---------------------------------------------------------------------
update public.modulos set nome = 'Convênios e transferências' where codigo = 'convenios';

insert into public.modulos (codigo, nome, grupo, ordem) values
  ('emendas', 'Emendas parlamentares', 'Transparência', 85)
on conflict (codigo) do nothing;

insert into public.perfil_permissoes (perfil_id, modulo, pode_ver, pode_editar, pode_publicar, pode_excluir)
select perfil_id, 'emendas', pode_ver, pode_editar, pode_publicar, pode_excluir
from public.perfil_permissoes
where modulo = 'convenios'
on conflict (perfil_id, modulo) do nothing;


-- ---------------------------------------------------------------------
-- 2. CONVÊNIOS E TRANSFERÊNCIAS (5.1, 5.2 e 5.3 numa tabela só)
--    tipo:  recebida    → o órgão recebe (parte = concedente/repassador)
--           realizada   → o órgão repassa (parte = beneficiário)
--           sem_repasse → acordo sem dinheiro (parte = demais partícipes)
-- ---------------------------------------------------------------------
create table if not exists public.convenios (
  id                  uuid primary key default gen_random_uuid(),
  orgao_id            uuid not null references public.orgaos(id) on delete cascade,
  tipo                text not null check (tipo in ('recebida', 'realizada', 'sem_repasse')),
  instrumento         text not null default 'convenio' check (instrumento in (
                        'convenio', 'contrato_repasse', 'termo_fomento', 'termo_colaboracao', 'acordo_cooperacao',
                        'termo_execucao_descentralizada', 'termo_compromisso', 'transferencia_especial', 'fundo_a_fundo',
                        'protocolo_intencoes', 'outro')),
  numero              text check (numero is null or char_length(numero) <= 40),        -- ex.: 912345/2025 (Transferegov)
  ano                 integer not null check (ano between 1990 and 2100),              -- abas de ano (assinatura; sem ela, início ou cadastro)
  processo            text check (processo is null or char_length(processo) <= 100),
  objeto              text not null check (char_length(objeto) between 5 and 2000),
  parte_nome          text not null check (char_length(parte_nome) between 2 and 500), -- concedente / beneficiário / partícipes
  parte_doc           text check (parte_doc is null or parte_doc ~ '^(\d{11}|\d{14})$'),
  esfera              text check (esfera is null or esfera in ('federal', 'estadual', 'municipal', 'privada', 'internacional')),
  unidade_nome        text check (unidade_nome is null or char_length(unidade_nome) <= 150),  -- secretaria executora
  programa            text check (programa is null or char_length(programa) <= 300),          -- programa / ação de origem
  valor_previsto      numeric(16, 2) check (valor_previsto is null or valor_previsto >= 0),      -- total previsto do repasse
  valor_contrapartida numeric(16, 2) check (valor_contrapartida is null or valor_contrapartida >= 0),
  valor_repassado     numeric(16, 2) check (valor_repassado is null or valor_repassado >= 0),   -- recebido (5.1) / concedido (5.2) até agora
  repasse_atualizado_em date,                                                                -- posição do valor repassado
  data_assinatura     date,
  vigencia_inicio     date,
  vigencia_fim        date,
  andamento           text not null default 'em_execucao' check (andamento in (
                        'em_execucao', 'concluido', 'prestacao_contas', 'contas_aprovadas', 'contas_rejeitadas', 'rescindido', 'cancelado')),
  obrigacoes          text check (obrigacoes is null or char_length(obrigacoes) <= 4000),   -- 5.3: obrigações de cada parte
  arquivo_url         text,                                                                  -- inteiro teor (PDF)
  link_externo        text check (link_externo is null or link_externo ~* '^https?://'),    -- inteiro teor (link)
  link_acompanhamento text check (link_acompanhamento is null or link_acompanhamento ~* '^https?://'),  -- ex.: Transferegov
  situacao            text not null default 'rascunho' check (situacao in ('rascunho', 'publicado')),
  publicado_em        timestamptz,
  busca               text generated always as (public.normalizar_texto(
                        coalesce(numero, '') || ' ' || objeto || ' ' || parte_nome || ' ' || coalesce(parte_doc, '') || ' ' ||
                        coalesce(processo, '') || ' ' || coalesce(unidade_nome, '') || ' ' || coalesce(programa, ''))) stored,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),
  -- coalesce(…, false): numa regra CHECK, resultado nulo conta como aprovado.
  constraint convenios_vigencia check (coalesce(vigencia_inicio is null or vigencia_fim is null or vigencia_fim >= vigencia_inicio, false)),
  constraint convenios_sem_valor check (coalesce(tipo <> 'sem_repasse' or (valor_previsto is null and valor_repassado is null and valor_contrapartida is null), false)),
  -- Publicado precisa do inteiro teor (exigido em 5.1, 5.2 e 5.3).
  constraint convenios_documento check (coalesce(situacao = 'rascunho' or arquivo_url is not null or link_externo is not null, false))
);
create index if not exists convenios_lista_idx on public.convenios (orgao_id, tipo, ano desc, atualizado_em desc, id desc);
create index if not exists convenios_vigencia_idx on public.convenios (orgao_id, tipo, vigencia_fim);
create unique index if not exists convenios_numero_uk on public.convenios (orgao_id, tipo, instrumento, numero, ano) where numero is not null;

create or replace function public.convenio_ano()
returns trigger language plpgsql set search_path = public as $$
begin
  new.ano := extract(year from coalesce(new.data_assinatura, new.vigencia_inicio, new.criado_em, now()))::integer;
  return new;
end;
$$;
drop trigger if exists convenios_ano on public.convenios;
create trigger convenios_ano before insert or update on public.convenios
  for each row execute function public.convenio_ano();

drop trigger if exists convenios_publicacao on public.convenios;
create trigger convenios_publicacao before insert or update on public.convenios
  for each row execute function public.controlar_publicacao('convenios');
drop trigger if exists convenios_atualizado on public.convenios;
create trigger convenios_atualizado before update on public.convenios
  for each row execute function public.marcar_atualizacao();
drop trigger if exists convenios_historico on public.convenios;
create trigger convenios_historico after insert or update or delete on public.convenios
  for each row execute function public.registrar_historico();


-- ---------------------------------------------------------------------
-- 3. EMENDAS PARLAMENTARES (17.1, 17.2 e 17.3)
--    Uma linha por emenda indicada ao órgão (federal, estadual) ou aprovada
--    no orçamento do próprio município (municipal, emendas dos vereadores).
-- ---------------------------------------------------------------------
create table if not exists public.emendas (
  id               uuid primary key default gen_random_uuid(),
  orgao_id         uuid not null references public.orgaos(id) on delete cascade,
  exercicio        integer not null check (exercicio between 2000 and 2100),   -- ano do orçamento da emenda
  origem           text not null check (origem in ('federal', 'estadual', 'municipal')),
  tipo             text not null default 'individual' check (tipo in ('individual', 'bancada', 'comissao', 'relator', 'outra')),
  forma_repasse    text not null default 'finalidade_definida' check (forma_repasse in (
                     'transferencia_especial', 'finalidade_definida', 'fundo_a_fundo', 'convenio', 'execucao_propria', 'outra')),
  numero           text not null check (char_length(numero) between 1 and 40),
  autor            text not null check (char_length(autor) between 2 and 200),  -- parlamentar, bancada ou comissão
  objeto           text not null check (char_length(objeto) between 5 and 2000),
  funcao           text not null check (funcao ~ '^(0[1-9]|1[0-9]|2[0-8]|99)$'), -- função de governo (Portaria MOG 42/1999)
  beneficiario     text check (beneficiario is null or char_length(beneficiario) <= 300),  -- quando repassada a entidade
  unidade_nome     text check (unidade_nome is null or char_length(unidade_nome) <= 150),
  valor_previsto   numeric(16, 2) not null check (valor_previsto >= 0),
  valor_realizado  numeric(16, 2) check (valor_realizado is null or valor_realizado >= 0),   -- recebido (federal/estadual) ou executado (própria)
  valor_empenhado  numeric(16, 2) check (valor_empenhado is null or valor_empenhado >= 0),   -- 17.3
  valor_liquidado  numeric(16, 2) check (valor_liquidado is null or valor_liquidado >= 0),
  valor_pago       numeric(16, 2) check (valor_pago is null or valor_pago >= 0),
  execucao_em      date,                                                                       -- posição da execução
  andamento        text not null default 'prevista' check (andamento in ('prevista', 'em_execucao', 'concluida', 'impedida', 'cancelada')),
  impedimento      text check (impedimento is null or char_length(impedimento) <= 1000),     -- motivo do impedimento técnico
  convenio_id      uuid references public.convenios(id) on delete restrict,                   -- RESTRICT: convênio de emenda não se apaga
  observacao       text check (observacao is null or char_length(observacao) <= 2000),
  arquivo_url      text,
  link_externo     text check (link_externo is null or link_externo ~* '^https?://'),          -- ex.: Transferegov, portal do parlamento
  situacao         text not null default 'rascunho' check (situacao in ('rascunho', 'publicado')),
  publicado_em     timestamptz,
  busca            text generated always as (public.normalizar_texto(
                     numero || ' ' || autor || ' ' || objeto || ' ' || coalesce(beneficiario, '') || ' ' ||
                     coalesce(unidade_nome, '') || ' ' || coalesce(observacao, ''))) stored,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  constraint emendas_liquidado check (coalesce(valor_liquidado is null or valor_empenhado is null or valor_liquidado <= valor_empenhado, false)),
  constraint emendas_pago check (coalesce(valor_pago is null or valor_liquidado is null or valor_pago <= valor_liquidado, false)),
  constraint emendas_impedida check (coalesce(andamento <> 'impedida' or impedimento is not null, false)),
  -- Transferência especial ("PIX") vai direto ao caixa do ente: não tem convênio.
  constraint emendas_pix_sem_convenio check (coalesce(forma_repasse <> 'transferencia_especial' or convenio_id is null, false))
);
create index if not exists emendas_lista_idx on public.emendas (orgao_id, exercicio desc, atualizado_em desc, id desc);
create index if not exists emendas_origem_idx on public.emendas (orgao_id, origem, exercicio);
create index if not exists emendas_convenio_idx on public.emendas (convenio_id);
create unique index if not exists emendas_numero_uk on public.emendas (orgao_id, origem, exercicio, numero);

-- O convênio ligado tem de ser do mesmo órgão e uma transferência recebida
-- (emendas próprias executadas por entidade usam "realizada").
create or replace function public.validar_emenda()
returns trigger language plpgsql set search_path = public as $$
declare
  v_tipo text;
begin
  if new.convenio_id is not null then
    select c.tipo into v_tipo from public.convenios c where c.id = new.convenio_id and c.orgao_id = new.orgao_id;
    if v_tipo is null then raise exception 'O convênio escolhido não é deste órgão.'; end if;
    if v_tipo = 'sem_repasse' then raise exception 'Acordo sem repasse de recursos não pode receber emenda.'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists emendas_validar on public.emendas;
create trigger emendas_validar before insert or update on public.emendas
  for each row execute function public.validar_emenda();

drop trigger if exists emendas_publicacao on public.emendas;
create trigger emendas_publicacao before insert or update on public.emendas
  for each row execute function public.controlar_publicacao('emendas');
drop trigger if exists emendas_atualizado on public.emendas;
create trigger emendas_atualizado before update on public.emendas
  for each row execute function public.marcar_atualizacao();
drop trigger if exists emendas_historico on public.emendas;
create trigger emendas_historico after insert or update or delete on public.emendas
  for each row execute function public.registrar_historico();


-- ---------------------------------------------------------------------
-- 4. REGRAS DE ACESSO — do órgão todo (sem alcance setorial), como contratos
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  m text;
begin
  foreach t in array array['convenios', 'emendas'] loop
    m := t;   -- o módulo tem o mesmo nome da tabela
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%1$s: leitura" on public.%1$I', t);
    execute format('create policy "%1$s: leitura" on public.%1$I for select to anon, authenticated using (situacao = ''publicado'' or public.e_membro(orgao_id))', t);
    execute format('drop policy if exists "%1$s: inclusão" on public.%1$I', t);
    execute format('create policy "%1$s: inclusão" on public.%1$I for insert to authenticated with check (public.tem_permissao(orgao_id, %2$L, ''editar'') and public.no_alcance(orgao_id, null))', t, m);
    execute format('drop policy if exists "%1$s: edição" on public.%1$I', t);
    execute format('create policy "%1$s: edição" on public.%1$I for update to authenticated using (public.tem_permissao(orgao_id, %2$L, ''editar'') and public.no_alcance(orgao_id, null)) with check (public.tem_permissao(orgao_id, %2$L, ''editar'') and public.no_alcance(orgao_id, null))', t, m);
    execute format('drop policy if exists "%1$s: exclusão" on public.%1$I', t);
    execute format('create policy "%1$s: exclusão" on public.%1$I for delete to authenticated using (public.tem_permissao(orgao_id, %2$L, ''excluir'') and public.no_alcance(orgao_id, null))', t, m);
  end loop;
end $$;

grant select on public.convenios, public.emendas to anon;
grant select, insert, update, delete on public.convenios, public.emendas to authenticated;


-- ---------------------------------------------------------------------
-- 5. ABAS DE ANO (site e painel)
-- ---------------------------------------------------------------------
create or replace function public.convenios_anos(p_orgao uuid, p_tipo text)
returns table (ano integer, total bigint)
language sql stable security invoker set search_path = public as $$
  select c.ano, count(*) from public.convenios c
  where c.orgao_id = p_orgao and c.tipo = p_tipo group by c.ano order by c.ano desc;
$$;
grant execute on function public.convenios_anos(uuid, text) to anon, authenticated;

-- Totais por exercício e origem: abas de ano e quadro-resumo do 17.3.
create or replace function public.emendas_anos(p_orgao uuid)
returns table (ano integer, total bigint, previsto numeric, realizado numeric, empenhado numeric, liquidado numeric, pago numeric)
language sql stable security invoker set search_path = public as $$
  select e.exercicio, count(*), sum(e.valor_previsto), coalesce(sum(e.valor_realizado), 0),
         coalesce(sum(e.valor_empenhado), 0), coalesce(sum(e.valor_liquidado), 0), coalesce(sum(e.valor_pago), 0)
  from public.emendas e where e.orgao_id = p_orgao group by e.exercicio order by e.exercicio desc;
$$;
grant execute on function public.emendas_anos(uuid) to anon, authenticated;
