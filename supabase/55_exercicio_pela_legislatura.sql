-- =====================================================================
-- Script 55 — "Em exercício" do vereador calculado pela legislatura (0.50.0)
-- Antes, "Em exercício" era uma caixa marcada à mão em cada vereador, repetindo o que a
-- legislatura já diz. Agora:
--   em_exercicio = a legislatura do vereador inclui o ano atual  E  ele não está afastado.
--   afastado     = nova caixa, só para a exceção: licença, renúncia, cassação, falecimento,
--                  ou suplente que já devolveu a vaga ao titular.
-- Sem legislatura informada, "Em exercício" continua manual (como antes).
-- Na virada da legislatura (1º de janeiro), uma tarefa diária atualiza sozinha.
-- Vereadores que estavam desmarcados com a legislatura em curso viram "afastado".
-- Pode rodar mais de uma vez.
-- =====================================================================

alter table public.parlamentares add column if not exists afastado boolean not null default false;
comment on column public.parlamentares.afastado is
  'Afastado do mandato dentro da legislatura (licença, renúncia, cassação, suplente que devolveu a vaga). Tira o vereador da composição atual.';

-- Ano corrente no horário de Brasília/Fortaleza.
create or replace function public.ano_atual_brasil()
returns integer language sql stable as $$
  select extract(year from now() at time zone 'America/Fortaleza')::integer;
$$;

-- Regra única: dentro da legislatura e não afastado. Fim em branco = início + 3 (mandato de 4 anos).
create or replace function public.calcular_exercicio_parlamentar()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.legislatura_inicio is not null then
    new.em_exercicio := public.ano_atual_brasil() between new.legislatura_inicio
                          and coalesce(new.legislatura_fim, new.legislatura_inicio + 3)
                        and not coalesce(new.afastado, false);
  end if;
  return new;
end $$;

-- Uma vez: quem estava desmarcado com a legislatura em curso passa a ser "afastado".
update public.parlamentares p set afastado = true
 where not p.em_exercicio and not p.afastado and p.legislatura_inicio is not null
   and public.ano_atual_brasil() between p.legislatura_inicio and coalesce(p.legislatura_fim, p.legislatura_inicio + 3);

drop trigger if exists parlamentares_exercicio on public.parlamentares;
create trigger parlamentares_exercicio before insert or update on public.parlamentares
  for each row execute function public.calcular_exercicio_parlamentar();

-- Recalcula só quem mudou (na prática, na virada da legislatura).
create or replace function public.atualizar_exercicio_parlamentares()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.parlamentares p set afastado = p.afastado
   where p.legislatura_inicio is not null
     and p.em_exercicio is distinct from (public.ano_atual_brasil() between p.legislatura_inicio
           and coalesce(p.legislatura_fim, p.legislatura_inicio + 3) and not p.afastado);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.atualizar_exercicio_parlamentares() from public, anon, authenticated;

select public.atualizar_exercicio_parlamentares();

create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'parlamentares-exercicio';
-- 00:20 de Brasília (03:20 UTC).
select cron.schedule('parlamentares-exercicio', '20 3 * * *', $cron$ select public.atualizar_exercicio_parlamentares(); $cron$);

-- Conferência
select count(*) filter (where em_exercicio) as em_exercicio, count(*) filter (where afastado) as afastados,
       count(*) filter (where legislatura_inicio is null) as sem_legislatura
  from public.parlamentares;
