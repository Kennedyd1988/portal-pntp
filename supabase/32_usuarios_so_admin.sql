-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 32 — Página de Usuários só para Administrador e Suporte SOFT+ (0.24.3)
--
-- Regra decidida em 14/11/2026: quem vê e mexe em usuários é o
-- Administrador do órgão e o Suporte SOFT+. O perfil padrão "Gestor de
-- conteúdo" vinha com "ver" em Usuários (script 01) e por isso enxergava a
-- página. Aqui:
--   1. tira Usuários de todos os perfis que não são de administrador
--      (padrão e criados pelos órgãos);
--   2. trava para o futuro: perfil que não é de administrador não recebe
--      permissão em Usuários (o banco recusa com mensagem clara);
--   3. o mesmo para "Migração do site antigo" (só Administrador e Suporte).
-- Pode rodar mais de uma vez.
-- =====================================================================

update public.perfil_permissoes pp
   set pode_ver = false, pode_editar = false, pode_publicar = false, pode_excluir = false
  from public.perfis p
 where p.id = pp.perfil_id
   and not p.e_administrador
   and pp.modulo in ('usuarios', 'migracao')
   and (pp.pode_ver or pp.pode_editar or pp.pode_publicar or pp.pode_excluir);

create or replace function public.conferir_permissao_restrita()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.modulo in ('usuarios', 'migracao')
     and (new.pode_ver or new.pode_editar or new.pode_publicar or new.pode_excluir)
     and not coalesce((select e_administrador from public.perfis where id = new.perfil_id), false) then
    raise exception 'Usuários e Migração ficam só com o perfil de Administrador (e o Suporte SOFT+).';
  end if;
  return new;
end $$;
drop trigger if exists perfil_permissoes_restrita on public.perfil_permissoes;
create trigger perfil_permissoes_restrita before insert or update on public.perfil_permissoes
  for each row execute function public.conferir_permissao_restrita();

-- Conferência: deve listar só perfis de administrador.
select p.nome as perfil, coalesce(o.nome, '(padrão do sistema)') as orgao, pp.modulo
  from public.perfil_permissoes pp
  join public.perfis p on p.id = pp.perfil_id
  left join public.orgaos o on o.id = p.orgao_id
 where pp.modulo in ('usuarios', 'migracao') and pp.pode_ver
 order by 2, 1, 3;
