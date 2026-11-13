-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 12 — Lote 7 (Fase 2): Licitações
--   PNTP 8.1 a 8.5: licitações (todas as modalidades), dispensas,
--   inexigibilidades e adesões a atas de registro de preços, com edital
--   e documentos de todas as fases.
--
-- Cada processo pode vir de três fontes, à escolha do órgão:
--   portal → cadastrado no painel, com os arquivos enviados aqui;
--   link   → cadastrado no painel só com os dados básicos e o link do
--            processo no sistema de outra empresa;
--   pncp   → importado do Portal Nacional de Contratações Públicas
--            (dados e links dos arquivos vêm de lá; reimportar atualiza).
--
-- Como usar: Supabase › SQL Editor › New query › colar tudo › Run.
-- Pode ser executado mais de uma vez. Rodar DEPOIS dos scripts 01 a 11.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. PROCESSOS
-- ---------------------------------------------------------------------
create table if not exists public.licitacoes (
  id               uuid primary key default gen_random_uuid(),
  orgao_id         uuid not null references public.orgaos(id) on delete cascade,
  origem           text not null default 'portal' check (origem in ('portal', 'link', 'pncp')),
  -- Modalidades da Lei 14.133 (as mesmas do PNCP) + chamada pública (PNAE) e adesão a ata.
  modalidade       text not null check (modalidade in (
                     'pregao_eletronico', 'pregao_presencial', 'concorrencia_eletronica', 'concorrencia_presencial',
                     'concurso', 'leilao_eletronico', 'leilao_presencial', 'dialogo_competitivo',
                     'credenciamento', 'pre_qualificacao', 'manifestacao_interesse', 'chamada_publica',
                     'dispensa', 'inexigibilidade', 'adesao_ata',
                     'tomada_precos', 'convite', 'outra')),   -- tomada de preços e convite: processos antigos (Lei 8.666)
  numero           text,                 -- ex.: 012/2026
  ano              integer not null check (ano between 1990 and 2100),
  processo         text,                 -- número do processo administrativo
  objeto           text not null check (char_length(objeto) between 5 and 4000),
  srp              boolean not null default false,       -- registro de preços
  criterio         text,                 -- critério de julgamento (menor preço, técnica e preço…)
  amparo_legal     text,                 -- ex.: Lei 14.133/2021, art. 75, II (dispensas)
  unidade_nome     text,                 -- secretaria/unidade requisitante (texto livre)
  valor_estimado   numeric(16, 2) check (valor_estimado is null or valor_estimado >= 0),
  valor_homologado numeric(16, 2) check (valor_homologado is null or valor_homologado >= 0),
  data_publicacao  date not null default current_date,
  data_abertura    timestamptz,          -- sessão pública / abertura das propostas
  -- Andamento do processo (diferente de "situacao", que é rascunho/publicado no portal).
  andamento        text not null default 'em_andamento' check (andamento in (
                     'prevista', 'aberta', 'em_andamento', 'suspensa', 'homologada', 'deserta',
                     'fracassada', 'revogada', 'anulada', 'encerrada')),
  vencedores       text,                 -- resultado resumido (empresa e valor), quando houver
  link_externo     text check (link_externo is null or link_externo ~* '^https?://'),
  -- PNCP: identificação para reimportar sem duplicar.
  pncp_controle    text,                 -- numeroControlePNCP (ex.: 08153454000104-1-000012/2026)
  pncp_atualizado  timestamptz,          -- dataAtualizacao do PNCP na última importação
  situacao         text not null default 'rascunho' check (situacao in ('rascunho', 'publicado')),
  publicado_em     timestamptz,
  busca            text generated always as (public.normalizar_texto(
                     modalidade || ' ' || coalesce(numero, '') || ' ' || ano || ' ' || coalesce(processo, '') || ' ' ||
                     objeto || ' ' || coalesce(unidade_nome, '') || ' ' || coalesce(vencedores, ''))) stored,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  -- "link" exige o link; o coalesce evita que uma regra com resultado nulo passe (lição do script 10).
  constraint licitacoes_link check (coalesce(origem <> 'link' or link_externo is not null, false)),
  constraint licitacoes_pncp check (coalesce(origem <> 'pncp' or pncp_controle is not null, false))
);

