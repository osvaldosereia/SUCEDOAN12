-- extension: pg_cron
create extension if not exists pg_cron with schema pg_catalog;

-- extension: pg_net
create extension if not exists pg_net with schema extensions;

-- extension: pg_stat_statements
create extension if not exists pg_stat_statements with schema extensions;

-- extension: pg_trgm
create extension if not exists pg_trgm with schema extensions;

-- extension: pgcrypto
create extension if not exists pgcrypto with schema extensions;

-- extension: pgmq
create extension if not exists pgmq with schema pgmq;

-- extension: supabase_vault
create extension if not exists supabase_vault with schema vault;

-- extension: uuid-ossp
create extension if not exists "uuid-ossp" with schema extensions;
