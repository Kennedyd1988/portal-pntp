-- =====================================================================
-- PORTAL PNTP · SOFT+ — DADOS FICTÍCIOS PARA TESTE: Consórcio público
-- Cria (se não existir) o órgão "Consórcio Teste SOFT+" (tipo consórcio,
-- CNPJ fictício 99.000.001/0001-01), com menu padrão, unidades (assembleia,
-- diretoria), gestores, 4 entes consorciados, documentos constitutivos,
-- contratos de rateio (2023 a 2026, faltando de propósito um ente em 2026),
-- contratos de programa, atas e orçamentos. Tudo publicado e marcado "(TESTE)".
-- Pode rodar de novo: apaga os fictícios antes.
-- Para apagar tudo (inclusive o órgão): teste_consorcio_limpar.sql
-- Rodar depois do script 39.
-- =====================================================================
do $$
declare
  org uuid := (select id from public.orgaos where cnpj = '99.000.001/0001-01');
  e uuid[] := '{}'; eid uuid; ag uuid; de uuid; i int; a int;
  nomes text[] := array['Município Alfa (TESTE)', 'Município Beta (TESTE)', 'Município Gama (TESTE)', 'Município Delta (TESTE)'];
  cnpjs text[] := array['99000002000148', '99000003000192', '99000004000137', '99000005000181'];
  pdf constant text := 'https://www.gov.br/pt-br/arquivos-teste/documento-teste.pdf';
