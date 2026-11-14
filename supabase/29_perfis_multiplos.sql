-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 29 — Mais de um perfil por pessoa e perfis do sistema editáveis
--             pelo Suporte SOFT+ (0.22.0)
--
-- Rodar no SQL Editor DEPOIS do 28. Pode rodar mais de uma vez.
-- Se um dia rodar de novo o 01, 02, 05 ou 28, rode este 29 em seguida.
--
-- 1. Cada acesso (pessoa × órgão) tem o perfil principal e, se quiser,
--    perfis adicionais (usuarios_orgaos.perfis_extras). As permissões somam:
--    se qualquer um dos perfis permite, a pessoa pode. O Administrador do
--    órgão só pode ser o principal (ele já tem tudo); assim a regra "o órgão
--    nunca fica sem administrador" continua a mesma.
-- 2. Quem dá perfis adicionais segue as mesmas travas do principal (só
--    administrador dá perfil de administrador; quem não é administrador só
--    dá perfis iguais ou menores que os seus).
-- 3. Perfis padrão do sistema (valem para todos os órgãos): o Suporte SOFT+
--    pode editar nome, descrição e permissões. Os administradores dos órgãos
--    continuam usando "Criar cópia" para ter um perfil próprio.
-- =====================================================================

alter table public.usuarios_orgaos add column if not exists perfis_extras uuid[] not null default '{}';

-- Todos os perfis de um acesso (principal + adicionais).
create or replace function public.perfis_do_vinculo(v public.usuarios_orgaos)
returns uuid[] language sql immutable as $$
  select array[v.perfil_id] || coalesce(v.perfis_extras, '{}');
$$;

-- Permissão: soma dos perfis.
create or replace function public.tem_permissao(p_orgao uuid, p_modulo text, p_acao text)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  v public.usuarios_orgaos;
  r boolean;
begin
  if public.e_suporte_softplus() then return true; end if;
  v := public.vinculo_no_orgao(p_orgao);
  if v.id is null then return false; end if;
  select coalesce(bool_or(case p_acao when 'ver' then pp.pode_ver when 'editar' then pp.pode_editar
                                      when 'publicar' then pp.pode_publicar when 'excluir' then pp.pode_excluir else false end), false)
    into r
  from public.perfil_permissoes pp
  where pp.perfil_id = any (public.perfis_do_vinculo(v)) and pp.modulo = p_modulo;
  return r;
end;
$$;

create or replace function public.minhas_permissoes(p_orgao uuid)
returns table (modulo text, pode_ver boolean, pode_editar boolean, pode_publicar boolean, pode_excluir boolean)
language plpgsql stable security definer set search_path = public
as $$
declare v public.usuarios_orgaos;
begin
  if public.e_suporte_softplus() then
    return query select m.codigo, true, true, true, true from public.modulos m;
    return;
  end if;
  v := public.vinculo_no_orgao(p_orgao);
  if v.id is null then return; end if;
  return query
    select pp.modulo, bool_or(pp.pode_ver), bool_or(pp.pode_editar), bool_or(pp.pode_publicar), bool_or(pp.pode_excluir)
    from public.perfil_permissoes pp
    where pp.perfil_id = any (public.perfis_do_vinculo(v))
    group by pp.modulo;
end;
$$;

