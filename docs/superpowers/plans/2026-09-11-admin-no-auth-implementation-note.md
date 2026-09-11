# Admin no-auth implementation note

O Admin oficial passa a usar somente `admin/config.js`, `admin/app-lite.js` e `admin/simple.css`, chamando o endpoint público `admin-simple-v2`.

A antiga camada de sessão do aparelho não faz mais parte do caminho oficial. O endpoint foi implantado no Supabase com `verify_jwt=false` conforme instrução explícita do proprietário.
