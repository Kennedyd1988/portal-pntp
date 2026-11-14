-- =====================================================================
-- PORTAL PNTP · SOFT+ — APAGA O CONSÓRCIO DE TESTE
-- Exclui o órgão "Consórcio Teste SOFT+" (CNPJ fictício 99.000.001/0001-01)
-- com tudo o que foi criado para ele (teste_consorcio_ficticio.sql e o que
-- tiver sido cadastrado pelo painel nos testes). Não toca em nenhum outro órgão.
-- =====================================================================
do $$
declare org uuid := (select id from public.orgaos where cnpj = '99.000.001/0001-01' and nome = 'Consórcio Teste SOFT+');
begin
  if org is null then raise notice 'Consórcio de teste não encontrado: nada a apagar.'; return; end if;
  -- Tudo do órgão sai num só comando (os vínculos protegidos são conferidos no fim dele, script 26).
  delete from public.orgaos where id = org;
  raise notice 'Consórcio de teste apagado.';
end $$;
select count(*) as consorcio_teste_restante from public.orgaos where cnpj = '99.000.001/0001-01';
