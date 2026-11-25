-- =====================================================================
-- Script 53 — Corrige "record "new" has no field "orgao_id"" ao salvar a Aparência (0.48.1)
-- Desde a integração com a Gestão de Consórcio (0.48.0), a trava consorcio.travar_portal()
-- também roda na tabela orgaos. Ela lia new.orgao_id dentro de um CASE, e o PL/pgSQL
-- precisa compilar a expressão inteira: como orgaos não tem a coluna orgao_id, qualquer
-- alteração do órgão feita pelo painel (Aparência e contatos etc.) falhava, em todos os órgãos.
-- Agora o órgão é lido por ramo separado (orgaos usa id; as demais tabelas leem orgao_id via jsonb).
-- Já aplicado na Supabase em 25/11/2026. Pode rodar mais de uma vez.
-- =====================================================================

CREATE OR REPLACE FUNCTION consorcio.travar_portal()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'consorcio', 'public'
AS $function$
declare v_org uuid; v_item text := tg_argv[0]; v_mudou boolean := false; k text; v_sig text; v_cons uuid;
begin
  if current_user not in ('anon', 'authenticated') then return coalesce(new, old); end if;
  -- A tabela orgaos não tem orgao_id: lê o campo via jsonb para não quebrar a compilação do registro NEW.
  if tg_table_name = 'orgaos' then
    v_org := coalesce(new.id, old.id);
  else
    v_org := nullif(coalesce(to_jsonb(new), to_jsonb(old)) ->> 'orgao_id', '')::uuid;
  end if;
  v_cons := consorcio.consorcio_do_portal(v_org);
  if tg_table_name = 'orgaos' then
    if (new.configuracoes -> 'integracao_gestao') is distinct from (old.configuracoes -> 'integracao_gestao') then
      raise exception 'A integração com a Gestão de Consórcio só é ligada ou desligada na própria Gestão de Consórcio.';
    end if;
  end if;
  if v_cons is null then return coalesce(new, old); end if;
  v_sig := coalesce(nullif((select configuracoes -> 'integracao_gestao' ->> 'sigla' from public.orgaos where id = v_org), ''), 'consórcio');
  if tg_table_name = 'orgaos' then
    if not consorcio.integracao_ativa_em('identidade', v_cons) then return new; end if;
    foreach k in array array['nome_exibicao','endereco','cep','telefone','whatsapp','email','horario','brasao_url','instagram','facebook','youtube'] loop
      if coalesce(new.configuracoes ->> k, '') <> coalesce(old.configuracoes ->> k, '') then v_mudou := true; end if;
    end loop;
    if new.sigla is distinct from old.sigla then v_mudou := true; end if;
    if v_mudou then
      raise exception 'Nome, sigla, endereço, contatos, horário, redes sociais e brasão do % são controlados pela Gestão de Consórcio (Consórcio › Dados). Altere lá.', v_sig;
    end if;
    return new;
  end if;
  if consorcio.integracao_ativa_em(v_item, v_cons) then
    raise exception '%', case v_item
      when 'entes' then format('Os entes consorciados do %s são controlados pela Gestão de Consórcio (Cadastro de Consorciados). Altere lá.', v_sig)
      when 'documentos' then format('Os documentos do %s (constitutivos, contratos, atas e orçamento) são controlados pela Gestão de Consórcio (Consórcio › Documentos). Altere lá.', v_sig)
      else format('Os gestores do %s são controlados pela Gestão de Consórcio (Consórcio › Pessoas). Altere lá.', v_sig) end;
  end if;
  return coalesce(new, old);
end $function$;
