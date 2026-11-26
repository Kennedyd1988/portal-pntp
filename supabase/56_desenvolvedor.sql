-- =====================================================================
-- Script 56 — Marca "Desenvolvedor" e órgãos só do desenvolvedor (0.51.0)
-- Até aqui a marca Suporte SOFT+ dava a mesma força a toda a equipe. Agora:
--   usuarios.desenvolvedor       — marca de quem desenvolve o sistema (só muda pelo SQL Editor).
--   orgaos.somente_desenvolvedor — órgão de teste/homologação: só o Desenvolvedor vê e mexe.
--                                  Some da lista de órgãos, do painel, da API e do site público
--                                  de todos os outros, inclusive do Suporte SOFT+.
--   Dar ou tirar a marca Suporte SOFT+ passa a ser só do Desenvolvedor.
-- Pode rodar mais de uma vez.
-- =====================================================================

alter table public.usuarios add column if not exists desenvolvedor boolean not null default false;
alter table public.orgaos   add column if not exists somente_desenvolvedor boolean not null default false;
comment on column public.usuarios.desenvolvedor is 'Desenvolvedor do sistema: vê órgãos de teste e é o único que dá/tira a marca Suporte SOFT+. Só muda pelo SQL Editor.';
comment on column public.orgaos.somente_desenvolvedor is 'Órgão de teste/homologação: invisível para todos, menos para o Desenvolvedor.';

-- Desenvolvedor atual e órgão de teste atual.
update public.usuarios set desenvolvedor = true where email = 'kennedyfrancelino@gmail.com' and not desenvolvedor;
update public.orgaos set somente_desenvolvedor = true
 where nome = 'Câmara Municipal de Teste SOFT+ (homologação)' and not somente_desenvolvedor;

create or replace function public.e_desenvolvedor()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select u.desenvolvedor from public.usuarios u where u.id = auth.uid()), false);
$$;
grant execute on function public.e_desenvolvedor() to authenticated;

