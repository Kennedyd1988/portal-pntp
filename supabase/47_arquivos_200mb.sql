-- =====================================================================
-- Script 47 — Arquivos de até 200 MB (0.44.0; plano Pro da Supabase)
-- O bucket "arquivos" (PDFs e imagens do portal) aceitava até 50 MB por
-- arquivo (scripts 10 e 31). Com o plano Pro, passa a aceitar até 200 MB:
-- leis e balanços escaneados, editais com anexos grandes, arquivos da migração.
-- Também é preciso subir o limite geral do projeto: Storage › Settings ›
-- "Global file size limit" ≥ 200 MB (o menor dos dois vale).
-- Pode rodar mais de uma vez.
-- =====================================================================
update storage.buckets set file_size_limit = 209715200 where id = 'arquivos';
select id, file_size_limit / 1048576 as limite_mb from storage.buckets where id = 'arquivos';
