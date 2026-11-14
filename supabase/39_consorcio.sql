-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 39 — Consórcio público (PNTP 2026, matriz específica dos Consórcios
-- Públicos: 8 critérios, 1 obrigatório e 7 recomendados — Cartilha 2026)
--
--   11.11 orçamento do consórcio (receita estimada e despesa fixada do ano) . consorcio_documentos 'orcamento'
--                                                                            (ou a LOA em Planejamento e contas)
--   25.1  protocolo de intenções ............................................ consorcio_documentos 'protocolo_intencoes'
--   25.2  estatuto (versão vigente e alterações) ............................ 'estatuto' + 'alteracao_estatutaria'
--   25.3  contratos de rateio (um por ente em cada exercício) ............... 'contrato_rateio' (exercício, ente, valor)
--   25.4  contrato de programa .............................................. 'contrato_programa' (ente, vigência)
--   25.5  ata de eleição dos atuais dirigentes .............................. 'ata_eleicao'
--   25.6  atas da assembleia geral .......................................... 'ata_assembleia'
--   25.7  entes consorciados ................................................ consorcio_entes
--
-- Também: módulo 'consorcio' (só para órgãos do tipo consórcio), declarações de
-- que não há dados (rateio, programa, assembleia, orçamento), autoavaliação
-- (pntp_consorcio_itens, chamada pelo script 26) e o menu padrão do consórcio.
-- Rodar depois do 38. Pode rodar mais de uma vez.
-- DEPOIS DESTE, RODE DE NOVO O SCRIPT 26 (a autoavaliação passa a incluir os
-- critérios do consórcio).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. MÓDULO (só aparece no painel de órgão do tipo consórcio)
-- ---------------------------------------------------------------------
insert into public.modulos (codigo, nome, grupo, ordem, tipos_orgao) values
  ('consorcio', 'Consórcio público', 'Conteúdo do site', 36, array['consorcio'])
on conflict (codigo) do update set nome = excluded.nome, grupo = excluded.grupo, tipos_orgao = excluded.tipos_orgao;

-- Permissões iguais às de Publicações oficiais (quem publica os atos oficiais publica os do consórcio).
insert into public.perfil_permissoes (perfil_id, modulo, pode_ver, pode_editar, pode_publicar, pode_excluir)
select perfil_id, 'consorcio', pode_ver, pode_editar, pode_publicar, pode_excluir
from public.perfil_permissoes where modulo = 'publicacoes'
on conflict (perfil_id, modulo) do nothing;


-- ---------------------------------------------------------------------
-- 1. TABELAS
-- ---------------------------------------------------------------------
-- 25.7 Entes consorciados (municípios, estados ou outros entes)
create table if not exists public.consorcio_entes (
  id                  uuid primary key default gen_random_uuid(),
  orgao_id            uuid not null references public.orgaos(id) on delete cascade,
  nome                text not null check (char_length(nome) between 3 and 200),       -- Município de Riacho da Cruz
  tipo_ente           text not null default 'municipio' check (tipo_ente in ('municipio', 'estado', 'uniao', 'outro')),
  uf                  text not null check (uf ~ '^[A-Z]{2}$'),
  cnpj                text check (cnpj is null or cnpj ~ '^\d{14}$'),
  lei_ratificacao     text check (lei_ratificacao is null or char_length(lei_ratificacao) <= 200),   -- Lei nº 512/2021
  lei_ratificacao_url text check (lei_ratificacao_url is null or lei_ratificacao_url ~* '^https?://'),
  data_ingresso       date,
  data_saida          date,
  situacao_ente       text not null default 'ativo' check (situacao_ente in ('ativo', 'retirado', 'excluido')),
  ordem               integer not null default 0,
  situacao            text not null default 'rascunho' check (situacao in ('rascunho', 'publicado')),
  publicado_em        timestamptz,
  busca               text generated always as (public.normalizar_texto(nome || ' ' || uf || ' ' || coalesce(cnpj, '') || ' ' || coalesce(lei_ratificacao, ''))) stored,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),
  constraint consorcio_entes_datas check (data_saida is null or data_ingresso is null or data_saida >= data_ingresso),
  constraint consorcio_entes_saida check (situacao_ente = 'ativo' or data_saida is not null)
);
create unique index if not exists consorcio_entes_uk on public.consorcio_entes (orgao_id, public.normalizar_texto(nome), uf);
create index if not exists consorcio_entes_lista_idx on public.consorcio_entes (orgao_id, situacao_ente, ordem, nome);

