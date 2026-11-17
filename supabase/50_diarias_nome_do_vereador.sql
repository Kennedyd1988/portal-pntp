-- =====================================================================
-- Script 50 — Diária de vereador com o nome do cadastro do vereador (0.44.4)
-- O nome lido da portaria (às vezes por OCR) vinha com variações: "Apolina" ×
-- "Apoliana", "Araujo" × "Araújo"… e a mesma pessoa aparecia com nomes
-- diferentes na lista de diárias. Agora:
--   · diária ligada a um vereador guarda o nome completo do cadastro dele;
--   · corrigir o nome no cadastro do vereador corrige todas as diárias dele.
-- Diárias de servidores (sem vereador ligado) não mudam.
-- Pode rodar mais de uma vez.
-- =====================================================================
create or replace function public.diaria_nome_do_vereador()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.parlamentar_id is not null then
    select p.nome into new.nome from public.parlamentares p where p.id = new.parlamentar_id;
  end if;
  return new;
end $$;
drop trigger if exists diarias_nome_vereador on public.diarias;
create trigger diarias_nome_vereador before insert or update of parlamentar_id, nome on public.diarias
  for each row execute function public.diaria_nome_do_vereador();

create or replace function public.vereador_nome_nas_diarias()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.diarias set nome = new.nome where parlamentar_id = new.id and nome is distinct from new.nome;
  return new;
end $$;
drop trigger if exists parlamentares_nome_diarias on public.parlamentares;
create trigger parlamentares_nome_diarias after update of nome on public.parlamentares
  for each row when (old.nome is distinct from new.nome) execute function public.vereador_nome_nas_diarias();

-- Diárias já gravadas: nome do cadastro.
update public.diarias d set nome = p.nome from public.parlamentares p
 where p.id = d.parlamentar_id and d.nome is distinct from p.nome;
