# Auditoria de automações GitHub — arquitetura PapoAI — 11/09/2026

## Arquitetura atual

- PapoAI: atendimento, IA conversacional, CRM e handoff do WhatsApp.
- Vitrine externa `/catalogo/`: seleção transacional de produtos.
- Supabase: dados, catálogo, carrinho e pedidos.

## Automação automática preservada

1. `product-image-studio-production.yml` — fotos de produtos, lote de até 9, cron atual a cada 5 minutos.
2. `update-public-data.yml` — SEO, sitemap, Merchant e dados públicos, cron horário.
3. GitHub Pages — publicação do site; gerenciado pelo próprio GitHub.
4. CIs diretamente ligados à vitrine/site atual permanecem disponíveis.
5. Workflows de projetos ainda ativos ou em evolução (marketing/Instagram, CanecaFácil/Loja Integrada e operação interna) não foram desligados sem evidência de obsolescência.

## Subsystem arquivado nesta rodada

Foram neutralizados os gatilhos automáticos do antigo atendimento próprio: Agent Core, Conversation Worker, WhatsApp Sales MVP, WhatsApp Flow (build/release/runtime/audit/replay), AI Action Registry e verificação de corte do Make.

Os arquivos permanecem no histórico do Git e os stubs atuais aceitam apenas execução manual deliberada. Nenhum deles roda em `push`, `pull_request`, `schedule`, `workflow_run` ou `repository_dispatch`.

## Regra

Não reativar o atendimento próprio do WhatsApp sem decisão explícita. A vitrine e as automações de imagem/dados públicos permanecem independentes do PapoAI.