-- Documentos do consórcio (25.1 a 25.6 e 11.11)
create table if not exists public.consorcio_documentos (
  id               uuid primary key default gen_random_uuid(),
  orgao_id         uuid not null references public.orgaos(id) on delete cascade,
  tipo             text not null check (tipo in ('protocolo_intencoes', 'contrato_consorcio', 'estatuto', 'alteracao_estatutaria',
                                                 'contrato_rateio', 'contrato_programa', 'ata_eleicao', 'ata_assembleia', 'orcamento', 'outros')),
  titulo           text not null check (char_length(titulo) between 3 and 300),
  numero           text check (numero is null or char_length(numero) <= 40),
  exercicio        integer check (exercicio is null or exercicio between 1990 and 2100),
  data             date not null default current_date,                -- assinatura, aprovação ou publicação
  ente_id          uuid references public.consorcio_entes(id) on delete no action,   -- ente com rateio/programa não pode ser excluído
  valor            numeric(16, 2) check (valor is null or valor >= 0),
  vigencia_inicio  date,
  vigencia_fim     date,
  descricao        text check (descricao is null or char_length(descricao) <= 4000),
  arquivo_url      text check (arquivo_url is null or arquivo_url ~* '^https?://'),
  link_externo     text check (link_externo is null or link_externo ~* '^https?://'),
  situacao         text not null default 'rascunho' check (situacao in ('rascunho', 'publicado')),
  publicado_em     timestamptz,
  -- ano usado nas abas de exercício (rateio e orçamento: o exercício; atas e demais: o ano da data)
  ano              integer generated always as (coalesce(exercicio, extract(year from data)::integer)) stored,
  busca            text generated always as (public.normalizar_texto(tipo || ' ' || titulo || ' ' || coalesce(numero, '') || ' ' || coalesce(descricao, ''))) stored,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  constraint consorcio_documentos_vigencia check (vigencia_fim is null or vigencia_inicio is null or vigencia_fim >= vigencia_inicio),
  constraint consorcio_documentos_rateio check (tipo <> 'contrato_rateio' or (exercicio is not null and ente_id is not null)),
  constraint consorcio_documentos_programa check (tipo <> 'contrato_programa' or ente_id is not null),
  constraint consorcio_documentos_orcamento check (tipo <> 'orcamento' or exercicio is not null),
  constraint consorcio_documentos_publicar check (situacao <> 'publicado' or arquivo_url is not null or link_externo is not null)
);
create index if not exists consorcio_documentos_lista_idx on public.consorcio_documentos (orgao_id, tipo, ano desc, data desc, id);
create index if not exists consorcio_documentos_ente_idx on public.consorcio_documentos (ente_id, tipo, exercicio) where ente_id is not null;
-- Um contrato de rateio por ente em cada exercício (termos aditivos vão como "outros", ligados ao ente).
create unique index if not exists consorcio_documentos_rateio_uk on public.consorcio_documentos (orgao_id, ente_id, exercicio) where tipo = 'contrato_rateio';


-- ---------------------------------------------------------------------
-- 2. GATILHOS, REGRAS DE ACESSO E PERMISSÕES (módulo 'consorcio')
-- ---------------------------------------------------------------------
-- O ente do documento é do mesmo consórcio (impede misturar órgãos pela API).
create or replace function public.conferir_ente_consorcio()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.ente_id is not null and not exists (select 1 from public.consorcio_entes e where e.id = new.ente_id and e.orgao_id = new.orgao_id) then
    raise exception 'O ente indicado não é deste consórcio.';
  end if;
  return new;
