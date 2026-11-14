-- =====================================================================
-- PORTAL PNTP · SOFT+ — DADOS FICTÍCIOS PARA TESTE: Câmara Municipal
-- Usa o primeiro órgão do tipo "camara". Cria vereadores, comissões,
-- proposições com autoria e tramitação, sessões com pauta, ata, presenças e
-- votações nominais, e pagamentos de verba indenizatória. Tudo publicado e
-- marcado "(TESTE)". Pode rodar de novo: apaga os fictícios antes.
-- =====================================================================
do $$
declare
  org uuid := (select id from public.orgaos where tipo = 'camara' order by criado_em limit 1);
  v uuid[] := '{}'; pid uuid; cid1 uuid; cid2 uuid; sid uuid; vid uuid; i int; prop uuid[] := '{}';
  nomes text[] := array['Ana Paula Rocha', 'Bruno Medeiros', 'Carlos Alberto Lima', 'Daniela Souza', 'Edson Pereira', 'Fátima Nunes', 'Gilberto Alves', 'Helena Costa', 'Ivo Fernandes'];
  partidos text[] := array['MDB', 'PL', 'PT', 'PSD', 'UNIÃO', 'PP', 'PSB', 'REPUBLICANOS', 'PDT'];
begin
  if org is null then raise exception 'Cadastre antes um órgão do tipo Câmara.'; end if;
  delete from public.votacoes_votos where orgao_id = org;
  delete from public.votacoes where orgao_id = org;
  delete from public.sessoes_presencas where orgao_id = org;
  delete from public.sessoes where orgao_id = org and local like '%(TESTE)%';
  delete from public.proposicoes_tramites where orgao_id = org;
  delete from public.proposicoes_autores where orgao_id = org;
  delete from public.proposicoes where orgao_id = org and ementa like '%(TESTE)%';
  delete from public.comissoes_membros where orgao_id = org;
  delete from public.comissoes where orgao_id = org and nome like '%(TESTE)%';
  delete from public.verba_indenizatoria where orgao_id = org and descricao like '%(TESTE)%';
  delete from public.parlamentares where orgao_id = org and biografia like '%(TESTE)%';

  for i in 1 .. 9 loop
    insert into public.parlamentares (orgao_id, nome, partido, cargo_mesa, biografia, legislatura_inicio, legislatura_fim, ordem, situacao, foto_url)
    values (org, nomes[i], partidos[i], case i when 1 then 'Presidente' when 2 then 'Vice-presidente' when 3 then '1º Secretário' end,
            'Vereador(a) em primeiro mandato, natural do município, com atuação nas áreas de saúde e educação. (TESTE)', 2025, 2028, i, 'publicado',
            'https://ui-avatars.com/api/?size=300&name=' || replace(nomes[i], ' ', '+'))
    returning id into pid;
    v := v || pid;
  end loop;

  insert into public.comissoes (orgao_id, nome, tipo, competencias, inicio, situacao) values
    (org, 'Comissão de Legislação, Justiça e Redação Final (TESTE)', 'permanente', 'Constitucionalidade, legalidade e redação dos projetos.', date '2025-01-02', 'publicado') returning id into cid1;
  insert into public.comissoes (orgao_id, nome, tipo, competencias, inicio, situacao) values
    (org, 'Comissão de Finanças e Orçamento (TESTE)', 'permanente', 'Matérias orçamentárias, contas e tributos.', date '2025-01-02', 'publicado') returning id into cid2;
  insert into public.comissoes_membros (orgao_id, comissao_id, parlamentar_id, funcao) values
    (org, cid1, v[3], 'presidente'), (org, cid1, v[4], 'relator'), (org, cid1, v[5], 'membro'),
    (org, cid2, v[6], 'presidente'), (org, cid2, v[7], 'relator'), (org, cid2, v[8], 'membro');

  for i in 1 .. 8 loop
    insert into public.proposicoes (orgao_id, tipo, numero, ano, ementa, autoria_externa, data_apresentacao, andamento, situacao)
    values (org, case when i % 4 = 0 then 'requerimento' when i % 3 = 0 then 'indicacao' else 'projeto_lei' end, lpad(i::text, 3, '0'),
            case when i <= 2 then 2024 when i <= 4 then 2025 else 2026 end,
            'Dispõe sobre assunto de interesse local número ' || i || ' (TESTE)', case when i = 5 then 'Poder Executivo' end,
            make_date(case when i <= 2 then 2024 when i <= 4 then 2025 else 2026 end, least(i + 1, 11), 10),
            case when i <= 4 then 'aprovada' else 'em_tramitacao' end, 'publicado')
    returning id into pid;
    prop := prop || pid;
    if i <> 5 then insert into public.proposicoes_autores (orgao_id, proposicao_id, parlamentar_id, papel) values (org, pid, v[i], 'autor'); end if;
    insert into public.proposicoes_autores (orgao_id, proposicao_id, parlamentar_id, papel) values (org, pid, v[4], 'relator')
      on conflict do nothing;
    insert into public.proposicoes_tramites (orgao_id, proposicao_id, data, descricao) values
      (org, pid, make_date(case when i <= 2 then 2024 when i <= 4 then 2025 else 2026 end, least(i + 1, 11), 12), 'Lido em plenário e encaminhado à Comissão de Legislação.'),
      (org, pid, least(current_date, make_date(case when i <= 2 then 2024 when i <= 4 then 2025 else 2026 end, least(i + 1, 11), 25)), 'Parecer favorável da Comissão de Legislação.');
  end loop;

  for i in 1 .. 4 loop
    insert into public.sessoes (orgao_id, tipo, numero, data, hora, local, pauta, ata_url, andamento, video_url, situacao)
    values (org, 'ordinaria', i::text || 'ª', current_date - (i - 1) * 14 - 3, time '09:00', 'Plenário da Câmara (TESTE)',
            'Leitura do expediente; Projeto de Lei nº 00' || (4 + i) || '/2026 (1ª discussão); Requerimentos e indicações.',
            case when i > 1 then 'https://example.com/ata-teste.pdf' end, case when i > 1 then 'realizada' else 'prevista' end,
            case when i > 1 then 'https://www.youtube.com/watch?v=teste' end, 'publicado')
    returning id into sid;
    if i > 1 then
      insert into public.sessoes_presencas (orgao_id, sessao_id, parlamentar_id, presente, justificativa)
      select org, sid, x, not (x = v[9] and i = 2), case when x = v[9] and i = 2 then 'Atestado médico' end from unnest(v) x;
      insert into public.votacoes (orgao_id, sessao_id, proposicao_id, descricao, forma, resultado, votos_sim, votos_nao, abstencoes)
      values (org, sid, prop[4 + i], 'Projeto de Lei nº 00' || (4 + i) || '/2026 — 1ª discussão', 'nominal', 'aprovada', 6, 2, 0) returning id into vid;
      insert into public.votacoes_votos (orgao_id, votacao_id, parlamentar_id, voto)
      select org, vid, x, case when x = v[1] then 'nao_votou' when x in (v[2], v[3]) then 'nao' when x = v[9] and i = 2 then 'ausente' else 'sim' end from unnest(v) x;
    end if;
  end loop;
  insert into public.sessoes (orgao_id, comissao_id, tipo, data, local, pauta, andamento, situacao)
  values (org, cid1, 'reuniao', current_date - 5, 'Sala das Comissões (TESTE)', 'Parecer ao Projeto de Lei nº 005/2026.', 'realizada', 'publicado');

  insert into public.verba_indenizatoria (orgao_id, parlamentar_id, data, descricao, beneficiario_nome, beneficiario_doc, valor, situacao) values
    (org, v[1], current_date - 20, 'Combustível — viagem a Natal (TESTE)', 'Posto Fictício Ltda', '07924402000121', 350.00, 'publicado'),
    (org, v[2], current_date - 12, 'Hospedagem — capacitação na FEMURN (TESTE)', 'Hotel Fictício', '68599528000162', 480.00, 'publicado'),
    (org, v[6], current_date - 40, 'Material de escritório do gabinete (TESTE)', 'Papelaria Fictícia', '90786666000100', 120.50, 'publicado');
  perform public.salvar_config_legislativo(org, '{}'::jsonb) where false;
  update public.orgaos set configuracoes = coalesce(configuracoes, '{}'::jsonb) || '{"transmissao_url": "https://www.youtube.com/@camarateste", "verba_norma": "Resolução nº 01/2025 (TESTE)"}'::jsonb
   where id = org;
end $$;
