-- =====================================================================
-- Script 52 — Atividade de UM vereador, rápida (0.46.4)
-- O perfil do vereador no site usava atividade_parlamentar(órgão, todos os anos), que conta
-- todos os vereadores e, em Câmaras com muitos votos e presenças, às vezes estoura o tempo
-- ("statement timeout") — aí o quadro "Atividade do vereador" sumia da página.
-- Agora: índices por vereador nas presenças e votos, e a função atividade_vereador(p_parlamentar),
-- que conta só aquele vereador (todos os anos), apenas com o que está publicado.
-- Pode rodar mais de uma vez.
-- =====================================================================
create index if not exists sessoes_presencas_parl_idx on public.sessoes_presencas (parlamentar_id, sessao_id);
create index if not exists votacoes_votos_parl_idx on public.votacoes_votos (parlamentar_id, votacao_id);
create index if not exists proposicoes_autores_parl_idx on public.proposicoes_autores (parlamentar_id, papel);

create or replace function public.atividade_vereador(p_parlamentar uuid)
returns table (nome text, partido text, autorias bigint, relatorias bigint, sessoes bigint, presencas bigint, votos bigint, comissoes text,
               diarias bigint, diarias_valor numeric, emendas bigint, emendas_valor numeric)
language sql stable security definer set search_path = public as $$
  select coalesce(p.nome_parlamentar, p.nome), p.partido,
    (select count(*) from public.proposicoes_autores a join public.proposicoes x on x.id = a.proposicao_id
      where a.parlamentar_id = p.id and a.papel in ('autor', 'coautor') and x.situacao = 'publicado'),
    (select count(*) from public.proposicoes_autores a join public.proposicoes x on x.id = a.proposicao_id
      where a.parlamentar_id = p.id and a.papel = 'relator' and x.situacao = 'publicado'),
    (select count(*) from public.sessoes_presencas sp join public.sessoes s on s.id = sp.sessao_id
      where sp.parlamentar_id = p.id and s.situacao = 'publicado'),
    (select count(*) from public.sessoes_presencas sp join public.sessoes s on s.id = sp.sessao_id
      where sp.parlamentar_id = p.id and sp.presente and s.situacao = 'publicado'),
    (select count(*) from public.votacoes_votos vv join public.votacoes v on v.id = vv.votacao_id join public.sessoes s on s.id = v.sessao_id
      where vv.parlamentar_id = p.id and vv.voto in ('sim', 'nao', 'abstencao') and s.situacao = 'publicado'),
    (select string_agg(c.nome || case m.funcao when 'membro' then '' else ' (' || replace(m.funcao, '_', '-') || ')' end, '; ' order by c.nome)
       from public.comissoes_membros m join public.comissoes c on c.id = m.comissao_id where m.parlamentar_id = p.id and c.situacao = 'publicado' and c.ativa),
    (select count(*) from public.diarias d where d.parlamentar_id = p.id),
    (select coalesce(sum(d.valor_total), 0) from public.diarias d where d.parlamentar_id = p.id),
    (select count(*) from public.emendas e where e.parlamentar_id = p.id and e.situacao = 'publicado'),
    (select coalesce(sum(e.valor_previsto), 0) from public.emendas e where e.parlamentar_id = p.id and e.situacao = 'publicado')
  from public.parlamentares p
  where p.id = p_parlamentar and p.situacao = 'publicado';
$$;
revoke all on function public.atividade_vereador(uuid) from public;
grant execute on function public.atividade_vereador(uuid) to anon, authenticated;

select 'atividade_vereador criada' as resultado;
