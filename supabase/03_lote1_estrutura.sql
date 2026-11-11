-- =====================================================================
-- PORTAL PNTP · SOFT+
-- Script 03 — Lote 1 (versão 0.2.0): gestores, ajustes nas unidades e
--             armazenamento de arquivos (brasão, fotos, currículos)
--
-- Como usar: Supabase › SQL Editor › New query › colar tudo › Run.
-- Rodar depois dos scripts 01 e 02.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. UNIDADES: norma de criação (PNTP 2.1) e nome único por órgão
-- ---------------------------------------------------------------------
alter table public.unidades
  add column if not exists norma_criacao text,          -- ex.: "Lei Complementar nº 001/2017"
  add column if not exists norma_url     text;          -- PDF da norma (opcional)

-- Evita cadastrar a mesma secretaria duas vezes no mesmo órgão.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'unidades_nome_unico') then
    alter table public.unidades add constraint unidades_nome_unico unique (orgao_id, nome);
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 2. GESTORES (PNTP 2.3 — nome dos atuais responsáveis)
-- ---------------------------------------------------------------------
create table if not exists public.gestores (
  id             uuid primary key default gen_random_uuid(),
  orgao_id       uuid not null references public.orgaos(id) on delete cascade,
  -- "restrict": não deixa excluir uma unidade que ainda tem gestor vinculado.
  unidade_id     uuid references public.unidades(id) on delete restrict,
  nome           text not null,
  cargo          text not null,
  email          text,
  telefone       text,
  foto_url       text,
  curriculo_url  text,
  destaque_capa  boolean not null default false,   -- aparece no bloco "Gestão" da página inicial
  ordem          integer not null default 0,       -- ordem no bloco da capa (prefeito primeiro…)
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
create index if not exists gestores_orgao_idx on public.gestores (orgao_id);

drop trigger if exists gestores_atualizado on public.gestores;
create trigger gestores_atualizado before update on public.gestores
  for each row execute function public.marcar_atualizacao();

drop trigger if exists gestores_historico on public.gestores;
create trigger gestores_historico after insert or update or delete on public.gestores
  for each row execute function public.registrar_historico();

alter table public.gestores enable row level security;

drop policy if exists "gestores: leitura pública dos ativos" on public.gestores;
create policy "gestores: leitura pública dos ativos" on public.gestores
  for select to anon, authenticated
  using (ativo or public.e_membro(orgao_id));

-- Usuário setorial só mexe em gestores da própria unidade (alcance).
drop policy if exists "gestores: inclusão" on public.gestores;
create policy "gestores: inclusão" on public.gestores
  for insert to authenticated
  with check (public.tem_permissao(orgao_id, 'institucional', 'editar') and public.no_alcance(orgao_id, unidade_id));

drop policy if exists "gestores: edição" on public.gestores;
create policy "gestores: edição" on public.gestores
  for update to authenticated
  using (public.tem_permissao(orgao_id, 'institucional', 'editar') and public.no_alcance(orgao_id, unidade_id))
  with check (public.tem_permissao(orgao_id, 'institucional', 'editar') and public.no_alcance(orgao_id, unidade_id));

drop policy if exists "gestores: exclusão" on public.gestores;
create policy "gestores: exclusão" on public.gestores
  for delete to authenticated
  using (public.tem_permissao(orgao_id, 'institucional', 'excluir') and public.no_alcance(orgao_id, unidade_id));

-- UNIDADES: refaz as regras do script 01 incluindo o alcance.
-- Setorial edita só a própria unidade; criar e excluir unidades exige alcance total
-- (no_alcance com unidade nula só é verdadeiro para quem não tem unidade definida).
drop policy if exists "unidades: inclusão" on public.unidades;
create policy "unidades: inclusão" on public.unidades
  for insert to authenticated
  with check (public.tem_permissao(orgao_id, 'institucional', 'editar') and public.no_alcance(orgao_id, null));

drop policy if exists "unidades: edição" on public.unidades;
create policy "unidades: edição" on public.unidades
  for update to authenticated
  using (public.tem_permissao(orgao_id, 'institucional', 'editar') and public.no_alcance(orgao_id, id))
  with check (public.tem_permissao(orgao_id, 'institucional', 'editar') and public.no_alcance(orgao_id, id));

drop policy if exists "unidades: exclusão" on public.unidades;
create policy "unidades: exclusão" on public.unidades
  for delete to authenticated
  using (public.tem_permissao(orgao_id, 'institucional', 'excluir') and public.no_alcance(orgao_id, null));

grant select on public.gestores to anon;
grant select, insert, update, delete on public.gestores to authenticated;


-- ---------------------------------------------------------------------
-- 3. ARMAZENAMENTO DE ARQUIVOS
--    Bucket público "arquivos": qualquer visitante abre (o site precisa
--    mostrar brasão, fotos e PDFs); só envia/apaga quem tem permissão.
--    Caminho obrigatório: <id do órgão>/<código do módulo>/<arquivo>
--    ex.: 7f3c…/institucional/9a1b….webp
--    (Na produção os arquivos irão para o Cloudflare R2; ver README.)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('arquivos', 'arquivos', true, 10485760,   -- 10 MB por arquivo
        array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
-- SVG fica de fora de propósito: pode carregar código e ser usado para ataque.

-- Confere se quem está logado pode gravar no caminho informado.
-- Não dá erro com caminho malformado: só responde "não".
create or replace function public.pode_gravar_arquivo(p_caminho text, p_acao text)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  partes text[] := string_to_array(p_caminho, '/');
  v_orgao uuid;
begin
  if array_length(partes, 1) < 3 then
    return false;
  end if;
  begin
    v_orgao := partes[1]::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  return public.tem_permissao(v_orgao, partes[2], p_acao);
end;
$$;
grant execute on function public.pode_gravar_arquivo(text, text) to authenticated;

drop policy if exists "arquivos: enviar" on storage.objects;
create policy "arquivos: enviar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'arquivos' and public.pode_gravar_arquivo(name, 'editar'));

drop policy if exists "arquivos: substituir" on storage.objects;
create policy "arquivos: substituir" on storage.objects
  for update to authenticated
  using (bucket_id = 'arquivos' and public.pode_gravar_arquivo(name, 'editar'))
  with check (bucket_id = 'arquivos' and public.pode_gravar_arquivo(name, 'editar'));

drop policy if exists "arquivos: apagar" on storage.objects;
create policy "arquivos: apagar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'arquivos' and public.pode_gravar_arquivo(name, 'excluir'));


-- ---------------------------------------------------------------------
-- 4. APARÊNCIA: chaves usadas em orgaos.configuracoes (referência)
--    nome_exibicao, cor_principal, brasao_url, endereco, cep, telefone,
--    email, horario, instagram, facebook, youtube, whatsapp
--    (o campo é livre — esta lista só documenta o que o painel grava)
-- ---------------------------------------------------------------------
comment on column public.orgaos.configuracoes is
  'Itens PÚBLICOS do site. Chaves: nome_exibicao, cor_principal, brasao_url, endereco, cep, telefone, email, horario, instagram, facebook, youtube, whatsapp.';
