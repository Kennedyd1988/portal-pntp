-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 02 — Funções usadas pelo painel + cadastro do órgão piloto
--             (Prefeitura Municipal de Riacho da Cruz/RN)
--
-- Como usar: Supabase › SQL Editor › New query › colar tudo › Run.
-- Pode ser executado mais de uma vez sem duplicar nada.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. ÓRGÃOS QUE O USUÁRIO LOGADO PODE ABRIR NO PAINEL
--    Vínculo direto + subsites dos órgãos onde ele tem alcance total.
--    Suporte SOFT+ vê todos.
-- ---------------------------------------------------------------------
create or replace function public.meus_orgaos()
returns table (
  id            uuid,
  nome          text,
  sigla         text,
  tipo          public.tipo_orgao,
  orgao_pai_id  uuid,
  ativo         boolean,
  perfil        text
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if public.e_suporte_softplus() then
    return query
      select o.id, o.nome, o.sigla, o.tipo, o.orgao_pai_id, o.ativo, 'Suporte SOFT+'::text
      from public.orgaos o
      order by o.nome;
    return;
  end if;

  return query
    -- vínculo direto
    select o.id, o.nome, o.sigla, o.tipo, o.orgao_pai_id, o.ativo, p.nome
    from public.usuarios_orgaos uo
    join public.orgaos o on o.id = uo.orgao_id
    join public.perfis p on p.id = uo.perfil_id
    where uo.usuario_id = auth.uid() and uo.ativo
    union
    -- subsites do órgão onde o usuário tem alcance total
    select s.id, s.nome, s.sigla, s.tipo, s.orgao_pai_id, s.ativo, p.nome
    from public.usuarios_orgaos uo
    join public.orgaos s on s.orgao_pai_id = uo.orgao_id
    join public.perfis p on p.id = uo.perfil_id
    where uo.usuario_id = auth.uid() and uo.ativo and uo.unidade_id is null
      and not exists (select 1 from public.usuarios_orgaos d
                      where d.usuario_id = auth.uid() and d.orgao_id = s.id)
    order by 2;
end;
$$;


-- ---------------------------------------------------------------------
-- 2. PERMISSÕES DO USUÁRIO LOGADO NUM ÓRGÃO (uma chamada só para montar o menu)
-- ---------------------------------------------------------------------
create or replace function public.minhas_permissoes(p_orgao uuid)
returns table (
  modulo        text,
  pode_ver      boolean,
  pode_editar   boolean,
  pode_publicar boolean,
  pode_excluir  boolean
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v public.usuarios_orgaos;
begin
  if public.e_suporte_softplus() then
    return query select m.codigo, true, true, true, true from public.modulos m;
    return;
  end if;

  v := public.vinculo_no_orgao(p_orgao);
  if v.id is null then
    return;
  end if;

  return query
    select pp.modulo, pp.pode_ver, pp.pode_editar, pp.pode_publicar, pp.pode_excluir
    from public.perfil_permissoes pp
    where pp.perfil_id = v.perfil_id;
end;
$$;

grant execute on function public.meus_orgaos() to authenticated;
grant execute on function public.minhas_permissoes(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 3. ÓRGÃO PILOTO
-- ---------------------------------------------------------------------
insert into public.orgaos (nome, tipo, cnpj, municipio, uf)
values ('Prefeitura Municipal de Riacho da Cruz', 'prefeitura', '08.153.454/0001-04', 'Riacho da Cruz', 'RN')
on conflict (cnpj) do nothing;

-- Vincula o Kennedy como Administrador do órgão piloto
-- (além de suporte SOFT+, para testar o painel como um administrador real veria).
insert into public.usuarios_orgaos (usuario_id, orgao_id, perfil_id)
select u.id, o.id, p.id
from public.usuarios u
cross join public.orgaos o
cross join public.perfis p
where u.email = 'kennedyfrancelino@gmail.com'
  and o.cnpj = '08.153.454/0001-04'
  and p.orgao_id is null
  and p.nome = 'Administrador do órgão'
on conflict (usuario_id, orgao_id) do nothing;

-- Conferência: deve aparecer uma linha com o órgão e o perfil.
select o.nome as orgao, p.nome as perfil, u.email
from public.usuarios_orgaos uo
join public.orgaos o   on o.id = uo.orgao_id
join public.perfis p   on p.id = uo.perfil_id
join public.usuarios u on u.id = uo.usuario_id;
