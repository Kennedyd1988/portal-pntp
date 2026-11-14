-- =====================================================================
-- PORTAL PNTP · SOFT+ — Piloto Riacho da Cruz: Destinos das páginas
-- Liga as páginas cujos dados ficam no sistema de gestão (Município Online)
-- e acrescenta, em Licitações e Contratos, o Município Online como "outro
-- endereço" explicado (a página do portal continua com o que veio do site antigo).
-- Pode ser revisto depois em Aparência › Destinos das páginas.
-- =====================================================================
do $$
declare
  org uuid := (select id from public.orgaos where regexp_replace(cnpj, '\D', '', 'g') = '08153454000104');
  mo text := 'https://municipioonline.com.br/rn/prefeitura/riachodacruz';
begin
  update public.orgaos o set configuracoes = coalesce(o.configuracoes, '{}'::jsonb)
    || jsonb_build_object('transparencia_url', mo || '/cidadao/transparencia')
    || jsonb_build_object('destinos', coalesce(o.configuracoes -> 'destinos', '{}'::jsonb) || jsonb_build_object(
         'receitas',          mo || '/cidadao/receita',
         'despesas',          mo || '/cidadao/despesa',
         'ordem_cronologica', mo || '/fornecedor/ordemcronologica',
         'pessoal',           mo || '/cidadao/servidor',
         'diarias',           mo || '/cidadao/diarias',
         'convenios',         mo || '/cidadao/publicacaoconvenio',
         'emendas',           mo || '/cidadao/publicacaoemenda'))
    || jsonb_build_object('destinos_links', coalesce(o.configuracoes -> 'destinos_links', '{}'::jsonb) || jsonb_build_object(
         'licitacoes', jsonb_build_array(jsonb_build_object('descricao', 'Licitações, dispensas e inexigibilidades no sistema de gestão da Prefeitura (Município Online)',
                                                            'de', 2025, 'ate', 2026, 'url', mo || '/cidadao/publicacaocontratacoes')),
         'contratos',  jsonb_build_array(jsonb_build_object('descricao', 'Contratos no sistema de gestão da Prefeitura (Município Online)',
                                                            'de', 2025, 'ate', 2026, 'url', mo || '/cidadao/publicacaocontrato'))))
  where o.id = org;
end $$;
select configuracoes -> 'destinos' as destinos, configuracoes -> 'destinos_links' as outros
  from public.orgaos where regexp_replace(cnpj, '\D', '', 'g') = '08153454000104';
