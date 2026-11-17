-- =====================================================================
-- Script 48 — Menu padrão por tipo de órgão (0.44.0)
-- Um menu para cada tipo, só com as páginas que valem para ele no PNTP:
--   · Prefeitura: matriz do Executivo (com Saúde, Educação, Renúncias e Emendas);
--   · Câmara: atividade legislativa e verba indenizatória, sem as páginas só do Executivo;
--   · Consórcio: entes, documentos constitutivos, rateio e programa;
--   · RPPS, autarquia e outros: a parte comum.
-- Usado ao cadastrar um órgão (criar_orgao) e pelo botão "Criar/Recriar menu padrão"
-- do painel (Menu do site), que agora chama esta mesma função: o menu padrão fica
-- num lugar só. Menus já existentes não mudam (use "Recriar menu padrão" no painel).
-- Pode rodar mais de uma vez.
-- =====================================================================
create or replace function public.criar_menu_padrao(p_orgao uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_tipo text := (select tipo::text from public.orgaos where id = p_orgao);
  -- Grupos comuns
  publicacoes jsonb := '["Publicações", "/publicacoes", [["Leis, decretos e portarias", "/publicacoes"], ["Diário Oficial", "/diario-oficial"]]]';
  noticias    jsonb := '["Notícias", "/noticias", [["Notícias", "/noticias"], ["Vídeos", "/videos"], ["Agenda", "/agenda"]]]';
  servicos    jsonb := '["Serviços", "/servicos", [["Carta de Serviços ao Usuário", "/servicos"], ["Serviços on-line", "/servicos-online"]]]';
  atendimento jsonb := '["Atendimento", "/contato", [["Ouvidoria", "/ouvidoria"], ["e-SIC", "/esic"], ["Perguntas frequentes", "/faq"], ["Contato", "/contato"]]]';
  m jsonb;
  i int; j int; pai uuid; n int := 0;
begin
  if v_tipo = 'camara' then
    m := jsonb_build_array(
      '["Início", "/"]'::jsonb,
      '["A Câmara", "/parlamentares", [["Vereadores", "/parlamentares"], ["Mesa Diretora", "/mesa-diretora"], ["Comissões", "/comissoes"],
        ["Estrutura organizacional", "/estrutura"], ["Gestores", "/gestores"]]]'::jsonb,
      '["Atividade legislativa", "/proposicoes", [["Proposições", "/proposicoes"], ["Sessões plenárias", "/sessoes"], ["Votações", "/votacoes"],
        ["Atividade dos vereadores", "/atividade-parlamentar"]]]'::jsonb,
      '["Transparência", "/transparencia", [["Portal da Transparência", "/transparencia"], ["Receitas", "/receitas"], ["Despesas", "/despesas"],
        ["Ordem cronológica de pagamentos", "/ordem-cronologica"], ["Pessoal", "/pessoal"], ["Diárias", "/diarias"], ["Verba indenizatória", "/verba-indenizatoria"],
        ["Concursos e seleções", "/concursos"], ["Planejamento e contas", "/planejamento"], ["Licitações", "/licitacoes"], ["Contratos", "/contratos"],
        ["Obras", "/obras"], ["Convênios e transferências", "/convenios"]]]'::jsonb,
      publicacoes, noticias, servicos, atendimento);
  elsif v_tipo = 'consorcio' then
    m := jsonb_build_array(
      '["Início", "/"]'::jsonb,
      '["O Consórcio", "/entes", [["Entes consorciados", "/entes"], ["Documentos constitutivos", "/documentos-consorcio"], ["Dirigentes e assembleia", "/dirigentes-atas"],
        ["Estrutura organizacional", "/estrutura"], ["Gestores", "/gestores"]]]'::jsonb,
      '["Transparência", "/transparencia", [["Portal da Transparência", "/transparencia"], ["Receitas", "/receitas"], ["Despesas", "/despesas"],
        ["Ordem cronológica de pagamentos", "/ordem-cronologica"], ["Pessoal", "/pessoal"], ["Diárias", "/diarias"], ["Concursos e seleções", "/concursos"],
        ["Planejamento e contas", "/planejamento"], ["Orçamento do consórcio", "/orcamento-consorcio"], ["Licitações", "/licitacoes"], ["Contratos", "/contratos"],
        ["Contratos de rateio", "/rateio"], ["Contratos de programa", "/programa"], ["Obras", "/obras"], ["Convênios e transferências", "/convenios"]]]'::jsonb,
      publicacoes, noticias, servicos, atendimento);
  elsif v_tipo = 'prefeitura' then
    m := jsonb_build_array(
      '["Início", "/"]'::jsonb,
      '["Institucional", "/estrutura", [["Estrutura organizacional", "/estrutura"], ["Gestores", "/gestores"], ["Conselhos municipais", "/conselhos"]]]'::jsonb,
      '["Transparência", "/transparencia", [["Portal da Transparência", "/transparencia"], ["Receitas", "/receitas"], ["Despesas", "/despesas"],
        ["Ordem cronológica de pagamentos", "/ordem-cronologica"], ["Pessoal", "/pessoal"], ["Diárias", "/diarias"], ["Concursos e seleções", "/concursos"],
        ["Planejamento e contas", "/planejamento"], ["Licitações", "/licitacoes"], ["Contratos", "/contratos"], ["Obras", "/obras"],
        ["Convênios e transferências", "/convenios"], ["Emendas parlamentares", "/emendas"], ["Renúncias de receita", "/renuncias"]]]'::jsonb,
      '["Saúde e Educação", "/saude", [["Saúde", "/saude"], ["Educação e assistência social", "/educacao"]]]'::jsonb,
      publicacoes, noticias, servicos, atendimento);
  else   -- RPPS, autarquia e outros: parte comum da matriz
    m := jsonb_build_array(
      '["Início", "/"]'::jsonb,
      '["Institucional", "/estrutura", [["Estrutura organizacional", "/estrutura"], ["Gestores", "/gestores"]]]'::jsonb,
      '["Transparência", "/transparencia", [["Portal da Transparência", "/transparencia"], ["Receitas", "/receitas"], ["Despesas", "/despesas"],
        ["Ordem cronológica de pagamentos", "/ordem-cronologica"], ["Pessoal", "/pessoal"], ["Diárias", "/diarias"], ["Concursos e seleções", "/concursos"],
        ["Planejamento e contas", "/planejamento"], ["Licitações", "/licitacoes"], ["Contratos", "/contratos"], ["Obras", "/obras"],
        ["Convênios e transferências", "/convenios"]]]'::jsonb,
      publicacoes, noticias, servicos, atendimento);
  end if;
  -- Quem está no SQL Editor (fora da API) também pode criar o menu (scripts de teste e de implantação).
  if not (public.e_suporte_softplus() or public.tem_permissao(p_orgao, 'menu', 'editar') or session_user not in ('authenticator', 'anon', 'authenticated')) then
    raise exception 'Seu perfil não pode criar o menu deste órgão.';
  end if;
  if exists (select 1 from public.menu_itens where orgao_id = p_orgao) then return 0; end if;
  for i in 0 .. jsonb_array_length(m) - 1 loop
    insert into public.menu_itens (orgao_id, rotulo, tipo, destino, ordem)
    values (p_orgao, m -> i ->> 0, 'interno', m -> i ->> 1, (i + 1) * 10) returning id into pai;
    n := n + 1;
    if jsonb_typeof(m -> i -> 2) = 'array' then
      for j in 0 .. jsonb_array_length(m -> i -> 2) - 1 loop
        insert into public.menu_itens (orgao_id, pai_id, rotulo, tipo, destino, ordem)
        values (p_orgao, pai, m -> i -> 2 -> j ->> 0, 'interno', m -> i -> 2 -> j ->> 1, (j + 1) * 10);
        n := n + 1;
      end loop;
    end if;
  end loop;
  return n;
end;
$$;
grant execute on function public.criar_menu_padrao(uuid) to authenticated;
