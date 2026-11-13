-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 06 — Lote 3: conteúdo do site
--   notícias, banners, avisos, publicações oficiais (atos normativos),
--   páginas institucionais, perguntas frequentes e menu do site.
--
-- Como usar: Supabase › SQL Editor › New query › colar tudo › Run.
-- Pode ser executado mais de uma vez. Rodar DEPOIS dos scripts 01 a 05.
-- (O aviso "destructive operations" vem dos "drop ... if exists": as
--  regras são apagadas e recriadas na hora; nenhum dado é apagado.)
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. MÓDULOS NOVOS DO PAINEL
--    "Páginas e perguntas frequentes" e "Menu do site" ganham permissão
--    própria. Cada perfil recebe nelas o mesmo que já tinha em
--    "institucional" e "aparencia", para ninguém perder nem ganhar acesso.
-- ---------------------------------------------------------------------
insert into public.modulos (codigo, nome, grupo, ordem) values
  ('paginas', 'Páginas e perguntas frequentes', 'Conteúdo do site', 25),
  ('menu',    'Menu do site',                   'Configurações',   125)
on conflict (codigo) do nothing;
update public.modulos set nome = 'Aparência e contatos' where codigo = 'aparencia';
update public.modulos set nome = 'Unidades e gestores' where codigo = 'institucional';

insert into public.perfil_permissoes (perfil_id, modulo, pode_ver, pode_editar, pode_publicar, pode_excluir)
select perfil_id, 'paginas', pode_ver, pode_editar, pode_publicar, pode_excluir
from public.perfil_permissoes where modulo = 'institucional'
on conflict (perfil_id, modulo) do nothing;

insert into public.perfil_permissoes (perfil_id, modulo, pode_ver, pode_editar, pode_publicar, pode_excluir)
select perfil_id, 'menu', pode_ver, pode_editar, pode_publicar, pode_excluir
from public.perfil_permissoes where modulo = 'aparencia'
on conflict (perfil_id, modulo) do nothing;


