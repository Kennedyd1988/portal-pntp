-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 30 — Permissões da chave secreta (funções de servidor)
--
-- Rodar no SQL Editor. Pode rodar mais de uma vez.
--
-- Por quê: projetos novos da Supabase não dão mais permissão automática nas
-- tabelas para a chave secreta (papel "service_role"), que é a que as funções
-- de servidor usam (convidar-usuario, pncp-sincronizar, atendimento-arquivos,
-- atendimento-emails). Sem isso elas falham com "permission denied for table".
-- O service_role só existe no servidor (nunca vai para o navegador), então
-- o painel e o site continuam presos às regras de cada tabela (RLS).
-- =====================================================================

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Tabelas e funções criadas pelos próximos scripts já nascem com a permissão.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;

-- Conferência: deve mostrar 0
select count(*) as tabelas_sem_permissao
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'v', 'p')
  and not has_table_privilege('service_role', c.oid, 'SELECT');
