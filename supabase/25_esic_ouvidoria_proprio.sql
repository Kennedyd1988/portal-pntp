-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 25 — Fase 3 · Atendimento, parte 2: e-SIC e Ouvidoria próprios
--
--   1. Escolha por órgão: o formulário eletrônico pode continuar no sistema
--      externo (Fala.BR etc.: link em Aparência › Destinos das páginas, partes
--      "e-SIC: pedidos" e "Ouvidoria: manifestações") ou ser o do próprio
--      portal (atendimento_canais.sistema_proprio). O endereço que estava em
--      "Como pedir" (canal_url) é copiado para o Destino: quem usa o Fala.BR
--      não percebe diferença.
--   2. atendimentos (fila única dos dois canais), com protocolo por órgão,
--      canal e ano, prazo calculado pelo banco (LAI: 20 + 10 dias; recurso 10
--      dias e decisão em 5, nas duas instâncias; Lei 13.460/2017: 30 + 30
--      dias), prorrogação, pedido de complemento, encaminhamento entre
--      unidades e resposta.
--   3. atendimentos_solicitantes: os dados pessoais ficam numa tabela
--      separada, sem acesso direto: só a equipe central do canal lê, por
--      função que grava cada acesso (atendimentos_acessos). Denúncia anônima
--      não tem linha aqui.
--   4. Andamento, recursos (1ª e 2ª instância), anexos (bucket privado
--      "atendimento"), pesquisa de satisfação (PNTP 15.6) e fila de e-mails
--      (preparada: só sai depois de configurar o SMTP próprio).
--   5. Funções do site (sem login): registrar, consultar por protocolo +
--      código de acesso, recorrer, complementar e avaliar. O site não lê as
--      tabelas.
--   6. Funções do painel: atendimento_acao (encaminhar, devolver, prorrogar,
--      pedir complemento, responder, recurso, decisão, nota, reabrir) e
--      atendimento_identificacao.
--   7. Estatísticas automáticas: os relatórios estatísticos (12.7 e
--      Ouvidoria) de mês, trimestre, semestre e ano são gerados e publicados
--      pelo banco a partir da fila (rotina diária e botão "Atualizar agora").
--      No ano da troca, o relatório manual do período soma com o automático.
--   8. Histórico: as tabelas do atendimento gravam só QUAIS campos mudaram
--      (sem os textos e sem dado pessoal).
--   9. Avisos de prazo (pendencias_atendimento) com a fila: vencidos, a
--      vencer e recursos aguardando decisão.
--  10. Rotina diária (pg_cron 04:20 de Brasília) e envio de e-mails a cada
--      15 minutos (só chama a função quando o SMTP estiver ligado).
--
-- Como usar: SQL Editor › New query › colar tudo › Run. Pode repetir.
-- Rodar DEPOIS do 24.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. CONFIGURAÇÃO DA PLATAFORMA (só a SOFT+ mexe, pelo SQL Editor)
-- ---------------------------------------------------------------------
create table if not exists public.plataforma_config (
  chave  text primary key,
  valor  jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);
alter table public.plataforma_config enable row level security;   -- sem regras: ninguém lê pela API
insert into public.plataforma_config (chave, valor) values
  ('smtp', '{"ativo": false}'),
  ('site_base', '"https://portal-pntp.pages.dev/site/"'),
  ('sal_origem', to_jsonb(encode(extensions.gen_random_bytes(24), 'hex'))),
  ('emails_url', '"https://gyjfkhyufubtmowgjgrq.supabase.co/functions/v1/atendimento-emails"')
on conflict (chave) do nothing;

-- SMTP próprio ligado? (a SOFT+ liga depois de configurar: ver README)
create or replace function public.email_ativo()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (valor ->> 'ativo')::boolean from public.plataforma_config where chave = 'smtp'), false);
$$;
grant execute on function public.email_ativo() to anon, authenticated;

-- Data de hoje no horário de Brasília (o servidor trabalha em UTC).
create or replace function public.hoje_brasil()
returns date language sql stable set search_path = public as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;
grant execute on function public.hoje_brasil() to anon, authenticated;


-- ---------------------------------------------------------------------
-- 1. CANAIS: sistema próprio, prazos em dias e opções
-- ---------------------------------------------------------------------
alter table public.atendimento_canais
  add column if not exists sistema_proprio      boolean not null default false,
  add column if not exists sistema_desde        date,
  add column if not exists dias_resposta        integer check (dias_resposta is null or dias_resposta between 1 and 90),
  add column if not exists dias_prorrogacao     integer check (dias_prorrogacao is null or dias_prorrogacao between 0 and 90),
  add column if not exists dias_recurso         integer check (dias_recurso is null or dias_recurso between 1 and 60),
  add column if not exists dias_decisao_recurso integer check (dias_decisao_recurso is null or dias_decisao_recurso between 1 and 60),
  add column if not exists dias_recurso_2       integer check (dias_recurso_2 is null or dias_recurso_2 between 1 and 60),
  add column if not exists dias_decisao_recurso_2 integer check (dias_decisao_recurso_2 is null or dias_decisao_recurso_2 between 1 and 60),
  add column if not exists aviso_dias           integer not null default 5 check (aviso_dias between 1 and 30),
  add column if not exists pesquisa_satisfacao  boolean not null default true,
  add column if not exists aceita_anexos        boolean not null default true,
  add column if not exists emails_equipe        text check (emails_equipe is null or char_length(emails_equipe) <= 500);  -- outros e-mails da equipe, separados por vírgula

-- Prazo em dias do canal (em branco = o da lei).
create or replace function public.dias_canal(c public.atendimento_canais, p_qual text)
returns integer language sql immutable set search_path = public as $$
  select case p_qual
    when 'resposta'   then coalesce(c.dias_resposta, case c.canal when 'esic' then 20 else 30 end)
    when 'prorrogacao' then coalesce(c.dias_prorrogacao, case c.canal when 'esic' then 10 else 30 end)
    when 'recurso'    then coalesce(c.dias_recurso, 10)
    when 'decisao'    then coalesce(c.dias_decisao_recurso, 5)
    when 'recurso_2'  then coalesce(c.dias_recurso_2, c.dias_recurso, 10)
    when 'decisao_2'  then coalesce(c.dias_decisao_recurso_2, c.dias_decisao_recurso, 5)
  end;
$$;

-- Link externo de uma parte (ou da página inteira) em Aparência › Destinos das páginas.
create or replace function public.destino_externo(p_orgao uuid, p_chaves text[])
returns text language sql stable security definer set search_path = public as $$
  select nullif(btrim(o.configuracoes -> 'destinos' ->> k), '')
  from public.orgaos o, unnest(p_chaves) with ordinality as x(k, ord)
  where o.id = p_orgao and nullif(btrim(o.configuracoes -> 'destinos' ->> k), '') is not null
  order by ord limit 1;
$$;
grant execute on function public.destino_externo(uuid, text[]) to anon, authenticated;
create or replace function public.chaves_destino(p_canal text)
returns text[] language sql immutable as $$
  select case p_canal when 'esic' then array['esic_pedidos', 'esic'] else array['ouvidoria_manifestacoes', 'ouvidoria'] end;
$$;

-- Ligar o sistema próprio exige o mínimo para atender (e nenhum link externo no Destino).
create or replace function public.conferir_sistema_proprio()
returns trigger language plpgsql set search_path = public as $$
begin
  -- upsert do painel: o "insert" de uma linha que já existe vira update (conferido lá, com a linha inteira).
  if tg_op = 'INSERT' and exists (select 1 from public.atendimento_canais x where x.orgao_id = new.orgao_id and x.canal = new.canal) then return new; end if;
  if new.sistema_proprio and (tg_op = 'INSERT' or not old.sistema_proprio) then
    if public.destino_externo(new.orgao_id, public.chaves_destino(new.canal)) is not null then
      raise exception 'Há link externo em Aparência › Destinos das páginas ("%"). Escolha "Página do portal" ali antes de ligar o sistema próprio.',
        case new.canal when 'esic' then 'e-SIC: pedidos' else 'Ouvidoria: manifestações' end;
    end if;
    if new.unidade_id is null and new.setor is null then
      raise exception 'Informe a unidade ou o setor responsável antes de ligar o sistema próprio.';
    end if;
    if new.canal = 'esic' and coalesce(new.autoridade_recurso_1, '') = '' then
      raise exception 'Informe a autoridade que decide o recurso (aba "Prazos e recursos") antes de ligar o sistema próprio.';
    end if;
    if new.sistema_desde is null then new.sistema_desde := public.hoje_brasil(); end if;
  end if;
  return new;
end;
$$;
drop trigger if exists atendimento_canais_sistema on public.atendimento_canais;
create trigger atendimento_canais_sistema before insert or update on public.atendimento_canais
  for each row execute function public.conferir_sistema_proprio();

-- Canal com o sistema próprio em uso (ligado e sem link externo).
create or replace function public.canal_proprio(p_orgao uuid, p_canal text)
returns public.atendimento_canais language sql stable security definer set search_path = public as $$
  select c.* from public.atendimento_canais c
  where c.orgao_id = p_orgao and c.canal = p_canal and c.sistema_proprio
    and public.destino_externo(p_orgao, public.chaves_destino(p_canal)) is null;
$$;

-- O endereço do formulário externo (0.17.0, campo "Endereço do formulário") vai para o Destino
-- da parte. Só uma vez: depois, vale o que estiver em Aparência › Destinos das páginas.
update public.orgaos o
   set configuracoes = jsonb_set(coalesce(o.configuracoes, '{}'::jsonb), '{destinos}', x.novos || coalesce(o.configuracoes -> 'destinos', '{}'::jsonb))
  from (select c.orgao_id, jsonb_object_agg(case c.canal when 'esic' then 'esic_pedidos' else 'ouvidoria_manifestacoes' end, c.canal_url) as novos
          from public.atendimento_canais c where coalesce(c.canal_url, '') ~* '^https?://' group by c.orgao_id) x
 where o.id = x.orgao_id
   and not coalesce((o.configuracoes -> 'migracoes' ->> 'atendimento_destinos')::boolean, false);
update public.orgaos set configuracoes = jsonb_set(coalesce(configuracoes, '{}'::jsonb), '{migracoes}',
  coalesce(configuracoes -> 'migracoes', '{}'::jsonb) || '{"atendimento_destinos": true}')
 where not coalesce((configuracoes -> 'migracoes' ->> 'atendimento_destinos')::boolean, false);


-- ---------------------------------------------------------------------
-- 2. FERIADOS E CONTAGEM DE PRAZOS
--    Dias corridos; se o último dia cair em sábado, domingo, feriado ou dia
--    sem expediente cadastrado, o prazo passa para o próximo dia útil (Lei
--    9.784/1999, art. 66, § 1º, aplicada por analogia, como no Fala.BR).
-- ---------------------------------------------------------------------
create table if not exists public.feriados (
  id        uuid primary key default gen_random_uuid(),
  orgao_id  uuid not null references public.orgaos(id) on delete cascade,
  data      date not null,
  nome      text not null check (char_length(nome) between 2 and 120),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint feriados_uk unique (orgao_id, data)
);

-- Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher).
create or replace function public.pascoa(p_ano integer)
returns date language plpgsql immutable as $$
declare a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int; mes int; dia int;
begin
  a := p_ano % 19; b := p_ano / 100; c := p_ano % 100; d := b / 4; e := b % 4; f := (b + 8) / 25; g := (b - f + 1) / 3;
  h := (19 * a + b - d - g + 15) % 30; i := c / 4; k := c % 4; l := (32 + 2 * e + 2 * i - h - k) % 7; m := (a + 11 * h + 22 * l) / 451;
  mes := (h + l - 7 * m + 114) / 31; dia := ((h + l - 7 * m + 114) % 31) + 1;
  return make_date(p_ano, mes, dia);
end;
$$;
-- Feriados nacionais (Lei 662/1949, Lei 6.802/1980, Lei 14.759/2023) e Sexta-feira Santa.
create or replace function public.feriado_nacional(p date)
returns boolean language sql immutable as $$
  select to_char(p, 'MM-DD') in ('01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25')
      or p = public.pascoa(extract(year from p)::int) - 2;
$$;
create or replace function public.dia_util(p_orgao uuid, p date)
returns boolean language sql stable security definer set search_path = public as $$
  select extract(isodow from p) < 6 and not public.feriado_nacional(p)
     and not exists (select 1 from public.feriados f where f.orgao_id = p_orgao and f.data = p);
$$;
create or replace function public.ajustar_dia_util(p_orgao uuid, p date)
returns date language plpgsql stable security definer set search_path = public as $$
declare d date := p; n int := 0;
begin
  if d is null then return null; end if;
  while not public.dia_util(p_orgao, d) and n < 30 loop d := d + 1; n := n + 1; end loop;
  return d;
end;
$$;
grant execute on function public.dia_util(uuid, date), public.ajustar_dia_util(uuid, date) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 3. ATENDIMENTOS (pedidos do e-SIC e manifestações da Ouvidoria)
-- ---------------------------------------------------------------------
create table if not exists public.atendimentos_numeros (
  orgao_id uuid not null references public.orgaos(id) on delete cascade,
  canal    text not null,
  ano      integer not null,
  ultimo   integer not null default 0,
  primary key (orgao_id, canal, ano)
);
alter table public.atendimentos_numeros enable row level security;