-- O perfil p_perfil cabe dentro da soma dos meus perfis neste órgão?
create or replace function public.perfil_cabe_no_meu(p_orgao uuid, p_perfil uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.e_admin_do_orgao(p_orgao) or not exists (
    select 1 from public.perfil_permissoes alvo
    left join lateral (
      select bool_or(m.pode_ver) v, bool_or(m.pode_editar) e, bool_or(m.pode_publicar) p, bool_or(m.pode_excluir) x
      from public.perfil_permissoes m
      where m.modulo = alvo.modulo and m.perfil_id = any (public.perfis_do_vinculo(public.vinculo_no_orgao(p_orgao)))) meu on true
    where alvo.perfil_id = p_perfil
      and ((alvo.pode_ver and not coalesce(meu.v, false)) or (alvo.pode_editar and not coalesce(meu.e, false))
        or (alvo.pode_publicar and not coalesce(meu.p, false)) or (alvo.pode_excluir and not coalesce(meu.x, false))));
$$;

-- Perfis adicionais: válidos para o órgão, sem administrador, sem repetir o principal,
-- e dentro do que quem grava pode dar. Devolve null quando pode.
create or replace function public.motivo_bloqueio_extras(p_orgao uuid, p_principal uuid, p_extras uuid[])
returns text language plpgsql stable security definer set search_path = public as $$
declare x uuid; pf public.perfis;
begin
  foreach x in array coalesce(p_extras, '{}') loop
    select * into pf from public.perfis where id = x;
    if not found or (pf.orgao_id is not null and pf.orgao_id <> p_orgao) then return 'Perfil adicional inválido para este órgão.'; end if;
    if pf.e_administrador then return 'O perfil de administrador só pode ser o perfil principal (ele já dá acesso a tudo).'; end if;
    if x = p_principal then return 'O perfil principal não precisa ser repetido nos adicionais.'; end if;
    if not public.perfil_cabe_no_meu(p_orgao, x) then
      return 'Você só pode dar perfis com permissões iguais ou menores que as do seu perfil (adicional "' || pf.nome || '").';
    end if;
  end loop;
  return null;
end;
$$;

-- Regras dos acessos com os perfis adicionais (inclusão, edição; exclusão continua a do 28).
drop policy if exists "usuarios_orgaos: inclusão" on public.usuarios_orgaos;
create policy "usuarios_orgaos: inclusão" on public.usuarios_orgaos
  for insert to authenticated
  with check (public.motivo_bloqueio_acesso(orgao_id, perfil_id, unidade_id, usuario_id) is null
              and public.motivo_bloqueio_extras(orgao_id, perfil_id, perfis_extras) is null);

drop policy if exists "usuarios_orgaos: edição" on public.usuarios_orgaos;
create policy "usuarios_orgaos: edição" on public.usuarios_orgaos
  for update to authenticated
  using (
    public.tem_permissao(orgao_id, 'usuarios', 'editar')
    and public.no_alcance(orgao_id, unidade_id)
    and (usuario_id <> auth.uid() or public.e_suporte_softplus())
    and (public.e_admin_do_orgao(orgao_id)
         or (not (select p.e_administrador from public.perfis p where p.id = perfil_id)
             and public.perfil_cabe_no_meu(orgao_id, perfil_id)
             and not exists (select 1 from unnest(perfis_extras) e where not public.perfil_cabe_no_meu(orgao_id, e))))
  )
  with check (public.motivo_bloqueio_acesso(orgao_id, perfil_id, unidade_id, usuario_id) is null
              and public.motivo_bloqueio_extras(orgao_id, perfil_id, perfis_extras) is null);

-- Proteção também para quem grava pelo servidor (sem RLS): administrador nunca como adicional.
create or replace function public.conferir_perfis_extras()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.perfis_extras := coalesce((select array_agg(distinct e) from unnest(new.perfis_extras) e where e <> new.perfil_id), '{}');
  if exists (select 1 from unnest(new.perfis_extras) e join public.perfis p on p.id = e
             where p.e_administrador or (p.orgao_id is not null and p.orgao_id <> new.orgao_id))
     or exists (select 1 from unnest(new.perfis_extras) e where not exists (select 1 from public.perfis p where p.id = e)) then
    raise exception 'Perfil adicional inválido: o de administrador só pode ser o principal, e o perfil precisa ser deste órgão.';
  end if;
  return new;
end;
$$;
drop trigger if exists usuarios_orgaos_perfis_extras on public.usuarios_orgaos;
create trigger usuarios_orgaos_perfis_extras
  before insert or update of perfil_id, perfis_extras on public.usuarios_orgaos
  for each row execute function public.conferir_perfis_extras();

-- Perfil em uso como adicional não pode ser excluído (como já acontece com o principal).
create or replace function public.bloquear_exclusao_perfil_em_uso()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.usuarios_orgaos uo where old.id = any (uo.perfis_extras)) then
    raise exception 'O perfil "%" está em uso como perfil adicional de alguém. Tire-o dessas pessoas antes de excluir.', old.nome;
  end if;
  return old;
