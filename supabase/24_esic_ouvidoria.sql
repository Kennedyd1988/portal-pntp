-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 24 — Fase 3 · Atendimento: e-SIC (PNTP 12.1 a 12.9) e
--             Ouvidoria (14.1 e 14.2)
--
--   1. Módulos "esic" (e-SIC, acesso à informação) e "ouvidoria", com as
--      permissões copiadas do antigo "atendimento" (que nunca teve tela e
--      sai do catálogo).
--   2. atendimento_canais: um registro por órgão e canal com a unidade e o
--      responsável (12.1), endereço, telefone, e-mail e horário (12.2, 14.1),
--      o endereço do formulário eletrônico (12.3, 14.2), as instruções, os
--      prazos de resposta e de recurso, as autoridades e o procedimento do
--      recurso (12.6) e a norma local que regulamenta a LAI (12.5) ou que
--      institui a ouvidoria. O endereço do formulário que estava em
--      Aparência (esic_url / ouvidoria_url) é copiado para cá.
--   3. atendimento_relatorios (+ itens): relatório estatístico por exercício
--      (ou semestre, trimestre, mês) — pedidos recebidos, atendidos,
--      parcialmente atendidos, indeferidos, em tramitação, recursos, prazo
--      médio e perfil dos solicitantes (12.7); manifestações por tipo e
--      situação na ouvidoria (Lei 13.460/2017, arts. 14 e 15). Rascunho →
--      publicado.
--   4. informacoes_classificadas: rol das informações classificadas por grau
--      de sigilo, com assunto, grau, fundamento e prazo (12.8), e das
--      desclassificadas, com a data e o motivo (12.9). O banco confere o prazo
--      máximo de cada grau (LAI, art. 24, § 1º: 25, 15 e 5 anos).
--   5. Regras de acesso: tudo do órgão inteiro (sem alcance setorial); o site
--      lê os canais e o que estiver publicado.
--   6. atendimento_anos: exercícios com dados (abas de ano).
--   7. pendencias_atendimento: avisos de prazo (chamada pelo script 21).
--
-- Declarações de que não há dados: partes esic_relatorios,
-- esic_classificadas, esic_desclassificadas e ouvidoria_relatorios (script
-- 23 atualizado). Link externo de cada parte: Aparência › Destinos das
-- páginas.
--
-- Como usar: SQL Editor › New query › colar tudo › Run. Pode repetir.
-- Rodar DEPOIS dos scripts 01 a 23, com o 21 e o 23 atualizados em
-- 13/11/2026 (v0.17.0): rodar o 21, o 23 e depois este.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. MÓDULOS E PERMISSÕES
-- ---------------------------------------------------------------------
insert into public.modulos (codigo, nome, grupo, ordem) values
  ('esic', 'e-SIC (acesso à informação)', 'Atendimento', 110),
  ('ouvidoria', 'Ouvidoria', 'Atendimento', 111)
on conflict (codigo) do nothing;

insert into public.perfil_permissoes (perfil_id, modulo, pode_ver, pode_editar, pode_publicar, pode_excluir)
select pp.perfil_id, m.codigo, pp.pode_ver, pp.pode_editar, pp.pode_publicar, pp.pode_excluir
from public.perfil_permissoes pp cross join (values ('esic'), ('ouvidoria')) as m(codigo)
where pp.modulo = 'atendimento'
on conflict (perfil_id, modulo) do nothing;

delete from public.modulos where codigo = 'atendimento';


