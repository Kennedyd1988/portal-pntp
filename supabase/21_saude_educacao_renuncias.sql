-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 21 — Saúde (PNTP 18.1 a 18.6), Educação e assistência social
--             (19.1 a 19.4), conselhos e Renúncias de receita (16.1 a 16.4)
--
--   1. Módulos novos: "saude", "educacao" (Educação, assistência social e
--      conselhos) e "renuncias". O antigo "setoriais" (que nunca teve tela)
--      sai; as permissões dele passam para saúde e educação, e as de
--      "financeiro" para renúncias.
--   2. secoes_setoriais: para cada seção (ex.: lista de espera, estoque,
--      creches), o texto da seção (ex.: critérios de prioridade das creches)
--      e a declaração de que não há dados. O link para sistema externo fica
--      em Aparência › Destinos das páginas (mesma chave).
--   3. documentos_setoriais: plano de saúde, programação anual, relatório
--      de gestão, RDQA (18.1); plano de educação e relatório de resultados
--      (19.1); planos e relatórios da assistência social.
--   4. Saúde: estabelecimentos e profissionais (18.2), lista de espera da
--      regulação (18.3), medicamentos do SUS (18.4) e estoque das farmácias
--      (18.5).
--   5. Conselhos (18.6, 19.3, 19.4 e outros): composição, funcionamento,
--      atas, pautas e resoluções.
--   6. Educação: lista de espera das creches (19.2).
--   7. Renúncias: desonerações com fundamento legal, requisitos e
--      procedimento (16.1), previsto × realizado por exercício (16.2),
--      beneficiários (16.3) e projetos de incentivo à cultura e ao esporte
--      (16.4). CPF de pessoa física nunca sai inteiro no site (LGPD).
--   8. importar_lista: troca (ou acrescenta) as listas grandes de uma vez,
--      com UMA linha no histórico por importação.
--   9. pendencias_atualizacao: avisos novos de prazo destes módulos.
--
-- Como usar: SQL Editor › New query › colar tudo › Run. Pode repetir.
-- Rodar DEPOIS dos scripts 01 a 20.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. MÓDULOS E PERMISSÕES
-- ---------------------------------------------------------------------
insert into public.modulos (codigo, nome, grupo, ordem) values
  ('renuncias', 'Renúncias de receita', 'Transparência', 62),
  ('saude', 'Saúde', 'Transparência', 100),
  ('educacao', 'Educação, assistência social e conselhos', 'Transparência', 101)
on conflict (codigo) do nothing;

-- Copiadas de "setoriais" (enquanto ele existir) ou, na repetição do script, já existem.
insert into public.perfil_permissoes (perfil_id, modulo, pode_ver, pode_editar, pode_publicar, pode_excluir)
select perfil_id, m.codigo, pode_ver, pode_editar, pode_publicar, pode_excluir
from public.perfil_permissoes pp cross join (values ('saude'), ('educacao')) as m(codigo)
where pp.modulo = 'setoriais'
on conflict (perfil_id, modulo) do nothing;

insert into public.perfil_permissoes (perfil_id, modulo, pode_ver, pode_editar, pode_publicar, pode_excluir)
select perfil_id, 'renuncias', pode_ver, pode_editar, pode_publicar, pode_excluir
from public.perfil_permissoes where modulo = 'financeiro'
on conflict (perfil_id, modulo) do nothing;

delete from public.modulos where codigo = 'setoriais';

-- Módulo de cada assunto: saúde → "saude"; renúncias → "renuncias"; o resto → "educacao".
create or replace function public.modulo_setorial(p_chave text)
returns text language sql immutable set search_path = public as $$
  select case when p_chave = 'saude' or p_chave like 'saude\_%' then 'saude'
              when p_chave like 'renuncias%' then 'renuncias'
              else 'educacao' end;
$$;

-- Documento (CPF/CNPJ) como aparece no site: CNPJ inteiro; CPF com o meio só (LGPD).
create or replace function public.documento_publico(p_doc text)
returns text language sql immutable set search_path = public as $$
  select case when p_doc ~ '^\d{14}$' then regexp_replace(p_doc, '^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$', '\1.\2.\3/\4-\5')
              when p_doc ~ '^\d{11}$' then '***.' || substr(p_doc, 4, 3) || '.' || substr(p_doc, 7, 3) || '-**'
              else null end;
$$;

-- Rascunho → publicado nas tabelas que servem a dois módulos (o módulo vem da coluna "area" ou "tipo").
create or replace function public.controlar_publicacao_setorial()
returns trigger language plpgsql set search_path = public as $$
declare
  v_modulo text := public.modulo_setorial(coalesce(to_jsonb(new) ->> 'area', to_jsonb(new) ->> 'tipo'));
begin
  if current_user in ('anon', 'authenticated')
     and (new.situacao = 'publicado' or (tg_op = 'UPDATE' and old.situacao = 'publicado'))
     and not public.tem_permissao(new.orgao_id, v_modulo, 'publicar') then
    raise exception 'Seu perfil não pode publicar nem alterar o que já está publicado. Salve como rascunho e peça a quem aprova.';
  end if;
  if new.situacao = 'publicado' and new.publicado_em is null then new.publicado_em := now(); end if;
  return new;
end;
$$;

-- Histórico das listas grandes: igual ao padrão (registrar_historico), mas a importação em lote
-- (importar_lista) grava uma linha só, em vez de uma por registro.
create or replace function public.registrar_historico_lista()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  antes  jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  depois jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  base   jsonb := coalesce(depois, antes);
begin
  if coalesce(current_setting('pntp.importando', true), '') = '1' then return coalesce(new, old); end if;
  insert into public.historico (orgao_id, usuario_id, tabela, registro_id, acao, dados_antes, dados_depois)
  values ((base ->> 'orgao_id')::uuid, auth.uid(), tg_table_name, base ->> 'id',
    case tg_op when 'INSERT' then 'inserir'::public.acao_historico when 'UPDATE' then 'editar'::public.acao_historico else 'excluir'::public.acao_historico end,
    antes, depois);
  return coalesce(new, old);
end;
$$;


-- ---------------------------------------------------------------------
-- 2. SEÇÕES (link externo, texto e declaração de inexistência)
-- ---------------------------------------------------------------------
create table if not exists public.secoes_setoriais (
  id              uuid primary key default gen_random_uuid(),
  orgao_id        uuid not null references public.orgaos(id) on delete cascade,
  secao           text not null check (secao in (
                    'saude_documentos', 'saude_servicos', 'saude_espera', 'saude_medicamentos', 'saude_estoque', 'saude_conselho',
                    'educacao_documentos', 'educacao_creches', 'educacao_fundeb', 'educacao_assistencia', 'educacao_conselhos',
                    'renuncias_desoneracoes', 'renuncias_valores', 'renuncias_beneficiarios', 'renuncias_incentivos')),
  texto           text check (texto is null or char_length(texto) <= 8000),          -- ex.: critérios de prioridade das creches
  sem_ocorrencia  boolean not null default false,                                     -- "não há" (declaração com data)
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (orgao_id, secao)
);
-- O link para sistema externo fica só em Aparência › Destinos das páginas (configuracoes.destinos,
-- mesma chave da seção). Versões anteriores deste script criavam a coluna aqui: sai.
alter table public.secoes_setoriais drop column if exists link_externo;
drop trigger if exists secoes_setoriais_atualizado on public.secoes_setoriais;
create trigger secoes_setoriais_atualizado before update on public.secoes_setoriais for each row execute function public.marcar_atualizacao();
drop trigger if exists secoes_setoriais_historico on public.secoes_setoriais;
create trigger secoes_setoriais_historico after insert or update or delete on public.secoes_setoriais for each row execute function public.registrar_historico();


