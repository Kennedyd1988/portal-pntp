-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 20 — tipos próprios de publicação, concursos e processos
--             seletivos (PNTP 6.6 e 6.7) e avisos de dados desatualizados
--
--   1. publicacoes_tipos: tipos de publicação criados pelo órgão (além dos
--      tipos fixos), cada um numa aba do painel (grupo).
--   2. concursos + concursos_documentos: concursos públicos, processos
--      seletivos simplificados, seleções de estágio, chamamentos e outras
--      seleções, com a íntegra do edital (6.6) e os demais atos de cada fase
--      (6.7: retificações, inscritos, resultados, recursos, homologação,
--      convocações). Módulo novo "concursos" (permissões copiadas de
--      "pessoal").
--   3. pendencias_atualizacao(órgão): o que está desatualizado em cada
--      módulo (prazos do PNTP), para os avisos do painel.
--
-- Como usar: SQL Editor › New query › colar tudo › Run. Pode repetir.
-- Rodar DEPOIS dos scripts 01 a 19.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. TIPOS PRÓPRIOS DE PUBLICAÇÃO
-- ---------------------------------------------------------------------
create table if not exists public.publicacoes_tipos (
  id         uuid primary key default gen_random_uuid(),
  orgao_id   uuid not null references public.orgaos(id) on delete cascade,
  codigo     text not null check (codigo ~ '^x_[a-z0-9_]{2,40}$'),     -- "x_" separa dos tipos fixos
  nome       text not null check (char_length(nome) between 2 and 60),
  grupo      text not null default 'outros' check (grupo in ('leis', 'decretos', 'portarias', 'normas', 'editais', 'outros')),
  criado_em  timestamptz not null default now(),
  unique (orgao_id, codigo)
);
create unique index if not exists publicacoes_tipos_nome_uk on public.publicacoes_tipos (orgao_id, public.normalizar_texto(nome));

-- Tipo em uso não pode ser excluído (as publicações perderiam o nome do tipo).
create or replace function public.proteger_tipo_publicacao()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists (select 1 from public.publicacoes p where p.orgao_id = old.orgao_id and p.tipo = old.codigo) then
    raise exception 'Este tipo tem publicações cadastradas: troque o tipo delas antes de excluir.';
  end if;
  return old;
end;
$$;
drop trigger if exists publicacoes_tipos_proteger on public.publicacoes_tipos;
create trigger publicacoes_tipos_proteger before delete on public.publicacoes_tipos
  for each row execute function public.proteger_tipo_publicacao();
drop trigger if exists publicacoes_tipos_historico on public.publicacoes_tipos;
create trigger publicacoes_tipos_historico after insert or update or delete on public.publicacoes_tipos
  for each row execute function public.registrar_historico();

alter table public.publicacoes_tipos enable row level security;
drop policy if exists "publicacoes_tipos: leitura" on public.publicacoes_tipos;
create policy "publicacoes_tipos: leitura" on public.publicacoes_tipos for select to anon, authenticated using (true);
drop policy if exists "publicacoes_tipos: inclusão" on public.publicacoes_tipos;
create policy "publicacoes_tipos: inclusão" on public.publicacoes_tipos for insert to authenticated
  with check (public.tem_permissao(orgao_id, 'publicacoes', 'editar') and public.no_alcance(orgao_id, null));
drop policy if exists "publicacoes_tipos: edição" on public.publicacoes_tipos;
create policy "publicacoes_tipos: edição" on public.publicacoes_tipos for update to authenticated
  using (public.tem_permissao(orgao_id, 'publicacoes', 'editar') and public.no_alcance(orgao_id, null))
  with check (public.tem_permissao(orgao_id, 'publicacoes', 'editar') and public.no_alcance(orgao_id, null));
drop policy if exists "publicacoes_tipos: exclusão" on public.publicacoes_tipos;
create policy "publicacoes_tipos: exclusão" on public.publicacoes_tipos for delete to authenticated
  using (public.tem_permissao(orgao_id, 'publicacoes', 'excluir') and public.no_alcance(orgao_id, null));
