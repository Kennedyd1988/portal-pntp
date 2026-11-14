-- =====================================================================
-- PORTAL PNTP · SOFT+ — DADOS FICTÍCIOS PARA TESTE: e-SIC e Ouvidoria
-- Órgão: Prefeitura Municipal de Riacho da Cruz (piloto).
--
-- O que faz:
--   1. Configura os dois canais com dados de TESTE e liga o sistema próprio
--      (desde 02/01/2026), para o site mostrar os formulários.
--   2. Cria 12 pedidos de acesso à informação e 10 manifestações de ouvidoria
--      fictícios ao longo de 2026, em várias situações (respondido, negado,
--      em recurso, vencido, prorrogado, aguardando o cidadão, denúncia anônima…).
--   3. Gera os relatórios estatísticos automáticos.
-- Nenhum e-mail é enviado (os registros entram direto, sem a fila de e-mails).
-- Todos os assuntos começam com "[TESTE]". Para apagar tudo: teste_atendimento_limpar.sql.
--
-- Para consultar no site (e-SIC › Acompanhar / Ouvidoria › Acompanhar):
-- protocolo SIC-2026-000001 … SIC-2026-000012 e OUV-2026-000001 … OUV-2026-000010,
-- código de acesso: TESTE + número com 2 dígitos (ex.: TESTE01 para o nº 1).
-- =====================================================================
do $$
declare
  org uuid := (select id from public.orgaos where regexp_replace(cnpj, '\D', '', 'g') = '08153454000104');
  sup uuid := (select id from public.usuarios where suporte_softplus order by criado_em limit 1);
  r record;
  aid uuid;
  prot text;
  reg date; resp timestamptz; praz date;
