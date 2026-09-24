# PapoAI + Vitrine — arquitetura Identity Only

Data: 2026-09-24

## Decisão

O Vitrine/Admin e Supabase NÃO devem dirigir a resposta do PapoAI.

O PapoAI continua responsável pela conversa, prompt, transferência e follow-up.

A integração própria fica restrita a funções silenciosas e determinísticas.

## Mantido

### 1. Identidade do cliente na vitrine
- detectar intenção comercial suficiente para preparar o Link da Vitrine;
- gerar link curto identificado;
- associar o telefone do contato ao acesso;
- a vitrine reconhece o cliente sem pedir o telefone novamente.

### 2. Cadastro via Flow
- receber dados estruturados do PapoAI/Flow;
- atualizar cadastro no Supabase;
- não escolher nem gerar resposta conversacional.

### 3. Reconciliação silenciosa
- vincular cadastro/identidade ao pedido quando aplicável;
- sem mensagem própria para o cliente.

### 4. Saúde da integração
- Admin mostra eventos, último link identificado e erros;
- somente observabilidade.

### 5. Pós-cesta
- permanece apenas em Shadow no Vitrine/Admin;
- pode selecionar 5 validade + 5 normais para análise;
- não envia Mensagem Operacional;
- não interpreta respostas do WhatsApp;
- não altera pedido pela conversa.

## Removido da ponte PapoAI

- envio de system_message / Mensagem Operacional;
- entrega automática de cross-sell;
- interpretação de respostas como "2 e 7";
- alteração de pedido provocada por resposta no WhatsApp;
- tentativa de controlar respostas do agente pelo Admin.

## Regra

Admin/Supabase = identidade, dados, pedidos e observabilidade.
PapoAI = conversa, IA, transferência e follow-up.

Nenhum controle do Admin deve simular configurações nativas do PapoAI.
