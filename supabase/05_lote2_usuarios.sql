-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 05 — Lote 2: usuários, perfis personalizados e histórico
--
-- Como usar: Supabase › SQL Editor › New query › colar tudo › Run.
-- Pode ser executado mais de uma vez. Rodar DEPOIS dos scripts 01 a 04.
-- O aviso "destructive operations" aparece por causa dos "drop policy if
-- exists": as regras são apagadas e recriadas na linha seguinte; nenhum
-- dado é apagado.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. QUEM É ADMINISTRADOR DO ÓRGÃO
--    Só o administrador (ou o suporte SOFT+) cria perfis, mexe em
--    permissões e entrega o perfil de administrador a outra pessoa.
--    Motivo: quem só tem "editar usuários" não pode dar a alguém
--    (nem montar um perfil com) mais poder do que ele mesmo tem.
-- ---------------------------------------------------------------------
create or replace function public.e_admin_do_orgao(p_orgao uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.e_suporte_softplus()
      or coalesce((select p.e_administrador
                   from public.vinculo_no_orgao(p_orgao) v
                   join public.perfis p on p.id = v.perfil_id
                   where v.id is not null), false);
$$;


-- ---------------------------------------------------------------------
-- 2. REGRA ÚNICA PARA DAR OU ALTERAR ACESSO
--    Devolve null quando pode; senão, o motivo em português.
--    É usada pelas regras da tabela (RLS) e pela função de convite,
--    que a consulta ANTES de criar o login (evita convite indevido).
-- ---------------------------------------------------------------------
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

  if p_unidade is not null
     and not exists (select 1 from public.unidades u where u.id = p_unidade and u.orgao_id = p_orgao) then
    return 'A unidade escolhida não pertence a este órgão.';
  end if;
  -- Gestor setorial de usuários só cadastra gente da própria unidade.
  if not public.no_alcance(p_orgao, p_unidade) then
    return 'Você só pode dar acesso à sua própria unidade.';
  end if;

  if p_usuario is not null and p_usuario = auth.uid() and not public.e_suporte_softplus() then
    return 'Você não pode alterar o seu próprio acesso. Peça a outro administrador.';
  end if;

  return null;
end;
$$;


-- ---------------------------------------------------------------------
-- 3. REGRAS DOS VÍNCULOS (pessoa ↔ órgão) — substituem as do script 01
-- ---------------------------------------------------------------------
drop policy if exists "usuarios_orgaos: inclusão" on public.usuarios_orgaos;
create policy "usuarios_orgaos: inclusão" on public.usuarios_orgaos
  for insert to authenticated
  with check (public.motivo_bloqueio_acesso(orgao_id, perfil_id, unidade_id, usuario_id) is null);

-- Edição: a linha atual também precisa estar ao alcance de quem edita,
-- e quem não é administrador não mexe no acesso de um administrador.
drop policy if exists "usuarios_orgaos: edição" on public.usuarios_orgaos;
create policy "usuarios_orgaos: edição" on public.usuarios_orgaos
  for update to authenticated
  using (
    public.tem_permissao(orgao_id, 'usuarios', 'editar')
    and public.no_alcance(orgao_id, unidade_id)
    and (usuario_id <> auth.uid() or public.e_suporte_softplus())
    and (public.e_admin_do_orgao(orgao_id)
         or not (select p.e_administrador from public.perfis p where p.id = perfil_id))
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
         or not (select p.e_administrador from public.perfis p where p.id = perfil_id))
  );


-- ---------------------------------------------------------------------
-- 4. PERFIS PERSONALIZADOS E PERMISSÕES — só administrador do órgão
-- ---------------------------------------------------------------------
drop policy if exists "perfis: criar personalizado" on public.perfis;
create policy "perfis: criar personalizado" on public.perfis
  for insert to authenticated
  with check (orgao_id is not null and not e_administrador and public.e_admin_do_orgao(orgao_id));

drop policy if exists "perfis: editar personalizado" on public.perfis;
create policy "perfis: editar personalizado" on public.perfis
  for update to authenticated
  using (orgao_id is not null and public.e_admin_do_orgao(orgao_id))
  with check (orgao_id is not null and not e_administrador and public.e_admin_do_orgao(orgao_id));

