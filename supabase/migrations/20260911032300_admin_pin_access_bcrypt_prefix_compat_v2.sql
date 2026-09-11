-- pgcrypto/crypt espera o formato bcrypt compatível $2a$ neste projeto.
-- Alguns geradores externos emitem $2y$ para o mesmo hash. Para PIN numérico ASCII,
-- a troca do marcador preserva o hash e permite a validação correta pelo PostgreSQL.
update public.admin_pin_access_config
set pin_hash='$2a$'||substr(pin_hash,5),
    updated_at=now()
where id=1
  and left(pin_hash,4)='$2y$';
