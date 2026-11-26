-- =====================================================================
-- Script 57 — Unidades principais da aba "Unidades" do site (0.52.0)
-- A aba "Unidades" da Estrutura organizacional mostrava sempre as unidades do topo
-- do organograma. Agora cada órgão pode marcar quais unidades aparecem como cartões
-- principais (ex.: no Cimop, Conselho de Administração, Diretoria Executiva e
-- Câmaras Temáticas), sem mexer no organograma. Sem nenhuma marcada, continua como antes.
-- Só acrescenta: pode rodar antes da publicação e mais de uma vez.
-- =====================================================================

alter table public.unidades add column if not exists destaque boolean not null default false;
comment on column public.unidades.destaque is
  'Unidade principal na aba "Unidades" do site. Sem nenhuma marcada no órgão, o site mostra as unidades do topo do organograma.';

-- Cimop: as três unidades principais pedidas.
update public.unidades set destaque = true
 where orgao_id = '55c21f92-9f51-4852-b700-0ae885dff09d'
   and nome in ('Conselho de Administração', 'Diretoria Executiva', 'Câmaras Temáticas') and not destaque;

select o.nome, string_agg(u.nome, ', ' order by u.nome) as principais
  from public.unidades u join public.orgaos o on o.id = u.orgao_id where u.destaque group by o.nome;
