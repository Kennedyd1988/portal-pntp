-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 51 — Kit de evidências PNTP (Avalia) · 0.45.0
--
-- Módulo do painel para o controle interno de cada órgão preparar as
-- respostas do questionário do PNTP no Avalia (avalia.atricon.org.br):
-- resposta sugerida por critério, links, texto de esclarecimento e prints
-- marcados das páginas do próprio portal. O módulo NÃO preenche nem envia
-- nada ao Avalia: só deixa tudo pronto para copiar, colar e anexar.
--
-- Primeira versão: só Câmaras (tipos_orgao = camara). Prefeitura e
-- Consórcio entram depois, trocando a lista de tipos do módulo.
--
--   1. Módulo "kit_pntp" e permissões nos perfis padrão (Administrador e
--      Controle interno; os demais sem acesso; Suporte SOFT+ tem tudo).
--   2. pntp_kit_lancamentos: marcação "lançado no Avalia" por item.
--   3. pntp_kit_geracoes: histórico de cada geração do kit (quem, quando,
--      resumo, respostas, textos e os prints guardados no armazenamento).
--   4. pntp_kit_fatos(órgão): números do que está publicado (quantidade,
--      anos, data mais recente, última alteração) para os textos.
--
-- Rodar no SQL Editor DEPOIS do 50. Pode rodar mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. MÓDULO E PERMISSÕES
-- ---------------------------------------------------------------------
insert into public.modulos (codigo, nome, grupo, ordem, tipos_orgao) values
  ('kit_pntp', 'Kit de evidências PNTP (Avalia)', 'Controle interno', 115, array['camara'])
on conflict (codigo) do update set nome = excluded.nome, grupo = excluded.grupo, ordem = excluded.ordem, tipos_orgao = excluded.tipos_orgao;

-- Perfis padrão (orgao_id nulo): Administrador do órgão tudo; Controle interno ver e gerar
-- (editar = gerar o kit, guardar os prints e marcar "lançado no Avalia"); os demais sem acesso.
insert into public.perfil_permissoes (perfil_id, modulo, pode_ver, pode_editar, pode_publicar, pode_excluir)
select p.id, 'kit_pntp',
       p.e_administrador or p.nome = 'Controle interno',
       p.e_administrador or p.nome = 'Controle interno',
       p.e_administrador,
       p.e_administrador
from public.perfis p
where p.orgao_id is null
on conflict (perfil_id, modulo) do nothing;

-- Perfis próprios dos órgãos: administradores ganham o módulo; quem já vê o Histórico de
-- alterações sem poder editar nada (perfil de controle) ganha ver e gerar.
insert into public.perfil_permissoes (perfil_id, modulo, pode_ver, pode_editar, pode_publicar, pode_excluir)
select p.id, 'kit_pntp', true, true, p.e_administrador, p.e_administrador
from public.perfis p
where p.orgao_id is not null
  and (p.e_administrador or p.nome ilike '%controle%')
on conflict (perfil_id, modulo) do nothing;


-- ---------------------------------------------------------------------
-- 2. "LANÇADO NO AVALIA" (um registro por item do questionário)
-- ---------------------------------------------------------------------
create table if not exists public.pntp_kit_lancamentos (
  id               uuid primary key default gen_random_uuid(),
  orgao_id         uuid not null references public.orgaos(id) on delete cascade,
  codigo           text not null check (codigo ~ '^\d{1,2}\.\d{1,2}$'),
  lancado_em       timestamptz not null default now(),
  lancado_por      uuid default auth.uid(),
  lancado_por_nome text,
  observacao       text check (observacao is null or char_length(observacao) <= 500),
  constraint pntp_kit_lancamentos_uk unique (orgao_id, codigo)
);

-- Quem marcou vem do cadastro do usuário (não do navegador).
create or replace function public.pntp_kit_quem()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.lancado_por := auth.uid();
  new.lancado_em := now();
  select coalesce(nullif(u.nome, ''), u.email) into new.lancado_por_nome from public.usuarios u where u.id = auth.uid();
  return new;
end;
$$;
drop trigger if exists pntp_kit_lancamentos_quem on public.pntp_kit_lancamentos;
create trigger pntp_kit_lancamentos_quem before insert or update on public.pntp_kit_lancamentos
  for each row execute function public.pntp_kit_quem();
drop trigger if exists pntp_kit_lancamentos_historico on public.pntp_kit_lancamentos;
create trigger pntp_kit_lancamentos_historico after insert or update or delete on public.pntp_kit_lancamentos
  for each row execute function public.registrar_historico();