-- ---------------------------------------------------------------------
-- 2. CANAIS DE ATENDIMENTO (um por órgão e canal)
-- ---------------------------------------------------------------------
create table if not exists public.atendimento_canais (
  id                    uuid primary key default gen_random_uuid(),
  orgao_id              uuid not null references public.orgaos(id) on delete cascade,
  canal                 text not null check (canal in ('esic', 'ouvidoria')),
  -- 12.1: unidade responsável (cadastro de unidades) ou, sem ela, o nome do setor.
  unidade_id            uuid references public.unidades(id) on delete set null,
  setor                 text check (setor is null or char_length(setor) <= 200),
  responsavel_nome      text check (responsavel_nome is null or char_length(responsavel_nome) <= 200),
  responsavel_cargo     text check (responsavel_cargo is null or char_length(responsavel_cargo) <= 150),
  responsavel_ato       text check (responsavel_ato is null or char_length(responsavel_ato) <= 200),   -- ex.: Portaria nº 12/2026
  -- 12.2 / 14.1: atendimento presencial. Em branco: o site usa o da unidade.
  endereco              text check (endereco is null or char_length(endereco) <= 300),
  telefone              text check (telefone is null or char_length(telefone) <= 80),
  email                 text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  horario               text check (horario is null or char_length(horario) <= 200),
  -- 12.3 / 14.2: formulário eletrônico (e-SIC próprio, Fala.BR ou sistema de ouvidoria).
  canal_url             text check (canal_url is null or canal_url ~* '^https?://'),
  outros_canais         text check (outros_canais is null or char_length(outros_canais) <= 1000), -- WhatsApp, carta, urna…
  instrucoes            text check (instrucoes is null or char_length(instrucoes) <= 8000),      -- marcação simples
  -- 12.6: prazos, autoridades e procedimento do recurso (na ouvidoria, só o prazo de resposta).
  prazo_resposta        text check (prazo_resposta is null or char_length(prazo_resposta) <= 500),
  prazo_recurso         text check (prazo_recurso is null or char_length(prazo_recurso) <= 500),
  prazo_decisao_recurso text check (prazo_decisao_recurso is null or char_length(prazo_decisao_recurso) <= 500),
  autoridade_recurso_1  text check (autoridade_recurso_1 is null or char_length(autoridade_recurso_1) <= 300),
  autoridade_recurso_2  text check (autoridade_recurso_2 is null or char_length(autoridade_recurso_2) <= 300),
  procedimento_recurso  text check (procedimento_recurso is null or char_length(procedimento_recurso) <= 8000),
  -- 12.5: norma local que regulamenta a LAI (ouvidoria: norma que a institui).
  norma_publicacao      uuid references public.publicacoes(id) on delete set null,
  norma_texto           text check (norma_texto is null or char_length(norma_texto) <= 200),
  norma_url             text check (norma_url is null or norma_url ~* '^https?://'),
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  constraint atendimento_canais_uk unique (orgao_id, canal),
  constraint atendimento_canais_recurso check (canal = 'esic' or (prazo_recurso is null and prazo_decisao_recurso is null
                                               and autoridade_recurso_1 is null and autoridade_recurso_2 is null and procedimento_recurso is null))
);

-- Unidade e norma precisam ser do mesmo órgão.
create or replace function public.conferir_atendimento_canal()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.unidade_id is not null and not exists (select 1 from public.unidades u where u.id = new.unidade_id and u.orgao_id = new.orgao_id) then
    raise exception 'A unidade escolhida não é deste órgão.';
  end if;
  if new.norma_publicacao is not null and not exists (select 1 from public.publicacoes p where p.id = new.norma_publicacao and p.orgao_id = new.orgao_id) then
    raise exception 'A publicação escolhida não é deste órgão.';
  end if;
  new.setor := nullif(btrim(new.setor), '');
  return new;
end;
$$;
drop trigger if exists atendimento_canais_conferir on public.atendimento_canais;
create trigger atendimento_canais_conferir before insert or update on public.atendimento_canais
  for each row execute function public.conferir_atendimento_canal();
drop trigger if exists atendimento_canais_atualizado on public.atendimento_canais;
create trigger atendimento_canais_atualizado before update on public.atendimento_canais
  for each row execute function public.marcar_atualizacao();
drop trigger if exists atendimento_canais_historico on public.atendimento_canais;
create trigger atendimento_canais_historico after insert or update or delete on public.atendimento_canais
  for each row execute function public.registrar_historico();

-- O endereço do formulário que estava em Aparência › Diário Oficial e sistemas vem para cá
-- (só na primeira vez: depois, vale o que estiver no módulo).
insert into public.atendimento_canais (orgao_id, canal, canal_url)
select o.id, c.canal, o.configuracoes ->> c.chave
from public.orgaos o cross join (values ('esic', 'esic_url'), ('ouvidoria', 'ouvidoria_url')) as c(canal, chave)
where coalesce(o.configuracoes ->> c.chave, '') ~* '^https?://'
on conflict (orgao_id, canal) do nothing;


