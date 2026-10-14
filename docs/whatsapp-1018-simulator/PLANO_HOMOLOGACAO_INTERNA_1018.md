# Homologação interna do WhatsApp 1018 — sem afetar a operação
Data: 14/10/2026. Branch: `agent/whatsapp-1018-reversible-pilot-20261013`.

## Estado
- Simulador HTML independente: disponível como artefato do workflow `WhatsApp 1018 Pilot Release CI`. **Não é um Flow real da Meta**.
- Draft JSON de Flow: `meta-flow-intent-draft.json`, não enviado à Meta.
- Migrações, RPCs, envio, webhook e conciliação: código isolado; **não aplicar/deployar em produção**.
- Atendimento 1018 e 0975: preservar, sem alteração.
- Cestas: preservar valores ocultos; nenhum dado interno deve ser exposto nas respostas do Flow.

## Testes internos — antes de qualquer publicação
| ID | Cenário | Resultado esperado |
|---|---|---|
| S01 | Abrir simulador no Android | Chat renderiza sem rede nem credenciais |
| S02 | Selecionar Fazer pedido | Flow exibe confirmação; nenhum pedido criado |
| S03 | Selecionar Ver ofertas | Flow retorna apenas intenção; sem preço ou estoque real |
| S04 | Consultar/alterar pedido | Exige verificação de identidade no fluxo futuro; não edita pedido |
| S05 | Solicitar humano | Apenas sinaliza intenção, sem acionar o atendimento atual |
| S06 | Repetir envio do Flow | Uma resposta por sessão; replay não cria nova ação |
| S07 | Resposta com token expirado | Rejeitada |
| S08 | Resposta com telefone diferente | Rejeitada |
| S09 | Alterar geração do piloto / rollback | Respostas anteriores bloqueadas |
| S10 | Meta timeout após envio | Fica em conciliação, sem reenvio automático |
| S11 | Retorno WAMID confirmado | Finalização atômica de outbox e sessão |
| S12 | Acesso via conta 0975 | Bloqueado |
| S13 | Inspecionar mensagens e payloads | Nenhum valor oculto ou ajuste interno da cesta |
| S14 | Montar cesta com itens alterados | Pendente de homologação com cálculo real do catálogo |
| S15 | Adicionar ofertas ao pedido existente | Pendente de homologação com regras do pedido real |
| S16 | Confirmar pedido dentro do WhatsApp | Pendente de autorização e integração real |
| S17 | Janela de 24 horas fechada | Não enviar Flow de sessão; requer caminho aprovado pela Meta |
| S18 | Cliente usa WhatsApp Business e comum | Testar em aparelhos separados quando Flow real existir |

## Critérios obrigatórios para avançar ao piloto real
1. Validar JSON na API oficial da Meta, criar Flow como rascunho e revisar mensagens/template aprovados, sem enviar a clientes.
2. Verificar o consentimento e a janela de atendimento para cada mensagem real.
3. Testar em contato interno previamente autorizado e com ambiente de teste segregado.
4. Conferir totais de cesta, ofertas, estoque e ajustes ocultos contra o checkout atual.
5. Provar rollback para o motor anterior, inclusive com sessões em andamento.
6. Aprovação explícita antes de modificar tráfego ou recursos produtivos.

Não considerar testes sintéticos como prova de operação real.
