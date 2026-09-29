-- Dona Antônia · folhas A4 de balanço
-- Permite novas leituras/correções da mesma página sem apagar o histórico anterior.
-- A proteção contra aplicação acidental continua no nível de cada scan/result/job.

drop index if exists public.inventory_sheet_page_scans_one_per_page_uidx;

comment on table public.inventory_sheet_page_scans is
'Leituras de folhas A4 de balanço. Uma mesma página física pode ter várias tentativas/leleituras; cada scan preserva seu próprio histórico.';