-- ---------------------------------------------------------------------
-- 2. BUSCA SEM ACENTO
--    Campo auxiliar normalizado (regra do projeto): "decreto saude"
--    encontra "Decreto ... Saúde" sem baixar a lista inteira.
--    translate() em vez da extensão unaccent porque coluna gerada exige
--    função "immutable", e unaccent não é.
-- ---------------------------------------------------------------------
create or replace function public.normalizar_texto(t text)
returns text
language sql immutable parallel safe
as $$
  select lower(translate(coalesce(t, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn'));
$$;


-- ---------------------------------------------------------------------
-- 3. TABELAS
-- ---------------------------------------------------------------------

-- NOTÍCIAS. "publicado_em" pode ser futuro: a notícia só aparece no site nessa hora.
create table if not exists public.noticias (
  id            uuid primary key default gen_random_uuid(),
  orgao_id      uuid not null references public.orgaos(id) on delete cascade,
  unidade_id    uuid references public.unidades(id) on delete restrict,
  titulo        text not null check (char_length(titulo) between 3 and 200),
  resumo        text check (char_length(resumo) <= 400),
  conteudo      text,
  capa_url      text,
  capa_legenda  text,
  categoria     text,
  situacao      text not null default 'rascunho' check (situacao in ('rascunho', 'publicado')),
  publicado_em  timestamptz,
  destaque      boolean not null default false,
  autor_id      uuid default auth.uid(),
  -- Ordem da lista: data de publicação ou, no rascunho, a de criação.
  data_ordem    timestamptz generated always as (coalesce(publicado_em, criado_em)) stored,
  busca         text generated always as
                  (public.normalizar_texto(titulo || ' ' || coalesce(resumo, '') || ' ' || coalesce(categoria, ''))) stored,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists noticias_lista_idx on public.noticias (orgao_id, data_ordem desc, id desc);

-- BANNERS da página inicial. O texto alternativo (titulo) é obrigatório: acessibilidade.
create table if not exists public.banners (
  id            uuid primary key default gen_random_uuid(),
  orgao_id      uuid not null references public.orgaos(id) on delete cascade,
  titulo        text not null check (char_length(titulo) between 3 and 160),
  imagem_url    text not null,
  link_url      text,
  inicio        date,
  fim           date,
  ordem         integer not null default 10,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint banners_periodo check (fim is null or inicio is null or fim >= inicio)
);
create index if not exists banners_orgao_idx on public.banners (orgao_id, ordem);

-- AVISOS (faixa de alerta no topo do site: chuva, vacinação, prazo de IPTU…).
create table if not exists public.avisos (
  id            uuid primary key default gen_random_uuid(),
  orgao_id      uuid not null references public.orgaos(id) on delete cascade,
  texto         text not null check (char_length(texto) between 3 and 300),
  link_url      text,
  nivel         text not null default 'informativo' check (nivel in ('informativo', 'importante', 'urgente')),
  inicio        timestamptz not null default now(),
  fim           timestamptz,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint avisos_periodo check (fim is null or fim > inicio)
);
create index if not exists avisos_orgao_idx on public.avisos (orgao_id, inicio desc);

-- PUBLICAÇÕES OFICIAIS / ATOS NORMATIVOS (leis, decretos, portarias…).
-- Três formas de alimentar (regra do projeto): PDF enviado, link externo ou importação.
create table if not exists public.publicacoes (
  id              uuid primary key default gen_random_uuid(),
  orgao_id        uuid not null references public.orgaos(id) on delete cascade,
  unidade_id      uuid references public.unidades(id) on delete restrict,
  tipo            text not null,
  numero          text,
  ano             integer not null check (ano between 1900 and 2100),
  data_publicacao date not null,
  ementa          text not null check (char_length(ementa) >= 5),
  arquivo_url     text,
  link_externo    text,
  vigencia        text not null default 'vigente'
                    check (vigencia in ('vigente', 'revogada', 'alterada', 'sem_efeito')),
  observacao      text,
  origem          text not null default 'manual' check (origem in ('manual', 'link', 'importacao')),
  situacao        text not null default 'rascunho' check (situacao in ('rascunho', 'publicado')),
  publicado_em    timestamptz,
  busca           text generated always as
                    (public.normalizar_texto(tipo || ' ' || coalesce(numero, '') || ' ' || ano || ' ' || ementa)) stored,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  -- Publicado precisa ter o documento (PDF ou link). Rascunho pode ficar sem.
  constraint publicacoes_documento check (situacao = 'rascunho' or arquivo_url is not null or link_externo is not null)
);
create index if not exists publicacoes_lista_idx on public.publicacoes (orgao_id, data_publicacao desc, id desc);
-- Evita cadastrar a mesma lei duas vezes (tipo + número + ano).
create unique index if not exists publicacoes_unica_idx
  on public.publicacoes (orgao_id, tipo, public.normalizar_texto(numero), ano) where numero is not null;

-- PÁGINAS INSTITUCIONAIS livres (História, Símbolos, LGPD…).
create table if not exists public.paginas (
  id            uuid primary key default gen_random_uuid(),
  orgao_id      uuid not null references public.orgaos(id) on delete cascade,
  titulo        text not null check (char_length(titulo) between 3 and 160),
  slug          text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  conteudo      text,
  situacao      text not null default 'rascunho' check (situacao in ('rascunho', 'publicado')),
  publicado_em  timestamptz,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint paginas_slug_unico unique (orgao_id, slug)
);

-- PERGUNTAS FREQUENTES.
create table if not exists public.faq (
  id            uuid primary key default gen_random_uuid(),
  orgao_id      uuid not null references public.orgaos(id) on delete cascade,
  pergunta      text not null check (char_length(pergunta) between 5 and 300),
  resposta      text not null,
  categoria     text,
  ordem         integer not null default 10,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists faq_orgao_idx on public.faq (orgao_id, ordem);

-- MENU DO SITE (dois níveis: item principal e subitens).
-- tipo: 'interno' = tela do próprio site (destino = rota, ex. /noticias)
--       'pagina'  = página institucional (destino = slug)
--       'link'    = endereço externo (destino = https://…)
create table if not exists public.menu_itens (
  id            uuid primary key default gen_random_uuid(),
  orgao_id      uuid not null references public.orgaos(id) on delete cascade,
  pai_id        uuid references public.menu_itens(id) on delete restrict,
  rotulo        text not null check (char_length(rotulo) between 2 and 60),
  tipo          text not null check (tipo in ('interno', 'pagina', 'link')),
  destino       text not null,
  nova_aba      boolean not null default false,
  ordem         integer not null default 10,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint menu_link_https check (tipo <> 'link' or destino ~* '^https?://')
);
create index if not exists menu_orgao_idx on public.menu_itens (orgao_id, ordem);

-- Menu com no máximo dois níveis, e o item-pai precisa ser do mesmo órgão.
create or replace function public.validar_menu()
returns trigger language plpgsql as $$
declare
  pai public.menu_itens;
begin
  if new.pai_id is null then
    return new;
  end if;
  select * into pai from public.menu_itens where id = new.pai_id;
  if pai.orgao_id <> new.orgao_id then
    raise exception 'O item-pai precisa ser do mesmo órgão.';
  end if;
  if pai.pai_id is not null then
    raise exception 'O menu tem só dois níveis: escolha um item principal como "fica dentro de".';
  end if;
  if new.id = new.pai_id then
    raise exception 'Um item não pode ficar dentro dele mesmo.';
  end if;
  if exists (select 1 from public.menu_itens f where f.pai_id = new.id) then
    raise exception 'Este item tem subitens e por isso precisa continuar como item principal.';
  end if;
  return new;
end;
$$;
drop trigger if exists menu_itens_validar on public.menu_itens;
create trigger menu_itens_validar before insert or update on public.menu_itens
  for each row execute function public.validar_menu();


-- ---------------------------------------------------------------------
-- 4. RASCUNHO → PUBLICADO
--    Quem tem só "editar" cria e altera rascunhos. Publicar, despublicar
--    ou mexer em algo já publicado exige "publicar" no módulo.
--    Fica no banco (gatilho) para não depender da tela.
--    Alterações feitas pelo SQL Editor (suporte) não passam por aqui.
-- ---------------------------------------------------------------------
-- Sem "security definer" de propósito: a função precisa enxergar o papel real de quem
-- grava (anon/authenticated). Com security definer, current_user viraria o dono da
-- função e a regra seria pulada sempre.
create or replace function public.controlar_publicacao()
returns trigger
language plpgsql set search_path = public
as $$
declare
  v_modulo text := tg_argv[0];
begin
  if current_user not in ('anon', 'authenticated') then
    if new.situacao = 'publicado' and new.publicado_em is null then new.publicado_em := now(); end if;
    return new;
  end if;

  if (new.situacao = 'publicado' or (tg_op = 'UPDATE' and old.situacao = 'publicado'))
     and not public.tem_permissao(new.orgao_id, v_modulo, 'publicar') then
    raise exception 'Seu perfil não pode publicar nem alterar o que já está publicado. Salve como rascunho e peça a quem aprova.';
  end if;

  if new.situacao = 'publicado' and new.publicado_em is null then
    new.publicado_em := now();
  end if;
  return new;
end;
$$;

drop trigger if exists noticias_publicacao on public.noticias;
create trigger noticias_publicacao before insert or update on public.noticias
  for each row execute function public.controlar_publicacao('noticias');
drop trigger if exists publicacoes_publicacao on public.publicacoes;
create trigger publicacoes_publicacao before insert or update on public.publicacoes
  for each row execute function public.controlar_publicacao('publicacoes');
drop trigger if exists paginas_publicacao on public.paginas;
create trigger paginas_publicacao before insert or update on public.paginas
  for each row execute function public.controlar_publicacao('paginas');


-- ---------------------------------------------------------------------
-- 5. GATILHOS PADRÃO (data de atualização e histórico) EM TODAS AS TABELAS
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['noticias', 'banners', 'avisos', 'publicacoes', 'paginas', 'faq', 'menu_itens'] loop
    execute format('drop trigger if exists %1$s_atualizado on public.%1$I', t);
    execute format('create trigger %1$s_atualizado before update on public.%1$I
                    for each row execute function public.marcar_atualizacao()', t);
    execute format('drop trigger if exists %1$s_historico on public.%1$I', t);
    execute format('create trigger %1$s_historico after insert or update or delete on public.%1$I
                    for each row execute function public.registrar_historico()', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;


-- ---------------------------------------------------------------------
-- 6. REGRAS DE ACESSO (RLS)
--    Leitura pública só do que está no ar; membros do órgão veem tudo.
--    Gravação: permissão no módulo + alcance. Tabelas com unidade_id
--    aceitam usuário setorial (só na própria unidade); as demais exigem
--    alcance no órgão todo (banner, aviso, menu, página são do órgão).
-- ---------------------------------------------------------------------
do $$
declare
  r record;
  alcance text;
begin
  for r in select * from (values
    ('noticias',    'noticias',    true,  $q$situacao = 'publicado' and publicado_em <= now()$q$),
    ('banners',     'noticias',    false, $q$ativo and (inicio is null or inicio <= current_date) and (fim is null or fim >= current_date)$q$),
    ('avisos',      'noticias',    false, $q$ativo and inicio <= now() and (fim is null or fim > now())$q$),
    ('publicacoes', 'publicacoes', true,  $q$situacao = 'publicado'$q$),
    ('paginas',     'paginas',     false, $q$situacao = 'publicado'$q$),
    ('faq',         'paginas',     false, $q$ativo$q$),
    ('menu_itens',  'menu',        false, $q$ativo$q$)
  ) as v(tabela, modulo, com_unidade, publico)
  loop
    alcance := case when r.com_unidade then 'unidade_id' else 'null' end;

    execute format('drop policy if exists "%1$s: leitura" on public.%1$I', r.tabela);
    execute format('create policy "%1$s: leitura" on public.%1$I for select to anon, authenticated
                    using ((%2$s) or public.e_membro(orgao_id))', r.tabela, r.publico);

    execute format('drop policy if exists "%1$s: inclusão" on public.%1$I', r.tabela);
    execute format('create policy "%1$s: inclusão" on public.%1$I for insert to authenticated
                    with check (public.tem_permissao(orgao_id, %2$L, ''editar'') and public.no_alcance(orgao_id, %3$s))',
                   r.tabela, r.modulo, alcance);

    execute format('drop policy if exists "%1$s: edição" on public.%1$I', r.tabela);
    execute format('create policy "%1$s: edição" on public.%1$I for update to authenticated
                    using (public.tem_permissao(orgao_id, %2$L, ''editar'') and public.no_alcance(orgao_id, %3$s))
                    with check (public.tem_permissao(orgao_id, %2$L, ''editar'') and public.no_alcance(orgao_id, %3$s))',
                   r.tabela, r.modulo, alcance);

    execute format('drop policy if exists "%1$s: exclusão" on public.%1$I', r.tabela);
    execute format('create policy "%1$s: exclusão" on public.%1$I for delete to authenticated
                    using (public.tem_permissao(orgao_id, %2$L, ''excluir'') and public.no_alcance(orgao_id, %3$s))',
                   r.tabela, r.modulo, alcance);

    execute format('grant select on public.%I to anon', r.tabela);
    execute format('grant select, insert, update, delete on public.%I to authenticated', r.tabela);
  end loop;
end;
$$;

grant execute on function public.normalizar_texto(text) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 7. DIÁRIO OFICIAL
--    Riacho da Cruz publica no Diário Oficial dos Municípios (FEMURN),
--    sistema externo: o site só aponta para lá. A chave fica em
--    orgaos.configuracoes (editada na tela "Aparência e contatos").
-- ---------------------------------------------------------------------
comment on column public.orgaos.configuracoes is
  'Itens PÚBLICOS do site. Chaves: nome_exibicao, cor_principal, brasao_url, endereco, cep, telefone, email, horario, instagram, facebook, youtube, whatsapp, diario_oficial_nome, diario_oficial_url.';

update public.orgaos
set configuracoes = configuracoes
  || jsonb_build_object('diario_oficial_nome', 'Diário Oficial dos Municípios do RN (FEMURN)')
  || jsonb_build_object('diario_oficial_url', 'https://www.diariomunicipal.com.br/femurn/')
where cnpj = '08.153.454/0001-04'
  and not (configuracoes ? 'diario_oficial_url');
