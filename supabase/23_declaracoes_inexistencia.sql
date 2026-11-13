-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 23 — Declarações de inexistência por período
--
-- O PNTP pede que, quando não há o que publicar, o órgão declare isso
-- expressamente. A declaração pode valer para a situação atual ("o órgão
-- não tem estagiários") ou para um período: mês, bimestre, trimestre,
-- quadrimestre, semestre, ano ou um intervalo de datas ("não houve
-- concessão de diárias em março/2026").
--
--   1. Tabela declaracoes_inexistencia (uma linha por declaração).
--   2. O banco calcula o início e o fim de cada período e confere os dados.
--   3. secoes_setoriais.sem_ocorrencia passa a ser mantida pelo banco: é
--      verdadeira quando a parte tem declaração de "situação atual".
--   4. Declarações antigas (sim/não da parte) viram "situação atual".
--   5. partes_sem_dados(): partes com declaração atual ou de período que
--      termina há no máximo 30 dias — os avisos de prazo (scripts 21 e 22)
--      não cobram atualização delas.
--
-- Como usar: SQL Editor › New query › colar tudo › Run. Pode repetir.
-- Rodar DEPOIS dos scripts 01 a 22 (o 21 e o 22 atualizados em 13/11/2026
-- às 16h, que chamam partes_sem_dados: quem rodou antes roda o 21, o 22 e
-- depois este).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. TABELA
-- ---------------------------------------------------------------------
create table if not exists public.declaracoes_inexistencia (
  id           uuid primary key default gen_random_uuid(),
  orgao_id     uuid not null references public.orgaos(id) on delete cascade,
  secao        text not null,                                   -- mesma chave de secoes_setoriais e dos destinos
  abrangencia  text not null check (abrangencia in ('atual', 'mes', 'bimestre', 'trimestre', 'quadrimestre', 'semestre', 'ano', 'periodo')),
  exercicio    integer check (exercicio is null or exercicio between 1990 and 2100),
  numero       integer check (numero is null or numero between 1 and 12),   -- mês, bimestre, trimestre… do exercício
  data_inicio  date,                                            -- calculadas pelo banco (exceto "periodo", informadas)
  data_fim     date,
  texto        text not null check (char_length(texto) between 10 and 500),
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint declaracoes_inexistencia_datas check (data_fim is null or data_inicio is null or data_fim >= data_inicio)
);
create unique index if not exists declaracoes_inexistencia_uk on public.declaracoes_inexistencia
  (orgao_id, secao, abrangencia, coalesce(exercicio, 0), coalesce(numero, 0), coalesce(data_inicio, date '1900-01-01'));
create index if not exists declaracoes_inexistencia_idx on public.declaracoes_inexistencia (orgao_id, secao, data_fim desc);


-- ---------------------------------------------------------------------
-- 2. PERÍODO: o banco confere e calcula as datas
-- ---------------------------------------------------------------------
create or replace function public.preparar_declaracao()
returns trigger language plpgsql set search_path = public as $$
declare
  meses int;
  maximo int;
begin
  -- A parte precisa ser uma das chaves aceitas em secoes_setoriais (mesma lista).
  if not exists (select 1 from pg_constraint c
                 where c.conrelid = 'public.secoes_setoriais'::regclass and c.conname = 'secoes_setoriais_secao_check'
                   and pg_get_constraintdef(c.oid) like '%''' || new.secao || '''%') then
    raise exception 'Parte desconhecida: %', new.secao;
  end if;
  new.texto := btrim(new.texto);
  if new.abrangencia = 'atual' then
    new.exercicio := null; new.numero := null; new.data_inicio := null; new.data_fim := null;
    return new;
  end if;
  if new.abrangencia = 'periodo' then
    if new.data_inicio is null or new.data_fim is null then raise exception 'Informe o início e o fim do período.'; end if;
    new.exercicio := extract(year from new.data_inicio)::int; new.numero := null;
    return new;
  end if;
  if new.exercicio is null then raise exception 'Informe o exercício (ano) da declaração.'; end if;
  meses := case new.abrangencia when 'mes' then 1 when 'bimestre' then 2 when 'trimestre' then 3
                                when 'quadrimestre' then 4 when 'semestre' then 6 else 12 end;
  if new.abrangencia = 'ano' then new.numero := null;
  else
    maximo := 12 / meses;
    if new.numero is null or new.numero < 1 or new.numero > maximo then
      raise exception 'Escolha o % (de 1 a %).', case new.abrangencia when 'mes' then 'mês' else new.abrangencia end, maximo;
    end if;
  end if;
  new.data_inicio := make_date(new.exercicio, (coalesce(new.numero, 1) - 1) * meses + 1, 1);
  new.data_fim := (new.data_inicio + make_interval(months => meses) - interval '1 day')::date;
  return new;
end;
$$;
drop trigger if exists declaracoes_inexistencia_preparar on public.declaracoes_inexistencia;
create trigger declaracoes_inexistencia_preparar before insert or update on public.declaracoes_inexistencia
  for each row execute function public.preparar_declaracao();
drop trigger if exists declaracoes_inexistencia_atualizado on public.declaracoes_inexistencia;
create trigger declaracoes_inexistencia_atualizado before update on public.declaracoes_inexistencia
  for each row execute function public.marcar_atualizacao();
drop trigger if exists declaracoes_inexistencia_historico on public.declaracoes_inexistencia;
create trigger declaracoes_inexistencia_historico after insert or update or delete on public.declaracoes_inexistencia
  for each row execute function public.registrar_historico();


-- ---------------------------------------------------------------------
-- 3. secoes_setoriais.sem_ocorrencia acompanha a declaração "situação atual"
-- ---------------------------------------------------------------------
-- security definer: quem grava a declaração já passou pela regra de acesso da
-- própria tabela (mesmo módulo); aqui só se espelha o sim/não na seção.
create or replace function public.espelhar_declaracao_atual()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  for r in select distinct x.orgao_id, x.secao from (
             select new.orgao_id, new.secao where tg_op <> 'DELETE'
             union all select old.orgao_id, old.secao where tg_op <> 'INSERT') x loop
    insert into public.secoes_setoriais (orgao_id, secao, sem_ocorrencia)
    values (r.orgao_id, r.secao, exists (select 1 from public.declaracoes_inexistencia d
                                          where d.orgao_id = r.orgao_id and d.secao = r.secao and d.abrangencia = 'atual'))
    on conflict (orgao_id, secao) do update set sem_ocorrencia = excluded.sem_ocorrencia
      where public.secoes_setoriais.sem_ocorrencia is distinct from excluded.sem_ocorrencia;
  end loop;
  return null;
end;
$$;
revoke all on function public.espelhar_declaracao_atual() from public, anon, authenticated;
drop trigger if exists declaracoes_inexistencia_espelho on public.declaracoes_inexistencia;
create trigger declaracoes_inexistencia_espelho after insert or update or delete on public.declaracoes_inexistencia
  for each row execute function public.espelhar_declaracao_atual();


-- ---------------------------------------------------------------------
-- 4. DECLARAÇÕES ANTIGAS (sim/não da parte) viram "situação atual"
-- ---------------------------------------------------------------------
insert into public.declaracoes_inexistencia (orgao_id, secao, abrangencia, texto, criado_em, atualizado_em)
select s.orgao_id, s.secao, 'atual',
       'Não há dados a publicar nesta parte (declaração registrada em ' || to_char(s.atualizado_em at time zone 'America/Fortaleza', 'DD/MM/YYYY') || ').',
       s.atualizado_em, s.atualizado_em
from public.secoes_setoriais s
where s.sem_ocorrencia
  and not exists (select 1 from public.declaracoes_inexistencia d where d.orgao_id = s.orgao_id and d.secao = s.secao and d.abrangencia = 'atual');


-- ---------------------------------------------------------------------
-- 5. ACESSO
-- ---------------------------------------------------------------------
alter table public.declaracoes_inexistencia enable row level security;
drop policy if exists "declaracoes_inexistencia: leitura" on public.declaracoes_inexistencia;
create policy "declaracoes_inexistencia: leitura" on public.declaracoes_inexistencia for select to anon, authenticated using (true);
drop policy if exists "declaracoes_inexistencia: inclusão" on public.declaracoes_inexistencia;
create policy "declaracoes_inexistencia: inclusão" on public.declaracoes_inexistencia for insert to authenticated
  with check (public.tem_permissao(orgao_id, public.modulo_setorial(secao), 'editar') and public.no_alcance(orgao_id, null));
drop policy if exists "declaracoes_inexistencia: edição" on public.declaracoes_inexistencia;
create policy "declaracoes_inexistencia: edição" on public.declaracoes_inexistencia for update to authenticated
  using (public.tem_permissao(orgao_id, public.modulo_setorial(secao), 'editar') and public.no_alcance(orgao_id, null))
  with check (public.tem_permissao(orgao_id, public.modulo_setorial(secao), 'editar') and public.no_alcance(orgao_id, null));
drop policy if exists "declaracoes_inexistencia: exclusão" on public.declaracoes_inexistencia;
create policy "declaracoes_inexistencia: exclusão" on public.declaracoes_inexistencia for delete to authenticated
  using (public.tem_permissao(orgao_id, public.modulo_setorial(secao), 'editar') and public.no_alcance(orgao_id, null));
grant select, insert, update, delete on public.declaracoes_inexistencia to authenticated;
grant select on public.declaracoes_inexistencia to anon;


-- ---------------------------------------------------------------------
-- 6. PARTES SEM DADOS (para os avisos de prazo)
-- ---------------------------------------------------------------------
-- Declaração atual, ou de período que terminou há no máximo 30 dias (ou ainda
-- não terminou): a parte está em dia mesmo sem registros novos.
create or replace function public.partes_sem_dados(p_orgao uuid)
returns setof text language sql stable security invoker set search_path = public as $$
  select distinct d.secao from public.declaracoes_inexistencia d
  where d.orgao_id = p_orgao and (d.abrangencia = 'atual' or d.data_fim >= current_date - 30)
  union
  select s.secao from public.secoes_setoriais s where s.orgao_id = p_orgao and s.sem_ocorrencia;
$$;
grant execute on function public.partes_sem_dados(uuid) to authenticated;
