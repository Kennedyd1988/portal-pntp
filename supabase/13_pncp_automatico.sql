-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 13 — Importação AUTOMÁTICA do PNCP (todo dia de madrugada)
--
-- Como usar: Supabase › SQL Editor › New query › colar tudo › Run.
-- Pode ser executado mais de uma vez. Rodar DEPOIS do script 12 e de
-- instalar a função "pncp-sincronizar" (ver README, seção "Função pncp").
--
-- Ao final, o resultado mostra a CHAVE DA SINCRONIZAÇÃO: copie e cole em
-- Edge Functions › Secrets com o nome PNCP_SINC_CHAVE (passo do README).
-- Tudo aqui é gratuito (pg_cron e pg_net fazem parte do plano Free).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. LIGAR/DESLIGAR PELO PAINEL
--    Quem tem permissão de editar licitações liga a importação automática
--    (sem precisar de permissão em "Aparência"). Publicar direto no site
--    exige permissão de publicar licitações.
--    Grava só as chaves do PNCP dentro de configuracoes (não mexe no resto).
-- ---------------------------------------------------------------------
create or replace function public.definir_pncp_automatico(p_orgao uuid, p_auto boolean, p_publicar boolean, p_cnpjs text[])
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_cnpjs text[];
begin
  if not (public.tem_permissao(p_orgao, 'licitacoes', 'editar') and public.no_alcance(p_orgao, null)) then
    raise exception 'Seu perfil não pode alterar a importação de licitações.';
  end if;
  if p_publicar and not public.tem_permissao(p_orgao, 'licitacoes', 'publicar') then
    raise exception 'Seu perfil não pode publicar licitações: deixe "publicar direto" desmarcado.';
  end if;
  select coalesce(array_agg(distinct d), '{}') into v_cnpjs
    from (select regexp_replace(x, '\D', '', 'g') as d from unnest(coalesce(p_cnpjs, '{}')) x) s
   where length(d) = 14;
  if p_auto and cardinality(v_cnpjs) = 0 then
    raise exception 'Informe pelo menos um CNPJ com 14 números.';
  end if;
  update public.orgaos
     set configuracoes = coalesce(configuracoes, '{}'::jsonb)
       || jsonb_build_object('pncp_auto', p_auto, 'pncp_publicar_auto', p_publicar, 'pncp_cnpjs', to_jsonb(v_cnpjs))
   where id = p_orgao;
end;
$$;
revoke all on function public.definir_pncp_automatico(uuid, boolean, boolean, text[]) from public, anon;
grant execute on function public.definir_pncp_automatico(uuid, boolean, boolean, text[]) to authenticated;


-- ---------------------------------------------------------------------
-- 1b. ACESSO DA FUNÇÃO DE SINCRONIZAÇÃO ÀS TABELAS
--     O projeto foi criado com "Automatically expose new tables" desmarcado,
--     então nem a chave secreta (papel service_role) recebe acesso sozinha às
--     tabelas novas. Sem estas liberações a função falha com
--     "permission denied for table orgaos" (erro visto na instalação de 13/11/2026).
--     O service_role ignora as regras de RLS, mas só existe no servidor.
-- ---------------------------------------------------------------------
grant usage on schema public to service_role;
grant select, update on public.orgaos to service_role;
grant select, insert, update, delete on public.licitacoes, public.licitacoes_documentos to service_role;
grant insert on public.historico to service_role;


-- ---------------------------------------------------------------------
-- 2. CHAVE DA SINCRONIZAÇÃO (no cofre do banco, criada uma única vez)
--    Só quem tem a chave consegue disparar a função de sincronização.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'pncp_sinc_chave') then
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'pncp_sinc_chave',
      'Chave que o agendamento usa para chamar a função pncp-sincronizar');
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 3. AGENDAMENTO: todo dia às 03:15 (horário de Brasília = 06:15 UTC)
-- ---------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid) from cron.job where jobname = 'pncp-sincronizar';
select cron.schedule('pncp-sincronizar', '15 6 * * *', $cron$
  select net.http_post(
    url := 'https://gyjfkhyufubtmowgjgrq.supabase.co/functions/v1/pncp-sincronizar',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-chave-sinc', (select decrypted_secret from vault.decrypted_secrets where name = 'pncp_sinc_chave')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000);
$cron$);


-- ---------------------------------------------------------------------
-- 4. COPIE ESTA CHAVE para Edge Functions › Secrets › PNCP_SINC_CHAVE
-- ---------------------------------------------------------------------
select decrypted_secret as "copie esta chave para PNCP_SINC_CHAVE"
from vault.decrypted_secrets where name = 'pncp_sinc_chave';

-- Para testar na hora, sem esperar a madrugada (tire os dois traços e rode):
-- select net.http_post(url := 'https://gyjfkhyufubtmowgjgrq.supabase.co/functions/v1/pncp-sincronizar',
--   headers := jsonb_build_object('Content-Type', 'application/json', 'x-chave-sinc',
--     (select decrypted_secret from vault.decrypted_secrets where name = 'pncp_sinc_chave')),
--   body := '{}'::jsonb, timeout_milliseconds := 150000);
-- Resposta (alguns segundos depois): select status_code, content from net._http_response order by id desc limit 1;
