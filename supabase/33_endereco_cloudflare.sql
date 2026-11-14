-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 33 — Endereço oficial da plataforma na Cloudflare Pages (0.24.4)
-- O site e o painel passam a morar em https://portal-pntp.pages.dev
-- (o endereço antigo do GitHub Pages redireciona para lá). Os e-mails do
-- e-SIC e da Ouvidoria usam este endereço enquanto o órgão não tem domínio.
-- =====================================================================
insert into public.plataforma_config (chave, valor) values ('site_base', '"https://portal-pntp.pages.dev/site/"')
on conflict (chave) do update set valor = excluded.valor;
select chave, valor from public.plataforma_config where chave = 'site_base';
