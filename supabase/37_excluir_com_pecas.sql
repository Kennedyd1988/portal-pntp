-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 37 — Excluir um registro junto com as peças internas dele (0.27.2)
-- Desde o 26 o banco recusa excluir qualquer registro com outros ligados. Isso
-- continua valendo entre registros de verdade (contrato ligado à licitação, obra
-- ligada ao contrato, empenho ligado ao contrato…). Mas as PEÇAS INTERNAS de um
-- registro (documentos da licitação, aditivos e fiscais do contrato, planilha e
-- medições da obra, autores e tramitação da proposição…) não existem sozinhas:
-- o painel pedia para excluí-las uma a uma, e algumas (documentos vindos do PNCP)
-- nem tinham botão. Esta função exclui o registro e as peças dele de uma vez,
-- com as permissões de quem está usando (RLS), tudo ou nada.
-- Rodar depois do 36. Pode rodar mais de uma vez.
-- =====================================================================
create or replace function public.excluir_com_pecas(p_tabela text, p_id uuid)
returns text[]                      -- arquivos (arquivo_url) das peças, para o painel apagar do armazenamento
language plpgsql security invoker set search_path = public as $$
declare
  pecas text[][];
  p text[];
  arquivos text[] := '{}';
  a text[];
  n integer;
begin
  pecas := case p_tabela
    when 'licitacoes'             then array[array['licitacoes_documentos', 'licitacao_id']]
    when 'contratos'              then array[array['contratos_aditivos', 'contrato_id'], array['contratos_fiscais', 'contrato_id']]
    when 'obras'                  then array[array['obras_itens', 'obra_id'], array['obras_medicoes', 'obra_id'], array['obras_paralisacoes', 'obra_id']]
    when 'concursos'              then array[array['concursos_documentos', 'concurso_id']]
    when 'conselhos'              then array[array['conselhos_membros', 'conselho_id'], array['conselhos_documentos', 'conselho_id']]
    when 'renuncias'              then array[array['renuncias_valores', 'renuncia_id']]          -- beneficiários (16.3) continuam protegidos
    when 'saude_estabelecimentos' then array[array['saude_profissionais', 'estabelecimento_id']]
    when 'saude_medicamentos'     then array[array['saude_estoques', 'medicamento_id']]
    when 'despesas'               then array[array['despesas_movimentos', 'despesa_id']]
    when 'proposicoes'            then array[array['proposicoes_autores', 'proposicao_id'], array['proposicoes_tramites', 'proposicao_id']]
    when 'sessoes'                then array[array['sessoes_presencas', 'sessao_id']]
    when 'votacoes'               then array[array['votacoes_votos', 'votacao_id']]
    when 'comissoes'              then array[array['comissoes_membros', 'comissao_id']]
    else null end;
  if pecas is null then raise exception 'Tabela não permitida: %', p_tabela; end if;
  -- Avisa os gatilhos das peças que o registro inteiro está saindo (ex.: edital da seleção publicada).
  perform set_config('pntp.excluindo', p_tabela || ':' || p_id, true);

  -- Sessão: as votações dela também são peças (com os votos).
  if p_tabela = 'sessoes' then
    delete from public.votacoes_votos where votacao_id in (select id from public.votacoes where sessao_id = p_id);
    delete from public.votacoes where sessao_id = p_id;
  end if;

  foreach p slice 1 in array pecas loop
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = p[1] and column_name = 'arquivo_url') then
      execute format('select coalesce(array_agg(arquivo_url) filter (where arquivo_url is not null), ''{}'') from public.%I where %I = $1', p[1], p[2]) into a using p_id;
      arquivos := arquivos || a;
    end if;
    execute format('delete from public.%I where %I = $1', p[1], p[2]) using p_id;
  end loop;

  execute format('delete from public.%I where id = $1', p_tabela) using p_id;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Seu perfil não pode excluir este registro.'; end if;   -- desfaz as peças também
  return arquivos;
end $$;
grant execute on function public.excluir_com_pecas(text, uuid) to authenticated;

-- Edital de seleção publicada: continua protegido, menos quando a seleção inteira é excluída.
create or replace function public.validar_doc_concurso()
returns trigger language plpgsql set search_path = public as $$
declare
  v_id uuid := coalesce(new.concurso_id, old.concurso_id);
  v_orgao uuid := coalesce(new.orgao_id, old.orgao_id);
  v_sit text;
begin
  select c.situacao into v_sit from public.concursos c where c.id = v_id and c.orgao_id = v_orgao;
  if v_sit is null then
    if tg_op = 'DELETE' then return old; end if;
    raise exception 'O documento não pertence a uma seleção deste órgão.';
  end if;
  if current_user in ('anon', 'authenticated') and v_sit = 'publicado' and not public.tem_permissao(v_orgao, 'concursos', 'publicar') then
    raise exception 'Esta seleção está publicada. Só quem tem permissão de publicar altera os documentos dela.';
  end if;
  -- Exclusão da seleção inteira (excluir_com_pecas, script 37): o edital sai junto com ela.
  if tg_op = 'DELETE' and coalesce(current_setting('pntp.excluindo', true), '') = 'concursos:' || v_id then return old; end if;
  if tg_op = 'DELETE' and old.tipo = 'edital' and v_sit = 'publicado'
     and not exists (select 1 from public.concursos_documentos d where d.concurso_id = v_id and d.tipo = 'edital' and d.id <> old.id) then
    raise exception 'A seleção está publicada: o edital não pode ser excluído (envie o novo antes ou tire do ar).';
  end if;
  return coalesce(new, old);
end;
$$;
