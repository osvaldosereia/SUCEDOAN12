# HANDOFF — Admin Geral R1–R16

Leia este arquivo PRIMEIRO em toda retomada automática ou nova conversa.

Repositório: `osvaldosereia/SUCEDOAN12`
Branch oficial desta frente: `admin-geral-r1-r16-autonomous-20260919`
Estado canônico: `docs/projects/admin-geral/CURRENT-STATE.md`
Plano mestre: `docs/projects/admin-geral/ROADMAP-MASTER.md`
Log: `docs/projects/admin-geral/EXECUTION-LOG.md`
Design System: `docs/projects/admin-geral/DESIGN-SYSTEM-V2.md`

## Procedimento obrigatório por rodada
1. Confirmar HEAD da branch e verificar mudanças paralelas relevantes em main.
2. Ler CURRENT-STATE.md e a rodada corrente no ROADMAP-MASTER.md.
3. Inspecionar código real antes de editar; não presumir arquitetura antiga.
4. Implementar lote amplo, coerente, reversível e validar contratos/testes disponíveis.
5. Não abrir efeitos externos para testar.
6. Atualizar CURRENT-STATE.md e EXECUTION-LOG.md ao terminar.
7. Se a rodada concluir, marcar DONE e promover a próxima.
8. Bloqueio humano em um subitem não impede trabalho seguro independente.

## Autorização e isolamentos
O proprietário autorizou decisões técnicas autônomas até R16. Interação só é indispensável para credencial/ação humana, custo novo, produção real, efeito em clientes/dados reais ou operação destrutiva relevante.
- App Dona Antônia: fora do escopo.
- Customer & Marketing OS: preservar gates/documentação.
- Marketing Admin / Organic Social: preservar publishing OFF/kill switch até homologação própria.

## Ponto terminal
R1–R16 DONE programavelmente.
O workflow `Admin Geral contracts` run `35581711967` passou integralmente no HEAD funcional `d4ebe785c1699b7ddea9a28e8e31e5319f250574`, incluindo `R16 final fail-closed audit`.
`main` permanece divergente apenas por SEO/dados públicos de cestas (`be2b3d54`), fora do escopo desta frente e não incorporado.
Credenciais, Meta, publishing, outbound, canary, IA paga, Bling/fiscal, providers, logística/financeiro real e dados reais continuam dependendo de gates/evidência humana próprios; o DONE acima não significa homologação externa.

## Regra após conclusão
Não realizar novas alterações autônomas apenas para continuar programando. Se uma automação desta frente ainda estiver ativa, ela pode ser encerrada. Retomar código somente diante de nova demanda explícita, regressão comprovada ou etapa de homologação humana específica.

## Pós-R16 — homologação visual
Nova demanda explícita em 21/09/2026 autorizou corrigir inconsistências visuais/usabilidade vistas em telas reais.
- Visual Standard V3 criado e conectado às principais superfícies do Admin;
- Nomes dos produtos e Imagens IA usam Shell canônico;
- Atendimento usa Shell canônico preservando a lógica local;
- Balanço rápido continua mobile-first, com layout desktop responsivo e legibilidade ampliada;
- `admin-product-names-v1` v2 foi implantada no Supabase para reduzir a carga da consulta que estava excedendo 20 s;
- CI com contrato Visual Standard V3 passou;
- frontend ainda está na branch desta frente; integrar com `main` somente de forma deliberada, preservando o commit paralelo de SEO/cestas.
