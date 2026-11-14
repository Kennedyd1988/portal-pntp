-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 34 — Câmara Municipal: atividade legislativa (PNTP 2026, matriz
-- específica do Poder Legislativo, dimensão 20 "Atividades finalísticas")
--
--   20.1  composição da Casa e biografia dos parlamentares ....... parlamentares
--   20.2  leis e atos infralegais .............................. publicacoes (já existe)
--   20.3  projetos e tramitação (ementa, anexos, situação, autor/relator)
--                                                     proposicoes + _autores + _tramites
--   20.4  pauta das sessões do Plenário ........................ sessoes (colegiado plenário)
--   20.5  pauta das Comissões ................................. sessoes (colegiado comissão) + comissoes
--   20.6  atas das sessões e lista de presença ................. sessoes.ata + sessoes_presencas
--   20.7  votações nominais ................................... votacoes + votacoes_votos
--   20.8  julgamento das contas do Chefe do Executivo .......... documentos_contas 'julgamento_camara' (já existe)
--   20.9  transmissão das sessões / audiências ................. sessoes.video_url + configuracoes.transmissao_url
--   20.10 cotas / verba indenizatória (regulamentação e valores)  verba_indenizatoria + configuracoes.verba_norma*
--   20.11 atividades legislativas de cada parlamentar ........... derivado de autoria, relatoria e presenças
--
-- Também:
--   * modulos.tipos_orgao: módulo que só vale para alguns tipos de órgão
--     (o painel esconde o resto). Legislativo só na Câmara; Saúde, Educação,
--     Renúncias e Emendas só na Prefeitura.
--   * pntp_criterios: matriz 'legislativo' com os 11 critérios.
--   * declarações de inexistência para comissões, votações nominais e verba.
-- Pode rodar mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. MÓDULOS POR TIPO DE ÓRGÃO
-- ---------------------------------------------------------------------
alter table public.modulos add column if not exists tipos_orgao text[];   -- nulo = todos
update public.modulos set tipos_orgao = array['prefeitura'] where codigo in ('saude', 'educacao', 'renuncias', 'emendas') and tipos_orgao is null;

insert into public.modulos (codigo, nome, grupo, ordem, tipos_orgao) values
  ('legislativo', 'Atividade legislativa', 'Conteúdo do site', 35, array['camara'])
on conflict (codigo) do update set tipos_orgao = excluded.tipos_orgao;

-- Permissões iguais às de Publicações oficiais (quem cadastra leis cadastra a atividade legislativa).
insert into public.perfil_permissoes (perfil_id, modulo, pode_ver, pode_editar, pode_publicar, pode_excluir)
select perfil_id, 'legislativo', pode_ver, pode_editar, pode_publicar, pode_excluir
from public.perfil_permissoes where modulo = 'publicacoes'
on conflict (perfil_id, modulo) do nothing;


-- ---------------------------------------------------------------------
-- 1. TABELAS
-- ---------------------------------------------------------------------
-- 20.1 Composição da Casa
create table if not exists public.parlamentares (
  id                 uuid primary key default gen_random_uuid(),
  orgao_id           uuid not null references public.orgaos(id) on delete cascade,
  nome               text not null check (char_length(nome) between 3 and 200),          -- nome civil
  nome_parlamentar   text check (nome_parlamentar is null or char_length(nome_parlamentar) <= 120),
  partido            text check (partido is null or char_length(partido) <= 40),        -- sigla
  cargo_mesa         text check (cargo_mesa is null or char_length(cargo_mesa) <= 80),   -- Presidente, 1º Secretário…
  foto_url           text check (foto_url is null or foto_url ~* '^https?://'),
  biografia          text check (biografia is null or char_length(biografia) <= 8000),
  email              text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  telefone           text check (telefone is null or char_length(telefone) <= 60),
  legislatura_inicio integer check (legislatura_inicio is null or legislatura_inicio between 1990 and 2100),
  legislatura_fim    integer check (legislatura_fim is null or legislatura_fim between 1990 and 2100),
  em_exercicio       boolean not null default true,     -- falso: licenciado, ex-vereador (fica no histórico)
  ordem              integer not null default 0,
  situacao           text not null default 'rascunho' check (situacao in ('rascunho', 'publicado')),
  publicado_em       timestamptz,
  busca              text generated always as (public.normalizar_texto(nome || ' ' || coalesce(nome_parlamentar, '') || ' ' || coalesce(partido, ''))) stored,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  constraint parlamentares_legislatura check (legislatura_fim is null or legislatura_inicio is null or legislatura_fim >= legislatura_inicio)
);
create index if not exists parlamentares_lista_idx on public.parlamentares (orgao_id, em_exercicio desc, ordem, nome);

-- 20.5 Comissões
create table if not exists public.comissoes (
  id             uuid primary key default gen_random_uuid(),
  orgao_id       uuid not null references public.orgaos(id) on delete cascade,
  nome           text not null check (char_length(nome) between 3 and 200),
  tipo           text not null default 'permanente' check (tipo in ('permanente', 'temporaria', 'especial', 'cpi', 'outra')),
  competencias   text check (competencias is null or char_length(competencias) <= 4000),
  inicio         date,
  fim            date,
  ativa          boolean not null default true,
  situacao       text not null default 'rascunho' check (situacao in ('rascunho', 'publicado')),
  publicado_em   timestamptz,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  constraint comissoes_datas check (fim is null or inicio is null or fim >= inicio)
);
create table if not exists public.comissoes_membros (
  id             uuid primary key default gen_random_uuid(),
  orgao_id       uuid not null references public.orgaos(id) on delete cascade,
  comissao_id    uuid not null references public.comissoes(id) on delete cascade,
  parlamentar_id uuid not null references public.parlamentares(id) on delete restrict,
  funcao         text not null default 'membro' check (funcao in ('presidente', 'vice_presidente', 'relator', 'membro', 'suplente')),
  criado_em      timestamptz not null default now(),
  constraint comissoes_membros_uk unique (comissao_id, parlamentar_id)
);