end;
$$;
drop trigger if exists perfis_em_uso_extras on public.perfis;
create trigger perfis_em_uso_extras before delete on public.perfis
  for each row execute function public.bloquear_exclusao_perfil_em_uso();

-- Lista unificada com os perfis adicionais.
drop function if exists public.usuarios_unificados();
create or replace function public.usuarios_unificados()
returns table (vinculo_id uuid, usuario_id uuid, nome text, email text, orgao_id uuid, orgao text,
               perfil_id uuid, perfil text, e_administrador boolean, perfis_extras uuid[], perfis_extras_nomes text[],
               unidade_id uuid, unidade text, ativo boolean, pendente boolean, ultimo_acesso timestamptz, criado_em timestamptz)
language sql stable security definer set search_path = public as $$
  select uo.id, u.id, u.nome, u.email, o.id, o.nome, p.id, p.nome, p.e_administrador, uo.perfis_extras,
         coalesce((select array_agg(pe.nome order by pe.nome) from public.perfis pe where pe.id = any (uo.perfis_extras)), '{}'),
         un.id, un.nome, uo.ativo, (a.email_confirmed_at is null and a.last_sign_in_at is null), a.last_sign_in_at, uo.criado_em
  from public.orgaos_que_gerencio() g
  join public.orgaos o on o.id = g.id
  join public.usuarios_orgaos uo on uo.orgao_id = g.id
  join public.usuarios u on u.id = uo.usuario_id
  join public.perfis p on p.id = uo.perfil_id
  left join public.unidades un on un.id = uo.unidade_id
  left join auth.users a on a.id = u.id
  order by lower(coalesce(nullif(u.nome, ''), u.email)), o.nome;
$$;
grant execute on function public.usuarios_unificados() to authenticated;

-- "Seu perfil" no alto do painel: principal + adicionais.
create or replace function public.meus_orgaos()
returns table (id uuid, nome text, sigla text, tipo public.tipo_orgao, orgao_pai_id uuid, ativo boolean, perfil text)
language plpgsql stable security definer set search_path = public
as $$
begin
  if public.e_suporte_softplus() then
    return query select o.id, o.nome, o.sigla, o.tipo, o.orgao_pai_id, o.ativo, 'Suporte SOFT+'::text from public.orgaos o order by o.nome;
    return;
  end if;
  return query
    with v as (
      select uo.*, p.nome || coalesce((select ' + ' || string_agg(pe.nome, ' + ' order by pe.nome) from public.perfis pe where pe.id = any (uo.perfis_extras)), '') as rotulo
      from public.usuarios_orgaos uo join public.perfis p on p.id = uo.perfil_id
      where uo.usuario_id = auth.uid() and uo.ativo)
    select o.id, o.nome, o.sigla, o.tipo, o.orgao_pai_id, o.ativo, v.rotulo
    from v join public.orgaos o on o.id = v.orgao_id
    union
    select s.id, s.nome, s.sigla, s.tipo, s.orgao_pai_id, s.ativo, v.rotulo
    from v join public.orgaos s on s.orgao_pai_id = v.orgao_id
    where v.unidade_id is null
      and not exists (select 1 from public.usuarios_orgaos d where d.usuario_id = auth.uid() and d.orgao_id = s.id)
    order by 2;
end;
$$;

-- Perfis do sistema: o Suporte SOFT+ edita nome e descrição (as permissões já eram dele, script 05).
drop policy if exists "perfis: suporte edita perfis do sistema" on public.perfis;
create policy "perfis: suporte edita perfis do sistema" on public.perfis
  for update to authenticated
  using (orgao_id is null and public.e_suporte_softplus())
  with check (orgao_id is null and public.e_suporte_softplus());

-- Conferência
select 'acessos com perfis adicionais: ' || count(*) filter (where cardinality(perfis_extras) > 0) from public.usuarios_orgaos;