-- ---------------------------------------------------------------------
-- 3. RELATÓRIOS ESTATÍSTICOS (12.7 e ouvidoria)
-- ---------------------------------------------------------------------
create table if not exists public.atendimento_relatorios (
  id               uuid primary key default gen_random_uuid(),
  orgao_id         uuid not null references public.orgaos(id) on delete cascade,
  canal            text not null check (canal in ('esic', 'ouvidoria')),
  exercicio        integer not null check (exercicio between 2012 and 2100),       -- a LAI vale desde 2012
  abrangencia      text not null default 'ano' check (abrangencia in ('ano', 'semestre', 'trimestre', 'mes')),
  numero           integer check (numero is null or numero between 1 and 12),
  -- Pedidos (e-SIC) ou manifestações (ouvidoria) do período
  recebidos        integer not null default 0 check (recebidos >= 0),
  atendidos        integer check (atendidos is null or atendidos >= 0),             -- e-SIC: deferidos · ouvidoria: respondidas/concluídas
  parciais         integer check (parciais is null or parciais >= 0),               -- e-SIC: parcialmente deferidos
  indeferidos      integer check (indeferidos is null or indeferidos >= 0),         -- e-SIC: negados · ouvidoria: arquivadas/não conhecidas
  em_andamento     integer check (em_andamento is null or em_andamento >= 0),
  outros           integer check (outros is null or outros >= 0),                   -- não se trata de pedido de informação, fora da competência…
  recursos_1       integer check (recursos_1 is null or recursos_1 >= 0),           -- recursos em 1ª instância
  recursos_2       integer check (recursos_2 is null or recursos_2 >= 0),           -- recursos em 2ª instância
  prazo_medio_dias numeric(6, 1) check (prazo_medio_dias is null or prazo_medio_dias >= 0),
  -- e-SIC: perfil dos solicitantes (12.7 pede "informações genéricas sobre os solicitantes")
  pessoas_fisicas   integer check (pessoas_fisicas is null or pessoas_fisicas >= 0),
  pessoas_juridicas integer check (pessoas_juridicas is null or pessoas_juridicas >= 0),
  sexo_feminino     integer check (sexo_feminino is null or sexo_feminino >= 0),
  sexo_masculino    integer check (sexo_masculino is null or sexo_masculino >= 0),
  sexo_nao_informado integer check (sexo_nao_informado is null or sexo_nao_informado >= 0),
  -- Ouvidoria: manifestações por tipo (Lei 13.460/2017, art. 2º, V, e Decreto 9.492/2018)
  reclamacoes      integer check (reclamacoes is null or reclamacoes >= 0),
  denuncias        integer check (denuncias is null or denuncias >= 0),
  sugestoes        integer check (sugestoes is null or sugestoes >= 0),
  elogios          integer check (elogios is null or elogios >= 0),
  solicitacoes     integer check (solicitacoes is null or solicitacoes >= 0),
  simplifique      integer check (simplifique is null or simplifique >= 0),
  observacao       text check (observacao is null or char_length(observacao) <= 4000),
  arquivo_url      text,                                                            -- relatório completo (PDF)
  link_externo     text check (link_externo is null or link_externo ~* '^https?://'),
  data_inicio      date,                                                            -- calculadas pelo banco
  data_fim         date,
  situacao         text not null default 'rascunho' check (situacao in ('rascunho', 'publicado')),
  publicado_em     timestamptz,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  constraint atendimento_relatorios_tipos check (canal = 'ouvidoria' or (reclamacoes is null and denuncias is null and sugestoes is null
                                                 and elogios is null and solicitacoes is null and simplifique is null)),
  constraint atendimento_relatorios_perfil check (canal = 'esic' or (pessoas_fisicas is null and pessoas_juridicas is null and sexo_feminino is null
                                                  and sexo_masculino is null and sexo_nao_informado is null and recursos_1 is null and recursos_2 is null))
);
create unique index if not exists atendimento_relatorios_uk on public.atendimento_relatorios (orgao_id, canal, exercicio, abrangencia, coalesce(numero, 0));
create index if not exists atendimento_relatorios_lista_idx on public.atendimento_relatorios (orgao_id, canal, exercicio desc, data_inicio desc, id desc);

