-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 01 — Fundação: órgãos, unidades, usuários, perfis, permissões
--             e histórico de alterações
--
-- Como usar: Supabase › SQL Editor › New query › colar tudo › Run.
-- Pode ser executado uma única vez num projeto novo.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. TIPOS
-- ---------------------------------------------------------------------

-- O tipo do órgão define quais critérios do PNTP se aplicam
-- (matriz do Executivo, do Legislativo, de consórcios etc.).
create type public.tipo_orgao as enum (
  'prefeitura', 'camara', 'rpps', 'consorcio', 'autarquia', 'outro'
);

create type public.acao_historico as enum ('inserir', 'editar', 'excluir');


-- ---------------------------------------------------------------------
-- 2. TABELAS
-- ---------------------------------------------------------------------

-- Cada cliente (prefeitura, câmara, IPREV…) é um "órgão".
-- Subsites (ex.: IPREV dentro do site da Prefeitura) são órgãos com orgao_pai_id.
create table public.orgaos (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null,
  sigla          text,
  tipo           public.tipo_orgao not null,
  cnpj           text unique,
  municipio      text,
  uf             char(2),
  dominio        text unique,                -- ex.: municipio.rn.gov.br
  orgao_pai_id   uuid references public.orgaos(id) on delete restrict,
  ativo          boolean not null default true,
  -- Identidade visual e itens públicos do site (cores, redes sociais, WhatsApp…).
  -- Tudo aqui é PÚBLICO: nunca guardar dado sensível neste campo.
  configuracoes  jsonb not null default '{}'::jsonb,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  constraint orgao_nao_e_pai_de_si check (orgao_pai_id is null or orgao_pai_id <> id)
);

-- Secretarias, setores e unidades de atendimento.
-- Atende o PNTP 2.1 (estrutura), 2.2 (competências), 2.4 (endereços) e 2.5 (horários),
-- e também define o "alcance" dos usuários setoriais.
create table public.unidades (
  id                  uuid primary key default gen_random_uuid(),
  orgao_id            uuid not null references public.orgaos(id) on delete cascade,
  unidade_pai_id      uuid references public.unidades(id) on delete restrict,
  nome                text not null,
  sigla               text,
  competencias        text,
  endereco            text,
  telefone            text,
  email               text,
  horario_atendimento text,
  ordem               integer not null default 0,
  ativo               boolean not null default true,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);
create index on public.unidades (orgao_id);

-- Catálogo fixo de módulos do painel (usado na tabela de permissões).
create table public.modulos (
  codigo  text primary key,
  nome    text not null,
  grupo   text not null,
  ordem   integer not null default 0
);

-- Dados de cada pessoa que entra no painel (complementa auth.users da Supabase).
create table public.usuarios (
  id                  uuid primary key references auth.users(id) on delete cascade,
  nome                text not null default '',
  email               text not null,
  -- Equipe de suporte da SOFT+: acesso a todos os órgãos. Só é ligado manualmente no SQL.
  suporte_softplus    boolean not null default false,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);

-- Perfis de acesso. orgao_id nulo = perfil padrão do sistema (vale para todos os órgãos);
-- com orgao_id = perfil personalizado criado pelo órgão.
create table public.perfis (
  id          uuid primary key default gen_random_uuid(),
  orgao_id    uuid references public.orgaos(id) on delete cascade,
  nome        text not null,
  descricao   text,
  -- O perfil "Administrador do órgão" não pode ser removido do último administrador.
  e_administrador boolean not null default false,
  criado_em   timestamptz not null default now(),
  unique (orgao_id, nome)
);

-- O que cada perfil pode fazer em cada módulo.
create table public.perfil_permissoes (
  perfil_id     uuid not null references public.perfis(id) on delete cascade,
  modulo        text not null references public.modulos(codigo) on delete cascade,
  pode_ver      boolean not null default false,
  pode_editar   boolean not null default false,   -- cadastrar e editar (rascunho)
  pode_publicar boolean not null default false,   -- aprovar e publicar
  pode_excluir  boolean not null default false,
  primary key (perfil_id, modulo)
);