create table if not exists public.atendimentos (
  id               uuid primary key default gen_random_uuid(),
  orgao_id         uuid not null references public.orgaos(id) on delete cascade,
  canal            text not null check (canal in ('esic', 'ouvidoria')),
  protocolo        text not null,                 -- SIC-2026-000123 · OUV-2026-000045
  ano              integer not null,
  numero           integer not null,
  tipo             text not null check (tipo in ('pedido', 'reclamacao', 'denuncia', 'sugestao', 'elogio', 'solicitacao', 'simplificacao')),
  assunto          text check (assunto is null or char_length(assunto) <= 200),
  texto            text not null check (char_length(texto) between 10 and 8000),
  meio             text not null default 'internet' check (meio in ('internet', 'presencial', 'email', 'telefone', 'carta', 'outro')),
  forma_resposta   text not null default 'sistema' check (forma_resposta in ('sistema', 'email', 'correspondencia', 'presencial')),
  -- e-SIC: identificado | preservada (só o SIC vê quem pediu) · Ouvidoria: identificado (identidade sempre protegida) | anonimo (só denúncia)
  identificacao    text not null check (identificacao in ('identificado', 'preservada', 'anonimo')),
  unidade_id       uuid references public.unidades(id) on delete set null,   -- unidade que está tratando (em branco: equipe central)
  classificacao    text check (classificacao is null or char_length(classificacao) <= 120),   -- assunto, para as estatísticas
  situacao         text not null default 'aberto' check (situacao in ('aberto', 'aguardando_cidadao', 'respondido', 'em_recurso', 'encerrado')),
  registrado_em    timestamptz not null default now(),
  data_registro    date not null,
  prazo            date not null,                 -- prazo atual da resposta (pelo banco)
  prazo_original   date not null,
  prorrogado_em    timestamptz,
  prorrogacao_motivo text check (prorrogacao_motivo is null or char_length(prorrogacao_motivo) <= 2000),
  suspenso_em      date,                          -- aguardando o cidadão (Ouvidoria: o prazo para)
  dias_suspensos   integer not null default 0,
  respondido_em    timestamptz,
  resposta         text check (resposta is null or char_length(resposta) <= 20000),
  resultado        text check (resultado is null or resultado in ('concedido', 'parcial', 'negado', 'inexistente', 'incompetencia', 'nao_pedido', 'duplicado',
                                                                   'concluida', 'arquivada', 'fora_competencia')),
  motivo_negativa  text check (motivo_negativa is null or motivo_negativa in ('dados_pessoais', 'classificada', 'sigilo_legal', 'generico', 'desproporcional',
                                                                              'trabalho_adicional', 'processo_decisorio', 'outro')),
  prazo_recurso    date,                          -- até quando o cidadão pode recorrer (e-SIC)
  encerrado_em     timestamptz,
  aviso_enviado_em timestamptz,                   -- e-mail "vence em breve" à equipe
  vencido_avisado_em timestamptz,
  criado_por       uuid references public.usuarios(id) on delete set null,   -- atendente que registrou (balcão, telefone…)
  busca            text generated always as (public.normalizar_texto(protocolo || ' ' || coalesce(assunto, '') || ' ' || coalesce(classificacao, '') || ' ' || texto)) stored,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  constraint atendimentos_protocolo_uk unique (orgao_id, protocolo),
  constraint atendimentos_tipo_canal check ((canal = 'esic') = (tipo = 'pedido')),
  constraint atendimentos_identificacao check ((canal = 'esic' and identificacao in ('identificado', 'preservada'))
                                            or (canal = 'ouvidoria' and identificacao in ('identificado', 'anonimo'))),
  constraint atendimentos_anonimo check (identificacao <> 'anonimo' or tipo = 'denuncia'),
  constraint atendimentos_resultado check (resultado is null or (canal = 'esic') = (resultado in ('concedido', 'parcial', 'negado', 'inexistente', 'incompetencia', 'nao_pedido', 'duplicado'))),
  constraint atendimentos_motivo check (motivo_negativa is null or resultado in ('parcial', 'negado'))
);
create index if not exists atendimentos_fila_idx on public.atendimentos (orgao_id, canal, situacao, prazo);
create index if not exists atendimentos_registro_idx on public.atendimentos (orgao_id, canal, data_registro desc, id desc);
create index if not exists atendimentos_unidade_idx on public.atendimentos (unidade_id) where unidade_id is not null;

-- Código de acesso e controle de tentativas (sem nenhum acesso pela API).
create table if not exists public.atendimentos_segredos (
  atendimento_id uuid primary key references public.atendimentos(id) on delete cascade,
  codigo_hash    text not null,
  falhas         integer not null default 0,
  bloqueado_ate  timestamptz
);
alter table public.atendimentos_segredos enable row level security;

-- Envios pelo site (limite por origem; guardado 2 dias, sem o IP: só um resumo com sal).
create table if not exists public.atendimentos_envios (
  id          bigint generated always as identity primary key,
  orgao_id    uuid not null references public.orgaos(id) on delete cascade,
  origem_hash text,
  criado_em   timestamptz not null default now()
);
create index if not exists atendimentos_envios_idx on public.atendimentos_envios (orgao_id, criado_em desc);
alter table public.atendimentos_envios enable row level security;