drop policy if exists "perfis: excluir personalizado" on public.perfis;
create policy "perfis: excluir personalizado" on public.perfis
  for delete to authenticated
  using (orgao_id is not null and public.e_admin_do_orgao(orgao_id));

drop policy if exists "perfil_permissoes: alteração" on public.perfil_permissoes;
create policy "perfil_permissoes: alteração" on public.perfil_permissoes
  for all to authenticated
  using (exists (select 1 from public.perfis p where p.id = perfil_id
                 and ((p.orgao_id is null and public.e_suporte_softplus())
                      or (p.orgao_id is not null and public.e_admin_do_orgao(p.orgao_id)))))
  with check (exists (select 1 from public.perfis p where p.id = perfil_id
                 and ((p.orgao_id is null and public.e_suporte_softplus())
                      or (p.orgao_id is not null and public.e_admin_do_orgao(p.orgao_id)))));

-- Toda permissão marcada exige "ver" (não faz sentido editar o que não se vê).
create or replace function public.coerencia_permissao()
returns trigger language plpgsql as $$
begin
  if new.pode_editar or new.pode_publicar or new.pode_excluir then
    new.pode_ver := true;
  end if;
  return new;
end;
$$;
drop trigger if exists perfil_permissoes_coerencia on public.perfil_permissoes;
create trigger perfil_permissoes_coerencia
  before insert or update on public.perfil_permissoes
  for each row execute function public.coerencia_permissao();

-- Histórico das permissões: a tabela não tem orgao_id, então o órgão vem do perfil.
-- (O gatilho genérico do script 01 gravaria orgao_id vazio e o órgão não veria a mudança.)
create or replace function public.registrar_historico_permissoes()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  base public.perfil_permissoes := coalesce(new, old);
  v_orgao uuid;
