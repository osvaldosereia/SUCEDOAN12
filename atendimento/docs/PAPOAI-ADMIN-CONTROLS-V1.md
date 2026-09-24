# PapoAI — Controles mínimos no Vitrine/Admin V1

Data: 2026-09-23

## Objetivo

Colocar no Vitrine/Admin somente controles que:
1. mudam comportamento operacional/comercial real;
2. o nosso backend consegue executar de forma confiável;
3. não duplicam configurações que continuam proprietárias do PapoAI.

## Controles implementados

### 1. Vitrine contextual no WhatsApp
Controle:
- ON/OFF para geração automática do campo Link da Vitrine.

Regras não editáveis:
- intenção comercial continua sendo detectada pelo backend;
- suporte/pós-venda continua bloqueado;
- a IA nunca inventa o link;
- desligar este controle não desliga o agente PapoAI, apenas a injeção do link contextual pelo nosso backend.

Runtime:
- tabela canônica: `papoai_storefront_runtime_control_v1`;
- consumidor: `papo-external-agent-v1`.

### 2. Oferta após cesta
Controles:
- ON/OFF da análise;
- quantidade de produtos por validade/oferta;
- quantidade de produtos normais;
- máximo conjunto de 10.

Não expostos:
- similaridade mínima;
- máximo de alterações;
- filtros de vencimento;
- filtros de estoque;
- idempotência;
- travas de suporte/separação.

Esses itens são regras técnicas de segurança e não devem virar configuração cotidiana.

### 3. Saúde da ponte PapoAI
Exibir:
- último evento recebido;
- último link de vitrine confirmado;
- quantidade de eventos nas últimas 24h;
- erros de sincronização do link nas últimas 24h.

Objetivo:
- diferenciar rapidamente problema de conversa do PapoAI de problema de integração.

### 4. Configurações nativas do PapoAI
Exibir como somente leitura:
- transferência humana;
- follow-up nativo;
- modelo, raciocínio e prompt-base.

Motivo:
não existe integração administrativa comprovada para manter esses valores sincronizados.
Não criar controles falsos no Vitrine/Admin.

## O que deliberadamente NÃO será colocado no Admin

- seletor do modelo do PapoAI;
- nível de raciocínio;
- edição do prompt principal;
- editor de regex/intents;
- editor de regras técnicas de suporte;
- dezenas de toggles por intenção;
- configurações duplicadas de transferência;
- configurações duplicadas de follow-up;
- parâmetros de segurança/idempotência;
- credenciais/webhook secrets.

## Princípio

O Vitrine/Admin controla o negócio.
O Supabase decide de forma determinística.
O PapoAI continua responsável pela conversa natural e por configurações que só existem dentro da plataforma PapoAI.