-- Dados pessoais de quem pediu ou se manifestou (sem regra de leitura: só por função).
create table if not exists public.atendimentos_solicitantes (
  atendimento_id uuid primary key references public.atendimentos(id) on delete cascade,
  orgao_id     uuid not null references public.orgaos(id) on delete cascade,
  nome         text not null check (char_length(nome) between 2 and 200),
  tipo_pessoa  text check (tipo_pessoa is null or tipo_pessoa in ('fisica', 'juridica')),
  documento    text check (documento is null or documento ~ '^(\d{11}|\d{14})$'),
  email        text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  telefone     text check (telefone is null or char_length(telefone) <= 40),
  endereco     text check (endereco is null or char_length(endereco) <= 300),
  municipio_uf text check (municipio_uf is null or char_length(municipio_uf) <= 120),
  -- Perfil (opcional, só para as estatísticas genéricas do 12.7)
  sexo         text check (sexo is null or sexo in ('feminino', 'masculino', 'nao_informado')),
  faixa_etaria text check (faixa_etaria is null or faixa_etaria in ('ate_17', '18_29', '30_44', '45_59', '60_mais')),
  escolaridade text check (escolaridade is null or escolaridade in ('fundamental', 'medio', 'superior', 'pos', 'sem')),
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.atendimentos_solicitantes enable row level security;

-- Andamento: cada passo, público (aparece na consulta do cidadão) ou interno.
create table if not exists public.atendimentos_tramites (
  id             uuid primary key default gen_random_uuid(),
  orgao_id       uuid not null references public.orgaos(id) on delete cascade,
  atendimento_id uuid not null references public.atendimentos(id) on delete cascade,
  tipo           text not null check (tipo in ('registro', 'encaminhamento', 'devolucao', 'prorrogacao', 'complemento_pedido', 'complemento_cidadao', 'retomada',
                                               'resposta', 'recurso', 'decisao_recurso', 'reabertura', 'nota', 'classificacao', 'encerramento')),
  texto          text check (texto is null or char_length(texto) <= 20000),
  publico        boolean not null default false,
  unidade_de     uuid references public.unidades(id) on delete set null,
  unidade_para   uuid references public.unidades(id) on delete set null,
  usuario_id     uuid references public.usuarios(id) on delete set null,
  criado_em      timestamptz not null default now()
);
create index if not exists atendimentos_tramites_idx on public.atendimentos_tramites (atendimento_id, criado_em);

create table if not exists public.atendimentos_recursos (
  id             uuid primary key default gen_random_uuid(),
  orgao_id       uuid not null references public.orgaos(id) on delete cascade,
  atendimento_id uuid not null references public.atendimentos(id) on delete cascade,
  instancia      integer not null check (instancia in (1, 2)),
  motivo         text not null default 'negativa' check (motivo in ('negativa', 'omissao', 'incompleta', 'outro')),
  texto          text not null check (char_length(texto) between 10 and 8000),
  registrado_em  timestamptz not null default now(),
  data_registro  date not null,
  prazo_decisao  date not null,
  autoridade     text check (autoridade is null or char_length(autoridade) <= 300),
  decisao        text check (decisao is null or decisao in ('provido', 'parcial', 'desprovido', 'nao_conhecido')),
  decisao_texto  text check (decisao_texto is null or char_length(decisao_texto) <= 20000),
  decidido_em    timestamptz,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  constraint atendimentos_recursos_uk unique (atendimento_id, instancia)
);
create index if not exists atendimentos_recursos_idx on public.atendimentos_recursos (orgao_id, data_registro);

create table if not exists public.atendimentos_anexos (
  id             uuid primary key default gen_random_uuid(),
  orgao_id       uuid not null references public.orgaos(id) on delete cascade,
  atendimento_id uuid not null references public.atendimentos(id) on delete cascade,
  tramite_id     uuid references public.atendimentos_tramites(id) on delete set null,
  origem         text not null check (origem in ('cidadao', 'equipe')),
  publico        boolean not null default true,     -- equipe: vai para o cidadão (resposta) ou fica interno
  nome           text not null check (char_length(nome) between 1 and 200),
  caminho        text not null unique,              -- bucket "atendimento": <órgão>/<atendimento>/<arquivo>
  tamanho        integer check (tamanho is null or tamanho between 0 and 10485760),
  tipo_arquivo   text check (tipo_arquivo is null or char_length(tipo_arquivo) <= 120),
  usuario_id     uuid references public.usuarios(id) on delete set null,
  criado_em      timestamptz not null default now()
);
create index if not exists atendimentos_anexos_idx on public.atendimentos_anexos (atendimento_id, criado_em);

-- Quem abriu os dados pessoais (LGPD, art. 37: registro das operações).
create table if not exists public.atendimentos_acessos (
  id             bigint generated always as identity primary key,
  orgao_id       uuid not null references public.orgaos(id) on delete cascade,
  atendimento_id uuid not null references public.atendimentos(id) on delete cascade,
  usuario_id     uuid references public.usuarios(id) on delete set null,
  acao           text not null default 'ver_identificacao' check (acao in ('ver_identificacao')),
  criado_em      timestamptz not null default now()
);
create index if not exists atendimentos_acessos_idx on public.atendimentos_acessos (orgao_id, criado_em desc);

-- Pesquisa de satisfação (PNTP 15.6): uma por protocolo, depois da resposta.
create table if not exists public.atendimentos_avaliacoes (
  atendimento_id uuid primary key references public.atendimentos(id) on delete cascade,
  orgao_id     uuid not null references public.orgaos(id) on delete cascade,
  canal        text not null check (canal in ('esic', 'ouvidoria')),
  nota         integer not null check (nota between 1 and 5),
  resolvido    text not null check (resolvido in ('sim', 'parcial', 'nao')),
  comentario   text check (comentario is null or char_length(comentario) <= 1000),
  data         date not null,
  criado_em    timestamptz not null default now()
);
create index if not exists atendimentos_avaliacoes_idx on public.atendimentos_avaliacoes (orgao_id, canal, data desc);

-- Fila de e-mails (sai pela função atendimento-emails quando o SMTP estiver ligado).
create table if not exists public.atendimentos_emails (
  id             uuid primary key default gen_random_uuid(),
  orgao_id       uuid not null references public.orgaos(id) on delete cascade,
  atendimento_id uuid references public.atendimentos(id) on delete cascade,
  para           text not null,
  destinatario   text not null check (destinatario in ('cidadao', 'equipe')),
  modelo         text not null,
  assunto        text not null,
  corpo          text not null,
  situacao       text not null default 'pendente' check (situacao in ('pendente', 'enviado', 'erro', 'cancelado')),
  tentativas     integer not null default 0,
  erro           text,
  criado_em      timestamptz not null default now(),
  enviado_em     timestamptz
);
create index if not exists atendimentos_emails_idx on public.atendimentos_emails (situacao, criado_em);
alter table public.atendimentos_emails enable row level security;   -- sem regras: só a função de envio (chave secreta)


-- ---------------------------------------------------------------------
-- 4. HISTÓRICO SEM DADO PESSOAL
--    O "historico" guarda o registro inteiro; aqui, só os campos que mudaram
--    e a situação (nada de texto, resposta, nome, documento ou contato).
-- ---------------------------------------------------------------------
create or replace function public.registrar_historico_atendimento()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  antes  jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  depois jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  base   jsonb := coalesce(depois, antes);
  livres text[] := array['id', 'atendimento_id', 'canal', 'protocolo', 'tipo', 'situacao', 'unidade_id', 'resultado', 'prazo', 'instancia', 'decisao',
                          'origem', 'publico', 'nota', 'meio', 'identificacao', 'unidade_de', 'unidade_para'];
  mudou  text[];
  f      jsonb := '{}'::jsonb;
  k      text;
begin
  if tg_op = 'UPDATE' then
    select array_agg(x.key order by x.key) into mudou from jsonb_each(depois) x
     where x.key not in ('atualizado_em', 'busca') and x.value is distinct from antes -> x.key;
    if mudou is null then return new; end if;
  end if;
  foreach k in array livres loop
    if base ? k then f := f || jsonb_build_object(k, base -> k); end if;
  end loop;
  insert into public.historico (orgao_id, usuario_id, tabela, registro_id, acao, dados_antes, dados_depois)
  values ((base ->> 'orgao_id')::uuid, auth.uid(), tg_table_name, coalesce(base ->> 'id', base ->> 'atendimento_id'),
          case tg_op when 'INSERT' then 'inserir'::public.acao_historico when 'UPDATE' then 'editar'::public.acao_historico else 'excluir'::public.acao_historico end,
          null, f || case when mudou is not null then jsonb_build_object('campos_alterados', to_jsonb(mudou)) else '{}'::jsonb end);
  return coalesce(new, old);
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['atendimentos', 'atendimentos_solicitantes', 'atendimentos_tramites', 'atendimentos_recursos', 'atendimentos_anexos', 'atendimentos_avaliacoes'] loop
    execute format('drop trigger if exists %1$s_historico on public.%1$I', t);
    execute format('create trigger %1$s_historico after insert or update or delete on public.%1$I for each row execute function public.registrar_historico_atendimento()', t);
  end loop;
  foreach t in array array['atendimentos', 'atendimentos_solicitantes', 'atendimentos_recursos', 'feriados'] loop
    execute format('drop trigger if exists %1$s_atualizado on public.%1$I', t);
    execute format('create trigger %1$s_atualizado before update on public.%1$I for each row execute function public.marcar_atualizacao()', t);
  end loop;
end $$;
drop trigger if exists feriados_historico on public.feriados;
create trigger feriados_historico after insert or update or delete on public.feriados for each row execute function public.registrar_historico();


-- ---------------------------------------------------------------------
-- 5. REGRAS DE ACESSO
--    Fila: quem tem "ver" no módulo do canal e acesso ao órgão todo vê tudo;
--    quem tem alcance numa unidade vê só o que foi encaminhado à unidade
--    dele. Gravação só pelas funções (nenhum insert/update direto).
-- ---------------------------------------------------------------------
create or replace function public.pode_ver_atendimento(p_orgao uuid, p_canal text, p_unidade uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.tem_permissao(p_orgao, p_canal, 'ver') and public.no_alcance(p_orgao, p_unidade);
$$;
-- Equipe central: editar no módulo e acesso ao órgão todo.
create or replace function public.equipe_central(p_orgao uuid, p_canal text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.tem_permissao(p_orgao, p_canal, 'editar') and public.no_alcance(p_orgao, null);
$$;
grant execute on function public.pode_ver_atendimento(uuid, text, uuid), public.equipe_central(uuid, text) to authenticated;

alter table public.atendimentos enable row level security;
alter table public.atendimentos_tramites enable row level security;
alter table public.atendimentos_recursos enable row level security;
alter table public.atendimentos_anexos enable row level security;
alter table public.atendimentos_acessos enable row level security;
alter table public.atendimentos_avaliacoes enable row level security;
alter table public.feriados enable row level security;

drop policy if exists "atendimentos: leitura" on public.atendimentos;
create policy "atendimentos: leitura" on public.atendimentos for select to authenticated
  using (public.pode_ver_atendimento(orgao_id, canal, unidade_id));
drop policy if exists "atendimentos_tramites: leitura" on public.atendimentos_tramites;
create policy "atendimentos_tramites: leitura" on public.atendimentos_tramites for select to authenticated
  using (exists (select 1 from public.atendimentos a where a.id = atendimento_id));
drop policy if exists "atendimentos_recursos: leitura" on public.atendimentos_recursos;
create policy "atendimentos_recursos: leitura" on public.atendimentos_recursos for select to authenticated
  using (exists (select 1 from public.atendimentos a where a.id = atendimento_id));
drop policy if exists "atendimentos_anexos: leitura" on public.atendimentos_anexos;
create policy "atendimentos_anexos: leitura" on public.atendimentos_anexos for select to authenticated
  using (exists (select 1 from public.atendimentos a where a.id = atendimento_id));
drop policy if exists "atendimentos_acessos: leitura" on public.atendimentos_acessos;
create policy "atendimentos_acessos: leitura" on public.atendimentos_acessos for select to authenticated
  using (exists (select 1 from public.atendimentos a where a.id = atendimento_id and public.equipe_central(a.orgao_id, a.canal)));
drop policy if exists "atendimentos_avaliacoes: leitura" on public.atendimentos_avaliacoes;
create policy "atendimentos_avaliacoes: leitura" on public.atendimentos_avaliacoes for select to authenticated
  using (public.equipe_central(orgao_id, canal));

drop policy if exists "feriados: leitura" on public.feriados;
create policy "feriados: leitura" on public.feriados for select to anon, authenticated using (true);
drop policy if exists "feriados: inclusão" on public.feriados;
create policy "feriados: inclusão" on public.feriados for insert to authenticated
  with check ((public.tem_permissao(orgao_id, 'esic', 'editar') or public.tem_permissao(orgao_id, 'ouvidoria', 'editar')) and public.no_alcance(orgao_id, null));
drop policy if exists "feriados: edição" on public.feriados;
create policy "feriados: edição" on public.feriados for update to authenticated
  using ((public.tem_permissao(orgao_id, 'esic', 'editar') or public.tem_permissao(orgao_id, 'ouvidoria', 'editar')) and public.no_alcance(orgao_id, null))
  with check ((public.tem_permissao(orgao_id, 'esic', 'editar') or public.tem_permissao(orgao_id, 'ouvidoria', 'editar')) and public.no_alcance(orgao_id, null));
drop policy if exists "feriados: exclusão" on public.feriados;
create policy "feriados: exclusão" on public.feriados for delete to authenticated
  using ((public.tem_permissao(orgao_id, 'esic', 'editar') or public.tem_permissao(orgao_id, 'ouvidoria', 'editar')) and public.no_alcance(orgao_id, null));

revoke all on public.atendimentos, public.atendimentos_tramites, public.atendimentos_recursos, public.atendimentos_anexos, public.atendimentos_acessos,
  public.atendimentos_avaliacoes, public.atendimentos_solicitantes, public.atendimentos_segredos, public.atendimentos_envios, public.atendimentos_emails,
  public.atendimentos_numeros, public.plataforma_config from anon, authenticated;
grant select on public.atendimentos, public.atendimentos_tramites, public.atendimentos_recursos, public.atendimentos_anexos, public.atendimentos_acessos,
  public.atendimentos_avaliacoes to authenticated;
grant select on public.feriados to anon;
grant select, insert, update, delete on public.feriados to authenticated;
-- A função de envio de e-mails e a de anexos usam a chave secreta (service_role).
grant usage on schema public to service_role;
grant select, update on public.atendimentos_emails to service_role;
grant select on public.atendimentos_anexos to service_role;

-- Arquivos do atendimento: bucket PRIVADO (nada de endereço público).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('atendimento', 'atendimento', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet', 'application/zip'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Caminho: <órgão>/<atendimento>/<arquivo>. Ler: quem vê o atendimento. Enviar: equipe que trata.
create or replace function public.pode_arquivo_atendimento(p_caminho text, p_enviar boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.atendimentos a
                 where a.id::text = split_part(p_caminho, '/', 2) and a.orgao_id::text = split_part(p_caminho, '/', 1)
                   and public.pode_ver_atendimento(a.orgao_id, a.canal, a.unidade_id)
                   and (not p_enviar or public.tem_permissao(a.orgao_id, a.canal, 'editar')));
$$;
grant execute on function public.pode_arquivo_atendimento(text, boolean) to authenticated;
drop policy if exists "atendimento: ler" on storage.objects;
create policy "atendimento: ler" on storage.objects for select to authenticated
  using (bucket_id = 'atendimento' and public.pode_arquivo_atendimento(name, false));
drop policy if exists "atendimento: enviar" on storage.objects;
create policy "atendimento: enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'atendimento' and public.pode_arquivo_atendimento(name, true));
drop policy if exists "atendimento: apagar" on storage.objects;
create policy "atendimento: apagar" on storage.objects for delete to authenticated
  using (bucket_id = 'atendimento' and public.pode_arquivo_atendimento(name, true));


-- ---------------------------------------------------------------------
-- 6. APOIO: código de acesso, documento, e-mails
-- ---------------------------------------------------------------------
create or replace function public.novo_codigo_acesso()
returns text language plpgsql volatile set search_path = public, extensions as $$
declare
  alfabeto text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   -- sem 0/O, 1/I
  b bytea := extensions.gen_random_bytes(10);
  r text := '';
begin
  for i in 0..9 loop r := r || substr(alfabeto, (get_byte(b, i) % 32) + 1, 1); end loop;
  return r;
end;
$$;
create or replace function public.hash_acesso(p_protocolo text, p_codigo text)
returns text language sql immutable set search_path = public, extensions as $$
  select encode(extensions.digest(upper(btrim(p_protocolo)) || ':' || upper(regexp_replace(coalesce(p_codigo, ''), '[\s-]', '', 'g')), 'sha256'), 'hex');
$$;

create or replace function public.documento_valido(p text)
returns boolean language plpgsql immutable as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g'); s int; r int; pesos int[];
begin
  if length(d) = 11 then
    if d ~ '^(\d)\1{10}$' then return false; end if;
    s := 0; for i in 1..9 loop s := s + substr(d, i, 1)::int * (11 - i); end loop;
    r := (s * 10) % 11; if r = 10 then r := 0; end if;
    if r <> substr(d, 10, 1)::int then return false; end if;
    s := 0; for i in 1..10 loop s := s + substr(d, i, 1)::int * (12 - i); end loop;
    r := (s * 10) % 11; if r = 10 then r := 0; end if;
    return r = substr(d, 11, 1)::int;
  elsif length(d) = 14 then
    if d ~ '^(\d)\1{13}$' then return false; end if;
    pesos := array[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    s := 0; for i in 1..12 loop s := s + substr(d, i, 1)::int * pesos[i]; end loop;
    r := s % 11; r := case when r < 2 then 0 else 11 - r end;
    if r <> substr(d, 13, 1)::int then return false; end if;
    pesos := array[6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    s := 0; for i in 1..13 loop s := s + substr(d, i, 1)::int * pesos[i]; end loop;
    r := s % 11; r := case when r < 2 then 0 else 11 - r end;
    return r = substr(d, 14, 1)::int;
  end if;
  return false;
end;
$$;

-- Endereço da consulta no site do órgão (domínio próprio ou endereço provisório com ?orgao=CNPJ).
create or replace function public.endereco_consulta(p_orgao uuid, p_canal text, p_protocolo text)
returns text language sql stable security definer set search_path = public as $$
  select case when o.dominio is not null then 'https://' || o.dominio || '/'
              else (select valor #>> '{}' from public.plataforma_config where chave = 'site_base') || '?orgao=' || regexp_replace(coalesce(o.cnpj, ''), '\D', '', 'g') end
         || '#/' || p_canal || '/acompanhar?protocolo=' || p_protocolo
  from public.orgaos o where o.id = p_orgao;
$$;

-- Coloca um e-mail na fila. Os textos não levam dado pessoal nem o conteúdo do pedido.
create or replace function public.enfileirar_email_atendimento(p_at public.atendimentos, p_destino text, p_modelo text, p_extra text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  c public.atendimento_canais;
  o public.orgaos;
  nome_canal text := case p_at.canal when 'esic' then 'e-SIC' else 'Ouvidoria' end;
  para text[];
  ass text; corpo text; email text;
  link text := public.endereco_consulta(p_at.orgao_id, p_at.canal, p_at.protocolo);
begin
  select * into c from public.atendimento_canais where orgao_id = p_at.orgao_id and canal = p_at.canal;
  select * into o from public.orgaos where id = p_at.orgao_id;
  if p_destino = 'cidadao' then
    select s.email into email from public.atendimentos_solicitantes s where s.atendimento_id = p_at.id;
    if email is null then return; end if;
    para := array[email];
    ass := nome_canal || ' · ' || o.nome || ' · protocolo ' || p_at.protocolo;
    corpo := case p_modelo
      when 'registro' then 'Recebemos o seu ' || case p_at.canal when 'esic' then 'pedido de acesso à informação' else 'registro na Ouvidoria' end
        || ', protocolo ' || p_at.protocolo || '. Prazo de resposta: ' || to_char(p_at.prazo, 'DD/MM/YYYY') || '.'
      when 'prorrogacao' then 'O prazo de resposta do protocolo ' || p_at.protocolo || ' foi prorrogado para ' || to_char(p_at.prazo, 'DD/MM/YYYY') || '. A justificativa está na consulta do protocolo.'
      when 'complemento' then 'O órgão pediu um complemento ao protocolo ' || p_at.protocolo || '. Responda pela consulta do protocolo.'
      when 'resposta' then 'O protocolo ' || p_at.protocolo || ' foi respondido. Leia a resposta na consulta do protocolo.'
        || case when p_at.canal = 'esic' and p_at.prazo_recurso is not null then ' Se discordar, você pode recorrer até ' || to_char(p_at.prazo_recurso, 'DD/MM/YYYY') || '.' else '' end
      when 'recurso' then 'Recebemos o seu recurso no protocolo ' || p_at.protocolo || '.' || coalesce(' ' || p_extra, '')
      when 'decisao' then 'O recurso do protocolo ' || p_at.protocolo || ' foi decidido. Veja a decisão na consulta do protocolo.'
      else 'Houve movimentação no protocolo ' || p_at.protocolo || '.' end
      || E'\n\nConsulte: ' || link || E'\nUse o código de acesso entregue no registro (ele não é enviado por e-mail).'
      || E'\n\nMensagem automática. Não responda a este e-mail.';
  else
    para := array(select distinct btrim(x) from unnest(string_to_array(concat_ws(',', c.email, c.emails_equipe,
                    (select u.email from public.unidades u where u.id = p_at.unidade_id and p_modelo = 'encaminhamento')), ',')) x
                  where btrim(x) ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
    if coalesce(array_length(para, 1), 0) = 0 then return; end if;
    ass := nome_canal || ' · ' || p_at.protocolo || ' · ' || case p_modelo
      when 'registro' then 'novo registro' when 'encaminhamento' then 'encaminhado' when 'vencendo' then 'vence em ' || to_char(p_at.prazo, 'DD/MM')
      when 'vencido' then 'PRAZO VENCIDO' when 'recurso' then 'recurso recebido' when 'complemento' then 'complemento do cidadão' else 'movimentação' end;
    corpo := 'Protocolo ' || p_at.protocolo || ' (' || nome_canal || '). Prazo: ' || to_char(p_at.prazo, 'DD/MM/YYYY') || '.'
      || coalesce(E'\n' || p_extra, '') || E'\n\nAbra no painel: módulo ' || nome_canal || ', aba ' || case p_at.canal when 'esic' then 'Pedidos' else 'Manifestações' end || '.'
      || E'\n\nMensagem automática do Portal.';
  end if;
  insert into public.atendimentos_emails (orgao_id, atendimento_id, para, destinatario, modelo, assunto, corpo)
  select p_at.orgao_id, p_at.id, x, p_destino, p_modelo, ass, corpo from unnest(para) x;
end;
$$;

-- Prazo atual da resposta: registro + dias (+ prorrogação + dias parados), no próximo dia útil.
create or replace function public.calcular_prazo_atendimento(a public.atendimentos)
returns date language sql stable security definer set search_path = public as $$
  select public.ajustar_dia_util(a.orgao_id, a.data_registro + public.dias_canal(c, 'resposta')
           + case when a.prorrogado_em is not null then public.dias_canal(c, 'prorrogacao') else 0 end + a.dias_suspensos)
  from public.atendimento_canais c where c.orgao_id = a.orgao_id and c.canal = a.canal;
$$;


-- ---------------------------------------------------------------------
-- 7. SITE (sem login): registrar, consultar, recorrer, complementar, avaliar
-- ---------------------------------------------------------------------
create or replace function public.limpar_texto(p text, p_max int)
returns text language sql immutable as $$
  select nullif(left(btrim(regexp_replace(coalesce(p, ''), '[\x00-\x08\x0B\x0C\x0E-\x1F]', '', 'g')), p_max), '');
$$;

-- p_dados: tipo, assunto, texto, identificacao, nome, documento, email, telefone, endereco,
-- municipio_uf, sexo, faixa_etaria, escolaridade, forma_resposta, meio (só a equipe), site (isca: deve vir vazio).
create or replace function public.registrar_atendimento(p_orgao uuid, p_canal text, p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  c public.atendimento_canais;
  equipe boolean := auth.uid() is not null and public.equipe_central(p_orgao, p_canal);
  v_tipo text := coalesce(p_dados ->> 'tipo', case p_canal when 'esic' then 'pedido' end);
  v_ident text := coalesce(p_dados ->> 'identificacao', 'identificado');
  v_nome text := public.limpar_texto(p_dados ->> 'nome', 200);
  v_doc text := nullif(regexp_replace(coalesce(p_dados ->> 'documento', ''), '\D', '', 'g'), '');
  v_email text := lower(public.limpar_texto(p_dados ->> 'email', 160));
  v_texto text := public.limpar_texto(p_dados ->> 'texto', 8000);
  v_meio text := case when equipe then coalesce(nullif(p_dados ->> 'meio', ''), 'presencial') else 'internet' end;
  v_hoje date := public.hoje_brasil();
  v_ano int := extract(year from v_hoje)::int;
  v_num int;
  v_prot text;
  v_cod text := public.novo_codigo_acesso();
  v_origem text;
  a public.atendimentos;
begin
  if coalesce(p_dados ->> 'site', '') <> '' then raise exception 'Não foi possível registrar.'; end if;   -- robô preencheu a isca
  c := public.canal_proprio(p_orgao, p_canal);
  if c.id is null then raise exception 'Este órgão não recebe % por este portal. Use o canal indicado na página.', case p_canal when 'esic' then 'pedidos' else 'manifestações' end; end if;

  -- Limite de envios pelo site: 5 por hora da mesma origem e 300 por hora no órgão.
  if not equipe then
    v_origem := encode(digest(coalesce(split_part(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ',', 1), 'sem-ip')
                       || (select valor #>> '{}' from public.plataforma_config where chave = 'sal_origem') || v_hoje::text, 'sha256'), 'hex');
    if (select count(*) from public.atendimentos_envios e where e.orgao_id = p_orgao and e.origem_hash = v_origem and e.criado_em > now() - interval '1 hour') >= 5
       or (select count(*) from public.atendimentos_envios e where e.orgao_id = p_orgao and e.criado_em > now() - interval '1 hour') >= 300 then
      raise exception 'Muitos registros em pouco tempo. Aguarde alguns minutos e tente de novo.';
    end if;
    insert into public.atendimentos_envios (orgao_id, origem_hash) values (p_orgao, v_origem);
  end if;

  if v_texto is null or char_length(v_texto) < 10 then raise exception 'Descreva % (pelo menos 10 letras).', case p_canal when 'esic' then 'a informação que você procura' else 'a sua manifestação' end; end if;
  if p_canal = 'esic' then
    v_tipo := 'pedido';
    if v_ident not in ('identificado', 'preservada') then v_ident := 'identificado'; end if;
    -- LAI, art. 10: o pedido precisa identificar quem pede.
    if v_nome is null or char_length(v_nome) < 3 then raise exception 'Informe o seu nome (Lei 12.527/2011, art. 10).'; end if;
    if v_doc is null then raise exception 'Informe o CPF ou o CNPJ (Lei 12.527/2011, art. 10).'; end if;
  else
    if v_tipo not in ('reclamacao', 'denuncia', 'sugestao', 'elogio', 'solicitacao', 'simplificacao') then raise exception 'Escolha o tipo da manifestação.'; end if;
    if v_ident = 'anonimo' and v_tipo <> 'denuncia' then raise exception 'Só a denúncia pode ser anônima.'; end if;
    if v_ident not in ('identificado', 'anonimo') then v_ident := 'identificado'; end if;
    if v_ident = 'identificado' and (v_nome is null or char_length(v_nome) < 3) then raise exception 'Informe o seu nome, ou escolha denúncia anônima.'; end if;
  end if;
  if v_doc is not null and not public.documento_valido(v_doc) then raise exception 'CPF ou CNPJ inválido. Confira os números.'; end if;
  if v_email is not null and v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'E-mail inválido.'; end if;

  insert into public.atendimentos_numeros as n (orgao_id, canal, ano, ultimo) values (p_orgao, p_canal, v_ano, 1)
  on conflict (orgao_id, canal, ano) do update set ultimo = n.ultimo + 1 returning ultimo into v_num;
  v_prot := case p_canal when 'esic' then 'SIC' else 'OUV' end || '-' || v_ano || '-' || lpad(v_num::text, 6, '0');

  insert into public.atendimentos (orgao_id, canal, protocolo, ano, numero, tipo, assunto, texto, meio, forma_resposta, identificacao,
                                   data_registro, prazo, prazo_original, criado_por)
  values (p_orgao, p_canal, v_prot, v_ano, v_num, v_tipo, public.limpar_texto(p_dados ->> 'assunto', 200), v_texto, v_meio,
          case when p_dados ->> 'forma_resposta' in ('sistema', 'email', 'correspondencia', 'presencial') then p_dados ->> 'forma_resposta' else 'sistema' end,
          v_ident, v_hoje,
          public.ajustar_dia_util(p_orgao, v_hoje + public.dias_canal(c, 'resposta')), public.ajustar_dia_util(p_orgao, v_hoje + public.dias_canal(c, 'resposta')),
          case when equipe then auth.uid() end)
  returning * into a;
  insert into public.atendimentos_segredos (atendimento_id, codigo_hash) values (a.id, public.hash_acesso(v_prot, v_cod));

  if v_ident <> 'anonimo' then
    insert into public.atendimentos_solicitantes (atendimento_id, orgao_id, nome, tipo_pessoa, documento, email, telefone, endereco, municipio_uf, sexo, faixa_etaria, escolaridade)
    values (a.id, p_orgao, coalesce(v_nome, 'Não informado'), case length(v_doc) when 11 then 'fisica' when 14 then 'juridica' end, v_doc, v_email,
            public.limpar_texto(p_dados ->> 'telefone', 40), public.limpar_texto(p_dados ->> 'endereco', 300), public.limpar_texto(p_dados ->> 'municipio_uf', 120),
            case when p_dados ->> 'sexo' in ('feminino', 'masculino', 'nao_informado') then p_dados ->> 'sexo' end,
            case when p_dados ->> 'faixa_etaria' in ('ate_17', '18_29', '30_44', '45_59', '60_mais') then p_dados ->> 'faixa_etaria' end,
            case when p_dados ->> 'escolaridade' in ('fundamental', 'medio', 'superior', 'pos', 'sem') then p_dados ->> 'escolaridade' end);
  end if;
  insert into public.atendimentos_tramites (orgao_id, atendimento_id, tipo, texto, publico, usuario_id)
  values (p_orgao, a.id, 'registro', case when equipe then 'Registrado pela equipe (' || v_meio || ').' else 'Registrado pela internet.' end, true, auth.uid());
  perform public.enfileirar_email_atendimento(a, 'cidadao', 'registro');
  perform public.enfileirar_email_atendimento(a, 'equipe', 'registro');
  return jsonb_build_object('protocolo', v_prot, 'codigo', v_cod, 'prazo', a.prazo, 'id', case when equipe then a.id end,
                            'aceita_anexos', c.aceita_anexos, 'email', v_email is not null);
end;
$$;
grant execute on function public.registrar_atendimento(uuid, text, jsonb) to anon, authenticated;

-- Confere protocolo + código. 5 erros seguidos bloqueiam o protocolo por 15 minutos. Não usa
-- "raise" no erro (o raise desfaria a contagem): devolve o motivo em p_erro e o registro vazio.
create or replace function public.atendimento_por_codigo(p_orgao uuid, p_protocolo text, p_codigo text, out a public.atendimentos, out p_erro text)
language plpgsql security definer set search_path = public as $$
declare s public.atendimentos_segredos;
begin
  select * into a from public.atendimentos x where x.orgao_id = p_orgao and x.protocolo = upper(btrim(coalesce(p_protocolo, '')));
  if a.id is null then a := null; p_erro := 'Protocolo ou código de acesso não confere.'; return; end if;
  select * into s from public.atendimentos_segredos where atendimento_id = a.id for update;
  if s.bloqueado_ate > now() then
    p_erro := 'Muitas tentativas erradas. Tente de novo depois das ' || to_char(s.bloqueado_ate at time zone 'America/Sao_Paulo', 'HH24:MI') || '.';
    a := null; return;
  end if;
  if s.codigo_hash <> public.hash_acesso(a.protocolo, p_codigo) then
    update public.atendimentos_segredos set falhas = falhas + 1,
      bloqueado_ate = case when falhas + 1 >= 5 then now() + interval '15 minutes' end where atendimento_id = a.id;
    p_erro := 'Protocolo ou código de acesso não confere.'; a := null; return;
  end if;
  if s.falhas > 0 then update public.atendimentos_segredos set falhas = 0, bloqueado_ate = null where atendimento_id = a.id; end if;
end;
$$;

-- Rótulos usados nas mensagens e na consulta.
create or replace function public.rotulo_atendimento(p_campo text, p_valor text)
returns text language sql immutable as $$
  select case p_campo
    when 'situacao' then case p_valor when 'aberto' then 'Em análise' when 'aguardando_cidadao' then 'Aguardando complemento do cidadão'
      when 'respondido' then 'Respondido' when 'em_recurso' then 'Em recurso' when 'encerrado' then 'Encerrado' end
    when 'resultado' then case p_valor when 'concedido' then 'Acesso concedido' when 'parcial' then 'Acesso parcialmente concedido' when 'negado' then 'Acesso negado'
      when 'inexistente' then 'Informação inexistente' when 'incompetencia' then 'O órgão não tem competência sobre o assunto'
      when 'nao_pedido' then 'Não se trata de pedido de informação' when 'duplicado' then 'Pedido repetido'
      when 'concluida' then 'Respondida' when 'arquivada' then 'Arquivada' when 'fora_competencia' then 'Fora da competência do órgão' end
    when 'tipo' then case p_valor when 'pedido' then 'Pedido de acesso à informação' when 'reclamacao' then 'Reclamação' when 'denuncia' then 'Denúncia'
      when 'sugestao' then 'Sugestão' when 'elogio' then 'Elogio' when 'solicitacao' then 'Solicitação' when 'simplificacao' then 'Simplificação' end
    when 'decisao' then case p_valor when 'provido' then 'Recurso aceito' when 'parcial' then 'Recurso aceito em parte' when 'desprovido' then 'Recurso negado'
      when 'nao_conhecido' then 'Recurso não conhecido' end
    when 'motivo' then case p_valor when 'dados_pessoais' then 'Informação pessoal (LAI, art. 31)' when 'classificada' then 'Informação classificada em grau de sigilo (LAI, art. 23)'
      when 'sigilo_legal' then 'Sigilo previsto em outra lei' when 'generico' then 'Pedido genérico' when 'desproporcional' then 'Pedido desproporcional ou desarrazoado'
      when 'trabalho_adicional' then 'Exige trabalho adicional de análise ou consolidação' when 'processo_decisorio' then 'Documento preparatório (processo em andamento)'
      when 'outro' then 'Outro motivo' end
    when 'tramite' then case p_valor when 'registro' then 'Registro' when 'encaminhamento' then 'Encaminhado' when 'devolucao' then 'Devolvido à equipe central'
      when 'prorrogacao' then 'Prazo prorrogado' when 'complemento_pedido' then 'Pedido de complemento' when 'complemento_cidadao' then 'Complemento do cidadão'
      when 'retomada' then 'Análise retomada' when 'resposta' then 'Resposta' when 'recurso' then 'Recurso' when 'decisao_recurso' then 'Decisão do recurso'
      when 'reabertura' then 'Reaberto' when 'nota' then 'Nota interna' when 'classificacao' then 'Classificação' when 'encerramento' then 'Encerrado' end
  end;
$$;
grant execute on function public.rotulo_atendimento(text, text) to anon, authenticated;

-- Próxima instância de recurso possível hoje (0 = nenhuma).
create or replace function public.instancia_recurso_possivel(a public.atendimentos)
returns integer language plpgsql stable security definer set search_path = public as $$
declare c public.atendimento_canais; r1 public.atendimentos_recursos; r2 public.atendimentos_recursos; hoje date := public.hoje_brasil();
begin
  if a.canal <> 'esic' then return 0; end if;
  select * into c from public.atendimento_canais where orgao_id = a.orgao_id and canal = 'esic';
  select * into r1 from public.atendimentos_recursos where atendimento_id = a.id and instancia = 1;
  select * into r2 from public.atendimentos_recursos where atendimento_id = a.id and instancia = 2;
  if r1.id is null then
    -- Depois da resposta, no prazo do recurso; ou sem resposta depois do prazo (omissão).
    if (a.situacao = 'respondido' and hoje <= a.prazo_recurso) or (a.situacao in ('aberto', 'aguardando_cidadao') and hoje > a.prazo) then return 1; end if;
    return 0;
  end if;
  if r2.id is null and r1.decisao in ('parcial', 'desprovido', 'nao_conhecido') and coalesce(c.autoridade_recurso_2, '') <> ''
     and a.situacao = 'respondido' and hoje <= a.prazo_recurso then return 2; end if;
  return 0;
end;
$$;

-- Registra um recurso (pelo site ou pela equipe, no balcão).
create or replace function public.gravar_recurso(a public.atendimentos, p_texto text, p_motivo text)
returns public.atendimentos_recursos language plpgsql security definer set search_path = public as $$
declare
  c public.atendimento_canais; inst int := public.instancia_recurso_possivel(a); r public.atendimentos_recursos; hoje date := public.hoje_brasil();
  t text := public.limpar_texto(p_texto, 8000);
begin
  if inst = 0 then raise exception 'Não há recurso possível neste protocolo agora (fora do prazo ou instâncias esgotadas).'; end if;
  if t is null or char_length(t) < 10 then raise exception 'Explique o motivo do recurso (pelo menos 10 letras).'; end if;
  select * into c from public.atendimento_canais where orgao_id = a.orgao_id and canal = a.canal;
  insert into public.atendimentos_recursos (orgao_id, atendimento_id, instancia, motivo, texto, data_registro, prazo_decisao, autoridade)
  values (a.orgao_id, a.id, inst,
          case when p_motivo in ('negativa', 'omissao', 'incompleta', 'outro') then p_motivo when a.situacao <> 'respondido' then 'omissao' else 'negativa' end,
          t, hoje, public.ajustar_dia_util(a.orgao_id, hoje + public.dias_canal(c, case inst when 1 then 'decisao' else 'decisao_2' end)),
          case inst when 1 then c.autoridade_recurso_1 else c.autoridade_recurso_2 end)
  returning * into r;
  update public.atendimentos set situacao = 'em_recurso' where id = a.id returning * into a;
  insert into public.atendimentos_tramites (orgao_id, atendimento_id, tipo, texto, publico, usuario_id)
  values (a.orgao_id, a.id, 'recurso', 'Recurso em ' || inst || 'ª instância registrado. Decisão até ' || to_char(r.prazo_decisao, 'DD/MM/YYYY') || '.' || E'\n\n' || t, true, auth.uid());
  perform public.enfileirar_email_atendimento(a, 'cidadao', 'recurso', 'Decisão até ' || to_char(r.prazo_decisao, 'DD/MM/YYYY') || '.');
  perform public.enfileirar_email_atendimento(a, 'equipe', 'recurso', 'Recurso em ' || inst || 'ª instância. Decisão até ' || to_char(r.prazo_decisao, 'DD/MM/YYYY') || '.');
  return r;
end;
$$;

-- Consulta pelo site: andamento público, resposta, recursos e anexos. Nenhum dado pessoal.
create or replace function public.consultar_atendimento(p_orgao uuid, p_protocolo text, p_codigo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare chk record; a public.atendimentos; erro text; c public.atendimento_canais; u text;
begin
  select * into chk from public.atendimento_por_codigo(p_orgao, p_protocolo, p_codigo); a := chk.a; erro := chk.p_erro;
  if a.id is null then return jsonb_build_object('erro', erro); end if;
  select * into c from public.atendimento_canais where orgao_id = a.orgao_id and canal = a.canal;
  select coalesce(un.sigla || ' · ', '') || un.nome into u from public.unidades un where un.id = a.unidade_id;
  return jsonb_build_object(
    'protocolo', a.protocolo, 'canal', a.canal, 'tipo', a.tipo, 'tipo_rotulo', public.rotulo_atendimento('tipo', a.tipo),
    'assunto', a.assunto, 'texto', a.texto, 'identificacao', a.identificacao, 'registrado_em', a.registrado_em,
    'situacao', a.situacao, 'situacao_rotulo', public.rotulo_atendimento('situacao', a.situacao), 'unidade', u,
    'prazo', a.prazo, 'prorrogado', a.prorrogado_em is not null, 'prorrogacao_motivo', a.prorrogacao_motivo,
    'respondido_em', a.respondido_em, 'resposta', a.resposta, 'resultado', a.resultado, 'resultado_rotulo', public.rotulo_atendimento('resultado', a.resultado),
    'motivo_negativa', public.rotulo_atendimento('motivo', a.motivo_negativa), 'prazo_recurso', a.prazo_recurso,
    'recurso_possivel', public.instancia_recurso_possivel(a),
    'pode_complementar', a.situacao = 'aguardando_cidadao',
    'pode_avaliar', c.pesquisa_satisfacao and a.situacao in ('respondido', 'encerrado') and not exists (select 1 from public.atendimentos_avaliacoes v where v.atendimento_id = a.id),
    'avaliado', exists (select 1 from public.atendimentos_avaliacoes v where v.atendimento_id = a.id),
    'aceita_anexos', c.aceita_anexos,
    'andamento', coalesce((select jsonb_agg(jsonb_build_object('tipo', t.tipo, 'rotulo', public.rotulo_atendimento('tramite', t.tipo), 'texto', t.texto, 'em', t.criado_em) order by t.criado_em)
                  from public.atendimentos_tramites t where t.atendimento_id = a.id and t.publico), '[]'::jsonb),
    'recursos', coalesce((select jsonb_agg(jsonb_build_object('instancia', r.instancia, 'texto', r.texto, 'registrado_em', r.registrado_em, 'prazo_decisao', r.prazo_decisao,
                    'autoridade', r.autoridade, 'decisao', r.decisao, 'decisao_rotulo', public.rotulo_atendimento('decisao', r.decisao), 'decisao_texto', r.decisao_texto,
                    'decidido_em', r.decidido_em) order by r.instancia) from public.atendimentos_recursos r where r.atendimento_id = a.id), '[]'::jsonb),
    'anexos', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'tamanho', x.tamanho, 'origem', x.origem, 'em', x.criado_em) order by x.criado_em)
                  from public.atendimentos_anexos x where x.atendimento_id = a.id and x.publico), '[]'::jsonb));
end;
$$;
grant execute on function public.consultar_atendimento(uuid, text, text) to anon, authenticated;

create or replace function public.recorrer_atendimento(p_orgao uuid, p_protocolo text, p_codigo text, p_texto text, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare chk record; a public.atendimentos; erro text; r public.atendimentos_recursos;
begin
  select * into chk from public.atendimento_por_codigo(p_orgao, p_protocolo, p_codigo); a := chk.a; erro := chk.p_erro;
  if a.id is null then return jsonb_build_object('erro', erro); end if;
  r := public.gravar_recurso(a, p_texto, p_motivo);
  return jsonb_build_object('instancia', r.instancia, 'prazo_decisao', r.prazo_decisao);
end;
$$;
grant execute on function public.recorrer_atendimento(uuid, text, text, text, text) to anon, authenticated;

-- Complemento pedido pela equipe. Na Ouvidoria o prazo ficou parado: volta a correr
-- (Decreto 9.492/2018, art. 18).
create or replace function public.retomar_atendimento(a public.atendimentos, p_tipo text, p_texto text)
returns public.atendimentos language plpgsql security definer set search_path = public as $$
declare parado int := 0;
begin
  if a.canal = 'ouvidoria' and a.suspenso_em is not null then parado := greatest(public.hoje_brasil() - a.suspenso_em, 0); end if;
  update public.atendimentos set situacao = 'aberto', suspenso_em = null, dias_suspensos = dias_suspensos + parado where id = a.id returning * into a;
  update public.atendimentos set prazo = public.calcular_prazo_atendimento(a) where id = a.id returning * into a;
  insert into public.atendimentos_tramites (orgao_id, atendimento_id, tipo, texto, publico, usuario_id)
  values (a.orgao_id, a.id, p_tipo, p_texto || case when parado > 0 then E'\n\nNovo prazo: ' || to_char(a.prazo, 'DD/MM/YYYY') || '.' else '' end, true, auth.uid());
  return a;
end;
$$;
create or replace function public.complementar_atendimento(p_orgao uuid, p_protocolo text, p_codigo text, p_texto text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare chk record; a public.atendimentos; erro text; t text := public.limpar_texto(p_texto, 8000);
begin
  select * into chk from public.atendimento_por_codigo(p_orgao, p_protocolo, p_codigo); a := chk.a; erro := chk.p_erro;
  if a.id is null then return jsonb_build_object('erro', erro); end if;
  if a.situacao <> 'aguardando_cidadao' then return jsonb_build_object('erro', 'Este protocolo não está aguardando complemento.'); end if;
  if t is null or char_length(t) < 5 then return jsonb_build_object('erro', 'Escreva o complemento.'); end if;
  a := public.retomar_atendimento(a, 'complemento_cidadao', t);
  perform public.enfileirar_email_atendimento(a, 'equipe', 'complemento');
  return jsonb_build_object('prazo', a.prazo);
end;
$$;
grant execute on function public.complementar_atendimento(uuid, text, text, text) to anon, authenticated;

create or replace function public.avaliar_atendimento(p_orgao uuid, p_protocolo text, p_codigo text, p_nota integer, p_resolvido text, p_comentario text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare chk record; a public.atendimentos; erro text; c public.atendimento_canais;
begin
  select * into chk from public.atendimento_por_codigo(p_orgao, p_protocolo, p_codigo); a := chk.a; erro := chk.p_erro;
  if a.id is null then return jsonb_build_object('erro', erro); end if;
  select * into c from public.atendimento_canais where orgao_id = a.orgao_id and canal = a.canal;
  if not c.pesquisa_satisfacao or a.situacao not in ('respondido', 'encerrado') then return jsonb_build_object('erro', 'A avaliação fica disponível depois da resposta.'); end if;
  if p_nota is null or p_nota not between 1 and 5 or p_resolvido not in ('sim', 'parcial', 'nao') then return jsonb_build_object('erro', 'Escolha a nota e se a resposta resolveu.'); end if;
  insert into public.atendimentos_avaliacoes (atendimento_id, orgao_id, canal, nota, resolvido, comentario, data)
  values (a.id, a.orgao_id, a.canal, p_nota, p_resolvido, public.limpar_texto(p_comentario, 1000), public.hoje_brasil())
  on conflict (atendimento_id) do nothing;
  if not found then return jsonb_build_object('erro', 'Este protocolo já foi avaliado. Obrigado!'); end if;
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.avaliar_atendimento(uuid, text, text, integer, text, text) to anon, authenticated;

-- Anexos do cidadão: só pela função atendimento-arquivos (chave secreta), que confere o
-- tipo e o tamanho, grava no bucket privado e chama estas duas.
create or replace function public.anexo_cidadao_permitido(p_orgao uuid, p_protocolo text, p_codigo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare chk record; a public.atendimentos; erro text; c public.atendimento_canais; n int;
begin
  select * into chk from public.atendimento_por_codigo(p_orgao, p_protocolo, p_codigo); a := chk.a; erro := chk.p_erro;
  if a.id is null then return jsonb_build_object('erro', erro); end if;
  select * into c from public.atendimento_canais where orgao_id = a.orgao_id and canal = a.canal;
  if not c.aceita_anexos then return jsonb_build_object('erro', 'Este canal não recebe anexos pela internet.'); end if;
  if a.situacao = 'encerrado' then return jsonb_build_object('erro', 'Protocolo encerrado.'); end if;
  select count(*) into n from public.atendimentos_anexos where atendimento_id = a.id and origem = 'cidadao';
  if n >= 9 then return jsonb_build_object('erro', 'Limite de 9 anexos por protocolo.'); end if;
  -- No máximo 3 seguidos (por registro, complemento ou recurso): conta os da última hora.
  if (select count(*) from public.atendimentos_anexos where atendimento_id = a.id and origem = 'cidadao' and criado_em > now() - interval '1 hour') >= 3 then
    return jsonb_build_object('erro', 'Limite de 3 anexos por envio.');
  end if;
  return jsonb_build_object('id', a.id, 'orgao_id', a.orgao_id);
end;
$$;
create or replace function public.anexo_cidadao_registrar(p_atendimento uuid, p_nome text, p_caminho text, p_tamanho integer, p_tipo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare a public.atendimentos; t uuid; novo uuid;
begin
  select * into a from public.atendimentos where id = p_atendimento;
  if a.id is null or split_part(p_caminho, '/', 2) <> a.id::text or split_part(p_caminho, '/', 1) <> a.orgao_id::text then raise exception 'Caminho inválido.'; end if;
  select id into t from public.atendimentos_tramites where atendimento_id = a.id and tipo in ('registro', 'complemento_cidadao', 'recurso') order by criado_em desc limit 1;
  insert into public.atendimentos_anexos (orgao_id, atendimento_id, tramite_id, origem, publico, nome, caminho, tamanho, tipo_arquivo)
  values (a.orgao_id, a.id, t, 'cidadao', true, left(coalesce(nullif(btrim(p_nome), ''), 'anexo'), 200), p_caminho, p_tamanho, p_tipo)
  returning id into novo;
  return novo;
end;
$$;
-- Caminho de um anexo público do protocolo (para a função gerar o link temporário).
create or replace function public.anexo_caminho_cidadao(p_orgao uuid, p_protocolo text, p_codigo text, p_anexo uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare chk record; a public.atendimentos; erro text; x public.atendimentos_anexos;
begin
  select * into chk from public.atendimento_por_codigo(p_orgao, p_protocolo, p_codigo); a := chk.a; erro := chk.p_erro;
  if a.id is null then return jsonb_build_object('erro', erro); end if;
  select * into x from public.atendimentos_anexos where id = p_anexo and atendimento_id = a.id and publico;
  if x.id is null then return jsonb_build_object('erro', 'Anexo não encontrado.'); end if;
  return jsonb_build_object('caminho', x.caminho, 'nome', x.nome);
end;
$$;
revoke all on function public.anexo_cidadao_permitido(uuid, text, text), public.anexo_cidadao_registrar(uuid, text, text, integer, text),
  public.anexo_caminho_cidadao(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.anexo_cidadao_permitido(uuid, text, text), public.anexo_cidadao_registrar(uuid, text, text, integer, text),
  public.anexo_caminho_cidadao(uuid, text, text, uuid) to service_role;
-- As funções internas não ficam abertas na API.
revoke all on function public.atendimento_por_codigo(uuid, text, text), public.gravar_recurso(public.atendimentos, text, text),
  public.retomar_atendimento(public.atendimentos, text, text), public.enfileirar_email_atendimento(public.atendimentos, text, text, text),
  public.instancia_recurso_possivel(public.atendimentos), public.calcular_prazo_atendimento(public.atendimentos),
  public.canal_proprio(uuid, text) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 8. PAINEL: ações da equipe e identificação
-- ---------------------------------------------------------------------
-- p_acao: encaminhar {unidade_id, texto} · devolver {texto} · prorrogar {motivo} ·
--   pedir_complemento {texto} · retomar {texto} · responder {resultado, resposta, motivo_negativa} ·
--   registrar_recurso {texto, motivo} · decidir_recurso {decisao, texto} · nota {texto} ·
--   classificar {classificacao, tipo} · reabrir {motivo} · anexo {nome, caminho, tamanho, tipo, publico}
create or replace function public.atendimento_acao(p_id uuid, p_acao text, p_dados jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a public.atendimentos;
  c public.atendimento_canais;
  r public.atendimentos_recursos;
  central boolean;
  da_unidade boolean;
  hoje date := public.hoje_brasil();
  t text := public.limpar_texto(p_dados ->> 'texto', 20000);
  v uuid;
  nome_un text;
begin
  select * into a from public.atendimentos where id = p_id for update;
  if a.id is null or not public.pode_ver_atendimento(a.orgao_id, a.canal, a.unidade_id) then raise exception 'Atendimento não encontrado.'; end if;
  if not public.tem_permissao(a.orgao_id, a.canal, 'editar') then raise exception 'Seu perfil só pode ver os atendimentos.'; end if;
  central := public.equipe_central(a.orgao_id, a.canal);
  da_unidade := not central;   -- alcance numa unidade e o atendimento foi encaminhado a ela
  select * into c from public.atendimento_canais where orgao_id = a.orgao_id and canal = a.canal;

  if p_acao = 'nota' then
    if t is null then raise exception 'Escreva a nota.'; end if;
    insert into public.atendimentos_tramites (orgao_id, atendimento_id, tipo, texto, publico, usuario_id) values (a.orgao_id, a.id, 'nota', t, false, auth.uid());

  elsif p_acao = 'anexo' then
    if split_part(p_dados ->> 'caminho', '/', 2) <> a.id::text or split_part(p_dados ->> 'caminho', '/', 1) <> a.orgao_id::text then raise exception 'Caminho do arquivo inválido.'; end if;
    insert into public.atendimentos_anexos (orgao_id, atendimento_id, origem, publico, nome, caminho, tamanho, tipo_arquivo, usuario_id)
    values (a.orgao_id, a.id, 'equipe', coalesce((p_dados ->> 'publico')::boolean, true) and central, left(coalesce(p_dados ->> 'nome', 'anexo'), 200),
            p_dados ->> 'caminho', (p_dados ->> 'tamanho')::int, p_dados ->> 'tipo', auth.uid())
    returning id into v;
    return jsonb_build_object('id', v);

  elsif p_acao = 'devolver' then
    if a.unidade_id is null then raise exception 'O atendimento já está com a equipe central.'; end if;
    insert into public.atendimentos_tramites (orgao_id, atendimento_id, tipo, texto, publico, unidade_de, usuario_id)
    values (a.orgao_id, a.id, 'devolucao', coalesce(t, 'Devolvido sem observação.'), false, a.unidade_id, auth.uid());
    update public.atendimentos set unidade_id = null where id = a.id;

  elsif da_unidade then
    raise exception 'A unidade pode registrar notas, anexos e devolver à equipe central com a proposta de resposta. Responder, prorrogar e encaminhar ficam com a equipe central.';

  elsif p_acao = 'encaminhar' then
    v := nullif(p_dados ->> 'unidade_id', '')::uuid;
    if v is null or a.situacao not in ('aberto', 'aguardando_cidadao', 'em_recurso') then raise exception 'Escolha a unidade (o atendimento precisa estar em análise ou em recurso).'; end if;
    select coalesce(sigla || ' · ', '') || nome into nome_un from public.unidades where id = v and orgao_id = a.orgao_id;
    if nome_un is null then raise exception 'Unidade não encontrada neste órgão.'; end if;
    update public.atendimentos set unidade_id = v where id = a.id returning * into a;
    insert into public.atendimentos_tramites (orgao_id, atendimento_id, tipo, texto, publico, unidade_para, usuario_id)
    values (a.orgao_id, a.id, 'encaminhamento', 'Encaminhado para análise: ' || nome_un || '.', true, v, auth.uid());
    if t is not null then insert into public.atendimentos_tramites (orgao_id, atendimento_id, tipo, texto, publico, usuario_id) values (a.orgao_id, a.id, 'nota', t, false, auth.uid()); end if;
    perform public.enfileirar_email_atendimento(a, 'equipe', 'encaminhamento', 'Encaminhado a ' || nome_un || '.');

  elsif p_acao = 'prorrogar' then
    t := public.limpar_texto(p_dados ->> 'motivo', 2000);
    if a.situacao not in ('aberto', 'aguardando_cidadao') then raise exception 'Só se prorroga o que está em análise.'; end if;
    if a.prorrogado_em is not null then raise exception 'O prazo já foi prorrogado uma vez.'; end if;
    if public.dias_canal(c, 'prorrogacao') = 0 then raise exception 'A norma do órgão não prevê prorrogação.'; end if;
    if hoje > a.prazo then raise exception 'O prazo já venceu: a prorrogação precisa ser feita antes do fim do prazo.'; end if;
    if t is null or char_length(t) < 20 then raise exception 'Escreva a justificativa da prorrogação (pelo menos 20 letras): ela é enviada ao cidadão.'; end if;
    update public.atendimentos set prorrogado_em = now(), prorrogacao_motivo = t where id = a.id returning * into a;
    update public.atendimentos set prazo = public.calcular_prazo_atendimento(a) where id = a.id returning * into a;
    insert into public.atendimentos_tramites (orgao_id, atendimento_id, tipo, texto, publico, usuario_id)
    values (a.orgao_id, a.id, 'prorrogacao', 'Prazo prorrogado para ' || to_char(a.prazo, 'DD/MM/YYYY') || '. Justificativa: ' || t, true, auth.uid());
    perform public.enfileirar_email_atendimento(a, 'cidadao', 'prorrogacao');

  elsif p_acao = 'pedir_complemento' then
    if a.situacao <> 'aberto' then raise exception 'Só se pede complemento ao que está em análise.'; end if;
    if t is null or char_length(t) < 10 then raise exception 'Escreva o que falta (o texto vai para o cidadão).'; end if;
    update public.atendimentos set situacao = 'aguardando_cidadao', suspenso_em = case when a.canal = 'ouvidoria' then hoje end where id = a.id returning * into a;
    insert into public.atendimentos_tramites (orgao_id, atendimento_id, tipo, texto, publico, usuario_id)
    values (a.orgao_id, a.id, 'complemento_pedido', t || case when a.canal = 'ouvidoria' then E'\n\nO prazo de resposta fica parado até o complemento (Decreto 9.492/2018, art. 18).' else '' end, true, auth.uid());
    perform public.enfileirar_email_atendimento(a, 'cidadao', 'complemento');

  elsif p_acao = 'retomar' then
    if a.situacao <> 'aguardando_cidadao' then raise exception 'O atendimento não está aguardando o cidadão.'; end if;
    a := public.retomar_atendimento(a, 'retomada', coalesce(t, 'Análise retomada pela equipe.'));

  elsif p_acao = 'responder' then
    if a.situacao not in ('aberto', 'aguardando_cidadao') then raise exception 'Só se responde o que está em análise (recurso: use "Decidir recurso").'; end if;
    if (p_dados ->> 'resultado') is null then raise exception 'Escolha o resultado.'; end if;
    t := public.limpar_texto(p_dados ->> 'resposta', 20000);
    if t is null or char_length(t) < 10 then raise exception 'Escreva a resposta ao cidadão.'; end if;
    if a.canal = 'esic' and p_dados ->> 'resultado' in ('parcial', 'negado') and nullif(p_dados ->> 'motivo_negativa', '') is null then
      raise exception 'Informe o motivo da negativa (LAI, art. 11, § 1º, II).';
    end if;
    update public.atendimentos set situacao = case when a.canal = 'esic' then 'respondido' else 'encerrado' end,
           resultado = p_dados ->> 'resultado', resposta = t, respondido_em = now(),
           motivo_negativa = case when p_dados ->> 'resultado' in ('parcial', 'negado') then nullif(p_dados ->> 'motivo_negativa', '') end,
           prazo_recurso = case when a.canal = 'esic' then public.ajustar_dia_util(a.orgao_id, hoje + public.dias_canal(c, 'recurso')) end,
           encerrado_em = case when a.canal = 'ouvidoria' then now() end, suspenso_em = null
     where id = a.id returning * into a;
    insert into public.atendimentos_tramites (orgao_id, atendimento_id, tipo, texto, publico, usuario_id)
    values (a.orgao_id, a.id, 'resposta', public.rotulo_atendimento('resultado', a.resultado) || '.' ||
            case when a.motivo_negativa is not null then ' Motivo: ' || public.rotulo_atendimento('motivo', a.motivo_negativa) || '.' else '' end || E'\n\n' || t, true, auth.uid());
    perform public.enfileirar_email_atendimento(a, 'cidadao', 'resposta');

  elsif p_acao = 'registrar_recurso' then
    r := public.gravar_recurso(a, p_dados ->> 'texto', p_dados ->> 'motivo');
    return jsonb_build_object('instancia', r.instancia, 'prazo_decisao', r.prazo_decisao);

  elsif p_acao = 'decidir_recurso' then
    select * into r from public.atendimentos_recursos where atendimento_id = a.id and decisao is null order by instancia desc limit 1;
    if r.id is null then raise exception 'Não há recurso aguardando decisão.'; end if;
    if p_dados ->> 'decisao' not in ('provido', 'parcial', 'desprovido', 'nao_conhecido') then raise exception 'Escolha a decisão.'; end if;
    if t is null or char_length(t) < 10 then raise exception 'Escreva a decisão (o texto vai para o cidadão).'; end if;
    update public.atendimentos_recursos set decisao = p_dados ->> 'decisao', decisao_texto = t, decidido_em = now() where id = r.id returning * into r;
    -- Cabe 2ª instância se a 1ª não atendeu por inteiro e há autoridade de 2ª instância.
    if r.instancia = 1 and r.decisao <> 'provido' and coalesce(c.autoridade_recurso_2, '') <> '' then
      update public.atendimentos set situacao = 'respondido', prazo_recurso = public.ajustar_dia_util(a.orgao_id, hoje + public.dias_canal(c, 'recurso_2'))
       where id = a.id returning * into a;
    else
      update public.atendimentos set situacao = 'encerrado', encerrado_em = now(), prazo_recurso = null where id = a.id returning * into a;
    end if;
    insert into public.atendimentos_tramites (orgao_id, atendimento_id, tipo, texto, publico, usuario_id)
    values (a.orgao_id, a.id, 'decisao_recurso', 'Recurso em ' || r.instancia || 'ª instância: ' || public.rotulo_atendimento('decisao', r.decisao) || '.' ||
            case when a.situacao = 'respondido' then ' Cabe recurso em 2ª instância até ' || to_char(a.prazo_recurso, 'DD/MM/YYYY') || '.' else '' end || E'\n\n' || t, true, auth.uid());
    perform public.enfileirar_email_atendimento(a, 'cidadao', 'decisao');

  elsif p_acao = 'classificar' then
    update public.atendimentos set classificacao = public.limpar_texto(p_dados ->> 'classificacao', 120),
           tipo = case when a.canal = 'ouvidoria' and a.identificacao <> 'anonimo' and p_dados ->> 'tipo' in ('reclamacao', 'denuncia', 'sugestao', 'elogio', 'solicitacao', 'simplificacao')
                       then p_dados ->> 'tipo' else a.tipo end
     where id = a.id returning * into a;
    insert into public.atendimentos_tramites (orgao_id, atendimento_id, tipo, texto, publico, usuario_id)
    values (a.orgao_id, a.id, 'classificacao', 'Classificado: ' || public.rotulo_atendimento('tipo', a.tipo) || coalesce(' · ' || a.classificacao, '') || '.', false, auth.uid());

  elsif p_acao = 'reabrir' then
    t := public.limpar_texto(p_dados ->> 'motivo', 2000);
    if a.situacao not in ('respondido', 'encerrado') then raise exception 'Só se reabre o que já foi respondido ou encerrado.'; end if;
    if t is null or char_length(t) < 10 then raise exception 'Explique por que reabrir (fica no andamento interno).'; end if;
    if exists (select 1 from public.atendimentos_recursos where atendimento_id = a.id) then raise exception 'Atendimento com recurso não pode ser reaberto.'; end if;
    update public.atendimentos set situacao = 'aberto', resultado = null, resposta = null, respondido_em = null, motivo_negativa = null, prazo_recurso = null, encerrado_em = null
     where id = a.id;
    insert into public.atendimentos_tramites (orgao_id, atendimento_id, tipo, texto, publico, usuario_id) values (a.orgao_id, a.id, 'reabertura', t, false, auth.uid());
  else
    raise exception 'Ação desconhecida: %', p_acao;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.atendimento_acao(uuid, text, jsonb) to authenticated;

-- Identificação de quem pediu/se manifestou: só a equipe central do canal; cada leitura fica registrada.
create or replace function public.atendimento_identificacao(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.atendimentos; s public.atendimentos_solicitantes;
begin
  select * into a from public.atendimentos where id = p_id;
  if a.id is null or not public.equipe_central(a.orgao_id, a.canal) then
    raise exception 'Só a equipe central do % (acesso ao órgão todo e permissão de editar) vê a identificação.', case a.canal when 'esic' then 'SIC' else 'Ouvidoria' end;
  end if;
  if a.identificacao = 'anonimo' then return jsonb_build_object('anonimo', true); end if;
  select * into s from public.atendimentos_solicitantes where atendimento_id = a.id;
  insert into public.atendimentos_acessos (orgao_id, atendimento_id, usuario_id) values (a.orgao_id, a.id, auth.uid());
  return to_jsonb(s) - 'orgao_id' - 'atendimento_id';
end;
$$;
grant execute on function public.atendimento_identificacao(uuid) to authenticated;

-- Contadores da fila (abas e menu): em análise, a vencer, vencidos, recursos e aguardando.
create or replace function public.atendimento_resumo(p_orgao uuid)
returns table (canal text, abertos bigint, vencendo bigint, vencidos bigint, recursos bigint, recursos_vencidos bigint, aguardando bigint)
language sql stable security invoker set search_path = public as $$
  select a.canal,
         count(*) filter (where a.situacao = 'aberto'),
         count(*) filter (where a.situacao = 'aberto' and a.prazo >= public.hoje_brasil() and a.prazo <= public.hoje_brasil() + coalesce(c.aviso_dias, 5)),
         count(*) filter (where a.situacao in ('aberto', 'aguardando_cidadao') and a.prazo < public.hoje_brasil() and a.suspenso_em is null),
         count(*) filter (where a.situacao = 'em_recurso'),
         count(*) filter (where a.situacao = 'em_recurso' and exists (select 1 from public.atendimentos_recursos r where r.atendimento_id = a.id and r.decisao is null and r.prazo_decisao < public.hoje_brasil())),
         count(*) filter (where a.situacao = 'aguardando_cidadao')
  from public.atendimentos a left join public.atendimento_canais c on c.orgao_id = a.orgao_id and c.canal = a.canal
  where a.orgao_id = p_orgao
  group by a.canal;
$$;
grant execute on function public.atendimento_resumo(uuid) to authenticated;

-- Situação da fila de e-mails (sem endereços).
create or replace function public.atendimento_emails_situacao(p_orgao uuid)
returns table (smtp_ativo boolean, pendentes bigint, enviados bigint, erros bigint)
language sql stable security definer set search_path = public as $$
  select public.email_ativo(), count(*) filter (where e.situacao = 'pendente'), count(*) filter (where e.situacao = 'enviado'), count(*) filter (where e.situacao = 'erro')
  from public.atendimentos_emails e
  where e.orgao_id = p_orgao and (public.tem_permissao(p_orgao, 'esic', 'ver') or public.tem_permissao(p_orgao, 'ouvidoria', 'ver'));
$$;
grant execute on function public.atendimento_emails_situacao(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 9. RELATÓRIOS ESTATÍSTICOS AUTOMÁTICOS (12.7 e Ouvidoria)
--    Com o sistema próprio, o banco gera e publica o relatório de cada mês,
--    trimestre, semestre e ano desde o início do sistema. Campos travados
--    (só observação e PDF mudam). No período em que o sistema começou, o
--    relatório manual que já existia é guardado em parcela_manual e somado.
-- ---------------------------------------------------------------------
alter table public.atendimento_relatorios
  add column if not exists origem         text not null default 'manual' check (origem in ('manual', 'sistema')),
  add column if not exists parcial        boolean not null default false,   -- período em curso
  add column if not exists parcela_manual jsonb;                            -- números do sistema externo no ano da troca

create or replace function public.proteger_relatorio_sistema()
returns trigger language plpgsql set search_path = public as $$
-- parcela_manual: no período em que o sistema começou, a equipe informa os números do sistema externo
-- (antes da troca); a rotina soma com os do portal.
declare livres text[] := array['observacao', 'arquivo_url', 'link_externo', 'atualizado_em', 'parcela_manual'];
begin
  if current_user not in ('anon', 'authenticated') then return coalesce(new, old); end if;
  if tg_op = 'INSERT' then
    if new.origem = 'sistema' then raise exception 'Relatório do sistema próprio é gerado pelo banco.'; end if;
    return new;
  end if;
  if old.origem <> 'sistema' then
    if new.origem = 'sistema' then raise exception 'Relatório do sistema próprio é gerado pelo banco.'; end if;
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then raise exception 'Relatório gerado pelo sistema próprio não pode ser excluído (é refeito todo dia).'; end if;
  if (to_jsonb(new) - livres) is distinct from (to_jsonb(old) - livres) then
    raise exception 'Relatório gerado pelo sistema próprio: só a observação e o relatório completo (PDF ou link) podem mudar.';
  end if;
  return new;
end;
$$;
drop trigger if exists atendimento_relatorios_sistema on public.atendimento_relatorios;
create trigger atendimento_relatorios_sistema before insert or update or delete on public.atendimento_relatorios
  for each row execute function public.proteger_relatorio_sistema();

create or replace function public.proteger_itens_sistema()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated') and exists (select 1 from public.atendimento_relatorios r
       where r.id = coalesce(new.relatorio_id, old.relatorio_id) and r.origem = 'sistema') then
    raise exception 'As distribuições do relatório do sistema próprio são calculadas pelo banco.';
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists atendimento_relatorios_itens_sistema on public.atendimento_relatorios_itens;
create trigger atendimento_relatorios_itens_sistema before insert or update or delete on public.atendimento_relatorios_itens
  for each row execute function public.proteger_itens_sistema();

-- Números de um período a partir da fila (pedidos/manifestações registrados no período).
create or replace function public.estatisticas_atendimento(p_orgao uuid, p_canal text, p_ini date, p_fim date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
  itens jsonb;
  esic boolean := p_canal = 'esic';
begin
  select jsonb_strip_nulls(jsonb_build_object(
    'recebidos', count(*),
    'atendidos', count(*) filter (where a.resultado in ('concedido', 'concluida')),
    'parciais', case when esic then count(*) filter (where a.resultado = 'parcial') end,
    'indeferidos', count(*) filter (where a.resultado in ('negado', 'arquivada')),
    'outros', count(*) filter (where a.resultado in ('inexistente', 'incompetencia', 'nao_pedido', 'duplicado', 'fora_competencia')),
    'em_andamento', count(*) filter (where a.resultado is null),
    'concluidos', count(*) filter (where a.respondido_em is not null),
    'prazo_medio_dias', round(avg(((a.respondido_em at time zone 'America/Sao_Paulo')::date - a.data_registro)) filter (where a.respondido_em is not null), 1),
    'pessoas_fisicas', case when esic then count(*) filter (where s.tipo_pessoa = 'fisica') end,
    'pessoas_juridicas', case when esic then count(*) filter (where s.tipo_pessoa = 'juridica') end,
    'sexo_feminino', case when esic then count(*) filter (where s.sexo = 'feminino') end,
    'sexo_masculino', case when esic then count(*) filter (where s.sexo = 'masculino') end,
    'sexo_nao_informado', case when esic then count(*) filter (where s.sexo is null or s.sexo = 'nao_informado') end,
    'reclamacoes', case when not esic then count(*) filter (where a.tipo = 'reclamacao') end,
    'denuncias', case when not esic then count(*) filter (where a.tipo = 'denuncia') end,
    'sugestoes', case when not esic then count(*) filter (where a.tipo = 'sugestao') end,
    'elogios', case when not esic then count(*) filter (where a.tipo = 'elogio') end,
    'solicitacoes', case when not esic then count(*) filter (where a.tipo = 'solicitacao') end,
    'simplifique', case when not esic then count(*) filter (where a.tipo = 'simplificacao') end))
  into v
  from public.atendimentos a left join public.atendimentos_solicitantes s on s.atendimento_id = a.id
  where a.orgao_id = p_orgao and a.canal = p_canal and a.data_registro between p_ini and p_fim;
  if esic then
    v := v || jsonb_build_object(
      'recursos_1', (select count(*) from public.atendimentos_recursos r join public.atendimentos a on a.id = r.atendimento_id
                     where a.orgao_id = p_orgao and a.canal = p_canal and r.instancia = 1 and r.data_registro between p_ini and p_fim),
      'recursos_2', (select count(*) from public.atendimentos_recursos r join public.atendimentos a on a.id = r.atendimento_id
                     where a.orgao_id = p_orgao and a.canal = p_canal and r.instancia = 2 and r.data_registro between p_ini and p_fim));
  end if;
  -- Outras distribuições (quantidade por item, do maior para o menor).
  select coalesce(jsonb_agg(jsonb_build_object('dimensao', d.dimensao, 'item', d.item, 'quantidade', d.q) order by d.dimensao, d.q desc, d.item), '[]'::jsonb) into itens
  from (
    select x.dimensao, x.item, count(*) as q
    from public.atendimentos a
    left join public.atendimentos_solicitantes s on s.atendimento_id = a.id
    left join public.unidades u on u.id = a.unidade_id
    cross join lateral (values
      ('faixa_etaria', case s.faixa_etaria when 'ate_17' then 'Até 17 anos' when '18_29' then '18 a 29 anos' when '30_44' then '30 a 44 anos'
                                            when '45_59' then '45 a 59 anos' when '60_mais' then '60 anos ou mais' end),
      ('escolaridade', case s.escolaridade when 'sem' then 'Sem escolaridade' when 'fundamental' then 'Ensino fundamental' when 'medio' then 'Ensino médio'
                                            when 'superior' then 'Ensino superior' when 'pos' then 'Pós-graduação' end),
      ('localidade', initcap(btrim(s.municipio_uf))),
      ('meio', case a.meio when 'internet' then 'Internet (formulário do portal)' when 'presencial' then 'Presencial' when 'email' then 'E-mail'
                           when 'telefone' then 'Telefone' when 'carta' then 'Carta' else 'Outro' end),
      ('assunto', a.classificacao),
      ('unidade', u.nome),
      ('motivo_negativa', case when esic then public.rotulo_atendimento('motivo', a.motivo_negativa) end)) as x(dimensao, item)
    where a.orgao_id = p_orgao and a.canal = p_canal and a.data_registro between p_ini and p_fim and x.item is not null
    group by x.dimensao, x.item) d;
  return v || jsonb_build_object('itens', itens);
end;
$$;

-- Soma a parte manual (sistema externo) com a do sistema próprio.
create or replace function public.somar_estatisticas(p_sis jsonb, p_man jsonb)
returns jsonb language plpgsql immutable as $$
declare r jsonb := p_sis; k text; cs numeric; cm numeric;
begin
  if p_man is null then return p_sis; end if;
  for k in select jsonb_object_keys(p_man) loop
    continue when k in ('itens', 'prazo_medio_dias', 'concluidos');
    if jsonb_typeof(p_man -> k) = 'number' then
      r := r || jsonb_build_object(k, coalesce((r ->> k)::numeric, 0) + (p_man ->> k)::numeric);
    end if;
  end loop;
  -- Prazo médio ponderado pelo número de respostas de cada parte.
  cs := coalesce((p_sis ->> 'concluidos')::numeric, 0);
  cm := coalesce((p_man ->> 'atendidos')::numeric, 0) + coalesce((p_man ->> 'parciais')::numeric, 0) + coalesce((p_man ->> 'indeferidos')::numeric, 0) + coalesce((p_man ->> 'outros')::numeric, 0);
  if p_man ? 'prazo_medio_dias' and p_man ->> 'prazo_medio_dias' is not null and cs + cm > 0 then
    r := r || jsonb_build_object('prazo_medio_dias', round((coalesce((p_sis ->> 'prazo_medio_dias')::numeric, 0) * cs + (p_man ->> 'prazo_medio_dias')::numeric * cm) / (cs + cm), 1));
  end if;
  r := r || jsonb_build_object('itens', coalesce((
    select jsonb_agg(jsonb_build_object('dimensao', dimensao, 'item', item, 'quantidade', q) order by dimensao, q desc, item)
    from (select i ->> 'dimensao' as dimensao, i ->> 'item' as item, sum((i ->> 'quantidade')::int) as q
          from jsonb_array_elements(coalesce(p_sis -> 'itens', '[]') || coalesce(p_man -> 'itens', '[]')) i group by 1, 2) t), '[]'::jsonb));
  return r;
end;
$$;

create or replace function public.gerar_relatorios_atendimento(p_orgao uuid, p_canal text)
returns integer language plpgsql security definer set search_path = public as $$
declare
  c public.atendimento_canais;
  hoje date := public.hoje_brasil();
  y int; abr text; meses int; k int; di date; df date; num int;
  rel public.atendimento_relatorios;
  v jsonb; manual jsonb; antes jsonb; depois jsonb; itens_antes jsonb;
  campos text[] := array['recebidos', 'atendidos', 'parciais', 'indeferidos', 'em_andamento', 'outros', 'recursos_1', 'recursos_2', 'prazo_medio_dias',
                          'pessoas_fisicas', 'pessoas_juridicas', 'sexo_feminino', 'sexo_masculino', 'sexo_nao_informado',
                          'reclamacoes', 'denuncias', 'sugestoes', 'elogios', 'solicitacoes', 'simplifique'];
  mudou int := 0;
  rid uuid;
begin
  -- Chamada pela API (há login ou visitante): só a equipe central. O agendamento não tem login.
  if coalesce(current_setting('request.jwt.claims', true), '') <> '' and not public.equipe_central(p_orgao, p_canal) then
    raise exception 'Só a equipe central atualiza os relatórios.';
  end if;
  c := public.canal_proprio(p_orgao, p_canal);
  if c.id is null or c.sistema_desde is null then return 0; end if;
  for y in extract(year from c.sistema_desde)::int .. extract(year from hoje)::int loop
    foreach abr in array array['ano', 'semestre', 'trimestre', 'mes'] loop
      meses := case abr when 'mes' then 1 when 'trimestre' then 3 when 'semestre' then 6 else 12 end;
      for k in 1 .. 12 / meses loop
        di := make_date(y, (k - 1) * meses + 1, 1);
        df := (di + make_interval(months => meses) - interval '1 day')::date;
        continue when di > hoje or df < c.sistema_desde;
        num := case when abr = 'ano' then null else k end;
        select * into rel from public.atendimento_relatorios r
         where r.orgao_id = p_orgao and r.canal = p_canal and r.exercicio = y and r.abrangencia = abr and coalesce(r.numero, 0) = coalesce(num, 0);
        manual := null;
        if rel.id is not null then
          if rel.origem = 'sistema' then manual := case when di < c.sistema_desde then rel.parcela_manual end;
          elsif di < c.sistema_desde then
            -- Relatório manual do período da troca: vira a "parcela do sistema externo".
            select jsonb_strip_nulls(to_jsonb(rel)) - array['id', 'orgao_id', 'canal', 'exercicio', 'abrangencia', 'numero', 'observacao', 'arquivo_url', 'link_externo',
                     'data_inicio', 'data_fim', 'situacao', 'publicado_em', 'criado_em', 'atualizado_em', 'origem', 'parcial', 'parcela_manual']
                   || jsonb_build_object('itens', coalesce((select jsonb_agg(jsonb_build_object('dimensao', i.dimensao, 'item', i.item, 'quantidade', i.quantidade))
                                                            from public.atendimento_relatorios_itens i where i.relatorio_id = rel.id), '[]'::jsonb))
              into manual;
          end if;
        end if;
        v := public.somar_estatisticas(public.estatisticas_atendimento(p_orgao, p_canal, di, greatest(least(df, hoje), di)), manual);
        depois := (select jsonb_object_agg(x, v -> x) from unnest(campos) x);
        if rel.id is null then
          insert into public.atendimento_relatorios (orgao_id, canal, exercicio, abrangencia, numero, situacao, origem, parcial)
          values (p_orgao, p_canal, y, abr, num, 'publicado', 'sistema', df >= hoje) returning * into rel;
          antes := null; mudou := mudou + 1;
        else
          antes := (select jsonb_object_agg(x, to_jsonb(rel) -> x) from unnest(campos) x);
        end if;
        if antes is distinct from depois or rel.origem <> 'sistema' or rel.parcial <> (df >= hoje) or rel.situacao <> 'publicado'
           or rel.parcela_manual is distinct from manual then
          update public.atendimento_relatorios set origem = 'sistema', situacao = 'publicado', parcial = df >= hoje, parcela_manual = manual,
                 recebidos = coalesce((v ->> 'recebidos')::int, 0), atendidos = (v ->> 'atendidos')::int, parciais = (v ->> 'parciais')::int,
                 indeferidos = (v ->> 'indeferidos')::int, em_andamento = (v ->> 'em_andamento')::int, outros = (v ->> 'outros')::int,
                 recursos_1 = (v ->> 'recursos_1')::int, recursos_2 = (v ->> 'recursos_2')::int, prazo_medio_dias = (v ->> 'prazo_medio_dias')::numeric,
                 pessoas_fisicas = (v ->> 'pessoas_fisicas')::int, pessoas_juridicas = (v ->> 'pessoas_juridicas')::int, sexo_feminino = (v ->> 'sexo_feminino')::int,
                 sexo_masculino = (v ->> 'sexo_masculino')::int, sexo_nao_informado = (v ->> 'sexo_nao_informado')::int,
                 reclamacoes = (v ->> 'reclamacoes')::int, denuncias = (v ->> 'denuncias')::int, sugestoes = (v ->> 'sugestoes')::int,
                 elogios = (v ->> 'elogios')::int, solicitacoes = (v ->> 'solicitacoes')::int, simplifique = (v ->> 'simplifique')::int
           where id = rel.id;
          if antes is not null then mudou := mudou + 1; end if;
        end if;
        -- Distribuições: troca só se mudaram.
        select coalesce(jsonb_agg(jsonb_build_object('dimensao', i.dimensao, 'item', i.item, 'quantidade', i.quantidade) order by i.dimensao, i.quantidade desc, i.item), '[]'::jsonb)
          into itens_antes from public.atendimento_relatorios_itens i where i.relatorio_id = rel.id;
        if itens_antes is distinct from coalesce(v -> 'itens', '[]'::jsonb) then
          delete from public.atendimento_relatorios_itens where relatorio_id = rel.id;
          insert into public.atendimento_relatorios_itens (orgao_id, relatorio_id, dimensao, item, quantidade, ordem)
          select p_orgao, rel.id, i ->> 'dimensao', left(i ->> 'item', 200), (i ->> 'quantidade')::int, (o - 1)::int
          from jsonb_array_elements(coalesce(v -> 'itens', '[]'::jsonb)) with ordinality as t(i, o);
        end if;
      end loop;
    end loop;
  end loop;
  return mudou;
end;
$$;
-- Na Supabase, toda função nova nasce liberada para o visitante (anon): aqui só para quem tem login
-- (a equipe central; o agendamento roda como dono do banco).
revoke all on function public.gerar_relatorios_atendimento(uuid, text) from public, anon;
grant execute on function public.gerar_relatorios_atendimento(uuid, text) to authenticated;
revoke all on function public.atendimento_acao(uuid, text, jsonb), public.atendimento_identificacao(uuid), public.atendimento_emails_situacao(uuid) from public, anon;
revoke all on function public.estatisticas_atendimento(uuid, text, date, date) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 10. PESQUISA DE SATISFAÇÃO (15.6): resultados agregados para o site
-- ---------------------------------------------------------------------
create or replace function public.atendimento_satisfacao(p_orgao uuid)
returns table (canal text, ano integer, mes integer, nota integer, resolvido text, quantidade bigint)
language sql stable security definer set search_path = public as $$
  select v.canal, extract(year from v.data)::int, extract(month from v.data)::int, v.nota, v.resolvido, count(*)
  from public.atendimentos_avaliacoes v where v.orgao_id = p_orgao
  group by 1, 2, 3, 4, 5 order by 2 desc, 3 desc;
$$;
grant execute on function public.atendimento_satisfacao(uuid) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 11. AVISOS DE PRAZO (substitui a versão do script 24)
-- ---------------------------------------------------------------------
create or replace function public.pendencias_atendimento(p_orgao uuid)
returns table (modulo text, nivel text, mensagem text, quantidade bigint)
language plpgsql stable security invoker set search_path = public as $$
declare
  v_ano int := extract(year from current_date)::int;
  fora text[];
  c record;
  ext text;
  f record;
begin
  if not public.e_membro(p_orgao) then return; end if;
  select coalesce(array_agg(x), '{}') into fora from (
    select x from public.partes_sem_dados(p_orgao) x
    union
    select k from public.orgaos o, jsonb_each_text(coalesce(o.configuracoes -> 'destinos', '{}'::jsonb)) as d(k, v)
    where o.id = p_orgao and coalesce(d.v, '') <> '') t;
  if 'esic' = any (fora) then fora := fora || array['esic_canal', 'esic_relatorios', 'esic_classificadas', 'esic_desclassificadas', 'esic_pedidos']; end if;
  if 'ouvidoria' = any (fora) then fora := fora || array['ouvidoria_canal', 'ouvidoria_relatorios', 'ouvidoria_manifestacoes', 'ouvidoria_satisfacao']; end if;
  fora := fora || coalesce((select array_agg(d.secao) from public.declaracoes_inexistencia d
                            where d.orgao_id = p_orgao and d.abrangencia = 'ano' and d.exercicio = v_ano - 1), '{}');

  -- Fila do sistema próprio: vencidos, a vencer e recursos.
  for f in select * from public.atendimento_resumo(p_orgao) loop
    if f.vencidos > 0 then return query select f.canal, 'alerta', case f.canal when 'esic' then 'pedido(s)' else 'manifestação(ões)' end || ' com o prazo de resposta vencido (aba "' || case f.canal when 'esic' then 'Pedidos' else 'Manifestações' end || '").', f.vencidos; end if;
    if f.recursos_vencidos > 0 then return query select f.canal, 'alerta', 'recurso(s) com o prazo de decisão vencido.', f.recursos_vencidos; end if;
    if f.vencendo > 0 then return query select f.canal, 'info', case f.canal when 'esic' then 'pedido(s)' else 'manifestação(ões)' end || ' vencem nos próximos dias.', f.vencendo; end if;
    if f.recursos - f.recursos_vencidos > 0 then return query select f.canal, 'info', 'recurso(s) aguardando decisão.', f.recursos - f.recursos_vencidos; end if;
  end loop;

  -- 12.1 a 12.6: dados do SIC
  if not ('esic_canal' = any (fora)) then
    select * into c from public.atendimento_canais a where a.orgao_id = p_orgao and a.canal = 'esic';
    if c.id is null or (c.unidade_id is null and c.setor is null) then
      return query select 'esic', 'alerta', 'falta a unidade ou o setor responsável pelo SIC (PNTP 12.1), na aba "Como pedir".', 1::bigint; end if;
    if c.id is null or (coalesce(c.endereco, '') = '' and c.unidade_id is null) or coalesce(c.email, '') = '' or (coalesce(c.horario, '') = '' and c.unidade_id is null) then
      return query select 'esic', 'alerta', 'faltam endereço, e-mail ou horário de funcionamento do SIC (PNTP 12.2).', 1::bigint; end if;
    if not ('esic_pedidos' = any (fora)) and not coalesce(c.sistema_proprio, false) then
      return query select 'esic', 'alerta', 'falta o formulário eletrônico de pedidos (PNTP 12.3): ligue o sistema próprio na aba "Como pedir" ou informe o link do sistema externo em Aparência › Destinos das páginas ("e-SIC: pedidos").', 1::bigint; end if;
    if c.id is null or (c.norma_publicacao is null and c.norma_texto is null) then
      return query select 'esic', 'alerta', 'falta a norma local que regulamenta a Lei de Acesso à Informação (PNTP 12.5).', 1::bigint; end if;
    if c.id is null or c.prazo_resposta is null or c.prazo_recurso is null or c.autoridade_recurso_1 is null or c.procedimento_recurso is null then
      return query select 'esic', 'info', 'faltam prazos, autoridades ou o procedimento do recurso na aba "Prazos e recursos" (PNTP 12.6).', 1::bigint; end if;
  end if;

  if not ('esic_relatorios' = any (fora)) and not exists (select 1 from public.atendimento_relatorios r
       where r.orgao_id = p_orgao and r.canal = 'esic' and r.situacao = 'publicado' and r.exercicio = v_ano - 1 and r.abrangencia = 'ano') then
    return query select 'esic', 'alerta', 'falta o relatório estatístico anual dos pedidos de ' || (v_ano - 1) || ' (PNTP 12.7).', 1::bigint;
  end if;
  if not ('esic_classificadas' = any (fora)) and not exists (select 1 from public.informacoes_classificadas i
       where i.orgao_id = p_orgao and i.situacao = 'publicado' and i.exercicio = v_ano - 1) then
    return query select 'esic', 'alerta', 'nenhuma informação classificada em ' || (v_ano - 1) || ' publicada (PNTP 12.8): se não houve, declare na aba "Informações classificadas".', 1::bigint;
  end if;
  if not ('esic_desclassificadas' = any (fora)) and not exists (select 1 from public.informacoes_classificadas i
       where i.orgao_id = p_orgao and i.situacao = 'publicado' and (i.ano_desclassificacao = v_ano - 1 or i.data_desclassificacao >= current_date - 365)) then
    return query select 'esic', 'alerta', 'nenhuma desclassificação de ' || (v_ano - 1) || ' ou dos últimos 12 meses publicada (PNTP 12.9): se não houve, declare na aba "Informações desclassificadas".', 1::bigint;
  end if;
  return query select 'esic', 'alerta', 'informação(ões) com o prazo de sigilo encerrado e sem desclassificação registrada (LAI, art. 24, § 4º).', count(*)
    from public.informacoes_classificadas i
    where i.orgao_id = p_orgao and i.data_desclassificacao is null and i.prazo_fim < current_date
    having count(*) > 0;

  -- 14.1 e 14.2: dados da ouvidoria
  if not ('ouvidoria_canal' = any (fora)) then
    select * into c from public.atendimento_canais a where a.orgao_id = p_orgao and a.canal = 'ouvidoria';
    if c.id is null or ((coalesce(c.endereco, '') = '' or coalesce(c.telefone, '') = '' or coalesce(c.horario, '') = '') and c.unidade_id is null) then
      return query select 'ouvidoria', 'alerta', 'faltam endereço, telefone ou horário do atendimento presencial da Ouvidoria (PNTP 14.1).', 1::bigint; end if;
    if not ('ouvidoria_manifestacoes' = any (fora)) and not coalesce(c.sistema_proprio, false) then
      return query select 'ouvidoria', 'alerta', 'falta o canal eletrônico da Ouvidoria (PNTP 14.2): ligue o sistema próprio na aba "Como se manifestar" ou informe o link do sistema externo em Aparência › Destinos das páginas ("Ouvidoria: manifestações").', 1::bigint; end if;
    -- 15.6: pesquisa de satisfação (no sistema próprio ou link externo)
    if not ('ouvidoria_satisfacao' = any (fora)) and not exists (select 1 from public.atendimento_canais x
         where x.orgao_id = p_orgao and x.sistema_proprio and x.pesquisa_satisfacao) then
      return query select 'ouvidoria', 'info', 'falta a pesquisa de satisfação dos usuários (PNTP 15.6): ligue o sistema próprio com a pesquisa ou informe o link em Aparência › Destinos das páginas ("Ouvidoria: pesquisa de satisfação").', 1::bigint;
    end if;
  end if;
  if not ('ouvidoria_relatorios' = any (fora)) and not exists (select 1 from public.atendimento_relatorios r
       where r.orgao_id = p_orgao and r.canal = 'ouvidoria' and r.situacao = 'publicado' and r.exercicio = v_ano - 1 and r.abrangencia = 'ano') then
    return query select 'ouvidoria', 'info', 'falta o relatório anual das manifestações de ' || (v_ano - 1) || ' (Lei 13.460/2017, arts. 14 e 15).', 1::bigint;
  end if;
end;
$$;
grant execute on function public.pendencias_atendimento(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 12. ROTINA DIÁRIA (04:20 de Brasília) E ENVIO DE E-MAILS (a cada 15 min)
-- ---------------------------------------------------------------------
create or replace function public.rotina_atendimento()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  hoje date := public.hoje_brasil();
  a public.atendimentos;
  n_enc int := 0; n_av int := 0; n_rel int := 0;
  c record;
begin
  -- 1. e-SIC respondido sem recurso no prazo: encerra.
  for a in select * from public.atendimentos where canal = 'esic' and situacao = 'respondido' and prazo_recurso < hoje for update loop
    update public.atendimentos set situacao = 'encerrado', encerrado_em = now() where id = a.id;
    insert into public.atendimentos_tramites (orgao_id, atendimento_id, tipo, texto, publico)
    values (a.orgao_id, a.id, 'encerramento', 'Encerrado: terminou o prazo para recurso.', true);
    n_enc := n_enc + 1;
  end loop;
  -- 2. Avisos à equipe: vence em breve e venceu.
  for a in select x.* from public.atendimentos x join public.atendimento_canais k on k.orgao_id = x.orgao_id and k.canal = x.canal
            where x.situacao = 'aberto' and x.aviso_enviado_em is null and x.prazo >= hoje and x.prazo <= hoje + k.aviso_dias loop
    perform public.enfileirar_email_atendimento(a, 'equipe', 'vencendo');
    update public.atendimentos set aviso_enviado_em = now() where id = a.id; n_av := n_av + 1;
  end loop;
  for a in select * from public.atendimentos where situacao in ('aberto', 'aguardando_cidadao') and suspenso_em is null and prazo < hoje and vencido_avisado_em is null loop
    perform public.enfileirar_email_atendimento(a, 'equipe', 'vencido');
    update public.atendimentos set vencido_avisado_em = now() where id = a.id; n_av := n_av + 1;
  end loop;
  -- 3. Limpeza: controle de envios (2 dias) e e-mails já enviados (180 dias).
  delete from public.atendimentos_envios where criado_em < now() - interval '2 days';
  delete from public.atendimentos_emails where situacao in ('enviado', 'cancelado') and criado_em < now() - interval '180 days';
  -- 4. Relatórios estatísticos do sistema próprio.
  for c in select orgao_id, canal from public.atendimento_canais where sistema_proprio loop
    n_rel := n_rel + public.gerar_relatorios_atendimento(c.orgao_id, c.canal);
  end loop;
  return jsonb_build_object('encerrados', n_enc, 'avisos', n_av, 'relatorios', n_rel);
end;
$$;
revoke all on function public.rotina_atendimento() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'atendimento_chave') then
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'atendimento_chave',
      'Chave que o agendamento usa para chamar a função atendimento-emails');
  end if;
end $$;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.unschedule(jobid) from cron.job where jobname in ('atendimento-rotina', 'atendimento-emails');
select cron.schedule('atendimento-rotina', '20 7 * * *', $cron$ select public.rotina_atendimento(); $cron$);
select cron.schedule('atendimento-emails', '*/15 * * * *', $cron$
  select net.http_post(
    url := (select valor #>> '{}' from public.plataforma_config where chave = 'emails_url'),
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-chave-sinc', (select decrypted_secret from vault.decrypted_secrets where name = 'atendimento_chave')),
    body := '{}'::jsonb, timeout_milliseconds := 60000)
  where public.email_ativo() and exists (select 1 from public.atendimentos_emails where situacao = 'pendente');
$cron$);

-- Para ligar os e-mails depois de configurar o SMTP (ver README):
--   1. copie a chave abaixo para Edge Functions › Secrets › ATENDIMENTO_CHAVE;
--   2. update public.plataforma_config set valor = '{"ativo": true}' where chave = 'smtp';
select decrypted_secret as "copie esta chave para ATENDIMENTO_CHAVE"
from vault.decrypted_secrets where name = 'atendimento_chave';
