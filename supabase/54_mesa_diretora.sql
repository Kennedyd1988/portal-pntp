-- =====================================================================
-- Script 54 — Mesa Diretora por legislatura e período (0.49.0)
-- Antes, a Mesa era só o campo de texto "Cargo na Mesa Diretora" de cada vereador, sem histórico.
-- Agora (Atividade legislativa › Mesa Diretora):
--   mesa_periodos  — cada composição da Mesa: legislatura (anos), período (datas; padrão biênio,
--                    pode ser outro conforme o Regimento), nome ("1º biênio"…) e o ato da eleição.
--   mesa_membros   — vereador + cargo + ordem em cada período (peças internas do período).
-- Os cargos já preenchidos nos vereadores viram o período atual (uma vez só, se o órgão ainda
-- não tiver nenhum período). A coluna parlamentares.cargo_mesa fica sem uso (não é mais lida).
-- Pode rodar mais de uma vez.
-- =====================================================================

create table if not exists public.mesa_periodos (
  id                 uuid primary key default gen_random_uuid(),
  orgao_id           uuid not null references public.orgaos(id) on delete cascade,
  legislatura_inicio integer not null check (legislatura_inicio between 1900 and 2100),
  legislatura_fim    integer not null check (legislatura_fim between 1900 and 2100),
  inicio             date not null,
  fim                date not null,
  nome               text check (nome is null or char_length(nome) <= 80),          -- "1º biênio", "Sessão legislativa 2025"…
  ato_descricao      text check (ato_descricao is null or char_length(ato_descricao) <= 300),  -- "Ata da sessão de eleição de 01/01/2025"
  ato_url            text check (ato_url is null or char_length(ato_url) <= 1000),
  observacoes        text check (observacoes is null or char_length(observacoes) <= 2000),
  situacao           text not null default 'rascunho' check (situacao in ('rascunho', 'publicado')),
  publicado_em       timestamptz,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  constraint mesa_periodos_leg check (legislatura_fim >= legislatura_inicio),
  constraint mesa_periodos_datas check (fim >= inicio)
);
create index if not exists mesa_periodos_orgao_idx on public.mesa_periodos (orgao_id, inicio desc);

create table if not exists public.mesa_membros (
  id             uuid primary key default gen_random_uuid(),
  orgao_id       uuid not null references public.orgaos(id) on delete cascade,
  periodo_id     uuid not null references public.mesa_periodos(id) on delete no action,   -- sai por excluir_com_pecas
  parlamentar_id uuid not null references public.parlamentares(id) on delete restrict,
  cargo          text not null check (char_length(cargo) between 2 and 80),
  ordem          integer not null default 0,
  criado_em      timestamptz not null default now(),
  constraint mesa_membros_uk unique (periodo_id, parlamentar_id)
);
create index if not exists mesa_membros_periodo_idx on public.mesa_membros (periodo_id, ordem);
create index if not exists mesa_membros_parlamentar_idx on public.mesa_membros (parlamentar_id);

comment on column public.parlamentares.cargo_mesa is 'Sem uso desde o script 54 (0.49.0): a Mesa Diretora fica em mesa_periodos/mesa_membros.';

-- Período dentro da legislatura e sem sobreposição com outro período do mesmo órgão.
create or replace function public.validar_mesa_periodo()
returns trigger language plpgsql set search_path = public as $$
begin
  if extract(year from new.inicio)::int < new.legislatura_inicio or extract(year from new.fim)::int > new.legislatura_fim then
    raise exception 'O período da Mesa (% a %) precisa ficar dentro da legislatura %–%.',
      to_char(new.inicio, 'DD/MM/YYYY'), to_char(new.fim, 'DD/MM/YYYY'), new.legislatura_inicio, new.legislatura_fim;
  end if;
  if exists (select 1 from public.mesa_periodos x
             where x.orgao_id = new.orgao_id and x.id <> new.id and x.inicio <= new.fim and x.fim >= new.inicio) then
    raise exception 'Já existe outra composição da Mesa nesse intervalo de datas. Ajuste o início e o fim.';
  end if;
  return new;
end $$;
drop trigger if exists mesa_periodos_validar on public.mesa_periodos;
create trigger mesa_periodos_validar before insert or update on public.mesa_periodos
  for each row execute function public.validar_mesa_periodo();

