# Continuidade oficial — Compras/XML operacional R31 (12/10/2026)

## Objetivo
Concluir o fluxo real de notas de compra até catálogo confirmado no Admin/Bling e recebimento em estoque, sem botões ambíguos nem dependência do financeiro Bling.

## Evidência auditada no Supabase
- Projeto canônico: `ssbesxgaijknwsjbsbcz`.
- Serviço publicado: `admin-service-intelligence-v1` (versão 253 no início da rodada). Importa `./purchase-xml-v1/index.ts`.
- O código publicado (index e purchase module) coincidia exatamente com `main` quando conferido em 12/10.
- NF-e Tio Alvino: doc `8f757ff7-2ab7-4c4f-8a8e-480d320b1d8f`, item `1f9e4a37-e783-47c0-9da7-1b4153add620`, sem `product_id`. EAN comercial `7898125370060` vincula à unidade já cadastrada de Arroz Dubom, produto `b47ea0a5-e3ad-49ac-9e0b-79a7f2b85a40`. XML 15 fardos com 6 unidades cada: sugestão 90 UN. EAN tributável distinto `7898125370206`; não sobrescrever EAN de venda.
- NF-e Sendas mais recente: Café Caboclo 250 g, item `7acd2f67-7263-46dd-a77e-404810921d88`, sem `product_id`. EAN `7896089012460` corresponde ao produto `fd1477e7-4e62-46e1-ba9c-8d7992227356`.
- `purchase_xml_settings.auto_create_payables=false` no canônico. Não gerar novas contas a pagar.

## Código e testes
Branch: `agent/xml-operacao-simples-20261012`
PR: https://github.com/osvaldosereia/SUCEDOAN12/pull/1067

Alterados:
- `vitrine/admin/index.html`
- `vitrine/admin/purchase-xml-simple.css`
- `supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/index.ts`
- `supabase/functions/purchase-xml-v1/index.ts` (cópia obrigatoriamente idêntica)
- `scripts/test-purchase-xml-guided-r31.mjs`
- `.github/workflows/purchase-xml-guided-r31-ci.yml`
- `.github/workflows/xml-r31-supabase-deploy-once.yml` (tentativa alternativa com verificação de token)

Testes com sucesso em 12/10: XML purchase guided R31, XML R29 UI safety, Compras XML aviso conferência Bling, XML R29 Canonical Backend and DB, entre outros. Teste global `Admin and Baskets Guard CI` falha por contrato externo não relacionado ao módulo XML (`channel_origin` em vitrine de pedidos), também presente antes de R31.

O frontend permite escolher produto via EAN/nome dentro da nota, fazer confirmação segura `purchase_xml_resolve_catalog_identity_v2`, informar EAN de unidade/embalagem independentemente do número de unidades por fardo, conferir custo/preço e enviar `PATCH /produtos/{id}` somente para preço com GET de confirmação. Custo do fornecedor não deve ser confundido com custo do produto global no Bling. Lotes/recebimento só em etapa separada. Não realizar entrada automática nem testes destrutivos com NF reais.

## BLOQUEIO DE PUBLICAÇÃO
O plugin Supabase `deploy_edge_function` retornou repetidamente `Function deploy failed due to an internal error`. A versão publicada permaneceu 253 durante a conferência. A CLI alternativa do GitHub Actions executou preflight e **parou sem deploy** porque a variável secreta `SUPABASE_ACCESS_TOKEN` não está configurada em GitHub Actions.

A solução fica no PR **não publicada** até concluir deploy da Edge Function e merge controlado do frontend. Evitar mesclar HTML novo antes de garantir serviço capaz de devolver `catalog_sync`, pois isso ocultaria a confirmação real de Bling.

### Ação necessária para desbloquear (sem compartilhar token no chat)
1. Criar token pessoal de acesso no painel Supabase `Account > Access Tokens` (token com acesso ao projeto canônico).
2. Salvar o token no GitHub `osvaldosereia/SUCEDOAN12 > Settings > Secrets and variables > Actions > New repository secret`, nome **SUPABASE_ACCESS_TOKEN**. Jamais colocar o token em código ou mensagem.
3. Reexecutar o job `XML R31 deploy Supabase CLI (one-shot)` do PR #1067 (ou abrir novo PR/retrigger controlado). Se funcionar, conferir versão da Edge Function aumentada e código implantado.
4. Após CI aplicável e implantação do backend, integrar PR #1067 ao `main`, publicar Admin e validar o fluxo sem alterar estoque na fase de cadastro.
5. Com usuário administrador logado, abrir NF-e Dubom: busca por `7898125370060` apresenta produto existente; confirmar EAN de unidade e fator **6** como pack do fornecedor, depois salvar cadastro. Conferir status distinto Admin e Bling no item; só então, se desejar, operação de recebimento.
6. Na NF-e Sendas, buscar EAN `7896089012460` do Café Caboclo 250g, confirmar produto sem duplicar; falhas devem mostrar motivo na tela. Confirmar que notas prontas saem do filtro `Para conferir` e aparecem nos demais filtros.

## Atenção
- Não há autorização para inventar dados fiscais, incrementar estoque automaticamente nem aprovar notas reais no teste.
- Caso haja alteração simultânea do serviço antes de publicar, comparar arquivo implantado de novo contra o `main` e reconciliar antes do deploy. Não substituir código implantado mais recente por cópia anterior.
- Se a publicação falhar com Supabase CLI, ler saída `--debug` do workflow antes de qualquer nova alteração.
