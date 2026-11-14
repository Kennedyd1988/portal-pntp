-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 28 — Página unificada de usuários (0.21.0)
--
-- Rodar no SQL Editor DEPOIS do 27. Pode rodar mais de uma vez.
-- (Se um dia rodar o 05 de novo, rode este 28 em seguida: ele reforça
--  a regra de acesso que o 05 cria.)
--
-- Uma pessoa = um login. Cada órgão em que ela atua é um vínculo (perfil,
-- alcance, ativo). A página "Usuários e permissões" passa a mostrar as
-- pessoas de todos os órgãos que quem está vendo gerencia:
--   · Suporte SOFT+ vê todo mundo;
--   · quem tem "Usuários: ver" no perfil (por padrão, só o Administrador
--     do órgão) vê as pessoas com vínculo nesses órgãos — e só os vínculos
--     desses órgãos (nunca fica sabendo dos outros);
--   · os demais perfis não veem a página.
-- Trava: quem não é administrador só dá (ou altera) perfil com permissões
-- iguais ou menores que as suas, e não mexe em quem tem mais poder.
-- =====================================================================

-- O perfil p_perfil cabe dentro do meu perfil neste órgão? (administrador e suporte: sempre)
create or replace function public.perfil_cabe_no_meu(p_orgao uuid, p_perfil uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.e_admin_do_orgao(p_orgao) or not exists (
    select 1 from public.perfil_permissoes alvo
    left join public.perfil_permissoes meu
      on meu.perfil_id = (public.vinculo_no_orgao(p_orgao)).perfil_id and meu.modulo = alvo.modulo
    where alvo.perfil_id = p_perfil
      and ((alvo.pode_ver and not coalesce(meu.pode_ver, false))
        or (alvo.pode_editar and not coalesce(meu.pode_editar, false))
        or (alvo.pode_publicar and not coalesce(meu.pode_publicar, false))
        or (alvo.pode_excluir and not coalesce(meu.pode_excluir, false))));
$$;

-- Regra única para dar ou alterar acesso (a mesma do script 05, com a trava de perfil maior).
create or replace function public.motivo_bloqueio_acesso(
  p_orgao uuid, p_perfil uuid, p_unidade uuid, p_usuario uuid default null)
returns text
language plpgsql stable security definer set search_path = public
as $$
declare
  pf public.perfis;
begin
  if not public.tem_permissao(p_orgao, 'usuarios', 'editar') then
    return 'Seu perfil não permite cadastrar ou alterar usuários neste órgão.';
  end if;
  select * into pf from public.perfis where id = p_perfil;
  if not found or (pf.orgao_id is not null and pf.orgao_id <> p_orgao) then
    return 'Perfil inválido para este órgão.';
  end if;
  if pf.e_administrador and not public.e_admin_do_orgao(p_orgao) then
    return 'Só um administrador do órgão pode dar o perfil de administrador.';
  end if;
  if not public.perfil_cabe_no_meu(p_orgao, p_perfil) then
    return 'Você só pode dar perfis com permissões iguais ou menores que as do seu perfil.';
  end if;
  if p_unidade is not null
     and not exists (select 1 from public.unidades u where u.id = p_unidade and u.orgao_id = p_orgao) then
    return 'A unidade escolhida não pertence a este órgão.';
  end if;
  if not public.no_alcance(p_orgao, p_unidade) then
    return 'Você só pode dar acesso à sua própria unidade.';
  end if;
  if p_usuario is not null and p_usuario = auth.uid() and not public.e_suporte_softplus() then
    return 'Você não pode alterar o seu próprio acesso. Peça a outro administrador.';
  end if;
  return null;
end;
$$;

-- Alterar ou excluir vínculo: além das regras do 05, quem não é administrador
-- não mexe em quem tem perfil com mais poder que o seu.
drop policy if exists "usuarios_orgaos: edição" on public.usuarios_orgaos;
create policy "usuarios_orgaos: edição" on public.usuarios_orgaos
  for update to authenticated
  using (
    public.tem_permissao(orgao_id, 'usuarios', 'editar')
    and public.no_alcance(orgao_id, unidade_id)
    and (usuario_id <> auth.uid() or public.e_suporte_softplus())
    and (public.e_admin_do_orgao(orgao_id)
         or (not (select p.e_administrador from public.perfis p where p.id = perfil_id)
             and public.perfil_cabe_no_meu(orgao_id, perfil_id)))
  )
  with check (public.motivo_bloqueio_acesso(orgao_id, perfil_id, unidade_id, usuario_id) is null);

drop policy if exists "usuarios_orgaos: exclusão" on public.usuarios_orgaos;
create policy "usuarios_orgaos: exclusão" on public.usuarios_orgaos
  for delete to authenticated
  using (
    public.tem_permissao(orgao_id, 'usuarios', 'excluir')
    and public.no_alcance(orgao_id, unidade_id)
    and (usuario_id <> auth.uid() or public.e_suporte_softplus())
    and (public.e_admin_do_orgao(orgao_id)
         or (not (select p.e_administrador from public.perfis p where p.id = perfil_id)
             and public.perfil_cabe_no_meu(orgao_id, perfil_id)))
  );

-- Órgãos cujos usuários eu vejo, com o que posso fazer em cada um.
drop function if exists public.orgaos_que_gerencio();
create or replace function public.orgaos_que_gerencio()
returns table (id uuid, nome text, sigla text, orgao_pai_id uuid, pode_editar boolean, pode_excluir boolean,
               e_admin boolean, minha_unidade uuid)
language sql stable security definer set search_path = public as $$
  select o.id, o.nome, o.sigla, o.orgao_pai_id,
         public.tem_permissao(o.id, 'usuarios', 'editar'), public.tem_permissao(o.id, 'usuarios', 'excluir'),
         public.e_admin_do_orgao(o.id),
         case when public.e_suporte_softplus() then null else (public.vinculo_no_orgao(o.id)).unidade_id end
  from public.orgaos o
  where o.ativo and public.tem_permissao(o.id, 'usuarios', 'ver')
  order by o.orgao_pai_id nulls first, o.nome;
$$;
grant execute on function public.orgaos_que_gerencio() to authenticated;

create or replace function public.pode_gerir_usuarios()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.orgaos_que_gerencio());
$$;
grant execute on function public.pode_gerir_usuarios() to authenticated;