-- Filho no mesmo órgão do pai; vereador do mesmo órgão (inclui mesa_membros).
create or replace function public.conferir_orgao_legislativo()
returns trigger language plpgsql set search_path = public as $$
declare v uuid; j jsonb := to_jsonb(new);
begin
  -- to_jsonb: cada tabela tem uma coluna de pai diferente (o "new" não tem as das outras).
  v := case tg_table_name
    when 'comissoes_membros'    then (select orgao_id from public.comissoes where id = (j ->> 'comissao_id')::uuid)
    when 'mesa_membros'         then (select orgao_id from public.mesa_periodos where id = (j ->> 'periodo_id')::uuid)
    when 'proposicoes_autores'  then (select orgao_id from public.proposicoes where id = (j ->> 'proposicao_id')::uuid)
    when 'proposicoes_tramites' then (select orgao_id from public.proposicoes where id = (j ->> 'proposicao_id')::uuid)
    when 'sessoes_presencas'    then (select orgao_id from public.sessoes where id = (j ->> 'sessao_id')::uuid)
    when 'votacoes'             then (select orgao_id from public.sessoes where id = (j ->> 'sessao_id')::uuid)
    when 'votacoes_votos'       then (select orgao_id from public.votacoes where id = (j ->> 'votacao_id')::uuid)
  end;
  if v is distinct from new.orgao_id then raise exception 'Registro de outro órgão.'; end if;
  if tg_table_name in ('comissoes_membros', 'mesa_membros', 'proposicoes_autores', 'sessoes_presencas', 'votacoes_votos')
     and not exists (select 1 from public.parlamentares p where p.id = (j ->> 'parlamentar_id')::uuid and p.orgao_id = new.orgao_id) then
    raise exception 'Parlamentar de outro órgão.';
  end if;
  return new;
end $$;

-- Gatilhos e regras de acesso (módulo 'legislativo'), no mesmo formato do script 34.
alter table public.mesa_periodos enable row level security;
alter table public.mesa_membros enable row level security;

drop trigger if exists mesa_periodos_publicacao on public.mesa_periodos;
create trigger mesa_periodos_publicacao before insert or update on public.mesa_periodos
  for each row execute function public.controlar_publicacao('legislativo');
drop trigger if exists mesa_periodos_atualizado on public.mesa_periodos;
create trigger mesa_periodos_atualizado before update on public.mesa_periodos
  for each row execute function public.marcar_atualizacao();
drop trigger if exists mesa_membros_orgao on public.mesa_membros;
create trigger mesa_membros_orgao before insert or update on public.mesa_membros
  for each row execute function public.conferir_orgao_legislativo();

drop policy if exists "mesa_periodos: leitura" on public.mesa_periodos;
create policy "mesa_periodos: leitura" on public.mesa_periodos for select to anon, authenticated
  using (situacao = 'publicado' or public.e_membro(orgao_id));
drop policy if exists "mesa_membros: leitura" on public.mesa_membros;
create policy "mesa_membros: leitura" on public.mesa_membros for select to anon, authenticated
  using (public.e_membro(orgao_id) or exists (select 1 from public.mesa_periodos x where x.id = periodo_id and x.situacao = 'publicado'));

do $$
declare t text;
begin
  foreach t in array array['mesa_periodos', 'mesa_membros'] loop
    execute format('drop trigger if exists %1$s_historico on public.%1$I', t);
    execute format('create trigger %1$s_historico after insert or update or delete on public.%1$I for each row execute function public.registrar_historico()', t);
    execute format('drop policy if exists "%1$s: inclusão" on public.%1$I', t);
    execute format('create policy "%1$s: inclusão" on public.%1$I for insert to authenticated with check (public.tem_permissao(orgao_id, ''legislativo'', ''editar'') and public.no_alcance(orgao_id, null))', t);
    execute format('drop policy if exists "%1$s: edição" on public.%1$I', t);
    execute format('create policy "%1$s: edição" on public.%1$I for update to authenticated using (public.tem_permissao(orgao_id, ''legislativo'', ''editar'') and public.no_alcance(orgao_id, null)) with check (public.tem_permissao(orgao_id, ''legislativo'', ''editar'') and public.no_alcance(orgao_id, null))', t);
    execute format('drop policy if exists "%1$s: exclusão" on public.%1$I', t);
    execute format('create policy "%1$s: exclusão" on public.%1$I for delete to authenticated using (public.tem_permissao(orgao_id, ''legislativo'', %2$L) and public.no_alcance(orgao_id, null))',
      t, case when t = 'mesa_periodos' then 'excluir' else 'editar' end);
    execute format('grant select on public.%I to anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Excluir o período leva junto os membros (peças internas).
create or replace function public.excluir_com_pecas(p_tabela text, p_id uuid)
returns text[] language plpgsql set search_path = public as $$
declare
  pecas text[][];
  p text[];
  arquivos text[] := '{}';
  a text[];
  n integer;
begin
  pecas := case p_tabela
    when 'licitacoes'             then array[array['licitacoes_documentos', 'licitacao_id']]
    when 'contratos'              then array[array['contratos_aditivos', 'contrato_id'], array['contratos_fiscais', 'contrato_id']]
    when 'obras'                  then array[array['obras_itens', 'obra_id'], array['obras_medicoes', 'obra_id'], array['obras_paralisacoes', 'obra_id']]
    when 'concursos'              then array[array['concursos_documentos', 'concurso_id']]
    when 'conselhos'              then array[array['conselhos_membros', 'conselho_id'], array['conselhos_documentos', 'conselho_id']]
    when 'renuncias'              then array[array['renuncias_valores', 'renuncia_id']]          -- beneficiários (16.3) continuam protegidos
    when 'saude_estabelecimentos' then array[array['saude_profissionais', 'estabelecimento_id']]
    when 'saude_medicamentos'     then array[array['saude_estoques', 'medicamento_id']]
    when 'despesas'               then array[array['despesas_movimentos', 'despesa_id']]
    when 'proposicoes'            then array[array['proposicoes_autores', 'proposicao_id'], array['proposicoes_tramites', 'proposicao_id']]
    when 'sessoes'                then array[array['sessoes_presencas', 'sessao_id']]
    when 'votacoes'               then array[array['votacoes_votos', 'votacao_id']]
    when 'comissoes'              then array[array['comissoes_membros', 'comissao_id']]
    when 'mesa_periodos'          then array[array['mesa_membros', 'periodo_id']]
    else null end;
  if pecas is null then raise exception 'Tabela não permitida: %', p_tabela; end if;
  -- Avisa os gatilhos das peças que o registro inteiro está saindo (ex.: edital da seleção publicada).
  perform set_config('pntp.excluindo', p_tabela || ':' || p_id, true);

  -- Sessão: as votações dela também são peças (com os votos).
  if p_tabela = 'sessoes' then
    delete from public.votacoes_votos where votacao_id in (select id from public.votacoes where sessao_id = p_id);
    delete from public.votacoes where sessao_id = p_id;
  end if;

  foreach p slice 1 in array pecas loop
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = p[1] and column_name = 'arquivo_url') then
      execute format('select coalesce(array_agg(arquivo_url) filter (where arquivo_url is not null), ''{}'') from public.%I where %I = $1', p[1], p[2]) into a using p_id;
      arquivos := arquivos || a;
    end if;
    execute format('delete from public.%I where %I = $1', p[1], p[2]) using p_id;
  end loop;

  execute format('delete from public.%I where id = $1', p_tabela) using p_id;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Seu perfil não pode excluir este registro.'; end if;   -- desfaz as peças também
  return arquivos;
