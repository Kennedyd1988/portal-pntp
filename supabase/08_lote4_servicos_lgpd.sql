-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 08 — Lote 4: Carta de Serviços, LGPD e Governo Digital
--   PNTP 14.3 (Carta de Serviços), 15.1 (encarregado de dados),
--   15.2 (política de privacidade), 15.3 (serviços digitais),
--   15.4 (regras de dados abertos) e 15.5 (regulamentação do
--   Governo Digital, Lei 14.129/2021).
--
-- Como usar: Supabase › SQL Editor › New query › colar tudo › Run.
-- Pode ser executado mais de uma vez. Rodar DEPOIS dos scripts 01 a 07.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. MÓDULO NOVO "LGPD e Governo Digital"
--    Permissões iniciais iguais às de "Aparência e contatos" (assunto
--    institucional do órgão todo: administrador e gestor de conteúdo).
-- ---------------------------------------------------------------------
insert into public.modulos (codigo, nome, grupo, ordem) values
  ('lgpd', 'LGPD e Governo Digital', 'Conteúdo do site', 28)
on conflict (codigo) do nothing;

insert into public.perfil_permissoes (perfil_id, modulo, pode_ver, pode_editar, pode_publicar, pode_excluir)
select perfil_id, 'lgpd', pode_ver, pode_editar, pode_publicar, pode_excluir
from public.perfil_permissoes where modulo = 'aparencia'
on conflict (perfil_id, modulo) do nothing;


-- ---------------------------------------------------------------------
-- 2. CARTA DE SERVIÇOS AO USUÁRIO (Lei 13.460/2017, art. 7º)
--    Um registro por serviço, com tudo o que a lei e a cartilha pedem:
--    o que é, requisitos/documentos, etapas, prazo máximo, forma de
--    prestação, onde/quando, e onde reclamar. "link_digital" atende o
--    15.3 (pedir o serviço pela internet, sem ir ao balcão).
-- ---------------------------------------------------------------------
create table if not exists public.servicos (
  id                uuid primary key default gen_random_uuid(),
  orgao_id          uuid not null references public.orgaos(id) on delete cascade,
  unidade_id        uuid references public.unidades(id) on delete restrict,
  nome              text not null check (char_length(nome) between 3 and 200),
  categoria         text,
  descricao         text,                -- o que é o serviço
  publico_alvo      text,
  requisitos        text,                -- requisitos e documentos necessários
  etapas            text,                -- principais etapas
  prazo_maximo      text,                -- ex.: "Até 15 dias úteis"
  forma_prestacao   text not null default 'presencial'
                      check (forma_prestacao in ('presencial', 'digital', 'presencial_digital')),
  link_digital      text check (link_digital is null or link_digital ~* '^https?://'),
  local_atendimento text,
  horario           text,
  custo             text,                -- ex.: "Gratuito" ou valor/taxa
  prioridades       text,                -- atendimento prioritário (idosos, PcD…)
  tempo_espera      text,                -- previsão de espera no atendimento
  manifestacao      text,                -- onde reclamar/elogiar (vazio = padrão da Carta)
  situacao          text not null default 'rascunho' check (situacao in ('rascunho', 'publicado')),
  publicado_em      timestamptz,
  busca             text generated always as
                      (public.normalizar_texto(nome || ' ' || coalesce(categoria, '') || ' ' || coalesce(descricao, ''))) stored,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  -- Serviço digital precisa do endereço onde é pedido (senão não atende o 15.3).
  constraint servicos_digital_link check (forma_prestacao = 'presencial' or link_digital is not null),
  constraint servicos_nome_unico unique (orgao_id, nome)
);
-- Lista do painel e do site: ordem alfabética (é cadastro, não histórico).
create index if not exists servicos_lista_idx on public.servicos (orgao_id, nome, id);