grant select on public.publicacoes_tipos to anon;
grant select, insert, update, delete on public.publicacoes_tipos to authenticated;


-- ---------------------------------------------------------------------
-- 2. CONCURSOS E PROCESSOS SELETIVOS (PNTP 6.6 e 6.7)
-- ---------------------------------------------------------------------
insert into public.modulos (codigo, nome, grupo, ordem) values
  ('concursos', 'Concursos e processos seletivos', 'Transparência', 72)
on conflict (codigo) do nothing;

insert into public.perfil_permissoes (perfil_id, modulo, pode_ver, pode_editar, pode_publicar, pode_excluir)
select perfil_id, 'concursos', pode_ver, pode_editar, pode_publicar, pode_excluir
from public.perfil_permissoes where modulo = 'pessoal'
on conflict (perfil_id, modulo) do nothing;

create table if not exists public.concursos (
  id                  uuid primary key default gen_random_uuid(),
  orgao_id            uuid not null references public.orgaos(id) on delete cascade,
  tipo                text not null default 'processo_seletivo' check (tipo in (
                        'concurso', 'processo_seletivo', 'estagio', 'chamamento', 'credenciamento', 'outro')),
  numero              text check (numero is null or char_length(numero) <= 40),        -- ex.: Edital nº 01/2026
  ano                 integer not null check (ano between 1990 and 2100),
  titulo              text not null check (char_length(titulo) between 5 and 300),
  descricao           text check (descricao is null or char_length(descricao) <= 4000), -- cargos, requisitos, remuneração
  unidade_nome        text check (unidade_nome is null or char_length(unidade_nome) <= 150),
  vagas               text check (vagas is null or char_length(vagas) <= 200),           -- ex.: 12 + cadastro reserva
  organizadora        text check (organizadora is null or char_length(organizadora) <= 200),
  inscricoes_inicio   date,
  inscricoes_fim      date,
  data_prova          date,
  validade_ate        date,                                                               -- prazo de validade do certame
  andamento           text not null default 'inscricoes_abertas' check (andamento in (
                        'previsto', 'inscricoes_abertas', 'em_andamento', 'resultado', 'homologado', 'suspenso', 'cancelado', 'encerrado')),
  link_externo        text check (link_externo is null or link_externo ~* '^https?://'), -- site da organizadora
  situacao            text not null default 'rascunho' check (situacao in ('rascunho', 'publicado')),
  publicado_em        timestamptz,
  busca               text generated always as (public.normalizar_texto(
                        coalesce(numero, '') || ' ' || titulo || ' ' || coalesce(descricao, '') || ' ' || coalesce(unidade_nome, '') || ' ' || coalesce(organizadora, ''))) stored,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),
  constraint concursos_inscricoes check (coalesce(inscricoes_inicio is null or inscricoes_fim is null or inscricoes_fim >= inscricoes_inicio, false))
);
create index if not exists concursos_lista_idx on public.concursos (orgao_id, ano desc, atualizado_em desc, id desc);

create table if not exists public.concursos_documentos (
  id            uuid primary key default gen_random_uuid(),
  concurso_id   uuid not null references public.concursos(id) on delete cascade,
  orgao_id      uuid not null references public.orgaos(id) on delete cascade,
  tipo          text not null default 'outro' check (tipo in (
                  'edital', 'retificacao', 'anexo', 'inscritos', 'gabarito', 'resultado_preliminar', 'recurso',
                  'resultado_final', 'homologacao', 'convocacao', 'nomeacao', 'prorrogacao', 'outro')),
  titulo        text not null check (char_length(titulo) between 2 and 200),
  data          date not null default current_date,
  arquivo_url   text,
  link_externo  text check (link_externo is null or link_externo ~* '^https?://'),
  criado_em     timestamptz not null default now(),
  constraint concursos_documentos_arquivo check (coalesce(arquivo_url is not null or link_externo is not null, false))
);
create index if not exists concursos_documentos_idx on public.concursos_documentos (concurso_id, data);