-- ---------------------------------------------------------------------
-- 3. PLANOS E RELATÓRIOS (18.1 e 19.1)
-- ---------------------------------------------------------------------
create table if not exists public.documentos_setoriais (
  id               uuid primary key default gen_random_uuid(),
  orgao_id         uuid not null references public.orgaos(id) on delete cascade,
  area             text not null check (area in ('saude', 'educacao', 'assistencia_social')),
  tipo             text not null check (tipo in (
                     'plano_saude', 'programacao_anual', 'relatorio_gestao', 'relatorio_quadrimestral',
                     'plano_educacao', 'relatorio_educacao', 'plano_assistencia', 'relatorio_assistencia', 'outro')),
  titulo           text not null check (char_length(titulo) between 3 and 300),
  exercicio        integer not null check (exercicio between 1990 and 2100),
  exercicio_fim    integer check (exercicio_fim is null or exercicio_fim between 1990 and 2100), -- planos de vários anos
  periodo          text check (periodo is null or char_length(periodo) <= 60),                 -- ex.: 1º quadrimestre
  data_publicacao  date,
  descricao        text check (descricao is null or char_length(descricao) <= 2000),
  arquivo_url      text,
  link_externo     text check (link_externo is null or link_externo ~* '^https?://'),
  situacao         text not null default 'rascunho' check (situacao in ('rascunho', 'publicado')),
  publicado_em     timestamptz,
  busca            text generated always as (public.normalizar_texto(titulo || ' ' || coalesce(descricao, '') || ' ' || coalesce(periodo, ''))) stored,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  constraint documentos_setoriais_anos check (exercicio_fim is null or exercicio_fim >= exercicio),
  constraint documentos_setoriais_arquivo check (coalesce(situacao = 'rascunho' or arquivo_url is not null or link_externo is not null, false)),
  constraint documentos_setoriais_tipo check (
    tipo = 'outro'
    or (area = 'saude' and tipo in ('plano_saude', 'programacao_anual', 'relatorio_gestao', 'relatorio_quadrimestral'))
    or (area = 'educacao' and tipo in ('plano_educacao', 'relatorio_educacao'))
    or (area = 'assistencia_social' and tipo in ('plano_assistencia', 'relatorio_assistencia')))
);
create index if not exists documentos_setoriais_lista_idx on public.documentos_setoriais (orgao_id, area, exercicio desc, atualizado_em desc, id desc);

drop trigger if exists documentos_setoriais_publicacao on public.documentos_setoriais;
create trigger documentos_setoriais_publicacao before insert or update on public.documentos_setoriais
  for each row execute function public.controlar_publicacao_setorial();
drop trigger if exists documentos_setoriais_atualizado on public.documentos_setoriais;
create trigger documentos_setoriais_atualizado before update on public.documentos_setoriais for each row execute function public.marcar_atualizacao();
drop trigger if exists documentos_setoriais_historico on public.documentos_setoriais;
create trigger documentos_setoriais_historico after insert or update or delete on public.documentos_setoriais for each row execute function public.registrar_historico();


-- ---------------------------------------------------------------------
-- 4. SAÚDE
-- ---------------------------------------------------------------------
-- 18.2: onde, quando e quem atende.
create table if not exists public.saude_estabelecimentos (
  id              uuid primary key default gen_random_uuid(),
  orgao_id        uuid not null references public.orgaos(id) on delete cascade,
  nome            text not null check (char_length(nome) between 3 and 200),
  tipo            text not null default 'ubs' check (tipo in (
                    'ubs', 'hospital', 'upa', 'caps', 'policlinica', 'centro_especialidades', 'laboratorio',
                    'farmacia', 'vigilancia', 'academia_saude', 'samu', 'outro')),
  cnes            text check (cnes is null or cnes ~ '^\d{7}$'),
  endereco        text check (endereco is null or char_length(endereco) <= 300),
  bairro          text check (bairro is null or char_length(bairro) <= 100),
  telefone        text check (telefone is null or char_length(telefone) <= 60),
  email           text check (email is null or char_length(email) <= 150),
  horario         text check (horario is null or char_length(horario) <= 300),        -- ex.: seg. a sex., 7h às 17h
  especialidades  text check (especialidades is null or char_length(especialidades) <= 1500),
  servicos        text check (servicos is null or char_length(servicos) <= 3000),
  ordem           integer not null default 0,
  situacao        text not null default 'rascunho' check (situacao in ('rascunho', 'publicado')),
  publicado_em    timestamptz,
  busca           text generated always as (public.normalizar_texto(nome || ' ' || coalesce(bairro, '') || ' ' || coalesce(especialidades, '') || ' ' || coalesce(servicos, ''))) stored,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  -- 18.2 pede local e horário: sem eles, só rascunho.
  constraint saude_estab_publicar check (coalesce(situacao = 'rascunho' or (endereco is not null and horario is not null), false))
);
create index if not exists saude_estab_idx on public.saude_estabelecimentos (orgao_id, ordem, nome);

create table if not exists public.saude_profissionais (
  id                 uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references public.saude_estabelecimentos(id) on delete cascade,
  orgao_id           uuid not null references public.orgaos(id) on delete cascade,
  nome               text not null check (char_length(nome) between 3 and 200),
  especialidade      text not null check (char_length(especialidade) between 2 and 120),  -- função ou especialidade
  registro           text check (registro is null or char_length(registro) <= 40),          -- CRM, COREN, CRO…
  horario            text check (horario is null or char_length(horario) <= 300),
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);
create index if not exists saude_prof_idx on public.saude_profissionais (estabelecimento_id, nome);

drop trigger if exists saude_estab_publicacao on public.saude_estabelecimentos;
create trigger saude_estab_publicacao before insert or update on public.saude_estabelecimentos
  for each row execute function public.controlar_publicacao('saude');

-- Profissional: mesmo órgão; em estabelecimento publicado, só quem publica altera.
create or replace function public.validar_profissional_saude()
returns trigger language plpgsql set search_path = public as $$
declare
  v_id uuid := coalesce(new.estabelecimento_id, old.estabelecimento_id);
  v_orgao uuid := coalesce(new.orgao_id, old.orgao_id);
  v_sit text;
begin
  select e.situacao into v_sit from public.saude_estabelecimentos e where e.id = v_id and e.orgao_id = v_orgao;
  if v_sit is null then
    if tg_op = 'DELETE' then return old; end if;
    raise exception 'O profissional não pertence a um estabelecimento deste órgão.';
  end if;
  if current_user in ('anon', 'authenticated') and v_sit = 'publicado' and not public.tem_permissao(v_orgao, 'saude', 'publicar') then
    raise exception 'Este estabelecimento está publicado. Só quem tem permissão de publicar altera os profissionais dele.';
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists saude_prof_validar on public.saude_profissionais;
create trigger saude_prof_validar before insert or update or delete on public.saude_profissionais
  for each row execute function public.validar_profissional_saude();

