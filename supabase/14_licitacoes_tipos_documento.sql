-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 14 — Novos tipos de documento das licitações
--
-- A Cartilha PNTP 2026 lista os documentos que devem estar publicados:
--   8.3 (licitações): termo de referência, justificativa, pareceres,
--       orçamento/preço de referência, edital e anexos, atas, impugnações,
--       recursos e decisões, adjudicação e homologação;
--   8.4 (dispensa/inexigibilidade): termo de referência, justificativa da
--       escolha do contratado e do preço, caracterização da emergência,
--       pareceres e ratificação.
-- Faltavam tipos para estudo técnico, justificativa, orçamento, parecer e
-- emergência. Este script só amplia a lista (nada é apagado).
--
-- Como usar: SQL Editor › New query › colar tudo › Run. Pode repetir.
-- =====================================================================
alter table public.licitacoes_documentos drop constraint if exists licitacoes_documentos_tipo_check;
alter table public.licitacoes_documentos add constraint licitacoes_documentos_tipo_check check (tipo in (
  'estudo_tecnico', 'justificativa', 'orcamento', 'parecer', 'emergencia',
  'aviso', 'edital', 'anexo', 'termo_referencia', 'esclarecimento', 'impugnacao', 'retificacao',
  'ata', 'resultado', 'recurso', 'adjudicacao', 'homologacao', 'ratificacao', 'contrato', 'outro'));
