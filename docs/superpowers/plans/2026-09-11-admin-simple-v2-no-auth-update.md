# Admin Simple V2 No-Auth Update

A especificação aprovada foi alterada por instrução explícita do usuário: o Admin oficial não terá autenticação, senha, PIN ou autorização por aparelho.

## Ordem imediata

1. Criar `admin-simple-v2` público com `verify_jwt=false` e ações mínimas de Produtos, Cestas e Clientes.
2. Trocar `admin/config.js` para esse endpoint único.
3. Remover `accessNotice`, sessão local e refresh JWT de `admin/index.html`/`admin/app-lite.js`.
4. Remover Contagens, Fila Bling e qualquer UI WhatsApp/Meta/IA.
5. Substituir módulos legados de produto/cesta/cliente por módulos pequenos usando o endpoint único.
6. Confirmar CI e depois seguir para Vitrine V2.