alter table public.pntp_kit_lancamentos enable row level security;
drop policy if exists "kit lançamentos: leitura" on public.pntp_kit_lancamentos;
create policy "kit lançamentos: leitura" on public.pntp_kit_lancamentos for select to authenticated
  using (public.tem_permissao(orgao_id, 'kit_pntp', 'ver'));
drop policy if exists "kit lançamentos: inclusão" on public.pntp_kit_lancamentos;
create policy "kit lançamentos: inclusão" on public.pntp_kit_lancamentos for insert to authenticated
  with check (public.tem_permissao(orgao_id, 'kit_pntp', 'editar'));
drop policy if exists "kit lançamentos: edição" on public.pntp_kit_lancamentos;
create policy "kit lançamentos: edição" on public.pntp_kit_lancamentos for update to authenticated
  using (public.tem_permissao(orgao_id, 'kit_pntp', 'editar')) with check (public.tem_permissao(orgao_id, 'kit_pntp', 'editar'));
drop policy if exists "kit lançamentos: exclusão" on public.pntp_kit_lancamentos;
create policy "kit lançamentos: exclusão" on public.pntp_kit_lancamentos for delete to authenticated
  using (public.tem_permissao(orgao_id, 'kit_pntp', 'editar'));
grant select, insert, update, delete on public.pntp_kit_lancamentos to authenticated;


-- ---------------------------------------------------------------------
-- 3. HISTÓRICO DAS GERAÇÕES
--    resumo  = { itens, atende, parcial, nao_atende, prints, paginas }
--    itens   = [{ c, titulo, situacao, respostas: {D,A,S,G,F}, links: [...], curto, completo, prints: [hash] }]
--    prints  = [{ hash, caminho, rota, url, nome, itens: [{ c, letras }], capturado_em, largura, altura }]
--    paginas = { rota: { filtros, exportar, anos, total, atualizacao } }  (lido da página na hora do print)
--    Os prints ficam em arquivos/<órgão>/kit_pntp/<hash>.png, um arquivo por print
--    (o print que comprova vários itens é guardado uma vez só).
-- ---------------------------------------------------------------------
create table if not exists public.pntp_kit_geracoes (
  id              uuid primary key default gen_random_uuid(),
  orgao_id        uuid not null references public.orgaos(id) on delete cascade,
  gerado_em       timestamptz not null default now(),
  gerado_por      uuid default auth.uid(),
  gerado_por_nome text,
  resumo          jsonb not null default '{}'::jsonb,
  itens           jsonb not null default '[]'::jsonb,
  prints          jsonb not null default '[]'::jsonb,
  paginas         jsonb not null default '{}'::jsonb
);
create index if not exists pntp_kit_geracoes_lista_idx on public.pntp_kit_geracoes (orgao_id, gerado_em desc, id desc);

create or replace function public.pntp_kit_geracao_quem()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.gerado_por := auth.uid();
  new.gerado_em := now();
  select coalesce(nullif(u.nome, ''), u.email) into new.gerado_por_nome from public.usuarios u where u.id = auth.uid();
  return new;
end;
$$;
drop trigger if exists pntp_kit_geracoes_quem on public.pntp_kit_geracoes;
create trigger pntp_kit_geracoes_quem before insert on public.pntp_kit_geracoes
  for each row execute function public.pntp_kit_geracao_quem();

alter table public.pntp_kit_geracoes enable row level security;
drop policy if exists "kit gerações: leitura" on public.pntp_kit_geracoes;
create policy "kit gerações: leitura" on public.pntp_kit_geracoes for select to authenticated
  using (public.tem_permissao(orgao_id, 'kit_pntp', 'ver'));
drop policy if exists "kit gerações: inclusão" on public.pntp_kit_geracoes;
create policy "kit gerações: inclusão" on public.pntp_kit_geracoes for insert to authenticated
  with check (public.tem_permissao(orgao_id, 'kit_pntp', 'editar'));
-- Histórico é prova do que estava publicado no dia: não se altera. Excluir só com "excluir".
drop policy if exists "kit gerações: exclusão" on public.pntp_kit_geracoes;
create policy "kit gerações: exclusão" on public.pntp_kit_geracoes for delete to authenticated
  using (public.tem_permissao(orgao_id, 'kit_pntp', 'excluir'));
grant select, insert, delete on public.pntp_kit_geracoes to authenticated;


