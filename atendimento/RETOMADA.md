# RETOMADA — Atendimento Dona Antônia

Atualizado em 06/09/2026.

## Decisão vigente

Este é um projeto **novo** dentro de `SUCEDOAN12/atendimento`. Não usar como base o fluxo antigo do site, Firebase nem cenários antigos do Make.

Fluxo-alvo:

PapoAI/WhatsApp → carrossel da cesta → `/atendimento` → cliente personaliza → adiciona ofertas → site calcula → botão abre WhatsApp com mensagem pronta → cliente envia → PapoAI continua → confirmação final → Make novo → Bling.

## Implementado nesta rodada

- página mobile-first independente;
- escolha de cesta por parâmetro `?cesta=`;
- edição de quantidades da cesta;
- remoção usando quantidade zero;
- ofertas por categoria;
- adicionais entram no mesmo carrinho;
- total recalculado automaticamente;
- código único de carrinho local;
- persistência local via `localStorage`;
- geração da mensagem completa para WhatsApp;
- nenhum Firebase;
- nenhum segredo/API do Bling no frontend;
- catálogo demo separado em `data/catalogo.json`.

## Próximo passo recomendado

Criar do zero a sincronização Bling → `atendimento/data/catalogo.json` (ou equivalente gerado) usando GitHub Actions e credenciais armazenadas somente em GitHub Secrets. Não consultar Bling diretamente do navegador.

Depois criar um cenário Make novo e pequeno apenas para o fechamento: CPF → localizar/criar contato → validar itens → criar pedido no Bling → devolver número do pedido.
