-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 27 — Verificação diária dos endereços externos e cadastro de órgãos
--
-- Rodar no SQL Editor DEPOIS do 26 (rode o 26 de novo antes: ele passou a
-- contar na série histórica os exercícios dos "outros endereços"). Pode rodar
-- mais de uma vez.
--
-- Parte 1 — Endereços externos (Aparência › Destinos das páginas e demais links
--   de sistemas do órgão). O portal não consegue ler o conteúdo de um sistema
--   de outra empresa; o que ele confere, todo dia, é se cada endereço responde.
--   · links_verificacao: um registro por órgão e endereço, com o último código
--     HTTP, a data da verificação, quantas falhas seguidas e quando respondeu
--     pela última vez.
--   · verificar_links_externos(): dispara a consulta de todos os endereços
--     (pg_net, sem custo), às 05:10 de Brasília; coletar_links_externos() lê as
--     respostas às 05:25. Sem resposta em 10 minutos conta como falha.
--   · verificar_links_orgao(órgão) e situacao_links_orgao(órgão): botão
--     "Verificar agora" e a situação mostrada no painel.
--   Endereço que responde (códigos 200 a 399, ou 401/403/405/429, que mostram o
--   servidor no ar recusando robô) fica "respondeu"; 404, 410, erro 5xx, erro de
--   conexão ou tempo esgotado contam falha. Com 2 falhas seguidas, o painel avisa.
--
-- Parte 2 — Cadastro de órgãos pela própria plataforma (só Suporte SOFT+):
--   todos os órgãos ficam no MESMO banco (um registro em "orgaos"); não se cria
--   banco novo por cliente. criar_orgao() grava o órgão com a identidade inicial
--   e o menu padrão; o primeiro administrador é convidado pelo módulo Usuários.
--   orgaos_plataforma() lista os órgãos com a situação da implantação;
--   alterar_orgao() corrige dados cadastrais e ativa/desativa.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Parte 1: verificação dos endereços externos
-- ---------------------------------------------------------------------
create table if not exists public.links_verificacao (
  orgao_id        uuid not null references public.orgaos(id) on delete cascade,
  url             text not null,
  chaves          text[] not null default '{}',     -- onde o endereço é usado (destino, "transparencia_url"…)
  pedido_id       bigint,                           -- id da consulta no pg_net
  pedido_em       timestamptz,
  status          integer,                          -- último código HTTP (nulo = sem resposta)
  erro            text,
  verificado_em   timestamptz,
  ok              boolean,
  falhas_seguidas integer not null default 0,
  ultimo_ok_em    timestamptz,
  primary key (orgao_id, url)
);
alter table public.links_verificacao enable row level security;
drop policy if exists "links_verificacao: membros leem" on public.links_verificacao;
create policy "links_verificacao: membros leem" on public.links_verificacao for select to authenticated using (public.e_membro(orgao_id));
grant select on public.links_verificacao to authenticated;

-- Todos os endereços externos que o órgão configurou, com as chaves onde aparecem.
create or replace function public.links_externos_do_orgao(p_cfg jsonb)
returns table (url text, chaves text[]) language sql immutable as $$
  with t as (
    select btrim(d.value) as url, d.key as chave
      from jsonb_each_text(case when jsonb_typeof(p_cfg -> 'destinos') = 'object' then p_cfg -> 'destinos' else '{}'::jsonb end) d
    union all
    select btrim(l ->> 'url'), k.key || ' (outro endereço)'
      from jsonb_each(case when jsonb_typeof(p_cfg -> 'destinos_links') = 'object' then p_cfg -> 'destinos_links' else '{}'::jsonb end) k,
           jsonb_array_elements(case when jsonb_typeof(k.value) = 'array' then k.value else '[]'::jsonb end) l
    union all
    select btrim(p_cfg ->> c), c from unnest(array['transparencia_url', 'diario_oficial_url', 'licitacoes_url']) c
  )
  select t.url, array_agg(distinct t.chave order by t.chave) from t
  where t.url ~* '^https?://\S+\.\S+' group by t.url;
$$;

-- Atualiza a lista de endereços de um órgão (inclui os novos, tira os que saíram).
create or replace function public.sincronizar_links_orgao(p_orgao uuid)
returns void language plpgsql security definer set search_path = public as $$
declare cfg jsonb;
begin
  select coalesce(o.configuracoes, '{}'::jsonb) into cfg from public.orgaos o where o.id = p_orgao;
  insert into public.links_verificacao (orgao_id, url, chaves)
  select p_orgao, x.url, x.chaves from public.links_externos_do_orgao(cfg) x
  on conflict (orgao_id, url) do update set chaves = excluded.chaves;
  delete from public.links_verificacao v where v.orgao_id = p_orgao
    and not exists (select 1 from public.links_externos_do_orgao(cfg) x where x.url = v.url);
