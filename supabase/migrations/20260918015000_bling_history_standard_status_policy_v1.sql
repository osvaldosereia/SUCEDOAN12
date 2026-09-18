begin;

-- Mapeamento inicial validado para o histórico:
-- 6 / valor 0 = Em aberto -> não entra como compra concluída.
-- 9 / valor 1 = Atendido -> compra concluída para histórico.
-- A importação futura continua filtrando Atendido; demais situações só entram após validação.

insert into public.bling_history_status_policy(
  bling_status_id,status_name,canonical_status,approved,notes,updated_at
)
values
  (6,'Em aberto','ignored',true,'Mapeamento padrão do Bling; situacao.valor observado = 0. Não contar como compra concluída.',now()),
  (9,'Atendido','delivered',true,'Mapeamento padrão do Bling; situacao.valor observado = 1. Conta como compra concluída.',now())
on conflict(bling_status_id) do update set
  status_name=excluded.status_name,
  canonical_status=excluded.canonical_status,
  approved=excluded.approved,
  notes=excluded.notes,
  updated_at=now();

commit;
