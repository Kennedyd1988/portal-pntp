-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 04 — Carga inicial da Prefeitura Municipal de Riacho da Cruz/RN
-- Fonte: relação de setores e responsáveis do site oficial
--        (copiada pelo Kennedy em 11/11/2026).
--
-- Como usar: Supabase › SQL Editor › New query › colar tudo › Run.
-- Rodar depois do script 03. Pode rodar de novo: não duplica nada.
-- Depois, tudo pode ser corrigido pelo próprio painel.
-- =====================================================================

do $$
declare
  v_orgao uuid;
  -- Endereço comum (Centro Administrativo). As variações de grafia do site
  -- ("Léllis", "Lelis", "Camilla") foram padronizadas aqui.
  c_end constant text := 'Av. Camila de Léllis, nº 285, Centro, CEP 59.820-000 (Centro Administrativo)';
  c_hor constant text := 'Segunda a sexta, das 8h às 12h e das 13h às 17h';
  c_tel constant text := '(84) 3374-0002';
  c_mail constant text := 'pmriachodacruz@gmail.com';
begin
  select id into v_orgao from public.orgaos where cnpj = '08.153.454/0001-04';
  if v_orgao is null then
    raise exception 'Órgão piloto não encontrado. Rode o script 02 antes deste.';
  end if;

  -- -------------------------------------------------------------------
  -- Aparência e contatos gerais (mantém o que já tiver sido preenchido no painel)
  -- -------------------------------------------------------------------
  update public.orgaos
     set configuracoes = jsonb_build_object(
           'nome_exibicao', 'Prefeitura Municipal de Riacho da Cruz',
           'cor_principal', '#0d4fc4',
           'endereco', 'Av. Camila de Léllis, nº 285, Centro (Centro Administrativo)',
           'cep', '59.820-000',
           'telefone', c_tel,
           'email', c_mail,
           'horario', c_hor
         ) || configuracoes
   where id = v_orgao;

  -- -------------------------------------------------------------------
  -- Unidades (ordem = posição na lista do site)
  -- -------------------------------------------------------------------
  insert into public.unidades (orgao_id, nome, endereco, telefone, email, horario_atendimento, ordem)
  values
    (v_orgao, 'Gabinete do Prefeito',                                              c_end, '(84) 3374-0017', 'rego.aurelio@ig.com.br',                  c_hor, 1),
    (v_orgao, 'Vice-Prefeitura',                                                   c_end, null,             'claudiouberlane41@gmail.com',             c_hor, 2),
    (v_orgao, 'Chefia de Gabinete',                                                c_end, c_tel,            'pmriachodacruz.adm@gmail.com',            'Segunda a sexta, das 8h às 14h', 3),
    (v_orgao, 'Secretaria Municipal de Administração e Planejamento',              c_end, c_tel,            c_mail,                                    c_hor, 4),
    (v_orgao, 'Comissão Permanente de Licitação',                                  c_end, c_tel,            'pmriachodacruz.licitacao@gmail.com',      c_hor, 5),
    (v_orgao, 'Secretaria Municipal de Desenvolvimento Social e Família',          c_end, c_tel,            'semasriachodacruz@gmail.com',             c_hor, 6),
    (v_orgao, 'Secretaria Municipal de Turismo e Meio Ambiente',                   c_end, c_tel,            c_mail,                                    c_hor, 7),
    (v_orgao, 'Secretaria Municipal de Transportes',                               c_end, c_tel,            c_mail,                                    c_hor, 8),
    (v_orgao, 'Secretaria Municipal de Saúde e Saneamento',                        c_end, '(84) 99839-6471', 'riachodacruzsecretariadesaude@gmail.com', 'Segunda a sexta, das 8h às 14h', 9),
    (v_orgao, 'Secretaria Municipal de Obras e Serviços Urbanos',                  c_end, c_tel,            c_mail,                                    c_hor, 10),
    (v_orgao, 'Secretaria Municipal de Finanças',                                  c_end, c_tel,            c_mail,                                    'Segunda a sexta, das 8h às 13h e das 14h às 16h', 11),
    (v_orgao, 'Secretaria Municipal de Educação, Cultura, Desporto e Juventude',   c_end, c_tel,            'semecriachodacruz@gmail.com',             c_hor, 12),
    (v_orgao, 'Secretaria Municipal de Agricultura, Pecuária e Pesca',             c_end, c_tel,            c_mail,                                    c_hor, 13),
    (v_orgao, 'Secretaria do Gabinete Civil',                                      c_end, null,             null,                                      'Segunda a sexta, das 7h às 13h', 14),
    (v_orgao, 'Controladoria Geral do Município',                                  c_end, c_tel,            c_mail,                                    c_hor, 15)
  on conflict (orgao_id, nome) do nothing;

  -- A Chefia de Gabinete fica dentro do Gabinete do Prefeito no organograma.
  update public.unidades u
     set unidade_pai_id = (select id from public.unidades where orgao_id = v_orgao and nome = 'Gabinete do Prefeito')
   where u.orgao_id = v_orgao and u.nome = 'Chefia de Gabinete' and u.unidade_pai_id is null;

  -- -------------------------------------------------------------------
  -- Gestores (nomes como publicados no site, só ajustando maiúsculas).
  -- "Secretário(a)" fica neutro de propósito: ajustar o cargo no painel.
  -- destaque_capa = aparece no bloco "Gestão" da página inicial.
  -- -------------------------------------------------------------------
  insert into public.gestores (orgao_id, unidade_id, nome, cargo, email, telefone, destaque_capa, ordem)
  select v_orgao, u.id, g.nome, g.cargo, g.email, g.telefone, g.destaque, g.ordem
  from (values
    ('Gabinete do Prefeito',                                            'Marcos Aurelio de Paiva Rêgo',        'Prefeito',                        'rego.aurelio@ig.com.br',                  '(84) 3374-0017',  true,  1),
    ('Vice-Prefeitura',                                                 'Claudio Uberlane de Sá',              'Vice-Prefeito',                   'claudiouberlane41@gmail.com',             null,              true,  2),
    ('Chefia de Gabinete',                                              'Renata Maria Virginio Nunes Rêgo',    'Chefe de Gabinete',               'pmriachodacruz.adm@gmail.com',            '(84) 3374-0002',  true,  3),
    ('Secretaria Municipal de Administração e Planejamento',            'Nadja Caroline Melo de Paiva Rêgo',   'Secretário(a) Municipal',         'pmriachodacruz@gmail.com',                '(84) 3374-0002',  false, 10),
    ('Comissão Permanente de Licitação',                                'Anderson Raphael Silva de Oliveira',  'Presidente da Comissão',          'pmriachodacruz.licitacao@gmail.com',      '(84) 3374-0002',  false, 10),
    ('Secretaria Municipal de Desenvolvimento Social e Família',        'Raphaella Alexandre Cavalcante',      'Secretário(a) Municipal',         'semasriachodacruz@gmail.com',             '(84) 3374-0002',  false, 10),
    ('Secretaria Municipal de Turismo e Meio Ambiente',                 'Cleidiany Epifânio de Souza Sá',      'Secretário(a) Municipal',         'pmriachodacruz@gmail.com',                '(84) 3374-0002',  false, 10),
    ('Secretaria Municipal de Transportes',                             'Manoel do Rêgo Neto',                 'Secretário(a) Municipal',         'pmriachodacruz@gmail.com',                '(84) 3374-0002',  false, 10),
    ('Secretaria Municipal de Saúde e Saneamento',                      'Laene Paiva de Rêgo Mesquita',        'Secretário(a) Municipal',         'riachodacruzsecretariadesaude@gmail.com', '(84) 99839-6471', false, 10),
    ('Secretaria Municipal de Obras e Serviços Urbanos',                'Deomar Gomes de Paiva',               'Secretário(a) Municipal',         'pmriachodacruz@gmail.com',                '(84) 3374-0002',  false, 10),
    ('Secretaria Municipal de Finanças',                                'Francisco Jarbas de Paiva',           'Secretário(a) Municipal',         'pmriachodacruz@gmail.com',                '(84) 3374-0002',  false, 10),
    ('Secretaria Municipal de Educação, Cultura, Desporto e Juventude', 'Jose Lazaro Inacio de Melo',          'Secretário(a) Municipal',         'semecriachodacruz@gmail.com',             '(84) 3374-0002',  false, 10),
    ('Secretaria Municipal de Agricultura, Pecuária e Pesca',           'Magnus Kelly Mafaldo de Albuquerque', 'Secretário(a) Municipal',         'pmriachodacruz@gmail.com',                '(84) 3374-0002',  false, 10),
    ('Controladoria Geral do Município',                                'Edileuza Barreto',                    'Controlador(a)-Geral',            'pmriachodacruz@gmail.com',                '(84) 3374-0002',  true,  4)
  ) as g(unidade, nome, cargo, email, telefone, destaque, ordem)
  join public.unidades u on u.orgao_id = v_orgao and u.nome = g.unidade
  where not exists (
    select 1 from public.gestores x where x.orgao_id = v_orgao and x.nome = g.nome
  );
  -- A Secretaria do Gabinete Civil está sem responsável informado no site:
  -- fica sem gestor, para ser preenchida pelo painel.
end $$;

-- Conferência
select (select count(*) from public.unidades u join public.orgaos o on o.id = u.orgao_id where o.cnpj = '08.153.454/0001-04') as unidades,
       (select count(*) from public.gestores g join public.orgaos o on o.id = g.orgao_id where o.cnpj = '08.153.454/0001-04') as gestores;