begin
  select orgao_id into v_orgao from public.perfis where id = base.perfil_id;
  if v_orgao is null then
    return coalesce(new, old);    -- perfil do sistema: alteração feita pela SOFT+
  end if;
  if tg_op = 'UPDATE' and to_jsonb(new) = to_jsonb(old) then
    return new;                   -- nada mudou: não polui o histórico
  end if;
  insert into public.historico (orgao_id, usuario_id, tabela, registro_id, acao, dados_antes, dados_depois)
  values (v_orgao, auth.uid(), 'perfil_permissoes', base.perfil_id::text,
          case tg_op when 'INSERT' then 'inserir'::public.acao_historico
                     when 'UPDATE' then 'editar'::public.acao_historico
                     else 'excluir'::public.acao_historico end,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end;
$$;
drop trigger if exists perfil_permissoes_historico on public.perfil_permissoes;
create trigger perfil_permissoes_historico
  after insert or update or delete on public.perfil_permissoes
  for each row execute function public.registrar_historico_permissoes();


-- ---------------------------------------------------------------------
-- 5. LISTA DE PESSOAS DO ÓRGÃO
--    Função própria porque a situação do convite e o último acesso ficam
--    na área de login da Supabase (auth.users), que o painel não lê direto.
--    Uma pessoa por órgão é pouca gente (dezenas): não precisa paginar.
-- ---------------------------------------------------------------------
drop function if exists public.usuarios_do_orgao(uuid);
create function public.usuarios_do_orgao(p_orgao uuid)
returns table (
  vinculo_id      uuid,
  usuario_id      uuid,
  nome            text,
  email           text,
  perfil_id       uuid,
  perfil          text,
  e_administrador boolean,
  unidade_id      uuid,
  unidade         text,
  ativo           boolean,
  pendente        boolean,      -- convidado que ainda não criou a senha
  ultimo_acesso   timestamptz,
  criado_em       timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.tem_permissao(p_orgao, 'usuarios', 'ver') then
    raise exception 'Seu perfil não permite ver os usuários deste órgão.';
  end if;
  return query
    select uo.id, u.id, u.nome, u.email, p.id, p.nome, p.e_administrador,
           un.id, un.nome, uo.ativo,
           (a.email_confirmed_at is null and a.last_sign_in_at is null),
           a.last_sign_in_at, uo.criado_em
    from public.usuarios_orgaos uo
    join public.usuarios u   on u.id = uo.usuario_id
    join public.perfis p     on p.id = uo.perfil_id
    left join public.unidades un on un.id = uo.unidade_id
    left join auth.users a   on a.id = u.id
    where uo.orgao_id = p_orgao
    order by lower(coalesce(nullif(u.nome, ''), u.email));
end;
$$;


-- ---------------------------------------------------------------------
-- 6. HISTÓRICO — leitura paginada (50 por vez) com filtros
--    Cursor pelo id (mais novo primeiro). Inclui o nome de quem alterou,
--    mesmo que a pessoa já tenha saído do órgão.
-- ---------------------------------------------------------------------
create index if not exists historico_orgao_id_idx on public.historico (orgao_id, id desc);
create index if not exists historico_orgao_usuario_idx on public.historico (orgao_id, usuario_id);

drop function if exists public.historico_do_orgao(uuid, bigint, integer, text, uuid, public.acao_historico, date, date);
create function public.historico_do_orgao(
  p_orgao   uuid,
  p_antes   bigint default null,        -- cursor: id do último item já exibido
  p_limite  integer default 50,
  p_tabela  text default null,
  p_usuario uuid default null,
  p_acao    public.acao_historico default null,
  p_de      date default null,
  p_ate     date default null)
returns table (
  id            bigint,
  criado_em     timestamptz,
  usuario_id    uuid,
  usuario_nome  text,
  tabela        text,
  registro_id   text,
  acao          public.acao_historico,
  dados_antes   jsonb,
  dados_depois  jsonb
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.tem_permissao(p_orgao, 'historico', 'ver') then
    raise exception 'Seu perfil não permite ver o histórico deste órgão.';
  end if;
  return query
    select h.id, h.criado_em, h.usuario_id,
           case when u.suporte_softplus then coalesce(nullif(u.nome, ''), u.email) || ' (suporte SOFT+)'
                else coalesce(nullif(u.nome, ''), u.email, 'Sistema') end,
           h.tabela, h.registro_id, h.acao, h.dados_antes, h.dados_depois
    from public.historico h
    left join public.usuarios u on u.id = h.usuario_id
    where h.orgao_id = p_orgao
      and (p_antes   is null or h.id < p_antes)
      and (p_tabela  is null or h.tabela = p_tabela)
      and (p_usuario is null or h.usuario_id = p_usuario)
      and (p_acao    is null or h.acao = p_acao)
      -- Datas no fuso de Brasília (o servidor guarda em UTC).
      and (p_de      is null or h.criado_em >= (p_de::timestamp at time zone 'America/Sao_Paulo'))
      and (p_ate     is null or h.criado_em <  ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo'))
    order by h.id desc
    limit least(greatest(coalesce(p_limite, 50), 1), 200);
end;
$$;

-- Pessoas que já aparecem no histórico (para o filtro "Quem alterou").
create or replace function public.autores_historico(p_orgao uuid)
returns table (usuario_id uuid, nome text)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.tem_permissao(p_orgao, 'historico', 'ver') then
    raise exception 'Seu perfil não permite ver o histórico deste órgão.';
  end if;
  return query
    select u.id, coalesce(nullif(u.nome, ''), u.email)
           || case when u.suporte_softplus then ' (suporte SOFT+)' else '' end
    from (select distinct h.usuario_id from public.historico h
          where h.orgao_id = p_orgao and h.usuario_id is not null) d
    join public.usuarios u on u.id = d.usuario_id
    order by 2;
end;
$$;


-- ---------------------------------------------------------------------
-- 7. LIBERAÇÃO NA API
-- ---------------------------------------------------------------------
-- Funções nascem liberadas para todos (PUBLIC): fecha e libera só para quem está logado.
revoke execute on function
  public.e_admin_do_orgao(uuid),
  public.motivo_bloqueio_acesso(uuid, uuid, uuid, uuid),
  public.usuarios_do_orgao(uuid),
  public.historico_do_orgao(uuid, bigint, integer, text, uuid, public.acao_historico, date, date),
  public.autores_historico(uuid)
  from public, anon;
grant execute on function
  public.e_admin_do_orgao(uuid),
  public.motivo_bloqueio_acesso(uuid, uuid, uuid, uuid),
  public.usuarios_do_orgao(uuid),
  public.historico_do_orgao(uuid, bigint, integer, text, uuid, public.acao_historico, date, date),
  public.autores_historico(uuid)
  to authenticated;