-- 20.3 Proposições (projetos de lei, de resolução, de decreto legislativo, requerimentos…)
create table if not exists public.proposicoes (
  id                  uuid primary key default gen_random_uuid(),
  orgao_id            uuid not null references public.orgaos(id) on delete cascade,
  tipo                text not null check (tipo in ('projeto_lei', 'projeto_lei_complementar', 'projeto_emenda_lei_organica', 'projeto_resolucao',
                                                    'projeto_decreto_legislativo', 'requerimento', 'indicacao', 'mocao', 'veto', 'emenda', 'outro')),
  numero              text not null check (char_length(numero) between 1 and 20),
  ano                 integer not null check (ano between 1990 and 2100),
  ementa              text not null check (char_length(ementa) between 5 and 2000),
  autoria_externa     text check (autoria_externa is null or char_length(autoria_externa) <= 200),   -- Poder Executivo, Mesa Diretora, iniciativa popular…
  data_apresentacao   date not null,
  andamento           text not null default 'em_tramitacao' check (andamento in ('em_tramitacao', 'aprovada', 'rejeitada', 'arquivada', 'retirada',
                                                                                 'vetada', 'transformada_norma', 'prejudicada')),
  norma_id            uuid references public.publicacoes(id) on delete set null,   -- a lei/resolução que resultou
  arquivo_url         text check (arquivo_url is null or arquivo_url ~* '^https?://'),       -- texto da proposição (PDF)
  link_externo        text check (link_externo is null or link_externo ~* '^https?://'),     -- sistema legislativo (SAPL…)
  situacao            text not null default 'rascunho' check (situacao in ('rascunho', 'publicado')),
  publicado_em        timestamptz,
  busca               text generated always as (public.normalizar_texto(tipo || ' ' || numero || ' ' || ano || ' ' || ementa || ' ' || coalesce(autoria_externa, ''))) stored,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);
create unique index if not exists proposicoes_uk on public.proposicoes (orgao_id, tipo, public.normalizar_texto(numero), ano);
create index if not exists proposicoes_lista_idx on public.proposicoes (orgao_id, ano desc, data_apresentacao desc, id desc);

create table if not exists public.proposicoes_autores (
  id             uuid primary key default gen_random_uuid(),
  orgao_id       uuid not null references public.orgaos(id) on delete cascade,
  proposicao_id  uuid not null references public.proposicoes(id) on delete cascade,
  parlamentar_id uuid not null references public.parlamentares(id) on delete restrict,
  papel          text not null default 'autor' check (papel in ('autor', 'coautor', 'relator')),
  criado_em      timestamptz not null default now(),
  constraint proposicoes_autores_uk unique (proposicao_id, parlamentar_id, papel)
);
create index if not exists proposicoes_autores_parl_idx on public.proposicoes_autores (parlamentar_id, papel);

create table if not exists public.proposicoes_tramites (
  id             uuid primary key default gen_random_uuid(),
  orgao_id       uuid not null references public.orgaos(id) on delete cascade,
  proposicao_id  uuid not null references public.proposicoes(id) on delete cascade,
  data           date not null,
  descricao      text not null check (char_length(descricao) between 3 and 1000),   -- Leitura em plenário, Parecer da CLJ, Aprovado em 1ª discussão…
  arquivo_url    text check (arquivo_url is null or arquivo_url ~* '^https?://'),   -- parecer, emenda, autógrafo…
  criado_em      timestamptz not null default now()
);
create index if not exists proposicoes_tramites_idx on public.proposicoes_tramites (proposicao_id, data, criado_em);

-- 20.4, 20.5, 20.6, 20.9 Sessões do Plenário e reuniões das comissões
create table if not exists public.sessoes (
  id               uuid primary key default gen_random_uuid(),
  orgao_id         uuid not null references public.orgaos(id) on delete cascade,
  comissao_id      uuid references public.comissoes(id) on delete restrict,   -- nulo = Plenário
  tipo             text not null default 'ordinaria' check (tipo in ('ordinaria', 'extraordinaria', 'solene', 'especial', 'audiencia_publica', 'reuniao')),
  numero           text check (numero is null or char_length(numero) <= 20),
  data             date not null,
  hora             time,
  local            text check (local is null or char_length(local) <= 200),
  pauta            text check (pauta is null or char_length(pauta) <= 20000),     -- matérias (texto pesquisável)
  pauta_url        text check (pauta_url is null or pauta_url ~* '^https?://'),
  ata_url          text check (ata_url is null or ata_url ~* '^https?://'),
  ata_aprovada_em  date,
  video_url        text check (video_url is null or video_url ~* '^https?://'),   -- transmissão ou gravação
  andamento        text not null default 'prevista' check (andamento in ('prevista', 'realizada', 'cancelada', 'adiada')),
  situacao         text not null default 'rascunho' check (situacao in ('rascunho', 'publicado')),
  publicado_em     timestamptz,
  busca            text generated always as (public.normalizar_texto(tipo || ' ' || coalesce(numero, '') || ' ' || coalesce(pauta, ''))) stored,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);
create index if not exists sessoes_lista_idx on public.sessoes (orgao_id, data desc, id desc);

create table if not exists public.sessoes_presencas (
  id             uuid primary key default gen_random_uuid(),
  orgao_id       uuid not null references public.orgaos(id) on delete cascade,
  sessao_id      uuid not null references public.sessoes(id) on delete cascade,
  parlamentar_id uuid not null references public.parlamentares(id) on delete restrict,
  presente       boolean not null default true,
  justificativa  text check (justificativa is null or char_length(justificativa) <= 300),
  criado_em      timestamptz not null default now(),
  constraint sessoes_presencas_uk unique (sessao_id, parlamentar_id)
);