-- Índice único SEM "where": a importação usa upsert (on conflict), que não enxerga índice
-- parcial. Processos sem PNCP têm pncp_controle nulo, e nulos não se repetem no índice.
create unique index if not exists licitacoes_pncp_uk on public.licitacoes (orgao_id, pncp_controle);
-- Lista do site: por grupo de modalidade e ano, em ordem cronológica (data + id para o cursor).
create index if not exists licitacoes_lista_idx on public.licitacoes (orgao_id, ano desc, data_publicacao desc, id desc);
create index if not exists licitacoes_modalidade_idx on public.licitacoes (orgao_id, modalidade, ano desc, data_publicacao desc);

drop trigger if exists licitacoes_publicacao on public.licitacoes;
create trigger licitacoes_publicacao before insert or update on public.licitacoes
  for each row execute function public.controlar_publicacao('licitacoes');
drop trigger if exists licitacoes_atualizado on public.licitacoes;
create trigger licitacoes_atualizado before update on public.licitacoes
  for each row execute function public.marcar_atualizacao();
drop trigger if exists licitacoes_historico on public.licitacoes;
create trigger licitacoes_historico after insert or update or delete on public.licitacoes
  for each row execute function public.registrar_historico();


-- ---------------------------------------------------------------------
-- 2. DOCUMENTOS DE CADA FASE (edital, anexos, esclarecimentos, atas,
--    resultado, homologação…). Arquivo enviado OU link (os do PNCP são
--    sempre link, para não ocupar o armazenamento).
--    Os documentos seguem o processo: apagar o processo apaga a lista
--    (o painel apaga antes os arquivos enviados).
-- ---------------------------------------------------------------------
create table if not exists public.licitacoes_documentos (
  id            uuid primary key default gen_random_uuid(),
  licitacao_id  uuid not null references public.licitacoes(id) on delete cascade,
  orgao_id      uuid not null references public.orgaos(id) on delete cascade,
  tipo          text not null default 'outro' check (tipo in (
                  'aviso', 'edital', 'anexo', 'termo_referencia', 'esclarecimento', 'impugnacao', 'retificacao',
                  'ata', 'resultado', 'recurso', 'adjudicacao', 'homologacao', 'ratificacao', 'contrato', 'outro')),
  titulo        text not null check (char_length(titulo) between 2 and 200),
  data          date not null default current_date,
  arquivo_url   text,
  link_externo  text check (link_externo is null or link_externo ~* '^https?://'),
  origem        text not null default 'portal' check (origem in ('portal', 'pncp')),
  ordem         integer not null default 10,
  criado_em     timestamptz not null default now(),
  constraint licitacoes_documentos_arquivo check (coalesce(arquivo_url is not null or link_externo is not null, false))
);
create index if not exists licitacoes_documentos_idx on public.licitacoes_documentos (licitacao_id, data, ordem);

-- Regras do documento:
--   · precisa ser do mesmo órgão do processo (evita misturar órgãos);
--   · mexer nos documentos de um processo JÁ PUBLICADO exige permissão de
--     publicar, igual a alterar o próprio processo (controlar_publicacao).
create or replace function public.validar_documento_licitacao()
returns trigger language plpgsql set search_path = public as $$
declare
  v_doc public.licitacoes_documentos := coalesce(new, old);
  v_situacao text;
begin
  select l.situacao into v_situacao from public.licitacoes l
   where l.id = v_doc.licitacao_id and l.orgao_id = v_doc.orgao_id;
  if v_situacao is null then
    -- Na exclusão em cascata o processo já não existe: nada a validar.
    if tg_op = 'DELETE' then return old; end if;
    raise exception 'O documento não pertence a um processo deste órgão.';
  end if;
  if current_user in ('anon', 'authenticated') and v_situacao = 'publicado'
     and not public.tem_permissao(v_doc.orgao_id, 'licitacoes', 'publicar') then
    raise exception 'Este processo está publicado. Só quem tem permissão de publicar altera os documentos dele.';
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists licitacoes_documentos_validar on public.licitacoes_documentos;
create trigger licitacoes_documentos_validar before insert or update or delete on public.licitacoes_documentos
  for each row execute function public.validar_documento_licitacao();


-- ---------------------------------------------------------------------
-- 3. REGRAS DE ACESSO — processos do órgão todo (sem alcance setorial)
-- ---------------------------------------------------------------------
alter table public.licitacoes enable row level security;
alter table public.licitacoes_documentos enable row level security;

