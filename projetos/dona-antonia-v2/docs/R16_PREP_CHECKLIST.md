# R16 — pré-voo do piloto controlado

Este checklist é executável somente na V2 isolada. **Bloqueado** é o resultado esperado enquanto os pré-requisitos de homologação não estiverem disponíveis. A R16 não autoriza merge, deploy, publicação, produção, Meta/Bling operacional ou alteração em sistemas legados.

## Estado atual

| Gate                     | Estado    | Evidência ou ação necessária                                                                                                   |
| ------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Código e CI              | Aprovado  | R15 técnica aprovada; PR #1394 draft e CI browser verde.                                                                       |
| URL de staging acessível | Bloqueado | Necessária URL V2 não produtiva para Lighthouse e Web Vitals reais.                                                            |
| Seed vendável fictício   | Bloqueado | Os 802 produtos permanecem inativos/estoque zero; ativar somente itens fictícios delimitados ao V2.                            |
| Operadores de teste      | Bloqueado | Definir 2–3 usuários isolados, sem usuários da operação atual.                                                                 |
| Backup/restore           | Bloqueado | Ensaiar em cópia descartável ou registrar aprovação de um procedimento controlado; não executar restore destrutivo por padrão. |
| Autorização produtiva    | Bloqueado | Não existe autorização para piloto produtivo, troca de domínio ou integração operacional.                                      |

## Execução quando os gates existirem

1. Congelar o commit aprovado e registrar hash do banco V2.
2. Criar ou confirmar a URL V2 de staging sem vínculo com domínio produtivo.
3. Ativar apenas dados fictícios delimitados e registrar contagens antes/depois.
4. Executar Lighthouse/Web Vitals, checkout, pedido, concorrência de operadores, separação e entrega.
5. Ensaiar rollback/restore e conferir que produção, `main`, legados e integrações continuam sem alterações.
6. Atualizar este checklist com evidências e só então decidir se a R16 pode avançar.

## Comando de auditoria

```sh
npm run r16:readiness
```

O comando retorna `blocked` por padrão e nunca altera banco, site, conta ou integração.