create or replace function public.concurso_ano()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.ano is null then new.ano := extract(year from coalesce(new.inscricoes_inicio, now()))::integer; end if;
  return new;
end;
$$;
drop trigger if exists concursos_ano on public.concursos;
create trigger concursos_ano before insert on public.concursos for each row execute function public.concurso_ano();

-- Publicar exige a íntegra do edital (6.6).
create or replace function public.conferir_edital_concurso()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.situacao = 'publicado' and not exists (
       select 1 from public.concursos_documentos d where d.concurso_id = new.id and d.tipo = 'edital') then
    raise exception 'Para publicar, anexe o edital (íntegra) na aba Documentos.';
  end if;
  return new;
end;
$$;
drop trigger if exists concursos_edital on public.concursos;
create trigger concursos_edital before insert or update of situacao on public.concursos
  for each row execute function public.conferir_edital_concurso();

drop trigger if exists concursos_publicacao on public.concursos;
create trigger concursos_publicacao before insert or update on public.concursos
  for each row execute function public.controlar_publicacao('concursos');
drop trigger if exists concursos_atualizado on public.concursos;
create trigger concursos_atualizado before update on public.concursos
  for each row execute function public.marcar_atualizacao();
drop trigger if exists concursos_historico on public.concursos;
create trigger concursos_historico after insert or update or delete on public.concursos
  for each row execute function public.registrar_historico();

-- Documento: mesmo órgão; em concurso publicado, só quem publica mexe; o edital de concurso
-- publicado não pode ser excluído (o 6.6 deixaria de ser atendido).
create or replace function public.validar_doc_concurso()
returns trigger language plpgsql set search_path = public as $$
declare
  v_id uuid := coalesce(new.concurso_id, old.concurso_id);
  v_orgao uuid := coalesce(new.orgao_id, old.orgao_id);
  v_sit text;
begin
  select c.situacao into v_sit from public.concursos c where c.id = v_id and c.orgao_id = v_orgao;
  if v_sit is null then
    if tg_op = 'DELETE' then return old; end if;
    raise exception 'O documento não pertence a uma seleção deste órgão.';
  end if;
  if current_user in ('anon', 'authenticated') and v_sit = 'publicado' and not public.tem_permissao(v_orgao, 'concursos', 'publicar') then
    raise exception 'Esta seleção está publicada. Só quem tem permissão de publicar altera os documentos dela.';
  end if;
  if tg_op = 'DELETE' and old.tipo = 'edital' and v_sit = 'publicado'
     and not exists (select 1 from public.concursos_documentos d where d.concurso_id = v_id and d.tipo = 'edital' and d.id <> old.id) then
    raise exception 'A seleção está publicada: o edital não pode ser excluído (envie o novo antes ou tire do ar).';
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists concursos_documentos_validar on public.concursos_documentos;
create trigger concursos_documentos_validar before insert or update or delete on public.concursos_documentos
  for each row execute function public.validar_doc_concurso();
drop trigger if exists concursos_documentos_historico on public.concursos_documentos;
create trigger concursos_documentos_historico after insert or update or delete on public.concursos_documentos
  for each row execute function public.registrar_historico();

alter table public.concursos enable row level security;
drop policy if exists "concursos: leitura" on public.concursos;
create policy "concursos: leitura" on public.concursos for select to anon, authenticated using (situacao = 'publicado' or public.e_membro(orgao_id));
drop policy if exists "concursos: inclusão" on public.concursos;
create policy "concursos: inclusão" on public.concursos for insert to authenticated
  with check (public.tem_permissao(orgao_id, 'concursos', 'editar') and public.no_alcance(orgao_id, null));
drop policy if exists "concursos: edição" on public.concursos;
create policy "concursos: edição" on public.concursos for update to authenticated
  using (public.tem_permissao(orgao_id, 'concursos', 'editar') and public.no_alcance(orgao_id, null))
  with check (public.tem_permissao(orgao_id, 'concursos', 'editar') and public.no_alcance(orgao_id, null));