-- 18.3: lista de espera da regulação. Identificação pelo protocolo (sem nome do paciente).
create table if not exists public.saude_lista_espera (
  id                   uuid primary key default gen_random_uuid(),
  orgao_id             uuid not null references public.orgaos(id) on delete cascade,
  protocolo            text not null check (char_length(protocolo) between 1 and 40),
  tipo                 text not null default 'consulta' check (tipo in ('consulta', 'exame', 'cirurgia', 'procedimento')),
  procedimento         text not null check (char_length(procedimento) between 2 and 200),
  especialidade        text check (especialidade is null or char_length(especialidade) <= 120),
  unidade_solicitante  text check (unidade_solicitante is null or char_length(unidade_solicitante) <= 150),
  data_solicitacao     date not null,
  prioridade           text not null default 'eletivo' check (prioridade in ('emergencia', 'urgencia', 'prioritario', 'eletivo')),
  situacao_espera      text not null default 'aguardando' check (situacao_espera in ('aguardando', 'agendado', 'realizado', 'cancelado')),
  data_agendamento     date,
  local_atendimento    text check (local_atendimento is null or char_length(local_atendimento) <= 200),
  observacao           text check (observacao is null or char_length(observacao) <= 300),
  busca                text generated always as (public.normalizar_texto(protocolo || ' ' || procedimento || ' ' || coalesce(especialidade, ''))) stored,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now()
);
create index if not exists saude_espera_idx on public.saude_lista_espera (orgao_id, tipo, procedimento, data_solicitacao);

-- 18.4 e 18.5: medicamentos do SUS (como obter) e o estoque de cada farmácia.
create table if not exists public.saude_medicamentos (
  id             uuid primary key default gen_random_uuid(),
  orgao_id       uuid not null references public.orgaos(id) on delete cascade,
  nome           text not null check (char_length(nome) between 2 and 200),
  apresentacao   text check (apresentacao is null or char_length(apresentacao) <= 200),  -- ex.: 500 mg, comprimido
  componente     text not null default 'basico' check (componente in ('basico', 'estrategico', 'especializado', 'hospitalar', 'municipal')),
  onde_obter     text check (onde_obter is null or char_length(onde_obter) <= 300),
  como_obter     text check (como_obter is null or char_length(como_obter) <= 1500),     -- receita, documentos, cadastro
  busca          text generated always as (public.normalizar_texto(nome || ' ' || coalesce(apresentacao, ''))) stored,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
create unique index if not exists saude_medicamentos_uk on public.saude_medicamentos (orgao_id, public.normalizar_texto(nome), public.normalizar_texto(coalesce(apresentacao, '')));

create table if not exists public.saude_estoques (
  id              uuid primary key default gen_random_uuid(),
  medicamento_id  uuid not null references public.saude_medicamentos(id) on delete cascade,
  orgao_id        uuid not null references public.orgaos(id) on delete cascade,
  local           text not null check (char_length(local) between 2 and 150),             -- farmácia / unidade
  quantidade      numeric(14,2) not null check (quantidade >= 0),
  unidade         text check (unidade is null or char_length(unidade) <= 30),             -- comprimido, frasco…
  posicao_em      date not null default current_date,                                       -- data da contagem
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);
create unique index if not exists saude_estoques_uk on public.saude_estoques (medicamento_id, public.normalizar_texto(local));
create index if not exists saude_estoques_orgao_idx on public.saude_estoques (orgao_id, posicao_em);

create or replace function public.validar_estoque_saude()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from public.saude_medicamentos m where m.id = new.medicamento_id and m.orgao_id = new.orgao_id) then
    raise exception 'O medicamento não pertence a este órgão.';
  end if;
  return new;
end;
$$;
drop trigger if exists saude_estoques_validar on public.saude_estoques;
create trigger saude_estoques_validar before insert or update on public.saude_estoques
  for each row execute function public.validar_estoque_saude();


-- ---------------------------------------------------------------------
-- 5. CONSELHOS (18.6 Saúde, 19.3 Fundeb, 19.4 Assistência Social e outros)
-- ---------------------------------------------------------------------
create table if not exists public.conselhos (
  id              uuid primary key default gen_random_uuid(),
  orgao_id        uuid not null references public.orgaos(id) on delete cascade,
  tipo            text not null check (tipo in (
                    'saude', 'fundeb', 'assistencia_social', 'educacao', 'alimentacao_escolar', 'crianca_adolescente', 'outro')),
  nome            text not null check (char_length(nome) between 3 and 200),
  sigla           text check (sigla is null or char_length(sigla) <= 20),
  norma_criacao   text check (norma_criacao is null or char_length(norma_criacao) <= 300),   -- ex.: Lei nº 512/2021
  norma_url       text check (norma_url is null or norma_url ~* '^https?://'),
  regimento_url   text check (regimento_url is null or regimento_url ~* '^https?://'),
  competencias    text check (competencias is null or char_length(competencias) <= 4000),    -- atribuições e funcionamento
  periodicidade   text check (periodicidade is null or char_length(periodicidade) <= 200),   -- ex.: mensal, 1ª terça-feira
  local_reunioes  text check (local_reunioes is null or char_length(local_reunioes) <= 300),
  telefone        text check (telefone is null or char_length(telefone) <= 60),
  email           text check (email is null or char_length(email) <= 150),
  mandato_inicio  date,
  mandato_fim     date,
  situacao        text not null default 'rascunho' check (situacao in ('rascunho', 'publicado')),
  publicado_em    timestamptz,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  constraint conselhos_mandato check (coalesce(mandato_inicio is null or mandato_fim is null or mandato_fim >= mandato_inicio, false))
);
-- Um conselho de cada tipo por órgão ("outro" pode repetir).
create unique index if not exists conselhos_tipo_uk on public.conselhos (orgao_id, tipo) where tipo <> 'outro';

create table if not exists public.conselhos_membros (
  id              uuid primary key default gen_random_uuid(),
  conselho_id     uuid not null references public.conselhos(id) on delete cascade,
  orgao_id        uuid not null references public.orgaos(id) on delete cascade,
  nome            text not null check (char_length(nome) between 3 and 200),
  funcao          text not null default 'conselheiro' check (funcao in ('presidente', 'vice_presidente', 'secretario', 'conselheiro')),
  condicao        text not null default 'titular' check (condicao in ('titular', 'suplente')),
  segmento        text check (segmento is null or char_length(segmento) <= 150),   -- ex.: usuários, trabalhadores, governo
  entidade        text check (entidade is null or char_length(entidade) <= 200),   -- quem o membro representa
  mandato_inicio  date,
  mandato_fim     date,
  ato             text check (ato is null or char_length(ato) <= 200),             -- portaria/decreto de nomeação
  ordem           integer not null default 0,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);
create index if not exists conselhos_membros_idx on public.conselhos_membros (conselho_id, ordem, nome);

create table if not exists public.conselhos_documentos (
  id            uuid primary key default gen_random_uuid(),
  conselho_id   uuid not null references public.conselhos(id) on delete cascade,
  orgao_id      uuid not null references public.orgaos(id) on delete cascade,
  tipo          text not null default 'ata' check (tipo in ('ata', 'pauta', 'resolucao', 'calendario', 'regimento', 'parecer', 'relatorio', 'lei', 'outro')),
  titulo        text not null check (char_length(titulo) between 2 and 200),
  data          date not null default current_date,
  arquivo_url   text,
  link_externo  text check (link_externo is null or link_externo ~* '^https?://'),
  criado_em     timestamptz not null default now(),
  constraint conselhos_documentos_arquivo check (coalesce(arquivo_url is not null or link_externo is not null, false))
);
create index if not exists conselhos_documentos_idx on public.conselhos_documentos (conselho_id, data desc);

drop trigger if exists conselhos_publicacao on public.conselhos;
create trigger conselhos_publicacao before insert or update on public.conselhos
  for each row execute function public.controlar_publicacao_setorial();

-- Membros e documentos: mesmo órgão; em conselho publicado, só quem publica altera.
create or replace function public.validar_filho_conselho()
returns trigger language plpgsql set search_path = public as $$
declare
  v_id uuid := coalesce(new.conselho_id, old.conselho_id);
  v_orgao uuid := coalesce(new.orgao_id, old.orgao_id);
  v_sit text; v_tipo text;
