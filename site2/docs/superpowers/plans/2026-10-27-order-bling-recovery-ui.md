# Recuperação operacional do Bling na ficha do pedido — Implementation Plan

**Data:** 27/10/2026
**Destino:** Supabase Dona Antônia original, `ssbesxgaijknwsjbsbcz`
**Contexto:** completar fase 8 do [plano de execução](../../planning/plano-execucao.md), sem antecipar emissão fiscal.

## Objetivo

Oferecer, na ficha de pedido pronto, a ação administrativa já implementada no gateway `admin-products-live-v1?action=order_fiscal_recover_bling_v1`. A recuperação só pode atuar após a separação física concluída, revalida suas pré-condições no gateway, reestabelece a situação operacional no Bling e consulta o estado fiscal. O handler não chama diretamente o comando humano de emissão; o efeito indireto da reconciliação fiscal do Hub ainda precisa ser homologado.

## Decisões

- Reutilizar o gateway oficial; não criar OAuth, fila, tabela ou chamada Bling paralela.
- O recurso fica desligado por padrão com `ADMIN_BLING_ORDER_RECOVERY_ENABLED=false`, variável exclusivamente server-side. Não adicionar segredo nem variável `NEXT_PUBLIC_*`.
- Mesmo habilitada, a tela pede confirmação humana. A Server Action valida UUID, estado `ready`, conclusão de separação e todos os itens separados antes de encaminhar.
- A Server Action também exige uma leitura fiscal válida que prove `issue_enabled=false`; estado ausente, erro ou emissão habilitada bloqueiam a recuperação.
- A resposta ao navegador contém apenas sucesso/fase/quantidade de etapas; não repassar resposta bruta do Bling.
- Nenhuma chamada remota, alteração de banco, deploy ou emissão fiscal nesta implementação local.

## Arquivos e passos

1. Estender `admin-rollout.ts` e `.env.example` com o gate desligado por padrão.
2. Acrescentar ao adapter de pedidos a ação existente e uma projeção pequena da resposta.
3. Criar Server Action autenticada com confirmação, guarda de estado e revalidação do detalhe.
4. Adicionar um painel conciso ao detalhe do pedido, visível somente para pedido pronto e quando o gate estiver ligado.
5. Registrar no ledger a evidência remota do contrato e os limites de validação.

## Verificação

- `pnpm typecheck`
- Biome nos arquivos TypeScript alterados
- `git diff --check`
- Não executar testes, a ação remota, escrita no Bling, NF-e, migration ou deploy.

## Bloqueio de ativação

O flag permanece `false` até validar a ação e o efeito indireto da reconciliação fiscal em ambiente isolado. O ambiente canônico não é usado para homologar recuperação de vendas.
