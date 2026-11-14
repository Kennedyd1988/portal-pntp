-- =====================================================================
-- PORTAL PNTP · SOFT+
-- APAGA TODOS OS DADOS FICTÍCIOS DE TESTE (Riacho da Cruz)
--
-- Desde o script 26, um registro ligado a outro não pode ser excluído: por isso
-- os dados de teste saem aqui na ordem certa (primeiro os ligados). Só apaga o
-- que os scripts teste_*.sql criaram (marcados com "TESTE", "T-", "(teste)" ou
-- "?teste=1"). Pode rodar mais de uma vez. O resultado mostra o que sobrou.
-- =====================================================================
do $$
declare
  o uuid := (select id from public.orgaos where cnpj = '08.153.454/0001-04');
begin
  if o is null then raise notice 'Órgão piloto não encontrado: nada a apagar.'; return; end if;
  perform set_config('pntp.importando', '1', true);
  -- Financeiro e pessoal
  delete from public.despesas_movimentos where despesa_id in (select id from public.despesas where orgao_id = o and processo like 'TESTE%');
  delete from public.ordem_cronologica where orgao_id = o and (documento_fiscal like 'TESTE%' or despesa_id in (select id from public.despesas where orgao_id = o and processo like 'TESTE%'));
  delete from public.despesas where orgao_id = o and processo like 'TESTE%';
  delete from public.receitas where orgao_id = o and fonte_descricao like 'TESTE%';
  delete from public.divida_ativa where orgao_id = o and tributo like '%(teste)';
  delete from public.pessoal_remuneracoes where orgao_id = o and matricula like 'T-%';
  delete from public.pessoal_vinculos where orgao_id = o and matricula like 'T-%';
  delete from public.pessoal_cargos where orgao_id = o and norma like 'TESTE%';
  delete from public.pessoal_estagiarios where orgao_id = o and instituicao like 'TESTE%';
  delete from public.pessoal_terceirizados where orgao_id = o and contrato_numero like 'TESTE%';
  delete from public.diarias where orgao_id = o and ato_concessao like 'TESTE%';
  delete from public.diarias_valores where orgao_id = o and norma like 'TESTE%';
  -- Obras
  delete from public.obras_itens where obra_id in (select id from public.obras where orgao_id = o and fonte_recurso like 'TESTE%');
  delete from public.obras_medicoes where obra_id in (select id from public.obras where orgao_id = o and fonte_recurso like 'TESTE%');
  delete from public.obras_paralisacoes where obra_id in (select id from public.obras where orgao_id = o and fonte_recurso like 'TESTE%');
  delete from public.obras where orgao_id = o and fonte_recurso like 'TESTE%';
  -- Contratos e licitações
  delete from public.contratos_aditivos where contrato_id in (select id from public.contratos where orgao_id = o and processo like 'TESTE%');
  delete from public.contratos_fiscais where contrato_id in (select id from public.contratos where orgao_id = o and processo like 'TESTE%');
  delete from public.contratos where orgao_id = o and processo like 'TESTE%';
  delete from public.licitacoes_documentos where licitacao_id in (select id from public.licitacoes where orgao_id = o and processo like 'TESTE%');
  delete from public.licitacoes where orgao_id = o and processo like 'TESTE%';
  delete from public.pca where orgao_id = o and descricao like 'TESTE%';
  delete from public.sancoes where orgao_id = o and processo like 'TESTE%';
  -- Convênios e emendas (emenda ligada ao convênio sai antes)
  delete from public.emendas where orgao_id = o and observacao like 'TESTE%';
  delete from public.convenios where orgao_id = o and processo like 'TESTE%';
  -- Planejamento, publicações, e-SIC/Ouvidoria
  delete from public.documentos_contas where orgao_id = o and (link_externo like '%teste=1%' or descricao = 'TESTE');
  delete from public.publicacoes where orgao_id = o and link_externo like '%teste=1%';
  delete from public.atendimento_relatorios where orgao_id = o and observacao like 'TESTE%';
  delete from public.informacoes_classificadas where orgao_id = o and codigo like 'TESTE%';
end $$;

select 'licitacoes' as tabela, count(*) from public.licitacoes union all select 'contratos', count(*) from public.contratos
union all select 'obras', count(*) from public.obras union all select 'despesas', count(*) from public.despesas
union all select 'receitas', count(*) from public.receitas union all select 'convenios', count(*) from public.convenios
union all select 'emendas', count(*) from public.emendas union all select 'pessoal_vinculos', count(*) from public.pessoal_vinculos
union all select 'publicacoes', count(*) from public.publicacoes union all select 'documentos_contas', count(*) from public.documentos_contas;