begin
  select c.situacao, c.tipo into v_sit, v_tipo from public.conselhos c where c.id = v_id and c.orgao_id = v_orgao;
  if v_sit is null then
    if tg_op = 'DELETE' then return old; end if;
    raise exception 'O registro não pertence a um conselho deste órgão.';
  end if;
  if current_user in ('anon', 'authenticated') and v_sit = 'publicado' and not public.tem_permissao(v_orgao, public.modulo_setorial(v_tipo), 'publicar') then
    raise exception 'Este conselho está publicado. Só quem tem permissão de publicar altera a composição e os documentos dele.';
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists conselhos_membros_validar on public.conselhos_membros;
create trigger conselhos_membros_validar before insert or update or delete on public.conselhos_membros
  for each row execute function public.validar_filho_conselho();
drop trigger if exists conselhos_documentos_validar on public.conselhos_documentos;
create trigger conselhos_documentos_validar before insert or update or delete on public.conselhos_documentos
  for each row execute function public.validar_filho_conselho();


-- ---------------------------------------------------------------------
-- 6. EDUCAÇÃO: LISTA DE ESPERA DAS CRECHES (19.2)
--    Criança identificada pelo protocolo (e, se quiser, iniciais) — nunca
--    pelo nome completo (ECA e LGPD).
-- ---------------------------------------------------------------------
create table if not exists public.creches_espera (
  id              uuid primary key default gen_random_uuid(),
  orgao_id        uuid not null references public.orgaos(id) on delete cascade,
  protocolo       text not null check (char_length(protocolo) between 1 and 40),
  crianca         text check (crianca is null or char_length(crianca) <= 20),          -- só as iniciais
  turma           text not null check (char_length(turma) between 2 and 60),           -- berçário, maternal I…
  creche          text not null check (char_length(creche) between 2 and 150),         -- unidade pretendida
  data_inscricao  date not null,
  criterio        text check (criterio is null or char_length(criterio) <= 200),      -- critério de prioridade atendido
  pontuacao       numeric(8,2),
  situacao_espera text not null default 'aguardando' check (situacao_espera in ('aguardando', 'convocado', 'matriculado', 'desistente', 'cancelado')),
  observacao      text check (observacao is null or char_length(observacao) <= 300),
  busca           text generated always as (public.normalizar_texto(protocolo || ' ' || creche || ' ' || turma)) stored,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);
create index if not exists creches_espera_idx on public.creches_espera (orgao_id, creche, turma, data_inscricao);


-- ---------------------------------------------------------------------
-- 7. RENÚNCIAS DE RECEITA (16.1 a 16.4)
-- ---------------------------------------------------------------------
create table if not exists public.renuncias (
  id                uuid primary key default gen_random_uuid(),
  orgao_id          uuid not null references public.orgaos(id) on delete cascade,
  especie           text not null default 'isencao' check (especie in (
                      'isencao', 'anistia', 'remissao', 'credito_presumido', 'reducao_aliquota', 'reducao_base', 'subsidio', 'outro')),
  tributo           text not null default 'iptu' check (tributo in ('iptu', 'iss', 'itbi', 'taxas', 'contribuicao_melhoria', 'cosip', 'divida_ativa', 'outro')),
  titulo            text not null check (char_length(titulo) between 3 and 200),
  descricao         text check (descricao is null or char_length(descricao) <= 2000),
  fundamento_legal  text not null check (char_length(fundamento_legal) between 3 and 300),   -- 16.1: lei e artigo
  norma_url         text check (norma_url is null or norma_url ~* '^https?://'),
  requisitos        text check (requisitos is null or char_length(requisitos) <= 3000),       -- quem tem direito
  procedimento      text check (procedimento is null or char_length(procedimento) <= 3000),   -- como pedir
  setor             text check (setor is null or char_length(setor) <= 200),                  -- setor/beneficiários alcançados
  vigencia_inicio   date,
  vigencia_fim      date,
  situacao          text not null default 'rascunho' check (situacao in ('rascunho', 'publicado')),
  publicado_em      timestamptz,
  busca             text generated always as (public.normalizar_texto(titulo || ' ' || coalesce(descricao, '') || ' ' || fundamento_legal || ' ' || coalesce(setor, ''))) stored,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  constraint renuncias_vigencia check (coalesce(vigencia_inicio is null or vigencia_fim is null or vigencia_fim >= vigencia_inicio, false))
);
create index if not exists renuncias_idx on public.renuncias (orgao_id, tributo, titulo);

-- 16.2: previsto (LDO/LOA) × realizado, por exercício, com as medidas de compensação (art. 14 LRF).
create table if not exists public.renuncias_valores (
  id               uuid primary key default gen_random_uuid(),
  renuncia_id      uuid not null references public.renuncias(id) on delete cascade,
  orgao_id         uuid not null references public.orgaos(id) on delete cascade,
  exercicio        integer not null check (exercicio between 1990 and 2100),
  valor_previsto   numeric(16,2) check (valor_previsto is null or valor_previsto >= 0),
  valor_realizado  numeric(16,2) check (valor_realizado is null or valor_realizado >= 0),
  fonte_previsao   text check (fonte_previsao is null or char_length(fonte_previsao) <= 200),   -- ex.: LDO 2026, anexo de metas fiscais
  compensacao      text check (compensacao is null or char_length(compensacao) <= 2000),
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  unique (renuncia_id, exercicio)
);
create index if not exists renuncias_valores_idx on public.renuncias_valores (orgao_id, exercicio desc);

-- 16.3: beneficiários. CPF só aparece mascarado no site (documento_publico).
create table if not exists public.renuncias_beneficiarios (
  id                 uuid primary key default gen_random_uuid(),
  orgao_id           uuid not null references public.orgaos(id) on delete cascade,
  renuncia_id        uuid not null references public.renuncias(id) on delete restrict,
  exercicio          integer not null check (exercicio between 1990 and 2100),
  nome               text not null check (char_length(nome) between 2 and 200),
  documento          text check (documento is null or documento ~ '^(\d{11}|\d{14})$'),
  documento_publico  text generated always as (public.documento_publico(documento)) stored,
  setor              text check (setor is null or char_length(setor) <= 150),
  produto            text check (produto is null or char_length(produto) <= 150),
  valor              numeric(16,2) check (valor is null or valor >= 0),
  -- Busca sem o CPF (o visitante pesquisa por esta coluna); CNPJ entra só com números.
  busca              text generated always as (public.normalizar_texto(nome || ' ' || coalesce(setor, '') || ' ' || coalesce(produto, '') || ' '
                       || case when documento ~ '^\d{14}$' then documento else '' end)) stored,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);
create index if not exists renuncias_benef_idx on public.renuncias_beneficiarios (orgao_id, exercicio desc, nome);

-- 16.4: projetos de incentivo à cultura e ao esporte.
create table if not exists public.incentivos_projetos (
  id                 uuid primary key default gen_random_uuid(),
  orgao_id           uuid not null references public.orgaos(id) on delete cascade,
  exercicio          integer not null check (exercicio between 1990 and 2100),
  area               text not null default 'cultura' check (area in ('cultura', 'esporte')),
  projeto            text not null check (char_length(projeto) between 3 and 300),
  proponente         text not null check (char_length(proponente) between 2 and 200),
  documento          text check (documento is null or documento ~ '^(\d{11}|\d{14})$'),
  documento_publico  text generated always as (public.documento_publico(documento)) stored,
  valor_aprovado     numeric(16,2) not null check (valor_aprovado >= 0),
  valor_liberado     numeric(16,2) check (valor_liberado is null or valor_liberado >= 0),
  lei_incentivo      text check (lei_incentivo is null or char_length(lei_incentivo) <= 300),
  andamento          text not null default 'aprovado' check (andamento in ('aprovado', 'em_execucao', 'concluido', 'cancelado')),
  arquivo_url        text,                                                                  -- ato de aprovação
  link_externo       text check (link_externo is null or link_externo ~* '^https?://'),
  situacao           text not null default 'rascunho' check (situacao in ('rascunho', 'publicado')),
  publicado_em       timestamptz,
  busca              text generated always as (public.normalizar_texto(projeto || ' ' || proponente || ' ' || coalesce(lei_incentivo, '') || ' '
                       || case when documento ~ '^\d{14}$' then documento else '' end)) stored,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);
