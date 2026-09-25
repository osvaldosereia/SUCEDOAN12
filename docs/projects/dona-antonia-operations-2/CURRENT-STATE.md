> **Atualização 2026-09-25 — Operations 2.0:** a análise arquitetural foi consolidada em `PROJECT-MASTER.md`, `SOURCE-OF-TRUTH.md` e `IMPLEMENTATION-ROADMAP.md`. Este arquivo descreve o runtime legado/atual; ele não deve ser confundido com o desenho alvo. Nenhuma migração para o novo projeto foi executada ainda.

# Dona Antônia Operations 2.0 — Current State

Última atualização: 2026-09-25.

## Estado executivo
A Fase 1 (auditoria) está avançada. Nenhuma função produtiva foi removida nesta rodada.

## Runtime canônico
- GitHub: `osvaldosereia/SUCEDOAN12`.
- Supabase: `ssbesxgaijknwsjbsbcz`.
- Site: `storefront-v2` ativo.
- Admin: `admin-products-live-v1` ativo e `admin-service-intelligence-v1` ainda muito utilizado.
- Projeto legado qx: no HTML do Admin foi encontrada apenas uma referência textual `preconnect`; nenhuma outra ocorrência no arquivo. Ainda assim, remoção física do projeto legado depende do gate completo.

## Fluxo real hoje
1. Checkout cria pedido local e reserva estoque.
2. Pedido nasce como `storefront_received` / `sync_status=local`.
3. Bling não recebe automaticamente na criação do pedido.
4. Ao iniciar separação, estoque local é consumido e o pedido é enfileirado para sincronização Bling.
5. Hub de processamento automático está globalmente desabilitado (`hub_enabled=false`), embora jobs e rotinas manuais existam.
6. Fiscal/expedição possui gates próprios e integração Bling.

## XML/compras
- Rotina diária configurada para 06:00 Cuiabá, lookback de 3 dias.
- Runtime passa por `admin-service-intelligence-v1`, importando o módulo `purchase-xml-v1` do repositório.
- CPF: nunca financeiro empresarial.
- CNPJ da empresa: elegível para contas a pagar quando parcelas passam nas validações.
- Entrada de estoque exige confirmação humana.
- Caixa->unidade é persistida por produto/fornecedor/embalagem e requer revisão quando a inferência não é segura.

## Dados observados
- 85 pedidos.
- 27 possuem `bling_order_id` histórico; 0 possuem `bling_synced_at`.
- Hub novo: 2 pedidos `matched`.
- Produtos: 1.668 `matched` no Hub.
- Clientes: 270 `matched`, 217 em revisão.

## Decisões consolidadas
- Não usar Bling Loja Virtual agora.
- Manter o site atual enquanto a arquitetura é simplificada.
- Bling será o ERP oficial.
- Cesta personalizável continuará como regra determinística Dona Antônia.
- Admin deve virar uma interface operacional fina para funcionários.
- ChatGPT deve virar a interface gerencial, mas sem inventar um conector Bling inexistente na sessão atual.

## Próximo passo técnico
Fechar a Fase 1 com a matriz de fonte de verdade por entidade e desenhar o fluxo alvo de pedido:
`site -> pedido confirmado -> registro precoce no Bling -> impressão de separação -> reserva/baixa -> conferência -> fiscal -> expedição -> entrega`.
Em seguida, desenhar o gateway mínimo que permitirá ao ChatGPT consultar/administrar o Bling com auditoria e aprovações.