-- Outras distribuições do relatório (faixa etária, escolaridade, assunto, unidade, motivo da negativa…).
create table if not exists public.atendimento_relatorios_itens (
  id            uuid primary key default gen_random_uuid(),
  orgao_id      uuid not null references public.orgaos(id) on delete cascade,
  relatorio_id  uuid not null references public.atendimento_relatorios(id) on delete cascade,
  dimensao      text not null check (dimensao in ('faixa_etaria', 'escolaridade', 'profissao', 'localidade', 'meio', 'assunto',
                                                  'unidade', 'motivo_negativa', 'outra')),
  item          text not null check (char_length(item) between 1 and 200),
  quantidade    integer not null check (quantidade >= 0),
  ordem         integer not null default 0,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists atendimento_relatorios_itens_idx on public.atendimento_relatorios_itens (relatorio_id, dimensao, ordem);

-- Período do relatório: o banco confere o número e calcula as datas (como nas declarações).
create or replace function public.preparar_relatorio_atendimento()
returns trigger language plpgsql set search_path = public as $$
declare
  meses int := case new.abrangencia when 'mes' then 1 when 'trimestre' then 3 when 'semestre' then 6 else 12 end;
begin
  if new.abrangencia = 'ano' then new.numero := null;
  elsif new.numero is null or new.numero < 1 or new.numero > 12 / meses then
    raise exception 'Escolha o % (de 1 a %).', case new.abrangencia when 'mes' then 'mês' else new.abrangencia end, 12 / meses;
  end if;
  new.data_inicio := make_date(new.exercicio, (coalesce(new.numero, 1) - 1) * meses + 1, 1);
  new.data_fim := (new.data_inicio + make_interval(months => meses) - interval '1 day')::date;
  if new.situacao = 'publicado' and new.data_inicio > current_date then
    raise exception 'O período do relatório ainda não começou.';
  end if;
  return new;
end;
$$;
drop trigger if exists atendimento_relatorios_preparar on public.atendimento_relatorios;
create trigger atendimento_relatorios_preparar before insert or update on public.atendimento_relatorios
  for each row execute function public.preparar_relatorio_atendimento();

-- Item do mesmo órgão do relatório.
create or replace function public.conferir_item_relatorio()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from public.atendimento_relatorios r where r.id = new.relatorio_id and r.orgao_id = new.orgao_id) then
    raise exception 'Relatório não encontrado neste órgão.';
  end if;
  new.item := btrim(new.item);
  return new;
end;
$$;
drop trigger if exists atendimento_relatorios_itens_conferir on public.atendimento_relatorios_itens;
create trigger atendimento_relatorios_itens_conferir before insert or update on public.atendimento_relatorios_itens
  for each row execute function public.conferir_item_relatorio();


-- ---------------------------------------------------------------------
-- 4. INFORMAÇÕES CLASSIFICADAS E DESCLASSIFICADAS (12.8 e 12.9)
-- ---------------------------------------------------------------------
create table if not exists public.informacoes_classificadas (
  id                    uuid primary key default gen_random_uuid(),
  orgao_id              uuid not null references public.orgaos(id) on delete cascade,
  codigo                text check (codigo is null or char_length(codigo) <= 100),        -- código de indexação / NUP
  assunto               text not null check (char_length(assunto) between 5 and 1000),   -- resumo, sem revelar o conteúdo sigiloso
  grau                  text not null check (grau in ('ultrassecreto', 'secreto', 'reservado')),
  fundamento            text not null check (char_length(fundamento) between 3 and 300),  -- ex.: Lei 12.527/2011, art. 23, VIII
  unidade               text check (unidade is null or char_length(unidade) <= 200),      -- unidade que produziu/guarda
  autoridade            text check (autoridade is null or char_length(autoridade) <= 200), -- autoridade classificadora
  data_classificacao    date not null,
  prazo_fim             date,                                                             -- fim do sigilo (data)
  evento_fim            text check (evento_fim is null or char_length(evento_fim) <= 300), -- ou o evento que encerra o sigilo
  data_desclassificacao date,
  motivo_desclassificacao text check (motivo_desclassificacao is null or motivo_desclassificacao in ('prazo', 'evento', 'reavaliacao', 'recurso', 'outro')),
  observacao            text check (observacao is null or char_length(observacao) <= 2000),
  exercicio             integer,                                                          -- ano da classificação (pelo banco)
  ano_desclassificacao  integer,                                                          -- (pelo banco)
  situacao              text not null default 'rascunho' check (situacao in ('rascunho', 'publicado')),
  publicado_em          timestamptz,
  busca                 text generated always as (public.normalizar_texto(
                          coalesce(codigo, '') || ' ' || assunto || ' ' || grau || ' ' || fundamento || ' ' ||
                          coalesce(unidade, '') || ' ' || coalesce(autoridade, ''))) stored,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  constraint informacoes_classificadas_prazo check (prazo_fim is not null or evento_fim is not null),
  constraint informacoes_classificadas_datas check (prazo_fim is null or prazo_fim > data_classificacao),
  constraint informacoes_classificadas_desc check (data_desclassificacao is null or data_desclassificacao >= data_classificacao),
  constraint informacoes_classificadas_motivo check ((data_desclassificacao is null) = (motivo_desclassificacao is null))
);
create index if not exists informacoes_classificadas_idx on public.informacoes_classificadas (orgao_id, exercicio desc, data_classificacao desc, id desc);
create index if not exists informacoes_classificadas_desc_idx on public.informacoes_classificadas (orgao_id, ano_desclassificacao desc, data_desclassificacao desc, id desc);

