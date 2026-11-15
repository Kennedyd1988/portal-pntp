-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 41 — Configurações do órgão gravadas por partes (0.31.0)
-- Antes, cada tela que muda as configurações do órgão (Aparência, Licitações ›
-- PNCP, Planejamento e contas › RGF, Migração do site antigo) regravava o
-- conjunto inteiro com a cópia que tinha carregado ao abrir. Se outra pessoa
-- (ou outra aba) tivesse mudado alguma coisa nesse meio-tempo, a mudança dela
-- se perdia — por exemplo, o endereço do site antigo da Migração sumia e era
-- preciso "Salvar e reconhecer" de novo a cada vez que se abria a tela.
-- Agora cada tela manda só o que ela mudou e o banco junta com o que já está lá.
-- Mesmas regras de antes: só quem pode editar a Aparência do órgão (ou o
-- Suporte SOFT+). Pode rodar mais de uma vez.
-- =====================================================================

create or replace function public.mesclar_configuracoes(p_orgao uuid, p_valores jsonb)
returns jsonb
language plpgsql security invoker set search_path = public as $$
declare v jsonb;
begin
  if p_valores is null or jsonb_typeof(p_valores) <> 'object' then
    raise exception 'Configurações inválidas.';
  end if;
  update public.orgaos
     set configuracoes = coalesce(configuracoes, '{}'::jsonb) || p_valores
   where id = p_orgao
  returning configuracoes into v;
  if v is null then
    raise exception 'Seu perfil não pode alterar as configurações deste órgão.';
  end if;
  return v;
end;
$$;
grant execute on function public.mesclar_configuracoes(uuid, jsonb) to authenticated;

select 'configurações mescladas prontas' as situacao;
