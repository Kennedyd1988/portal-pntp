-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 10 — Lote 6 (Fase 2): Planejamento e prestação de contas
--   PNTP 11.1 a 11.10: Balanço Geral, Relatório de Gestão, parecer do
--   Tribunal de Contas, julgamento pela Câmara, RGF, RREO, Plano
--   Estratégico, PPA, LDO e LOA — cada um com os seus anexos.
--
-- Como usar: Supabase › SQL Editor › New query › colar tudo › Run.
-- Pode ser executado mais de uma vez. Rodar DEPOIS dos scripts 01 a 09.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. MÓDULO NOVO "Planejamento e prestação de contas"
--    Permissões iniciais iguais às de "Receitas, despesas e planejamento".
-- ---------------------------------------------------------------------
insert into public.modulos (codigo, nome, grupo, ordem) values
  ('contas', 'Planejamento e prestação de contas', 'Transparência', 58)
on conflict (codigo) do nothing;

insert into public.perfil_permissoes (perfil_id, modulo, pode_ver, pode_editar, pode_publicar, pode_excluir)
select perfil_id, 'contas', pode_ver, pode_editar, pode_publicar, pode_excluir
from public.perfil_permissoes where modulo = 'financeiro'
on conflict (perfil_id, modulo) do nothing;


-- ---------------------------------------------------------------------
-- 2. DOCUMENTOS
--    Uma linha por ARQUIVO. Lei e anexos do mesmo instrumento ficam em
--    linhas separadas com o mesmo tipo/exercício/período e "parte"
--    diferente (ex.: "Lei", "Anexo I – Metas fiscais"). O site junta.
--
--    tipo           exercício / período
--    ppa            exercicio = 1º ano, exercicio_fim = 4º ano
--    ldo, loa       exercicio = ano a que se refere
--    rreo           exercicio + periodo 1..6 (bimestre)
--    rgf            exercicio + periodo 1..3 (quadrimestre) ou 1..2 (semestre)
--    balanco        exercicio = ano das contas (Balanço Geral)
--    relatorio_gestao  exercicio = ano do relatório
--    parecer_tce    exercicio das contas + resultado
--    julgamento_camara exercicio das contas + resultado
--    plano_estrategico exercicio .. exercicio_fim
-- ---------------------------------------------------------------------
create table if not exists public.documentos_contas (
  id              uuid primary key default gen_random_uuid(),
  orgao_id        uuid not null references public.orgaos(id) on delete cascade,
  tipo            text not null check (tipo in ('ppa', 'ldo', 'loa', 'rreo', 'rgf', 'balanco', 'relatorio_gestao',
                                                'parecer_tce', 'julgamento_camara', 'plano_estrategico')),
  exercicio       integer not null check (exercicio between 1990 and 2100),
  exercicio_fim   integer check (exercicio_fim is null or exercicio_fim >= exercicio),
  periodicidade   text check (periodicidade in ('bimestral', 'quadrimestral', 'semestral')),
  periodo         smallint check (periodo between 1 and 6),
  parte           text not null default 'Documento completo',
  descricao       text,
  -- Parecer do TCE e julgamento da Câmara: resultado; "pendente" = contas ainda não
  -- apreciadas (o PNTP 11.3 pede que o portal informe quais estão pendentes).
  resultado       text check (resultado in ('aprovadas', 'aprovadas_ressalvas', 'rejeitadas', 'pendente')),
  numero_ato      text,            -- ex.: Parecer Prévio nº 123/2025, Decreto Legislativo nº 2/2025
  data_publicacao date not null default current_date,
  arquivo_url     text,
  link_externo    text check (link_externo is null or link_externo ~* '^https?://'),
  situacao        text not null default 'rascunho' check (situacao in ('rascunho', 'publicado')),
  publicado_em    timestamptz,
  ordem           integer not null default 10,
  busca           text generated always as (public.normalizar_texto(tipo || ' ' || exercicio || ' ' || parte || ' ' || coalesce(descricao, '') || ' ' || coalesce(numero_ato, ''))) stored,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  -- Período obrigatório para RREO (bimestre) e RGF (quadrimestre/semestre).
  -- coalesce(…, false): numa regra CHECK, resultado "nulo" conta como APROVADO; sem
  -- o coalesce, um RREO sem periodicidade passaria (erro achado no teste).
  constraint contas_periodo check (coalesce(
    (tipo = 'rreo' and periodicidade = 'bimestral' and periodo between 1 and 6)
    or (tipo = 'rgf' and ((periodicidade = 'quadrimestral' and periodo between 1 and 3) or (periodicidade = 'semestral' and periodo between 1 and 2)))
    or (tipo not in ('rreo', 'rgf') and periodo is null and periodicidade is null), false)),
  -- Publicado precisa do documento, exceto "contas pendentes de apreciação".
  constraint contas_documento check (coalesce(situacao = 'rascunho' or resultado = 'pendente' or arquivo_url is not null or link_externo is not null, false)),
  constraint contas_resultado check ((tipo in ('parecer_tce', 'julgamento_camara')) or resultado is null)
);
create index if not exists contas_lista_idx on public.documentos_contas (orgao_id, tipo, exercicio desc, periodo, ordem);

