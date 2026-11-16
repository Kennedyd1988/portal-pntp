-- =====================================================================
-- Script 45 — Atividade do vereador em todos os anos (0.42.1)
-- atividade_parlamentar(p_orgao, p_ano): com p_ano nulo, conta todos os anos
-- (perfil do vereador no site: quadro "Atividade do vereador"). Com ano, igual ao script 36.
-- Pode rodar mais de uma vez.
-- =====================================================================
create or replace function public.atividade_parlamentar(p_orgao uuid, p_ano integer)
returns table (parlamentar_id uuid, nome text, partido text, autorias bigint, relatorias bigint, sessoes bigint, presencas bigint, votos bigint, comissoes text,
               diarias bigint, diarias_valor numeric, emendas bigint, emendas_valor numeric)
language sql stable security invoker set search_path = public as $$
  select p.id, coalesce(p.nome_parlamentar, p.nome), p.partido,
    (select count(*) from public.proposicoes_autores a join public.proposicoes x on x.id = a.proposicao_id
      where a.parlamentar_id = p.id and a.papel in ('autor', 'coautor') and (p_ano is null or x.ano = p_ano) and x.situacao = 'publicado'),
    (select count(*) from public.proposicoes_autores a join public.proposicoes x on x.id = a.proposicao_id
      where a.parlamentar_id = p.id and a.papel = 'relator' and (p_ano is null or x.ano = p_ano) and x.situacao = 'publicado'),
    (select count(*) from public.sessoes_presencas sp join public.sessoes s on s.id = sp.sessao_id
      where sp.parlamentar_id = p.id and (p_ano is null or extract(year from s.data)::int = p_ano) and s.situacao = 'publicado'),
    (select count(*) from public.sessoes_presencas sp join public.sessoes s on s.id = sp.sessao_id
      where sp.parlamentar_id = p.id and sp.presente and (p_ano is null or extract(year from s.data)::int = p_ano) and s.situacao = 'publicado'),
    (select count(*) from public.votacoes_votos vv join public.votacoes v on v.id = vv.votacao_id join public.sessoes s on s.id = v.sessao_id
      where vv.parlamentar_id = p.id and vv.voto in ('sim', 'nao', 'abstencao') and (p_ano is null or extract(year from s.data)::int = p_ano) and s.situacao = 'publicado'),
    (select string_agg(c.nome || case m.funcao when 'membro' then '' else ' (' || replace(m.funcao, '_', '-') || ')' end, '; ' order by c.nome)
       from public.comissoes_membros m join public.comissoes c on c.id = m.comissao_id where m.parlamentar_id = p.id and c.situacao = 'publicado' and c.ativa),
    (select count(*) from public.diarias d where d.parlamentar_id = p.id and (p_ano is null or d.exercicio = p_ano)),
    (select coalesce(sum(d.valor_total), 0) from public.diarias d where d.parlamentar_id = p.id and (p_ano is null or d.exercicio = p_ano)),
    (select count(*) from public.emendas e where e.parlamentar_id = p.id and (p_ano is null or e.exercicio = p_ano) and e.situacao = 'publicado'),
    (select coalesce(sum(e.valor_previsto), 0) from public.emendas e where e.parlamentar_id = p.id and (p_ano is null or e.exercicio = p_ano) and e.situacao = 'publicado')
  from public.parlamentares p
  where p.orgao_id = p_orgao and p.situacao = 'publicado'
  order by p.em_exercicio desc, p.ordem, p.nome;
$$;
grant execute on function public.atividade_parlamentar(uuid, integer) to anon, authenticated;

select 'atividade_parlamentar aceita todos os anos' as resultado;