end;
$$;

-- Dispara as consultas (pg_net). p_orgao nulo = todos os órgãos ativos.
create or replace function public.disparar_links(p_orgao uuid)
returns integer language plpgsql security definer set search_path = public, extensions as $$
declare r record; n integer := 0;
begin
  for r in select o.id from public.orgaos o where o.ativo and (p_orgao is null or o.id = p_orgao) loop
    perform public.sincronizar_links_orgao(r.id);
  end loop;
  for r in select v.orgao_id, v.url from public.links_verificacao v join public.orgaos o on o.id = v.orgao_id
           where o.ativo and (p_orgao is null or v.orgao_id = p_orgao) loop
    update public.links_verificacao set pedido_id = net.http_get(url := r.url, timeout_milliseconds := 20000), pedido_em = now()
     where orgao_id = r.orgao_id and url = r.url;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Lê as respostas que chegaram. Sem resposta em 10 minutos: falha (tempo esgotado).
create or replace function public.coletar_links(p_orgao uuid)
returns integer language plpgsql security definer set search_path = public, extensions as $$
declare r record; resp record; bom boolean; n integer := 0;
begin
  for r in select * from public.links_verificacao v
           where v.pedido_id is not null and (v.verificado_em is null or v.verificado_em < v.pedido_em)
             and (p_orgao is null or v.orgao_id = p_orgao) loop
    select h.status_code, h.error_msg, h.timed_out into resp from net._http_response h where h.id = r.pedido_id;
    if not found then
      if r.pedido_em > now() - interval '10 minutes' then continue; end if;
      resp := null;
    end if;
    bom := resp.status_code is not null and (resp.status_code between 200 and 399 or resp.status_code in (401, 403, 405, 429));
    update public.links_verificacao set
      status = resp.status_code,
      erro = case when bom then null
                  when resp.status_code is not null then 'O endereço respondeu com o código ' || resp.status_code
                    || case resp.status_code when 404 then ' (página não encontrada)' when 410 then ' (página removida)'
                                             else case when resp.status_code >= 500 then ' (erro no servidor do sistema)' else '' end end || '.'
                  when coalesce(resp.timed_out, true) and resp.error_msg is null then 'O endereço não respondeu em 20 segundos.'
                  else 'Não foi possível conectar ao endereço' || coalesce(' (' || left(resp.error_msg, 120) || ')', '') || '.' end,
      ok = bom, verificado_em = now(),
      falhas_seguidas = case when bom then 0 else falhas_seguidas + 1 end,
      ultimo_ok_em = case when bom then now() else ultimo_ok_em end
    where orgao_id = r.orgao_id and url = r.url;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Rotina diária (pg_cron, como o usuário dono do banco).
create or replace function public.verificar_links_externos() returns integer
language sql security definer set search_path = public as $$ select public.disparar_links(null); $$;
create or replace function public.coletar_links_externos() returns integer
language sql security definer set search_path = public as $$ select public.coletar_links(null); $$;
revoke all on function public.disparar_links(uuid), public.coletar_links(uuid), public.verificar_links_externos(),
  public.coletar_links_externos(), public.sincronizar_links_orgao(uuid) from public, anon, authenticated;

-- Painel: "Verificar agora" (quem edita a Aparência) e a situação de cada endereço (membros).
create or replace function public.verificar_links_orgao(p_orgao uuid)
returns integer language plpgsql security definer set search_path = public as $$
begin
  if not public.tem_permissao(p_orgao, 'aparencia', 'editar') then
    raise exception 'Seu perfil não pode verificar os endereços deste órgão.';
  end if;
  if exists (select 1 from public.links_verificacao v where v.orgao_id = p_orgao and v.pedido_em > now() - interval '1 minute') then
    raise exception 'Os endereços acabaram de ser verificados. Aguarde um minuto para verificar de novo.';
  end if;
  return public.disparar_links(p_orgao);
end;
$$;
grant execute on function public.verificar_links_orgao(uuid) to authenticated;

