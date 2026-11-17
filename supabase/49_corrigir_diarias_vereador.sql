-- =====================================================================
-- Script 49 — Correção: diária de vereador recusada com o erro
-- 'record "new" has no field "origem"' (0.44.3)
-- A conferência do script 36 serve para diárias e emendas, mas lia o campo
-- "origem" (que só existe em emendas) na mesma expressão: o banco recusava
-- toda diária ligada a um vereador. Agora o campo é lido só nas emendas.
-- Pode rodar mais de uma vez.
-- =====================================================================
create or replace function public.conferir_parlamentar_vinculado()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_origem text;
  v_origem_antiga text;
begin
  if new.parlamentar_id is null then return new; end if;
  if tg_table_name = 'diarias' then
    if tg_op = 'UPDATE' and new.parlamentar_id is not distinct from old.parlamentar_id then return new; end if;
    if not exists (select 1 from public.parlamentares p where p.id = new.parlamentar_id and p.orgao_id = new.orgao_id) then
      raise exception 'O vereador indicado não é desta Câmara.';
    end if;
    return new;
  end if;
  -- Emendas: "origem" lido como texto do registro (a tabela de diárias não tem esse campo).
  v_origem := to_jsonb(new) ->> 'origem';
  if tg_op = 'UPDATE' then
    v_origem_antiga := to_jsonb(old) ->> 'origem';
    if new.parlamentar_id is not distinct from old.parlamentar_id and v_origem is not distinct from v_origem_antiga then return new; end if;
  end if;
  if v_origem is distinct from 'municipal' then
    raise exception 'Só emenda municipal se liga a um vereador.';
  end if;
  if not exists (
    select 1 from public.parlamentares p
      join public.orgaos c on c.id = p.orgao_id
      join public.orgaos o on o.id = new.orgao_id
     where p.id = new.parlamentar_id and p.situacao = 'publicado' and c.tipo = 'camara' and c.ativo
       and public.normalizar_texto(c.municipio) = public.normalizar_texto(o.municipio) and c.uf = o.uf) then
    raise exception 'O vereador precisa ser da Câmara do mesmo município (e estar publicado no site da Câmara).';
  end if;
  return new;
end $$;