create index if not exists incentivos_idx on public.incentivos_projetos (orgao_id, exercicio desc, atualizado_em desc, id desc);

drop trigger if exists renuncias_publicacao on public.renuncias;
create trigger renuncias_publicacao before insert or update on public.renuncias
  for each row execute function public.controlar_publicacao('renuncias');
drop trigger if exists incentivos_publicacao on public.incentivos_projetos;
create trigger incentivos_publicacao before insert or update on public.incentivos_projetos
  for each row execute function public.controlar_publicacao('renuncias');

-- Valores e beneficiários: mesmo órgão da renúncia; valores de renúncia publicada só quem publica.
create or replace function public.validar_filho_renuncia()
returns trigger language plpgsql set search_path = public as $$
declare
  v_id uuid := coalesce(new.renuncia_id, old.renuncia_id);
  v_orgao uuid := coalesce(new.orgao_id, old.orgao_id);
  v_sit text;
begin
  select r.situacao into v_sit from public.renuncias r where r.id = v_id and r.orgao_id = v_orgao;
  if v_sit is null then
    if tg_op = 'DELETE' then return old; end if;
    raise exception 'O registro não pertence a uma renúncia deste órgão.';
  end if;
  if tg_table_name = 'renuncias_valores' and current_user in ('anon', 'authenticated') and v_sit = 'publicado'
     and not public.tem_permissao(v_orgao, 'renuncias', 'publicar') then
    raise exception 'Esta renúncia está publicada. Só quem tem permissão de publicar altera os valores dela.';
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists renuncias_valores_validar on public.renuncias_valores;
create trigger renuncias_valores_validar before insert or update or delete on public.renuncias_valores
  for each row execute function public.validar_filho_renuncia();
drop trigger if exists renuncias_benef_validar on public.renuncias_beneficiarios;
create trigger renuncias_benef_validar before insert or update on public.renuncias_beneficiarios
  for each row execute function public.validar_filho_renuncia();


-- ---------------------------------------------------------------------
-- GATILHOS PADRÃO, REGRAS DE ACESSO (RLS) E PERMISSÕES DE LEITURA
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  -- [tabela, expressão do módulo, tem rascunho?, histórico em lote?]
  defs text[][] := array[
    ['documentos_setoriais', 'public.modulo_setorial(area)', 's', 'n'],
    ['saude_estabelecimentos', '''saude''', 's', 'n'],
    ['saude_profissionais', '''saude''', 'n', 'n'],
    ['saude_lista_espera', '''saude''', 'n', 's'],
    ['saude_medicamentos', '''saude''', 'n', 's'],
    ['saude_estoques', '''saude''', 'n', 's'],
    ['conselhos', 'public.modulo_setorial(tipo)', 's', 'n'],
    ['conselhos_membros', 'public.modulo_setorial((select c.tipo from public.conselhos c where c.id = conselho_id))', 'n', 'n'],
    ['conselhos_documentos', 'public.modulo_setorial((select c.tipo from public.conselhos c where c.id = conselho_id))', 'n', 'n'],
    ['creches_espera', '''educacao''', 'n', 's'],
    ['renuncias', '''renuncias''', 's', 'n'],
    ['renuncias_valores', '''renuncias''', 'n', 'n'],
    ['renuncias_beneficiarios', '''renuncias''', 'n', 's'],
    ['incentivos_projetos', '''renuncias''', 's', 'n'],
    ['secoes_setoriais', 'public.modulo_setorial(secao)', 'n', 'n']];
  d text[];
  leitura text;
begin
  foreach d slice 1 in array defs loop
    t := d[1];
    execute format('alter table public.%I enable row level security', t);
    if t not in ('secoes_setoriais', 'documentos_setoriais', 'conselhos_documentos') then
      execute format('drop trigger if exists %1$s_atualizado on public.%1$I', t);
      execute format('create trigger %1$s_atualizado before update on public.%1$I for each row execute function public.marcar_atualizacao()', t);
    end if;
    if t not in ('secoes_setoriais', 'documentos_setoriais') then
      execute format('drop trigger if exists %1$s_historico on public.%1$I', t);
      execute format('create trigger %1$s_historico after insert or update or delete on public.%1$I for each row execute function public.%2$s()',
        t, case d[4] when 's' then 'registrar_historico_lista' else 'registrar_historico' end);
    end if;
    -- Leitura: o que tem rascunho, só publicado (ou membro); filhos seguem o pai publicado.
    leitura := case
      when d[3] = 's' then 'situacao = ''publicado'' or public.e_membro(orgao_id)'
      when t = 'saude_profissionais' then 'public.e_membro(orgao_id) or exists (select 1 from public.saude_estabelecimentos e where e.id = estabelecimento_id and e.situacao = ''publicado'')'
      when t in ('conselhos_membros', 'conselhos_documentos') then 'public.e_membro(orgao_id) or exists (select 1 from public.conselhos c where c.id = conselho_id and c.situacao = ''publicado'')'
      when t = 'renuncias_valores' then 'public.e_membro(orgao_id) or exists (select 1 from public.renuncias r where r.id = renuncia_id and r.situacao = ''publicado'')'
      else 'true' end;
    execute format('drop policy if exists "%1$s: leitura" on public.%1$I', t);
    execute format('create policy "%1$s: leitura" on public.%1$I for select to anon, authenticated using (%2$s)', t, leitura);
    execute format('drop policy if exists "%1$s: inclusão" on public.%1$I', t);
    execute format('create policy "%1$s: inclusão" on public.%1$I for insert to authenticated with check (public.tem_permissao(orgao_id, %2$s, ''editar'') and public.no_alcance(orgao_id, null))', t, d[2]);
    execute format('drop policy if exists "%1$s: edição" on public.%1$I', t);
    execute format('create policy "%1$s: edição" on public.%1$I for update to authenticated using (public.tem_permissao(orgao_id, %2$s, ''editar'') and public.no_alcance(orgao_id, null)) with check (public.tem_permissao(orgao_id, %2$s, ''editar'') and public.no_alcance(orgao_id, null))', t, d[2]);
    execute format('drop policy if exists "%1$s: exclusão" on public.%1$I', t);
    -- Linhas de listas e filhos (membros, documentos, valores, profissionais, estoque) saem com "editar";
    -- os cadastros principais exigem "excluir".
    execute format('create policy "%1$s: exclusão" on public.%1$I for delete to authenticated using (public.tem_permissao(orgao_id, %2$s, %3$L) and public.no_alcance(orgao_id, null))',
      t, d[2], case when t in ('documentos_setoriais', 'saude_estabelecimentos', 'conselhos', 'renuncias', 'incentivos_projetos', 'saude_medicamentos') then 'excluir' else 'editar' end);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    if t not in ('renuncias_beneficiarios', 'incentivos_projetos') then
      execute format('grant select on public.%I to anon', t);
    end if;
  end loop;
end;
$$;