-- Anos pelo banco e prazo máximo de cada grau (LAI, art. 24, § 1º).
create or replace function public.preparar_informacao_classificada()
returns trigger language plpgsql set search_path = public as $$
declare
  anos int := case new.grau when 'ultrassecreto' then 25 when 'secreto' then 15 else 5 end;
begin
  if new.prazo_fim is not null and new.prazo_fim > (new.data_classificacao + make_interval(years => anos))::date then
    raise exception 'O prazo máximo do grau % é de % anos (LAI, art. 24, § 1º): até %.', new.grau, anos,
      to_char(new.data_classificacao + make_interval(years => anos), 'DD/MM/YYYY');
  end if;
  if new.data_desclassificacao is not null and new.data_desclassificacao > current_date then
    raise exception 'A data da desclassificação não pode ser futura.';
  end if;
  new.exercicio := extract(year from new.data_classificacao)::int;
  new.ano_desclassificacao := extract(year from new.data_desclassificacao)::int;
  return new;
end;
$$;
drop trigger if exists informacoes_classificadas_preparar on public.informacoes_classificadas;
create trigger informacoes_classificadas_preparar before insert or update on public.informacoes_classificadas
  for each row execute function public.preparar_informacao_classificada();


-- ---------------------------------------------------------------------
-- 5. RASCUNHO → PUBLICADO, ATUALIZAÇÃO E HISTÓRICO
-- ---------------------------------------------------------------------
-- Relatórios: a permissão de publicar é a do módulo do canal (esic ou ouvidoria).
create or replace function public.controlar_publicacao_canal()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated')
     and (new.situacao = 'publicado' or (tg_op = 'UPDATE' and old.situacao = 'publicado'))
     and not public.tem_permissao(new.orgao_id, new.canal, 'publicar') then
    raise exception 'Seu perfil não pode publicar nem alterar o que já está publicado. Salve como rascunho e peça a quem aprova.';
  end if;
  if tg_op = 'UPDATE' and new.canal is distinct from old.canal then raise exception 'O canal do relatório não pode mudar.'; end if;
  if new.situacao = 'publicado' and new.publicado_em is null then new.publicado_em := now(); end if;
  return new;
end;
$$;
drop trigger if exists atendimento_relatorios_publicacao on public.atendimento_relatorios;
create trigger atendimento_relatorios_publicacao before insert or update on public.atendimento_relatorios
  for each row execute function public.controlar_publicacao_canal();
drop trigger if exists informacoes_classificadas_publicacao on public.informacoes_classificadas;
create trigger informacoes_classificadas_publicacao before insert or update on public.informacoes_classificadas
  for each row execute function public.controlar_publicacao('esic');

do $$
declare t text;
begin
  foreach t in array array['atendimento_relatorios', 'atendimento_relatorios_itens', 'informacoes_classificadas'] loop
    execute format('drop trigger if exists %1$s_atualizado on public.%1$I', t);
    execute format('create trigger %1$s_atualizado before update on public.%1$I for each row execute function public.marcar_atualizacao()', t);
    execute format('drop trigger if exists %1$s_historico on public.%1$I', t);
    execute format('create trigger %1$s_historico after insert or update or delete on public.%1$I for each row execute function public.registrar_historico()', t);
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 6. REGRAS DE ACESSO (órgão todo, sem alcance setorial)
-- ---------------------------------------------------------------------
alter table public.atendimento_canais enable row level security;
alter table public.atendimento_relatorios enable row level security;
alter table public.atendimento_relatorios_itens enable row level security;
alter table public.informacoes_classificadas enable row level security;

-- Canais: o site lê sempre (não há rascunho: são os dados de contato).
drop policy if exists "atendimento_canais: leitura" on public.atendimento_canais;
create policy "atendimento_canais: leitura" on public.atendimento_canais for select to anon, authenticated using (true);
drop policy if exists "atendimento_canais: inclusão" on public.atendimento_canais;
create policy "atendimento_canais: inclusão" on public.atendimento_canais for insert to authenticated
  with check (public.tem_permissao(orgao_id, canal, 'editar') and public.no_alcance(orgao_id, null));
