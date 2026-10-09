-- DA6: testes transacionais para cron sem tráfego HTTP; usa fila local de 100 fotos.
\set ON_ERROR_STOP on
BEGIN;
CREATE SCHEMA IF NOT EXISTS vault;
CREATE SCHEMA IF NOT EXISTS net;
CREATE SCHEMA IF NOT EXISTS cron;
CREATE TABLE vault.decrypted_secrets(name text PRIMARY KEY,decrypted_secret text);
CREATE TABLE cron.job(jobname text PRIMARY KEY);
CREATE FUNCTION cron.schedule(p_name text,p_schedule text,p_command text)
 RETURNS bigint LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO cron.job(jobname) VALUES(p_name);
 RETURN 1;
END $$;
CREATE TABLE public.da6_outbound_requests (
 id bigserial PRIMARY KEY,url text NOT NULL,headers jsonb,body jsonb,timeout_ms integer
);
CREATE FUNCTION net.http_post(
 url text,body jsonb DEFAULT '{}'::jsonb,params jsonb DEFAULT '{}'::jsonb,
 headers jsonb DEFAULT '{}'::jsonb,timeout_milliseconds integer DEFAULT 1000)
 RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_id bigint;
BEGIN
 INSERT INTO public.da6_outbound_requests(url,headers,body,timeout_ms)
 VALUES(url,headers,body,timeout_milliseconds) RETURNING id INTO v_id;
 RETURN v_id;
END $$;
