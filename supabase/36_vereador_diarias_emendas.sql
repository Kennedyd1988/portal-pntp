-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 36 — Vereador ligado às diárias e às emendas municipais (0.27.0)
-- Diária da Câmara pode indicar o vereador que a recebeu; emenda municipal
-- (cadastrada pela Prefeitura) pode indicar o vereador autor, da Câmara do
-- mesmo município. A página do vereador e a "Atividade dos vereadores"
-- (PNTP 20.11) passam a mostrar diárias e emendas de cada um.
-- Rodar depois do 34 e do 35. Pode rodar mais de uma vez.
-- =====================================================================

-- 1. Colunas (sem apagar junto: vereador com diária ou emenda não pode ser excluído)
alter table public.diarias add column if not exists parlamentar_id uuid references public.parlamentares(id) on delete no action;
alter table public.emendas add column if not exists parlamentar_id uuid references public.parlamentares(id) on delete no action;
create index if not exists diarias_parlamentar_idx on public.diarias (parlamentar_id, exercicio) where parlamentar_id is not null;
create index if not exists emendas_parlamentar_idx on public.emendas (parlamentar_id, exercicio) where parlamentar_id is not null;

-- O site lê diárias por coluna (o CPF fica fechado): libera a coluna nova.
do $$ begin
  if exists (select 1 from information_schema.column_privileges where table_schema = 'public' and table_name = 'diarias' and grantee = 'anon' and privilege_type = 'SELECT') then
    grant select (parlamentar_id) on public.diarias to anon;
  end if;
end $$;

-- 2. Conferência: diária só com vereador do mesmo órgão (a Câmara); emenda só municipal e com vereador
-- publicado da Câmara do mesmo município e UF da Prefeitura.
create or replace function public.conferir_parlamentar_vinculado()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.parlamentar_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.parlamentar_id is not distinct from old.parlamentar_id
     and (tg_table_name <> 'emendas' or new.origem is not distinct from old.origem) then
    return new;
  end if;
  if tg_table_name = 'diarias' then
    if not exists (select 1 from public.parlamentares p where p.id = new.parlamentar_id and p.orgao_id = new.orgao_id) then
      raise exception 'O vereador indicado não é desta Câmara.';
    end if;
  else
    if new.origem <> 'municipal' then
      raise exception 'Só emenda municipal se liga a um vereador.';
    end if;
    if not exists (
      select 1 from public.parlamentares p
        join public.orgaos c on c.id = p.orgao_id
        join public.orgaos o on o.id = new.orgao_id
       where p.id = new.parlamentar_id and p.situacao = 'publicado' and c.tipo = 'camara' and c.ativo
         and public.normalizar_texto(c.municipio) = public.normalizar_texto(o.municipio) and c.uf = o.uf) then
      raise exception 'O vereador precisa ser da Câmara do mesmo município (e estar publicado no site da Câmara).';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists diarias_parlamentar on public.diarias;
create trigger diarias_parlamentar before insert or update on public.diarias for each row execute function public.conferir_parlamentar_vinculado();
drop trigger if exists emendas_parlamentar on public.emendas;
create trigger emendas_parlamentar before insert or update on public.emendas for each row execute function public.conferir_parlamentar_vinculado();

-- 3. Vereadores que podem ser autores de emenda municipal do órgão (Câmara do mesmo município).
create or replace function public.vereadores_do_municipio(p_orgao uuid)
returns table (id uuid, nome text, nome_parlamentar text, partido text, em_exercicio boolean, camara text)
language sql stable security definer set search_path = public as $$
  select p.id, p.nome, p.nome_parlamentar, p.partido, p.em_exercicio, c.nome
    from public.orgaos o
    join public.orgaos c on c.tipo = 'camara' and c.ativo and c.uf = o.uf
                        and public.normalizar_texto(c.municipio) = public.normalizar_texto(o.municipio)
    join public.parlamentares p on p.orgao_id = c.id and p.situacao = 'publicado'
   where o.id = p_orgao and c.id <> o.id
   order by p.em_exercicio desc, coalesce(p.nome_parlamentar, p.nome);
$$;
grant execute on function public.vereadores_do_municipio(uuid) to authenticated;

-- 4. Atividade de cada vereador (20.11) com diárias e emendas municipais do ano.
drop function if exists public.atividade_parlamentar(uuid, integer);
create or replace function public.atividade_parlamentar(p_orgao uuid, p_ano integer)
returns table (parlamentar_id uuid, nome text, partido text, autorias bigint, relatorias bigint, sessoes bigint, presencas bigint, votos bigint, comissoes text,
               diarias bigint, diarias_valor numeric, emendas bigint, emendas_valor numeric)