-- Textos gerais da Carta (um por órgão): apresentação, compromissos de
-- qualidade do atendimento e canais padrão de manifestação.
create table if not exists public.carta_servicos (
  orgao_id      uuid primary key references public.orgaos(id) on delete cascade,
  apresentacao  text,
  compromissos  text,
  manifestacao  text,
  atualizado_em timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 3. LGPD E GOVERNO DIGITAL (um registro por órgão)
-- ---------------------------------------------------------------------
create table if not exists public.lgpd (
  orgao_id               uuid primary key references public.orgaos(id) on delete cascade,
  -- 15.1 Encarregado de dados
  encarregado_nome       text,
  encarregado_cargo      text,
  encarregado_email      text,
  encarregado_telefone   text,
  encarregado_ato        text,     -- ato de designação (ex.: Portaria nº 10/2026)
  encarregado_ato_url    text,
  -- 15.2 Política de privacidade (texto no site e/ou PDF)
  politica_texto         text,
  politica_url           text,
  politica_atualizada_em date,
  -- 15.5 Norma que regulamenta a Lei 14.129/2021 no órgão
  gov_digital_publicacao uuid references public.publicacoes(id) on delete set null,
  gov_digital_texto      text,     -- ex.: "Decreto nº 15/2025" quando não estiver cadastrada
  gov_digital_url        text,
  -- 15.4 Regras de uso dos dados abertos
  dados_abertos_texto    text,
  atualizado_em          timestamptz not null default now(),
  constraint lgpd_email check (encarregado_email is null or encarregado_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);


-- ---------------------------------------------------------------------
-- 4. GATILHOS PADRÃO
-- ---------------------------------------------------------------------
drop trigger if exists servicos_publicacao on public.servicos;
create trigger servicos_publicacao before insert or update on public.servicos
  for each row execute function public.controlar_publicacao('servicos');

do $$
declare
  t text;
begin
  foreach t in array array['servicos', 'carta_servicos', 'lgpd'] loop
    execute format('drop trigger if exists %1$s_atualizado on public.%1$I', t);
    execute format('create trigger %1$s_atualizado before update on public.%1$I
                    for each row execute function public.marcar_atualizacao()', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- Histórico: "servicos" tem id próprio e usa o gatilho genérico.
drop trigger if exists servicos_historico on public.servicos;
create trigger servicos_historico after insert or update or delete on public.servicos
  for each row execute function public.registrar_historico();

-- carta_servicos e lgpd usam orgao_id como chave (não têm coluna "id"):
-- histórico próprio, para não quebrar o gatilho genérico.
create or replace function public.registrar_historico_por_orgao()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  base jsonb := to_jsonb(coalesce(new, old));
begin
  if tg_op = 'UPDATE' and to_jsonb(new) = to_jsonb(old) then
    return new;
  end if;
  insert into public.historico (orgao_id, usuario_id, tabela, registro_id, acao, dados_antes, dados_depois)
  values ((base->>'orgao_id')::uuid, auth.uid(), tg_table_name, base->>'orgao_id',
          case tg_op when 'INSERT' then 'inserir'::public.acao_historico
                     when 'UPDATE' then 'editar'::public.acao_historico
                     else 'excluir'::public.acao_historico end,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end;
$$;
drop trigger if exists carta_servicos_historico on public.carta_servicos;
create trigger carta_servicos_historico after insert or update or delete on public.carta_servicos
  for each row execute function public.registrar_historico_por_orgao();
drop trigger if exists lgpd_historico on public.lgpd;
create trigger lgpd_historico after insert or update or delete on public.lgpd
  for each row execute function public.registrar_historico_por_orgao();


-- ---------------------------------------------------------------------
-- 5. REGRAS DE ACESSO
--    Serviço: aceita alcance setorial (cada secretaria mantém os seus).
--    Textos da Carta e LGPD: valem para o órgão todo.
-- ---------------------------------------------------------------------
do $$
declare
  r record;
  alcance text;
begin
  for r in select * from (values
    ('servicos',       'servicos', true,  $q$situacao = 'publicado'$q$),
    ('carta_servicos', 'servicos', false, $q$true$q$),
    ('lgpd',           'lgpd',     false, $q$true$q$)
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


-- ---------------------------------------------------------------------
-- 6. VÍNCULOS NOVOS COM UNIDADE E PUBLICAÇÃO
--    A publicação citada como norma do Governo Digital não pode sumir sem
--    aviso: "on delete set null" limpa o vínculo e a tela de LGPD mostra a
--    pendência (o critério 15.5 volta a aparecer como faltando).
-- ---------------------------------------------------------------------
comment on column public.lgpd.gov_digital_publicacao is
  'Publicação (decreto/lei) que regulamenta a Lei 14.129/2021 no órgão. Se a publicação for excluída, o vínculo é limpo e a tela mostra a pendência.';