drop policy if exists "licitacoes: leitura" on public.licitacoes;
create policy "licitacoes: leitura" on public.licitacoes for select to anon, authenticated
  using (situacao = 'publicado' or public.e_membro(orgao_id));
drop policy if exists "licitacoes: inclusão" on public.licitacoes;
create policy "licitacoes: inclusão" on public.licitacoes for insert to authenticated
  with check (public.tem_permissao(orgao_id, 'licitacoes', 'editar') and public.no_alcance(orgao_id, null));
drop policy if exists "licitacoes: edição" on public.licitacoes;
create policy "licitacoes: edição" on public.licitacoes for update to authenticated
  using (public.tem_permissao(orgao_id, 'licitacoes', 'editar') and public.no_alcance(orgao_id, null))
  with check (public.tem_permissao(orgao_id, 'licitacoes', 'editar') and public.no_alcance(orgao_id, null));
drop policy if exists "licitacoes: exclusão" on public.licitacoes;
create policy "licitacoes: exclusão" on public.licitacoes for delete to authenticated
  using (public.tem_permissao(orgao_id, 'licitacoes', 'excluir') and public.no_alcance(orgao_id, null));

-- Documentos: o público só vê os de processo publicado.
drop policy if exists "licitacoes_documentos: leitura" on public.licitacoes_documentos;
create policy "licitacoes_documentos: leitura" on public.licitacoes_documentos for select to anon, authenticated
  using (public.e_membro(orgao_id) or exists (
    select 1 from public.licitacoes l where l.id = licitacao_id and l.situacao = 'publicado'));
drop policy if exists "licitacoes_documentos: inclusão" on public.licitacoes_documentos;
create policy "licitacoes_documentos: inclusão" on public.licitacoes_documentos for insert to authenticated
  with check (public.tem_permissao(orgao_id, 'licitacoes', 'editar') and public.no_alcance(orgao_id, null));
drop policy if exists "licitacoes_documentos: edição" on public.licitacoes_documentos;
create policy "licitacoes_documentos: edição" on public.licitacoes_documentos for update to authenticated
  using (public.tem_permissao(orgao_id, 'licitacoes', 'editar') and public.no_alcance(orgao_id, null))
  with check (public.tem_permissao(orgao_id, 'licitacoes', 'editar') and public.no_alcance(orgao_id, null));
-- Apagar documento é editar o processo (trocar um edital errado); apagar o processo exige "excluir".
drop policy if exists "licitacoes_documentos: exclusão" on public.licitacoes_documentos;
create policy "licitacoes_documentos: exclusão" on public.licitacoes_documentos for delete to authenticated
  using (public.tem_permissao(orgao_id, 'licitacoes', 'editar') and public.no_alcance(orgao_id, null));

grant select on public.licitacoes, public.licitacoes_documentos to anon;
grant select, insert, update, delete on public.licitacoes, public.licitacoes_documentos to authenticated;


-- ---------------------------------------------------------------------
-- 4. EXERCÍCIOS COM PROCESSOS (abas de ano do site e do painel)
--    Devolve só os anos distintos, em vez de o navegador baixar a coluna
--    inteira para tirar os repetidos. Respeita as regras de acesso de quem
--    chama (o público só conta processos publicados).
-- ---------------------------------------------------------------------
create or replace function public.licitacoes_anos(p_orgao uuid, p_modalidades text[])
returns table (ano integer, total bigint)
language sql stable security invoker set search_path = public as $$
  select l.ano, count(*) from public.licitacoes l
  where l.orgao_id = p_orgao and l.modalidade = any (p_modalidades)
  group by l.ano order by l.ano desc;
$$;
grant execute on function public.licitacoes_anos(uuid, text[]) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 5. ACESSO DA IMPORTAÇÃO AUTOMÁTICA (função pncp-sincronizar, script 13)
--    O projeto não libera tabelas novas sozinho, nem para o papel de
--    servidor (service_role); sem isto a função dá "permission denied".
-- ---------------------------------------------------------------------
grant usage on schema public to service_role;
grant select, update on public.orgaos to service_role;
grant select, insert, update, delete on public.licitacoes, public.licitacoes_documentos to service_role;
grant insert on public.historico to service_role;
