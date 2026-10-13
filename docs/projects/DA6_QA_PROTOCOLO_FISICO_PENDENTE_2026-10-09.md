# DA6 — Protocolo de homologação física (NÃO executado)

**Status:** pendente. Este documento descreve critérios e recolhimento de provas; não comprova um teste realizado, não aprova release e não contém dados de clientes.

## Preparação
Use somente produtos artificiais/etiquetas de teste, sem fotos de clientes, residências ou dados pessoais. Fixe antes o resultado de `node scripts/da6-release-fingerprint.mjs` e o SHA do commit da branch. Se o código de impressão/OMR ou o gateway mudar depois, refaça os ensaios correspondentes.

No computador, selecione impressora térmica de **203 dpi** e papel **100 × 150 mm vertical**, escala 100%, margens automáticas e ajuste à página desativados. Registre fabricante/modelo, driver, escala, papel, navegador e data. Fotografe a folha impressa inteira, incluindo os quatro marcadores.

## Provas de operação
1. Imprima uma etiqueta de teste completa. Verifique corte, orientação, legibilidade visual de QR/Code128, quatro marcadores, dezena e unidade 0–9 nas seis posições e ausência de data fixa.
2. Marque os seis balanços com **0, 1, 7, 10, 23 e 99** usando caneta real. Escaneie QR, depois Code128, com leitor real ou câmera. Confira identidade do produto e serial.
3. Fotografe a mesma etiqueta usando celular com orientação normal, rotações de 90° e 180°, inclinação leve/moderada, sombra parcial e iluminação mais baixa, registrando modelo do celular e qualidade do foco.
4. Crie duas fotos de exceção, uma com marcações duplas no mesmo grupo e outra sem QR legível. Ambas precisam ser recusadas ou encaminhadas à revisão, **nunca interpretadas como quantidade inventada**.
5. Envie 10 fotos por upload privado; confirme cada arquivo no painel. Repita com 50 e 100 usando somente fotografias de testes artificiais. Feche o navegador **apenas depois do upload confirmado**; reabra e confira o lote, sem fotos desaparecidas ou duplicadas.
6. Comprove fila no servidor, progresso, falhas e até três tentativas por foto; finalize revisão manual e confira nome/horário/quantidade anterior e atual no log histórico. Não execute `inventory_balance_commit`, nem sincronização Bling.
7. Repita após troca de aba de fotos para Balanço A4; controles, planilha e contagem A4 não podem ter sido alterados.

## Critérios obrigatórios
- **Zero atribuições de identidade incorreta; zero quantidades falsas aceitas.** Casos incertos vão para revisão/recaptura.
- 100% dos objetos confirmados permanecem disponíveis no Storage privado; nenhuma leitura anônima permitida.
- Fila sem duplicações sob concorrência; nenhuma foto ultrapassa três tentativas; aprovados/rejeitados com histórico auditável.
- Estoque vigente e Bling permanecem inalterados durante ensaios históricos.
- Falhas são documentadas, corrigidas e reexecutadas antes de aprovar. Um CI digital verde não substitui essas provas.

## Registro para eventual aprovação
Preencher somente após ensaio físico efetivo, em arquivo distinto `docs/projects/DA6_QA_*.md`, com SHA do código, fabricante/modelo de impressora e celular, amostras de resultados por slot e hashes das evidências mantidas em armazenamento privado. Não adicionar fotografias de clientes ao GitHub. Fixar `evidence_file` e `evidence_sha256` no manifesto de release somente após revisão humana.

## Vinculação obrigatória dos atestados à implementação

Após executar de fato cada um dos sete ensaios e obter resultado `PASS`, cada
arquivo de evidência distinto `docs/projects/DA6_QA_*.md` precisa começar
**na primeira linha** com este bloco, substituindo o gate e o fingerprint por
valores reais do ensaio daquela versão:

```md
<!-- DA6_ATTESTATION_V1
gate: physical_thermal_203dpi_print
source_fingerprint: SUBSTITUIR_PELO_SHA256_DE_64_CARACTERES
result: PASS
-->
# Evidências reais do ensaio físico
```

O valor de `source_fingerprint` deve ser obtido usando
`node scripts/da6-release-fingerprint.mjs` na **mesma versão do código**
efetivamente impressa, fotografada e homologada. O `gate` deve corresponder
exatamente ao campo de `required_production_gates` aprovado naquele
documento. O código do release recusa documento com cabeçalho ausente, gate
divergente, fingerprint antigo, campos duplicados ou resultado diferente de
`PASS`. Depois, calcular o SHA-256 do arquivo de evidência inteiro e
registrá-lo no campo `evidence_sha256` do manifesto.

**Atenção:** este exemplo não é evidência, não registra teste realizado e não
autoriza alterar `passed`, `release_status` ou `release_candidate_fingerprint`.
A validação automática dos metadados não verifica a veracidade de uma foto
nem substitui a aprovação humana e a revisão protegida antes do deploy.

**Gate pendente:** sem impressora ou fotos físicas disponibilizadas, a homologação física não é realizada e o PR #987 permanece em rascunho.