-- Vínculo pessoa ↔ órgão, com perfil e alcance.
-- unidade_id nulo = alcance em todo o órgão (e nos subsites dele).
create table public.usuarios_orgaos (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references public.usuarios(id) on delete cascade,
  orgao_id    uuid not null references public.orgaos(id) on delete cascade,
  perfil_id   uuid not null references public.perfis(id) on delete restrict,
  unidade_id  uuid references public.unidades(id) on delete set null,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now(),
  unique (usuario_id, orgao_id)
);
create index on public.usuarios_orgaos (orgao_id);

-- Histórico de alterações (quem, quando, o quê). Só o próprio banco grava aqui.
create table public.historico (
  id            bigint generated always as identity primary key,
  orgao_id      uuid,
  usuario_id    uuid,
  tabela        text not null,
  registro_id   text,
  acao          public.acao_historico not null,
  dados_antes   jsonb,
  dados_depois  jsonb,
  criado_em     timestamptz not null default now()
);
create index on public.historico (orgao_id, criado_em desc);


-- ---------------------------------------------------------------------
-- 3. FUNÇÕES DE APOIO ÀS REGRAS DE ACESSO
--    "security definer" para que as regras possam consultar as tabelas
--    de permissão sem cair em recursão nas próprias regras.
-- ---------------------------------------------------------------------

create or replace function public.e_suporte_softplus()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select u.suporte_softplus from public.usuarios u where u.id = auth.uid()),
    false
  );
$$;

-- Vínculo ativo do usuário logado que dá acesso ao órgão informado:
-- vínculo direto no órgão, ou vínculo de alcance total no órgão-pai (subsites).
create or replace function public.vinculo_no_orgao(p_orgao uuid)
returns public.usuarios_orgaos
language sql stable security definer set search_path = public
as $$
  select uo.*
  from public.usuarios_orgaos uo
  where uo.usuario_id = auth.uid()
    and uo.ativo
    and (
      uo.orgao_id = p_orgao
      or (uo.unidade_id is null
          and uo.orgao_id = (select o.orgao_pai_id from public.orgaos o where o.id = p_orgao))
    )
  order by (uo.orgao_id = p_orgao) desc   -- vínculo direto tem preferência
  limit 1;
$$;