-- 20.7 Votações
create table if not exists public.votacoes (
  id             uuid primary key default gen_random_uuid(),
  orgao_id       uuid not null references public.orgaos(id) on delete cascade,
  sessao_id      uuid not null references public.sessoes(id) on delete cascade,
  proposicao_id  uuid references public.proposicoes(id) on delete set null,
  descricao      text not null check (char_length(descricao) between 3 and 500),   -- Projeto de Lei nº 12/2026 — 2ª discussão
  forma          text not null default 'nominal' check (forma in ('nominal', 'simbolica', 'secreta')),
  unanime        boolean not null default false,
  resultado      text not null check (resultado in ('aprovada', 'rejeitada', 'outro')),
  votos_sim      integer check (votos_sim is null or votos_sim >= 0),
  votos_nao      integer check (votos_nao is null or votos_nao >= 0),
  abstencoes     integer check (abstencoes is null or abstencoes >= 0),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
create index if not exists votacoes_sessao_idx on public.votacoes (sessao_id);
create table if not exists public.votacoes_votos (
  id             uuid primary key default gen_random_uuid(),
  orgao_id       uuid not null references public.orgaos(id) on delete cascade,
  votacao_id     uuid not null references public.votacoes(id) on delete cascade,
  parlamentar_id uuid not null references public.parlamentares(id) on delete restrict,
  voto           text not null check (voto in ('sim', 'nao', 'abstencao', 'ausente', 'nao_votou')),
  constraint votacoes_votos_uk unique (votacao_id, parlamentar_id)
);

-- 20.10 Verba indenizatória / cota parlamentar (valores; a regulamentação fica em configuracoes)
create table if not exists public.verba_indenizatoria (
  id                uuid primary key default gen_random_uuid(),
  orgao_id          uuid not null references public.orgaos(id) on delete cascade,
  parlamentar_id    uuid not null references public.parlamentares(id) on delete restrict,
  data              date not null,                       -- pagamento/reembolso
  descricao         text not null check (char_length(descricao) between 3 and 500),
  beneficiario_nome text check (beneficiario_nome is null or char_length(beneficiario_nome) <= 200),   -- quem recebeu (empresa, posto…)
  beneficiario_doc  text check (beneficiario_doc is null or beneficiario_doc ~ '^(\d{11}|\d{14})$'),
  valor             numeric(14, 2) not null check (valor > 0),
  documento_url     text check (documento_url is null or documento_url ~* '^https?://'),
  situacao          text not null default 'rascunho' check (situacao in ('rascunho', 'publicado')),
  publicado_em      timestamptz,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);
create index if not exists verba_indenizatoria_lista_idx on public.verba_indenizatoria (orgao_id, data desc, id desc);

comment on column public.orgaos.configuracoes is
  'Itens PÚBLICOS do site. Chaves: nome_exibicao, cor_principal, brasao_url, endereco, cep, telefone, email, horario, instagram, facebook, youtube, whatsapp, diario_oficial_nome, diario_oficial_url; Câmara (script 34): transmissao_url (canal das sessões ao vivo), verba_norma (texto) e verba_norma_url (regulamentação da verba indenizatória), verba_inexistente (true: a Câmara não paga verba/cota).';


-- ---------------------------------------------------------------------
-- 2. GATILHOS, REGRAS DE ACESSO E PERMISSÕES (todas no módulo 'legislativo')
-- ---------------------------------------------------------------------
-- Filho pertence ao mesmo órgão do pai (impede misturar órgãos pela API).
create or replace function public.conferir_orgao_legislativo()
returns trigger language plpgsql set search_path = public as $$
declare v uuid; j jsonb := to_jsonb(new);
begin
  -- to_jsonb: cada tabela tem uma coluna de pai diferente (o "new" não tem as das outras).
  v := case tg_table_name
    when 'comissoes_membros'    then (select orgao_id from public.comissoes where id = (j ->> 'comissao_id')::uuid)
    when 'proposicoes_autores'  then (select orgao_id from public.proposicoes where id = (j ->> 'proposicao_id')::uuid)
    when 'proposicoes_tramites' then (select orgao_id from public.proposicoes where id = (j ->> 'proposicao_id')::uuid)
    when 'sessoes_presencas'    then (select orgao_id from public.sessoes where id = (j ->> 'sessao_id')::uuid)
    when 'votacoes'             then (select orgao_id from public.sessoes where id = (j ->> 'sessao_id')::uuid)
    when 'votacoes_votos'       then (select orgao_id from public.votacoes where id = (j ->> 'votacao_id')::uuid)
  end;
  if v is distinct from new.orgao_id then raise exception 'Registro de outro órgão.'; end if;
  if tg_table_name in ('comissoes_membros', 'proposicoes_autores', 'sessoes_presencas', 'votacoes_votos')
     and not exists (select 1 from public.parlamentares p where p.id = (j ->> 'parlamentar_id')::uuid and p.orgao_id = new.orgao_id) then
    raise exception 'Parlamentar de outro órgão.';
  end if;
  return new;
end $$;

do $$
declare
  t text;
  principais text[] := array['parlamentares', 'comissoes', 'proposicoes', 'sessoes', 'verba_indenizatoria'];
  filhos text[][] := array[
    ['comissoes_membros', 'comissoes', 'comissao_id'],
    ['proposicoes_autores', 'proposicoes', 'proposicao_id'],
    ['proposicoes_tramites', 'proposicoes', 'proposicao_id'],
    ['sessoes_presencas', 'sessoes', 'sessao_id'],
    ['votacoes', 'sessoes', 'sessao_id']];
  f text[];
  leitura text;
begin
  foreach t in array principais loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop trigger if exists %1$s_publicacao on public.%1$I', t);
    execute format('create trigger %1$s_publicacao before insert or update on public.%1$I for each row execute function public.controlar_publicacao(''legislativo'')', t);
    execute format('drop policy if exists "%1$s: leitura" on public.%1$I', t);
    execute format('create policy "%1$s: leitura" on public.%1$I for select to anon, authenticated using (situacao = ''publicado'' or public.e_membro(orgao_id))', t);
  end loop;
  foreach f slice 1 in array filhos loop
    execute format('alter table public.%I enable row level security', f[1]);
    execute format('drop trigger if exists %1$s_orgao on public.%1$I', f[1]);
    execute format('create trigger %1$s_orgao before insert or update on public.%1$I for each row execute function public.conferir_orgao_legislativo()', f[1]);
    execute format('drop policy if exists "%1$s: leitura" on public.%1$I', f[1]);
    execute format('create policy "%1$s: leitura" on public.%1$I for select to anon, authenticated using (public.e_membro(orgao_id) or exists (select 1 from public.%2$I x where x.id = %3$I and x.situacao = ''publicado''))', f[1], f[2], f[3]);
  end loop;
  alter table public.votacoes_votos enable row level security;
  drop trigger if exists votacoes_votos_orgao on public.votacoes_votos;
  create trigger votacoes_votos_orgao before insert or update on public.votacoes_votos for each row execute function public.conferir_orgao_legislativo();
  drop policy if exists "votacoes_votos: leitura" on public.votacoes_votos;
  create policy "votacoes_votos: leitura" on public.votacoes_votos for select to anon, authenticated
    using (public.e_membro(orgao_id) or exists (select 1 from public.votacoes v join public.sessoes s on s.id = v.sessao_id where v.id = votacao_id and s.situacao = 'publicado'));

  foreach t in array principais || array['comissoes_membros', 'proposicoes_autores', 'proposicoes_tramites', 'sessoes_presencas', 'votacoes', 'votacoes_votos'] loop
    if t not in ('comissoes_membros', 'proposicoes_autores', 'sessoes_presencas', 'votacoes_votos', 'proposicoes_tramites') then
      execute format('drop trigger if exists %1$s_atualizado on public.%1$I', t);
      execute format('create trigger %1$s_atualizado before update on public.%1$I for each row execute function public.marcar_atualizacao()', t);
    end if;
    execute format('drop trigger if exists %1$s_historico on public.%1$I', t);
    execute format('create trigger %1$s_historico after insert or update or delete on public.%1$I for each row execute function public.registrar_historico()', t);
    execute format('drop policy if exists "%1$s: inclusão" on public.%1$I', t);
    execute format('create policy "%1$s: inclusão" on public.%1$I for insert to authenticated with check (public.tem_permissao(orgao_id, ''legislativo'', ''editar'') and public.no_alcance(orgao_id, null))', t);
    execute format('drop policy if exists "%1$s: edição" on public.%1$I', t);
    execute format('create policy "%1$s: edição" on public.%1$I for update to authenticated using (public.tem_permissao(orgao_id, ''legislativo'', ''editar'') and public.no_alcance(orgao_id, null)) with check (public.tem_permissao(orgao_id, ''legislativo'', ''editar'') and public.no_alcance(orgao_id, null))', t);
    execute format('drop policy if exists "%1$s: exclusão" on public.%1$I', t);
    execute format('create policy "%1$s: exclusão" on public.%1$I for delete to authenticated using (public.tem_permissao(orgao_id, ''legislativo'', %2$L) and public.no_alcance(orgao_id, null))',
      t, case when t = any (principais) then 'excluir' else 'editar' end);
    execute format('grant select on public.%I to anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Visitante não lê o CPF/CNPJ "cru" de quem recebeu a verba: a página usa a função abaixo (CPF mascarado).
revoke select on public.verba_indenizatoria from anon;
create or replace function public.verba_publica(p_orgao uuid, p_ano integer)
returns table (id uuid, parlamentar_id uuid, parlamentar text, data date, descricao text, beneficiario_nome text, beneficiario_doc text, valor numeric, documento_url text)
language sql stable security definer set search_path = public as $$
  select v.id, v.parlamentar_id, coalesce(p.nome_parlamentar, p.nome), v.data, v.descricao, v.beneficiario_nome,
         case when length(v.beneficiario_doc) = 11 then '***.' || substr(v.beneficiario_doc, 4, 3) || '.' || substr(v.beneficiario_doc, 7, 3) || '-**'
              else v.beneficiario_doc end,
         v.valor, v.documento_url
  from public.verba_indenizatoria v join public.parlamentares p on p.id = v.parlamentar_id
  where v.orgao_id = p_orgao and v.situacao = 'publicado' and extract(year from v.data)::int = p_ano
  order by v.data desc, v.id;
$$;
grant execute on function public.verba_publica(uuid, integer) to anon, authenticated;

-- Anos com dados (abas de exercício no painel e no site).
create or replace function public.legislativo_anos(p_orgao uuid, p_qual text)
returns table (ano integer, total bigint)
language sql stable security definer set search_path = public as $$
  -- security definer: a verba não é legível direto pelo visitante (CPF); aqui só se contam os publicados
  -- (ou tudo, para quem é da equipe do órgão).
  with m as (select public.e_membro(p_orgao) as eq)
  select x.ano, count(*) from m, (
    select p.ano, p.situacao from public.proposicoes p where p_qual = 'proposicoes' and p.orgao_id = p_orgao
    union all select extract(year from s.data)::int, s.situacao from public.sessoes s where p_qual = 'sessoes' and s.orgao_id = p_orgao
    union all select extract(year from v.data)::int, v.situacao from public.verba_indenizatoria v where p_qual = 'verba' and v.orgao_id = p_orgao
    union all select extract(year from s.data)::int, s.situacao from public.votacoes v join public.sessoes s on s.id = v.sessao_id where p_qual = 'votacoes' and v.orgao_id = p_orgao
    union all select extract(year from s.data)::int, s.situacao from public.sessoes s where p_qual = 'comissoes' and s.orgao_id = p_orgao and s.comissao_id is not null
  ) x where x.situacao = 'publicado' or m.eq
  group by x.ano order by x.ano desc;
$$;
grant execute on function public.legislativo_anos(uuid, text) to anon, authenticated;

-- 20.11 Atividade de cada parlamentar no ano (autoria, relatoria, presenças e votos).
create or replace function public.atividade_parlamentar(p_orgao uuid, p_ano integer)
returns table (parlamentar_id uuid, nome text, partido text, autorias bigint, relatorias bigint, sessoes bigint, presencas bigint, votos bigint, comissoes text)
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
       from public.comissoes_membros m join public.comissoes c on c.id = m.comissao_id where m.parlamentar_id = p.id and c.situacao = 'publicado' and c.ativa)
  from public.parlamentares p
  where p.orgao_id = p_orgao and p.situacao = 'publicado'
  order by p.em_exercicio desc, p.ordem, p.nome;
$$;
grant execute on function public.atividade_parlamentar(uuid, integer) to anon, authenticated;


-- Configurações públicas da Câmara (transmissão e regulamentação da verba), gravadas por quem edita
-- a Atividade legislativa (sem precisar de acesso à Aparência). Só estas chaves.
create or replace function public.salvar_config_legislativo(p_orgao uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare novo jsonb := '{}'::jsonb; k text;
begin
  if not public.tem_permissao(p_orgao, 'legislativo', 'editar') then raise exception 'Seu perfil não pode alterar a Atividade legislativa.'; end if;
  foreach k in array array['transmissao_url', 'verba_norma_url'] loop
    if p ? k then
      if coalesce(p ->> k, '') <> '' and (p ->> k) !~* '^https?://' then raise exception 'Endereço inválido: use o endereço completo, começando com https://'; end if;
      novo := novo || jsonb_build_object(k, nullif(btrim(p ->> k), ''));
    end if;
  end loop;
  if p ? 'verba_norma' then novo := novo || jsonb_build_object('verba_norma', nullif(left(btrim(p ->> 'verba_norma'), 300), '')); end if;
  if p ? 'verba_inexistente' then novo := novo || jsonb_build_object('verba_inexistente', coalesce((p ->> 'verba_inexistente')::boolean, false)); end if;
  update public.orgaos set configuracoes = coalesce(configuracoes, '{}'::jsonb) || novo where id = p_orgao;
  return novo;
end $$;
grant execute on function public.salvar_config_legislativo(uuid, jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- 3. DECLARAÇÕES DE QUE NÃO HÁ DADOS (comissões, votações nominais, verba)
-- ---------------------------------------------------------------------
create or replace function public.modulo_da_parte(p_chave text)
returns text language sql immutable set search_path = public as $$
  select case
    when p_chave in ('receitas_arrecadacao', 'receitas_divida_ativa', 'despesas_empenhos', 'ordem_cronologica') then 'financeiro'
    when p_chave in ('pessoal_servidores', 'pessoal_remuneracao', 'pessoal_cargos', 'pessoal_estagiarios', 'pessoal_terceirizados') then 'pessoal'
    when p_chave in ('diarias_concedidas', 'diarias_tabela') then 'diarias'
    when p_chave = 'concursos' then 'concursos'
    when p_chave in ('convenios_recebidas', 'convenios_realizadas', 'convenios_acordos') then 'convenios'
    when p_chave in ('emendas_federais', 'emendas_estaduais') then 'emendas'
    when p_chave in ('licitacoes_licitacoes', 'licitacoes_diretas', 'licitacoes_adesoes') then 'licitacoes'
    when p_chave = 'pca' then 'pca'
    when p_chave = 'sancionados' then 'sancoes'
    when p_chave in ('contratos', 'fiscais') then 'contratos'
    when p_chave in ('obras', 'obras_paralisadas') then 'obras'
    when p_chave in ('planejamento_ppa', 'planejamento_ldo', 'planejamento_loa', 'planejamento_plano_estrategico', 'planejamento_rreo',
                     'planejamento_rgf', 'planejamento_balanco', 'planejamento_relatorio_gestao', 'planejamento_parecer_tce',
                     'planejamento_julgamento_camara') then 'contas'
    when p_chave in ('renuncias_desoneracoes', 'renuncias_valores', 'renuncias_beneficiarios', 'renuncias_incentivos') then 'renuncias'
    when p_chave in ('saude_documentos', 'saude_servicos', 'saude_espera', 'saude_medicamentos', 'saude_estoque', 'saude_conselho') then 'saude'
    when p_chave in ('educacao_documentos', 'educacao_creches', 'educacao_fundeb', 'educacao_assistencia', 'educacao_conselhos') then 'educacao'
    when p_chave in ('esic_relatorios', 'esic_classificadas', 'esic_desclassificadas') then 'esic'
    when p_chave = 'ouvidoria_relatorios' then 'ouvidoria'
    when p_chave in ('legislativo_comissoes', 'legislativo_votacoes', 'legislativo_verba') then 'legislativo'
  end;
$$;


-- ---------------------------------------------------------------------
-- 4. CRITÉRIOS DO PNTP 2026 — matriz específica do Poder Legislativo
--    (Cartilha 2026: 7 obrigatórios e 4 recomendados; dimensão de peso 3)
-- ---------------------------------------------------------------------
alter table public.pntp_criterios drop constraint if exists pntp_criterios_matriz_check;
alter table public.pntp_criterios add constraint pntp_criterios_matriz_check
  check (matriz in ('comum', 'executivo', 'executivo_consorcio', 'legislativo'));

insert into public.pntp_criterios (codigo, ordem, dimensao, peso_dimensao, titulo, classificacao, matriz, itens, modulo, rota, pagina) values
  ('20.1',  2001, 'Atividades finalísticas (Legislativo)', 3, 'Composição da Casa e biografia dos parlamentares', 'obrigatoria', 'legislativo', 'D', 'legislativo', '#/m/legislativo?aba=parlamentares', '/parlamentares'),
  ('20.2',  2002, 'Atividades finalísticas (Legislativo)', 3, 'Leis e atos infralegais (resoluções, decretos legislativos)', 'obrigatoria', 'legislativo', 'DASF', 'publicacoes', '#/m/publicacoes', '/publicacoes'),
  ('20.3',  2003, 'Atividades finalísticas (Legislativo)', 3, 'Projetos e tramitação (ementa, anexos, situação, autor e relator)', 'obrigatoria', 'legislativo', 'DASF', 'legislativo', '#/m/legislativo?aba=proposicoes', '/proposicoes'),
  ('20.4',  2004, 'Atividades finalísticas (Legislativo)', 3, 'Pauta das sessões do Plenário', 'obrigatoria', 'legislativo', 'DAGF', 'legislativo', '#/m/legislativo?aba=sessoes', '/sessoes'),
  ('20.5',  2005, 'Atividades finalísticas (Legislativo)', 3, 'Pauta das Comissões', 'obrigatoria', 'legislativo', 'DAGF', 'legislativo', '#/m/legislativo?aba=comissoes', '/comissoes'),
  ('20.6',  2006, 'Atividades finalísticas (Legislativo)', 3, 'Atas das sessões e lista de presença dos parlamentares', 'obrigatoria', 'legislativo', 'DASGF', 'legislativo', '#/m/legislativo?aba=sessoes', '/sessoes'),
  ('20.7',  2007, 'Atividades finalísticas (Legislativo)', 3, 'Votações nominais', 'recomendada', 'legislativo', 'DASGF', 'legislativo', '#/m/legislativo?aba=sessoes', '/votacoes'),
  ('20.8',  2008, 'Atividades finalísticas (Legislativo)', 3, 'Julgamento das contas do Chefe do Executivo (ato e teor)', 'obrigatoria', 'legislativo', 'DASF', 'contas', '#/m/contas', '/planejamento'),
  ('20.9',  2009, 'Atividades finalísticas (Legislativo)', 3, 'Transmissão das sessões, audiências e consultas públicas', 'recomendada', 'legislativo', 'D', 'legislativo', '#/m/legislativo?aba=transmissao', '/sessoes'),
  ('20.10', 2010, 'Atividades finalísticas (Legislativo)', 3, 'Cotas e verba indenizatória: regulamentação e valores', 'recomendada', 'legislativo', 'DASGF', 'legislativo', '#/m/legislativo?aba=verba', '/verba-indenizatoria'),
  ('20.11', 2011, 'Atividades finalísticas (Legislativo)', 3, 'Atividades legislativas de cada parlamentar', 'recomendada', 'legislativo', 'DASF', 'legislativo', '#/m/legislativo?aba=parlamentares', '/atividade-parlamentar')
on conflict (codigo) do update set ordem = excluded.ordem, dimensao = excluded.dimensao, peso_dimensao = excluded.peso_dimensao, titulo = excluded.titulo,
  classificacao = excluded.classificacao, matriz = excluded.matriz, itens = excluded.itens, modulo = excluded.modulo, rota = excluded.rota, pagina = excluded.pagina;


-- ---------------------------------------------------------------------
-- 5. AUTOAVALIAÇÃO DOS CRITÉRIOS 20.x (chamada por avaliacao_pntp, script 26,
--    quando o órgão é Câmara). Devolve a lista no mesmo formato da função:
--    [{c, d, a, s, ext, f}]. Série histórica: o ano anterior e os 2 antes dele.
-- ---------------------------------------------------------------------
create or replace function public.pntp_legislativo_itens(p_orgao uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  hoje date := current_date;
  v_ano int := extract(year from current_date)::int;
  cfg jsonb := coalesce((select configuracoes from public.orgaos where id = p_orgao), '{}'::jsonb);
  r jsonb := '[]'::jsonb;
  d boolean; a boolean; ext boolean; n bigint; n2 bigint; anos int[]; falt int[]; ult date;
begin
  -- 20.1 Composição e biografias
  ext := public.pntp_externo(cfg, array['parlamentares']);
  select count(*), count(*) filter (where coalesce(char_length(p.biografia), 0) < 30 or p.foto_url is null or coalesce(p.partido, '') = '')
    into n, n2 from public.parlamentares p where p.orgao_id = p_orgao and p.situacao = 'publicado' and p.em_exercicio;
  r := r || jsonb_build_object('c', '20.1', 'd', n > 0 and n2 = 0, 'ext', ext, 'f', array_remove(array[
    case when n = 0 then 'Publique os parlamentares em exercício (Atividade legislativa › Parlamentares).' end,
    case when n2 > 0 then n2 || ' parlamentar(es) sem foto, partido ou biografia.' end], null));

  -- 20.2 Leis e atos infralegais
  ext := public.pntp_externo(cfg, array['publicacoes']);
  select coalesce(array_agg(distinct p.ano), '{}'), max(p.data_publicacao) into anos, ult
    from public.publicacoes p where p.orgao_id = p_orgao and p.situacao = 'publicado';
  falt := public.pntp_anos_faltando(p_orgao, array['publicacoes'], anos, v_ano - 1);
  d := ult is not null;
  r := r || jsonb_build_object('c', '20.2', 'd', d, 'a', d, 's', cardinality(falt) = 0, 'ext', ext, 'f', array_remove(array[
    case when not d then 'Nenhuma lei, resolução ou decreto legislativo publicado (Publicações oficiais).' end,
    case when d and cardinality(falt) > 0 then 'Série histórica: sem atos publicados em ' || array_to_string(falt, ', ') || '.' end], null));

  -- 20.3 Projetos e tramitação
  ext := public.pntp_externo(cfg, array['proposicoes']);
  select coalesce(array_agg(distinct x.ano), '{}'),
         greatest(max(x.data_apresentacao), (select max(t.data) from public.proposicoes_tramites t join public.proposicoes y on y.id = t.proposicao_id
                                              where y.orgao_id = p_orgao and y.situacao = 'publicado')),
         count(*) filter (where x.autoria_externa is null and not exists (select 1 from public.proposicoes_autores a2 where a2.proposicao_id = x.id and a2.papel in ('autor', 'coautor')))
    into anos, ult, n2
    from public.proposicoes x where x.orgao_id = p_orgao and x.situacao = 'publicado';
  falt := public.pntp_anos_faltando(p_orgao, array['proposicoes'], anos, v_ano - 1);
  d := ult is not null;
  a := coalesce(ult >= hoje - 30, false);
  r := r || jsonb_build_object('c', '20.3', 'd', d and n2 = 0, 'a', a, 's', cardinality(falt) = 0, 'ext', ext, 'f', array_remove(array[
    case when not d then 'Nenhuma proposição publicada (Atividade legislativa › Proposições).' end,
    case when n2 > 0 then n2 || ' proposição(ões) sem autor.' end,
    case when d and not a then 'Proposições e tramitação sem movimento nos últimos 30 dias: atualize as tramitações.' end,
    case when d and cardinality(falt) > 0 then 'Série histórica: sem proposições em ' || array_to_string(falt, ', ') || '.' end], null));

  -- 20.4 Pauta do Plenário
  ext := public.pntp_externo(cfg, array['sessoes']);
  select max(s.data) into ult from public.sessoes s
    where s.orgao_id = p_orgao and s.situacao = 'publicado' and s.comissao_id is null and (coalesce(s.pauta, '') <> '' or s.pauta_url is not null);
  d := ult is not null;
  a := coalesce(ult >= hoje - 30, false);
  r := r || jsonb_build_object('c', '20.4', 'd', d, 'a', a, 'ext', ext, 'f', array_remove(array[
    case when not d then 'Nenhuma pauta de sessão do Plenário publicada (Atividade legislativa › Sessões).' end,
    case when d and not a then 'Última pauta do Plenário tem mais de 30 dias.' end], null));

  -- 20.5 Pauta das Comissões
  ext := public.pntp_externo(cfg, array['comissoes']);
  select max(s.data) into ult from public.sessoes s
    where s.orgao_id = p_orgao and s.situacao = 'publicado' and s.comissao_id is not null and (coalesce(s.pauta, '') <> '' or s.pauta_url is not null);
  d := ult is not null or public.pntp_declarado(p_orgao, array['legislativo_comissoes'], hoje - 30, hoje);
  a := coalesce(ult >= hoje - 30, false) or public.pntp_declarado(p_orgao, array['legislativo_comissoes'], hoje - 30, hoje);
  r := r || jsonb_build_object('c', '20.5', 'd', d, 'a', a, 'ext', ext, 'f', array_remove(array[
    case when not d then 'Nenhuma pauta de comissão publicada: cadastre as reuniões das comissões ou declare que não houve.' end,
    case when d and not a then 'Última pauta de comissão tem mais de 30 dias (ou declare que não houve reunião no período).' end], null));

  -- 20.6 Atas e presenças
  ext := public.pntp_externo(cfg, array['sessoes']);
  select coalesce(array_agg(distinct extract(year from s.data)::int), '{}'), max(s.data) into anos, ult
    from public.sessoes s where s.orgao_id = p_orgao and s.situacao = 'publicado' and s.ata_url is not null
      and exists (select 1 from public.sessoes_presencas sp where sp.sessao_id = s.id);
  select count(*) into n2 from public.sessoes s where s.orgao_id = p_orgao and s.situacao = 'publicado' and s.andamento = 'realizada'
    and s.data between hoje - 120 and hoje - 30 and (s.ata_url is null or not exists (select 1 from public.sessoes_presencas sp where sp.sessao_id = s.id));
  falt := public.pntp_anos_faltando(p_orgao, array['sessoes'], anos, v_ano - 1);
  d := ult is not null;
  a := d and n2 = 0;
  r := r || jsonb_build_object('c', '20.6', 'd', d, 'a', a, 's', cardinality(falt) = 0, 'ext', ext, 'f', array_remove(array[
    case when not d then 'Nenhuma sessão com ata e lista de presença publicada.' end,
    case when n2 > 0 then n2 || ' sessão(ões) realizada(s) há mais de 30 dias sem ata ou sem presenças.' end,
    case when d and cardinality(falt) > 0 then 'Série histórica: sem atas em ' || array_to_string(falt, ', ') || '.' end], null));

  -- 20.7 Votações nominais
  ext := public.pntp_externo(cfg, array['votacoes']);
  select coalesce(array_agg(distinct extract(year from s.data)::int), '{}'), max(s.data) into anos, ult
    from public.votacoes v join public.sessoes s on s.id = v.sessao_id
   where v.orgao_id = p_orgao and s.situacao = 'publicado' and (v.unanime or exists (select 1 from public.votacoes_votos vv where vv.votacao_id = v.id));
  falt := public.pntp_anos_faltando(p_orgao, array['legislativo_votacoes'], anos, v_ano - 1);
  d := ult is not null or public.pntp_declarado(p_orgao, array['legislativo_votacoes'], hoje - 30, hoje);
  a := coalesce(ult >= hoje - 30, false) or public.pntp_declarado(p_orgao, array['legislativo_votacoes'], hoje - 30, hoje);
  r := r || jsonb_build_object('c', '20.7', 'd', d, 'a', a, 's', cardinality(falt) = 0, 'ext', ext, 'f', array_remove(array[
    case when not d then 'Nenhuma votação publicada: registre os votos nominais nas sessões ou declare que não houve votação nominal.' end,
    case when d and not a then 'Última votação publicada tem mais de 30 dias.' end,
    case when d and cardinality(falt) > 0 then 'Série histórica: sem votações em ' || array_to_string(falt, ', ') || '.' end], null));

  -- 20.8 Julgamento das contas do Chefe do Executivo
  ext := public.pntp_externo(cfg, array['planejamento', 'planejamento_julgamento_camara']);
  select coalesce(array_agg(distinct k.exercicio), '{}') into anos from public.documentos_contas k
   where k.orgao_id = p_orgao and k.tipo = 'julgamento_camara' and k.situacao = 'publicado';
  falt := public.pntp_anos_faltando(p_orgao, array['planejamento_julgamento_camara'], anos, v_ano - 2);
  d := cardinality(anos) > 0;
  r := r || jsonb_build_object('c', '20.8', 'd', d, 'a', d and (select max(x) from unnest(anos) x) >= v_ano - 2, 's', cardinality(falt) = 0, 'ext', ext, 'f', array_remove(array[
    case when not d then 'Publique o decreto legislativo do julgamento das contas do Prefeito, com o teor do julgamento (Planejamento e contas, tipo "Julgamento pela Câmara").' end,
    case when d and cardinality(falt) > 0 then 'Série histórica: falta o julgamento (ou "pendente de apreciação") das contas de ' || array_to_string(falt, ', ') || '.' end], null));

  -- 20.9 Transmissão
  d := coalesce(cfg ->> 'transmissao_url', '') ~* '^https?://'
       or exists (select 1 from public.sessoes s where s.orgao_id = p_orgao and s.situacao = 'publicado' and s.video_url is not null);
  r := r || jsonb_build_object('c', '20.9', 'd', d, 'f', case when d then '{}'::text[]
    else array['Informe o canal de transmissão das sessões (Atividade legislativa › Transmissão) ou o vídeo de cada sessão.'] end);

  -- 20.10 Verba indenizatória
  ext := public.pntp_externo(cfg, array['verba_indenizatoria']);
  if coalesce((cfg ->> 'verba_inexistente')::boolean, false) then
    r := r || jsonb_build_object('c', '20.10', 'd', true, 'a', true, 's', true);
  else
    select coalesce(array_agg(distinct extract(year from v.data)::int), '{}'), max(v.data) into anos, ult
      from public.verba_indenizatoria v where v.orgao_id = p_orgao and v.situacao = 'publicado';
    falt := public.pntp_anos_faltando(p_orgao, array['legislativo_verba'], anos, v_ano - 1);
    d := (ult is not null or public.pntp_declarado(p_orgao, array['legislativo_verba'], hoje - 30, hoje))
         and (coalesce(cfg ->> 'verba_norma', '') <> '' or coalesce(cfg ->> 'verba_norma_url', '') ~* '^https?://');
    a := coalesce(ult >= hoje - 30, false) or public.pntp_declarado(p_orgao, array['legislativo_verba'], hoje - 30, hoje);
    r := r || jsonb_build_object('c', '20.10', 'd', d, 'a', a, 's', cardinality(falt) = 0, 'ext', ext, 'f', array_remove(array[
      case when coalesce(cfg ->> 'verba_norma', '') = '' and coalesce(cfg ->> 'verba_norma_url', '') = '' then 'Informe a norma que regulamenta a verba indenizatória (ou marque que a Câmara não paga verba).' end,
      case when ult is null and not public.pntp_declarado(p_orgao, array['legislativo_verba'], hoje - 30, hoje) then 'Publique os valores pagos de verba indenizatória ou declare que não houve pagamento.' end,
      case when ult is not null and not a then 'Últimos valores de verba indenizatória têm mais de 30 dias.' end,
      case when cardinality(falt) > 0 then 'Série histórica: sem valores nem declaração em ' || array_to_string(falt, ', ') || '.' end], null));
  end if;

  -- 20.11 Atividade de cada parlamentar (vem da autoria, relatoria, presenças e votos)
  ext := public.pntp_externo(cfg, array['atividade_parlamentar']);
  select coalesce(array_agg(distinct x.ano), '{}'), max(x.data_apresentacao) into anos, ult
    from public.proposicoes x where x.orgao_id = p_orgao and x.situacao = 'publicado'
     and exists (select 1 from public.proposicoes_autores a2 where a2.proposicao_id = x.id);
  falt := public.pntp_anos_faltando(p_orgao, array['proposicoes'], anos, v_ano - 1);
  d := ult is not null;
  r := r || jsonb_build_object('c', '20.11', 'd', d, 'a', coalesce(ult >= hoje - 30, false), 's', cardinality(falt) = 0, 'ext', ext, 'f', array_remove(array[
    case when not d then 'Informe os autores e relatores das proposições: a atividade de cada parlamentar é montada a partir deles.' end,
    case when d and ult < hoje - 30 then 'Atividade parlamentar sem proposição nova nos últimos 30 dias.' end,
    case when d and cardinality(falt) > 0 then 'Série histórica: sem autoria registrada em ' || array_to_string(falt, ', ') || '.' end], null));
  return r;
end;
$$;
grant execute on function public.pntp_legislativo_itens(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 6. MENU PADRÃO DA CÂMARA (criação de órgão e botão "Criar menu padrão")
-- ---------------------------------------------------------------------
create or replace function public.criar_menu_padrao(p_orgao uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  m jsonb := '[
    ["Início", "/"],
    ["Institucional", "/estrutura", [["Estrutura organizacional", "/estrutura"], ["Gestores", "/gestores"], ["Perguntas frequentes", "/faq"]]],
    ["Transparência", "/transparencia", [["Portal da Transparência", "/transparencia"], ["Receitas", "/receitas"], ["Despesas", "/despesas"], ["Pessoal", "/pessoal"], ["Diárias", "/diarias"],
      ["Planejamento e contas", "/planejamento"], ["Licitações", "/licitacoes"], ["Contratos", "/contratos"], ["Obras", "/obras"], ["Convênios e transferências", "/convenios"],
      ["Emendas parlamentares", "/emendas"], ["Renúncias de receita", "/renuncias"], ["Saúde", "/saude"], ["Educação e assistência social", "/educacao"], ["Conselhos municipais", "/conselhos"]]],
    ["Publicações", "/publicacoes", [["Leis, decretos e portarias", "/publicacoes"], ["Diário Oficial", "/diario-oficial"]]],
    ["Notícias", "/noticias"],
    ["Serviços", "/servicos", [["Carta de Serviços ao Usuário", "/servicos"], ["Serviços on-line", "/servicos-online"]]],
    ["Atendimento", "/contato", [["Ouvidoria", "/ouvidoria"], ["e-SIC", "/esic"], ["Contato", "/contato"]]]
  ]'::jsonb;
  i int; j int; pai uuid; n int := 0;
begin
  -- Câmara: menu com a atividade legislativa (PNTP 20.x) e sem as páginas só do Executivo.
  if (select tipo from public.orgaos where id = p_orgao) = 'camara' then
    m := '[
      ["Início", "/"],
      ["A Câmara", "/parlamentares", [["Vereadores", "/parlamentares"], ["Comissões", "/comissoes"], ["Estrutura organizacional", "/estrutura"], ["Perguntas frequentes", "/faq"]]],
      ["Atividade legislativa", "/proposicoes", [["Projetos e proposições", "/proposicoes"], ["Sessões, pautas e atas", "/sessoes"], ["Votações", "/votacoes"],
        ["Atividade dos vereadores", "/atividade-parlamentar"], ["Leis e resoluções", "/publicacoes"]]],
      ["Transparência", "/transparencia", [["Portal da Transparência", "/transparencia"], ["Receitas", "/receitas"], ["Despesas", "/despesas"], ["Pessoal", "/pessoal"], ["Diárias", "/diarias"],
        ["Verba indenizatória", "/verba-indenizatoria"], ["Planejamento e contas", "/planejamento"], ["Licitações", "/licitacoes"], ["Contratos", "/contratos"]]],
      ["Notícias", "/noticias"],
      ["Atendimento", "/contato", [["Ouvidoria", "/ouvidoria"], ["e-SIC", "/esic"], ["Carta de Serviços", "/servicos"], ["Contato", "/contato"]]]
    ]'::jsonb;
  end if;
  if not (public.e_suporte_softplus() or public.tem_permissao(p_orgao, 'menu', 'editar')) then
    raise exception 'Seu perfil não pode criar o menu deste órgão.';
  end if;
  if exists (select 1 from public.menu_itens where orgao_id = p_orgao) then return 0; end if;
  for i in 0 .. jsonb_array_length(m) - 1 loop
    insert into public.menu_itens (orgao_id, rotulo, tipo, destino, ordem)
    values (p_orgao, m -> i ->> 0, 'interno', m -> i ->> 1, (i + 1) * 10) returning id into pai;
    n := n + 1;
    if jsonb_typeof(m -> i -> 2) = 'array' then
      for j in 0 .. jsonb_array_length(m -> i -> 2) - 1 loop
        insert into public.menu_itens (orgao_id, pai_id, rotulo, tipo, destino, ordem)
        values (p_orgao, pai, m -> i -> 2 -> j ->> 0, 'interno', m -> i -> 2 -> j ->> 1, (j + 1) * 10);
        n := n + 1;
      end loop;
    end if;
  end loop;
  return n;
end;
$$;
grant execute on function public.criar_menu_padrao(uuid) to authenticated;

-- Depois deste script, rode de novo o script 26: a autoavaliação passa a incluir
-- os critérios 20.x nas Câmaras e as tabelas novas ficam com os vínculos protegidos.
