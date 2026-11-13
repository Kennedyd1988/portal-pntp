-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 22 — Receitas (PNTP 3.1 a 3.3), Despesas (4.1 a 4.3), Ordem
--             cronológica de pagamentos (9.4), Pessoal (6.1 a 6.5) e
--             Diárias (7.1 e 7.2)
--
--   1. Módulos: "financeiro" passa a se chamar "Receitas, despesas e
--      pagamentos"; "pessoal" vira "Pessoal e folha de pagamento"; módulo
--      novo "diarias" (permissões copiadas de "pessoal").
--   2. Partes novas em secoes_setoriais (texto da parte e declaração "não
--      há"); o link externo de cada parte fica em Aparência › Destinos das
--      páginas, com a mesma chave.
--   3. Receitas: lançamentos mensais por natureza da receita (previsto
--      inicial, previsto atualizado e arrecadado) e descrição de cada nível
--      da classificação (categoria, origem, espécie, desdobramento).
--      Dívida ativa: inscritos (nome, ano de inscrição, valor); CPF nunca
--      sai inteiro no site.
--   4. Despesas: empenhos com a classificação orçamentária completa
--      (unidade, função, subfunção, programa, ação, natureza, fonte), o
--      credor e a licitação de origem; reforços, anulações, liquidações e
--      pagamentos com data (totais do empenho mantidos pelo banco).
--   5. Ordem cronológica de pagamentos (art. 141 da Lei 14.133/2021):
--      por categoria de contrato e fonte, vencimento, pagamento e a
--      justificativa obrigatória quando a ordem é alterada.
--   6. Pessoal: servidores (vínculo, cargo, lotação, admissão, desligamento,
--      carga horária), remuneração mensal nominal, tabela de cargos e
--      salários, estagiários e terceirizados.
--   7. Diárias concedidas e tabela de valores (no estado, fora do estado,
--      exterior).
--   8. Funções de consulta do site (níveis da receita, totais e
--      classificação da despesa, exercícios com dados).
--   9. pendencias_financeiras: avisos de prazo destes módulos (somados aos
--      do script 21 por pendencias_atualizacao).
--
-- Importação: o layout dos arquivos será definido na próxima etapa. As
-- tabelas já aceitam a gravação em lote sem uma linha de histórico por
-- registro (pntp.importando), como as listas do script 21.
--
-- Como usar: SQL Editor › New query › colar tudo › Run. Pode repetir.
-- Rodar DEPOIS dos scripts 01 a 21 (o 21 atualizado, que tem o gancho dos
-- avisos novos: quem rodou o 21 antes de 13/11/2026 à tarde roda o 21 de
-- novo e depois este).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. MÓDULOS E PERMISSÕES
-- ---------------------------------------------------------------------
update public.modulos set nome = 'Receitas, despesas e pagamentos' where codigo = 'financeiro';
update public.modulos set nome = 'Pessoal e folha de pagamento' where codigo = 'pessoal';
insert into public.modulos (codigo, nome, grupo, ordem) values ('diarias', 'Diárias', 'Transparência', 71)
on conflict (codigo) do nothing;

insert into public.perfil_permissoes (perfil_id, modulo, pode_ver, pode_editar, pode_publicar, pode_excluir)
select perfil_id, 'diarias', pode_ver, pode_editar, pode_publicar, pode_excluir
from public.perfil_permissoes where modulo = 'pessoal'
on conflict (perfil_id, modulo) do nothing;

-- Módulo de cada parte (mesma função do script 21, agora com as partes deste script).
create or replace function public.modulo_setorial(p_chave text)
returns text language sql immutable set search_path = public as $$
  select case when p_chave = 'saude' or p_chave like 'saude\_%' then 'saude'
              when p_chave like 'renuncias%' then 'renuncias'
              when p_chave like 'receitas\_%' or p_chave like 'despesas\_%' or p_chave = 'ordem_cronologica' then 'financeiro'
              when p_chave like 'pessoal\_%' then 'pessoal'
              when p_chave like 'diarias\_%' then 'diarias'
              else 'educacao' end;
$$;


-- ---------------------------------------------------------------------
-- 2. PARTES NOVAS (texto e declaração "não há")
-- ---------------------------------------------------------------------
alter table public.secoes_setoriais drop constraint if exists secoes_setoriais_secao_check;
alter table public.secoes_setoriais add constraint secoes_setoriais_secao_check check (secao in (
  'saude_documentos', 'saude_servicos', 'saude_espera', 'saude_medicamentos', 'saude_estoque', 'saude_conselho',
  'educacao_documentos', 'educacao_creches', 'educacao_fundeb', 'educacao_assistencia', 'educacao_conselhos',
  'renuncias_desoneracoes', 'renuncias_valores', 'renuncias_beneficiarios', 'renuncias_incentivos',
  'receitas_arrecadacao', 'receitas_divida_ativa', 'despesas_empenhos', 'ordem_cronologica',
  'pessoal_servidores', 'pessoal_remuneracao', 'pessoal_cargos', 'pessoal_estagiarios', 'pessoal_terceirizados',
  'diarias_concedidas', 'diarias_tabela'));


-- ---------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------
-- Código da natureza da receita: 8 números sem pontos (padrão da Portaria
-- Conjunta STN/SOF 650/2019: C.O.E.D.DD.D.T) ganham os pontos; o resto fica
-- como veio (cada ponto separa um nível).
create or replace function public.formatar_natureza_receita(p text)
returns text language sql immutable set search_path = public as $$
  select case when regexp_replace(coalesce(p, ''), '\s', '', 'g') ~ '^\d{8}$'
              then regexp_replace(regexp_replace(p, '\s', '', 'g'), '^(\d)(\d)(\d)(\d)(\d{2})(\d)(\d)$', '\1.\2.\3.\4.\5.\6.\7')
              else regexp_replace(coalesce(p, ''), '\s', '', 'g') end;
$$;

-- Natureza da despesa: C.G.MM.EE[.DD] (categoria, grupo, modalidade, elemento, desdobramento).
create or replace function public.formatar_natureza_despesa(p text)
returns text language sql immutable set search_path = public as $$
  select case when length(d) between 6 and 10
              then substr(d, 1, 1) || '.' || substr(d, 2, 1) || '.' || substr(d, 3, 2) || '.' || substr(d, 5, 2)
                   || case when length(d) > 6 then '.' || substr(d, 7) else '' end
              else nullif(p, '') end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x;
$$;

-- Resumo (hash) do CPF/CNPJ: o site procura o credor pelo documento inteiro sem
-- poder ler a coluna com o número.
create or replace function public.resumo_documento(p text)
returns text language sql immutable set search_path = public as $$
  select case when p ~ '^(\d{11}|\d{14})$' then encode(sha256(convert_to(p, 'UTF8')), 'hex') end;
$$;

-- Valor no padrão brasileiro (1.234,56) nas mensagens, qualquer que seja o idioma do servidor.
create or replace function public.valor_br(p numeric)
returns text language sql immutable set search_path = public as $$
  select translate(to_char(coalesce(p, 0), 'FM999,999,999,990.00'), ',.', '.,');
$$;

-- Ano de uma data (para colunas geradas).
create or replace function public.ano_de(p date)
returns integer language sql immutable set search_path = public as $$
  select extract(year from p)::integer;
$$;

-- Normaliza códigos antes de gravar.
create or replace function public.preparar_financeiro()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_table_name = 'receitas' then
    new.natureza_codigo := public.formatar_natureza_receita(new.natureza_codigo);
  elsif tg_table_name = 'receitas_naturezas' then
    new.codigo := public.formatar_natureza_receita(new.codigo);
  elsif tg_table_name = 'despesas' then
    new.natureza_codigo := public.formatar_natureza_despesa(new.natureza_codigo);
  end if;
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- 3. RECEITAS (3.1, 3.2) E DÍVIDA ATIVA (3.3)
-- ---------------------------------------------------------------------
-- Descrição por extenso de cada nível da classificação (3.2 pede código e descrição).
create table if not exists public.receitas_naturezas (
  id             uuid primary key default gen_random_uuid(),
  orgao_id       uuid not null references public.orgaos(id) on delete cascade,
  codigo         text not null check (codigo ~ '^\d+(\.\d+)*$' and char_length(codigo) <= 40),
  descricao      text not null check (char_length(descricao) between 2 and 300),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  unique (orgao_id, codigo)
);

-- Lançamento mensal no nível mais detalhado (analítico). Os níveis acima são somados pelo site.
-- Previsão: valor do ano, como estava naquele mês (vale a do último mês lançado).
create table if not exists public.receitas (
  id                   uuid primary key default gen_random_uuid(),
  orgao_id             uuid not null references public.orgaos(id) on delete cascade,
  exercicio            integer not null check (exercicio between 1990 and 2100),
  mes                  integer not null check (mes between 1 and 12),
  natureza_codigo      text not null check (natureza_codigo ~ '^\d+(\.\d+)*$' and char_length(natureza_codigo) <= 40),
  natureza_descricao   text not null check (char_length(natureza_descricao) between 2 and 300),
  fonte_codigo         text check (fonte_codigo is null or char_length(fonte_codigo) <= 20),
  fonte_descricao      text check (fonte_descricao is null or char_length(fonte_descricao) <= 200),
  previsto_inicial     numeric(16,2),
  previsto_atualizado  numeric(16,2),
  arrecadado           numeric(16,2) not null default 0,     -- no mês (deduções entram negativas)
  busca                text generated always as (public.normalizar_texto(natureza_codigo || ' ' || natureza_descricao || ' ' || coalesce(fonte_codigo, '') || ' ' || coalesce(fonte_descricao, ''))) stored,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now()
);
create unique index if not exists receitas_uk on public.receitas (orgao_id, exercicio, mes, natureza_codigo, coalesce(fonte_codigo, ''));
create index if not exists receitas_natureza_idx on public.receitas (orgao_id, exercicio, natureza_codigo text_pattern_ops);

-- 3.3: relação dos inscritos em dívida ativa, por exercício (posição no fim do ano).
create table if not exists public.divida_ativa (
  id                 uuid primary key default gen_random_uuid(),
  orgao_id           uuid not null references public.orgaos(id) on delete cascade,
  exercicio          integer not null check (exercicio between 1990 and 2100),   -- posição em 31/12 deste ano
  nome               text not null check (char_length(nome) between 2 and 200),
  documento          text check (documento is null or documento ~ '^(\d{11}|\d{14})$'),
  documento_publico  text generated always as (public.documento_publico(documento)) stored,
  ano_inscricao      integer not null check (ano_inscricao between 1950 and 2100),
  tributo            text check (tributo is null or char_length(tributo) <= 100),   -- IPTU, ISS, taxas, multas…
  valor              numeric(16,2) not null check (valor >= 0),
  busca              text generated always as (public.normalizar_texto(nome || ' ' || coalesce(tributo, '') || ' '
                       || case when documento ~ '^\d{14}$' then documento else '' end)) stored,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);
create index if not exists divida_ativa_idx on public.divida_ativa (orgao_id, exercicio, nome);


-- ---------------------------------------------------------------------
-- 4. DESPESAS (4.1 a 4.3)
-- ---------------------------------------------------------------------
create table if not exists public.despesas (
  id                  uuid primary key default gen_random_uuid(),
  orgao_id            uuid not null references public.orgaos(id) on delete cascade,
  numero              text not null check (char_length(numero) between 1 and 30),
  data_empenho        date not null,
  exercicio           integer generated always as (public.ano_de(data_empenho)) stored,
  tipo_empenho        text not null default 'ordinario' check (tipo_empenho in ('ordinario', 'estimativo', 'global')),
  -- Classificação orçamentária (4.2): código e nome de cada parte.
  unidade_codigo      text check (unidade_codigo is null or char_length(unidade_codigo) <= 20),
  unidade_nome        text check (unidade_nome is null or char_length(unidade_nome) <= 200),
  funcao_codigo       text check (funcao_codigo is null or funcao_codigo ~ '^\d{2}$'),
  subfuncao_codigo    text check (subfuncao_codigo is null or subfuncao_codigo ~ '^\d{3}$'),
  subfuncao_nome      text check (subfuncao_nome is null or char_length(subfuncao_nome) <= 150),
  programa_codigo     text check (programa_codigo is null or char_length(programa_codigo) <= 10),
  programa_nome       text check (programa_nome is null or char_length(programa_nome) <= 200),
  acao_codigo         text check (acao_codigo is null or char_length(acao_codigo) <= 10),
  acao_nome           text check (acao_nome is null or char_length(acao_nome) <= 300),
  natureza_codigo     text check (natureza_codigo is null or natureza_codigo ~ '^\d\.\d\.\d{2}\.\d{2}(\.\d+)?$'),
  natureza_nome       text check (natureza_nome is null or char_length(natureza_nome) <= 200),   -- elemento/desdobramento por extenso
  categoria           text generated always as (substr(regexp_replace(coalesce(natureza_codigo, ''), '\D', '', 'g'), 1, 1)) stored,
  grupo               text generated always as (substr(regexp_replace(coalesce(natureza_codigo, ''), '\D', '', 'g'), 1, 2)) stored,
  modalidade_aplicacao text generated always as (substr(regexp_replace(coalesce(natureza_codigo, ''), '\D', '', 'g'), 3, 2)) stored,
  elemento            text generated always as (substr(regexp_replace(coalesce(natureza_codigo, ''), '\D', '', 'g'), 5, 2)) stored,
  fonte_codigo        text check (fonte_codigo is null or char_length(fonte_codigo) <= 20),
  fonte_nome          text check (fonte_nome is null or char_length(fonte_nome) <= 200),
  -- Credor (4.3). CPF sai mascarado no site; a busca pelo documento usa o resumo.
  credor_nome         text not null check (char_length(credor_nome) between 2 and 200),
  credor_doc          text check (credor_doc is null or credor_doc ~ '^(\d{11}|\d{14})$'),
  credor_doc_publico  text generated always as (public.documento_publico(credor_doc)) stored,
  credor_doc_resumo   text generated always as (public.resumo_documento(credor_doc)) stored,
  objeto              text not null check (char_length(objeto) between 3 and 2000),          -- bem ou serviço (histórico)
  -- Licitação de origem (4.3): modalidade e número, ou "não se aplica" (pessoal, diárias, encargos…).
  modalidade          text check (modalidade is null or modalidade in (
                        'pregao_eletronico', 'pregao_presencial', 'concorrencia_eletronica', 'concorrencia_presencial', 'concurso',
                        'leilao_eletronico', 'leilao_presencial', 'dialogo_competitivo', 'credenciamento', 'pre_qualificacao',
                        'manifestacao_interesse', 'chamada_publica', 'tomada_precos', 'convite', 'dispensa', 'inexigibilidade',
                        'adesao_ata', 'outra', 'nao_se_aplica')),
  licitacao_numero    text check (licitacao_numero is null or char_length(licitacao_numero) <= 40),
  licitacao_id        uuid references public.licitacoes(id) on delete set null,
  contrato_id         uuid references public.contratos(id) on delete set null,
  processo            text check (processo is null or char_length(processo) <= 60),
  valor_empenhado     numeric(16,2) not null check (valor_empenhado >= 0),                    -- valor original do empenho
  -- Mantidos pelo banco a partir dos movimentos (não editar à mão):
  total_empenhado     numeric(16,2) not null default 0,    -- original + reforços − anulações
  total_liquidado     numeric(16,2) not null default 0,
  total_pago          numeric(16,2) not null default 0,
  ultima_movimentacao date,
  busca               text generated always as (public.normalizar_texto(numero || ' ' || credor_nome || ' ' || objeto || ' ' || coalesce(processo, '') || ' '
                        || coalesce(licitacao_numero, '') || ' ' || case when credor_doc ~ '^\d{14}$' then credor_doc else '' end)) stored,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);
create unique index if not exists despesas_numero_uk on public.despesas (orgao_id, exercicio, numero);
create index if not exists despesas_lista_idx on public.despesas (orgao_id, exercicio, data_empenho desc, id desc);
create index if not exists despesas_credor_idx on public.despesas (orgao_id, credor_doc_resumo);

create table if not exists public.despesas_movimentos (
  id             uuid primary key default gen_random_uuid(),
  despesa_id     uuid not null references public.despesas(id) on delete cascade,
  orgao_id       uuid not null references public.orgaos(id) on delete cascade,
  tipo           text not null check (tipo in ('reforco', 'anulacao', 'liquidacao', 'estorno_liquidacao', 'pagamento', 'estorno_pagamento')),
  data           date not null,
  valor          numeric(16,2) not null check (valor > 0),
  documento      text check (documento is null or char_length(documento) <= 60),     -- nº da liquidação, nota fiscal, ordem de pagamento
  observacao     text check (observacao is null or char_length(observacao) <= 300),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
create index if not exists despesas_mov_idx on public.despesas_movimentos (despesa_id, data);
create index if not exists despesas_mov_orgao_idx on public.despesas_movimentos (orgao_id, data);

-- Totais do empenho a partir dos movimentos. A atualização dos totais não gera linha
-- de histórico (o movimento já gerou).
create or replace function public.recalcular_despesa(p_id uuid)
returns void language plpgsql set search_path = public as $$
declare
  antes text := coalesce(current_setting('pntp.importando', true), '');
  t record;
begin
  select coalesce(sum(valor) filter (where tipo = 'reforco'), 0) - coalesce(sum(valor) filter (where tipo = 'anulacao'), 0) as emp,
         coalesce(sum(valor) filter (where tipo = 'liquidacao'), 0) - coalesce(sum(valor) filter (where tipo = 'estorno_liquidacao'), 0) as liq,
         coalesce(sum(valor) filter (where tipo = 'pagamento'), 0) - coalesce(sum(valor) filter (where tipo = 'estorno_pagamento'), 0) as pag,
         max(data) as ultima
    into t from public.despesas_movimentos where despesa_id = p_id;
  perform set_config('pntp.importando', '1', true);
  update public.despesas d set total_empenhado = d.valor_empenhado + t.emp, total_liquidado = t.liq, total_pago = t.pag,
         ultima_movimentacao = greatest(d.data_empenho, t.ultima)
   where d.id = p_id;
  perform set_config('pntp.importando', antes, true);
end;
$$;

create or replace function public.validar_movimento_despesa()
returns trigger language plpgsql set search_path = public as $$
declare
  d record;
  r record := coalesce(new, old);
begin
  select id, orgao_id, data_empenho, numero into d from public.despesas where id = r.despesa_id;
  if tg_op <> 'DELETE' then
    if d.id is null or d.orgao_id <> new.orgao_id then raise exception 'O movimento não pertence a um empenho deste órgão.'; end if;
    if new.data < d.data_empenho then raise exception 'A data do movimento não pode ser antes da data do empenho (%).', to_char(d.data_empenho, 'DD/MM/YYYY'); end if;
  end if;
  return r;
end;
$$;

create or replace function public.depois_movimento_despesa()
returns trigger language plpgsql set search_path = public as $$
declare
  t record;
  v_id uuid := coalesce(new.despesa_id, old.despesa_id);
begin
  perform public.recalcular_despesa(v_id);
  if tg_op = 'UPDATE' and old.despesa_id <> new.despesa_id then perform public.recalcular_despesa(old.despesa_id); end if;
  -- Na importação os movimentos podem chegar fora de ordem: a conferência fica para o fim.
  if coalesce(current_setting('pntp.importando', true), '') <> '1' then
    select total_empenhado, total_liquidado, total_pago into t from public.despesas where id = v_id;
    if t.total_liquidado > t.total_empenhado or t.total_pago > t.total_liquidado or t.total_empenhado < 0 or t.total_liquidado < 0 or t.total_pago < 0 then
      raise exception 'Os valores não fecham: o liquidado não pode passar do empenhado, nem o pago passar do liquidado (empenhado %, liquidado %, pago %).',
        public.valor_br(t.total_empenhado), public.valor_br(t.total_liquidado), public.valor_br(t.total_pago);
    end if;
  end if;
  return null;
end;
$$;

-- Empenho: vínculos do mesmo órgão; total empenhado acompanha o valor original.
create or replace function public.validar_despesa()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.licitacao_id is not null and not exists (select 1 from public.licitacoes l where l.id = new.licitacao_id and l.orgao_id = new.orgao_id) then
    raise exception 'A licitação indicada não é deste órgão.';
  end if;
  if new.contrato_id is not null and not exists (select 1 from public.contratos c where c.id = new.contrato_id and c.orgao_id = new.orgao_id) then
    raise exception 'O contrato indicado não é deste órgão.';
  end if;
  if tg_op = 'INSERT' then
    new.total_empenhado := new.valor_empenhado; new.total_liquidado := 0; new.total_pago := 0; new.ultima_movimentacao := new.data_empenho;
  elsif new.valor_empenhado <> old.valor_empenhado or new.data_empenho <> old.data_empenho then
    new.total_empenhado := old.total_empenhado - old.valor_empenhado + new.valor_empenhado;
    new.ultima_movimentacao := greatest(new.data_empenho, (select max(m.data) from public.despesas_movimentos m where m.despesa_id = new.id));
    if exists (select 1 from public.despesas_movimentos m where m.despesa_id = new.id and m.data < new.data_empenho) then
      raise exception 'Há movimentos com data anterior à nova data do empenho.';
    end if;
    if new.total_empenhado < new.total_liquidado then
      raise exception 'O valor do empenho ficaria menor que o já liquidado.';
    end if;
  end if;
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- 5. ORDEM CRONOLÓGICA DE PAGAMENTOS (9.4 — art. 141 da Lei 14.133/2021)
-- ---------------------------------------------------------------------
create table if not exists public.ordem_cronologica (
  id                  uuid primary key default gen_random_uuid(),
  orgao_id            uuid not null references public.orgaos(id) on delete cascade,
  categoria           text not null check (categoria in ('bens', 'locacoes', 'servicos', 'obras')),
  fonte_codigo        text check (fonte_codigo is null or char_length(fonte_codigo) <= 20),
  fonte_nome          text check (fonte_nome is null or char_length(fonte_nome) <= 200),
  credor_nome         text not null check (char_length(credor_nome) between 2 and 200),
  credor_doc          text check (credor_doc is null or credor_doc ~ '^(\d{11}|\d{14})$'),
  credor_doc_publico  text generated always as (public.documento_publico(credor_doc)) stored,
  documento_fiscal    text check (documento_fiscal is null or char_length(documento_fiscal) <= 80),   -- nota fiscal, fatura, medição
  empenho_numero      text check (empenho_numero is null or char_length(empenho_numero) <= 30),
  despesa_id          uuid references public.despesas(id) on delete set null,
  contrato_numero     text check (contrato_numero is null or char_length(contrato_numero) <= 60),
  contrato_id         uuid references public.contratos(id) on delete set null,
  objeto              text check (objeto is null or char_length(objeto) <= 500),
  -- Vencimento: quando o credor pode exigir o pagamento (sem regra local: liquidação ou nota fiscal).
  data_exigibilidade  date not null,
  exercicio           integer generated always as (public.ano_de(data_exigibilidade)) stored,
  data_pagamento      date,
  valor               numeric(16,2) not null check (valor > 0),
  -- Alteração da ordem (art. 141, § 1º): hipótese, justificativa e o ato.
  fora_da_ordem       boolean not null default false,
  motivo_alteracao    text check (motivo_alteracao is null or motivo_alteracao in (
                        'emergencia', 'pequenas_empresas', 'sistemas_estruturantes', 'falencia', 'patrimonio_essencial')),
  justificativa       text check (justificativa is null or char_length(justificativa) <= 3000),
  ato_justificativa   text check (ato_justificativa is null or char_length(ato_justificativa) <= 200),
  justificativa_url   text check (justificativa_url is null or justificativa_url ~* '^https?://'),
  busca               text generated always as (public.normalizar_texto(credor_nome || ' ' || coalesce(documento_fiscal, '') || ' ' || coalesce(empenho_numero, '') || ' '
                        || coalesce(contrato_numero, '') || ' ' || coalesce(objeto, '') || ' ' || case when credor_doc ~ '^\d{14}$' then credor_doc else '' end)) stored,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),
  constraint ordem_cronologica_justificativa check (not fora_da_ordem or (motivo_alteracao is not null and char_length(coalesce(justificativa, '')) >= 20)),
  constraint ordem_cronologica_datas check (data_pagamento is null or data_pagamento >= data_exigibilidade - 365)
);
create index if not exists ordem_cronologica_idx on public.ordem_cronologica (orgao_id, exercicio, categoria, fonte_codigo, data_exigibilidade);

create or replace function public.validar_ordem_cronologica()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.despesa_id is not null and not exists (select 1 from public.despesas d where d.id = new.despesa_id and d.orgao_id = new.orgao_id) then
    raise exception 'O empenho indicado não é deste órgão.';
  end if;
  if new.contrato_id is not null and not exists (select 1 from public.contratos c where c.id = new.contrato_id and c.orgao_id = new.orgao_id) then
    raise exception 'O contrato indicado não é deste órgão.';
  end if;
  if not new.fora_da_ordem then new.motivo_alteracao := null; end if;
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- 6. PESSOAL (6.1 a 6.5)
-- ---------------------------------------------------------------------
-- 6.1: servidores, autoridades e membros. CPF (para conferência) nunca vai ao site.
create table if not exists public.pessoal_vinculos (
  id                   uuid primary key default gen_random_uuid(),
  orgao_id             uuid not null references public.orgaos(id) on delete cascade,
  matricula            text check (matricula is null or char_length(matricula) <= 30),
  nome                 text not null check (char_length(nome) between 3 and 200),
  documento            text check (documento is null or documento ~ '^\d{11}$'),
  cargo                text not null check (char_length(cargo) between 2 and 150),
  funcao               text check (funcao is null or char_length(funcao) <= 150),          -- cargo em comissão / função de confiança exercida
  vinculo              text not null default 'efetivo' check (vinculo in (
                         'efetivo', 'comissionado', 'temporario', 'eletivo', 'celetista', 'cedido', 'requisitado', 'aposentado', 'pensionista', 'outro')),
  lotacao              text check (lotacao is null or char_length(lotacao) <= 200),
  carga_horaria        text check (carga_horaria is null or char_length(carga_horaria) <= 40),
  data_admissao        date not null,
  data_desligamento    date,
  motivo_desligamento  text check (motivo_desligamento is null or motivo_desligamento in (
                         'exoneracao', 'demissao', 'aposentadoria', 'falecimento', 'fim_contrato', 'fim_mandato', 'outro')),
  busca                text generated always as (public.normalizar_texto(nome || ' ' || coalesce(matricula, '') || ' ' || cargo || ' ' || coalesce(funcao, '') || ' ' || coalesce(lotacao, ''))) stored,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now(),
  constraint pessoal_vinculos_datas check (data_desligamento is null or data_desligamento >= data_admissao)
);
create index if not exists pessoal_vinculos_idx on public.pessoal_vinculos (orgao_id, nome, id);
create index if not exists pessoal_vinculos_mat_idx on public.pessoal_vinculos (orgao_id, matricula);

-- 6.2: remuneração nominal de cada mês (uma linha por pessoa e folha).
create table if not exists public.pessoal_remuneracoes (
  id                   uuid primary key default gen_random_uuid(),
  orgao_id             uuid not null references public.orgaos(id) on delete cascade,
  exercicio            integer not null check (exercicio between 1990 and 2100),
  mes                  integer not null check (mes between 1 and 12),
  folha                text not null default 'mensal' check (folha in ('mensal', 'decimo_terceiro', 'ferias', 'rescisao', 'complementar', 'adiantamento')),
  matricula            text check (matricula is null or char_length(matricula) <= 30),
  nome                 text not null check (char_length(nome) between 3 and 200),
  cargo                text not null check (char_length(cargo) between 2 and 150),
  vinculo              text check (vinculo is null or vinculo in (
                         'efetivo', 'comissionado', 'temporario', 'eletivo', 'celetista', 'cedido', 'requisitado', 'aposentado', 'pensionista', 'outro')),
  lotacao              text check (lotacao is null or char_length(lotacao) <= 200),
  remuneracao_basica   numeric(14,2),
  vantagens            numeric(14,2),       -- vantagens pessoais, gratificações, adicionais
  eventuais            numeric(14,2),       -- 13º, férias, abono, horas extras
  indenizacoes         numeric(14,2),       -- auxílios e outras verbas indenizatórias
  bruto                numeric(14,2) not null check (bruto >= 0),
  descontos            numeric(14,2) not null default 0 check (descontos >= 0),
  liquido              numeric(14,2),
  busca                text generated always as (public.normalizar_texto(nome || ' ' || coalesce(matricula, '') || ' ' || cargo || ' ' || coalesce(lotacao, ''))) stored,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now()
);
create index if not exists pessoal_rem_idx on public.pessoal_remuneracoes (orgao_id, exercicio, mes, nome, id);

-- 6.3: padrão remuneratório (faixas de cada cargo ou função).
create table if not exists public.pessoal_cargos (
  id               uuid primary key default gen_random_uuid(),
  orgao_id         uuid not null references public.orgaos(id) on delete cascade,
  cargo            text not null check (char_length(cargo) between 2 and 150),
  tipo             text not null default 'efetivo' check (tipo in ('efetivo', 'comissao', 'funcao_gratificada', 'temporario', 'eletivo', 'outro')),
  referencia       text check (referencia is null or char_length(referencia) <= 60),   -- nível, classe, padrão, faixa
  carga_horaria    text check (carga_horaria is null or char_length(carga_horaria) <= 40),
  vencimento       numeric(14,2) not null check (vencimento >= 0),
  norma            text check (norma is null or char_length(norma) <= 300),
  norma_url        text check (norma_url is null or norma_url ~* '^https?://'),
  vigencia_inicio  date,
  vigencia_fim     date,
  ordem            integer not null default 0,
  busca            text generated always as (public.normalizar_texto(cargo || ' ' || coalesce(referencia, '') || ' ' || coalesce(norma, ''))) stored,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  constraint pessoal_cargos_vigencia check (vigencia_inicio is null or vigencia_fim is null or vigencia_fim >= vigencia_inicio)
);
create index if not exists pessoal_cargos_idx on public.pessoal_cargos (orgao_id, tipo, ordem, cargo);

-- 6.4: estagiários (início e término do termo de compromisso).
create table if not exists public.pessoal_estagiarios (
  id                 uuid primary key default gen_random_uuid(),
  orgao_id           uuid not null references public.orgaos(id) on delete cascade,
  nome               text not null check (char_length(nome) between 3 and 200),
  instituicao        text check (instituicao is null or char_length(instituicao) <= 200),
  curso              text check (curso is null or char_length(curso) <= 150),
  nivel              text check (nivel is null or nivel in ('medio', 'tecnico', 'superior', 'pos')),
  lotacao            text check (lotacao is null or char_length(lotacao) <= 200),
  carga_horaria      text check (carga_horaria is null or char_length(carga_horaria) <= 40),
  bolsa              numeric(12,2) check (bolsa is null or bolsa >= 0),
  data_inicio        date not null,
  data_fim           date not null,          -- término previsto no termo
  data_desligamento  date,                   -- encerramento antes do previsto
  busca              text generated always as (public.normalizar_texto(nome || ' ' || coalesce(instituicao, '') || ' ' || coalesce(curso, '') || ' ' || coalesce(lotacao, ''))) stored,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  constraint pessoal_estagiarios_datas check (data_fim >= data_inicio and (data_desligamento is null or data_desligamento >= data_inicio))
);
create index if not exists pessoal_estag_idx on public.pessoal_estagiarios (orgao_id, data_inicio desc, nome);

-- 6.5: terceirizados (relação do exercício). CPF só mascarado no site.
create table if not exists public.pessoal_terceirizados (
  id                 uuid primary key default gen_random_uuid(),
  orgao_id           uuid not null references public.orgaos(id) on delete cascade,
  exercicio          integer not null check (exercicio between 1990 and 2100),
  nome               text not null check (char_length(nome) between 3 and 200),
  documento          text check (documento is null or documento ~ '^\d{11}$'),
  documento_publico  text generated always as (public.documento_publico(documento)) stored,
  funcao             text not null check (char_length(funcao) between 2 and 150),
  empresa            text not null check (char_length(empresa) between 2 and 200),
  empresa_cnpj       text check (empresa_cnpj is null or empresa_cnpj ~ '^\d{14}$'),
  contrato_numero    text check (contrato_numero is null or char_length(contrato_numero) <= 60),
  contrato_id        uuid references public.contratos(id) on delete set null,
  lotacao            text check (lotacao is null or char_length(lotacao) <= 200),   -- local de trabalho
  data_inicio        date,
  data_fim           date,
  busca              text generated always as (public.normalizar_texto(nome || ' ' || funcao || ' ' || empresa || ' ' || coalesce(empresa_cnpj, '') || ' ' || coalesce(lotacao, ''))) stored,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  constraint pessoal_terceirizados_datas check (data_inicio is null or data_fim is null or data_fim >= data_inicio)
);
create index if not exists pessoal_terc_idx on public.pessoal_terceirizados (orgao_id, exercicio, nome);

create or replace function public.validar_terceirizado()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.contrato_id is not null and not exists (select 1 from public.contratos c where c.id = new.contrato_id and c.orgao_id = new.orgao_id) then
    raise exception 'O contrato indicado não é deste órgão.';
  end if;
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- 7. DIÁRIAS (7.1 e 7.2)
-- ---------------------------------------------------------------------
create table if not exists public.diarias (
  id              uuid primary key default gen_random_uuid(),
  orgao_id        uuid not null references public.orgaos(id) on delete cascade,
  nome            text not null check (char_length(nome) between 3 and 200),
  documento       text check (documento is null or documento ~ '^\d{11}$'),           -- só para conferência; não vai ao site
  cargo           text not null check (char_length(cargo) between 2 and 150),
  unidade         text check (unidade is null or char_length(unidade) <= 200),
  destino         text not null check (char_length(destino) between 2 and 200),       -- cidade/UF (ou país)
  abrangencia     text check (abrangencia is null or abrangencia in ('estado', 'fora_estado', 'exterior')),
  motivo          text not null check (char_length(motivo) between 3 and 1000),
  data_inicio     date not null,
  data_fim        date not null,
  exercicio       integer generated always as (public.ano_de(data_inicio)) stored,
  quantidade      numeric(6,1) not null check (quantidade > 0),
  valor_unitario  numeric(12,2) check (valor_unitario is null or valor_unitario >= 0),
  valor_total     numeric(14,2) not null check (valor_total >= 0),
  data_pagamento  date,
  empenho_numero  text check (empenho_numero is null or char_length(empenho_numero) <= 30),
  ato_concessao   text check (ato_concessao is null or char_length(ato_concessao) <= 120),   -- portaria / processo
  busca           text generated always as (public.normalizar_texto(nome || ' ' || cargo || ' ' || destino || ' ' || motivo || ' ' || coalesce(unidade, ''))) stored,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  constraint diarias_datas check (data_fim >= data_inicio)
);
create index if not exists diarias_idx on public.diarias (orgao_id, exercicio, data_inicio desc, id desc);

-- 7.2: valores das diárias por grupo de cargos e destino, conforme a norma local.
create table if not exists public.diarias_valores (
  id                 uuid primary key default gen_random_uuid(),
  orgao_id           uuid not null references public.orgaos(id) on delete cascade,
  grupo              text not null check (char_length(grupo) between 2 and 200),     -- ex.: Prefeito e vice; secretários; demais servidores
  abrangencia        text not null check (abrangencia in ('estado', 'capital', 'fora_estado', 'brasilia', 'exterior', 'outra')),
  destino_descricao  text check (destino_descricao is null or char_length(destino_descricao) <= 200),
  valor              numeric(12,2) not null check (valor >= 0),
  moeda              text not null default 'BRL' check (moeda in ('BRL', 'USD', 'EUR')),
  norma              text not null check (char_length(norma) between 3 and 300),
  norma_url          text check (norma_url is null or norma_url ~* '^https?://'),
  vigencia_inicio    date,
  vigencia_fim       date,
  ordem              integer not null default 0,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  constraint diarias_valores_vigencia check (vigencia_inicio is null or vigencia_fim is null or vigencia_fim >= vigencia_inicio)
);
create index if not exists diarias_valores_idx on public.diarias_valores (orgao_id, ordem, grupo);


-- ---------------------------------------------------------------------
-- GATILHOS, REGRAS DE ACESSO (RLS) E PERMISSÕES DE LEITURA
--   Dados contábeis e de folha vêm dos sistemas do órgão: não têm rascunho;
--   ficam públicos ao gravar (quem grava precisa de "editar").
-- ---------------------------------------------------------------------
drop trigger if exists receitas_preparar on public.receitas;
create trigger receitas_preparar before insert or update on public.receitas for each row execute function public.preparar_financeiro();
drop trigger if exists receitas_naturezas_preparar on public.receitas_naturezas;
create trigger receitas_naturezas_preparar before insert or update on public.receitas_naturezas for each row execute function public.preparar_financeiro();
drop trigger if exists despesas_preparar on public.despesas;
create trigger despesas_preparar before insert or update on public.despesas for each row execute function public.preparar_financeiro();
drop trigger if exists despesas_validar on public.despesas;
create trigger despesas_validar before insert or update on public.despesas for each row execute function public.validar_despesa();
drop trigger if exists despesas_mov_validar on public.despesas_movimentos;
create trigger despesas_mov_validar before insert or update or delete on public.despesas_movimentos for each row execute function public.validar_movimento_despesa();
drop trigger if exists despesas_mov_totais on public.despesas_movimentos;
create trigger despesas_mov_totais after insert or update or delete on public.despesas_movimentos for each row execute function public.depois_movimento_despesa();
drop trigger if exists ordem_cronologica_validar on public.ordem_cronologica;
create trigger ordem_cronologica_validar before insert or update on public.ordem_cronologica for each row execute function public.validar_ordem_cronologica();
drop trigger if exists pessoal_terc_validar on public.pessoal_terceirizados;
create trigger pessoal_terc_validar before insert or update on public.pessoal_terceirizados for each row execute function public.validar_terceirizado();

do $$
declare
  t text;
  -- [tabela, módulo, exclusão exige]
  defs text[][] := array[
    ['receitas_naturezas', 'financeiro', 'editar'],
    ['receitas', 'financeiro', 'editar'],
    ['divida_ativa', 'financeiro', 'editar'],
    ['despesas', 'financeiro', 'excluir'],
    ['despesas_movimentos', 'financeiro', 'editar'],
    ['ordem_cronologica', 'financeiro', 'editar'],
    ['pessoal_vinculos', 'pessoal', 'editar'],
    ['pessoal_remuneracoes', 'pessoal', 'editar'],
    ['pessoal_cargos', 'pessoal', 'editar'],
    ['pessoal_estagiarios', 'pessoal', 'editar'],
    ['pessoal_terceirizados', 'pessoal', 'editar'],
    ['diarias', 'diarias', 'editar'],
    ['diarias_valores', 'diarias', 'editar']];
  d text[];
  cols text;
begin
  foreach d slice 1 in array defs loop
    t := d[1];
    execute format('alter table public.%I enable row level security', t);
    execute format('drop trigger if exists %1$s_atualizado on public.%1$I', t);
    execute format('create trigger %1$s_atualizado before update on public.%1$I for each row execute function public.marcar_atualizacao()', t);
    execute format('drop trigger if exists %1$s_historico on public.%1$I', t);
    execute format('create trigger %1$s_historico after insert or update or delete on public.%1$I for each row execute function public.registrar_historico_lista()', t);
    execute format('drop policy if exists "%1$s: leitura" on public.%1$I', t);
    execute format('create policy "%1$s: leitura" on public.%1$I for select to anon, authenticated using (true)', t);
    execute format('drop policy if exists "%1$s: inclusão" on public.%1$I', t);
    execute format('create policy "%1$s: inclusão" on public.%1$I for insert to authenticated with check (public.tem_permissao(orgao_id, %2$L, ''editar'') and public.no_alcance(orgao_id, null))', t, d[2]);
    execute format('drop policy if exists "%1$s: edição" on public.%1$I', t);
    execute format('create policy "%1$s: edição" on public.%1$I for update to authenticated using (public.tem_permissao(orgao_id, %2$L, ''editar'') and public.no_alcance(orgao_id, null)) with check (public.tem_permissao(orgao_id, %2$L, ''editar'') and public.no_alcance(orgao_id, null))', t, d[2]);
    execute format('drop policy if exists "%1$s: exclusão" on public.%1$I', t);
    execute format('create policy "%1$s: exclusão" on public.%1$I for delete to authenticated using (public.tem_permissao(orgao_id, %2$L, %3$L) and public.no_alcance(orgao_id, null))', t, d[2], d[3]);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    -- Visitante: todas as colunas, menos o CPF/CNPJ "cru" (fica só o mascarado e o resumo para busca).
    -- Em despesas_movimentos, "documento" é o nº da nota/ordem de pagamento (público).
    select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into cols
      from pg_attribute a where a.attrelid = ('public.' || t)::regclass and a.attnum > 0 and not a.attisdropped
       and a.attname <> 'credor_doc' and (a.attname <> 'documento' or t = 'despesas_movimentos');
    execute format('revoke select on public.%I from anon', t);
    execute format('grant select (%s) on public.%I to anon', cols, t);
  end loop;
end;
$$;

-- Posição de cada crédito na fila de pagamento: por exercício, categoria e fonte, em ordem de vencimento.
create or replace view public.ordem_cronologica_posicoes with (security_invoker = true) as
select o.id, o.orgao_id, o.categoria, o.fonte_codigo, o.fonte_nome, o.credor_nome, o.credor_doc_publico, o.documento_fiscal,
       o.empenho_numero, o.despesa_id, o.contrato_numero, o.contrato_id, o.objeto, o.data_exigibilidade, o.exercicio, o.data_pagamento,
       o.valor, o.fora_da_ordem, o.motivo_alteracao, o.justificativa, o.ato_justificativa, o.justificativa_url, o.busca, o.criado_em, o.atualizado_em,
       row_number() over (partition by o.orgao_id, o.exercicio, o.categoria, coalesce(o.fonte_codigo, '') order by o.data_exigibilidade, o.criado_em, o.id) as posicao
from public.ordem_cronologica o;
grant select on public.ordem_cronologica_posicoes to anon, authenticated;


-- ---------------------------------------------------------------------
-- 8. CONSULTAS DO SITE
-- ---------------------------------------------------------------------
-- Exercícios com dados (abas de ano do site e do painel).
create or replace function public.anos_financeiros(p_orgao uuid, p_tabela text)
returns table (ano integer, total bigint)
language plpgsql stable security invoker set search_path = public as $$
begin
  if p_tabela in ('receitas', 'divida_ativa', 'despesas', 'ordem_cronologica', 'pessoal_remuneracoes', 'pessoal_terceirizados', 'diarias') then
    return query execute format('select exercicio, count(*) from public.%I where orgao_id = $1 group by 1 order by 1 desc', p_tabela) using p_orgao;
  elsif p_tabela = 'pessoal_vinculos' then
    -- Ano em que a pessoa esteve no quadro (da admissão ao desligamento).
    return query select a::integer, count(*) from public.pessoal_vinculos v,
        generate_series(extract(year from v.data_admissao)::int, least(coalesce(extract(year from v.data_desligamento)::int, extract(year from current_date)::int), extract(year from current_date)::int)) a
      where v.orgao_id = p_orgao and a >= extract(year from current_date)::int - 15 group by 1 order by 1 desc;
  elsif p_tabela = 'pessoal_estagiarios' then
    return query select a::integer, count(*) from public.pessoal_estagiarios v,
        generate_series(extract(year from v.data_inicio)::int, least(extract(year from coalesce(v.data_desligamento, v.data_fim))::int, greatest(extract(year from current_date)::int, extract(year from v.data_inicio)::int))) a
      where v.orgao_id = p_orgao group by 1 order by 1 desc;
  else
    raise exception 'Tabela não prevista: %', p_tabela;
  end if;
end;
$$;
grant execute on function public.anos_financeiros(uuid, text) to anon, authenticated;

-- Nomes padronizados dos primeiros níveis da receita (Manual de Contabilidade
-- Aplicada ao Setor Público), usados quando o órgão não descreveu o nível.
create or replace function public.nome_padrao_receita(p_codigo text)
returns text language sql immutable set search_path = public as $$
  select case p_codigo
    when '1' then 'Receitas Correntes' when '2' then 'Receitas de Capital'
    when '7' then 'Receitas Correntes Intraorçamentárias' when '8' then 'Receitas de Capital Intraorçamentárias'
    when '9' then 'Deduções da Receita'
    when '1.1' then 'Impostos, Taxas e Contribuições de Melhoria' when '1.2' then 'Contribuições' when '1.3' then 'Receita Patrimonial'
    when '1.4' then 'Receita Agropecuária' when '1.5' then 'Receita Industrial' when '1.6' then 'Receita de Serviços'
    when '1.7' then 'Transferências Correntes' when '1.9' then 'Outras Receitas Correntes'
    when '2.1' then 'Operações de Crédito' when '2.2' then 'Alienação de Bens' when '2.3' then 'Amortização de Empréstimos'
    when '2.4' then 'Transferências de Capital' when '2.9' then 'Outras Receitas de Capital'
    when '1.1.1' then 'Impostos' when '1.1.2' then 'Taxas' when '1.1.3' then 'Contribuições de Melhoria'
    when '1.7.1' then 'Transferências da União e de suas Entidades' when '1.7.2' then 'Transferências dos Estados e do Distrito Federal e de suas Entidades'
    when '1.7.5' then 'Transferências de Outras Instituições Públicas'
    else null end;
$$;

-- 3.1 e 3.2: receita por nível da classificação, no período (meses de p_mes_ini a p_mes_fim).
--   Sem p_prefixo: 1º nível (categoria econômica). Com p_prefixo: o nível logo abaixo dele.
--   Com p_busca: as naturezas analíticas que contêm o texto (lista plana).
--   Previsto: a última posição até o fim do período; arrecadado: soma dos meses do período.
create or replace function public.receitas_niveis(p_orgao uuid, p_exercicio integer, p_mes_ini integer default 1, p_mes_fim integer default 12,
  p_prefixo text default null, p_busca text default null)
returns table (codigo text, descricao text, nivel integer, previsto_inicial numeric, previsto_atualizado numeric, arrecadado numeric, filhos bigint)
language sql stable security invoker set search_path = public as $$
  with base as (
    select r.* from public.receitas r
    where r.orgao_id = p_orgao and r.exercicio = p_exercicio and r.mes <= p_mes_fim
      and (p_prefixo is null or r.natureza_codigo = p_prefixo or r.natureza_codigo like p_prefixo || '.%')
      and (p_busca is null or r.busca like '%' || public.normalizar_texto(p_busca) || '%')
  ),
  ult as (
    select distinct on (b.natureza_codigo, coalesce(b.fonte_codigo, '')) b.natureza_codigo, b.fonte_codigo, b.previsto_inicial, b.previsto_atualizado
    from base b where b.previsto_inicial is not null or b.previsto_atualizado is not null
    order by b.natureza_codigo, coalesce(b.fonte_codigo, ''), b.mes desc
  ),
  arr as (
    select b.natureza_codigo, b.fonte_codigo, max(b.natureza_descricao) as descricao, sum(b.arrecadado) filter (where b.mes >= p_mes_ini) as arrecadado
    from base b group by 1, 2
  ),
  folhas as (
    select a.natureza_codigo as codigo, a.descricao, u.previsto_inicial, u.previsto_atualizado, coalesce(a.arrecadado, 0) as arrecadado,
           array_length(string_to_array(a.natureza_codigo, '.'), 1) as tam
    from arr a left join ult u on u.natureza_codigo = a.natureza_codigo and coalesce(u.fonte_codigo, '') = coalesce(a.fonte_codigo, '')
  ),
  alvo as (
    select case when p_busca is not null then null
                when p_prefixo is null then 1 else array_length(string_to_array(p_prefixo, '.'), 1) + 1 end as n
  ),
  agrup as (
    select case when alvo.n is null then f.codigo else array_to_string((string_to_array(f.codigo, '.'))[1:alvo.n], '.') end as codigo,
           f.codigo as folha, f.descricao, f.tam, alvo.n, f.previsto_inicial, f.previsto_atualizado, f.arrecadado
    from folhas f, alvo where alvo.n is null or f.tam >= alvo.n
  )
  select g.codigo,
         coalesce((select n.descricao from public.receitas_naturezas n where n.orgao_id = p_orgao and n.codigo = g.codigo),
                  max(g.descricao) filter (where g.folha = g.codigo), public.nome_padrao_receita(g.codigo)) as descricao,
         array_length(string_to_array(g.codigo, '.'), 1) as nivel,
         sum(g.previsto_inicial), sum(g.previsto_atualizado), sum(g.arrecadado),
         count(distinct case when g.n is not null and g.tam > g.n then array_to_string((string_to_array(g.folha, '.'))[1:g.n + 1], '.') end) as filhos
  from agrup g
  group by g.codigo
  order by g.codigo;
$$;
grant execute on function public.receitas_niveis(uuid, integer, integer, integer, text, text) to anon, authenticated;

-- Arrecadação mês a mês do exercício (3.1).
create or replace function public.receitas_mensal(p_orgao uuid, p_exercicio integer)
returns table (mes integer, arrecadado numeric, lancamentos bigint)
language sql stable security invoker set search_path = public as $$
  select r.mes, sum(r.arrecadado), count(*) from public.receitas r
  where r.orgao_id = p_orgao and r.exercicio = p_exercicio group by 1 order by 1;
$$;
grant execute on function public.receitas_mensal(uuid, integer) to anon, authenticated;

-- 4.1 e 4.2: empenhado, liquidado e pago no período (datas p_de a p_ate), agrupado por
-- p_agrupar: total, mes, unidade, funcao, subfuncao, programa, acao, categoria, grupo,
-- modalidade, elemento, fonte, credor. p_filtros: {unidade, funcao, subfuncao, programa, categoria,
-- grupo, elemento, fonte} (código exato).
create or replace function public.despesas_resumo(p_orgao uuid, p_exercicio integer, p_de date default null, p_ate date default null,
  p_agrupar text default 'total', p_filtros jsonb default '{}'::jsonb)
returns table (chave text, descricao text, empenhado numeric, liquidado numeric, pago numeric, empenhos bigint)
language sql stable security invoker set search_path = public as $$
  with d as (
    -- Colunas listadas (sem o CPF/CNPJ "cru", que o visitante não pode ler).
    select x.id, x.data_empenho, x.valor_empenhado, x.unidade_codigo, x.unidade_nome, x.funcao_codigo, x.subfuncao_codigo, x.subfuncao_nome,
           x.programa_codigo, x.programa_nome, x.acao_codigo, x.acao_nome, x.categoria, x.grupo, x.modalidade_aplicacao, x.elemento,
           x.natureza_nome, x.fonte_codigo, x.fonte_nome, x.credor_nome, x.credor_doc_publico
    from public.despesas x
    where x.orgao_id = p_orgao and x.exercicio = p_exercicio
      and (p_filtros ->> 'unidade' is null or coalesce(x.unidade_codigo, x.unidade_nome) = p_filtros ->> 'unidade')
      and (p_filtros ->> 'funcao' is null or x.funcao_codigo = p_filtros ->> 'funcao')
      and (p_filtros ->> 'subfuncao' is null or x.subfuncao_codigo = p_filtros ->> 'subfuncao')
      and (p_filtros ->> 'programa' is null or x.programa_codigo = p_filtros ->> 'programa')
      and (p_filtros ->> 'categoria' is null or x.categoria = p_filtros ->> 'categoria')
      and (p_filtros ->> 'grupo' is null or x.grupo = p_filtros ->> 'grupo')
      and (p_filtros ->> 'elemento' is null or x.elemento = p_filtros ->> 'elemento')
      and (p_filtros ->> 'fonte' is null or x.fonte_codigo = p_filtros ->> 'fonte')
  ),
  ev as (
    select d.id, d.data_empenho as data, d.valor_empenhado as emp, 0::numeric as liq, 0::numeric as pag from d
    union all
    select m.despesa_id, m.data,
           case m.tipo when 'reforco' then m.valor when 'anulacao' then -m.valor else 0 end,
           case m.tipo when 'liquidacao' then m.valor when 'estorno_liquidacao' then -m.valor else 0 end,
           case m.tipo when 'pagamento' then m.valor when 'estorno_pagamento' then -m.valor else 0 end
    from public.despesas_movimentos m join d on d.id = m.despesa_id
  ),
  j as (
    select ev.*, d.unidade_codigo, d.unidade_nome, d.funcao_codigo, d.subfuncao_codigo, d.subfuncao_nome, d.programa_codigo, d.programa_nome,
           d.acao_codigo, d.acao_nome, d.categoria, d.grupo, d.modalidade_aplicacao, d.elemento, d.natureza_nome, d.fonte_codigo, d.fonte_nome,
           d.credor_nome, d.credor_doc_publico
    from ev join d on d.id = ev.id
    where (p_de is null or ev.data >= p_de) and (p_ate is null or ev.data <= p_ate)
  )
  select case p_agrupar
           when 'mes' then to_char(j.data, 'MM')
           when 'unidade' then coalesce(j.unidade_codigo, j.unidade_nome, '')
           when 'funcao' then coalesce(j.funcao_codigo, '')
           when 'subfuncao' then coalesce(j.subfuncao_codigo, '')
           when 'programa' then coalesce(j.programa_codigo, '')
           when 'acao' then coalesce(j.acao_codigo, '')
           when 'categoria' then j.categoria
           when 'grupo' then j.grupo
           when 'modalidade' then j.grupo || j.modalidade_aplicacao
           when 'elemento' then j.grupo || j.modalidade_aplicacao || j.elemento
           when 'fonte' then coalesce(j.fonte_codigo, '')
           when 'credor' then j.credor_nome || coalesce(' · ' || j.credor_doc_publico, '')
           else 'total' end as chave,
         max(case p_agrupar
           when 'unidade' then j.unidade_nome when 'subfuncao' then j.subfuncao_nome when 'programa' then j.programa_nome
           when 'acao' then j.acao_nome when 'elemento' then j.natureza_nome when 'fonte' then j.fonte_nome end) as descricao,
         sum(j.emp), sum(j.liq), sum(j.pag), count(distinct j.id)
  from j
  group by 1
  order by 1;
$$;
grant execute on function public.despesas_resumo(uuid, integer, date, date, text, jsonb) to anon, authenticated;

-- Opções dos filtros da despesa (códigos e nomes que existem no exercício).
create or replace function public.despesas_opcoes(p_orgao uuid, p_exercicio integer)
returns table (campo text, codigo text, nome text)
language sql stable security invoker set search_path = public as $$
  select 'unidade', coalesce(unidade_codigo, unidade_nome), max(unidade_nome) from public.despesas where orgao_id = p_orgao and exercicio = p_exercicio and coalesce(unidade_codigo, unidade_nome) is not null group by 2
  union all select 'funcao', funcao_codigo, null from public.despesas where orgao_id = p_orgao and exercicio = p_exercicio and funcao_codigo is not null group by 2
  union all select 'subfuncao', subfuncao_codigo, max(subfuncao_nome) from public.despesas where orgao_id = p_orgao and exercicio = p_exercicio and subfuncao_codigo is not null group by 2
  union all select 'programa', programa_codigo, max(programa_nome) from public.despesas where orgao_id = p_orgao and exercicio = p_exercicio and programa_codigo is not null group by 2
  union all select 'categoria', categoria, null from public.despesas where orgao_id = p_orgao and exercicio = p_exercicio and categoria <> '' group by 2
  union all select 'grupo', grupo, null from public.despesas where orgao_id = p_orgao and exercicio = p_exercicio and grupo <> '' group by 2
  union all select 'elemento', elemento, max(natureza_nome) from public.despesas where orgao_id = p_orgao and exercicio = p_exercicio and elemento <> '' group by 2
  union all select 'fonte', fonte_codigo, max(fonte_nome) from public.despesas where orgao_id = p_orgao and exercicio = p_exercicio and fonte_codigo is not null group by 2
  order by 1, 2;
$$;
grant execute on function public.despesas_opcoes(uuid, integer) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 9. AVISOS DE DADOS DESATUALIZADOS (somados por pendencias_atualizacao, script 21)
--    Parte com link externo (Destinos das páginas) ou declarada "não há" não gera aviso.
-- ---------------------------------------------------------------------
create or replace function public.pendencias_financeiras(p_orgao uuid)
returns table (modulo text, nivel text, mensagem text, quantidade bigint)
language plpgsql stable security invoker set search_path = public as $$
declare
  hoje date := current_date;
  v_ano int := extract(year from current_date)::int;
  fora text[];
  exec boolean;
  ult date;
  -- Fim do último mês lançado: dados de até 30 dias pedem que ele seja >= hoje − 30.
  fim_mes text := '(make_date(%1$s, %2$s, 1) + interval ''1 month'' - interval ''1 day'')::date';
begin
  if not public.e_membro(p_orgao) then return; end if;
  select coalesce(array_agg(x), '{}') into fora from (
    select x from public.partes_sem_dados(p_orgao) x
    union
    select k from public.orgaos o, jsonb_each_text(coalesce(o.configuracoes -> 'destinos', '{}'::jsonb)) as d(k, v)
    where o.id = p_orgao and coalesce(d.v, '') <> '') t;
  if 'receitas' = any (fora) then fora := fora || array['receitas_arrecadacao', 'receitas_divida_ativa']; end if;
  if 'despesas' = any (fora) then fora := fora || array['despesas_empenhos']; end if;
  if 'pessoal' = any (fora) then fora := fora || array['pessoal_servidores', 'pessoal_remuneracao', 'pessoal_cargos', 'pessoal_estagiarios', 'pessoal_terceirizados']; end if;
  if 'diarias' = any (fora) then fora := fora || array['diarias_concedidas', 'diarias_tabela']; end if;
  select o.tipo = 'prefeitura' into exec from public.orgaos o where o.id = p_orgao;

  -- 3.1: arrecadação do último mês.
  if not ('receitas_arrecadacao' = any (fora)) then
    select max((make_date(r.exercicio, r.mes, 1) + interval '1 month' - interval '1 day')::date) into ult from public.receitas r where r.orgao_id = p_orgao;
    return query select 'financeiro', 'alerta',
        case when ult is null then 'nenhuma receita lançada (PNTP 3.1): cadastre a previsão e a arrecadação mês a mês.'
             else 'a arrecadação está lançada só até ' || to_char(ult, 'MM/YYYY') || ' (PNTP 3.1 pede dados de até 30 dias).' end, 1::bigint
      where ult is null or ult < hoje - 30;
  end if;

  -- 3.3: inscritos em dívida ativa até o último exercício encerrado (Poder Executivo).
  if coalesce(exec, false) and not ('receitas_divida_ativa' = any (fora)) then
    return query select 'financeiro', 'alerta', 'falta a relação dos inscritos em dívida ativa de ' || (v_ano - 1) || ' (PNTP 3.3).', 1::bigint
      where not exists (select 1 from public.divida_ativa d where d.orgao_id = p_orgao and d.exercicio = v_ano - 1);
  end if;

  -- 4.1 a 4.3: empenhos, liquidações e pagamentos dos últimos 30 dias.
  if not ('despesas_empenhos' = any (fora)) then
    select max(d.ultima_movimentacao) into ult from public.despesas d where d.orgao_id = p_orgao;
    return query select 'financeiro', 'alerta',
        case when ult is null then 'nenhum empenho lançado (PNTP 4.1 a 4.3).'
             else 'o último empenho, liquidação ou pagamento lançado é de ' || to_char(ult, 'DD/MM/YYYY') || ' (PNTP 4.1 a 4.3 pedem dados de até 30 dias).' end, 1::bigint
      where ult is null or ult < hoje - 30;
    return query select 'financeiro', 'info', 'empenho(s) de licitação, dispensa ou inexigibilidade sem o número do processo (PNTP 4.3).', count(*)
      from public.despesas d where d.orgao_id = p_orgao and d.exercicio >= v_ano - 1
        and (d.modalidade is null or (d.modalidade <> 'nao_se_aplica' and d.licitacao_numero is null and d.licitacao_id is null))
      having count(*) > 0;
  end if;

  -- 9.4: ordem cronológica publicada mês a mês.
  if not ('ordem_cronologica' = any (fora)) then
    select max(coalesce(o.data_pagamento, o.data_exigibilidade)) into ult from public.ordem_cronologica o where o.orgao_id = p_orgao;
    return query select 'financeiro', 'alerta',
        case when ult is null then 'nenhum pagamento na ordem cronológica (PNTP 9.4): publique a fila mês a mês.'
             else 'a ordem cronológica de pagamentos está lançada só até ' || to_char(ult, 'DD/MM/YYYY') || ' (PNTP 9.4: publicação mensal).' end, 1::bigint
      where ult is null or ult < hoje - 30;
  end if;

  -- 6.1: relação de servidores.
  if not ('pessoal_servidores' = any (fora)) then
    return query select 'pessoal', 'alerta',
        case when max(v.atualizado_em) is null then 'nenhum servidor cadastrado (PNTP 6.1).'
             else 'a relação de servidores não é atualizada desde ' || to_char(max(v.atualizado_em), 'DD/MM/YYYY') || ' (PNTP 6.1 pede dados de até 30 dias).' end, 1::bigint
      from public.pessoal_vinculos v where v.orgao_id = p_orgao
      having max(v.atualizado_em) is null or max(v.atualizado_em) < now() - interval '30 days';
  end if;

  -- 6.2: folha do último mês.
  if not ('pessoal_remuneracao' = any (fora)) then
    select max((make_date(r.exercicio, r.mes, 1) + interval '1 month' - interval '1 day')::date) into ult from public.pessoal_remuneracoes r where r.orgao_id = p_orgao;
    return query select 'pessoal', 'alerta',
        case when ult is null then 'nenhuma remuneração lançada (PNTP 6.2).'
             else 'a remuneração está lançada só até ' || to_char(ult, 'MM/YYYY') || ' (PNTP 6.2 pede dados de até 30 dias).' end, 1::bigint
      where ult is null or ult < hoje - 30;
  end if;

  -- 6.3: tabela de cargos e salários; com mais de 1 ano, o site precisa dizer que é a vigente.
  if not ('pessoal_cargos' = any (fora)) then
    return query select 'pessoal', 'alerta', 'falta a tabela de cargos e salários (padrão remuneratório, PNTP 6.3).', 1::bigint
      where not exists (select 1 from public.pessoal_cargos c where c.orgao_id = p_orgao);
    return query select 'pessoal', 'info', 'a tabela de cargos e salários não muda há mais de 1 ano: confirme na aba Cargos e salários que é a vigente em ' || v_ano || ' (PNTP 6.3).', 1::bigint
      where exists (select 1 from public.pessoal_cargos c where c.orgao_id = p_orgao)
        and (select max(c.atualizado_em) from public.pessoal_cargos c where c.orgao_id = p_orgao) < now() - interval '1 year'
        and not exists (select 1 from public.secoes_setoriais s where s.orgao_id = p_orgao and s.secao = 'pessoal_cargos'
                          and coalesce(char_length(s.texto), 0) >= 10 and s.atualizado_em >= now() - interval '1 year');
  end if;

  if not ('pessoal_estagiarios' = any (fora)) then
    return query select 'pessoal', 'info', 'nenhum estagiário cadastrado (PNTP 6.4). Se o órgão não tem estagiários, declare "não há" na aba Estagiários.', 1::bigint
      where not exists (select 1 from public.pessoal_estagiarios e where e.orgao_id = p_orgao);
  end if;

  if not ('pessoal_terceirizados' = any (fora)) then
    return query select 'pessoal', 'info', 'nenhum terceirizado cadastrado em ' || v_ano || ' (PNTP 6.5). Se não há, declare "não há" na aba Terceirizados.', 1::bigint
      where not exists (select 1 from public.pessoal_terceirizados e where e.orgao_id = p_orgao and e.exercicio = v_ano);
  end if;

  -- 7.1 e 7.2: diárias.
  if not ('diarias_concedidas' = any (fora)) then
    select max(greatest(d.data_inicio, d.atualizado_em::date)) into ult from public.diarias d where d.orgao_id = p_orgao;
    return query select 'diarias', case when ult is null then 'alerta' else 'info' end,
        case when ult is null then 'nenhuma diária cadastrada (PNTP 7.1). Se o órgão não pagou diárias, declare "não há" na aba Diárias concedidas.'
             else 'nenhuma diária lançada desde ' || to_char(ult, 'DD/MM/YYYY') || ': confira se houve diárias pagas depois (PNTP 7.1 pede dados de até 30 dias).' end, 1::bigint
      where ult is null or ult < hoje - 30;
  end if;

  if not ('diarias_tabela' = any (fora)) then
    return query select 'diarias', 'alerta', 'falta a tabela de valores das diárias (PNTP 7.2).', 1::bigint
      where not exists (select 1 from public.diarias_valores v where v.orgao_id = p_orgao);
    return query select 'diarias', 'info', 'a tabela de diárias não tem valor para o exterior: escreva na aba Tabela de valores que não há previsão de diárias internacionais (PNTP 7.2).', 1::bigint
      where exists (select 1 from public.diarias_valores v where v.orgao_id = p_orgao)
        and not exists (select 1 from public.diarias_valores v where v.orgao_id = p_orgao and v.abrangencia = 'exterior')
        and not exists (select 1 from public.secoes_setoriais s where s.orgao_id = p_orgao and s.secao = 'diarias_tabela' and coalesce(char_length(s.texto), 0) >= 10);
  end if;
end;
$$;
grant execute on function public.pendencias_financeiras(uuid) to authenticated;
