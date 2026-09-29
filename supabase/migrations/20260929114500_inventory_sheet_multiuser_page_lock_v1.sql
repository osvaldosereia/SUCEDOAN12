-- Multi-device inventory sheet upload guard.
-- One physical printed page (batch + page) can have only one official scan.
-- This prevents duplicate stock/gondola application when different operators
-- upload the same page from different mobile devices.

create unique index if not exists inventory_sheet_page_scans_one_per_page_uidx
  on public.inventory_sheet_page_scans(batch_id, page_number);
