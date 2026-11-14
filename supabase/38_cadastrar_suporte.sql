-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 38 — Suporte SOFT+ marcado pelo painel (0.28.0)
-- Antes a marca "Suporte SOFT+" (acesso a todos os órgãos da plataforma) só
-- mudava pelo SQL Editor. Agora quem JÁ É Suporte SOFT+ pode marcar ou tirar a
-- marca de outra pessoa na ficha dela (Usuários e permissões). Travas:
--   · só o Suporte SOFT+ chama; ninguém muda a própria marca;
--   · a plataforma nunca fica sem nenhum Suporte SOFT+ ativo;
--   · cada mudança fica no histórico.
-- O e-mail continua mudando só pelo SQL Editor. Pode rodar mais de uma vez.
-- =====================================================================

-- Quem é Suporte SOFT+ (só o próprio Suporte vê a lista).
create or replace function public.suportes_softplus()
returns table (usuario_id uuid)
language sql stable security definer set search_path = public as $$
  select u.id from public.usuarios u where u.suporte_softplus and public.e_suporte_softplus();
$$;
grant execute on function public.suportes_softplus() to authenticated;

create or replace function public.definir_suporte_softplus(p_usuario uuid, p_valor boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_antes boolean;
begin
  if not public.e_suporte_softplus() then
    raise exception 'Só o Suporte SOFT+ pode dar ou tirar o acesso de Suporte SOFT+.';
  end if;
  if p_usuario = auth.uid() then
    raise exception 'Ninguém altera o próprio acesso de Suporte SOFT+.';
  end if;
  select suporte_softplus into v_antes from public.usuarios where id = p_usuario;
  if v_antes is null then raise exception 'Pessoa não encontrada.'; end if;
  if v_antes = coalesce(p_valor, false) then return; end if;
  if not coalesce(p_valor, false)
     and not exists (select 1 from public.usuarios where suporte_softplus and id <> p_usuario) then
    raise exception 'A plataforma precisa de pelo menos um Suporte SOFT+.';
  end if;
  -- security definer: o gatilho proteger_campos_usuario só barra anon/authenticated.
  update public.usuarios set suporte_softplus = coalesce(p_valor, false) where id = p_usuario;
  insert into public.historico (orgao_id, tabela, registro_id, acao, usuario_id, dados_antes, dados_depois)
  values (null, 'usuarios', p_usuario::text, 'editar', auth.uid(),
          jsonb_build_object('suporte_softplus', v_antes), jsonb_build_object('suporte_softplus', coalesce(p_valor, false)));
end $$;
grant execute on function public.definir_suporte_softplus(uuid, boolean) to authenticated;

select 'suportes atuais' as item, count(*) from public.usuarios where suporte_softplus;