-- Todos os vínculos que eu posso ver, um por linha (a tela agrupa por pessoa).
-- Vínculos com órgãos que eu não gerencio não aparecem.
drop function if exists public.usuarios_unificados();
create or replace function public.usuarios_unificados()
returns table (vinculo_id uuid, usuario_id uuid, nome text, email text, orgao_id uuid, orgao text,
               perfil_id uuid, perfil text, e_administrador boolean, unidade_id uuid, unidade text,
               ativo boolean, pendente boolean, ultimo_acesso timestamptz, criado_em timestamptz)
language sql stable security definer set search_path = public as $$
  select uo.id, u.id, u.nome, u.email, o.id, o.nome, p.id, p.nome, p.e_administrador, un.id, un.nome,
         uo.ativo, (a.email_confirmed_at is null and a.last_sign_in_at is null), a.last_sign_in_at, uo.criado_em
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

-- Quem pede gerencia TODOS os vínculos desta pessoa? (função de convite: link na mão
-- para quem nunca entrou e tem acesso a mais de um órgão, todos deste administrador)
create or replace function public.gerencia_todos_vinculos(p_usuario uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from public.usuarios_orgaos uo join public.perfis p on p.id = uo.perfil_id
    where uo.usuario_id = p_usuario
      and not (public.tem_permissao(uo.orgao_id, 'usuarios', 'editar')
               and (public.e_admin_do_orgao(uo.orgao_id) or not p.e_administrador)));
$$;
grant execute on function public.gerencia_todos_vinculos(uuid) to authenticated;

-- Conferência
select 'orgaos_que_gerencio: ' || count(*) from public.orgaos_que_gerencio();