-- Visitante não lê o CPF/CNPJ "cru": só documento_publico (CPF mascarado).
revoke select on public.renuncias_beneficiarios, public.incentivos_projetos from anon;
grant select (id, orgao_id, renuncia_id, exercicio, nome, documento_publico, setor, produto, valor, busca, criado_em, atualizado_em)
  on public.renuncias_beneficiarios to anon;
grant select (id, orgao_id, exercicio, area, projeto, proponente, documento_publico, valor_aprovado, valor_liberado, lei_incentivo, andamento,
  arquivo_url, link_externo, situacao, publicado_em, busca, criado_em, atualizado_em)
  on public.incentivos_projetos to anon;

-- Unidade/exclusão protegida: renúncia com beneficiários não sai (on delete restrict) — mensagem clara.
create or replace function public.proteger_renuncia()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists (select 1 from public.renuncias_beneficiarios b where b.renuncia_id = old.id) then
    raise exception 'Esta renúncia tem beneficiários cadastrados (16.3): exclua ou troque os beneficiários antes.';
  end if;
  return old;
end;
$$;
drop trigger if exists renuncias_proteger on public.renuncias;
create trigger renuncias_proteger before delete on public.renuncias for each row execute function public.proteger_renuncia();


-- ---------------------------------------------------------------------
-- POSIÇÃO NAS LISTAS DE ESPERA (ordem de atendimento)
--   Regulação: por tipo + procedimento, prioridade (emergência primeiro) e
--   data da solicitação. Creches: por creche + turma, pontuação (maior
--   primeiro) e data de inscrição. security_invoker: valem as regras de
--   leitura da tabela.
-- ---------------------------------------------------------------------
create or replace view public.saude_lista_espera_posicoes with (security_invoker = true) as
select l.*, case when l.situacao_espera = 'aguardando' then row_number() over (
    partition by l.orgao_id, l.tipo, public.normalizar_texto(l.procedimento), (l.situacao_espera = 'aguardando')
    order by array_position(array['emergencia', 'urgencia', 'prioritario', 'eletivo'], l.prioridade), l.data_solicitacao, l.protocolo) end as posicao
from public.saude_lista_espera l;

create or replace view public.creches_espera_posicoes with (security_invoker = true) as
select c.*, case when c.situacao_espera = 'aguardando' then row_number() over (
    partition by c.orgao_id, public.normalizar_texto(c.creche), public.normalizar_texto(c.turma), (c.situacao_espera = 'aguardando')
    order by c.pontuacao desc nulls last, c.data_inscricao, c.protocolo) end as posicao
from public.creches_espera c;

grant select on public.saude_lista_espera_posicoes, public.creches_espera_posicoes to anon, authenticated;


-- ---------------------------------------------------------------------
-- ANOS / EXERCÍCIOS COM DADOS (abas de ano do site e do painel)
-- ---------------------------------------------------------------------
create or replace function public.anos_setoriais(p_orgao uuid, p_tabela text, p_area text default null)
returns table (ano integer, total bigint)
language plpgsql stable security invoker set search_path = public as $$
begin
  if p_tabela = 'documentos_setoriais' then
    return query select d.exercicio, count(*) from public.documentos_setoriais d
      where d.orgao_id = p_orgao and (p_area is null or d.area = p_area) group by 1 order by 1 desc;
  elsif p_tabela = 'renuncias_valores' then
    return query select v.exercicio, count(*) from public.renuncias_valores v where v.orgao_id = p_orgao group by 1 order by 1 desc;
  elsif p_tabela = 'renuncias_beneficiarios' then
    return query select b.exercicio, count(*) from public.renuncias_beneficiarios b where b.orgao_id = p_orgao group by 1 order by 1 desc;
  elsif p_tabela = 'incentivos_projetos' then
    return query select i.exercicio, count(*) from public.incentivos_projetos i
      where i.orgao_id = p_orgao and (p_area is null or i.area = p_area) group by 1 order by 1 desc;
  else
    raise exception 'Tabela não prevista: %', p_tabela;
  end if;
end;
$$;
grant execute on function public.anos_setoriais(uuid, text, text) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 8. IMPORTAÇÃO DAS LISTAS GRANDES
--   p_linhas: [{coluna: valor, …}] só com as colunas previstas abaixo.
--   p_substituir: apaga a lista atual antes (no caso dos beneficiários, só
--   o exercício p_exercicio). As regras de acesso (RLS) e as verificações
--   das tabelas valem normalmente: quem não pode editar não importa.
--   Fica UMA linha no histórico por importação.
-- ---------------------------------------------------------------------
create or replace function public.registrar_importacao(p_orgao uuid, p_tabela text, p_qtd integer, p_substituiu boolean, p_exercicio integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.tem_permissao(p_orgao, public.modulo_setorial(case p_tabela when 'creches_espera' then 'educacao' when 'renuncias_beneficiarios' then 'renuncias' else 'saude' end), 'editar') then
    raise exception 'Seu perfil não pode importar esta lista.';
  end if;
  insert into public.historico (orgao_id, usuario_id, tabela, registro_id, acao, dados_antes, dados_depois)
  values (p_orgao, auth.uid(), p_tabela, null, 'inserir',
    null, jsonb_build_object('importacao', true, 'linhas', p_qtd, 'substituiu_lista', p_substituiu, 'exercicio', p_exercicio));
end;
$$;
revoke all on function public.registrar_importacao(uuid, text, integer, boolean, integer) from public, anon;

create or replace function public.importar_lista(p_orgao uuid, p_tabela text, p_linhas jsonb, p_substituir boolean default true, p_exercicio integer default null)
returns integer language plpgsql security invoker set search_path = public as $$
declare
  permitidas text[];
  cols text[];
  defs text;
  vals text;
  n integer;
begin
  permitidas := case p_tabela
    when 'saude_lista_espera' then array['protocolo', 'tipo', 'procedimento', 'especialidade', 'unidade_solicitante', 'data_solicitacao', 'prioridade',
                                         'situacao_espera', 'data_agendamento', 'local_atendimento', 'observacao']
    when 'saude_estoques' then array['medicamento_id', 'local', 'quantidade', 'unidade', 'posicao_em']
    when 'creches_espera' then array['protocolo', 'crianca', 'turma', 'creche', 'data_inscricao', 'criterio', 'pontuacao', 'situacao_espera', 'observacao']
    when 'renuncias_beneficiarios' then array['renuncia_id', 'exercicio', 'nome', 'documento', 'setor', 'produto', 'valor']
    else null end;
  if permitidas is null then raise exception 'Lista não prevista para importação: %', p_tabela; end if;
  if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) > 5000 then
    raise exception 'Envie de 1 a 5.000 linhas por vez.';
  end if;
  if p_tabela = 'renuncias_beneficiarios' and p_substituir and p_exercicio is null then
    raise exception 'Informe o exercício a substituir.';
  end if;
  if not public.e_membro(p_orgao) then raise exception 'Seu perfil não pode importar esta lista.'; end if;

  perform set_config('pntp.importando', '1', true);
  if p_substituir then
    if p_tabela = 'renuncias_beneficiarios' then
      delete from public.renuncias_beneficiarios where orgao_id = p_orgao and exercicio = p_exercicio;
    else
      execute format('delete from public.%I where orgao_id = $1', p_tabela) using p_orgao;
    end if;
  end if;

  if jsonb_array_length(p_linhas) > 0 then
    -- Só as colunas previstas que vieram em alguma linha; os tipos vêm da própria tabela e a
    -- coluna em branco numa linha recebe o valor padrão da tabela (ex.: prioridade "eletivo").
    select array_agg(a.attname order by a.attnum),
           string_agg(quote_ident(a.attname) || ' ' || format_type(a.atttypid, a.atttypmod), ', ' order by a.attnum),
           string_agg(case when d.adbin is null then 'x.' || quote_ident(a.attname)
                           else 'coalesce(x.' || quote_ident(a.attname) || ', ' || pg_get_expr(d.adbin, d.adrelid) || ')' end, ', ' order by a.attnum)
      into cols, defs, vals
    from pg_attribute a
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where a.attrelid = ('public.' || p_tabela)::regclass and a.attnum > 0 and not a.attisdropped
      and a.attname = any (permitidas)
      and exists (select 1 from jsonb_array_elements(p_linhas) e where e ? a.attname);
    if cols is null then raise exception 'Nenhuma coluna reconhecida nas linhas enviadas.'; end if;
    execute format('insert into public.%I (orgao_id, %s) select $1, %s from jsonb_to_recordset($2) as x(%s)',
      p_tabela, (select string_agg(quote_ident(c), ', ') from unnest(cols) c), vals, defs)
      using p_orgao, p_linhas;
    get diagnostics n = row_count;
  else
    n := 0;
  end if;
  perform set_config('pntp.importando', '', true);
  perform public.registrar_importacao(p_orgao, p_tabela, n, p_substituir, p_exercicio);
  return n;