drop policy if exists "atendimento_canais: edição" on public.atendimento_canais;
create policy "atendimento_canais: edição" on public.atendimento_canais for update to authenticated
  using (public.tem_permissao(orgao_id, canal, 'editar') and public.no_alcance(orgao_id, null))
  with check (public.tem_permissao(orgao_id, canal, 'editar') and public.no_alcance(orgao_id, null));
drop policy if exists "atendimento_canais: exclusão" on public.atendimento_canais;
create policy "atendimento_canais: exclusão" on public.atendimento_canais for delete to authenticated
  using (public.tem_permissao(orgao_id, canal, 'excluir') and public.no_alcance(orgao_id, null));

drop policy if exists "atendimento_relatorios: leitura" on public.atendimento_relatorios;
create policy "atendimento_relatorios: leitura" on public.atendimento_relatorios for select to anon, authenticated
  using (situacao = 'publicado' or public.e_membro(orgao_id));
drop policy if exists "atendimento_relatorios: inclusão" on public.atendimento_relatorios;
create policy "atendimento_relatorios: inclusão" on public.atendimento_relatorios for insert to authenticated
  with check (public.tem_permissao(orgao_id, canal, 'editar') and public.no_alcance(orgao_id, null));
drop policy if exists "atendimento_relatorios: edição" on public.atendimento_relatorios;
create policy "atendimento_relatorios: edição" on public.atendimento_relatorios for update to authenticated
  using (public.tem_permissao(orgao_id, canal, 'editar') and public.no_alcance(orgao_id, null))
  with check (public.tem_permissao(orgao_id, canal, 'editar') and public.no_alcance(orgao_id, null));
drop policy if exists "atendimento_relatorios: exclusão" on public.atendimento_relatorios;
create policy "atendimento_relatorios: exclusão" on public.atendimento_relatorios for delete to authenticated
  using (public.tem_permissao(orgao_id, canal, 'excluir') and public.no_alcance(orgao_id, null));

-- Itens: seguem o relatório (publicado → site lê; mexer exige editar o canal e, se publicado, publicar).
create or replace function public.pode_mexer_item_relatorio(p_relatorio uuid)
returns boolean language sql stable security invoker set search_path = public as $$
  select exists (select 1 from public.atendimento_relatorios r
                 where r.id = p_relatorio and public.tem_permissao(r.orgao_id, r.canal, 'editar') and public.no_alcance(r.orgao_id, null)
                   and (r.situacao = 'rascunho' or public.tem_permissao(r.orgao_id, r.canal, 'publicar')));
$$;
grant execute on function public.pode_mexer_item_relatorio(uuid) to authenticated;
drop policy if exists "atendimento_relatorios_itens: leitura" on public.atendimento_relatorios_itens;
create policy "atendimento_relatorios_itens: leitura" on public.atendimento_relatorios_itens for select to anon, authenticated
  using (exists (select 1 from public.atendimento_relatorios r where r.id = relatorio_id));
drop policy if exists "atendimento_relatorios_itens: inclusão" on public.atendimento_relatorios_itens;
create policy "atendimento_relatorios_itens: inclusão" on public.atendimento_relatorios_itens for insert to authenticated
  with check (public.pode_mexer_item_relatorio(relatorio_id));
drop policy if exists "atendimento_relatorios_itens: edição" on public.atendimento_relatorios_itens;
create policy "atendimento_relatorios_itens: edição" on public.atendimento_relatorios_itens for update to authenticated
  using (public.pode_mexer_item_relatorio(relatorio_id)) with check (public.pode_mexer_item_relatorio(relatorio_id));
drop policy if exists "atendimento_relatorios_itens: exclusão" on public.atendimento_relatorios_itens;
create policy "atendimento_relatorios_itens: exclusão" on public.atendimento_relatorios_itens for delete to authenticated
  using (public.pode_mexer_item_relatorio(relatorio_id));

drop policy if exists "informacoes_classificadas: leitura" on public.informacoes_classificadas;
create policy "informacoes_classificadas: leitura" on public.informacoes_classificadas for select to anon, authenticated
  using (situacao = 'publicado' or public.e_membro(orgao_id));
drop policy if exists "informacoes_classificadas: inclusão" on public.informacoes_classificadas;
create policy "informacoes_classificadas: inclusão" on public.informacoes_classificadas for insert to authenticated
  with check (public.tem_permissao(orgao_id, 'esic', 'editar') and public.no_alcance(orgao_id, null));
