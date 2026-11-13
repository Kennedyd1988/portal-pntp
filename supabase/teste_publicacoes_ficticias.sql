-- =====================================================================
-- PORTAL PNTP · SOFT+
-- DADOS FICTÍCIOS PARA TESTE — "Últimas publicações" (Riacho da Cruz)
--
-- Não faz parte da instalação: serve só para ver como o site fica.
-- Rodar no SQL Editor. Pode rodar mais de uma vez (não duplica).
-- Todas as publicações daqui apontam para um link terminado em
-- "?teste=1", o que permite apagar tudo de uma vez (comando no fim).
-- =====================================================================

insert into public.publicacoes
  (orgao_id, tipo, numero, ano, data_publicacao, ementa, vigencia, observacao, link_externo, origem, situacao, publicado_em)
select o.id, v.tipo, v.numero, v.ano, v.data::date, v.ementa, v.vigencia, v.observacao,
       'https://www.diariomunicipal.com.br/femurn/?teste=1', 'link', 'publicado', v.data::date + time '09:00'
from public.orgaos o,
(values
  -- LEIS
  ('lei',              '512', 2026, '2026-11-05', 'Dispõe sobre a criação do Programa Municipal Horta na Escola e dá outras providências.', 'vigente', null),
  ('lei',              '511', 2026, '2026-10-21', 'Institui o Dia Municipal do Agricultor Familiar, a ser comemorado em 28 de julho.', 'vigente', null),
  ('lei',              '510', 2026, '2026-09-30', 'Autoriza o Poder Executivo a firmar convênio com o Estado para pavimentação de vias urbanas.', 'vigente', null),
  ('lei_complementar', '18',  2026, '2026-08-14', 'Altera a estrutura administrativa do Poder Executivo Municipal e dá outras providências.', 'vigente', null),
  ('lei',              '498', 2025, '2025-12-10', 'Estima a receita e fixa a despesa do Município para o exercício de 2026 (LOA 2026).', 'vigente', null),
  ('lei',              '470', 2024, '2024-05-02', 'Dispõe sobre a taxa de coleta de lixo.', 'revogada', 'Revogada pela Lei nº 505/2026'),
  -- DECRETOS
  ('decreto',          '145', 2026, '2026-11-10', 'Declara ponto facultativo nas repartições públicas municipais no dia 21 de novembro de 2026.', 'vigente', null),
  ('decreto',          '144', 2026, '2026-11-03', 'Regulamenta a Lei Federal nº 14.129/2021 (Governo Digital) no âmbito do Município.', 'vigente', null),
  ('decreto',          '143', 2026, '2026-10-28', 'Dispõe sobre o novo horário de atendimento ao público nos órgãos da Prefeitura.', 'vigente', null),
  ('decreto',          '142', 2026, '2026-10-15', 'Abre crédito adicional suplementar no orçamento vigente da Secretaria Municipal de Saúde.', 'vigente', null),
  ('decreto',          '139', 2026, '2026-09-02', 'Declara situação de emergência em razão da estiagem prolongada na zona rural.', 'alterada', 'Prazo prorrogado pelo Decreto nº 141/2026'),
  -- PORTARIAS
  ('portaria',         '320', 2026, '2026-11-11', 'Designa servidora para exercer a função de encarregada pelo tratamento de dados pessoais (LGPD).', 'vigente', null),
  ('portaria',         '318', 2026, '2026-11-06', 'Nomeia membros da Comissão Organizadora do Festival de Quadrilhas Juninas 2027.', 'vigente', null),
  ('portaria',         '315', 2026, '2026-10-29', 'Concede férias regulamentares a servidores da Secretaria Municipal de Educação.', 'vigente', null),
  ('portaria',         '309', 2026, '2026-10-08', 'Institui comissão para avaliação de bens móveis inservíveis do patrimônio municipal.', 'vigente', null),
  -- EDITAIS
  ('edital',           '07',  2026, '2026-11-09', 'Processo Seletivo Simplificado para contratação temporária de agentes comunitários de saúde.', 'vigente', null),
  ('edital',           '06',  2026, '2026-10-24', 'Chamamento público para credenciamento de agricultores familiares no PNAE 2027.', 'vigente', null),
  ('edital',           '05',  2026, '2026-09-18', 'Inscrições para o Festival de Quadrilhas Juninas 2027.', 'vigente', null),
  ('edital',           '04',  2026, '2026-08-05', 'Seleção de bolsistas para o programa municipal de estágio.', 'sem_efeito', 'Tornado sem efeito pelo Edital nº 05/2026')
) as v(tipo, numero, ano, data, ementa, vigencia, observacao)
where o.cnpj = '08.153.454/0001-04'
on conflict (orgao_id, tipo, public.normalizar_texto(numero), ano) where numero is not null do nothing;

-- Conferência: quantas publicações de teste existem, por tipo.
select tipo, count(*) as qtd from public.publicacoes
where link_externo like '%teste=1%' group by tipo order by tipo;

-- Para APAGAR todos os dados de teste depois (tire os dois traços e rode):
-- delete from public.publicacoes where link_externo like '%teste=1%';