-- Gatilhos padrão: rascunho → publicado, data de atualização e histórico.
drop trigger if exists contas_publicacao on public.documentos_contas;
create trigger contas_publicacao before insert or update on public.documentos_contas
  for each row execute function public.controlar_publicacao('contas');
drop trigger if exists documentos_contas_atualizado on public.documentos_contas;
create trigger documentos_contas_atualizado before update on public.documentos_contas
  for each row execute function public.marcar_atualizacao();
drop trigger if exists documentos_contas_historico on public.documentos_contas;
create trigger documentos_contas_historico after insert or update or delete on public.documentos_contas
  for each row execute function public.registrar_historico();


-- ---------------------------------------------------------------------
-- 3. REGRAS DE ACESSO — documento do órgão todo (sem alcance setorial)
-- ---------------------------------------------------------------------
alter table public.documentos_contas enable row level security;

drop policy if exists "documentos_contas: leitura" on public.documentos_contas;
create policy "documentos_contas: leitura" on public.documentos_contas for select to anon, authenticated
  using (situacao = 'publicado' or public.e_membro(orgao_id));

drop policy if exists "documentos_contas: inclusão" on public.documentos_contas;
create policy "documentos_contas: inclusão" on public.documentos_contas for insert to authenticated
  with check (public.tem_permissao(orgao_id, 'contas', 'editar') and public.no_alcance(orgao_id, null));

drop policy if exists "documentos_contas: edição" on public.documentos_contas;
create policy "documentos_contas: edição" on public.documentos_contas for update to authenticated
  using (public.tem_permissao(orgao_id, 'contas', 'editar') and public.no_alcance(orgao_id, null))
  with check (public.tem_permissao(orgao_id, 'contas', 'editar') and public.no_alcance(orgao_id, null));

drop policy if exists "documentos_contas: exclusão" on public.documentos_contas;
create policy "documentos_contas: exclusão" on public.documentos_contas for delete to authenticated
  using (public.tem_permissao(orgao_id, 'contas', 'excluir') and public.no_alcance(orgao_id, null));

grant select on public.documentos_contas to anon;
grant select, insert, update, delete on public.documentos_contas to authenticated;


-- ---------------------------------------------------------------------
-- 4. ARQUIVOS MAIORES
--    LOA, PPA e seus anexos passam fácil de 10 MB. O limite do bucket sobe
--    para 50 MB (máximo do plano gratuito da Supabase). O painel mantém
--    10 MB nos outros módulos e libera 50 MB só aqui.
-- ---------------------------------------------------------------------
update storage.buckets set file_size_limit = 52428800 where id = 'arquivos';


-- ---------------------------------------------------------------------
-- 5. PERIODICIDADE DO RGF
--    Municípios com até 50 mil habitantes podem publicar o RGF por
--    semestre. A escolha fica em orgaos.configuracoes.rgf_periodicidade
--    ('quadrimestral' ou 'semestral'), editada na própria tela.
--    Riacho da Cruz começa como semestral (pode mudar no painel).
-- ---------------------------------------------------------------------
update public.orgaos
set configuracoes = configuracoes || jsonb_build_object('rgf_periodicidade', 'semestral')
where cnpj = '08.153.454/0001-04' and not (configuracoes ? 'rgf_periodicidade');