drop policy if exists "informacoes_classificadas: edição" on public.informacoes_classificadas;
create policy "informacoes_classificadas: edição" on public.informacoes_classificadas for update to authenticated
  using (public.tem_permissao(orgao_id, 'esic', 'editar') and public.no_alcance(orgao_id, null))
  with check (public.tem_permissao(orgao_id, 'esic', 'editar') and public.no_alcance(orgao_id, null));
drop policy if exists "informacoes_classificadas: exclusão" on public.informacoes_classificadas;
create policy "informacoes_classificadas: exclusão" on public.informacoes_classificadas for delete to authenticated
  using (public.tem_permissao(orgao_id, 'esic', 'excluir') and public.no_alcance(orgao_id, null));

grant select on public.atendimento_canais, public.atendimento_relatorios, public.atendimento_relatorios_itens, public.informacoes_classificadas to anon;
grant select, insert, update, delete on public.atendimento_canais, public.atendimento_relatorios, public.atendimento_relatorios_itens,
  public.informacoes_classificadas to authenticated;


-- ---------------------------------------------------------------------
-- 7. EXERCÍCIOS COM DADOS (abas de ano)
-- ---------------------------------------------------------------------
-- p_parte: esic_relatorios | ouvidoria_relatorios | esic_classificadas (ano da classificação)
--          | esic_desclassificadas (ano da desclassificação). O visitante só conta o publicado (RLS).
create or replace function public.atendimento_anos(p_orgao uuid, p_parte text)
returns table (ano integer, total bigint)
language sql stable security invoker set search_path = public as $$
  select r.exercicio, count(*) from public.atendimento_relatorios r
   where r.orgao_id = p_orgao and p_parte in ('esic_relatorios', 'ouvidoria_relatorios') and r.canal = split_part(p_parte, '_', 1)
   group by r.exercicio
  union all
  select i.exercicio, count(*) from public.informacoes_classificadas i
   where i.orgao_id = p_orgao and p_parte = 'esic_classificadas'
   group by i.exercicio
  union all
  select i.ano_desclassificacao, count(*) from public.informacoes_classificadas i
   where i.orgao_id = p_orgao and p_parte = 'esic_desclassificadas' and i.ano_desclassificacao is not null
   group by i.ano_desclassificacao
  order by 1 desc;
$$;
grant execute on function public.atendimento_anos(uuid, text) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 8. AVISOS DE PRAZO (somados aos do script 21 por pendencias_atualizacao)
-- ---------------------------------------------------------------------
create or replace function public.pendencias_atendimento(p_orgao uuid)
returns table (modulo text, nivel text, mensagem text, quantidade bigint)
language plpgsql stable security invoker set search_path = public as $$
declare
  v_ano int := extract(year from current_date)::int;
  fora text[];
  c record;
