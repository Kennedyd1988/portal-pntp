-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 40 — "Corrigir" da autoavaliação abre a aba certa (0.30.0)
-- Os botões "Corrigir" dos cartões de pendência do PNTP levavam só à tela do
-- módulo. Agora levam à aba do critério (ex.: 9.3 → Contratos › Fiscais;
-- 11.5 → Planejamento e contas › RGF; 10.4 → Obras › Obras paralisadas).
-- Os scripts 26 e 34 já vêm com os mesmos endereços: rodar o 26 de novo depois
-- não desfaz esta mudança. Pode rodar mais de uma vez.
-- =====================================================================

update public.pntp_criterios k set rota = v.rota
from (values
  ('2.1', '#/m/institucional?aba=unidades'),
  ('2.2', '#/m/institucional?aba=unidades'),
  ('2.3', '#/m/institucional?aba=gestores'),
  ('2.7', '#/m/paginas?aba=faq'),
  ('5.1', '#/m/convenios?aba=recebida'),
  ('5.2', '#/m/convenios?aba=realizada'),
  ('5.3', '#/m/convenios?aba=sem_repasse'),
  ('8.1', '#/m/licitacoes?aba=licitacoes'),
  ('8.2', '#/m/licitacoes?aba=licitacoes'),
  ('8.3', '#/m/licitacoes?aba=licitacoes'),
  ('8.4', '#/m/licitacoes?aba=diretas'),
  ('8.5', '#/m/licitacoes?aba=adesoes'),
  ('9.1', '#/m/contratos?aba=contratos'),
  ('9.2', '#/m/contratos?aba=contratos'),
  ('9.3', '#/m/contratos?aba=fiscais'),
  ('10.1', '#/m/obras?aba=obras'),
  ('10.2', '#/m/obras?aba=obras'),
  ('10.3', '#/m/obras?aba=obras'),
  ('10.4', '#/m/obras?aba=paralisadas'),
  ('11.1', '#/m/contas?aba=balanco'),
  ('11.2', '#/m/contas?aba=relatorio_gestao'),
  ('11.3', '#/m/contas?aba=parecer_tce'),
  ('11.4', '#/m/contas?aba=julgamento_camara'),
  ('11.5', '#/m/contas?aba=rgf'),
  ('11.6', '#/m/contas?aba=rreo'),
  ('11.7', '#/m/contas?aba=plano_estrategico'),
  ('11.8', '#/m/contas?aba=ppa'),
  ('11.9', '#/m/contas?aba=ldo'),
  ('11.10', '#/m/contas?aba=loa'),
  ('14.3', '#/m/servicos?aba=servicos'),
  ('15.3', '#/m/servicos?aba=online'),
  ('17.1', '#/m/emendas?aba=federal'),
  ('17.2', '#/m/emendas?aba=estmun'),
  ('17.3', '#/m/emendas?aba=todas'),
  ('20.8', '#/m/contas?aba=julgamento_camara')
) as v(codigo, rota)
where k.codigo = v.codigo;

-- Conferência: critérios com endereço de correção.
select codigo, titulo, rota from public.pntp_criterios where rota is not null order by ordem;