end $$;
drop trigger if exists consorcio_documentos_ente on public.consorcio_documentos;
create trigger consorcio_documentos_ente before insert or update on public.consorcio_documentos
  for each row execute function public.conferir_ente_consorcio();

do $$
declare t text;
begin
  foreach t in array array['consorcio_entes', 'consorcio_documentos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop trigger if exists %1$s_publicacao on public.%1$I', t);
    execute format('create trigger %1$s_publicacao before insert or update on public.%1$I for each row execute function public.controlar_publicacao(''consorcio'')', t);
    execute format('drop trigger if exists %1$s_atualizado on public.%1$I', t);
    execute format('create trigger %1$s_atualizado before update on public.%1$I for each row execute function public.marcar_atualizacao()', t);
    execute format('drop trigger if exists %1$s_historico on public.%1$I', t);
    execute format('create trigger %1$s_historico after insert or update or delete on public.%1$I for each row execute function public.registrar_historico()', t);
    execute format('drop policy if exists "%1$s: leitura" on public.%1$I', t);
    execute format('create policy "%1$s: leitura" on public.%1$I for select to anon, authenticated using (situacao = ''publicado'' or public.e_membro(orgao_id))', t);
    execute format('drop policy if exists "%1$s: inclusão" on public.%1$I', t);
    execute format('create policy "%1$s: inclusão" on public.%1$I for insert to authenticated with check (public.tem_permissao(orgao_id, ''consorcio'', ''editar'') and public.no_alcance(orgao_id, null))', t);
    execute format('drop policy if exists "%1$s: edição" on public.%1$I', t);
    execute format('create policy "%1$s: edição" on public.%1$I for update to authenticated using (public.tem_permissao(orgao_id, ''consorcio'', ''editar'') and public.no_alcance(orgao_id, null)) with check (public.tem_permissao(orgao_id, ''consorcio'', ''editar'') and public.no_alcance(orgao_id, null))', t);
    execute format('drop policy if exists "%1$s: exclusão" on public.%1$I', t);
    execute format('create policy "%1$s: exclusão" on public.%1$I for delete to authenticated using (public.tem_permissao(orgao_id, ''consorcio'', ''excluir'') and public.no_alcance(orgao_id, null))', t);
    execute format('grant select on public.%I to anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Anos com documentos (abas de exercício do painel e do site). p_qual: rateio, programa, atas, orcamento, constitutivos.
create or replace function public.consorcio_anos(p_orgao uuid, p_qual text)
returns table (ano integer, total bigint)
language sql stable security definer set search_path = public as $$
  select d.ano, count(*)
  from public.consorcio_documentos d
  where d.orgao_id = p_orgao and (d.situacao = 'publicado' or public.e_membro(p_orgao))
    and d.tipo = any (case p_qual when 'rateio' then array['contrato_rateio'] when 'programa' then array['contrato_programa']
                                  when 'atas' then array['ata_eleicao', 'ata_assembleia'] when 'orcamento' then array['orcamento']
                                  else array['protocolo_intencoes', 'contrato_consorcio', 'estatuto', 'alteracao_estatutaria', 'outros'] end)
  group by d.ano order by d.ano desc;
$$;
grant execute on function public.consorcio_anos(uuid, text) to anon, authenticated;

-- Entes ativos sem contrato de rateio publicado no exercício (aviso do painel e da autoavaliação).
create or replace function public.consorcio_rateio_faltando(p_orgao uuid, p_ano integer)
returns table (ente_id uuid, nome text, uf text)
language sql stable security definer set search_path = public as $$
  select e.id, e.nome, e.uf from public.consorcio_entes e
  where e.orgao_id = p_orgao and e.situacao = 'publicado'
    and (e.data_ingresso is null or e.data_ingresso <= make_date(p_ano, 12, 31))
    and (e.data_saida is null or e.data_saida >= make_date(p_ano, 1, 1))
    and (e.situacao_ente = 'ativo' or e.data_saida is not null)
    and not exists (select 1 from public.consorcio_documentos d where d.ente_id = e.id and d.tipo = 'contrato_rateio'
                     and d.exercicio = p_ano and d.situacao = 'publicado')
  order by e.ordem, e.nome;
$$;
grant execute on function public.consorcio_rateio_faltando(uuid, integer) to authenticated;


-- ---------------------------------------------------------------------
-- 3. DECLARAÇÕES DE QUE NÃO HÁ DADOS (rateio, programa, assembleia, orçamento)
--    Mesmo conteúdo do script 34, com as partes do consórcio no fim.
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
    when p_chave in ('consorcio_rateio', 'consorcio_programa', 'consorcio_atas', 'consorcio_orcamento') then 'consorcio'
  end;
$$;


-- ---------------------------------------------------------------------
-- 4. CRITÉRIOS DO PNTP 2026 — matriz específica dos Consórcios Públicos
--    (Cartilha 2026: 11.11 obrigatório; 25.1 a 25.7 recomendados; dimensão 25 de peso 3)
-- ---------------------------------------------------------------------
alter table public.pntp_criterios drop constraint if exists pntp_criterios_matriz_check;
alter table public.pntp_criterios add constraint pntp_criterios_matriz_check
  check (matriz in ('comum', 'executivo', 'executivo_consorcio', 'legislativo', 'consorcio'));

insert into public.pntp_criterios (codigo, ordem, dimensao, peso_dimensao, titulo, classificacao, matriz, itens, modulo, rota, pagina) values
  ('11.11', 1111, 'Planejamento e prestação de contas', 4, 'Orçamento do consórcio: receita estimada e despesa fixada do exercício', 'obrigatoria', 'consorcio', 'DASG', 'consorcio', '#/m/consorcio?aba=orcamento', '/orcamento-consorcio'),
  ('25.1',  2501, 'Atividades finalísticas (Consórcios Públicos)', 3, 'Protocolo de intenções que antecede o contrato de consórcio', 'recomendada', 'consorcio', 'D', 'consorcio', '#/m/consorcio?aba=constitutivos', '/documentos-consorcio'),
  ('25.2',  2502, 'Atividades finalísticas (Consórcios Públicos)', 3, 'Estatuto do consórcio (versão vigente e alterações)', 'recomendada', 'consorcio', 'D', 'consorcio', '#/m/consorcio?aba=constitutivos', '/documentos-consorcio'),
  ('25.3',  2503, 'Atividades finalísticas (Consórcios Públicos)', 3, 'Contratos de rateio (um por ente em cada exercício)', 'recomendada', 'consorcio', 'DAS', 'consorcio', '#/m/consorcio?aba=rateio', '/rateio'),
  ('25.4',  2504, 'Atividades finalísticas (Consórcios Públicos)', 3, 'Contrato de programa', 'recomendada', 'consorcio', 'D', 'consorcio', '#/m/consorcio?aba=programa', '/programa'),
  ('25.5',  2505, 'Atividades finalísticas (Consórcios Públicos)', 3, 'Ata de eleição dos atuais dirigentes', 'recomendada', 'consorcio', 'D', 'consorcio', '#/m/consorcio?aba=atas', '/dirigentes-atas'),
  ('25.6',  2506, 'Atividades finalísticas (Consórcios Públicos)', 3, 'Atas da assembleia geral', 'recomendada', 'consorcio', 'DAS', 'consorcio', '#/m/consorcio?aba=atas', '/dirigentes-atas'),
  ('25.7',  2507, 'Atividades finalísticas (Consórcios Públicos)', 3, 'Entes consorciados (municípios integrantes)', 'recomendada', 'consorcio', 'D', 'consorcio', '#/m/consorcio?aba=entes', '/entes')
on conflict (codigo) do update set ordem = excluded.ordem, dimensao = excluded.dimensao, peso_dimensao = excluded.peso_dimensao, titulo = excluded.titulo,
  classificacao = excluded.classificacao, matriz = excluded.matriz, itens = excluded.itens, modulo = excluded.modulo, rota = excluded.rota, pagina = excluded.pagina;


-- ---------------------------------------------------------------------
-- 5. AUTOAVALIAÇÃO (chamada por avaliacao_pntp, script 26, quando o órgão é
--    consórcio). Mesmo formato: [{c, d, a, s, ext, f}].
--    Série histórica: os 3 exercícios anteriores ao ano da consulta (Cartilha 2026).
-- ---------------------------------------------------------------------
create or replace function public.pntp_consorcio_itens(p_orgao uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  hoje date := current_date;
  v_ano int := extract(year from current_date)::int;
  cfg jsonb := coalesce((select configuracoes from public.orgaos where id = p_orgao), '{}'::jsonb);
  r jsonb := '[]'::jsonb;
  d boolean; a boolean; s boolean; ext boolean; n bigint; anos int[]; falt int[]; ult date; f text[]; t text; k int;
  pub constant text := 'publicado';
begin
  -- 11.11 Orçamento do consórcio (vale também a LOA cadastrada em Planejamento e contas)
  ext := public.pntp_externo(cfg, array['consorcio_orcamento']);
  select coalesce(array_agg(distinct x.ex), '{}') into anos from (
    select c.exercicio as ex from public.consorcio_documentos c where c.orgao_id = p_orgao and c.tipo = 'orcamento' and c.situacao = pub
    union select k2.exercicio from public.documentos_contas k2 where k2.orgao_id = p_orgao and k2.tipo = 'loa' and k2.situacao = pub) x;
  falt := public.pntp_anos_faltando(p_orgao, array['consorcio_orcamento'], anos, v_ano - 1);
  a := v_ano = any (anos) or public.pntp_declarado(p_orgao, array['consorcio_orcamento'], make_date(v_ano, 1, 1), make_date(v_ano, 12, 31));
  d := a or cardinality(anos) > 0;
  r := r || jsonb_build_object('c', '11.11', 'd', d, 'a', a, 's', cardinality(falt) = 0, 'ext', ext, 'f', array_remove(array[
    case when not a then 'Falta o orçamento de ' || v_ano || ' (receita estimada e despesa fixada): Consórcio público › Orçamento.' end,
    case when cardinality(falt) > 0 then 'Série histórica: falta o orçamento de ' || array_to_string(falt, ', ') || '.' end], null));

  -- 25.1 Protocolo de intenções / 25.2 Estatuto
  ext := public.pntp_externo(cfg, array['consorcio_documentos']);
  d := exists (select 1 from public.consorcio_documentos c where c.orgao_id = p_orgao and c.tipo = 'protocolo_intencoes' and c.situacao = pub);
  r := r || jsonb_build_object('c', '25.1', 'd', d, 'ext', ext, 'f', case when d then '{}'::text[]
    else array['Publique o protocolo de intenções (Consórcio público › Documentos constitutivos).'] end);
  d := exists (select 1 from public.consorcio_documentos c where c.orgao_id = p_orgao and c.tipo = 'estatuto' and c.situacao = pub);
  select max(c.data) into ult from public.consorcio_documentos c where c.orgao_id = p_orgao and c.tipo = 'alteracao_estatutaria' and c.situacao = pub;
  r := r || jsonb_build_object('c', '25.2', 'd', d, 'ext', ext, 'f', array_remove(array[
    case when not d then 'Publique o estatuto vigente (Consórcio público › Documentos constitutivos).' end,
    case when d and ult is not null and ult > (select max(c.data) from public.consorcio_documentos c where c.orgao_id = p_orgao and c.tipo = 'estatuto' and c.situacao = pub)
      then 'Há alteração estatutária mais nova que o estatuto publicado: publique também o estatuto consolidado (versão vigente).' end], null));

  -- 25.3 Contratos de rateio: um por ente em cada exercício
  ext := public.pntp_externo(cfg, array['consorcio_rateio']);
  select count(*) into n from public.consorcio_entes e where e.orgao_id = p_orgao and e.situacao = pub;
  select coalesce(array_agg(distinct c.exercicio), '{}') into anos from public.consorcio_documentos c
   where c.orgao_id = p_orgao and c.tipo = 'contrato_rateio' and c.situacao = pub;
  f := '{}';
  if n = 0 then f := f || 'Cadastre e publique os entes consorciados: o rateio é conferido ente por ente.'::text; end if;
  -- ano atual
  if public.pntp_declarado(p_orgao, array['consorcio_rateio'], make_date(v_ano, 1, 1), make_date(v_ano, 12, 31)) then a := true;
  else
    select string_agg(x.nome, ', '), count(*) into t, k from public.consorcio_rateio_faltando(p_orgao, v_ano) x;
    a := n > 0 and k = 0;
    if n > 0 and k > 0 then f := f || ('Contrato de rateio de ' || v_ano || ' faltando para: ' || t || '.')::text; end if;
  end if;
  -- série histórica (3 exercícios anteriores), ente por ente
  s := true;
  for k in reverse v_ano - 1 .. v_ano - 3 loop
    continue when public.pntp_declarado(p_orgao, array['consorcio_rateio'], make_date(k, 1, 1), make_date(k, 12, 31))
               or k = any (public.pntp_anos_outros_links(p_orgao, array['consorcio_rateio']));
    select string_agg(x.nome, ', ') into t from public.consorcio_rateio_faltando(p_orgao, k) x;
    if t is not null or not (k = any (anos)) then
      s := false;
      f := f || ('Série histórica: contrato de rateio de ' || k || ' faltando' || coalesce(' para: ' || t, '') || '.')::text;
    end if;
  end loop;
  d := cardinality(anos) > 0 or public.pntp_declarado(p_orgao, array['consorcio_rateio'], hoje - 365, hoje);
  if not d then f := array['Nenhum contrato de rateio publicado (Consórcio público › Contratos de rateio).']::text[] || f; end if;
  r := r || jsonb_build_object('c', '25.3', 'd', d, 'a', a, 's', s, 'ext', ext, 'f', f);

  -- 25.4 Contrato de programa
  ext := public.pntp_externo(cfg, array['consorcio_programa']);
  d := exists (select 1 from public.consorcio_documentos c where c.orgao_id = p_orgao and c.tipo = 'contrato_programa' and c.situacao = pub)
       or public.pntp_declarado(p_orgao, array['consorcio_programa'], hoje - 30, hoje);
  r := r || jsonb_build_object('c', '25.4', 'd', d, 'ext', ext, 'f', case when d then '{}'::text[]
    else array['Publique o(s) contrato(s) de programa ou declare que o consórcio não tem (Consórcio público › Contratos de programa).'] end);

  -- 25.5 Ata de eleição dos atuais dirigentes
  ext := public.pntp_externo(cfg, array['consorcio_atas']);
  select max(c.data) into ult from public.consorcio_documentos c where c.orgao_id = p_orgao and c.tipo = 'ata_eleicao' and c.situacao = pub;
  d := ult is not null;
  r := r || jsonb_build_object('c', '25.5', 'd', d, 'ext', ext, 'f', array_remove(array[
    case when not d then 'Publique a ata de eleição dos atuais dirigentes (Consórcio público › Dirigentes e atas).' end,
    case when d and ult < hoje - 730 then 'A ata de eleição mais recente é de ' || to_char(ult, 'DD/MM/YYYY') || ': confira se os dirigentes atuais foram eleitos nela.' end], null));

  -- 25.6 Atas da assembleia geral (a mais recente com até 1 ano; série: os 3 anos anteriores)
  ext := public.pntp_externo(cfg, array['consorcio_atas']);
  select coalesce(array_agg(distinct extract(year from c.data)::int), '{}'), max(c.data) into anos, ult
    from public.consorcio_documentos c where c.orgao_id = p_orgao and c.tipo = 'ata_assembleia' and c.situacao = pub;
  falt := public.pntp_anos_faltando(p_orgao, array['consorcio_atas'], anos, v_ano - 1);
  d := ult is not null or public.pntp_declarado(p_orgao, array['consorcio_atas'], hoje - 365, hoje);
  a := coalesce(ult >= hoje - 365, false) or public.pntp_declarado(p_orgao, array['consorcio_atas'], hoje - 365, hoje);
  r := r || jsonb_build_object('c', '25.6', 'd', d, 'a', a, 's', cardinality(falt) = 0, 'ext', ext, 'f', array_remove(array[
    case when not d then 'Publique as atas da assembleia geral (Consórcio público › Dirigentes e atas).' end,
    case when d and not a then 'A ata de assembleia mais recente tem mais de 1 ano: publique as novas (ou declare que não houve assembleia).' end,
    case when cardinality(falt) > 0 then 'Série histórica: sem atas de assembleia em ' || array_to_string(falt, ', ') || '.' end], null));

  -- 25.7 Entes consorciados
  ext := public.pntp_externo(cfg, array['consorcio_entes']);
  select count(*) into n from public.consorcio_entes e where e.orgao_id = p_orgao and e.situacao = pub and e.situacao_ente = 'ativo';
  r := r || jsonb_build_object('c', '25.7', 'd', n > 0, 'ext', ext, 'f', case when n > 0 then '{}'::text[]
    else array['Publique a relação dos entes consorciados (Consórcio público › Entes consorciados).'] end);
  return r;
end;
$$;
grant execute on function public.pntp_consorcio_itens(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 6. MENU PADRÃO (Prefeitura, Câmara e Consórcio) — criação de órgão e botão
--    "Criar menu padrão". Mesmo do script 34, com o menu do consórcio.
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
  v_tipo text := (select tipo::text from public.orgaos where id = p_orgao);
  i int; j int; pai uuid; n int := 0;
begin
  -- Câmara: menu com a atividade legislativa (PNTP 20.x) e sem as páginas só do Executivo.
  if v_tipo = 'camara' then
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
  -- Consórcio público: matriz dos consórcios (PNTP 11.11 e 25.x).
  elsif v_tipo = 'consorcio' then
    m := '[
      ["Início", "/"],
      ["O Consórcio", "/entes", [["Entes consorciados", "/entes"], ["Documentos constitutivos", "/documentos-consorcio"], ["Estrutura organizacional", "/estrutura"],
        ["Dirigentes e assembleia", "/dirigentes-atas"]]],
      ["Transparência", "/transparencia", [["Portal da Transparência", "/transparencia"], ["Receitas", "/receitas"], ["Despesas", "/despesas"], ["Pessoal", "/pessoal"], ["Diárias", "/diarias"],
        ["Planejamento e contas", "/planejamento"], ["Orçamento do consórcio", "/orcamento-consorcio"], ["Licitações", "/licitacoes"], ["Contratos", "/contratos"],
        ["Contratos de rateio e de programa", "/rateio"]]],
      ["Publicações", "/publicacoes"],
      ["Notícias", "/noticias"],
      ["Atendimento", "/contato", [["Ouvidoria", "/ouvidoria"], ["e-SIC", "/esic"], ["Carta de Serviços", "/servicos"], ["Contato", "/contato"]]]
    ]'::jsonb;
  end if;
  -- Quem está no SQL Editor (fora da API) também pode criar o menu (scripts de teste e de implantação).
  if not (public.e_suporte_softplus() or public.tem_permissao(p_orgao, 'menu', 'editar') or session_user not in ('authenticator', 'anon', 'authenticated')) then
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

-- Depois deste script, rode de novo o script 26.