end $$;

-- Ordem padrão dos cargos (Presidente, vices, secretários, tesoureiro, demais).
create or replace function public.ordem_cargo_mesa(p_cargo text)
returns integer language sql immutable set search_path = public as $$
  select case
    when s ~ 'vice' then 20 + coalesce(nullif(substring(s from '(\d)'), '')::int, case when s ~ 'segund' then 2 when s ~ 'terceir' then 3 else 1 end)
    when s ~ 'presiden' then 10
    when s ~ 'secret' then 40 + coalesce(nullif(substring(s from '(\d)'), '')::int, case when s ~ 'segund' then 2 when s ~ 'terceir' then 3 when s ~ 'quart' then 4 else 1 end)
    when s ~ 'tesour' then 60
    when s ~ 'suplent' then 90
    else 80 end
  from (select lower(public.normalizar_texto(coalesce(p_cargo, ''))) as s) x;
$$;

-- Cargos que já estavam nos vereadores → período atual da Mesa (só órgãos sem nenhum período).
-- Legislatura municipal: 2021–2024, 2025–2028…; período = biênio que contém hoje.
do $$
declare
  o uuid;
  ano int := extract(year from current_date)::int;
  li int := ano - ((ano - 2021) % 4);
  b1 boolean := (ano - li) < 2;
  per uuid;
begin
  for o in select distinct p.orgao_id from public.parlamentares p
           where nullif(trim(p.cargo_mesa), '') is not null
             and not exists (select 1 from public.mesa_periodos m where m.orgao_id = p.orgao_id) loop
    insert into public.mesa_periodos (orgao_id, legislatura_inicio, legislatura_fim, inicio, fim, nome, situacao)
    values (o, li, li + 3,
            make_date(case when b1 then li else li + 2 end, 1, 1),
            make_date(case when b1 then li + 1 else li + 3 end, 12, 31),
            case when b1 then '1º biênio' else '2º biênio' end, 'publicado')
    returning id into per;
    insert into public.mesa_membros (orgao_id, periodo_id, parlamentar_id, cargo, ordem)
    select o, per, p.id, trim(p.cargo_mesa), public.ordem_cargo_mesa(p.cargo_mesa)
      from public.parlamentares p
     where p.orgao_id = o and nullif(trim(p.cargo_mesa), '') is not null;
  end loop;
end $$;

-- Composição da Mesa em vigor numa data (padrão: hoje), só do que está publicado.
create or replace function public.mesa_vigente(p_orgao uuid, p_data date default current_date)
returns table (parlamentar_id uuid, cargo text, ordem integer)
language sql stable set search_path = public as $$
  select m.parlamentar_id, m.cargo, m.ordem
    from public.mesa_periodos x join public.mesa_membros m on m.periodo_id = x.id
   where x.orgao_id = p_orgao and x.situacao = 'publicado' and p_data between x.inicio and x.fim
   order by m.ordem, m.cargo;
$$;
grant execute on function public.mesa_vigente(uuid, date) to anon, authenticated;
