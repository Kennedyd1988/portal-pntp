-- =====================================================================
-- PORTAL PNTP · SOFT+ — APAGA os dados fictícios de e-SIC e Ouvidoria
-- (criados por teste_atendimento_ficticio.sql) da Prefeitura de Riacho da Cruz:
-- registros "[TESTE]", relatórios gerados pelo sistema, numeração e a
-- configuração de TESTE dos canais (o sistema próprio fica desligado; os
-- dados verdadeiros do SIC e da Ouvidoria são informados depois no painel).
-- Não toca em registros reais.
-- =====================================================================
do $$
declare org uuid := (select id from public.orgaos where regexp_replace(cnpj, '\D', '', 'g') = '08153454000104');
begin
  create temp table _teste on commit drop as select id from public.atendimentos where orgao_id = org and assunto like '[TESTE]%';
  delete from public.atendimentos_avaliacoes where atendimento_id in (select id from _teste);
  delete from public.atendimentos_recursos   where atendimento_id in (select id from _teste);
  delete from public.atendimentos_tramites   where atendimento_id in (select id from _teste);
  delete from public.atendimentos_anexos     where atendimento_id in (select id from _teste);
  delete from public.atendimentos_acessos    where atendimento_id in (select id from _teste);
  delete from public.atendimentos_emails     where atendimento_id in (select id from _teste);
  delete from public.atendimentos_solicitantes where atendimento_id in (select id from _teste);
  delete from public.atendimentos_segredos   where atendimento_id in (select id from _teste);
  delete from public.atendimentos where id in (select id from _teste);
  if not exists (select 1 from public.atendimentos where orgao_id = org) then
    delete from public.atendimento_relatorios where orgao_id = org and origem = 'sistema';
    delete from public.atendimentos_numeros where orgao_id = org;
  end if;
  update public.atendimento_canais
     set sistema_proprio = false, sistema_desde = null, setor = null, responsavel_nome = null, responsavel_cargo = null, responsavel_ato = null,
         endereco = null, telefone = null, horario = null, outros_canais = null, prazo_resposta = null, prazo_recurso = null,
         prazo_decisao_recurso = null, autoridade_recurso_1 = null, autoridade_recurso_2 = null, procedimento_recurso = null, norma_texto = null
   where orgao_id = org and coalesce(setor, '') like '%(TESTE)%';
end $$;
select canal, count(*) from public.atendimentos where orgao_id = (select id from public.orgaos where regexp_replace(cnpj, '\D', '', 'g') = '08153454000104') group by 1;