drop function if exists public.situacao_links_orgao(uuid);
create or replace function public.situacao_links_orgao(p_orgao uuid)
returns table (url text, chaves text[], ok boolean, status integer, erro text, verificado_em timestamptz,
               falhas_seguidas integer, ultimo_ok_em timestamptz, aguardando boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not public.e_membro(p_orgao) then return; end if;
  perform public.coletar_links(p_orgao);
  perform public.sincronizar_links_orgao(p_orgao);
  return query select v.url, v.chaves, v.ok, v.status, v.erro, v.verificado_em, v.falhas_seguidas, v.ultimo_ok_em,
                      (v.pedido_id is not null and (v.verificado_em is null or v.verificado_em < v.pedido_em))
               from public.links_verificacao v where v.orgao_id = p_orgao order by v.url;
end;
$$;
grant execute on function public.situacao_links_orgao(uuid) to authenticated;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.unschedule(jobid) from cron.job where jobname in ('links-verificar', 'links-coletar');
-- 05:10 e 05:25 de Brasília (08:10 e 08:25 UTC).
select cron.schedule('links-verificar', '10 8 * * *', $cron$ select public.verificar_links_externos(); $cron$);
select cron.schedule('links-coletar', '25 8 * * *', $cron$ select public.coletar_links_externos(); $cron$);

-- ---------------------------------------------------------------------
-- Parte 2: cadastro de órgãos (Suporte SOFT+)
-- ---------------------------------------------------------------------
insert into public.modulos (codigo, nome, grupo, ordem)
values ('orgaos', 'Órgãos da plataforma', 'Plataforma SOFT+', 900)
on conflict (codigo) do update set nome = excluded.nome, grupo = excluded.grupo, ordem = excluded.ordem;

-- Menu padrão do site (o mesmo do botão "Criar menu padrão" do painel). Só cria se o órgão não tiver menu.
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

-- Confere e normaliza os dados cadastrais (usado ao criar e ao alterar).
create or replace function public.validar_dados_orgao(p jsonb, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_nome text := btrim(coalesce(p ->> 'nome', ''));
  v_cnpj text := regexp_replace(coalesce(p ->> 'cnpj', ''), '\D', '', 'g');
  v_uf text := upper(btrim(coalesce(p ->> 'uf', '')));
  v_dom text := lower(regexp_replace(regexp_replace(btrim(coalesce(p ->> 'dominio', '')), '^https?://', ''), '/.*$', ''));
  v_pai uuid := nullif(p ->> 'orgao_pai_id', '')::uuid;
  v_tipo text := coalesce(p ->> 'tipo', '');
begin
  if char_length(v_nome) < 5 then raise exception 'Informe o nome oficial do órgão.'; end if;
  if v_tipo not in ('prefeitura', 'camara', 'rpps', 'consorcio', 'autarquia', 'outro') then raise exception 'Escolha o tipo do órgão.'; end if;
  if length(v_cnpj) <> 14 or not public.documento_valido(v_cnpj) then raise exception 'CNPJ inválido.'; end if;
  v_cnpj := substr(v_cnpj, 1, 2) || '.' || substr(v_cnpj, 3, 3) || '.' || substr(v_cnpj, 6, 3) || '/' || substr(v_cnpj, 9, 4) || '-' || substr(v_cnpj, 13, 2);
  if exists (select 1 from public.orgaos o where o.cnpj = v_cnpj and o.id is distinct from p_id) then
    raise exception 'Já existe um órgão com o CNPJ %.', v_cnpj;
  end if;
  if v_uf !~ '^[A-Z]{2}$' then raise exception 'Informe a UF com 2 letras.'; end if;
  if char_length(btrim(coalesce(p ->> 'municipio', ''))) < 2 then raise exception 'Informe o município.'; end if;
  if v_dom <> '' and v_dom !~ '^[a-z0-9.-]+\.[a-z]{2,}$' then raise exception 'Domínio inválido. Ex.: municipio.rn.gov.br'; end if;
  if v_dom <> '' and exists (select 1 from public.orgaos o where o.dominio = v_dom and o.id is distinct from p_id) then
    raise exception 'O domínio % já está em outro órgão.', v_dom;
  end if;
  if v_pai is not null and (v_pai = p_id or not exists (select 1 from public.orgaos o where o.id = v_pai and o.orgao_pai_id is null)) then
    raise exception 'O órgão principal (para subsite) precisa ser um órgão existente que não seja subsite.';
  end if;
  return jsonb_build_object('nome', v_nome, 'sigla', nullif(btrim(coalesce(p ->> 'sigla', '')), ''), 'tipo', v_tipo, 'cnpj', v_cnpj, 'uf', v_uf,
    'municipio', btrim(p ->> 'municipio'), 'dominio', nullif(v_dom, ''), 'orgao_pai_id', v_pai);
end;
$$;

-- Cria o órgão pronto para uso: identidade inicial, menu padrão e, se houver, contatos.
-- O administrador do órgão é convidado em seguida (módulo Usuários, com o órgão aberto).
create or replace function public.criar_orgao(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v jsonb; novo uuid; cor text := lower(coalesce(p ->> 'cor', ''));
begin
  if not public.e_suporte_softplus() then raise exception 'Só o Suporte SOFT+ cadastra órgãos.'; end if;
  v := public.validar_dados_orgao(p, null);
  if cor !~ '^#[0-9a-f]{6}$' then cor := '#0d4fc4'; end if;
  insert into public.orgaos (nome, sigla, tipo, cnpj, municipio, uf, dominio, orgao_pai_id, configuracoes)
  values (v ->> 'nome', v ->> 'sigla', (v ->> 'tipo')::public.tipo_orgao, v ->> 'cnpj', v ->> 'municipio', v ->> 'uf', v ->> 'dominio',
          (v ->> 'orgao_pai_id')::uuid,
          jsonb_strip_nulls(jsonb_build_object('nome_exibicao', v ->> 'nome', 'cor_principal', cor,
            'email', nullif(btrim(coalesce(p ->> 'email', '')), ''), 'telefone', nullif(btrim(coalesce(p ->> 'telefone', '')), ''))))
  returning id into novo;
  perform public.criar_menu_padrao(novo);
  return novo;
end;
$$;
grant execute on function public.criar_orgao(jsonb) to authenticated;

create or replace function public.alterar_orgao(p_orgao uuid, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.e_suporte_softplus() then raise exception 'Só o Suporte SOFT+ altera os dados cadastrais do órgão.'; end if;
  v := public.validar_dados_orgao(p, p_orgao);
  if (v ->> 'orgao_pai_id') is not null and exists (select 1 from public.orgaos s where s.orgao_pai_id = p_orgao) then
    raise exception 'Este órgão tem subsites: ele não pode virar subsite de outro.';
  end if;
  update public.orgaos set nome = v ->> 'nome', sigla = v ->> 'sigla', tipo = (v ->> 'tipo')::public.tipo_orgao, cnpj = v ->> 'cnpj',
         municipio = v ->> 'municipio', uf = v ->> 'uf', dominio = v ->> 'dominio', orgao_pai_id = (v ->> 'orgao_pai_id')::uuid,
         ativo = coalesce((p ->> 'ativo')::boolean, ativo)
   where id = p_orgao;
  if not found then raise exception 'Órgão não encontrado.'; end if;
end;
$$;
grant execute on function public.alterar_orgao(uuid, jsonb) to authenticated;

-- Lista para o Suporte SOFT+, com o que falta para o órgão entrar no ar.
drop function if exists public.orgaos_plataforma();
create or replace function public.orgaos_plataforma()
returns table (id uuid, nome text, sigla text, tipo public.tipo_orgao, cnpj text, municipio text, uf text, dominio text,
               orgao_pai_id uuid, ativo boolean, criado_em timestamptz, administradores integer, usuarios integer,
               itens_menu integer, unidades integer, links_fora integer, pendencias text[])
language sql stable security definer set search_path = public as $$
  select o.id, o.nome, o.sigla, o.tipo, o.cnpj, o.municipio, o.uf, o.dominio, o.orgao_pai_id, o.ativo, o.criado_em,
         a.adm, a.usu, m.n, u.n, l.n,
         array_remove(array[
           case when a.adm = 0 then 'Convidar o administrador do órgão (Usuários e permissões).' end,
           case when m.n = 0 then 'Criar o menu do site.' end,
           case when u.n = 0 then 'Cadastrar as unidades (secretarias e setores).' end,
           case when coalesce(o.configuracoes ->> 'brasao_url', '') = '' then 'Enviar o brasão (Aparência).' end,
           case when coalesce(o.configuracoes ->> 'email', '') = '' or coalesce(o.configuracoes ->> 'telefone', '') = '' or coalesce(o.configuracoes ->> 'endereco', '') = ''
                then 'Completar endereço, telefone e e-mail (Aparência › Contatos).' end,
           case when o.dominio is null then 'Apontar o domínio oficial para o portal e cadastrá-lo (PNTP 1.1).' end,
           case when l.n > 0 then l.n || ' endereço(s) externo(s) sem responder (Aparência › Destinos das páginas).' end], null)
  from public.orgaos o
  cross join lateral (select count(*) filter (where uo.ativo and p.e_administrador)::int as adm, count(*) filter (where uo.ativo)::int as usu
                      from public.usuarios_orgaos uo join public.perfis p on p.id = uo.perfil_id where uo.orgao_id = o.id) a
  cross join lateral (select count(*)::int as n from public.menu_itens mi where mi.orgao_id = o.id) m
  cross join lateral (select count(*)::int as n from public.unidades un where un.orgao_id = o.id and un.ativo) u
  cross join lateral (select count(*)::int as n from public.links_verificacao lv where lv.orgao_id = o.id and lv.falhas_seguidas >= 2) l
  where public.e_suporte_softplus()
  order by o.nome;
$$;
grant execute on function public.orgaos_plataforma() to authenticated;

-- Conferência
select 'links: ' || count(*) from public.links_verificacao
union all select 'agendamentos: ' || string_agg(jobname, ', ') from cron.job where jobname like 'links-%';
