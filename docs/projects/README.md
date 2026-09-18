# Project Registry — SUCEDOAN12

Este diretório organiza projetos e subprojetos independentes para evitar mistura de contexto, decisões e checkpoints.

## Regra

Cada projeto deve ter sua própria pasta em `docs/projects/<project-slug>/` com, no mínimo:

- `README.md`
- `PROJECT-MASTER.md`
- `CURRENT-STATE.md`
- `ROADMAP.md`
- `DECISIONS-AND-GUARDRAILS.md`
- `TECHNICAL-INVENTORY.md`
- `HANDOFF.md`

A conversa nunca deve ser a única fonte de continuidade.

## Projetos registrados

### Customer & Marketing OS
Pasta canônica:

`docs/projects/customer-marketing-os/`

Escopo:
- Customer 360;
- identidade;
- eventos;
- consentimento;
- segmentação;
- oportunidades;
- Marketing Brain;
- Meta Foundation;
- templates WhatsApp;
- PapoAI Adapter;
- Central de Relacionamento;
- homologação CM-1.

Não confundir com Marketing Studio/publicação, Stop Motion, app mobile, financeiro/logística/fiscal, Caneca Fácil ou AmeMais.

## Regra de retomada

Ao trabalhar em um projeto registrado:

1. abrir a pasta canônica;
2. ler `HANDOFF.md`;
3. conferir `CURRENT-STATE.md`;
4. buscar o HEAD atual;
5. validar runtime antes de alterar;
6. atualizar a pasta ao terminar.

Se um documento antigo fora de `docs/projects/` divergir de um snapshot runtime mais recente ou desta estrutura canônica, revisar a divergência antes de implementar.