end;
$$;
revoke all on function public.importar_lista(uuid, text, jsonb, boolean, integer) from public, anon;
grant execute on function public.importar_lista(uuid, text, jsonb, boolean, integer) to authenticated;
grant execute on function public.registrar_importacao(uuid, text, integer, boolean, integer) to authenticated;


-- ---------------------------------------------------------------------
-- 9. AVISOS DE DADOS DESATUALIZADOS (script 20 + os novos módulos)
--    Parte com link externo (Destinos das páginas) ou declarada "não há" não gera aviso.
-- ---------------------------------------------------------------------
create or replace function public.pendencias_atualizacao(p_orgao uuid)
returns table (modulo text, nivel text, mensagem text, quantidade bigint)
language plpgsql stable security invoker set search_path = public as $$
declare
  hoje date := current_date;
  v_ano int := extract(year from current_date)::int;
  fora text[];   -- seções atendidas por link externo ou com declaração de inexistência
  exec boolean;
begin
  if not public.e_membro(p_orgao) then return; end if;
  select coalesce(array_agg(x), '{}') into fora from (
    select s.secao as x from public.secoes_setoriais s where s.orgao_id = p_orgao and s.sem_ocorrencia
    union
    select k from public.orgaos o, jsonb_each_text(coalesce(o.configuracoes -> 'destinos', '{}'::jsonb)) as d(k, v)
    where o.id = p_orgao and coalesce(d.v, '') <> '') t;
  -- Página inteira mandada para fora (destino "saude", "educacao" ou "renuncias"): vale para todas as partes.
  if 'saude' = any (fora) then fora := fora || array['saude_documentos', 'saude_servicos', 'saude_espera', 'saude_medicamentos', 'saude_estoque', 'saude_conselho']; end if;
  if 'educacao' = any (fora) then fora := fora || array['educacao_documentos', 'educacao_creches', 'educacao_fundeb', 'educacao_assistencia']; end if;
  if 'renuncias' = any (fora) then fora := fora || array['renuncias_desoneracoes', 'renuncias_valores', 'renuncias_beneficiarios', 'renuncias_incentivos']; end if;
  select o.tipo = 'prefeitura' into exec from public.orgaos o where o.id = p_orgao;

  return query
  select 'obras', 'alerta', 'obra(s) em andamento sem medição há mais de 30 dias (PNTP 10.1 pede dados de até 30 dias): atualize o % concluído e as medições.', count(*)
  from public.obras o
  where o.orgao_id = p_orgao and o.situacao_obra = 'em_andamento'
    and coalesce((select max(coalesce(m.periodo_fim, m.data_pagamento, m.criado_em::date)) from public.obras_medicoes m where m.obra_id = o.id),
                 o.data_inicio, o.criado_em::date) < hoje - 30
  having count(*) > 0;

  return query
  select 'obras', 'alerta', 'obra(s) com previsão de conclusão vencida e ainda não concluídas: atualize a situação ou a previsão.', count(*)
  from public.obras o
  where o.orgao_id = p_orgao and o.situacao_obra in ('em_andamento', 'nao_iniciada') and o.previsao_conclusao < hoje
  having count(*) > 0;

  return query
  select 'convenios', 'alerta', 'convênio(s) em execução com o valor repassado sem conferência há mais de 30 dias.', count(*)
  from public.convenios c
  where c.orgao_id = p_orgao and c.tipo <> 'sem_repasse' and c.andamento = 'em_execucao'
    and coalesce(c.repasse_atualizado_em, c.data_assinatura, c.criado_em::date) < hoje - 30
  having count(*) > 0;

  return query
  select 'convenios', 'alerta', 'convênio(s) com a vigência encerrada ainda marcados como "em execução": atualize o andamento (prestação de contas, concluído…).', count(*)
  from public.convenios c
  where c.orgao_id = p_orgao and c.andamento = 'em_execucao' and c.vigencia_fim < hoje
  having count(*) > 0;

  return query
  select 'emendas', 'alerta', 'emenda(s) em execução com empenhado/liquidado/pago sem atualização há mais de 30 dias (PNTP 17.3).', count(*)
  from public.emendas e
  where e.orgao_id = p_orgao and e.andamento = 'em_execucao' and coalesce(e.execucao_em, e.criado_em::date) < hoje - 30
  having count(*) > 0;

  return query
  select 'licitacoes', 'alerta', 'processo(s) com a data de abertura já passada e ainda marcados como "aberta" ou "prevista": atualize o andamento.', count(*)
  from public.licitacoes l
  where l.orgao_id = p_orgao and l.andamento in ('aberta', 'prevista') and l.data_abertura::date < hoje - 1
  having count(*) > 0;

  return query
  select 'contratos', 'info', 'contrato(s) com a vigência encerrada há menos de 30 dias: se houve prorrogação, cadastre o termo aditivo.', count(*)
  from public.contratos c
  where c.orgao_id = p_orgao and c.rescindido_em is null and c.vigencia_fim_atual between hoje - 30 and hoje - 1
  having count(*) > 0;

  return query
  select 'contratos', 'alerta', 'contrato(s) vigente(s) sem fiscal vigente cadastrado (PNTP 9.3).', count(*)
  from public.contratos c
  where c.orgao_id = p_orgao and c.rescindido_em is null and coalesce(c.vigencia_fim_atual, hoje) >= hoje
    and coalesce(c.vigencia_inicio, hoje) <= hoje
    and not exists (select 1 from public.contratos_fiscais f where f.contrato_id = c.id and coalesce(f.fim, hoje) >= hoje)
  having count(*) > 0;

  return query
  select 'pca', 'alerta', 'falta o Plano de Contratações Anual de ' || v_ano || ' (PNTP 8.6).', 1::bigint
  where not exists (select 1 from public.pca p where p.orgao_id = p_orgao and p.ano = v_ano and p.tipo = 'plano');

  return query
  select 'concursos', 'alerta', 'seleção(ões) com as inscrições encerradas ainda marcadas como "inscrições abertas": atualize o andamento e publique os atos seguintes (PNTP 6.7).', count(*)
  from public.concursos c
  where c.orgao_id = p_orgao and c.andamento = 'inscricoes_abertas' and c.inscricoes_fim < hoje
  having count(*) > 0;

  return query
  select 'noticias', 'info', 'nenhuma notícia publicada nos últimos 30 dias.', 1::bigint
  where not exists (select 1 from public.noticias n where n.orgao_id = p_orgao and n.publicado_em >= now() - interval '30 days' and n.publicado_em <= now());

  -- Saúde, educação e renúncias: matriz do Poder Executivo.
  if not coalesce(exec, false) then return; end if;

  return query
  select 'saude', 'alerta', 'falta publicar a Programação Anual de Saúde de ' || v_ano || ' (PNTP 18.1).', 1::bigint
  where not ('saude_documentos' = any (fora)) and not exists (select 1 from public.documentos_setoriais d
    where d.orgao_id = p_orgao and d.tipo = 'programacao_anual' and d.situacao = 'publicado' and v_ano between d.exercicio and coalesce(d.exercicio_fim, d.exercicio));

  return query
  select 'saude', 'alerta', 'falta publicar o Plano Municipal de Saúde vigente (' || v_ano || ', PNTP 18.1).', 1::bigint
  where not ('saude_documentos' = any (fora)) and not exists (select 1 from public.documentos_setoriais d
    where d.orgao_id = p_orgao and d.tipo = 'plano_saude' and d.situacao = 'publicado' and v_ano between d.exercicio and coalesce(d.exercicio_fim, d.exercicio + 3));

  -- O Relatório Anual de Gestão do ano anterior vai ao conselho até 30 de março.
  return query
  select 'saude', 'alerta', 'falta publicar o Relatório Anual de Gestão de ' || (v_ano - 1) || ' (PNTP 18.1; prazo de envio ao conselho: 30 de março).', 1::bigint
  where hoje > make_date(v_ano, 3, 31) and not ('saude_documentos' = any (fora)) and not exists (select 1 from public.documentos_setoriais d
    where d.orgao_id = p_orgao and d.tipo = 'relatorio_gestao' and d.situacao = 'publicado' and d.exercicio = v_ano - 1);

  return query
  select 'saude', 'alerta', 'nenhum estabelecimento de saúde publicado com local, horário e profissionais (PNTP 18.2).', 1::bigint
  where not ('saude_servicos' = any (fora)) and not exists (select 1 from public.saude_estabelecimentos e where e.orgao_id = p_orgao and e.situacao = 'publicado');

  return query
  select 'saude', 'alerta', 'a lista de espera da regulação não é atualizada há mais de 30 dias (PNTP 18.3).', 1::bigint
  where not ('saude_espera' = any (fora))
    and coalesce((select max(l.atualizado_em) from public.saude_lista_espera l where l.orgao_id = p_orgao), '-infinity') < now() - interval '30 days';

  return query
  select 'saude', 'alerta', 'nenhum medicamento cadastrado na relação do SUS (PNTP 18.4).', 1::bigint
  where not ('saude_medicamentos' = any (fora)) and not exists (select 1 from public.saude_medicamentos m where m.orgao_id = p_orgao);

  return query
  select 'saude', 'alerta', 'o estoque das farmácias tem posição com mais de 30 dias (PNTP 18.5): importe a contagem atual.', 1::bigint
  where not ('saude_estoque' = any (fora))
    and coalesce((select max(s.posicao_em) from public.saude_estoques s where s.orgao_id = p_orgao), '-infinity'::date) < hoje - 30;

  return query
  select public.modulo_setorial(t.tipo), 'alerta', t.texto, 1::bigint
  from (values ('saude', 'saude_conselho', 'Conselho Municipal de Saúde (PNTP 18.6)'),
               ('fundeb', 'educacao_fundeb', 'Conselho do Fundeb (PNTP 19.3)'),
               ('assistencia_social', 'educacao_assistencia', 'Conselho de Assistência Social (PNTP 19.4)')) as v(tipo, secao, nome)
  cross join lateral (select v.tipo,
      case when c.id is null then 'falta publicar o ' || v.nome || ': composição e funcionamento.'
           when c.mandato_fim < hoje then 'o mandato do ' || v.nome || ' venceu em ' || to_char(c.mandato_fim, 'DD/MM/YYYY') || ': atualize a composição.'
           when not exists (select 1 from public.conselhos_documentos x where x.conselho_id = c.id and x.tipo = 'ata' and x.data >= hoje - 90)
             then 'o ' || v.nome || ' não tem ata publicada nos últimos 90 dias.' end as texto
    from (select 1) um left join public.conselhos c on c.orgao_id = p_orgao and c.tipo = v.tipo and c.situacao = 'publicado') t
  where not (v.secao = any (fora)) and t.texto is not null;

  return query
  select 'educacao', 'alerta', 'falta publicar o Plano Municipal de Educação vigente (PNTP 19.1).', 1::bigint
  where not ('educacao_documentos' = any (fora)) and not exists (select 1 from public.documentos_setoriais d
    where d.orgao_id = p_orgao and d.tipo = 'plano_educacao' and d.situacao = 'publicado' and v_ano between d.exercicio and coalesce(d.exercicio_fim, d.exercicio + 9));

  return query
  select 'educacao', 'alerta', 'a lista de espera das creches não é atualizada há mais de 30 dias (PNTP 19.2).', 1::bigint
  where not ('educacao_creches' = any (fora))
    and coalesce((select max(c.atualizado_em) from public.creches_espera c where c.orgao_id = p_orgao), '-infinity') < now() - interval '30 days';

  return query
  select 'educacao', 'alerta', 'faltam os critérios de prioridade de acesso às creches (PNTP 19.2).', 1::bigint
  where not ('educacao_creches' = any (fora)) and not exists (select 1 from public.secoes_setoriais s
    where s.orgao_id = p_orgao and s.secao = 'educacao_creches' and coalesce(char_length(s.texto), 0) >= 20);

  return query
  select 'renuncias', 'alerta', 'nenhuma desoneração tributária publicada (PNTP 16.1). Se o município não concede, declare "não há" na aba Desonerações.', 1::bigint
  where not ('renuncias_desoneracoes' = any (fora)) and not exists (select 1 from public.renuncias r where r.orgao_id = p_orgao and r.situacao = 'publicado');

  return query
  select 'renuncias', 'alerta', 'renúncia(s) publicada(s) sem o valor realizado de ' || (v_ano - 1) || ' (PNTP 16.2).', count(*)
  from public.renuncias r
  where r.orgao_id = p_orgao and r.situacao = 'publicado' and not ('renuncias_valores' = any (fora))
    and coalesce(r.vigencia_inicio, make_date(v_ano - 1, 1, 1)) <= make_date(v_ano - 1, 12, 31)
    and coalesce(r.vigencia_fim, hoje) >= make_date(v_ano - 1, 1, 1)
    and not exists (select 1 from public.renuncias_valores v where v.renuncia_id = r.id and v.exercicio = v_ano - 1 and v.valor_realizado is not null)
  having count(*) > 0;

  return query
  select 'renuncias', 'info', 'nenhum projeto de incentivo à cultura ou ao esporte publicado (PNTP 16.4). Se não houve, declare "não há" na aba Incentivos.', 1::bigint
  where not ('renuncias_incentivos' = any (fora)) and not exists (select 1 from public.incentivos_projetos i where i.orgao_id = p_orgao and i.situacao = 'publicado');

  -- Gancho do script 22 (receitas, despesas, ordem cronológica, pessoal e diárias):
  -- chamado só se a função já existir, para este script continuar rodando sozinho.
  if to_regprocedure('public.pendencias_financeiras(uuid)') is not null then
    return query execute 'select * from public.pendencias_financeiras($1)' using p_orgao;
  end if;
end;
$$;
grant execute on function public.pendencias_atualizacao(uuid) to authenticated;
