-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 44 — Agenda (0.41.0)
-- Compromissos e eventos do órgão (sessões, reuniões, audiências, eventos,
-- agenda do prefeito ou do presidente da Câmara…): página "Agenda" no site,
-- com os próximos e os anteriores, e bloco "Agenda" na página inicial (próximos
-- compromissos). Cadastro em Notícias, banners e avisos › Agenda (mesmas
-- permissões das notícias). Pode rodar mais de uma vez.
-- =====================================================================
create table if not exists public.agenda (
  id            uuid primary key default gen_random_uuid(),
  orgao_id      uuid not null references public.orgaos(id) on delete cascade,
  titulo        text not null check (char_length(titulo) between 3 and 200),
  descricao     text check (descricao is null or char_length(descricao) <= 4000),
  categoria     text check (categoria is null or char_length(categoria) <= 60),   -- ex.: Sessão, Reunião, Audiência pública, Evento
  inicio        timestamptz not null,                                             -- dia e hora (dia inteiro: 00:00)
  fim           timestamptz,
  dia_inteiro   boolean not null default false,
  local         text check (local is null or char_length(local) <= 300),
  link_url      text check (link_url is null or link_url ~* '^https?://'),        -- transmissão, inscrição ou mais informações
  andamento     text not null default 'prevista' check (andamento in ('prevista', 'realizada', 'adiada', 'cancelada')),
  situacao      text not null default 'rascunho' check (situacao in ('rascunho', 'publicado')),
  publicado_em  timestamptz,
  busca         text generated always as (public.normalizar_texto(titulo || ' ' || coalesce(categoria, '') || ' ' || coalesce(local, '') || ' ' || coalesce(descricao, ''))) stored,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint agenda_periodo check (fim is null or fim >= inicio)
);
create index if not exists agenda_lista_idx on public.agenda (orgao_id, inicio desc, id desc);

alter table public.agenda enable row level security;
drop trigger if exists agenda_publicacao on public.agenda;
create trigger agenda_publicacao before insert or update on public.agenda for each row execute function public.controlar_publicacao('noticias');
drop trigger if exists agenda_atualizado on public.agenda;
create trigger agenda_atualizado before update on public.agenda for each row execute function public.marcar_atualizacao();
drop trigger if exists agenda_historico on public.agenda;
create trigger agenda_historico after insert or update or delete on public.agenda for each row execute function public.registrar_historico();

drop policy if exists "agenda: leitura" on public.agenda;
create policy "agenda: leitura" on public.agenda for select to anon, authenticated using (situacao = 'publicado' or public.e_membro(orgao_id));
drop policy if exists "agenda: inclusão" on public.agenda;
create policy "agenda: inclusão" on public.agenda for insert to authenticated
  with check (public.tem_permissao(orgao_id, 'noticias', 'editar') and public.no_alcance(orgao_id, null));
drop policy if exists "agenda: edição" on public.agenda;
create policy "agenda: edição" on public.agenda for update to authenticated
  using (public.tem_permissao(orgao_id, 'noticias', 'editar') and public.no_alcance(orgao_id, null))
  with check (public.tem_permissao(orgao_id, 'noticias', 'editar') and public.no_alcance(orgao_id, null));
drop policy if exists "agenda: exclusão" on public.agenda;
create policy "agenda: exclusão" on public.agenda for delete to authenticated
  using (public.tem_permissao(orgao_id, 'noticias', 'excluir') and public.no_alcance(orgao_id, null));
grant select on public.agenda to anon;
grant select, insert, update, delete on public.agenda to authenticated;

-- Conferência
select 'agenda pronta' as situacao, count(*) as compromissos from public.agenda;