create or replace function public.e_membro(p_orgao uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.e_suporte_softplus()
      or (public.vinculo_no_orgao(p_orgao)).id is not null;
$$;

-- p_acao: 'ver' | 'editar' | 'publicar' | 'excluir'
create or replace function public.tem_permissao(p_orgao uuid, p_modulo text, p_acao text)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  v public.usuarios_orgaos;
  pp public.perfil_permissoes;
begin
  if public.e_suporte_softplus() then
    return true;
  end if;

  v := public.vinculo_no_orgao(p_orgao);
  if v.id is null then
    return false;
  end if;

  select * into pp
  from public.perfil_permissoes
  where perfil_id = v.perfil_id and modulo = p_modulo;

  if not found then
    return false;
  end if;

  return case p_acao
    when 'ver'      then pp.pode_ver
    when 'editar'   then pp.pode_editar
    when 'publicar' then pp.pode_publicar
    when 'excluir'  then pp.pode_excluir
    else false
  end;
end;
$$;

-- Alcance setorial: true se o usuário pode mexer em registros da unidade informada.
-- Usuário sem unidade (alcance total) pode tudo; usuário setorial só na própria unidade.
create or replace function public.no_alcance(p_orgao uuid, p_unidade uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.e_suporte_softplus()
      or coalesce((select v.unidade_id is null or v.unidade_id = p_unidade
                   from public.vinculo_no_orgao(p_orgao) v
                   where v.id is not null), false);
$$;


-- ---------------------------------------------------------------------
-- 4. GATILHOS (triggers)
-- ---------------------------------------------------------------------

-- Atualiza "atualizado_em" sozinho em toda edição.
create or replace function public.marcar_atualizacao()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger orgaos_atualizado    before update on public.orgaos    for each row execute function public.marcar_atualizacao();
create trigger unidades_atualizado  before update on public.unidades  for each row execute function public.marcar_atualizacao();
create trigger usuarios_atualizado  before update on public.usuarios  for each row execute function public.marcar_atualizacao();

-- Grava toda inclusão, edição e exclusão no histórico.
-- Genérico: serve para qualquer tabela que tenha a coluna "id"
-- (e, se tiver, "orgao_id").
create or replace function public.registrar_historico()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  antes  jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  depois jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  base   jsonb := coalesce(depois, antes);
begin
  insert into public.historico (orgao_id, usuario_id, tabela, registro_id, acao, dados_antes, dados_depois)
  values (
    coalesce((base->>'orgao_id')::uuid, case when tg_table_name = 'orgaos' then (base->>'id')::uuid end),
    auth.uid(),
    tg_table_name,
    coalesce(base->>'id', base->>'perfil_id'),
    case tg_op when 'INSERT' then 'inserir'::public.acao_historico
               when 'UPDATE' then 'editar'::public.acao_historico
               else 'excluir'::public.acao_historico end,
    antes,
    depois
  );
  return coalesce(new, old);
end;
$$;

create trigger orgaos_historico          after insert or update or delete on public.orgaos          for each row execute function public.registrar_historico();
create trigger unidades_historico        after insert or update or delete on public.unidades        for each row execute function public.registrar_historico();
create trigger perfis_historico          after insert or update or delete on public.perfis          for each row execute function public.registrar_historico();
create trigger usuarios_orgaos_historico after insert or update or delete on public.usuarios_orgaos for each row execute function public.registrar_historico();

-- Ao criar um login na Supabase, cria automaticamente a ficha em public.usuarios.
create or replace function public.criar_ficha_usuario()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.usuarios (id, email, nome)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data->>'nome', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger ao_criar_login
  after insert on auth.users
  for each row execute function public.criar_ficha_usuario();

-- Impede que o órgão fique sem nenhum administrador ativo
-- (regra do projeto: a conta com privilégio máximo não pode se rebaixar sem querer).
create or replace function public.proteger_ultimo_administrador()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  era_admin boolean;
  restantes integer;
begin
  -- Exclusão em cascata (o próprio órgão ou o login sendo apagado pela SOFT+): liberar.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;

  select e_administrador into era_admin from public.perfis where id = old.perfil_id;
  if not coalesce(era_admin, false) or not old.ativo then
    return coalesce(new, old);
  end if;

  -- Continua administrador e ativo depois da edição? Então não há problema.
  if tg_op = 'UPDATE' and new.ativo
     and (select e_administrador from public.perfis where id = new.perfil_id) then
    return new;
  end if;

  select count(*) into restantes
  from public.usuarios_orgaos uo
  join public.perfis p on p.id = uo.perfil_id
  where uo.orgao_id = old.orgao_id
    and uo.ativo
    and p.e_administrador
    and uo.id <> old.id;

  if restantes = 0 then
    raise exception 'O órgão precisa ter pelo menos um administrador ativo. Cadastre outro administrador antes de remover este.';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger usuarios_orgaos_ultimo_admin
  before update or delete on public.usuarios_orgaos
  for each row execute function public.proteger_ultimo_administrador();


-- ---------------------------------------------------------------------
-- 5. REGRAS DE ACESSO POR LINHA (RLS)
-- ---------------------------------------------------------------------

alter table public.orgaos            enable row level security;
alter table public.unidades          enable row level security;
alter table public.modulos           enable row level security;
alter table public.usuarios          enable row level security;
alter table public.perfis            enable row level security;
alter table public.perfil_permissoes enable row level security;
alter table public.usuarios_orgaos   enable row level security;
alter table public.historico         enable row level security;

-- ÓRGÃOS: o site público precisa ler nome, cores e configurações dos órgãos ativos.
create policy "orgaos: leitura pública dos ativos" on public.orgaos
  for select to anon, authenticated
  using (ativo or public.e_membro(id));
create policy "orgaos: aparência editável por quem tem permissão" on public.orgaos
  for update to authenticated
  using (public.tem_permissao(id, 'aparencia', 'editar'))
  with check (public.tem_permissao(id, 'aparencia', 'editar'));
create policy "orgaos: criação só pela SOFT+" on public.orgaos
  for insert to authenticated with check (public.e_suporte_softplus());
create policy "orgaos: exclusão só pela SOFT+" on public.orgaos
  for delete to authenticated using (public.e_suporte_softplus());

-- UNIDADES: públicas (estrutura, endereços e horários aparecem no site).
create policy "unidades: leitura pública das ativas" on public.unidades
  for select to anon, authenticated
  using (ativo or public.e_membro(orgao_id));
create policy "unidades: inclusão" on public.unidades
  for insert to authenticated with check (public.tem_permissao(orgao_id, 'institucional', 'editar'));
create policy "unidades: edição" on public.unidades
  for update to authenticated
  using (public.tem_permissao(orgao_id, 'institucional', 'editar'))
  with check (public.tem_permissao(orgao_id, 'institucional', 'editar'));
create policy "unidades: exclusão" on public.unidades
  for delete to authenticated using (public.tem_permissao(orgao_id, 'institucional', 'excluir'));

-- MÓDULOS: catálogo de leitura para quem está logado.
create policy "modulos: leitura" on public.modulos
  for select to authenticated using (true);

-- USUÁRIOS: cada um vê a própria ficha; administradores veem quem é do mesmo órgão.
create policy "usuarios: leitura" on public.usuarios
  for select to authenticated
  using (
    id = auth.uid()
    or public.e_suporte_softplus()
    or exists (
      select 1 from public.usuarios_orgaos uo
      where uo.usuario_id = usuarios.id
        and public.tem_permissao(uo.orgao_id, 'usuarios', 'ver')
    )
  );
-- A pessoa só altera a própria ficha; a marca de suporte é protegida pelo gatilho abaixo.
create policy "usuarios: editar a própria ficha" on public.usuarios
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- A marca "suporte_softplus" e o e-mail só mudam pelo SQL Editor (nunca pelo site/painel).
create or replace function public.proteger_campos_usuario()
returns trigger language plpgsql as $$
begin
  if current_user in ('anon', 'authenticated')
     and (new.suporte_softplus is distinct from old.suporte_softplus
          or new.email is distinct from old.email) then
    raise exception 'Este campo não pode ser alterado pelo painel.';
  end if;
  return new;
end;
$$;

create trigger usuarios_campos_protegidos
  before update on public.usuarios
  for each row execute function public.proteger_campos_usuario();

-- PERFIS: perfis do sistema são visíveis a todos os logados; personalizados, aos membros.
create policy "perfis: leitura" on public.perfis
  for select to authenticated
  using (orgao_id is null or public.e_membro(orgao_id));
create policy "perfis: criar personalizado" on public.perfis
  for insert to authenticated
  with check (orgao_id is not null and not e_administrador and public.tem_permissao(orgao_id, 'usuarios', 'editar'));
create policy "perfis: editar personalizado" on public.perfis
  for update to authenticated
  using (orgao_id is not null and public.tem_permissao(orgao_id, 'usuarios', 'editar'))
  with check (orgao_id is not null and not e_administrador and public.tem_permissao(orgao_id, 'usuarios', 'editar'));
create policy "perfis: excluir personalizado" on public.perfis
  for delete to authenticated
  using (orgao_id is not null and public.tem_permissao(orgao_id, 'usuarios', 'excluir'));

-- PERMISSÕES DOS PERFIS: segue o perfil. Perfis do sistema só mudam pela SOFT+.
create policy "perfil_permissoes: leitura" on public.perfil_permissoes
  for select to authenticated
  using (exists (select 1 from public.perfis p where p.id = perfil_id
                 and (p.orgao_id is null or public.e_membro(p.orgao_id))));
create policy "perfil_permissoes: alteração" on public.perfil_permissoes
  for all to authenticated
  using (exists (select 1 from public.perfis p where p.id = perfil_id
                 and ((p.orgao_id is null and public.e_suporte_softplus())
                      or (p.orgao_id is not null and public.tem_permissao(p.orgao_id, 'usuarios', 'editar')))))
  with check (exists (select 1 from public.perfis p where p.id = perfil_id
                 and ((p.orgao_id is null and public.e_suporte_softplus())
                      or (p.orgao_id is not null and public.tem_permissao(p.orgao_id, 'usuarios', 'editar')))));

-- VÍNCULOS: cada um vê os próprios; quem gerencia usuários vê e altera os do órgão.
create policy "usuarios_orgaos: leitura" on public.usuarios_orgaos
  for select to authenticated
  using (usuario_id = auth.uid() or public.tem_permissao(orgao_id, 'usuarios', 'ver'));
create policy "usuarios_orgaos: inclusão" on public.usuarios_orgaos
  for insert to authenticated with check (public.tem_permissao(orgao_id, 'usuarios', 'editar'));
create policy "usuarios_orgaos: edição" on public.usuarios_orgaos
  for update to authenticated
  using (public.tem_permissao(orgao_id, 'usuarios', 'editar'))
  with check (public.tem_permissao(orgao_id, 'usuarios', 'editar'));
create policy "usuarios_orgaos: exclusão" on public.usuarios_orgaos
  for delete to authenticated using (public.tem_permissao(orgao_id, 'usuarios', 'excluir'));

-- HISTÓRICO: só leitura, para quem tem permissão. Ninguém grava direto.
create policy "historico: leitura" on public.historico
  for select to authenticated
  using (public.tem_permissao(orgao_id, 'historico', 'ver') or (orgao_id is null and public.e_suporte_softplus()));


-- ---------------------------------------------------------------------
-- 6. LIBERAÇÃO DAS TABELAS NA API
--    (necessário porque desmarcamos "Automatically expose new tables";
--     as regras de RLS acima continuam valendo por cima destas liberações)
-- ---------------------------------------------------------------------

grant usage on schema public to anon, authenticated;

grant select on public.orgaos, public.unidades to anon;
grant select, insert, update, delete on
  public.orgaos, public.unidades, public.usuarios, public.perfis,
  public.perfil_permissoes, public.usuarios_orgaos
  to authenticated;
grant select on public.modulos, public.historico to authenticated;

grant execute on function
  public.e_suporte_softplus(), public.e_membro(uuid),
  public.tem_permissao(uuid, text, text), public.no_alcance(uuid, uuid)
  to authenticated;
-- vinculo_no_orgao é uso interno das regras: não fica exposta na API.
revoke execute on function public.vinculo_no_orgao(uuid) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 7. DADOS INICIAIS
-- ---------------------------------------------------------------------

-- Módulos do painel (mesma lista da tela "Usuários e permissões").
insert into public.modulos (codigo, nome, grupo, ordem) values
  ('noticias',       'Notícias, banners e avisos',          'Conteúdo do site',     10),
  ('institucional',  'Páginas institucionais, gestores e unidades', 'Conteúdo do site', 20),
  ('servicos',       'Carta de Serviços',                   'Conteúdo do site',     30),
  ('publicacoes',    'Publicações oficiais e atos normativos', 'Conteúdo do site',  40),
  ('licitacoes',     'Licitações e contratos',              'Transparência',        50),
  ('financeiro',     'Receitas, despesas e planejamento',   'Transparência',        60),
  ('pessoal',        'Pessoal e diárias',                   'Transparência',        70),
  ('convenios',      'Convênios, emendas e renúncias',      'Transparência',        80),
  ('obras',          'Obras',                               'Transparência',        90),
  ('setoriais',      'Saúde, educação e conselhos',         'Transparência',       100),
  ('atendimento',    'e-SIC, Ouvidoria e pesquisa de satisfação', 'Atendimento',   110),
  ('aparencia',      'Aparência, menu e links',             'Configurações',       120),
  ('usuarios',       'Usuários e permissões',               'Configurações',       130),
  ('importacoes',    'Importações e integrações',           'Configurações',       140),
  ('historico',      'Histórico de alterações',             'Configurações',       150);

-- Perfis padrão do sistema (orgao_id nulo = valem para todos os órgãos).
insert into public.perfis (orgao_id, nome, descricao, e_administrador) values
  (null, 'Administrador do órgão', 'Acesso total, inclusive usuários e aparência', true),
  (null, 'Gestor de conteúdo',     'Revisa e publica o que os cadastradores enviam', false),
  (null, 'Cadastrador setorial',   'Cria rascunhos só no seu setor; não publica', false),
  (null, 'Comunicação',            'Notícias, banners, avisos e páginas', false),
  (null, 'Atendimento (SIC e Ouvidoria)', 'Responde pedidos e manifestações', false),
  (null, 'Controle interno',       'Vê tudo e emite relatórios do PNTP; não altera', false);

-- Permissões de cada perfil padrão.
-- Grupos de módulos usados abaixo:
--   conteudo  = noticias, institucional, servicos, publicacoes
--   transp    = licitacoes, financeiro, pessoal, convenios, obras, setoriais
--   config    = aparencia, usuarios, importacoes, historico
with p as (select id, nome from public.perfis where orgao_id is null),
     m as (select codigo from public.modulos)
insert into public.perfil_permissoes (perfil_id, modulo, pode_ver, pode_editar, pode_publicar, pode_excluir)
select p.id, m.codigo,
  -- ver
  case p.nome
    when 'Administrador do órgão' then true
    when 'Gestor de conteúdo'     then true
    when 'Cadastrador setorial'   then m.codigo not in ('aparencia','usuarios','importacoes','historico')
    when 'Comunicação'            then m.codigo not in ('usuarios','importacoes','historico')
    when 'Atendimento (SIC e Ouvidoria)' then m.codigo not in ('aparencia','usuarios','importacoes','historico')
    when 'Controle interno'       then m.codigo <> 'usuarios'
  end,
  -- editar
  case p.nome
    when 'Administrador do órgão' then true
    when 'Gestor de conteúdo'     then m.codigo not in ('usuarios','historico')
    when 'Cadastrador setorial'   then m.codigo not in ('aparencia','usuarios','importacoes','historico')
    when 'Comunicação'            then m.codigo in ('noticias','institucional')
    when 'Atendimento (SIC e Ouvidoria)' then m.codigo = 'atendimento'
    else false
  end,
  -- publicar
  case p.nome
    when 'Administrador do órgão' then true
    when 'Gestor de conteúdo'     then m.codigo not in ('aparencia','usuarios','importacoes','historico')
    when 'Comunicação'            then m.codigo in ('noticias','institucional')
    when 'Atendimento (SIC e Ouvidoria)' then m.codigo = 'atendimento'
    else false
  end,
  -- excluir
  case p.nome
    when 'Administrador do órgão' then true
    when 'Gestor de conteúdo'     then m.codigo not in ('aparencia','usuarios','importacoes','historico')
    when 'Comunicação'            then m.codigo in ('noticias','institucional')
    else false
  end
from p cross join m;