begin
  if not public.e_membro(p_orgao) then return; end if;
  select coalesce(array_agg(x), '{}') into fora from (
    select x from public.partes_sem_dados(p_orgao) x
    union
    select k from public.orgaos o, jsonb_each_text(coalesce(o.configuracoes -> 'destinos', '{}'::jsonb)) as d(k, v)
    where o.id = p_orgao and coalesce(d.v, '') <> '') t;
  if 'esic' = any (fora) then fora := fora || array['esic_canal', 'esic_relatorios', 'esic_classificadas', 'esic_desclassificadas']; end if;
  if 'ouvidoria' = any (fora) then fora := fora || array['ouvidoria_canal', 'ouvidoria_relatorios']; end if;
  -- Itens anuais (12.7 a 12.9): a declaração do exercício anterior também deixa a parte em dia.
  fora := fora || coalesce((select array_agg(d.secao) from public.declaracoes_inexistencia d
                            where d.orgao_id = p_orgao and d.abrangencia = 'ano' and d.exercicio = v_ano - 1), '{}');

  -- 12.1 a 12.6: dados do SIC
  if not ('esic_canal' = any (fora)) then
    select * into c from public.atendimento_canais a where a.orgao_id = p_orgao and a.canal = 'esic';
    if c.id is null or (c.unidade_id is null and c.setor is null) then
      return query select 'esic', 'alerta', 'falta a unidade ou o setor responsável pelo SIC (PNTP 12.1), na aba "Como pedir".', 1::bigint; end if;
    if c.id is null or (coalesce(c.endereco, '') = '' and c.unidade_id is null) or coalesce(c.email, '') = '' or (coalesce(c.horario, '') = '' and c.unidade_id is null) then
      return query select 'esic', 'alerta', 'faltam endereço, e-mail ou horário de funcionamento do SIC (PNTP 12.2).', 1::bigint; end if;
    if c.id is null or c.canal_url is null then
      return query select 'esic', 'alerta', 'falta o endereço do formulário eletrônico de pedidos — e-SIC próprio ou Fala.BR (PNTP 12.3).', 1::bigint; end if;
    if c.id is null or (c.norma_publicacao is null and c.norma_texto is null) then
      return query select 'esic', 'alerta', 'falta a norma local que regulamenta a Lei de Acesso à Informação (PNTP 12.5).', 1::bigint; end if;
    if c.id is null or c.prazo_resposta is null or c.prazo_recurso is null or c.autoridade_recurso_1 is null or c.procedimento_recurso is null then
      return query select 'esic', 'info', 'faltam prazos, autoridades ou o procedimento do recurso na aba "Prazos e recursos" (PNTP 12.6).', 1::bigint; end if;
  end if;

  -- 12.7: relatório do último exercício encerrado
  if not ('esic_relatorios' = any (fora)) and not exists (select 1 from public.atendimento_relatorios r
       where r.orgao_id = p_orgao and r.canal = 'esic' and r.situacao = 'publicado' and r.exercicio = v_ano - 1 and r.abrangencia = 'ano') then
    return query select 'esic', 'alerta', 'falta o relatório estatístico anual dos pedidos de ' || (v_ano - 1) || ' (PNTP 12.7).', 1::bigint;
  end if;
  -- 12.8 e 12.9: rol do ano anterior (registros ou declaração de que não houve)
  if not ('esic_classificadas' = any (fora)) and not exists (select 1 from public.informacoes_classificadas i
       where i.orgao_id = p_orgao and i.situacao = 'publicado' and i.exercicio = v_ano - 1) then
    return query select 'esic', 'alerta', 'nenhuma informação classificada em ' || (v_ano - 1) || ' publicada (PNTP 12.8): se não houve, declare na aba "Informações classificadas".', 1::bigint;
  end if;
  if not ('esic_desclassificadas' = any (fora)) and not exists (select 1 from public.informacoes_classificadas i
       where i.orgao_id = p_orgao and i.situacao = 'publicado' and (i.ano_desclassificacao = v_ano - 1 or i.data_desclassificacao >= current_date - 365)) then
    return query select 'esic', 'alerta', 'nenhuma desclassificação de ' || (v_ano - 1) || ' ou dos últimos 12 meses publicada (PNTP 12.9): se não houve, declare na aba "Informações desclassificadas".', 1::bigint;
  end if;
  -- LAI, art. 24, § 4º: terminado o prazo, a informação é pública.
  return query select 'esic', 'alerta', 'informação(ões) com o prazo de sigilo encerrado e sem desclassificação registrada (LAI, art. 24, § 4º).', count(*)
    from public.informacoes_classificadas i
    where i.orgao_id = p_orgao and i.data_desclassificacao is null and i.prazo_fim < current_date
    having count(*) > 0;

  -- 14.1 e 14.2: dados da ouvidoria
  if not ('ouvidoria_canal' = any (fora)) then
    select * into c from public.atendimento_canais a where a.orgao_id = p_orgao and a.canal = 'ouvidoria';
    if c.id is null or ((coalesce(c.endereco, '') = '' or coalesce(c.telefone, '') = '' or coalesce(c.horario, '') = '') and c.unidade_id is null) then
      return query select 'ouvidoria', 'alerta', 'faltam endereço, telefone ou horário do atendimento presencial da Ouvidoria (PNTP 14.1).', 1::bigint; end if;
    if c.id is null or c.canal_url is null then
      return query select 'ouvidoria', 'alerta', 'falta o endereço do canal eletrônico da Ouvidoria (PNTP 14.2).', 1::bigint; end if;
  end if;
  if not ('ouvidoria_relatorios' = any (fora)) and not exists (select 1 from public.atendimento_relatorios r
       where r.orgao_id = p_orgao and r.canal = 'ouvidoria' and r.situacao = 'publicado' and r.exercicio = v_ano - 1 and r.abrangencia = 'ano') then
    return query select 'ouvidoria', 'info', 'falta o relatório anual das manifestações de ' || (v_ano - 1) || ' (Lei 13.460/2017, arts. 14 e 15).', 1::bigint;
  end if;
end;
$$;
grant execute on function public.pendencias_atendimento(uuid) to authenticated;
