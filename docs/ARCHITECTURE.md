# Dona Antônia — Arquitetura Canônica

## Escopo

Este repositório e o Supabase canônico existem somente para o site público e o Vitrine Admin.

## Fonte de verdade

- Código: `osvaldosereia/SUCEDOAN12`.
- Supabase canônico: `ssbesxgaijknwsjbsbcz`.
- `qxstkwshuvplmmftrctj` é legado temporário e deve ser eliminado após a migração das últimas ações do admin.

## Arquitetura alvo

- uma única API pública: `storefront-v2`;
- uma única API operacional do admin;
- `admin-pin-auth-v1` para autenticação administrativa;
- módulos internos por domínio para produtos, estoque, validade, ofertas, gôndolas, clientes, pedidos, Bling e fiscal;
- zero polling/cron periódico sem justificativa;
- preferir eventos e ações sob demanda;
- toda Edge Function de produção deve existir no GitHub;
- nenhuma dependência nova do projeto legado;
- pedidos históricos permanecem preservados.

## Critério de conclusão

O site e o admin usam somente o Supabase canônico; o projeto legado não recebe chamadas; não existem jobs periódicos desnecessários; não existem funções/tabelas órfãs; GitHub e Supabase refletem a mesma aplicação; smoke tests passam após cada deploy.