begin
  if org is null then
    insert into public.orgaos (nome, sigla, tipo, cnpj, municipio, uf, configuracoes)
    values ('Consórcio Teste SOFT+', 'CTS', 'consorcio', '99.000.001/0001-01', 'Riacho da Cruz', 'RN',
            jsonb_build_object('nome_exibicao', 'Consórcio Teste SOFT+', 'cor_principal', '#0d6e4f',
              'endereco', 'Rua do Teste, 100, Centro (TESTE)', 'telefone', '(84) 0000-0000', 'email', 'teste@exemplo.org',
              'horario', 'Segunda a sexta, das 8h às 14h (TESTE)'))
    returning id into org;
    perform public.criar_menu_padrao(org);
  end if;

  delete from public.consorcio_documentos where orgao_id = org;
  delete from public.consorcio_entes where orgao_id = org;
  delete from public.gestores where orgao_id = org and cargo like '%(TESTE)%';
  delete from public.unidades where orgao_id = org and unidade_pai_id is not null and nome like '%(TESTE)%';
  delete from public.unidades where orgao_id = org and nome like '%(TESTE)%';

  -- Estrutura organizacional (2.1): assembleia geral > diretoria executiva > setores
  insert into public.unidades (orgao_id, nome, sigla, competencias, ordem) values
    (org, 'Assembleia Geral (TESTE)', 'AG', 'Instância máxima do consórcio, formada pelos chefes do Poder Executivo dos entes consorciados. Aprova o orçamento, o estatuto e elege a diretoria.', 1)
    returning id into ag;
  insert into public.unidades (orgao_id, unidade_pai_id, nome, sigla, competencias, ordem) values
    (org, ag, 'Diretoria Executiva (TESTE)', 'DE', 'Executa as decisões da Assembleia Geral e administra o consórcio no dia a dia.', 2)
    returning id into de;
  insert into public.unidades (orgao_id, unidade_pai_id, nome, sigla, competencias, ordem) values
    (org, de, 'Setor Administrativo e Financeiro (TESTE)', 'SAF', 'Contabilidade, licitações, contratos, pessoal e prestação de contas do consórcio.', 3);
  insert into public.gestores (orgao_id, unidade_id, nome, cargo, ordem) values
    (org, ag, 'Fulano de Tal', 'Presidente do Consórcio (TESTE)', 1),
    (org, de, 'Beltrana de Souza', 'Diretora Executiva (TESTE)', 2);

  -- 25.7 Entes consorciados (o 4º saiu em 2025)
  for i in 1 .. 4 loop
    insert into public.consorcio_entes (orgao_id, nome, uf, cnpj, lei_ratificacao, lei_ratificacao_url, data_ingresso, data_saida, situacao_ente, ordem, situacao)
    values (org, nomes[i], 'RN', cnpjs[i], 'Lei nº ' || (100 + i) || '/2019 (TESTE)', pdf, date '2019-03-01',
            case when i = 4 then date '2025-06-30' end, case when i = 4 then 'retirado' else 'ativo' end, i, 'publicado')
    returning id into eid;
    e := e || eid;
  end loop;

  -- 25.1 e 25.2 Documentos constitutivos
  insert into public.consorcio_documentos (orgao_id, tipo, titulo, numero, data, descricao, arquivo_url, situacao) values
    (org, 'protocolo_intencoes', 'Protocolo de intenções do Consórcio Teste (TESTE)', null, date '2019-01-15', 'Subscrito pelos chefes do Executivo dos entes fundadores.', pdf, 'publicado'),
    (org, 'contrato_consorcio', 'Contrato de consórcio público (TESTE)', '01/2019', date '2019-04-10', 'Ratificado por lei de cada ente.', pdf, 'publicado'),
    (org, 'estatuto', 'Estatuto do Consórcio Teste — versão consolidada (TESTE)', null, date '2024-03-20', 'Versão vigente, com as alterações aprovadas em assembleia.', pdf, 'publicado'),
    (org, 'alteracao_estatutaria', '1ª alteração do estatuto (TESTE)', '01/2024', date '2024-03-20', 'Aprovada na assembleia geral de 20/03/2024.', pdf, 'publicado');

  -- 25.3 Contratos de rateio: 2023 a 2026; em 2026 falta o Município Gama (para conferir o aviso)
  for a in 2023 .. 2026 loop
    for i in 1 .. 4 loop
      continue when (a = 2026 and i = 3) or (i = 4 and a > 2025);
      insert into public.consorcio_documentos (orgao_id, tipo, titulo, numero, exercicio, data, ente_id, valor, vigencia_inicio, vigencia_fim, arquivo_url, situacao)
      values (org, 'contrato_rateio', 'Contrato de rateio ' || a || ' — ' || nomes[i], lpad(i::text, 2, '0') || '/' || a, a, make_date(a, 1, 10), e[i],
              120000 + i * 15000 + (a - 2023) * 5000, make_date(a, 1, 1), make_date(a, 12, 31), pdf, 'publicado');
    end loop;
  end loop;

  -- 25.4 Contratos de programa
  insert into public.consorcio_documentos (orgao_id, tipo, titulo, numero, data, ente_id, vigencia_inicio, vigencia_fim, descricao, arquivo_url, situacao) values
    (org, 'contrato_programa', 'Contrato de programa — coleta de resíduos (TESTE)', '01/2024', date '2024-02-01', e[1], date '2024-02-01', date '2028-01-31', 'Prestação do serviço de coleta e destinação de resíduos sólidos.', pdf, 'publicado'),
    (org, 'contrato_programa', 'Contrato de programa — manutenção de estradas (TESTE)', '02/2025', date '2025-03-01', e[2], date '2025-03-01', date '2027-02-28', 'Manutenção de estradas vicinais.', pdf, 'publicado');

  -- 25.5 e 25.6 Atas
  insert into public.consorcio_documentos (orgao_id, tipo, titulo, data, descricao, arquivo_url, situacao) values
    (org, 'ata_eleicao', 'Ata de eleição da diretoria para o biênio 2025–2026 (TESTE)', date '2025-01-20', 'Eleição do presidente e da diretoria executiva.', pdf, 'publicado'),
    (org, 'ata_assembleia', 'Ata da 1ª assembleia geral ordinária de 2023 (TESTE)', date '2023-03-15', null, pdf, 'publicado'),
    (org, 'ata_assembleia', 'Ata da 1ª assembleia geral ordinária de 2024 (TESTE)', date '2024-03-20', 'Aprovou a alteração do estatuto.', pdf, 'publicado'),
    (org, 'ata_assembleia', 'Ata da 1ª assembleia geral ordinária de 2025 (TESTE)', date '2025-03-18', null, pdf, 'publicado'),
    (org, 'ata_assembleia', 'Ata da assembleia geral extraordinária de 2026 (TESTE)', least(current_date, date '2026-09-10'), 'Aprovou o orçamento de 2027.', pdf, 'publicado');

  -- 11.11 Orçamento do consórcio (2023 a 2026)
  for a in 2023 .. 2026 loop
    insert into public.consorcio_documentos (orgao_id, tipo, titulo, exercicio, data, valor, descricao, arquivo_url, situacao)
    values (org, 'orcamento', 'Orçamento do consórcio para ' || a || ' (TESTE)', a, make_date(a - 1, 11, 30), 600000 + (a - 2023) * 30000,
            'Receita estimada e despesa fixada, aprovadas pela assembleia geral.', pdf, 'publicado');
  end loop;
end $$;

-- Conferência rápida
select tipo, count(*) from public.consorcio_documentos where orgao_id = (select id from public.orgaos where cnpj = '99.000.001/0001-01') group by tipo order by tipo;