language sql stable security invoker set search_path = public as $$
  select p.id, coalesce(p.nome_parlamentar, p.nome), p.partido,
    (select count(*) from public.proposicoes_autores a join public.proposicoes x on x.id = a.proposicao_id
      where a.parlamentar_id = p.id and a.papel in ('autor', 'coautor') and x.ano = p_ano and x.situacao = 'publicado'),
    (select count(*) from public.proposicoes_autores a join public.proposicoes x on x.id = a.proposicao_id
      where a.parlamentar_id = p.id and a.papel = 'relator' and x.ano = p_ano and x.situacao = 'publicado'),
    (select count(*) from public.sessoes_presencas sp join public.sessoes s on s.id = sp.sessao_id
      where sp.parlamentar_id = p.id and extract(year from s.data)::int = p_ano and s.situacao = 'publicado'),
    (select count(*) from public.sessoes_presencas sp join public.sessoes s on s.id = sp.sessao_id
      where sp.parlamentar_id = p.id and sp.presente and extract(year from s.data)::int = p_ano and s.situacao = 'publicado'),
    (select count(*) from public.votacoes_votos vv join public.votacoes v on v.id = vv.votacao_id join public.sessoes s on s.id = v.sessao_id
      where vv.parlamentar_id = p.id and vv.voto in ('sim', 'nao', 'abstencao') and extract(year from s.data)::int = p_ano and s.situacao = 'publicado'),
    (select string_agg(c.nome || case m.funcao when 'membro' then '' else ' (' || replace(m.funcao, '_', '-') || ')' end, '; ' order by c.nome)
       from public.comissoes_membros m join public.comissoes c on c.id = m.comissao_id where m.parlamentar_id = p.id and c.situacao = 'publicado' and c.ativa),
    (select count(*) from public.diarias d where d.parlamentar_id = p.id and d.exercicio = p_ano),
    (select coalesce(sum(d.valor_total), 0) from public.diarias d where d.parlamentar_id = p.id and d.exercicio = p_ano),
    (select count(*) from public.emendas e where e.parlamentar_id = p.id and e.exercicio = p_ano and e.situacao = 'publicado'),
    (select coalesce(sum(e.valor_previsto), 0) from public.emendas e where e.parlamentar_id = p.id and e.exercicio = p_ano and e.situacao = 'publicado')
  from public.parlamentares p
  where p.orgao_id = p_orgao and p.situacao = 'publicado'
  order by p.em_exercicio desc, p.ordem, p.nome;
$$;
grant execute on function public.atividade_parlamentar(uuid, integer) to anon, authenticated;

-- 5. Ligação automática do que já existe: diária da Câmara cujo beneficiário tem o mesmo nome (civil ou
-- parlamentar) de um único vereador; emenda municipal cujo autor bate com um único vereador do município.
update public.diarias d set parlamentar_id = m.id
  from (select d2.id as diaria, min(p.id::text)::uuid as id
          from public.diarias d2 join public.parlamentares p on p.orgao_id = d2.orgao_id
           and public.normalizar_texto(d2.nome) in (public.normalizar_texto(p.nome), public.normalizar_texto(coalesce(p.nome_parlamentar, '')))
         where d2.parlamentar_id is null group by d2.id having count(*) = 1) m
 where d.id = m.diaria;
update public.emendas e set parlamentar_id = m.id
  from (select e2.id as emenda, min(v.id::text)::uuid as id
          from public.emendas e2 cross join lateral public.vereadores_do_municipio(e2.orgao_id) v
         where e2.parlamentar_id is null and e2.origem = 'municipal'
           and public.normalizar_texto(e2.autor) in (public.normalizar_texto(v.nome), public.normalizar_texto(coalesce(v.nome_parlamentar, '')),
                                                    public.normalizar_texto('vereador ' || coalesce(v.nome_parlamentar, v.nome)),
                                                    public.normalizar_texto('vereadora ' || coalesce(v.nome_parlamentar, v.nome)))
         group by e2.id having count(*) = 1) m
 where e.id = m.emenda;

select 'diarias ligadas' as item, count(*) from public.diarias where parlamentar_id is not null
union all select 'emendas ligadas', count(*) from public.emendas where parlamentar_id is not null;
