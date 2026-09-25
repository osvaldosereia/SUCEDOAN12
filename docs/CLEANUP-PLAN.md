# Dona Antônia — Plano de Consolidação em 6 Rodadas

> **ATENÇÃO — revisão Operations 2.0 (2026-09-25):** PapoAI/WhatsApp continuam sendo parte necessária da operação comercial da Dona Antônia, inclusive para clientes que compram diretamente pelo WhatsApp. Qualquer classificação antiga de "PapoAI / WhatsApp" como DELETE deve ser entendida somente como remoção de implementações legadas/órfãs após substituição comprovada. Não remover a capacidade PapoAI/WhatsApp nem suas integrações úteis sem o Projeto Final aprovado.


## Baseline de 25/09/2026

- GitHub `main`: 22 arquivos antes desta documentação.
- Supabase canônico: 100 Edge Functions implantadas.
- GitHub não possui workflows em `.github/workflows`.
- Site público usa `storefront-v2`.
- Vitrine Admin usa `admin-products-live-v1` e ainda possui dependências indiretas do projeto legado.
- Há dois jobs periódicos no `pg_cron`: Bling Hub a cada 2 minutos e worker fiscal a cada 1 minuto.
- O conector atual bloqueou a alteração desses jobs; a desativação permanece pendência operacional prioritária e não será considerada concluída até ser verificada.

## Rodada 1 — congelamento, custo e arquitetura — EXECUTADA

Inventário e arquitetura registrados. O runtime automático do Bling Hub foi desativado em `bling_hub_runtime_v2.hub_enabled=false`; o worker fiscal já estava com `fiscal_ai_worker_control.enabled=false`. Os registros do `pg_cron` continuam existentes porque o conector bloqueou a alteração direta, mas os dois caminhos de processamento externo ficaram sem despacho ativo. Nenhum pedido histórico foi alterado.

## Rodada 2 — Vitrine Admin 100% canônico

Portar as ações restantes de `qxst...` para `ssbes...`, retirar proxy legado, validar produtos, estoque, validade, ofertas, gôndolas, clientes, pedidos, Bling e fiscal e provar por logs que o projeto antigo não é mais necessário.

## Rodada 3 — backend mínimo

Reduzir `admin-service-intelligence-v1`, retirar PapoAI/WhatsApp/agentes/marketing/experimentos do runtime do admin, eliminar imports antigos e manter somente funções realmente necessárias.

## Rodada 4 — limpeza física Supabase

Remover tabelas/views/RPCs/triggers/índices órfãos após prova de dependência, limpar filas e históricos técnicos sem valor operacional, corrigir advisors e pausar/desativar o projeto legado somente após zero dependências.

## Rodada 5 — modularização GitHub

Eliminar a duplicação `/index.html` x `/vitrine/index.html`, modularizar CSS/JS do admin e do site, remover código histórico e fazer GitHub refletir exatamente o que está implantado.

## Rodada 6 — segurança, testes e fechamento

Executar smoke tests completos, validar writes seguros, validar Bling/fiscal sob demanda, auditar logs, corrigir advisors restantes e produzir inventário final de arquivos, funções, tabelas, RPCs, triggers e jobs.

## Critério final

1 GitHub, 1 Supabase, zero polling desnecessário, zero ponte para `qxst...`, zero código órfão e documentação curta suficiente para evolução contínua.