begin
  if org is null then raise exception 'Órgão de Riacho da Cruz não encontrado (CNPJ 08153454000104).'; end if;
  if exists (select 1 from public.atendimentos where orgao_id = org and assunto like '[TESTE]%') then
    raise exception 'Os dados fictícios já foram criados. Rode antes teste_atendimento_limpar.sql para recriar.';
  end if;
  if exists (select 1 from public.atendimentos where orgao_id = org) then
    raise exception 'Este órgão já tem pedidos ou manifestações reais: os fictícios não foram criados para não misturar.';
  end if;

  -- 1. Canais ------------------------------------------------------------
  insert into public.atendimento_canais as c (orgao_id, canal, setor, responsavel_nome, responsavel_cargo, responsavel_ato,
      endereco, telefone, horario, outros_canais, prazo_resposta, prazo_recurso, prazo_decisao_recurso,
      autoridade_recurso_1, autoridade_recurso_2, procedimento_recurso, norma_texto,
      sistema_proprio, sistema_desde, pesquisa_satisfacao, aceita_anexos, aviso_dias)
  values
    (org, 'esic', 'Serviço de Informação ao Cidadão (TESTE)', 'Servidora Fictícia de Teste', 'Coordenadora do SIC (TESTE)', 'Portaria nº 000/2026 (TESTE)',
     'Rua de Teste, 100, Centro, Riacho da Cruz/RN (TESTE)', '(84) 0000-0000', 'Segunda a sexta, das 7h às 13h (TESTE)', null,
     '20 dias, prorrogáveis por mais 10 com justificativa (Lei 12.527/2011, art. 11).',
     '10 dias a contar da resposta (Lei 12.527/2011, art. 15).', '5 dias (Lei 12.527/2011, art. 15, parágrafo único).',
     'Secretário(a) Municipal de Administração (TESTE)', 'Prefeito(a) Municipal (TESTE)',
     'O recurso é feito pela consulta do pedido, no próprio site, com o protocolo e o código de acesso. (TESTE)', 'Decreto nº 000/2013 (TESTE)',
     true, date '2026-01-02', true, true, 5),
    (org, 'ouvidoria', 'Ouvidoria-Geral do Município (TESTE)', 'Ouvidor Fictício de Teste', 'Ouvidor-Geral (TESTE)', 'Portaria nº 001/2026 (TESTE)',
     'Rua de Teste, 100, Centro, Riacho da Cruz/RN (TESTE)', '(84) 0000-0001', 'Segunda a sexta, das 7h às 13h (TESTE)', 'Urna na recepção da Prefeitura (TESTE)',
     '30 dias, prorrogáveis por mais 30 (Lei 13.460/2017, art. 16).', null, null, null, null, null, null,
     true, date '2026-01-02', true, true, 5)
  on conflict (orgao_id, canal) do update set
    setor = excluded.setor, responsavel_nome = excluded.responsavel_nome, responsavel_cargo = excluded.responsavel_cargo,
    responsavel_ato = excluded.responsavel_ato, endereco = excluded.endereco, telefone = excluded.telefone, horario = excluded.horario,
    outros_canais = excluded.outros_canais, prazo_resposta = excluded.prazo_resposta, prazo_recurso = excluded.prazo_recurso,
    prazo_decisao_recurso = excluded.prazo_decisao_recurso, autoridade_recurso_1 = excluded.autoridade_recurso_1,
    autoridade_recurso_2 = excluded.autoridade_recurso_2, procedimento_recurso = excluded.procedimento_recurso,
    norma_texto = excluded.norma_texto, sistema_proprio = true, sistema_desde = excluded.sistema_desde,
    pesquisa_satisfacao = true, aceita_anexos = true;

  -- 2. Registros ---------------------------------------------------------
  -- n, canal, tipo, data, meio, identificação, situação, resultado, motivo, dias até responder (null = sem resposta),
  -- recurso (null | 'aberto' | 'desprovido'), prorrogado, nota (avaliação), assunto, texto, resposta, nome, doc, sexo, faixa, escolaridade
  for r in select * from (values
    (1,'esic','pedido',date '2026-01-14','internet','identificado','encerrado','concedido',null,9,null,false,5,
     'Folha de pagamento de dezembro de 2025','Solicito a relação de servidores com a remuneração paga em dezembro de 2025, por secretaria.',
     'Segue em anexo a folha de dezembro de 2025, por secretaria, também disponível no Portal da Transparência.','Ana Maria de Souza','52601815906','feminino','30_44','superior'),
    (2,'esic','pedido',date '2026-02-03','internet','identificado','encerrado','concedido',null,15,null,false,4,
     'Contrato de coleta de lixo','Peço cópia do contrato vigente de coleta de lixo e dos aditivos.',
     'Informamos que o contrato nº 012/2025 e os aditivos estão publicados na página de Contratos do portal.','José Carlos Pereira','08301661305','masculino','45_59','medio'),
    (3,'esic','pedido',date '2026-02-20','presencial','preservada','encerrado','parcial','dados_pessoais',18,null,false,3,
     'Lista de beneficiários de programa social','Solicito a lista nominal dos beneficiários do programa de cestas básicas com CPF e endereço.',
     'Fornecemos a quantidade de beneficiários por bairro. Os nomes, CPF e endereços são dados pessoais protegidos (Lei 12.527/2011, art. 31).','Francisca das Chagas Lima','18609139034','feminino','60_mais','fundamental'),
    (4,'esic','pedido',date '2026-03-11','internet','identificado','encerrado','negado','processo_decisorio',12,'desprovido',false,2,
     'Pareceres de processo licitatório em andamento','Quero acesso aos pareceres internos do pregão de merenda escolar ainda não homologado.',
     'O acesso será possível após a homologação: documento preparatório de decisão ainda não tomada (Lei 12.527/2011, art. 7º, § 3º).','Empresa Fictícia de Alimentos Ltda','07924402000121',null,null,null),
    (5,'esic','pedido',date '2026-04-07','internet','identificado','encerrado','inexistente',null,10,null,false,4,
     'Estudo de impacto de trânsito','Solicito o estudo de impacto de trânsito da reforma da praça central.',
     'O município não elaborou estudo de impacto de trânsito para essa obra: a informação não existe.','Raimundo Nonato Silva','99603082430','masculino','30_44','medio'),
    (6,'esic','pedido',date '2026-05-12','telefone','identificado','encerrado','concedido',null,25,null,true,5,
     'Gastos com combustível em 2025','Peço o total gasto com combustível em 2025 por secretaria.',
     'Segue o total por secretaria. O prazo foi prorrogado para consolidar os dados de todas as secretarias.','Maria do Socorro Alves','62819482112','feminino','45_59','superior'),
    (7,'esic','pedido',date '2026-06-18','internet','identificado','encerrado','concedido',null,7,null,false,null,
     'Calendário de vacinação','Qual o calendário de vacinação contra gripe nas unidades de saúde?',
     'O calendário está publicado na página da Saúde e afixado nas unidades.','Antônio Marcos Costa','99351819019','masculino','18_29','superior'),
    (8,'esic','pedido',date '2026-08-04','internet','identificado','em_recurso','negado','generico',14,'aberto',false,null,
     'Todos os documentos da Prefeitura desde 2010','Quero cópia de todos os documentos produzidos pela Prefeitura desde 2010.',
     'Pedido genérico, sem especificar a informação (Decreto 7.724/2012, art. 13, I). Reformule indicando o assunto e o período.','Pedro Henrique Rocha','93786579741','masculino','30_44','pos'),
    (9,'esic','pedido',date '2026-09-22','internet','identificado','encerrado','concedido',null,11,null,false,5,
     'Horário do posto de saúde da zona rural','Qual o horário de funcionamento do posto de saúde do sítio?',
     'O posto funciona de segunda a sexta, das 7h às 11h.','Josefa Maria da Silva','54323194897','feminino','60_mais','fundamental'),
    (10,'esic','pedido',date '2026-10-15','internet','identificado','aberto',null,null,null,null,false,null,
     'Convênios recebidos em 2026','Solicito a lista dos convênios assinados com o Estado e a União em 2026.',null,'Lucas Gabriel Fernandes','75749118606','masculino','18_29','superior'),
    (11,'esic','pedido',date '2026-11-05','internet','preservada','aberto',null,null,null,null,false,null,
     'Diárias pagas ao gabinete','Quero a relação das diárias pagas ao gabinete do prefeito em 2026.',null,'Cidadão com identidade preservada','25276018987','nao_informado','45_59','medio'),
    (12,'esic','pedido',date '2026-09-10','email','identificado','aguardando_cidadao',null,null,null,null,false,null,
     'Informação sobre obra','Quero saber da obra perto da minha casa.',null,'Carla Beatriz Moura','55597971115','feminino','30_44','medio'),
    (1,'ouvidoria','reclamacao',date '2026-01-20','internet','identificado','encerrado','concluida',null,12,null,false,4,
     'Iluminação pública apagada','A iluminação da Rua São José está apagada há duas semanas.',
     'A Secretaria de Obras trocou as lâmpadas em 28/01/2026. Agradecemos o aviso.','Marcos Antônio Dias','47104974601','masculino','30_44','medio'),
    (2,'ouvidoria','denuncia',date '2026-02-25','internet','anonimo','encerrado','concluida',null,25,null,false,null,
     'Descarte irregular de lixo','Há descarte de entulho em terreno baldio próximo ao açude.',
     'A fiscalização visitou o local, notificou o responsável e o terreno foi limpo.',null,null,null,null,null),
    (3,'ouvidoria','sugestao',date '2026-03-30','presencial','identificado','encerrado','concluida',null,20,null,false,5,
     'Horário estendido no posto de saúde','Sugiro abrir o posto de saúde também às quartas à tarde.',
     'A sugestão foi encaminhada à Secretaria de Saúde, que vai estudar o atendimento vespertino.','Luzia Pereira Campos','50752917080','feminino','45_59','medio'),
    (4,'ouvidoria','elogio',date '2026-04-22','internet','identificado','encerrado','concluida',null,5,null,false,5,
     'Atendimento na farmácia básica','Quero elogiar o atendimento da equipe da farmácia básica.',
     'Agradecemos o elogio, que foi repassado à equipe.','Rita de Cássia Nunes','34236671255','feminino','60_mais','fundamental'),
    (5,'ouvidoria','solicitacao',date '2026-06-02','telefone','identificado','encerrado','concluida',null,40,null,true,3,
     'Poda de árvore','Peço a poda de uma árvore que está encostando na rede elétrica.',
     'A poda foi feita em parceria com a concessionária de energia. O prazo foi prorrogado para agendar com a concessionária.','Sebastião Gomes','76842684650','masculino','60_mais','sem'),
    (6,'ouvidoria','reclamacao',date '2026-07-15','internet','identificado','encerrado','arquivada',null,30,null,false,1,
     'Barulho de festa','Reclamo do som alto em festa particular no fim de semana.',
     'O caso é de competência da Polícia Militar (perturbação do sossego). Orientamos o registro pelo 190.','Cícero Batista','56321223360','masculino','30_44','medio'),
    (7,'ouvidoria','simplificacao',date '2026-08-19','internet','identificado','respondido','concluida',null,15,null,false,null,
     'Simplificar emissão de alvará','Sugiro que a renovação do alvará seja feita pela internet.',
     'A renovação passará a ser pelo portal de serviços a partir de 2027.','Empresa Fictícia de Comércio ME','68599528000162',null,null,null),
    (8,'ouvidoria','denuncia',date '2026-09-28','internet','anonimo','aberto',null,null,null,null,false,null,
     'Servidor faltoso','Denúncia de servidor que não cumpre o horário na escola municipal.',null,null,null,null,null,null),
    (9,'ouvidoria','reclamacao',date '2026-10-08','internet','identificado','aberto',null,null,null,null,true,null,
     'Buraco na estrada vicinal','Há um buraco grande na estrada que liga a sede ao Sítio Fictício.',null,'Antônia Ferreira','52601815906','feminino','45_59','fundamental'),
    (10,'ouvidoria','solicitacao',date '2026-11-10','internet','identificado','aberto',null,null,null,null,false,null,
     'Agendamento de castração','Peço informação sobre a castração gratuita de cães e gatos.',null,'Bruno Oliveira','08301661305','masculino','18_29','superior')
  ) as t(n, canal, tipo, dt, meio, ident, situacao, resultado, motivo, dias, recurso, prorrog, nota, assunto, texto, resposta, nome, doc, sexo, faixa, escol)
  loop
    prot := case r.canal when 'esic' then 'SIC' else 'OUV' end || '-2026-' || lpad(r.n::text, 6, '0');
    reg := r.dt;
    praz := public.ajustar_dia_util(org, reg + case r.canal when 'esic' then 20 else 30 end);
    resp := case when r.dias is not null then (reg + r.dias)::timestamp + interval '10 hours' end;
    insert into public.atendimentos (orgao_id, canal, protocolo, ano, numero, tipo, assunto, texto, meio, identificacao, situacao,
        registrado_em, data_registro, prazo, prazo_original, prorrogado_em, prorrogacao_motivo, suspenso_em,
        respondido_em, resposta, resultado, motivo_negativa, prazo_recurso, encerrado_em, aviso_enviado_em, vencido_avisado_em, criado_por, classificacao)
    values (org, r.canal, prot, 2026, r.n, r.tipo, '[TESTE] ' || r.assunto, r.texto || ' [Registro fictício para teste]', r.meio, r.ident, r.situacao,
        reg::timestamp + interval '9 hours', reg,
        case when r.prorrog then public.ajustar_dia_util(org, praz + case r.canal when 'esic' then 10 else 30 end) else praz end, praz,
        case when r.prorrog then (reg + 15)::timestamp + interval '9 hours' end,
        case when r.prorrog then 'Necessidade de consultar outras secretarias para reunir as informações. (TESTE)' end,
        case when r.situacao = 'aguardando_cidadao' then reg + 3 end,
        resp, r.resposta, r.resultado, r.motivo,
        case when r.canal = 'esic' and resp is not null then (resp::date + 10) end,
        case when r.situacao = 'encerrado' then coalesce(resp, now()) + interval '11 days' end,
        now(), now(), case when r.meio <> 'internet' then sup end,
        case r.canal when 'esic' then 'Acesso à informação' else 'Serviços públicos' end)
    returning id into aid;

    insert into public.atendimentos_segredos (atendimento_id, codigo_hash) values (aid, public.hash_acesso(prot, 'TESTE' || lpad(r.n::text, 2, '0')));
    if r.nome is not null then
      insert into public.atendimentos_solicitantes (atendimento_id, orgao_id, nome, tipo_pessoa, documento, sexo, faixa_etaria, escolaridade, municipio_uf)
      values (aid, org, r.nome, case when length(r.doc) = 14 then 'juridica' else 'fisica' end, r.doc, r.sexo, r.faixa, r.escol, 'Riacho da Cruz/RN');
    end if;

    insert into public.atendimentos_tramites (orgao_id, atendimento_id, tipo, texto, publico, criado_em)
    values (org, aid, 'registro', 'Registrado pelo ' || case r.meio when 'internet' then 'site' else r.meio end || '.', true, reg::timestamp + interval '9 hours');
    if r.prorrog then
      insert into public.atendimentos_tramites (orgao_id, atendimento_id, tipo, texto, publico, criado_em)
      values (org, aid, 'prorrogacao', 'Prazo prorrogado: necessidade de consultar outras secretarias. (TESTE)', true, (reg + 15)::timestamp + interval '9 hours');
    end if;
    if r.situacao = 'aguardando_cidadao' then
      insert into public.atendimentos_tramites (orgao_id, atendimento_id, tipo, texto, publico, criado_em)
      values (org, aid, 'complemento_pedido', 'Informe o endereço ou o nome da obra para localizarmos a informação. (TESTE)', true, (reg + 3)::timestamp + interval '9 hours');
    end if;
    if resp is not null then
      insert into public.atendimentos_tramites (orgao_id, atendimento_id, tipo, texto, publico, criado_em)
      values (org, aid, 'resposta', r.resposta, true, resp);
    end if;
    if r.recurso is not null then
      insert into public.atendimentos_recursos (orgao_id, atendimento_id, instancia, motivo, texto, registrado_em, data_registro, prazo_decisao, autoridade,
          decisao, decisao_texto, decidido_em)
      values (org, aid, 1, 'negativa', 'Discordo da negativa e peço a revisão da decisão. (TESTE)', resp + interval '3 days', resp::date + 3,
          public.ajustar_dia_util(org, resp::date + 3 + 5), 'Secretário(a) Municipal de Administração (TESTE)',
          case when r.recurso = 'desprovido' then 'desprovido' end,
          case when r.recurso = 'desprovido' then 'Mantida a negativa pelos mesmos fundamentos. (TESTE)' end,
          case when r.recurso = 'desprovido' then resp + interval '7 days' end);
      insert into public.atendimentos_tramites (orgao_id, atendimento_id, tipo, texto, publico, criado_em)
      values (org, aid, 'recurso', 'Recurso em 1ª instância registrado. (TESTE)', true, resp + interval '3 days');
      if r.recurso = 'desprovido' then
        insert into public.atendimentos_tramites (orgao_id, atendimento_id, tipo, texto, publico, criado_em)
        values (org, aid, 'decisao_recurso', 'Recurso desprovido: mantida a negativa. (TESTE)', true, resp + interval '7 days');
      end if;
    end if;
    if r.situacao = 'encerrado' then
      insert into public.atendimentos_tramites (orgao_id, atendimento_id, tipo, texto, publico, criado_em)
      values (org, aid, 'encerramento', 'Atendimento encerrado.', true, coalesce(resp, now()) + interval '11 days');
    end if;
    if r.nota is not null then
      insert into public.atendimentos_avaliacoes (atendimento_id, orgao_id, canal, nota, resolvido, comentario, data)
      values (aid, org, r.canal, r.nota, case when r.nota >= 4 then 'sim' when r.nota = 3 then 'parcial' else 'nao' end,
              case when r.nota >= 4 then 'Atendimento rápido e claro. (TESTE)' when r.nota <= 2 then 'Não fiquei satisfeito com a resposta. (TESTE)' end,
              resp::date + 2);
    end if;
  end loop;

  -- Numeração: os próximos registros reais continuam depois dos fictícios (a limpeza zera).
  insert into public.atendimentos_numeros as nn (orgao_id, canal, ano, ultimo) values (org, 'esic', 2026, 12), (org, 'ouvidoria', 2026, 10)
  on conflict (orgao_id, canal, ano) do update set ultimo = greatest(nn.ultimo, excluded.ultimo);

  -- 3. Relatórios estatísticos automáticos.
  perform public.gerar_relatorios_atendimento(org, 'esic');
  perform public.gerar_relatorios_atendimento(org, 'ouvidoria');
end $$;

select canal, situacao, count(*) from public.atendimentos
 where orgao_id = (select id from public.orgaos where regexp_replace(cnpj, '\D', '', 'g') = '08153454000104') and assunto like '[TESTE]%'
 group by 1, 2 order by 1, 2;