-- Órgão liberado para quem está logado (órgão comum, ou órgão de teste para o Desenvolvedor).
create or replace function public.orgao_liberado(p_orgao uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_orgao is null
      or not coalesce((select o.somente_desenvolvedor from public.orgaos o where o.id = p_orgao), false)
      or public.e_desenvolvedor();
$$;

-- Os campos novos só mudam pelo SQL Editor (ou pela função do Desenvolvedor abaixo).
create or replace function public.proteger_campos_usuario()
returns trigger language plpgsql as $$
begin
  if current_user in ('anon', 'authenticated')
     and (new.suporte_softplus is distinct from old.suporte_softplus
          or new.email is distinct from old.email
          or new.desenvolvedor is distinct from old.desenvolvedor) then
    raise exception 'Este campo não pode ser alterado pelo painel.';
  end if;
  return new;
end;
$$;

create or replace function public.proteger_orgao_teste()
returns trigger language plpgsql as $$
begin
  if current_user in ('anon', 'authenticated') and new.somente_desenvolvedor is distinct from old.somente_desenvolvedor
     and not public.e_desenvolvedor() then
    raise exception 'Só o Desenvolvedor marca ou desmarca órgão de teste.';
  end if;
  return new;
end;
$$;
drop trigger if exists orgaos_teste_protegido on public.orgaos;
create trigger orgaos_teste_protegido before update on public.orgaos
  for each row execute function public.proteger_orgao_teste();

-- Permissões: tudo passa a conferir se o órgão está liberado.
create or replace function public.e_membro(p_orgao uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.orgao_liberado(p_orgao)
     and (public.e_suporte_softplus() or (public.vinculo_no_orgao(p_orgao)).id is not null);
$$;

create or replace function public.no_alcance(p_orgao uuid, p_unidade uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.orgao_liberado(p_orgao)
     and (public.e_suporte_softplus()
          or coalesce((select v.unidade_id is null or v.unidade_id = p_unidade
                       from public.vinculo_no_orgao(p_orgao) v
                       where v.id is not null), false));
$$;

create or replace function public.tem_permissao(p_orgao uuid, p_modulo text, p_acao text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v public.usuarios_orgaos;
  r boolean;
begin
  if not public.orgao_liberado(p_orgao) then return false; end if;
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
language plpgsql stable security definer set search_path = public as $$
declare v public.usuarios_orgaos;
begin
  if not public.orgao_liberado(p_orgao) then return; end if;
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

-- Lista de órgãos do painel: órgão de teste só para o Desenvolvedor.
create or replace function public.meus_orgaos()
returns table (id uuid, nome text, sigla text, tipo public.tipo_orgao, orgao_pai_id uuid, ativo boolean, perfil text)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.e_suporte_softplus() then
    return query select o.id, o.nome, o.sigla, o.tipo, o.orgao_pai_id, o.ativo,
                        case when public.e_desenvolvedor() then 'Desenvolvedor' else 'Suporte SOFT+' end::text
                   from public.orgaos o where public.orgao_liberado(o.id) order by o.nome;
    return;
  end if;
  return query
    with v as (
      select uo.*, p.nome || coalesce((select ' + ' || string_agg(pe.nome, ' + ' order by pe.nome) from public.perfis pe where pe.id = any (uo.perfis_extras)), '') as rotulo
      from public.usuarios_orgaos uo join public.perfis p on p.id = uo.perfil_id
      where uo.usuario_id = auth.uid() and uo.ativo)
    select o.id, o.nome, o.sigla, o.tipo, o.orgao_pai_id, o.ativo, v.rotulo
    from v join public.orgaos o on o.id = v.orgao_id
    where public.orgao_liberado(o.id)
    union
    select s.id, s.nome, s.sigla, s.tipo, s.orgao_pai_id, s.ativo, v.rotulo
    from v join public.orgaos s on s.orgao_pai_id = v.orgao_id
    where v.unidade_id is null and public.orgao_liberado(s.id)
      and not exists (select 1 from public.usuarios_orgaos d where d.usuario_id = auth.uid() and d.orgao_id = s.id)
    order by 2;
end;
$$;

-- Órgãos da plataforma (Suporte): esconde os de teste de quem não é Desenvolvedor.
create or replace function public.orgaos_plataforma()
returns table (id uuid, nome text, sigla text, tipo public.tipo_orgao, cnpj text, municipio text, uf text, dominio text,
               orgao_pai_id uuid, ativo boolean, criado_em timestamptz, administradores integer, usuarios integer,
               itens_menu integer, unidades integer, links_fora integer, pendencias text[])
language sql stable security definer set search_path = public as $$
  select o.id, o.nome, o.sigla, o.tipo, o.cnpj, o.municipio, o.uf, o.dominio, o.orgao_pai_id, o.ativo, o.criado_em,
         a.adm, a.usu, m.n, u.n, l.n,
         array_remove(array[
           case when a.adm = 0 then 'Convidar o administrador do órgão (Usuários e permissões).' end,
           case when m.n = 0 then 'Criar o menu do site.' end,
           case when u.n = 0 then 'Cadastrar as unidades (secretarias e setores).' end,
           case when coalesce(o.configuracoes ->> 'brasao_url', '') = '' then 'Enviar o brasão (Aparência).' end,
           case when coalesce(o.configuracoes ->> 'email', '') = '' or coalesce(o.configuracoes ->> 'telefone', '') = '' or coalesce(o.configuracoes ->> 'endereco', '') = ''
                then 'Completar endereço, telefone e e-mail (Aparência › Contatos).' end,
           case when o.dominio is null then 'Apontar o domínio oficial para o portal e cadastrá-lo (PNTP 1.1).' end,
           case when l.n > 0 then l.n || ' endereço(s) externo(s) sem responder (Aparência › Destinos das páginas).' end], null)
  from public.orgaos o
  cross join lateral (select count(*) filter (where uo.ativo and p.e_administrador)::int as adm, count(*) filter (where uo.ativo)::int as usu
                      from public.usuarios_orgaos uo join public.perfis p on p.id = uo.perfil_id where uo.orgao_id = o.id) a
  cross join lateral (select count(*)::int as n from public.menu_itens mi where mi.orgao_id = o.id) m
  cross join lateral (select count(*)::int as n from public.unidades un where un.orgao_id = o.id and un.ativo) u
  cross join lateral (select count(*)::int as n from public.links_verificacao lv where lv.orgao_id = o.id and lv.falhas_seguidas >= 2) l
  where public.e_suporte_softplus() and public.orgao_liberado(o.id)
  order by o.nome;
$$;
grant execute on function public.orgaos_plataforma() to authenticated;

-- A própria linha do órgão de teste some da API (site público, consultas diretas) para os demais.
drop policy if exists "orgaos: teste só do desenvolvedor" on public.orgaos;
create policy "orgaos: teste só do desenvolvedor" on public.orgaos as restrictive
  for all to anon, authenticated
  using (not somente_desenvolvedor or public.e_desenvolvedor())
  with check (not somente_desenvolvedor or public.e_desenvolvedor());

-- Marcar/desmarcar órgão de teste (botão em Órgãos da plataforma, só para o Desenvolvedor).
create or replace function public.definir_orgao_teste(p_orgao uuid, p_valor boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.e_desenvolvedor() then raise exception 'Só o Desenvolvedor marca ou desmarca órgão de teste.'; end if;
  update public.orgaos set somente_desenvolvedor = coalesce(p_valor, false) where id = p_orgao;
  if not found then raise exception 'Órgão não encontrado.'; end if;
end $$;
grant execute on function public.definir_orgao_teste(uuid, boolean) to authenticated;

-- Dar/tirar a marca Suporte SOFT+: só o Desenvolvedor.
create or replace function public.definir_suporte_softplus(p_usuario uuid, p_valor boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_antes boolean;
begin
  if not public.e_desenvolvedor() then
    raise exception 'Só o Desenvolvedor pode dar ou tirar o acesso de Suporte SOFT+.';
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
  update public.usuarios set suporte_softplus = coalesce(p_valor, false) where id = p_usuario;
  insert into public.historico (orgao_id, tabela, registro_id, acao, usuario_id, dados_antes, dados_depois)
  values (null, 'usuarios', p_usuario::text, 'editar', auth.uid(),
          jsonb_build_object('suporte_softplus', v_antes), jsonb_build_object('suporte_softplus', coalesce(p_valor, false)));
end $$;
grant execute on function public.definir_suporte_softplus(uuid, boolean) to authenticated;

-- Conferência
select (select string_agg(nome, ', ') from public.usuarios where desenvolvedor) as desenvolvedores,
       (select string_agg(nome, ', ') from public.orgaos where somente_desenvolvedor) as orgaos_de_teste;