drop policy if exists "concursos: exclusão" on public.concursos;
create policy "concursos: exclusão" on public.concursos for delete to authenticated
  using (public.tem_permissao(orgao_id, 'concursos', 'excluir') and public.no_alcance(orgao_id, null));

alter table public.concursos_documentos enable row level security;
drop policy if exists "concursos_documentos: leitura" on public.concursos_documentos;
create policy "concursos_documentos: leitura" on public.concursos_documentos for select to anon, authenticated
  using (public.e_membro(orgao_id) or exists (select 1 from public.concursos c where c.id = concurso_id and c.situacao = 'publicado'));
drop policy if exists "concursos_documentos: inclusão" on public.concursos_documentos;
create policy "concursos_documentos: inclusão" on public.concursos_documentos for insert to authenticated
  with check (public.tem_permissao(orgao_id, 'concursos', 'editar') and public.no_alcance(orgao_id, null));
drop policy if exists "concursos_documentos: edição" on public.concursos_documentos;
create policy "concursos_documentos: edição" on public.concursos_documentos for update to authenticated
  using (public.tem_permissao(orgao_id, 'concursos', 'editar') and public.no_alcance(orgao_id, null))
  with check (public.tem_permissao(orgao_id, 'concursos', 'editar') and public.no_alcance(orgao_id, null));
drop policy if exists "concursos_documentos: exclusão" on public.concursos_documentos;
create policy "concursos_documentos: exclusão" on public.concursos_documentos for delete to authenticated
  using (public.tem_permissao(orgao_id, 'concursos', 'editar') and public.no_alcance(orgao_id, null));

grant select on public.concursos, public.concursos_documentos to anon;
grant select, insert, update, delete on public.concursos, public.concursos_documentos to authenticated;

create or replace function public.concursos_anos(p_orgao uuid)
returns table (ano integer, total bigint)
language sql stable security invoker set search_path = public as $$
  select c.ano, count(*) from public.concursos c where c.orgao_id = p_orgao group by c.ano order by c.ano desc;
$$;
grant execute on function public.concursos_anos(uuid) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 3. AVISOS DE DADOS DESATUALIZADOS (painel)
--    Uma linha por situação a corrigir: módulo, gravidade, texto e
--    quantidade. Só membros do órgão recebem linhas (security invoker +
--    RLS: o visitante não vê rascunhos e a função devolve nada para ele).
--    Prazos: 30 dias para obras (PNTP 10.1), repasses de convênios e
--    execução de emendas; licitação com abertura vencida ainda "aberta";
--    contrato vencido sem aditivo ainda marcado como vigente; contrato
--    vigente sem fiscal vigente (9.3); seleção com inscrições encerradas
--    ainda "inscrições abertas".
-- ---------------------------------------------------------------------
create or replace function public.pendencias_atualizacao(p_orgao uuid)
returns table (modulo text, nivel text, mensagem text, quantidade bigint)
language plpgsql stable security invoker set search_path = public as $$
declare
  hoje date := current_date;
begin
  if not public.e_membro(p_orgao) then return; end if;

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
  select 'pca', 'alerta', 'falta o Plano de Contratações Anual de ' || extract(year from hoje)::int || ' (PNTP 8.6).', 1::bigint
  where not exists (select 1 from public.pca p where p.orgao_id = p_orgao and p.ano = extract(year from hoje)::int and p.tipo = 'plano');

  return query
  select 'concursos', 'alerta', 'seleção(ões) com as inscrições encerradas ainda marcadas como "inscrições abertas": atualize o andamento e publique os atos seguintes (PNTP 6.7).', count(*)
  from public.concursos c
  where c.orgao_id = p_orgao and c.andamento = 'inscricoes_abertas' and c.inscricoes_fim < hoje
  having count(*) > 0;

  return query
  select 'noticias', 'info', 'nenhuma notícia publicada nos últimos 30 dias.', 1::bigint
  where not exists (select 1 from public.noticias n where n.orgao_id = p_orgao and n.publicado_em >= now() - interval '30 days' and n.publicado_em <= now());
end;
$$;
grant execute on function public.pendencias_atualizacao(uuid) to authenticated;
