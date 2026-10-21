# Dona Antônia — Site + Vitrine Admin

Este repositório contém somente o sistema em produção da Dona Antônia:

- site público: https://www.donaantonia.com.br/
- administração operacional: https://www.donaantonia.com.br/vitrine/admin/
- administração do catálogo: https://www.donaantonia.com.br/catalogo-admin/

## Supabase

- canônico do site, clientes, Bling e fiscal: `ssbesxgaijknwsjbsbcz`
- Vitrine Admin e site público usam exclusivamente o Supabase canônico `ssbesxgaijknwsjbsbcz`; o antigo Chat Commerce OS foi retirado do runtime.

Os painéis públicos e administrativos permanecem neste repositório e usam o catálogo canônico. Novas áreas administrativas devem reutilizar o projeto Supabase oficial, sem criar bancos paralelos.