-- ---------------------------------------------------------------------
-- 4. FATOS DO QUE ESTÁ PUBLICADO (para os textos de esclarecimento)
--    fonte: chave usada pelo painel; total: registros publicados; anos: exercícios
--    com registro; mais_recente: data do registro mais recente (publicação,
--    assinatura, sessão…); ultima_alteracao: última inclusão/alteração no portal.
--    Lista fechada de consultas (nada vem montado do navegador).
-- ---------------------------------------------------------------------
drop function if exists public.pntp_kit_fatos(uuid);
create or replace function public.pntp_kit_fatos(p_orgao uuid)
returns table (fonte text, total integer, anos integer[], mais_recente date, ultima_alteracao date)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.tem_permissao(p_orgao, 'kit_pntp', 'ver') then return; end if;
  return query
  -- Institucional
  select 'unidades', count(*)::int, null::int[], null::date, max(u.atualizado_em)::date from public.unidades u where u.orgao_id = p_orgao and u.ativo
  union all select 'gestores', count(*)::int, null, null, max(g.atualizado_em)::date from public.gestores g where g.orgao_id = p_orgao and g.ativo
  union all select 'faq', count(*)::int, null, null, max(q.atualizado_em)::date from public.faq q where q.orgao_id = p_orgao and q.ativo
  union all select 'publicacoes', count(*)::int, array_agg(distinct p.ano order by p.ano) filter (where p.ano is not null), max(p.data_publicacao), max(p.atualizado_em)::date
    from public.publicacoes p where p.orgao_id = p_orgao and p.situacao = 'publicado'
  union all select 'publicacoes_legislativo', count(*)::int, array_agg(distinct p.ano order by p.ano) filter (where p.ano is not null), max(p.data_publicacao), max(p.atualizado_em)::date
    from public.publicacoes p where p.orgao_id = p_orgao and p.situacao = 'publicado'
     and p.tipo in ('lei_organica', 'emenda_lei_organica', 'lei_complementar', 'lei', 'resolucao', 'decreto_legislativo')
  -- Receitas e despesas
  union all select 'receitas', count(*)::int, array_agg(distinct r.exercicio order by r.exercicio), max(make_date(r.exercicio, r.mes, 1)), max(r.atualizado_em)::date
    from public.receitas r where r.orgao_id = p_orgao
  union all select 'despesas', count(*)::int, array_agg(distinct d.exercicio order by d.exercicio), max(d.ultima_movimentacao), max(d.atualizado_em)::date
    from public.despesas d where d.orgao_id = p_orgao
  union all select 'ordem_cronologica', count(*)::int, array_agg(distinct o.exercicio order by o.exercicio) filter (where o.exercicio is not null), max(o.data_pagamento), max(o.atualizado_em)::date
    from public.ordem_cronologica o where o.orgao_id = p_orgao
  -- Convênios
  union all select 'convenios_' || c.tipo, count(*)::int, array_agg(distinct c.ano order by c.ano) filter (where c.ano is not null), max(c.data_assinatura), max(c.atualizado_em)::date
    from public.convenios c where c.orgao_id = p_orgao and c.situacao = 'publicado' group by c.tipo
  -- Pessoal e diárias
  union all select 'pessoal_servidores', count(*)::int, null, max(v.data_admissao), max(v.atualizado_em)::date from public.pessoal_vinculos v where v.orgao_id = p_orgao
  union all select 'pessoal_remuneracao', count(*)::int, array_agg(distinct r.exercicio order by r.exercicio), max(make_date(r.exercicio, r.mes, 1)), max(r.atualizado_em)::date
    from public.pessoal_remuneracoes r where r.orgao_id = p_orgao
  union all select 'pessoal_cargos', count(*)::int, null, null, max(c.atualizado_em)::date from public.pessoal_cargos c where c.orgao_id = p_orgao
  union all select 'pessoal_estagiarios', count(*)::int, null, max(e.data_inicio), max(e.atualizado_em)::date from public.pessoal_estagiarios e where e.orgao_id = p_orgao
  union all select 'pessoal_terceirizados', count(*)::int, array_agg(distinct t.exercicio order by t.exercicio) filter (where t.exercicio is not null), max(t.data_inicio), max(t.atualizado_em)::date
    from public.pessoal_terceirizados t where t.orgao_id = p_orgao
  union all select 'concursos', count(*)::int, array_agg(distinct c.ano order by c.ano), max(coalesce(c.inscricoes_inicio, c.publicado_em::date)), max(c.atualizado_em)::date
    from public.concursos c where c.orgao_id = p_orgao and c.situacao = 'publicado'
  union all select 'diarias_concedidas', count(*)::int, array_agg(distinct d.exercicio order by d.exercicio), max(d.data_inicio), max(d.atualizado_em)::date
    from public.diarias d where d.orgao_id = p_orgao
  union all select 'diarias_tabela', count(*)::int, null, max(v.vigencia_inicio), max(v.atualizado_em)::date from public.diarias_valores v where v.orgao_id = p_orgao
  -- Licitações e contratos
  union all select 'licitacoes_todos', count(*)::int, array_agg(distinct l.ano order by l.ano), max(l.data_publicacao), max(l.atualizado_em)::date
    from public.licitacoes l where l.orgao_id = p_orgao and l.situacao = 'publicado'
  union all select 'licitacoes_licitacoes', count(*)::int, array_agg(distinct l.ano order by l.ano), max(l.data_publicacao), max(l.atualizado_em)::date
    from public.licitacoes l where l.orgao_id = p_orgao and l.situacao = 'publicado' and l.modalidade not in ('dispensa', 'inexigibilidade', 'adesao_ata')
  union all select 'licitacoes_diretas', count(*)::int, array_agg(distinct l.ano order by l.ano), max(l.data_publicacao), max(l.atualizado_em)::date
    from public.licitacoes l where l.orgao_id = p_orgao and l.situacao = 'publicado' and l.modalidade in ('dispensa', 'inexigibilidade')
  union all select 'licitacoes_adesoes', count(*)::int, array_agg(distinct l.ano order by l.ano), max(l.data_publicacao), max(l.atualizado_em)::date
    from public.licitacoes l where l.orgao_id = p_orgao and l.situacao = 'publicado' and l.modalidade = 'adesao_ata'
  union all select 'licitacoes_documentos', count(*)::int, null, null, null::date
    from public.licitacoes_documentos k join public.licitacoes l on l.id = k.licitacao_id where l.orgao_id = p_orgao and l.situacao = 'publicado'
  union all select 'pca', count(*)::int, array_agg(distinct x.ano order by x.ano), max(x.data_aprovacao), max(x.atualizado_em)::date
    from public.pca x where x.orgao_id = p_orgao and x.situacao = 'publicado'
  union all select 'sancionados', count(*)::int, array_agg(distinct x.ano order by x.ano) filter (where x.ano is not null), max(x.data_aplicacao), max(x.atualizado_em)::date
    from public.sancoes x where x.orgao_id = p_orgao and x.situacao = 'publicado'
  union all select 'contratos', count(*)::int, array_agg(distinct c.ano order by c.ano), max(c.data_assinatura), max(c.atualizado_em)::date
    from public.contratos c where c.orgao_id = p_orgao and c.situacao = 'publicado'
  union all select 'contratos_integra', count(*)::int, null, null, null::date
    from public.contratos c where c.orgao_id = p_orgao and c.situacao = 'publicado' and (c.arquivo_url is not null or c.link_externo is not null)
  union all select 'fiscais', count(*)::int, null, max(f.inicio), max(f.criado_em)::date
    from public.contratos_fiscais f where f.orgao_id = p_orgao
  -- Obras
  union all select 'obras', count(*)::int, array_agg(distinct o.ano order by o.ano) filter (where o.ano is not null), max(o.data_inicio), max(o.atualizado_em)::date
    from public.obras o where o.orgao_id = p_orgao and o.situacao = 'publicado'
  union all select 'obras_paralisadas', count(*)::int, null, max(p.inicio), max(p.criado_em)::date
    from public.obras_paralisacoes p where p.orgao_id = p_orgao and p.reinicio is null
  -- Planejamento e contas (um por tipo de documento)
  union all select 'planejamento_' || d.tipo, count(*)::int, array_agg(distinct d.exercicio order by d.exercicio), max(d.data_publicacao), max(d.atualizado_em)::date
    from public.documentos_contas d where d.orgao_id = p_orgao and d.situacao = 'publicado' group by d.tipo
  -- e-SIC, Ouvidoria e serviços
  union all select a.canal || '_relatorios', count(*)::int, array_agg(distinct a.exercicio order by a.exercicio), max(a.data_fim), max(a.atualizado_em)::date
    from public.atendimento_relatorios a where a.orgao_id = p_orgao and a.situacao = 'publicado' group by a.canal
  union all select 'esic_classificadas', count(*)::int, array_agg(distinct i.exercicio order by i.exercicio) filter (where i.exercicio is not null), max(i.data_classificacao), max(i.atualizado_em)::date
    from public.informacoes_classificadas i where i.orgao_id = p_orgao and i.situacao = 'publicado' and i.data_desclassificacao is null
  union all select 'esic_desclassificadas', count(*)::int, array_agg(distinct i.ano_desclassificacao order by i.ano_desclassificacao) filter (where i.ano_desclassificacao is not null), max(i.data_desclassificacao), max(i.atualizado_em)::date
    from public.informacoes_classificadas i where i.orgao_id = p_orgao and i.situacao = 'publicado' and i.data_desclassificacao is not null
  union all select 'carta_servicos', count(*)::int, null, null, max(s.atualizado_em)::date from public.servicos s where s.orgao_id = p_orgao and s.situacao = 'publicado'
  union all select 'servicos_online', count(*)::int, null, null, max(s.atualizado_em)::date from public.servicos s where s.orgao_id = p_orgao and s.situacao = 'publicado' and s.link_digital is not null
  -- Câmara (matriz do Legislativo)
  union all select 'parlamentares', count(*)::int, null, null, max(p.atualizado_em)::date from public.parlamentares p where p.orgao_id = p_orgao and p.situacao = 'publicado' and p.em_exercicio
  union all select 'proposicoes', count(*)::int, array_agg(distinct p.ano order by p.ano), max(p.data_apresentacao), max(p.atualizado_em)::date
    from public.proposicoes p where p.orgao_id = p_orgao and p.situacao = 'publicado'
  union all select 'sessoes', count(*)::int, array_agg(distinct extract(year from s.data)::int order by extract(year from s.data)::int), max(s.data), max(s.atualizado_em)::date
    from public.sessoes s where s.orgao_id = p_orgao and s.situacao = 'publicado' and s.comissao_id is null
  union all select 'sessoes_pauta', count(*)::int, array_agg(distinct extract(year from s.data)::int order by extract(year from s.data)::int), max(s.data), max(s.atualizado_em)::date
    from public.sessoes s where s.orgao_id = p_orgao and s.situacao = 'publicado' and s.comissao_id is null and (coalesce(s.pauta, '') <> '' or s.pauta_url is not null)
  union all select 'sessoes_ata', count(*)::int, array_agg(distinct extract(year from s.data)::int order by extract(year from s.data)::int), max(s.data), max(s.atualizado_em)::date
    from public.sessoes s where s.orgao_id = p_orgao and s.situacao = 'publicado' and s.comissao_id is null and s.ata_url is not null
  union all select 'sessoes_presenca', count(distinct s.id)::int, array_agg(distinct extract(year from s.data)::int order by extract(year from s.data)::int), max(s.data), max(s.atualizado_em)::date
    from public.sessoes s join public.sessoes_presencas k on k.sessao_id = s.id where s.orgao_id = p_orgao and s.situacao = 'publicado'
  union all select 'sessoes_video', count(*)::int, array_agg(distinct extract(year from s.data)::int order by extract(year from s.data)::int), max(s.data), max(s.atualizado_em)::date
    from public.sessoes s where s.orgao_id = p_orgao and s.situacao = 'publicado' and s.video_url is not null
  union all select 'comissoes', count(*)::int, null, null, max(c.atualizado_em)::date from public.comissoes c where c.orgao_id = p_orgao and c.situacao = 'publicado'
  union all select 'comissoes_reunioes', count(*)::int, array_agg(distinct extract(year from s.data)::int order by extract(year from s.data)::int), max(s.data), max(s.atualizado_em)::date
    from public.sessoes s where s.orgao_id = p_orgao and s.situacao = 'publicado' and s.comissao_id is not null
  union all select 'votacoes', count(*)::int, array_agg(distinct extract(year from s.data)::int order by extract(year from s.data)::int), max(s.data), max(v.atualizado_em)::date
    from public.votacoes v join public.sessoes s on s.id = v.sessao_id where v.orgao_id = p_orgao and s.situacao = 'publicado'
  union all select 'julgamento_contas', count(*)::int, array_agg(distinct d.exercicio order by d.exercicio), max(d.data_publicacao), max(d.atualizado_em)::date
    from public.documentos_contas d where d.orgao_id = p_orgao and d.situacao = 'publicado' and d.tipo = 'julgamento_camara'
  union all select 'verba_indenizatoria', count(*)::int, array_agg(distinct extract(year from x.data)::int order by extract(year from x.data)::int), max(x.data), max(x.atualizado_em)::date
    from public.verba_indenizatoria x where x.orgao_id = p_orgao and x.situacao = 'publicado';
end;
$$;
grant execute on function public.pntp_kit_fatos(uuid) to authenticated;

-- Conferência
select codigo, nome, grupo, tipos_orgao from public.modulos where codigo = 'kit_pntp';
select p.nome as perfil, pp.pode_ver, pp.pode_editar from public.perfil_permissoes pp join public.perfis p on p.id = pp.perfil_id
where pp.modulo = 'kit_pntp' and p.orgao_id is null order by p.nome;
